import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSalesOrderWorkbook,
  salesOrderFixtureRows,
} from '../../../scripts/style-l1/salesOrderImportWorkbookFixture.mjs'
import {
  parseSalesOrderXlsx,
  buildSalesOrderImportDraft,
} from './salesOrderXlsxImport.mjs'
import { MAX_XLSX_FILE_BYTES } from './xlsxWorkbook.mjs'
import { buildSalesOrderItemParams } from './sourceOrderParams.mjs'

const customers = [
  { id: 1, code: 'CUS-STYLE-L1', name: '模拟客户', is_active: true },
]
const units = [
  { id: 1, code: 'PCS', name: '个', is_active: true },
  { id: 2, name: '套', is_active: true },
]
const parseRows = (rows, options = {}) =>
  parseSalesOrderXlsx(
    createSalesOrderWorkbook({ sheets: [{ name: '订单', rows }], ...options })
  )

test('groups summary rows into orders, keeps original references and excludes auxiliary facts/instructions', async () => {
  const result = await parseSalesOrderXlsx(
    createSalesOrderWorkbook({ prefixed: true })
  )
  assert.equal(result.lineCount, 3)
  assert.equal(result.orders.length, 2)
  assert.deepEqual(result.ignoredSheets, ['辅助来货表'])
  assert.deepEqual(result.ignoredColumns, [])
  const [first, second] = result.orders
  assert.equal(first.lines[0].item.customer_product_no, '00128')
  assert.equal(first.lines[0].item.ordered_quantity, '1000')
  assert.equal(first.lines[0].item.pre_shipment_sample_quantity, '12')
  assert.equal(second.lines[1].item.unit_price, '26.4')
  assert.equal(second.lines[1].item.order_category, 'REPEAT')
  assert.equal(second.lines[1].item.note, '共享备注')
  assert.equal(first.lines[0].item.planned_delivery_date, '2026-05-16')
  assert.equal(first.lines[0].item.product_id, undefined)
  assert.equal(first.lines[0].item.product_sku_id, undefined)
  assert.equal(first.lines[0].item.designer, undefined)
  assert.equal(first.lines[0].item.unshipped_quantity, undefined)
  assert.equal(first.lines[0].item.import_source.row_number, 3)
  assert.equal(
    first.lines[0].item.import_source.cells.find(
      (cell) => cell.label === '设计师'
    ).value,
    '设计师甲'
  )
  assert.match(first.lines[0].item.import_source.file_sha256, /^[0-9a-f]{64}$/u)
  const draft = buildSalesOrderImportDraft(second, {
    customers,
    units,
    defaultUnitID: 1,
  })
  assert.equal(draft.values.customer_id, 1)
  assert.equal(draft.values.currency, undefined)
  assert.equal(draft.values.planned_delivery_date, '')
  assert.deepEqual(
    draft.values.items.map((item) => item.unit_id),
    [1, 1]
  )
  const params = buildSalesOrderItemParams(draft.values.items[0])
  assert.equal(params.amount, '37800.00')
  assert.equal(params.ordered_quantity, '1800')
  assert.equal(params.product_id, undefined)
})

test('resolves embedded DISPIMG images by relationship without executing formulas or fetching external targets', async () => {
  const rows = salesOrderFixtureRows()
  rows[2][12] = '=DISPIMG("IMG-ONE",1)'
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0VEAAAAASUVORK5CYII=',
    'base64'
  )
  const options = {
    sheets: [{ name: '订单', rows }],
    cellImages: [{ id: 'IMG-ONE', bytes }],
  }
  const result = await parseSalesOrderXlsx(createSalesOrderWorkbook(options))
  const line = result.orders[0].lines[0]
  assert.deepEqual(line.images[0].bytes, new Uint8Array(bytes))
  assert.equal(line.item.import_source.image_files[0], line.images[0].fileName)
  const external = await parseSalesOrderXlsx(
    createSalesOrderWorkbook({
      ...options,
      cellImages: [
        {
          id: 'IMG-ONE',
          bytes,
          external: true,
          target: 'https://example.invalid/picture.png',
        },
      ],
    })
  )
  assert.equal(external.orders[0].lines[0].images.length, 0)
  await assert.rejects(
    parseSalesOrderXlsx(
      createSalesOrderWorkbook({
        ...options,
        cellImages: [{ id: 'IMG-ONE', bytes, target: '../../private.png' }],
      })
    ),
    /路径越界/u
  )
  const draft = buildSalesOrderImportDraft(result.orders[0], {
    units,
    customers,
    defaultUnitID: 1,
    defaultCurrency: 'USD',
  })
  assert.equal(draft.values.currency, 'USD')
  assert.equal(draft.images.length, 1)
  assert.deepEqual(
    buildSalesOrderItemParams(draft.values.items[0]).import_source,
    line.item.import_source
  )
})

