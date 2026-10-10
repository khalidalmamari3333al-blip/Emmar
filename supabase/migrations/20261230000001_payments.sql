-- =====================================================================
-- المرحلة 4: المدفوعات
-- جدول دفعات يُولَّد تلقائيًا عند اكتمال العقد (إيجار شهري + تأمين + رسوم)،
-- ومعاملات مع مزود الدفع، وأحداث Webhook بمفتاح عدم تكرار.
--
-- 🔒 "مدفوع" لا يُكتب إلا عبر record_payment_event (مفتاح الخدمة فقط) بعد
--    تحقق دالة payments من توقيع HMAC للحدث. العميل لا يكتب أي شيء هنا.
-- 🔒 لا تُخزَّن بيانات بطاقات إطلاقًا: لا رقم بطاقة ولا تاريخ ولا CVV (المزود يتولاها).
-- ⚠️ المزود الحالي تجريبي (mock_pay): لا تحويل أموال حقيقي.
-- =====================================================================

create sequence public.receipt_seq;

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references public.contracts (id) on delete restrict,
  property_id  uuid not null references public.properties (id) on delete restrict,
  tenant_id    uuid not null references public.profiles (id),
  landlord_id  uuid not null references public.profiles (id),
  kind         text not null check (kind in ('rent', 'deposit', 'fee')),
  seq          integer not null default 1,
  due_date     date not null,
  amount_omr   numeric(10, 3) not null check (amount_omr > 0),
  status       text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'failed', 'refund_pending', 'refunded', 'cancelled')),
  paid_at      timestamptz,
  receipt_no   text unique,
  refunded_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (contract_id, kind, seq),
  check ((status in ('paid', 'refund_pending', 'refunded')) = (paid_at is not null and receipt_no is not null)),
  check (kind = 'deposit' or status not in ('refund_pending', 'refunded'))
);
create index on public.payments (tenant_id, due_date);
create index on public.payments (landlord_id, due_date);
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

create table public.payment_transactions (
  id            uuid primary key default gen_random_uuid(),
  payment_id    uuid not null references public.payments (id) on delete restrict,
  type          text not null check (type in ('charge', 'refund')),
  provider      text not null default 'mock_pay',
  is_mock       boolean not null default true,
  provider_ref  text not null unique,
  amount_omr    numeric(10, 3) not null check (amount_omr > 0),
  status        text not null default 'initiated' check (status in ('initiated', 'succeeded', 'failed')),
  failure_reason text check (length(failure_reason) <= 200),
  created_by    uuid not null references public.profiles (id),
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);
create index on public.payment_transactions (payment_id);

-- كل حدث من المزود يُسجل مرة واحدة فقط (مفتاح عدم التكرار = معرّف الحدث)
create table public.payment_events (
  event_id     text primary key check (length(event_id) between 8 and 100),
  provider     text not null,
  type         text not null,
  provider_ref text not null,
  amount_omr   numeric(10, 3),
  outcome      text not null,
  payload      jsonb not null default '{}',
  received_at  timestamptz not null default now()
);

alter table public.payments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_events enable row level security;
create policy payments_select on public.payments for select to authenticated
  using (auth.uid() in (tenant_id, landlord_id) or public.is_admin());
create policy ptx_select on public.payment_transactions for select to authenticated
  using (exists (select 1 from public.payments p where p.id = payment_id and (auth.uid() in (p.tenant_id, p.landlord_id) or public.is_admin())));
create policy pevt_admin on public.payment_events for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.payments, public.payment_transactions, public.payment_events from anon, authenticated;

-- ---------- توليد الجدول عند اكتمال العقد ----------
create function public.generate_payment_schedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  bk public.bookings;
  price numeric;
  p public.properties;
  months integer;
  i integer;
begin
  if new.status <> 'completed' or old.status = 'completed' then return null; end if;
  select * into bk from public.bookings where id = new.booking_id;
  select monthly_price_omr into price from public.beds where id = bk.bed_id;
  select * into p from public.properties where id = new.property_id;
  months := greatest(1, (extract(year from age(bk.end_date, bk.start_date)) * 12 + extract(month from age(bk.end_date, bk.start_date)))::int);
  if price > 0 then
    for i in 1..months loop
      insert into public.payments (contract_id, property_id, tenant_id, landlord_id, kind, seq, due_date, amount_omr)
      values (new.id, new.property_id, new.tenant_id, new.landlord_id, 'rent', i, (bk.start_date + make_interval(months => i - 1))::date, price);
    end loop;
  end if;
  if coalesce(p.deposit_omr, 0) > 0 then
    insert into public.payments (contract_id, property_id, tenant_id, landlord_id, kind, due_date, amount_omr)
    values (new.id, new.property_id, new.tenant_id, new.landlord_id, 'deposit', bk.start_date, p.deposit_omr);
  end if;
  if coalesce(p.fees_omr, 0) > 0 then
    insert into public.payments (contract_id, property_id, tenant_id, landlord_id, kind, due_date, amount_omr)
    values (new.id, new.property_id, new.tenant_id, new.landlord_id, 'fee', bk.start_date, p.fees_omr);
  end if;
  perform public.log_audit('payments.scheduled', 'contract', new.id::text, jsonb_build_object('rent_months', months));
  return null;
