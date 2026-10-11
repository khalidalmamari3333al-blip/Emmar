/**
 * التسجيل برقم الجوال (OTP) + البريد، ثم التحقق من الهوية قبل الخطوات الملزمة فقط.
 * Supabase Auth محلي برمز اختبار ثابت (GOTRUE_SMS_TEST_OTP) — لا رسائل حقيقية.
 * التحقق من الهوية عبر دالة identity الحقيقية بمزود تجريبي؛ «ثقة» غير متصل ويُختبر أنه يقول ذلك.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { supabaseBackend } from '@/lib/auth';
import { createBookingRequest } from '@/services/bookings';
import { getMyIdentity, identityProviders, mockVerifyIdentity, startTheqa } from '@/services/identity';
import { searchProperties } from '@/services/properties';

import { uniqueCivilId } from './identity';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const admin = createClient(URL, process.env.E2E_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const LIVE = { useMockData: false, supabaseUrl: URL, supabaseAnonKey: ANON };
const run = `i${Date.now().toString(36)}`;

let mockCurrent: SupabaseClient;
jest.mock('@/lib/supabase', () => ({ getSupabase: () => mockCurrent }));

test('sign up with a mobile number and OTP, then add name and email — no ID card needed to browse', async () => {
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = supabaseBackend()!;
  expect(await auth.sendPhoneCode!('2412 3456')).toEqual({ ok: false, code: 'invalid_phone' });
  expect(await auth.sendPhoneCode!('9000 0001')).toEqual({ ok: true });
  expect(await auth.verifyPhoneCode!('90000001', '000000')).toMatchObject({ ok: false, code: 'invalid_code' });
  const v = await auth.verifyPhoneCode!('90000001', '246810');
  expect(v.ok).toBe(true);
  const me = (await auth.current())!;
  expect(me).toMatchObject({ phone: '+96890000001', phoneVerified: true });
  if (v.ok && v.needsProfile) expect((await auth.completeProfile!('مستخدم الجوال', `mobile-${run}@example.com`)).ok).toBe(true);

  // التصفح والبحث بلا هوية
  const s = await searchProperties({}, LIVE);
  expect(s.status).toBe('ok');
  // الهاتف المؤكد لا يتغير من الملف الشخصي
  expect(await auth.updateProfile(me.id, { phone: '+96899999999' })).toBe(true);
  expect((await auth.current())!.phone).toBe('+96890000001');
});

test('identity is required only for binding steps; THEQA is honestly reported as not connected', async () => {
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = supabaseBackend()!;
  await auth.signUp('طالب جديد', `student-${run}@example.com`, 'password-123');
  const me = (await auth.current())!;
  expect(await getMyIdentity()).toEqual({ ok: true, data: null });
  expect(await identityProviders()).toEqual({ ok: true, data: { theqa: false, mock: true } });
  expect(await startTheqa()).toEqual({ ok: false, code: 'theqa_not_connected' });

  // سكن طلابي حقيقي موثّق ومنشور بسرير واحد
  const { data: p } = await admin.from('properties').insert({
    owner_id: me.id, kind: 'student', type: 'student_housing', city: 'sohar', district_ar: 'x', district_en: 'x', title_ar: `هوية ${run}`, title_en: `Identity ${run}`,
    price_omr: 40, price_period: 'monthly', status: 'published', verification_status: 'verified', verified_at: new Date().toISOString(), verified_scope: 'documents_reviewed',
  }).select('id').single().throwOnError();
  const { data: b } = await admin.from('buildings').insert({ property_id: p!.id, name_ar: 'أ', name_en: 'A' }).select('id').single().throwOnError();
  const { data: f } = await admin.from('floors').insert({ building_id: b!.id, level: 0 }).select('id').single().throwOnError();
  const { data: r } = await admin.from('rooms').insert({ floor_id: f!.id, code: '001' }).select('id').single().throwOnError();
  const { data: bed } = await admin.from('beds').insert({ room_id: r!.id, code: '1', monthly_price_omr: 40 }).select('id').single().throwOnError();

  expect(await createBookingRequest(me.id, { bedId: bed!.id, start: '2031-01-01', end: '2031-03-01' }, LIVE)).toEqual({ status: 'identity_required' });

  // لا يستطيع العميل توثيق نفسه مباشرة
  const forged = await mockCurrent.from('identity_verifications').insert({ user_id: me.id, provider: 'theqa', verified_name: 'x', national_id_hash: 'a'.repeat(64), national_id_last4: '1234', expires_at: '2099-01-01' });
  expect(forged.error).toBeTruthy();

  const civil = uniqueCivilId();
  expect(await mockVerifyIdentity('طالب جديد', 'abc')).toEqual({ ok: false, code: 'invalid_identity' });
  expect(await mockVerifyIdentity('سالم بن خالد البلوشي', civil)).toEqual({ ok: true, data: undefined });
  const mine = await getMyIdentity();
  expect(mine.ok && mine.data).toMatchObject({ provider: 'mock_theqa', isMock: true, verifiedName: 'سالم بن خالد البلوشي', last4: civil.slice(-4) });
  expect(JSON.stringify(mine)).not.toContain(civil); // الرقم كاملًا لا يعود أبدًا
  expect((await createBookingRequest(me.id, { bedId: bed!.id, start: '2031-01-01', end: '2031-03-01' }, LIVE)).status).toBe('ok');

  // الرقم المدني نفسه لا يوثّق حسابًا آخر
  mockCurrent = createClient(URL, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await supabaseBackend()!.signUp('منتحل', `imposter-${run}@example.com`, 'password-123');
  expect(await mockVerifyIdentity('منتحل', civil)).toEqual({ ok: false, code: 'identity_in_use' });
});
