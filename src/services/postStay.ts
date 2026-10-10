/** الصيانة والبلاغات والتقييمات. كل الانتقالات والقيود تُفرض في قاعدة البيانات. */
import type { SupabaseClient } from '@supabase/supabase-js';

import { demoPostStay } from '@/demo/postStay';
import { readConfig } from '@/lib/config';
import { getSupabase } from '@/lib/supabase';
import type {
  MaintenanceCategory,
  MaintenancePriority,
  MaintenanceRequest,
  MaintenanceStatus,
  PropertyReport,
  PublicReview,
  ReportReason,
  ReportStatus,
} from '@/types/postStay';

const demo = () => readConfig().useMockData;

export type PostStayError = 'not_configured' | 'not_allowed' | 'invalid' | 'duplicate' | 'not_completed' | 'error';
export type SResult<T = void> = { ok: true; data: T } | { ok: false; code: PostStayError; message?: string };

function fail(e: { code?: string; message: string }): SResult<never> {
  if (e.code === '23505') return { ok: false, code: 'duplicate', message: e.message };
  if (/not been completed|active confirmed stay/i.test(e.message)) return { ok: false, code: 'not_completed', message: e.message };
  if (e.code === '42501' || /review_not_allowed/.test(e.message)) return { ok: false, code: 'not_allowed', message: e.message };
  if (e.code === '23514') return { ok: false, code: 'invalid', message: e.message };
  return { ok: false, code: 'error', message: e.message };
}

async function guard<T>(fn: (sb: SupabaseClient) => Promise<SResult<T>>): Promise<SResult<T>> {
  const sb = getSupabase();
  if (!sb) return { ok: false, code: 'not_configured' };
  try {
    return await fn(sb);
  } catch (e) {
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

const uid = async (sb: SupabaseClient) => (await sb.auth.getUser()).data.user?.id;
const title = (p?: { title_ar: string; title_en: string } | null) => (p ? { ar: p.title_ar, en: p.title_en } : undefined);

// ---------- الصيانة ----------

type MaintRow = {
  id: string; booking_id: string; property_id: string; tenant_id: string; landlord_id: string; category: MaintenanceCategory; priority: MaintenancePriority;
  title: string; description: string | null; status: MaintenanceStatus; landlord_note: string | null; resolved_at: string | null; created_at: string;
  properties?: { title_ar: string; title_en: string } | null;
};
const mapMaint = (r: MaintRow): MaintenanceRequest => ({
  id: r.id, bookingId: r.booking_id, propertyId: r.property_id, propertyTitle: title(r.properties), tenantId: r.tenant_id, landlordId: r.landlord_id,
  category: r.category, priority: r.priority, title: r.title, description: r.description ?? undefined, status: r.status,
  landlordNote: r.landlord_note ?? undefined, resolvedAt: r.resolved_at ?? undefined, createdAt: r.created_at,
});

export function listMaintenance(as: 'tenant' | 'landlord'): Promise<SResult<MaintenanceRequest[]>> {
  if (demo()) return Promise.resolve(demoPostStay.listMaintenance(as));
  return guard(async (sb) => {
    const me = await uid(sb);
    const { data, error } = await sb
      .from('maintenance_requests')
      .select('*,properties(title_ar,title_en)')
      .eq(as === 'tenant' ? 'tenant_id' : 'landlord_id', me ?? '')
      .order('created_at', { ascending: false });
    if (error) return fail(error);
    const rank = { urgent: 0, normal: 1, low: 2 } as const;
    const open = (s: MaintenanceStatus) => (s === 'open' || s === 'in_progress' ? 0 : 1);
    return {
      ok: true,
      data: ((data ?? []) as unknown as MaintRow[]).map(mapMaint).sort((a, b) => open(a.status) - open(b.status) || rank[a.priority] - rank[b.priority]),
    };
  });
}

export interface NewMaintenance {
  bookingId: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  title: string;
  description?: string;
}

export function openMaintenance(m: NewMaintenance): Promise<SResult<string>> {
  if (m.title.trim().length < 3) return Promise.resolve({ ok: false, code: 'invalid' });
  if (demo()) return Promise.resolve(demoPostStay.openMaintenance(m));
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('open_maintenance', { p_booking: m.bookingId, p_category: m.category, p_priority: m.priority, p_title: m.title, p_description: m.description ?? null });
    return error ? fail(error) : { ok: true, data: data as string };
  });
}

