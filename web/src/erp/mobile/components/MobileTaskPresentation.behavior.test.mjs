import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('空的选填说明省略，历史必填缺失如实显示未记录', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Receipt } = await import('../../components/workflow/WorkflowTaskReceipt.jsx')
  const task = { task_name: '核对资料', task_status_key: 'ready' }
  await harness.render(h(Receipt, { task, receipt: { actionTitle: '任务已恢复待处理', reason: '  ', additionalReason: '  ', actorLabel: '模拟办理人', timeLabel: '2026/10/31 00:10' } }))
  assert.match(document.querySelector('.workflow-task-receipt').textContent, /任务已恢复待处理.*模拟办理人/su)
  assert.deepEqual([...document.querySelectorAll('.workflow-task-receipt dt')].map((item) => item.textContent), ['办理人', '办理时间'])
  assert.doesNotMatch(document.querySelector('.workflow-task-receipt').textContent, /未填写|问题已解决|未补充说明/u)
  await harness.render(h(Receipt, { task: { ...task, task_status_key: 'rejected' }, events: [{ id: 1, event_type: 'status_changed', from_status_key: 'ready', to_status_key: 'rejected', reason: '' }] }))
  const fields = [...document.querySelectorAll('.workflow-task-receipt dl > div')]
  assert(fields.some((item) => item.textContent === '退回原因未记录'))
  const { default: Trail } = await import('../../components/workflow/WorkflowTaskEventTrail.jsx')
  await harness.render(h(Trail, { task, events: [{ id: 2, event_type: 'urge_task', reason: '', actor_display_name: '模拟办理人', created_at: 1793370000 }] }))
  assert.doesNotMatch(document.querySelector('.workflow-task-event-trail__list').textContent, /未补充说明/u)
  await harness.click(document.querySelector('[aria-label="查看已催办任务记录详情"]'))
  assert.match(document.querySelector('.workflow-task-event-trail__audit').textContent, /催办说明未补充说明/u)
})

test('任务业务资料保留所有有值字段、数值零和否，省略选填空值并沿用字段权限', async (t) => {
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
  assert.equal(document.querySelector('.ant-descriptions') === null, true)
  const fields = [...document.querySelectorAll('.mobile-task-facts > dl > div')]
  assert.deepEqual(fields.map((field) => field.querySelector('dt').textContent), ['单号', '数量（个）', '金额（USD）', '冻结'])
  assert.deepEqual(fields.slice(1).map((field) => field.querySelector('dd').textContent), ['0', '0.00', '否'])
  assert.ok(fields[0].classList.contains('mobile-task-facts__field--wide'))
  assert.doesNotMatch(document.body.textContent, /无权读取|不可泄露/u)
  assert.equal(document.querySelector('.mobile-task-facts__empty') === null, true)
  assert.doesNotMatch(document.body.textContent, /包装要求|未填写信息/u)
  await harness.render(h(Details, { columns, record }))
  assert.ok(document.querySelector('.ant-descriptions'))
  assert.match(document.body.textContent, /包装要求/u)
  assert.doesNotMatch(document.body.textContent, /不可泄露/u)
})

test('销售订单缺值在原字段显示统一状态，金额更新与权限过滤不产生残留提示', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: Details }, { buildSalesOrderColumns, buildSalesOrderListColumns }] = await Promise.all([
    import('../../components/business-list/BusinessRecordDetails.jsx'),
    import('../../components/sales-orders/salesOrderColumns.jsx'),
  ])
  const columns = buildSalesOrderListColumns(buildSalesOrderColumns())
  const record = { currency: 'CNY', order_total: null, tax_mode: null, freight_terms: null, quoted_freight_amount: null, contact_snapshot: {} }
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record }))
  const statuses = [...document.querySelectorAll('.mobile-task-facts__status')]
  assert.deepEqual(statuses.map((node) => node.textContent), ['待补充', '暂未生成', '待补充'])
  assert.ok(statuses.every((node) => node.tagName === 'SPAN' && !node.classList.contains('ant-tag')))
  assert.deepEqual(statuses.map((node) => node.dataset.missingTone), ['warning', 'neutral', 'warning'])
  assert.equal(document.querySelectorAll('.mobile-task-facts__status[data-missing-tone="warning"]').length, 2)
  assert.equal(document.querySelector('.mobile-task-facts__note').textContent, '计税方式、运费条件尚未补齐。')
  assert.equal(document.querySelectorAll('.mobile-task-facts button').length, 0)
  assert.doesNotMatch(document.querySelector('.mobile-task-facts').textContent, /未填写信息|联系人|产品单价.*未齐/u)
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { ...record, order_total: '0', tax_mode: 'NONE', freight_terms: 'EXCLUDED', quoted_freight_amount: '' } }))
  assert.match(document.body.textContent, /订单总额CNY 0/u)
  assert.deepEqual([...document.querySelectorAll('.mobile-task-facts__status')].map((node) => node.textContent), ['待补充'])
  assert.match(document.querySelector('.mobile-task-facts__status').closest('div').textContent, /报价运费/u)
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { currency: 'CNY', tax_mode: 'NONE', freight_terms: 'INCLUDED' } }))
  assert.equal(document.querySelectorAll('.mobile-task-facts__status').length, 0)
  assert.doesNotMatch(document.body.textContent, /订单总额|暂未生成|待补充/u)
  const totalColumn = buildSalesOrderColumns().find((column) => column.dataIndex === 'order_total')
  await harness.render(h(Details, { presentation: 'mobile-task', columns: [{ ...totalColumn, hiddenByEffectiveFieldPolicy: true }], record }))
  assert.doesNotMatch(document.body.textContent, /订单总额|暂未生成|待补充/u)
})

