import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import {
  createRPCNetworkTracker,
  consumeExpectedRPCFailure,
  trackBrowserRPCNetwork,
} from "./transaction-browser-network.mjs";

const request = (requestId, method, wallTime = 0) => ({
  requestId,
  wallTime,
  request: {
    url: "http://127.0.0.1:15201/rpc/workflow",
    postData: JSON.stringify({ method }),
  },
});

test("one successful injected request permits exactly one matching transport failure", () => {
  const state = { injectionStarted: true, backendCode: 0, params: { id: 7, expected_version: 2 } };
  const expected = new Map([["save", state]]);
  const call = (method, params) => ({ postDataJSON: () => ({ method, params }) });
  assert.equal(consumeExpectedRPCFailure(call("other", state.params), expected), false);
  assert.equal(consumeExpectedRPCFailure(call("save", { id: 8, expected_version: 2 }), expected), false);
  state.backendCode = 40010;
  assert.equal(consumeExpectedRPCFailure(call("save", state.params), expected), false);
  state.backendCode = 0;
  assert.equal(consumeExpectedRPCFailure(call("save", state.params), expected), true);
  assert.equal(consumeExpectedRPCFailure(call("save", state.params), expected), false, "a later unplanned failure cannot reuse an old injection allowance");
});

test("actual RPCs stay pending until their own protocol terminal event, including zero-time requests", () => {
  const tracker = createRPCNetworkTracker();
  tracker.started(request("read", "get_workbench"));
  tracker.started(request("write", "complete_task_action", 100));
  assert.equal(tracker.pending.size, 2);
  tracker.finished({ requestId: "unrelated" });
  assert.equal(tracker.pending.size, 2);
  tracker.finished({ requestId: "read" });
  assert.equal(tracker.pending.size, 1);
  assert.equal(
    [...tracker.pending][0].postDataJSON().method,
    "complete_task_action",
  );
  tracker.finished({ requestId: "write" });
  assert.equal(tracker.pending.size, 0);
  assert.deepEqual(tracker.counts, {
    started: 2,
    completed: 2,
    failed: 0,
    navigationAborted: 0,
  });
});

test("non-RPC resources cannot create or complete a business request", () => {
  const tracker = createRPCNetworkTracker();
  tracker.started(request("business", "get_task_board"));
  tracker.started({
    requestId: "asset",
    wallTime: 1,
    request: { url: "http://127.0.0.1:15201/image.png" },
  });
  tracker.finished({ requestId: "asset" });
  assert.equal(tracker.pending.size, 1);
  tracker.finished({ requestId: "business" });
  tracker.finished({ requestId: "business" });
  assert.equal(tracker.pending.size, 0);
  assert.deepEqual(tracker.counts, {
    started: 1,
    completed: 1,
    failed: 0,
    navigationAborted: 0,
  });
});

test("browser tracking attaches before network enable and handles both completion and failure", async () => {
  const handlers = new Map();
  const session = {
    on: (name, handler) => handlers.set(name, handler),
    send: async (method, params) => {
      if (method === "Page.enable") return;
      if (method === "Network.configureDurableMessages") {
        assert.deepEqual(params, { maxTotalBufferSize: 16 * 1024 * 1024, maxResourceBufferSize: 4 * 1024 * 1024 });
        return;
      }
      assert.equal(method, "Network.enable");
      handlers.get("Network.requestWillBeSent")(
        request("first", "get_workbench"),
      );
    },
  };
  const page = {};
  const failures = [];
  const { pending, counts } = await trackBrowserRPCNetwork(
    {
      newCDPSession: async (target) => {
        assert.equal(target, page);
        return session;
      },
    },
    page,
    {
      onFailure: (record, event) =>
        failures.push({
          method: record.postDataJSON().method,
          error: event.errorText,
        }),
    },
  );
  assert.equal(pending.size, 1);
  handlers.get("Network.loadingFailed")({
    requestId: "first",
    errorText: "net::ERR_FAILED",
  });
  assert.equal(pending.size, 0);
  assert.deepEqual(failures, [
    { method: "get_workbench", error: "net::ERR_FAILED" },
  ]);
  handlers.get("Network.requestWillBeSent")(request("next", "get_task_board"));
  assert.equal(pending.size, 1);
  handlers.get("Network.loadingFinished")({ requestId: "next" });
  assert.equal(pending.size, 0);
  assert.deepEqual(counts, {
    started: 2,
    completed: 1,
    failed: 1,
    navigationAborted: 0,
  });
});

