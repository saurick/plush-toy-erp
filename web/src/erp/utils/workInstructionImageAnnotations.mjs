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
    text: toText(annotation.text),
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
  return {
    id: normalizeAnnotationID(annotation.id, index),
    type: WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement,
    text: toText(annotation.text),
    color: normalizeAnnotationColor(annotation.color, '#ef4444'),
    start: normalizePoint(annotation.start, { x: 28, y: 62 }),
    end: normalizePoint(annotation.end, { x: 72, y: 62 }),
    labelOffset: Math.max(
      -24,
      Math.min(24, Number(annotation.labelOffset) || -7)
    ),
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
      x: index % 2 === 0 ? 64 : 4,
      y: 8 + (index % 4) * 18,
      width: 30,
      height: 18,
      targets: [{ x: 50, y: 50 }],
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
  return {
    ok: true,
    annotations: [...normalized, annotation],
    selectedIndex: normalized.length,
    message:
      annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
        ? '已添加距离标注，请拖动两个端点并填写距离。'
        : '已添加说明框，可继续添加多个指向点。',
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
