import { fingerprintBusinessAttachmentFile } from './businessAttachmentFiles.mjs'
import { isUsableImageDimensions } from './imageDisplay.mjs'
import {
  PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES,
  buildOptimizedProductImageFileName,
  calculateProductImageSnapshotSize,
  readProductImageMimeType,
  shouldOptimizeProductImageSnapshot,
} from './productImageSlots.mjs'

const PRODUCT_IMAGE_SNAPSHOT_QUALITY_STEPS = [0.9, 0.78, 0.66, 0.56]
const PRODUCT_IMAGE_SNAPSHOT_SCALE_STEP = 0.78
const PRODUCT_IMAGE_SNAPSHOT_MAX_ATTEMPTS = 7

function createReferenceImageAbortError() {
  return new DOMException('图片处理已取消', 'AbortError')
}

function readFileAsBase64(file, signal) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const cleanup = () => signal?.removeEventListener('abort', handleAbort)
    const handleAbort = () => reader.abort()
    reader.onload = () => {
      cleanup()
      resolve(
        String(reader.result || '')
          .split(',')
          .pop()
      )
    }
    reader.onerror = () => {
      cleanup()
      reject(new Error('read reference image failed'))
    }
    reader.onabort = () => {
      cleanup()
      reject(createReferenceImageAbortError())
    }
    if (signal?.aborted) {
      reject(createReferenceImageAbortError())
      return
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
    reader.readAsDataURL(file)
  })
}

function loadImageFromObjectURL(objectURL, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const cleanup = () => signal?.removeEventListener('abort', handleAbort)
    const handleAbort = () => {
      cleanup()
      image.onload = null
      image.onerror = null
      image.src = ''
      reject(createReferenceImageAbortError())
    }
    image.onload = () => {
      cleanup()
      resolve(image)
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('图片无法识别，请换一张重试'))
    }
    if (signal?.aborted) {
      handleAbort()
      return
    }
    signal?.addEventListener('abort', handleAbort, { once: true })
    image.src = objectURL
  })
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('浏览器无法生成可保存的图片'))
          return
        }
        resolve(blob)
      },
      mimeType,
      quality
    )
  })
}

async function createOptimizedProductImageBlob(image, signal) {
  const snapshotSize = calculateProductImageSnapshotSize(
    image.naturalWidth,
    image.naturalHeight
  )
  let { width, height } = snapshotSize
  if (!width || !height) {
    throw new Error('图片尺寸无法识别，请换一张重试')
  }

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('浏览器暂不支持当前图片处理能力')
  }

  let encoding = 'image/webp'
  try {
    for (
      let attempt = 0;
      attempt < PRODUCT_IMAGE_SNAPSHOT_MAX_ATTEMPTS;
      attempt += 1
    ) {
      if (signal?.aborted) throw createReferenceImageAbortError()
      canvas.width = width
      canvas.height = height
      context.clearRect(0, 0, width, height)
      context.drawImage(image, 0, 0, width, height)

      const qualities = encoding === 'image/webp' ? PRODUCT_IMAGE_SNAPSHOT_QUALITY_STEPS : [undefined]
      for (const quality of qualities) {
        if (signal?.aborted) throw createReferenceImageAbortError()
        const blob = await canvasToBlob(canvas, encoding, quality)
        if (signal?.aborted) throw createReferenceImageAbortError()
        // Canvas returns PNG when it cannot encode WebP. Keep transparency and
        // use the same size budget; only shrink further if lossless PNG needs it.
        if (encoding === 'image/webp' && blob.type === 'image/png') encoding = 'image/png'
        if (blob.type !== encoding || !blob.size) {
          throw new Error('浏览器无法生成可保存的图片')
        }
        if (blob.size <= PRODUCT_IMAGE_SNAPSHOT_MAX_BYTES) {
          return blob
        }
        if (encoding === 'image/png') break
      }

      width = Math.max(1, Math.floor(width * PRODUCT_IMAGE_SNAPSHOT_SCALE_STEP))
      height = Math.max(
        1,
        Math.floor(height * PRODUCT_IMAGE_SNAPSHOT_SCALE_STEP)
      )
    }

    throw new Error('图片内容过于复杂，浏览器无法生成适合保存的清晰版本')
  } finally {
    canvas.width = 1
    canvas.height = 1
  }
}

export async function prepareBusinessReferenceImage(file, signal, includeFingerprint = false) {
  const sourceMimeType = await readProductImageMimeType(file)
  if (signal?.aborted) throw createReferenceImageAbortError()
  const sourcePreviewURL = URL.createObjectURL(file)
  let image = null
  try {
    image = await loadImageFromObjectURL(sourcePreviewURL, signal)
    if (!isUsableImageDimensions(image)) {
      throw new Error('图片尺寸过小，请选择可辨认的图片')
    }
    const shouldOptimize = shouldOptimizeProductImageSnapshot({
      fileSize: file.size,
      width: image.naturalWidth,
      height: image.naturalHeight,
    })
    const snapshot = shouldOptimize ? await createOptimizedProductImageBlob(image, signal) : file
    const mimeType = shouldOptimize ? snapshot.type : sourceMimeType
    // Compare the bytes sent to the server, including after optimization.
    const fingerprint = includeFingerprint ? await fingerprintBusinessAttachmentFile(snapshot) : ''
    const contentBase64 = await readFileAsBase64(snapshot, signal)
    return {
      file_name: shouldOptimize ? buildOptimizedProductImageFileName(file.name, mimeType) : file.name,
      mime_type: mimeType,
      file_size: snapshot.size,
      content_base64: contentBase64,
      preview_url: `data:${mimeType};base64,${contentBase64}`,
      optimized: shouldOptimize,
      ...(shouldOptimize ? { source_file_size: file.size } : {}),
      ...(fingerprint ? { sha256: fingerprint } : {}),
    }
  } finally {
    if (image) image.src = ''
    URL.revokeObjectURL(sourcePreviewURL)
  }
}
