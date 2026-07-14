import assert from 'node:assert/strict'
import test from 'node:test'

import {
  OUTSOURCING_SOURCE_ACTIONS,
  buildOutsourcingSourceFactPayload,
  filterOutsourcingSourceActionLots,
  findOutsourcingSourceFactResult,
  isOutsourcingSourceActionEligible,
  normalizeOutsourcingSourceFactCreateRequest,
  outsourcingSourceActionQuantitySummary,
  validateOutsourcingSourceFactResult,
} from './outsourcingOrderFactAction.mjs'
import { SOURCE_INBOUND_LOT_SELECTION } from './sourceInboundLotSelection.mjs'

const order = {
  id: 7,
  lifecycle_status: 'confirmed',
}
const materialItem = {
  id: 11,
  outsourcing_order_id: 7,
  subject_type: 'MATERIAL',
  material_id: 21,
  unit_id: 31,
  outsourcing_quantity: '10',
  line_status: 'open',
}
const productItem = {
  ...materialItem,
  id: 12,
  subject_type: 'PRODUCT',
  material_id: undefined,
  product_id: 22,
  product_sku_id: null,
}

test('outsourcing source actions stay bound to the matching open source line', () => {
  assert.equal(
    isOutsourcingSourceActionEligible(
      OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
      order,
      materialItem
    ),
    true
  )
  assert.equal(
    isOutsourcingSourceActionEligible(
      OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
      order,
      productItem
    ),
    false
  )
  assert.equal(
    isOutsourcingSourceActionEligible(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      productItem
    ),
    true
  )
  assert.equal(
    isOutsourcingSourceActionEligible(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      { ...order, lifecycle_status: 'draft' },
      productItem
    ),
    false
  )
})

test('outsourcing source payload submits only operator-owned fields', () => {
  const payload = buildOutsourcingSourceFactPayload(
    OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
    {
      warehouse_id: 3,
      lot_id: 4,
      quantity: '2.500',
      occurred_at: '2026-07-14T08:00',
      note: '  委外备料  ',
      subject_id: 999,
      supplier_id: 999,
      unit_id: 999,
    },
    order,
    materialItem,
    []
  )
  assert.deepEqual(payload, {
    outsourcing_order_id: 7,
    outsourcing_order_item_id: 11,
    warehouse_id: 3,
    lot_id: 4,
    quantity: '2.5',
    occurred_at: new Date('2026-07-14T08:00').toISOString(),
    note: '委外备料',
  })
  for (const serverDerivedField of [
    'fact_type',
    'subject_type',
    'subject_id',
    'supplier_id',
    'unit_id',
    'source_type',
    'source_id',
    'source_line_id',
  ]) {
    assert.equal(serverDerivedField in payload, false)
  }
})

test('outsourcing source lots stay bound to the action subject and active SKU', () => {
  const lots = [
    { id: 1, subject_type: 'MATERIAL', subject_id: 21, status: 'ACTIVE' },
    { id: 2, subject_type: 'MATERIAL', subject_id: 22, status: 'ACTIVE' },
    { id: 3, subject_type: 'MATERIAL', subject_id: 21, status: 'HOLD' },
    {
      id: 4,
      subject_type: 'PRODUCT',
      subject_id: 22,
      product_sku_id: 9,
      status: 'ACTIVE',
    },
    {
      id: 5,
      subject_type: 'PRODUCT',
      subject_id: 22,
      product_sku_id: 10,
      status: 'ACTIVE',
    },
    {
      id: 6,
      subject_type: 'PRODUCT',
      subject_id: 22,
      product_sku_id: null,
      status: 'ACTIVE',
    },
  ]
  assert.deepEqual(
    filterOutsourcingSourceActionLots(
      OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
      materialItem,
      lots
    ).map((lot) => lot.id),
    [1]
  )
  assert.deepEqual(
    filterOutsourcingSourceActionLots(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      { ...productItem, product_sku_id: 9 },
      lots
    ).map((lot) => lot.id),
    [4]
  )
  assert.deepEqual(
    filterOutsourcingSourceActionLots(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      productItem,
      lots
    ).map((lot) => lot.id),
    [6]
  )
})

test('outsourcing return receipt requires exactly one existing or new product lot intent', () => {
  assert.throws(
    () =>
      buildOutsourcingSourceFactPayload(
        OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
        {
          warehouse_id: 3,
          lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
          quantity: '2',
        },
        order,
        productItem,
        []
      ),
    /已有产品批次/u
  )
  assert.deepEqual(
    buildOutsourcingSourceFactPayload(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      {
        warehouse_id: 3,
        lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
        new_lot_no: '  OUT-RETURN-LOT-001  ',
        quantity: '2',
      },
      order,
      productItem,
      []
    ),
    {
      outsourcing_order_id: 7,
      outsourcing_order_item_id: 12,
      warehouse_id: 3,
      new_lot_no: 'OUT-RETURN-LOT-001',
      quantity: '2',
    }
  )
  assert.throws(
    () =>
      buildOutsourcingSourceFactPayload(
        OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
        {
          warehouse_id: 3,
          lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
          lot_id: 4,
          new_lot_no: 'OUT-RETURN-LOT-001',
          quantity: '2',
        },
        order,
        productItem,
        []
      ),
    /已有产品批次或填写新批次号/u
  )
  assert.throws(
    () =>
      buildOutsourcingSourceFactPayload(
        OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
        {
          warehouse_id: 3,
          lot_selection: SOURCE_INBOUND_LOT_SELECTION.NEW,
          new_lot_no: 'FORBIDDEN-MATERIAL-LOT',
          quantity: '2',
        },
        order,
        materialItem,
        []
      ),
    /已有材料批次/u
  )
})

