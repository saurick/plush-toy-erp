import { trimOptional } from './sourceDocumentValues.mjs'
import {
  normalizeNumeric20Scale6,
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
  sumNumeric20Scale6Values,
} from './numeric20Scale6.mjs'

function parseUnsignedDecimal(value) {
  const text = String(value ?? '')
    .replace(/,/g, '')
    .trim()
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) {
    return null
  }
  const [integerText = '0', fractionText = ''] = text.split('.')
  const digits = `${integerText || '0'}${fractionText}`.replace(/^0+(?=\d)/, '')
  return {
    value: BigInt(digits || '0'),
    scale: fractionText.length,
  }
}

function pow10(scale) {
  return BigInt(10) ** BigInt(scale)
}

function trimDecimalZeros(text, minFractionDigits = 2) {
  const source = String(text)
  const [integerPart, fractionPart = ''] = source.split('.')
  let fraction = fractionPart
  while (fraction.length > minFractionDigits && fraction.endsWith('0')) {
    fraction = fraction.slice(0, -1)
  }
  while (fraction.length < minFractionDigits) {
    fraction += '0'
  }
  return fraction ? `${integerPart}.${fraction}` : integerPart
}

function formatFixedMinorUnits(value, fractionDigits) {
  if (fractionDigits <= 0) {
    return String(value)
  }
  const text = String(value).padStart(fractionDigits + 1, '0')
  const integerPart = text.slice(0, -fractionDigits)
  const fractionPart = text.slice(-fractionDigits)
  return `${integerPart}.${fractionPart}`
}

function multiplyUnsignedDecimalToFixed(left, right, fractionDigits = 6) {
  const leftDecimal = parseUnsignedDecimal(left)
  const rightDecimal = parseUnsignedDecimal(right)
  if (!leftDecimal || !rightDecimal) {
    return undefined
  }
  const rawValue = leftDecimal.value * rightDecimal.value
  const rawScale = leftDecimal.scale + rightDecimal.scale
  if (rawScale <= fractionDigits) {
    return trimDecimalZeros(formatFixedMinorUnits(rawValue, rawScale))
  }
  const divisor = pow10(rawScale)
  const targetMultiplier = pow10(fractionDigits)
  const scaledValue = rawValue * targetMultiplier
  let roundedValue = scaledValue / divisor
  if ((scaledValue % divisor) * BigInt(2) >= divisor) {
    roundedValue += BigInt(1)
  }
  return trimDecimalZeros(formatFixedMinorUnits(roundedValue, fractionDigits))
}

function deriveOrderItemAmount(values, quantityField) {
  const sourceValues = values || {}
  return (
    multiplyUnsignedDecimalToFixed(
      sourceValues[quantityField],
      sourceValues.unit_price
    ) || trimOptional(sourceValues.amount)
  )
}

function deriveSalesOrderItemAmount(values = {}) {
  return deriveOrderItemAmount(values, 'ordered_quantity')
}

function divideAndRoundNonNegative(numerator, denominator) {
  if (denominator <= BigInt(0)) return null
  return (numerator + denominator / BigInt(2)) / denominator
}

