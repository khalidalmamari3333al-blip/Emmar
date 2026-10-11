-- =====================================================================
-- التسجيل والهوية والتسجيل الرسمي للعقد
--  1) الهاتف المؤكَّد برمز OTP يُنسخ من Supabase Auth إلى الملف الشخصي.
--  2) التحقق من الهوية (identity_verifications): يكتبه الخادم فقط — من مزود الهوية
--     (هدفه «ثقة» THEQA؛ حاليًا مزود تجريبي فقط) أو من مراجعة المستندات اليدوية.
--     التصفح والبحث لا يحتاجان هوية؛ الحجز وتوقيع العقد وتوثيق العقار تحتاجها.
--  3) التسجيل الرسمي لعقد الإيجار لدى البلدية: حالة منفصلة عن التوقيع في التطبيق،
--     تُحدَّث يدويًا (لا يوجد ربط آلي مع أي بلدية) ويؤكدها فريق المنصة.
--  4) إصلاح من المراجعة الأمنية: لا يستطيع المالك تمييز عقاره (featured) عند إنشائه.
-- لا تُخزَّن صور البطاقات: الهوية = الاسم الموثّق + بصمة الرقم المدني + آخر 4 أرقام.
-- =====================================================================

insert into public.platform_settings (key, value) values
  ('identity_required_for_booking', 'true'),
  ('identity_required_for_signing', 'true'),
  ('identity_required_for_listing', 'true'),
  ('identity_provider', '"mock"'),     -- mock | theqa (theqa يتطلب ربطًا معتمدًا من الوزارة)
  ('signature_provider', '"mock"'),    -- mock | theqa
  ('identity_validity_days', '365')
on conflict (key) do nothing;

-- ---------- 1) الهاتف المؤكَّد ----------
alter table public.profiles add column phone_verified_at timestamptz;

create function public.sync_auth_phone() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phone is not null and new.phone <> '' and new.phone_confirmed_at is not null then
    update public.profiles
       set phone = '+' || ltrim(new.phone, '+'), phone_verified_at = new.phone_confirmed_at
     where id = new.id;
  end if;
  return null;
end $$;
-- الاسم يرتب بعد on_auth_user_created (المشغلات تعمل أبجديًا) حتى يوجد الملف الشخصي
create trigger on_auth_user_phone_sync after insert or update of phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_auth_phone();

-- الهاتف المؤكَّد لا يُعدَّل من الملف الشخصي مباشرة (يُغيَّر عبر رمز OTP جديد فقط)
create function public.protect_verified_phone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and old.phone_verified_at is not null and new.phone is distinct from old.phone then
    new.phone := old.phone;
  end if;
  if auth.uid() is not null then new.phone_verified_at := old.phone_verified_at; end if;
  return new;
end $$;
create trigger profiles_protect_phone before update on public.profiles for each row execute function public.protect_verified_phone();

-- ---------- 2) الهوية ----------
create table public.identity_verifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  provider         text not null check (provider in ('theqa', 'mock_theqa', 'manual_document')),
  is_mock          boolean not null default false,
  level            text not null default 'basic' check (level in ('basic', 'high')),
  status           text not null default 'verified' check (status in ('verified', 'revoked')),
  verified_name    text not null check (length(verified_name) between 2 and 160),
  national_id_hash text not null check (national_id_hash ~ '^[0-9a-f]{64}$'),
  national_id_last4 text not null check (national_id_last4 ~ '^[0-9A-Za-z]{4}$'),
  provider_ref     text,
  verified_at      timestamptz not null default now(),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now()
);
create index on public.identity_verifications (user_id, verified_at desc);
-- الرقم المدني الواحد لا يُستخدم لحسابين نشطين
create unique index identity_one_account_per_id on public.identity_verifications (national_id_hash) where status = 'verified';
alter table public.identity_verifications enable row level security;
create policy identity_select on public.identity_verifications for select to authenticated using (user_id = auth.uid() or public.is_staff());
revoke insert, update, delete on public.identity_verifications from anon, authenticated;

create function public.is_identity_verified(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.identity_verifications where user_id = p_user and status = 'verified' and expires_at > now());
$$;

