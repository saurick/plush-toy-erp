#!/usr/bin/env node

import { execFile as execFileCallback, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { evaluateMigrationStatus } from "./local-runtime-preflight-core.mjs";
import { databaseProgrammabilityReceiptSQL } from "./qa/database-programmability.mjs";

const execFileAsync = promisify(execFileCallback);
const repoRoot = path.resolve(import.meta.dirname, "..");
const serverRoot = path.join(repoRoot, "server");
const migrationDir = path.join(serverRoot, "internal/data/model/migrate");
const migrationScriptPath = fileURLToPath(import.meta.url);
const stagedLifecycleVersion = "20260726173924";
const lifecyclePreflightVersion = "20260726173943";
const registeredSharedDevSystemIdentifier = "7572907083182862377";
const targetConfirmPrefixes = Object.freeze({
  local: "TRUST_LOCAL_DATABASE:",
  "shared-dev": "TRUST_SHARED_DEV_DATABASE:",
});
const applyConfirmPrefix = "APPLY_DEV_MIGRATIONS:";
const maintenanceConfirmPrefix = "SHARED_DEV_MAINTENANCE_READY:";

class MigrationCommandError extends Error {
  constructor(message, receipt = {}) {
    super(message);
    this.receipt = receipt;
  }
}

const migrationReceiptResults = new Set([
  "passed",
  "up_to_date",
  "ready",
  "action_required",
  "blocked",
  "failed",
  "not_proven",
  "already_applied",
]);
const migrationReceiptWrites = new Set(["0", "committed", "unknown"]);
const migrationReceiptApply = new Set([
  "not_requested",
  "not_started",
  "skipped",
  "attempted_once",
  "executed_once",
  "already_executed",
  "unknown",
]);
const migrationReceiptTokenPattern = /^[a-z0-9][a-z0-9_-]{0,79}$/u;
const migrationReceiptVersionPattern = /^\d{8,20}$/u;
const migrationReceiptOperationPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

function migrationReceiptToken(value, fallback) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return migrationReceiptTokenPattern.test(normalized) ? normalized : fallback;
}

function migrationReceiptCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? String(value) : "unknown";
}

function migrationReceiptVersion(value, known) {
  const normalized = String(value || "").trim();
  if (!normalized) return known ? "none" : "unknown";
  return migrationReceiptVersionPattern.test(normalized)
    ? normalized
    : "unknown";
}

function migrationReceiptTarget(target) {
  if (!target || typeof target !== "object") return null;
  const scope = migrationReceiptToken(
    target.key || target.scope,
    "unavailable",
  );
  const safeTarget = String(target.safeTarget || "").trim();
  const matched = safeTarget.match(
    /^host=([A-Za-z0-9.:[\]_-]+) port=(\d{1,5}) database=([A-Za-z0-9][A-Za-z0-9_-]*)$/u,
  );
  if (!matched || scope === "unavailable") return null;
  const port = Number(matched[2]);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return null;
  return {
    scope,
    host: matched[1],
    port: String(port),
    database: matched[3],
  };
}

/**
 * Emit one stable, secret-free terminal receipt for a migration command.
 * Progress and controlled confirmation lines may still precede this block.
 */
export function createMigrationTerminalReceipt({
  command = "migration",
  mode = command,
  output = process.stdout,
} = {}) {
  if (!output || typeof output.write !== "function") {
    throw new TypeError("migration receipt output must provide write()");
  }
  const state = {
    command: migrationReceiptToken(command, "migration"),
    mode: migrationReceiptToken(mode, "unknown"),
    phase: "entry",
    target: null,
    status: null,
    operation: "none",
    runtime: null,
    writes: "0",
    apply: "not_started",
    finished: false,
  };

  const update = (next = {}) => {
    if (state.finished) return;
    if (next.phase !== undefined) {
      state.phase = migrationReceiptToken(next.phase, state.phase);
    }
    if (next.target !== undefined) state.target = next.target;
    if (next.status !== undefined) state.status = next.status;
    if (next.runtime !== undefined) state.runtime = next.runtime;
    if (next.operation !== undefined) {
      const operation = String(next.operation || "").trim();
      state.operation = migrationReceiptOperationPattern.test(operation)
        ? operation
        : "none";
    }
    if (next.writes !== undefined && migrationReceiptWrites.has(next.writes)) {
      state.writes = next.writes;
    }
    if (next.apply !== undefined && migrationReceiptApply.has(next.apply)) {
      state.apply = next.apply;
    }
  };

  const finish = (terminal = {}) => {
    if (state.finished) return;
    update(terminal);
    const result = migrationReceiptResults.has(terminal.result)
      ? terminal.result
      : "failed";
    const errorCode = migrationReceiptToken(terminal.errorCode, "none");
    const nextAction = migrationReceiptToken(terminal.nextAction, "none");
    const safeTarget = migrationReceiptTarget(state.target);
    const status =
      state.status && typeof state.status === "object" ? state.status : null;
    const baseline =
      state.target && typeof state.target === "object" ? state.target : null;
    const knownStatus = Boolean(status);
    const currentVersion = migrationReceiptVersion(
      status?.currentVersion ?? baseline?.currentVersion,
      knownStatus,
    );
    const latestVersion = migrationReceiptVersion(
      status?.latestVersion ?? baseline?.latestVersion,
      knownStatus,
    );
    const pendingValue = status?.pendingFiles ?? baseline?.pendingFiles;
    const availableValue = status?.availableFiles ?? baseline?.availableFiles;
    let appliedValue = status?.appliedFiles ?? baseline?.appliedFiles;
    if (
      !Number.isSafeInteger(appliedValue) &&
      pendingValue === 0 &&
      Number.isSafeInteger(availableValue)
    ) {
      appliedValue = availableValue;
    }
    const runtimeHealth = migrationReceiptToken(
      state.runtime?.health?.status,
      "unknown",
    );
    const runtimeReady = migrationReceiptToken(
      state.runtime?.ready?.status,
      "unknown",
    );

    output.write(
      `[migration-summary] command=${state.command} mode=${state.mode} phase=${state.phase}\n`,
    );
    output.write(
      safeTarget
        ? `[migration-summary] target=${safeTarget.scope} host=${safeTarget.host} port=${safeTarget.port} database=${safeTarget.database}\n`
        : "[migration-summary] target=unavailable\n",
    );
    output.write(
      `[migration-summary] current=${currentVersion} latest=${latestVersion} applied=${migrationReceiptCount(appliedValue)}/${migrationReceiptCount(availableValue)} pending=${migrationReceiptCount(pendingValue)}\n`,
    );
    output.write(
      `[migration-summary] result=${result} writes=${state.writes} apply=${state.apply} auto_retry=false\n`,
    );
    output.write(`[migration-summary] operation=${state.operation}\n`);
    output.write(
      `[migration-summary] runtime health=${runtimeHealth} ready=${runtimeReady}\n`,
    );
    output.write(
      `[migration-summary] error_code=${errorCode} next_action=${nextAction}\n`,
    );
    state.finished = true;
  };

  return {
    update,
    finish,
    get finished() {
      return state.finished;
    },
    get phase() {
      return state.phase;
    },
  };
}

