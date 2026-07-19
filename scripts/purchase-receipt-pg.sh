#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# script_dir pins the shared PostgreSQL contract; ShellCheck scans it separately.
# shellcheck disable=SC1091
source "$script_dir/qa/critical-postgres-tests.sh"

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|test-workflow|test-critical|test-critical-disposable|test-populated-upgrade|dropdb}" >&2
  exit 2
fi

PURCHASE_RECEIPT_PG_DB_URL="${PURCHASE_RECEIPT_PG_DB_URL:-postgres://postgres:purchase-receipt-local-password@127.0.0.1:55432/plush_erp_purchase_receipt_test?sslmode=disable}"

parse_output="$(
  python3 - "$PURCHASE_RECEIPT_PG_DB_URL" <<'PY'
import re
import shlex
import sys
import urllib.parse

raw = sys.argv[1]
u = urllib.parse.urlparse(raw)
if u.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("ERROR: PURCHASE_RECEIPT_PG_DB_URL must use postgres/postgresql scheme")
host = u.hostname or ""
dbname = (u.path or "").lstrip("/")
allowed_hosts = {
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "purchase-receipt-postgres",
    "plush-toy-erp-purchase-receipt-postgres",
            "host.docker.internal",
}
if host not in allowed_hosts:
    raise SystemExit(f"ERROR: refuse non-local PURCHASE_RECEIPT_PG_DB_URL host: {host}")
if not dbname:
    raise SystemExit("ERROR: PURCHASE_RECEIPT_PG_DB_URL missing database name")
if "purchase_receipt" not in dbname.lower() and "test" not in dbname.lower():
    raise SystemExit(f"ERROR: database name must contain purchase_receipt or test: {dbname}")
if not re.fullmatch(r"[A-Za-z0-9_]+", dbname):
    raise SystemExit(f"ERROR: database name must be alphanumeric/underscore only: {dbname}")

port = u.port or 5432
user = urllib.parse.unquote(u.username or "")
hostport = f"[{host}]:{port}" if ":" in host and not host.startswith("[") else f"{host}:{port}"
safe_netloc = f"{user}@{hostport}" if user else hostport
safe_url = urllib.parse.urlunparse((u.scheme, safe_netloc, "/" + dbname, "", u.query, ""))
admin_url = urllib.parse.urlunparse(u._replace(path="/postgres"))

def emit(name, value):
    print(f"{name}={shlex.quote(value)}")

emit("PURCHASE_RECEIPT_PG_DB_HOST", host)
emit("PURCHASE_RECEIPT_PG_DB_NAME", dbname)
emit("PURCHASE_RECEIPT_PG_DB_SAFE_URL", safe_url)
emit("PURCHASE_RECEIPT_PG_ADMIN_DB_URL", admin_url)
PY
)" || exit 1
eval "$parse_output"

echo "purchase receipt target host=${PURCHASE_RECEIPT_PG_DB_HOST} db=${PURCHASE_RECEIPT_PG_DB_NAME}"
echo "purchase receipt target dsn=${PURCHASE_RECEIPT_PG_DB_SAFE_URL}"

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

run_disposable_critical_gate() {
  local critical_target
  critical_target="$(
    python3 - "$PURCHASE_RECEIPT_PG_DB_URL" "$$" <<'PY'
import re
import secrets
import shlex
import sys
import urllib.parse

raw, process_id = sys.argv[1:]
url = urllib.parse.urlparse(raw)
base_name = (url.path or "").lstrip("/")
suffix = f"_critical_{process_id}_{secrets.token_hex(4)}"
database_name = base_name[: 63 - len(suffix)] + suffix
if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
    raise SystemExit(f"ERROR: unsafe disposable critical database name: {database_name}")
database_url = urllib.parse.urlunparse(url._replace(path="/" + database_name))
print(f"CRITICAL_DATABASE_NAME={shlex.quote(database_name)}")
print(f"CRITICAL_DATABASE_URL={shlex.quote(database_url)}")
PY
  )" || exit 1
  eval "$critical_target"

  CRITICAL_DATABASE_CREATED=0
  cleanup_disposable_critical_gate() {
    CRITICAL_STATUS=$?
    trap - EXIT HUP INT TERM
    if [ "$CRITICAL_DATABASE_CREATED" -eq 1 ]; then
      set +e
      psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"${CRITICAL_DATABASE_NAME}\" WITH (FORCE)"
      CRITICAL_DROP_STATUS=$?
      set -e
      if [ "$CRITICAL_DROP_STATUS" -ne 0 ]; then
        echo "ERROR: failed to drop disposable critical database ${CRITICAL_DATABASE_NAME}" >&2
        if [ "$CRITICAL_STATUS" -eq 0 ]; then
          CRITICAL_STATUS=$CRITICAL_DROP_STATUS
        fi
      fi
    fi
    exit "$CRITICAL_STATUS"
  }
  trap cleanup_disposable_critical_gate EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  echo "[qa:critical-postgres] create disposable db=${CRITICAL_DATABASE_NAME}"
  psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"${CRITICAL_DATABASE_NAME}\""
  CRITICAL_DATABASE_CREATED=1

  PURCHASE_RECEIPT_PG_DB_URL="$CRITICAL_DATABASE_URL" "$0" apply
  PURCHASE_RECEIPT_PG_DB_URL="$CRITICAL_DATABASE_URL" "$0" status
  PURCHASE_RECEIPT_PG_DB_URL="$CRITICAL_DATABASE_URL" "$0" test-critical
  echo "[qa:critical-postgres] status=complete disposable=1"
}

