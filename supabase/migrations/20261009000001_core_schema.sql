-- =====================================================================
-- Aqari Oman — المخطط الأساسي
-- العقارات → المباني → الطوابق → الغرف → الأسرّة، والحجوزات.
-- =====================================================================

create extension if not exists btree_gist;

-- ---------- الأنواع ----------
create type public.user_role      as enum ('user', 'owner', 'admin');
create type public.city           as enum ('sohar', 'muscat');
create type public.listing_kind   as enum ('rent', 'sale', 'student');
create type public.property_type  as enum ('apartment', 'studio', 'villa', 'land', 'student_housing');
create type public.price_period   as enum ('monthly', 'total');
create type public.listing_status as enum ('draft', 'published', 'archived');
create type public.bed_status     as enum ('active', 'maintenance');
create type public.booking_status as enum ('pending', 'confirmed', 'rejected', 'cancelled');

-- ---------- الملفات الشخصية ----------
create table public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  full_name        text,
  phone            text,
  role             public.user_role not null default 'user',
  preferred_locale text not null default 'ar' check (preferred_locale in ('ar', 'en')),
  created_at       timestamptz not null default now()
);

-- ---------- العقارات ----------
create table public.properties (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.profiles (id) on delete restrict,
  kind             public.listing_kind not null,
  type             public.property_type not null,
  city             public.city not null,
  district_ar      text not null,
  district_en      text not null,
  title_ar         text not null check (length(title_ar) between 3 and 120),
  title_en         text not null check (length(title_en) between 3 and 120),
  description_ar   text,
  description_en   text,
  price_omr        numeric(12, 3) not null check (price_omr >= 0),
  price_period     public.price_period not null,
  bedrooms         smallint check (bedrooms >= 0),
  area_sqm         numeric(10, 2) check (area_sqm > 0),
  cover_image_path text,             -- مسار داخل Storage bucket "property-images"
  featured         boolean not null default false,
  status           public.listing_status not null default 'draft',
  -- بيانات تجريبية؟ تُستبعد من التطبيق الحقيقي دائمًا.
  is_demo          boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- السكن الطلابي يُسعَّر شهريًا، والبيع سعر إجمالي.
  check (kind <> 'sale' or price_period = 'total'),
  check (kind = 'sale' or price_period = 'monthly')
);
create index properties_browse_idx on public.properties (city, kind, status) where not is_demo;
create index properties_owner_idx on public.properties (owner_id);

-- ---------- المباني / الطوابق / الغرف / الأسرّة ----------
create table public.buildings (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  name_ar     text not null,
  name_en     text not null,
  created_at  timestamptz not null default now()
);
create index on public.buildings (property_id);

create table public.floors (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references public.buildings (id) on delete cascade,
  level       smallint not null,           -- 0 = الأرضي
  unique (building_id, level)
);

create table public.rooms (
  id        uuid primary key default gen_random_uuid(),
  floor_id  uuid not null references public.floors (id) on delete cascade,
  code      text not null,                 -- مثل "A-101"
  -- موضع الغرفة في مخطط الطابق التفاعلي (شبكة)
  grid_x    smallint not null default 0,
  grid_y    smallint not null default 0,
  grid_w    smallint not null default 1 check (grid_w > 0),
  grid_h    smallint not null default 1 check (grid_h > 0),
  unique (floor_id, code)
);

create table public.beds (
  id                uuid primary key default gen_random_uuid(),
  room_id           uuid not null references public.rooms (id) on delete cascade,
  code              text not null,         -- مثل "1" أو "A"
  monthly_price_omr numeric(10, 3) not null check (monthly_price_omr >= 0),
  status            public.bed_status not null default 'active',
  position          smallint not null default 0,
  unique (room_id, code)
);

-- ---------- الحجوزات ----------
-- حاليًا الحجز على مستوى السرير (السكن الطلابي). end_date حصري: [start, end).
create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  bed_id      uuid not null references public.beds (id) on delete restrict,
  start_date  date not null,
  end_date    date not null,
  status      public.booking_status not null default 'pending',
  note        text check (length(note) <= 500),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  period      daterange generated always as (daterange(start_date, end_date, '[)')) stored,
  check (end_date > start_date),
  -- 🔒 القيد الأهم: لا يمكن أن يتداخل حجزان نشطان على السرير نفسه.
  constraint bookings_no_overlap exclude using gist (bed_id with =, period with &&)
    where (status in ('pending', 'confirmed'))
);
create index on public.bookings (user_id);

-- ---------- updated_at ----------
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
create trigger properties_touch before update on public.properties for each row execute function public.touch_updated_at();
create trigger bookings_touch   before update on public.bookings   for each row execute function public.touch_updated_at();

-- ---------- إنشاء profile تلقائيًا عند التسجيل ----------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
