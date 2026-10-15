import {
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
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

export function formatMaterialQuantity(value) {
  if (value === null || value === undefined || value === '') return '—'
  const units = numeric20Scale6Units(value)
  if (units === null) return '—'
  const [integer, fraction] = numeric20Scale6TextFromUnits(units).split('.')
  return (
    integer.replace(/\B(?=(\d{3})+(?!\d))/gu, ',') +
    (fraction ? `.${fraction}` : '')
  )
}

export function materialSummaryTotals(items = []) {
  const units = new Map()
  for (const item of items) {
    const quantity = numeric20Scale6Units(item.required_quantity)
    if (quantity !== null) {
      const group = units.get(item.unit_id) || {
        name: item.unit_name,
        quantity: '0',
      }
      group.quantity = addNumeric20Scale6Units(group.quantity, quantity)
      units.set(item.unit_id, group)
    }
  }
  return {
    units: [...units].map(([id, group]) => ({
      id,
      name: group.name,
      quantity: numeric20Scale6TextFromUnits(group.quantity),
    })),
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

export function materialNoteFits(value) {
  return new TextEncoder().encode(String(value || '').trim()).length <= 255
}
