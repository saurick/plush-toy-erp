#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { buildRuntimePreviewManifest } from "./customer-config-runtime-manifest.mjs";
import {
  databaseNameForRun,
  normalizeDatabaseRunID,
  parseDatabaseURL,
  replaceDatabaseName,
} from "./database-target.mjs";
import {
  CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
  CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
  LOCAL_DEV_TARGET,
  MANUAL_ACCEPTANCE_DATASET_KEY,
  manualAcceptanceTargetConfirmation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";
import {
  manualAcceptanceDatasetApplyReportPath,
  runManualAcceptanceDatasetCli,
} from "./manual-acceptance-dataset.mjs";
import { manualAcceptanceDatasetStageReportPath } from "./manual-acceptance-dataset-runner.mjs";
import { runManualAcceptanceCustomerConfig } from "./manual-acceptance-customer-config.mjs";
import { runManualAcceptanceBrowser } from "./manual-acceptance-browser.mjs";
import {
  exceptionFlowConfirmation,
  parseExceptionFlowArgs,
  runExceptionFlowRealWriteBrowser,
} from "./exception-flow-real-write-browser.mjs";

export const LOCAL_ACCEPTANCE_LIFECYCLE_SCHEMA =
  "plush-local-acceptance-lifecycle/v1";
export const LOCAL_ACCEPTANCE_DATABASE_BASE_URL_ENV =
  "LOCAL_ACCEPTANCE_DATABASE_BASE_URL";

const COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const REGISTERED_DATABASE_HOST = "192.168.0.106";
const REGISTERED_DATABASE_PORT = 5432;
const HTTP_TIMEOUT_MS = 15_000;
const SERVICE_READY_TIMEOUT_MS = 180_000;

class LocalAcceptanceLifecycleError extends Error {
  constructor(stage, message) {
    super(message);
    this.name = "LocalAcceptanceLifecycleError";
    this.stage = stage;
  }
}

function redact(value) {
  return String(value || "")
    .replace(
      /postgres(?:ql)?:\/\/[^:\s/@]+:[^@\s]+@/giu,
      "postgres://<redacted>@",
    )
    .replace(
      /\b(password|token|secret)=([^\s&]+)/giu,
      "$1=<redacted>",
    )
    .slice(0, 1200);
}

function safeError(error) {
  return redact(error?.message || error || "unknown failure");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function randomSecret(bytes = 24) {
  return randomBytes(bytes).toString("base64url").slice(0, 20);
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: options.env || process.env,
    maxBuffer: options.maxBuffer || 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    const detail = redact(
      result.stderr || result.stdout || result.error?.message || "",
    )
      .trim()
      .split("\n")[0];
    throw new LocalAcceptanceLifecycleError(
      options.label || command,
      `${options.label || command} failed${detail ? `: ${detail}` : ""}`,
    );
  }
  return String(result.stdout || "");
}

function writePrivateJSON(filePath, value) {
  const absolute = path.resolve(filePath);
  mkdirSync(path.dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(temporary, absolute);
  chmodSync(absolute, 0o600);
  return absolute;
}

function databaseLifecycleConfirmation({
  acceptanceDatabase,
  browserActionsDatabase,
  commit,
}) {
  return [
    "RUN_LOCAL_ACCEPTANCE_LIFECYCLE",
    acceptanceDatabase,
    browserActionsDatabase,
    commit,
  ].join(":");
}

export function buildLocalAcceptanceLifecycleIdentity({
  commit,
  runID,
}) {
  if (!COMMIT_PATTERN.test(String(commit || ""))) {
    throw new Error("local acceptance lifecycle requires an exact 40-character commit");
  }
  const normalizedRunID = normalizeDatabaseRunID(runID);
  const acceptanceDatabase = databaseNameForRun(
    "acceptance",
    normalizedRunID,
  );
  const browserActionsDatabase = databaseNameForRun(
    "browser-actions",
    normalizedRunID,
  );
  return Object.freeze({
    commit,
    runID: normalizedRunID,
    acceptanceDatabase,
    browserActionsDatabase,
    confirmation: databaseLifecycleConfirmation({
      acceptanceDatabase,
      browserActionsDatabase,
      commit,
    }),
  });
}

function recordStage(stages, stage, status, details = {}) {
  stages.push(Object.freeze({ stage, status, ...details }));
}

export async function runLocalAcceptanceLifecycle({
  commit,
  generatedAt = new Date(),
  runID,
  runtime,
}) {
  const identity = buildLocalAcceptanceLifecycleIdentity({ commit, runID });
  if (!runtime) throw new Error("local acceptance lifecycle runtime is required");
  const stages = [];
  const created = new Set();
  let backendStarted = false;
  let webStarted = false;
  let failure = "";
  let dataset = null;
  let manualBrowser = null;
  let exceptionBrowser = null;

  const stage = async (name, action, summarize = () => ({})) => {
    const result = await action();
    recordStage(stages, name, "passed", summarize(result));
    return result;
  };

  try {
    await stage("preflight", () => runtime.preflight(identity), (result) => ({
      sourceClean: result?.sourceClean === true,
      commitVerified: result?.commitVerified === true,
      target: result?.target || "",
    }));
    for (const databaseName of [
      identity.acceptanceDatabase,
      identity.browserActionsDatabase,
    ]) {
      if (await runtime.databaseExists(databaseName)) {
        throw new LocalAcceptanceLifecycleError(
          "preflight",
          `generated database already exists: ${databaseName}`,
        );
      }
    }
    recordStage(stages, "database-preflight", "passed", {
      databaseCount: 2,
    });

    await stage("acceptance-create", async () => {
      await runtime.createDatabase(identity.acceptanceDatabase);
      created.add(identity.acceptanceDatabase);
    });
    await stage(
      "acceptance-migrate",
      () => runtime.migrateDatabase(identity.acceptanceDatabase),
      (result) => ({
        currentMigration: result?.currentMigration || "",
        pending: Number(result?.pending || 0),
      }),
    );
    await stage("backend-start-acceptance", async () => {
      await runtime.startBackend(identity.acceptanceDatabase);
      backendStarted = true;
    });
    await stage(
      "backend-verify-acceptance",
      () => runtime.verifyBackend(identity.acceptanceDatabase),
      (result) => ({
        runtimeIdentityProof: result?.runtimeIdentityProof || "",
      }),
    );
    await stage(
      "customer-config-activate",
      () => runtime.activateCustomerConfig(identity.acceptanceDatabase),
      (result) => ({
        revision: result?.revision || "",
        protocolCount: Number(result?.protocolCount || 0),
      }),
    );
    await stage(
      "core-reference-seed",
      () => runtime.seedCoreReferences(identity.acceptanceDatabase),
      (result) => ({
        units: Number(result?.units || 0),
        warehouses: Number(result?.warehouses || 0),
      }),
    );
    dataset = await stage(
      "manual-dataset-apply",
      () => runtime.applyManualDataset(identity.acceptanceDatabase),
      (result) => ({
        ok: result?.ok === true,
        completedStages: Number(result?.completedStages || 0),
        report: result?.report || "",
      }),
    );
    await stage("web-start", async () => {
      await runtime.startWeb();
      webStarted = true;
    });
    await stage("web-verify", () => runtime.verifyWeb());
    manualBrowser = await stage(
      "manual-browser-readonly",
      () => runtime.runManualBrowser(dataset),
      (result) => ({
        passed: result?.passed === true,
        formalAccounts: Number(result?.formalAccounts || 0),
        mobileAccounts: Number(result?.mobileAccounts || 0),
        pages: Number(result?.pages || 0),
        report: result?.report || "",
      }),
    );

    await stage("backend-stop-before-clone", async () => {
      await runtime.stopBackend();
      backendStarted = false;
    });
    await stage("browser-actions-clone", async () => {
      await runtime.cloneDatabase(
        identity.acceptanceDatabase,
        identity.browserActionsDatabase,
      );
      created.add(identity.browserActionsDatabase);
    });
    await stage("backend-start-browser-actions", async () => {
      await runtime.startBackend(identity.browserActionsDatabase);
      backendStarted = true;
    });
    await stage(
      "backend-verify-browser-actions",
      () => runtime.verifyBackend(identity.browserActionsDatabase),
      (result) => ({
        runtimeIdentityProof: result?.runtimeIdentityProof || "",
      }),
    );
    exceptionBrowser = await stage(
      "exception-browser-real-write",
      () => runtime.runExceptionBrowser(identity.browserActionsDatabase),
      (result) => ({
        passed: result?.passed === true,
        flows: Number(result?.flows || 0),
        report: result?.report || "",
      }),
    );
  } catch (error) {
    failure = safeError(error);
    recordStage(stages, error?.stage || "workflow", "failed", {
      error: failure,
    });
  } finally {
    if (backendStarted) {
      try {
        await runtime.stopBackend();
        backendStarted = false;
        recordStage(stages, "cleanup-stop-backend", "passed");
      } catch (error) {
        const message = safeError(error);
        failure = failure ? `${failure}; cleanup: ${message}` : message;
        recordStage(stages, "cleanup-stop-backend", "failed", {
          error: message,
        });
      }
    }
    if (webStarted) {
      try {
        await runtime.stopWeb();
        webStarted = false;
        recordStage(stages, "cleanup-stop-web", "passed");
      } catch (error) {
        const message = safeError(error);
        failure = failure ? `${failure}; cleanup: ${message}` : message;
        recordStage(stages, "cleanup-stop-web", "failed", {
          error: message,
        });
      }
    }
    for (const databaseName of [
      identity.browserActionsDatabase,
      identity.acceptanceDatabase,
    ]) {
      if (!created.has(databaseName)) continue;
      try {
        await runtime.dropDatabase(databaseName);
        created.delete(databaseName);
        recordStage(stages, `cleanup-drop-${databaseName}`, "passed");
      } catch (error) {
        const message = safeError(error);
        failure = failure ? `${failure}; cleanup: ${message}` : message;
        recordStage(stages, `cleanup-drop-${databaseName}`, "failed", {
          error: message,
          residualDatabase: databaseName,
        });
      }
    }
    for (const databaseName of [
      identity.acceptanceDatabase,
      identity.browserActionsDatabase,
    ]) {
      try {
        if (await runtime.databaseExists(databaseName)) {
          created.add(databaseName);
          const message = `residual database: ${databaseName}`;
          failure = failure ? `${failure}; ${message}` : message;
          recordStage(stages, `cleanup-readback-${databaseName}`, "failed", {
            residualDatabase: databaseName,
          });
        } else {
          created.delete(databaseName);
          recordStage(stages, `cleanup-readback-${databaseName}`, "passed");
        }
      } catch (error) {
        const message = safeError(error);
        failure = failure
          ? `${failure}; cleanup readback: ${message}`
          : `cleanup readback: ${message}`;
        recordStage(stages, `cleanup-readback-${databaseName}`, "failed", {
          error: message,
        });
      }
    }
  }

  const residualDatabases = [...created].sort();
  const passed =
    !failure &&
    residualDatabases.length === 0 &&
    stages.every((item) => item.status === "passed");
  return Object.freeze({
    schemaVersion: LOCAL_ACCEPTANCE_LIFECYCLE_SCHEMA,
    status: passed ? "passed" : "failed",
    generatedAt: new Date(generatedAt).toISOString(),
    completedAt: new Date().toISOString(),
    commit: identity.commit,
    runID: identity.runID,
    databases: Object.freeze({
      acceptance: identity.acceptanceDatabase,
      browserActions: identity.browserActionsDatabase,
    }),
    stages,
    evidence: Object.freeze({
      dataset,
      manualBrowser,
      exceptionBrowser,
    }),
    cleanup: Object.freeze({
      complete: residualDatabases.length === 0,
      residualDatabases,
    }),
    failure,
    boundary: Object.freeze({
      simulatedDataOnly: true,
      realLocalBackend: true,
      realBrowser: true,
      manualBrowserBusinessWrites: false,
      exceptionBrowserBusinessWrites: true,
      sourceDatabaseClonedOnlyAfterBackendStop: true,
      databasesDroppedAfterEvidence: residualDatabases.length === 0,
      targetDeploymentEvidence: false,
      customerUAT: false,
      customerSignoff: false,
      secretsStored: false,
    }),
  });
}

function allocatePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => {
        if (error || !port) reject(error || new Error("missing TCP port"));
        else resolve(port);
      });
    });
  });
}

