import assert from 'node:assert/strict'
import test from 'node:test'
import {
  formatMaterialQuantity,
  materialSummaryProducts,
  materialSummaryRows,
  materialSummaryTotals,
  materialStockQuantity,
  materialFinanceIssue,
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

test('totals separate units and show partial pricing without interpreting blanks as zero', () => {
  const items = [
    { unit_id: 1, unit_name: '码', required_quantity: '1.000001' },
    { unit_id: 1, unit_name: '码', required_quantity: '2.999999' },
    { unit_id: 2, unit_name: '套', required_quantity: '10' },
  ]
  const totals = materialSummaryTotals(items, [
    { purchase_quantity: '3.333333', unit_price: '0.333333' },
    { purchase_quantity: '2', unit_price: '' },
    { purchase_quantity: '0', unit_price: '0' },
  ])
  assert.deepEqual(totals.units, [
    { id: 1, name: '码', quantity: '4' },
    { id: 2, name: '套', quantity: '10' },
  ])
  assert.equal(totals.amount, '1.11111')
  assert.equal(totals.priced, 2)
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

test('finance validates all source rows, dates, adjusted quantities and amount limits', () => {
  const items = [{ required_quantity: '2' }, { required_quantity: '5' }]
  const complete = {
    purchase_quantity: '2',
    unit_price: '10',
    expected_arrival_date: '2026-10-01',
    note: '',
  }
  assert.equal(materialFinanceIssue(items, [complete])?.index, 1)
  assert.equal(
    materialFinanceIssue(items, [
      complete,
      { ...complete, purchase_quantity: '5' },
    ]),
    null
  )
  assert.equal(
    materialFinanceIssue(items, [complete, { ...complete, note: '' }])?.field,
    'note'
  )
  assert.equal(
    materialFinanceIssue(items, [
      { ...complete, expected_arrival_date: '2026-02-30' },
    ])?.field,
    'expected_arrival_date'
  )
  assert.equal(
    materialFinanceIssue(items, [{ ...complete, unit_price: '99999999999999' }])
      ?.field,
    'unit_price'
  )
  assert.equal(
    materialFinanceIssue(
      [{ required_quantity: '0' }],
      [{ ...complete, purchase_quantity: '0', unit_price: '0' }]
    ),
    null
  )
})

test('Chinese and ASCII notes match the source storage boundary', () => {
  assert.equal(materialNoteFits('注'.repeat(85)), true)
  assert.equal(materialNoteFits('注'.repeat(86)), false)
  assert.equal(materialNoteFits('a'.repeat(255)), true)
  assert.equal(materialNoteFits('a'.repeat(256)), false)
})
