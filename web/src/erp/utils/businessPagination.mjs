export const DEFAULT_BUSINESS_PAGE_SIZE = 20
export const BUSINESS_PAGE_SIZE_OPTIONS = ['10', '20', '50', '100']

export function getBusinessPaginationParams(pagination = {}) {
  const pageSize = Number(pagination.pageSize) || DEFAULT_BUSINESS_PAGE_SIZE
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
  const pageSize = Number(pagination.pageSize) || DEFAULT_BUSINESS_PAGE_SIZE
  const current = Math.max(Number(pagination.current) || 1, 1)
  return {
    current,
    pageSize,
    total,
    showSizeChanger: true,
    pageSizeOptions: BUSINESS_PAGE_SIZE_OPTIONS,
    showTotal: (count, range) =>
      `第 ${range[0]}-${range[1]} 条 / 共 ${count} 条`,
    onChange,
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
