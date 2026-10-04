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
    return taskOrStatus?.task_status_key === 'ready' ? ['urge'] : []
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
