import { getWorkflowTaskDueStatus } from './workflowDashboardStats.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'

const END_LABELS = Object.freeze({
  done: '完成',
  rejected: '退回',
  withdrawn: '撤回',
})

function taskDate(value) {
  if (!['number', 'string'].includes(typeof value)) return null
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  return Number.isFinite(date.getTime()) ? date : null
}

export function formatWorkflowTaskTime(
  value,
  { exact = false, nowMs = Date.now() } = {}
) {
  const date = taskDate(value)
  if (!date) return ''
  const now = new Date(nowMs)
  const clock = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  const day = `${date.getMonth() + 1}月${date.getDate()}日`
  if (exact) return `${date.getFullYear()}年${day} ${clock}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === now.toDateString()) return `今天 ${clock}`
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${clock}`
  return `${date.getFullYear() === now.getFullYear() ? '' : `${date.getFullYear()}年`}${day} ${clock}`
}

export function getWorkflowTaskBlockedAt(task = {}, events = []) {
  if (task.task_status_key !== 'blocked' || !(Number(task.id) > 0)) return null
  const taskEvents = (Array.isArray(events) ? events : []).filter(
    (event) => Number(event?.task_id) === Number(task.id)
  )
  // Do not date a refreshed task using events left over from an older read.
  if (
    Number(task.version) > 0 &&
    !taskEvents.some(
      (event) => Number(event.task_version) === Number(task.version)
    )
  ) {
    return null
  }
  // Only a persisted transition can date the current blockage; urges and assignments retain it.
  const transitions = taskEvents
    .filter(
      (event) =>
        event.to_status_key &&
        event.from_status_key !== event.to_status_key &&
        (!(Number(task.version) > 0) ||
          !(Number(event.task_version) > Number(task.version)))
    )
    .sort(
      (a, b) =>
        Number(b.task_version || 0) - Number(a.task_version || 0) ||
        Number(b.created_at || 0) - Number(a.created_at || 0)
    )
  const latest = transitions[0]
  return latest?.to_status_key === 'blocked' && taskDate(latest.created_at)
    ? Number(latest.created_at)
    : null
}

export function getWorkflowTaskTiming(
  task = {},
  { detail = false, events = [], nowMs = Date.now() } = {}
) {
  const ended = isTerminalWorkflowTask(task)
  const rows = []
  const add = (
    key,
    label,
    value,
    { missing = '未记录', tone = 'neutral', suffix = '' } = {}
  ) => {
    const date = taskDate(value)
    if (!date && !detail) return
    const formatted = formatWorkflowTaskTime(value, { exact: detail, nowMs })
    rows.push({
      key,
      label,
      value: date ? `${formatted}${suffix}` : missing,
      dateTime: date?.toISOString() || '',
      title: date
        ? `${label} ${formatWorkflowTaskTime(value, { exact: true })}${suffix}`
        : '',
      tone,
    })
  }

  // Tasks are created in their owner role; mutations only reassign within that role.
  // Never substitute updated_at, an order date, or a process start for this timestamp.
  if (!ended || detail) add('arrived', '进入本岗', task.created_at)
  if (!ended || detail) {
    const status = getWorkflowTaskDueStatus(task, nowMs)
    add('due', detail ? '处理截止' : '截止', task.due_at, {
      missing: '未设置截止',
      tone:
        status === 'overdue'
          ? 'danger'
          : status === 'due_soon'
            ? 'warning'
            : 'neutral',
      suffix:
        status === 'overdue'
          ? ' · 已超时'
          : status === 'due_soon'
            ? ' · 即将到期'
            : '',
    })
  }
  if (ended) {
    const label = END_LABELS[String(task.task_status_key || '').trim()]
    add('ended', detail ? `${label}时间` : label, task.completed_at)
  }
  if (detail) {
    const blockedAt = getWorkflowTaskBlockedAt(task, events)
    if (blockedAt) add('blocked', '本次阻塞', blockedAt)
  }
  return rows
}
