import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

export async function assertMobileSearchAffordance(locator, action) {
  await waitForFiniteAnimations(locator.page())
  const metrics = await locator.evaluate((root) => {
    const wrapper = root.querySelector('.ant-input-affix-wrapper')
    const input = root.querySelector('input')
    const clear = root.querySelector('button')
    const style = getComputedStyle(wrapper)
    return {
      height: wrapper.getBoundingClientRect().height,
      border: style.borderColor,
      focused: wrapper.matches(':focus-within'),
      expectedBorder: style
        .getPropertyValue(
          wrapper.matches(':focus-within')
            ? '--erp-control-focus-border'
            : '--erp-control-border'
        )
        .trim(),
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
    metrics.height >= 42 && Number.parseFloat(metrics.fontSize) >= 16,
    JSON.stringify(metrics)
  )
  assert(metrics.scrollWidth <= metrics.width + 1, JSON.stringify(metrics))
  assert(Number.parseFloat(metrics.borderWidth) >= 1)
  assert.ok(
    JSON.stringify(parseRgb(metrics.border)) ===
      JSON.stringify(parseRgb(metrics.expectedBorder)),
    `搜索边界应复用当前主题的常态或焦点描边: ${JSON.stringify(metrics)}`
  )
  for (const color of [metrics.text, metrics.placeholder]) {
    assert(
      getContrastRatio(parseRgb(color), parseRgb(metrics.background)) >= 4.5,
      JSON.stringify(metrics)
    )
  }
  if (metrics.clear) {
    assert(
      metrics.clear.width >= 44 && metrics.clear.height >= 40,
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
    const track = root.querySelector('.ant-tabs-nav-list')
    const trackStyle = getComputedStyle(track)
    const indicator = getComputedStyle(track, '::before')
    const selected = root.querySelector('.ant-tabs-tab-active')
    const other = root.querySelector(
      '.ant-tabs-tab:not(.ant-tabs-tab-active):not(.ant-tabs-tab-disabled)'
    )
    const read = (tab) => {
      const style = getComputedStyle(tab)
      return {
        background: style.backgroundColor,
        height: tab.getBoundingClientRect().height,
        color: getComputedStyle(tab.querySelector('.ant-tabs-tab-btn')).color,
      }
    }
    return {
      selected: read(selected),
      other: read(other),
      border: trackStyle.borderColor,
      expectedBorder: trackStyle
        .getPropertyValue('--erp-control-tab-border')
        .trim(),
      borderWidth: parseFloat(trackStyle.borderWidth),
      background: trackStyle.backgroundColor,
      radius: trackStyle.borderRadius,
      indicatorColor: indicator.backgroundColor,
      indicatorHeight: parseFloat(indicator.height),
      shadow: indicator.boxShadow,
    }
  })
  assert(
    Math.abs(metric.indicatorHeight - metric.selected.height) < 1,
    `页签使用覆盖选项的连续滑块: ${JSON.stringify(metric)}`
  )
  assert.equal(
    metric.selected.background,
    'rgba(0, 0, 0, 0)',
    '选中底色由持久滑块绘制，不能叠加独立白底'
  )
  assert.equal(
    metric.other.background,
    'rgba(0, 0, 0, 0)',
    '未选项延续底轨背景'
  )
  assert(metric.borderWidth >= 1)
  assert.equal(metric.radius, '9px')
  assert.notEqual(metric.indicatorColor, metric.background)
  assert.ok(metric.shadow.includes('0px 0px 0px 1px inset'))
  assert.deepEqual(
    parseRgb(metric.border),
    parseRgb(metric.expectedBorder),
    `底轨使用当前主题的中性边框: ${JSON.stringify(metric)}`
  )
  for (const [item, background] of [
    [metric.selected, metric.indicatorColor],
    [metric.other, metric.background],
  ]) {
    assert(
      getContrastRatio(parseRgb(item.color), parseRgb(background)) >= 4.5,
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
      expectedBorder: track
        .getPropertyValue('--erp-control-tab-border')
        .trim(),
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
  assert.deepEqual(
    parseRgb(metric.border),
    parseRgb(metric.expectedBorder),
    `分组沿用当前主题的中性边框: ${JSON.stringify(metric)}`
  )
  assert.notEqual(
    metric.selectedBackground,
    metric.background,
    '滑块和轨道应有不同底色'
  )
  assert.ok(
    metric.shadow.includes('0px 0px 0px 1px inset'),
    '滑块与页签共用中性细描边'
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
        expectedBorder: style
          .getPropertyValue('--erp-control-tab-border')
          .trim(),
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
  const { border } = metrics[0]
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
      assert.deepEqual(
        parseRgb(metric.border),
        parseRgb(metric.expectedBorder),
        `筛选沿用当前主题的中性边框: ${JSON.stringify(metric)}`
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
