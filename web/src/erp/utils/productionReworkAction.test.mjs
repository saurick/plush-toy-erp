import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionReworkPayload,
  findProductionReworkResult,
  isPostedProductionCompletion,
  isProductionReworkEligible,
  normalizeProductionReworkRequest,
  productionReworkFormValuesFromRequest,
  productionReworkQuantitySummary,
  suggestedProductionReworkNo,
  validateProductionReworkResult,
} from './productionReworkAction.mjs'

const source = {
  id: 81,
  fact_no: 'PROD-FG-POSTED-001',
  fact_type: 'FINISHED_GOODS_RECEIPT',
  status: 'POSTED',
  subject_type: 'PRODUCT',
  subject_id: 301,
  product_sku_id: 401,
  warehouse_id: 1,
  unit_id: 501,
  lot_id: 480,
  quantity: '10',
  source_type: 'PRODUCTION_ORDER',
  source_id: 71,
  source_line_id: 7100,
}

const reworks = [
  {
    id: 91,
    fact_type: 'REWORK',
    status: 'POSTED',
    source_type: 'PRODUCTION_FACT',
    source_id: 81,
    quantity: '3',
  },
  {
    id: 92,
    fact_type: 'REWORK',
    status: 'DRAFT',
    source_type: 'PRODUCTION_FACT',
    source_id: 81,
    quantity: '8',
  },
]

test('production rework eligibility is limited to posted source-bound completions with remaining quantity', () => {
  assert.equal(isPostedProductionCompletion(source), true)
  assert.deepEqual(productionReworkQuantitySummary(source, reworks), {
    completed: '10',
    postedRework: '3',
    remaining: '7',
  })
  assert.equal(isProductionReworkEligible(source, reworks), true)
  assert.equal(
    isProductionReworkEligible({ ...source, status: 'DRAFT' }, reworks),
    false
  )
  assert.equal(
    isProductionReworkEligible({ ...source, lot_id: null }, reworks),
    false
  )
  assert.equal(
    isProductionReworkEligible(source, [{ ...reworks[0], quantity: '10' }]),
    false
  )
})

test('production rework payload contains only operator fields plus the locked completion reference', () => {
  const occurredAtInput = '2026-07-14T08:00'
  assert.deepEqual(
    buildProductionReworkPayload(
      {
        fact_no: ' RW-001 ',
        quantity: '2.5000',
        occurred_at: occurredAtInput,
        reason: ' 成品抽检不合格，返工处理 ',
      },
      source,
      reworks
    ),
    {
      fact_no: 'RW-001',
      source_completion_fact_id: 81,
      quantity: '2.5',
      occurred_at: new Date(occurredAtInput).toISOString(),
      reason: '成品抽检不合格，返工处理',
    }
  )
  assert.equal(suggestedProductionReworkNo(source), 'RW-PROD-FG-POSTED-001')
  assert.throws(
    () =>
      buildProductionReworkPayload(
        { fact_no: 'RW-OVER', quantity: '8', reason: '超量' },
        source,
        reworks
      ),
    /剩余可返工数量/u
  )
  assert.throws(
    () =>
      buildProductionReworkPayload(
        { fact_no: 'RW-NO-REASON', quantity: '1', reason: '' },
        source,
        reworks
      ),
    /返工原因/u
  )
})

test('production rework API request uses a strict allowlist', () => {
  const request = normalizeProductionReworkRequest({
    customer_key: 'yoyoosun',
    fact_no: 'RW-001',
    source_completion_fact_id: 81,
    quantity: '2',
    occurred_at: '2026-07-14T08:00:00.000Z',
    reason: '返工处理',
    idempotency_key: 'rw-attempt-001',
  })
  assert.deepEqual(Object.keys(request).sort(), [
    'customer_key',
    'fact_no',
    'idempotency_key',
    'occurred_at',
    'quantity',
    'reason',
    'source_completion_fact_id',
  ])
  for (const forbidden of [
    'fact_type',
    'subject_id',
    'warehouse_id',
    'lot_id',
    'source_type',
    'source_id',
    'note',
  ]) {
    assert.throws(
      () => normalizeProductionReworkRequest({ ...request, [forbidden]: 9 }),
      /返工内容有误/u,
      forbidden
    )
  }
  assert.throws(
    () =>
      normalizeProductionReworkRequest({
        ...request,
        idempotency_key: '',
      }),
    /返工内容有误/u
  )
})

test('production rework result and unknown reread stay bound to the source completion', () => {
  const request = normalizeProductionReworkRequest({
    fact_no: 'RW-001',
    source_completion_fact_id: 81,
    quantity: '2',
    reason: '返工处理',
    idempotency_key: 'rw-attempt-001',
  })
  const result = {
    id: 101,
    fact_no: request.fact_no,
    fact_type: 'REWORK',
    status: 'DRAFT',
    subject_type: 'PRODUCT',
    subject_id: 301,
    warehouse_id: 1,
    unit_id: 501,
    lot_id: 480,
    quantity: request.quantity,
    source_type: 'PRODUCTION_FACT',
    source_id: 81,
    source_line_id: 7100,
    idempotency_key: request.idempotency_key,
    note: request.reason,
  }
  assert.equal(validateProductionReworkResult(result, request), result)
  assert.equal(findProductionReworkResult([result], request), result)
  assert.equal(findProductionReworkResult([], request), null)
  assert.throws(
    () => validateProductionReworkResult({ ...result, source_id: 82 }, request),
    /无法确认/u
  )
  const occurredAtInstant = '2026-07-14T08:00:00.000Z'
  const { occurred_at: occurredAtInput, ...formValues } =
    productionReworkFormValuesFromRequest({
      ...request,
      occurred_at: occurredAtInstant,
    })
  assert.deepEqual(formValues, {
    fact_no: 'RW-001',
    quantity: '2',
    reason: '返工处理',
  })
  assert.match(occurredAtInput, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u)
  assert.equal(new Date(occurredAtInput).toISOString(), occurredAtInstant)
})
