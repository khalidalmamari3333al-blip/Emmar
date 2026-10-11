-- =====================================================================
-- المرحلة 1 (الأساس الموسّع): ملفات المؤجر والمستأجر، سجل التدقيق،
-- أنواع عقارات قابلة للتوسعة، مواصفات وتكاليف وشروط، وصور متعددة.
-- =====================================================================

-- ---------- صلاحيات مساعدة ----------
create function public.has_role(p_roles public.user_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = any (p_roles));
$$;
create function public.is_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(array['admin', 'verifier']::public.user_role[]);
$$;
revoke execute on function public.has_role(public.user_role[]), public.is_staff() from public;
grant execute on function public.has_role(public.user_role[]), public.is_staff() to anon, authenticated;

-- ---------- سجل التدقيق ----------
-- لا يُكتب إلا من الخادم (مشغلات/دوال)، ولا يُعدَّل أو يُحذف من التطبيق.
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor_id   uuid,                 -- null = عملية خادم/نظام
  action     text not null,        -- مثل: role.changed, booking.status, property.status
  entity     text not null,
  entity_id  text not null,
  details    jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
alter table public.audit_logs enable row level security;
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.audit_logs from anon, authenticated;

create function public.log_audit(p_action text, p_entity text, p_entity_id text, p_details jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'));
$$;
revoke execute on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

create function public.audit_profile_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role then
    perform public.log_audit('role.changed', 'profile', new.id::text, jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  return null;
end $$;
create trigger profiles_audit after update of role on public.profiles for each row execute function public.audit_profile_role();

create function public.audit_booking_status() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('booking.created', 'booking', new.id::text, jsonb_build_object('bed_id', new.bed_id, 'start', new.start_date, 'end', new.end_date));
  elsif new.status is distinct from old.status then
    perform public.log_audit('booking.status', 'booking', new.id::text, jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return null;
end $$;
create trigger bookings_audit after insert or update of status on public.bookings for each row execute function public.audit_booking_status();

create function public.audit_property() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_audit('property.created', 'property', new.id::text, jsonb_build_object('owner_id', new.owner_id));
  else
    if new.status is distinct from old.status then
      perform public.log_audit('property.status', 'property', new.id::text, jsonb_build_object('from', old.status, 'to', new.status));
    end if;
    if new.featured is distinct from old.featured then
      perform public.log_audit('property.featured', 'property', new.id::text, jsonb_build_object('to', new.featured));
    end if;
  end if;
  return null;
end $$;
create trigger properties_audit after insert or update of status, featured on public.properties for each row execute function public.audit_property();

-- ---------- ملفات المؤجر والمستأجر (أقل قدر ضروري من البيانات) ----------
create table public.landlord_profiles (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  account_type text not null default 'individual' check (account_type in ('individual', 'company')),
  legal_name   text check (length(legal_name) <= 160),
  company_cr   text check (length(company_cr) <= 40),   -- رقم السجل التجاري للشركات
  -- حالة التوثيق يديرها فريق التحقق فقط (المرحلة 2)
  verification_status text not null default 'unverified',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (account_type = 'individual' or company_cr is not null)
);
create table public.tenant_profiles (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  occupation              text check (occupation in ('student', 'employee', 'other')),
  institution             text check (length(institution) <= 120), -- الجامعة أو جهة العمل
  emergency_contact_name  text check (length(emergency_contact_name) <= 120),
  emergency_contact_phone text check (length(emergency_contact_phone) <= 30),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create trigger landlord_profiles_touch before update on public.landlord_profiles for each row execute function public.touch_updated_at();
create trigger tenant_profiles_touch before update on public.tenant_profiles for each row execute function public.touch_updated_at();

alter table public.landlord_profiles enable row level security;
alter table public.tenant_profiles enable row level security;
create policy landlord_own on public.landlord_profiles for select to authenticated using (user_id = auth.uid() or public.is_staff());
create policy landlord_insert on public.landlord_profiles for insert to authenticated with check (user_id = auth.uid() and verification_status = 'unverified');
create policy landlord_update on public.landlord_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.landlord_profiles from authenticated;
grant update (account_type, legal_name, company_cr) on public.landlord_profiles to authenticated;

create policy tenant_own on public.tenant_profiles for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy tenant_insert on public.tenant_profiles for insert to authenticated with check (user_id = auth.uid());
create policy tenant_update on public.tenant_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- أنواع العقارات: جدول قابل للتوسعة بدل enum ثابت ----------
create table public.property_types (
  code          text primary key check (code ~ '^[a-z_]{2,30}$'),
  name_ar       text not null,
  name_en       text not null,
  allowed_kinds public.listing_kind[] not null,     -- أي أنواع عرض يقبلها
  per_bed       boolean not null default false,     -- يُؤجَّر بالسرير؟
  active        boolean not null default true,
  sort_order    smallint not null default 0
);
insert into public.property_types (code, name_ar, name_en, allowed_kinds, per_bed, sort_order) values
  ('apartment',       'شقة',        'Apartment',        '{rent,sale}',    false, 1),
  ('studio',          'استوديو',    'Studio',           '{rent}',         false, 2),
  ('room',            'غرفة',       'Room',             '{rent}',         false, 3),
  ('villa',           'فيلا',       'Villa',            '{rent,sale}',    false, 4),
  ('house',           'بيت',        'House',            '{rent,sale}',    false, 5),
  ('building',        'مبنى سكني',  'Residential building', '{rent,sale}', false, 6),
  ('land',            'أرض',        'Land',             '{sale}',         false, 7),
  ('student_housing', 'سكن طلابي',  'Student housing',  '{student}',      true,  8);
alter table public.property_types enable row level security;
create policy property_types_read on public.property_types for select to anon, authenticated using (true);
revoke insert, update, delete on public.property_types from anon, authenticated;

-- العمود يتحول إلى نص مرتبط بالجدول (البيانات الحالية تبقى كما هي)
alter table public.properties alter column type type text using type::text;
alter table public.properties add constraint properties_type_fk foreign key (type) references public.property_types (code);

create function public.check_property_type_kind() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.property_types t where t.code = new.type and new.kind = any (t.allowed_kinds) and t.active) then
    raise exception 'property type % does not allow listing kind %', new.type, new.kind using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger properties_type_kind before insert or update of type, kind on public.properties for each row execute function public.check_property_type_kind();

-- ---------- المواصفات والتكاليف والشروط ----------
create function public.valid_codes(p_values text[], p_allowed text[]) returns boolean
language sql immutable as $$ select coalesce(p_values <@ p_allowed, true) $$;

alter table public.properties
  add column furnished          text check (furnished in ('unfurnished', 'semi', 'furnished')),
  add column amenities          text[] not null default '{}',
  add column utilities_included text[] not null default '{}',
  add column near_landmarks     text[] not null default '{}',
  add column deposit_omr        numeric(10, 3) check (deposit_omr >= 0),
  add column fees_omr           numeric(10, 3) check (fees_omr >= 0),        -- رسوم لمرة واحدة
  add column rules_ar           text check (length(rules_ar) <= 2000),
  add column rules_en           text check (length(rules_en) <= 2000),
  add column cancellation_policy text not null default 'moderate' check (cancellation_policy in ('flexible', 'moderate', 'strict')),
  add constraint properties_amenities_valid check (public.valid_codes(amenities, array['wifi','parking','ac','kitchen','laundry','gym','pool','security','elevator','cleaning','study_room','prayer_room'])),
  add constraint properties_utilities_valid check (public.valid_codes(utilities_included, array['electricity','water','internet','gas'])),
  add constraint properties_landmarks_valid check (public.valid_codes(near_landmarks, array['sohar_university','squ','utas_sohar','utas_muscat','muscat_university','sohar_port','city_center','beach']));

create index properties_amenities_idx on public.properties using gin (amenities);
create index properties_landmarks_idx on public.properties using gin (near_landmarks);

-- السماح للمالك بتعديل الأعمدة الجديدة (featured والتوثيق يبقيان للإدارة)
grant update (furnished, amenities, utilities_included, near_landmarks, deposit_omr, fees_omr, rules_ar, rules_en, cancellation_policy)
  on public.properties to authenticated;

-- ---------- صور متعددة ----------
create table public.property_images (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  path        text not null check (path ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,120}$'),
  mime_type   text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes  integer not null check (size_bytes > 0 and size_bytes <= 5 * 1024 * 1024),
  width       integer check (width > 0),
  height      integer check (height > 0),
  position    smallint not null default 0,
  is_cover    boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (property_id, path),
  -- المسار يجب أن يكون داخل مجلد العقار نفسه
  check (split_part(path, '/', 1) = property_id::text)
);
create unique index property_images_one_cover on public.property_images (property_id) where is_cover;
create index on public.property_images (property_id, position);
alter table public.property_images enable row level security;
create policy property_images_select on public.property_images for select to anon, authenticated using (public.can_view_property(property_id));
create policy property_images_write on public.property_images for all to authenticated
  using (public.owns_property(property_id) or public.is_admin())
  with check (public.owns_property(property_id) or public.is_admin());

-- صورة الغلاف تبقى متزامنة مع properties.cover_image_path (توافق مع الشاشات الحالية)
create function public.sync_cover_image() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid := coalesce(new.property_id, old.property_id);
begin
  update public.properties p set cover_image_path = (
    select i.path from public.property_images i where i.property_id = pid
    order by i.is_cover desc, i.position, i.created_at limit 1)
  where p.id = pid;
  return null;
end $$;
create trigger property_images_cover after insert or update or delete on public.property_images
  for each row execute function public.sync_cover_image();

-- تعيين صورة غلاف واحدة ذريًا
create function public.set_cover_image(p_image uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pid uuid;
begin
  select property_id into pid from public.property_images where id = p_image;
  if pid is null or not (public.owns_property(pid) or public.is_admin()) then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  update public.property_images set is_cover = false where property_id = pid and is_cover;
  update public.property_images set is_cover = true where id = p_image;
end $$;
revoke execute on function public.set_cover_image(uuid) from public, anon;
grant execute on function public.set_cover_image(uuid) to authenticated;

-- حدود الملفات على مستوى التخزين (إن كانت الأعمدة متاحة في Supabase)
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'] where id = 'property-images'$q$;
  end if;
end $$;

-- ---------- الإدارة: الأدوار الجديدة وسجل التدقيق ----------
create function public.admin_audit_log(p_entity text default null, p_limit integer default 100)
returns table (id bigint, actor_id uuid, actor_name text, action text, entity text, entity_id text, details jsonb, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = 'insufficient_privilege'; end if;
  return query
    select a.id, a.actor_id, pr.full_name, a.action, a.entity, a.entity_id, a.details, a.created_at
    from public.audit_logs a left join public.profiles pr on pr.id = a.actor_id
    where p_entity is null or a.entity = p_entity
    order by a.created_at desc, a.id desc
    limit least(greatest(p_limit, 1), 500);
end $$;
revoke execute on function public.admin_audit_log(text, integer) from public, anon;
grant execute on function public.admin_audit_log(text, integer) to authenticated;
