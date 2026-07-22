#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleaseEvidenceStatus } from "./release-evidence-status.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const DEFAULT_ENV_FILE = "server/deploy/compose/prod/.env";
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/i;
const RELEASE_EVIDENCE_FILE = "release-evidence.md";
const IMMUTABLE_VERSION_INPUTS = [
  ["RELEASE_VERSION", "releaseVersion"],
  ["RELEASE_ENVIRONMENT", "environment"],
  ["OPERATOR_ROLE", "operatorRole"],
  ["GIT_COMMIT", "gitCommit"],
  ["SERVER_IMAGE", "serverImage"],
  ["SERVER_IMAGE_DIGEST", "serverImageDigest"],
  ["WEB_IMAGE", "webImage"],
  ["WEB_IMAGE_DIGEST", "webImageDigest"],
  ["MIGRATION_BEFORE", "migrationBefore"],
  ["MIGRATION_AFTER", "migrationAfter"],
  ["BACKUP_ID", "backupId"],
];

const CLOSEOUT_PLAN_SCOPE = {
  readOnly: true,
  evidenceOnly: true,
  readyMeaning:
    "release evidence closeout actions have explicit prerequisites and can be executed in the listed order when prerequisite checks pass",
  notProvenByThisPlan: [
    "target environment release was executed",
    "production preflight, backup restore, migration, smoke, rollback rehearsal, or sign-off was performed",
    "customer config revision was published, activated, rolled back, or read back from the target backend",
    "business data import, Workflow fact posting, inventory, shipment, finance, or quality facts were written",
  ],
};

