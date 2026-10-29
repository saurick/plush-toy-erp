import { productionTaskHandling } from './productionTaskHandling.mjs'
import { mobileBusinessPath } from './businessTaskRoute.mjs'
import { getWorkflowTaskDisplayName } from './processRuntimePresentation.mjs'
import { workflowTaskBusinessSummary } from './workflowTaskBusinessSummary.mjs'

function localBusinessPath(value) {
  return typeof value === 'string' && /^\/(?:erp|m)\/[A-Za-z0-9/_?=&#.%:+-]+$/u.test(value)
}

export function workflowTaskBusinessReceipt(message, record = {}, metadata = {}) {
  return {
    message,
    recordID: Number.isSafeInteger(record?.id) && record.id > 0 ? record.id : null,
    ...workflowTaskBusinessSummary(record, metadata),
  }
}

export function workflowTaskEntryNavigation(task, entryPath, returnPath, adminID, returnSource = null) {
  if (!Number.isSafeInteger(task?.id) || task.id <= 0 || !localBusinessPath(entryPath) || !localBusinessPath(returnPath)) return {}
  const container = typeof document === 'undefined' ? null : document.querySelector('.erp-admin-content')
  const row = container?.querySelector(`[data-task-id="${task.id}"]`)
  const returnPosition = container ? {
    scrollTop: container.scrollTop,
    rowIndex: row ? Array.from(row.parentElement.querySelectorAll(':scope > [data-task-id]')).indexOf(row) : 0,
    rowOffset: row ? row.getBoundingClientRect().top - container.getBoundingClientRect().top : null,
  } : null
  const returnListState = typeof window === 'undefined' ? null : Object.fromEntries(
    Object.entries(window.history.state || {}).filter(([key]) => key.startsWith('mobileRoleTasks') && !/(Draft|Reason|Quantity)$/u.test(key))
  )
  const returnContext = { taskID: task.id, adminID, returnSource, returnPath, returnPosition, returnListState }
  if (typeof window !== 'undefined') {
    const state = window.history.state || {}
    window.history.replaceState({ ...state,
usr: {
      ...state.usr,
      workflowTaskReturn: returnContext,
    } }, '')
  }
  return { state: { workflowTaskNavigation: {
    taskID: task.id,
    taskName: getWorkflowTaskDisplayName({ task_name: task.task_name || task.title || '办理任务' }).slice(0, 128),
    entryPath,
    returnPath,
    adminID,
    returnSource,
    returnPosition,
    returnListState,
    productionHandling: productionTaskHandling(task, entryPath),
    returnHistoryIndex: typeof window === 'undefined' ? null : window.history.state?.idx ?? null,
  } } }
}

export function readWorkflowTaskNavigation(state, pathname, adminID) {
  const value = state?.workflowTaskNavigation
  if (!value || !Number.isSafeInteger(value.taskID) || value.taskID <= 0 || value.adminID !== adminID ||
    !localBusinessPath(value.entryPath) || !localBusinessPath(value.returnPath) || value.entryPath.split(/[?#]/u)[0] !== pathname) return null
  return value
}

export function workflowTaskNavigationState(state, navigation, entryPath) {
  return {
    ...state,
    ...(navigation && !state?.clearWorkflowTaskNavigation && !/^\/m\/[^/]+\/tasks(?:[?#]|$)/u.test(entryPath)
      ? { workflowTaskNavigation: { ...navigation, entryPath } }
      : {}),
  }
}

export function workflowTaskReturnNavigation(navigation, historyIndex, roleKey = '') {
  const { taskID, adminID, returnSource, returnPosition, returnListState, businessReceipt } = navigation || {}
  const fromIndex = navigation?.returnHistoryIndex
  const returnPath = roleKey ? mobileBusinessPath(navigation?.returnPath, roleKey) : navigation?.returnPath
  if (!businessReceipt && returnPath === navigation?.returnPath && localBusinessPath(returnPath) && Number.isSafeInteger(fromIndex) &&
      Number.isSafeInteger(historyIndex) && historyIndex > fromIndex) {
    return { to: fromIndex - historyIndex }
  }
  return { to: returnPath,
    options: { ...(businessReceipt ? { replace: true } : {}),
state: {
      clearWorkflowTaskNavigation: true,
      workflowTaskReturn: { taskID, adminID, returnSource, returnPath, returnPosition, returnListState: returnListState ? { ...returnListState, mobileRoleTasksDepth: 0 } : null, businessReceipt },
    } } }
}

export function consumeWorkflowTaskReturn(taskID, adminID) {
  if (typeof window === 'undefined') return
  const state = window.history.state || {}
  if (state.usr?.workflowTaskReturn?.taskID !== taskID || state.usr?.workflowTaskReturn?.adminID !== adminID) return
  const { workflowTaskReturn: _consumed, ...usr } = state.usr
  window.history.replaceState({ ...state, usr }, '')
}

export function readWorkflowTaskReturn(state, adminID, source = null) {
  const value = state?.workflowTaskReturn
  if (!value || value.adminID !== adminID || !Number.isSafeInteger(value.taskID) || value.taskID <= 0) return null
  if (source && (value.returnSource?.source_type !== source.source_type || value.returnSource?.source_id !== source.source_id)) return null
  return value
}
