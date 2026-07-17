export const PRODUCT_PRINT_IMAGE_OWNER_TYPE = 'product'
export const PRODUCT_PRINT_IMAGE_ATTACHMENT_TYPE = 'product_image'
export const PRODUCT_PRINT_IMAGE_SLOT_KEYS = Object.freeze([
  'primary',
  'secondary',
])

const PRODUCT_PRINT_IMAGE_SLOT_LABELS = Object.freeze({
  primary: '产品图 1',
  secondary: '产品图 2',
})

function positiveInteger(value) {
  const numeric = Number(value || 0)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : 0
}

function normalizedText(value) {
  return String(value || '').trim()
}

export function selectProductPrintImageAttachments(
  attachments,
  productID
) {
  const normalizedProductID = positiveInteger(productID)
  if (!normalizedProductID) return {}

  const selected = {}
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const slotKey = normalizedText(attachment?.slot_key).toLowerCase()
    if (
      normalizedText(attachment?.owner_type).toLowerCase() !==
        PRODUCT_PRINT_IMAGE_OWNER_TYPE ||
      positiveInteger(attachment?.owner_id) !== normalizedProductID ||
      normalizedText(attachment?.attachment_type).toLowerCase() !==
        PRODUCT_PRINT_IMAGE_ATTACHMENT_TYPE ||
      !PRODUCT_PRINT_IMAGE_SLOT_KEYS.includes(slotKey) ||
      !positiveInteger(attachment?.id) ||
      selected[slotKey]
    ) {
      continue
    }
    selected[slotKey] = attachment
  }
  return selected
}

function productPrintImageSnapshot(attachment, downloaded) {
  const slotKey = normalizedText(attachment?.slot_key).toLowerCase()
  const contentBase64 = normalizedText(downloaded?.content_base64)
  const mimeType = normalizedText(
    downloaded?.mime_type || attachment?.mime_type
  ).toLowerCase()
  if (!contentBase64 || !mimeType.startsWith('image/')) {
    throw new Error(
      `${PRODUCT_PRINT_IMAGE_SLOT_LABELS[slotKey] || '产品图'}内容无法用于打印`
    )
  }
  return {
    name:
      normalizedText(downloaded?.file_name || attachment?.file_name) ||
      PRODUCT_PRINT_IMAGE_SLOT_LABELS[slotKey] ||
      '产品图',
    dataURL: `data:${mimeType};base64,${contentBase64}`,
    mimeType,
    crop: null,
    layout: null,
    annotations: [],
  }
}

export async function loadProductPrintImageSnapshots(
  productID,
  { listAttachments, downloadAttachment } = {}
) {
  const normalizedProductID = positiveInteger(productID)
  if (!normalizedProductID) {
    throw new Error('产品资料不完整，无法读取产品图')
  }
  if (
    typeof listAttachments !== 'function' ||
    typeof downloadAttachment !== 'function'
  ) {
    throw new Error('产品图读取能力暂不可用')
  }

  const attachments = await listAttachments({
    owner_type: PRODUCT_PRINT_IMAGE_OWNER_TYPE,
    owner_id: normalizedProductID,
    attachment_type: PRODUCT_PRINT_IMAGE_ATTACHMENT_TYPE,
  })
  const selected = selectProductPrintImageAttachments(
    attachments,
    normalizedProductID
  )
  const entries = PRODUCT_PRINT_IMAGE_SLOT_KEYS.flatMap((slotKey) =>
    selected[slotKey] ? [[slotKey, selected[slotKey]]] : []
  )
  if (!entries.length) return {}

  const snapshots = await Promise.all(
    entries.map(async ([slotKey, attachment]) => {
      const downloaded = await downloadAttachment({ id: attachment.id })
      return [slotKey, productPrintImageSnapshot(attachment, downloaded)]
    })
  )
  return Object.fromEntries(snapshots)
}

export function resolveSharedProductIDForPrintImages(items = []) {
  const productIDs = new Set()
  let hasMissingProduct = false
  for (const item of Array.isArray(items) ? items : []) {
    const productID = positiveInteger(item?.product_id)
    if (!productID) {
      hasMissingProduct = true
      continue
    }
    productIDs.add(productID)
  }

  if (productIDs.size > 1) {
    return { productID: 0, reason: 'multiple' }
  }
  if (hasMissingProduct) {
    return { productID: 0, reason: 'missing' }
  }
  if (productIDs.size === 1) {
    return { productID: [...productIDs][0], reason: 'single' }
  }
  return { productID: 0, reason: 'empty' }
}
