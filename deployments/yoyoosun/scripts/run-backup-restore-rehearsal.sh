#!/usr/bin/env bash
set -euo pipefail
umask 077

print_help() {
  cat <<'USAGE'
用法:
  SOURCE_POSTGRES_DSN='<postgres://erp_backup:...@host:port/database?sslmode=...>' \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version local-dev-20260616 \
    --backup-purpose pre-migration \
    --source-policy dedicated-backup \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp

作用:
  对 SOURCE_POSTGRES_DSN 指向的库执行一次真实备份恢复演练：
  1. 用经过权限对账的 erp_backup 和本机 PostgreSQL 18.1 pg_dump 生成 custom dump 到 output/。
  2. 启动临时隔离 PostgreSQL 容器。
  3. 将 dump 恢复到临时库。
  4. 对恢复库先读取 migrationBefore，依次运行存量升级与客户配置切换只读审计，再执行 Atlas migration apply 和 migration status。
  5. 可选执行 backend healthz/readyz 和 web 主路径 HTTP smoke。
  6. 生成脱敏 backup-evidence.md、migration-status.txt、command-summary.txt 和 backup-restore-report.json。
  7. 如提供 --evidence-dir，只复制上述脱敏 artifact 到 release evidence 目录；dump 仍留在 output/。

边界:
  - 不读取、不提交真实 .env。
  - 不把 dump、secret、完整 DSN 或客户 raw rows 写入 git。
  - 默认 SOURCE_POSTGRES_DSN 必须使用只读 erp_backup；恢复和 migration 由隔离库管理员 / erp_migrator 完成。
  - shared-dev-session-read-only 只供本项目本地迁移入口备份已登记的 106 开发库，并强制当前源连接只读；不能用于目标或发布环境。
  - 默认拒绝把 192.168.0.133 测试 / 目标库当成本地 source，除非显式设置
    ERP_ALLOW_TEST_DB_AS_DEV=1 或 ALLOW_TARGET_DB_BACKUP_REHEARSAL=1。
USAGE
}

repo_root="$(git rev-parse --show-toplevel)"
populated_upgrade_preflight="$repo_root/scripts/qa/populated-upgrade-preflight.sh"
customer="yoyoosun"
environment="local-dev"
release_version=""
backup_purpose="pre-migration"
out_root="output/customers/yoyoosun/backup-restore-rehearsal"
postgres_image="${POSTGRES_REHEARSAL_IMAGE:-postgres:18.1}"
pg_dump_bin="${PG_DUMP_BIN:-}"
psql_bin="${PSQL_BIN:-}"
atlas_required_version="${ATLAS_REQUIRED_VERSION:-v0.38.0}"
source_env="SOURCE_POSTGRES_DSN"
source_policy="dedicated-backup"
backend_url=""
web_url=""
keep_container="0"
evidence_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --customer)
    customer="${2:-}"
    shift 2
    ;;
  --environment)
    environment="${2:-}"
    shift 2
    ;;
  --release-version)
    release_version="${2:-}"
    shift 2
    ;;
  --backup-purpose)
    backup_purpose="${2:-}"
    shift 2
    ;;
  --out)
    out_root="${2:-}"
    shift 2
    ;;
  --evidence-dir)
    evidence_dir="${2:-}"
    shift 2
    ;;
  --postgres-image)
    postgres_image="${2:-}"
    shift 2
    ;;
  --pg-dump-bin)
    pg_dump_bin="${2:-}"
    shift 2
    ;;
  --source-env)
    source_env="${2:-}"
    shift 2
    ;;
  --source-policy)
    source_policy="${2:-}"
    shift 2
    ;;
  --backend-url)
    backend_url="${2:-}"
    shift 2
    ;;
  --web-url)
    web_url="${2:-}"
    shift 2
    ;;
  --keep-container)
    keep_container="1"
    shift
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[backup-restore-rehearsal] 不支持的参数: $1" >&2
    print_help
    exit 1
    ;;
  esac
done

if [[ "$customer" != "yoyoosun" ]]; then
  echo "[backup-restore-rehearsal] 当前脚本只支持 customer=yoyoosun" >&2
  exit 1
fi

if [[ -z "$release_version" ]]; then
  release_version="local-dev-$(git rev-parse --short=8 HEAD 2>/dev/null || date +%Y%m%d%H%M%S)"
fi

if [[ -n "$evidence_dir" && ! -d "$evidence_dir" ]]; then
  echo "[backup-restore-rehearsal] --evidence-dir 必须是已存在的 release evidence 目录: $evidence_dir" >&2
  exit 1
fi

if [[ ! "$backup_purpose" =~ (pre-migration|pre-deploy|发布前|migration[[:space:]]前) ]]; then
  echo "[backup-restore-rehearsal] --backup-purpose 必须明确是 pre-migration / pre-deploy / 发布前 / migration 前" >&2
  exit 1
fi

