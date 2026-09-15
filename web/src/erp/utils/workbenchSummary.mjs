import { hasActionPermission } from './masterDataOrderView.mjs'
import { canListEngineeringMaterial } from './engineeringMaterialTask.mjs'

export function getWorkbenchSummaryOptions(profile) {
  if (
    !profile?.effective_session?.pages?.includes('global-dashboard') ||
    !hasActionPermission(profile, 'erp.workbench.read')
  ) {
    return []
  }
  const options = []
  if (
    hasActionPermission(profile, 'sales_order.read') &&
    hasActionPermission(profile, 'sales_order_item.read')
  ) {
    options.push({ value: 'sales-orders', label: '销售订单汇总' })
  }
  if (canListEngineeringMaterial(profile)) {
    options.push({ value: 'materials', label: '材料汇总' })
  }
  return options
}

export function summaryPage(value) {
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1
}

export const SALES_SUMMARY_STATUSES = [
  { value: '', label: '全部订单状态' },
  { value: 'draft', label: '草稿' },
  { value: 'submitted', label: '已提交' },
  { value: 'active', label: '已生效' },
  { value: 'closed', label: '已关闭' },
  { value: 'canceled', label: '已取消' },
]

function summaryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
    ? value
    : ''
}

export function readSalesSummaryFilters(params) {
  const text = (key) => (params.get(`sales.${key}`) || '').trim().slice(0, 100)
  const status = text('status')
  const dateFrom = summaryDate(text('from'))
  const dateTo = summaryDate(text('to'))
  return {
    keyword: text('q'),
    customer: text('customer'),
    sales_owner: text('owner'),
    lifecycle_status: SALES_SUMMARY_STATUSES.some(
      ({ value }) => value === status
    )
      ? status
      : '',
    date_field:
      text('date') === 'planned_delivery_date'
        ? 'planned_delivery_date'
        : 'order_date',
    ...(dateFrom ? { date_from: `${dateFrom}T00:00:00+08:00` } : {}),
    ...(dateTo ? { date_to: `${dateTo}T23:59:59+08:00` } : {}),
    limit: 20,
    offset: (summaryPage(params.get('sales.page')) - 1) * 20,
  }
}

export function updateSummarySearch(params, prefix, updates) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(updates)) {
    if (value) next.set(`${prefix}.${key}`, String(value))
    else next.delete(`${prefix}.${key}`)
  }
  if (!Object.hasOwn(updates, 'page')) next.delete(`${prefix}.page`)
  return next
}
