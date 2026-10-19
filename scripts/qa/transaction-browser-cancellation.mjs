import { RpcDomain, RpcMethod } from '../../web/src/common/consts/rpcMethods.generated.mjs';
import { getRequestScopeCancellation, RequestScopeOwner, RequestScopeCancellationCause } from '../../web/src/common/utils/requestScopeCancellation.mjs';

// Each pair is an audited query, not a method-name convention or a write exemption.
const readOwners = new Map([
  [`${RpcDomain.OPERATIONAL_FACT}/${RpcMethod.operational_fact.GET_PRODUCTION_EXCEPTION}`, RequestScopeOwner.LATEST_REQUEST],
  [`${RpcDomain.WORKFLOW}/${RpcMethod.workflow.GET_WORKBENCH}`, RequestScopeOwner.LATEST_REQUEST],
  [`${RpcDomain.WORKFLOW}/${RpcMethod.workflow.GET_TASK_BOARD}`, RequestScopeOwner.LATEST_REQUEST],
  [`${RpcDomain.WORKFLOW}/${RpcMethod.workflow.EXPLAIN_ACTION_ACCESS}`, RequestScopeOwner.WORKFLOW_ACTION_ACCESS],
  [`${RpcDomain.SALES_ORDER}/${RpcMethod.sales_order.LIST_SALES_ORDERS}`, RequestScopeOwner.LATEST_REQUEST],
  [`${RpcDomain.SALES_ORDER}/${RpcMethod.sales_order.GET_SALES_ORDER}`, RequestScopeOwner.LATEST_REQUEST],
  [`${RpcDomain.OUTSOURCING_ORDER}/${RpcMethod.outsourcing_order.LIST_OUTSOURCING_ORDER_ITEMS}`, RequestScopeOwner.OUTSOURCING_TASK_ITEMS],
]);

export function isAuditedRead(record) {
  return readOwners.has(`${record.domain}/${record.postDataJSON().method}`);
}

function belongsToRequest(record, evidence) {
  const call = record.postDataJSON();
  return evidence && record.frameId && record.loaderId && String(call.id ?? '') !== '' &&
    evidence.frameId === record.frameId && evidence.loaderId === record.loaderId &&
    evidence.rpcID === String(call.id) && evidence.domain === record.domain && evidence.method === call.method &&
    Number.isFinite(evidence.bootstrapAt) && record.timing().startTime >= evidence.bootstrapAt;
}

export function classifyDisposedDocumentRead(record, currentLoaderId) {
  if (!isAuditedRead(record) || (record.response && (!Number.isFinite(record.response.status) || record.response.status < 200 || record.response.status >= 300))) return null;
  const release = record.documentRelease;
  const destroyed = record.documentDestroyed;
  if (!belongsToRequest(record, release) || !['pending', 'headers'].includes(release.requestState)) return null;
  if (!destroyed || destroyed.frameId !== record.frameId || destroyed.loaderId !== record.loaderId ||
    destroyed.bootstrapAt !== release.bootstrapAt || !['Runtime.executionContextDestroyed', 'Runtime.executionContextsCleared'].includes(destroyed.source)) return null;
  if (!currentLoaderId || currentLoaderId === record.loaderId) return null;
  return { outcome: 'expected_cancel', category: 'document_navigation', terminalEvidence: destroyed.source,
    fromLoaderId: record.loaderId, toLoaderId: currentLoaderId };
}

export function classifyRPCCancellation(record, event, currentLoaderId) {
  const failure = reason => ({ outcome: 'failure', reason });
  if (!isAuditedRead(record)) return failure('write_or_unaudited_rpc');
  if (event.canceled !== true || event.errorText !== 'net::ERR_ABORTED') return failure('transport_failure');
  if (record.response && (!Number.isFinite(record.response.status) || record.response.status < 200 || record.response.status >= 300)) return failure('http_failure');
  const active = evidence => ['pending', 'headers'].includes(evidence.requestState);
  if (belongsToRequest(record, record.documentRelease) && active(record.documentRelease) && currentLoaderId && currentLoaderId !== record.loaderId) {
    return { outcome: 'expected_cancel', category: 'document_navigation', terminalEvidence: 'Network.loadingFailed', fromLoaderId: record.loaderId, toLoaderId: currentLoaderId };
  }
  if (belongsToRequest(record, record.scopeRelease)) {
    if (!active(record.scopeRelease)) return failure('request_failed_or_completed_before_scope_release');
    const scope = getRequestScopeCancellation({ name: record.scopeRelease.reasonName, requestScopeCancellation: record.scopeRelease.scope });
    if (scope && scope.owner === readOwners.get(`${record.domain}/${record.postDataJSON().method}`)) {
      return { outcome: 'expected_cancel', category: `scope_${scope.cause}`, terminalEvidence: 'Network.loadingFailed', ...scope };
    }
    return failure('unrecognized_scope_release');
  }
  return failure('cancellation_without_lifecycle_evidence');
}

let probeSequence = 0;

