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
} from './workInstructionImageAnnotations.mjs'

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
