import assert from 'node:assert/strict'
import test from 'node:test'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { isWorkflowApprovalTask, WORKFLOW_APPROVAL_CAPABILITY_KEYS } from './workflowTaskActionContract.mjs'
import { TASK_STAGE_HANDLING, taskDeviceNotice, taskHandlingMatrix, taskHandlingPolicy, taskNeedsDesktop } from './taskHandlingPolicy.mjs'

test('每个正式任务环节有设备分工，目录新增或删除不能静默遗漏', () => {
  assert.deepEqual(Object.keys(TASK_STAGE_HANDLING).sort(), catalog.stages.map((stage) => stage.key).sort())
  const rows = taskHandlingMatrix()
  assert.equal(rows.length, catalog.stages.length)
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length)
  for (const row of rows) {
    assert(row.kindLabel && row.input && row.mobile)
    assert(row.flows.every((flow) => catalog.fulfillment_flow.includes(flow)))
  }
})

test('分类使用正式环节和具体任务能力，不能按来源单据或名称统一禁用手机', () => {
  const purchase = { discovery: { stage_key: 'purchasing' }, source_type: 'purchase_order' }
  assert.equal(taskNeedsDesktop(purchase), true)
  assert.equal(taskNeedsDesktop({ ...purchase, task_group: 'handoff_purchase_arrival' }), false)
  for (const capability of WORKFLOW_APPROVAL_CAPABILITY_KEYS) {
    const task = { ...purchase, required_capability_key: capability }
    assert.equal(taskHandlingPolicy(task).kind, 'decision')
    assert.equal(taskNeedsDesktop(task), false)
  }
  assert.equal(taskHandlingPolicy({ task_name: '编辑 BOM', source_type: 'bom' }), null)
  assert.equal(taskHandlingPolicy({ discovery: { stage_key: 'unregistered' } }), null)
})

test('工程资料与修订在电脑办理，出货区分编制和实际执行，历史不出现继续办理提示', () => {
  for (const group of ['engineering_data', 'engineering_material_revision']) {
    assert.equal(taskNeedsDesktop({ task_group: group }), true)
  }
  const shipment = { task_group: 'handoff_shipment_execute', task_status_key: 'ready' }
  assert.equal(taskHandlingPolicy(shipment).mobile, 'limited')
  assert.match(taskDeviceNotice(shipment), /草稿编制和提交审批在电脑/)
  for (const task_status_key of ['done', 'rejected', 'withdrawn']) {
    assert.equal(taskDeviceNotice({ ...shipment, task_status_key }), '')
    assert.equal(taskDeviceNotice({ task_group: 'engineering_data', task_status_key }), '')
  }
})

test('PMC 订单评审使用审核决策界面，但不能因此取得审批能力', () => {
  const task = { task_group: 'order_review', required_capability_key: 'workflow.task.complete', discovery: { stage_key: 'sales_order' } }
  assert.equal(taskHandlingPolicy(task).kind, 'decision')
  assert.equal(taskNeedsDesktop(task), false)
  assert.equal(isWorkflowApprovalTask(task), false)
})
