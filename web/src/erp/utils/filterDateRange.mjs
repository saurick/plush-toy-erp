import { currentBusinessDate } from './businessDate.mjs'
import { parseDateInputValue } from './dateRange.mjs'

export const RECENT_DATE_PERIOD_OPTIONS = Object.freeze([
  { value: '', label: '全部时间' },
  { value: 'today', label: '今天' },
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
])

export function dateFilterPresets(upcoming, today = currentBusinessDate()) {
  const day = parseDateInputValue(today)
  const shift = (days) => day.add(days, 'day').format('YYYY-MM-DD')
  const starts = { today, '7d': shift(-6), '30d': shift(-29) }
  return [
    ...RECENT_DATE_PERIOD_OPTIONS.map((option) => ({
      ...option,
      from: starts[option.value] || '',
      to: option.value ? today : '',
    })),
    ...(upcoming ? [{ value: 'next7d', label: '未来 7 天', from: today, to: shift(6) }] : []),
    { value: 'custom', label: '自定义日期' },
  ]
}

export function isCompleteDateRange({ dateFrom = '', dateTo = '' } = {}) {
  const valid = (value) =>
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Boolean(parseDateInputValue(value))
  return Boolean(valid(dateFrom) && valid(dateTo) && dateFrom <= dateTo)
}

export function selectDateRangeDay(current, value) {
  if (!parseDateInputValue(value)) return current
  if (!current.dateFrom || current.dateTo || value < current.dateFrom) {
    return { dateFrom: value, dateTo: '' }
  }
  return { dateFrom: current.dateFrom, dateTo: value }
}
