#!/usr/bin/env node

import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const RUNNER_CAPACITY_RECEIPT_SCHEMA = "plush.runner-capacity/v1";
export const CI_RUNNER_CAPACITY_OBSERVATION_SCHEMA =
  "plush.gitlab-runner-capacity-observation/v1";
export const RUNNER_CAPACITY_RECEIPT_PATH =
  "/var/lib/plush-runner/capacity.json";
export const RUNNER_CAPACITY_HELPER_PATH =
  "/usr/local/sbin/plush-runner-capacity";
export const RUNNER_CAPACITY_SOURCE_PATH =
  "server/deploy/gitlab/runner-capacity.env";
export const RUNNER_CAPACITY_HELPER_SOURCE_PATH =
  "server/deploy/gitlab/runner-capacity.sh";

const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const INTEGER_PATTERN = /^[1-9][0-9]*$/u;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} keys are invalid`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

function nonnegativeInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative integer`);
  }
  return value;
}

function regularSourceFile(file, label) {
  const identity = lstatSync(file);
  if (!identity.isFile() || identity.isSymbolicLink() || identity.nlink !== 1) {
    throw new Error(`${label} identity is invalid`);
  }
  return readFileSync(file);
}

export function readRunnerCapacityPolicy({
  policyFile = RUNNER_CAPACITY_SOURCE_PATH,
  helperFile = RUNNER_CAPACITY_HELPER_SOURCE_PATH,
} = {}) {
  const policy = regularSourceFile(policyFile, "Runner capacity policy").toString("utf8");
  const match = policy.match(/^RUNNER_CONCURRENT_SLOTS=([1-9][0-9]*)\n$/u);
  if (!match) {
    throw new Error("Runner capacity policy is invalid");
  }
  return {
    slots: positiveInteger(Number(match[1]), "expected Runner slots"),
    helperSha256: createHash("sha256")
      .update(regularSourceFile(helperFile, "Runner capacity helper"))
      .digest("hex"),
  };
}

export function validateRunnerCapacityReceipt(receipt) {
  exactKeys(
    receipt,
    [
      "schemaVersion",
      "status",
      "validatedAt",
      "slots",
      "concurrent",
      "limit",
      "safetyMax",
      "resourceSnapshot",
    ],
    "Runner capacity receipt",
  );
  if (
    receipt.schemaVersion !== RUNNER_CAPACITY_RECEIPT_SCHEMA ||
    receipt.status !== "validated" ||
    !Number.isFinite(Date.parse(receipt.validatedAt))
  ) {
    throw new Error("Runner capacity receipt identity is invalid");
  }
  const slots = positiveInteger(receipt.slots, "receipt slots");
  if (
    receipt.concurrent !== slots ||
    receipt.limit !== slots ||
    positiveInteger(receipt.safetyMax, "receipt safety maximum") < slots
  ) {
    throw new Error("Runner capacity receipt slots are inconsistent");
  }
  exactKeys(
    receipt.resourceSnapshot,
    ["vCpu", "memoryMiB", "swapUsedKiB", "rootAvailableGiB"],
    "Runner capacity receipt resources",
  );
  const resources = {
    vCpu: positiveInteger(receipt.resourceSnapshot.vCpu, "receipt vCPU"),
    memoryMiB: positiveInteger(
      receipt.resourceSnapshot.memoryMiB,
      "receipt memory",
    ),
    swapUsedKiB: nonnegativeInteger(
      receipt.resourceSnapshot.swapUsedKiB,
      "receipt swap",
    ),
    rootAvailableGiB: positiveInteger(
      receipt.resourceSnapshot.rootAvailableGiB,
      "receipt root availability",
    ),
  };
  if (slots > resources.vCpu) {
    throw new Error("Runner capacity receipt exceeds observed vCPU");
  }
  return {
    ...receipt,
    resourceSnapshot: resources,
  };
}

function parseMeminfo(text) {
  const values = new Map(
    text
      .trim()
      .split("\n")
      .map((line) => line.match(/^([A-Za-z_()]+):\s+([0-9]+)\s+kB$/u))
      .filter(Boolean)
      .map((match) => [match[1], Number(match[2]) * 1024]),
  );
  for (const key of ["MemTotal", "MemAvailable", "SwapTotal", "SwapFree"]) {
    nonnegativeInteger(values.get(key), key);
  }
  return values;
}

