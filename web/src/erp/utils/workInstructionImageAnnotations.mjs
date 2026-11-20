export const WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES = Object.freeze({
  callout: 'callout',
  measurement: 'measurement',
})

export const WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS = Object.freeze({
  perImage: 12,
  calloutTargets: 6,
  textLength: 500,
})

const ANNOTATION_COLORS = new Set(['#111827', '#2563eb', '#ef4444', '#ffffff'])

let annotationSequence = 0

const toText = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .trim()
    .slice(0, WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.textLength)

const annotationText = (value) =>
  String(value ?? '')
    .replaceAll('\r', '')
    .slice(0, WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.textLength)

export function clampAnnotationPercent(value, fallback = 0) {
  const numberValue = Number(value)
  const safeValue = Number.isFinite(numberValue) ? numberValue : fallback
  return Math.max(0, Math.min(100, safeValue))
}

function normalizeAnnotationColor(value, fallback) {
  const color = toText(value).toLowerCase()
  return ANNOTATION_COLORS.has(color) ? color : fallback
}

function normalizeAnnotationID(value, index = 0) {
  const normalized = toText(value).replaceAll(/[^a-zA-Z0-9_-]/gu, '')
  return normalized || `annotation-${index + 1}`
}

function normalizePoint(point = {}, fallback = {}) {
  return {
    x: clampAnnotationPercent(point?.x, fallback.x ?? 50),
    y: clampAnnotationPercent(point?.y, fallback.y ?? 50),
  }
}

function normalizeCallout(annotation, index) {
  const width = Math.max(14, Math.min(48, Number(annotation.width) || 30))
  const height = Math.max(10, Math.min(42, Number(annotation.height) || 18))
  const x = Math.min(100 - width, clampAnnotationPercent(annotation.x, 64))
  const y = Math.min(100 - height, clampAnnotationPercent(annotation.y, 10))
  const targets = (Array.isArray(annotation.targets) ? annotation.targets : [])
    .slice(0, WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets)
    .map((target) => normalizePoint(target))
  return {
    id: normalizeAnnotationID(annotation.id, index),
    type: WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout,
    text: annotationText(annotation.text),
    x,
    y,
    width,
    height,
    tone: annotation.tone === 'blue-fill' ? 'blue-fill' : 'white',
    color: normalizeAnnotationColor(annotation.color, '#2563eb'),
    targets,
  }
}

function normalizeMeasurement(annotation, index) {
  const labelOffset = Number(annotation.labelOffset ?? -7)
  return {
    id: normalizeAnnotationID(annotation.id, index),
    type: WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement,
    text: annotationText(annotation.text),
    color: normalizeAnnotationColor(annotation.color, '#ef4444'),
    start: normalizePoint(annotation.start, { x: 28, y: 62 }),
    end: normalizePoint(annotation.end, { x: 72, y: 62 }),
    labelOffset: Math.max(
      -24,
      Math.min(24, Number.isFinite(labelOffset) ? labelOffset : -7)
    ),
  }
}

export function getWorkInstructionMeasurementGeometry(annotation, canvas) {
  const dx = ((annotation.end.x - annotation.start.x) * canvas.width) / 100
  const dy = ((annotation.end.y - annotation.start.y) * canvas.height) / 100
  const length = Math.hypot(dx, dy)
  return {
    midpoint: {
      x: ((annotation.start.x + annotation.end.x) * canvas.width) / 200,
      y: ((annotation.start.y + annotation.end.y) * canvas.height) / 200,
    },
    normal: length ? { x: -dy / length, y: dx / length } : { x: 0, y: 1 },
  }
}

