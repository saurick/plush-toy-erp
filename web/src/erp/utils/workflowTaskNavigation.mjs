function localBusinessPath(value) {
  return typeof value === 'string' && /^\/(?:erp|m)\/[A-Za-z0-9/_?=&.%:+-]+$/u.test(value)
}

export function workflowTaskEntryNavigation(task, entryPath, returnPath, adminID, returnSource = null) {
  if (!Number.isSafeInteger(task?.id) || task.id <= 0 || !localBusinessPath(entryPath) || !localBusinessPath(returnPath)) return {}
  if (typeof window !== 'undefined') {
    const state = window.history.state || {}
    window.history.replaceState({ ...state,
usr: {
      ...state.usr,
      workflowTaskReturn: { taskID: task.id, adminID, returnSource },
    } }, '')
  }
  return { state: { workflowTaskNavigation: {
    taskID: task.id,
    taskName: String(task.task_name || task.title || '办理任务').slice(0, 128),
    entryPath,
    returnPath,
    adminID,
    returnSource,
    returnHistoryIndex: typeof window === 'undefined' ? null : window.history.state?.idx ?? null,
  } } }
}

export function readWorkflowTaskNavigation(state, pathname, adminID) {
  const value = state?.workflowTaskNavigation
  if (!value || !Number.isSafeInteger(value.taskID) || value.taskID <= 0 || value.adminID !== adminID ||
    !localBusinessPath(value.entryPath) || !localBusinessPath(value.returnPath) || value.entryPath.split('?')[0] !== pathname) return null
  return value
}

export function workflowTaskReturnNavigation(navigation, historyIndex) {
  const { taskID, adminID, returnSource } = navigation || {}
  const fromIndex = navigation?.returnHistoryIndex
  if (localBusinessPath(navigation?.returnPath) && Number.isSafeInteger(fromIndex) &&
      Number.isSafeInteger(historyIndex) && historyIndex > fromIndex) {
    return { to: fromIndex - historyIndex }
  }
  return { to: navigation?.returnPath,
    options: { state: {
      clearWorkflowTaskNavigation: true,
      workflowTaskReturn: { taskID, adminID, returnSource },
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
