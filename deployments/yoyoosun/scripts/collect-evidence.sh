#!/usr/bin/env bash
set -euo pipefail

print_help() {
  cat <<'USAGE'
用法:
  bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <version> --output deployments/yoyoosun/evidence/releases/<date>

作用:
  生成 release evidence 草稿目录。该脚本不采集 secret、不复制 .env、不复制备份文件。
USAGE
}

release_version=""
output_dir=""

while [[ $# -gt 0 ]]; do
  case "$1" in
  --release-version)
    release_version="${2:-}"
    shift 2
    ;;
  --output)
    output_dir="${2:-}"
    shift 2
    ;;
  -h | --help)
    print_help
    exit 0
    ;;
  *)
    echo "[collect-evidence] 不支持的参数: $1"
    print_help
    exit 1
    ;;
  esac
done

if [[ -z "$release_version" || -z "$output_dir" ]]; then
  print_help
  exit 1
fi

mkdir -p "$output_dir"

git_commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
generated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat >"$output_dir/release-evidence.md" <<EOF
# yoyoosun Release Evidence

## 基本信息

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | $release_version |
| releaseDate | $generated_at |
| environment | 待填写 |
| operatorRole | 待填写 |
| gitCommit | $git_commit |
| serverImage | 待填写 |
| serverImageDigest | 待填写 |
| webImage | 待填写 |
| webImageDigest | 待填写 |
| migrationBefore | 待填写 |
| migrationAfter | 待填写 |
| backupId | 待填写 |

## 配置指纹

| 项目 | Hash / 摘要 |
| --- | --- |
| envFingerprint | 待填写 |
| customerConfigFingerprint | 待填写 |
| menuConfigFingerprint | 待填写 |
| permissionConfigFingerprint | 待填写 |

## 执行结果

| 项目 | 结果 | Evidence |
| --- | --- | --- |
| preflight | 待填写 |  |
| backup | 待填写 | backup-evidence.md |
| migration | 待填写 | migration-status.txt |
| seed | 待填写 |  |
| import dry-run / apply | 待填写 |  |
| smoke | 待填写 | smoke-test-report.json |
| security scan | 待填写 |  |
| backup restore | 待填写 | backup-evidence.md |

## 已知限制

- 待填写

## 回滚信息

| 字段 | 值 |
| --- | --- |
| previousReleaseVersion | 待填写 |
| previousServerImage | 待填写 |
| previousWebImage | 待填写 |
| backupId | 待填写 |
| rollbackRunbook | deployments/yoyoosun/runbooks/03-rollback.md |
EOF

cat >"$output_dir/backup-evidence.md" <<EOF
# yoyoosun Backup Evidence

## 基本信息

| 字段 | 值 |
| --- | --- |
| backupId | 待填写 |
| backupTime | 待填写 |
| backupPurpose | 待填写，必须是 pre-migration 或 pre-deploy |
| environment | 待填写 |
| operatorRole | 待填写 |
| releaseVersion | $release_version |
| migrationVersion | 待填写 |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize | 待填写 |
| databaseBackupHash | 待填写 |
| attachmentSnapshot | 待填写 |
| storageLocationAlias | 待填写 |
| encryptionEnabled | 待填写 |
| retentionPolicy | 待填写 |

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus | 待填写 |
| restoreTarget | 待填写 |
| restoreMigrationVersion | 待填写 |
| smokeQueryStatus | 待填写 |
| webSmokeStatus | 待填写 |
| verifiedAt | 待填写 |
EOF

cat >"$output_dir/migration-status.txt" <<'EOF'
Migration Status: 待填写
Current Version: 待填写
Pending Files: 待填写
EOF

cat >"$output_dir/smoke-test-report.json" <<EOF
{
  "customerCode": "yoyoosun",
  "environment": "待填写",
  "releaseVersion": "$release_version",
  "generatedAt": "$generated_at",
  "operatorRole": "待填写",
  "summary": {
    "total": 0,
    "passed": 0,
    "failed": 0
  },
  "checks": [],
  "redaction": {
    "containsSecrets": false,
    "containsRawCustomerRows": false,
    "notes": "待填写"
  }
}
EOF

cat >"$output_dir/known-limitations.md" <<'EOF'
# yoyoosun Known Limitations

- 当前记录为模板草稿，发布者必须补齐本次 release 的正式能力、模拟能力、不承诺能力、风险和客户验收步骤。
EOF

cp deployments/yoyoosun/checklists/smoke-test-checklist.md "$output_dir/acceptance-checklist.md"
cp deployments/yoyoosun/evidence/releases/release-signoff-checklist-template.md "$output_dir/release-signoff-checklist.md"

echo "[collect-evidence] draft evidence: $output_dir"
