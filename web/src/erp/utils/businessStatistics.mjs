import { normalizeWorkflowTaskPageSize } from './workflowTaskBoard.mjs'

export const STATISTICS_AGES = [
  ['not_due', '未到期'],
  ['late_7', '逾期 1–7 天'],
  ['late_30', '逾期 8–30 天'],
  ['late_60', '逾期 31–60 天'],
  ['late_more', '逾期 60 天以上'],
  ['unknown_due', '未定到期日'],
]
export const STATISTICS_STATUSES = {
  all: '全部',
  done: '已交齐',
  pending: '待交付',
  pending_not_late: '待交付（未逾期）',
  overdue: '当前逾期',
  soon: '7 天内交付',
  closed: '已关闭',
  unknown: '资料待核对',
  undated: '未定到期日',
  ...Object.fromEntries(STATISTICS_AGES),
}
const countKeys = [
  'count',
  'done',
  'pending',
  'closed',
  'unknown',
  'overdue',
  'soon',
  'undated',
  'missing_amount',
  'missing_shipment_amount',
]
const amountKeys = [
  'amount',
  'shipped_amount',
  'balance',
  ...STATISTICS_AGES.map(([key]) => key),
]
const decimal = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u
const isCount = (value) => Number.isSafeInteger(value) && value >= 0
const isMoney = (value) =>
  value == null || (typeof value === 'string' && decimal.test(value))
const fail = () => {
  throw new Error('统计结果不完整，请刷新重试')
}
const units = (value) => {
  if (typeof value !== 'string' || !decimal.test(value)) return null
  const [integer, fraction = ''] = value.split('.')
  return BigInt(integer) * 1000000n + BigInt(fraction.padEnd(6, '0'))
}
export function statisticsNumber(value, money = false) {
  if (value == null) return '—'
  const text =
    typeof value === 'number' && isCount(value) ? String(value) : value
  if (typeof text !== 'string' || !decimal.test(text)) return '—'
  const [integer, fraction = ''] = text.split('.')
  const suffix = money ? fraction.padEnd(2, '0') : fraction
  return (
    integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ',') +
    (suffix ? `.${suffix}` : '')
  )
}
export function statisticsRatio(value, total) {
  const part = units(String(value))
  const whole = units(String(total))
  if (part === null || whole === null || whole === 0n) return 0
  return Number((part * 10000n) / whole) / 100
}
export function statisticsSum(values) {
  let sum = 0n
  for (const value of values) {
    const parsed = units(value)
    if (parsed === null) return null
    sum += parsed
  }
  const text = sum.toString().padStart(7, '0')
  const fraction = text.slice(-6).replace(/0+$/u, '')
  return text.slice(0, -6) + (fraction ? `.${fraction}` : '')
}
function requireAccess(value) {
  if (
    !value ||
    ['sales', 'sales_amounts', 'receivables'].some(
      (key) => typeof value[key] !== 'boolean'
    )
  ) {
    fail()
  }
}
function requireMetrics(value, report, money) {
  if (
    !value ||
    countKeys.some(
      (key) =>
        !(key.startsWith('missing_') && !money && value[key] === undefined) &&
        !isCount(value[key])
    ) ||
    amountKeys.some((key) => !isMoney(value[key]))
  ) {
    fail()
  }
  if (
    report === 'delivery' &&
    (value.count !==
      value.done + value.pending + value.closed + value.unknown ||
      value.overdue > value.pending ||
      value.soon > value.pending)
  ) {
    fail()
  }
  if (
    report === 'receivables' &&
    (value.balance == null ||
      statisticsSum(STATISTICS_AGES.map(([key]) => value[key])) !==
        value.balance)
  ) {
    fail()
  }
}
function requireMetadata(data) {
  if (
    !data ||
    !isCount(data.total) ||
    typeof data.snapshot_at !== 'string' ||
    !Number.isFinite(Date.parse(data.snapshot_at))
  ) {
    fail()
  }
  requireAccess(data.access)
}
export function requireStatisticsBoard(data, report, groupBy) {
  requireMetadata(data)
  if (
    data.report !== report ||
    data.group_by !== groupBy ||
    !Array.isArray(data.groups) ||
    data.groups.length > data.total ||
    typeof data.date_from !== 'string' ||
    typeof data.date_to !== 'string'
  ) {
    fail()
  }
  requireMetrics(
    data.counts,
    report,
    data.access.sales_amounts || report === 'receivables'
  )
  requireMetrics(
    data.totals,
    report,
    data.access.sales_amounts || report === 'receivables'
  )
  const keys = new Set()
  for (const group of data.groups) {
    if (
      typeof group.name !== 'string' ||
      !/^(c:\d+|[pu]:[1-9]\d*)$/u.test(group.key) ||
      keys.has(group.key) ||
      (groupBy === 'customer') !== group.key.startsWith('c:')
    ) {
      fail()
    }
    keys.add(group.key)
    requireMetrics(
      group,
      report,
      data.access.sales_amounts || report === 'receivables'
    )
  }
  return data
}
export function requireStatisticsSources(data, report) {
  requireMetadata(data)
  if (
    !Array.isArray(data.rows) ||
    data.rows.length > data.total ||
    typeof data.group_name !== 'string'
  ) {
    fail()
  }
  const keys = new Set()
  const statuses =
    report === 'delivery'
      ? ['done', 'pending', 'overdue', 'closed', 'unknown']
      : [
          ...STATISTICS_AGES.map(([key]) =>
            key === 'unknown_due' ? 'undated' : key
          ),
        ]
  for (const row of data.rows) {
    if (
      !isCount(row.id) ||
      row.id === 0 ||
      keys.has(row.id) ||
      !isCount(row.product_count) ||
      !statuses.includes(row.status) ||
      [
        'number',
        'customer',
        'product',
        'due_date',
        'owner',
        'unit',
        'source_number',
      ].some((key) => typeof row[key] !== 'string') ||
      ['ordered_quantity', 'shipped_quantity', 'amount'].some(
        (key) => !isMoney(row[key])
      )
    ) {
      fail()
    }
    keys.add(row.id)
  }
  return data
}
export function statisticsPaginationFromURL(
  params,
  { source = false, fallbackSize } = {}
) {
  const prefix = source ? 'source' : 'stats'
  const limit = normalizeWorkflowTaskPageSize(
    params.get(`${prefix}_size`) || fallbackSize
  )
  const value = Number(params.get(`${prefix}_page`))
  const page = Number.isFinite(value)
    ? Math.max(1, Math.min(Math.floor(1000000 / limit) + 1, Math.floor(value)))
    : 1
  return { limit, offset: (page - 1) * limit }
}

export function statisticsQueryFromURL(params) {
  const report =
    params.get('report') === 'receivables' ? 'receivables' : 'delivery'
  const group_by =
    report === 'delivery' && params.get('group') === 'product'
      ? 'product'
      : 'customer'
  const period = ['month', 'soon', 'all', 'custom'].includes(
    params.get('period')
  )
    ? params.get('period')
    : 'month'
  return {
    report,
    group_by,
    period: report === 'receivables' ? 'all' : period,
    currency: ['CNY', 'USD', 'HKD'].includes(params.get('currency'))
      ? params.get('currency')
      : 'CNY',
    keyword: params.get('sq') || '',
    date_from: period === 'custom' ? params.get('stfrom') || '' : '',
    date_to: period === 'custom' ? params.get('stto') || '' : '',
    status: params.get('status') || 'all',
    sort: params.get('sort') || 'count',
    direction: params.get('direction') === 'asc' ? 'asc' : 'desc',
    ...statisticsPaginationFromURL(params),
  }
}
