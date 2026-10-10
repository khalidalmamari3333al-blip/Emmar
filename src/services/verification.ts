/**
 * خدمات التوثيق. كل القرارات والفحوص تُنفذ في قاعدة البيانات (RPC) — العميل يعرض فقط.
 * المستندات في bucket خاص وتُفتح بروابط موقعة لدقيقتين.
 */
import * as Crypto from 'expo-crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { demoVerification } from '@/demo/verification';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';

import {
  DeclaredData,
  Decision,
  DOC_MIME_TYPES,
  DocType,
  ListingVerification,
  MAX_DOC_BYTES,
  QueueItem,
  RequestStatus,
  VerificationCheck,
  VerificationRequest,
  VerificationSubject,
} from '@/types/verification';

export const VERIFICATION_BUCKET = 'verification-docs';
const SIGNED_URL_SECONDS = 120;

const demo = () => readConfig().useMockData;

export type VerificationError = 'not_configured' | 'not_allowed' | 'checks_failed' | 'reason_required' | 'invalid' | 'bad_type' | 'too_large' | 'error';
export type VResult<T = void> = { ok: true; data: T } | { ok: false; code: VerificationError; message?: string };

function fail(e: { code?: string; message: string }): VResult<never> {
  if (e.code === '42501') return { ok: false, code: 'not_allowed', message: e.message };
  if (e.code === '23514' || e.code === '23505') {
    if (/mandatory checks/i.test(e.message)) return { ok: false, code: 'checks_failed', message: e.message };
    if (/reason is required/i.test(e.message)) return { ok: false, code: 'reason_required', message: e.message };
    return { ok: false, code: 'invalid', message: e.message };
  }
  return { ok: false, code: 'error', message: e.message };
}

