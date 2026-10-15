import { parseDateInputValue } from './dateRange.mjs'

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