source_dsn="${!source_env:-}"
if [[ -z "$source_dsn" ]]; then
  echo "[backup-restore-rehearsal] 请通过 $source_env 提供源库 DSN" >&2
  exit 1
fi

case "$source_policy" in
dedicated-backup | shared-dev-session-read-only) ;;
*)
  echo "[backup-restore-rehearsal] --source-policy 只支持 dedicated-backup / shared-dev-session-read-only" >&2
  exit 1
  ;;
esac

if [[ "$source_dsn" == *"192.168.0.133"* && "${ERP_ALLOW_TEST_DB_AS_DEV:-}" != "1" && "${ALLOW_TARGET_DB_BACKUP_REHEARSAL:-}" != "1" ]]; then
  echo "[backup-restore-rehearsal] 拒绝默认使用 192.168.0.133 测试 / 目标库作为 source" >&2
  echo "[backup-restore-rehearsal] 如确需对目标库演练，显式设置 ALLOW_TARGET_DB_BACKUP_REHEARSAL=1" >&2
  exit 1
fi

for required_command in docker atlas curl sha256sum wc awk date jq python3; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "[backup-restore-rehearsal] 缺少命令: $required_command" >&2
    exit 1
  fi
done

if [[ -z "$pg_dump_bin" ]]; then
  for candidate in \
    /opt/homebrew/opt/postgresql@18/bin/pg_dump \
    pg_dump; do
    if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then
      pg_dump_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$psql_bin" ]]; then
  for candidate in \
    /opt/homebrew/opt/postgresql@18/bin/psql \
    psql; do
    if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then
      psql_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$pg_dump_bin" || -z "$psql_bin" ]]; then
  echo "[backup-restore-rehearsal] 缺少 PostgreSQL 18.1 pg_dump / psql 客户端" >&2
  exit 1
fi

[[ "$postgres_image" == "postgres:18.1" ]] || {
  echo "[backup-restore-rehearsal] 恢复镜像必须与生产固定为 postgres:18.1" >&2
  exit 1
}
pg_dump_version="$("$pg_dump_bin" --version)"
psql_version="$("$psql_bin" --version)"
[[ "$pg_dump_version" == *"PostgreSQL) 18."* ]] || {
  echo "[backup-restore-rehearsal] pg_dump major 必须是 PostgreSQL 18" >&2
  exit 1
}
[[ "$psql_version" == *"PostgreSQL) 18."* ]] || {
  echo "[backup-restore-rehearsal] psql major 必须是 PostgreSQL 18" >&2
  exit 1
}
atlas_version="$(atlas version 2>&1)"
grep -Eq "(^|[[:space:]])${atlas_required_version}([[:space:]]|$)" <<<"$atlas_version" || {
  echo "[backup-restore-rehearsal] Atlas 版本必须是 $atlas_required_version" >&2
  exit 1
}

source_pg_host=""
source_pg_port=""
source_pg_database=""
source_pg_user=""
source_pg_password=""
source_pg_sslmode=""
source_pg_options=""
source_role_alias="erp_backup"
source_pg_settings="$(
  BACKUP_SOURCE_POSTGRES_DSN="$source_dsn" python3 - <<'PY'
import os
import shlex
import urllib.parse

raw = os.environ.get("BACKUP_SOURCE_POSTGRES_DSN", "").strip()
parsed = urllib.parse.urlparse(raw)
if parsed.scheme not in {"postgres", "postgresql"} or parsed.fragment:
    raise SystemExit("[backup-restore-rehearsal] SOURCE_POSTGRES_DSN 格式无效")
host = parsed.hostname or ""
database = urllib.parse.unquote((parsed.path or "").lstrip("/"))
user = urllib.parse.unquote(parsed.username or "")
password = urllib.parse.unquote(parsed.password or "")
try:
    port = parsed.port or 5432
except ValueError as error:
    raise SystemExit("[backup-restore-rehearsal] SOURCE_POSTGRES_DSN 端口无效") from error
query = urllib.parse.parse_qs(parsed.query, keep_blank_values=True)
unexpected = sorted(set(query) - {"sslmode"})
if unexpected or len(query.get("sslmode", [])) > 1:
    raise SystemExit("[backup-restore-rehearsal] SOURCE_POSTGRES_DSN 含不支持的连接参数")
sslmode = (query.get("sslmode") or ["disable"])[0]
if sslmode not in {"disable", "allow", "prefer", "require", "verify-ca", "verify-full"}:
    raise SystemExit("[backup-restore-rehearsal] SOURCE_POSTGRES_DSN sslmode 无效")
if not host or not database or not user or not password:
    raise SystemExit("[backup-restore-rehearsal] SOURCE_POSTGRES_DSN 目标或凭据不完整")

for name, value in {
    "source_pg_host": host,
    "source_pg_port": str(port),
    "source_pg_database": database,
    "source_pg_user": user,
    "source_pg_password": password,
    "source_pg_sslmode": sslmode,
}.items():
    print(f"{name}={shlex.quote(value)}")
