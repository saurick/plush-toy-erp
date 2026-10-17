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

async function readSelectionAffordance(locator) {
  await waitForFiniteAnimations(locator.page())
  const metric = await locator.evaluate((root) => {
    const group = root.matches('.erp-sliding-tab-list')
      ? root
      : root.querySelector('.ant-tabs-nav-list, .ant-segmented-group')
    const selected = group.querySelector('.ant-tabs-tab-active, .erp-segmented-item-selected, [aria-selected="true"]')
    const other = group.querySelector('.ant-tabs-tab:not(.ant-tabs-tab-active, .ant-tabs-tab-disabled), .ant-segmented-item:not(.erp-segmented-item-selected, .ant-segmented-item-disabled), [role="tab"][aria-selected="false"]:not(:disabled)')
    const read = (item) => {
      if (!item) return null
      const label = item.querySelector('.ant-tabs-tab-btn, .ant-segmented-item-label') || item
      const style = getComputedStyle(label)
      return { weight: Number(style.fontWeight), color: style.color, height: item.getBoundingClientRect().height }
    }
    const track = root.matches('.ant-segmented') ? root : group
    const style = getComputedStyle(track)
    const indicator = getComputedStyle(group, '::before')
    const colorProbe = document.createElement('span')
    colorProbe.style.position = 'absolute'
    root.append(colorProbe)
    const resolveColor = (token) => {
      colorProbe.style.color = `var(${token})`
      return getComputedStyle(colorProbe).color
    }
    const expectedSelectedText = resolveColor('--erp-control-selected-text')
    const expectedTrack = resolveColor('--erp-control-track')
    const expectedSelected = resolveColor('--erp-control-selected')
    const expectedBorder = resolveColor('--erp-control-tab-border')
    colorProbe.remove()
    let surface = track
    let background = 'rgb(255, 255, 255)'
    while (surface) {
      const value = getComputedStyle(surface).backgroundColor
      if (value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
        background = value
        break
      }
      surface = surface.parentElement
    }
    return {
      selected: read(selected),
      other: read(other),
      background,
      trackBackground: style.backgroundColor,
      trackRadius: parseFloat(style.borderRadius),
      trackBorder: style.borderColor,
      trackBorderWidths: ['Top', 'Right', 'Bottom', 'Left'].map((side) => parseFloat(style[`border${side}Width`])),
      indicatorBackground: indicator.backgroundColor,
      indicatorRadius: parseFloat(indicator.borderRadius),
      shadow: indicator.boxShadow,
      expectedSelectedText,
      expectedTrack,
      expectedSelected,
      expectedBorder,
      width: root.clientWidth,
      scrollWidth: root.scrollWidth,
    }
  })
  return metric
}

function assertSelectionText(metric, selectedBackground = metric.background, otherBackground = metric.background) {
  assert.equal(metric.selected.weight, 650, JSON.stringify(metric))
  if (metric.other) assert.equal(metric.other.weight, 500, JSON.stringify(metric))
  assert.deepEqual(parseRgb(metric.selected.color), parseRgb(metric.expectedSelectedText))
  for (const [item, background] of [[metric.selected, selectedBackground], [metric.other, otherBackground]]) {
    if (!item) continue
    assert(getContrastRatio(parseRgb(item.color), parseRgb(background)) >= 4.5, `文字对比度不足: ${JSON.stringify(metric)}`)
  }
  assert(metric.scrollWidth <= metric.width + 1, `切换控件不能撑宽容器: ${JSON.stringify(metric)}`)
}

export async function assertContentTabAffordance(locator) {
  const metric = await readSelectionAffordance(locator)
  assert.equal(metric.trackBackground, 'rgba(0, 0, 0, 0)', '内容 Tab 使用透明底')
  assert.equal(metric.indicatorBackground, 'rgba(0, 0, 0, 0)', '下划线不叠加选中底块')
  assert(metric.shadow.includes('0px -2px 0px 0px inset'), `内容 Tab 必须有 2px 下划线: ${JSON.stringify(metric)}`)
  assertSelectionText(metric)
}

export const assertTabsAffordance = assertContentTabAffordance

export async function assertSegmentAffordance(locator) {
  const metric = await readSelectionAffordance(locator)
  assert.deepEqual(parseRgb(metric.trackBackground), parseRgb(metric.expectedTrack), `分段按钮须保留底轨: ${JSON.stringify(metric)}`)
  assert.deepEqual(parseRgb(metric.indicatorBackground), parseRgb(metric.expectedSelected), `分段按钮须保留选中底块: ${JSON.stringify(metric)}`)
  assert.deepEqual(parseRgb(metric.trackBorder), parseRgb(metric.expectedBorder))
  assert.deepEqual(metric.trackBorderWidths, [1, 1, 1, 1], '分段按钮四周使用中性细边框')
  assert.equal(metric.trackRadius, 9, '分段按钮使用圆角底轨')
  assert.equal(metric.indicatorRadius, 6, '分段按钮使用圆角滑块')
  assert(metric.shadow.includes('0px 0px 0px 1px inset'), `分段按钮须保留滑块细描边: ${JSON.stringify(metric)}`)
  assertSelectionText(metric, metric.indicatorBackground, metric.trackBackground)
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
