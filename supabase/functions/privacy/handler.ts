// دالة privacy (للإدارة فقط): تنفيذ طلب الحذف (حظر تسجيل الدخول)، وتشغيل سياسة الاحتفاظ،
// وتفريغ طابور حذف الملفات من التخزين. الصلاحية تتحقق منها قاعدة البيانات (is_admin) بصلاحيات المستخدم.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface PrivacyEnv {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

// أخطاء آمنة: لا نعيد رسائل قاعدة البيانات الداخلية
function dbError(e: { code?: string }) {
  if (e.code === '42501') return json(403, { error: 'not_allowed' });
  if (e.code === '23514') return json(409, { error: 'invalid_state' });
  return json(500, { error: 'internal_error' });
}

/** يحذف الملفات المعلّقة في الطابور. يعيد عدد المحذوف والفاشل (يبقى الفاشل لمحاولة لاحقة). */
export async function drainStorageQueue(admin: SupabaseClient, limit = 500) {
  const { data, error } = await admin.from('storage_deletion_queue').select('id,bucket,path').is('done_at', null).order('id').limit(limit);
  if (error) throw new Error('queue_read_failed');
  const rows = (data ?? []) as { id: number; bucket: string; path: string }[];
  let removed = 0;
  let failed = 0;
  for (const bucket of [...new Set(rows.map((r) => r.bucket))]) {
    const batch = rows.filter((r) => r.bucket === bucket);
    const { error: rmError } = await admin.storage.from(bucket).remove(batch.map((r) => r.path));
    if (rmError) {
      failed += batch.length;
      continue;
    }
    await admin.from('storage_deletion_queue').update({ done_at: new Date().toISOString() }).in('id', batch.map((r) => r.id));
    removed += batch.length;
  }
  return { removed, failed };
}

export async function handle(req: Request, env: PrivacyEnv): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { url, anonKey, serviceKey } = env;
  if (!url || !anonKey || !serviceKey) return json(503, { error: 'not_configured' });

  const userDb = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser();
  if (!u.user) return json(401, { error: 'sign_in_required' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  let body: { action?: string; requestId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  try {
    if (body.action === 'process_deletion') {
      if (typeof body.requestId !== 'string') return json(400, { error: 'invalid_request' });
      // is_admin يُفحص داخل الدالة بصلاحيات المستخدم نفسه
      const { data: target, error } = await userDb.rpc('process_deletion_request', { p_request: body.requestId });
      if (error) return dbError(error);
      // حظر تسجيل الدخول نهائيًا (الحساب يبقى مرتبطًا بسجلات قانونية لا تُحذف)
      const ban = await admin.auth.admin.updateUserById(target as string, { ban_duration: '876000h' });
      const files = await drainStorageQueue(admin);
      return json(200, { completed: true, loginBlocked: !ban.error, files });
    }
    if (body.action === 'run_retention') {
      const { data: queued, error } = await userDb.rpc('purge_expired_documents');
      if (error) return dbError(error);
      return json(200, { queued, files: await drainStorageQueue(admin) });
    }
  } catch (e) {
    console.error('privacy failed', e);
    return json(500, { error: 'internal_error' });
  }
  return json(400, { error: 'unknown_action' });
}
