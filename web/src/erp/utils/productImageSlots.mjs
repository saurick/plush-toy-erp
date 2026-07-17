export const PRODUCT_IMAGE_MAX_FILE_SIZE = 5 * 1024 * 1024

export const PRODUCT_IMAGE_SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'primary', label: '产品图 1（主图）' }),
  Object.freeze({ key: 'secondary', label: '产品图 2（辅图）' }),
])

const PRODUCT_IMAGE_SLOT_KEYS = new Set(
  PRODUCT_IMAGE_SLOT_DEFINITIONS.map((slot) => slot.key)
)

const PRODUCT_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

const PRODUCT_IMAGE_EXTENSION_MIME_TYPES = new Map([
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

export function inferProductImageMimeType(file = {}) {
  const fileName = String(file?.name || '').toLowerCase()
  for (const [extension, mimeType] of PRODUCT_IMAGE_EXTENSION_MIME_TYPES) {
    if (fileName.endsWith(extension)) return mimeType
  }
  return String(file?.type || '').toLowerCase()
}

export function validateProductImageFile(file = {}) {
  const fileName = String(file?.name || '所选图片')
  const fileSize = Number(file?.size || 0)
  const mimeType = inferProductImageMimeType(file)
  if (fileSize <= 0) {
    return `${fileName} 内容为空，请重新选择`
  }
  if (fileSize > PRODUCT_IMAGE_MAX_FILE_SIZE) {
    return `${fileName} 超过 5MB，请压缩后再选择`
  }
  if (!PRODUCT_IMAGE_MIME_TYPES.has(mimeType)) {
    return `${fileName} 格式不支持，请选择 PNG、JPEG 或 WEBP 图片`
  }
  return ''
}

export function selectSavedProductImages(attachments = []) {
  const savedBySlot = { primary: null, secondary: null }
  for (const attachment of Array.isArray(attachments) ? attachments : []) {
    const slotKey = String(attachment?.slot_key || '')
    if (
      attachment?.attachment_type !== 'product_image' ||
      !PRODUCT_IMAGE_SLOT_KEYS.has(slotKey) ||
      savedBySlot[slotKey]
    ) {
      continue
    }
    savedBySlot[slotKey] = attachment
  }
  return savedBySlot
}

export function createProductImageSession(savedBySlot = {}) {
  const saved = {
    primary: savedBySlot?.primary || null,
    secondary: savedBySlot?.secondary || null,
  }
  return {
    saved,
    slots: {
      primary: { saved: saved.primary, pending: null, cleared: false },
      secondary: { saved: saved.secondary, pending: null, cleared: false },
    },
  }
}

export function stageProductImageSelection(session, slotKey, pending) {
  if (!PRODUCT_IMAGE_SLOT_KEYS.has(slotKey)) return session
  return {
    ...session,
    slots: {
      ...session.slots,
      [slotKey]: {
        saved: session.saved[slotKey],
        pending,
        cleared: false,
      },
    },
  }
}

export function stageProductImageClear(session, slotKey) {
  if (!PRODUCT_IMAGE_SLOT_KEYS.has(slotKey)) return session
  return {
    ...session,
    slots: {
      ...session.slots,
      [slotKey]: {
        saved: session.saved[slotKey],
        pending: null,
        cleared: Boolean(session.saved[slotKey]),
      },
    },
  }
}

export function resetProductImageSession(session) {
  return createProductImageSession(session?.saved)
}

export function buildProductImageMutationPlan(session) {
  const plan = []
  for (const { key: slotKey } of PRODUCT_IMAGE_SLOT_DEFINITIONS) {
    const slot = session?.slots?.[slotKey]
    if (slot?.pending) {
      plan.push({ type: 'upload', slotKey, image: slot.pending })
    } else if (slot?.cleared && slot?.saved) {
      plan.push({ type: 'clear', slotKey })
    }
  }
  return plan
}
