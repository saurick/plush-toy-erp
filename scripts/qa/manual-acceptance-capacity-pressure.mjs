#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const CONFIRM_PHRASE = "RUN_ISOLATED_MANUAL_ACCEPTANCE_PRESSURE";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const execFileAsync = promisify(execFile);

export const PRESSURE_LEVELS = Object.freeze([
  Object.freeze({ key: "capacity", concurrency: 20, requests: 1000 }),
  Object.freeze({ key: "stress", concurrency: 100, requests: 5000 }),
]);

export function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function normalizeLoopbackURL(value) {
  const url = new URL(String(value || "http://127.0.0.1:8300"));
  if (url.protocol !== "http:" || !LOCAL_HOSTS.has(url.hostname) || url.username || url.password) {
    throw new Error("pressure target must be loopback HTTP without credentials");
  }
  return url.origin;
}

async function readDatabaseStats(databaseURL) {
  const { stdout } = await execFileAsync(
    "/opt/homebrew/opt/libpq/bin/psql",
    [
      databaseURL,
      "-Atc",
      "select json_build_object('workflow_tasks',(select count(*) from workflow_tasks),'production_facts',(select count(*) from production_facts),'finance_facts',(select count(*) from finance_facts),'attachments',(select count(*) from business_attachments),'backends',numbackends,'conflicts',conflicts,'deadlocks',deadlocks,'temp_files',temp_files,'temp_bytes',temp_bytes,'active_queries',(select count(*) from pg_stat_activity where datname=current_database() and state='active'),'lock_waiters',(select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock')) from pg_stat_database where datname=current_database()",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout.trim());
}

function startDatabaseSampler(databaseURL) {
  const samples = [];
  let stopped = false;
  const run = async () => {
    if (stopped) return;
    try {
      samples.push({ at: new Date().toISOString(), ...(await readDatabaseStats(databaseURL)) });
    } catch (error) {
      samples.push({ at: new Date().toISOString(), error: error.message });
    }
  };
  const timer = setInterval(run, 1000);
  void run();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await run();
    const valid = samples.filter((item) => !item.error);
    return {
      sampleCount: samples.length,
      sampleErrors: samples.filter((item) => item.error).length,
      maxBackends: Math.max(0, ...valid.map((item) => Number(item.backends || 0))),
      maxActiveQueries: Math.max(0, ...valid.map((item) => Number(item.active_queries || 0))),
      maxLockWaiters: Math.max(0, ...valid.map((item) => Number(item.lock_waiters || 0))),
      maxDeadlocks: Math.max(0, ...valid.map((item) => Number(item.deadlocks || 0))),
      maxConflicts: Math.max(0, ...valid.map((item) => Number(item.conflicts || 0))),
    };
  };
}

