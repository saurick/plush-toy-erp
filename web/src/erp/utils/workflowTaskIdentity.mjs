const text = (value) => (typeof value === 'string' ? value.trim() : '')
const PURCHASE_ORDER_SOURCE_TYPES = new Set([
  'purchase_order',
  'purchase-order',
  'accessories-purchase',
])

export function getWorkflowTaskIdentity(task = {}) {
  const context = task?.display_context
  if (context && typeof context === 'object' && !Array.isArray(context)) {
    return {
      available: context.available === true,
      sourceNo: text(context.source_no),
      sourceLineCount:
        Number.isSafeInteger(context.source_line_count) &&
        context.source_line_count >= 0
          ? context.source_line_count
          : null,
      items: (Array.isArray(context.items) ? context.items : [])
        .filter((item) => ['product', 'material'].includes(item?.kind))
        .map((item) => ({
          kind: item.kind,
          ...(item.kind === 'product' &&
          Number.isSafeInteger(item.product_id) &&
          item.product_id > 0
            ? {
                productID: item.product_id,
                imageAttachmentID:
                  Number.isSafeInteger(item.image_attachment_id) &&
                  item.image_attachment_id > 0
                    ? item.image_attachment_id
                    : 0,
              }
            : {}),
          name: text(item.name),
          code: text(item.code),
          styleNo: text(item.style_no),
          supplierItemNo:
            item.kind === 'material' ? text(item.supplier_item_no) : '',
          orderNo: text(item.order_no),
        })),
    }
  }
  // Unlinked collaboration tasks own their display snapshots. A resolved
  // source projection, including an empty one, never falls back to payload.
  const payload = task?.payload || {}
  const items = []
  if (
    text(payload.product_name) ||
    text(payload.style_no) ||
    text(payload.product_code)
  ) {
    items.push({
      kind: 'product',
      name: text(payload.product_name),
      code: text(payload.product_code),
      styleNo: text(payload.style_no),
      orderNo: text(payload.sales_order_no),
    })
  }
  for (const name of Array.isArray(payload.product_names)
    ? payload.product_names
    : []) {
    if (text(name) && !items.some((item) => item.name === text(name))) {
      items.push({
        kind: 'product',
        name: text(name),
        code: '',
        styleNo: '',
        orderNo: '',
      })
    }
  }
  if (
    text(payload.material_name) ||
    text(payload.material_code) ||
    text(payload.supplier_item_no)
  ) {
    items.push({
      kind: 'material',
      name: text(payload.material_name),
      code: text(payload.material_code),
      supplierItemNo: text(payload.supplier_item_no),
      styleNo: '',
      orderNo: '',
    })
  }
  return { available: true, sourceNo: '', sourceLineCount: null, items }
}

export function getWorkflowTaskIdentityPresentation(task = {}) {
  const identity = getWorkflowTaskIdentity(task)
  const purchaseOrder = PURCHASE_ORDER_SOURCE_TYPES.has(text(task.source_type))
  const firstIndex = purchaseOrder
    ? identity.items.findIndex((item) => item.kind === 'material')
    : 0
  const resolvedFirstIndex = firstIndex >= 0 ? firstIndex : 0
  const first = identity.items[resolvedFirstIndex]
  const remainingItems = identity.items.filter(
    (_, index) => index !== resolvedFirstIndex
  )
  let compactCountLabel = ''
  if (
    purchaseOrder &&
    Number.isSafeInteger(identity.sourceLineCount) &&
    identity.sourceLineCount > 0
  ) {
    compactCountLabel = `共 ${identity.sourceLineCount} 条采购明细`
  } else if (!purchaseOrder && identity.items.length > 1) {
    compactCountLabel = `共 ${identity.items.length} 项关联内容`
  }
  return {
    ...identity,
    first,
    remainingItems,
    compactCountLabel,
  }
}

export function getWorkflowTaskIdentityCode(item) {
  if (item.kind === 'material') {
    return item.supplierItemNo
      ? `款号 ${item.supplierItemNo}`
      : '款号未填写'
  }
  return item.code ? `产品编号 ${item.code}` : '产品编号未填写'
}

export function retainWorkflowTaskIdentity(previous, next) {
  if (!next || next.display_context || !previous?.display_context) return next
  const sameSource = [
    'id',
    'source_type',
    'source_id',
    'source_no',
    'process_instance_id',
  ].every((key) => previous[key] === next[key])
  return sameSource
    ? { ...next, display_context: previous.display_context }
    : next
}
