-- =====================================================================
-- طلبات الحجز: مهلة للطلب المعلق + تثبيت السعر وقت الطلب
-- =====================================================================

-- مدة صلاحية الطلب المعلق قبل أن ينتهي تلقائيًا إن لم يرد المالك.
alter table public.bookings
  add column expires_at timestamptz,
  add column monthly_price_omr numeric(10, 3);

-- الطلبات الحالية تأخذ مهلة تبدأ من الآن.
update public.bookings set expires_at = now() + interval '48 hours' where status = 'pending' and expires_at is null;

-- عند إنشاء طلب: نثبت المهلة والسعر من الخادم (لا يحددهما التطبيق)،
-- ونُنهي أي طلبات معلقة منتهية المهلة على السرير نفسه حتى لا تحجبه.
create function public.prepare_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.expires_at := now() + interval '48 hours';
  select bd.monthly_price_omr into new.monthly_price_omr from public.beds bd where bd.id = new.bed_id;
  update public.bookings
     set status = 'expired'
   where bed_id = new.bed_id and status = 'pending' and expires_at < now();
  return new;
end $$;
create trigger bookings_prepare before insert on public.bookings
  for each row execute function public.prepare_booking();

-- لا يُعدَّل السعر أو المهلة من التطبيق.
revoke update on public.bookings from authenticated;
grant update (status) on public.bookings to authenticated;

-- انتقالات الحالة (تحديث): أُضيف pending → expired عند انتهاء المهلة.
create or replace function public.enforce_booking_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  is_requester boolean := old.user_id = auth.uid();
  is_manager   boolean := public.owns_property(public.property_of_bed(old.bed_id)) or public.is_admin();
begin
  if new.status = old.status then return new; end if;
  if auth.uid() is null then return new; end if; -- عمليات الخادم
  if old.status = 'pending' and new.status = 'expired' and old.expires_at < now() then return new; end if;
  if is_manager and old.expires_at >= now() and old.status = 'pending' and new.status in ('confirmed', 'rejected') then
    return new;
  end if;
  if is_manager and old.status = 'confirmed' and new.status = 'cancelled' then return new; end if;
  if is_requester and old.status in ('pending', 'confirmed') and new.status = 'cancelled' then return new; end if;
  raise exception 'booking status change % -> % not allowed', old.status, new.status
    using errcode = 'insufficient_privilege';
end $$;

-- منع التداخل: الطلبات المنتهية لم تعد ضمن القيد (status لم يعد pending).
-- القيد الأصلي bookings_no_overlap يبقى كما هو ويغطي pending و confirmed.

-- التوفر: الطلب المعلق منتهي المهلة لا يحجز السرير حتى قبل أن يُعلَّم expired.
create or replace function public.bed_availability(p_property uuid, p_start date, p_end date)
returns table (bed_id uuid, room_id uuid, floor_id uuid, building_id uuid, is_available boolean)
language sql stable security definer set search_path = '' as $$
  select bd.id, r.id, f.id, b.id,
         bd.status = 'active' and not exists (
           select 1 from public.bookings bk
           where bk.bed_id = bd.id
             and (bk.status = 'confirmed' or (bk.status = 'pending' and bk.expires_at >= now()))
             and bk.period && daterange(p_start, p_end, '[)')
         )
  from public.buildings b
  join public.floors f on f.building_id = b.id
  join public.rooms r on r.floor_id = f.id
  join public.beds bd on bd.room_id = r.id
  where b.property_id = p_property and public.can_view_property(p_property) and p_end > p_start;
$$;

-- تنظيف دوري: يعلّم كل الطلبات المعلقة المنتهية expired.
create function public.expire_stale_bookings() returns integer
language sql security definer set search_path = '' as $$
  with done as (
    update public.bookings set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning 1
  ) select count(*)::int from done;
$$;
revoke execute on function public.expire_stale_bookings() from public, anon, authenticated;

-- جدولة كل 10 دقائق إن كانت إضافة pg_cron متاحة (فعّلها من Database → Extensions في Supabase).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('expire-stale-bookings', '*/10 * * * *', 'select public.expire_stale_bookings()');
  end if;
end $$;
