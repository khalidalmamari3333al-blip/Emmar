-- =====================================================================
-- المساعد الذكي: حد يومي للرسائل لكل مستخدم (للتحكم في التكلفة).
-- يُستدعى من Edge Function بمفتاح الخادم فقط؛ لا يصل إليه التطبيق مباشرة.
-- =====================================================================

create table public.assistant_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, day)
);
alter table public.assistant_usage enable row level security;
-- لا سياسات: لا قراءة ولا كتابة من التطبيق.

-- يحجز رسالة من حصة اليوم ذريًا؛ يعيد false إن انتهت الحصة.
create function public.assistant_take_quota(p_user uuid, p_limit integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  used integer;
begin
  insert into public.assistant_usage (user_id, day, count) values (p_user, current_date, 1)
  on conflict (user_id, day) do update set count = public.assistant_usage.count + 1
  returning count into used;
  if used > p_limit then
    update public.assistant_usage set count = count - 1 where user_id = p_user and day = current_date;
    return false;
  end if;
  return true;
end $$;

revoke execute on function public.assistant_take_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.assistant_take_quota(uuid, integer) to service_role;
