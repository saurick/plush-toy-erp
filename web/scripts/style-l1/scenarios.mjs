import { createBusinessQuickCountsScenarios } from './businessQuickCountsScenarios.mjs'
import { createPerformanceReferenceScenarios } from './performanceReferenceScenarios.mjs'
import { createSearchSubmissionScenarios } from './searchSubmissionScenarios.mjs'
import { createDensityCompletionScenarios } from './densityCompletionScenarios.mjs'
import { createMobileTaskConsistencyScenarios } from './mobileTaskConsistencyScenarios.mjs'
import { createGlobalDensityOptimizationScenarios } from './globalDensityOptimizationScenarios.mjs'
import { createInformationDensityExtras } from './informationDensityExtras.mjs'
import { createInformationDensityScenarios } from './informationDensityScenarios.mjs'
import { createEmptyStateScenarios } from './emptyStateScenarios.mjs'
import { createPageHeaderScenarios } from './pageHeaderScenarios.mjs'
import { createTaskCalendarScenarios } from './taskCalendarScenarios.mjs'
import { createTaskCurrentFocusScenarios } from './taskCurrentFocusScenarios.mjs'
import { createTaskFusedFlowScenarios } from './taskFusedFlowScenarios.mjs'
import { createTaskDetailVariantScenarios } from './taskDetailVariantScenarios.mjs'
import { createBusinessStatusCountsScenarios } from './businessStatusCountsScenarios.mjs'
import { createBusinessFollowupScenarios } from './businessFollowupScenarios.mjs'
import { createHighFidelityScenarios } from './highFidelityScenarios.mjs'
import { createUnifiedInteractionScenarios } from './unifiedInteractionScenarios.mjs'
import { createDevUIDesignDetailScenarios } from './devUIDesignDetailScenarios.mjs'
import { createDevUIFeedbackScenarios } from './devUIFeedbackScenarios.mjs'
import { createDevUIDesignWorkflowScenarios } from './devUIDesignWorkflowScenarios.mjs'
import { createDevUIDesignMobileTrackingScenario } from './devUIDesignMobileTrackingScenario.mjs'
import { createMobileEntryAuditScenarios } from './mobileEntryAuditScenarios.mjs'
import { createMobileTaskBusinessScenarios } from './mobileTaskBusinessScenarios.mjs'
import { createMobileProgressScenarios } from './mobileProgressScenarios.mjs'
import { createMobileScrollScenarios } from './mobileScrollScenarios.mjs'
import { createFilterConflictScenarios } from './filterConflictScenarios.mjs'
import { createMobileNavigationBadgeScenarios } from './mobileNavigationBadgeScenarios.mjs'
import { createLoadFeedbackScenarios } from './loadFeedbackScenarios.mjs'
import { createPageLoadingScenarios } from './pageLoadingScenarios.mjs'
import { createDesktopNavigationBadgeScenarios } from './desktopNavigationBadgeScenarios.mjs'
import { createBusinessFormInteractionScenarios } from './businessFormInteractionScenarios.mjs'
import { createBusinessPageContractScenarios } from './businessPageContractScenarios.mjs'
import { createAuditLogScenarios } from './auditLogScenarios.mjs'
import { createHistoryRecordScenarios } from './historyRecordScenarios.mjs'
import { createTabMotionScenarios } from './tabMotionScenarios.mjs'
import { createTableAlignmentScenarios } from './tableAlignmentScenarios.mjs'
import { createBusinessTableScrollScenarios } from './businessTableScrollScenarios.mjs'
import { createBusinessListStickyScenarios } from './businessListStickyScenarios.mjs'
import { createDesktopListStickyScenarios } from './desktopListStickyScenarios.mjs'
import { createWorkCenterTableScenarios } from './workCenterTableScenarios.mjs'
import { createScrollEdgeScenarios } from './scrollEdgeScenarios.mjs'
import { createMobileTaskScenarios } from './mobileTaskScenarios.mjs'
import { createMobileWorkflowTrackingScenarios } from './mobileWorkflowTrackingScenarios.mjs'
import { createTaskLinkScenarios } from './taskLinkScenarios.mjs'
import { createMobileInputScenarios } from './mobileInputScenarios.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { createWorkCenterPaginationScenarios } from './workCenterPaginationScenarios.mjs'
import { createTaskImagePreviewScenarios } from './taskImagePreviewScenarios.mjs'
import { createProductIdentityScenarios } from './productIdentityScenarios.mjs'
import { createCustomerSessionScenarios } from './customerSessionScenarios.mjs'
import { createHelpCenterScenarios } from './helpCenterScenarios.mjs'
import { createAuthenticationEntryScenarios } from './authenticationEntryScenarios.mjs'
import { createPrintWorkspaceScenarios } from './printWorkspaceScenarios.mjs'
import { createPermissionCenterScenarios } from './permissionCenterScenarios.mjs'
import { createAccountPasswordScenarios } from './accountPasswordScenarios.mjs'

