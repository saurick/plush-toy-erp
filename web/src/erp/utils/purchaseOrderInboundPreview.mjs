import {
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
} from './numeric20Scale6.mjs'

const QUANTITY_FIELDS = Object.freeze([
  'purchased_quantity',
  'effective_received_quantity',
  'draft_reserved_quantity',
  'remaining_receivable_quantity',
  'remaining_generatable_quantity',
])

function invalidPurchaseOrderReceiptProgressResponse() {
  const error = new Error(
    '服务器返回的采购入库进度不完整，请刷新采购订单后重试'
  )
  error.isInvalidResponse = true
  return error
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function requiredText(value) {
  return typeof value === 'string' && value.trim() !== ''
}

function canonicalQuantity(value) {
  if (typeof value !== 'string') return null
  const units = numeric20Scale6Units(value)
  if (units === null) return null
  const canonical = numeric20Scale6TextFromUnits(units)
  return value === canonical ? { text: canonical, units } : null
}

export function validatePurchaseOrderReceiptProgress(
  progress,
  expectedPurchaseOrderID = 0
) {
  if (
    !progress ||
    typeof progress !== 'object' ||
    Array.isArray(progress) ||
    !positiveSafeInteger(progress.purchase_order_id) ||
    (positiveSafeInteger(expectedPurchaseOrderID) &&
      progress.purchase_order_id !== expectedPurchaseOrderID) ||
    !requiredText(progress.purchase_order_no) ||
    !requiredText(progress.lifecycle_status) ||
    !Array.isArray(progress.items)
  ) {
    throw invalidPurchaseOrderReceiptProgressResponse()
  }

  const seenItemIDs = new Set()
  const seenLineNumbers = new Set()
  const items = progress.items.map((item) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      !positiveSafeInteger(item.purchase_order_item_id) ||
      !positiveSafeInteger(item.line_no) ||
      !positiveSafeInteger(item.material_id) ||
      !requiredText(item.material_code) ||
      !requiredText(item.material_name) ||
      !positiveSafeInteger(item.unit_id) ||
      !requiredText(item.unit_code) ||
      !requiredText(item.unit_name) ||
      !requiredText(item.line_status) ||
      typeof item.can_generate !== 'boolean' ||
      typeof item.disabled_reason !== 'string' ||
      seenItemIDs.has(item.purchase_order_item_id) ||
      seenLineNumbers.has(item.line_no)
    ) {
      throw invalidPurchaseOrderReceiptProgressResponse()
    }
    seenItemIDs.add(item.purchase_order_item_id)
    seenLineNumbers.add(item.line_no)

    const quantities = {}
    for (const field of QUANTITY_FIELDS) {
      const canonical = canonicalQuantity(item[field])
      if (canonical === null) {
        throw invalidPurchaseOrderReceiptProgressResponse()
      }
      quantities[field] = canonical
    }
    if (
      (item.can_generate &&
        (item.disabled_reason !== '' ||
          quantities.remaining_generatable_quantity.units === '0')) ||
      (!item.can_generate && item.disabled_reason.trim() === '')
    ) {
      throw invalidPurchaseOrderReceiptProgressResponse()
    }
    return {
      ...item,
      ...Object.fromEntries(
        QUANTITY_FIELDS.map((field) => [field, quantities[field].text])
      ),
    }
  })

  return {
    ...progress,
    items,
  }
}

function materialLabel(item) {
  if (item.material_name && item.material_code) {
    return `${item.material_name}（${item.material_code}）`
  }
  return item.material_name || item.material_code || '材料已关联'
}

export function buildPurchaseInboundDraftPreviewRows(progress) {
  const validated = validatePurchaseOrderReceiptProgress(progress)
  return validated.items.map((item) => ({
    key: item.purchase_order_item_id,
    lineNo: item.line_no,
    material: materialLabel(item),
    unit: item.unit_name || item.unit_code,
    purchasedQuantity: item.purchased_quantity,
    effectiveReceivedQuantity: item.effective_received_quantity,
    draftReservedQuantity: item.draft_reserved_quantity,
    remainingReceivableQuantity: item.remaining_receivable_quantity,
    remainingGeneratableQuantity: item.remaining_generatable_quantity,
    canGenerate: item.can_generate,
    disabledReason: item.disabled_reason,
  }))
}
