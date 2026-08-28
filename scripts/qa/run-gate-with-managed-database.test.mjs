import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  MANAGED_DATABASE_EVENTS,
  MANAGED_DATABASE_IMAGE,
  MANAGED_DATABASE_LABELS,
  buildManagedDatabaseContainerSpec,
  buildManagedDatabaseHostProbe,
  buildManagedQualityGateCommand,
  parseManagedDatabaseInspectResult,
  parseManagedDatabaseArgs,
  probeManagedDatabaseRuntime,
  readManagedLoopbackPort,
  runManagedQualityGate,
  waitForManagedDatabaseHostReadiness,
} from "./run-gate-with-managed-database.mjs";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const EXACT_SHA = "a9ff5b57af2f7c3a2eb307fb591a1a6acf5e595f";
const PASSWORD = "a-unique-runtime-password-that-is-long-enough";
const DATABASE_URL = `postgres://postgres:${PASSWORD}@127.0.0.1:55439/postgres?sslmode=disable`;
const REFSPEC = "refs/heads/main:refs/heads/main";

function healthyContainer(spec, port = "55439") {
  return {
    Config: { Labels: spec.labels },
    NetworkSettings: {
      Ports: { "5432/tcp": [{ HostIp: "127.0.0.1", HostPort: port }] },
    },
    State: { Health: { Status: "healthy" } },
  };
}

test("managed database runner accepts only fixed full and strict requests", () => {
  assert.deepEqual(
    parseManagedDatabaseArgs([
      "--gate",
      "strict",
      "--operation-id",
      OPERATION_ID,
    ]),
    { gate: "strict", operationId: OPERATION_ID },
  );
  assert.throws(() =>
    parseManagedDatabaseArgs([
      "--gate",
      "fast",
      "--operation-id",
      OPERATION_ID,
    ]),
  );
  assert.throws(() =>
    parseManagedDatabaseArgs([
      "--gate",
      "full",
      "--operation-id",
      OPERATION_ID,
      "--command",
      "shell",
    ]),
  );
  assert.throws(() =>
    parseManagedDatabaseArgs([
      "--gate",
      "full",
      "--gate",
      "strict",
      "--operation-id",
      OPERATION_ID,
    ]),
  );
});

test("managed database runner accepts only one exact SHA bound to local HEAD", () => {
  assert.deepEqual(
    parseManagedDatabaseArgs([
      "--exact-sha",
      EXACT_SHA,
      "--main-ref",
      "HEAD",
      "--operation-id",
      OPERATION_ID,
    ]),
    { exactSha: EXACT_SHA, mainRef: "HEAD", operationId: OPERATION_ID },
  );
  for (const invalidArgs of [
    ["--exact-sha", EXACT_SHA.toUpperCase(), "--main-ref", "HEAD"],
    ["--exact-sha", EXACT_SHA.slice(1), "--main-ref", "HEAD"],
    ["--exact-sha", EXACT_SHA, "--main-ref", "origin/main"],
    ["--exact-sha", EXACT_SHA],
    ["--main-ref", "HEAD"],
    ["--gate", "strict", "--exact-sha", EXACT_SHA, "--main-ref", "HEAD"],
    ["--exact-sha", EXACT_SHA, "--exact-sha", EXACT_SHA, "--main-ref", "HEAD"],
    ["--command", "scripts/qa/exact-sha-gate.mjs"],
  ]) {
    assert.throws(() =>
      parseManagedDatabaseArgs([
        ...invalidArgs,
        "--operation-id",
        OPERATION_ID,
      ]),
    );
  }
});

