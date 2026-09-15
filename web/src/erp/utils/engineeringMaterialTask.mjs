import { hasActionPermission } from './masterDataOrderView.mjs'

export const ENGINEERING_MATERIAL_STATUS = Object.freeze({
  PREVIEW: '待提交',
  SUBMITTED: '待老板审核',
  BOSS_APPROVED: '待财务核价',
  APPROVED: '已批准采购',
  REJECTED: '已退回',
})

export function canReadEngineeringMaterial(profile) {
  return (
    hasActionPermission(profile, 'engineering.material.read') &&
    hasActionPermission(profile, 'sales_order.read')
  )
}

export function canListEngineeringMaterial(profile) {
  return (
    canReadEngineeringMaterial(profile) &&
    hasActionPermission(profile, 'erp.workbench.read') &&
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
    'engineering.material.boss_approve',
    'boss',
  ],
  engineering_material_finance_review: [
    'finance',
    'engineering.material.finance_approve',
    'finance',
  ],
  engineering_material_revision: [
    'engineering',
    'engineering.material.submit',
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
    submit: can('engineering.material.submit', 'engineering_material_revision'),
    boss: can(
      'engineering.material.boss_approve',
      'engineering_material_boss_review'
    ),
    finance:
      hasActionPermission(profile, 'field.procurement_commercial.read') &&
      can(
        'engineering.material.finance_approve',
        'engineering_material_finance_review'
      ),
    commercialRead: hasActionPermission(
      profile,
      'field.procurement_commercial.read'
    ),
    purchaseRead: hasActionPermission(profile, 'purchase.order.read'),
  }
}

export function engineeringMaterialTaskEntryPath(task) {
  const context = getEngineeringMaterialTaskContext(task)
  if (!context) return ''
  return `/erp/sales/project-orders/sales-orders?material_request_id=${context.requestID}&sales_order_id=${context.orderID}`
}