function shortHash(value, length = 24) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex")
    .slice(0, length);
}

function workflowFingerprint() {
  const schemaDir = path.join(serverRoot, "internal/data/model/schema");
  const schemaFiles = fs
    .readdirSync(schemaDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".go"))
    .map((entry) => path.join(schemaDir, entry.name))
    .sort();
  const files = [
    migrationScriptPath,
    path.join(serverRoot, "Makefile"),
    path.join(repoRoot, "scripts/local-runtime-preflight-core.mjs"),
    path.join(repoRoot, "scripts/qa/database-programmability.mjs"),
    path.join(repoRoot, "scripts/qa/populated-upgrade-preflight.sh"),
    path.join(repoRoot, "scripts/qa/populated-upgrade-20260714055504.sql"),
    path.join(
      repoRoot,
      "scripts/qa/customer-config-cutover-20260714055825.sql",
    ),
    path.join(
      repoRoot,
      "scripts/qa/operational-fact-lifecycle-20260726173943.sql",
    ),
    ...schemaFiles,
  ];
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(repoRoot, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function normalizeDatabaseName(name) {
  return decodeURIComponent(String(name || "").replace(/^\/+/u, ""));
}

function isRegisteredDevelopmentDatabase(name) {
  if (name === "plush_erp") return true;
  const matched = name.match(/^plush_erp_([a-z0-9_]+)_dev$/u);
  return Boolean(matched && matched[1].replaceAll("_", ""));
}

function isIsolatedLocalDatabase(name) {
  return /^plush_erp(?:_[a-z0-9_]+)?$/u.test(name);
}

function isLoopbackHostname(rawHostname) {
  const hostname = String(rawHostname || "")
    .replace(/^\[|\]$/gu, "")
    .replace(/\.$/u, "")
    .toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (hostname === "::1") return true;
  const ipv4 = hostname.split(".").map(Number);
  return (
    ipv4.length === 4 &&
    ipv4.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) &&
    ipv4[0] === 127
  );
}

export function classifyDevelopmentTarget(databaseURL, source) {
  const parsed = new URL(String(databaseURL || ""));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new MigrationCommandError("migration 目标只允许 PostgreSQL URL");
  }
  const connectionOverride = [
    "host",
    "hostaddr",
    "port",
    "dbname",
    "user",
    "password",
    "service",
    "servicefile",
    "passfile",
  ].find((key) => parsed.searchParams.has(key));
  if (connectionOverride) {
    throw new MigrationCommandError(
      `migration URL 不允许通过 query 参数覆盖 ${connectionOverride}`,
    );
  }
  const host = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
  const port = parsed.port || "5432";
  const database = normalizeDatabaseName(parsed.pathname);
  if (!host || !database) {
    throw new MigrationCommandError("migration 数据库目标不完整");
  }

  let scope = "untrusted";
  if (isLoopbackHostname(host) && isIsolatedLocalDatabase(database)) {
    scope = "local";
  } else if (
    source === "application-config" &&
    host === "192.168.0.106" &&
    port === "5432" &&
    isRegisteredDevelopmentDatabase(database)
  ) {
    scope = "shared-dev";
  }

  return {
    scope,
    host,
    port,
    database,
    safeTarget: `host=${host} port=${port} database=${database}`,
  };
}

export function targetConfirmation(target, identity) {
  if (!targetConfirmPrefixes[target.scope]) return "";
  const targetID = shortHash(
    [
      target.scope,
      target.host,
      target.port,
      target.database,
      identity.database,
      identity.user,
      identity.systemIdentifier,
    ].join("\n"),
    20,
  );
  return {
    targetID,
    value: `${targetConfirmPrefixes[target.scope]}${targetID}`,
  };
}

