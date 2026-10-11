/** طلبات الخصوصية: تصدير بياناتي، التصحيح، الحذف — والتنفيذ للإدارة. */
import type { SupabaseClient } from '@supabase/supabase-js';

import { demoPrivacy } from '@/demo/privacy';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

const demo = () => readConfig().useMockData;

export type PrivacyType = 'export' | 'correction' | 'deletion';
export type PrivacyStatus = 'pending' | 'completed' | 'rejected';
export interface PrivacyRequest {
  id: string;
  userId: string;
  type: PrivacyType;
  details?: string;
  status: PrivacyStatus;
  adminNote?: string;
  createdAt: string;
}

export type PrivacyError = 'not_configured' | 'not_allowed' | 'duplicate' | 'rate_limited' | 'invalid_state' | 'error';
export type VResult<T = void> = { ok: true; data: T } | { ok: false; code: PrivacyError };

/** لا نعرض رسائل الخادم الداخلية للمستخدم: رمز خطأ فقط. */
export function errorCode(e: { code?: string }): PrivacyError {
  if (e.code === '23505') return 'duplicate';
  if (e.code === 'RL001') return 'rate_limited';
  if (e.code === '42501') return 'not_allowed';
  if (e.code === '23514') return 'invalid_state';
  return 'error';
}

async function guard<T>(fn: (sb: SupabaseClient) => Promise<VResult<T>>): Promise<VResult<T>> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch {
    return { ok: false, code: 'error' };
  }
}

type Row = { id: string; user_id: string; type: PrivacyType; details: string | null; status: PrivacyStatus; admin_note: string | null; created_at: string };
const map = (r: Row): PrivacyRequest => ({ id: r.id, userId: r.user_id, type: r.type, details: r.details ?? undefined, status: r.status, adminNote: r.admin_note ?? undefined, createdAt: r.created_at });

export function exportMyData(): Promise<VResult<Record<string, unknown>>> {
  if (demo()) return Promise.resolve(demoPrivacy.export());
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('export_my_data');
    return error ? { ok: false, code: errorCode(error) } : { ok: true, data: data as Record<string, unknown> };
  });
}

export function requestPrivacy(type: PrivacyType, details?: string): Promise<VResult> {
  if (demo()) return Promise.resolve(demoPrivacy.request(type, details));
  return guard(async (sb) => {
    const { error } = await sb.from('privacy_requests').insert({ type, details: details?.trim() || null });
    return error ? { ok: false, code: errorCode(error) } : { ok: true, data: undefined };
  });
}

/** طلباتي (أو كل الطلبات للمدير — RLS تقرر). */
export function listPrivacyRequests(status: PrivacyStatus | null = null): Promise<VResult<PrivacyRequest[]>> {
  if (demo()) return Promise.resolve(demoPrivacy.list(status));
  return guard(async (sb) => {
    let q = sb.from('privacy_requests').select('*');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
    return error ? { ok: false, code: errorCode(error) } : { ok: true, data: ((data ?? []) as Row[]).map(map) };
  });
}

export function handlePrivacyRequest(id: string, status: 'completed' | 'rejected', note?: string): Promise<VResult> {
  if (demo()) return Promise.resolve(demoPrivacy.handle(id, status, note));
  return guard(async (sb) => {
    const { error } = await sb.rpc('handle_privacy_request', { p_request: id, p_status: status, p_note: note ?? null });
    return error ? { ok: false, code: errorCode(error) } : { ok: true, data: undefined };
  });
}

async function invoke<T>(sb: SupabaseClient, body: Record<string, unknown>): Promise<VResult<T>> {
  const { data, error } = await sb.functions.invoke('privacy', { body });
  if (!error) return { ok: true, data: data as T };
  const ctx = (error as { context?: Response }).context;
  const payload = ctx && typeof ctx.status === 'number' ? ((await ctx.json().catch(() => ({}))) as { error?: string }) : {};
  return { ok: false, code: payload.error === 'not_allowed' ? 'not_allowed' : payload.error === 'invalid_state' ? 'invalid_state' : 'error' };
}

/** تنفيذ طلب حذف: إخفاء الهوية + حظر الدخول + حذف الملفات (عبر دالة privacy). */
export function processDeletion(id: string): Promise<VResult<{ loginBlocked: boolean; files: { removed: number; failed: number } }>> {
  if (demo()) return Promise.resolve(demoPrivacy.processDeletion(id));
  return guard((sb) => invoke(sb, { action: 'process_deletion', requestId: id }));
}

export function runRetention(): Promise<VResult<{ queued: number; files: { removed: number; failed: number } }>> {
  if (demo()) return Promise.resolve(demoPrivacy.retention());
  return guard((sb) => invoke(sb, { action: 'run_retention' }));
}
