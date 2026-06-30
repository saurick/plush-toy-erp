#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REQUIRED_FILES, validateReleaseEvidenceGate } from "./release-evidence-gate.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE = "customer-config-manifest-evidence.json";

const USAGE = `Release evidence status

Usage:
  node scripts/deploy/release-evidence-status.mjs \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>

Options:
  --customer <key>       Default: yoyoosun.
  --json                 Print machine-readable JSON.
  --fail-on-not-ready    Exit non-zero unless the release evidence gate passes.
  --help                 Print this help.

This is a read-only status helper. It does not create evidence, run preflight,
build images, restore backups, run migrations, call the backend, activate a
customer config revision, run smoke checks, or execute rollback / forward-fix.`;

const STATUS_SCOPE = {
  evidenceOnly: true,
  readyMeaning:
    "release evidence gate passed for the provided evidence directory and status found no warnings",
  notProvenByThisHelper: [
    "target environment release was executed",
    "target migration was applied",
    "target smoke was run",
    "backup restore rehearsal was performed",
    "rollback or forward-fix rehearsal was performed",
    "customer config revision was activated or rolled back",
  ],
};

const SUPPORTING_ARTIFACT_FILES = [
  "migration-status-before-apply.txt",
  "command-summary.txt",
];

const TEMPLATE_COMMANDS = {
  [REQUIRED_FILES.release]:
    "cp deployments/yoyoosun/evidence/releases/release-evidence-template.md",
  [REQUIRED_FILES.rollbackPlan]:
    "cp deployments/yoyoosun/evidence/releases/rollback-forward-fix-plan-template.md",
  [REQUIRED_FILES.signoff]:
    "cp deployments/yoyoosun/evidence/releases/release-signoff-checklist-template.md",
};

