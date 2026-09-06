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

function compactParams(values = {}) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => value !== undefined)
  )
}

export {
  trimOptional,
  normalizeOptionalDecimalString,
  normalizeOptionalNonNegativeInteger,
  compactParams,
}
