import { PurchaseReceiptStatus } from '../../common/consts/statuses.generated.mjs'
import {
  deepFreezeMutationValue,
  isMutationResultUnknown,
  secureMutationUUID,
  stableMutationSignature,
} from './mutationAttempt.mjs'

const MAX_IDEMPOTENCY_KEY_LENGTH = 128

function invalidResponse(message) {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

function positiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

function payloadWithoutIdempotencyKey(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('采购入库内容有误，请刷新页面后重新填写')
  }
  const normalized = { ...payload }
  delete normalized.idempotency_key
  return normalized
}

export function purchaseReceiptMutationUUID(
  cryptoProvider = globalThis.crypto
) {
  return secureMutationUUID(cryptoProvider)
}

export function purchaseReceiptMutationSignature(payload) {
  return stableMutationSignature(payloadWithoutIdempotencyKey(payload))
}

export function requirePurchaseReceiptIdempotencyKey(value) {
  if (typeof value !== 'string') {
    throw new Error('采购入库内容有误，请刷新页面后重新填写')
  }
  const key = value.trim()
  if (!key || [...key].length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error('采购入库内容有误，请刷新页面后重新填写')
  }
  return key
}

export { isMutationResultUnknown as isPurchaseReceiptMutationResultUnknown }

export function createPurchaseReceiptMutationAttemptStore({
  cryptoProvider,
} = {}) {
  const attempts = new Map()
  return {
    prepare(scope, payload) {
      const signature = purchaseReceiptMutationSignature(payload)
      const current = attempts.get(scope)
      if (current?.signature === signature) return current

      const canonicalPayload = JSON.parse(signature)
      const idempotencyKey = purchaseReceiptMutationUUID(
        cryptoProvider || globalThis.crypto
      )
      if (typeof idempotencyKey !== 'string') {
        throw new Error(
          '当前浏览器暂时无法安全提交，请刷新或升级浏览器后重试'
        )
      }
      let normalizedIdempotencyKey
      try {
        normalizedIdempotencyKey =
          requirePurchaseReceiptIdempotencyKey(idempotencyKey)
      } catch {
        throw new Error(
          '当前浏览器暂时无法安全提交，请刷新或升级浏览器后重试'
        )
      }
      const attempt = deepFreezeMutationValue({
        signature,
        params: {
          ...canonicalPayload,
          idempotency_key: normalizedIdempotencyKey,
        },
      })
      attempts.set(scope, attempt)
      return attempt
    },
    settle(scope, attempt, error) {
      const shouldRetain = Boolean(error && isMutationResultUnknown(error))
      if (!shouldRetain && attempts.get(scope) === attempt) {
        attempts.delete(scope)
      }
      return shouldRetain
    },
    peek(scope) {
      return attempts.get(scope) || null
    },
  }
}

export function validatePurchaseReceiptItem(item, expected = {}) {
  const receiptID = Number(expected.receiptID || 0)
  const materialID = Number(expected.materialID || 0)
  const warehouseID = Number(expected.warehouseID || 0)
  const unitID = Number(expected.unitID || 0)
  if (
    !item ||
    typeof item !== 'object' ||
    !positiveSafeInteger(item.id) ||
    !positiveSafeInteger(item.receipt_id) ||
    !positiveSafeInteger(item.material_id) ||
    !positiveSafeInteger(item.warehouse_id) ||
    !positiveSafeInteger(item.unit_id) ||
    !positiveSafeInteger(item.lot_id) ||
    typeof item.quantity !== 'string' ||
    !item.quantity.trim() ||
    (receiptID > 0 && item.receipt_id !== receiptID) ||
    (materialID > 0 && item.material_id !== materialID) ||
    (warehouseID > 0 && item.warehouse_id !== warehouseID) ||
    (unitID > 0 && item.unit_id !== unitID)
  ) {
    throw invalidResponse('服务器返回的入库明细信息不完整，请核对后重试')
  }
  return item
}

export function validatePurchaseReceiptDraft(receipt, expected = {}) {
  const expectedReceiptNo = String(expected.receiptNo || '').trim()
  if (
    !receipt ||
    typeof receipt !== 'object' ||
    !positiveSafeInteger(receipt.id) ||
    typeof receipt.receipt_no !== 'string' ||
    !receipt.receipt_no.trim() ||
    receipt.status !== PurchaseReceiptStatus.DRAFT ||
    !Array.isArray(receipt.items) ||
    receipt.items.length < 1 ||
    (expectedReceiptNo && receipt.receipt_no.trim() !== expectedReceiptNo)
  ) {
    throw invalidResponse('服务器返回的采购入库草稿信息不完整，请核对后重试')
  }
  receipt.items.forEach((item) =>
    validatePurchaseReceiptItem(item, { receiptID: receipt.id })
  )
  return receipt
}
