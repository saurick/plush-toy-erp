import assert from 'node:assert/strict'
import {
  assertNoBlueFocusStyle,
  isAcceptedFocusBorder,
  isBluePrimaryColor,
} from './colorAssertions.mjs'

async function assertVisibleInputControlRadius(page, scenarioName) {
  const issues = await page.evaluate(() => {
    const minRadius = 10
    const ignoredAncestorSelector = [
      '.ant-picker-dropdown',
      '.ant-select-dropdown',
      '.ant-dropdown',
      '.ant-tooltip',
      '.ant-popover',
      '.ant-table-filter-dropdown',
      '.erp-print-shell',
      '.erp-print-paper',
      '.erp-material-contract-paper',
      '.erp-processing-contract-paper',
      '[data-server-pdf-root]',
    ].join(',')
    const candidateSelector = [
      '.ant-input-affix-wrapper',
      '.ant-input-number-affix-wrapper',
      '.ant-input-number:not(.ant-input-number-affix-wrapper > .ant-input-number)',
      '.ant-picker',
      '.ant-select-selector',
      'input.ant-input:not([type="hidden"])',
      'textarea.ant-input',
      'input:not([type])',
      'input[type="text"]',
      'input[type="search"]',
      'input[type="password"]',
      'input[type="email"]',
      'input[type="tel"]',
      'input[type="number"]',
      'textarea',
      'select',
    ].join(',')

    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    const describe = (node) => {
      const classes =
        typeof node.className === 'string'
          ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 5)
          : []
      return {
        tagName: node.tagName,
        className: classes.join(' '),
        placeholder: node.getAttribute('placeholder') || '',
        text: String(node.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80),
        ariaLabel: node.getAttribute('aria-label') || '',
        type: node.getAttribute('type') || '',
      }
    }

    const isNestedNativeInput = (node) =>
      node.matches('input, textarea, select') &&
      node.closest(
        '.ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select, .ant-input-textarea-affix-wrapper'
      )

    const isIgnoredNativeType = (node) =>
      node.matches(
        'input[type="hidden"], input[type="checkbox"], input[type="radio"], input[type="file"], input[type="button"], input[type="submit"], input[type="reset"]'
      )

    const hasMinimumRadius = (value) =>
      Number.isFinite(value) && value >= minRadius
    const hasSquareCorner = (value) =>
      Number.isFinite(value) && Math.abs(value) <= 0.5

    const failures = []
    const candidates = Array.from(document.querySelectorAll(candidateSelector))
    for (const node of candidates) {
      if (!(node instanceof HTMLElement)) continue
      if (!isVisible(node)) continue
      if (node.closest(ignoredAncestorSelector)) continue
      if (isIgnoredNativeType(node)) continue
      if (isNestedNativeInput(node)) continue
      if (
        node.matches(
          '.ant-select-selection-search-input, .ant-input-number-input'
        )
      ) {
        continue
      }
      if (node.matches('.erp-item-field-unit-suffix')) continue

      // A clipped compact group owns the visible outline; its children meet at square seams.
      const compactGroup = node.parentElement?.matches('.ant-space-compact')
        ? node.parentElement
        : null
      const groupStyle = compactGroup && window.getComputedStyle(compactGroup)
      const groupClips =
        groupStyle &&
        ['hidden', 'clip'].includes(groupStyle.overflowX) &&
        ['hidden', 'clip'].includes(groupStyle.overflowY)
      const style = groupClips ? groupStyle : window.getComputedStyle(node)
      const radii = [
        style.borderTopLeftRadius,
        style.borderTopRightRadius,
        style.borderBottomRightRadius,
        style.borderBottomLeftRadius,
      ].map((value) => Number.parseFloat(value || '0'))
      const searchControl = node.closest('.ant-input-search')
      if (
        searchControl instanceof HTMLElement &&
        node.matches('.ant-input-affix-wrapper')
      ) {
        const searchButton = searchControl.querySelector(
          '.ant-input-search-button'
        )
        const inputRect = node.getBoundingClientRect()
        const buttonRect = searchButton?.getBoundingClientRect()
        const buttonStyle =
          searchButton instanceof HTMLElement
            ? window.getComputedStyle(searchButton)
            : null
        const buttonRadii = [
          buttonStyle?.borderTopLeftRadius,
          buttonStyle?.borderTopRightRadius,
          buttonStyle?.borderBottomRightRadius,
          buttonStyle?.borderBottomLeftRadius,
        ].map((value) => Number.parseFloat(value || '0'))
        const hasConnectedSearchIssue =
          !(searchButton instanceof HTMLElement) ||
          !isVisible(searchButton) ||
          !hasMinimumRadius(radii[0]) ||
          !hasSquareCorner(radii[1]) ||
          !hasSquareCorner(radii[2]) ||
          !hasMinimumRadius(radii[3]) ||
          !hasSquareCorner(buttonRadii[0]) ||
          !hasMinimumRadius(buttonRadii[1]) ||
          !hasMinimumRadius(buttonRadii[2]) ||
          !hasSquareCorner(buttonRadii[3]) ||
          !buttonRect ||
          Math.abs(inputRect.right - buttonRect.left) > 1.5 ||
          Math.abs(inputRect.top - buttonRect.top) > 1 ||
          Math.abs(inputRect.bottom - buttonRect.bottom) > 1
        if (hasConnectedSearchIssue) {
          failures.push({
            ...describe(node),
            reason: 'connected-search-control',
            width: Number(inputRect.width.toFixed(1)),
            height: Number(inputRect.height.toFixed(1)),
            borderRadius: style.borderRadius,
            radii,
            buttonRadii,
            seamGap: buttonRect
              ? Number((buttonRect.left - inputRect.right).toFixed(1))
              : null,
            topDelta: buttonRect
              ? Number((buttonRect.top - inputRect.top).toFixed(1))
              : null,
            bottomDelta: buttonRect
              ? Number((buttonRect.bottom - inputRect.bottom).toFixed(1))
              : null,
          })
        }
        continue
      }

      const hasRadiusIssue = radii.some((value) => !hasMinimumRadius(value))
      if (hasRadiusIssue) {
        const rect = node.getBoundingClientRect()
        failures.push({
          ...describe(node),
          width: Number(rect.width.toFixed(1)),
          height: Number(rect.height.toFixed(1)),
          borderRadius: style.borderRadius,
          radii,
        })
      }
    }
    return failures.slice(0, 20)
  })

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 可见输入控件圆角或组合接缝未达到 ERP 基线: ${JSON.stringify(issues)}`
  )
}

async function assertVisibleSearchPlaceholdersFit(page, scenarioName) {
  const issues = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    const measureTextWidth = (text, font) => {
      if (!context) return 0
      context.font = font
      return context.measureText(text).width
    }
    const selectors = '.erp-search-input input.ant-input'
    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        rect.bottom >= 0 &&
        rect.right >= 0 &&
        rect.top <= window.innerHeight &&
        rect.left <= window.innerWidth &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }
    const describe = (node, extra = {}) => {
      const owner =
        node.closest('.ant-input-affix-wrapper') ||
        node.closest('.erp-source-import-picker') ||
        node
      const ownerRect = owner.getBoundingClientRect()
      const rect = node.getBoundingClientRect()
      const classes =
        typeof owner.className === 'string'
          ? owner.className.trim().split(/\s+/).filter(Boolean).slice(0, 5)
          : []
      return {
        className: classes.join(' '),
        placeholder: node.getAttribute('placeholder') || '',
        inputWidth: Number(rect.width.toFixed(1)),
        ownerWidth: Number(ownerRect.width.toFixed(1)),
        ...extra,
      }
    }

    return Array.from(document.querySelectorAll(selectors))
      .filter((node) => node instanceof HTMLInputElement)
      .filter((node) => isVisible(node))
      .filter((node) => !node.value)
      .map((node) => {
        const placeholder = node.getAttribute('placeholder') || ''
        if (!placeholder) return null
        const style = window.getComputedStyle(node)
        const paddingX =
          Number.parseFloat(style.paddingLeft || '0') +
          Number.parseFloat(style.paddingRight || '0')
        const available = Math.max(0, node.clientWidth - paddingX)
        const required = Math.ceil(
          measureTextWidth(placeholder, style.font) + 6
        )
        if (available >= required) return null
        return describe(node, {
          available,
          required,
          font: style.font,
        })
      })
      .filter(Boolean)
      .slice(0, 12)
  })

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 搜索框 placeholder 显示不全: ${JSON.stringify(issues)}`
  )
}

