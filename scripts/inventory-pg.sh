#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|dropdb}" >&2
  exit 2
fi

INVENTORY_PG_DB_URL="${INVENTORY_PG_DB_URL:-}"
if [ -z "$INVENTORY_PG_DB_URL" ]; then
  echo "ERROR: INVENTORY_PG_DB_URL is required and must point to a generated plush_erp_ci_<run-id> database" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
postgres_target_helper="$script_dir/qa/postgres-target-contract.py"
base_target_fields=()
while IFS= read -r -d '' target_field; do
  base_target_fields+=("$target_field")
done < <(
  python3 "$postgres_target_helper" base inventory "$INVENTORY_PG_DB_URL" "$cmd"
)
unset target_field
if [[ "${#base_target_fields[@]}" -ne 5 || "${base_target_fields[4]}" != 'ok' ]]; then
  echo "ERROR: PostgreSQL target contract validation failed" >&2
  exit 1
fi
INVENTORY_PG_DB_HOST="${base_target_fields[0]}"
INVENTORY_PG_DB_NAME="${base_target_fields[1]}"
INVENTORY_PG_DB_SAFE_URL="${base_target_fields[2]}"
INVENTORY_PG_ADMIN_DB_URL="${base_target_fields[3]}"
unset base_target_fields

echo "inventory target host=${INVENTORY_PG_DB_HOST} db=${INVENTORY_PG_DB_NAME}"
echo "inventory target dsn=${INVENTORY_PG_DB_SAFE_URL}"

case "$cmd" in
createdb)
  psql "$INVENTORY_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${INVENTORY_PG_DB_NAME}'" | grep -q 1 ||
    psql "$INVENTORY_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${INVENTORY_PG_DB_NAME}\""
  ;;
status)
  atlas migrate status --dir "file://internal/data/model/migrate" --url "$INVENTORY_PG_DB_URL"
  ;;
apply)
  atlas migrate apply --dir "file://internal/data/model/migrate" --url "$INVENTORY_PG_DB_URL"
  PLUSH_DATABASE_PROGRAMMABILITY_URL="$INVENTORY_PG_DB_URL" \
    node ../scripts/qa/database-programmability.mjs \
    --database-url-env PLUSH_DATABASE_PROGRAMMABILITY_URL
  ;;
test)
  INVENTORY_PG_TEST=1 INVENTORY_PG_TEST_DB_URL="$INVENTORY_PG_DB_URL" \
    go test ./internal/data -run '^(TestInventoryPostgres|TestOperationalFactPostgres)' -count=1
  ;;
dropdb)
  psql "$INVENTORY_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${INVENTORY_PG_DB_NAME}\" WITH (FORCE)"
  ;;
*)
  echo "unknown command: $cmd" >&2
  exit 2
  ;;
esac
