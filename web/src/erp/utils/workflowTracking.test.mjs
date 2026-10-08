import assert from 'node:assert/strict'
import test from 'node:test'
import { buildTrackingStageModel, requireTrackingDetail, requireTrackingPage, submittedProcessRef, trackingHandoff, trackingResponsibility, trackingStatus, trackingURL } from './workflowTracking.mjs'

const now = 1791367200
export function trackingFixture() {
  const task = { task_id: 30, task_name: '订单审批', node_instance_id: 20, owner_role_key: 'boss', assignee_name: '审批负责人', status: 'ready', created_at: now, completed_at: null, due_at: null }
  return {
    summary: { kind: 'process', id: 10, process_key: 'sales_order_acceptance', title: '', source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK', display_context: null, status: 'active', resolution_kind: null, started_at: now, updated_at: now, completed_at: null, initiator_name: '业务小李', initiator_role_key: 'sales', current_tasks: [task] },
    tasks: [task],
    current_task_access: [{ task_id: 30, can_read: true, can_handle: false }],
    nodes: [{ id: 20, process_instance_id: 10, node_key: 'order_approval', node_type: 'approval', status: 'active', started_at: now, completed_at: null, completed_by_name: '' }],
    events: [{ id: 1, task_id: 30, event_type: 'created', actor_role_key: 'sales', actor_display_name: '业务小李', from_status_key: null, to_status_key: 'ready', reason: null, created_at: now }],
    events_truncated: false,
next_event_id: 0,
  }
}

test('tracking shows actual assignee or role pool and does not invent a next handler', () => {
  const value = trackingFixture()
  assert.equal(trackingHandoff(value.summary), '岗位：老板 · 处理人：审批负责人 · 待处理')
  value.summary.current_tasks[0].assignee_name = ''
  assert.equal(trackingHandoff(value.summary), '岗位：老板 · 待处理')
  value.summary.current_tasks = []
  assert.equal(trackingHandoff(value.summary), '等待后续业务处理')
  value.summary.status = 'completed'
  value.summary.resolution_kind = 'succeeded'
  assert.equal(trackingStatus(value.summary), '正常结束')
  assert.doesNotMatch(trackingHandoff(value.summary), /出货|入账|过账/)
  const approval = { ...value.tasks[0], status: 'ready', required_capability_key: 'workflow.task.approve' }
  assert.equal(trackingResponsibility(approval), '岗位：老板 · 待审批')
  assert.equal(trackingResponsibility({ ...approval, assignee_name: '张三' }), '岗位：老板 · 处理人：张三 · 待审批')
  assert.equal(trackingResponsibility({ ...approval, status: 'done' }), '岗位：老板')
})

test('tracking rejects wrong identity, foreign events, node mismatches and broken pagination', () => {
  const value = trackingFixture()
  assert.equal(requireTrackingDetail(value, { kind: 'process', id: 10 }), value)
  for (const role of ['', null, undefined]) {
    const historical = structuredClone(value)
    historical.summary.initiator_role_key = role
    assert.equal(requireTrackingDetail(historical, { kind: 'process', id: 10 }), historical)
  }
  for (const mutate of [
    (data) => { data.summary.id = 99 },
    (data) => { data.summary.initiator_role_key = { role: 'sales' } },
    (data) => { data.tasks[0].node_instance_id = 99 },
    (data) => { data.events[0].task_id = 99 },
    (data) => { data.events_truncated = true; data.next_event_id = 2 },
    (data) => { data.nodes[0].process_instance_id = 99 },
    (data) => { data.summary.current_tasks[0].status = 'done' },
  ]) {
    const data = structuredClone(value)
    mutate(data)
    assert.throws(() => requireTrackingDetail(data, { kind: 'process', id: 10 }), { isInvalidResponse: true })
  }
  assert.throws(() => requireTrackingPage({ items: [], has_more: true, next_cursor: '' }), { isInvalidResponse: true })
  assert.throws(() => requireTrackingPage({ items: [value.summary, value.summary], total: 2, limit: 20, offset: 0 }), { isInvalidResponse: true })
})

test('standalone followup remains one task; completed exemption with no tasks is valid', () => {
  const value = trackingFixture()
  value.summary = { ...value.summary, kind: 'task', id: 30, process_key: '', title: '跟进交期', status: 'ready' }
  value.tasks[0].node_instance_id = null
  value.nodes = []
  assert.equal(requireTrackingDetail(value, { kind: 'task', id: 30 }), value)
  const exempt = trackingFixture()
  exempt.summary.status = 'completed'
  exempt.summary.completed_at = now
  exempt.summary.current_tasks = []
  exempt.current_task_access = []
  exempt.tasks = []; exempt.nodes = []; exempt.events = []
  assert.equal(requireTrackingDetail(exempt, { kind: 'process', id: 10 }), exempt)
})

test('tracking permissions require one authoritative decision per current task', () => {
  const value = trackingFixture()
  for (const access of [
    undefined, [], [null],
    [{ task_id: 30, can_read: true }],
    [{ task_id: 30, can_read: 'false', can_handle: false }],
    [{ task_id: 30, can_read: false, can_handle: true }],
    [{ task_id: 99, can_read: true, can_handle: true }],
    [value.current_task_access[0], value.current_task_access[0]],
  ]) assert.throws(() => requireTrackingDetail({ ...value, current_task_access: access }, { kind: 'process', id: 10 }), { isInvalidResponse: true })
  for (const access of [
    { task_id: 30, can_read: false, can_handle: false },
    { task_id: 30, can_read: true, can_handle: false },
    { task_id: 30, can_read: true, can_handle: true },
  ]) assert.doesNotThrow(() => requireTrackingDetail({ ...value, current_task_access: [access] }, { kind: 'process', id: 10 }))
})

test('tracking page validates the requested range, true total and complete page length', () => {
  const page = { items: [trackingFixture().summary], total: 21, limit: 20, offset: 20 }
  const params = { limit: 20, offset: 20 }
  assert.equal(requireTrackingPage(page, params), page)
  for (const change of [
    { total: undefined }, { total: -1 }, { total: 1.5 }, { total: '21' }, { total: Number.MAX_SAFE_INTEGER + 1 },
    { limit: 50 }, { offset: 0 }, { offset: -20 }, { offset: '20' }, { total: 22 }, { total: 20 }, { items: [] },
  ]) assert.throws(() => requireTrackingPage({ ...page, ...change }, params), { isInvalidResponse: true })
  assert.doesNotThrow(() => requireTrackingPage({ items: [], total: 5, limit: 20, offset: 40 }, { limit: 20, offset: 40 }))
  assert.doesNotThrow(() => requireTrackingPage({ items: [], total: 0, limit: 20, offset: 0 }))
})

test('tracking identity accepts absent or resolved sources and rejects broken image bindings', () => {
  const value = trackingFixture()
  const item = { kind: 'product', product_id: 8, image_attachment_id: 12, name: '小熊', code: 'BEAR', style_no: 'STYLE', supplier_item_no: '', order_no: '' }
  value.summary.display_context = { available: true, source_no: 'SO-NEW', source_line_count: null, items: [item] }
  assert.equal(requireTrackingDetail(value, { kind: 'process', id: 10 }), value)
  for (const mutate of [
    (data) => { delete data.summary.display_context },
    (data) => { data.summary.display_context.items[0].product_id = 0 },
    (data) => { data.summary.display_context.items[0].kind = 'material' },
    (data) => { data.summary.display_context.available = false },
    (data) => { data.summary.display_context.items[0].image_attachment_id = '12' },
  ]) {
    const broken = structuredClone(value)
    mutate(broken)
    assert.throws(() => requireTrackingDetail(broken, { kind: 'process', id: 10 }), { isInvalidResponse: true })
  }
  value.summary.display_context = { available: false, source_no: '', source_line_count: null, items: [] }
  assert.equal(requireTrackingDetail(value, { kind: 'process', id: 10 }), value)
})

test('submission and source links bind the exact returned process or selected document', () => {
  assert.deepEqual(submittedProcessRef({ process_instance: { id: 10 } }), { kind: 'process', id: 10 })
  assert.deepEqual(submittedProcessRef({ process_context: { process_instance: { id: 11 } } }), { kind: 'process', id: 11 })
  assert.equal(submittedProcessRef({ id: 12 }), null)
  assert.equal(submittedProcessRef({ process_instance: { id: '10' } }), null)
  assert.match(trackingURL({ kind: 'process', id: 10 }), /tracking=started&track_kind=process&track_id=10/)
  assert.match(trackingURL(null, { type: 'sales_order', id: 1 }), /tracking=visible&track_source_type=sales_order&track_source_id=1/)
})

test('visual steps preserve actual completion, blocked responsibility and routing uncertainty', () => {
  const value = trackingFixture()
  value.nodes.push(
    { id: 21, node_key: 'engineering_data', node_type: 'human_task', status: 'blocked', completed_at: null, completed_by_name: '' },
    { id: 22, node_key: 'end', node_type: 'end', status: 'waiting' },
  )
  value.nodes[0] = { ...value.nodes[0], status: 'completed', completed_at: now + 10 }
  value.events.unshift({ ...value.events[0], id: 2, event_type: 'status_changed', to_status_key: 'done', actor_role_key: 'boss', actor_display_name: '实际审批人', created_at: now + 10 })
  value.events.unshift({ ...value.events[0], id: 3, event_type: 'payload_refreshed', actor_display_name: '后续刷新人' })
  value.summary.current_tasks = [{ ...value.tasks[0], task_id: 31, node_instance_id: 21, task_name: '工程资料', owner_role_key: 'engineering', assignee_name: '', status: 'blocked' }]
  const model = buildTrackingStageModel(value)
  assert.deepEqual(model.items.map((item) => item.label), ['订单审批', '工程资料'])
  assert.match(model.items[0].detail, /实际审批人.*老板/)
  assert.doesNotMatch(model.items[0].detail, /后续刷新人/)
  assert.equal(model.items[0].tone, 'completed')
  assert.equal(model.items[1].tone, 'blocked')
  assert.equal(model.items[1].current, true)
  assert.equal(model.items[1].detail, '岗位：工程 · 待处理')
  value.nodes[0].outcome = 'rejected'
  value.events = []
  const incompleteHistory = buildTrackingStageModel(value)
  assert.equal(incompleteHistory.items[0].tone, 'rejected')
  assert.doesNotMatch(incompleteHistory.items[0].detail, /审批负责人|实际审批人/)
})
