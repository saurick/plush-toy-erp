import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./operationalFactPageConfig.mjs', import.meta.url)),
  'utf8'
)

function financeColumnKeys(factType) {
  const match = source.match(
    new RegExp(`${factType}: Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`)
  )
  assert.ok(match, `missing finance column projection for ${factType}`)
  return Array.from(match[1].matchAll(/'([^']+)'/gu), (item) => item[1])
}

test('finance pages project only fields that belong to their fact type', () => {
  assert.deepEqual(financeColumnKeys('RECEIVABLE'), [
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
    'collection_type',
    'payment_term',
  ])
  assert.deepEqual(financeColumnKeys('PAYABLE'), [
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
  ])
  assert.deepEqual(financeColumnKeys('INVOICE'), [
    'counterparty',
    'amount',
    'currency',
    'invoice_category',
  ])
  assert.deepEqual(financeColumnKeys('RECONCILIATION'), [
    'counterparty',
    'amount',
    'fee_amount',
    'currency',
  ])
  assert.match(source, /RECEIVABLE: '客户'/u)
  assert.match(source, /PAYABLE: '供应商'/u)
  assert.match(source, /INVOICE: '客户'/u)
  assert.doesNotMatch(
    source,
    /dataIndex:\s*'(?:source_type|source_id|source_line_id|idempotency_key)'/u
  )
})

test('finance settlement actions match current business semantics', () => {
  const match = source.match(
    /const FINANCE_SETTLEMENT_ACTIONS = Object\.freeze\(\{([\s\S]*?)\n\}\)/u
  )
  assert.ok(match, 'missing finance settlement action map')
  const actionSource = match[1]

  assert.match(actionSource, /RECONCILIATION/u)
  assert.match(actionSource, /label: '完成核对'/u)
  assert.doesNotMatch(actionSource, /RECEIVABLE|PAYABLE|INVOICE|PAYMENT/u)
})

test('operational fact view config does not advertise a generic create form', () => {
  for (const deadConfig of [
    'createLabel',
    'createPrefix',
    'draftNumberField',
    'draftNumberPrefix',
    'hideCreateAction',
    'buildParams',
    'initialValues',
  ]) {
    assert.doesNotMatch(source, new RegExp(`\\b${deadConfig}\\b`))
  }
  assert.doesNotMatch(
    source,
    /create(?:Production|Outsourcing|StockReservation|Finance)Fact/u
  )
  assert.match(source, /postFinanceFact/u)
  assert.match(source, /businessSourceRouteFor/u)
  assert.match(source, /buildOperationalFactRelatedMenuItems/u)
})

test('outsourcing fact list, post and cancel use their exact permissions', () => {
  assert.match(
    source,
    /outsourcing:[\s\S]*readPermissions: ACTION_PERMISSIONS\.outsourcingRead[\s\S]*postPermissions: ACTION_PERMISSIONS\.outsourcingPost[\s\S]*cancelPermissions: ACTION_PERMISSIONS\.outsourcingCancel/u
  )
  assert.doesNotMatch(source, /ACTION_PERMISSIONS\.outsourcingWrite/u)
})

test('quantity and finance decimal columns sort, display and export exactly', () => {
  assert.match(source, /compareOperationalFactDecimalValues/u)
  for (const field of ['quantity', 'amount', 'fee_amount']) {
    assert.match(
      source,
      new RegExp(
        `sorter: \\(left, right\\) =>[\\s\\S]{0,140}compareOperationalFactDecimalValues\\([\\s\\S]{0,100}left\\?\\.${field},[\\s\\S]{0,80}right\\?\\.${field}`,
        'u'
      )
    )
    assert.match(
      source,
      new RegExp(
        `exportValue: \\(record\\) => formatQuantity\\(record\\?\\.${field}\\)`,
        'u'
      )
    )
  }
  assert.doesNotMatch(source, /decimalNumber/u)
})

test('stock reservation columns display readable references without exposing technical ids', () => {
  const start = source.indexOf('    reservations: [')
  const end = source.indexOf('    finance: financeColumns', start)
  assert.ok(start >= 0 && end > start, 'missing stock reservation columns')
  const reservationColumns = source.slice(start, end)

  for (const title of [
    '销售订单',
    '来源行',
    '产品 / 规格',
    '仓库 / 批次',
    '预留数量',
    '单位',
    '预留日期',
    '备注',
  ]) {
    assert.match(reservationColumns, new RegExp(`title: '${title}'`, 'u'))
  }
  for (const projection of [
    'reservationSalesOrderText',
    'reservationSalesOrderLineText',
    'reservationProductText',
    'reservationWarehouseLotText',
    'reservationUnitText',
  ]) {
    assert.match(reservationColumns, new RegExp(projection, 'u'))
  }
  assert.doesNotMatch(
    reservationColumns,
    /dataIndex:\s*'(?:sales_order_id|sales_order_item_id|product_id|product_sku_id|warehouse_id|unit_id|lot_id)'/u
  )
  assert.doesNotMatch(
    reservationColumns,
    /\.\.\.sourceColumns|\.\.\.quantityColumns/u
  )
  assert.match(source, /record\.sales_order_no/u)
  assert.match(source, /record\.product_sku_code/u)
  assert.match(source, /record\.warehouse_name/u)
  assert.match(source, /record\.lot_no/u)
})
