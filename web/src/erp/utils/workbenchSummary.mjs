import { PermissionCode } from '../../common/consts/permissions.generated.mjs'
import { WorkbenchSummarySort } from '../../common/consts/statuses.generated.mjs'
import { hasActionPermission } from './masterDataOrderView.mjs'
import { canListEngineeringMaterial } from './engineeringMaterialTask.mjs'
import { currentBusinessDate } from './businessDate.mjs'

export function getWorkbenchSummaryOptions(profile) {
  if (
    !profile?.effective_session?.pages?.includes('global-dashboard') ||
    !hasActionPermission(profile, PermissionCode.ERP_WORKBENCH_READ)
  ) {
    return []
  }
  const options = []
  if (
    hasActionPermission(profile, PermissionCode.SALES_ORDER_READ) &&
    hasActionPermission(profile, PermissionCode.SALES_ORDER_ITEM_READ)
  ) {
    options.push({ value: 'sales-orders', label: '销售订单汇总' })
  }
  if (canListEngineeringMaterial(profile)) {
    options.push({ value: 'materials', label: '材料汇总' })
  }
  if (hasActionPermission(profile, PermissionCode.FINANCE_PAYMENT_READ)) {
    options.push({ value: 'payments', label: '收付款汇总' })
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

export const SALES_SUMMARY_SORT_FIELDS = {
  order_no: WorkbenchSummarySort.ORDER_NO,
  order_date: WorkbenchSummarySort.ORDER_DATE,
  customer_name: WorkbenchSummarySort.CUSTOMER_NAME,
  customer_order_no: WorkbenchSummarySort.CUSTOMER_ORDER_NO,
  customer_product_no: WorkbenchSummarySort.CUSTOMER_PRODUCT_NO,
  product: WorkbenchSummarySort.PRODUCT,
  ordered_quantity: WorkbenchSummarySort.ORDERED_QUANTITY,
  pre_shipment_sample_quantity: WorkbenchSummarySort.SAMPLE_QUANTITY,
  production_quantity: WorkbenchSummarySort.PRODUCTION_QUANTITY,
  unit_name: WorkbenchSummarySort.UNIT_NAME,
  unshipped_quantity: WorkbenchSummarySort.UNSHIPPED_QUANTITY,
  sales_owner: WorkbenchSummarySort.SALES_OWNER,
  unit_price: WorkbenchSummarySort.UNIT_PRICE,
  currency: WorkbenchSummarySort.CURRENCY,
  lifecycle_status: WorkbenchSummarySort.LIFECYCLE_STATUS,
  order_category: WorkbenchSummarySort.ORDER_CATEGORY,
  designer: WorkbenchSummarySort.DESIGNER,
  note: WorkbenchSummarySort.NOTE,
  process_requirement: WorkbenchSummarySort.PROCESS_REQUIREMENT,
  planned_delivery_date: WorkbenchSummarySort.PLANNED_DELIVERY_DATE,
}
export const MATERIAL_SUMMARY_SORT_FIELDS = {
  order_no: WorkbenchSummarySort.ORDER_NO,
  submitted_at: WorkbenchSummarySort.SUBMITTED_AT,
}

export function readSummarySort(params, prefix, fields) {
  const field = params.get(`${prefix}.sort_by`)
  const direction = params.get(`${prefix}.sort_direction`)
  return Object.hasOwn(fields, field) && ['asc', 'desc'].includes(direction)
    ? { sort_by: field, sort_direction: direction }
    : null
}

export function summaryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value || '')) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().startsWith(value)
    ? value
    : ''
}

export const PAYMENT_SUMMARY_PERIOD_PRESETS = [
  { value: 'month', label: '本月' },
  { value: 'today', label: '今天' },
  { value: 'last-month', label: '上月' },
  { value: 'all', label: '全部历史' },
]

export function readPaymentSummaryPeriod(params, today = currentBusinessDate()) {
  const period = params.get('payments.period')
  const monthStart = `${today.slice(0, 7)}-01`
  switch (period) {
    case 'today':
      return { period, dateFrom: today, dateTo: today }
    case 'last-month': {
      const lastMonthEnd = new Date(`${monthStart}T00:00:00Z`)
      lastMonthEnd.setUTCDate(0)
      const dateTo = lastMonthEnd.toISOString().slice(0, 10)
      return { period, dateFrom: `${dateTo.slice(0, 7)}-01`, dateTo }
    }
    case 'all':
      return { period, dateFrom: '', dateTo: '' }
    case 'custom': {
      const dateFrom = summaryDate(params.get('payments.from'))
      const dateTo = summaryDate(params.get('payments.to'))
      if (dateFrom && dateTo && dateFrom <= dateTo) {
        return { period, dateFrom, dateTo }
      }
      break
    }
    case null: {
      // Preserve saved workbench links from the single-day view.
      const date = summaryDate(params.get('payments.date'))
      if (date) return { period: 'custom', dateFrom: date, dateTo: date }
      break
    }
    default:
      break
  }
  return { period: 'month', dateFrom: monthStart, dateTo: today }
}

export function readSalesSummaryFilters(params) {
  const text = (key) => (params.get(`sales.${key}`) || '').trim().slice(0, 100)
  const customerParam = params.get('sales.customer_id') || ''
  const customerID = /^[1-9]\d*$/u.test(customerParam) ? Number(customerParam) : 0
  const hasCustomerID = customerID > 0 && Number.isSafeInteger(customerID)
  const ownerName = (params.get('sales.owner_name') || '').trim()
  const status = text('status')
  const dateFrom = summaryDate(text('from'))
  const dateTo = summaryDate(text('to'))
  return {
    keyword: text('q'),
    ...readSummarySort(params, 'sales', SALES_SUMMARY_SORT_FIELDS),
    ...(hasCustomerID ? { customer_id: customerID } : {}),
    customer: hasCustomerID ? '' : text('customer'),
    ...(ownerName ? { sales_owner_name: ownerName } : {}),
    sales_owner: ownerName ? '' : text('owner'),
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
