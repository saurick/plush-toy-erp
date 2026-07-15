export const BUSINESS_ROW_ITEMS_PREVIEW_LIMIT = 5
export const BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE = 20

export function normalizeBusinessRowItemsTotal(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined
}

export function resolveBusinessRowItemsTotal({
  cachedTotal,
  getItemTotal,
  record,
} = {}) {
  const normalizedCachedTotal = normalizeBusinessRowItemsTotal(cachedTotal)
  if (normalizedCachedTotal !== undefined) return normalizedCachedTotal
  if (typeof getItemTotal !== 'function') return undefined

  try {
    return normalizeBusinessRowItemsTotal(getItemTotal(record))
  } catch {
    return undefined
  }
}

function invalidPreviewData() {
  const error = new Error('服务器返回的明细数据不完整，请核对后重试')
  error.isInvalidResponse = true
  return error
}

export function businessRowItemsCacheKey(
  record,
  { idField = 'id', versionFields = ['version', 'updated_at'] } = {}
) {
  const id = record?.[idField]
  if (
    (typeof id !== 'number' && typeof id !== 'string') ||
    String(id).trim() === ''
  ) {
    throw invalidPreviewData()
  }

  const fields = Array.isArray(versionFields) ? versionFields : []
  const versionField = fields.find((field) => {
    const value = record?.[field]
    return value !== undefined && value !== null && String(value).trim() !== ''
  })
  const version = versionField ? record[versionField] : 'current'
  return `${String(id).trim()}:${String(version).trim()}`
}

export function normalizeBusinessRowItemsResult(result) {
  if (Array.isArray(result)) {
    return {
      items: result,
      total: result.length,
    }
  }

  const items = result?.items
  const total = result?.total
  if (
    !Array.isArray(items) ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    items.length > total
  ) {
    throw invalidPreviewData()
  }

  return { items, total }
}

export function businessRowEmbeddedItemsSnapshot(
  items,
  previewLimit = BUSINESS_ROW_ITEMS_PREVIEW_LIMIT
) {
  if (!Array.isArray(items)) throw invalidPreviewData()
  const all = normalizeBusinessRowItemsResult(items)
  const limit =
    Number.isSafeInteger(previewLimit) && previewLimit > 0
      ? previewLimit
      : BUSINESS_ROW_ITEMS_PREVIEW_LIMIT
  return {
    all,
    preview: {
      items: all.items.slice(0, limit),
      total: all.total,
    },
  }
}

export function isBusinessRowItemsResultComplete(result) {
  const snapshot = normalizeBusinessRowItemsResult(result)
  return snapshot.items.length === snapshot.total
}

export function businessRowItemsModalPage(
  items,
  page,
  pageSize = BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE
) {
  const safeItems = Array.isArray(items) ? items : []
  const safePageSize =
    Number.isSafeInteger(pageSize) && pageSize > 0
      ? pageSize
      : BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE
  const pageCount = Math.max(1, Math.ceil(safeItems.length / safePageSize))
  const safePage = Math.min(
    Math.max(Number.isSafeInteger(page) ? page : 1, 1),
    pageCount
  )
  const start = (safePage - 1) * safePageSize
  return {
    items: safeItems.slice(start, start + safePageSize),
    page: safePage,
    pageCount,
    pageSize: safePageSize,
  }
}
