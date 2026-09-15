import {
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
  multiplyNumeric20Scale6Values,
  addNumeric20Scale6Units,
} from './numeric20Scale6.mjs'

export const materialRowKey = (item) => `${item.material_id}:${item.unit_id}`

export function materialSummaryProducts(sources = []) {
  return [
    ...new Map(
      sources.map((part) => [part.sales_order_item_id, part])
    ).values(),
  ]
}

export function materialSummaryRows(request) {
  const parts = new Map()
  for (const part of request.sources || []) {
    const key = materialRowKey(part)
    if (!parts.has(key)) parts.set(key, [])
    parts.get(key).push(part)
  }
  return (request.items || []).map((item, index) => {
    const sources = parts.get(materialRowKey(item)) || []
    return {
      ...item,
      index,
      parts: sources,
      material_notes: [
        ...new Set(sources.map((part) => part.material_note).filter(Boolean)),
      ],
    }
  })
}

export function formatMaterialQuantity(value, precise = false) {
  if (value === null || value === undefined || value === '') return '—'
  // Group decimal text directly; converting to Number loses large quantities.
  const text = String(value).replace(/,/gu, '')
  if (!/^\d+(?:\.\d+)?$/u.test(text)) return '—'
  const rounded = precise
    ? text
    : (() => {
        const [integer, fraction = ''] = text.split('.')
        const cents =
          BigInt(integer) * BigInt(100) +
          BigInt(fraction.padEnd(2, '0').slice(0, 2)) +
          (Number(fraction[2] || 0) >= 5 ? BigInt(1) : BigInt(0))
        return `${cents / BigInt(100)}.${String(cents % BigInt(100)).padStart(2, '0')}`
      })()
  const [integer, fraction = ''] = rounded.split('.')
  const tail = fraction.replace(/0+$/u, '')
  return `${integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ',')}${tail ? `.${tail}` : ''}`
}

export function materialSummaryTotals(items = [], values = items) {
  const units = new Map()
  let amount = '0'
  let priced = 0
  for (const [index, item] of items.entries()) {
    const quantity = numeric20Scale6Units(item.required_quantity)
    if (quantity !== null) {
      const group = units.get(item.unit_id) || {
        name: item.unit_name,
        quantity: '0',
      }
      group.quantity = addNumeric20Scale6Units(group.quantity, quantity)
      units.set(item.unit_id, group)
    }
    const line = values?.[index]
    const lineAmount = multiplyNumeric20Scale6Values(
      line?.purchase_quantity,
      line?.unit_price,
      6
    )
    const scaled = numeric20Scale6Units(lineAmount)
    if (scaled !== null) {
      amount = addNumeric20Scale6Units(amount, scaled)
      priced += 1
    }
  }
  return {
    units: [...units].map(([id, group]) => ({
      id,
      name: group.name,
      quantity: numeric20Scale6TextFromUnits(group.quantity),
    })),
    amount: numeric20Scale6TextFromUnits(amount),
    priced,
  }
}

export function materialStockQuantity(reference, item) {
  if (reference?.status !== 'AVAILABLE') return null
  const matching = reference.items.filter(
    (row) => row.material_id === item.material_id
  )
  const row = matching.find((stock) => stock.unit_id === item.unit_id)
  // A different stock unit cannot be treated as zero or converted implicitly.
  return row ? row.quantity : matching.length ? null : '0'
}

export function materialFinanceIssue(items = [], values = []) {
  for (const [index, item] of items.entries()) {
    const line = values?.[index] || {}
    const required = numeric20Scale6Units(item.required_quantity)
    const actual = numeric20Scale6Units(line.purchase_quantity)
    const price = numeric20Scale6Units(line.unit_price)
    const issue = (field, label, message) => ({
      index,
      field,
      label,
      message: `第 ${index + 1} 行：${message}`,
    })
    if (actual === null) {
      return issue('purchase_quantity', '实购数量', '请填写有效的实购数量')
    }
    if (price === null) return issue('unit_price', '单价', '请填写有效的单价')
    if (
      numeric20Scale6Units(
        multiplyNumeric20Scale6Values(
          line.purchase_quantity,
          line.unit_price,
          6
        )
      ) === null
    ) {
      return issue('unit_price', '单价', '金额超出允许范围，请核对单价和数量')
    }
    const date = String(line.expected_arrival_date || '')
    const parsed = new Date(`${date}T00:00:00Z`)
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(date) ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== date
    ) {
      return issue('expected_arrival_date', '到货日期', '请填写有效的到货日期')
    }
    if (actual !== required && !String(line.note || '').trim()) {
      return issue('note', '调整原因', '调整实购数量请填写原因')
    }
    if (!materialNoteFits(line.note)) {
      return issue('note', '调整原因', '备注过长，请适当精简')
    }
  }
  return null
}

export function materialNoteFits(value) {
  return new TextEncoder().encode(String(value || '').trim()).length <= 255
}
