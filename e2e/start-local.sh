#!/usr/bin/env bash
# يشغّل Supabase محليًا بأقل الخدمات (Postgres + Auth + REST) للاختبار الشامل.
# يحتاج Docker. لا علاقة له بمشروعك على supabase.com.
# البديل الرسمي الكامل: npx supabase start
set -euo pipefail
cd "$(dirname "$0")/.."
SECRET="${E2E_JWT_SECRET:-super-secret-jwt-token-with-at-least-32-characters-long}"

docker network create aq >/dev/null 2>&1 || true
docker rm -f aq-db aq-auth aq-rest >/dev/null 2>&1 || true

docker run -d --name aq-db --network aq -e POSTGRES_PASSWORD=postgres -p 55432:5432 supabase/postgres:17.11.0.004 >/dev/null
until docker exec aq-db pg_isready -U postgres -h localhost >/dev/null 2>&1; do sleep 2; done; sleep 5
docker exec aq-db psql -U supabase_admin -d postgres -qc "alter role supabase_auth_admin with password 'postgres'; alter role authenticator with password 'postgres';"

docker run -d --name aq-auth --network aq -p 59999:9999 \
  -e GOTRUE_API_HOST=0.0.0.0 -e PORT=9999 -e API_EXTERNAL_URL=http://localhost:54321 \
  -e GOTRUE_DB_DRIVER=postgres -e GOTRUE_DB_DATABASE_URL="postgres://supabase_auth_admin:postgres@aq-db:5432/postgres" \
  -e GOTRUE_SITE_URL=http://localhost:8081 -e GOTRUE_JWT_SECRET="$SECRET" -e GOTRUE_JWT_EXP=3600 -e GOTRUE_JWT_AUD=authenticated \
  -e GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated -e GOTRUE_JWT_ADMIN_ROLES=service_role \
  -e GOTRUE_EXTERNAL_EMAIL_ENABLED=true -e GOTRUE_MAILER_AUTOCONFIRM=true -e GOTRUE_DISABLE_SIGNUP=false \
  supabase/gotrue:v2.197.0 >/dev/null
until curl -sf localhost:59999/health >/dev/null; do sleep 2; done

# مخطط storage مبسط (تنشئه خدمة Storage في Supabase الحقيقي)
docker exec -i aq-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q < e2e/storage_min.sql
docker exec aq-db psql -U supabase_admin -d postgres -qc "alter table storage.buckets owner to postgres; alter table storage.objects owner to postgres; alter function storage.foldername(text) owner to postgres; grant usage on schema storage to postgres, anon, authenticated;"

for f in supabase/migrations/*.sql; do
  docker exec -i aq-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$f" 2>&1 | grep -v "no privileges could be revoked" || true
done
docker exec -i aq-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/seed/demo.sql

docker run -d --name aq-rest --network aq -p 53000:3000 -e PGRST_DB_URI="postgres://authenticator:postgres@aq-db:5432/postgres" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$SECRET" postgrest/postgrest:v16.4 >/dev/null
until curl -sf localhost:53000/ >/dev/null; do sleep 1; done
echo "Local Supabase ready. Run: npm run test:e2e"
