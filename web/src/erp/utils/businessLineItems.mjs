import { compactParams, trimOptional } from './masterDataOrderView.mjs'

export function positiveInt(value) {
  const numberValue = Number(value || 0)
  return Number.isFinite(numberValue) && numberValue > 0
    ? Math.trunc(numberValue)
    : undefined
}

export function requiredInt(value) {
  return positiveInt(value) || 0
}

export function decimalNumber(value) {
  const numeric = Number(
    String(value ?? '')
      .replace(/,/g, '')
      .trim()
  )
  return Number.isFinite(numeric) ? numeric : 0
}

export function formatQuantity(value) {
  const numeric = Number(value || 0)
  if (!Number.isFinite(numeric) || numeric === 0) return '0'
  return String(Number(numeric.toFixed(4)))
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

export function buildShipmentItemParams(values = {}) {
  return compactParams({
    shipment_id: requiredInt(values.shipment_id),
    sales_order_item_id: positiveInt(values.sales_order_item_id),
    product_id: requiredInt(values.product_id),
    product_sku_id: positiveInt(values.product_sku_id),
    warehouse_id: requiredInt(values.warehouse_id),
    unit_id: requiredInt(values.unit_id),
    lot_id: positiveInt(values.lot_id),
    quantity: trimOptional(values.quantity),
    note: trimOptional(values.note),
  })
}

export function createShipmentItemFromSalesOrderItem(item, shipmentID) {
  const sourceItem = item || {}
  return {
    shipment_id: shipmentID,
    sales_order_item_id: sourceItem.id,
    product_id: sourceItem.product_id,
    product_sku_id: sourceItem.product_sku_id,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: sourceItem.unit_id,
    quantity: sourceItem.ordered_quantity || '',
    note: sourceItem.product_name_snapshot
      ? `来源销售订单行：${sourceItem.product_name_snapshot}`
      : '',
  }
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
    item.note,
  ].every((value) => value === undefined || value === null || value === '')
}

export function createBlankShipmentItem(shipmentID) {
  return {
    shipment_id: shipmentID,
    sales_order_item_id: undefined,
    product_id: undefined,
    product_sku_id: undefined,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: undefined,
    quantity: '',
    note: '',
  }
}
