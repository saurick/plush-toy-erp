#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { assertDisposableDatabaseTarget } from "./database-target.mjs";

export const CONFIRM_PHRASE = "RUN_ISOLATED_MANUAL_ACCEPTANCE_PRESSURE";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const execFileAsync = promisify(execFile);

export const PRESSURE_PROFILES = Object.freeze({
  capacity: Object.freeze([
    Object.freeze({ key: "ramp", concurrency: 5, requests: 100 }),
    Object.freeze({
      key: "capacity",
      concurrency: 20,
      requests: 1000,
      cooldownBeforeMs: 2000,
      pacingMs: 400,
    }),
    Object.freeze({
      key: "recovery",
      concurrency: 5,
      requests: 100,
      cooldownBeforeMs: 5000,
      pacingMs: 200,
    }),
  ]),
  saturation: Object.freeze([
    Object.freeze({ key: "ramp", concurrency: 20, requests: 500 }),
    Object.freeze({
      key: "saturation",
      concurrency: 100,
      requests: 5000,
      allowedErrorClasses: Object.freeze([
        "rate_limited",
        "overloaded",
        "timeout",
      ]),
    }),
    Object.freeze({
      key: "recovery",
      concurrency: 5,
      requests: 100,
      cooldownBeforeMs: 5000,
      pacingMs: 200,
    }),
  ]),
  soak: Object.freeze([
    Object.freeze({ key: "ramp", concurrency: 10, requests: 200 }),
    Object.freeze({
      key: "soak",
      concurrency: 20,
      requests: 5000,
      pacingMs: 400,
    }),
    Object.freeze({
      key: "recovery",
      concurrency: 5,
      requests: 100,
      cooldownBeforeMs: 5000,
      pacingMs: 200,
    }),
  ]),
});

export const PRESSURE_LEVELS = PRESSURE_PROFILES.capacity;

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

async function readExecutionIdentity() {
  const [{ stdout: commit }, { stdout: status }] = await Promise.all([
    execFileAsync("git", ["rev-parse", "HEAD"]),
    execFileAsync("git", ["status", "--porcelain=v1", "--untracked-files=no"]),
  ]);
  const hardware = {
    platform: os.platform(),
    arch: os.arch(),
    cpuCount: os.cpus().length,
    memoryBytes: os.totalmem(),
    node: process.version,
  };
  return {
    commit: commit.trim(),
    treeState: status.trim() ? "dirty" : "clean",
    hardware,
    hardwareFingerprint: sha256(JSON.stringify(hardware)),
  };
}

export function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)
  ];
}

export function normalizeLoopbackURL(value) {
  const url = new URL(String(value || "http://127.0.0.1:8300"));
  if (
    url.protocol !== "http:" ||
    !LOCAL_HOSTS.has(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "pressure target must be loopback HTTP without credentials",
    );
  }
  return url.origin;
}

export function selectCapacityIdempotencyTask(
  tasks = [],
  { sourceType, sourceID } = {},
) {
  const expectedSourceType = String(sourceType || "").trim();
  const expectedSourceID = Number(sourceID);
  if (
    !expectedSourceType ||
    !Number.isSafeInteger(expectedSourceID) ||
    expectedSourceID <= 0
  ) {
    return undefined;
  }
  return (Array.isArray(tasks) ? tasks : []).find(
    (task) =>
      task?.task_group === "trial_pmc_work" &&
      task?.task_status_key === "ready" &&
      task?.owner_role_key === "pmc" &&
      task?.source_type === expectedSourceType &&
      Number(task?.source_id) === expectedSourceID &&
      task?.payload?.simulated_only === true &&
      task?.payload?.real_customer_data === false &&
      task?.payload?.trial_task === true,
  );
}

async function readDatabaseStats(databaseURL) {
  const { stdout } = await execFileAsync(
    "/opt/homebrew/opt/libpq/bin/psql",
    [
      databaseURL,
      "-Atc",
      "select json_build_object('workflow_tasks',(select count(*) from workflow_tasks),'workflow_task_version_sum',(select coalesce(sum(version),0) from workflow_tasks),'workflow_task_events',(select count(*) from workflow_task_events),'production_facts',(select count(*) from production_facts),'finance_facts',(select count(*) from finance_facts),'attachments',(select count(*) from business_attachments),'backends',numbackends,'conflicts',conflicts,'deadlocks',deadlocks,'temp_files',temp_files,'temp_bytes',temp_bytes,'active_queries',(select count(*) from pg_stat_activity where datname=current_database() and state='active'),'lock_waiters',(select count(*) from pg_stat_activity where datname=current_database() and wait_event_type='Lock')) from pg_stat_database where datname=current_database()",
    ],
    { maxBuffer: 1024 * 1024 },
  );
  return JSON.parse(stdout.trim());
}

