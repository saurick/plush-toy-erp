import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProductionCompletionChoices,
  buildProductionCompletionLotOptions,
  buildProductionCompletionPayload,
  compareProductionCompletionQuantity,
  findProductionCompletionResult,
  normalizeProductionCompletionCreateRequest,
} from './productionCompletionAction.mjs'
import { SOURCE_INBOUND_LOT_SELECTION } from './sourceInboundLotSelection.mjs'

test('production completion choices reserve both posted facts and existing drafts', () => {
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
  assert.equal(choices[0].remaining, '4')
  assert.match(choices[0].label, /剩余 4 件/u)
})

test('production completion edit excludes only the current draft from the available cap', () => {
  const choices = buildProductionCompletionChoices(
    [
      {
        id: 11,
        planned_quantity: '10',
        product_name_snapshot: '玩偶熊',
        unit_name_snapshot: '件',
      },
    ],
    [
      {
        id: 21,
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'DRAFT',
        quantity: '2',
      },
      {
        id: 22,
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'DRAFT',
        quantity: '3',
      },
    ],
    null,
    { excludeFactID: 21 }
  )
  assert.equal(choices[0].draft, '3')
  assert.equal(choices[0].remaining, '7')
})

test('production completion is capped by accepted packaging WIP before planned quantity', () => {
  const [choice] = buildProductionCompletionChoices(
    [
      {
        id: 11,
        planned_quantity: '100',
        accepted_packaging_quantity: '40',
        product_code_snapshot: 'P-001',
        unit_name_snapshot: '件',
      },
    ],
    [
      {
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'POSTED',
        quantity: '0.000001',
      },
    ]
  )
  assert.equal(choice.planned, '100')
  assert.equal(choice.acceptedPackaging, '40')
  assert.equal(choice.posted, '0.000001')
  assert.equal(choice.remaining, '39.999999')
  assert.match(choice.label, /剩余 39\.999999 件/u)
  assert.equal(
    compareProductionCompletionQuantity('39.999999', choice.remaining),
    0
  )
  assert.equal(compareProductionCompletionQuantity('40', choice.remaining), 1)
})

