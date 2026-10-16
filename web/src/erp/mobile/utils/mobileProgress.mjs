import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import { progressQueryFromURL } from '../../utils/businessProgress.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'

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

export function readMobileProgressState(history, scope, defaultView) {
  const saved =
    history?.mobileProgress?.scope === scope ? history.mobileProgress : {}
  const query = progressQueryFromURL(new URLSearchParams(saved.query || {}))
  return {
    query: {
      view: query.view || defaultView,
      // Older builds exposed a second free-text owner field inside the filter.
      // Fold it into the primary search so no invisible owner filter survives.
      q: query.keyword || query.owner,
      owner: '',
      scope: query.scope,
      risk: query.risk,
      // Mobile progress intentionally omits exact-date inputs. Ignore values
      // saved by older builds so an invisible date filter cannot survive.
      from: '',
      to: '',
      // The mobile list now appends batches while scrolling. Always resume from
      // the first batch instead of restoring an obsolete visible page number.
      page: 1,
    },
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
  const taskName = getWorkflowTaskDisplayName({ task_name: row.attention_task })
  const role = row.attention_role ? roleLabel(row.attention_role) : ''
  const owner = row.attention_owner
    ? [role, row.attention_owner].filter(Boolean).join(' · ')
    : role
      ? `${role}待领取`
      : '待分配处理岗位'
  const singleTask = row.open_tasks === 1
  return {
    title: singleTask ? `任务：${taskName}` : `${row.open_tasks} 项待处理`,
    detail: singleTask ? owner : `首要：${taskName} · ${owner}`,
    taskID:
      singleTask &&
      Number.isSafeInteger(row.attention_task_id) &&
      row.attention_task_id > 0
        ? row.attention_task_id
        : null,
  }
}
