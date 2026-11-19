const DEFAULT_SECURE_SUBMIT_ERROR =
  '当前浏览器暂时无法安全提交，请刷新或升级浏览器后重试'

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

export function stableMutationSignature(value) {
  return JSON.stringify(stableValue(value))
}

export function deepFreezeMutationValue(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }
  Object.values(value).forEach(deepFreezeMutationValue)
  return Object.freeze(value)
}

export function secureMutationUUID(
  cryptoProvider = globalThis.crypto,
  unavailableMessage = DEFAULT_SECURE_SUBMIT_ERROR
) {
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
  throw new Error(unavailableMessage)
}

export function isMutationResultUnknown(error) {
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
