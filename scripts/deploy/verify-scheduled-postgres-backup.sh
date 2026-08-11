#!/usr/bin/env bash
set -euo pipefail
umask 077

print_help() {
  cat <<'USAGE'
用法:
  bash scripts/deploy/verify-scheduled-postgres-backup.sh \
    --backup-dir </absolute/offsite-dir> \
    --age-identity-file </absolute/age-identity.txt> \
    --report </absolute/report.json> \
    [--postgres-image postgres:18.1] \
    [--max-backup-age-hours 36]

作用:
  选择指定目录内最新的 plush_erp-*.dump.age，核对同名 SHA-256，使用私有
  age identity 解密到 0700 临时目录，恢复到一次性 PostgreSQL 容器，并读回
  表数量和 Atlas migration version。临时明文在退出时删除。
USAGE
}

backup_dir=""
age_identity_file=""
report_file=""
postgres_image="postgres:18.1"
max_backup_age_hours="36"

while [[ $# -gt 0 ]]; do
  case "$1" in
  --backup-dir)
    backup_dir="${2:-}"
    shift 2
    ;;
  --age-identity-file)
    age_identity_file="${2:-}"
    shift 2
    ;;
  --report)
    report_file="${2:-}"
    shift 2
    ;;
  --postgres-image)
    postgres_image="${2:-}"
    shift 2
    ;;
  --max-backup-age-hours)
    max_backup_age_hours="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[scheduled-restore-check] 不支持的参数: $1" >&2
    exit 2
    ;;
  esac
done

for command_name in age docker mktemp realpath sha256sum stat; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "[scheduled-restore-check] 缺少命令: $command_name" >&2
    exit 1
  }
done
[[ "$backup_dir" =~ ^/[A-Za-z0-9._/-]+$ && "$backup_dir" != "/" && -d "$backup_dir" && ! -L "$backup_dir" ]] || {
  echo "[scheduled-restore-check] --backup-dir 必须是安全的绝对目录" >&2
  exit 2
}
[[ "$(realpath -m "$backup_dir")" == "$backup_dir" ]] || {
  echo "[scheduled-restore-check] --backup-dir 不能经过符号链接" >&2
  exit 2
}
offsite_marker="$backup_dir/.plush-toy-erp-offsite-target"
[[ -f "$offsite_marker" && ! -L "$offsite_marker" && "$(<"$offsite_marker")" == "plush-toy-erp-offsite-v1" ]] || {
  echo "[scheduled-restore-check] --backup-dir 缺少有效异地挂载标记" >&2
  exit 2
}
[[ "$age_identity_file" =~ ^/[A-Za-z0-9._/-]+$ && -f "$age_identity_file" && ! -L "$age_identity_file" ]] || {
  echo "[scheduled-restore-check] --age-identity-file 必须是安全的绝对普通文件" >&2
  exit 2
}
[[ "$(stat -c '%u' "$age_identity_file")" == "$(id -u)" && "$(stat -c '%a' "$age_identity_file")" =~ ^(400|600)$ ]] || {
  echo "[scheduled-restore-check] --age-identity-file 必须由当前用户持有且权限为 0400 或 0600" >&2
  exit 2
}
[[ "$report_file" =~ ^/[A-Za-z0-9._/-]+\.json$ && "$report_file" != *"/../"* && "$report_file" != *"/./"* ]] || {
  echo "[scheduled-restore-check] --report 必须是无 dot segment 的绝对 JSON 路径" >&2
  exit 2
}
[[ "$postgres_image" == "postgres:18.1" ]] || {
  echo "[scheduled-restore-check] --postgres-image 必须固定为 postgres:18.1" >&2
  exit 2
}
[[ "$max_backup_age_hours" =~ ^[0-9]+$ && "$max_backup_age_hours" -ge 1 && "$max_backup_age_hours" -le 168 ]] || {
  echo "[scheduled-restore-check] --max-backup-age-hours 必须是 1-168 的整数" >&2
  exit 2
}

