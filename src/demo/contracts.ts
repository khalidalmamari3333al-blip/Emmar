/**
 * ⚠️ العقود في وضع العرض: في ذاكرة المتصفح فقط، بنفس قواعد قاعدة البيانات.
 * البصمة SHA-256 حقيقية على النص، لكن التوقيع تجريبي وليس قانونيًا.
 */
import type { CResult } from '@/services/contracts';
import { contractSha256, renderStudentContract } from '@/services/contractRender';
import type { Contract, ContractStatus, ContractSummary } from '@/types/contract';

import { scheduleFor, seedPaid } from './payments';
import { audit, DEMO_USERS, demoState, findBed, newId, notifyChange } from './store';

const me = () => demoState().currentUserId;
const isAdmin = () => demoState().users.find((u) => u.id === me())?.role === 'admin';
const denied = { ok: false as const, code: 'not_allowed' as const };
const now = () => new Date().toISOString();
const party = (c: Contract) => me() === c.landlordId || me() === c.tenantId || isAdmin();
const copy = (c: Contract): Contract => JSON.parse(JSON.stringify(c));

async function render(bookingId: string) {
  const s = demoState();
  const b = s.bookings.find((x) => x.id === bookingId)!;
  const loc = findBed(b.bedId)!;
  const p = s.properties.find((x) => x.id === loc.propertyId)!;
  const name = (id: string) => s.users.find((u) => u.id === id)?.fullName ?? '—';
  const body = renderStudentContract({
    landlordName: s.landlords.find((l) => l.userId === p.ownerId)?.legalName ?? name(p.ownerId), tenantName: name(b.userId),
    titleAr: p.title.ar, titleEn: p.title.en, city: p.city, districtAr: p.district.ar, districtEn: p.district.en,
    bedLabel: `${loc.room.code}-${loc.bed.code}`, startDate: b.start, endDate: b.end, monthlyPrice: b.monthlyPriceOmr,
    deposit: p.depositOmr, cancellation: p.cancellationPolicy ?? 'moderate', rulesAr: p.rules?.ar, rulesEn: p.rules?.en, bookingId: b.id,
  });
  return { ...body, sha256: await contractSha256(body.bodyAr, body.bodyEn), property: p };
}

async function createFor(bookingId: string, actor: string): Promise<CResult<string>> {
  const s = demoState();
  const b = s.bookings.find((x) => x.id === bookingId);
  const loc = b && findBed(b.bedId);
  const p = loc && s.properties.find((x) => x.id === loc.propertyId);
  if (!b || !p || p.ownerId !== actor) return denied;
  if (b.status !== 'confirmed') return { ok: false, code: 'not_confirmed' };
  if (s.contracts.some((c) => c.bookingId === bookingId)) return { ok: false, code: 'already_exists' };
  const r = await render(bookingId);
  const id = newId('contract');
  s.contracts.unshift({
    id, bookingId, propertyId: p.id, propertyTitle: p.title, landlordId: p.ownerId, tenantId: b.userId, status: 'pending_tenant', currentVersion: 1,
    createdAt: now(), versions: [{ versionNo: 1, bodyAr: r.bodyAr, bodyEn: r.bodyEn, sha256: r.sha256, createdAt: now() }], signatures: [],
  });
  audit('contract.created', 'contract', id, { booking: bookingId });
  return { ok: true, data: id };
}

/** عقد سالم (حجز مؤكد) بانتظار توقيعه — يُنشأ مرة واحدة لكل جلسة عرض. */
async function seed() {
  const s = demoState();
  if (s.contractsSeeded) return;
  s.contractsSeeded = true;
  const b = s.bookings.find((x) => x.userId === DEMO_USERS.tenant && x.status === 'confirmed');
  if (b) await createFor(b.id, DEMO_USERS.owner);
  // عقد مكتمل لمستأجر آخر بدفعتين مسددتين، حتى يظهر تقرير المالك بأرقام
  const other = s.bookings.find((x) => x.userId === 'demo-other' && x.status === 'confirmed' && findBed(x.bedId));
  if (other) {
    const r = await createFor(other.id, DEMO_USERS.owner);
    const c = r.ok ? s.contracts.find((x) => x.id === r.data) : undefined;
    if (c) {
      const v = c.versions[0];
      const at = new Date(Date.now() - 20 * 864e5).toISOString();
      c.signatures.push(
        { versionNo: 1, signerId: c.tenantId, role: 'tenant', provider: 'mock_sign', isMock: true, signedSha256: v.sha256, signedAt: at },
        { versionNo: 1, signerId: c.landlordId, role: 'landlord', provider: 'mock_sign', isMock: true, signedSha256: v.sha256, signedAt: at },
      );
      Object.assign(c, { status: 'completed', finalSha256: v.sha256, completedAt: at });
      scheduleFor(c);
      const dues = s.payments.filter((p) => p.contractId === c.id && (p.kind !== 'rent' || p.seq <= 2));
      dues.forEach((p) => seedPaid(p.id));
    }
  }
}

