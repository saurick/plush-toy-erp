#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|dropdb}" >&2
  exit 2
fi

PURCHASE_RETURN_PG_DB_URL="${PURCHASE_RETURN_PG_DB_URL:-}"
if [ -z "$PURCHASE_RETURN_PG_DB_URL" ]; then
  echo "ERROR: PURCHASE_RETURN_PG_DB_URL is required and must point to a generated plush_erp_ci_<run-id> database" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
postgres_target_helper="$script_dir/qa/postgres-target-contract.py"
base_target_fields=()
while IFS= read -r -d '' target_field; do
  base_target_fields+=("$target_field")
done < <(
  python3 "$postgres_target_helper" base purchase-return "$PURCHASE_RETURN_PG_DB_URL" "$cmd"
)
unset target_field
if [[ "${#base_target_fields[@]}" -ne 5 || "${base_target_fields[4]}" != 'ok' ]]; then
  echo "ERROR: PostgreSQL target contract validation failed" >&2
  exit 1
fi
PURCHASE_RETURN_PG_DB_HOST="${base_target_fields[0]}"
PURCHASE_RETURN_PG_DB_NAME="${base_target_fields[1]}"
PURCHASE_RETURN_PG_DB_SAFE_URL="${base_target_fields[2]}"
PURCHASE_RETURN_PG_ADMIN_DB_URL="${base_target_fields[3]}"
unset base_target_fields

echo "purchase return target host=${PURCHASE_RETURN_PG_DB_HOST} db=${PURCHASE_RETURN_PG_DB_NAME}"
echo "purchase return target dsn=${PURCHASE_RETURN_PG_DB_SAFE_URL}"

run_verified_go_test() {
  local required_prefix="$1"
  shift
  local report_file
  report_file="$(mktemp)"
  (
    trap 'rm -f "$report_file"' EXIT
    "$@" | tee "$report_file"
    node ../scripts/qa/verify-go-test-json.mjs \
      --report "$report_file" \
      --require-prefix "$required_prefix"
  )
}

case "$cmd" in
createdb)
  psql "$PURCHASE_RETURN_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${PURCHASE_RETURN_PG_DB_NAME}'" | grep -q 1 ||
    psql "$PURCHASE_RETURN_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PURCHASE_RETURN_PG_DB_NAME}\""
  ;;
status)
  atlas migrate status --dir "file://internal/data/model/migrate" --url "$PURCHASE_RETURN_PG_DB_URL"
  ;;
apply)
  atlas migrate apply --dir "file://internal/data/model/migrate" --url "$PURCHASE_RETURN_PG_DB_URL"
  PLUSH_DATABASE_PROGRAMMABILITY_URL="$PURCHASE_RETURN_PG_DB_URL" \
    node ../scripts/qa/database-programmability.mjs \
    --database-url-env PLUSH_DATABASE_PROGRAMMABILITY_URL
  ;;
test)
  run_verified_go_test TestPurchaseReturnPostgres \
    env PURCHASE_RETURN_PG_TEST=1 PURCHASE_RETURN_PG_TEST_DB_URL="$PURCHASE_RETURN_PG_DB_URL" \
    go test -json ./internal/data -run '^TestPurchaseReturnPostgres' -count=1
  ;;
dropdb)
  psql "$PURCHASE_RETURN_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${PURCHASE_RETURN_PG_DB_NAME}\" WITH (FORCE)"
  ;;
*)
  echo "unknown command: $cmd" >&2
  exit 2
  ;;
esac
