import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'

export const ENGINEERING_MATERIAL_STATUS = Object.freeze({
  PREVIEW: '待提交',
  SUBMITTED: '待老板审核',
  BOSS_APPROVED: '待财务审核',
  APPROVED: '已批准采购',
  REJECTED: '已退回',
})

export function canReadEngineeringMaterial(profile) {
  return (
    hasActionPermission(profile, PermissionCode.ENGINEERING_MATERIAL_READ) &&
    hasActionPermission(profile, PermissionCode.SALES_ORDER_READ)
  )
}

export function canListEngineeringMaterial(profile) {
  return (
    canReadEngineeringMaterial(profile) &&
    hasActionPermission(profile, PermissionCode.ERP_WORKBENCH_READ) &&
    profile?.effective_session?.pages?.includes('global-dashboard') === true
  )
}

export function getEngineeringMaterialOrderContext(task) {
  const orderID = Number(task?.source_id)
  if (
    task?.task_group !== 'engineering_data' ||
    task.source_type !== 'sales_order' ||
    !Number.isSafeInteger(orderID) ||
    orderID <= 0
  ) {
    return null
  }
  return { orderID }
}

export function engineeringMaterialTaskEntryLabel(task) {
  if (!getEngineeringMaterialTaskContext(task)) return ''
  return '查看任务'
}

export function canProcessEngineeringMaterialTask(profile, task) {
  if (!getEngineeringMaterialTaskContext(task)) return false
  const permissions = getEngineeringMaterialPermissions(profile, task)
  return permissions.boss || permissions.finance || permissions.submit
}

const STAGES = Object.freeze({
  engineering_material_boss_review: [
    'boss',
    PermissionCode.ENGINEERING_MATERIAL_BOSS_APPROVE,
    'boss',
  ],
  engineering_material_finance_review: [
    'finance',
    PermissionCode.ENGINEERING_MATERIAL_FINANCE_APPROVE,
    'finance',
  ],
  engineering_material_revision: [
    'engineering',
    PermissionCode.ENGINEERING_MATERIAL_SUBMIT,
    'revision',
  ],
})

export function isEngineeringMaterialTask(task) {
  return Object.hasOwn(STAGES, task?.task_group || '')
}

export function getEngineeringMaterialTaskContext(task) {
  const stage = STAGES[task?.task_group]
  const payload = task?.payload || {}
  const requestID = Number(task?.source_id)
  const orderID = Number(payload.sales_order_id)
  if (
    !stage ||
    !Number.isSafeInteger(requestID) ||
    requestID <= 0 ||
    !Number.isSafeInteger(orderID) ||
    orderID <= 0 ||
    Number(payload.engineering_material_request_id) !== requestID ||
    task.source_type !== 'engineering_material_request' ||
    task.task_code !==
      `source-material-${stage[2]}${stage[2] === 'revision' ? '' : '-review'}-${requestID}` ||
    task.owner_role_key !== stage[0] ||
    task.required_capability_key !== stage[1] ||
    payload.source_task_contract !== 'workflow.source-task/v1' ||
    payload.source_task_producer !== 'engineering_material_request.approval' ||
    !/^[a-f0-9]{64}$/u.test(payload.source_task_intent_hash || '')
  ) {
    return null
  }
  return { orderID, requestID }
}

export function getEngineeringMaterialPermissions(profile, task = null) {
  const canHandle =
    !task ||
    (getEngineeringMaterialTaskContext(task) &&
      task.task_status_key === 'ready' &&
      (!task.assignee_id || Number(task.assignee_id) === Number(profile?.id)))
  const can = (permission, group) =>
    Boolean(
      canHandle &&
        canReadEngineeringMaterial(profile) &&
        (!task || task.task_group === group) &&
        hasActionPermission(profile, permission)
    )
  return {
    submit: can(PermissionCode.ENGINEERING_MATERIAL_SUBMIT, 'engineering_material_revision'),
    boss: can(
      PermissionCode.ENGINEERING_MATERIAL_BOSS_APPROVE,
      'engineering_material_boss_review'
    ),
    finance: can(
      PermissionCode.ENGINEERING_MATERIAL_FINANCE_APPROVE,
      'engineering_material_finance_review'
    ),
    purchaseRead: hasActionPermission(profile, PermissionCode.PURCHASE_ORDER_READ),
  }
}

export function engineeringMaterialTaskEntryPath(task) {
  const context = getEngineeringMaterialTaskContext(task)
  if (!context) return ''
  return `/erp/sales/project-orders/sales-orders?material_request_id=${context.requestID}&sales_order_id=${context.orderID}`
}
