/**
 * معايير القبول (القسم الثالث عشر من المواصفات) — كل اختبار يحمل رقم المعيار.
 * تعمل ضد Supabase محلي حقيقي + دوال payments الحقيقية (انظر e2e/run.sh).
 * المعياران 11 و12 (اللغتان والاتجاه، وحالات الخطأ والتحميل والنجاح) في src/__tests__/acceptance.test.tsx.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { supabaseBackend } from '@/lib/auth';

import { verifyMockIdentity } from './identity';
import { createBookingRequest } from '@/services/bookings';
import { cancelContract, createContract, getContract, listMyContracts, reviseContract, signContract } from '@/services/contracts';
import {
  addBuilding,
  addFloor,
  addRooms,
  adminAuditLog,
  adminSetRole,
  createProperty,
  decideRequest as decideBooking,
  emptyPropertyInput,
  listMyProperties,
  listOwnerRequests,
  setPropertyStatus,
  updateProperty,
} from '@/services/owner';
import { listPayments, startCheckout } from '@/services/payments';
import { getBedLayout } from '@/services/beds';
import { searchProperties } from '@/services/properties';
import { decideRequest as decideVerification, getRequest, saveDeclared, sha256Hex, startRequest, submitRequest } from '@/services/verification';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const LIVE = { useMockData: false, supabaseUrl: URL, supabaseAnonKey: ANON };
const run = `acc${Date.now().toString(36)}`;

let mockCurrent: SupabaseClient;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockCurrent }));

type Session = Awaited<ReturnType<typeof signUp>>;
async function signUp(name: string, role?: 'owner' | 'admin' | 'verifier') {
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const backend = supabaseBackend()!;
  await backend.signUp(name, `${name}-${run}@example.com`, 'password-123');
  await verifyMockIdentity(mockCurrent, name);
  let user = (await backend.current())!;
  if (role) {
    await admin.from('profiles').update({ role }).eq('id', user.id).throwOnError();
    user = (await backend.current())!;
  }
  return { client: mockCurrent, user };
}
const as = (s: Session) => (mockCurrent = s.client);
const anon = () => (mockCurrent = createClient(URL, ANON, { auth: { persistSession: false } }));

const input = (title: string, over: Partial<ReturnType<typeof emptyPropertyInput>> = {}) => ({
  ...emptyPropertyInput(), kind: 'student' as const, type: 'student_housing' as const, city: 'sohar' as const,
  titleAr: `${title} ${run}`, titleEn: `${title} ${run}`, districtAr: 'الهمبار', districtEn: 'Al Humbar', price: '50', status: 'draft' as const, ...over,
});

async function openVerification(owner: Session, pid: string) {
  as(owner);
  const s = await startRequest('property', pid);
  const rid = s.ok ? s.data : '';
  await saveDeclared(rid, { deedNumber: `ACC-${run}-${pid.slice(0, 6)}`, declaredOwnerName: owner.user.fullName, declaredCity: 'sohar' });
  const sha = await sha256Hex(new TextEncoder().encode(`${run}-${pid}`).buffer as ArrayBuffer);
  await owner.client.from('verification_documents').insert({ request_id: rid, doc_type: 'title_deed', path: `${owner.user.id}/${rid}/deed.pdf`, mime_type: 'application/pdf', size_bytes: 1000, sha256: sha }).throwOnError();
  expect(await submitRequest(rid)).toEqual({ ok: true, data: 'passed' });
  return rid;
}

let landlord: Session;
let other: Session;
let officer: Session;
let boss: Session;
let tenant: Session;
let rival: Session;
let pid: string;
let requestId: string;
let bedId: string;
let bookingId: string;
let contractId: string;

beforeAll(async () => {
  landlord = await signUp('landlord', 'owner');
  other = await signUp('otherlandlord', 'owner');
  officer = await signUp('officer', 'verifier');
  boss = await signUp('boss', 'admin');
  tenant = await signUp('tenant');
  rival = await signUp('rival');
});

test('1. a landlord creates several properties and manages them from one account', async () => {
  as(landlord);
  const a = await createProperty(landlord.user.id, input('سكن أ'));
  const b = await createProperty(landlord.user.id, input('شقة ب', { kind: 'rent', type: 'apartment', bedrooms: '2' }));
  const c = await createProperty(landlord.user.id, input('أرض ج', { kind: 'sale', type: 'land', price: '30000' }));
  expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
  pid = a.ok ? a.data : '';
  const mine = await listMyProperties(landlord.user.id);
  expect(mine.ok && mine.data.filter((p) => p.title.ar.endsWith(run)).length).toBe(3);
  expect((await updateProperty(b.ok ? b.data : '', input('شقة ب معدلة', { kind: 'rent', type: 'apartment', price: '220' }))).ok).toBe(true);
  expect((await setPropertyStatus(c.ok ? c.data : '', 'archived')).ok).toBe(true);
  // مالك آخر لا يعدّل عقارات غيره
  as(other);
  expect(await updateProperty(b.ok ? b.data : '', input('اختراق', { kind: 'rent', type: 'apartment' }))).toMatchObject({ ok: false });
});

test("2. a landlord cannot see another landlord's private documents", async () => {
  requestId = await openVerification(landlord, pid);
  as(other);
  expect(await getRequest(requestId)).toEqual({ ok: true, data: null });
  const docs = await other.client.from('verification_documents').select('id,path').eq('request_id', requestId);
  expect(docs.data).toEqual([]);
  const direct = await other.client.from('verification_requests').select('id').eq('id', requestId);
  expect(direct.data).toEqual([]);
});

test('3. an unverified listing never appears in public search while verification is mandatory', async () => {
  as(landlord);
  expect(await setPropertyStatus(pid, 'published')).toMatchObject({ ok: false, code: 'needs_verification' });
  // إعلان قديم نُشر قبل نظام التوثيق (مباشرة بمفتاح الخدمة) يبقى مخفيًا عن العامة
  await admin.from('properties').insert({ owner_id: other.user.id, kind: 'rent', type: 'studio', city: 'sohar', district_ar: 'x', district_en: 'x', title_ar: `قديم ${run}`, title_en: `Legacy ${run}`, price_omr: 100, price_period: 'monthly', status: 'published' }).throwOnError();
  anon();
  const s = await searchProperties({ query: run }, LIVE);
  expect(s.status === 'ok' && s.data).toEqual([]);
});

test('4. the verification team records check results and decision reasons', async () => {
  as(officer);
  const r = await getRequest(requestId);
  expect(r.ok && r.data!.checks.map((c) => c.code)).toEqual(expect.arrayContaining(['doc_title_deed', 'name_match', 'duplicate_deed', 'official_registry']));
  expect(r.ok && r.data!.checks.find((c) => c.code === 'official_registry')!.isMock).toBe(true);
  expect(await decideVerification(requestId, 'rejected')).toMatchObject({ ok: false, code: 'reason_required' });
  expect((await decideVerification(requestId, 'approved', 'سند مطابق للبيانات')).ok).toBe(true);
  as(landlord);
  const seen = await getRequest(requestId);
  expect(seen.ok && seen.data).toMatchObject({ status: 'approved', humanStatus: 'approved', decisions: [expect.objectContaining({ decision: 'approved', reason: 'سند مطابق للبيانات' })] });
});

test('5. a tenant cannot change a verification result', async () => {
  as(tenant);
  expect(await decideVerification(requestId, 'rejected', 'محاولة')).toMatchObject({ ok: false, code: 'not_allowed' });
  const u = await tenant.client.from('properties').update({ verification_status: 'rejected' }).eq('id', pid);
  expect(u.error).toBeTruthy();
  const v = await tenant.client.from('verification_requests').update({ status: 'rejected' }).eq('id', requestId).select('id');
  expect(v.error ?? v.data).toBeTruthy();
  expect(v.data ?? []).toEqual([]);
  const chk = await tenant.client.from('verification_checks').insert({ request_id: requestId, run_no: 9, code: 'x', source: 'automated', result: 'pass', required: true });
  expect(chk.error).toBeTruthy();
  as(landlord);
  const r = await getRequest(requestId);
  expect(r.ok && r.data!.status).toBe('approved');
});

test('6. the same bed cannot be booked for two overlapping periods', async () => {
  as(landlord);
  expect((await setPropertyStatus(pid, 'published')).ok).toBe(true);
  const b = await addBuilding(pid, { ar: 'المبنى', en: 'Building' });
  const f = await addFloor(b.ok ? b.data : '', 0);
  await addRooms(f.ok ? f.data : '', 0, [], 1, 1, 50);
  const layout = await getBedLayout(pid, LIVE);
  bedId = layout.status === 'ok' ? layout.data[0].floors[0].rooms[0].beds[0].id : '';
  as(tenant);
  const first = await createBookingRequest(tenant.user.id, { bedId, start: '2027-01-01', end: '2027-05-01' }, LIVE);
  expect(first.status).toBe('ok');
  bookingId = first.status === 'ok' ? first.id : '';
  as(rival);
  expect((await createBookingRequest(rival.user.id, { bedId, start: '2027-04-01', end: '2027-08-01' }, LIVE)).status).toBe('conflict');
  expect((await createBookingRequest(rival.user.id, { bedId, start: '2027-05-01', end: '2027-08-01' }, LIVE)).status).toBe('ok'); // متتالية بلا تداخل
});

test('7. a payment is never shown as paid without a trusted provider confirmation', async () => {
  as(landlord);
  const reqs = await listOwnerRequests();
  expect((await decideBooking(reqs.ok ? reqs.data.find((x) => x.id === bookingId)!.id : '', 'confirmed')).ok).toBe(true);
  const made = await createContract(bookingId);
  contractId = made.ok ? made.data : '';
  as(tenant);
  const c1 = await getContract(contractId);
  expect(await signContract(c1.ok ? c1.data! : (null as never))).toEqual({ ok: true, data: 'pending_landlord' });
  as(landlord);
  const c2 = await getContract(contractId);
  expect(await signContract(c2.ok ? c2.data! : (null as never))).toEqual({ ok: true, data: 'completed' });

  as(tenant);
  const dues = await listPayments('tenant');
  const first = dues.ok ? dues.data.find((p) => p.contractId === contractId && p.kind === 'rent')! : null;
  const session = await startCheckout(first!.id);
  expect(session.ok).toBe(true);
  // تعديل مباشر من العميل مرفوض
  const direct = await tenant.client.from('payments').update({ status: 'paid' }).eq('id', first!.id);
  expect(direct.error).toBeTruthy();
  // حدث بتوقيع غير صالح مرفوض
  const body = JSON.stringify({ id: `evt_acc_${run}`, type: 'payment.succeeded', provider_ref: session.ok ? session.data.providerRef : '', amount_omr: 50 });
  const forged = await fetch(`${URL}/functions/v1/payments`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aqari-signature': `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}` }, body });
  expect(forged.status).toBe(401);
  const after = await listPayments('tenant');
  expect(after.ok && after.data.find((p) => p.id === first!.id)).toMatchObject({ status: 'processing' });
  expect(after.ok && after.data.find((p) => p.id === first!.id)!.receiptNo).toBeUndefined();
});

test('8. the final contract cannot be changed silently after signing', async () => {
  as(landlord);
  const done = await getContract(contractId);
  const c = done.ok ? done.data! : (null as never);
  expect(c).toMatchObject({ status: 'completed', finalSha256: c.versions[0].sha256 });
  expect(await reviseContract(contractId)).toMatchObject({ ok: false });
  expect(await cancelContract(contractId, 'تراجع')).toMatchObject({ ok: false });
  const v = await landlord.client.from('contract_versions').update({ body_ar: 'نص معدل' }).eq('contract_id', contractId);
  expect(v.error).toBeTruthy();
  const k = await landlord.client.from('contracts').update({ status: 'cancelled' }).eq('id', contractId);
  expect(k.error).toBeTruthy();
  // حتى بمفتاح الخدمة يمنع المشغّل التعديل
  const sys = await admin.from('contract_versions').update({ body_ar: 'نص معدل' }).eq('contract_id', contractId);
  expect(sys.error).toBeTruthy();
  const again = await getContract(contractId);
  expect(again.ok && again.data!.versions[0].sha256).toBe(c.finalSha256);
});

test('9. each party reaches only the contracts that belong to them', async () => {
  as(rival);
  expect(await getContract(contractId)).toEqual({ ok: true, data: null });
  const mine = await listMyContracts();
  expect(mine.ok && mine.data.some((x) => x.id === contractId)).toBe(false);
  as(tenant);
  const t = await listMyContracts();
  expect(t.ok && t.data.some((x) => x.id === contractId)).toBe(true);
  as(other);
  expect(await getContract(contractId)).toEqual({ ok: true, data: null });
});

test('10. the platform admin follows the event log and permissions', async () => {
  as(tenant);
  expect(await adminAuditLog()).toMatchObject({ ok: false, code: 'not_allowed' });
  expect(await adminSetRole(rival.user.id, 'admin')).toMatchObject({ ok: false });
  as(boss);
  expect((await adminSetRole(rival.user.id, 'owner')).ok).toBe(true);
  const log = await adminAuditLog(undefined, 500);
  const actions = log.ok ? log.data.map((e) => e.action) : [];
  expect(actions).toEqual(expect.arrayContaining(['role.changed', 'verification.approved', 'contract.signed', 'payment.charge_started', 'property.created']));
  const roleChange = log.ok ? log.data.find((e) => e.action === 'role.changed' && e.entityId === rival.user.id) : undefined;
  expect(roleChange).toMatchObject({ actorName: 'boss', details: { from: 'user', to: 'owner' } });
});
