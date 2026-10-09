# نشر التطبيق والحصول على رابط

## 1) أول مدير للمنصة (مرة واحدة)
سجّل حسابك من التطبيق، ثم في **SQL Editor** في Supabase:
```sql
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'بريدك@example.com');
```
بعدها تظهر لك "لوحة الإدارة" في تبويب حسابي، ومنها ترقّي الملاك (مستخدم ← مالك).

## 2) رابط ويب عام (EAS Hosting من Expo — مجاني للبداية)
```bash
# مرة واحدة: أنشئ حسابًا مجانيًا على expo.dev ثم
npx eas-cli@latest login

# تأكد أن .env يحتوي قيم مشروعك و EXPO_PUBLIC_USE_MOCK_DATA=false
npm run deploy:web
```
في المرة الأولى يسألك عن اسم فرعي للرابط (مثل `aqari-oman`)، وفي النهاية يطبع رابطًا بشكل
`https://aqari-oman.expo.app`.

> قيم `EXPO_PUBLIC_*` تُضمَّن وقت البناء؛ بعد تغيير `.env` أعد `npm run deploy:web`.
> هذه الخطوات مكتوبة حسب أداة `eas deploy`؛ إن تغيّر شيء فراجع https://docs.expo.dev/eas/hosting/get-started/

## 3) إعداد Supabase للرابط
في **Authentication → URL Configuration**:
- **Site URL**: رابط موقعك، مثل `https://aqari-oman.expo.app`
- **Redirect URLs**: أضف الرابط نفسه.

حتى يفتح رابط تأكيد البريد موقعك بدل صفحة لا تعمل.

## 4) على الهاتف (تجربة)
```bash
npx expo start --tunnel --clear
```
امسح رمز QR بتطبيق **Expo Go** (أندرويد/آيفون).

## 5) لاحقًا: نشر في المتاجر
بناء تطبيقات المتاجر يتم عبر `eas build` ويتطلب حساب مطوّر Google Play (رسوم لمرة واحدة)
وApple Developer (اشتراك سنوي). نجهّزه في مرحلة مستقلة.

## 6) تفعيل المساعد الذكي
المساعد يعمل في Supabase Edge Function اسمها `assistant`، ومفتاح Claude يُحفظ على الخادم فقط.

1. طبّق `supabase/migrations/20261110000001_assistant.sql` في SQL Editor.
2. أنشئ مفتاح API من https://console.anthropic.com (Settings → API Keys) وأضف رصيدًا.
3. من مجلد المشروع:
```bash
npx supabase login
npx supabase link --project-ref <ref>          # ref = الجزء الأول من رابط مشروعك
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
npx supabase functions deploy assistant
```
- لا تضع مفتاح Claude في `.env` ولا في التطبيق.
- النموذج: Claude Opus 5.5، بجهد `medium`. الحد اليومي: 30 رسالة لكل مستخدم (`DAILY_LIMIT` في `supabase/functions/assistant/core.ts`).
- مفعّل الرجوع التلقائي لنموذج بديل إن رفض النموذج طلبًا لأسباب أمان (`fallbacks: "default"`).
- راقب التكلفة من لوحة Anthropic Console → Usage.
