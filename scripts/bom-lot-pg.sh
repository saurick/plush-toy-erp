#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|dropdb}" >&2
  exit 2
fi

BOM_LOT_PG_DB_URL="${BOM_LOT_PG_DB_URL:-}"
if [ -z "$BOM_LOT_PG_DB_URL" ]; then
  echo "ERROR: BOM_LOT_PG_DB_URL is required and must point to a generated plush_erp_ci_<run-id> database" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
postgres_target_helper="$script_dir/qa/postgres-target-contract.py"
base_target_fields=()
while IFS= read -r -d '' target_field; do
  base_target_fields+=("$target_field")
done < <(
  python3 "$postgres_target_helper" base bom-lot "$BOM_LOT_PG_DB_URL" "$cmd"
)
unset target_field
if [[ "${#base_target_fields[@]}" -ne 5 || "${base_target_fields[4]}" != 'ok' ]]; then
  echo "ERROR: PostgreSQL target contract validation failed" >&2
  exit 1
fi
BOM_LOT_PG_DB_HOST="${base_target_fields[0]}"
BOM_LOT_PG_DB_NAME="${base_target_fields[1]}"
BOM_LOT_PG_DB_SAFE_URL="${base_target_fields[2]}"
BOM_LOT_PG_ADMIN_DB_URL="${base_target_fields[3]}"
unset base_target_fields

echo "bom-lot target host=${BOM_LOT_PG_DB_HOST} db=${BOM_LOT_PG_DB_NAME}"
echo "bom-lot target dsn=${BOM_LOT_PG_DB_SAFE_URL}"

case "$cmd" in
createdb)
  psql "$BOM_LOT_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${BOM_LOT_PG_DB_NAME}'" | grep -q 1 ||
    psql "$BOM_LOT_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${BOM_LOT_PG_DB_NAME}\""
  ;;
status)
  atlas migrate status --dir "file://internal/data/model/migrate" --url "$BOM_LOT_PG_DB_URL"
  ;;
apply)
  atlas migrate apply --dir "file://internal/data/model/migrate" --url "$BOM_LOT_PG_DB_URL"
  PLUSH_DATABASE_PROGRAMMABILITY_URL="$BOM_LOT_PG_DB_URL" \
    node ../scripts/qa/database-programmability.mjs \
    --database-url-env PLUSH_DATABASE_PROGRAMMABILITY_URL
  ;;
test)
  BOM_LOT_PG_TEST=1 BOM_LOT_PG_TEST_DB_URL="$BOM_LOT_PG_DB_URL" go test ./internal/data -run TestInventoryLotPostgres -count=1
  ;;
dropdb)
  psql "$BOM_LOT_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${BOM_LOT_PG_DB_NAME}\" WITH (FORCE)"
  ;;
*)
  echo "unknown command: $cmd" >&2
  exit 2
  ;;
esac
