import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import { progressAttention, progressQueryFromURL } from '../../utils/businessProgress.mjs'

export function mobileProgressAccess(profile) {
  const allowed = (key) => hasActionPermission(profile, key)
  const sales = allowed(PermissionCode.SALES_ORDER_READ) && allowed(PermissionCode.SALES_ORDER_ITEM_READ)
  const production = allowed(PermissionCode.PMC_PLAN_READ) || allowed(PermissionCode.PRODUCTION_WIP_READ)
  return {
    enabled:
      canMountCustomerRuntime(profile) &&
      allowed(PermissionCode.ERP_BUSINESS_DASHBOARD_READ) &&
      (sales || production),
    sales,
    production,
  }
}

export function mobileProgressDefaultView(role, access) {
  return access.production && (role === 'pmc' || !access.sales)
    ? 'production'
    : 'orders'
}

export function normalizeMobileProgressQuery(values, defaultView) {
  const params = new URLSearchParams(values || {})
  if (!params.get('view')) params.set('view', defaultView)
  const query = progressQueryFromURL(params)
  return {
    view: query.view || defaultView,
    q: query.keyword,
    owner: query.owner,
    scope: query.scope,
    due_status: query.due_status,
    blocked_only: query.blocked_only,
    unlinked_only: query.unlinked_only,
    from: query.date_from,
    to: query.date_to,
    // Appended batches are reloaded from the first page when returning.
    page: 1,
  }
}

export function readMobileProgressState(history, scope, defaultView) {
  const saved =
    history?.mobileProgress?.scope === scope ? history.mobileProgress : {}
  const query = normalizeMobileProgressQuery(saved.query, defaultView)
  return {
    query,
    queries: Object.fromEntries(['orders', 'production'].map((view) => [
      view, normalizeMobileProgressQuery(view === query.view ? query : { ...saved.queries?.[view], view }, view),
    ])),
    selection:
      saved.selection &&
      Number.isSafeInteger(saved.selection.id) &&
      saved.selection.id > 0 &&
      ['orders', 'production'].includes(saved.selection.view)
        ? saved.selection
        : null,
    scrollTop: Math.max(0, Number(saved.scrollTop) || 0),
  }
}

export function mobileProgressTaskSummary(row, roleLabel) {
  if (!row.open_tasks) {
    return { title: '暂无待处理任务', detail: '', taskID: null }
  }
  const { title: taskName, detail: owner, taskID } = progressAttention(row, { tasks: true }, roleLabel)
  const singleTask = row.open_tasks === 1
  return {
    title: singleTask ? `任务：${taskName}` : `${row.open_tasks} 项待处理`,
    detail: singleTask ? owner : `首要：${taskName} · ${owner}`,
    taskID,
  }
}