PY
)"
eval "$source_pg_settings"
unset source_pg_settings
source_dsn=""
unset "$source_env"

if [[ "$source_policy" == "shared-dev-session-read-only" ]]; then
  [[ "$environment" == "shared-dev" &&
    "$source_pg_host" == "192.168.0.106" &&
    "$source_pg_port" == "5432" &&
    "$source_pg_database" == "plush_erp" ]] || {
    echo "[backup-restore-rehearsal] shared-dev-session-read-only 只允许已登记的 192.168.0.106:5432/plush_erp shared-dev" >&2
    exit 1
  }
  source_pg_options="-c default_transaction_read_only=on"
  source_role_alias="shared-dev-configured-role"
fi

source_identity="$(PGHOST="$source_pg_host" PGPORT="$source_pg_port" \
  PGDATABASE="$source_pg_database" PGUSER="$source_pg_user" \
  PGPASSWORD="$source_pg_password" PGSSLMODE="$source_pg_sslmode" \
  PGOPTIONS="$source_pg_options" \
  "$psql_bin" -X --no-psqlrc -A -t -F '|' \
  --set ON_ERROR_STOP=1 \
  -c "
SELECT
  current_user,
  current_database(),
  current_setting('server_version_num'),
  current_setting('default_transaction_read_only'),
  role.rolsuper,
  role.rolcreatedb,
  role.rolcreaterole,
  role.rolbypassrls,
  has_database_privilege(current_user, current_database(), 'CREATE'),
  has_schema_privilege(current_user, 'public', 'CREATE'),
  (
    SELECT count(*)
    FROM information_schema.tables AS source_table
    WHERE source_table.table_schema = 'public'
      AND source_table.table_type = 'BASE TABLE'
      AND (
        NOT has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'SELECT')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'INSERT')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'UPDATE')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'DELETE')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'TRUNCATE')
      )
  )
  FROM pg_roles AS role
WHERE role.rolname = current_user;")"
IFS='|' read -r source_user source_database source_postgres_version source_read_only \
  source_super source_createdb source_createrole source_bypassrls \
  source_database_create source_schema_create source_invalid_table_count \
  <<<"$source_identity"
[[ "$source_user" == "$source_pg_user" &&
  "$source_database" == "$source_pg_database" &&
  "$source_read_only" == "on" ]] || {
  echo "[backup-restore-rehearsal] 源库身份、目标或只读会话安全检查失败" >&2
  exit 1
}
if [[ "$source_policy" == "dedicated-backup" ]]; then
  [[ "$source_user" == "erp_backup" &&
    "$source_super" == "f" && "$source_createdb" == "f" &&
    "$source_createrole" == "f" && "$source_bypassrls" == "f" &&
    "$source_database_create" == "f" && "$source_schema_create" == "f" &&
    "$source_invalid_table_count" == "0" ]] || {
    echo "[backup-restore-rehearsal] SOURCE_POSTGRES_DSN 必须使用经过权限对账的只读 erp_backup" >&2
    exit 1
  }
fi
[[ "$source_postgres_version" =~ ^18[0-9]{4}$ ]] || {
  echo "[backup-restore-rehearsal] 源 PostgreSQL major 必须是 18" >&2
  exit 1
}

backup_id="br-${customer}-$(date +%Y%m%dT%H%M%S%z)"
run_dir="${out_root%/}/$backup_id"
[[ ! -L "$out_root" ]] || {
  echo "[backup-restore-rehearsal] --out 不得是符号链接" >&2
  exit 1
}
if [[ ! -e "$out_root" ]]; then
  mkdir -p "$out_root"
  chmod 700 "$out_root"
fi
out_root_owner_uid=""
if ! out_root_owner_uid="$(stat -f '%u' "$out_root" 2>/dev/null)"; then
  out_root_owner_uid="$(stat -c '%u' "$out_root")"
fi
[[ -d "$out_root" && ! -L "$out_root" && "$out_root_owner_uid" == "$(id -u)" ]] || {
  echo "[backup-restore-rehearsal] --out 必须是当前用户拥有的普通目录" >&2
  exit 1
}
[[ ! -e "$run_dir" && ! -L "$run_dir" ]] || {
  echo "[backup-restore-rehearsal] 本次输出目录已存在，拒绝覆盖" >&2
  exit 1
}
mkdir -m 700 "$run_dir"
run_dir_abs="$(cd "$run_dir" && pwd -P)"

backup_file="$run_dir/database.dump"
backup_evidence="$run_dir/backup-evidence.md"
migration_status_file="$run_dir/migration-status.txt"
pre_migration_status_file="$run_dir/migration-status-before-apply.txt"
report_file="$run_dir/backup-restore-report.json"
command_summary_file="$run_dir/command-summary.txt"
atlas_config_file="$run_dir/atlas-runtime.hcl"