shopt -s nullglob
backups=("$backup_dir"/plush_erp-*.dump.age)
((${#backups[@]} > 0)) || {
  echo "[scheduled-restore-check] 未找到受管备份" >&2
  exit 1
}
backup_file="${backups[0]}"
for candidate in "${backups[@]:1}"; do
  if [[ "$(stat -c %Y "$candidate")" -gt "$(stat -c %Y "$backup_file")" ]]; then
    backup_file="$candidate"
  fi
done
[[ -f "$backup_file" && ! -L "$backup_file" && -s "$backup_file" ]] || {
  echo "[scheduled-restore-check] 最新备份不是安全的普通文件" >&2
  exit 1
}
backup_mtime_epoch="$(stat -c %Y "$backup_file")"
checked_epoch="$(date -u +%s)"
backup_age_seconds="$((checked_epoch - backup_mtime_epoch))"
max_backup_age_seconds="$((max_backup_age_hours * 3600))"
[[ "$backup_age_seconds" -ge 0 && "$backup_age_seconds" -le "$max_backup_age_seconds" ]] || {
  echo "[scheduled-restore-check] 最新异地备份已超过 ${max_backup_age_hours} 小时" >&2
  exit 1
}

backup_name="$(basename "$backup_file" .dump.age)"
[[ "$backup_name" =~ ^plush_erp-[0-9]{8}T[0-9]{6}Z-[0-9]+$ ]] || {
  echo "[scheduled-restore-check] 备份文件名不符合受管格式" >&2
  exit 1
}
checksum_file="$backup_dir/${backup_name}.sha256"
[[ -f "$checksum_file" && ! -L "$checksum_file" ]] || {
  echo "[scheduled-restore-check] 缺少同名 checksum" >&2
  exit 1
}
expected_hash="$(awk 'NR == 1 {print $1}' "$checksum_file")"
[[ "$expected_hash" =~ ^[a-f0-9]{64}$ ]] || {
  echo "[scheduled-restore-check] checksum 格式非法" >&2
  exit 1
}
actual_hash="$(sha256sum "$backup_file" | awk '{print $1}')"
[[ "$actual_hash" == "$expected_hash" ]] || {
  echo "[scheduled-restore-check] 备份 checksum 不匹配" >&2
  exit 1
}

container_name=""
restore_tmp_dir=""
decrypted_backup=""
cleanup() {
  if [[ -n "$container_name" ]]; then
    docker rm --force "$container_name" >/dev/null 2>&1 || true
  fi
  if [[ -n "$decrypted_backup" ]]; then
    rm -f -- "$decrypted_backup"
  fi
  if [[ -n "$restore_tmp_dir" ]]; then
    rmdir "$restore_tmp_dir" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

restore_tmp_dir="$(mktemp -d /tmp/plush-scheduled-restore.XXXXXX)"
restore_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
restore_started_epoch="$(date -u +%s)"
chmod 0700 "$restore_tmp_dir"
decrypted_backup="$restore_tmp_dir/database.dump"
age --decrypt --identity "$age_identity_file" --output "$decrypted_backup" "$backup_file"
chmod 0600 "$decrypted_backup"
[[ -s "$decrypted_backup" ]] || {
  echo "[scheduled-restore-check] 解密后的备份为空" >&2
  exit 1
}
decrypted_hash="$(sha256sum "$decrypted_backup" | awk '{print $1}')"

container_name="plush-restore-check-$(date -u +%Y%m%dT%H%M%SZ)-$$"
restore_password="restore-check-$RANDOM-$$"
restore_db="plush_restore_check"

docker run --detach --rm \
  --name "$container_name" \
  --network none \
  --memory 1g \
  --cpus 1 \
  --pids-limit 256 \
  --env "POSTGRES_PASSWORD=$restore_password" \
  --env "POSTGRES_DB=$restore_db" \
  --volume "$decrypted_backup:/backup/database.dump:ro" \
  "$postgres_image" >/dev/null

ready="false"
for _ in $(seq 1 30); do
  if docker exec "$container_name" pg_isready -U postgres -d "$restore_db" >/dev/null 2>&1; then
    ready="true"
    break
  fi
  sleep 2
done
[[ "$ready" == "true" ]] || {
  echo "[scheduled-restore-check] 临时 PostgreSQL 未就绪" >&2
  exit 1
}

docker exec "$container_name" pg_restore \
  --username postgres --dbname "$restore_db" --no-owner --no-acl --exit-on-error \
  /backup/database.dump
table_count="$(docker exec "$container_name" psql -X -A -t -q -v ON_ERROR_STOP=1 \
  -U postgres -d "$restore_db" \
  -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")"
[[ "$table_count" =~ ^[1-9][0-9]*$ ]] || {
  echo "[scheduled-restore-check] 恢复库没有业务表" >&2
  exit 1
}
migration_version="$(docker exec "$container_name" psql -X -A -t -q \
  -U postgres -d "$restore_db" \
  -c "SELECT version FROM atlas_schema_revisions.atlas_schema_revisions WHERE type = 2 ORDER BY executed_at DESC LIMIT 1;" 2>/dev/null || true)"
migration_version="${migration_version:-unknown}"
[[ "$migration_version" =~ ^[0-9]{14}$ ]] || {
  echo "[scheduled-restore-check] 恢复库 Atlas migration version 无法读回" >&2
  exit 1
}

report_dir="$(dirname "$report_file")"
mkdir -p "$report_dir"
[[ -d "$report_dir" && ! -L "$report_dir" && "$(realpath -m "$report_dir")" == "$report_dir" && ! -L "$report_file" ]] || {
  echo "[scheduled-restore-check] --report 目录不得经过符号链接" >&2
  exit 2
}
chmod 0700 "$report_dir"
report_tmp="${report_file}.tmp.$$"
restore_finished_epoch="$(date -u +%s)"
restore_duration_seconds="$((restore_finished_epoch - restore_started_epoch))"
cat >"$report_tmp" <<EOF
{
  "schemaVersion": "plush.scheduled-backup-restore-check/v2",
  "status": "passed",
  "checkedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "restoreStartedAt": "$restore_started_at",
  "restoreDurationSeconds": $restore_duration_seconds,
  "backupId": "$backup_name",
  "backupAgeSeconds": $backup_age_seconds,
  "maxBackupAgeSeconds": $max_backup_age_seconds,
  "encryptedSha256": "$actual_hash",
  "encryptedSizeBytes": $(wc -c <"$backup_file" | awk '{print $1}'),
  "decryptedSha256": "$decrypted_hash",
  "decryptedSizeBytes": $(wc -c <"$decrypted_backup" | awk '{print $1}'),
  "encryption": "age",
  "postgresImage": "$postgres_image",
  "publicTableCount": $table_count,
  "migrationVersion": "$migration_version",
  "restoreTarget": "temporary-postgres-container-removed"
}
EOF
mv "$report_tmp" "$report_file"
echo "[scheduled-restore-check] status=passed backupId=$backup_name publicTableCount=$table_count migrationVersion=$migration_version"
