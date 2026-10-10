-- =====================================================================
-- المرحلة 3: العقود والتوقيع الإلكتروني
-- عقد لكل حجز مؤكد، بإصدارات غير قابلة للتعديل وبصمة SHA-256 لكل إصدار،
-- وتوقيع بالترتيب (المستأجر ثم المالك)، ومنع أي تعديل بعد الاكتمال.
--
-- ⚠️ مزود التوقيع تجريبي (mock_sign): يسجّل موافقة الطرف على نص محدد ببصمته،
--    لكنه ليس توقيعًا إلكترونيًا قانونيًا معتمدًا. الربط بمزود معتمد يأتي لاحقًا.
-- ⚠️ القالب نموذج تجريبي وليس صيغة قانونية معتمدة.
-- =====================================================================

create table public.contract_templates (
  code      text not null,
  version   integer not null,
  title_ar  text not null,
  title_en  text not null,
  body_ar   text not null,
  body_en   text not null,
  active    boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (code, version)
);
alter table public.contract_templates enable row level security;
create policy ctpl_read on public.contract_templates for select to authenticated using (true);
create policy ctpl_admin on public.contract_templates for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.contract_templates (code, version, title_ar, title_en, body_ar, body_en) values (
  'student_bed', 1,
  'عقد سكن طلابي (نموذج تجريبي)', 'Student housing agreement (sample template)',
  $ar$تنبيه: هذا نموذج تجريبي وليس صيغة قانونية معتمدة.

الطرف الأول (المؤجر): {{landlord_name}}
الطرف الثاني (المستأجر): {{tenant_name}}

العقار: {{property_title_ar}} — {{city_ar}}، {{district_ar}}
السرير: {{bed_label}}
مدة السكن: من {{start_date}} إلى {{end_date}} ({{months}} شهر)
الإيجار الشهري: {{monthly_price}} ر.ع
مبلغ التأمين: {{deposit}} ر.ع
سياسة الإلغاء: {{cancellation_ar}}

الشروط:
{{rules_ar}}

مرجع الحجز: {{booking_id}}$ar$,
  $en$Notice: this is a sample template, not an approved legal form.

First party (landlord): {{landlord_name}}
Second party (tenant): {{tenant_name}}

Property: {{property_title_en}} — {{city_en}}, {{district_en}}
Bed: {{bed_label}}
Term: from {{start_date}} to {{end_date}} ({{months}} months)
Monthly rent: {{monthly_price}} OMR
Security deposit: {{deposit}} OMR
Cancellation policy: {{cancellation_en}}

Terms:
{{rules_en}}

Booking reference: {{booking_id}}$en$
);

create table public.contracts (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings (id) on delete restrict,
  property_id     uuid not null references public.properties (id) on delete restrict,
  landlord_id     uuid not null references public.profiles (id),
  tenant_id       uuid not null references public.profiles (id),
  template_code   text not null,
  template_version integer not null,
  status          text not null default 'pending_tenant'
    check (status in ('pending_tenant', 'pending_landlord', 'completed', 'cancelled')),
  current_version integer not null default 1,
  final_sha256    text check (final_sha256 ~ '^[0-9a-f]{64}$'),
  completed_at    timestamptz,
  cancelled_reason text check (length(cancelled_reason) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (template_code, template_version) references public.contract_templates (code, version),
  check ((status = 'completed') = (final_sha256 is not null and completed_at is not null))
);
create trigger contracts_touch before update on public.contracts for each row execute function public.touch_updated_at();

create table public.contract_versions (
  contract_id uuid not null references public.contracts (id) on delete restrict,
  version_no  integer not null,
  body_ar     text not null,
  body_en     text not null,
  -- البصمة على النص القانوني الكامل: body_ar + فاصل + body_en (UTF-8)
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  note        text check (length(note) <= 500),
  created_by  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  primary key (contract_id, version_no)
);

create table public.signatures (
  id            bigint generated always as identity primary key,
  contract_id   uuid not null references public.contracts (id) on delete restrict,
  version_no    integer not null,
  signer_id     uuid not null references public.profiles (id),
  role          text not null check (role in ('tenant', 'landlord')),
  provider      text not null default 'mock_sign',
  is_mock       boolean not null default true,
  signed_sha256 text not null check (signed_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at     timestamptz not null default now(),
  unique (contract_id, version_no, role),
  foreign key (contract_id, version_no) references public.contract_versions (contract_id, version_no)
);

create function public.contract_body_sha(p_ar text, p_en text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p_ar || E'\n\n---\n\n' || p_en, 'UTF8')), 'hex');
$$;

create function public.is_contract_party(p_contract uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.contracts where id = p_contract and auth.uid() in (landlord_id, tenant_id)) or public.is_admin();
$$;

alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.signatures enable row level security;
create policy contracts_select on public.contracts for select to authenticated using (auth.uid() in (landlord_id, tenant_id) or public.is_admin());
create policy cver_select on public.contract_versions for select to authenticated using (public.is_contract_party(contract_id));
create policy csig_select on public.signatures for select to authenticated using (public.is_contract_party(contract_id));
-- لا كتابة مباشرة لأي عميل: كل شيء عبر الدوال
revoke insert, update, delete on public.contracts, public.contract_versions, public.signatures from anon, authenticated;

-- 🔒 الإصدارات والتواقيع لا تُعدَّل ولا تُحذف أبدًا، والعقد المكتمل مجمَّد (حتى لمالك قاعدة البيانات عبر الدوال)
create function public.contracts_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_table_name in ('contract_versions', 'signatures') then
    raise exception '% rows are immutable', tg_table_name using errcode = 'insufficient_privilege';
  end if;
  if old.status in ('completed', 'cancelled') then
    raise exception 'contract is %; it cannot be changed', old.status using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'DELETE' then
    raise exception 'contracts cannot be deleted' using errcode = 'insufficient_privilege';
  end if;
  return new;
end $$;
create trigger contract_versions_immutable before update or delete on public.contract_versions for each row execute function public.contracts_immutable();
create trigger signatures_immutable before update or delete on public.signatures for each row execute function public.contracts_immutable();
create trigger contracts_frozen before update or delete on public.contracts for each row execute function public.contracts_immutable();

-- يملأ القالب من بيانات الحجز الحقيقية
create function public.render_contract(p_booking uuid, p_code text, p_version integer, out body_ar text, out body_en text)
language plpgsql stable security definer set search_path = '' as $$
declare
  t public.contract_templates;
  b record;
  vars jsonb;
  k text;
begin
  select * into t from public.contract_templates where code = p_code and version = p_version;
  select bk.id, bk.start_date, bk.end_date, bd.code as bed_code, bd.monthly_price_omr, r.code as room_code,
         p.title_ar, p.title_en, p.city::text as city, p.district_ar, p.district_en, p.deposit_omr, p.cancellation_policy, p.rules_ar, p.rules_en,
         coalesce(lp.legal_name, op.full_name, '—') as landlord_name, coalesce(tp.full_name, '—') as tenant_name
    into b
    from public.bookings bk
    join public.beds bd on bd.id = bk.bed_id
    join public.rooms r on r.id = bd.room_id
    join public.properties p on p.id = public.property_of_bed(bk.bed_id)
    join public.profiles op on op.id = p.owner_id
    left join public.landlord_profiles lp on lp.user_id = p.owner_id
    join public.profiles tp on tp.id = bk.user_id
   where bk.id = p_booking;
  vars := jsonb_build_object(
    'landlord_name', b.landlord_name, 'tenant_name', b.tenant_name,
    'property_title_ar', b.title_ar, 'property_title_en', b.title_en,
    'city_ar', case b.city when 'sohar' then 'صحار' else 'مسقط' end, 'city_en', case b.city when 'sohar' then 'Sohar' else 'Muscat' end,
    'district_ar', b.district_ar, 'district_en', b.district_en,
    'bed_label', b.room_code || '-' || b.bed_code,
    'start_date', to_char(b.start_date, 'YYYY-MM-DD'), 'end_date', to_char(b.end_date, 'YYYY-MM-DD'),
    'months', ((extract(year from age(b.end_date, b.start_date)) * 12) + extract(month from age(b.end_date, b.start_date)))::int::text,
    'monthly_price', trim(to_char(b.monthly_price_omr, 'FM999999990.###')),
    'deposit', coalesce(trim(to_char(b.deposit_omr, 'FM999999990.###')), '0'),
    'cancellation_ar', case b.cancellation_policy when 'flexible' then 'مرنة' when 'strict' then 'صارمة' else 'متوسطة' end,
    'cancellation_en', case b.cancellation_policy when 'flexible' then 'Flexible' when 'strict' then 'Strict' else 'Moderate' end,
    'rules_ar', coalesce(nullif(b.rules_ar, ''), '—'), 'rules_en', coalesce(nullif(b.rules_en, ''), '—'),
    'booking_id', b.id::text);
  body_ar := t.body_ar; body_en := t.body_en;
  for k in select jsonb_object_keys(vars) loop
    body_ar := replace(body_ar, '{{' || k || '}}', vars ->> k);
    body_en := replace(body_en, '{{' || k || '}}', vars ->> k);
  end loop;
end $$;