export function migrationPlanID({
  targetID,
  migrationHash,
  currentVersion,
  pendingVersions,
}) {
  return shortHash(
    [targetID, migrationHash, currentVersion, ...pendingVersions].join("\n"),
    24,
  );
}

export function applyConfirmation(planID) {
  return `${applyConfirmPrefix}${planID}`;
}

export function maintenanceConfirmation(planID) {
  return `${maintenanceConfirmPrefix}${planID}`;
}

export function classifyFailedApply(before, after) {
  if (!after) return "committed_unverified";
  const beforeResult = evaluateMigrationStatus(before);
  const afterResult = evaluateMigrationStatus(after);
  const beforeVersions = statusVersions(before);
  const afterVersions = statusVersions(after);
  const unchanged =
    beforeResult.currentVersion === afterResult.currentVersion &&
    beforeResult.appliedFiles === afterResult.appliedFiles &&
    beforeResult.pendingFiles === afterResult.pendingFiles &&
    beforeVersions.pendingVersions.join("\n") ===
      afterVersions.pendingVersions.join("\n");
  return unchanged
    ? "apply_failed_no_revision_advance"
    : "committed_unverified";
}

function maskDollarQuotedBodies(source) {
  let masked = String(source || "");
  const delimiterPattern = /\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/gu;
  let searchFrom = 0;
  while (searchFrom < masked.length) {
    delimiterPattern.lastIndex = searchFrom;
    const opening = delimiterPattern.exec(masked);
    if (!opening) break;
    const delimiter = opening[0];
    const closingIndex = masked.indexOf(
      delimiter,
      opening.index + delimiter.length,
    );
    if (closingIndex < 0) break;
    const end = closingIndex + delimiter.length;
    masked =
      masked.slice(0, opening.index) +
      " ".repeat(end - opening.index) +
      masked.slice(end);
    searchFrom = end;
  }
  return masked;
}

export function unsafeRehearsalReason(source) {
  const visible = maskDollarQuotedBodies(source)
    .replace(/\/\*[\s\S]*?\*\//gu, " ")
    .replace(/--[^\n]*/gu, " ");
  const checks = [
    [/\b(?:CREATE|DROP)\s+INDEX\s+CONCURRENTLY\b/iu, "concurrent index"],
    [/\bVACUUM\b/iu, "VACUUM"],
    [/\b(?:CREATE|DROP)\s+DATABASE\b/iu, "database DDL"],
    [/\bALTER\s+SYSTEM\b/iu, "ALTER SYSTEM"],
    [/\bCOPY\b[\s\S]{0,500}\bPROGRAM\b/iu, "COPY PROGRAM"],
    [/\b(?:nextval|setval)\s*\(/iu, "sequence mutation"],
    [/\bALTER\s+SEQUENCE\b[\s\S]{0,300}\bRESTART\b/iu, "sequence restart"],
    [
      /\b(?:lo_import|lo_export|dblink|pg_notify)\s*\(/iu,
      "external side effect",
    ],
    [/^\s*(?:COMMIT|ROLLBACK|END\s+TRANSACTION)\b/imu, "transaction control"],
  ];
  return checks.find(([pattern]) => pattern.test(visible))?.[1] || "";
}

export function redactMigrationDiagnostic(value) {
  return String(value || "")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s'"`]+/giu, "<database-url-redacted>")
    .replace(
      /\b(?:DB_URL|POSTGRES_DSN|SOURCE_POSTGRES_DSN|LOCAL_DATABASE_URL)\s*=\s*(?:'[^']*'|"[^"]*"|[^\s]+)/giu,
      "<database-environment-redacted>",
    )
    .replace(/\bpassword=[^\s&]+/giu, "password=<redacted>")
    .replace(
      /\b(?:MIGRATE_(?:TARGET_CONFIRM|CONFIRM|MAINTENANCE_CONFIRM|OPERATION_CONFIRM)|LOCAL_MIGRATION_(?:TARGET_CONFIRM|CONFIRM|MAINTENANCE_CONFIRM|OPERATION_CONFIRM))\s*=\s*(?:'[^']*'|"[^"]*"|[^\s]+)/giu,
      "<confirmation-redacted>",
    )
    .replace(
      /\b(?:TRUST_LOCAL_DATABASE|TRUST_SHARED_DEV_DATABASE|APPLY_DEV_MIGRATIONS|SHARED_DEV_MAINTENANCE_READY):[A-Za-z0-9_-]+/gu,
      "<confirmation-redacted>",
    )
    .replace(/升级共享开发库:[^\s'"`]+/gu, "<operation-confirmation-redacted>");
}

function commandDetails(result) {
  return [result?.stdout, result?.stderr]
    .map((value) => redactMigrationDiagnostic(value).trim())
    .filter(Boolean)
    .join("\n");
}

async function runCommand(command, args, options = {}) {
  try {
    return await execFileAsync(command, args, {
      cwd: options.cwd || repoRoot,
      env: options.env || process.env,
      maxBuffer: options.maxBuffer || 16 * 1024 * 1024,
    });
  } catch (error) {
    const details = commandDetails(error);
    throw new MigrationCommandError(
      details
        ? `${options.failureMessage}\n${details}`
        : options.failureMessage,
    );
  }
}

async function runCommandWithInput(command, args, input, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || repoRoot,
      env: options.env || process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", () => {
      reject(new MigrationCommandError(options.failureMessage));
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const details = commandDetails({ stdout, stderr });
      reject(
        new MigrationCommandError(
          details
            ? `${options.failureMessage}\n${details}`
            : options.failureMessage,
        ),
      );
    });
    child.stdin.end(input);
  });
}

async function resolveDatabaseURL() {
  const explicitURL = String(process.env.DB_URL || "").trim();
  const useExplicitURL =
    String(process.env.USE_ENV_DB_URL || "").trim() === "1";
  if (useExplicitURL && explicitURL) {
    process.stdout.write(
      "[migration] USE_ENV_DB_URL=1；使用当前命令环境的 DB_URL\n",
    );
    return { databaseURL: explicitURL, source: "environment" };
  }
  if (explicitURL) {
    process.stdout.write(
      "[migration] DB_URL 已设置但默认忽略；只有 USE_ENV_DB_URL=1 才会使用\n",
    );
  }

  const source = String(process.env.POSTGRES_DSN || "").trim()
    ? "environment"
    : "application-config";
  const result = await runCommand(
    "go",
    ["run", "./cmd/dburl", "-conf", "./configs/dev/config.yaml"],
    {
      cwd: serverRoot,
      failureMessage:
        "无法解析开发数据库配置；请检查 config.local.yaml 或当前命令环境",
    },
  );
  const databaseURL = String(result.stdout || "").trim();
  if (!databaseURL) {
    throw new MigrationCommandError("开发数据库 URL 为空");
  }
  return { databaseURL, source };
}

function snapshotMigrations() {
  const tempRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "plush-local-migration-"),
  );
  const snapshotDir = path.join(tempRoot, "migrate");
  fs.cpSync(migrationDir, snapshotDir, {
    recursive: true,
    dereference: false,
    errorOnExist: true,
  });
  const entries = fs
    .readdirSync(snapshotDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  const hash = crypto.createHash("sha256");
  for (const name of entries) {
    hash.update(name);
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(snapshotDir, name)));
    hash.update("\0");
  }
  return {
    tempRoot,
    snapshotDir,
    directoryURL: pathToFileURL(snapshotDir).href,
    hash: hash.digest("hex"),
  };
}

