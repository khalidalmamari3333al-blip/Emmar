-- =====================================================================
-- المرحلة 2: نظام التوثيق
-- طلبات توثيق (عقار أو مؤجر) + مستندات خاصة + فحوص آلية + فحص رسمي (مزود تجريبي)
-- + قرار بشري من فريق التحقق + منع النشر قبل التوثيق.
--
-- ⚠️ لا يوجد تكامل حكومي حقيقي: "الفحص الرسمي" هنا يستخدم سجلًا تجريبيًا
--    (mock_gov_registry) ويُعلَّم is_mock = true في كل نتيجة. الربط الحقيقي يتطلب
--    اتفاقية مع الجهة المختصة ويُضاف لاحقًا كمزود جديد.
-- ⚠️ لا OCR حقيقي: البيانات تُدخل يدويًا من المالك ويطابقها الفحص والموظف.
-- ⚠️ الذكاء الاصطناعي لا يقرر: القرار النهائي لموظف التحقق فقط (decide_verification).
-- =====================================================================

-- ---------- إعدادات المنصة ----------
create table public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
create policy settings_read on public.platform_settings for select to anon, authenticated using (true);
create policy settings_admin on public.platform_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete on public.platform_settings from anon, authenticated;
revoke update on public.platform_settings from anon;
insert into public.platform_settings (key, value) values
  ('publish_requires_verification', 'true'),
  ('gov_provider', '"mock"'),            -- mock | disabled
  ('verification_validity_days', '365');

create function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select value from public.platform_settings where key = p_key;
$$;

-- ---------- حالة التوثيق على العقار (يكتبها النظام فقط) ----------
alter table public.properties
  add column verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  add column verified_at timestamptz,
  add column verification_expires_at timestamptz,
  -- نطاق التوثيق: documents_reviewed = راجع موظف المستندات؛ official_registry = تطابق مع السجل الرسمي أيضًا
  add column verified_scope text check (verified_scope in ('documents_reviewed', 'official_registry'));

alter table public.landlord_profiles
  add constraint landlord_verification_valid check (verification_status in ('unverified', 'pending', 'verified', 'rejected'));
alter table public.landlord_profiles add column verified_at timestamptz;

-- فريق التحقق يرى العقارات قيد المراجعة (حتى المسودات)
create policy properties_staff_select on public.properties for select to authenticated using (public.is_staff());

-- ---------- سياسات التوثيق القابلة للضبط ----------
create table public.verification_policies (
  code      text primary key,
  subject   text not null check (subject in ('property', 'landlord')),
  required  boolean not null default true,   -- فشلها يمنع الموافقة
  enabled   boolean not null default true,
  label_ar  text not null,
  label_en  text not null,
  position  smallint not null default 0
);
alter table public.verification_policies enable row level security;
create policy vpol_read on public.verification_policies for select to anon, authenticated using (true);
create policy vpol_admin on public.verification_policies for update to authenticated using (public.is_admin()) with check (public.is_admin());
revoke insert, delete, update on public.verification_policies from anon, authenticated;
grant update (required, enabled) on public.verification_policies to authenticated;

