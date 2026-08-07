import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildWorkflowProcessStageModel,
  getProcessLabel,
  getProcessNodeLabel,
  getProcessNodeStatusLabel,
  getProcessStatusLabel,
  getWorkflowTaskDisplayName,
  isDisplayOnlyWorkflowTask,
  requireWorkflowProcessContext,
} from './processRuntimePresentation.mjs'

function context(overrides = {}) {
  const instance = {
    id: 10,
    process_key: 'sales_order_acceptance',
    process_version: 'v1',
    status: 'active',
    started_at: 1_800_000_000,
  }
  const completed = {
    id: 11,
    process_instance_id: 10,
    node_key: 'submit_sales_order',
    node_type: 'domain_command',
    attempt: 1,
    version: 2,
    status: 'completed',
  }
  const current = {
    id: 12,
    process_instance_id: 10,
    node_key: 'order_approval',
    node_type: 'approval',
    attempt: 1,
    version: 1,
    status: 'active',
  }
  return {
    source: { type: 'sales_order', id: 42, no: 'SO-42' },
    process_instance: instance,
    approval_form: null,
    nodes: [completed, current],
    current_nodes: [current],
    completed_nodes: [completed],
    ...overrides,
  }
}

test('process runtime presentation validates canonical task-scoped context', () => {
  const value = context()
  assert.equal(requireWorkflowProcessContext(value), value)
  assert.equal(getProcessLabel(value.process_instance), '销售订单受理')
  assert.equal(getProcessStatusLabel(value.process_instance), '办理中')
  assert.equal(getProcessNodeLabel(value.current_nodes[0]), '订单审批')
})

test('process runtime presentation accepts no formal form as null and rejects an empty object', () => {
  const withoutFormalForm = context()
  assert.equal(withoutFormalForm.approval_form, null)
  assert.equal(
    requireWorkflowProcessContext(withoutFormalForm),
    withoutFormalForm
  )

  assert.throws(
    () =>
      requireWorkflowProcessContext(
        context({
          approval_form: {},
        })
      ),
    /业务轨迹暂时无法确认/u
  )
})

test('process runtime presentation covers every current Product Core process', () => {
  assert.equal(
    getProcessLabel({ process_key: 'material_supply' }),
    '采购订单提交与审批'
  )
  assert.equal(
    getProcessLabel({ process_key: 'finished_goods_delivery' }),
    '出货财务放行'
  )
  assert.equal(
    getProcessLabel({ process_key: 'finance_payment_approval' }),
    '收付款审批'
  )
  assert.equal(
    getProcessLabel({ process_key: 'inventory_adjustment_approval' }),
    '人工库存调整'
  )
  assert.equal(
    getProcessLabel({ process_key: 'production_exception_approval' }),
    '生产异常处置'
  )
  const nodeLabels = {
    submit_sales_order: '提交销售订单',
    order_approval: '订单审批',
    activate_sales_order: '销售订单生效',
    engineering_data: '工程资料',
    order_review: '订单复核',
    submit_purchase_order: '提交采购订单',
    purchase_order_approval: '采购订单审批',
    approve_purchase_order: '采购订单批准生效',
    purchase_receipt_source: '采购收货来源',
    incoming_qc: '来料质检',
    warehouse_inbound: '仓库入库',
    finished_goods_quality: '成品质检',
    shipment_finance_approval: '出货财务审批',
    shipment_finance_release: '财务放行',
    shipment_execution: '执行出货',
    receivable_lead: '应收跟进',
    finance_payment_approval: '收付款审批',
    approve_finance_payment: '确认收付款申请',
    finance_payment_execution: '收付款执行交接',
    post_finance_payment: '收付款过账核销',
    reject_finance_payment: '退回收付款申请',
    submit_inventory_adjustment: '提交人工库存调整',
    inventory_adjustment_approval: '人工库存调整审批',
    approve_inventory_adjustment: '确认人工库存调整',
    inventory_adjustment_execution: '人工库存调整执行交接',
    post_inventory_adjustment: '人工库存调整过账',
    reject_inventory_adjustment: '退回人工库存调整',
    production_exception_decision_approval: '生产异常审批',
    approve_production_exception: '确认生产异常处置',
    production_exception_execution: '生产异常执行交接',
    execute_production_exception: '执行生产异常处置',
    reject_production_exception: '退回生产异常申请',
    over_issue_end: '超领审批结束',
    rejected_end: '流程退回结束',
    end: '流程结束',
  }
  Object.entries(nodeLabels).forEach(([nodeKey, label]) => {
    assert.equal(getProcessNodeLabel({ node_key: nodeKey }), label)
  })
})

