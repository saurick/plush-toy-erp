import {
  addNumeric20Scale6Units,
  compareNumeric20Scale6Units,
  isPositiveNumeric20Scale6Units,
  minNumeric20Scale6Units,
  normalizePositiveNumeric20Scale6,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  subtractNumeric20Scale6Units,
} from './numeric20Scale6.mjs'

function quantityUnits(value) {
  return numeric20Scale6Units(value) ?? '0'
}

function positiveUnitsText(value) {
  return isPositiveNumeric20Scale6Units(value)
    ? numeric20Scale6TextFromUnits(value)
    : ''
}

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

export function buildSalesOrderReservationItemChoices(
  items = [],
  reservations = [],
  shipments = []
) {
  const activeReservedByLine = new Map()
  for (const reservation of Array.isArray(reservations) ? reservations : []) {
    if (reservation?.status !== 'ACTIVE') continue
    const lineID = positiveID(reservation?.sales_order_item_id)
    if (!lineID) continue
    activeReservedByLine.set(
      lineID,
      addNumeric20Scale6Units(
        activeReservedByLine.get(lineID) || '0',
        quantityUnits(reservation.quantity)
      )
    )
  }
  const shippedByLine = new Map()
  for (const shipment of Array.isArray(shipments) ? shipments : []) {
    if (String(shipment?.status || '').toUpperCase() !== 'SHIPPED') continue
    for (const line of Array.isArray(shipment?.items) ? shipment.items : []) {
      const lineID = positiveID(line?.sales_order_item_id)
      if (!lineID) continue
      shippedByLine.set(
        lineID,
        addNumeric20Scale6Units(
          shippedByLine.get(lineID) || '0',
          quantityUnits(line.quantity)
        )
      )
    }
  }
  return (Array.isArray(items) ? items : []).map((item, index) => {
    const itemID = positiveID(item?.id)
    const ordered = quantityUnits(item?.ordered_quantity)
    const activeReserved = activeReservedByLine.get(itemID) || '0'
    const shipped = shippedByLine.get(itemID) || '0'
    const committed = addNumeric20Scale6Units(activeReserved, shipped)
    const reservable = subtractNumeric20Scale6Units(ordered, committed)
    const productText =
      [item?.product_code_snapshot, item?.product_name_snapshot]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
        .join(' / ') || `销售明细 ${index + 1}`
    const skuText = String(item?.color_snapshot || '').trim()
    const unitText = String(item?.unit_name_snapshot || '').trim()
    return {
      value: itemID,
      label: `${productText}${skuText ? ` / ${skuText}` : ''} · 订单 ${positiveUnitsText(ordered)}${unitText ? ` ${unitText}` : ''}`,
      item,
      ordered: positiveUnitsText(ordered),
      activeReserved: positiveUnitsText(activeReserved),
      shipped: positiveUnitsText(shipped),
      reservable: positiveUnitsText(reservable),
      disabled:
        itemID <= 0 ||
        String(item?.line_status || '').toLowerCase() !== 'open' ||
        !isPositiveNumeric20Scale6Units(ordered) ||
        !isPositiveNumeric20Scale6Units(reservable),
    }
  })
}

export function defaultSalesOrderReservationQuantity(
  itemChoice = {},
  balanceChoice = {}
) {
  return positiveUnitsText(
    minNumeric20Scale6Units(
      quantityUnits(itemChoice?.reservable),
      quantityUnits(balanceChoice?.available)
    )
  )
}

export function buildReservationBalanceChoices(
  balances = [],
  { productID, productSkuID } = {}
) {
  const normalizedProductID = positiveID(productID)
  const normalizedSkuID = positiveID(productSkuID)
  return (Array.isArray(balances) ? balances : [])
    .filter((balance) => {
      if (positiveID(balance?.subject_id) !== normalizedProductID) return false
      const balanceSkuID = positiveID(balance?.product_sku_id)
      return normalizedSkuID > 0
        ? balanceSkuID === normalizedSkuID
        : balanceSkuID === 0
    })
    .map((balance) => {
      const available = quantityUnits(balance?.available_quantity)
      const warehouseText =
        String(balance?.warehouse_name || '').trim() || '仓库已关联'
      const lotText =
        String(balance?.lot_no || '').trim() ||
        (positiveID(balance?.lot_id) ? '批次已关联' : '无批次')
      return {
        value: positiveID(balance?.id),
        label: `${warehouseText} / ${lotText} · 可用 ${positiveUnitsText(available) || '0'}`,
        balance,
        available: positiveUnitsText(available),
        disabled:
          positiveID(balance?.id) <= 0 ||
          !isPositiveNumeric20Scale6Units(available),
      }
    })
}

export function buildSalesOrderReservationPayload(
  values = {},
  order = {},
  items = [],
  balances = [],
  reservations = [],
  shipments = []
) {
  if (String(order?.lifecycle_status || '').toLowerCase() !== 'active') {
    throw new Error('仅生效中的销售订单可以预留库存')
  }
  const orderID = positiveID(order?.id)
  const itemID = positiveID(values.sales_order_item_id)
  const balanceID = positiveID(values.balance_id)
  const quantity = normalizePositiveNumeric20Scale6(values.quantity)
  const item = (Array.isArray(items) ? items : []).find(
    (candidate) => positiveID(candidate?.id) === itemID
  )
  const balance = (Array.isArray(balances) ? balances : []).find(
    (candidate) => positiveID(candidate?.id) === balanceID
  )
  const itemChoice = buildSalesOrderReservationItemChoices(
    items,
    reservations,
    shipments
  ).find((candidate) => candidate.value === itemID)
  if (
    orderID <= 0 ||
    !item ||
    !itemChoice ||
    !balance ||
    !quantity ||
    String(item?.line_status || '').toLowerCase() !== 'open' ||
    positiveID(item.sales_order_id) !== orderID ||
    positiveID(balance.warehouse_id) <= 0 ||
    positiveID(balance.subject_id) !== positiveID(item.product_id) ||
    positiveID(balance.product_sku_id) !== positiveID(item.product_sku_id) ||
    positiveID(balance.unit_id) !== positiveID(item.unit_id)
  ) {
    throw new Error('请选择与销售明细一致的可用库存')
  }
  const quantityValue = quantityUnits(quantity)
  const available = quantityUnits(balance.available_quantity)
  if (compareNumeric20Scale6Units(quantityValue, available) > 0) {
    throw new Error('预留数量不能超过当前可用库存')
  }
  if (
    compareNumeric20Scale6Units(
      quantityValue,
      quantityUnits(itemChoice.reservable)
    ) > 0
  ) {
    throw new Error('预留数量不能超过订单剩余可预留数量')
  }
  const reservedAtText = String(values.reserved_at || '').trim()
  return {
    sales_order_id: orderID,
    sales_order_item_id: itemID,
    warehouse_id: positiveID(balance.warehouse_id),
    ...(positiveID(balance.lot_id)
      ? { lot_id: positiveID(balance.lot_id) }
      : {}),
    quantity,
    ...(reservedAtText
      ? { reserved_at: new Date(reservedAtText).toISOString() }
      : {}),
    ...(String(values.note || '').trim()
      ? { note: String(values.note).trim() }
      : {}),
  }
}
