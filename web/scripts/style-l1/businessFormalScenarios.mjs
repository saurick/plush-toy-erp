export function createBusinessFormalScenarios(deps) {
  const {
    assert,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessHeaderStatsSingleLine,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableInitialSelectionEmpty,
    assertBusinessMainTableSortableColumns,
    assertBusinessPageRefreshEntrypoint,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertOperationalFactModalViewport,
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
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickEditModal,
    verifySourceImportPicker,
  } = deps

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

  const assertViewTabsInTableCard = async (
    page,
    { scenarioName, tabNames }
  ) => {
    await page
      .locator('.erp-business-module-table-card .erp-business-view-tabs')
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await page.evaluate((expectedTabNames) => {
      const rectOf = (element) => {
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        return {
          top: rect.top,
          bottom: rect.bottom,
          height: rect.height,
          width: rect.width,
        }
      }
      const operationPanel = document.querySelector(
        '.erp-business-operation-panel'
      )
      const tableCard = document.querySelector(
        '.erp-business-module-table-card'
      )
      const tabs = document.querySelector('.erp-business-view-tabs')
      const table = document.querySelector(
        '.erp-business-module-table-card table'
      )
      const tabTexts =
        tabs instanceof HTMLElement
          ? Array.from(tabs.querySelectorAll('[role="tab"]')).map((node) =>
              String(node.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
            )
          : []
      return {
        expectedTabNames,
        tabTexts,
        tabsInsideTableCard:
          tableCard instanceof HTMLElement &&
          tabs instanceof HTMLElement &&
          tableCard.contains(tabs),
        operationPanel: rectOf(operationPanel),
        tableCard: rectOf(tableCard),
        tabs: rectOf(tabs),
        table: rectOf(table),
      }
    }, tabNames)

    assert(
      metrics.tabsInsideTableCard,
      `${scenarioName} 视图 Tabs 应归属到表格卡片顶部: ${JSON.stringify(metrics)}`
    )
    for (const tabName of tabNames) {
      assert(
        metrics.tabTexts.some((text) => text.includes(tabName)),
        `${scenarioName} 缺少视图 Tab “${tabName}”: ${JSON.stringify(metrics)}`
      )
    }
    assert(
      metrics.operationPanel &&
        metrics.tableCard &&
        metrics.operationPanel.bottom <= metrics.tableCard.top + 2,
      `${scenarioName} 表格卡片应位于筛选/当前操作卡之后: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tabs &&
        metrics.table &&
        metrics.tabs.top >= metrics.tableCard.top &&
        metrics.tabs.bottom <= metrics.table.top + 2,
      `${scenarioName} 视图 Tabs 应位于表格卡片内且在表格之前: ${JSON.stringify(metrics)}`
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
    const labels = ['导出当前结果', '列顺序']
    for (const label of labels) {
      await expectButton(page, label)
    }
    const exportButton = page
      .getByRole('button', { name: '导出当前结果' })
      .first()
    const columnOrderButton = page
      .getByRole('button', { name: '列顺序' })
      .first()
    assert.equal(
      await exportButton.isDisabled(),
      exportDisabled,
      `${scenarioName} 导出当前结果按钮禁用态不符合当前页面能力边界`
    )
    assert.equal(
      await columnOrderButton.isDisabled(),
      columnOrderDisabled,
      `${scenarioName} 列顺序按钮禁用态不符合当前页面能力边界`
    )
    await expectNoButton(page, '批量删除')
    await expectNoButton(page, '回收站')
    if (exportTooltip) {
      await exportButton.locator('xpath=..').hover()
      await expectText(page, exportTooltip)
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
    {
      name: 'business-formal-module-shells-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await expectButton(page, '新建供应商')
        await expectText(page, '当前操作')
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
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从 SKU 库导入',
              titleText: '从 SKU 库导入订单行',
              expectedTexts: ['SKU 编码', '产品名称', 'SKU-STYLE-L1'],
              emptyDescriptionText: '暂无可导入 SKU',
              selectText: 'SKU-STYLE-L1',
              scenarioName: 'sales-order-source-import-picker',
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

        await gotoScenarioPath(page, '/erp/master/products', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '产品档案')
        await expectText(page, '产品基础信息')
        await expectText(page, '产品规格')
        await expectButton(page, '新建产品')
        await assertNoListDeleteTrashToolbar(page)
        await expectText(page, 'PROD-STYLE-L1')
        await expectText(page, 'BEAR-STYLE')
        await expectText(page, '当前操作')
        await expectText(page, '本页协同')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'business-standard-products',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'business-standard-products',
          expectedLabels: ['总产品', '当前结果', '启用产品', '已选产品'],
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
        await assertTextAbsent(page, '默认单位 ID')
        await closeBusinessFormModal(
          page,
          page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .last()
        )
        await page.getByText('产品规格', { exact: true }).click()
        await expectButton(page, '新建产品规格')
        await expectText(page, 'SKU-STYLE-L1')
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-standard-product-skus',
        })
        await page.getByRole('button', { name: '新建产品规格' }).click()
        await expectText(page, '新建产品规格')
        await expectText(page, 'SKU 编号')
        await expectText(page, '产品')
        await closeBusinessFormModal(
          page,
          page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .last()
        )
        await assertNoHorizontalOverflow(page, 'business-standard-products')

        await gotoScenarioPath(page, '/erp/purchase/material-bom', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, 'BOM 管理')
        await expectButton(page, '新建草稿')
        await expectText(page, '工程资料版本')
        await expectText(page, 'BOM-STYLE-L1')
        await expectText(page, '已激活')
        await expectText(page, '当前操作')
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
          expectedLabels: ['总BOM', '当前结果', '已激活', '已选BOM'],
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
        await bomDraftModal.getByLabel('产品').click()
        await page.getByText('PROD-STYLE-L1').last().click()
        await expectText(page, '建议使用下一个版本号')
        await expectText(page, 'V1')
        await closeBusinessFormModal(page, bomDraftModal)
        await assertNoHorizontalOverflow(page, 'business-standard-bom')

        await gotoScenarioPath(page, '/erp/warehouse/inventory', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '库存台账')
        await expectText(page, '余额只读')
        await expectText(page, '内部筛选')
        await expectText(page, '12.5')
        await expectText(page, '已预留')
        await expectText(page, '4')
        await expectText(page, '可用量')
        await expectText(page, '8.5')
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
        const inventoryEmptySearchKeyword =
          'NO-MATCH-business-standard-inventory-balances-empty-search'
        await page.route('**/rpc/inventory', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (
            forceEmptyInventoryBalances &&
            ['list_inventory_balances', 'listInventoryBalances'].includes(
              body.method
            )
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
        await page
          .getByPlaceholder('搜索对象类型 / 内部引用')
          .first()
          .fill(inventoryEmptySearchKeyword)
        await page.keyboard.press('Enter')
        await assertBusinessTableEmptyState(page, {
          scenarioName: 'business-standard-inventory-balances-empty-search',
          emptyText: '暂无库存余额',
          staleText: '12.5',
        })
        forceEmptyInventoryBalances = false
        await page.getByPlaceholder('搜索对象类型 / 内部引用').first().fill('')
        await page.keyboard.press('Enter')
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
        await expectText(page, 'MANUAL_SEED')
        await expectText(page, 'ledger seed')
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'business-standard-inventory-txns',
        })
        await assertNoHorizontalOverflow(page, 'business-standard-inventory')

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '来料质检')
        await expectButton(page, '新建质检单')
        await expectButton(page, '导出当前结果')
        await expectButton(page, '列顺序')
        await assertNoListDeleteTrashToolbar(page)
        await expectText(page, 'quality_inspections')
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
            '采购来源',
            '物料批次',
            '检验信息',
            '更新时间',
            '判定备注',
          ],
          `来料质检默认表头应合并为可扫读列: ${JSON.stringify(
            qualityInspectionHeaderMetrics
          )}`
        )
        assert.deepEqual(
          qualityInspectionHeaderMetrics.clippedHeaders,
          [],
          `来料质检默认表头不应出现省略号: ${JSON.stringify(
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
          .getByPlaceholder('搜索质检单号 / 入库单 / 批次')
          .first()
          .fill(qualityEmptySearchKeyword)
        await page.keyboard.press('Enter')
        await assertBusinessTableEmptyState(page, {
          scenarioName: 'business-v1-quality-inspections-empty-search',
          emptyText: '暂无来料质检单',
          staleText: 'QI-STYLE-L1',
        })
        forceEmptyQualityInspections = false
        await page
          .getByPlaceholder('搜索质检单号 / 入库单 / 批次')
          .first()
          .fill('')
        await page.keyboard.press('Enter')
        await expectText(page, 'QI-STYLE-L1')
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'quality-inspections',
          heading: '来料质检',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建质检单',
          titleText: '新建来料质检单',
          scenarioName: 'business-v1-quality-inspections',
        })
        await page.getByRole('row').filter({ hasText: 'QI-STYLE-L1' }).click()
        await expectText(page, 'QI-STYLE-L1 / INV-LOT-001')
        await expectButton(page, '判定合格')
        await expectButton(page, '判定不合格')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建质检单',
          titleText: '新建来料质检单',
          minFieldCount: 7,
          screenshotName: 'business-v1-quality-inspection-create-form-modal',
          expectedTexts: ['采购入库单', '采购入库行', '批次', '材料', '仓库'],
          absentTexts: ['采购入库单 ID', '批次 ID', '材料 ID', '仓库 ID'],
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
        await expectText(page, '计划出货')
        await expectText(page, '实际出货')
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
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建草稿',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: 'business-v1-shipment-create-form-modal',
          expectedTexts: ['出货明细', '从销售订单导入', '产品', '仓库'],
          afterOpen: async (modal) => {
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从销售订单导入',
              titleText: '从销售订单导入出货明细',
              expectedTexts: ['销售订单号', '客户', 'SO-STYLE-L1'],
              scenarioName: 'shipment-source-import-picker',
            })
          },
        })
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        await page.getByRole('button', { name: '维护明细' }).click()
        await expectText(page, '维护出货明细')
        await expectText(page, '已保存出货明细')
        await expectText(page, '新增出货明细')
        const shipmentDetailModal = page
          .locator('.erp-business-action-modal:visible')
          .last()
        await shipmentDetailModal.locator('.ant-modal-close').click()
        await shipmentDetailModal.waitFor({ state: 'hidden', timeout: 10_000 })
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
        await expectButton(page, '导出当前结果')
        await expectButton(page, '列顺序')
        await assertNoListDeleteTrashToolbar(page)
        await expectText(page, 'Source Document：加工合同')
        await expectText(page, '加工合同只表达委外承诺和打印快照')
        await expectText(page, '查货只是工序候选')
        await expectText(page, '判定结果回质检模块')
        await expectText(page, '本页协同')
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
          await page.getByRole('button', { name: /^关联/ }).count(),
          0,
          '加工合同页当前操作区不应保留跨模块关联下拉，避免加工页承接质检、库存或应付事实'
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
            await assertOutsourcingProcessSelectOptions(page, modal, {
              scenarioName: 'business-v1-processing-contracts',
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
          createButton,
          absentTexts,
          scenarioName,
          refreshMessage,
          afterPageReady,
        }) => {
          await gotoScenarioPath(page, path, {
            waitUntil: 'domcontentloaded',
          })
          await expectHeading(page, heading)
          await expectText(page, 'Workflow V1')
          await expectText(page, '不写事实层')
          await expectButton(page, '刷新协同')
          await expectButton(page, createButton)
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
            exportTooltip: '当前 Workflow V1 只处理协同任务，不导出业务数据。',
          })
          await page.getByRole('button', { name: '刷新当前页' }).click()
          const expectedRefreshMessage =
            refreshMessage || `${heading}协同任务已刷新`
          await expectText(page, expectedRefreshMessage)
          await expectNoButton(page, '删除')
          await assertNoHorizontalOverflow(page, scenarioName)
        }

        await verifyWorkflowV1Page({
          path: '/erp/production/scheduling',
          heading: '生产排程',
          createButton: '新建排程协同',
          absentTexts: ['新建排程单', '生成生产任务'],
          scenarioName: 'business-workflow-production-scheduling',
          afterPageReady: async () => {
            await expectText(page, '暂无生产排程协同任务')
            await expectText(page, '本页协同')
          },
        })

        await verifyWorkflowV1Page({
          path: '/erp/production/exceptions',
          heading: '生产异常',
          createButton: '登记异常协同',
          absentTexts: ['新建异常单', '关闭异常单', '生成异常处理'],
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
          createButton: '新建放行协同',
          absentTexts: ['新建放行单', '生成出货放行', '确认放行'],
          scenarioName: 'business-workflow-shipping-release',
          refreshMessage: '出货放行协同任务已刷新',
          afterPageReady: async () => {
            await expectText(page, '待办')
            await page.getByRole('button', { name: '展开' }).first().click()
            await expectText(page, '出货放行协同确认')
            await expectText(page, 'SHIP-REL-L1')
            await assertTextAbsent(page, '同来源非放行任务')
            await assertTextAbsent(page, 'SHIP-REL-OTHER')

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
            await expectText(page, '本页暂无待处理 Workflow 任务。')
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
              .getByRole('button', { name: '完成' })
              .click()
            await expectText(page, '任务处理')
            await expectText(page, '出货放行刷新后协同确认')

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
        await expectButton(page, '新建生产事实')
        await expectText(page, 'PROD-FACT-L1')
        await expectText(page, '生产发料、成品入库和返工事实')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-production-progress',
        })
        await assertTextAbsent(page, '生成生产进度')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建生产事实',
          titleText: '新建生产事实',
          minFieldCount: 9,
          screenshotName: 'business-v1-production-fact-create-form-modal',
          expectedTexts: ['事实单号', '对象类型', '数量', '来源类型'],
        })
        await assertNoHorizontalOverflow(
          page,
          'business-v1-production-progress'
        )

        await gotoScenarioPath(page, '/erp/warehouse/outbound', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '出库管理')
        await expectButton(page, '新建出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await expectText(page, '出货出库')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-outbound-shipments',
        })
        await assertViewTabsInTableCard(page, {
          scenarioName: 'business-v1-outbound-shipments',
          tabNames: ['出货出库', '库存预留'],
        })
        await assertTextAbsent(page, '生成出库')
        await page.getByRole('tab', { name: '库存预留' }).click()
        await expectButton(page, '新建库存预留')
        await expectText(page, 'RSV-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-outbound-reservations',
        })
        await assertNoHorizontalOverflow(page, 'business-v1-outbound')

        await gotoScenarioPath(page, '/erp/finance/receivables', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '应收管理')
        await expectButton(page, '登记应收事实')
        await expectText(page, 'AR-STYLE-L1')
        await expectText(page, 'finance_facts')
        await expectText(page, 'RECEIVABLE')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-receivables',
        })
        await assertTextAbsent(page, '生成应收')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-v1-receivables',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '登记应收事实',
          titleText: '登记应收事实',
          minFieldCount: 10,
          screenshotName: 'business-v1-receivables-create-form-modal',
          expectedTexts: ['事实类型', '金额', '来源类型'],
        })
        await assertNoHorizontalOverflow(page, 'business-v1-receivables')

        await gotoScenarioPath(page, '/erp/finance/payables', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '应付管理')
        await expectButton(page, '登记应付事实')
        await expectText(page, 'AP-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-payables',
        })
        await assertNoHorizontalOverflow(page, 'business-v1-payables')

        await gotoScenarioPath(page, '/erp/finance/invoices', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '发票管理')
        await expectButton(page, '登记发票事实')
        await expectText(page, 'INV-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-invoices',
        })
        await assertNoHorizontalOverflow(page, 'business-v1-invoices')

        await gotoScenarioPath(page, '/erp/finance/reconciliation', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '对账管理')
        await expectButton(page, '登记对账事实')
        await expectText(page, 'REC-STYLE-L1')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-v1-reconciliation',
        })
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
        await page.getByRole('button', { name: '登记应收事实' }).click()
        await assertOperationalFactModalViewport(
          page,
          'business-v1-receivables-dark-modal'
        )

        await gotoScenarioPath(page, '/erp/production/exceptions', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '生产异常')
        await expectText(page, 'Workflow V1')
        await expectText(page, '不写事实层')
        await expectButton(page, '登记异常协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-workflow-production-exceptions-dark',
          exportDisabled: true,
          exportTooltip: '当前 Workflow V1 只处理协同任务，不导出业务数据。',
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
        await expectText(page, 'Workflow V1')
        await expectText(page, '不写事实层')
        await expectButton(page, '新建放行协同')
        await expectButton(page, '刷新协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName: 'business-workflow-shipping-release-mobile',
          exportDisabled: true,
          exportTooltip: '当前 Workflow V1 只处理协同任务，不导出业务数据。',
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
            required_permissions: [],
          },
        ],
        erp_preferences: {
          column_orders: {},
        },
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
        await expectText(page, 'Workflow V1')
        await expectText(page, '不写事实层')
        await expectButton(page, '新建放行协同')
        await assertUnifiedListToolbarShell(page, {
          scenarioName:
            'business-formal-shipping-release-no-permission-desktop',
          exportDisabled: true,
          exportTooltip: '当前 Workflow V1 只处理协同任务，不导出业务数据。',
        })
        assert(
          await page.getByRole('button', { name: '新建放行协同' }).isDisabled(),
          '无 workflow.task.create 时出货放行页新建协同按钮应禁用'
        )
        await expectText(page, '当前账号没有 Workflow 任务读取权限。')
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
    (() => {
      let shippingReleaseListTaskCalls = 0
      let workflowWriteCalls = 0
      return {
        name: 'business-formal-shipping-release-readonly-actions-desktop',
        path: '/erp/warehouse/shipping-release',
        auth: 'admin',
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
              required_permissions: [],
            },
          ],
          erp_preferences: {
            column_orders: {},
          },
        },
        beforeNavigate: async (page) => {
          shippingReleaseListTaskCalls = 0
          workflowWriteCalls = 0
          await page.unroute('**/rpc/workflow')
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
            if (
              body.method === 'update_task_status' ||
              body.method === 'urge_task'
            ) {
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
          await assertUnifiedListToolbarShell(page, {
            scenarioName:
              'business-formal-shipping-release-readonly-actions-desktop',
            exportDisabled: true,
            exportTooltip: '当前 Workflow V1 只处理协同任务，不导出业务数据。',
          })
          await expectText(page, '待办')
          await page.getByRole('button', { name: '展开' }).first().click()
          await expectText(page, '出货放行只读协同确认')
          await expectText(page, 'SHIP-REL-READONLY')
          await expectText(
            page,
            '只读：当前账号只有查看任务权限，没有完成、阻塞或催办权限。'
          )

          const readonlyMetrics = await page
            .locator('.erp-business-module-task-item')
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
          assert.deepEqual(
            readonlyMetrics.buttons,
            [],
            `只读任务项不应显示完成、阻塞或催办动作: ${JSON.stringify(
              readonlyMetrics
            )}`
          )
          assert(
            readonlyMetrics.text.includes('只读：当前账号只有查看任务权限'),
            `只读任务项缺少权限原因: ${JSON.stringify(readonlyMetrics)}`
          )
          assert(
            readonlyMetrics.scrollWidth <= readonlyMetrics.clientWidth + 1,
            `只读任务项出现横向溢出: ${JSON.stringify(readonlyMetrics)}`
          )
          assert(
            shippingReleaseListTaskCalls >= 1,
            '有 workflow.task.read 时出货放行页应允许读取协同任务'
          )
          assert.equal(
            workflowWriteCalls,
            0,
            '只读协同任务不应触发 update_task_status 或 urge_task'
          )
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
