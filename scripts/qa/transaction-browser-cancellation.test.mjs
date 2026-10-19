import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { classifyRPCCancellation, classifyDisposedDocumentRead, installRPCCancellationProbe } from './transaction-browser-cancellation.mjs';

function sample() {
  const evidence = {
    type: 'scope-release', rpcID: 'rpc-1', domain: 'sales_order', method: 'list_sales_orders',
    frameId: 'main', loaderId: 'old', bootstrapAt: 1000, requestState: 'pending', reasonName: 'AbortError',
    scope: { owner: 'latest-request', cause: 'superseded', generation: 2, nextGeneration: 3 },
  };
  return {
    record: { domain: 'sales_order', frameId: 'main', loaderId: 'old',
      postDataJSON: () => ({ id: 'rpc-1', method: 'list_sales_orders' }), timing: () => ({ startTime: 2000 }), scopeRelease: evidence },
    event: { canceled: true, errorText: 'net::ERR_ABORTED' },
  };
}

test('only a matched, active, explicitly released read scope or departed document explains ERR_ABORTED', () => {
  const { record, event } = sample();
  assert.deepEqual(classifyRPCCancellation(record, event, 'old'), {
    outcome: 'expected_cancel', category: 'scope_superseded', terminalEvidence: 'Network.loadingFailed', owner: 'latest-request', cause: 'superseded', generation: 2, nextGeneration: 3,
  });
  record.scopeRelease.scope = { owner: 'latest-request', cause: 'disposed', generation: 2 };
  assert.equal(classifyRPCCancellation(record, event, 'old').category, 'scope_disposed');
  record.documentRelease = { ...record.scopeRelease, type: 'document-release' };
  delete record.scopeRelease;
  assert.equal(classifyRPCCancellation(record, event, 'old').outcome, 'failure', 'beforeunload can be canceled; a loader change must also occur');
  assert.equal(classifyRPCCancellation(record, event, 'new').category, 'document_navigation');
});

test('transport failures, HTTP errors, writes, unknown reads and unrelated lifecycle evidence remain failures', () => {
  const mutations = [
    ({ event }) => { event.canceled = false; },
    ({ event }) => { event.errorText = 'net::ERR_FAILED'; },
    ({ record }) => { record.response = { status: 503 }; },
    ({ record }) => { record.response = { status: 302 }; },
    ({ record }) => { record.domain = 'operational_fact'; },
    ({ record }) => { record.postDataJSON = () => ({ id: 'rpc-1', method: 'save_sales_order_with_items' }); },
    ({ record }) => { record.postDataJSON = () => ({ id: 'rpc-1', method: 'get_unaudited_read' }); },
    ({ record }) => { delete record.scopeRelease; },
    ...['frameId', 'loaderId', 'rpcID', 'domain', 'method'].map(key => ({ record }) => { record.scopeRelease[key] = 'different'; }),
    ({ record }) => { record.scopeRelease.bootstrapAt = 3000; },
    ({ record }) => { record.scopeRelease.requestState = 'failed'; },
    ({ record }) => { record.scopeRelease.requestState = 'completed'; },
    ({ record }) => { record.scopeRelease.reasonName = 'TimeoutError'; },
    ({ record }) => { record.scopeRelease.scope.owner = 'workflow-action-access'; },
    ({ record }) => { record.scopeRelease.scope.nextGeneration = 4; },
    ({ record }) => { record.scopeRelease.scope.searchText = 'private-search'; },
  ];
  for (const mutate of mutations) {
    const value = sample();
    mutate(value);
    assert.equal(classifyRPCCancellation(value.record, value.event, 'new').outcome, 'failure', mutate.toString());
  }
});

test('a later scope cleanup or later departure cannot excuse an already failed read', () => {
  const { record, event } = sample();
  record.scopeRelease.requestState = 'failed';
  record.documentRelease = { ...record.scopeRelease, type: 'document-release' };
  assert.deepEqual(classifyRPCCancellation(record, event, 'new'), { outcome: 'failure', reason: 'request_failed_or_completed_before_scope_release' });
});