async function guard<T>(fn: (sb: SupabaseClient) => Promise<VResult<T>>): Promise<VResult<T>> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch (e) {
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- التحويل من صفوف قاعدة البيانات ----------

export interface RequestRow {
  id: string;
  subject: VerificationSubject;
  property_id: string | null;
  submitted_by: string;
  status: RequestStatus;
  automated_status: VerificationRequest['automatedStatus'];
  official_status: VerificationRequest['officialStatus'];
  human_status: VerificationRequest['humanStatus'];
  deed_number: string | null;
  declared_owner_name: string | null;
  plot_number: string | null;
  declared_city: VerificationRequest['declaredCity'] | null;
  identity_last4: string | null;
  run_no: number;
  submitted_at: string | null;
  decided_at: string | null;
  created_at: string;
  verification_documents?: { id: string; doc_type: DocType; path: string; mime_type: string; size_bytes: number; sha256: string; uploaded_by: string; created_at: string }[];
  verification_checks?: { code: string; source: VerificationCheck['source']; result: VerificationCheck['result']; required: boolean; details: Record<string, unknown> | null; provider: string | null; is_mock: boolean; run_no: number; id: number }[];
  verification_decisions?: { decision: Decision; reason: string | null; created_at: string }[];
}

const REQUEST_SELECT = '*,verification_documents(*),verification_checks(*),verification_decisions(decision,reason,created_at)';

export function mapRequestRow(r: RequestRow): VerificationRequest {
  return {
    id: r.id,
    subject: r.subject,
    propertyId: r.property_id ?? undefined,
    submittedBy: r.submitted_by,
    status: r.status,
    automatedStatus: r.automated_status,
    officialStatus: r.official_status,
    humanStatus: r.human_status,
    deedNumber: r.deed_number ?? undefined,
    declaredOwnerName: r.declared_owner_name ?? undefined,
    plotNumber: r.plot_number ?? undefined,
    declaredCity: r.declared_city ?? undefined,
    identityLast4: r.identity_last4 ?? undefined,
    submittedAt: r.submitted_at ?? undefined,
    decidedAt: r.decided_at ?? undefined,
    createdAt: r.created_at,
    documents: (r.verification_documents ?? [])
      .map((d) => ({ id: d.id, docType: d.doc_type, path: d.path, mimeType: d.mime_type, sizeBytes: d.size_bytes, sha256: d.sha256, uploadedBy: d.uploaded_by, createdAt: d.created_at }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    // آخر تشغيل فقط؛ التشغيلات السابقة تبقى في القاعدة للتاريخ
    checks: (r.verification_checks ?? [])
      .filter((c) => c.run_no === r.run_no)
      .sort((a, b) => a.id - b.id)
      .map((c) => ({ code: c.code, source: c.source, result: c.result, required: c.required, details: c.details ?? {}, provider: c.provider ?? undefined, isMock: c.is_mock })),
    decisions: (r.verification_decisions ?? [])
      .map((d) => ({ decision: d.decision, reason: d.reason ?? undefined, createdAt: d.created_at }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };
}

// ---------- المالك ----------

/** آخر طلب للعقار (أو لحساب المؤجر). */
export function getLatestRequest(subject: VerificationSubject, propertyId?: string): Promise<VResult<VerificationRequest | null>> {
  if (demo()) return Promise.resolve(demoVerification.latest(subject, propertyId));
  return guard(async (sb) => {
    let q = sb.from('verification_requests').select(REQUEST_SELECT).eq('subject', subject);
    q = propertyId ? q.eq('property_id', propertyId) : q.eq('submitted_by', (await sb.auth.getUser()).data.user?.id ?? '');
    const { data, error } = await q.order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) return fail(error);
    return { ok: true, data: data ? mapRequestRow(data as RequestRow) : null };
  });
}

export function getRequest(id: string): Promise<VResult<VerificationRequest | null>> {
  if (demo()) return Promise.resolve(demoVerification.get(id));
  return guard(async (sb) => {
    const { data, error } = await sb.from('verification_requests').select(REQUEST_SELECT).eq('id', id).maybeSingle();
    if (error) return fail(error);
    return { ok: true, data: data ? mapRequestRow(data as RequestRow) : null };
  });
}

export function startRequest(subject: VerificationSubject, propertyId?: string): Promise<VResult<string>> {
  if (demo()) return Promise.resolve(demoVerification.start(subject, propertyId));
  return guard(async (sb) => {
    const { data, error } = await sb.from('verification_requests').insert({ subject, property_id: propertyId ?? null }).select('id').single();
    if (error) return fail(error);
    return { ok: true, data: (data as { id: string }).id };
  });
}

export function saveDeclared(id: string, d: DeclaredData): Promise<VResult> {
  if (demo()) return Promise.resolve(demoVerification.saveDeclared(id, d));
  return guard(async (sb) => {
    const { data, error } = await sb
      .from('verification_requests')
      .update({
        deed_number: d.deedNumber?.trim().toUpperCase() || null,
        declared_owner_name: d.declaredOwnerName?.trim() || null,
        plot_number: d.plotNumber?.trim() || null,
        declared_city: d.declaredCity ?? null,
      })
      .eq('id', id)
      .select('id');
    if (error) return fail(error);
    return data?.length ? { ok: true, data: undefined } : { ok: false, code: 'not_allowed' };
  });
}

/** رقم الهوية يُرسل مرة واحدة ويُخزن في القاعدة كبصمة + آخر 4 أرقام فقط. */
export function setIdentityNumber(id: string, value: string): Promise<VResult> {
  if (!/^[0-9A-Za-z]{6,20}$/.test(value.replace(/[^0-9A-Za-z]/g, ''))) return Promise.resolve({ ok: false, code: 'invalid' });
  if (demo()) return Promise.resolve(demoVerification.setIdentity(id, value));
  return guard(async (sb) => {
    const { error } = await sb.rpc('set_verification_identity', { p_request: id, p_number: value });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

export interface PickedDocument {
  uri: string;
  name?: string;
  mimeType?: string | null;
  size?: number | null;
}

export function validateDocument(d: PickedDocument): 'bad_type' | 'too_large' | null {
  if (!(DOC_MIME_TYPES as readonly string[]).includes((d.mimeType ?? '').toLowerCase())) return 'bad_type';
  if (d.size != null && d.size > MAX_DOC_BYTES) return 'too_large';
  return null;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function uploadDocument(request: VerificationRequest, docType: DocType, file: PickedDocument): Promise<VResult> {
  const invalid = validateDocument(file);
  if (invalid) return Promise.resolve({ ok: false, code: invalid });
  if (demo()) return Promise.resolve(demoVerification.addDocument(request.id, docType, file));
  return guard(async (sb) => {
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) return { ok: false, code: 'not_allowed' };
    const body = await (await fetch(file.uri)).arrayBuffer();
    if (body.byteLength > MAX_DOC_BYTES) return { ok: false, code: 'too_large' };
    const mime = file.mimeType!.toLowerCase();
    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : 'jpg';
    const path = `${uid}/${request.id}/${docType}-${Date.now()}.${ext}`;
    const hash = await sha256Hex(body);
    const up = await sb.storage.from(VERIFICATION_BUCKET).upload(path, body, { contentType: mime, upsert: false });
    if (up.error) return { ok: false, code: 'error', message: up.error.message };
    const { error } = await sb.from('verification_documents').insert({ request_id: request.id, doc_type: docType, path, mime_type: mime, size_bytes: body.byteLength, sha256: hash });
    if (error) {
      await sb.storage.from(VERIFICATION_BUCKET).remove([path]);
      return fail(error);
    }
    return { ok: true, data: undefined };
  });
}

export function removeDocument(docId: string, path: string): Promise<VResult> {
  if (demo()) return Promise.resolve(demoVerification.removeDocument(docId));
  return guard(async (sb) => {
    const { data, error } = await sb.from('verification_documents').delete().eq('id', docId).select('id');
    if (error) return fail(error);
    if (!data?.length) return { ok: false, code: 'not_allowed' };
    await sb.storage.from(VERIFICATION_BUCKET).remove([path]);
    return { ok: true, data: undefined };
  });
}

/** يرسل الطلب: الخادم يشغّل الفحوص ويعيد النتيجة الآلية. */
export function submitRequest(id: string): Promise<VResult<VerificationRequest['automatedStatus']>> {
  if (demo()) return Promise.resolve(demoVerification.submit(id));
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('submit_verification', { p_request: id });
    if (error) return fail(error);
    return { ok: true, data: data as VerificationRequest['automatedStatus'] };
  });
}

/** رابط مؤقت لفتح مستند خاص (للمالك وفريق التحقق فقط بحسب سياسات التخزين). */
export function documentUrl(path: string): Promise<VResult<string>> {
  if (demo()) return Promise.resolve(demoVerification.documentUrl(path));
  return guard(async (sb) => {
    const { data, error } = await sb.storage.from(VERIFICATION_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data) return { ok: false, code: 'not_allowed', message: error?.message };
    return { ok: true, data: data.signedUrl };
  });
}

// ---------- فريق التحقق ----------

export function verificationQueue(status: RequestStatus | null = 'submitted'): Promise<VResult<QueueItem[]>> {
  if (demo()) return Promise.resolve(demoVerification.queue(status));
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('verification_queue', { p_status: status });
    if (error) return fail(error);
    type Row = {
      id: string; subject: VerificationSubject; property_id: string | null; property_title: string | null; property_title_en: string | null; city: QueueItem['city'] | null;
      submitter_name: string | null; status: RequestStatus; automated_status: QueueItem['automatedStatus']; official_status: QueueItem['officialStatus'];
      human_status: QueueItem['humanStatus']; submitted_at: string | null; documents: number;
    };
    return {
      ok: true,
      data: ((data ?? []) as Row[]).map((r) => ({
        id: r.id, subject: r.subject, propertyId: r.property_id ?? undefined,
        propertyTitle: r.property_title ? { ar: r.property_title, en: r.property_title_en ?? r.property_title } : undefined,
        city: r.city ?? undefined, submitterName: r.submitter_name ?? undefined, status: r.status, automatedStatus: r.automated_status,
        officialStatus: r.official_status, humanStatus: r.human_status, submittedAt: r.submitted_at ?? undefined, documents: Number(r.documents),
      })),
    };
  });
}

export function decideRequest(id: string, decision: Decision, reason?: string): Promise<VResult> {
  if (decision !== 'approved' && !reason?.trim()) return Promise.resolve({ ok: false, code: 'reason_required' });
  if (demo()) return Promise.resolve(demoVerification.decide(id, decision, reason));
  return guard(async (sb) => {
    const { error } = await sb.rpc('decide_verification', { p_request: id, p_decision: decision, p_reason: reason?.trim() || null });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}


// ---------- ملف المؤجر ----------

export interface LandlordProfile {
  accountType: 'individual' | 'company';
  legalName: string;
  companyCr: string;
  verificationStatus: ListingVerification;
}

export function getLandlordProfile(): Promise<VResult<LandlordProfile | null>> {
  if (demo()) return Promise.resolve(demoVerification.landlord());
  return guard(async (sb) => {
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) return { ok: false, code: 'not_allowed' };
    const { data, error } = await sb.from('landlord_profiles').select('account_type,legal_name,company_cr,verification_status').eq('user_id', uid).maybeSingle();
    if (error) return fail(error);
    type Row = { account_type: LandlordProfile['accountType']; legal_name: string | null; company_cr: string | null; verification_status: LandlordProfile['verificationStatus'] };
    const r = data as Row | null;
    return { ok: true, data: r ? { accountType: r.account_type, legalName: r.legal_name ?? '', companyCr: r.company_cr ?? '', verificationStatus: r.verification_status } : null };
  });
}

/** يحفظ بيانات المؤجر (حالة التوثيق لا تُرسل؛ يديرها فريق التحقق). */
export function saveLandlordProfile(p: Omit<LandlordProfile, 'verificationStatus'>): Promise<VResult> {
  if (p.accountType === 'company' && !p.companyCr.trim()) return Promise.resolve({ ok: false, code: 'invalid' });
  if (demo()) return Promise.resolve(demoVerification.saveLandlord(p));
  return guard(async (sb) => {
    const uid = (await sb.auth.getUser()).data.user?.id;
    if (!uid) return { ok: false, code: 'not_allowed' };
    const row = { account_type: p.accountType, legal_name: p.legalName.trim() || null, company_cr: p.accountType === 'company' ? p.companyCr.trim() : null };
    const { data: existing } = await sb.from('landlord_profiles').select('user_id').eq('user_id', uid).maybeSingle();
    const { error } = existing
      ? await sb.from('landlord_profiles').update(row).eq('user_id', uid)
      : await sb.from('landlord_profiles').insert({ user_id: uid, ...row });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}
