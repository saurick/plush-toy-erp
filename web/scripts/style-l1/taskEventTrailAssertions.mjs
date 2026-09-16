import assert from 'node:assert/strict'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

export async function assertTaskEventTrailMarkers(trail, scenarioName) {
  const metrics = await trail.evaluate((root) => {
    const items = [...root.querySelectorAll('.workflow-task-event-trail__item')]
    return {
      background: getComputedStyle(root).backgroundColor,
      items: items.map((item, index) => {
        const marker = item.querySelector('.workflow-task-event-trail__marker')
        const title = item.querySelector(
          '.workflow-task-event-trail__item-head strong'
        )
        const rect = marker.getBoundingClientRect()
        const itemRect = item.getBoundingClientRect()
        const titleRect = title.getBoundingClientRect()
        const style = getComputedStyle(marker)
        const lineHeight = parseFloat(getComputedStyle(title).lineHeight)
        const tail = getComputedStyle(item, '::after')
        const next = items[index + 1]
          ?.querySelector('.workflow-task-event-trail__marker')
          .getBoundingClientRect()
        return {
          label: title.textContent,
          width: rect.width,
          height: rect.height,
          radius: parseFloat(style.borderRadius),
          color: style.backgroundColor,
          lineHeight,
          titleCenterOffset:
            rect.y + rect.height / 2 - titleRect.y - lineHeight / 2,
          tailVisible: tail.display !== 'none',
          tailCenterOffset:
            itemRect.x +
            parseFloat(tail.left) +
            parseFloat(tail.width) / 2 -
            rect.x -
            rect.width / 2,
          tailStartGap: itemRect.y + parseFloat(tail.top) - rect.bottom,
          tailEndGap: next
            ? next.y - (itemRect.bottom - parseFloat(tail.bottom))
            : null,
        }
      }),
    }
  })
  assert(metrics.items.length > 0, `${scenarioName} 应有任务记录圆点`)
  const first = metrics.items[0]
  for (const [index, item] of metrics.items.entries()) {
    const detail = `${scenarioName}: ${JSON.stringify(item)}`
    assert(
      item.width >= 8 && item.width <= item.lineHeight * 0.75,
      `圆点应小于标题行高，避免呈现大号单选框 ${detail}`
    )
    assert(
      Math.abs(item.width - item.height) <= 1 && item.radius >= item.width / 2,
      `标记应为圆形 ${detail}`
    )
    assert(
      Math.abs(item.width - first.width) <= 1,
      `不同事件的圆点尺寸应一致 ${detail}`
    )
    assert(
      Math.abs(item.titleCenterOffset) <= 1,
      `圆点应对齐标题首行 ${detail}`
    )
    const color = parseRgb(item.color)
    const background = parseRgb(metrics.background)
    assert(
      color && background && getContrastRatio(color, background) >= 3,
      `圆点应在当前主题中清晰可见 ${detail}`
    )
    assert.equal(
      item.tailVisible,
      index < metrics.items.length - 1,
      `连接线应在最后一条结束 ${detail}`
    )
    if (item.tailVisible) {
      assert(
        Math.abs(item.tailCenterOffset) <= 1 &&
          Math.abs(item.tailStartGap) <= 1 &&
          Math.abs(item.tailEndGap) <= 1,
        `连接线应连接相邻圆点且不偏离圆心 ${detail}`
      )
    }
  }
}
