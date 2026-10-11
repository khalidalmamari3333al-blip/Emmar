/**
 * ⚠️ ما بعد السكن في وضع العرض: في ذاكرة المتصفح فقط، بنفس قيود قاعدة البيانات
 * (التقييم لإقامة مؤكدة منتهية فقط، انتقالات الصيانة، بلاغ مفتوح واحد).
 */
import type { NewMaintenance, SResult } from '@/services/postStay';
import { allowedTransitions, canReviewStay, MaintenanceRequest, MaintenanceStatus, PropertyReport, PublicReview, ReportReason, ReportStatus } from '@/types/postStay';

import { audit, demoState, findBed, newId, notifyChange } from './store';

const me = () => demoState().currentUserId;
const role = () => demoState().users.find((u) => u.id === me())?.role;
const denied = { ok: false as const, code: 'not_allowed' as const };
const now = () => new Date().toISOString();
const titleOf = (propertyId: string) => demoState().properties.find((p) => p.id === propertyId)?.title;

export const demoPostStay = {
  listMaintenance(as: 'tenant' | 'landlord'): SResult<MaintenanceRequest[]> {
    if (!me()) return denied;
    const rank = { urgent: 0, normal: 1, low: 2 } as const;
    const open = (s: MaintenanceStatus) => (s === 'open' || s === 'in_progress' ? 0 : 1);
    return {
      ok: true,
      data: demoState()
        .maintenance.filter((m) => (as === 'tenant' ? m.tenantId : m.landlordId) === me())
        .map((m) => ({ ...m, propertyTitle: titleOf(m.propertyId) }))
        .sort((a, b) => open(a.status) - open(b.status) || rank[a.priority] - rank[b.priority] || b.createdAt.localeCompare(a.createdAt)),
    };
  },
  openMaintenance(m: NewMaintenance): SResult<string> {
    const s = demoState();
    const b = s.bookings.find((x) => x.id === m.bookingId);
    if (!b || b.userId !== me()) return denied;
    const limit = new Date(Date.parse(b.end) + 14 * 864e5).toISOString().slice(0, 10);
    if (b.status !== 'confirmed' || new Date().toISOString().slice(0, 10) > limit) return { ok: false, code: 'not_completed' };
    const loc = findBed(b.bedId)!;
    const p = s.properties.find((x) => x.id === loc.propertyId)!;
    const id = newId('maint');
    s.maintenance.unshift({ id, bookingId: b.id, propertyId: p.id, tenantId: b.userId, landlordId: p.ownerId, category: m.category, priority: m.priority, title: m.title.trim(), description: m.description?.trim() || undefined, status: 'open', createdAt: now() });
    audit('maintenance.opened', 'maintenance', id, { priority: m.priority });
    notifyChange();
    return { ok: true, data: id };
  },
  updateMaintenance(id: string, status: MaintenanceStatus, note?: string): SResult {
    const m = demoState().maintenance.find((x) => x.id === id);
    if (!m || (me() !== m.tenantId && me() !== m.landlordId)) return denied;
    const allowed = [...(me() === m.landlordId ? allowedTransitions(m.status, 'landlord') : []), ...(me() === m.tenantId ? allowedTransitions(m.status, 'tenant') : [])];
    if (!allowed.includes(status)) return { ok: false, code: 'invalid' };
    audit('maintenance.status', 'maintenance', id, { from: m.status, to: status });
    m.status = status;
    if (me() === m.landlordId && note?.trim()) m.landlordNote = note.trim();
    m.resolvedAt = status === 'resolved' ? now() : status === 'open' ? undefined : m.resolvedAt;
    notifyChange();
    return { ok: true, data: undefined };
  },
  report(propertyId: string, reason: ReportReason, details?: string): SResult {
    const s = demoState();
    if (!me()) return denied;
    if (!s.properties.some((p) => p.id === propertyId && p.status === 'published')) return denied;
    if (s.reports.some((r) => r.propertyId === propertyId && r.reporterId === me() && r.status === 'open')) return { ok: false, code: 'duplicate' };
    s.reports.unshift({ id: newId('rep'), propertyId, reporterId: me()!, reason, details: details?.trim() || undefined, status: 'open', createdAt: now() });
    notifyChange();
    return { ok: true, data: undefined };
  },
  listReports(status: ReportStatus | null): SResult<PropertyReport[]> {
    const support = role() === 'admin';
    return {
      ok: true,
      data: demoState()
        .reports.filter((r) => (support || r.reporterId === me()) && (!status || r.status === status))
        .map(({ reporterId: _r, ...r }) => ({ ...r, propertyTitle: titleOf(r.propertyId) })),
    };
  },
  handleReport(id: string, status: 'resolved' | 'dismissed', note?: string): SResult {
    if (role() !== 'admin') return denied;
    const r = demoState().reports.find((x) => x.id === id);
    if (!r || r.status !== 'open') return { ok: false, code: 'invalid' };
    Object.assign(r, { status, adminNote: note?.trim() || undefined });
    audit(`report.${status}`, 'report', id, { note });
    notifyChange();
    return { ok: true, data: undefined };
  },
  reviews(propertyId: string): SResult<PublicReview[]> {
    return {
      ok: true,
      data: demoState()
        .reviews.filter((r) => r.propertyId === propertyId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(({ bookingId: _b, propertyId: _p, tenantId: _t, ...r }) => ({ ...r })),
    };
  },
  reviewedBookings(): SResult<string[]> {
    return { ok: true, data: demoState().reviews.filter((r) => r.tenantId === me()).map((r) => r.bookingId) };
  },
  review(bookingId: string, rating: number, comment?: string): SResult {
    const s = demoState();
    const b = s.bookings.find((x) => x.id === bookingId);
    if (!b || b.userId !== me()) return denied;
    if (!canReviewStay(b)) return { ok: false, code: 'not_completed' };
    if (s.reviews.some((r) => r.bookingId === bookingId)) return { ok: false, code: 'duplicate' };
    const propertyId = findBed(b.bedId)!.propertyId;
    const name = s.users.find((u) => u.id === me())?.fullName.split(' ')[0] ?? '—';
    s.reviews.unshift({ id: newId('rev'), bookingId, propertyId, tenantId: me()!, rating, comment: comment?.trim() || undefined, reviewer: name, stayEnd: b.end, createdAt: now() });
    notifyChange();
    return { ok: true, data: undefined };
  },
  reply(reviewId: string, reply: string): SResult {
    const s = demoState();
    const r = s.reviews.find((x) => x.id === reviewId);
    if (!r || r.landlordReply || s.properties.find((p) => p.id === r.propertyId)?.ownerId !== me()) return denied;
    r.landlordReply = reply.trim();
    notifyChange();
    return { ok: true, data: undefined };
  },
};