function removeSnapshot(snapshot) {
  fs.rmSync(snapshot.tempRoot, { recursive: true, force: true });
}

async function runWorkspaceGuard() {
  await runCommand("bash", [path.join(repoRoot, "scripts/qa/db-guard.sh")], {
    cwd: repoRoot,
    env: { ...process.env, SKIP_DB_GUARD: "" },
    failureMessage:
      "工作区 schema 与 versioned migration 不一致；未读取或修改数据库 migration",
  });
  process.stdout.write("[migration] 工作区 schema/migration 守卫通过\n");
}

async function readIdentity(databaseURL) {
  const result = await runCommand(
    "psql",
    [
      "-X",
      "--no-psqlrc",
      "-At",
      "-F",
      "\t",
      "--dbname",
      databaseURL,
      "-c",
      "SELECT current_database(), current_user, (SELECT system_identifier::text FROM pg_control_system()), COALESCE(inet_server_addr()::text, '')",
    ],
    {
      cwd: serverRoot,
      failureMessage: "无法读取 PostgreSQL cluster identity；未执行 migration",
    },
  );
  const [database, user, systemIdentifier, serverAddress] = String(
    result.stdout || "",
  )
    .trim()
    .split("\t");
  if (!database || !systemIdentifier) {
    throw new MigrationCommandError(
      "PostgreSQL cluster identity 不完整；未执行 migration",
    );
  }
  return { database, user, systemIdentifier, serverAddress };
}

async function readOtherSessionCount(databaseURL) {
  const result = await runCommand(
    "psql",
    [
      "-X",
      "--no-psqlrc",
      "-At",
      "--dbname",
      databaseURL,
      "-c",
      "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND backend_type = 'client backend'",
    ],
    {
      cwd: serverRoot,
      failureMessage: "无法读取其它数据库会话；未执行 migration",
    },
  );
  const count = Number.parseInt(String(result.stdout || "").trim(), 10);
  if (!Number.isInteger(count) || count < 0) {
    throw new MigrationCommandError("其它数据库会话计数无法识别");
  }
  return count;
}

async function validateSnapshot(snapshot) {
  await runCommand(
    "atlas",
    ["migrate", "validate", "--dir", snapshot.directoryURL],
    {
      cwd: serverRoot,
      failureMessage: "Atlas migration 目录校验失败",
    },
  );
}

async function readMigrationStatus(databaseURL, snapshot) {
  const result = await runCommand(
    "atlas",
    [
      "migrate",
      "status",
      "--dir",
      snapshot.directoryURL,
      "--url",
      databaseURL,
      "--format",
      "{{ json . }}",
    ],
    {
      cwd: serverRoot,
      failureMessage: "无法读取 Atlas migration 状态；未执行 migration",
    },
  );
  try {
    return JSON.parse(String(result.stdout || ""));
  } catch {
    throw new MigrationCommandError(
      "Atlas migration 状态输出无法识别；未执行 migration",
    );
  }
}

export function normalizeSchemaDiffOutput(output) {
  const normalized = String(output || "").trim();
  if (
    !normalized ||
    normalized === "Schemas are synced, no changes to be made."
  ) {
    return "";
  }
  return normalized;
}

