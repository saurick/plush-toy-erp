import assert from 'node:assert/strict'
import test from 'node:test'

import {
  FINANCE_BUSINESS_SOURCE_ACTIONS,
  buildOutsourcingReturnPayablePayload,
  buildPurchaseReceiptPayablePayload,
  buildSingleFactReconciliationPayload,
  financeBusinessSourceActionConfig,
  hasValidFinanceTransitionSource,
  isOutsourcingReturnPayableSource,
  isSingleFactReconciliationSource,
  normalizeOutsourcingReturnPayableRequest,
  normalizePurchaseReceiptPayableRequest,
  normalizeSingleFactReconciliationRequest,
  suggestedFinanceBusinessNo,
  validateOutsourcingReturnPayableResult,
  validatePurchaseReceiptPayableResult,
  validateSingleFactReconciliationResult,
} from './financeBusinessSourceAction.mjs'

const operatorValues = Object.freeze({
  fact_no: ' AP-SOURCE-001 ',
  occurred_at: '2026-07-14T10:30',
  note: ' 来源核对 ',
  amount: '999999',
  currency: 'USD',
  supplier_id: 88,
  source_type: 'MANUAL',
  idempotency_key: 'operator-must-not-own-this',
})

test('finance source payloads keep only operator-owned fields plus one locked source', () => {
  const purchase = buildPurchaseReceiptPayablePayload(operatorValues, {
    id: 61,
    receipt_no: 'PR-61',
    status: 'POSTED',
  })
  assert.deepEqual(Object.keys(purchase).sort(), [
    'fact_no',
    'note',
    'occurred_at',
    'purchase_receipt_id',
  ])
  assert.equal(purchase.fact_no, 'AP-SOURCE-001')
  assert.equal(purchase.purchase_receipt_id, 61)
  assert.equal(purchase.note, '来源核对')

  const outsourcing = buildOutsourcingReturnPayablePayload(operatorValues, {
    id: 71,
    fact_no: 'OUT-RR-71',
    fact_type: 'RETURN_RECEIPT',
    status: 'POSTED',
  })
  assert.deepEqual(Object.keys(outsourcing).sort(), [
    'fact_no',
    'note',
    'occurred_at',
    'outsourcing_fact_id',
  ])
  assert.equal(outsourcing.outsourcing_fact_id, 71)

  const reconciliation = buildSingleFactReconciliationPayload(
    { ...operatorValues, fact_no: 'REC-AR-81' },
    {
      id: 81,
      fact_no: 'AR-81',
      fact_type: 'RECEIVABLE',
      status: 'POSTED',
    }
  )
  assert.deepEqual(Object.keys(reconciliation).sort(), [
    'fact_no',
    'finance_fact_id',
    'note',
    'occurred_at',
  ])
  assert.equal(reconciliation.finance_fact_id, 81)
})

test('payable and single reconciliation eligibility fail closed', () => {
  assert.equal(isOutsourcingReturnPayableSource(null), false)
  assert.equal(isSingleFactReconciliationSource(null), false)
  assert.throws(
    () => buildPurchaseReceiptPayablePayload(operatorValues, null),
    /仅已过账/u
  )
  assert.equal(
    isOutsourcingReturnPayableSource({
      id: 1,
      fact_type: 'RETURN_RECEIPT',
      status: 'POSTED',
    }),
    true
  )
  assert.equal(
    isOutsourcingReturnPayableSource({
      id: 1,
      fact_type: 'MATERIAL_ISSUE',
      status: 'POSTED',
    }),
    false
  )
  for (const factType of ['RECEIVABLE', 'PAYABLE', 'INVOICE']) {
    assert.equal(
      isSingleFactReconciliationSource({
        id: 2,
        fact_type: factType,
        status: 'POSTED',
      }),
      true
    )
  }
  for (const factType of ['PAYMENT', 'RECONCILIATION']) {
    assert.equal(
      isSingleFactReconciliationSource({
        id: 2,
        fact_type: factType,
        status: 'POSTED',
      }),
      false
    )
  }
  assert.throws(
    () =>
      buildSingleFactReconciliationPayload(operatorValues, {
        id: 2,
        fact_no: 'PAY-2',
        fact_type: 'PAYMENT',
        status: 'POSTED',
      }),
    /应收、应付或发票/u
  )
})

