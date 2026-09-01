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
  loadCiQualityStageLaneSet,
  readCiQualityStageLaneReceipt,
} from "./ci-quality-stage-lane.mjs";

export const CI_QUALITY_SHARD_SCHEMA = "plush.ci-quality-shard/v1";
export const CI_QUALITY_SHARDS = Object.freeze({
  static: Object.freeze({
    job: "quality_static",
    command: Object.freeze(["bash", "scripts/qa/strict.sh", "--ci-shard", "static"]),
    stages: Object.freeze(["strict_profile", "shellcheck", "shfmt", "yamllint"]),
  }),
  node: Object.freeze({
    job: "quality_node",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "node"]),
    stages: Object.freeze(["secrets", "shared"]),
  }),
  web: Object.freeze({
    job: "quality_web",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "web"]),
    stages: Object.freeze(["web"]),
  }),
  server: Object.freeze({
    job: "quality_server",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "server"]),
    stages: Object.freeze(["environment_profile", "server", "critical_postgres"]),
  }),
  resource: Object.freeze({
    job: "quality_resource",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "resource"]),
    stages: Object.freeze(["resource_sensitive_node"]),
  }),
  browser: Object.freeze({
    job: "quality_browser",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "browser"]),
    stages: Object.freeze(["browser"]),
  }),
  security: Object.freeze({
    job: "quality_security",
    command: Object.freeze(["bash", "scripts/qa/full.sh", "--ci-shard", "security"]),
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

function assertGitLabIdentity(root, shard, env) {
  const definition = CI_QUALITY_SHARDS[shard];
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

async function runProcess(command, args, { cwd, env, stream = true } = {}) {
  const startedAt = Date.now();
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
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
  if (result.error || result.status !== 0) {
    const error = result.error || new Error(`${command} exited with status ${String(result.status)}`);
    error.result = value;
    throw error;
  }
  return value;
}

function hashDirectory(root) {
  const entries = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).split(path.sep).join("/");
      const stat = lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error("Web build contains a symbolic link");
      if (stat.isDirectory()) {
        walk(absolute);
      } else if (stat.isFile()) {
        entries.push({ relative, mode: stat.mode & 0o777, sha256: sha256File(absolute) });
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

async function materializeChromium(root, childEnv) {
  await runProcess("pnpm", ["--dir", "web", "install", "--frozen-lockfile", "--offline"], {
    cwd: root,
    env: childEnv,
  });
  return materializePlaywrightRuntime({ root, env: childEnv });
}

async function installChromiumSandbox(
  root,
  childEnv,
  sandboxSource,
  sandboxPath,
) {
  await runProcess(
    "sudo",
    [
      "-n",
      "/usr/local/sbin/plush-chromium-sandbox",
      "install",
      String(childEnv.CI_JOB_ID),
      sandboxSource,
    ],
    { cwd: root, env: childEnv },
  );
  if (sandboxPath !== `/usr/local/sbin/chrome-devel-sandbox-${childEnv.CI_JOB_ID}`) {
    throw new Error("Chromium sandbox destination identity mismatch");
  }
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
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  out = `output/ci/shards/${shard}.json`,
  root = path.resolve(import.meta.dirname, "../.."),
  env = process.env,
} = {}) {
  const definition = assertGitLabIdentity(root, shard, env);
  const plan = readPlan(root, planFile, rangeFile);
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
  if (shard === "web") childEnv.QA_CI_WEB_LANES = "verified";
  if (shard === "server") childEnv.QA_CI_SERVER_LANES = "verified";
  if (shard === "browser") {
    childEnv.QA_BROWSER_SCENARIOS =
      "root-redirect-desktop,root-redirect-mobile,print-center-engineering-preview-tablet";
  }
  let gateOutput = "";
  let failure = null;
  let sandboxPath = "";
  let runtimeMaterialized = false;
  const invariants = {
    dependencyAudit: shard === "security" ? "pending" : "not-applicable",
    makeData: shard === "server" ? "pending" : "not-applicable",
    sourceIntegrity: shard === "node" ? null : "not-applicable",
    databaseCleanup: shard === "server" ? "pending" : "not-applicable",
    chromiumSandboxCleanup: ["server", "browser"].includes(shard)
      ? "pending"
      : "not-applicable",
    playwrightRuntimeCleanup: ["server", "browser"].includes(shard)
      ? "pending"
      : "not-applicable",
    nodeLanes: shard === "node" ? null : "not-applicable",
    resourceLanes: shard === "resource" ? null : "not-applicable",
    webLanes: shard === "web" ? null : "not-applicable",
    serverLanes: shard === "server" ? null : "not-applicable",
    webBuildSha256: null,
  };
  try {
    if (shard === "node") {
      await runProcess("pnpm", ["--dir", "web", "install", "--frozen-lockfile", "--offline"], {
        cwd: root,
        env: childEnv,
      });
    }
    if (shard === "browser") {
      const chromium = await materializeChromium(root, childEnv);
      runtimeMaterialized = true;
      sandboxPath = `/usr/local/sbin/chrome-devel-sandbox-${env.CI_JOB_ID}`;
      await installChromiumSandbox(
        root,
        childEnv,
        chromium.sandboxSource,
        sandboxPath,
      );
      childEnv.CHROME_DEVEL_SANDBOX = sandboxPath;
      childEnv.ERP_PDF_CHROME_PATH = chromium.chromePath;
    }
    if (shard === "security") {
      await runProcess(
        "pnpm",
        ["--dir", "web", "audit", "--prod", "--audit-level", "high", "--registry=https://registry.npmjs.org"],
        { cwd: root, env: childEnv },
      );
      invariants.dependencyAudit = "passed";
    }
    if (shard === "browser") {
      const webBuild = path.join(root, "web", "build");
      const webReceipt = readCiQualityStageLaneReceipt({
        root,
        file: "output/ci/web-lanes/build.json",
        shard: "web",
        lane: "build",
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
      const webBuildSha256 = hashDirectory(webBuild);
      if (
        webReceipt.webBuildSha256 !== webBuildSha256
      ) {
        throw new Error("browser shard Web build artifact identity mismatch");
      }
      invariants.webBuildSha256 = webBuildSha256;
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
    const main = await runProcess(definition.command[0], definition.command.slice(1), {
      cwd: root,
      env: childEnv,
    });
    gateOutput = main.output;
    if (["web", "server"].includes(shard)) {
      const lanes = loadCiQualityStageLaneSet({
        root,
        shard,
        directory: `output/ci/${shard}-lanes`,
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
      const laneEvidence = {
        status: "passed",
        laneCount: lanes.laneCount,
        durationMs: lanes.durationMs,
        jobs: lanes.jobs,
        executed: lanes.summary.executed,
        passed: lanes.summary.passed,
        failed: lanes.summary.failed,
        skipped: lanes.summary.skipped,
      };
      if (shard === "web") {
        invariants.webLanes = laneEvidence;
        invariants.webBuildSha256 = lanes.webBuildSha256;
      } else {
        invariants.serverLanes = laneEvidence;
        invariants.makeData = lanes.cleanup.makeData;
        invariants.databaseCleanup = lanes.cleanup.database;
        invariants.chromiumSandboxCleanup = lanes.cleanup.chromiumSandbox;
        invariants.playwrightRuntimeCleanup = lanes.cleanup.playwrightRuntime;
      }
    }
    if (shard === "node") {
      const source = await runProcess(
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
      if (!hasCompleteSourceArchiveLightEvidence(report, {
        gitSha: env.CI_COMMIT_SHA,
        customer: "yoyoosun",
      })) {
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
    if (sandboxPath) {
      const removed = spawnSync(
        "sudo",
        [
          "-n",
          "/usr/local/sbin/plush-chromium-sandbox",
          "remove",
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
    if (runtimeMaterialized) {
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
  const stageCount = timing.stageTimings.length;
  const status = failure ? "failed" : "passed";
  const categoryCounts = Object.fromEntries(
    Object.entries(
      summarizeGateCategories(gateOutput, "strict", timing.stageTimings),
    ).map(([key, value]) => [key, balancedCounts(value)]),
  );
  const finishedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: CI_QUALITY_SHARD_SCHEMA,
    shard,
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
    commandFingerprint: stableSha256({ shard, definition }),
    plan,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - startedEpoch),
    expectedStages: [...definition.stages],
    stageTimings: timing.stageTimings,
    substepTimings: timing.substepTimings,
    summary: {
      executed: testSummary.executed + stageCount,
      passed: status === "passed" ? testSummary.passed + stageCount : testSummary.passed,
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
    runtime: { node: process.version, platform: process.platform, arch: process.arch },
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
    `[ci-quality-shard] shard=${shard} status=${status} receipt=${out}\n`,
  );
  return receipt;
}

function parseArgs(argv) {
  const options = { shard: "", planFile: "output/ci/plan.json", rangeFile: "output/ci/range.txt", out: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (["--shard", "--plan", "--range", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
      const key = { "--shard": "shard", "--plan": "planFile", "--range": "rangeFile", "--out": "out" }[arg];
      options[key] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (!Object.hasOwn(CI_QUALITY_SHARDS, options.shard)) throw new Error("--shard is invalid");
  options.out ||= `output/ci/shards/${options.shard}.json`;
  return options;
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const receipt = await runCiQualityShard(parseArgs(process.argv.slice(2)));
    process.exitCode = receipt.status === "passed" ? 0 : 1;
  } catch (error) {
    process.stderr.write(`[ci-quality-shard] status=blocked reason=${safeFailure(error)}\n`);
    process.exitCode = 2;
  }
}
