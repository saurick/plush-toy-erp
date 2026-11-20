import assert from 'node:assert/strict'
import test from 'node:test'
import { productionTaskHandling, productionTaskWipAction, retainReturnedWorkflowTask } from './productionTaskHandling.mjs'
import { workflowTaskEntryNavigation, workflowTaskReturnNavigation } from './workflowTaskNavigation.mjs'

const entry = '/erp/production/orders?production_order_id=71&wip_batch_id=21'
const task = (group = 'handoff_production_execute') => ({
  id: 42,
task_group: group,
task_code: `source-${group.replaceAll('_', '-')}-21`,
  task_status_key: 'ready',
source_id: 21,
source_type: 'production_wip_batch',
  payload: { entry_path: entry,
source_record_id: 21,
source_task_producer: 'fulfillment.source',
    source_task_contract: 'workflow.source-task/v1',
source_task_intent_hash: 'a'.repeat(64) },
})
test('only verified source-task identities focus a production form, including mobile', () => {
  const current = task()
  assert.equal(productionTaskHandling(current, entry).group, current.task_group)
  assert.equal(productionTaskHandling(current, entry.replace('/erp/', '/m/production/handle/')).sourceID, 21)
  for (const invalid of [{ ...current, task_code: 'untrusted' }, { ...current, task_status_key: 'done' },
    { ...current, source_id: 22 }, { ...current, payload: {} }]) {
    assert.equal(productionTaskHandling(invalid, entry), null)
  }
  assert.equal(productionTaskHandling(current, entry.replace('21', '22')), null)
})
test('missing or invalid entry paths cannot select a production form', () => {
  const invalid = { ...task(), payload: {} }
  for (const entryPath of ['', null, undefined, '/unrelated']) {
    assert.equal(productionTaskHandling(invalid, entryPath), null)
  }
})
test('the authoritative batch chooses the correct production form without granting an action', () => {
  const handling = productionTaskHandling(task(), entry)
  assert.equal(productionTaskWipAction(handling, { id: 21, status: 'PLANNED' }), 'ASSIGN_EXECUTION')
  assert.equal(productionTaskWipAction(handling, { id: 21, status: 'PLANNED', execution_mode: 'IN_HOUSE' }), 'START_OPERATION')
  assert.equal(productionTaskWipAction(handling, { id: 21, status: 'IN_PROGRESS' }), 'COMPLETE_OPERATION')
  assert.equal(productionTaskWipAction(handling, { id: 22, status: 'IN_PROGRESS' }), '')
  assert.equal(productionTaskWipAction(handling, { id: 21, status: 'ACCEPTED' }), '')
  assert.equal(productionTaskWipAction(productionTaskHandling(task('handoff_production_return'), entry), { id: 21 }), 'RECEIVE_OUTSOURCING_RETURN')
  assert.equal(productionTaskWipAction(productionTaskHandling(task('handoff_production_transfer'), entry), { id: 21 }), 'TRANSFER_TO_NEXT_OPERATION')
})
test('a returned completed task is explicitly retained at its original position without mutating filtered data', () => {
  const tasks = [{ id: 1 }, { id: 2 }, { id: 3 }]
  const result = retainReturnedWorkflowTask(tasks, { id: 42, task_status_key: 'done' }, { rowIndex: 2 })
  assert.deepEqual(result.map((item) => item.id), [1, 2, 42, 3])
  assert.equal(result[2].returnedToPosition, true)
  assert.equal(result[2].task_status_key, 'done')
  assert.deepEqual(tasks, [{ id: 1 }, { id: 2 }, { id: 3 }])
  assert.equal(retainReturnedWorkflowTask(result, { id: 42, task_status_key: 'ready' }, {}).length, 4)
})
test('business receipts and original query survive explicit return and reload while browser-back keeps history', () => {
  const nav = workflowTaskEntryNavigation(task(), entry, '/erp/task-board?mode=todo&lane=actionable&keyword=MO&page=2', 9).state.workflowTaskNavigation
  const context = { ...nav,
returnHistoryIndex: 3,
returnPosition: { scrollTop: 521, rowIndex: 7, rowOffset: 240 },
    businessReceipt: { message: '加工安排已保存' } }
  const result = workflowTaskReturnNavigation(context, 6)
  assert.equal(result.to, nav.returnPath)
  assert.deepEqual(result.options.state.workflowTaskReturn.businessReceipt, context.businessReceipt)
  assert.deepEqual(result.options.state.workflowTaskReturn.returnPosition, context.returnPosition)
  assert.deepEqual(workflowTaskReturnNavigation({ ...context, businessReceipt: null }, 6), { to: -3 })
})

test('scheduling confirmation stays a Workflow action and never opens a WIP assignment form', () => {
  assert.equal(productionTaskWipAction({ group: 'production_scheduling', sourceID: 21 }, { id: 21, status: 'PLANNED' }), '')
})