case "$cmd" in
createdb)
  psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${PURCHASE_RECEIPT_PG_DB_NAME}'" | grep -q 1 ||
    psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PURCHASE_RECEIPT_PG_DB_NAME}\""
  ;;
status)
  atlas migrate status --dir "file://internal/data/model/migrate" --url "$PURCHASE_RECEIPT_PG_DB_URL"
  ;;
apply)
  atlas migrate apply --dir "file://internal/data/model/migrate" --url "$PURCHASE_RECEIPT_PG_DB_URL"
  ;;
test)
  run_verified_go_test TestPurchaseReceiptPostgres \
    env PURCHASE_RECEIPT_PG_TEST=1 PURCHASE_RECEIPT_PG_TEST_DB_URL="$PURCHASE_RECEIPT_PG_DB_URL" \
    go test -json ./internal/data -run '^TestPurchaseReceiptPostgres' -count=1
  ;;
test-workflow)
  run_verified_go_test TestWorkflowPostgres \
    env PURCHASE_RECEIPT_PG_TEST=1 PURCHASE_RECEIPT_PG_TEST_DB_URL="$PURCHASE_RECEIPT_PG_DB_URL" \
    go test -json ./internal/data -run '^TestWorkflowPostgres' -count=1
  ;;
test-critical)
  report_file="$(mktemp)"
  trap 'rm -f "$report_file"' EXIT
  PURCHASE_RECEIPT_PG_TEST=1 PURCHASE_RECEIPT_PG_TEST_DB_URL="$PURCHASE_RECEIPT_PG_DB_URL" \
    INVENTORY_PG_TEST=1 INVENTORY_PG_TEST_DB_URL="$PURCHASE_RECEIPT_PG_DB_URL" \
    BOM_LOT_PG_TEST=1 BOM_LOT_PG_TEST_DB_URL="$PURCHASE_RECEIPT_PG_DB_URL" \
    PURCHASE_RETURN_PG_TEST=1 PURCHASE_RETURN_PG_TEST_DB_URL="$PURCHASE_RECEIPT_PG_DB_URL" \
    go test -json ./internal/data \
    -run "$CRITICAL_POSTGRES_TEST_PATTERN" \
    -count=1 | tee "$report_file"
  verify_args=(--report "$report_file")
  for test_prefix in "${CRITICAL_POSTGRES_REQUIRED_PREFIXES[@]}"; do
    verify_args+=(--require-prefix "$test_prefix")
  done
  node ../scripts/qa/verify-go-test-json.mjs "${verify_args[@]}"
  ;;
test-critical-disposable)
  run_disposable_critical_gate
  ;;
