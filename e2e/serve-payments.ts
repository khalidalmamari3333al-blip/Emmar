// تشغيل دالة payments محليًا للاختبارات الشاملة (Supabase يستخدم index.ts مباشرة).
import { handle } from '../supabase/functions/payments/handler.ts';

Deno.serve({ port: 8001 }, (req) =>
  handle(req, {
    url: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    webhookSecret: Deno.env.get('PAYMENT_WEBHOOK_SECRET'),
    mode: 'mock',
  }),
);
