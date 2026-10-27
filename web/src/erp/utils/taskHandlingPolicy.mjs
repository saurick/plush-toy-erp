import { WorkflowTaskDiscoveryCatalog as catalog } from '../../common/consts/workflowTaskDiscovery.generated.mjs'
import { isWorkflowApprovalTask } from './workflowTaskActionContract.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'

// Presentation only. Responsibility, permission, state transitions and writes
// remain in the existing task access and domain commands.
export const TASK_HANDLING_KINDS = Object.freeze({
  decision: {
    label: '审核决策',
    mobile: 'full',
    input: '核对依据、选择结论、填写意见',
  },
  capture: {
    label: '简单登记',
    mobile: 'full',
    input: '本次对象的少量字段和附件',
  },
  onsite: {
    label: '现场逐项作业',
    mobile: 'full',
    input: '按来源行或批次填写数量、结论及差异',
  },
  authoring: {
    label: '单据与明细编辑',
    mobile: 'desktop',
    input: '编辑单据、BOM、排程明细，分配数量或金额',
  },
  coordination: {
    label: '协调跟进',
    mobile: 'full',
    input: '本次反馈、原因或授权转交',
  },
  automatic: {
    label: '系统自动推进',
    mobile: 'observe',
    input: '读取正式动作产生的结果',
  },
})

const stageKinds = {
  authoring: [
    'engineering_data',
    'finished_goods_rework',
    'production_fact',
    'receivable_registration',
    'invoice_registration',
    'payable_registration',
    'reconciliation',
    'incoming_exception',
    'cutting_exception',
    'sewing_exception',
    'handwork_exception',
    'cutting_execute',
    'sewing_execute',
    'handwork_execute',
    'outsourcing_contract',
    'engineering',
    'sales_order',
    'purchasing',
    'production_schedule',
    'production_exception',
    'production_batch',
    'payment',
    'inventory',
  ],
  onsite: [
    'finished_goods_qc',
    'finished_goods_inbound',
    'purchase_count',
    'incoming_quality',
    'material_inbound',
    'finished_inbound',
    'packaging',
    'cutting_quality',
    'shell_quality',
    'finished_quality',
    'needle_quality',
    'sampling_quality',
    'customer_quality',
    'cutting_return',
    'cutting_issue',
    'sewing_return',
    'sewing_issue',
    'handwork_return',
    'handwork_issue',
    'outsourcing_return',
    'quality_other',
    'purchase_receipt',
  ],
  capture: ['packaging_version', 'outsourcing_quality_prepare'],
  decision: ['cutting_decision', 'sewing_decision', 'handwork_decision'],
  coordination: ['followup', 'unclassified'],
}

export const TASK_STAGE_HANDLING = Object.freeze(
  Object.fromEntries([
    ...Object.entries(stageKinds).flatMap(([kind, stages]) =>
      stages.map((stage) => [stage, Object.freeze({ kind })])
    ),
    [
      'shipment',
      Object.freeze({
        kind: 'onsite',
        mobile: 'limited',
        scope:
          '手机核对已准备的出货资料并确认实际发货；草稿编制和提交审批在电脑办理。',
      }),
    ],
  ])
)

// These source task groups identify a particular action within a wider stage.
// They must take precedence over the stage (e.g. arrival on a purchase order).
const groupKinds = Object.freeze({
  order_review: 'decision',
  engineering_data: 'authoring',
  engineering_material_revision: 'authoring',
  handoff_outsourcing_contract: 'authoring',
  handoff_production_execute: 'authoring',
  handoff_production_exception: 'authoring',
  handoff_receipt_exception: 'authoring',
  handoff_purchase_arrival: 'onsite',
  handoff_receipt_replacement: 'onsite',
  handoff_receipt_inbound: 'onsite',
  handoff_outsourcing_issue: 'onsite',
  handoff_outsourcing_return: 'onsite',
  handoff_outsourcing_inbound: 'onsite',
  handoff_production_return: 'onsite',
  handoff_production_transfer: 'onsite',
  handoff_production_cutting_issue: 'onsite',
  handoff_production_completion: 'onsite',
  handoff_production_inbound: 'onsite',
  handoff_production_packaging_transfer: 'onsite',
  handoff_production_packaging_execute: 'onsite',
  handoff_production_packaging: 'capture',
  handoff_outsourcing_quality_request: 'capture',
  business_followup: 'coordination',
})

export function taskHandlingPolicy(task) {
  if (!task) return null
  const stage = catalog.stages.find(
    (item) => item.key === task.discovery?.stage_key
  )
  if (isWorkflowApprovalTask(task))
    { return { ...TASK_HANDLING_KINDS.decision, kind: 'decision', stage } }
  const explicitKind = groupKinds[task.task_group]
  const definition = explicitKind
    ? { kind: explicitKind }
    : task.task_group === 'handoff_shipment_execute'
      ? TASK_STAGE_HANDLING.shipment
      : TASK_STAGE_HANDLING[stage?.key]
  if (!definition) return null
  return { ...TASK_HANDLING_KINDS[definition.kind], ...definition, stage }
}

export function taskNeedsDesktop(task) {
  return taskHandlingPolicy(task)?.mobile === 'desktop'
}

export function taskDeviceNotice(task) {
  if (isTerminalWorkflowTask(task)) return ''
  const policy = taskHandlingPolicy(task)
  return policy?.mobile === 'desktop'
    ? '请在电脑办理，手机可查看资料和结果。'
    : policy?.scope || ''
}

export function taskHandlingMatrix() {
  return catalog.stages.map((stage) => {
    const definition = TASK_STAGE_HANDLING[stage.key]
    const flows = catalog.fulfillment_flow.filter((flow) =>
      flow.stages.includes(stage.key)
    )
    return {
      ...stage,
      ...TASK_HANDLING_KINDS[definition.kind],
      ...definition,
      label: stage.label,
      kindLabel: TASK_HANDLING_KINDS[definition.kind].label,
      roleKeys: [...new Set(flows.flatMap((flow) => flow.role_keys || []))],
      flows,
    }
  })
}