function observeRequestLifetimes(bindingName, owners, causes) {
  const stateKey = `${bindingName}_state`;
  const diagnostics = { ready: true, bindingErrors: 0 };
  window[stateKey] = diagnostics;
  const send = entry => {
    try { window[bindingName](JSON.stringify(entry)); }
    catch { diagnostics.bindingErrors++; }
  };
  send({ type: 'bootstrap', bootstrapAt: performance.timeOrigin + performance.now() });
  const active = new Set();
  const previouslyReleased = new Set();
  const responses = new WeakMap();
  const originalFetch = window.fetch;
  const originalJSON = Response.prototype.json;
  const finish = (request, phase) => { request.phase = phase; active.delete(request); };
  Response.prototype.json = function (...args) {
    const result = originalJSON.apply(this, args);
    const request = responses.get(this);
    if (request) result.then(() => finish(request, 'completed'), () => finish(request, 'failed'));
    return result;
  };
  window.fetch = function (...args) {
    const [input, init] = args;
    let request;
    try {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname.startsWith('/rpc/') && typeof init?.body === 'string' && init.body.length <= 16384) {
        const call = JSON.parse(init.body);
        if (typeof call.method === 'string' && ['string', 'number'].includes(typeof call.id)) {
          request = { rpcID: String(call.id), domain: url.pathname.slice(5), method: call.method, phase: 'pending' };
        }
      }
    } catch { /* Other fetch input formats keep native behavior. */ }
    if (!request) return originalFetch.apply(this, args);
    active.add(request);
    const signal = init?.signal;
    if (signal instanceof AbortSignal) {
      const observeAbort = () => {
        const reason = signal.reason;
        const value = reason?.requestScopeCancellation;
        const keys = ['owner', 'cause', 'generation', 'nextGeneration'];
        const safe = value && Object.keys(value).every(key => keys.includes(key)) &&
          owners.includes(value.owner) && causes.includes(value.cause) && Number.isSafeInteger(value.generation) &&
          (value.nextGeneration === undefined || Number.isSafeInteger(value.nextGeneration));
        send({ type: 'scope-release', rpcID: request.rpcID, domain: request.domain, method: request.method, requestState: request.phase,
          reasonName: ['AbortError', 'TimeoutError'].includes(reason?.name) ? reason.name : 'Unknown',
          scope: safe ? { owner: value.owner, cause: value.cause, generation: value.generation, ...(value.nextGeneration === undefined ? {} : { nextGeneration: value.nextGeneration }) } : null });
      };
      if (signal.aborted) observeAbort();
      else signal.addEventListener('abort', observeAbort, { once: true });
    }
    let result;
    try { result = originalFetch.apply(this, args); }
    catch (error) { finish(request, 'failed'); throw error; }
    result.then(response => { request.phase = 'headers'; responses.set(response, request); }, () => finish(request, 'failed'));
    return result;
  };
  addEventListener('beforeunload', () => {
    for (const request of active) previouslyReleased.add(request);
    for (const request of previouslyReleased) send({ type: 'document-release', rpcID: request.rpcID, domain: request.domain, method: request.method, requestState: request.phase });
  });
}

export async function installRPCCancellationProbe(session, getLoaderId, observe) {
  const bindingName = `__erpRPCCancellation${++probeSequence}`;
  const contexts = new Map();
  let invalidMessages = 0;
  session.on('Runtime.executionContextCreated', ({ context }) => {
    if (context.auxData?.isDefault && context.auxData.frameId) contexts.set(context.id, {
      frameId: context.auxData.frameId, loaderId: getLoaderId(context.auxData.frameId), bootstrapAt: undefined,
    });
  });
  const destroyed = (id, source) => {
    const context = contexts.get(id);
    if (Number.isFinite(context?.bootstrapAt)) observe({ type: 'document-destroyed', ...context, source });
    contexts.delete(id);
  };
  session.on('Runtime.executionContextDestroyed', ({ executionContextId }) => destroyed(executionContextId, 'Runtime.executionContextDestroyed'));
  session.on('Runtime.executionContextsCleared', () => {
    for (const id of contexts.keys()) destroyed(id, 'Runtime.executionContextsCleared');
  });
  session.on('Runtime.bindingCalled', event => {
    if (event.name !== bindingName) return;
    const context = contexts.get(event.executionContextId);
    if (!context) { invalidMessages++; return; }
    try {
      const entry = JSON.parse(event.payload);
      if (entry?.type === 'bootstrap' && Number.isFinite(entry.bootstrapAt)) { context.bootstrapAt = entry.bootstrapAt; return; }
      if (['scope-release', 'document-release'].includes(entry?.type)) observe({ ...entry, ...context });
      else invalidMessages++;
    } catch { invalidMessages++; }
  });
  await session.send('Runtime.addBinding', { name: bindingName });
  await session.send('Runtime.enable');
  await session.send('Page.addScriptToEvaluateOnNewDocument', { source: `(${observeRequestLifetimes.toString()})(${JSON.stringify(bindingName)},${JSON.stringify(Object.values(RequestScopeOwner))},${JSON.stringify(Object.values(RequestScopeCancellationCause))})` });
  return async started => {
    const { result, exceptionDetails } = await session.send('Runtime.evaluate', {
      expression: `JSON.stringify(window[${JSON.stringify(`${bindingName}_state`)}] || null)`, returnByValue: true,
    });
    if (exceptionDetails) throw new Error('RPC cancellation probe state could not be read');
    const state = JSON.parse(result?.value ?? 'null');
    if (invalidMessages || (!state && started > 0) || (state && (!state.ready || state.bindingErrors !== 0))) throw new Error('RPC cancellation provenance is incomplete');
  };
}
