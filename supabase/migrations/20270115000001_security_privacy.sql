-- =====================================================================
-- المرحلة 7: الأمان والخصوصية والتجهيز للإطلاق التجريبي
--  1) الظهور العام: إعلان منشور + موثّق (عند إلزامية التوثيق) — يشمل الإعلانات القديمة.
--  2) حدود معدّل للطلبات الحساسة (في قاعدة البيانات، لا يمكن تجاوزها من العميل).
--  3) سياسة احتفاظ بمستندات التوثيق وحذفها عبر طابور حذف من التخزين.
--  4) طلبات الخصوصية: تصدير بياناتي، تصحيح، حذف (إخفاء الهوية مع حفظ السجلات القانونية).
-- =====================================================================

-- ---------- 1) الظهور العام ----------
create function public.listing_is_public(p_status public.listing_status, p_verification text, p_expires timestamptz, p_is_demo boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_status = 'published' and (
    p_is_demo  -- بيانات العرض المعلّمة كتجريبية
    or not coalesce((public.setting('publish_requires_verification') #>> '{}')::boolean, true)
    or (p_verification = 'verified' and coalesce(p_expires, 'infinity') >= now())
  );
$$;

create or replace function public.can_view_property(p_property uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.properties
    where id = p_property and (public.listing_is_public(status, verification_status, verification_expires_at, is_demo) or owner_id = auth.uid())
  ) or public.is_admin();
$$;

drop policy properties_select on public.properties;
create policy properties_select on public.properties for select to anon, authenticated
  using (public.listing_is_public(status, verification_status, verification_expires_at, is_demo) or owner_id = auth.uid() or public.is_admin());

drop policy bookings_insert on public.bookings;
create policy bookings_insert on public.bookings for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'pending'
    and exists (
      select 1 from public.beds bd join public.properties p on p.id = public.property_of_bed(bd.id)
      where bd.id = bed_id and bd.status = 'active' and p.kind = 'student'
        and public.listing_is_public(p.status, p.verification_status, p.verification_expires_at, p.is_demo)
    )
  );

-- ---------- 2) حدود المعدّل ----------
create table public.rate_limit_hits (
  user_id      uuid not null,
  action       text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (user_id, action, window_start)
);
alter table public.rate_limit_hits enable row level security; -- لا سياسات: لا وصول للعملاء
revoke all on public.rate_limit_hits from anon, authenticated;
create index on public.rate_limit_hits (window_start);

create function public.hit_rate_limit(p_user uuid, p_action text, p_max integer, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
declare
  secs double precision := extract(epoch from p_window);
  ws timestamptz := to_timestamp(floor(extract(epoch from now()) / secs) * secs);
  n integer;
begin
  if p_user is null then return; end if; -- عمليات النظام (مفتاح الخدمة) غير مقيدة
  insert into public.rate_limit_hits (user_id, action, window_start, count) values (p_user, p_action, ws, 1)
  on conflict (user_id, action, window_start) do update set count = public.rate_limit_hits.count + 1
  returning count into n;
  if n > p_max then
    raise exception 'rate_limited: %', p_action using errcode = 'RL001', hint = 'Too many requests. Please try again later.';
  end if;
end $$;

create function public.rate_limit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- الحدود: tg_argv = (الاسم، الحد الأقصى، النافذة)
  if tg_table_name = 'payment_transactions' and auth.uid() is null then
    perform public.hit_rate_limit(new.created_by, tg_argv[0], tg_argv[1]::integer, tg_argv[2]::interval);
  else
    perform public.hit_rate_limit(auth.uid(), tg_argv[0], tg_argv[1]::integer, tg_argv[2]::interval);
  end if;
  return new;
end $$;

create trigger rl_bookings before insert on public.bookings for each row execute function public.rate_limit_trigger('booking.request', '10', '1 hour');
create trigger rl_reports before insert on public.property_reports for each row execute function public.rate_limit_trigger('report', '10', '1 day');
create trigger rl_documents before insert on public.verification_documents for each row execute function public.rate_limit_trigger('verification.document', '30', '1 day');
create trigger rl_maintenance before insert on public.maintenance_requests for each row execute function public.rate_limit_trigger('maintenance', '20', '1 day');
create trigger rl_reviews before insert on public.reviews for each row execute function public.rate_limit_trigger('review', '10', '1 day');
create trigger rl_payments before insert on public.payment_transactions for each row execute function public.rate_limit_trigger('payment.start', '20', '1 hour');
create trigger rl_verify_submit before update of status on public.verification_requests for each row
  when (new.status = 'submitted' and old.status is distinct from 'submitted')
  execute function public.rate_limit_trigger('verification.submit', '10', '1 day');

-- تنظيف النوافذ القديمة (يُستدعى من مهمة الاحتفاظ)
create function public.prune_rate_limits() returns integer
language sql security definer set search_path = '' as $$
  with d as (delete from public.rate_limit_hits where window_start < now() - interval '2 days' returning 1) select count(*)::int from d;
$$;

-- ---------- 3) الاحتفاظ بالمستندات ----------
insert into public.platform_settings (key, value) values ('document_retention_days', '365') on conflict (key) do nothing;

create table public.storage_deletion_queue (
  id        bigint generated always as identity primary key,
  bucket    text not null,
  path      text not null,
  reason    text not null,
  queued_at timestamptz not null default now(),
  done_at   timestamptz,
  unique (bucket, path)
);
alter table public.storage_deletion_queue enable row level security;
create policy sdq_admin on public.storage_deletion_queue for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.storage_deletion_queue from anon, authenticated;

-- يحذف سجلات المستندات لطلبات منتهية مضى على قرارها مدة الاحتفاظ، ويضع ملفاتها في طابور الحذف.
-- تبقى نتائج الفحوص والقرارات (بدون الملفات) كسجل.
create function public.purge_expired_documents() returns integer
language plpgsql security definer set search_path = '' as $$
declare days integer := coalesce((public.setting('document_retention_days') #>> '{}')::integer, 365); n integer;
begin
  if auth.uid() is not null and not public.is_admin() then raise exception 'admin only' using errcode = 'insufficient_privilege'; end if;
  with old_docs as (
    delete from public.verification_documents d
    using public.verification_requests r
    where r.id = d.request_id and r.status in ('approved', 'rejected', 'cancelled')
      and coalesce(r.decided_at, r.updated_at) < now() - make_interval(days => days)
    returning d.path
  ), q as (
    insert into public.storage_deletion_queue (bucket, path, reason)
    select 'verification-docs', path, 'retention' from old_docs on conflict do nothing returning 1
  )
  select count(*) into n from q;
  perform public.prune_rate_limits();
  perform public.log_audit('privacy.retention_run', 'privacy', 'documents', jsonb_build_object('queued', n, 'retention_days', days));
  return n;
end $$;

-- ---------- 4) طلبات الخصوصية ----------
create table public.privacy_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  type        text not null check (type in ('export', 'correction', 'deletion')),
  details     text check (length(details) <= 1000),
  status      text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  admin_note  text check (length(admin_note) <= 1000),
  handled_by  uuid references public.profiles (id),
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);
create unique index privacy_one_pending on public.privacy_requests (user_id, type) where status = 'pending';
alter table public.privacy_requests enable row level security;
create policy privacy_select on public.privacy_requests for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy privacy_insert on public.privacy_requests for insert to authenticated
  with check (user_id = auth.uid() and status = 'pending' and admin_note is null and handled_by is null);
revoke update, delete on public.privacy_requests from anon, authenticated;
create trigger rl_privacy before insert on public.privacy_requests for each row execute function public.rate_limit_trigger('privacy.request', '3', '1 day');

-- تصدير بياناتي: كل ما يخص المستخدم فقط (بلا بصمات الهوية ولا بيانات الآخرين)
-- (ليست stable: تكتب في سجل التدقيق، وPostgREST ينفذ الدوال stable في معاملة للقراءة فقط)
create function public.export_my_data() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'sign in required' using errcode = 'insufficient_privilege'; end if;
  perform public.log_audit('privacy.export', 'privacy', uid::text, '{}');
  return jsonb_build_object(
    'exported_at', now(),
    'profile', (select jsonb_build_object('id', id, 'full_name', full_name, 'phone', phone, 'role', role, 'created_at', created_at) from public.profiles where id = uid),
    'email', (select email from auth.users where id = uid),
    'landlord_profile', (select to_jsonb(l) from public.landlord_profiles l where user_id = uid),
    'tenant_profile', (select to_jsonb(t) from public.tenant_profiles t where user_id = uid),
    'properties', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title_ar', title_ar, 'title_en', title_en, 'status', status, 'verification_status', verification_status, 'created_at', created_at)) from public.properties where owner_id = uid), '[]'),
    'bookings', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'bed_id', bed_id, 'start_date', start_date, 'end_date', end_date, 'status', status, 'created_at', created_at)) from public.bookings where user_id = uid), '[]'),
    'contracts', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'booking_id', booking_id, 'role', case when tenant_id = uid then 'tenant' else 'landlord' end, 'status', status, 'final_sha256', final_sha256, 'completed_at', completed_at)) from public.contracts where uid in (tenant_id, landlord_id)), '[]'),
    'payments', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'kind', kind, 'due_date', due_date, 'amount_omr', amount_omr, 'status', status, 'receipt_no', receipt_no, 'paid_at', paid_at)) from public.payments where uid in (tenant_id, landlord_id)), '[]'),
    'maintenance', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'status', status, 'created_at', created_at)) from public.maintenance_requests where uid in (tenant_id, landlord_id)), '[]'),
    'reviews', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'rating', rating, 'comment', comment, 'created_at', created_at)) from public.reviews where tenant_id = uid), '[]'),
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'reason', reason, 'status', status, 'created_at', created_at)) from public.property_reports where reporter_id = uid), '[]'),
    'verification_requests', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'subject', subject, 'status', status, 'identity_last4', identity_last4, 'documents', (select count(*) from public.verification_documents d where d.request_id = r.id), 'created_at', created_at)) from public.verification_requests r where submitted_by = uid), '[]'),
    'privacy_requests', coalesce((select jsonb_agg(jsonb_build_object('type', type, 'status', status, 'created_at', created_at)) from public.privacy_requests where user_id = uid), '[]')
  );
