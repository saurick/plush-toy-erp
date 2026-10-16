import {
  RpcDomain,
  RpcMethod,
} from "../../web/src/common/consts/rpcMethods.generated.mjs";

export function consumeExpectedRPCFailure(request, expectedFailures) {
  const { method, params } = request.postDataJSON();
  const injected = expectedFailures.get(method);
  if (
    !(injected?.injected || injected?.injectionStarted) ||
    injected.backendCode !== 0 || injected.failureObserved ||
    JSON.stringify(injected.params) !== JSON.stringify(params)
  ) return false;
  injected.failureObserved = true;
  return true;
}

export function createRPCNetworkTracker({ onFailure = () => {}, onComplete = () => {} } = {}) {
  const byID = new Map();
  const displacedReads = new Map();
  const frameLoaders = new Map();
  const pending = new Set();
  const counts = { started: 0, completed: 0, failed: 0, navigationAborted: 0 };
  const canBeDisplaced = (record) =>
    record.domain === RpcDomain.WORKFLOW &&
    [
      RpcMethod.workflow.GET_WORKBENCH,
      RpcMethod.workflow.GET_TASK_BOARD,
    ].includes(record.postDataJSON().method);
  const displaced = (record) =>
    record.frameId &&
    record.loaderId &&
    frameLoaders.has(record.frameId) &&
    frameLoaders.get(record.frameId) !== record.loaderId;
  const terminal = ({ requestId }) => {
    const record = byID.get(requestId);
    if (record) pending.delete(record);
    byID.delete(requestId);
    return record;
  };
  const displace = (requestId, record) => {
    terminal({ requestId });
    displacedReads.set(requestId, record);
    counts.navigationAborted++;
  };
  const started = ({ requestId, request, wallTime, frameId, loaderId }) => {
    terminal({ requestId });
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith("/rpc/")) return;
    const record = {
      domain: pathname.slice("/rpc/".length),
      frameId,
      loaderId,
      postDataJSON: () => JSON.parse(request.postData || "{}"),
      timing: () => ({
        startTime: wallTime * 1000,
        frameId,
        loaderId,
        currentLoaderId: frameLoaders.get(frameId),
      }),
    };
    byID.set(requestId, record);
    pending.add(record);
    counts.started++;
    if (displaced(record) && canBeDisplaced(record))
      displace(requestId, record);
  };
  const responded = ({ requestId, response }) => {
    const request = byID.get(requestId) || displacedReads.get(requestId);
    if (request) request.response = response;
  };
  const finished = (event) => {
    let request = terminal(event);
    if (!request) {
      request = displacedReads.get(event.requestId);
      if (request) {
        displacedReads.delete(event.requestId);
        counts.navigationAborted--;
      }
    }
    if (!request) return;
    counts.completed++;
    onComplete(request, event);
  };
  const failed = (event) => {
    const record = terminal(event);
    if (!record) {
      displacedReads.delete(event.requestId);
      return;
    }
    counts.failed++;
    onFailure(record, event);
  };
  const navigated = ({ frame }) => {
    if (!frame.id || !frame.loaderId) return;
    frameLoaders.set(frame.id, frame.loaderId);
    for (const [requestId, record] of byID) {
      if (displaced(record) && canBeDisplaced(record))
        displace(requestId, record);
    }
  };
  return { pending, counts, started, responded, finished, failed, navigated };
}

export async function trackBrowserRPCNetwork(context, page, options = {}) {
  const session = await context.newCDPSession(page);
  const tracker = createRPCNetworkTracker({
    ...options,
    onComplete: (request, event) => options.onComplete?.(request, () =>
      session.send("Network.getResponseBody", { requestId: event.requestId })),
  });
  const history = [];
  const record = (event, data) => {
    history.push({ event, ...data });
    if (history.length > 512) history.shift();
  };
  session.on("Network.requestWillBeSent", ({ requestId, request, frameId, loaderId }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/rpc/")) return;
    record("started", { requestId, method: JSON.parse(request.postData || "{}").method, frameId, loaderId });
  });
  session.on("Network.responseReceived", ({ requestId, response }) => {
    if (!new URL(response.url).pathname.startsWith("/rpc/")) return;
    record("response", { requestId, status: response.status, serverRequestID: Object.entries(response.headers).find(([key]) => key.toLowerCase() === "x-request-id")?.[1] });
  });
  session.on("Network.loadingFinished", ({ requestId }) => record("finished", { requestId }));
  session.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => record("failed", { requestId, errorText, canceled }));
  session.on("Page.frameNavigated", ({ frame }) => record("navigated", { frameId: frame.id, loaderId: frame.loaderId }));
  session.on("Network.requestWillBeSent", tracker.started);
  session.on("Network.responseReceived", tracker.responded);
  session.on("Network.loadingFinished", tracker.finished);
  session.on("Network.loadingFailed", tracker.failed);
  session.on("Page.frameNavigated", tracker.navigated);
  await session.send("Page.enable");
  // Keep completed RPC bodies readable when a document navigation replaces its renderer.
  await session.send("Network.configureDurableMessages", { maxTotalBufferSize: 16 * 1024 * 1024, maxResourceBufferSize: 4 * 1024 * 1024 });
  await session.send("Network.enable");
  return { ...tracker, history };
}
