import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PRINT_APPENDIX_IMAGE_LAYOUT_AUTO,
  PRINT_APPENDIX_IMAGE_LAYOUT_FULL,
  PRINT_APPENDIX_IMAGE_LAYOUT_HALF,
  appendPrintAppendixImages,
  calculatePrintAppendixImageSlices,
  getPrintAppendixImageSegments,
  groupPrintAppendixImageRows,
  movePrintAppendixImage,
  normalizePrintAppendixImageLayoutMode,
  normalizePrintAppendixImages,
  removePrintAppendixImage,
  resolvePrintAppendixImageLayout,
  setPrintAppendixImageLayoutMode,
} from './printAppendixImages.mjs'

const createDataURL = (index) =>
  `data:image/svg+xml;base64,PHN2ZyBkYXRhLWluZGV4PSI${index}Ii8+`

const createImage = (index, overrides = {}) => ({
  id: `appendix-${index + 1}`,
  name: `末尾图片 ${index + 1}`,
  dataURL: createDataURL(index),
  mimeType: 'image/svg+xml',
  width: 640,
  height: 360,
  layoutMode: PRINT_APPENDIX_IMAGE_LAYOUT_AUTO,
  ...overrides,
})

test('printAppendixImages: 末尾附图不设置业务数量上限并保持九张图片顺序', () => {
  const images = Array.from({ length: 9 }, (_, index) => createImage(index))
  const appended = appendPrintAppendixImages([], images)

  assert.equal(appended.length, 9)
  assert.deepEqual(
    appended.map((image) => image.id),
    images.map((image) => image.id)
  )
  assert.notEqual(appended, images)
})

test('printAppendixImages: 前移后移和删除按逻辑图片整体调整且不修改原数组', () => {
  const images = Array.from({ length: 9 }, (_, index) =>
    createImage(index, {
      layoutMode:
        index === 8
          ? PRINT_APPENDIX_IMAGE_LAYOUT_FULL
          : PRINT_APPENDIX_IMAGE_LAYOUT_AUTO,
    })
  )
  const originalIDs = images.map((image) => image.id)

  const movedBackward = movePrintAppendixImage(images, 8, 'backward')
  assert.deepEqual(
    movedBackward.slice(6).map((image) => image.id),
    ['appendix-7', 'appendix-9', 'appendix-8']
  )
  assert.equal(movedBackward[7].layoutMode, PRINT_APPENDIX_IMAGE_LAYOUT_FULL)

  const movedForward = movePrintAppendixImage(movedBackward, 7, 'forward')
  assert.deepEqual(
    movedForward.map((image) => image.id),
    originalIDs
  )

  const removed = removePrintAppendixImage(images, 4)
  assert.equal(removed.length, 8)
  assert.deepEqual(
    removed.map((image) => image.id),
    originalIDs.filter((id) => id !== 'appendix-5')
  )
  assert.deepEqual(
    images.map((image) => image.id),
    originalIDs
  )
})

test('printAppendixImages: 旧图片默认自动排版，非法模式回退自动并过滤非图片', () => {
  const normalized = normalizePrintAppendixImages([
    createImage(0, { layoutMode: undefined }),
    { id: 'not-an-image', dataURL: 'data:text/plain;base64,Zm9v' },
    null,
    createImage(1, { layoutMode: 'unknown' }),
  ])

  assert.deepEqual(
    normalized.map((image) => image.id),
    ['appendix-1', 'appendix-2']
  )
  assert.deepEqual(
    normalized.map((image) => image.layoutMode),
    [PRINT_APPENDIX_IMAGE_LAYOUT_AUTO, PRINT_APPENDIX_IMAGE_LAYOUT_AUTO]
  )
  assert.equal(
    normalizePrintAppendixImageLayoutMode('FULL'),
    PRINT_APPENDIX_IMAGE_LAYOUT_FULL
  )
})

test('printAppendixImages: 新长图只保留切片，避免完整图片与切片重复占用草稿', () => {
  const normalized = normalizePrintAppendixImages([
    createImage(0, {
      dataURL: createDataURL('whole'),
      width: 1000,
      height: 3000,
      segments: [
        { dataURL: createDataURL('segment-1'), width: 1000, height: 1500 },
        { dataURL: createDataURL('segment-2'), width: 1000, height: 1500 },
      ],
    }),
  ])[0]

  assert.equal(normalized.dataURL, '')
  assert.equal(normalized.segments.length, 2)
  assert.deepEqual(
    getPrintAppendixImageSegments(normalized).map((segment) => segment.height),
    [1500, 1500]
  )
})

