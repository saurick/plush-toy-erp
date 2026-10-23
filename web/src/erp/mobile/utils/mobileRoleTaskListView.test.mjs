import assert from 'node:assert/strict'
import test from 'node:test'
import { createMobileRoleTaskSlots } from '../../utils/mobileTaskQueries.mjs'
import {
  buildMobileRoleTaskLists,
  buildMobileRoleTaskListView,
} from './mobileRoleTaskListView.mjs'

function buildView(input) {
  return buildMobileRoleTaskListView({
    ...input,
    lists: buildMobileRoleTaskLists(input),
    countSummary: input.slots[input.viewKey].count_summary,
  })
}

function fixture(overrides = {}) {
  const slots = createMobileRoleTaskSlots()
  for (const slot of Object.values(slots)) slot.server_time = 1800000000
  const task = (id, status = 'ready', extra = {}) => ({
    id,
    version: 1,
    task_name: `任务 ${id}`,
    task_status_key: status,
    owner_role_key: 'quality',
    ...extra,
  })
  slots.todo.items = [task(3), task(1, 'blocked'), task(8, 'done')]
  slots.history.items = [task(9, 'done'), task(10, 'ready')]
  slots.risk.items = [
    task(4, 'blocked', { due_at: 1799999999 }),
    task(5, 'ready'),
  ]
  slots.approval.items = [task(6)]
  return {
    slots,
    roleKey: 'quality',
    viewKey: 'todo',
    filterKey: 'all',
    ...overrides,
  }
}

test('list presentation preserves server order and separates active and terminal views', () => {
  const input = fixture({ selectedTaskID: 1 })
  const result = buildView(input)
  assert.deepEqual(
    result.activeTasks.map((task) => task.id),
    [3, 1]
  )
  assert.deepEqual(
    result.doneTasks.map((task) => task.id),
    [9]
  )
  assert.equal(result.activeTaskViewState.selectedTask.id, 1)
  assert.deepEqual(
    input.slots.todo.items.map((task) => task.id),
    [3, 1, 8]
  )
})

test('filter counts retain authoritative totals rather than the currently loaded page size', () => {
  const input = fixture({ canViewApprovalInbox: true, isAdminReview: true })
  input.slots.todo.count_summary = {
    counts: { todo: 200, approval: 60, risk: 25, overdue: 7 },
    risk_scope: 'supervised',
  }
  const result = buildView(input)
  assert.deepEqual(
    result.filterItems.map((item) => item.count),
    [200, 60, 25, 7]
  )
  assert.equal(result.filterItems[1].ariaLabel, '待审批')
  assert.equal(result.filterItems[2].label, '跨岗风险')
  assert.equal(result.activeTasks.length, 2)
})

test('missing totals stay unknown and approval filters follow effective access', () => {
  const input = fixture()
  const result = buildView(input)
  assert.deepEqual(
    result.filterItems.map((item) => item.count),
    [null, null, null]
  )
  assert.equal(
    result.filterItems.some((item) => item.key === 'approval'),
    false
  )
  const allowed = buildView({ ...input, canViewApprovalInbox: true })
  assert.equal(allowed.filterItems[1].ariaLabel, '待我审批')
})

test('overdue shortcut displays the server-filtered risk page and keeps selection in that view', () => {
  const input = fixture({ viewKey: 'risk', filterKey: 'overdue', selectedTaskID: 3 })
  input.slots.risk.items = [input.slots.risk.items[0]]
  const result = buildView(input)
  assert.deepEqual(
    result.filteredTasks.map((task) => task.id),
    [4]
  )
  assert.equal(result.activeTaskViewState.selectedTask, null)
  const history = buildView(
    fixture({ viewKey: 'history', filterKey: 'all', selectedTaskID: 9 })
  )
  assert.equal(history.activeTaskViewState.selectedTask.id, 9)
  assert.equal(history.activeTaskViewState.actionsEnabled, false)
})

test('view changes retain the projected rows and ignore unknown filter keys', () => {
  const input = fixture()
  const lists = buildMobileRoleTaskLists(input)
  const result = buildMobileRoleTaskListView({
    ...input,
    lists,
    filterKey: '__proto__',
  })
  assert.equal(result.activeTasks, lists.activeTasks)
  assert.deepEqual(
    result.filteredTasks.map((task) => task.id),
    [3, 1]
  )
})
