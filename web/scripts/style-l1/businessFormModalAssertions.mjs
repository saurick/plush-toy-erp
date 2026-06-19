export function createBusinessFormModalAssertions({ assert }) {
  async function assertBusinessFormModalKeyboardRecovery(
    page,
    { triggerName, titleText, scenarioName, closeMode = 'escape' }
  ) {
    const trigger = page.getByRole('button', { name: triggerName })
    await trigger.focus()
    await page.keyboard.press('Enter')
    const modal = page
      .locator('.erp-business-action-modal--form.ant-modal:visible')
      .filter({ hasText: titleText })
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForFunction(
      (text) => {
        const modals = Array.from(
          document.querySelectorAll(
            '.erp-business-action-modal--form.ant-modal'
          )
        ).filter((node) => {
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            node.textContent?.includes(text)
          )
        })
        const modalNode = modals.at(-1)
        const root = modalNode?.closest('.ant-modal-root') || modalNode
        return (
          modalNode &&
          document.activeElement instanceof Element &&
          root?.contains(document.activeElement) &&
          document.activeElement !== document.body
        )
      },
      titleText,
      { timeout: 2_000 }
    )

    const openedFocusMetric = await modal.evaluate((node) => {
      const root = node.closest('.ant-modal-root') || node
      const { activeElement } = document
      const dialog = node.closest('[role="dialog"]') || node
      return {
        ariaModal:
          dialog.getAttribute('aria-modal') ||
          node.getAttribute('aria-modal') ||
          '',
        activeTagName: activeElement?.tagName || '',
        activeClassName: String(activeElement?.className || ''),
        activeText:
          activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
        activeInsideModal:
          activeElement instanceof Element && root.contains(activeElement),
        activeIsBody: activeElement === document.body,
      }
    })
    assert.equal(
      openedFocusMetric.ariaModal,
      'true',
      `${scenarioName} 业务弹窗应声明 aria-modal=true: ${JSON.stringify(openedFocusMetric)}`
    )
    assert(
      openedFocusMetric.activeInsideModal && !openedFocusMetric.activeIsBody,
      `${scenarioName} 业务弹窗打开后焦点未进入弹窗: ${JSON.stringify(openedFocusMetric)}`
    )

    let tabFocusMetric = null
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press('Tab')
      tabFocusMetric = await modal.evaluate((node) => {
        const root = node.closest('.ant-modal-root') || node
        const { activeElement } = document
        const activeRect =
          activeElement instanceof Element
            ? activeElement.getBoundingClientRect()
            : null
        return {
          activeTagName: activeElement?.tagName || '',
          activeClassName: String(activeElement?.className || ''),
          activeText:
            activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
          activeInsideModal:
            activeElement instanceof Element && root.contains(activeElement),
          activeVisible: Boolean(
            activeRect && activeRect.width > 0 && activeRect.height > 0
          ),
          activeIsControl:
            activeElement instanceof Element &&
            activeElement.matches(
              'button, input, textarea, [role="combobox"], [role="button"], .ant-select-selection-search-input'
            ),
        }
      })
      if (
        tabFocusMetric.activeInsideModal &&
        tabFocusMetric.activeVisible &&
        tabFocusMetric.activeIsControl
      ) {
        break
      }
    }
    assert(
      tabFocusMetric?.activeInsideModal &&
        tabFocusMetric.activeVisible &&
        tabFocusMetric.activeIsControl,
      `${scenarioName} Tab 未进入业务弹窗内可操作控件: ${JSON.stringify(tabFocusMetric)}`
    )

    if (closeMode === 'close-button') {
      await modal.locator('.ant-modal-close').focus()
      await page.keyboard.press('Enter')
    } else {
      await page.keyboard.press('Escape')
    }
    await modal.waitFor({ state: 'hidden', timeout: 10_000 })
    await trigger.waitFor({ state: 'visible', timeout: 10_000 })
    let focusMetric = null
    for (let i = 0; i < 12; i += 1) {
      focusMetric = await trigger.evaluate((node) => ({
        activeText: document.activeElement?.textContent?.replace(/\s+/g, ' '),
        activeIsTrigger: document.activeElement === node,
        buttonText: node.textContent?.replace(/\s+/g, ' '),
      }))
      if (focusMetric.activeIsTrigger) break
      await page.waitForTimeout(50)
    }
    assert(
      focusMetric.activeIsTrigger,
      `${scenarioName} 业务弹窗关闭后焦点未回到触发按钮: ${JSON.stringify(focusMetric)}`
    )
  }

  return {
    assertBusinessFormModalKeyboardRecovery,
  }
}
