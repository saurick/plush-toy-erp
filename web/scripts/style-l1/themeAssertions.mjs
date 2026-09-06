import { assertNoHorizontalOverflow } from './pageAssertions.mjs'
import assert from 'node:assert/strict'
import {
  assertReadableOnDark,
  getContrastRatio,
  hasGreenDominantInteractivePaint,
  isBluePrimaryColor,
  isDarkControlBackground,
  isDarkNeutralBorderColor,
  isLightSurfaceColor,
  isTransparentColor,
  parseRgb,
} from './colorAssertions.mjs'

async function assertERPThemeMode(
  page,
  { scenarioName, expectedMode, expectedEffectiveTheme }
) {
  const metrics = await page.evaluate(() => ({
    mode: document.documentElement.dataset.erpThemeMode || '',
    effectiveTheme: document.documentElement.dataset.erpTheme || '',
    colorScheme: document.documentElement.style.colorScheme || '',
    storedMode: window.localStorage.getItem('plush_erp_theme_mode') || '',
  }))

  assert.equal(
    metrics.mode,
    expectedMode,
    `${scenarioName} 主题模式不符合预期: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.effectiveTheme,
    expectedEffectiveTheme,
    `${scenarioName} 生效主题不符合预期: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.colorScheme,
    expectedEffectiveTheme,
    `${scenarioName} color-scheme 未同步: ${JSON.stringify(metrics)}`
  )
  assert(
    expectedMode === 'system' || metrics.storedMode === expectedMode,
    `${scenarioName} 手动主题未持久化: ${JSON.stringify(metrics)}`
  )
}

async function assertDevPageUsesGlobalThemeOnly(
  page,
  {
    scenarioName,
    selector,
    expectedMode,
    expectedEffectiveTheme,
    expectDarkContrast = false,
  }
) {
  const themeToggleMetrics = await page.evaluate((targetSelector) => {
    const root = document.querySelector(targetSelector)
    const toggles = root
      ? Array.from(
          root.querySelectorAll('.erp-theme-toggle, .erp-theme-menu-toggle')
        )
      : []
    const toggle = toggles[0]
    const rect = toggle?.getBoundingClientRect()
    const style = toggle ? window.getComputedStyle(toggle) : null
    return {
      count: toggles.length,
      inSharedNavigationActions: Boolean(
        toggle?.closest('.erp-dev-workspace-nav__actions')
      ),
      ariaLabel: toggle?.getAttribute('aria-label') || '',
      width: rect ? Number(rect.width.toFixed(1)) : 0,
      height: rect ? Number(rect.height.toFixed(1)) : 0,
      visible: Boolean(
        rect &&
          rect.width > 0 &&
          rect.height > 0 &&
          style?.display !== 'none' &&
          style?.visibility !== 'hidden'
      ),
    }
  }, selector)
  assert.equal(
    themeToggleMetrics.count,
    1,
    `${scenarioName} 开发页应只使用共享导航中的单个主题切换控件: ${JSON.stringify(themeToggleMetrics)}`
  )
  assert.equal(
    themeToggleMetrics.inSharedNavigationActions,
    true,
    `${scenarioName} 主题切换控件应位于共享导航操作区: ${JSON.stringify(themeToggleMetrics)}`
  )
  assert.match(
    themeToggleMetrics.ariaLabel,
    /^主题模式：(跟系统|浅色|暗色)$/u,
    `${scenarioName} 主题切换控件缺少当前模式可访问名称: ${JSON.stringify(themeToggleMetrics)}`
  )
  assert(
    themeToggleMetrics.visible &&
      themeToggleMetrics.width >= 40 &&
      themeToggleMetrics.height >= 40,
    `${scenarioName} 主题切换控件应保持至少 40px 的可见点击区域: ${JSON.stringify(themeToggleMetrics)}`
  )
  await assertERPThemeMode(page, {
    scenarioName,
    expectedMode,
    expectedEffectiveTheme,
  })
  if (expectDarkContrast) {
    await assertDarkThemeContrast(page, {
      scenarioName,
      selector,
    })
  }
  await assertThemeReadable(page, {
    scenarioName,
    selector,
  })
  await assertNoHorizontalOverflow(page, `${scenarioName}-theme`)
}

