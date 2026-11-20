import { classifyRPCCancellation, classifyDisposedDocumentRead, isAuditedRead, installRPCCancellationProbe } from './transaction-browser-cancellation.mjs';

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

export function createRPCNetworkTracker({ onFailure = () => {}, onComplete = () => {}, onCancellation = () => {} } = {}) {
  const byID = new Map();
  const unclassifiedCancellations = new Map();
  const unmatchedProvenance = [];
  const destroyedDocuments = new Map();
  const frameLoaders = new Map();
  const pending = new Set();
  const cancellations = [];
  const counts = { started: 0, completed: 0, failed: 0, navigationAborted: 0, scopeAborted: 0 };
  const matches = (record, evidence) => {
    const call = record.postDataJSON();
    return record.frameId && record.loaderId && evidence.frameId === record.frameId && evidence.loaderId === record.loaderId &&
      evidence.rpcID === String(call.id ?? '') && evidence.domain === record.domain && evidence.method === call.method &&
      Number.isFinite(evidence.bootstrapAt) && record.timing().startTime >= evidence.bootstrapAt;
  };
  const applyEvidence = (record, evidence) => {
    if (evidence.type === 'scope-release') record.scopeRelease = evidence;
    if (evidence.type === 'document-release') record.documentRelease = evidence;
  };
  const observedRelease = evidence => {
    if (evidence.type === 'document-destroyed') {
      destroyedDocuments.set(`${evidence.frameId}/${evidence.loaderId}`, evidence);
      if (destroyedDocuments.size > 128) destroyedDocuments.delete(destroyedDocuments.keys().next().value);
      for (const record of byID.values()) {
        if (record.frameId === evidence.frameId && record.loaderId === evidence.loaderId) record.documentDestroyed = evidence;
      }
      return;
    }
    const records = [...byID.values(), ...[...unclassifiedCancellations.values()].map(value => value.record)].filter(record => matches(record, evidence));
    if (records.length === 1) applyEvidence(records[0], evidence);
    else {
      unmatchedProvenance.push(evidence);
      if (unmatchedProvenance.length > 512) unmatchedProvenance.shift();
    }
  };
  const terminal = ({ requestId }) => {
    const record = byID.get(requestId);
    if (record) pending.delete(record);
    if (record?.documentRetired) {
      counts.navigationAborted--;
      cancellations.splice(cancellations.indexOf(record.documentRetired), 1);
      delete record.documentRetired;
    }
    byID.delete(requestId);
    return record;
  };
  const started = ({ requestId, request, wallTime, frameId, loaderId }) => {
    terminal({ requestId });
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith("/rpc/")) return;
    const record = {
      requestId,
      domain: pathname.slice("/rpc/".length),
      frameId,
      loaderId,
      documentDestroyed: destroyedDocuments.get(`${frameId}/${loaderId}`),
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
    for (let index = 0; index < unmatchedProvenance.length;) {
      if (matches(record, unmatchedProvenance[index])) applyEvidence(record, unmatchedProvenance.splice(index, 1)[0]);
      else index++;
    }
  };
  const responded = ({ requestId, response }) => {
    const request = byID.get(requestId) || unclassifiedCancellations.get(requestId)?.record;
    if (request) request.response = response;
  };
  const finished = (event) => {
    const request = terminal(event);
    if (!request) return;
    counts.completed++;
    onComplete(request, event);
  };
  const failed = (event) => {
    const record = terminal(event);
    if (!record) return;
    counts.failed++;
    if (isAuditedRead(record) && event.canceled === true && event.errorText === 'net::ERR_ABORTED') {
      unclassifiedCancellations.set(event.requestId, { record, event });
    } else {
      record.cancellationDecision = classifyRPCCancellation(record, event, frameLoaders.get(record.frameId));
      onFailure(record, event);
    }
  };
  const navigated = ({ frame }) => {
    if (!frame.id || !frame.loaderId) return;
    frameLoaders.set(frame.id, frame.loaderId);
  };
  const flushCancellations = () => {
    // Some Chromium document replacements report execution-context destruction without
    // a Network terminal event. Require both per-request release and native destruction;
    // keep its protocol identity so a later success or failure still supersedes this result.
    for (const record of pending) {
      const decision = classifyDisposedDocumentRead(record, frameLoaders.get(record.frameId));
      if (!decision) continue;
      pending.delete(record);
      counts.navigationAborted++;
      const evidence = { requestId: record.requestId, rpcID: String(record.postDataJSON().id), domain: record.domain,
        method: record.postDataJSON().method, frameId: record.frameId, loaderId: record.loaderId,
        responseStatus: record.response?.status, ...decision };
      record.documentRetired = evidence;
      cancellations.push(evidence);
      onCancellation(record, evidence);
    }
    for (const [requestId, { record, event }] of unclassifiedCancellations) {
      unclassifiedCancellations.delete(requestId);
      const decision = classifyRPCCancellation(record, event, frameLoaders.get(record.frameId));
      record.cancellationDecision = decision;
      if (decision.outcome === 'expected_cancel') {
        counts.failed--;
        if (decision.category === 'document_navigation') counts.navigationAborted++;
        else counts.scopeAborted++;
        const evidence = { requestId, rpcID: String(record.postDataJSON().id), domain: record.domain, method: record.postDataJSON().method,
          frameId: record.frameId, loaderId: record.loaderId, responseStatus: record.response?.status,
          errorText: event.errorText, ...decision };
        cancellations.push(evidence);
        onCancellation(record, evidence);
      } else onFailure(record, event);
    }
  };
  return { pending, counts, cancellations, unclassifiedCancellations, started, responded, finished, failed, navigated, observedRelease,
    flushCancellations, getLoaderId: frameId => frameLoaders.get(frameId) };
}

