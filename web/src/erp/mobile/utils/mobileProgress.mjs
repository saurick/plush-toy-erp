import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import { progressQueryFromURL } from '../../utils/businessProgress.mjs'

export function mobileProgressAccess(profile) {
  const allowed = (key) => hasActionPermission(profile, key)
  const sales = allowed('sales_order.read') && allowed('sales_order_item.read')
  const production = allowed('pmc.plan.read') || allowed('production.wip.read')
  return {
    enabled:
      canMountCustomerRuntime(profile) &&
      allowed('erp.business_dashboard.read') &&
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

export function mobileProgressTaskOwner(row, roleLabel) {
  if (!row.open_tasks) return '暂无待处理任务'
  if (row.open_tasks > 1) return `${row.open_tasks} 项待处理 · 查看关联任务`
  return (
    row.attention_owner ||
    (row.attention_role
      ? `${roleLabel(row.attention_role)}待领取`
      : '待分配处理岗位')
  )
}