async function clickERPThemeOption(page, label) {
  const expectedModeByLabel = {
    跟系统: 'system',
    浅色: 'light',
    暗色: 'dark',
  }
  const expectedMode = expectedModeByLabel[label]
  const segmentedOption = page
    .locator('.erp-theme-toggle .ant-segmented-item')
    .filter({ hasText: label })
  if ((await segmentedOption.count()) > 0) {
    await segmentedOption.click()
  } else {
    const menuToggle = page.locator('.erp-theme-menu-toggle')
    assert.equal(
      await menuToggle.count(),
      1,
      `主题菜单按钮数量异常，无法切换到 ${label}`
    )
    await menuToggle.click()
    await assertNoERPThemeTooltip(page, '主题菜单打开后不应显示 tooltip')
    const menuItem = page
      .locator(
        '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item'
      )
      .filter({ hasText: label })
    await menuItem.waitFor({ state: 'visible', timeout: 10_000 })
    await menuItem.click()
    await page.keyboard.press('Escape')
    await page
      .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => {})
  }
  if (expectedMode) {
    await page.waitForFunction(
      (mode) => document.documentElement.dataset.erpThemeMode === mode,
      expectedMode
    )
  }
}

async function assertNoERPThemeTooltip(page, message) {
  const tooltip = page
    .locator('.ant-tooltip:not(.ant-tooltip-hidden)')
    .filter({ hasText: /主题/ })
  assert.equal(await tooltip.count(), 0, message)
}

async function assertThemeReadable(page, { scenarioName, selector }) {
  const metrics = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector)
    if (!target) {
      return null
    }
    const style = window.getComputedStyle(target)
    const textNode =
      target.querySelector(
        'h1, h2, h3, .ant-typography, .ant-card-head-title, .erp-mobile-strong, .erp-mobile-page-title, button, input'
      ) || target
    const textStyle = window.getComputedStyle(textNode)
    return {
      selector: targetSelector,
      backgroundColor: style.backgroundColor,
      color: textStyle.color,
      rect: target.getBoundingClientRect().toJSON(),
    }
  }, selector)

  assert(metrics, `${scenarioName} 缺少主题可读性目标: ${selector}`)
  assert(
    !isTransparentColor(metrics.backgroundColor),
    `${scenarioName} 主题目标背景透明，无法验证可读性: ${JSON.stringify(metrics)}`
  )
  const background = parseRgb(metrics.backgroundColor)
  const color = parseRgb(metrics.color)
  assert(
    background && color,
    `${scenarioName} 无法解析主题颜色: ${JSON.stringify(metrics)}`
  )
  const ratio = getContrastRatio(color, background)
  assert(
    ratio >= 3,
    `${scenarioName} 主题文字对比度不足: ${JSON.stringify({
      ...metrics,
      contrastRatio: ratio,
    })}`
  )
}

