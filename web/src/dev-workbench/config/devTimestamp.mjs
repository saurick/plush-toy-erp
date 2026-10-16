const ISO_TIMESTAMP_WITH_TIME_ZONE_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/u

const TIMESTAMP_UNITS = new Set(['iso', 'unix-seconds'])
const MAX_UNIX_SECONDS = 253_402_300_799

function resolveTimestamp(value, unit) {
  if (!TIMESTAMP_UNITS.has(unit)) return null

  if (unit === 'unix-seconds') {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UNIX_SECONDS) {
      return null
    }
    const date = new Date(value * 1000)
    if (!Number.isFinite(date.getTime())) return null
    return { date, dateTime: date.toISOString() }
  }

  if (
    typeof value !== 'string' ||
    !ISO_TIMESTAMP_WITH_TIME_ZONE_PATTERN.test(value)
  ) {
    return null
  }
  const [year, month, day, hour, minute, second] = value
    .slice(0, 19)
    .split(/[-T:]/u)
    .map(Number)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1] ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    { return null }
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return null
  return { date, dateTime: value }
}

export function normalizeDevTimestamp(value, { unit = 'iso' } = {}) {
  const timestamp = resolveTimestamp(value, unit)
  if (!timestamp) return null

  return Object.freeze({
    dateTime: timestamp.dateTime,
    label: new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(timestamp.date),
  })
}

export function formatDevTimestamp(
  value,
  { unit = 'iso', missing = '时间未证明' } = {}
) {
  return normalizeDevTimestamp(value, { unit })?.label || missing
}

export function isDevTimestamp(value, { unit = 'iso' } = {}) {
  return normalizeDevTimestamp(value, { unit }) !== null
}
