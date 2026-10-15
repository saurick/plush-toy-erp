import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

export const DEFAULT_PRESSURE_LIMITS = Object.freeze({
  p95Ms: 1000, p99Ms: 2000, minSuccessfulRps: 1, minMethodSamples: 5,
});

// Failure reports keep bounded diagnostic keys, never arbitrary exception
// messages, response bodies, request parameters or credentials.
export function pressureFailureDetails(error) {
  const result = { errorClass: "execution_error" };
  for (const key of ["errorClass", "method", "check"]) {
    if (typeof error?.[key] === "string" && /^[a-z][a-z0-9_.-]{0,95}$/u.test(error[key])) result[key] = error[key];
  }
  if (Number.isSafeInteger(error?.code)) result.code = error.code;
  return result;
}

export function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1))];
}

export function normalizePressureURL(value) {
  const url = new URL(String(value || "http://127.0.0.1:8300"));
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname) ||
      url.username || url.password || url.pathname !== "/" || url.search || url.hash)
    throw new Error("pressure target must be loopback HTTP without credentials or path");
  return url.origin;
}

export function pressureLogicFingerprint(files, rootDirectory) {
  return createHash("sha256").update(JSON.stringify([...new Set(files)].sort().map((file) =>
    [file, createHash("sha256").update(readFileSync(rootDirectory ? path.join(rootDirectory, file) : new URL("../../" + file, import.meta.url))).digest("hex")],
  ))).digest("hex");
}

export async function verifyPressureRuntime({ baseURL, databaseName, commit, migration, fetchImpl = fetch, signal }) {
  if (!/^[0-9a-f]{40}$/u.test(commit) || !/^\d{14}$/u.test(migration))
    throw new Error("pressure runtime requires an exact commit and migration");
  baseURL = normalizePressureURL(baseURL);
  const scope = "release-v1";
  const digest = createHash("sha256").update([scope, databaseName, commit, migration].join("\n")).digest("hex");
  const response = await fetchImpl(baseURL + "/readyz/runtime-identity", {
    redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    headers: { "X-ERP-Runtime-Identity-Scope": scope, "X-ERP-Expected-Runtime-Identity-SHA256": digest },
  });
  if (!response.ok || response.headers.get("X-ERP-Runtime-Identity-Proof") !== "matched-v1")
    throw new Error("pressure backend database, release or migration identity did not match");
  return { commit, migration, databaseName, proof: "matched-v1" };
}

export async function pressureRPC({ baseURL, domain, method, params = {}, token = "", fetchImpl = fetch, signal, validate, observe, timeoutMs = 15000 }) {
  const started = performance.now(), key = domain + "." + method;
  const timeout = AbortSignal.timeout(timeoutMs);
  let result;
  try {
    const response = await fetchImpl(baseURL + "/rpc/" + domain, {
      method: "POST", redirect: "error",
      headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: "pressure-" + randomUUID(), method, params }),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    let body;
    try { body = await response.json(); } catch { body = null; }
    const code = body?.result?.code, data = body?.result?.data;
    if (!response.ok || body?.error || code !== 0) {
      const errorClass = response.status === 429 || code === 429 ? "rate_limited"
        : response.status === 503 || code === 503 ? "overloaded"
          : response.status >= 500 ? "server_error" : "application_error";
      result = { ok: false, code: Number.isFinite(code) ? code : response.status, errorClass };
    } else {
      let valid = Boolean(data && typeof data === "object" && !Array.isArray(data)), diagnostic;
      try { if (valid && validate) valid = validate(data) === true; }
      catch (error) { valid = false; diagnostic = pressureFailureDetails(error); }
      result = valid ? { ok: true, code: 0, data } : { ok: false, code: 0, errorClass: "invalid_result",
        ...(diagnostic?.check ? { check: diagnostic.check } : {}) };
    }
  } catch {
    result = { ok: false, errorClass: signal?.aborted ? "cancelled" : timeout.aborted ? "timeout" : "transport_error" };
  }
  result = { ...result, method: key, durationMs: performance.now() - started };
  if (!result.ok) result.error = key + ":" + result.errorClass + ":" + (result.code ?? "transport");
  observe?.(result);
  return result;
}

