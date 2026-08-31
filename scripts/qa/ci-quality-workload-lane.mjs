#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { sha256File } from "../lib/file-digest.mjs";

export const CI_QUALITY_WORKLOAD_LANE_SCHEMA =
  "plush.ci-quality-workload-lane/v1";

export const CI_QUALITY_WORKLOAD_LANES = Object.freeze({
  web: Object.freeze({
    validation: Object.freeze({
      job: "quality_web_validation",
      command: Object.freeze([
        "bash",
        "scripts/qa/full.sh",
        "--ci-shard",
        "web",
        "--ci-lane",
        "validation",
      ]),
      stages: Object.freeze(["web_validation"]),
      substeps: Object.freeze(["eslint", "stylelint", "web_test"]),
      testGates: Object.freeze(["web-all"]),
      resources: Object.freeze({
        pnpm: true,
        postgres: false,
        chromium: false,
        makeData: false,
      }),
    }),
    build: Object.freeze({
      job: "quality_web_build",
      command: Object.freeze([
        "bash",
        "scripts/qa/full.sh",
        "--ci-shard",
        "web",
        "--ci-lane",
        "build",
      ]),
      stages: Object.freeze(["web_build"]),
      substeps: Object.freeze(["production_build", "production_boundary"]),
      testGates: Object.freeze([]),
      resources: Object.freeze({
        pnpm: true,
        postgres: false,
        chromium: false,
        makeData: false,
      }),
    }),
  }),
  server: Object.freeze({
    core: Object.freeze({
      job: "quality_server_core",
      command: Object.freeze([
        "bash",
        "scripts/qa/full.sh",
        "--ci-shard",
        "server",
        "--ci-lane",
        "core",
      ]),
      stages: Object.freeze(["environment_profile", "server"]),
      substeps: Object.freeze([]),
      testGates: Object.freeze(["server-all"]),
      resources: Object.freeze({
        pnpm: false,
        postgres: true,
        chromium: true,
        makeData: true,
      }),
    }),
    critical: Object.freeze({
      job: "quality_server_critical_postgres",
      command: Object.freeze([
        "bash",
        "scripts/qa/full.sh",
        "--ci-shard",
        "server",
        "--ci-lane",
        "critical",
      ]),
      stages: Object.freeze(["critical_postgres"]),
      substeps: Object.freeze([]),
      testGates: Object.freeze([]),
      resources: Object.freeze({
        pnpm: false,
        postgres: true,
        chromium: false,
        makeData: false,
      }),
    }),
  }),
});

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const RANGE_PATTERN = /^(?:[0-9a-f]{40}|HEAD\^)\.\.\.?HEAD$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;

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
  return String(error?.message || error || "quality workload lane failed")
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s]+/giu, "<redacted-url>")
    .replace(/\/(?:Users|home|builds|private|tmp)\/[^\s]+/gu, "<redacted-path>")
    .slice(0, 500);
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

function definitionFor(workload, lane) {
  return CI_QUALITY_WORKLOAD_LANES[workload]?.[lane] || null;
}

export function ciQualityWorkloadLaneCommandFingerprint(workload, lane) {
  const definition = definitionFor(workload, lane);
  if (!definition) throw new Error("quality workload lane is unknown");
  return stableSha256({ workload, lane, definition });
}

export function parseCompletedTestGates(output) {
  const gates = [];
  const seen = new Set();
  for (const match of String(output).matchAll(
    /\[qa:test-gate\]\s+label=([^\s]+)[^\n]*status=complete[^\n]*(?:tests=(\d+)\s+pass=(\d+)\s+fail=(\d+)\s+skipped=(\d+)|run=(\d+)\s+pass=(\d+)\s+fail=(\d+)\s+skip=(\d+))/gu,
  )) {
    const label = match[1];
    if (seen.has(label)) throw new Error(`duplicate test gate: ${label}`);
    seen.add(label);
    const counts = (match[2] ? match.slice(2, 6) : match.slice(6, 10)).map(
      Number,
    );
    gates.push(
      Object.freeze({
        label,
        executed: counts[0],
        passed: counts[1],
        failed: counts[2],
        skipped: counts[3],
      }),
    );
  }
  return Object.freeze(gates);
}