test-populated-upgrade)
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  root_dir="$(cd "$script_dir/.." && pwd)"
  migration_dir="$root_dir/server/internal/data/model/migrate"
  fixture_file="$root_dir/scripts/qa/fixtures/populated-upgrade-20260710150001.sql"
  net_weight_fixture_file="$root_dir/scripts/qa/fixtures/net-weight-kg-to-g-20260714165115.sql"
  preflight_script="$root_dir/scripts/qa/populated-upgrade-preflight.sh"
  cutover_preflight_sql="$root_dir/scripts/qa/customer-config-cutover-20260714055825.sql"
  populated_report_file=""
  populated_database_created=0
  POPULATED_UPGRADE_DB_NAME=""
  POPULATED_UPGRADE_DB_URL=""
  POPULATED_LEGAL_HASH=""
  POPULATED_EXPECTED_ROW_COUNT=13

  for required_command in atlas psql; do
    if ! command -v "$required_command" >/dev/null 2>&1; then
      echo "ERROR: test-populated-upgrade requires $required_command" >&2
      exit 1
    fi
  done
  for required_file in "$fixture_file" "$net_weight_fixture_file" "$preflight_script" "$cutover_preflight_sql"; do
    if [[ ! -f "$required_file" ]]; then
      echo "ERROR: test-populated-upgrade required file is missing: $required_file" >&2
      exit 1
    fi
  done

  populated_target="$({
    python3 - "$PURCHASE_RECEIPT_PG_DB_URL" "$PURCHASE_RECEIPT_PG_DB_NAME" "$$" "$RANDOM" <<'PY'
import re
import shlex
import sys
import urllib.parse

raw, base_name, process_id, random_value = sys.argv[1:]
suffix = f"_populated_{process_id}_{random_value}"
prefix = base_name[: 63 - len(suffix)]
database_name = prefix + suffix
if not re.fullmatch(r"[A-Za-z0-9_]+", database_name):
    raise SystemExit(f"ERROR: unsafe populated-upgrade database name: {database_name}")