export function readRunnerResourceSnapshot({
  cpuCount = os.cpus().length,
  meminfo = readFileSync("/proc/meminfo", "utf8"),
  rootStat = statfsSync("/", { bigint: true }),
} = {}) {
  const memory = parseMeminfo(meminfo);
  const rootFsTotalBytes = Number(rootStat.bsize * rootStat.blocks);
  const rootFsAvailableBytes = Number(rootStat.bsize * rootStat.bavail);
  const swapTotalBytes = memory.get("SwapTotal");
  const swapFreeBytes = memory.get("SwapFree");
  return {
    vCpu: positiveInteger(cpuCount, "current vCPU"),
    memoryTotalBytes: positiveInteger(
      memory.get("MemTotal"),
      "current memory total",
    ),
    memoryAvailableBytes: nonnegativeInteger(
      memory.get("MemAvailable"),
      "current memory available",
    ),
    swapTotalBytes,
    swapUsedBytes: nonnegativeInteger(
      swapTotalBytes - swapFreeBytes,
      "current swap used",
    ),
    rootFsTotalBytes: positiveInteger(rootFsTotalBytes, "root filesystem total"),
    rootFsAvailableBytes: nonnegativeInteger(
      rootFsAvailableBytes,
      "root filesystem available",
    ),
  };
}

function assertEnvironment(env) {
  if (
    env.CI_PROJECT_PATH !== "saurick/plush-toy-erp" ||
    !SHA_PATTERN.test(String(env.CI_COMMIT_SHA || "")) ||
    env.CI_DEFAULT_BRANCH !== "main" ||
    env.CI_COMMIT_BRANCH !== "main" ||
    env.CI_COMMIT_REF_PROTECTED !== "true" ||
    env.CI_PIPELINE_SOURCE !== "push" ||
    env.CI_JOB_NAME !== "prepare"
  ) {
    throw new Error("Runner capacity CI identity is invalid");
  }
  for (const key of [
    "CI_PIPELINE_ID",
    "CI_PIPELINE_IID",
    "CI_JOB_ID",
    "CI_RUNNER_ID",
  ]) {
    if (!INTEGER_PATTERN.test(String(env[key] || ""))) {
      throw new Error("Runner capacity CI numeric identity is invalid");
    }
  }
}

export function buildRunnerCapacityObservation({
  env,
  receipt,
  resources,
  live,
  policy,
  observedAt,
}) {
  assertEnvironment(env);
  const validated = validateRunnerCapacityReceipt(receipt);
  exactKeys(
    resources,
    [
      "vCpu",
      "memoryTotalBytes",
      "memoryAvailableBytes",
      "swapTotalBytes",
      "swapUsedBytes",
      "rootFsTotalBytes",
      "rootFsAvailableBytes",
    ],
    "current Runner resources",
  );
  for (const [key, value] of Object.entries(resources)) {
    if (key === "vCpu") positiveInteger(value, key);
    else nonnegativeInteger(value, key);
  }
  exactKeys(
    live,
    [
      "vCpu",
      "memoryMiB",
      "rootAvailableGiB",
      "swapUsedKiB",
      "currentSlots",
      "limit",
      "safetyMax",
      "helperSha256",
      "serviceActive",
      "serviceEnabled",
    ],
    "live Runner capacity",
  );
  for (const key of [
    "vCpu",
    "memoryMiB",
    "rootAvailableGiB",
    "currentSlots",
    "limit",
    "safetyMax",
  ]) {
    positiveInteger(live[key], `live ${key}`);
  }
  nonnegativeInteger(live.swapUsedKiB, "live swap");
  exactKeys(policy, ["slots", "helperSha256"], "Runner capacity policy");
  positiveInteger(policy.slots, "expected Runner slots");
  if (!/^[0-9a-f]{64}$/u.test(policy.helperSha256)) {
    throw new Error("Runner capacity helper identity is invalid");
  }
  if (
    validated.slots !== policy.slots ||
    validated.slots > resources.vCpu ||
    validated.safetyMax > resources.vCpu ||
    live.vCpu !== resources.vCpu ||
    live.currentSlots !== validated.slots ||
    live.limit !== validated.limit ||
    live.safetyMax !== validated.safetyMax ||
    live.helperSha256 !== policy.helperSha256 ||
    live.serviceActive !== true ||
    live.serviceEnabled !== true ||
    Date.parse(validated.validatedAt) > Date.parse(observedAt) ||
    !Number.isFinite(Date.parse(observedAt))
  ) {
    throw new Error("Runner capacity observation is incompatible");
  }
  const observation = {
    schemaVersion: CI_RUNNER_CAPACITY_OBSERVATION_SCHEMA,
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
    runner: { id: String(env.CI_RUNNER_ID) },
    observedAt,
    resources,
    slots: {
      concurrent: validated.concurrent,
      limit: validated.limit,
      safetyMax: validated.safetyMax,
      managed: true,
      liveConfigVerified: true,
      helperSha256: live.helperSha256,
      configuredAt: validated.validatedAt,
    },
    service: { active: true, enabled: true },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsRawLogs: false,
      containsPaths: false,
    },
  };
  return validateRunnerCapacityObservation(observation, {
    repository: env.CI_PROJECT_PATH,
    gitSha: env.CI_COMMIT_SHA,
    pipelineId: String(env.CI_PIPELINE_ID),
    pipelineIid: String(env.CI_PIPELINE_IID),
    pipelineSource: env.CI_PIPELINE_SOURCE,
    runnerId: String(env.CI_RUNNER_ID),
    slots: policy.slots,
    helperSha256: policy.helperSha256,
  });
}

