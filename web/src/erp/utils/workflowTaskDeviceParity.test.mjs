import assert from 'node:assert/strict'
import test from 'node:test'
import { canHandleWorkflowTaskBusiness } from './workflowTaskBusinessAccess.mjs'
import { workflowTaskRecordedResult } from './workflowTaskReceipt.mjs'
import { workflowTaskActionRequiresReason } from './workflowTaskActionContract.mjs'

const task = { id: 7, source_type: 'shipment', source_id: 31, task_status_key: 'ready', owner_role_key: 'business' }
const access = { source: 'backend', sourceAccess: { allowed: true }, byAction: { complete: { actionMode: 'complete', allowed: true } } }

test('电脑与手机业务办理使用同一权限边界，admin 身份不能代替责任范围', () => {
  for (const is_super_admin of [false, true]) {
    const profile = { id: 12, is_super_admin }
    assert.equal(canHandleWorkflowTaskBusiness(task, profile, access), true)
    assert.equal(canHandleWorkflowTaskBusiness(task, profile, { ...access, byAction: { urge: { actionMode: 'urge', allowed: true } } }), false)
    assert.equal(canHandleWorkflowTaskBusiness(task, profile, { ...access, byAction: { assign: { actionMode: 'assign', allowed: true } } }), false)
    assert.equal(canHandleWorkflowTaskBusiness({ ...task, assignee_id: 13 }, profile, access), false)
    assert.equal(canHandleWorkflowTaskBusiness({ ...task, assignee_id: 12 }, profile, access), true)
    for (const status of ['done', 'rejected', 'withdrawn']) assert.equal(canHandleWorkflowTaskBusiness({ ...task, task_status_key: status }, profile, access), false)
    for (const source of ['fallback', 'fallback_checking', 'fallback_failed']) assert.equal(canHandleWorkflowTaskBusiness(task, profile, { ...access, source }), false)
    assert.equal(canHandleWorkflowTaskBusiness(task, profile, { ...access, sourceAccess: { allowed: false } }), false)
    assert.equal(canHandleWorkflowTaskBusiness(task, { ...profile, disabled: true }, access), false)
  }
  assert.equal(canHandleWorkflowTaskBusiness(null, { id: 12 }, access), false)
})

test('已交接任务仅凭同来源后端当前节点和岗位权限继续事实办理', () => {
  const completed = { ...task, task_status_key: 'done', source_type: 'finance_payment', owner_role_key: 'finance', process_instance_id: 10, process_node_instance_id: 11 }
  const profile = { id: 12, permissions: ['finance.payment.post'], effective_session: { actions: ['finance.payment.post'] } }
  const ownerAccess = { ...access, byAction: { complete: { actionMode: 'complete', allowed: false, ownerRoleMatched: true } } }
  const context = {
    source: { type: completed.source_type, id: completed.source_id },
    process_instance: { id: 10, status: 'active' },
    linked_node: { id: 11, status: 'completed' },
    current_nodes: [{ id: 12, process_instance_id: 10, node_type: 'domain_command', status: 'active', owner_pool_key: 'finance', required_capability_key: 'finance.payment.post' }],
  }
  const canHandle = (value = context, nextTask = completed, nextProfile = profile, nextAccess = ownerAccess) => canHandleWorkflowTaskBusiness(nextTask, nextProfile, nextAccess, value)
  assert.equal(canHandle(), true)
  for (const status of ['blocked', 'completed']) assert.equal(canHandle({ ...context, process_instance: { id: 10, status } }), false)
  for (const source of [{ type: 'shipment', id: completed.source_id }, { type: completed.source_type, id: 32 }]) assert.equal(canHandle({ ...context, source }), false)
  assert.equal(canHandle({ ...context, linked_node: { id: 22, status: 'completed' } }), false)
  assert.equal(canHandle({ ...context, current_nodes: [] }), false)
  for (const patch of [{ status: 'completed' }, { status: 'blocked' }, { node_type: 'human_task' }, { owner_pool_key: 'warehouse' }, { process_instance_id: 20 }, { required_capability_key: '' }]) assert.equal(canHandle({ ...context, current_nodes: [{ ...context.current_nodes[0], ...patch }] }), false)
  for (const status of ['rejected', 'withdrawn']) assert.equal(canHandle(context, { ...completed, task_status_key: status }), false)
  assert.equal(canHandle(context, { ...completed, assignee_id: 99 }), false)
  assert.equal(canHandle(context, completed, { id: 12 }), false)
  assert.equal(canHandle(context, completed, profile, { ...ownerAccess, sourceAccess: { allowed: false } }), false)
  assert.equal(canHandle(context, completed, profile, { ...ownerAccess, byAction: { urge: { actionMode: 'urge', allowed: true } } }), false)
})

test('历史回执忽略整理记录，办理人和精确时间来自实际事件', () => {
  const events = [
    { id: 9, event_type: 'payload_refreshed', reason: '资料已整理', created_at: 1792600000 },
    { id: 8, event_type: 'source_state_changed', created_at: 1792500200 },
    { id: 7, event_type: 'status_changed', to_status_key: 'done', actor_display_name: '小林', actor_role_key: 'business', created_at: 1792500100, reason: '已核对交接' },
    { id: 2, event_type: 'created', created_at: 1792400000 },
  ]
  const result = workflowTaskRecordedResult(task, events)
  assert.equal(result.label, '任务已完成')
  assert.match(result.actorLabel, /小林/)
  assert.equal(result.reason, '已核对交接')
  assert.notEqual(result.timeLabel, '时间未记录')
  assert.equal(workflowTaskRecordedResult({ ...task, task_status_key: 'done' }, events.filter((event) => event.id !== 7)), null)
  assert.equal(workflowTaskRecordedResult(task, []), null)
})

test('审批与普通办理的必填意见在两端保持一致', () => {
  for (const action of ['complete', 'done']) {
    assert.equal(workflowTaskActionRequiresReason(task, action), false)
    assert.equal(workflowTaskActionRequiresReason({ ...task, task_group: 'business_followup' }, action), true)
    assert.equal(workflowTaskActionRequiresReason({ ...task, required_capability_key: 'workflow.task.approve' }, action), true)
  }
  for (const action of ['blocked', 'block', 'rejected', 'reject', 'resume', 'urge', 'assign']) assert.equal(workflowTaskActionRequiresReason(task, action), true)
})
