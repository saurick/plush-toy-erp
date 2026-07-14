import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowTaskBoardMock,
  classifyWorkflowTaskBoardMockLane,
} from './workflowTaskBoardMock.mjs'

const snapshotAt = 1_750_000_000

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
  assert.deepEqual(board.source_types, ['inbound', 'project-orders'])
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