export function updateMaintenance(id: string, status: MaintenanceStatus, note?: string): Promise<SResult> {
  if (demo()) return Promise.resolve(demoPostStay.updateMaintenance(id, status, note));
  return guard(async (sb) => {
    const { error } = await sb.rpc('update_maintenance', { p_request: id, p_status: status, p_note: note ?? null });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

// ---------- البلاغات ----------

type ReportRow = { id: string; property_id: string; reason: ReportReason; details: string | null; status: ReportStatus; admin_note: string | null; created_at: string; properties?: { title_ar: string; title_en: string } | null };
const mapReport = (r: ReportRow): PropertyReport => ({
  id: r.id, propertyId: r.property_id, propertyTitle: title(r.properties), reason: r.reason, details: r.details ?? undefined, status: r.status,
  adminNote: r.admin_note ?? undefined, createdAt: r.created_at,
});

export function reportProperty(propertyId: string, reason: ReportReason, details?: string): Promise<SResult> {
  if (demo()) return Promise.resolve(demoPostStay.report(propertyId, reason, details));
  return guard(async (sb) => {
    const { error } = await sb.from('property_reports').insert({ property_id: propertyId, reason, details: details?.trim() || null });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

/** للدعم والإدارة: البلاغات (RLS تعيد بلاغاتي فقط لغيرهم). */
export function listReports(status: ReportStatus | null = 'open'): Promise<SResult<PropertyReport[]>> {
  if (demo()) return Promise.resolve(demoPostStay.listReports(status));
  return guard(async (sb) => {
    let q = sb.from('property_reports').select('*,properties(title_ar,title_en)');
    if (status) q = q.eq('status', status);
    const { data, error } = await q.order('created_at', { ascending: false }).limit(200);
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as unknown as ReportRow[]).map(mapReport) };
  });
}

export function handleReport(id: string, status: 'resolved' | 'dismissed', note?: string): Promise<SResult> {
  if (demo()) return Promise.resolve(demoPostStay.handleReport(id, status, note));
  return guard(async (sb) => {
    const { error } = await sb.rpc('handle_report', { p_report: id, p_status: status, p_note: note ?? null });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

// ---------- التقييمات ----------

export function propertyReviews(propertyId: string): Promise<SResult<PublicReview[]>> {
  if (demo()) return Promise.resolve(demoPostStay.reviews(propertyId));
  return guard(async (sb) => {
    const { data, error } = await sb.rpc('property_reviews', { p_property: propertyId });
    if (error) return fail(error);
    type Row = { id: string; rating: number; comment: string | null; reviewer: string; stay_end: string; landlord_reply: string | null; created_at: string };
    return {
      ok: true,
      data: ((data ?? []) as Row[]).map((r) => ({ id: r.id, rating: r.rating, comment: r.comment ?? undefined, reviewer: r.reviewer, stayEnd: r.stay_end, landlordReply: r.landlord_reply ?? undefined, createdAt: r.created_at })),
    };
  });
}

/** معرّفات الحجوزات التي قيّمتها بالفعل */
export function myReviewedBookings(): Promise<SResult<string[]>> {
  if (demo()) return Promise.resolve(demoPostStay.reviewedBookings());
  return guard(async (sb) => {
    const { data, error } = await sb.from('reviews').select('booking_id').eq('tenant_id', (await uid(sb)) ?? '');
    if (error) return fail(error);
    return { ok: true, data: ((data ?? []) as { booking_id: string }[]).map((r) => r.booking_id) };
  });
}

export function submitReview(bookingId: string, rating: number, comment?: string): Promise<SResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return Promise.resolve({ ok: false, code: 'invalid' });
  if (demo()) return Promise.resolve(demoPostStay.review(bookingId, rating, comment));
  return guard(async (sb) => {
    // property_id يحدده المشغّل check_review_eligibility من الحجز نفسه
    const { error } = await sb.from('reviews').insert({ booking_id: bookingId, rating, comment: comment?.trim() || null });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}

export function replyToReview(reviewId: string, reply: string): Promise<SResult> {
  if (!reply.trim()) return Promise.resolve({ ok: false, code: 'invalid' });
  if (demo()) return Promise.resolve(demoPostStay.reply(reviewId, reply));
  return guard(async (sb) => {
    const { error } = await sb.rpc('reply_review', { p_review: reviewId, p_reply: reply });
    return error ? fail(error) : { ok: true, data: undefined };
  });
}