insert into public.verification_policies (code, subject, required, label_ar, label_en, position) values
  ('doc_title_deed',     'property', true,  'سند الملكية مرفق',                    'Title deed attached', 1),
  ('doc_formats',        'property', true,  'صيغة وحجم المستندات مقبولة',          'Document format and size accepted', 2),
  ('deed_number_format', 'property', true,  'رقم السند بصيغة صحيحة',              'Deed number is well-formed', 3),
  ('city_match',         'property', true,  'مدينة السند تطابق مدينة الإعلان',     'Deed city matches the listing', 4),
  ('name_match',         'property', true,  'اسم المالك في السند يطابق المؤجر أو يوجد تفويض', 'Deed owner matches the landlord, or an authorization is attached', 5),
  ('duplicate_deed',     'property', true,  'السند غير مستخدم لدى مؤجر آخر',      'Deed not used by another landlord', 6),
  ('duplicate_file',     'property', true,  'المستندات غير مكررة من حساب آخر',     'Documents not reused from another account', 7),
  ('official_registry',  'property', false, 'تطابق مع السجل الرسمي (تجريبي)',      'Matches the official registry (mock)', 8),
  ('doc_identity',       'landlord', true,  'هوية أو سجل تجاري مرفق',              'ID card or CR certificate attached', 1),
  ('doc_formats_l',      'landlord', true,  'صيغة وحجم المستندات مقبولة',          'Document format and size accepted', 2),
  ('identity_number',    'landlord', true,  'رقم الهوية أو السجل التجاري مُدخل',     'ID or CR number provided', 3),
  ('legal_name',         'landlord', true,  'الاسم القانوني مُدخل',                 'Legal name provided', 4),
  ('duplicate_identity', 'landlord', true,  'رقم الهوية غير مستخدم لحساب آخر',      'ID number not used by another account', 5),
  ('duplicate_file_l',   'landlord', true,  'المستندات غير مكررة من حساب آخر',     'Documents not reused from another account', 6);

-- ---------- السجل الرسمي التجريبي ----------
-- ⚠️ بيانات اختبار فقط، ليست من أي جهة حكومية.
create table public.mock_gov_registry (
  deed_number text primary key,
  owner_name  text not null,
  city        text not null,
  plot_number text
);
alter table public.mock_gov_registry enable row level security; -- لا سياسات: لا يقرؤه العميل مباشرة
insert into public.mock_gov_registry values
  ('TEST-OK-1001', 'خالد المعمري', 'sohar', '12/345'),
  ('TEST-OK-1002', 'خالد المعمري', 'muscat', '7/88'),
  ('TEST-OK-2001', 'Owner Test', 'muscat', '1/1');

-- ---------- الطلبات ----------
create table public.verification_requests (
  id              uuid primary key default gen_random_uuid(),
  subject         text not null check (subject in ('property', 'landlord')),
  property_id     uuid references public.properties (id) on delete cascade,
  submitted_by    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  status          text not null default 'draft' check (status in ('draft', 'submitted', 'needs_info', 'approved', 'rejected', 'cancelled')),
  automated_status text not null default 'not_run' check (automated_status in ('not_run', 'passed', 'warning', 'failed')),
  official_status text not null default 'not_requested' check (official_status in ('not_requested', 'verified', 'not_found', 'mismatch', 'unavailable')),
  human_status    text not null default 'pending' check (human_status in ('pending', 'approved', 'rejected', 'needs_info')),
  -- بيانات مُدخلة يدويًا (لا OCR)
  deed_number     text check (deed_number ~ '^[A-Za-z0-9/-]{1,40}$'),
  declared_owner_name text check (length(declared_owner_name) <= 160),
  plot_number     text check (length(plot_number) <= 40),
  declared_city   text check (declared_city in ('sohar', 'muscat')),
  -- رقم الهوية لا يُخزن كاملًا: بصمة SHA-256 + آخر 4 أرقام فقط
  identity_hash   text,
  identity_last4  text,
  run_no          integer not null default 0,
  submitted_at    timestamptz,
  decided_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check ((subject = 'property') = (property_id is not null))
);
create unique index verification_one_open_property on public.verification_requests (property_id)
  where status in ('draft', 'submitted', 'needs_info') and subject = 'property';
create unique index verification_one_open_landlord on public.verification_requests (submitted_by)
  where status in ('draft', 'submitted', 'needs_info') and subject = 'landlord';
create index on public.verification_requests (status, submitted_at);
create trigger verification_requests_touch before update on public.verification_requests for each row execute function public.touch_updated_at();

alter table public.verification_requests enable row level security;
create policy vreq_select on public.verification_requests for select to authenticated
  using (submitted_by = auth.uid() or public.is_staff());
