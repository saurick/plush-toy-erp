import assert from 'node:assert/strict'
import test from 'node:test'

import {
  A4_PAGE_HEIGHT_PX,
  CONTINUED_PRINT_PAGE_MARGIN,
  DEFAULT_PRINT_PAGE_MARGIN,
  PRINT_PAGE_STYLE_ELEMENT_ID,
  applyPrintPageMargin,
  buildPrintPageStyleText,
  detectPrintContinuationFromHeight,
  resolvePrintPageMargin,
  syncPrintPageMarginForPaper,
} from './printPageMargin.mjs'

function createFakeDocument() {
  const nodes = new Map()

  return {
    head: {
      appendChild(node) {
        nodes.set(node.id, node)
        return node
      },
    },
    createElement(tagName) {
      return {
        tagName,
        id: '',
        textContent: '',
        attributes: {},
        setAttribute(name, value) {
          this.attributes[name] = value
        },
      }
    },
    getElementById(id) {
      return nodes.get(id) || null
    },
  }
}

test('printPageMargin: 默认和续页页边距口径统一收口', () => {
  assert.equal(resolvePrintPageMargin(false), DEFAULT_PRINT_PAGE_MARGIN)
  assert.equal(resolvePrintPageMargin(true), CONTINUED_PRINT_PAGE_MARGIN)
})

test('printPageMargin: 打印页样式文本输出固定 A4 与页边距', () => {
  const styleText = buildPrintPageStyleText(CONTINUED_PRINT_PAGE_MARGIN)

  assert.match(styleText, /@media print/)
  assert.match(styleText, /size: A4;/)
  assert.match(styleText, /margin: 5mm 0 5mm;/)
})

test('printPageMargin: 超过单页 A4 高度后才视为续页', () => {
  assert.equal(detectPrintContinuationFromHeight(A4_PAGE_HEIGHT_PX), false)
  assert.equal(
    detectPrintContinuationFromHeight(A4_PAGE_HEIGHT_PX + 0.5),
    false
  )
  assert.equal(detectPrintContinuationFromHeight(A4_PAGE_HEIGHT_PX + 6), true)
})

test('printPageMargin: 动态样式节点会随续页状态切换且不重复追加', () => {
  const doc = createFakeDocument()

  const firstMargin = applyPrintPageMargin(doc, true)
  const styleNode = doc.getElementById(PRINT_PAGE_STYLE_ELEMENT_ID)

  assert.equal(firstMargin, CONTINUED_PRINT_PAGE_MARGIN)
  assert.equal(Boolean(styleNode), true)
  assert.match(styleNode?.textContent || '', /margin: 5mm 0 5mm;/)
  assert.equal(styleNode?.attributes?.['data-dynamic-print-page-style'], 'true')

  const secondMargin = applyPrintPageMargin(doc, false)
  const reusedNode = doc.getElementById(PRINT_PAGE_STYLE_ELEMENT_ID)

  assert.equal(secondMargin, DEFAULT_PRINT_PAGE_MARGIN)
  assert.equal(reusedNode, styleNode)
  assert.match(reusedNode?.textContent || '', /margin: 0;/)
})

test('printPageMargin: 纸面高度跨页时会同步切换续页页边距', () => {
  const doc = createFakeDocument()
  const paperElement = {
    ownerDocument: doc,
    scrollHeight: A4_PAGE_HEIGHT_PX + 12,
    offsetHeight: A4_PAGE_HEIGHT_PX + 12,
    getBoundingClientRect() {
      return { height: A4_PAGE_HEIGHT_PX + 12 }
    },
  }

  const result = syncPrintPageMarginForPaper(paperElement)
  const styleNode = doc.getElementById(PRINT_PAGE_STYLE_ELEMENT_ID)

  assert.equal(result.hasContinuation, true)
  assert.equal(result.margin, CONTINUED_PRINT_PAGE_MARGIN)
  assert.match(styleNode?.textContent || '', /margin: 5mm 0 5mm;/)
})
