import { normalizeShipmentQuantity } from './shipmentWeight.mjs'

const FINISHED_GOODS_SOURCE_TYPE = 'SHIPMENT'
const FINISHED_GOODS_INSPECTION_TYPE = 'FINISHED_GOODS'
const FINISHED_GOODS_SUBJECT_TYPE = 'PRODUCT'

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function optionalPositiveID(value) {
  return positiveID(value) || null
}

function normalizedStatus(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}

function trimmedText(value) {
  return String(value ?? '').trim()
}

function requiredText(value, message, maxLength) {
  const text = trimmedText(value)
  if (!text) throw new Error(message)
  if ([...text].length > maxLength) {
    throw new Error(
      `${message.replace(/^请填写/u, '')}不能超过 ${maxLength} 个字符`
    )
  }
  return text
}

function optionalText(value, maxLength, message) {
  const text = trimmedText(value)
  if (!text) return ''
  if ([...text].length > maxLength) throw new Error(message)
  return text
}

function quantityParts(value) {
  const [whole = '0', fraction = ''] = String(value || '0').split('.')
  return { whole, fraction }
}

function addQuantities(left, right) {
  const leftParts = quantityParts(left)
  const rightParts = quantityParts(right)
  const scale = Math.max(leftParts.fraction.length, rightParts.fraction.length)
  const leftMinor = BigInt(
    `${leftParts.whole}${leftParts.fraction.padEnd(scale, '0')}`
  )
  const rightMinor = BigInt(
    `${rightParts.whole}${rightParts.fraction.padEnd(scale, '0')}`
  )
  const total = (leftMinor + rightMinor).toString().padStart(scale + 1, '0')
  if (scale === 0) return total
  const whole = total.slice(0, -scale) || '0'
  const fraction = total.slice(-scale).replace(/0+$/u, '')
  return fraction ? `${whole}.${fraction}` : whole
}

function sourceGrainKey({
  shipmentID,
  productID,
  productSkuID,
  warehouseID,
  lotID,
}) {
  if (!shipmentID || !productID || !warehouseID || !lotID) return ''
  return [
    'shipment-quality',
    shipmentID,
    productID,
    productSkuID || 'unskued',
    warehouseID,
    lotID,
  ].join(':')
}

function lotByID(inventoryLots, lotID) {
  return (
    (Array.isArray(inventoryLots) ? inventoryLots : []).find(
      (lot) => positiveID(lot?.id || lot?.lot_id) === lotID
    ) || null
  )
}

function existingInspectionForSource(qualityInspections, source) {
  return (
    (Array.isArray(qualityInspections) ? qualityInspections : []).find(
      (inspection) =>
        positiveID(inspection?.id) &&
        normalizedStatus(inspection?.status) !== 'CANCELLED' &&
        normalizedStatus(inspection?.source_type) ===
          FINISHED_GOODS_SOURCE_TYPE &&
        positiveID(inspection?.source_id) === source.shipmentID &&
        normalizedStatus(inspection?.inspection_type) ===
          FINISHED_GOODS_INSPECTION_TYPE &&
        normalizedStatus(inspection?.subject_type) ===
          FINISHED_GOODS_SUBJECT_TYPE &&
        positiveID(inspection?.subject_id) === source.productID &&
        positiveID(inspection?.warehouse_id) === source.warehouseID &&
        positiveID(inspection?.inventory_lot_id) === source.lotID
    ) || null
  )
}

function shipmentUnavailableReason(shipment) {
  if (!positiveID(shipment?.id)) {
    return '出货单尚未保存，不能发起成品检验'
  }
  if (normalizedStatus(shipment?.status) !== 'DRAFT') {
    return '只有待出货草稿可以发起成品检验'
  }
  return ''
}