create policy vreq_insert on public.verification_requests for insert to authenticated
  with check (
    submitted_by = auth.uid() and status = 'draft' and automated_status = 'not_run' and official_status = 'not_requested'
    and human_status = 'pending' and run_no = 0 and identity_hash is null
    and (subject = 'landlord' or public.owns_property(property_id))
  );
create policy vreq_update on public.verification_requests for update to authenticated
  using (submitted_by = auth.uid() and status in ('draft', 'needs_info'))
  with check (submitted_by = auth.uid() and status in ('draft', 'needs_info'));
revoke update, delete on public.verification_requests from anon, authenticated;
grant update (deed_number, declared_owner_name, plot_number, declared_city) on public.verification_requests to authenticated;

-- ---------- المستندات (bucket خاص) ----------
create table public.verification_documents (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.verification_requests (id) on delete cascade,
  doc_type    text not null check (doc_type in ('title_deed', 'id_card', 'cr_certificate', 'authorization', 'utility_bill', 'other')),
  path        text not null unique,
  mime_type   text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes  integer not null check (size_bytes > 0 and size_bytes <= 10 * 1024 * 1024),
  sha256      text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  ocr_status  text not null default 'not_available' check (ocr_status in ('not_available', 'done', 'failed')),
  uploaded_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index on public.verification_documents (request_id);
create index on public.verification_documents (sha256);

create function public.can_edit_verification(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.verification_requests where id = p_request and submitted_by = auth.uid() and status in ('draft', 'needs_info'));
$$;
create function public.can_read_verification(p_request uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.verification_requests where id = p_request and submitted_by = auth.uid()) or public.is_staff();
$$;

alter table public.verification_documents enable row level security;
create policy vdoc_select on public.verification_documents for select to authenticated using (public.can_read_verification(request_id));
create policy vdoc_insert on public.verification_documents for insert to authenticated
  with check (
    uploaded_by = auth.uid() and ocr_status = 'not_available' and public.can_edit_verification(request_id)
    and path like auth.uid()::text || '/' || request_id::text || '/%'
  );
create policy vdoc_delete on public.verification_documents for delete to authenticated
  using (uploaded_by = auth.uid() and public.can_edit_verification(request_id));
revoke update on public.verification_documents from anon, authenticated;

-- Storage: مجلد لكل مستخدم <uid>/<request>/<file>؛ لا وصول عام (روابط موقعة مؤقتة فقط)
insert into storage.buckets (id, name, public) values ('verification-docs', 'verification-docs', false)
  on conflict (id) do update set public = false;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'storage' and table_name = 'buckets' and column_name = 'allowed_mime_types') then
    execute $q$update storage.buckets set file_size_limit = 10485760, allowed_mime_types = array['application/pdf','image/jpeg','image/png'] where id = 'verification-docs'$q$;
  end if;
end $$;
create policy verification_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy verification_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'verification-docs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
create policy verification_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'verification-docs' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- نتائج الفحوص (يكتبها النظام فقط) ----------
create table public.verification_checks (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.verification_requests (id) on delete cascade,
  run_no      integer not null,
  code        text not null,
  source      text not null check (source in ('automated', 'official', 'ai')),
  result      text not null check (result in ('pass', 'warn', 'fail', 'unavailable')),
  required    boolean not null,
  details     jsonb not null default '{}',
  provider    text,
  is_mock     boolean not null default false,
  created_at  timestamptz not null default now()
);
create index on public.verification_checks (request_id, run_no);
alter table public.verification_checks enable row level security;
create policy vchk_select on public.verification_checks for select to authenticated using (public.can_read_verification(request_id));
revoke insert, update, delete on public.verification_checks from anon, authenticated;