async function assertVisibleRoundedInputWrapperClipping(page, scenarioName) {
  const issues = await page.evaluate(() => {
    const ignoredAncestorSelector = [
      '.ant-picker-dropdown',
      '.ant-select-dropdown',
      '.ant-dropdown',
      '.ant-tooltip',
      '.ant-popover',
      '.ant-table-filter-dropdown',
      '.erp-print-shell',
      '.erp-print-paper',
      '.erp-material-contract-paper',
      '.erp-processing-contract-paper',
      '[data-server-pdf-root]',
    ].join(',')
    const wrapperSelector = [
      '.ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)',
      '.ant-input-number-affix-wrapper',
      '.ant-input-number:not(.ant-input-number-affix-wrapper > .ant-input-number)',
      '.ant-picker',
    ].join(',')
    const nestedInputSelector = [
      'input.ant-input',
      '.ant-input-number-input',
      '.ant-picker-input > input',
    ].join(',')

    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    const isTransparentBackground = (value) => {
      const normalized = String(value || '')
        .replace(/\s/g, '')
        .toLowerCase()
      return (
        normalized === 'transparent' ||
        normalized === 'rgba(0,0,0,0)' ||
        normalized === 'rgb(0,0,0,0)'
      )
    }

    const describe = (node, extra = {}) => {
      const classes =
        typeof node.className === 'string'
          ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 5)
          : []
      const rect = node.getBoundingClientRect()
      return {
        tagName: node.tagName,
        className: classes.join(' '),
        placeholder: node.getAttribute('placeholder') || '',
        width: Number(rect.width.toFixed(1)),
        height: Number(rect.height.toFixed(1)),
        ...extra,
      }
    }

    const failures = []
    const wrappers = Array.from(document.querySelectorAll(wrapperSelector))
    for (const wrapper of wrappers) {
      if (!(wrapper instanceof HTMLElement)) continue
      if (!isVisible(wrapper)) continue
      if (wrapper.closest(ignoredAncestorSelector)) continue

      const wrapperStyle = window.getComputedStyle(wrapper)
      const wrapperOverflow = [
        wrapperStyle.overflow,
        wrapperStyle.overflowX,
        wrapperStyle.overflowY,
      ].map((value) => String(value || '').toLowerCase())
      const clipsChildren = wrapperOverflow.some((value) =>
        ['hidden', 'clip'].includes(value)
      )
      if (!clipsChildren) {
        failures.push(
          describe(wrapper, {
            reason: 'wrapper-overflow',
            overflow: wrapperStyle.overflow,
            overflowX: wrapperStyle.overflowX,
            overflowY: wrapperStyle.overflowY,
            borderRadius: wrapperStyle.borderRadius,
          })
        )
        continue
      }

      const input = Array.from(
        wrapper.querySelectorAll(nestedInputSelector)
      ).find((node) => node instanceof HTMLElement && isVisible(node))
      if (!input) continue

      const inputStyle = window.getComputedStyle(input)
      if (!isTransparentBackground(inputStyle.backgroundColor)) {
        failures.push(
          describe(input, {
            reason: 'nested-input-background',
            wrapperClassName:
              typeof wrapper.className === 'string'
                ? wrapper.className
                    .trim()
                    .split(/\s+/)
                    .filter(Boolean)
                    .slice(0, 5)
                    .join(' ')
                : '',
            backgroundColor: inputStyle.backgroundColor,
            borderRadius: inputStyle.borderRadius,
          })
        )
      }
    }
    return failures.slice(0, 20)
  })

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 圆角输入控件内层背景或裁剪会遮挡视觉圆角: ${JSON.stringify(issues)}`
  )
}

async function assertVisibleInputFocusRingNotClipped(page, scenarioName) {
  const metrics = await page.evaluate(async () => {
    const ignoredAncestorSelector = [
      '.ant-picker-dropdown',
      '.ant-select-dropdown',
      '.ant-dropdown',
      '.ant-tooltip',
      '.ant-popover',
      '.ant-table-filter-dropdown',
      '.erp-print-shell',
      '.erp-print-paper',
      '.erp-material-contract-paper',
      '.erp-processing-contract-paper',
      '[data-server-pdf-root]',
    ].join(',')
    const focusTargetSelector = [
      'input.ant-input:not([type="hidden"])',
      'textarea.ant-input',
      '.ant-input-number-input',
      '.ant-picker-input > input',
      '.ant-select-selection-search-input',
    ].join(',')

    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    const focusOwnerOf = (node) => {
      const dateRange = node.closest('.erp-business-date-range-filter')
      if (dateRange instanceof HTMLElement) return dateRange
      const select = node.closest('.ant-select')
      const selector = select?.querySelector('.ant-select-selector')
      if (selector instanceof HTMLElement) return selector
      const compactGroup = node.parentElement?.matches('.ant-space-compact')
        ? node.parentElement
        : null
      if (compactGroup) {
        const style = window.getComputedStyle(compactGroup)
        if (
          ['hidden', 'clip'].includes(style.overflowX) &&
          ['hidden', 'clip'].includes(style.overflowY)
        )
          return compactGroup
      }
      return (
        node.closest('.ant-input-affix-wrapper') ||
        node.closest('.ant-input-number-affix-wrapper') ||
        node.closest('.ant-input-number') ||
        node.closest('.ant-picker') ||
        node
      )
    }

    const describeNode = (node, owner) => {
      const ownerRect = owner.getBoundingClientRect()
      const container =
        owner.closest(
          '.ant-form-item-control-input-content, .ant-form-item-control, .ant-form-item'
        ) || owner.parentElement
      const containerRect = container?.getBoundingClientRect()
      const ownerStyle = window.getComputedStyle(owner)
      const outlineLayer = owner.matches('.ant-space-compact')
        ? window.getComputedStyle(owner, '::after')
        : null
      const hasOverlayOutline =
        outlineLayer &&
        outlineLayer.content !== 'none' &&
        outlineLayer.position === 'absolute' &&
        ['top', 'right', 'bottom', 'left'].every(
          (edge) => outlineLayer[edge] === '0px'
        )
      const focusStyle = hasOverlayOutline ? outlineLayer : ownerStyle
      const nodeStyle = window.getComputedStyle(node)
      const classes =
        typeof owner.className === 'string'
          ? owner.className.trim().split(/\s+/).filter(Boolean).slice(0, 6)
          : []
      return {
        tagName: owner.tagName,
        className: classes.join(' '),
        selectClassName: String(owner.closest('.ant-select')?.className || ''),
        targetTagName: node.tagName,
        targetClassName: String(node.className || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6)
          .join(' '),
        placeholder: node.getAttribute('placeholder') || '',
        text: String(owner.textContent || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 80),
        formClassName: String(
          owner.closest('form, .erp-business-form, .erp-business-action-form')
            ?.className || ''
        ),
        modalClassName: String(owner.closest('.ant-modal')?.className || ''),
        width: Number(ownerRect.width.toFixed(1)),
        height: Number(ownerRect.height.toFixed(1)),
        left: Number(ownerRect.left.toFixed(1)),
        right: Number(ownerRect.right.toFixed(1)),
        containerClassName: String(container?.className || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6)
          .join(' '),
        containerWidth: containerRect
          ? Number(containerRect.width.toFixed(1))
          : null,
        containerLeft: containerRect
          ? Number(containerRect.left.toFixed(1))
          : null,
        containerRight: containerRect
          ? Number(containerRect.right.toFixed(1))
          : null,
        borderColor: focusStyle.borderColor,
        boxShadow: focusStyle.boxShadow,
        outlineStyle: focusStyle.outlineStyle,
        outlineWidth: focusStyle.outlineWidth,
        overflow: ownerStyle.overflow,
        overflowX: ownerStyle.overflowX,
        overflowY: ownerStyle.overflowY,
        targetBorderColor: nodeStyle.borderColor,
        targetBoxShadow: nodeStyle.boxShadow,
        activeTagName: document.activeElement?.tagName || '',
        activeClassName: String(document.activeElement?.className || ''),
        theme: document.documentElement.dataset.erpTheme || 'light',
      }
    }

    const targets = Array.from(document.querySelectorAll(focusTargetSelector))
      .filter((node) => node instanceof HTMLElement)
      .filter(isVisible)
      .filter((node) => !node.closest(ignoredAncestorSelector))
      .filter((node) => !node.disabled && !node.readOnly)

    const checked = []
    const seenOwners = new Set()
    const previousActive = document.activeElement
    for (const node of targets) {
      const owner = focusOwnerOf(node)
      if (!(owner instanceof HTMLElement)) continue
      if (!isVisible(owner)) continue
      if (seenOwners.has(owner)) continue
      seenOwners.add(owner)
      node.focus({ preventScroll: true })
      await new Promise((resolve) => window.setTimeout(resolve, 180))
      if (
        document.activeElement !== node &&
        document.activeElement !== owner &&
        !owner.contains(document.activeElement) &&
        !owner.matches(':focus-within')
      ) {
        continue
      }
      checked.push(describeNode(node, owner))
      if (checked.length >= 24) break
    }
    if (previousActive instanceof HTMLElement) {
      previousActive.focus({ preventScroll: true })
    }
    return checked
  })

  const focusIssues = metrics.filter((item) => {
    const boxShadow = String(item.boxShadow || '').toLowerCase()
    const outlineWidth = Number.parseFloat(item.outlineWidth || '0')
    return !boxShadow.includes('inset') && !(outlineWidth > 0)
  })

  if (metrics.length === 0) return
  assert.deepEqual(
    focusIssues,
    [],
    `${scenarioName} 输入控件焦点环应在控件内部完整绘制，避免被圆角或滚动容器裁切: ${JSON.stringify(
      focusIssues
    )}`
  )
  const containmentIssues = metrics.filter((item) => {
    if (
      item.containerLeft === null ||
      item.containerRight === null ||
      item.containerWidth === null
    ) {
      return false
    }
    return (
      item.left < item.containerLeft - 1 ||
      item.right > item.containerRight + 1 ||
      item.width > item.containerWidth + 1
    )
  })
  assert.deepEqual(
    containmentIssues,
    [],
    `${scenarioName} 输入控件 focus 后必须完整落在 Form.Item 内容盒内，不能出现右边框被父容器裁切或撑出可见区域: ${JSON.stringify(
      containmentIssues
    )}`
  )
  metrics.forEach((item) => {
    if (item.theme === 'dark') {
      assert(
        isBluePrimaryColor(item.borderColor),
        `${scenarioName} 暗色输入控件 focus 边框未统一到暗色主题色: ${JSON.stringify(item)}`
      )
    } else {
      assert(
        isAcceptedFocusBorder(item),
        `${scenarioName} 输入控件 focus 边框未统一到主题色: ${JSON.stringify(item)}`
      )
      assertNoBlueFocusStyle(item, scenarioName)
    }
  })
}

async function assertVisibleInputTextVerticalRhythm(page, scenarioName) {
  const metrics = await page.evaluate(() => {
    const ignoredAncestorSelector = [
      '.ant-picker-dropdown',
      '.ant-select-dropdown',
      '.ant-dropdown',
      '.ant-tooltip',
      '.ant-popover',
      '.ant-table-filter-dropdown',
      '.erp-print-shell',
      '.erp-print-paper',
      '.erp-material-contract-paper',
      '.erp-processing-contract-paper',
      '[data-server-pdf-root]',
    ].join(',')
    const scopeSelector = [
      '.erp-search-input',
      '.erp-business-form',
      '.erp-business-action-form',
      '.erp-business-filter-panel',
      '.erp-login-card',
    ].join(',')
    const controlSelector = [
      '.ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)',
      'input.ant-input:not([type="hidden"]):not(.erp-item-field-unit-suffix)',
      '.ant-select-single .ant-select-selector',
    ].join(',')

    const numberFromPx = (value) => {
      const parsed = Number.parseFloat(String(value || ''))
      return Number.isFinite(parsed) ? parsed : null
    }

    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    const describeNode = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return {
        tagName: node.tagName,
        className: String(node.className || '')
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 6)
          .join(' '),
        top: Number(rect.top.toFixed(2)),
        bottom: Number(rect.bottom.toFixed(2)),
        height: Number(rect.height.toFixed(2)),
        center: Number(((rect.top + rect.bottom) / 2).toFixed(2)),
        display: style.display,
        alignItems: style.alignItems,
        heightCss: style.height,
        lineHeight: style.lineHeight,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        borderTopWidth: style.borderTopWidth,
        borderBottomWidth: style.borderBottomWidth,
      }
    }

    return Array.from(document.querySelectorAll(controlSelector))
      .filter((node) => node instanceof HTMLElement)
      .filter(isVisible)
      .filter((node) => node.closest(scopeSelector))
      .filter((node) => !node.closest(ignoredAncestorSelector))
      .filter(
        (node) =>
          !(
            node.matches('input.ant-input') &&
            node.closest(
              '.ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)'
            )
          )
      )
      .map((owner) => {
        const ownerStyle = window.getComputedStyle(owner)
        const ownerHeight = numberFromPx(ownerStyle.height)
        const ownerInnerHeight =
          ownerHeight === null
            ? null
            : ownerHeight -
              (numberFromPx(ownerStyle.borderTopWidth) || 0) -
              (numberFromPx(ownerStyle.borderBottomWidth) || 0)
        const affixInput = owner.matches('.ant-input-affix-wrapper')
          ? owner.querySelector('input.ant-input')
          : null
        const affixSuffixNodes = owner.matches('.ant-input-affix-wrapper')
          ? Array.from(owner.querySelectorAll('.ant-input-suffix')).filter(
              (node) => node instanceof HTMLElement && isVisible(node)
            )
          : []
        const directInput = owner.matches('input.ant-input') ? owner : null
        const selectTextNodes = owner.matches('.ant-select-selector')
          ? Array.from(
              owner.querySelectorAll(
                '.ant-select-selection-item, .ant-select-selection-placeholder, .ant-select-selection-search, .ant-select-selection-search-input'
              )
            ).filter((node) => node instanceof HTMLElement && isVisible(node))
          : []
        return {
          owner: describeNode(owner),
          ownerInnerHeight:
            ownerInnerHeight === null
              ? null
              : Number(ownerInnerHeight.toFixed(2)),
          affixInput: affixInput ? describeNode(affixInput) : null,
          affixSuffixNodes: affixSuffixNodes.map(describeNode),
          directInput: directInput ? describeNode(directInput) : null,
          selectTextNodes: selectTextNodes.map(describeNode),
          formClassName: String(owner.closest(scopeSelector)?.className || ''),
          text: String(owner.closest('.ant-form-item')?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80),
        }
      })
  })

  const issues = metrics.filter((item) => {
    const ownerDisplay = String(item.owner.display || '')
    if (
      (ownerDisplay === 'flex' || ownerDisplay === 'inline-flex') &&
      item.owner.alignItems !== 'center'
    ) {
      return true
    }

    if (item.affixInput) {
      const centerDelta = Math.abs(item.affixInput.center - item.owner.center)
      const inputHeight = Number.parseFloat(item.affixInput.heightCss || '0')
      const inputLineHeight = Number.parseFloat(
        item.affixInput.lineHeight || '0'
      )
      if (centerDelta > 1.5) return true
      if (inputHeight > 0 && inputLineHeight > inputHeight + 1) return true
      if (
        item.ownerInnerHeight !== null &&
        inputLineHeight > 0 &&
        Math.abs(inputLineHeight - item.ownerInnerHeight) > 1.5
      ) {
        return true
      }
    }

    if (item.affixSuffixNodes.length > 0) {
      return item.affixSuffixNodes.some((node) => {
        const centerDelta = Math.abs(node.center - item.owner.center)
        return centerDelta > 1.5
      })
    }

    if (item.directInput && item.ownerInnerHeight !== null) {
      const inputLineHeight = Number.parseFloat(
        item.directInput.lineHeight || '0'
      )
      return (
        inputLineHeight > 0 &&
        Math.abs(inputLineHeight - item.ownerInnerHeight) > 1.5
      )
    }

    if (item.selectTextNodes.length > 0 && item.ownerInnerHeight !== null) {
      return item.selectTextNodes.some((node) => {
        const centerDelta = Math.abs(node.center - item.owner.center)
        const lineHeight = Number.parseFloat(node.lineHeight || '0')
        if (centerDelta > 1.5) return true
        return (
          lineHeight > 0 && Math.abs(lineHeight - item.ownerInnerHeight) > 1.5
        )
      })
    }

    return false
  })

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 单行输入控件文字、placeholder 和 caret 的垂直节奏应由控件内高接管，不能被 AntD 默认 line-height 或 affix wrapper stretch 污染: ${JSON.stringify(
      issues
    )}`
  )
}

