import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertSingleSelectValues(scope, label, minimum = 1) {
  await waitForFiniteAnimations(scope.page())
  const metrics = await scope
    .locator('.ant-select-single:visible')
    .evaluateAll((controls) =>
      controls.flatMap((control) => {
        const item = control.querySelector('.ant-select-selection-item')
        const selector = control.querySelector('.ant-select-selector')
        if (
          !item?.textContent?.trim() ||
          !selector ||
          control.classList.contains('ant-select-open')
        ) {
          return []
        }
        const box = (node) => {
          const rect = node.getBoundingClientRect()
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            height: rect.height,
          }
        }
        const style = getComputedStyle(item)
        const reader = control.querySelector('.app-select__inspect')
        return [
          {
            text: item.textContent.trim(),
            title: item.getAttribute('title'),
            whiteSpace: style.whiteSpace,
            overflow: style.overflow,
            textOverflow: style.textOverflow,
            clientWidth: item.clientWidth,
            scrollWidth: item.scrollWidth,
            clientHeight: item.clientHeight,
            scrollHeight: item.scrollHeight,
            control: box(control),
            selector: box(selector),
            item: box(item),
            appSelect: control.classList.contains('app-select'),
            reader: reader ? { ...box(reader), hidden: !!reader.closest('[aria-hidden="true"]'), label: reader.getAttribute('aria-label') } : null,
          },
        ]
      })
    )
  assert.ok(
    metrics.length >= minimum,
    `${label}: 至少检查 ${minimum} 个已选单选框，实际 ${metrics.length}`
  )
  for (const entry of metrics) {
    const context = `${label}: ${JSON.stringify(entry)}`
    assert.equal(entry.whiteSpace, 'nowrap', context)
    assert.equal(entry.overflow, 'hidden', context)
    assert.equal(entry.textOverflow, 'ellipsis', context)
    assert.ok(entry.scrollHeight <= entry.clientHeight + 1, context)
    assert.ok(
      entry.item.top >= entry.selector.top - 1 &&
        entry.item.bottom <= entry.selector.bottom + 1,
      context
    )
    assert.ok(
      entry.item.left >= entry.selector.left - 1 &&
        entry.item.right <= entry.selector.right + 1,
      context
    )
    assert.ok(
      Math.abs(entry.control.height - entry.selector.height) <= 1,
      context
    )
    assert.ok(
      Math.abs(
        (entry.item.top +
          entry.item.bottom -
          entry.selector.top -
          entry.selector.bottom) /
          2
      ) <= 1.5,
      context
    )
    if (entry.scrollWidth > entry.clientWidth + 1) {
      assert.equal(
        entry.title,
        entry.text,
        `${label}: 省略时仍可读取完整选中值`
      )
      if (entry.appSelect) {
        assert.ok(entry.reader && !entry.reader.hidden && entry.reader.label, `${context}: 省略值有可访问的完整值入口`)
        assert.ok(entry.reader.left >= entry.control.left && entry.reader.right <= entry.control.right + 1 && entry.reader.top >= entry.control.top - 1 && entry.reader.bottom <= entry.control.bottom + 1, `${context}: 阅读入口不越出控件`)
      }
    }
  }
  return metrics
}