test("managed database runner accepts only bounded prepare-push arguments", () => {
  assert.deepEqual(
    parseManagedDatabaseArgs([
      "--prepare-push",
      "--full",
      "--remote",
      "origin",
      "--ref",
      REFSPEC,
      "--ref",
      "refs/tags/v1.2.0:refs/tags/v1.2.0",
      "--operation-id",
      OPERATION_ID,
    ]),
    {
      preparePush: true,
      forceFull: true,
      refs: [REFSPEC, "refs/tags/v1.2.0:refs/tags/v1.2.0"],
      remote: "origin",
      operationId: OPERATION_ID,
    },
  );
  for (const invalidArgs of [
    ["--prepare-push", "--remote", "https://example.invalid/repo"],
    ["--prepare-push", "--ref", "refs/heads/main:../../unsafe"],
    ["--prepare-push", "--ref", `${REFSPEC};echo`],
    ["--prepare-push", "--command", "bash"],
    ["--prepare-push", "--gate", "full"],
    ["--prepare-push", "--prepare-push"],
    ["--prepare-push", "--full", "--full"],
    ["--full"],
  ]) {
    assert.throws(() =>
      parseManagedDatabaseArgs([
        ...invalidArgs,
        "--operation-id",
        OPERATION_ID,
      ]),
    );
  }
});

test("managed database command builder keeps every fixed command shell-free", () => {
  const gateCommand = buildManagedQualityGateCommand({
    databaseURL: DATABASE_URL,
    environment: { PATH: "/usr/bin" },
    gate: "strict",
    repoRoot: "/repo",
  });
  assert.equal(gateCommand.command, process.execPath);
  assert.deepEqual(gateCommand.args, [
    "scripts/qa/run-gate-with-receipt.mjs",
    "--gate",
    "strict",
  ]);
  assert.equal(gateCommand.shell, false);
  assert.equal(gateCommand.cwd, "/repo");
  assert.equal(gateCommand.env.DISPOSABLE_DATABASE_BASE_URL, DATABASE_URL);
  assert(!gateCommand.args.join(" ").includes(PASSWORD));

  const exactCommand = buildManagedQualityGateCommand({
    databaseURL: DATABASE_URL,
    environment: { PATH: "/usr/bin" },
    exactSha: EXACT_SHA,
    mainRef: "HEAD",
    repoRoot: "/repo",
  });
  assert.deepEqual(exactCommand.args, [
    "scripts/qa/exact-sha-gate.mjs",
    "--sha",
    EXACT_SHA,
    "--main-ref",
    "HEAD",
    "--run",
    "--json",
  ]);
  assert.equal(exactCommand.shell, false);
  assert.equal(exactCommand.env.DISPOSABLE_DATABASE_BASE_URL, DATABASE_URL);
  assert(!exactCommand.args.join(" ").includes(PASSWORD));

  const preparePushCommand = buildManagedQualityGateCommand({
    databaseURL: DATABASE_URL,
    environment: { PATH: "/usr/bin" },
    forceFull: true,
    preparePush: true,
    refs: [REFSPEC],
    remote: "origin",
    repoRoot: "/repo",
  });
  assert.deepEqual(preparePushCommand.args, [
    "scripts/qa/pre-push-receipt.mjs",
    "prepare",
    "--full",
    "--remote",
    "origin",
    "--ref",
    REFSPEC,
  ]);
  assert.equal(preparePushCommand.shell, false);
  assert.equal(
    preparePushCommand.env.DISPOSABLE_DATABASE_BASE_URL,
    DATABASE_URL,
  );
  assert(!preparePushCommand.args.join(" ").includes(PASSWORD));
});

test("managed database container is fixed, loopback-only and keeps its secret out of arguments", () => {
  const spec = buildManagedDatabaseContainerSpec({
    operationId: OPERATION_ID,
    password: PASSWORD,
    repoRoot: "/repo",
  });
  assert.equal(spec.image, MANAGED_DATABASE_IMAGE);
  assert(spec.args.includes("127.0.0.1::5432"));
  assert(spec.args.includes("POSTGRES_PASSWORD"));
  assert(!spec.args.some((value) => value.includes(PASSWORD)));
  assert.equal(spec.env.POSTGRES_PASSWORD, PASSWORD);
  assert.equal(spec.labels[MANAGED_DATABASE_LABELS.managed], "true");
  assert.equal(spec.labels[MANAGED_DATABASE_LABELS.operation], OPERATION_ID);
});