for private_file in \
  "$backup_file" \
  "$backup_evidence" \
  "$migration_status_file" \
  "$pre_migration_status_file" \
  "$report_file" \
  "$command_summary_file" \
  "$atlas_config_file"; do
  [[ ! -e "$private_file" && ! -L "$private_file" ]] || {
    echo "[backup-restore-rehearsal] 输出文件已存在，拒绝覆盖" >&2
    exit 1
  }
  : >"$private_file"
  chmod 600 "$private_file"
done

database_roles_script="$repo_root/server/deploy/compose/prod/database_roles.sh"
[[ -f "$database_roles_script" && ! -L "$database_roles_script" ]] || {
  echo "[backup-restore-rehearsal] 数据库角色脚本不存在" >&2
  exit 1
}

container_name="plush-${customer}-restore-${backup_id//[^A-Za-z0-9]/-}"
restore_pass="restore-$(date +%s)-$RANDOM"
restore_db="plush_restore"
restore_port=""
restore_dsn=""
role_secret_file=""

cleanup() {
  if [[ -n "$role_secret_file" ]]; then
    rm -f -- "$role_secret_file"
  fi
  if [[ "$keep_container" != "1" ]]; then
    docker rm -f "$container_name" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "[backup-restore-rehearsal] backupId=$backup_id"
echo "[backup-restore-rehearsal] output=$run_dir"

cat >"$command_summary_file" <<EOF
backupId=$backup_id
customer=$customer
environment=$environment
releaseVersion=$release_version
backupPurpose=$backup_purpose
postgresImage=$postgres_image
pgDumpBin=$pg_dump_bin
pgDumpVersion=$pg_dump_version
psqlVersion=$psql_version
sourcePostgresVersion=$source_postgres_version
sourceDatabase=$source_database
sourcePolicy=$source_policy
atlasVersion=$atlas_required_version
sourceEnv=$source_env
sourceAlias=env:$source_env
outputDir=$run_dir
EOF

echo "[backup-restore-rehearsal] running pg_dump with $pg_dump_version"
PGHOST="$source_pg_host" PGPORT="$source_pg_port" \
  PGDATABASE="$source_pg_database" PGUSER="$source_pg_user" \
  PGPASSWORD="$source_pg_password" PGSSLMODE="$source_pg_sslmode" \
  PGOPTIONS="$source_pg_options" \
  "$pg_dump_bin" \
  --format=custom --no-owner --no-acl --file "$backup_file"

backup_hash="$(sha256sum "$backup_file" | awk '{print $1}')"
backup_size="$(wc -c <"$backup_file" | awk '{print $1}')"

echo "[backup-restore-rehearsal] starting restore container"
docker run -d --name "$container_name" \
  -e "POSTGRES_PASS""WORD=$restore_pass" \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB="$restore_db" \
  -p 127.0.0.1::5432 \
  -v "$run_dir_abs:/work:ro" \
  "$postgres_image" >/dev/null

restore_ready="0"
for _ in $(seq 1 60); do
  container_running="$(docker inspect --format '{{.State.Running}}' "$container_name" 2>/dev/null || true)"
  pid1_comm=""
  if [[ "$container_running" == "true" ]]; then
    pid1_comm="$(docker exec "$container_name" cat /proc/1/comm 2>/dev/null || true)"
  fi
  if [[ "$container_running" == "true" && "$pid1_comm" == "postgres" ]] && \
    docker exec "$container_name" pg_isready -U postgres -d "$restore_db" >/dev/null 2>&1; then
    restore_ready="1"
    break
  fi
  sleep 1
done

if [[ "$restore_ready" != "1" ]]; then
  echo "[backup-restore-rehearsal] restore container not ready" >&2
  docker logs --tail 80 "$container_name" 2>&1 | \
    awk -v secret="$restore_pass" '{gsub(secret, "[REDACTED]"); print}' >&2 || true
  exit 1
fi

echo "[backup-restore-rehearsal] restoring dump into isolated container"
docker exec "$container_name" pg_restore --username postgres --no-owner --no-acl --dbname "$restore_db" /work/database.dump

restore_app_pass="rehearsal-app-${RANDOM}-$(date +%s)"
restore_migrator_pass="rehearsal-migrator-${RANDOM}-$(date +%s)"
restore_backup_pass="rehearsal-backup-${RANDOM}-$(date +%s)"
role_secret_file="$run_dir/restore-role.env"
{
  printf 'POSTGRES_APP_PASSWORD=%s\n' "$restore_app_pass"
  printf 'POSTGRES_MIGRATOR_PASSWORD=%s\n' "$restore_migrator_pass"
  printf 'POSTGRES_BACKUP_PASSWORD=%s\n' "$restore_backup_pass"
} >"$role_secret_file"
chmod 600 "$role_secret_file"
docker cp "$database_roles_script" "$container_name:/tmp/database_roles.sh"
docker cp "$role_secret_file" "$container_name:/tmp/database-role.env"
docker exec "$container_name" bash -ceu '
  chmod 600 /tmp/database-role.env
  set -a
  . /tmp/database-role.env
  set +a
  bash /tmp/database_roles.sh reconcile
  rm -f /tmp/database-role.env
'
rm -f "$role_secret_file"

restore_port="$(docker port "$container_name" 5432/tcp | awk -F: 'NR==1 {print $NF}')"
restore_dsn="postgres://erp_migrator:${restore_migrator_pass}@127.0.0.1:${restore_port}/${restore_db}?sslmode=disable"
cat >"$atlas_config_file" <<EOF
env "restore" {
  url = getenv("ATLAS_DATABASE_URL")
  migration {
    dir = "file://$repo_root/server/internal/data/model/migrate"
  }
}
EOF
chmod 600 "$atlas_config_file"

atlas_restore_migrate() {
  ATLAS_DATABASE_URL="$restore_dsn" atlas migrate "$@" \
    --config "file://$atlas_config_file" --env restore \
    --dir "file://$repo_root/server/internal/data/model/migrate"
}

atlas_restore_schema() {
  ATLAS_DATABASE_URL="$restore_dsn" atlas schema inspect \
    --config "file://$atlas_config_file" --env restore \
    --exclude atlas_schema_revisions --format '{{ sql . }}'
}

echo "[backup-restore-rehearsal] validating migration directory"
atlas migrate validate --dir "file://$repo_root/server/internal/data/model/migrate"

echo "[backup-restore-rehearsal] reading pre-apply migration status against restored DB"
atlas_restore_migrate status >"$pre_migration_status_file"
pre_migration_status_json="$run_dir/migration-status-before-apply.json"
atlas_restore_migrate status --format '{{ json . }}' >"$pre_migration_status_json"
chmod 600 "$pre_migration_status_json"
jq -e '(.Available | type == "array") and (.Applied | type == "array")' \
  "$pre_migration_status_json" >/dev/null

pre_migration_version="$(awk -F': ' '/Current Version:/ {print $2; exit}' "$pre_migration_status_file" | xargs || true)"

echo "[backup-restore-rehearsal] auditing populated upgrade boundaries"
sh "$populated_upgrade_preflight" \
  --audit populated-upgrade \
  --docker-container "$container_name" \
  --database "$restore_db" \
  --username postgres
populated_upgrade_audit_status="passed"

echo "[backup-restore-rehearsal] auditing customer config cutover boundaries"
sh "$populated_upgrade_preflight" \
  --audit customer-config-cutover \
  --docker-container "$container_name" \
  --database "$restore_db" \
  --username postgres
customer_config_cutover_audit_status="passed"

echo "[backup-restore-rehearsal] auditing database constraint boundaries"
sh "$populated_upgrade_preflight" \
  --audit database-constraints \
  --docker-container "$container_name" \
  --database "$restore_db" \
  --username postgres
database_constraint_audit_status="passed"

echo "[backup-restore-rehearsal] running tx-mode=all dry-run"
restore_dry_run_file="$run_dir/migration-dry-run.sql"
atlas_restore_migrate apply --dry-run --tx-mode all >"$restore_dry_run_file"
chmod 600 "$restore_dry_run_file"

pending_versions_file="$run_dir/pending-versions.txt"
jq -r '
  (.Applied // [] | map(.Version)) as $applied
  | (.Available // [])[]?.Version as $version
  | select(($applied | index($version)) == null)
  | $version
' "$pre_migration_status_json" >"$pending_versions_file"
chmod 600 "$pending_versions_file"
pending_before="$(awk 'NF {count++} END {print count + 0}' "$pending_versions_file")"
rollback_rehearsal_status="not-required"
if [[ "$pending_before" -gt 0 ]]; then
  rehearsal_sql="$run_dir/migration-rollback-rehearsal.sql"
  {
    printf '%s\n' 'BEGIN;'
    printf "%s\n" "SET LOCAL lock_timeout = '5s';"
    printf "%s\n" "SET LOCAL statement_timeout = '120s';"
    while IFS= read -r pending_version; do
      [[ "$pending_version" =~ ^[0-9]{14}$ ]] || {
        echo "[backup-restore-rehearsal] pending migration version 非法" >&2
        exit 1
      }
      mapfile -t migration_matches < <(find "$repo_root/server/internal/data/model/migrate" \
        -maxdepth 1 -type f -name "${pending_version}_*.sql" -print)
      [[ "${#migration_matches[@]}" -eq 1 ]] || {
        echo "[backup-restore-rehearsal] pending migration 未唯一匹配 SQL" >&2
        exit 1
      }
      if grep -Eiq '(^|[^[:alnum:]_])(CREATE|DROP)[[:space:]]+INDEX[[:space:]]+CONCURRENTLY([^[:alnum:]_]|$)|(^|[^[:alnum:]_])VACUUM([^[:alnum:]_]|$)|(^|[^[:alnum:]_])ALTER[[:space:]]+SYSTEM([^[:alnum:]_]|$)|(^|[^[:alnum:]_])(CREATE|DROP)[[:space:]]+DATABASE([^[:alnum:]_]|$)' "${migration_matches[0]}"; then
        echo "[backup-restore-rehearsal] pending migration 含不能在同一事务预演的操作" >&2
        exit 1
      fi
      printf '\n-- rehearsal: %s\n' "$(basename "${migration_matches[0]}")"
      cat "${migration_matches[0]}"
      printf '\n'
    done <"$pending_versions_file"
    cat <<'SQL'
SELECT
  'database_programmability='
  || count(*) FILTER (WHERE object_kind = 'function')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'procedure')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'trigger')::text
FROM (
  SELECT CASE routine.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS object_kind
  FROM pg_proc AS routine
  JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND routine.prokind IN ('f', 'p')
  UNION ALL
  SELECT 'trigger'
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND NOT trigger.tgisinternal
) AS forbidden_object;
ROLLBACK;
SQL
  } >"$rehearsal_sql"
  chmod 600 "$rehearsal_sql"
  rehearsal_output="$run_dir/migration-rollback-rehearsal.out"
  PGHOST=127.0.0.1 PGPORT="$restore_port" PGDATABASE="$restore_db" \
    PGUSER=erp_migrator PGPASSWORD="$restore_migrator_pass" PGSSLMODE=disable \
    "$psql_bin" -X --no-psqlrc \
    --set ON_ERROR_STOP=1 --file "$rehearsal_sql" >"$rehearsal_output"
  chmod 600 "$rehearsal_output"
  grep -Eq '^ROLLBACK$' "$rehearsal_output"
  grep -Eq 'database_programmability=0\|0\|0' "$rehearsal_output"
  rollback_rehearsal_status="passed"
fi

echo "[backup-restore-rehearsal] applying migrations against restored DB"
PGOPTIONS="${PGOPTIONS:+$PGOPTIONS }-c lock_timeout=5s -c statement_timeout=120s" \
  atlas_restore_migrate apply --lock-timeout 10s --tx-mode all

echo "[backup-restore-rehearsal] running post-apply migration status against restored DB"
atlas_restore_migrate status >"$migration_status_file"
post_migration_status_json="$run_dir/migration-status.json"
atlas_restore_migrate status --format '{{ json . }}' >"$post_migration_status_json"
chmod 600 "$post_migration_status_json"
jq -e '
  .Status == "OK"
  and .Next == "Already at latest version"
  and ((.Available | length) - (.Applied | length) == 0)
  and .Current == .Available[-1].Version
' "$post_migration_status_json" >/dev/null

schema_readback_file="$run_dir/schema-readback.sql"
atlas_restore_schema >"$schema_readback_file"
chmod 600 "$schema_readback_file"
[[ -s "$schema_readback_file" ]]
schema_readback_sha256="$(sha256sum "$schema_readback_file" | awk '{print $1}')"
programmability_result="$(PGHOST=127.0.0.1 PGPORT="$restore_port" \
  PGDATABASE="$restore_db" PGUSER=erp_migrator \
  PGPASSWORD="$restore_migrator_pass" PGSSLMODE=disable \
  "$psql_bin" -X --no-psqlrc -A -t \
  --set ON_ERROR_STOP=1 -c "
SELECT
  count(*) FILTER (WHERE object_kind = 'function')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'procedure')::text
  || '|'
  || count(*) FILTER (WHERE object_kind = 'trigger')::text