test('finance draft transitions require the exact formal source contract', () => {
  const validSources = [
    ['RECEIVABLE', 'SHIPMENT'],
    ['INVOICE', 'SHIPMENT'],
    ['PAYABLE', 'PURCHASE_RECEIPT'],
    ['PAYABLE', 'OUTSOURCING_FACT'],
    ['RECONCILIATION', 'FINANCE_FACT'],
  ]
  for (const [factType, sourceType] of validSources) {
    assert.equal(
      hasValidFinanceTransitionSource({
        fact_type: factType,
        source_type: sourceType,
        source_id: '81',
      }),
      true
    )
  }
  for (const record of [
    null,
    { fact_type: 'RECEIVABLE', source_type: 'MANUAL', source_id: 81 },
    { fact_type: 'PAYABLE', source_type: 'PURCHASE_RECEIPT' },
    { fact_type: 'INVOICE', source_type: 'SHIPMENT', source_id: 1.5 },
    { fact_type: 'PAYMENT', source_type: 'FINANCE_FACT', source_id: 81 },
  ]) {
    assert.equal(hasValidFinanceTransitionSource(record), false)
  }
})

test('strict request normalizers drop server-owned and unknown fields', () => {
  const common = {
    customer_key: ' yoyoosun ',
    fact_no: ' AP-001 ',
    occurred_at: '2026-07-14T02:30:00.000Z',
    note: ' 核对 ',
    idempotency_key: 'request-key-001',
    amount: '999',
    currency: 'USD',
    counterparty_id: 9,
    source_type: 'MANUAL',
  }
  assert.deepEqual(
    normalizePurchaseReceiptPayableRequest({
      ...common,
      purchase_receipt_id: 61,
    }),
    {
      customer_key: 'yoyoosun',
      fact_no: 'AP-001',
      occurred_at: '2026-07-14T02:30:00.000Z',
      note: '核对',
      purchase_receipt_id: 61,
      idempotency_key: 'request-key-001',
    }
  )
  assert.equal(
    normalizeOutsourcingReturnPayableRequest({
      ...common,
      outsourcing_fact_id: 71,
    }).outsourcing_fact_id,
    71
  )
  assert.equal(
    normalizeSingleFactReconciliationRequest({
      ...common,
      finance_fact_id: 81,
    }).finance_fact_id,
    81
  )
})

test('source result validators require the expected draft type and source', () => {
  const purchaseRequest = normalizePurchaseReceiptPayableRequest({
    fact_no: 'AP-61',
    purchase_receipt_id: 61,
    idempotency_key: 'request-key-061',
  })
  const purchaseResult = {
    id: 91,
    fact_no: 'AP-61',
    fact_type: 'PAYABLE',
    status: 'DRAFT',
    source_type: 'PURCHASE_RECEIPT',
    source_id: 61,
  }
  assert.equal(
    validatePurchaseReceiptPayableResult(purchaseResult, purchaseRequest),
    purchaseResult
  )
  assert.throws(
    () =>
      validatePurchaseReceiptPayableResult(
        { ...purchaseResult, source_id: 62 },
        purchaseRequest
      ),
    /无法确认/u
  )

  const outsourcingRequest = normalizeOutsourcingReturnPayableRequest({
    fact_no: 'AP-71',
    outsourcing_fact_id: 71,
    idempotency_key: 'request-key-071',
  })
  assert.equal(
    validateOutsourcingReturnPayableResult(
      {
        ...purchaseResult,
        id: 92,
        source_type: 'OUTSOURCING_FACT',
        source_id: 71,
      },
      outsourcingRequest
    ).id,
    92
  )

  const reconciliationRequest = normalizeSingleFactReconciliationRequest({
    fact_no: 'REC-81',
    finance_fact_id: 81,
    idempotency_key: 'request-key-081',
  })
  assert.equal(
    validateSingleFactReconciliationResult(
      {
        ...purchaseResult,
        id: 93,
        fact_type: 'RECONCILIATION',
        source_type: 'FINANCE_FACT',
        source_id: 81,
      },
      reconciliationRequest
    ).id,
    93
  )
})

test('action configuration and suggested numbers stay business-readable', () => {
  const config = financeBusinessSourceActionConfig(
    FINANCE_BUSINESS_SOURCE_ACTIONS.SINGLE_FACT_RECONCILIATION
  )
  assert.equal(config.factType, 'RECONCILIATION')
  assert.equal(
    suggestedFinanceBusinessNo(
      FINANCE_BUSINESS_SOURCE_ACTIONS.PURCHASE_RECEIPT_PAYABLE,
      { receipt_no: 'PR 2026 0714' }
    ),
    'AP-PR-2026-0714'
  )
})