test("document navigation terminates only displaced startup reads and retains unfinished writes and current reads", () => {
  const tracker = createRPCNetworkTracker();
  const inDocument = (id, method, loaderId) => ({
    ...request(id, method),
    frameId: "main",
    loaderId,
  });
  tracker.navigated({ frame: { id: "main", loaderId: "old" } });
  tracker.started(inDocument("read", "get_workbench", "old"));
  tracker.started(inDocument("write", "create_finance_payment", "old"));
  tracker.started({
    ...inDocument("iframe", "get_task_board", "old"),
    frameId: "other",
  });
  tracker.started({
    ...inDocument("wrong-domain", "get_workbench", "old"),
    request: {
      url: "http://127.0.0.1:15201/rpc/operational_fact",
      postData: JSON.stringify({ method: "get_workbench" }),
    },
  });
  tracker.navigated({ frame: { id: "main", loaderId: "new" } });
  assert.equal(tracker.pending.size, 3);
  tracker.started(inDocument("late", "get_task_board", "old"));
  tracker.started(inDocument("current", "get_task_board", "new"));
  assert.equal(tracker.pending.size, 4);
  assert.equal(tracker.counts.navigationAborted, 2);
  tracker.finished({ requestId: "read" });
  assert.equal(tracker.counts.navigationAborted, 1);
  assert.equal(tracker.counts.completed, 1);
  assert.deepEqual(
    [...tracker.pending].map((record) => record.postDataJSON().method).sort(),
    [
      "create_finance_payment",
      "get_task_board",
      "get_task_board",
      "get_workbench",
    ],
  );
});

test("network diagnostics retain bounded request identities without RPC bodies, tokens or attachment contents", async () => {
  const session = new EventEmitter();
  session.send = async () => {};
  const tracker = await trackBrowserRPCNetwork({ newCDPSession: async () => session }, {});
  session.emit("Network.requestWillBeSent", { ...request("image", "download_attachment"), request: { url: "http://127.0.0.1/rpc/attachment", postData: JSON.stringify({ method: "download_attachment", params: { content_base64: "private-image-data" } }) } });
  session.emit("Network.responseReceived", { requestId: "image", response: { url: "http://127.0.0.1/rpc/attachment", status: 200, headers: { "X-Request-ID": "image-result", Authorization: "Bearer private-token" } } });
  session.emit("Network.loadingFinished", { requestId: "image" });
  assert.equal(tracker.pending.size, 0);
  assert.equal(tracker.history.find(entry => entry.event === "response").serverRequestID, "image-result");
  assert.doesNotMatch(JSON.stringify(tracker.history), /private-image-data|private-token|Authorization|content_base64/);
  for (let index = 0; index < 600; index++) session.emit("Network.loadingFinished", { requestId: `asset-${index}` });
  assert.equal(tracker.history.length, 512);
  assert.equal(tracker.history.at(-1).requestId, "asset-599");
  assert.equal(tracker.counts.completed, 1);
});

test("completed browser bodies use the same protocol request identity and cannot be substituted by headers, duplicate events or failures", async () => {
  const session = new EventEmitter();
  const bodyReads = [];
  session.send = async (method, params) => {
    if (method !== "Network.getResponseBody") return;
    bodyReads.push(params.requestId);
    assert.equal(params.requestId, "completed");
    return { body: JSON.stringify({ result: { code: 40304 } }), base64Encoded: false };
  };
  const completed = [];
  const pending = [];
  const tracker = await trackBrowserRPCNetwork({ newCDPSession: async () => session }, {}, {
    onComplete(record, readBody) {
      pending.push((async () => completed.push({ method: record.postDataJSON().method, status: record.response.status, body: await readBody() }))());
    },
  });
  session.emit("Network.requestWillBeSent", request("completed", "save_sales_order_with_items"));
  session.emit("Network.responseReceived", { requestId: "completed", response: { url: "http://127.0.0.1/rpc/workflow", status: 200, headers: { "X-Request-ID": "server-result" } } });
  assert.deepEqual(bodyReads, [], "response headers alone do not prove a completed response");
  assert.equal(tracker.pending.size, 1);
  session.emit("Network.loadingFinished", { requestId: "completed" });
  session.emit("Network.loadingFinished", { requestId: "completed" });
  session.emit("Network.loadingFinished", { requestId: "unrelated" });
  session.emit("Network.requestWillBeSent", request("failed", "complete_task_action"));
  session.emit("Network.loadingFailed", { requestId: "failed", errorText: "net::ERR_FAILED" });
  await Promise.all(pending);
  assert.deepEqual(bodyReads, ["completed"]);
  assert.deepEqual(completed, [{ method: "save_sales_order_with_items", status: 200, body: { body: JSON.stringify({ result: { code: 40304 } }), base64Encoded: false } }]);
  assert.equal(tracker.pending.size, 0);
  assert.equal(tracker.counts.completed, 1);
  assert.equal(tracker.counts.failed, 1);
});
