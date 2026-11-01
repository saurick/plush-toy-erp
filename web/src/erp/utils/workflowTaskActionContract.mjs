import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { isFulfillmentTask } from './fulfillmentTask.mjs'
import { isEngineeringMaterialTask } from './engineeringMaterialTask.mjs'

export const WORKFLOW_APPROVAL_CAPABILITY_KEYS = Object.freeze([
  PermissionCode.WORKFLOW_TASK_APPROVE,
  PermissionCode.FINANCE_PAYMENT_APPROVE,
  PermissionCode.WAREHOUSE_ADJUSTMENT_APPROVE,
  PermissionCode.PRODUCTION_EXCEPTION_APPROVE,
  PermissionCode.ENGINEERING_MATERIAL_BOSS_APPROVE,
  PermissionCode.ENGINEERING_MATERIAL_FINANCE_APPROVE,
])

const WORKFLOW_APPROVAL_CAPABILITY_KEY_SET = new Set(
  WORKFLOW_APPROVAL_CAPABILITY_KEYS
)

const WORKFLOW_PROCESS_DECISION_PROFILE_BY_CAPABILITY = Object.freeze({
  [PermissionCode.FINANCE_PAYMENT_APPROVE]: 'finance_payment_approval',
  [PermissionCode.WAREHOUSE_ADJUSTMENT_APPROVE]: 'inventory_adjustment_approval',
  [PermissionCode.PRODUCTION_EXCEPTION_APPROVE]: 'production_exception_approval',
})

export function isWorkflowApprovalTask(task = {}) {
  const requiredCapabilityKey = String(
    task?.required_capability_key || ''
  ).trim()
  return WORKFLOW_APPROVAL_CAPABILITY_KEY_SET.has(requiredCapabilityKey)
}

export function isWorkflowProcessDecisionTask(task = {}) {
  return Boolean(getWorkflowProcessDecisionApprovalProfile(task))
}

export function getWorkflowProcessDecisionApprovalProfile(task = {}) {
  return (
    WORKFLOW_PROCESS_DECISION_PROFILE_BY_CAPABILITY[
      String(task?.required_capability_key || '').trim()
    ] || ''
  )
}

export function workflowTaskAllowsApprovedQuantity(task = {}) {
  return (
    String(task?.required_capability_key || '').trim() ===
    PermissionCode.PRODUCTION_EXCEPTION_APPROVE
  )
}

export const isWorkflowBossOrderApprovalTask = isWorkflowApprovalTask

export function getWorkflowTaskActionPermission(actionMode = '', task = {}) {
  if (actionMode === 'complete') {
    return isWorkflowApprovalTask(task)
      ? String(task?.required_capability_key || '').trim()
      : PermissionCode.WORKFLOW_TASK_COMPLETE
  }
  if (actionMode === 'reject') return PermissionCode.WORKFLOW_TASK_REJECT
  if (
    actionMode === 'block' ||
    actionMode === 'resume' ||
    actionMode === 'urge'
  ) {
    return PermissionCode.WORKFLOW_TASK_UPDATE
  }
  return ''
}

export function getWorkflowTaskActionStatusKey(actionMode = '') {
  if (actionMode === 'complete') return 'done'
  if (actionMode === 'block') return 'blocked'
  if (actionMode === 'reject') return 'rejected'
  if (actionMode === 'resume') return 'ready'
  if (actionMode === 'urge') return ''
  return ''
}

const WORKFLOW_TASK_ACTION_MODES_BY_STATUS = Object.freeze({
  ready: Object.freeze(['complete', 'block', 'reject', 'urge']),
  blocked: Object.freeze(['resume', 'urge']),
})

export function getWorkflowTaskStatusActionModes(taskOrStatus = '') {
  if (
    typeof taskOrStatus === 'object' &&
    (isEngineeringMaterialTask(taskOrStatus) || isFulfillmentTask(taskOrStatus))
  ) {
    return taskOrStatus?.task_status_key === WorkflowTaskStatus.READY ? ['urge'] : []
  }
  const statusKey = String(
    typeof taskOrStatus === 'string'
      ? taskOrStatus
      : taskOrStatus?.task_status_key || ''
  ).trim()
  return WORKFLOW_TASK_ACTION_MODES_BY_STATUS[statusKey] || []
}

export function canWorkflowTaskStatusRunAction(taskOrStatus, actionMode = '') {
  return getWorkflowTaskStatusActionModes(taskOrStatus).includes(actionMode)
}

export function workflowTaskActionRequiresReason(task, action) {
  if (['complete', 'done'].includes(action)) return isWorkflowProcessDecisionTask(task) || task?.task_group === 'business_followup'
  return ['block', 'blocked', 'reject', 'rejected', 'assign'].includes(action)
}

export function workflowTaskActionInput(task, action) {
  const required = workflowTaskActionRequiresReason(task, action)
  const mode = ({ done: 'complete', blocked: 'block', rejected: 'reject' })[action] || action
  let label = '处理说明'
  let placeholder = '可补充本次处理情况'
  if (mode === 'complete' && isWorkflowApprovalTask(task)) {
    label = '审批意见'
    placeholder = required ? '填写审批依据和需要交接的信息' : '可补充核对情况或交接事项'
  } else if (mode === 'complete' && task?.task_group === 'business_followup') {
    label = '处理结果'
    placeholder = '填写处理结果和需要发起人了解的情况'
  } else if (mode === 'block') {
    label = '受阻原因'
    placeholder = '选择受阻原因，补充说明选填'
  } else if (mode === 'reject') {
    label = '退回原因'
    placeholder = '填写退回依据和需要补充的内容'
  } else if (mode === 'assign') {
    label = '转交原因'
    placeholder = '填写请假、人员调整等转交原因'
  } else if (mode === 'resume') {
    placeholder = '可补充阻塞处理情况或后续安排'
  } else if (mode === 'urge') {
    label = '催办说明'
    placeholder = '可补充需跟进事项或期望完成时间'
  }
  return { required, label, fieldLabel: required ? label : `${label}（选填）`, placeholder }
}
