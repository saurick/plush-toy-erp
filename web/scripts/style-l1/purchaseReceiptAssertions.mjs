export function createPurchaseReceiptAssertions(deps) {
  const {
    assert,
    path,
    outputDir,
    assertAntdModalCentered,
    assertNoBlueFocusStyle,
    assertThemeReadable,
    expectText,
    isAcceptedFocusBorder,
    assertBusinessFormModalKeyboardRecovery,
  } = deps

  async function openPurchaseReceiptCreateModal(page) {
    await page.getByRole('button', { name: /新建入库单/ }).click()
    const modal = page
      .locator('.erp-business-action-modal--form.ant-modal:visible')
      .filter({ hasText: '新建采购入库单' })
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await assertAntdModalCentered(
      page,
      modal,
      'purchase-receipt-create-modal-open'
    )
    return modal
  }

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
    const button = page
      .locator('.erp-business-selection-action-bar__actions button')
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
    const metrics = await row.evaluate((node) => ({
      text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
      cells: Array.from(node.querySelectorAll('td')).map((cell) =>
        cell.textContent?.replace(/\s+/g, ' ').trim()
      ),
    }))
    assert(
      metrics.cells.includes(String(expectedCount)),
      `${receiptNo} 明细行数未刷新为 ${expectedCount}: ${JSON.stringify(metrics)}`
    )
  }

  async function openPurchaseReceiptAddItemModal(page) {
    await page
      .locator('.erp-business-selection-action-bar__actions button')
      .filter({ hasText: '添加明细' })
      .first()
      .click()
    const modal = page
      .locator('.erp-business-action-modal--form.ant-modal:visible')
      .filter({ hasText: '添加入库明细' })
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await assertAntdModalCentered(
      page,
      modal,
      'purchase-receipt-add-item-modal-open'
    )
    return modal
  }

  async function assertPurchaseReceiptCreateModalKeyboardRecovery(page) {
    await assertBusinessFormModalKeyboardRecovery(page, {
      triggerName: /新建入库单/,
      titleText: '新建采购入库单',
      scenarioName: 'purchase-receipt-create-modal',
      closeMode: 'close-button',
    })
  }

  async function fillPurchaseReceiptCreateModalBoundaryValues(page, modal) {
    await modal.locator('input#receipt_no').fill('PR-L1-LONG-0123456789012345')
    await modal
      .locator('input#supplier_name')
      .fill('样式供应商-超长名称-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789')
    await modal
      .locator('textarea#note')
      .first()
      .fill('采购入库整单创建 L1 头部备注，验证长文本不会撑开弹窗。')

    await choosePurchaseReceiptModalOption(page, modal, '材料', 'MAT-STYLE-L1')
    await choosePurchaseReceiptModalOption(page, modal, '仓库', 'WH-STYLE-L1')
    await choosePurchaseReceiptModalOption(page, modal, '单位', 'PCS')
    await fillPurchaseReceiptModalGridField(
      modal,
      '入库数量',
      '1234567890.1234'
    )
    await choosePurchaseReceiptModalOption(page, modal, '批次', 'INV-LOT-001')
    await fillPurchaseReceiptModalGridField(
      modal,
      '批次号',
      'LOT-L1-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
    )
    await fillPurchaseReceiptModalGridField(
      modal,
      '来源行号',
      'SOURCE-LINE-L1-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
    )
    await fillPurchaseReceiptModalGridField(modal, '单价', '99999999.1234')
    await fillPurchaseReceiptModalGridField(modal, '金额', '123456789012.34')
    await fillPurchaseReceiptModalGridField(
      modal,
      '备注',
      '明细长备注 ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789，验证横向滚动与相邻区域。'
    )
  }

  async function fillPurchaseReceiptAddItemModalBoundaryValues(page, modal) {
    await choosePurchaseReceiptAddItemModalOption(
      page,
      modal,
      '材料',
      'MAT-STYLE-L1'
    )
    await choosePurchaseReceiptAddItemModalOption(
      page,
      modal,
      '仓库',
      'WH-STYLE-L1'
    )
    await choosePurchaseReceiptAddItemModalOption(page, modal, '单位', 'PCS')
    await fillPurchaseReceiptAddItemModalField(
      modal,
      '入库数量',
      '2345678901.1234'
    )
    await choosePurchaseReceiptAddItemModalOption(
      page,
      modal,
      '批次',
      'INV-LOT-001'
    )
    await fillPurchaseReceiptAddItemModalField(
      modal,
      '批次号',
      'ADD-L1-LOT-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
    )
    await fillPurchaseReceiptAddItemModalField(
      modal,
      '来源行号',
      'ADD-L1-SOURCE-LINE-ABCDEFGHIJKLMNOPQRSTUVWXYZ-0123456789'
    )
    await fillPurchaseReceiptAddItemModalField(modal, '单价', '88888888.1234')
    await fillPurchaseReceiptAddItemModalField(modal, '金额', '234567890123.45')
    await fillPurchaseReceiptAddItemModalField(
      modal,
      '备注',
      '添加入库明细 L1 长备注 ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789，验证单行弹窗不伪装批量维护。'
    )
  }

  async function choosePurchaseReceiptModalOption(
    page,
    modal,
    label,
    optionText
  ) {
    const field = purchaseReceiptModalGridField(modal, label)
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

  async function fillPurchaseReceiptModalGridField(modal, label, value) {
    const field = purchaseReceiptModalGridField(modal, label)
    await field.locator('input,textarea').first().fill(value)
  }

  function purchaseReceiptModalGridField(modal, label) {
    return modal
      .locator('.erp-master-contact-list__grid .ant-form-item')
      .filter({ hasText: label })
      .first()
  }

  async function choosePurchaseReceiptAddItemModalOption(
    page,
    modal,
    label,
    optionText
  ) {
    const field = purchaseReceiptAddItemModalField(modal, label)
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

  async function fillPurchaseReceiptAddItemModalField(modal, label, value) {
    const field = purchaseReceiptAddItemModalField(modal, label)
    await field.locator('input,textarea').first().fill(value)
  }

  function purchaseReceiptAddItemModalField(modal, label) {
    return modal
      .locator('.erp-business-action-form .ant-form-item')
      .filter({ hasText: label })
      .first()
  }

  async function assertPurchaseReceiptCreateModalMetrics(
    page,
    modal,
    { scenarioName, expectedRows }
  ) {
    await modal
      .locator('.erp-master-contact-list__row')
      .nth(expectedRows - 1)
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await modal.evaluate((node) => {
      const body = node.querySelector('.ant-modal-body')
      const footer = node.querySelector('.ant-modal-footer')
      const section = node.querySelector('.erp-master-contact-list')
      const itemRows = Array.from(
        node.querySelectorAll('.erp-master-contact-list__row')
      )
      const itemLists = Array.from(
        node.querySelectorAll('.erp-master-contact-list__items')
      ).map((list) => {
        const listStyle = window.getComputedStyle(list)
        list.scrollLeft = list.scrollWidth - list.clientWidth
        const rows = Array.from(
          list.querySelectorAll('.erp-master-contact-list__row')
        ).map((row) => {
          const rect = row.getBoundingClientRect()
          const rowStyle = window.getComputedStyle(row)
          return {
            width: rect.width,
            minWidth: rowStyle.minWidth,
            overflowX: rowStyle.overflowX,
          }
        })
        const grids = Array.from(
          list.querySelectorAll('.erp-master-contact-list__grid')
        ).map((grid) => {
          const style = window.getComputedStyle(grid)
          return {
            clientWidth: grid.clientWidth,
            scrollWidth: grid.scrollWidth,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            gridAutoFlow: style.gridAutoFlow,
          }
        })
        return {
          clientWidth: list.clientWidth,
          scrollWidth: list.scrollWidth,
          scrollLeft: list.scrollLeft,
          overflowX: listStyle.overflowX,
          overflowY: listStyle.overflowY,
          rows,
          grids,
        }
      })
      const fields = Array.from(
        node.querySelectorAll('.erp-master-contact-list__grid .ant-form-item')
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
      const modalRect = node.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const sectionRect = section?.getBoundingClientRect()
      return {
        modal: {
          left: modalRect.left,
          right: modalRect.right,
          top: modalRect.top,
          bottom: modalRect.bottom,
          width: modalRect.width,
        },
        body: body
          ? {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
              clientHeight: body.clientHeight,
              scrollHeight: body.scrollHeight,
            }
          : null,
        footer: footerRect
          ? {
              top: footerRect.top,
              bottom: footerRect.bottom,
              width: footerRect.width,
            }
          : null,
        section: sectionRect
          ? {
              width: sectionRect.width,
              scrollWidth: section?.scrollWidth || 0,
            }
          : null,
        itemRowCount: itemRows.length,
        itemLists,
        fields,
        footerText: footer?.textContent?.replace(/\s+/g, ' ').trim() || '',
        footerButtons: Array.from(footer?.querySelectorAll('button') || []).map(
          (button) =>
            button.getAttribute('aria-label') ||
            button.textContent?.replace(/\s+/g, '').trim() ||
            ''
        ),
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
        validationText: String(node.textContent || ''),
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      }
    })

    assert.equal(
      metrics.itemRowCount,
      expectedRows,
      `${scenarioName} 明细行数量未恢复到预期: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.modal.left >= 0 &&
        metrics.modal.right <= metrics.viewportWidth + 1 &&
        metrics.modal.top >= 0 &&
        metrics.modal.bottom <= metrics.viewportHeight + 1,
      `${scenarioName} 业务弹窗未稳定限制在视口内: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} 弹窗 body 出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 弹窗打开时页面级横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footerButtons.includes('创建草稿') &&
        metrics.footerButtons.includes('关闭'),
      `${scenarioName} 业务弹窗底部操作区缺失: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.itemLists.length > 0 &&
        metrics.itemLists.every(
          (list) =>
            ['auto', 'scroll'].includes(list.overflowX) &&
            ['auto', 'visible'].includes(list.overflowY) &&
            list.scrollWidth > list.clientWidth + 16 &&
            list.scrollLeft > 0
        ),
      `${scenarioName} 入库明细应由外层列表整体横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.itemLists.every(
        (list) =>
          list.rows.length === expectedRows &&
          list.rows.every((row) => row.width > list.clientWidth + 16) &&
          Math.max(...list.rows.map((row) => row.width)) -
            Math.min(...list.rows.map((row) => row.width)) <=
            2 &&
          list.grids.length === expectedRows &&
          list.grids.every(
            (grid) =>
              grid.gridAutoFlow === 'column' &&
              !['auto', 'scroll'].includes(grid.overflowX)
          )
      ),
      `${scenarioName} 多行入库明细应共享同一列宽和滚动面: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.fields.every(
        (field) =>
          field.width >= 220 &&
          field.scrollWidth <= field.width + 2 &&
          field.controlWidth <= field.width + 2 &&
          field.controlScrollWidth <= field.controlWidth + 260
      ),
      `${scenarioName} 长文本或宽数字撑开了明细字段: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.visibleErrors.length === 0,
      `${scenarioName} 填充后仍残留必填校验错误: ${JSON.stringify(metrics)}`
    )

    await modal.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
  }

  async function assertPurchaseReceiptAddItemModalMetrics(
    page,
    modal,
    { scenarioName }
  ) {
    await modal
      .locator('.erp-business-action-form .ant-form-item')
      .nth(9)
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await modal.evaluate((node) => {
      const body = node.querySelector('.ant-modal-body')
      const footer = node.querySelector('.ant-modal-footer')
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
      const modalRect = node.getBoundingClientRect()
      return {
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        modal: {
          left: modalRect.left,
          right: modalRect.right,
          top: modalRect.top,
          bottom: modalRect.bottom,
          width: modalRect.width,
        },
        body: body
          ? {
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
              clientHeight: body.clientHeight,
              scrollHeight: body.scrollHeight,
            }
          : null,
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
      metrics.modal.left >= 0 &&
        metrics.modal.right <= metrics.viewportWidth + 1 &&
        metrics.modal.top >= 0 &&
        metrics.modal.bottom <= metrics.viewportHeight + 1,
      `${scenarioName} 添加明细弹窗未稳定限制在视口内: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body && metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} 添加明细弹窗 body 出现横向溢出: ${JSON.stringify(metrics)}`
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
        metrics.footerButtons.includes('关闭'),
      `${scenarioName} 添加明细弹窗底部操作区缺失: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.fields.length >= 10 &&
        metrics.fields.every(
          (field) =>
            field.width >= 220 &&
            field.scrollWidth <= field.width + 2 &&
            field.controlWidth <= field.width + 2 &&
            field.controlScrollWidth <= field.controlWidth + 280
        ),
      `${scenarioName} 长文本或宽数字撑开了添加明细字段: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.visibleErrors.length === 0,
      `${scenarioName} 填充后仍残留必填校验错误: ${JSON.stringify(metrics)}`
    )

    await modal.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
  }

  async function assertPurchaseReceiptAddItemModalDarkTokens(
    page,
    modal,
    { scenarioName }
  ) {
    const metrics = await modal.evaluate((node) => {
      const content = node.querySelector('.ant-modal-content')
      const header = node.querySelector('.ant-modal-header')
      const body = node.querySelector('.ant-modal-body')
      const footer = node.querySelector('.ant-modal-footer')
      const title = node.querySelector('.erp-business-action-modal__title span')
      const subtitle = node.querySelector(
        '.erp-business-action-modal__title small'
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
        content: read(content),
        header: read(header),
        body: read(body),
        footer: read(footer),
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
      selector: '.erp-business-action-modal--form .ant-modal-content',
    })
  }

  async function assertPurchaseReceiptAddItemModalMobileLayout(
    page,
    modal,
    { scenarioName }
  ) {
    const metrics = await modal.evaluate((node) => {
      const content = node.querySelector('.ant-modal-content')
      const body = node.querySelector('.ant-modal-body')
      const footer = node.querySelector('.ant-modal-footer')
      const form = node.querySelector('.erp-business-action-form')
      const firstField = form?.querySelector('.ant-form-item')
      const footerButtons = Array.from(footer?.querySelectorAll('button') || [])
      const modalRect = node.getBoundingClientRect()
      const contentRect = content?.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const firstFieldRect = firstField?.getBoundingClientRect()
      const footerStyle = footer ? window.getComputedStyle(footer) : null
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        modal: {
          left: modalRect.left,
          right: modalRect.right,
          top: modalRect.top,
          bottom: modalRect.bottom,
          width: modalRect.width,
        },
        content: contentRect
          ? {
              height: contentRect.height,
              bottom: contentRect.bottom,
            }
          : null,
        body: body
          ? {
              clientHeight: body.clientHeight,
              scrollHeight: body.scrollHeight,
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
            }
          : null,
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
      metrics.modal.left >= 0 &&
        metrics.modal.right <= metrics.viewport.width + 1 &&
        metrics.modal.top >= 0 &&
        metrics.modal.bottom <= metrics.viewport.height + 1,
      `${scenarioName} 移动端添加明细弹窗超出视口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.content && metrics.content.bottom <= metrics.viewport.height + 1,
      `${scenarioName} 移动端添加明细内容高度超出视口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body &&
        metrics.body.scrollHeight > metrics.body.clientHeight &&
        metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} 移动端添加明细 body 应纵向滚动且不横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.form && metrics.form.scrollWidth <= metrics.form.clientWidth + 1,
      `${scenarioName} 移动端添加明细表单不应横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footerButtons.length >= 2 &&
        metrics.footerButtons.every(
          (button) => button.width >= 120 && button.height >= 34
        ),
      `${scenarioName} 移动端添加明细底部按钮尺寸异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.firstField &&
        metrics.firstField.left >= 0 &&
        metrics.firstField.right <= metrics.viewport.width + 1,
      `${scenarioName} 移动端添加明细首字段不可被弹窗裁切: ${JSON.stringify(metrics)}`
    )

    await modal.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
  }

  async function assertPurchaseReceiptCreateModalFocusStyles(
    page,
    modal,
    { scenarioName }
  ) {
    const targets = [
      {
        label: '入库单号',
        locator: modal.locator('input#receipt_no'),
      },
      {
        label: '头部备注',
        locator: modal.locator('textarea#note').first(),
      },
      {
        label: '材料下拉',
        locator: modal
          .locator('.erp-master-contact-list__grid .ant-form-item')
          .filter({ hasText: '材料' })
          .first()
          .locator('.ant-select-selection-search-input'),
      },
      {
        label: '入库数量',
        locator: purchaseReceiptModalGridField(modal, '入库数量')
          .locator('input.ant-input')
          .first(),
      },
    ]

    const checked = []
    for (const target of targets) {
      await target.locator.waitFor({ state: 'visible', timeout: 10_000 })
      await target.locator.evaluate((node) => {
        node.focus({ preventScroll: true })
      })
      await page.waitForTimeout(120)
      const metrics = await target.locator.evaluate((node, label) => {
        let focusedControl = node
        if (
          !node.matches('.ant-select-selector') &&
          !node.matches('.ant-input-affix-wrapper')
        ) {
          focusedControl =
            node
              .closest('.ant-select')
              ?.querySelector('.ant-select-selector') ||
            node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node.closest('.ant-picker') ||
            node
        }
        const style = window.getComputedStyle(focusedControl)
        const rect = focusedControl.getBoundingClientRect()
        return {
          label,
          tagName: focusedControl.tagName,
          className: String(focusedControl.className || ''),
          borderColor: style.borderColor,
          borderRadius: style.borderRadius,
          boxShadow: style.boxShadow,
          outlineStyle: style.outlineStyle,
          outlineWidth: style.outlineWidth,
          width: rect.width,
          height: rect.height,
          matchesFocus:
            focusedControl.matches(':focus') ||
            Boolean(focusedControl.querySelector(':focus')),
        }
      }, target.label)
      checked.push(metrics)
    }

    assert.equal(
      checked.length,
      targets.length,
      `${scenarioName} 未完整验证采购入库弹窗 focus 控件: ${JSON.stringify(checked)}`
    )
    checked.forEach((metrics) => {
      assert(
        metrics.matchesFocus && metrics.width >= 120 && metrics.height >= 30,
        `${scenarioName} ${metrics.label} 未获得稳定焦点: ${JSON.stringify(metrics)}`
      )
      assert(
        isAcceptedFocusBorder(metrics),
        `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
      )
      assert(
        Number.parseFloat(metrics.borderRadius) >= 9,
        `${scenarioName} ${metrics.label} 输入框圆角未符合业务弹窗基线: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.outlineStyle === 'none' || metrics.outlineWidth === '0px',
        `${scenarioName} ${metrics.label} focus 仍暴露浏览器默认 outline: ${JSON.stringify(metrics)}`
      )
      assertNoBlueFocusStyle(metrics, scenarioName)
    })
  }

  async function assertPurchaseReceiptCreateModalDarkTokens(
    page,
    modal,
    { scenarioName }
  ) {
    const metrics = await modal.evaluate((node) => {
      const content = node.querySelector('.ant-modal-content')
      const header = node.querySelector('.ant-modal-header')
      const body = node.querySelector('.ant-modal-body')
      const footer = node.querySelector('.ant-modal-footer')
      const title = node.querySelector('.erp-business-action-modal__title span')
      const subtitle = node.querySelector(
        '.erp-business-action-modal__title small'
      )
      const section = node.querySelector('.erp-master-contact-list')
      const row = node.querySelector('.erp-master-contact-list__row')
      const input = node.querySelector('input.ant-input')
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
        content: read(content),
        header: read(header),
        body: read(body),
        footer: read(footer),
        title: read(title),
        subtitle: read(subtitle),
        section: read(section),
        row: read(row),
        input: read(input),
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
      selector: '.erp-business-action-modal--form .ant-modal-content',
    })
  }

  async function assertPurchaseReceiptCreateModalMobileLayout(
    page,
    modal,
    { scenarioName }
  ) {
    const metrics = await modal.evaluate((node) => {
      const content = node.querySelector('.ant-modal-content')
      const body = node.querySelector('.ant-modal-body')
      const footer = node.querySelector('.ant-modal-footer')
      const footerButtons = Array.from(footer?.querySelectorAll('button') || [])
      const list = node.querySelector('.erp-master-contact-list__items')
      const grid = node.querySelector('.erp-master-contact-list__grid')
      if (list) {
        list.scrollLeft = 0
      }
      const firstField = grid?.querySelector('.ant-form-item')
      const modalRect = node.getBoundingClientRect()
      const contentRect = content?.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const listRect = list?.getBoundingClientRect()
      const firstFieldRect = firstField?.getBoundingClientRect()
      const footerStyle = footer ? window.getComputedStyle(footer) : null
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        modal: {
          left: modalRect.left,
          right: modalRect.right,
          top: modalRect.top,
          bottom: modalRect.bottom,
          width: modalRect.width,
        },
        content: contentRect
          ? {
              height: contentRect.height,
              bottom: contentRect.bottom,
            }
          : null,
        body: body
          ? {
              clientHeight: body.clientHeight,
              scrollHeight: body.scrollHeight,
              clientWidth: body.clientWidth,
              scrollWidth: body.scrollWidth,
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
        list: list
          ? {
              clientWidth: list.clientWidth,
              scrollWidth: list.scrollWidth,
              left: listRect?.left || 0,
              right: listRect?.right || 0,
              overflowX: window.getComputedStyle(list).overflowX,
            }
          : null,
        grid: grid
          ? {
              clientWidth: grid.clientWidth,
              scrollWidth: grid.scrollWidth,
              overflowX: window.getComputedStyle(grid).overflowX,
            }
          : null,
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
      metrics.modal.left >= 0 &&
        metrics.modal.right <= metrics.viewport.width + 1 &&
        metrics.modal.top >= 0 &&
        metrics.modal.bottom <= metrics.viewport.height + 1,
      `${scenarioName} 移动端弹窗超出视口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.content && metrics.content.bottom <= metrics.viewport.height + 1,
      `${scenarioName} 移动端弹窗内容高度超出视口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body &&
        metrics.body.scrollHeight > metrics.body.clientHeight &&
        metrics.body.scrollWidth <= metrics.body.clientWidth + 1,
      `${scenarioName} 移动端弹窗 body 应纵向滚动且不横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footerButtons.length >= 2 &&
        metrics.footerButtons.every(
          (button) => button.width >= 120 && button.height >= 34
        ),
      `${scenarioName} 移动端底部按钮尺寸异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.list &&
        ['auto', 'scroll'].includes(metrics.list.overflowX) &&
        metrics.list.scrollWidth > metrics.list.clientWidth,
      `${scenarioName} 移动端明细应由外层列表承接横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.grid && !['auto', 'scroll'].includes(metrics.grid.overflowX),
      `${scenarioName} 移动端明细 grid 不应再各自横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.firstField &&
        metrics.list &&
        metrics.list.left >= 0 &&
        metrics.list.right <= metrics.viewport.width + 1 &&
        metrics.firstField.left >= metrics.list.left - 1 &&
        metrics.firstField.left <= metrics.list.right + 1,
      `${scenarioName} 移动端首个明细字段应从外层滚动区内可见: ${JSON.stringify(metrics)}`
    )

    await modal.screenshot({
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
    openPurchaseReceiptCreateModal,
    selectPurchaseReceiptRow,
    assertPurchaseReceiptActionButtonState,
    assertPurchaseReceiptRowItemCount,
    openPurchaseReceiptAddItemModal,
    assertPurchaseReceiptCreateModalKeyboardRecovery,
    fillPurchaseReceiptCreateModalBoundaryValues,
    fillPurchaseReceiptAddItemModalBoundaryValues,
    choosePurchaseReceiptModalOption,
    fillPurchaseReceiptModalGridField,
    purchaseReceiptModalGridField,
    choosePurchaseReceiptAddItemModalOption,
    fillPurchaseReceiptAddItemModalField,
    purchaseReceiptAddItemModalField,
    assertPurchaseReceiptCreateModalMetrics,
    assertPurchaseReceiptAddItemModalMetrics,
    assertPurchaseReceiptAddItemModalDarkTokens,
    assertPurchaseReceiptAddItemModalMobileLayout,
    assertPurchaseReceiptCreateModalFocusStyles,
    assertPurchaseReceiptCreateModalDarkTokens,
    assertPurchaseReceiptCreateModalMobileLayout,
    assertLineItemsUnifiedHorizontalScroll,
  }
}
