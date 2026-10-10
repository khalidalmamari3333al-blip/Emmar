// Supabase Edge Function: المدفوعات (مزود تجريبي فقط حاليًا).
// الأسرار: supabase secrets set PAYMENT_WEBHOOK_SECRET=<32+ حرفًا عشوائيًا> PAYMENTS_MODE=mock
// النشر: supabase functions deploy payments --no-verify-jwt   (أحداث المزود لا تحمل JWT؛ تُقبل بتوقيع HMAC فقط)
import { handle } from './handler.ts';

Deno.serve((req) =>
  handle(req, {
    url: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    webhookSecret: Deno.env.get('PAYMENT_WEBHOOK_SECRET'),
    mode: Deno.env.get('PAYMENTS_MODE') ?? 'mock',
  }),
);
