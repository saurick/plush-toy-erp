import assert from 'node:assert/strict'

export async function assertButtonSpacing(
  scope,
  scenarioName,
  { paddingInline = 12, contentSized = false } = {}
) {
  const metrics = await scope.locator('.ant-btn').evaluateAll((buttons) =>
    buttons
      .filter((button) => {
        const rect = button.getBoundingClientRect()
        const style = window.getComputedStyle(button)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.visibility !== 'hidden' &&
          !button.classList.contains('ant-btn-icon-only')
        )
      })
      .map((button) => {
        const rect = button.getBoundingClientRect()
        const style = window.getComputedStyle(button)
        const content = Array.from(button.children)
          .filter((child) => child.getBoundingClientRect().width > 0)
          .map((child) => {
            const box = child.getBoundingClientRect()
            const childStyle = window.getComputedStyle(child)
            return {
              left: box.left - Number.parseFloat(childStyle.marginLeft),
              right: box.right + Number.parseFloat(childStyle.marginRight),
              top: box.top,
              bottom: box.bottom,
              // 加载图标旋转会扩大 scrollWidth，文案裁切只测文字容器。
              overflow: child.matches('.ant-btn-icon')
                ? 0
                : Math.max(0, child.scrollWidth - child.clientWidth),
            }
          })
        const left = Math.min(...content.map((child) => child.left))
        const right = Math.max(...content.map((child) => child.right))
        return {
          text: String(button.textContent || '').trim(),
          width: rect.width,
          height: rect.height,
          top: rect.top,
          paddingLeft: Number.parseFloat(style.paddingLeft),
          paddingRight: Number.parseFloat(style.paddingRight),
          insetLeft:
            left - rect.left - Number.parseFloat(style.borderLeftWidth),
          insetRight:
            rect.right - right - Number.parseFloat(style.borderRightWidth),
          blockSpace: Math.min(
            Math.min(...content.map((child) => child.top)) -
              rect.top -
              Number.parseFloat(style.borderTopWidth) -
              Number.parseFloat(style.paddingTop),
            rect.bottom -
              Math.max(...content.map((child) => child.bottom)) -
              Number.parseFloat(style.borderBottomWidth) -
              Number.parseFloat(style.paddingBottom)
          ),
          contentOverflow: Math.max(
            0,
            ...content.map((child) => child.overflow)
          ),
          stableSlot: button.classList.contains('erp-business-lifecycle-slot'),
        }
      })
  )
  assert(metrics.length > 0, `${scenarioName} 应实际检查可见文字按钮`)
  for (const metric of metrics) {
    const evidence = `${scenarioName} ${JSON.stringify(metric)}`
    assert.equal(metric.paddingLeft, paddingInline, `${evidence} 左内边距`)
    assert.equal(metric.paddingRight, paddingInline, `${evidence} 右内边距`)
    assert(
      metric.insetLeft >= paddingInline - 1 &&
        metric.insetRight >= paddingInline - 1 &&
        metric.blockSpace >= -1 &&
        metric.contentOverflow <= 1,
      `${evidence} 图标和文案不得挤占留白或裁切`
    )
    if (contentSized && !metric.stableSlot) {
      assert(
        metric.insetLeft <= paddingInline + 1 &&
          metric.insetRight <= paddingInline + 1,
        `${evidence} 普通动作应按内容定宽，不能用固定宽度填充留白`
      )
    }
  }
  return metrics
}