function validCounts(value, { allowZero = false } = {}) {
  return (
    value &&
    ["executed", "passed", "failed", "skipped"].every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
    ) &&
    value.passed + value.failed + value.skipped === value.executed &&
    (allowZero || value.executed > 0)
  );
}

export function validateCiQualityWorkloadLaneReceipt(
  receipt,
  expected,
  workload,
  lane,
) {
  const definition = definitionFor(workload, lane);
  const expectedSubsteps = definition?.substeps || [];
  const expectedTestGates = definition?.testGates || [];
  const actualStages = receipt?.stageTimings?.map((item) => item.id) || [];
  const actualSubsteps = receipt?.substepTimings?.map((item) => item.id) || [];
  const actualTestGates = receipt?.testGates?.map((item) => item.label) || [];
  if (
    receipt?.schemaVersion !== CI_QUALITY_WORKLOAD_LANE_SCHEMA ||
    !definition ||
    receipt.workload !== workload ||
    receipt.lane !== lane ||
    receipt.shard !== workload ||
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
    !RANGE_PATTERN.test(String(receipt.plan?.range || "")) ||
    receipt.commandFingerprint !==
      ciQualityWorkloadLaneCommandFingerprint(workload, lane) ||
    JSON.stringify(receipt.expectedStages) !==
      JSON.stringify(definition.stages) ||
    JSON.stringify(actualStages) !== JSON.stringify(definition.stages) ||
    receipt.stageTimings.some(
      (item) =>
        item.status !== "passed" ||
        !Number.isSafeInteger(item.durationMs) ||
        item.durationMs < 0,
    ) ||
    JSON.stringify(actualSubsteps) !== JSON.stringify(expectedSubsteps) ||
    receipt.substepTimings.some(
      (item) =>
        item.stage !== "web" ||
        item.status !== "passed" ||
        !Number.isSafeInteger(item.durationMs) ||
        item.durationMs < 0,
    ) ||
    JSON.stringify(actualTestGates) !== JSON.stringify(expectedTestGates) ||
    receipt.testGates.some(
      (item) =>
        !validCounts(item) ||
        item.failed !== 0 ||
        item.skipped !== 0 ||
        item.passed !== item.executed,
    ) ||
    !validCounts(receipt.summary) ||
    receipt.summary.failed !== 0 ||
    receipt.summary.skipped !== 0 ||
    receipt.summary.passed !== receipt.summary.executed ||
    !Number.isFinite(Date.parse(receipt.startedAt)) ||
    !Number.isFinite(Date.parse(receipt.finishedAt)) ||
    !Number.isSafeInteger(receipt.durationMs) ||
    receipt.durationMs < 0 ||
    Date.parse(receipt.finishedAt) - Date.parse(receipt.startedAt) !==
      receipt.durationMs ||
    receipt.cleanupPassed !== true ||
    receipt.failure !== null ||
    receipt.redaction?.containsSecrets !== false ||
    receipt.redaction?.containsCredentials !== false ||
    receipt.redaction?.containsFullDsn !== false ||
    receipt.redaction?.containsAbsoluteWorkspacePaths !== false ||
    receipt.redaction?.containsRawLogs !== false
  ) {
    throw new Error(
      `quality workload lane receipt is invalid: ${workload}/${lane}`,
    );
  }
  if (
    (definition.resources.postgres
      ? receipt.invariants?.databaseCleanup !== "passed"
      : receipt.invariants?.databaseCleanup !== "not-applicable") ||
    (definition.resources.chromium
      ? receipt.invariants?.chromiumSandboxCleanup !== "passed" ||
        receipt.invariants?.playwrightRuntimeCleanup !== "passed"
      : receipt.invariants?.chromiumSandboxCleanup !== "not-applicable" ||
        receipt.invariants?.playwrightRuntimeCleanup !== "not-applicable") ||
    (definition.resources.makeData
      ? receipt.invariants?.makeData !== "passed"
      : receipt.invariants?.makeData !== "not-applicable") ||
    (workload === "web" && lane === "build"
      ? !SHA256_PATTERN.test(String(receipt.invariants?.webBuildSha256 || ""))
      : receipt.invariants?.webBuildSha256 !== null) ||
    (workload === "server"
      ? !SHA256_PATTERN.test(
          String(receipt.invariants?.criticalPostgresRegistrySha256 || ""),
        )
      : receipt.invariants?.criticalPostgresRegistrySha256 !== null)
  ) {
    throw new Error(
      `quality workload lane invariant is incomplete: ${workload}/${lane}`,
    );
  }
  return receipt;
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

export function validateCiQualityWorkloadLaneSet(receipts, expected, workload) {
  const definitions = Object.entries(CI_QUALITY_WORKLOAD_LANES[workload] || {});
  if (!definitions.length || receipts?.length !== definitions.length) {
    throw new Error(
      `quality ${workload} fan-in requires every lane exactly once`,
    );
  }
  const byLane = new Map();
  for (const receipt of receipts) {
    if (byLane.has(receipt?.lane)) {
      throw new Error(`quality ${workload} fan-in contains a duplicate lane`);
    }
    validateCiQualityWorkloadLaneReceipt(
      receipt,
      expected,
      workload,
      receipt?.lane,
    );
    byLane.set(receipt.lane, receipt);
  }
  for (const [lane] of definitions) {
    if (!byLane.has(lane)) {
      throw new Error(`quality ${workload} fan-in is missing a lane`);
    }
  }
  const stages = receipts.flatMap((receipt) => receipt.stageTimings);
  const expectedStages = definitions.flatMap(
    ([, definition]) => definition.stages,
  );
  if (
    stages.length !== expectedStages.length ||
    new Set(stages.map((item) => item.id)).size !== expectedStages.length ||
    expectedStages.some((id) => !stages.some((item) => item.id === id))
  ) {
    throw new Error(`quality ${workload} lane stage union is incomplete`);
  }
  return byLane;
}

export function loadCiQualityWorkloadLaneSet({
  root,
  directory = "output/ci/workload-lanes",
  expected,
  workload,
}) {
  const target = path.resolve(root, directory, workload);
  const names = readdirSync(target).sort();
  const expectedNames = Object.keys(CI_QUALITY_WORKLOAD_LANES[workload] || {})
    .map((lane) => `${lane}.json`)
    .sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error(`quality ${workload} lane artifact directory is ambiguous`);
  }
  const receipts = names.map((name) =>
    plainJson(path.join(target, name), `quality ${workload} lane ${name}`),
  );
  const byLane = validateCiQualityWorkloadLaneSet(receipts, expected, workload);
  const definitions = Object.keys(CI_QUALITY_WORKLOAD_LANES[workload]);
  const ordered = definitions.map((lane) => byLane.get(lane));
  const jobs = ordered.map((receipt) => ({
    lane: receipt.lane,
    job: receipt.job.name,
    jobId: receipt.job.id,
    startedAt: receipt.startedAt,
    finishedAt: receipt.finishedAt,
    durationMs: receipt.durationMs,
  }));
  const summary = ordered.reduce(
    (total, receipt) => ({
      executed: total.executed + receipt.summary.executed,
      passed: total.passed + receipt.summary.passed,
      failed: total.failed + receipt.summary.failed,
      skipped: total.skipped + receipt.summary.skipped,
    }),
    { executed: 0, passed: 0, failed: 0, skipped: 0 },
  );
  const cleanup = ordered.map((receipt) => ({
    lane: receipt.lane,
    database: receipt.invariants.databaseCleanup,
    chromiumSandbox: receipt.invariants.chromiumSandboxCleanup,
    playwrightRuntime: receipt.invariants.playwrightRuntimeCleanup,
    makeData: receipt.invariants.makeData,
  }));
  const criticalPostgresRegistrySha256 =
    workload === "server"
      ? ordered[0].invariants.criticalPostgresRegistrySha256
      : null;
  if (
    workload === "server" &&
    ordered.some(
      (receipt) =>
        receipt.invariants.criticalPostgresRegistrySha256 !==
        criticalPostgresRegistrySha256,
    )
  ) {
    throw new Error("quality server lane PostgreSQL registry identity drifted");
  }
  return Object.freeze({
    status: "passed",
    workload,
    laneCount: ordered.length,
    durationMs: Math.max(...ordered.map((receipt) => receipt.durationMs)),
    jobs: Object.freeze(jobs),
    stageIds: Object.freeze(
      ordered.flatMap((receipt) =>
        receipt.stageTimings.map((stage) => stage.id),
      ),
    ),
    stageTimings: Object.freeze(
      ordered.flatMap((receipt) => receipt.stageTimings),
    ),
    substepTimings: Object.freeze(
      ordered.flatMap((receipt) => receipt.substepTimings),
    ),
    testGates: Object.freeze(ordered.flatMap((receipt) => receipt.testGates)),
    summary: Object.freeze(summary),
    cleanup: Object.freeze(cleanup.map((entry) => Object.freeze(entry))),
    webBuildSha256:
      workload === "web" ? byLane.get("build").invariants.webBuildSha256 : null,
    criticalPostgresRegistrySha256,
  });
}