test('明确的缺值原因沿用字段展示，切换委外资料后清除状态和空备注', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: Details } = await import('../../components/business-list/BusinessRecordDetails.jsx')
  const columns = [
    { title: '资料确认', dataIndex: 'confirmed', taskDetailEmptyValue: (record) => record.confirmed == null ? { text: '待补充', tone: 'warning', reason: record.missing_reason } : null },
    { title: '备注', dataIndex: 'note' },
  ]
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { confirmed: null, missing_reason: '收货要求尚未确认', note: '' } }))
  assert.equal(document.querySelector('.mobile-task-facts__note').textContent, '收货要求尚未确认')
  assert.equal(document.querySelectorAll('.mobile-task-facts button').length, 0)
  await harness.render(h(Details, { presentation: 'mobile-task', columns, record: { confirmed: true } }))
  assert.equal(document.querySelector('.mobile-task-facts dd').textContent, '是')
  assert.equal(document.querySelector('.mobile-task-facts__status') === null, true)
  await harness.render(h(Details, { presentation: 'mobile-task', columns: [{ title: '退货数量', dataIndex: 'quantity' }, { title: '备注', dataIndex: 'note' }], record: { quantity: 80, note: null } }))
  assert.match(document.body.textContent, /退货数量80/u)
  assert.doesNotMatch(document.body.textContent, /备注|待补充|收货要求|未填写/u)
  assert.equal(document.querySelectorAll('.mobile-task-facts__status, .mobile-task-facts__note').length, 0)
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
    assert.equal(document.querySelector('.mobile-task-facts__empty') === null, true)
    assert.match(document.querySelector('.mobile-task-facts > dl').textContent, /总净重（克）/u)
    assert.equal(document.querySelector('.mobile-task-facts dd').textContent, expected)
    const hint = document.querySelector('.mobile-task-facts__status')
    assert.equal(Boolean(hint), total_net_weight_g === null)
    if (hint) {
      assert.equal(hint.classList.contains('ant-tag'), false)
      assert.equal(hint.dataset.missingTone, status === ShipmentStatus.DRAFT ? 'warning' : 'neutral')
    }
  }
  await harness.render(h(Details, { presentation: 'mobile-task', columns: [{ ...column, hiddenByEffectiveFieldPolicy: true }], record: { status: ShipmentStatus.DRAFT, total_net_weight_g: null } }))
  assert.equal(document.querySelector('.mobile-task-facts__status') === null, true)
  assert.doesNotMatch(document.body.textContent, /总净重|待确认/u)
  await harness.render(h(Details, { columns: [column], record: { status: ShipmentStatus.DRAFT, total_net_weight_g: null } }))
  assert.equal(document.querySelector('.mobile-task-facts__status') === null, true)
  assert.match(document.body.textContent, /待确认/u)
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
  const harness = await businessFormHarness(t, { rpc: async (method, params) => {
    assert.equal(method, 'list_attachments')
    assert.deepEqual(params, { owner_type: 'workflow_task', owner_id: 1 })
    return { data: { attachments: [] } }
  } })
  const { default: Receipt } = await import('./MobileTaskReceiptScreen.jsx')
  const task = { id: 1, task_name: '核对包装', task_group: 'business_followup', task_status_key: 'blocked', owner_role_key: 'sales', source_type: 'sales_order', source_no: 'SO-COPY-001', payload: {}, display_context: { available: true, items: [] } }
  const props = { task, action: 'resume', feedback: '规格已核对。', reason: '规格已核对。', outcome: 'unknown', onRetryConfirm() {} }
  await harness.render(h(Receipt, props))
  const fields = () => [...document.querySelectorAll('.workflow-task-receipt dd')].map((item) => item.textContent)
  assert.equal(fields().filter((text) => text === '规格已核对。').length, 1)
  assert.match(document.querySelector('[data-outcome="unknown"]').textContent, /尚未确认本次提交是否生效/u)
  assert.match(document.querySelector('.workflow-task-receipt__heading').textContent, /已知状态：/u)
  assert.ok(harness.button('重新确认结果'))
  assert.ok(harness.button('查看任务附件'))
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
