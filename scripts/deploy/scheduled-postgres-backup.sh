#!/usr/bin/env bash
set -euo pipefail
umask 077

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/deploy/scheduled-postgres-backup.sh \
    --compose-file </absolute/compose.yml> \
    --env-file </absolute/runtime.env> \
    --backup-dir </absolute/local-backup-dir> \
    --offsite-dir </absolute/mounted-offsite-dir> \
    --age-recipient-file </absolute/age-recipient.txt> \
    [--retention-days 35]

作用:
  通过生产 Compose 中的 postgres 容器执行 custom-format pg_dump，完成
  pg_restore 列表校验、SHA-256、本地原子落盘、age 加密异地副本和定向保留。

边界:
  默认要求 --offsite-dir 和 --age-recipient-file。只有隔离开发验证可显式使用
  --allow-local-only；该模式不会形成正式日常备份证据。
  仅清理指定目录内由本脚本生成、且超过保留期的 plush_erp-* 文件。
USAGE
}

compose_file=""
env_file=""
backup_dir=""
offsite_dir=""
age_recipient_file=""
retention_days="35"
allow_local_only="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
  --compose-file)
    compose_file="${2:-}"
    shift 2
    ;;
  --env-file)
    env_file="${2:-}"
    shift 2
    ;;
  --backup-dir)
    backup_dir="${2:-}"
    shift 2
    ;;
  --offsite-dir)
    offsite_dir="${2:-}"
    shift 2
    ;;
  --age-recipient-file)
    age_recipient_file="${2:-}"
    shift 2
    ;;
  --retention-days)
    retention_days="${2:-}"
    shift 2
    ;;
  --allow-local-only)
    allow_local_only="true"
    shift
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[scheduled-backup] 不支持的参数: $1" >&2
    print_help >&2
    exit 2
    ;;
  esac
done

for command_name in docker flock realpath sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "[scheduled-backup] 缺少命令: $command_name" >&2
    exit 1
  }
done
docker compose version >/dev/null

validate_plain_absolute_file() {
  local path_value="$1"
  local label="$2"
  [[ "$path_value" =~ ^/[A-Za-z0-9._/-]+$ && "$path_value" != *"/../"* && "$path_value" != *"/./"* ]] || {
    echo "[scheduled-backup] $label 必须是无空格、无 dot segment 的绝对路径" >&2
    exit 2
  }
  [[ -f "$path_value" && ! -L "$path_value" ]] || {
    echo "[scheduled-backup] $label 必须是普通文件: $path_value" >&2
    exit 2
  }
}

validate_backup_directory() {
  local path_value="$1"
  local label="$2"
  [[ "$path_value" =~ ^/[A-Za-z0-9._/-]+$ && "$path_value" != "/" && "$path_value" != *"/../"* && "$path_value" != *"/./"* ]] || {
    echo "[scheduled-backup] $label 必须是非根目录、无 dot segment 的绝对路径" >&2
    exit 2
  }
  mkdir -p "$path_value"
  [[ -d "$path_value" && ! -L "$path_value" && "$(realpath -m "$path_value")" == "$path_value" ]] || {
    echo "[scheduled-backup] $label 不能经过符号链接: $path_value" >&2
    exit 2
  }
  chmod 0700 "$path_value"
}

validate_plain_absolute_file "$compose_file" "--compose-file"
validate_plain_absolute_file "$env_file" "--env-file"
[[ "$retention_days" =~ ^[0-9]+$ && "$retention_days" -ge 7 && "$retention_days" -le 366 ]] || {
  echo "[scheduled-backup] --retention-days 必须是 7-366 的整数" >&2
  exit 2
}
validate_backup_directory "$backup_dir" "--backup-dir"
if [[ -n "$offsite_dir" ]]; then
  [[ -d "$offsite_dir" && ! -L "$offsite_dir" && "$(realpath -m "$offsite_dir")" == "$offsite_dir" ]] || {
    echo "[scheduled-backup] --offsite-dir 必须是已挂载、且不经过符号链接的现有目录" >&2
    exit 2
  }
  offsite_marker="$offsite_dir/.plush-toy-erp-offsite-target"
  [[ -f "$offsite_marker" && ! -L "$offsite_marker" && "$(<"$offsite_marker")" == "plush-toy-erp-offsite-v1" ]] || {
    echo "[scheduled-backup] --offsite-dir 缺少有效异地挂载标记" >&2
    exit 2
  }
  [[ "$(stat -c '%d' "$offsite_dir")" != "$(stat -c '%d' "$backup_dir")" ]] || {
    echo "[scheduled-backup] --offsite-dir 与本地备份目录位于同一文件系统" >&2
    exit 2
  }
  command -v age >/dev/null 2>&1 || {
    echo "[scheduled-backup] 异地加密需要 age 命令" >&2
    exit 1
  }
  validate_plain_absolute_file "$age_recipient_file" "--age-recipient-file"
  [[ "$(stat -c '%a' "$age_recipient_file")" =~ ^(400|440|444|600|640|644)$ ]] || {
    echo "[scheduled-backup] --age-recipient-file 权限必须是只读或仅 owner 可写" >&2
    exit 2
  }
  age_recipient="$(awk 'NF && $1 !~ /^#/ {print $1; exit}' "$age_recipient_file")"
  [[ "$age_recipient" =~ ^age1[0-9a-z]+$ ]] || {
    echo "[scheduled-backup] --age-recipient-file 不含有效 age recipient" >&2
    exit 2
  }
