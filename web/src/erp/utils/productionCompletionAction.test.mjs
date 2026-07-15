import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionCompletionChoices,
  buildProductionCompletionLotOptions,
  buildProductionCompletionPayload,
  findProductionCompletionResult,
  normalizeProductionCompletionCreateRequest,
} from './productionCompletionAction.mjs'
import { SOURCE_INBOUND_LOT_SELECTION } from './sourceInboundLotSelection.mjs'

test('production completion choices use posted facts as the remaining truth', () => {
  const choices = buildProductionCompletionChoices(
    [
      {
        id: 11,
        planned_quantity: '10',
        product_code_snapshot: 'P-001',
        product_name_snapshot: '玩偶熊',
        unit_name_snapshot: '件',
      },
    ],
    [
      {
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'POSTED',
        quantity: '4',
      },
      {
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'DRAFT',
        quantity: '2',
      },
      {
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'CANCELLED',
        quantity: '9',
      },
    ]
  )
  assert.equal(choices[0].posted, '4')
  assert.equal(choices[0].draft, '2')
  assert.equal(choices[0].remaining, '6')
  assert.match(choices[0].label, /剩余 6 件/u)
})

test('production completion payload only submits source action fields', () => {
  const occurredAtInput = '2026-07-14T09:30'
  const payload = buildProductionCompletionPayload(
    {
      production_order_item_id: 11,
      warehouse_id: 7,
      lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
      lot_id: 3,
      quantity: '2.5000',
      occurred_at: occurredAtInput,
      note: '  完工复核  ',
      subject_id: 999,
      unit_id: 888,
      source_type: 'FORGED',
    },
    { id: 5, status: 'RELEASED' }
  )
  assert.deepEqual(payload, {
    production_order_id: 5,
    production_order_item_id: 11,
    warehouse_id: 7,
    lot_id: 3,
    quantity: '2.5',
    occurred_at: new Date(occurredAtInput).toISOString(),
    note: '完工复核',
  })
  assert.equal(Object.hasOwn(payload, 'subject_id'), false)
  assert.equal(Object.hasOwn(payload, 'unit_id'), false)
  assert.equal(Object.hasOwn(payload, 'source_type'), false)
})

test('production completion can create a new inbound lot without a stale existing lot', () => {
  const payload = buildProductionCompletionPayload(
    {
      production_order_item_id: 11,
      warehouse_id: 7,
      lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
      lot_id: undefined,
      new_lot_no: '  PROD-NEW-LOT-001  ',
      quantity: '2',
    },
    { id: 5, status: 'RELEASED' }
  )
  assert.deepEqual(payload, {
    production_order_id: 5,
    production_order_item_id: 11,
    warehouse_id: 7,
    new_lot_no: 'PROD-NEW-LOT-001',
    quantity: '2',
  })
  assert.equal(Object.hasOwn(payload, 'lot_id'), false)
})

test('production completion lot options stay on the source product and SKU', () => {
  const lots = [
    {
      id: 1,
      subject_type: 'PRODUCT',
      subject_id: 21,
      product_sku_id: 31,
      status: 'ACTIVE',
      lot_no: 'MATCHED',
    },
    {
      id: 2,
      subject_type: 'PRODUCT',
      subject_id: 21,
      product_sku_id: 32,
      status: 'ACTIVE',
      lot_no: 'WRONG-SKU',
    },
    {
      id: 3,
      subject_type: 'PRODUCT',
      subject_id: 21,
      product_sku_id: 31,
      status: 'HOLD',
      lot_no: 'BLOCKED',
    },
  ]
  assert.deepEqual(
    buildProductionCompletionLotOptions(
      { product_id: 21, product_sku_id: 31 },
      lots
    ).map((option) => option.value),
    [1]
  )
})

test('production completion request requires exactly one inbound lot intent', () => {
  const base = {
    customer_key: 'yoyoosun',
    fact_no: 'PROD-FG-001',
    production_order_id: 5,
    production_order_item_id: 11,
    warehouse_id: 7,
    quantity: '2',
    idempotency_key: 'production-completion-001',
  }
  assert.deepEqual(
    normalizeProductionCompletionCreateRequest({
      ...base,
      new_lot_no: ' PROD-NEW-LOT-001 ',
    }),
    { ...base, new_lot_no: 'PROD-NEW-LOT-001' }
  )
  assert.throws(() =>
    normalizeProductionCompletionCreateRequest({
      ...base,
      lot_id: 3,
      new_lot_no: 'PROD-NEW-LOT-001',
    })
  )
  assert.throws(() => normalizeProductionCompletionCreateRequest(base))
  assert.throws(() =>
    normalizeProductionCompletionCreateRequest({
      ...base,
      new_lot_no: 'PROD-NEW-LOT-001',
      subject_id: 99,
    })
  )
})

test('production completion unknown result reread binds the allocated lot and source line', () => {
  const request = {
    fact_no: 'PROD-FG-001',
    production_order_id: 5,
    production_order_item_id: 11,
    new_lot_no: 'PROD-NEW-LOT-001',
    idempotency_key: 'production-completion-001',
  }
  const result = {
    id: 91,
    fact_no: request.fact_no,
    fact_type: 'FINISHED_GOODS_RECEIPT',
    status: 'DRAFT',
    subject_type: 'PRODUCT',
    subject_id: 21,
    unit_id: 41,
    lot_id: 81,
    source_type: 'PRODUCTION_ORDER',
    source_id: 5,
    source_line_id: 11,
    idempotency_key: request.idempotency_key,
  }
  assert.equal(
    findProductionCompletionResult([result], request, {
      product_id: 21,
      unit_id: 41,
    }),
    result
  )
  assert.throws(() =>
    findProductionCompletionResult(
      [{ ...result, source_line_id: 12 }],
      request,
      { product_id: 21, unit_id: 41 }
    )
  )
})

test('production completion rejects incomplete or non-positive inputs', () => {
  assert.throws(() =>
    buildProductionCompletionPayload(
      {
        production_order_item_id: 1,
        warehouse_id: 1,
        lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
        new_lot_no: 'PROD-LOT-001',
        quantity: '0',
      },
      { id: 1, status: 'RELEASED' }
    )
  )
})

test('production completion rejects a production order outside RELEASED', () => {
  assert.throws(
    () =>
      buildProductionCompletionPayload(
        {
          production_order_item_id: 1,
          warehouse_id: 1,
          lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
          new_lot_no: 'PROD-LOT-001',
          quantity: '1',
        },
        { id: 1, status: 'DRAFT' }
      ),
    /仅已发布生产订单/u
  )
})