url = urllib.parse.urlparse(raw)
database_url = urllib.parse.urlunparse(url._replace(path="/" + database_name))
print(f"POPULATED_UPGRADE_DB_NAME={shlex.quote(database_name)}")
print(f"POPULATED_UPGRADE_DB_URL={shlex.quote(database_url)}")
PY
  })" || exit 1
  eval "$populated_target"

  cleanup_populated_upgrade() {
    local cleanup_status=$?
    trap - EXIT
    rm -f "${populated_report_file:-}"
    if [[ "$populated_database_created" -eq 1 ]]; then
      if ! psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 \
        -c "DROP DATABASE IF EXISTS \"${POPULATED_UPGRADE_DB_NAME}\" WITH (FORCE)"; then
        echo "ERROR: failed to drop populated-upgrade database ${POPULATED_UPGRADE_DB_NAME}" >&2
        if [[ "$cleanup_status" -eq 0 ]]; then
          cleanup_status=1
        fi
      fi
    fi
    exit "$cleanup_status"
  }
  trap cleanup_populated_upgrade EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  populated_psql() {
    psql "$POPULATED_UPGRADE_DB_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 "$@"
  }

  populated_hash() {
    local snapshot_hash
    snapshot_hash="$({
      populated_psql -Atq <<'SQL'
WITH synthetic_rows AS (
  SELECT 'unit:' || id::text AS row_key, to_jsonb(row_data) AS payload
    FROM units AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'product:' || id::text, to_jsonb(row_data)
    FROM products AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'bom:' || id::text, to_jsonb(row_data)
    FROM bom_headers AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'finance:' || id::text, to_jsonb(row_data)
    FROM finance_facts AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'role:' || id::text, to_jsonb(row_data)
    FROM roles AS row_data
   WHERE id IN (910001, 910002, 910003)
  UNION ALL
  SELECT 'process:' || id::text, to_jsonb(row_data)
    FROM process_instances AS row_data
   WHERE id IN (910001, 910002)
  UNION ALL
  SELECT 'node:' || id::text, to_jsonb(row_data)
    FROM process_node_instances AS row_data
   WHERE id IN (910001, 910002)
  UNION ALL
  SELECT 'workflow-state:' || id::text, to_jsonb(row_data)
    FROM workflow_business_states AS row_data
   WHERE id = 910001
  UNION ALL
  SELECT 'workflow-task:' || id::text, to_jsonb(row_data)
    FROM workflow_tasks AS row_data
   WHERE id = 910001
)
SELECT count(*)::text || ':' || md5(string_agg(row_key || ':' || payload::text, E'\n' ORDER BY row_key))
  FROM synthetic_rows;
SQL
    })"
    if [[ "$snapshot_hash" != "${POPULATED_EXPECTED_ROW_COUNT}:"* ]]; then
      echo "ERROR: populated-upgrade fixture row set is incomplete: ${snapshot_hash:-empty}" >&2
      return 1
    fi
    printf '%s\n' "$snapshot_hash"
  }

  run_populated_preflight() {
    POPULATED_UPGRADE_DATABASE_URL="$POPULATED_UPGRADE_DB_URL" \
      sh "$preflight_script" \
      --audit populated-upgrade \
      --database-url-env POPULATED_UPGRADE_DATABASE_URL
  }

  run_customer_config_cutover_preflight() {
    POPULATED_UPGRADE_DATABASE_URL="$POPULATED_UPGRADE_DB_URL" \
      sh "$preflight_script" \
      --audit customer-config-cutover \
      --database-url-env POPULATED_UPGRADE_DATABASE_URL
  }

  assert_customer_config_cutover_preflight_green() {
    local label="$1"
    local before_hash after_hash
    before_hash="$(populated_hash)"
    if ! run_customer_config_cutover_preflight; then
      echo "ERROR: customer config cutover preflight unexpectedly failed: $label" >&2
      return 1
    fi
    after_hash="$(populated_hash)"
    if [[ "$before_hash" != "$after_hash" ]]; then
      echo "ERROR: customer config cutover preflight modified synthetic rows: $label" >&2
      return 1
    fi
  }

  expect_customer_config_cutover_blocker() {
    local label="$1"
    local expected_message="$2"
    local before_hash after_hash preflight_status
    before_hash="$(populated_hash)"
    : >"$populated_report_file"
    set +e
    run_customer_config_cutover_preflight >"$populated_report_file" 2>&1
    preflight_status=$?
    set -e
    after_hash="$(populated_hash)"

    if [[ "$preflight_status" -eq 0 ]]; then
      cat "$populated_report_file" >&2
      echo "ERROR: customer config cutover preflight accepted blocker: $label" >&2
      return 1
    fi
    if ! grep -Fq "$expected_message" "$populated_report_file"; then
      cat "$populated_report_file" >&2
      echo "ERROR: customer config cutover blocker message is missing: $label" >&2
      return 1
    fi
    if [[ "$before_hash" != "$after_hash" ]]; then
      echo "ERROR: customer config cutover preflight modified blocked synthetic rows: $label" >&2
      return 1
    fi
  }

  assert_populated_preflight_green() {
    local label="$1"
    local before_hash after_hash
    before_hash="$(populated_hash)"
    if ! run_populated_preflight; then
      echo "ERROR: populated-upgrade preflight unexpectedly failed: $label" >&2
      return 1
    fi
    after_hash="$(populated_hash)"
    if [[ "$before_hash" != "$after_hash" ]]; then
      echo "ERROR: populated-upgrade preflight modified synthetic rows: $label" >&2
      return 1
    fi
  }

  expect_populated_blocker() {
    local label="$1"
    local expected_message="$2"
    local mutation_sql="$3"
    local restore_sql="$4"
    local before_hash after_hash restored_hash preflight_status

    populated_psql -q -c "BEGIN; ${mutation_sql}; COMMIT;"
    before_hash="$(populated_hash)"
    if [[ "$before_hash" == "$POPULATED_LEGAL_HASH" ]]; then
      echo "ERROR: populated-upgrade blocker mutation had no effect: $label" >&2
      return 1
    fi

    : >"$populated_report_file"
    set +e
    run_populated_preflight >"$populated_report_file" 2>&1
    preflight_status=$?
    set -e
    after_hash="$(populated_hash)"
    populated_psql -q -c "BEGIN; ${restore_sql}; COMMIT;"
    restored_hash="$(populated_hash)"

    if [[ "$preflight_status" -eq 0 ]]; then
      cat "$populated_report_file" >&2
      echo "ERROR: populated-upgrade preflight accepted blocker: $label" >&2
      return 1
    fi
    if ! grep -Fq "$expected_message" "$populated_report_file"; then
      cat "$populated_report_file" >&2
      echo "ERROR: populated-upgrade blocker message is missing: $label" >&2
      return 1
    fi
    if [[ "$before_hash" != "$after_hash" ]]; then
      echo "ERROR: populated-upgrade preflight modified blocker rows: $label" >&2
      return 1
    fi
    if [[ "$restored_hash" != "$POPULATED_LEGAL_HASH" ]]; then
      echo "ERROR: populated-upgrade blocker restore did not recover legal rows: $label" >&2
      return 1
    fi
    assert_populated_preflight_green "restored-$label"
  }

  apply_populated_upgrade_to() {
    local version="$1"
    atlas migrate apply \
      --dir "file://${migration_dir}" \
      --url "$POPULATED_UPGRADE_DB_URL" \
      --to-version "$version"
  }

  assert_net_weight_kg_fixture() {
    local readback
    readback="$(
      populated_psql -Atq <<'SQL'
SELECT weighted_product.unit_net_weight_kg::text
       || '|' || weighted_sku.unit_net_weight_kg::text
       || '|' || weighted_shipment.total_net_weight_kg::text
       || '|' || weighted_shipment.requested_total_net_weight_kg::text
       || '|' || weighted_item.unit_net_weight_kg_snapshot::text
       || '|' || (
         (null_product.unit_net_weight_kg IS NULL)::int
         + (null_sku.unit_net_weight_kg IS NULL)::int
         + (null_shipment.total_net_weight_kg IS NULL)::int
         + (null_shipment.requested_total_net_weight_kg IS NULL)::int
         + (null_item.unit_net_weight_kg_snapshot IS NULL)::int
       )::text
  FROM products AS weighted_product,
       products AS null_product,
       product_skus AS weighted_sku,
       product_skus AS null_sku,
       shipments AS weighted_shipment,
       shipments AS null_shipment,
       shipment_items AS weighted_item,
       shipment_items AS null_item
 WHERE weighted_product.id = 910001
   AND null_product.id = 910002
   AND weighted_sku.id = 910001
   AND null_sku.id = 910002
   AND weighted_shipment.id = 910001
   AND null_shipment.id = 910002
   AND weighted_item.id = 910001
   AND null_item.id = 910002;
SQL
    )"
    if [[ "$readback" != '0.425000|0.123456|12.345600|11.111111|0.425000|5' ]]; then
      echo "ERROR: populated-upgrade kg fixture mismatch: ${readback:-empty}" >&2
      return 1
    fi
  }

  assert_net_weight_gram_upgrade() {
    local readback column_readback constraint_readback
    readback="$(
      populated_psql -Atq <<'SQL'
SELECT weighted_product.unit_net_weight_g::text
       || '|' || weighted_sku.unit_net_weight_g::text
       || '|' || weighted_shipment.total_net_weight_g::text
       || '|' || weighted_shipment.requested_total_net_weight_g::text
       || '|' || weighted_item.unit_net_weight_g_snapshot::text
       || '|' || (
         (null_product.unit_net_weight_g IS NULL)::int
         + (null_sku.unit_net_weight_g IS NULL)::int
         + (null_shipment.total_net_weight_g IS NULL)::int
         + (null_shipment.requested_total_net_weight_g IS NULL)::int
         + (null_item.unit_net_weight_g_snapshot IS NULL)::int
       )::text
  FROM products AS weighted_product,
       products AS null_product,
       product_skus AS weighted_sku,
       product_skus AS null_sku,
       shipments AS weighted_shipment,
       shipments AS null_shipment,
       shipment_items AS weighted_item,
       shipment_items AS null_item
 WHERE weighted_product.id = 910001
   AND null_product.id = 910002
   AND weighted_sku.id = 910001
   AND null_sku.id = 910002
   AND weighted_shipment.id = 910001
   AND null_shipment.id = 910002
   AND weighted_item.id = 910001
   AND null_item.id = 910002;
SQL
    )"
    if [[ "$readback" != '425.000000|123.456000|12345.600000|11111.111000|425.000000|5' ]]; then
      echo "ERROR: populated-upgrade g conversion mismatch: ${readback:-empty}" >&2
      return 1
    fi

    column_readback="$(
      populated_psql -Atq <<'SQL'