async function waitFor(check, label, timeoutMs = SERVICE_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new LocalAcceptanceLifecycleError(
    label,
    `${label} timed out${lastError ? `: ${safeError(lastError)}` : ""}`,
  );
}

async function fetchOK(url, expectedText = "") {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  });
  const body = String(await response.text()).trim();
  if (
    response.redirected ||
    !response.ok ||
    (expectedText && body !== expectedText)
  ) {
    throw new Error(`HTTP ${response.status}`);
  }
  return { response, body };
}

function startLoggedService({
  command,
  args,
  cwd,
  env,
  logPath,
  label,
}) {
  mkdirSync(path.dirname(logPath), { recursive: true, mode: 0o700 });
  const descriptor = openSync(logPath, "a", 0o600);
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", descriptor, descriptor],
  });
  child.once("error", () => {
    try {
      closeSync(descriptor);
    } catch {
      // The descriptor may already be closed by the exit handler.
    }
  });
  child.once("exit", () => {
    try {
      closeSync(descriptor);
    } catch {
      // The descriptor may already be closed by the error handler.
    }
  });
  return { child, label, logPath };
}

async function stopLoggedService(handle) {
  if (!handle?.child || handle.child.exitCode !== null) return;
  const child = handle.child;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  const graceful = await Promise.race([
    exited.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 15_000)),
  ]);
  if (!graceful && child.exitCode === null) {
    child.kill("SIGKILL");
    await Promise.race([
      exited,
      new Promise((_, reject) =>
        setTimeout(
          () =>
            reject(
              new LocalAcceptanceLifecycleError(
                handle.label,
                `${handle.label} did not stop`,
              ),
            ),
          10_000,
        ),
      ),
    ]);
  }
}

