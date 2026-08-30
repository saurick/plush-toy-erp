#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  copyFileSync,
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
  buildDevWorkbenchReceipt,
  getDevWorkbenchGitContext,
  writeDevWorkbenchReceipt,
} from "./dev-workbench-receipt.mjs";
import {
  buildExactShaPlan,
  buildStrictReceiptIdentity,
  finalizeExactShaGateFromReceipt,
} from "./exact-sha-gate.mjs";
import {
  RECEIPT_GATE_PARALLEL_STAGE_IDS,
  RECEIPT_GATE_STAGE_IDS,
} from "./run-gate-with-receipt.mjs";
import {
  CI_QUALITY_SHARDS,
  CI_QUALITY_SHARD_SCHEMA,
} from "./ci-quality-shard.mjs";

export const CI_QUALITY_AGGREGATE_SCHEMA = "plush.gitlab-strict-aggregate/v1";
export const CI_EVIDENCE_MANIFEST_SCHEMA = "plush.gitlab-ci-evidence/v1";

export function matchesStrictSourceArchive(sourceIntegrity, strictIdentity) {
  return (
    sourceIntegrity?.status === "passed" &&
    sourceIntegrity.archiveSha256 ===
      `sha256:${strictIdentity.sourceArchiveSha256}`
  );
}
const TRUST_SCHEMA = "plush.gitlab-ci-trust/v1";
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
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
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 4 * 1024 * 1024) {
    throw new Error(`${label} is not a bounded plain file`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function assertAggregateEnvironment(env) {
  if (
    env.GITLAB_CI !== "true" ||
    env.CI_PROJECT_PATH !== "saurick/plush-toy-erp" ||
    env.CI_DEFAULT_BRANCH !== "main" ||
    env.CI_COMMIT_BRANCH !== "main" ||
    env.CI_COMMIT_REF_PROTECTED !== "true" ||
    !["push", "web"].includes(env.CI_PIPELINE_SOURCE) ||
    env.CI_JOB_NAME !== "quality_aggregate" ||
    !SHA_PATTERN.test(String(env.CI_COMMIT_SHA || "")) ||
    !/^\d+$/u.test(String(env.CI_PIPELINE_ID || "")) ||
    !/^\d+$/u.test(String(env.CI_PIPELINE_IID || "")) ||
    !/^\d+$/u.test(String(env.CI_JOB_ID || "")) ||
    env.RELEASE_SHA
  ) {
    throw new Error("quality aggregate GitLab identity is untrusted");
  }
}

function addCounts(left, right) {
  return Object.freeze({
    executed: left.executed + right.executed,
    passed: left.passed + right.passed,
    failed: left.failed + right.failed,
    skipped: left.skipped + right.skipped,
  });
}

const ZERO_COUNTS = Object.freeze({ executed: 0, passed: 0, failed: 0, skipped: 0 });

function validateCounts(value, label, { allowZero = true } = {}) {
  if (
    !value ||
    !["executed", "passed", "failed", "skipped"].every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
    ) ||
    value.passed + value.failed + value.skipped !== value.executed ||
    (!allowZero && value.executed === 0)
  ) {
    throw new Error(`${label} counts are invalid`);
  }
  return value;
}

export function validateCiQualityShardSet(receipts, expected) {
  const definitions = Object.entries(CI_QUALITY_SHARDS);
  if (!Array.isArray(receipts) || receipts.length !== definitions.length) {
    throw new Error("quality aggregate requires every shard exactly once");
  }
  const byShard = new Map();
  for (const receipt of receipts) {
    const definition = CI_QUALITY_SHARDS[receipt?.shard];
    if (
      receipt?.schemaVersion !== CI_QUALITY_SHARD_SCHEMA ||
      !definition ||
      byShard.has(receipt.shard) ||
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
      receipt.cleanupPassed !== true ||
      receipt.redaction?.containsSecrets !== false ||
      receipt.redaction?.containsCredentials !== false ||
      receipt.redaction?.containsFullDsn !== false ||
      receipt.redaction?.containsAbsoluteWorkspacePaths !== false ||
      receipt.redaction?.containsRawLogs !== false ||
      receipt.plan?.planSha256 !== expected.planSha256 ||
      receipt.plan?.rangeSha256 !== expected.rangeSha256 ||
      receipt.plan?.range !== expected.range ||
      receipt.commandFingerprint !== stableSha256({ shard: receipt.shard, definition }) ||
      JSON.stringify(receipt.expectedStages) !== JSON.stringify(definition.stages) ||
      !Array.isArray(receipt.stageTimings) ||
      receipt.stageTimings.length !== definition.stages.length ||
      receipt.stageTimings.some(
        (stage) => !definition.stages.includes(stage.id) || stage.status !== "passed",
      )
    ) {
      throw new Error(`quality shard receipt is invalid: ${receipt?.shard || "unknown"}`);
    }
    validateCounts(receipt.summary, `quality shard ${receipt.shard}`, { allowZero: false });
    if (
      receipt.summary.failed !== 0 ||
      receipt.summary.skipped !== 0 ||
      receipt.summary.passed !== receipt.summary.executed
    ) {
      throw new Error(`quality shard did not prove all-passed execution: ${receipt.shard}`);
    }
    byShard.set(receipt.shard, receipt);
  }
  const actualStages = receipts.flatMap((receipt) => receipt.stageTimings.map((stage) => stage.id));
  const expectedStages = RECEIPT_GATE_STAGE_IDS.strict;
  if (
    actualStages.length !== expectedStages.length ||
    new Set(actualStages).size !== expectedStages.length ||
    expectedStages.some((stage) => !actualStages.includes(stage))
  ) {
    throw new Error("quality shard stage union is incomplete");
  }
  return byShard;
}

function validateTrust(trust, expected) {
  if (
    trust?.schemaVersion !== TRUST_SCHEMA ||
    trust?.repository !== expected.repository ||
    trust?.gitSha !== expected.gitSha ||
    trust?.pipeline?.id !== expected.pipelineId ||
    trust?.pipeline?.iid !== expected.pipelineIid ||
    trust?.pipeline?.source !== expected.pipelineSource ||
    trust?.job?.name !== "plan" ||
    !/^\d+$/u.test(String(trust?.job?.id || "")) ||
    trust?.ref !== "refs/heads/main" ||
    trust?.protectedDefaultBranch !== true ||
    trust?.range !== expected.range ||
    trust?.planSha256 !== expected.planSha256 ||
    trust?.rangeSha256 !== expected.rangeSha256 ||
    !SHA_PATTERN.test(String(trust?.trustedConfigCommit || "")) ||
    !SHA_PATTERN.test(String(trust?.trustedConfigBlob || "")) ||
    !/^8\.30\.1$/u.test(String(trust?.gitleaksVersion || "")) ||
    trust?.gitleaksStatus !== "passed"
  ) {
    throw new Error("quality aggregate trust bootstrap evidence is invalid");
  }
  return trust;
}

function evidenceFiles(root, evidenceDir) {
  return ["terminal.json", "receipt.json"].map((name) => ({
    name,
    sha256: sha256File(path.join(evidenceDir, name)),
  }));
}

export async function aggregateCiQuality({
  root = path.resolve(import.meta.dirname, "../.."),
  shardsDir = "output/ci/shards",
  planFile = "output/ci/plan.json",
  rangeFile = "output/ci/range.txt",
  trustFile = "output/ci/trust.json",
  aggregateFile = "output/ci/quality-aggregate.json",
  evidenceDir = "output/ci/evidence",
  env = process.env,
  now = () => new Date(),
} = {}) {
  assertAggregateEnvironment(env);
  const planPath = path.resolve(root, planFile);
  const rangePath = path.resolve(root, rangeFile);
  const range = readFileSync(rangePath, "utf8").trim();
  const expected = Object.freeze({
    repository: env.CI_PROJECT_PATH,
    gitSha: env.CI_COMMIT_SHA,
    pipelineId: String(env.CI_PIPELINE_ID),
    pipelineIid: String(env.CI_PIPELINE_IID),
    pipelineSource: env.CI_PIPELINE_SOURCE,
    planSha256: sha256File(planPath),
    rangeSha256: sha256File(rangePath),
    range,
  });
  const trust = validateTrust(plainJson(path.resolve(root, trustFile), "CI trust receipt"), expected);
  const directory = path.resolve(root, shardsDir);
  const names = readdirSync(directory).sort();
  const expectedNames = Object.keys(CI_QUALITY_SHARDS).map((name) => `${name}.json`).sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) {
    throw new Error("quality aggregate shard artifact directory is ambiguous");
  }
  const receipts = names.map((name) => plainJson(path.join(directory, name), `quality shard ${name}`));
  const byShard = validateCiQualityShardSet(receipts, expected);
  const strictIdentity = buildStrictReceiptIdentity(root, env.CI_COMMIT_SHA, env);
  const sourceIntegrity = byShard.get("node").invariants.sourceIntegrity;
  if (
    !matchesStrictSourceArchive(sourceIntegrity, strictIdentity) ||
    sourceIntegrity.repositoryBoundary !== "passed" ||
    sourceIntegrity.overlayCustomer !== "yoyoosun" ||
    byShard.get("security").invariants.dependencyAudit !== "passed" ||
    byShard.get("server").invariants.makeData !== "passed" ||
    byShard.get("server").invariants.databaseCleanup !== "passed" ||
    byShard.get("server").invariants.chromiumSandboxCleanup !== "passed" ||
    byShard.get("browser").invariants.chromiumSandboxCleanup !== "passed" ||
    !SHA256_PATTERN.test(String(byShard.get("web").invariants.webBuildSha256 || "")) ||
    byShard.get("web").invariants.webBuildSha256 !==
      byShard.get("browser").invariants.webBuildSha256
  ) {
    throw new Error("quality aggregate cross-shard invariant is incomplete");
  }

  const stageById = new Map(
    receipts.flatMap((receipt) => receipt.stageTimings).map((stage) => [stage.id, stage]),
  );
  const stageTimings = RECEIPT_GATE_STAGE_IDS.strict.map((id) => stageById.get(id));
  const substepTimings = receipts.flatMap((receipt) => receipt.substepTimings || []);
  const parallelDurationMs = Math.max(
    ...RECEIPT_GATE_PARALLEL_STAGE_IDS.map((id) => stageById.get(id)?.durationMs || 0),
  );
  const shardWallStarted = Math.min(...receipts.map((receipt) => Date.parse(receipt.startedAt)));
  const shardWallFinished = Math.max(...receipts.map((receipt) => Date.parse(receipt.finishedAt)));
  const shardDurations = receipts.map((receipt) => ({
    shard: receipt.shard,
    job: receipt.job.name,
    durationMs: receipt.durationMs,
  }));
  const bottleneckShard = [...shardDurations].sort(
    (left, right) => right.durationMs - left.durationMs,
  )[0];
  const categoryKeys = ["web", "server", "database", "browser", "security"];
  const categoryCounts = Object.fromEntries(
    categoryKeys.map((key) => [
      key,
      receipts.reduce(
        (total, receipt) => addCounts(total, validateCounts(receipt.categoryCounts[key], `${receipt.shard}.${key}`)),
        ZERO_COUNTS,
      ),
    ]),
  );
  for (const [key, counts] of Object.entries(categoryCounts)) {
    validateCounts(counts, `aggregate ${key}`, { allowZero: false });
    if (counts.failed || counts.skipped || counts.passed !== counts.executed) {
      throw new Error(`quality aggregate category did not pass: ${key}`);
    }
  }
  const summary = receipts.reduce(
    (total, receipt) => addCounts(total, receipt.summary),
    ZERO_COUNTS,
  );
  validateCounts(summary, "quality aggregate summary", { allowZero: false });
  const aggregate = {
    schemaVersion: CI_QUALITY_AGGREGATE_SCHEMA,
    status: "passed",
    repository: expected.repository,
    gitSha: expected.gitSha,
    pipeline: {
      id: expected.pipelineId,
      iid: expected.pipelineIid,
      source: expected.pipelineSource,
    },
    job: { id: String(env.CI_JOB_ID), name: env.CI_JOB_NAME },
    trust: {
      sha256: sha256File(path.resolve(root, trustFile)),
      planSha256: trust.planSha256,
      rangeSha256: trust.rangeSha256,
      gitleaksStatus: trust.gitleaksStatus,
    },
    strictIdentity,
    shards: shardDurations,
    dag: {
      wallDurationMs: shardWallFinished - shardWallStarted,
      criticalShard: bottleneckShard.shard,
      criticalShardDurationMs: bottleneckShard.durationMs,
      runnerConcurrencyRequired: 4,
    },
    sourceIntegrity,
    dependencyAudit: "passed",
    makeData: "passed",
    cleanup: {
      postgres: "passed",
      chromiumSandboxes: "passed",
      browserLock: "passed",
    },
    webBuildSha256: byShard.get("web").invariants.webBuildSha256,
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsFullDsn: false,
      containsAbsoluteWorkspacePaths: false,
      containsRawLogs: false,
    },
  };
  atomicJson(path.resolve(root, aggregateFile), aggregate);
  const gitContext = getDevWorkbenchGitContext(root);
  if (gitContext.gitCommit !== expected.gitSha || gitContext.treeState !== "clean") {
    throw new Error("quality aggregate checkout identity changed");
  }
  const metrics = {
    stageTimings,
    substepTimings,
    parallelStageGroups: [
      {
        stageIds: [...RECEIPT_GATE_PARALLEL_STAGE_IDS],
        status: "passed",
        durationMs: parallelDurationMs,
      },
    ],
    measuredStageDurationMs: stageTimings.reduce((total, stage) => total + stage.durationMs, 0),
    observedCriticalPathDurationMs: aggregate.dag.wallDurationMs,
    bottleneckStageId: [...stageTimings].sort(
      (left, right) => right.durationMs - left.durationMs,
    )[0].id,
    categoryCounts,
    gitlabDag: aggregate.dag,
  };
  const receiptPlan = buildExactShaPlan(root, {
    sha: expected.gitSha,
    mainRef: "origin/main",
    env,
  });
  const standardReceipt = buildDevWorkbenchReceipt({
    artifactPaths: [aggregateFile],
    durationMs: aggregate.dag.wallDurationMs,
    finishedAt: new Date(shardWallFinished).toISOString(),
    gate: "strict",
    gitContext,
    metrics,
    notProven: ["immutable release publication", "target deployment", "customer UAT"],
    profile: "strict",
    repoRoot: root,
    startedAt: new Date(shardWallStarted).toISOString(),
    status: "passed",
    summary,
    invariants: [
      "protected main trust bootstrap and real push range passed",
      "all seven fixed GitLab quality shards passed for one exact SHA",
      "source archive, dependency audit and make data integrity passed",
      "PostgreSQL, Chromium sandbox and browser cleanup readbacks passed",
    ],
  });
  writeDevWorkbenchReceipt(receiptPlan.receiptPath, standardReceipt);
  const terminalResult = finalizeExactShaGateFromReceipt(
    root,
    { sha: expected.gitSha, mainRef: "origin/main" },
    { env, now, startedAt: new Date(shardWallStarted).toISOString() },
  );
  const evidenceRoot = path.resolve(root, evidenceDir);
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
  copyFileSync(terminalResult.plan.terminalPath, path.join(evidenceRoot, "terminal.json"));
  copyFileSync(terminalResult.plan.receiptPath, path.join(evidenceRoot, "receipt.json"));
  const manifest = {
    schemaVersion: CI_EVIDENCE_MANIFEST_SCHEMA,
    repository: expected.repository,
    gitSha: expected.gitSha,
    ref: "refs/heads/main",
    protectedDefaultBranch: true,
    pipeline: {
      id: expected.pipelineId,
      iid: expected.pipelineIid,
      source: expected.pipelineSource,
    },
    aggregateJob: { id: String(env.CI_JOB_ID), name: env.CI_JOB_NAME },
    terminalFingerprint: terminalResult.terminal.fingerprint,
    aggregateSha256: sha256File(path.resolve(root, aggregateFile)),
    files: evidenceFiles(root, evidenceRoot),
    createdAt: now().toISOString(),
    redaction: { containsSecrets: false, containsCredentials: false, containsRawLogs: false },
  };
  atomicJson(path.join(evidenceRoot, "evidence-manifest.json"), manifest);
  return { aggregate, manifest, terminal: terminalResult.terminal };
}

function parseArgs(argv) {
  const options = {};
  const mapping = {
    "--shards-dir": "shardsDir",
    "--plan": "planFile",
    "--range": "rangeFile",
    "--trust": "trustFile",
    "--aggregate": "aggregateFile",
    "--evidence-dir": "evidenceDir",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const key = mapping[arg];
    const value = argv[index + 1];
    if (!key || !value || value.startsWith("--")) throw new Error(`invalid argument: ${arg}`);
    options[key] = value;
    index += 1;
  }
  return options;
}

const isDirectRun =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const result = await aggregateCiQuality(parseArgs(process.argv.slice(2)));
    process.stdout.write(
      `[ci-quality-aggregate] status=passed sha=${result.aggregate.gitSha} criticalShard=${result.aggregate.dag.criticalShard} durationMs=${result.aggregate.dag.wallDurationMs}\n`,
    );
  } catch (error) {
    process.stderr.write(`[ci-quality-aggregate] status=blocked reason=${error.message}\n`);
    process.exitCode = 2;
  }
}
