import assert from 'node:assert/strict'
import test from 'node:test'

import {
  financeInvoiceCategoryForKey,
  inspectFinanceFieldContract,
} from './manual-acceptance-finance-field-contract.mjs'

const completeRecords = [
  {
    fact_no: 'AR-001',
    fact_type: 'RECEIVABLE',
    status: 'POSTED',
    collection_type: 'ACCOUNTS_RECEIVABLE',
    payment_term: 'EOM_30',
    payment_term_days: 30,
  },
  {
    fact_no: 'AR-060',
    fact_type: 'RECEIVABLE',
    status: 'DRAFT',
    collection_type: 'ACCOUNTS_RECEIVABLE',
    payment_term_days: 60,
  },
  { fact_no: 'AP-001', fact_type: 'PAYABLE', status: 'SETTLED' },
  {
    fact_no: 'INV-001',
    fact_type: 'INVOICE',
    status: 'CANCELLED',
    invoice_category: 'VAT_SPECIAL_13',
    cancelled_at: 1784300000,
    cancelled_by_name: '验收财务',
    cancel_reason: '验收取消',
  },
  { fact_no: 'REC-001', fact_type: 'RECONCILIATION', status: 'POSTED' },
]

test('finance field contract accepts only source-backed dimensions and complete cancellation audit', () => {
  const result = inspectFinanceFieldContract(completeRecords)
  assert.equal(result.complete, true)
  assert.equal(result.coveragePercent, 100)
  assert.equal(result.byType.RECEIVABLE.coveragePercent, 100)
  assert.equal(result.representatives.RECEIVABLE.active.factNo, 'AR-001')
  assert.equal(result.representatives.INVOICE.cancelled.factNo, 'INV-001')
  assert.match(result.digest, /^[a-f0-9]{64}$/u)
})

test('finance field contract reports unexplained blanks, guessed custom terms, and invalid audit', () => {
  const result = inspectFinanceFieldContract([
    {
      fact_no: 'AR-BLANK',
      fact_type: 'RECEIVABLE',
      status: 'POSTED',
    },
    {
      fact_no: 'AR-GUESSED',
      fact_type: 'RECEIVABLE',
      status: 'POSTED',
      collection_type: 'ACCOUNTS_RECEIVABLE',
      payment_term: 'EOM_45',
      payment_term_days: 60,
    },
    {
      fact_no: 'INV-BLANK',
      fact_type: 'INVOICE',
      status: 'CANCELLED',
    },
  ])
  assert.equal(result.complete, false)
  assert.ok(result.coveragePercent < 100)
  assert.ok(
    result.violations.some(
      (item) => item.factNo === 'AR-BLANK' && item.field === 'collection_type'
    )
  )
  assert.ok(
    result.violations.some(
      (item) => item.factNo === 'AR-GUESSED' && item.field === 'payment_term'
    )
  )
  assert.ok(
    result.violations.some(
      (item) =>
        item.factNo === 'INV-BLANK' && item.field === 'invoice_category'
    )
  )
})

test('finance invoice category selection is deterministic and legal', () => {
  assert.equal(
    financeInvoiceCategoryForKey('sales-001'),
    financeInvoiceCategoryForKey('sales-001')
  )
  assert.match(financeInvoiceCategoryForKey('sales-001'), /^[A-Z0-9_]+$/u)
})