const OPERATOR_INPUT_GUIDE = {
  RELEASE_VERSION: {
    sourceHint: "release batch id chosen for this target deployment",
    evidenceTarget: "release-evidence.md field releaseVersion",
    validation: "real non-placeholder release identifier shared by all evidence in this directory",
    secret: false,
  },
  RELEASE_ENVIRONMENT: {
    sourceHint: "approved target environment name for this release window",
    evidenceTarget: "release-evidence.md field environment",
    validation: "real non-placeholder target environment name",
    secret: false,
  },
  OPERATOR_ROLE: {
    sourceHint: "human operator role responsible for the release step",
    evidenceTarget: "release-evidence.md field operatorRole",
    validation: "real non-placeholder operator role",
    secret: false,
  },
  GIT_COMMIT: {
    sourceHint: "git commit used to build the immutable server and web images",
    evidenceTarget: "release-evidence.md field gitCommit",
    validation: "7-40 character git hash",
    secret: false,
  },
  SERVER_IMAGE: {
    sourceHint: "server image reference produced by the release build",
    evidenceTarget: "release-evidence.md field serverImage and image-digests.txt",
    validation: "pinned image reference for the same release batch",
    secret: false,
  },
  SERVER_IMAGE_DIGEST: {
    sourceHint: "server image digest from the registry or build output",
    evidenceTarget: "release-evidence.md field serverImageDigest and image-digests.txt",
    validation: "sha256:<64-hex>",
    secret: false,
  },
  WEB_IMAGE: {
    sourceHint: "web image reference produced by the release build",
    evidenceTarget: "release-evidence.md field webImage and image-digests.txt",
    validation: "pinned image reference for the same release batch",
    secret: false,
  },
  WEB_IMAGE_DIGEST: {
    sourceHint: "web image digest from the registry or build output",
    evidenceTarget: "release-evidence.md field webImageDigest and image-digests.txt",
    validation: "sha256:<64-hex>",
    secret: false,
  },
  MIGRATION_BEFORE: {
    sourceHint: "Atlas migration status captured before applying target migrations",
    evidenceTarget: "release-evidence.md field migrationBefore",
    validation: "14 digit Atlas migration version",
    secret: false,
  },
  MIGRATION_AFTER: {
    sourceHint: "Atlas migration version expected after this release is applied",
    evidenceTarget: "release-evidence.md field migrationAfter",
    validation: "14 digit Atlas migration version",
    secret: false,
  },
  BACKUP_ID: {
    sourceHint: "backup id from the same release batch backup evidence",
    evidenceTarget: "release-evidence.md field backupId and backup-evidence.md",
    validation: "real backup id reused by restore rehearsal and recovery plan evidence",
    secret: false,
  },
  SOURCE_POSTGRES_DSN: {
    sourceHint: "secure operator shell or secret manager for the source database DSN",
    evidenceTarget: "not stored; only sanitized backup restore artifacts are written",
    validation: "required only while running backup restore rehearsal",
    secret: true,
  },
  SMOKE_ENDPOINT: {
    sourceHint: "target environment public smoke endpoint",
    evidenceTarget: "smoke-test-report.json endpoint alias or sanitized target",
    validation: "http(s) URL without username or password",
    secret: false,
  },
  SMOKE_BACKEND_URL: {
    sourceHint: "target backend JSON-RPC base URL for customer config readback",
    evidenceTarget: "smoke-test-report.json backend endpoint alias",
    validation: "http(s) URL without username or password",
    secret: false,
  },
  CUSTOMER_CONFIG_ADMIN_TOKEN: {
    sourceHint: "secure operator shell or secret manager for the target admin token",
    evidenceTarget: "not stored; smoke report records only sanitized pass/fail evidence",
    validation: "required only while running target customer config readback smoke",
    secret: true,
  },
  ROLLBACK_TARGET_RELEASE: {
    sourceHint: "approved previous release or forward-fix target for rehearsal",
    evidenceTarget: "rollback-rehearsal-report.json",
    validation: "real non-placeholder rollback target release",
    secret: false,
  },
  ROLLBACK_TRIGGER_SCENARIO: {
    sourceHint: "operator reviewed rollback or forward-fix trigger scenario",
    evidenceTarget: "rollback-rehearsal-report.json",
    validation: "real non-placeholder trigger scenario",
    secret: false,
  },
  REVIEWER_NAME: {
    sourceHint: "human reviewer who approved the customer config manifest evidence",
    evidenceTarget: "customer-config-manifest-evidence.json reviewer field",
    validation: "real reviewer name or role",
    secret: false,
  },
  "prod-env-file": {
    sourceHint: "production runtime env file path on the release workstation",
    evidenceTarget: "production-preflight-report.txt",
    validation: "file exists and is not an example env file",
    secret: true,
  },
  "manual-release-signoff": {
    sourceHint: "human sign-off after evidence gate, known limitations, smoke, restore and rollback evidence are reviewed",
    evidenceTarget: "release-signoff-checklist.md",
    validation: "manual approval cannot be generated by runner",
    secret: false,
  },
};

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
    envFile: DEFAULT_ENV_FILE,
    json: false,
    failOnBlocked: false,
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
    if (token === "--fail-on-blocked") {
      options.failOnBlocked = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    switch (key) {
      case "customer":
        options.customer = value;
        break;
      case "evidence-dir":
        options.evidenceDir = value;
        break;
      case "env-file":
      case "runtime-env-file":
      case "preflight-env-file":
        options.envFile = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Release evidence closeout plan

Usage:
  node scripts/deploy/release-evidence-closeout-plan.mjs \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    [--runtime-env-file server/deploy/compose/prod/.env] \\
    [--json] [--fail-on-blocked]

Purpose:
  Read release-evidence-status closeoutNextActions and check whether each
  action has the local prerequisites needed before a human runs the command.
  This script is read-only: it does not write evidence, run preflight, restore
  backups, run migration or smoke checks, activate customer config, or sign off
  a release.`);
}

function checkEnv({ env, key, label = key, validate }) {
  const value = String(env[key] ?? "").trim();
  if (!value) {
    return {
      id: key,
      ok: false,
      kind: "env",
      message: `${label} is required`,
    };
  }
  if (validate && !validate(value)) {
    return {
      id: key,
      ok: false,
      kind: "env",
      message: `${label} is invalid`,
    };
  }
  return {
    id: key,
    ok: true,
    kind: "env",
    message: `${label} is set`,
  };
}

function isMeaningfulValue(value) {
  const text = String(value || "").trim();
  return Boolean(text) && !/待填写|placeholder|sample|example/i.test(text);
}

function findMarkdownTableValue(content, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(
    new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*([^|]+?)\\s*\\|\\s*$`, "im"),
  );
  return match ? match[1].trim() : "";
}