import { yoyoosunRoleFlowMatrix } from '../../../config/customers/yoyoosun/roleFlowMatrix.mjs'

import { getNavigationSections } from '../../src/erp/config/seedData.mjs'

import { createBusinessFormalScenarios } from './businessFormalScenarios.mjs'
import { createBusinessAttachmentScenarios } from './businessAttachmentScenarios.mjs'
import { createBusinessActionStabilityScenarios } from './businessActionStabilityScenarios.mjs'
import { createWorkflowModuleSelectionScenarios } from './workflowModuleSelectionScenarios.mjs'
import { createBusinessDetailsScenarios } from './businessDetailsScenarios.mjs'
import { createDevBusinessUsabilityScenarios } from './devBusinessUsabilityScenarios.mjs'
import { createDevFlowStateObservatoryScenarios } from './devFlowStateObservatoryScenarios.mjs'
import { createDevBusinessChainPrintScenarios } from './devBusinessChainPrintScenarios.mjs'
import { createDevDrillRecoveryScenarios } from './devDrillRecoveryScenarios.mjs'
import { createDevQualityGateScenarios } from './devQualityGateScenarios.mjs'
import { createDevQualityGateLayoutScenarios } from './devQualityGateLayoutScenarios.mjs'
import { createDevWorkbenchPatternScenarios } from './devWorkbenchPatternScenarios.mjs'
import { createDevServerVerificationScenarios } from './devServerVerificationScenarios.mjs'
import { createDevWorkbenchDesktopScenarios } from './devWorkbenchDesktopScenarios.mjs'
import { createDevWorkbenchDensityScenarios } from './devWorkbenchDensityScenarios.mjs'
import { createDevProjectSkillsScenarios } from './devProjectSkillsScenarios.mjs'
import { createDevPressureScenarios } from './devPressureScenarios.mjs'
import { createDevVersionCenterScenarios } from './devVersionCenterScenarios.mjs'
import { createDevDataPreparationScenarios } from './devDataPreparationScenarios.mjs'
import { createDevDeliveryWorkspaceScenarios } from './devDeliveryWorkspaceScenarios.mjs'
import { createFinanceAdvanceScenarios } from './financeAdvanceScenarios.mjs'
import { createTransactionFormRecoveryScenarios } from './transactionFormRecoveryScenarios.mjs'
import { createFinanceBusinessSourceScenarios } from './financeBusinessSourceScenarios.mjs'
import { createBusinessModuleNavigationScenarios } from './businessModuleNavigationScenarios.mjs'
import { createFinishedGoodsDeliveryScenarios } from './finishedGoodsDeliveryScenarios.mjs'