function calculateSalesOrderAmounts({
  items = [],
  taxMode,
  taxRate,
  freightTerms,
  quotedFreightAmount,
} = {}) {
  const normalizedItems = Array.isArray(items) ? items : []
  if (normalizedItems.length === 0) {
    return { complete: false, goodsAmount: '', taxAmount: '', orderTotal: '' }
  }
  const amountUnits = normalizedItems.map((item) =>
    numeric20Scale6Units(deriveSalesOrderItemAmount(item))
  )
  if (amountUnits.some((value) => value === null)) {
    return { complete: false, goodsAmount: '', taxAmount: '', orderTotal: '' }
  }
  const goodsUnits = amountUnits.reduce(
    (total, value) => total + BigInt(value),
    BigInt(0)
  )
  const goodsAmount = numeric20Scale6TextFromUnits(goodsUnits.toString())
  const normalizedFreightTerms = String(freightTerms || '')
    .trim()
    .toUpperCase()
  let commercialBaseUnits = goodsUnits
  if (normalizedFreightTerms === 'EXCLUDED') {
    const quotedFreightUnits = numeric20Scale6Units(quotedFreightAmount)
    if (quotedFreightUnits === null) {
      return { complete: false, goodsAmount, taxAmount: '', orderTotal: '' }
    }
    commercialBaseUnits += BigInt(quotedFreightUnits)
  } else if (normalizedFreightTerms !== 'INCLUDED') {
    return { complete: false, goodsAmount, taxAmount: '', orderTotal: '' }
  }
  const mode = String(taxMode || '')
    .trim()
    .toUpperCase()
  if (mode === 'NONE') {
    return {
      complete: true,
      goodsAmount,
      taxAmount: '0',
      orderTotal: numeric20Scale6TextFromUnits(commercialBaseUnits.toString()),
    }
  }
  if (mode !== 'INCLUSIVE' && mode !== 'EXCLUSIVE') {
    return { complete: false, goodsAmount, taxAmount: '', orderTotal: '' }
  }
  const rateUnits = numeric20Scale6Units(taxRate)
  const percentageBaseUnits = BigInt(100) * BigInt(1_000_000)
  if (
    rateUnits === null ||
    BigInt(rateUnits) <= BigInt(0) ||
    BigInt(rateUnits) > percentageBaseUnits
  ) {
    return { complete: false, goodsAmount, taxAmount: '', orderTotal: '' }
  }
  const denominator =
    mode === 'INCLUSIVE'
      ? percentageBaseUnits + BigInt(rateUnits)
      : percentageBaseUnits
  const taxUnits = divideAndRoundNonNegative(
    commercialBaseUnits * BigInt(rateUnits),
    denominator
  )
  if (taxUnits === null) {
    return { complete: false, goodsAmount, taxAmount: '', orderTotal: '' }
  }
  const orderTotalUnits =
    mode === 'EXCLUSIVE' ? commercialBaseUnits + taxUnits : commercialBaseUnits
  return {
    complete: true,
    goodsAmount,
    taxAmount: numeric20Scale6TextFromUnits(taxUnits.toString()),
    orderTotal: numeric20Scale6TextFromUnits(orderTotalUnits.toString()),
  }
}

function derivePurchaseOrderItemAmount(values = {}) {
  return deriveOrderItemAmount(values, 'purchased_quantity')
}

function deriveOutsourcingOrderItemAmount(values = {}) {
  return deriveOrderItemAmount(values, 'outsourcing_quantity')
}

function snapshotValue(snapshot, keys) {
  const source = snapshot && typeof snapshot === 'object' ? snapshot : {}
  return keys
    .map((key) => source[key])
    .find((item) => String(item ?? '').trim() !== '')
}

function snapshotCount(snapshot, keys) {
  const value = Number(snapshotValue(snapshot, keys) || 0)
  return Number.isFinite(value) ? value : 0
}

function snapshotNumeric20Scale6(snapshot, keys) {
  return normalizeNumeric20Scale6(snapshotValue(snapshot, keys)) || '0'
}

function summarizeOrderLines(lines, quantityField, deriveAmount) {
  const items = Array.isArray(lines) ? lines : []
  return {
    count: items.length,
    quantity: sumNumeric20Scale6Values(
      items.map((line) => line?.[quantityField])
    ),
    amount: sumNumeric20Scale6Values(items.map((line) => deriveAmount(line))),
  }
}

function summarizeSalesOrderLines(lines = [], snapshot = {}) {
  const items = Array.isArray(lines) ? lines : []
  if (items.length === 0) {
    return {
      count: snapshotCount(snapshot, ['count', 'item_count', 'line_count']),
      quantity: snapshotNumeric20Scale6(snapshot, [
        'quantity',
        'header_quantity',
        'quantity_total',
        'total_quantity',
      ]),
      amount: snapshotNumeric20Scale6(snapshot, [
        'amount',
        'header_amount',
        'amount_total',
        'total_amount',
      ]),
    }
  }
  return summarizeOrderLines(
    items,
    'ordered_quantity',
    deriveSalesOrderItemAmount
  )
}

function summarizePurchaseOrderLines(lines = []) {
  return summarizeOrderLines(
    lines,
    'purchased_quantity',
    derivePurchaseOrderItemAmount
  )
}

function summarizeOutsourcingOrderLines(lines = []) {
  return summarizeOrderLines(
    lines,
    'outsourcing_quantity',
    deriveOutsourcingOrderItemAmount
  )
}

export {
  deriveSalesOrderItemAmount,
  derivePurchaseOrderItemAmount,
  calculateSalesOrderAmounts,
  deriveOutsourcingOrderItemAmount,
  summarizeSalesOrderLines,
  summarizePurchaseOrderLines,
  summarizeOutsourcingOrderLines,
}