function readReleaseEvidenceInputs({ repoRoot, evidenceDir }) {
  const releaseEvidencePath = path.resolve(
    repoRoot,
    evidenceDir,
    RELEASE_EVIDENCE_FILE,
  );
  if (!fs.existsSync(releaseEvidencePath)) return {};
  const content = fs.readFileSync(releaseEvidencePath, "utf8");
  const inputs = {};
  for (const [envKey, field] of IMMUTABLE_VERSION_INPUTS) {
    const value = findMarkdownTableValue(content, field);
    if (isMeaningfulValue(value)) {
      inputs[envKey] = {
        value,
        source: RELEASE_EVIDENCE_FILE,
        field,
      };
    }
  }
  return inputs;
}

function checkEnvOrEvidence({ env, evidenceInputs, key, label = key, validate }) {
  const envValue = String(env[key] ?? "").trim();
  const evidenceInput = evidenceInputs[key];
  const value = envValue || evidenceInput?.value || "";
  if (!value) {
    return {
      id: key,
      ok: false,
      kind: "env",
      message: `${label} is required`,
    };
  }
  if (validate && !validate(value)) {
    return {
      id: key,
      ok: false,
      kind: envValue ? "env" : "evidence",
      source: envValue ? "env" : evidenceInput?.source,
      field: evidenceInput?.field,
      message: `${label} is invalid`,
    };
  }
  if (envValue) {
    return {
      id: key,
      ok: true,
      kind: "env",
      value,
      message: `${label} is set`,
    };
  }
  return {
    id: key,
    ok: true,
    kind: "evidence",
    source: evidenceInput.source,
    field: evidenceInput.field,
    value,
    message: `${label} is set from ${evidenceInput.source}`,
  };
}

