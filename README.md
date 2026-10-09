# عقاري عُمان (Aqari Oman)

تطبيق عقاري للسوق العُماني (صحار ومسقط): إيجار، بيع، وسكن طلابي بالسرير.
React Native + Expo (SDK 57) + TypeScript + Supabase، بواجهة عربية RTL بهوية عُمانية حديثة.

## التشغيل
```bash
npm install
cp .env.example .env   # ثم املأ القيم
npm start              # أو: npm run web
```

## الفحوصات
```bash
npm run typecheck
npm run lint
npm test
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
