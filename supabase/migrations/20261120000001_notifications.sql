-- =====================================================================
-- الإشعارات: تُنشأ تلقائيًا داخل قاعدة البيانات عند كل تغيير في الحجوزات،
-- وتُرسل للهاتف عبر Expo Push إن كانت إضافة pg_net مفعّلة.
-- =====================================================================

create type public.notification_kind as enum (
  'booking_requested',           -- للمالك: طلب جديد
  'booking_cancelled_by_tenant', -- للمالك: المستأجر ألغى
  'booking_confirmed',           -- للمستأجر: قُبل طلبه
  'booking_rejected',            -- للمستأجر: رُفض
  'booking_cancelled_by_owner',  -- للمستأجر: المالك ألغى
  'booking_expired'              -- للمستأجر: انتهت مهلة الطلب
);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  kind        public.notification_kind not null,
  booking_id  uuid references public.bookings (id) on delete cascade,
  data        jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete on public.notifications from anon, authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ---------- رموز أجهزة الإشعارات ----------
create table public.push_tokens (
  token      text primary key check (length(token) between 10 and 200),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
create policy push_tokens_select on public.push_tokens for select to authenticated using (user_id = auth.uid());
revoke insert, update, delete on public.push_tokens from anon, authenticated;

-- الجهاز قد ينتقل بين حسابات؛ الرمز يتبع آخر مستخدم سجّل الدخول عليه.
create function public.register_push_token(p_token text, p_platform text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = 'insufficient_privilege'; end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = auth.uid(), platform = excluded.platform, updated_at = now();
end $$;

create function public.unregister_push_token(p_token text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_tokens where token = p_token and user_id = auth.uid();
$$;

-- ---------- نص الإشعار حسب لغة المستخدم ----------
create function public.notification_text(p_kind public.notification_kind, p_locale text, p_data jsonb, out title text, out body text)
language plpgsql immutable set search_path = '' as $$
declare
  ar boolean := coalesce(p_locale, 'ar') <> 'en';
  prop text := case when ar then p_data ->> 'property_title_ar' else p_data ->> 'property_title_en' end;
  bed text := case when ar then format('سرير %s · غرفة %s', p_data ->> 'bed_code', p_data ->> 'room_code')
                   else format('Bed %s · Room %s', p_data ->> 'bed_code', p_data ->> 'room_code') end;
begin
  case p_kind
    when 'booking_requested' then
      title := case when ar then 'طلب حجز جديد' else 'New booking request' end;
      body := case when ar then format('%s طلب %s في %s', coalesce(p_data ->> 'requester_name', 'مستأجر'), bed, prop)
                   else format('%s requested %s at %s', coalesce(p_data ->> 'requester_name', 'A tenant'), bed, prop) end;
    when 'booking_cancelled_by_tenant' then
      title := case when ar then 'أُلغي حجز' else 'Booking cancelled' end;
      body := case when ar then format('ألغى المستأجر حجز %s في %s', bed, prop) else format('The tenant cancelled %s at %s', bed, prop) end;
    when 'booking_confirmed' then
      title := case when ar then 'تم قبول طلبك ✓' else 'Your request was approved ✓' end;
      body := case when ar then format('%s في %s مؤكد لك', bed, prop) else format('%s at %s is confirmed for you', bed, prop) end;
    when 'booking_rejected' then
      title := case when ar then 'لم يُقبل طلبك' else 'Request declined' end;
      body := case when ar then format('رفض المالك طلب %s في %s. جرّب سريرًا آخر.', bed, prop) else format('The owner declined %s at %s. Try another bed.', bed, prop) end;
    when 'booking_cancelled_by_owner' then
      title := case when ar then 'أُلغي حجزك' else 'Your booking was cancelled' end;
      body := case when ar then format('ألغى المالك حجز %s في %s', bed, prop) else format('The owner cancelled %s at %s', bed, prop) end;
    when 'booking_expired' then
      title := case when ar then 'انتهت مهلة طلبك' else 'Your request expired' end;
      body := case when ar then format('لم يرد المالك على طلب %s في %s خلال 48 ساعة', bed, prop) else format('The owner did not respond to %s at %s within 48 hours', bed, prop) end;
  end case;
end $$;

-- ---------- إنشاء الإشعارات من تغييرات الحجز ----------
create function public.notify_booking_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  info record;
  kind public.notification_kind;
  recipient uuid;
begin
  if tg_op = 'UPDATE' and new.status = old.status then return null; end if;

  select bd.code as bed_code, r.code as room_code, p.id as property_id, p.owner_id, p.title_ar, p.title_en, pr.full_name as requester_name
    into info
  from public.beds bd
  join public.rooms r on r.id = bd.room_id
  join public.floors f on f.id = r.floor_id
  join public.buildings b on b.id = f.building_id
  join public.properties p on p.id = b.property_id
  join public.profiles pr on pr.id = new.user_id
  where bd.id = new.bed_id;

  if tg_op = 'INSERT' then
    kind := 'booking_requested'; recipient := info.owner_id;
  elsif new.status = 'confirmed' then
    kind := 'booking_confirmed'; recipient := new.user_id;
  elsif new.status = 'rejected' then
    kind := 'booking_rejected'; recipient := new.user_id;
  elsif new.status = 'expired' then
    kind := 'booking_expired'; recipient := new.user_id;
  elsif new.status = 'cancelled' and auth.uid() = new.user_id then
    kind := 'booking_cancelled_by_tenant'; recipient := info.owner_id;
  elsif new.status = 'cancelled' then
    kind := 'booking_cancelled_by_owner'; recipient := new.user_id;
  else
    return null;
  end if;

  insert into public.notifications (user_id, kind, booking_id, data)
  values (recipient, kind, new.id, jsonb_build_object(
    'property_id', info.property_id, 'property_title_ar', info.title_ar, 'property_title_en', info.title_en,
    'bed_code', info.bed_code, 'room_code', info.room_code,
    'start_date', new.start_date, 'end_date', new.end_date, 'requester_name', info.requester_name));
  return null;
end $$;

create trigger bookings_notify after insert or update of status on public.bookings
  for each row execute function public.notify_booking_change();

-- ---------- إرسال للهاتف (Expo Push) ----------
-- يعمل فقط إن كانت إضافة pg_net مفعّلة؛ وإلا تبقى الإشعارات داخل التطبيق.
create function public.push_notification() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  msg record;
  locale text;
  payload jsonb;
begin
  if to_regnamespace('net') is null then return null; end if;
  select preferred_locale into locale from public.profiles where id = new.user_id;
  select * into msg from public.notification_text(new.kind, locale, new.data);
  select jsonb_agg(jsonb_build_object(
           'to', t.token, 'title', msg.title, 'body', msg.body, 'sound', 'default',
           'data', jsonb_build_object('notification_id', new.id, 'kind', new.kind, 'booking_id', new.booking_id)))
    into payload
  from public.push_tokens t where t.user_id = new.user_id;
  if payload is null then return null; end if;
  execute 'select net.http_post(url := $1, body := $2, headers := $3)'
    using 'https://exp.host/--/api/v2/push/send', payload, '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb;
  return null;
end $$;

create trigger notifications_push after insert on public.notifications
  for each row execute function public.push_notification();

revoke execute on function public.notify_booking_change(), public.push_notification() from public, anon, authenticated;
revoke execute on function public.register_push_token(text, text), public.unregister_push_token(text) from public, anon;
grant execute on function public.register_push_token(text, text), public.unregister_push_token(text) to authenticated;
grant execute on function public.notification_text(public.notification_kind, text, jsonb) to authenticated;

-- اللغة المفضلة يحدّثها التطبيق ليصل الإشعار بلغة المستخدم (العمود مسموح بتحديثه مسبقًا).

-- فعّل pg_net تلقائيًا إن كانت متاحة (مثل Supabase).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;
