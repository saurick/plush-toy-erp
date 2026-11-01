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
        const name = item.querySelector('.app-select__reference-name')
        const code = control.parentElement?.querySelector('.app-select__reference-code')
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
            reference: name ? {
              name: { ...box(name), height: name.clientHeight, scroll: name.scrollHeight, client: name.clientWidth, scrollWidth: name.scrollWidth, lineHeight: parseFloat(getComputedStyle(name).lineHeight), whiteSpace: getComputedStyle(name).whiteSpace, text: name.textContent },
              code: code ? { ...box(code), text: code.textContent, client: code.clientWidth, scroll: code.scrollWidth, clientHeight: code.clientHeight, scrollHeight: code.scrollHeight } : null,
            } : null,
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
    if (entry.reference) {
      const { name, code } = entry.reference
      assert.equal(name.whiteSpace, 'normal', `${context}: 业务名称允许换行`)
      assert.ok(name.height >= name.lineHeight - 1 && name.scroll <= name.height + 1 && name.scrollWidth <= name.client + 1, `${context}: 名称完整显示，不截断或撑出列宽`)
      assert.ok(name.top >= entry.selector.top - 1 && name.bottom <= entry.selector.bottom + 1, `${context}: 名称在控件内`)
      assert.equal(code, null, `${context}: 详细编码保留在候选项，不在选中名称下重复`)
    } else if (entry.scrollWidth > entry.clientWidth + 1) {
      assert.equal(
        entry.title,
        entry.text,
        `${label}: 省略时仍可读取完整选中值`
      )
    }
  }
  return metrics
}