FROM (
  SELECT CASE routine.prokind WHEN 'p' THEN 'procedure' ELSE 'function' END AS object_kind
  FROM pg_proc AS routine
  JOIN pg_namespace AS namespace ON namespace.oid = routine.pronamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND routine.prokind IN ('f', 'p')
  UNION ALL
  SELECT 'trigger'
  FROM pg_trigger AS trigger
  JOIN pg_class AS relation ON relation.oid = trigger.tgrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname <> 'information_schema'
    AND namespace.nspname !~ '^pg_'
    AND NOT trigger.tgisinternal
) AS forbidden_object;")"
[[ "$programmability_result" == "0|0|0" ]]

role_secret_file="$run_dir/restore-role.env"
{
  printf 'POSTGRES_APP_PASSWORD=%s\n' "$restore_app_pass"
  printf 'POSTGRES_MIGRATOR_PASSWORD=%s\n' "$restore_migrator_pass"
  printf 'POSTGRES_BACKUP_PASSWORD=%s\n' "$restore_backup_pass"
} >"$role_secret_file"
chmod 600 "$role_secret_file"
docker cp "$role_secret_file" "$container_name:/tmp/database-role.env"
docker exec "$container_name" bash -ceu '
  chmod 600 /tmp/database-role.env
  set -a
  . /tmp/database-role.env
  set +a
  bash /tmp/database_roles.sh reconcile
  rm -f /tmp/database-role.env
