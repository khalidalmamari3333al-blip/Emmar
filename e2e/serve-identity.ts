// تشغيل دالة identity محليًا للاختبارات الشاملة (المزود التجريبي مفعّل).
import { handle } from '../supabase/functions/identity/handler.ts';

Deno.serve({ port: 8003 }, (req) =>
  handle(req, { url: Deno.env.get('SUPABASE_URL'), anonKey: Deno.env.get('SUPABASE_ANON_KEY'), serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), mode: 'mock' }),
);
