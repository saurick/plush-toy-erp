const PRINT_APPENDIX_IMAGE_DATA_URL_PREFIX = 'data:image/'
const PRINT_APPENDIX_IMAGE_MAX_WIDTH = 1600
const PRINT_APPENDIX_IMAGE_JPEG_QUALITY = 0.9
const PRINT_APPENDIX_IMAGE_AUTO_FULL_PORTRAIT_RATIO = 1.35
const PRINT_APPENDIX_IMAGE_AUTO_FULL_LANDSCAPE_RATIO = 1.8
const PRINT_APPENDIX_IMAGE_SLICE_TRIGGER_RATIO = 1.45
const PRINT_APPENDIX_IMAGE_MAX_SLICE_RATIO = 1.25

let printAppendixImageSequence = 0

export const PRINT_APPENDIX_IMAGE_ACCEPT = 'image/*,.svg'
export const PRINT_APPENDIX_IMAGE_LAYOUT_AUTO = 'auto'
export const PRINT_APPENDIX_IMAGE_LAYOUT_HALF = 'half'
export const PRINT_APPENDIX_IMAGE_LAYOUT_FULL = 'full'
export const PRINT_APPENDIX_IMAGE_LAYOUT_MODES = [
  PRINT_APPENDIX_IMAGE_LAYOUT_AUTO,
  PRINT_APPENDIX_IMAGE_LAYOUT_HALF,
  PRINT_APPENDIX_IMAGE_LAYOUT_FULL,
]

const toText = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .trim()

const toPositiveInteger = (value) => {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0
}

const isImageDataURL = (value) =>
  toText(value).startsWith(PRINT_APPENDIX_IMAGE_DATA_URL_PREFIX)

const createPrintAppendixImageID = () => {
  printAppendixImageSequence += 1
  return `appendix-image-${Date.now().toString(36)}-${printAppendixImageSequence.toString(36)}`
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    if (typeof FileReader !== 'function') {
      reject(new Error('浏览器暂不支持当前图片处理能力'))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读取图片失败，请重新添加'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

function loadImageFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    if (typeof Image !== 'function') {
      reject(new Error('浏览器暂不支持当前图片处理能力'))
      return
    }
    const image = new Image()
    image.onerror = () => reject(new Error('图片无法识别，请换一张重试'))
    image.onload = () => resolve(image)
    image.src = dataURL
  })
}

export function normalizePrintAppendixImageLayoutMode(value) {
  const mode = toText(value).toLowerCase()
  return PRINT_APPENDIX_IMAGE_LAYOUT_MODES.includes(mode)
    ? mode
    : PRINT_APPENDIX_IMAGE_LAYOUT_AUTO
}

function normalizePrintAppendixImageSegment(segment = {}) {
  const dataURL = toText(segment?.dataURL)
  if (!isImageDataURL(dataURL)) {
    return null
  }
  return {
    dataURL,
    width: toPositiveInteger(segment?.width),
    height: toPositiveInteger(segment?.height),
  }
}

export function normalizePrintAppendixImage(image = {}, index = 0) {
  const normalizedSegments = (
    Array.isArray(image?.segments) ? image.segments : []
  )
    .map((segment) => normalizePrintAppendixImageSegment(segment))
    .filter(Boolean)
  let dataURL = isImageDataURL(image?.dataURL) ? toText(image.dataURL) : ''
  let segments = normalizedSegments

  if (segments.length > 1) {
    dataURL = ''
  } else if (!dataURL && segments.length === 1) {
    dataURL = segments[0].dataURL
    segments = []
  } else if (dataURL) {
    segments = []
  }

  if (!dataURL && !segments.length) {
    return null
  }

  const inferredWidth = Math.max(0, ...segments.map((segment) => segment.width))
  const inferredHeight = segments.reduce(
    (total, segment) => total + segment.height,
    0
  )

  return {
    id: toText(image?.id) || `appendix-image-${index + 1}`,
    name: toText(image?.name) || `末尾图片 ${index + 1}`,
    dataURL,
    mimeType: toText(image?.mimeType),
    width: toPositiveInteger(image?.width) || inferredWidth,
    height: toPositiveInteger(image?.height) || inferredHeight,
    layoutMode: normalizePrintAppendixImageLayoutMode(image?.layoutMode),
    segments,
  }
}

