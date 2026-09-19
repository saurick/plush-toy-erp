import { parseDateInputValue } from './dateRange.mjs'
import { OUTSOURCING_ORDER_STATUS_LABELS } from './masterDataOrderView.mjs'

export function readOutsourcingSummaryFilters(params) {
  const text = (key) => (params.get(`outsourcing.${key}`) || '').trim()
  const positiveID = (key) => {
    const value = Number(text(key))
    return Number.isSafeInteger(value) && value > 0 && value <= 10000000
      ? value
      : undefined
  }
  const page = Math.min(positiveID('page') || 1, 100000)
  const from = parseDateInputValue(text('from'))?.format('YYYY-MM-DD')
  const to = parseDateInputValue(text('to'))?.format('YYYY-MM-DD')
  return {
    keyword: [...text('q')].slice(0, 100).join(''),
    supplier_id: positiveID('supplier'),
    process_id: positiveID('process'),
    lifecycle_status: Object.hasOwn(
      OUTSOURCING_ORDER_STATUS_LABELS,
      text('status')
    )
      ? text('status')
      : '',
    lifecycle_scope: 'all',
    date_field:
      text('date') === 'expected_return_date'
        ? 'expected_return_date'
        : 'order_date',
    ...(from ? { date_from: `${from}T00:00:00+08:00` } : {}),
    ...(to ? { date_to: `${to}T23:59:59+08:00` } : {}),
    limit: 20,
    offset: (page - 1) * 20,
  }
}

export function updateOutsourcingSummarySearch(params, updates) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(`outsourcing.${key}`, String(value))
    else next.delete(`outsourcing.${key}`)
  }
  if (!Object.hasOwn(updates, 'page')) next.delete('outsourcing.page')
  return next
}

export const outsourcingSummarySubjectCode = (row) =>
  row.subject_type === 'MATERIAL'
    ? row.material_code_snapshot
    : row.product_no_snapshot
export const outsourcingSummarySubjectName = (row) =>
  row.subject_type === 'MATERIAL'
    ? row.material_name_snapshot
    : row.product_name_snapshot

export function outsourcingSummaryStatus(row) {
  const status =
    OUTSOURCING_ORDER_STATUS_LABELS[row.lifecycle_status] || '状态待确认'
  const line = { closed: '明细已关闭', canceled: '明细已取消' }[row.line_status]
  return line ? `${status} · ${line}` : status
}
