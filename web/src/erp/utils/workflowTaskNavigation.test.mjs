import assert from 'node:assert/strict'
import test from 'node:test'
import { canonicalBusinessPath, mobileBusinessPath, mobileBusinessRole } from './businessTaskRoute.mjs'
import { consumeWorkflowTaskReturn, readWorkflowTaskNavigation, readWorkflowTaskReturn, workflowTaskEntryNavigation, workflowTaskReturnNavigation } from './workflowTaskNavigation.mjs'

test('task navigation keeps account, source record and original history when returning from a document', () => {
  const previous = globalThis.window
  const history = { state: { idx: 7, key: 'original', mobileScrollTop: 270, usr: { selectedRow: 32 } } }
  history.replaceState = (state) => { history.state = state }
  globalThis.window = { history }
  try {
    const source = { source_type: 'sales_order', source_id: 32 }
    const entry = '/erp/production/quality-inspections?quality_inspection_id=5'
    const navigation = workflowTaskEntryNavigation({ id: 42, task_name: '处理色差' }, entry, '/erp/task-board?mode=todo', 9, source)
    assert.equal(history.state.mobileScrollTop, 270)
    assert.equal(history.state.usr.selectedRow, 32)
    assert.equal(history.state.usr.workflowTaskReturn.taskID, 42)
    assert.equal(readWorkflowTaskNavigation(navigation.state, entry.split('?')[0], 9).taskID, 42)
    assert.equal(readWorkflowTaskNavigation(navigation.state, entry.split('?')[0], 10), null)
    assert.equal(readWorkflowTaskNavigation(navigation.state, '/erp/warehouse/shipments', 9), null)
    assert.deepEqual(workflowTaskReturnNavigation(navigation.state.workflowTaskNavigation, 10), { to: -3 })
    assert.equal(readWorkflowTaskReturn(history.state.usr, 9, { ...source, source_id: 33 }), null)
    consumeWorkflowTaskReturn(42, 10)
    assert.ok(history.state.usr.workflowTaskReturn)
    consumeWorkflowTaskReturn(42, 9)
    assert.equal(history.state.usr.workflowTaskReturn, undefined)
    assert.equal(history.state.mobileScrollTop, 270)
    assert.equal(history.state.usr.selectedRow, 32)
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
})

test('mobile document targets stay in task management and recover without a history index', () => {
  const path = mobileBusinessPath('/erp/production/orders?production_order_id=7', 'warehouse')
  assert.equal(path, '/m/warehouse/tasks')
  assert.equal(canonicalBusinessPath(path), '/m/warehouse/tasks')
  assert.equal(mobileBusinessRole(path), 'warehouse')
  assert.equal(mobileBusinessRole('/m/warehouse'), 'warehouse')
  assert.equal(mobileBusinessRole('/m/warehouse/unavailable'), 'warehouse')
  assert.equal(mobileBusinessRole('/erp/dashboard'), '')
  assert.equal(mobileBusinessPath('/erp/task-board?mode=todo', 'warehouse'), '/m/warehouse/tasks')
  assert.equal(mobileBusinessPath('/erp/task-board?mode=all&link_task=41#task', 'warehouse'), '/m/warehouse/tasks?link_task=41#task')
  assert.equal(mobileBusinessPath('/erp/task-board?tracking=visible&track_source_type=sales_order&track_source_id=3', 'engineering'), '/m/engineering/tasks?tracking=visible&track_source_type=sales_order&track_source_id=3')
  const navigation = workflowTaskEntryNavigation({ id: 8 }, path, '/m/warehouse/tasks', 1).state.workflowTaskNavigation
  const back = workflowTaskReturnNavigation(navigation, null)
  assert.equal(back.to, '/m/warehouse/tasks')
  assert.equal(readWorkflowTaskReturn(back.options.state, 1).taskID, 8)
  assert.deepEqual(workflowTaskEntryNavigation({ id: 8 }, '//untrusted.example', '/m/warehouse/tasks', 1), {})
})

test('object navigation drops document filters on the phone and preserves desktop targets', () => {
  const target = { pathname: '/erp/production/progress', search: '?view=exceptions&source_id=7', hash: '#details' }
  assert.deepEqual(mobileBusinessPath(target, 'production'), { pathname: '/m/production/tasks', search: '', hash: '' })
  assert.equal(mobileBusinessPath(target, ''), target)
  assert.deepEqual(mobileBusinessPath({ pathname: '/erp/task-board', search: '?tracking=visible&track_source_id=7' }, 'sales'), { pathname: '/m/sales/tasks', search: '?tracking=visible&track_source_id=7', hash: '' })
  assert.equal(mobileBusinessPath('/erp', 'warehouse'), '/m/warehouse/tasks')
  assert.deepEqual(mobileBusinessPath({ search: '?tab=history' }, 'sales'), { search: '?tab=history' })
  const state = { workflowTaskNavigation: { taskID: 1, adminID: 2, entryPath: '/m/sales/handle/help-center#terms', returnPath: '/m/sales/tasks' } }
  assert.equal(readWorkflowTaskNavigation(state, '/m/sales/handle/help-center', 2)?.taskID, 1)
})

test('a mobile document return cannot use a desktop return URL or jump back to desktop history', () => {
  const navigation = { taskID: 8, adminID: 1, returnPath: '/erp/task-board?mode=todo', returnHistoryIndex: 1 }
  const result = workflowTaskReturnNavigation(navigation, 3, 'warehouse')
  assert.equal(result.to, '/m/warehouse/tasks')
  assert.equal(result.options.state.workflowTaskReturn.taskID, 8)
  assert.deepEqual(workflowTaskReturnNavigation({ ...navigation, returnPath: '/m/warehouse/tasks' }, 3, 'warehouse'), { to: -2 })
})

test('document handoff uses the same readable task name as the task information card', () => {
  const task = { id: 8, task_name: 'order_approval' }
  for (const [entryPath, returnPath] of [
    ['/erp/sales/project-orders/sales-orders', '/erp/task-board'],
    ['/m/sales/handle/sales/project-orders/sales-orders', '/m/sales/tasks'],
  ]) {
    const { state } = workflowTaskEntryNavigation(task, entryPath, returnPath, 1)
    assert.equal(state.workflowTaskNavigation.taskName, '订单审批')
  }
  const { state } = workflowTaskEntryNavigation({ id: 9, title: '核对客户规格' }, '/m/sales/handle/sales/project-orders/sales-orders', '/m/sales/tasks', 1)
  assert.equal(state.workflowTaskNavigation.taskName, '核对客户规格')
})
