const SCALE_DIGITS = 6
const MAX_UNITS = '99999999999999999999'
const ZERO_UNITS = '0'

function numericText(value) {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'number' && !Number.isFinite(value)) return ''
  return String(value ?? '')
    .replace(/,/gu, '')
    .trim()
}

export function numeric20Scale6Units(value) {
  const text = numericText(value)
  const match = /^(\d+)(?:\.(\d{1,6}))?$/u.exec(text)
  if (!match) return null

  const integerText = match[1].replace(/^0+(?=\d)/u, '')
  if (integerText.length > 14) return null

  const units = `${integerText}${(match[2] || '').padEnd(SCALE_DIGITS, '0')}`.replace(
    /^0+(?=\d)/u,
    ''
  )
  return compareUnitText(units, MAX_UNITS) <= 0 ? units : null
}

export function numeric20Scale6TextFromUnits(value) {
  const units = normalizedUnitText(value)
  if (units === null) return ''
  const padded = units.padStart(SCALE_DIGITS + 1, '0')
  const integerText =
    padded.slice(0, -SCALE_DIGITS).replace(/^0+(?=\d)/u, '') || '0'
  const fractionText = padded.slice(-SCALE_DIGITS).replace(/0+$/u, '')
  return fractionText ? `${integerText}.${fractionText}` : integerText
}

function normalizedUnitText(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/u.test(text)) return null
  return text.replace(/^0+(?=\d)/u, '')
}

function compareUnitText(left, right) {
  const normalizedLeft = normalizedUnitText(left)
  const normalizedRight = normalizedUnitText(right)
  if (normalizedLeft === null || normalizedRight === null) return null
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length < normalizedRight.length ? -1 : 1
  }
  if (normalizedLeft === normalizedRight) return 0
  return normalizedLeft < normalizedRight ? -1 : 1
}

export function compareNumeric20Scale6Units(left, right) {
  return compareUnitText(left, right)
}

export function compareNumeric20Scale6Values(left, right) {
  return compareUnitText(
    numeric20Scale6Units(left) ?? ZERO_UNITS,
    numeric20Scale6Units(right) ?? ZERO_UNITS
  )
}

export function addNumeric20Scale6Units(left, right) {
  const normalizedLeft = normalizedUnitText(left)
  const normalizedRight = normalizedUnitText(right)
  if (normalizedLeft === null || normalizedRight === null) return null
  let leftIndex = normalizedLeft.length - 1
  let rightIndex = normalizedRight.length - 1
  let carry = 0
  let result = ''
  while (leftIndex >= 0 || rightIndex >= 0 || carry > 0) {
    const sum =
      Number(normalizedLeft[leftIndex] || 0) +
      Number(normalizedRight[rightIndex] || 0) +
      carry
    result = `${sum % 10}${result}`
    carry = Math.floor(sum / 10)
    leftIndex -= 1
    rightIndex -= 1
  }
  return result.replace(/^0+(?=\d)/u, '')
}

export function subtractNumeric20Scale6Units(left, right) {
  const comparison = compareUnitText(left, right)
  if (comparison === null) return null
  if (comparison <= 0) return ZERO_UNITS

  const normalizedLeft = normalizedUnitText(left)
  const normalizedRight = normalizedUnitText(right).padStart(
    normalizedLeft.length,
    '0'
  )
  let borrow = 0
  let result = ''
  for (let index = normalizedLeft.length - 1; index >= 0; index -= 1) {
    let digit = Number(normalizedLeft[index]) - borrow
    const subtrahend = Number(normalizedRight[index])
    if (digit < subtrahend) {
      digit += 10
      borrow = 1
    } else {
      borrow = 0
    }
    result = `${digit - subtrahend}${result}`
  }
  return result.replace(/^0+(?=\d)/u, '')
}

export function minNumeric20Scale6Units(left, right) {
  const comparison = compareUnitText(left, right)
  if (comparison === null) return null
  return comparison <= 0
    ? normalizedUnitText(left)
    : normalizedUnitText(right)
}

export function isPositiveNumeric20Scale6Units(value) {
  return compareUnitText(value, ZERO_UNITS) === 1
}

export function normalizeNumeric20Scale6(value) {
  const units = numeric20Scale6Units(value)
  return units === null ? '' : numeric20Scale6TextFromUnits(units)
}

export function normalizePositiveNumeric20Scale6(value) {
  const units = numeric20Scale6Units(value)
  return units !== null && isPositiveNumeric20Scale6Units(units)
    ? numeric20Scale6TextFromUnits(units)
    : ''
}

export function formatNumeric20Scale6(value) {
  return normalizeNumeric20Scale6(value) || '0'
}

export function sumNumeric20Scale6Values(values = []) {
  const totalUnits = (Array.isArray(values) ? values : []).reduce(
    (total, value) =>
      addNumeric20Scale6Units(
        total,
        numeric20Scale6Units(value) ?? ZERO_UNITS
      ),
    ZERO_UNITS
  )
  return numeric20Scale6TextFromUnits(totalUnits)
}

export function formatNumeric20Scale6Summary(
  value,
  minimumFractionDigits = 0
) {
  const canonical = String(value ?? '').trim()
  const match = /^(\d+)(?:\.(\d{1,6}))?$/u.exec(canonical)
  const safeMinimum = Math.max(
    0,
    Math.min(SCALE_DIGITS, Number(minimumFractionDigits) || 0)
  )
  if (!match) {
    return safeMinimum > 0 ? `0.${'0'.repeat(safeMinimum)}` : '0'
  }
  const integerText = match[1].replace(/^0+(?=\d)/u, '')
  const fractionText = match[2] || ''
  const paddedFraction = fractionText.padEnd(safeMinimum, '0')
  return paddedFraction ? `${integerText}.${paddedFraction}` : integerText
}
