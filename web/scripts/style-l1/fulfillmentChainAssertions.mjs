import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { assertBusinessMermaidGraph } from './mermaidGraphAssertions.mjs'

export async function openFulfillmentExceptionDirectory(guide) {
  await guide.getByRole('radiogroup', { name: '流程视图', exact: true }).getByText('异常处理', { exact: true }).click()
}

export async function assertFulfillmentDetailGeometry(detail) {
  for (const viewer of await detail.locator('.erp-markdown-mermaid').all()) await expect(viewer).toHaveAttribute('data-mermaid-status', 'rendered')
  const geometry = await detail.evaluate((root) => {
    const rect = (node) => node.getBoundingClientRect()
    const overlaps = (a, b) => Math.min(a.right, b.right) > Math.max(a.left, b.left) + 1 && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top) + 1
    const collisions = []
    const inspect = (nodes, group) => {
      const boxes = [...nodes].filter((node) => rect(node).height > 0).map((node) => ({ name: node.className || node.tagName, box: rect(node) }))
      for (let i = 0; i < boxes.length; i += 1) {
        for (let j = i + 1; j < boxes.length; j += 1) {
          if (overlaps(boxes[i].box, boxes[j].box)) collisions.push(`${group}: ${boxes[i].name} / ${boxes[j].name}`)
        }
      }
    }
    inspect(root.children, 'detail blocks')
    for (const node of root.querySelectorAll('.erp-dev-fulfillment-guide__substep-heading, .erp-dev-fulfillment-guide__detail-title')) inspect(node.children, node.className)
    const viewer = root.querySelector('.erp-markdown-mermaid')
    if (viewer) inspect([viewer.querySelector('.erp-markdown-mermaid__toolbar'), viewer.querySelector('.erp-markdown-mermaid__viewport')], 'diagram')
    return {
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      collisions,
      clippedNodes: [...root.querySelectorAll('.erp-markdown-mermaid g.node foreignObject')].filter((node) => node.firstElementChild && rect(node.firstElementChild).height > rect(node).height + 2).map((node) => node.textContent),
      diagramOutside: viewer && (rect(viewer).left < rect(root).left - 1 || rect(viewer).right > rect(root).right + 1),
      clippedText: [...root.querySelectorAll('p,dt,dd,h3,summary')].filter((node) => node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1).map((node) => node.textContent),
    }
  })
  assert.deepEqual(geometry.collisions, [], '环节说明与控件不得重叠')
  assert.deepEqual(geometry.clippedText, [], '处理条件与说明不得挤出容器')
  assert.deepEqual(geometry.clippedNodes, [], '节点文字不得受外层段落行高影响而裁切')
  assert(!geometry.diagramOutside, '长流程应在画布内滚动，不能撑宽详情区域')
  assert(geometry.scrollWidth <= geometry.width + 1, '环节详情不得横向挤出页面')
}

export async function assertFulfillmentChainClickTargets(canvas) {
  await expect(canvas.locator('[data-chain-stage]')).toHaveCount(17)
  for (const stage of await canvas.locator('[data-chain-stage]').all()) {
    await stage.scrollIntoViewIfNeeded()
    const clickable = await stage.evaluate((node) => {
      const box = node.getBoundingClientRect()
      return document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('[data-chain-stage]') === node
    })
    assert(clickable, '节点名称和内部区域均可选中环节')
    await stage.click()
    await expect(stage).toHaveAttribute('aria-expanded', 'true')
  }
  for (const button of await canvas.locator('[data-stage-exception]').all()) {
    assert.equal(await button.locator('[data-chain-stage]').count(), 0, '专项分支入口与主环节选择独立')
  }
  await canvas.locator('xpath=ancestor::*[@id="task-fulfillment-guide"]').getByRole('button', { name: '收起详情', exact: true }).click()
  await expect(canvas.locator('[data-chain-stage][data-selected]')).toHaveCount(0)
}

export async function assertFulfillmentChainGeometry(canvas) {
  const printed = await canvas.evaluate((root) => Boolean(root.closest('[data-flow-print-current]')))
  if (printed) assert.equal(await canvas.locator('[data-chain-stage]').evaluateAll((nodes) => new Set(nodes.map((node) => node.dataset.chainStage)).size), 17, '分段打印保留全部 17 个正式环节')
  else await expect(canvas.locator('[data-chain-stage]')).toHaveCount(17)
  for (const diagram of await canvas.locator('[data-business-flow]').all()) await assertBusinessMermaidGraph(diagram)
  assert(await canvas.evaluate((root) => root.scrollWidth <= root.clientWidth + 1), '总链不横向挤出页面')
}
