import assert from 'node:assert/strict'
import { expect } from 'playwright/test'

export async function assertBusinessMermaidGraph(diagram) {
  await expect(diagram).toHaveAttribute('data-graph-status', 'rendered')
  for (const viewer of await diagram.locator('.erp-markdown-mermaid').all()) await expect(viewer).toHaveAttribute('data-mermaid-status', 'rendered')
  const expectedNodes = Number(await diagram.getAttribute('data-flow-node-count'))
  const expectedEdges = Number(await diagram.getAttribute('data-flow-edge-count'))
  await expect(diagram.locator('[data-graph-node]')).toHaveCount(expectedNodes)
  await expect(diagram.locator('[data-graph-wire]')).toHaveCount(expectedEdges)
  const geometry = await diagram.evaluate((root) => {
    const nodes = [...root.querySelectorAll('[data-graph-node]')].map((node) => ({ key: node.dataset.graphNode, svg: node.closest('svg'), rect: node.getBoundingClientRect() }))
    const collisions = []
    for (const path of root.querySelectorAll('[data-graph-wire]')) {
      const matrix = path.getScreenCTM()
      const length = path.getTotalLength()
      for (let sample = 1; sample < 60; sample += 1) {
        const p = path.getPointAtLength(length * sample / 60).matrixTransform(matrix)
        for (const { key, svg, rect } of nodes) {
          if (svg !== path.closest('svg')) continue
          if ([path.dataset.from, path.dataset.to].includes(key)) continue
          if (p.x > rect.left + 2 && p.x < rect.right - 2 && p.y > rect.top + 2 && p.y < rect.bottom - 2) collisions.push(path.dataset.graphWire + ':' + key)
        }
      }
    }
    const viewers = [...root.querySelectorAll('.erp-markdown-mermaid')].map((node) => node.getBoundingClientRect())
    const overlappingParts = []
    for (let i = 0; i < viewers.length; i += 1) for (let j = i + 1; j < viewers.length; j += 1) {
      const a = viewers[i], b = viewers[j]
      if (Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1) overlappingParts.push([i, j])
    }
    return {
      width: root.clientWidth, scrollWidth: root.scrollWidth,
      collisions: [...new Set(collisions)],
      overlappingParts,
      invisible: nodes.filter(({ rect }) => rect.width <= 0 || rect.height <= 0).map(({ key }) => key),
      clippedLabels: [...root.querySelectorAll('foreignObject')].filter((node) => node.firstElementChild && node.firstElementChild.getBoundingClientRect().height > node.getBoundingClientRect().height + 2).map((node) => node.textContent),
      printFontPoints: [...root.querySelectorAll('[data-flow-print-part] svg text')].filter((node) => node.textContent.trim()).map((node) => parseFloat(getComputedStyle(node).fontSize) * Math.hypot(node.getScreenCTM().a, node.getScreenCTM().b) * 0.75),
    }
  })
  assert(geometry.scrollWidth <= geometry.width + 1, 'Mermaid 图不得撑宽页面')
  assert.deepEqual(geometry.invisible, [], '全部节点可见')
  assert.deepEqual(geometry.clippedLabels, [], '节点和条件文字完整')
  assert.deepEqual(geometry.collisions, [], '关系线不得穿过无关节点')
  assert.deepEqual(geometry.overlappingParts, [], '分段图之间不得重叠')
  assert(geometry.printFontPoints.every((points) => points >= 9), '纸面图中文字不得小于 9pt')
}
