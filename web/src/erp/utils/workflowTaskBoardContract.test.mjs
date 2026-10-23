import assert from 'node:assert/strict'
import test from 'node:test'

import { requireWorkflowTaskBoardResponse } from './workflowTaskBoardContract.mjs'

function overviewResponse() {
  return {
    snapshot_at: 1_720_000_000,
    total: 4,
    counts: { actionable: 1, exception: 1, due: 1, finished: 1 },
    lanes: ['actionable', 'exception', 'due', 'finished'].map((key, index) => ({
      key,
      total: 1,
      limit: 5,
      offset: 0,
      tasks: [
        {
          id: index + 1,
          version: 1,
          task_status_key: ['ready', 'blocked', 'ready', 'rejected'][index],
        },
      ],
    })),
    source_types: ['inbound', 'project-orders'],
    owner_role_keys: ['warehouse', 'sales'],
  }
}

test('workflowTaskBoardContract: 接受四泳道互斥且计数守恒的响应', () => {
  const response = overviewResponse()
  assert.equal(
    requireWorkflowTaskBoardResponse(response, { limit: 5, offset: 0 }),
    response
  )
})

test('workflowTaskBoardContract: 系统撤回任务属于已结束泳道', () => {
  const response = overviewResponse()
  response.lanes[3].tasks[0].task_status_key = 'withdrawn'
  assert.equal(
    requireWorkflowTaskBoardResponse(response, { limit: 5, offset: 0 }),
    response
  )
})

test('workflowTaskBoardContract: 畸形成功响应 fail closed', () => {
  const invalidResponses = [
    { ...overviewResponse(), total: 5 },
    {
      ...overviewResponse(),
      lanes: overviewResponse().lanes.slice(0, 3),
    },
    {
      ...overviewResponse(),
      lanes: overviewResponse().lanes.map((lane, index) =>
        index === 0 ? { ...lane, total: 2 } : lane
      ),
    },
    { ...overviewResponse(), source_types: ['inbound', 'inbound'] },
    { ...overviewResponse(), owner_role_keys: ['sales', 'sales'] },
    { ...overviewResponse(), owner_role_keys: [''] },
    {
      ...overviewResponse(),
      lanes: overviewResponse().lanes.map((lane, index) =>
        index === 0
          ? {
              ...lane,
              tasks: [{ id: 1, version: 1, task_status_key: 'pending' }],
            }
          : lane
      ),
    },
    {
      ...overviewResponse(),
      lanes: overviewResponse().lanes.map((lane, index) =>
        index === 1
          ? {
              ...lane,
              tasks: [{ id: 2, version: 1, task_status_key: 'rejected' }],
            }
          : lane
      ),
    },
    {
      ...overviewResponse(),
      lanes: overviewResponse().lanes.map((lane, index) =>
        index === 3
          ? { ...lane, tasks: [{ id: 4, version: 0, task_status_key: 'done' }] }
          : lane
      ),
    },
  ]

  for (const response of invalidResponses) {
    assert.throws(
      () => requireWorkflowTaskBoardResponse(response, { limit: 5, offset: 0 }),
      (error) => error.isInvalidResponse === true
    )
  }
})

test('workflowTaskBoardContract: 按服务端上限接受 limit 200 被收敛为 100', () => {
  const response = overviewResponse()
  response.lanes = response.lanes.map((lane) => ({ ...lane, limit: 100 }))
  assert.equal(
    requireWorkflowTaskBoardResponse(response, { limit: 200, offset: 0 }),
    response
  )
})

test('workflowTaskBoardContract: 全部分页总数与筛选范围一致且拒绝终态混入待办', () => {
  const response = overviewResponse()
  response.lanes = [{ key: 'all', total: 4, limit: 20, offset: 20, tasks: response.lanes.flatMap((lane) => lane.tasks) }]
  const request = { lane_key: 'all', limit: 20, offset: 20 }
  assert.equal(requireWorkflowTaskBoardResponse(response, request), response)
  assert.throws(() => requireWorkflowTaskBoardResponse(response, { ...request, offset: 0 }), /暂时无法显示/)
  response.lanes[0].total = 3
  assert.throws(() => requireWorkflowTaskBoardResponse(response, request), /暂时无法显示/)
  response.lanes[0].total = 4
  response.counts.finished = 0
  response.counts.actionable = 2
  assert.throws(() => requireWorkflowTaskBoardResponse(response, { ...request, todo_only: true }), /暂时无法显示/)
  response.lanes[0].tasks.pop()
  assert.equal(requireWorkflowTaskBoardResponse(response, { ...request, todo_only: true }), response)
})
