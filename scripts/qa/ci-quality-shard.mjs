#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";
import {
  parseGateStageTimings,
  summarizeGateCategories,
} from "./run-gate-with-receipt.mjs";
import { summarizeGateOutput } from "./dev-workbench-receipt.mjs";
import {
  cleanupPlaywrightRuntime,
  materializePlaywrightRuntime,
} from "./ci-playwright-runtime.mjs";
import { loadCiNodeTestLaneSet } from "./ci-node-test-lane.mjs";
import { loadCiResourceTestLaneSet } from "./ci-resource-test-lane.mjs";
import {
  CI_QUALITY_WORKLOAD_LANE_SCHEMA,
  CI_QUALITY_WORKLOAD_LANES,
  ciQualityWorkloadLaneCommandFingerprint,
  loadCiQualityWorkloadLaneSet,
  parseCompletedTestGates,
  validateCiQualityWorkloadLaneReceipt,
} from "./ci-quality-workload-lane.mjs";

export const CI_QUALITY_SHARD_SCHEMA = "plush.ci-quality-shard/v1";
export const CI_QUALITY_SHARDS = Object.freeze({
  static: Object.freeze({
    job: "quality_static",
    command: Object.freeze([
      "bash",
      "scripts/qa/strict.sh",
      "--ci-shard",
      "static",
    ]),
    stages: Object.freeze([
      "strict_profile",
      "shellcheck",
      "shfmt",
      "yamllint",
    ]),
  }),
  node: Object.freeze({
    job: "quality_node",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-shard",
      "node",
    ]),
    stages: Object.freeze(["secrets", "shared"]),
  }),
  web: Object.freeze({
    job: "quality_web",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "web"]),
    stages: Object.freeze(["web"]),
  }),
  server: Object.freeze({
    job: "quality_server",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-shard",
      "server",
    ]),
    stages: Object.freeze([
      "environment_profile",
      "server",
      "critical_postgres",
    ]),
  }),
  resource: Object.freeze({
    job: "quality_resource",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-shard",
      "resource",
    ]),
    stages: Object.freeze(["resource_sensitive_node"]),
  }),
  browser: Object.freeze({
    job: "quality_browser",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-shard",
      "browser",
    ]),
    stages: Object.freeze(["browser"]),
  }),
  security: Object.freeze({
    job: "quality_security",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-shard",
      "security",
    ]),
    stages: Object.freeze(["govulncheck"]),
  }),
});

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const TAGGED_SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\^)\.\.\.?HEAD$/u;
const MAX_CAPTURE_BYTES = 512 * 1024 * 1024;

export function hasCompleteSourceArchiveLightEvidence(
  report,
  { gitSha, customer },
) {
  return (
    report?.lightCheckPassed === true &&
    report?.repositoryBoundary?.passed === true &&
    report?.commit === gitSha &&
    report?.head === gitSha &&
    report?.refIsHead === true &&
    report?.customer === customer &&
    TAGGED_SHA256_PATTERN.test(String(report?.archiveSha256 || ""))
  );
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function stableSha256(value) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");
}

function safeFailure(error) {
  return String(error?.message || error || "quality shard failed")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/giu, "<redacted-url>")
    .replace(/\/(?:Users|home|builds|private|tmp)\/[^\s]+/gu, "<redacted-path>")
    .slice(0, 500);
}

function runGit(root, args) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error || result.status !== 0) {
    throw new Error(`git ${args[0] || "command"} failed`);
  }
  return String(result.stdout || "").trim();
}