end $$;
create trigger contracts_payment_schedule after update of status on public.contracts
  for each row execute function public.generate_payment_schedule();

-- ---------- بدء معاملة (تستدعيها دالة payments بمفتاح الخدمة بعد التحقق من المستخدم) ----------
create function public.create_payment_transaction(p_payment uuid, p_type text, p_actor uuid)
returns table (transaction_id uuid, provider_ref text, amount_omr numeric)
language plpgsql security definer set search_path = '' as $$
declare pay public.payments; ref text := 'mock_' || replace(gen_random_uuid()::text, '-', ''); tid uuid;
begin
  select * into pay from public.payments where id = p_payment for update;
  if pay.id is null then raise exception 'payment not found' using errcode = 'insufficient_privilege'; end if;
  if p_type = 'charge' then
    if p_actor <> pay.tenant_id then raise exception 'only the tenant pays' using errcode = 'insufficient_privilege'; end if;
    if pay.status not in ('pending', 'failed') then raise exception 'payment is not payable' using errcode = 'check_violation'; end if;
    update public.payments set status = 'processing' where id = p_payment;
  elsif p_type = 'refund' then
    if p_actor <> pay.landlord_id then raise exception 'only the landlord refunds' using errcode = 'insufficient_privilege'; end if;
    if pay.kind <> 'deposit' or pay.status <> 'paid' then raise exception 'only a paid deposit can be refunded' using errcode = 'check_violation'; end if;
    update public.payments set status = 'refund_pending' where id = p_payment;
  else
    raise exception 'invalid type' using errcode = 'check_violation';
  end if;
  insert into public.payment_transactions (payment_id, type, provider_ref, amount_omr, created_by)
  values (p_payment, p_type, ref, pay.amount_omr, p_actor) returning id into tid;
  perform public.log_audit('payment.' || p_type || '_started', 'payment', p_payment::text, jsonb_build_object('provider_ref', ref, 'amount', pay.amount_omr));
  return query select tid, ref, pay.amount_omr;
end $$;

-- ---------- تطبيق حدث من المزود (بعد التحقق من توقيع HMAC في دالة payments) ----------
create function public.record_payment_event(p_event_id text, p_provider text, p_type text, p_provider_ref text, p_amount numeric, p_payload jsonb default '{}')
returns text
language plpgsql security definer set search_path = '' as $$
declare tx public.payment_transactions; pay public.payments; outcome text;
begin
  -- عدم التكرار: الحدث نفسه لا يُطبّق مرتين
  if exists (select 1 from public.payment_events where event_id = p_event_id) then return 'duplicate'; end if;

  select * into tx from public.payment_transactions where provider_ref = p_provider_ref and provider = p_provider for update;
  if tx.id is null then outcome := 'unknown_transaction';
  elsif tx.status <> 'initiated' then outcome := 'already_final';
  elsif p_amount is distinct from tx.amount_omr then outcome := 'amount_mismatch';
  else
    select * into pay from public.payments where id = tx.payment_id for update;
    if p_type = 'payment.succeeded' and tx.type = 'charge' then
      update public.payment_transactions set status = 'succeeded', completed_at = now() where id = tx.id;
      update public.payments set status = 'paid', paid_at = now(),
        receipt_no = 'AQ-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.receipt_seq')::text, 6, '0')
      where id = pay.id;
      outcome := 'paid';
    elsif p_type = 'payment.failed' and tx.type = 'charge' then
      update public.payment_transactions set status = 'failed', completed_at = now(), failure_reason = left(coalesce(p_payload ->> 'reason', 'declined'), 200) where id = tx.id;
      update public.payments set status = 'failed' where id = pay.id;
      outcome := 'failed';
    elsif p_type = 'refund.succeeded' and tx.type = 'refund' then
      update public.payment_transactions set status = 'succeeded', completed_at = now() where id = tx.id;
      update public.payments set status = 'refunded', refunded_at = now() where id = pay.id;
      outcome := 'refunded';
    elsif p_type = 'refund.failed' and tx.type = 'refund' then
      update public.payment_transactions set status = 'failed', completed_at = now() where id = tx.id;
      update public.payments set status = 'paid' where id = pay.id;
      outcome := 'refund_failed';
    else
      outcome := 'ignored_type';
    end if;
  end if;

  insert into public.payment_events (event_id, provider, type, provider_ref, amount_omr, outcome, payload)
  values (p_event_id, p_provider, p_type, p_provider_ref, p_amount, outcome, coalesce(p_payload, '{}'));
  if tx.id is not null then
    perform public.log_audit('payment.event', 'payment', tx.payment_id::text, jsonb_build_object('event', p_event_id, 'type', p_type, 'outcome', outcome));
  end if;
  return outcome;
end $$;

revoke execute on function public.generate_payment_schedule(), public.create_payment_transaction(uuid, text, uuid),
  public.record_payment_event(text, text, text, text, numeric, jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.create_payment_transaction(uuid, text, uuid), public.record_payment_event(text, text, text, text, numeric, jsonb) to service_role;
  end if;
end $$;
