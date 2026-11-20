import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test from 'node:test'

import {
  validateFinanceAllocationDraft,
  financePaymentPostMatchesIntent,
  validateFinanceCreditDraft,
  pendingFinanceAllocationAttempt,
} from './financePaymentAllocation.mjs'
import { createSourceBusinessActionAttemptStore } from './sourceBusinessAction.mjs'

test('finance replay keeps payment and allocation status contracts independent', async (t) => {
  const file = new URL('./financePaymentAllocation.mjs?independent-statuses', import.meta.url)
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL === file.href && specifier.endsWith('/statuses.generated.mjs')) {
        return { url: new URL('../../../scripts/test/statusOwnershipFixture.mjs', import.meta.url).href, shortCircuit: true }
      }
      return nextResolve(specifier, context)
    },
  })
  t.after(() => hook.deregister())
  const consumer = await import(file.href)
  const expected = { id: 7, currency: 'USD', direction: 'RECEIPT', counterparty_type: 'CUSTOMER', counterparty_id: 3, amount: '100' }
  const allocations = [{ finance_fact_id: 11, amount: '100' }]
  const payment = { ...expected, status: 'CASH_POSTED', allocations: [{ ...allocations[0], status: 'ALLOCATION_POSTED' }] }
  assert.equal(consumer.financePaymentPostMatchesIntent(payment, expected, allocations), true)
  assert.equal(consumer.financePaymentPostMatchesIntent({ ...payment, status: 'ALLOCATION_POSTED' }, expected, allocations), false)
  assert.equal(consumer.financePaymentPostMatchesIntent({ ...payment, allocations: [{ ...allocations[0], status: 'CASH_POSTED' }] }, expected, allocations), false)
})

test('uncertain allocation keeps its original version and key after balance readback', () => {
  let sequence = 0
  const store = createSourceBusinessActionAttemptStore({
    cryptoProvider: { randomUUID: () => `allocation-${++sequence}` },
  })
  const payload = {
    id: 31,
    expected_version: 2,
    allocations: [{ finance_fact_id: 9, amount: '10' }],
  }
  assert.equal(
    pendingFinanceAllocationAttempt(store, 'payment:31', payload),
    null
  )
  const first = store.prepare('payment:31', payload)
  store.settle('payment:31', first, { isInvalidResponse: true })
  const retry = pendingFinanceAllocationAttempt(store, 'payment:31', {
    ...payload,
    expected_version: 3,
  })
  assert.equal(retry, first)
  assert.equal(retry.params.expected_version, 2)
  assert.throws(
    () =>
      pendingFinanceAllocationAttempt(store, 'payment:31', {
        ...payload,
        allocations: [{ finance_fact_id: 9, amount: '11' }],
      }),
    /上次抵扣结果/u
  )
  store.settle('payment:31', retry, null)
  assert.equal(
    pendingFinanceAllocationAttempt(store, 'payment:31', {
      ...payload,
      expected_version: 3,
    }),
    null
  )
  assert.notEqual(
    store.prepare('payment:31', { ...payload, expected_version: 3 }).params
      .idempotency_key,
    first.params.idempotency_key
  )
})

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

test('advance allocation preserves unused balance and rejects overspend or duplicate facts', () => {
  const input = {
    paymentAmount: '0.300000',
    candidates,
    allowPartial: true,
    allocations: [{ finance_fact_id: 11, amount: '0.200000' }],
  }
  assert.deepEqual(validateFinanceAllocationDraft(input), {
    ok: true,
    total: '0.2',
  })
  assert.equal(
    validateFinanceAllocationDraft({ ...input, paymentAmount: '0.199999' })
      .reason,
    'TOTAL_MISMATCH'
  )
  assert.equal(
    validateFinanceAllocationDraft({
      ...input,
      allocations: [...input.allocations, ...input.allocations],
    }).reason,
    'SOURCE_CHANGED'
  )
  assert.equal(
    validateFinanceAllocationDraft({
      ...input,
      allocations: [{ finance_fact_id: 11, amount: '0.0000001' }],
    }).ok,
    false
  )
})

test('unknown payment result requires the exact allocation intent', () => {
  const expected = {
    id: 7,
    amount: '12',
    currency: 'CNY',
    direction: 'PAYMENT',
    counterparty_type: 'SUPPLIER',
    counterparty_id: 4,
  }
  const posted = {
    ...expected,
    status: 'POSTED',
    allocations: [
      { finance_fact_id: 2, amount: '12.000000', status: 'POSTED' },
    ],
  }
  assert.equal(
    financePaymentPostMatchesIntent(posted, expected, [
      { finance_fact_id: 2, amount: '12' },
    ]),
    true
  )
  assert.equal(
    financePaymentPostMatchesIntent(posted, expected, [
      { finance_fact_id: 3, amount: '12' },
    ]),
    false
  )
  assert.equal(financePaymentPostMatchesIntent(posted, expected, []), false)
  assert.equal(
    financePaymentPostMatchesIntent(
      { ...posted, allocations: [] },
      expected,
      []
    ),
    true
  )
  assert.equal(
    financePaymentPostMatchesIntent(
      {
        ...posted,
        allocations: [{ ...posted.allocations[0], status: 'REVERSED' }],
      },
      expected,
      [{ finance_fact_id: 2, amount: '12' }]
    ),
    false
  )
})
