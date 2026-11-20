import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeApprovalCondition,
  approvalConditionSummary,
  orderSubmissionSuccessMessage,
} from './approvalCondition.mjs'
import { verifyAppliedApprovalSettings } from './approvalSettingsActivation.mjs'

test('approval conditions default to all and clear previous thresholds', () => {
  const all = { mode: 'all', amount: '', currency: '' }
  assert.deepEqual(normalizeApprovalCondition('sales_order'), all)
  assert.deepEqual(
    normalizeApprovalCondition('sales_order', {
      mode: 'all',
      amount: '10000',
      currency: 'USD',
    }),
    all
  )
  assert.deepEqual(
    normalizeApprovalCondition('purchase_order', {
      mode: 'amount',
      amount: '0.000000',
      currency: 'CNY',
    }),
    all
  )
  assert.deepEqual(
    normalizeApprovalCondition('purchase_order', {
      mode: 'amount',
      amount: '10000.010000',
      currency: 'usd',
    }),
    { mode: 'amount', amount: '10000.01', currency: 'USD' }
  )
  assert.equal(
    approvalConditionSummary('sales_order', {
      mode: 'amount',
      amount: '10000.000001',
      currency: 'CNY',
    }),
    'CNY 10,000.000001 起需审批'
  )
})

test('approval conditions reject unsupported fields and imprecise amounts', () => {
  for (const amount of [
    '-1',
    '',
    '1e6',
    'NaN',
    '1.0000001',
    '100000000000000',
  ]) {
    assert.throws(() =>
      normalizeApprovalCondition('sales_order', {
        mode: 'amount',
        amount,
        currency: 'CNY',
      })
    )
  }
  assert.throws(() =>
    normalizeApprovalCondition('shipment_finance', {
      mode: 'amount',
      amount: '1',
      currency: 'CNY',
    })
  )
  assert.throws(() =>
    normalizeApprovalCondition('sales_order', {
      mode: 'amount',
      amount: '1',
      currency: 'XYZ',
    })
  )
  assert.throws(() =>
    normalizeApprovalCondition('sales_order', { mode: 'expression' })
  )
})

test('activation readback must include the exact approval condition', () => {
  const payload = {
    customer_key: 'test',
    revision: 'next',
    items: [
      {
        approval_key: 'purchase_order',
        enabled: true,
        members: [],
        condition: { mode: 'amount', amount: '10000', currency: 'CNY' },
      },
    ],
  }
  const readback = {
    customer_key: 'test',
    config_revision: 'next',
    config_hash: 'hash',
    source: 'active_customer_config',
    items: structuredClone(payload.items),
  }
  assert.equal(verifyAppliedApprovalSettings({ readback, payload }), readback)
  for (const changed of [
    { mode: 'all' },
    { mode: 'amount', amount: '10001', currency: 'CNY' },
    { mode: 'amount', amount: '10000', currency: 'USD' },
  ]) {
    readback.items[0].condition = changed
    assert.throws(
      () => verifyAppliedApprovalSettings({ readback, payload }),
      /生效内容/
    )
  }
})

test('submit receipts distinguish human review from rule exemption, including replay', () => {
  for (const kind of ['sales_order', 'purchase_order']) {
    assert.match(
      orderSubmissionSuccessMessage(kind, {
        completed_node: { outcome: `${kind}.submitted` },
      }),
      /进入审批/
    )
    assert.match(
      orderSubmissionSuccessMessage(kind, {
        completed_node: { outcome: `${kind}.submitted_without_approval` },
      }),
      /按规则免审并生效/
    )
    assert.match(
      orderSubmissionSuccessMessage(kind, {
        started_node: { outcome: `${kind}.submitted_without_approval` },
      }),
      /按规则免审并生效/
    )
  }
})
