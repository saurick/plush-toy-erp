import assert from 'node:assert/strict'
import { assertReadableOnBackground } from './colorAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export async function assertGroupedSelectHierarchy(popup, label) {
  await popup.locator('.ant-select-item-group').first().waitFor({ state: 'attached' })
  await waitForFiniteAnimations(popup.page())
  const metrics = await popup.evaluate((root) => [...root.querySelectorAll('.ant-select-item-group')].flatMap((group) => {
    const option = group.nextElementSibling
    if (!option?.classList.contains('ant-select-item-option-grouped')) return []
    const content = option.querySelector('.ant-select-item-option-content')
    const text = content.querySelector('.erp-dev-flow-definition-option__label') || content
    const headingStyle = getComputedStyle(group)
    const textStyle = getComputedStyle(text)
    const headingBox = group.getBoundingClientRect()
    const contentBox = content.getBoundingClientRect()
    return [{
      title: group.textContent.trim(),
      indent: contentBox.left - headingBox.left - parseFloat(headingStyle.paddingLeft),
      color: headingStyle.color,
      background: headingStyle.backgroundColor,
      textColor: textStyle.color,
      fontSize: parseFloat(headingStyle.fontSize),
      textFontSize: parseFloat(textStyle.fontSize),
      fontWeight: headingStyle.fontWeight,
      cursor: headingStyle.cursor,
      selectable: group.getAttribute('role') === 'option' || group.tabIndex >= 0,
      width: group.clientWidth,
      scrollWidth: group.scrollWidth,
      optionHeight: option.getBoundingClientRect().height,
      optionDivider: getComputedStyle(option).boxShadow,
    }]
  }))
  assert(metrics.length > 0, `${label}: 至少核对一个标题和所属选项`)
  for (const item of metrics) {
    const context = `${label}: ${JSON.stringify(item)}`
    assert(item.indent >= 12 && item.indent <= 24, `${context}: 选项必须明显从属于标题`)
    assert.equal(item.fontWeight, '500', context)
    assert(item.fontSize >= item.textFontSize, `${context}: 分类标题保持可读字号`)
    assert.notEqual(item.color, item.textColor, context)
    assert.notEqual(item.background, 'rgba(0, 0, 0, 0)', context)
    assert.equal(item.cursor, 'default', context)
    assert.equal(item.selectable, false, context)
    assert(item.scrollWidth <= item.width + 1, context)
    assert(item.optionHeight >= 36, context)
    assert.equal(item.optionDivider, 'none', `${context}: 组内不重复逐项分隔`)
    assertReadableOnBackground(item.color, item.background, `${label}/${item.title}`)
  }
  return metrics
}
