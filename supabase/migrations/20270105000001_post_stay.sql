-- =====================================================================
-- المرحلة 5: ما بعد السكن
-- طلبات الصيانة، والبلاغات عن الإعلانات، والتقييمات.
-- 🔒 التقييم لا يُقبل إلا من مستأجر له حجز مؤكد انتهت مدته فعلًا — تقييم واحد لكل حجز.
-- =====================================================================

create function public.is_support() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_role(array['admin', 'support']::public.user_role[]);
$$;

-- ---------- الصيانة ----------
create table public.maintenance_requests (
  id           uuid primary key default gen_random_uuid(),
  booking_id   uuid not null references public.bookings (id) on delete restrict,
  property_id  uuid not null references public.properties (id) on delete restrict,
  tenant_id    uuid not null references public.profiles (id),
  landlord_id  uuid not null references public.profiles (id),
  category     text not null check (category in ('plumbing', 'electrical', 'ac', 'appliance', 'furniture', 'cleaning', 'internet', 'other')),
  priority     text not null default 'normal' check (priority in ('low', 'normal', 'urgent')),
  title        text not null check (length(trim(title)) between 3 and 120),
  description  text check (length(description) <= 2000),
  status       text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
  landlord_note text check (length(landlord_note) <= 1000),
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index on public.maintenance_requests (landlord_id, status);
create index on public.maintenance_requests (tenant_id);
create trigger maintenance_touch before update on public.maintenance_requests for each row execute function public.touch_updated_at();
alter table public.maintenance_requests enable row level security;
create policy maint_select on public.maintenance_requests for select to authenticated
  using (auth.uid() in (tenant_id, landlord_id) or public.is_support());
revoke insert, update, delete on public.maintenance_requests from anon, authenticated;

create function public.open_maintenance(p_booking uuid, p_category text, p_priority text, p_title text, p_description text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare bk public.bookings; pid uuid; owner uuid; mid uuid;
begin
  select * into bk from public.bookings where id = p_booking;
  if bk.id is null or bk.user_id <> auth.uid() then raise exception 'not your booking' using errcode = 'insufficient_privilege'; end if;
  -- أثناء الإقامة (أو قبلها مباشرة) وحتى 14 يومًا بعد انتهائها
  if bk.status <> 'confirmed' or current_date > bk.end_date + 14 then
    raise exception 'maintenance is only for an active confirmed stay' using errcode = 'check_violation';
  end if;
  pid := public.property_of_bed(bk.bed_id);
  select owner_id into owner from public.properties where id = pid;
  insert into public.maintenance_requests (booking_id, property_id, tenant_id, landlord_id, category, priority, title, description)
  values (p_booking, pid, bk.user_id, owner, p_category, coalesce(p_priority, 'normal'), trim(p_title), nullif(trim(p_description), ''))
  returning id into mid;
  perform public.log_audit('maintenance.opened', 'maintenance', mid::text, jsonb_build_object('priority', p_priority, 'category', p_category));
  return mid;
end $$;

-- انتقالات الحالة: المالك يبدأ ويحل؛ المستأجر يلغي المفتوح أو يغلق المحلول (أو يعيد فتحه)
create function public.update_maintenance(p_request uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.maintenance_requests; ok boolean := false;
begin
  select * into m from public.maintenance_requests where id = p_request for update;
  if m.id is null or auth.uid() not in (m.tenant_id, m.landlord_id) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if auth.uid() = m.landlord_id then
    ok := (m.status = 'open' and p_status in ('in_progress', 'resolved')) or (m.status = 'in_progress' and p_status = 'resolved');
  end if;
  if auth.uid() = m.tenant_id then
    ok := ok or (m.status = 'open' and p_status = 'cancelled') or (m.status = 'resolved' and p_status in ('closed', 'open'));
  end if;
  if not ok then raise exception 'invalid transition % → %', m.status, p_status using errcode = 'check_violation'; end if;
  update public.maintenance_requests set
    status = p_status,
    landlord_note = case when auth.uid() = m.landlord_id and nullif(trim(p_note), '') is not null then trim(p_note) else landlord_note end,
    resolved_at = case when p_status = 'resolved' then now() when p_status = 'open' then null else resolved_at end
  where id = p_request;
  perform public.log_audit('maintenance.status', 'maintenance', p_request::text, jsonb_build_object('from', m.status, 'to', p_status));
end $$;

-- ---------- البلاغات عن الإعلانات ----------
create table public.property_reports (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  reporter_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  reason      text not null check (reason in ('fake_listing', 'wrong_info', 'fraud', 'unavailable', 'inappropriate', 'other')),
  details     text check (length(details) <= 1000),
  status      text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  admin_note  text check (length(admin_note) <= 1000),
  handled_by  uuid references public.profiles (id),
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
-- بلاغ مفتوح واحد لكل مستخدم على كل إعلان (يمنع الإغراق)
create unique index property_reports_one_open on public.property_reports (property_id, reporter_id) where status = 'open';
alter table public.property_reports enable row level security;
create policy reports_select on public.property_reports for select to authenticated using (reporter_id = auth.uid() or public.is_support());
create policy reports_insert on public.property_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open' and admin_note is null and handled_by is null and public.can_view_property(property_id));
revoke update, delete on public.property_reports from anon, authenticated;

create function public.handle_report(p_report uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_support() then raise exception 'support only' using errcode = 'insufficient_privilege'; end if;
  if p_status not in ('resolved', 'dismissed') then raise exception 'invalid status' using errcode = 'check_violation'; end if;
  update public.property_reports set status = p_status, admin_note = nullif(trim(p_note), ''), handled_by = auth.uid(), handled_at = now()
   where id = p_report and status = 'open';
  if not found then raise exception 'report is not open' using errcode = 'check_violation'; end if;
  perform public.log_audit('report.' || p_status, 'report', p_report::text, jsonb_build_object('note', p_note));
end $$;

-- ---------- التقييمات ----------
create table public.reviews (
  id             uuid primary key default gen_random_uuid(),
  booking_id     uuid not null unique references public.bookings (id) on delete restrict,
  property_id    uuid not null references public.properties (id) on delete cascade,
  tenant_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  rating         smallint not null check (rating between 1 and 5),
  comment        text check (length(comment) <= 1000),
  landlord_reply text check (length(landlord_reply) <= 1000),
  replied_at     timestamptz,
  created_at     timestamptz not null default now()
);
create index on public.reviews (property_id, created_at desc);
alter table public.reviews enable row level security;
create policy reviews_select on public.reviews for select to authenticated
  using (tenant_id = auth.uid() or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = auth.uid()) or public.is_admin());
create policy reviews_insert on public.reviews for insert to authenticated
  with check (tenant_id = auth.uid() and landlord_reply is null and replied_at is null);
revoke update, delete on public.reviews from anon, authenticated;

-- 🔒 قيد قاعدة البيانات: التقييم فقط لإقامة مؤكدة انتهت، ولنفس العقار
create function public.check_review_eligibility() returns trigger
language plpgsql security definer set search_path = '' as $$
declare bk public.bookings;
begin
  select * into bk from public.bookings where id = new.booking_id;
  if bk.id is null or bk.user_id <> new.tenant_id then
    raise exception 'review_not_allowed: not your booking' using errcode = 'check_violation';
  end if;
  if bk.status <> 'confirmed' or bk.end_date > current_date then
    raise exception 'review_not_allowed: the stay has not been completed' using errcode = 'check_violation';
  end if;
  new.property_id := public.property_of_bed(bk.bed_id);
  return new;
end $$;
create trigger reviews_eligibility before insert on public.reviews for each row execute function public.check_review_eligibility();

-- 🔒 الإقامة المؤكدة المنتهية نهائية: لا تُلغى بعد انتهائها (تحمي ارتباط التقييم والدفعات بإقامة حقيقية)
create function public.bookings_completed_final() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and old.status = 'confirmed' and old.end_date <= current_date and new.status is distinct from old.status then
    raise exception 'a completed stay cannot be changed' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger bookings_completed_final before update of status on public.bookings for each row execute function public.bookings_completed_final();

create function public.reply_review(p_review uuid, p_reply text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(trim(p_reply), '') = '' then raise exception 'reply is empty' using errcode = 'check_violation'; end if;
  update public.reviews r set landlord_reply = trim(p_reply), replied_at = now()
   where r.id = p_review and r.landlord_reply is null
     and exists (select 1 from public.properties p where p.id = r.property_id and p.owner_id = auth.uid());
  if not found then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
end $$;

-- التقييمات العامة لعقار منشور: الاسم الأول فقط، بلا معرّفات
create function public.property_reviews(p_property uuid)
returns table (id uuid, rating smallint, comment text, reviewer text, stay_end date, landlord_reply text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select r.id, r.rating, r.comment, coalesce(nullif(split_part(trim(pr.full_name), ' ', 1), ''), '—'), bk.end_date, r.landlord_reply, r.created_at
  from public.reviews r
  join public.bookings bk on bk.id = r.booking_id
  left join public.profiles pr on pr.id = r.tenant_id
  where r.property_id = p_property and public.can_view_property(p_property)
  order by r.created_at desc
  limit 50;
$$;

revoke execute on function public.is_support(), public.open_maintenance(uuid, text, text, text, text), public.update_maintenance(uuid, text, text),
  public.handle_report(uuid, text, text), public.check_review_eligibility(), public.bookings_completed_final(), public.reply_review(uuid, text), public.property_reviews(uuid) from public;
grant execute on function public.is_support(), public.open_maintenance(uuid, text, text, text, text), public.update_maintenance(uuid, text, text),
  public.handle_report(uuid, text, text), public.reply_review(uuid, text) to authenticated;
grant execute on function public.property_reviews(uuid) to anon, authenticated;
