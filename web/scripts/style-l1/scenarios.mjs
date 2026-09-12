import { createBusinessFormInteractionScenarios } from './businessFormInteractionScenarios.mjs'
import { createBusinessPageContractScenarios } from './businessPageContractScenarios.mjs'
import { createAuditLogScenarios } from './auditLogScenarios.mjs'
import { createMobileTaskScenarios } from './mobileTaskScenarios.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { createTaskImagePreviewScenarios } from './taskImagePreviewScenarios.mjs'
import { createProductIdentityScenarios } from './productIdentityScenarios.mjs'
import { createCustomerSessionScenarios } from './customerSessionScenarios.mjs'
import { createAuthenticationEntryScenarios } from './authenticationEntryScenarios.mjs'
import { createPrintWorkspaceScenarios } from './printWorkspaceScenarios.mjs'
import { createPermissionCenterScenarios } from './permissionCenterScenarios.mjs'

import { yoyoosunRoleFlowMatrix } from '../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

import { getNavigationSections } from '../../src/erp/config/seedData.mjs'

import { createBusinessFormalScenarios } from './businessFormalScenarios.mjs'
import { createBusinessActionStabilityScenarios } from './businessActionStabilityScenarios.mjs'
import { createBusinessRowItemsPreviewScenarios } from './businessRowItemsPreviewScenarios.mjs'
import { createDevBusinessUsabilityScenarios } from './devBusinessUsabilityScenarios.mjs'
import { createDevFlowStateObservatoryScenarios } from './devFlowStateObservatoryScenarios.mjs'
import { createDevDrillRecoveryScenarios } from './devDrillRecoveryScenarios.mjs'
import { createDevQualityGateScenarios } from './devQualityGateScenarios.mjs'
import { createDevWorkbenchDesktopScenarios } from './devWorkbenchDesktopScenarios.mjs'
import { createDevVersionCenterScenarios } from './devVersionCenterScenarios.mjs'
import { createFinanceBusinessSourceScenarios } from './financeBusinessSourceScenarios.mjs'
import { createFinishedGoodsDeliveryScenarios } from './finishedGoodsDeliveryScenarios.mjs'

