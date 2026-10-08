import { getWorkflowTaskSourceTypeLabel } from './dashboardTaskDisplay.mjs'
import { TASK_BOARD_PAGE_SIZE_OPTIONS, TASK_BOARD_ROLE_OPTIONS } from './workflowTaskBoard.mjs'

export const TRACKING_STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '进行中' },
  { value: 'completed', label: '已结束' },
]

export const TRACKING_ROLE_OPTIONS = [{ value: '', label: '全部当前岗位' }, ...TASK_BOARD_ROLE_OPTIONS]
export const TRACKING_ATTENTION_OPTIONS = [
  { value: '', label: '全部情况' },
  { value: 'overdue', label: '只看逾期' },
  { value: 'blocked', label: '只看受阻' },
]
export const TRACKING_SOURCE_OPTIONS = [
  { value: '', label: '全部单据类型' },
  ...['sales_order', 'purchase_order', 'production_order', 'outsourcing_order', 'shipment', 'purchase_receipt', 'finance_payment', 'inventory_operation', 'production_exception_decision', 'production_fact', 'quality_inspection', 'bom_header', 'engineering_material_request'].map((value) => ({ value, label: getWorkflowTaskSourceTypeLabel(value) })),
]

const FILTER_FIELDS = ['status', 'owner_role_key', 'source_type', 'attention', 'date_from', 'date_to']

export function readTrackingFilters(params, scope) {
  return Object.fromEntries(FILTER_FIELDS.map((key) => [key, params.get(`track_${key}_${scope}`) || '']))
}

export function writeTrackingFilters(params, scope, changes) {
  const next = new URLSearchParams(params)
  for (const [key, value] of Object.entries(changes)) {
    if (!FILTER_FIELDS.includes(key) && key !== 'search') continue
    const name = `track_${key}_${scope}`
    if (value) next.set(name, value)
    else next.delete(name)
    next.delete(`track_page_${scope}`)
  }
  return next
}

export function clearTrackingFilters(params, scope) {
  return writeTrackingFilters(params, scope, Object.fromEntries([...FILTER_FIELDS, 'search'].map((key) => [key, ''])))
}

export function readTrackingPagination(params, scope) {
  const size = Number(params.get(`track_page_size_${scope}`))
  const pageSize = TASK_BOARD_PAGE_SIZE_OPTIONS.includes(size) ? size : 20
  const requested = params.get(`track_page_${scope}`) || '1'
  const page = /^\d+$/.test(requested) ? Number(requested) : 1
  return {
    page: Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger((page - 1) * pageSize) ? page : 1,
    pageSize,
  }
}

export function writeTrackingPagination(params, scope, page, pageSize) {
  const next = new URLSearchParams(params)
  const previous = readTrackingPagination(params, scope)
  next.set(`track_page_size_${scope}`, String(pageSize))
  next.set(`track_page_${scope}`, String(pageSize === previous.pageSize ? page : 1))
  return next
}
