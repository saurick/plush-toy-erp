import { normalizeBOMSourceNumber, parseBOMSourceNumber, multiplyBOMNumbers, sumBOMSourceNumbers } from './bomSourceValues.mjs'

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
      : item?._material_group_key
        ? `import:${item._material_group_key}:${item.unit_id || ''}`
        : `empty-${index}`
    if (!groups.has(key)) {
      groups.set(key, { key, materialID: item?.material_id, indexes: [] })
    }
    groups.get(key).indexes.push(index)
  })
  return [...groups.values()]
}

export function bindBOMMaterialReference(item, material) {
  const source = item?._import_source
  const firstAssociation = source && !source.associatedMaterialID && item.source_snapshot && item.unit_id === material?.default_unit_id
  return {
    ...item,
    material_id: material?.id,
    unit_id: material?.default_unit_id,
    total_usage_snapshot: firstAssociation ? item.total_usage_snapshot : undefined,
    ...(source ? { _import_source: { ...source, associatedMaterialID: material?.id } } : {}),
  }
}

export function calculateBOMUsage(quantity, lossRate, productionQuantity) {
  const factor = sumBOMSourceNumbers(['1', lossRate ?? '0'])
  return factor ? multiplyBOMNumbers([quantity, factor, productionQuantity]) : ''
}

export function getBOMUsage(item = {}, productionQuantity = '') {
  const calculated = calculateBOMUsage(item.quantity, item.loss_rate, productionQuantity)
  if (item.source_snapshot && calculated) return calculated
  const snapshot = normalizeBOMSourceNumber(item.total_usage_snapshot)
  const sourceQuantity = normalizeBOMSourceNumber(item.source_snapshot?.order_quantity)
  const currentOrder = !item.source_snapshot || (sourceQuantity && sourceQuantity !== '0' && sourceQuantity === normalizeBOMSourceNumber(productionQuantity))
  return snapshot && currentOrder
    ? snapshot
    : calculated
}

export function bomLossRateToPercent(rate) {
  return multiplyBOMNumbers([rate, '100'])
}

export function bomPercentToLossRate(percent) {
  const value = multiplyBOMNumbers([percent, '0.01'])
  return value && parseBOMSourceNumber(value) ? value : null
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
        if (!parseBOMSourceNumber(value)?.units) {
          throw new Error('单位用量须为正数，请从 Excel 粘贴计算结果')
        }
        item[key] = value
      } else item[key] = value
    })
    return item
  })
}