-- ---------- القرارات البشرية ----------
create table public.verification_decisions (
  id          bigint generated always as identity primary key,
  request_id  uuid not null references public.verification_requests (id) on delete cascade,
  decided_by  uuid not null references public.profiles (id),
  decision    text not null check (decision in ('approved', 'rejected', 'needs_info')),
  reason      text check (length(reason) <= 1000),
  created_at  timestamptz not null default now()
);
alter table public.verification_decisions enable row level security;
create policy vdec_select on public.verification_decisions for select to authenticated using (public.can_read_verification(request_id));
revoke insert, update, delete on public.verification_decisions from anon, authenticated;

-- ---------- أدوات ----------
create function public.normalize_name(p text) returns text
language sql immutable set search_path = '' as $$
  select lower(regexp_replace(coalesce(p, ''), '[[:space:]ً-ٰٟـ]', '', 'g'));
$$;

-- رقم الهوية: تُخزن البصمة وآخر 4 أرقام فقط
create function public.set_verification_identity(p_request uuid, p_number text) returns void
language plpgsql security definer set search_path = '' as $$
declare n text := regexp_replace(coalesce(p_number, ''), '[^0-9A-Za-z]', '', 'g');
begin
  if not public.can_edit_verification(p_request) then raise exception 'not allowed' using errcode = 'insufficient_privilege'; end if;
  if n !~ '^[0-9A-Za-z]{6,20}$' then raise exception 'invalid identity number' using errcode = 'check_violation'; end if;
  update public.verification_requests
     set identity_hash = encode(sha256(convert_to(upper(n), 'UTF8')), 'hex'), identity_last4 = right(n, 4)
   where id = p_request;
end $$;

