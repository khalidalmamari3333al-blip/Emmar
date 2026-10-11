// تشغيل دالة privacy محليًا للاختبارات الشاملة.
import { handle } from '../supabase/functions/privacy/handler.ts';

Deno.serve({ port: 8002 }, (req) =>
  handle(req, { url: Deno.env.get('SUPABASE_URL'), anonKey: Deno.env.get('SUPABASE_ANON_KEY'), serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') }),
);
