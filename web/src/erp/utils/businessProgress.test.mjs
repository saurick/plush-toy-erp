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
  progressStages,
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
  for (const pageSize of [8, 20, 50]) {
    const paged = progressQueryFromURL(
      new URLSearchParams(`page=2&page_size=${pageSize}`)
    )
    assert.equal(paged.limit, pageSize)
    assert.equal(paged.offset, pageSize)
  }
  assert.equal(
    progressQueryFromURL(new URLSearchParams('page_size=1000')).limit,
    20
  )
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

test('stage summaries preserve independent facts, missing values and permission boundaries', () => {
  const access = { production: true, wip: true }
  const row = progressFixtureRow()
  const stages = progressStages(
    { ...row, waiting_batches: 2, rejected_batches: 1 },
    access
  )
  assert.equal(
    stages.find((stage) => stage.key === 'engineering').text,
    '1/1 确认'
  )
  assert.equal(
    stages.find((stage) => stage.key === 'materials').text,
    '1 项待领'
  )
  assert.equal(
    stages.find((stage) => stage.key === 'quality').text,
    '2 批待检 · 1 批不合格'
  )
  assert.equal(stages.find((stage) => stage.key === 'engineering').percent, 100)
  assert.equal(stages.find((stage) => stage.key === 'materials').percent, 75)
  assert.equal(stages.find((stage) => stage.key === 'shipment').percent, 50)
  assert.equal(
    stages.find((stage) => stage.key === 'production').percent,
    undefined
  )
  assert.equal(
    stages.find((stage) => stage.key === 'quality').percent,
    undefined
  )
  const empty = progressStages(
    { ...row, engineering_total: 0, material_total: 0, material_pending: 0 },
    access
  )
  assert.equal(empty[0].text, '待完善')
  assert.equal(empty[1].text, '待核对')
  assert.equal(empty[0].percent, undefined)
  assert.equal(empty[1].percent, undefined)
  const restricted = progressStages(row, { production: false, wip: false })
  assert(
    restricted
      .filter((stage) =>
        ['materials', 'production', 'quality'].includes(stage.key)
      )
      .every(
        (stage) =>
          stage.disabled &&
          stage.text === '无权限' &&
          !stage.tone &&
          stage.percent === undefined
      )
  )
  const production = progressStages(progressFixtureRow(0, 'production'), access)
  assert(!production.some((stage) => stage.key === 'engineering'))
  assert.equal(
    production.find((stage) => stage.key === 'production').percent,
    70
  )
  const mixed = progressStages(progressFixtureRow(2), access)
  assert.equal(
    mixed.find((stage) => stage.key === 'shipment').percent,
    undefined
  )
  assert.equal(
    production.find((stage) => stage.key === 'production').section,
    'batches'
  )
  const noBatch = progressStages(
    {
      ...row,
      in_progress_batches: 0,
      outsourced_batches: 0,
      planned_batches: 0,
      current_operation: '',
      production_orders: 0,
    },
    access
  )
  assert.equal(
    noBatch.find((stage) => stage.key === 'production').text,
    '未关联'
  )
  assert.equal(
    noBatch.find((stage) => stage.key === 'production').section,
    'production'
  )
})
