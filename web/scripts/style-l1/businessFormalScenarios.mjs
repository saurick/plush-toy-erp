import process from 'node:process'

import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

import { createBusinessAttachmentAssertions } from './businessAttachmentAssertions.mjs'
import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'
import { createOutsourcingSourceFactScenarios } from './outsourcingSourceFactScenarios.mjs'
import { createProductionSourceInboundLotScenarios } from './productionSourceInboundLotScenarios.mjs'
import { createProductionReworkScenarios } from './productionReworkScenarios.mjs'
import { createQualitySourceActionScenarios } from './qualitySourceActionScenarios.mjs'

export function createBusinessFormalScenarios(deps) {
  const {
    assert,
    assertAntdModalCentered,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessHeaderStatsSingleLine,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableInitialSelectionEmpty,
    assertBusinessMainTableSortableColumns,
    assertBusinessModuleToolbarControlStyle,
    assertBusinessPageRefreshEntrypoint,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertProcessSuggestionOptions,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickEditModal,
    verifySourceImportPicker,
    customerRuntimeEffectiveSession,
  } = deps
  const {
    assertLineItemAddActionScrollsToNewRow,
    assertLineItemDuplicateAction,
    assertLineItemFooterFollowsModalScroll,
    assertLineItemFieldLayout,
    assertLineAmountCalculation,
    assertLineQuantityPrecisionBlocksAmount,
    assertLineQuantityUnitSuffix,
    assertLineSourceSummaryReadableUnit,
  } = createLineItemUnitAssertions({
    assert,
  })
  const { assertPageAttachmentModalEntrypoint } =
    createBusinessAttachmentAssertions({
      assert,
      assertAntdModalCentered,
    })

  const assertBusinessViewTabNeutralStyle = async (
    page,
    { scenarioName, tabName }
  ) => {
    const metrics = await page
      .getByRole('tab', { name: tabName })
      .evaluate((node) => {
        const tab = node.closest('.ant-tabs-tab') || node
        const style = window.getComputedStyle(tab)
        return {
          backgroundColor: style.backgroundColor,
          boxShadow: style.boxShadow,
        }
      })
    const background = String(metrics.backgroundColor || '')
      .replace(/\s/g, '')
      .toLowerCase()
    assert(
      background === 'rgba(0,0,0,0)' || background === 'transparent',
      `${scenarioName} 主视图 Tab 不应出现激活背景色: ${JSON.stringify(
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
              !item.closest('.erp-sales-order-lines-form__grid') &&
              !item.closest('.erp-master-contact-list__grid') &&
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

  const waitForTaskActionDrawerClosed = async (page, scenarioName) => {
    await page
      .locator('.erp-task-action-drawer')
      .waitFor({ state: 'hidden', timeout: 10_000 })
    await page
      .waitForFunction(
        () => {
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
          return Array.from(
            document.querySelectorAll('.ant-drawer-mask')
          ).every((node) => !isVisible(node))
        },
        null,
        { timeout: 10_000 }
      )
      .catch((error) => {
        throw new Error(
          `${scenarioName} 等待任务处理抽屉遮罩消失超时: ${error.message}`
        )
      })
    const overlayMetrics = await page.evaluate(() => {
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
      return {
        visibleTaskActionDrawers: Array.from(
          document.querySelectorAll('.erp-task-action-drawer')
        ).filter(isVisible).length,
        visibleDrawerMasks: Array.from(
          document.querySelectorAll('.ant-drawer-mask')
        ).filter(isVisible).length,
      }
    })
    assert.equal(
      overlayMetrics.visibleTaskActionDrawers,
      0,
      `${scenarioName} 任务处理抽屉关闭后不应继续可见: ${JSON.stringify(
        overlayMetrics
      )}`
    )
    assert.equal(
      overlayMetrics.visibleDrawerMasks,
      0,
      `${scenarioName} 任务处理抽屉关闭后不应残留遮罩: ${JSON.stringify(
        overlayMetrics
      )}`
    )
  }

  const assertUnifiedListToolbarShell = async (
    page,
    {
      scenarioName,
      exportDisabled = false,
      exportTooltip = '',
      columnOrderDisabled = false,
    }
  ) => {
    const labels = ['导出筛选结果', '列顺序']
    for (const label of labels) {
      await expectButton(page, label)
    }
    const exportButton = page
      .getByRole('button', { name: '导出筛选结果' })
      .first()
    const columnOrderButton = page
      .getByRole('button', { name: '列顺序' })
      .first()
    assert.equal(
      await exportButton.isDisabled(),
      exportDisabled,
      `${scenarioName} 导出筛选结果按钮禁用态不符合当前页面能力边界`
    )
    assert.equal(
      await columnOrderButton.isDisabled(),
      columnOrderDisabled,
      `${scenarioName} 列顺序按钮禁用态不符合当前页面能力边界`
    )
    await expectNoButton(page, '批量删除')
    await expectNoButton(page, '回收站')
    await expectNoButton(page, '刷新协同')
    if (exportTooltip) {
      await exportButton.locator('xpath=..').hover()
      await expectText(page, exportTooltip)
    }
    await assertCurrentOperationBarCompact(page, { scenarioName })
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
      if (metric.rowHeight <= 96) {
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

  const assertWorkflowDueDateRangeFilterLayout = async (
    page,
    { scenarioName }
  ) => {
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector(
        '.erp-workflow-business-page .erp-business-operation-panel__filters'
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

  return [
    ...createOutsourcingSourceFactScenarios(deps),
    ...createProductionSourceInboundLotScenarios(deps),
    ...createProductionReworkScenarios(deps),
    ...createQualitySourceActionScenarios(deps),
    (() => {
      let consoleErrors = []
      let itemReadCalls = 0
      let pageErrors = []
      let rpcMethods = []
      let saveCalls = 0
      return {
        name: 'source-document-edit-items-read-failure-fail-closed',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          consoleErrors = []
          itemReadCalls = 0
          pageErrors = []
          rpcMethods = []
          saveCalls = 0
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text())
          })
          page.on('pageerror', (error) => pageErrors.push(error.message))
          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method } = body
            if (method) rpcMethods.push(method)
            if (method === 'list_sales_order_items') {
              itemReadCalls += 1
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: {
                    code: RpcErrorCode.INTERNAL,
                    message: '销售订单明细暂时无法加载',
                    data: {},
                  },
                }),
              })
              return
            }
            if (method === 'save_sales_order_with_items') saveCalls += 1
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await expectText(page, 'SO-STYLE-L1')
          await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
          await page.getByRole('button', { name: '编辑订单' }).click()
          await expectText(page, '未进入编辑')
          const failureNotice = page
            .getByText('未进入编辑', { exact: false })
            .first()
          await failureNotice.screenshot({
            path: path.resolve(
              outputDir,
              'source-document-edit-items-read-failure-fail-closed-message.png'
            ),
          })
          await page.screenshot({
            path: path.resolve(
              outputDir,
              'source-document-edit-items-read-failure-fail-closed-visible.png'
            ),
            fullPage: true,
          })

          const metrics = await page.evaluate(() => {
            const isVisible = (node) => {
              if (!(node instanceof HTMLElement)) return false
              const rect = node.getBoundingClientRect()
              const style = window.getComputedStyle(node)
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              )
            }
            const visibleEditModals = Array.from(
              document.querySelectorAll('.ant-modal')
            ).filter(
              (node) =>
                isVisible(node) &&
                String(node.textContent || '').includes('编辑销售订单')
            )
            const visibleLineRows = Array.from(
              document.querySelectorAll('.erp-sales-order-lines-form__row')
            ).filter(isVisible)
            return {
              visibleEditModalCount: visibleEditModals.length,
              visibleLineRowCount: visibleLineRows.length,
            }
          })
          const evidence = {
            ...metrics,
            consoleErrors,
            itemReadCalls,
            pageErrors,
            rpcMethods,
            saveCalls,
          }
          assert.equal(
            metrics.visibleEditModalCount,
            0,
            `明细读取失败后不得打开编辑弹窗: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            metrics.visibleLineRowCount,
            0,
            `明细读取失败后不得生成可保存空行: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            itemReadCalls,
            1,
            `编辑入口应且只应读取一次完整明细: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            saveCalls,
            0,
            `明细读取失败后不得调用聚合保存: ${JSON.stringify(evidence)}`
          )
          assert.deepEqual(
            consoleErrors,
            [],
            `明细读取失败不应产生控制台错误: ${JSON.stringify(evidence)}`
          )
          assert.deepEqual(
            pageErrors,
            [],
            `明细读取失败不应产生页面错误: ${JSON.stringify(evidence)}`
          )
          process.stdout.write(
            `[style:l1] source-document-edit-items-read-failure-fail-closed evidence=${JSON.stringify(
              evidence
            )}\n`
          )
        },
      }
    })(),
    (() => {
      let consoleErrors = []
      let itemReadCalls = 0
      let itemRequestStarted
      let lateResponseFinished
      let lateRouteOutcome = ''
      let pageErrors = []
      let releaseLateResponse
      let resolveItemRequestStarted
      let resolveLateResponseFinished
      let rpcMethods = []
      let saveCalls = 0
      return {
        name: 'source-document-open-edit-race-new-document-wins',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          consoleErrors = []
          itemReadCalls = 0
          lateRouteOutcome = ''
          pageErrors = []
          rpcMethods = []
          saveCalls = 0
          itemRequestStarted = new Promise((resolve) => {
            resolveItemRequestStarted = resolve
          })
          const releaseResponse = new Promise((resolve) => {
            releaseLateResponse = resolve
          })
          lateResponseFinished = new Promise((resolve) => {
            resolveLateResponseFinished = resolve
          })
          page.on('console', (message) => {
            if (message.type() === 'error') consoleErrors.push(message.text())
          })
          page.on('pageerror', (error) => pageErrors.push(error.message))
          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { method } = body
            if (method) rpcMethods.push(method)
            if (method === 'list_sales_order_items') {
              itemReadCalls += 1
              resolveItemRequestStarted()
              await releaseResponse
              try {
                await route.fallback()
                lateRouteOutcome = 'fulfilled-after-new'
              } catch (error) {
                lateRouteOutcome = `request-canceled-after-new:${String(
                  error?.message || error
                )}`
              } finally {
                resolveLateResponseFinished()
              }
              return
            }
            if (method === 'save_sales_order_with_items') saveCalls += 1
            await route.fallback()
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await expectText(page, 'SO-STYLE-L1')
          await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
          await page.getByRole('button', { name: '编辑订单' }).click()
          await itemRequestStarted

          await page.getByRole('button', { name: '新建订单' }).click()
          const newOrderDialog = page
            .getByRole('dialog')
            .filter({ hasText: '新建销售订单' })
            .last()
          await newOrderDialog
            .getByText('新建销售订单', { exact: true })
            .waitFor()
          const retainedNote = '竞态期间填写的新订单备注'
          await newOrderDialog
            .getByLabel('备注', { exact: true })
            .first()
            .fill(retainedNote)

          releaseLateResponse()
          await lateResponseFinished
          await page.waitForTimeout(100)

          const metrics = await newOrderDialog.evaluate((dialog) => {
            const visibleLineRows = Array.from(
              dialog.querySelectorAll('.erp-sales-order-lines-form__row')
            ).filter((node) => {
              const rect = node.getBoundingClientRect()
              const style = window.getComputedStyle(node)
              return (
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== 'none' &&
                style.visibility !== 'hidden'
              )
            })
            return {
              dialogText: String(dialog.textContent || ''),
              visibleLineRowCount: visibleLineRows.length,
            }
          })
          const noteValue = await newOrderDialog
            .getByLabel('备注', { exact: true })
            .first()
            .inputValue()
          const staleFailureNotices = await page
            .getByText('未进入编辑', { exact: false })
            .count()
          const evidence = {
            consoleErrors,
            itemReadCalls,
            lateRouteOutcome,
            noteValue,
            pageErrors,
            rpcMethods,
            saveCalls,
            staleFailureNotices,
            visibleLineRowCount: metrics.visibleLineRowCount,
          }

          assert(
            metrics.dialogText.includes('新建销售订单') &&
              !metrics.dialogText.includes('编辑销售订单'),
            `迟到编辑响应不得覆盖新建身份: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            noteValue,
            retainedNote,
            `迟到编辑响应不得覆盖新建表单值: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            metrics.dialogText.includes('样式产品'),
            false,
            `迟到编辑响应不得注入旧订单行: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            metrics.visibleLineRowCount,
            1,
            `新建表单应保留自己的空白行: ${JSON.stringify(evidence)}`
          )
          assert.equal(
            lateRouteOutcome,
            'fulfilled-after-new',
            JSON.stringify(evidence)
          )
          assert.equal(itemReadCalls, 1, JSON.stringify(evidence))
          assert.equal(saveCalls, 0, JSON.stringify(evidence))
          assert.equal(staleFailureNotices, 0, JSON.stringify(evidence))
          assert.deepEqual(consoleErrors, [], JSON.stringify(evidence))
          assert.deepEqual(pageErrors, [], JSON.stringify(evidence))

          await page.screenshot({
            path: path.resolve(
              outputDir,
              'source-document-open-edit-race-new-document-wins-visible.png'
            ),
            fullPage: true,
          })
          await closeBusinessFormModal(page, newOrderDialog)
          process.stdout.write(
            `[style:l1] source-document-open-edit-race-new-document-wins evidence=${JSON.stringify(
              evidence
            )}\n`
          )
        },
      }
    })(),
    {
      name: 'shipment-net-weight-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '出货单')
        await expectButton(page, '新建草稿')
        await page
          .locator('.erp-business-data-table-card .ant-table-content')
          .first()
          .evaluate((element) => {
            element.scrollLeft = element.scrollWidth
          })
        await expectText(page, 'SHIP-STYLE-L1')
        const weightColumnMetrics = await page
          .locator('.erp-business-data-table-card')
          .first()
          .evaluate((element) => ({
            headers: Array.from(element.querySelectorAll('th')).map((node) =>
              String(node.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
            ),
            text: String(element.textContent || '')
              .replace(/\s+/gu, '')
              .trim(),
          }))
        assert(
          weightColumnMetrics.headers.includes('总净重（kg）') &&
            weightColumnMetrics.text.includes('待确认'),
          `出货列表应显示总净重列和草稿待确认状态: ${JSON.stringify(
            weightColumnMetrics
          )}`
        )
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建草稿',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: 'shipment-net-weight-incomplete',
          expectedTexts: [
            '出货明细',
            '从销售订单导入',
            '预计总净重暂不可计算',
            '实际总净重（kg）',
          ],
          afterOpen: async (modal) => {
            await modal.getByLabel('产品').click()
            await page.getByText('PROD-STYLE-L1').last().click()
            await modal.getByLabel('数量').fill('10')
            await expectText(page, '预计总净重：4.25 kg')
            await modal.screenshot({
              path: path.join(outputDir, 'shipment-net-weight-predicted.png'),
            })
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'shipment-net-weight-incomplete',
              targetRowCount: 5,
              listSelector: '.erp-master-contact-list__items',
              rowSelector: '.erp-master-contact-list__row',
            })
          },
        })
        await assertNoHorizontalOverflow(page, 'shipment-net-weight-desktop')
      },
    },
    {
      name: 'business-core-pages-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-business-core-pages',
        configHash: 'style-l1-business-core-pages-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: ['workflow.task.create', 'workflow.task.read'],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['production', 'warehouse', 'sales'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await expectButton(page, '新建供应商')
        await expectText(page, '当前操作')
        await assertCurrentOperationBarCompact(page, {
          scenarioName: 'business-v1-suppliers',
        })
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-suppliers',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-suppliers',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建供应商',
          titleText: '新建供应商档案',
          scenarioName: 'business-v1-suppliers',
        })
        await assertNoHorizontalOverflow(page, 'business-standard-suppliers')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建供应商',
          titleText: '新建供应商档案',
          minFieldCount: 5,
          screenshotName: 'business-v1-suppliers-form-modal',
          expectedTexts: ['供应商类型', '联系人', '添加条目'],
          expectContactItemsLayout: true,
          afterOpen: async (modal) => {
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'business-v1-suppliers-contact-form-modal',
              targetRowCount: 5,
              listSelector: '.erp-master-contact-list__items',
              rowSelector: '.erp-master-contact-list__row',
            })
          },
        })
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: '样式供应商',
          titleText: '编辑供应商',
          scenarioName: 'business-v1-suppliers',
          afterModalOpen: async () => {
            await expectText(page, '联系人')
            await expectButton(page, '添加条目')
          },
        })

        await gotoScenarioPath(page, '/erp/master/partners/customers', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '客户档案')
        await expectButton(page, '新建客户')
        await expectText(page, '当前操作')
        await assertCurrentOperationBarCompact(page, {
          scenarioName: 'business-v1-customers',
        })
        await expectText(page, '暗色客户')
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-customers',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-v1-customers',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-customers',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建客户',
          titleText: '新建客户档案',
          scenarioName: 'business-v1-customers',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建客户',
          titleText: '新建客户档案',
          minFieldCount: 5,
          screenshotName: 'business-v1-customers-form-modal',
          expectedTexts: ['联系人', '添加条目'],
          expectContactItemsLayout: true,
          afterOpen: async (modal) => {
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'business-v1-customers-contact-form-modal',
              targetRowCount: 5,
              listSelector: '.erp-master-contact-list__items',
              rowSelector: '.erp-master-contact-list__row',
            })
          },
        })
        await assertNoHorizontalOverflow(page, 'business-standard-customers')
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: '暗色客户',
          titleText: '编辑客户',
          scenarioName: 'business-v1-customers',
          afterModalOpen: async () => {
            await expectText(page, '联系人')
            await expectButton(page, '添加条目')
          },
        })

        await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '销售订单')
        await expectButton(page, '新建订单')
        await expectText(page, '当前操作')
        await assertCurrentOperationBarCompact(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await expectText(page, '订单行')
        await expectText(page, '本页协同')
        await assertNoListDeleteTrashToolbar(page)
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'business-v1-sales-orders',
          primaryActionLabel: '提交',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['生效', '关闭', '取消'],
        })
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessModuleToolbarControlStyle(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-sales-orders',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建订单',
          titleText: '新建销售订单',
          scenarioName: 'business-v1-sales-orders',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建订单',
          titleText: '新建销售订单',
          minFieldCount: 6,
          screenshotName: 'business-v1-sales-order-form-modal',
          expectedTexts: ['SKU / 产品来源', '带出产品 / 单位'],
          absentTexts: ['产品引用 ID', '单位引用 ID'],
          afterOpen: async (modal) => {
            await assertNonItemTextareaFullRow(modal, {
              labels: ['报价备注', '备注'],
              scenarioName: 'business-v1-sales-order-form-modal',
            })
            await assertLineQuantityUnitSuffix(modal, {
              label: '订单数量',
              expectedText: '件（PCS）',
              scenarioName: 'business-v1-sales-order-form-modal-empty-line',
            })
            await assertLineItemFieldLayout(modal, {
              scenarioName: 'business-v1-sales-order-form-modal-empty-line',
              visibleThroughLabel: '金额',
              absentLabels: ['产品编号快照', '产品名称快照', '颜色快照'],
            })
            await assertLineQuantityPrecisionBlocksAmount(modal, {
              quantityLabel: '订单数量',
              unitPriceLabel: '单价',
              amountLabel: '金额',
              quantity: '123.11',
              unitPrice: '12.11',
              expectedErrorText: '当前单位只允许整数数量',
              scenarioName: 'business-v1-sales-order-form-modal-empty-line',
            })
            await assertLineAmountCalculation(modal, {
              quantityLabel: '订单数量',
              unitPriceLabel: '单价',
              amountLabel: '金额',
              quantity: '11',
              unitPrice: '12.11',
              expected: '133.21',
              scenarioName: 'business-v1-sales-order-form-modal-empty-line',
            })
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从 SKU 库添加',
              titleText: '选择 SKU 添加订单行',
              expectedTexts: ['SKU 编码', '产品名称', 'SKU-STYLE-L1'],
              emptyDescriptionText: '暂无可选 SKU',
              selectText: 'SKU-STYLE-L1',
              selectedNoun: 'SKU',
              scenarioName: 'sales-order-source-import-picker',
            })
            await assertLineQuantityUnitSuffix(modal, {
              label: '订单数量',
              expectedText: '件（PCS）',
              scenarioName: 'business-v1-sales-order-form-modal',
            })
            await assertLineSourceSummaryReadableUnit(modal, {
              label: '带出产品 / 单位',
              expectedText: '件（PCS）',
              scenarioName: 'business-v1-sales-order-form-modal',
            })
            await assertLineItemDuplicateAction(modal, {
              scenarioName: 'business-v1-sales-order-form-modal',
            })
            await assertLineItemFooterFollowsModalScroll(modal, {
              scenarioName: 'business-v1-sales-order-form-modal',
            })
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'business-v1-sales-order-form-modal',
            })
          },
        })
        await assertNoHorizontalOverflow(page, 'business-standard-sales-orders')
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: 'SO-STYLE-L1',
          titleText: '编辑销售订单',
          scenarioName: 'business-v1-sales-orders',
          afterModalOpen: async () => {
            await expectText(page, '订单行')
            await expectText(page, 'SKU / 产品来源')
            await expectText(page, '带出产品 / 单位')
            await assertTextAbsent(page, '产品引用 ID')
            await assertTextAbsent(page, '单位引用 ID')
          },
        })

        const masterDataMethods = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/masterdata')) return
          try {
            const method = request.postDataJSON()?.method
            if (method) masterDataMethods.push(method)
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })

        await gotoScenarioPath(page, '/erp/master/products', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '产品档案')
        await expectText(page, '产品基础信息')
        await expectText(page, '产品规格')
        await page.getByRole('tab', { name: '产品基础信息' }).waitFor()
        await page.getByRole('tab', { name: '产品规格' }).waitFor()
        await assertBusinessViewTabNeutralStyle(page, {
          scenarioName: 'business-standard-products',
          tabName: '产品基础信息',
        })
        await expectButton(page, '新建产品')
        await assertNoListDeleteTrashToolbar(page)
        await expectText(page, 'PROD-STYLE-L1')
        await expectText(page, 'BEAR-STYLE')
        await expectText(page, '0.425 kg / 件（PCS）')
        await expectText(page, '当前操作')
        await assertCurrentOperationBarCompact(page, {
          scenarioName: 'business-standard-products',
        })
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-standard-products',
          expectedLabels: ['总产品', '当前结果', '启用产品'],
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-products',
        })
        await assertNoListDeleteTrashToolbar(page)
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'products',
          heading: '产品档案',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建产品',
          titleText: '新建产品',
          scenarioName: 'business-standard-products',
        })
        await page.getByRole('button', { name: '新建产品' }).click()
        await expectText(page, '新建产品')
        await expectText(page, '产品编号')
        await expectText(page, '默认单位')
        await expectText(page, '产品单重（净重）')
        await assertTextAbsent(page, '默认单位 ID')
        await closeBusinessFormModal(
          page,
          page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .last()
        )
        const beforeProductSKUTabRequests = masterDataMethods.length
        await page.getByRole('tab', { name: '产品规格' }).click()
        await waitForMasterDataRequest(page, masterDataMethods, {
          method: 'list_product_skus',
          fromIndex: beforeProductSKUTabRequests,
          scenarioName: 'business-standard-product-skus-tab-refresh',
        })
        await waitForMasterDataRequest(page, masterDataMethods, {
          method: 'list_products',
          fromIndex: beforeProductSKUTabRequests,
          scenarioName: 'business-standard-product-skus-reference-refresh',
        })
        await assertBusinessViewTabNeutralStyle(page, {
          scenarioName: 'business-standard-product-skus',
          tabName: '产品规格',
        })
        await expectButton(page, '新建产品规格')
        await expectText(page, 'SKU-STYLE-L1')
        await expectText(page, '0.375 kg / 件（PCS）')
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-product-skus',
        })
        await page.getByRole('button', { name: '新建产品规格' }).click()
        await expectText(page, '新建产品规格')
        await expectText(page, 'SKU 编号')
        await expectText(page, '产品')
        await expectText(page, 'SKU 单重（净重）')
        await closeBusinessFormModal(
          page,
          page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .last()
        )
        await assertNoHorizontalOverflow(page, 'business-standard-products')

        const beforeProductSKURefreshRequests = masterDataMethods.length
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await waitForMasterDataRequest(page, masterDataMethods, {
          method: 'list_product_skus',
          fromIndex: beforeProductSKURefreshRequests,
          scenarioName: 'business-standard-product-skus-header-refresh',
        })
        await waitForMasterDataRequest(page, masterDataMethods, {
          method: 'list_products',
          fromIndex: beforeProductSKURefreshRequests,
          scenarioName:
            'business-standard-product-skus-header-reference-refresh',
        })

        const beforeMaterialsMenuRequests = masterDataMethods.length
        await page
          .locator('.erp-admin-menu')
          .getByText('材料档案', { exact: true })
          .click()
        await expectHeading(page, '材料档案')
        await waitForMasterDataRequest(page, masterDataMethods, {
          method: 'list_materials',
          fromIndex: beforeMaterialsMenuRequests,
          scenarioName: 'business-standard-materials-menu-refresh',
        })
        await waitForMasterDataRequest(page, masterDataMethods, {
          method: 'list_units',
          fromIndex: beforeMaterialsMenuRequests,
          scenarioName: 'business-standard-materials-menu-unit-refresh',
        })

        const beforeRepeatedMaterialsMenuRequests = masterDataMethods.length
        await page
          .locator('.erp-admin-menu')
          .getByText('材料档案', { exact: true })
          .click()
        await assertNoMasterDataRequest(page, masterDataMethods, {
          methods: ['list_materials', 'list_units'],
          fromIndex: beforeRepeatedMaterialsMenuRequests,
          scenarioName: 'business-standard-materials-current-menu-no-refresh',
        })

        await gotoScenarioPath(page, '/erp/purchase/material-bom', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, 'BOM 管理')
        await expectButton(page, '新建草稿')
        await expectText(page, '工程资料版本')
        await expectText(page, 'BOM-STYLE-L1')
        await expectText(page, '已激活')
        await expectText(page, '当前操作')
        await expectButton(page, '打印物料明细')
        await expectButton(page, '打印色卡')
        await expectButton(page, '打印作业指导书')
        await assertCurrentOperationBarCompact(page, {
          scenarioName: 'business-standard-bom',
        })
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-bom',
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-bom',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-bom',
          unsortableHeaders: ['备注'],
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-standard-bom',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-standard-bom',
          expectedLabels: ['总BOM', '当前结果', '已激活'],
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建草稿',
          titleText: '新建 BOM 草稿',
          scenarioName: 'business-standard-bom',
        })
        await page.getByRole('button', { name: '新建草稿' }).click()
        const bomDraftModal = page
          .locator('.erp-business-action-modal--form.ant-modal:visible')
          .last()
        await expectText(page, '新建 BOM 草稿')
        await expectText(page, 'BOM 版本')
        await expectText(page, '产品')
        await expectText(page, '先选择产品，系统会建议下一个版本号')
        await expectText(page, 'BOM 附件')
        await expectText(page, 'BOM 明细')
        await expectText(page, '已录入')
        await expectText(page, '0')
        const bomCreateAttachmentMetrics = await bomDraftModal.evaluate(
          (node) => {
            const panel = node.querySelector('.business-attachment-panel')
            const button = panel?.querySelector('button')
            return {
              panelText: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
              buttonText:
                button?.textContent?.replace(/\s+/g, ' ').trim() || '',
            }
          }
        )
        assert.equal(
          bomCreateAttachmentMetrics.buttonText,
          '选择附件',
          `BOM 新建附件按钮应使用共享文案: ${JSON.stringify(
            bomCreateAttachmentMetrics
          )}`
        )
        await bomDraftModal.getByLabel('产品').click()
        await page.getByText('PROD-STYLE-L1').last().click()
        await expectText(page, '建议使用下一个版本号')
        await expectText(page, 'V1')
        await bomDraftModal.getByRole('button', { name: '添加条目' }).click()
        await expectText(page, '第 1 行')
        await expectText(page, '材料用量')
        const bomCreateMetrics = await page.evaluate(() => {
          const visible = (node) => {
            if (!(node instanceof HTMLElement)) return false
            const rect = node.getBoundingClientRect()
            const style = window.getComputedStyle(node)
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            )
          }
          const modal = Array.from(
            document.querySelectorAll(
              '.erp-business-action-modal--form.ant-modal'
            )
          )
            .filter(visible)
            .at(-1)
          const section = modal?.querySelector('.erp-bom-modal-items')
          const sectionClassNames = Array.from(section?.classList || [])
          const rows = Array.from(
            section?.querySelectorAll('.erp-sales-order-lines-form__row') || []
          ).filter(visible)
          const operationHeaderVisible = Array.from(
            section?.querySelectorAll('th') || []
          ).some(
            (node) =>
              visible(node) &&
              node.textContent?.replace(/\s+/g, '').includes('操作')
          )
          const labels = Array.from(
            rows[0]?.querySelectorAll('.ant-form-item-label label') || []
          )
            .filter(visible)
            .map((node) => ({
              text: node.textContent?.replace(/\s+/g, '').trim(),
              top: node.getBoundingClientRect().top,
            }))
          const labelTexts = labels.map((item) => item.text)
          const labelTops = labels.map((item) => item.top)
          const footerButton = Array.from(
            section?.querySelectorAll('.erp-line-items-form__footer button') ||
              []
          ).find(
            (node) =>
              visible(node) &&
              node.textContent?.replace(/\s+/g, '').includes('添加条目')
          )
          const list = section?.querySelector(
            '.erp-sales-order-lines-form__list'
          )
          const listStyle =
            list instanceof HTMLElement ? window.getComputedStyle(list) : null
          const grid = rows[0]?.querySelector(
            '.erp-sales-order-lines-form__grid'
          )
          const gridStyle =
            grid instanceof HTMLElement ? window.getComputedStyle(grid) : null
          const noteTextarea = rows[0]?.querySelector(
            '.erp-line-item-field--note textarea'
          )
          return {
            sectionClassNames,
            operationHeaderVisible,
            footerButtonVisible: visible(footerButton),
            noteTextareaVisible: visible(noteTextarea),
            listOverflowX: listStyle?.overflowX || '',
            listOverflowY: listStyle?.overflowY || '',
            listClientWidth: list instanceof HTMLElement ? list.clientWidth : 0,
            listScrollWidth: list instanceof HTMLElement ? list.scrollWidth : 0,
            gridAutoFlow: gridStyle?.gridAutoFlow || '',
            gridOverflowX: gridStyle?.overflowX || '',
            rowCount: rows.length,
            labelSameLine:
              labelTops.length > 0
                ? Math.max(...labelTops) - Math.min(...labelTops) <= 4
                : false,
            labels: labelTexts,
          }
        })
        assert.deepEqual(
          {
            operationHeaderVisible: bomCreateMetrics.operationHeaderVisible,
            footerButtonVisible: bomCreateMetrics.footerButtonVisible,
            noteTextareaVisible: bomCreateMetrics.noteTextareaVisible,
            listOverflowX: bomCreateMetrics.listOverflowX,
            listOverflowY: bomCreateMetrics.listOverflowY,
            gridAutoFlow: bomCreateMetrics.gridAutoFlow,
            gridOverflowX: bomCreateMetrics.gridOverflowX,
            rowCount: bomCreateMetrics.rowCount,
            labelSameLine: bomCreateMetrics.labelSameLine,
          },
          {
            operationHeaderVisible: false,
            footerButtonVisible: true,
            noteTextareaVisible: true,
            listOverflowX: 'auto',
            listOverflowY: 'auto',
            gridAutoFlow: 'column',
            gridOverflowX: 'visible',
            rowCount: 1,
            labelSameLine: true,
          },
          `BOM 新建草稿应使用同一套原地明细行且无操作列: ${JSON.stringify(
            bomCreateMetrics
          )}`
        )
        assert(
          bomCreateMetrics.sectionClassNames.includes(
            'erp-sales-order-lines-form'
          ) &&
            !bomCreateMetrics.sectionClassNames.includes(
              'erp-master-contact-list'
            ),
          `BOM 明细应调用共享明细区外壳，不应复用联系人列表样式: ${JSON.stringify(
            bomCreateMetrics
          )}`
        )
        for (const label of [
          '材料',
          '材料用量',
          '单位',
          '损耗率',
          '部位',
          '备注',
        ]) {
          assert(
            bomCreateMetrics.labels.includes(label),
            `BOM 新建草稿明细行应完整显示 ${label} 字段: ${JSON.stringify(
              bomCreateMetrics
            )}`
          )
        }
        await assertLineItemAddActionScrollsToNewRow(bomDraftModal, {
          scenarioName: 'business-standard-bom-create-form-modal',
        })
        await closeBusinessFormModal(page, bomDraftModal)
        await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
        const bomEditModal = page
          .locator('.erp-business-action-modal--form.ant-modal:visible')
          .last()
        await expectText(page, '编辑 BOM 草稿')
        await expectText(page, 'BOM 附件')
        await expectText(page, 'BOM 明细')
        await expectText(page, '已录入')
        await expectText(page, '3')
        const bomEditAttachmentMetrics = await bomEditModal.evaluate((node) => {
          const panel = node.querySelector('.business-attachment-panel')
          const button = panel?.querySelector('button')
          return {
            panelText: panel?.textContent?.replace(/\s+/g, ' ').trim() || '',
            buttonText: button?.textContent?.replace(/\s+/g, ' ').trim() || '',
          }
        })
        assert.equal(
          bomEditAttachmentMetrics.buttonText,
          '选择附件',
          `BOM 编辑附件按钮应使用共享文案: ${JSON.stringify(
            bomEditAttachmentMetrics
          )}`
        )
        await bomEditModal.getByRole('button', { name: '添加条目' }).click()
        await expectText(page, '第 4 行')
        await expectText(page, '材料用量')
        await expectText(page, '4')
        await page.waitForTimeout(220)
        const bomLineMetrics = await page.evaluate(() => {
          const visible = (node) => {
            if (!(node instanceof HTMLElement)) return false
            const rect = node.getBoundingClientRect()
            const style = window.getComputedStyle(node)
            return (
              rect.width > 0 &&
              rect.height > 0 &&
              style.display !== 'none' &&
              style.visibility !== 'hidden'
            )
          }
          const section = document.querySelector('.erp-bom-modal-items')
          const rows = Array.from(
            section?.querySelectorAll('.erp-sales-order-lines-form__row') || []
          ).filter(visible)
          const lastRow = rows[rows.length - 1]
          const operationHeaderVisible = Array.from(
            section?.querySelectorAll('th') || []
          ).some(
            (node) =>
              visible(node) &&
              node.textContent?.replace(/\s+/g, '').includes('操作')
          )
          const modalCount = Array.from(
            document.querySelectorAll(
              '.erp-business-action-modal--form.ant-modal'
            )
          ).filter(visible).length
          const maskCount = Array.from(
            document.querySelectorAll('.ant-modal-root .ant-modal-mask')
          ).filter(visible).length
          const rowRect = lastRow?.getBoundingClientRect()
          const modalBody = lastRow?.closest('.ant-modal-body')
          const bodyRect = modalBody?.getBoundingClientRect()
          const footer = section?.querySelector('.erp-line-items-form__footer')
          const footerRect = footer?.getBoundingClientRect()
          const footerButton = Array.from(
            section?.querySelectorAll('.erp-line-items-form__footer button') ||
              []
          ).find(
            (node) =>
              visible(node) &&
              node.textContent?.replace(/\s+/g, '').includes('添加条目')
          )
          const list = section?.querySelector(
            '.erp-sales-order-lines-form__list'
          )
          const listStyle =
            list instanceof HTMLElement ? window.getComputedStyle(list) : null
          const listRect = list?.getBoundingClientRect()
          const grid =
            lastRow instanceof HTMLElement
              ? lastRow.querySelector('.erp-sales-order-lines-form__grid')
              : null
          const gridStyle =
            grid instanceof HTMLElement ? window.getComputedStyle(grid) : null
          const gridRect = grid?.getBoundingClientRect()
          const labels = Array.from(
            lastRow?.querySelectorAll('.ant-form-item-label label') || []
          )
            .filter(visible)
            .map((node) => ({
              text: node.textContent?.replace(/\s+/g, '').trim(),
              top: node.getBoundingClientRect().top,
            }))
          const labelTops = labels.map((item) => item.top)
          const noteTextarea = lastRow?.querySelector(
            '.erp-line-item-field--note textarea'
          )
          return {
            modalCount,
            maskCount,
            operationHeaderVisible,
            footerButtonVisible: visible(footerButton),
            noteTextareaVisible: visible(noteTextarea),
            rowCount: rows.length,
            lastRowVisible: visible(lastRow),
            listOverflowX: listStyle?.overflowX || '',
            listOverflowY: listStyle?.overflowY || '',
            listClientWidth: list instanceof HTMLElement ? list.clientWidth : 0,
            listScrollWidth: list instanceof HTMLElement ? list.scrollWidth : 0,
            gridAutoFlow: gridStyle?.gridAutoFlow || '',
            gridOverflowX: gridStyle?.overflowX || '',
            labelsSameLine:
              labelTops.length > 0
                ? Math.max(...labelTops) - Math.min(...labelTops) <= 4
                : false,
            lastRowOverflowX:
              lastRow instanceof HTMLElement
                ? lastRow.scrollWidth - lastRow.clientWidth
                : 0,
            rowWidth: rowRect?.width || 0,
            rowTop: rowRect?.top || 0,
            rowBottom: rowRect?.bottom || 0,
            rowLeft: rowRect?.left || 0,
            rowRight: rowRect?.right || 0,
            gridLeft: gridRect?.left || 0,
            gridRight: gridRect?.right || 0,
            listLeft: listRect?.left || 0,
            listRight: listRect?.right || 0,
            bodyTop: bodyRect?.top || 0,
            bodyBottom: bodyRect?.bottom || 0,
            bodyLeft: bodyRect?.left || 0,
            bodyRight: bodyRect?.right || 0,
            footerTop: footerRect?.top || 0,
            footerBottom: footerRect?.bottom || 0,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            visibleLabels: labels.map((item) => item.text),
          }
        })
        assert.deepEqual(
          {
            modalCount: bomLineMetrics.modalCount,
            maskCount: bomLineMetrics.maskCount,
            operationHeaderVisible: bomLineMetrics.operationHeaderVisible,
            footerButtonVisible: bomLineMetrics.footerButtonVisible,
            noteTextareaVisible: bomLineMetrics.noteTextareaVisible,
            rowCount: bomLineMetrics.rowCount,
            lastRowVisible: bomLineMetrics.lastRowVisible,
            listOverflowX: bomLineMetrics.listOverflowX,
            listOverflowY: bomLineMetrics.listOverflowY,
            gridAutoFlow: bomLineMetrics.gridAutoFlow,
            gridOverflowX: bomLineMetrics.gridOverflowX,
            labelsSameLine: bomLineMetrics.labelsSameLine,
          },
          {
            modalCount: 1,
            maskCount: 1,
            operationHeaderVisible: false,
            footerButtonVisible: true,
            noteTextareaVisible: true,
            rowCount: 4,
            lastRowVisible: true,
            listOverflowX: 'auto',
            listOverflowY: 'auto',
            gridAutoFlow: 'column',
            gridOverflowX: 'visible',
            labelsSameLine: true,
          },
          `BOM 明细应原地新增行且不保留操作列: ${JSON.stringify(
            bomLineMetrics
          )}`
        )
        assert(
          bomLineMetrics.lastRowOverflowX <= 1 &&
            bomLineMetrics.gridLeft >= bomLineMetrics.rowLeft - 1 &&
            bomLineMetrics.gridRight <= bomLineMetrics.rowRight + 1 &&
            bomLineMetrics.rowWidth > bomLineMetrics.listClientWidth + 1 &&
            bomLineMetrics.listScrollWidth >
              bomLineMetrics.listClientWidth + 1 &&
            bomLineMetrics.documentOverflowX <= 1,
          `BOM 行卡片应完整包住字段网格，并只由明细列表承接横向滚动: ${JSON.stringify(
            bomLineMetrics
          )}`
        )
        assert(
          bomLineMetrics.listLeft >= bomLineMetrics.bodyLeft - 1 &&
            bomLineMetrics.listRight <= bomLineMetrics.bodyRight + 1 &&
            bomLineMetrics.rowTop >= bomLineMetrics.bodyTop - 1 &&
            bomLineMetrics.rowBottom <= bomLineMetrics.bodyBottom + 1 &&
            bomLineMetrics.footerTop >= bomLineMetrics.bodyTop - 1 &&
            bomLineMetrics.footerBottom <= bomLineMetrics.bodyBottom + 1,
          `BOM 新增行和添加条目按钮应同处 modal body 可见区域内: ${JSON.stringify(
            bomLineMetrics
          )}`
        )
        for (const label of [
          '材料',
          '材料用量',
          '单位',
          '损耗率',
          '部位',
          '备注',
        ]) {
          assert(
            bomLineMetrics.visibleLabels.includes(label),
            `BOM 新增行应完整显示 ${label} 字段: ${JSON.stringify(
              bomLineMetrics
            )}`
          )
        }
        await page.screenshot({
          path: path.join(outputDir, 'business-v1-bom-wide-line-scroll.png'),
          fullPage: true,
        })
        const bomRightEdgeMetrics = await bomEditModal.evaluate(
          async (node) => {
            const list = node.querySelector(
              '.erp-bom-modal-items .erp-sales-order-lines-form__list'
            )
            const rows = Array.from(
              node.querySelectorAll(
                '.erp-bom-modal-items .erp-sales-order-lines-form__row'
              )
            )
            const lastRow = rows.at(-1)
            const grid = lastRow?.querySelector(
              '.erp-sales-order-lines-form__grid'
            )
            const note = lastRow?.querySelector('.erp-line-item-field--note')

            if (list instanceof HTMLElement) {
              list.scrollLeft = list.scrollWidth - list.clientWidth
              await new Promise((resolve) =>
                window.requestAnimationFrame(() => resolve())
              )
            }

            const listRect = list?.getBoundingClientRect()
            const rowRect = lastRow?.getBoundingClientRect()
            const gridRect = grid?.getBoundingClientRect()
            const noteRect = note?.getBoundingClientRect()
            return {
              listScrollLeft: list instanceof HTMLElement ? list.scrollLeft : 0,
              listMaxScrollLeft:
                list instanceof HTMLElement
                  ? list.scrollWidth - list.clientWidth
                  : 0,
              listLeft: listRect?.left || 0,
              listRight: listRect?.right || 0,
              rowRight: rowRect?.right || 0,
              gridRight: gridRect?.right || 0,
              noteLeft: noteRect?.left || 0,
              noteRight: noteRect?.right || 0,
            }
          }
        )
        assert(
          bomRightEdgeMetrics.listScrollLeft > 1 &&
            Math.abs(
              bomRightEdgeMetrics.listScrollLeft -
                bomRightEdgeMetrics.listMaxScrollLeft
            ) <= 1 &&
            bomRightEdgeMetrics.noteLeft >= bomRightEdgeMetrics.listLeft - 1 &&
            bomRightEdgeMetrics.noteRight <=
              bomRightEdgeMetrics.listRight + 1 &&
            bomRightEdgeMetrics.gridRight <= bomRightEdgeMetrics.rowRight + 1 &&
            bomRightEdgeMetrics.rowRight <= bomRightEdgeMetrics.listRight + 1,
          `BOM 明细滚到最右侧时，备注字段和行卡片右边界都应完整可见: ${JSON.stringify(
            bomRightEdgeMetrics
          )}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-v1-bom-wide-line-scroll-right-edge.png'
          ),
          fullPage: true,
        })
        await assertLineItemAddActionScrollsToNewRow(bomEditModal, {
          scenarioName: 'business-standard-bom-edit-form-modal',
          targetRowCount: 7,
        })
        await closeBusinessFormModal(page, bomEditModal)
        await assertNoHorizontalOverflow(page, 'business-standard-bom')

        await gotoScenarioPath(page, '/erp/warehouse/inventory', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '库存台账')
        await expectText(page, '余额只读')
        await expectText(page, '页面模式')
        await expectText(page, '12.5')
        await expectText(page, '已预留')
        await expectText(page, '4')
        await expectText(page, '可用量')
        await expectText(page, '8.5')
        await expectText(page, 'SKU-STYLE-L1')
        const inventoryFilterSelects = page.locator(
          '.erp-v1-inventory-ledger-page .erp-business-operation-panel__filters .ant-select'
        )
        assert.equal(
          await inventoryFilterSelects.count(),
          5,
          '库存余额筛选区应包含对象类型、具体对象、产品规格、仓库和批次'
        )
        assert.equal(
          await inventoryFilterSelects
            .nth(2)
            .getAttribute('class')
            .then((value) =>
              String(value || '').includes('ant-select-disabled')
            ),
          true,
          '未选择成品对象时产品规格筛选应禁用'
        )
        await inventoryFilterSelects.nth(0).click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '成品' })
          .click()
        await page.waitForFunction(() => {
          const selects = document.querySelectorAll(
            '.erp-v1-inventory-ledger-page .erp-business-operation-panel__filters .ant-select'
          )
          return (
            selects.length === 5 &&
            !selects[2]?.classList.contains('ant-select-disabled')
          )
        })
        await inventoryFilterSelects.nth(2).click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: 'SKU-STYLE-L1' })
          .click()
        await expectText(page, 'SKU-STYLE-L1')
        const inventorySKUMetrics = await page.evaluate(() => {
          const filters = document.querySelector(
            '.erp-v1-inventory-ledger-page .erp-business-operation-panel__filters'
          )
          const table = document.querySelector(
            '.erp-v1-inventory-ledger-page .ant-table-content'
          )
          const filterRect = filters?.getBoundingClientRect()
          const controls = Array.from(filters?.children || []).map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
            }
          })
          return {
            filterOverflowX: filters
              ? filters.scrollWidth - filters.clientWidth
              : -1,
            controlsInsideFilters: controls.every(
              (rect) =>
                rect.left >= (filterRect?.left || 0) - 1 &&
                rect.right <= (filterRect?.right || 0) + 1
            ),
            tableOverflowX: table ? table.scrollWidth - table.clientWidth : -1,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert(
          inventorySKUMetrics.filterOverflowX <= 1 &&
            inventorySKUMetrics.controlsInsideFilters &&
            inventorySKUMetrics.tableOverflowX > 1 &&
            inventorySKUMetrics.documentOverflowX === 0,
          `库存 SKU 筛选应在筛选区内换行，宽表只在表格内滚动: ${JSON.stringify(
            inventorySKUMetrics
          )}`
        )
        await page.screenshot({
          path: path.join(outputDir, 'business-v1-inventory-sku-grain.png'),
          fullPage: true,
        })
        await page.getByRole('button', { name: '清空筛选' }).click()
        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForTimeout(160)
        const inventoryNarrowMetrics = await page.evaluate(() => {
          const filters = document.querySelector(
            '.erp-v1-inventory-ledger-page .erp-business-operation-panel__filters'
          )
          const table = document.querySelector(
            '.erp-v1-inventory-ledger-page .ant-table-content'
          )
          const filterRect = filters?.getBoundingClientRect()
          const controls = Array.from(filters?.children || []).map((node) => {
            const rect = node.getBoundingClientRect()
            return {
              left: rect.left,
              right: rect.right,
              width: rect.width,
            }
          })
          return {
            filterWidth: filterRect?.width || 0,
            filterOverflowX: filters
              ? filters.scrollWidth - filters.clientWidth
              : -1,
            controlsInsideFilters: controls.every(
              (rect) =>
                rect.left >= (filterRect?.left || 0) - 1 &&
                rect.right <= (filterRect?.right || 0) + 1 &&
                rect.width <= (filterRect?.width || 0) + 1
            ),
            tableOverflowX: table ? table.scrollWidth - table.clientWidth : -1,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert(
          inventoryNarrowMetrics.filterWidth > 0 &&
            inventoryNarrowMetrics.filterOverflowX <= 1 &&
            inventoryNarrowMetrics.controlsInsideFilters &&
            inventoryNarrowMetrics.tableOverflowX > 1 &&
            inventoryNarrowMetrics.documentOverflowX === 0,
          `库存 SKU 筛选在窄视口应留在筛选卡片内，宽表继续内部滚动: ${JSON.stringify(
            inventoryNarrowMetrics
          )}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-v1-inventory-sku-grain-narrow.png'
          ),
          fullPage: true,
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.waitForTimeout(160)
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-standard-inventory',
        })
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-inventory',
        })
        await expectNoButton(page, '新建库存')
        await expectNoButton(page, '新建库存调整')
        await expectNoButton(page, '生成库存调整')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory',
        })
        let forceEmptyInventoryBalances = false
        await page.route('**/rpc/inventory', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            forceEmptyInventoryBalances &&
            body.method === 'list_inventory_balances'
          ) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'business-standard-inventory-empty-search',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    inventory_balances: [],
                    total: 0,
                    limit: 100,
                    offset: 0,
                  },
                },
              }),
            })
            return
          }
          await route.fallback()
        })
        await page.getByText('12.5', { exact: false }).first().click()
        forceEmptyInventoryBalances = true
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await assertBusinessTableEmptyState(page, {
          scenarioName: 'business-standard-inventory-balances-empty-search',
          emptyText: '暂无库存余额',
          staleText: '12.5',
        })
        forceEmptyInventoryBalances = false
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '12.5')

        await page.getByRole('tab', { name: '库存批次' }).click()
        await expectText(page, 'INV-LOT-001')
        await expectText(page, 'SUP-LOT-001')
        await expectText(page, '冻结')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory-lots',
        })

        await page.getByRole('tab', { name: '库存流水' }).click()
        await expectText(page, '冲正')
        await expectText(page, '其他来源')
        await expectText(page, '未提供业务单号')
        await expectText(page, '已关联来源行')
        await expectText(page, '已关联原流水')
        await expectText(page, 'ledger seed')
        await assertTextAbsent(page, 'MANUAL_SEED')
        await assertTextAbsent(page, 'INV-TXN-001')
        await assertTextAbsent(page, '9001')
        await assertTextAbsent(page, '9002')
        await assertTextAbsent(page, '888500999')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory-txns',
        })
        await assertNoHorizontalOverflow(page, 'business-standard-inventory')

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '质量检验')
        await expectButton(page, '生成质检草稿')
        await expectButton(page, '导出筛选结果')
        await expectButton(page, '列顺序')
        await assertNoListDeleteTrashToolbar(page)
        await assertTextAbsent(page, 'quality_inspections')
        await expectText(page, '不合格退供应商仍走采购退货')
        await expectText(page, 'QI-STYLE-L1')
        await expectText(page, 'PR-STYLE-L1')
        await expectText(page, 'INV-LOT-001')
        const qualityInspectionHeaderMetrics = await page.evaluate(() => {
          const headers = Array.from(
            document.querySelectorAll(
              '.erp-business-data-table-card .ant-table-thead th .erp-module-column-header-text'
            )
          ).map((node) => ({
            text: String(node.textContent || '').trim(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
          }))
          return {
            headers,
            clippedHeaders: headers.filter(
              (header) => header.scrollWidth > header.clientWidth + 1
            ),
          }
        })
        assert.deepEqual(
          qualityInspectionHeaderMetrics.headers.map((header) => header.text),
          [
            '质检单号',
            '状态',
            '判定',
            '检验来源',
            '检验对象 / 批次',
            '检验信息',
            '判定备注',
          ],
          `质量检验默认表头应合并为可扫读列: ${JSON.stringify(
            qualityInspectionHeaderMetrics
          )}`
        )
        assert.deepEqual(
          qualityInspectionHeaderMetrics.clippedHeaders,
          [],
          `质量检验默认表头不应出现省略号: ${JSON.stringify(
            qualityInspectionHeaderMetrics
          )}`
        )
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-quality-inspections',
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-v1-quality-inspections',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-quality-inspections',
          unsortableHeaders: ['判定备注'],
        })
        await assertNoListDeleteTrashToolbar(page)
        let forceEmptyQualityInspections = false
        const qualityEmptySearchKeyword =
          'NO-MATCH-business-v1-quality-inspections-empty-search'
        await page.route('**/rpc/quality', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            forceEmptyQualityInspections &&
            body.method === 'list_quality_inspections'
          ) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'business-v1-quality-inspections-empty-search',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    quality_inspections: [],
                    total: 0,
                    limit: 100,
                    offset: 0,
                  },
                },
              }),
            })
            return
          }
          await route.fallback()
        })
        await page.getByText('QI-STYLE-L1', { exact: false }).first().click()
        forceEmptyQualityInspections = true
        await page
          .getByPlaceholder('搜索质检单')
          .first()
          .fill(qualityEmptySearchKeyword)
        await page.keyboard.press('Enter')
        await assertBusinessTableEmptyState(page, {
          scenarioName: 'business-v1-quality-inspections-empty-search',
          emptyText: '暂无质量检验单',
          staleText: 'QI-STYLE-L1',
        })
        forceEmptyQualityInspections = false
        await page.getByPlaceholder('搜索质检单').first().fill('')
        await page.keyboard.press('Enter')
        await expectText(page, 'QI-STYLE-L1')
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'quality-inspections',
          heading: '质量检验',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '生成质检草稿',
          titleText: '生成来料质检草稿',
          scenarioName: 'business-v1-quality-inspections',
        })
        await page.getByRole('row').filter({ hasText: 'QI-STYLE-L1' }).click()
        await expectText(page, 'QI-STYLE-L1 / INV-LOT-001')
        await expectButton(page, '判定合格')
        await expectButton(page, '判定不合格')
        await verifyBusinessActionFormModal(page, {
          buttonName: '生成质检草稿',
          titleText: '生成来料质检草稿',
          minFieldCount: 4,
          screenshotName: 'business-v1-quality-inspection-create-form-modal',
          expectedTexts: [
            '质检单号（自动）',
            '采购入库单',
            '采购入库行',
            '备注',
          ],
          absentTexts: [
            '采购入库单 ID',
            '批次 ID',
            '材料 ID',
            '仓库 ID',
            'source_type',
            'source_id',
          ],
          afterOpen: async (modal) => {
            await assertNonItemTextareaFullRow(modal, {
              labels: ['备注'],
              scenarioName: 'business-v1-quality-inspection-create-form-modal',
            })
          },
        })
        await assertNoHorizontalOverflow(
          page,
          'business-v1-quality-inspections'
        )

        await gotoScenarioPath(page, '/erp/warehouse/shipments', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '出货单')
        await expectButton(page, '新建草稿')
        await expectText(page, '计划出货日期')
        await expectText(page, '实际出货日期')
        await expectText(page, '总净重（kg）')
        await expectText(page, '待确认')
        await expectText(page, 'SHIP-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-shipments',
        })
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-shipments',
        })
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        let emptiedShipmentsOnce = false
        await page.route('**/rpc/operational_fact', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            !emptiedShipmentsOnce &&
            body.method === 'list_shipments' &&
            String(body.params?.status || '') === 'CANCELLED'
          ) {
            emptiedShipmentsOnce = true
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'business-v1-shipments-empty-filter',
                result: {
                  code: 0,
                  message: 'OK',
                  data: { shipments: [], total: 0, limit: 100, offset: 0 },
                },
              }),
            })
            return
          }
          await route.fallback()
        })
        await page
          .locator('.erp-business-filter-control--status')
          .first()
          .click()
        await page.getByTitle('已取消', { exact: true }).click()
        await assertBusinessTableEmptyState(page, {
          scenarioName: 'business-v1-shipments-empty-status-filter',
          emptyText: '暂无出货单',
          staleText: 'SHIP-STYLE-L1',
        })
        await page
          .locator('.erp-business-filter-control--status')
          .first()
          .click()
        await page.getByTitle('全部状态', { exact: true }).click()
        await expectText(page, 'SHIP-STYLE-L1')
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建草稿',
          titleText: '新建出货单',
          scenarioName: 'business-v1-shipments',
        })
        let emptyShipmentSourcesOnce = false
        await page.route('**/rpc/operational_fact', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            !emptyShipmentSourcesOnce &&
            body.method === 'list_shipments' &&
            Number(body.params?.limit || 0) === 500
          ) {
            emptyShipmentSourcesOnce = true
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'business-v1-shipment-source-import',
                result: {
                  code: 0,
                  message: 'OK',
                  data: { shipments: [], total: 0, limit: 500, offset: 0 },
                },
              }),
            })
            return
          }
          await route.fallback()
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建草稿',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: 'business-v1-shipment-create-form-modal',
          expectedTexts: [
            '出货明细',
            '从销售订单导入',
            '产品',
            '仓库',
            '预计总净重暂不可计算',
            '实际总净重（kg）',
          ],
          afterOpen: async (modal) => {
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从销售订单导入',
              titleText: '从销售订单导入出货明细',
              expectedTexts: [
                '销售订单号',
                '来源行',
                '客户',
                '剩余可出货',
                'SO-STYLE-L1',
                'PROD-STYLE-L1',
              ],
              emptyDescriptionText: '暂无可导入销售订单行',
              selectText: 'SO-STYLE-L1',
              importAndExpectText: '销售订单行追溯',
              scenarioName: 'shipment-source-import-picker',
            })
            await assertTextAbsent(page, 'sales_order_item_id 追溯')
            await expectText(page, '预计总净重：4.25 kg')
            await modal.screenshot({
              path: path.join(
                outputDir,
                'business-v1-shipment-create-predicted-weight.png'
              ),
            })
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'business-v1-shipment-create-form-modal',
              targetRowCount: 5,
              listSelector: '.erp-master-contact-list__items',
              rowSelector: '.erp-master-contact-list__row',
            })
          },
        })
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '查看明细',
          titleText: '查看出货明细',
          scenarioName: 'business-v1-shipment-readonly-detail',
        })
        const shipmentDetailTrigger = page.getByRole('button', {
          name: '查看明细',
        })
        await shipmentDetailTrigger.click()
        await expectText(page, '查看出货明细')
        await expectText(page, '已保存出货明细')
        await assertTextAbsent(page, '新增出货明细')
        const shipmentDetailModal = page
          .locator('.erp-business-action-modal:visible')
          .last()
        assert.equal(
          await shipmentDetailModal
            .getByRole('button', { name: '保存', exact: true })
            .count(),
          0,
          '出货只读明细弹窗不应提供保存动作'
        )
        assert.equal(
          await shipmentDetailModal
            .locator(
              'input:visible:not([type="hidden"]):not([disabled]), textarea:visible:not([disabled]), .ant-select:visible:not(.ant-select-disabled)'
            )
            .count(),
          0,
          '出货只读明细弹窗不应暴露可编辑表单控件'
        )
        await shipmentDetailModal
          .getByRole('button', { name: /关\s*闭/u })
          .click()
        await shipmentDetailModal.waitFor({ state: 'hidden', timeout: 10_000 })
        assert.equal(
          await shipmentDetailTrigger.evaluate(
            (node) => document.activeElement === node
          ),
          true,
          '关闭出货只读明细弹窗后焦点应回到查看明细按钮'
        )
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-v1-shipments',
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'shipments',
          heading: '出货单',
          headerMenuTargetLabel: '客户',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-shipments',
          unsortableHeaders: ['备注'],
        })
        await assertNoHorizontalOverflow(page, 'business-v1-shipments')

        await gotoScenarioPath(page, '/erp/engineering/processes', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '加工环节')
        const processOuterPageHeadCount = await page
          .locator('.erp-admin-page-head')
          .count()
        assert.equal(
          processOuterPageHeadCount,
          0,
          'business-v1-processes 不应同时显示外层页头和内容区页头'
        )
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-processes',
        })
        await expectText(page, '查货')
        await expectText(page, '手工')
        await expectText(page, '车缝')
        await expectText(page, '包装')
        await expectText(page, '可委外')
        await expectText(page, '可内制')
        await expectText(page, '需质检')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工环节',
          titleText: '新建加工环节',
          minFieldCount: 8,
          screenshotName: 'business-v1-process-create-form-modal',
          expectedTexts: [
            '环节编号',
            '环节名称',
            '环节类别',
            '可委外',
            '可内制',
            '需质检',
            '只标记该工序后续可能需要质检',
          ],
          afterOpen: async (modal) => {
            await assertProcessSuggestionOptions(page, modal, {
              scenarioName: 'business-v1-processes',
            })
          },
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'processes',
          heading: '加工环节',
          headerMenuTargetLabel: '环节名称',
        })
        await assertNoHorizontalOverflow(page, 'business-v1-processes')

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        await expectButton(page, '新建加工合同')
        await expectButton(page, '导出筛选结果')
        await expectButton(page, '列顺序')
        await assertNoListDeleteTrashToolbar(page)
        await expectText(page, '业务单据：加工合同')
        await assertTextAbsent(page, '加工合同只表达委外承诺和打印快照')
        await expectText(page, '查货只是工序候选')
        await assertTextAbsent(page, '判定结果回质检模块')
        await expectText(page, '本页协同')
        await assertCurrentOperationBarCompact(page, {
          scenarioName: 'business-v1-processing-contracts',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-v1-processing-contracts',
          expectedLabels: ['总记录', '当前结果', '草稿', '已确认'],
          allowWrappedStats: true,
        })
        await assertNoListDeleteTrashToolbar(page)
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'processing-contracts',
          heading: '委外订单',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-v1-processing-contracts',
          unsortableHeaders: ['备注'],
        })
        await assertTextAbsent(page, '生成委外合同')
        await expectButton(page, '加工合同打印')
        await expectNoButton(page, '作业指导书打印')
        await expectNoButton(page, '打印作业指导书')
        const processingContractPrintButton = page.getByRole('button', {
          name: '加工合同打印',
        })
        assert(
          await processingContractPrintButton.isDisabled(),
          '未选中加工合同前，加工合同打印按钮应保持禁用'
        )
        await page
          .getByRole('row')
          .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
          .click()
        assert.equal(
          await page
            .getByRole('button', { name: /^(关联|相关单据|查看关联)/ })
            .count(),
          0,
          '加工合同页当前操作区不应保留跨模块相关单据下拉，避免加工页承接质检、库存或应付事实'
        )
        assert.equal(
          await processingContractPrintButton.isDisabled(),
          false,
          '选中加工合同后，加工合同打印按钮应启用'
        )
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'business-v1-processing-contracts',
          primaryActionLabel: '提交',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['确认下单', '关闭', '取消'],
        })
        await page.keyboard.press('Escape')
        await assertTextAbsent(page, '打印单据')
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建加工合同',
          titleText: '新建加工合同',
          scenarioName: 'business-v1-processing-contracts',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工合同',
          titleText: '新建加工合同',
          minFieldCount: 6,
          screenshotName: 'business-v1-outsourcing-order-create-form-modal',
          expectedTexts: [
            '加工合同号',
            '加工厂',
            '加工明细',
            '工序',
            '单位',
            '查货只表示加工环节',
          ],
          afterOpen: async (modal) => {
            await assertNonItemTextareaFullRow(modal, {
              labels: ['备注'],
              scenarioName: 'business-v1-processing-contracts-form-modal',
            })
            await assertOutsourcingProcessSelectOptions(page, modal, {
              scenarioName: 'business-v1-processing-contracts',
            })
            await assertLineItemSectionTitleBold(modal, {
              scenarioName: 'business-v1-processing-contracts-form-modal',
              titleText: '加工明细',
            })
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'business-v1-processing-contracts-form-modal',
            })
          },
        })
        await assertTextAbsent(page, '销售订单ID')
        await assertTextAbsent(page, '单位ID')
        await assertTextAbsent(page, '产品编号快照')
        await verifyBusinessRowDoubleClickEditModal(page, {
          rowText: 'SIM-OUTSOURCE-CONTRACT-L1',
          titleText: '编辑加工合同',
          scenarioName: 'business-v1-processing-contracts',
          afterModalOpen: async () => {
            await expectText(page, '加工明细')
            await expectButton(page, '添加条目')
          },
        })
        await assertNoHorizontalOverflow(
          page,
          'business-v1-processing-contracts'
        )

        const verifyWorkflowV1Page = async ({
          path,
          heading,
          absentTexts,
          scenarioName,
          refreshMessage,
          afterPageReady,
        }) => {
          await gotoScenarioPath(page, path, {
            waitUntil: 'domcontentloaded',
          })
          await expectHeading(page, heading)
          await expectText(page, '协同任务')
          await expectText(page, '业务处理分开完成')
          for (const text of absentTexts) {
            await assertTextAbsent(page, text)
          }
          await assertTextAbsent(page, '导出预览字段')
          await assertTextAbsent(page, '打印单据')
          await assertTextAbsent(page, '加工合同打印')
          if (afterPageReady) {
            await afterPageReady()
          }
          await assertUnifiedListToolbarShell(page, {
            scenarioName,
            exportDisabled: true,
            exportTooltip: '当前页面只处理协同任务，暂不提供业务数据导出。',
          })
          await page.getByRole('button', { name: '刷新当前页' }).click()
          const expectedRefreshMessage =
            refreshMessage || `${heading}协同任务已刷新`
          await expectText(page, expectedRefreshMessage)
          await expectNoButton(page, '删除')
          await assertNoHorizontalOverflow(page, scenarioName)
        }

        await gotoScenarioPath(page, '/erp/production/orders', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '生产订单')
        await expectText(page, 'MO-STYLE-L1-20260713')
        await expectText(page, '维护生产计划源单')
        await expectButton(page, '新建生产订单')
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).click()
        await expectButton(page, '编辑')
        await expectButton(page, /^发\s*布$/u)
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).dblclick()
        const productionOrderModal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '编辑生产订单' })
        await expectText(page, '编辑生产订单')
        await expectText(page, '销售订单行（可选）')
        await expectText(page, 'BOM 版本（可选）')
        await expectText(page, '明细 22')
        await assertNoHorizontalOverflow(page, 'business-production-orders')
        await closeBusinessFormModal(page, productionOrderModal)

        await verifyWorkflowV1Page({
          path: '/erp/production/scheduling',
          heading: '生产排程',
          absentTexts: ['发起排程协同', '新建排程单', '生成生产任务'],
          scenarioName: 'business-workflow-production-scheduling',
          afterPageReady: async () => {
            await expectText(page, '暂无生产排程协同任务')
            await expectText(page, '本页协同')
          },
        })

        await verifyWorkflowV1Page({
          path: '/erp/production/exceptions',
          heading: '生产异常',
          absentTexts: [
            '登记异常协同',
            '新建异常单',
            '关闭异常单',
            '生成异常处理',
          ],
          scenarioName: 'business-workflow-production-exceptions',
          afterPageReady: async () => {
            await expectText(page, '暂无生产异常协同任务')
            await expectText(page, '本页协同')
          },
        })

        await page.evaluate(async () => {
          const createTask = async (id, params) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                method: 'create_task',
                params,
              }),
            })
            return response.json()
          }
          await createTask('formal-shipping-release-task', {
            task_code: 'style-l1-formal-shipping-release',
            task_group: 'shipment_release',
            task_name: '出货放行协同确认',
            source_type: 'shipping-release',
            source_id: 9101,
            source_no: 'SHIP-REL-L1',
            business_status_key: 'shipment_pending',
            task_status_key: 'ready',
            owner_role_key: 'warehouse',
            payload: {
              critical_path: true,
              shipment_release_page_scope: 'workflow_only',
            },
          })
          await createTask('formal-shipping-release-other-source-task', {
            task_code: 'style-l1-formal-shipping-release-other',
            task_group: 'customer_followup',
            task_name: '同来源非放行任务',
            source_type: 'shipping-release',
            source_id: 9102,
            source_no: 'SHIP-REL-OTHER',
            business_status_key: 'shipment_pending',
            task_status_key: 'ready',
            owner_role_key: 'sales',
            payload: {
              shipment_release_page_scope: 'not_for_release_page',
            },
          })
        })

        await verifyWorkflowV1Page({
          path: '/erp/warehouse/shipping-release',
          heading: '出货放行',
          absentTexts: [
            '发起放行协同',
            '新建放行单',
            '生成出货放行',
            '确认放行',
          ],
          scenarioName: 'business-workflow-shipping-release',
          refreshMessage: '出货放行协同任务已刷新',
          afterPageReady: async () => {
            await assertWorkflowDueDateRangeFilterLayout(page, {
              scenarioName: 'business-workflow-shipping-release',
            })
            await expectText(page, '待办')
            await page.getByRole('button', { name: '展开' }).first().click()
            await expectText(page, '出货放行协同确认')
            await expectText(page, 'SHIP-REL-L1')
            await assertTextAbsent(page, '同来源非放行任务')
            await assertTextAbsent(page, 'SHIP-REL-OTHER')
            await assertPageAttachmentModalEntrypoint(page, {
              scenarioName:
                'business-workflow-shipping-release-attachment-modal',
              rowText: 'SHIP-REL-L1',
              modalTitle: '协同任务附件',
              panelTitle: '协同任务附件',
            })

            let failedListTasksOnce = false
            await page.route('**/rpc/workflow', async (route) => {
              const body = route.request().postDataJSON() || {}
              if (!failedListTasksOnce && body.method === 'list_tasks') {
                failedListTasksOnce = true
                await route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: body.id || 'formal-shipping-release-list-failed',
                    result: {
                      code: 500123,
                      message: 'shipping release list failed',
                      data: null,
                    },
                  }),
                })
                return
              }
              await route.fallback()
            })
            await page.getByRole('button', { name: '刷新当前页' }).click()
            await expectText(page, '加载出货放行协同任务失败')
            await expectText(page, '本页暂无待处理协同任务。')
            await assertTextAbsent(page, '出货放行协同确认')

            await page.evaluate(async () => {
              const response = await fetch('/rpc/workflow', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: 'formal-shipping-release-stale-task',
                  method: 'create_task',
                  params: {
                    task_code: 'style-l1-formal-shipping-release-stale',
                    task_group: 'shipment_release',
                    task_name: '出货放行刷新后协同确认',
                    source_type: 'shipping-release',
                    source_id: 9103,
                    source_no: 'SHIP-REL-STALE',
                    business_status_key: 'shipment_pending',
                    task_status_key: 'ready',
                    owner_role_key: 'warehouse',
                    payload: {
                      critical_path: true,
                      shipment_release_page_scope: 'workflow_only',
                    },
                  },
                }),
              })
              return response.json()
            })
            await page.getByRole('button', { name: '刷新当前页' }).click()
            await expectText(page, '出货放行刷新后协同确认')
            await expectText(page, 'SHIP-REL-STALE')

            await page
              .locator('.erp-business-module-task-item')
              .filter({ hasText: '出货放行刷新后协同确认' })
              .first()
              .getByRole('button', { name: '处理' })
              .click()
            await expectText(page, '任务处理')
            await expectText(page, '出货放行刷新后协同确认')
            await expectText(
              page,
              '完成、阻塞、解除阻塞、退回和催办只处理协同任务；库存、出货、应收、开票和付款仍需进入对应业务模块处理。'
            )

            let emptiedListTasksOnce = false
            await page.route('**/rpc/workflow', async (route) => {
              const body = route.request().postDataJSON() || {}
              if (!emptiedListTasksOnce && body.method === 'list_tasks') {
                emptiedListTasksOnce = true
                await route.fulfill({
                  status: 200,
                  contentType: 'application/json',
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: body.id || 'formal-shipping-release-list-empty',
                    result: {
                      code: 0,
                      message: 'OK',
                      data: {
                        tasks: [],
                        total: 0,
                        limit: 100,
                        offset: 0,
                      },
                    },
                  }),
                })
                return
              }
              await route.fallback()
            })
            await page.evaluate(() => {
              const refreshButton = Array.from(
                document.querySelectorAll('button')
              ).find(
                (button) =>
                  String(button.textContent || '').trim() === '刷新当前页'
              )
              refreshButton?.click()
            })
            await expectText(page, '出货放行协同任务已刷新')
            await waitForTaskActionDrawerClosed(
              page,
              'business-formal-shipping-release-stale-task'
            )
            await page.waitForFunction(() => {
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
              return Array.from(
                document.querySelectorAll('.erp-business-module-task-item')
              )
                .filter(isVisible)
                .every(
                  (node) =>
                    !String(node.textContent || '').includes(
                      '出货放行刷新后协同确认'
                    )
                )
            })
            const staleTaskMetrics = await page.evaluate(() => {
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
              const visibleTaskTexts = Array.from(
                document.querySelectorAll('.erp-business-module-task-item')
              )
                .filter(isVisible)
                .map((node) =>
                  String(node.textContent || '')
                    .replace(/\s+/gu, ' ')
                    .trim()
                )
              return {
                visibleTaskTexts,
                staleTaskVisible: visibleTaskTexts.some((text) =>
                  text.includes('出货放行刷新后协同确认')
                ),
              }
            })
            assert.equal(
              staleTaskMetrics.staleTaskVisible,
              false,
              `刷新后不应继续显示已消失的协同任务: ${JSON.stringify(staleTaskMetrics)}`
            )
          },
        })

        await gotoScenarioPath(page, '/erp/production/progress', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '生产进度')
        await expectText(page, 'PROD-FACT-L1')
        await expectText(page, '生产发料、成品入库和返工记录')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-production-progress',
        })
        await assertTextAbsent(page, '生成生产进度')
        await assertTextAbsent(page, '登记生产事实')
        await assertTextAbsent(page, '幂等键')
        await assertTextAbsent(page, '内部引用')
        await assertNoHorizontalOverflow(
          page,
          'business-v1-production-progress'
        )

        await page.getByRole('menuitem', { name: '对账管理' }).click()
        await expectHeading(page, '对账管理')
        await expectText(page, 'REC-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-production-to-reconciliation-navigation',
        })
        await assertTextAbsent(page, '登记对账事实')
        await assertTextAbsent(page, '生成对账')
        await assertNoHorizontalOverflow(
          page,
          'business-v1-production-to-reconciliation-navigation'
        )

        await gotoScenarioPath(page, '/erp/warehouse/outbound', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '出库管理')
        await expectText(page, 'RSV-STYLE-L1')
        await expectText(page, '库存预留仅在确认出货时随出库处理一并消耗')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-outbound-reservations',
        })
        await assertTextAbsent(page, '登记库存预留')
        await assertTextAbsent(page, '新建出货单')
        await assertTextAbsent(page, '生成出库')
        await expectNoButton(page, '消耗')
        await assertNoHorizontalOverflow(page, 'business-v1-outbound')

        await gotoScenarioPath(page, '/erp/finance/receivables', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '应收管理')
        await expectText(page, 'AR-STYLE-L1')
        await expectText(page, '应收至少应来自真实出货后的核对')
        await assertTextAbsent(page, 'finance_facts')
        await assertTextAbsent(page, 'RECEIVABLE')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-receivables',
        })
        await assertTextAbsent(page, '登记应收事实')
        await assertTextAbsent(page, '生成应收')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-receivables',
        })
        await assertNoHorizontalOverflow(page, 'business-v1-receivables')

        await gotoScenarioPath(page, '/erp/finance/payables', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '应付管理')
        await expectText(page, 'AP-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-payables',
        })
        await assertTextAbsent(page, '登记应付事实')
        await assertTextAbsent(page, '生成应付')
        await assertNoHorizontalOverflow(page, 'business-v1-payables')

        await gotoScenarioPath(page, '/erp/finance/invoices', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '发票管理')
        await expectText(page, 'INV-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-invoices',
        })
        await assertTextAbsent(page, '登记发票事实')
        await assertTextAbsent(page, '生成发票')
        await assertNoHorizontalOverflow(page, 'business-v1-invoices')

        await gotoScenarioPath(page, '/erp/finance/reconciliation', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '对账管理')
        await expectText(page, 'REC-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-reconciliation',
        })
        await assertTextAbsent(page, '登记对账事实')
        await assertTextAbsent(page, '生成对账')
        await assertNoHorizontalOverflow(page, 'business-v1-reconciliation')

        await page.evaluate(() => {
          window.localStorage.setItem('plush_erp_theme_mode', 'dark')
        })
        await gotoScenarioPath(page, '/erp/finance/receivables', {
          waitUntil: 'domcontentloaded',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-v1-receivables-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await expectHeading(page, '应收管理')
        await assertTextAbsent(page, '登记应收事实')
        await assertTextAbsent(page, '生成应收')
        await assertNoHorizontalOverflow(page, 'business-v1-receivables-dark')

        await gotoScenarioPath(page, '/erp/production/exceptions', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '生产异常')
        await expectText(page, '协同任务')
        await expectText(page, '业务处理分开完成')
        await assertTextAbsent(page, '登记异常协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-workflow-production-exceptions-dark',
          exportDisabled: true,
          exportTooltip: '当前页面只处理协同任务，暂不提供业务数据导出。',
        })
        await assertTextAbsent(page, '新建异常单')
        await assertTextAbsent(page, '生成异常处理')
        await assertERPThemeMode(page, {
          scenarioName: 'business-workflow-production-exceptions-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })

        await page.setViewportSize({ width: 390, height: 844 })
        await page.evaluate(() => {
          window.localStorage.setItem('plush_erp_theme_mode', 'light')
        })
        await gotoScenarioPath(page, '/erp/warehouse/shipping-release', {
          waitUntil: 'domcontentloaded',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-formal-shipping-release-mobile',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await expectHeading(page, '出货放行')
        await expectText(page, '协同任务')
        await expectText(page, '业务处理分开完成')
        await assertTextAbsent(page, '发起放行协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-workflow-shipping-release-mobile',
          exportDisabled: true,
          exportTooltip: '当前页面只处理协同任务，暂不提供业务数据导出。',
        })
        await assertTextAbsent(page, '新建放行单')
        await assertTextAbsent(page, '生成出货放行')
        await assertTextAbsent(page, '导出预览字段')
        await assertNoHorizontalOverflow(
          page,
          'business-workflow-shipping-release-mobile'
        )

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'business-v1-outsourcing-mobile',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await expectHeading(page, '委外订单')
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-v1-outsourcing-mobile',
          expectedLabels: ['总记录', '当前结果', '草稿', '已确认'],
          allowWrappedStats: true,
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工合同',
          titleText: '新建加工合同',
          minFieldCount: 6,
          screenshotName: 'business-v1-outsourcing-mobile-modal',
          expectedTexts: [
            '加工合同号',
            '加工厂',
            '加工明细',
            '工序',
            '单位',
            '查货只表示加工环节',
          ],
          requireMultiColumn: false,
        })
        await assertTextAbsent(page, '销售订单ID')
        await assertTextAbsent(page, '单位ID')
        await assertNoHorizontalOverflow(page, 'business-v1-outsourcing-mobile')
      },
    },
    {
      name: 'business-formal-shipping-release-no-permission-desktop',
      path: '/erp/warehouse/shipping-release',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-no-workflow-read',
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['erp.dashboard.read'],
        menus: [
          {
            key: 'shipping-release',
            label: '出货放行',
            path: '/erp/warehouse/shipping-release',
            required_any: [],
            required_all: [],
          },
        ],
        erp_preferences: {
          column_orders: {},
        },
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['shipping-release'],
        actions: [],
      },
      verify: async (page) => {
        let shippingReleaseListTaskCalls = 0
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            body.method === 'list_tasks' &&
            body.params?.source_type === 'shipping-release'
          ) {
            shippingReleaseListTaskCalls += 1
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'formal-shipping-release-no-permission-list',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {
                    tasks: [],
                    total: 0,
                    limit: 100,
                    offset: 0,
                  },
                },
              }),
            })
            return
          }
          await route.fallback()
        })

        await expectHeading(page, '出货放行')
        await expectText(page, '协同任务')
        await expectText(page, '业务处理分开完成')
        await assertTextAbsent(page, '发起放行协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName:
            'business-formal-shipping-release-no-permission-desktop',
          exportDisabled: true,
          exportTooltip: '当前页面只处理协同任务，暂不提供业务数据导出。',
        })
        await expectText(page, '当前账号不能查看此类协同任务。')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        assert.equal(
          shippingReleaseListTaskCalls,
          0,
          '无 workflow.task.read 时出货放行页不应调用 list_tasks 拉取协同任务'
        )
        await assertTextAbsent(page, '出货放行协同任务已刷新')
        await assertTextAbsent(page, '出货放行协同确认')
        await assertNoHorizontalOverflow(
          page,
          'business-formal-shipping-release-no-permission-desktop'
        )
      },
    },
    {
      name: 'sales-order-acceptance-submit-action-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method, params = {} } = body
          let data = {}
          if (method === 'get_effective_session') {
            data = { session: customerRuntimeEffectiveSession }
          } else if (method === 'start_sales_order_acceptance_process') {
            assert.equal(
              Number(params.sales_order_id),
              1,
              `接单流程启动必须绑定当前销售订单: ${JSON.stringify(params)}`
            )
            assert.equal(
              params.business_ref_no,
              'SO-STYLE-L1',
              `接单流程启动必须携带业务编号: ${JSON.stringify(params)}`
            )
            data = {
              process_instance: {
                id: 101,
                process_key: 'sales_order_acceptance',
                business_ref_id: 1,
                business_ref_no: 'SO-STYLE-L1',
                status: 'active',
              },
              started_node: {
                id: 201,
                node_key: 'submit_sales_order',
                node_type: 'domain_command',
                version: 7,
                status: 'active',
              },
              nodes: [],
              runtime_boundary: {
                fact_boundary: 'no_fact_posting',
              },
            }
          } else if (method === 'execute_sales_order_acceptance_submit') {
            assert.equal(
              params.process_instance_id,
              101,
              `提交命令必须使用启动返回的流程实例: ${JSON.stringify(params)}`
            )
            assert.equal(
              params.process_node_instance_id,
              201,
              `提交命令必须使用启动返回的节点实例: ${JSON.stringify(params)}`
            )
            assert.equal(
              params.expected_version,
              7,
              `提交命令必须使用启动返回的节点版本: ${JSON.stringify(params)}`
            )
            assert.equal(
              Number(params.sales_order_id),
              1,
              `提交命令必须绑定当前销售订单: ${JSON.stringify(params)}`
            )
            data = {
              completed_node: {
                id: 201,
                node_key: 'submit_sales_order',
                status: 'completed',
              },
              next_node: {
                id: 202,
                node_key: 'order_approval',
                status: 'active',
              },
              linked_task: {
                id: 301,
                task_code: 'order_approval',
                owner_role_key: 'boss',
              },
            }
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                message: 'OK',
                data,
              },
            }),
          })
        })
      },
      verify: async (page) => {
        const customerConfigMethods = []
        const salesOrderMethods = []
        page.on('request', (request) => {
          try {
            const method = request.postDataJSON()?.method
            if (!method) return
            if (request.url().includes('/rpc/customer_config')) {
              customerConfigMethods.push(method)
            }
            if (request.url().includes('/rpc/sales_order')) {
              salesOrderMethods.push(method)
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })

        await expectHeading(page, '销售订单')
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'sales-order-acceptance-submit-action-desktop',
          primaryActionLabel: '提交',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['生效', '关闭', '取消'],
        })
        await page
          .locator('.erp-business-module-current-action')
          .first()
          .getByRole('button', { name: /提\s*交/u })
          .click()
        await expectText(page, '销售订单已提交，已进入老板审批')
        await waitForCapturedMethods(
          customerConfigMethods,
          [
            'start_sales_order_acceptance_process',
            'execute_sales_order_acceptance_submit',
          ],
          { scenarioName: 'sales-order-acceptance-submit-action-desktop' }
        )
        assert.equal(
          salesOrderMethods.includes('submit_sales_order'),
          false,
          `正式销售订单页提交不应回退旧 submit_sales_order: ${JSON.stringify({
            customerConfigMethods,
            salesOrderMethods,
          })}`
        )
        await expectText(page, 'SO-STYLE-L1')
        await assertNoHorizontalOverflow(
          page,
          'sales-order-acceptance-submit-action-desktop'
        )
      },
    },
    (() => {
      let operationalFactMethods = []
      let reservationCreateParams = []
      let salesOrderMethods = []
      return {
        name: 'sales-order-source-reservation-create-desktop',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-sales-order-reservation',
          is_super_admin: true,
          permissions: ['stock.reservation.create'],
        },
        beforeNavigate: async (page) => {
          operationalFactMethods = []
          reservationCreateParams = []
          salesOrderMethods = []
          page.on('request', (request) => {
            if (request.url().includes('/rpc/sales_order')) {
              try {
                const method = request.postDataJSON()?.method
                if (method) salesOrderMethods.push(method)
              } catch {
                // 非 JSON-RPC 请求不参与本断言。
              }
            }
            if (!request.url().includes('/rpc/operational_fact')) return
            try {
              const body = request.postDataJSON() || {}
              if (body.method) operationalFactMethods.push(body.method)
              if (body.method === 'create_stock_reservation_from_sales_order') {
                reservationCreateParams.push(body.params || {})
              }
            } catch {
              // 非 JSON-RPC 请求不参与本断言。
            }
          })

          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            const salesOrder = {
              id: 1,
              order_no: 'SO-RESERVE-L1',
              customer_id: 1,
              customer_snapshot: {
                id: 1,
                code: 'CUS-STYLE-L1',
                name: '暗色客户',
              },
              customer_order_no: 'PO-RESERVE-L1',
              title: '库存预留样式订单',
              order_date: 1_784_000_000,
              expected_ship_date: 1_784_086_400,
              lifecycle_status: 'active',
              version: 3,
              note: '',
              created_at: 1_784_000_000,
              updated_at: 1_784_000_000,
            }
            const salesOrderItem = {
              id: 1,
              sales_order_id: 1,
              line_no: 1,
              product_id: 1,
              product_sku_id: 1,
              product_code_snapshot: 'PROD-STYLE-L1',
              product_name_snapshot: '样式产品',
              sku_code_snapshot: 'SKU-STYLE-L1',
              color_snapshot: '深棕',
              ordered_quantity: '10',
              unit_id: 1,
              unit_name_snapshot: '只',
              unit_price: '12.50',
              amount: '125.00',
              line_status: 'open',
              note: '',
              created_at: 1_784_000_000,
              updated_at: 1_784_000_000,
            }
            let data
            if (method === 'list_sales_orders') {
              data = {
                sales_orders: [salesOrder],
                total: 1,
                limit: Number(params.limit || 100),
                offset: Number(params.offset || 0),
              }
            } else if (method === 'get_sales_order') {
              data = { sales_order: salesOrder }
            } else if (method === 'list_sales_order_items') {
              data = {
                sales_order_items: [salesOrderItem],
                total: 1,
                limit: Number(params.limit || 100),
                offset: Number(params.offset || 0),
              }
            } else {
              await route.fallback()
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 0, message: 'OK', data },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await page
            .getByText('SO-RESERVE-L1', { exact: false })
            .first()
            .click()
          await expectButton(page, '预留库存')
          await page.getByRole('button', { name: '预留库存' }).click()

          const modal = page
            .locator('.ant-modal')
            .filter({ hasText: '预留销售订单库存' })
            .last()
          try {
            await modal.waitFor({ state: 'visible', timeout: 10_000 })
          } catch (error) {
            const bodyText = String(
              (await page.locator('body').innerText()) || ''
            ).replace(/\s+/gu, ' ')
            throw new Error(
              `库存预留弹窗未打开: ${JSON.stringify({
                operationalFactMethods,
                salesOrderMethods,
                bodyText: bodyText.slice(0, 2000),
              })}; ${error.message}`
            )
          }
          await modal.getByText('SO-RESERVE-L1', { exact: true }).waitFor()
          await modal
            .getByText(/PROD-STYLE-L1.*样式产品/u)
            .first()
            .waitFor({ timeout: 10_000 })
          const modalText = String((await modal.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          assert.match(
            modalText,
            /PROD-STYLE-L1.*样式产品/u,
            `库存预留来源摘要缺少产品: ${modalText}`
          )
          assert.match(
            modalText,
            /SKU-STYLE-L1.*深棕/u,
            `库存预留来源摘要缺少 SKU / 规格: ${modalText}`
          )
          assert.match(
            modalText,
            /单位.*只/u,
            `库存预留来源摘要缺少单位: ${modalText}`
          )
          for (const technicalCopy of [
            'product_id',
            'product_sku_id',
            'unit_id',
            'idempotency_key',
          ]) {
            assert.equal(
              (await modal.getByText(technicalCopy, { exact: true }).count()) >
                0,
              false,
              `库存预留弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await modal.getByLabel('本次预留数量').fill('2')
          await modal.locator('textarea').fill('订单备货')
          await modal.screenshot({
            path: path.resolve(
              outputDir,
              'sales-order-source-reservation-create-desktop.png'
            ),
          })
          await modal.getByRole('button', { name: '确认预留' }).click()
          await expectText(page, '库存预留已创建')

          assert.equal(
            reservationCreateParams.length,
            1,
            `应且只应提交一次来源绑定的库存预留: ${JSON.stringify({
              operationalFactMethods,
              reservationCreateParams,
            })}`
          )
          const params = reservationCreateParams[0]
          const allowedKeys = new Set([
            'customer_key',
            'reservation_no',
            'sales_order_id',
            'sales_order_item_id',
            'warehouse_id',
            'lot_id',
            'quantity',
            'reserved_at',
            'note',
            'idempotency_key',
          ])
          assert(
            Object.keys(params).every((key) => allowedKeys.has(key)),
            `库存预留请求包含后端派生字段: ${JSON.stringify(params)}`
          )
          assert.equal(params.customer_key, 'yoyoosun')
          assert.equal(params.sales_order_id, 1)
          assert.equal(params.sales_order_item_id, 1)
          assert.equal(params.warehouse_id, 1)
          assert.equal(params.lot_id, 402)
          assert.equal(params.quantity, '2')
          assert.equal(params.note, '订单备货')
          assert.equal(typeof params.idempotency_key, 'string')
          assert.equal(params.idempotency_key.length > 0, true)
          assert.equal(
            operationalFactMethods.includes('create_stock_reservation'),
            false,
            `不得回退旧库存预留 RPC: ${JSON.stringify(operationalFactMethods)}`
          )
          for (const serverDerivedField of [
            'product_id',
            'product_sku_id',
            'unit_id',
          ]) {
            assert.equal(serverDerivedField in params, false)
          }
          await assertNoHorizontalOverflow(
            page,
            'sales-order-source-reservation-create-desktop'
          )
        },
      }
    })(),
    (() => {
      let operationalFactMethods = []
      let requirementListParams = []
      let materialIssueCreateParams = []
      let inventoryLotParams = []
      return {
        name: 'production-order-source-material-issue-desktop',
        path: '/erp/production/orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-production-material-issue',
          is_super_admin: true,
          permissions: [
            'pmc.plan.read',
            'pmc.plan.update',
            'production.fact.read',
            'production.material_issue.create',
          ],
        },
        beforeNavigate: async (page) => {
          operationalFactMethods = []
          requirementListParams = []
          materialIssueCreateParams = []
          inventoryLotParams = []
          page.on('request', (request) => {
            try {
              const body = request.postDataJSON() || {}
              if (
                request.url().includes('/rpc/inventory') &&
                body.method === 'list_inventory_lots'
              ) {
                inventoryLotParams.push(body.params || {})
              }
              if (!request.url().includes('/rpc/operational_fact')) return
              if (body.method) operationalFactMethods.push(body.method)
              if (
                body.method === 'list_production_order_material_requirements'
              ) {
                requirementListParams.push(body.params || {})
              }
              if (
                body.method === 'create_production_material_issue_from_order'
              ) {
                materialIssueCreateParams.push(body.params || {})
              }
            } catch {
              // 非 JSON-RPC 请求不参与本断言。
            }
          })
        },
        verify: async (page) => {
          await expectHeading(page, '生产订单')
          const orderText = page.getByText('MO-STYLE-L1-20260713', {
            exact: true,
          })
          await orderText.click()
          const releaseButton = page.getByRole('button', {
            name: /发\s*布/u,
          })
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (await releaseButton.isEnabled()) break
            await page.waitForTimeout(100)
          }
          assert.equal(
            await releaseButton.isEnabled(),
            true,
            '生产订单详情读取完成后应允许发布'
          )
          await releaseButton.click()
          await page.getByRole('button', { name: '确认发布' }).click()
          await expectText(page, '生产订单发布成功')

          await page
            .getByText('MO-STYLE-L1-20260713', { exact: true })
            .dblclick()
          const detailModal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '查看生产订单' })
            .last()
          await detailModal.waitFor({ state: 'visible', timeout: 10_000 })
          await detailModal
            .getByText('物料需求与领料', { exact: true })
            .waitFor()
          await detailModal
            .getByText(/物料需求已按发布时的 BOM 冻结/u)
            .waitFor()
          await detailModal
            .getByText('MAT-STYLE-L1', { exact: false })
            .waitFor()
          await detailModal
            .getByText('样式短毛绒布', { exact: false })
            .waitFor()
          await detailModal.getByText('8.000000', { exact: true }).waitFor()
          if (
            (await detailModal
              .getByRole('button', { name: /领\s*料/u })
              .count()) === 0
          ) {
            throw new Error(
              `生产领料行操作未开放: ${String(
                (await detailModal.innerText()) || ''
              ).replace(/\s+/gu, ' ')}`
            )
          }
          await detailModal.getByRole('button', { name: /领\s*料/u }).click()

          const issueModal = page
            .locator('.ant-modal:visible')
            .filter({ hasText: '生产领料' })
            .last()
          await issueModal.waitFor({ state: 'visible', timeout: 10_000 })
          const issueText = String(
            (await issueModal.innerText()) || ''
          ).replace(/\s+/gu, ' ')
          assert.match(issueText, /MO-STYLE-L1-20260713/u)
          assert.match(issueText, /MAT-STYLE-L1.*样式短毛绒布/u)
          assert.match(issueText, /计划需求.*10\.200000/u)
          assert.match(issueText, /已过账领料.*2\.200000/u)
          assert.match(issueText, /剩余可领.*8\.000000/u)
          try {
            await issueModal
              .getByText('MAT-LOT-STYLE-L1', { exact: false })
              .waitFor({ timeout: 10_000 })
          } catch (error) {
            throw new Error(
              `生产领料批次未加载: requests=${JSON.stringify(
                inventoryLotParams
              )}; modal=${issueText}`,
              { cause: error }
            )
          }
          for (const technicalCopy of [
            'material_id',
            'unit_id',
            'source_type',
            'source_id',
            'idempotency_key',
            'NEEDS_REVIEW',
          ]) {
            assert.equal(
              (await issueModal
                .getByText(technicalCopy, { exact: true })
                .count()) > 0,
              false,
              `生产领料弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await issueModal.getByLabel('本次领料数量').fill('3')
          await issueModal.locator('textarea').fill('首批生产领料')
          await issueModal.screenshot({
            path: path.resolve(
              outputDir,
              'production-order-source-material-issue-modal-desktop.png'
            ),
          })
          await issueModal
            .getByRole('button', { name: /生\s*成\s*领\s*料\s*记\s*录/u })
            .click()
          await expectText(page, '领料记录草稿已生成，请到生产记录核对并过账')

          assert.equal(
            requirementListParams.length,
            1,
            `物料需求应只按当前生产订单读取: ${JSON.stringify(requirementListParams)}`
          )
          assert.deepEqual(requirementListParams[0], {
            customer_key: 'yoyoosun',
            production_order_id: 71,
          })
          assert.deepEqual(inventoryLotParams, [
            {
              subject_type: 'MATERIAL',
              subject_id: 1,
              warehouse_id: 1,
              status: 'ACTIVE',
              limit: 500,
            },
          ])
          assert.equal(
            materialIssueCreateParams.length,
            1,
            `重复点击保护应只提交一次领料: ${JSON.stringify(materialIssueCreateParams)}`
          )
          const params = materialIssueCreateParams[0]
          const allowedKeys = new Set([
            'customer_key',
            'fact_no',
            'production_order_id',
            'production_order_item_id',
            'production_order_material_requirement_id',
            'warehouse_id',
            'lot_id',
            'quantity',
            'idempotency_key',
            'occurred_at',
            'note',
          ])
          assert(
            Object.keys(params).every((key) => allowedKeys.has(key)),
            `生产领料请求包含后端派生字段: ${JSON.stringify(params)}`
          )
          assert.equal(params.customer_key, 'yoyoosun')
          assert.equal(params.production_order_id, 71)
          assert.equal(params.production_order_item_id, 7101)
          assert.equal(params.production_order_material_requirement_id, 7201)
          assert.equal(params.warehouse_id, 1)
          assert.equal(params.lot_id, 403)
          assert.equal(params.quantity, '3')
          assert.equal(params.note, '首批生产领料')
          assert.equal(typeof params.idempotency_key, 'string')
          for (const serverDerivedField of [
            'material_id',
            'unit_id',
            'subject_type',
            'subject_id',
            'source_type',
            'source_id',
            'source_line_id',
          ]) {
            assert.equal(serverDerivedField in params, false)
          }
          assert.equal(
            operationalFactMethods.filter(
              (method) => method === 'list_production_facts'
            ).length >= 2,
            true,
            `创建后应重新读取关联生产记录: ${JSON.stringify(operationalFactMethods)}`
          )
          await assertNoHorizontalOverflow(
            page,
            'production-order-source-material-issue-desktop'
          )
        },
      }
    })(),
    (() => {
      let shippingReleaseListTaskCalls = 0
      let workflowWriteCalls = 0
      return {
        name: 'business-formal-shipping-release-readonly-actions-desktop',
        path: '/erp/warehouse/shipping-release',
        auth: 'admin',
        customerKey: 'yoyoosun',
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-workflow-readonly',
          is_super_admin: false,
          roles: [{ role_key: 'warehouse', name: '仓库' }],
          permissions: ['erp.dashboard.read', 'workflow.task.read'],
          menus: [
            {
              key: 'shipping-release',
              label: '出货放行',
              path: '/erp/warehouse/shipping-release',
              required_any: [],
              required_all: [],
            },
          ],
          erp_preferences: {
            column_orders: {},
          },
        },
        effectiveSession: {
          ...customerRuntimeEffectiveSession,
          pages: ['shipping-release'],
          actions: ['workflow.task.read'],
        },
        beforeNavigate: async (page) => {
          shippingReleaseListTaskCalls = 0
          workflowWriteCalls = 0
          await page.unroute('**/rpc/workflow')
          await page.route('**/rpc/workflow', async (route) => {
            const body = route.request().postDataJSON() || {}
            if (body.method === 'list_tasks') {
              shippingReleaseListTaskCalls += 1
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id || 'formal-shipping-release-readonly-list',
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      tasks: [
                        {
                          id: 9201,
                          task_code:
                            'style-l1-formal-shipping-release-readonly',
                          task_group: 'shipment_release',
                          task_name: '出货放行只读协同确认',
                          source_type: 'shipping-release',
                          source_id: 9201,
                          source_no: 'SHIP-REL-READONLY',
                          business_status_key: 'shipment_pending',
                          task_status_key: 'ready',
                          owner_role_key: 'warehouse',
                          payload: {
                            critical_path: true,
                            shipment_release_page_scope: 'workflow_only',
                          },
                        },
                      ],
                      total: 1,
                      limit: 100,
                      offset: 0,
                    },
                  },
                }),
              })
              return
            }
            if (body.method === 'explain_action_access') {
              const readonlyReason =
                '当前账号只有查看任务权限，没有完成、阻塞或催办权限。'
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id:
                    body.id || 'formal-shipping-release-readonly-action-access',
                  result: {
                    code: 0,
                    message: 'OK',
                    data: {
                      actions: [
                        {
                          action_key: 'complete',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.complete',
                          owner_role_key: 'warehouse',
                        },
                        {
                          action_key: 'block',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.update',
                          owner_role_key: 'warehouse',
                        },
                        {
                          action_key: 'reject',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.update',
                          owner_role_key: 'warehouse',
                        },
                        {
                          action_key: 'urge',
                          allowed: false,
                          reason: readonlyReason,
                          reason_code: 'missing_workflow_write_permission',
                          required_permission: 'workflow.task.update',
                          owner_role_key: 'warehouse',
                        },
                      ],
                    },
                  },
                }),
              })
              return
            }
            if (body.method === 'urge_task') {
              workflowWriteCalls += 1
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id || 'formal-shipping-release-readonly-write',
                  result: {
                    code: 403001,
                    message: 'readonly workflow user cannot write tasks',
                    data: null,
                  },
                }),
              })
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'formal-shipping-release-readonly-fallback',
                result: {
                  code: 0,
                  message: 'OK',
                  data: {},
                },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '出货放行')
          const pageShell = await page.evaluate(() => ({
            path: location.pathname,
            workflowPageCount: document.querySelectorAll(
              '.erp-workflow-business-page'
            ).length,
            headings: Array.from(document.querySelectorAll('h1, h2, h3, h4'))
              .map((node) => String(node.textContent || '').trim())
              .filter(Boolean),
            buttons: Array.from(document.querySelectorAll('button'))
              .map((node) => String(node.textContent || '').trim())
              .filter(Boolean),
          }))
          assert.equal(
            pageShell.workflowPageCount,
            1,
            `只读出货放行场景必须进入正式 Workflow 页面: ${JSON.stringify(pageShell)}`
          )
          await assertUnifiedListToolbarShell(page, {
            scenarioName:
              'business-formal-shipping-release-readonly-actions-desktop',
            exportDisabled: true,
            exportTooltip: '当前页面只处理协同任务，暂不提供业务数据导出。',
          })
          await expectText(page, '待办')
          await page.getByRole('button', { name: '展开' }).first().click()
          await expectText(page, '出货放行只读协同确认')
          await expectText(page, 'SHIP-REL-READONLY')
          await page
            .locator('.ant-table-row')
            .filter({ hasText: '出货放行只读协同确认' })
            .first()
            .click()
          for (const actionLabel of [
            '完成协同',
            '标记阻塞',
            '退回任务',
            '催办',
          ]) {
            assert.equal(
              await page
                .getByRole('button', { name: actionLabel })
                .isDisabled(),
              true,
              `只读任务不应允许${actionLabel}`
            )
          }

          const readonlyMetrics = await page
            .locator('.ant-table-row')
            .filter({ hasText: '出货放行只读协同确认' })
            .first()
            .evaluate((node) => {
              const buttons = Array.from(node.querySelectorAll('button')).map(
                (button) => String(button.textContent || '').trim()
              )
              return {
                text: String(node.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                buttons,
                scrollWidth: node.scrollWidth,
                clientWidth: node.clientWidth,
              }
            })
          assert(
            readonlyMetrics.buttons.length === 0,
            `出货放行只读表格行不应直接暴露动作按钮: ${JSON.stringify(
              readonlyMetrics
            )}`
          )
          assert(
            readonlyMetrics.scrollWidth <= readonlyMetrics.clientWidth + 1,
            `只读任务项出现横向溢出: ${JSON.stringify(readonlyMetrics)}`
          )
          assert(
            shippingReleaseListTaskCalls >= 1,
            '有 workflow.task.read 时出货放行页应允许读取协同任务'
          )
          assert.equal(workflowWriteCalls, 0, '只读协同任务不应触发 urge_task')
          await assertTextAbsent(page, '任务处理')
          await assertTextAbsent(page, '出货放行协同任务已完成')
          await assertNoHorizontalOverflow(
            page,
            'business-formal-shipping-release-readonly-actions-desktop'
          )
        },
      }
    })(),
  ]
}