test("managed database port readback rejects wildcard and ambiguous bindings", () => {
  const spec = buildManagedDatabaseContainerSpec({
    operationId: OPERATION_ID,
    password: PASSWORD,
    repoRoot: "/repo",
  });
  assert.equal(readManagedLoopbackPort(healthyContainer(spec)), 55439);
  const wildcard = healthyContainer(spec);
  wildcard.NetworkSettings.Ports["5432/tcp"][0].HostIp = "0.0.0.0";
  assert.throws(() => readManagedLoopbackPort(wildcard), /loopback/u);
  const ambiguous = healthyContainer(spec);
  ambiguous.NetworkSettings.Ports["5432/tcp"].push({
    HostIp: "127.0.0.1",
    HostPort: "55440",
  });
  assert.throws(() => readManagedLoopbackPort(ambiguous), /unavailable/u);
});

test("managed database host probe keeps the password out of fixed shell-free arguments", () => {
  const probe = buildManagedDatabaseHostProbe({
    password: PASSWORD,
    port: 55439,
  });
  assert.equal(probe.command, "psql");
  assert.equal(probe.timeout, 2_000);
  assert.deepEqual(probe.args.slice(-2), ["-c", "SELECT 1"]);
  assert(probe.args.includes("--no-password"));
  assert(!probe.args.some((value) => value.includes(PASSWORD)));
  assert.equal(probe.env.PGPASSWORD, PASSWORD);
});

test("managed database host readiness requires three consecutive green samples", async () => {
  const samples = [true, true, false, true, true, true];
  let nowMs = 0;
  const timeouts = [];
  await waitForManagedDatabaseHostReadiness(
    {
      hostReady({ timeoutMs }) {
        timeouts.push(timeoutMs);
        return samples.shift();
      },
      async sleep(delayMs) {
        nowMs += delayMs;
      },
    },
    {
      password: PASSWORD,
      port: 55439,
      timeoutMs: 30_000,
      pollMs: 1_000,
      now: () => nowMs,
    },
  );
  assert.equal(samples.length, 0);
  assert.equal(timeouts.length, 6);
  assert(timeouts.every((value) => value > 0 && value <= 2_000));
});

test("managed database inspection distinguishes confirmed absence from Docker failure", () => {
  const name = `plush-qa-${OPERATION_ID}`;
  assert.equal(
    parseManagedDatabaseInspectResult(
      { status: 1, stderr: `Error: No such object: ${name}`, stdout: "" },
      name,
    ),
    null,
  );
  assert.equal(
    parseManagedDatabaseInspectResult(
      { status: 1, stderr: `error: no such object: ${name}`, stdout: "" },
      name,
    ),
    null,
  );
  assert.throws(() =>
    parseManagedDatabaseInspectResult(
      {
        status: 1,
        stderr: `error: no such object: ${name}-foreign`,
        stdout: "",
      },
      name,
    ),
  );
  assert.throws(() =>
    parseManagedDatabaseInspectResult(
      { status: 1, stderr: "Cannot connect to the Docker daemon", stdout: "" },
      name,
    ),
  );
  assert.throws(() =>
    parseManagedDatabaseInspectResult(
      { status: 0, stderr: "", stdout: "not-json" },
      name,
    ),
  );
});

test("managed database runtime readiness stays bounded and fail closed", () => {
  assert.deepEqual(
    probeManagedDatabaseRuntime({
      repoRoot: "/repo",
      runtime: {
        probe: () => ({ ready: true, message: "自动准备本机隔离数据库" }),
      },
    }),
    { ready: true, message: "自动准备本机隔离数据库" },
  );
  assert.equal(
    probeManagedDatabaseRuntime({
      repoRoot: "/repo",
      runtime: {
        probe: () => {
          throw new Error("secret detail");
        },
      },
    }).message,
    "本机一次性数据库运行环境检查失败",
  );
  assert.equal(
    probeManagedDatabaseRuntime({
      repoRoot: "/repo",
      runtime: { probe: () => ({ ready: true, message: "x".repeat(201) }) },
    }).message,
    "本机托管一次性数据库环境已就绪",
  );
});