elif [[ "$allow_local_only" != "true" ]]; then
  echo "[scheduled-backup] 正式备份必须提供 --offsite-dir" >&2
  exit 2
elif [[ -n "$age_recipient_file" ]]; then
  echo "[scheduled-backup] --age-recipient-file 只能与 --offsite-dir 一起使用" >&2
  exit 2
fi

status_file="$backup_dir/latest-status.env"
backup_id="plush_erp-$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup_tmp="$backup_dir/.${backup_id}.dump.tmp"
checksum_tmp="$backup_dir/.${backup_id}.sha256.tmp"
backup_file="$backup_dir/${backup_id}.dump"
checksum_file="$backup_dir/${backup_id}.sha256"
backup_hash=""
backup_size="0"
backup_postgres_version="unavailable"
backup_pg_dump_version="unavailable"
offsite_hash=""
offsite_copied="false"
offsite_encrypted="false"
offsite_tmp=""
offsite_checksum_tmp=""
completed="false"
lock_acquired="false"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
started_epoch="$(date -u +%s)"
migration_version="unknown"

write_status() {
  local state="$1"
  local status_tmp="${status_file}.tmp.$$"
  umask 077
  {
    printf 'status=%s\n' "$state"
    printf 'backupId=%s\n' "$backup_id"
    printf 'generatedAt=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'startedAt=%s\n' "$started_at"
    printf 'durationSeconds=%s\n' "$(($(date -u +%s) - started_epoch))"
    printf 'backupFile=%s.dump\n' "$backup_id"
    printf 'sha256=%s\n' "${backup_hash:-unavailable}"
    printf 'sizeBytes=%s\n' "$backup_size"
    printf 'postgresVersion=%s\n' "$backup_postgres_version"
    printf 'pgDumpVersion=%s\n' "$backup_pg_dump_version"
    printf 'migrationVersion=%s\n' "$migration_version"
    printf 'offsiteCopied=%s\n' "$offsite_copied"
    printf 'offsiteEncrypted=%s\n' "$offsite_encrypted"
    printf 'offsiteSha256=%s\n' "${offsite_hash:-unavailable}"
  } >"$status_tmp"
  mv "$status_tmp" "$status_file"
}

cleanup() {
  local exit_code=$?
  rm -f "$backup_tmp" "$checksum_tmp"
  if [[ -n "$offsite_tmp" ]]; then
    rm -f -- "$offsite_tmp"
  fi
  if [[ -n "$offsite_checksum_tmp" ]]; then
    rm -f -- "$offsite_checksum_tmp"
  fi
  if [[ "$lock_acquired" == "true" && "$completed" != "true" ]]; then
    write_status failed || true
  fi
  exit "$exit_code"
}
trap cleanup EXIT

exec 9>"$backup_dir/.scheduled-backup.lock"
if ! flock -n 9; then
  echo "[scheduled-backup] 已有备份任务运行中" >&2
  exit 1
fi
lock_acquired="true"

compose=(docker compose --env-file "$env_file" -f "$compose_file")
"${compose[@]}" config >/dev/null
write_status running

backup_identity_sql="$(
  cat <<'SQL'
SELECT
  current_user,
  current_setting('server_version'),
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
WHERE role.rolname = current_user;
SQL
)"
# The container shell, not the host shell, expands the two Compose-provided variables.
# shellcheck disable=SC2016
backup_identity="$({
  printf '%s\n' "$backup_identity_sql"
} | "${compose[@]}" exec -T postgres sh -eu -c '
  export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"
  exec psql --host 127.0.0.1 --username erp_backup --dbname "$POSTGRES_DB" \
    -X --no-psqlrc -A -t -F "|" --set ON_ERROR_STOP=1 --file -
')"
backup_identity="${backup_identity//$'\r'/}"
IFS='|' read -r backup_user backup_postgres_version postgres_version_num \
  backup_read_only backup_super \
  backup_createdb backup_createrole backup_bypassrls backup_database_create \
  backup_schema_create backup_invalid_table_count <<<"$backup_identity"