WITH expected(table_name, column_name) AS (
  VALUES
    ('products', 'unit_net_weight_g'),
    ('product_skus', 'unit_net_weight_g'),
    ('shipments', 'total_net_weight_g'),
    ('shipments', 'requested_total_net_weight_g'),
    ('shipment_items', 'unit_net_weight_g_snapshot')
), old_columns(table_name, column_name) AS (
  VALUES
    ('products', 'unit_net_weight_kg'),
    ('product_skus', 'unit_net_weight_kg'),
    ('shipments', 'total_net_weight_kg'),
    ('shipments', 'requested_total_net_weight_kg'),
    ('shipment_items', 'unit_net_weight_kg_snapshot')
)
SELECT count(actual.column_name)::text
       || '|' || count(*) FILTER (
         WHERE actual.data_type = 'numeric'
           AND actual.numeric_precision = 20
           AND actual.numeric_scale = 6
           AND actual.is_nullable = 'YES'
       )::text
       || '|' || (
         SELECT count(*)
           FROM information_schema.columns AS actual_old
           JOIN old_columns
             ON old_columns.table_name = actual_old.table_name
            AND old_columns.column_name = actual_old.column_name
          WHERE actual_old.table_schema = 'public'
       )::text
  FROM expected
  LEFT JOIN information_schema.columns AS actual
    ON actual.table_schema = 'public'
   AND actual.table_name = expected.table_name
   AND actual.column_name = expected.column_name;
