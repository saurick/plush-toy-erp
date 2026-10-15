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
import {
  stopOwnedService,
  verifyTransactionRequestLogs,
} from "./transaction-browser-isolated.mjs";

const runID = "transaction_guard";
const databaseName = databaseNameForRun("browser-actions", runID);
const target = {
  runID,
  databaseName,
  databaseURL: `postgres://postgres:test@127.0.0.1:54199/${databaseName}?sslmode=disable`,
  backendURL: "http://127.0.0.1:18139",
  baseURL: "http://127.0.0.1:15201",
};

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
  return {
    flows: TRANSACTION_FLOW_KEYS.map((key) => ({
      key,
      passed: true,
      transportFault: { injected: true, backendCode: 0 },
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
    (report) => {
      report.mobileTasks = [];
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
