import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

import { createBusinessFormalScenarios } from './businessFormalScenarios.mjs'
import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'
import { createPurchaseReceiptScenarios } from './purchaseReceiptScenarios.mjs'

export function createStyleL1Scenarios(deps) {
  const {
    assert,
    assertAntdModalCentered,
    assertAdminLoginLayout,
    assertAdminLoginSmsCodeErrorHintSpacing,
    assertAdminLoginSmsHintLayout,
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
    assertMobileTaskInitialSkeleton,
    assertMobileTaskMainNavigation,
    assertMobileTaskRefreshFeedback,
    assertNoDashboardCenterLocalRefreshButton,
    assertNoDuplicatedAdminPageTitle,
    assertNoHorizontalOverflow,
    assertOperationalFactModalViewport,
    assertOrderLifecycleActionsConsolidated,
    assertOutsourcingProcessSelectOptions,
    assertPaginationSizeChangerFocusStyle,
    assertPermissionChecklistItemLayout,
    assertPermissionSectionVisualSeparation,
    assertPrintCenterPreviewPopup,
    assertPrintPreviewPopup,
    assertPrintWorkspacePaginationStyle,
    assertProcessSuggestionOptions,
    assertProcessingContractPaperRowCount,
    assertProcessingContractSignatureLayout,
    assertPurchaseReceiptActionButtonState,
    assertPurchaseReceiptAddItemEditorDarkTokens,
    assertPurchaseReceiptAddItemEditorMetrics,
    assertPurchaseReceiptAddItemEditorMobileLayout,
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
    fillPurchaseReceiptAddItemEditorBoundaryValues,
    gotoScenarioPath,
    isLightSurfaceColor,
    openPurchaseReceiptAddItemEditor,
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
  const {
    assertLineItemAddActionScrollsToNewRow,
    assertLineQuantityUnitSuffix,
  } = createLineItemUnitAssertions({
    assert,
  })
  const expectAdminMenuText = async (page, text) => {
    const menu = page.locator('.erp-admin-menu').first()
    await menu.waitFor({ state: 'visible', timeout: 10_000 })
    const menuText = await menu.evaluate((node) =>
      String(node.textContent || '')
        .replace(/\s+/gu, ' ')
        .trim()
    )
    assert(
      menuText.includes(text),
      `后台菜单应展示“${text}”，当前菜单文本：${menuText}`
    )
  }
  const expectEffectiveSessionMode = async (page, mode) => {
    const layout = page.locator('[data-effective-session-mode]').first()
    await layout.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await layout.getAttribute('data-effective-session-mode'),
      mode,
      `effective session 诊断模式应为 ${mode}`
    )
  }

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
        await page.getByText('岗位任务端', { exact: true }).click()
        await assertLoginSegmentedReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop-entry-switch',
        })
        await page
          .locator('.erp-login-card label.ant-segmented-item')
          .filter({ hasText: '短信登录' })
          .click()
        await assertLoginSegmentedReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop-login-mode-switch',
        })
        await page.getByPlaceholder('请输入手机号').fill('13794566255')
        await page.getByRole('button', { name: '获取验证码' }).click()
        await expectText(page, '临时验证码')
        await assertAdminLoginSmsHintLayout(page, {
          scenarioName: 'admin-login-theme-modes-desktop-dark-sms-hint',
        })
        await page.getByRole('button', { name: /^登\s*录$/ }).click()
        await assertAdminLoginSmsCodeErrorHintSpacing(page, {
          scenarioName: 'admin-login-theme-modes-desktop-dark-sms-code-error',
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page
          .locator('.erp-login-card label.ant-segmented-item')
          .filter({ hasText: '短信登录' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          () =>
            document.querySelector('input[placeholder="请输入手机号"]')
              ?.value === '13794566255',
          null,
          { timeout: 10_000 }
        )
        const persistedLoginState = await page.evaluate(() => {
          const selectedTexts = [
            ...document.querySelectorAll(
              '.erp-login-card .ant-segmented-item-selected'
            ),
          ].map((item) => item.textContent.replace(/\s+/g, ' ').trim())
          const codeButton = document.querySelector(
            '.erp-login-card .erp-login-sms-code-compact button'
          )

          return {
            selectedTexts,
            phoneValue:
              document.querySelector('input[placeholder="请输入手机号"]')
                ?.value || '',
            codeButtonText: codeButton?.textContent?.trim() || '',
            codeButtonDisabled: Boolean(codeButton?.disabled),
          }
        })
        assert(
          persistedLoginState.selectedTexts.includes('岗位任务端'),
          `登录入口刷新后未保持岗位任务端: ${JSON.stringify(
            persistedLoginState
          )}`
        )
        assert(
          persistedLoginState.selectedTexts.includes('短信登录'),
          `登录方式刷新后未保持短信登录: ${JSON.stringify(persistedLoginState)}`
        )
        assert.equal(
          persistedLoginState.phoneValue,
          '13794566255',
          `短信手机号刷新后未恢复: ${JSON.stringify(persistedLoginState)}`
        )
        assert(
          persistedLoginState.codeButtonDisabled,
          `短信倒计时刷新后未保持禁用: ${JSON.stringify(persistedLoginState)}`
        )
        assert.match(
          persistedLoginState.codeButtonText,
          /^\d+s$/,
          `短信倒计时刷新后未恢复秒数: ${JSON.stringify(persistedLoginState)}`
        )
        await assertAdminLoginSmsHintLayout(page, {
          scenarioName: 'admin-login-theme-modes-desktop-refresh-sms-hint',
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
        await assertAdminLoginSmsHintLayout(page, {
          scenarioName: 'admin-login-theme-modes-desktop-light-sms-hint',
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
      name: 'auth-disabled-alert-desktop',
      path: '/erp/dashboard',
      auth: 'admin-disabled',
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectText(page, '管理员已禁用')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-disabled-alert-desktop',
          expectedMessage: '管理员已禁用',
        })
        await assertTextAbsent(page, '今日焦点')
        await assertTextAbsent(page, '待我处理')
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectText(page, '毛绒 ERP 管理后台')
      },
    },
    {
      name: 'auth-disabled-alert-mobile-dark',
      path: '/erp/dashboard',
      auth: 'admin-disabled',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectText(page, '管理员已禁用')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-disabled-alert-mobile-dark',
          expectedMessage: '管理员已禁用',
        })
        await assertTextAbsent(page, '今日焦点')
        await assertTextAbsent(page, '待我处理')
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
        await assertTextAbsent(page, '内部来源')
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
      name: 'erp-effective-session-super-admin-product-core',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-effective-session',
        configHash: 'style-l1-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard'],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      expectPath: '/erp/warehouse/shipments',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectText(page, 'style-l1-admin')
        await expectHeading(page, '出货单')
        await expectText(page, 'SHIP-STYLE-L1')

        const createButton = page
          .getByRole('button', { name: '新建草稿' })
          .first()
        await createButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await createButton.isDisabled(),
          false,
          'super admin 不应被 effective_session.actions=[] 收窄业务写按钮'
        )
      },
    },
    {
      name: 'erp-effective-session-direct-url-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['system.permission.read', 'system.permission.manage'],
        menus: [{ key: 'permission-center', path: '/erp/system/permissions' }],
      },
      effectiveSession: {
        configRevision: 'style-l1-direct-url',
        configHash: 'style-l1-direct-url-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard'],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      expectPath: '/erp/system/permissions',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectEffectiveSessionMode(
          page,
          'local_dev_customer_config_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '角色模板')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-effective-session-sync-failure-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['system.permission.read', 'system.permission.manage'],
        menus: [{ key: 'permission-center', path: '/erp/system/permissions' }],
      },
      customerKey: 'yoyoosun',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          const result =
            method === 'get_effective_session'
              ? {
                  code: RpcErrorCode.INTERNAL,
                  message: '客户有效配置同步失败',
                  data: {},
                }
              : {
                  code: 0,
                  message: 'OK',
                  data: {},
                }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result,
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectEffectiveSessionMode(
          page,
          'local_dev_sync_failed_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '角色模板')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-effective-session-empty-pages-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['system.permission.read', 'system.permission.manage'],
        menus: [{ key: 'permission-center', path: '/erp/system/permissions' }],
      },
      effectiveSession: {
        configRevision: 'style-l1-empty-pages',
        configHash: 'style-l1-empty-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具 ERP')
        await expectEffectiveSessionMode(
          page,
          'local_dev_customer_config_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '角色模板')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-no-visible-menu-blocks-outlet',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [],
        menus: [],
      },
      effectiveSession: {
        configRevision: 'style-l1-no-visible-menu',
        configHash: 'style-l1-no-visible-menu-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '当前账号暂无可见后台入口')
        await expectText(page, '当前客户有效配置的页面清单')
        await assertTextAbsent(page, '权限中心')
        await assertTextAbsent(page, '管理员列表')
      },
    },
    {
      name: 'erp-effective-session-action-projection-business-pages',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
      },
      effectiveSession: {
        configRevision: 'style-l1-action-projection',
        configHash: 'style-l1-action-projection-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [
          'shipments',
          'quality-inspections',
          'inbound',
          'sales-orders',
          'accessories-purchase',
          'processing-contracts',
        ],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const assertEffectiveSessionMenuProjection = async () => {
          const menuText = await page
            .locator('.erp-admin-menu')
            .evaluate((node) => node.textContent.replace(/\s+/g, ' ').trim())
          for (const label of [
            '出货单',
            '来料质检',
            '入库管理',
            '销售订单',
            '采购订单',
            '委外订单',
          ]) {
            assert(
              menuText.includes(label),
              `普通账号菜单应保留 active pages 投影允许的入口 ${label}: ${menuText}`
            )
          }
          for (const label of [
            '权限管理',
            '系统审计日志',
            '模板打印中心',
            '客户档案',
            '供应商档案',
            '产品资料',
          ]) {
            assert(
              !menuText.includes(label),
              `普通账号菜单不应显示 active pages 未投出的入口 ${label}: ${menuText}`
            )
          }
        }

        const expectProjectedActionDisabled = async (label, message) => {
          const button = page.getByRole('button', { name: label }).first()
          await button.waitFor({ state: 'visible', timeout: 10_000 })
          await page.waitForFunction(
            (buttonText) =>
              Array.from(document.querySelectorAll('button')).some(
                (node) =>
                  String(node.textContent || '')
                    .replace(/\s+/g, ' ')
                    .includes(buttonText) && node.disabled
              ),
            label,
            { timeout: 10_000 }
          )
          assert.equal(await button.isDisabled(), true, message)
        }

        await assertEffectiveSessionMenuProjection()
        await expectHeading(page, '出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await expectProjectedActionDisabled(
          '新建草稿',
          '出货页页面可见但 actions 为空时不应允许新建出货草稿'
        )
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        await expectProjectedActionDisabled(
          '维护明细',
          '出货页 actions 为空时不应允许维护明细'
        )
        await expectProjectedActionDisabled(
          '确认出货',
          '出货页 actions 为空时不应允许确认出货'
        )

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '来料质检')
        await expectText(page, 'QI-STYLE-L1')
        await expectProjectedActionDisabled(
          '生成质检草稿',
          '质检页页面可见但 actions 为空时不应允许生成草稿'
        )
        await page.getByText('QI-STYLE-L1', { exact: false }).first().click()
        for (const label of [
          '提交质检',
          '判定合格',
          '判定不合格',
          '取消质检',
        ]) {
          await expectProjectedActionDisabled(
            label,
            `质检页 actions 为空时不应允许${label}`
          )
        }

        await gotoScenarioPath(page, '/erp/warehouse/inbound', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1-DRAFT')
        await page.getByText('PR-STYLE-L1-DRAFT', { exact: false }).click()
        await expectProjectedActionDisabled(
          '添加明细',
          '采购入库页 actions 为空时不应允许给草稿添加明细'
        )
        await expectProjectedActionDisabled(
          '过账入库',
          '采购入库页 actions 为空时不应允许确认过账'
        )

        await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '销售订单')
        await expectText(page, 'SO-STYLE-L1')
        await expectNoButton(page, '新建订单')
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await expectNoButton(page, '提交')
        await expectNoButton(page, '取消')

        await gotoScenarioPath(page, '/erp/purchase/accessories', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '采购订单')
        await expectText(page, 'PO-STYLE-L1')
        await expectProjectedActionDisabled(
          '新建采购订单',
          '采购订单页页面可见但 actions 为空时不应允许新建采购订单'
        )
        await page.getByText('PO-STYLE-L1', { exact: false }).first().click()
        await expectProjectedActionDisabled(
          '编辑',
          '采购订单页 actions 为空时不应允许编辑采购订单'
        )
        await expectProjectedActionDisabled(
          '生成入库',
          '采购订单页 actions 为空时不应允许生成采购入库草稿'
        )
        await expectNoButton(page, '提交')
        await expectNoButton(page, '取消')

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        await expectText(page, 'SIM-OUTSOURCE-CONTRACT-L1')
        await expectProjectedActionDisabled(
          '新建加工合同',
          '委外订单页页面可见但 actions 为空时不应允许新建加工合同'
        )
        await page
          .getByRole('row')
          .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
          .click()
        await expectProjectedActionDisabled(
          '编辑',
          '委外订单页 actions 为空时不应允许编辑加工合同'
        )
        await expectNoButton(page, '提交')
        await expectNoButton(page, '确认下单')
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
        await assertTextAbsent(page, '内部来源')
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
          .getByPlaceholder('搜索任务、单号、来源、处理原因')
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
          .getByPlaceholder('搜索任务、单号、来源、处理原因')
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
              'input[placeholder="搜索任务、单号、来源、处理原因"]'
            )?.value === ''
        )
        const clearedKeyword = await page
          .getByPlaceholder('搜索任务、单号、来源、处理原因')
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
        await navigationLaneTask
          .getByRole('button', { name: '看板跳转测试任务', exact: true })
          .click()
        await waitForPath(page, '/erp/warehouse/shipping-release')
        assert.match(
          page.url(),
          /[?&]link_keyword=OUT-DASH-NAV(?:&|$)/,
          `任务看板出货放行入口应带来源单号: ${page.url()}`
        )
        await expectHeading(page, '出货放行')
        await expectText(page, '看板跳转测试任务')
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
        await assertTextAbsent(page, '内部来源')
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
        await assertTextAbsent(page, '内部来源')
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
        await assertTextAbsent(page, '内部来源')
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
          .getByPlaceholder('搜索任务、单号、来源、处理原因')
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
        await page
          .locator('.ant-table-row')
          .filter({ hasText: '暗色客户' })
          .first()
          .click()
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
      path: '/m/sales/tasks?__style_l1_workflow_list_delay=1300',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await assertMobileTaskInitialSkeleton(page, {
          scenarioName: 'mobile-tasks-dark',
        })
        await page.evaluate(async () => {
          const createTask = async (params) => {
            const response = await fetch('/rpc/workflow', {
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
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
            return payload.result.data?.task || null
          }

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
            priority: 9,
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
        await page.evaluate(() => {
          localStorage.setItem('erp:last_entry_target', 'mobileTasks')
        })
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
        await expectHeading(
          page,
          '客户配置包导入控制台 / Package Import Console'
        )
        await expectText(page, '当前 URL customer / Query')
        await expectText(page, 'yoyoosun')
        await expectText(page, '当前配置包 / Current Package')
        await expectText(page, '决策卡 / Decision Cards')
        await expectText(page, '可以进入人工评审')
        await expectText(page, '预检通过')
        await expectText(page, '真实导入')
        await expectText(page, '下一步 / Next')
        const overviewDefaultMetrics = await page.evaluate(() => ({
          panelCount: document.querySelectorAll(
            '.erp-dev-customer-overview > .erp-dev-customer-panel'
          ).length,
          decisionCards: document.querySelectorAll(
            '.erp-dev-customer-decision-card'
          ).length,
          quickActions: document.querySelectorAll(
            '.erp-dev-customer-quick-action'
          ).length,
          oldMetricCards: document.querySelectorAll('.erp-dev-customer-metric')
            .length,
          duplicateAssetValue: document.body.innerText.includes('28\\n28'),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          scrollHeight: document.documentElement.scrollHeight,
          clientHeight: document.documentElement.clientHeight,
        }))
        assert.deepEqual(
          {
            panelCount: overviewDefaultMetrics.panelCount,
            decisionCards: overviewDefaultMetrics.decisionCards,
            quickActions: overviewDefaultMetrics.quickActions,
            oldMetricCards: overviewDefaultMetrics.oldMetricCards,
            duplicateAssetValue: overviewDefaultMetrics.duplicateAssetValue,
          },
          {
            panelCount: 3,
            decisionCards: 3,
            quickActions: 3,
            oldMetricCards: 0,
            duplicateAssetValue: false,
          },
          `客户配置默认页应保持简洁预检工作台: ${JSON.stringify(overviewDefaultMetrics)}`
        )
        assert(
          overviewDefaultMetrics.scrollHeight <=
            overviewDefaultMetrics.clientHeight + 1,
          `桌面客户配置默认页不应被摘要卡撑出首屏: ${JSON.stringify(overviewDefaultMetrics)}`
        )
        assert(
          overviewDefaultMetrics.scrollWidth <=
            overviewDefaultMetrics.clientWidth + 1,
          `桌面客户配置默认页不应横向溢出: ${JSON.stringify(overviewDefaultMetrics)}`
        )
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
          .locator('.erp-dev-customer-quick-action')
          .filter({ hasText: '看预检' })
          .click()
        await expectText(page, '包边界 / Package Guards')
        await expectText(page, '运行时启用')
        await expectText(page, '预检步骤 / Preflight Gates')
        await expectText(page, '导入资产范围 / Import Asset Scope')
        await expectText(page, '客户包对象 / Package Objects')
        await expectText(page, '策略与扩展点登记')
        await expectText(page, '模块状态投影 / Module States')
        await expectText(page, '模块状态只编译为客户配置控制面输入')
        await expectText(page, '默认登记模块会按启用编译')
        await expectText(page, '人工评审清单 / Review Checklist')
        await expectText(page, '校验结果 / Validation Checks')
        await expectText(page, '工作流预览')
        await expectText(page, '销售订单审批')
        await expectText(page, '仅预览')
        await expectText(page, '只做协同流转')
        await expectText(page, '预检命令')
        await expectText(page, '生成预检报告')
        await expectText(page, '来源路径')
        const moduleStateMetrics = await page.evaluate(() => {
          const panel = document.querySelector(
            '.erp-dev-customer-panel--module-states'
          )
          const items = panel
            ? [...panel.querySelectorAll('.erp-dev-customer-tool')]
            : []
          return {
            itemCount: items.length,
            hasCatalogDefaultCopy:
              panel?.textContent?.includes('默认登记模块会按启用编译') || false,
            hasInstallCopy:
              panel?.textContent?.includes('不安装或卸载模块') || false,
            hasShipmentModuleLabel: items.some((item) =>
              item.textContent?.includes('出货单')
            ),
            hasRawShipmentModuleKey: items.some((item) =>
              item.textContent?.includes('shipments')
            ),
            enabledTags: items.filter((item) =>
              item.textContent?.includes('启用')
            ).length,
            panelWidth: panel?.getBoundingClientRect().width || 0,
            viewportWidth: window.innerWidth,
          }
        })
        assert.deepEqual(
          {
            itemCount: moduleStateMetrics.itemCount,
            hasCatalogDefaultCopy: moduleStateMetrics.hasCatalogDefaultCopy,
            hasInstallCopy: moduleStateMetrics.hasInstallCopy,
            hasShipmentModuleLabel: moduleStateMetrics.hasShipmentModuleLabel,
            hasRawShipmentModuleKey: moduleStateMetrics.hasRawShipmentModuleKey,
            enabledTags: moduleStateMetrics.enabledTags,
          },
          {
            itemCount: 15,
            hasCatalogDefaultCopy: true,
            hasInstallCopy: true,
            hasShipmentModuleLabel: true,
            hasRawShipmentModuleKey: false,
            enabledTags: 15,
          },
          `客户配置控制台应展示 15 个模块状态预览项且不直出 raw module key: ${JSON.stringify(moduleStateMetrics)}`
        )
        assert(
          moduleStateMetrics.panelWidth <= moduleStateMetrics.viewportWidth,
          `模块状态预览区不应横向溢出视口: ${JSON.stringify(moduleStateMetrics)}`
        )
        const printDefaultMetrics = await page.evaluate(() => {
          const panel = document.querySelector(
            '.erp-dev-customer-panel--print-template-defaults'
          )
          const text = panel?.textContent || ''

          return {
            hasPanel: Boolean(panel),
            hasReadableAnchor: text.includes('默认方字段已登记'),
            hasRawDefaultKey:
              /\bbuyerCompany\b|\bbuyerContact\b|\bbuyerPhone\b|\bbuyerAddress\b|\bbuyerSigner\b/u.test(
                text
              ),
            panelWidth: panel?.getBoundingClientRect().width || 0,
            viewportWidth: window.innerWidth,
          }
        })
        assert.deepEqual(
          {
            hasPanel: printDefaultMetrics.hasPanel,
            hasReadableAnchor: printDefaultMetrics.hasReadableAnchor,
            hasRawDefaultKey: printDefaultMetrics.hasRawDefaultKey,
          },
          {
            hasPanel: true,
            hasReadableAnchor: true,
            hasRawDefaultKey: false,
          },
          `打印默认方信息面板不应展示默认字段 raw key: ${JSON.stringify(
            printDefaultMetrics
          )}`
        )
        assert(
          printDefaultMetrics.panelWidth <= printDefaultMetrics.viewportWidth,
          `打印默认方信息面板不应横向溢出: ${JSON.stringify(
            printDefaultMetrics
          )}`
        )

        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '差异预览 / Diff' })
          .click()
        await expectText(page, '差异对比 / Diff Preview')
        await expectText(page, '版本门禁 / Version Gates')
        await expectText(page, '当前不可正式导入')

        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '菜单字段 / Assets' })
          .click()
        await expectText(page, '客户编码')
        await expectText(page, '东莞市永绅玩具有限公司')
        await expectText(page, '打印模板字段 / Print Template Fields')
        await expectText(page, '当前只展示采购合同和加工合同字段真源')
        await expectText(page, '销售订单受理当前未接打印模板')
        await expectText(page, '采购合同')
        await expectText(page, '加工合同')
        await expectText(page, '字段真源')
        const printTemplateMetrics = await page.evaluate(() => {
          const panel = document.querySelector(
            '.erp-dev-customer-panel--print-templates'
          )
          const items = panel
            ? [...panel.querySelectorAll('.erp-dev-customer-tool')]
            : []

          return {
            itemCount: items.length,
            hasSalesOrderBoundary:
              panel?.textContent?.includes('销售订单受理当前未接打印模板') ||
              false,
            hasCustomerCoreBoundary:
              panel?.textContent?.includes('不进入产品核心表单') || false,
            hasPurchaseTruth: items.some((item) =>
              item.textContent?.includes('采购订单号')
            ),
            hasProcessingTruth: items.some((item) =>
              item.textContent?.includes('委托加工')
            ),
            hasRawTemplateKey:
              panel?.textContent?.includes('material-purchase-contract') ||
              panel?.textContent?.includes('processing-contract') ||
              false,
            panelWidth: panel?.getBoundingClientRect().width || 0,
            viewportWidth: window.innerWidth,
          }
        })
        assert.deepEqual(
          {
            itemCount: printTemplateMetrics.itemCount,
            hasSalesOrderBoundary: printTemplateMetrics.hasSalesOrderBoundary,
            hasCustomerCoreBoundary:
              printTemplateMetrics.hasCustomerCoreBoundary,
            hasPurchaseTruth: printTemplateMetrics.hasPurchaseTruth,
            hasProcessingTruth: printTemplateMetrics.hasProcessingTruth,
            hasRawTemplateKey: printTemplateMetrics.hasRawTemplateKey,
          },
          {
            itemCount: 2,
            hasSalesOrderBoundary: true,
            hasCustomerCoreBoundary: true,
            hasPurchaseTruth: true,
            hasProcessingTruth: true,
            hasRawTemplateKey: false,
          },
          `打印模板字段面板应只读展示正式模板字段真源: ${JSON.stringify(
            printTemplateMetrics
          )}`
        )
        assert(
          printTemplateMetrics.panelWidth <= printTemplateMetrics.viewportWidth,
          `打印模板字段面板不应横向溢出: ${JSON.stringify(
            printTemplateMetrics
          )}`
        )

        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '导入工作台 / Import' })
          .click()
        await expectText(page, '导入工作台 / Import Workbench')
        await expectText(page, '可视化导入流程 / Visual Import Flow')
        await expectText(page, '本地/测试后端应用只写客户配置控制面')
        await expectText(page, '本地/测试后端应用 / Local Or Test Apply')
        await expectText(page, '应用到当前后端')
        await expectText(page, '校验 / 发布 / 激活 / 有效配置投影')
        await expectText(page, '写库目标 / Database Target')
        await expectText(page, '当前后端（本地或显式测试环境）ERP 应用数据库')
        await expectText(page, '目标环境 ERP 应用数据库')
        await expectText(
          page,
          '客户配置版本、模块状态、角色画像、授权、责任池和审计记录'
        )
        await expectText(page, '客户配置投影')
        await expectText(page, '真实客户业务数据')
        await expectText(page, '业务数据导入')
        await expectText(page, '不执行')
        await expectText(page, '不写业务数据')
        await expectText(page, '测试版页面试跑')
        await expectText(page, '尚未运行测试试跑')
        await expectText(page, '正式版发布 / Release Apply')
        await expectText(page, '正式版必须先过发布门禁')
        await expectText(page, '检查发布门禁')
        await expectText(page, '发布到正式版')
        await expectText(page, '尚未检查发布门禁')
        await expectText(page, '客户配置回滚就绪检查')
        await expectText(page, '--require-rollback')
        await expectText(page, '客户配置回滚输入模板')
        await expectText(page, '--print-input-template')
        const importWorkbenchMetrics = await page.evaluate(() => ({
          stepCount: document.querySelectorAll('.erp-dev-customer-import-step')
            .length,
          dbTargetCount: document.querySelectorAll(
            '.erp-dev-customer-db-target'
          ).length,
          formalGateCount: document.querySelectorAll(
            '.erp-dev-customer-formal-gate'
          ).length,
          testApplyButtons: [...document.querySelectorAll('button')].filter(
            (button) => /应用到当前后端/.test(button.textContent || '')
          ).length,
          releaseCheckButtons: [...document.querySelectorAll('button')].filter(
            (button) => /检查发布门禁/.test(button.textContent || '')
          ).length,
          releaseApplyButtons: [...document.querySelectorAll('button')].filter(
            (button) => /发布到正式版/.test(button.textContent || '')
          ).length,
          disabledReleaseApplyButtons: [
            ...document.querySelectorAll('button'),
          ].filter(
            (button) =>
              /发布到正式版/.test(button.textContent || '') && button.disabled
          ).length,
          rawFormalImportButtons: [
            ...document.querySelectorAll('button'),
          ].filter((button) =>
            /正式导入|直接写库|上传客户包/.test(button.textContent || '')
          ).length,
        }))
        assert.deepEqual(
          importWorkbenchMetrics,
          {
            stepCount: 6,
            dbTargetCount: 5,
            formalGateCount: 11,
            testApplyButtons: 1,
            releaseCheckButtons: 1,
            releaseApplyButtons: 1,
            disabledReleaseApplyButtons: 1,
            rawFormalImportButtons: 0,
          },
          `导入工作台应提供测试版和发布版控件，并在门禁前禁用正式发布执行: ${JSON.stringify(importWorkbenchMetrics)}`
        )
        await page.getByRole('button', { name: '运行测试试跑' }).click()
        await expectText(page, '试跑已生成')
        await expectText(page, '重新运行试跑')
        await expectText(page, '复制输出目录')
        await expectText(page, '复制报告路径')
        await expectText(page, '查看报告摘要')
        await expectText(page, 'output/customers/yoyoosun/ui-import-dry-run')
        await expectText(page, '正式导入')
        await expectText(page, '不可执行')
        await page.getByRole('button', { name: '查看报告摘要' }).click()
        await expectText(page, '试跑报告摘要')
        await expectText(page, '正式导入：不可执行')
        await expectText(page, '只生成证据，不写业务数据库')
        const dryRunResultMetrics = await page.evaluate(() => {
          const metricCards = [
            ...document.querySelectorAll(
              '.erp-dev-customer-dry-run-metrics > div'
            ),
          ]
          const actionButtons = [
            ...document.querySelectorAll(
              '.erp-dev-customer-dry-run-actions button'
            ),
          ].map((button) => button.textContent.replace(/\s+/g, ' ').trim())
          const pathPanel = document.querySelector(
            '.erp-dev-customer-dry-run-paths'
          )
          const reportPanel = document.querySelector(
            '.erp-dev-customer-dry-run-report'
          )
          return {
            metricCardCount: metricCards.length,
            actionButtons,
            metricBackgrounds: metricCards.map(
              (card) => getComputedStyle(card).backgroundColor
            ),
            pathBackground: pathPanel
              ? getComputedStyle(pathPanel).backgroundColor
              : '',
            reportBackground: reportPanel
              ? getComputedStyle(reportPanel).backgroundColor
              : '',
            reportColor: reportPanel ? getComputedStyle(reportPanel).color : '',
          }
        })
        assert.deepEqual(
          {
            metricCardCount: dryRunResultMetrics.metricCardCount,
            actionButtons: dryRunResultMetrics.actionButtons,
          },
          {
            metricCardCount: 4,
            actionButtons: [
              '重新运行试跑',
              '复制输出目录',
              '复制报告路径',
              '收起报告摘要',
            ],
          },
          `试跑结果区应提供后续操作组，而不是只有单个测试按钮: ${JSON.stringify(dryRunResultMetrics)}`
        )
        assert(
          dryRunResultMetrics.metricBackgrounds.every(
            (color) =>
              color !== 'rgb(248, 251, 248)' && color !== 'rgb(255, 255, 255)'
          ) &&
            dryRunResultMetrics.pathBackground !== 'rgb(248, 251, 248)' &&
            dryRunResultMetrics.reportBackground !== 'rgb(255, 255, 255)' &&
            dryRunResultMetrics.reportColor !== 'rgb(255, 255, 255)',
          `暗色试跑结果卡不能退回白底浅字: ${JSON.stringify(dryRunResultMetrics)}`
        )
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
        await expectHeading(
          page,
          '客户配置包导入控制台 / Package Import Console'
        )
        await expectText(page, '未登记客户配置包')
        await expectText(page, 'missing-customer')
        await expectText(page, '已登记客户包 / Registered Packages')
        await expectText(page, '永绅 yoyoosun')
        await assertTextAbsent(page, '东莞市永绅玩具有限公司')

        await page.locator('.erp-dev-customer-selector .ant-select').click()
        await page
          .locator('.ant-select-dropdown .ant-select-item-option-content')
          .getByText('永绅 yoyoosun', { exact: true })
          .click()
        const switchedUrl = new URL(page.url())
        assert.equal(switchedUrl.pathname, '/__dev/customer-config')
        assert.equal(switchedUrl.searchParams.get('customer'), 'yoyoosun')
        assert(!switchedUrl.pathname.startsWith('/erp'))
        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '菜单字段 / Assets' })
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
        await expectHeading(
          page,
          '客户配置包导入控制台 / Package Import Console'
        )
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
        await expectHeading(
          page,
          '客户配置包导入控制台 / Package Import Console'
        )
        await expectText(page, '决策卡 / Decision Cards')
        const overviewMetrics = await page.evaluate(() => {
          const decisionGrid = document.querySelector(
            '.erp-dev-customer-decision-grid'
          )
          const decisionStyle = decisionGrid
            ? getComputedStyle(decisionGrid)
            : null
          return {
            decisionColumns: decisionStyle?.gridTemplateColumns || '',
            panelCount: document.querySelectorAll(
              '.erp-dev-customer-overview > .erp-dev-customer-panel'
            ).length,
            oldMetricCards: document.querySelectorAll(
              '.erp-dev-customer-metric'
            ).length,
            duplicateAssetValue: document.body.innerText.includes('28\\n28'),
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          overviewMetrics.decisionColumns &&
            !overviewMetrics.decisionColumns.includes('repeat') &&
            overviewMetrics.decisionColumns.split(' ').length <= 1,
          `移动端决策卡应退成单列: ${JSON.stringify(overviewMetrics)}`
        )
        assert.equal(
          overviewMetrics.panelCount,
          3,
          `移动端默认页只保留结论、决策卡和下一步: ${JSON.stringify(overviewMetrics)}`
        )
        assert.equal(
          overviewMetrics.oldMetricCards,
          0,
          `移动端默认页不应保留旧指标卡: ${JSON.stringify(overviewMetrics)}`
        )
        assert.equal(
          overviewMetrics.duplicateAssetValue,
          false,
          `移动端不应重复渲染资产数值: ${JSON.stringify(overviewMetrics)}`
        )
        await page
          .locator('.erp-dev-customer-view-switch .ant-segmented-item')
          .filter({ hasText: '菜单字段 / Assets' })
          .click()
        await expectText(page, '菜单分组 / Menu Groups')
        await expectText(page, '字段显示候选 / Field Candidates')
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
      path: '/__dev/',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '开发导航 / Dev Navigation')
        await expectText(page, '项目治理地图 / Governance Map')
        await expectText(page, '开发文档 / Dev Docs')
        await expectText(page, '测试入口 / Test Entry')
        await expectText(page, '产品原型 / Prototypes')
        await expectText(page, '能力台账 / Capability Ledger')
        await expectText(page, '客户配置包导入 / Package Import')
        await expectText(page, '本地 dev-only 入口')
        const defaultMetrics = await page.evaluate(() => ({
          path: location.pathname,
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          pinButtonCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card__pin'
          ).length,
          firstHref: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('href'),
          firstLinkText: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.textContent?.trim(),
          hasGovernanceBanner: Boolean(
            document.querySelector('.erp-dev-hub-governance')
          ),
          hasEmptyPinned: Boolean(
            document.querySelector('.erp-dev-hub-pinned__empty')
          ),
          faviconHref: document
            .querySelector('link[rel~="icon"]')
            ?.getAttribute('href'),
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.equal(
          defaultMetrics.path,
          '/__dev/',
          `开发导航应兼容尾斜杠路径: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.faviconHref,
          '/favicon-dev.svg',
          `开发导航 favicon 异常: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.cardCount,
          6,
          `开发导航应渲染 6 个入口: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.pinButtonCount,
          6,
          `开发导航应为每个入口提供置顶按钮: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.firstHref?.startsWith('/__dev/'),
          `开发导航卡片链接应指向 /__dev 子路径: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.firstLinkText,
          '进入',
          `开发导航卡片应提供清晰进入动作: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.hasGovernanceBanner,
          false,
          `开发导航不应再用规则说明挤占首屏: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.hasEmptyPinned,
          false,
          `开发导航无置顶时不应显示空态说明: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.scrollWidth <= defaultMetrics.clientWidth + 1,
          `开发导航默认态不应横向溢出: ${JSON.stringify(defaultMetrics)}`
        )

        await page.evaluate(() => {
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
        await expectText(page, '置顶 / Pinned')
        const pinnedMetrics = await page.evaluate(() => ({
          pinnedCount: document.querySelectorAll(
            '.erp-dev-hub-pinned .erp-dev-hub-card'
          ).length,
          pinnedHrefs: Array.from(
            document.querySelectorAll(
              '.erp-dev-hub-pinned .erp-dev-hub-card__link'
            )
          ).map((link) => link.getAttribute('href')),
          hasRecentSection: Boolean(
            document.querySelector('.erp-dev-hub-recent')
          ),
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        }))
        assert.deepEqual(
          pinnedMetrics,
          {
            pinnedCount: 2,
            pinnedHrefs: ['/__dev/customer-config', '/__dev/prototypes'],
            hasRecentSection: false,
            overflow: false,
          },
          `开发导航应只在已有置顶时显示置顶区并移除最近访问区: ${JSON.stringify(pinnedMetrics)}`
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
          `开发导航置顶入口应写入本地偏好并移动到首位: ${JSON.stringify(pinnedAfterClick)}`
        )

        await page
          .locator('.erp-dev-hub-group-filter .ant-select-selector')
          .click()
        await page
          .locator(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
          )
          .filter({ hasText: '产品治理 / Product Governance' })
          .click()
        await expectText(page, '1 / 6')
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
          `开发导航分组筛选应只保留能力台账: ${JSON.stringify(groupMetrics)}`
        )

        await page
          .locator('.erp-dev-hub-group-filter .ant-select-selector')
          .click()
        await page
          .locator(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
          )
          .filter({ hasText: '全部 / All' })
          .click()
        await page.getByPlaceholder('搜索入口或路径').fill('测试')
        await expectText(page, '1 / 6')
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
      name: 'dev-all-pages-mobile',
      path: '/__dev/',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        const devPages = [
          {
            path: '/__dev/',
            heading: '开发导航 / Dev Navigation',
            rootSelector: '.erp-dev-hub-page',
          },
          {
            path: '/__dev/governance',
            heading: '项目治理地图 / Governance Map',
            rootSelector: '.erp-dev-governance-page',
          },
          {
            path: '/__dev/docs',
            heading: '开发文档查看器 / Dev Docs Viewer',
            rootSelector: '.erp-dev-docs-page',
          },
          {
            path: '/__dev/testing',
            heading: '开发测试入口 / Dev Test Entry',
            rootSelector: '.erp-dev-testing-page',
          },
          {
            path: '/__dev/prototypes',
            heading: '产品原型与样板查看器 / Prototype Viewer',
            rootSelector: '.erp-dev-prototypes-page',
          },
          {
            path: '/__dev/capability-ledger',
            heading: '能力台账可视化 / Capability Ledger',
            rootSelector: '.erp-dev-capability-page',
          },
          {
            path: '/__dev/customer-config?customer=yoyoosun',
            heading: '客户配置包导入控制台 / Package Import Console',
            rootSelector: '.erp-dev-customer-page',
          },
        ]

        for (const devPage of devPages) {
          await gotoScenarioPath(page, devPage.path, {
            waitUntil: 'domcontentloaded',
          })
          await expectHeading(page, devPage.heading)
          await assertNoHorizontalOverflow(
            page,
            `dev-all-pages-mobile:${devPage.path}`
          )

          const metrics = await page.evaluate((rootSelector) => {
            const root = document.querySelector(rootSelector)
            const rootRect = root?.getBoundingClientRect()
            const toolbar = document.querySelector('.erp-dev-hub-toolbar')
            const groupFilter = document.querySelector(
              '.erp-dev-hub-group-filter'
            )
            const header = root?.querySelector(
              [
                '.erp-dev-hub-header',
                '.erp-dev-governance-header',
                '.erp-dev-docs-header',
                '.erp-dev-testing-header',
                '.erp-dev-prototypes-header',
                '.erp-dev-capability-header',
                '.erp-dev-customer-header',
              ].join(', ')
            )
            const shell = root?.querySelector(
              [
                '.erp-dev-hub-shell',
                '.erp-dev-governance-shell',
                '.erp-dev-docs-shell',
                '.erp-dev-testing-shell',
                '.erp-dev-prototypes-shell',
                '.erp-dev-capability-shell',
                '.erp-dev-customer-shell',
              ].join(', ')
            )
            return {
              rootExists: Boolean(root),
              rootWidth: Math.round(rootRect?.width || 0),
              clientWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              headerHeight: Math.round(
                header?.getBoundingClientRect().height || 0
              ),
              shellTop: Math.round(shell?.getBoundingClientRect().top || 0),
              toolbarHeight: Math.round(
                toolbar?.getBoundingClientRect().height || 0
              ),
              groupFilterHeight: Math.round(
                groupFilter?.getBoundingClientRect().height || 0
              ),
            }
          }, devPage.rootSelector)

          assert.equal(
            metrics.rootExists,
            true,
            `开发页根节点缺失: ${devPage.path} ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.rootWidth <= metrics.clientWidth + 1,
            `开发页根节点不应宽于视口: ${devPage.path} ${JSON.stringify(metrics)}`
          )
          if (devPage.path === '/__dev/') {
            assert(
              metrics.toolbarHeight > 0 && metrics.toolbarHeight <= 140,
              `开发导航移动端筛选区不应挤占首屏: ${JSON.stringify(metrics)}`
            )
            assert(
              metrics.groupFilterHeight > 0 && metrics.groupFilterHeight <= 42,
              `开发导航分组筛选应收敛为单行控件: ${JSON.stringify(metrics)}`
            )
          }
        }
      },
    },
    {
      name: 'dev-ui-semantics-desktop',
      path: '/__dev/',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const transparentColors = new Set(['rgba(0, 0, 0, 0)', 'transparent'])
        const readSurfaceStyle = async (selector) =>
          page.evaluate((targetSelector) => {
            const node = document.querySelector(targetSelector)
            const style = node ? getComputedStyle(node) : null
            return {
              exists: Boolean(node),
              cursor: style?.cursor || '',
              backgroundColor: style?.backgroundColor || '',
              borderColor: style?.borderColor || '',
              borderStyle: style?.borderStyle || '',
              boxShadow: style?.boxShadow || '',
              text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
            }
          }, selector)

        await expectHeading(page, '开发导航 / Dev Navigation')
        const hubCard = await readSurfaceStyle('.erp-dev-hub-card')
        const hubAction = await readSurfaceStyle('.erp-dev-hub-card__link')
        const hubPin = await readSurfaceStyle('.erp-dev-hub-card__pin')
        assert.equal(
          hubCard.cursor,
          'auto',
          `开发导航入口卡片本体应是阅读容器，主操作由进入按钮承担: ${JSON.stringify(hubCard)}`
        )
        assert.equal(
          hubAction.cursor,
          'pointer',
          `开发导航进入动作应是明确可点击控件: ${JSON.stringify(hubAction)}`
        )
        assert(
          !transparentColors.has(hubAction.backgroundColor) &&
            hubAction.borderStyle !== 'none',
          `开发导航进入动作不能退回普通文字链接: ${JSON.stringify(hubAction)}`
        )
        assert.equal(
          hubPin.cursor,
          'pointer',
          `开发导航置顶图标仍应是次级操作按钮: ${JSON.stringify(hubPin)}`
        )

        await gotoScenarioPath(page, '/__dev/governance', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '项目治理地图 / Governance Map')
        const governanceNav = await readSurfaceStyle(
          '.erp-dev-governance-axis-nav__item'
        )
        const governanceTask = await readSurfaceStyle(
          '.erp-dev-governance-task'
        )
        assert.equal(
          governanceNav.cursor,
          'pointer',
          `治理维度列表项应明确是可选择导航: ${JSON.stringify(governanceNav)}`
        )
        assert(
          governanceNav.boxShadow !== 'none',
          `治理维度列表项需要 action 识别线: ${JSON.stringify(governanceNav)}`
        )
        assert.equal(
          governanceTask.cursor,
          'auto',
          `治理任务卡应保持只读摘要语义: ${JSON.stringify(governanceTask)}`
        )

        await gotoScenarioPath(page, '/__dev/testing', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '开发测试入口 / Dev Test Entry')
        const testingDoc = await readSurfaceStyle('.erp-dev-testing-doc-row')
        const testingPreset = await readSurfaceStyle('.erp-dev-testing-preset')
        assert.equal(
          testingDoc.cursor,
          'pointer',
          `测试文档行应明确是可选择入口: ${JSON.stringify(testingDoc)}`
        )
        assert.equal(
          testingPreset.cursor,
          'pointer',
          `测试预设应明确是复制命令入口: ${JSON.stringify(testingPreset)}`
        )
        assert(
          testingPreset.boxShadow !== 'none',
          `测试预设需要 action 识别线: ${JSON.stringify(testingPreset)}`
        )

        await gotoScenarioPath(page, '/__dev/prototypes', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')
        const prototypeCard = await readSurfaceStyle('.erp-dev-prototypes-card')
        const prototypeCardBody = await readSurfaceStyle(
          '.erp-dev-prototypes-card__body'
        )
        const prototypePin = await readSurfaceStyle(
          '.erp-dev-prototypes-card__pin'
        )
        assert(
          prototypeCard.boxShadow !== 'none',
          `原型资产卡需要 action 识别线，避免像普通说明块: ${JSON.stringify(prototypeCard)}`
        )
        assert.equal(
          prototypeCardBody.cursor,
          'pointer',
          `原型资产正文区应明确可选择: ${JSON.stringify(prototypeCardBody)}`
        )
        assert.equal(
          prototypePin.cursor,
          'pointer',
          `原型置顶图标应保持次级操作语义: ${JSON.stringify(prototypePin)}`
        )

        await gotoScenarioPath(
          page,
          '/__dev/customer-config?customer=yoyoosun',
          {
            waitUntil: 'domcontentloaded',
          }
        )
        await expectHeading(
          page,
          '客户配置包导入控制台 / Package Import Console'
        )
        const customerDecision = await readSurfaceStyle(
          '.erp-dev-customer-decision-card'
        )
        const customerQuickAction = await readSurfaceStyle(
          '.erp-dev-customer-quick-action'
        )
        assert.notEqual(
          customerDecision.cursor,
          'pointer',
          `客户配置决策卡应保持只读摘要语义: ${JSON.stringify(customerDecision)}`
        )
        assert.equal(
          customerQuickAction.cursor,
          'pointer',
          `客户配置下一步卡应明确是操作入口: ${JSON.stringify(customerQuickAction)}`
        )
        assert.notEqual(
          customerDecision.backgroundColor,
          customerQuickAction.backgroundColor,
          `客户配置摘要卡和操作入口不能使用同一视觉语义: ${JSON.stringify({
            customerDecision,
            customerQuickAction,
          })}`
        )
      },
    },
    {
      name: 'dev-switch-controls-dark-desktop',
      path: '/__dev/customer-config?customer=yoyoosun',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        const transparentColors = new Set(['rgba(0, 0, 0, 0)', 'transparent'])
        const readControlGroup = async (rootSelector, itemSelector) =>
          page.evaluate(
            ({ rootSelector: rootQuery, itemSelector: itemQuery }) => {
              const root = document.querySelector(rootQuery)
              const items = root ? [...root.querySelectorAll(itemQuery)] : []
              const selected =
                items.find(
                  (item) =>
                    item.classList.contains('ant-segmented-item-selected') ||
                    [...item.classList].some((className) =>
                      className.endsWith('__item--active')
                    )
                ) || items[0]
              const inactive = items.find((item) => item !== selected)
              const styleOf = (node) => {
                const style = node ? getComputedStyle(node) : null
                const rect = node?.getBoundingClientRect()
                return {
                  exists: Boolean(node),
                  cursor: style?.cursor || '',
                  backgroundColor: style?.backgroundColor || '',
                  borderColor: style?.borderColor || '',
                  borderStyle: style?.borderStyle || '',
                  boxShadow: style?.boxShadow || '',
                  width: rect?.width || 0,
                  height: rect?.height || 0,
                  text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
                }
              }
              return {
                rootExists: Boolean(root),
                itemCount: items.length,
                selected: styleOf(selected),
                inactive: styleOf(inactive),
              }
            },
            { rootSelector, itemSelector }
          )
        const assertButtonGroup = (name, metrics) => {
          assert(
            metrics.rootExists && metrics.itemCount >= 2,
            `${name} 应渲染为多个可选控件: ${JSON.stringify(metrics)}`
          )
          assert.equal(
            metrics.inactive.cursor,
            'pointer',
            `${name} 未选中项不能像普通描述文字: ${JSON.stringify(metrics)}`
          )
          assert(
            !transparentColors.has(metrics.inactive.backgroundColor) &&
              metrics.inactive.borderStyle === 'solid' &&
              metrics.inactive.width > 0 &&
              metrics.inactive.height >= 30,
            `${name} 未选中项需要稳定按钮盒模型: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.selected.backgroundColor !==
              metrics.inactive.backgroundColor ||
              metrics.selected.borderColor !== metrics.inactive.borderColor ||
              metrics.selected.boxShadow !== metrics.inactive.boxShadow,
            `${name} 选中态和未选中态必须可区分: ${JSON.stringify(metrics)}`
          )
        }

        await expectHeading(
          page,
          '客户配置包导入控制台 / Package Import Console'
        )
        assertButtonGroup(
          '客户配置视图切换',
          await readControlGroup(
            '.erp-dev-customer-view-switch',
            '.ant-segmented-item'
          )
        )

        await gotoScenarioPath(page, '/__dev/capability-ledger', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '能力台账可视化 / Capability Ledger')
        assertButtonGroup(
          '能力台账视图切换',
          await readControlGroup(
            '.erp-dev-capability-view-switch',
            '.ant-segmented-item'
          )
        )

        await gotoScenarioPath(page, '/__dev/testing', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '开发测试入口 / Dev Test Entry')
        assertButtonGroup(
          '测试文档筛选',
          await readControlGroup(
            '.erp-dev-testing-filter',
            '.erp-dev-testing-filter__item'
          )
        )
        assertButtonGroup(
          '测试阅读器视图切换',
          await readControlGroup(
            '.erp-dev-testing-reader__toolbar .ant-segmented',
            '.ant-segmented-item'
          )
        )

        await gotoScenarioPath(page, '/__dev/prototypes', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')
        assertButtonGroup(
          '原型筛选',
          await readControlGroup(
            '.erp-dev-prototypes-filter',
            '.erp-dev-prototypes-filter__item'
          )
        )
      },
    },
    {
      name: 'dev-governance-dark-desktop',
      path: '/__dev/governance',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '项目治理地图 / Governance Map')
        await expectText(page, 'docs/项目治理地图.md')
        await expectText(page, '相关任务分流 / Related Task Routing')
        await expectText(page, '项目治理分流图 / Governance Routing')
        await page
          .locator(
            '.erp-markdown-mermaid[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas > svg'
          )
          .waitFor({ state: 'visible', timeout: 12000 })

        const defaultMetrics = await page.evaluate(() => {
          const root = document.querySelector('.erp-dev-governance-page')
          const activeAxis = document.querySelector(
            '.erp-dev-governance-axis-nav__item--active'
          )
          const firstDocLink = document.querySelector(
            '.erp-dev-governance-link a'
          )
          const mermaid = document.querySelector(
            '.erp-markdown-mermaid[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas > svg'
          )
          const toolbar = document.querySelector(
            '.erp-dev-governance-mermaid .erp-markdown-mermaid__toolbar'
          )
          const tools = [
            ...document.querySelectorAll(
              '.erp-dev-governance-mermaid .erp-markdown-mermaid__tool'
            ),
          ]
          const label = document.querySelector(
            '.erp-dev-governance-mermaid [data-mermaid-zoom-label]'
          )
          const rootRect = root?.getBoundingClientRect()
          const mermaidRect = mermaid?.getBoundingClientRect()
          const toolbarStyle = toolbar ? getComputedStyle(toolbar) : null
          const toolRects = tools.map((tool) => tool.getBoundingClientRect())
          return {
            hasRoot: Boolean(root),
            faviconHref:
              document
                .querySelector('link[rel~="icon"]')
                ?.getAttribute('href') || '',
            axisCount: document.querySelectorAll(
              '.erp-dev-governance-axis-nav__item'
            ).length,
            taskCount: document.querySelectorAll('.erp-dev-governance-task')
              .length,
            taskScopeText:
              document.querySelector('.erp-dev-governance-task-scope')
                ?.textContent || '',
            activeAxisText: activeAxis?.textContent || '',
            firstDocHref: firstDocLink?.getAttribute('href') || '',
            mermaidRendered: Boolean(mermaid),
            mermaidWidth: mermaidRect?.width || 0,
            mermaidHeight: mermaidRect?.height || 0,
            mermaidActions: [
              ...document.querySelectorAll(
                '.erp-dev-governance-mermaid [data-mermaid-zoom-action]'
              ),
            ].map((node) => node.getAttribute('data-mermaid-zoom-action')),
            mermaidFullscreenOpenCount: document.querySelectorAll(
              '.erp-dev-governance-mermaid [data-mermaid-fullscreen-action="open"]'
            ).length,
            mermaidToolbarDisplay: toolbarStyle?.display || '',
            mermaidToolbarGap: toolbarStyle?.gap || '',
            mermaidToolWidths: toolRects.map((rect) => Math.round(rect.width)),
            mermaidToolHeights: toolRects.map((rect) =>
              Math.round(rect.height)
            ),
            mermaidZoomLabel: label?.textContent?.trim() || '',
            rootHeight: rootRect?.height || 0,
            overflow:
              document.documentElement.scrollWidth >
              document.documentElement.clientWidth + 1,
          }
        })
        assert.equal(
          defaultMetrics.hasRoot,
          true,
          `项目治理地图页面根节点缺失: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.faviconHref,
          '/favicon-governance.svg',
          `项目治理地图 favicon 异常: ${JSON.stringify(defaultMetrics)}`
        )
        assert.ok(
          defaultMetrics.axisCount >= 10,
          `项目治理地图应展示治理维度与口径导航: ${JSON.stringify(defaultMetrics)}`
        )
        assert.ok(
          defaultMetrics.taskCount >= 1 && defaultMetrics.taskCount < 6,
          `项目治理地图默认应展示当前治理维度与口径相关任务: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.match(
          defaultMetrics.taskScopeText,
          /当前治理维度与口径.*查看全部/s,
          `项目治理地图任务分流默认应优先展示当前维度相关项: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.match(
          defaultMetrics.activeAxisText,
          /当前真源/,
          `项目治理地图默认应选中第一条治理维度与口径: ${JSON.stringify(defaultMetrics)}`
        )
        assert.match(
          defaultMetrics.firstDocHref,
          /^\/__dev\/docs\?path=/,
          `项目治理地图文档链接应跳到 dev docs viewer: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.mermaidRendered,
          true,
          `项目治理地图 Mermaid 应渲染为 SVG: ${JSON.stringify(defaultMetrics)}`
        )
        assert.ok(
          defaultMetrics.mermaidWidth > 240 &&
            defaultMetrics.mermaidHeight > 120,
          `项目治理地图 Mermaid 尺寸异常: ${JSON.stringify(defaultMetrics)}`
        )
        assert.deepEqual(
          defaultMetrics.mermaidActions,
          ['fit', 'zoom-out', 'zoom-in', 'reset'],
          `项目治理地图 Mermaid 应复用 docs 页缩放工具条: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.equal(
          defaultMetrics.mermaidFullscreenOpenCount,
          1,
          `项目治理地图 Mermaid 应提供唯一全屏入口: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.equal(
          defaultMetrics.mermaidToolbarDisplay,
          'flex',
          `项目治理地图 Mermaid 工具条应使用 docs 页 flex 布局: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.ok(
          defaultMetrics.mermaidToolWidths.every((width) => width >= 30) &&
            defaultMetrics.mermaidToolHeights.every((height) => height >= 30),
          `项目治理地图 Mermaid 工具按钮不应挤成裸图标: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.equal(
          defaultMetrics.mermaidZoomLabel,
          '100%',
          `项目治理地图 Mermaid 初始缩放标签应为 100%: ${JSON.stringify(
            defaultMetrics
          )}`
        )
        assert.equal(
          defaultMetrics.overflow,
          false,
          `项目治理地图默认态不应横向溢出: ${JSON.stringify(defaultMetrics)}`
        )

        await page
          .locator(
            '.erp-dev-governance-mermaid [data-mermaid-zoom-action="zoom-in"]'
          )
          .click()
        const zoomInMetrics = await page.evaluate(() => {
          const canvas = document.querySelector(
            '.erp-dev-governance-mermaid .erp-markdown-mermaid__canvas'
          )
          return {
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            label:
              document
                .querySelector(
                  '.erp-dev-governance-mermaid [data-mermaid-zoom-label]'
                )
                ?.textContent?.trim() || '',
          }
        })
        assert.deepEqual(
          zoomInMetrics,
          { zoom: '120', label: '120%' },
          `项目治理地图 Mermaid 放大操作应与 docs 页一致: ${JSON.stringify(
            zoomInMetrics
          )}`
        )
        await page
          .locator(
            '.erp-dev-governance-mermaid [data-mermaid-fullscreen-action="open"]'
          )
          .click()
        const fullscreenMetrics = await page.evaluate(() => {
          const shell = document.querySelector(
            '.erp-dev-governance-mermaid .erp-markdown-mermaid'
          )
          const canvas = document.querySelector(
            '.erp-dev-governance-mermaid .erp-markdown-mermaid__canvas'
          )
          const style = shell ? getComputedStyle(shell) : null
          return {
            fullscreen: shell?.getAttribute('data-mermaid-fullscreen') || '',
            role: shell?.getAttribute('role') || '',
            ariaModal: shell?.getAttribute('aria-modal') || '',
            position: style?.position || '',
            zoom: canvas?.getAttribute('data-mermaid-zoom') || '',
            closeButtonCount: document.querySelectorAll(
              '.erp-dev-governance-mermaid [data-mermaid-fullscreen-action="close"]'
            ).length,
          }
        })
        assert.deepEqual(
          fullscreenMetrics,
          {
            fullscreen: 'true',
            role: 'dialog',
            ariaModal: 'true',
            position: 'fixed',
            zoom: '140',
            closeButtonCount: 1,
          },
          `项目治理地图 Mermaid 全屏操作应与 docs 页一致: ${JSON.stringify(
            fullscreenMetrics
          )}`
        )
        await page
          .locator(
            '.erp-dev-governance-mermaid [data-mermaid-fullscreen-action="close"]'
          )
          .click()

        await page.getByRole('button', { name: /页面设计治理/ }).click()
        await expectText(page, '页面是否简洁易用')
        await expectText(page, '当前维度：页面设计治理')
        const relatedPageTaskMetrics = await page.evaluate(() => ({
          taskCount: document.querySelectorAll('.erp-dev-governance-task')
            .length,
          taskText:
            document.querySelector('.erp-dev-governance-task')?.textContent ||
            '',
        }))
        assert.equal(
          relatedPageTaskMetrics.taskCount,
          1,
          `页面设计治理应只展示相关任务分流: ${JSON.stringify(
            relatedPageTaskMetrics
          )}`
        )
        assert.match(
          relatedPageTaskMetrics.taskText,
          /改页面、菜单、原型或信息密度/,
          `页面设计治理相关任务异常: ${JSON.stringify(relatedPageTaskMetrics)}`
        )
        await page.getByRole('button', { name: '查看全部' }).click()
        await page.getByPlaceholder('搜索任务、第一跳或同步检查').fill('部署')
        await expectText(page, '改部署、发布或低配运行口径')
        const filteredMetrics = await page.evaluate(() => ({
          taskCount: document.querySelectorAll('.erp-dev-governance-task')
            .length,
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        }))
        assert.deepEqual(
          filteredMetrics,
          { taskCount: 1, overflow: false },
          `项目治理地图任务搜索应收窄且不溢出: ${JSON.stringify(filteredMetrics)}`
        )

        await assertERPThemeMode(page, {
          scenarioName: 'dev-governance-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-governance-dark-desktop',
          selector: '.erp-dev-governance-page',
        })
        await assertNoHorizontalOverflow(page, 'dev-governance-dark-desktop')
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
            docPaths: Array.from(
              document.querySelectorAll('.erp-dev-testing-doc-row__path')
            ).map((node) => node.textContent.trim()),
            presetTexts: Array.from(
              document.querySelectorAll('.erp-dev-testing-preset')
            ).map((node) => node.textContent.replace(/\s+/g, ' ').trim()),
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
        assert.equal(
          defaultMetrics.docCount,
          8,
          `测试入口只应渲染当前白名单文档: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.docPaths.includes('scripts/README.md') &&
            defaultMetrics.docPaths.includes('web/README.md'),
          `测试入口应包含当前 QA / 前端说明: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.docPaths.every(
            (docPath) =>
              !docPath.startsWith('docs/reference/') &&
              !docPath.startsWith('docs/archive/')
          ),
          `测试入口不应把 reference/archive 作为命令来源: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.presetCount,
          19,
          `测试入口应渲染常用复制预设: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          [
            '本轮前端验证 / Frontend Check',
            'Workflow 后端动作合同 / Backend Action Contract',
            '试用角色入口 / Trial Role Entries',
            '角色菜单与入口真源 / Role Menu & Entry Contracts',
            '试用账号 RBAC / Trial Account RBAC',
            '真实登录 smoke URL 边界 / Real Login Smoke URL Guard',
            '试用模拟数据 / Trial Simulated Data',
            'MVP 本地闭环计划 / MVP Local Closure',
            '移动端 Workflow smoke / Mobile Workflow Smoke',
            '客户配置控制台 / Customer Config Console',
            '原型登记与查看器 / Prototype Registry',
            '文档治理与台账查看器 / Docs Governance & Ledger',
            '客户配置包运行时 / Customer Config Runtime',
            '客户导入 tooling / Customer Import Tooling',
            '客户配置前端投影 / Customer Config Projection',
            '前端错误提示边界 / Frontend Error Messages',
            '业务动作与字段链路 / Business Action & Field Boundaries',
            '提交前 QA / Pre-commit QA',
            '发版前严格 QA / Release QA',
          ].every((label) =>
            defaultMetrics.presetTexts.some((text) => text.includes(label))
          ),
          `测试入口预设应覆盖前端、Workflow、试用角色、角色菜单与入口真源、试用账号 RBAC、真实登录 URL、试用模拟数据、MVP 本地闭环、移动端、客户配置、原型、文档治理、导入、错误提示、业务动作字段、提交和发版: ${JSON.stringify(defaultMetrics)}`
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
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: '试用账号 RBAC / Trial Account RBAC' })
          .click()
        const trialAccountRbacClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          trialAccountRbacClipboard.includes('trial-account-rbac.mjs') &&
            trialAccountRbacClipboard.includes('TRIAL_ACCOUNT_PASSWORD') &&
            trialAccountRbacClipboard.includes('smoke:trial-demo-browser'),
          `试用账号 RBAC 预设应复制真实登录 RBAC 和浏览器 smoke 命令: ${trialAccountRbacClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: '移动端 Workflow smoke / Mobile Workflow Smoke' })
          .click()
        const mobilePresetClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          mobilePresetClipboard.includes(
            'mobile-workflow-runtime-browser-smoke.test.mjs'
          ) &&
            mobilePresetClipboard.includes(
              'MOBILE_WORKFLOW_BROWSER_SMOKE_PASSWORD'
            ),
          `移动端 Workflow 预设应复制静态边界和真实浏览器命令: ${mobilePresetClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: '试用模拟数据 / Trial Simulated Data' })
          .click()
        const trialSimulatedDataClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          trialSimulatedDataClipboard.includes(
            'trial-simulated-data.test.mjs'
          ) &&
            trialSimulatedDataClipboard.includes(
              'operational-fact-simulated-closure.test.mjs'
            ) &&
            trialSimulatedDataClipboard.includes(
              'mobile-workflow-simulated-closure.test.mjs'
            ),
          `试用模拟数据预设应复制 seed / fixture 和模拟闭环边界测试: ${trialSimulatedDataClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: 'MVP 本地闭环计划 / MVP Local Closure' })
          .click()
        const mvpLocalClosureClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          mvpLocalClosureClipboard.includes('mvp-closure.test.mjs') &&
            mvpLocalClosureClipboard.includes(
              'mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure'
            ) &&
            mvpLocalClosureClipboard.includes(
              '--run-report-tools --product-id <product_id>'
            ),
          `MVP 本地闭环预设应复制 plan-only 和 no-write report tools 命令: ${mvpLocalClosureClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: '客户配置控制台 / Customer Config Console' })
          .click()
        const customerConfigPresetClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          customerConfigPresetClipboard.includes(
            'web/src/erp/config/devCustomerConfig.test.mjs'
          ) &&
            customerConfigPresetClipboard.includes(
              'dev-customer-config-dark-desktop'
            ),
          `客户配置预设应复制 dev console 测试和 L1 命令: ${customerConfigPresetClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({
            hasText: '客户配置前端投影 / Customer Config Projection',
          })
          .click()
        const frontendConfigPresetClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          frontendConfigPresetClipboard.includes(
            'formal-frontend-customer-config-boundary.test.mjs'
          ) &&
            frontendConfigPresetClipboard.includes(
              'erp-effective-session-action-projection-business-pages'
            ),
          `客户配置前端投影预设应复制正式投影测试和 L1 命令: ${frontendConfigPresetClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({ hasText: '前端错误提示边界 / Frontend Error Messages' })
          .click()
        const frontendErrorPresetClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          frontendErrorPresetClipboard.includes(
            'frontend-error-message-boundary.test.mjs'
          ),
          `前端错误提示预设应复制用户可见错误边界测试: ${frontendErrorPresetClipboard}`
        )
        await page
          .locator('.erp-dev-testing-preset')
          .filter({
            hasText: '业务动作与字段链路 / Business Action & Field Boundaries',
          })
          .click()
        const businessActionFieldClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          businessActionFieldClipboard.includes(
            'workflow-ui-action-boundary.test.mjs'
          ) &&
            businessActionFieldClipboard.includes(
              'sales-order-field-chain-boundary.test.mjs'
            ),
          `业务动作与字段链路预设应复制 Workflow UI 和销售订单字段链路边界测试: ${businessActionFieldClipboard}`
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
        await expectText(page, '角色模板')
        await expectText(page, '管理员账号')
        await expectText(page, '当前客户角色模板')
        await expectText(page, 'Product Core 权限码稳定')
        await expectText(page, '影响管理员')
        await expectText(page, '客户角色可以不同，职责权限保持统一')
        await expectText(page, '保存角色权限')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'permission-center-desktop',
        })
        const roleCenterMetrics = await page.evaluate(() => {
          const activeTab = document.querySelector(
            '.erp-permission-tabs .ant-tabs-tab-active'
          )
          const tabInkBar = document.querySelector(
            '.erp-permission-tabs .ant-tabs-ink-bar'
          )
          const activeTabStyle =
            activeTab instanceof HTMLElement
              ? window.getComputedStyle(activeTab)
              : null
          const tabInkBarStyle =
            tabInkBar instanceof HTMLElement
              ? window.getComputedStyle(tabInkBar)
              : null
          const adminSection = document.querySelector(
            '.erp-permission-section--admins'
          )
          const roleSection = document.querySelector(
            '.erp-permission-section--roles'
          )
          const layout = document.querySelector('.erp-role-center-layout')
          const sidebar = document.querySelector('.erp-role-center-sidebar')
          const detail = document.querySelector('.erp-role-center-detail')
          const checklist = document.querySelector('.erp-permission-checklist')
          const adminRect = adminSection?.getBoundingClientRect()
          const roleRect = roleSection?.getBoundingClientRect()
          const layoutRect = layout?.getBoundingClientRect()
          const sidebarRect = sidebar?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          return {
            hasAdminSection: Boolean(adminSection),
            hasRoleSection: Boolean(roleSection),
            activeTabText: String(activeTab?.textContent || '').trim(),
            activeTabTransitionDuration:
              activeTabStyle?.transitionDuration || '',
            tabInkBarTransitionDuration:
              tabInkBarStyle?.transitionDuration || '',
            adminTop: adminRect?.top || 0,
            adminHeight: adminRect?.height || 0,
            roleTop: roleRect?.top || 0,
            roleHeight: roleRect?.height || 0,
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
          roleCenterMetrics.activeTabText.includes('角色模板') &&
            roleCenterMetrics.hasRoleSection &&
            roleCenterMetrics.roleHeight > 0,
          `权限管理默认应先显示角色模板 tab: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          String(roleCenterMetrics.activeTabTransitionDuration)
            .split(',')
            .some((part) => Number.parseFloat(part) > 0) &&
            String(roleCenterMetrics.tabInkBarTransitionDuration)
              .split(',')
              .some((part) => Number.parseFloat(part) > 0),
          `权限管理 tab 缺少全局平滑过渡: ${JSON.stringify(roleCenterMetrics)}`
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
        await assertPermissionChecklistItemLayout(page, {
          scenarioName: 'permission-center-desktop',
        })
        await expectText(page, '只看已选')
        await page.getByRole('button', { name: '全选本组' }).first().click()
        await expectText(page, '有未保存调整')
        const roleCards = page.locator('.erp-role-template-card')
        if ((await roleCards.count()) > 1) {
          await roleCards.nth(1).click()
          await expectText(page, '放弃未保存的角色权限调整？')
          await page.getByRole('button', { name: '继续编辑' }).click()
          await expectText(page, '有未保存调整')
        }
        await page.getByRole('tab', { name: /管理员账号/ }).click()
        await expectText(page, '管理员与角色')
        await expectText(page, '创建管理员')
        await expectText(page, '超级管理员')
        const adminTabMetrics = await page.evaluate(() => {
          const activeTab = document.querySelector(
            '.erp-permission-tabs .ant-tabs-tab-active'
          )
          const adminSection = document.querySelector(
            '.erp-permission-section--admins'
          )
          const table = document.querySelector(
            '.erp-permission-section--admins .ant-table'
          )
          const adminRect = adminSection?.getBoundingClientRect()
          const tableRect = table?.getBoundingClientRect()
          return {
            activeTabText: String(activeTab?.textContent || '').trim(),
            hasAdminSection: Boolean(adminSection),
            adminTop: adminRect?.top || 0,
            adminHeight: adminRect?.height || 0,
            tableWidth: tableRect?.width || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          adminTabMetrics.activeTabText.includes('管理员账号') &&
            adminTabMetrics.hasAdminSection &&
            adminTabMetrics.adminHeight > 0,
          `权限管理切换管理员账号 tab 后应显示账号表: ${JSON.stringify(adminTabMetrics)}`
        )
        assert(
          adminTabMetrics.documentScrollWidth <=
            adminTabMetrics.documentClientWidth + 1,
          `权限管理管理员账号 tab 出现横向溢出: ${JSON.stringify(adminTabMetrics)}`
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
      name: 'system-audit-logs-desktop',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '审计日志')
        await expectText(
          page,
          '系统控制面事件。先看风险、对象、变化摘要和下一步。'
        )
        await expectText(page, '账号角色变更')
        await expectText(page, '目标已关联')
        await expectText(page, '下一步')
        await expectText(page, '变化')
        await assertTextAbsent(page, '原始 payload')
        await assertTextAbsent(page, 'assistant-admin')
        await assertTextAbsent(page, 'admin_user.roles.set')
        await assertTextAbsent(page, 'admin_bootstrap.blocked')
        await assertTextAbsent(page, 'actor')
        await assertTextAbsent(page, 'target')
        await assertNoHorizontalOverflow(page, 'system-audit-logs-desktop')

        const metrics = await page.evaluate(() => {
          const pageNode = document.querySelector('.erp-audit-page')
          const workspace = document.querySelector('.erp-audit-workspace')
          const detail = document.querySelector('.erp-audit-detail')
          const eventItems = document.querySelectorAll('.erp-audit-event')
          const payloadNode = document.querySelector('.erp-audit-payload')
          const rect = pageNode?.getBoundingClientRect()
          const workspaceRect = workspace?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          return {
            hasPage: Boolean(pageNode),
            hasWorkspace: Boolean(workspace),
            hasDetail: Boolean(detail),
            eventCount: eventItems.length,
            hasPayloadNode: Boolean(payloadNode),
            pageWidth: rect?.width || 0,
            workspaceWidth: workspaceRect?.width || 0,
            detailWidth: detailRect?.width || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          metrics.hasPage &&
            metrics.hasWorkspace &&
            metrics.hasDetail &&
            metrics.eventCount >= 2,
          `审计日志默认态缺少关键区域: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.hasPayloadNode,
          false,
          `审计日志不应挂载原始事件结构区域: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.workspaceWidth > 900 &&
            metrics.detailWidth >= 300 &&
            metrics.documentScrollWidth <= metrics.documentClientWidth + 2,
          `审计日志桌面布局尺寸异常: ${JSON.stringify(metrics)}`
        )
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
        await expectText(page, '模板预览入口')
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
        await expectText(page, '模板预览入口')
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
        await expectText(page, '模板预览入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
        await expectText(page, '受托方签字人')
        await expectText(page, '27072')
        await expectText(page, '4060.8')
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
        await expectText(page, '导出筛选结果')
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
        await expectAdminMenuText(page, '系统管理')
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
      assertAntdModalCentered,
      assertBusinessFormModalKeyboardRecovery,
      assertBusinessListEmptySearchState,
      assertBusinessMainTableInitialSelectionEmpty,
      assertERPThemeMode,
      assertNoHorizontalOverflow,
      assertPurchaseReceiptActionButtonState,
      assertPurchaseReceiptAddItemEditorDarkTokens,
      assertPurchaseReceiptAddItemEditorMetrics,
      assertPurchaseReceiptAddItemEditorMobileLayout,
      assertPurchaseReceiptRowItemCount,
      assertTextAbsent,
      closeBusinessFormModal,
      expectButton,
      expectHeading,
      expectText,
      fillPurchaseReceiptAddItemEditorBoundaryValues,
      openPurchaseReceiptAddItemEditor,
      selectPurchaseReceiptRow,
      verifyBusinessModuleColumnOrderDialog,
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
        await expectText(page, '件（PCS）')
        await assertTextAbsent(page, '默认单位 ID')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await assertBusinessHeaderHasNoSectionTitle(page, {
          scenarioName: 'material-master-header-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'material-master-header-desktop',
          expectedLabels: ['总材料', '当前结果', '启用材料'],
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
        await expectText(page, '件（PCS）')
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
        await expectText(page, '下单日期')
        await expectText(page, '预计到货日期')
        await expectText(page, '新建采购订单')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
          expectedLabels: ['总订单', '当前结果', '已审核'],
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
            await assertLineQuantityUnitSuffix(modal, {
              label: '采购数量',
              expectedText: '件（PCS）',
              scenarioName: 'business-v1-purchase-order-form-modal',
            })
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'business-v1-purchase-order-form-modal',
            })
          },
        })
      },
    },
    {
      name: 'purchase-order-inbound-draft-modal-controls-desktop',
      path: '/erp/purchase/accessories',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/purchase_order', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          const nowUnix = Math.floor(Date.now() / 1000)
          const purchaseOrder = {
            id: 1,
            purchase_order_no: 'PO-STYLE-L1',
            supplier_id: 1,
            supplier_snapshot: {
              id: 1,
              code: 'SUP-STYLE-L1',
              name: '样式供应商',
            },
            supplier_purchase_order_no: 'SUP-PO-STYLE',
            purchase_date: nowUnix,
            expected_arrival_date: nowUnix + 86_400 * 7,
            lifecycle_status: 'approved',
            note: '',
            created_at: nowUnix,
            updated_at: nowUnix,
          }
          const purchaseOrderItem = {
            id: 1,
            purchase_order_id: 1,
            line_no: 1,
            material_id: 1,
            material_code_snapshot: 'MAT-STYLE-L1',
            material_name_snapshot: '样式材料',
            purchased_quantity: '20',
            unit_id: 1,
            unit_price: '3.50',
            amount: '70.00',
            expected_arrival_date: nowUnix + 86_400 * 7,
            line_status: 'open',
            note: '',
            created_at: nowUnix,
            updated_at: nowUnix,
          }

          let data = {}
          switch (method) {
            case 'list_purchase_orders':
              data = {
                purchase_orders: [purchaseOrder],
                total: 1,
                limit: 100,
                offset: 0,
              }
              break
            case 'list_purchase_order_items':
              data = {
                purchase_order_items: [purchaseOrderItem],
                total: 1,
                limit: 100,
                offset: 0,
              }
              break
            case 'get_purchase_order':
              data = { purchase_order: purchaseOrder }
              break
            default:
              await route.fallback()
              return
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
        await expectHeading(page, '采购订单')
        const purchaseOrderRow = page
          .locator('.erp-business-data-table-card .ant-table-tbody tr')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
        await purchaseOrderRow.click()
        await expectButton(page, '生成入库')
        await page.getByRole('button', { name: '生成入库' }).click()
        const modal = page
          .locator('.ant-modal')
          .filter({ hasText: '生成采购入库草稿' })
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '来源采购订单：PO-STYLE-L1')
        await assertTextAbsent(page, '来源采购订单：1')
        await expectText(page, '入库单号')
        await expectText(page, '入库仓库')
        await expectText(page, '入库日期')
        await expectText(page, '备注')
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
        await page
          .locator('.ant-table-row')
          .filter({ hasText: '样式供应商' })
          .first()
          .click()
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
        await expectText(page, '计划出货日期')
        await expectText(page, '实际出货日期')
        await expectText(page, '新建草稿')
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'shipment-date-filter-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'shipment-date-filter-desktop',
          expectedLabels: ['总出货单', '当前结果', '草稿'],
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
        await expectText(page, '计划出货日期')
        await expectText(page, '实际出货日期')
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
        await page
          .locator('.ant-table-row')
          .filter({ hasText: '样式供应商' })
          .first()
          .click()
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
          expectContactItemsLayout: true,
          beforeMeasure: async (modal) => {
            await modal
              .locator('.erp-master-contact-list__field--full textarea')
              .first()
              .fill('123123123123123123123123123123123123123123123123')
          },
        })
        await assertNoHorizontalOverflow(page, 'textarea-show-count-layout')
      },
    },
    ...createBusinessFormalScenarios({
      assert,
      assertAntdModalCentered,
      assertBusinessFormModalKeyboardRecovery,
      assertBusinessHeaderHasNoSectionTitle,
      assertBusinessHeaderStatsSingleLine,
      assertBusinessListEmptySearchState,
      assertBusinessMainTableHasNoOperationColumn,
      assertBusinessMainTableInitialSelectionEmpty,
      assertBusinessMainTableSortableColumns,
      assertBusinessModuleToolbarControlStyle,
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
      verifyFormalShellRowDoubleClickEditModal,
      verifySourceImportPicker,
    }),
  ]
}
