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
  progressMetricDetails,
  progressDeliveryDetails,
  progressStatusLabel,
  progressSourcePath,
  progressStages,
  progressAttention,
  progressDue,
  progressProductLabel,
  progressIdentityPresentation,
  progressDueOptions,
  progressFilterCount,
  progressFilterReset,
  progressExtraFilters,
  withProgressFilters,
} from './businessProgress.mjs'

test('progress search describes matching styles without changing order quantities or default labels', () => {
  const row = { ...progressFixtureRow(), product: '饼干小熊', product_count: 8, product_type_count: 6, product_match_count: 2 }
  assert.equal(progressProductLabel(row), '饼干小熊（命中 2 款，共 6 款）')
  assert.equal(progressProductLabel({ ...row, product_match_count: 0 }), '饼干小熊 等 8 项')
  assert.equal(row.ordered_quantity, '800')
})

test('progress identity distinguishes missing fields from cleared associations', () => {
  const row = { ...progressFixtureRow(), product: '', order_no: ' ', customer: '' }
  assert.deepEqual(progressIdentityPresentation(row), {
    hasProduct: true, product: '产品名称未填写', reference: '单据编号未提供', customer: '客户未填写',
  })
  assert.deepEqual(progressIdentityPresentation({ ...row, product: '旧产品', product_count: 0, product_id: 0, unlinked: true }), {
    hasProduct: false, product: '未关联产品／物料', reference: '单据编号未提供', customer: '含未关联销售明细',
  })
})

test('compact attention retains the real task, role, reason and exact single-task destination', () => {
  const row = { ...progressFixtureRow(), open_tasks: 1, attention_task_id: 31, attention_owner: '小陈', attention_task: 'engineering_data' }
  assert.deepEqual(progressAttention(row, { tasks: true }, () => '工程'), {
    title: '工程资料',
detail: '工程 · 小陈',
taskID: 31,
taskCount: 1,
    blocked: true,
reason: row.attention_reason,
  })
  assert.equal(progressAttention({ ...row, open_tasks: 2 }, { tasks: true }).taskID, null)
  assert.equal(progressAttention({ ...row, attention_owner: '' }, { tasks: true }, () => '工程').detail, '工程 · 未指定办理人')
  assert.equal(progressAttention({ ...row, attention_owner: '', unassigned_tasks: 0 }, { tasks: true }, () => '工程').detail, '工程 · 办理人未提供')
  assert.equal(progressAttention({ ...row, attention_owner: '', open_tasks: 2, unassigned_tasks: 1 }, { tasks: true }, () => '工程').detail, '工程 · 办理人未提供')
  assert.equal(progressAttention({ ...row, open_tasks: 0, sales_owner: '' }, { tasks: true }).detail, '业务负责人未提供')
  for (const value of [0, -1, '31', 1.5]) assert.equal(progressAttention({ ...row, attention_task_id: value }, { tasks: true }).taskID, null)
  const hidden = progressAttention(row, { tasks: false })
  assert.deepEqual(hidden, { title: '任务无查看权限', detail: '', taskID: null, taskCount: 0, blocked: false, reason: '' })
  const empty = progressAttention({ ...row, open_tasks: 0 }, { tasks: true })
  assert.equal(empty.title, '暂无可见待办')
  assert.equal(empty.detail, '业务负责人：模拟业务员')
  assert.equal(empty.reason, '')
  assert.equal(empty.taskID, null)
})