create function public.require_identity(p_user uuid, p_setting text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user is not null and coalesce((public.setting(p_setting) #>> '{}')::boolean, true) and not public.is_identity_verified(p_user) then
    raise exception 'identity_required' using errcode = 'ID001', hint = 'Verify your identity before this step.';
  end if;
end $$;

-- يُستدعى من دالة identity (مفتاح الخدمة) بعد نجاح التحقق لدى المزود
create function public.record_identity_verification(
  p_user uuid, p_provider text, p_name text, p_national_id text, p_ref text default null, p_level text default 'basic', p_is_mock boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  n text := upper(regexp_replace(coalesce(p_national_id, ''), '[^0-9A-Za-z]', '', 'g'));
  h text;
  days integer := coalesce((public.setting('identity_validity_days') #>> '{}')::integer, 365);
  vid uuid;
begin
  if n !~ '^[0-9A-Z]{6,20}$' then raise exception 'invalid national id' using errcode = 'check_violation'; end if;
  h := encode(sha256(convert_to(n, 'UTF8')), 'hex');
  if exists (select 1 from public.identity_verifications where national_id_hash = h and status = 'verified' and user_id <> p_user) then
    raise exception 'identity already linked to another account' using errcode = 'unique_violation';
  end if;
  update public.identity_verifications set status = 'revoked' where user_id = p_user and status = 'verified';
  insert into public.identity_verifications (user_id, provider, is_mock, level, verified_name, national_id_hash, national_id_last4, provider_ref, expires_at)
  values (p_user, p_provider, p_is_mock, coalesce(p_level, 'basic'), trim(p_name), h, right(n, 4), p_ref, now() + make_interval(days => days))
  returning id into vid;
  -- الاسم الموثّق يصبح الاسم المعروض
  update public.profiles set full_name = trim(p_name) where id = p_user;
  perform public.log_audit('identity.verified', 'identity', vid::text, jsonb_build_object('user', p_user, 'provider', p_provider, 'mock', p_is_mock));
  return vid;
end $$;

-- الحجز وتوقيع العقد وتوثيق العقار تتطلب هوية موثّقة (قابلة للضبط من الإدارة)
create function public.identity_gate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'bookings' then
    perform public.require_identity(auth.uid(), 'identity_required_for_booking');
  elsif tg_table_name = 'signatures' then
    perform public.require_identity(new.signer_id, 'identity_required_for_signing');
  elsif tg_table_name = 'verification_requests' and new.subject = 'property' then
    perform public.require_identity(auth.uid(), 'identity_required_for_listing');
  end if;
  return new;
end $$;
create trigger identity_gate_bookings before insert on public.bookings for each row execute function public.identity_gate();
create trigger identity_gate_signatures before insert on public.signatures for each row execute function public.identity_gate();
create trigger identity_gate_listing before update of status on public.verification_requests for each row
  when (new.status = 'submitted' and old.status is distinct from 'submitted') execute function public.identity_gate();

-- المسار البديل: اعتماد فريق التحقق لطلب «توثيق مؤجر» بالمستندات يسجّل هوية يدوية
create function public.identity_from_manual_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare name text; last4 text; h text;
begin
  if new.subject = 'landlord' and new.status = 'approved' and old.status is distinct from 'approved' and new.identity_hash is not null then
    select coalesce(lp.legal_name, p.full_name) into name from public.profiles p left join public.landlord_profiles lp on lp.user_id = p.id where p.id = new.submitted_by;
    if exists (select 1 from public.identity_verifications where national_id_hash = new.identity_hash and status = 'verified' and user_id <> new.submitted_by) then
      return null; -- مرتبط بحساب آخر: لا يُسجَّل
    end if;
    update public.identity_verifications set status = 'revoked' where user_id = new.submitted_by and status = 'verified';
    insert into public.identity_verifications (user_id, provider, level, verified_name, national_id_hash, national_id_last4, provider_ref, expires_at)
    values (new.submitted_by, 'manual_document', 'basic', coalesce(nullif(trim(name), ''), '—'), new.identity_hash, coalesce(new.identity_last4, '0000'), new.id::text,
            now() + make_interval(days => coalesce((public.setting('identity_validity_days') #>> '{}')::integer, 365)));
  end if;
  return null;
end $$;
create trigger verification_manual_identity after update of status on public.verification_requests
  for each row execute function public.identity_from_manual_review();

-- ---------- 3) التسجيل الرسمي لعقد الإيجار ----------
create table public.lease_registrations (
  contract_id   uuid primary key references public.contracts (id) on delete restrict,
  authority     text not null check (authority in ('muscat_municipality', 'sohar_municipality', 'other')),
  method        text not null default 'manual' check (method in ('manual', 'api')),
  status        text not null default 'not_submitted' check (status in ('not_submitted', 'preparing', 'submitted', 'registered', 'rejected')),
  reference_no  text check (length(reference_no) <= 60),
  notes         text check (length(notes) <= 1000),
  submitted_at  timestamptz,
  registered_at timestamptz,
  confirmed_by  uuid references public.profiles (id),
  updated_at    timestamptz not null default now()
);
create trigger lease_registrations_touch before update on public.lease_registrations for each row execute function public.touch_updated_at();
alter table public.lease_registrations enable row level security;
create policy lease_select on public.lease_registrations for select to authenticated using (public.is_contract_party(contract_id));
revoke insert, update, delete on public.lease_registrations from anon, authenticated;

create function public.open_lease_registration() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    insert into public.lease_registrations (contract_id, authority)
    select new.id, case p.city::text when 'muscat' then 'muscat_municipality' when 'sohar' then 'sohar_municipality' else 'other' end
      from public.properties p where p.id = new.property_id
    on conflict do nothing;
  end if;
  return null;
end $$;
create trigger contracts_lease_registration after update of status on public.contracts for each row execute function public.open_lease_registration();

-- المالك: يجهّز ثم يقدّم (برقم المرجع). «مسجّل» أو «مرفوض» لا يعتمدهما إلا فريق المنصة بعد التحقق من المرجع.
create function public.update_lease_registration(p_contract uuid, p_status text, p_reference text default null, p_notes text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; r public.lease_registrations; admin boolean := public.is_admin();
begin
  select * into c from public.contracts where id = p_contract;
  select * into r from public.lease_registrations where contract_id = p_contract for update;
  if r.contract_id is null or not (auth.uid() = c.landlord_id or admin) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if p_status in ('registered', 'rejected') and not admin then raise exception 'only the platform confirms registration' using errcode = 'insufficient_privilege'; end if;
  if not (
    (r.status in ('not_submitted', 'rejected') and p_status = 'preparing') or
    (r.status in ('not_submitted', 'preparing', 'rejected') and p_status = 'submitted') or
    (r.status = 'submitted' and p_status in ('registered', 'rejected'))
  ) then raise exception 'invalid transition % → %', r.status, p_status using errcode = 'check_violation'; end if;
  if p_status = 'submitted' and coalesce(trim(p_reference), trim(r.reference_no), '') = '' then
    raise exception 'a municipality reference number is required' using errcode = 'check_violation';
  end if;
  update public.lease_registrations set
    status = p_status,
    reference_no = coalesce(nullif(trim(p_reference), ''), reference_no),
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    submitted_at = case when p_status = 'submitted' then now() else submitted_at end,
    registered_at = case when p_status = 'registered' then now() else registered_at end,
    confirmed_by = case when p_status in ('registered', 'rejected') then auth.uid() else confirmed_by end
  where contract_id = p_contract;
  perform public.log_audit('lease.' || p_status, 'contract', p_contract::text, jsonb_build_object('reference', p_reference));
end $$;

-- ---------- 4) إصلاح: featured للإدارة فقط حتى عند الإنشاء ----------
create function public.properties_featured_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_admin() then new.featured := false; end if;
  return new;
end $$;
create trigger properties_featured_on_insert before insert on public.properties for each row execute function public.properties_featured_guard();

-- إصلاح: render_contract داخلية فقط
revoke execute on function public.render_contract(uuid, text, integer) from authenticated;

-- ---------- الصلاحيات ----------
revoke execute on function public.sync_auth_phone(), public.protect_verified_phone(), public.require_identity(uuid, text),
  public.record_identity_verification(uuid, text, text, text, text, text, boolean), public.identity_gate(), public.identity_from_manual_review(),
  public.open_lease_registration(), public.properties_featured_guard() from public, anon, authenticated;
-- is_identity_verified داخلية (لا يُسأل بها عن مستخدمين آخرين)؛ المستخدم يقرأ صفه عبر RLS
revoke execute on function public.is_identity_verified(uuid) from public, anon, authenticated;
revoke execute on function public.update_lease_registration(uuid, text, text, text) from public, anon;
grant execute on function public.update_lease_registration(uuid, text, text, text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.record_identity_verification(uuid, text, text, text, text, text, boolean) to service_role;
  end if;
end $$;