SQL
    )"
    if [[ "$column_readback" != '5|5|0' ]]; then
      echo "ERROR: populated-upgrade g column shape mismatch: ${column_readback:-empty}" >&2
      return 1
    fi

    constraint_readback="$(
      populated_psql -Atq <<'SQL'
WITH expected(name) AS (
  VALUES
    ('products_unit_net_weight_g_positive'),
    ('product_skus_unit_net_weight_g_positive'),
    ('product_skus_unit_net_weight_g_requires_default_unit'),
    ('shipments_total_net_weight_g_positive'),
    ('shipments_requested_total_net_weight_g_positive'),
    ('shipment_items_unit_net_weight_g_snapshot_positive')
), old(name) AS (
  VALUES
    ('products_unit_net_weight_kg_positive'),
    ('product_skus_unit_net_weight_kg_positive'),
    ('product_skus_unit_net_weight_kg_requires_default_unit'),
    ('shipments_total_net_weight_kg_positive'),
    ('shipments_requested_total_net_weight_kg_positive'),
    ('shipment_items_unit_net_weight_kg_snapshot_positive')
)
SELECT (SELECT count(*) FROM pg_constraint JOIN expected ON expected.name = pg_constraint.conname)::text
       || '|' || (SELECT count(*) FROM pg_constraint JOIN old ON old.name = pg_constraint.conname)::text;
SQL
    )"
    if [[ "$constraint_readback" != '6|0' ]]; then
      echo "ERROR: populated-upgrade g constraint set mismatch: ${constraint_readback:-empty}" >&2
      return 1
    fi

    populated_psql -q <<'SQL'
DO $$
DECLARE
  rejection_count integer := 0;
BEGIN
  BEGIN
    UPDATE products SET unit_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE product_skus SET unit_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE product_skus SET unit_net_weight_g = 1 WHERE id = 910002;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE shipments SET total_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE shipments SET requested_total_net_weight_g = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  BEGIN
    UPDATE shipment_items SET unit_net_weight_g_snapshot = 0 WHERE id = 910001;
  EXCEPTION WHEN check_violation THEN
    rejection_count := rejection_count + 1;
  END;
  IF rejection_count <> 6 THEN
    RAISE EXCEPTION 'expected 6 net-weight constraint rejections, got %', rejection_count;
  END IF;
