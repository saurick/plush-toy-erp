import { SalesOrderItemStatus, SalesOrderStatus } from '../../common/consts/statuses.generated.mjs'
import { positiveInt } from './businessLineItems.mjs'
import { isBusinessCurrency } from './businessCurrency.mjs'
import { listAllPaginatedRecords } from './referencePagination.mjs'
import {
  compareNumeric20Scale6Units,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
} from './numeric20Scale6.mjs'

export const SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE = 20

export function validateShipmentSourceOrderOptions(orders) {
  if (!Array.isArray(orders)) throw invalidCandidateResponse()
  const ids = new Set()
  for (const order of orders) {
    if (!isPositiveSafeInteger(order?.sales_order_id) || !isPositiveSafeInteger(order?.customer_id) ||
      typeof order.order_no !== 'string' || !order.order_no.trim() ||
      typeof order.customer_code !== 'string' || !order.customer_code.trim() ||
      typeof order.customer_name !== 'string' || !order.customer_name.trim() ||
      typeof order.customer_name_snapshot !== 'string' || ids.has(order.sales_order_id)) throw invalidCandidateResponse()
    ids.add(order.sales_order_id)
  }
  return orders
}

function retainCurrentScope(options, value, existingOptions) {
  if (!value || options.some((option) => option.value === value)) return options
  const current = existingOptions.find((option) => option.value === value)
  return current ? [...options, { ...current, disabled: true }] : options
}

export function shipmentSourceFilterOptions(sourceOrders, {
  customerID, salesOrderID, customerOptions = [], salesOrderOptions = [],
} = {}) {
  const customers = [...new Map(sourceOrders.map((order) => [order.customer_id, {
    value: order.customer_id,
    label: `${order.customer_code} · ${order.customer_name}`,
    identity: { name: order.customer_name, code: order.customer_code },
  }])).values()]
  const orders = sourceOrders.filter((order) => !customerID || order.customer_id === customerID).map((order) => ({
    value: order.sales_order_id,
    label: `${order.order_no} · ${order.customer_name_snapshot || order.customer_name}`,
  }))
  return {
    customers: retainCurrentScope(customers, customerID, customerOptions),
    orders: retainCurrentScope(orders, salesOrderID, salesOrderOptions),
  }
}

const DISABLED_REASON_TEXT = Object.freeze({
  line_not_open: '来源行已关闭',
  fully_shipped: '已全部确认出货',
  source_mismatch: '来源资料不一致，请刷新后核对',
  shipped_quantity_exceeded: '累计出货数量异常，请刷新后核对',
})
const DISABLED_REASON_CODES = new Set(Object.keys(DISABLED_REASON_TEXT))

function invalidCandidateResponse() {
  const error = new Error('服务器返回的可出货销售订单行不完整，请刷新后重试')
  error.isInvalidResponse = true
  return error
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function matchesBackendEligibilityPrecedence({
  lineStatus,
  selectable,
  disabledReason,
  orderedQuantity,
  shippedQuantity,
  remainingQuantity,
}) {
  if (lineStatus !== SalesOrderItemStatus.OPEN) {
    return !selectable && disabledReason === 'line_not_open'
  }
  if (disabledReason === 'source_mismatch') {
    return !selectable
  }
  if (compareNumeric20Scale6Units(shippedQuantity, orderedQuantity) > 0) {
    return !selectable && disabledReason === 'shipped_quantity_exceeded'
  }
  if (remainingQuantity === '0') {
    return !selectable && disabledReason === 'fully_shipped'
  }
  return selectable && disabledReason === ''
}

export function shipmentSourceCandidateListParams({
  keyword = '',
  page = 1,
  pageSize = SHIPMENT_SOURCE_CANDIDATE_PAGE_SIZE,
  salesOrderID,
  customerID,
  selectable,
} = {}) {
  const normalizedPage = Number(page)
  const normalizedPageSize = Number(pageSize)
  if (
    !Number.isSafeInteger(normalizedPage) ||
    normalizedPage <= 0 ||
    !Number.isSafeInteger(normalizedPageSize) ||
    normalizedPageSize <= 0 ||
    normalizedPageSize > 200
  ) {
    throw new TypeError('可出货来源分页参数不合法')
  }
  const offset = (normalizedPage - 1) * normalizedPageSize
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new TypeError('可出货来源分页参数不合法')
  }
  const params = { limit: normalizedPageSize, offset }
  const normalizedKeyword = String(keyword ?? '').trim()
  if ([...normalizedKeyword].length > 128) {
    throw new TypeError('搜索内容不能超过 128 个字符')
  }
  if (normalizedKeyword) params.keyword = normalizedKeyword
  const normalizedSalesOrderID = positiveInt(salesOrderID)
  if (normalizedSalesOrderID) params.sales_order_id = normalizedSalesOrderID
  const normalizedCustomerID = positiveInt(customerID)
  if (normalizedCustomerID) params.customer_id = normalizedCustomerID
  if (typeof selectable === 'boolean') params.selectable = selectable
  return params
}

