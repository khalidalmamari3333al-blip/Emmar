-- اختبارات قاعدة البيانات: منع الحجز المزدوج + سياسات RLS.
-- كل اختبار يفشل بـ exception إن لم يتحقق الشرط.
\set ON_ERROR_STOP on
\i supabase/seed/demo.sql

-- مستخدمون: طالبان، ومالك آخر
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 's1@example.com'),
  ('00000000-0000-4000-8000-0000000000e2', 's2@example.com'),
  ('00000000-0000-4000-8000-0000000000e3', 'owner2@example.com');
update public.profiles set role = 'owner' where id = '00000000-0000-4000-8000-0000000000e3';

-- مسودة غير منشورة للمالك التجريبي
insert into public.properties (id, owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period, status)
values ('00000000-0000-4000-8000-0000000000a9', '00000000-0000-4000-8000-00000000d001', 'rent', 'studio', 'muscat', 'الخوير', 'Al Khuwair', 'مسودة', 'Draft', 100, 'monthly', 'draft');

create temp table t_ids as
  select bd.id as bed1, (select id from public.beds where id <> bd.id order by id limit 1) as bed2
  from public.beds bd order by bd.id limit 1;
grant select on t_ids to authenticated, anon;

create function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid, ''), false);
  execute format('set role %I', case when uid is null then 'anon' else 'authenticated' end);
end $$;

