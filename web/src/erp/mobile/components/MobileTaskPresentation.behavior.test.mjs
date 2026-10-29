import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('手机业务资料保留所有有值字段、数值零和否，缺值可展开，字段权限沿用共享映射', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Details } = await import('../../components/business-list/BusinessRecordDetails.jsx')
  const columns = [
    { title: '单号', dataIndex: 'no', copyable: true, detailCopyable: true },
    { title: '数量（个）', dataIndex: 'quantity' },
    { title: '金额（USD）', dataIndex: 'amount' },
    { title: '冻结', dataIndex: 'frozen' },
    { title: '包装要求', dataIndex: 'packaging' },
    { title: '无权读取的字段', dataIndex: 'secret', hiddenByEffectiveFieldPolicy: true },
  ]
  const record = { no: 'SHIP-LONG-20261019-000000000000001', quantity: 0, amount: '0.00', frozen: false, packaging: null, secret: '不可泄露' }
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record }))
  assert.equal(document.querySelector('.ant-descriptions'), null)
  const fields = [...document.querySelectorAll('.mobile-task-facts > dl > div')]
  assert.deepEqual(fields.map((field) => field.querySelector('dt').textContent), ['单号', '数量（个）', '金额（USD）', '冻结'])
  assert.deepEqual(fields.slice(1).map((field) => field.querySelector('dd').textContent), ['0', '0.00', '否'])
  assert.ok(fields[0].classList.contains('mobile-task-facts__field--wide'))
  assert.doesNotMatch(document.body.textContent, /无权读取|不可泄露/u)
  const more = document.querySelector('.mobile-task-facts__empty')
  assert.equal(more.open, false)
  await harness.click(more.querySelector('summary'))
  assert.equal(more.open, true)
  assert.match(more.textContent, /包装要求/u)
  await harness.render(h(Details, { columns, record }))
  assert.ok(document.querySelector('.ant-descriptions'))
  assert.match(document.body.textContent, /包装要求/u)
  assert.doesNotMatch(document.body.textContent, /不可泄露/u)
})

test('出货净重缺失与最终重量口径保持默认可见，不并入空信息', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Details }, { buildShipmentColumns }, { ShipmentStatus }] = await Promise.all([
    import('../../components/business-list/BusinessRecordDetails.jsx'),
    import('../../components/shipments/shipmentColumns.jsx'),
    import('../../../common/consts/statuses.generated.mjs'),
  ])
  const column = buildShipmentColumns({ salesOrdersByID: new Map() }).find((item) => item.dataIndex === 'total_net_weight_g')
  for (const [status, total_net_weight_g, expected] of [
    [ShipmentStatus.DRAFT, null, '待确认'],
    [ShipmentStatus.SHIPPED, null, '未记录'],
    [ShipmentStatus.SHIPPED, '1500', '最终 1500 克'],
    [ShipmentStatus.DRAFT, '0', '实际 0 克'],
  ]) {
    await harness.render(h(Details, { presentation: 'mobile-task', columns: [column], record: { status, total_net_weight_g } }))
    assert.equal(document.querySelector('.mobile-task-facts__empty'), null)
    assert.match(document.querySelector('.mobile-task-facts > dl').textContent, /总净重（克）/u)
    assert.equal(document.querySelector('.mobile-task-facts dd').textContent, expected)
  }
})

test('共享任务信息卡不显示空业务分区，有值摘要和零数量保持可见', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Card }, { hasWorkflowFollowupDetails }] = await Promise.all([
    import('../../components/workflow/WorkflowTaskInfoCard.jsx'),
    import('../../components/workflow/WorkflowFollowupDetails.jsx'),
  ])
  const task = { id: 1, task_name: '核对包装', task_group: 'business_followup', task_status_key: 'ready', payload: {}, display_context: { available: true, items: [] } }
  assert.equal(hasWorkflowFollowupDetails(task), false)
  assert.equal(hasWorkflowFollowupDetails({ ...task, payload: { feedback: '已核对' } }), false)
  assert.equal(hasWorkflowFollowupDetails({ ...task, task_status_key: 'done', payload: { feedback: '已核对' } }), true)
  assert.equal(hasWorkflowFollowupDetails({ ...task, payload: { description: '  包装要求  ' } }), true)
  await harness.render(h(Card, { task, title: task.task_name, showDetails: false }))
  assert.equal(document.querySelectorAll('.workflow-task-info-card').length, 1)
  await harness.render(h(Card, { task, title: task.task_name, showDetails: false, businessInfo: h('p', null, '已核对数量 0') }))
  assert.equal(document.querySelectorAll('.workflow-task-info-card').length, 2)
  assert.match(document.querySelector('[aria-label="业务信息"]').textContent, /已核对数量 0/u)
})

test('手机回执去重相同意见，同时保留不同说明、未知结果与失败提示', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Receipt } = await import('./MobileTaskReceiptScreen.jsx')
  const task = { id: 1, task_name: '核对包装', task_group: 'business_followup', task_status_key: 'blocked', owner_role_key: 'sales', source_type: 'sales_order', source_no: 'SO-COPY-001', payload: {}, display_context: { available: true, items: [] } }
  const props = { task, action: 'resume', feedback: '规格已核对。', reason: '规格已核对。', outcome: 'unknown', onRetryConfirm() {} }
  await harness.render(h(Receipt, props))
  const fields = () => [...document.querySelectorAll('.workflow-task-receipt dd')].map((item) => item.textContent)
  assert.equal(fields().filter((text) => text === '规格已核对。').length, 1)
  assert.match(document.querySelector('[data-outcome="unknown"]').textContent, /尚未确认本次提交是否生效/u)
  assert.match(document.querySelector('.workflow-task-receipt__heading').textContent, /已知状态：/u)
  assert.ok(harness.button('重新确认结果'))
  assert.ok(harness.button('查看附件'))
  await harness.render(h(Receipt, { ...props, reason: '仓库尚未复核。', outcome: 'failed' }))
  assert.ok(fields().includes('规格已核对。'))
  assert.ok(fields().includes('仓库尚未复核。'))
  assert.equal(document.querySelector('[data-outcome="failed"]').getAttribute('role'), 'alert')
  assert.match(document.querySelector('[data-outcome="failed"]').textContent, /本次操作未完成/u)
  assert.equal(document.querySelectorAll('[data-step-key]').length, 3)
})

test('手机最近记录与完整记录共用事件表达，审计详情保留精确时间与版本', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ WorkflowTaskEventEntries }, { buildWorkflowTaskEventTrailModel }] = await Promise.all([
    import('../../components/workflow/WorkflowTaskEventTrail.jsx'),
    import('../../utils/workflowTaskEventPresentation.mjs'),
  ])
  const { items } = buildWorkflowTaskEventTrailModel({ task: { id: 1 }, events: [{ id: 7, task_id: 1, event_type: 'status_changed', from_status_key: 'blocked', to_status_key: 'ready', actor_display_name: '业务经办人', actor_role_key: 'sales', created_at: 1792501205, task_version: 3, reason: '规格和包装已复核。' }] })
  await harness.render(h(WorkflowTaskEventEntries, { items, variant: 'mobile' }))
  assert.match(document.body.textContent, /业务经办人/u)
  assert.match(document.body.textContent, /规格和包装已复核/u)
  assert.match(document.body.textContent, /已阻塞.*待处理/u)
  assert.doesNotMatch(document.body.textContent, /任务版本/u)
  await harness.click(harness.button('详情'))
  assert.match(document.body.textContent, /任务版本/u)
  assert.match(document.body.textContent, new RegExp(items[0].timeLabel, 'u'))
})