async function assertVisibleBusinessFormControlHeight(page, scenarioName) {
  const issues = await page.evaluate(() => {
    const formSelector = '.erp-business-form, .erp-business-action-form'
    const candidateSelector = [
      '.ant-input-affix-wrapper:not(.ant-input-textarea-affix-wrapper)',
      '.ant-input-number-affix-wrapper',
      '.ant-input-number:not(.ant-input-number-affix-wrapper > .ant-input-number)',
      '.ant-picker',
      '.ant-select-single',
      'input.ant-input:not([type="hidden"])',
    ].join(',')
    const ignoredAncestorSelector = [
      '.ant-picker-dropdown',
      '.ant-select-dropdown',
      '.ant-dropdown',
      '.ant-tooltip',
      '.ant-popover',
      '.ant-table-filter-dropdown',
      '.erp-print-shell',
      '.erp-print-paper',
      '.erp-material-contract-paper',
      '.erp-processing-contract-paper',
      '[data-server-pdf-root]',
    ].join(',')

    const isVisible = (node) => {
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    const getLayoutHeight = (node) => Number(node.offsetHeight || 0)

    const describe = (node, form, expectedHeight) => {
      const classes =
        typeof node.className === 'string'
          ? node.className.trim().split(/\s+/).filter(Boolean).slice(0, 5)
          : []
      return {
        tagName: node.tagName,
        className: classes.join(' '),
        placeholder: node.getAttribute('placeholder') || '',
        type: node.getAttribute('type') || '',
        formClassName:
          typeof form.className === 'string'
            ? form.className
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 5)
                .join(' ')
            : '',
        expectedHeight,
        height: Number(getLayoutHeight(node).toFixed(1)),
      }
    }

    const forms = Array.from(document.querySelectorAll(formSelector))
    const failures = []
    for (const form of forms) {
      if (!(form instanceof HTMLElement)) continue
      if (!isVisible(form)) continue
      const formStyle = window.getComputedStyle(form)
      const expectedHeight =
        Number.parseFloat(formStyle.getPropertyValue('--erp-control-height')) ||
        36
      const candidates = Array.from(form.querySelectorAll(candidateSelector))
      for (const node of candidates) {
        if (!(node instanceof HTMLElement)) continue
        if (!isVisible(node)) continue
        if (node.closest(ignoredAncestorSelector)) continue
        if (
          node.matches('input') &&
          node.closest(
            '.ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select'
          )
        ) {
          continue
        }
        if (
          node.matches('textarea, input[type="checkbox"], input[type="radio"]')
        ) {
          continue
        }

        const height = getLayoutHeight(node)
        if (Math.abs(height - expectedHeight) > 1) {
          failures.push(describe(node, form, expectedHeight))
        }
      }
    }
    return failures.slice(0, 20)
  })

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 业务表单单行输入控件高度未统一: ${JSON.stringify(issues)}`
  )
}

export {
  assertVisibleInputControlRadius,
  assertVisibleSearchPlaceholdersFit,
  assertVisibleRoundedInputWrapperClipping,
  assertVisibleInputFocusRingNotClipped,
  assertVisibleInputTextVerticalRhythm,
  assertVisibleBusinessFormControlHeight,
}
