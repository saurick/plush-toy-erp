import assert from 'node:assert/strict'
import test from 'node:test'

import {
  validateFinanceAllocationDraft,
  validateFinanceCreditDraft,
} from './financePaymentAllocation.mjs'

const candidates = [
  {
    id: 11,
    fact_no: 'AR-11',
    outstanding_amount: '0.2',
  },
  {
    id: 12,
    fact_no: 'AR-12',
    outstanding_amount: '0.1',
  },
]

test('finance allocation: exact decimal sum accepts 0.1 + 0.2 as 0.3', () => {
  assert.deepEqual(
    validateFinanceAllocationDraft({
      paymentAmount: '0.300000',
      candidates,
      allocations: [
        { finance_fact_id: 11, amount: '0.2' },
        { finance_fact_id: 12, amount: '0.1' },
      ],
    }),
    { ok: true, total: '0.3' }
  )
})

test('finance allocation: rejects excess outstanding and mismatched totals', () => {
  assert.deepEqual(
    validateFinanceAllocationDraft({
      paymentAmount: '0.3',
      candidates,
      allocations: [{ finance_fact_id: 11, amount: '0.200001' }],
    }),
    {
      ok: false,
      reason: 'EXCEEDS_OUTSTANDING',
      financeFactNo: 'AR-11',
    }
  )
  assert.deepEqual(
    validateFinanceAllocationDraft({
      paymentAmount: '0.3',
      candidates,
      allocations: [{ finance_fact_id: 11, amount: '0.2' }],
    }),
    { ok: false, reason: 'TOTAL_MISMATCH', total: '0.2' }
  )
})

test('finance credit: exact comparison enforces the current outstanding amount', () => {
  assert.deepEqual(
    validateFinanceCreditDraft({
      amount: '12.340000',
      outstandingAmount: '12.34',
    }),
    { ok: true }
  )
  assert.deepEqual(
    validateFinanceCreditDraft({
      amount: '12.340001',
      outstandingAmount: '12.34',
    }),
    { ok: false, reason: 'EXCEEDS_OUTSTANDING' }
  )
})
