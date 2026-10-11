#!/usr/bin/env bash
# يشغّل اختبارات قاعدة البيانات على PostgreSQL مؤقت (يحتاج PostgreSQL 15+ مثبتًا محليًا).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
TMP="$(mktemp -d)"
RUN=()
if [ "$(id -u)" = 0 ]; then chown postgres "$TMP"; RUN=(runuser -u postgres --); fi
trap '"${RUN[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$TMP/data" -U postgres -A trust >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$TMP/data" -o "-k $TMP -p 54329 -c listen_addresses=''" -l "$TMP/log" start -w >/dev/null

PSQL=("${RUN[@]}" "$PGBIN/psql" -h "$TMP" -p 54329 -U postgres -d postgres -v ON_ERROR_STOP=1 -q -t -o /dev/null)
cd "$ROOT"
"${PSQL[@]}" -f supabase/tests/supabase_stub.sql
for f in supabase/migrations/*.sql; do "${PSQL[@]}" -f "$f"; done
"${PSQL[@]}" -f supabase/tests/security_test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
