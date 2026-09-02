#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
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
import { loadDevPorts, resolveDevAuxPort } from "../dev-ports.mjs";
import { summarizeGateOutput } from "./dev-workbench-receipt.mjs";
import {
  cleanupPlaywrightRuntime,
  materializePlaywrightRuntime,
} from "./ci-playwright-runtime.mjs";
import {
  parseGateStageTimings,
  summarizeGateCategories,
} from "./run-gate-with-receipt.mjs";

export const CI_QUALITY_STAGE_LANE_SCHEMA = "plush.ci-quality-stage-lane/v1";

export const CI_WEB_QUALITY_LANES = Object.freeze({
  checks: Object.freeze({
    job: "quality_web_checks",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-lane",
      "web-checks",
    ]),
    stages: Object.freeze(["web"]),
    substeps: Object.freeze(["eslint", "stylelint", "web_test"]),
    requiresTests: true,
    pnpm: true,
    chromium: false,
    postgres: false,
    makeData: false,
    webBuild: false,
  }),
  build: Object.freeze({
    job: "quality_web_build",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-lane",
      "web-build",
    ]),
    stages: Object.freeze(["web"]),
    substeps: Object.freeze(["production_build", "production_boundary"]),
    requiresTests: false,
    pnpm: true,
    chromium: false,
    postgres: false,
    makeData: false,
    webBuild: true,
  }),
});

export const CI_SERVER_QUALITY_LANES = Object.freeze({
  schema: Object.freeze({
    job: "quality_server_schema",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-lane",
      "server-schema",
    ]),
    stages: Object.freeze(["server"]),
    substeps: Object.freeze([]),
    requiresTests: false,
    pnpm: false,
    chromium: false,
    postgres: false,
    makeData: true,
    webBuild: false,
  }),
  upgrade: Object.freeze({
    job: "quality_server_upgrade",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-lane",
      "server-upgrade",
    ]),
    stages: Object.freeze(["environment_profile", "server"]),
    substeps: Object.freeze([]),
    requiresTests: false,
    pnpm: false,
    chromium: false,
    postgres: true,
    makeData: false,
    webBuild: false,
  }),
  test_build: Object.freeze({
    job: "quality_server_test_build",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-lane",
      "server-test-build",
    ]),
    stages: Object.freeze(["server"]),
    substeps: Object.freeze([]),
    requiresTests: true,
    pnpm: false,
    chromium: true,
    postgres: false,
    makeData: false,
    webBuild: false,
  }),
  critical_postgres: Object.freeze({
    job: "quality_server_critical_postgres",
    command: Object.freeze([
      "bash",
      "scripts/qa/full.sh",
      "--ci-lane",
      "server-postgres",
    ]),
    stages: Object.freeze(["critical_postgres"]),
    substeps: Object.freeze([]),
    requiresTests: false,
    pnpm: false,
    chromium: false,
    postgres: true,
    makeData: false,
    webBuild: false,
  }),
});

export const CI_BROWSER_QUALITY_SCENARIOS = Object.freeze([
  "root-redirect-desktop",
  "root-redirect-mobile",
  "print-center-engineering-preview-tablet",
]);

export const CI_BROWSER_QUALITY_LANES = Object.freeze({
  boundary_entry_print: Object.freeze({
    job: "quality_browser_boundary_entry_print",
    command: Object.freeze(["internal", "browser-quality"]),
    stages: Object.freeze(["browser"]),
    substeps: Object.freeze([]),
    requiresTests: true,
    pnpm: true,
    chromium: true,
    postgres: false,
    makeData: false,
    webBuild: false,
    consumesWebBuild: true,
    productionBoundary: true,
    portOffset: 50,
    browserScenarios: Object.freeze([
      "root-redirect-desktop",
      "root-redirect-mobile",
      "print-center-engineering-preview-tablet",
    ]),
  }),
});

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\^)\.\.\.?HEAD$/u;
const MAX_CAPTURE_BYTES = 512 * 1024 * 1024;

export function validateCiBrowserQualityLaneRegistry(
  lanes = CI_BROWSER_QUALITY_LANES,
  expectedScenarios = CI_BROWSER_QUALITY_SCENARIOS,
) {
  const definitions = Object.values(lanes);
  const scenarios = definitions.flatMap((definition) =>
    Array.isArray(definition.browserScenarios)
      ? definition.browserScenarios
      : [],
  );
  const expected = [...expectedScenarios];
  const uniqueScenarios = new Set(scenarios);
  const uniqueOffsets = new Set(
    definitions.map((definition) => definition.portOffset),
  );
  const boundaryOwners = definitions.filter(
    (definition) => definition.productionBoundary === true,
  );
  if (
    definitions.length < 1 ||
    scenarios.length !== uniqueScenarios.size ||
    expected.length !== new Set(expected).size ||
    JSON.stringify([...uniqueScenarios].sort()) !==
      JSON.stringify([...expected].sort()) ||
    uniqueOffsets.size !== definitions.length ||
    definitions.some(
      (definition) =>
        definition.chromium !== true ||
        definition.consumesWebBuild !== true ||
        !Number.isSafeInteger(definition.portOffset) ||
        definition.portOffset < 0 ||
        definition.portOffset > 99 ||
        !Array.isArray(definition.browserScenarios) ||
        definition.browserScenarios.length === 0 ||
        JSON.stringify(definition.browserScenarios) !==
          JSON.stringify(
            expected.filter((scenario) =>
              definition.browserScenarios.includes(scenario),
            ),
          ),
    ) ||
    boundaryOwners.length !== 1
  ) {
    throw new Error("browser quality lane registry is incomplete or ambiguous");
  }
  return true;
}

