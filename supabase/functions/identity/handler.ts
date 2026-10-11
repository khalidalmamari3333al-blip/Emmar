// دالة identity: حالة المزودين، وبدء التحقق، وإتمام التحقق التجريبي.
// النتيجة تُسجَّل في قاعدة البيانات بمفتاح الخدمة فقط (record_identity_verification).
import { createClient } from '@supabase/supabase-js';

import { MockIdentityProvider, TheqaConfig, TheqaProvider } from './providers.ts';

export interface IdentityEnv {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  /** "mock" لتفعيل المزود التجريبي صراحةً؛ أي قيمة أخرى تعطله */
  mode?: string;
  theqa?: TheqaConfig;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

export async function handle(req: Request, env: IdentityEnv): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { url, anonKey, serviceKey } = env;
  if (!url || !anonKey || !serviceKey) return json(503, { error: 'not_configured' });

  const theqa = new TheqaProvider(env.theqa ?? {});
  const mock = new MockIdentityProvider(env.mode === 'mock');

  let body: { action?: string; provider?: string; fullName?: string; nationalId?: string };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'invalid_request' });
  }

  // متاح للجميع: ما المزودون المتاحون الآن؟ (بدون أي أسرار)
  if (body.action === 'status') return json(200, { theqa: theqa.configured(), mock: mock.configured() });

  const userDb = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser();
  if (!u.user) return json(401, { error: 'sign_in_required' });

  if (body.action === 'start') {
    if (body.provider === 'theqa') {
      // لا ربط مع «ثقة» قبل الاعتماد الرسمي؛ لا نتظاهر بعكس ذلك
      return json(503, { error: theqa.configured() ? 'theqa_not_implemented' : 'theqa_not_connected' });
    }
    if (body.provider === 'mock') return mock.configured() ? json(200, { provider: 'mock_theqa', mock: true }) : json(403, { error: 'mock_disabled' });
    return json(400, { error: 'unknown_provider' });
  }

  if (body.action === 'mock_complete') {
    if (!mock.configured()) return json(403, { error: 'mock_disabled' });
    const v = mock.verify(String(body.fullName ?? ''), String(body.nationalId ?? ''));
    if (v === 'invalid') return json(400, { error: 'invalid_identity' });
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { error } = await admin.rpc('record_identity_verification', {
      p_user: u.user.id, p_provider: mock.id, p_name: v.fullName, p_national_id: v.nationalId, p_ref: v.providerRef, p_level: v.level, p_is_mock: true,
    });
    if (error) return json(error.code === '23505' ? 409 : error.code === '23514' ? 400 : 500, { error: error.code === '23505' ? 'identity_in_use' : error.code === '23514' ? 'invalid_identity' : 'internal_error' });
    return json(200, { verified: true, provider: mock.id, mock: true });
  }

  return json(400, { error: 'unknown_action' });
}
