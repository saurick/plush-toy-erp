import { BOMSourcePolicy } from '../../common/consts/policies.generated.mjs'
import { BOMLossSource } from '../../common/consts/statuses.generated.mjs'
import { NumericContract } from '../../common/consts/numeric.generated.mjs'

const ten = (digits) => BigInt(10) ** BigInt(digits)

export function parseBOMSourceNumber(value, { calculated = false } = {}) {
  const text = String(value ?? '').trim()
  const factor = calculated ? 3 : 1
  if (text.length > BOMSourcePolicy.numberCharacters * factor) return null
  const match = /^\+?(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/u.exec(text)
  if (!match) return null
  const exponent = Number(match[3] || 0)
  if (Math.abs(exponent) > BOMSourcePolicy.numberCharacters) return null
  let digits = `${match[1]}${match[2] || ''}`.replace(/^0+(?=\d)/u, '')
  let scale = (match[2] || '').length - exponent
  if (!/[1-9]/u.test(digits)) return scale > BOMSourcePolicy.scale ? null : { units: BigInt(0), scale: 0 }
  if (scale < 0) { digits += '0'.repeat(-scale); scale = 0 }
  while (scale > 0 && digits.endsWith('0')) { digits = digits.slice(0, -1); scale -= 1 }
  if (scale > BOMSourcePolicy.scale * factor || Math.max(1, digits.length - scale) > NumericContract.integerDigits * factor) return null
  return { units: BigInt(digits || '0'), scale }
}

function decimalText(units, scale, fixed = false) {
  const padded = units.toString().padStart(scale + 1, '0')
  const integer = scale ? padded.slice(0, -scale) : padded
  const fraction = scale ? padded.slice(-scale) : ''
  const decimals = fixed ? fraction : fraction.replace(/0+$/u, '')
  return decimals ? `${integer}.${decimals}` : integer
}

export function isBOMDecimalText(value, { positive = false } = {}) {
  if (typeof value !== 'string' || value.trim() !== value) return false
  const number = parseBOMSourceNumber(value)
  return Boolean(number && (!positive || number.units > BigInt(0)))
}

export function roundBOMSourceNumber(value, scale = BOMSourcePolicy.scale, fixed = false) {
  const number = parseBOMSourceNumber(value, { calculated: true })
  if (!number || !Number.isInteger(scale) || scale < 0 || scale > BOMSourcePolicy.scale) return ''
  const units = number.scale > scale
    ? (number.units + ten(number.scale - scale) / BigInt(2)) / ten(number.scale - scale)
    : number.units * ten(scale - number.scale)
  return decimalText(units, scale, fixed)
}

export function normalizeBOMSourceNumber(value, { calculated = false } = {}) {
  const parsed = parseBOMSourceNumber(value, { calculated })
  return parsed ? decimalText(parsed.units, parsed.scale) : ''
}

// BOM cells use decimal/percent formats. Unsupported Excel formats keep a readable value.
export function formatBOMSourceNumber(value, numberFormat = '') {
  const parsed = parseBOMSourceNumber(value, { calculated: true })
  if (!parsed) return ''
  const format = String(numberFormat).split(';')[0]
    .replace(/"[^"]*"|\\.|_.|\*.|\[[^\]]*\]/gu, '').trim()
  const matched = /^([#0,]+)(?:\.([#0]+))?(%)?$/u.exec(format)
  if (!matched) return decimalText(parsed.units, parsed.scale)
  const fraction = matched[2] || ''
  if (fraction.length > BOMSourcePolicy.scale) return decimalText(parsed.units, parsed.scale)
  const scaled = matched[3] ? decimalText(parsed.units * BigInt(100), parsed.scale) : String(value)
  const rounded = roundBOMSourceNumber(scaled, fraction.length, true)
  if (!rounded) return decimalText(parsed.units, parsed.scale)
  const [whole, decimals = ''] = rounded.split('.')
  const minimum = fraction.lastIndexOf('0') + 1
  const trimmed = decimals.replace(/0+$/u, '').padEnd(minimum, '0')
  const paddedWhole = whole.padStart((matched[1].match(/0/gu) || []).length, '0')
  const grouped = matched[1].includes(',') ? paddedWhole.replace(/\B(?=(\d{3})+(?!\d))/gu, ',') : paddedWhole
  return `${grouped}${trimmed ? `.${trimmed}` : ''}${matched[3] ? '%' : ''}`
}

export function sumBOMSourceNumbers(values) {
  const parsed = values.map((value) => parseBOMSourceNumber(value, { calculated: true }))
  if (parsed.some((number) => !number)) return ''
  const scale = Math.max(0, ...parsed.map((number) => number.scale))
  return decimalText(parsed.reduce((sum, number) => sum + number.units * ten(scale - number.scale), BigInt(0)), scale)
}

export function multiplyBOMNumbers(values) {
  const parsed = values.map((value) => parseBOMSourceNumber(value))
  if (parsed.some((number) => !number)) return ''
  return decimalText(parsed.reduce((product, number) => product * number.units, BigInt(1)), parsed.reduce((scale, number) => scale + number.scale, 0))
}

export function bomNumbersDiffer(left, right, tolerance = '0.0005') {
  const parsed = [left, right, tolerance].map((value) => parseBOMSourceNumber(value))
  if (parsed.some((number) => !number)) return false
  const scale = Math.max(...parsed.map((number) => number.scale))
  const [a, b, limit] = parsed.map((number) => number.units * ten(scale - number.scale))
  const difference = a > b ? a - b : b - a
  return difference > limit
}

export function inferBOMSourceLossRate({ orderQuantity, totalQuantity, unitQuantity }) {
  const order = parseBOMSourceNumber(orderQuantity)
  const total = parseBOMSourceNumber(totalQuantity)
  const unit = parseBOMSourceNumber(unitQuantity)
  if (!order || !total || !unit || order.units === BigInt(0) || unit.units === BigInt(0)) return null
  const base = order.units * unit.units * ten(total.scale)
  let difference = total.units * ten(order.scale + unit.scale) - base
  if (difference < BigInt(0) && -difference * BigInt(2000) < base) difference = BigInt(0)
  if (difference < BigInt(0) || difference > base) return null
  return decimalText((difference * ten(BOMSourcePolicy.scale) + base / BigInt(2)) / base, BOMSourcePolicy.scale)
}

export function bomLossSourceLabel(source) {
  return {
    [BOMLossSource.EXPLICIT]: '原表损耗列',
    [BOMLossSource.HEADER]: '原表总用量表头',
    [BOMLossSource.CALCULATED]: '按原表单位用量、订单数量和总用量反算',
    [BOMLossSource.UNRESOLVED]: '待核对',
  }[source] || '未记录来源'
}

export function bomSourceColumnLabel(items, field, fallback) {
  if (!items.length || items.some((item) => !item?.source_snapshot || (field === 'total' && normalizeBOMSourceNumber(item.loss_rate) !== normalizeBOMSourceNumber(item.source_snapshot.loss_rate)))) return fallback
  const labels = new Set(items.map((item) => item?.source_snapshot?.[`${field}_label`]).filter(Boolean))
  return labels.size === 1 ? [...labels][0] : fallback
}
