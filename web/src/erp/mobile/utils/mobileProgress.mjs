import { canMountCustomerRuntime, effectiveSessionAllowsPage } from '../../utils/adminProfileSync.mjs'
import { progressAttention, progressQueryFromURL } from '../../utils/businessProgress.mjs'
import { defaultProgressView, progressBoardAccess, progressBoardViews } from '../../utils/progressBoardAccess.mjs'

export function mobileProgressAccess(profile, roleKey) {
  const access = progressBoardAccess(profile, roleKey)
  return {
    ...access,
    enabled: canMountCustomerRuntime(profile) && effectiveSessionAllowsPage(profile, 'business-dashboard', { isSuperAdmin: profile?.is_super_admin }) && progressBoardViews(access).length > 0,
  }
}

export function mobileProgressDefaultView(role, access) {
  return defaultProgressView(access, role)
}

export function normalizeMobileProgressQuery(values, defaultView) {
  const params = new URLSearchParams(values || {})
  for (const key of ['owner', 'owner_name', 'from', 'to', 'date_from', 'date_to']) params.delete(key)
  if (!params.get('view')) params.set('view', defaultView)
  const query = progressQueryFromURL(params)
  const requested = params.get('view')
  return {
    view: requested === 'statistics' ? requested : query.view || defaultView,
    q: query.keyword,
    scope: query.scope,
    due_status: query.due_status,
    blocked_only: query.blocked_only,
    unlinked_only: query.unlinked_only,
    ...(query.display ? { display: query.display, delivery_status: query.delivery_status } : {}),
    ...(query.customer_id ? { customer_id: query.customer_id } : {}),
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
    queries: Object.fromEntries(['orders', 'production', 'statistics'].map((view) => [
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
    statisticsQuery: saved.statisticsQuery || '',
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
