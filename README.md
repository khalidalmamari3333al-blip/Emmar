# عقاري عُمان (Aqari Oman)

تطبيق عقاري للسوق العُماني (صحار ومسقط): إيجار، بيع، وسكن طلابي بالسرير.
React Native + Expo (SDK 57) + TypeScript + Supabase، بواجهة عربية (RTL) وإنجليزية (LTR) بهوية عُمانية حديثة.

## التشغيل
```bash
npm install
cp .env.example .env   # ثم املأ القيم
npm start              # أو: npm run web
```

> بعد أي تعديل على `.env` أعد التشغيل مع مسح الذاكرة المؤقتة: `npx expo start --clear`
> (Expo يحفظ قيم `EXPO_PUBLIC_*` القديمة في الذاكرة المؤقتة).

## الفحوصات
```bash
npm run typecheck
npm run lint
npm test          # اختبارات التطبيق
npm run test:db   # اختبارات قاعدة البيانات (تحتاج PostgreSQL 15+ محليًا)
npm run test:e2e  # رحلة الحجز كاملة ضد Supabase محلي (انظر e2e/README.md)
```

## البنية
- `src/app/` المسارات (Expo Router) — كل ملف شاشة.
- `src/screens/` منطق وواجهة الشاشات.
- `src/components/` المكونات، و`components/omani/` الزخارف (قوس، شُرفات، أفق).
- `src/theme/` الألوان والمسافات. `src/i18n/` النصوص.
- `src/services/` الوصول للبيانات. `src/lib/` إعدادات وعميل Supabase.
- `src/data/mock/` بيانات تجريبية فقط، لا تُعرض إلا مع `EXPO_PUBLIC_USE_MOCK_DATA=true` وبشارة واضحة.

## الأمان
- لا يوضع في التطبيق إلا المفتاح العام `anon`. مفتاح `service_role` وأي مفتاح ذكاء اصطناعي يبقى على الخادم (Edge Functions).

## قاعدة البيانات (Supabase)
- `supabase/migrations/` الجداول، سياسات RLS، وقيد منع الحجز المزدوج. تُطبَّق بالترتيب.
- `supabase/seed/demo.sql` بيانات تجريبية (`is_demo = true`) لمشروع التطوير فقط؛ التطبيق يستبعدها دائمًا.
- `supabase/tests/` اختبارات الأمان والحجز (تعمل على PostgreSQL محلي مع محاكاة بسيطة لـ Supabase).

### الحجز
- طلب الحجز يُنشأ بحالة `pending` ويحجز السرير **48 ساعة** بانتظار موافقة المالك. المهلة والسعر يحددهما الخادم.
- بعد انتهاء المهلة لا يحجب الطلب السرير، ويُعلَّم `expired`. للتنظيف الدوري فعّل إضافة **pg_cron**
  من Database → Extensions ثم نفّذ: `select cron.schedule('expire-stale-bookings', '*/10 * * * *', 'select public.expire_stale_bookings()');`
- لا يوجد دفع إلكتروني في هذه المرحلة.

التطبيق على مشروعك: في لوحة Supabase افتح **SQL Editor** والصق كل ملف من `migrations` بالترتيب ثم **Run**.
أو: `npx supabase link --project-ref <ref>` ثم `npx supabase db push`.

## اللغات
النصوص في `src/i18n/ar.ts` و`src/i18n/en.ts` (نفس المفاتيح، يتحقق منها TypeScript واختبار).
بيانات العقارات ثنائية اللغة في القاعدة (`title_ar` / `title_en` ...). تغيير اللغة من تبويب "حسابي".
