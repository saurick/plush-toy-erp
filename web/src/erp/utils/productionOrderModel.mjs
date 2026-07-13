export const PRODUCTION_ORDER_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  RELEASED: 'RELEASED',
  CLOSED: 'CLOSED',
  CANCELLED: 'CANCELLED',
})

export const PRODUCTION_ORDER_STATUS_META = Object.freeze({
  DRAFT: Object.freeze({ label: '草稿', color: 'default' }),
  RELEASED: Object.freeze({ label: '已发布', color: 'blue' }),
  CLOSED: Object.freeze({ label: '已关闭', color: 'green' }),
  CANCELLED: Object.freeze({ label: '已取消', color: 'red' }),
})

const MAX_KEY_LENGTH = 128

function invalidResponse() {
  const error = new Error('服务器返回的生产订单信息不完整，请刷新后重试')
  error.isInvalidResponse = true
  return error
}

export function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

export function productionOrderUUID(cryptoProvider = globalThis.crypto) {
  if (typeof cryptoProvider?.randomUUID !== 'function') {
    throw new Error('当前浏览器无法生成安全请求标识，请刷新或升级浏览器后重试')
  }
  return cryptoProvider.randomUUID()
}

export function requireProductionOrderKey(value) {
  if (typeof value !== 'string') throw invalidResponse()
  const key = value.trim()
  if (!key || [...key].length > MAX_KEY_LENGTH) throw invalidResponse()
  return key
}

export function validateProductionOrderAggregate(data, expected = {}) {
  const order = data?.production_order
  const items = data?.production_order_items
  if (
    !order ||
    typeof order !== 'object' ||
    !positiveSafeInteger(order.id) ||
    !positiveSafeInteger(order.version) ||
    typeof order.order_no !== 'string' ||
    !order.order_no.trim() ||
    !Object.hasOwn(PRODUCTION_ORDER_STATUS_META, order.status) ||
    !Array.isArray(items) ||
    items.length < 1 ||
    (positiveSafeInteger(expected.id) && order.id !== expected.id) ||
    (expected.status && order.status !== expected.status)
  ) {
    throw invalidResponse()
  }
  for (const item of items) {
    if (
      !item ||
      !positiveSafeInteger(item.id) ||
      item.production_order_id !== order.id ||
      !positiveSafeInteger(item.line_no) ||
      !positiveSafeInteger(item.product_id) ||
      !positiveSafeInteger(item.unit_id) ||
      typeof item.planned_quantity !== 'string' ||
      !item.planned_quantity.trim()
    ) {
      throw invalidResponse()
    }
  }
  return Object.freeze({ order, items })
}

export function validateProductionOrderList(data) {
  if (
    !data ||
    !Array.isArray(data.production_orders) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0 ||
    !Number.isSafeInteger(data.limit) ||
    data.limit < 1 ||
    !Number.isSafeInteger(data.offset) ||
    data.offset < 0
  ) {
    throw invalidResponse()
  }
  for (const order of data.production_orders) {
    if (
      !positiveSafeInteger(order?.id) ||
      !positiveSafeInteger(order?.version) ||
      typeof order?.order_no !== 'string' ||
      !order.order_no.trim() ||
      !Object.hasOwn(PRODUCTION_ORDER_STATUS_META, order.status)
    ) {
      throw invalidResponse()
    }
  }
  return data
}

export function validateProductionOrderOptions(data, referenceType) {
  if (
    !data ||
    data.reference_type !== referenceType ||
    !Array.isArray(data.options) ||
    !Number.isSafeInteger(data.total) ||
    data.total < 0
  ) {
    throw invalidResponse()
  }
  for (const option of data.options) {
    if (
      !positiveSafeInteger(option?.value) ||
      typeof option?.label !== 'string' ||
      !option.label.trim() ||
      typeof option?.selectable !== 'boolean'
    ) {
      throw invalidResponse()
    }
  }
  return data
}

export function isProductionOrderResultUnknown(error) {
  const httpStatus = Number(error?.httpStatus || 0)
  return Boolean(
    error?.isNetworkError ||
      error?.isAbortError ||
      error?.isInvalidResponse ||
      httpStatus === 408 ||
      httpStatus >= 500 ||
      Number(error?.code || 0) >= 50000
  )
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  )
}

export function createProductionOrderAttemptStore() {
  const attempts = new Map()
  return {
    prepare(scope, payload) {
      const signature = JSON.stringify(stableValue(payload))
      const current = attempts.get(scope)
      if (current?.signature === signature) return current
      const attempt = Object.freeze({
        signature,
        params: Object.freeze({
          ...payload,
          idempotency_key: productionOrderUUID(),
        }),
      })
      attempts.set(scope, attempt)
      return attempt
    },
    finish(scope, attempt) {
      if (attempts.get(scope) === attempt) attempts.delete(scope)
    },
    peek(scope) {
      return attempts.get(scope) || null
    },
  }
}

export function unixToDateInput(value) {
  if (!positiveSafeInteger(value)) return ''
  return new Date(value * 1000).toISOString().slice(0, 10)
}

export function dateInputToUnix(value) {
  const text = String(value || '').trim()
  if (!text) return null
  const timestamp = Date.parse(`${text}T00:00:00Z`)
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null
}

export function productionOrderReadableItem(item = {}) {
  return {
    ...item,
    product_label:
      [item.product_code_snapshot, item.product_name_snapshot]
        .filter(Boolean)
        .join(' · ') || '产品信息待核对',
    sku_label: item.sku_code_snapshot || '未指定规格',
    unit_label: item.unit_name_snapshot || '单位信息待核对',
    sales_source_label: item.sales_order_item_label || '未关联销售订单',
    bom_label: item.bom_version_snapshot || '未关联 BOM',
  }
}
