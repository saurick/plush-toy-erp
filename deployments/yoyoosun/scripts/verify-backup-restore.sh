#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/verify-backup-restore.sh --evidence deployments/yoyoosun/evidence/backups/backup-evidence-template.md

作用:
  校验备份恢复 evidence 文档是否包含必要字段。该脚本不读取、不复制、不恢复真实备份文件。
USAGE
}

evidence=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --evidence)
    evidence="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[verify-backup-restore] 不支持的参数: $1"
    print_help
    exit 1
    ;;
  esac
done

if [[ -z "$evidence" || ! -f "$evidence" ]]; then
  print_help
  exit 1
fi

required_terms=(
  backupId
  databaseBackupHash
  storageLocationAlias
  restoreTestStatus
  smokeQueryStatus
)

for term in "${required_terms[@]}"; do
  if ! grep -q "$term" "$evidence"; then
    echo "[verify-backup-restore] 缺少字段: $term"
    exit 1
  fi
done

if grep -Eiq 'BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY|postgres://[^[:space:]]+:[^*@[:space:]]+@|AKIA[0-9A-Z]{16}' "$evidence"; then
  echo "[verify-backup-restore] evidence 似乎包含 secret"
  exit 1
fi

echo "[verify-backup-restore] ok: $evidence"
