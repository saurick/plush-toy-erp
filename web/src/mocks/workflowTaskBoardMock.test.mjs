import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowTaskBoardMock,
  classifyWorkflowTaskBoardMockLane,
} from './workflowTaskBoardMock.mjs'

const snapshotAt = 1_750_000_000

test('单据模块模拟查询先过滤再分页，单据类型候选保持完整', () => {
  const tasks = [
    task(1, 'ready', { source_type: 'production_fact' }),
    task(2, 'done', { source_type: 'production-progress' }),
    task(3, 'ready', { source_type: 'production_order' }),
    task(4, 'ready', { source_type: 'purchase_receipt' }),
  ]
  const board = buildWorkflowTaskBoardMock({ tasks, params: { source_section: 'production', lane_key: 'all', limit: 1, offset: 1 }, snapshotAt })
  assert.equal(board.total, 3)
  assert.deepEqual(board.counts, { actionable: 2, exception: 0, due: 0, finished: 1 })
  assert.equal(board.lanes[0].tasks.length, 1)
  assert.equal(board.lanes[0].tasks[0].id, 2)
  assert.deepEqual(board.source_types, ['production_fact', 'production_order', 'purchase_receipt'])
})

function task(id, status, overrides = {}) {
  return {
    id,
    task_code: `TASK-${id}`,
    task_group: 'engineering_data',
    task_name: `工程任务 ${id}`,
    source_type: 'project-orders',
    source_no: `SO-${id}`,
    business_status_key: 'engineering_preparing',
    task_status_key: status,
    owner_role_key: 'engineering',
    due_at: null,
    payload: {},
    ...overrides,
  }
}

test('workflowTaskBoardMock: 四泳道互斥且 rejected 只投影为已结束', () => {
  const tasks = [
    task(1, 'ready'),
    task(2, 'ready', { due_at: snapshotAt + 60 }),
    task(3, 'blocked', { due_at: snapshotAt - 60 }),
    task(4, 'rejected', {
      payload: { rejected_reason: '资料不完整' },
    }),
    task(5, 'done', { due_at: snapshotAt - 60 }),
  ]
  const board = buildWorkflowTaskBoardMock({
    tasks,
    params: { limit: 5, offset: 0 },
    snapshotAt,
  })

  assert.equal(board.total, 5)
  assert.deepEqual(board.owner_role_keys, ['engineering'])
  assert.deepEqual(board.counts, {
    actionable: 1,
    exception: 1,
    due: 1,
    finished: 2,
  })
  assert.equal(
    Object.values(board.counts).reduce((sum, value) => sum + value, 0),
    board.total
  )
  assert.equal(
    classifyWorkflowTaskBoardMockLane(tasks[3], snapshotAt),
    'finished'
  )
})

test('workflowTaskBoardMock: 服务端筛选、source options 与聚焦分页口径一致', () => {
  const tasks = Array.from({ length: 23 }, (_, index) =>
    task(index + 1, 'ready', {
      source_type: index === 0 ? 'inbound' : 'project-orders',
    })
  )
  const board = buildWorkflowTaskBoardMock({
    tasks,
    params: {
      keyword: '工程任务',
      status: 'ready',
      owner_role_key: 'engineering',
      lane_key: 'actionable',
      limit: 8,
      offset: 16,
    },
    snapshotAt,
  })

  assert.equal(board.total, 23)
  assert.deepEqual(board.source_types, ['purchase_receipt', 'sales_order'])
  assert.deepEqual(board.owner_role_keys, ['engineering'])
  assert.equal(board.lanes.length, 1)
  assert.equal(board.lanes[0].total, 23)
  assert.deepEqual(
    board.lanes[0].tasks.map((item) => item.id),
    [7, 6, 5, 4, 3, 2, 1]
  )
})

test('workflowTaskBoardMock: 非异常任务不命中过期的退回原因残值', () => {
  const tasks = [
    task(1, 'ready', { payload: { rejected_reason: '资料不完整' } }),
    task(2, 'rejected', { payload: { rejected_reason: '资料不完整' } }),
  ]
  const board = buildWorkflowTaskBoardMock({
    tasks,
    params: { keyword: '资料不完整' },
    snapshotAt,
  })

  assert.equal(board.total, 1)
  assert.deepEqual(board.counts, {
    actionable: 0,
    exception: 0,
    due: 0,
    finished: 1,
  })
})

test('workflowTaskBoardMock: 旧任务状态和聚合筛选不进入 target-only 合同', () => {
  for (const removedStatusKey of [
    'pending',
    'processing',
    'cancelled',
    'closed',
  ]) {
    assert.throws(
      () =>
        classifyWorkflowTaskBoardMockLane(
          task(99, removedStatusKey),
          snapshotAt
        ),
      /unsupported workflow task status/u
    )
    assert.throws(
      () =>
        buildWorkflowTaskBoardMock({
          tasks: [task(1, 'ready')],
          params: { status: removedStatusKey },
          snapshotAt,
        }),
      /unsupported workflow task board status/u
    )
  }
})

test('workflowTaskBoardMock: 按显示的产品款号搜索，来源清空后不匹配旧快照', () => {
  const linked = task(1, 'ready', {
    payload: { product_name: '旧产品', style_no: 'OLD' },
    display_context: {
      available: true,
      source_no: 'MO-1',
      items: [
        {
          kind: 'product',
          name: '长耳兔',
          code: 'PRODUCT-1',
          style_no: 'RB-018',
          order_no: 'SO-ROOT',
        },
      ],
    },
  })
  const search = (keyword) =>
    buildWorkflowTaskBoardMock({
      tasks: [linked],
      params: { keyword, limit: 8 },
      snapshotAt,
    }).total
  assert.equal(search('RB-018'), 1)
  assert.equal(search('SO-ROOT'), 1)
  assert.equal(search('OLD'), 0)
  linked.display_context.items = []
  assert.equal(search('长耳兔'), 0)
  assert.equal(search('旧产品'), 0)
})