async function runSchemaReadback(databaseURL) {
  const target = new URL(databaseURL);
  target.searchParams.set("search_path", "public");
  const result = await runCommand(
    "atlas",
    [
      "schema",
      "diff",
      "--from",
      target.toString(),
      "--to",
      "ent://internal/data/model/schema",
      "--dev-url",
      "docker://postgres/18/dev?search_path=public",
      "--exclude",
      "atlas_schema_revisions",
    ],
    {
      cwd: serverRoot,
      failureMessage:
        "apply 后 Ent / PostgreSQL schema 读回失败；migration 已可能提交，结果为 committed_unverified",
    },
  );
  const drift = normalizeSchemaDiffOutput(result.stdout);
  if (drift) {
    const bounded =
      drift.length > 4000 ? `${drift.slice(0, 4000)}\n...` : drift;
    throw new MigrationCommandError(
      `apply 后 Ent / PostgreSQL schema 仍有差异；migration 已提交但不能视为完成，结果为 committed_unverified\n${bounded}`,
    );
  }
  process.stdout.write(
    "[migration] Ent / PostgreSQL schema 同目标读回零差异\n",
  );
  const programmability = await runCommand(
    "node",
    [
      path.join(repoRoot, "scripts/qa/database-programmability.mjs"),
      "--database-url-env",
      "PLUSH_DATABASE_PROGRAMMABILITY_URL",
    ],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        PLUSH_DATABASE_PROGRAMMABILITY_URL: databaseURL,
      },
      failureMessage:
        "apply 后数据库仍含自定义 Function、Procedure 或非内部 Trigger；migration 已可能提交，结果为 committed_unverified",
    },
  );
  if (programmability.stdout) {
    process.stdout.write(programmability.stdout);
  }
}

function statusVersions(status) {
  const applied = Array.isArray(status?.Applied) ? status.Applied : [];
  const available = Array.isArray(status?.Available) ? status.Available : [];
  const appliedVersions = new Set(
    applied.map((entry) => String(entry?.Version || "")),
  );
  return {
    appliedVersions,
    pendingVersions: available
      .map((entry) => String(entry?.Version || ""))
      .filter((version) => version && !appliedVersions.has(version)),
  };
}

async function runExistingUpgradeAudits(databaseURL) {
  for (const audit of ["populated-upgrade", "customer-config-cutover"]) {
    const result = await runCommand(
      "sh",
      [
        path.join(repoRoot, "scripts/qa/populated-upgrade-preflight.sh"),
        "--audit",
        audit,
        "--database-url-env",
        "POPULATED_UPGRADE_DATABASE_URL",
      ],
      {
        cwd: repoRoot,
        env: {
          ...process.env,
          POPULATED_UPGRADE_DATABASE_URL: databaseURL,
        },
        failureMessage: `既有 ${audit} 只读审计失败；未执行 migration`,
      },
    );
    if (result.stdout) process.stdout.write(result.stdout);
  }
}

