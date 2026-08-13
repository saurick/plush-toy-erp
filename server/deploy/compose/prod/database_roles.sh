#!/usr/bin/env bash
set -euo pipefail
umask 077

mode="${1:-reconcile}"

fail() {
  printf '[database-roles] ERROR: %s\n' "$*" >&2
  exit 1
}

case "$mode" in
reconcile | verify) ;;
*) fail "用法: database_roles.sh [reconcile|verify]" ;;
esac

for variable in POSTGRES_DB POSTGRES_USER; do
  [[ -n "${!variable:-}" ]] || fail "$variable 不能为空"
done

case "$POSTGRES_USER" in
erp_app | erp_migrator | erp_backup)
  fail "POSTGRES_USER 必须保留为容器初始化管理员，不能复用业务角色"
  ;;
esac

for variable in \
  POSTGRES_APP_PASSWORD \
  POSTGRES_MIGRATOR_PASSWORD \
  POSTGRES_BACKUP_PASSWORD; do
  value="${!variable:-}"
  [[ "$value" =~ ^[A-Za-z0-9._~-]{20,128}$ ]] ||
    fail "$variable 必须是 20-128 位 URL-safe 密码"
done
[[ "$POSTGRES_APP_PASSWORD" != "$POSTGRES_MIGRATOR_PASSWORD" &&
  "$POSTGRES_APP_PASSWORD" != "$POSTGRES_BACKUP_PASSWORD" &&
  "$POSTGRES_MIGRATOR_PASSWORD" != "$POSTGRES_BACKUP_PASSWORD" ]] ||
  fail "应用、迁移和备份角色密码必须彼此不同"

if [[ "$mode" == "reconcile" ]]; then

  psql -X --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_password POSTGRES_APP_PASSWORD
\getenv migrator_password POSTGRES_MIGRATOR_PASSWORD
\getenv backup_password POSTGRES_BACKUP_PASSWORD

SELECT format(
  'CREATE ROLE erp_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'migrator_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_migrator')
\gexec
SELECT format(
  'ALTER ROLE erp_migrator LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'migrator_password'
)
\gexec

SELECT format(
  'CREATE ROLE erp_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'app_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_app')
\gexec
SELECT format(
  'ALTER ROLE erp_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'app_password'
)
\gexec

SELECT format(
  'CREATE ROLE erp_backup LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'backup_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'erp_backup')
\gexec
SELECT format(
  'ALTER ROLE erp_backup LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS',
  :'backup_password'
)
\gexec

SELECT format('REVOKE %I FROM %I', granted_role.rolname, member_role.rolname)
FROM pg_auth_members AS membership
JOIN pg_roles AS granted_role ON granted_role.oid = membership.roleid
JOIN pg_roles AS member_role ON member_role.oid = membership.member
WHERE member_role.rolname IN ('erp_migrator', 'erp_app', 'erp_backup')
\gexec

SELECT format('REVOKE CREATE ON DATABASE %I FROM PUBLIC', current_database())
\gexec
SELECT format(
  'GRANT CONNECT ON DATABASE %I TO erp_migrator, erp_app, erp_backup',
  current_database()
)
\gexec
SELECT format(
  'GRANT CREATE ON DATABASE %I TO erp_migrator',
  current_database()
)
\gexec

ALTER SCHEMA public OWNER TO erp_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO erp_migrator;
GRANT USAGE ON SCHEMA public TO erp_app, erp_backup;

SELECT format(
  'ALTER %s %I.%I OWNER TO erp_migrator',
  CASE object.relkind
    WHEN 'S' THEN 'SEQUENCE'
    WHEN 'v' THEN 'VIEW'
    WHEN 'm' THEN 'MATERIALIZED VIEW'
    ELSE 'TABLE'
  END,
  namespace.nspname,
  object.relname
)
FROM pg_class AS object
JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
WHERE namespace.nspname IN ('public', 'atlas_schema_revisions')
  AND object.relkind IN ('r', 'p', 'S', 'v', 'm')
ORDER BY namespace.nspname, object.relname
\gexec

SELECT format('ALTER SCHEMA %I OWNER TO erp_migrator', namespace.nspname)
FROM pg_namespace AS namespace
WHERE namespace.nspname = 'atlas_schema_revisions'
\gexec

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM erp_app, erp_backup;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM erp_app, erp_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO erp_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO erp_backup;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO erp_backup;

DO $block$
DECLARE
  append_only_table text;
BEGIN
  FOREACH append_only_table IN ARRAY ARRAY[
    'inventory_txns',
    'source_order_lifecycle_events',
    'inventory_lot_status_events',
    'workflow_task_events',
    'production_order_events',
    'production_wip_events',
    'runtime_audit_events'
  ] LOOP
    IF to_regclass(format('public.%I', append_only_table)) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM erp_app',
        append_only_table
      );
      EXECUTE format(
        'GRANT SELECT, INSERT ON TABLE public.%I TO erp_app',
        append_only_table
      );
    END IF;
  END LOOP;
END
$block$;

ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO erp_app;
ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA public
  GRANT SELECT ON TABLES TO erp_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE erp_migrator IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO erp_backup;

DO $block$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'atlas_schema_revisions') THEN
    REVOKE ALL ON SCHEMA atlas_schema_revisions FROM PUBLIC, erp_app, erp_backup;
    GRANT USAGE ON SCHEMA atlas_schema_revisions TO erp_app, erp_backup;
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA atlas_schema_revisions
      FROM erp_app, erp_backup;
    IF to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL THEN
      GRANT SELECT ON TABLE atlas_schema_revisions.atlas_schema_revisions TO erp_app;
    END IF;
    GRANT SELECT ON ALL TABLES IN SCHEMA atlas_schema_revisions TO erp_backup;
  END IF;
