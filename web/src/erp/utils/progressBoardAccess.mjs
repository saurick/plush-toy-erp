import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { getWorkflowWorkbenchRoleKeys } from './workflowDashboardStats.mjs'
import { TASK_BOARD_ROLE_OPTIONS } from './workflowTaskBoard.mjs'

function assignedRoles(profile, mobileRole) {
  const roleKeys = getWorkflowWorkbenchRoleKeys(profile || {})
  const assigned = new Set((profile?.roles || []).map((role) => role.role_key || role.key))
  return TASK_BOARD_ROLE_OPTIONS.filter(({ value }) => mobileRole
      ? value === mobileRole && (profile?.is_super_admin || (assigned.has(value) && roleKeys.includes(value)))
      : assigned.has(value) && roleKeys.includes(value))
}

export function documentTaskAccess(profile, mobileRole) {
  const allowed = (permission) => hasActionPermission(profile || {}, permission)
  const read = allowed(PermissionCode.WORKFLOW_TASK_READ)
  return {
    roles: read ? assignedRoles(profile, mobileRole) : [],
    supervise: read && allowed(PermissionCode.WORKFLOW_TASK_SUPERVISE) && allowed(PermissionCode.ERP_BUSINESS_DASHBOARD_READ),
  }
}

export function progressBoardAccess(profile, mobileRole) {
  const allowed = (permission) => hasActionPermission(profile || {}, permission)
  const global = allowed(PermissionCode.ERP_BUSINESS_DASHBOARD_READ)
  const salesOrderRead = allowed(PermissionCode.SALES_ORDER_READ) && allowed(PermissionCode.SALES_ORDER_ITEM_READ)
  const scopedDelivery = !global && salesOrderRead && assignedRoles(profile, mobileRole).some(({ value }) => value === 'sales')
  return {
    global,
    sales: salesOrderRead && (global || scopedDelivery),
    scopedDelivery,
    production: global && (allowed(PermissionCode.PMC_PLAN_READ) || allowed(PermissionCode.PRODUCTION_WIP_READ)),
    finance: global && allowed(PermissionCode.FINANCE_RECEIVABLE_READ) && allowed(PermissionCode.FIELD_FINANCE_SETTLEMENT_READ),
  }
}

export function progressBoardViews(access, statistics = true) {
  return [
    ...(access.sales ? [{ value: 'orders', label: '订单交付' }] : []),
    ...(access.production ? [{ value: 'production', label: '生产执行' }] : []),
    ...(statistics && access.global && (access.sales || access.finance)
      ? [{ value: 'statistics', label: '经营统计' }]
      : []),
  ]
}

export function defaultProgressView(access, role) {
  if (role === 'pmc' && access.production) return 'production'
  return progressBoardViews(access)[0]?.value || ''
}

export function scopeProgressBoardQuery(query, view, access) {
  if (view === 'orders' && access.scopedDelivery) {
    return {
      ...query,
view,
display: 'lines',
due_status: 'all',
owner: '',
owner_name: '',
      blocked_only: false,
unlinked_only: false,
delivery_status: query.delivery_status || 'all',
    }
  }
  return query.view === view ? query : { ...query, view }
}