test('outsourcing source request allowlists new lot only for return receipts', () => {
  const base = {
    customer_key: 'yoyoosun',
    fact_no: 'OUT-RR-001',
    outsourcing_order_id: 7,
    outsourcing_order_item_id: 12,
    warehouse_id: 3,
    quantity: '2',
    idempotency_key: 'test-test-test',
  }
  assert.deepEqual(
    normalizeOutsourcingSourceFactCreateRequest(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      { ...base, new_lot_no: ' OUT-RETURN-LOT-001 ' }
    ),
    { ...base, new_lot_no: 'OUT-RETURN-LOT-001' }
  )
  assert.throws(() =>
    normalizeOutsourcingSourceFactCreateRequest(
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      { ...base, lot_id: 4, new_lot_no: 'OUT-RETURN-LOT-001' }
    )
  )
  assert.throws(() =>
    normalizeOutsourcingSourceFactCreateRequest(
      OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
      {
        ...base,
        outsourcing_order_item_id: 11,
        new_lot_no: 'FORBIDDEN-MATERIAL-LOT',
      }
    )
  )
})

test('outsourcing source payload respects existing non-cancelled facts', () => {
  const facts = [
    {
      fact_type: 'MATERIAL_ISSUE',
      status: 'POSTED',
      source_id: 7,
      source_line_id: 11,
      quantity: '6',
    },
    {
      fact_type: 'MATERIAL_ISSUE',
      status: 'CANCELLED',
      source_id: 7,
      source_line_id: 11,
      quantity: '9',
    },
  ]
  assert.deepEqual(
    outsourcingSourceActionQuantitySummary(
      OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
      order,
      materialItem,
      facts
    ),
    { planned: '10', processed: '6', remaining: '4' }
  )
  assert.throws(
    () =>
      buildOutsourcingSourceFactPayload(
        OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
        {
          warehouse_id: 3,
          lot_selection: SOURCE_INBOUND_LOT_SELECTION.EXISTING,
          lot_id: 4,
          quantity: '5',
        },
        order,
        materialItem,
        facts
      ),
    /剩余数量/u
  )
})

test('outsourcing source result must echo the locked source and derived subject type', () => {
  const valid = {
    id: 91,
    status: 'DRAFT',
    fact_type: 'RETURN_RECEIPT',
    source_type: 'OUTSOURCING_ORDER',
    source_id: 7,
    source_line_id: 12,
    subject_type: 'PRODUCT',
    lot_id: 81,
    idempotency_key: 'test-test-test',
  }
  assert.equal(
    validateOutsourcingSourceFactResult(
      valid,
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      productItem
    ),
    valid
  )
  assert.throws(() =>
    validateOutsourcingSourceFactResult(
      { ...valid, subject_type: 'MATERIAL' },
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      productItem
    )
  )
  const skuItem = { ...productItem, product_sku_id: 9 }
  const skuResult = { ...valid, product_sku_id: 9 }
  assert.equal(
    validateOutsourcingSourceFactResult(
      skuResult,
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      skuItem
    ),
    skuResult
  )
  for (const productSkuID of [undefined, null, 10]) {
    assert.throws(() =>
      validateOutsourcingSourceFactResult(
        { ...valid, product_sku_id: productSkuID },
        OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
        order,
        skuItem
      )
    )
  }
  assert.throws(() =>
    validateOutsourcingSourceFactResult(
      skuResult,
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      productItem
    )
  )
  const transportOnlyProductItem = {
    id: productItem.id,
    subject_type: productItem.subject_type,
  }
  assert.equal(
    validateOutsourcingSourceFactResult(
      skuResult,
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      transportOnlyProductItem
    ),
    skuResult,
    'API transport validation must not invent a no-SKU expectation without source item context'
  )
  assert.throws(
    () =>
      validateOutsourcingSourceFactResult(
        {
          ...valid,
          fact_type: 'MATERIAL_ISSUE',
          subject_type: 'MATERIAL',
          product_sku_id: 9,
        },
        OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE,
        order,
        { id: materialItem.id, subject_type: materialItem.subject_type }
      ),
    /委外业务返回结果无法确认/u,
    'material issue must reject a product SKU even when transport context omits the field'
  )
  assert.equal(
    findOutsourcingSourceFactResult(
      [valid],
      {
        fact_no: 'OUT-RR-001',
        idempotency_key: 'test-test-test',
        new_lot_no: 'OUT-RETURN-LOT-001',
      },
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      productItem
    ),
    valid
  )
  assert.throws(() =>
    findOutsourcingSourceFactResult(
      [{ ...skuResult, product_sku_id: 10 }],
      {
        fact_no: 'OUT-RR-001',
        idempotency_key: 'test-test-test',
      },
      OUTSOURCING_SOURCE_ACTIONS.RETURN_RECEIPT,
      order,
      skuItem
    )
  )
})
