import { normalizePositiveNumeric20Scale6 } from './numeric20Scale6.mjs'
import {
  getWorkflowProcessDecisionApprovalProfile,
  isWorkflowProcessDecisionTask,
  workflowTaskAllowsApprovedQuantity,
} from './workflowTaskActionContract.mjs'

const PROCESS_DECISION_INVALID_MESSAGE =
  '审批表单与当前流程节点不一致，请刷新后重试'
const PROCESS_DECISION_REASON_INVALID_MESSAGE =
  '审批意见为必填项，且不能超过 255 个字符'
const PROCESS_DECISION_QUANTITY_INVALID_MESSAGE =
  '批准数量必须大于 0，且最多保留 6 位小数'

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function invalidProcessDecision(message = PROCESS_DECISION_INVALID_MESSAGE) {
  throw new Error(message)
}

export function workflowProcessDecisionAllowsApprovedQuantity(
  approvalForm = null
) {
  return Boolean(
    approvalForm?.profile_key === 'production_exception_approval' &&
      approvalForm?.approved_quantity?.required === false &&
      approvalForm?.approved_quantity?.precision === 20 &&
      approvalForm?.approved_quantity?.scale === 6
  )
}

export function getWorkflowProcessDecisionApprovalForm(
  task = {},
  processContext = null
) {
  const expectedProfile = getWorkflowProcessDecisionApprovalProfile(task)
  const approvalForm = processContext?.approval_form
  if (
    !expectedProfile ||
    !plainObject(approvalForm) ||
    approvalForm.profile_key !== expectedProfile ||
    approvalForm.reason_required !== true
  ) {
    return null
  }

  const allowsApprovedQuantity =
    workflowProcessDecisionAllowsApprovedQuantity(approvalForm)
  if (
    (expectedProfile === 'production_exception_approval' &&
      !allowsApprovedQuantity) ||
    (expectedProfile !== 'production_exception_approval' &&
      approvalForm.approved_quantity != null)
  ) {
    return null
  }
  return approvalForm
}

export function getWorkflowProcessDecisionApprovedQuantityError(
  approvalForm,
  value = ''
) {
  const quantity = String(value || '').trim()
  if (!quantity) return ''
  if (
    !workflowProcessDecisionAllowsApprovedQuantity(approvalForm) ||
    !normalizePositiveNumeric20Scale6(quantity)
  ) {
    return PROCESS_DECISION_QUANTITY_INVALID_MESSAGE
  }
  return ''
}

export function buildWorkflowProcessDecision({
  task = {},
  processContext = null,
  reason = '',
  approvedQuantity = '',
} = {}) {
  if (!isWorkflowProcessDecisionTask(task)) {
    invalidProcessDecision('当前任务不接受流程审批决策')
  }
  const approvalForm = getWorkflowProcessDecisionApprovalForm(
    task,
    processContext
  )
  if (!approvalForm) invalidProcessDecision()

  const normalizedReason = String(reason || '').trim()
  if (!normalizedReason || [...normalizedReason].length > 255) {
    invalidProcessDecision(PROCESS_DECISION_REASON_INVALID_MESSAGE)
  }

  const quantity = String(approvedQuantity || '').trim()
  const quantityError = getWorkflowProcessDecisionApprovedQuantityError(
    approvalForm,
    quantity
  )
  if (quantityError) invalidProcessDecision(quantityError)

  return {
    reason: normalizedReason,
    ...(quantity
      ? { approved_quantity: normalizePositiveNumeric20Scale6(quantity) }
      : {}),
  }
}

export function requireWorkflowProcessDecisionSubmission(
  task,
  value,
  { reason = '' } = {}
) {
  if (!isWorkflowProcessDecisionTask(task)) {
    if (value != null) {
      invalidProcessDecision('当前任务不接受流程审批决策')
    }
    return null
  }
  if (!plainObject(value)) invalidProcessDecision()
  for (const key of Object.keys(value)) {
    if (key !== 'reason' && key !== 'approved_quantity') {
      invalidProcessDecision()
    }
  }
  if (
    typeof value.reason !== 'string' ||
    (Object.hasOwn(value, 'approved_quantity') &&
      typeof value.approved_quantity !== 'string')
  ) {
    invalidProcessDecision()
  }

  const normalizedReason = value.reason.trim()
  if (
    !normalizedReason ||
    [...normalizedReason].length > 255 ||
    normalizedReason !== String(reason || '').trim()
  ) {
    invalidProcessDecision(PROCESS_DECISION_REASON_INVALID_MESSAGE)
  }

  const quantity = value.approved_quantity?.trim() || ''
  if (quantity && !workflowTaskAllowsApprovedQuantity(task)) {
    invalidProcessDecision()
  }
  const normalizedQuantity = quantity
    ? normalizePositiveNumeric20Scale6(quantity)
    : ''
  if (quantity && !normalizedQuantity) {
    invalidProcessDecision(PROCESS_DECISION_QUANTITY_INVALID_MESSAGE)
  }

  return {
    reason: normalizedReason,
    ...(normalizedQuantity ? { approved_quantity: normalizedQuantity } : {}),
  }
}
