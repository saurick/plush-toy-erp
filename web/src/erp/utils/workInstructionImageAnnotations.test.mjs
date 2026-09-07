import assert from 'node:assert/strict'
import test from 'node:test'

import {
  WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS,
  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES,
  addWorkInstructionCalloutTarget,
  appendWorkInstructionImageAnnotation,
  normalizeWorkInstructionImageAnnotations,
  removeLastWorkInstructionCalloutTarget,
  removeWorkInstructionImageAnnotation,
  replaceWorkInstructionImageAnnotation,
  deleteWorkInstructionImageAnnotations,
  restoreWorkInstructionImageAnnotations,
  resolveWorkInstructionAnnotationLayout,
  getWorkInstructionMeasurementLabelPosition,
} from './workInstructionImageAnnotations.mjs'

test('距离文字的位置允许零值，异常和越界输入仍受约束', () => {
  const normalized = (labelOffset) =>
    normalizeWorkInstructionImageAnnotations([
      { type: 'measurement', labelOffset },
    ])[0].labelOffset
  assert.equal(normalized(0), 0)
  assert.equal(normalized(-9), -9)
  assert.equal(normalized(undefined), -7)
  assert.equal(normalized('invalid'), -7)
  assert.equal(normalized(100), 24)
})

test('距离文字在横线、竖线、斜线及边缘保留间距，不被画布裁掉', () => {
  const segments = [
    [
      { x: 20, y: 50 },
      { x: 80, y: 50 },
    ],
    [
      { x: 50, y: 20 },
      { x: 50, y: 80 },
    ],
    [
      { x: 10, y: 15 },
      { x: 85, y: 80 },
    ],
    [
      { x: 85, y: 15 },
      { x: 10, y: 80 },
    ],
    [
      { x: 10, y: 1 },
      { x: 90, y: 1 },
    ],
    [
      { x: 10, y: 99 },
      { x: 90, y: 99 },
    ],
    [
      { x: 1, y: 10 },
      { x: 1, y: 90 },
    ],
    [
      { x: 99, y: 10 },
      { x: 99, y: 90 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ],
    [
      { x: 99, y: 99 },
      { x: 100, y: 100 },
    ],
  ]
  for (const canvas of [
    { width: 752, height: 435 },
    { width: 300, height: 255 },
  ]) {
    for (const label of [
      { width: canvas.width * 0.08, height: canvas.width * 0.05 },
      { width: canvas.width * 0.42, height: canvas.width * 0.12 },
    ]) {
      for (const [start, end] of segments) {
        for (const labelOffset of [-24, -7, 0, 7, 24]) {
          const position = getWorkInstructionMeasurementLabelPosition(
            { start, end, labelOffset },
            canvas,
            label
          )
          const center = {
            x: (position.x * canvas.width) / 100,
            y: (position.y * canvas.height) / 100,
          }
          const dx = ((end.x - start.x) * canvas.width) / 100
          const dy = ((end.y - start.y) * canvas.height) / 100
          const length = Math.hypot(dx, dy)
          const normal = { x: -dy / length, y: dx / length }
          const centerDistance = Math.abs(
            (center.x - (start.x * canvas.width) / 100) * normal.x +
              (center.y - (start.y * canvas.height) / 100) * normal.y
          )
          const textExtent =
            (Math.abs(normal.x) * label.width) / 2 +
            (Math.abs(normal.y) * label.height) / 2
          assert(
            centerDistance - textExtent >= canvas.width * 0.008 - 0.01,
            `文字必须完全离开线段：${JSON.stringify({ start, end, canvas, label, labelOffset, position })}`
          )
          assert(center.x - label.width / 2 >= -0.01)
          assert(center.x + label.width / 2 <= canvas.width + 0.01)
          assert(center.y - label.height / 2 >= -0.01)
          assert(center.y + label.height / 2 <= canvas.height + 0.01)
        }
      }
    }
  }
})

test('距离的两端重合时，文字位置仍有限且可调整到上下两侧', () => {
  const input = {
    start: { x: 50, y: 50 },
    end: { x: 50, y: 50 },
    labelOffset: -7,
  }
  const canvas = { width: 600, height: 350 }
  const label = { width: 60, height: 30 }
  const above = getWorkInstructionMeasurementLabelPosition(input, canvas, label)
  const below = getWorkInstructionMeasurementLabelPosition(
    { ...input, labelOffset: 7 },
    canvas,
    label
  )
  assert.equal(above.x, 50)
  assert(above.y < 50)
  assert(below.y > 50)
})

test('说明框使用右侧空位，删除后新增可复用空位且不覆盖其他框', () => {
  let annotations = []
  for (let index = 0; index < 3; index += 1) {
    annotations = appendWorkInstructionImageAnnotation(
      annotations,
      'callout'
    ).annotations
  }
  assert(annotations.every((item) => item.x === 64))
  assert(annotations[1].y >= annotations[0].y + annotations[0].height)
  assert(annotations[2].y >= annotations[1].y + annotations[1].height)
  const free = annotations[1]
  const removed = deleteWorkInstructionImageAnnotations(annotations, [free.id])
  const replaced = appendWorkInstructionImageAnnotation(
    removed.annotations,
    'callout'
  )
  assert.equal(replaced.annotations.at(-1).y, free.y)
})

test('按ID批量删除和撤销保留顺序与期间编辑，不影响其余标注', () => {
  const original = [0, 1, 2, 3].map((index) => ({
    id: `n-${index}`,
    type: 'callout',
    text: `说明${index}`,
    targets: [{ x: 20, y: 30 }],
  }))
  const deleted = deleteWorkInstructionImageAnnotations(original, [
    'n-0',
    'n-2',
  ])
  assert.deepEqual(
    deleted.annotations.map((item) => item.id),
    ['n-1', 'n-3']
  )
  const edited = replaceWorkInstructionImageAnnotation(
    deleted.annotations,
    0,
    (item) => ({ ...item, text: '删除之后的编辑' })
  )
  const restored = restoreWorkInstructionImageAnnotations(
    edited,
    deleted.removed
  )
  assert.equal(restored.ok, true)
  assert.deepEqual(
    restored.annotations.map((item) => item.id),
    ['n-0', 'n-1', 'n-2', 'n-3']
  )
  assert.equal(restored.annotations[1].text, '删除之后的编辑')
  assert.deepEqual(
    restoreWorkInstructionImageAnnotations(
      restored.annotations,
      deleted.removed
    ).annotations,
    restored.annotations
  )
  const full = Array.from({ length: 12 }, (_, index) => ({
    ...original[0],
    id: `full-${index}`,
  }))
  assert.equal(
    restoreWorkInstructionImageAnnotations(full, deleted.removed).ok,
    false
  )
})

test('图片的标注布局独立于增删，已有覆盖式距离坐标不会迁移', () => {
  assert.equal(resolveWorkInstructionAnnotationLayout({}), 'sidebar')
  assert.equal(
    resolveWorkInstructionAnnotationLayout({
      annotations: [{ type: 'measurement' }],
    }),
    'overlay'
  )
  assert.equal(
    resolveWorkInstructionAnnotationLayout({
      annotationLayout: 'sidebar',
      annotations: [{ type: 'measurement' }],
    }),
    'sidebar'
  )
  assert.equal(
    resolveWorkInstructionAnnotationLayout({
      annotationLayout: 'overlay',
      annotations: [{ type: 'callout' }],
    }),
    'overlay'
  )
})

test('workInstructionImageAnnotations: 说明框保留多个归一化指向点', () => {
  const created = appendWorkInstructionImageAnnotation(
    [],
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
  )
  const withSecondTarget = addWorkInstructionCalloutTarget(
    created.annotations,
    created.selectedIndex,
    { x: 115, y: -8 }
  )
  const updated = replaceWorkInstructionImageAnnotation(
    withSecondTarget,
    0,
    (annotation) => ({
      ...annotation,
      text: '眼睛和鼻子的位置按样板确认',
      x: 92,
      width: 30,
    })
  )

  assert.equal(created.ok, true)
  assert.equal(updated[0].targets.length, 2)
  assert.deepEqual(updated[0].targets[1], { x: 100, y: 0 })
  assert.equal(updated[0].x, 70)
  assert.equal(updated[0].text, '眼睛和鼻子的位置按样板确认')
  assert.equal(
    removeLastWorkInstructionCalloutTarget(updated, 0)[0].targets.length,
    1
  )
})

test('workInstructionImageAnnotations: 距离标注保存两个端点和人工距离值', () => {
  const created = appendWorkInstructionImageAnnotation(
    [],
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
  )
  const updated = replaceWorkInstructionImageAnnotation(
    created.annotations,
    0,
    (annotation) => ({
      ...annotation,
      text: '30 mm',
      start: { x: 21, y: 44 },
      end: { x: 79, y: 44 },
    })
  )

  assert.equal(
    updated[0].type,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
  )
  assert.equal(updated[0].text, '30 mm')
  assert.deepEqual(updated[0].start, { x: 21, y: 44 })
  assert.deepEqual(updated[0].end, { x: 79, y: 44 })
})

test('标注逐字输入保留词间空格和换行，不在下一次按键前截掉空格', () => {
  const created = appendWorkInstructionImageAnnotation([], 'callout')
  const changed = replaceWorkInstructionImageAnnotation(
    created.annotations,
    0,
    (item) => ({ ...item, text: 'Keep gap \n' })
  )
  assert.equal(changed[0].text, 'Keep gap \n')
})

test('workInstructionImageAnnotations: 每图标注和每框指向点都 fail closed', () => {
  let annotations = []
  for (
    let index = 0;
    index < WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage;
    index += 1
  ) {
    annotations = appendWorkInstructionImageAnnotation(
      annotations,
      WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
    ).annotations
  }
  const overLimit = appendWorkInstructionImageAnnotation(
    annotations,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
  )

  assert.equal(overLimit.ok, false)
  assert.equal(
    overLimit.annotations.length,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage
  )

  let targets = annotations
  for (
    let index = 1;
    index < WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets + 2;
    index += 1
  ) {
    targets = addWorkInstructionCalloutTarget(targets, 0, {
      x: index * 10,
      y: index * 8,
    })
  }
  assert.equal(
    targets[0].targets.length,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets
  )
})

test('workInstructionImageAnnotations: 删除说明框只移除自己的指向点', () => {
  const callout = appendWorkInstructionImageAnnotation(
    [],
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
  )
  const measurement = appendWorkInstructionImageAnnotation(
    callout.annotations,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
  )
  const remaining = removeWorkInstructionImageAnnotation(
    measurement.annotations,
    0
  )

  assert.equal(remaining.length, 1)
  assert.equal(
    remaining[0].type,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
  )
})

test('workInstructionImageAnnotations: 非法类型和超长文字不会进入打印草稿', () => {
  const normalized = normalizeWorkInstructionImageAnnotations([
    { type: 'unknown', text: 'ignored' },
    {
      type: WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout,
      text: '长'.repeat(600),
      color: 'url(javascript:bad)',
      targets: [{ x: 50, y: 50 }],
    },
  ])

  assert.equal(normalized.length, 1)
  assert.equal(
    normalized[0].text.length,
    WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.textLength
  )
  assert.equal(normalized[0].color, '#2563eb')
})
