#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
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
import { buildNodeTestArgs, catalogNodeTests } from "./run-node-tests.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

export const CI_NODE_TEST_LANE_SCHEMA = "plush.ci-node-test-lane/v1";

const RELEASE_LANE_ANCHORS = Object.freeze({
  preflight: Object.freeze(["scripts/deploy/production-preflight.test.mjs"]),
  a: Object.freeze(["scripts/qa/pre-push-receipt.test.mjs"]),
  b: Object.freeze([
    "scripts/deploy/migrate-online.test.mjs",
    "scripts/deploy/run-smoke-script.test.mjs",
  ]),
  c: Object.freeze([]),
});

function releaseLaneTestFiles() {
  const release = [...catalogNodeTests("release")].sort();
  const anchors = Object.values(RELEASE_LANE_ANCHORS).flat();
  const anchorSet = new Set(anchors);
  if (
    anchorSet.size !== anchors.length ||
    anchors.some((file) => !release.includes(file))
  ) {
    throw new Error("Node release lane anchors are invalid");
  }
  const residual = release.filter((file) => !anchorSet.has(file));
  return Object.freeze({
    preflight: RELEASE_LANE_ANCHORS.preflight,
    a: Object.freeze([
      ...RELEASE_LANE_ANCHORS.a,
      ...residual.filter((_, index) => index % 3 === 0),
    ]),
    b: Object.freeze([
      ...RELEASE_LANE_ANCHORS.b,
      ...residual.filter((_, index) => index % 3 === 1),
    ]),
    c: Object.freeze([
      ...RELEASE_LANE_ANCHORS.c,
      ...residual.filter((_, index) => index % 3 === 2),
    ]),
  });
}

const RELEASE_LANE_TEST_FILES = releaseLaneTestFiles();

export const CI_NODE_TEST_LANES = Object.freeze({
  core: Object.freeze({
    job: "quality_node_core",
    profiles: Object.freeze(["fast", "database", "browser"]),
  }),
  release_preflight_a: Object.freeze({
    job: "quality_node_release_preflight_a",
    profiles: Object.freeze(["release"]),
    testFiles: RELEASE_LANE_TEST_FILES.preflight,
    testPartition: "a",
  }),
  release_preflight_b: Object.freeze({
    job: "quality_node_release_preflight_b",
    profiles: Object.freeze(["release"]),
    testFiles: RELEASE_LANE_TEST_FILES.preflight,
    testPartition: "b",
  }),
  release_a: Object.freeze({
    job: "quality_node_release_a",
    profiles: Object.freeze(["release"]),
    testFiles: RELEASE_LANE_TEST_FILES.a,
  }),
  release_b: Object.freeze({
    job: "quality_node_release_b",
    profiles: Object.freeze(["release"]),
    testFiles: RELEASE_LANE_TEST_FILES.b,
  }),
  release_c: Object.freeze({
    job: "quality_node_release_c",
    profiles: Object.freeze(["release"]),
    testFiles: RELEASE_LANE_TEST_FILES.c,
  }),
});

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\^)\.\.\.?HEAD$/u;

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
  return String(error?.message || error || "Node test lane failed")
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

