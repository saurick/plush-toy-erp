import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getProcessLabel,
  getProcessNodeLabel,
  getProcessNodeStatusLabel,
  getProcessStatusLabel,
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
    status: 'completed',
  }
  const current = {
    id: 12,
    process_instance_id: 10,
    node_key: 'order_approval',
    node_type: 'approval',
    attempt: 1,
    status: 'active',
  }
  return {
    source: { type: 'sales_order', id: 42, no: 'SO-42' },
    process_instance: instance,
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

test('process runtime presentation covers every current Product Core process', () => {
  assert.equal(getProcessLabel({ process_key: 'material_supply' }), '采购供料')
  assert.equal(
    getProcessLabel({ process_key: 'finished_goods_delivery' }),
    '成品交付'
  )
  const nodeLabels = {
    submit_sales_order: '提交销售订单',
    order_approval: '订单审批',
    activate_sales_order: '销售订单生效',
    engineering_data: '工程资料',
    order_review: '订单复核',
    purchase_order_approval: '采购订单审批',
    approve_purchase_order: '采购订单审批',
    purchase_receipt_source: '采购收货来源',
    incoming_qc: '来料质检',
    warehouse_inbound: '仓库入库',
    finished_goods_quality: '成品质检',
    shipment_finance_approval: '出货财务审批',
    shipment_finance_release: '财务放行',
    shipment_execution: '执行出货',
    receivable_lead: '应收跟进',
    end: '流程结束',
  }
  Object.entries(nodeLabels).forEach(([nodeKey, label]) => {
    assert.equal(getProcessNodeLabel({ node_key: nodeKey }), label)
  })
})

test('process runtime presentation distinguishes rejected node from blocked process', () => {
  assert.equal(
    getProcessNodeStatusLabel({ status: 'completed', outcome: 'rejected' }),
    '已退回'
  )
  assert.equal(getProcessStatusLabel({ status: 'blocked' }), '流程受阻')
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
              status: 'active',
            },
          ],
        })
      ),
    /流程位置暂时无法确认/u
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
    /流程位置暂时无法确认/u
  )
})

test('simulated task catalog is explicit display-only evidence', () => {
  assert.equal(
    isDisplayOnlyWorkflowTask({ payload: { simulated_only: true } }),
    true
  )
  assert.equal(isDisplayOnlyWorkflowTask({ process_instance_id: 10 }), false)
})