export function validateShipmentSourceCandidatePage(
  data,
  { limit, offset } = {}
) {
  const rows = data?.shipment_source_candidates
  const total = data?.total
  if (
    !Array.isArray(rows) ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    data?.limit !== limit ||
    data?.offset !== offset ||
    rows.length > limit ||
    offset + rows.length > total ||
    (offset + rows.length < total && rows.length !== limit)
  ) {
    throw invalidCandidateResponse()
  }

  const sourceItemIDs = new Set()
  rows.forEach((row) => {
    const salesOrderID = row?.sales_order_id
    const salesOrderItemID = row?.sales_order_item_id
    const selectable = row?.selectable
    const disabledReason = String(row?.disabled_reason ?? '').trim()
    const orderedQuantity = numeric20Scale6Units(row?.ordered_quantity)
    const shippedQuantity = numeric20Scale6Units(row?.shipped_quantity)
    const remainingQuantity = numeric20Scale6Units(row?.remaining_quantity)
    const expectedRemainingQuantity =
      orderedQuantity !== null &&
      shippedQuantity !== null &&
      compareNumeric20Scale6Units(orderedQuantity, shippedQuantity) > 0
        ? subtractNumeric20Scale6Units(orderedQuantity, shippedQuantity)
        : '0'
    const productSkuID = row?.product_sku_id
    const customerSnapshot = row?.customer_snapshot
    const deliverySnapshot = row?.delivery_snapshot
    const currency = String(row?.currency ?? '').trim()
    if (
      !isPositiveSafeInteger(salesOrderID) ||
      !isPositiveSafeInteger(salesOrderItemID) ||
      !isPositiveSafeInteger(row?.customer_id) ||
      !isPositiveSafeInteger(row?.product_id) ||
      !isPositiveSafeInteger(row?.unit_id) ||
      (productSkuID !== null &&
        productSkuID !== undefined &&
        !isPositiveSafeInteger(productSkuID)) ||
      !Number.isSafeInteger(row?.order_version) ||
      row.order_version <= 0 ||
      !Number.isSafeInteger(row?.line_no) ||
      row.line_no <= 0 ||
      String(row?.order_status || '')
        .trim()
        .toLowerCase() !== SalesOrderStatus.ACTIVE ||
      String(row?.line_status || '').trim() === '' ||
      String(row?.order_no || '').trim() === '' ||
      typeof row?.currency !== 'string' ||
      row.currency !== currency ||
      !isBusinessCurrency(currency) ||
      String(row?.customer_name || '').trim() === '' ||
      String(row?.product_code || '').trim() === '' ||
      String(row?.product_name || '').trim() === '' ||
      (row?.product_code_snapshot !== null &&
        row?.product_code_snapshot !== undefined &&
        typeof row.product_code_snapshot !== 'string') ||
      (row?.product_name_snapshot !== null &&
        row?.product_name_snapshot !== undefined &&
        typeof row.product_name_snapshot !== 'string') ||
      String(row?.unit_code || '').trim() === '' ||
      String(row?.unit_name || '').trim() === '' ||
      (isPositiveSafeInteger(productSkuID) &&
        String(row?.sku_code || '').trim() === '') ||
      (customerSnapshot !== null &&
        customerSnapshot !== undefined &&
        (typeof customerSnapshot !== 'object' ||
          Array.isArray(customerSnapshot))) ||
      (deliverySnapshot !== null &&
        deliverySnapshot !== undefined &&
        (typeof deliverySnapshot !== 'object' ||
          Array.isArray(deliverySnapshot))) ||
      sourceItemIDs.has(salesOrderItemID) ||
      typeof selectable !== 'boolean' ||
      orderedQuantity === null ||
      shippedQuantity === null ||
      remainingQuantity === null ||
      compareNumeric20Scale6Units(orderedQuantity, '0') <= 0 ||
      compareNumeric20Scale6Units(shippedQuantity, '0') < 0 ||
      compareNumeric20Scale6Units(remainingQuantity, '0') < 0 ||
      remainingQuantity !== expectedRemainingQuantity ||
      (disabledReason && !DISABLED_REASON_CODES.has(disabledReason)) ||
      !matchesBackendEligibilityPrecedence({
        lineStatus: String(row.line_status).trim().toLowerCase(),
        selectable,
        disabledReason,
        orderedQuantity,
        shippedQuantity,
        remainingQuantity,
      })
    ) {
      throw invalidCandidateResponse()
    }
    sourceItemIDs.add(salesOrderItemID)
  })

  return data
}

export function normalizeShipmentSourceCandidate(row = {}) {
  const salesOrderItemID = positiveInt(row.sales_order_item_id)
  const disabledReasonCode = String(row.disabled_reason || '')
  return {
    ...row,
    id: salesOrderItemID,
    orderedQuantity: String(row.ordered_quantity),
    shippedQuantity: String(row.shipped_quantity),
    remainingQuantity: String(row.remaining_quantity),
    disabledReason: row.selectable
      ? ''
      : DISABLED_REASON_TEXT[disabledReasonCode] || '当前来源行不可导入',
  }
}

export async function loadShipmentSourceSelection(listPage, params, { signal, expectedTotal }) {
  if (!positiveInt(params.sales_order_id) || params.selectable !== true) throw invalidCandidateResponse()
  const data = await listAllPaginatedRecords(listPage, params, 'shipment_source_candidates', { signal }, {
    invalidResponseMessage: '销售订单来源列表不完整，请重新加载后重试',
    recordIdentityKey: (row) => String(row.sales_order_item_id),
  })
  if (signal.aborted) return []
  const rows = data.shipment_source_candidates
  if (data.total !== expectedTotal || rows.some((row) => row.sales_order_id !== params.sales_order_id ||
    (params.customer_id && row.customer_id !== params.customer_id) || row.selectable !== true)) {
    throw invalidCandidateResponse()
  }
  return rows.map(normalizeShipmentSourceCandidate)
}

export function shipmentSourceOrderFromCandidate(row = {}) {
  return {
    id: positiveInt(row.sales_order_id),
    order_no: row.order_no || '',
    lifecycle_status: row.order_status || '',
    version: row.order_version,
    currency: row.currency || '',
    customer_id: positiveInt(row.customer_id),
    customer_snapshot: row.customer_snapshot,
    customer_name: row.customer_name || '',
    ...(row.delivery_snapshot && typeof row.delivery_snapshot === 'object'
      ? { delivery_snapshot: row.delivery_snapshot }
      : {}),
  }
}
