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
    postData: JSON.stringify({ id: requestId, method }),
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
    scopeAborted: 0,
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
    scopeAborted: 0,
  });
});

test("browser tracking attaches before network enable and handles both completion and failure", async () => {
  const handlers = new Map();
  const session = {
    on: (name, handler) => handlers.set(name, handler),
    send: async (method, params) => {
      if (["Page.enable", "Runtime.addBinding", "Runtime.enable", "Page.addScriptToEvaluateOnNewDocument"].includes(method)) return;
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
    scopeAborted: 0,
  });
});

test("navigation never supplies a terminal event or a cancellation allowance for writes and unsupported reads", () => {
  const failures = [];
  const tracker = createRPCNetworkTracker({ onFailure: record => failures.push(record.postDataJSON().id) });
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
      postData: JSON.stringify({ id: "wrong-domain", method: "get_workbench" }),
    },
  });
  tracker.navigated({ frame: { id: "main", loaderId: "new" } });
  assert.equal(tracker.pending.size, 4);
  tracker.started(inDocument("late", "get_task_board", "old"));
  tracker.started(inDocument("current", "get_task_board", "new"));
  assert.equal(tracker.pending.size, 6, "loader replacement cannot synthesize a request outcome");
  assert.equal(tracker.counts.navigationAborted, 0);
  tracker.finished({ requestId: "read" });
  assert.equal(tracker.counts.navigationAborted, 0);
  assert.equal(tracker.counts.completed, 1);
  tracker.failed({ requestId: 'write', errorText: 'net::ERR_ABORTED', canceled: true });
  tracker.failed({ requestId: 'wrong-domain', errorText: 'net::ERR_ABORTED', canceled: true });
  assert.deepEqual(failures, ['write', 'wrong-domain']);
  assert.deepEqual(
    [...tracker.pending].map((record) => record.postDataJSON().method).sort(),
    [
      "get_task_board",
      "get_task_board",
      "get_task_board",
    ],
  );
});

const release = (rpcID, type = 'scope-release', extra = {}) => ({
  type, rpcID, domain: 'workflow', method: 'get_task_board', frameId: 'main', loaderId: 'old', bootstrapAt: 1,
  requestState: 'pending', reasonName: 'AbortError', scope: { owner: 'latest-request', cause: 'superseded', generation: 1, nextGeneration: 2 }, ...extra,
});
const startedInOldDocument = id => ({ ...request(id, 'get_task_board', 2), frameId: 'main', loaderId: 'old' });
const aborted = requestId => ({ requestId, errorText: 'net::ERR_ABORTED', canceled: true });

test('proven read cancellation remains a raw failed event and is counted separately from completed business results', () => {
  const failures = [];
  const completions = [];
  const tracker = createRPCNetworkTracker({ onFailure: record => failures.push(record), onComplete: record => completions.push(record) });
  tracker.navigated({ frame: { id: 'main', loaderId: 'old' } });
  tracker.started(startedInOldDocument('scope'));
  tracker.started(startedInOldDocument('navigation'));
  tracker.observedRelease(release('scope'));
  tracker.observedRelease(release('navigation', 'document-release'));
  tracker.navigated({ frame: { id: 'main', loaderId: 'new' } });
  assert.equal(tracker.pending.size, 2);
  tracker.failed(aborted('scope'));
  tracker.failed(aborted('navigation'));
  assert.equal(tracker.counts.failed, 2, 'unclassified cancellation is a failure until evidence is checked');
  tracker.flushCancellations();
  assert.deepEqual(tracker.counts, { started: 2, completed: 0, failed: 0, navigationAborted: 1, scopeAborted: 1 });
  assert.deepEqual(failures, []);
  assert.deepEqual(completions, [], 'no business response may be fabricated for a canceled read');
  assert.deepEqual(tracker.cancellations.map(entry => entry.category), ['scope_superseded', 'document_navigation']);
  assert.ok(tracker.cancellations.every(entry => entry.errorText === 'net::ERR_ABORTED'));
});

test('out-of-order lifecycle messages use request identity and the last known phase; late evidence cannot erase a reported failure', () => {
  const failures = [];
  const tracker = createRPCNetworkTracker({ onFailure: record => failures.push(record.cancellationDecision.reason) });
  tracker.observedRelease(release('old', 'document-release'));
  tracker.observedRelease(release('old', 'document-release', { requestState: 'failed' }));
  tracker.started(startedInOldDocument('old'));
  tracker.navigated({ frame: { id: 'main', loaderId: 'new' } });
  tracker.failed(aborted('old'));
  tracker.flushCancellations();
  assert.deepEqual(failures, ['cancellation_without_lifecycle_evidence']);
  tracker.observedRelease(release('old'));
  tracker.flushCancellations();
  assert.equal(tracker.counts.failed, 1);
  assert.equal(tracker.counts.scopeAborted, 0);
  assert.equal(tracker.unclassifiedCancellations.size, 0);
});

test('native document destruction retires only evidenced reads; late network completion or genuine failure takes precedence', () => {
  for (const late of ['completed', 'failed']) {
    const completions = [], failures = [];
    const tracker = createRPCNetworkTracker({ onComplete: record => completions.push(record), onFailure: record => failures.push(record) });
    tracker.started(startedInOldDocument('read'));
    tracker.started({ ...startedInOldDocument('write'), request: { url: 'http://127.0.0.1/rpc/workflow', postData: JSON.stringify({ id: 'write', method: 'complete_task_action' }) } });
    tracker.observedRelease(release('read', 'document-release'));
    tracker.observedRelease({ type: 'document-destroyed', frameId: 'main', loaderId: 'old', bootstrapAt: 1, source: 'Runtime.executionContextsCleared' });
    tracker.navigated({ frame: { id: 'main', loaderId: 'new' } });
    tracker.flushCancellations();
    assert.equal(tracker.pending.size, 1, 'a write cannot be retired by document destruction');
    assert.equal(tracker.counts.navigationAborted, 1);
    assert.equal(tracker.cancellations[0].errorText, undefined, 'a missing network event must not fabricate ERR_ABORTED');
    if (late === 'completed') tracker.finished({ requestId: 'read' });
    else tracker.failed({ requestId: 'read', errorText: 'net::ERR_CONNECTION_RESET', canceled: false });
    tracker.flushCancellations();
    assert.equal(tracker.counts.navigationAborted, 0);
    assert.equal(tracker.cancellations.length, 0);
    assert.equal(completions.length, late === 'completed' ? 1 : 0);
    assert.equal(failures.length, late === 'failed' ? 1 : 0, 'actual errors after disposal must remain visible');
  }
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
  assert.equal(tracker.history.length, 3, "asset completions cannot displace RPC diagnostics");
  assert.equal(tracker.counts.completed, 1);
  for (let index = 0; index < 600; index++) {
    session.emit("Network.requestWillBeSent", request(`rpc-${index}`, "get_task"));
    session.emit("Network.loadingFinished", { requestId: `rpc-${index}` });
  }
  assert.equal(tracker.history.length, 512);
  assert.equal(tracker.history.at(-1).requestId, "rpc-599");
  assert.equal(tracker.counts.completed, 601);
  assert.equal(tracker.pending.size, 0);
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
