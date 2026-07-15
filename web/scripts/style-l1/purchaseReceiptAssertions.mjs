export function createPurchaseReceiptAssertions(deps) {
  const { assert, path, outputDir, assertThemeReadable, expectText } = deps

  async function selectPurchaseReceiptRow(page, receiptNo) {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(receiptNo, { exact: true }) })
      .first()
    await row.scrollIntoViewIfNeeded()
    await row.click()
    await expectText(page, `${receiptNo} /`)
    return row
  }

  async function assertPurchaseReceiptActionButtonState(
    page,
    { name, disabled, scenarioName }
  ) {
    const buttonScope =
      name === '添加明细'
        ? page.locator('.erp-purchase-receipt-inline-item-panel')
        : page.locator('.erp-business-selection-action-bar__actions')
    const button = buttonScope
      .locator('button')
      .filter({ hasText: name })
      .first()
    await button.waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await button.evaluate((node) => ({
      text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
      disabled: Boolean(node.disabled),
      ariaDisabled: node.getAttribute('aria-disabled') || '',
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
    }))
    assert.equal(
      metrics.disabled,
      disabled,
      `${scenarioName} 操作按钮禁用态不符合状态边界: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.width >= 72 && metrics.height >= 24,
      `${scenarioName} 操作按钮尺寸异常: ${JSON.stringify(metrics)}`
    )
  }

  async function assertPurchaseReceiptRowItemCount(
    page,
    receiptNo,
    expectedCount
  ) {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(receiptNo, { exact: true }) })
      .first()
    await row.waitFor({ state: 'visible', timeout: 10_000 })
    const count = row.locator(
      '.erp-business-row-expand-button, .erp-business-row-item-count'
    )
    await count.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      String((await count.innerText()) || '').replace(/\s+/gu, ''),
      `${expectedCount}条`,
      `${receiptNo} 明细条数未刷新为 ${expectedCount}条`
    )
  }

  async function openPurchaseReceiptAddItemEditor(page) {
    await page
      .locator('.erp-purchase-receipt-inline-item-panel button')
      .filter({ hasText: '添加明细' })
      .first()
      .click()
    const editor = page.locator('.erp-purchase-receipt-inline-item-editor')
    await editor.waitFor({ state: 'visible', timeout: 10_000 })
    await editor.scrollIntoViewIfNeeded()
    return editor
  }

  async function fillPurchaseReceiptAddItemEditorBoundaryValues(page, editor) {
    await choosePurchaseReceiptAddItemEditorOption(
      page,
      editor,
      '材料',
      'MAT-STYLE-L1'
    )
    await choosePurchaseReceiptAddItemEditorOption(
      page,
      editor,
      '仓库',
      'WH-STYLE-L1'
    )
    await choosePurchaseReceiptAddItemEditorOption(page, editor, '单位', 'PCS')
    await fillPurchaseReceiptAddItemEditorField(
      editor,
      '入库数量',
      '2345678901.1234'
    )
    await choosePurchaseReceiptAddItemEditorOption(
      page,
      editor,
      '批次',
      'INV-LOT-001'
    )
    await fillPurchaseReceiptAddItemEditorField(
      editor,
      '批次号',
      'ADD-L1-LOT-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
    )
    await fillPurchaseReceiptAddItemEditorField(
      editor,
      '来源行号',
      'ADD-L1-SOURCE-LINE-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
    )
    await fillPurchaseReceiptAddItemEditorField(editor, '单价', '88888888.1234')
    await fillPurchaseReceiptAddItemEditorField(
      editor,
      '金额',
      '234567890123.45'
    )
    await fillPurchaseReceiptAddItemEditorField(
      editor,
      '备注',
      '添加入库明细 L1 长备注 ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789，验证内联编辑区不伪装批量维护。'
    )
    await page.waitForFunction(
      () => {
        const editorNode = document.querySelector(
          '.erp-purchase-receipt-inline-item-editor'
        )
        if (!editorNode) return false
        const visibleErrors = [
          ...editorNode.querySelectorAll('.ant-form-item-explain-error'),
        ].filter((error) => {
          const rect = error.getBoundingClientRect()
          const style = window.getComputedStyle(error)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        })
        return (
          editorNode.querySelector('.ant-form-item-has-error') === null &&
          visibleErrors.length === 0
        )
      },
      null,
      { timeout: 10_000 }
    )
  }

  async function choosePurchaseReceiptAddItemEditorOption(
    page,
    editor,
    label,
    optionText
  ) {
    const field = purchaseReceiptAddItemEditorField(editor, label)
    await field.locator('.ant-select-selector').click()
    const searchInput = field.locator('.ant-select-selection-search-input')
    await searchInput.fill(optionText)
    const dropdown = page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
      .last()
    await dropdown
      .locator('.ant-select-item-option')
      .filter({ hasText: optionText })
      .first()
      .click()
  }

  async function fillPurchaseReceiptAddItemEditorField(editor, label, value) {
    const field = purchaseReceiptAddItemEditorField(editor, label)
    await field.locator('input,textarea').first().fill(value)
  }

  function purchaseReceiptAddItemEditorField(editor, label) {
    return editor
      .locator('.erp-business-action-form .ant-form-item')
      .filter({ hasText: label })
      .first()
  }

  async function assertPurchaseReceiptAddItemEditorMetrics(
    page,
    editor,
    { scenarioName }
  ) {
    await editor
      .locator('.erp-business-action-form .ant-form-item')
      .nth(9)
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await editor.evaluate((node) => {
      const footer = node.querySelector(
        '.erp-purchase-receipt-inline-item-editor__footer'
      )
      const form = node.querySelector('.erp-business-action-form')
      const fields = Array.from(
        node.querySelectorAll('.erp-business-action-form .ant-form-item')
      ).map((field) => {
        const rect = field.getBoundingClientRect()
        const control = field.querySelector(
          '.ant-select-selector, input.ant-input, textarea.ant-input'
        )
        const controlRect = control?.getBoundingClientRect()
        return {
          text: field.textContent?.replace(/\s+/g, ' ').trim() || '',
          width: rect.width,
          scrollWidth: field.scrollWidth,
          controlWidth: controlRect?.width || 0,
          controlScrollWidth: control?.scrollWidth || 0,
        }
      })
      const editorRect = node.getBoundingClientRect()
      const visibleBusinessModals = Array.from(
        document.querySelectorAll('.erp-business-action-modal--form.ant-modal')
      ).filter((modal) => {
        const rect = modal.getBoundingClientRect()
        const style = window.getComputedStyle(modal)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      const visibleMasks = Array.from(
        document.querySelectorAll('.ant-modal-root .ant-modal-mask')
      ).filter((mask) => {
        const rect = mask.getBoundingClientRect()
        const style = window.getComputedStyle(mask)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        editor: {
          left: editorRect.left,
          right: editorRect.right,
          top: editorRect.top,
          bottom: editorRect.bottom,
          width: editorRect.width,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        },
        form: form
          ? {
              clientWidth: form.clientWidth,
              scrollWidth: form.scrollWidth,
            }
          : null,
        footerButtons: Array.from(footer?.querySelectorAll('button') || []).map(
          (button) => button.textContent?.replace(/\s+/g, '').trim() || ''
        ),
        fields,
        visibleBusinessModalCount: visibleBusinessModals.length,
        visibleMaskCount: visibleMasks.length,
        focusInside: node.contains(document.activeElement),
        visibleErrors: Array.from(
          node.querySelectorAll('.ant-form-item-explain-error')
        )
          .filter((error) => {
            const rect = error.getBoundingClientRect()
            const style = window.getComputedStyle(error)
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            )
          })
          .map((error) => error.textContent?.replace(/\s+/g, ' ').trim() || ''),
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }
    })

    assert(
      metrics.editor.left >= 0 &&
        metrics.editor.right <= metrics.viewportWidth + 1 &&
        metrics.editor.scrollWidth <= metrics.editor.clientWidth + 1,
      `${scenarioName} 添加明细内联编辑区未稳定限制在视口内: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.visibleBusinessModalCount,
      0,
      `${scenarioName} 添加明细不应再打开业务表单弹窗: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.visibleMaskCount,
      0,
      `${scenarioName} 添加明细内联编辑不应新增 modal mask: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.form && metrics.form.scrollWidth <= metrics.form.clientWidth + 1,
      `${scenarioName} 添加明细表单出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 添加明细弹窗打开时页面级横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footerButtons.includes('添加明细') &&
        metrics.footerButtons.includes('取消'),
      `${scenarioName} 添加明细内联编辑底部操作区缺失: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.fields.length >= 10 &&
        metrics.fields.every(
          (field) =>
            field.width >= 110 &&
            field.scrollWidth <= field.width + 2 &&
            field.controlWidth <= field.width + 2 &&
            field.controlScrollWidth <= field.controlWidth + 320
        ),
      `${scenarioName} 长文本或宽数字撑开了添加明细字段: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.visibleErrors.length === 0,
      `${scenarioName} 填充后仍残留必填校验错误: ${JSON.stringify(metrics)}`
    )

    await editor.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
  }

  async function assertPurchaseReceiptAddItemEditorDarkTokens(
    page,
    editor,
    { scenarioName }
  ) {
    const metrics = await editor.evaluate((node) => {
      const head = node.querySelector(
        '.erp-purchase-receipt-inline-item-editor__head'
      )
      const title = node.querySelector(
        '.erp-purchase-receipt-inline-item-editor__head strong'
      )
      const subtitle = node.querySelector(
        '.erp-purchase-receipt-inline-item-editor__head span'
      )
      const form = node.querySelector('.erp-business-action-form')
      const input = node.querySelector('input.ant-input')
      const textarea = node.querySelector('textarea.ant-input')
      const select = node.querySelector('.ant-select-selector')
      const read = (target) => {
        if (!target) return null
        const style = window.getComputedStyle(target)
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          color: style.color,
        }
      }
      return {
        rootTheme: document.documentElement.dataset.erpTheme || '',
        editor: read(node),
        head: read(head),
        title: read(title),
        subtitle: read(subtitle),
        form: read(form),
        input: read(input),
        textarea: read(textarea),
        select: read(select),
      }
    })

    assert.equal(
      metrics.rootTheme,
      'dark',
      `${scenarioName} 未进入暗色主题: ${JSON.stringify(metrics)}`
    )
    for (const [key, value] of Object.entries(metrics)) {
      if (key === 'rootTheme') continue
      if (!value) continue
      assert(
        value.backgroundColor !== 'rgb(255, 255, 255)' &&
          value.color !== 'rgb(23, 32, 51)',
        `${scenarioName} ${key} 仍像浅色 token: ${JSON.stringify(metrics)}`
      )
    }
    await assertThemeReadable(page, {
      scenarioName,
      selector: '.erp-purchase-receipt-inline-item-editor',
    })
  }

  async function assertPurchaseReceiptAddItemEditorMobileLayout(
    page,
    editor,
    { scenarioName }
  ) {
    const metrics = await editor.evaluate((node) => {
      const footer = node.querySelector(
        '.erp-purchase-receipt-inline-item-editor__footer'
      )
      const form = node.querySelector('.erp-business-action-form')
      const firstField = form?.querySelector('.ant-form-item')
      const footerButtons = Array.from(footer?.querySelectorAll('button') || [])
      const editorRect = node.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const firstFieldRect = firstField?.getBoundingClientRect()
      const footerStyle = footer ? window.getComputedStyle(footer) : null
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        editor: {
          left: editorRect.left,
          right: editorRect.right,
          top: editorRect.top,
          bottom: editorRect.bottom,
          width: editorRect.width,
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
        },
        form: form
          ? {
              clientWidth: form.clientWidth,
              scrollWidth: form.scrollWidth,
            }
          : null,
        footer: footerRect
          ? {
              top: footerRect.top,
              bottom: footerRect.bottom,
              width: footerRect.width,
              display: footerStyle?.display || '',
              justifyContent: footerStyle?.justifyContent || '',
            }
          : null,
        footerButtons: footerButtons.map((button) => {
          const rect = button.getBoundingClientRect()
          return {
            text: button.textContent?.replace(/\s+/g, '').trim() || '',
            width: rect.width,
            height: rect.height,
          }
        }),
        firstField: firstFieldRect
          ? {
              width: firstFieldRect.width,
              left: firstFieldRect.left,
              right: firstFieldRect.right,
            }
          : null,
      }
    })

    assert(
      metrics.editor.left >= 0 &&
        metrics.editor.right <= metrics.viewport.width + 1 &&
        metrics.editor.scrollWidth <= metrics.editor.clientWidth + 1,
      `${scenarioName} 移动端添加明细内联编辑区超出视口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.form && metrics.form.scrollWidth <= metrics.form.clientWidth + 1,
      `${scenarioName} 移动端添加明细表单不应横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footerButtons.length >= 2 &&
        metrics.footerButtons.every(
          (button) => button.width >= 120 && button.height >= 32
        ),
      `${scenarioName} 移动端添加明细底部按钮尺寸异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.firstField &&
        metrics.firstField.left >= 0 &&
        metrics.firstField.right <= metrics.viewport.width + 1,
      `${scenarioName} 移动端添加明细首字段不可被弹窗裁切: ${JSON.stringify(metrics)}`
    )

    await editor.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
  }

  async function assertLineItemsUnifiedHorizontalScroll(
    modal,
    { scenarioName, minRows = 1 }
  ) {
    await modal
      .locator(
        '.erp-sales-order-lines-form__list .erp-sales-order-lines-form__row'
      )
      .nth(minRows - 1)
      .waitFor({ state: 'visible', timeout: 10_000 })

    const metrics = await modal.evaluate((node) => {
      const body = node.querySelector('.ant-modal-body')
      const scrollContainer = node.querySelector(
        '.erp-sales-order-lines-form__list'
      )
      const scrollStyle = scrollContainer
        ? window.getComputedStyle(scrollContainer)
        : null
      if (scrollContainer) {
        scrollContainer.scrollLeft =
          scrollContainer.scrollWidth - scrollContainer.clientWidth
      }
      const rows = Array.from(
        scrollContainer?.querySelectorAll('.erp-sales-order-lines-form__row') ||
          []
      ).map((row) => {
        const rect = row.getBoundingClientRect()
        const style = window.getComputedStyle(row)
        return {
          width: rect.width,
          minWidth: style.minWidth,
          overflowX: style.overflowX,
        }
      })
      const grids = Array.from(
        scrollContainer?.querySelectorAll(
          '.erp-sales-order-lines-form__grid'
        ) || []
      ).map((grid) => {
        const rect = grid.getBoundingClientRect()
        const style = window.getComputedStyle(grid)
        return {
          width: rect.width,
          clientWidth: grid.clientWidth,
          scrollWidth: grid.scrollWidth,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          gridAutoFlow: style.gridAutoFlow,
        }
      })
      return {
        body: body
          ? {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
            }
          : null,
        scrollContainer: scrollContainer
          ? {
              clientWidth: scrollContainer.clientWidth,
              scrollWidth: scrollContainer.scrollWidth,
              scrollLeft: scrollContainer.scrollLeft,
              overflowX: scrollStyle?.overflowX || '',
              overflowY: scrollStyle?.overflowY || '',
            }
          : null,
        rows,
        grids,
      }
    })

    assert(
      metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} 弹窗 body 不应承担明细横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scrollContainer &&
        ['auto', 'scroll'].includes(metrics.scrollContainer.overflowX) &&
        metrics.scrollContainer.scrollWidth >
          metrics.scrollContainer.clientWidth + 16 &&
        metrics.scrollContainer.scrollLeft > 0,
      `${scenarioName} 明细应由整体列表容器横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.length >= minRows &&
        metrics.rows.every(
          (row) => row.width > metrics.scrollContainer.clientWidth + 16
        ) &&
        Math.max(...metrics.rows.map((row) => row.width)) -
          Math.min(...metrics.rows.map((row) => row.width)) <=
          2,
      `${scenarioName} 多行明细应共享同一列宽和滚动面: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.grids.length >= minRows &&
        metrics.grids.every(
          (grid) =>
            grid.gridAutoFlow === 'column' &&
            !['auto', 'scroll'].includes(grid.overflowX)
        ),
      `${scenarioName} 每行明细 grid 不应再各自横向滚动: ${JSON.stringify(metrics)}`
    )
  }

  return {
    selectPurchaseReceiptRow,
    assertPurchaseReceiptActionButtonState,
    assertPurchaseReceiptRowItemCount,
    openPurchaseReceiptAddItemEditor,
    fillPurchaseReceiptAddItemEditorBoundaryValues,
    choosePurchaseReceiptAddItemEditorOption,
    fillPurchaseReceiptAddItemEditorField,
    purchaseReceiptAddItemEditorField,
    assertPurchaseReceiptAddItemEditorMetrics,
    assertPurchaseReceiptAddItemEditorDarkTokens,
    assertPurchaseReceiptAddItemEditorMobileLayout,
    assertLineItemsUnifiedHorizontalScroll,
  }
}