test('printAppendixImages: 自动排版保持普通照片半宽，长图和超宽图整行', () => {
  const cases = [
    [createImage(0, { width: 1600, height: 1200 }), 'half'],
    [createImage(1, { width: 1200, height: 1600 }), 'half'],
    [createImage(2, { width: 1200, height: 1700 }), 'full'],
    [createImage(3, { width: 2400, height: 1200 }), 'full'],
    [createImage(4, { width: 0, height: 0 }), 'half'],
  ]

  for (const [image, expected] of cases) {
    assert.equal(resolvePrintAppendixImageLayout(image), expected)
  }
  assert.equal(
    resolvePrintAppendixImageLayout(
      createImage(5, {
        width: 600,
        height: 2400,
        layoutMode: PRINT_APPENDIX_IMAGE_LAYOUT_HALF,
      })
    ),
    PRINT_APPENDIX_IMAGE_LAYOUT_HALF
  )
})

test('printAppendixImages: 混排行保持顺序并在整行图片前收口未配对半宽图片', () => {
  const images = [
    createImage(0),
    createImage(1),
    createImage(2, { layoutMode: PRINT_APPENDIX_IMAGE_LAYOUT_FULL }),
    createImage(3),
    createImage(4, { layoutMode: PRINT_APPENDIX_IMAGE_LAYOUT_FULL }),
    createImage(5),
  ]
  const rows = groupPrintAppendixImageRows(images)

  assert.deepEqual(
    rows.map((row) => ({
      layout: row.layout,
      ids: row.images.map((image) => image.id),
    })),
    [
      { layout: 'half', ids: ['appendix-1', 'appendix-2'] },
      { layout: 'full', ids: ['appendix-3'] },
      { layout: 'half', ids: ['appendix-4'] },
      { layout: 'full', ids: ['appendix-5'] },
      { layout: 'half', ids: ['appendix-6'] },
    ]
  )
})

test('printAppendixImages: 手动排版只更新目标图片并保持不可变', () => {
  const images = [createImage(0), createImage(1)]
  const next = setPrintAppendixImageLayoutMode(
    images,
    1,
    PRINT_APPENDIX_IMAGE_LAYOUT_FULL
  )

  assert.notEqual(next, images)
  assert.equal(next[0].layoutMode, PRINT_APPENDIX_IMAGE_LAYOUT_AUTO)
  assert.equal(next[1].layoutMode, PRINT_APPENDIX_IMAGE_LAYOUT_FULL)
  assert.equal(images[1].layoutMode, PRINT_APPENDIX_IMAGE_LAYOUT_AUTO)
})

test('printAppendixImages: 按打印宽度缩放且超长图切片连续覆盖源图', () => {
  const normal = calculatePrintAppendixImageSlices(1600, 1200)
  assert.equal(normal.width, 1600)
  assert.equal(normal.height, 1200)
  assert.equal(normal.segments.length, 1)

  const long = calculatePrintAppendixImageSlices(4000, 10_000)
  assert.equal(long.width, 1600)
  assert.equal(long.height, 4000)
  assert.equal(long.segments.length, 2)
  assert.equal(
    long.segments.reduce((total, segment) => total + segment.height, 0),
    long.height
  )
  assert.equal(long.segments[0].top, 0)
  assert.equal(long.segments[0].sourceTop, 0)

  for (const [index, segment] of long.segments.entries()) {
    assert(segment.height > 0)
    assert(segment.height <= long.width * 1.25)
    if (index > 0) {
      const previous = long.segments[index - 1]
      assert.equal(segment.top, previous.top + previous.height)
      assert.equal(
        segment.sourceTop,
        previous.sourceTop + previous.sourceHeight
      )
    }
  }

  const last = long.segments.at(-1)
  assert.equal(last.sourceTop + last.sourceHeight, 10_000)
  assert.deepEqual(calculatePrintAppendixImageSlices(0, 100), {
    width: 0,
    height: 0,
    segments: [],
  })
})
