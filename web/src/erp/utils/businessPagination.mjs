import { formatPaginationTotal } from '../../common/utils/pagination.mjs'
import { BusinessPaginationPolicy } from '../../common/consts/policies.generated.mjs'

export const DEFAULT_BUSINESS_PAGE_SIZE = BusinessPaginationPolicy.defaultPageSize
export const BUSINESS_PAGE_SIZE_OPTIONS = [DEFAULT_BUSINESS_PAGE_SIZE, 100, 200, 300, BusinessPaginationPolicy.maxPageSize]

export function normalizeBusinessPageSize(value) {
  const pageSize = Number(value)
  return BUSINESS_PAGE_SIZE_OPTIONS.includes(pageSize)
    ? pageSize
    : DEFAULT_BUSINESS_PAGE_SIZE
}

export function getBusinessPaginationParams(pagination = {}) {
  const pageSize = normalizeBusinessPageSize(pagination.pageSize)
  const current = Math.max(Number(pagination.current) || 1, 1)
  return {
    limit: pageSize,
    offset: (current - 1) * pageSize,
  }
}

export function createBusinessTablePagination({
  pagination = {},
  total = 0,
  onChange,
}) {
  const pageSize = normalizeBusinessPageSize(pagination.pageSize)
  const current = Math.max(Number(pagination.current) || 1, 1)
  return {
    current,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: BUSINESS_PAGE_SIZE_OPTIONS,
    showTotal: formatPaginationTotal,
    onChange: onChange
      ? (nextPage, nextPageSize = pageSize) => {
          const normalizedSize = normalizeBusinessPageSize(nextPageSize)
          onChange(normalizedSize === pageSize ? nextPage : 1, normalizedSize)
        }
      : undefined,
  }
}

export function resetBusinessPaginationCurrent(setPagination) {
  setPagination((current) => ({
    ...current,
    current: 1,
  }))
}

export function resolveExactRecordPage({
  records = [],
  exactRecord = null,
  hasExactContext = false,
  total = 0,
} = {}) {
  const listedRecords = Array.isArray(records) ? records : []
  if (!hasExactContext) {
    return {
      records: listedRecords,
      total: Math.max(Number(total) || 0, 0),
    }
  }
  return {
    records: exactRecord ? [exactRecord] : [],
    total: exactRecord ? 1 : 0,
  }
}
