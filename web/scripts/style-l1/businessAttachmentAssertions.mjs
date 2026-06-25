export function createBusinessAttachmentAssertions({
  assert,
  assertAntdModalCentered,
}) {
  async function assertPageAttachmentModalEntrypoint(
    page,
    {
      scenarioName,
      rowText,
      buttonName = '附件',
      modalTitle,
      panelTitle = modalTitle,
    }
  ) {
    await assertNoVisiblePageAttachmentPanel(page, {
      scenarioName,
      checkState: 'before-open',
    })

    if (rowText) {
      const row = page
        .getByRole('row')
        .filter({ has: page.getByText(rowText, { exact: true }) })
        .first()
      await row.scrollIntoViewIfNeeded()
      await row.click()
    }

    const button = page
      .locator('.erp-business-selection-action-bar__actions button')
      .filter({ hasText: buttonName })
      .first()
    await button.waitFor({ state: 'visible', timeout: 10_000 })
    const buttonMetrics = await button.evaluate((node) => ({
      text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
      disabled: Boolean(node.disabled),
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
    }))
    assert.equal(
      buttonMetrics.disabled,
      false,
      `${scenarioName} 附件动作应在选中记录后可打开弹窗: ${JSON.stringify(
        buttonMetrics
      )}`
    )
    assert(
      buttonMetrics.width >= 56 && buttonMetrics.height >= 24,
      `${scenarioName} 附件动作按钮尺寸异常: ${JSON.stringify(buttonMetrics)}`
    )

    await button.click()
    const modal = page
      .locator('.ant-modal:visible')
      .filter({ hasText: modalTitle })
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await assertAntdModalCentered(page, modal, `${scenarioName}-attachment`)
    const modalMetrics = await modal.evaluate((node) => {
      const panel = node.querySelector('.business-attachment-panel')
      const body = node.querySelector('.ant-modal-body')
      const panelHeader = panel?.querySelector(
        '.business-attachment-panel__header'
      )
      const panelRect = panel?.getBoundingClientRect()
      const bodyRect = body?.getBoundingClientRect()
      return {
        hasPanel: Boolean(panel),
        panelText: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
        panelHeaderText:
          panelHeader?.textContent?.replace(/\s+/g, ' ').trim() || '',
        panelOverflowX: panel ? panel.scrollWidth - panel.clientWidth : 0,
        panelWidth: panelRect?.width || 0,
        bodyWidth: bodyRect?.width || 0,
      }
    })
    assert(
      modalMetrics.hasPanel &&
        modalMetrics.panelHeaderText.includes(panelTitle),
      `${scenarioName} 附件弹窗应承载附件面板标题: ${JSON.stringify(
        modalMetrics
      )}`
    )
    assert(
      modalMetrics.panelOverflowX <= 1 &&
        modalMetrics.panelWidth <= modalMetrics.bodyWidth + 1,
      `${scenarioName} 附件弹窗面板不应横向溢出: ${JSON.stringify(
        modalMetrics
      )}`
    )

    await modal.locator('.ant-modal-close').click({ force: true })
    await modal.waitFor({ state: 'hidden', timeout: 10_000 })
    await assertNoVisiblePageAttachmentPanel(page, {
      scenarioName,
      checkState: 'after-close',
    })
  }

  async function assertNoVisiblePageAttachmentPanel(
    page,
    { scenarioName, checkState }
  ) {
    const metrics = await page.evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }
      return Array.from(document.querySelectorAll('.business-attachment-panel'))
        .filter(isVisible)
        .filter((node) => !node.closest('.ant-modal'))
        .map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')
    })
    assert.deepEqual(
      metrics,
      [],
      `${scenarioName} ${checkState} 不应在页面主体常驻渲染附件面板: ${JSON.stringify(
        metrics
      )}`
    )
  }

  return {
    assertNoVisiblePageAttachmentPanel,
    assertPageAttachmentModalEntrypoint,
  }
}
