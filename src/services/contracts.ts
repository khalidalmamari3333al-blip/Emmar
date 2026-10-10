/**
 * العقود والتوقيع. كل الانتقالات تتم في قاعدة البيانات (create/revise/sign/cancel_contract).
 * ⚠️ التوقيع تجريبي (mock_sign) وليس توقيعًا إلكترونيًا قانونيًا.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

import { demoContracts } from '@/demo/contracts';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import { contractSha256 } from '@/services/contractRender';
import type { Contract, ContractStatus, ContractSummary, SignerRole } from '@/types/contract';

const demo = () => readConfig().useMockData;

export type ContractError = 'not_configured' | 'not_allowed' | 'not_your_turn' | 'fingerprint_mismatch' | 'not_confirmed' | 'already_exists' | 'unchanged' | 'reason_required' | 'error';
export type CResult<T = void> = { ok: true; data: T } | { ok: false; code: ContractError; message?: string };

function fail(e: { code?: string; message: string }): CResult<never> {
  const m = e.message;
  if (e.code === '23505') return { ok: false, code: 'already_exists', message: m };
  if (/fingerprint/i.test(m)) return { ok: false, code: 'fingerprint_mismatch', message: m };
  if (/not your turn/i.test(m)) return { ok: false, code: 'not_your_turn', message: m };
  if (/must be confirmed/i.test(m)) return { ok: false, code: 'not_confirmed', message: m };
  if (/nothing changed/i.test(m)) return { ok: false, code: 'unchanged', message: m };
  if (/reason is required/i.test(m)) return { ok: false, code: 'reason_required', message: m };
  if (e.code === '42501') return { ok: false, code: 'not_allowed', message: m };
  return { ok: false, code: 'error', message: m };
}

async function guard<T>(fn: (sb: SupabaseClient) => Promise<CResult<T>>): Promise<CResult<T>> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch (e) {
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export interface ContractRow {
  id: string;
  booking_id: string;
  property_id: string;
  landlord_id: string;
  tenant_id: string;
  status: ContractStatus;
  current_version: number;
  final_sha256: string | null;
  completed_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  properties?: { title_ar: string; title_en: string } | null;
  contract_versions?: { version_no: number; body_ar: string; body_en: string; sha256: string; note: string | null; created_at: string }[];
  signatures?: { version_no: number; signer_id: string; role: SignerRole; provider: string; is_mock: boolean; signed_sha256: string; signed_at: string }[];
}

export function mapContractRow(r: ContractRow): Contract {
  return {
    id: r.id, bookingId: r.booking_id, propertyId: r.property_id, landlordId: r.landlord_id, tenantId: r.tenant_id, status: r.status,
    currentVersion: r.current_version, finalSha256: r.final_sha256 ?? undefined, completedAt: r.completed_at ?? undefined,
    cancelledReason: r.cancelled_reason ?? undefined, createdAt: r.created_at,
    propertyTitle: r.properties ? { ar: r.properties.title_ar, en: r.properties.title_en } : undefined,
    versions: (r.contract_versions ?? [])
      .map((v) => ({ versionNo: v.version_no, bodyAr: v.body_ar, bodyEn: v.body_en, sha256: v.sha256, note: v.note ?? undefined, createdAt: v.created_at }))
      .sort((a, b) => a.versionNo - b.versionNo),
    signatures: (r.signatures ?? []).map((s) => ({
      versionNo: s.version_no, signerId: s.signer_id, role: s.role, provider: s.provider, isMock: s.is_mock, signedSha256: s.signed_sha256, signedAt: s.signed_at,
    })),
  };
}

const LIST = 'id,booking_id,property_id,landlord_id,tenant_id,status,current_version,final_sha256,completed_at,cancelled_reason,created_at,properties(title_ar,title_en)';
const FULL = `${LIST},contract_versions(*),signatures(*)`;

export function listMyContracts(): Promise<CResult<ContractSummary[]>> {
  if (demo()) return demoContracts.list();
  return guard(async (sb) => {
    const { data, error } = await sb.from('contracts').select(LIST).order('created_at', { ascending: false });
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as unknown as ContractRow[]).map(mapContractRow) };
  });
}

export function getContract(id: string): Promise<CResult<Contract | null>> {
  if (demo()) return demoContracts.get(id);
  return guard(async (sb) => {
    const { data, error } = await sb.from('contracts').select(FULL).eq('id', id).maybeSingle();
    if (error) return fail(error);
    return { ok: true, data: data ? mapContractRow(data as unknown as ContractRow) : null };
  });
}

/** معرّف العقد لحجز معيّن (إن وُجد). */
export function contractForBooking(bookingId: string): Promise<CResult<string | null>> {
  if (demo()) return demoContracts.forBooking(bookingId);
  return guard(async (sb) => {
    const { data, error } = await sb.from('contracts').select('id').eq('booking_id', bookingId).maybeSingle();
    if (error) return fail(error);
    return { ok: true, data: (data as { id: string } | null)?.id ?? null };
  });
}

export function createContract(bookingId: string): Promise<CResult<string>> {
  if (demo()) return demoContracts.create(bookingId);
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('create_contract', { p_booking: bookingId });
    return error ? fail(error) : { ok: true, data: data as string };
  });
}

export function reviseContract(id: string, note?: string): Promise<CResult<number>> {
  if (demo()) return demoContracts.revise(id, note);
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('revise_contract', { p_contract: id, p_note: note ?? null });
    return error ? fail(error) : { ok: true, data: data as number };
  });
}

/**
 * يوقّع على الإصدار الحالي. يحسب التطبيق البصمة بنفسه من النص المعروض؛ إن لم تطابق بصمة الخادم
 * لا يُرسل التوقيع (حماية من نص مختلف عمّا رآه الموقّع)، والخادم يتحقق مرة أخرى.
 */
export async function signContract(contract: Contract): Promise<CResult<ContractStatus>> {
  const v = contract.versions.find((x) => x.versionNo === contract.currentVersion);
  if (!v) return { ok: false, code: 'error' };
  const local = await contractSha256(v.bodyAr, v.bodyEn);
  if (local !== v.sha256) return { ok: false, code: 'fingerprint_mismatch' };
  if (demo()) return demoContracts.sign(contract.id, local);
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('sign_contract', { p_contract: contract.id, p_sha256: local });
    return error ? fail(error) : { ok: true, data: data as ContractStatus };
  });
}

export function cancelContract(id: string, reason: string): Promise<CResult> {
  if (!reason.trim()) return Promise.resolve({ ok: false, code: 'reason_required' });
  if (demo()) return demoContracts.cancel(id, reason);
  return guard(async (sb) => {
    const { error } = await sb.rpc('cancel_contract', { p_contract: id, p_reason: reason.trim() });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

/** دور المستخدم في العقد، ومن عليه التوقيع الآن. */
export function myRole(c: ContractSummary, userId?: string): SignerRole | null {
  return userId === c.tenantId ? 'tenant' : userId === c.landlordId ? 'landlord' : null;
}
export function canSign(c: ContractSummary, userId?: string): boolean {
  const r = myRole(c, userId);
  return (r === 'tenant' && c.status === 'pending_tenant') || (r === 'landlord' && c.status === 'pending_landlord');
}