import { createPurchaseReceiptScenarios } from './purchaseReceiptScenarios.mjs'
import { createPurchaseFlowRepairScenarios } from './purchaseFlowRepairScenarios.mjs'
import { createProductPaginationScenarios } from './productPaginationScenarios.mjs'
import { createSalesOrderImportScenarios } from './salesOrderImportScenarios.mjs'
import { createWorkbenchSummaryScenarios } from './workbenchSummaryScenarios.mjs'
import { createOutsourcingSummaryScenarios } from './outsourcingSummaryScenarios.mjs'
import { createOutsourcingFormFieldsScenarios } from './outsourcingFormFieldsScenarios.mjs'
import { createSalesOrderImportValidationScenarios } from './salesOrderImportValidationScenarios.mjs'
import { createBusinessCellTextScenarios } from './businessCellTextScenarios.mjs'
import { createBusinessFieldDensityScenarios } from './businessFieldDensityScenarios.mjs'
import { createDeliveryAddressScenarios } from './deliveryAddressScenarios.mjs'
import { createContactEditorScenarios } from './contactEditorScenarios.mjs'
import { createFormDensityScenarios } from './formDensityScenarios.mjs'
import { createTableDensityScenarios } from './tableDensityScenarios.mjs'
import { createTableLinesScenarios } from './tableLinesScenarios.mjs'
import { createAccountAppearanceScenarios } from './accountAppearanceScenarios.mjs'
import { createDevWorkbenchThemeScenarios } from './devWorkbenchThemeScenarios.mjs'
import { createDevWorkbenchThemeAuditScenarios } from './devWorkbenchThemeAuditScenarios.mjs'
import { createDevWorkbenchSwitchScenarios } from './devWorkbenchSwitchScenarios.mjs'
import { createAccountIdentityScenarios } from './accountIdentityScenarios.mjs'
import { createBusinessColumnSettingsScenarios } from './businessColumnSettingsScenarios.mjs'
import { createSalesOrderExportScenarios } from './salesOrderExportScenarios.mjs'
import { createBusinessConsistencyScenarios } from './businessConsistencyScenarios.mjs'
import { createGrowthValidationScenarios } from './growthValidationScenarios.mjs'

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
    assertBusinessHeaderCompact,
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
    roles: yoyoosunRoleFlowMatrix.roles.map((role) => role.roleKey),
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

  const scenarios = [
    ...createSearchSubmissionScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createBusinessFollowupScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createEmptyStateScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createDeliveryAddressScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createContactEditorScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createFormDensityScenarios(deps),
    ...createTableDensityScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createTableLinesScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createAccountAppearanceScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createDevWorkbenchThemeScenarios({ assertNoHorizontalOverflow, outputDir }),
    ...createDevWorkbenchThemeAuditScenarios({ assertNoHorizontalOverflow, outputDir }),
    ...createDevWorkbenchSwitchScenarios(deps),
    ...createAccountIdentityScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createBusinessModuleNavigationScenarios({
      customerRuntimeEffectiveSession,
      assertNoHorizontalOverflow,
      outputDir,
      path,
    }),
    ...createPageHeaderScenarios({ customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir }),
    ...createBusinessColumnSettingsScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createSalesOrderExportScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createGrowthValidationScenarios(deps),
    ...createBusinessConsistencyScenarios(deps),
    ...createBusinessQuickCountsScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createBusinessStatusCountsScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createHighFidelityScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createUnifiedInteractionScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createBusinessFieldDensityScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createBusinessCellTextScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createSalesOrderImportScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createWorkbenchSummaryScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createOutsourcingSummaryScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createOutsourcingFormFieldsScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createSalesOrderImportValidationScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createDevWorkbenchDesktopScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectHeading,
    }),
    ...createDevWorkbenchDensityScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }),
    ...createDevProjectSkillsScenarios({ assert, assertNoHorizontalOverflow, expectHeading }),
    ...createDevPressureScenarios({ assert, assertNoHorizontalOverflow }),
    ...createDevUIDesignDetailScenarios(deps),
    ...createDevUIFeedbackScenarios(deps),
    ...createDevUIDesignWorkflowScenarios(deps),
    createDevUIDesignMobileTrackingScenario(deps),
    ...createDevQualityGateScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectHeading,
      outputDir,
      path,
    }),
    ...createDevQualityGateLayoutScenarios({ assert, assertNoHorizontalOverflow, expectHeading }),
    ...createDevWorkbenchPatternScenarios({ assert, assertNoHorizontalOverflow }),
    ...createDevServerVerificationScenarios({ assert, assertNoHorizontalOverflow }),
    ...createDevVersionCenterScenarios({
      assert,
      assertNoHorizontalOverflow,
      clickERPThemeOption,
      expectHeading,
      outputDir,
      path,
    }),
    ...createDevDataPreparationScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectHeading,
    }),
    ...createDevDeliveryWorkspaceScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectHeading,
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
    ...createDevBusinessChainPrintScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectText,
      outputDir,
      path,
    }),
    ...createDevFlowStateObservatoryScenarios({
      assert,
      assertNoHorizontalOverflow,
      expectText,
      outputDir,
      path,
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
    ...createWorkflowModuleSelectionScenarios({
      assert,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      outputDir,
      path,
    }),
    ...createBusinessDetailsScenarios({
      assert,
      assertDarkThemeContrast,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      expectHeading,
      expectText,
      outputDir,
      path,
    }),
    ...createTabMotionScenarios({ outputDir }),
    ...createMobileInputScenarios(),
    ...createTableAlignmentScenarios({
      outputDir,
      customerRuntimeEffectiveSession,
      gotoScenarioPath,
    }),
    ...createBusinessTableScrollScenarios({
      outputDir,
      customerRuntimeEffectiveSession,
      clickERPThemeOption,
    }),
    ...createBusinessListStickyScenarios({ outputDir, customerRuntimeEffectiveSession }),
    ...createDesktopListStickyScenarios({ outputDir, customerRuntimeEffectiveSession }),
    ...createWorkCenterTableScenarios({ ...deps, customerRuntimeEffectiveSession }),
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
    ...createHelpCenterScenarios({
      ...deps,
      customerRoleAdminProfile,
      customerRoleRuntimeSession,
      customerRuntimeEffectiveSession,
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
    ...createTaskCalendarScenarios(deps),
    ...createTaskCurrentFocusScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createTaskDetailVariantScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createTaskFusedFlowScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createInformationDensityScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createInformationDensityExtras({ ...deps, customerRuntimeEffectiveSession }),
    ...createWorkCenterPaginationScenarios({ ...deps, customerRuntimeEffectiveSession }),
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
    ...createMobileProgressScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createMobileEntryAuditScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createMobileTaskBusinessScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createMobileTaskConsistencyScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createMobileScrollScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createMobileWorkflowTrackingScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createTaskLinkScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createFilterConflictScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createMobileNavigationBadgeScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
    }),
    ...createLoadFeedbackScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createPageLoadingScenarios({ ...deps, customerRuntimeEffectiveSession }),
    ...createDesktopNavigationBadgeScenarios({ ...deps, customerRuntimeEffectiveSession }),
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
    ...createAccountPasswordScenarios({
      expectText,
      assertNoHorizontalOverflow,
      outputDir,
      customerRuntimeEffectiveSession,
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
    ...createHistoryRecordScenarios({
      ...deps,
      customerRuntimeEffectiveSession,
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
    ...createPurchaseFlowRepairScenarios({ assert, customerRuntimeEffectiveSession, outputDir }),
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
    ...createFinanceAdvanceScenarios({ assert, customerRuntimeEffectiveSession, expectText, outputDir, assertNoHorizontalOverflow }),
    ...createTransactionFormRecoveryScenarios({ assert, customerRuntimeEffectiveSession, expectHeading, expectText, outputDir, assertNoHorizontalOverflow }),
    ...createFinanceBusinessSourceScenarios({
      assert,
      assertNoHorizontalOverflow,
      customerRuntimeEffectiveSession,
      expectHeading,
      expectText,
    }),
    ...createPerformanceReferenceScenarios({ customerRuntimeEffectiveSession }),
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
      assertBusinessHeaderCompact,
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
    ...createBusinessAttachmentScenarios({
      assert,
      customerRuntimeEffectiveSession,
      outputDir,
      path,
    }),
    ...createBusinessFormalScenarios({
      assert,
      assertAntdModalCentered,
      assertBusinessFormModalKeyboardRecovery,
      assertBusinessHeaderHasNoSectionTitle,
      assertBusinessHeaderCompact,
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
      clickERPThemeOption,
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
  return [...scenarios, ...createScrollEdgeScenarios(scenarios, { outputDir }), ...createGlobalDensityOptimizationScenarios(scenarios, { ...deps, customerRuntimeEffectiveSession }), ...createDensityCompletionScenarios(scenarios, { ...deps, customerRuntimeEffectiveSession })]
}