test('process runtime presentation uses business task names without exposing node keys', () => {
  assert.equal(
    getWorkflowTaskDisplayName({ task_name: 'engineering_data' }),
    '工程资料'
  )
  assert.equal(
    getWorkflowTaskDisplayName({ task_name: '客户确认样品' }),
    '客户确认样品'
  )
  assert.equal(
    getWorkflowTaskDisplayName({ task_name: 'unknown_internal_step' }),
    '业务任务'
  )
  assert.equal(getWorkflowTaskDisplayName({}), '未命名任务')
})

test('process runtime presentation validates all exception approval form profiles', () => {
  for (const [processKey, profileKey] of [
    ['finance_payment_approval', 'finance_payment_approval'],
    ['inventory_adjustment_approval', 'inventory_adjustment_approval'],
    ['production_exception_approval', 'production_exception_approval'],
  ]) {
    const value = context()
    const [, approvalNode] = value.nodes
    value.process_instance.process_key = processKey
    approvalNode.node_key =
      processKey === 'production_exception_approval'
        ? 'production_exception_decision_approval'
        : profileKey
    approvalNode.form_profile_key = profileKey
    value.linked_node = approvalNode
    value.approval_form = {
      profile_key: profileKey,
      reason_required: true,
      approved_quantity:
        profileKey === 'production_exception_approval'
          ? { required: false, precision: 20, scale: 6 }
          : null,
    }
    assert.equal(requireWorkflowProcessContext(value), value)
  }
})

test('process runtime presentation rejects approval form/profile drift', () => {
  const value = context()
  const [, approvalNode] = value.nodes
  value.process_instance.process_key = 'production_exception_approval'
  approvalNode.node_key = 'production_exception_decision_approval'
  approvalNode.form_profile_key = 'production_exception_approval'
  value.linked_node = approvalNode
  value.approval_form = {
    profile_key: 'production_exception_approval',
    reason_required: true,
    approved_quantity: { required: false, precision: 20, scale: 2 },
  }
  assert.throws(
    () => requireWorkflowProcessContext(value),
    /业务轨迹暂时无法确认/u
  )
})

test('process runtime presentation distinguishes rejected node from blocked process', () => {
  assert.equal(
    getProcessNodeStatusLabel({ status: 'completed', outcome: 'rejected' }),
    '已退回'
  )
  assert.equal(getProcessStatusLabel({ status: 'blocked' }), '流程受阻')
})

test('process runtime presentation builds execution trail without inventing future stages or a percent', () => {
  const value = context()
  const [, currentNode] = value.nodes
  value.linked_node = currentNode
  value.nodes.push({
    id: 13,
    process_instance_id: 10,
    node_key: 'activate_sales_order',
    node_type: 'domain_command',
    attempt: 1,
    version: 1,
    status: 'waiting',
  })
  const model = buildWorkflowProcessStageModel(value)

  assert.deepEqual(
    model.items.map((item) => item.label),
    ['提交销售订单', '订单审批']
  )
  assert.deepEqual(model.counts, {
    completed: 1,
    current: 1,
    blocked: 0,
    rejected: 0,
  })
  assert.equal(model.items[1].linked, true)
  assert.equal(model.hasUndecidedRoute, true)
  assert.equal(model.handoffLabel, '当前办理阶段：订单审批')
  assert.equal(
    model.summaryLabel,
    '已结束步骤 1 · 当前步骤 1 · 后续路径待流程决定'
  )
  assert.equal('percent' in model, false)
})

