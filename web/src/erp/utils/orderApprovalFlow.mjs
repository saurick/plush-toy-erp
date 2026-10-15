import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'

export const PROJECT_ORDER_MODULE_KEY = 'project-orders'

export const ORDER_APPROVAL_TASK_GROUP = 'order_approval'
export const ENGINEERING_DATA_TASK_GROUP = 'engineering_data'
export const ORDER_REVISION_TASK_GROUP = 'order_revision'

export const ORDER_APPROVAL_STATUS_KEY = 'project_pending'
export const ORDER_APPROVED_STATUS_KEY = 'project_approved'
export const ENGINEERING_PREPARING_STATUS_KEY = 'engineering_preparing'

function normalizeText(value) {
  const text = String(value ?? '').trim()
  return text || ''
}

export function isOpenWorkflowTask(task = {}) {
  return !isTerminalWorkflowTask(task)
}

export function isOrderApprovalTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROJECT_ORDER_MODULE_KEY &&
    normalizeText(task.task_group) === ORDER_APPROVAL_TASK_GROUP
  )
}

export function isEngineeringDataTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROJECT_ORDER_MODULE_KEY &&
    normalizeText(task.task_group) === ENGINEERING_DATA_TASK_GROUP
  )
}

export function isOrderRevisionTask(task = {}) {
  return (
    normalizeText(task.source_type) === PROJECT_ORDER_MODULE_KEY &&
    normalizeText(task.task_group) === ORDER_REVISION_TASK_GROUP
  )
}