// Histograms retain counts, never response bodies or per-request samples.
// Upper bucket edges give conservative percentiles: 1ms <=1s, 10ms <=10s,
// 100ms <=60s, 1s <=4h; larger values share one bucket and preserve actual max.
export function createPressureAccumulator() {
  const all = new Map(), successful = new Map(), errors = new Map();
  let requests = 0, successes = 0, max = 0, successfulMax = 0;
  function bucket(ms) {
    const step = ms <= 1000 ? 1 : ms <= 10000 ? 10 : ms <= 60000 ? 100 : 1000;
    return Math.min(14400001, Math.ceil(ms / step) * step);
  }
  function latency(histogram, count, maximum) {
    const sorted = [...histogram].sort(([a], [b]) => a - b);
    const rank = (ratio) => {
      const target = Math.ceil(count * ratio);
      let sum = 0;
      for (const [edge, n] of sorted) { sum += n; if (sum >= target) return Math.min(edge, maximum); }
      return 0;
    };
    return { p50: rank(0.5), p95: rank(0.95), p99: rank(0.99), max: maximum };
  }
  return {
    observe(item) {
      if (typeof item?.ok !== "boolean" || !Number.isFinite(item.durationMs) || item.durationMs < 0)
        throw new Error("pressure observation is invalid");
      requests++;
      const edge = bucket(item.durationMs);
      all.set(edge, (all.get(edge) || 0) + 1);
      max = Math.max(max, item.durationMs);
      if (item.ok) {
        successes++; successful.set(edge, (successful.get(edge) || 0) + 1);
        successfulMax = Math.max(successfulMax, item.durationMs);
      } else {
        const key = item.errorClass || "unknown_error";
        errors.set(key, (errors.get(key) || 0) + 1);
      }
    },
    summarize(elapsedMs) {
      return {
        requests, successes, failures: requests - successes, successRate: requests ? successes / requests : 0,
        throughputRps: elapsedMs > 0 ? requests * 1000 / elapsedMs : 0,
        successfulRps: elapsedMs > 0 ? successes * 1000 / elapsedMs : 0,
        latencyMs: latency(all, requests, max), successfulLatencyMs: latency(successful, successes, successfulMax),
        errorClasses: Object.fromEntries(errors),
      };
    },
  };
}

export function summarizePressureResults(results, elapsedMs) {
  const accumulator = createPressureAccumulator();
  results.forEach(accumulator.observe);
  return accumulator.summarize(elapsedMs);
}

export function validatePressureLevel(level, limits = DEFAULT_PRESSURE_LIMITS) {
  if (!Number.isSafeInteger(level.concurrency) || level.concurrency < 1 || level.concurrency > 100)
    throw new Error("pressure concurrency must be between 1 and 100");
  if (Number(level.requests !== undefined) + Number(level.durationMs !== undefined) !== 1)
    throw new Error("pressure level requires one bounded request or duration budget");
  for (const [key, max] of [["requests", 1000000], ["durationMs", 14400000], ["pacingMs", 60000], ["cooldownBeforeMs", 60000]]) {
    if (level[key] !== undefined && (!Number.isSafeInteger(level[key]) || level[key] < (key.endsWith("Ms") && key !== "durationMs" ? 0 : 1) || level[key] > max))
      throw new Error("pressure " + key + " is outside its bounded budget");
  }
  for (const budget of [limits, ...Object.values(level.methodLimits || {}).map((item) => ({ ...limits, ...item }))]) {
    for (const key of ["p95Ms", "p99Ms", "minSuccessfulRps", "minMethodSamples"])
      if (!Number.isFinite(budget[key]) || budget[key] <= 0) throw new Error("pressure limit " + key + " must be positive");
    if (!Number.isSafeInteger(budget.minMethodSamples) || budget.p99Ms < budget.p95Ms)
      throw new Error("pressure percentile or sample limits are invalid");
  }
}

export function evaluatePressureLevel({ stats, methods, expectedMethods, level, limits = DEFAULT_PRESSURE_LIMITS, elapsedMs }) {
  const reasons = [];
  if (stats.requests === 0 || stats.successes === 0) reasons.push("no_successful_work");
  if (level.durationMs && elapsedMs < level.durationMs) reasons.push("duration_not_reached");
  if (level.requests && stats.requests !== level.requests) reasons.push("request_budget_not_reached");
  for (const method of expectedMethods) {
    const measured = methods[method], budget = { ...limits, ...level.methodLimits?.[method] };
    if (!measured || measured.successes < budget.minMethodSamples) reasons.push(method + ":insufficient_samples");
    else if (measured.successfulLatencyMs.p95 > budget.p95Ms || measured.successfulLatencyMs.p99 > budget.p99Ms)
      reasons.push(method + ":latency_exceeded");
  }
  if (stats.successfulRps < limits.minSuccessfulRps) reasons.push("successful_throughput_not_reached");
  if (stats.failures) reasons.push("operation_errors");
  const allowed = new Set(level.allowedErrorClasses || []);
  const overloadProtectionPassed = Boolean(allowed.size && stats.successes > 0 &&
    Object.keys(stats.errorClasses).every((key) => allowed.has(key)) &&
    !reasons.includes("duration_not_reached") && !reasons.includes("request_budget_not_reached") &&
    expectedMethods.every((method) => methods[method]?.successes >= (level.methodLimits?.[method]?.minMethodSamples || limits.minMethodSamples)));
  const capacityPassed = reasons.length === 0;
  return { capacityPassed, overloadProtectionPassed, acceptanceFailures: reasons,
    resultKind: allowed.size ? "overload_protection" : "capacity",
    accepted: allowed.size ? overloadProtectionPassed : capacityPassed };
}