-- ---------- محرك القواعد ----------
create function public.run_verification_checks(p_request uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  r public.verification_requests;
  p public.properties;
  lp public.landlord_profiles;
  owner_name text;
  run integer;
  res text; det jsonb;
  official text := 'not_requested';
  gov record;
  auto text;
  pol record;
begin
  select * into r from public.verification_requests where id = p_request for update;
  run := r.run_no + 1;
  update public.verification_requests set run_no = run where id = p_request;

  for pol in select * from public.verification_policies where subject = r.subject and enabled order by position loop
    res := 'pass'; det := '{}';
    if r.subject = 'property' then
      select * into p from public.properties where id = r.property_id;
      select * into lp from public.landlord_profiles where user_id = p.owner_id;
      owner_name := coalesce(lp.legal_name, (select full_name from public.profiles where id = p.owner_id));
      case pol.code
        when 'doc_title_deed' then
          if not exists (select 1 from public.verification_documents where request_id = p_request and doc_type = 'title_deed') then res := 'fail'; end if;
        when 'doc_formats' then
          if not exists (select 1 from public.verification_documents where request_id = p_request) then res := 'fail'; det := '{"reason":"no_documents"}'; end if;
        when 'deed_number_format' then
          if coalesce(r.deed_number, '') !~ '^[A-Za-z0-9][A-Za-z0-9/-]{3,39}$' then res := 'fail'; end if;
        when 'city_match' then
          if r.declared_city is distinct from p.city::text then res := 'fail'; det := jsonb_build_object('declared', r.declared_city, 'listing', p.city::text); end if;
        when 'name_match' then
          if public.normalize_name(r.declared_owner_name) = '' then res := 'fail'; det := '{"reason":"missing_name"}';
          elsif public.normalize_name(r.declared_owner_name) <> public.normalize_name(owner_name) then
            if exists (select 1 from public.verification_documents where request_id = p_request and doc_type = 'authorization') then
              res := 'warn'; det := '{"reason":"different_owner_with_authorization"}';
            else res := 'fail'; det := '{"reason":"different_owner"}'; end if;
          end if;
        when 'duplicate_deed' then
          if exists (
            select 1 from public.verification_requests o join public.properties op on op.id = o.property_id
            where o.id <> r.id and o.subject = 'property' and upper(o.deed_number) = upper(r.deed_number)
              and o.status in ('submitted', 'approved') and op.owner_id <> p.owner_id) then
            res := 'fail'; det := '{"reason":"deed_used_by_other_landlord"}';
          elsif exists (
            select 1 from public.verification_requests o
            where o.id <> r.id and o.subject = 'property' and upper(o.deed_number) = upper(r.deed_number)
              and o.status in ('submitted', 'approved') and o.property_id <> r.property_id) then
            res := 'warn'; det := '{"reason":"deed_used_on_another_listing"}';
          end if;
        when 'duplicate_file' then
          if exists (
            select 1 from public.verification_documents d join public.verification_documents o on o.sha256 = d.sha256 and o.request_id <> d.request_id
            where d.request_id = p_request and o.uploaded_by <> r.submitted_by) then res := 'fail'; end if;
        when 'official_registry' then
          -- ⚠️ مزود تجريبي: يقرأ mock_gov_registry فقط
          if public.setting('gov_provider') #>> '{}' <> 'mock' then official := 'unavailable'; res := 'unavailable';
          else
            select * into gov from public.mock_gov_registry where deed_number = upper(r.deed_number);
            if not found then official := 'not_found'; res := 'fail';
            elsif public.normalize_name(gov.owner_name) = public.normalize_name(r.declared_owner_name) and gov.city = r.declared_city then official := 'verified';
            else official := 'mismatch'; res := 'fail'; end if;
          end if;
          insert into public.verification_checks (request_id, run_no, code, source, result, required, details, provider, is_mock)
          values (p_request, run, pol.code, 'official', res, pol.required, jsonb_build_object('status', official), 'mock_gov', true);
          continue;
        else res := 'unavailable';
      end case;
    else
      select * into lp from public.landlord_profiles where user_id = r.submitted_by;
      case pol.code
        when 'doc_identity' then
          if not exists (select 1 from public.verification_documents where request_id = p_request
                         and doc_type = case when coalesce(lp.account_type, 'individual') = 'company' then 'cr_certificate' else 'id_card' end) then res := 'fail'; end if;
        when 'doc_formats_l' then
          if not exists (select 1 from public.verification_documents where request_id = p_request) then res := 'fail'; end if;
        when 'identity_number' then
          if coalesce(lp.account_type, 'individual') = 'company' then
            if coalesce(lp.company_cr, '') = '' then res := 'fail'; end if;
          elsif r.identity_hash is null then res := 'fail'; end if;
        when 'legal_name' then
          if lp.user_id is null or coalesce(trim(lp.legal_name), '') = '' then res := 'fail'; end if;
        when 'duplicate_identity' then
          if r.identity_hash is not null and exists (
            select 1 from public.verification_requests o where o.id <> r.id and o.subject = 'landlord'
              and o.identity_hash = r.identity_hash and o.submitted_by <> r.submitted_by and o.status in ('submitted', 'approved')) then res := 'fail'; end if;
        when 'duplicate_file_l' then
          if exists (
            select 1 from public.verification_documents d join public.verification_documents o on o.sha256 = d.sha256 and o.request_id <> d.request_id
            where d.request_id = p_request and o.uploaded_by <> r.submitted_by) then res := 'fail'; end if;
        else res := 'unavailable';
      end case;
    end if;
    insert into public.verification_checks (request_id, run_no, code, source, result, required, details, provider)
    values (p_request, run, pol.code, 'automated', res, pol.required, det, 'rules_v1');
  end loop;

  select case
    when bool_or(result = 'fail' and required) then 'failed'
    when bool_or(result in ('warn', 'fail')) then 'warning'
    else 'passed' end
  into auto
  from public.verification_checks where request_id = p_request and run_no = run and source = 'automated';

  update public.verification_requests set automated_status = coalesce(auto, 'passed'), official_status = official where id = p_request;
  return coalesce(auto, 'passed');
end $$;

-- إرسال الطلب: يشغّل الفحوص ويضعه في طابور فريق التحقق
create function public.submit_verification(p_request uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare r public.verification_requests; auto text;
begin
  select * into r from public.verification_requests where id = p_request;
  if r.id is null or r.submitted_by <> auth.uid() or r.status not in ('draft', 'needs_info') then
    raise exception 'not allowed' using errcode = 'insufficient_privilege';
  end if;
  auto := public.run_verification_checks(p_request);
  update public.verification_requests set status = 'submitted', human_status = 'pending', submitted_at = now() where id = p_request;
  if r.subject = 'property' then
    perform set_config('app.verification_write', 'on', true);
    update public.properties set verification_status = 'pending' where id = r.property_id and verification_status <> 'verified';
    perform set_config('app.verification_write', 'off', true);
  else
    update public.landlord_profiles set verification_status = 'pending' where user_id = r.submitted_by;
  end if;
  perform public.log_audit('verification.submitted', 'verification', p_request::text, jsonb_build_object('subject', r.subject, 'automated', auto));
  return auto;
end $$;

-- قرار موظف التحقق (الموافقة النهائية بشرية فقط)
create function public.decide_verification(p_request uuid, p_decision text, p_reason text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.verification_requests;
  subject_owner uuid;
  blocked boolean;
  days integer := coalesce((public.setting('verification_validity_days') #>> '{}')::integer, 365);
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  if p_decision not in ('approved', 'rejected', 'needs_info') then raise exception 'invalid decision' using errcode = 'check_violation'; end if;
  select * into r from public.verification_requests where id = p_request for update;
  if r.id is null or r.status <> 'submitted' then raise exception 'request is not awaiting review' using errcode = 'check_violation'; end if;
  subject_owner := case when r.subject = 'property' then (select owner_id from public.properties where id = r.property_id) else r.submitted_by end;
  if subject_owner = auth.uid() or r.submitted_by = auth.uid() then
    raise exception 'cannot review your own request' using errcode = 'insufficient_privilege';
  end if;
  if p_decision <> 'approved' and coalesce(trim(p_reason), '') = '' then
    raise exception 'a reason is required' using errcode = 'check_violation';
  end if;

  if p_decision = 'approved' then
    -- لا موافقة مع فشل فحص إلزامي في آخر تشغيل
    select exists (
      select 1 from public.verification_checks c
      where c.request_id = p_request and c.run_no = r.run_no and c.required and c.result in ('fail', 'unavailable')
    ) into blocked;
    if blocked or r.automated_status = 'failed' then
      raise exception 'mandatory checks have not passed' using errcode = 'check_violation';
    end if;
    if r.automated_status = 'warning' and coalesce(trim(p_reason), '') = '' then
      raise exception 'a reason is required when approving with warnings' using errcode = 'check_violation';
    end if;
  end if;

  insert into public.verification_decisions (request_id, decided_by, decision, reason) values (p_request, auth.uid(), p_decision, nullif(trim(p_reason), ''));
  update public.verification_requests
     set human_status = p_decision,
         status = case p_decision when 'approved' then 'approved' when 'rejected' then 'rejected' else 'needs_info' end,
         decided_at = case when p_decision = 'needs_info' then null else now() end
   where id = p_request;

  if r.subject = 'property' then
    perform set_config('app.verification_write', 'on', true);
    update public.properties set
      verification_status = case p_decision when 'approved' then 'verified' when 'rejected' then 'rejected' else 'pending' end,
      verified_at = case when p_decision = 'approved' then now() end,
      verification_expires_at = case when p_decision = 'approved' then now() + make_interval(days => days) end,
      verified_scope = case when p_decision = 'approved' then case when r.official_status = 'verified' then 'official_registry' else 'documents_reviewed' end end
    where id = r.property_id;
    perform set_config('app.verification_write', 'off', true);
  else
    update public.landlord_profiles set
      verification_status = case p_decision when 'approved' then 'verified' when 'rejected' then 'rejected' else 'pending' end,
      verified_at = case when p_decision = 'approved' then now() end
    where user_id = r.submitted_by;
  end if;
  perform public.log_audit('verification.' || p_decision, 'verification', p_request::text,
    jsonb_build_object('subject', r.subject, 'property', r.property_id, 'automated', r.automated_status, 'official', r.official_status, 'reason', p_reason));
end $$;

-- طابور فريق التحقق
create function public.verification_queue(p_status text default 'submitted')
returns table (id uuid, subject text, property_id uuid, property_title text, property_title_en text, city text, submitter_name text,
               status text, automated_status text, official_status text, human_status text, submitted_at timestamptz, documents bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = 'insufficient_privilege'; end if;
  return query
    select r.id, r.subject, r.property_id, p.title_ar, p.title_en, p.city::text, pr.full_name, r.status, r.automated_status, r.official_status, r.human_status,
           r.submitted_at, (select count(*) from public.verification_documents d where d.request_id = r.id)
    from public.verification_requests r
    left join public.properties p on p.id = r.property_id
    left join public.profiles pr on pr.id = r.submitted_by
    where p_status is null or r.status = p_status
    order by r.submitted_at nulls last, r.created_at
    limit 200;
end $$;

-- ---------- حماية العقار: النشر بعد التوثيق، وإعادة التوثيق عند تعديل جوهري ----------
create function public.properties_verification_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare system_write boolean := auth.uid() is null or coalesce(current_setting('app.verification_write', true), '') = 'on';
begin
  if not system_write then
    if tg_op = 'INSERT' then
      new.verification_status := 'unverified'; new.verified_at := null; new.verification_expires_at := null; new.verified_scope := null;
    else
      -- لا يستطيع المالك أو المدير تعديل التوثيق مباشرة (فقط عبر decide_verification)
      new.verification_status := old.verification_status; new.verified_at := old.verified_at;
      new.verification_expires_at := old.verification_expires_at; new.verified_scope := old.verified_scope;
      -- تعديل جوهري على عقار موثّق ← يسقط التوثيق ويعود الإعلان مسودة
      if old.verification_status = 'verified' and (
           new.kind, new.type, new.city, new.district_ar, new.district_en, new.area_sqm, new.bedrooms
         ) is distinct from (
           old.kind, old.type, old.city, old.district_ar, old.district_en, old.area_sqm, old.bedrooms) then
        new.verification_status := 'unverified'; new.verified_at := null; new.verification_expires_at := null; new.verified_scope := null;
        if new.status = 'published' then new.status := 'draft'; end if;
        perform public.log_audit('property.reverification', 'property', new.id::text, '{}');
      end if;
    end if;

    if new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published')
       and coalesce((public.setting('publish_requires_verification') #>> '{}')::boolean, true)
       and (new.verification_status <> 'verified' or coalesce(new.verification_expires_at, 'infinity') < now()) then
      raise exception 'verification_required' using errcode = 'check_violation',
        hint = 'The listing must pass verification before it can be published.';
    end if;
  end if;
  return new;
end $$;
create trigger properties_verification before insert or update on public.properties
  for each row execute function public.properties_verification_guard();

-- ---------- الصلاحيات على الدوال ----------
revoke execute on function public.setting(text), public.normalize_name(text), public.run_verification_checks(uuid),
  public.properties_verification_guard(), public.can_edit_verification(uuid), public.can_read_verification(uuid),
  public.set_verification_identity(uuid, text), public.submit_verification(uuid), public.decide_verification(uuid, text, text),
  public.verification_queue(text) from public, anon;
grant execute on function public.can_edit_verification(uuid), public.can_read_verification(uuid), public.setting(text),
  public.set_verification_identity(uuid, text), public.submit_verification(uuid), public.decide_verification(uuid, text, text),
  public.verification_queue(text) to authenticated;
revoke execute on function public.run_verification_checks(uuid) from authenticated;
