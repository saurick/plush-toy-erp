import assert from 'node:assert/strict'
import test from 'node:test'
import {
  progressFixtureData,
  progressFixtureRow,
} from '../../../scripts/style-l1/businessProgressFixtures.mjs'
import {
  requireProgressBoard,
  requireProgressDetail,
  progressQueryFromURL,
  progressDelivery,
  progressStatusLabel,
  progressSourcePath,
} from './businessProgress.mjs'

test('progress responses reject missing, malformed and duplicate records instead of showing zero', () => {
  const valid = progressFixtureData()
  assert.equal(requireProgressBoard(valid), valid)
  for (const invalid of [
    null,
    {},
    { ...valid, rows: [valid.rows[0], valid.rows[0]] },
    { ...valid, total: -1 },
    { ...valid, access: { sales: true } },
    { ...valid, rows: [{ ...valid.rows[0], product_id: undefined }] },
    { ...valid, rows: [{ ...valid.rows[0], shipped_quantity: undefined }] },
    { ...valid, rows: [{ ...valid.rows[0], delivery_known: false }] },
  ]) {
    assert.throws(() => requireProgressBoard(invalid), /进度数据暂不可用/)
  }
  const detail = progressFixtureData({ id: 1 }, { detail: true })
  assert.equal(requireProgressDetail(detail), detail)
  assert.throws(() =>
    requireProgressDetail({ ...detail, sections: { tasks: [{}] } })
  )
  assert.throws(() =>
    requireProgressDetail({ ...detail, sections: { secret: [] } })
  )
})
test('quantities use facts, preserve mixed units and never equate closure to completion', () => {
  const row = progressFixtureRow()
  assert.deepEqual(progressDelivery(row), {
    label: '已出货 / 订购',
    text: '400 / 800 只',
    percent: 50,
    complete: false,
  })
  assert.equal(
    progressDelivery({ ...row, delivery_known: false, shipped_quantity: null })
      .text,
    '关联待核对'
  )
  assert.equal(
    progressDelivery({ ...row, ordered_quantity: null, shipped_quantity: null })
      .percent,
    undefined
  )
  assert.equal(
    progressDelivery({ ...row, status: 'closed', shipped_quantity: '0' })
      .percent,
    0
  )
  assert.equal(progressStatusLabel('CLOSED'), '已关闭')
  const production = progressFixtureRow(0, 'production')
  assert.equal(
    progressDelivery({
      ...production,
      completed_quantity: '2',
      ordered_quantity: '10',
    }).percent,
    20
  )
  assert.equal(
    progressDelivery({ ...production, completed_quantity: null }).percent,
    undefined
  )
  assert.equal(
    progressDelivery({ ...row, shipped_quantity: '1000' }).percent,
    100
  )
})
test('URL state preserves filters while bounding paging and ignoring unsupported enums', () => {
  const q = progressQueryFromURL(
    new URLSearchParams(
      'view=production&q=熊&owner=小陈&risk=blocked&scope=all&page=2&from=2026-09-24'
    )
  )
  assert.equal(q.view, 'production')
  assert.equal(q.offset, 20)
  assert.equal(q.keyword, '熊')
  assert.equal(q.owner, '小陈')
  assert.equal(q.date_from, '2026-09-24')
  const bad = progressQueryFromURL(
    new URLSearchParams('view=evil&risk=other&scope=x&page=-2&from=x')
  )
  assert.equal(bad.view, '')
  assert.equal(bad.risk, 'all')
  assert.equal(bad.scope, 'active')
  assert.equal(bad.offset, 0)
  assert.equal(bad.date_from, '')
})
test('source links identify the source record and keep task codes encoded', () => {
  assert.equal(
    progressSourcePath({ kind: 'batch', id: 8, parent_id: 4 }),
    '/erp/production/orders?production_order_id=4&wip_batch_id=8'
  )
  assert.equal(
    progressSourcePath({ kind: 'sales_line', id: 8, parent_id: 4 }),
    '/erp/sales/project-orders/sales-orders?sales_order_id=4'
  )
  assert.equal(
    progressSourcePath({ kind: 'task', number: 'TASK + 1' }),
    '/erp/task-board?q=TASK%20%2B%201&status=all'
  )
})
