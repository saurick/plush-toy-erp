import { createBusinessFormalScenarios } from './businessFormalScenarios.mjs'
import { createPurchaseReceiptScenarios } from './purchaseReceiptScenarios.mjs'

export function createStyleL1Scenarios(deps) {
  const {
    assert,
    assertAdminLoginLayout,
    assertAdminRoleModalLayout,
    assertAppAlertDialogLayout,
    assertBusinessCollaborationPanelCollapsedByDefault,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessHeaderStatsSingleLine,
    assertBusinessListEmptySearchState,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableInitialSelectionEmpty,
    assertBusinessMainTableSortableColumns,
    assertBusinessModuleToolbarControlStyle,
    assertBusinessPageRefreshEntrypoint,
    assertBusinessToolbarDisabledButtons,
    assertContractTableEditableAlignment,
    assertContractTableHeadersStaySingleLine,
    assertContractTotalCellsWrapLargeNumbers,
    assertDarkAntdStateSurfaces,
    assertDarkDashboardLinkButtonsUnboxed,
    assertDarkLoadingState,
    assertDarkThemeContrast,
    assertDarkThemeNeutralInteractions,
    assertDashboardMetricInteractionSemantics,
    assertDashboardTaskBoardLayout,
    assertDashboardWorkbenchEntryNavigation,
    assertDashboardWorkbenchLayout,
    assertDevPageUsesGlobalThemeOnly,
    assertERPThemeMode,
    assertEditablePrintWorkspacePopupRefresh,
    assertLineItemsUnifiedHorizontalScroll,
    assertLoginSegmentedReadable,
    assertMaterialContractMetaAlignment,
    assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
    assertMobileTaskBossDoneList,
    assertMobileTaskDarkDetailReadable,
    assertMobileTaskMainNavigation,
    assertMobileTaskRefreshFeedback,
    assertNoDashboardCenterLocalRefreshButton,
    assertNoDuplicatedAdminPageTitle,
    assertNoHorizontalOverflow,
    assertOperationalFactModalViewport,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertPaginationSizeChangerFocusStyle,
    assertPermissionSectionVisualSeparation,
    assertPrintCenterPreviewPopup,
    assertPrintPreviewPopup,
    assertPrintWorkspacePaginationStyle,
    assertProcessSuggestionOptions,
    assertProcessingContractPaperRowCount,
    assertProcessingContractSignatureLayout,
    assertPurchaseReceiptActionButtonState,
    assertPurchaseReceiptAddItemModalDarkTokens,
    assertPurchaseReceiptAddItemModalMetrics,
    assertPurchaseReceiptAddItemModalMobileLayout,
    assertPurchaseReceiptCreateModalDarkTokens,
    assertPurchaseReceiptCreateModalFocusStyles,
    assertPurchaseReceiptCreateModalKeyboardRecovery,
    assertPurchaseReceiptCreateModalMetrics,
    assertPurchaseReceiptCreateModalMobileLayout,
    assertPurchaseReceiptRowItemCount,
    assertRowSelectionClearsAfterCancel,
    assertShellRefreshButton,
    assertTaskActionDrawerLayout,
    assertTextAbsent,
    assertThemeReadable,
    assertVisibleModalInputFocusStyle,
    assertWorkspaceContinuedPageMargin,
    clickERPThemeOption,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    fillPurchaseReceiptAddItemModalBoundaryValues,
    fillPurchaseReceiptCreateModalBoundaryValues,
    gotoScenarioPath,
    isLightSurfaceColor,
    openPurchaseReceiptAddItemModal,
    openPurchaseReceiptCreateModal,
    outputDir,
    path,
    seedBusinessCollaborationOverflowTasks,
    selectPurchaseReceiptRow,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickEditModal,
    verifyFormalShellRowDoubleClickEditModal,
    verifySourceImportPicker,
    waitForPath,
    webDir,
  } = deps

  return [
    {
      name: 'root-redirect-desktop',
      path: '/',
      mockAdminRpc: true,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '毛绒 ERP 管理后台')
        await expectButton(page, /^登\s*录$/)
        await expectText(page, '毛绒玩具 ERP')
        await assertAdminLoginLayout(page, { minCardWidth: 520 })
      },
    },
    {
      name: 'root-redirect-mobile',
      path: '/',
      mockAdminRpc: true,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '毛绒 ERP 管理后台')
        await expectButton(page, /^登\s*录$/)
        await expectText(page, '毛绒玩具 ERP')
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-mobile',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await expectButton(page, /^登\s*录$/)
        await expectText(page, '毛绒玩具 ERP')
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-theme-modes-desktop',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'system',
          expectedEffectiveTheme: 'light',
        })
        await clickERPThemeOption(page, '暗色')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertThemeReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          selector: '.erp-login-card',
        })
        await assertLoginSegmentedReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
        })
        await page.evaluate(() => {
          window.localStorage.setItem('plush_erp_theme_mode', 'light')
          window.dispatchEvent(new Event('focus'))
        })
        await page.waitForFunction(
          () => document.documentElement.dataset.erpThemeMode === 'light',
          null,
          { timeout: 10_000 }
        )
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop-storage-sync',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await clickERPThemeOption(page, '暗色')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '毛绒 ERP 管理后台')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await clickERPThemeOption(page, '跟系统')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'system',
          expectedEffectiveTheme: 'light',
        })
      },
    },
    {
      name: 'admin-login-mobile-source-desktop-choice',
      path: '/m/sales/tasks',
      expectPath: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await page.getByText('后台管理', { exact: true }).click()
        await page.getByLabel('管理员账号').fill('style-l1-admin')
        await page.locator('#password').fill('style-l1-password')
        await page.getByRole('button', { name: /^登\s*录$/ }).click()
        await waitForPath(page, '/erp/dashboard')
        await expectHeading(page, '工作台')

        const rememberedEntry = await page.evaluate(() =>
          window.localStorage.getItem('erp:last_entry_target')
        )
        assert.equal(
          rememberedEntry,
          'desktop',
          '从任务端来源手动选择后台登录后，应记住后台入口'
        )
      },
    },
    {
      name: 'auth-expired-alert-mobile',
      path: '/erp/dashboard',
      auth: 'admin-expired',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-expired-alert-mobile',
        })
        await page.screenshot({
          path: path.resolve(outputDir, 'auth-expired-alert-mobile-open.png'),
          fullPage: true,
        })
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectText(page, '毛绒 ERP 管理后台')
      },
    },
    {
      name: 'erp-dashboard-redirect',
      path: '/erp/dashboard',
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await expectButton(page, /^登\s*录$/)
        await assertAdminLoginLayout(page, { minCardWidth: 520 })
      },
    },
    {
      name: 'erp-dashboard-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectText(page, '超级管理员')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '看板中心')
        await expectHeading(page, '工作台')
        await expectText(page, '优先处理队列')
        await expectText(page, '当前任务上下文')
        await expectText(page, '等待交接')
        await expectNoButton(page, '任务看板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        await assertDashboardWorkbenchLayout(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        await assertDashboardWorkbenchEntryNavigation(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
      },
    },
    {
      name: 'erp-task-board-desktop',
      path: '/erp/task-board',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectText(page, '超级管理员')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '看板中心')
        await expectHeading(page, '任务看板')
        await expectText(page, '可推进任务')
        await expectText(page, '阻塞交接')
        await expectText(page, '逾期任务')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-desktop',
          expectTaskMetrics: true,
        })
        await assertDashboardTaskBoardLayout(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-task-board-desktop',
        })
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-task-navigation',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-task-navigation',
                task_group: 'shipment_release',
                task_name: '看板跳转测试任务',
                source_type: 'shipping-release',
                source_id: 9010,
                source_no: 'OUT-DASH-NAV',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                payload: {
                  notification_type: 'task_created',
                  alert_type: 'shipment_pending',
                },
              },
            }),
          })
          return response.json()
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '看板跳转测试任务')
        await page
          .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
          .fill('OUT-DASH-NAV')
        await page.getByText('全部角色').click()
        await page.getByTitle('仓库', { exact: true }).click()
        await page.reload({ waitUntil: 'domcontentloaded' })
        await waitForPath(page, '/erp/task-board')
        assert.match(
          page.url(),
          /[?&]q=OUT-DASH-NAV(?:&|$)/,
          '任务看板关键词筛选应写入 URL'
        )
        assert.match(
          page.url(),
          /[?&]role=warehouse(?:&|$)/,
          '任务看板角色筛选应写入 URL'
        )
        await expectText(page, '看板跳转测试任务')
        await expectText(page, '从下方任务卡选择一条任务')
        await page
          .locator('.erp-task-board-card')
          .filter({ hasText: '看板跳转测试任务' })
          .locator('.erp-task-board-card-meta')
          .first()
          .click()
        const navigationCurrentTask = page
          .locator('.erp-task-center-current')
          .filter({ hasText: '看板跳转测试任务' })
          .first()
        await navigationCurrentTask
          .getByRole('button', { name: '处理完成', exact: true })
          .click()
        const taskDrawer = page.locator('.erp-task-action-drawer')
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-complete-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '处理完成',
          expectReasonInput: false,
        })
        await taskDrawer.getByRole('button', { name: '返回动作选择' }).click()
        await taskDrawer.getByRole('button', { name: '标记阻塞' }).click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-block-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '标记阻塞',
          expectReasonInput: true,
        })
        await page.locator('.erp-task-action-drawer .ant-drawer-close').click()
        await page
          .locator('.erp-task-action-drawer')
          .waitFor({ state: 'hidden', timeout: 10_000 })
        const restoredKeyword = await page
          .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
          .inputValue()
        assert.equal(restoredKeyword, 'OUT-DASH-NAV')
        const taskBoardFilters = page.locator('.erp-task-board-filters')
        const clearFiltersButton = taskBoardFilters
          .locator('button')
          .filter({ hasText: '清空筛选' })
        assert.equal(
          await clearFiltersButton.count(),
          1,
          '任务看板清空筛选按钮应只在筛选区作用域内命中一次'
        )
        assert.equal(
          await clearFiltersButton.isEnabled(),
          true,
          '任务看板存在 URL 筛选时清空按钮应可用'
        )
        await clearFiltersButton.click()
        assert.doesNotMatch(
          page.url(),
          /[?&](q|role)=/,
          '清空筛选后应移除任务看板 URL 筛选参数'
        )
        await page.waitForFunction(
          () =>
            document.querySelector(
              'input[placeholder="搜索任务、单号、来源、阻塞原因"]'
            )?.value === ''
        )
        const clearedKeyword = await page
          .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
          .inputValue()
        assert.equal(clearedKeyword, '')
        assert.equal(
          await clearFiltersButton.isDisabled(),
          true,
          '任务看板回到默认筛选后清空按钮应禁用'
        )
        const navigationLaneTask = page
          .locator('.erp-task-board-card')
          .filter({ hasText: '看板跳转测试任务' })
          .first()
        assert.equal(
          await navigationLaneTask
            .getByRole('button', { name: '看板跳转测试任务', exact: true })
            .count(),
          0,
          '无明确正式对象页时任务标题不应伪造成关联记录按钮'
        )
      },
    },
    {
      name: 'erp-exception-flow-desktop',
      path: '/erp/operations/exceptions',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectText(page, '超级管理员')
        await expectText(page, '运营工具')
        await expectHeading(page, '异常 / 阻塞闭环')
        await expectText(page, '阻塞记录')
        await expectText(page, '责任分派')
        await expectText(page, '处理跟进')
        await expectText(page, '验证恢复')
        await expectText(page, '关闭归档')
        await expectText(page, '闭环队列')
        await expectNoButton(page, '回任务看板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-exception-flow-desktop',
        })
      },
    },
    {
      name: 'erp-business-dashboard-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectText(page, '超级管理员')
        await expectText(page, '看板中心')
        await expectHeading(page, '业务看板')
        await expectText(page, '业务对象')
        await expectText(page, '当前风险')
        await expectText(page, '状态分布')
        await expectText(page, '核心链路健康')
        await expectText(page, '对象族')
        await expectText(page, '采购/入库')
        await expectText(page, '记录数')
        await expectNoButton(page, '任务看板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-business-dashboard-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-business-dashboard-desktop',
          expectBusinessSummary: true,
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-desktop',
        })
      },
    },
    {
      name: 'erp-business-dashboard-dark-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await expectHeading(page, '业务看板')
        await expectText(page, '业务对象')
        await expectText(page, '核心链路健康')
        await expectText(page, '状态分布')
        await expectText(page, '当前风险')
        await assertERPThemeMode(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          expectBusinessSummary: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
        })
        await assertDarkDashboardLinkButtonsUnboxed(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-board-summary-card',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-board-status-row',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-board-alert-item',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-business-dashboard-dark-desktop',
          selector: '.erp-business-dashboard-page',
        })
      },
    },
    {
      name: 'erp-layout-scroll-isolated',
      path: '/erp/dashboard',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.locator('.erp-admin-menu').waitFor({ timeout: 10_000 })
        await page.locator('.erp-admin-content').waitFor({ timeout: 10_000 })
        const result = await page.evaluate(() => {
          const menu = document.querySelector('.erp-admin-menu')
          const content = document.querySelector('.erp-admin-content')
          if (!menu || !content) {
            return { ok: false, reason: 'missing menu or content container' }
          }

          const menuStyle = window.getComputedStyle(menu)
          const beforeMenuTop = menu.getBoundingClientRect().top
          const beforeMenuScroll = menu.scrollTop
          content.scrollTop = 480
          const afterMenuTop = menu.getBoundingClientRect().top
          const afterMenuScroll = menu.scrollTop

          return {
            ok:
              menuStyle.overflowY === 'auto' &&
              Math.abs(beforeMenuTop - afterMenuTop) < 1 &&
              beforeMenuScroll === afterMenuScroll,
            reason: {
              overflowY: menuStyle.overflowY,
              beforeMenuTop,
              afterMenuTop,
              beforeMenuScroll,
              afterMenuScroll,
            },
          }
        })

        assert(
          result.ok,
          `侧栏与内容滚动未隔离: ${JSON.stringify(result.reason)}`
        )
      },
    },
    {
      name: 'erp-dashboard-mobile',
      path: '/erp/dashboard',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '超级管理员')
        await expectText(page, '毛绒 ERP 管理后台')
        await expectText(page, '工作台')
        await expectText(page, '优先处理队列')
        await expectText(page, '当前任务上下文')
        await expectText(page, '等待交接')
        await expectNoButton(page, '任务看板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-mobile',
        })
        await assertDashboardWorkbenchLayout(page, {
          scenarioName: 'erp-dashboard-mobile',
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-mobile',
        })
      },
    },
    {
      name: 'erp-task-board-mobile',
      path: '/erp/task-board',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '超级管理员')
        await expectText(page, '毛绒 ERP 管理后台')
        await expectText(page, '任务看板')
        await expectText(page, '可推进任务')
        await expectText(page, '逾期任务')
        await expectText(page, '从下方任务卡选择一条任务')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-mobile',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-mobile',
          expectTaskMetrics: true,
        })
      },
    },
    {
      name: 'erp-dashboard-dark-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await expectText(page, '工作台')
        await expectText(page, '优先处理队列')
        await expectText(page, '等待交接')
        await expectNoButton(page, '任务看板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDashboardWorkbenchLayout(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          selector: '.erp-admin-header',
        })
        await assertThemeReadable(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          selector: '.erp-dashboard-card',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          selector: '.erp-admin-shell',
        })
      },
    },
    {
      name: 'erp-task-board-dark-wide-desktop',
      path: '/erp/task-board',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectText(page, '毛绒 ERP 管理后台')
        await expectText(page, '任务看板')
        await expectText(page, '可推进任务')
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-wide-layout-task',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-wide-layout',
                task_group: 'shipment_release',
                task_name: '宽屏重叠回归任务',
                source_type: 'shipping-release',
                source_id: 9020,
                source_no: 'OUT-DASH-WIDE-LAYOUT',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                payload: {
                  notification_type: 'task_created',
                  alert_type: 'shipment_pending',
                },
              },
            }),
          })
          return response.json()
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '宽屏重叠回归任务')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
          expectTaskMetrics: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await page
          .locator('.erp-dashboard-task-board-card')
          .scrollIntoViewIfNeeded()
        await assertDashboardTaskBoardLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
        })
        await page
          .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
          .fill('OUT-DASH-WIDE-LAYOUT')
        await expectText(page, '宽屏重叠回归任务')
        await expectText(page, '从下方任务卡选择一条任务')
        await page
          .locator('.erp-task-board-card')
          .filter({ hasText: '宽屏重叠回归任务' })
          .locator('.erp-task-board-card-meta')
          .first()
          .click()
        const wideCurrentTask = page
          .locator('.erp-task-center-current')
          .filter({ hasText: '宽屏重叠回归任务' })
          .first()
        await wideCurrentTask
          .getByRole('button', { name: '处理完成', exact: true })
          .click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-complete-drawer',
          expectedTaskText: '宽屏重叠回归任务',
          expectedActionText: '处理完成',
          expectReasonInput: false,
        })
        await page.locator('.erp-task-action-drawer .ant-drawer-close').click()
        await page
          .locator('.erp-task-action-drawer')
          .waitFor({ state: 'hidden', timeout: 10_000 })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-task-board-dark-wide-desktop',
          selector: '.erp-admin-shell',
        })
      },
    },
    {
      name: 'business-module-dark-customers-desktop',
      path: '/erp/master/partners/customers',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectHeading(page, '客户档案')
        await expectText(page, '启用客户')
        await expectText(page, '当前操作')
        await expectText(page, '新建客户')
        await assertERPThemeMode(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertBusinessCollaborationPanelCollapsedByDefault(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          expectCurrentRecord: true,
          checkDesktopResize: false,
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          selector: '.erp-business-page-layout',
        })
        await assertDarkThemeNeutralInteractions(page, {
          scenarioName: 'business-module-dark-customers-desktop',
          checks: [
            {
              label: '主数据搜索输入 hover',
              selector:
                '.erp-business-page-layout .erp-business-filter-control',
              action: 'hover',
            },
            {
              label: '主数据搜索输入 focus',
              selector:
                '.erp-business-page-layout .erp-business-filter-control',
              action: 'click',
            },
            {
              label: '主数据普通按钮 hover',
              selector:
                '.erp-business-page-layout .ant-btn:not(.ant-btn-primary)',
              action: 'hover',
            },
            {
              label: '主数据表头 hover',
              selector: '.erp-business-page-layout .ant-table-thead > tr > th',
              action: 'hover',
              index: 1,
            },
          ],
        })
      },
    },
    {
      name: 'mobile-tasks-dark',
      path: '/m/sales/tasks',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.evaluate(async () => {
          const createTask = async (params) =>
            fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: params.task_code,
                method: 'create_task',
                params,
              }),
            })

          const bulkTasks = [
            ...Array.from({ length: 30 }, (_, index) => ({
              task_code: `STYLE-L1-MOBILE-BULK-${String(index + 1).padStart(2, '0')}`,
              task_group: 'project-orders',
              task_name: `批量待办任务 ${index + 1}`,
              source_type: 'project-orders',
              source_id: 9100 + index,
              source_no: `STYLE-L1-BULK-${String(index + 1).padStart(2, '0')}`,
              business_status_key: 'project_pending',
              task_status_key: 'ready',
              owner_role_key: 'sales',
              priority: 1,
              payload: {
                customer_name: `批量客户 ${index + 1}`,
                style_no: `BULK-${index + 1}`,
                due_date: '2026-06-08',
              },
            })),
            ...Array.from({ length: 30 }, (_, index) => ({
              task_code: `STYLE-L1-MOBILE-WARN-${String(index + 1).padStart(2, '0')}`,
              task_group: 'project-orders',
              task_name: `批量预警任务 ${index + 1}`,
              source_type: 'project-orders',
              source_id: 9300 + index,
              source_no: `STYLE-L1-WARN-${String(index + 1).padStart(2, '0')}`,
              business_status_key: 'project_pending',
              task_status_key: 'blocked',
              owner_role_key: 'sales',
              priority: 3,
              blocked_reason: `批量阻塞原因 ${index + 1}`,
              payload: {
                critical_path: true,
                customer_name: `预警客户 ${index + 1}`,
                style_no: `WARN-${index + 1}`,
                due_date: '2026-06-07',
              },
            })),
            ...Array.from({ length: 30 }, (_, index) => ({
              task_code: `STYLE-L1-MOBILE-DONE-${String(index + 1).padStart(2, '0')}`,
              task_group: 'project-orders',
              task_name: `批量已办任务 ${index + 1}`,
              source_type: 'project-orders',
              source_id: 9500 + index,
              source_no: `STYLE-L1-DONE-${String(index + 1).padStart(2, '0')}`,
              business_status_key: 'project_pending',
              task_status_key: 'done',
              owner_role_key: 'sales',
              priority: 1,
              payload: {
                customer_name: `已办客户 ${index + 1}`,
                style_no: `DONE-${index + 1}`,
              },
            })),
            ...Array.from({ length: 30 }, (_, index) => ({
              task_code: `STYLE-L1-MOBILE-BOSS-DONE-${String(index + 1).padStart(2, '0')}`,
              task_group: 'boss-review',
              task_name: `批量老板已办任务 ${index + 1}`,
              source_type: 'project-orders',
              source_id: 9800 + index,
              source_no: `STYLE-L1-BOSS-DONE-${String(index + 1).padStart(2, '0')}`,
              business_status_key: 'project_pending',
              task_status_key: 'done',
              owner_role_key: 'boss',
              priority: 1,
              payload: {
                customer_name: `老板已办客户 ${index + 1}`,
                style_no: `BOSS-DONE-${index + 1}`,
              },
            })),
            {
              task_code: 'STYLE-L1-MOBILE-PROCESSING-001',
              task_group: 'project-orders',
              task_name: '批量处理中任务',
              source_type: 'project-orders',
              source_id: 9701,
              source_no: 'STYLE-L1-PROCESSING-001',
              business_status_key: 'project_pending',
              task_status_key: 'processing',
              owner_role_key: 'sales',
              priority: 1,
              payload: {
                customer_name: '处理中客户',
                style_no: 'PROCESSING-1',
                due_date: '2026-06-09',
              },
            },
            {
              task_code: 'STYLE-L1-MOBILE-OVERDUE-001',
              task_group: 'project-orders',
              task_name: '批量超时任务',
              source_type: 'project-orders',
              source_id: 9702,
              source_no: 'STYLE-L1-OVERDUE-001',
              business_status_key: 'project_pending',
              task_status_key: 'ready',
              owner_role_key: 'sales',
              priority: 1,
              due_at: 1780272000,
              payload: {
                customer_name: '超时客户',
                style_no: 'OVERDUE-1',
                due_date: '2026-06-01',
              },
            },
          ]

          await Promise.all(bulkTasks.map((params) => createTask(params)))
          await createTask({
            task_code: 'STYLE-L1-MOBILE-DARK-001',
            task_group: 'project-orders',
            task_name: '暗色任务验证',
            source_type: 'project-orders',
            source_id: 9001,
            source_no: 'STYLE-L1-MOBILE-DARK-001',
            business_status_key: 'project_pending',
            task_status_key: 'blocked',
            owner_role_key: 'sales',
            priority: 3,
            blocked_reason: '暗色模式阻塞原因回显',
            payload: {
              critical_path: true,
              customer_name: '暗色客户',
              style_no: '深色测试款',
              due_date: '2026-06-06',
            },
          })
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '待办')
        await expectText(page, '暗色任务验证')
        await expectText(page, '阻塞原因')
        await assertERPThemeMode(page, {
          scenarioName: 'mobile-tasks-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertThemeReadable(page, {
          scenarioName: 'mobile-tasks-dark',
          selector: '.mobile-app-layout .surface-panel',
        })
        await assertThemeReadable(page, {
          scenarioName: 'mobile-tasks-dark',
          selector: '.erp-mobile-list-item',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'mobile-tasks-dark',
          selector: '.mobile-app-layout',
        })
        await assertMobileTaskMainNavigation(page, {
          scenarioName: 'mobile-tasks-dark',
        })
        await assertMobileTaskRefreshFeedback(page, {
          scenarioName: 'mobile-tasks-dark',
        })
        await assertMobileTaskDarkDetailReadable(page, {
          scenarioName: 'mobile-tasks-dark',
        })
        await assertMobileTaskBossDoneList(page, {
          scenarioName: 'mobile-tasks-dark',
        })
      },
    },
    {
      name: 'mobile-tasks-browser-back-stays-mobile',
      path: '/erp/dashboard',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '工作台')
        await gotoScenarioPath(page, '/m/sales/tasks', {
          waitUntil: 'domcontentloaded',
        })
        await waitForPath(page, '/m/sales/tasks')
        await expectText(page, '待办')
        await expectText(page, '任务')

        await page.goBack()
        await waitForPath(page, '/m/sales/tasks')
        await page.waitForFunction(
          () =>
            Boolean(document.querySelector('.mobile-role-tasks-page')) &&
            !document.querySelector('.erp-admin-sider'),
          null,
          { timeout: 10_000 }
        )
        await expectText(page, '待办')
        const metrics = await page.evaluate(() => ({
          path: window.location.pathname,
          hasDesktopShell: Boolean(document.querySelector('.erp-admin-sider')),
          hasMobileShell: Boolean(
            document.querySelector('.mobile-role-tasks-page')
          ),
          heading:
            document
              .querySelector('.mobile-role-tasks-page h1')
              ?.textContent?.trim() || '',
        }))

        assert.equal(
          metrics.path,
          '/m/sales/tasks',
          `浏览器后退不应离开岗位任务端: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.hasDesktopShell,
          false,
          `浏览器后退不应渲染桌面后台壳层: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.hasMobileShell,
          true,
          `浏览器后退后应保持移动任务页壳层: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.heading,
          '待办',
          `浏览器后退后应保持移动任务页默认分区: ${JSON.stringify(metrics)}`
        )
      },
    },
    {
      name: 'dev-docs-dark-desktop',
      path: '/__dev/docs',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await page.evaluate(() => {
          window.localStorage.removeItem('plush_erp_dev_docs_expanded_dirs')
          window.localStorage.removeItem('plush_erp_dev_docs_toc_expanded')
          window.localStorage.setItem(
            'plush_erp_dev_docs_selected_path',
            'docs/product/模块实施治理.md'
          )
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
        await expectText(page, '目录树 / Directory Tree')
        await expectText(page, '模块实施治理 / Implementation Governance')
        await expectText(page, '标准闭环图 / Standard Delivery Gate Diagram')
        await page
          .locator(
            '.erp-markdown-mermaid[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas > svg'
          )
          .waitFor({ state: 'visible', timeout: 12000 })
        const mermaidMetrics = await page.evaluate(() => {
          const diagram = document.querySelector(
            '.erp-markdown-mermaid[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas > svg'
          )
          const sourceBlocks = [
            ...document.querySelectorAll('pre code'),
          ].filter((node) => node.textContent.includes('flowchart LR'))
          const diagramRect = diagram?.getBoundingClientRect()
          const containerRect = document
            .querySelector('.erp-markdown-mermaid')
            ?.getBoundingClientRect()
          return {
            rendered: Boolean(diagram),
            width: diagramRect?.width || 0,
            height: diagramRect?.height || 0,
            containerWidth: containerRect?.width || 0,
            sourceBlockCount: sourceBlocks.length,
          }
        })
        assert.equal(
          mermaidMetrics.rendered,
          true,
          `Mermaid 图表应渲染为 SVG: ${JSON.stringify(mermaidMetrics)}`
        )
        assert.ok(
          mermaidMetrics.width > 240 && mermaidMetrics.height > 80,
          `Mermaid SVG 应有稳定可见尺寸: ${JSON.stringify(mermaidMetrics)}`
        )
        assert.equal(
          mermaidMetrics.sourceBlockCount,
          0,
          `Mermaid 源码块不应继续作为普通代码块展示: ${JSON.stringify(
            mermaidMetrics
          )}`
        )
        const mermaidZoomInitial = await page.evaluate(() => {
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          const canvasRect = canvas?.getBoundingClientRect()
          return {
            actions: [
              ...document.querySelectorAll('[data-mermaid-zoom-action]'),
            ].map((node) => node.getAttribute('data-mermaid-zoom-action')),
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            canvasWidth: canvasRect?.width || 0,
          }
        })
        assert.deepEqual(
          mermaidZoomInitial.actions,
          ['fit', 'zoom-out', 'zoom-in', 'reset'],
          `Mermaid 工具条应提供适配、缩小、放大和重置按钮: ${JSON.stringify(
            mermaidZoomInitial
          )}`
        )
        assert.equal(
          mermaidZoomInitial.zoom,
          '100',
          `Mermaid 初始缩放应为 100%: ${JSON.stringify(mermaidZoomInitial)}`
        )
        assert.equal(
          mermaidZoomInitial.label,
          '100%',
          `Mermaid 初始缩放标签应为 100%: ${JSON.stringify(mermaidZoomInitial)}`
        )
        await page.locator('[data-mermaid-zoom-action="zoom-out"]').click()
        const mermaidZoomOut = await page.evaluate(() => {
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          const canvasRect = canvas?.getBoundingClientRect()
          return {
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            canvasWidth: canvasRect?.width || 0,
          }
        })
        assert.equal(
          mermaidZoomOut.zoom,
          '80',
          `Mermaid 点击缩小后应变为 80%: ${JSON.stringify(mermaidZoomOut)}`
        )
        assert.ok(
          mermaidZoomOut.canvasWidth < mermaidZoomInitial.canvasWidth,
          `Mermaid 缩小后图表宽度应减少: ${JSON.stringify({
            before: mermaidZoomInitial,
            after: mermaidZoomOut,
          })}`
        )
        await page.locator('[data-mermaid-zoom-action="reset"]').click()
        const mermaidZoomResetFromOut = await page.evaluate(() => {
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          const canvasRect = canvas?.getBoundingClientRect()
          return {
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            canvasWidth: canvasRect?.width || 0,
          }
        })
        assert.equal(
          mermaidZoomResetFromOut.zoom,
          '100',
          `Mermaid 缩小后重置应回到 100%: ${JSON.stringify(
            mermaidZoomResetFromOut
          )}`
        )
        await page.locator('[data-mermaid-zoom-action="zoom-in"]').click()
        const mermaidZoomIn = await page.evaluate(() => {
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          const canvasRect = canvas?.getBoundingClientRect()
          return {
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            canvasWidth: canvasRect?.width || 0,
          }
        })
        assert.equal(
          mermaidZoomIn.zoom,
          '120',
          `Mermaid 点击放大后应变为 120%: ${JSON.stringify(mermaidZoomIn)}`
        )
        assert.ok(
          mermaidZoomIn.canvasWidth > mermaidZoomResetFromOut.canvasWidth,
          `Mermaid 放大后图表宽度应增加: ${JSON.stringify({
            before: mermaidZoomResetFromOut,
            after: mermaidZoomIn,
          })}`
        )
        await page.locator('[data-mermaid-zoom-action="reset"]').click()
        const mermaidZoomReset = await page.evaluate(() => {
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          const canvasRect = canvas?.getBoundingClientRect()
          return {
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            canvasWidth: canvasRect?.width || 0,
          }
        })
        assert.equal(
          mermaidZoomReset.zoom,
          '100',
          `Mermaid 重置后应回到 100%: ${JSON.stringify(mermaidZoomReset)}`
        )
        assert.equal(
          mermaidZoomReset.label,
          '100%',
          `Mermaid 重置后标签应回到 100%: ${JSON.stringify(mermaidZoomReset)}`
        )
        const fullscreenOpenButton = page.locator(
          '[data-mermaid-fullscreen-action="open"]'
        )
        assert.equal(
          await fullscreenOpenButton.count(),
          1,
          'Mermaid 全屏查看按钮应唯一'
        )
        await fullscreenOpenButton.click()
        const mermaidFullscreenOpen = await page.evaluate(() => {
          const shell = document.querySelector('.erp-markdown-mermaid')
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          const viewport = document.querySelector(
            '.erp-markdown-mermaid__viewport'
          )
          const shellRect = shell?.getBoundingClientRect()
          const canvasRect = canvas?.getBoundingClientRect()
          const viewportRect = viewport?.getBoundingClientRect()
          const shellStyle = shell ? window.getComputedStyle(shell) : null
          return {
            fullscreen: shell?.getAttribute('data-mermaid-fullscreen') || '',
            role: shell?.getAttribute('role') || '',
            ariaModal: shell?.getAttribute('aria-modal') || '',
            position: shellStyle?.position || '',
            shellWidth: shellRect?.width || 0,
            shellHeight: shellRect?.height || 0,
            viewportWidth: viewportRect?.width || 0,
            canvasWidth: canvasRect?.width || 0,
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            openButtonCount: document.querySelectorAll(
              '[data-mermaid-fullscreen-action="open"]'
            ).length,
            closeButtonCount: document.querySelectorAll(
              '[data-mermaid-fullscreen-action="close"]'
            ).length,
          }
        })
        assert.equal(
          mermaidFullscreenOpen.fullscreen,
          'true',
          `Mermaid 点击全屏后应进入全屏态: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        assert.equal(
          mermaidFullscreenOpen.position,
          'fixed',
          `Mermaid 全屏态应固定覆盖页面: ${JSON.stringify(mermaidFullscreenOpen)}`
        )
        assert.equal(
          mermaidFullscreenOpen.role,
          'dialog',
          `Mermaid 全屏态应声明 dialog: ${JSON.stringify(mermaidFullscreenOpen)}`
        )
        assert.equal(
          mermaidFullscreenOpen.ariaModal,
          'true',
          `Mermaid 全屏态应声明 aria-modal: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        assert.equal(
          mermaidFullscreenOpen.zoom,
          '140',
          `Mermaid 全屏态默认应放大到 140%: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        assert.equal(
          mermaidFullscreenOpen.label,
          '140%',
          `Mermaid 全屏态缩放标签应显示 140%: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        assert.equal(
          mermaidFullscreenOpen.openButtonCount,
          0,
          `Mermaid 全屏态不应继续显示打开全屏按钮: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        assert.equal(
          mermaidFullscreenOpen.closeButtonCount,
          1,
          `Mermaid 全屏态应显示退出全屏按钮: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        assert.ok(
          mermaidFullscreenOpen.canvasWidth >
            mermaidFullscreenOpen.viewportWidth,
          `Mermaid 全屏态默认应形成放大视图: ${JSON.stringify(
            mermaidFullscreenOpen
          )}`
        )
        await page.locator('[data-mermaid-fullscreen-action="close"]').click()
        const mermaidFullscreenClosed = await page.evaluate(() => {
          const shell = document.querySelector('.erp-markdown-mermaid')
          const canvas = document.querySelector('.erp-markdown-mermaid__canvas')
          return {
            fullscreen: shell?.getAttribute('data-mermaid-fullscreen') || '',
            role: shell?.getAttribute('role') || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            label:
              document
                .querySelector('[data-mermaid-zoom-label]')
                ?.textContent?.trim() || '',
            openButtonCount: document.querySelectorAll(
              '[data-mermaid-fullscreen-action="open"]'
            ).length,
            closeButtonCount: document.querySelectorAll(
              '[data-mermaid-fullscreen-action="close"]'
            ).length,
          }
        })
        assert.equal(
          mermaidFullscreenClosed.fullscreen,
          'false',
          `Mermaid 退出全屏后应回到页面内状态: ${JSON.stringify(
            mermaidFullscreenClosed
          )}`
        )
        assert.equal(
          mermaidFullscreenClosed.role,
          '',
          `Mermaid 退出全屏后不应保留 dialog role: ${JSON.stringify(
            mermaidFullscreenClosed
          )}`
        )
        assert.equal(
          mermaidFullscreenClosed.zoom,
          '100',
          `Mermaid 退出全屏后页面内缩放应保持 100%: ${JSON.stringify(
            mermaidFullscreenClosed
          )}`
        )
        assert.equal(
          mermaidFullscreenClosed.openButtonCount,
          1,
          `Mermaid 退出全屏后应恢复打开全屏按钮: ${JSON.stringify(
            mermaidFullscreenClosed
          )}`
        )
        assert.equal(
          mermaidFullscreenClosed.closeButtonCount,
          0,
          `Mermaid 退出全屏后不应保留退出按钮: ${JSON.stringify(
            mermaidFullscreenClosed
          )}`
        )
        const readTocMetrics = async () =>
          page.evaluate(() => {
            const toc = document.querySelector('.erp-dev-docs-toc')
            const toggle = document.querySelector('[data-dev-doc-toc-toggle]')
            const tags = [
              ...document.querySelectorAll('.erp-dev-docs-toc__tag'),
            ]
            const tocRect = toc?.getBoundingClientRect()
            const tocStyle = toc ? window.getComputedStyle(toc) : null
            const rowTops = [
              ...new Set(
                tags.map((tag) => Math.round(tag.getBoundingClientRect().top))
              ),
            ]
            const tagSpillCount = tags.filter((tag) => {
              const rect = tag.getBoundingClientRect()
              return (
                tocRect &&
                (rect.left < tocRect.left - 1 || rect.right > tocRect.right + 1)
              )
            }).length
            const tagClipCount = tags.filter(
              (tag) => tag.scrollWidth > tag.clientWidth + 1
            ).length
            return {
              exists: Boolean(toc),
              toggleText: toggle?.textContent?.trim() || '',
              toggleExpanded: toggle?.getAttribute('aria-expanded') || '',
              storageValue:
                window.localStorage.getItem(
                  'plush_erp_dev_docs_toc_expanded'
                ) || '',
              className: toc?.className || '',
              tagCount: tags.length,
              rowCount: rowTops.length,
              flexWrap: tocStyle?.flexWrap || '',
              overflowX: tocStyle?.overflowX || '',
              clientWidth: toc?.clientWidth || 0,
              scrollWidth: toc?.scrollWidth || 0,
              clientHeight: toc?.clientHeight || 0,
              scrollHeight: toc?.scrollHeight || 0,
              tagSpillCount,
              tagClipCount,
            }
          })
        const expandedTocMetrics = await readTocMetrics()
        assert.equal(
          expandedTocMetrics.exists,
          true,
          `章节导航应存在: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.ok(
          expandedTocMetrics.tagCount >= 8,
          `实施治理文档应保留多章节导航: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.equal(
          expandedTocMetrics.toggleText,
          '收起 / Scroll',
          `章节导航默认展开时按钮应提示收起: ${JSON.stringify(
            expandedTocMetrics
          )}`
        )
        assert.equal(
          expandedTocMetrics.toggleExpanded,
          'true',
          `章节导航默认应为展开态: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.equal(
          expandedTocMetrics.flexWrap,
          'wrap',
          `章节导航展开态应换行展示: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.notEqual(
          expandedTocMetrics.overflowX,
          'auto',
          `章节导航展开态不应横向滚动: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.ok(
          expandedTocMetrics.scrollWidth <= expandedTocMetrics.clientWidth + 1,
          `章节导航展开态不应产生自身横向溢出: ${JSON.stringify(
            expandedTocMetrics
          )}`
        )
        assert.equal(
          expandedTocMetrics.tagSpillCount,
          0,
          `章节导航展开态标签不应溢出容器: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.equal(
          expandedTocMetrics.tagClipCount,
          0,
          `章节导航展开态标签不应被裁切: ${JSON.stringify(expandedTocMetrics)}`
        )
        assert.ok(
          expandedTocMetrics.rowCount > 1,
          `多章节导航默认应自动换成多行: ${JSON.stringify(expandedTocMetrics)}`
        )
        await page.locator('[data-dev-doc-toc-toggle]').click()
        const collapsedTocMetrics = await readTocMetrics()
        assert.equal(
          collapsedTocMetrics.toggleText,
          '展开 / Wrap',
          `章节导航收起后按钮应提示展开: ${JSON.stringify(collapsedTocMetrics)}`
        )
        assert.equal(
          collapsedTocMetrics.toggleExpanded,
          'false',
          `章节导航收起后 aria-expanded 应为 false: ${JSON.stringify(
            collapsedTocMetrics
          )}`
        )
        assert.equal(
          collapsedTocMetrics.storageValue,
          'false',
          `章节导航收起状态应写入本地缓存: ${JSON.stringify(collapsedTocMetrics)}`
        )
        assert.equal(
          collapsedTocMetrics.flexWrap,
          'nowrap',
          `章节导航收起态应回到单行: ${JSON.stringify(collapsedTocMetrics)}`
        )
        assert.equal(
          collapsedTocMetrics.overflowX,
          'auto',
          `章节导航收起态应由自身接管横向滚动: ${JSON.stringify(
            collapsedTocMetrics
          )}`
        )
        assert.ok(
          collapsedTocMetrics.scrollWidth > collapsedTocMetrics.clientWidth + 8,
          `章节导航收起态应形成可滚动内容宽度: ${JSON.stringify(
            collapsedTocMetrics
          )}`
        )
        assert.equal(
          collapsedTocMetrics.rowCount,
          1,
          `章节导航收起态应保持单行: ${JSON.stringify(collapsedTocMetrics)}`
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
        const persistedCollapsedTocMetrics = await readTocMetrics()
        assert.equal(
          persistedCollapsedTocMetrics.storageValue,
          'false',
          `章节导航刷新后应保留收起缓存: ${JSON.stringify(
            persistedCollapsedTocMetrics
          )}`
        )
        assert.equal(
          persistedCollapsedTocMetrics.flexWrap,
          'nowrap',
          `章节导航刷新后应恢复收起单行: ${JSON.stringify(
            persistedCollapsedTocMetrics
          )}`
        )
        await page.locator('[data-dev-doc-toc-toggle]').click()
        const restoredExpandedTocMetrics = await readTocMetrics()
        assert.equal(
          restoredExpandedTocMetrics.storageValue,
          'true',
          `章节导航展开状态应写入本地缓存: ${JSON.stringify(
            restoredExpandedTocMetrics
          )}`
        )
        assert.equal(
          restoredExpandedTocMetrics.flexWrap,
          'wrap',
          `章节导航重新展开后应恢复换行: ${JSON.stringify(
            restoredExpandedTocMetrics
          )}`
        )
        assert.ok(
          restoredExpandedTocMetrics.scrollWidth <=
            restoredExpandedTocMetrics.clientWidth + 1,
          `章节导航重新展开后不应横向溢出: ${JSON.stringify(
            restoredExpandedTocMetrics
          )}`
        )
        const productDir = page.locator('[data-dev-doc-dir="docs/product"]')
        const warehouseDir = page.locator('[data-dev-doc-dir="docs/warehouse"]')
        assert.equal(
          await productDir.getAttribute('aria-expanded'),
          'false',
          '产品文档目录默认不应展开'
        )
        assert.equal(
          await warehouseDir.getAttribute('aria-expanded'),
          'false',
          '仓库文档目录默认不应展开'
        )
        await productDir.click()
        await warehouseDir.click()
        assert.equal(
          await productDir.getAttribute('aria-expanded'),
          'true',
          '点击后产品文档目录应展开'
        )
        assert.equal(
          await warehouseDir.getAttribute('aria-expanded'),
          'true',
          '点击后仓库文档目录应展开'
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
        assert.equal(
          await productDir.getAttribute('aria-expanded'),
          'true',
          '刷新后产品文档目录应保持展开'
        )
        assert.equal(
          await warehouseDir.getAttribute('aria-expanded'),
          'true',
          '刷新后仓库文档目录应保持展开'
        )
        assert.equal(
          await page
            .locator('[data-dev-doc-key="doc:docs/product/自动化测试策略.md"]')
            .count(),
          1,
          '刷新后产品目录内文档应保持可见'
        )
        assert.equal(
          await page
            .locator('[data-dev-doc-key="doc:docs/warehouse/README.md"]')
            .count(),
          1,
          '刷新后仓库目录内文档应保持可见'
        )
        await assertERPThemeMode(page, {
          scenarioName: 'dev-docs-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-docs-dark-desktop',
          selector: '.erp-dev-docs-page',
        })
      },
    },
    {
      name: 'dev-customer-config-dark-desktop',
      path: '/__dev/customer-config?customer=yoyoosun',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
        await expectText(page, '当前 URL customer / Query')
        await expectText(page, 'yoyoosun')
        await expectText(page, '已接运行时')
        await expectText(page, '真实客户数据导入')
        await assertERPThemeMode(page, {
          scenarioName: 'dev-customer-config-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-customer-config-dark-desktop',
          selector: '.erp-dev-customer-page',
        })
        const faviconHref = await page.evaluate(() =>
          document.querySelector('link[rel~="icon"]')?.getAttribute('href')
        )
        assert.equal(
          faviconHref,
          '/favicon-customer-config.svg',
          `客户配置开发页 favicon 异常: ${faviconHref}`
        )
        await assertDevPageUsesGlobalThemeOnly(page, {
          scenarioName: 'dev-customer-config-dark-desktop',
          selector: '.erp-dev-customer-page',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
          expectDarkContrast: true,
        })

        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '字段编号 / Fields' })
          .click()
        await expectText(page, '边界守卫 / Boundary Guards')
        await expectText(page, 'runtimeEnabled')
        await expectText(page, '客户编码')

        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '导入工具 / Import Tools' })
          .click()
        await expectText(page, 'canExecuteRealImport')
        await expectText(page, 'false')
        await expectText(page, 'customerImportDryRun.mjs')
        await assertNoHorizontalOverflow(
          page,
          'dev-customer-config-import-view'
        )

        await gotoScenarioPath(
          page,
          '/__dev/customer-config?customer=missing-customer',
          {
            waitUntil: 'domcontentloaded',
          }
        )
        await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
        await expectText(page, '未登记客户配置包 / Missing Customer Package')
        await expectText(page, 'missing-customer')
        await expectText(page, '已登记客户包 / Registered Packages')
        await expectText(page, '永绅 yoyoosun')
        await assertTextAbsent(page, '东莞市永绅玩具有限公司')

        await page.locator('.erp-dev-customer-selector .ant-select').click()
        await page
          .getByText('永绅 yoyoosun (yoyoosun)', { exact: true })
          .click()
        const switchedUrl = new URL(page.url())
        assert.equal(switchedUrl.pathname, '/__dev/customer-config')
        assert.equal(switchedUrl.searchParams.get('customer'), 'yoyoosun')
        assert(!switchedUrl.pathname.startsWith('/erp'))
        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '菜单品牌 / Menu Brand' })
          .click()
        await expectText(page, '东莞市永绅玩具有限公司')
        await assertNoHorizontalOverflow(
          page,
          'dev-customer-config-missing-view'
        )
      },
    },
    {
      name: 'dev-customer-config-light-desktop',
      path: '/__dev/customer-config?customer=yoyoosun',
      themeMode: 'light',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
        await expectText(page, '当前 URL customer / Query')
        await expectText(page, 'yoyoosun')
        await assertDevPageUsesGlobalThemeOnly(page, {
          scenarioName: 'dev-customer-config-light-desktop',
          selector: '.erp-dev-customer-page',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
      },
    },
    {
      name: 'dev-customer-config-mobile',
      path: '/__dev/customer-config',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
        await expectText(page, '菜单分组 / Menu Groups')
        await expectText(page, '字段候选 / Field Candidates')
        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '菜单品牌 / Menu Brand' })
          .click()
        await expectText(page, '东莞市永绅玩具有限公司')
        await expectText(page, '运营工具')
        const metrics = await page.evaluate(() => {
          const panel = document.querySelector('.erp-dev-customer-panel-grid')
          const style = panel ? getComputedStyle(panel) : null
          return {
            gridTemplateColumns: style?.gridTemplateColumns || '',
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          metrics.gridTemplateColumns &&
            !metrics.gridTemplateColumns.includes('420px'),
          `移动端客户配置页不应保持桌面双列布局: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.scrollWidth <= metrics.clientWidth + 1,
          `移动端客户配置页出现横向溢出: ${JSON.stringify(metrics)}`
        )
      },
    },
    {
      name: 'dev-hub-dark-desktop',
      path: '/__dev',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '开发入口总控 / Dev Hub')
        await expectText(page, '开发文档 / Dev Docs')
        await expectText(page, '测试入口 / Test Entry')
        await expectText(page, '产品原型 / Prototypes')
        await expectText(page, '能力台账 / Capability Ledger')
        await expectText(page, '客户配置 / Customer Config')
        await expectText(page, '入口台账规则 / Registry Rules')
        await expectText(page, '置顶入口 / Pinned')
        await expectText(page, '用入口卡片右上角图钉把常用页面固定在这里。')
        await expectText(page, '最近访问 / Recent')
        await expectText(page, '点击任一入口后会在这里保留最近访问记录。')
        const defaultMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          guardrailCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card__guards span'
          ).length,
          pinButtonCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card__pin'
          ).length,
          firstHref: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('href'),
          firstTarget: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('target'),
          firstRel: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('rel'),
          faviconHref: document
            .querySelector('link[rel~="icon"]')
            ?.getAttribute('href'),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.equal(
          defaultMetrics.faviconHref,
          '/favicon-dev.svg',
          `开发入口总控 favicon 异常: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.cardCount,
          5,
          `开发入口总控应渲染 5 个入口: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.guardrailCount >= 10,
          `开发入口总控应展示入口边界标签: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.pinButtonCount,
          5,
          `开发入口总控应为每个入口提供置顶按钮: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.firstHref?.startsWith('/__dev/'),
          `开发入口总控卡片链接应指向 /__dev 子路径: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.firstTarget,
          '_blank',
          `开发入口总控卡片链接应新标签打开: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.firstRel,
          'noreferrer',
          `开发入口总控卡片链接应隔离 opener: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.scrollWidth <= defaultMetrics.clientWidth + 1,
          `开发入口总控默认态不应横向溢出: ${JSON.stringify(defaultMetrics)}`
        )

        await page.evaluate(() => {
          localStorage.setItem(
            'plush_erp_dev_hub_recent_routes',
            JSON.stringify(['/__dev/testing', '/__dev/docs', '/erp/dashboard'])
          )
          localStorage.setItem(
            'plush_erp_dev_hub_pinned_routes',
            JSON.stringify([
              '/__dev/customer-config',
              '/__dev/prototypes',
              '/erp/dashboard',
            ])
          )
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '保存在当前浏览器 / Local browser')
        const recentMetrics = await page.evaluate(() => ({
          pinnedCount: document.querySelectorAll(
            '.erp-dev-hub-pinned .erp-dev-hub-card'
          ).length,
          pinnedHrefs: Array.from(
            document.querySelectorAll(
              '.erp-dev-hub-pinned .erp-dev-hub-card__link'
            )
          ).map((link) => link.getAttribute('href')),
          recentCount: document.querySelectorAll(
            '.erp-dev-hub-recent .erp-dev-hub-card'
          ).length,
          recentHrefs: Array.from(
            document.querySelectorAll(
              '.erp-dev-hub-recent .erp-dev-hub-card__link'
            )
          ).map((link) => link.getAttribute('href')),
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        }))
        assert.deepEqual(
          recentMetrics,
          {
            pinnedCount: 2,
            pinnedHrefs: ['/__dev/customer-config', '/__dev/prototypes'],
            recentCount: 2,
            recentHrefs: ['/__dev/testing', '/__dev/docs'],
            overflow: false,
          },
          `开发入口总控最近访问应过滤非法路径并保持顺序: ${JSON.stringify(recentMetrics)}`
        )

        await page
          .locator('.erp-dev-hub-grid .erp-dev-hub-card')
          .filter({ hasText: '测试入口 / Test Entry' })
          .locator('.erp-dev-hub-card__pin')
          .click()
        const pinnedAfterClick = await page.evaluate(() => ({
          storedRoutes: JSON.parse(
            localStorage.getItem('plush_erp_dev_hub_pinned_routes') || '[]'
          ),
          firstPinnedHref: document
            .querySelector('.erp-dev-hub-pinned .erp-dev-hub-card__link')
            ?.getAttribute('href'),
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        }))
        assert.deepEqual(
          pinnedAfterClick,
          {
            storedRoutes: [
              '/__dev/testing',
              '/__dev/customer-config',
              '/__dev/prototypes',
            ],
            firstPinnedHref: '/__dev/testing',
            overflow: false,
          },
          `开发入口总控置顶入口应写入本地偏好并移动到首位: ${JSON.stringify(pinnedAfterClick)}`
        )

        await page
          .locator('.erp-dev-hub-group-filter .ant-segmented-item')
          .filter({ hasText: '产品治理 / Product Governance' })
          .click()
        await expectText(page, '当前匹配 / Matches 1 / 5')
        const groupMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          onlyHref: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('href'),
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        }))
        assert.deepEqual(
          groupMetrics,
          {
            cardCount: 1,
            onlyHref: '/__dev/capability-ledger',
            overflow: false,
          },
          `开发入口总控分组筛选应只保留能力台账: ${JSON.stringify(groupMetrics)}`
        )

        await page
          .locator('.erp-dev-hub-group-filter .ant-segmented-item')
          .filter({ hasText: '全部 / All' })
          .click()
        await page.getByPlaceholder('搜索入口、路径或资料来源').fill('测试')
        await expectText(page, '当前匹配 / Matches 1 / 5')
        const filteredMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          onlyHref: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('href'),
        }))
        assert.deepEqual(filteredMetrics, {
          cardCount: 1,
          onlyHref: '/__dev/testing',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'dev-hub-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-hub-dark-desktop',
          selector: '.erp-dev-hub-page',
        })
      },
    },
    {
      name: 'dev-prototypes-dark-desktop',
      path: '/__dev/prototypes',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await page.evaluate(() => {
          window.localStorage.removeItem('plush_erp_dev_prototype_selected_key')
          window.localStorage.removeItem(
            'plush_erp_dev_prototype_status_filter'
          )
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')
        await expectText(page, '待实现 / To Implement')
        await expectText(page, '参考资料 / Reference')
        await expectText(page, '参照范围只说明可借鉴的页面 / 菜单类型')
        await expectText(page, '顶部筛选只用于判断当前、待实现和参考资料')
        await assertERPThemeMode(page, {
          scenarioName: 'dev-prototypes-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })

        await page
          .getByRole('button', { name: '当前实现 / Current', exact: true })
          .click()
        await expectText(page, '岗位任务端当前实现参考')
        const currentMetrics = await page.evaluate(() => ({
          activeText:
            document
              .querySelector('.erp-dev-prototypes-filter__item--active')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
          visibleCards: document.querySelectorAll('.erp-dev-prototypes-card')
            .length,
          currentTagCount: Array.from(
            document.querySelectorAll(
              '.erp-dev-prototypes-list .erp-dev-prototypes-status'
            )
          ).filter((item) => item.textContent?.includes('当前实现')).length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.equal(
          currentMetrics.activeText,
          '当前实现 / Current',
          `原型查看器当前实现筛选应激活: ${JSON.stringify(currentMetrics)}`
        )
        assert.equal(
          currentMetrics.visibleCards,
          1,
          `原型查看器当前实现筛选只应展示岗位任务端资产: ${JSON.stringify(currentMetrics)}`
        )
        assert.equal(
          currentMetrics.currentTagCount,
          1,
          `原型查看器当前实现标签数量异常: ${JSON.stringify(currentMetrics)}`
        )
        assert(
          currentMetrics.scrollWidth <= currentMetrics.clientWidth + 1,
          `原型查看器当前实现筛选不应横向溢出: ${JSON.stringify(currentMetrics)}`
        )

        await page
          .getByRole('button', {
            name: '待实现 / To Implement',
            exact: true,
          })
          .click()
        await expectText(page, '后台工作台样板')
        await expectText(page, '任务中心样板')
        await expectText(page, '业务管理中心样板')
        await expectText(page, '指标卡交互语义样板')
        await expectText(page, '产品核心菜单覆盖样板')
        await expectText(page, '正式菜单候选原型')
        await expectText(page, '业务模块标准页样板')
        await expectText(page, '模板打印中心样板')
        await expectText(page, '业务页协同入口组件样板')
        await expectText(page, '业务详情页标准样板')
        await expectText(page, '新建 / 编辑表单标准样板')
        await expectText(page, '局部动作弹窗标准样板')
        const implementMetrics = await page.evaluate(() => ({
          activeText:
            document
              .querySelector('.erp-dev-prototypes-filter__item--active')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
          visibleCards: document.querySelectorAll('.erp-dev-prototypes-card')
            .length,
          cardDescriptionCount: document.querySelectorAll(
            '.erp-dev-prototypes-card__desc'
          ).length,
          cardAppliesCount: document.querySelectorAll(
            '.erp-dev-prototypes-card__applies'
          ).length,
          listText: Array.from(
            document.querySelectorAll('.erp-dev-prototypes-card')
          )
            .map((item) => item.textContent || '')
            .join('\n'),
          readerText:
            document.querySelector('.erp-dev-prototypes-reader__info')
              ?.textContent || '',
          visibleTitles: Array.from(
            document.querySelectorAll('.erp-dev-prototypes-card__title')
          ).map((item) => item.textContent?.trim() || ''),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.equal(
          implementMetrics.activeText,
          '待实现 / To Implement',
          `原型查看器待实现筛选应激活: ${JSON.stringify(implementMetrics)}`
        )
        assert.equal(
          implementMetrics.visibleCards,
          13,
          `原型查看器待实现筛选应展示 13 个产品内核 HTML 样板: ${JSON.stringify(implementMetrics)}`
        )
        assert.equal(
          implementMetrics.cardDescriptionCount,
          0,
          `原型查看器待实现卡片不应展示摘要文案: ${JSON.stringify(implementMetrics)}`
        )
        assert.equal(
          implementMetrics.cardAppliesCount,
          0,
          `原型查看器待实现卡片不应展示参照范围: ${JSON.stringify(implementMetrics)}`
        )
        assert(
          !implementMetrics.listText.includes('把工作台收敛') &&
            !implementMetrics.listText.includes('参照范围：'),
          `原型查看器左侧列表应只保留索引信息: ${JSON.stringify(implementMetrics)}`
        )
        assert(
          implementMetrics.readerText.includes('把工作台收敛') &&
            implementMetrics.readerText.includes('参照范围：'),
          `原型查看器右侧详情应保留完整说明: ${JSON.stringify(implementMetrics)}`
        )
        assert(
          implementMetrics.scrollWidth <= implementMetrics.clientWidth + 1,
          `原型查看器待实现筛选不应横向溢出: ${JSON.stringify(implementMetrics)}`
        )

        await page
          .locator(
            '[data-dev-prototype-key="business-task-collab-entry"] .erp-dev-prototypes-card__body'
          )
          .click()
        await page.waitForFunction(
          () =>
            window.localStorage.getItem(
              'plush_erp_dev_prototype_selected_key'
            ) === 'business-task-collab-entry'
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')
        const restoredSelectionMetrics = await page.evaluate(() => ({
          activeText:
            document
              .querySelector('.erp-dev-prototypes-filter__item--active')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
          activeCardKey:
            document
              .querySelector('.erp-dev-prototypes-card--active')
              ?.getAttribute('data-dev-prototype-key') || '',
          readerPath:
            document
              .querySelector('.erp-dev-prototypes-reader__path')
              ?.textContent?.trim() || '',
          readerApplies:
            document
              .querySelector('.erp-dev-prototypes-reader__applies')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
          storedFilter:
            window.localStorage.getItem(
              'plush_erp_dev_prototype_status_filter'
            ) || '',
          storedSelected:
            window.localStorage.getItem(
              'plush_erp_dev_prototype_selected_key'
            ) || '',
        }))
        assert.deepEqual(
          restoredSelectionMetrics,
          {
            activeText: '待实现 / To Implement',
            activeCardKey: 'business-task-collab-entry',
            readerPath:
              'business-module-page-standard-v1/task-collab-entry-v2.html',
            readerApplies:
              '参照范围：嵌入有 Workflow 协同任务的业务页可参照；它是页内组件，不是独立菜单、路由或权限入口。',
            storedFilter: 'to-implement',
            storedSelected: 'business-task-collab-entry',
          },
          `原型查看器刷新后应恢复左侧筛选和当前资产: ${JSON.stringify(restoredSelectionMetrics)}`
        )

        await page
          .getByRole('button', { name: '参考资料 / Reference', exact: true })
          .click()
        await expectText(page, '方向 1：右侧当前记录协同侧栏')
        const referenceMetrics = await page.evaluate(() => ({
          activeText:
            document
              .querySelector('.erp-dev-prototypes-filter__item--active')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
          visibleCards: document.querySelectorAll('.erp-dev-prototypes-card')
            .length,
          draftTagCount: Array.from(
            document.querySelectorAll(
              '.erp-dev-prototypes-list .erp-dev-prototypes-status'
            )
          ).filter((item) => item.textContent?.includes('起草阶段')).length,
          evidenceTagCount: Array.from(
            document.querySelectorAll(
              '.erp-dev-prototypes-list .erp-dev-prototypes-status'
            )
          ).filter((item) => item.textContent?.includes('截图证据')).length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.equal(
          referenceMetrics.activeText,
          '参考资料 / Reference',
          `原型查看器参考资料筛选应激活: ${JSON.stringify(referenceMetrics)}`
        )
        assert.equal(
          referenceMetrics.visibleCards,
          6,
          `原型查看器参考资料筛选应展示 6 个参考资产: ${JSON.stringify(referenceMetrics)}`
        )
        assert.equal(
          referenceMetrics.draftTagCount,
          3,
          `原型查看器参考资料起草阶段标签数量异常: ${JSON.stringify(referenceMetrics)}`
        )
        assert.equal(
          referenceMetrics.evidenceTagCount,
          3,
          `原型查看器参考资料截图证据标签数量异常: ${JSON.stringify(referenceMetrics)}`
        )
        assert(
          referenceMetrics.scrollWidth <= referenceMetrics.clientWidth + 1,
          `原型查看器参考资料筛选不应横向溢出: ${JSON.stringify(referenceMetrics)}`
        )
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-prototypes-dark-desktop',
          selector: '.erp-dev-prototypes-page',
        })
      },
    },
    {
      name: 'dev-testing-dark-desktop',
      path: '/__dev/testing',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '开发测试入口 / Dev Test Entry')
        await expectText(page, '测试分层 / Tiers')
        await expectText(page, '命令入口 / Commands')
        await expectText(page, 'docs/product/自动化测试策略.md')
        const defaultMetrics = await page.evaluate(() => {
          const root = document.querySelector('.erp-dev-testing-page')
          return {
            tierCount: document.querySelectorAll('.erp-dev-testing-tier')
              .length,
            tierCopyButtonCount: document.querySelectorAll(
              '.erp-dev-testing-tier .ant-btn'
            ).length,
            presetCount: document.querySelectorAll('.erp-dev-testing-preset')
              .length,
            docCount: document.querySelectorAll('.erp-dev-testing-doc-row')
              .length,
            overflow:
              root &&
              document.documentElement.scrollWidth > root.clientWidth + 1,
          }
        })
        assert.equal(
          defaultMetrics.overflow,
          false,
          `测试入口默认态不应横向溢出: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.tierCount >= 8,
          `测试入口应渲染测试分层: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.docCount > 0,
          `测试入口应渲染相关文档: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.presetCount,
          3,
          `测试入口应渲染常用复制预设: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.tierCopyButtonCount >= defaultMetrics.tierCount,
          `每个测试层级应提供复制按钮: ${JSON.stringify(defaultMetrics)}`
        )
        const faviconHref = await page.evaluate(() =>
          document.querySelector('link[rel~="icon"]')?.getAttribute('href')
        )
        assert.equal(
          faviconHref,
          '/favicon-testing.svg',
          `测试入口 favicon 异常: ${faviconHref}`
        )
        await assertDevPageUsesGlobalThemeOnly(page, {
          scenarioName: 'dev-testing-dark-desktop',
          selector: '.erp-dev-testing-page',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
          expectDarkContrast: true,
        })
        await page
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: '本轮前端验证 / Frontend Check' })
          .click()
        const frontendPresetClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          frontendPresetClipboard.includes('pnpm style:l1'),
          `前端验证预设应复制 style:l1 命令: ${frontendPresetClipboard}`
        )
        await page
          .locator('.erp-dev-testing-tier')
          .filter({ hasText: 'T5 Frontend UI / 样式' })
          .getByRole('button', { name: '复制' })
          .click()
        const tierClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          tierClipboard.includes('cd web && pnpm style:l1'),
          `T5 层级复制内容应包含前端 L1 命令: ${tierClipboard}`
        )

        await page
          .locator('.erp-dev-testing-reader__toolbar .ant-segmented-item')
          .filter({ hasText: '命令入口 / Commands' })
          .click()
        await expectText(page, 'pnpm style:l1')
        const commandMetrics = await page.evaluate(() => ({
          commandBlocks: document.querySelectorAll(
            '.erp-dev-testing-command-block'
          ).length,
          hasCommandPre: Boolean(
            document.querySelector('.erp-dev-testing-command-block pre')
          ),
        }))
        assert(
          commandMetrics.commandBlocks > 0 && commandMetrics.hasCommandPre,
          `测试入口命令视图应渲染命令块: ${JSON.stringify(commandMetrics)}`
        )
        await assertERPThemeMode(page, {
          scenarioName: 'dev-testing-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-testing-dark-desktop',
          selector: '.erp-dev-testing-page',
        })
      },
    },
    {
      name: 'dev-testing-light-desktop',
      path: '/__dev/testing',
      themeMode: 'light',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '开发测试入口 / Dev Test Entry')
        await expectText(page, '测试分层 / Tiers')
        await expectText(page, '命令入口 / Commands')
        await assertDevPageUsesGlobalThemeOnly(page, {
          scenarioName: 'dev-testing-light-desktop',
          selector: '.erp-dev-testing-page',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
      },
    },
    {
      name: 'erp-business-dashboard-mobile',
      path: '/erp/business-dashboard',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '超级管理员')
        await expectText(page, '毛绒 ERP 管理后台')
        await expectText(page, '业务看板')
        await expectText(page, '核心链路健康')
        await expectText(page, '状态分布')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-business-dashboard-mobile',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-business-dashboard-mobile',
          expectBusinessSummary: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-mobile',
        })
      },
    },
    {
      name: 'permission-center-loading-state',
      path: '/erp/system/permissions?__style_l1_admin_list_delay=900',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '权限加载中')
        await expectText(page, '正在同步管理员、角色和权限码，请稍候...')
        await assertERPThemeMode(page, {
          scenarioName: 'permission-center-loading-state',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkLoadingState(page, {
          scenarioName: 'permission-center-loading-state',
        })
        await expectHeading(page, '权限管理')
        await assertTextAbsent(page, '权限加载中')
        await assertDarkAntdStateSurfaces(page, {
          scenarioName: 'permission-center-loading-state',
        })
        await assertPermissionSectionVisualSeparation(page, {
          scenarioName: 'permission-center-loading-state',
        })
      },
    },
    {
      name: 'permission-center-desktop',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await expectText(page, '创建管理员')
        await expectText(page, '超级管理员')
        await expectText(page, '当前客户角色模板')
        await expectText(page, 'Product Core 权限码稳定')
        await expectText(page, '影响管理员')
        await expectText(page, '客户角色可以不同，职责权限保持统一')
        await expectText(page, '保存角色权限')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'permission-center-desktop',
        })
        const roleCenterMetrics = await page.evaluate(() => {
          const adminSection = document.querySelector(
            '.erp-permission-section--admins'
          )
          const roleSection = document.querySelector(
            '.erp-permission-section--roles'
          )
          const layout = document.querySelector('.erp-role-center-layout')
          const heroCreateButton = document.querySelector(
            '.erp-permission-hero button'
          )
          const sidebar = document.querySelector('.erp-role-center-sidebar')
          const detail = document.querySelector('.erp-role-center-detail')
          const checklist = document.querySelector('.erp-permission-checklist')
          const createRect = heroCreateButton?.getBoundingClientRect()
          const adminRect = adminSection?.getBoundingClientRect()
          const roleRect = roleSection?.getBoundingClientRect()
          const layoutRect = layout?.getBoundingClientRect()
          const sidebarRect = sidebar?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          return {
            hasAdminSection: Boolean(adminSection),
            hasRoleSection: Boolean(roleSection),
            adminTop: adminRect?.top || 0,
            roleTop: roleRect?.top || 0,
            hasHeroCreateButton: Boolean(heroCreateButton),
            createTop: createRect?.top || 0,
            createBottom: createRect?.bottom || 0,
            hasLayout: Boolean(layout),
            layoutWidth: layoutRect?.width || 0,
            sidebarWidth: sidebarRect?.width || 0,
            detailWidth: detailRect?.width || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
            checklistScrollWidth: checklist?.scrollWidth || 0,
            checklistClientWidth: checklist?.clientWidth || 0,
          }
        })
        assert(
          roleCenterMetrics.hasAdminSection &&
            roleCenterMetrics.hasRoleSection &&
            roleCenterMetrics.adminTop < roleCenterMetrics.roleTop,
          `权限管理模块顺序异常，管理员模块应在角色权限模块前: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.hasHeroCreateButton &&
            roleCenterMetrics.createBottom < roleCenterMetrics.adminTop,
          `创建管理员按钮应位于首屏 hero 操作区且早于管理员模块: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.hasLayout &&
            roleCenterMetrics.sidebarWidth >= 220 &&
            roleCenterMetrics.detailWidth >= 640,
          `权限管理角色中心布局宽度异常: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.documentScrollWidth <=
            roleCenterMetrics.documentClientWidth + 1,
          `权限管理页面出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.checklistScrollWidth <=
            roleCenterMetrics.checklistClientWidth + 1,
          `权限管理权限矩阵出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
        )
        const adminSearch =
          page.getByPlaceholder('搜索管理员账号、手机号、角色或权限码')
        await adminSearch.fill('assistant')
        await expectText(page, '命中 1/2 个管理员')
        const filteredTableText = await page
          .locator('.ant-table-tbody')
          .innerText()
        assert(
          filteredTableText.includes('assistant-admin') &&
            !filteredTableText.includes('style-l1-admin'),
          `权限管理搜索结果不符合预期: ${filteredTableText}`
        )
        await adminSearch.fill('')
        await expectText(page, '共 2 个管理员')
        await assertPaginationSizeChangerFocusStyle(page, {
          scenarioName: 'permission-center-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'permission-center-desktop',
          expectVisible: true,
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '当前页面数据已刷新')
        await page.getByRole('button', { name: '创建管理员' }).click()
        await expectText(page, '创建管理员')
        await expectText(page, '初始密码')
        await expectText(page, '角色')
        await expectText(page, '选择一个或多个角色')
        await assertAdminRoleModalLayout(page, {
          scenarioName: 'permission-center-create-modal',
          title: '创建管理员',
        })
        await assertTextAbsent(page, '搜索菜单权限名称或路径')
        await page
          .locator('.ant-modal-content')
          .filter({ hasText: '创建管理员' })
          .last()
          .locator('.ant-modal-footer button')
          .first()
          .click()
        await page
          .getByRole('row', { name: /assistant-admin/ })
          .getByRole('button', { name: '重置密码' })
          .click()
        const resetModal = page
          .locator('.ant-modal-content')
          .filter({ hasText: '重置密码：assistant-admin' })
          .last()
        await resetModal.getByText('新密码').waitFor()
        await assertVisibleModalInputFocusStyle(page, {
          scenarioName: 'permission-center-reset-modal-focus',
          modalText: '重置密码：assistant-admin',
        })
        await resetModal
          .locator('.ant-input-affix-wrapper input')
          .fill('new-secret')
        await page
          .getByRole('button', { name: /重\s*置/ })
          .last()
          .click()
        await expectText(page, '已重置管理员 assistant-admin 的密码')
      },
    },
    {
      name: 'print-center-desktop',
      path: '/erp/print-center',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        await expectText(page, '打印当前模板')
        await expectText(page, '模板')
        await expectText(page, '采购合同')
        await expectText(page, '加工合同')
        await assertTextAbsent(page, '样品确认单')
        await assertTextAbsent(page, '候选模板 / 未启用')
        await expectText(page, '纸面预览')
        await assertTextAbsent(page, '字段映射')
        await assertTextAbsent(page, '字段核对')
        await assertTextAbsent(page, '运营中枢')
        await assertTextAbsent(page, '模板数量')
        await assertTextAbsent(page, '示例记录')
        await assertTextAbsent(page, '打开可编辑打印窗口')
        await assertTextAbsent(page, '打开当前模板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'print-center-desktop',
        })
        const printCenterLayout = await page.evaluate(() => {
          const root = document.querySelector('.erp-print-center-page')
          const workbench = document.querySelector(
            '.erp-print-center-workbench'
          )
          const panels = [
            '.erp-print-center-nav-panel',
            '.erp-print-center-preview-panel',
          ].map((selector) => document.querySelector(selector))

          return {
            commandRailInPage: Boolean(
              root?.querySelector('.erp-command-center-rail')
            ),
            oldHero: Boolean(
              root?.querySelector('.erp-print-center-hero-card')
            ),
            oldSampleCard: Boolean(
              root?.querySelector('.erp-print-center-sample-card')
            ),
            panelCount: panels.filter(Boolean).length,
            gridTemplateColumns:
              workbench &&
              window.getComputedStyle(workbench).gridTemplateColumns,
          }
        })
        assert.equal(
          printCenterLayout.commandRailInPage,
          false,
          `打印中心不应再嵌套运营中枢导航: ${JSON.stringify(printCenterLayout)}`
        )
        assert.equal(
          printCenterLayout.oldHero,
          false,
          `打印中心不应保留旧 hero 卡: ${JSON.stringify(printCenterLayout)}`
        )
        assert.equal(
          printCenterLayout.oldSampleCard,
          false,
          `打印中心右栏不应保留示例记录卡: ${JSON.stringify(printCenterLayout)}`
        )
        assert.equal(
          printCenterLayout.panelCount,
          2,
          `打印中心应保持模板导航和纸面预览两栏: ${JSON.stringify(printCenterLayout)}`
        )
        const templateButtonSemantics = await page.evaluate(() =>
          [...document.querySelectorAll('.erp-print-center-template-btn')].map(
            (button) => {
              const style = window.getComputedStyle(button)
              return {
                tagName: button.tagName,
                cursor: style.cursor,
                ariaPressed: button.getAttribute('aria-pressed'),
                actionText:
                  button
                    .querySelector('.erp-print-center-template-action')
                    ?.textContent?.replace(/\s+/g, ' ')
                    .trim() || '',
                iconCount: button.querySelectorAll(
                  '.erp-print-center-template-action .anticon'
                ).length,
                text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
                scrollWidth: button.scrollWidth,
                clientWidth: button.clientWidth,
              }
            }
          )
        )
        assert.equal(
          templateButtonSemantics.length,
          2,
          `打印模板目录应只展示两套正式模板按钮: ${JSON.stringify(templateButtonSemantics)}`
        )
        assert(
          templateButtonSemantics.every(
            (item) =>
              item.tagName === 'BUTTON' &&
              item.cursor === 'pointer' &&
              ['true', 'false'].includes(item.ariaPressed) &&
              item.actionText.length > 0 &&
              item.iconCount === 1 &&
              item.scrollWidth <= item.clientWidth + 1
          ),
          `打印模板目录按钮应明确暴露选择动作和当前态: ${JSON.stringify(templateButtonSemantics)}`
        )
        await page
          .locator('.erp-print-center-template-list')
          .getByRole('button', { name: /^加工合同/ })
          .click()
        assert.match(
          page.url(),
          /[?&]template=processing-contract(?:&|$)/,
          '切换打印模板应写入 URL 以便刷新恢复'
        )
        await assertTextAbsent(page, '页面结构')
        await assertTextAbsent(page, '适用场景')
        await assertTextAbsent(page, '版式特点')
        await assertTextAbsent(page, '输出方式')
        await assertTextAbsent(page, '模板来源')
        await assertTextAbsent(page, '使用提醒')
        await assertNoHorizontalOverflow(page, 'print-center-desktop')
      },
    },
    {
      name: 'print-center-dark-desktop',
      path: '/erp/print-center',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        await expectText(page, '打印当前模板')
        await expectText(page, '模板')
        await expectText(page, '采购合同')
        await expectText(page, '加工合同')
        await assertTextAbsent(page, '样品确认单')
        await expectText(page, '纸面预览')
        await assertTextAbsent(page, '字段映射')
        await assertTextAbsent(page, '运营中枢')
        await assertTextAbsent(page, '示例记录')
        await assertERPThemeMode(page, {
          scenarioName: 'print-center-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'print-center-dark-desktop',
          selector: '.erp-print-center-page',
        })
        await assertNoHorizontalOverflow(page, 'print-center-dark-desktop')
      },
    },
    {
      name: 'print-preview-material',
      path: '/erp/print-center/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购合同')
        await expectText(page, '兼容入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
      },
    },
    {
      name: 'print-preview-material-dark-desktop',
      path: '/erp/print-center/material-purchase-contract',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购合同')
        await expectText(page, '兼容入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
        await assertERPThemeMode(page, {
          scenarioName: 'print-preview-material-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'print-preview-material-dark-desktop',
          selector: '.erp-admin-content',
        })
      },
    },
    {
      name: 'print-preview-processing',
      path: '/erp/print-center/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '加工合同')
        await expectText(page, '兼容入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
      },
    },
    {
      name: 'print-workspace-material-shell-refresh',
      path: '/erp/print-center?template=material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '采购合同',
          editableSelector:
            '.erp-material-contract-table tbody td [contenteditable="true"]',
          editableScenarioLabel: '采购合同弹窗刷新恢复',
          signatureValueSelector:
            '.erp-material-contract-signature__name, .erp-material-contract-signature__date-value',
          signatureTextsToClear: ['签字人', '供应商签字人'],
          signatureTextsToRetain: ['2026/2/28'],
        })
      },
    },
    {
      name: 'print-workspace-processing-shell-refresh',
      path: '/erp/print-center?template=processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '加工合同',
          editableSelector:
            '.erp-processing-contract-table tbody td [contenteditable="true"]',
          editableScenarioLabel: '加工合同弹窗刷新恢复',
          signatureValueSelector:
            '.erp-processing-contract-signature__name-value, .erp-processing-contract-signature__date-value',
          signatureTextsToClear: ['签字人', '受托方签字人'],
          signatureTextsToRetain: ['2025-06-08'],
        })
      },
    },
    {
      name: 'print-center-processing-preview-popup',
      path: '/erp/print-center?template=processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertPrintCenterPreviewPopup(page, {
          expectedWorkspaceTitle: '加工合同',
          buttonName: '在线预览 PDF',
          title: '加工合同 PDF 预览',
          screenshotName: 'print-center-processing-preview-popup-window',
        })
      },
    },
    {
      name: 'print-workspace-material',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '采购合同')
        await expectText(page, '当前记录字段（可编辑）')
        await expectText(page, '使用默认模板')
        await expectText(page, '在线预览 PDF')
        await expectText(page, '选择明细行')
        await expectText(page, '下载 PDF')
        await assertPrintWorkspacePaginationStyle(page, {
          paperSelector: '.erp-material-contract-paper',
          rowSelector: '.erp-material-contract-table tbody tr',
          theadSelector: '.erp-material-contract-table thead',
        })
        await assertContractTableHeadersStaySingleLine(page, {
          tableSelector: '.erp-material-contract-table',
          expectedHeaders: [
            '采购订单号',
            '产品订单编号',
            '产品编号',
            '产品名称',
            '材料品名',
            '厂商料号',
            '规格',
            '单位',
            '单价',
            '采购数量',
            '采购金额',
            '备注',
          ],
        })
        await assertContractTableEditableAlignment(page, {
          tableSelector: '.erp-material-contract-table',
          editableSelector:
            '.erp-material-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '采购合同模板表格',
        })
        await assertContractTotalCellsWrapLargeNumbers(page, {
          storageKey: '__plush_erp_material_purchase_contract_print_draft__',
          templateKind: 'material',
          totalValueSelector:
            '.erp-material-contract-table__total .erp-contract-table__total-value',
          scenarioLabel: '采购合同模板合计行',
        })
        await assertMaterialContractMetaAlignment(page)
        await assertWorkspaceContinuedPageMargin(page, {
          storageKey: '__plush_erp_material_purchase_contract_print_draft__',
          paperSelector: '.erp-material-contract-paper',
          clearMerges: true,
        })
      },
    },
    {
      name: 'print-workspace-material-print-media-narrow-viewport',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 760, height: 900 },
      verify: async (page) => {
        await expectText(page, '采购合同')
        await assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints(page)
      },
    },
    {
      name: 'print-workspace-processing',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '加工合同')
        await expectText(page, '当前记录字段（可编辑）')
        await expectText(page, '使用默认模板')
        await expectText(page, '在线预览 PDF')
        await expectText(page, '下载 PDF')
        await expectText(page, '选择明细行')
        await expectText(page, '加工明细行: 3/300')
        await expectText(page, '打印')
        await expectButton(page, '上传纸样 / 图样附件位 1')
        await expectButton(page, '上传纸样 / 图样附件位 2')
        await assertProcessingContractPaperRowCount(page)
        await assertProcessingContractSignatureLayout(page)
        await assertPrintWorkspacePaginationStyle(page, {
          paperSelector: '.erp-processing-contract-paper',
          rowSelector: '.erp-processing-contract-table tbody tr',
          theadSelector: '.erp-processing-contract-table thead',
        })
        await assertContractTableHeadersStaySingleLine(page, {
          tableSelector: '.erp-processing-contract-table',
          expectedHeaders: [
            '委外加工订单号',
            '产品订单编号',
            '产品编号',
            '产品名称',
            '工序名称',
            '加工厂商',
            '工序类别',
            '单位',
            '单价',
            '委托加工数量',
            '委托加工金额',
            '备注',
          ],
        })
        await assertContractTableEditableAlignment(page, {
          tableSelector: '.erp-processing-contract-table',
          editableSelector:
            '.erp-processing-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '加工合同模板表格',
        })
        await assertContractTotalCellsWrapLargeNumbers(page, {
          storageKey: '__plush_erp_processing_contract_print_draft__',
          templateKind: 'processing',
          totalValueSelector:
            '.erp-processing-contract-table__total .erp-contract-table__total-value',
          scenarioLabel: '加工合同模板合计行',
        })
        await assertWorkspaceContinuedPageMargin(page, {
          storageKey: '__plush_erp_processing_contract_print_draft__',
          paperSelector: '.erp-processing-contract-paper',
        })
        const emptyAttachmentState = await page.evaluate(() => ({
          templateAttachmentCount: document.querySelectorAll(
            '.erp-processing-contract-attachments'
          ).length,
          templateAttachmentImageCount: document.querySelectorAll(
            '.erp-processing-contract-attachments__image'
          ).length,
        }))
        assert.equal(
          emptyAttachmentState.templateAttachmentCount,
          0,
          '未上传时纸面不应渲染附件区'
        )
        assert.equal(
          emptyAttachmentState.templateAttachmentImageCount,
          0,
          '未上传时纸面不应渲染附件图片'
        )
        await page
          .locator('.erp-processing-contract-upload-bar__input')
          .first()
          .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))
        await expectText(page, '已同步：favicon.svg')
        const attachmentTemplateState = await page.evaluate(() => ({
          uploadPanelCount: document.querySelectorAll(
            '.erp-processing-contract-upload-bar'
          ).length,
          templateAttachmentCount: document.querySelectorAll(
            '.erp-processing-contract-attachments'
          ).length,
          templateAttachmentImageCount: document.querySelectorAll(
            '.erp-processing-contract-attachments__image'
          ).length,
        }))
        assert.equal(
          attachmentTemplateState.uploadPanelCount,
          1,
          '加工合同工作台应显示独立附件上传区'
        )
        assert.equal(
          attachmentTemplateState.templateAttachmentCount,
          1,
          '加工合同纸面模板应渲染页底附件区'
        )
        assert.equal(
          attachmentTemplateState.templateAttachmentImageCount,
          1,
          '上传后的附件应同步显示到纸面附件位'
        )
        await page.getByRole('button', { name: '清空' }).click()
        await expectText(page, '未上传')
        const clearedAttachmentState = await page.evaluate(() => ({
          templateAttachmentCount: document.querySelectorAll(
            '.erp-processing-contract-attachments'
          ).length,
          templateAttachmentImageCount: document.querySelectorAll(
            '.erp-processing-contract-attachments__image'
          ).length,
        }))
        assert.equal(
          clearedAttachmentState.templateAttachmentCount,
          0,
          '清空附件位后不应保留附件区'
        )
        assert.equal(
          clearedAttachmentState.templateAttachmentImageCount,
          0,
          '清空附件位后不应残留旧图'
        )
      },
    },
    {
      name: 'print-workspace-material-row-selection-reset',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertRowSelectionClearsAfterCancel(page, {
          dataRowSelector:
            '.erp-material-contract-table tbody tr:not(.erp-material-contract-table__total)',
          selectedRowSelector: '.erp-material-contract-table__row-selected',
          counterLabel: '采购明细行',
        })
      },
    },
    {
      name: 'print-workspace-processing-row-selection-reset',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertRowSelectionClearsAfterCancel(page, {
          dataRowSelector:
            '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total)',
          selectedRowSelector: '.erp-processing-contract-table__row--selected',
          counterLabel: '加工明细行',
        })
      },
    },
    {
      name: 'print-workspace-material-preview-popup',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertPrintPreviewPopup(page, {
          buttonName: '在线预览 PDF',
          title: '采购合同 PDF 预览',
          screenshotName: 'print-workspace-material-preview-popup-window',
        })
      },
    },
    {
      name: 'print-workspace-processing-preview-popup',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertPrintPreviewPopup(page, {
          buttonName: '在线预览 PDF',
          title: '加工合同 PDF 预览',
          screenshotName: 'print-workspace-processing-preview-popup-window',
        })
      },
    },
    {
      name: 'business-menu-groups-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectButton(page, '新建订单')
        await expectText(page, '当前操作')
        await expectText(page, '订单行')
        await expectText(page, '工作台')
        await expectText(page, '任务看板')
        await expectText(page, '业务看板')
        await expectText(page, '主数据')
        await expectText(page, '客户档案')
        await expectText(page, '供应商档案')
        await expectText(page, '产品档案')
        await expectText(page, '销售管理')
        await expectText(page, '销售订单')
        await expectText(page, '产品工程')
        await expectText(page, 'BOM 管理')
        await expectText(page, '采购管理')
        await expectText(page, '采购订单')
        await expectText(page, '质检管理')
        await expectText(page, '来料质检')
        await expectText(page, '库存管理')
        await expectText(page, '入库管理')
        await expectText(page, '库存台账')
        await expectText(page, '委外管理')
        await expectText(page, '委外订单')
        await expectText(page, '生产管理')
        await expectText(page, '生产排程')
        await expectText(page, '出货管理')
        await expectText(page, '出货放行')
        await expectText(page, '财务业务')
        await expectText(page, '应收管理')
        await expectText(page, '导出当前结果')
        await expectText(page, '列顺序')
        await expectText(page, '运营工具')
        await expectText(page, '模板打印中心')
        await expectText(page, '异常 / 阻塞闭环')
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'sales-orders',
          heading: '销售订单',
        })
        await page.locator('.erp-admin-menu').evaluate((node) => {
          node.scrollTop = node.scrollHeight
        })
        await expectText(page, '系统管理')
        await expectText(page, '权限管理')
        const menu = page.locator('.erp-admin-menu')
        assert.equal(
          await menu.getByText('客户/供应商', { exact: true }).count(),
          0,
          '侧栏不应再显示旧“客户/供应商”正式入口'
        )
        assert.equal(
          await menu.getByText('订单/款式立项', { exact: true }).count(),
          0,
          '侧栏不应再显示旧“订单/款式立项”正式入口'
        )
        for (const retiredGroup of ['采购/仓储', '生产环节', '财务环节']) {
          assert.equal(
            await page.getByText(retiredGroup, { exact: true }).count(),
            0,
            `侧栏不应再显示旧“${retiredGroup}”组合业务分组`
          )
        }
        assert.equal(
          await page.getByText('流程与真源', { exact: true }).count(),
          0,
          '侧栏不应再显示“流程与真源”分组'
        )
        assert.equal(
          await page.getByText('开发与验收', { exact: true }).count(),
          0,
          '侧栏不应再显示“开发与验收”分组'
        )
        assert.equal(
          await page.getByText('帮助中心', { exact: true }).count(),
          0,
          '侧栏不应再显示“帮助中心”分组'
        )
        assert.equal(
          await page.getByText('高级文档', { exact: true }).count(),
          0,
          '侧栏不应再显示“高级文档”入口'
        )
      },
    },
    ...createPurchaseReceiptScenarios({
      assert,
      assertBusinessFormModalKeyboardRecovery,
      assertBusinessListEmptySearchState,
      assertBusinessMainTableInitialSelectionEmpty,
      assertERPThemeMode,
      assertNoHorizontalOverflow,
      assertPurchaseReceiptActionButtonState,
      assertPurchaseReceiptAddItemModalDarkTokens,
      assertPurchaseReceiptAddItemModalMetrics,
      assertPurchaseReceiptAddItemModalMobileLayout,
      assertPurchaseReceiptCreateModalDarkTokens,
      assertPurchaseReceiptCreateModalFocusStyles,
      assertPurchaseReceiptCreateModalKeyboardRecovery,
      assertPurchaseReceiptCreateModalMetrics,
      assertPurchaseReceiptCreateModalMobileLayout,
      assertPurchaseReceiptRowItemCount,
      assertTextAbsent,
      closeBusinessFormModal,
      expectButton,
      expectHeading,
      expectText,
      fillPurchaseReceiptAddItemModalBoundaryValues,
      fillPurchaseReceiptCreateModalBoundaryValues,
      openPurchaseReceiptAddItemModal,
      openPurchaseReceiptCreateModal,
      selectPurchaseReceiptRow,
    }),
    {
      name: 'material-master-header-desktop',
      path: '/erp/master/materials',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '材料档案')
        await expectText(page, '样式材料')
        await expectText(page, '默认单位')
        await expectText(page, '只（PCS）')
        await assertTextAbsent(page, '默认单位 ID')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'material-master-header-desktop',
          expectedLabels: ['总材料', '当前结果', '启用材料', '已选材料'],
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await page.getByRole('button', { name: '新建材料' }).click()
        const materialModal = page
          .locator('.erp-business-action-modal--form.ant-modal:visible')
          .last()
        await materialModal.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '新建材料档案')
        const materialCodeValue = await materialModal
          .getByPlaceholder('自动生成，可按需要调整')
          .inputValue()
        assert(
          /^MAT-\d{8}-\d{3}$/u.test(materialCodeValue),
          `材料编号应自动生成，不应要求用户手填: ${materialCodeValue}`
        )
        await materialModal
          .locator('.erp-material-category-suggested-input')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await materialModal
          .locator('.erp-material-color-suggested-input')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const categoryInput = materialModal.locator(
          '.erp-material-category-suggested-input input'
        )
        await categoryInput.fill('面')
        let suggestionDropdown = page
          .locator('.ant-select-dropdown:visible')
          .last()
        await suggestionDropdown
          .locator('.ant-select-item-option-content', { hasText: /^面料$/u })
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        const categoryDropdownBackground = await suggestionDropdown.evaluate(
          (element) => window.getComputedStyle(element).backgroundColor
        )
        assert(
          isLightSurfaceColor(categoryDropdownBackground),
          `材料分类候选浮层不应退回浏览器黑底样式: ${categoryDropdownBackground}`
        )
        await page.keyboard.press('Escape')

        const colorInput = materialModal.locator(
          '.erp-material-color-suggested-input input'
        )
        await colorInput.fill('米')
        suggestionDropdown = page.locator('.ant-select-dropdown:visible').last()
        await suggestionDropdown
          .locator('.ant-select-item-option-content', { hasText: /^米白$/u })
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert(
          isLightSurfaceColor(
            await suggestionDropdown.evaluate(
              (element) => window.getComputedStyle(element).backgroundColor
            )
          ),
          '材料颜色候选浮层不应退回浏览器黑底样式'
        )
        await expectText(page, '只（PCS）')
        await assertTextAbsent(page, '默认单位 ID')
        await closeBusinessFormModal(page, materialModal)
        await assertNoHorizontalOverflow(page, 'material-master-header-desktop')
      },
    },
    {
      name: 'purchase-order-date-filter-desktop',
      path: '/erp/purchase/accessories',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购订单')
        await expectText(page, '采购日期')
        await expectText(page, '预计到货')
        await expectText(page, '新建采购订单')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
          expectedLabels: ['总订单', '当前结果', '已审核', '已选订单'],
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessModuleToolbarControlStyle(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: '新建采购订单',
          titleText: '新建采购订单',
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建采购订单',
          titleText: '新建采购订单',
          minFieldCount: 0,
          screenshotName: 'business-v1-purchase-order-form-modal',
          expectedTexts: [
            '采购明细',
            '从材料库导入',
            '已录入',
            '数量合计',
            '金额合计',
          ],
          afterOpen: async (modal) => {
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从材料库导入',
              titleText: '从材料库导入采购明细',
              expectedTexts: ['材料编码', '材料名称', 'MAT-STYLE-L1'],
              emptyDescriptionText: '暂无可导入材料',
              collapseSelectTexts: [
                'MAT-STYLE-L1',
                'MAT-STYLE-L2',
                'MAT-STYLE-L3',
                'MAT-STYLE-L4',
                'MAT-STYLE-L5',
                'MAT-STYLE-L6',
              ],
              selectText: 'MAT-STYLE-L1',
              scenarioName: 'purchase-order-source-import-picker',
            })
            await assertLineItemsUnifiedHorizontalScroll(modal, {
              scenarioName: 'business-v1-purchase-order-form-modal',
              minRows: 2,
            })
          },
        })
      },
    },
    {
      name: 'business-collaboration-supplier-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await expectText(page, '本页协同')
        await assertBusinessCollaborationPanelCollapsedByDefault(page, {
          scenarioName: 'business-collaboration-supplier-desktop',
          expectCurrentRecord: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'business-collaboration-supplier-desktop'
        )
      },
    },
    {
      name: 'business-collaboration-purchase-selected-desktop',
      path: '/erp/purchase/accessories',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await seedBusinessCollaborationOverflowTasks(page, {
          sourceType: 'accessories-purchase',
          currentSourceID: 1,
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '采购订单')
        await expectText(page, '本页协同')
        const purchaseOrderRow = page
          .locator('.erp-business-data-table-card .ant-table-tbody tr')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
        await purchaseOrderRow.click()
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'business-collaboration-purchase-selected-desktop',
          primaryActionLabel: '提交',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['审核', '关闭', '取消'],
        })
        await assertBusinessCollaborationPanelCollapsedByDefault(page, {
          scenarioName: 'business-collaboration-purchase-selected-desktop',
          expectCurrentRecord: true,
          checkDesktopResize: false,
          checkResizeHandleHover: false,
          expectedOverflowNote: '仅显示前 6 条，还有 6 条',
          expectedTabTexts: ['本页待办12', '当前记录2', '阻塞异常4'],
        })
        await assertNoHorizontalOverflow(
          page,
          'business-collaboration-purchase-selected-desktop'
        )
      },
    },
    {
      name: 'shipment-date-filter-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        await expectText(page, '计划出货')
        await expectText(page, '实际出货')
        await expectText(page, '新建草稿')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'shipment-date-filter-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'shipment-date-filter-desktop',
          expectedLabels: ['总出货单', '当前结果', '草稿', '已选出货单'],
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'shipment-date-filter-desktop',
        })
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'shipment-date-filter-desktop',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'shipment-date-filter-desktop',
          unsortableHeaders: ['备注'],
        })
        await assertBusinessModuleToolbarControlStyle(page, {
          scenarioName: 'shipment-date-filter-desktop',
          requireSearch: false,
        })
        await assertNoHorizontalOverflow(page, 'shipment-date-filter-desktop')
      },
    },
    {
      name: 'shipment-date-filter-mobile',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        await expectText(page, '计划出货')
        await expectText(page, '实际出货')
        const metrics = await page.evaluate(() => {
          const control = document.querySelector(
            '.erp-business-date-range-filter'
          )
          const range = control?.querySelector(
            '.erp-business-date-range-filter__range'
          )
          const inputs = Array.from(
            control?.querySelectorAll('.erp-business-date-input') || []
          ).map((input) => {
            const inputElement = input.querySelector('input') || input
            const rect = input.getBoundingClientRect()
            return {
              width: rect.width,
              clientWidth: inputElement.clientWidth,
              scrollWidth: inputElement.scrollWidth,
            }
          })
          return {
            controlWidth: control?.getBoundingClientRect().width || 0,
            rangeFlexDirection: range
              ? getComputedStyle(range).flexDirection
              : '',
            inputs,
          }
        })
        assert(
          metrics.controlWidth > 0 && metrics.controlWidth <= 358,
          `shipment-date-filter-mobile 日期筛选控件应适配窄屏宽度: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.rangeFlexDirection,
          'column',
          `shipment-date-filter-mobile 起止日期在窄屏应改为上下排列: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.inputs.length === 2 &&
            metrics.inputs.every(
              (item) => item.scrollWidth <= item.clientWidth + 1
            ),
          `shipment-date-filter-mobile 日期输入不应裁切: ${JSON.stringify(metrics)}`
        )
        await assertNoHorizontalOverflow(page, 'shipment-date-filter-mobile')
      },
    },
    {
      name: 'business-collaboration-mobile',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await expectText(page, '本页协同')
        await assertBusinessCollaborationPanelCollapsedByDefault(page, {
          scenarioName: 'business-collaboration-mobile',
          expectCurrentRecord: true,
        })
        await assertNoHorizontalOverflow(page, 'business-collaboration-mobile')
      },
    },
    {
      name: 'textarea-show-count-layout-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建供应商',
          titleText: '新建供应商档案',
          minFieldCount: 5,
          screenshotName: 'textarea-show-count-supplier-form-modal',
          expectedTexts: ['备注', '联系人', '添加条目'],
        })
        await assertNoHorizontalOverflow(page, 'textarea-show-count-layout')
      },
    },
    ...createBusinessFormalScenarios({
      assert,
      assertBusinessFormModalKeyboardRecovery,
      assertBusinessHeaderHasNoSectionTitle,
      assertBusinessHeaderStatsSingleLine,
      assertBusinessListEmptySearchState,
      assertBusinessMainTableHasNoOperationColumn,
      assertBusinessMainTableInitialSelectionEmpty,
      assertBusinessMainTableSortableColumns,
      assertBusinessPageRefreshEntrypoint,
      assertBusinessToolbarDisabledButtons,
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
      verifyFormalShellRowDoubleClickEditModal,
      verifySourceImportPicker,
    }),
  ]
}