function atlasStatus(repoRoot, databaseURL) {
  const output = runCommand(
    "atlas",
    [
      "migrate",
      "status",
      "--dir",
      "file://internal/data/model/migrate",
      "--url",
      databaseURL,
      "--format",
      "{{ json . }}",
    ],
    {
      cwd: path.join(repoRoot, "server"),
      label: "Atlas migration status",
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new LocalAcceptanceLifecycleError(
      "Atlas migration status",
      "Atlas migration status returned invalid JSON",
    );
  }
  const pending = Array.isArray(parsed?.Pending)
    ? parsed.Pending.length
    : Number(parsed?.Pending || 0);
  return {
    currentMigration: String(parsed?.Current || ""),
    pending,
  };
}

function exactDatabaseSQLName(databaseName) {
  if (!/^[a-z][a-z0-9_]{0,62}$/u.test(databaseName)) {
    throw new Error("database name is not a safe SQL identifier");
  }
  return `"${databaseName}"`;
}

function relativeRepoPath(repoRoot, filePath) {
  const relative = path.relative(repoRoot, filePath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("evidence path left the repository");
  }
  return relative.split(path.sep).join("/");
}

function createDirectRuntime(context) {
  let backend = null;
  let web = null;
  let activeDatabase = "";

  const databaseURL = (databaseName) =>
    replaceDatabaseName(context.baseDatabaseURL, databaseName, {
      allowRegisteredDevelopment: true,
    });
  const psql = (databaseName, sql, label) =>
    runCommand(
      "psql",
      [
        databaseURL(databaseName),
        "-X",
        "--no-psqlrc",
        "-Atq",
        "-v",
        "ON_ERROR_STOP=1",
        "-c",
        sql,
      ],
      { label },
    ).trim();

  return {
    async preflight(identity) {
      const head = runCommand("git", ["rev-parse", "HEAD"], {
        cwd: context.repoRoot,
        label: "Git HEAD readback",
      }).trim();
      const status = runCommand("git", ["status", "--porcelain"], {
        cwd: context.repoRoot,
        label: "Git source cleanliness",
      }).trim();
      if (head !== identity.commit || status) {
        throw new LocalAcceptanceLifecycleError(
          "preflight",
          "local acceptance lifecycle requires the exact clean requested commit",
        );
      }
      for (const command of ["atlas", "go", "pnpm", "psql"]) {
        runCommand("sh", ["-c", `command -v ${command}`], {
          label: `${command} availability`,
        });
      }
      runCommand(
        "go",
        [
          "build",
          "-ldflags",
          `-X main.Version=${identity.commit}`,
          "-o",
          context.backendBinary,
          "./cmd/server",
        ],
        {
          cwd: path.join(context.repoRoot, "server"),
          label: "acceptance backend build",
        },
      );
      writePrivateJSON(
        context.previewManifest,
        buildRuntimePreviewManifest(yoyoosunCustomerPackage),
      );
      return {
        sourceClean: true,
        commitVerified: true,
        target: `${REGISTERED_DATABASE_HOST}:${REGISTERED_DATABASE_PORT}`,
      };
    },
    async databaseExists(databaseName) {
      return (
        psql(
          "postgres",
          `SELECT count(*) FROM pg_database WHERE datname = '${databaseName}'`,
          "database existence check",
        ) === "1"
      );
    },
    async createDatabase(databaseName) {
      psql(
        "postgres",
        `CREATE DATABASE ${exactDatabaseSQLName(databaseName)}`,
        "acceptance database create",
      );
    },
    async migrateDatabase(databaseName) {
      const url = databaseURL(databaseName);
      atlasStatus(context.repoRoot, url);
      runCommand(
        "atlas",
        [
          "migrate",
          "apply",
          "--tx-mode",
          "all",
          "--dir",
          "file://internal/data/model/migrate",
          "--url",
          url,
        ],
        {
          cwd: path.join(context.repoRoot, "server"),
          label: "acceptance migration apply",
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      const after = atlasStatus(context.repoRoot, url);
      if (!after.currentMigration || after.pending !== 0) {
        throw new LocalAcceptanceLifecycleError(
          "acceptance migration readback",
          "acceptance database migrations are incomplete",
        );
      }
      return after;
    },
    async startBackend(databaseName) {
      if (backend) throw new Error("acceptance backend is already running");
      activeDatabase = databaseName;
      backend = startLoggedService({
        command: context.backendBinary,
        args: ["-conf", "./configs/dev/config.yaml"],
        cwd: path.join(context.repoRoot, "server"),
        env: {
          ...process.env,
          POSTGRES_DSN: databaseURL(databaseName),
          APP_JWT_SECRET: context.jwtSecret,
          APP_ADMIN_USERNAME: "admin",
          APP_ADMIN_PASSWORD: context.adminPassword,
          APP_AUTH_SMS_MODE: "mock",
          ERP_CUSTOMER_KEY: "yoyoosun",
          ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG: "1",
          ERP_DEBUG_ENV: "dev",
          ERP_DEBUG_SEED_ENABLED: "false",
          ERP_DEBUG_CLEANUP_ENABLED: "false",
          ERP_DEBUG_BUSINESS_CLEAR_ENABLED: "false",
          DEV_HTTP_PORT: String(context.httpPort),
          DEV_GRPC_PORT: String(context.grpcPort),
        },
        logPath: path.join(
          context.outputDir,
          `backend-${databaseName}.log`,
        ),
        label: "acceptance backend",
      });
      try {
        await waitFor(async () => {
          if (backend.child.exitCode !== null) {
            throw new Error("acceptance backend exited before readiness");
          }
          await fetchOK(`${context.backendURL}/healthz`, "ok");
          await fetchOK(`${context.backendURL}/readyz`, "ready");
          return true;
        }, "acceptance backend readiness");
      } catch (error) {
        await stopLoggedService(backend).catch(() => {});
        backend = null;
        activeDatabase = "";
        throw error;
      }
    },
    async verifyBackend(databaseName) {
      if (activeDatabase !== databaseName) {
        throw new Error("acceptance backend database binding drifted");
      }
      const digest = sha256(["database-v1", databaseName].join("\n"));
      const response = await fetch(
        `${context.backendURL}/readyz/runtime-identity`,
        {
          redirect: "error",
          headers: {
            Accept: "text/plain",
            "X-ERP-Runtime-Identity-Scope": "database-v1",
            "X-ERP-Expected-Runtime-Identity-SHA256": digest,
          },
          signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        },
      );
      const body = String(await response.text()).trim();
      if (
        response.redirected ||
        !response.ok ||
        body !== "runtime identity matched" ||
        response.headers.get("X-ERP-Runtime-Identity-Proof") !== "matched-v1"
      ) {
        throw new Error("acceptance backend runtime identity did not match");
      }
      return { runtimeIdentityProof: "matched-v1" };
    },
    async activateCustomerConfig(databaseName) {
      const policy = resolveManualAcceptanceTarget({
        backendURL: context.backendURL,
        target: LOCAL_DEV_TARGET,
        datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
        dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
        runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
        databaseName,
      });
      const confirmation = manualAcceptanceTargetConfirmation(policy);
      const result = await runManualAcceptanceCustomerConfig({
        argv: [
          "--apply",
          "--preview-manifest",
          relativeRepoPath(context.repoRoot, context.previewManifest),
          "--out",
          relativeRepoPath(
            context.repoRoot,
            path.join(context.outputDir, "customer-config"),
          ),
          "--backend-url",
          context.backendURL,
          "--target",
          LOCAL_DEV_TARGET,
          "--database-name",
          databaseName,
          "--data-version",
          CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          "--run-id",
          CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
        ],
        env: {
          MANUAL_ACCEPTANCE_TARGET_CONFIRM: confirmation,
          MANUAL_ACCEPTANCE_ADMIN_USERNAME: "admin",
          MANUAL_ACCEPTANCE_ADMIN_PASSWORD: context.adminPassword,
          MANUAL_ACCEPTANCE_PASSWORD: context.rolePassword,
        },
        repoRoot: context.repoRoot,
      });
      if (result.report?.status !== "completed") {
        throw new Error("local customer configuration activation did not complete");
      }
      return {
        revision: result.report.identity?.revision || result.manifest.revision,
        protocolCount: result.report.operations.length,
      };
    },
    async seedCoreReferences(databaseName) {
      const confirmation = [
        "SEED_MANUAL_ACCEPTANCE_CORE_REFERENCES",
        LOCAL_DEV_TARGET,
        databaseName,
        CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
        CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
      ].join(":");
      const output = runCommand(
        "bash",
        [
          "scripts/seed-core-demo-data.sh",
          "--references-only",
          "--expected-database",
          databaseName,
          "--confirm",
          confirmation,
        ],
        {
          cwd: context.repoRoot,
          env: {
            ...process.env,
            POSTGRES_DSN: databaseURL(databaseName),
          },
          label: "manual acceptance core reference seed",
          maxBuffer: 64 * 1024 * 1024,
        },
      );
      if (!/units=1\b/u.test(output) || !/warehouses=4\b/u.test(output)) {
        throw new Error("manual acceptance core reference seed readback failed");
      }
      return { units: 1, warehouses: 4 };
    },
    async applyManualDataset(databaseName) {
      const policy = resolveManualAcceptanceTarget({
        backendURL: context.backendURL,
        target: LOCAL_DEV_TARGET,
        datasetKey: MANUAL_ACCEPTANCE_DATASET_KEY,
        dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
        runId: CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
        databaseName,
      });
      const confirmation = manualAcceptanceTargetConfirmation(policy);
      const result = await runManualAcceptanceDatasetCli(
        [
          "--apply",
          "--target",
          "local",
          "--data-version",
          CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          "--run-id",
          CURRENT_MANUAL_ACCEPTANCE_RUN_ID,
          "--backend-url",
          context.backendURL,
          "--database-name",
          databaseName,
          "--confirm",
          confirmation,
        ],
        {
          outputRoot: context.datasetOutputRoot,
          credentials: {
            rolePassword: context.rolePassword,
            adminPassword: context.adminPassword,
          },
        },
      );
      if (result.exitCode !== 0 || result.report?.ok !== true) {
        throw new Error(
          `manual acceptance dataset failed at ${result.report?.failedStage || "unknown stage"}`,
        );
      }
      return {
        ok: true,
        completedStages: result.report.stages.filter(
          (item) => item.status === "completed",
        ).length,
        report: relativeRepoPath(
          context.repoRoot,
          result.report.applyReportPath,
        ),
      };
    },
    async startWeb() {
      if (web) throw new Error("acceptance web is already running");
      web = startLoggedService({
        command: "pnpm",
        args: ["exec", "vite", "--config", "vite.config.mjs"],
        cwd: path.join(context.repoRoot, "web"),
        env: {
          ...process.env,
          ERP_DEV_CUSTOMER_KEY: "yoyoosun",
          ERP_VITE_PORT: String(context.webPort),
          ERP_VITE_HMR_CLIENT_PORT: String(context.webPort),
          API_ORIGIN: context.backendURL,
        },
        logPath: path.join(context.outputDir, "web.log"),
        label: "acceptance web",
      });
      try {
        await waitFor(async () => {
          if (web.child.exitCode !== null) {
            throw new Error("acceptance web exited before readiness");
          }
          await fetchOK(`${context.webURL}/erp`);
          return true;
        }, "acceptance web readiness");
      } catch (error) {
        await stopLoggedService(web).catch(() => {});
        web = null;
        throw error;
      }
    },
    async verifyWeb() {
      await fetchOK(`${context.webURL}/customer-config.js`);
      await fetchOK(
        `${context.webURL}/customer-assets/yoyoosun/favicon-yoyoosun.svg`,
      );
      return { customerAssets: "passed" };
    },
    async runManualBrowser() {
      const targetRoot = path.join(
        context.datasetOutputRoot,
        CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
        "local",
      );
      const reportPath = path.join(targetRoot, "browser", "report.json");
      const report = await runManualAcceptanceBrowser({
        baseURL: context.webURL,
        backendURL: context.backendURL,
        password: context.rolePassword,
        reportPath,
        sourceReportPath: manualAcceptanceDatasetStageReportPath({
          outputRoot: context.datasetOutputRoot,
          dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          targetAlias: "local",
          stageKey: "source",
        }),
        factReportPath: manualAcceptanceDatasetStageReportPath({
          outputRoot: context.datasetOutputRoot,
          dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          targetAlias: "local",
          stageKey: "facts",
        }),
        readinessReportPath: manualAcceptanceDatasetStageReportPath({
          outputRoot: context.datasetOutputRoot,
          dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          targetAlias: "local",
          stageKey: "readiness",
        }),
        datasetReportPath: manualAcceptanceDatasetApplyReportPath({
          outputRoot: context.datasetOutputRoot,
          dataVersion: CURRENT_MANUAL_ACCEPTANCE_DATA_VERSION,
          targetAlias: "local",
        }),
      });
      return {
        passed: report.summary?.passed === true,
        formalAccounts: report.summary?.formalAccountPassedCount || 0,
        mobileAccounts: report.summary?.formalMobileAccountPassedCount || 0,
        pages: report.summary?.targetPassedCount || 0,
        report: relativeRepoPath(context.repoRoot, reportPath),
      };
    },
    async stopBackend() {
      await stopLoggedService(backend);
      backend = null;
      activeDatabase = "";
    },
    async cloneDatabase(sourceDatabase, targetDatabase) {
      psql(
        "postgres",
        `CREATE DATABASE ${exactDatabaseSQLName(targetDatabase)} TEMPLATE ${exactDatabaseSQLName(sourceDatabase)}`,
        "browser actions database clone",
      );
    },
    async runExceptionBrowser(databaseName) {
      const reportPath = path.join(
        context.outputDir,
        "browser-actions",
        "report.json",
      );
      const env = {
        MANUAL_ACCEPTANCE_DEMO_PASSWORD: context.rolePassword,
        EXCEPTION_FLOW_BROWSER_CONFIRM: exceptionFlowConfirmation({
          backendURL: context.backendURL,
          databaseName,
        }),
      };
      const options = parseExceptionFlowArgs(
        [
          "--base-url",
          context.webURL,
          "--backend-url",
          context.backendURL,
          "--database-name",
          databaseName,
          "--report",
          relativeRepoPath(context.repoRoot, reportPath),
        ],
        env,
      );
      const report = await runExceptionFlowRealWriteBrowser(options);
      if (report.summary?.passed !== true) {
        throw new Error("exception flow browser report did not pass");
      }
      return {
        passed: true,
        flows: report.summary.passedFlowCount,
        report: relativeRepoPath(context.repoRoot, reportPath),
      };
    },
    async stopWeb() {
      await stopLoggedService(web);
      web = null;
    },
    async dropDatabase(databaseName) {
      psql(
        "postgres",
        `DROP DATABASE ${exactDatabaseSQLName(databaseName)} WITH (FORCE)`,
        "acceptance database cleanup",
      );
    },
  };
}

async function buildDirectContext({
  baseDatabaseURL,
  commit,
  out,
  repoRoot,
  runID,
}) {
  const parsed = parseDatabaseURL(baseDatabaseURL, {
    allowRegisteredDevelopment: true,
  });
  if (
    parsed.host !== REGISTERED_DATABASE_HOST ||
    parsed.port !== REGISTERED_DATABASE_PORT
  ) {
    throw new Error(
      `local acceptance lifecycle requires registered development PostgreSQL ${REGISTERED_DATABASE_HOST}:${REGISTERED_DATABASE_PORT}`,
    );
  }
  const identity = buildLocalAcceptanceLifecycleIdentity({ commit, runID });
  const outputDir = path.resolve(
    repoRoot,
    out ||
      path.join(
        "output",
        "qa",
        "local-acceptance-lifecycle",
        identity.runID,
      ),
  );
  const relativeOutput = path.relative(repoRoot, outputDir);
  if (
    !relativeOutput ||
    relativeOutput.startsWith("..") ||
    path.isAbsolute(relativeOutput)
  ) {
    throw new Error("local acceptance lifecycle output must stay in the repository");
  }
  const [httpPort, grpcPort, webPort] = await Promise.all([
    allocatePort(),
    allocatePort(),
    allocatePort(),
  ]);
  if (new Set([httpPort, grpcPort, webPort]).size !== 3 || httpPort === 8300) {
    throw new Error("local acceptance lifecycle could not allocate isolated ports");
  }
  mkdirSync(outputDir, { recursive: true, mode: 0o700 });
  return Object.freeze({
    repoRoot,
    baseDatabaseURL: replaceDatabaseName(baseDatabaseURL, "postgres", {
      allowRegisteredDevelopment: true,
    }),
    outputDir,
    datasetOutputRoot: path.join(
      repoRoot,
      "output",
      "qa",
      "manual-acceptance",
      "datasets",
      "lifecycle",
      identity.runID,
    ),
    previewManifest: path.join(outputDir, "customer-config-preview.json"),
    backendBinary: path.join(outputDir, "plush-acceptance-server"),
    backendURL: `http://127.0.0.1:${httpPort}`,
    webURL: `http://127.0.0.1:${webPort}`,
    httpPort,
    grpcPort,
    webPort,
    adminPassword: randomSecret(),
    rolePassword: randomSecret(),
    jwtSecret: randomBytes(48).toString("base64url"),
  });
}

function parseArgs(argv) {
  const options = {
    commit: "",
    confirm: "",
    execute: false,
    out: "",
    runID: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (["--commit", "--confirm", "--out", "--run-id"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[
        {
          "--commit": "commit",
          "--confirm": "confirm",
          "--out": "out",
          "--run-id": "runID",
        }[arg]
      ] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!options.commit) throw new Error("--commit is required");
  if (!options.runID) throw new Error("--run-id is required");
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const identity = buildLocalAcceptanceLifecycleIdentity(options);
    if (!options.execute) {
      process.stdout.write(
        `${JSON.stringify(
          {
            mode: "plan",
            writesDatabase: false,
            startsServices: false,
            ...identity,
            boundary: {
              registeredDevelopmentPostgresOnly: true,
              isolatedPorts: true,
              automaticCleanup: true,
              customerUAT: false,
            },
          },
          null,
          2,
        )}\n`,
      );
    } else {
      if (options.confirm !== identity.confirmation) {
        throw new Error(`--confirm must equal ${identity.confirmation}`);
      }
      const baseDatabaseURL = String(
        process.env[LOCAL_ACCEPTANCE_DATABASE_BASE_URL_ENV] || "",
      );
      if (!baseDatabaseURL) {
        throw new Error(`${LOCAL_ACCEPTANCE_DATABASE_BASE_URL_ENV} is required`);
      }
      const repoRoot = path.resolve(import.meta.dirname, "../..");
      const context = await buildDirectContext({
        baseDatabaseURL,
        commit: options.commit,
        out: options.out,
        repoRoot,
        runID: options.runID,
      });
      const report = await runLocalAcceptanceLifecycle({
        commit: options.commit,
        runID: options.runID,
        runtime: createDirectRuntime(context),
      });
      const reportPath = writePrivateJSON(
        path.join(context.outputDir, "receipt.json"),
        report,
      );
      process.stdout.write(
        `[local-acceptance-lifecycle] status=${report.status} run=${report.runID} cleanup=${report.cleanup.complete ? "complete" : "failed"} report=${relativeRepoPath(repoRoot, reportPath)}\n`,
      );
      if (report.status !== "passed") process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `[local-acceptance-lifecycle] ${safeError(error)}\n`,
    );
    process.exitCode = 1;
  }
}
