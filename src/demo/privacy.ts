/** ⚠️ الخصوصية في وضع العرض: في ذاكرة المتصفح فقط، بنفس قواعد قاعدة البيانات. */
import type { PrivacyRequest, PrivacyStatus, PrivacyType, VResult } from '@/services/privacy';

import { audit, demoState, newId, notifyChange } from './store';

const me = () => demoState().currentUserId;
const isAdmin = () => demoState().users.find((u) => u.id === me())?.role === 'admin';
const denied = { ok: false as const, code: 'not_allowed' as const };

export const demoPrivacy = {
  export(): VResult<Record<string, unknown>> {
    const s = demoState();
    const uid = me();
    if (!uid) return denied;
    const u = s.users.find((x) => x.id === uid)!;
    audit('privacy.export', 'privacy', uid, {});
    return {
      ok: true,
      data: {
        exported_at: new Date().toISOString(),
        demo: true,
        profile: { id: u.id, full_name: u.fullName, phone: u.phone ?? null, role: u.role },
        email: u.email,
        properties: s.properties.filter((p) => p.ownerId === uid).map((p) => ({ id: p.id, title_ar: p.title.ar, status: p.status })),
        bookings: s.bookings.filter((b) => b.userId === uid).map((b) => ({ id: b.id, start_date: b.start, end_date: b.end, status: b.status })),
        contracts: s.contracts.filter((c) => uid === c.tenantId || uid === c.landlordId).map((c) => ({ id: c.id, status: c.status, final_sha256: c.finalSha256 ?? null })),
        payments: s.payments.filter((p) => uid === p.tenantId || uid === p.landlordId).map((p) => ({ id: p.id, kind: p.kind, amount_omr: p.amountOmr, status: p.status, receipt_no: p.receiptNo ?? null })),
        maintenance: s.maintenance.filter((m) => uid === m.tenantId || uid === m.landlordId).map((m) => ({ id: m.id, title: m.title, status: m.status })),
        reviews: s.reviews.filter((r) => r.tenantId === uid).map((r) => ({ id: r.id, rating: r.rating, comment: r.comment ?? null })),
        privacy_requests: demoState().privacy.filter((r) => r.userId === uid).map((r) => ({ type: r.type, status: r.status })),
      },
    };
  },
  request(type: PrivacyType, details?: string): VResult {
    const uid = me();
    if (!uid) return denied;
    if (demoState().privacy.some((r) => r.userId === uid && r.type === type && r.status === 'pending')) return { ok: false, code: 'duplicate' };
    const today = new Date().toISOString().slice(0, 10);
    if (demoState().privacy.filter((r) => r.userId === uid && r.createdAt.slice(0, 10) === today).length >= 3) return { ok: false, code: 'rate_limited' };
    demoState().privacy.unshift({ id: newId('priv'), userId: uid, type, details: details?.trim() || undefined, status: 'pending', createdAt: new Date().toISOString() });
    notifyChange();
    return { ok: true, data: undefined };
  },
  list(status: PrivacyStatus | null): VResult<PrivacyRequest[]> {
    return { ok: true, data: demoState().privacy.filter((r) => (isAdmin() || r.userId === me()) && (!status || r.status === status)).map((r) => ({ ...r })) };
  },
  handle(id: string, status: 'completed' | 'rejected', note?: string): VResult {
    if (!isAdmin()) return denied;
    const r = demoState().privacy.find((x) => x.id === id);
    if (!r || r.status !== 'pending' || r.type === 'deletion') return { ok: false, code: 'invalid_state' };
    Object.assign(r, { status, adminNote: note?.trim() || undefined });
    audit(`privacy.${status}`, 'privacy', id, {});
    notifyChange();
    return { ok: true, data: undefined };
  },
  processDeletion(id: string): VResult<{ loginBlocked: boolean; files: { removed: number; failed: number } }> {
    if (!isAdmin()) return denied;
    const r = demoState().privacy.find((x) => x.id === id);
    if (!r || r.status !== 'pending' || r.type !== 'deletion' || r.userId === me()) return { ok: false, code: 'invalid_state' };
    const u = demoState().users.find((x) => x.id === r.userId);
    if (u) Object.assign(u, { fullName: 'مستخدم محذوف', phone: undefined });
    demoState().notifications = demoState().notifications.filter((n) => n.userId !== r.userId);
    Object.assign(r, { status: 'completed', adminNote: 'Account anonymised; signed contracts and payment records retained as legal records.' });
    audit('privacy.deletion', 'privacy', id, { user: r.userId });
    notifyChange();
    return { ok: true, data: { loginBlocked: true, files: { removed: 0, failed: 0 } } };
  },
  retention(): VResult<{ queued: number; files: { removed: number; failed: number } }> {
    if (!isAdmin()) return denied;
    audit('privacy.retention_run', 'privacy', 'documents', { queued: 0 });
    return { ok: true, data: { queued: 0, files: { removed: 0, failed: 0 } } };
  },
};
