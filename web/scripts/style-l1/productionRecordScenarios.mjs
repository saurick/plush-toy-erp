import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createProductionRecordScenarios(deps) {
  const {
    assert,
    assertBusinessPageRefreshEntrypoint,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    clickERPThemeOption,
    expectButton,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    {
      name: 'business-production-exception-tabs-desktop',
      path: '/erp/production/exceptions',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-production-exception-tabs',
        configHash: 'style-l1-production-exception-tabs-hash',
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'production.exception.approve',
          'production.exception.submit',
          'production.fact.post',
          'workflow.task.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['production', 'boss'],
        },
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const assertProductionExceptionTabGeometry = async (
          scenarioName,
          expectedTab
        ) => {
          const filterDialog = page.getByRole('dialog', { name: '筛选条件' })
          if (expectedTab === '异常处理') {
            await page
              .locator(
                '.erp-business-operation-panel button[aria-haspopup="dialog"]'
              )
              .click()
            await filterDialog.waitFor()
            await waitForFiniteAnimations(page)
          }
          const metrics = await page.evaluate(() => {
            const visibleTables = Array.from(
              document.querySelectorAll('.ant-table-wrapper')
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
            const tabs = document.querySelector('[aria-label="生产记录工作区"]')
            const tabList = tabs?.querySelector('[role="tablist"]')
            const activeTab = tabs?.querySelector(
              '[role="tab"][aria-selected="true"]'
            )
            const tabWorkspace = tabs?.closest(
              '.erp-production-record-workspace'
            )
            const visibleTable = visibleTables[0]
            const visibleTableCard = visibleTable?.closest(
              '.erp-business-data-table-card'
            )
            const tabRect = tabs?.getBoundingClientRect()
            const tableRect = visibleTable?.getBoundingClientRect()
            const currentWorkspace = visibleTableCard?.closest(
              '.erp-business-page-layout'
            )
            const currentOperationPanel = Array.from(
              currentWorkspace?.children || []
            ).find((node) => node.matches?.('.erp-business-operation-panel'))
            const currentOperationPanelRect =
              currentOperationPanel?.getBoundingClientRect()
            const currentWorkspaceRowGap = currentWorkspace
              ? Number.parseFloat(
                  window.getComputedStyle(currentWorkspace).rowGap
                )
              : null
            const currentWorkspaceRenderedGap =
              currentOperationPanelRect && visibleTableCard
                ? visibleTableCard.getBoundingClientRect().top -
                  currentOperationPanelRect.bottom
                : null
            const decisionFilterLabels = [
              '异常类型',
              '审批状态',
              '业务状态',
            ].filter((label) =>
              document.querySelector(
                `.erp-business-filter-popover [aria-label="${label}"]`
              )
            )
            const currentActionVisible = String(
              currentOperationPanel?.textContent || ''
            ).includes('当前操作')
            const clearSelectionButton = Array.from(
              currentOperationPanel?.querySelectorAll('button') || []
            ).find(
              (button) => String(button.textContent || '').trim() === '清空已选'
            )
            const selectionActionBar = currentOperationPanel?.querySelector(
              '.erp-business-selection-action-bar'
            )
            const tableToolLabels = Array.from(
              currentOperationPanel?.querySelectorAll(
                '.erp-business-operation-panel__toolbar button'
              ) || []
            ).map((button) => String(button.textContent || '').trim())
            const taskWorkspace = document.querySelector(
              '.erp-workflow-business-page__tab-workspace'
            )
            const operationPanel = taskWorkspace?.querySelector(
              '.erp-business-operation-panel'
            )
            const tableCard = taskWorkspace?.querySelector(
              '.erp-business-data-table-card'
            )
            const taskWorkspaceRowGap = taskWorkspace
              ? Number.parseFloat(window.getComputedStyle(taskWorkspace).rowGap)
              : null
            const taskWorkspaceRenderedGap =
              operationPanel && tableCard
                ? tableCard.getBoundingClientRect().top -
                  operationPanel.getBoundingClientRect().bottom
                : null
            return {
              activeTab: String(activeTab?.textContent || '').trim(),
              tabOutsideCurrentTableCard:
                Boolean(tabWorkspace) && !visibleTableCard?.contains(tabs),
              tabBeforeCurrentTable:
                Boolean(tabRect && tableRect) &&
                tabRect.bottom <= tableRect.top + 1,
              tabListClientWidth: tabList?.clientWidth || 0,
              tabListScrollWidth: tabList?.scrollWidth || 0,
              currentActionVisible,
              currentOperationPanelExists: Boolean(currentOperationPanel),
              currentWorkspaceRenderedGap,
              currentWorkspaceRowGap,
              decisionFilterLabels,
              tableToolLabels,
              clearSelectionDisabled:
                clearSelectionButton?.disabled === true ||
                selectionActionBar?.classList.contains(
                  'erp-business-selection-action-bar--empty'
                ) === true,
              taskWorkspaceRenderedGap,
              taskWorkspaceRowGap,
              visibleTableCount: visibleTables.length,
            }
          })
          assert.equal(
            metrics.activeTab,
            expectedTab,
            `${scenarioName} 应只激活目标页签: ${JSON.stringify(metrics)}`
          )
          assert.equal(
            metrics.visibleTableCount,
            1,
            `${scenarioName} 不应同时纵向挂载两张业务表: ${JSON.stringify(
              metrics
            )}`
          )
          assert.equal(
            metrics.tabOutsideCurrentTableCard,
            true,
            `${scenarioName} 页签应由共享工作区承载，不随当前表格重建: ${JSON.stringify(
              metrics
            )}`
          )
          assert.equal(
            metrics.tabBeforeCurrentTable,
            true,
            `${scenarioName} 页签应位于当前表格上方: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.tabListScrollWidth <= metrics.tabListClientWidth + 1,
            `${scenarioName} 页签栏不应横向溢出: ${JSON.stringify(metrics)}`
          )
          assert.equal(
            metrics.currentOperationPanelExists,
            true,
            `${scenarioName} 当前工作区应有筛选与操作区域: ${JSON.stringify(
              metrics
            )}`
          )
          assert.equal(
            metrics.currentWorkspaceRowGap,
            0,
            `${scenarioName} 应复用业务页面标准模块间距: ${JSON.stringify(
              metrics
            )}`
          )
          assert(
            Math.abs(metrics.currentWorkspaceRenderedGap - 9) <= 0.5,
            `${scenarioName} 操作区与表格应保持 9px 间距: ${JSON.stringify(
              metrics
            )}`
          )
          assert.deepEqual(
            metrics.tableToolLabels,
            ['列设置'],
            `${scenarioName} 应只保留列顺序，不展示业务数据导出: ${JSON.stringify(
              metrics
            )}`
          )
          if (expectedTab === '异常处理') {
            assert.deepEqual(
              metrics.decisionFilterLabels,
              ['异常类型', '审批状态', '业务状态'],
              `${scenarioName} 应展示三项真实后端筛选: ${JSON.stringify(
                metrics
              )}`
            )
            assert.equal(
              metrics.currentActionVisible,
              true,
              `${scenarioName} 应展示当前操作区: ${JSON.stringify(metrics)}`
            )
            assert.equal(
              metrics.clearSelectionDisabled,
              true,
              `${scenarioName} 未选择记录时清空选择应禁用: ${JSON.stringify(
                metrics
              )}`
            )
          }
          if (expectedTab === '待审批') {
            assert.equal(
              metrics.taskWorkspaceRowGap,
              0,
              `${scenarioName} 应复用业务页面标准模块间距: ${JSON.stringify(
                metrics
              )}`
            )
            assert(
              Math.abs(metrics.taskWorkspaceRenderedGap - 9) <= 0.5,
              `${scenarioName} 操作区与表格应保持 9px 间距: ${JSON.stringify(
                metrics
              )}`
            )
          }
          if (expectedTab === '异常处理') {
            await filterDialog
              .getByRole('button', { name: '完成', exact: true })
              .click()
          }
          await assertNoHorizontalOverflow(page, scenarioName)
        }

        await expectHeading(page, '生产记录')
        await expectText(page, '暂无生产异常处置申请')
        await page
          .locator(
            '.erp-business-operation-panel button[aria-haspopup="dialog"]'
          )
          .click()
        await expectText(page, '全部异常类型')
        await expectText(page, '全部审批状态')
        await expectText(page, '全部业务状态')
        await page
          .getByRole('dialog', { name: '筛选条件' })
          .getByRole('button', { name: '完成', exact: true })
          .click()
        await expectText(page, '当前操作')
        await expectText(page, '请选择一条记录')
        await assertProductionExceptionTabGeometry(
          'business-production-exceptions-decisions-tab',
          '异常处理'
        )
        await page.getByRole('button', { name: /列设置/u }).click()
        const decisionColumnOrderDialog = page.getByRole('dialog', {
          name: '列设置',
        })
        await decisionColumnOrderDialog.waitFor({ state: 'visible' })
        await expectText(page, '异常单号')
        await decisionColumnOrderDialog.locator('.ant-modal-close').click()
        await decisionColumnOrderDialog.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '异常处理申请已刷新')
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-exceptions-decisions-tab.png'
          ),
          fullPage: true,
        })
        await page
          .getByText('异常处理申请已刷新', { exact: true })
          .waitFor({ state: 'hidden', timeout: 6_000 })

        await page.getByRole('tab', { name: '待审批' }).click()
        await expectText(page, '暂无待审批的生产异常处置申请。')
        await assertTextAbsent(page, '暂无生产异常处置申请')
        await assertProductionExceptionTabGeometry(
          'business-production-exceptions-tasks-tab',
          '待审批'
        )
        await page.getByRole('button', { name: /列设置/u }).click()
        const taskColumnOrderDialog = page.getByRole('dialog', {
          name: '列设置',
        })
        await taskColumnOrderDialog.waitFor({ state: 'visible' })
        await expectText(page, '任务编号')
        await taskColumnOrderDialog.locator('.ant-modal-close').click()
        await taskColumnOrderDialog.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '异常处理任务已刷新')
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-exceptions-tasks-tab.png'
          ),
          fullPage: true,
        })

        await page.getByRole('tab', { name: '异常处理' }).click()
        await expectText(page, '暂无生产异常处置申请')
        await clickERPThemeOption(page, '暗色')
        await assertERPThemeMode(page, {
          scenarioName: 'business-production-exceptions-saved-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '暂无生产异常处置申请')
        await assertERPThemeMode(page, {
          scenarioName: 'business-production-exceptions-decisions-tab-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertProductionExceptionTabGeometry(
          'business-production-exceptions-decisions-tab-dark',
          '异常处理'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-exceptions-decisions-tab-dark.png'
          ),
          fullPage: true,
        })

        await clickERPThemeOption(page, '浅色')
        await assertERPThemeMode(page, {
          scenarioName: 'business-production-exceptions-saved-light',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await page.setViewportSize({ width: 390, height: 844 })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '暂无生产异常处置申请')
        await assertERPThemeMode(page, {
          scenarioName: 'business-production-exceptions-mobile-light',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await assertProductionExceptionTabGeometry(
          'business-production-exceptions-decisions-tab-mobile',
          '异常处理'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-exceptions-decisions-tab-mobile.png'
          ),
          fullPage: true,
        })
        await page.getByRole('tab', { name: '待审批' }).click()
        await expectText(page, '暂无待审批的生产异常处置申请。')
        await assertProductionExceptionTabGeometry(
          'business-production-exceptions-tasks-tab-mobile',
          '待审批'
        )
        await page
          .locator(
            '.erp-workflow-business-page__tab-workspace .erp-business-data-table-card'
          )
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-exceptions-tasks-tab-mobile.png'
          ),
          fullPage: true,
        })
      },
    },
    {
      name: 'business-production-orders-refresh-entrypoint',
      path: '/erp/production/orders',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-business-production-order-refresh',
        configHash: 'style-l1-business-production-order-refresh-hash',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '生产订单')
        await expectText(page, 'MO-STYLE-L1-20260713')
        await expectButton(page, '新建生产订单')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-production-orders',
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '当前页面数据已刷新')
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-orders-shell-refresh-only-desktop.png'
          ),
          fullPage: true,
        })
        await page.setViewportSize({ width: 520, height: 900 })
        await page.waitForTimeout(160)
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'business-production-orders-narrow',
        })
        await assertNoHorizontalOverflow(
          page,
          'business-production-orders-narrow'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-production-orders-shell-refresh-only-narrow.png'
          ),
          fullPage: true,
        })
      },
    },
  ]
}