export function validateRunnerCapacityObservation(observation, expected) {
  exactKeys(
    observation,
    [
      "schemaVersion",
      "repository",
      "gitSha",
      "ref",
      "protectedDefaultBranch",
      "pipeline",
      "job",
      "runner",
      "observedAt",
      "resources",
      "slots",
      "service",
      "redaction",
    ],
    "Runner capacity observation",
  );
  exactKeys(observation.pipeline, ["id", "iid", "source"], "capacity pipeline");
  exactKeys(observation.job, ["id", "name"], "capacity job");
  exactKeys(observation.runner, ["id"], "capacity runner");
  exactKeys(
    observation.resources,
    [
      "vCpu",
      "memoryTotalBytes",
      "memoryAvailableBytes",
      "swapTotalBytes",
      "swapUsedBytes",
      "rootFsTotalBytes",
      "rootFsAvailableBytes",
    ],
    "capacity resources",
  );
  exactKeys(
    observation.slots,
    [
      "concurrent",
      "limit",
      "safetyMax",
      "managed",
      "liveConfigVerified",
      "helperSha256",
      "configuredAt",
    ],
    "capacity slots",
  );
  exactKeys(observation.service, ["active", "enabled"], "capacity service");
  exactKeys(
    observation.redaction,
    [
      "containsSecrets",
      "containsCredentials",
      "containsRawLogs",
      "containsPaths",
    ],
    "capacity redaction",
  );
  if (
    observation.schemaVersion !== CI_RUNNER_CAPACITY_OBSERVATION_SCHEMA ||
    observation.repository !== expected.repository ||
    observation.gitSha !== expected.gitSha ||
    observation.ref !== "refs/heads/main" ||
    observation.protectedDefaultBranch !== true ||
    observation.pipeline.id !== expected.pipelineId ||
    observation.pipeline.iid !== expected.pipelineIid ||
    observation.pipeline.source !== expected.pipelineSource ||
    observation.job.name !== "prepare" ||
    !INTEGER_PATTERN.test(String(observation.job.id || "")) ||
    observation.runner.id !== expected.runnerId ||
    !Number.isFinite(Date.parse(observation.observedAt)) ||
    !Number.isFinite(Date.parse(observation.slots.configuredAt)) ||
    observation.slots.managed !== true ||
    observation.slots.liveConfigVerified !== true ||
    observation.slots.helperSha256 !== expected.helperSha256 ||
    observation.service.active !== true ||
    observation.service.enabled !== true ||
    observation.redaction.containsSecrets !== false ||
    observation.redaction.containsCredentials !== false ||
    observation.redaction.containsRawLogs !== false ||
    observation.redaction.containsPaths !== false
  ) {
    throw new Error("Runner capacity observation identity is invalid");
  }
  for (const [key, value] of Object.entries(observation.resources)) {
    if (key === "vCpu" || key === "memoryTotalBytes" || key === "rootFsTotalBytes") {
      positiveInteger(value, key);
    } else {
      nonnegativeInteger(value, key);
    }
  }
  const slots = positiveInteger(observation.slots.concurrent, "concurrent");
  if (
    slots !== positiveInteger(expected.slots, "expected slots") ||
    observation.slots.limit !== slots ||
    positiveInteger(observation.slots.safetyMax, "safety maximum") < slots ||
    observation.slots.safetyMax > observation.resources.vCpu ||
    Date.parse(observation.slots.configuredAt) >
      Date.parse(observation.observedAt)
  ) {
    throw new Error("Runner capacity observation slots are invalid");
  }
  return observation;
}