function assertGitLabIdentity(root, shard, lane, env) {
  const definition = lane
    ? CI_QUALITY_WORKLOAD_LANES[shard]?.[lane]
    : CI_QUALITY_SHARDS[shard];
  if (
    !definition ||
    env.GITLAB_CI !== "true" ||
    env.CI_PROJECT_PATH !== "saurick/plush-toy-erp" ||
    env.CI_DEFAULT_BRANCH !== "main" ||
    env.CI_COMMIT_BRANCH !== "main" ||
    env.CI_COMMIT_REF_PROTECTED !== "true" ||
    !["push", "web"].includes(env.CI_PIPELINE_SOURCE) ||
    !SHA_PATTERN.test(String(env.CI_COMMIT_SHA || "")) ||
    !/^\d+$/u.test(String(env.CI_PROJECT_ID || "")) ||
    !/^\d+$/u.test(String(env.CI_PIPELINE_ID || "")) ||
    !/^\d+$/u.test(String(env.CI_PIPELINE_IID || "")) ||
    !/^\d+$/u.test(String(env.CI_JOB_ID || "")) ||
    env.CI_JOB_NAME !== definition.job ||
    env.RELEASE_SHA
  ) {
    throw new Error("quality shard GitLab identity is untrusted");
  }
  if (
    runGit(root, ["rev-parse", "HEAD"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["rev-parse", "origin/main"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ) {
    throw new Error("quality shard requires clean exact protected main");
  }
  return definition;
}

function readPlan(root, planFile, rangeFile) {
  const absolutePlan = path.resolve(root, planFile);
  const absoluteRange = path.resolve(root, rangeFile);
  const plan = JSON.parse(readFileSync(absolutePlan, "utf8"));
  const range = readFileSync(absoluteRange, "utf8").trim();
  if (
    plan?.schemaVersion !== "plush.ci-plan/v2" ||
    plan?.effectiveMode !== "full" ||
    !RANGE_PATTERN.test(range)
  ) {
    throw new Error("quality shard CI plan is invalid");
  }
  return Object.freeze({
    range,
    planSha256: sha256File(absolutePlan),
    rangeSha256: sha256File(absoluteRange),
  });
}

async function runProcess(
  command,
  args,
  { cwd, env, lifecycle = null, stream = true } = {},
) {
  if (lifecycle?.signal) {
    throw new Error(`quality shard interrupted by ${lifecycle.signal}`);
  }
  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (lifecycle) lifecycle.child = child;
  const stdout = [];
  const stderr = [];
  const output = [];
  let capturedBytes = 0;
  let overflow = false;
  const consume = (chunk, values, target) => {
    if (stream) target.write(chunk);
    if (overflow) return;
    capturedBytes += chunk.length;
    if (capturedBytes > MAX_CAPTURE_BYTES) {
      overflow = true;
      return;
    }
    values.push(chunk);
    output.push(chunk);
  };
  child.stdout.on("data", (chunk) => consume(chunk, stdout, process.stdout));
  child.stderr.on("data", (chunk) => consume(chunk, stderr, process.stderr));
  const result = await new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    child.once("error", (error) => finish({ status: null, signal: "", error }));
    child.once("close", (status, signal) =>
      finish({ status, signal: signal || "", error: null }),
    );
  });
  if (lifecycle?.child === child) lifecycle.child = null;
  const value = {
    ...result,
    durationMs: Date.now() - startedAt,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    output: Buffer.concat(output).toString("utf8"),
  };
  if (overflow) {
    const error = new Error("quality shard output exceeded capture limit");
    error.result = value;
    throw error;
  }
  if (lifecycle?.signal) {
    const error = new Error(`quality shard interrupted by ${lifecycle.signal}`);
    error.result = value;
    throw error;
  }
  if (result.error || result.status !== 0) {
    const error =
      result.error ||
      new Error(`${command} exited with status ${String(result.status)}`);
    error.result = value;
    throw error;
  }
  return value;
}

function dockerContainerNames(root, args, spawnSyncFn = spawnSync) {
  const result = spawnSyncFn(
    "docker",
    ["ps", "--all", ...args, "--format", "{{.Names}}"],
    {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.error || result.status !== 0) {
    throw new Error("quality shard Docker control-plane readback failed");
  }
  return String(result.stdout || "")
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function qualityPostgresContainerState({
  root,
  name,
  pipelineId,
  jobId,
  spawnSyncFn = spawnSync,
}) {
  if (
    name !== `plush-ci-postgres-${pipelineId}-${jobId}` ||
    !/^\d+$/u.test(String(pipelineId || "")) ||
    !/^\d+$/u.test(String(jobId || ""))
  ) {
    throw new Error("quality shard PostgreSQL identity is invalid");
  }
  const nameFilter = ["--filter", `name=^/${name}$`];
  const names = dockerContainerNames(root, nameFilter, spawnSyncFn);
  if (names.length === 0) return "absent";
  if (names.length !== 1 || names[0] !== name) {
    throw new Error("quality shard PostgreSQL name readback is ambiguous");
  }
  const owned = dockerContainerNames(
    root,
    [
      ...nameFilter,
      "--filter",
      "label=com.plush.ci.owner=quality-shard",
      "--filter",
      `label=com.plush.ci.pipeline=${pipelineId}`,
      "--filter",
      `label=com.plush.ci.job=${jobId}`,
    ],
    spawnSyncFn,
  );
  if (owned.length === 1 && owned[0] === name) return "owned";
  if (owned.length === 0) return "foreign";
  throw new Error("quality shard PostgreSQL ownership readback is ambiguous");
}

export function cleanupQualityPostgresContainer({
  root,
  name,
  pipelineId,
  jobId,
  spawnSyncFn = spawnSync,
}) {
  const options = { root, name, pipelineId, jobId, spawnSyncFn };
  const state = qualityPostgresContainerState(options);
  if (state === "foreign") {
    throw new Error("quality shard PostgreSQL ownership mismatch");
  }
  if (state === "owned") {
    const removed = spawnSyncFn("docker", ["rm", "--force", name], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (removed.error || removed.status !== 0) {
      throw new Error("quality shard PostgreSQL cleanup failed");
    }
  }
  if (qualityPostgresContainerState(options) !== "absent") {
    throw new Error("quality shard PostgreSQL cleanup readback failed");
  }
  return "passed";
}

function hashDirectory(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink())
        throw new Error("Web build contains a symbolic link");
      if (stat.isDirectory()) {
        walk(absolute);
      } else if (stat.isFile()) {
        entries.push({
          relative,
          mode: stat.mode & 0o777,
          sha256: sha256File(absolute),
        });
      } else {
        throw new Error("Web build contains an unsupported entry");
      }
    }
  };
  walk(root);
  if (entries.length === 0) throw new Error("Web build is empty");
  entries.sort((left, right) => left.relative.localeCompare(right.relative));
  return stableSha256(entries);
}

function verifyBrowserWebBuild(root, expectedLaneIdentity) {
  const webBuild = path.join(root, "web", "build");
  const buildReceiptDirectory = path.join(
    root,
    "output",
    "ci",
    "workload-lanes",
    "web",
  );
  if (
    JSON.stringify(readdirSync(buildReceiptDirectory).sort()) !==
    JSON.stringify(["build.json"])
  ) {
    throw new Error("browser shard Web build receipt directory is ambiguous");
  }
  const buildReceipt = JSON.parse(
    readFileSync(path.join(buildReceiptDirectory, "build.json"), "utf8"),
  );
  validateCiQualityWorkloadLaneReceipt(
    buildReceipt,
    expectedLaneIdentity,
    "web",
    "build",
  );
  const webBuildSha256 = hashDirectory(webBuild);
  if (buildReceipt?.invariants?.webBuildSha256 !== webBuildSha256) {
    throw new Error("browser shard Web build artifact identity mismatch");
  }
  return webBuildSha256;
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function mappedPostgresPort(root, name) {
  const result = spawnSync("docker", ["port", name, "5432/tcp"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const match = /^127\.0\.0\.1:(\d+)$/u.exec(
    String(result.stdout || "").trim(),
  );
  if (result.error || result.status !== 0 || !match) {
    throw new Error("quality shard PostgreSQL port mapping is invalid");
  }
  return Number(match[1]);
}

async function waitForPostgres(root, name, env) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", name],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const health = String(result.stdout || "").trim();
    if (result.status === 0 && health === "healthy") return;
    if (health === "unhealthy")
      throw new Error("quality shard PostgreSQL is unhealthy");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(
    `quality shard PostgreSQL did not become healthy for pipeline ${env.CI_PIPELINE_ID}`,
  );
}

async function materializeChromium(root, childEnv) {
  return materializePlaywrightRuntime({ root, env: childEnv });
}

async function installChromiumSandbox(
  root,
  childEnv,
  sandboxSource,
  sandboxPath,
  lifecycle,
) {
  await runProcess(
    "sudo",
    [
      "install",
      "-o",
      "root",
      "-g",
      "root",
      "-m",
      "4755",
      sandboxSource,
      sandboxPath,
    ],
    { cwd: root, env: childEnv, lifecycle },
  );
}

function balancedCounts(value = {}) {
  return Object.freeze({
    executed: Number(value.executed || 0),
    passed: Number(value.passed || 0),
    failed: Number(value.failed || 0),
    skipped: Number(value.skipped || 0),
  });
}

export async function runCiQualityShard({
  shard,
  lane = "",
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  out = lane
    ? `output/ci/workload-lanes/${shard}/${lane}.json`
    : `output/ci/shards/${shard}.json`,
  root = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
} = {}) {
  const definition = assertGitLabIdentity(root, shard, lane, env);
  const plan = readPlan(root, planFile, rangeFile);
  const expectedLaneIdentity = Object.freeze({
    repository: env.CI_PROJECT_PATH,
    gitSha: env.CI_COMMIT_SHA,
    pipelineId: String(env.CI_PIPELINE_ID),
    pipelineIid: String(env.CI_PIPELINE_IID),
    pipelineSource: env.CI_PIPELINE_SOURCE,
    planSha256: plan.planSha256,
    rangeSha256: plan.rangeSha256,
    range: plan.range,
  });
  const laneDefinition = lane ? CI_QUALITY_WORKLOAD_LANES[shard]?.[lane] : null;
  const startedEpoch = Date.now();
  const startedAt = new Date(startedEpoch).toISOString();
  const childEnv = {
    ...env,
    QA_BASE_RANGE: plan.range,
    QA_DB_GUARD_RANGE: plan.range,
    QA_FULL_PROFILE: "strict",
  };
  if (shard === "node") childEnv.QA_CI_NODE_LANES = "verified";
  if (shard === "resource") childEnv.QA_CI_RESOURCE_LANES = "verified";
  if (shard === "browser") {
    childEnv.QA_BROWSER_SCENARIOS =
      "root-redirect-desktop,root-redirect-mobile,print-center-engineering-preview-tablet";
  }
  let gateOutput = "";
  let failure = null;
  let postgresName = "";
  let postgresCleanupRequired = false;
  let sandboxPath = "";
  let sandboxCleanupRequired = false;
  let runtimeCleanupRequired = false;
  let workloadLanes = null;
  const lifecycle = { child: null, signal: "" };
  const handleSignal = (signal) => {
    if (lifecycle.signal) return;
    lifecycle.signal = signal;
    if (lifecycle.child && !lifecycle.child.killed) {
      lifecycle.child.kill(signal);
    }
  };
  const signalHandlers = Object.freeze({
    SIGINT: () => handleSignal("SIGINT"),
    SIGTERM: () => handleSignal("SIGTERM"),
  });
  process.once("SIGINT", signalHandlers.SIGINT);
  process.once("SIGTERM", signalHandlers.SIGTERM);
  const runOwnedProcess = (command, args, options = {}) =>
    runProcess(command, args, { ...options, lifecycle });
  const invariants = {
    dependencyAudit: shard === "security" ? "pending" : "not-applicable",
    makeData: laneDefinition?.resources.makeData ? "pending" : "not-applicable",
    sourceIntegrity: shard === "node" ? null : "not-applicable",
    databaseCleanup: laneDefinition?.resources.postgres
      ? "pending"
      : "not-applicable",
    chromiumSandboxCleanup:
      laneDefinition?.resources.chromium || shard === "browser"
        ? "pending"
        : "not-applicable",
    playwrightRuntimeCleanup:
      laneDefinition?.resources.chromium || shard === "browser"
        ? "pending"
        : "not-applicable",
    nodeLanes: shard === "node" ? null : "not-applicable",
    resourceLanes: shard === "resource" ? null : "not-applicable",
    workloadLanes:
      !lane && ["web", "server"].includes(shard) ? null : "not-applicable",
    webBuildSha256: null,
    criticalPostgresRegistrySha256:
      shard === "server"
        ? sha256File(
            path.join(root, "scripts", "qa", "critical-postgres-tests.sh"),
          )
        : null,
  };
  try {
    let initialBrowserWebBuildSha256 = "";
    if (shard === "browser") {
      initialBrowserWebBuildSha256 = verifyBrowserWebBuild(
        root,
        expectedLaneIdentity,
      );
    }
    if (
      shard === "node" ||
      shard === "browser" ||
      laneDefinition?.resources.pnpm === true ||
      laneDefinition?.resources.chromium === true
    ) {
      await runOwnedProcess(
        "pnpm",
        ["--dir", "web", "install", "--frozen-lockfile", "--offline"],
        {
          cwd: root,
          env: childEnv,
        },
      );
    }
    if (shard === "browser") {
      const stableWebBuildSha256 = verifyBrowserWebBuild(
        root,
        expectedLaneIdentity,
      );
      if (stableWebBuildSha256 !== initialBrowserWebBuildSha256) {
        throw new Error("browser shard Web build changed during setup");
      }
      invariants.webBuildSha256 = stableWebBuildSha256;
    }
    if (shard === "web" && lane === "build") {
      rmSync(path.join(root, "web", "build"), {
        recursive: true,
        force: true,
      });
    }
    if (laneDefinition?.resources.chromium || shard === "browser") {
      runtimeCleanupRequired = true;
      const chromium = await materializeChromium(root, childEnv);
      sandboxPath = `/usr/local/sbin/chrome-devel-sandbox-${env.CI_JOB_ID}`;
      if (existsSync(sandboxPath)) {
        throw new Error("Chromium sandbox path has stale residue");
      }
      sandboxCleanupRequired = true;
      await installChromiumSandbox(
        root,
        childEnv,
        chromium.sandboxSource,
        sandboxPath,
        lifecycle,
      );
      const sandboxStat = lstatSync(sandboxPath);
      if (
        !sandboxStat.isFile() ||
        sandboxStat.isSymbolicLink() ||
        sandboxStat.uid !== 0 ||
        sandboxStat.gid !== 0 ||
        (sandboxStat.mode & 0o7777) !== 0o4755 ||
        sha256File(sandboxPath) !== sha256File(chromium.sandboxSource)
      ) {
        throw new Error("Chromium sandbox installation identity mismatch");
      }
      childEnv.CHROME_DEVEL_SANDBOX = sandboxPath;
      childEnv.ERP_PDF_CHROME_PATH = chromium.chromePath;
    }
    if (laneDefinition?.resources.postgres) {
      postgresName = `plush-ci-postgres-${env.CI_PIPELINE_ID}-${env.CI_JOB_ID}`;
      const postgresIdentity = {
        root,
        name: postgresName,
        pipelineId: String(env.CI_PIPELINE_ID),
        jobId: String(env.CI_JOB_ID),
      };
      if (qualityPostgresContainerState(postgresIdentity) !== "absent") {
        throw new Error("quality shard PostgreSQL name is not preabsent");
      }
      postgresCleanupRequired = true;
      await runOwnedProcess(
        "docker",
        [
          "run",
          "--detach",
          "--rm",
          "--name",
          postgresName,
          "--label",
          "com.plush.ci.owner=quality-shard",
          "--label",
          `com.plush.ci.pipeline=${env.CI_PIPELINE_ID}`,
          "--label",
          `com.plush.ci.job=${env.CI_JOB_ID}`,
          "--env",
          "POSTGRES_PASSWORD=ci-local-password",
          "--publish",
          "127.0.0.1::5432",
          "--health-cmd",
          "pg_isready -U postgres",
          "--health-interval",
          "2s",
          "--health-timeout",
          "5s",
          "--health-retries",
          "45",
          "postgres:18.1",
        ],
        { cwd: root, env: childEnv },
      );
      if (qualityPostgresContainerState(postgresIdentity) !== "owned") {
        throw new Error("quality shard PostgreSQL ownership is unproven");
      }
      await waitForPostgres(root, postgresName, env);
      const port = mappedPostgresPort(root, postgresName);
      childEnv.DISPOSABLE_DATABASE_BASE_URL = `postgres://postgres:ci-local-password@127.0.0.1:${port}/postgres?sslmode=disable`;
    }
    if (laneDefinition?.resources.makeData) {
      await runOwnedProcess("make", ["data"], {
        cwd: path.join(root, "server"),
        env: childEnv,
      });
      if (runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
        throw new Error("make data changed the exact-SHA checkout");
      }
      invariants.makeData = "passed";
    }
    if (!lane && ["web", "server"].includes(shard)) {
      workloadLanes = loadCiQualityWorkloadLaneSet({
        root,
        expected: expectedLaneIdentity,
        workload: shard,
      });
      invariants.workloadLanes = {
        status: workloadLanes.status,
        workload: workloadLanes.workload,
        laneCount: workloadLanes.laneCount,
        durationMs: workloadLanes.durationMs,
        jobs: workloadLanes.jobs,
        stageIds: workloadLanes.stageIds,
        testGates: workloadLanes.testGates,
        summary: workloadLanes.summary,
        cleanup: workloadLanes.cleanup,
        webBuildSha256: workloadLanes.webBuildSha256,
        criticalPostgresRegistrySha256:
          workloadLanes.criticalPostgresRegistrySha256,
      };
      if (shard === "web") {
        childEnv.QA_CI_WEB_LANES = "verified";
        invariants.webBuildSha256 = workloadLanes.webBuildSha256;
      } else {
        if (
          workloadLanes.criticalPostgresRegistrySha256 !==
          invariants.criticalPostgresRegistrySha256
        ) {
          throw new Error("server lane PostgreSQL registry identity mismatch");
        }
        childEnv.QA_CI_SERVER_LANES = "verified";
        invariants.makeData = "passed";
        invariants.databaseCleanup = "passed";
        invariants.chromiumSandboxCleanup = "passed";
        invariants.playwrightRuntimeCleanup = "passed";
      }
    }
    if (shard === "security") {
      await runOwnedProcess(
        "pnpm",
        [
          "--dir",
          "web",
          "audit",
          "--prod",
          "--audit-level",
          "high",
          "--registry=https://registry.npmjs.org",
        ],
        { cwd: root, env: childEnv },
      );
      invariants.dependencyAudit = "passed";
    }
    if (shard === "node") {
      const lanes = loadCiNodeTestLaneSet({
        root,
        directory: "output/ci/node-lanes",
        expected: {
          repository: env.CI_PROJECT_PATH,
          gitSha: env.CI_COMMIT_SHA,
          pipelineId: String(env.CI_PIPELINE_ID),
          pipelineIid: String(env.CI_PIPELINE_IID),
          pipelineSource: env.CI_PIPELINE_SOURCE,
          planSha256: plan.planSha256,
          rangeSha256: plan.rangeSha256,
          range: plan.range,
        },
      });
      invariants.nodeLanes = {
        status: "passed",
        laneCount: lanes.laneCount,
        testFileCount: lanes.testFileCount,
        durationMs: lanes.durationMs,
        jobs: lanes.jobs,
        executed: lanes.summary.tests,
        passed: lanes.summary.pass,
        failed: lanes.summary.fail,
        skipped: lanes.summary.skipped,
      };
    }
    if (shard === "resource") {
      const lanes = loadCiResourceTestLaneSet({
        root,
        directory: "output/ci/resource-lanes",
        expected: {
          repository: env.CI_PROJECT_PATH,
          gitSha: env.CI_COMMIT_SHA,
          pipelineId: String(env.CI_PIPELINE_ID),
          pipelineIid: String(env.CI_PIPELINE_IID),
          pipelineSource: env.CI_PIPELINE_SOURCE,
          planSha256: plan.planSha256,
          rangeSha256: plan.rangeSha256,
          range: plan.range,
        },
      });
      invariants.resourceLanes = {
        status: "passed",
        laneCount: lanes.laneCount,
        caseCount: lanes.caseCount,
        scenarioCount: lanes.scenarioCount,
        durationMs: lanes.durationMs,
        jobs: lanes.jobs,
        executed: lanes.summary.tests,
        passed: lanes.summary.pass,
        failed: lanes.summary.fail,
        skipped: lanes.summary.skipped,
      };
    }
    const main = await runOwnedProcess(
      definition.command[0],
      definition.command.slice(1),
      {
        cwd: root,
        env: childEnv,
      },
    );
    gateOutput = main.output;
    if (runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
      throw new Error("quality shard changed the exact-SHA checkout");
    }
    if (shard === "web" && lane === "build") {
      invariants.webBuildSha256 = hashDirectory(
        path.join(root, "web", "build"),
      );
    }
    if (shard === "node") {
      const source = await runOwnedProcess(
        process.execPath,
        [
          "scripts/deploy/source-archive-release-check.mjs",
          "--light",
          "--ref",
          "HEAD",
          "--customer",
          "yoyoosun",
          "--json",
        ],
        { cwd: root, env: childEnv, stream: false },
      );
      const report = JSON.parse(source.stdout);
      if (
        !hasCompleteSourceArchiveLightEvidence(report, {
          gitSha: env.CI_COMMIT_SHA,
          customer: "yoyoosun",
        })
      ) {
        throw new Error("source archive light evidence is incomplete");
      }
      invariants.sourceIntegrity = {
        status: "passed",
        archiveSha256: report.archiveSha256,
        inventoryFileCount: Number(report?.inventory?.fileCount || 0),
        repositoryBoundary: "passed",
        overlayCustomer: report.customer,
      };
    }
  } catch (error) {
    failure = error;
    if (error?.result?.output) gateOutput += error.result.output;
  } finally {
    if (postgresCleanupRequired) {
      try {
        invariants.databaseCleanup = cleanupQualityPostgresContainer({
          root,
          name: postgresName,
          pipelineId: String(env.CI_PIPELINE_ID),
          jobId: String(env.CI_JOB_ID),
        });
      } catch {
        invariants.databaseCleanup = "failed";
        if (!failure) {
          failure = new Error("PostgreSQL cleanup readback failed");
        }
      }
    }
    if (sandboxCleanupRequired) {
      const removed = spawnSync(
        "sudo",
        [
          "/usr/local/sbin/plush-remove-chromium-sandbox",
          String(env.CI_JOB_ID),
        ],
        {
          cwd: root,
          stdio: "ignore",
        },
      );
      const residual = existsSync(sandboxPath);
      invariants.chromiumSandboxCleanup =
        removed.status === 0 && !residual ? "passed" : "failed";
      if ((removed.status !== 0 || residual) && !failure) {
        failure = new Error("Chromium sandbox cleanup readback failed");
      }
    }
    const sandboxCleanupBlocksRuntime =
      sandboxCleanupRequired && invariants.chromiumSandboxCleanup !== "passed";
    if (runtimeCleanupRequired && !sandboxCleanupBlocksRuntime) {
      try {
        cleanupPlaywrightRuntime({ root, env: childEnv });
        invariants.playwrightRuntimeCleanup = "passed";
      } catch {
        invariants.playwrightRuntimeCleanup = "failed";
        if (!failure) {
          failure = new Error("Playwright runtime cleanup readback failed");
        }
      }
    }
    process.removeListener("SIGINT", signalHandlers.SIGINT);
    process.removeListener("SIGTERM", signalHandlers.SIGTERM);
  }

  if (lifecycle.signal && !failure) {
    failure = new Error(`quality shard interrupted by ${lifecycle.signal}`);
  }

  const timing = parseGateStageTimings(gateOutput, "strict");
  const actualStageIds = timing.stageTimings.map((stage) => stage.id).sort();
  const expectedStageIds = [...definition.stages].sort();
  if (
    !failure &&
    (JSON.stringify(actualStageIds) !== JSON.stringify(expectedStageIds) ||
      timing.stageTimings.some((stage) => stage.status !== "passed"))
  ) {
    failure = new Error("quality shard stage timing evidence is incomplete");
  }
  const testSummary = summarizeGateOutput(gateOutput);
  const testGates = parseCompletedTestGates(gateOutput);
  const stageCount = timing.stageTimings.length;
  const status = failure ? "failed" : "passed";
  const categoryCounts = Object.fromEntries(
    Object.entries(
      summarizeGateCategories(gateOutput, "strict", timing.stageTimings),
    ).map(([key, value]) => [key, balancedCounts(value)]),
  );
  const finishedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: lane
      ? CI_QUALITY_WORKLOAD_LANE_SCHEMA
      : CI_QUALITY_SHARD_SCHEMA,
    shard,
    ...(lane ? { workload: shard, lane } : {}),
    status,
    repository: env.CI_PROJECT_PATH,
    gitSha: env.CI_COMMIT_SHA,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: {
      id: String(env.CI_PIPELINE_ID),
      iid: String(env.CI_PIPELINE_IID),
      source: env.CI_PIPELINE_SOURCE,
    },
    job: { id: String(env.CI_JOB_ID), name: env.CI_JOB_NAME },
    commandFingerprint: lane
      ? ciQualityWorkloadLaneCommandFingerprint(shard, lane)
      : stableSha256({ shard, definition }),
    plan,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - startedEpoch),
    expectedStages: [...definition.stages],
    stageTimings: timing.stageTimings,
    substepTimings: timing.substepTimings,
    testGates,
    summary: {
      executed: testSummary.executed + stageCount,
      passed:
        status === "passed"
          ? testSummary.passed + stageCount
          : testSummary.passed,
      failed: status === "failed" ? Math.max(1, testSummary.failed) : 0,
      skipped: testSummary.skipped,
    },
    categoryCounts,
    invariants,
    cleanupPassed:
      !["failed", "pending"].includes(invariants.databaseCleanup) &&
      !["failed", "pending"].includes(invariants.chromiumSandboxCleanup) &&
      !["failed", "pending"].includes(invariants.playwrightRuntimeCleanup),
    failure: failure ? safeFailure(failure) : null,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawLogs: false,
    },
  };
  atomicJson(path.resolve(root, out), receipt);
  process.stderr.write(
    `[ci-quality-shard] shard=${shard}${lane ? ` lane=${lane}` : ""} status=${status} receipt=${out}\n`,
  );
  return receipt;
}

