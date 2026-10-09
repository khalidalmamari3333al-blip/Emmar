-- =====================================================================
-- لوحات المالك والإدارة: دوال آمنة (security definer) مع تحقق صريح من الصلاحية.
-- =====================================================================

-- ---------- طلبات الحجز على عقارات المالك (مع اسم ورقم مقدم الطلب) ----------
-- المالك لا يرى جدول profiles لغيره عبر RLS؛ هذه الدالة تكشف الاسم والهاتف فقط،
-- وفقط لمن قدّم طلبًا على عقار يملكه.
create function public.owner_booking_requests()
returns table (
  id uuid, status public.booking_status, start_date date, end_date date, expires_at timestamptz,
  monthly_price_omr numeric, note text, created_at timestamptz,
  bed_id uuid, bed_code text, room_code text, floor_level smallint,
  building_name_ar text, building_name_en text,
  property_id uuid, property_title_ar text, property_title_en text,
  requester_name text, requester_phone text
)
language sql stable security definer set search_path = '' as $$
  select bk.id, bk.status, bk.start_date, bk.end_date, bk.expires_at, bk.monthly_price_omr, bk.note, bk.created_at,
         bd.id, bd.code, r.code, f.level, b.name_ar, b.name_en, p.id, p.title_ar, p.title_en,
         pr.full_name, pr.phone
  from public.bookings bk
  join public.beds bd on bd.id = bk.bed_id
  join public.rooms r on r.id = bd.room_id
  join public.floors f on f.id = r.floor_id
  join public.buildings b on b.id = f.building_id
  join public.properties p on p.id = b.property_id
  join public.profiles pr on pr.id = bk.user_id
  where p.owner_id = auth.uid() or public.is_admin()
  order by bk.created_at desc
  limit 500;
$$;

-- ---------- إحصائيات لوحة المالك ----------
create function public.owner_dashboard_stats()
returns table (properties integer, published integer, beds integer, occupied_today integer, pending_requests integer)
language sql stable security definer set search_path = '' as $$
  with mine as (select id, status from public.properties where owner_id = auth.uid()),
  my_beds as (
    select bd.id from public.beds bd
    join public.rooms r on r.id = bd.room_id join public.floors f on f.id = r.floor_id
    join public.buildings b on b.id = f.building_id
    where b.property_id in (select id from mine)
  )
  select
    (select count(*)::int from mine),
    (select count(*)::int from mine where status = 'published'),
    (select count(*)::int from my_beds),
    (select count(distinct bk.bed_id)::int from public.bookings bk
       where bk.bed_id in (select id from my_beds) and bk.status = 'confirmed' and bk.period @> current_date),
    (select count(*)::int from public.bookings bk
       where bk.bed_id in (select id from my_beds) and bk.status = 'pending' and bk.expires_at >= now());
$$;

-- ---------- الإدارة ----------
create function public.admin_list_users(p_search text default null)
returns table (id uuid, email text, full_name text, phone text, role public.user_role, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  return query
    select pr.id, u.email::text, pr.full_name, pr.phone, pr.role, pr.created_at
    from public.profiles pr join auth.users u on u.id = pr.id
    where p_search is null or p_search = ''
       or u.email ilike '%' || p_search || '%' or pr.full_name ilike '%' || p_search || '%'
    order by pr.created_at desc
    limit 100;
end $$;

create function public.admin_set_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  -- منع المدير من إزالة صلاحيته بنفسه (حتى لا يُقفل النظام بلا مدير).
  if p_user = auth.uid() then
    raise exception 'cannot change your own role' using errcode = 'insufficient_privilege';
  end if;
  update public.profiles set role = p_role where id = p_user;
end $$;

create function public.admin_set_featured(p_property uuid, p_featured boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = 'insufficient_privilege';
  end if;
  update public.properties set featured = p_featured where id = p_property;
end $$;

revoke execute on function public.owner_booking_requests(), public.owner_dashboard_stats(),
  public.admin_list_users(text), public.admin_set_role(uuid, public.user_role),
  public.admin_set_featured(uuid, boolean) from public, anon;
grant execute on function public.owner_booking_requests(), public.owner_dashboard_stats(),
  public.admin_list_users(text), public.admin_set_role(uuid, public.user_role),
  public.admin_set_featured(uuid, boolean) to authenticated;
