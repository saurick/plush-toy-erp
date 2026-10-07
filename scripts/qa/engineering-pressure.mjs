#!/usr/bin/env node
import { writeFileSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULT_PRESSURE_LIMITS, runPressureLevel, verifyPressureRuntime, pressureLogicFingerprint, pressureFailureDetails } from "./pressure-runtime.mjs";
import { assertDisposableDatabaseTarget } from "./database-target.mjs";
import { normalizeLoopbackURL, readExecutionIdentity, startDatabaseSampler, startRuntimeMetricsSampler } from "./manual-acceptance-capacity-pressure.mjs";
import { ENGINEERING_API, ENGINEERING_STATUS, assertEngineeringPressureReceipt, checkEngineeringDemand, createEngineeringPressureClient,
  engineeringVerificationFingerprint, runEngineeringBusinessFlow, runEngineeringCompetition } from "./pressure-engineering-scenario.mjs";
import { readEngineeringPressureLedger, checkEngineeringLedger } from "./pressure-engineering-ledger.mjs";
import { ENGINEERING_RECIPES, engineeringDataFingerprint } from "./pressure-engineering-data.mjs";

export const ENGINEERING_PRESSURE_PROFILES = Object.freeze({
  quick: [
    { key: "ramp", concurrency: 2, requests: 100, pacingMs: 50 },
    { key: "capacity", concurrency: 4, requests: 200, pacingMs: 100 },
    { key: "recovery", concurrency: 2, requests: 100, pacingMs: 50, cooldownBeforeMs: 2000 },
  ],
  capacity: [
    { key: "ramp", concurrency: 2, requests: 100, pacingMs: 50 },
    { key: "capacity", concurrency: 4, durationMs: 600000, pacingMs: 1000 },
    { key: "recovery", concurrency: 2, requests: 100, pacingMs: 100, cooldownBeforeMs: 5000 },
  ],
});
export const LOAD_LOGIC_FILES = Object.freeze(["scripts/qa/engineering-pressure.mjs", "scripts/qa/pressure-runtime.mjs"]);
const importedLoadFingerprint = pressureLogicFingerprint(LOAD_LOGIC_FILES);
export function engineeringPressurePoolSize(profile) {
  const levels = ENGINEERING_PRESSURE_PROFILES[profile];
  if (!levels) throw new Error("engineering pressure profile must be quick or capacity");
  return 2 + levels.reduce((count, level) => count + Math.ceil((level.requests ||
    Math.ceil(level.durationMs / level.pacingMs) * level.concurrency) / 10), 0);
}
export async function runEngineeringPressure({
  baseURL, databaseName, databaseURL, tokens, receipt, expectedCommit, expectedMigration,
  profile = "capacity", limits = DEFAULT_PRESSURE_LIMITS, signal, onProgress = () => {},
}) {
  baseURL = normalizeLoopbackURL(baseURL);
  const target = assertDisposableDatabaseTarget({ databaseName, databaseURL, profile: "capacity" });
  assertEngineeringPressureReceipt(receipt, target);
  if (importedLoadFingerprint !== pressureLogicFingerprint(LOAD_LOGIC_FILES)) throw new Error("engineering load changed after loading; restart required");
  if (receipt.orders.length < engineeringPressurePoolSize(profile)) throw new Error("engineering pressure order pool is too small for its load budget");
  const runtimeBefore = await verifyPressureRuntime({ baseURL, databaseName, commit: expectedCommit, migration: expectedMigration, signal });
  const verificationFingerprint = engineeringVerificationFingerprint();
  const loadFingerprint = pressureLogicFingerprint(LOAD_LOGIC_FILES);
  const startedAt = new Date().toISOString(), client = createEngineeringPressureClient({ baseURL, tokens });
  const databaseBefore = await readEngineeringPressureLedger(databaseURL, receipt.orders);
  if (databaseBefore.requests !== 0 || databaseBefore.orders !== receipt.orders.length) throw new Error("engineering pressure requires a fresh unsubmitted order pool");
  const stopDatabase = startDatabaseSampler(databaseURL), stopRuntime = startRuntimeMetricsSampler(baseURL);
  const levels = [], flowFailures = [];
  let competition, cursor = 2, completed = 0, failure, failureDetail, stage = "competition", databaseAfter, runtimeAfter;
  const readOrders = [...receipt.historyOrders, ...receipt.orders];
  const expectedMethods = Object.values(ENGINEERING_API).map((spec) => spec.domain + "." + spec.method);
  const requestFactory = async (index, observe, activeSignal, readOnly = false) => {
    const options = { observe, signal: activeSignal };
    if (!readOnly && index % 10 === 0) {
      const order = receipt.orders[cursor++];
      if (!order) throw new Error("engineering pressure order pool exhausted");
      try {
        const result = await runEngineeringBusinessFlow({ client, order, receipt, observe, signal: activeSignal });
        completed++; return result;
      } catch (error) {
        if (flowFailures.length < 20) flowFailures.push({ orderID: order.id, kind: order.kind, ...pressureFailureDetails(error) });
        return { ok: false, businessFlow: true, errorClass: error.errorClass || "consistency_mismatch" };
      }
    }
    const order = readOrders[index % readOrders.length], product = receipt.products[order.kind];
    const reads = [
      ["orders", { limit: 50, offset: (index * 50) % (Math.ceil(receipt.totalOrders / 50) * 50) },
        (data) => Array.isArray(data.sales_orders) && data.total === receipt.totalOrders &&
          data.sales_orders.every((item) => item.order_no.startsWith(receipt.prefix + "-"))],
      ["order", { id: order.id }, (data) => data.sales_order?.id === order.id &&
        data.sales_order.order_no === order.orderNo && data.sales_order.lifecycle_status === ENGINEERING_STATUS.salesOrderActive],
      ["bom", { id: product.bomId }, (data) => data.bom_version?.id === product.bomId &&
        data.bom_version.status === ENGINEERING_STATUS.bomActive && data.bom_version.items?.length === ENGINEERING_RECIPES[order.kind].parts.length],
      ["preview", { sales_order_id: order.id }, (data) => ["PREVIEW", "SUBMITTED", "BOSS_APPROVED", "APPROVED"].includes(data.status) &&
        checkEngineeringDemand(data, order, receipt)],
      ["purchase", { id: competition.purchaseOrderIDs[0] },
        (data) => data.purchase_order?.id === competition.purchaseOrderIDs[0] && data.purchase_order.lifecycle_status === ENGINEERING_STATUS.purchaseOrderApproved],
    ];
    const [operation, params, validate] = reads[index % reads.length];
    return client.call(operation, params, { ...options, validate });
  };
  try {
    competition = await runEngineeringCompetition({ client, receipt, signal });
    onProgress({ step: "competition", passed: competition.passed });
    for (const level of ENGINEERING_PRESSURE_PROFILES[profile]) {
      stage = level.key;
      onProgress({ step: level.key, status: "started", targetDurationMs: level.durationMs || null });
      const result = await runPressureLevel({ level, limits, signal, expectedMethods, requestFactory });
      levels.push(result); onProgress({ step: level.key, status: "completed", passed: result.acceptance,
        successfulRps: result.successfulRps, businessFlows: result.completedBusinessFlows });
    }
  } catch (error) {
    failure = "execution_failed";
    failureDetail = { stage, ...pressureFailureDetails(error) };
    if (error.pressureLevel) levels.push(error.pressureLevel);
    if (competition && !signal?.aborted && levels.at(-1)?.key !== "recovery") {
      try {
        levels.push(await runPressureLevel({
          level: { key: "recovery", concurrency: 2, requests: 100, pacingMs: 100, cooldownBeforeMs: 2000 },
          limits, signal, expectedMethods: ["sales_order.list_sales_orders", "sales_order.get_sales_order",
            "bom.get_bom_version", "sales_order.get_engineering_material_request", "purchase_order.get_purchase_order"],
          requestFactory: (index, observe, activeSignal) => requestFactory(index, observe, activeSignal, true),
        }));
      } catch (error) { failure = "execution_and_recovery_failed"; failureDetail.recovery = pressureFailureDetails(error); }
    }
  } finally { await Promise.all([stopDatabase(), stopRuntime()]); }
  const databaseSampling = await stopDatabase(), runtimeSampling = await stopRuntime();
  try {
    databaseAfter = await readEngineeringPressureLedger(databaseURL, receipt.orders);
    runtimeAfter = await verifyPressureRuntime({ baseURL, databaseName, commit: expectedCommit, migration: expectedMigration });
  } catch (error) { failure ||= "final_readback_failed"; failureDetail ||= { stage: "final_readback", ...pressureFailureDetails(error) }; }
  const expectedFlows = completed + (competition?.completedBusinessFlows || 0);
  const { consistency, backgroundUnchanged } = checkEngineeringLedger(databaseBefore, databaseAfter, expectedFlows, receipt.orders.length);
  const fingerprintsUnchanged = verificationFingerprint === engineeringVerificationFingerprint() &&
    receipt.dataLogicFingerprint === engineeringDataFingerprint() &&
    loadFingerprint === pressureLogicFingerprint(LOAD_LOGIC_FILES);
  const recovery = levels.at(-1);
  return {
    schemaVersion: "plush-pressure-report/v2", scope: "isolated-engineering-business-pressure", profile,
    startedAt, completedAt: new Date().toISOString(), databaseName, databaseRunIdentity: target.databaseRunIdentity,
    runtimeIdentity: { before: runtimeBefore, after: runtimeAfter }, execution: await readExecutionIdentity(),
    dataLogicFingerprint: receipt.dataLogicFingerprint, verificationFingerprint, loadFingerprint, fingerprintsUnchanged,
    dataset: { version: receipt.datasetVersion, prefix: receipt.prefix, counts: receipt.counts, dataScale: receipt.dataScale, history: receipt.history,
      totalOrders: receipt.totalOrders, complexity: receipt.complexity },
    loadModel: "closed-loop-paced", mix: { businessFlows: 0.1, reads: 0.9 }, limits,
    competition, levels, completedBusinessFlows: completed, competitionBusinessFlows: competition?.completedBusinessFlows || 0,
    flowFailures, database: { before: databaseBefore, after: databaseAfter, sampling: databaseSampling, consistency, backgroundUnchanged },
    runtime: { sampling: runtimeSampling }, recovery: { accepted: recovery?.key === "recovery" && recovery.acceptance === true },
    failure: failure || null, failureDetail: failureDetail || null,
    passed: !failure && fingerprintsUnchanged && competition?.passed === true && consistency && levels.length === 3 &&
      levels.every((level) => level.acceptance) && databaseSampling.sampleErrors === 0 && runtimeSampling.sampleErrors === 0 &&
      databaseSampling.maxDeadlocks === 0 && databaseSampling.maxConflicts === 0 && recovery?.key === "recovery",
    notProven: ["fixed-arrival-rate capacity", "production hardware capacity", "hours-long stability", "customer acceptance"],
  };
}
export function writePressureReport(out, report) {
  mkdirSync(path.dirname(out), { recursive: true });
  const temporary = out + "." + process.pid + ".tmp";
  writeFileSync(temporary, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  renameSync(temporary, out);
}
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2), arg = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : undefined; };
  if (argv.includes("--help") || argv.includes("--plan")) {
    process.stdout.write(JSON.stringify({ usage: "prefer node scripts/qa/pressure-isolated-lifecycle.mjs --run --profile capacity",
      profiles: ENGINEERING_PRESSURE_PROFILES, minimumPool: { quick: engineeringPressurePoolSize("quick"), capacity: engineeringPressurePoolSize("capacity") },
      limits: DEFAULT_PRESSURE_LIMITS, mix: "90% reads / 10% complete flows; 20 same-document competitors" }, null, 2) + "\n");
  } else {
    const out = arg("--out") || "output/qa/pressure/engineering/report.json";
    try {
      if (!argv.includes("--receipt") || process.env.ENGINEERING_PRESSURE_CONFIRM !== "RUN_ISOLATED_ENGINEERING_PRESSURE") throw new Error("receipt and confirmation required");
      const receipt = JSON.parse(readFileSync(arg("--receipt"), "utf8"));
      const report = await runEngineeringPressure({
        baseURL: arg("--base-url"), databaseName: receipt.databaseName, databaseURL: process.env.ENGINEERING_PRESSURE_DATABASE_URL,
        tokens: JSON.parse(process.env.ENGINEERING_PRESSURE_ROLE_TOKENS || "{}"), receipt,
        expectedCommit: arg("--commit"), expectedMigration: arg("--migration"), profile: arg("--profile") || "capacity",
      });
      writePressureReport(out, report); process.stdout.write("engineering-pressure passed=" + report.passed + " report=" + out + "\n");
      if (!report.passed) process.exitCode = 1;
    } catch { writePressureReport(out, { passed: false, failure: "preflight_or_execution_failed" }); process.exitCode = 1; }
  }
}
