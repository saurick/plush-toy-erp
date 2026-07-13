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
      tasks: [{ id: index + 1 }],
    })),
    source_types: ['inbound', 'project-orders'],
  }
}

test('workflowTaskBoardContract: 接受四泳道互斥且计数守恒的响应', () => {
  const response = overviewResponse()
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
  ]

  for (const response of invalidResponses) {
    assert.throws(
      () => requireWorkflowTaskBoardResponse(response, { limit: 5, offset: 0 }),
      (error) => error.isInvalidResponse === true
    )
  }
})

test('workflowTaskBoardContract: 按服务端上限接受 limit 200 被收敛为 50', () => {
  const response = overviewResponse()
  response.lanes = response.lanes.map((lane) => ({ ...lane, limit: 50 }))
  assert.equal(
    requireWorkflowTaskBoardResponse(response, { limit: 200, offset: 0 }),
    response
  )
})
