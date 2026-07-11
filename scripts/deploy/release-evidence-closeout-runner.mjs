#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildReleaseEvidenceCloseoutPlan } from "./release-evidence-closeout-plan.mjs";

const DEFAULT_CUSTOMER = "yoyoosun";
const DEFAULT_ENV_FILE = "server/deploy/compose/prod/.env";
const CONFIRM_PHRASE = "RUN_YOYOOSUN_RELEASE_CLOSEOUT";

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
    execute: false,
    json: false,
    only: [],
    reportPath: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--execute") {
      options.execute = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
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
      case "runtime-env-file":
      case "preflight-env-file":
      case "env-file":
        options.envFile = value;
        break;
      case "report":
        options.reportPath = value;
        break;
      case "only":
        options.only.push(
          ...String(value)
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
        );
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Release evidence closeout runner

Usage:
  node scripts/deploy/release-evidence-closeout-runner.mjs \\
    --evidence-dir deployments/yoyoosun/evidence/releases/<YYYY-MM-DD> \\
    [--runtime-env-file server/deploy/compose/prod/.env] \\
    [--only immutable-version,target-smoke] \\
    [--report output/release-evidence-closeout/<YYYY-MM-DD>/closeout-runner-report.json] \\
    [--json] [--execute]

Execute:
  RELEASE_CLOSEOUT_CONFIRM=RUN_YOYOOSUN_RELEASE_CLOSEOUT \\
    node scripts/deploy/release-evidence-closeout-runner.mjs ... --execute

