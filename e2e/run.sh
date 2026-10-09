#!/usr/bin/env bash
# يشغّل الاختبارات الشاملة ضد Supabase محلي. يفترض أن الخدمات تعمل على:
#   GoTrue: localhost:59999 ، PostgREST: localhost:53000 (انظر e2e/README.md)
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET="${E2E_JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"
node e2e/proxy.mjs & PROXY=$!
trap 'kill $PROXY 2>/dev/null || true' EXIT
sleep 1
export EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
export EXPO_PUBLIC_SUPABASE_ANON_KEY="$(node e2e/jwt.mjs "$SECRET" anon)"
export E2E_SERVICE_ROLE_KEY="$(node e2e/jwt.mjs "$SECRET" service_role)"
npx jest -c e2e/jest.config.js "$@"