export function readLiveRunnerCapacity({ spawn = spawnSync } = {}) {
  const result = spawn(
    "/usr/bin/sudo",
    ["-n", RUNNER_CAPACITY_HELPER_PATH, "--evidence"],
    {
      encoding: "utf8",
      env: {
        LANG: "C",
        LC_ALL: "C",
        PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      },
      maxBuffer: 2048,
      timeout: 10_000,
    },
  );
  if (
    result.error ||
    result.signal ||
    result.status !== 0 ||
    result.stderr !== ""
  ) {
    throw new Error("live Runner capacity verification failed");
  }
  const match = String(result.stdout || "").match(
    /^\[runner-capacity\] status=evidence vcpus=([1-9][0-9]*) memoryMiB=([1-9][0-9]*) rootAvailableGiB=([1-9][0-9]*) swapUsedKiB=([0-9]+) currentSlots=([1-9][0-9]*) limit=([1-9][0-9]*) safetyMax=([1-9][0-9]*) helperSha256=([0-9a-f]{64}) serviceActive=1 serviceEnabled=1\n$/u,
  );
  if (!match) {
    throw new Error("live Runner capacity output is invalid");
  }
  return {
    vCpu: Number(match[1]),
    memoryMiB: Number(match[2]),
    rootAvailableGiB: Number(match[3]),
    swapUsedKiB: Number(match[4]),
    currentSlots: Number(match[5]),
    limit: Number(match[6]),
    safetyMax: Number(match[7]),
    helperSha256: match[8],
    serviceActive: true,
    serviceEnabled: true,
  };
}

function readReceipt(file) {
  const parent = lstatSync(path.dirname(file));
  const identity = lstatSync(file);
  if (
    !parent.isDirectory() ||
    parent.isSymbolicLink() ||
    parent.uid !== 0 ||
    (parent.mode & 0o777) !== 0o755 ||
    parent.nlink < 2 ||
    !identity.isFile() ||
    identity.isSymbolicLink() ||
    identity.uid !== 0 ||
    (identity.mode & 0o777) !== 0o644 ||
    identity.nlink !== 1
  ) {
    throw new Error("Runner capacity receipt filesystem identity is invalid");
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

function atomicJson(file, value) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function collectRunnerCapacityEvidence({
  env = process.env,
  receiptFile = RUNNER_CAPACITY_RECEIPT_PATH,
  out = "output/ci/runner-capacity-observation.json",
  now = () => new Date(),
  readLive = readLiveRunnerCapacity,
  readPolicy = readRunnerCapacityPolicy,
} = {}) {
  const policy = readPolicy();
  const observation = buildRunnerCapacityObservation({
    env,
    receipt: readReceipt(receiptFile),
    resources: readRunnerResourceSnapshot(),
    live: readLive(),
    policy,
    observedAt: now().toISOString(),
  });
  atomicJson(path.resolve(out), observation);
  return observation;
}

function parseArgs(argv) {
  if (argv.length === 0) return {};
  if (argv.length === 2 && argv[0] === "--out" && argv[1]) {
    return { out: argv[1] };
  }
  throw new Error("invalid argument");
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  try {
    const result = collectRunnerCapacityEvidence(parseArgs(process.argv.slice(2)));
    process.stdout.write(
      `[ci-runner-capacity] status=passed sha=${result.gitSha} slots=${result.slots.concurrent} vcpus=${result.resources.vCpu}\n`,
    );
  } catch {
    process.stderr.write("[ci-runner-capacity] status=blocked\n");
    process.exitCode = 2;
  }
}
