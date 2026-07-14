import assert from 'node:assert/strict'
import test from 'node:test'

import {
  normalizeFinanceCancellationRequest,
  financeCancelAuditText,
  validateFinanceCancellationResult,
} from './financeCancellation.mjs'

test('finance cancellation request requires a positive id and trimmed bounded reason', () => {
  assert.deepEqual(
    normalizeFinanceCancellationRequest({ id: 7, reason: '  客户撤销账款  ' }),
    { id: 7, reason: '客户撤销账款' }
  )
  for (const params of [
    {},
    { id: 0, reason: '客户撤销' },
    { id: 7, reason: '' },
    { id: 7, reason: '   ' },
    { id: 7, reason: '理'.repeat(256) },
  ]) {
    assert.throws(() => normalizeFinanceCancellationRequest(params), TypeError)
  }
})

test('finance cancellation audit copy requires the canonical complete audit bundle', () => {
  const format = (value) => `时间${value}`
  assert.equal(financeCancelAuditText({ status: 'POSTED' }, format), '-')
  assert.equal(
    financeCancelAuditText(
      {
        status: 'CANCELLED',
        cancelled_at: 9,
        cancelled_by_name: '财务主管',
        cancel_reason: '客户撤销',
      },
      format
    ),
    '时间9 / 财务主管 / 客户撤销'
  )
  assert.equal(
    financeCancelAuditText({ status: 'CANCELLED' }, format),
    '取消记录信息不完整，请联系管理员核对'
  )
})

test('finance cancellation result is bound to the request and complete audit projection', () => {
  const request = { id: 7, reason: '客户撤销账款' }
  const valid = {
    id: 7,
    status: 'CANCELLED',
    cancelled_at: 1_700_000_000,
    cancelled_by_name: '财务主管',
    cancel_reason: '客户撤销账款',
  }
  assert.equal(validateFinanceCancellationResult(valid, request), valid)
  for (const changed of [
    null,
    { ...valid, id: 8 },
    { ...valid, status: 'POSTED' },
    { ...valid, cancelled_at: null },
    { ...valid, cancelled_by_name: '' },
    { ...valid, cancel_reason: '' },
  ]) {
    assert.throws(
      () => validateFinanceCancellationResult(changed, request),
      (error) => error?.isInvalidResponse === true
    )
  }
})
