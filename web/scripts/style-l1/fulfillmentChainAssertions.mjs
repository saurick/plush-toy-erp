import assert from 'node:assert/strict'
import { expect } from 'playwright/test'

export async function openFulfillmentExceptionDirectory(guide) {
  await guide.getByRole('radiogroup', { name: '流程视图', exact: true }).getByText('异常处理', { exact: true }).click()
}

export async function assertFulfillmentDetailGeometry(detail) {
  if (await detail.locator('.erp-markdown-mermaid').count()) await detail.locator('[data-mermaid-status="rendered"]').waitFor()
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
  const stages = await canvas.locator('[data-chain-stage]').all()
  assert.equal(stages.length, 17)
  for (const stage of stages) {
    const card = stage.locator('[data-stage-card]')
    await stage.scrollIntoViewIfNeeded()
    const target = await stage.evaluate((node) => {
      const main = node.querySelector('[data-stage-card]')
      const auxiliary = [...node.querySelectorAll('[data-stage-exception]')]
      const box = main.getBoundingClientRect()
      const misses = []
      for (const x of [6, box.width / 4, box.width / 2, box.width * 3 / 4, box.width - 6]) {
        for (const y of [6, box.height / 2, box.height - 6]) {
          const hit = document.elementFromPoint(box.left + x, box.top + y)
          if (hit?.closest('button') !== main || getComputedStyle(hit).cursor !== 'pointer') misses.push({ x, y, target: hit?.className })
        }
      }
      const hitCenter = (element) => {
        const rect = element.getBoundingClientRect()
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button')
      }
      return {
        stage: node.dataset.chainStage,
        misses,
        exceptionIndependent: auxiliary.every((button) => hitCenter(button) === button),
        exceptionOutside: auxiliary.every((button) => !main.contains(button) && button.getBoundingClientRect().top >= box.bottom + 8),
        notesClickable: [...main.querySelectorAll('small')].every((note) => hitCenter(note) === main),
      }
    })
    assert.equal(target.misses.length, 0, `${target.stage} 卡片的标题、留白和底部均可点击: ${JSON.stringify(target.misses)}`)
    assert(target.exceptionIndependent, `${target.stage} 异常入口保持独立`)
    assert(target.exceptionOutside, `${target.stage} 异常入口在主按钮边框外并留有间距`)
    assert(target.notesClickable, `${target.stage} 说明文字应进入该环节`)
    const box = await card.boundingBox()
    await card.click({ position: { x: box.width - 6, y: box.height - 6 } })
    await stage.locator('.erp-dev-chain__stage-main[aria-expanded="true"]').waitFor()
  }
  await canvas.locator('xpath=ancestor::*[@id="task-fulfillment-guide"]').getByRole('button', { name: '收起详情', exact: true }).click()
  await expect(canvas.locator('[data-stage-card][data-selected]')).toHaveCount(0)
  assert.equal(await canvas.locator('[data-stage-card][data-selected]').count(), 0)
}

export function fulfillmentWireCollisions({ boxes, paths, source, target }) {
  const collisions = new Set()
  for (const path of paths) {
    const tokens = path.d.match(/[MHV]|-?\d+(?:\.\d+)?/gu)
    let x = 0
    let y = 0
    let index = 0
    while (index < tokens.length) {
      const command = tokens[index++]
      if (command === 'M') {
        x = Number(tokens[index++])
        y = Number(tokens[index++])
        continue
      }
      const nx = command === 'H' ? Number(tokens[index++]) : x
      const ny = command === 'V' ? Number(tokens[index++]) : y
      for (const box of boxes) {
        if ([path.from || source, path.to || target].includes(box.key)) continue
        const hit = command === 'H'
          ? y > box.y + 2 && y < box.y + box.height - 2 && Math.max(Math.min(x, nx), box.x + 2) < Math.min(Math.max(x, nx), box.x + box.width - 2)
          : x > box.x + 2 && x < box.x + box.width - 2 && Math.max(Math.min(y, ny), box.y + 2) < Math.min(Math.max(y, ny), box.y + box.height - 2)
        if (hit) collisions.add(`${path.key}:${box.key}`)
      }
      x = nx
      y = ny
    }
  }
  return [...collisions]
}

export async function assertFulfillmentChainGeometry(canvas) {
  const geometry = await canvas.evaluate((root) => {
    const map = root.querySelector('.erp-dev-chain__map')
    const base = map.getBoundingClientRect()
    const stageNodes = [...root.querySelectorAll('[data-chain-stage]')]
    return {
      count: stageNodes.length,
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
      source: root.querySelector('[data-origin]')?.dataset.chainStage,
      target: root.querySelector('[data-chain-wire="exception-return"]')?.getAttribute('data-return-stage'),
      boxes: [...stageNodes.map((node) => {
        const box = node.querySelector('[data-stage-card]').getBoundingClientRect()
        return { key: node.dataset.chainStage, x: box.x - base.x, y: box.y - base.y, width: box.width, height: box.height }
      }), ...[...root.querySelectorAll('[data-stage-exception]')].map((node) => {
        const box = node.getBoundingClientRect()
        return { key: `${node.dataset.stageException}:exception`, x: box.x - base.x, y: box.y - base.y, width: box.width, height: box.height }
      })],
      paths: [...root.querySelectorAll('path[data-chain-wire]')].map((node) => ({ key: node.getAttribute('data-chain-wire'), d: node.getAttribute('d'), from: node.getAttribute('data-wire-from'), to: node.getAttribute('data-wire-to') })),
      clippedLabels: [...root.querySelectorAll('[data-cable-label]')].filter((node) => {
        const box = node.getBoundingClientRect()
        return box.left < base.left - 1 || box.right > base.right + 1 || node.scrollHeight > node.parentElement.getBoundingClientRect().height + 1
      }).map((node) => node.textContent),
    }
  })
  assert.equal(geometry.count, 17)
  assert(geometry.scrollWidth <= geometry.width + 1, '总链不横向挤出页面')
  assert.deepEqual(geometry.clippedLabels, [], '异常条件标签应完整显示')
  assert.deepEqual(fulfillmentWireCollisions(geometry), [], '阅读连线不能穿过环节或异常入口')
}