const CLOSEOUT_EVIDENCE_GROUPS = [
  {
    id: "immutable-version",
    label: "不可变版本证据",
    files: [REQUIRED_FILES.release, REQUIRED_FILES.imageDigests],
    reason: "绑定 git commit、server/web image digest 和 release metadata",
  },
  {
    id: "production-preflight",
    label: "生产 preflight 脱敏报告",
    files: [REQUIRED_FILES.preflight],
    reason: "证明目标运行时 env / Compose / 低配部署边界已按脚本检查",
  },
  {
    id: "backup-restore-rehearsal",
    label: "备份恢复和 migration 演练证据",
    files: [
      REQUIRED_FILES.backup,
      REQUIRED_FILES.backupRestore,
      "migration-status-before-apply.txt",
      REQUIRED_FILES.migration,
      "command-summary.txt",
    ],
    reason: "证明 migration 前备份、隔离恢复、pre/post migration 状态和命令摘要来自同一批次",
  },
  {
    id: "target-smoke",
    label: "目标环境 smoke",
    files: [REQUIRED_FILES.smoke],
    reason: "证明目标 endpoint / backend endpoint 的检查项非空且全部通过",
  },
  {
    id: "rollback-forward-fix",
    label: "回滚 / 前向修复计划与演练",
    files: [REQUIRED_FILES.rollbackPlan, REQUIRED_FILES.rollbackRehearsal],
    reason: "证明处置路径已定义且演练 post-smoke 与本次 evidence 目录绑定",
  },
  {
    id: "release-signoff",
    label: "发布签收",
    files: [REQUIRED_FILES.signoff],
    reason: "证明 releaseVersion / environment / backupId 与签收结论绑定",
  },
];

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv) {
  const options = {
    customer: DEFAULT_CUSTOMER,
    json: false,
    failOnNotReady: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--fail-on-not-ready") {
      options.failOnNotReady = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue = equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    switch (key) {
      case "evidence-dir":
        options.evidenceDir = value;
        break;
      case "customer":
        options.customer = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function collectFileStatus(absoluteDir) {
  return [...Object.values(REQUIRED_FILES), ...SUPPORTING_ARTIFACT_FILES].map((relativePath) => {
    const absolutePath = path.join(absoluteDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      return {
        path: relativePath,
        exists: false,
        bytes: 0,
      };
    }
    const stat = fs.statSync(absolutePath);
    return {
      path: relativePath,
      exists: true,
      bytes: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  });
}

function readCustomerConfigManifestEvidence(absoluteDir) {
  const absolutePath = path.join(absoluteDir, CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE,
      exists: false,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    return {
      path: CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE,
      exists: true,
      revision: String(parsed.revision || "").trim() || undefined,
      manifestSha256: String(parsed.manifestSha256 || "").trim() || undefined,
    };
  } catch (error) {
    return {
      path: CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE,
      exists: true,
      parseError: error.message,
    };
  }
}

function readCustomerConfigSmokeEvidence(absoluteDir) {
  const absolutePath = path.join(absoluteDir, REQUIRED_FILES.smoke);
  if (!fs.existsSync(absolutePath)) {
    return {
      path: REQUIRED_FILES.smoke,
      exists: false,
      hasCustomerConfigCheck: false,
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
    const checks = Array.isArray(parsed.checks) ? parsed.checks : [];
    const check = checks.find(
      (item) =>
        item?.name === "customer-config-effective-session" ||
        item?.target === "jsonrpc:customer_config.get_effective_session",
    );
    if (!check) {
      return {
        path: REQUIRED_FILES.smoke,
        exists: true,
        hasCustomerConfigCheck: false,
      };
    }
    return {
      path: REQUIRED_FILES.smoke,
      exists: true,
      hasCustomerConfigCheck: true,
      expectedRevision: String(check.expectedRevision || "").trim() || undefined,
      target: check.target,
    };
  } catch (error) {
    return {
      path: REQUIRED_FILES.smoke,
      exists: true,
      hasCustomerConfigCheck: false,
      parseError: error.message,
    };
  }
}

function buildSmokeCommand({ evidenceDir, customerConfigRevision = "" }) {
  const customerConfigSmokeArgs = customerConfigRevision
    ? ` --backend-url <backend-endpoint> --customer-config-revision ${customerConfigRevision} --admin-token-env CUSTOMER_CONFIG_ADMIN_TOKEN`
    : "";
  return `bash deployments/yoyoosun/scripts/run-smoke.sh --release-version <release-version> --environment <environment> --endpoint <public-endpoint>${customerConfigSmokeArgs} --report ${evidenceDir}/smoke-test-report.json`;
}

function buildRollbackRehearsalCommand({ evidenceDir, customerConfigRevision = "" }) {
  const customerConfigArg = customerConfigRevision
    ? ` --customer-config-revision ${customerConfigRevision}`
    : "";
  return `node scripts/deploy/rollback-rehearsal-report.mjs --environment <environment> --release-version <release-version> --rehearsal-type rollback-forward-fix --trigger-scenario "<trigger>" --rollback-target-release <previous-release> --step "identify rollback target=pass" --post-smoke-report smoke-test-report.json${customerConfigArg} --evidence-dir ${evidenceDir}`;
}

function buildNextCommands({
  evidenceDir,
  missingFiles,
  status,
  customerConfigManifestEvidence,
  customerConfigSmokeEvidence,
}) {
  if (status === "missing") {
    return [
      `bash deployments/yoyoosun/scripts/collect-evidence.sh --release-version <release-version> --output ${evidenceDir || "deployments/yoyoosun/evidence/releases/<YYYY-MM-DD>"}`,
    ];
  }

  const commands = [];
  const missing = new Set(missingFiles);
  if (
    (customerConfigManifestEvidence?.exists &&
      (customerConfigManifestEvidence.parseError || !customerConfigManifestEvidence.revision)) ||
    (customerConfigSmokeEvidence?.hasCustomerConfigCheck &&
      (!customerConfigManifestEvidence?.exists ||
        customerConfigManifestEvidence.revision !== customerConfigSmokeEvidence.expectedRevision))
  ) {
    commands.push(
      `node scripts/deploy/customer-config-manifest-evidence.mjs --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json --evidence-dir ${evidenceDir} --reviewer <reviewer-name>`,
    );
  }
  if (missing.has(REQUIRED_FILES.preflight)) {
    commands.push(
      `bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env --out ${evidenceDir}/production-preflight-report.txt`,
    );
  }
  if (missing.has(REQUIRED_FILES.imageDigests)) {
    commands.push(
      `node scripts/deploy/immutable-version-evidence.mjs --evidence-dir ${evidenceDir} --release-version <release-version> --environment <environment> --operator-role <operator-role> --git-commit <git-commit> --server-image <server-image-ref> --server-digest sha256:<64-hex> --web-image <web-image-ref> --web-digest sha256:<64-hex> --migration-before <migration-before> --migration-after <migration-after> --backup-id <backup-id>`,
    );
  }
  if (
    missing.has(REQUIRED_FILES.backup) ||
    missing.has(REQUIRED_FILES.backupRestore) ||
    missing.has("migration-status-before-apply.txt") ||
    missing.has("command-summary.txt") ||
    missing.has(REQUIRED_FILES.migration)
  ) {
    commands.push(
      `SOURCE_POSTGRES_DSN="<source-dsn>" bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh --release-version <release-version> --backup-purpose pre-migration --out output/customers/yoyoosun/backup-restore-rehearsal --evidence-dir ${evidenceDir}`,
    );
  }
  if (missing.has(REQUIRED_FILES.smoke)) {
    commands.push(
      buildSmokeCommand({
        evidenceDir,
        customerConfigRevision: customerConfigManifestEvidence?.revision,
      }),
    );
  } else if (
    customerConfigManifestEvidence?.exists &&
    customerConfigManifestEvidence.revision &&
    customerConfigSmokeEvidence?.exists &&
    !customerConfigSmokeEvidence.hasCustomerConfigCheck
  ) {
    commands.push(
      buildSmokeCommand({
        evidenceDir,
        customerConfigRevision: customerConfigManifestEvidence.revision,
      }),
    );
  }
  for (const [fileName, commandPrefix] of Object.entries(TEMPLATE_COMMANDS)) {
    if (missing.has(fileName)) {
      commands.push(`${commandPrefix} ${evidenceDir}/${fileName}`);
    }
  }
  if (missing.has(REQUIRED_FILES.rollbackRehearsal)) {
    commands.push(
      `node scripts/deploy/rollback-rehearsal-report.mjs --environment <environment> --release-version <release-version> --rehearsal-type rollback-forward-fix --trigger-scenario "<trigger>" --rollback-target-release <previous-release> --step "identify rollback target=pass" --post-smoke-report smoke-test-report.json --evidence-dir ${evidenceDir}`,
    );
  }
  commands.push(
    `node scripts/deploy/release-evidence-gate.mjs --evidence-dir ${evidenceDir}`,
  );
  return commands;
}

function buildCloseoutNextActions({
  evidenceDir,
  closeoutChecklist,
  customerConfigManifestEvidence,
  customerConfigSmokeEvidence,
}) {
  const customerConfigRevision = customerConfigManifestEvidence?.revision || "";
  return closeoutChecklist
    .filter((item) => item.status !== "gate-verified")
    .map((item) => {
      const action = {
        id: item.id,
        label: item.label,
        status: item.status,
        files: item.files,
        reason: item.reason,
        commands: [],
        manualChecks: [],
      };

      switch (item.id) {
        case "immutable-version":
          action.commands.push(
            `node scripts/deploy/immutable-version-evidence.mjs --evidence-dir ${evidenceDir} --release-version <release-version> --environment <environment> --operator-role <operator-role> --git-commit <git-commit> --server-image <server-image-ref> --server-digest sha256:<64-hex> --web-image <web-image-ref> --web-digest sha256:<64-hex> --migration-before <migration-before> --migration-after <migration-after> --backup-id <backup-id>`,
          );
          action.manualChecks.push(
            "Use releaseVersion, environment, gitCommit, image digests, migrationBefore, migrationAfter, and backupId from the same release batch; do not invent image digests or migration versions.",
          );
          break;
        case "production-preflight":
          action.commands.push(
            `bash scripts/deploy/production-preflight.sh --env-file server/deploy/compose/prod/.env --out ${evidenceDir}/production-preflight-report.txt`,
          );
          action.manualChecks.push(
            "Use the real runtime .env; do not use .env.example or example-mode output.",
          );
          break;
        case "backup-restore-rehearsal":
          action.commands.push(
            `SOURCE_POSTGRES_DSN="<source-dsn>" bash deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh --release-version <release-version> --backup-purpose pre-migration --out output/customers/yoyoosun/backup-restore-rehearsal --evidence-dir ${evidenceDir}`,
          );
          action.manualChecks.push(
            "Bind backupId, migrationBefore, migrationAfter, backup hash, restore target, command summary, and smoke query evidence to the same release batch.",
          );
          break;
        case "target-smoke":
          action.commands.push(
            buildSmokeCommand({
              evidenceDir,
              customerConfigRevision,
            }),
          );
          action.manualChecks.push(
            "Run against the target public endpoint and backend endpoint after deployment/migration; do not hand-edit a pass report.",
          );
          break;
        case "rollback-forward-fix":
          action.commands.push(
            buildRollbackRehearsalCommand({
              evidenceDir,
              customerConfigRevision,
            }),
          );
          action.manualChecks.push(
            "Fill rollback-forward-fix-plan.md with rollback decision, trigger, target release, owner, and post-action verification scope.",
          );
          break;
        case "release-signoff":
          action.manualChecks.push(
            "Fill release-signoff-checklist.md only after preflight, backup/restore, migration, smoke, rollback/forward-fix rehearsal, and known limitations are reviewed.",
          );
          break;
        case "customer-config-effective-session":
          if (
            !customerConfigManifestEvidence?.exists ||
            customerConfigManifestEvidence.parseError ||
            !customerConfigManifestEvidence.revision
          ) {
            action.commands.push(
              `node scripts/deploy/customer-config-manifest-evidence.mjs --manifest output/customers/yoyoosun/customer-config-runtime-manifest.json --evidence-dir ${evidenceDir} --reviewer <reviewer-name>`,
            );
          }
          if (
            customerConfigManifestEvidence?.revision &&
            (!customerConfigSmokeEvidence?.hasCustomerConfigCheck ||
              customerConfigSmokeEvidence.expectedRevision !== customerConfigManifestEvidence.revision)
          ) {
            action.commands.push(
              buildSmokeCommand({
                evidenceDir,
                customerConfigRevision: customerConfigManifestEvidence.revision,
              }),
            );
            action.commands.push(
              buildRollbackRehearsalCommand({
                evidenceDir,
                customerConfigRevision: customerConfigManifestEvidence.revision,
              }),
            );
          }
          action.manualChecks.push(
            "Confirm target smoke and rollback rehearsal both bind customer-config-effective-session to the same manifest revision without storing token or response body.",
          );
          break;
        default:
          action.manualChecks.push("Review the listed files and release evidence gate errors for this group.");
          break;
      }

      return action;
    });
}

function buildCloseoutChecklist({
  files,
  gate,
  warnings,
  customerConfigManifestEvidence,
  customerConfigSmokeEvidence,
}) {
  const existingFiles = new Map(files.map((file) => [file.path, file.exists]));
  const baseStatus = (requiredFiles) => {
    const missing = requiredFiles.filter((file) => !existingFiles.get(file));
    if (missing.length > 0) {
      return {
        status: "missing",
        missingFiles: missing,
      };
    }
    if (!gate.passed) {
      return {
        status: "present-unverified",
        missingFiles: [],
      };
    }
    if (warnings.length > 0) {
      return {
        status: "attention",
        missingFiles: [],
      };
    }
    return {
      status: "gate-verified",
      missingFiles: [],
    };
  };

  const checklist = CLOSEOUT_EVIDENCE_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    files: group.files,
    reason: group.reason,
    ...baseStatus(group.files),
  }));

  const customerConfigRequired =
    customerConfigManifestEvidence?.exists || customerConfigSmokeEvidence?.hasCustomerConfigCheck;
  if (customerConfigRequired) {
    const item = {
      id: "customer-config-effective-session",
      label: "客户配置 active revision 读回",
      files: [CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE, REQUIRED_FILES.smoke, REQUIRED_FILES.rollbackRehearsal],
      reason:
        "绑定 runtime manifest fingerprint、目标 smoke get_effective_session 和 rollback rehearsal post-check",
      ...baseStatus([REQUIRED_FILES.smoke, REQUIRED_FILES.rollbackRehearsal]),
    };
    if (!customerConfigManifestEvidence.exists) {
      item.status = "missing";
      item.missingFiles = [CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE, ...item.missingFiles];
    } else if (customerConfigManifestEvidence.parseError || !customerConfigManifestEvidence.revision) {
      item.status = "attention";
    } else if (
      customerConfigSmokeEvidence.hasCustomerConfigCheck &&
      customerConfigSmokeEvidence.expectedRevision &&
      customerConfigManifestEvidence.revision !== customerConfigSmokeEvidence.expectedRevision
    ) {
      item.status = "attention";
    }
    checklist.push(item);
  }

  return checklist;
}

function buildCloseoutSummary(checklist) {
  const summary = {
    total: checklist.length,
    missing: 0,
    presentUnverified: 0,
    attention: 0,
    gateVerified: 0,
  };
  for (const item of checklist) {
    if (item.status === "missing") {
      summary.missing += 1;
    } else if (item.status === "present-unverified") {
      summary.presentUnverified += 1;
    } else if (item.status === "attention") {
      summary.attention += 1;
    } else if (item.status === "gate-verified") {
      summary.gateVerified += 1;
    }
  }
  const blockers = summary.missing + summary.presentUnverified + summary.attention;
  return {
    ...summary,
    blockers,
    ready: summary.total > 0 && blockers === 0 && summary.gateVerified === summary.total,
  };
}

function messageMatchesGroup(message, group) {
  return group.files.some((file) => message.includes(file));
}

function buildCloseoutGateSummary({ closeoutChecklist, gate, warnings }) {
  return closeoutChecklist.map((item) => {
    const gateErrors = gate.errors.filter((error) =>
      messageMatchesGroup(error, item),
    );
    const itemWarnings = warnings.filter((warning) =>
      messageMatchesGroup(warning, item),
    );
    return {
      id: item.id,
      label: item.label,
      status: item.status,
      errorCount: gateErrors.length,
      warningCount: itemWarnings.length,
      sampleErrors: gateErrors.slice(0, 5),
      sampleWarnings: itemWarnings.slice(0, 3),
    };
  });
}

export function buildReleaseEvidenceStatus({
  evidenceDir,
  customer = DEFAULT_CUSTOMER,
  repoRoot = process.cwd(),
} = {}) {
  const errors = [];
  const warnings = [];
  if (!evidenceDir) {
    throw new CliError("Missing required --evidence-dir", 2);
  }
  const absoluteDir = path.resolve(repoRoot, evidenceDir);
  const directoryExists = fs.existsSync(absoluteDir) && fs.statSync(absoluteDir).isDirectory();
  const files = directoryExists ? collectFileStatus(absoluteDir) : collectFileStatus(absoluteDir);
  const missingFiles = files.filter((file) => !file.exists).map((file) => file.path);
  const customerConfigManifestEvidence = directoryExists
    ? readCustomerConfigManifestEvidence(absoluteDir)
    : {
        path: CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE,
        exists: false,
      };
  const customerConfigSmokeEvidence = directoryExists
    ? readCustomerConfigSmokeEvidence(absoluteDir)
    : {
        path: REQUIRED_FILES.smoke,
        exists: false,
        hasCustomerConfigCheck: false,
      };
  if (customerConfigManifestEvidence.exists) {
    if (customerConfigManifestEvidence.parseError) {
      warnings.push(
        `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} is not valid JSON: ${customerConfigManifestEvidence.parseError}`,
      );
    } else if (!customerConfigManifestEvidence.revision) {
      warnings.push(
        `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} is missing revision; customer config smoke command cannot be bound to an expected active revision`,
      );
    }
  }
  if (customerConfigSmokeEvidence.parseError) {
    warnings.push(
      `${REQUIRED_FILES.smoke} is not valid JSON: ${customerConfigSmokeEvidence.parseError}`,
    );
  } else if (customerConfigSmokeEvidence.hasCustomerConfigCheck) {
    if (!customerConfigSmokeEvidence.expectedRevision) {
      warnings.push(
        `${REQUIRED_FILES.smoke} customer-config-effective-session is missing expectedRevision; manifest evidence cannot be cross-checked`,
      );
    } else if (!customerConfigManifestEvidence.exists) {
      warnings.push(
        `${REQUIRED_FILES.smoke} contains customer-config-effective-session for ${customerConfigSmokeEvidence.expectedRevision}, but ${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} is missing`,
      );
    } else if (
      customerConfigManifestEvidence.revision &&
      customerConfigManifestEvidence.revision !== customerConfigSmokeEvidence.expectedRevision
    ) {
      warnings.push(
        `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} revision ${customerConfigManifestEvidence.revision} does not match ${REQUIRED_FILES.smoke} expectedRevision ${customerConfigSmokeEvidence.expectedRevision}`,
      );
    }
  } else if (customerConfigManifestEvidence.exists && customerConfigManifestEvidence.revision) {
    warnings.push(
      `${CUSTOMER_CONFIG_MANIFEST_EVIDENCE_FILE} exists for ${customerConfigManifestEvidence.revision}, but ${REQUIRED_FILES.smoke} does not contain customer-config-effective-session; rerun target smoke with --customer-config-revision ${customerConfigManifestEvidence.revision}`,
    );
  }

  let gate = {
    passed: false,
    errorCount: 0,
    errors: [],
  };
  if (directoryExists) {
    try {
      validateReleaseEvidenceGate({ evidenceDir, customer, repoRoot });
      gate = {
        passed: true,
        errorCount: 0,
        errors: [],
      };
    } catch (error) {
      const gateErrors = Array.isArray(error.errors)
        ? error.errors
        : String(error.message || "").split("\n").filter(Boolean);
      gate = {
        passed: false,
        errorCount: gateErrors.length,
        errors: gateErrors,
      };
    }
  } else {
    errors.push(`evidence dir not found: ${evidenceDir}`);
  }

  const status = directoryExists
    ? missingFiles.length > 0
      ? "incomplete"
      : gate.passed
        ? warnings.length > 0
          ? "attention"
          : "ready"
        : "draft"
    : "missing";

  const closeoutChecklist = buildCloseoutChecklist({
    files,
    gate,
    warnings,
    customerConfigManifestEvidence,
    customerConfigSmokeEvidence,
  });
  const closeoutSummary = buildCloseoutSummary(closeoutChecklist);
  const closeoutGateSummary = buildCloseoutGateSummary({
    closeoutChecklist,
    gate,
    warnings,
  });
  const closeoutNextActions = buildCloseoutNextActions({
    evidenceDir,
    closeoutChecklist,
    customerConfigManifestEvidence,
    customerConfigSmokeEvidence,
  });

  return {
    customer,
    evidenceDir,
    absoluteDir,
    status,
    ready: status === "ready",
    gateReady: gate.passed,
    directoryExists,
    requiredFileCount: files.length,
    presentFileCount: files.length - missingFiles.length,
    missingFiles,
    files,
    gate,
    errors,
    warnings,
    nextCommands: buildNextCommands({
      evidenceDir,
      missingFiles,
      status,
      customerConfigManifestEvidence,
      customerConfigSmokeEvidence,
    }),
    readOnly: true,
    scope: STATUS_SCOPE,
    customerConfigManifestEvidence,
    customerConfigSmokeEvidence,
    closeoutChecklist,
    closeoutSummary,
    closeoutGateSummary,
    closeoutNextActions,
  };
}

function formatText(status) {
  const lines = [
    `release evidence status: ${status.status}`,
    `customer: ${status.customer}`,
    `evidenceDir: ${status.evidenceDir}`,
    `files: ${status.presentFileCount}/${status.requiredFileCount}`,
    `gate: ${status.gate.passed ? "passed" : `failed (${status.gate.errorCount})`}`,
    `closeout: ${status.closeoutSummary.gateVerified}/${status.closeoutSummary.total} gate-verified; blockers=${status.closeoutSummary.blockers}`,
    `ready means: ${status.scope.readyMeaning}`,
    "not proven by this helper:",
  ];
  for (const item of status.scope.notProvenByThisHelper) {
    lines.push(`- ${item}`);
  }
  if (status.missingFiles.length > 0) {
    lines.push("missing files:");
    for (const file of status.missingFiles) {
      lines.push(`- ${file}`);
    }
  }
  if (status.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of status.warnings) {
      lines.push(`- ${warning}`);
    }
  }
  if (status.gate.errors.length > 0) {
    lines.push("gate errors:");
    for (const error of status.gate.errors.slice(0, 12)) {
      lines.push(`- ${error}`);
    }
    if (status.gate.errors.length > 12) {
      lines.push(`- ... ${status.gate.errors.length - 12} more`);
    }
  }
  if (status.closeoutChecklist.length > 0) {
    lines.push("closeout evidence checklist:");
    for (const item of status.closeoutChecklist) {
      const missing = item.missingFiles.length > 0 ? `; missing: ${item.missingFiles.join(", ")}` : "";
      lines.push(`- ${item.id}: ${item.status}${missing}`);
    }
  }
  if (status.closeoutGateSummary.length > 0) {
    lines.push("closeout gate summary:");
    for (const item of status.closeoutGateSummary) {
      lines.push(`- ${item.id}: errors=${item.errorCount}, warnings=${item.warningCount}`);
      for (const error of item.sampleErrors.slice(0, 2)) {
        lines.push(`  error: ${error}`);
      }
      for (const warning of item.sampleWarnings.slice(0, 1)) {
        lines.push(`  warning: ${warning}`);
      }
    }
  }
  if (status.closeoutNextActions.length > 0) {
    lines.push("closeout next actions:");
    for (const action of status.closeoutNextActions) {
      lines.push(`- ${action.id}: ${action.status}`);
      for (const command of action.commands) {
        lines.push(`  command: ${command}`);
      }
      for (const manualCheck of action.manualChecks) {
        lines.push(`  check: ${manualCheck}`);
      }
    }
  }
  lines.push("next commands:");
  for (const command of status.nextCommands) {
    lines.push(`- ${command}`);
  }
  return `${lines.join("\n")}\n`;
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const status = buildReleaseEvidenceStatus(options);
  if (options.json) {
    console.log(JSON.stringify(status, null, 2));
  } else {
    process.stdout.write(formatText(status));
  }
  return options.failOnNotReady && !status.ready ? 1 : 0;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exitCode = error.exitCode;
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
}

export { CliError, USAGE };
