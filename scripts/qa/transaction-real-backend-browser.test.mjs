import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createTransactionClient,
  validateTransactionTarget,
} from "./transaction-real-backend-fixture.mjs";
import {
  assertTransactionBrowserReport,
  TRANSACTION_FLOW_KEYS,
} from "./transaction-real-backend-browser.mjs";
import { databaseNameForRun } from "./database-target.mjs";
import { PRODUCTION_BROWSER_ACTIONS } from "./transaction-production-shipment-browser.mjs";
import { closePage, dropRealResponse, navigate } from "./transaction-browser-ui.mjs";
import {
  FLOW_FIELD_AUDIT_PAGES,
  FLOW_FIELD_AUDIT_TABLES,
} from "./transaction-flow-fields-browser.mjs";
import {
  stopOwnedService,
  ownedServiceIsListening,
  transactionBrowserBudget,
  verifyTransactionRequestLogs,
} from "./transaction-browser-isolated.mjs";

const runID = "transaction_guard";
test('完整任务链和窄范围使用各自有界预算，非法范围在创建资源前拒绝', () => {
  assert.deepEqual(transactionBrowserBudget(), { browserTimeoutMS: 720000, runTimeoutMS: 1500000 });
  for (const scope of [{ sourceOrdersOnly: true }, { receivingOnly: true }, { desktopVariantsOnly: true }]) {
    assert.deepEqual(transactionBrowserBudget(scope), { browserTimeoutMS: 480000, runTimeoutMS: 900000 });
  }
  for (const scope of [{ sourceOrdersOnly: true, receivingOnly: true }, { sourceOrdersOnly: 'true' }, { receivingOnly: 1 }, { desktopVariantsOnly: 1 }, { sourceOrdersOnly: true, desktopVariantsOnly: true }, { receivingOnly: true, desktopVariantsOnly: true }]) assert.throws(() => transactionBrowserBudget(scope));
});
test('隔离入口复用平台端口表，仍只接受本轮实际监听PID', async () => {
  const child = { pid: 123 };
  const native = (pid) => `,state,\nowned.${pid},,\ntcp4 127.0.0.1:15401<->*:*,Listen,\n`;
  const output = (pid) => process.platform === 'darwin' ? native(pid) : `p${pid}\n`;
  const inspect = async (command, args) => {
    if (process.platform === 'darwin') {
      assert.equal(command, 'nettop');
      assert.deepEqual(args, ['-L', '1', '-n', '-m', 'tcp', '-J', 'state']);
    } else {
      assert.equal(command, 'lsof');
      assert.deepEqual(args, ['-nP', '-a', '-iTCP:15401', '-sTCP:LISTEN', '-Fp']);
    }
    return { stdout: output(123) };
  };
  assert.equal(await ownedServiceIsListening(child, 15401, inspect), true);
  if (process.platform === 'darwin') assert.equal(await ownedServiceIsListening(child, 15401, async () => ({ stdout: ',state,\n' })), false);
  await assert.rejects(ownedServiceIsListening(child, 15401, async () => ({ stdout: output(456) })), /exact owned service/u);
  await assert.rejects(ownedServiceIsListening(child, 15401, async () => ({ stdout: 'unrecognized output' })), /无法识别/u);
  await assert.rejects(ownedServiceIsListening(child, 15401, async () => { throw new Error('inspection timeout') }), /inspection timeout/u);
  await assert.rejects(ownedServiceIsListening(child, 0, inspect));
});

const fulfillmentCatalog = JSON.parse(
  await fs.readFile(
    new URL(
      "../../server/internal/biz/workflow_task_catalog.json",
      import.meta.url,
    ),
    "utf8",
  ),
).fulfillment_flow;
const databaseName = databaseNameForRun("browser-actions", runID);
const target = {
  runID,
  databaseName,
  databaseURL: `postgres://postgres:test@127.0.0.1:54199/${databaseName}?sslmode=disable`,
  backendURL: "http://127.0.0.1:18139",
  baseURL: "http://127.0.0.1:15201",
};

