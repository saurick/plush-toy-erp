import { assertBusinessFormPage } from './businessFormPageAssertions.mjs'
import assert from 'node:assert/strict'
import {
  assertNoBlueFocusStyle,
  isAcceptedFocusBorder,
} from './colorAssertions.mjs'

const assertAntdModalCentered = (...args) =>
  assertAntdModalCenteredImpl(...args)

async function assertAppAlertDialogLayout(
  page,
  { scenarioName, expectedMessage = '请先登录', exerciseEscape = false }
) {
  const surface = page.locator('.app-alert-dialog').last()
  const semanticDialog = page.getByRole('alertdialog').last()
  await surface.waitFor({ state: 'visible', timeout: 10_000 })
  await semanticDialog.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForFunction(() => {
    const dialog = document.querySelector('[role="alertdialog"]')
    const confirm = dialog?.querySelector('[data-app-alert-confirm]')
    return Boolean(confirm && document.activeElement === confirm)
  })

  const metrics = await page.evaluate(() => {
    const parseRgb = (value) => {
      const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
      if (!match) return null
      return match.slice(1, 4).map(Number)
    }
    const channel = (value) => {
      const normalized = value / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }
    const luminance = (rgb) =>
      rgb
        ? 0.2126 * channel(rgb[0]) +
          0.7152 * channel(rgb[1]) +
          0.0722 * channel(rgb[2])
        : 0
    const contrastRatio = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      return (lighter + 0.05) / (darker + 0.05)
    }
    const rectOf = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }
    const visibleElement = (selector) =>
      Array.from(document.querySelectorAll(selector)).find((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      }) || null

    const dialog = visibleElement('.app-alert-dialog')
    const semanticDialog = dialog?.closest('[role="alertdialog"]') || null
    const modalRoot = semanticDialog?.closest('.ant-modal-root') || null
    const overlay = modalRoot?.querySelector('.ant-modal-wrap') || null
    const mask = modalRoot?.querySelector('.ant-modal-mask') || null
    const title = dialog?.querySelector('[data-app-alert-title]') || null
    const message = dialog?.querySelector('[data-app-alert-message]') || null
    const confirm = dialog?.querySelector('[data-app-alert-confirm]') || null
    const dialogStyle = dialog ? window.getComputedStyle(dialog) : null
    const titleStyle = title ? window.getComputedStyle(title) : null
    const messageStyle = message ? window.getComputedStyle(message) : null
    const confirmStyle = confirm ? window.getComputedStyle(confirm) : null
    const backgroundColor = parseRgb(dialogStyle?.backgroundColor)
    const outsideHitTarget = document.elementFromPoint(8, 8)
    const appRoot = document.getElementById('root')

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      overlay: {
        position: overlay ? window.getComputedStyle(overlay).position : '',
        width: overlay?.getBoundingClientRect().width || 0,
        height: overlay?.getBoundingClientRect().height || 0,
        pointerEvents: overlay
          ? window.getComputedStyle(overlay).pointerEvents
          : '',
        hasMask: Boolean(mask),
        outsideHitIsIsolated: Boolean(
          outsideHitTarget && modalRoot?.contains(outsideHitTarget)
        ),
      },
      background: {
        inert: appRoot?.hasAttribute('inert') === true,
        ariaHidden: appRoot?.getAttribute('aria-hidden') || '',
      },
      semantics: {
        role: semanticDialog?.getAttribute('role') || '',
        ariaModal: semanticDialog?.getAttribute('aria-modal') || '',
        labelledBy: semanticDialog?.getAttribute('aria-labelledby') || '',
        describedBy: semanticDialog?.getAttribute('aria-describedby') || '',
        titleId: title?.id || '',
        messageId: message?.id || '',
        activeIsConfirm: document.activeElement === confirm,
        nestedDialogCount: semanticDialog
          ? semanticDialog.querySelectorAll(
              '[role="dialog"], [role="alertdialog"]'
            ).length
          : 0,
      },
      dialog: rectOf(dialog),
      title: {
        rect: rectOf(title),
        text: title?.textContent?.trim() || '',
        fontSize: Number.parseFloat(titleStyle?.fontSize || '0'),
        contrast: contrastRatio(parseRgb(titleStyle?.color), backgroundColor),
        scrollWidth: title?.scrollWidth || 0,
        clientWidth: title?.clientWidth || 0,
      },
      message: {
        rect: rectOf(message),
        text: message?.textContent?.trim() || '',
        fontSize: Number.parseFloat(messageStyle?.fontSize || '0'),
        contrast: contrastRatio(parseRgb(messageStyle?.color), backgroundColor),
        scrollWidth: message?.scrollWidth || 0,
        clientWidth: message?.clientWidth || 0,
      },
      confirm: {
        rect: rectOf(confirm),
        text: confirm?.textContent?.trim() || '',
        fontSize: Number.parseFloat(confirmStyle?.fontSize || '0'),
        backgroundColor: confirmStyle?.backgroundColor || '',
        contrast: contrastRatio(
          parseRgb(confirmStyle?.color),
          parseRgb(confirmStyle?.backgroundColor)
        ),
        scrollWidth: confirm?.scrollWidth || 0,
        clientWidth: confirm?.clientWidth || 0,
      },
    }
  })

  assert(
    metrics.dialog,
    `${scenarioName} 缺少通用提示弹窗: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    metrics.semantics,
    {
      role: 'alertdialog',
      ariaModal: 'true',
      labelledBy: metrics.semantics.titleId,
      describedBy: metrics.semantics.messageId,
      titleId: metrics.semantics.titleId,
      messageId: metrics.semantics.messageId,
      activeIsConfirm: true,
      nestedDialogCount: 0,
    },
    `${scenarioName} 通用提示弹窗缺少 alertdialog 语义或初始焦点: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.semantics.titleId && metrics.semantics.messageId,
    `${scenarioName} 通用提示弹窗标题和说明必须有可关联 id: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.rect && metrics.message.rect && metrics.confirm.rect,
    `${scenarioName} 通用提示弹窗内部元素缺失: ${JSON.stringify(metrics)}`
  )
  assert.equal(metrics.title.text, '登录状态已失效')
  assert.equal(metrics.message.text, expectedMessage)
  assert.equal(metrics.confirm.text, '重新登录')
  assert.equal(
    metrics.overlay.position,
    'fixed',
    `${scenarioName} 遮罩层不再固定覆盖视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overlay.width >= metrics.viewport.width &&
      metrics.overlay.height >= metrics.viewport.height,
    `${scenarioName} 遮罩层未覆盖移动视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overlay.hasMask &&
      metrics.overlay.pointerEvents !== 'none' &&
      metrics.overlay.outsideHitIsIsolated,
    `${scenarioName} 弹窗背景仍可能接收点击: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    metrics.background,
    { inert: true, ariaHidden: 'true' },
    `${scenarioName} 弹窗背景缺少 inert/aria-hidden 隔离: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dialog.width >= 320 &&
      metrics.dialog.width <= metrics.viewport.width - 24,
    `${scenarioName} 移动端弹窗宽度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dialog.height <= metrics.viewport.height - 48,
    `${scenarioName} 移动端弹窗高度溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.dialog.left +
        metrics.dialog.width / 2 -
        metrics.viewport.width / 2
    ) <= 2 &&
      Math.abs(
        metrics.dialog.top +
          metrics.dialog.height / 2 -
          metrics.viewport.height / 2
      ) <= 8,
    `${scenarioName} 通用提示弹窗未上下左右居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.fontSize >= 20 && metrics.message.fontSize >= 14,
    `${scenarioName} 弹窗字号过小: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.contrast >= 7 && metrics.message.contrast >= 4.5,
    `${scenarioName} 弹窗文字对比度不足: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.confirm.contrast >= 4.5,
    `${scenarioName} 弹窗按钮文字对比度不足: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.scrollWidth <= metrics.title.clientWidth + 1 &&
      metrics.message.scrollWidth <= metrics.message.clientWidth + 1 &&
      metrics.confirm.scrollWidth <= metrics.confirm.clientWidth + 1,
    `${scenarioName} 弹窗文字出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.rect.bottom < metrics.message.rect.top &&
      metrics.message.rect.bottom < metrics.confirm.rect.top,
    `${scenarioName} 弹窗内部文字和按钮发生重叠: ${JSON.stringify(metrics)}`
  )

  for (const key of ['Tab', 'Shift+Tab', 'Tab']) {
    await page.keyboard.press(key)
    const focusIsContained = await semanticDialog.evaluate(
      (node) =>
        document.activeElement instanceof Element &&
        node.contains(document.activeElement)
    )
    assert(focusIsContained, `${scenarioName} ${key} 后焦点逃出提示弹窗`)
  }

  if (exerciseEscape) {
    await page.keyboard.press('Escape')
    await semanticDialog.waitFor({ state: 'hidden', timeout: 10_000 })
    await page.waitForFunction(
      () => {
        const appRoot = document.getElementById('root')
        return (
          appRoot &&
          !appRoot.hasAttribute('inert') &&
          !appRoot.hasAttribute('aria-hidden')
        )
      },
      undefined,
      { timeout: 10_000 }
    )
  }
}

