import assert from 'node:assert/strict';
import test from 'node:test';
import { assertRequestCancellationEvidence, REQUEST_CANCELLATION_CASE_KEYS } from './transaction-request-cancellation-browser.mjs';

function completeEvidence() {
  const cancellations = [
    [['list_sales_orders', 'scope_superseded'], ['get_sales_order', 'scope_superseded']],
    [['list_sales_orders', 'document_navigation']], undefined,
    [['explain_action_access', 'scope_disposed']], undefined,
    [['explain_action_access', 'scope_disposed']], undefined,
  ];
  return { domainDataUnchanged: true, cases: REQUEST_CANCELLATION_CASE_KEYS.map((key, index) => {
    const failure = [2, 4, 6].includes(index) ? index === 2 ? 'list_sales_orders' : 'explain_action_access' : undefined;
    return { key, passed: true, screenshots: ['verified.png'], viewport: { overflow: 0 },
      browserRPC: [{ code: 0, http: 200 }], expectedCancellations: cancellations[index], expectedFailure: failure,
      networkPages: [{ cancellations: (cancellations[index] || []).map(([method, category]) => ({ requestId: 'normal', method, category })) }],
      pageErrors: failure ? [{ method: failure, message: 'Unexpected RPC transport failure', failure: { requestID: 'failed', errorText: 'net::ERR_ABORTED', canceled: true }, cancellationClassification: 'cancellation_without_lifecycle_evidence' }] : [],
      ...(failure ? { errorVisible: true, recovered: true } : {}),
    };
  }) };
}

test('cancellation browser evidence requires desktop and both mobile widths, actual requests, visible failures and recovery', () => {
  assert.doesNotThrow(() => assertRequestCancellationEvidence(completeEvidence()));
  const mutations = [
    value => { value.cases.pop(); },
    value => { value.domainDataUnchanged = false; },
    value => { value.cases[0].networkPages[0].cancellations.pop(); },
    value => { value.cases[0].pageErrors.push({ message: 'unexpected error' }); },
    value => { value.cases[0].passed = false; },
    value => { value.cases[0].browserRPC = []; },
    value => { value.cases[0].browserRPC[0].http = 503; },
    value => { value.cases[1].expectedCancellations = []; },
    value => { value.cases[2].pageErrors = []; },
    value => { value.cases[2].pageErrors.push(value.cases[2].pageErrors[0]); },
    value => { value.cases[2].expectedFailure = 'save_sales_order_with_items'; },
    value => { value.cases[2].pageErrors[0].cancellationClassification = 'expected'; },
    value => { value.cases[2].networkPages[0].cancellations.push({ requestId: 'failed' }); },
    value => { value.cases[4].errorVisible = false; },
    value => { value.cases[6].recovered = false; },
    value => { value.cases[6].viewport.overflow = 18; },
  ];
  for (const mutate of mutations) {
    const value = completeEvidence();
    mutate(value);
    assert.throws(() => assertRequestCancellationEvidence(value), mutate.toString());
  }
});
