import assert from 'node:assert/strict'
import test from 'node:test'

import { buildWorkflowRoleTaskPageMock } from './workflowRoleTaskMock.mjs'

const snapshotAt = 1_750_000_000

function task(id, status = 'ready', overrides = {}) {
  return {
    id,
    version: 1,
    task_status_key: status,
    owner_role_key: 'sales',
    payload: {},
    ...overrides,
  }
}

test('workflowRoleTaskMock: cursor reads all 350 todo rows without a 200 row cap', () => {
  const tasks = Array.from({ length: 350 }, (_, index) => task(350 - index))
  const ids = []
  let cursor = ''
  do {
    const page = buildWorkflowRoleTaskPageMock({
      tasks,
      params: {
        view_key: 'todo',
        role_key: 'sales',
        limit: 100,
        ...(cursor ? { cursor } : {}),
      },
      snapshotAt,
    })
    ids.push(...page.items.map((item) => item.id))
    cursor = page.next_cursor
    if (!page.has_more) break
  } while (cursor)

  assert.equal(ids.length, 350)
  assert.equal(new Set(ids).size, 350)
  assert.deepEqual(ids, Array.from({ length: 350 }, (_, index) => 350 - index))
})

test('workflowRoleTaskMock: target-only todo/history/risk views stay disjoint', () => {
  const tasks = [
    task(6, 'ready'),
    task(5, 'blocked'),
    task(4, 'done'),
    task(3, 'rejected'),
    task(2, 'ready', { owner_role_key: 'warehouse', priority: 3 }),
    task(1, 'ready', { owner_role_key: 'warehouse' }),
  ]
  const query = (viewKey, crossRoleRiskAllowed = false) =>
    buildWorkflowRoleTaskPageMock({
      tasks,
      params: { view_key: viewKey, role_key: 'sales', limit: 100 },
      snapshotAt,
      crossRoleRiskAllowed,
    }).items.map((item) => item.id)

  assert.deepEqual(query('todo'), [6, 5])
  assert.deepEqual(query('history'), [4, 3])
  assert.deepEqual(query('risk', true), [5, 2])
})

test('workflowRoleTaskMock: removed task states and malformed cursors fail closed', () => {
  for (const status of ['pending', 'processing', 'cancelled', 'closed']) {
    assert.throws(
      () =>
        buildWorkflowRoleTaskPageMock({
          tasks: [task(1, status)],
          params: { view_key: 'todo', role_key: 'sales', limit: 20 },
          snapshotAt,
        }),
      /unsupported workflow task/u
    )
  }
  assert.throws(
    () =>
      buildWorkflowRoleTaskPageMock({
        tasks: [task(1)],
        params: {
          view_key: 'todo',
          role_key: 'sales',
          limit: 20,
          cursor: 'not-a-cursor',
        },
        snapshotAt,
      }),
    /invalid workflow role task cursor/u
  )
})
