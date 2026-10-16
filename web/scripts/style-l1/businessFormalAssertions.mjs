import { waitForFiniteAnimations } from './browserReadiness.mjs'

import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'

export function createBusinessFormalAssertions(deps) {
  const { assert, expectButton, expectNoButton, expectText } = deps
  const compactVisibleText = (value) =>
    String(value || '').replace(/[\s\p{Cf}]+/gu, '')

  const {
    assertLineItemAddActionScrollsToNewRow,
    assertLineItemDuplicateAction,
    assertLineItemFieldLayout,
    assertLineAmountCalculation,
    assertLineQuantityPrecisionBlocksAmount,
    assertLineQuantityUnitSuffix,
    assertLineSourceSummaryReadableUnit,
  } = createLineItemUnitAssertions({
    assert,
  })

  const findSelectionActionButton = async (page, actionName) => {
    const directButtons = page.locator('button').filter({ hasText: actionName })
    for (let index = 0; index < (await directButtons.count()); index += 1) {
      const candidate = directButtons.nth(index)
      if (
        (await candidate.isVisible()) &&
        compactVisibleText(await candidate.innerText()) ===
          compactVisibleText(actionName)
      ) {
        return candidate
      }
    }

    const moreButtons = page.getByRole('button', { name: /更多操作/u })
    let moreButton = null
    for (let index = 0; index < (await moreButtons.count()); index += 1) {
      const candidate = moreButtons.nth(index)
      if (await candidate.isVisible()) moreButton = candidate
    }
    if (!moreButton) {
      const metrics = await page.evaluate(() => ({
        selectedRows: Array.from(
          document.querySelectorAll('.ant-table-row-selected')
        ).map((row) =>
          String(row.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim()
        ),
        actionBars: Array.from(
          document.querySelectorAll('.erp-business-module-current-action')
        ).map((bar) => ({
          text: String(bar.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          buttons: Array.from(bar.querySelectorAll('button')).map((button) => ({
            text: String(button.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            disabled: button.disabled,
            visible: Boolean(button.offsetWidth || button.offsetHeight),
          })),
        })),
      }))
      throw new Error(
        `未找到可触达的操作“${actionName}”: ${JSON.stringify(metrics)}`
      )
    }
    const actionMenuID = await moreButton.getAttribute('aria-controls')
    if ((await moreButton.getAttribute('aria-expanded')) !== 'true') {
      await moreButton.click()
    }
    const actionMenu = actionMenuID
      ? page.locator(`[id=${JSON.stringify(actionMenuID)}]`)
      : page.locator('.erp-business-selection-action-menu:visible').last()
    await actionMenu.waitFor({ state: 'visible' })
    const overflowButtons = actionMenu
      .locator('button')
      .filter({ hasText: actionName })
    for (let index = 0; index < (await overflowButtons.count()); index += 1) {
      const candidate = overflowButtons.nth(index)
      if (
        compactVisibleText(await candidate.innerText()) ===
        compactVisibleText(actionName)
      ) {
        await candidate.waitFor({ state: 'visible' })
        return candidate
      }
    }
    const menuMetrics = await actionMenu.evaluateAll((menus) =>
      menus.map((menu) => ({
        text: String(menu.textContent || '')
          .replace(/\s+/gu, ' ')
          .trim(),
        buttons: Array.from(menu.querySelectorAll('button')).map((button) => ({
          key: button.getAttribute('data-business-action-key') || '',
          text: String(button.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          disabled: button.disabled,
        })),
      }))
    )
    throw new Error(
      `更多操作中缺少“${actionName}”: ${JSON.stringify(menuMetrics)}`
    )
  }

  const confirmVisiblePopconfirm = async (page) => {
    const popconfirm = page.locator('.ant-popconfirm:visible').last()
    await popconfirm.waitFor({ state: 'visible' })
    const confirmButton = popconfirm
      .getByRole('button', { name: /^确\s*认$/u })
      .last()
    await confirmButton.waitFor({ state: 'visible' })
    await confirmButton.click()
  }

  const assertBusinessViewTabSelectedStyle = async (
    page,
    { scenarioName, tabName }
  ) => {
    const metrics = await page
      .getByRole('tab', { name: tabName })
      .evaluate((node) => {
        const tab = node.closest('.ant-tabs-tab') || node
        const tabs = tab.closest('.ant-tabs')
        const list = tab.closest('.ant-tabs-nav-list')
        const style = window.getComputedStyle(tab)
        const indicator = list
          ? window.getComputedStyle(list, '::before')
          : null
        return {
          active: tab.classList.contains('ant-tabs-tab-active'),
          slidingTabs: Boolean(tabs?.classList.contains('erp-sliding-tabs')),
          indicatorReady: list?.dataset.slidingReady === 'true',
          indicatorBackgroundColor: indicator?.backgroundColor || '',
          indicatorBoxShadow: indicator?.boxShadow || '',
          indicatorOpacity: indicator?.opacity || '',
          indicatorWidth: Number.parseFloat(indicator?.width || '0'),
          indicatorHeight: Number.parseFloat(indicator?.height || '0'),
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        }
      })
    const background = String(metrics.indicatorBackgroundColor || '')
      .replace(/\s/g, '')
      .toLowerCase()
    assert(
      metrics.active &&
        metrics.slidingTabs &&
        metrics.indicatorReady &&
        Number(metrics.indicatorOpacity) > 0 &&
        metrics.indicatorWidth > 0 &&
        metrics.indicatorHeight > 0 &&
        (background === 'rgba(0,0,0,0)' || background === 'transparent') &&
        metrics.indicatorBoxShadow.includes('inset') &&
        metrics.indicatorBoxShadow.includes('-2px'),
      `${scenarioName} 主视图 Tab 应显示共享的选中下划线: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      !metrics.boxShadow || metrics.boxShadow === 'none',
      `${scenarioName} 主视图 Tab 不应出现激活阴影: ${JSON.stringify(metrics)}`
    )
  }

  const assertLineItemSectionTitleBold = async (
    modal,
    { scenarioName, titleText }
  ) => {
    const metrics = await modal
      .locator('.erp-sales-order-lines-form__head strong')
      .filter({ hasText: titleText })
      .first()
      .evaluate((node) => {
        const style = window.getComputedStyle(node)
        return {
          text: node.textContent?.trim() || '',
          fontWeight: style.fontWeight,
        }
      })
    assert(
      Number.parseInt(metrics.fontWeight, 10) >= 700,
      `${scenarioName} ${titleText} 标题应保持加粗: ${JSON.stringify(metrics)}`
    )
  }

  const assertNonItemTextareaFullRow = async (
    modal,
    { labels, scenarioName }
  ) => {
    const metrics = await modal.evaluate((node, expectedLabels) => {
      const normalizeText = (value) =>
        String(value || '')
          .replace(/\s+/gu, '')
          .trim()
      const form = node.querySelector('.erp-business-action-form')
      const formRect = form?.getBoundingClientRect()
      return expectedLabels.map((label) => {
        const normalizedLabel = normalizeText(label)
        const candidates = Array.from(node.querySelectorAll('.ant-form-item'))
          .filter(
            (item) =>
              !item.closest('.erp-line-item-details__fields') &&
              !item.closest('.erp-contact-editor') &&
              !item.closest('.erp-purchase-receipt-inline-item-form') &&
              item.querySelector('textarea')
          )
          .filter((item) => {
            const itemLabel = item.querySelector('.ant-form-item-label')
            return normalizeText(itemLabel?.textContent) === normalizedLabel
          })
        const item = candidates[0]
        const rect = item?.getBoundingClientRect()
        const style = item ? window.getComputedStyle(item) : null
        return {
          label,
          found: Boolean(item),
          className: item?.className || '',
          gridColumnStart: style?.gridColumnStart || '',
          gridColumnEnd: style?.gridColumnEnd || '',
          itemLeft: rect?.left || 0,
          itemRight: rect?.right || 0,
          itemWidth: rect?.width || 0,
          formLeft: formRect?.left || 0,
          formRight: formRect?.right || 0,
          formWidth: formRect?.width || 0,
          scrollWidth: item?.scrollWidth || 0,
          clientWidth: item?.clientWidth || 0,
        }
      })
    }, labels)

    for (const metric of metrics) {
      assert(
        metric.found &&
          metric.className.includes('erp-business-action-form__field--full') &&
          metric.gridColumnStart === '1' &&
          metric.gridColumnEnd === '-1' &&
          Math.abs(metric.itemLeft - metric.formLeft) <= 2 &&
          Math.abs(metric.itemRight - metric.formRight) <= 2 &&
          metric.itemWidth >= metric.formWidth - 2 &&
          metric.scrollWidth <= metric.clientWidth + 1,
        `${scenarioName} 非 item 备注应独占表单整行: ${JSON.stringify(metric)}`
      )
    }
  }

  const waitForMasterDataRequest = async (
    page,
    masterDataMethods,
    { method, fromIndex, scenarioName }
  ) => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (masterDataMethods.slice(fromIndex).includes(method)) {
        return
      }
      await page.waitForTimeout(100)
    }
    assert(
      false,
      `${scenarioName} 应重新请求 ${method}: ${JSON.stringify(
        masterDataMethods.slice(fromIndex)
      )}`
    )
  }

  const assertNoMasterDataRequest = async (
    page,
    masterDataMethods,
    { methods, fromIndex, scenarioName }
  ) => {
    await page.waitForTimeout(600)
    const requested = masterDataMethods.slice(fromIndex)
    const unexpected = requested.filter((method) => methods.includes(method))
    assert(
      unexpected.length === 0,
      `${scenarioName} 不应重复请求 ${methods.join(' / ')}: ${JSON.stringify(
        requested
      )}`
    )
  }

  const waitForCapturedMethods = async (
    methods,
    expectedMethods,
    { scenarioName }
  ) => {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (expectedMethods.every((method) => methods.includes(method))) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert(
      false,
      `${scenarioName} 未捕获预期 RPC 方法: ${JSON.stringify({
        expectedMethods,
        methods,
      })}`
    )
  }

  const assertBusinessCollaborationPanelAbsent = async (page, scenarioName) => {
    assert.equal(
      await page.locator('.erp-business-collaboration-task-panel').count(),
      0,
      `${scenarioName} 不应展示空面板或重复的当前记录任务面板`
    )
  }

  const assertUnifiedListToolbarShell = async (
    page,
    {
      scenarioName,
      exportVisible = true,
      exportDisabled = false,
      exportTooltip = '',
      columnOrderDisabled = false,
    }
  ) => {
    const labels = exportVisible ? ['导出筛选结果', '列设置'] : ['列设置']
    for (const label of labels) {
      await expectButton(page, label)
    }
    const exportButton = page
      .getByRole('button', { name: '导出筛选结果' })
      .first()
    const columnOrderButton = page
      .getByRole('button', { name: '列设置' })
      .first()
    if (exportVisible) {
      assert.equal(
        await exportButton.isDisabled(),
        exportDisabled,
        `${scenarioName} 导出筛选结果按钮禁用态不符合当前页面能力边界`
      )
    } else {
      await expectNoButton(page, '导出筛选结果')
    }
    assert.equal(
      await columnOrderButton.isDisabled(),
      columnOrderDisabled,
      `${scenarioName} 列顺序按钮禁用态不符合当前页面能力边界`
    )
    await expectNoButton(page, '批量删除')
    await expectNoButton(page, '回收站')
    await expectNoButton(page, '刷新协同')
    if (exportVisible && exportTooltip) {
      await exportButton.locator('xpath=..').hover()
      await expectText(page, exportTooltip)
    }
    await assertCurrentOperationBarCompact(page, { scenarioName })
  }

  const assertWorkflowDueDateRangeFilterLayout = async (
    page,
    { scenarioName }
  ) => {
    const dialog = page.getByRole('dialog', { name: '筛选条件' })
    const opened = !(await dialog.isVisible())
    if (opened) {
      await page
        .locator('.erp-business-operation-panel button[aria-haspopup="dialog"]')
        .click()
    }
    await dialog.waitFor()
    await waitForFiniteAnimations(page)
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector(
        '.erp-business-filter-popover .erp-business-operation-panel__filters'
      )
      const range = panel?.querySelector('.erp-business-date-range-filter')
      const typeLabel = range?.querySelector(
        '.erp-business-date-range-filter__type-label'
      )
      const dateInputs = range
        ? Array.from(
            range.querySelectorAll('.erp-business-date-input.ant-picker')
          )
        : []
      const standaloneDateInputs = panel
        ? Array.from(panel.children).filter((node) =>
            node.classList?.contains('erp-business-date-input')
          )
        : []
      const panelBox = panel?.getBoundingClientRect()
      const rangeBox = range?.getBoundingClientRect()
      const inputBoxes = dateInputs.map((node) => {
        const box = node.getBoundingClientRect()
        return {
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      return {
        viewportWidth: document.documentElement.clientWidth,
        panelWidth: panelBox?.width || 0,
        rangeWidth: rangeBox?.width || 0,
        rangeHeight: rangeBox?.height || 0,
        rangeScrollWidth: range?.scrollWidth || 0,
        rangeClientWidth: range?.clientWidth || 0,
        typeLabelText: typeLabel?.textContent?.trim() || '',
        dateInputCount: dateInputs.length,
        standaloneDateInputCount: standaloneDateInputs.length,
        inputBoxes,
      }
    })
    assert.equal(
      metrics.standaloneDateInputCount,
      0,
      `${scenarioName} 到期日期筛选不应使用两个独立 DateInput: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.typeLabelText,
      '到期日期',
      `${scenarioName} 到期日期筛选应显示日期类型标签: ${JSON.stringify(
        metrics
      )}`
    )
    assert.equal(
      metrics.dateInputCount,
      2,
      `${scenarioName} 到期日期筛选应保留开始/结束两个日期输入: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.rangeWidth > 0 &&
        metrics.rangeWidth <= Math.max(metrics.panelWidth, 1) + 1,
      `${scenarioName} 到期日期筛选不应溢出筛选栏: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rangeScrollWidth <= metrics.rangeClientWidth + 1,
      `${scenarioName} 到期日期筛选内部不应横向溢出: ${JSON.stringify(metrics)}`
    )
    if (metrics.viewportWidth >= 760) {
      const [startInput, endInput] = metrics.inputBoxes
      assert(
        startInput &&
          endInput &&
          Math.abs(startInput.y - endInput.y) <= 2 &&
          startInput.width >= 120 &&
          endInput.width >= 120,
        `${scenarioName} 宽屏下开始/结束日期应在同一行且保持可读宽度: ${JSON.stringify(
          metrics
        )}`
      )
    }
    if (opened) {
      await dialog.getByRole('button', { name: '完成', exact: true }).click()
    }
  }

  const assertNoListDeleteTrashToolbar = async (page) => {
    await expectNoButton(page, '批量删除')
    await expectNoButton(page, '回收站')
  }

  const assertBusinessTableEmptyState = async (
    page,
    { scenarioName, emptyText, staleText }
  ) => {
    await page
      .waitForFunction(
        ({ expectedEmptyText }) => {
          const tableCard = document.querySelector(
            '.erp-business-module-table-card'
          )
          const placeholder = tableCard?.querySelector('.ant-table-placeholder')
          const dataRows = Array.from(
            tableCard?.querySelectorAll(
              '.ant-table-tbody > tr.ant-table-row'
            ) || []
          ).filter((row) => !row.classList.contains('ant-table-placeholder'))
          return (
            placeholder?.textContent?.includes(expectedEmptyText) &&
            dataRows.length === 0
          )
        },
        { expectedEmptyText: emptyText },
        { timeout: 10_000 }
      )
      .catch((error) => {
        throw new Error(
          `${scenarioName} 等待表格空态“${emptyText}”超时: ${error.message}`
        )
      })
    const metrics = await page.evaluate(
      ({ expectedEmptyText, previousText }) => {
        const actionBar = document.querySelector(
          '.erp-business-module-current-action'
        )
        const tableCard = document.querySelector(
          '.erp-business-module-table-card'
        )
        const placeholder = tableCard?.querySelector('.ant-table-placeholder')
        const dataRows = Array.from(
          tableCard?.querySelectorAll('.ant-table-tbody > tr.ant-table-row') ||
            []
        ).filter((row) => !row.classList.contains('ant-table-placeholder'))
        return {
          actionText: actionBar?.textContent?.replace(/\s+/g, ' ').trim() || '',
          actionHasEmptyClass:
            actionBar?.classList.contains(
              'erp-business-selection-action-bar--empty'
            ) || false,
          actionHasActiveClass:
            actionBar?.classList.contains(
              'erp-business-selection-action-bar--active'
            ) || false,
          placeholderText:
            placeholder?.textContent?.replace(/\s+/g, ' ').trim() || '',
          dataRowCount: dataRows.length,
          staleTextInAction:
            actionBar?.textContent?.includes(previousText) || false,
          staleTextInTable:
            tableCard?.textContent?.includes(previousText) || false,
          documentOverflow:
            document.documentElement.scrollWidth -
            document.documentElement.clientWidth,
          expectedEmptyText,
        }
      },
      { expectedEmptyText: emptyText, previousText: staleText }
    )

    assert(
      metrics.placeholderText.includes(emptyText),
      `${scenarioName} 表格空态文案异常: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.dataRowCount,
      0,
      `${scenarioName} 空结果时不应保留数据行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.actionHasEmptyClass && !metrics.actionHasActiveClass,
      `${scenarioName} 空结果后当前操作条应回到未选中态: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.staleTextInAction,
      false,
      `${scenarioName} 空结果后当前操作条不应保留旧选中记录: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.staleTextInTable,
      false,
      `${scenarioName} 空结果表格不应保留旧记录文本: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 空结果不应造成页面级横向溢出: ${JSON.stringify(metrics)}`
    )
  }
  async function assertCurrentOperationBarCompact(page, { scenarioName }) {
    const metrics = await page.evaluate(() => {
      const bars = Array.from(
        document.querySelectorAll('.erp-business-module-current-action')
      )
      return bars.map((bar) => {
        const row = bar.querySelector('.erp-business-selection-action-bar__row')
        const primary = bar.querySelector(
          '.erp-business-selection-action-bar__primary'
        )
        const actions = bar.querySelector(
          '.erp-business-selection-action-bar__actions'
        )
        const rowBox = row?.getBoundingClientRect()
        const primaryBox = primary?.getBoundingClientRect()
        const actionsBox = actions?.getBoundingClientRect()
        const rowCenter = rowBox ? rowBox.top + rowBox.height / 2 : 0
        const primaryCenter = primaryBox
          ? primaryBox.top + primaryBox.height / 2
          : 0
        const actionsCenter = actionsBox
          ? actionsBox.top + actionsBox.height / 2
          : 0
        const text = bar.textContent?.replace(/\s+/g, ' ').trim() || ''
        return {
          text,
          hintCount: bar.querySelectorAll(
            '.erp-business-selection-action-bar__hint'
          ).length,
          rowHeight: rowBox?.height || 0,
          direction: row ? getComputedStyle(row).flexDirection : '',
          actionsGap: (actionsBox?.top || 0) - (primaryBox?.bottom || 0),
          actionsBottomOverflow:
            (actionsBox?.bottom || 0) - (rowBox?.bottom || 0),
          primaryOffset: Math.abs(primaryCenter - rowCenter),
          actionsOffset: Math.abs(actionsCenter - rowCenter),
        }
      })
    })
    assert(metrics.length > 0, `${scenarioName} 应存在当前操作条`)
    for (const metric of metrics) {
      assert.equal(
        metric.hintCount,
        0,
        `${scenarioName} 当前操作条不应渲染页面级边界说明: ${JSON.stringify(
          metric
        )}`
      )
      assert(
        !/不写|不本地|usecase|只调用|只读；/.test(metric.text),
        `${scenarioName} 当前操作条不应保留长边界说明: ${JSON.stringify(
          metric
        )}`
      )
      if (metric.direction === 'column') {
        assert(
          metric.actionsGap >= 0 && metric.actionsBottomOverflow <= 1,
          `${scenarioName} 纵向操作条的标题和按钮应依次排列且不溢出: ${JSON.stringify(metric)}`
        )
      } else if (metric.rowHeight <= 96) {
        assert(
          metric.primaryOffset <= 2,
          `${scenarioName} 当前操作标题与选中标签应上下居中: ${JSON.stringify(
            metric
          )}`
        )
        assert(
          metric.actionsOffset <= 2,
          `${scenarioName} 当前操作按钮组应上下居中: ${JSON.stringify(metric)}`
        )
      }
    }
  }

  return {
    assertLineItemAddActionScrollsToNewRow,
    assertLineItemDuplicateAction,
    assertLineItemFieldLayout,
    assertLineAmountCalculation,
    assertLineQuantityPrecisionBlocksAmount,
    assertLineQuantityUnitSuffix,
    assertLineSourceSummaryReadableUnit,
    findSelectionActionButton,
    confirmVisiblePopconfirm,
    assertBusinessViewTabSelectedStyle,
    assertLineItemSectionTitleBold,
    assertNonItemTextareaFullRow,
    waitForMasterDataRequest,
    assertNoMasterDataRequest,
    waitForCapturedMethods,
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
    assertWorkflowDueDateRangeFilterLayout,
    assertNoListDeleteTrashToolbar,
    assertBusinessTableEmptyState,
    assertCurrentOperationBarCompact,
  }
}