test('production completion clamps fully consumed packaging quantity at zero', () => {
  const choices = buildProductionCompletionChoices(
    [
      {
        id: 11,
        planned_quantity: '100',
        accepted_packaging_quantity: '40',
      },
      {
        id: 12,
        planned_quantity: '100',
        accepted_packaging_quantity: '40',
      },
    ],
    [
      {
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 11,
        status: 'POSTED',
        quantity: '40',
      },
      {
        fact_type: 'FINISHED_GOODS_RECEIPT',
        source_type: 'PRODUCTION_ORDER',
        source_line_id: 12,
        status: 'POSTED',
        quantity: '40.000001',
      },
    ]
  )

  for (const choice of choices) {
    assert.equal(choice.remaining, '0')
    assert.equal(choice.disabled, true)
  }
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

test('production completion rejects a production order outside an actionable state', () => {
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
    /当前生产订单状态不能登记完工入库/u
  )
})

test('routed completion choices reserve capacity on each accepted packaging batch', () => {
  const item = {
    id: 11,
    route_code: 'PLUSH_SEW_HAND_V1',
    planned_quantity: '10',
    product_code_snapshot: 'P-ROUTED',
    unit_name_snapshot: '件',
    accepted_packaging_batches: [
      {
        id: 101,
        production_order_item_id: 11,
        batch_no: 'PACK-A',
        status: 'ACCEPTED',
        quantity: '6',
        flow_type: 'NORMAL',
        origin_rework_fact_id: null,
      },
      {
        id: 102,
        production_order_item_id: 11,
        batch_no: 'PACK-RW',
        status: 'ACCEPTED',
        quantity: '4',
        flow_type: 'NORMAL',
        origin_rework_fact_id: 901,
      },
    ],
  }
  const facts = [
    {
      fact_type: 'FINISHED_GOODS_RECEIPT',
      source_type: 'PRODUCTION_ORDER',
      source_line_id: 11,
      production_wip_batch_id: 101,
      status: 'POSTED',
      quantity: '2',
    },
    {
      fact_type: 'FINISHED_GOODS_RECEIPT',
      source_type: 'PRODUCTION_ORDER',
      source_line_id: 11,
      production_wip_batch_id: 101,
      status: 'DRAFT',
      quantity: '1',
    },
    {
      fact_type: 'FINISHED_GOODS_RECEIPT',
      source_type: 'PRODUCTION_ORDER',
      source_line_id: 11,
      production_wip_batch_id: 102,
      status: 'POSTED',
      quantity: '1.5',
    },
    {
      fact_type: 'REWORK',
      source_type: 'PRODUCTION_FACT',
      source_line_id: 11,
      status: 'POSTED',
      quantity: '2',
    },
  ]
  const [choice] = buildProductionCompletionChoices([item], facts)
  assert.equal(choice.remaining, '5.5')
  assert.deepEqual(
    choice.batchChoices.map(({ value, posted, draft, remaining }) => ({
      value,
      posted,
      draft,
      remaining,
    })),
    [
      { value: 101, posted: '2', draft: '1', remaining: '3' },
      { value: 102, posted: '1.5', draft: '0', remaining: '2.5' },
    ]
  )
  assert.match(choice.batchChoices[1].label, /成品返工补制/u)
  assert.doesNotMatch(choice.batchChoices[1].label, /901|origin|fact/iu)
})

test('routed completion facts fail closed when the exact WIP batch cannot be verified', () => {
  const item = {
    id: 11,
    route_code: 'PLUSH_SEW_HAND_V1',
    planned_quantity: '10',
    accepted_packaging_batches: [
      {
        id: 101,
        production_order_item_id: 11,
        batch_no: 'PACK-A',
        status: 'ACCEPTED',
        quantity: '10',
        flow_type: 'NORMAL',
        origin_rework_fact_id: null,
      },
    ],
  }
  const baseFact = {
    fact_type: 'FINISHED_GOODS_RECEIPT',
    source_type: 'PRODUCTION_ORDER',
    source_line_id: 11,
    status: 'POSTED',
    quantity: '2',
  }
  for (const fact of [
    baseFact,
    { ...baseFact, production_wip_batch_id: 999 },
  ]) {
    assert.throws(
      () => buildProductionCompletionChoices([item], [fact]),
      /来源批次/u
    )
  }
  assert.throws(
    () =>
      buildProductionCompletionChoices(
        [
          item,
          {
            ...item,
            id: 12,
            accepted_packaging_batches: [
              {
                ...item.accepted_packaging_batches[0],
                production_order_item_id: 12,
              },
            ],
          },
        ],
        []
      ),
    /来源批次/u,
    'duplicate batch ids across production lines must fail closed'
  )
})

test('routed and closed-order completion payloads require an eligible lineage batch', () => {
  const routedItem = {
    id: 11,
    route_code: 'PLUSH_SEW_HAND_V1',
    accepted_packaging_batches: [
      {
        id: 102,
        production_order_item_id: 11,
        status: 'ACCEPTED',
        origin_rework_fact_id: 901,
      },
    ],
  }
  const values = {
    production_order_item_id: 11,
    production_wip_batch_id: 102,
    warehouse_id: 7,
    lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
    new_lot_no: 'REWORK-REPLACEMENT-LOT',
    quantity: '4',
  }
  assert.equal(
    buildProductionCompletionPayload(
      values,
      { id: 5, status: 'RELEASED' },
      routedItem
    ).production_wip_batch_id,
    102
  )
  assert.equal(
    buildProductionCompletionPayload(
      values,
      { id: 5, status: 'CLOSED' },
      routedItem
    ).production_wip_batch_id,
    102
  )
  assert.throws(
    () =>
      buildProductionCompletionPayload(
        { ...values, production_wip_batch_id: undefined },
        { id: 5, status: 'RELEASED' },
        routedItem
      ),
    /包装验收批次/u
  )
  assert.throws(
    () =>
      buildProductionCompletionPayload(
        values,
        { id: 5, status: 'CLOSED' },
        {
          ...routedItem,
          accepted_packaging_batches: [
            {
              ...routedItem.accepted_packaging_batches[0],
              origin_rework_fact_id: null,
            },
          ],
        }
      ),
    /成品返工补制/u
  )
})

test('completion request and unknown-result validation preserve the exact WIP batch', () => {
  const request = normalizeProductionCompletionCreateRequest({
    fact_no: 'PROD-FG-RW-001',
    production_order_id: 5,
    production_order_item_id: 11,
    production_wip_batch_id: 102,
    warehouse_id: 7,
    new_lot_no: 'REWORK-REPLACEMENT-LOT',
    quantity: '4',
    idempotency_key: 'production-completion-rw-001',
  })
  assert.equal(request.production_wip_batch_id, 102)
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
    production_wip_batch_id: 102,
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
      [{ ...result, production_wip_batch_id: 103 }],
      request,
      { product_id: 21, unit_id: 41 }
    )
  )
  assert.throws(() =>
    findProductionCompletionResult(
      [{ ...result, production_wip_batch_id: null }],
      request,
      { product_id: 21, unit_id: 41 }
    )
  )
})