async function readIdempotencyReceipt(databaseURL, taskID, idempotencyKey) {
  const { stdout } = await execFileAsync(
    "/opt/homebrew/opt/libpq/bin/psql",
    [
      databaseURL,
      "-Atc",
      `select json_build_object(
        'event_count', count(*),
        'task_version_count', count(distinct task_version),
        'intent_hash_count', count(distinct intent_hash),
        'command_key_count', count(distinct command_key),
        'has_mutation_result', bool_and(mutation_result is not null)
      )
      from workflow_task_events
      where task_id = ${Number(taskID)}
        and idempotency_key = '${String(idempotencyKey).replaceAll("'", "''")}'`,
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
      samples.push({
        at: new Date().toISOString(),
        ...(await readDatabaseStats(databaseURL)),
      });
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
      maxBackends: Math.max(
        0,
        ...valid.map((item) => Number(item.backends || 0)),
      ),
      maxActiveQueries: Math.max(
        0,
        ...valid.map((item) => Number(item.active_queries || 0)),
      ),
      maxLockWaiters: Math.max(
        0,
        ...valid.map((item) => Number(item.lock_waiters || 0)),
      ),
      maxDeadlocks: Math.max(
        0,
        ...valid.map((item) => Number(item.deadlocks || 0)),
      ),
      maxConflicts: Math.max(
        0,
        ...valid.map((item) => Number(item.conflicts || 0)),
      ),
    };
  };
}

async function rpc({ baseURL, domain, method, params = {}, token = "" }) {
  const started = performance.now();
  try {
    const response = await fetch(`${baseURL}/rpc/${domain}`, {
      method: "POST",
      redirect: "error",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `pressure-${Date.now()}-${Math.random()}`,
        method,
        params,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    const durationMs = performance.now() - started;
    if (!response.ok || body?.result?.code !== 0) {
      const status = Number(response.status);
      const code = Number(body?.result?.code);
      const errorClass =
        status === 429 || code === 429
          ? "rate_limited"
          : status === 503 || code === 503
            ? "overloaded"
            : status >= 500
              ? "server_error"
              : "application_error";
      return {
        ok: false,
        durationMs,
        errorClass,
        error: `${domain}.${method}:${body?.result?.code ?? response.status}:${body?.result?.message || "failed"}`,
      };
    }
    return { ok: true, durationMs, data: body.result.data || {} };
  } catch (error) {
    const errorClass =
      error?.name === "TimeoutError" || error?.name === "AbortError"
        ? "timeout"
        : "transport_error";
    return {
      ok: false,
      durationMs: performance.now() - started,
      errorClass,
      error: `${domain}.${method}:transport:${error.message}`,
    };
  }
}

async function login(baseURL, username, password) {
  const result = await rpc({
    baseURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
  });
  if (!result.ok) throw new Error(result.error);
  const token = result.data.access_token || result.data.token;
  if (!token) throw new Error(`${username} login response missing token`);
  return { token, profile: result.data };
}

async function runLevel({ level, requestFactory }) {
  if (Number(level.cooldownBeforeMs || 0) > 0) {
    await new Promise((resolve) =>
      setTimeout(resolve, Number(level.cooldownBeforeMs)),
    );
  }
  const results = new Array(level.requests);
  let cursor = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: level.concurrency }, async (_, workerIndex) => {
      if (Number(level.pacingMs || 0) > 0 && workerIndex > 0) {
        await new Promise((resolve) =>
          setTimeout(
            resolve,
            Math.floor(
              (Number(level.pacingMs) * workerIndex) / level.concurrency,
            ),
          ),
        );
      }
      while (true) {
        const index = cursor++;
        if (index >= level.requests) return;
        if (Number(level.pacingMs || 0) > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, Number(level.pacingMs)),
          );
        }
        results[index] = await requestFactory(index);
      }
    }),
  );
  const elapsedMs = performance.now() - started;
  const successes = results.filter((item) => item.ok);
  const durations = results.map((item) => item.durationMs);
  const errors = Object.fromEntries(
    [
      ...new Set(results.filter((item) => !item.ok).map((item) => item.error)),
    ].map((error) => [
      error,
      results.filter((item) => item.error === error).length,
    ]),
  );
  const errorClasses = Object.fromEntries(
    [
      ...new Set(
        results.filter((item) => !item.ok).map((item) => item.errorClass),
      ),
    ].map((errorClass) => [
      errorClass,
      results.filter((item) => item.errorClass === errorClass).length,
    ]),
  );
  const allowedErrorClasses = new Set(level.allowedErrorClasses || []);
  const failuresAllowed =
    failuresAreAllowed(level) &&
    results
      .filter((item) => !item.ok)
      .every((item) => allowedErrorClasses.has(item.errorClass));
  return {
    key: level.key,
    concurrency: level.concurrency,
    requests: level.requests,
    cooldownBeforeMs: Number(level.cooldownBeforeMs || 0),
    pacingMs: Number(level.pacingMs || 0),
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
    errorClasses,
    acceptance:
      results.length > 0 &&
      (results.length === successes.length ||
        (failuresAllowed && successes.length > 0)),
  };
}

