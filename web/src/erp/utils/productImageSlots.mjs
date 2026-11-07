import { AttachmentPolicy } from '../../common/consts/attachments.generated.mjs'
import { rasterImageMimeType } from './rasterImageType.mjs'

export const PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES = 1024 * 1024
export const PRODUCT_IMAGE_SNAPSHOT_MAX_EDGE = 2560
export const PRODUCT_IMAGE_SNAPSHOT_MAX_PIXELS = 4_000_000
export const PRODUCT_IMAGE_SUPPLEMENTAL_SLOT = AttachmentPolicy.productImageSupplementalSlot
export const PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT = AttachmentPolicy.productImageSupplementalMaxCount

export const PRODUCT_IMAGE_SLOT_DEFINITIONS = Object.freeze([
  Object.freeze({ key: 'primary', label: '产品图 1（主图）' }),
  Object.freeze({ key: 'secondary', label: '产品图 2（辅图）' }),
])

const PRODUCT_IMAGE_SLOT_KEYS = new Set(
  PRODUCT_IMAGE_SLOT_DEFINITIONS.map((slot) => slot.key)
)
const PRODUCT_IMAGE_SUPPLEMENTAL_KEYS = new Set(
  Array.from({ length: PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT }, (_, index) => `${PRODUCT_IMAGE_SUPPLEMENTAL_SLOT}_${index + 1}`)
)

export const PRODUCT_IMAGE_ACCEPT = [
  ...Object.keys(AttachmentPolicy.productImageFileTypes),
  ...new Set(Object.values(AttachmentPolicy.productImageFileTypes).flat()),
].join(',')
const PRODUCT_IMAGE_EXTENSION_MIME_TYPES = new Map(
  Object.entries(AttachmentPolicy.productImageFileTypes).map(([extension, types]) => [extension, types[0]])
)

export function inferProductImageMimeType(file = {}) {
  const fileName = String(file?.name || '').trim().toLowerCase()
  for (const [extension, mimeType] of PRODUCT_IMAGE_EXTENSION_MIME_TYPES) {
    if (fileName.endsWith(extension)) return mimeType
  }
  return ''
}

export function validateProductImageFile(file = {}) {
  const fileName = String(file?.name || '所选图片')
  const fileSize = Number(file?.size || 0)
  const mimeType = inferProductImageMimeType(file)
  if (fileSize <= 0) {
    return `${fileName} 内容为空，请重新选择`
  }
  if (!mimeType) {
    return `${fileName} 格式不支持，请选择 PNG、JPEG 或 WEBP 图片`
  }
  return ''
}

