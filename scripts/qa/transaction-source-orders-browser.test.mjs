import assert from "node:assert/strict";
import test from "node:test";
import { assertSourceOrderEvidence, SOURCE_ORDER_FLOW_KEYS } from "./transaction-source-orders-browser.mjs";
import { RpcErrorCode as CODE } from "../../web/src/common/consts/errorCodes.generated.js";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { runIsolatedTransactionBrowser, verifyTransactionRequestLogs } from "./transaction-browser-isolated.mjs";

function completed() {
  const flows = SOURCE_ORDER_FLOW_KEYS.map((key, index) => ({
    key, sourceID: index + 1,
    passed: true, draftCAS: true, conflictMessageShownOnce: true, forbiddenUnchanged: true, invalidQuantityUnchanged: true,
    saveRecovered: true, saveKeptBusinessValues: true, submitRecovered: true, replayExact: true, changedIntentRejected: true,
    factsUnchanged: true, frozenAfterSubmit: true, terminalGuard: true, blockResume: true,
    rejectionSettled: true, approvalPermissionDenied: true, reasonRequired: true,
    incompleteCloseBlocked: true, confirmed: true,
    saveFault: { injected: true, backendCode: 0, requestID: `save-${index}` },
    submitFault: { injected: true, backendCode: 0, requestID: `submit-${index}` },
  }));
  const expectedFailures = flows.map((flow, index) => ({ actor: `actor-${index}`, method: `save-${index}`, browser: true, code: CODE.RESOURCE_VERSION_CONFLICT }));
  const browserRPC = expectedFailures.map(entry => ({ role: entry.actor, method: entry.method, code: entry.code, http: 200 }));
  const engineering = ["desktop", "mobile"].map(surface => ({ surface, passed: true, staleSourceRejected: true, permissionDenied: true, rejectReasonRequired: true, rejectedResubmitted: true, approvalOrdered: true, financeRecovered: true, replayExact: true, changedReviewRejected: true, purchaseSourceVerified: true, factsUnchanged: true, purchaseOrders: 1, financeFault: { injected: true, backendCode: 0, requestID: `finance-${surface}` } }));
  const tables = ["inventory_txns", "inventory_balances", "inventory_lots", "inventory_operations", "inventory_operation_items", "stock_reservations", "purchase_receipts", "purchase_receipt_items", "purchase_returns", "purchase_return_items", "purchase_receipt_adjustments", "purchase_receipt_adjustment_items", "outsourcing_facts", "quality_inspections", "finance_facts", "finance_payments", "finance_allocations", "finance_credit_notes", "production_facts", "production_wip_batches", "production_wip_events", "production_order_operations", "production_packaging_confirmations", "shipments", "shipment_items"];
  const factsBefore = Object.fromEntries(tables.map(table => [table, "frozen"]));
  return { flows, engineering, pageErrors: [], expectedFailures, browserRPC, unexpectedRPC: [], factsBefore, factsAfter: structuredClone(factsBefore) };
}

test("source-order evidence requires all six real permission, recovery and lifecycle paths", () => {
  assertSourceOrderEvidence(completed());
  for (const flow of completed().flows) {
    for (const field of Object.keys(flow).filter(key => typeof flow[key] === "boolean")) {
      if (flow.key.endsWith("outsourcing") && ["blockResume", "rejectionSettled", "approvalPermissionDenied", "reasonRequired"].includes(field)) continue;
      if (!flow.key.endsWith("outsourcing") && ["incompleteCloseBlocked", "confirmed"].includes(field)) continue;
      const report = completed();
      report.flows.find(entry => entry.key === flow.key)[field] = false;
      assert.throws(() => assertSourceOrderEvidence(report), /true/);
    }
  }
});

test("a missed backend fault, unexpected rejection or duplicate failure cannot be a pass", () => {
  for (const mutate of [
    report => report.flows.pop(),
    report => { report.flows[0].sourceID = 0; },
    report => { report.flows[0].saveFault.backendCode = CODE.INVALID_PARAM; },
    report => { report.flows[0].submitFault.injected = false; },
    report => { report.flows[0].saveFault.requestID = ""; },
    report => report.pageErrors.push({ message: "unhandled error" }),
    report => report.unexpectedRPC.push({ code: CODE.PERMISSION_DENIED }),
    report => report.expectedFailures.pop(),
    report => report.browserRPC.push({ ...report.browserRPC[0] }),
    report => { report.browserRPC = []; },
    report => { delete report.factsBefore.inventory_txns; },
    report => { report.factsAfter.inventory_balances = "changed"; },
    report => report.engineering.pop(),
    report => { report.engineering[0].rejectedResubmitted = false; },
    report => { report.engineering[1].purchaseOrders = 2; },
    report => { report.engineering[1].financeFault.backendCode = CODE.INVALID_PARAM; },
  ]) {
    const report = completed();
    mutate(report);
    assert.throws(() => assertSourceOrderEvidence(report));
  }
});

test("source-only scope rejects non-booleans and ambiguous CLI switches before creating resources", async () => {
  await assert.rejects(runIsolatedTransactionBrowser({ sourceOrdersOnly: "false" }), /boolean/);
  const entry = fileURLToPath(new URL("./transaction-browser-isolated.mjs", import.meta.url));
  for (const args of [["--run", "--source-orders", "--source-orders"], ["--run", "--source-orders", "--skip-postgres"], ["--source-orders"]]) {
    assert.throws(() => execFileSync(process.execPath, [entry, ...args], { stdio: "pipe", env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" } }), error => error.status === 1 && /unknown arguments/.test(String(error.stderr)));
  }
});

test("lost source-save, submission and finance responses require their own correlated completion logs", () => {
  const faults = ["save", "submit", "finance"].map(method => ({ method, backendCode: 0, requestID: `${method}-request` }));
  const report = { browserRPC: [], fixtureRPC: [], flows: [{ saveFault: faults[0], submitFault: faults[1] }], engineering: [{ financeFault: faults[2] }] };
  const records = faults.map(fault => ({ msg: "request completed", request_id: fault.requestID, "rpc.method": fault.method, code: 0, rpc_result_code: 0, "trace.id": "a".repeat(32), "span.id": "b".repeat(16), outcome: "success" }));
  const logs = entries => entries.map(entry => JSON.stringify(entry)).join("\n");
  assert.equal(verifyTransactionRequestLogs(report, logs(records)).matched, 3);
  for (const fault of faults) {
    assert.throws(() => verifyTransactionRequestLogs(report, logs(records.filter(record => record.request_id !== fault.requestID))), /one completion log/);
  }
  assert.throws(() => verifyTransactionRequestLogs(report, logs(records.map(record => ({ ...record, outcome: "rejected" })))), /success/);
});
