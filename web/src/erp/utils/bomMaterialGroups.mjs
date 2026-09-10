import {
  numeric20Scale6Units,
  numeric20Scale6TextFromUnits,
} from './numeric20Scale6.mjs'

const SCALE = BigInt(1000000)

export function invalidateBOMUsageSnapshots(items, changes) {
  const productionChanged = Object.hasOwn(changes, 'quantity_text')
  return items.map((item, index) => {
    const changed = changes.items?.[index] || {}
    if (
      !productionChanged &&
      !['quantity', 'loss_rate', 'unit_id', 'material_id'].some((key) =>
        Object.hasOwn(changed, key)
      )
    ) {
      return item
    }
    return { ...item, total_usage_snapshot: undefined }
  })
}

export function groupBOMMaterials(items = []) {
  const groups = new Map()
  items.forEach((item, index) => {
    const key = item?.material_id
      ? `${item.material_id}:${item.unit_id || ''}`
      : `empty-${index}`
    if (!groups.has(key)) {
      groups.set(key, { key, materialID: item?.material_id, indexes: [] })
    }
    groups.get(key).indexes.push(index)
  })
  return [...groups.values()]
}

export function calculateBOMUsage(quantity, lossRate, productionQuantity) {
  const values = [quantity, lossRate ?? '0', productionQuantity].map(
    numeric20Scale6Units
  )
  if (values.some((value) => value === null)) return ''
  const [unit, loss, count] = values.map(BigInt)
  const divisor = SCALE * SCALE
  return (
    numeric20Scale6TextFromUnits(
      (
        (unit * (SCALE + loss) * count + divisor / BigInt(2)) /
        divisor
      ).toString()
    ) || ''
  )
}

export function bomLossRateToPercent(rate) {
  const value = numeric20Scale6Units(rate)
  return value === null
    ? ''
    : numeric20Scale6TextFromUnits((BigInt(value) * BigInt(100)).toString()) ||
        ''
}

export function bomPercentToLossRate(percent) {
  const value = numeric20Scale6Units(percent)
  if (value === null || BigInt(value) % BigInt(100) !== BigInt(0)) return null
  return numeric20Scale6TextFromUnits((BigInt(value) / BigInt(100)).toString())
}

export const BOM_PART_FIELDS = [
  'position',
  'piece_count',
  'quantity',
  'loss_rate',
  'process_base',
  'process_method',
  'note',
]

export function parseBOMPartsPaste(text, startingColumn = 0) {
  const rows = String(text)
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
  if (rows.length > 200) throw new Error('一次最多粘贴 200 个部位')
  return rows.map((row) => {
    const values = row.split('\t')
    if (values.length + startingColumn > BOM_PART_FIELDS.length) {
      throw new Error('粘贴列数超过部位表，请按表头顺序粘贴')
    }
    const item = {}
    values.forEach((raw, offset) => {
      const key = BOM_PART_FIELDS[startingColumn + offset]
      const value = raw.trim()
      if (key === 'loss_rate') {
        item[key] = bomPercentToLossRate(value.replace(/%$/, ''))
        if (item[key] === null) {
          throw new Error('损耗须为有效百分比，如 10 或 10%')
        }
      } else if (key === 'quantity') {
        if (numeric20Scale6Units(value) === null || Number(value) <= 0) {
          throw new Error('单位用量须为正数，请从 Excel 粘贴计算结果')
        }
        item[key] = value
      } else item[key] = value
    })
    return item
  })
}
