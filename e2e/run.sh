#!/usr/bin/env bash
# يشغّل الاختبارات الشاملة ضد Supabase محلي. يفترض أن الخدمات تعمل على:
#   GoTrue: localhost:59999 ، PostgREST: localhost:53000 (انظر e2e/README.md)
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET="${E2E_JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
node e2e/proxy.mjs & PROXY=$!
sleep 1
export EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$(node e2e/jwt.mjs "$SECRET" anon)"
export E2E_SERVICE_ROLE_KEY="$(node e2e/jwt.mjs "$SECRET" service_role)"

# المساعد: Edge Function الحقيقية تحت Deno مع خادم Claude وهمي
node e2e/fake-claude.mjs & FAKE=$!
SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$E2E_SERVICE_ROLE_KEY \
  ANTHROPIC_API_KEY=fake-key-for-e2e ANTHROPIC_BASE_URL=http://localhost:4010 \
  npx -y deno@2 run --quiet --allow-net --allow-env --allow-read --config supabase/functions/assistant/deno.json supabase/functions/assistant/index.ts & FN=$!
# المدفوعات: الدالة الحقيقية تحت Deno بسر Webhook محلي للاختبار فقط
export E2E_PAYMENT_SECRET="e2e-webhook-secret-$(date +%s)-local"
SUPABASE_URL=$EXPO_PUBLIC_SUPABASE_URL SUPABASE_ANON_KEY=$EXPO_PUBLIC_SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY=$E2E_SERVICE_ROLE_KEY \
  PAYMENT_WEBHOOK_SECRET=$E2E_PAYMENT_SECRET \
  npx -y deno@2 run --quiet --allow-net --allow-env --allow-read --config supabase/functions/payments/deno.json e2e/serve-payments.ts & PAY=$!
trap 'kill $PROXY $FAKE $FN $PAY 2>/dev/null || true' EXIT
until curl -s -o /dev/null localhost:8000; do sleep 1; done
until curl -s -o /dev/null localhost:8001; do sleep 1; done

npx jest -c e2e/jest.config.js "$@"
