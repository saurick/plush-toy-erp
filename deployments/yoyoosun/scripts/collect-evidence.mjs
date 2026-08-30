#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

function printHelp(stream = process.stdout) {
  stream.write([
    "用法:",
    "  bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <version> --output deployments/yoyoosun/evidence/releases/<date>",
    "",
    "作用:",
    "  生成 release evidence 草稿目录。该脚本不采集 secret、不复制 .env、不复制备份文件。",
    "",
  ].join("\n"));
}

function parseArgs(argv) {
  const options = { releaseVersion: "", outputDir: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--release-version") {
      options.releaseVersion = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "--output") {
      options.outputDir = argv[index + 1] ?? "";
      index += 1;
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    } else {
      throw new Error(`不支持的参数: ${arg}`);
    }
  }
  return options;
}

function writeFile(outputDir, name, content) {
  fs.writeFileSync(path.join(outputDir, name), content.endsWith("\n") ? content : `${content}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`[collect-evidence] ${error.message}\n`);
  printHelp(process.stderr);
  process.exit(1);
}

if (options.help) {
  printHelp();
  process.exit(0);
}
if (!options.releaseVersion || !options.outputDir) {
  printHelp(process.stderr);
  process.exit(1);
}

const outputDir = path.resolve(process.cwd(), options.outputDir);
fs.mkdirSync(outputDir, { recursive: true, mode: 0o700 });

const gitResult = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
const gitCommit = gitResult.status === 0 ? gitResult.stdout.trim() : "unknown";
const generatedAt = new Date().toISOString().replace(/\.\d{3}Z$/u, "Z");
const releaseVersion = options.releaseVersion;

writeFile(outputDir, "release-evidence.md", `# yoyoosun Release Evidence

## 基本信息

| 字段 | 值 |
| --- | --- |
| customerCode | yoyoosun |
| releaseVersion | ${releaseVersion} |
| releaseDate | ${generatedAt} |
| environment | 待填写 |
| operatorRole | 待填写 |
| gitCommit | ${gitCommit} |
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
| credential rotation | 待填写 | credential-rotation-report.json |
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
| rollbackRunbook | deployments/yoyoosun/runbooks/03-rollback.md |`);

writeFile(outputDir, "production-preflight-report.txt", `[production-preflight] 待填写

请在真实运行时 .env 准备后执行：

bash scripts/deploy/production-preflight.sh \\
  --env-file server/deploy/compose/prod/.env \\
  --runtime \\
  --out "${outputDir}/production-preflight-report.txt"

该文件必须在目标 Compose 服务启动后由 --runtime 模式生成，并记录运行态 PDF warmup、Chromium exact pin 和 health / ready 通过；不要写入真实 .env、secret、token、完整 DSN 或客户 raw data。`);

writeFile(outputDir, "image-digests.txt", `serverImage=待填写
serverImageDigest=待填写，建议用 scripts/deploy/image-digests-evidence.mjs 生成，必须等于 release-evidence.md serverImageDigest
webImage=待填写
webImageDigest=待填写，建议用 scripts/deploy/image-digests-evidence.mjs 生成，必须等于 release-evidence.md webImageDigest`);

writeFile(outputDir, "backup-evidence.md", `# yoyoosun Backup Evidence

## 基本信息

| 字段 | 值 |
| --- | --- |
| backupId | 待填写 |
| backupTime | 待填写 |
| backupPurpose | 待填写，必须是 pre-migration 或 pre-deploy |
| environment | 待填写 |
| operatorRole | 待填写 |
| releaseVersion | ${releaseVersion} |
| migrationVersion | 待填写 |

## 备份摘要

| 项目 | 值 |
| --- | --- |
| databaseBackupSize | 待填写 |
| databaseBackupHash | 待填写 |
| attachmentSnapshot | included-in-database-backup |
| storageLocationAlias | 待填写 |
| encryptionEnabled | 待填写 |
| retentionPolicy | 待填写 |

## 恢复验证

| 项目 | 值 |
| --- | --- |
| restoreTestStatus | 待填写 |
| restoreTarget | 待填写 |
| restoreMigrationVersion | 待填写 |
| populatedUpgradeAuditStatus | 待填写，跨越 20260714055504 时必须为 passed |
| customerConfigCutoverAuditStatus | 待填写，跨越 20260714055825 时必须为 passed |
| smokeQueryStatus | 待填写 |
| webSmokeStatus | 待填写 |
| verifiedAt | 待填写 |`);

writeFile(outputDir, "migration-status.txt", `Migration Status: 待填写
Current Version: 待填写
Pending Files: 待填写`);
writeFile(outputDir, "migration-status-before-apply.txt", `Migration Status: 待填写，恢复 dump 后、执行 atlas migrate apply 前记录
Current Version: 待填写，必须等于 release-evidence.md migrationBefore
Pending Files: 待填写，允许大于 0，但必须可解释为待 apply migration`);
writeFile(outputDir, "command-summary.txt", `backupId=待填写
releaseVersion=待填写
sourceAlias=待填写，必须脱敏，例如 env:SOURCE_POSTGRES_DSN
restoreTarget=待填写，必须脱敏，例如 temp-postgres-container:postgres:18:removed-after-run
populatedUpgradeAuditStatus=待填写，跨越 20260714055504 时必须为 passed
customerConfigCutoverAuditStatus=待填写，跨越 20260714055825 时必须为 passed
steps=待填写，记录 pg_dump -> restore -> pre-apply atlas status -> populated upgrade read-only audit -> customer config cutover read-only audit -> atlas migrate apply -> post-apply atlas status -> smoke 的脱敏命令摘要，不保存完整 DSN、secret、dump 内容或客户 raw rows`);

const backupRestoreReport = {
  customerCode: "yoyoosun",
  environment: "待填写",
  releaseVersion,
  backupId: "待填写",
  verifiedAt: "待填写",
  sourceAlias: "待填写",
  restoreTarget: "待填写",
  artifacts: {
    backupEvidence: "backup-evidence.md",
    preMigrationStatus: "migration-status-before-apply.txt",
    migrationStatus: "migration-status.txt",
    commandSummary: "command-summary.txt",
  },
  backup: {
    databaseBackupSize: 0,
    databaseBackupHash: "待填写",
    storageLocationAlias: "待填写",
    migrationVersion: "待填写，必须等于 release-evidence.md migrationBefore",
  },
  restore: {
    restoreTestStatus: "待填写",
    migrationBeforeApply: "待填写，必须等于 release-evidence.md migrationBefore",
    restoreMigrationVersion: "待填写",
    pendingFiles: "待填写",
    populatedUpgradeAuditStatus: "待填写，跨越 20260714055504 时必须为 passed",
    customerConfigCutoverAuditStatus: "待填写，跨越 20260714055825 时必须为 passed",
  },
  smoke: {
    smokeQueryStatus: "待填写",
    publicTableCount: 0,
    adminUserCount: "待填写",
    backendHealthStatus: "待填写",
    backendReadyStatus: "待填写",
    webSmokeStatus: "待填写",
  },
  redaction: {
    containsSecrets: false,
    containsRawCustomerRows: false,
    containsDumpContent: false,
    containsFullDsn: false,
  },
  summary: {
    backupCreated: false,
    restoreCompleted: false,
    migrationStatus: "待填写",
    populatedUpgradeAuditStatus: "待填写，跨越 20260714055504 时必须为 passed",
    customerConfigCutoverAuditStatus: "待填写，跨越 20260714055825 时必须为 passed",
    smokeQueryStatus: "待填写",
  },
};
writeFile(outputDir, "backup-restore-report.json", JSON.stringify(backupRestoreReport, null, 2));

writeFile(outputDir, "smoke-test-report.json", JSON.stringify({
  customerCode: "yoyoosun",
  environment: "待填写",
  releaseVersion,
  generatedAt,
  operatorRole: "待填写",
  summary: { total: 0, passed: 0, failed: 0 },
  checks: [],
  redaction: {
    containsSecrets: false,
    containsRawCustomerRows: false,
    notes: "待填写",
  },
}, null, 2));

writeFile(outputDir, "credential-rotation-report.json", JSON.stringify({
  generatedAt,
  operationId: "待填写",
  target: "customer-trial-133",
  datasetVersion: "2026.08.15-v6",
  migrationVersion: "待填写",
  customerRevision: "待填写",
  release: gitCommit,
  adminAccounts: 0,
  accountKind: "customer-uat",
  roleAccounts: 0,
  revokedSessions: 0,
  authVersionIncremented: false,
  auditSource: "待填写",
  phoneBound: false,
  accounts: [],
  replayed: false,
}, null, 2));

writeFile(outputDir, "known-limitations.md", `# yoyoosun Known Limitations

- 当前记录为模板草稿，发布者必须补齐本次 release 的正式能力、模拟能力、不承诺能力、风险和客户验收步骤。`);

fs.copyFileSync(
  path.join(repoRoot, "deployments/yoyoosun/checklists/smoke-test-checklist.md"),
  path.join(outputDir, "acceptance-checklist.md"),
);
fs.copyFileSync(
  path.join(repoRoot, "deployments/yoyoosun/evidence/releases/rollback-forward-fix-plan-template.md"),
  path.join(outputDir, "rollback-forward-fix-plan.md"),
);

writeFile(outputDir, "release-signoff-checklist.md", `# yoyoosun Release Sign-off / 发布签收检查模板

## 结论字段

| 字段 | 值 |
| --- | --- |
| releaseVersion | ${releaseVersion} |
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
- rollback-or-forward-fix 表示当前 release 不可继续使用，必须回滚或 forward-fix。`);

writeFile(outputDir, "rollback-rehearsal-report.json", JSON.stringify({
  customerCode: "yoyoosun",
  environment: "待填写",
  releaseVersion,
  rehearsedAt: "待填写",
  rehearsalType: "待填写，可选 rollback / forward-fix / rollback-forward-fix",
  triggerScenario: "待填写",
  rollbackTargetRelease: "待填写",
  rollbackRunbook: "deployments/yoyoosun/runbooks/03-rollback.md",
  steps: [],
  postCheck: {
    smokeStatus: "待填写",
    evidenceReviewStatus: "待填写",
  },
  summary: {
    rehearsalCompleted: false,
    rollbackPathStatus: "待填写",
  },
  redaction: {
    containsSecrets: false,
    containsRawCustomerRows: false,
    containsFullDsn: false,
  },
}, null, 2));

process.stdout.write(`[collect-evidence] draft evidence: ${options.outputDir}\n`);
