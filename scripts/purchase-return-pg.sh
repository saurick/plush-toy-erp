#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|dropdb}" >&2
  exit 2
fi

PURCHASE_RETURN_PG_DB_URL="${PURCHASE_RETURN_PG_DB_URL:-postgres://postgres:purchase-receipt-local-password@127.0.0.1:55432/plush_erp_purchase_return_test?sslmode=disable}"

parse_output="$(
  python3 - "$PURCHASE_RETURN_PG_DB_URL" <<'PY'
import re
import shlex
import sys
import urllib.parse

raw = sys.argv[1]
u = urllib.parse.urlparse(raw)
if u.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("ERROR: PURCHASE_RETURN_PG_DB_URL must use postgres/postgresql scheme")
host = u.hostname or ""
dbname = (u.path or "").lstrip("/")
allowed_hosts = {
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "purchase-return-postgres",
    "plush-toy-erp-purchase-return-postgres",
                "host.docker.internal",
}
if host not in allowed_hosts:
    raise SystemExit(f"ERROR: refuse non-local PURCHASE_RETURN_PG_DB_URL host: {host}")
if not dbname:
    raise SystemExit("ERROR: PURCHASE_RETURN_PG_DB_URL missing database name")
if "purchase_return" not in dbname.lower() and "test" not in dbname.lower():
    raise SystemExit(f"ERROR: database name must contain purchase_return or test: {dbname}")
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

emit("PURCHASE_RETURN_PG_DB_HOST", host)
emit("PURCHASE_RETURN_PG_DB_NAME", dbname)
emit("PURCHASE_RETURN_PG_DB_SAFE_URL", safe_url)
emit("PURCHASE_RETURN_PG_ADMIN_DB_URL", admin_url)
PY
)" || exit 1
eval "$parse_output"

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