function readPlan(root, planFile, rangeFile) {
  const planPath = path.resolve(root, planFile);
  const rangePath = path.resolve(root, rangeFile);
  const plan = plainJson(planPath, "CI plan");
  const range = readFileSync(rangePath, "utf8").trim();
  if (
    plan?.schemaVersion !== "plush.ci-plan/v2" ||
    plan?.effectiveMode !== "full" ||
    !RANGE_PATTERN.test(range)
  ) {
    throw new Error("quality workload lane CI plan is invalid");
  }
  return Object.freeze({
    range,
    planSha256: sha256File(planPath),
    rangeSha256: sha256File(rangePath),
  });
}

function assertFanInEnvironment(env, workload) {
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
    env.CI_JOB_NAME !== `quality_${workload}` ||
    env.RELEASE_SHA
  ) {
    throw new Error(`quality ${workload} fan-in identity is untrusted`);
  }
}

export function aggregateCiQualityWorkloadLanes({
  workload,
  root = path.resolve(import.meta.dirname, "../.."),
  directory = "output/ci/workload-lanes",
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  env = process.env,
} = {}) {
  assertFanInEnvironment(env, workload);
  const plan = readPlan(root, planFile, rangeFile);
  const aggregate = loadCiQualityWorkloadLaneSet({
    root,
    directory,
    expected: expectedFromEnvironment(env, plan),
    workload,
  });
  if (workload === "web") {
    process.stdout.write("[qa:stage] gate=strict id=web status=running\n");
    for (const substep of aggregate.substepTimings) {
      process.stdout.write(
        `[qa:substep] gate=strict stage=web id=${substep.id} status=passed durationMs=${substep.durationMs}\n`,
      );
    }
    for (const gate of aggregate.testGates) {
      process.stdout.write(
        `[qa:test-gate] label=${gate.label} status=complete tests=${gate.executed} pass=${gate.passed} fail=${gate.failed} skipped=${gate.skipped}\n`,
      );
    }
    process.stdout.write(
      `[qa:stage] gate=strict id=web status=passed durationMs=${aggregate.durationMs}\n`,
    );
  } else if (workload === "server") {
    for (const stage of aggregate.stageTimings) {
      process.stdout.write(
        `[qa:stage] gate=strict id=${stage.id} status=running\n`,
      );
      process.stdout.write(
        `[qa:stage] gate=strict id=${stage.id} status=passed durationMs=${stage.durationMs}\n`,
      );
    }
    for (const gate of aggregate.testGates) {
      process.stdout.write(
        `[qa:test-gate] label=${gate.label} status=complete tests=${gate.executed} pass=${gate.passed} fail=${gate.failed} skipped=${gate.skipped}\n`,
      );
    }
  } else {
    throw new Error("quality workload fan-in is unknown");
  }
  process.stdout.write(
    `[qa:workload-lanes] status=complete workload=${workload} lanes=${aggregate.laneCount}\n`,
  );
  return aggregate;
}