function sourceUnavailableReason(
  shipment,
  source,
  inventoryLot,
  existingInspection
) {
  const shipmentReason = shipmentUnavailableReason(shipment)
  if (shipmentReason) return shipmentReason
  if (!source.productID) return '出货明细缺少产品，请先核对出货单'
  if (source.invalidProductSku) {
    return '出货明细的产品规格信息不完整，请先核对出货单'
  }
  if (!source.warehouseID) return '出货明细缺少仓库，请先核对出货单'
  if (!source.lotID) return '出货明细缺少成品批次，请先核对出货单'
  if (source.invalidQuantity) return '出货数量必须大于 0，请先核对出货单'
  if (source.unitIDs.size > 1) {
    return '同一送检批次的出货单位不一致，请先核对出货明细'
  }
  if (!inventoryLot) return '批次资料尚未加载，请刷新后重试'
  if (normalizedStatus(inventoryLot.subject_type) !== 'PRODUCT') {
    return '所选批次不是成品批次，请先核对出货明细'
  }
  if (positiveID(inventoryLot.subject_id) !== source.productID) {
    return '所选批次与出货产品不一致，请先核对出货明细'
  }
  if (optionalPositiveID(inventoryLot.product_sku_id) !== source.productSkuID) {
    return '所选批次与产品规格不一致，请先核对出货明细'
  }
  if (existingInspection) return '该送检批次已有未取消的成品检验'
  if (normalizedStatus(inventoryLot.status) === 'DISABLED') {
    return '该成品批次已停用，不能发起检验'
  }
  if (normalizedStatus(inventoryLot.status) === 'REJECTED') {
    return '该成品批次已判定不合格，不能再次发起出货前检验'
  }
  return ''
}

export function buildShipmentQualityInspectionSources({
  shipment = {},
  inventoryLots = [],
  qualityInspections = [],
} = {}) {
  const shipmentID = positiveID(shipment?.id)
  const items = Array.isArray(shipment?.items) ? shipment.items : []
  const grouped = new Map()

  items.forEach((item, index) => {
    const productID = positiveID(item?.product_id)
    const rawProductSkuID = trimmedText(item?.product_sku_id)
    const productSkuID = optionalPositiveID(item?.product_sku_id)
    const invalidProductSku = Boolean(
      rawProductSkuID && rawProductSkuID !== '0' && !productSkuID
    )
    const warehouseID = positiveID(item?.warehouse_id)
    const lotID = positiveID(item?.lot_id)
    const unitID = positiveID(item?.unit_id)
    const quantity = normalizeShipmentQuantity(item?.quantity)
    const grainKey = sourceGrainKey({
      shipmentID,
      productID,
      productSkuID,
      warehouseID,
      lotID,
    })
    const sourceKey = grainKey || `shipment-quality-unavailable:${index + 1}`
    const current = grouped.get(sourceKey) || {
      sourceKey,
      shipmentID,
      productID,
      productSkuID,
      warehouseID,
      lotID,
      unitIDs: new Set(),
      quantity: '0',
      lineCount: 0,
      invalidProductSku: false,
      invalidQuantity: false,
    }

    current.lineCount += 1
    if (unitID) current.unitIDs.add(unitID)
    current.invalidProductSku ||= invalidProductSku
    if (quantity) {
      current.quantity = addQuantities(current.quantity, quantity)
    } else {
      current.invalidQuantity = true
    }
    grouped.set(sourceKey, current)
  })

  return [...grouped.values()].map((source) => {
    const inventoryLot = source.lotID
      ? lotByID(inventoryLots, source.lotID)
      : null
    const existingInspection = existingInspectionForSource(
      qualityInspections,
      source
    )
    const unavailableReason = sourceUnavailableReason(
      shipment,
      source,
      inventoryLot,
      existingInspection
    )
    return Object.freeze({
      sourceKey: source.sourceKey,
      shipmentID: source.shipmentID,
      productID: source.productID,
      productSkuID: source.productSkuID,
      warehouseID: source.warehouseID,
      lotID: source.lotID,
      unitID: source.unitIDs.size === 1 ? [...source.unitIDs][0] : null,
      quantity: source.invalidQuantity ? '' : source.quantity,
      lineCount: source.lineCount,
      existingInspection,
      unavailableReason,
    })
  })
}

