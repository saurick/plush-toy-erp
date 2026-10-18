import assert from 'node:assert/strict'

export async function assertFulfillmentChainClickTargets(canvas) {
  const stages = await canvas.locator('[data-chain-stage]').all()
  assert.equal(stages.length, 17)
  for (const stage of stages) {
    const card = stage.locator('[data-stage-card]')
    await card.scrollIntoViewIfNeeded()
    const target = await card.evaluate((node) => {
      const main = node.querySelector('.erp-dev-chain__stage-main')
      const exception = node.querySelector('.erp-dev-chain__stage-foot > button')
      const box = node.getBoundingClientRect()
      const misses = []
      for (const x of [6, box.width / 4, box.width / 2, box.width * 3 / 4, box.width - 6]) {
        for (const y of [6, box.height / 2, box.height - 6]) {
          const hit = document.elementFromPoint(box.left + x, box.top + y)
          if (![main, exception].filter(Boolean).includes(hit?.closest('button')) || getComputedStyle(hit).cursor !== 'pointer') misses.push({ x, y, target: hit?.className })
        }
      }
      const hitCenter = (element) => {
        const rect = element.getBoundingClientRect()
        return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('button')
      }
      return {
        stage: node.closest('[data-chain-stage]').dataset.chainStage,
        misses,
        exceptionIndependent: !exception || hitCenter(exception) === exception,
        notesClickable: [...node.querySelectorAll('.erp-dev-chain__stage-foot > small')].every((note) => hitCenter(note) === main),
      }
    })
    assert.equal(target.misses.length, 0, `${target.stage} 卡片的标题、留白和底部均可点击: ${JSON.stringify(target.misses)}`)
    assert(target.exceptionIndependent, `${target.stage} 异常入口保持独立`)
    assert(target.notesClickable, `${target.stage} 说明文字应进入该环节`)
    const box = await card.boundingBox()
    await card.click({ position: { x: box.width - 6, y: box.height - 6 } })
    await stage.locator('.erp-dev-chain__stage-main[aria-expanded="true"]').waitFor()
  }
  await canvas.getByRole('button', { name: '收起环节', exact: true }).click()
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
        if ([source, target].includes(box.key)) continue
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
      boxes: stageNodes.map((node) => {
        const box = node.querySelector('[data-stage-card]').getBoundingClientRect()
        return { key: node.dataset.chainStage, x: box.x - base.x, y: box.y - base.y, width: box.width, height: box.height }
      }),
      paths: [...root.querySelectorAll('path[data-chain-wire^="exception-"]')].map((node) => ({ key: node.getAttribute('data-chain-wire'), d: node.getAttribute('d') })),
      clippedLabels: [...root.querySelectorAll('[data-cable-label]')].filter((node) => {
        const box = node.getBoundingClientRect()
        return box.left < base.left - 1 || box.right > base.right + 1 || node.scrollHeight > node.parentElement.getBoundingClientRect().height + 1
      }).map((node) => node.textContent),
    }
  })
  assert.equal(geometry.count, 17)
  assert(geometry.scrollWidth <= geometry.width + 1, '总链不横向挤出页面')
  assert.deepEqual(geometry.clippedLabels, [], '异常条件标签应完整显示')
  assert.deepEqual(fulfillmentWireCollisions(geometry), [], '异常连线不能穿过其他环节')
}
