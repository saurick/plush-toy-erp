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

test('mobile business routes stay inside the same role shell and recover without a history index', () => {
  const path = mobileBusinessPath('/erp/production/orders?production_order_id=7', 'warehouse')
  assert.equal(path, '/m/warehouse/handle/production/orders?production_order_id=7')
  assert.equal(canonicalBusinessPath(path), '/erp/production/orders?production_order_id=7')
  assert.equal(mobileBusinessRole(path), 'warehouse')
  assert.equal(mobileBusinessPath('/erp/task-board?mode=todo', 'warehouse'), '/m/warehouse/tasks')
  assert.equal(mobileBusinessPath('/erp/task-board?tracking=visible&track_source_type=sales_order&track_source_id=3', 'engineering'), '/m/engineering/tasks?tracking=visible&track_source_type=sales_order&track_source_id=3')
  const navigation = workflowTaskEntryNavigation({ id: 8 }, path, '/m/warehouse/tasks', 1).state.workflowTaskNavigation
  const back = workflowTaskReturnNavigation(navigation, null)
  assert.equal(back.to, '/m/warehouse/tasks')
  assert.equal(readWorkflowTaskReturn(back.options.state, 1).taskID, 8)
  assert.deepEqual(workflowTaskEntryNavigation({ id: 8 }, '//untrusted.example', '/m/warehouse/tasks', 1), {})
})