create function pg_temp.expect_error(sql text, expected_state text, label text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL: % — expected error %', label, expected_state;
exception when others then
  if sqlstate <> expected_state and expected_state <> '*' then
    raise exception 'FAIL: % — got % (%), expected %', label, sqlstate, sqlerrm, expected_state;
  end if;
  raise notice 'PASS: %', label;
end $$;

create function pg_temp.check(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end $$;

-- ===== 1. الزائر يرى المنشور فقط =====
select pg_temp.as_user(null);
select pg_temp.check((select count(*) from public.properties) = 3, 'anon sees only published properties');
select pg_temp.check((select count(*) from public.beds) = 8, 'anon can read beds of published student housing');
select pg_temp.check((select count(*) from public.bed_availability('00000000-0000-4000-8000-0000000000a2', '2027-01-01', '2027-02-01') where is_available) = 8, 'all beds initially available');
select pg_temp.expect_error($$insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e1', bed1, '2027-01-01', '2027-02-01' from t_ids$$, '42501', 'anon cannot book');
reset role;

-- ===== 2. حجز ومنع التعارض =====
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e1', bed1, '2027-01-01', '2027-03-01' from t_ids;
select pg_temp.check(true, 'student 1 books bed1 Jan–Feb');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select pg_temp.expect_error($$insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e2', bed1, '2027-02-15', '2027-04-01' from t_ids$$, '23P01', 'overlapping booking on same bed is rejected');
select pg_temp.expect_error($$insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e2', bed1, '2027-01-01', '2027-03-01' from t_ids$$, '23P01', 'identical period on same bed is rejected');
insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e2', bed1, '2027-03-01', '2027-04-01' from t_ids;
select pg_temp.check(true, 'back-to-back booking (end date exclusive) is allowed');
insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e2', bed2, '2027-01-01', '2027-03-01' from t_ids;
select pg_temp.check(true, 'same period on a different bed is allowed');
select pg_temp.expect_error($$insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e1', bed2, '2027-05-01', '2027-06-01' from t_ids$$, '42501', 'cannot book on behalf of another user');
select pg_temp.expect_error($$insert into public.bookings (user_id, bed_id, start_date, end_date, status) select '00000000-0000-4000-8000-0000000000e2', bed2, '2027-05-01', '2027-06-01', 'confirmed' from t_ids$$, '42501', 'cannot self-confirm a booking');
select pg_temp.expect_error($$insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e2', bed2, '2027-06-01', '2027-05-01' from t_ids$$, '22000', 'end date must be after start date');
select pg_temp.check((select count(*) from public.bookings) = 2, 'student 2 sees only own bookings');
select pg_temp.check((select count(*) from public.bed_availability('00000000-0000-4000-8000-0000000000a2', '2027-01-15', '2027-01-20') where not is_available) = 2, 'availability reflects booked beds');
reset role;

-- ===== 3. الإلغاء يحرر السرير =====
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
update public.bookings set status = 'cancelled' where user_id = auth.uid();
select pg_temp.check(true, 'requester can cancel own booking');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
insert into public.bookings (user_id, bed_id, start_date, end_date) select '00000000-0000-4000-8000-0000000000e2', bed1, '2027-01-01', '2027-02-01' from t_ids;
select pg_temp.check(true, 'cancelled booking frees the bed');
select pg_temp.expect_error($$update public.bookings set status = 'confirmed' where user_id = auth.uid()$$, '42501', 'requester cannot confirm own booking');
reset role;

-- ===== 4. المالك =====
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select pg_temp.check((select count(*) from public.bookings) = 4, 'owner sees bookings on own property');
update public.bookings set status = 'confirmed' where bed_id = (select bed2 from t_ids);
select pg_temp.check(true, 'owner can confirm a pending booking');
select pg_temp.check((select count(*) from public.properties) = 4, 'owner also sees own draft');
select pg_temp.expect_error($$update public.properties set featured = true where id = '00000000-0000-4000-8000-0000000000a9'$$, '42501', 'owner cannot self-feature a listing');
reset role;

-- المالك يضيف سريرًا لمبناه ويستلم الصف الجديد (كما تفعل Supabase افتراضيًا)
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
create temp table t_new_bed as
  with ins as (insert into public.beds (room_id, code, monthly_price_omr) select id, 'N', 40 from public.rooms order by id limit 1 returning id)
  select id from ins;
select pg_temp.check((select count(*) from t_new_bed) = 1, 'owner can add a bed and read it back (insert ... returning)');
delete from public.beds where id in (select id from t_new_bed);
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.bookings) = 0, 'other owner cannot see these bookings');
update public.properties set title_ar = 'اختراق' where id = '00000000-0000-4000-8000-0000000000a1';
select pg_temp.check((select title_ar from public.properties where id = '00000000-0000-4000-8000-0000000000a1') <> 'اختراق', 'other owner cannot edit someone else''s property');
select pg_temp.expect_error($$insert into public.beds (room_id, code, monthly_price_omr) select id, 'X', 1 from public.rooms limit 1$$, '42501', 'other owner cannot add beds to someone else''s building');
reset role;

-- ===== 5. الملف الشخصي والأدوار =====
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.check((select count(*) from public.profiles) = 1, 'user sees only own profile');
update public.profiles set full_name = 'طالب' where id = auth.uid();
select pg_temp.check(true, 'user can update own name');
select pg_temp.expect_error($$update public.profiles set role = 'admin' where id = auth.uid()$$, '42501', 'user cannot promote themselves');
select pg_temp.expect_error($$insert into public.properties (owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period) values (auth.uid(), 'rent', 'studio', 'sohar', 'x', 'x', 'abc', 'abc', 1, 'monthly')$$, '42501', 'regular user cannot list a property');
reset role;

-- ===== 6. مهلة الطلب المعلق وتثبيت السعر =====
select pg_temp.check((select bool_and(expires_at > now() + interval '47 hours' and monthly_price_omr = 45) from public.bookings where status = 'pending'),
  'server sets 48h expiry and snapshots the bed price');

create temp table t_bed3 as select id from public.beds where id not in (select bed1 from t_ids union select bed2 from t_ids) order by id limit 1;
grant select on t_bed3 to authenticated, anon;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect_error($$update public.bookings set expires_at = now() + interval '1 year' where user_id = auth.uid()$$, '42501', 'requester cannot extend expiry');
insert into public.bookings (user_id, bed_id, start_date, end_date, monthly_price_omr) select auth.uid(), id, '2027-08-01', '2027-09-01', 0.001 from t_bed3;
select pg_temp.check((select monthly_price_omr from public.bookings where bed_id = (select id from t_bed3)) = 45, 'client-supplied price is ignored');
reset role;

-- نجعل الطلب منتهي المهلة (كأن 48 ساعة مرت)
update public.bookings set expires_at = now() - interval '1 minute' where bed_id = (select id from t_bed3);
select pg_temp.as_user(null);
select pg_temp.check((select is_available from public.bed_availability('00000000-0000-4000-8000-0000000000a2', '2027-08-01', '2027-09-01') where bed_id = (select id from t_bed3)),
  'expired pending request no longer blocks availability');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select pg_temp.expect_error($$update public.bookings set status = 'confirmed' where bed_id = (select id from t_bed3)$$, '42501', 'owner cannot confirm an expired request');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
insert into public.bookings (user_id, bed_id, start_date, end_date) select auth.uid(), id, '2027-08-01', '2027-09-01' from t_bed3;
select pg_temp.check(true, 'a new request replaces an expired one on the same bed');
reset role;
select pg_temp.check((select status from public.bookings where bed_id = (select id from t_bed3) and user_id = '00000000-0000-4000-8000-0000000000e1') = 'expired',
  'the stale request was marked expired');

update public.bookings set expires_at = now() - interval '1 minute' where bed_id = (select id from t_bed3) and status = 'pending';
select pg_temp.check(public.expire_stale_bookings() = 1, 'cleanup job expires stale requests');

-- ===== 7. لوحة المالك =====
update public.profiles set full_name = 'طالب ثان', phone = '+96890000000' where id = '00000000-0000-4000-8000-0000000000e2';
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select pg_temp.check((select count(*) from public.owner_booking_requests()) > 0, 'owner sees requests on own properties');
select pg_temp.check((select bool_or(requester_phone = '+96890000000') from public.owner_booking_requests()), 'owner sees requester name and phone');
select pg_temp.check((select properties from public.owner_dashboard_stats()) = 4, 'owner stats count own properties');
select pg_temp.check((select beds from public.owner_dashboard_stats()) = 8, 'owner stats count own beds');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.owner_booking_requests()) = 0, 'another owner sees none of these requests');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select pg_temp.check((select count(*) from public.owner_booking_requests()) = 0, 'a student cannot use the owner inbox to see others');
select pg_temp.expect_error($$select public.admin_list_users(null)$$, '42501', 'non-admin cannot list users');
select pg_temp.expect_error($$select public.admin_set_role('00000000-0000-4000-8000-0000000000e2', 'admin')$$, '42501', 'non-admin cannot change roles');
select pg_temp.expect_error($$select public.admin_set_featured('00000000-0000-4000-8000-0000000000a9', true)$$, '42501', 'non-admin cannot feature listings');
reset role;
select pg_temp.as_user(null);
select pg_temp.expect_error($$select * from public.owner_booking_requests()$$, '42501', 'anonymous cannot call owner functions');
reset role;

-- ===== 8. الإدارة =====
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000ad', 'admin@example.com');
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000ad';
select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad');
select pg_temp.check((select count(*) from public.admin_list_users('example.com')) >= 5, 'admin lists users with email');
select public.admin_set_role('00000000-0000-4000-8000-0000000000e1', 'owner');
select pg_temp.check((select role from public.profiles where id = '00000000-0000-4000-8000-0000000000e1') = 'owner', 'admin promotes a user to owner');
select pg_temp.expect_error($$select public.admin_set_role('00000000-0000-4000-8000-0000000000ad', 'user')$$, '42501', 'admin cannot demote themselves');
select public.admin_set_featured('00000000-0000-4000-8000-0000000000a9', true);
select pg_temp.check((select featured from public.properties where id = '00000000-0000-4000-8000-0000000000a9'), 'admin features a listing');
select pg_temp.check((select count(*) from public.properties) = 4, 'admin sees drafts too');
reset role;

-- ===== 9. صور العقارات (Storage) =====
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
insert into storage.objects (bucket_id, name) values ('property-images', '00000000-0000-4000-8000-0000000000a1/cover.jpg');
select pg_temp.check(true, 'owner uploads into own property folder');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('property-images', '00000000-0000-4000-8000-0000000000a1/evil.jpg')$$, '42501', 'other owner cannot upload into someone else''s property folder');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('property-images', 'random/evil.jpg')$$, '*', 'student cannot upload property images');
reset role;

-- ===== 10. حصة المساعد =====
select pg_temp.check(public.assistant_take_quota('00000000-0000-4000-8000-0000000000e1', 2), 'assistant quota: first message allowed');
select pg_temp.check(public.assistant_take_quota('00000000-0000-4000-8000-0000000000e1', 2), 'assistant quota: second message allowed');
select pg_temp.check(not public.assistant_take_quota('00000000-0000-4000-8000-0000000000e1', 2), 'assistant quota: over the daily limit is refused');
select pg_temp.check((select count from public.assistant_usage where user_id = '00000000-0000-4000-8000-0000000000e1') = 2, 'refused message is not counted');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect_error($$select public.assistant_take_quota(auth.uid(), 1000)$$, '42501', 'users cannot call the quota function to reset or raise their limit');
update public.assistant_usage set count = 0;
reset role;
select pg_temp.check((select count from public.assistant_usage where user_id = '00000000-0000-4000-8000-0000000000e1') = 2, 'users cannot reset their usage directly (RLS hides the rows)');

-- ===== 11. الإشعارات =====
delete from public.notifications;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
create temp table t_n_bed as select id from public.beds where id not in (select bed_id from public.bookings where status in ('pending','confirmed')) order by id limit 1;
grant select on t_n_bed to authenticated;
insert into public.bookings (user_id, bed_id, start_date, end_date) select auth.uid(), id, '2028-01-01', '2028-02-01' from t_n_bed;
reset role;
select pg_temp.check((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-00000000d001' and kind = 'booking_requested') = 1, 'owner is notified of a new request');
select pg_temp.check((select data ->> 'requester_name' from public.notifications where kind = 'booking_requested') = 'طالب ثان', 'notification carries requester name and property');

select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
update public.bookings set status = 'confirmed' where bed_id = (select id from t_n_bed) and status = 'pending';
reset role;
select pg_temp.check((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-0000000000e2' and kind = 'booking_confirmed') = 1, 'tenant is notified when approved');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
update public.bookings set status = 'cancelled' where bed_id = (select id from t_n_bed) and status = 'confirmed';
select pg_temp.check((select count(*) from public.notifications) = 1, 'users see only their own notifications');
update public.notifications set read_at = now();
select pg_temp.check((select read_at is not null from public.notifications limit 1), 'user can mark own notification read');
select pg_temp.expect_error($$update public.notifications set kind = 'booking_rejected'$$, '42501', 'user cannot alter notification content');
select pg_temp.expect_error($$insert into public.notifications (user_id, kind) values (auth.uid(), 'booking_confirmed')$$, '42501', 'users cannot forge notifications');
reset role;
select pg_temp.check((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-00000000d001' and kind = 'booking_cancelled_by_tenant') = 1, 'owner is notified when the tenant cancels');

-- انتهاء المهلة يُشعر المستأجر
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
insert into public.bookings (user_id, bed_id, start_date, end_date) select auth.uid(), id, '2028-03-01', '2028-04-01' from t_n_bed;
reset role;
update public.bookings set expires_at = now() - interval '1 minute' where bed_id = (select id from t_n_bed) and status = 'pending';
select public.expire_stale_bookings();
select pg_temp.check((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-0000000000e2' and kind = 'booking_expired') = 1, 'tenant is notified when a request expires');

-- النص بلغتين
select pg_temp.check((select title from public.notification_text('booking_confirmed', 'en', '{}')) = 'Your request was approved ✓', 'English notification text');
select pg_temp.check((select body from public.notification_text('booking_requested', 'ar', '{"requester_name":"سالم","bed_code":"2","room_code":"003","property_title_ar":"سكن النخيل"}')) = 'سالم طلب سرير 2 · غرفة 003 في سكن النخيل', 'Arabic notification text');

-- رموز الأجهزة
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select public.register_push_token('ExponentPushToken[abc123456]', 'android');
select pg_temp.check((select count(*) from public.push_tokens) = 1, 'user registers a device token');
select pg_temp.expect_error($$insert into public.push_tokens (token, user_id, platform) values ('ExponentPushToken[evil00000]', '00000000-0000-4000-8000-00000000d001', 'ios')$$, '42501', 'cannot register a token for someone else');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select public.register_push_token('ExponentPushToken[abc123456]', 'android');
reset role;
select pg_temp.check((select user_id from public.push_tokens where token = 'ExponentPushToken[abc123456]') = '00000000-0000-4000-8000-0000000000e1', 'a device moves to the account that last signed in on it');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select public.unregister_push_token('ExponentPushToken[abc123456]');
reset role;
select pg_temp.check((select count(*) from public.push_tokens) = 1, 'cannot unregister another user''s device');

-- ===== 12. الأساس الموسّع: الأدوار، التدقيق، الأنواع، المواصفات، الصور =====
-- سجل التدقيق يُكتب تلقائيًا
select pg_temp.check((select count(*) from public.audit_logs where action = 'role.changed' and entity_id = '00000000-0000-4000-8000-0000000000e1') >= 1, 'role changes are audited');
select pg_temp.check((select count(*) from public.audit_logs where action = 'booking.status') >= 1, 'booking status changes are audited');
select pg_temp.check((select count(*) from public.audit_logs where action = 'property.featured') >= 1, 'featuring a listing is audited');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e2');
select pg_temp.check((select count(*) from public.audit_logs) = 0, 'non-admins cannot read the audit log');
select pg_temp.expect_error($$insert into public.audit_logs (action, entity, entity_id) values ('x','y','z')$$, '42501', 'nobody can forge audit entries');
select pg_temp.expect_error($$select * from public.admin_audit_log()$$, '42501', 'non-admins cannot call the audit report');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad');
select pg_temp.check((select count(*) from public.admin_audit_log('property')) >= 1, 'admin reads the audit log with actor names');
select pg_temp.expect_error($$update public.audit_logs set action = 'tampered'$$, '42501', 'even admins cannot edit the audit log');
select pg_temp.expect_error($$delete from public.audit_logs$$, '42501', 'even admins cannot delete audit entries');
reset role;

-- دور فريق التحقق
insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f1', 'verifier@example.com');
update public.profiles set role = 'verifier' where id = '00000000-0000-4000-8000-0000000000f1';

-- ملف المؤجر
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
insert into public.landlord_profiles (user_id, account_type, legal_name) values (auth.uid(), 'individual', 'خالد المعمري');
select pg_temp.check(true, 'landlord creates own profile');
select pg_temp.expect_error($$update public.landlord_profiles set verification_status = 'verified'$$, '42501', 'landlord cannot mark themselves verified');
select pg_temp.expect_error($$insert into public.landlord_profiles (user_id, account_type, company_cr) values ('00000000-0000-4000-8000-0000000000e3', 'company', '123')$$, '42501', 'cannot create a landlord profile for someone else');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.landlord_profiles) = 0, 'another landlord cannot read this landlord profile');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check((select count(*) from public.landlord_profiles) = 1, 'verification team can read landlord profiles');
select pg_temp.check((select count(*) from public.audit_logs) = 0, 'verification team cannot read the platform audit log');
reset role;

-- أنواع العقارات قابلة للتوسعة ومقيدة بنوع العرض
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
insert into public.properties (owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period, furnished, amenities, utilities_included, near_landmarks, deposit_omr)
values (auth.uid(), 'rent', 'house', 'sohar', 'الطريف', 'Al Tareef', 'بيت للإيجار', 'House for rent', 400, 'monthly', 'furnished', '{wifi,parking}', '{water,internet}', '{sohar_university}', 400);
select pg_temp.check(true, 'owner lists a new extensible type (house) with amenities');
select pg_temp.expect_error($$insert into public.properties (owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period) values (auth.uid(), 'rent', 'land', 'sohar', 'x', 'x', 'أرض', 'Land', 1, 'monthly')$$, '23514', 'a type must match its listing kind (land is sale-only)');
select pg_temp.expect_error($$insert into public.properties (owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period, amenities) values (auth.uid(), 'rent', 'room', 'sohar', 'x', 'x', 'غرفة', 'Room', 1, 'monthly', '{jacuzzi}')$$, '23514', 'unknown amenity codes are rejected');
select pg_temp.expect_error($$insert into public.property_types (code, name_ar, name_en, allowed_kinds) values ('castle', 'قلعة', 'Castle', '{sale}')$$, '42501', 'only the platform manages property types');
reset role;

-- الصور المتعددة
create temp table t_house as select id from public.properties where type = 'house' limit 1;
grant select on t_house to authenticated, anon;
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
insert into public.property_images (property_id, path, mime_type, size_bytes, position) select id, id || '/a.jpg', 'image/jpeg', 120000, 0 from t_house;
insert into public.property_images (property_id, path, mime_type, size_bytes, position) select id, id || '/b.webp', 'image/webp', 90000, 1 from t_house;
select pg_temp.check((select cover_image_path from public.properties where id = (select id from t_house)) like '%/a.jpg', 'first image becomes the cover automatically');
select public.set_cover_image((select id from public.property_images where path like '%/b.webp'));
select pg_temp.check((select cover_image_path from public.properties where id = (select id from t_house)) like '%/b.webp', 'owner changes the cover');
select pg_temp.expect_error($$insert into public.property_images (property_id, path, mime_type, size_bytes) select id, id || '/c.gif', 'image/gif', 100 from t_house$$, '23514', 'only jpeg, png and webp images are accepted');
select pg_temp.expect_error($$insert into public.property_images (property_id, path, mime_type, size_bytes) select id, id || '/big.jpg', 'image/jpeg', 6000000 from t_house$$, '23514', 'images over 5 MB are rejected');
select pg_temp.expect_error($$insert into public.property_images (property_id, path, mime_type, size_bytes) select id, '00000000-0000-4000-8000-0000000000a1/x.jpg', 'image/jpeg', 100 from t_house$$, '23514', 'an image path must be inside its own property folder');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.expect_error($$select public.set_cover_image((select id from public.property_images limit 1))$$, '42501', 'another owner cannot change the cover');
insert into public.property_images (property_id, path, mime_type, size_bytes) select id, id || '/evil.jpg', 'image/jpeg', 100 from t_house where false;
select pg_temp.expect_error($$insert into public.property_images (property_id, path, mime_type, size_bytes) select id, id || '/evil.jpg', 'image/jpeg', 100 from t_house$$, '42501', 'another owner cannot add images to this property');
reset role;

-- ===== 13. التوثيق =====
\echo '--- verification'
update public.profiles set full_name = 'موظف تحقق' where id = '00000000-0000-4000-8000-0000000000f1';
insert into public.mock_gov_registry values ('TEST-OK-3001', 'مالك تجريبي', 'sohar', '1/2');

select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
insert into public.landlord_profiles (user_id, legal_name) values (auth.uid(), 'مالك تجريبي') on conflict (user_id) do update set legal_name = excluded.legal_name;
insert into public.properties (id, owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period)
values ('00000000-0000-4000-8000-0000000000b1', auth.uid(), 'rent', 'apartment', 'sohar', 'الطريف', 'Al Tareef', 'شقة للتوثيق', 'Flat to verify', 200, 'monthly');
select pg_temp.expect_error($$update public.properties set status = 'published' where id = '00000000-0000-4000-8000-0000000000b1'$$, '23514', 'an unverified listing cannot be published');
select pg_temp.expect_error($$insert into public.properties (owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period, status) values (auth.uid(), 'rent', 'studio', 'sohar', 'x', 'x', 'منشور مباشرة', 'Direct', 1, 'monthly', 'published')$$, '23514', 'a new listing cannot be inserted as published');
select pg_temp.expect_error($$update public.properties set verification_status = 'verified' where id = '00000000-0000-4000-8000-0000000000b1'$$, '42501', 'owner cannot mark their own listing verified');
insert into public.properties (owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period, verification_status)
values (auth.uid(), 'rent', 'studio', 'sohar', 'x', 'x', 'محاولة', 'Attempt', 1, 'monthly', 'verified');
select pg_temp.check((select verification_status from public.properties where title_en = 'Attempt') = 'unverified', 'verification fields are ignored on insert');

insert into public.verification_requests (id, subject, property_id) values ('00000000-0000-4000-8000-0000000000c1', 'property', '00000000-0000-4000-8000-0000000000b1');
update public.verification_requests set deed_number = 'TEST-OK-3001', declared_owner_name = 'مالك  تجريبي', declared_city = 'sohar' where id = '00000000-0000-4000-8000-0000000000c1';
insert into public.verification_documents (request_id, doc_type, path, mime_type, size_bytes, sha256)
values ('00000000-0000-4000-8000-0000000000c1', 'title_deed', auth.uid() || '/00000000-0000-4000-8000-0000000000c1/deed.pdf', 'application/pdf', 200000, repeat('a', 64));
select pg_temp.expect_error($$insert into public.verification_documents (request_id, doc_type, path, mime_type, size_bytes, sha256) values ('00000000-0000-4000-8000-0000000000c1', 'other', 'someone-else/x.pdf', 'application/pdf', 1, repeat('b', 64))$$, '42501', 'documents must be stored in the uploader''s own folder');
select pg_temp.expect_error($$insert into public.verification_documents (request_id, doc_type, path, mime_type, size_bytes, sha256) values ('00000000-0000-4000-8000-0000000000c1', 'other', auth.uid() || '/00000000-0000-4000-8000-0000000000c1/x.exe', 'application/x-msdownload', 1, repeat('b', 64))$$, '23514', 'only pdf, jpeg and png documents are accepted');
select pg_temp.expect_error($$insert into public.verification_checks (request_id, run_no, code, source, result, required) values ('00000000-0000-4000-8000-0000000000c1', 1, 'x', 'automated', 'pass', true)$$, '42501', 'clients cannot write check results');
select pg_temp.expect_error($$select public.decide_verification('00000000-0000-4000-8000-0000000000c1', 'approved')$$, '42501', 'owners cannot approve verification');
select pg_temp.check(public.submit_verification('00000000-0000-4000-8000-0000000000c1') = 'passed', 'automated checks pass for a consistent request');
select pg_temp.check((select official_status from public.verification_requests where id = '00000000-0000-4000-8000-0000000000c1') = 'verified', 'mock registry confirms the deed (marked is_mock)');
select pg_temp.check((select bool_and(is_mock) from public.verification_checks where source = 'official'), 'official results are always flagged as mock');
select pg_temp.check((select verification_status from public.properties where id = '00000000-0000-4000-8000-0000000000b1') = 'pending', 'listing becomes pending review');
update public.verification_requests set deed_number = 'X-1' where id = '00000000-0000-4000-8000-0000000000c1';
select pg_temp.check((select deed_number from public.verification_requests where id = '00000000-0000-4000-8000-0000000000c1') = 'TEST-OK-3001', 'a submitted request is locked');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.verification_requests) = 0 and (select count(*) from public.verification_documents) = 0, 'other users cannot see verification requests or documents');
select pg_temp.expect_error($$insert into public.verification_requests (subject, property_id) values ('property', '00000000-0000-4000-8000-0000000000b1')$$, '42501', 'cannot open verification for someone else''s listing');
select pg_temp.expect_error($$select * from public.verification_queue()$$, '42501', 'non-staff cannot read the verification queue');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.check((select count(*) from public.verification_queue() where id = '00000000-0000-4000-8000-0000000000c1') = 1, 'verifier sees the request in the queue');
select pg_temp.check((select count(*) from public.verification_documents where request_id = '00000000-0000-4000-8000-0000000000c1') = 1, 'verifier can read the private documents');
select pg_temp.check((select count(*) from public.properties where id = '00000000-0000-4000-8000-0000000000b1') = 1, 'verifier can see the draft under review');
select pg_temp.expect_error($$select public.decide_verification('00000000-0000-4000-8000-0000000000c1', 'rejected')$$, '23514', 'rejection requires a reason');
select public.decide_verification('00000000-0000-4000-8000-0000000000c1', 'approved');
select pg_temp.check((select verification_status = 'verified' and verified_scope = 'official_registry' and verification_expires_at > now() from public.properties where id = '00000000-0000-4000-8000-0000000000b1'), 'approval verifies the listing with scope and expiry');
select pg_temp.expect_error($$select public.decide_verification('00000000-0000-4000-8000-0000000000c1', 'rejected', 'late')$$, '23514', 'a decided request cannot be decided again');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
update public.properties set status = 'published' where id = '00000000-0000-4000-8000-0000000000b1';
select pg_temp.check((select status from public.properties where id = '00000000-0000-4000-8000-0000000000b1') = 'published', 'a verified listing can be published');
update public.properties set price_omr = 210 where id = '00000000-0000-4000-8000-0000000000b1';
select pg_temp.check((select status = 'published' and verification_status = 'verified' from public.properties where id = '00000000-0000-4000-8000-0000000000b1'), 'a price change keeps the verification');
update public.properties set district_ar = 'فلج القبائل', district_en = 'Falaj Al Qabail' where id = '00000000-0000-4000-8000-0000000000b1';
select pg_temp.check((select status = 'draft' and verification_status = 'unverified' from public.properties where id = '00000000-0000-4000-8000-0000000000b1'), 'a substantive edit drops verification and unpublishes');
reset role;

-- محاولة احتيال: مؤجر آخر يستخدم نفس السند ونفس الملف
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
insert into public.properties (id, owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period)
values ('00000000-0000-4000-8000-0000000000b2', auth.uid(), 'rent', 'apartment', 'sohar', 'الطريف', 'Al Tareef', 'شقة منسوخة', 'Copied flat', 150, 'monthly');
insert into public.verification_requests (id, subject, property_id, deed_number, declared_owner_name, declared_city)
values ('00000000-0000-4000-8000-0000000000c2', 'property', '00000000-0000-4000-8000-0000000000b2', 'TEST-OK-3001', 'مالك تجريبي', 'sohar');
insert into public.verification_documents (request_id, doc_type, path, mime_type, size_bytes, sha256)
values ('00000000-0000-4000-8000-0000000000c2', 'title_deed', auth.uid() || '/00000000-0000-4000-8000-0000000000c2/deed.pdf', 'application/pdf', 200000, repeat('a', 64));
select pg_temp.check(public.submit_verification('00000000-0000-4000-8000-0000000000c2') = 'failed', 'reused deed and file fail the automated checks');
select pg_temp.check((select array_agg(code order by code) from public.verification_checks where request_id = '00000000-0000-4000-8000-0000000000c2' and result = 'fail' and source = 'automated') = '{duplicate_deed,duplicate_file,name_match}', 'failed checks name the exact problems');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select pg_temp.expect_error($$select public.decide_verification('00000000-0000-4000-8000-0000000000c2', 'approved', 'looks fine')$$, '23514', 'staff cannot approve when mandatory checks failed');
select public.decide_verification('00000000-0000-4000-8000-0000000000c2', 'rejected', 'سند مستخدم لدى مؤجر آخر');
select pg_temp.check((select verification_status from public.properties where id = '00000000-0000-4000-8000-0000000000b2') = 'rejected', 'rejected listing is marked rejected');
insert into public.verification_requests (id, subject) values ('00000000-0000-4000-8000-0000000000c3', 'landlord');
select public.set_verification_identity('00000000-0000-4000-8000-0000000000c3', '12345678');
select public.submit_verification('00000000-0000-4000-8000-0000000000c3');
select pg_temp.check((select identity_last4 = '5678' and identity_hash ~ '^[0-9a-f]{64}$' from public.verification_requests where id = '00000000-0000-4000-8000-0000000000c3'), 'identity numbers are stored as a hash plus last 4 digits only');
select pg_temp.expect_error($$select public.decide_verification('00000000-0000-4000-8000-0000000000c3', 'rejected', 'x')$$, '42501', 'staff cannot review their own request');
reset role;

-- طلب المؤجر: يفشل بلا بيانات، يُطلب استكمال، ثم يُعاد ويُعتمد
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
insert into public.verification_requests (id, subject) values ('00000000-0000-4000-8000-0000000000c4', 'landlord');
select pg_temp.check(public.submit_verification('00000000-0000-4000-8000-0000000000c4') = 'failed', 'landlord request without ID or documents fails');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select public.decide_verification('00000000-0000-4000-8000-0000000000c4', 'needs_info', 'أرفق صورة الهوية');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
insert into public.landlord_profiles (user_id, legal_name) values (auth.uid(), 'مالك ثان');
select public.set_verification_identity('00000000-0000-4000-8000-0000000000c4', '99887766');
insert into public.verification_documents (request_id, doc_type, path, mime_type, size_bytes, sha256)
values ('00000000-0000-4000-8000-0000000000c4', 'id_card', auth.uid() || '/00000000-0000-4000-8000-0000000000c4/id.jpg', 'image/jpeg', 50000, repeat('c', 64));
select pg_temp.check(public.submit_verification('00000000-0000-4000-8000-0000000000c4') = 'passed', 'resubmitted landlord request passes');
select pg_temp.check((select reason from public.verification_decisions where request_id = '00000000-0000-4000-8000-0000000000c4') = 'أرفق صورة الهوية', 'the landlord can read the reviewer''s reason');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000f1');
select public.decide_verification('00000000-0000-4000-8000-0000000000c4', 'approved');
select pg_temp.check((select verification_status from public.landlord_profiles where user_id = '00000000-0000-4000-8000-0000000000e3') = 'verified', 'approved landlord profile is verified');
reset role;
select pg_temp.check((select count(*) from public.audit_logs where action in ('verification.approved', 'verification.rejected', 'verification.needs_info', 'verification.submitted')) >= 6, 'every verification step is audited');
select pg_temp.check((select count(*) from public.audit_logs where action = 'property.reverification') = 1, 'substantive edits are audited');

-- ===== 14. العقود والتوقيع (تجريبي) =====
\echo '--- contracts'
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
insert into public.bookings (id, user_id, bed_id, start_date, end_date)
select '00000000-0000-4000-8000-0000000000d7', auth.uid(), bed1, '2028-01-01', '2028-05-01' from t_ids;
select pg_temp.expect_error($$select public.create_contract('00000000-0000-4000-8000-0000000000d7')$$, '42501', 'a tenant cannot create the contract');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select pg_temp.expect_error($$select public.create_contract('00000000-0000-4000-8000-0000000000d7')$$, '23514', 'no contract for an unconfirmed booking');
update public.bookings set status = 'confirmed' where id = '00000000-0000-4000-8000-0000000000d7';
create temp table t_c as select public.create_contract('00000000-0000-4000-8000-0000000000d7') as id;
grant select on t_c to authenticated, anon;
select pg_temp.check((select body_ar like '%2028-01-01%' and body_ar like '%{{%' = false and body_en like '%4 months%' and body_ar like '%سياسة الإلغاء: متوسطة%' from public.contract_versions where contract_id = (select id from t_c)), 'contract text is filled from the real booking (no leftover placeholders)');
select pg_temp.check((select sha256 = public.contract_body_sha(body_ar, body_en) from public.contract_versions where contract_id = (select id from t_c)), 'each version stores its SHA-256 fingerprint');
select pg_temp.expect_error($$select public.create_contract('00000000-0000-4000-8000-0000000000d7')$$, '23505', 'one contract per booking');
select pg_temp.expect_error($$insert into public.signatures (contract_id, version_no, signer_id, role, signed_sha256) select id, 1, auth.uid(), 'landlord', repeat('a', 64) from t_c$$, '42501', 'signatures cannot be inserted directly');
select pg_temp.expect_error($$update public.contract_versions set body_ar = 'معدل' where contract_id = (select id from t_c)$$, '42501', 'contract versions cannot be edited by clients');
select pg_temp.expect_error($$select public.sign_contract((select id from t_c), (select sha256 from public.contract_versions where contract_id = (select id from t_c)))$$, '23514', 'the landlord cannot sign before the tenant');
select pg_temp.expect_error($$select public.revise_contract((select id from t_c))$$, '23514', 'a revision must change the text');
update public.properties set deposit_omr = 60 where id = (select property_id from public.contracts where id = (select id from t_c));
select pg_temp.check(public.revise_contract((select id from t_c), 'تحديث التأمين') = 2, 'landlord issues a new version (deposit changed) before anyone signs');
select pg_temp.check((select body_ar like '%60 ر.ع%' from public.contract_versions where contract_id = (select id from t_c) and version_no = 2), 'the new version reflects the change');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.contracts) = 0 and (select count(*) from public.contract_versions) = 0, 'third parties cannot see contracts');
select pg_temp.expect_error($$select public.sign_contract((select id from t_c), repeat('a', 64))$$, '42501', 'a third party cannot sign');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect_error($$select public.sign_contract((select id from t_c), (select sha256 from public.contract_versions where contract_id = (select id from t_c) and version_no = 1))$$, '23514', 'signing an outdated version is rejected');
select pg_temp.expect_error($$select public.sign_contract((select id from t_c), repeat('0', 64))$$, '23514', 'signing with a wrong fingerprint is rejected');
select pg_temp.check(public.sign_contract((select id from t_c), (select sha256 from public.contract_versions where contract_id = (select id from t_c) and version_no = 2)) = 'pending_landlord', 'tenant signs the current version');
reset role;

select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select pg_temp.expect_error($$select public.revise_contract((select id from t_c))$$, '23514', 'a signed contract cannot be revised');
select pg_temp.check(public.sign_contract((select id from t_c), (select sha256 from public.contract_versions where contract_id = (select id from t_c) and version_no = 2)) = 'completed', 'landlord countersigns and the contract completes');
select pg_temp.check((select c.final_sha256 = v.sha256 from public.contracts c join public.contract_versions v on v.contract_id = c.id and v.version_no = c.current_version where c.id = (select id from t_c)), 'final fingerprint equals the signed version');
select pg_temp.check((select bool_and(is_mock and provider = 'mock_sign') and count(*) = 2 from public.signatures where contract_id = (select id from t_c)), 'both signatures are recorded and flagged as mock');
select pg_temp.expect_error($$select public.cancel_contract((select id from t_c), 'تراجع')$$, '42501', 'a completed contract cannot be cancelled');
reset role;
-- حتى المالك الأعلى لقاعدة البيانات لا يستطيع تعديل العقد المكتمل أو حذفه
select pg_temp.expect_error($$update public.contracts set status = 'cancelled' where id = (select id from t_c)$$, '42501', 'a completed contract is frozen even for the database owner');
select pg_temp.expect_error($$delete from public.contract_versions where contract_id = (select id from t_c)$$, '42501', 'contract versions can never be deleted');
select pg_temp.check((select count(*) from public.audit_logs where action like 'contract.%') = 4, 'contract steps are audited (created, revised, 2 signatures)');

-- ===== 15. المدفوعات (مزود تجريبي) =====
\echo '--- payments'
create temp table t_pay as select id, kind, seq, amount_omr from public.payments where contract_id = (select id from t_c);
grant select on t_pay to authenticated, anon;
select pg_temp.check((select count(*) filter (where kind = 'rent') = 4 and count(*) filter (where kind = 'deposit') = 1 from t_pay), 'completing the contract schedules 4 monthly rents and the deposit');
select pg_temp.check((select amount_omr from t_pay where kind = 'deposit') = 60, 'deposit amount comes from the listing');
select pg_temp.check(not exists (
  select 1 from information_schema.columns where table_schema = 'public' and table_name like 'payment%'
    and (column_name ~* 'card|pan|cvv|cvc|expiry|iban')), 'no card or bank data columns exist in payment tables');

select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.check((select count(*) from public.payments where contract_id = (select id from t_c)) = 5, 'tenant sees their schedule');
select pg_temp.expect_error($$update public.payments set status = 'paid' where contract_id = (select id from t_c)$$, '42501', 'tenant cannot mark a payment paid');
select pg_temp.expect_error($$insert into public.payment_transactions (payment_id, type, provider_ref, amount_omr, created_by) select id, 'charge', 'x', 1, auth.uid() from t_pay limit 1$$, '42501', 'clients cannot create transactions directly');
select pg_temp.expect_error($$select public.record_payment_event('evt_forged_000', 'mock_pay', 'payment.succeeded', 'x', 1)$$, '42501', 'clients cannot submit provider events');
select pg_temp.expect_error($$select * from public.create_payment_transaction((select id from t_pay limit 1), 'charge', auth.uid())$$, '42501', 'clients cannot start transactions without the payments function');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.payments) = 0, 'third parties cannot see payments');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select pg_temp.check((select count(*) from public.payments where contract_id = (select id from t_c)) = 5, 'landlord sees the schedule for their contract');
reset role;

-- ما تفعله دالة payments بمفتاح الخدمة
select pg_temp.expect_error($$select * from public.create_payment_transaction((select id from t_pay where kind = 'deposit'), 'charge', '00000000-0000-4000-8000-00000000d001')$$, '42501', 'only the tenant can pay');
create temp table t_tx as select * from public.create_payment_transaction((select id from t_pay where kind = 'deposit'), 'charge', '00000000-0000-4000-8000-0000000000e1');
select pg_temp.check((select status from public.payments where id = (select id from t_pay where kind = 'deposit')) = 'processing', 'payment is processing until the provider confirms');
select pg_temp.expect_error($$select * from public.create_payment_transaction((select id from t_pay where kind = 'deposit'), 'charge', '00000000-0000-4000-8000-0000000000e1')$$, '23514', 'a processing payment cannot be charged twice');
select pg_temp.check(public.record_payment_event('evt_wrong_amount1', 'mock_pay', 'payment.succeeded', (select provider_ref from t_tx), 1) = 'amount_mismatch', 'an event with the wrong amount is rejected');
select pg_temp.check((select status from public.payments where id = (select id from t_pay where kind = 'deposit')) = 'processing', 'still not paid after a bad event');
select pg_temp.check(public.record_payment_event('evt_ok_000000001', 'mock_pay', 'payment.succeeded', (select provider_ref from t_tx), 60) = 'paid', 'a valid provider event marks the payment paid');
select pg_temp.check((select receipt_no ~ '^AQ-[0-9]{4}-[0-9]{6}$' and paid_at is not null from public.payments where id = (select id from t_pay where kind = 'deposit')), 'a receipt number is issued');
select pg_temp.check(public.record_payment_event('evt_ok_000000001', 'mock_pay', 'payment.succeeded', (select provider_ref from t_tx), 60) = 'duplicate', 'the same event is never applied twice');
select pg_temp.check(public.record_payment_event('evt_ok_000000002', 'mock_pay', 'payment.succeeded', (select provider_ref from t_tx), 60) = 'already_final', 'a second success for a settled transaction is ignored');
select pg_temp.check((select count(*) from public.payment_transactions where is_mock and provider = 'mock_pay') = 1, 'transactions are flagged as mock');

-- فشل ثم إعادة المحاولة
create temp table t_tx2 as select * from public.create_payment_transaction((select id from t_pay where kind = 'rent' and seq = 1), 'charge', '00000000-0000-4000-8000-0000000000e1');
select pg_temp.check(public.record_payment_event('evt_fail_00000001', 'mock_pay', 'payment.failed', (select provider_ref from t_tx2), (select amount_omr from t_tx2), '{"reason":"insufficient_funds"}') = 'failed', 'a declined payment is marked failed');
select pg_temp.check((select count(*) from public.create_payment_transaction((select id from t_pay where kind = 'rent' and seq = 1), 'charge', '00000000-0000-4000-8000-0000000000e1')) = 1, 'a failed payment can be retried');

-- استرداد التأمين
select pg_temp.expect_error($$select * from public.create_payment_transaction((select id from t_pay where kind = 'deposit'), 'refund', '00000000-0000-4000-8000-0000000000e1')$$, '42501', 'only the landlord refunds the deposit');
select pg_temp.expect_error($$select * from public.create_payment_transaction((select id from t_pay where kind = 'rent' and seq = 2), 'refund', '00000000-0000-4000-8000-00000000d001')$$, '23514', 'only a paid deposit can be refunded');
create temp table t_rf as select * from public.create_payment_transaction((select id from t_pay where kind = 'deposit'), 'refund', '00000000-0000-4000-8000-00000000d001');
select pg_temp.check(public.record_payment_event('evt_refund_000001', 'mock_pay', 'refund.succeeded', (select provider_ref from t_rf), 60) = 'refunded', 'deposit refund completes after the provider confirms');
select pg_temp.check((select status = 'refunded' and refunded_at is not null and receipt_no is not null from public.payments where id = (select id from t_pay where kind = 'deposit')), 'refunded deposit keeps its receipt');
select pg_temp.check((select count(*) from public.audit_logs where entity = 'payment') >= 6, 'payment steps are audited');

-- ===== 16. ما بعد السكن: صيانة، بلاغات، تقييمات =====
\echo '--- post-stay'
create temp table t_prop as select public.property_of_bed(bed1) as id from t_ids;
grant select on t_prop to authenticated, anon;

-- الصيانة
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.expect_error($$select public.open_maintenance('00000000-0000-4000-8000-0000000000d7', 'ac', 'urgent', 'المكيف لا يعمل')$$, '42501', 'only the booking tenant can open maintenance');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
create temp table t_m as select public.open_maintenance('00000000-0000-4000-8000-0000000000d7', 'ac', 'urgent', 'المكيف لا يعمل', 'منذ أمس') as id;
grant select on t_m to authenticated, anon;
select pg_temp.check((select landlord_id = '00000000-0000-4000-8000-00000000d001' and status = 'open' from public.maintenance_requests where id = (select id from t_m)), 'maintenance request goes to the landlord');
select pg_temp.expect_error($$select public.update_maintenance((select id from t_m), 'resolved')$$, '23514', 'the tenant cannot mark it resolved');
select pg_temp.expect_error($$update public.maintenance_requests set status = 'resolved'$$, '42501', 'no direct writes to maintenance');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.check((select count(*) from public.maintenance_requests) = 0, 'other users cannot see maintenance requests');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select public.update_maintenance((select id from t_m), 'in_progress', 'الفني في الطريق');
select public.update_maintenance((select id from t_m), 'resolved', 'تم تغيير الضاغط');
select pg_temp.check((select status = 'resolved' and resolved_at is not null and landlord_note = 'تم تغيير الضاغط' from public.maintenance_requests where id = (select id from t_m)), 'landlord progresses and resolves with a note');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select public.update_maintenance((select id from t_m), 'closed');
select pg_temp.check((select status from public.maintenance_requests where id = (select id from t_m)) = 'closed', 'tenant confirms and closes');
reset role;

-- البلاغات
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
insert into public.property_reports (property_id, reason, details) select id, 'wrong_info', 'السعر غير صحيح' from t_prop;
select pg_temp.expect_error($$insert into public.property_reports (property_id, reason) select id, 'fraud' from t_prop$$, '23505', 'one open report per user per listing');
select pg_temp.expect_error($$insert into public.property_reports (property_id, reason) values ('00000000-0000-4000-8000-0000000000a9', 'fraud')$$, '42501', 'cannot report a listing you cannot see');
select pg_temp.expect_error($$update public.property_reports set status = 'dismissed'$$, '42501', 'reporters cannot change report status');
select pg_temp.expect_error($$select public.handle_report((select id from public.property_reports limit 1), 'dismissed')$$, '42501', 'only support/admin handle reports');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.check((select count(*) from public.property_reports) = 0, 'reports are private to the reporter and support');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000ad');
select public.handle_report((select id from public.property_reports where reporter_id = '00000000-0000-4000-8000-0000000000e3'), 'resolved', 'تم تصحيح السعر');
select pg_temp.check((select status = 'resolved' and handled_by = auth.uid() from public.property_reports where reporter_id = '00000000-0000-4000-8000-0000000000e3'), 'admin resolves the report');
reset role;

-- التقييمات: فقط بعد إقامة مكتملة
insert into public.bookings (id, user_id, bed_id, start_date, end_date, status)
select '00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000e1', bed1, '2025-01-01', '2025-03-01', 'confirmed' from t_ids;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect_error($$insert into public.reviews (booking_id, property_id, rating) select '00000000-0000-4000-8000-0000000000d7', id, 5 from t_prop$$, '23514', 'cannot review a stay that has not ended');
select pg_temp.expect_error($$insert into public.reviews (booking_id, property_id, rating) select '00000000-0000-4000-8000-0000000000d8', id, 6 from t_prop$$, '23514', 'rating must be 1–5');
insert into public.reviews (booking_id, property_id, rating, comment) values ('00000000-0000-4000-8000-0000000000d8', '00000000-0000-4000-8000-0000000000a3', 4, 'سكن هادئ ونظيف');
select pg_temp.check((select property_id = (select id from t_prop) from public.reviews where booking_id = '00000000-0000-4000-8000-0000000000d8'), 'the review is bound to the booked property (cannot be redirected)');
select pg_temp.expect_error($$insert into public.reviews (booking_id, rating) values ('00000000-0000-4000-8000-0000000000d8', 5)$$, '23505', 'one review per booking (property is derived from the booking)');
select pg_temp.expect_error($$update public.reviews set rating = 5$$, '42501', 'reviews cannot be edited afterwards');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e3');
select pg_temp.expect_error($$insert into public.reviews (booking_id, property_id, rating) select '00000000-0000-4000-8000-0000000000d8', id, 1 from t_prop$$, '23514', 'cannot review someone else''s stay');
select pg_temp.expect_error($$select public.reply_review((select id from public.property_reviews((select id from t_prop)) limit 1), 'رد')$$, '42501', 'only the property owner can reply');
reset role;
select pg_temp.as_user(null);
select pg_temp.check((select count(*) = 1 and bool_and(rating = 4 and reviewer = 'طالب') from public.property_reviews((select id from t_prop))), 'visitors see reviews with first name only');
reset role;
select pg_temp.as_user('00000000-0000-4000-8000-00000000d001');
select public.reply_review((select id from public.reviews where booking_id = '00000000-0000-4000-8000-0000000000d8'), 'شكرًا لك');
select pg_temp.expect_error($$select public.reply_review((select id from public.reviews where booking_id = '00000000-0000-4000-8000-0000000000d8'), 'مرة أخرى')$$, '42501', 'a review gets one landlord reply');
reset role;
select pg_temp.check((select landlord_reply from public.property_reviews((select id from t_prop)) limit 1) = 'شكرًا لك', 'the landlord reply is public');
select pg_temp.as_user('00000000-0000-4000-8000-0000000000e1');
select pg_temp.expect_error($$update public.bookings set status = 'cancelled' where id = '00000000-0000-4000-8000-0000000000d8'$$, '23514', 'a completed stay cannot be cancelled afterwards');
reset role;

\echo 'ALL DATABASE TESTS PASSED'
