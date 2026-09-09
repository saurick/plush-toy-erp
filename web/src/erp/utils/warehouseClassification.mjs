export const MATERIAL_STOCK_CATEGORY_OPTIONS = Object.freeze([
  { value: 'MAIN', label: '主料' },
  { value: 'AUXILIARY', label: '辅料' },
  { value: 'PACKAGING', label: '包材' },
  { value: 'OTHER', label: '其他材料' },
])

export const WAREHOUSE_TYPE_OPTIONS = Object.freeze([
  { value: 'MAIN_MATERIAL', label: '主料仓' },
  { value: 'AUXILIARY_MATERIAL', label: '辅料仓' },
  { value: 'PACKAGING_MATERIAL', label: '包材仓' },
  { value: 'OTHER_MATERIAL', label: '其他材料仓' },
  { value: 'MATERIAL', label: '原辅料综合仓' },
  { value: 'FINISHED_GOODS', label: '成品仓' },
])

export function materialStockCategoryLabel(value) {
  return (
    MATERIAL_STOCK_CATEGORY_OPTIONS.find((item) => item.value === value)
      ?.label || '待分类'
  )
}

export function warehouseTypeLabel(value) {
  return (
    WAREHOUSE_TYPE_OPTIONS.find((item) => item.value === value)?.label ||
    '待分类'
  )
}

export function warehouseAcceptsSubject(warehouse, subjectType, stockCategory) {
  if (!warehouse || warehouse.is_active === false) return false
  const { type } = warehouse
  if (subjectType === 'PRODUCT') return type === 'FINISHED_GOODS'
  if (
    subjectType !== 'MATERIAL' ||
    !MATERIAL_STOCK_CATEGORY_OPTIONS.some(
      (item) => item.value === stockCategory
    )
  ) {
    return false
  }
  return type === 'MATERIAL' || type === `${stockCategory}_MATERIAL`
}

export function materialWarehouseOptions(warehouses, material) {
  return warehouses.filter((warehouse) =>
    warehouseAcceptsSubject(warehouse, 'MATERIAL', material?.stock_category)
  )
}

export function recommendedMaterialWarehouse(material, warehouses) {
  const selected = materialWarehouseOptions(warehouses, material).find(
    (item) =>
      Number(item.id || item.value) === Number(material?.default_warehouse_id)
  )
  return selected?.value || selected?.id || undefined
}
