import {
  deepFreezeMutationValue,
  isMutationResultUnknown,
  secureMutationUUID,
  stableMutationSignature,
} from './mutationAttempt.mjs'

const MAX_IDEMPOTENCY_KEY_LENGTH = 128

function payloadWithoutIdempotencyKey(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('填写内容有误，请刷新页面后重新填写')
  }
  const normalized = { ...payload }
  delete normalized.idempotency_key
  return normalized
}

export function requireSourceBusinessActionKey(value) {
  if (typeof value !== 'string') {
    throw new Error('填写内容有误，请刷新页面后重新填写')
  }
  const key = value.trim()
  if (!key || [...key].length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new Error('填写内容有误，请刷新页面后重新填写')
  }
  return key
}

export function sourceBusinessActionUUID(cryptoProvider = globalThis.crypto) {
  return secureMutationUUID(cryptoProvider)
}

export function sourceBusinessActionSignature(payload) {
  return stableMutationSignature(payloadWithoutIdempotencyKey(payload))
}

export function sourceBusinessActionNo(prefix, sourceNo, idempotencyKey) {
  const normalizedPrefix = String(prefix || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const normalizedSource = String(sourceNo || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const normalizedKey = requireSourceBusinessActionKey(idempotencyKey)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '')
  if (!normalizedPrefix || !normalizedSource || !normalizedKey) {
    throw new Error('填写内容有误，请刷新页面后重新填写')
  }
  const suffix = normalizedKey.slice(-10)
  const sourceBudget = Math.max(
    1,
    64 - normalizedPrefix.length - suffix.length - 2
  )
  return `${normalizedPrefix}-${normalizedSource.slice(0, sourceBudget)}-${suffix}`
}

export function requireSourceActionRecord(record, expectedID) {
  if (!Number.isSafeInteger(expectedID) || expectedID <= 0 || record?.id !== expectedID) {
    throw Object.assign(new Error('操作结果暂未核对，请刷新单据后确认'), { isInvalidResponse: true })
  }
  return record
}

export { isMutationResultUnknown as isSourceBusinessActionResultUnknown }

export function createSourceBusinessActionAttemptStore({
  cryptoProvider,
} = {}) {
  const attempts = new Map()
  return {
    prepare(scope, payload) {
      const signature = sourceBusinessActionSignature(payload)
      const current = attempts.get(scope)
      if (current?.signature === signature) {
        return current
      }
      const idempotencyKey = requireSourceBusinessActionKey(
        sourceBusinessActionUUID(cryptoProvider || globalThis.crypto)
      )
      const attempt = deepFreezeMutationValue({
        signature,
        params: {
          ...JSON.parse(signature),
          idempotency_key: idempotencyKey,
        },
      })
      attempts.set(scope, attempt)
      return attempt
    },
    settle(scope, attempt, error) {
      const retain = Boolean(error && isMutationResultUnknown(error))
      if (!retain && attempts.get(scope) === attempt) {
        attempts.delete(scope)
      }
      return retain
    },
    peek(scope) {
      return attempts.get(scope) || null
    },
    clear(scope) {
      attempts.delete(scope)
    },
  }
}