async function rpc({ baseURL, domain, method, params = {}, token = "" }) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseURL}/rpc/${domain}`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: "2.0", id: `pressure-${Date.now()}-${Math.random()}`, method, params }),
    });
    const body = await response.json();
    const durationMs = performance.now() - started;
    if (!response.ok || body?.result?.code !== 0) {
      return { ok: false, durationMs, error: `${domain}.${method}:${body?.result?.code ?? response.status}:${body?.result?.message || "failed"}` };
    }
    return { ok: true, durationMs, data: body.result.data || {} };
  } catch (error) {
    return { ok: false, durationMs: performance.now() - started, error: `${domain}.${method}:transport:${error.message}` };
  }
}

async function login(baseURL, username, password) {
  const result = await rpc({ baseURL, domain: "auth", method: "admin_login", params: { username, password } });
  if (!result.ok) throw new Error(result.error);
  const token = result.data.access_token || result.data.token;
  if (!token) throw new Error(`${username} login response missing token`);
  return { token, profile: result.data };
}

async function runLevel({ level, requestFactory }) {
  const results = new Array(level.requests);
  let cursor = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: level.concurrency }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= level.requests) return;
        results[index] = await requestFactory(index);
      }
    }),
  );
  const elapsedMs = performance.now() - started;
  const successes = results.filter((item) => item.ok);
  const durations = results.map((item) => item.durationMs);
  const errors = Object.fromEntries(
    [...new Set(results.filter((item) => !item.ok).map((item) => item.error))].map((error) => [
      error,
      results.filter((item) => item.error === error).length,
    ]),
  );
  return {
    key: level.key,
    concurrency: level.concurrency,
    requests: level.requests,
    successes: successes.length,
    failures: results.length - successes.length,
    successRate: successes.length / results.length,
    elapsedMs: Number(elapsedMs.toFixed(2)),
    throughputRps: Number((results.length / (elapsedMs / 1000)).toFixed(2)),
    latencyMs: {
      p50: Number(percentile(durations, 0.5).toFixed(2)),
      p95: Number(percentile(durations, 0.95).toFixed(2)),
      p99: Number(percentile(durations, 0.99).toFixed(2)),
      max: Number(Math.max(...durations).toFixed(2)),
    },
    errors,
  };
}

export async function runIsolatedPressure({ baseURL, password, confirm, databaseName, databaseURL }) {
  baseURL = normalizeLoopbackURL(baseURL);
  if (confirm !== CONFIRM_PHRASE) throw new Error(`confirmation must equal ${CONFIRM_PHRASE}`);
  if (!/^plush_erp_capacity_[a-z0-9_]+$/u.test(String(databaseName || ""))) {
    throw new Error("databaseName must identify a disposable plush_erp_capacity_* database");
  }
  const parsedDatabaseURL = new URL(String(databaseURL || ""));
  if (parsedDatabaseURL.pathname !== `/${databaseName}`) {
    throw new Error("databaseURL must point to the declared disposable databaseName");
  }
  if (!password) throw new Error("MANUAL_ACCEPTANCE_ADMIN_PASSWORD is required");

  const admin = await login(baseURL, "admin", password);
  if (admin.profile.is_super_admin !== true) throw new Error("admin must be super admin for runtime guard");
  const capabilities = await rpc({ baseURL, domain: "debug", method: "capabilities", token: admin.token });
  if (!capabilities.ok || !new Set(["local", "dev"]).has(capabilities.data.environment)) throw new Error("runtime must report local/dev");
  const session = await rpc({ baseURL, domain: "customer_config", method: "get_effective_session", params: { customer_key: "yoyoosun" }, token: admin.token });
  if (!session.ok || session.data.session?.source !== "active_customer_config_revision") throw new Error("active yoyoosun revision is required");

  const accounts = {};
  for (const [key, username] of Object.entries({ pmc: "demo_pmc", production: "demo_production", finance: "demo_finance", sales: "demo_sales" })) {
    accounts[key] = await login(baseURL, username, password);
  }

  const probes = [
    { key: "workflow", domain: "workflow", method: "list_tasks", token: accounts.pmc.token, params: (index) => ({ limit: 50, offset: (index * 50) % 4950 }) },
    { key: "production", domain: "operational_fact", method: "list_production_facts", token: accounts.production.token, params: (index) => ({ limit: 50, offset: (index * 50) % 1950 }) },
    { key: "finance", domain: "operational_fact", method: "list_finance_facts", token: accounts.finance.token, params: (index) => ({ limit: 50, offset: (index * 50) % 1950 }) },
    { key: "attachments", domain: "attachment", method: "list_attachments", token: accounts.sales.token, params: () => ({ owner_type: "sales_order", owner_id: 47 }) },
  ];
  const baseline = {};
  for (const probe of probes) {
    const result = await rpc({ baseURL, ...probe, params: probe.params(0) });
    if (!result.ok) throw new Error(`baseline ${probe.key} failed: ${result.error}`);
    baseline[probe.key] = Number(result.data.total ?? result.data.attachments?.length ?? result.data[`${probe.key}_facts`]?.length ?? 0);
  }

  const databaseBefore = await readDatabaseStats(databaseURL);
  const stopDatabaseSampler = startDatabaseSampler(databaseURL);
  const levels = [];
  for (const level of PRESSURE_LEVELS) {
    levels.push(
      await runLevel({
        level,
        requestFactory: (index) => {
          const probe = probes[index % probes.length];
          return rpc({ baseURL, domain: probe.domain, method: probe.method, token: probe.token, params: probe.params(index) });
        },
      }),
    );
  }

  const taskList = await rpc({ baseURL, domain: "workflow", method: "list_tasks", token: accounts.pmc.token, params: { task_group: "production_scheduling", task_status_key: "ready", limit: 20 } });
  const task = taskList.data?.tasks?.[0];
  if (!task?.id || !task?.version) throw new Error("idempotency probe task is missing");
  const idempotencyKey = `capacity-idempotency-${databaseName}-${task.id}`;
  const idempotencyInitialResults = await Promise.all(
    Array.from({ length: 20 }, () =>
      rpc({
        baseURL,
        domain: "workflow",
        method: "urge_task",
        token: accounts.pmc.token,
        params: {
          task_id: task.id,
          expected_version: task.version,
          idempotency_key: idempotencyKey,
          action: "urge_task",
          reason: "【容量测试】并发重复催办只应形成一次处理结果。",
          payload: { handling_note: "【容量测试】并发幂等验证。" },
        },
      }),
    ),
  );
  const initialFailures = idempotencyInitialResults.filter((item) => !item.ok);
  await new Promise((resolve) => setTimeout(resolve, 200));
  const idempotencyRetryResults = await Promise.all(
    initialFailures.map(() =>
      rpc({
        baseURL,
        domain: "workflow",
        method: "urge_task",
        token: accounts.pmc.token,
        params: {
          task_id: task.id,
          expected_version: task.version,
          idempotency_key: idempotencyKey,
          action: "urge_task",
          reason: "【容量测试】并发重复催办只应形成一次处理结果。",
          payload: { handling_note: "【容量测试】并发幂等验证。" },
        },
      }),
    ),
  );
  const allSuccessfulIdempotencyResults = [
    ...idempotencyInitialResults.filter((item) => item.ok),
    ...idempotencyRetryResults.filter((item) => item.ok),
  ];
  const idempotencyVersions = [...new Set(allSuccessfulIdempotencyResults.map((item) => item.data.task?.version))];
  const initialErrors = Object.fromEntries(
    [...new Set(initialFailures.map((item) => item.error))].map((error) => [
      error,
      initialFailures.filter((item) => item.error === error).length,
    ]),
  );
  const after = {};
  for (const probe of probes) {
    const result = await rpc({ baseURL, ...probe, params: probe.params(0) });
    if (!result.ok) throw new Error(`after ${probe.key} failed: ${result.error}`);
    after[probe.key] = Number(result.data.total ?? result.data.attachments?.length ?? result.data[`${probe.key}_facts`]?.length ?? 0);
  }
  const databaseSampling = await stopDatabaseSampler();
  const databaseAfter = await readDatabaseStats(databaseURL);
  return {
    scope: "manual-acceptance-isolated-capacity-pressure",
    databaseName,
    environment: capabilities.data.environment,
    customerConfigRevision: session.data.session.configRevision,
    dataset: {
      workflowTasks: Number(databaseBefore.workflow_tasks),
      productionFacts: Number(databaseBefore.production_facts),
      financeFacts: Number(databaseBefore.finance_facts),
      attachments: Number(databaseBefore.attachments),
    },
    levels,
    idempotency: {
      concurrency: 20,
      initialSuccesses: idempotencyInitialResults.filter((item) => item.ok).length,
      initialFailures: initialFailures.length,
      initialErrors,
      retryAttempts: idempotencyRetryResults.length,
      retrySuccesses: idempotencyRetryResults.filter((item) => item.ok).length,
      eventualFailures: idempotencyRetryResults.filter((item) => !item.ok).length,
      resultVersions: idempotencyVersions,
      singleResultVersion: idempotencyVersions.length === 1,
    },
    consistency: { baseline, after, unchanged: JSON.stringify(baseline) === JSON.stringify(after) },
    database: { before: databaseBefore, after: databaseAfter, sampling: databaseSampling },
    passed:
      levels.every((item) => item.successRate === 1) &&
      idempotencyRetryResults.every((item) => item.ok) &&
      idempotencyVersions.length === 1 &&
      JSON.stringify(baseline) === JSON.stringify(after) &&
      databaseSampling.sampleErrors === 0 &&
      databaseSampling.maxDeadlocks === 0 &&
      databaseSampling.maxConflicts === 0 &&
      Number(databaseBefore.workflow_tasks) >= 5000 &&
      Number(databaseBefore.production_facts) >= 2000 &&
      Number(databaseBefore.finance_facts) >= 2000 &&
      Number(databaseBefore.attachments) >= 1000,
  };
}

async function main() {
  const args = new Map(process.argv.slice(2).map((value, index, all) => [value, all[index + 1]]));
  const report = await runIsolatedPressure({
    baseURL: args.get("--base-url") || "http://127.0.0.1:8300",
    databaseName: args.get("--database-name"),
    databaseURL: process.env.MANUAL_ACCEPTANCE_PRESSURE_DATABASE_URL,
    password: process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    confirm: process.env.MANUAL_ACCEPTANCE_PRESSURE_CONFIRM,
  });
  const out = args.get("--out") || "output/qa/manual-acceptance/capacity-pressure/report.json";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`[qa:manual-acceptance-capacity-pressure] passed=${report.passed} report=${out}\n`);
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("manual-acceptance-capacity-pressure.mjs")) main().catch((error) => { console.error(`[qa:manual-acceptance-capacity-pressure][fatal] ${error.stack || error}`); process.exitCode = 1; });