Purpose:
  Build the closeout plan, materialize runnable machine actions, and optionally
  execute them in order. Without --execute this is report-only. It never
  performs manual sign-off, never runs blocked actions, and never bypasses the
  release evidence gate. When --report is provided, the runner writes a
  sanitized JSON report with display commands and line counts only. Report
  paths must stay outside deployments/<customer>/evidence/**.`);
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new CliError(
      `Missing required --${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`,
      2,
    );
  }
}

function requireEnv(env, key) {
  const value = String(env[key] ?? "").trim();
  if (!value) {
    throw new CliError(`${key} is required`);
  }
  return value;
}

function requireInput({ env, action, key }) {
  const value = String(env[key] ?? "").trim();
  if (value) return value;
  const resolved = String(action.resolvedInputs?.[key]?.value ?? "").trim();
  if (resolved) return resolved;
  throw new CliError(`${key} is required`);
}

function requireRuntimeUrl(env, key) {
  const value = requireEnv(env, key);
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`${key} must be an http(s) URL without credentials`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CliError(`${key} must be an http(s) URL without credentials`);
  }
  if (url.username || url.password) {
    throw new CliError(`${key} must not include URL credentials`);
  }
  return value;
}

function extractCustomerConfigRevision(action) {
  const text = action.commands.join("\n");
  const match = text.match(/--customer-config-revision\s+([^\s]+)/);
  return match ? match[1] : "";
}

function buildDisplayCommand(cmd, args, envKeys = []) {
  const envPrefix =
    envKeys.length > 0
      ? `${envKeys.map((key) => `${key}=<redacted>`).join(" ")} `
      : "";
  return `${envPrefix}${[cmd, ...args].join(" ")}`;
}

function materializeCommandFromText({
  commandText,
  action,
  evidenceDir,
  envFile,
  env,
}) {
  const revision = extractCustomerConfigRevision(action);
  if (commandText.includes("immutable-version-evidence.mjs")) {
    const cmd = process.execPath;
    const args = [
      "scripts/deploy/immutable-version-evidence.mjs",
      "--evidence-dir",
      evidenceDir,
      "--release-version",
      requireInput({ env, action, key: "RELEASE_VERSION" }),
      "--environment",
      requireInput({ env, action, key: "RELEASE_ENVIRONMENT" }),
      "--operator-role",
      requireInput({ env, action, key: "OPERATOR_ROLE" }),
      "--git-commit",
      requireInput({ env, action, key: "GIT_COMMIT" }),
      "--server-image",
      requireInput({ env, action, key: "SERVER_IMAGE" }),
      "--server-digest",
      requireInput({ env, action, key: "SERVER_IMAGE_DIGEST" }),
      "--web-image",
      requireInput({ env, action, key: "WEB_IMAGE" }),
      "--web-digest",
      requireInput({ env, action, key: "WEB_IMAGE_DIGEST" }),
      "--migration-before",
      requireInput({ env, action, key: "MIGRATION_BEFORE" }),
      "--migration-after",
      requireInput({ env, action, key: "MIGRATION_AFTER" }),
      "--backup-id",
      requireInput({ env, action, key: "BACKUP_ID" }),
    ];
    return { cmd, args, displayCommand: buildDisplayCommand("node", args) };
  }
  if (commandText.includes("image-digests-evidence.mjs")) {
    const cmd = process.execPath;
    const args = [
      "scripts/deploy/image-digests-evidence.mjs",
      "--server-image",
      requireEnv(env, "SERVER_IMAGE"),
      "--server-digest",
      requireEnv(env, "SERVER_IMAGE_DIGEST"),
      "--web-image",
      requireEnv(env, "WEB_IMAGE"),
      "--web-digest",
      requireEnv(env, "WEB_IMAGE_DIGEST"),
      "--evidence-dir",
      evidenceDir,
    ];
    return { cmd, args, displayCommand: buildDisplayCommand("node", args) };
  }
  if (commandText.includes("production-preflight.sh")) {
    const cmd = "bash";
    const args = [
      "scripts/deploy/production-preflight.sh",
      "--env-file",
      envFile,
      "--runtime",
      "--out",
      path.join(evidenceDir, "production-preflight-report.txt"),
    ];
    return { cmd, args, displayCommand: buildDisplayCommand(cmd, args) };
  }
  if (commandText.includes("run-backup-restore-rehearsal.sh")) {
    const cmd = "bash";
    const args = [
      "deployments/yoyoosun/scripts/run-backup-restore-rehearsal.sh",
      "--release-version",
      requireInput({ env, action, key: "RELEASE_VERSION" }),
      "--backup-purpose",
      "pre-migration",
      "--out",
      "output/customers/yoyoosun/backup-restore-rehearsal",
      "--evidence-dir",
      evidenceDir,
    ];
    return {
      cmd,
      args,
      env: { SOURCE_POSTGRES_DSN: requireEnv(env, "SOURCE_POSTGRES_DSN") },
      displayCommand: buildDisplayCommand(cmd, args, ["SOURCE_POSTGRES_DSN"]),
    };
  }
  if (commandText.includes("run-smoke.sh")) {
    const cmd = "bash";
    const args = [
      "deployments/yoyoosun/scripts/run-smoke.sh",
      "--release-version",
      requireInput({ env, action, key: "RELEASE_VERSION" }),
      "--environment",
      requireInput({ env, action, key: "RELEASE_ENVIRONMENT" }),
      "--endpoint",
      requireRuntimeUrl(env, "SMOKE_ENDPOINT"),
    ];
    if (commandText.includes("--backend-url")) {
      args.push("--backend-url", requireRuntimeUrl(env, "SMOKE_BACKEND_URL"));
    }
    if (revision) {
      args.push("--customer-config-revision", revision);
    }
    if (commandText.includes("--admin-token-env")) {
      args.push("--admin-token-env", "CUSTOMER_CONFIG_ADMIN_TOKEN");
    }
    args.push("--report", path.join(evidenceDir, "smoke-test-report.json"));
    return {
      cmd,
      args,
      env: commandText.includes("--admin-token-env")
        ? {
            CUSTOMER_CONFIG_ADMIN_TOKEN: requireEnv(
              env,
              "CUSTOMER_CONFIG_ADMIN_TOKEN",
            ),
          }
        : {},
      displayCommand: buildDisplayCommand(
        cmd,
        args,
        commandText.includes("--admin-token-env")
          ? ["CUSTOMER_CONFIG_ADMIN_TOKEN"]
          : [],
      ),
    };
  }
  if (commandText.includes("rollback-rehearsal-report.mjs")) {
    const cmd = process.execPath;
    const args = [
      "scripts/deploy/rollback-rehearsal-report.mjs",
      "--environment",
      requireInput({ env, action, key: "RELEASE_ENVIRONMENT" }),
      "--release-version",
      requireInput({ env, action, key: "RELEASE_VERSION" }),
      "--rehearsal-type",
      "rollback-forward-fix",
      "--trigger-scenario",
      requireEnv(env, "ROLLBACK_TRIGGER_SCENARIO"),
      "--rollback-target-release",
      requireEnv(env, "ROLLBACK_TARGET_RELEASE"),
      "--step",
      "identify rollback target=pass",
      "--post-smoke-report",
      "smoke-test-report.json",
    ];
    if (revision) {
      args.push("--customer-config-revision", revision);
    }
    args.push("--evidence-dir", evidenceDir);
    return { cmd, args, displayCommand: buildDisplayCommand("node", args) };
  }
  if (commandText.includes("customer-config-manifest-evidence.mjs")) {
    const cmd = process.execPath;
    const args = [
      "scripts/deploy/customer-config-manifest-evidence.mjs",
      "--manifest",
      "output/customers/yoyoosun/customer-config-runtime-manifest.json",
      "--evidence-dir",
      evidenceDir,
      "--reviewer",
      requireEnv(env, "REVIEWER_NAME"),
    ];
    return { cmd, args, displayCommand: buildDisplayCommand("node", args) };
  }
  throw new CliError(`Cannot materialize command for action ${action.id}`);
}

function materializeAction({ action, evidenceDir, envFile, env }) {
  return action.commands.map((commandText) =>
    materializeCommandFromText({
      commandText,
      action,
      evidenceDir,
      envFile,
      env,
    }),
  );
}

function sanitizeMaterializedCommand(command) {
  return {
    displayCommand: command.displayCommand,
    envKeys: Object.keys(command.env || {}),
  };
}

function attachExecutionCommands(action, executionCommands) {
  Object.defineProperty(action, "executionCommands", {
    value: executionCommands,
    enumerable: false,
  });
  return action;
}

export function buildCloseoutRunPlan({
  customer = DEFAULT_CUSTOMER,
  evidenceDir,
  envFile = DEFAULT_ENV_FILE,
  only = [],
  repoRoot = process.cwd(),
  env = process.env,
} = {}) {
  requireOption({ evidenceDir }, "evidenceDir");
  const closeoutPlan = buildReleaseEvidenceCloseoutPlan({
    customer,
    evidenceDir,
    envFile,
    repoRoot,
    env,
  });
  const onlySet = new Set(only);
  const selectedActions =
    onlySet.size > 0
      ? closeoutPlan.actions.filter((action) => onlySet.has(action.id))
      : closeoutPlan.actions;
  const missingOnly = [...onlySet].filter(
    (id) => !closeoutPlan.actions.some((action) => action.id === id),
  );
  if (missingOnly.length > 0) {
    throw new CliError(
      `Unknown or not-needed action id(s): ${missingOnly.join(", ")}`,
      2,
    );
  }
  const actions = selectedActions.map((action) => {
    const executionCommands =
      action.canRun && !action.manualOnly
        ? materializeAction({ action, evidenceDir, envFile, env })
        : [];
    return attachExecutionCommands(
      {
        id: action.id,
        order: action.order,
        canRun: action.canRun,
        manualOnly: action.manualOnly,
        inputTemplateCommand: action.inputTemplateCommand || "",
        resolvedInputs: action.resolvedInputs,
        missingPrerequisites: action.missingPrerequisites,
        operatorChecklist: action.operatorChecklist,
        commands: executionCommands.map(sanitizeMaterializedCommand),
      },
      executionCommands,
    );
  });
  return {
    customer,
    evidenceDir,
    envFile,
    executeReady:
      actions.length > 0 &&
      actions.every((action) => action.canRun && !action.manualOnly),
    closeoutStatus: closeoutPlan.status,
    selectedActionCount: actions.length,
    actions,
    scope: {
      reportOnlyByDefault: true,
      requiresConfirm: CONFIRM_PHRASE,
      doesNotExecuteManualSignoff: true,
      doesNotBypassReleaseEvidenceGate: true,
    },
  };
}

function runMaterializedCommand(command, repoRoot) {
  const result = spawnSync(command.cmd, command.args, {
    cwd: repoRoot,
    env: {
      ...process.env,
      ...(command.env || {}),
    },
    encoding: "utf8",
  });
  return {
    command: command.displayCommand,
    exitCode: result.status,
    stdoutLineCount: result.stdout
      ? result.stdout.trimEnd().split("\n").length
      : 0,
    stderrLineCount: result.stderr
      ? result.stderr.trimEnd().split("\n").length
      : 0,
    ok: result.status === 0,
  };
}

function isSameOrInsidePath(childPath, parentPath) {
  const relativePath = path.relative(parentPath, childPath);
  return (
    relativePath === "" ||
    (relativePath &&
      !relativePath.startsWith("..") &&
      !path.isAbsolute(relativePath))
  );
}

function isInsideDeploymentsEvidenceTree(absolutePath) {
  const segments = absolutePath.split(path.sep).filter(Boolean);
  for (let index = 0; index < segments.length - 2; index += 1) {
    if (
      segments[index] === "deployments" &&
      segments[index + 2] === "evidence"
    ) {
      return true;
    }
  }
  return false;
}

function assertReportPathOutsideEvidenceDir({
  repoRoot,
  reportPath,
  evidenceDir,
}) {
  if (!reportPath) return;
  const absoluteReportPath = path.resolve(repoRoot, reportPath);
  const absoluteEvidenceDir = path.resolve(repoRoot, evidenceDir);
  if (
    isSameOrInsidePath(absoluteReportPath, absoluteEvidenceDir) ||
    isInsideDeploymentsEvidenceTree(absoluteReportPath)
  ) {
    throw new CliError(
      "--report must be outside deployments evidence directories; use output/release-evidence-closeout/<release>/... for report-only runner reports",
      2,
    );
  }
}

function writeSanitizedReport(reportPath, report, repoRoot) {
  const absolutePath = path.resolve(repoRoot, reportPath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(
    absolutePath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        ...report,
      },
      null,
      2,
    )}\n`,
  );
}

export function runCloseoutActions({
  customer = DEFAULT_CUSTOMER,
  evidenceDir,
  envFile = DEFAULT_ENV_FILE,
  only = [],
  repoRoot = process.cwd(),
  env = process.env,
  execute = false,
  reportPath = "",
} = {}) {
  const plan = buildCloseoutRunPlan({
    customer,
    evidenceDir,
    envFile,
    only,
    repoRoot,
    env,
  });
  assertReportPathOutsideEvidenceDir({ repoRoot, reportPath, evidenceDir });
  if (!execute) {
    const report = {
      ok: true,
      executed: false,
      plan,
      results: [],
    };
    if (reportPath) {
      writeSanitizedReport(reportPath, report, repoRoot);
    }
    return report;
  }
  if (env.RELEASE_CLOSEOUT_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(`RELEASE_CLOSEOUT_CONFIRM must be ${CONFIRM_PHRASE}`);
  }
  if (!plan.executeReady) {
    throw new CliError("selected closeout actions are not all runnable");
  }
  const results = [];
  for (const action of plan.actions) {
    for (const command of action.executionCommands) {
      const result = runMaterializedCommand(command, repoRoot);
      results.push({
        actionId: action.id,
        ...result,
      });
      if (!result.ok) {
        const report = {
          ok: false,
          executed: true,
          plan,
          results,
        };
        if (reportPath) {
          writeSanitizedReport(reportPath, report, repoRoot);
        }
        return report;
      }
    }
  }
  const report = {
    ok: true,
    executed: true,
    plan,
    results,
  };
  if (reportPath) {
    writeSanitizedReport(reportPath, report, repoRoot);
  }
  return report;
}

function printText(report) {
  console.log(
    `release evidence closeout runner: executed=${report.executed}, ok=${report.ok}`,
  );
  console.log(
    `selected actions: ${report.plan.actions.map((action) => action.id).join(", ") || "(none)"}`,
  );
  for (const action of report.plan.actions) {
    const state = action.canRun
      ? "runnable"
      : action.manualOnly
        ? "manual"
        : "blocked";
    console.log(`- ${action.order}. ${action.id}: ${state}`);
    for (const missing of action.missingPrerequisites) {
      console.log(`  missing: ${missing.message}`);
    }
    const firstMissingOperatorInput = action.operatorChecklist?.find(
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
      console.log(`  command: ${command.displayCommand}`);
    }
  }
  for (const result of report.results) {
    console.log(`result: ${result.actionId} exit=${result.exitCode}`);
  }
}

const isCli = process.argv[1] === fileURLToPath(import.meta.url);

if (isCli) {
  try {
    const options = parseCliArgs(process.argv.slice(2));
    if (options.help) {
      printHelp();
      process.exit(0);
    }
    const report = runCloseoutActions({
      customer: options.customer,
      evidenceDir: options.evidenceDir,
      envFile: options.envFile,
      only: options.only,
      execute: options.execute,
      reportPath: options.reportPath,
    });
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printText(report);
    }
    process.exit(report.ok ? 0 : 1);
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
      console.error(`[release-evidence-closeout-runner] ${error.message}`);
    }
    process.exit(error.exitCode ?? 1);
  }
}
