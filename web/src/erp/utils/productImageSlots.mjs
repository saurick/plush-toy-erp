export const PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES = 1024 * 1024
export const PRODUCT_IMAGE_SNAPSHOT_MAX_EDGE = 2560
export const PRODUCT_IMAGE_SNAPSHOT_MAX_PIXELS = 4_000_000

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
  if (!PRODUCT_IMAGE_MIME_TYPES.has(mimeType)) {
    return `${fileName} 格式不支持，请选择 PNG、JPEG 或 WEBP 图片`
  }
  return ''
}

export function calculateProductImageSnapshotSize(width, height) {
  const sourceWidth = Math.round(Number(width || 0))
  const sourceHeight = Math.round(Number(height || 0))
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: 0, height: 0, scale: 0 }
  }

  const edgeScale =
    PRODUCT_IMAGE_SNAPSHOT_MAX_EDGE / Math.max(sourceWidth, sourceHeight)
  const pixelScale = Math.sqrt(
    PRODUCT_IMAGE_SNAPSHOT_MAX_PIXELS / (sourceWidth * sourceHeight)
  )
  const scale = Math.min(1, edgeScale, pixelScale)
  return {
    width: Math.max(1, Math.floor(sourceWidth * scale)),
    height: Math.max(1, Math.floor(sourceHeight * scale)),
    scale,
  }
}

export function shouldOptimizeProductImageSnapshot({
  fileSize,
  width,
  height,
} = {}) {
  const snapshotSize = calculateProductImageSnapshotSize(width, height)
  return (
    Number(fileSize || 0) > PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES ||
    snapshotSize.width !== Math.round(Number(width || 0)) ||
    snapshotSize.height !== Math.round(Number(height || 0))
  )
}

export function buildOptimizedProductImageFileName(fileName = '') {
  const normalized = String(fileName || '').trim()
  const baseName = normalized.replace(/\.[^.]+$/u, '') || '产品图片'
  return `${baseName}.webp`
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
