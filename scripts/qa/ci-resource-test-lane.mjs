#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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

import {
  BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES,
  bootstrapProductionAdminTestLaneCases,
} from "../deploy/bootstrap-production-admin.test-cases.mjs";
import { sha256File } from "../lib/file-digest.mjs";
import { NODE_TEST_GROUPS } from "./node-test-groups.mjs";
import { verifyNodeTestSummary } from "./verify-node-test-summary.mjs";

export const CI_RESOURCE_TEST_LANE_SCHEMA = "plush.ci-resource-test-lane/v1";
export const CI_RESOURCE_TEST_LANES = Object.freeze({
  contract: Object.freeze({
    job: "quality_resource_contract",
    testFile: "scripts/deploy/bootstrap-production-admin.contract.test.mjs",
  }),
  runtime: Object.freeze({
    job: "quality_resource_runtime",
    testFile: "scripts/deploy/bootstrap-production-admin.runtime.test.mjs",
  }),
});

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\^)\.\.\.?HEAD$/u;
const FIXTURE_PREFIX = "bootstrap-production-admin-";

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
  return String(error?.message || error || "resource test lane failed")
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
    throw new Error("resource test lane GitLab identity is untrusted");
  }
  if (
    runGit(root, ["rev-parse", "HEAD"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["rev-parse", "origin/main"]) !== env.CI_COMMIT_SHA ||
    runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])
  ) {
    throw new Error("resource test lane requires clean exact protected main");
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
    throw new Error("resource test lane CI plan is invalid");
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

function fixtureInventory(root) {
  const directory = path.join(root, "output", "qa-tmp");
  if (!existsSync(directory)) return Object.freeze([]);
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error("resource fixture root is not a plain directory");
  }
  return Object.freeze(
    readdirSync(directory)
      .map((name) => {
        const entry = lstatSync(path.join(directory, name));
        return Object.freeze({
          name,
          device: entry.dev,
          inode: entry.ino,
          type: entry.isDirectory()
            ? "directory"
            : entry.isFile()
              ? "file"
              : entry.isSymbolicLink()
                ? "symlink"
                : "other",
        });
      })
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
}

function cleanNewFixtureRoots(root, before, after) {
  const beforeNames = new Set(before.map(({ name }) => name));
  const added = after.filter(({ name }) => !beforeNames.has(name));
  for (const entry of added) {
    if (entry.type !== "directory" || !entry.name.startsWith(FIXTURE_PREFIX)) {
      throw new Error("resource test lane created an ambiguous fixture entry");
    }
    rmSync(path.join(root, "output", "qa-tmp", entry.name), {
      recursive: true,
      force: true,
    });
  }
  return added;
}

function laneCases(lane) {
  return bootstrapProductionAdminTestLaneCases(lane);
}

function laneScenarioCount(lane) {
  return laneCases(lane).reduce(
    (total, definition) => total + definition.scenarioCount,
    0,
  );
}

export function ciResourceTestLaneCommandFingerprint(
  lane,
  root = path.resolve(import.meta.dirname, "../.."),
) {
  const definition = CI_RESOURCE_TEST_LANES[lane];
  if (!definition) throw new Error(`unknown resource test lane: ${lane}`);
  const sources = [
    "scripts/deploy/bootstrap-production-admin.test-cases.mjs",
    "scripts/deploy/bootstrap-production-admin.test-support.mjs",
    definition.testFile,
    "scripts/deploy/bootstrap-production-admin.sh",
  ];
  return stableSha256({
    lane,
    definition,
    cases: laneCases(lane),
    sources: sources.map((file) => ({
      file,
      sha256: sha256File(path.join(root, file)),
    })),
  });
}

export function validateCiResourceTestLaneCatalog() {
  const lanes = Object.keys(CI_RESOURCE_TEST_LANES);
  const actualFiles = lanes.map(
    (lane) => CI_RESOURCE_TEST_LANES[lane].testFile,
  );
  const actualCases = lanes.flatMap((lane) => laneCases(lane));
  const ids = actualCases.map(({ id }) => id);
  const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
  const expectedIds = BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES.map(({ id }) => id);
  const ok =
    duplicateIds.length === 0 &&
    JSON.stringify([...ids].sort()) ===
      JSON.stringify([...expectedIds].sort()) &&
    JSON.stringify(actualFiles) ===
      JSON.stringify(NODE_TEST_GROUPS.resource_sensitive) &&
    actualCases.reduce(
      (total, definition) => total + definition.scenarioCount,
      0,
    ) === 86;
  return Object.freeze({
    ok,
    caseCount: actualCases.length,
    scenarioCount: actualCases.reduce(
      (total, definition) => total + definition.scenarioCount,
      0,
    ),
    duplicateIds: Object.freeze([...new Set(duplicateIds)].sort()),
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

export function validateCiResourceTestLaneSet(
  receipts,
  expected,
  { root } = {},
) {
  const lanes = Object.keys(CI_RESOURCE_TEST_LANES);
  if (!validateCiResourceTestLaneCatalog().ok) {
    throw new Error("resource test lane catalog is incomplete");
  }
  if (!Array.isArray(receipts) || receipts.length !== lanes.length) {
    throw new Error("resource test fan-in requires every lane exactly once");
  }
  const byLane = new Map();
  for (const receipt of receipts) {
    const definition = CI_RESOURCE_TEST_LANES[receipt?.lane];
    const cases = definition ? laneCases(receipt.lane) : [];
    if (
      receipt?.schemaVersion !== CI_RESOURCE_TEST_LANE_SCHEMA ||
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
        ciResourceTestLaneCommandFingerprint(receipt.lane, root) ||
      receipt.testFile !== definition.testFile ||
      JSON.stringify(receipt.caseIds) !==
        JSON.stringify(cases.map(({ id }) => id)) ||
      receipt.caseCount !== cases.length ||
      receipt.scenarioCount !== laneScenarioCount(receipt.lane) ||
      receipt.caseDigest !== stableSha256(cases) ||
      !Number.isFinite(Date.parse(receipt.startedAt)) ||
      !Number.isFinite(Date.parse(receipt.finishedAt)) ||
      !Number.isSafeInteger(receipt.durationMs) ||
      receipt.durationMs < 0 ||
      Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt) !==
        receipt.durationMs ||
      receipt.summary?.tests !== cases.length ||
      receipt.summary?.pass !== cases.length ||
      receipt.summary?.fail !== 0 ||
      receipt.summary?.cancelled !== 0 ||
      receipt.summary?.skipped !== 0 ||
      receipt.summary?.todo !== 0 ||
      !Number.isSafeInteger(receipt.cleanup?.preexistingEntryCount) ||
      receipt.cleanup?.newEntryCount !== 0 ||
      receipt.cleanup?.testCleanupGreen !== true ||
      receipt.cleanup?.finalInventoryPreserved !== true ||
      receipt.redaction?.containsSecrets !== false ||
      receipt.redaction?.containsCredentials !== false ||
      receipt.redaction?.containsRawLogs !== false
    ) {
      throw new Error(
        `resource test lane receipt is invalid: ${receipt?.lane || "unknown"}`,
      );
    }
    byLane.set(receipt.lane, receipt);
  }
  return byLane;
}

export function loadCiResourceTestLaneSet({ root, directory, expected }) {
  const resolved = path.resolve(root, directory);
  const names = readdirSync(resolved).sort();
  const expectedNames = Object.keys(CI_RESOURCE_TEST_LANES)
    .map((lane) => `${lane}.json`)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error("resource test lane artifact directory is ambiguous");
  }
  const receipts = names.map((name) =>
    plainJson(path.join(resolved, name), `resource test lane ${name}`),
  );
  const byLane = validateCiResourceTestLaneSet(receipts, expected, { root });
  return Object.freeze({
    byLane,
    jobs: Object.freeze(
      Object.keys(CI_RESOURCE_TEST_LANES).map((lane) => {
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
    caseCount: receipts.reduce(
      (total, receipt) => total + receipt.caseCount,
      0,
    ),
    scenarioCount: receipts.reduce(
      (total, receipt) => total + receipt.scenarioCount,
      0,
    ),
    durationMs: Math.max(...receipts.map((receipt) => receipt.durationMs)),
    summary: Object.freeze({
      tests: receipts.reduce(
        (total, receipt) => total + receipt.summary.tests,
        0,
      ),
      pass: receipts.reduce(
        (total, receipt) => total + receipt.summary.pass,
        0,
      ),
      fail: 0,
      cancelled: 0,
      skipped: 0,
      todo: 0,
    }),
  });
}

export function aggregateCiResourceTestLanes({
  root = path.resolve(import.meta.dirname, "../.."),
  directory = "output/ci/resource-lanes",
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  env = process.env,
} = {}) {
  assertBaseGitLabIdentity(root, env);
  if (env.CI_JOB_NAME !== "quality_resource") {
    throw new Error("resource test fan-in job identity is untrusted");
  }
  const plan = readPlan(root, planFile, rangeFile);
  const aggregate = loadCiResourceTestLaneSet({
    root,
    directory,
    expected: expectedFromEnvironment(env, plan),
  });
  process.stdout.write(
    `[qa:test-gate] label=ci-resource-lanes status=complete tests=${aggregate.summary.tests} pass=${aggregate.summary.pass} fail=0 skipped=0\n`,
  );
  process.stdout.write(
    `[qa:resource-lanes] status=complete lanes=${aggregate.laneCount} cases=${aggregate.caseCount} scenarios=${aggregate.scenarioCount}\n`,
  );
  return aggregate;
}

export function runCiResourceTestLane({
  lane,
  root = path.resolve(import.meta.dirname, "../.."),
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  out = `output/ci/resource-lanes/${lane}.json`,
  env = process.env,
} = {}) {
  assertBaseGitLabIdentity(root, env);
  const definition = CI_RESOURCE_TEST_LANES[lane];
  if (!definition || env.CI_JOB_NAME !== definition.job) {
    throw new Error("resource test lane job identity is untrusted");
  }
  if (!validateCiResourceTestLaneCatalog().ok) {
    throw new Error("resource test lane catalog is incomplete");
  }
  const plan = readPlan(root, planFile, rangeFile);
  const before = fixtureInventory(root);
  const startedEpoch = Date.now();
  const startedAt = new Date(startedEpoch).toISOString();
  let failure = null;
  let summary = {
    tests: 0,
    pass: 0,
    fail: 0,
    cancelled: 0,
    skipped: 0,
    todo: 0,
  };
  const result = spawnSync(
    process.execPath,
    [
      "--test",
      "--test-reporter=tap",
      "--test-concurrency=1",
      definition.testFile,
    ],
    {
      cwd: root,
      env,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) {
    failure = result.error;
  } else {
    summary = verifyNodeTestSummary(
      `${result.stdout || ""}\n${result.stderr || ""}`,
    );
    if (
      result.status !== 0 ||
      !summary.ok ||
      summary.tests !== laneCases(lane).length
    ) {
      failure = new Error(`resource test lane failed: ${lane}`);
    }
  }

  const afterTest = fixtureInventory(root);
  let added = [];
  try {
    added = cleanNewFixtureRoots(root, before, afterTest);
  } catch (error) {
    failure ||= error;
  }
  const finalInventory = fixtureInventory(root);
  const inventoryPreserved =
    JSON.stringify(finalInventory) === JSON.stringify(before);
  if (added.length > 0 || !inventoryPreserved) {
    failure ||= new Error("resource test lane fixture cleanup was incomplete");
  }
  if (runGit(root, ["status", "--porcelain=v1", "--untracked-files=all"])) {
    failure ||= new Error("resource test lane changed the exact-SHA checkout");
  }

  const cases = laneCases(lane);
  const finishedAt = new Date().toISOString();
  const receipt = {
    schemaVersion: CI_RESOURCE_TEST_LANE_SCHEMA,
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
    commandFingerprint: ciResourceTestLaneCommandFingerprint(lane, root),
    plan,
    testFile: definition.testFile,
    caseIds: cases.map(({ id }) => id),
    caseCount: cases.length,
    scenarioCount: laneScenarioCount(lane),
    caseDigest: stableSha256(cases),
    startedAt,
    finishedAt,
    durationMs: Math.max(0, Date.parse(finishedAt) - startedEpoch),
    summary,
    cleanup: {
      preexistingEntryCount: before.length,
      newEntryCount: added.length,
      testCleanupGreen: added.length === 0,
      finalInventoryPreserved: inventoryPreserved,
    },
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
    `[ci-resource-test-lane] lane=${lane} status=${receipt.status} receipt=${out}\n`,
  );
  return receipt;
}

function parseArgs(argv) {
  const options = {
    aggregate: false,
    lane: "",
    directory: "output/ci/resource-lanes",
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
    throw new Error("choose exactly one resource lane or fan-in mode");
  }
  if (options.lane && !Object.hasOwn(CI_RESOURCE_TEST_LANES, options.lane)) {
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
      aggregateCiResourceTestLanes({ directory: options.directory });
    } else {
      const receipt = runCiResourceTestLane({
        lane: options.lane,
        out: options.out || `output/ci/resource-lanes/${options.lane}.json`,
      });
      process.exitCode = receipt.status === "passed" ? 0 : 1;
    }
  } catch (error) {
    process.stderr.write(
      `[ci-resource-test-lane] status=blocked reason=${safeFailure(error)}\n`,
    );
    process.exitCode = 2;
  }
}