test('due-day emphasis uses the response snapshot and Chinese business day without inventing risk', () => {
  const row = { ...progressFixtureRow(), due_date: '2026-10-16' }
  assert.deepEqual(progressDue(row, '2026-10-16T17:30:00Z'), { label: '逾期 1 天', date: '2026-10-16', tone: 'danger' })
  assert.equal(progressDue(row).label, '已逾期')
  assert.equal(progressDue({ ...row, active: false }, '2026-10-16T17:30:00Z').tone, '')
  assert.equal(progressDue({ ...row, due_date: '' }, '2026-10-16T17:30:00Z').label, '未定交期')
  assert.equal(progressDue({ ...row, overdue: false, due_soon: true }, '2026-10-16T04:00:00Z').label, '今天到期')
  assert.equal(progressDue({ ...row, overdue: false, due_soon: true, due_date: '2026-10-19' }, '2026-10-16T04:00:00Z').label, '还有 3 天')
  assert.equal(progressDue({ ...row, overdue: false, due_soon: false }, '2026-10-17T04:00:00Z').tone, '')
})

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
    { ...valid, rows: [{ ...valid.rows[0], product_match_count: 2, product_type_count: 1 }] },
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
      'view=production&q=熊&owner=小陈&due_status=overdue&blocked_only=true&scope=all&page=2&from=2026-09-24'
    )
  )
  assert.equal(q.view, 'production')
  assert.equal(q.offset, 20)
  assert.equal(q.keyword, '熊')
  assert.equal(q.owner, '小陈')
  assert.equal(q.due_status, 'overdue')
  assert.equal(q.blocked_only, true)
  assert.equal(q.date_from, '2026-09-24')
  const bad = progressQueryFromURL(
    new URLSearchParams('view=evil&due_status=other&scope=x&page=-2&from=x')
  )
  assert.equal(bad.view, '')
  assert.equal(bad.due_status, 'all')
  assert.equal(bad.scope, 'active')
  assert.equal(bad.offset, 0)
  assert.equal(bad.date_from, '')
  for (const pageSize of [20, 50, 100]) {
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

test('交期与受阻组合，结束范围清理冲突且恢复时不复现', () => {
  for (const due_status of ['overdue', 'due_soon']) {
    const active = new URLSearchParams({ view: 'orders', scope: 'active', due_status, blocked_only: 'true', q: '小熊' })
    assert.equal(progressFilterCount(progressQueryFromURL(active)), 0)
    const ended = withProgressFilters(active, { scope: 'ended' })
    assert.equal(ended.get('due_status'), 'all')
    assert.equal(ended.has('blocked_only'), false)
    assert.equal(ended.get('q'), '小熊')
    assert.deepEqual(progressDueOptions('ended').map(({ value }) => value), ['all', 'undated'])
    const restored = new URLSearchParams({ scope: 'ended', due_status, blocked_only: 'true' })
    assert.equal(progressQueryFromURL(restored).due_status, 'all')
    assert.equal(progressQueryFromURL(restored).blocked_only, false)
    assert.equal(withProgressFilters(restored, { scope: 'active' }).get('due_status'), 'all')
  }
  const production = new URLSearchParams('view=production&unlinked_only=true&blocked_only=true&due_status=undated')
  const orders = progressQueryFromURL(withProgressFilters(production, { view: 'orders' }))
  assert.equal(orders.unlinked_only, false)
  assert.equal(orders.blocked_only, true)
  assert.equal(orders.due_status, 'undated')
  assert.equal(progressQueryFromURL(new URLSearchParams('blocked_only=false')).blocked_only, false)
})

test('两端仅计算额外条件，重置保留搜索与快捷交期和受阻', () => {
  const params = new URLSearchParams('view=production&scope=all&due_status=overdue&blocked_only=true&unlinked_only=true&owner=小陈&from=2026-10-01&q=小熊')
  assert.equal(progressFilterCount(progressQueryFromURL(params)), 4)
  const reset = withProgressFilters(params, progressFilterReset(progressQueryFromURL(params)))
  assert.equal(progressFilterCount(progressQueryFromURL(reset)), 0)
  assert.equal(reset.get('q'), '小熊')
  assert.equal(reset.get('view'), 'production')
  assert.equal(reset.get('due_status'), 'overdue')
  assert.equal(reset.get('blocked_only'), 'true')
  assert.equal(progressExtraFilters(progressQueryFromURL(reset)).length, 0)
  const undated = new URLSearchParams('scope=all&due_status=undated&q=小熊')
  assert.equal(progressFilterCount(progressQueryFromURL(undated)), 2)
  const cleared = withProgressFilters(undated, progressFilterReset(progressQueryFromURL(undated)))
  assert.equal(cleared.get('due_status'), 'all')
  assert.equal(cleared.get('q'), '小熊')
})

test('未定交期与具体日期互斥，最后选择生效且搜索不受影响', () => {
  const dated = new URLSearchParams('view=orders&q=小熊&owner=小陈&from=2026-10-01&to=2026-10-31')
  const undated = withProgressFilters(dated, { due_status: 'undated' })
  assert.equal(undated.has('from'), false)
  assert.equal(undated.has('to'), false)
  assert.equal(undated.get('q'), '小熊')
  assert.equal(undated.get('owner'), '小陈')
  for (const key of ['from', 'to']) {
    const selectedDate = withProgressFilters(undated, { [key]: '2026-10-12' })
    assert.equal(selectedDate.get('due_status'), 'all')
    assert.equal(selectedDate.get(key), '2026-10-12')
  }
  const restored = new URLSearchParams(dated)
  restored.set('due_status', 'undated')
  assert.equal(progressQueryFromURL(restored).date_from, '')
  assert.equal(progressQueryFromURL(restored).date_to, '')
  assert.equal(withProgressFilters(restored, { due_status: 'all' }).has('from'), false)
  assert.equal(withProgressFilters(dated, { q: '' }).has('q'), false)
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

test('chart details keep exact units, denominators, zero, missing values and permission boundaries', () => {
  const row = progressFixtureRow()
  const access = { production: true, wip: true }
  assert.equal(progressMetricDetails(row, 'shipment', access).value, '400 / 800 只')
  assert.equal(progressMetricDetails({ ...row, shipped_quantity: '0' }, 'shipment', access).percent, 0)
  assert.equal(Math.round(progressDeliveryDetails({ ...row, shipped_quantity: '880' }).percent), 110)
  assert.equal(progressMetricDetails(progressFixtureRow(2), 'shipment', access).percent, undefined)
  assert.equal(progressDeliveryDetails({ ...row, delivery_known: false, shipped_quantity: null }).value, '关联待核对')
  assert.equal(progressMetricDetails({ ...row, material_total: 5, material_pending: 2 }, 'materials', access).value, '3 / 5 项已领齐')
  assert.equal(progressMetricDetails({ ...row, material_total: 0 }, 'materials', access).percent, undefined)
  for (const key of ['materials', 'production', 'quality']) assert.equal(progressMetricDetails(row, key, {}), null)
  assert.equal(progressMetricDetails(progressFixtureRow(0, 'production'), 'production', access).value, '560 / 800 只')
  assert.equal(progressMetricDetails(row, 'quality', access).percent, undefined)
})