create function public.create_contract(p_booking uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings;
  pid uuid;
  owner uuid;
  cid uuid;
  tpl public.contract_templates;
  body record;
begin
  select * into bk from public.bookings where id = p_booking;
  pid := public.property_of_bed(bk.bed_id);
  select owner_id into owner from public.properties where id = pid;
  if bk.id is null or owner is distinct from auth.uid() then
    raise exception 'only the landlord can create the contract' using errcode = 'insufficient_privilege';
  end if;
  if bk.status <> 'confirmed' then
    raise exception 'booking must be confirmed' using errcode = 'check_violation';
  end if;
  select * into tpl from public.contract_templates where code = 'student_bed' and active order by version desc limit 1;
  select * into body from public.render_contract(p_booking, tpl.code, tpl.version);
  insert into public.contracts (booking_id, property_id, landlord_id, tenant_id, template_code, template_version)
  values (p_booking, pid, owner, bk.user_id, tpl.code, tpl.version) returning id into cid;
  insert into public.contract_versions (contract_id, version_no, body_ar, body_en, sha256, created_by)
  values (cid, 1, body.body_ar, body.body_en, public.contract_body_sha(body.body_ar, body.body_en), auth.uid());
  perform public.log_audit('contract.created', 'contract', cid::text, jsonb_build_object('booking', p_booking));
  return cid;
end $$;

-- إصدار جديد (مثلًا بعد تحديث بيانات العقار) — مسموح فقط قبل أي توقيع
create function public.revise_contract(p_contract uuid, p_note text default null) returns integer
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; body record; n integer;
begin
  select * into c from public.contracts where id = p_contract for update;
  if c.id is null or c.landlord_id <> auth.uid() then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if exists (select 1 from public.signatures where contract_id = p_contract and version_no = c.current_version) then
    raise exception 'contract already signed; it cannot be revised' using errcode = 'check_violation';
  end if;
  select * into body from public.render_contract(c.booking_id, c.template_code, c.template_version);
  if public.contract_body_sha(body.body_ar, body.body_en) = (select sha256 from public.contract_versions where contract_id = p_contract and version_no = c.current_version) then
    raise exception 'nothing changed since the current version' using errcode = 'check_violation';
  end if;
  n := c.current_version + 1;
  insert into public.contract_versions (contract_id, version_no, body_ar, body_en, sha256, note, created_by)
  values (p_contract, n, body.body_ar, body.body_en, public.contract_body_sha(body.body_ar, body.body_en), nullif(trim(p_note), ''), auth.uid());
  update public.contracts set current_version = n where id = p_contract;
  perform public.log_audit('contract.revised', 'contract', p_contract::text, jsonb_build_object('version', n));
  return n;
end $$;

-- ⚠️ توقيع تجريبي: يجب أن يرسل الموقّع بصمة النص الذي رآه، وتطابق الإصدار الحالي
create function public.sign_contract(p_contract uuid, p_sha256 text) returns text
language plpgsql security definer set search_path = '' as $$
declare c public.contracts; v public.contract_versions; r text;
begin
  select * into c from public.contracts where id = p_contract for update;
  if c.id is null or auth.uid() not in (c.landlord_id, c.tenant_id) then raise exception 'not a party to this contract' using errcode = 'insufficient_privilege'; end if;
  r := case when auth.uid() = c.tenant_id then 'tenant' else 'landlord' end;
  if c.status not in ('pending_tenant', 'pending_landlord') then raise exception 'contract is not open for signing' using errcode = 'check_violation'; end if;
  if (r = 'tenant' and c.status <> 'pending_tenant') or (r = 'landlord' and c.status <> 'pending_landlord') then
    raise exception 'not your turn to sign' using errcode = 'check_violation';
  end if;
  select * into v from public.contract_versions where contract_id = p_contract and version_no = c.current_version;
  if p_sha256 is distinct from v.sha256 then
    raise exception 'document fingerprint mismatch' using errcode = 'check_violation';
  end if;
  insert into public.signatures (contract_id, version_no, signer_id, role, signed_sha256) values (p_contract, v.version_no, auth.uid(), r, p_sha256);
  if r = 'tenant' then
    update public.contracts set status = 'pending_landlord' where id = p_contract;
  else
    update public.contracts set status = 'completed', final_sha256 = v.sha256, completed_at = now() where id = p_contract;
  end if;
  perform public.log_audit('contract.signed', 'contract', p_contract::text, jsonb_build_object('role', r, 'version', v.version_no, 'sha256', v.sha256, 'provider', 'mock_sign'));
  return case when r = 'tenant' then 'pending_landlord' else 'completed' end;
end $$;

create function public.cancel_contract(p_contract uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract;
  if c.id is null or not (auth.uid() in (c.landlord_id, c.tenant_id) or public.is_admin()) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'a reason is required' using errcode = 'check_violation'; end if;
  update public.contracts set status = 'cancelled', cancelled_reason = trim(p_reason) where id = p_contract; -- المكتمل يرفضه المشغّل
  perform public.log_audit('contract.cancelled', 'contract', p_contract::text, jsonb_build_object('reason', p_reason));
end $$;

revoke execute on function public.contract_body_sha(text, text), public.is_contract_party(uuid), public.contracts_immutable(),
  public.render_contract(uuid, text, integer), public.create_contract(uuid), public.revise_contract(uuid, text),
  public.sign_contract(uuid, text), public.cancel_contract(uuid, text) from public, anon;
grant execute on function public.is_contract_party(uuid), public.create_contract(uuid), public.revise_contract(uuid, text),
  public.sign_contract(uuid, text), public.cancel_contract(uuid, text) to authenticated;