async function assertLoginSegmentedReadable(page, { scenarioName }) {
  await page.waitForTimeout(480)
  const metrics = await page.evaluate(() => {
    const segmentedControls = Array.from(
      document.querySelectorAll('.erp-login-card .ant-segmented')
    ).map((control) => {
      const style = window.getComputedStyle(control)
      const group = control.querySelector('.ant-segmented-group')
      const groupStyle = group ? window.getComputedStyle(group) : null
      const indicatorStyle = group
        ? window.getComputedStyle(group, '::before')
        : null
      const items = Array.from(
        control.querySelectorAll('.ant-segmented-item')
      ).map((item, index) => {
        const label = item.querySelector('.ant-segmented-item-label') || item
        const itemStyle = window.getComputedStyle(item)
        const labelStyle = window.getComputedStyle(label)
        const isActiveByState =
          (control.classList.contains('erp-login-segmented--left') &&
            index === 0) ||
          (control.classList.contains('erp-login-segmented--right') &&
            index === 1)
        return {
          text: label.textContent?.replace(/\s+/g, ' ').trim() || '',
          isActiveByState,
          className: item.className,
          backgroundColor: itemStyle.backgroundColor,
          color: labelStyle.color,
          itemTransitionDuration: itemStyle.transitionDuration,
          itemTransitionTimingFunction: itemStyle.transitionTimingFunction,
        }
      })
      return {
        className: control.className,
        motionDuration: style
          .getPropertyValue('--erp-login-segmented-motion-duration')
          .trim(),
        motionEasing: style
          .getPropertyValue('--erp-login-segmented-motion-easing')
          .trim(),
        transitionDuration: style.transitionDuration,
        transitionTimingFunction: style.transitionTimingFunction,
        groupPosition: groupStyle?.position || '',
        indicatorContent: indicatorStyle?.content || '',
        indicatorBackgroundColor: indicatorStyle?.backgroundColor || '',
        indicatorBoxShadow: indicatorStyle?.boxShadow || '',
        indicatorTransform: indicatorStyle?.transform || '',
        indicatorTransitionDuration: indicatorStyle?.transitionDuration || '',
        indicatorTransitionTimingFunction:
          indicatorStyle?.transitionTimingFunction || '',
        items,
      }
    })

    const visibleFormLabels = Array.from(
      document.querySelectorAll('.erp-login-card .ant-form-item-label > label')
    )
      .filter((label) => {
        const rect = label.getBoundingClientRect()
        const style = window.getComputedStyle(label)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      .map((label) => label.textContent?.replace(/\s+/g, ' ').trim() || '')

    return {
      segmentedControls,
      entrySegmentedAriaLabel:
        document
          .querySelector('.erp-login-card .ant-segmented[aria-label]')
          ?.getAttribute('aria-label') || '',
      visibleFormLabels,
    }
  })
  const parseTransitionDurationsMs = (value) =>
    String(value || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const numeric = Number.parseFloat(part)
        if (!Number.isFinite(numeric)) return 0
        return part.endsWith('ms') ? numeric : numeric * 1000
      })

  assert(
    metrics.segmentedControls.length >= 2,
    `${scenarioName} 登录页缺少主题或入口 Segmented 控件: ${JSON.stringify(metrics)}`
  )
  metrics.segmentedControls.forEach((control) => {
    const maxDuration = Math.max(
      ...parseTransitionDurationsMs(control.motionDuration)
    )
    const maxIndicatorDuration = Math.max(
      ...parseTransitionDurationsMs(control.indicatorTransitionDuration)
    )
    const activeItems = control.items.filter((item) => item.isActiveByState)
    const indicatorBackground = parseRgb(control.indicatorBackgroundColor)
    assert(
      maxDuration >= 400 &&
        control.motionEasing.includes('0.215') &&
        !control.motionEasing.includes('0.2, 0, 0, 1'),
      `${scenarioName} 登录页 Segmented 专属动效变量被全局短动效覆盖: ${JSON.stringify(
        {
          ...control,
          maxDuration,
        }
      )}`
    )
    assert(
      control.groupPosition === 'relative' &&
        control.indicatorContent !== 'none' &&
        control.indicatorContent !== 'normal' &&
        indicatorBackground &&
        maxIndicatorDuration >= 400 &&
        control.indicatorTransitionTimingFunction.includes('0.215') &&
        !control.indicatorTransitionTimingFunction.includes('0.2, 0, 0, 1'),
      `${scenarioName} 登录页 Segmented 缺少常驻滑动底板: ${JSON.stringify({
        ...control,
        maxIndicatorDuration,
      })}`
    )
    assert(
      activeItems.length === 1,
      `${scenarioName} 登录页 Segmented 当前状态没有唯一激活项: ${JSON.stringify(
        control
      )}`
    )
    activeItems.forEach((item) => {
      const color = parseRgb(item.color)
      const maxItemDuration = Math.max(
        ...parseTransitionDurationsMs(item.itemTransitionDuration)
      )
      assert(
        color,
        `${scenarioName} 无法解析登录页 Segmented 文字颜色: ${JSON.stringify(
          control
        )}`
      )
      const ratio = getContrastRatio(color, indicatorBackground)
      assert(
        ratio >= 4.5,
        `${scenarioName} 登录页 Segmented 激活项与滑块对比度不足: ${JSON.stringify(
          {
            ...item,
            indicatorBackgroundColor: control.indicatorBackgroundColor,
            contrastRatio: ratio,
          }
        )}`
      )
      assert(
        maxItemDuration >= 400 &&
          item.itemTransitionTimingFunction.includes('0.215') &&
          !item.itemTransitionTimingFunction.includes('0.2, 0, 0, 1'),
        `${scenarioName} 登录页 Segmented 文字动效被全局短动效覆盖: ${JSON.stringify(
          {
            ...item,
            maxItemDuration,
          }
        )}`
      )
    })
  })
  assert(
    metrics.segmentedControls.some((control) =>
      control.className.includes('erp-login-segmented--right')
    ) ||
      metrics.segmentedControls.some((control) =>
        control.className.includes('erp-login-segmented--left')
      ),
    `${scenarioName} 登录页 Segmented 缺少左右状态类: ${JSON.stringify(
      metrics
    )}`
  )
  assert.equal(
    metrics.entrySegmentedAriaLabel,
    '工作方式',
    `${scenarioName} 工作方式 Segmented 缺少可访问名称: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.visibleFormLabels.includes('工作方式'),
    `${scenarioName} 登录页不应显示重复的“工作方式”表单标签: ${JSON.stringify(metrics)}`
  )
}

async function assertDarkThemeContrast(
  page,
  { scenarioName, selector = 'body', minRatio = 3 }
) {
  const issues = await page.evaluate(
    ({ targetSelector, minContrastRatio }) => {
      const target = document.querySelector(targetSelector)
      if (!target) {
        return [{ reason: 'missing-target', selector: targetSelector }]
      }

      const parseColor = (value) => {
        const match = String(value || '').match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/
        )
        if (!match) return null
        const alpha = match[4] === undefined ? 1 : Number(match[4])
        if (alpha === 0) return null
        return [Number(match[1]), Number(match[2]), Number(match[3]), alpha]
      }
      const luminance = ([red, green, blue]) => {
        const values = [red, green, blue].map((value) => {
          const channel = value / 255
          return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
        })
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
      }
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background))
        const darker = Math.min(luminance(foreground), luminance(background))
        return (lighter + 0.05) / (darker + 0.05)
      }
      const compositeColor = (top, bottom) => {
        const topAlpha = top[3] ?? 1
        const bottomAlpha = bottom[3] ?? 1
        const alpha = topAlpha + bottomAlpha * (1 - topAlpha)
        if (alpha === 0) return [0, 0, 0, 0]
        return [
          (top[0] * topAlpha + bottom[0] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          (top[1] * topAlpha + bottom[1] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          (top[2] * topAlpha + bottom[2] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          alpha,
        ]
      }
      const backgroundFor = (element) => {
        const layers = []
        let current = element
        while (current && current instanceof Element) {
          const parsed = parseColor(
            window.getComputedStyle(current).backgroundColor
          )
          if (parsed) layers.push(parsed)
          current = current.parentElement
        }
        const bodyColor = parseColor(
          window.getComputedStyle(document.body).backgroundColor
        ) || [255, 255, 255, 1]
        return layers
          .reverse()
          .reduce(
            (background, layer) => compositeColor(layer, background),
            bodyColor
          )
      }
      const isVisible = (element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.05 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        )
      }
      const describe = (element) => {
        const classes =
          element.className && typeof element.className === 'string'
            ? `.${element.className.trim().split(/\s+/).slice(0, 4).join('.')}`
            : ''
        return `${element.tagName.toLowerCase()}${classes}`
      }
      const ignoredSelector = [
        '.anticon',
        '.ant-empty-img-default',
        '.ant-empty-image',
        '.ant-select-arrow',
        '.ant-table-column-sorter',
        '.erp-module-column-header-trigger',
      ].join(',')
      const visibleTextSelector =
        'a, button, label, th, td, h1, h2, h3, h4, p, span, strong, small, input, textarea, .ant-typography, .ant-tag, .ant-btn, .ant-select-selection-item, .ant-select-selection-placeholder, .ant-empty-description'
      const semanticCandidates = Array.from(
        target.querySelectorAll(visibleTextSelector)
      )
      const directTextCandidates = Array.from(
        target.querySelectorAll('*')
      ).filter((element) =>
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
        )
      )
      const candidates = Array.from(
        new Set([...semanticCandidates, ...directTextCandidates])
      )
      const failures = []
      for (const element of candidates) {
        if (!(element instanceof HTMLElement)) continue
        if (
          element.matches(ignoredSelector) ||
          element.closest(ignoredSelector)
        ) {
          continue
        }
        if (!isVisible(element)) continue
        const text =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
            ? element.placeholder || element.value || ''
            : element.textContent || ''
        const normalizedText = text.replace(/\s+/g, ' ').trim()
        if (!normalizedText) continue
        const style = window.getComputedStyle(element)
        const color = parseColor(style.color)
        const background = backgroundFor(element)
        if (!color || !background) continue
        const ratio = contrast(color, background)
        if (ratio < minContrastRatio) {
          failures.push({
            element: describe(element),
            text: normalizedText.slice(0, 80),
            color: style.color,
            backgroundColor: window.getComputedStyle(element).backgroundColor,
            effectiveBackground: `rgb(${Math.round(background[0])}, ${Math.round(
              background[1]
            )}, ${Math.round(background[2])})`,
            ratio: Number(ratio.toFixed(2)),
          })
        }
      }
      return failures.slice(0, 12)
    },
    { targetSelector: selector, minContrastRatio: minRatio }
  )

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 暗色主题存在低对比可见文本: ${JSON.stringify(issues)}`
  )
}

async function assertDarkThemeNeutralInteractions(
  page,
  { scenarioName, checks }
) {
  const interactionChecks = checks || [
    {
      label: '搜索输入 hover',
      selector: '.erp-business-filter-control--search',
      action: 'hover',
    },
    {
      label: '搜索输入 focus',
      selector: '.erp-business-filter-control--search',
      action: 'click',
    },
    {
      label: '业务状态筛选 hover',
      selector: '.erp-business-filter-control--status .ant-select-selector',
      action: 'hover',
    },
    {
      label: '日期筛选 hover',
      selector: '.erp-business-date-range-filter',
      action: 'hover',
    },
    {
      label: '普通工具按钮 hover',
      selector: '.erp-business-toolbar-button:not(.ant-btn-primary)',
      action: 'hover',
    },
    {
      label: '表头工具按钮 hover',
      selector: '.erp-module-column-header-trigger.ant-btn',
      action: 'hover',
    },
    {
      label: '表头单元格 hover',
      selector: '.erp-business-data-table-card .ant-table-thead > tr > th',
      action: 'hover',
      index: 2,
    },
  ]

  const metrics = []
  for (const check of interactionChecks) {
    const locator =
      check.index === undefined
        ? page.locator(check.selector).first()
        : page.locator(check.selector).nth(check.index)
    await locator.waitFor({ state: 'visible', timeout: 10_000 })
    if (check.action === 'click') {
      await locator.click()
    } else {
      await locator.hover()
    }
    await page.waitForTimeout(160)
    metrics.push(
      await locator.evaluate((node, label) => {
        const style = window.getComputedStyle(node)
        return {
          label,
          selector:
            node.className && typeof node.className === 'string'
              ? `${node.tagName.toLowerCase()}.${node.className
                  .trim()
                  .split(/\s+/)
                  .slice(0, 4)
                  .join('.')}`
              : node.tagName.toLowerCase(),
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderTopColor: style.borderTopColor,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
        }
      }, check.label)
    )
    if (check.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
      await page.evaluate(() => document.activeElement?.blur?.())
    }
  }

  const greenIssues = metrics.filter((metric) =>
    hasGreenDominantInteractivePaint(metric)
  )
  assert.deepEqual(
    greenIssues,
    [],
    `${scenarioName} 暗色主题交互态仍残留绿色 hover/focus 面: ${JSON.stringify(
      greenIssues
    )}`
  )
}

async function assertDarkLoadingState(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readNode = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        selector,
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
        width: rect.width,
        height: rect.height,
      }
    }
    return {
      page: readNode('.loading-page'),
      panel: readNode('.loading-page__panel'),
      title: readNode('.loading-page__title'),
      description: readNode('.loading-page__description'),
      dot: readNode('.loading-page .ant-spin-dot-item'),
    }
  })

  assert(
    metrics.page &&
      metrics.panel &&
      metrics.title &&
      metrics.description &&
      metrics.dot,
    `${scenarioName} 缺少可检查的暗色加载态: ${JSON.stringify(metrics)}`
  )
  assert(
    isDarkControlBackground(metrics.panel.backgroundColor),
    `${scenarioName} 加载态面板仍是浅色背景: ${JSON.stringify(metrics)}`
  )
  assert(
    isDarkNeutralBorderColor(metrics.panel.borderColor),
    `${scenarioName} 加载态面板边框未接入暗色主题: ${JSON.stringify(metrics)}`
  )
  assert(
    String(metrics.panel.boxShadow || '') !== 'none',
    `${scenarioName} 加载态面板缺少浮层阴影: ${JSON.stringify(metrics)}`
  )
  assert(
    isBluePrimaryColor(metrics.dot.backgroundColor),
    `${scenarioName} 加载态 Spin 未使用暗色主题主交互色: ${JSON.stringify(metrics)}`
  )
  assertReadableOnDark(
    metrics.title.color,
    metrics.panel.backgroundColor,
    `${scenarioName} 加载态标题对比度不足`
  )
  assertReadableOnDark(
    metrics.description.color,
    metrics.panel.backgroundColor,
    `${scenarioName} 加载态说明对比度不足`
  )
}