END
$block$;

SELECT format(
  'ALTER ROLE erp_app IN DATABASE %I SET application_name TO %L',
  current_database(),
  'plush-toy-erp'
)
\gexec
SELECT format(
  'ALTER ROLE erp_app IN DATABASE %I SET statement_timeout TO %L',
  current_database(),
  '30s'
)
\gexec
SELECT format(
  'ALTER ROLE erp_app IN DATABASE %I SET lock_timeout TO %L',
  current_database(),
  '5s'
)
\gexec
SELECT format(
  'ALTER ROLE erp_app IN DATABASE %I SET idle_in_transaction_session_timeout TO %L',
  current_database(),
  '60s'
)
\gexec
SELECT format(
  'ALTER ROLE erp_app IN DATABASE %I SET search_path TO public',
  current_database()
)
\gexec

SELECT format(
  'ALTER ROLE erp_migrator IN DATABASE %I SET application_name TO %L',
  current_database(),
  'plush-toy-erp-migration'
)
\gexec
SELECT format(
  'ALTER ROLE erp_migrator IN DATABASE %I SET search_path TO public',
  current_database()
)
\gexec

ALTER ROLE erp_backup SET default_transaction_read_only = on;
SELECT format(
  'ALTER ROLE erp_backup IN DATABASE %I SET application_name TO %L',
  current_database(),
  'plush-toy-erp-backup'
)
\gexec
SELECT format(
  'ALTER ROLE erp_backup IN DATABASE %I SET search_path TO public',
  current_database()
)
\gexec
SQL
fi

psql -X --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
DO $verify$
DECLARE
  expected_role text;
  table_name text;
  invalid_count bigint;