END
$$;
SQL
  }

  echo "[qa:populated-upgrade] create isolated db=${POPULATED_UPGRADE_DB_NAME}"
  psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -X --no-psqlrc -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE \"${POPULATED_UPGRADE_DB_NAME}\""
  populated_database_created=1
  populated_report_file="$(mktemp)"

  apply_populated_upgrade_to 20260710150001
  populated_psql -q -f "$fixture_file"
  POPULATED_LEGAL_HASH="$(populated_hash)"
  assert_populated_preflight_green checkpoint-20260710150001

  expect_populated_blocker \
    bom \
    'bom_headers has 1 rows incompatible with the target checks' \
    "UPDATE bom_headers SET status = 'INVALID' WHERE id = 910001" \
    "UPDATE bom_headers SET status = 'DRAFT' WHERE id = 910001"
  expect_populated_blocker \
    finance \
    'finance_facts has 1 legacy CANCELLED rows without a durable cancellation audit' \
    "UPDATE finance_facts SET status = 'CANCELLED' WHERE id = 910001" \
    "UPDATE finance_facts SET status = 'DRAFT' WHERE id = 910001"
  expect_populated_blocker \
    process-lifecycle \
    'process_instances has 1 incompatible lifecycle rows' \
    "UPDATE process_instances SET completed_at = '2026-07-10 16:00:00+00' WHERE id = 910001" \
    "UPDATE process_instances SET completed_at = NULL WHERE id = 910001"
  expect_populated_blocker \
    workflow-state \
    'workflow_business_states has 1 unsupported rows' \
    "UPDATE workflow_business_states SET business_status_key = 'unknown' WHERE id = 910001" \
    "UPDATE workflow_business_states SET business_status_key = 'shipment_release_pending' WHERE id = 910001"
  expect_populated_blocker \
    node-lifecycle \
    'process_node_instances has 1 incompatible rows' \
    "UPDATE process_node_instances SET started_at = '2026-07-10 16:00:00+00' WHERE id = 910001" \
    "UPDATE process_node_instances SET started_at = NULL WHERE id = 910001"
  expect_populated_blocker \
    workflow-task-status \
    'workflow_tasks has 1 incompatible status or anchor rows' \
    "UPDATE workflow_tasks SET task_status_key = 'pending' WHERE id = 910001" \
    "UPDATE workflow_tasks SET task_status_key = 'ready' WHERE id = 910001"
  expect_populated_blocker \
    workflow-task-paired-anchor \
    'workflow_tasks has 1 incompatible status or anchor rows' \
    'UPDATE workflow_tasks SET process_node_instance_id = NULL WHERE id = 910001' \
    'UPDATE workflow_tasks SET process_node_instance_id = 910001 WHERE id = 910001'
  expect_populated_blocker \
    cross-process-anchor \
    'workflow_tasks has 1 invalid process anchors incompatible with target foreign keys or process ownership' \
    'UPDATE workflow_tasks SET process_node_instance_id = 910002 WHERE id = 910001' \
    'UPDATE workflow_tasks SET process_node_instance_id = 910001 WHERE id = 910001'
  expect_populated_blocker \
    legacy-timestamp \
    'workflow_tasks has 1 rows with legacy timestamps that the target migration drops' \
    "UPDATE workflow_tasks SET started_at = '2026-07-10 16:00:00+00' WHERE id = 910001" \
    'UPDATE workflow_tasks SET started_at = NULL WHERE id = 910001'

  apply_populated_upgrade_to 20260711063237
  POPULATED_LEGAL_HASH="$(populated_hash)"
  assert_populated_preflight_green checkpoint-20260711063237
  expect_populated_blocker \
    workflow-task-version \
    'workflow_tasks has 1 non-positive versions' \
    'UPDATE workflow_tasks SET version = 0 WHERE id = 910001' \
    'UPDATE workflow_tasks SET version = 1 WHERE id = 910001'

  apply_populated_upgrade_to 20260713095327
  POPULATED_LEGAL_HASH="$(populated_hash)"
  assert_populated_preflight_green checkpoint-20260713095327
  expect_populated_blocker \
    finance-target-audit \
    'finance_facts has 1 rows incompatible with the target cancellation audit bundle' \
    "UPDATE finance_facts SET status = 'CANCELLED' WHERE id = 910001" \
    "UPDATE finance_facts SET status = 'DRAFT' WHERE id = 910001"

  apply_populated_upgrade_to 20260714055504
  assert_populated_preflight_green checkpoint-20260714055504
  populated_readback="$(
    populated_psql -Atq -c \
      "SELECT state.business_status_key || '|' || task.business_status_key || '|' || task.version::text FROM workflow_business_states AS state JOIN workflow_tasks AS task ON task.id = 910001 WHERE state.id = 910001"
  )"
  if [[ "$populated_readback" != 'shipment_pending|shipment_pending|1' ]]; then
    echo "ERROR: populated-upgrade checkpoint readback mismatch: ${populated_readback:-empty}" >&2
    exit 1
  fi
  role_readback="$(
    populated_psql -Atq -c \
      "SELECT string_agg(role_key || ':' || role_type || ':' || version::text, '|' ORDER BY role_key) FROM roles WHERE id IN (910001, 910002, 910003)"
  )"
  if [[ "$role_readback" != 'admin:custom:1|qa_business_default:custom:1|qa_custom:custom:1' ]]; then
    echo "ERROR: populated-upgrade structural role backfill mismatch: ${role_readback:-empty}" >&2
    exit 1
  fi

  expect_customer_config_cutover_blocker \
    process-runtime \
    'process_instances has 2 rows that must be explicitly governed before customer config hash cutover'

  cutover_before_hash="$(populated_hash)"
  populated_psql -q <<'SQL'
BEGIN;
UPDATE workflow_tasks
   SET process_instance_id = NULL,
       process_node_instance_id = NULL
 WHERE id = 910001;