import { createPurchaseReceiptScenarios } from './purchaseReceiptScenarios.mjs'
import { createProductPaginationScenarios } from './productPaginationScenarios.mjs'
import { createSalesOrderImportScenarios } from './salesOrderImportScenarios.mjs'
import { createBusinessCellTextScenarios } from './businessCellTextScenarios.mjs'
import { createBusinessFieldDensityScenarios } from './businessFieldDensityScenarios.mjs'

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
    assertERPThemeMode,
    assertEditablePrintWorkspacePopupRefresh,
    assertLineItemsUnifiedHorizontalScroll,
    assertLoginSegmentedReadable,
    assertMaterialContractLineCellsWrapLongValues,
    assertMaterialDetailLineCellsWrapLongValues,
    assertPrintTemplateLongBusinessValuesStayInsidePaper,
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
    gotoScenarioPath,
    isLightSurfaceColor,
    outputDir,
    path,
    seedBusinessCollaborationOverflowTasks,
    selectPurchaseReceiptRow,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickModal,
    verifySourceImportPicker,
    waitForPath,
    webDir,
  } = deps

  const openControlledAntSelectDropdown = async (
    page,
    selectRoot,
    label,
    { timeout = 10_000 } = {}
  ) => {
    const combobox = selectRoot.getByRole('combobox')
    const listboxID = await combobox.getAttribute('aria-controls')
    assert(listboxID, `${label}缺少受控下拉标识`)
    await selectRoot.locator('.ant-select-selector').click()
    const listbox = page.locator(`[id="${listboxID}"]`)
    const dropdown = page
      .locator('.ant-select-dropdown')
      .filter({ has: listbox })
    await dropdown.waitFor({ state: 'visible', timeout })
    return dropdown
  }

  const selectVirtualizedAntOption = async (
    page,
    dropdown,
    { label, optionLabel, activateOption }
  ) => {
    const options = dropdown.locator('.ant-select-item-option')
    const listHolder = dropdown.locator('.rc-virtual-list-holder')
    await options.first().waitFor({ state: 'visible', timeout: 10_000 })
    await listHolder.waitFor({ state: 'visible', timeout: 10_000 })
    const observedLabels = new Set()

    for (let step = 0; step < 100; step += 1) {
      const renderedLabels = (await options.allTextContents()).map((item) =>
        item.trim()
      )
      renderedLabels.forEach((item) => observedLabels.add(item))
      const targetIndex = renderedLabels.findIndex(
        (item) => item === optionLabel
      )
      if (targetIndex >= 0) {
        const targetOption = options.nth(targetIndex)
        const activated = activateOption
          ? await activateOption(targetOption)
          : await targetOption
              .evaluate((node, expectedLabel) => {
                const box = node.getBoundingClientRect()
                if (
                  String(node.textContent || '').trim() !== expectedLabel ||
                  box.width <= 0 ||
                  box.height <= 0
                ) {
                  return false
                }
                node.click()
                return true
              }, optionLabel)
              .catch(() => false)
        if (activated !== false) return
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        )
        continue
      }

      const scrollMetrics = await listHolder.evaluate((node) => ({
        clientHeight: node.clientHeight,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
      }))
      const maxScrollTop = Math.max(
        0,
        scrollMetrics.scrollHeight - scrollMetrics.clientHeight
      )
      if (scrollMetrics.scrollTop >= maxScrollTop) break
      const nextScrollTop = Math.min(
        maxScrollTop,
        scrollMetrics.scrollTop +
          Math.max(1, Math.floor(scrollMetrics.clientHeight / 2))
      )
      await listHolder.evaluate((node, value) => {
        node.scrollTop = value
        node.dispatchEvent(new Event('scroll', { bubbles: true }))
      }, nextScrollTop)
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
      )
    }

    assert.fail(
      `${label}缺少可选项“${optionLabel}”: ${JSON.stringify([...observedLabels])}`
    )
  }

  const customerRuntimePages = Object.freeze([
    ...new Set(
      yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.menuSurfaces || [])
    ),
  ])
  const customerRuntimeActions = Object.freeze([
    ...new Set(
      yoyoosunRoleFlowMatrix.roles.flatMap((role) => role.capabilityKeys || [])
    ),
  ])
  const customerRuntimeEffectiveSession = Object.freeze({
    configRevision: 'style-l1-customer-runtime',
    configHash: 'style-l1-customer-runtime-hash',
    customer: { key: 'yoyoosun', name: '永绅' },
    pages: customerRuntimePages,
    actions: customerRuntimeActions,
    fieldPolicies: {},
    workPools: [],
    source: 'active_customer_config_revision',
  })
  const customerRoleRuntimeSession = (roleKeys, revision) => {
    const roleKeySet = new Set(roleKeys)
    const roles = yoyoosunRoleFlowMatrix.roles.filter((role) =>
      roleKeySet.has(role.roleKey)
    )
    return {
      ...customerRuntimeEffectiveSession,
      configRevision: revision,
      roles: [...roleKeys],
      pages: [...new Set(roles.flatMap((role) => role.menuSurfaces || []))],
      actions: [...new Set(roles.flatMap((role) => role.capabilityKeys || []))],
    }
  }
  const customerNavigationItemByKey = new Map(
    getNavigationSections().flatMap((section) =>
      section.items.map((item) => [item.key, item])
    )
  )
  const customerRoleAdminProfile = (
    roleKey,
    username,
    {
      navigationMode = 'recommended',
      primaryMenuPaths = [],
      secondaryMenuPaths = [],
    } = {}
  ) => {
    const role = yoyoosunRoleFlowMatrix.roles.find(
      (item) => item.roleKey === roleKey
    )
    assert(role, `缺少永绅岗位投影: ${roleKey}`)
    const menus = role.menuSurfaces.map((pageKey) => {
      const item = customerNavigationItemByKey.get(pageKey)
      assert(item, `缺少永绅页面映射: ${roleKey}.${pageKey}`)
      return { key: item.key, label: item.label, path: item.path }
    })
    const resolvedSecondaryMenuPaths =
      navigationMode === 'custom'
        ? [
            ...secondaryMenuPaths,
            ...menus
              .map((item) => item.path)
              .filter(
                (menuPath) =>
                  !primaryMenuPaths.includes(menuPath) &&
                  !secondaryMenuPaths.includes(menuPath) &&
                  ![
                    '/erp/dashboard',
                    '/erp/task-board',
                    '/erp/business-dashboard',
                    '/erp/help-center',
                  ].includes(menuPath)
              ),
          ]
        : []
    return {
      id: 1,
      username,
      is_super_admin: false,
      roles: [
        {
          role_key: roleKey,
          name: role.displayName,
          navigation_mode: navigationMode,
          primary_menu_paths: primaryMenuPaths,
          secondary_menu_paths: resolvedSecondaryMenuPaths,
        },
      ],
      permissions: [...role.capabilityKeys],
      menus,
      erp_preferences: { column_orders: {} },
    }
  }

  return [
    ...createBusinessFieldDensityScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createBusinessCellTextScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createSalesOrderImportScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createDevWorkbenchDesktopScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectHeading,
    }),
    ...createDevQualityGateScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectHeading,
      outputDir,
      path,
    }),
    ...createDevVersionCenterScenarios({
      assert,
      assertNoHorizontalOverflow,
      clickERPThemeOption,
      expectHeading,
      outputDir,
      path,
    }),
    ...createDevDrillRecoveryScenarios({
      assert,
      assertNoHorizontalOverflow,
      clickERPThemeOption,
      expectHeading,
      outputDir,
      path,
    }),
    ...createDevBusinessUsabilityScenarios({
      assert,
      assertDarkThemeContrast,
      assertNoHorizontalOverflow,
      clickERPThemeOption,
      expectHeading,
      outputDir,
      path,
    }),
    ...createDevFlowStateObservatoryScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectText,
      gotoScenarioPath,
    }),
    ...createBusinessActionStabilityScenarios({
      assert,
      assertERPThemeMode,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      gotoScenarioPath,
      outputDir,
      path,
    }),
    ...createBusinessRowItemsPreviewScenarios({
      assert,
      assertDarkThemeContrast,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      expectHeading,
      expectText,
      outputDir,
      path,
    }),
    ...createAuthenticationEntryScenarios({
      expectHeading,
      expectButton,
      assertAdminLoginLayout,
      assert,
      assertERPThemeMode,
      clickERPThemeOption,
      assertThemeReadable,
      assertLoginSegmentedReadable,
      expectText,
      assertAdminLoginSmsHintLayout,
      assertAdminLoginSmsCodeErrorHintSpacing,
      customerRuntimeEffectiveSession,
      waitForPath,
      customerRoleAdminProfile,
      customerRoleRuntimeSession,
      path,
      outputDir,
      expectNoButton,
      assertTextAbsent,
      assertAppAlertDialogLayout,
    }),
    ...createCustomerSessionScenarios({
      expectHeading,
      expectButton,
      assertAdminLoginLayout,
      expectText,
      assertTextAbsent,
      assertNoDuplicatedAdminPageTitle,
      assertShellRefreshButton,
      assertNoDashboardCenterLocalRefreshButton,
      assert,
      waitForPath,
      customerRoleAdminProfile,
      customerRoleRuntimeSession,
      path,
      outputDir,
      assertNoHorizontalOverflow,
      clickERPThemeOption,
      assertERPThemeMode,
      assertDarkThemeContrast,
      assertDashboardWorkbenchEntryNavigation,
      assertDashboardWorkbenchLayout,
      customerRuntimeEffectiveSession,
      assertThemeReadable,
      expectNoButton,
      gotoScenarioPath,
    }),
    ...createTaskImagePreviewScenarios({
      outputDir,
      customerRuntimeEffectiveSession,
    }),
    ...createDashboardTaskScenarios({
      expectText,
      expectHeading,
      assertTextAbsent,
      assertNoDuplicatedAdminPageTitle,
      assertDashboardMetricInteractionSemantics,
      assertDashboardTaskBoardLayout,
      assertShellRefreshButton,
      assertNoDashboardCenterLocalRefreshButton,
      assert,
      path,
      outputDir,
      expectButton,
      waitForPath,
      assertTaskActionDrawerLayout,
      expectNoButton,
      customerRuntimeEffectiveSession,
      assertNoHorizontalOverflow,
      assertERPThemeMode,
      assertDarkDashboardLinkButtonsUnboxed,
      assertThemeReadable,
      assertDarkThemeContrast,
      assertDarkThemeNeutralInteractions,
    }),
    ...createMobileTaskScenarios({
      expectText,
      assertTextAbsent,
      expectButton,
      assert,
      gotoScenarioPath,
      waitForPath,
      path,
      outputDir,
      assertThemeReadable,
      assertDarkThemeContrast,
      customerRuntimeEffectiveSession,
      assertMobileTaskInitialSkeleton,
      assertERPThemeMode,
      assertMobileTaskMainNavigation,
      assertMobileTaskRefreshFeedback,
      assertMobileTaskDarkDetailReadable,
      assertMobileTaskBossDoneList,
      assertNoDuplicatedAdminPageTitle,
      assertDashboardMetricInteractionSemantics,
      assertNoDashboardCenterLocalRefreshButton,
    }),
    ...createPermissionCenterScenarios({
      expectText,
      assertERPThemeMode,
      assertDarkLoadingState,
      expectHeading,
      assertTextAbsent,
      assertDarkAntdStateSurfaces,
      assertPermissionSectionVisualSeparation,
      expectButton,
      assertNoHorizontalOverflow,
      assertAntdModalCentered,
      assert,
      assertNoDuplicatedAdminPageTitle,
      assertPermissionChecklistItemLayout,
      assertPaginationSizeChangerFocusStyle,
      assertShellRefreshButton,
      assertAdminRoleModalLayout,
      assertVisibleModalInputFocusStyle,
      openControlledAntSelectDropdown,
      selectVirtualizedAntOption,
    }),
    ...createAuditLogScenarios({
      expectHeading,
      expectText,
      assertTextAbsent,
      assertNoHorizontalOverflow,
      assert,
    }),
    ...createPrintWorkspaceScenarios({
      expectHeading,
      expectText,
      assertTextAbsent,
      assertNoDuplicatedAdminPageTitle,
      assert,
      assertNoHorizontalOverflow,
      assertERPThemeMode,
      assertDarkThemeContrast,
      assertEditablePrintWorkspacePopupRefresh,
      assertPrintCenterPreviewPopup,
      assertPrintWorkspacePaginationStyle,
      assertContractTableHeadersStaySingleLine,
      assertContractTableEditableAlignment,
      assertMaterialContractLineCellsWrapLongValues,
      assertContractTotalCellsWrapLargeNumbers,
      assertMaterialContractMetaAlignment,
      assertWorkspaceContinuedPageMargin,
      assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
      path,
      outputDir,
      gotoScenarioPath,
      expectButton,
      assertProcessingContractPaperRowCount,
      assertProcessingContractSignatureLayout,
      assertMaterialDetailLineCellsWrapLongValues,
      webDir,
      assertPrintTemplateLongBusinessValuesStayInsidePaper,
      assertRowSelectionClearsAfterCancel,
      assertPrintPreviewPopup,
    }),
    ...createBusinessPageContractScenarios({
      customerRuntimeEffectiveSession,
      expectHeading,
      gotoScenarioPath,
      clickERPThemeOption,
      assertERPThemeMode,
      openControlledAntSelectDropdown,
      assert,
      selectVirtualizedAntOption,
      expectButton,
      expectText,
      verifyBusinessModuleColumnOrderDialog,
      assertNoHorizontalOverflow,
      assertDarkThemeContrast,
      path,
      outputDir,
    }),
    ...createPurchaseReceiptScenarios({
      assert,
      assertAntdModalCentered,
      assertBusinessFormModalKeyboardRecovery,
      assertBusinessListEmptySearchState,
      assertBusinessMainTableInitialSelectionEmpty,
      assertERPThemeMode,
      assertNoHorizontalOverflow,
      assertPurchaseReceiptRowItemCount,
      assertTextAbsent,
      closeBusinessFormModal,
      expectButton,
      expectHeading,
      expectText,
      selectPurchaseReceiptRow,
      verifyBusinessModuleColumnOrderDialog,
      customerRuntimeEffectiveSession,
    }),
    ...createFinanceBusinessSourceScenarios({
      assert,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      expectHeading,
      expectText,
    }),
    ...createProductPaginationScenarios({
      assert,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      expectHeading,
      expectText,
      outputDir,
      path,
    }),
    ...createProductIdentityScenarios({
      customerRuntimeEffectiveSession,
      outputDir,
    }),
    ...createBusinessFormInteractionScenarios({
      customerRuntimeEffectiveSession,
      expectHeading,
      expectText,
      assertTextAbsent,
      assertBusinessPageRefreshEntrypoint,
      assertBusinessHeaderHasNoSectionTitle,
      assertBusinessHeaderStatsSingleLine,
      assertBusinessMainTableHasNoOperationColumn,
      assertBusinessMainTableInitialSelectionEmpty,
      assertBusinessMainTableSortableColumns,
      assert,
      isLightSurfaceColor,
      closeBusinessFormModal,
      assertNoHorizontalOverflow,
      assertBusinessModuleToolbarControlStyle,
      assertBusinessFormModalKeyboardRecovery,
      verifyBusinessActionFormModal,
      verifySourceImportPicker,
      assertLineItemsUnifiedHorizontalScroll,
      expectButton,
      assertOutsourcingProcessSelectOptions,
      path,
      outputDir,
      seedBusinessCollaborationOverflowTasks,
      assertOrderLifecycleActionsConsolidated,
      assertBusinessCollaborationPanelCollapsedByDefault,
      gotoScenarioPath,
      assertERPThemeMode,
      verifyBusinessModuleColumnOrderDialog,
      assertAntdModalCentered,
      assertOperationalFactModalViewport,
    }),
    ...createFinishedGoodsDeliveryScenarios({
      assert,
      expectHeading,
      expectText,
      outputDir,
      path,
    }),
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
      outputDir,
      path,
      verifyBusinessActionFormModal,
      verifyBusinessModuleColumnOrderDialog,
      verifyBusinessRowDoubleClickModal,
      verifySourceImportPicker,
      customerRuntimeEffectiveSession,
    }),
  ]
}
