import assert from 'node:assert/strict'
import test from 'node:test'
import { buildWorkflowBusinessChain } from './workflowBusinessChain.mjs'

test('orders the business chain with receipt before packaging and keeps exception descendants together', () => {
  const tasks = [
    { id: 4, task_group: 'handoff_production_packaging_execute', operation_code: 'PACKAGING', discovery: { stage_key: 'packaging' } },
    { id: 3, task_group: 'handoff_production_completion', operation_code: 'HANDWORK', discovery: { stage_key: 'finished_inbound' } },
    { id: 1, source_type: 'production_exception_decision', exception_id: 7, operation_code: 'FABRIC_PROCESSING' },
    { id: 2, source_type: 'production_wip_batch', exception_id: 7, operation_code: 'SEWING', task_status_key: 'blocked' },
  ].map((item) => ({ task_name: '办理任务', owner_role_key: 'warehouse', task_status_key: 'ready', ...item }))
  const result = buildWorkflowBusinessChain({ items: tasks, truncated: false }, 2)
  assert.deepEqual(result.main.filter((stage) => stage.tasks.length).map((stage) => stage.key), ['finished_inbound', 'packaging'])
  assert.equal(result.exceptions.length, 1)
  assert.equal(result.exceptions[0].current, true)
  assert.equal(result.exceptions[0].blocked, true)
  assert.equal(result.exceptions[0].tasks[0].id, 2)
  assert.equal(result.exceptions[0].open, 2)
  assert.equal(result.main.length, 14, 'exception-only stages must not appear as empty main-chain stages')
})

test('closed and missing stages are never reported as posted facts or invented future tasks', () => {
  const result = buildWorkflowBusinessChain({ items: [{ id: 8, source_type: 'shipment', discovery: { stage_key: 'shipment' }, task_status_key: 'withdrawn', owner_role_key: 'sales' }], truncated: true }, 8)
  assert.deepEqual(result.main.filter((stage) => stage.tasks.length).map((stage) => stage.key), ['shipment'])
  assert.equal(result.main.find((stage) => stage.key === 'shipment').open, 0)
  assert.ok(result.main.some((stage) => stage.key === 'cutting_quality' && stage.tasks.length === 0))
  assert.equal(result.truncated, true)
})