export function normalizePrintAppendixImages(images = []) {
  return (Array.isArray(images) ? images : [])
    .map((image, index) => normalizePrintAppendixImage(image, index))
    .filter(Boolean)
}

export function getPrintAppendixImageSegments(image = {}) {
  const normalized = normalizePrintAppendixImage(image)
  if (!normalized) {
    return []
  }
  if (normalized.segments.length) {
    return normalized.segments
  }
  return [
    {
      dataURL: normalized.dataURL,
      width: normalized.width,
      height: normalized.height,
    },
  ]
}

export function getPrintAppendixImagePreviewDataURL(image = {}) {
  return getPrintAppendixImageSegments(image)[0]?.dataURL || ''
}

export function resolvePrintAppendixImageLayout(image = {}) {
  const normalized = normalizePrintAppendixImage(image)
  if (!normalized) {
    return PRINT_APPENDIX_IMAGE_LAYOUT_HALF
  }
  if (normalized.layoutMode !== PRINT_APPENDIX_IMAGE_LAYOUT_AUTO) {
    return normalized.layoutMode
  }

  const width = toPositiveInteger(normalized.width)
  const height = toPositiveInteger(normalized.height)
  if (!width || !height) {
    return PRINT_APPENDIX_IMAGE_LAYOUT_HALF
  }

  const portraitRatio = height / width
  const landscapeRatio = width / height
  return portraitRatio > PRINT_APPENDIX_IMAGE_AUTO_FULL_PORTRAIT_RATIO ||
    landscapeRatio > PRINT_APPENDIX_IMAGE_AUTO_FULL_LANDSCAPE_RATIO
    ? PRINT_APPENDIX_IMAGE_LAYOUT_FULL
    : PRINT_APPENDIX_IMAGE_LAYOUT_HALF
}

export function groupPrintAppendixImageRows(images = []) {
  const normalized = normalizePrintAppendixImages(images)
  const rows = []
  let pendingHalfImages = []

  const flushHalfImages = () => {
    if (!pendingHalfImages.length) return
    rows.push({
      layout: PRINT_APPENDIX_IMAGE_LAYOUT_HALF,
      images: pendingHalfImages,
    })
    pendingHalfImages = []
  }

  for (const image of normalized) {
    const resolvedLayout = resolvePrintAppendixImageLayout(image)
    if (resolvedLayout === PRINT_APPENDIX_IMAGE_LAYOUT_FULL) {
      flushHalfImages()
      rows.push({
        layout: PRINT_APPENDIX_IMAGE_LAYOUT_FULL,
        images: [image],
      })
      continue
    }

    pendingHalfImages.push(image)
    if (pendingHalfImages.length === 2) {
      flushHalfImages()
    }
  }

  flushHalfImages()
  return rows
}

export function appendPrintAppendixImages(images = [], additions = []) {
  return [
    ...normalizePrintAppendixImages(images),
    ...normalizePrintAppendixImages(additions),
  ]
}

export function movePrintAppendixImage(images, index, direction) {
  const normalized = normalizePrintAppendixImages(images)
  const sourceIndex = Number(index)
  const offset = direction === 'backward' ? -1 : direction === 'forward' ? 1 : 0
  const targetIndex = sourceIndex + offset
  if (
    !Number.isInteger(sourceIndex) ||
    offset === 0 ||
    sourceIndex < 0 ||
    sourceIndex >= normalized.length ||
    targetIndex < 0 ||
    targetIndex >= normalized.length
  ) {
    return normalized
  }
  const next = [...normalized]
  const [moved] = next.splice(sourceIndex, 1)
  next.splice(targetIndex, 0, moved)
  return next
}

export function removePrintAppendixImage(images, index) {
  const normalized = normalizePrintAppendixImages(images)
  const targetIndex = Number(index)
  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= normalized.length
  ) {
    return normalized
  }
  return normalized.filter((_, imageIndex) => imageIndex !== targetIndex)
}