async function assertAdminRoleModalLayout(page, { scenarioName, title }) {
  const modal = page.locator('.erp-business-form-page:not([hidden])').filter({ hasText: title }).last()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await assertBusinessFormPage(page, modal)

  const metrics = await modal.evaluate((node) => {
    const body = node.querySelector('.erp-business-form-page__body')
    const formItems = [...node.querySelectorAll('.ant-form-item')]
    const controls = [
      ...node.querySelectorAll(
        '.ant-input, .ant-input-affix-wrapper, .ant-select-selector'
      ),
    ]
      .filter(
        (control) =>
          !(
            control.matches('.ant-input') &&
            control.closest('.ant-input-affix-wrapper')
          )
      )
      .map((control) => {
        const rect = control.getBoundingClientRect()
        const style = window.getComputedStyle(control)
        return {
          text: control.textContent?.trim()?.slice(0, 32) || '',
          width: rect.width,
          height: rect.height,
          borderRadius: style.borderRadius,
          borderColor: style.borderColor,
        }
      })
    const bodyRect = body?.getBoundingClientRect()

    return {
      hasPermissionModalClass: node.classList.contains('erp-permission-editor'),
      body: bodyRect
        ? {
            width: bodyRect.width,
            height: bodyRect.height,
            scrollWidth: body.scrollWidth,
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight,
          }
        : null,
      formItemCount: formItems.length,
      hasRoleSelect: Boolean(
        [...node.querySelectorAll('.ant-select-selection-placeholder')].some(
          (item) => item.textContent?.includes('选择一个或多个岗位')
        )
      ),
      controls,
    }
  })

  assert(
    metrics.body,
    `${scenarioName} 缺少弹窗 body: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.formItemCount >= 4 && metrics.hasRoleSelect,
    `${scenarioName} 创建员工账号弹窗缺少账号/手机号/密码/岗位字段: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hasPermissionModalClass,
    `${scenarioName} 权限弹窗未挂载 erp-permission-modal，输入控件无法继承统一样式: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body.scrollWidth <= metrics.body.width + 8,
    `${scenarioName} 创建员工账号弹窗出现横向滚动: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.controls.every(
      (control) => control.width >= 120 && control.height >= 30
    ),
    `${scenarioName} 创建员工账号弹窗控件尺寸异常: ${JSON.stringify(metrics)}`
  )
  const controlRadii = [
    ...new Set(metrics.controls.map((control) => control.borderRadius)),
  ]
  assert(
    controlRadii.length === 1 &&
      Number.parseFloat(controlRadii[0] || '0') >= 10,
    `${scenarioName} 创建员工账号弹窗输入框圆角不一致: ${JSON.stringify(metrics)}`
  )
}