test("managed database runner passes only after the formal gate and exact cleanup", async () => {
  const output = [];
  const events = [];
  let container = null;
  let databaseURL = "";
  const runtime = {
    probe: () => ({ ready: true, message: "ready" }),
    start(spec) {
      events.push("start");
      container = healthyContainer(spec);
    },
    inspect() {
      return container;
    },
    remove() {
      events.push("remove");
      container = null;
    },
    hostReady() {
      events.push("host-ready");
      return true;
    },
    async runGate(options) {
      events.push("gate");
      databaseURL = options.databaseURL;
      options.onChild({ kill() {} });
      return { code: 0, signal: "" };
    },
    async sleep() {},
  };
  const result = await runManagedQualityGate({
    gate: "strict",
    operationId: OPERATION_ID,
    repoRoot: "/repo",
    runtime,
    randomPassword: () => PASSWORD,
    stdout: { write: (value) => output.push(value.trim()) },
    processRef: new EventEmitter(),
  });
  assert.deepEqual(events, [
    "start",
    "host-ready",
    "host-ready",
    "host-ready",
    "gate",
    "remove",
  ]);
  assert.equal(result.code, 0);
  assert.equal(result.cleanup, "complete");
  assert.match(databaseURL, /^postgres:\/\/postgres:/u);
  assert.match(databaseURL, /@127\.0\.0\.1:55439\/postgres/u);
  assert(!output.join(" ").includes(PASSWORD));
  assert.deepEqual(output, [
    MANAGED_DATABASE_EVENTS.ready,
    MANAGED_DATABASE_EVENTS.cleanupComplete,
  ]);
});

test("managed exact-SHA runner reuses the same owned-container cleanup lifecycle", async () => {
  const output = [];
  const events = [];
  let container = null;
  const runtime = {
    probe: () => ({ ready: true, message: "ready" }),
    start(spec) {
      events.push("start");
      container = healthyContainer(spec);
    },
    inspect() {
      return container;
    },
    remove() {
      events.push("remove");
      container = null;
    },
    hostReady: () => true,
    async runGate(options) {
      events.push("exact-sha");
      assert.equal(options.exactSha, EXACT_SHA);
      assert.equal(options.gate, undefined);
      assert.equal(options.mainRef, "HEAD");
      assert.equal(options.databaseURL, DATABASE_URL);
      options.onChild({ kill() {} });
      return { code: 0, signal: "" };
    },
    async sleep() {},
  };
  const result = await runManagedQualityGate({
    exactSha: EXACT_SHA,
    mainRef: "HEAD",
    operationId: OPERATION_ID,
    repoRoot: "/repo",
    runtime,
    randomPassword: () => PASSWORD,
    stdout: { write: (value) => output.push(value.trim()) },
    processRef: new EventEmitter(),
  });
  assert.deepEqual(events, ["start", "exact-sha", "remove"]);
  assert.deepEqual(result, { code: 0, cleanup: "complete" });
  assert(!output.join(" ").includes(PASSWORD));
  assert.deepEqual(output, [
    MANAGED_DATABASE_EVENTS.ready,
    MANAGED_DATABASE_EVENTS.cleanupComplete,
  ]);
});

test("managed prepare-push runner reuses the same owned-container cleanup lifecycle", async () => {
  const output = [];
  let container = null;
  const runtime = {
    probe: () => ({ ready: true, message: "ready" }),
    start(spec) {
      container = healthyContainer(spec);
    },
    inspect() {
      return container;
    },
    remove() {
      container = null;
    },
    hostReady: () => true,
    async runGate(options) {
      assert.equal(options.preparePush, true);
      assert.equal(options.forceFull, true);
      assert.equal(options.remote, "origin");
      assert.deepEqual(options.refs, [REFSPEC]);
      assert.equal(options.databaseURL, DATABASE_URL);
      options.onChild({ kill() {} });
      return { code: 0, signal: "" };
    },
    async sleep() {},
  };
  const result = await runManagedQualityGate({
    preparePush: true,
    forceFull: true,
    refs: [REFSPEC],
    remote: "origin",
    operationId: OPERATION_ID,
    repoRoot: "/repo",
    runtime,
    randomPassword: () => PASSWORD,
    stdout: { write: (value) => output.push(value.trim()) },
    processRef: new EventEmitter(),
  });
  assert.deepEqual(result, { code: 0, cleanup: "complete" });
  assert.deepEqual(output, [
    MANAGED_DATABASE_EVENTS.ready,
    MANAGED_DATABASE_EVENTS.cleanupComplete,
  ]);
});

