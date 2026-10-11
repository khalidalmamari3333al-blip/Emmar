// Supabase Edge Function: الخصوصية (للإدارة). النشر: supabase functions deploy privacy
import { handle } from './handler.ts';

Deno.serve((req) =>
  handle(req, {
    url: Deno.env.get('SUPABASE_URL'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  }),
);