BEGIN
  FOREACH expected_role IN ARRAY ARRAY['erp_migrator', 'erp_app', 'erp_backup'] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_roles
      WHERE rolname = expected_role
        AND rolcanlogin
        AND NOT rolsuper
        AND NOT rolcreatedb
        AND NOT rolcreaterole
        AND NOT rolinherit
        AND NOT rolbypassrls
    ) THEN
      RAISE EXCEPTION 'database role % is missing or over-privileged', expected_role;
    END IF;
  END LOOP;

  IF pg_get_userbyid((SELECT datdba FROM pg_database WHERE datname = current_database())) = 'erp_app' THEN
    RAISE EXCEPTION 'erp_app must not own the database';
  END IF;
  IF pg_get_userbyid((SELECT nspowner FROM pg_namespace WHERE nspname = 'public')) <> 'erp_migrator' THEN
    RAISE EXCEPTION 'erp_migrator must own the public schema';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_namespace
    WHERE nspname = 'atlas_schema_revisions'
      AND pg_get_userbyid(nspowner) <> 'erp_migrator'
  ) THEN
    RAISE EXCEPTION 'erp_migrator must own the Atlas schema';
  END IF;
  SELECT count(*) INTO invalid_count
  FROM pg_class AS object
  JOIN pg_namespace AS namespace ON namespace.oid = object.relnamespace
  WHERE namespace.nspname IN ('public', 'atlas_schema_revisions')
    AND object.relkind IN ('r', 'p', 'S', 'v', 'm')
    AND pg_get_userbyid(object.relowner) <> 'erp_migrator';
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'erp_migrator does not own % application objects', invalid_count;
  END IF;
  IF has_database_privilege('erp_app', current_database(), 'CREATE')
     OR has_schema_privilege('erp_app', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'erp_app must not create database objects';
  END IF;
  IF NOT has_database_privilege('erp_migrator', current_database(), 'CREATE')
     OR NOT has_schema_privilege('erp_migrator', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'erp_migrator must be able to create migration objects';
  END IF;
  IF has_database_privilege('erp_backup', current_database(), 'CREATE')
     OR has_schema_privilege('erp_backup', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'erp_backup must not create database objects';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_auth_members AS membership
    JOIN pg_roles AS member_role ON member_role.oid = membership.member
    WHERE member_role.rolname IN ('erp_migrator', 'erp_app', 'erp_backup')
  ) THEN
    RAISE EXCEPTION 'database service roles must not inherit or SET ROLE to another role';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_db_role_setting AS role_setting
    WHERE role_setting.setrole = (SELECT oid FROM pg_roles WHERE rolname = 'erp_app')
      AND role_setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND role_setting.setconfig @> ARRAY[
        'application_name=plush-toy-erp',
        'statement_timeout=30s',
        'lock_timeout=5s',
        'idle_in_transaction_session_timeout=60s',
        'search_path=public'
      ]
  ) THEN
    RAISE EXCEPTION 'erp_app session policy is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_db_role_setting AS role_setting
    WHERE role_setting.setrole = (SELECT oid FROM pg_roles WHERE rolname = 'erp_backup')
      AND role_setting.setdatabase = 0
      AND role_setting.setconfig @> ARRAY['default_transaction_read_only=on']
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_db_role_setting AS role_setting
    WHERE role_setting.setrole = (SELECT oid FROM pg_roles WHERE rolname = 'erp_backup')
      AND role_setting.setdatabase = (SELECT oid FROM pg_database WHERE datname = current_database())
      AND role_setting.setconfig @> ARRAY[
        'application_name=plush-toy-erp-backup',
        'search_path=public'
      ]
  ) THEN
    RAISE EXCEPTION 'erp_backup session policy is incomplete';
  END IF;

  SELECT count(*) INTO invalid_count
  FROM information_schema.tables AS business_table
  WHERE business_table.table_schema = 'public'
    AND business_table.table_type = 'BASE TABLE'
    AND business_table.table_name <> 'atlas_schema_revisions'
    AND NOT (
      has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'SELECT')
      AND has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'INSERT')
    );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'erp_app is missing required access on % public tables', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM information_schema.tables AS business_table
  WHERE business_table.table_schema = 'public'
    AND business_table.table_type = 'BASE TABLE'
    AND business_table.table_name NOT IN (
      'inventory_txns',
      'source_order_lifecycle_events',
      'inventory_lot_status_events',
      'workflow_task_events',
      'production_order_events',
      'production_wip_events',
      'runtime_audit_events'
    )
    AND (
      NOT has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'UPDATE')
      OR NOT has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'DELETE')
    );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'erp_app is missing UPDATE/DELETE on % mutable public tables', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM information_schema.tables AS business_table
  WHERE business_table.table_schema = 'public'
    AND business_table.table_type = 'BASE TABLE'
    AND (
      has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'TRUNCATE')
      OR has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'REFERENCES')
      OR has_table_privilege('erp_app', format('%I.%I', business_table.table_schema, business_table.table_name), 'TRIGGER')
    );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'erp_app has unsafe structural privileges on % public tables', invalid_count;
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'inventory_txns',
    'source_order_lifecycle_events',
    'inventory_lot_status_events',
    'workflow_task_events',
    'production_order_events',
    'production_wip_events',
    'runtime_audit_events'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL AND (
      has_table_privilege('erp_app', format('public.%I', table_name), 'UPDATE')
      OR has_table_privilege('erp_app', format('public.%I', table_name), 'DELETE')
      OR has_table_privilege('erp_app', format('public.%I', table_name), 'TRUNCATE')
      OR has_table_privilege('erp_app', format('public.%I', table_name), 'TRIGGER')
    ) THEN
      RAISE EXCEPTION 'erp_app may not mutate append-only table %', table_name;
    END IF;
  END LOOP;

  SELECT count(*) INTO invalid_count
  FROM information_schema.tables AS business_table
  WHERE business_table.table_schema = 'public'
    AND business_table.table_type = 'BASE TABLE'
    AND (
      NOT has_table_privilege('erp_backup', format('%I.%I', business_table.table_schema, business_table.table_name), 'SELECT')
      OR has_table_privilege('erp_backup', format('%I.%I', business_table.table_schema, business_table.table_name), 'INSERT')
      OR has_table_privilege('erp_backup', format('%I.%I', business_table.table_schema, business_table.table_name), 'UPDATE')
      OR has_table_privilege('erp_backup', format('%I.%I', business_table.table_schema, business_table.table_name), 'DELETE')
      OR has_table_privilege('erp_backup', format('%I.%I', business_table.table_schema, business_table.table_name), 'TRUNCATE')
    );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'erp_backup permissions are invalid on % public tables', invalid_count;
  END IF;

  SELECT count(*) INTO invalid_count
  FROM pg_class AS sequence_object
  JOIN pg_namespace AS namespace ON namespace.oid = sequence_object.relnamespace
  WHERE namespace.nspname = 'public'
    AND sequence_object.relkind = 'S'
    AND (
      NOT has_sequence_privilege('erp_app', sequence_object.oid, 'USAGE')
      OR NOT has_sequence_privilege('erp_app', sequence_object.oid, 'SELECT')
      OR has_sequence_privilege('erp_app', sequence_object.oid, 'UPDATE')
      OR NOT has_sequence_privilege('erp_backup', sequence_object.oid, 'SELECT')
      OR has_sequence_privilege('erp_backup', sequence_object.oid, 'USAGE')
      OR has_sequence_privilege('erp_backup', sequence_object.oid, 'UPDATE')
    );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'sequence permissions are invalid on % public sequences', invalid_count;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'atlas_schema_revisions') THEN
    IF NOT has_schema_privilege('erp_app', 'atlas_schema_revisions', 'USAGE') THEN
      RAISE EXCEPTION 'erp_app must be able to resolve the Atlas revisions table';
    END IF;
  END IF;
  IF to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL AND (
    NOT has_table_privilege(
      'erp_app',
      'atlas_schema_revisions.atlas_schema_revisions',
      'SELECT'
    )
    OR has_table_privilege(
      'erp_app',
      'atlas_schema_revisions.atlas_schema_revisions',
      'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) THEN
    RAISE EXCEPTION 'erp_app Atlas revision permissions are invalid';
  END IF;
  SELECT count(*) INTO invalid_count
  FROM pg_class AS atlas_object
  JOIN pg_namespace AS namespace ON namespace.oid = atlas_object.relnamespace
  WHERE namespace.nspname = 'atlas_schema_revisions'
    AND atlas_object.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND atlas_object.relname <> 'atlas_schema_revisions'
    AND (
      has_table_privilege('erp_app', atlas_object.oid, 'SELECT')
      OR has_table_privilege(
        'erp_app',
        atlas_object.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
      )
    );
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'erp_app may not access % non-canonical Atlas tables', invalid_count;
  END IF;
END
$verify$;

SELECT 'database_permissions=verified';
SQL

expect_permission_denied() {
  local label="$1"
  local statement="$2"
  local output=""
  local status=0

  set +e
  output="$(PGPASSWORD="$POSTGRES_APP_PASSWORD" psql -X --no-psqlrc \
    --set ON_ERROR_STOP=1 --set VERBOSITY=verbose \
    --username erp_app --dbname "$POSTGRES_DB" \
    --command "$statement" 2>&1)"
  status=$?
  set -e
  [[ "$status" -ne 0 ]] || fail "$label unexpectedly succeeded for erp_app"
  grep -Eq '(^|[^0-9])42501([^0-9]|$)' <<<"$output" ||
    fail "$label failed without SQLSTATE 42501"
}

app_identity="$(PGPASSWORD="$POSTGRES_APP_PASSWORD" psql -X --no-psqlrc \
  --set ON_ERROR_STOP=1 --username erp_app --dbname "$POSTGRES_DB" \
  --tuples-only --no-align \
  --command "
    SELECT current_user
      || '|' || current_setting('search_path')
      || '|' || (current_setting('statement_timeout')::interval = interval '30 seconds')::text
      || '|' || (current_setting('lock_timeout')::interval = interval '5 seconds')::text
      || '|' || (current_setting('idle_in_transaction_session_timeout')::interval = interval '60 seconds')::text;")"
[[ "$app_identity" == "erp_app|public|true|true|true" ]] ||
  fail "erp_app session policy readback failed"

backup_identity="$(PGPASSWORD="$POSTGRES_BACKUP_PASSWORD" psql -X --no-psqlrc \
  --set ON_ERROR_STOP=1 --username erp_backup --dbname "$POSTGRES_DB" \
  --tuples-only --no-align \
  --command "SELECT current_user || '|' || current_setting('default_transaction_read_only') || '|' || current_setting('search_path');")"
[[ "$backup_identity" == "erp_backup|on|public" ]] ||
  fail "erp_backup read-only session policy readback failed"

permission_probe="__plush_permission_probe_$$"
expect_permission_denied \
  "CREATE TABLE" \
  "CREATE TABLE public.${permission_probe} (id bigint)"

first_public_table="$(psql -X --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --tuples-only --no-align \
  --command "
    SELECT format('%I.%I', schemaname, tablename)
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
    LIMIT 1;")"
if [[ -n "$first_public_table" ]]; then
  expect_permission_denied \
    "ALTER TABLE" \
    "ALTER TABLE ${first_public_table} ADD COLUMN ${permission_probe} bigint"
  expect_permission_denied \
    "DROP TABLE" \
    "DROP TABLE ${first_public_table}"
fi

if psql -X --no-psqlrc --set ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --tuples-only --no-align \
  --command "SELECT to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL;" | \
  grep -qx 't'; then
  atlas_revision_readable="$(PGPASSWORD="$POSTGRES_APP_PASSWORD" psql -X --no-psqlrc \
    --set ON_ERROR_STOP=1 --username erp_app --dbname "$POSTGRES_DB" \
    --tuples-only --no-align \
    --command "SELECT EXISTS (SELECT 1 FROM atlas_schema_revisions.atlas_schema_revisions WHERE version IS NOT NULL)::text;")"
  [[ "$atlas_revision_readable" == "true" ]] ||
    fail "erp_app cannot read the canonical Atlas revision row"
  expect_permission_denied \
    "Atlas revision UPDATE" \
    "UPDATE atlas_schema_revisions.atlas_schema_revisions SET version = version WHERE false"
fi

while IFS= read -r append_only_table; do
  [[ -n "$append_only_table" ]] || continue
  expect_permission_denied \
    "append-only UPDATE ${append_only_table}" \
    "UPDATE public.${append_only_table} SET id = id WHERE false"
  expect_permission_denied \
    "append-only DELETE ${append_only_table}" \
    "DELETE FROM public.${append_only_table} WHERE false"
done < <(
  psql -X --no-psqlrc --set ON_ERROR_STOP=1 \
    --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
    --tuples-only --no-align \
    --command "
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'inventory_txns',
          'source_order_lifecycle_events',
          'inventory_lot_status_events',
          'workflow_task_events',
          'production_order_events',
          'production_wip_events',
          'runtime_audit_events'
        )
      ORDER BY table_name;"
)

PGPASSWORD="$POSTGRES_MIGRATOR_PASSWORD" psql -X --no-psqlrc \
  --set ON_ERROR_STOP=1 --username erp_migrator --dbname "$POSTGRES_DB" \
  --command "BEGIN; CREATE TABLE public.${permission_probe} (id bigint); ROLLBACK;" \
  >/dev/null

printf '[database-roles] status=verified mode=%s database=%s\n' "$mode" "$POSTGRES_DB"
