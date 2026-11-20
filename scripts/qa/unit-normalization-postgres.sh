#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
fixture_id="plush-unit-$(date +%s)-$$"
database_name="plush_erp_ci_unit_$(date +%s)_$$"
cleanup() { docker rm -f "$fixture_id" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# The disposable container has no mounted data and exposes only a random
# loopback port. No registered development or customer database is used.
docker run -d --name "$fixture_id" -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e "POSTGRES_DB=$database_name" -p 127.0.0.1::5432 postgres:18.6 >/dev/null
pg_port="$(docker port "$fixture_id" 5432/tcp | awk -F: '{print $NF}')"
export PGDATABASE="postgres://postgres@127.0.0.1:$pg_port/$database_name?sslmode=disable"
for attempt in $(seq 1 60); do
  if psql "$PGDATABASE" -XAtqc 'SELECT 1' >/dev/null 2>&1; then break; fi
  if [[ "$attempt" == 60 ]]; then
    psql "$PGDATABASE" -XAtqc 'SELECT 1'
    echo 'Disposable PostgreSQL startup failed' >&2
    exit 1
  fi
  sleep 0.5
done
export GIT_OPTIONAL_LOCKS=0
cd "$ROOT_DIR"
previous_version="$(node --input-type=module -e "import { readdirSync } from 'node:fs'; const files=readdirSync('server/internal/data/model/migrate').filter(f=>f.endsWith('.sql')&&f<'20260927095806').sort(); console.log(files.at(-1).slice(0,14))")"
atlas migrate apply --dir file://server/internal/data/model/migrate --url "$PGDATABASE" --to-version "$previous_version"
export UNIT_NORMALIZATION_TEST_DATABASE_URL="$PGDATABASE"
node --test scripts/qa/unit-normalization-postgres.test.mjs
atlas migrate apply --dir file://server/internal/data/model/migrate --url "$PGDATABASE"
test "$(psql "$PGDATABASE" -XAtqc 'SELECT count(*) FROM units')" = 8
test "$(psql "$PGDATABASE" -XAtqc "SELECT count(*) FROM units WHERE (code IN ('EA','SET','PAIR','SHEET','STRIP','BLOCK') AND precision=0) OR (code='YD' AND precision=6) OR (code='KG' AND precision=3)")" = 8
export PURCHASE_RECEIPT_PG_TEST=1 PURCHASE_RECEIPT_PG_TEST_DB_URL="$PGDATABASE"
export INVENTORY_PG_TEST=1 INVENTORY_PG_TEST_DB_URL="$PGDATABASE"
cd "$ROOT_DIR/server"
go test ./internal/data -v -count=1 -run 'TestInventoryPostgresFlow|TestInventoryPostgresFactTimeIdempotency|TestInventoryPostgresConcurrentOutbound|TestOperationalFactPostgresOutsourcingMaterialIssueWithoutLotPostAndCancel'
echo 'Unit migration fresh/upgrade/rollback and PostgreSQL business checks passed'
