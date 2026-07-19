import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowBusinessTaskQuery,
  buildWorkflowBusinessTaskStats,
  reconcileWorkflowBusinessTaskPage,
  requireWorkflowBusinessTaskPage,
} from './workflowBusinessModuleModel.mjs'

test('workflow business query sends every filter and the second-page offset to the server', () => {
  assert.deepEqual(
    buildWorkflowBusinessTaskQuery({
      taskGroup: ' production_scheduling ',
      keyword: ' PO-001 ',
      status: 'ready',
      ownerRoleKey: 'pmc',
      dueFrom: 1_752_787_200,
      dueTo: 1_752_873_599,
      pagination: { current: 2, pageSize: 10 },
    }),
    {
      task_group: 'production_scheduling',
      keyword: 'PO-001',
      task_status_key: 'ready',
      owner_role_key: 'pmc',
      due_from: 1_752_787_200,
      due_to: 1_752_873_599,
      limit: 10,
      offset: 10,
    }
  )
})

test('workflow business page accepts a server total beyond two hundred', () => {
  const query = { taskGroup: 'production_scheduling', limit: 10, offset: 200 }
  const tasks = Array.from({ length: 5 }, (_, index) => ({
    id: 201 + index,
    version: 1,
    task_group: 'production_scheduling',
  }))
  assert.deepEqual(
    requireWorkflowBusinessTaskPage(
      { tasks, total: 205, limit: 10, offset: 200 },
      query
    ),
    { tasks, total: 205 }
  )
})

test('workflow business page rejects a response mixed with another task group', () => {
  assert.throws(
    () =>
      requireWorkflowBusinessTaskPage(
        {
          tasks: [
            {
              id: 1,
              version: 1,
              task_group: 'production_exception',
            },
          ],
          total: 1,
          limit: 10,
          offset: 0,
        },
        {
          taskGroup: 'production_scheduling',
          limit: 10,
          offset: 0,
        }
      ),
    (error) => error?.isInvalidResponse === true
  )
})

test('workflow business page retreats from an emptied tail page and clears stale selection', () => {
  assert.deepEqual(
    reconcileWorkflowBusinessTaskPage({
      tasks: [],
      total: 20,
      pagination: { current: 3, pageSize: 10 },
      selectedTaskKeys: [205],
    }),
    {
      current: 2,
      shouldRetreat: true,
      tasks: [],
      selectedTaskKeys: [],
    }
  )
})

test('workflow business page retains only selection visible on the refreshed page', () => {
  assert.deepEqual(
    reconcileWorkflowBusinessTaskPage({
      tasks: [{ id: 12 }, { id: 11 }],
      total: 22,
      pagination: { current: 2, pageSize: 10 },
      selectedTaskKeys: [12, 21],
    }),
    {
      current: 2,
      shouldRetreat: false,
      tasks: [{ id: 12 }, { id: 11 }],
      selectedTaskKeys: [12],
    }
  )
})

test('workflow business stats report the server-filtered total and current page only', () => {
  assert.deepEqual(buildWorkflowBusinessTaskStats({ total: 205, pageCount: 5 }), [
    { key: 'total', label: '筛选结果', value: 205 },
    { key: 'page', label: '本页任务', value: 5 },
  ])
})