[[ "$backup_user" == "erp_backup" && "$backup_postgres_version" =~ ^18\.1([[:space:].]|$) &&
  "$postgres_version_num" =~ ^18[0-9]{4}$ &&
  "$backup_read_only" == "on" && "$backup_super" == "f" &&
  "$backup_createdb" == "f" && "$backup_createrole" == "f" &&
  "$backup_bypassrls" == "f" && "$backup_database_create" == "f" &&
  "$backup_schema_create" == "f" && "$backup_invalid_table_count" == "0" ]] || {
  echo "[scheduled-backup] erp_backup 身份或只读权限对账失败" >&2
  exit 1
}
backup_postgres_version="18.1"
backup_pg_dump_version="$("${compose[@]}" exec -T postgres pg_dump --version)"
backup_pg_dump_version="${backup_pg_dump_version//$'\r'/}"
[[ "$backup_pg_dump_version" == *"PostgreSQL) 18.1"* ]] || {
  echo "[scheduled-backup] pg_dump 必须固定为 PostgreSQL 18.1" >&2
  exit 1
}
backup_pg_dump_version="18.1"

# shellcheck disable=SC2016
migration_version="$("${compose[@]}" exec -T postgres sh -eu -c '
  export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"
  exec psql --host 127.0.0.1 --username erp_backup --dbname "$POSTGRES_DB" \
    -X --no-psqlrc -A -t -q --set ON_ERROR_STOP=1 \
    -c "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1"
')"
migration_version="${migration_version//$'\r'/}"
migration_version="${migration_version//$'\n'/}"
[[ "$migration_version" =~ ^[0-9]{14}$ ]] || {
  echo "[scheduled-backup] 无法读回 Atlas migration version" >&2
  exit 1
}

# The container shell expands POSTGRES_BACKUP_PASSWORD and POSTGRES_DB.
# shellcheck disable=SC2016
"${compose[@]}" exec -T postgres sh -eu -c \
  'export PGPASSWORD="$POSTGRES_BACKUP_PASSWORD"; exec pg_dump --host 127.0.0.1 --username erp_backup --dbname "$POSTGRES_DB" --format=custom --no-owner --no-acl' \
  >"$backup_tmp"
[[ -s "$backup_tmp" ]] || {
  echo "[scheduled-backup] pg_dump 输出为空" >&2
  exit 1
}
"${compose[@]}" exec -T postgres pg_restore --list <"$backup_tmp" >/dev/null

backup_hash="$(sha256sum "$backup_tmp" | awk '{print $1}')"
backup_size="$(wc -c <"$backup_tmp" | awk '{print $1}')"
printf '%s  %s.dump\n' "$backup_hash" "$backup_id" >"$checksum_tmp"
mv "$backup_tmp" "$backup_file"
mv "$checksum_tmp" "$checksum_file"

if [[ -n "$offsite_dir" ]]; then
  offsite_tmp="$offsite_dir/.${backup_id}.dump.age.tmp"
  offsite_checksum_tmp="$offsite_dir/.${backup_id}.sha256.tmp"
  age --recipient "$age_recipient" --output "$offsite_tmp" "$backup_file"
  chmod 0600 "$offsite_tmp"
  offsite_hash="$(sha256sum "$offsite_tmp" | awk '{print $1}')"
  [[ "$offsite_hash" =~ ^[a-f0-9]{64}$ ]] || {
    rm -f "$offsite_tmp"
    echo "[scheduled-backup] 异地加密副本校验失败" >&2
    exit 1
  }
  printf '%s  %s.dump.age\n' "$offsite_hash" "$backup_id" >"$offsite_checksum_tmp"
  chmod 0600 "$offsite_checksum_tmp"
  mv "$offsite_tmp" "$offsite_dir/${backup_id}.dump.age"
  mv "$offsite_checksum_tmp" "$offsite_dir/${backup_id}.sha256"
  offsite_copied="true"
  offsite_encrypted="true"
fi

prune_managed_backups() {
  local target_dir="$1"
  find "$target_dir" -maxdepth 1 -type f \
    \( -name 'plush_erp-*.dump' -o -name 'plush_erp-*.dump.age' -o -name 'plush_erp-*.sha256' \) \
    -mtime "+$retention_days" -delete
}

prune_managed_backups "$backup_dir"
if [[ -n "$offsite_dir" ]]; then
  prune_managed_backups "$offsite_dir"
fi

write_status passed
completed="true"
echo "[scheduled-backup] status=passed backupId=$backup_id sizeBytes=$backup_size offsiteCopied=$offsite_copied offsiteEncrypted=$offsite_encrypted"