export function hasCompleteCiQualityWorkloadLaneEvidence(value, workload) {
  const definitions = Object.entries(CI_QUALITY_WORKLOAD_LANES[workload] || {});
  const expectedStageIds = definitions.flatMap(
    ([, definition]) => definition.stages,
  );
  const expectedTestGates = definitions.flatMap(
    ([, definition]) => definition.testGates,
  );
  return (
    value?.status === "passed" &&
    value.workload === workload &&
    value.laneCount === definitions.length &&
    Number.isSafeInteger(value.durationMs) &&
    value.durationMs >= 0 &&
    Array.isArray(value.jobs) &&
    value.jobs.length === definitions.length &&
    value.jobs.every((job, index) => {
      const [lane, definition] = definitions[index];
      return (
        job?.lane === lane &&
        job.job === definition.job &&
        /^\d+$/u.test(String(job.jobId || "")) &&
        Number.isFinite(Date.parse(job.startedAt)) &&
        Number.isFinite(Date.parse(job.finishedAt)) &&
        Number.isSafeInteger(job.durationMs) &&
        job.durationMs >= 0 &&
        Date.parse(job.finishedAt) - Date.parse(job.startedAt) ===
          job.durationMs
      );
    }) &&
    JSON.stringify(value.stageIds) === JSON.stringify(expectedStageIds) &&
    Array.isArray(value.testGates) &&
    JSON.stringify(value.testGates.map((gate) => gate.label)) ===
      JSON.stringify(expectedTestGates) &&
    value.testGates.every(
      (gate) =>
        validCounts(gate) &&
        gate.failed === 0 &&
        gate.skipped === 0 &&
        gate.passed === gate.executed,
    ) &&
    validCounts(value.summary) &&
    value.summary.failed === 0 &&
    value.summary.skipped === 0 &&
    value.summary.passed === value.summary.executed &&
    Array.isArray(value.cleanup) &&
    value.cleanup.length === definitions.length &&
    value.cleanup.every((entry, index) => {
      const [lane, definition] = definitions[index];
      return (
        entry?.lane === lane &&
        entry.database ===
          (definition.resources.postgres ? "passed" : "not-applicable") &&
        entry.chromiumSandbox ===
          (definition.resources.chromium ? "passed" : "not-applicable") &&
        entry.playwrightRuntime ===
          (definition.resources.chromium ? "passed" : "not-applicable") &&
        entry.makeData ===
          (definition.resources.makeData ? "passed" : "not-applicable")
      );
    }) &&
    (workload !== "web" ||
      SHA256_PATTERN.test(String(value.webBuildSha256 || ""))) &&
    (workload !== "server" ||
      SHA256_PATTERN.test(String(value.criticalPostgresRegistrySha256 || "")))
  );
}

function parseArgs(argv) {
  const options = { workload: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--aggregate" && value && !value.startsWith("--")) {
      options.workload = value;
      index += 1;
      continue;
    }
    throw new Error(`invalid argument: ${arg}`);
  }
  if (!Object.hasOwn(CI_QUALITY_WORKLOAD_LANES, options.workload)) {
    throw new Error("--aggregate requires web or server");
  }
  return options;
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    aggregateCiQualityWorkloadLanes(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(
      `[ci-quality-workload-lane] status=blocked reason=${safeFailure(error)}\n`,
    );
    process.exitCode = 2;
  }
}
