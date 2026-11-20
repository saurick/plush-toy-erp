function trimOptional(value) {
  const text = String(value ?? '').trim()
  return text || undefined
}

function normalizeOptionalDecimalString(value) {
  const text = String(value ?? '').trim()
  return text || null
}

function normalizeOptionalNonNegativeInteger(value) {
  if (value === undefined || value === null || value === '') {
    return undefined
  }
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) {
    return undefined
  }
  return Math.trunc(numeric)
}

function optionalFormReferenceID(value) {
  if (value == null || (typeof value === 'string' && !value.trim())) return undefined
  const id = typeof value === 'string' && /^\d+$/u.test(value.trim()) ? Number(value) : value
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('所选档案编号无效，请重新选择')
  }
  return id
}

function compactParams(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  )
}

export {
  trimOptional,
  normalizeOptionalDecimalString,
  normalizeOptionalNonNegativeInteger,
  optionalFormReferenceID,
  compactParams,
}

export function positiveID(value) {
  const parsed = Number(value || 0)
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0
}
