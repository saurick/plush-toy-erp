import { WorkflowTaskStatus } from '../../common/consts/statuses.generated.mjs'
import { isCompleteDateRange } from './filterDateRange.mjs'

export const WORKFLOW_HISTORY_STATUS_OPTIONS = Object.freeze([
  { value: '', label: '全部结果' },
  { value: WorkflowTaskStatus.DONE, label: '已完成' },
  { value: WorkflowTaskStatus.REJECTED, label: '已驳回' },
  { value: WorkflowTaskStatus.WITHDRAWN, label: '已撤回' },
])

export const WORKFLOW_HISTORY_PERIOD_OPTIONS = Object.freeze([
  { value: '', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
])

export function isWorkflowHistoryDateFilter({
  period = '',
  dateFrom = '',
  dateTo = '',
} = {}) {
  if (period !== 'custom') {
    return (
      WORKFLOW_HISTORY_PERIOD_OPTIONS.some(({ value }) => value === period) &&
      dateFrom === '' &&
      dateTo === ''
    )
  }
  return isCompleteDateRange({ dateFrom, dateTo })
}

export function workflowHistoryFilterSummary({
  period = '',
  dateFrom = '',
  dateTo = '',
  statusKey = '',
} = {}) {
  return [
    period === 'custom'
      ? `${dateFrom} 至 ${dateTo}`
      : period &&
        WORKFLOW_HISTORY_PERIOD_OPTIONS.find(({ value }) => value === period)
          ?.label,
    statusKey &&
      WORKFLOW_HISTORY_STATUS_OPTIONS.find(({ value }) => value === statusKey)
        ?.label,
  ]
    .filter(Boolean)
    .join(' · ')
}
