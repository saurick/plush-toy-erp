import assert from 'node:assert/strict'

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