function isHttpUrlWithoutCredentials(value) {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function checkRuntimeUrl({ env, key, label = key }) {
  return checkEnv({
    env,
    key,
    label,
    validate: isHttpUrlWithoutCredentials,
  });
}

function checkFile({ repoRoot, filePath, id, label = filePath }) {
  const absolutePath = path.resolve(repoRoot, filePath);
  return {
    id,
    ok: fs.existsSync(absolutePath),
    kind: "file",
    path: absolutePath,
    message: fs.existsSync(absolutePath)
      ? `${label} exists`
      : `${label} is missing`,
  };
}

function buildChecksForAction({ action, repoRoot, env, envFile, evidenceDir }) {
  const checks = [
    checkFile({
      repoRoot,
      filePath: evidenceDir,
      id: "evidence-dir",
      label: "release evidence directory",
    }),
  ];
  const commandText = action.commands.join("\n");
  const evidenceInputs = readReleaseEvidenceInputs({
    repoRoot,
    evidenceDir,
  });

  switch (action.id) {
    case "immutable-version":
      checks.push(
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_VERSION" }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_ENVIRONMENT" }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "OPERATOR_ROLE" }),
        checkEnvOrEvidence({
          env,
          evidenceInputs,
          key: "GIT_COMMIT",
          validate: (value) => /^[a-f0-9]{7,40}$/i.test(value),
        }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "SERVER_IMAGE" }),
        checkEnvOrEvidence({
          env,
          evidenceInputs,
          key: "SERVER_IMAGE_DIGEST",
          validate: (value) => DIGEST_RE.test(value),
        }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "WEB_IMAGE" }),
        checkEnvOrEvidence({
          env,
          evidenceInputs,
          key: "WEB_IMAGE_DIGEST",
          validate: (value) => DIGEST_RE.test(value),
        }),
        checkEnvOrEvidence({
          env,
          evidenceInputs,
          key: "MIGRATION_BEFORE",
          validate: (value) => /^\d{14}$/.test(value),
        }),
        checkEnvOrEvidence({
          env,
          evidenceInputs,
          key: "MIGRATION_AFTER",
          validate: (value) => /^\d{14}$/.test(value),
        }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "BACKUP_ID" }),
      );
      break;
    case "production-preflight":
      checks.push(
        checkFile({
          repoRoot,
          filePath: envFile,
          id: "prod-env-file",
          label: "production runtime env file",
        }),
      );
      if (/\.example(?:$|[./])/.test(envFile)) {
        checks.push({
          id: "prod-env-file-not-example",
          ok: false,
          kind: "file",
          message: "production runtime env file must not be an example file",
        });
      }
      break;
    case "backup-restore-rehearsal":
      checks.push(
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_VERSION" }),
        checkEnv({ env, key: "SOURCE_POSTGRES_DSN" }),
        checkFile({
          repoRoot,
          filePath: "deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh",
          id: "backup-restore-script",
          label: "backup restore rehearsal script",
        }),
      );
      break;
    case "target-smoke":
      checks.push(
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_VERSION" }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_ENVIRONMENT" }),
        checkRuntimeUrl({ env, key: "SMOKE_ENDPOINT" }),
        checkRuntimeUrl({ env, key: "SMOKE_BACKEND_URL" }),
        checkFile({
          repoRoot,
          filePath: "deployments/yoyoosun/scripts/run-smoke.sh",
          id: "run-smoke-script",
          label: "target smoke script",
        }),
      );
      if (commandText.includes("--backend-url")) {
        checks.push(checkRuntimeUrl({ env, key: "SMOKE_BACKEND_URL" }));
      }
      if (commandText.includes("--admin-token-env")) {
        checks.push(checkEnv({ env, key: "CUSTOMER_CONFIG_ADMIN_TOKEN" }));
      }
      break;
    case "rollback-forward-fix":
      checks.push(
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_VERSION" }),
        checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_ENVIRONMENT" }),
        checkEnv({ env, key: "ROLLBACK_TARGET_RELEASE" }),
        checkEnv({ env, key: "ROLLBACK_TRIGGER_SCENARIO" }),
        checkFile({
          repoRoot,
          filePath: path.join(evidenceDir, "smoke-test-report.json"),
          id: "post-smoke-report",
          label: "post-smoke report",
        }),
      );
      break;
    case "release-signoff":
      checks.push({
        id: "manual-release-signoff",
        ok: false,
        kind: "manual",
        message:
          "release sign-off is manual and must happen after preflight, restore, smoke, rollback rehearsal, and limitations are reviewed",
      });
      break;
    case "customer-config-effective-session":
      if (commandText.includes("customer-config-manifest-evidence.mjs")) {
        checks.push(checkEnv({ env, key: "REVIEWER_NAME" }));
      }
      if (commandText.includes("run-smoke.sh")) {
        checks.push(
          checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_VERSION" }),
          checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_ENVIRONMENT" }),
          checkRuntimeUrl({ env, key: "SMOKE_ENDPOINT" }),
          checkRuntimeUrl({ env, key: "SMOKE_BACKEND_URL" }),
          checkEnv({ env, key: "CUSTOMER_CONFIG_ADMIN_TOKEN" }),
        );
      }
      if (commandText.includes("rollback-rehearsal-report.mjs")) {
        checks.push(
          checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_VERSION" }),
          checkEnvOrEvidence({ env, evidenceInputs, key: "RELEASE_ENVIRONMENT" }),
          checkEnv({ env, key: "ROLLBACK_TARGET_RELEASE" }),
          checkEnv({ env, key: "ROLLBACK_TRIGGER_SCENARIO" }),
          checkFile({
            repoRoot,
            filePath: path.join(evidenceDir, "smoke-test-report.json"),
            id: "post-smoke-report",
            label: "post-smoke report",
          }),
        );
      }
      break;
    default:
      checks.push({
        id: "manual-review",
        ok: false,
        kind: "manual",
        message: "unknown closeout action requires manual review",
      });
      break;
  }

  return checks;
}

