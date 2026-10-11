/**
 * التحقق من الهوية. التسجيل يكون في قاعدة البيانات عبر دالة identity فقط (لا يكتب العميل الهوية).
 * الهدف: «ثقة» THEQA — غير متصل بعد حتى اعتماد الربط من وزارة النقل والاتصالات وتقنية المعلومات.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { demoIdentity } from '@/demo/identity';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

const demo = () => readConfig().useMockData;

export interface MyIdentity {
  provider: 'theqa' | 'mock_theqa' | 'manual_document';
  isMock: boolean;
  verifiedName: string;
  last4: string;
  verifiedAt: string;
  expiresAt?: string;
}
export interface IdentityProviders {
  theqa: boolean;
  mock: boolean;
}
export type IdentityError = 'not_configured' | 'not_allowed' | 'invalid_identity' | 'identity_in_use' | 'theqa_not_connected' | 'mock_disabled' | 'error';
export type IResult<T = void> = { ok: true; data: T } | { ok: false; code: IdentityError };

async function guard<T>(fn: (sb: SupabaseClient) => Promise<IResult<T>>): Promise<IResult<T>> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch {
    return { ok: false, code: 'error' };
  }
}

async function invoke<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<IResult<T>> {
  const { data, error } = await sb.functions.invoke('identity', { body });
  if (!error) return { ok: true, data: data as T };
  const ctx = (error as { context?: Response }).context;
  const payload = ctx && typeof ctx.status === 'number' ? ((await ctx.json().catch(() => ({}))) as { error?: string }) : {};
  const known: IdentityError[] = ['invalid_identity', 'identity_in_use', 'theqa_not_connected', 'mock_disabled', 'not_allowed'];
  const code = known.find((k) => k === payload.error) ?? (payload.error === 'theqa_not_implemented' ? 'theqa_not_connected' : 'error');
  return { ok: false, code };
}

export function getMyIdentity(): Promise<IResult<MyIdentity | null>> {
  if (demo()) return Promise.resolve(demoIdentity.mine());
  return guard(async (sb) => {
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) return { ok: false, code: 'not_allowed' };
    const { data, error } = await sb
      .from('identity_verifications')
      .select('provider,is_mock,verified_name,national_id_last4,verified_at,expires_at')
      .eq('user_id', uid)
      .eq('status', 'verified')
      .gt('expires_at', new Date().toISOString())
      .order('verified_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return { ok: false, code: 'error' };
    type Row = { provider: MyIdentity['provider']; is_mock: boolean; verified_name: string; national_id_last4: string; verified_at: string; expires_at: string };
    const r = data as Row | null;
    return { ok: true, data: r ? { provider: r.provider, isMock: r.is_mock, verifiedName: r.verified_name, last4: r.national_id_last4, verifiedAt: r.verified_at, expiresAt: r.expires_at } : null };
  });
}

export function identityProviders(): Promise<IResult<IdentityProviders>> {
  if (demo()) return Promise.resolve({ ok: true, data: { theqa: false, mock: true } });
  return guard((sb) => invoke<IdentityProviders>(sb, { action: 'status' }));
}

/** «ثقة»: يعيد اليوم theqa_not_connected بصدق حتى يكتمل الربط الرسمي. */
export function startTheqa(): Promise<IResult> {
  if (demo()) return Promise.resolve({ ok: false, code: 'theqa_not_connected' });
  return guard((sb) => invoke(sb, { action: 'start', provider: 'theqa' }));
}

/** ⚠️ تحقق تجريبي (لا يتحقق من أي جهة) — متاح فقط إذا فعّل الخادم IDENTITY_MODE=mock. */
export function mockVerifyIdentity(fullName: string, nationalId: string): Promise<IResult> {
  if (fullName.trim().length < 3 || !/^[0-9]{6,12}$/.test(nationalId.replace(/[^0-9]/g, ''))) return Promise.resolve({ ok: false, code: 'invalid_identity' });
  if (demo()) return Promise.resolve(demoIdentity.mockVerify(fullName, nationalId));
  return guard(async (sb) => {
    const r = await invoke<{ verified: boolean }>(sb, { action: 'mock_complete', fullName, nationalId });
    return r.ok ? { ok: true, data: undefined } : r;
  });
}
