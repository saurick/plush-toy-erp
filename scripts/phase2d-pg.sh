#!/usr/bin/env bash
set -euo pipefail

cmd="${1:-}"
if [ -z "$cmd" ]; then
  echo "usage: $0 {createdb|status|apply|test|dropdb}" >&2
  exit 2
fi

PHASE2D_DB_URL="${PHASE2D_DB_URL:-postgres://postgres:phase2a-local-password@127.0.0.1:55432/plush_erp_phase2d_test?sslmode=disable}"

parse_output="$(
  python3 - "$PHASE2D_DB_URL" <<'PY'
import re
import shlex
import sys
import urllib.parse

raw = sys.argv[1]
u = urllib.parse.urlparse(raw)
if u.scheme not in {"postgres", "postgresql"}:
    raise SystemExit("ERROR: PHASE2D_DB_URL must use postgres/postgresql scheme")
host = u.hostname or ""
dbname = (u.path or "").lstrip("/")
allowed_hosts = {
    "localhost",
    "127.0.0.1",
    "::1",
    "postgres",
    "phase2d-postgres",
    "plush-toy-erp-phase2d-postgres",
    "plush-toy-erp-phase2c-postgres",
    "plush-toy-erp-phase2b-postgres",
    "plush-toy-erp-phase2a-postgres",
    "host.docker.internal",
}
if host not in allowed_hosts:
    raise SystemExit(f"ERROR: refuse non-local PHASE2D_DB_URL host: {host}")
if not dbname:
    raise SystemExit("ERROR: PHASE2D_DB_URL missing database name")
if "phase2d" not in dbname.lower() and "test" not in dbname.lower():
    raise SystemExit(f"ERROR: database name must contain phase2d or test: {dbname}")
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

emit("PHASE2D_DB_HOST", host)
emit("PHASE2D_DB_NAME", dbname)
emit("PHASE2D_DB_SAFE_URL", safe_url)
emit("PHASE2D_ADMIN_DB_URL", admin_url)
PY
)" || exit 1
eval "$parse_output"

echo "phase2d target host=${PHASE2D_DB_HOST} db=${PHASE2D_DB_NAME}"
echo "phase2d target dsn=${PHASE2D_DB_SAFE_URL}"

case "$cmd" in
createdb)
  psql "$PHASE2D_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -tc "SELECT 1 FROM pg_database WHERE datname = '${PHASE2D_DB_NAME}'" | grep -q 1 ||
    psql "$PHASE2D_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"${PHASE2D_DB_NAME}\""
  ;;
status)
  atlas migrate status --dir "file://internal/data/model/migrate" --url "$PHASE2D_DB_URL"
  ;;
apply)
  atlas migrate apply --dir "file://internal/data/model/migrate" --url "$PHASE2D_DB_URL"
  ;;
test)
  PHASE2D_PG_TEST=1 PHASE2D_PG_TEST_DB_URL="$PHASE2D_DB_URL" go test ./internal/data -run TestPhase2DPostgres -count=1
  ;;
dropdb)
  psql "$PHASE2D_ADMIN_DB_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"${PHASE2D_DB_NAME}\" WITH (FORCE)"
  ;;
*)
  echo "unknown command: $cmd" >&2
  exit 2
  ;;
esac
