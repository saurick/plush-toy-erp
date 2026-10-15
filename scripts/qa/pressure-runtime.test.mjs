import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";
import {
  DEFAULT_PRESSURE_LIMITS, pressureRPC, summarizePressureResults, evaluatePressureLevel,
  runPressureLevel, verifyPressureRuntime, validatePressureLevel, pressureFailureDetails,
} from "./pressure-runtime.mjs";

test("business assertion diagnostics retain their key without copying private error content", async () => {
  const result = await pressureRPC({ baseURL: "http://127.0.0.1:1", domain: "purchase_order", method: "get_purchase_order",
    fetchImpl: async () => new Response(JSON.stringify({ result: { code: 0, data: { id: 1 } } })),
    validate: () => {
      const error = new Error("private token and postgres://user:password@localhost/db");
      error.check = "purchase_header_and_pagination"; throw error;
    },
  });
  assert.equal(result.errorClass, "invalid_result"); assert.equal(result.check, "purchase_header_and_pagination");
  assert.doesNotMatch(JSON.stringify(result), /private|password|postgres/u);
  assert.deepEqual(pressureFailureDetails({ message: "private", code: 403, check: "token=private", method: "unsafe/private" }),
    { errorClass: "execution_error", code: 403 });
});

const rpc = (body, options = {}) => pressureRPC({
  baseURL: "http://127.0.0.1:1", domain: "sales_order", method: "test",
  fetchImpl: async () => new Response(JSON.stringify(body), { status: 200 }), ...options,
});
test("HTTP 200 business errors and JSON-RPC errors do not count as successful work", async () => {
  for (const body of [{ result: { code: 403, message: "secret" } }, { error: { code: -32000, message: "secret" } }]) {
    const result = await rpc(body);
    assert.equal(result.ok, false);
    assert.equal(result.errorClass, "application_error");
    assert.doesNotMatch(JSON.stringify(result), /secret/u);
  }
});
test("missing, malformed and contract-invalid success data fail closed", async () => {
  for (const data of [undefined, null, [], "valid"]) assert.equal((await rpc({ result: { code: 0, data } })).ok, false);
  assert.equal((await rpc({ result: { code: 0, data: {} } }, { validate: () => false })).errorClass, "invalid_result");
  assert.equal((await rpc({ result: { code: 0, data: {} } }, { validate: () => { throw new Error("secret"); } })).errorClass, "invalid_result");
  assert.equal((await rpc({ result: { code: 0, data: { id: 1 } } }, { validate: (data) => data.id === 1 })).ok, true);
});
test("non-JSON overload responses preserve HTTP error classification", async () => {
  for (const [status, expected] of [[429, "rate_limited"], [503, "overloaded"], [500, "server_error"]]) {
    const result = await rpc({}, { fetchImpl: async () => new Response("unavailable", { status }) });
    assert.equal(result.errorClass, expected);
  }
});
test("cancellation and request timeout have separate classifications", async () => {
  const controller = new AbortController(); controller.abort();
  const impl = async (_url, { signal }) => { signal.throwIfAborted(); await delay(30, undefined, { signal }); };
  assert.equal((await rpc({}, { signal: controller.signal, fetchImpl: impl })).errorClass, "cancelled");
  assert.equal((await rpc({}, { timeoutMs: 5, fetchImpl: impl })).errorClass, "timeout");
});
test("effective throughput excludes rejected work and latency reports both populations", () => {
  const stats = summarizePressureResults([
    { ok: true, durationMs: 200 }, { ok: false, durationMs: 1, errorClass: "rate_limited" },
    { ok: false, durationMs: 1, errorClass: "rate_limited" },
  ], 1000);
  assert.equal(stats.throughputRps, 3); assert.equal(stats.successfulRps, 1);
  assert.equal(stats.successfulLatencyMs.p95, 200); assert.equal(stats.failures, 2);
});
const good = summarizePressureResults(Array.from({ length: 20 }, () => ({ ok: true, durationMs: 100 })), 1000);
const evaluation = (overrides = {}) => evaluatePressureLevel({
  stats: good, methods: { read: good }, expectedMethods: ["read"],
  level: { requests: 20 }, limits: DEFAULT_PRESSURE_LIMITS, elapsedMs: 1000, ...overrides,
});
test("small samples, low throughput, slow methods and unfinished budgets cannot pass", () => {
  assert.equal(evaluation().capacityPassed, true);
  for (const override of [
    { methods: {} }, { stats: { ...good, successfulRps: 0.1 } },
    { methods: { read: { ...good, successes: 1 } } },
    { methods: { read: { ...good, successfulLatencyMs: { p95: 1200, p99: 2400 } } } },
    { level: { durationMs: 2000 } }, { level: { requests: 100 } },
    { stats: { ...good, successes: 0 } },
  ]) assert.equal(evaluation(override).accepted, false);
});
test("overload protection never implies that normal capacity met its thresholds", () => {
  const stats = summarizePressureResults([
    ...Array.from({ length: 6 }, () => ({ ok: true, durationMs: 3000 })),
    { ok: false, durationMs: 10, errorClass: "rate_limited" },
  ], 20000);
  const report = evaluation({ stats, methods: { read: stats }, level: { requests: 7, allowedErrorClasses: ["rate_limited"] }, elapsedMs: 20000 });
  assert.equal(report.accepted, true); assert.equal(report.overloadProtectionPassed, true);
  assert.equal(report.capacityPassed, false);
  assert.equal(evaluation({ stats: { ...stats, successes: 0 }, level: { requests: 7, allowedErrorClasses: ["rate_limited"] } }).accepted, false);
});
test("runtime proof binds backend database, migration and release and rejects missing proof", async () => {
  const args = { baseURL: "http://127.0.0.1:1", databaseName: "plush_erp_capacity_test", commit: "a".repeat(40), migration: "20260901000000" };
  const expected = createHash("sha256").update(["release-v1", args.databaseName, args.commit, args.migration].join("\n")).digest("hex");
  await verifyPressureRuntime({ ...args, fetchImpl: async (_url, options) => {
    assert.equal(options.headers["X-ERP-Expected-Runtime-Identity-SHA256"], expected);
    return new Response("ready", { headers: { "X-ERP-Runtime-Identity-Proof": "matched-v1" } });
  } });
  await assert.rejects(verifyPressureRuntime({ ...args, fetchImpl: async () => new Response("ready") }), /did not match/u);
  await assert.rejects(verifyPressureRuntime({ ...args, commit: "dirty" }), /exact/u);
});
test("load budgets reject unbounded and ambiguous execution", () => {
  for (const level of [
    { concurrency: 1 }, { concurrency: 101, requests: 10 }, { concurrency: 1, requests: -1 },
    { concurrency: 1, requests: 1.5 }, { concurrency: 1, durationMs: 15000000 },
    { concurrency: 1, requests: 10, durationMs: 100 }, { concurrency: 1, requests: 10, pacingMs: NaN },
  ]) assert.throws(() => validatePressureLevel(level));
});
test("levels count business flows separately from their RPCs", async () => {
  const report = await runPressureLevel({
    level: { key: "business", concurrency: 2, requests: 10, businessFlow: true },
    expectedMethods: ["read", "write"],
    requestFactory: async (_index, observe) => {
      observe({ ok: true, method: "read", durationMs: 10 });
      observe({ ok: true, method: "write", durationMs: 20 });
      return { ok: true };
    },
  });
  assert.equal(report.completedBusinessFlows, 10); assert.equal(report.rpc.requests, 20);
  assert.equal(report.methods.write.successes, 10); assert.equal(report.failures, 0);
  assert.equal(report.acceptance, true);
});
test("a failed worker cancels and settles other workers before returning partial evidence", async () => {
  let active = 0;
  await assert.rejects(runPressureLevel({
    level: { concurrency: 3, requests: 10 },
    requestFactory: async (index, _observe, signal) => {
      if (index === 0) { await delay(5); throw new Error("private token"); }
      active++;
      try { await delay(100, undefined, { signal }); } finally { active--; }
      return { ok: true, method: "read", durationMs: 1 };
    },
  }), (error) => {
    assert.equal(active, 0); assert.equal(error.pressureLevel.acceptance, false);
    assert.doesNotMatch(error.message, /private/u); return true;
  });
});
test("duration levels sustain work and retain bounded aggregates with per-method samples", async () => {
  const report = await runPressureLevel({
    level: { key: "steady", concurrency: 2, durationMs: 40, pacingMs: 1 },
    expectedMethods: ["read"],
    requestFactory: async () => ({ ok: true, method: "read", durationMs: 0.8 }),
  });
  assert.ok(report.elapsedMs >= 40); assert.ok(report.methods.read.successes >= 5);
  assert.equal(report.targetDurationMs, 40); assert.equal(report.acceptance, true);
});