export async function runPressureLevel({ level, requestFactory, expectedMethods = [], limits = DEFAULT_PRESSURE_LIMITS, signal }) {
  validatePressureLevel(level, limits);
  await delay(level.cooldownBeforeMs || 0, undefined, { signal });
  const started = performance.now(), controller = new AbortController();
  const activeSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const hardTimeoutMs = level.durationMs ? level.durationMs + 20000
    : Math.min(14400000, Math.ceil(level.requests / level.concurrency) * (15000 + (level.pacingMs || 0)) + 20000);
  const timer = setTimeout(() => controller.abort(new Error("pressure hard timeout")), hardTimeoutMs);
  const operations = createPressureAccumulator(), businessFlows = createPressureAccumulator(), rpcResults = createPressureAccumulator(), methodAccumulators = new Map();
  let cursor = 0, failure, stopped = false;
  const observe = (item) => {
    if (!item.method || (!methodAccumulators.has(item.method) && methodAccumulators.size >= 100))
      throw new Error("pressure method observation is invalid");
    if (!methodAccumulators.has(item.method)) methodAccumulators.set(item.method, createPressureAccumulator());
    methodAccumulators.get(item.method).observe(item); rpcResults.observe(item);
  };
  const workers = Array.from({ length: level.concurrency }, async (_, worker) => {
    try {
      if (level.pacingMs) await delay(Math.floor(level.pacingMs * worker / level.concurrency), undefined, { signal: activeSignal });
      while (!activeSignal.aborted) {
        if (level.durationMs && performance.now() - started >= level.durationMs) break;
        const index = cursor++;
        if (level.requests && index >= level.requests) break;
        if (level.pacingMs) await delay(level.pacingMs, undefined, { signal: activeSignal });
        if (level.durationMs && performance.now() - started >= level.durationMs) break;
        const operationStarted = performance.now();
        let observed = false;
        const result = await requestFactory(index, (item) => { observed = true; observe(item); }, activeSignal);
        if (!observed) observe(result);
        const operation = { ok: result.ok, errorClass: result.errorClass, durationMs: performance.now() - operationStarted };
        operations.observe(operation);
        if (level.businessFlow || result.businessFlow) businessFlows.observe(operation);
      }
    } catch (error) { failure ||= error; controller.abort(error); }
  });
  try { await Promise.allSettled(workers); stopped = activeSignal.aborted; }
  finally { clearTimeout(timer); controller.abort(); }
  const elapsedMs = performance.now() - started, stats = operations.summarize(elapsedMs);
  const methods = Object.fromEntries([...methodAccumulators].map(([method, accumulator]) => [method, accumulator.summarize(elapsedMs)]));
  const acceptance = evaluatePressureLevel({ stats, methods, expectedMethods, level, limits, elapsedMs });
  const report = { key: level.key, concurrency: level.concurrency, elapsedMs, pacingMs: level.pacingMs || 0,
    targetDurationMs: level.durationMs || null, targetRequests: level.requests || null, ...stats,
    completedBusinessFlows: businessFlows.summarize(elapsedMs).successes, businessFlows: businessFlows.summarize(elapsedMs), rpc: rpcResults.summarize(elapsedMs),
    methods, limits, ...acceptance, acceptance: acceptance.accepted };
  if (failure || stopped) {
    report.acceptance = report.accepted = report.capacityPassed = report.overloadProtectionPassed = false;
    report.acceptanceFailures.push(signal?.aborted ? "cancelled" : "execution_stopped");
    const error = new Error("pressure level stopped before completion"); error.pressureLevel = report; throw error;
  }
  return report;
}
