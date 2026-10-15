import { getWorkflowTaskDueStatus } from './workflowDashboardStats.mjs'
import { isTerminalWorkflowTask } from './workflowTaskLifecycle.mjs'
import { getRoleDisplayName } from './roleKeys.mjs'

function readWorkflowDeadlineNow(now) {
  const value = typeof now === 'function' ? now() : now
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) {
    throw new TypeError('快捷截止时间基准无效')
  }
  return date
}

function formatWorkflowDeadlineInput(date) {
  const part = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`
}

function resolveWorkflowDeadline(now, { days = 0, endOfDay = false } = {}) {
  const date = readWorkflowDeadlineNow(now)
  date.setDate(date.getDate() + days)
  if (endOfDay) date.setHours(23, 59, 0, 0)
  else date.setSeconds(0, 0)
  return date
}

export function buildWorkflowDeadlineQuickOptions(
  now = () => new Date()
) {
  const valueAfter = (days, options) => () =>
    formatWorkflowDeadlineInput(resolveWorkflowDeadline(now, { days, ...options }))

  return [
    {
      key: 'today-end',
      label: '今天 23:59',
      value: valueAfter(0, { endOfDay: true }),
      disabled: () => {
        const current = readWorkflowDeadlineNow(now)
        return (
          resolveWorkflowDeadline(current, { endOfDay: true }).getTime() <=
          current.getTime()
        )
      },
    },
    { key: 'tomorrow', label: '明天此时', value: valueAfter(1) },
    { key: 'seven-days', label: '7 天后', value: valueAfter(7) },
    { key: 'fifteen-days', label: '15 天后', value: valueAfter(15) },
    { key: 'thirty-days', label: '30 天后', value: valueAfter(30) },
  ]
}

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
    { missing = '未记录', tone = 'neutral', prefix = '', suffix = '' } = {}
  ) => {
    const date = taskDate(value)
    if (!date && !detail) return
    const formatted = formatWorkflowTaskTime(value, { exact: detail, nowMs })
    rows.push({
      key,
      label,
      value: `${prefix}${date ? `${formatted}${suffix}` : missing}`,
      dateTime: date?.toISOString() || '',
      title: date
        ? `${label} ${prefix}${formatWorkflowTaskTime(value, { exact: true })}${suffix}`
        : '',
      tone,
    })
  }

  // Tasks are created in their owner role; mutations only reassign within that role.
  // Never substitute updated_at, an order date, or a process start for this timestamp.
  if (!ended || detail) {
    const role = getRoleDisplayName(task.owner_role_key)
    add('arrived', role ? '进入岗位' : '任务生成', task.created_at, {
      prefix: role ? `${role} · ` : '',
    })
  }
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