async function assertDarkAntdStateSurfaces(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const semanticTagToneNames = new Set([
      'magenta',
      'red',
      'volcano',
      'orange',
      'gold',
      'lime',
      'green',
      'cyan',
      'blue',
      'geekblue',
      'purple',
    ])
    const readNode = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const style = window.getComputedStyle(node)
      return {
        selector,
        text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) || '',
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
      }
    }
    return {
      empty: readNode('.ant-empty'),
      emptyDescription: readNode('.ant-empty-description'),
      tag: readNode('.ant-tag'),
      paginationItem: readNode('.ant-pagination .ant-pagination-item'),
      tablePlaceholder: readNode('.ant-table-placeholder > td'),
      semanticTags: [...document.querySelectorAll('.ant-tag')]
        .filter((node) => node.getClientRects().length > 0)
        .map((node) => {
          const toneClass = [...node.classList].find((className) => {
            if (!className.startsWith('ant-tag-')) return false
            return semanticTagToneNames.has(className.slice('ant-tag-'.length))
          })
          if (!toneClass) return null
          const style = window.getComputedStyle(node)
          return {
            tone: toneClass.slice('ant-tag-'.length),
            text:
              node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) || '',
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            color: style.color,
          }
        })
        .filter(Boolean),
    }
  })

  const visibleStates = Object.entries(metrics)
    .filter(([key]) => key !== 'semanticTags')
    .map(([, value]) => value)
    .filter(Boolean)
  assert(
    visibleStates.length >= 1,
    `${scenarioName} 缺少可检查的 AntD 状态组件: ${JSON.stringify(metrics)}`
  )

  visibleStates.forEach((item) => {
    const background = isTransparentColor(item.backgroundColor)
      ? 'rgb(17, 24, 39)'
      : item.backgroundColor
    if (!isTransparentColor(item.backgroundColor)) {
      assert(
        !isLightSurfaceColor(item.backgroundColor),
        `${scenarioName} ${item.selector} 仍是浅色背景: ${JSON.stringify(metrics)}`
      )
    }
    assertReadableOnDark(
      item.color,
      background,
      `${scenarioName} ${item.selector} 文字对比度不足`
    )
  })

  const semanticToneStyles = new Map()
  metrics.semanticTags.forEach((item) => {
    if (!semanticToneStyles.has(item.tone)) {
      semanticToneStyles.set(
        item.tone,
        [item.color, item.backgroundColor, item.borderColor].join('|')
      )
    }
    assert(
      !isLightSurfaceColor(item.backgroundColor),
      `${scenarioName} ${item.tone} Tag 仍是浅色背景: ${JSON.stringify(item)}`
    )
    assertReadableOnDark(
      item.color,
      item.backgroundColor,
      `${scenarioName} ${item.tone} Tag 文字对比度不足`
    )
  })

  if (semanticToneStyles.size >= 2) {
    assert.equal(
      new Set(semanticToneStyles.values()).size,
      semanticToneStyles.size,
      `${scenarioName} 不同语义 Tag 被渲染成相同颜色: ${JSON.stringify(
        Object.fromEntries(semanticToneStyles)
      )}`
    )
  }
}
export {
  assertERPThemeMode,
  assertDevPageUsesGlobalThemeOnly,
  clickERPThemeOption,
  assertNoERPThemeTooltip,
  assertThemeReadable,
  assertLoginSegmentedReadable,
  assertDarkThemeContrast,
  assertDarkThemeNeutralInteractions,
  assertDarkLoadingState,
  assertDarkAntdStateSurfaces,
}
