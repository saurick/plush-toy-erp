import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { getWorkflowWorkbenchRoleKeys } from './workflowDashboardStats.mjs'
import { TASK_BOARD_ROLE_OPTIONS } from './workflowTaskBoard.mjs'

export function progressBoardAccess(profile, mobileRole) {
  const allowed = (permission) => hasActionPermission(profile || {}, permission)
  const global = allowed(PermissionCode.ERP_BUSINESS_DASHBOARD_READ)
  const roleKeys = getWorkflowWorkbenchRoleKeys(profile)
  const assigned = new Set((profile?.roles || []).map((role) => role.role_key || role.key))
  const allowedRoles = allowed(PermissionCode.WORKFLOW_TASK_READ)
    ? TASK_BOARD_ROLE_OPTIONS.filter(({ value }) => mobileRole
      ? value === mobileRole && (profile?.is_super_admin || (assigned.has(value) && roleKeys.includes(value)))
      : assigned.has(value) && roleKeys.includes(value))
    : []
  const salesOrderRead = allowed(PermissionCode.SALES_ORDER_READ) && allowed(PermissionCode.SALES_ORDER_ITEM_READ)
  const scopedDelivery = !global && salesOrderRead && allowedRoles.some(({ value }) => value === 'sales')
  return {
    global,
    supervise: global && allowed(PermissionCode.WORKFLOW_TASK_READ) && allowed(PermissionCode.WORKFLOW_TASK_SUPERVISE),
    roles: allowedRoles,
    sales: salesOrderRead && (global || scopedDelivery),
    scopedDelivery,
    production: global && (allowed(PermissionCode.PMC_PLAN_READ) || allowed(PermissionCode.PRODUCTION_WIP_READ)),
    finance: global && allowed(PermissionCode.FINANCE_RECEIVABLE_READ) && allowed(PermissionCode.FIELD_FINANCE_SETTLEMENT_READ),
  }
}

export function progressBoardViews(access, statistics = true) {
  return [
    ...(access.roles?.length ? [{ value: 'role', label: '岗位进度' }] : []),
    ...(access.sales ? [{ value: 'orders', label: '订单交付' }] : []),
    ...(access.production ? [{ value: 'production', label: '生产执行' }] : []),
    ...(statistics && access.global && (access.sales || access.finance)
      ? [{ value: 'statistics', label: '经营统计' }]
      : []),
    ...(!access.roles?.length && access.supervise ? [{ value: 'role', label: '全局跟进' }] : []),
  ]
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