export function buildShipmentQualityInspectionPayload(
  values = {},
  shipment = {},
  source = {},
  customerKey = ''
) {
  const shipmentID = positiveID(shipment?.id)
  const productID = positiveID(source?.productID)
  const warehouseID = positiveID(source?.warehouseID)
  const lotID = positiveID(source?.lotID)
  const productSkuID = optionalPositiveID(source?.productSkuID)
  const expectedSourceKey = sourceGrainKey({
    shipmentID,
    productID,
    productSkuID,
    warehouseID,
    lotID,
  })
  const sourceQuantity = normalizeShipmentQuantity(source?.quantity)

  if (shipmentUnavailableReason(shipment)) {
    throw new Error(shipmentUnavailableReason(shipment))
  }
  if (
    source?.unavailableReason ||
    positiveID(source?.shipmentID) !== shipmentID ||
    !expectedSourceKey ||
    source?.sourceKey !== expectedSourceKey ||
    !sourceQuantity
  ) {
    throw new Error(source?.unavailableReason || '请选择可送检的成品批次')
  }

  const inspectionNo = requiredText(values?.inspection_no, '请填写检验单号', 64)
  const decisionNote = optionalText(
    values?.note,
    255,
    '送检备注不能超过 255 个字符'
  )
  const normalizedCustomerKey = trimmedText(customerKey)

  return {
    ...(normalizedCustomerKey ? { customer_key: normalizedCustomerKey } : {}),
    inspection_no: inspectionNo,
    shipment_id: shipmentID,
    finished_goods_lot_id: lotID,
    product_id: productID,
    warehouse_id: warehouseID,
    ...(decisionNote ? { decision_note: decisionNote } : {}),
  }
}

export function isMatchingShipmentQualityInspectionDraft(
  inspection = {},
  shipment = {},
  source = {},
  expectedInspectionNo = ''
) {
  const inspectionNo = trimmedText(expectedInspectionNo)
  const shipmentID = positiveID(shipment?.id)
  const sourceShipmentID = positiveID(source?.shipmentID)
  const productID = positiveID(source?.productID)
  const warehouseID = positiveID(source?.warehouseID)
  const lotID = positiveID(source?.lotID)
  return Boolean(
    positiveID(inspection?.id) &&
      shipmentID &&
      sourceShipmentID &&
      productID &&
      warehouseID &&
      lotID &&
      normalizedStatus(inspection?.status) === 'DRAFT' &&
      normalizedStatus(inspection?.source_type) ===
        FINISHED_GOODS_SOURCE_TYPE &&
      positiveID(inspection?.source_id) === shipmentID &&
      positiveID(inspection?.source_id) === sourceShipmentID &&
      normalizedStatus(inspection?.inspection_type) ===
        FINISHED_GOODS_INSPECTION_TYPE &&
      normalizedStatus(inspection?.subject_type) ===
        FINISHED_GOODS_SUBJECT_TYPE &&
      positiveID(inspection?.subject_id) === productID &&
      positiveID(inspection?.warehouse_id) === warehouseID &&
      positiveID(inspection?.inventory_lot_id) === lotID &&
      !positiveID(inspection?.purchase_receipt_id) &&
      !positiveID(inspection?.purchase_receipt_item_id) &&
      !positiveID(inspection?.material_id) &&
      (!inspectionNo || trimmedText(inspection?.inspection_no) === inspectionNo)
  )
}

export function requireMatchingShipmentQualityInspectionDraft(
  inspection = {},
  shipment = {},
  source = {},
  expectedInspectionNo = ''
) {
  if (
    !isMatchingShipmentQualityInspectionDraft(
      inspection,
      shipment,
      source,
      expectedInspectionNo
    )
  ) {
    throw new Error('检验草稿与所选出货批次不一致，请刷新后核对')
  }
  return inspection
}
