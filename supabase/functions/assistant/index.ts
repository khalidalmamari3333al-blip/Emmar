// Supabase Edge Function: المساعد الذكي.
// الأسرار (ANTHROPIC_API_KEY) تُضبط بـ: supabase secrets set ANTHROPIC_API_KEY=...
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

import { DAILY_LIMIT, parseRequest, runAssistant } from './core.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!url || !anonKey || !serviceKey || !apiKey) return json(503, { error: 'not_configured' });

  // المستخدم يجب أن يكون مسجّل الدخول؛ البحث يتم بصلاحياته (RLS)
  const authorization = req.headers.get('Authorization') ?? '';
  const db = createClient(url, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return json(401, { error: 'sign_in_required' });

  const body = parseRequest(await req.json().catch(() => null));
  if (!body) return json(400, { error: 'invalid_request' });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: allowed, error: quotaError } = await admin.rpc('assistant_take_quota', { p_user: userData.user.id, p_limit: DAILY_LIMIT });
  if (quotaError) return json(500, { error: 'quota_check_failed' });
  if (!allowed) return json(429, { error: 'daily_limit' });

  const client = new Anthropic({ apiKey });
  try {
    const result = await runAssistant(body, { client, db, today: new Date().toISOString().slice(0, 10) });
    return json(200, result);
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return json(503, { error: 'busy' });
    if (e instanceof Anthropic.APIError) {
      console.error('Claude API error', e.status, e.message);
      return json(502, { error: 'upstream_error' });
    }
    console.error('assistant failed', e);
    return json(500, { error: 'internal_error' });
  }
});
