import assert from 'node:assert/strict'

export async function assertAlertSiblingSpacing(container, label, expectedGap = 12) {
  const metrics = await container.evaluate((node) => {
    const children = [...node.children].filter((child) => {
      const box = child.getBoundingClientRect()
      return box.width > 0 && box.height > 0 && getComputedStyle(child).visibility !== 'hidden'
    })
    return children.flatMap((child, index) => {
      if (!child.matches('.ant-alert')) return []
      const box = child.getBoundingClientRect()
      return [{
        type: child.className,
        before: index > 0 ? box.top - children[index - 1].getBoundingClientRect().bottom : null,
        after: index < children.length - 1 ? children[index + 1].getBoundingClientRect().top - box.bottom : null,
        marginTop: getComputedStyle(child).marginTop,
        marginBottom: getComputedStyle(child).marginBottom,
      }]
    })
  })
  assert(metrics.length > 0, `${label} 应实际展示提示条`)
  for (const metric of metrics) {
    for (const side of ['before', 'after']) {
      if (metric[side] === null) continue
      assert(Math.abs(metric[side] - expectedGap) <= 1,
        `${label} 提示与相邻区块应间隔 ${expectedGap}px: ${JSON.stringify(metrics)}`)
    }
    assert.equal(metric.marginTop, '0px', `${label} 提示自身不重复提供上间距`)
    assert.equal(metric.marginBottom, '0px', `${label} 提示自身不重复提供下间距`)
  }
  return metrics
}