function summarizeActions(actions) {
  const summary = {
    total: actions.length,
    runnable: 0,
    blocked: 0,
    manualOnly: 0,
  };
  for (const action of actions) {
    if (action.manualOnly) {
      summary.manualOnly += 1;
    } else if (action.canRun) {
      summary.runnable += 1;
    } else {
      summary.blocked += 1;
    }
  }
  return summary;
}

function dedupeChecks(checks) {
  const seen = new Set();
  const deduped = [];
  for (const check of checks) {
    const key = `${check.kind}:${check.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(check);
  }
  return deduped;
}

function buildGateSummaryByActionId(closeoutGateSummary) {
  return new Map(closeoutGateSummary.map((item) => [item.id, item]));
}

function getActionGateSummary(gateSummaryById, action) {
  return (
    gateSummaryById.get(action.id) ?? {
      id: action.id,
      label: action.label,
      status: action.status,
      errorCount: 0,
      warningCount: 0,
      sampleErrors: [],
      sampleWarnings: [],
    }
  );
}

function shellToken(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:=@+-]+$/.test(text)) return text;
  return `'${text.replaceAll("'", "'\\''")}'`;
}

function buildInputTemplateCommand({ actionId, evidenceDir }) {
  if (actionId !== "immutable-version") return "";
  return [
    "node",
    "scripts/deploy/immutable-version-evidence.mjs",
    "--evidence-dir",
    evidenceDir,
    "--print-input-template",
  ].map(shellToken).join(" ");
}

function collectResolvedInputs(checks) {
  const inputs = {};
  for (const check of checks) {
    if (check.ok && check.value) {
      inputs[check.id] = {
        value: check.value,
        source: check.kind === "evidence" ? check.source : "env",
        field: check.field,
      };
    }
  }
  return inputs;
}

function operatorGuideFor(id) {
  return OPERATOR_INPUT_GUIDE[id] ?? {
    sourceHint: "operator supplied release prerequisite",
    evidenceTarget: "release evidence closeout action",
    validation: "must be real, current, and non-placeholder",
    secret: false,
  };
}

function buildOperatorChecklist({ resolvedInputs, missingPrerequisites }) {
  const items = [];
  const seen = new Set();
  for (const [id, input] of Object.entries(resolvedInputs ?? {})) {
    const guide = operatorGuideFor(id);
    items.push({
      id,
      kind: input.source === "env" ? "env" : "evidence",
      status: "resolved",
      source: input.source,
      field: input.field || "",
      sourceHint: guide.sourceHint,
      evidenceTarget: guide.evidenceTarget,
      validation: guide.validation,
      secret: guide.secret,
    });
    seen.add(id);
  }
  for (const prerequisite of missingPrerequisites) {
    if (seen.has(prerequisite.id)) continue;
    const guide = operatorGuideFor(prerequisite.id);
    items.push({
      id: prerequisite.id,
      kind: prerequisite.kind,
      status: "missing",
      message: prerequisite.message,
      sourceHint: guide.sourceHint,
      evidenceTarget: guide.evidenceTarget,
      validation: guide.validation,
      secret: guide.secret,
    });
    seen.add(prerequisite.id);
  }
  return items;
}

export function buildReleaseEvidenceCloseoutPlan({
  customer = DEFAULT_CUSTOMER,
  evidenceDir,
  envFile = DEFAULT_ENV_FILE,
  repoRoot = process.cwd(),
  env = process.env,
} = {}) {
  if (!evidenceDir) {
    throw new CliError("--evidence-dir is required", 2);
  }
  const status = buildReleaseEvidenceStatus({
    customer,
    evidenceDir,
    repoRoot,
  });
  const gateSummaryById = buildGateSummaryByActionId(
    status.closeoutGateSummary,
  );
  const actions = status.closeoutNextActions.map((action, index) => {
    const prerequisiteChecks = buildChecksForAction({
      action,
      repoRoot,
      env,
      envFile,
      evidenceDir,
    });
    const manualOnly =
      action.commands.length === 0 ||
      prerequisiteChecks.some((check) => check.kind === "manual");
    const missingPrerequisites = dedupeChecks(
      prerequisiteChecks.filter((check) => !check.ok),
    );
    const resolvedInputs = collectResolvedInputs(prerequisiteChecks);
    return {
      order: index + 1,
      ...action,
      gateSummary: getActionGateSummary(gateSummaryById, action),
      inputTemplateCommand: buildInputTemplateCommand({
        actionId: action.id,
        evidenceDir,
      }),
      canRun: !manualOnly && missingPrerequisites.length === 0,
      manualOnly,
      resolvedInputs,
      operatorChecklist: buildOperatorChecklist({
        resolvedInputs,
        missingPrerequisites,
      }),
      prerequisiteChecks,
      missingPrerequisites,
    };
  });

  return {
    customer,
    evidenceDir,
    envFile,
    status: {
      status: status.status,
      ready: status.ready,
      gateReady: status.gateReady,
      closeoutSummary: status.closeoutSummary,
    },
    actions,
    summary: summarizeActions(actions),
    scope: CLOSEOUT_PLAN_SCOPE,
  };
}

function printText(plan) {
  console.log(
    `release evidence closeout plan: status=${plan.status.status}, ready=${plan.status.ready}, blockers=${plan.status.closeoutSummary.blockers}`,
  );
  console.log(
    `actions: total=${plan.summary.total}, runnable=${plan.summary.runnable}, blocked=${plan.summary.blocked}, manualOnly=${plan.summary.manualOnly}`,
  );
  for (const action of plan.actions) {
    const state = action.canRun
      ? "runnable"
      : action.manualOnly
        ? "manual"
        : "blocked";
    console.log(`- ${action.order}. ${action.id}: ${state}`);
    if (
      action.gateSummary.errorCount > 0 ||
      action.gateSummary.warningCount > 0
    ) {
      console.log(
        `  gate: errors=${action.gateSummary.errorCount}, warnings=${action.gateSummary.warningCount}`,
      );
      for (const error of action.gateSummary.sampleErrors) {
        console.log(`  gate error: ${error}`);
      }
      for (const warning of action.gateSummary.sampleWarnings) {
        console.log(`  gate warning: ${warning}`);
      }
    }
    for (const check of action.missingPrerequisites) {
      console.log(`  missing: ${check.message}`);
    }
    const firstMissingOperatorInput = action.operatorChecklist.find(
      (item) => item.status === "missing",
    );
    if (firstMissingOperatorInput) {
      console.log(
        `  operator input: ${firstMissingOperatorInput.id} -> ${firstMissingOperatorInput.sourceHint}`,
      );
    }
    if (action.inputTemplateCommand) {
      console.log(`  input template: ${action.inputTemplateCommand}`);
    }
    for (const command of action.commands) {
      console.log(`  command: ${command}`);
    }
  }
  console.log("scope: read-only plan; no target action was executed");
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const plan = buildReleaseEvidenceCloseoutPlan(options);
    if (options.json) {
      console.log(JSON.stringify(plan, null, 2));
    } else {
      printText(plan);
    }
    process.exit(options.failOnBlocked && plan.summary.blocked > 0 ? 1 : 0);
  } catch (error) {
    if (process.argv.includes("--json")) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            error: error.message,
          },
          null,
          2,
        ),
      );
    } else {
      console.error(`[release-evidence-closeout-plan] ${error.message}`);
    }
    process.exit(error.exitCode ?? 1);
  }
}