function assertBaseGitLabIdentity(root, env) {
  if (
    env.GITLAB_CI !== "true" ||
    env.CI_PROJECT_PATH !== "saurick/plush-toy-erp" ||
    env.CI_DEFAULT_BRANCH !== "main" ||
    env.CI_COMMIT_BRANCH !== "main" ||
    env.CI_COMMIT_REF_PROTECTED !== "true" ||
    !["push", "web"].includes(env.CI_PIPELINE_SOURCE) ||
    !SHA_PATTERN.test(String(env.CI_COMMIT_SHA || "")) ||
    !/^\d+$/u.test(String(env.CI_PIPELINE_ID || "")) ||
    !/^\d+$/u.test(String(env.CI_PIPELINE_IID || "")) ||
    !/^\d+$/u.test(String(env.CI_JOB_ID || "")) ||
    env.RELEASE_SHA
  ) {
    throw new Error("Node test lane GitLab identity is untrusted");
  }
  if (
    runGit(root, ["rev-parse", "HEAD"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["rev-parse", "origin/main"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ) {
    throw new Error("Node test lane requires clean exact protected main");
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
    throw new Error("Node test lane CI plan is invalid");
  }
  return Object.freeze({
    range,
    planSha256: sha256File(absolutePlan),
    rangeSha256: sha256File(absoluteRange),
  });
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

function laneTestFiles(lane) {
  const definition = CI_NODE_TEST_LANES[lane];
  if (!definition) throw new Error(`unknown Node test lane: ${lane}`);
  if (definition.testFiles) return definition.testFiles;
  return definition.profiles.flatMap((profile) => catalogNodeTests(profile));
}

export function ciNodeTestLaneCommandFingerprint(lane) {
  const definition = CI_NODE_TEST_LANES[lane];
  return stableSha256({ lane, definition, testFiles: laneTestFiles(lane) });
}

function addNodeSummary(total, summary) {
  return Object.freeze({
    tests: total.tests + summary.tests,
    pass: total.pass + summary.pass,
    fail: total.fail + summary.fail,
    cancelled: total.cancelled + summary.cancelled,
    skipped: total.skipped + summary.skipped,
    todo: total.todo + summary.todo,
  });
}

const EMPTY_NODE_SUMMARY = Object.freeze({
  tests: 0,
  pass: 0,
  fail: 0,
  cancelled: 0,
  skipped: 0,
  todo: 0,
});

export function expectedCiNodeTestLaneFiles(lane) {
  return Object.freeze([...laneTestFiles(lane)]);
}

export function validateCiNodeTestLaneCatalog(lanes = CI_NODE_TEST_LANES) {
  const occurrences = new Map();
  for (const [lane, definition] of Object.entries(lanes)) {
    for (const file of laneTestFiles(lane)) {
      const entries = occurrences.get(file) || [];
      entries.push({ lane, testPartition: definition.testPartition || "" });
      occurrences.set(file, entries);
    }
  }
  const expected = [...catalogNodeTests("parallel_safe")].sort();
  const sortedActual = [...occurrences.keys()].sort();
  const duplicates = [];
  const partitioned = [];
  for (const [file, entries] of occurrences) {
    if (entries.length === 1) continue;
    const partitions = entries.map(({ testPartition }) => testPartition).sort();
    if (
      file === "scripts/deploy/production-preflight.test.mjs" &&
      entries.length === 2 &&
      JSON.stringify(partitions) === JSON.stringify(["a", "b"])
    ) {
      partitioned.push(file);
    } else {
      duplicates.push(file);
    }
  }
  return Object.freeze({
    ok:
      duplicates.length === 0 &&
      JSON.stringify(sortedActual) === JSON.stringify(expected),
    duplicates: Object.freeze([...new Set(duplicates)].sort()),
    partitioned: Object.freeze(partitioned.sort()),
    actual: Object.freeze(sortedActual),
    expected: Object.freeze(expected),
  });
}

export function validateCiNodeTestLaneSet(receipts, expected) {
  const definitions = Object.entries(CI_NODE_TEST_LANES);
  const catalog = validateCiNodeTestLaneCatalog();
  if (!catalog.ok) throw new Error("Node test lane catalog is incomplete");
  if (!Array.isArray(receipts) || receipts.length !== definitions.length) {
    throw new Error("Node test fan-in requires every lane exactly once");
  }
  const byLane = new Map();
  for (const receipt of receipts) {
    const definition = CI_NODE_TEST_LANES[receipt?.lane];
    const testFiles = definition
      ? expectedCiNodeTestLaneFiles(receipt.lane)
      : Object.freeze([]);
    if (
      receipt?.schemaVersion !== CI_NODE_TEST_LANE_SCHEMA ||
      !definition ||
      byLane.has(receipt.lane) ||
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
        ciNodeTestLaneCommandFingerprint(receipt.lane) ||
      JSON.stringify(receipt.profiles) !==
        JSON.stringify(definition.profiles) ||
      JSON.stringify(receipt.testFiles) !== JSON.stringify(testFiles) ||
      receipt.testFileCount !== testFiles.length ||
      receipt.testPartition !== (definition.testPartition || null) ||
      !Number.isFinite(Date.parse(receipt.startedAt)) ||
      !Number.isFinite(Date.parse(receipt.finishedAt)) ||
      !Number.isSafeInteger(receipt.durationMs) ||
      receipt.durationMs < 0 ||
      Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt) !==
        receipt.durationMs ||
      !Number.isSafeInteger(receipt.summary?.tests) ||
      receipt.summary.tests <= 0 ||
      receipt.summary.pass !== receipt.summary.tests ||
      receipt.summary.fail !== 0 ||
      receipt.summary.cancelled !== 0 ||
      receipt.summary.skipped !== 0 ||
      receipt.summary.todo !== 0 ||
      !Array.isArray(receipt.profileTimings) ||
      receipt.profileTimings.length !== definition.profiles.length ||
      receipt.profileTimings.some(
        (timing, index) =>
          timing.profile !== definition.profiles[index] ||
          !Number.isSafeInteger(timing.durationMs) ||
          timing.durationMs < 0 ||
          !Number.isSafeInteger(timing.tests) ||
          timing.tests <= 0,
      ) ||
      receipt.profileTimings.reduce(
        (total, timing) => total + timing.tests,
        0,
      ) !== receipt.summary.tests ||
      receipt.redaction?.containsSecrets !== false ||
      receipt.redaction?.containsCredentials !== false ||
      receipt.redaction?.containsRawLogs !== false
    ) {
      throw new Error(
        `Node test lane receipt is invalid: ${receipt?.lane || "unknown"}`,
      );
    }
    byLane.set(receipt.lane, receipt);
  }
  return byLane;
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

export function loadCiNodeTestLaneSet({ root, directory, expected }) {
  const resolved = path.resolve(root, directory);
  const names = readdirSync(resolved).sort();
  const expectedNames = Object.keys(CI_NODE_TEST_LANES)
    .map((lane) => `${lane}.json`)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error("Node test lane artifact directory is ambiguous");
  }
  const receipts = names.map((name) =>
    plainJson(path.join(resolved, name), `Node test lane ${name}`),
  );
  const byLane = validateCiNodeTestLaneSet(receipts, expected);
  const summary = receipts.reduce(
    (total, receipt) => addNodeSummary(total, receipt.summary),
    EMPTY_NODE_SUMMARY,
  );
  return Object.freeze({
    byLane,
    jobs: Object.freeze(
      Object.keys(CI_NODE_TEST_LANES).map((lane) => {
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
    laneCount: byLane.size,
    testFileCount: receipts.reduce(
      (total, receipt) => total + receipt.testFileCount,
      0,
    ),
    durationMs: Math.max(...receipts.map((receipt) => receipt.durationMs)),
    summary,
  });
}

export function aggregateCiNodeTestLanes({
  root = path.resolve(import.meta.dirname, "../.."),
  directory = "output/ci/node-lanes",
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  env = process.env,
} = {}) {
  assertBaseGitLabIdentity(root, env);
  if (env.CI_JOB_NAME !== "quality_node") {
    throw new Error("Node test fan-in job identity is untrusted");
  }
  const plan = readPlan(root, planFile, rangeFile);
  const aggregate = loadCiNodeTestLaneSet({
    root,
    directory,
    expected: expectedFromEnvironment(env, plan),
  });
  process.stdout.write(
    `[qa:test-gate] label=ci-node-lanes status=complete tests=${aggregate.summary.tests} pass=${aggregate.summary.pass} fail=${aggregate.summary.fail} skipped=${aggregate.summary.skipped}\n`,
  );
  process.stdout.write(
    `[qa:node-lanes] status=complete lanes=${aggregate.laneCount} files=${aggregate.testFileCount}\n`,
  );
  return aggregate;
}

export function runCiNodeTestLane({
  lane,
  root = path.resolve(import.meta.dirname, "../.."),
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  out = `output/ci/node-lanes/${lane}.json`,
  env = process.env,
} = {}) {
  assertBaseGitLabIdentity(root, env);
  const definition = CI_NODE_TEST_LANES[lane];
  if (!definition || env.CI_JOB_NAME !== definition.job) {
    throw new Error("Node test lane job identity is untrusted");
  }
  const plan = readPlan(root, planFile, rangeFile);
  const startedEpoch = Date.now();
  const startedAt = new Date(startedEpoch).toISOString();
  const profileTimings = [];
  let summary = EMPTY_NODE_SUMMARY;
  let failure = null;
  const childEnv = {
    ...env,
    QA_BASE_RANGE: plan.range,
    QA_DB_GUARD_RANGE: plan.range,
    QA_FULL_PROFILE: "strict",
  };
  if (definition.testPartition) {
    childEnv.PRODUCTION_PREFLIGHT_TEST_LANE = definition.testPartition;
  }

  const install = spawnSync(
    "pnpm",
    ["--dir", "web", "install", "--frozen-lockfile", "--offline"],
    {
      cwd: root,
      env: childEnv,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  process.stdout.write(install.stdout || "");
  process.stderr.write(install.stderr || "");
  if (install.error || install.status !== 0) {
    failure =
      install.error || new Error("Node test lane dependency install failed");
  }

  if (!failure) {
    const runs = definition.testFiles
      ? [
          {
            profile: definition.profiles[0],
            args: buildNodeTestArgs(laneTestFiles(lane)),
          },
        ]
      : definition.profiles.map((profile) => ({
          profile,
          args: ["scripts/qa/run-node-tests.mjs", "--profile", profile],
        }));
    for (const { profile, args } of runs) {
      const profileStarted = Date.now();
      const result = spawnSync(process.execPath, args, {
        cwd: root,
        env: childEnv,
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      });
      process.stdout.write(result.stdout || "");
      process.stderr.write(result.stderr || "");
      if (result.error) {
        failure = result.error;
        break;
      }
      const profileSummary = verifyNodeTestSummary(
        `${result.stdout || ""}\n${result.stderr || ""}`,
      );
      profileTimings.push({
        profile,
        durationMs: Math.max(0, Date.now() - profileStarted),
        tests: Number(profileSummary.tests || 0),
      });
      if (result.status !== 0 || !profileSummary.ok) {
        failure = new Error(`Node test profile failed: ${profile}`);
        break;
      }
      summary = addNodeSummary(summary, profileSummary);
    }
  }

  if (
    !failure &&
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ) {
    failure = new Error("Node test lane changed the exact-SHA checkout");
  }
  const finishedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: CI_NODE_TEST_LANE_SCHEMA,
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
    commandFingerprint: ciNodeTestLaneCommandFingerprint(lane),
    plan,
    profiles: [...definition.profiles],
    testFiles: [...expectedCiNodeTestLaneFiles(lane)],
    testFileCount: expectedCiNodeTestLaneFiles(lane).length,
    testPartition: definition.testPartition || null,
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - startedEpoch),
    profileTimings,
    summary,
    failure: failure ? safeFailure(failure) : null,
    runtime: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsRawLogs: false,
    },
  };
  atomicJson(path.resolve(root, out), receipt);
  process.stderr.write(
    `[ci-node-test-lane] lane=${lane} status=${receipt.status} receipt=${out}\n`,
  );
  return receipt;
}

function parseArgs(argv) {
  const options = {
    aggregate: false,
    lane: "",
    directory: "output/ci/node-lanes",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--aggregate") {
      options.aggregate = true;
      continue;
    }
    if (["--lane", "--dir", "--out"].includes(arg)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value`);
      }
      if (arg === "--lane") options.lane = value;
      if (arg === "--dir") options.directory = value;
      if (arg === "--out") options.out = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (options.aggregate === Boolean(options.lane)) {
    throw new Error("choose exactly one Node lane or fan-in mode");
  }
  if (options.lane && !Object.hasOwn(CI_NODE_TEST_LANES, options.lane)) {
    throw new Error("--lane is invalid");
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.aggregate) {
      aggregateCiNodeTestLanes({ directory: options.directory });
    } else {
      const receipt = runCiNodeTestLane({
        lane: options.lane,
        out: options.out || `output/ci/node-lanes/${options.lane}.json`,
      });
      process.exitCode = receipt.status === "passed" ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(
      `[ci-node-test-lane] status=blocked reason=${safeFailure(error)}\n`,
    );
    process.exitCode = 2;
  }
}
