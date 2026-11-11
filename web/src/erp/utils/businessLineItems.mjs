import { compactParams, trimOptional } from './sourceDocumentValues.mjs'
import {
  formatNumeric20Scale6,
  isPositiveNumeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'
import { InventoryLotStatus, StockReservationStatus } from '../../common/consts/statuses.generated.mjs'

export function positiveInt(value) {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.trunc(numberValue)
    : undefined
}

export function requiredInt(value) {
  return positiveInt(value) || 0
}

export function formatQuantity(value) {
  return formatNumeric20Scale6(value)
}

export function buildPurchaseReceiptItemParams(receiptID, values = {}) {
  return compactParams({
    receipt_id: positiveInt(receiptID),
    material_id: positiveInt(values.material_id),
    warehouse_id: positiveInt(values.warehouse_id),
    unit_id: positiveInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    purchase_order_item_id: positiveInt(values.purchase_order_item_id),
    lot_no: trimOptional(values.lot_no),
    quantity: trimOptional(values.quantity),
    unit_price: trimOptional(values.unit_price),
    amount: trimOptional(values.amount),
    source_line_no: trimOptional(values.source_line_no),
    note: trimOptional(values.note),
  })
}

export function createBlankPurchaseReceiptItem(receiptID) {
  return {
    receipt_id: receiptID,
    material_id: undefined,
    warehouse_id: undefined,
    unit_id: undefined,
    lot_id: undefined,
    purchase_order_item_id: undefined,
    lot_no: '',
    quantity: '',
    unit_price: '',
    amount: '',
    source_line_no: '',
    note: '',
  }
}

export function createDuplicatedDraftLineItem(item = {}) {
  const source = item && typeof item === 'object' ? item : {}
  const nextItem = { ...source }
  delete nextItem.id
  delete nextItem.line_no
  delete nextItem.line_status
  delete nextItem.created_at
  delete nextItem.updated_at
  return nextItem
}

export function isBlankPurchaseOrderDraftLine(item = {}) {
  // 自动行号不代表业务输入；主键及其他非空字段均需保留。
  return Object.entries(item).every(
    ([key, value]) =>
      key === 'line_no' ||
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
  )
}

export function withoutBlankPurchaseOrderDraftLines(lines = []) {
  return lines.filter((line) => !isBlankPurchaseOrderDraftLine(line))
}

export function buildShipmentItemParams(values = {}) {
  return compactParams({
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
    product_sku_id: positiveInt(values.product_sku_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    package_description: trimOptional(values.package_description),
    case_no: trimOptional(values.case_no),
    note: trimOptional(values.note),
  })
}

export function createShipmentItemFromSalesOrderItem(item, { quantity } = {}) {
  const sourceItem = item || {}
  const nextQuantity =
    quantity === undefined || quantity === null || quantity === ''
      ? sourceItem.remainingQuantity || sourceItem.ordered_quantity || ''
      : quantity
  return {
    sales_order_item_id: sourceItem.id,
    product_id: sourceItem.product_id,
    product_sku_id: sourceItem.product_sku_id,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: sourceItem.unit_id,
    quantity: nextQuantity,
    package_description: '',
    case_no: '',
    note: sourceItem.product_name_snapshot
      ? `来源销售订单行：${sourceItem.product_name_snapshot}`
      : '',
  }
}

function recordByID(records, id) {
  const normalizedID = positiveInt(id)
  if (!normalizedID) return null
  return (
    (Array.isArray(records) ? records : []).find(
      (record) => positiveInt(record?.id) === normalizedID
    ) || null
  )
}

export function buildShipmentSourceItemChangePatch(
  salesOrderItemID,
  salesOrderItems = []
) {
  const sourceItem = recordByID(salesOrderItems, salesOrderItemID)
  const remainingQuantity = numeric20Scale6Units(sourceItem?.remainingQuantity)
  if (
    !sourceItem ||
    sourceItem.selectable !== true ||
    sourceItem.disabledReason ||
    remainingQuantity === null ||
    !isPositiveNumeric20Scale6Units(remainingQuantity)
  ) {
    return {
      sales_order_item_id: undefined,
      product_id: undefined,
      product_sku_id: undefined,
      unit_id: undefined,
      lot_id: undefined,
      quantity: '',
      note: '',
    }
  }
  return createShipmentItemFromSalesOrderItem(sourceItem, {
    quantity: sourceItem.remainingQuantity,
  })
}

export function buildShipmentProductChangePatch(productID, products = []) {
  const normalizedProductID = positiveInt(productID)
  const product = recordByID(products, normalizedProductID)
  return {
    sales_order_item_id: undefined,
    product_id: normalizedProductID,
    product_sku_id: undefined,
    unit_id: positiveInt(product?.default_unit_id),
    lot_id: undefined,
  }
}

export function buildShipmentSKUChangePatch(productSkuID, productSKUs = []) {
  const normalizedSkuID = positiveInt(productSkuID)
  const sku = recordByID(productSKUs, normalizedSkuID)
  const patch = {
    product_sku_id: normalizedSkuID,
    lot_id: undefined,
  }
  const defaultUnitID = positiveInt(sku?.default_unit_id)
  if (defaultUnitID) patch.unit_id = defaultUnitID
  return patch
}

export function filterShipmentProductSKUOptions(
  options,
  productSKUs,
  productID
) {
  const normalizedProductID = positiveInt(productID)
  if (!normalizedProductID) return []
  const allowedIDs = new Set(
    (Array.isArray(productSKUs) ? productSKUs : [])
      .filter((sku) => positiveInt(sku?.product_id) === normalizedProductID)
      .map((sku) => positiveInt(sku?.id))
      .filter(Boolean)
  )
  return (Array.isArray(options) ? options : []).filter((option) =>
    allowedIDs.has(positiveInt(option?.value))
  )
}

export function filterShipmentInventoryLotOptions(
  options,
  balances,
  { productID, productSkuID, warehouseID, unitID, salesOrderID, sourceItemID, reservations = [] } = {}
) {
  const normalizedProductID = positiveInt(productID)
  const normalizedSkuID = positiveInt(productSkuID)
  const normalizedWarehouseID = positiveInt(warehouseID)
  const normalizedUnitID = positiveInt(unitID)
  const orderID = positiveInt(salesOrderID)
  const lineID = positiveInt(sourceItemID)
  if (!normalizedProductID || !normalizedWarehouseID || !normalizedUnitID) return []

  const availableByLot = new Map()
  for (const balance of balances) {
    const lotID = positiveInt(balance.lot_id)
    if (!lotID || balance.subject_type !== 'PRODUCT' ||
      positiveInt(balance.subject_id) !== normalizedProductID ||
      positiveInt(balance.product_sku_id) !== normalizedSkuID ||
      positiveInt(balance.warehouse_id) !== normalizedWarehouseID ||
      positiveInt(balance.unit_id) !== normalizedUnitID ||
      balance.lot_status !== InventoryLotStatus.ACTIVE) continue

    let available = numeric20Scale6Units(balance.ready_to_ship_quantity)
    if (available === null) continue
    const owned = orderID && lineID ? reservations
      .filter((row) => row.status === StockReservationStatus.ACTIVE &&
        positiveInt(row.sales_order_id) === orderID && positiveInt(row.sales_order_item_id) === lineID &&
        positiveInt(row.product_id) === normalizedProductID && positiveInt(row.product_sku_id) === normalizedSkuID &&
        positiveInt(row.warehouse_id) === normalizedWarehouseID && positiveInt(row.unit_id) === normalizedUnitID &&
        positiveInt(row.lot_id) === lotID)
      .reduce((sum, row) => sum + BigInt(numeric20Scale6Units(row.quantity) || '0'), 0n) : 0n
    if (owned > 0n) {
      // The global ready quantity already excludes all reservations. Restore only
      // the source line's own share, before applying the inspection/packing hold.
      const inputs = [balance.quantity, balance.active_reserved_quantity,
        balance.pending_inspection_quantity, balance.pending_packaging_quantity].map(numeric20Scale6Units)
      if (inputs.some((entry) => entry === null)) continue
      const [quantity, reserved, inspection, packaging] = inputs.map(BigInt)
      if (owned > reserved) continue
      const ready = quantity - reserved + owned - inspection - packaging
      available = ready > 0n ? String(ready) : '0'
    }
    if (isPositiveNumeric20Scale6Units(available)) {
      availableByLot.set(lotID, numeric20Scale6TextFromUnits(available))
    }
  }
  return options.flatMap((option) => {
    const available = availableByLot.get(positiveInt(option.value))
    return available ? [{ ...option, label: `${option.label} · 可发 ${available}`, available }] : []
  })
}

export function isBlankShipmentItem(item = {}) {
  return [
    item.sales_order_item_id,
    item.product_id,
    item.product_sku_id,
    item.warehouse_id,
    item.lot_id,
    item.unit_id,
    item.quantity,
    item.package_description,
    item.case_no,
    item.note,
  ].every((value) => value === undefined || value === null || value === '')
}

export function createBlankShipmentItem() {
  return {
    sales_order_item_id: undefined,
    product_id: undefined,
    product_sku_id: undefined,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: undefined,
    quantity: '',
    package_description: '',
    case_no: '',
    note: '',
  }
}