DELETE FROM process_node_instances WHERE id IN (910001, 910002);
DELETE FROM process_instances WHERE id IN (910001, 910002);
COMMIT;
SQL
  POPULATED_EXPECTED_ROW_COUNT=9
  cutover_after_hash="$(populated_hash)"
  if [[ "$cutover_before_hash" == "$cutover_after_hash" ]]; then
    echo "ERROR: populated-upgrade cutover cleanup did not change the expected synthetic set" >&2
    exit 1
  fi
  cutover_readback="$(
    populated_psql -Atq -c \
      "SELECT (SELECT count(*) FROM workflow_tasks WHERE id = 910001 AND process_instance_id IS NULL AND process_node_instance_id IS NULL)::text || '|' || (SELECT count(*) FROM process_node_instances WHERE id IN (910001, 910002))::text || '|' || (SELECT count(*) FROM process_instances WHERE id IN (910001, 910002))::text || '|' || (SELECT count(*) FROM workflow_tasks WHERE id = 910001 AND config_revision IS NOT NULL)::text"
  )"
  if [[ "$cutover_readback" != '1|0|0|0' ]]; then
    echo "ERROR: populated-upgrade cutover cleanup mismatch: ${cutover_readback:-empty}" >&2
    exit 1
  fi
  POPULATED_LEGAL_HASH="$cutover_after_hash"
  assert_populated_preflight_green cutover-ready-20260714055825

  populated_psql -q -c \
    "UPDATE workflow_tasks SET config_revision = 'synthetic-cutover-revision' WHERE id = 910001"
  expect_customer_config_cutover_blocker \
    workflow-config-revision \
    'workflow_tasks has 1 config revision anchors that must be explicitly governed before customer config hash cutover'
  populated_psql -q -c \
    "UPDATE workflow_tasks SET config_revision = NULL WHERE id = 910001"
  if [[ "$(populated_hash)" != "$POPULATED_LEGAL_HASH" ]]; then
    echo "ERROR: customer config cutover blocker restore did not recover legal rows" >&2
    exit 1
  fi
  assert_customer_config_cutover_preflight_green cutover-ready-20260714055825

  apply_populated_upgrade_to 20260714055825
  assert_populated_preflight_green checkpoint-20260714055825
  assert_customer_config_cutover_preflight_green checkpoint-20260714055825
  role_readback="$(
    populated_psql -Atq -c \
      "SELECT string_agg(role_key || ':' || role_type || ':' || version::text, '|' ORDER BY role_key) FROM roles WHERE id IN (910001, 910002, 910003)"
  )"
  if [[ "$role_readback" != 'admin:system:1|qa_business_default:business_default:1|qa_custom:custom:1' ]]; then
    echo "ERROR: populated-upgrade role classification mismatch: ${role_readback:-empty}" >&2
    exit 1
  fi

  apply_populated_upgrade_to 20260714165115
  populated_psql -q -f "$net_weight_fixture_file"
  assert_net_weight_kg_fixture
  assert_populated_preflight_green checkpoint-20260714165115-with-kg
  assert_customer_config_cutover_preflight_green checkpoint-20260714165115-with-kg

  atlas migrate apply \
    --dir "file://${migration_dir}" \
    --url "$POPULATED_UPGRADE_DB_URL"
  assert_net_weight_gram_upgrade
  assert_populated_preflight_green latest
  assert_customer_config_cutover_preflight_green latest
  populated_readback="$(
    populated_psql -Atq -c \
      "SELECT state.business_status_key || '|' || task.business_status_key || '|' || task.version::text FROM workflow_business_states AS state JOIN workflow_tasks AS task ON task.id = 910001 WHERE state.id = 910001"
  )"
  if [[ "$populated_readback" != 'shipment_pending|shipment_pending|1' ]]; then
    echo "ERROR: populated-upgrade latest readback mismatch: ${populated_readback:-empty}" >&2
    exit 1
  fi
  migration_status_counts="$(
    atlas migrate status \
      --dir "file://${migration_dir}" \
      --url "$POPULATED_UPGRADE_DB_URL" \
      --format '{{ len .Pending }}|{{ len .OutOfOrder }}'
  )"
  if [[ "$migration_status_counts" != '0|0' ]]; then
    echo "ERROR: populated-upgrade latest has pending or out-of-order migrations: ${migration_status_counts:-unknown}" >&2
    exit 1
  fi
  echo "[qa:populated-upgrade] status=complete pending=0 out_of_order=0"
  ;;
dropdb)
  psql "$PURCHASE_RECEIPT_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${PURCHASE_RECEIPT_PG_DB_NAME}\" WITH (FORCE)"
  ;;
*)
  echo "unknown command: $cmd" >&2
  exit 2
  ;;
esac