export function getWorkInstructionMeasurementLabelPosition(
  annotation,
  canvas,
  label
) {
  const { midpoint, normal } = getWorkInstructionMeasurementGeometry(
    annotation,
    canvas
  )
  const gap = canvas.width * 0.008
  const halfWidth = label.width / 2
  const halfHeight = label.height / 2
  const bounds = {
    left: halfWidth + gap,
    right: canvas.width - halfWidth - gap,
    top: halfHeight + gap,
    bottom: canvas.height - halfHeight - gap,
  }
  const clearance =
    Math.abs(normal.x) * halfWidth + Math.abs(normal.y) * halfHeight + gap
  const distance =
    clearance + (Math.abs(annotation.labelOffset) * canvas.height) / 100
  const clamp = (point) => ({
    x: Math.max(bounds.left, Math.min(bounds.right, point.x)),
    y: Math.max(bounds.top, Math.min(bounds.bottom, point.y)),
  })
  const signedDistance = (point, side) =>
    side *
    ((point.x - midpoint.x) * normal.x + (point.y - midpoint.y) * normal.y)
  const preferredSide = annotation.labelOffset > 0 ? 1 : -1
  for (const side of [preferredSide, -preferredSide]) {
    const desired = {
      x: midpoint.x + normal.x * distance * side,
      y: midpoint.y + normal.y * distance * side,
    }
    const constrained = clamp(desired)
    let point = constrained
    if (signedDistance(constrained, side) < clearance - 0.001) {
      // 在画布内寻找同侧空位，不能把越界文字直接压回线段上。
      const candidates = []
      const missing = clearance - signedDistance(constrained, side)
      candidates.push({
        x: constrained.x + normal.x * missing * side,
        y: constrained.y + normal.y * missing * side,
      })
      if (Math.abs(normal.y) > 0.000001) {
        for (const x of [bounds.left, bounds.right]) {
          candidates.push({
            x,
            y:
              midpoint.y +
              (clearance * side - (x - midpoint.x) * normal.x) / normal.y,
          })
        }
      }
      if (Math.abs(normal.x) > 0.000001) {
        for (const y of [bounds.top, bounds.bottom]) {
          candidates.push({
            x:
              midpoint.x +
              (clearance * side - (y - midpoint.y) * normal.y) / normal.x,
            y,
          })
        }
      }
      const [candidate] = candidates
        .filter(
          (item) =>
            item.x >= bounds.left - 0.001 &&
            item.x <= bounds.right + 0.001 &&
            item.y >= bounds.top - 0.001 &&
            item.y <= bounds.bottom + 0.001
        )
        .sort(
          (a, b) =>
            Math.hypot(a.x - desired.x, a.y - desired.y) -
            Math.hypot(b.x - desired.x, b.y - desired.y)
        )
      point = candidate
    }
    if (point) {
      return {
        x: (point.x / canvas.width) * 100,
        y: (point.y / canvas.height) * 100,
      }
    }
  }
  const point = clamp(midpoint)
  return {
    x: (point.x / canvas.width) * 100,
    y: (point.y / canvas.height) * 100,
  }
}

export function normalizeWorkInstructionImageAnnotation(annotation, index = 0) {
  if (
    !annotation ||
    typeof annotation !== 'object' ||
    Array.isArray(annotation)
  ) {
    return null
  }
  if (annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement) {
    return normalizeMeasurement(annotation, index)
  }
  if (annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout) {
    return normalizeCallout(annotation, index)
  }
  return null
}

export function normalizeWorkInstructionImageAnnotations(annotations = []) {
  return (Array.isArray(annotations) ? annotations : [])
    .slice(0, WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage)
    .map(normalizeWorkInstructionImageAnnotation)
    .filter(Boolean)
}

export function resolveWorkInstructionAnnotationLayout(image = {}) {
  if (['sidebar', 'overlay'].includes(image?.annotationLayout)) {
    return image.annotationLayout
  }
  const annotations = normalizeWorkInstructionImageAnnotations(
    image?.annotations
  )
  return !annotations.length ||
    annotations.some((annotation) => annotation.type === 'callout')
    ? 'sidebar'
    : 'overlay'
}

function nextAnnotationID(type) {
  annotationSequence += 1
  return `${type}-${Date.now().toString(36)}-${annotationSequence.toString(36)}`
}

export function createWorkInstructionImageAnnotation(type, index = 0) {
  if (type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement) {
    return normalizeMeasurement(
      {
        id: nextAnnotationID('measurement'),
        type,
        text: '',
        start: { x: 28, y: 62 + (index % 3) * 8 },
        end: { x: 72, y: 62 + (index % 3) * 8 },
        labelOffset: -7,
      },
      index
    )
  }
  return normalizeCallout(
    {
      id: nextAnnotationID('callout'),
      type: WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout,
      text: '',
      x: 64,
      y: 3 + (index % 4) * 24,
      width: 30,
      height: 23,
      targets: [{ x: 31, y: 50 }],
    },
    index
  )
}