function failuresAreAllowed(level) {
  return (
    Array.isArray(level.allowedErrorClasses) &&
    level.allowedErrorClasses.length > 0
  );
}

export async function runIsolatedPressure({
  baseURL,
  adminUsername = "demo_admin",
  debugUsername = "demo_debug",
  password,
  rolePassword = password,
  confirm,
  databaseName,
  databaseURL,
  datasetReceipt,
  profile = "capacity",
  taskSourceType,
  taskSourceID,
}) {
  baseURL = normalizeLoopbackURL(baseURL);
  if (confirm !== CONFIRM_PHRASE)
    throw new Error(`confirmation must equal ${CONFIRM_PHRASE}`);
  const databaseTarget = assertDisposableDatabaseTarget({
    databaseName,
    databaseURL,
    profile: "capacity",
  });
  if (!password)
    throw new Error("MANUAL_ACCEPTANCE_ADMIN_PASSWORD is required");
  if (!rolePassword)
    throw new Error("MANUAL_ACCEPTANCE_ROLE_PASSWORD is required");
  taskSourceType = String(taskSourceType || "").trim();
  taskSourceID = Number(taskSourceID);
  if (
    !taskSourceType ||
    !Number.isSafeInteger(taskSourceID) ||
    taskSourceID <= 0
  ) {
    throw new Error(
      "taskSourceType and taskSourceID must bind the simulated pressure task batch",
    );
  }
  const levelsToRun = PRESSURE_PROFILES[profile];
  if (!levelsToRun) {
    throw new Error(
      `pressure profile must be one of ${Object.keys(PRESSURE_PROFILES).join(", ")}`,
    );
  }
  if (
    !datasetReceipt ||
    datasetReceipt.status !== "passed" ||
    datasetReceipt.databaseName !== databaseName ||
    datasetReceipt.taskSourceType !== taskSourceType ||
    Number(datasetReceipt.taskSourceID) !== taskSourceID ||
    !Number.isSafeInteger(
      Number(datasetReceipt.after?.capacityAttachmentOwnerID),
    ) ||
    Number(datasetReceipt.after?.capacityAttachmentOwnerID) <= 0 ||
    !/^[0-9a-f]{64}$/u.test(String(datasetReceipt.datasetHash || ""))
  ) {
    throw new Error(
      "passed capacity dataset receipt must bind the database and task batch",
    );
  }
  const capacityAttachmentOwnerID = Number(
    datasetReceipt.after.capacityAttachmentOwnerID,
  );
  const admin = await login(baseURL, adminUsername, password);
  const adminRoleKeys = new Set(
    (admin.profile.roles || []).map((role) => role?.role_key),
  );
  if (
    admin.profile.is_super_admin !== true &&
    !adminRoleKeys.has("admin")
  ) {
    throw new Error("capacity admin identity must be super admin or admin role");
  }
  const debug = await login(baseURL, debugUsername, rolePassword);
  const capabilities = await rpc({
    baseURL,
    domain: "debug",
    method: "capabilities",
    token: debug.token,
  });
  if (
    !capabilities.ok ||
    !new Set(["local", "dev"]).has(capabilities.data.environment)
  )
    throw new Error("runtime must report local/dev");
  const session = await rpc({
    baseURL,
    domain: "customer_config",
    method: "get_effective_session",
    params: { customer_key: "yoyoosun" },
    token: admin.token,
  });
  if (
    !session.ok ||
    !session.data.session?.source
  ) {
    throw new Error("customer config session identity is required");
  }

  const accounts = {};
  for (const [key, username] of Object.entries({
    pmc: "demo_pmc",
    production: "demo_production",
    finance: "demo_finance",
    sales: "demo_sales",
  })) {
    accounts[key] = await login(baseURL, username, rolePassword);
  }

  const probes = [
    {
      key: "workflow",
      domain: "workflow",
      method: "list_tasks",
      token: accounts.pmc.token,
      params: (index) => ({ limit: 50, offset: (index * 50) % 4950 }),
    },
    {
      key: "production",
      domain: "operational_fact",
      method: "list_production_facts",
      token: accounts.production.token,
      params: (index) => ({ limit: 50, offset: (index * 50) % 1950 }),
    },
    {
      key: "finance",
      domain: "operational_fact",
      method: "list_finance_facts",
      token: accounts.finance.token,
      params: (index) => ({ limit: 50, offset: (index * 50) % 1950 }),
    },
    {
      key: "attachments",
      domain: "attachment",
      method: "list_attachments",
      token: accounts.pmc.token,
      params: () => ({
        owner_type: "workflow_task",
        owner_id: capacityAttachmentOwnerID,
      }),
    },
  ];
  const baseline = {};
  for (const probe of probes) {
    const result = await rpc({ baseURL, ...probe, params: probe.params(0) });
    if (!result.ok)
      throw new Error(`baseline ${probe.key} failed: ${result.error}`);
    baseline[probe.key] = Number(
      result.data.total ??
        result.data.attachments?.length ??
        result.data[`${probe.key}_facts`]?.length ??
        0,
    );
  }

  const databaseBefore = await readDatabaseStats(databaseURL);
  const stopDatabaseSampler = startDatabaseSampler(databaseURL);
  const levels = [];
  for (const level of levelsToRun) {
    levels.push(
      await runLevel({
        level,
        requestFactory: (index) => {
          const probe = probes[index % probes.length];
          return rpc({
            baseURL,
            domain: probe.domain,
            method: probe.method,
            token: probe.token,
            params: probe.params(index),
          });
        },
      }),
    );
  }

  await new Promise((resolve) => setTimeout(resolve, 3000));
  const taskList = await rpc({
    baseURL,
    domain: "workflow",
    method: "list_tasks",
    token: accounts.pmc.token,
    params: {
      task_group: "trial_pmc_work",
      task_status_key: "ready",
      source_type: taskSourceType,
      source_id: taskSourceID,
      limit: 20,
    },
  });
  const task = selectCapacityIdempotencyTask(taskList.data?.tasks, {
    sourceType: taskSourceType,
    sourceID: taskSourceID,
  });
  if (!task?.id || !task?.version) {
    throw new Error(
      "same-batch simulated trial_pmc_work idempotency probe task is missing",
    );
  }
  const idempotencyKey =
    `capacity-idempotency-${databaseName}-${task.id}-${Date.now()}`;
  const runIdempotencyRequest = () =>
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
        payload: { surface_key: "capacity_pressure" },
      },
    });
  const idempotencyInitialResults = await Promise.all(
    Array.from({ length: 20 }, runIdempotencyRequest),
  );
  const initialFailures = idempotencyInitialResults.filter((item) => !item.ok);
  const idempotencyRetryResults = [];
  let eventualFailures = initialFailures;
  for (let round = 1; round <= 5 && eventualFailures.length > 0; round += 1) {
    await new Promise((resolve) => setTimeout(resolve, round * 1000));
    const roundResults = await Promise.all(
      eventualFailures.map(runIdempotencyRequest),
    );
    idempotencyRetryResults.push(...roundResults);
    eventualFailures = roundResults.filter((item) => !item.ok);
  }
  const allSuccessfulIdempotencyResults = [
    ...idempotencyInitialResults.filter((item) => item.ok),
    ...idempotencyRetryResults.filter((item) => item.ok),
  ];
  const idempotencyVersions = [
    ...new Set(
      allSuccessfulIdempotencyResults.map((item) => item.data.task?.version),
    ),
  ];
  const initialErrors = Object.fromEntries(
    [...new Set(initialFailures.map((item) => item.error))].map((error) => [
      error,
      initialFailures.filter((item) => item.error === error).length,
    ]),
  );
  const durableIdempotencyReceipt = await readIdempotencyReceipt(
    databaseURL,
    task.id,
    idempotencyKey,
  );
  const after = {};
  for (const probe of probes) {
    const result = await rpc({ baseURL, ...probe, params: probe.params(0) });
    if (!result.ok)
      throw new Error(`after ${probe.key} failed: ${result.error}`);
    after[probe.key] = Number(
      result.data.total ??
        result.data.attachments?.length ??
        result.data[`${probe.key}_facts`]?.length ??
        0,
    );
  }
  const databaseSampling = await stopDatabaseSampler();
  const databaseAfter = await readDatabaseStats(databaseURL);
  const execution = await readExecutionIdentity();
  const expectedDatabaseDelta =
    Number(databaseAfter.workflow_task_events) -
      Number(databaseBefore.workflow_task_events) ===
      1 &&
    Number(databaseAfter.workflow_task_version_sum) -
      Number(databaseBefore.workflow_task_version_sum) ===
      1;
  const recovery = levels.at(-1);
  return {
    scope: "manual-acceptance-isolated-capacity-pressure",
    profile,
    execution,
    databaseName,
    databaseRunIdentity: databaseTarget.databaseRunIdentity,
    databaseTargetFingerprint: databaseTarget.targetFingerprint,
    environment: capabilities.data.environment,
    customerConfig: {
      source: session.data.session.source,
      revision: session.data.session.configRevision || "",
    },
    dataset: {
      version: datasetReceipt.datasetVersion,
      hash: datasetReceipt.datasetHash,
      workflowTasks: Number(databaseBefore.workflow_tasks),
      productionFacts: Number(databaseBefore.production_facts),
      financeFacts: Number(databaseBefore.finance_facts),
      attachments: Number(databaseBefore.attachments),
    },
    levels,
    idempotency: {
      key: idempotencyKey,
      concurrency: 20,
      initialSuccesses: idempotencyInitialResults.filter((item) => item.ok)
        .length,
      initialFailures: initialFailures.length,
      initialErrors,
      retryAttempts: idempotencyRetryResults.length,
      retrySuccesses: idempotencyRetryResults.filter((item) => item.ok).length,
      eventualFailures: eventualFailures.length,
      resultVersions: idempotencyVersions,
      singleResultVersion: idempotencyVersions.length === 1,
      durableReceipt: durableIdempotencyReceipt,
    },
    consistency: {
      baseline,
      after,
      unchanged: JSON.stringify(baseline) === JSON.stringify(after),
      expectedDatabaseDelta,
    },
    recovery: {
      key: recovery?.key,
      accepted: recovery?.acceptance === true,
      successRate: recovery?.successRate,
    },
    database: {
      before: databaseBefore,
      after: databaseAfter,
      sampling: databaseSampling,
    },
    passed:
      levels.every((item) => item.acceptance === true) &&
      eventualFailures.length === 0 &&
      idempotencyVersions.length === 1 &&
      Number(durableIdempotencyReceipt.event_count) === 1 &&
      Number(durableIdempotencyReceipt.task_version_count) === 1 &&
      Number(durableIdempotencyReceipt.intent_hash_count) === 1 &&
      Number(durableIdempotencyReceipt.command_key_count) === 1 &&
      durableIdempotencyReceipt.has_mutation_result === true &&
      JSON.stringify(baseline) === JSON.stringify(after) &&
      expectedDatabaseDelta &&
      recovery?.key === "recovery" &&
      recovery?.acceptance === true &&
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
  const args = new Map(
    process.argv.slice(2).map((value, index, all) => [value, all[index + 1]]),
  );
  const datasetReceiptPath = args.get("--dataset-receipt");
  if (!datasetReceiptPath) {
    throw new Error("--dataset-receipt is required");
  }
  const datasetReceipt = JSON.parse(
    fs.readFileSync(path.resolve(datasetReceiptPath), "utf8"),
  );
  const report = await runIsolatedPressure({
    baseURL: args.get("--base-url") || "http://127.0.0.1:8300",
    adminUsername: args.get("--admin-username") || "demo_admin",
    debugUsername: args.get("--debug-username") || "demo_debug",
    databaseName: args.get("--database-name"),
    databaseURL: process.env.MANUAL_ACCEPTANCE_PRESSURE_DATABASE_URL,
    password: process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    rolePassword:
      process.env.MANUAL_ACCEPTANCE_ROLE_PASSWORD ||
      process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    confirm: process.env.MANUAL_ACCEPTANCE_PRESSURE_CONFIRM,
    datasetReceipt,
    profile: args.get("--profile") || "capacity",
    taskSourceType: args.get("--task-source-type"),
    taskSourceID: args.get("--task-source-id"),
  });
  const out =
    args.get("--out") ||
    "output/qa/manual-acceptance/capacity-pressure/report.json";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `[qa:manual-acceptance-capacity-pressure] passed=${report.passed} report=${out}\n`,
  );
  if (!report.passed) process.exitCode = 1;
}

if (process.argv[1]?.endsWith("manual-acceptance-capacity-pressure.mjs"))
  main().catch((error) => {
    console.error(
      `[qa:manual-acceptance-capacity-pressure][fatal] ${error.stack || error}`,
    );
    process.exitCode = 1;
  });