end $$;

-- معالجة طلب تصدير/تصحيح (الإدارة)
create function public.handle_privacy_request(p_request uuid, p_status text, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = 'insufficient_privilege'; end if;
  if p_status not in ('completed', 'rejected') then raise exception 'invalid status' using errcode = 'check_violation'; end if;
  update public.privacy_requests set status = p_status, admin_note = nullif(trim(p_note), ''), handled_by = auth.uid(), handled_at = now()
   where id = p_request and status = 'pending' and type <> 'deletion';
  if not found then raise exception 'request is not an open export/correction request' using errcode = 'check_violation'; end if;
  perform public.log_audit('privacy.' || p_status, 'privacy', p_request::text, '{}');
end $$;

-- طلب الحذف: إخفاء الهوية وحذف البيانات غير اللازمة. العقود والدفعات المكتملة تبقى سجلات قانونية/مالية.
-- يعيد معرّف المستخدم حتى تحظر دالة privacy تسجيل دخوله (Auth Admin API).
create function public.process_deletion_request(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.privacy_requests; n integer;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = 'insufficient_privilege'; end if;
  select * into r from public.privacy_requests where id = p_request and type = 'deletion' and status = 'pending' for update;
  if r.id is null then raise exception 'not an open deletion request' using errcode = 'check_violation'; end if;
  if r.user_id = auth.uid() then raise exception 'cannot process your own deletion' using errcode = 'insufficient_privilege'; end if;

  update public.profiles set full_name = 'مستخدم محذوف', phone = null where id = r.user_id;
  -- الطلبات المعلّقة تُرفض (أو تُعلَّم منتهية إن انقضت مهلتها) حتى يتحرر السرير
  update public.bookings set status = case when expires_at < now() then 'expired'::public.booking_status else 'rejected'::public.booking_status end
   where user_id = r.user_id and status = 'pending';
  delete from public.tenant_profiles where user_id = r.user_id;
  delete from public.landlord_profiles where user_id = r.user_id;
  delete from public.push_tokens where user_id = r.user_id;
  delete from public.notifications where user_id = r.user_id;
  delete from public.assistant_usage where user_id = r.user_id;
  update public.properties set status = 'archived' where owner_id = r.user_id and status = 'published';
  update public.verification_requests set identity_hash = null, identity_last4 = null where submitted_by = r.user_id;
  with docs as (
    delete from public.verification_documents d using public.verification_requests v
    where v.id = d.request_id and v.submitted_by = r.user_id and v.status <> 'submitted'
    returning d.path
  )
  insert into public.storage_deletion_queue (bucket, path, reason) select 'verification-docs', path, 'deletion_request' from docs on conflict do nothing;
  get diagnostics n = row_count;

  update public.privacy_requests set status = 'completed', handled_by = auth.uid(), handled_at = now(),
    admin_note = 'Account anonymised; signed contracts and payment records retained as legal records.'
  where id = p_request;
  perform public.log_audit('privacy.deletion', 'privacy', p_request::text, jsonb_build_object('user', r.user_id, 'documents_queued', n));
  return r.user_id;
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function public.listing_is_public(public.listing_status, text, timestamptz, boolean), public.hit_rate_limit(uuid, text, integer, interval),
  public.rate_limit_trigger(), public.prune_rate_limits(), public.purge_expired_documents(), public.export_my_data(),
  public.handle_privacy_request(uuid, text, text), public.process_deletion_request(uuid) from public, anon;
revoke execute on function public.hit_rate_limit(uuid, text, integer, interval), public.prune_rate_limits() from authenticated;
grant execute on function public.listing_is_public(public.listing_status, text, timestamptz, boolean) to anon, authenticated;
grant execute on function public.purge_expired_documents(), public.export_my_data(), public.handle_privacy_request(uuid, text, text),
  public.process_deletion_request(uuid) to authenticated;
