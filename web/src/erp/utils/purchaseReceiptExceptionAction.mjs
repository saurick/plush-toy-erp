import { normalizePositiveNumeric20Scale6 } from './numeric20Scale6.mjs'

export const PURCHASE_RECEIPT_ADJUSTMENT_OPTIONS = Object.freeze([
  { value: 'QUANTITY_INCREASE', label: '数量增加' },
  { value: 'QUANTITY_DECREASE', label: '数量减少' },
  { value: 'LOT_CORRECTION', label: '批次更正' },
  { value: 'WAREHOUSE_CORRECTION', label: '仓库更正' },
])

const ADJUSTMENT_TYPES = new Set(
  PURCHASE_RECEIPT_ADJUSTMENT_OPTIONS.map((item) => item.value)
)

function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}

function quantityText(value) {
  return normalizePositiveNumeric20Scale6(value)
}

function optionalNote(value) {
  const text = String(value || '').trim()
  return text ? { note: text } : {}
}

function occurredAt(value) {
  const text = String(value || '').trim()
  return text ? new Date(text).toISOString() : undefined
}

function receiptItem(receipt, itemID) {
  return (Array.isArray(receipt?.items) ? receipt.items : []).find(
    (item) => positiveID(item?.id) === positiveID(itemID)
  )
}

export function buildPurchaseReturnFromReceiptPayload(values = {}, receipt = {}) {
  const receiptID = positiveID(receipt?.id)
  const items = (Array.isArray(values.items) ? values.items : []).map((line) => {
    const source = receiptItem(receipt, line?.purchase_receipt_item_id)
    const quantity = quantityText(line?.quantity)
    if (!source || !quantity) {
      throw new Error('请完整填写退货明细')
    }
    return {
      purchase_receipt_item_id: positiveID(source.id),
      quantity,
      ...optionalNote(line?.note),
    }
  })
  if (receiptID <= 0 || items.length === 0) {
    throw new Error('请选择已过账的采购入库单')
  }
  const returnedAt = occurredAt(values.returned_at)
  return {
    purchase_receipt_id: receiptID,
    ...(returnedAt ? { returned_at: returnedAt } : {}),
    ...optionalNote(values.note),
    items,
  }
}

export function buildPurchaseReceiptAdjustmentPayload(
  values = {},
  receipt = {}
) {
  const receiptID = positiveID(receipt?.id)
  const items = (Array.isArray(values.items) ? values.items : []).flatMap((line, index) => {
    const source = receiptItem(receipt, line?.purchase_receipt_item_id)
    const adjustType = String(line?.adjust_type || '')
      .trim()
      .toUpperCase()
    const quantity = quantityText(line?.quantity)
    if (!source || !ADJUSTMENT_TYPES.has(adjustType) || !quantity) {
      throw new Error('请完整填写入库调整明细')
    }
    const targetWarehouseID = positiveID(line?.warehouse_id)
    const targetLotID = positiveID(line?.lot_id)
    const base = {
      purchase_receipt_item_id: positiveID(source.id),
      quantity,
      ...optionalNote(line?.note),
    }
    if (['QUANTITY_INCREASE', 'QUANTITY_DECREASE'].includes(adjustType)) {
      return [{ ...base, adjust_type: adjustType }]
    }
    const correctionGroup = `${adjustType}-${index + 1}`
    if (adjustType === 'LOT_CORRECTION') {
      if (!targetLotID) {
        throw new Error('批次更正必须选择目标批次')
      }
      return [
        {
          ...base,
          adjust_type: 'LOT_CORRECTION_OUT',
          correction_group: correctionGroup,
        },
        {
          ...base,
          adjust_type: 'LOT_CORRECTION_IN',
          lot_id: targetLotID,
          correction_group: correctionGroup,
        },
      ]
    }
    if (adjustType === 'WAREHOUSE_CORRECTION') {
      if (!targetWarehouseID) {
        throw new Error('仓库更正必须选择目标仓库')
      }
      return [
        {
          ...base,
          adjust_type: 'WAREHOUSE_CORRECTION_OUT',
          correction_group: correctionGroup,
        },
        {
          ...base,
          adjust_type: 'WAREHOUSE_CORRECTION_IN',
          warehouse_id: targetWarehouseID,
          correction_group: correctionGroup,
        },
      ]
    }
    throw new Error('请完整填写入库调整明细')
  })
  const reason = String(values.reason || '').trim()
  if (receiptID <= 0 || !reason || items.length === 0) {
    throw new Error('请填写调整原因和调整明细')
  }
  const adjustedAt = occurredAt(values.adjusted_at)
  return {
    purchase_receipt_id: receiptID,
    reason,
    ...(adjustedAt ? { adjusted_at: adjustedAt } : {}),
    ...optionalNote(values.note),
    items,
  }
}
