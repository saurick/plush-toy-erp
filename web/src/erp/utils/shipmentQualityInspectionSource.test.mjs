import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildShipmentQualityInspectionPayload,
  buildShipmentQualityInspectionSources,
  isMatchingShipmentQualityInspectionDraft,
  requireMatchingShipmentQualityInspectionDraft,
} from './shipmentQualityInspectionSource.mjs'

const inventoryLots = [
  {
    id: 501,
    subject_type: 'PRODUCT',
    subject_id: 11,
    product_sku_id: 101,
    lot_no: 'FG-LOT-501',
    status: 'ACTIVE',
  },
  {
    id: 502,
    subject_type: 'PRODUCT',
    subject_id: 11,
    product_sku_id: null,
    lot_no: 'FG-LOT-502',
    status: 'HOLD',
  },
]

const shipment = {
  id: 41,
  shipment_no: 'SHIP-20260717-001',
  status: 'DRAFT',
  items: [
    {
      id: 1,
      product_id: 11,
      product_sku_id: 101,
      warehouse_id: 7,
      lot_id: 501,
      unit_id: 3,
      quantity: '0.1',
    },
    {
      id: 2,
      product_id: 11,
      product_sku_id: 101,
      warehouse_id: 7,
      lot_id: 501,
      unit_id: 3,
      quantity: '0.2',
    },
    {
      id: 3,
      product_id: 11,
      product_sku_id: null,
      warehouse_id: 7,
      lot_id: 502,
      unit_id: 3,
      quantity: '2.500000',
    },
  ],
}

test('shipment quality sources aggregate duplicate source grain exactly', () => {
  const sources = buildShipmentQualityInspectionSources({
    shipment,
    inventoryLots,
  })

  assert.equal(sources.length, 2)
  assert.deepEqual(
    sources.map((source) => ({
      productID: source.productID,
      productSkuID: source.productSkuID,
      warehouseID: source.warehouseID,
      lotID: source.lotID,
      quantity: source.quantity,
      lineCount: source.lineCount,
      existingInspection: source.existingInspection,
      unavailableReason: source.unavailableReason,
    })),
    [
      {
        productID: 11,
        productSkuID: 101,
        warehouseID: 7,
        lotID: 501,
        quantity: '0.3',
        lineCount: 2,
        existingInspection: null,
        unavailableReason: '',
      },
      {
        productID: 11,
        productSkuID: null,
        warehouseID: 7,
        lotID: 502,
        quantity: '2.5',
        lineCount: 1,
        existingInspection: null,
        unavailableReason: '',
      },
    ]
  )
  assert.equal(Object.isFrozen(sources[0]), true)
  assert.notEqual(sources[0].sourceKey, sources[1].sourceKey)
})

test('shipment quality sources block matching active inspections but not cancelled ones', () => {
  const activeInspection = {
    id: 801,
    source_type: 'SHIPMENT',
    source_id: 41,
    inspection_type: 'FINISHED_GOODS',
    subject_type: 'PRODUCT',
    subject_id: 11,
    warehouse_id: 7,
    inventory_lot_id: 501,
    status: 'DRAFT',
  }
  const sourceShipment = { ...shipment, items: shipment.items.slice(0, 2) }
  const [blocked] = buildShipmentQualityInspectionSources({
    shipment: sourceShipment,
    inventoryLots,
    qualityInspections: [
      { ...activeInspection, id: 800, status: 'CANCELLED' },
      activeInspection,
    ],
  })

  assert.equal(blocked.existingInspection, activeInspection)
  assert.equal(blocked.unavailableReason, '该送检批次已有未取消的成品检验')

  const [available] = buildShipmentQualityInspectionSources({
    shipment: sourceShipment,
    inventoryLots,
    qualityInspections: [{ ...activeInspection, status: 'CANCELLED' }],
  })
  assert.equal(available.existingInspection, null)
  assert.equal(available.unavailableReason, '')

  for (const mismatch of [
    { source_type: 'PURCHASE_RECEIPT' },
    { source_id: 42 },
    { inspection_type: 'INCOMING' },
    { subject_type: 'MATERIAL' },
    { subject_id: 12 },
    { warehouse_id: 8 },
    { inventory_lot_id: 502 },
  ]) {
    const [mismatchedSource] = buildShipmentQualityInspectionSources({
      shipment: sourceShipment,
      inventoryLots,
      qualityInspections: [{ ...activeInspection, ...mismatch }],
    })
    assert.equal(
      mismatchedSource.existingInspection,
      null,
      JSON.stringify(mismatch)
    )
    assert.equal(
      mismatchedSource.unavailableReason,
      '',
      JSON.stringify(mismatch)
    )
  }
})