test('native document destruction requires a matched active read, per-request departure, old context and a new loader', () => {
  const make = () => {
    const { record } = sample();
    record.documentRelease = { ...record.scopeRelease, type: 'document-release' };
    record.documentDestroyed = { frameId: 'main', loaderId: 'old', bootstrapAt: 1000, source: 'Runtime.executionContextsCleared' };
    delete record.scopeRelease;
    return record;
  };
  assert.equal(classifyDisposedDocumentRead(make(), 'new').terminalEvidence, 'Runtime.executionContextsCleared');
  assert.equal(classifyDisposedDocumentRead(make(), 'old'), null);
  for (const mutate of [
    record => { delete record.documentRelease; },
    record => { delete record.documentDestroyed; },
    record => { record.documentRelease.requestState = 'failed'; },
    record => { record.documentRelease.requestState = 'completed'; },
    record => { record.documentDestroyed.loaderId = 'different'; },
    record => { record.documentDestroyed.frameId = 'different'; },
    record => { record.documentDestroyed.bootstrapAt = 1001; },
    record => { record.documentDestroyed.source = 'Page.frameNavigated'; },
    record => { record.response = { status: 500 }; },
    record => { record.response = { status: NaN }; },
    record => { record.postDataJSON = () => ({ id: 'rpc-1', method: 'save_sales_order_with_items' }); },
  ]) {
    const record = make(); mutate(record);
    assert.equal(classifyDisposedDocumentRead(record, 'new'), null, mutate.toString());
  }
});

test('browser provenance binds to the default execution context and loader; malformed or missing probe evidence fails verification', async () => {
  const session = new EventEmitter();
  let binding, script;
  const observed = [];
  session.send = async (method, params) => {
    if (method === 'Runtime.addBinding') binding = params.name;
    if (method === 'Page.addScriptToEvaluateOnNewDocument') script = params.source;
    if (method === 'Runtime.evaluate') return { result: { value: JSON.stringify({ ready: true, bindingErrors: 0 }) } };
  };
  const verify = await installRPCCancellationProbe(session, () => 'loader-1', entry => observed.push(entry));
  assert.match(script, /originalFetch\.apply/);
  assert.match(script, /return result;/, 'passive observation must return native promises');
  session.emit('Runtime.executionContextCreated', { context: { id: 7, auxData: { isDefault: true, frameId: 'frame-1' } } });
  session.emit('Runtime.bindingCalled', { name: binding, executionContextId: 7, payload: JSON.stringify({ type: 'bootstrap', bootstrapAt: 1000 }) });
  session.emit('Runtime.bindingCalled', { name: binding, executionContextId: 7, payload: JSON.stringify({ ...sample().record.scopeRelease, frameId: 'forged-frame', loaderId: 'forged-loader' }) });
  assert.equal(observed[0].frameId, 'frame-1');
  assert.equal(observed[0].loaderId, 'loader-1');
  assert.equal(observed[0].bootstrapAt, 1000);
  await verify(1);
  session.emit('Runtime.bindingCalled', { name: binding, executionContextId: 7, payload: 'malformed' });
  await assert.rejects(verify(1), /provenance is incomplete/);
  session.send = async () => ({ result: { value: 'null' } });
  const verifyMissing = await installRPCCancellationProbe(session, () => 'loader-1', () => {});
  await assert.rejects(verifyMissing(1), /provenance is incomplete/);
});


test('production exception detail reads require exact latest-request provenance; writes and unexplained aborts still fail', () => {
  const make = () => {
    const value = sample();
    value.record.domain = value.record.scopeRelease.domain = 'operational_fact';
    value.record.postDataJSON = () => ({ id: 'rpc-1', method: 'get_production_exception' });
    value.record.scopeRelease.method = 'get_production_exception';
    value.record.response = { status: 200 };
    return value;
  };
  const positive = make();
  assert.equal(classifyRPCCancellation(positive.record, positive.event, 'old').category, 'scope_superseded');
  for (const mutate of [
    value => { delete value.record.scopeRelease; },
    value => { value.record.scopeRelease.scope.owner = 'workflow-action-access'; },
    value => { value.record.scopeRelease.rpcID = 'other'; },
    value => { value.record.scopeRelease.scope.nextGeneration = 9; },
    value => { value.record.scopeRelease.requestState = 'failed'; },
    value => { value.record.response.status = 500; },
    value => { value.event.errorText = 'net::ERR_FAILED'; },
    value => { value.record.postDataJSON = () => ({ id: 'rpc-1', method: 'execute_production_exception' }); },
    value => { value.record.domain = value.record.scopeRelease.domain = 'customer_config'; value.record.postDataJSON = () => ({ id: 'rpc-1', method: 'execute_production_exception_process' }); value.record.scopeRelease.method = 'execute_production_exception_process'; },
    value => { value.record.postDataJSON = () => ({ id: 'rpc-1', method: 'get_production_exception_context' }); },
  ]) {
    const value = make(); mutate(value);
    assert.equal(classifyRPCCancellation(value.record, value.event, 'old').outcome, 'failure', mutate.toString());
  }
});
