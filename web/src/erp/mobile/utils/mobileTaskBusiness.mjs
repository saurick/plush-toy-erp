import { resolveWorkflowTaskEntryPath } from '../../utils/dashboardTaskDisplay.mjs'
import { canOpenWorkflowTaskEntry } from '../../utils/workflowTaskEntryAccess.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { BUSINESS_ROUTE_PATHS, hasActionPermission } from '../../utils/masterDataOrderView.mjs'

const RELATED = Object.freeze([
  { kind: 'production_plan', sourceType: 'sales_order', label: '办理关联生产计划', path: BUSINESS_ROUTE_PATHS.productionOrders, permission: PermissionCode.PMC_PLAN_CREATE },
  { kind: 'shipment', sourceType: 'sales_order', label: '办理关联出货', path: BUSINESS_ROUTE_PATHS.shipments, permission: PermissionCode.SHIPMENT_CREATE },
  { kind: 'inventory', sourceType: 'purchase_receipt', label: '核对已入库批次', path: BUSINESS_ROUTE_PATHS.inventory, permission: PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE },
  { kind: 'inventory', sourceType: 'production_fact', label: '核对已入库批次', path: BUSINESS_ROUTE_PATHS.inventory, permission: PermissionCode.WAREHOUSE_ADJUSTMENT_CREATE },
])

export function mobileTaskRelatedCommands(task, profile, sourceAccess) {
  return RELATED.filter((command) => task?.source_type === command.sourceType &&
    hasActionPermission(profile, command.permission) && canOpenWorkflowTaskEntry(profile, command.path, sourceAccess))
}

const FOLLOWUP_TARGETS = Object.freeze({
  sales_order: ['/erp/sales/project-orders/sales-orders', 'sales_order_id'],
  purchase_order: ['/erp/purchase/accessories', 'purchase_order_id'],
  outsourcing_order: ['/erp/purchase/processing-contracts', 'outsourcing_order_id'],
  production_order: ['/erp/production/orders', 'production_order_id'],
  shipment: ['/erp/warehouse/shipments', 'shipment_id'],
})

export function mobileTaskSupportsPayment(task) {
  return ['sales_order', 'purchase_order', 'outsourcing_order', 'shipment', 'purchase_receipt'].includes(task?.source_type)
}

// A task must identify a real source record before its business workspace can
// mount. Keyword-only links cannot select a different record on the phone.
export function resolveMobileTaskBusinessEntry(task) {
  if (!Number.isSafeInteger(task?.id) || task.id <= 0) return ''
  if (task.task_group === 'business_followup') {
    const target = FOLLOWUP_TARGETS[task.source_type]
    if (!target || !Number.isSafeInteger(task.source_id) || task.source_id <= 0) return ''
    return `${target[0]}?${target[1]}=${task.source_id}`
  }
  const entry = resolveWorkflowTaskEntryPath(task)
  if (!entry.startsWith('/erp/')) return ''
  const url = new URL(entry, 'https://erp.invalid')
  return [...url.searchParams].some(([key, value]) => key.endsWith('_id') && /^[1-9][0-9]*$/u.test(value))
    ? entry : ''
}

export function canOpenMobileTaskBusiness(task, profile, sourceAccess) {
  return canOpenWorkflowTaskEntry(profile, resolveMobileTaskBusinessEntry(task), sourceAccess)
}

export function selectMobileRelatedBusinessTask(page, source, roleKey) {
  if (!source || !Array.isArray(page?.tasks) || !Number.isSafeInteger(page.total) || page.total < 0 || page.total > page.tasks.length ||
      page.tasks.some((task) => !Number.isSafeInteger(task.id) || task.id <= 0 || !Number.isSafeInteger(task.version) || task.version <= 0 || task.source_type !== source.source_type || task.source_id !== source.source_id)) {
    throw new Error('相关任务资料不完整')
  }
  const candidates = page.tasks.filter((task) => resolveMobileTaskBusinessEntry(task))
  const owned = candidates.filter((task) => task.owner_role_key === roleKey)
  const active = owned.filter((task) => ['ready', 'blocked'].includes(task.task_status_key))
  const choices = active.length ? active : owned.length ? owned : candidates
  return choices.length === 1 ? choices[0] : null
}

export function taskScopedSearchParams(anchors, value) {
  const next = new URLSearchParams(value)
  for (const [key, expected] of anchors) next.set(key, expected)
  return next
}
