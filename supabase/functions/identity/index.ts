// Supabase Edge Function: التحقق من الهوية.
// النشر: supabase functions deploy identity
// الأسرار: IDENTITY_MODE=mock (للعرض فقط). عند اعتماد «ثقة»: THEQA_CLIENT_ID, THEQA_CLIENT_SECRET, THEQA_REDIRECT_URL
import { handle } from './handler.ts';

Deno.serve((req) =>
  handle(req, {
    url: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    mode: Deno.env.get('IDENTITY_MODE'),
    theqa: { clientId: Deno.env.get('THEQA_CLIENT_ID'), clientSecret: Deno.env.get('THEQA_CLIENT_SECRET'), redirectUrl: Deno.env.get('THEQA_REDIRECT_URL') },
  }),
);