'
rm -f "$role_secret_file"
permission_readback_status="passed"

if grep -Eiq 'dirty|failed|panic|fatal|error' "$migration_status_file"; then
  migration_status="failed"
else
  migration_status="ok"
fi

current_version="$(awk -F': ' '/Current Version:/ {print $2; exit}' "$migration_status_file" | xargs || true)"
pending_files="$(awk -F': ' '/Pending Files:/ {print $2; exit}' "$migration_status_file" | xargs || true)"
public_table_count="$(docker exec "$container_name" psql -U postgres -d "$restore_db" -X -A -t -c "select count(*) from information_schema.tables where table_schema = 'public';")"
admin_user_count="$(docker exec "$container_name" psql -U postgres -d "$restore_db" -X -A -t -c "select count(*) from admin_users;" 2>/dev/null || echo "not-available")"

if [[ "$migration_status" == "ok" && "${public_table_count:-0}" =~ ^[0-9]+$ && "$public_table_count" -gt 0 ]]; then
  smoke_query_status="passed"
else
  smoke_query_status="failed"
fi

backend_health_status="not-run"
backend_ready_status="not-run"
if [[ -n "$backend_url" ]]; then
  if curl -fsS "${backend_url%/}/healthz" >/dev/null; then
    backend_health_status="passed"
  else
    backend_health_status="failed"
  fi
  if curl -fsS "${backend_url%/}/readyz" >/dev/null; then
    backend_ready_status="passed"
  else
    backend_ready_status="failed"
  fi