export async function readProductImageMimeType(file) {
  const expected = inferProductImageMimeType(file)
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const actual = rasterImageMimeType(header)
  if (!actual) throw new Error('图片无法识别，请换一张重试')
  if (actual !== expected) throw new Error('图片实际格式与扩展名不符，请重新选择 PNG、JPEG 或 WEBP 图片')
  return actual
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

export function buildOptimizedProductImageFileName(fileName, mimeType) {
  const extension = mimeType === 'image/webp' ? '.webp' : mimeType === 'image/png' ? '.png' : ''
  if (!extension) throw new Error('产品图片快照格式无效')
  const normalized = String(fileName || '').trim()
  const baseName = normalized.replace(/\.[^.]+$/u, '') || '产品图片'
  return `${baseName}${extension}`
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

export function isSupplementalProductImage(image) {
  return image?.attachment_type === 'product_image' &&
    Number.isSafeInteger(Number(image.id)) && Number(image.id) > 0 &&
    PRODUCT_IMAGE_SUPPLEMENTAL_KEYS.has(image.slot_key)
}

export function selectSavedSupplementalProductImages(attachments = []) {
  return (Array.isArray(attachments) ? attachments : [])
    .filter(isSupplementalProductImage)
    .sort((left, right) => Number(left.id) - Number(right.id))
}

export function createProductImageSession(savedBySlot = {}, supplemental = []) {
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
    supplemental: { saved: supplemental, pending: [], removed: [], undo: null },
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
  return createProductImageSession(session?.saved, session?.supplemental?.saved)
}

export function visibleSupplementalProductImages({ supplemental }) {
  return [
    ...supplemental.saved.filter((item) => !supplemental.removed.includes(item.id)),
    ...supplemental.pending,
  ]
}

export function supplementalProductImageOverflow(session) {
  return Math.max(0, visibleSupplementalProductImages(session).length - PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT)
}

export function reconcileSupplementalProductImages(session, attachments) {
  const { supplemental } = session
  const saved = selectSavedSupplementalProductImages(attachments)
  const savedByID = new Map(saved.map((image) => [image.id, image]))
  const removed = supplemental.removed.filter((id) => savedByID.has(id))
  const visibleHashes = new Set(saved.filter((image) => !removed.includes(image.id) && image.sha256).map((image) => image.sha256))
  const pending = supplemental.pending.filter((image) => !visibleHashes.has(image.sha256))
  const oldUndo = supplemental.undo
  let undo = null
  if (oldUndo?.item.pendingKey) {
    if (!visibleHashes.has(oldUndo.item.sha256) && !pending.some((image) => image.sha256 && image.sha256 === oldUndo.item.sha256)) {
      const index = supplemental.pending.slice(0, oldUndo.index).filter((image) => pending.includes(image)).length
      undo = { ...oldUndo, index }
    }
  } else if (oldUndo && savedByID.has(oldUndo.item.id)) {
    undo = { ...oldUndo, item: savedByID.get(oldUndo.item.id) }
  }
  return { ...session, supplemental: { saved, pending, removed, undo } }
}

export function stageSupplementalProductImage(session, image) {
  const { supplemental } = session
  const visible = visibleSupplementalProductImages(session)
  const matches = (item) => Boolean(image.sha256) && item.sha256 === image.sha256
  if (visible.some(matches)) return { session, outcome: 'duplicate' }
  if (visible.length >= PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT) return { session, outcome: 'full' }

  const removed = supplemental.saved.find((item) => supplemental.removed.includes(item.id) && matches(item))
  if (removed) {
    return {
      session: { ...session, supplemental: { ...supplemental, removed: supplemental.removed.filter((id) => id !== removed.id), undo: null } },
      outcome: 'restored',
    }
  }
  return {
    session: { ...session, supplemental: { ...supplemental, pending: [...supplemental.pending, image], undo: null } },
    outcome: 'added',
  }
}

export function stageSupplementalProductImageRemoval(session, item) {
  const { supplemental } = session
  if (item.pendingKey) {
    const index = supplemental.pending.indexOf(item)
    if (index < 0) return session
    return { ...session, supplemental: { ...supplemental, pending: supplemental.pending.filter((image) => image !== item), undo: { item, index } } }
  }
  if (!supplemental.saved.includes(item) || supplemental.removed.includes(item.id)) return session
  return { ...session, supplemental: { ...supplemental, removed: [...supplemental.removed, item.id], undo: { item } } }
}

export function undoSupplementalProductImageRemoval(session) {
  const { supplemental } = session
  if (!supplemental.undo || visibleSupplementalProductImages(session).length >= PRODUCT_IMAGE_SUPPLEMENTAL_LIMIT) return session
  const { item, index } = supplemental.undo
  const pending = [...supplemental.pending]
  if (item.pendingKey) pending.splice(index, 0, item)
  return { ...session, supplemental: { ...supplemental, pending, removed: supplemental.removed.filter((id) => id !== item.id), undo: null } }
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
  for (const id of session?.supplemental?.removed || []) plan.push({ type: 'remove', id })
  for (const image of session?.supplemental?.pending || []) plan.push({ type: 'append', slotKey: PRODUCT_IMAGE_SUPPLEMENTAL_SLOT, image })
  return plan
}

export function confirmProductImageMutation(session, change, uploaded) {
  const { supplemental } = session
  if (change.type === 'remove') {
    return {
      ...session,
      supplemental: {
        ...supplemental,
        saved: supplemental.saved.filter((image) => image.id !== change.id),
        removed: supplemental.removed.filter((id) => id !== change.id),
        undo: supplemental.undo?.item.id === change.id ? null : supplemental.undo,
      },
    }
  }
  const savedImage = uploaded ? { ...uploaded, preview_url: change.image.preview_url } : null
  if (change.type === 'append') {
    return {
      ...session,
      supplemental: {
        ...supplemental,
        saved: selectSavedSupplementalProductImages([...supplemental.saved.filter((image) => image.id !== uploaded.id), savedImage]),
        pending: supplemental.pending.filter((image) => image !== change.image),
      },
    }
  }
  const { slotKey } = change
  return {
    ...session,
    saved: { ...session.saved, [slotKey]: savedImage },
    slots: { ...session.slots, [slotKey]: { saved: savedImage, pending: null, cleared: false } },
  }
}