test('matches only unique active customer and unit records and never replaces an explicit unrecognized unit', async () => {
  const result = await parseSalesOrderXlsx(createSalesOrderWorkbook())
  const order = result.orders[0]
  let draft = buildSalesOrderImportDraft(order, { customers, units })
  assert.equal(draft.review.missingUnitCount, 1)
  assert.equal(draft.values.items[0].unit_id, undefined)
  draft = buildSalesOrderImportDraft(order, {
    customers: [...customers, { id: 2, name: 'CUS-STYLE-L1' }],
    units,
    defaultUnitID: 1,
  })
  assert.equal(draft.values.customer_id, undefined)
  draft = buildSalesOrderImportDraft(order, {
    customers: [{ ...customers[0], is_active: false }],
    units,
    defaultUnitID: 3,
  })
  assert.equal(draft.values.customer_id, undefined)
  assert.equal(draft.values.items[0].unit_id, undefined)
  order.lines[0].unit = '不存在'
  draft = buildSalesOrderImportDraft(order, {
    customers,
    units,
    defaultUnitID: 1,
  })
  assert.equal(draft.values.items[0].unit_id, undefined)
  order.lines[0].unit = '套'
  draft = buildSalesOrderImportDraft(order, {
    customers,
    units,
    defaultUnitID: 1,
  })
  assert.equal(draft.values.items[0].unit_id, 2)
  draft = buildSalesOrderImportDraft(order, {
    customers,
    units: [...units, { id: 3, name: '套' }],
    defaultUnitID: 1,
  })
  assert.equal(draft.values.items[0].unit_id, undefined)
})

test('only explicit merged cells carry source values; header conflicts and orphan details fail closed', async () => {
  const rows = salesOrderFixtureRows()
  rows[4][2] = null
  await assert.rejects(parseRows(rows), /第 5 行缺少订单编号/u)
  const merged = await parseRows(rows, {
    sheets: [{ name: '订单', rows, merges: ['C4:C5'] }],
  })
  assert.equal(merged.orders[1].lines.length, 2)
  rows[4][2] = 'SO-IMPORT-002'
  for (const [column, value] of [
    [0, '2026-04-11'],
    [1, '不同客户'],
    [3, '另一个PO'],
    [11, '不同业务员'],
    [19, 'USD'],
  ]) {
    const conflicting = structuredClone(rows)
    conflicting[3][column] =
      column === 19 ? 'CNY' : conflicting[3][column] || '原值'
    conflicting[4][column] = value
    await assert.rejects(
      parseRows(conflicting),
      (error) => error.code === 'conflicting_order_header'
    )
  }
})

test('validates source numbers without rounding business precision, negative quantities or formula failures', async () => {
  for (const value of [
    '1,5',
    -1,
    0,
    '1.1234567',
    { formula: 'A1+1' },
    { type: 'e', value: '#VALUE!' },
    { type: 'b', value: '1' },
  ]) {
    const rows = salesOrderFixtureRows()
    rows[2][6] = value
    await assert.rejects(parseRows(rows), /订单数量/u)
  }
  const rows = salesOrderFixtureRows()
  rows[2][6] = '1,000'
  rows[2][7] = 0
  rows[2][8] = 999
  rows[2][14] = { formula: '10+5.8', value: 15.8 }
  const parsed = await parseRows(rows)
  assert.equal(parsed.orders[0].lines[0].item.unit_price, '15.8')
  assert.equal(parsed.orders[0].lines[0].item.pre_shipment_sample_quantity, '0')
  assert.equal(parsed.orders[0].warnings.filter((warning) => warning.includes('原生产数量')).length, 1)
  for (const value of [{ type: 'e', value: '#REF!' }, { formula: 'A1' }]) {
    const invalid = salesOrderFixtureRows()
    invalid[2][5] = value
    await assert.rejects(parseRows(invalid), /产品名称.*公式结果/u)
  }
})

test('reads Excel 1900/1904 and full calendar dates, rejecting impossible or yearless dates', async () => {
  for (const [value, date1904, expected] of [
    [1, false, '1900-01-01'],
    [61, false, '1900-03-01'],
    [0, true, '1904-01-01'],
    ['2024年2月29日', false, '2024-02-29'],
  ]) {
    const rows = salesOrderFixtureRows()
    rows[2][0] = value
    assert.equal(
      (await parseRows(rows, { date1904 })).orders[0].order_date,
      expected
    )
  }
  for (const value of [
    60,
    '2026-02-29',
    '2026-13-01',
    '9月1日',
    { formula: 'TODAY()' },
  ]) {
    const rows = salesOrderFixtureRows()
    rows[2][0] = value
    await assert.rejects(parseRows(rows), /下单日期/u)
  }
  const rows = salesOrderFixtureRows()
  rows[2][9] = '2026-01-01'
  await assert.rejects(parseRows(rows), /早于下单日期/u)
})

test('rejects invalid formats, damaged archives, excessive input and ambiguous headers', async () => {
  await assert.rejects(
    parseSalesOrderXlsx(new Uint8Array(), { fileName: 'source.numbers' }),
    /Numbers/u
  )
  await assert.rejects(
    parseSalesOrderXlsx(new Uint8Array([1, 2, 3])),
    /xlsx|Excel/u
  )
  await assert.rejects(
    parseSalesOrderXlsx(new Uint8Array(MAX_XLSX_FILE_BYTES + 1)),
    (error) => error.code === 'file_too_large'
  )
  const rows = salesOrderFixtureRows()
  rows[1].push('订单号')
  await assert.rejects(
    parseRows(rows),
    (error) => error.code === 'duplicate_headers'
  )
  await assert.rejects(
    parseRows([
      ['产品名称', '数量'],
      ['辅助产品', 1],
    ]),
    (error) => error.code === 'empty_order_rows'
  )
  const many = salesOrderFixtureRows().slice(0, 2)
  for (let i = 0; i < 1001; i += 1) many.push(salesOrderFixtureRows()[2])
  await assert.rejects(
    parseRows(many),
    (error) => error.code === 'too_many_order_lines'
  )
})
