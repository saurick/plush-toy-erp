import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatMaterialQuantity,
  materialSummaryProducts,
  materialSummaryRows,
  materialSummaryTotals,
  materialStockQuantity,
  materialNoteFits,
} from './engineeringMaterialSummary.mjs'

test('summary preserves every source row and deduplicates its material notes', () => {
  const request = {
    items: [
      { material_id: 1, unit_id: 2, material_name: '布料' },
      {
        material_id: 3,
        unit_id: 2,
        material_name: '扣子',
        supplier_item_no: 'ITEM-Q',
      },
    ],
    sources: [
      {
        material_id: 3,
        unit_id: 2,
        sales_order_item_id: 4,
        product_name: '产品甲',
        material_note: '公扣母扣为一套',
      },
      {
        material_id: 3,
        unit_id: 2,
        sales_order_item_id: 4,
        product_name: '产品甲',
        material_note: '公扣母扣为一套',
      },
    ],
  }
  const rows = materialSummaryRows(request)
  assert.deepEqual(
    rows.map((row) => row.index),
    [0, 1]
  )
  assert.equal(rows[0].material_name, '布料')
  assert.deepEqual(rows[0].parts, [])
  assert.deepEqual(rows[1].material_notes, ['公扣母扣为一套'])
  assert.equal(rows[1].parts.length, 2)
  assert.equal(materialSummaryProducts(request.sources).length, 1)
  assert.deepEqual(materialSummaryRows({}), [])
})

test('quantities preserve null versus zero, precision and large exact decimal values', () => {
  assert.equal(formatMaterialQuantity(null), '—')
  assert.equal(formatMaterialQuantity(''), '—')
  assert.equal(formatMaterialQuantity('0'), '0')
  assert.equal(formatMaterialQuantity('23.999'), '24')
  assert.equal(
    formatMaterialQuantity('99999999999999.999999', true),
    '99,999,999,999,999.999999'
  )
  assert.equal(formatMaterialQuantity('12.100010', true), '12.10001')
})

test('totals preserve all demand and keep different units separate', () => {
  const items = [
    { unit_id: 1, unit_name: '码', required_quantity: '1.000001' },
    { unit_id: 1, unit_name: '码', required_quantity: '2.999999' },
    { unit_id: 2, unit_name: '套', required_quantity: '10' },
  ]
  const totals = materialSummaryTotals(items)
  assert.deepEqual(totals.units, [
    { id: 1, name: '码', quantity: '4' },
    { id: 2, name: '套', quantity: '10' },
  ])
})

test('inventory missing access and incompatible units never become zero stock', () => {
  const item = { material_id: 1, unit_id: 2 }
  assert.equal(materialStockQuantity({ status: 'FORBIDDEN' }, item), null)
  assert.equal(materialStockQuantity({ status: 'UNAVAILABLE' }, item), null)
  assert.equal(
    materialStockQuantity(
      {
        status: 'AVAILABLE',
        items: [{ material_id: 1, unit_id: 3, quantity: '9' }],
      },
      item
    ),
    null
  )
  assert.equal(
    materialStockQuantity({ status: 'AVAILABLE', items: [] }, item),
    '0'
  )
  assert.equal(
    materialStockQuantity(
      { status: 'AVAILABLE', items: [{ ...item, quantity: '9.25' }] },
      item
    ),
    '9.25'
  )
})

test('Chinese and ASCII notes match the source storage boundary', () => {
  assert.equal(materialNoteFits('注'.repeat(85)), true)
  assert.equal(materialNoteFits('注'.repeat(86)), false)
  assert.equal(materialNoteFits('a'.repeat(255)), true)
  assert.equal(materialNoteFits('a'.repeat(256)), false)
})
