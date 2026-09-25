import assert from 'node:assert/strict'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

export async function assertMobileSearchAffordance(locator, action) {
  const metrics = await locator.evaluate((root) => {
    const wrapper = root.querySelector('.ant-input-affix-wrapper')
    const input = root.querySelector('input')
    const clear = root.querySelector('button')
    const style = getComputedStyle(wrapper)
    return {
      height: wrapper.getBoundingClientRect().height,
      border: style.borderColor,
      borderWidth: style.borderWidth,
      background: style.backgroundColor,
      text: getComputedStyle(input).color,
      placeholder: getComputedStyle(input, '::placeholder').color,
      fontSize: getComputedStyle(input).fontSize,
      clear: clear
        ? { width: clear.offsetWidth, height: clear.offsetHeight }
        : null,
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
    }
  })
  assert(
    metrics.height >= 44 && Number.parseFloat(metrics.fontSize) >= 16,
    JSON.stringify(metrics)
  )
  assert(metrics.scrollWidth <= metrics.width + 1, JSON.stringify(metrics))
  assert(Number.parseFloat(metrics.borderWidth) >= 1)
  assert(
    getContrastRatio(parseRgb(metrics.border), parseRgb(metrics.background)) >=
      3,
    JSON.stringify(metrics)
  )
  for (const color of [metrics.text, metrics.placeholder]) {
    assert(
      getContrastRatio(parseRgb(color), parseRgb(metrics.background)) >= 4.5,
      JSON.stringify(metrics)
    )
  }
  if (metrics.clear) {
    assert(
      metrics.clear.width >= 44 && metrics.clear.height >= 44,
      JSON.stringify(metrics)
    )
  }
  if (action) {
    const height = await action.evaluate(
      (element) => element.getBoundingClientRect().height
    )
    assert(
      Math.abs(height - metrics.height) < 1,
      `搜索框与相邻操作须同高: ${metrics.height}/${height}`
    )
  }
  return metrics
}

export async function assertTabsAffordance(locator) {
  const metric = await locator.evaluate((root) => {
    const selected = root.querySelector('.ant-tabs-tab-active')
    const other = root.querySelector(
      '.ant-tabs-tab:not(.ant-tabs-tab-active):not(.ant-tabs-tab-disabled)'
    )
    const read = (tab) => {
      const style = getComputedStyle(tab)
      return {
        border: style.borderColor,
        borderWidth: parseFloat(style.borderWidth),
        background: style.backgroundColor,
        color: getComputedStyle(tab.querySelector('.ant-tabs-tab-btn')).color,
      }
    }
    return {
      selected: read(selected),
      other: read(other),
      indicatorColor: getComputedStyle(
        root.querySelector('.ant-tabs-nav-list'),
        '::before'
      ).backgroundColor,
      indicatorHeight: parseFloat(
        getComputedStyle(root.querySelector('.ant-tabs-nav-list'), '::before')
          .height
      ),
    }
  })
  assert(
    metric.indicatorHeight > 0 && metric.indicatorHeight <= 1.5,
    `页签选中线应保持纤细: ${JSON.stringify(metric)}`
  )
  assert.equal(
    metric.selected.border,
    metric.other.border,
    `同组页签必须使用同一边框色: ${JSON.stringify(metric)}`
  )
  assert.equal(
    metric.indicatorColor,
    metric.other.border,
    `页签位置线必须复用同一边框色: ${JSON.stringify(metric)}`
  )
  for (const item of [metric.selected, metric.other]) {
    assert(item.borderWidth >= 1)
    assert(
      getContrastRatio(parseRgb(item.color), parseRgb(item.background)) >= 4.5,
      JSON.stringify(metric)
    )
    assert(
      getContrastRatio(parseRgb(item.border), parseRgb(item.background)) >= 3,
      JSON.stringify(metric)
    )
  }
}

