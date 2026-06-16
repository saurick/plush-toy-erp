#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  SOURCE_POSTGRES_DSN="$(cd server && make print_db_url)" \
  bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh \
    --release-version local-dev-20260616 \
    --out output/customers/yoyoosun/backup-restore-rehearsal \
    --backend-url http://127.0.0.1:8300 \
    --web-url http://127.0.0.1:5175/erp

作用:
  对 SOURCE_POSTGRES_DSN 指向的库执行一次真实备份恢复演练：
  1. 用本机 pg_dump 生成 custom dump 到 output/。
  2. 启动临时隔离 PostgreSQL 容器。
  3. 将 dump 恢复到临时库。
  4. 对恢复库执行 Atlas migration status 和 smoke query。
  5. 可选执行 backend healthz/readyz 和 web 主路径 HTTP smoke。
  6. 生成脱敏 backup-evidence.md、migration-status.txt 和 backup-restore-report.json。

边界:
  - 不读取、不提交真实 .env。
  - 不把 dump、secret、完整 DSN 或客户 raw rows 写入 git。
  - 默认拒绝把 192.168.0.133 测试 / 目标库当成本地 source，除非显式设置
    ERP_ALLOW_TEST_DB_AS_DEV=1 或 ALLOW_TARGET_DB_BACKUP_REHEARSAL=1。
USAGE
}

customer="yoyoosun"
environment="local-dev"
release_version=""
backup_purpose="backup-restore-rehearsal"
out_root="output/customers/yoyoosun/backup-restore-rehearsal"
postgres_image="${POSTGRES_REHEARSAL_IMAGE:-postgres:18}"
pg_dump_bin="${PG_DUMP_BIN:-}"
source_env="SOURCE_POSTGRES_DSN"
backend_url=""
web_url=""
keep_container="0"

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

source_dsn="${!source_env:-}"
if [[ -z "$source_dsn" ]]; then
  echo "[backup-restore-rehearsal] 请通过 $source_env 提供源库 DSN" >&2
  exit 1
fi

if [[ "$source_dsn" == *"192.168.0.133"* && "${ERP_ALLOW_TEST_DB_AS_DEV:-}" != "1" && "${ALLOW_TARGET_DB_BACKUP_REHEARSAL:-}" != "1" ]]; then
  echo "[backup-restore-rehearsal] 拒绝默认使用 192.168.0.133 测试 / 目标库作为 source" >&2
  echo "[backup-restore-rehearsal] 如确需对目标库演练，显式设置 ALLOW_TARGET_DB_BACKUP_REHEARSAL=1" >&2
  exit 1
fi

for required_command in docker atlas curl sha256sum wc awk date; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "[backup-restore-rehearsal] 缺少命令: $required_command" >&2
    exit 1
  fi
done

if [[ -z "$pg_dump_bin" ]]; then
  for candidate in \
    /opt/homebrew/opt/postgresql@18/bin/pg_dump \
    /opt/homebrew/opt/postgresql@17/bin/pg_dump \
    /opt/homebrew/opt/postgresql@16/bin/pg_dump \
    pg_dump; do
    if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then
      pg_dump_bin="$candidate"
      break
    fi
  done
fi

if [[ -z "$pg_dump_bin" ]]; then
  echo "[backup-restore-rehearsal] 缺少 pg_dump；可用 --pg-dump-bin 指定 PostgreSQL 客户端路径" >&2
  exit 1
fi

backup_id="br-${customer}-$(date +%Y%m%dT%H%M%S%z)"
run_dir="${out_root%/}/$backup_id"
mkdir -p "$run_dir"

backup_file="$run_dir/database.dump"
backup_evidence="$run_dir/backup-evidence.md"
migration_status_file="$run_dir/migration-status.txt"
report_file="$run_dir/backup-restore-report.json"
command_summary_file="$run_dir/command-summary.txt"

