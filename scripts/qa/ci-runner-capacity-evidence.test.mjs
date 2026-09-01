import assert from "node:assert/strict";
import test from "node:test";

import {
  CI_RUNNER_CAPACITY_OBSERVATION_SCHEMA,
  RUNNER_CAPACITY_RECEIPT_SCHEMA,
  buildRunnerCapacityObservation,
  readLiveRunnerCapacity,
  readRunnerCapacityPolicy,
  readRunnerResourceSnapshot,
  validateRunnerCapacityObservation,
  validateRunnerCapacityReceipt,
} from "./ci-runner-capacity-evidence.mjs";

const sha = "a".repeat(40);
const policy = readRunnerCapacityPolicy();
const env = {
  CI_PROJECT_PATH: "saurick/plush-toy-erp",
  CI_COMMIT_SHA: sha,
  CI_DEFAULT_BRANCH: "main",
  CI_COMMIT_BRANCH: "main",
  CI_COMMIT_REF_PROTECTED: "true",
  CI_PIPELINE_SOURCE: "push",
  CI_PIPELINE_ID: "71",
  CI_PIPELINE_IID: "71",
  CI_JOB_ID: "901",
  CI_JOB_NAME: "prepare",
  CI_RUNNER_ID: "8",
};
const receipt = {
  schemaVersion: RUNNER_CAPACITY_RECEIPT_SCHEMA,
  status: "validated",
  validatedAt: "2026-09-01T02:00:00Z",
  slots: policy.slots,
  concurrent: policy.slots,
  limit: policy.slots,
  safetyMax: policy.slots,
  resourceSnapshot: {
    vCpu: 48,
    memoryMiB: 24015,
    swapUsedKiB: 0,
    rootAvailableGiB: 194,
  },
};
const resources = {
  vCpu: 48,
  memoryTotalBytes: 25_182_392_320,
  memoryAvailableBytes: 23_006_466_048,
  swapTotalBytes: 0,
  swapUsedBytes: 0,
  rootFsTotalBytes: 248_505_155_584,
  rootFsAvailableBytes: 208_978_124_800,
};
const live = {
  vCpu: 48,
  memoryMiB: 24015,
  rootAvailableGiB: 194,
  swapUsedKiB: 0,
  currentSlots: policy.slots,
  limit: policy.slots,
  safetyMax: policy.slots,
  helperSha256: policy.helperSha256,
  serviceActive: true,
  serviceEnabled: true,
};
const expected = {
  repository: env.CI_PROJECT_PATH,
  gitSha: env.CI_COMMIT_SHA,
  pipelineId: env.CI_PIPELINE_ID,
  pipelineIid: env.CI_PIPELINE_IID,
  pipelineSource: env.CI_PIPELINE_SOURCE,
  runnerId: env.CI_RUNNER_ID,
  slots: policy.slots,
  helperSha256: policy.helperSha256,
};

test("Runner capacity observation binds dynamic resources and configured slots", () => {
  const observation = buildRunnerCapacityObservation({
    env,
    receipt,
    resources,
    live,
    policy,
    observedAt: "2026-09-01T02:01:00Z",
  });
  assert.equal(
    observation.schemaVersion,
    CI_RUNNER_CAPACITY_OBSERVATION_SCHEMA,
  );
  assert.equal(observation.resources.vCpu, 48);
  assert.equal(policy.slots, 19);
  assert.equal(observation.slots.concurrent, policy.slots);
  assert.equal(observation.slots.limit, policy.slots);
  assert.equal(
    validateRunnerCapacityObservation(observation, expected),
    observation,
  );
});

test("Runner capacity evidence rejects extra keys and slot drift", () => {
  assert.throws(
    () => validateRunnerCapacityReceipt({ ...receipt, extra: true }),
    /keys/u,
  );
  assert.throws(
    () => validateRunnerCapacityReceipt({ ...receipt, limit: 18 }),
    /inconsistent/u,
  );
  const observation = buildRunnerCapacityObservation({
    env,
    receipt,
    resources,
    live,
    policy,
    observedAt: "2026-09-01T02:01:00Z",
  });
  assert.throws(
    () =>
      validateRunnerCapacityObservation(
        { ...observation, runner: { id: "9" } },
        expected,
      ),
    /identity/u,
  );
});

test("Runner capacity evidence verifies the current root-owned helper projection", () => {
  const observed = readLiveRunnerCapacity({
    spawn(command, args, options) {
      assert.equal(command, "/usr/bin/sudo");
      assert.deepEqual(args, [
        "-n",
        "/usr/local/sbin/plush-runner-capacity",
        "--evidence",
      ]);
      assert.equal(options.timeout, 10_000);
      return {
        status: 0,
        signal: null,
        stderr: "",
        stdout:
          `[runner-capacity] status=evidence vcpus=48 memoryMiB=24015 rootAvailableGiB=194 swapUsedKiB=0 currentSlots=${policy.slots} limit=${policy.slots} safetyMax=${policy.slots} helperSha256=${policy.helperSha256} serviceActive=1 serviceEnabled=1\n`,
      };
    },
  });
  assert.deepEqual(observed, live);
  assert.throws(
    () =>
      readLiveRunnerCapacity({
        spawn: () => ({
          status: 0,
          signal: null,
          stderr: "",
          stdout: "unexpected\n",
        }),
      }),
    /output is invalid/u,
  );
});

test("Runner capacity evidence rejects future receipts and unsafe ceilings", () => {
  assert.throws(
    () =>
      buildRunnerCapacityObservation({
        env,
        receipt: { ...receipt, validatedAt: "2026-09-01T02:02:00Z" },
        resources,
        live,
        policy,
        observedAt: "2026-09-01T02:01:00Z",
      }),
    /incompatible/u,
  );
  assert.throws(
    () =>
      buildRunnerCapacityObservation({
        env,
        receipt: { ...receipt, safetyMax: 49 },
        resources,
        live: { ...live, safetyMax: 49 },
        policy,
        observedAt: "2026-09-01T02:01:00Z",
      }),
    /incompatible/u,
  );
  assert.throws(
    () =>
      buildRunnerCapacityObservation({
        env,
        receipt: {
          ...receipt,
          slots: policy.slots - 1,
          concurrent: policy.slots - 1,
          limit: policy.slots - 1,
        },
        resources,
        live: {
          ...live,
          currentSlots: policy.slots - 1,
          limit: policy.slots - 1,
        },
        policy,
        observedAt: "2026-09-01T02:01:00Z",
      }),
    /incompatible/u,
  );
});

test("Runner resource snapshot reads CPU, memory, swap and root filesystem", () => {
  const snapshot = readRunnerResourceSnapshot({
    cpuCount: 48,
    meminfo:
      "MemTotal:       24592570 kB\n" +
      "MemAvailable:   22467057 kB\n" +
      "SwapTotal:             0 kB\n" +
      "SwapFree:              0 kB\n",
    rootStat: {
      bsize: 4096n,
      blocks: 60_670_204n,
      bavail: 51_019_074n,
    },
  });
  assert.equal(snapshot.vCpu, 48);
  assert.equal(snapshot.swapUsedBytes, 0);
  assert.equal(snapshot.rootFsTotalBytes, 248_505_155_584);
});