async function assertAntdModalCenteredImpl(page, modalLocator, scenarioName) {
  await modalLocator.waitFor({ state: 'visible', timeout: 10_000 })
  const modalHandle = await modalLocator.elementHandle()
  assert(modalHandle, `${scenarioName} 缺少可等待动画结束的 Ant Design 弹窗`)
  try {
    await page.waitForFunction(
      (modal) => {
        if (!(modal instanceof HTMLElement) || !modal.isConnected) return false
        const rect = modal.getBoundingClientRect()
        const style = window.getComputedStyle(modal)
        const className = String(modal.className || '')
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          !className.includes('ant-zoom-enter') &&
          !className.includes('ant-zoom-appear')
        )
      },
      modalHandle,
      { timeout: 10_000 }
    )
  } finally {
    await modalHandle.dispose()
  }

  const metrics = await modalLocator.evaluate((node) => {
    const modal =
      node instanceof HTMLElement && node.classList.contains('ant-modal')
        ? node
        : node.closest('.ant-modal')
    const wrap = modal?.closest('.ant-modal-wrap')
    const modalRect = modal?.getBoundingClientRect()
    const wrapRect = wrap?.getBoundingClientRect()

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      wrap: wrapRect
        ? {
            width: wrapRect.width,
            height: wrapRect.height,
          }
        : null,
      wrapClassName: String(wrap?.className || ''),
      modalClassName: String(modal?.className || ''),
      modalTitle: String(
        modal?.querySelector('.ant-modal-title')?.textContent || ''
      ).trim(),
      modalStyle: modal?.getAttribute('style') || '',
      modal: modalRect
        ? {
            left: modalRect.left,
            right: modalRect.right,
            top: modalRect.top,
            bottom: modalRect.bottom,
            width: modalRect.width,
            height: modalRect.height,
            centerX: modalRect.left + modalRect.width / 2,
            centerY: modalRect.top + modalRect.height / 2,
          }
        : null,
    }
  })

  assert(
    metrics.modal,
    `${scenarioName} 缺少可验证的 Ant Design 弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.wrapClassName.includes('ant-modal-centered'),
    `${scenarioName} Ant Design 弹窗未启用 centered: ${JSON.stringify(metrics)}`
  )
  const horizontalCenterTolerance =
    metrics.modal.width >= metrics.viewport.width * 0.85 ? 20 : 3
  assert(
    Math.abs(metrics.modal.centerX - metrics.viewport.width / 2) <=
      horizontalCenterTolerance,
    `${scenarioName} 弹窗未水平居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.modal.centerY - metrics.viewport.height / 2) <= 8,
    `${scenarioName} 弹窗未垂直居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.top >= -1 &&
      metrics.modal.bottom <= metrics.viewport.height + 1,
    `${scenarioName} 弹窗垂直居中后溢出视口: ${JSON.stringify(metrics)}`
  )
}

async function assertVisibleModalInputFocusStyle(
  page,
  { scenarioName, modalText }
) {
  const activeModal = page
    .locator('.ant-modal:visible')
    .filter({ hasText: modalText })
    .last()
  await activeModal.waitFor({ state: 'visible', timeout: 10_000 })

  const focusTargets = [
    {
      label: '弹窗文本输入框',
      selector: 'input.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗多行输入框',
      selector: 'textarea.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗数字输入框',
      selector: '.ant-input-number-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗下拉框',
      selector: '.ant-select-selector',
      action: 'click',
    },
  ]

  const checked = []
  for (const target of focusTargets) {
    const locator = activeModal.locator(target.selector).first()
    if ((await locator.count()) === 0) {
      continue
    }

    if (target.action === 'click') {
      await locator.click()
    } else {
      await locator.focus()
    }
    await page.waitForTimeout(80)
    const metrics = await locator.evaluate((node, label) => {
      const sourceStyle = window.getComputedStyle(node)
      const focusedControl =
        node.matches('.ant-select-selector') ||
        node.matches('.ant-input-affix-wrapper')
          ? node
          : node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node.closest('.ant-picker') ||
            node
      const style = window.getComputedStyle(focusedControl)
      return {
        label,
        tagName: focusedControl.tagName,
        className: String(focusedControl.className || ''),
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
      }
    }, target.label)
    checked.push(metrics)
    const selectSearchMetrics = await readActiveSelectSearchFocusMetric(
      page,
      target.label
    )
    if (selectSearchMetrics) {
      checked.push(selectSearchMetrics)
    }
    if (target.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  assert(
    checked.length > 0,
    `${scenarioName} 未找到可验证 focus 的弹窗输入控件`
  )
  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
  })
}

async function readActiveSelectSearchFocusMetric(page, label) {
  return page.evaluate((sourceLabel) => {
    const { activeElement } = document
    if (
      !activeElement?.classList?.contains('ant-select-selection-search-input')
    ) {
      return null
    }

    const style = window.getComputedStyle(activeElement)
    return {
      label: `${sourceLabel}内部搜索输入`,
      tagName: activeElement.tagName,
      className: String(activeElement.className || ''),
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      allowTransparentBorder: true,
      skipBorderColor: true,
    }
  }, label)
}
export {
  assertAntdModalCentered,
  assertAppAlertDialogLayout,
  assertAdminRoleModalLayout,
  assertVisibleModalInputFocusStyle,
}
