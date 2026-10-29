import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import {
  assertReceivingEvidence,
  RECEIVING_FLOW_KEYS,
} from "./transaction-arrival-return-quality-browser.mjs";
import { verifyTransactionRequestLogs } from "./transaction-browser-isolated.mjs";
import { PARTIAL_RECEIVING_KEYS } from "./transaction-receiving-partial-browser.mjs";

function complete() {
  return {
    pageErrors: [],
    unexpectedRPC: [],
    browserRPC: [{ method: "admin_login", code: 0 }],
    partialReceiving: PARTIAL_RECEIVING_KEYS.map((key, index) => ({
      key,
      sourceID: 100 + index,
      receiptID: 200 + index,
      payableID: 300 + index,
      passed: true,
      unpricedBlocked: true,
      partialPosted: true,
      rejectedUnposted: true,
      dispositionSettled: true,
      frozenSnapshotPreserved: true,
      priceReplayExact: true,
      forbiddenUnchanged: true,
      changedIntentRejected: true,
      payableVerified: true,
      payableAmount: 10,
      dispositionSurface: 'desktop',
      pricingSurface: 'desktop',
      payableSurface: 'api',
      priceEvents: 1,
      transportFaults: [{ method: 'complete_purchase_order_terms', injected: true, backendCode: 0, requestID: `request-${key}` }],
    })),
    flows: RECEIVING_FLOW_KEYS.map((key, index) => ({
      key,
      sourceID: index + 1,
      passed: true,
      invalidUnchanged: true,
      forbiddenUnchanged: true,
      replayExact: true,
      changedIntentRejected: true,
      responseRecovered: true,
      ledgerVerified: true,
      sourceVerified: true,
      backendInvalidUnchanged: true,
      packages: 2,
      qualityGate: true,
      reversalRestored: true,
      cancelReplayExact: true,
      registrationSurface: "desktop",
      postSurface: "desktop",
      reversalSurface: "desktop",
      completedTaskReadOnly: true,
      correctionPreservesEvidence: true,
      dependentCancelBlocked: true,
      correctionCreatedInBrowser: true,
      correctionReasonRequired: true,
      correctionReplayAfterDecisionExact: true,
      transportFaults: [
        { injected: true, backendCode: 0, requestID: `request-${index}` },
      ],
    })),
  };
}
test("receiving evidence rejects missing flows, weakened business evidence and unsuccessful fault injection", () => {
  assertReceivingEvidence(complete());
  for (const key of [
    "passed",
    "invalidUnchanged",
    "forbiddenUnchanged",
    "replayExact",
    "changedIntentRejected",
    "responseRecovered",
    "ledgerVerified",
    "sourceVerified",
    "backendInvalidUnchanged",
    "qualityGate",
    "reversalRestored",
    "cancelReplayExact",
    "correctionPreservesEvidence",
    "dependentCancelBlocked",
    "correctionCreatedInBrowser",
    "correctionReasonRequired",
    "correctionReplayAfterDecisionExact",
  ]) {
    const report = complete();
    for (const flow of report.flows) flow[key] = false;
    assert.throws(() => assertReceivingEvidence(report), undefined, key);
  }
  for (const corrupt of [
    (r) => r.flows.pop(),
    (r) => r.partialReceiving.pop(),
    (r) => (r.partialReceiving[0].partialPosted = false),
    (r) => (r.partialReceiving[0].frozenSnapshotPreserved = false),
    (r) => (r.partialReceiving[1].payableAmount = 35),
    (r) => (r.partialReceiving[1].priceEvents = 2),
    (r) => (r.partialReceiving[1].payableID = 0),
    (r) => (r.partialReceiving[1].dispositionSurface = 'mobile'),
    (r) => (r.partialReceiving[1].pricingSurface = 'mobile'),
    (r) => (r.partialReceiving[1].payableSurface = 'desktop'),
    (r) => r.flows.reverse(),
    (r) => (r.browserRPC = []),
    (r) => r.pageErrors.push("browser failed"),
    (r) => r.unexpectedRPC.push({ code: 40010 }),
    (r) => (r.flows[0].packages = 1),
    (r) => (r.flows[0].transportFaults = []),
    (r) => (r.flows[0].transportFaults[0].backendCode = 40010),
    (r) => (r.flows[0].transportFaults[0].requestID = ""),
    (r) => (r.flows[0].transportFaults[0].injected = false),
    (r) => (r.flows.find((flow) => flow.key === 'mobile_purchase_return').completedTaskReadOnly = false),
    (r) => (r.flows.find((flow) => flow.key === 'mobile_purchase_return').registrationSurface = 'mobile'),
    (r) => (r.flows.find((flow) => flow.key === 'mobile_purchase_return').postSurface = 'mobile'),
    (r) => (r.flows.find((flow) => flow.key === 'mobile_purchase_return').reversalSurface = 'mobile'),
  ]) {
    const report = complete();
    corrupt(report);
    assert.throws(() => assertReceivingEvidence(report));
  }
});
test("every lost receiving response requires its own successful correlated completion log", () => {
  const transportFaults = ["create", "post"].map((method) => ({
    method,
    requestID: `request-${method}`,
    injected: true,
    backendCode: 0,
  }));
  const browser = {
    browserRPC: [],
    fixtureRPC: [],
    flows: [{ transportFaults }],
  };
  const records = transportFaults.map((fault) =>
    JSON.stringify({
      msg: "request completed",
      request_id: fault.requestID,
      "rpc.method": fault.method,
      code: 0,
      rpc_result_code: 0,
      "trace.id": "a".repeat(32),
      "span.id": "b".repeat(16),
      outcome: "success",
    }),
  );
  assert.equal(
    verifyTransactionRequestLogs(browser, records.join("\n")).matched,
    2,
  );
  assert.throws(
    () => verifyTransactionRequestLogs(browser, records[0]),
    /one completion log/,
  );
  const partial = { ...browser, flows: [], partialReceiving: [{ transportFaults }] };
  assert.equal(verifyTransactionRequestLogs(partial, records.join("\n")).matched, 2);
  assert.throws(() => verifyTransactionRequestLogs(partial, records[0]), /one completion log/);
});
test("receiving CLI refuses ambiguous scopes before creating any resources", () => {
  const runner = new URL("./transaction-browser-isolated.mjs", import.meta.url);
  const invoke = (args) =>
    execFileSync(process.execPath, [runner.pathname, ...args], {
      encoding: "utf8",
      stdio: "pipe",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
    });
  assert.match(invoke(["--help"]), /--receiving/u);
  for (const args of [
    ["--run", "--receiving", "--source-orders"],
    ["--run", "--receiving", "--receiving"],
    ["--run", "--receiving", "--unknown"],
  ])
    assert.throws(
      () => invoke(args),
      (error) =>
        error.status === 1 && /unknown arguments/u.test(String(error.stderr)),
    );
});
