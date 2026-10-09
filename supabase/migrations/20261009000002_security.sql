-- =====================================================================
-- الصلاحيات وسياسات RLS
-- =====================================================================

-- ---------- دوال مساعدة (security definer لتجنب تكرار RLS داخل السياسات) ----------
create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.is_owner_role() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('owner', 'admin'));
$$;

-- هل يملك المستخدم الحالي هذا العقار؟
create function public.owns_property(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.properties where id = p_property and owner_id = auth.uid());
$$;

-- هل العقار مرئي للعامة أو للمستخدم الحالي؟
create function public.can_view_property(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.properties
    where id = p_property and (status = 'published' or owner_id = auth.uid())
  ) or public.is_admin();
$$;

create function public.property_of_bed(p_bed uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.property_id from public.beds bd
  join public.rooms r on r.id = bd.room_id
  join public.floors f on f.id = r.floor_id
  join public.buildings b on b.id = f.building_id
  where bd.id = p_bed;
$$;

-- ---------- تفعيل RLS على كل الجداول ----------
alter table public.profiles   enable row level security;
alter table public.properties enable row level security;
alter table public.buildings  enable row level security;
alter table public.floors     enable row level security;
alter table public.rooms      enable row level security;
alter table public.beds       enable row level security;
alter table public.bookings   enable row level security;

-- ---------- profiles ----------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
-- المستخدم لا يستطيع تغيير دوره بنفسه: نسمح بتحديث أعمدة محددة فقط.
revoke update on public.profiles from authenticated;
grant update (full_name, phone, preferred_locale) on public.profiles to authenticated;

-- ---------- properties ----------
create policy properties_select on public.properties for select to anon, authenticated
  using (status = 'published' or owner_id = auth.uid() or public.is_admin());
create policy properties_insert on public.properties for insert to authenticated
  with check (owner_id = auth.uid() and public.is_owner_role() and not is_demo);
create policy properties_update on public.properties for update to authenticated
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());
create policy properties_delete on public.properties for delete to authenticated
  using (owner_id = auth.uid() or public.is_admin());
-- featured و is_demo تُدار من الإدارة فقط
revoke update on public.properties from authenticated;
grant update (kind, type, city, district_ar, district_en, title_ar, title_en, description_ar, description_en,
              price_omr, price_period, bedrooms, area_sqm, cover_image_path, status)
  on public.properties to authenticated;

-- ---------- buildings / floors / rooms / beds ----------
create policy buildings_select on public.buildings for select to anon, authenticated
  using (public.can_view_property(property_id));
create policy buildings_write on public.buildings for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

create policy floors_select on public.floors for select to anon, authenticated
  using (public.can_view_property((select property_id from public.buildings where id = building_id)));
create policy floors_write on public.floors for all to authenticated
  using (public.owns_property((select property_id from public.buildings where id = building_id)) or public.is_admin())
  with check (public.owns_property((select property_id from public.buildings where id = building_id)) or public.is_admin());

create function public.property_of_floor(p_floor uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.property_id from public.floors f join public.buildings b on b.id = f.building_id where f.id = p_floor;
$$;

create policy rooms_select on public.rooms for select to anon, authenticated
  using (public.can_view_property(public.property_of_floor(floor_id)));
create policy rooms_write on public.rooms for all to authenticated
  using (public.owns_property(public.property_of_floor(floor_id)) or public.is_admin())
  with check (public.owns_property(public.property_of_floor(floor_id)) or public.is_admin());

create policy beds_select on public.beds for select to anon, authenticated
  using (public.can_view_property(public.property_of_bed(id)));
create policy beds_write on public.beds for all to authenticated
  using (public.owns_property(public.property_of_bed(id)) or public.is_admin())
  with check (public.owns_property((select public.property_of_floor(r.floor_id) from public.rooms r where r.id = room_id)) or public.is_admin());

-- ---------- bookings ----------
-- يرى المستخدم حجوزاته، ويرى المالك حجوزات عقاراته.
create policy bookings_select on public.bookings for select to authenticated
  using (user_id = auth.uid() or public.owns_property(public.property_of_bed(bed_id)) or public.is_admin());
-- يُنشأ الطلب دائمًا بحالة pending، ولسرير نشط في عقار منشور.
create policy bookings_insert on public.bookings for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.beds bd join public.properties p on p.id = public.property_of_bed(bd.id)
      where bd.id = bed_id and bd.status = 'active' and p.status = 'published' and p.kind = 'student'
    )
  );
create policy bookings_update on public.bookings for update to authenticated
  using (user_id = auth.uid() or public.owns_property(public.property_of_bed(bed_id)) or public.is_admin());
revoke update on public.bookings from authenticated;
grant update (status) on public.bookings to authenticated;

-- انتقالات الحالة المسموحة:
--   صاحب الطلب: pending|confirmed → cancelled
--   مالك العقار / الإدارة: pending → confirmed|rejected، confirmed → cancelled
create function public.enforce_booking_transition() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  is_requester boolean := old.user_id = auth.uid();
  is_manager   boolean := public.owns_property(public.property_of_bed(old.bed_id)) or public.is_admin();
begin
  if new.status = old.status then return new; end if;
  if auth.uid() is null then return new; end if; -- عمليات الخادم (service_role)
  if is_manager and (
       (old.status = 'pending' and new.status in ('confirmed', 'rejected'))
    or (old.status = 'confirmed' and new.status = 'cancelled')) then
    return new;
  end if;
  if is_requester and old.status in ('pending', 'confirmed') and new.status = 'cancelled' then
    return new;
  end if;
  raise exception 'booking status change % -> % not allowed', old.status, new.status
    using errcode = 'insufficient_privilege';
end $$;
create trigger bookings_transition before update on public.bookings
  for each row execute function public.enforce_booking_transition();

-- ---------- توفر الأسرّة (عام، بدون كشف هوية الحاجزين) ----------
create function public.bed_availability(p_property uuid, p_start date, p_end date)
returns table (bed_id uuid, room_id uuid, floor_id uuid, building_id uuid, is_available boolean)
language sql stable security definer set search_path = '' as $$
  select bd.id, r.id, f.id, b.id,
         bd.status = 'active' and not exists (
           select 1 from public.bookings bk
           where bk.bed_id = bd.id and bk.status in ('pending', 'confirmed')
             and bk.period && daterange(p_start, p_end, '[)')
         )
  from public.buildings b
  join public.floors f on f.building_id = b.id
  join public.rooms r on r.floor_id = f.id
  join public.beds bd on bd.room_id = r.id
  where b.property_id = p_property and public.can_view_property(p_property) and p_end > p_start;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.bed_availability(uuid, date, date) to anon, authenticated;
grant execute on function public.is_admin(), public.is_owner_role(), public.owns_property(uuid),
  public.can_view_property(uuid), public.property_of_bed(uuid), public.property_of_floor(uuid) to anon, authenticated;

-- ---------- Storage: صور العقارات ----------
insert into storage.buckets (id, name, public) values ('property-images', 'property-images', true)
  on conflict (id) do nothing;
-- المسار: <property_id>/<file>. الرفع للمالك فقط.
create policy property_images_write on storage.objects for insert to authenticated
  with check (bucket_id = 'property-images' and public.owns_property(((storage.foldername(name))[1])::uuid));
create policy property_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'property-images' and public.owns_property(((storage.foldername(name))[1])::uuid));