export function appendWorkInstructionImageAnnotation(annotations, type) {
  const normalized = normalizeWorkInstructionImageAnnotations(annotations)
  if (normalized.length >= WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage) {
    return {
      ok: false,
      annotations: normalized,
      message: `每张图片最多支持 ${WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage} 个标注。`,
    }
  }
  const annotation = createWorkInstructionImageAnnotation(
    type,
    normalized.length
  )
  if (annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout) {
    const callouts = normalized.filter((item) => item.type === annotation.type)
    const slots = [64, 4, 34].flatMap((x) =>
      [3, 27, 51, 75].map((y) => ({ x, y }))
    )
    const slot = slots.find(({ x, y }) =>
      callouts.every(
        (item) =>
          x + annotation.width <= item.x ||
          item.x + item.width <= x ||
          y + annotation.height <= item.y ||
          item.y + item.height <= y
      )
    )
    if (slot) Object.assign(annotation, slot)
  }
  return {
    ok: true,
    annotations: [...normalized, annotation],
    selectedIndex: normalized.length,
    message:
      annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
        ? '已添加距离标注，请拖动两个端点并填写距离。'
        : '已添加说明框，可直接输入文字。',
  }
}

export function replaceWorkInstructionImageAnnotation(
  annotations,
  annotationIndex,
  nextAnnotation
) {
  const normalized = normalizeWorkInstructionImageAnnotations(annotations)
  if (
    !Number.isInteger(annotationIndex) ||
    annotationIndex < 0 ||
    annotationIndex >= normalized.length
  ) {
    return normalized
  }
  const next = normalizeWorkInstructionImageAnnotation(
    typeof nextAnnotation === 'function'
      ? nextAnnotation(normalized[annotationIndex])
      : nextAnnotation,
    annotationIndex
  )
  if (!next) return normalized
  return normalized.map((annotation, index) =>
    index === annotationIndex ? next : annotation
  )
}

export function removeWorkInstructionImageAnnotation(
  annotations,
  annotationIndex
) {
  const normalized = normalizeWorkInstructionImageAnnotations(annotations)
  if (
    !Number.isInteger(annotationIndex) ||
    annotationIndex < 0 ||
    annotationIndex >= normalized.length
  ) {
    return normalized
  }
  return normalized.filter((_, index) => index !== annotationIndex)
}

export function deleteWorkInstructionImageAnnotations(annotations, ids) {
  const selected = new Set(ids)
  const removed = []
  const remaining = normalizeWorkInstructionImageAnnotations(
    annotations
  ).filter((annotation, index) => {
    if (!selected.has(annotation.id)) return true
    removed.push({ annotation, index })
    return false
  })
  return { annotations: remaining, removed }
}

export function restoreWorkInstructionImageAnnotations(annotations, removed) {
  const current = normalizeWorkInstructionImageAnnotations(annotations)
  const ids = new Set(current.map((annotation) => annotation.id))
  const missing = removed.filter(({ annotation }) => !ids.has(annotation.id))
  if (
    current.length + missing.length >
    WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage
  ) {
    return { ok: false, annotations: current }
  }
  for (const { annotation, index } of missing) {
    current.splice(Math.min(index, current.length), 0, annotation)
  }
  return {
    ok: true,
    annotations: normalizeWorkInstructionImageAnnotations(current),
  }
}

export function addWorkInstructionCalloutTarget(
  annotations,
  annotationIndex,
  point
) {
  return replaceWorkInstructionImageAnnotation(
    annotations,
    annotationIndex,
    (annotation) => {
      if (annotation.type !== WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout) {
        return annotation
      }
      if (
        annotation.targets.length >=
        WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets
      ) {
        return annotation
      }
      return {
        ...annotation,
        targets: [...annotation.targets, normalizePoint(point)],
      }
    }
  )
}

export function removeLastWorkInstructionCalloutTarget(
  annotations,
  annotationIndex
) {
  return replaceWorkInstructionImageAnnotation(
    annotations,
    annotationIndex,
    (annotation) =>
      annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
        ? { ...annotation, targets: annotation.targets.slice(0, -1) }
        : annotation
  )
}