test('shipment quality sources explain unavailable business states', () => {
  const cases = [
    {
      name: 'shipment not draft',
      shipment: { ...shipment, status: 'SHIPPED' },
      lots: inventoryLots,
      reason: '只有待出货草稿可以发起成品检验',
    },
    {
      name: 'missing product',
      shipment: {
        ...shipment,
        items: [{ ...shipment.items[0], product_id: null }],
      },
      lots: inventoryLots,
      reason: '出货明细缺少产品',
    },
    {
      name: 'missing warehouse',
      shipment: {
        ...shipment,
        items: [{ ...shipment.items[0], warehouse_id: null }],
      },
      lots: inventoryLots,
      reason: '出货明细缺少仓库',
    },
    {
      name: 'missing lot',
      shipment: {
        ...shipment,
        items: [{ ...shipment.items[0], lot_id: null }],
      },
      lots: inventoryLots,
      reason: '出货明细缺少成品批次',
    },
    {
      name: 'missing lot reference',
      shipment,
      lots: [],
      reason: '批次资料尚未加载',
    },
    {
      name: 'material lot',
      shipment,
      lots: [{ ...inventoryLots[0], subject_type: 'MATERIAL' }],
      reason: '所选批次不是成品批次',
    },
    {
      name: 'product mismatch',
      shipment,
      lots: [{ ...inventoryLots[0], subject_id: 99 }],
      reason: '所选批次与出货产品不一致',
    },
    {
      name: 'sku mismatch',
      shipment,
      lots: [{ ...inventoryLots[0], product_sku_id: 999 }],
      reason: '所选批次与产品规格不一致',
    },
    {
      name: 'disabled lot',
      shipment,
      lots: [{ ...inventoryLots[0], status: 'DISABLED' }],
      reason: '该成品批次已停用',
    },
    {
      name: 'rejected lot',
      shipment,
      lots: [{ ...inventoryLots[0], status: 'REJECTED' }],
      reason: '该成品批次已判定不合格',
    },
    {
      name: 'invalid quantity',
      shipment: {
        ...shipment,
        items: [{ ...shipment.items[0], quantity: '0' }],
      },
      lots: inventoryLots,
      reason: '出货数量必须大于 0',
    },
    {
      name: 'mixed units in one grain',
      shipment: {
        ...shipment,
        items: [shipment.items[0], { ...shipment.items[1], unit_id: 4 }],
      },
      lots: inventoryLots,
      reason: '同一送检批次的出货单位不一致',
    },
  ]

  for (const item of cases) {
    const sources = buildShipmentQualityInspectionSources({
      shipment: item.shipment,
      inventoryLots: item.lots,
    })
    assert.equal(sources.length > 0, true, item.name)
    assert.match(sources[0].unavailableReason, new RegExp(item.reason, 'u'))
  }
})

