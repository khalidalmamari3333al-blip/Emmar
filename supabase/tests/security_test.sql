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

\echo 'ALL DATABASE TESTS PASSED'