fi

web_smoke_status="not-run"
if [[ -n "$web_url" ]]; then
  if curl -fsS "$web_url" >/dev/null; then
    web_smoke_status="passed"
  else
    web_smoke_status="failed"
  fi
fi

verified_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restore_target="temp-postgres-container:${postgres_image}:removed-after-run"
if [[ "$keep_container" == "1" ]]; then
  restore_target="temp-postgres-container:${container_name}:kept"
fi

cat >>"$command_summary_file" <<EOF
restoreTarget=$restore_target
populatedUpgradeAuditStatus=$populated_upgrade_audit_status
customerConfigCutoverAuditStatus=$customer_config_cutover_audit_status
databaseConstraintAuditStatus=$database_constraint_audit_status
steps=pg_dump source alias -> restore isolated target -> pre-apply atlas status -> populated upgrade read-only audit -> customer config cutover read-only audit -> database constraint read-only audit -> atlas migrate apply -> post-apply atlas status -> smoke query
sourcePolicy=$source_policy
sourceRole=$source_role_alias
restoreMigrationRole=erp_migrator
rollbackRehearsalStatus=$rollback_rehearsal_status
schemaReadbackSha256=$schema_readback_sha256
programmability=$programmability_result
permissionReadbackStatus=$permission_readback_status
EOF

cat >"$backup_evidence" <<EOF
# yoyoosun Backup Restore Rehearsal Evidence

## 基本信息

| 字段 | 值 |
| --- | --- |
| backupId | $backup_id |
| backupTime | $verified_at |
| backupPurpose | $backup_purpose |
| environment | $environment |
| operatorRole | local-developer |
| releaseVersion | $release_version |
| migrationVersion | ${pre_migration_version:-unknown} |
| sourcePolicy | $source_policy |
| sourceRole | $source_role_alias |
| sourcePostgreSQLVersion | $source_postgres_version |
| pgDumpVersion | $pg_dump_version |
| restorePostgreSQLImage | $postgres_image |
| atlasVersion | $atlas_required_version |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize | $backup_size |
| databaseBackupHash | $backup_hash |
| attachmentSnapshot | included-in-database-backup |
| storageLocationAlias | local-output-gitignored |
| encryptionEnabled | no-local-dev-dump |
| retentionPolicy | local-manual-cleanup |

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus | passed-temp-container |
| restoreTarget | $restore_target |
| restoreMigrationVersion | ${current_version:-unknown} |
| migrationBefore | ${pre_migration_version:-unknown} |
| migrationAfter | ${current_version:-unknown} |
| populatedUpgradeAuditStatus | $populated_upgrade_audit_status |
| customerConfigCutoverAuditStatus | $customer_config_cutover_audit_status |
| databaseConstraintAuditStatus | $database_constraint_audit_status |
| rollbackRehearsalStatus | $rollback_rehearsal_status |
| schemaReadbackSha256 | $schema_readback_sha256 |
| programmability | $programmability_result |
| permissionReadbackStatus | $permission_readback_status |
| smokeQueryStatus | $smoke_query_status |
| webSmokeStatus | $web_smoke_status |
| verifiedAt | $verified_at |

## 结论

- [x] 备份已恢复到隔离临时 PostgreSQL 容器。
- [x] 恢复后已执行 migration status 和 smoke query。
- [x] 恢复后已读回 schema fingerprint、programmability=0|0|0 和三角色权限合同。
- [x] 本 evidence 只记录 hash、大小、alias 和状态，不包含 dump、完整 DSN、密码或客户 raw rows。
EOF