test("document navigation and close drain attachment reads started by the mounted view", async (t) => {
  const previousRAF = globalThis.requestAnimationFrame;
  t.after(() => {
    if (previousRAF === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRAF;
  });
  const pending = new Set();
  const responses = new Set();
  const downloads = [];
  let frames = 0;
  let closed = false;
  const counts = { started: 0, completed: 0, failed: 0, navigationAborted: 0, scopeAborted: 0 };
  let classified = 0;
  const page = {
    pendingRPC: pending,
    rpcResponses: responses,
    rpcRecorded: 0,
    rpcNetwork: { counts, unclassifiedCancellations: new Map(), flushCancellations: async () => { classified++; } },
    evaluate: (callback) => callback(),
    async waitForLoadState(state) {
      assert.equal(state, "networkidle");
      for (const download of downloads.splice(0)) {
        pending.delete(download);
        counts.completed++;
        download.complete();
      }
    },
    async goto(url) {
      assert.equal(url, "http://127.0.0.1/next");
      assert.equal(counts.completed, 1, "the old view's deferred attachment must finish before navigation");
      assert.equal(page.rpcRecorded, 1, "its actual business response must be collected before navigation");
      assert.equal(pending.size, 0);
    },
  };
  globalThis.requestAnimationFrame = (callback) => {
    queueMicrotask(() => {
      frames++;
      if (frames % 2 === 0) {
        const download = { method: "download_attachment" };
        const response = new Promise((resolve) => { download.complete = resolve; })
          .then(() => { page.rpcRecorded++; });
        pending.add(download);
        responses.add(response);
        downloads.push(download);
        counts.started++;
      }
      callback(0);
    });
    return frames;
  };
  await navigate(page, "http://127.0.0.1/next");
  assert.equal(page.rpcRecorded, 2, "the new view's deferred read must also finish");
  await closePage(page, {
    async unrouteAll(options) {
      assert.deepEqual(options, { behavior: "wait" });
      assert.equal(page.rpcRecorded, 3);
    },
    async close() { closed = true; },
  });
  assert.equal(closed, true);
  assert.equal(counts.started, 3);
  assert.equal(counts.completed, 3);
  assert.equal(page.rpcRecorded, 3);
  assert.equal(pending.size, 0);
  assert.equal(classified, 6, 'both network drains on each side of navigation and context disposal must classify all canceled requests');
});

test("lost-response removal waits for the real abort and captures only one request", async () => {
  const events = [];
  let handler;
  let completeRecovery;
  let recovered = false;
  const recovery = new Promise((resolve) => { completeRecovery = resolve; })
    .then(() => { recovered = true; });
  const page = {
    expectedRPCFailures: new Map(),
    rpcNetwork: { flushCancellations: async () => {} },
    pendingRPC: new Set(["list_purchase_returns"]),
    rpcResponses: new Set([recovery]),
    evaluate: async () => {},
    waitForLoadState: async state => {
      assert.equal(state, "networkidle");
      assert.ok(events.includes("abort-end"));
      assert.equal(events.includes("unroute"), false, "recovery reads must retain their live route");
      if (page.pendingRPC.size) {
        events.push("recovery");
        page.pendingRPC.clear();
        completeRecovery();
      }
    },
    route: async (_pattern, callback) => {
      handler = callback;
    },
    unrouteAll: async options => {
      assert.deepEqual(options, { behavior: "wait" });
      assert.equal(recovered, true, "the actual recovery response must be collected before route disposal");
      events.push("unroute");
    },
  };
  const fault = await dropRealResponse(
    page,
    target,
    "operational_fact",
    "ship_shipment",
  );
  let finishAbort, notifyAbort;
  const aborting = new Promise((resolve) => {
    notifyAbort = resolve;
  });
  const aborted = new Promise((resolve) => {
    finishAbort = resolve;
  });
  const route = {
    request: () => ({
      url: () => `${target.baseURL}/rpc/operational_fact`,
      postDataJSON: () => ({ method: "ship_shipment", params: { id: 1 } }),
    }),
    fetch: async () => {
      events.push("fetch");
      return {
        json: async () => ({ result: { code: 0 } }),
        headers: () => ({ "x-request-id": "real-success" }),
      };
    },
    abort: async () => {
      events.push("abort-start");
      notifyAbort();
      await aborted;
      events.push("abort-end");
    },
    fallback: async () => events.push("fallback"),
  };
  const handling = handler(route);
  await aborting;
  const removal = fault.remove();
  await handler(route);
  assert.equal(fault.state.injected, false);
  assert.deepEqual(events, ["fetch", "abort-start", "fallback"]);
  finishAbort();
  await Promise.all([handling, removal]);
  assert.deepEqual(events, [
    "fetch",
    "abort-start",
    "fallback",
    "abort-end",
    "recovery",
    "unroute",
  ]);
  assert.equal(fault.state.injected, true);
  assert.equal(fault.state.backendCode, 0);
});

test("an abort failure cannot become successful lost-response evidence", async () => {
  let handler;
  const page = {
    expectedRPCFailures: new Map(),
    route: async (_pattern, callback) => {
      handler = callback;
    },
    unrouteAll: async options => { assert.deepEqual(options, { behavior: "wait" }); },
  };
  const fault = await dropRealResponse(
    page,
    target,
    "operational_fact",
    "ship_shipment",
  );
  await handler({
    request: () => ({
      url: () => `${target.baseURL}/rpc/operational_fact`,
      postDataJSON: () => ({ method: "ship_shipment", params: { id: 1 } }),
    }),
    fetch: async () => ({
      json: async () => ({ result: { code: 0 } }),
      headers: () => ({}),
    }),
    abort: async () => {
      throw new Error("route already handled");
    },
  });
  await assert.rejects(fault.remove(), /route already handled/u);
  assert.equal(fault.state.injected, false);
});

test("owned service cleanup handles a prior signal exit and a service that ignores termination", async (t) => {
  for (const ignoreTermination of [false, true]) {
    const child = spawn(
      process.execPath,
      [
        "-e",
        `${ignoreTermination ? "process.on('SIGTERM', () => {});" : ""}process.stdout.write('ready');setInterval(() => {}, 1000)`,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    t.after(() => {
      if (child.exitCode === null && child.signalCode === null)
        child.kill("SIGKILL");
    });
    await once(child.stdout, "data");
    await stopOwnedService(child, 25);
    assert.equal(child.signalCode, ignoreTermination ? "SIGKILL" : "SIGTERM");
    await stopOwnedService(child, 25);
  }
});

test("transaction writes require the exact disposable database and dedicated loopback origins", async (t) => {
  assert.doesNotThrow(() => validateTransactionTarget(target));
  const invalid = [
    { databaseName: "plush_erp" },
    { runID: "another_run" },
    { databaseURL: target.databaseURL.replace("127.0.0.1", "192.168.0.133") },
    { databaseURL: target.databaseURL.replace(databaseName, "plush_erp") },
    { backendURL: "http://127.0.0.1:8300" },
    { backendURL: "https://example.com" },
    { backendURL: "http://user:secret@127.0.0.1:18139" },
    { backendURL: "http://127.0.0.1:18139/rpc" },
    { baseURL: "http://127.0.0.1:5173" },
    { runID: "abc';select 1" },
  ];
  for (const invalidTarget of invalid) {
    await t.test(JSON.stringify(invalidTarget), () => {
      assert.throws(() =>
        validateTransactionTarget({ ...target, ...invalidTarget }),
      );
    });
  }
});

test("an unverified or mismatched backend cannot receive fixture RPC or database readback", async (t) => {
  const requests = [];
  const server = http.createServer((request, response) => {
    requests.push({ method: request.method, path: request.url });
    response.writeHead(200, { "X-ERP-Runtime-Identity-Proof": "mismatched" });
    response.end("runtime identity matched");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const client = createTransactionClient({
    ...target,
    backendURL: `http://127.0.0.1:${server.address().port}`,
  });
  await assert.rejects(
    client.raw("admin", "auth", "admin_login"),
    /verify runtime identity/u,
  );
  assert.throws(() => client.query("SELECT 1"), /verify runtime identity/u);
  assert.deepEqual(requests, []);
  await assert.rejects(client.verify(), /identity mismatch/u);
  await assert.rejects(
    client.raw("admin", "quality", "pass_quality_inspection"),
    /verify runtime identity/u,
  );
  assert.throws(() => client.query("SELECT 1"), /verify runtime identity/u);
  assert.deepEqual(requests, [
    { method: "GET", path: "/readyz/runtime-identity" },
  ]);
  assert.deepEqual(client.calls, []);
});

function completeReport() {
  const productionFields = {
    productionOrderID: 101,
    receiptID: 201,
    taskSourceMismatchBlocked: true,
    stock: { quantity: 2, net: 2, txns: 1 },
    fulfillment: [
      { stage: "handwork_completed", stock: { quantity: 0, net: 0, txns: 0 } },
      {
        stage: "finished_goods_inbound",
        stock: { quantity: 2, net: 2, txns: 1 },
        readiness: { pendingInspection: 2, pendingPackaging: 0, ready: 0 },
        visibleReadiness: { pendingInspection: 2, pendingPackaging: 0, ready: 0 },
        inventoryRecordID: 301,
      },
      {
        stage: "finished_quality_passed",
        stock: { quantity: 2, net: 2, txns: 1 },
        readiness: { pendingInspection: 0, pendingPackaging: 2, ready: 0 },
        visibleReadiness: { pendingInspection: 0, pendingPackaging: 2, ready: 0 },
        inventoryRecordID: 301,
      },
      {
        stage: "packaging_completed",
        stock: { quantity: 2, net: 2, txns: 1 },
        readiness: { pendingInspection: 0, pendingPackaging: 0, ready: 2 },
        visibleReadiness: { pendingInspection: 0, pendingPackaging: 0, ready: 2 },
        inventoryRecordID: 301,
      },
    ],
    qualityBlockedTransfer: true,
    actions: [
      ...PRODUCTION_BROWSER_ACTIONS.map(([role, operation, action], index) => ({
        role,
        operation,
        action,
        batchID: index + 1,
        confirmed: true,
      })),
      ...["CUT_PIECE", "SHELL", "FINISHED_GOODS", "NEEDLE", "SAMPLING"].map(
        (gate, index) => ({
          role: "quality",
          action: "PASS_QUALITY",
          gate,
          inspectionID: index + 1,
          confirmed: true,
        }),
      ),
    ],
  };
  return {
    requestCancellation: {
      domainDataUnchanged: true,
      cases: [
        ['sales-superseded', [['list_sales_orders', 'scope_superseded'], ['get_sales_order', 'scope_superseded']]],
        ['sales-document-reload', [['list_sales_orders', 'document_navigation']]],
        ['sales-unexplained-abort-retry', undefined, 'list_sales_orders'],
        ['mobile-quality-disposed-390', [['explain_action_access', 'scope_disposed']]],
        ['mobile-quality-unexplained-abort-retry-390', undefined, 'explain_action_access'],
        ['mobile-quality-disposed-320', [['explain_action_access', 'scope_disposed']]],
        ['mobile-quality-unexplained-abort-retry-320', undefined, 'explain_action_access'],
      ].map(([key, expectedCancellations, expectedFailure]) => ({
        key, passed: true, expectedCancellations, expectedFailure, screenshots: ['verified.png'], viewport: { overflow: 0 },
        browserRPC: [{ code: 0, http: 200 }],
        networkPages: [{ cancellations: (expectedCancellations || []).map(([method, category]) => ({ requestId: 'normal', method, category })) }],
        pageErrors: expectedFailure ? [{ method: expectedFailure, message: 'Unexpected RPC transport failure', failure: { requestID: 'failed', errorText: 'net::ERR_ABORTED', canceled: true }, cancellationClassification: 'cancellation_without_lifecycle_evidence' }] : [],
        ...(expectedFailure ? { errorVisible: true, recovered: true } : {}),
      })),
    },
    fieldAudit: {
      tables: FLOW_FIELD_AUDIT_TABLES.length,
      columns: 1284,
      constraints: 1000,
      indexes: 400,
      structure: {
        columns: 1284,
        columnNamesMatched: true,
        postgresTypesMatched: true,
        nullabilityMatched: true,
      },
      stages: fulfillmentCatalog,
      pages: FLOW_FIELD_AUDIT_PAGES.flatMap(({ key, form }) => [
        `${key}-list`,
        ...(form ? [`${key}-form`] : []),
      ]).map((key) => ({
        key,
        headers: ["单号"],
        fields: [{ label: "单号" }],
        screenshot: `${key}.png`,
        metrics: { viewport: { width: 1920, height: 1080, dpr: 2 } },
      })),
    },
    fieldResults: {
      optionalColumnsRestored: true,
      detailsPreserved: true,
      exports: [{ key: "quality" }, { key: "payments" }],
      pages: [
        "quality-populated",
        "quality-all-columns",
        "quality-restored",
        "payments-populated",
        "payments-all-columns",
        "payments-restored",
        "payment-details",
        "inventory-populated",
      ].map((key) => ({ key })),
    },
    flows: TRANSACTION_FLOW_KEYS.map((key) => ({
      key,
      passed: true,
      transportFault: { injected: true, backendCode: 0 },
      ...(key.endsWith("quality") ? { correctionSurface: "real browser", correctionCreatedInBrowser: true, correctionReasonRequired: true, correctionReplayAfterDecisionExact: true, transportFaults: [{ method: "correct_quality_inspection_result", injected: true, backendCode: 0, requestID: `correction-${key}` }] } : {}),
      ...(key.endsWith("production") ? structuredClone(productionFields) : {}),
      ...(key.endsWith("shipment")
        ? {
            productionOrderID: 101,
            shipmentID: 301,
            approvalTaskID: 401,
            approvalSurface: key.startsWith("mobile_") ? "mobile" : "desktop",
            restored: { quantity: 2, net: 2, txns: 3 },
          }
        : {}),
    })),
    browserRPC: [{ method: "create_finance_payment", code: 0, http: 200 }],
    pageErrors: [],
    mobileTasks: Array.from({ length: 16 }, (_, index) => ({
      confirmed: true,
      taskID: index + 1,
      paymentID: Math.floor(index / 2) + 1,
      role: index % 2 === 0 ? "boss" : "finance",
    })),
  };
}

test("real request logs must correlate success, rejection and lost responses without secrets", () => {
  const calls = [
    { method: "pass_quality_inspection", code: 0, requestID: "quality-1" },
    { method: "reverse_finance_payment", code: 40304, requestID: "denied-1" },
  ];
  const fault = {
    method: "execute_finance_payment_post",
    backendCode: 0,
    requestID: "lost-1",
  };
  const report = {
    browserRPC: calls.slice(0, 1),
    fixtureRPC: calls.slice(1),
    flows: [{ transportFault: fault }],
  };
  const logs = [...calls, { ...fault, code: fault.backendCode }].map(
    (call) => ({
      msg: "request completed",
      request_id: call.requestID,
      "rpc.method": call.method,
      code: 0,
      rpc_result_code: call.code,
      "trace.id": "0123456789abcdef0123456789abcdef",
      "span.id": "0123456789abcdef",
      outcome: call.code === 0 ? "success" : "rejected",
    }),
  );
  const serialize = (records) =>
    records.map((record) => JSON.stringify(record)).join("\n");
  assert.equal(
    verifyTransactionRequestLogs(report, serialize(logs)).matched,
    3,
  );
  assert.throws(
    () => verifyTransactionRequestLogs(report, serialize(logs.slice(1))),
    /completion log/u,
  );
  assert.throws(
    () => verifyTransactionRequestLogs(report, serialize([...logs, logs[0]])),
    /completion log/u,
  );
  const wrongClassification = structuredClone(logs);
  wrongClassification[1].outcome = "success";
  assert.throws(() =>
    verifyTransactionRequestLogs(report, serialize(wrongClassification)),
  );
  const wrongRequest = structuredClone(logs);
  wrongRequest[0]["rpc.method"] = "reject_quality_inspection";
  assert.throws(() =>
    verifyTransactionRequestLogs(report, serialize(wrongRequest)),
  );
  assert.throws(
    () =>
      verifyTransactionRequestLogs(
        report,
        serialize(logs) + " secret-password",
        ["secret-password"],
      ),
    /private credential/u,
  );
  assert.throws(() =>
    verifyTransactionRequestLogs(
      report,
      serialize(logs) + " Bearer private-token",
    ),
  );
});

test("partial flows, zero execution, browser errors and failed real writes cannot become a green report", () => {
  assert.doesNotThrow(() => assertTransactionBrowserReport(completeReport()));
  for (const mutate of [
    (report) => { delete report.requestCancellation; },
    (report) => { report.requestCancellation.cases.pop(); },
    (report) => {
      report.fieldAudit.pages.pop();
    },
    (report) => {
      report.fieldAudit.pages[0].metrics.viewport.dpr = 1;
    },
    (report) => {
      report.fieldAudit.stages = [];
    },
    (report) => {
      report.fieldAudit.columns = 0;
    },
    (report) => {
      report.fieldAudit.structure.postgresTypesMatched = false;
    },
    (report) => {
      report.fieldResults.exports = [];
    },
    (report) => {
      report.fieldResults.pages = [];
    },
    (report) => {
      report.fieldResults.optionalColumnsRestored = false;
    },
    (report) => {
      report.mobileTasks = [];
    },
    (report) => { report.flows.find(({ key }) => key === "quality").correctionCreatedInBrowser = false; },
    (report) => { report.flows.find(({ key }) => key === "mobile_quality").correctionReasonRequired = false; },
    (report) => { report.flows.find(({ key }) => key === "quality").transportFaults = []; },
    (report) => { report.flows.find(({ key }) => key === "mobile_quality").correctionReplayAfterDecisionExact = false; },
    (report) => {
      report.flows.find(({ key }) => key === "production").actions.pop();
    },
    (report) => {
      report.flows
        .find(({ key }) => key === "production")
        .fulfillment.reverse();
    },
    (report) => {
      report.flows.find(
        ({ key }) => key === "production",
      ).fulfillment[1].readiness.ready = 2;
    },
    (report) => {
      report.flows.find(({ key }) => key === 'mobile_production').fulfillment[1].visibleReadiness.ready = 2;
    },
    (report) => {
      delete report.flows.find(({ key }) => key === 'mobile_production').fulfillment[2].inventoryRecordID;
    },
    (report) => {
      report.flows.find(
        ({ key }) => key === "production",
      ).fulfillment[2].stock.txns = 2;
    },
    (report) => {
      report.flows.find(
        ({ key }) => key === "mobile_production",
      ).qualityBlockedTransfer = false;
    },
    (report) => {
      report.flows.find(
        ({ key }) => key === "mobile_production",
      ).actions[0].role = "admin";
    },
    (report) => {
      const actions = report.flows.find(
        ({ key }) => key === "production",
      ).actions;
      actions.at(-1).inspectionID = actions.at(-2).inspectionID;
    },
    (report) => {
      report.flows.find(({ key }) => key === "shipment").restored.txns = 4;
    },
    (report) => {
      report.flows.find(
        ({ key }) => key === "mobile_shipment",
      ).approvalSurface = "desktop";
    },
    (report) => {
      report.mobileTasks[0].confirmed = false;
    },
    (report) => {
      report.mobileTasks[0] = report.mobileTasks[1];
    },
    (report) => {
      report.mobileTasks[0].role = "sales";
    },
    (report) => {
      report.mobileTasks[0].paymentID = report.mobileTasks[2].paymentID;
    },
    (report) => report.flows.pop(),
    (report) => {
      report.flows[0].passed = false;
    },
    (report) => {
      report.browserRPC = [];
    },
    (report) => report.pageErrors.push({ message: "render failed" }),
    (report) => {
      report.browserRPC[0].code = 40304;
    },
    (report) => {
      report.browserRPC[0].http = 500;
    },
    (report) => {
      report.flows[1].transportFault.injected = false;
    },
    (report) => {
      report.flows[2].transportFault.backendCode = 40922;
    },
  ]) {
    const report = completeReport();
    mutate(report);
    assert.throws(() => assertTransactionBrowserReport(report));
  }
});

test("the isolated CLI executes through a symbolic link without starting any resources for help", async (t) => {
  const directory = await fs.mkdtemp(
    path.join(os.tmpdir(), "transaction-cli-guard-"),
  );
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const entry = path.join(directory, "entry.mjs");
  await fs.symlink(
    path.join(import.meta.dirname, "transaction-browser-isolated.mjs"),
    entry,
  );
  const output = execFileSync(process.execPath, [entry, "--help"], {
    encoding: "utf8",
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  });
  assert.match(
    output,
    /Usage: node scripts\/qa\/transaction-browser-isolated.mjs --run/u,
  );
  assert.doesNotMatch(output, /source-snapshot|owned-postgres-storage/u);
});