test("managed database runner refuses a false pass when cleanup readback fails", async () => {
  let spec;
  const output = [];
  const runtime = {
    probe: () => ({ ready: true, message: "ready" }),
    start(value) {
      spec = value;
    },
    inspect: () => healthyContainer(spec),
    remove() {},
    hostReady: () => true,
    async runGate(options) {
      options.onChild({ kill() {} });
      return { code: 0, signal: "" };
    },
    async sleep() {},
  };
  const result = await runManagedQualityGate({
    gate: "full",
    operationId: OPERATION_ID,
    repoRoot: "/repo",
    runtime,
    randomPassword: () => PASSWORD,
    stdout: { write: (value) => output.push(value.trim()) },
    processRef: new EventEmitter(),
  });
  assert.equal(result.code, 2);
  assert.equal(result.cleanup, "failed");
  assert.equal(output.at(-1), MANAGED_DATABASE_EVENTS.cleanupFailed);
});

test("managed database runner cleans an exact container after an ambiguous start failure", async () => {
  let spec;
  let container = null;
  let removed = false;
  const output = [];
  const runtime = {
    probe: () => ({ ready: true, message: "ready" }),
    start(value) {
      spec = value;
      container = healthyContainer(spec);
      throw new Error("Docker response was interrupted after create");
    },
    inspect: () => container,
    remove() {
      removed = true;
      container = null;
    },
    async runGate() {
      throw new Error("must not run");
    },
    async sleep() {},
  };
  const result = await runManagedQualityGate({
    gate: "full",
    operationId: OPERATION_ID,
    repoRoot: "/repo",
    runtime,
    randomPassword: () => PASSWORD,
    stdout: { write: (value) => output.push(value.trim()) },
    processRef: new EventEmitter(),
  });
  assert.equal(removed, true);
  assert.equal(result.code, 2);
  assert.equal(result.cleanup, "complete");
  assert.equal(output.at(-1), MANAGED_DATABASE_EVENTS.cleanupComplete);
});

test("managed database runner cleans without launching the gate when host readiness times out", async () => {
  const output = [];
  let container = null;
  let nowMs = 0;
  let gateStarted = false;
  const result = await runManagedQualityGate({
    gate: "full",
    operationId: OPERATION_ID,
    repoRoot: "/repo",
    runtime: {
      probe: () => ({ ready: true, message: "ready" }),
      start(spec) {
        container = healthyContainer(spec);
      },
      inspect: () => container,
      remove() {
        container = null;
      },
      hostReady: () => false,
      now: () => nowMs,
      async runGate() {
        gateStarted = true;
        return { code: 0, signal: "" };
      },
      async sleep(delayMs) {
        nowMs += delayMs;
      },
    },
    randomPassword: () => PASSWORD,
    stdout: { write: (value) => output.push(value.trim()) },
    processRef: new EventEmitter(),
  });
  assert.deepEqual(result, { code: 2, cleanup: "complete" });
  assert.equal(gateStarted, false);
  assert.equal(container, null);
  assert(!output.includes(MANAGED_DATABASE_EVENTS.ready));
  assert.equal(output.at(-1), MANAGED_DATABASE_EVENTS.cleanupComplete);
});

test("managed database runner emits bounded cleanup when runtime is blocked before create", async () => {
  const output = [];
  const result = await runManagedQualityGate({
    gate: "strict",
    operationId: OPERATION_ID,
    runtime: { probe: () => ({ ready: false }) },
    stdout: { write: (value) => output.push(value.trim()) },
  });
  assert.deepEqual(result, { code: 2, cleanup: "complete" });
  assert.deepEqual(output, [MANAGED_DATABASE_EVENTS.cleanupComplete]);
});
