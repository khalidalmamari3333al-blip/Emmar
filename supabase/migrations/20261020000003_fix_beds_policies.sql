-- إصلاح: سياسات الأسرّة كانت تبحث عن العقار عبر معرّف السرير نفسه (property_of_bed(id))،
-- والسرير الجديد لا يكون مرئيًا بعد لحظة الإدخال، فيفشل إدخال المالك للأسرّة
-- عندما يطلب الصف الجديد (insert ... returning، وهو السلوك الافتراضي في Supabase).
-- الحل: الوصول للعقار عبر الغرفة (room_id) وهي موجودة مسبقًا.

create function public.property_of_room(p_room uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select b.property_id from public.rooms r
  join public.floors f on f.id = r.floor_id
  join public.buildings b on b.id = f.building_id
  where r.id = p_room;
$$;
revoke execute on function public.property_of_room(uuid) from public;
grant execute on function public.property_of_room(uuid) to anon, authenticated;

drop policy beds_select on public.beds;
drop policy beds_write on public.beds;

create policy beds_select on public.beds for select to anon, authenticated
  using (public.can_view_property(public.property_of_room(room_id)));
create policy beds_write on public.beds for all to authenticated
  using (public.owns_property(public.property_of_room(room_id)) or public.is_admin())
  with check (public.owns_property(public.property_of_room(room_id)) or public.is_admin());
