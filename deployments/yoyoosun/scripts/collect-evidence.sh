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
| preflight | 待填写 | production-preflight-report.txt |
| backup | 待填写 | backup-evidence.md |
| migration | 待填写 | migration-status.txt |
| seed | 待填写 |  |
| import dry-run / apply | 待填写 |  |
| smoke | 待填写 | smoke-test-report.json |
| security scan | 待填写 |  |
| backup restore | 待填写 | backup-restore-report.json |
| rollback rehearsal | 待填写 | rollback-rehearsal-report.json |

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

cat >"$output_dir/production-preflight-report.txt" <<EOF
[production-preflight] 待填写

请在真实运行时 .env 准备后执行：

bash scripts/deploy/production-preflight.sh \\
  --env-file server/deploy/compose/prod/.env \\
  --out "$output_dir/production-preflight-report.txt"

该文件必须来自非 --example 模式；不要写入真实 .env、secret、token、完整 DSN 或客户 raw data。
EOF

cat >"$output_dir/image-digests.txt" <<'EOF'
serverImage=待填写
serverImageDigest=待填写，建议用 scripts/deploy/image-digests-evidence.mjs 生成，必须等于 release-evidence.md serverImageDigest
webImage=待填写
webImageDigest=待填写，建议用 scripts/deploy/image-digests-evidence.mjs 生成，必须等于 release-evidence.md webImageDigest
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

cat >"$output_dir/migration-status-before-apply.txt" <<'EOF'
Migration Status: 待填写，恢复 dump 后、执行 atlas migrate apply 前记录
Current Version: 待填写，必须等于 release-evidence.md migrationBefore
Pending Files: 待填写，允许大于 0，但必须可解释为待 apply migration
EOF

cat >"$output_dir/command-summary.txt" <<'EOF'
backupId=待填写
releaseVersion=待填写
sourceAlias=待填写，必须脱敏，例如 env:SOURCE_POSTGRES_DSN
restoreTarget=待填写，必须脱敏，例如 temp-postgres-container:postgres:18:removed-after-run
steps=待填写，记录 pg_dump -> restore -> pre-apply atlas status -> atlas migrate apply -> post-apply atlas status -> smoke 的脱敏命令摘要，不保存完整 DSN、secret、dump 内容或客户 raw rows
EOF

cat >"$output_dir/backup-restore-report.json" <<EOF
{
  "customerCode": "yoyoosun",
  "environment": "待填写",
  "releaseVersion": "$release_version",
  "backupId": "待填写",
  "verifiedAt": "待填写",
  "sourceAlias": "待填写",
  "restoreTarget": "待填写",
  "artifacts": {
    "backupEvidence": "backup-evidence.md",
    "preMigrationStatus": "migration-status-before-apply.txt",
    "migrationStatus": "migration-status.txt",
    "commandSummary": "command-summary.txt"
  },
  "backup": {
    "databaseBackupSize": 0,
    "databaseBackupHash": "待填写",
    "storageLocationAlias": "待填写",
    "migrationVersion": "待填写，必须等于 release-evidence.md migrationBefore"
  },
  "restore": {
    "restoreTestStatus": "待填写",
    "migrationBeforeApply": "待填写，必须等于 release-evidence.md migrationBefore",
    "restoreMigrationVersion": "待填写",
    "pendingFiles": "待填写"
  },
  "smoke": {
    "smokeQueryStatus": "待填写",
    "publicTableCount": 0,
    "adminUserCount": "待填写",
    "backendHealthStatus": "待填写",
    "backendReadyStatus": "待填写",
    "webSmokeStatus": "待填写"
  },
  "redaction": {
    "containsSecrets": false,
    "containsRawCustomerRows": false,
    "containsDumpContent": false,
    "containsFullDsn": false
  },
  "summary": {
    "backupCreated": false,
    "restoreCompleted": false,
    "migrationStatus": "待填写",
    "smokeQueryStatus": "待填写"
  }
}
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
cp deployments/yoyoosun/evidence/releases/rollback-forward-fix-plan-template.md "$output_dir/rollback-forward-fix-plan.md"

cat >"$output_dir/release-signoff-checklist.md" <<EOF
# yoyoosun Release Sign-off / 发布签收检查模板

## 结论字段

| 字段 | 值 |
| --- | --- |
| releaseVersion | $release_version |
| environment | 待填写，必须与 release-evidence.md 一致 |
| backupId | 待填写，必须与 release-evidence.md 和 backup-evidence.md 一致 |
| releaseConclusion | 待填写，可选 customer-trial-approved / internal-only / rollback-or-forward-fix |
| deploymentOperator | 待填写 |
| evidenceReviewer | 待填写 |
| customerOrBusinessConfirmation | 待填写；内部验证可写 not-required-internal-only，客户试用必须记录确认渠道或受控记录编号 |

## 必选确认

- [ ] pre-migration backup evidence verified
- [ ] known limitations reviewed
- [ ] migration status recorded and reviewed
- [ ] smoke report reviewed
- [ ] customer-visible scope reviewed

## 边界

- 本模板只记录发布 evidence 复核结论，不保存真实密码、token、备份文件、完整 DSN、客户 raw rows 或未脱敏截图。
- customer-trial-approved 只表示本次 release 可继续客户试用，不等于客户最终验收、真实导入完成或完整业务交付。
- internal-only 表示只能内部验证，不能对客户开放。
- rollback-or-forward-fix 表示当前 release 不可继续使用，必须回滚或 forward-fix。
EOF

cat >"$output_dir/rollback-rehearsal-report.json" <<EOF
{
  "customerCode": "yoyoosun",
  "environment": "待填写",
  "releaseVersion": "$release_version",
  "rehearsedAt": "待填写",
  "rehearsalType": "待填写，可选 rollback / forward-fix / rollback-forward-fix",
  "triggerScenario": "待填写",
  "rollbackTargetRelease": "待填写",
  "rollbackRunbook": "deployments/yoyoosun/runbooks/03-rollback.md",
  "steps": [],
  "postCheck": {
    "smokeStatus": "待填写",
    "evidenceReviewStatus": "待填写"
  },
  "summary": {
    "rehearsalCompleted": false,
    "rollbackPathStatus": "待填写"
  },
  "redaction": {
    "containsSecrets": false,
    "containsRawCustomerRows": false,
    "containsFullDsn": false
  }
}
EOF

echo "[collect-evidence] draft evidence: $output_dir"
