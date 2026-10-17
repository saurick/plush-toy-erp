#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
fixture_id="plush-model-integrity-$(date +%s)-$$"
database_name="plush_erp_ci_model_$(date +%s)_$$"
cleanup() {
  local status=$?
  trap - EXIT
  if ! docker rm -f "$fixture_id" >/dev/null 2>&1; then
    echo "ERROR: failed to remove disposable container $fixture_id" >&2
    status=1
  fi
  if docker inspect "$fixture_id" >/dev/null 2>&1; then
    echo "ERROR: disposable container still exists: $fixture_id" >&2
    status=1
  fi
  exit "$status"
}

# This container has no mounted data and binds only to a random loopback port.
docker run -d --name "$fixture_id" -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e "POSTGRES_DB=$database_name" -p 127.0.0.1::5432 postgres:18.6 >/dev/null
trap cleanup EXIT
pg_port="$(docker port "$fixture_id" 5432/tcp | awk -F: '{print $NF}')"
export PGDATABASE="postgres://postgres@127.0.0.1:$pg_port/$database_name?sslmode=disable"
for attempt in $(seq 1 60); do
  if psql "$PGDATABASE" -XAtqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 60 ]]; then
    echo 'Disposable PostgreSQL startup failed' >&2
    exit 1
  fi
  sleep 0.5
done
export GIT_OPTIONAL_LOCKS=0
cd "$ROOT_DIR"
previous_version="$(node --input-type=module -e "import { readdirSync } from 'node:fs'; const files=readdirSync('server/internal/data/model/migrate').filter(f=>f.endsWith('.sql')&&f<'20261017085605').sort(); console.log(files.at(-1).slice(0,14))")"
atlas migrate apply --dir file://server/internal/data/model/migrate --url "$PGDATABASE" --to-version "$previous_version"
DATA_MODEL_INTEGRITY_TEST_DATABASE_URL="$PGDATABASE" node --test scripts/qa/data-model-integrity-postgres.test.mjs
atlas migrate apply --dir file://server/internal/data/model/migrate --url "$PGDATABASE"
fresh_database_name="${database_name}_fresh"
createdb --maintenance-db "$PGDATABASE" "$fresh_database_name"
export PGDATABASE="postgres://postgres@127.0.0.1:$pg_port/$fresh_database_name?sslmode=disable"
atlas migrate apply --dir file://server/internal/data/model/migrate --url "$PGDATABASE"
cd "$ROOT_DIR/server"
PURCHASE_RECEIPT_PG_DB_URL="$PGDATABASE" bash ../scripts/purchase-receipt-pg.sh test-critical
echo 'Data model fresh/upgrade/rollback and critical PostgreSQL business checks passed'