test('shipment quality payload uses only canonical finished-goods fields', () => {
  const [source] = buildShipmentQualityInspectionSources({
    shipment: { ...shipment, items: shipment.items.slice(0, 2) },
    inventoryLots,
  })
  const payload = buildShipmentQualityInspectionPayload(
    {
      inspection_no: '  QI-FG-20260717-001  ',
      note: '  出货前抽检  ',
    },
    shipment,
    source,
    '  yoyoosun  '
  )

  assert.deepEqual(payload, {
    customer_key: 'yoyoosun',
    inspection_no: 'QI-FG-20260717-001',
    shipment_id: 41,
    finished_goods_lot_id: 501,
    product_id: 11,
    warehouse_id: 7,
    decision_note: '出货前抽检',
  })
  for (const forbidden of [
    'source_type',
    'source_id',
    'subject_type',
    'subject_id',
    'product_sku_id',
    'inventory_lot_id',
    'idempotency_key',
  ]) {
    assert.equal(Object.hasOwn(payload, forbidden), false, forbidden)
  }
})

test('shipment quality payload rejects stale or unavailable source selections', () => {
  const [source] = buildShipmentQualityInspectionSources({
    shipment: { ...shipment, items: shipment.items.slice(0, 1) },
    inventoryLots,
  })

  assert.throws(
    () =>
      buildShipmentQualityInspectionPayload(
        { inspection_no: 'QI-FG-001' },
        { ...shipment, status: 'SHIPPED' },
        source
      ),
    /只有待出货草稿/u
  )
  assert.throws(
    () =>
      buildShipmentQualityInspectionPayload(
        { inspection_no: 'QI-FG-001' },
        shipment,
        { ...source, lotID: 999 }
      ),
    /请选择可送检的成品批次/u
  )
  assert.throws(
    () =>
      buildShipmentQualityInspectionPayload(
        { inspection_no: ' ' },
        shipment,
        source
      ),
    /请填写检验单号/u
  )
})

test('shipment quality response validation requires exact source anchors', () => {
  const [source] = buildShipmentQualityInspectionSources({
    shipment: { ...shipment, items: shipment.items.slice(0, 1) },
    inventoryLots,
  })
  const inspection = {
    id: 801,
    inspection_no: 'QI-FG-801',
    inventory_lot_id: 501,
    warehouse_id: 7,
    source_type: 'SHIPMENT',
    source_id: 41,
    inspection_type: 'FINISHED_GOODS',
    subject_type: 'PRODUCT',
    subject_id: 11,
    purchase_receipt_id: null,
    purchase_receipt_item_id: null,
    material_id: null,
    status: 'DRAFT',
  }

  assert.equal(
    isMatchingShipmentQualityInspectionDraft(
      inspection,
      shipment,
      source,
      'QI-FG-801'
    ),
    true
  )
  assert.equal(
    requireMatchingShipmentQualityInspectionDraft(
      inspection,
      shipment,
      source,
      'QI-FG-801'
    ),
    inspection
  )
  assert.equal(
    isMatchingShipmentQualityInspectionDraft(
      {
        ...inspection,
        source_id: 0,
        subject_id: 0,
        warehouse_id: 0,
        inventory_lot_id: 0,
      },
      {},
      {},
      'QI-FG-801'
    ),
    false
  )

  for (const changed of [
    { source_id: 42 },
    { source_type: 'PURCHASE_RECEIPT' },
    { inspection_type: 'INCOMING' },
    { subject_type: 'MATERIAL' },
    { subject_id: 12 },
    { warehouse_id: 8 },
    { inventory_lot_id: 502 },
    { status: 'SUBMITTED' },
    { inspection_no: 'QI-FG-OTHER' },
    { purchase_receipt_id: 1 },
  ]) {
    assert.equal(
      isMatchingShipmentQualityInspectionDraft(
        { ...inspection, ...changed },
        shipment,
        source,
        'QI-FG-801'
      ),
      false,
      JSON.stringify(changed)
    )
  }
  assert.throws(
    () =>
      requireMatchingShipmentQualityInspectionDraft(
        { ...inspection, source_id: 42 },
        shipment,
        source
      ),
    /与所选出货批次不一致/u
  )
})
