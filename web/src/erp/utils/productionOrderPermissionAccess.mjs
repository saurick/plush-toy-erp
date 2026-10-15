function snapshotLabel(values, fallback) {
  return (
    values
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .join(' / ') || fallback
  )
}

export function productionReferenceSnapshotOptions(items = []) {
  const groups = {
    product: [],
    product_sku: [],
    unit: [],
    sales_order_item: [],
    active_bom: [],
  }
  const seenByType = new Map(
    Object.keys(groups).map((type) => [type, new Set()])
  )
  const add = (type, value, label) => {
    const id = Number(value || 0)
    if (!Number.isSafeInteger(id) || id <= 0 || seenByType.get(type).has(id)) {
      return
    }
    seenByType.get(type).add(id)
    groups[type].push({
      value: id,
      label: String(label || '').trim() || '既有关联',
      selectable: false,
      reason: '当前账号仅可保留订单中的既有关联',
    })
  }
  for (const item of Array.isArray(items) ? items : []) {
    add(
      'product',
      item?.product_id,
      snapshotLabel(
        [item?.product_code_snapshot, item?.product_name_snapshot],
        '产品已关联'
      )
    )
    add(
      'product_sku',
      item?.product_sku_id,
      item?.sku_code_snapshot || '产品规格已关联'
    )
    add('unit', item?.unit_id, item?.unit_name_snapshot || '单位已关联')
    add(
      'sales_order_item',
      item?.sales_order_item_id,
      '销售订单行已关联'
    )
    add(
      'active_bom',
      item?.bom_header_id,
      item?.bom_version_snapshot || 'BOM 版本已关联'
    )
  }
  return groups
}

export function resolveProductionOrderDetailAccess({
  requestedMode = 'view',
  items = [],
  referenceAccess = {},
} = {}) {
  const unreadableSources = []
  if (
    (Array.isArray(items) ? items : []).some(
      (item) => Number(item?.sales_order_item_id || 0) > 0
    ) &&
    referenceAccess.sales_order_item !== true
  ) {
    unreadableSources.push('销售订单行')
  }
  if (
    (Array.isArray(items) ? items : []).some(
      (item) => Number(item?.bom_header_id || 0) > 0
    ) &&
    referenceAccess.active_bom !== true
  ) {
    unreadableSources.push('BOM 版本')
  }
  return {
    mode:
      requestedMode === 'edit' && unreadableSources.length > 0
        ? 'view'
        : requestedMode,
    unreadableSources,
  }
}