cat >"$report_file" <<EOF
{
  "customerCode": "$customer",
  "environment": "$environment",
  "releaseVersion": "$release_version",
  "backupId": "$backup_id",
  "verifiedAt": "$verified_at",
  "sourceAlias": "env:$source_env",
  "restoreTarget": "$restore_target",
  "artifacts": {
    "backupFileAlias": "$run_dir/database.dump",
    "backupEvidence": "backup-evidence.md",
    "migrationStatus": "migration-status.txt",
    "preMigrationStatus": "migration-status-before-apply.txt",
    "commandSummary": "command-summary.txt"
  },
  "backup": {
    "databaseBackupSize": $backup_size,
    "databaseBackupHash": "$backup_hash",
    "storageLocationAlias": "local-output-gitignored",
    "migrationVersion": "${pre_migration_version:-unknown}",
    "sourcePolicy": "$source_policy",
    "sourceRole": "$source_role_alias",
    "sourcePostgreSQLVersion": "$source_postgres_version",
    "pgDumpVersion": "$pg_dump_version",
    "restorePostgreSQLImage": "$postgres_image",
    "atlasVersion": "$atlas_required_version"
  },
  "restore": {
    "restoreTestStatus": "passed-temp-container",
    "migrationBeforeApply": "${pre_migration_version:-unknown}",
    "restoreMigrationVersion": "${current_version:-unknown}",
    "pendingFiles": "${pending_files:-unknown}",
    "rollbackRehearsalStatus": "$rollback_rehearsal_status",
    "schemaReadbackSha256": "$schema_readback_sha256",
    "programmability": "$programmability_result",
    "permissionReadbackStatus": "$permission_readback_status",
    "populatedUpgradeAuditStatus": "$populated_upgrade_audit_status",
    "customerConfigCutoverAuditStatus": "$customer_config_cutover_audit_status",
    "databaseConstraintAuditStatus": "$database_constraint_audit_status"
  },
  "smoke": {
    "smokeQueryStatus": "$smoke_query_status",
    "publicTableCount": "$public_table_count",
    "adminUserCount": "$admin_user_count",
    "backendUrl": "${backend_url:-not-run}",
    "backendHealthStatus": "$backend_health_status",
    "backendReadyStatus": "$backend_ready_status",
    "webUrl": "${web_url:-not-run}",
    "webSmokeStatus": "$web_smoke_status"
  },
  "redaction": {
    "containsSecrets": false,
    "containsRawCustomerRows": false,
    "containsDumpContent": false,
    "containsFullDsn": false
  },
  "summary": {
    "backupCreated": true,
    "restoreCompleted": true,
    "migrationStatus": "$migration_status",
    "populatedUpgradeAuditStatus": "$populated_upgrade_audit_status",
    "customerConfigCutoverAuditStatus": "$customer_config_cutover_audit_status",
    "databaseConstraintAuditStatus": "$database_constraint_audit_status",
    "smokeQueryStatus": "$smoke_query_status"
  }
}
EOF

if [[ "$migration_status" != "ok" || "$populated_upgrade_audit_status" != "passed" || "$customer_config_cutover_audit_status" != "passed" || "$database_constraint_audit_status" != "passed" || "$smoke_query_status" != "passed" || ( "$rollback_rehearsal_status" != "passed" && "$rollback_rehearsal_status" != "not-required" ) || "$programmability_result" != "0|0|0" || "$permission_readback_status" != "passed" ]]; then
  echo "[backup-restore-rehearsal] failed: migrationStatus=$migration_status populatedUpgradeAuditStatus=$populated_upgrade_audit_status customerConfigCutoverAuditStatus=$customer_config_cutover_audit_status databaseConstraintAuditStatus=$database_constraint_audit_status rollbackRehearsalStatus=$rollback_rehearsal_status programmability=$programmability_result permissionReadbackStatus=$permission_readback_status smokeQueryStatus=$smoke_query_status" >&2
  exit 1
fi

if [[ "$backend_health_status" == "failed" || "$backend_ready_status" == "failed" || "$web_smoke_status" == "failed" ]]; then
  echo "[backup-restore-rehearsal] failed: backend/web smoke failed" >&2
  exit 1
fi

if [[ -n "$evidence_dir" ]]; then
  cp "$backup_evidence" "$evidence_dir/backup-evidence.md"
  cp "$pre_migration_status_file" "$evidence_dir/migration-status-before-apply.txt"
  cp "$migration_status_file" "$evidence_dir/migration-status.txt"
  cp "$command_summary_file" "$evidence_dir/command-summary.txt"
  cp "$report_file" "$evidence_dir/backup-restore-report.json"
  echo "[backup-restore-rehearsal] copied sanitized release artifacts to $evidence_dir"
fi

echo "[backup-restore-rehearsal] ok: $report_file"