export async function trackBrowserRPCNetwork(context, page, options = {}) {
  const session = await context.newCDPSession(page);
  const tracker = createRPCNetworkTracker({
    ...options,
    onComplete: (request, event) => options.onComplete?.(request, () =>
      session.send("Network.getResponseBody", { requestId: event.requestId })),
  });
  const history = [];
  const rpcRequests = new Set();
  const record = (event, data) => {
    history.push({ event, ...data });
    if (history.length > 512) history.shift();
  };
  session.on("Network.requestWillBeSent", ({ requestId, request, frameId, loaderId }) => {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/rpc/")) return;
    rpcRequests.add(requestId);
    record("started", { requestId, method: JSON.parse(request.postData || "{}").method, frameId, loaderId });
  });
  session.on("Network.responseReceived", ({ requestId, response }) => {
    if (!new URL(response.url).pathname.startsWith("/rpc/")) return;
    record("response", { requestId, status: response.status, serverRequestID: Object.entries(response.headers).find(([key]) => key.toLowerCase() === "x-request-id")?.[1] });
  });
  session.on("Network.loadingFinished", ({ requestId }) => { if (rpcRequests.delete(requestId)) record("finished", { requestId }); });
  session.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => { if (rpcRequests.delete(requestId)) record("failed", { requestId, errorText, canceled }); });
  session.on("Page.frameNavigated", ({ frame }) => record("navigated", { frameId: frame.id, loaderId: frame.loaderId }));
  session.on("Network.requestWillBeSent", tracker.started);
  session.on("Network.responseReceived", tracker.responded);
  session.on("Network.loadingFinished", tracker.finished);
  session.on("Network.loadingFailed", tracker.failed);
  session.on("Page.frameNavigated", tracker.navigated);
  await session.send("Page.enable");
  const verifyCancellationProbe = await installRPCCancellationProbe(session, tracker.getLoaderId, evidence => {
    tracker.observedRelease(evidence);
    record(evidence.type, { rpcID: evidence.rpcID, domain: evidence.domain, method: evidence.method,
      frameId: evidence.frameId, loaderId: evidence.loaderId, requestState: evidence.requestState, scope: evidence.scope, source: evidence.source });
  });
  // Keep completed RPC bodies readable when a document navigation replaces its renderer.
  await session.send("Network.configureDurableMessages", { maxTotalBufferSize: 16 * 1024 * 1024, maxResourceBufferSize: 4 * 1024 * 1024 });
  await session.send("Network.enable");
  return { ...tracker, history, flushCancellations: async () => {
    await verifyCancellationProbe(tracker.counts.started);
    tracker.flushCancellations();
  } };
}
