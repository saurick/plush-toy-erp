import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import {
  MANAGED_DATABASE_EVENTS,
  MANAGED_DATABASE_IMAGE,
  MANAGED_DATABASE_LABELS,
  buildManagedDatabaseContainerSpec,
  parseManagedDatabaseInspectResult,
  parseManagedDatabaseArgs,
  probeManagedDatabaseRuntime,
  readManagedLoopbackPort,
  runManagedQualityGate,
} from "./run-gate-with-managed-database.mjs";

const OPERATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const PASSWORD = "a-unique-runtime-password-that-is-long-enough";

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
  assert.deepEqual(events, ["start", "gate", "remove"]);
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
