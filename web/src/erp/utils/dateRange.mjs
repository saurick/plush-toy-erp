import dayjs from 'dayjs'
import customParseFormat from 'dayjs/plugin/customParseFormat.js'

export const DATE_INPUT_VALUE_FORMAT = 'YYYY-MM-DD'
export const DATE_INPUT_DISPLAY_FORMAT = 'YYYY/MM/DD'

dayjs.extend(customParseFormat)

export function parseDateInputValue(value) {
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value : null
  }

  const normalizedValue = String(value || '')
    .trim()
    .replaceAll('/', '-')
  if (!normalizedValue) return null

  const parsedValue = dayjs(normalizedValue, DATE_INPUT_VALUE_FORMAT, true)
  return parsedValue.isValid() ? parsedValue : null
}

export function isDateInputBefore(value, minimumValue, options = {}) {
  const { allowSameDay = true } = options
  const current = parseDateInputValue(value)
  const minimum = parseDateInputValue(minimumValue)
  if (!current || !minimum) return false

  return allowSameDay
    ? current.isBefore(minimum, 'day')
    : !current.isAfter(minimum, 'day')
}

export function isDateInputAfter(value, maximumValue, options = {}) {
  const { allowSameDay = true } = options
  const current = parseDateInputValue(value)
  const maximum = parseDateInputValue(maximumValue)
  if (!current || !maximum) return false

  return allowSameDay
    ? current.isAfter(maximum, 'day')
    : !current.isBefore(maximum, 'day')
}

export function isDateInputRangeReversed(startValue, endValue, options = {}) {
  return isDateInputAfter(startValue, endValue, options)
}

export function dateInputNotBeforeRule({
  getStartValue,
  message = '结束日期不能早于开始日期',
  allowSameDay = true,
} = {}) {
  return {
    validator: async (_, value) => {
      if (
        isDateInputBefore(value, getStartValue?.(), {
          allowSameDay,
        })
      ) {
        throw new Error(message)
      }
    },
  }
}

export function dateInputNotAfterRule({
  getEndValue,
  message = '开始日期不能晚于结束日期',
  allowSameDay = true,
} = {}) {
  return {
    validator: async (_, value) => {
      if (
        isDateInputAfter(value, getEndValue?.(), {
          allowSameDay,
        })
      ) {
        throw new Error(message)
      }
    },
  }
}
