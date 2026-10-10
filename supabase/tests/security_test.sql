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

\echo 'ALL DATABASE TESTS PASSED'
