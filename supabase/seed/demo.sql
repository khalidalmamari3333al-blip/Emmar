-- =====================================================================
-- ⚠️ بيانات تجريبية — للتطوير فقط. لا تُشغَّل على مشروع الإنتاج.
-- كل العقارات هنا is_demo = true، والتطبيق الحقيقي يستبعدها دائمًا.
-- التشغيل: الصق في SQL Editor لمشروع التطوير، أو: psql "$DB_URL" -f supabase/seed/demo.sql
-- =====================================================================
begin;

-- مالك تجريبي
insert into auth.users (id, email, raw_user_meta_data)
values ('00000000-0000-4000-8000-00000000d001', 'demo-owner@example.com', '{"full_name":"مالك تجريبي"}')
on conflict (id) do nothing;
update public.profiles set role = 'owner' where id = '00000000-0000-4000-8000-00000000d001';

insert into public.properties
  (id, owner_id, kind, type, city, district_ar, district_en, title_ar, title_en, price_omr, price_period, bedrooms, area_sqm, featured, status, is_demo)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000d001', 'rent', 'apartment', 'sohar', 'الطريف', 'Al Tareef',
   'شقة غرفتين قرب الكورنيش', '2-bedroom flat near the Corniche', 220, 'monthly', 2, 110, true, 'published', true),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000d001', 'student', 'student_housing', 'sohar', 'الهمبار', 'Al Humbar',
   'سكن طلابي قرب الجامعة', 'Student housing near the university', 45, 'monthly', null, null, true, 'published', true),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000d001', 'sale', 'villa', 'muscat', 'العذيبة', 'Al Azaiba',
   'فيلا بطابع عُماني حديث', 'Modern Omani-style villa', 185000, 'total', 5, 420, true, 'published', true)
on conflict (id) do nothing;

-- مبنى سكن طلابي: طابقان × غرفتان × سريران
insert into public.buildings (id, property_id, name_ar, name_en)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a2', 'المبنى أ', 'Building A')
on conflict (id) do nothing;

insert into public.floors (building_id, level)
select '00000000-0000-4000-8000-0000000000b1', l from generate_series(0, 1) l
on conflict do nothing;

insert into public.rooms (floor_id, code, grid_x, grid_y)
select f.id, (f.level + 1) * 100 + r, r - 1, 0
from public.floors f, generate_series(1, 2) r
where f.building_id = '00000000-0000-4000-8000-0000000000b1'
on conflict do nothing;

insert into public.beds (room_id, code, monthly_price_omr, position)
select rm.id, b::text, 45, b
from public.rooms rm join public.floors f on f.id = rm.floor_id, generate_series(1, 2) b
where f.building_id = '00000000-0000-4000-8000-0000000000b1'
on conflict do nothing;

commit;
