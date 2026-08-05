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
    if (modalMetrics.panelText.includes('style-l1-evidence.txt')) {
      assert(
        modalMetrics.panelText.includes('上传人：demo_boss') &&
          modalMetrics.panelText.includes('上传时间：'),
        `${scenarioName} 已保存附件应显示上传人和上传时间: ${JSON.stringify(
          modalMetrics
        )}`
      )
      assert(
        !modalMetrics.panelText.includes('text/plain') &&
          !modalMetrics.panelText.includes('uploaded_by'),
        `${scenarioName} 附件行不应暴露 MIME 或内部字段名: ${JSON.stringify(
          modalMetrics
        )}`
      )
      await page.screenshot({
        path: `output/playwright/style-l1/${scenarioName}-saved-attachment-audit.png`,
      })

      const withdrawButton = modal.getByRole('button', {
        name: '撤销附件',
      })
      assert.equal(
        await withdrawButton.count(),
        1,
        `${scenarioName} 已保存 Workflow 附件必须提供唯一撤销动作`
      )
      assert.equal(
        await withdrawButton.first().isDisabled(),
        false,
        `${scenarioName} 可写 Workflow 附件的撤销动作必须可用`
      )
      await withdrawButton.first().click()
      const withdrawalModal = page
        .getByRole('dialog', { name: '撤销附件', exact: true })
        .last()
      await withdrawalModal.waitFor({ state: 'visible', timeout: 10_000 })
      await assertAntdModalCentered(
        page,
        withdrawalModal,
        `${scenarioName}-attachment-withdrawal`
      )
      await page.screenshot({
        path: `output/playwright/style-l1/${scenarioName}-attachment-withdrawal-confirm.png`,
      })
      await withdrawalModal
        .getByRole('textbox', { name: '撤销原因' })
        .fill('浏览器验收：上传了错误版本')
      await withdrawalModal.getByRole('button', { name: '确认撤销' }).click()
      await withdrawalModal.waitFor({ state: 'hidden', timeout: 10_000 })
      await modal.getByText('已撤销', { exact: true }).waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      const withdrawnMetrics = await modal.evaluate((node) => ({
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        previewButtons: Array.from(node.querySelectorAll('button')).filter(
          (button) => button.textContent?.trim() === '预览'
        ).length,
        downloadButtons: Array.from(node.querySelectorAll('button')).filter(
          (button) => button.textContent?.trim() === '下载'
        ).length,
        withdrawDisabled: Array.from(node.querySelectorAll('button')).some(
          (button) =>
            button.textContent?.trim() === '撤销附件' && button.disabled
        ),
        overflowX: node.scrollWidth - node.clientWidth,
      }))
      assert(
        withdrawnMetrics.text.includes('撤销账号：demo_boss') &&
          withdrawnMetrics.text.includes('撤销时间：') &&
          withdrawnMetrics.text.includes(
            '撤销原因：浏览器验收：上传了错误版本'
          ),
        `${scenarioName} 撤销后应保留可读审计: ${JSON.stringify(
          withdrawnMetrics
        )}`
      )
      assert.equal(
        withdrawnMetrics.previewButtons,
        0,
        `${scenarioName} 已撤销附件不应保留预览动作`
      )
      assert.equal(
        withdrawnMetrics.downloadButtons,
        0,
        `${scenarioName} 已撤销附件不应保留下载动作`
      )
      assert(
        withdrawnMetrics.withdrawDisabled && withdrawnMetrics.overflowX <= 1,
        `${scenarioName} 已撤销动作应置灰且弹窗不横向溢出: ${JSON.stringify(
          withdrawnMetrics
        )}`
      )
      await page.screenshot({
        path: `output/playwright/style-l1/${scenarioName}-withdrawn-attachment-audit.png`,
      })
    }

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
