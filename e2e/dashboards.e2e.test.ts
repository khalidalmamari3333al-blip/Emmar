/**
 * لوحة المالك والإدارة باستخدام خدمات التطبيق نفسها ضد Supabase محلي:
 * إنشاء عقار ← بناء الهيكل ← طلب طالب ← المالك يرى بيانات التواصل ويقبل ← الإدارة تميّز وترقّي.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { supabaseBackend } from '@/lib/auth';
import { getBedAvailability, getBedLayout } from '@/services/beds';
import { createBookingRequest, listMyBookings } from '@/services/bookings';
import {
  addBuilding,
  addFloor,
  addRooms,
  adminAuditLog,
  adminListUsers,
  adminSetFeatured,
  adminSetRole,
  createProperty,
  decideRequest,
  deleteRoom,
  emptyPropertyInput,
  getOwnerStats,
  listMyProperties,
  listImages,
  listOwnerRequests,
  removeImage,
  reorderImages,
  setCoverImage,
  updateBed,
  updateProperty,
} from '@/services/owner';
import { supabaseNotifications } from '@/services/notifications';
import { getPropertyById, searchProperties } from '@/services/properties';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const LIVE = { useMockData: false, supabaseUrl: URL, supabaseAnonKey: ANON };
const run = `d${Date.now().toString(36)}`;

let mockCurrent: SupabaseClient;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockCurrent }));

async function signUp(name: string, role?: 'owner' | 'admin') {
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const backend = supabaseBackend()!;
  await backend.signUp(name, `${name}-${run}@example.com`, 'password-123');
  let user = (await backend.current())!;
  if (role) {
    await admin.from('profiles').update({ role }).eq('id', user.id).throwOnError();
    user = (await backend.current())!;
  }
  return { client: mockCurrent, user, backend };
}

test('owner builds a student residence, a student books, the owner approves', async () => {
  const owner = await signUp('owner', 'owner');
  expect(owner.user.role).toBe('owner'); // الدور يُقرأ من profiles

  const input = {
    ...emptyPropertyInput(), kind: 'student' as const, type: 'student_housing' as const, city: 'sohar' as const,
    titleAr: `سكن ${run}`, titleEn: `Residence ${run}`, districtAr: 'الهمبار', districtEn: 'Al Humbar', price: '٤٥', status: 'draft' as const,
  };
  const created = await createProperty(owner.user.id, input);
  expect(created.ok).toBe(true);
  const pid = created.ok ? created.data : '';

  // المسودة لا تظهر للعامة
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false } });
  const hidden = await searchProperties({ query: run }, LIVE);
  expect(hidden.status === 'ok' && hidden.data).toEqual([]);
  mockCurrent = owner.client;

  const b = await addBuilding(pid, { ar: 'المبنى أ', en: 'Building A' });
  const f0 = await addFloor(b.ok ? b.data : '', 0);
  const fid = f0.ok ? f0.data : '';
  expect(await addRooms(fid, 0, [], 3, 2, 45)).toEqual({ ok: true, data: 3 });
  expect(await addRooms(fid, 0, ['001', '002', '003'], 1, 1, 70)).toEqual({ ok: true, data: 1 });

  const layout = await getBedLayout(pid, LIVE);
  const rooms = layout.status === 'ok' ? layout.data[0].floors[0].rooms : [];
  expect(rooms.map((r) => r.code)).toEqual(['001', '002', '003', '004']);
  expect(rooms.map((r) => r.beds.length)).toEqual([2, 2, 2, 1]);

  // سرير في الصيانة لا يظهر متاحًا
  const maintBed = rooms[2].beds[1].id;
  expect((await updateBed(maintBed, { status: 'maintenance' })).ok).toBe(true);

  expect((await updateProperty(pid, { ...input, status: 'published' })).ok).toBe(true);
  const mine = await listMyProperties(owner.user.id);
  expect(mine.ok && mine.data[0]).toMatchObject({ id: pid, status: 'published' });

  // طالب يطلب سريرًا
  const student = await signUp('student');
  expect(await student.backend.updateProfile(student.user.id, { fullName: 'سالم البلوشي', phone: '+968 9123 4567' })).toBe(true);
  const avail = await getBedAvailability(pid, '2026-11-01', '2027-03-01', LIVE);
  expect(avail.status === 'ok' && avail.data[maintBed]).toBe(false);
  const bedId = rooms[0].beds[0].id;
  expect((await createBookingRequest(student.user.id, { bedId, start: '2026-11-01', end: '2027-03-01' }, LIVE)).status).toBe('ok');

  // غرفة لها حجز لا تُحذف
  mockCurrent = owner.client;
  expect(await deleteRoom(rooms[0].id)).toMatchObject({ ok: false, code: 'in_use' });
  expect((await deleteRoom(rooms[3].id)).ok).toBe(true);

  // المالك يرى الطلب مع اسم ورقم الطالب
  const reqs = await listOwnerRequests();
  expect(reqs.ok).toBe(true);
  const r = reqs.ok ? reqs.data.find((x) => x.propertyId === pid)! : null;
  expect(r).toMatchObject({ status: 'pending', requesterName: 'سالم البلوشي', requesterPhone: '+968 9123 4567', roomCode: '001', monthlyPriceOmr: 45 });
  const stats = await getOwnerStats();
  expect(stats.ok && stats.data).toMatchObject({ properties: 1, published: 1, beds: 6, pendingRequests: 1 });

  // إشعار المالك أُنشئ تلقائيًا من قاعدة البيانات
  const ownerInbox = supabaseNotifications(owner.client)!;
  const ownerList = await ownerInbox.list();
  expect(ownerList[0]).toMatchObject({ kind: 'booking_requested', data: { requester_name: 'سالم البلوشي', room_code: '001' } });
  expect(await ownerInbox.unreadCount()).toBe(1);
  await ownerInbox.markRead([ownerList[0].id]);
  expect(await ownerInbox.unreadCount()).toBe(0);

  expect((await decideRequest(r!.id, 'confirmed')).ok).toBe(true);
  const studentInbox = supabaseNotifications(student.client)!;
  expect((await studentInbox.list()).map((x) => x.kind)).toEqual(['booking_confirmed']);
  // كل مستخدم يرى إشعاراته فقط
  expect((await studentInbox.list()).some((x) => x.kind === 'booking_requested')).toBe(false);
  mockCurrent = student.client;
  const sb = await listMyBookings(student.user.id, LIVE);
  expect(sb.status === 'ok' && sb.data[0].status).toBe('confirmed');
  // الطالب لا يستطيع استخدام صندوق طلبات المالك لرؤية الآخرين
  const peek = await listOwnerRequests();
  expect(peek.ok && peek.data).toEqual([]);
});

test('admin promotes a user and features a listing; others cannot', async () => {
  const user = await signUp('applicant');
  expect((await adminListUsers('')).ok).toBe(false); // ليس مديرًا
  expect(await adminSetRole(user.user.id, 'admin')).toMatchObject({ ok: false, code: 'not_allowed' });

  const boss = await signUp('boss', 'admin');
  const found = await adminListUsers(`applicant-${run}`);
  expect(found.ok && found.data.map((u) => u.email)).toEqual([`applicant-${run}@example.com`]);
  expect((await adminSetRole(user.user.id, 'owner')).ok).toBe(true);
  expect(await adminSetRole(boss.user.id, 'user')).toMatchObject({ ok: false, code: 'not_allowed' });

  mockCurrent = user.client;
  expect((await user.backend.current())!.role).toBe('owner');
  const p = await createProperty(user.user.id, {
    ...emptyPropertyInput(), titleAr: `فيلا ${run}`, titleEn: `Villa ${run}`, districtAr: 'العذيبة', districtEn: 'Al Azaiba',
    kind: 'sale', type: 'villa', city: 'muscat', price: '185000', status: 'published',
  });
  expect(p.ok).toBe(true);

  mockCurrent = boss.client;
  expect((await adminSetFeatured(p.ok ? p.data : '', true)).ok).toBe(true);
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false } });
  const s = await searchProperties({ query: run, kind: 'sale' }, LIVE);
  expect(s.status === 'ok' && s.data[0].featured).toBe(true);
});

test('amenities, costs, multiple images and the audit log work end to end', async () => {
  const owner = await signUp('landlord', 'owner');
  const created = await createProperty(owner.user.id, {
    ...emptyPropertyInput(), kind: 'rent', type: 'house', city: 'muscat', titleAr: `بيت ${run}`, titleEn: `House ${run}`,
    districtAr: 'الخوض', districtEn: 'Al Khoudh', price: '300', status: 'published',
    furnished: 'furnished', amenities: ['wifi', 'parking'], utilities: ['water'], landmarks: ['squ'], deposit: '300', fees: '20',
    rulesAr: 'ممنوع التدخين', rulesEn: 'No smoking', cancellationPolicy: 'strict',
  });
  expect(created.ok).toBe(true);
  const id = created.ok ? created.data : '';

  // صور: المالك يسجّل صورتين (Storage غير مشغّل هنا؛ نختبر جدول property_images وقواعده)
  const rows = await owner.client
    .from('property_images')
    .insert([
      { property_id: id, path: `${id}/a.jpg`, mime_type: 'image/jpeg', size_bytes: 1000, position: 0 },
      { property_id: id, path: `${id}/b.png`, mime_type: 'image/png', size_bytes: 2000, position: 1 },
    ])
    .select('id')
    .throwOnError();
  const [a, b] = (rows.data as { id: string }[]).map((r) => r.id);
  expect((await listImages(id)).ok).toBe(true);
  expect((await setCoverImage(id, b)).ok).toBe(true);
  expect((await reorderImages(id, [b, a])).ok).toBe(true);
  const imgs = await listImages(id);
  expect(imgs.ok && imgs.data.map((i) => [i.id, i.isCover])).toEqual([[b, true], [a, false]]);

  // زائر: البحث بالمرافق والقرب من الجامعة، وصفحة التفاصيل بالتكاليف والصور (الغلاف أولًا)
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false } });
  const s = await searchProperties({ query: run, amenities: ['wifi', 'parking'], landmark: 'squ', furnishedOnly: true }, LIVE);
  expect(s.status === 'ok' && s.data.map((p) => p.id)).toEqual([id]);
  const none = await searchProperties({ query: run, amenities: ['pool'] }, LIVE);
  expect(none.status === 'ok' && none.data).toEqual([]);
  const d = await getPropertyById(id, LIVE);
  expect(d.status === 'ok' && d.data).toMatchObject({ depositOmr: 300, feesOmr: 20, cancellationPolicy: 'strict', rules: { en: 'No smoking' }, utilities: ['water'] });
  expect(d.status === 'ok' && d.data?.images?.[0]).toMatch(/b\.png$/);

  // مالك آخر لا يستطيع حذف الصور
  const other = await signUp('intruder', 'owner');
  expect(await removeImage(id, a)).toMatchObject({ ok: false });
  mockCurrent = owner.client;
  expect((await removeImage(id, a)).ok).toBe(true);

  // سجل التدقيق: للمدير فقط
  mockCurrent = other.client;
  expect(await adminAuditLog()).toMatchObject({ ok: false, code: 'not_allowed' });
  await signUp('auditor', 'admin');
  const log = await adminAuditLog('property');
  expect(log.ok && log.data.some((e) => e.action === 'property.created' && e.entityId === id && e.actorName === 'landlord')).toBe(true);
});