export function setPrintAppendixImageLayoutMode(images, index, layoutMode) {
  const normalized = normalizePrintAppendixImages(images)
  const targetIndex = Number(index)
  if (
    !Number.isInteger(targetIndex) ||
    targetIndex < 0 ||
    targetIndex >= normalized.length
  ) {
    return normalized
  }
  const next = [...normalized]
  next[targetIndex] = {
    ...next[targetIndex],
    layoutMode: normalizePrintAppendixImageLayoutMode(layoutMode),
  }
  return next
}

export function calculatePrintAppendixImageSlices(width, height) {
  const sourceWidth = toPositiveInteger(width)
  const sourceHeight = toPositiveInteger(height)
  if (!sourceWidth || !sourceHeight) {
    return { width: 0, height: 0, segments: [] }
  }

  const scale = Math.min(1, PRINT_APPENDIX_IMAGE_MAX_WIDTH / sourceWidth)
  const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
  const targetHeight = Math.max(1, Math.round(sourceHeight * scale))
  const shouldSlice =
    targetHeight / targetWidth > PRINT_APPENDIX_IMAGE_SLICE_TRIGGER_RATIO
  const maxSegmentHeight = Math.max(
    1,
    Math.floor(targetWidth * PRINT_APPENDIX_IMAGE_MAX_SLICE_RATIO)
  )
  const segmentCount = shouldSlice
    ? Math.max(2, Math.ceil(targetHeight / maxSegmentHeight))
    : 1
  const baseHeight = Math.floor(targetHeight / segmentCount)
  const remainder = targetHeight % segmentCount
  const segments = []
  let targetTop = 0

  for (let index = 0; index < segmentCount; index += 1) {
    const segmentHeight = baseHeight + (index < remainder ? 1 : 0)
    const nextTargetTop = targetTop + segmentHeight
    const sourceTop = targetTop / scale
    const sourceBottom =
      index === segmentCount - 1 ? sourceHeight : nextTargetTop / scale
    segments.push({
      top: targetTop,
      width: targetWidth,
      height: segmentHeight,
      sourceTop,
      sourceHeight: Math.max(0, sourceBottom - sourceTop),
    })
    targetTop = nextTargetTop
  }

  return {
    width: targetWidth,
    height: targetHeight,
    segments,
  }
}

function renderPrintAppendixImageSegment(image, geometry, segment) {
  const canvas = document.createElement('canvas')
  canvas.width = geometry.width
  canvas.height = segment.height
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('浏览器暂不支持当前图片处理能力')
  }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(
    image,
    0,
    segment.sourceTop,
    image.naturalWidth || 1,
    segment.sourceHeight,
    0,
    0,
    geometry.width,
    segment.height
  )
  return canvas.toDataURL('image/jpeg', PRINT_APPENDIX_IMAGE_JPEG_QUALITY)
}

export async function createPrintAppendixImageSnapshot(file) {
  const name = toText(file?.name)
  const fileType = toText(file?.type).toLowerCase()
  const isSVG =
    fileType === 'image/svg+xml' || name.toLowerCase().endsWith('.svg')
  if (!isSVG && !fileType.startsWith('image/')) {
    throw new Error('模板末尾只支持添加图片')
  }

  const originalDataURL = await readFileAsDataURL(file)
  const image = await loadImageFromDataURL(originalDataURL)
  const naturalWidth = toPositiveInteger(image.naturalWidth)
  const naturalHeight = toPositiveInteger(image.naturalHeight)
  if (!naturalWidth || !naturalHeight) {
    throw new Error('图片尺寸无法识别，请换一张重试')
  }

  const geometry = calculatePrintAppendixImageSlices(
    naturalWidth,
    naturalHeight
  )
  const renderedSegments = geometry.segments.map((segment) => ({
    dataURL: renderPrintAppendixImageSegment(image, geometry, segment),
    width: geometry.width,
    height: segment.height,
  }))
  const common = {
    id: createPrintAppendixImageID(),
    name,
    mimeType: 'image/jpeg',
    width: geometry.width,
    height: geometry.height,
    layoutMode: PRINT_APPENDIX_IMAGE_LAYOUT_AUTO,
  }

  if (renderedSegments.length === 1) {
    return {
      ...common,
      dataURL: renderedSegments[0].dataURL,
      segments: [],
    }
  }

  return {
    ...common,
    dataURL: '',
    segments: renderedSegments,
  }
}
