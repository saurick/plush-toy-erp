import assert from 'node:assert/strict'
import test from 'node:test'
import {
  layoutDocumentGuideCallouts,
  measureDocumentGuideRegion,
} from './documentGuideGeometry.mjs'

const frame = { left: 10, top: 20, width: 200, height: 400 }
const rect = (left, top, width, height) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
})

test('说明范围合并所有匹配区域，覆盖条款与签字及重复作业行', () => {
  assert.deepEqual(
    measureDocumentGuideRegion(frame, [
      rect(30, 100, 160, 40),
      rect(30, 220, 160, 80),
    ]),
    {
      left: 10,
      right: 90,
      top: 20,
      bottom: 70,
    }
  )
})

test('隐藏或缺失目标不产生标注，部分越界只标记纸面内的区域', () => {
  assert.equal(measureDocumentGuideRegion(frame, []), null)
  assert.equal(measureDocumentGuideRegion(frame, [rect(0, 0, 0, 0)]), null)
  assert.equal(
    measureDocumentGuideRegion({ ...frame, height: 0 }, [rect(20, 30, 10, 10)]),
    null
  )
  assert.equal(
    measureDocumentGuideRegion(frame, [rect(300, 500, 30, 30)]),
    null
  )
  assert.deepEqual(measureDocumentGuideRegion(frame, [rect(0, 10, 80, 80)]), {
    left: 0,
    right: 35,
    top: 0,
    bottom: 17.5,
  })
})

test('穿插的作业与注意事项分段标注，不圈入段落之间的其他内容', () => {
  const result = measureDocumentGuideRegion(
    frame,
    [rect(30, 100, 160, 40), rect(30, 140, 160, 40), rect(30, 240, 160, 40)],
    true
  )
  const expected = [
    { left: 10, right: 90, top: 20, bottom: 40 },
    { left: 10, right: 90, top: 55, bottom: 65 },
  ]
  assert.equal(result.fragments.length, expected.length)
  expected.forEach((fragment, index) =>
    Object.entries(fragment).forEach(([key, value]) =>
      assert(Math.abs(result.fragments[index][key] - value) < 1e-9)
    )
  )
  assert.equal(layoutDocumentGuideCallouts([result], 400)[0].center, 120)
})

test('窄幅 Excel 图的同侧编号保持 44px 间隔，目标中心保持原位置', () => {
  const result = layoutDocumentGuideCallouts(
    [
      { top: 20, bottom: 35, side: 'left' },
      { top: 36, bottom: 80, side: 'left' },
      { top: 4, bottom: 28, side: 'right', kind: 'point' },
    ],
    36
  )
  assert.equal(result[1].markerY - result[0].markerY, 44)
  assert.ok(result[0].markerY >= -4 && result[1].markerY <= 40)
  assert.equal(result[0].center, 9.9)
  assert.equal(result[2].markerY, result[2].center)
  assert.equal(result[2].kind, 'point')
})

test('编号按原始说明顺序对应，左右两侧分别排布并保留缺失项', () => {
  const result = layoutDocumentGuideCallouts(
    [
      { top: 70, bottom: 90 },
      null,
      { top: 0, bottom: 20 },
      { top: 10, bottom: 30, side: 'left' },
    ],
    200
  )
  assert.deepEqual(
    result.map((item) => item?.index ?? null),
    [0, null, 2, 3]
  )
  assert.equal(result[0].markerY, 160)
  assert.equal(result[2].markerY, 20)
  assert.equal(result[3].markerY, 40)
  assert.deepEqual(layoutDocumentGuideCallouts([], 200), [])
  assert.deepEqual(layoutDocumentGuideCallouts([{ top: 0, bottom: 50 }], 0), [])
})
