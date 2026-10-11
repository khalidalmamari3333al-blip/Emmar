/**
 * الخصوصية عبر قاعدة البيانات ودالة privacy الحقيقية: تصدير بياناتي، طلب حذف ينفذه المدير
 * (إخفاء الهوية + حظر الدخول فعليًا عبر Auth Admin API)، وتشغيل سياسة الاحتفاظ، وحدود المعدّل.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { supabaseBackend } from '@/lib/auth';
import { exportMyData, listPrivacyRequests, processDeletion, requestPrivacy, runRetention } from '@/services/privacy';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const run = `p${Date.now().toString(36)}`;

let mockCurrent: SupabaseClient;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockCurrent }));

async function signUp(name: string, role?: 'admin') {
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const backend = supabaseBackend()!;
  await backend.signUp(name, `${name}-${run}@example.com`, 'password-123');
  const user = (await backend.current())!;
  if (role) await admin.from('profiles').update({ role }).eq('id', user.id).throwOnError();
  return { client: mockCurrent, user, backend };
}

test('a user exports only their own data, asks for deletion, and the admin carries it out', async () => {
  const user = await signUp('leaving');
  await user.backend.updateProfile(user.user.id, { fullName: 'مستخدم سيغادر', phone: '+968 9000 0000' });
  const exported = await exportMyData();
  expect(exported.ok && exported.data).toMatchObject({ email: `leaving-${run}@example.com`, profile: { full_name: 'مستخدم سيغادر', phone: '+968 9000 0000' } });
  expect(JSON.stringify(exported)).not.toMatch(/identity_hash|password/);

  expect((await requestPrivacy('deletion')).ok).toBe(true);
  expect(await requestPrivacy('deletion')).toMatchObject({ ok: false, code: 'duplicate' });
  expect((await requestPrivacy('export')).ok).toBe(true);
  expect((await requestPrivacy('correction', 'اسمي خطأ')).ok).toBe(true);
  // حد 3 طلبات يوميًا يُفرض في القاعدة
  await admin.from('privacy_requests').update({ status: 'completed' }).eq('user_id', user.user.id).eq('type', 'export').throwOnError();
  expect(await requestPrivacy('export')).toMatchObject({ ok: false, code: 'rate_limited' });

  // مستخدم عادي لا يستطيع تنفيذ الحذف
  const mine = await listPrivacyRequests(null);
  const del = mine.ok ? mine.data.find((r) => r.type === 'deletion')! : null;
  expect(await processDeletion(del!.id)).toMatchObject({ ok: false, code: 'not_allowed' });

  const boss = await signUp('dpo', 'admin');
  mockCurrent = boss.client;
  const done = await processDeletion(del!.id);
  expect(done).toMatchObject({ ok: true, data: { loginBlocked: true } });
  const { data: prof } = await admin.from('profiles').select('full_name,phone').eq('id', user.user.id).single();
  expect(prof).toEqual({ full_name: 'مستخدم محذوف', phone: null });
  // الحساب محظور فعليًا من تسجيل الدخول
  const again = createClient(URL, ANON, { auth: { persistSession: false } });
  const login = await again.auth.signInWithPassword({ email: `leaving-${run}@example.com`, password: 'password-123' });
  expect(login.error).toBeTruthy();

  const retention = await runRetention();
  expect(retention.ok).toBe(true);
});
