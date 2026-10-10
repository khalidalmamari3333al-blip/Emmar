// منطق دالة payments (بدون واجهات Deno حتى يُختبر في Node أيضًا).
// ⚠️ المزود الحالي تجريبي (mock_pay): لا أموال حقيقية، ولا تُرسل أو تُخزن بيانات بطاقات.
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { SIGNATURE_HEADER, signPayload, verifySignature } from './signing.ts';

export interface PaymentsEnv {
  url?: string;
  anonKey?: string;
  serviceKey?: string;
  webhookSecret?: string;
  /** "mock" هو الوضع الوحيد المنفّذ حاليًا */
  mode?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': `authorization, x-client-info, apikey, content-type, ${SIGNATURE_HEADER}`,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PROVIDER = 'mock_pay';

function rpcError(e: { code?: string; message: string }) {
  if (e.code === '42501') return json(403, { error: 'not_allowed' });
  if (e.code === '23514') return json(409, { error: 'invalid_state', message: e.message });
  return json(500, { error: 'internal_error' });
}

/** يستقبل حدث المزود: يتحقق من التوقيع ثم يطبّقه مرة واحدة فقط. */
export async function handleWebhook(raw: string, signature: string | null, env: Required<Pick<PaymentsEnv, 'webhookSecret'>>, admin: SupabaseClient) {
  const v = await verifySignature(env.webhookSecret, signature, raw);
  if (!v.ok) return json(401, { error: 'invalid_signature', reason: v.reason });
  let evt: { id?: string; type?: string; provider_ref?: string; amount_omr?: number; data?: Record<string, unknown> };
  try {
    evt = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_json' });
  }
  if (!evt.id || !evt.type || !evt.provider_ref || typeof evt.amount_omr !== 'number') return json(400, { error: 'invalid_event' });
  const { data, error } = await admin.rpc('record_payment_event', {
    p_event_id: evt.id, p_provider: PROVIDER, p_type: evt.type, p_provider_ref: evt.provider_ref, p_amount: evt.amount_omr, p_payload: evt.data ?? {},
  });
  if (error) return rpcError(error);
  return json(200, { outcome: data });
}

/** مزود تجريبي: يبني حدثًا موقّعًا كما يفعل مزود حقيقي، ويمرره عبر نفس مسار التحقق. */
async function mockProviderEvent(type: string, providerRef: string, amount: number, env: { webhookSecret: string }, admin: SupabaseClient, data: Record<string, unknown> = {}) {
  const body = JSON.stringify({ id: `evt_${crypto.randomUUID().replace(/-/g, '')}`, type, provider_ref: providerRef, amount_omr: amount, data: { ...data, mock: true } });
  return handleWebhook(body, await signPayload(env.webhookSecret, body), env, admin);
}

export async function handle(req: Request, env: PaymentsEnv): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });
  const { url, anonKey, serviceKey, webhookSecret } = env;
  if (!url || !anonKey || !serviceKey || !webhookSecret || webhookSecret.length < 16) return json(503, { error: 'not_configured' });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const raw = await req.text();

  // أحداث المزود لا تحمل JWT؛ تُقبل فقط بتوقيع صحيح
  if (req.headers.get(SIGNATURE_HEADER)) return handleWebhook(raw, req.headers.get(SIGNATURE_HEADER), { webhookSecret }, admin);

  const userDb = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }, auth: { persistSession: false } });
  const { data: u } = await userDb.auth.getUser();
  if (!u.user) return json(401, { error: 'sign_in_required' });

  let body: { action?: string; paymentId?: string; providerRef?: string; outcome?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'invalid_request' });
  }
  const mock = (env.mode ?? 'mock') === 'mock';

  if (body.action === 'checkout' || body.action === 'refund') {
    if (!mock) return json(503, { error: 'provider_not_configured' });
    if (typeof body.paymentId !== 'string') return json(400, { error: 'invalid_request' });
    // المبلغ يُقرأ من قاعدة البيانات، لا من العميل
    const { data, error } = await admin.rpc('create_payment_transaction', { p_payment: body.paymentId, p_type: body.action === 'checkout' ? 'charge' : 'refund', p_actor: u.user.id });
    if (error) return rpcError(error);
    const tx = (data as { transaction_id: string; provider_ref: string; amount_omr: number }[])[0];
    if (body.action === 'refund') {
      // في المزود التجريبي يكتمل الاسترداد فورًا عبر حدث موقّع
      return mockProviderEvent('refund.succeeded', tx.provider_ref, Number(tx.amount_omr), { webhookSecret }, admin);
    }
    return json(200, { transactionId: tx.transaction_id, providerRef: tx.provider_ref, amountOmr: Number(tx.amount_omr), provider: PROVIDER, mock: true });
  }

  if (body.action === 'mock_complete') {
    if (!mock) return json(403, { error: 'mock_disabled' });
    if (typeof body.providerRef !== 'string' || !['succeeded', 'failed'].includes(body.outcome ?? '')) return json(400, { error: 'invalid_request' });
    const { data: tx } = await admin.from('payment_transactions').select('provider_ref,amount_omr,created_by,type').eq('provider_ref', body.providerRef).maybeSingle();
    if (!tx || tx.created_by !== u.user.id || tx.type !== 'charge') return json(403, { error: 'not_allowed' });
    return mockProviderEvent(`payment.${body.outcome}`, tx.provider_ref, Number(tx.amount_omr), { webhookSecret }, admin, body.outcome === 'failed' ? { reason: 'mock_declined' } : {});
  }

  return json(400, { error: 'unknown_action' });
}