async function runLifecycleAudit(databaseURL, status) {
  const { appliedVersions, pendingVersions } = statusVersions(status);
  if (
    !appliedVersions.has(stagedLifecycleVersion) ||
    !pendingVersions.includes(lifecyclePreflightVersion)
  ) {
    return;
  }
  const sql = fs.readFileSync(
    path.join(
      repoRoot,
      "scripts/qa/operational-fact-lifecycle-20260726173943.sql",
    ),
    "utf8",
  );
  const result = await runCommandWithInput(
    "psql",
    ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", databaseURL],
    sql,
    {
      cwd: serverRoot,
      failureMessage:
        "operational fact lifecycle 只读审计失败；没有自动填充操作者，也未执行 migration",
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stdout.write(result.stderr);
}

function pendingSQL(snapshot, pendingVersions) {
  const files = fs
    .readdirSync(snapshot.snapshotDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  return pendingVersions.map((version) => {
    const matches = files.filter((name) => name.startsWith(`${version}_`));
    if (matches.length !== 1) {
      throw new MigrationCommandError(
        `pending migration ${version} 未唯一匹配 SQL 文件`,
      );
    }
    const source = fs.readFileSync(
      path.join(snapshot.snapshotDir, matches[0]),
      "utf8",
    );
    const unsafe = unsafeRehearsalReason(source);
    if (unsafe) {
      throw new MigrationCommandError(
        `pending migration ${matches[0]} 包含不能安全回滚预演的 ${unsafe}；需要专项迁移方案`,
      );
    }
    return `\n-- rehearsal: ${matches[0]}\n${source}\n`;
  });
}

async function runDryRun(databaseURL, snapshot) {
  const result = await runCommand(
    "atlas",
    [
      "migrate",
      "apply",
      "--dry-run",
      "--tx-mode",
      "all",
      "--dir",
      snapshot.directoryURL,
      "--url",
      databaseURL,
    ],
    {
      cwd: serverRoot,
      failureMessage: "Atlas migration dry-run 失败；未执行 migration",
    },
  );
  process.stdout.write(result.stdout || "");
}

async function runRollbackRehearsal(databaseURL, snapshot, pendingVersions) {
  const migrations = pendingSQL(snapshot, pendingVersions);
  const sql = [
    "BEGIN;",
    "SET LOCAL lock_timeout = '5s';",
    "SET LOCAL statement_timeout = '120s';",
    ...migrations,
    databaseProgrammabilityReceiptSQL,
    "ROLLBACK;",
    "",
  ].join("\n");
  const result = await runCommandWithInput(
    "psql",
    ["-X", "--no-psqlrc", "--set", "ON_ERROR_STOP=1", "--dbname", databaseURL],
    sql,
    {
      cwd: serverRoot,
      failureMessage:
        "pending migration 事务回滚预演失败；事务已回滚，未保留 schema 或数据变更",
    },
  );
  if (!/\bROLLBACK\b/u.test(result.stdout || "")) {
    throw new MigrationCommandError(
      "migration 预演没有取得 ROLLBACK 回执；未执行正式 apply",
    );
  }
  if (
    !/database_programmability=0\|0\|0/u.test(result.stdout || "")
  ) {
    throw new MigrationCommandError(
      "pending migration 预演后仍存在自定义 Function、Procedure 或非内部 Trigger；事务已回滚，未执行正式 apply",
    );
  }
  process.stdout.write(
    `[migration] ${pendingVersions.length} 条 pending migration 事务预演通过并已 ROLLBACK\n`,
  );
}

function assertTrustedTarget(target) {
  if (target.scope !== "untrusted") return;
  throw new MigrationCommandError(
    "当前目标不是项目登记的开发数据库；未登记远程库、环境变量覆盖的共享库、SSH tunnel、测试和生产目标必须走正式发布流程",
  );
}

async function prepare(command, receipt) {
  receipt.update({ phase: "workspace_guard" });
  await runWorkspaceGuard();
  receipt.update({ phase: "target_resolution" });
  const resolved = await resolveDatabaseURL();
  const target = classifyDevelopmentTarget(
    resolved.databaseURL,
    resolved.source,
  );
  receipt.update({ target, phase: "target_identity" });
  const identity = await readIdentity(resolved.databaseURL);
  if (identity.database !== target.database) {
    throw new MigrationCommandError(
      `配置数据库与实际连接数据库不一致（configured=${target.database}, connected=${identity.database}）`,
    );
  }
  if (
    target.scope === "shared-dev" &&
    identity.systemIdentifier !== registeredSharedDevSystemIdentifier
  ) {
    throw new MigrationCommandError(
      "登记共享开发库的 PostgreSQL cluster identity 不匹配；未执行 migration，集群重建后必须先专项核验并更新项目登记值",
    );
  }
  const confirmation = targetConfirmation(target, identity);
  receipt.update({ phase: "status" });
  const snapshot = snapshotMigrations();
  try {
    await validateSnapshot(snapshot);
    const status = await readMigrationStatus(resolved.databaseURL, snapshot);
    const evaluated = evaluateMigrationStatus(status);
    const versions = statusVersions(status);
    receipt.update({ status: evaluated });
    process.stdout.write(
      `[migration] target=${target.scope} ${target.safeTarget}\n`,
    );
    process.stdout.write(
      `[migration] current=${evaluated.currentVersion || "none"} latest=${evaluated.latestVersion || "none"} applied=${evaluated.appliedFiles}/${evaluated.availableFiles} pending=${evaluated.pendingFiles}\n`,
    );
    if (target.scope === "untrusted") {
      process.stdout.write(
        "[migration] 该目标只允许 status；plan/apply 必须走正式发布流程\n",
      );
    } else {
      process.stdout.write(
        `[migration] MIGRATE_TARGET_CONFIRM=${confirmation.value}\n`,
      );
    }
    return {
      command,
      resolved,
      target,
      identity,
      confirmation,
      snapshot,
      status,
      evaluated,
      versions,
      workflowHash: workflowFingerprint(),
    };
  } catch (error) {
    removeSnapshot(snapshot);
    throw error;
  }
}

async function runPreflight(context, receipt) {
  const { resolved, target, snapshot, status, versions } = context;
  receipt.update({ phase: "preflight" });
  await runExistingUpgradeAudits(resolved.databaseURL);
  await runLifecycleAudit(resolved.databaseURL, status);
  const otherSessions = await readOtherSessionCount(resolved.databaseURL);
  process.stdout.write(`[migration] other_client_sessions=${otherSessions}\n`);
  if (target.scope === "shared-dev" && otherSessions > 0) {
    throw new MigrationCommandError(
      "共享开发库仍有其它 client session；先运行 make dev_stop，并关闭 DbGate/其它 writer 后重新 plan",
    );
  }
  await runDryRun(resolved.databaseURL, snapshot);
  await runRollbackRehearsal(
    resolved.databaseURL,
    snapshot,
    versions.pendingVersions,
  );
}

async function runStatus(receipt) {
  const context = await prepare("status", receipt);
  removeSnapshot(context.snapshot);
  receipt.finish({
    phase: "status",
    result: "passed",
    writes: "0",
    apply: "not_requested",
    nextAction:
      context.evaluated.pendingFiles === 0 ? "none" : "run_make_migrate",
  });
}

async function runPlan(receipt) {
  const context = await prepare("plan", receipt);
  let terminal;
  try {
    assertTrustedTarget(context.target);
    receipt.update({ phase: "confirmation" });
    const suppliedTargetConfirmation = String(
      process.env.LOCAL_MIGRATION_TARGET_CONFIRM || "",
    ).trim();
    if (suppliedTargetConfirmation !== context.confirmation.value) {
      throw new MigrationCommandError(
        "migrate_plan 是编排器使用的低层目标，缺少当前 status 对应的目标确认。共享开发库交互终端请运行 make migrate，非交互环境请运行 make migrate_prepare",
        {
          result: "action_required",
          errorCode: "target_confirmation_required",
          nextAction: "run_make_migrate_prepare",
        },
      );
    }
    if (context.evaluated.pendingFiles === 0) {
      process.stdout.write("[migration] 数据库已是最新版本，无需 apply\n");
      terminal = {
        phase: "status",
        result: "up_to_date",
        writes: "0",
        apply: "skipped",
        nextAction: "none",
      };
      return;
    }
    await runPreflight(context, receipt);
    const planID = migrationPlanID({
      targetID: context.confirmation.targetID,
      migrationHash: `${context.snapshot.hash}\n${context.workflowHash}`,
      currentVersion: context.evaluated.currentVersion,
      pendingVersions: context.versions.pendingVersions,
    });
    process.stdout.write("[migration] plan=complete writes=0\n");
    process.stdout.write(
      `[migration] MIGRATE_CONFIRM=${applyConfirmation(planID)}\n`,
    );
    if (context.target.scope === "shared-dev") {
      process.stdout.write(
        `[migration] MIGRATE_MAINTENANCE_CONFIRM=${maintenanceConfirmation(planID)}\n`,
      );
      process.stdout.write(
        "[migration] apply 前必须完成备份，并保持本仓库后端、DbGate 与其它 writer 停止\n",
      );
    }
    terminal = {
      phase: "ready",
      result: "ready",
      writes: "0",
      apply: "not_started",
      nextAction: "run_make_migrate_execute",
    };
  } finally {
    removeSnapshot(context.snapshot);
    if (terminal) receipt.finish(terminal);
  }
}

async function runApply(receipt) {
  const context = await prepare("apply", receipt);
  let terminal;
  try {
    assertTrustedTarget(context.target);
    if (context.evaluated.pendingFiles === 0) {
      receipt.update({ phase: "schema_readback" });
      await runSchemaReadback(context.resolved.databaseURL);
      process.stdout.write(
        `[migration] applied_verified current=${context.evaluated.currentVersion} applied=${context.evaluated.appliedFiles}/${context.evaluated.availableFiles} pending=0\n`,
      );
      terminal = {
        phase: "schema_readback",
        result: "up_to_date",
        writes: "0",
        apply: "skipped",
        nextAction: "none",
      };
      return;
    }
    const planID = migrationPlanID({
      targetID: context.confirmation.targetID,
      migrationHash: `${context.snapshot.hash}\n${context.workflowHash}`,
      currentVersion: context.evaluated.currentVersion,
      pendingVersions: context.versions.pendingVersions,
    });
    const expectedApply = applyConfirmation(planID);
    receipt.update({ phase: "confirmation" });
    if (
      String(process.env.LOCAL_MIGRATION_CONFIRM || "").trim() !== expectedApply
    ) {
      throw new MigrationCommandError(
        "migrate_apply 是编排器使用的低层目标，缺少与当前目标、pending revisions 和 migration hash 完全一致的 MIGRATE_CONFIRM；共享开发库交互终端请运行 make migrate，非交互环境请运行 make migrate_prepare",
        {
          result: "action_required",
          errorCode: "apply_confirmation_required",
          nextAction: "run_make_migrate_prepare",
        },
      );
    }
    if (
      context.target.scope === "shared-dev" &&
      String(process.env.LOCAL_MIGRATION_MAINTENANCE_CONFIRM || "").trim() !==
        maintenanceConfirmation(planID)
    ) {
      throw new MigrationCommandError(
        "共享开发库低层 apply 缺少当前 plan 的备份/停写维护确认；日常请改用 make migrate，非交互环境使用 migrate_prepare / migrate_execute",
        {
          result: "action_required",
          errorCode: "maintenance_confirmation_required",
          nextAction: "run_make_migrate_prepare",
        },
      );
    }

    await runPreflight(context, receipt);
    receipt.update({ phase: "source_verification" });
    if (workflowFingerprint() !== context.workflowHash) {
      throw new MigrationCommandError(
        "migration 包装器、Makefile 或只读审计在 apply 检查期间发生变化；未执行正式 apply，请重新 plan",
      );
    }
    try {
      receipt.update({
        phase: "apply",
        writes: "unknown",
        apply: "attempted_once",
      });
      await runCommand(
        "atlas",
        [
          "migrate",
          "apply",
          "--tx-mode",
          "all",
          "--dir",
          context.snapshot.directoryURL,
          "--url",
          context.resolved.databaseURL,
        ],
        {
          cwd: serverRoot,
          failureMessage:
            "Atlas migration apply 失败；tx-mode=all 已要求整批事务，禁止自动重试或 migrate_set",
        },
      );
    } catch (applyError) {
      let postStatus = null;
      let statusError = null;
      try {
        postStatus = await readMigrationStatus(
          context.resolved.databaseURL,
          context.snapshot,
        );
      } catch (error) {
        statusError = error;
      }
      const outcome = classifyFailedApply(context.status, postStatus);
      const suffix = statusError
        ? `\npost-status 无法证明：${statusError.message}`
        : "";
      throw new MigrationCommandError(
        `${applyError.message}\n[migration] outcome=${outcome}${suffix}`,
        outcome === "apply_failed_no_revision_advance"
          ? {
              phase: "apply",
              result: "failed",
              writes: "0",
              apply: "attempted_once",
              errorCode: "apply_failed_no_revision_advance",
              nextAction: "run_status_then_reprepare",
            }
          : {
              phase: "apply",
              result: "not_proven",
              writes: "unknown",
              apply: "attempted_once",
              errorCode: "migration_outcome_unknown",
              nextAction: "run_status_no_auto_retry",
            },
      );
    }
    receipt.update({
      phase: "status_readback",
      writes: "committed",
      apply: "executed_once",
    });
    const postStatus = await readMigrationStatus(
      context.resolved.databaseURL,
      context.snapshot,
    );
    const post = evaluateMigrationStatus(postStatus);
    if (!post.ok) {
      throw new MigrationCommandError(
        `Atlas apply 返回后 status 未到最新版本（applied=${post.appliedFiles}/${post.availableFiles}, pending=${post.pendingFiles}）；不得视为完成`,
        {
          phase: "status_readback",
          result: "not_proven",
          writes: "committed",
          apply: "executed_once",
          errorCode: "migration_readback_failed",
          nextAction: "run_status_no_auto_retry",
        },
      );
    }
    receipt.update({ status: post, phase: "schema_readback" });
    await runSchemaReadback(context.resolved.databaseURL);
    process.stdout.write(
      `[migration] applied_verified current=${post.currentVersion} applied=${post.appliedFiles}/${post.availableFiles} pending=0\n`,
    );
    terminal = {
      phase: "schema_readback",
      result: "passed",
      writes: "committed",
      apply: "executed_once",
      nextAction: "none",
    };
  } finally {
    removeSnapshot(context.snapshot);
    if (terminal) receipt.finish(terminal);
  }
}

function usage() {
  process.stdout.write(`用法:
  cd server && make migrate                 # 共享开发库日常主入口
  cd server && make migrate_prepare         # 非交互显式准备，成功仅表示 ready
  cd server && MIGRATE_OPERATION_ID='<ready 输出>' MIGRATE_OPERATION_CONFIRM='<ready 输出>' make migrate_execute

低层诊断 / 编排入口:
  node scripts/local-migration.mjs status
  node scripts/local-migration.mjs plan
  node scripts/local-migration.mjs apply

Makefile 入口:
  make migrate_status
  MIGRATE_TARGET_CONFIRM='<status 输出>' make migrate_plan
  MIGRATE_CONFIRM='<plan 输出>' MIGRATE_MAINTENANCE_CONFIRM='<共享库 plan 输出>' make migrate_apply
`);
}

function migrationCommandFailure(error, receipt) {
  if (error?.receipt && Object.keys(error.receipt).length > 0) {
    return error.receipt;
  }
  const diagnostic = String(error?.message || "");
  if (/其它 client session|other_client_sessions|DbGate/iu.test(diagnostic)) {
    return {
      phase: "preflight",
      result: "blocked",
      writes: "0",
      apply: "not_started",
      errorCode: "database_clients_active",
      nextAction: "close_database_clients_and_retry",
    };
  }
  if (/确认|MIGRATE_(?:TARGET_)?CONFIRM/iu.test(diagnostic)) {
    return {
      phase: "confirmation",
      result: "action_required",
      writes: "0",
      apply: "not_started",
      errorCode: "confirmation_required",
      nextAction: "run_make_migrate_prepare",
    };
  }
  const defaults = {
    workspace_guard: [
      "blocked",
      "workspace_guard_failed",
      "fix_workspace_and_retry",
    ],
    target_resolution: [
      "failed",
      "target_resolution_failed",
      "fix_database_configuration",
    ],
    target_identity: [
      "blocked",
      "target_identity_failed",
      "verify_database_identity",
    ],
    status: [
      "blocked",
      "migration_status_unavailable",
      "check_database_connection",
    ],
    preflight: [
      "blocked",
      "migration_preflight_failed",
      "resolve_preflight_blockers",
    ],
    source_verification: [
      "blocked",
      "migration_source_changed",
      "run_make_migrate_prepare",
    ],
    apply: [
      "not_proven",
      "migration_outcome_unknown",
      "run_status_no_auto_retry",
    ],
    status_readback: [
      "not_proven",
      "migration_readback_failed",
      "run_status_no_auto_retry",
    ],
    schema_readback: [
      "not_proven",
      "schema_readback_failed",
      "run_status_no_auto_retry",
    ],
  };
  const [result, errorCode, nextAction] = defaults[receipt.phase] || [
    "failed",
    "migration_command_failed",
    "review_error_and_retry",
  ];
  return { result, errorCode, nextAction };
}

async function main() {
  const command = process.argv[2] || "";
  const mode = command === "--help" || command === "-h" ? "help" : command;
  const receipt = createMigrationTerminalReceipt({
    command: `migrate_${mode || "unknown"}`,
    mode: mode || "unknown",
  });
  try {
    if (command === "status") {
      await runStatus(receipt);
    } else if (command === "plan") {
      await runPlan(receipt);
    } else if (command === "apply") {
      await runApply(receipt);
    } else if (command === "--help" || command === "-h") {
      usage();
      receipt.finish({
        phase: "help",
        result: "passed",
        writes: "0",
        apply: "not_requested",
        nextAction: "none",
      });
    } else {
      usage();
      throw new MigrationCommandError(`未知 migration 命令：${command}`);
    }
  } catch (error) {
    receipt.finish(migrationCommandFailure(error, receipt));
    throw error;
  }
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  main().catch((error) => {
    process.stderr.write(
      `[migration] ERROR: ${redactMigrationDiagnostic(error.message)}\n`,
    );
    process.exit(1);
  });
}
