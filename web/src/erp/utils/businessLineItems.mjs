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

export function quantityBySourceItemID({
  records = [],
  itemKey = 'sales_order_item_id',
  cancelledStatuses = ['CANCELLED', 'canceled'],
} = {}) {
  const cancelledStatusSet = new Set(
    cancelledStatuses.map((status) => String(status || '').trim())
  )
  const quantityByID = new Map()
  ;(Array.isArray(records) ? records : []).forEach((record) => {
    if (cancelledStatusSet.has(String(record?.status || '').trim())) {
      return
    }
    const recordItems = Array.isArray(record?.items) ? record.items : []
    recordItems.forEach((item) => {
      const sourceItemID = positiveInt(item?.[itemKey])
      if (!sourceItemID) return
      quantityByID.set(
        sourceItemID,
        (quantityByID.get(sourceItemID) || 0) + decimalNumber(item?.quantity)
      )
    })
  })
  return quantityByID
}

export function buildShipmentSourceRows({
  salesOrderItems = [],
  shipments = [],
} = {}) {
  const shippedBySalesOrderItemID = quantityBySourceItemID({
    records: shipments,
    itemKey: 'sales_order_item_id',
    cancelledStatuses: ['CANCELLED'],
  })
  return (Array.isArray(salesOrderItems) ? salesOrderItems : []).map((item) => {
    const orderedQuantity = decimalNumber(item?.ordered_quantity)
    const shippedQuantity = shippedBySalesOrderItemID.get(Number(item?.id)) || 0
    const remainingQuantity = Math.max(0, orderedQuantity - shippedQuantity)
    const lineStatus = String(item?.line_status || 'open')
    const disabledReason =
      lineStatus !== 'open'
        ? '来源行已关闭'
        : remainingQuantity <= 0
          ? '已全部生成出货'
          : ''
    return {
      ...item,
      orderedQuantity,
      shippedQuantity,
      remainingQuantity,
      disabledReason,
    }
  })
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

export function createShipmentItemFromSalesOrderItem(
  item,
  shipmentID,
  { quantity } = {}
) {
  const sourceItem = item || {}
  const nextQuantity =
    quantity === undefined || quantity === null || quantity === ''
      ? sourceItem.remainingQuantity || sourceItem.ordered_quantity || ''
      : quantity
  return {
    shipment_id: shipmentID,
    sales_order_item_id: sourceItem.id,
    product_id: sourceItem.product_id,
    product_sku_id: sourceItem.product_sku_id,
    warehouse_id: undefined,
    lot_id: undefined,
    unit_id: sourceItem.unit_id,
    quantity: nextQuantity,
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
  if (!sourceItem) {
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
  const { shipment_id: _shipmentID, ...patch } =
    createShipmentItemFromSalesOrderItem(sourceItem, undefined, {
      quantity:
        sourceItem.remainingQuantity === undefined
          ? sourceItem.ordered_quantity
          : sourceItem.remainingQuantity,
    })
  return patch
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
  inventoryLots,
  { productID, productSkuID } = {}
) {
  const normalizedProductID = positiveInt(productID)
  const normalizedSkuID = positiveInt(productSkuID)
  if (!normalizedProductID) return []
  const allowedIDs = new Set(
    (Array.isArray(inventoryLots) ? inventoryLots : [])
      .filter(
        (lot) =>
          String(lot?.subject_type || '')
            .trim()
            .toUpperCase() === 'PRODUCT' &&
          positiveInt(lot?.subject_id) === normalizedProductID &&
          positiveInt(lot?.product_sku_id) === normalizedSkuID &&
          String(lot?.status || '')
            .trim()
            .toUpperCase() === 'ACTIVE'
      )
      .map((lot) => positiveInt(lot?.id || lot?.lot_id))
      .filter(Boolean)
  )
  return (Array.isArray(options) ? options : []).filter((option) =>
    allowedIDs.has(positiveInt(option?.value))
  )
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
