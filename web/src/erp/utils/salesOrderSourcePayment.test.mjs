import assert from 'node:assert/strict'
import test from 'node:test'
import { createSalesOrderWorkbook } from '../../../scripts/style-l1/salesOrderImportWorkbookFixture.mjs'
import { parseSalesOrderXlsx } from './salesOrderXlsxImport.mjs'
import { salesOrderSourcePayment } from './salesOrderSourcePayment.mjs'

async function importedItems() {
  const result = await parseSalesOrderXlsx(
    createSalesOrderWorkbook({ paymentRecords: true })
  )
  return result.orders.map((order) => order.lines.map((line) => line.item))
}

test('projects original payment marks and goods amounts without filling blank payment marks', async () => {
  const orders = await importedItems()
  const first = salesOrderSourcePayment(orders[0])
  assert.deepEqual(first.rows[0].amounts, ['15800'])
  assert.deepEqual(first.rows[0].deposit, ['定金已付'])
  assert.deepEqual(first.rows[0].balance, ['尾款已付'])
  const second = salesOrderSourcePayment(orders[1])
  assert.deepEqual(
    second.rows.map((row) => row.amounts),
    [['37800'], ['73920']]
  )
  assert.deepEqual(
    second.rows.map((row) => row.balance),
    [[], []]
  )
  assert.equal(second.notes.length, 2)
  assert.deepEqual(second.notes[0].locations, [
    '订单汇总 · V4:V5（合并单元格）',
  ])
  assert.equal(second.notes[0].text, '收5000定金')
  assert.equal(second.notes[1].text, '定金加尾款请款单')
  assert.deepEqual(second.notes[1].locations, ['订单汇总 · Y5'])
  assert.deepEqual(
    orders[1][1].import_source.cells.find((cell) => cell.column === 22)
      .merged_rows,
    [4, 5]
  )
  assert.equal(
    orders[1][1].import_source.cells.find((cell) => cell.column === 21)
      .merged_rows,
    undefined
  )
})

test('does not turn discounted prices or unrelated cells into paid amounts', async () => {
  const [[item]] = await importedItems()
  const { cells } = item.import_source
  cells.find((cell) => cell.column === 21).value = '9.85'
  cells.find((cell) => cell.column === 23).value = '500'
  cells.find((cell) => cell.column === 24).value = ''
  cells.find((cell) => cell.label === '产品名称').value = '定金已付'
  cells.find((cell) => cell.label === '产品编号').value = '15800'
  assert.deepEqual(salesOrderSourcePayment([item]), { rows: [], notes: [] })
  cells.push({ column: 25, label: '定金金额', value: '500' })
  const result = salesOrderSourcePayment([item])
  assert.deepEqual(result.rows[0].amounts, [])
  assert.deepEqual(result.rows[0].deposit, [])
  assert.equal(result.notes[0].text, '定金金额：500')
})

test('uses explicit source labels for amounts and preserves explicit unpaid states', async () => {
  const [[item]] = await importedItems()
  const { cells } = item.import_source
  Object.assign(
    cells.find((cell) => cell.column === 21),
    { label: '订金状态', value: '未付' }
  )
  Object.assign(
    cells.find((cell) => cell.column === 23),
    { label: '货款金额', value: '15801' }
  )
  Object.assign(
    cells.find((cell) => cell.column === 24),
    { label: '尾款状态', value: '部分已收' }
  )
  const result = salesOrderSourcePayment([item])
  assert.deepEqual(result.rows[0].deposit, ['未付'])
  assert.deepEqual(result.rows[0].balance, ['部分已收'])
  assert.deepEqual(result.rows[0].amounts, ['15801'])
})

test('edited or duplicated lines never change or repeat original payment evidence', async () => {
  const [, items] = await importedItems()
  const before = structuredClone(items)
  const expected = salesOrderSourcePayment(items)
  assert.deepEqual(items, before)
  items[0].ordered_quantity = '1'
  items[0].unit_price = '2'
  items[0].requested_product_name = '修改后的产品'
  items.push(structuredClone(items[0]))
  assert.deepEqual(salesOrderSourcePayment(items), expected)
  assert.deepEqual(salesOrderSourcePayment([]), { rows: [], notes: [] })
  assert.deepEqual(
    salesOrderSourcePayment([{ ordered_quantity: '100', unit_price: '10' }]),
    { rows: [], notes: [] }
  )
})

test('identical notes in separate cells retain each location without inventing a shared payment', async () => {
  const [, items] = await importedItems()
  for (const item of items) {
    delete item.import_source.cells.find((cell) => cell.column === 22)
      .merged_rows
  }
  const result = salesOrderSourcePayment(items)
  assert.equal(result.notes[0].text, '收5000定金')
  assert.deepEqual(result.notes[0].locations, [
    '订单汇总 · V4',
    '订单汇总 · V5',
  ])
})
