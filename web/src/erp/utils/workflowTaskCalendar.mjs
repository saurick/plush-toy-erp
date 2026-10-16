import {
  currentBusinessDate,
  unixSecondsToBusinessDate,
} from './businessDate.mjs'

export const TASK_CALENDAR_PAGE_SIZE = 30

export const TASK_CALENDAR_SELECTION_OPTIONS = Object.freeze([
  { value: 'date', label: '按日期' },
  { value: 'overdue', label: '已逾期' },
  { value: 'undated', label: '未设置截止' },
])

export function taskCalendarSelectionMode(selection) {
  return ['overdue', 'undated'].includes(selection) ? selection : 'date'
}

export function defaultTaskCalendarDate(month, today = currentBusinessDate()) {
  return today.startsWith(`${month}-`) ? today : `${month}-01`
}

export function isCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return false
  const date = new Date(`${value}T00:00:00Z`)
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' &&
    value < '9999-01-01'
  )
}

export function readTaskCalendarState(
  search = '',
  today = currentBusinessDate()
) {
  const params = new URLSearchParams(search)
  const candidate = params.get('month')
  const month = isCalendarDate(`${candidate}-01`)
    ? candidate
    : today.slice(0, 7)
  const day = params.get('day')
  const selection =
    ['overdue', 'undated'].includes(day) ||
    (isCalendarDate(day) && day.startsWith(`${month}-`))
      ? day
      : defaultTaskCalendarDate(month, today)
  return {
    layout: params.get('layout') === 'calendar' ? 'calendar' : 'list',
    month,
    selection,
  }
}

export function shiftCalendarMonth(month, amount) {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 7)
}

export function calendarMonthDays(month) {
  const first = new Date(`${month}-01T00:00:00Z`)
  const offset = (first.getUTCDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first)
    date.setUTCDate(1 + index - offset)
    const day = date.toISOString().slice(0, 10)
    return day.startsWith(`${month}-`) ? day : ''
  })
}

export function requireTaskCalendarResponse(data, query) {
  const calendar = data?.calendar
  const count = (value) => Number.isSafeInteger(value) && value >= 0
  const invalid = () => {
    throw Object.assign(new Error('待办日历暂时无法显示，请刷新后重试'), {
      isInvalidResponse: true,
    })
  }
  if (
    !calendar ||
    calendar.month !== query.calendar_month ||
    calendar.selection !== query.calendar_selection ||
    calendar.offset !== (query.calendar_offset || 0) ||
    calendar.limit !== query.limit ||
    !count(calendar.total) ||
    !count(calendar.overdue) ||
    !count(calendar.undated) ||
    !count(calendar.snapshot_at) ||
    !calendar.days ||
    typeof calendar.days !== 'object' ||
    Array.isArray(calendar.days) ||
    Object.entries(calendar.days).some(
      ([day, total]) =>
        !isCalendarDate(day) ||
        !day.startsWith(`${calendar.month}-`) ||
        !count(total)
    ) ||
    !Array.isArray(calendar.items) ||
    calendar.items.length !==
      Math.min(calendar.limit, Math.max(0, calendar.total - calendar.offset))
  )
    { return invalid() }
  const expected =
    calendar.selection === 'overdue'
      ? calendar.overdue
      : calendar.selection === 'undated'
        ? calendar.undated
        : calendar.days[calendar.selection] || 0
  if (
    calendar.total !== expected ||
    new Set(calendar.items.map((task) => task?.id)).size !==
      calendar.items.length
  )
    { return invalid() }
  for (const task of calendar.items) {
    if (
      !Number.isSafeInteger(task?.id) ||
      task.id <= 0 ||
      !Number.isSafeInteger(task.version) ||
      task.version < 1 ||
      !['ready', 'blocked'].includes(task.task_status_key)
    )
      { return invalid() }
    if (
      calendar.selection === 'undated'
        ? task.due_at !== null && task.due_at !== undefined
        : calendar.selection === 'overdue'
          ? !Number.isSafeInteger(task.due_at) ||
            task.due_at >= calendar.snapshot_at
          : unixSecondsToBusinessDate(task.due_at) !== calendar.selection
    )
      { return invalid() }
  }
  return calendar
}
