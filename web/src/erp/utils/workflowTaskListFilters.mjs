export const WORKFLOW_TASK_DUE_OPTIONS = Object.freeze([
  { value: 'all', label: '全部截止时间' },
  { value: 'overdue', label: '已超时' },
  { value: 'dueSoon', label: '24小时内到期' },
  { value: 'noDue', label: '未设置到期' },
])

export function normalizeTaskListFilters(value = {}) {
  return {
    ...(WORKFLOW_TASK_DUE_OPTIONS.some(({ value: key }) => key === value.due) &&
    value.due !== 'all'
      ? { due: value.due }
      : {}),
    ...(typeof value.sourceType === 'string' &&
    value.sourceType.trim() &&
    value.sourceType !== 'all'
      ? { sourceType: value.sourceType.trim().slice(0, 64) }
      : {}),
  }
}

export function taskListFilterRequest(value = {}) {
  const { due, sourceType } = normalizeTaskListFilters(value)
  return {
    ...(due ? { due } : {}),
    ...(sourceType ? { source_type: sourceType } : {}),
  }
}
