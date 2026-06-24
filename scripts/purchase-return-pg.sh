#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|dropdb}" >&2
  exit 2
fi

PURCHASE_RETURN_PG_DB_URL="${PURCHASE_RETURN_PG_DB_URL:-postgres://postgres:purchase-return-local-password@127.0.0.1:55432/plush_erp_purchase_return_test?sslmode=disable}"
PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION="${PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION:-20260426142444}"
PURCHASE_RETURN_PG_MIGRATE_DIR=""

cleanup_purchase_return_migrate_dir() {
  if [ -n "$PURCHASE_RETURN_PG_MIGRATE_DIR" ] && [ -d "$PURCHASE_RETURN_PG_MIGRATE_DIR" ]; then
    rm -rf "$PURCHASE_RETURN_PG_MIGRATE_DIR"
  fi
}
trap cleanup_purchase_return_migrate_dir EXIT

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

prepare_purchase_return_migrate_dir() {
  if [ -n "$PURCHASE_RETURN_PG_MIGRATE_DIR" ]; then
    echo "$PURCHASE_RETURN_PG_MIGRATE_DIR"
    return
  fi
  PURCHASE_RETURN_PG_MIGRATE_DIR="$(mktemp -d)"
  local found_max=0
  local source_file base version
  for source_file in internal/data/model/migrate/*.sql; do
    base="$(basename "$source_file")"
    version="${base%%_*}"
    if [[ "$version" > "$PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION" ]]; then
      continue
    fi
    if [ "$version" = "$PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION" ]; then
      found_max=1
    fi
    cp "$source_file" "$PURCHASE_RETURN_PG_MIGRATE_DIR/$base"
  done
  if [ "$found_max" -ne 1 ]; then
    echo "ERROR: purchase_return max migration ${PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION} not found" >&2
    exit 1
  fi
  atlas migrate hash --dir "file://${PURCHASE_RETURN_PG_MIGRATE_DIR}" >/dev/null
  echo "$PURCHASE_RETURN_PG_MIGRATE_DIR"
}

case "$cmd" in
createdb)
  psql "$PURCHASE_RETURN_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${PURCHASE_RETURN_PG_DB_NAME}'" | grep -q 1 ||
    psql "$PURCHASE_RETURN_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PURCHASE_RETURN_PG_DB_NAME}\""
  ;;
status)
  purchase_return_dir="$(prepare_purchase_return_migrate_dir)"
  echo "purchase_return migration max_version=${PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION}"
  atlas migrate status --dir "file://${purchase_return_dir}" --url "$PURCHASE_RETURN_PG_DB_URL"
  ;;
apply)
  purchase_return_dir="$(prepare_purchase_return_migrate_dir)"
  echo "purchase_return migration max_version=${PURCHASE_RETURN_PG_MAX_MIGRATION_VERSION}"
  atlas migrate apply --dir "file://${purchase_return_dir}" --url "$PURCHASE_RETURN_PG_DB_URL"
  ;;
test)
  PURCHASE_RETURN_PG_TEST=1 PURCHASE_RETURN_PG_TEST_DB_URL="$PURCHASE_RETURN_PG_DB_URL" go test ./internal/data -run TestPurchaseReturnPostgres -count=1
  ;;
dropdb)
  psql "$PURCHASE_RETURN_PG_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${PURCHASE_RETURN_PG_DB_NAME}\" WITH (FORCE)"
  ;;
*)
  echo "unknown command: $cmd" >&2
  exit 2
  ;;
esac