test('process runtime presentation keeps blocked and retried stages explicit', () => {
  const value = context()
  const [, currentNode] = value.nodes
  currentNode.status = 'blocked'
  currentNode.attempt = 2
  value.current_nodes = [currentNode]
  value.linked_node = currentNode

  const model = buildWorkflowProcessStageModel(value)
  assert.equal(model.items[1].tone, 'blocked')
  assert.equal(model.items[1].attemptLabel, '第 2 次')
  assert.equal(model.handoffLabel, '当前受阻阶段：订单审批')
})

test('process runtime presentation preserves canonical attempt order and unique keys', () => {
  const value = context()
  const firstAttempt = {
    ...value.nodes[1],
    id: 13,
    attempt: 1,
    status: 'completed',
  }
  const secondAttempt = {
    ...value.nodes[1],
    id: 14,
    attempt: 2,
  }
  value.nodes = [secondAttempt, firstAttempt, value.nodes[0]]
  value.current_nodes = [secondAttempt]
  value.completed_nodes = [value.nodes[2], firstAttempt]
  value.linked_node = secondAttempt

  const model = buildWorkflowProcessStageModel(value)
  assert.deepEqual(
    model.items.map((item) => item.id),
    [11, 13, 14]
  )
  assert.deepEqual(
    model.items.map((item) => item.attemptLabel),
    ['', '', '第 2 次']
  )
  assert.equal(new Set(model.items.map((item) => item.key)).size, 3)
})

test('completed rejected process does not present dormant branches as undecided future work', () => {
  const value = context()
  const rejectedNode = {
    ...value.nodes[1],
    status: 'completed',
    outcome: 'rejected',
  }
  const dormantBranch = {
    id: 13,
    process_instance_id: 10,
    node_key: 'activate_sales_order',
    node_type: 'domain_command',
    attempt: 1,
    version: 1,
    status: 'waiting',
  }
  value.process_instance.status = 'completed'
  value.nodes = [value.nodes[0], rejectedNode, dormantBranch]
  value.current_nodes = []
  value.completed_nodes = [value.nodes[0], rejectedNode]
  value.linked_node = rejectedNode

  const model = buildWorkflowProcessStageModel(value)
  assert.equal(model.hasUndecidedRoute, false)
  assert.equal(model.items[1].tone, 'rejected')
  assert.equal(model.items[1].statusLabel, '已退回')
  assert.equal(model.handoffLabel, '流程已退回结束。')
  assert.equal(model.summaryLabel, '已结束步骤 2 · 当前步骤 0')
})

test('process runtime presentation fails closed on foreign or invalid nodes', () => {
  assert.throws(
    () =>
      requireWorkflowProcessContext(
        context({
          nodes: [
            {
              id: 12,
              process_instance_id: 99,
              node_key: 'order_approval',
              node_type: 'approval',
              attempt: 1,
              version: 1,
              status: 'active',
            },
          ],
        })
      ),
    /业务轨迹暂时无法确认/u
  )
  assert.throws(
    () =>
      requireWorkflowProcessContext(
        context({
          process_instance: {
            ...context().process_instance,
            process_key: 'unknown_process',
          },
        })
      ),
    /业务轨迹暂时无法确认/u
  )
  const canonicalDrift = context()
  canonicalDrift.current_nodes = [
    { ...canonicalDrift.current_nodes[0], version: 2 },
  ]
  assert.throws(
    () => requireWorkflowProcessContext(canonicalDrift),
    /业务轨迹暂时无法确认/u
  )
})

test('simulated task catalog is explicit display-only evidence', () => {
  assert.equal(
    isDisplayOnlyWorkflowTask({ payload: { simulated_only: true } }),
    true
  )
  assert.equal(isDisplayOnlyWorkflowTask({ process_instance_id: 10 }), false)
})
