import assert from 'node:assert/strict'
import test from 'node:test'
import { canCreateFollowupFromRecord, requireFollowupCreateParams, requireFollowupOptions, requireFollowupReceipt, requireFollowupTaskPage } from './workflowFollowup.mjs'

const input = { source_type: 'sales_order', source_id: 42, task_name: '核实交期', description: '请提供预计完成日期', owner_role_key: 'sales', assignee_id: null, due_at: 1_900_000_000, priority: 0, idempotency_key: 'followup:one' }
const task = { id: 99, version: 1, task_group: 'business_followup', ...input, task_status_key: 'ready', payload: { description: input.description } }

test('任务发起只接受有效来源、明确要求和同一重试意图', () => {
  assert.deepEqual(requireFollowupCreateParams(input), input)
  for (const override of [{ source_no: 'FORGED' }, { source_type: 'inventory_txn' }, { source_id: 0 }, { assignee_id: 1.2 }, { description: ' ' }, { priority: 1 }, { idempotency_key: '' }, { process_instance_id: 1 }]) {
    assert.throws(() => requireFollowupCreateParams({ ...input, ...override }))
  }
  assert.equal(canCreateFollowupFromRecord('sales_order', { id: 42, lifecycle_status: 'active' }), true)
  assert.equal(canCreateFollowupFromRecord('production_order', { id: 42, status: 'RELEASED' }), true)
  for (const status of ['closed', 'canceled', 'SHIPPED', 'unknown']) assert.equal(canCreateFollowupFromRecord('sales_order', { id: 42, lifecycle_status: status }), false)
})

test('错误来源的候选资料和不完整回执不能冒充发起成功', () => {
  assert.equal(requireFollowupReceipt({ task }, input), task)
  for (const override of [{ source_id: 8 }, { version: undefined }, { assignee_id: 7 }, { due_at: 1 }, { payload: {} }, { process_instance_id: 1 }]) {
    assert.throws(() => requireFollowupReceipt({ task: { ...task, ...override } }, input), { isInvalidResponse: true })
  }
  const options = { source_type: 'sales_order', source_id: 42, source_no: 'SO-42', can_create: false, roles: [] }
  assert.equal(requireFollowupOptions(options, input), options)
  assert.throws(() => requireFollowupOptions({ ...options, source_id: 9 }, input), { isInvalidResponse: true })
})

test('相关任务仅接受同一单据的完整分页，不能把损坏或串单响应当成空列表', () => {
  const page = { tasks: [task], total: 1 }
  assert.equal(requireFollowupTaskPage(page, input), page)
  assert.deepEqual(requireFollowupTaskPage({ tasks: [], total: 0 }, input), { tasks: [], total: 0 })
  for (const data of [{}, { ...page, total: -1 }, { ...page, total: 1.5 }, { ...page, tasks: [{ ...task, source_id: 100 }] }, { ...page, tasks: [{ ...task, source_type: 'purchase_order' }] }, { ...page, tasks: [{ ...task, version: undefined }] }]) {
    assert.throws(() => requireFollowupTaskPage(data, input), /相关任务读取不完整/)
  }
})