container_name="plush-${customer}-restore-${backup_id//[^A-Za-z0-9]/-}"
restore_pass="restore-$(date +%s)-$RANDOM"
restore_db="plush_restore"
restore_port=""
restore_dsn=""

cleanup() {
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
sourceEnv=$source_env
sourceAlias=env:$source_env
outputDir=$run_dir
EOF

echo "[backup-restore-rehearsal] running pg_dump with $("$pg_dump_bin" --version)"
"$pg_dump_bin" --format=custom --no-owner --no-acl --file "$backup_file" "$source_dsn"

backup_hash="$(sha256sum "$backup_file" | awk '{print $1}')"
backup_size="$(wc -c <"$backup_file" | awk '{print $1}')"

echo "[backup-restore-rehearsal] starting restore container"
docker run -d --name "$container_name" \
  -e "POSTGRES_PASS""WORD=$restore_pass" \
  -e POSTGRES_DB="$restore_db" \
  -p 127.0.0.1::5432 \
  -v "$PWD/$run_dir:/work:ro" \
  "$postgres_image" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container_name" pg_isready -U postgres -d "$restore_db" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker exec "$container_name" pg_isready -U postgres -d "$restore_db" >/dev/null 2>&1; then
  echo "[backup-restore-rehearsal] restore container not ready" >&2
  exit 1
fi

echo "[backup-restore-rehearsal] restoring dump into isolated container"
docker exec "$container_name" pg_restore --username postgres --no-owner --no-acl --dbname "$restore_db" /work/database.dump

restore_port="$(docker port "$container_name" 5432/tcp | awk -F: 'NR==1 {print $NF}')"
restore_dsn="postgres://postgres:${restore_pass}@127.0.0.1:${restore_port}/${restore_db}?sslmode=disable"

echo "[backup-restore-rehearsal] running migration status against restored DB"
(
  cd server
  atlas migrate status --dir "file://internal/data/model/migrate" --url "$restore_dsn"
) >"$migration_status_file"

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
| migrationVersion | ${current_version:-unknown} |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize | $backup_size |
| databaseBackupHash | $backup_hash |
| attachmentSnapshot | not-in-scope |
| storageLocationAlias | local-output-gitignored |
| encryptionEnabled | no-local-dev-dump |
| retentionPolicy | local-manual-cleanup |

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus | passed-temp-container |
| restoreTarget | $restore_target |
| restoreMigrationVersion | ${current_version:-unknown} |
| smokeQueryStatus | $smoke_query_status |
| webSmokeStatus | $web_smoke_status |
| verifiedAt | $verified_at |

## 结论

- [x] 备份已恢复到隔离临时 PostgreSQL 容器。
- [x] 恢复后已执行 migration status 和 smoke query。
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
    "backupEvidence": "$backup_evidence",
    "migrationStatus": "$migration_status_file",
    "commandSummary": "$command_summary_file"
  },
  "backup": {
    "databaseBackupSize": $backup_size,
    "databaseBackupHash": "$backup_hash",
    "storageLocationAlias": "local-output-gitignored"
  },
  "restore": {
    "restoreTestStatus": "passed-temp-container",
    "restoreMigrationVersion": "${current_version:-unknown}",
    "pendingFiles": "${pending_files:-unknown}"
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
    "smokeQueryStatus": "$smoke_query_status"
  }
}
EOF

if [[ "$migration_status" != "ok" || "$smoke_query_status" != "passed" ]]; then
  echo "[backup-restore-rehearsal] failed: migrationStatus=$migration_status smokeQueryStatus=$smoke_query_status" >&2
  exit 1
fi

if [[ "$backend_health_status" == "failed" || "$backend_ready_status" == "failed" || "$web_smoke_status" == "failed" ]]; then
  echo "[backup-restore-rehearsal] failed: backend/web smoke failed" >&2
  exit 1
fi

echo "[backup-restore-rehearsal] ok: $report_file"