function registry(shard) {
  if (shard === "web") return CI_WEB_QUALITY_LANES;
  if (shard === "server") return CI_SERVER_QUALITY_LANES;
  if (shard === "browser") {
    validateCiBrowserQualityLaneRegistry();
    return CI_BROWSER_QUALITY_LANES;
  }
  throw new Error(`unsupported quality lane shard: ${shard}`);
}

function laneDefinition(shard, lane) {
  const definition = registry(shard)[lane];
  if (!definition) throw new Error(`unknown ${shard} quality lane: ${lane}`);
  return definition;
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
  return String(error?.message || error || "quality lane failed")
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

function assertGitLabIdentity(root, expectedJob, env) {
  if (
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
    env.CI_JOB_NAME !== expectedJob ||
    env.RELEASE_SHA
  ) {
    throw new Error("quality lane GitLab identity is untrusted");
  }
  if (
    runGit(root, ["rev-parse", "HEAD"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["rev-parse", "origin/main"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ) {
    throw new Error("quality lane requires clean exact protected main");
  }
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
    throw new Error("quality lane CI plan is invalid");
  }
  return Object.freeze({
    range,
    planSha256: sha256File(absolutePlan),
    rangeSha256: sha256File(absoluteRange),
  });
}

function expectedFromEnvironment(env, plan) {
  return Object.freeze({
    repository: env.CI_PROJECT_PATH,
    gitSha: env.CI_COMMIT_SHA,
    pipelineId: String(env.CI_PIPELINE_ID),
    pipelineIid: String(env.CI_PIPELINE_IID),
    pipelineSource: env.CI_PIPELINE_SOURCE,
    planSha256: plan.planSha256,
    rangeSha256: plan.rangeSha256,
    range: plan.range,
  });
}

function signalExitCode(signal) {
  return signal === "SIGINT" ? 130 : 143;
}

function signalOwnedChildProcessGroup(child, signal) {
  if (!child || child.exitCode !== null || child.signalCode) return false;
  try {
    if (process.platform === "win32") return child.kill(signal);
    process.kill(-child.pid, signal);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

export function createCiQualityLaneTerminationController({
  processRef = process,
  signalChildGroup = signalOwnedChildProcessGroup,
} = {}) {
  let activeChild = null;
  let interruptedSignal = "";
  const interrupt = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    if (activeChild) signalChildGroup(activeChild, signal);
  };
  const onSigterm = () => interrupt("SIGTERM");
  const onSigint = () => interrupt("SIGINT");
  processRef.on("SIGTERM", onSigterm);
  processRef.on("SIGINT", onSigint);
  return Object.freeze({
    attach(child) {
      if (activeChild) {
        throw new Error("quality lane already owns an active child process");
      }
      activeChild = child;
      if (interruptedSignal) signalChildGroup(child, interruptedSignal);
    },
    detach(child) {
      if (activeChild === child) activeChild = null;
    },
    dispose() {
      processRef.removeListener("SIGTERM", onSigterm);
      processRef.removeListener("SIGINT", onSigint);
      activeChild = null;
    },
    get signal() {
      return interruptedSignal;
    },
  });
}

async function runProcess(
  command,
  args,
  { cwd, env, stream = true, termination = null } = {},
) {
  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd,
    env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  termination?.attach(child);
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
  let result;
  try {
    result = await new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      child.once("error", (error) =>
        finish({ status: null, signal: null, error }),
      );
      child.once("close", (status, signal) =>
        finish({ status, signal, error: null }),
      );
    });
  } finally {
    termination?.detach(child);
  }
  const value = {
    ...result,
    durationMs: Date.now() - startedAt,
    stdout: Buffer.concat(stdout).toString("utf8"),
    stderr: Buffer.concat(stderr).toString("utf8"),
    output: Buffer.concat(output).toString("utf8"),
  };
  if (overflow) {
    const error = new Error("quality lane output exceeded capture limit");
    error.result = value;
    throw error;
  }
  if (termination?.signal) {
    const error = new Error(
      `quality lane interrupted by ${termination.signal}`,
    );
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

function plainJson(file, label) {
  const stat = lstatSync(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 2 ||
    stat.size > 4 * 1024 * 1024
  ) {
    throw new Error(`${label} is not a bounded plain file`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function hashDirectory(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error("Web build contains a symbolic link");
      }
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

function browserRuntimePaths(root, env, lane) {
  if (
    !/^\d+$/u.test(String(env.CI_PIPELINE_ID || "")) ||
    !/^\d+$/u.test(String(env.CI_JOB_ID || "")) ||
    !/^[a-z][a-z0-9_]{1,63}$/u.test(lane)
  ) {
    throw new Error("browser quality runtime identity is invalid");
  }
  const runtimeRoot = path.join(
    root,
    "output",
    "runtime",
    "gitlab",
    `browser-${env.CI_PIPELINE_ID}-${env.CI_JOB_ID}-${lane}`,
  );
  return Object.freeze({
    runtimeRoot,
    lockFile: path.join(runtimeRoot, "lane.lock"),
    outputDirectory: path.join(runtimeRoot, "style-l1-output"),
    temporaryDirectory: path.join(runtimeRoot, "tmp"),
  });
}

function createBrowserRuntime(root, env, lane) {
  const paths = browserRuntimePaths(root, env, lane);
  if (existsSync(paths.runtimeRoot)) {
    throw new Error("browser quality runtime root is not preabsent");
  }
  mkdirSync(path.dirname(paths.runtimeRoot), { recursive: true, mode: 0o700 });
  try {
    mkdirSync(paths.runtimeRoot, { mode: 0o700 });
    mkdirSync(paths.temporaryDirectory, { mode: 0o700 });
    mkdirSync(paths.outputDirectory, { mode: 0o700 });
    writeFileSync(paths.lockFile, `${env.CI_JOB_ID}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    return paths;
  } catch (error) {
    if (existsSync(paths.runtimeRoot)) {
      rmSync(paths.runtimeRoot, { recursive: true });
    }
    throw error;
  }
}

function removeBrowserRuntime(paths) {
  if (!paths) return true;
  const observed = lstatSync(paths.runtimeRoot);
  if (!observed.isDirectory() || observed.isSymbolicLink()) {
    throw new Error("browser quality runtime root identity drifted");
  }
  const lock = lstatSync(paths.lockFile);
  if (!lock.isFile() || lock.isSymbolicLink()) {
    throw new Error("browser quality lane lock identity drifted");
  }
  rmSync(paths.runtimeRoot, { recursive: true });
  if (existsSync(paths.runtimeRoot)) {
    throw new Error("browser quality runtime cleanup readback failed");
  }
  return true;
}

async function assertBrowserPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      server.removeAllListeners();
      if (error) reject(error);
      else resolve();
    };
    server.once("error", () =>
      finish(new Error("browser quality lane port is unavailable")),
    );
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => finish(error || null));
    });
  });
}

export function parseCiBrowserScenarioTimings(output, expectedScenarios) {
  const timings = [];
  const seen = new Set();
  for (const match of String(output).matchAll(
    /^\[style:l1:scenario\] id=([a-z][a-z0-9-]{1,127}) status=passed durationMs=(\d+) attempts=(\d+)$/gmu,
  )) {
    const id = match[1];
    const durationMs = Number(match[2]);
    const attempts = Number(match[3]);
    if (
      seen.has(id) ||
      !Number.isSafeInteger(durationMs) ||
      durationMs < 0 ||
      attempts !== 1
    ) {
      throw new Error("browser quality scenario timing is ambiguous");
    }
    seen.add(id);
    timings.push(Object.freeze({ id, status: "passed", durationMs, attempts }));
  }
  if (
    JSON.stringify(timings.map(({ id }) => id)) !==
    JSON.stringify(expectedScenarios)
  ) {
    throw new Error("browser quality scenario inventory is incomplete");
  }
  return Object.freeze(timings);
}

function verifyConsumedWebBuild(root, env, plan) {
  const receipt = readCiQualityStageLaneReceipt({
    root,
    file: "output/ci/web-lanes/build.json",
    shard: "web",
    lane: "build",
    expected: expectedFromEnvironment(env, plan),
  });
  const digest = hashDirectory(path.join(root, "web", "build"));
  if (receipt.webBuildSha256 !== digest) {
    throw new Error("browser quality Web build artifact identity mismatch");
  }
  return digest;
}

async function runBrowserQualityLane({
  root,
  env,
  definition,
  runtimePaths,
  port,
  termination,
}) {
  await assertBrowserPortAvailable(port);
  const childEnv = {
    ...env,
    STYLE_L1_BASE_URL: "",
    STYLE_L1_OUTPUT_DIR: runtimePaths.outputDirectory,
    STYLE_L1_PORT: String(port),
    STYLE_L1_SCENARIOS: definition.browserScenarios.join(","),
    STYLE_L1_SCENARIO_MAX_ATTEMPTS: "1",
    TMP: runtimePaths.temporaryDirectory,
    TEMP: runtimePaths.temporaryDirectory,
    TMPDIR: runtimePaths.temporaryDirectory,
  };
  let boundaryDurationMs = null;
  if (definition.productionBoundary) {
    const boundary = await runProcess(
      process.execPath,
      [
        "web/scripts/productionDevBoundaryBrowserSmoke.mjs",
        "--port",
        String(port),
        "--build-dir",
        "web/build",
      ],
      { cwd: root, env: childEnv, termination },
    );
    boundaryDurationMs = boundary.durationMs;
    await assertBrowserPortAvailable(port);
  }
  const style = await runProcess(
    process.execPath,
    ["web/scripts/styleL1.mjs"],
    {
      cwd: root,
      env: childEnv,
      termination,
    },
  );
  const scenarioTimings = parseCiBrowserScenarioTimings(
    style.output,
    definition.browserScenarios,
  );
  await assertBrowserPortAvailable(port);
  const executed =
    scenarioTimings.length + (definition.productionBoundary ? 1 : 0);
  const stageDurationMs =
    style.durationMs + (boundaryDurationMs === null ? 0 : boundaryDurationMs);
  return Object.freeze({
    gateOutput:
      [
        `[qa:stage] gate=strict id=browser status=passed durationMs=${stageDurationMs}`,
        `[qa:test-gate] label=browser-${definition.job} status=complete tests=${executed} pass=${executed} fail=0 skipped=0`,
      ].join("\n") + "\n",
    evidence: Object.freeze({
      scenarios: Object.freeze([...definition.browserScenarios]),
      scenarioTimings,
      productionBoundary: definition.productionBoundary,
      boundaryDurationMs,
      portOffset: definition.portOffset,
      retries: 0,
    }),
  });
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
    throw new Error("quality lane PostgreSQL port mapping is invalid");
  }
  return Number(match[1]);
}

async function waitForPostgres(root, name) {
  for (let attempt = 0; attempt < 45; attempt += 1) {
    const result = spawnSync(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", name],
      { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    const health = String(result.stdout || "").trim();
    if (result.status === 0 && health === "healthy") return;
    if (health === "unhealthy") {
      throw new Error("quality lane PostgreSQL is unhealthy");
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error("quality lane PostgreSQL did not become healthy");
}

function addCounts(left = {}, right = {}) {
  return Object.freeze({
    executed: Number(left.executed || 0) + Number(right.executed || 0),
    passed: Number(left.passed || 0) + Number(right.passed || 0),
    failed: Number(left.failed || 0) + Number(right.failed || 0),
    skipped: Number(left.skipped || 0) + Number(right.skipped || 0),
  });
}

const ZERO_COUNTS = Object.freeze({
  executed: 0,
  passed: 0,
  failed: 0,
  skipped: 0,
});

export function ciQualityStageLaneCommandFingerprint(shard, lane) {
  return stableSha256({ shard, lane, definition: laneDefinition(shard, lane) });
}

export function validateCiQualityStageLaneReceipt(
  receipt,
  { shard, lane, expected },
) {
  const definition = laneDefinition(shard, lane);
  const actualStages = receipt?.stageTimings?.map(({ id }) => id) || [];
  const actualSubsteps = receipt?.substepTimings?.map(({ id }) => id) || [];
  const summary = receipt?.summary || {};
  const browserLane = shard === "browser";
  const expectedBrowserExecutions = browserLane
    ? definition.browserScenarios.length +
      (definition.productionBoundary ? 1 : 0)
    : null;
  const validSummary =
    Number.isSafeInteger(summary.executed) &&
    (browserLane
      ? summary.executed === expectedBrowserExecutions
      : summary.executed >= (definition.requiresTests ? 1 : 0)) &&
    summary.passed === summary.executed &&
    summary.failed === 0 &&
    summary.skipped === 0;
  if (
    receipt?.schemaVersion !== CI_QUALITY_STAGE_LANE_SCHEMA ||
    receipt.shard !== shard ||
    receipt.lane !== lane ||
    receipt.status !== "passed" ||
    receipt.repository !== expected.repository ||
    receipt.gitSha !== expected.gitSha ||
    receipt.ref !== "refs/heads/main" ||
    receipt.protectedDefaultBranch !== true ||
    receipt.pipeline?.id !== expected.pipelineId ||
    receipt.pipeline?.iid !== expected.pipelineIid ||
    receipt.pipeline?.source !== expected.pipelineSource ||
    receipt.job?.name !== definition.job ||
    !/^\d+$/u.test(String(receipt.job?.id || "")) ||
    receipt.plan?.planSha256 !== expected.planSha256 ||
    receipt.plan?.rangeSha256 !== expected.rangeSha256 ||
    receipt.plan?.range !== expected.range ||
    receipt.commandFingerprint !==
      ciQualityStageLaneCommandFingerprint(shard, lane) ||
    JSON.stringify(receipt.expectedStages) !==
      JSON.stringify(definition.stages) ||
    JSON.stringify(actualStages) !== JSON.stringify(definition.stages) ||
    receipt.stageTimings.some(
      (stage) =>
        stage.status !== "passed" ||
        !Number.isSafeInteger(stage.durationMs) ||
        stage.durationMs < 0,
    ) ||
    JSON.stringify(actualSubsteps) !== JSON.stringify(definition.substeps) ||
    receipt.substepTimings.some(
      (substep) =>
        substep.stage !== "web" ||
        substep.status !== "passed" ||
        !Number.isSafeInteger(substep.durationMs) ||
        substep.durationMs < 0,
    ) ||
    !validSummary ||
    !Number.isFinite(Date.parse(receipt.startedAt)) ||
    !Number.isFinite(Date.parse(receipt.finishedAt)) ||
    !Number.isSafeInteger(receipt.durationMs) ||
    receipt.durationMs < 0 ||
    Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt) !==
      receipt.durationMs ||
    receipt.cleanupPassed !== true ||
    receipt.redaction?.containsSecrets !== false ||
    receipt.redaction?.containsCredentials !== false ||
    receipt.redaction?.containsFullDsn !== false ||
    receipt.redaction?.containsAbsoluteWorkspacePaths !== false ||
    receipt.redaction?.containsRawLogs !== false ||
    receipt.invariants?.makeData !==
      (definition.makeData ? "passed" : "not-applicable") ||
    receipt.invariants?.databaseCleanup !==
      (definition.postgres ? "passed" : "not-applicable") ||
    receipt.invariants?.chromiumSandboxCleanup !==
      (definition.chromium ? "passed" : "not-applicable") ||
    receipt.invariants?.playwrightRuntimeCleanup !==
      (definition.chromium ? "passed" : "not-applicable") ||
    receipt.invariants?.browserRuntimeCleanup !==
      (browserLane ? "passed" : "not-applicable") ||
    receipt.invariants?.browserLaneLockCleanup !==
      (browserLane ? "passed" : "not-applicable") ||
    receipt.invariants?.browserPortCleanup !==
      (browserLane ? "passed" : "not-applicable") ||
    receipt.invariants?.webBuildReceipt !==
      (definition.consumesWebBuild ? "passed" : "not-applicable") ||
    receipt.invariants?.webBuildReadOnly !==
      (definition.consumesWebBuild ? "passed" : "not-applicable") ||
    ((definition.webBuild || definition.consumesWebBuild) &&
      !SHA256_PATTERN.test(String(receipt.webBuildSha256 || ""))) ||
    (!definition.webBuild &&
      !definition.consumesWebBuild &&
      receipt.webBuildSha256 !== null) ||
    (browserLane &&
      (JSON.stringify(receipt.browser?.scenarios) !==
        JSON.stringify(definition.browserScenarios) ||
        JSON.stringify(
          receipt.browser?.scenarioTimings?.map(({ id }) => id) || [],
        ) !== JSON.stringify(definition.browserScenarios) ||
        receipt.browser.scenarioTimings.some(
          (timing) =>
            timing.status !== "passed" ||
            timing.attempts !== 1 ||
            !Number.isSafeInteger(timing.durationMs) ||
            timing.durationMs < 0,
        ) ||
        receipt.browser?.productionBoundary !== definition.productionBoundary ||
        receipt.browser?.portOffset !== definition.portOffset ||
        receipt.browser?.retries !== 0 ||
        (definition.productionBoundary
          ? !Number.isSafeInteger(receipt.browser?.boundaryDurationMs) ||
            receipt.browser.boundaryDurationMs < 0
          : receipt.browser?.boundaryDurationMs !== null))) ||
    (!browserLane && receipt.browser !== null)
  ) {
    throw new Error(`quality lane receipt is invalid: ${shard}/${lane}`);
  }
  return receipt;
}

export function readCiQualityStageLaneReceipt({
  root,
  file,
  shard,
  lane,
  expected,
}) {
  return validateCiQualityStageLaneReceipt(
    plainJson(path.resolve(root, file), `${shard} quality lane ${lane}`),
    { shard, lane, expected },
  );
}

export function loadCiQualityStageLaneSet({
  root,
  shard,
  directory,
  expected,
}) {
  const definitions = registry(shard);
  const resolved = path.resolve(root, directory);
  const names = readdirSync(resolved).sort();
  const expectedNames = Object.keys(definitions)
    .map((lane) => `${lane}.json`)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`${shard} quality lane artifact directory is ambiguous`);
  }
  const receipts = names.map((name) => {
    const lane = name.slice(0, -5);
    return readCiQualityStageLaneReceipt({
      root,
      file: path.join(resolved, name),
      shard,
      lane,
      expected,
    });
  });
  const byLane = new Map(receipts.map((receipt) => [receipt.lane, receipt]));
  const startedEpoch = Math.min(
    ...receipts.map((receipt) => Date.parse(receipt.startedAt)),
  );
  const finishedEpoch = Math.max(
    ...receipts.map((receipt) => Date.parse(receipt.finishedAt)),
  );
  const stageTimings = ["web", "browser"].includes(shard)
    ? [
        Object.freeze({
          id: shard,
          status: "passed",
          durationMs: Math.max(
            ...receipts.flatMap((receipt) =>
              receipt.stageTimings.map((stage) => stage.durationMs),
            ),
          ),
        }),
      ]
    : Object.freeze(
        ["environment_profile", "server", "critical_postgres"].map((id) => {
          const matching = receipts.flatMap((receipt) =>
            receipt.stageTimings.filter((stage) => stage.id === id),
          );
          if (matching.length === 0) {
            throw new Error(`server quality stage is missing: ${id}`);
          }
          return Object.freeze({
            id,
            status: "passed",
            durationMs: Math.max(...matching.map((stage) => stage.durationMs)),
          });
        }),
      );
  const categoryKeys = ["web", "server", "database", "browser", "security"];
  const browserScenarios =
    shard === "browser"
      ? receipts.flatMap((receipt) => receipt.browser.scenarios)
      : [];
  const browserScenarioSet = new Set(browserScenarios);
  const browserBoundaryCount =
    shard === "browser"
      ? receipts.filter((receipt) => receipt.browser.productionBoundary).length
      : 0;
  const browserBuildDigests =
    shard === "browser"
      ? new Set(receipts.map((receipt) => receipt.webBuildSha256))
      : new Set();
  if (
    shard === "browser" &&
    (browserScenarios.length !== browserScenarioSet.size ||
      JSON.stringify([...browserScenarioSet].sort()) !==
        JSON.stringify([...CI_BROWSER_QUALITY_SCENARIOS].sort()) ||
      browserBoundaryCount !== 1 ||
      browserBuildDigests.size !== 1)
  ) {
    throw new Error("browser quality lane coverage is incomplete or ambiguous");
  }
  return Object.freeze({
    byLane,
    jobs: Object.freeze(
      Object.keys(definitions).map((lane) => {
        const receipt = byLane.get(lane);
        return Object.freeze({
          lane,
          job: receipt.job.name,
          jobId: receipt.job.id,
          startedAt: receipt.startedAt,
          finishedAt: receipt.finishedAt,
          durationMs: receipt.durationMs,
        });
      }),
    ),
    laneCount: receipts.length,
    startedAt: new Date(startedEpoch).toISOString(),
    finishedAt: new Date(finishedEpoch).toISOString(),
    durationMs: finishedEpoch - startedEpoch,
    stageTimings: Object.freeze(stageTimings),
    substepTimings: Object.freeze(
      receipts.flatMap((receipt) => receipt.substepTimings),
    ),
    summary: receipts.reduce(
      (total, receipt) => addCounts(total, receipt.summary),
      ZERO_COUNTS,
    ),
    categoryCounts: Object.freeze(
      Object.fromEntries(
        categoryKeys.map((key) => [
          key,
          receipts.reduce(
            (total, receipt) => addCounts(total, receipt.categoryCounts[key]),
            ZERO_COUNTS,
          ),
        ]),
      ),
    ),
    cleanup: Object.freeze({
      makeData:
        shard === "server"
          ? byLane.get("schema").invariants.makeData
          : "not-applicable",
      database:
        shard === "server" &&
        Object.entries(definitions)
          .filter(([, definition]) => definition.postgres)
          .every(
            ([lane]) =>
              byLane.get(lane).invariants.databaseCleanup === "passed",
          )
          ? "passed"
          : "not-applicable",
      chromiumSandbox: ["server", "browser"].includes(shard)
        ? Object.keys(definitions)
            .filter((lane) => definitions[lane].chromium)
            .every(
              (lane) =>
                byLane.get(lane).invariants.chromiumSandboxCleanup === "passed",
            )
          ? "passed"
          : "failed"
        : "not-applicable",
      playwrightRuntime: ["server", "browser"].includes(shard)
        ? Object.keys(definitions)
            .filter((lane) => definitions[lane].chromium)
            .every(
              (lane) =>
                byLane.get(lane).invariants.playwrightRuntimeCleanup ===
                "passed",
            )
          ? "passed"
          : "failed"
        : "not-applicable",
      browserRuntime:
        shard === "browser" &&
        receipts.every(
          (receipt) => receipt.invariants.browserRuntimeCleanup === "passed",
        )
          ? "passed"
          : "not-applicable",
      browserLaneLock:
        shard === "browser" &&
        receipts.every(
          (receipt) => receipt.invariants.browserLaneLockCleanup === "passed",
        )
          ? "passed"
          : "not-applicable",
      browserPort:
        shard === "browser" &&
        receipts.every(
          (receipt) => receipt.invariants.browserPortCleanup === "passed",
        )
          ? "passed"
          : "not-applicable",
    }),
    webBuildSha256:
      shard === "web"
        ? byLane.get("build").webBuildSha256
        : shard === "browser"
          ? receipts[0].webBuildSha256
          : null,
    browser:
      shard === "browser"
        ? Object.freeze({
            scenarios: Object.freeze([...browserScenarios]),
            scenarioCount: browserScenarios.length,
            productionBoundaryCount: browserBoundaryCount,
            retries: receipts.reduce(
              (total, receipt) => total + receipt.browser.retries,
              0,
            ),
          })
        : null,
  });
}

export function aggregateCiQualityStageLanes({
  shard,
  root = path.resolve(import.meta.dirname, "../.."),
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  directory = `output/ci/${shard}-lanes`,
  env = process.env,
} = {}) {
  assertGitLabIdentity(root, `quality_${shard}`, env);
  const plan = readPlan(root, planFile, rangeFile);
  const aggregate = loadCiQualityStageLaneSet({
    root,
    shard,
    directory,
    expected: expectedFromEnvironment(env, plan),
  });
  process.stdout.write(formatCiQualityStageLaneAggregate(shard, aggregate));
  return aggregate;
}

export function formatCiQualityStageLaneAggregate(shard, aggregate) {
  registry(shard);
  const lines = [];
  for (const stage of aggregate.stageTimings) {
    lines.push(
      `[qa:stage] gate=strict id=${stage.id} status=passed durationMs=${stage.durationMs}\n`,
    );
  }
  for (const substep of aggregate.substepTimings) {
    lines.push(
      `[qa:substep] gate=strict stage=${substep.stage} id=${substep.id} status=passed durationMs=${substep.durationMs}\n`,
    );
  }
  const label =
    shard === "web"
      ? "web-all"
      : shard === "server"
        ? "server-all"
        : "browser-all";
  lines.push(
    `[qa:test-gate] label=${label} status=complete tests=${aggregate.summary.executed} pass=${aggregate.summary.passed} fail=0 skipped=0\n`,
  );
  lines.push(
    `[qa:quality-lanes] shard=${shard} status=complete lanes=${aggregate.laneCount}\n`,
  );
  return lines.join("");
}

export async function runCiQualityStageLane({
  shard,
  lane,
  root = path.resolve(import.meta.dirname, "../.."),
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  out = `output/ci/${shard}-lanes/${lane}.json`,
  env = process.env,
  termination = null,
} = {}) {
  const definition = laneDefinition(shard, lane);
  assertGitLabIdentity(root, definition.job, env);
  const plan = readPlan(root, planFile, rangeFile);
  const startedEpoch = Date.now();
  const startedAt = new Date(startedEpoch).toISOString();
  const childEnv = {
    ...env,
    QA_BASE_RANGE: plan.range,
    QA_DB_GUARD_RANGE: plan.range,
    QA_FULL_PROFILE: "strict",
  };
  let gateOutput = "";
  let failure = null;
  let postgresName = "";
  let sandboxPath = "";
  let runtimeMaterialized = false;
  let browserPaths = null;
  let browserPort = 0;
  let browserEvidence = null;
  let consumedWebBuildDigest = null;
  const invariants = {
    makeData: definition.makeData ? "pending" : "not-applicable",
    databaseCleanup: definition.postgres ? "pending" : "not-applicable",
    chromiumSandboxCleanup: definition.chromium ? "pending" : "not-applicable",
    playwrightRuntimeCleanup: definition.chromium
      ? "pending"
      : "not-applicable",
    browserRuntimeCleanup: shard === "browser" ? "pending" : "not-applicable",
    browserLaneLockCleanup: shard === "browser" ? "pending" : "not-applicable",
    browserPortCleanup: shard === "browser" ? "pending" : "not-applicable",
    webBuildReceipt: definition.consumesWebBuild ? "pending" : "not-applicable",
    webBuildReadOnly: definition.consumesWebBuild
      ? "pending"
      : "not-applicable",
  };
  try {
    if (shard === "browser") {
      browserPaths = createBrowserRuntime(root, env, lane);
      browserPort = resolveDevAuxPort(
        loadDevPorts(root, {}),
        definition.portOffset,
      );
      consumedWebBuildDigest = verifyConsumedWebBuild(root, env, plan);
      invariants.webBuildReceipt = "passed";
    }
    if (definition.pnpm || definition.chromium) {
      await runProcess(
        "pnpm",
        ["--dir", "web", "install", "--frozen-lockfile", "--offline"],
        { cwd: root, env: childEnv, termination },
      );
    }
    if (definition.chromium) {
      const chromium = await materializePlaywrightRuntime({
        root,
        env: childEnv,
      });
      runtimeMaterialized = true;
      sandboxPath = `/usr/local/sbin/chrome-devel-sandbox-${env.CI_JOB_ID}`;
      await runProcess(
        "sudo",
        [
          "-n",
          "/usr/local/sbin/plush-chromium-sandbox",
          "install",
          String(env.CI_JOB_ID),
          chromium.sandboxSource,
        ],
        { cwd: root, env: childEnv, termination },
      );
      childEnv.CHROME_DEVEL_SANDBOX = sandboxPath;
      childEnv.ERP_PDF_CHROME_PATH = chromium.chromePath;
    }
    if (definition.postgres) {
      postgresName = `plush-ci-server-${lane.replace(/_/gu, "-")}-${env.CI_PIPELINE_ID}-${env.CI_JOB_ID}`;
      await runProcess(
        "docker",
        [
          "run",
          "--detach",
          "--rm",
          "--name",
          postgresName,
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
        { cwd: root, env: childEnv, termination },
      );
      await waitForPostgres(root, postgresName);
      const port = mappedPostgresPort(root, postgresName);
      childEnv.DISPOSABLE_DATABASE_BASE_URL = `postgres://postgres:ci-local-password@127.0.0.1:${port}/postgres?sslmode=disable`;
    }
    if (shard === "browser") {
      const result = await runBrowserQualityLane({
        root,
        env: childEnv,
        definition,
        runtimePaths: browserPaths,
        port: browserPort,
        termination,
      });
      gateOutput = result.gateOutput;
      browserEvidence = result.evidence;
      const finalWebBuildDigest = hashDirectory(
        path.join(root, "web", "build"),
      );
      if (finalWebBuildDigest !== consumedWebBuildDigest) {
        throw new Error("browser quality lane mutated the Web build artifact");
      }
      invariants.webBuildReadOnly = "passed";
    } else {
      const result = await runProcess(
        definition.command[0],
        definition.command.slice(1),
        { cwd: root, env: childEnv, termination },
      );
      gateOutput = result.output;
    }
    if (definition.makeData) {
      if (runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
        throw new Error("make data changed the exact-SHA checkout");
      }
      invariants.makeData = "passed";
    }
  } catch (error) {
    failure = error;
    if (error?.result?.output) gateOutput += error.result.output;
  } finally {
    if (postgresName) {
      const exists =
        spawnSync("docker", ["inspect", postgresName], {
          cwd: root,
          stdio: "ignore",
        }).status === 0;
      if (exists) {
        const removed = spawnSync("docker", ["rm", "--force", postgresName], {
          cwd: root,
          stdio: "ignore",
        });
        if (removed.status !== 0)
          failure ||= new Error("PostgreSQL cleanup failed");
      }
      const residual =
        spawnSync("docker", ["inspect", postgresName], {
          cwd: root,
          stdio: "ignore",
        }).status === 0;
      invariants.databaseCleanup = residual ? "failed" : "passed";
      if (residual) failure ||= new Error("PostgreSQL cleanup readback failed");
    }
    if (sandboxPath) {
      const removed = spawnSync(
        "sudo",
        [
          "-n",
          "/usr/local/sbin/plush-chromium-sandbox",
          "remove",
          String(env.CI_JOB_ID),
        ],
        { cwd: root, stdio: "ignore" },
      );
      const residual = existsSync(sandboxPath);
      invariants.chromiumSandboxCleanup =
        removed.status === 0 && !residual ? "passed" : "failed";
      if (removed.status !== 0 || residual) {
        failure ||= new Error("Chromium sandbox cleanup readback failed");
      }
    }
    if (runtimeMaterialized) {
      try {
        cleanupPlaywrightRuntime({ root, env: childEnv });
        invariants.playwrightRuntimeCleanup = "passed";
      } catch {
        invariants.playwrightRuntimeCleanup = "failed";
        failure ||= new Error("Playwright runtime cleanup readback failed");
      }
    }
    if (shard === "browser" && browserPort > 0) {
      try {
        await assertBrowserPortAvailable(browserPort);
        invariants.browserPortCleanup = "passed";
      } catch {
        invariants.browserPortCleanup = "failed";
        failure ||= new Error("browser quality port cleanup readback failed");
      }
    }
    if (browserPaths) {
      try {
        removeBrowserRuntime(browserPaths);
        invariants.browserRuntimeCleanup = "passed";
        invariants.browserLaneLockCleanup = "passed";
      } catch {
        invariants.browserRuntimeCleanup = "failed";
        invariants.browserLaneLockCleanup = "failed";
        failure ||= new Error("browser quality runtime cleanup failed");
      }
    }
  }

  if (termination?.signal) {
    failure ||= new Error(`quality lane interrupted by ${termination.signal}`);
  }

  const timing = parseGateStageTimings(gateOutput, "strict");
  const actualStages = timing.stageTimings.map(({ id }) => id);
  const actualSubsteps = timing.substepTimings.map(({ id }) => id);
  if (
    !failure &&
    (JSON.stringify(actualStages) !== JSON.stringify(definition.stages) ||
      JSON.stringify(actualSubsteps) !== JSON.stringify(definition.substeps) ||
      timing.stageTimings.some(({ status }) => status !== "passed") ||
      timing.substepTimings.some(({ status }) => status !== "passed"))
  ) {
    failure = new Error("quality lane timing evidence is incomplete");
  }
  const summary = summarizeGateOutput(gateOutput);
  if (
    !failure &&
    (summary.executed < (definition.requiresTests ? 1 : 0) ||
      summary.passed !== summary.executed ||
      summary.failed !== 0 ||
      summary.skipped !== 0)
  ) {
    failure = new Error("quality lane test evidence is incomplete");
  }
  let webBuildSha256 = null;
  if (!failure && definition.webBuild) {
    webBuildSha256 = hashDirectory(path.join(root, "web", "build"));
  } else if (!failure && definition.consumesWebBuild) {
    webBuildSha256 = consumedWebBuildDigest;
  }
  if (
    !failure &&
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ) {
    failure = new Error("quality lane changed the exact-SHA checkout");
  }
  const finishedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: CI_QUALITY_STAGE_LANE_SCHEMA,
    shard,
    lane,
    status: failure ? "failed" : "passed",
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
    commandFingerprint: ciQualityStageLaneCommandFingerprint(shard, lane),
    plan,
    expectedStages: [...definition.stages],
    stageTimings: timing.stageTimings,
    substepTimings: timing.substepTimings,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - startedEpoch),
    summary,
    categoryCounts: summarizeGateCategories(
      gateOutput,
      "strict",
      timing.stageTimings,
    ),
    invariants,
    webBuildSha256,
    browser: shard === "browser" ? browserEvidence : null,
    cleanupPassed: !Object.values(invariants).some((value) =>
      ["failed", "pending"].includes(value),
    ),
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
    `[ci-quality-stage-lane] shard=${shard} lane=${lane} status=${receipt.status} receipt=${out}\n`,
  );
  return receipt;
}

function parseArgs(argv) {
  const options = { aggregate: false, shard: "", lane: "", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--aggregate") {
      options.aggregate = true;
      continue;
    }
    if (["--shard", "--lane", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      options[arg.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  registry(options.shard);
  if (options.aggregate === Boolean(options.lane)) {
    throw new Error("choose exactly one quality lane or fan-in mode");
  }
  if (options.lane) laneDefinition(options.shard, options.lane);
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const termination = createCiQualityLaneTerminationController();
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.aggregate) {
      aggregateCiQualityStageLanes({ shard: options.shard });
    } else {
      const receipt = await runCiQualityStageLane({
        shard: options.shard,
        lane: options.lane,
        termination,
        out:
          options.out ||
          `output/ci/${options.shard}-lanes/${options.lane}.json`,
      });
      process.exitCode = receipt.status === "passed" ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(
      `[ci-quality-stage-lane] status=blocked reason=${safeFailure(error)}\n`,
    );
    process.exitCode = 2;
  } finally {
    const interruptedSignal = termination.signal;
    termination.dispose();
    if (interruptedSignal) process.exitCode = signalExitCode(interruptedSignal);
  }
}