function parseArgs(argv) {
  const options = {
    shard: "",
    lane: "",
    planFile: "output/ci/plan.json",
    rangeFile: "output/ci/range.txt",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--shard", "--lane", "--plan", "--range", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--"))
        throw new Error(`${arg} requires a value`);
      const key = {
        "--shard": "shard",
        "--lane": "lane",
        "--plan": "planFile",
        "--range": "rangeFile",
        "--out": "out",
      }[arg];
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!Object.hasOwn(CI_QUALITY_SHARDS, options.shard))
    throw new Error("--shard is invalid");
  if (
    options.lane &&
    !Object.hasOwn(CI_QUALITY_WORKLOAD_LANES[options.shard] || {}, options.lane)
  ) {
    throw new Error("--lane is invalid for the shard");
  }
  options.out ||= options.lane
    ? `output/ci/workload-lanes/${options.shard}/${options.lane}.json`
    : `output/ci/shards/${options.shard}.json`;
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const receipt = await runCiQualityShard(parseArgs(process.argv.slice(2)));
    process.exitCode = receipt.status === "passed" ? 0 : 1;
  } catch (error) {
    process.stderr.write(
      `[ci-quality-shard] status=blocked reason=${safeFailure(error)}\n`,
    );
    process.exitCode = 2;
  }
}