/** للوصول من شاشات الدفع قبل فتح العقود */
export const ensureDemoContracts = seed;

export const demoContracts = {
  async list(): Promise<CResult<ContractSummary[]>> {
    await seed();
    return { ok: true, data: demoState().contracts.filter(party).map(({ versions: _v, signatures: _s, ...c }) => ({ ...c })) };
  },
  async get(id: string): Promise<CResult<Contract | null>> {
    await seed();
    const c = demoState().contracts.find((x) => x.id === id);
    return { ok: true, data: c && party(c) ? copy(c) : null };
  },
  async forBooking(bookingId: string): Promise<CResult<string | null>> {
    await seed();
    const c = demoState().contracts.find((x) => x.bookingId === bookingId);
    return { ok: true, data: c && party(c) ? c.id : null };
  },
  async create(bookingId: string): Promise<CResult<string>> {
    await seed();
    const r = await createFor(bookingId, me() ?? '');
    notifyChange();
    return r;
  },
  async revise(id: string, note?: string): Promise<CResult<number>> {
    const c = demoState().contracts.find((x) => x.id === id);
    if (!c || c.landlordId !== me()) return denied;
    if (c.signatures.some((x) => x.versionNo === c.currentVersion) || c.status === 'completed' || c.status === 'cancelled') return { ok: false, code: 'error', message: 'already signed' };
    const r = await render(c.bookingId);
    if (r.sha256 === c.versions[c.versions.length - 1].sha256) return { ok: false, code: 'unchanged' };
    c.currentVersion += 1;
    c.versions.push({ versionNo: c.currentVersion, bodyAr: r.bodyAr, bodyEn: r.bodyEn, sha256: r.sha256, note: note?.trim() || undefined, createdAt: now() });
    audit('contract.revised', 'contract', id, { version: c.currentVersion });
    notifyChange();
    return { ok: true, data: c.currentVersion };
  },
  async sign(id: string, sha256: string): Promise<CResult<ContractStatus>> {
    const c = demoState().contracts.find((x) => x.id === id);
    if (!c || (me() !== c.tenantId && me() !== c.landlordId)) return denied;
    const role = me() === c.tenantId ? 'tenant' : 'landlord';
    if ((role === 'tenant' && c.status !== 'pending_tenant') || (role === 'landlord' && c.status !== 'pending_landlord')) return { ok: false, code: 'not_your_turn' };
    const v = c.versions.find((x) => x.versionNo === c.currentVersion)!;
    if (sha256 !== v.sha256) return { ok: false, code: 'fingerprint_mismatch' };
    c.signatures.push({ versionNo: v.versionNo, signerId: me()!, role, provider: 'mock_sign', isMock: true, signedSha256: sha256, signedAt: now() });
    if (role === 'tenant') c.status = 'pending_landlord';
    else {
      Object.assign(c, { status: 'completed', finalSha256: v.sha256, completedAt: now() });
      scheduleFor(c);
    }
    audit('contract.signed', 'contract', id, { role, version: v.versionNo, sha256, provider: 'mock_sign' });
    notifyChange();
    return { ok: true, data: c.status };
  },
  async cancel(id: string, reason: string): Promise<CResult> {
    const c = demoState().contracts.find((x) => x.id === id);
    if (!c || !party(c) || c.status === 'completed' || c.status === 'cancelled') return denied;
    Object.assign(c, { status: 'cancelled', cancelledReason: reason.trim() });
    audit('contract.cancelled', 'contract', id, { reason });
    notifyChange();
    return { ok: true, data: undefined };
  },
};