export async function assertSegmentAffordance(locator) {
  const metric = await locator.evaluate((root) => {
    const track = getComputedStyle(root)
    const indicator = getComputedStyle(
      root.querySelector('.ant-segmented-group'),
      '::before'
    )
    const selected = root.querySelector('.erp-segmented-item-selected')
    const unselected = root.querySelector(
      '.ant-segmented-item:not(.erp-segmented-item-selected):not(.ant-segmented-item-disabled)'
    )
    return {
      border: track.borderColor,
      borderWidth: parseFloat(track.borderWidth),
      background: track.backgroundColor,
      selectedBackground: indicator.backgroundColor,
      shadow: indicator.boxShadow,
      selectedText: getComputedStyle(selected).color,
      text: unselected ? getComputedStyle(unselected).color : null,
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
    }
  })
  assert(
    metric.borderWidth >= 1,
    `视图切换必须有分组边界: ${JSON.stringify(metric)}`
  )
  assert(
    getContrastRatio(parseRgb(metric.border), parseRgb(metric.background)) >= 3,
    `分组边界必须可辨认: ${JSON.stringify(metric)}`
  )
  assert(
    metric.shadow !== 'none',
    '选中态须有单线描边和位置标记，不能只靠很浅的底色'
  )
  assert.deepEqual(
    parseRgb(metric.shadow),
    parseRgb(metric.border),
    `分段控件外框与选中描边必须同色: ${JSON.stringify(metric)}`
  )
  assert(
    !metric.shadow.includes('-3px'),
    `选中态不应绘制粗底边: ${JSON.stringify(metric)}`
  )
  assert(
    getContrastRatio(
      parseRgb(metric.selectedText),
      parseRgb(metric.selectedBackground)
    ) >= 4.5,
    `选中文字对比度不足: ${JSON.stringify(metric)}`
  )
  if (metric.text) {
    assert(
      getContrastRatio(parseRgb(metric.text), parseRgb(metric.background)) >=
        4.5
    )
  }
  assert(
    metric.scrollWidth <= metric.width + 1,
    `视图切换溢出: ${JSON.stringify(metric)}`
  )
  return metric
}

export async function assertFilterAffordance(locator, minHeight = 32) {
  const metrics = await locator.evaluateAll((buttons) =>
    buttons.map((button) => {
      const style = getComputedStyle(button)
      return {
        border: style.borderColor,
        borderWidth: parseFloat(style.borderWidth),
        background: style.backgroundColor,
        text: style.color,
        selected: button.getAttribute('aria-pressed') === 'true',
        hasCheck: Boolean(button.querySelector('.erp-filter-chip__check')),
        boxShadow: style.boxShadow,
        width: button.clientWidth,
        scrollWidth: button.scrollWidth,
        height: button.getBoundingClientRect().height,
        disabled: button.disabled,
      }
    })
  )
  assert(metrics.length > 1)
  const border = metrics[0].border
  for (const metric of metrics) {
    assert(
      metric.borderWidth >= 1 && metric.height >= minHeight,
      JSON.stringify(metric)
    )
    assert.equal(
      metric.border,
      border,
      `同组筛选项必须使用同一边框色: ${JSON.stringify(metrics)}`
    )
    if (!metric.disabled) {
      assert(
        getContrastRatio(
          parseRgb(metric.border),
          parseRgb(metric.background)
        ) >= 3,
        JSON.stringify(metric)
      )
      assert(
        getContrastRatio(parseRgb(metric.text), parseRgb(metric.background)) >=
          4.5,
        JSON.stringify(metric)
      )
    }
    assert.equal(metric.hasCheck, false, '筛选按钮不应添加勾选图标')
    if (metric.selected) {
      assert.equal(
        metric.boxShadow,
        'none',
        `筛选按钮不应以叠加阴影模拟粗边框: ${JSON.stringify(metric)}`
      )
    }
    assert(
      metric.scrollWidth <= metric.width + 1,
      `筛选文字溢出: ${JSON.stringify(metric)}`
    )
  }
  return metrics
}
