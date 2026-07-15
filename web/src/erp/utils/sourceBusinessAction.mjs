const MAX_IDEMPOTENCY_KEY_LENGTH = 128

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => stableValue(item))
  }
  if (!value || typeof value !== 'object') {
    return value
  }
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => [key, stableValue(value[key])])
  )
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

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
  if (typeof cryptoProvider?.randomUUID === 'function') {
    return cryptoProvider.randomUUID()
  }
  if (typeof cryptoProvider?.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    cryptoProvider.getRandomValues(bytes)
    bytes[6] = (bytes[6] % 16) + 64
    bytes[8] = (bytes[8] % 64) + 128
    const hex = [...bytes].map((item) => item.toString(16).padStart(2, '0'))
    return [
      hex.slice(0, 4).join(''),
      hex.slice(4, 6).join(''),
      hex.slice(6, 8).join(''),
      hex.slice(8, 10).join(''),
      hex.slice(10).join(''),
    ].join('-')
  }
  throw new Error('当前浏览器暂时无法安全提交，请刷新或升级浏览器后重试')
}

export function sourceBusinessActionSignature(payload) {
  return JSON.stringify(stableValue(payloadWithoutIdempotencyKey(payload)))
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

export function isSourceBusinessActionResultUnknown(error) {
  const httpStatus = Number(error?.httpStatus || 0)
  return Boolean(
    error?.isNetworkError ||
      error?.isAbortError ||
      error?.isInvalidResponse ||
      httpStatus === 408 ||
      httpStatus >= 500 ||
      Number(error?.code || 0) >= 50000
  )
}

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
      const attempt = deepFreeze({
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
      const retain = Boolean(
        error && isSourceBusinessActionResultUnknown(error)
      )
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
