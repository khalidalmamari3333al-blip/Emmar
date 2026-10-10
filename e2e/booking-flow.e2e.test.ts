/**
 * رحلة الحجز كاملة باستخدام كود خدمات التطبيق نفسه ضد Supabase حقيقي محلي:
 * البحث ← التفاصيل ← مخطط الأسرّة ← التسجيل ← طلب الحجز ← منع التعارض ← الإلغاء.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { supabaseBackend } from '@/lib/auth';
import { getBedAvailability, getBedLayout } from '@/services/beds';
import { cancelBooking, createBookingRequest, listMyBookings } from '@/services/bookings';
import { getPropertyById, searchProperties } from '@/services/properties';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE = process.env.E2E_SERVICE_ROLE_KEY!; // للتجهيز فقط — لا يُستخدم في التطبيق أبدًا

let mockCurrent: SupabaseClient;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockCurrent }));

const newClient = () => createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const run = Date.now().toString(36);

async function signUp(name: string) {
  mockCurrent = newClient();
  const backend = supabaseBackend()!;
  const email = `${name}-${run}@example.com`;
  expect(await backend.signUp(name, email, 'password-123')).toEqual({ ok: true, needsConfirmation: false });
  const user = (await backend.current())!;
  return { client: mockCurrent, user };
}

let propertyId: string;
let bedId: string;

beforeAll(async () => {
  // مالك حقيقي (غير تجريبي) وعقار سكن طلابي منشور
  const owner = await signUp('owner');
  await admin.from('profiles').update({ role: 'owner' }).eq('id', owner.user.id).throwOnError();
  mockCurrent = owner.client;
  const { data: p } = await mockCurrent
    .from('properties')
    .insert({
      owner_id: owner.user.id, kind: 'student', type: 'student_housing', city: 'sohar',
      district_ar: 'الهمبار', district_en: 'Al Humbar', title_ar: `سكن اختبار ${run}`, title_en: `E2E housing ${run}`,
      price_omr: 50, price_period: 'monthly', status: 'draft',
    })
    .select('id').single().throwOnError();
  propertyId = p!.id;
  // تجهيز: التوثيق نفسه مختبر في dashboards.e2e؛ هنا نعلّمه موثّقًا بمفتاح الخدمة (مسار النظام) ثم ننشر
  await admin.from('properties').update({ verification_status: 'verified', verified_at: new Date().toISOString(), verified_scope: 'documents_reviewed', status: 'published' })
    .eq('id', propertyId).throwOnError();
  const { data: b } = await mockCurrent.from('buildings').insert({ property_id: propertyId, name_ar: 'المبنى أ', name_en: 'Building A' }).select('id').single().throwOnError();
  const { data: f } = await mockCurrent.from('floors').insert({ building_id: b!.id, level: 0 }).select('id').single().throwOnError();
  const { data: r } = await mockCurrent.from('rooms').insert({ floor_id: f!.id, code: '001' }).select('id').single().throwOnError();
  const { data: beds } = await mockCurrent
    .from('beds')
    .insert([{ room_id: r!.id, code: '1', monthly_price_omr: 50, position: 1 }, { room_id: r!.id, code: '2', monthly_price_omr: 50, position: 2 }])
    .select('id,code').throwOnError();
  bedId = beds!.find((x) => x.code === '1')!.id;
});

const LIVE = { useMockData: false, supabaseUrl: URL, supabaseAnonKey: ANON };

test('anonymous visitor finds the real listing and never sees demo data', async () => {
  mockCurrent = newClient();
  const r = await searchProperties({ kind: 'student', query: run }, LIVE);
  expect(r.status === 'ok' && r.data.map((p) => p.id)).toEqual([propertyId]);
  const all = await searchProperties({}, LIVE);
  expect(all.status === 'ok' && all.data.some((p) => p.id.startsWith('00000000-0000-4000-8000-0000000000a'))).toBe(false);

  const d = await getPropertyById(propertyId, LIVE);
  expect(d.status === 'ok' && d.data?.title.en).toBe(`E2E housing ${run}`);
});

test('bed layout and availability load through nested selects and the RPC', async () => {
  mockCurrent = newClient();
  const layout = await getBedLayout(propertyId, LIVE);
  expect(layout.status).toBe('ok');
  if (layout.status !== 'ok') return;
  expect(layout.data[0].floors[0].rooms[0].beds.map((b) => b.code)).toEqual(['1', '2']);

  const a = await getBedAvailability(propertyId, '2027-01-01', '2027-05-01', LIVE);
  expect(a.status === 'ok' && a.data[bedId]).toBe(true);
});

test('booking request, double-booking refusal, privacy, and cancellation', async () => {
  const s1 = await signUp('student1');
  const r1 = await createBookingRequest(s1.user.id, { bedId, start: '2027-01-01', end: '2027-05-01' }, LIVE);
  expect(r1.status).toBe('ok');

  const mine = await listMyBookings(s1.user.id, LIVE);
  expect(mine.status).toBe('ok');
  if (mine.status !== 'ok') return;
  expect(mine.data[0]).toMatchObject({ status: 'pending', bedCode: '1', roomCode: '001', floorLevel: 0, monthlyPriceOmr: 50, propertyId });

  const s2 = await signUp('student2');
  // نفس السرير وفترة متداخلة ← رفض من قاعدة البيانات
  expect(await createBookingRequest(s2.user.id, { bedId, start: '2027-03-01', end: '2027-07-01' }, LIVE)).toEqual({ status: 'conflict' });
  // لا يستطيع الطالب الثاني رؤية طلب الأول
  const other = await listMyBookings(s1.user.id, LIVE);
  expect(other.status === 'ok' && other.data).toEqual([]);
  // ولا إلغاءه
  expect(await cancelBooking(mine.data[0].id, LIVE)).toEqual({ status: 'not_allowed' });

  const avail = await getBedAvailability(propertyId, '2027-03-01', '2027-04-01', LIVE);
  expect(avail.status === 'ok' && avail.data[bedId]).toBe(false);

  // الطالب الأول يلغي ← السرير يتحرر للثاني
  mockCurrent = s1.client;
  expect(await cancelBooking(mine.data[0].id, LIVE)).toEqual({ status: 'ok' });
  mockCurrent = s2.client;
  expect((await createBookingRequest(s2.user.id, { bedId, start: '2027-03-01', end: '2027-07-01' }, LIVE)).status).toBe('ok');
});

test('wrong password is reported as invalid credentials', async () => {
  mockCurrent = newClient();
  expect(await supabaseBackend()!.signIn(`student1-${run}@example.com`, 'wrong-password')).toEqual({ ok: false, code: 'invalid_credentials' });
});
