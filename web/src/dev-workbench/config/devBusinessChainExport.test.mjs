import test from 'node:test'
import assert from 'node:assert/strict'
import { Window } from 'happy-dom'
import { businessChainPngSize, renderBusinessChainExport } from './devBusinessChainExport.mjs'

const node = (id, x, y, domain = 'sales') => ({
  id,
x,
y,
width: 176,
height: 88,
type: 'document',
domain,
icons: [],
  texts: [{ x: x + 12, y: y + 25, size: 14, width: 125, text: '订单 <规格> & 数量', weight: '600' }],
})
const nodes = [node('a', -520, -100), node('b', 920, 1600, 'purchase')]
const snapshot = {
  nodes,
lanes: [],
  edges: [{ from: 'a', to: 'b', kind: 'unknown', d: 'M -344 -56 H -300 V 1900 H 880 V 1644 H 920', title: '订单 → 采购', texts: [] }],
  bounds: [...nodes, { x: -344, y: -56, width: 1264, height: 1956 }],
}
const options = { title: '销售 & 采购 <讨论>', context: '局部 · 全部已载入节点', exportedAt: '2026/11/17 10:00:00' }
const measure = (text, size) => [...text].length * size
const parse = (svg) => new Window().document.createRange().createContextualFragment(svg)

test('导出泳道保留画布采集的领域底色和边框', () => {
  const lane = { x: -540, y: -130, width: 1700, height: 300, domain: 'sales', fill: 'rgb(233, 243, 249)', border: 'rgb(173, 208, 230)', texts: [] }
  const input = { ...snapshot, lanes: [lane], bounds: [...snapshot.bounds, lane] }
  const doc = parse(renderBusinessChainExport(input, options, measure).svg)
  const rects = [...doc.querySelectorAll('[data-export-lane="sales"] rect')]
  assert.equal(rects.length, 1)
  assert.equal(rects[0].getAttribute('fill'), lane.fill)
  assert.equal(rects[0].getAttribute('stroke'), lane.border)
})

test('完整图含负坐标、屏幕外节点与绕行线，导出不改变原排布', () => {
  const before = structuredClone(snapshot)
  const result = renderBusinessChainExport(snapshot, options, measure)
  const doc = parse(result.svg)
  assert.equal(doc.querySelectorAll('[data-export-node]').length, 2)
  assert.equal(doc.querySelector('[data-export-node="a"] rect').getAttribute('x'), '-520')
  assert.equal(doc.querySelector('[data-export-node="b"] rect').getAttribute('y'), '1600')
  assert.equal(doc.querySelector('[data-export-edge] path').getAttribute('d'), snapshot.edges[0].d)
  assert(result.width >= 1096 - (-520) + 56)
  assert(result.height > 1900 - (-100) + 56)
  assert.deepEqual(snapshot, before)
})

test('默认图例仅说明图中类型，静态输出安全保留中文和完整文本', () => {
  const result = renderBusinessChainExport(snapshot, options, measure)
  const doc = parse(result.svg)
  const text = doc.textContent
  assert(text.includes('销售 & 采购 <讨论>'))
  assert(text.includes('订单 <规格> & 数量'))
  assert(text.includes('图例'))
  assert(text.includes('操作说明（在流程探索页面使用）'))
  assert(text.includes('待核对的参考线'))
  assert(!text.includes('异常分支'))
  assert(!text.includes('品质'))
  assert.equal(doc.querySelectorAll('foreignObject, script, image, a').length, 0)
  assert.equal(doc.querySelector('[data-export-edge] path').hasAttribute('marker-end'), false)
})

test('图例和操作说明可独立关闭，图内容及坐标不变', () => {
  for (const [includeLegend, includeOperations] of [[false, true], [true, false], [false, false]]) {
    const doc = parse(renderBusinessChainExport(snapshot, { ...options, includeLegend, includeOperations }, measure).svg)
    assert.equal(doc.textContent.includes('图例'), includeLegend)
    assert.equal(doc.textContent.includes('操作说明（在流程探索页面使用）'), includeOperations)
    assert.equal(doc.querySelectorAll('[data-export-node]').length, 2)
    assert.equal(doc.querySelector('[data-export-node="a"] rect').getAttribute('x'), '-520')
  }
})

test('PNG 固定 2 倍采样，尺寸或像素预算超限时明确拒绝而非缩小', () => {
  assert.deepEqual(businessChainPngSize({ width: 2000, height: 3000 }), { width: 4000, height: 6000 })
  for (const size of [{ width: 8193, height: 100 }, { width: 100, height: 8193 }, { width: 3000, height: 3000 }]) {
    assert.throws(() => businessChainPngSize(size), /导出 SVG/u)
  }
  const large = { ...snapshot, bounds: [...snapshot.bounds, { x: 0, y: 40000, width: 100, height: 88 }] }
  assert(renderBusinessChainExport(large, options, measure).height > 40000, 'SVG 不受位图尺寸预算影响')
})
