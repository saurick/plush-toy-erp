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
      sourceNo: context.available === true ? text(context.source_no) : '',
      sourceLineCount:
        Number.isSafeInteger(context.source_line_count) &&
        context.source_line_count >= 0
          ? context.source_line_count
          : null,
      items: (context.available === true && Array.isArray(context.items) ? context.items : [])
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

function identityItemKey(item) {
  return item.productID
    ? `product:${item.productID}`
    : item.code
      ? `${item.kind}:${item.code}`
      : JSON.stringify([
        item.kind,
        item.name,
        item.code,
        item.styleNo,
        item.supplierItemNo,
      ])
}

export function getWorkflowTaskIdentityPresentation(task = {}, keyword = '') {
  const identity = getWorkflowTaskIdentity(task)
  const purchaseOrder = PURCHASE_ORDER_SOURCE_TYPES.has(text(task.source_type))
  const query = text(keyword).toLowerCase()
  const matchedItems =
    query && identity.available
      ? identity.items.filter((item) =>
          [item.name, item.code, item.styleNo, item.supplierItemNo].some(
            (value) => value?.toLowerCase().includes(query)
          )
        )
      : []
  const preferredMatch = purchaseOrder
    ? matchedItems.find((item) => item.kind === 'material') || matchedItems[0]
    : matchedItems[0]
  const firstIndex = preferredMatch
    ? identity.items.indexOf(preferredMatch)
    : purchaseOrder
      ? identity.items.findIndex((item) => item.kind === 'material')
      : 0
  const resolvedFirstIndex = firstIndex >= 0 ? firstIndex : 0
  const first = identity.items[resolvedFirstIndex]
  const remainingItems = identity.items.filter(
    (_, index) => index !== resolvedFirstIndex
  )
  const kinds = new Set(identity.items.map((item) => item.kind))
  const associationCount = new Set(identity.items.map(identityItemKey)).size
  const associationUnit = kinds.size > 1 ? '项关联内容' : kinds.has('material') ? '种物料' : '款产品'
  const associationCountLabel = `共 ${associationCount} ${associationUnit}`
  let compactCountLabel = ''
  if (matchedItems.length) {
    const kinds = new Set(matchedItems.map((item) => item.kind))
    const countedItems =
      kinds.size === 1
        ? identity.items.filter((item) => kinds.has(item.kind))
        : identity.items
    const matchedCount = new Set(matchedItems.map(identityItemKey)).size
    const totalCount = new Set(countedItems.map(identityItemKey)).size
    const unit = kinds.size > 1 ? '项' : kinds.has('product') ? '款' : '种物料'
    compactCountLabel = `命中 ${matchedCount} ${unit}，共 ${totalCount} ${unit}`
  } else if (associationCount > 1) {
    compactCountLabel = associationCountLabel
  }
  return {
    ...identity,
    first,
    remainingItems,
    compactCountLabel,
    associationCount,
    associationCountLabel,
    associationTitle: kinds.size > 1 ? '关联内容' : kinds.has('material') ? '关联物料' : '关联产品',
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
