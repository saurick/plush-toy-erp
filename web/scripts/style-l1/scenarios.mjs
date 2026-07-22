import { Buffer } from 'node:buffer'

import { yoyoosunRoleFlowMatrix } from '../../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

import { createBusinessFormalScenarios } from './businessFormalScenarios.mjs'
import { createBusinessRowItemsPreviewScenarios } from './businessRowItemsPreviewScenarios.mjs'
import { createFinanceBusinessSourceScenarios } from './financeBusinessSourceScenarios.mjs'
import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'
import { createPurchaseReceiptScenarios } from './purchaseReceiptScenarios.mjs'
import { createProductPaginationScenarios } from './productPaginationScenarios.mjs'
import { createWorkflowSourceTaskScenarios } from './workflowSourceTaskScenarios.mjs'

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
    assertDevPageUsesGlobalThemeOnly,
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
  const assertBusinessDashboardCountStates = async (page, scenarioName) => {
    await page
      .getByRole('button', { name: '查看客户', exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await page.evaluate(() => {
      const sourceItems = Array.from(
        document.querySelectorAll('.erp-business-board-source-item--openable')
      )
      const sourceCount = (label) => {
        const entry = document.querySelector(`[aria-label="查看${label}"]`)
        return String(
          entry
            ?.closest('.erp-business-board-source-item--openable')
            ?.querySelector('.erp-business-board-source-count')?.textContent ||
            ''
        ).trim()
      }
      const summaryCard = (title) => {
        const card = Array.from(
          document.querySelectorAll('.erp-business-board-summary-card')
        ).find((node) =>
          String(node.getAttribute('aria-label') || '').startsWith(title)
        )
        return {
          ariaLabel: String(card?.getAttribute('aria-label') || ''),
          text: String(card?.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
        }
      }
      const laneCounts = Object.fromEntries(
        Array.from(
          document.querySelectorAll('.erp-business-board-alert-item')
        ).map((node) => [
          String(
            node.querySelector('.ant-typography')?.textContent || ''
          ).trim(),
          String(
            node.querySelector('.erp-business-board-alert-count')
              ?.textContent || ''
          ).trim(),
        ])
      )
      return {
        sourceItemCount: sourceItems.length,
        sourceItemsWithEntry: sourceItems.filter((node) =>
          node.querySelector('.erp-business-board-source-entry')
        ).length,
        customer: sourceCount('客户'),
        productionException: sourceCount('生产异常'),
        invoice: sourceCount('发票记录'),
        masterSummary: summaryCard('基础资料'),
        sourceSummary: summaryCard('业务单据'),
        factSummary: summaryCard('办理结果'),
        riskSummary: summaryCard('需要关注'),
        laneCounts,
      }
    })

    assert.equal(
      metrics.sourceItemCount,
      20,
      `${scenarioName} 应展示 20 个独立对象统计: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.sourceItemsWithEntry,
      metrics.sourceItemCount,
      `${scenarioName} 每个对象统计都应有独立入口: ${JSON.stringify(metrics)}`
    )
    assert.equal(metrics.customer, '60')
    assert.equal(metrics.productionException, '20')
    assert.equal(metrics.invoice, '0')
    assert(metrics.masterSummary.text.includes('191'))
    assert(metrics.sourceSummary.text.includes('135'))
    assert(metrics.factSummary.text.includes('0'))
    assert(!metrics.factSummary.ariaLabel.includes('暂不可用'))
    assert(metrics.riskSummary.text.includes('93'))
    assert.deepEqual(metrics.laneCounts, {
      阻塞: '27',
      到期提醒: '66',
    })
  }
  const assertResponsiveSelectionActionBar = async (
    page,
    { scenarioName, maxVisibleActions }
  ) => {
    const actionBar = page
      .locator('.erp-business-module-current-action')
      .first()
    const compactActions = actionBar.locator(
      '.erp-business-selection-action-bar__actions--compact'
    )
    await compactActions.waitFor({ state: 'visible', timeout: 10_000 })

    const metrics = await compactActions.evaluate((element) => {
      const isVisible = (node) => {
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      }
      const visibleArea = element.querySelector(
        '.erp-business-selection-action-bar__compact-visible'
      )
      const visibleButtons = Array.from(
        visibleArea?.querySelectorAll('button') || []
      )
        .filter(isVisible)
        .map((button) => {
          const rect = button.getBoundingClientRect()
          const style = window.getComputedStyle(button)
          return {
            text: String(button.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            width: rect.width,
            height: rect.height,
            whiteSpace: style.whiteSpace,
            writingMode: style.writingMode,
          }
        })
      const moreButton = element.querySelector(
        '.erp-business-selection-action-bar__compact-more'
      )
      const moreRect = moreButton?.getBoundingClientRect()
      return {
        visibleButtons,
        moreButton: moreButton
          ? {
              width: moreRect.width,
              height: moreRect.height,
              disabled: moreButton.disabled,
            }
          : null,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
      }
    })

    assert(
      metrics.visibleButtons.length > 0 &&
        metrics.visibleButtons.length <= maxVisibleActions,
      `${scenarioName} 窄屏只应投影有限主动作: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.visibleButtons.every(
        (item) =>
          item.width >= 44 &&
          item.height >= 44 &&
          item.whiteSpace === 'nowrap' &&
          !item.writingMode.startsWith('vertical')
      ),
      `${scenarioName} 主动作应保持横向可读和 44px 触控尺寸: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.moreButton &&
        !metrics.moreButton.disabled &&
        metrics.moreButton.width >= 44 &&
        metrics.moreButton.height >= 44,
      `${scenarioName} 应提供可触达的更多操作入口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `${scenarioName} 当前操作区不应横向溢出: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      await page.locator('.erp-business-selection-action-drawer').count(),
      0,
      `${scenarioName} 更多操作面板默认必须关闭`
    )

    const moreButton = compactActions.getByRole('button', {
      name: /更多操作/u,
    })
    await moreButton.click()
    const drawer = page.locator('.erp-business-selection-action-drawer')
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForFunction(
      () => {
        const drawerNode = document.querySelector(
          '.erp-business-selection-action-drawer'
        )
        return (
          drawerNode?.contains(document.activeElement) &&
          document.activeElement?.matches('button:not(:disabled)')
        )
      },
      undefined,
      { timeout: 10_000 }
    )
    await page.keyboard.press('Escape')
    await page.waitForFunction(
      () =>
        !document
          .querySelector('.erp-business-selection-action-drawer')
          ?.classList.contains('ant-drawer-open'),
      undefined,
      { timeout: 10_000 }
    )
    await page.waitForFunction(
      (selector) => document.activeElement?.matches(selector),
      '.erp-business-selection-action-bar__compact-more',
      { timeout: 10_000 }
    )
  }
  const assertAuditLogsCompactDetailDrawer = async (
    page,
    { scenarioName, expectedPanelWidth }
  ) => {
    const feed = page.getByRole('region', { name: '操作记录列表' })
    const trigger = feed.getByRole('button', { name: /员工岗位变更/u }).first()
    await trigger.waitFor({ state: 'visible', timeout: 10_000 })
    await assertNoHorizontalOverflow(page, scenarioName)
    assert.equal(
      await page
        .locator('.erp-audit-workspace > .erp-audit-detail')
        .isVisible(),
      false,
      `${scenarioName} 窄屏不应显示桌面内联详情`
    )

    await trigger.click()
    const drawer = page.locator('.erp-audit-detail-drawer')
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    await drawer.getByText('下一步', { exact: true }).waitFor()
    await page.waitForFunction(
      () => {
        const drawerNode = document.querySelector('.erp-audit-detail-drawer')
        return drawerNode?.contains(document.activeElement)
      },
      undefined,
      { timeout: 10_000 }
    )

    const metrics = await drawer.evaluate((node) => {
      const panel = node.querySelector('.ant-drawer-content-wrapper')
      const body = node.querySelector('.ant-drawer-body')
      const detail = node.querySelector('.erp-audit-detail--drawer')
      return {
        panelWidth: panel?.getBoundingClientRect().width || 0,
        bodyClientWidth: body?.clientWidth || 0,
        bodyScrollWidth: body?.scrollWidth || 0,
        detailClientWidth: detail?.clientWidth || 0,
        detailScrollWidth: detail?.scrollWidth || 0,
      }
    })
    assert(
      Math.abs(metrics.panelWidth - expectedPanelWidth) <= 2,
      `${scenarioName} Drawer 宽度异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.bodyClientWidth > 0 &&
        metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1 &&
        metrics.detailClientWidth > 0 &&
        metrics.detailScrollWidth <= metrics.detailClientWidth + 1,
      `${scenarioName} Drawer 内容不应横向溢出: ${JSON.stringify(metrics)}`
    )
    await assertNoHorizontalOverflow(page, `${scenarioName}-drawer-open`)

    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 })
    await page.waitForFunction(
      () => {
        const expectedTrigger = Array.from(
          document.querySelectorAll('.erp-audit-event')
        ).find((event) => event.textContent?.includes('员工岗位变更'))
        return document.activeElement === expectedTrigger
      },
      undefined,
      { timeout: 10_000 }
    )
    const focusMetrics = await page.evaluate(() => {
      const activeElement = document.activeElement
      const expectedTrigger = Array.from(
        document.querySelectorAll('.erp-audit-event')
      ).find((event) => event.textContent?.includes('员工岗位变更'))
      return {
        activeClassName: activeElement?.className || '',
        activeTagName: activeElement?.tagName || '',
        activeText:
          activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
        expectedTriggerConnected: expectedTrigger?.isConnected === true,
        restored: activeElement === expectedTrigger,
      }
    })
    assert(
      focusMetrics.restored,
      `${scenarioName} Drawer 关闭后焦点未回到事件卡: ${JSON.stringify(focusMetrics)}`
    )
  }
  const assertDevCustomerHeaderStacked = async (page, scenarioName) => {
    const metrics = await page.evaluate(() => {
      const copy = document.querySelector('.erp-dev-customer-header__copy')
      const title = document.querySelector('.erp-dev-customer-title')
      const summary = document.querySelector('.erp-dev-customer-summary')
      const titleRect = title?.getBoundingClientRect()
      const summaryRect = summary?.getBoundingClientRect()
      return {
        copyDisplay: copy ? getComputedStyle(copy).display : '',
        copyDirection: copy ? getComputedStyle(copy).flexDirection : '',
        titleBottom: titleRect?.bottom || 0,
        summaryTop: summaryRect?.top || 0,
        summaryWidth: summaryRect?.width || 0,
        summaryScrollWidth: summary?.scrollWidth || 0,
        summaryClientWidth: summary?.clientWidth || 0,
      }
    })
    assert(
      metrics.copyDisplay === 'flex' &&
        metrics.copyDirection === 'column' &&
        metrics.summaryTop >= metrics.titleBottom + 2 &&
        metrics.summaryWidth > 0 &&
        metrics.summaryScrollWidth <= metrics.summaryClientWidth + 1,
      `${scenarioName} 客户配置控制台标题和摘要应纵向分层且不重叠: ${JSON.stringify(
        metrics
      )}`
    )
  }
  const assertPrintEditableFocusBorderStyle = async (
    page,
    { selector, scenarioLabel }
  ) => {
    await page.locator(selector).first().waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    const metrics = await page
      .locator(selector)
      .first()
      .evaluate((element) => {
        element.focus()
        const editableStyle = window.getComputedStyle(element)
        const cell = element.closest('td')
        const cellStyle = cell ? window.getComputedStyle(cell) : null
        return {
          activeElementMatches:
            document.activeElement === element ||
            document.activeElement?.contains(element) ||
            false,
          editableOutlineStyle: editableStyle.outlineStyle,
          editableOutlineWidth: editableStyle.outlineWidth,
          editableBoxShadow: editableStyle.boxShadow,
          editableBackground: editableStyle.backgroundColor,
          cellOutlineStyle: cellStyle?.outlineStyle || '',
          cellOutlineWidth: cellStyle?.outlineWidth || '',
          cellBoxShadow: cellStyle?.boxShadow || '',
          cellBackground: cellStyle?.backgroundColor || '',
        }
      })
    const borderEvidence = `${metrics.editableBoxShadow} ${metrics.cellBoxShadow}`
    const backgroundEvidence = `${metrics.editableBackground} ${metrics.cellBackground}`
    assert(
      metrics.activeElementMatches &&
        !/dashed/iu.test(metrics.editableOutlineStyle) &&
        !/dashed/iu.test(metrics.cellOutlineStyle) &&
        /rgba?\(/iu.test(borderEvidence) &&
        borderEvidence !== 'none none' &&
        borderEvidence.includes('rgba(47, 143, 75, 0.82)') &&
        backgroundEvidence.includes('rgba(47, 143, 75, 0.08)'),
      `${scenarioLabel} 编辑焦点边框应统一为合同模板同款实线内描边和浅绿色底色，不能继续用虚线或另一套绿色: ${JSON.stringify(metrics)}`
    )
  }
  const assertPrintEditableFocusSurvivesSwitch = async (
    page,
    { firstSelector, secondSelector, scenarioLabel }
  ) => {
    const first = page.locator(firstSelector).first()
    const second = page.locator(secondSelector).first()
    await first.waitFor({ state: 'visible', timeout: 10_000 })
    await second.waitFor({ state: 'visible', timeout: 10_000 })
    await first.click()
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
    )
    await page.keyboard.type('9')
    await second.click()
    await page.waitForTimeout(600)
    const metrics = await second.evaluate((element) => {
      const style = window.getComputedStyle(element)
      return {
        activeElementMatches: document.activeElement === element,
        boxShadow: style.boxShadow,
        background: style.backgroundColor,
        text: String(element.textContent || '').trim(),
      }
    })
    assert(
      metrics.activeElementMatches &&
        /rgba?\(/iu.test(metrics.boxShadow) &&
        metrics.background !== 'rgba(0, 0, 0, 0)',
      `${scenarioLabel} 从一个编辑框切到另一个编辑框后，前一个 blur 提交不应让新焦点和边框消失: ${JSON.stringify(metrics)}`
    )
  }
  const assertContractPaperSidePaddingAndTableWidth = async (
    page,
    { paperSelector, tableSelector, scenarioLabel, screenshotName }
  ) => {
    const metrics = await page.evaluate(
      ({ paperSelector, tableSelector }) => {
        const paper = document.querySelector(paperSelector)
        const table = document.querySelector(tableSelector)
        const paperRect = paper?.getBoundingClientRect()
        const tableRect = table?.getBoundingClientRect()
        const paperStyle = paper ? window.getComputedStyle(paper) : null
        return {
          foundPaper: Boolean(paper),
          foundTable: Boolean(table),
          paperWidth: paperRect?.width || 0,
          tableWidth: tableRect?.width || 0,
          paperPaddingLeft: Number.parseFloat(paperStyle?.paddingLeft || '0'),
          paperPaddingRight: Number.parseFloat(paperStyle?.paddingRight || '0'),
          tableLeftGap:
            paperRect && tableRect ? tableRect.left - paperRect.left : -1,
          tableRightGap:
            paperRect && tableRect ? paperRect.right - tableRect.right : -1,
          tableScrollWidth: table?.scrollWidth || 0,
          tableClientWidth: table?.clientWidth || 0,
          paperScrollWidth: paper?.scrollWidth || 0,
          paperClientWidth: paper?.clientWidth || 0,
        }
      },
      { paperSelector, tableSelector }
    )
    assert(
      metrics.foundPaper &&
        metrics.foundTable &&
        metrics.paperPaddingLeft >= 18 &&
        metrics.paperPaddingLeft <= 22 &&
        metrics.paperPaddingRight >= 18 &&
        metrics.paperPaddingRight <= 22 &&
        metrics.tableLeftGap <= metrics.paperPaddingLeft + 1 &&
        metrics.tableRightGap <= metrics.paperPaddingRight + 1 &&
        metrics.tableWidth >=
          metrics.paperWidth -
            metrics.paperPaddingLeft -
            metrics.paperPaddingRight -
            2 &&
        metrics.tableScrollWidth <= metrics.tableClientWidth + 1 &&
        metrics.paperScrollWidth <= metrics.paperClientWidth + 1,
      `${scenarioLabel} 纸面左右留白应收窄到 5mm 且表格不横向溢出: ${JSON.stringify(metrics)}`
    )
    if (screenshotName) {
      const paperLocator = page.locator(paperSelector).first()
      await paperLocator.screenshot({
        path: path.join(outputDir, `${screenshotName}.png`),
      })
    }
  }
  const assertPrintWorkspacePaperTopRhythm = async (
    page,
    { paperSelector, scenarioLabel, screenshotName = '' }
  ) => {
    const metrics = await page.evaluate((selector) => {
      const toolbar = document.querySelector('.erp-print-shell__toolbar')
      const content = document.querySelector('.erp-print-shell__content')
      const stage = document.querySelector('.erp-print-shell__stage')
      const paper = document.querySelector(selector)
      const toolbarRect = toolbar?.getBoundingClientRect()
      const contentRect = content?.getBoundingClientRect()
      const stageRect = stage?.getBoundingClientRect()
      const paperRect = paper?.getBoundingClientRect()
      const stageStyle = stage ? window.getComputedStyle(stage) : null

      return {
        foundToolbar: Boolean(toolbar),
        foundContent: Boolean(content),
        foundStage: Boolean(stage),
        foundPaper: Boolean(paper),
        toolbarToContent:
          toolbarRect && contentRect
            ? contentRect.top - toolbarRect.bottom
            : -1,
        contentToStage:
          contentRect && stageRect ? stageRect.top - contentRect.top : -1,
        stageToPaper:
          stageRect && paperRect ? paperRect.top - stageRect.top : -1,
        toolbarToPaper:
          toolbarRect && paperRect ? paperRect.top - toolbarRect.bottom : -1,
        stagePaddingTop: Number.parseFloat(stageStyle?.paddingTop || '0'),
        stageBorderTop: Number.parseFloat(stageStyle?.borderTopWidth || '0'),
        stageScrollHeight: stage?.scrollHeight || 0,
        stageClientHeight: stage?.clientHeight || 0,
        paperTop: paperRect?.top || 0,
        paperWidth: paperRect?.width || 0,
      }
    }, paperSelector)

    assert(
      metrics.foundToolbar &&
        metrics.foundContent &&
        metrics.foundStage &&
        metrics.foundPaper &&
        Math.abs(metrics.toolbarToContent - 12) <= 1 &&
        Math.abs(metrics.contentToStage) <= 1 &&
        Math.abs(metrics.stagePaddingTop - 24) <= 1 &&
        Math.abs(metrics.stageToPaper - 25) <= 1 &&
        Math.abs(metrics.toolbarToPaper - 37) <= 1 &&
        metrics.paperWidth > 700,
      `${scenarioLabel} 纸面编辑区到顶部工具栏的外层间距应和五套正式模板一致: ${JSON.stringify(metrics)}`
    )

    if (screenshotName) {
      await page.screenshot({
        path: path.join(outputDir, `${screenshotName}.png`),
        fullPage: false,
      })
    }
  }

  const createAppendixSVGFile = (
    templateKey,
    { index, width = 640, height = 360, label = `Appendix ${index}` }
  ) => {
    const colors = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe']
    const color = colors[(Math.max(1, Number(index)) - 1) % colors.length]
    const bandHeight = Math.max(180, Math.min(600, Math.round(height / 4)))
    const bands = Array.from(
      { length: Math.max(1, Math.ceil(height / bandHeight)) },
      (_, bandIndex) => {
        const y = bandIndex * bandHeight
        return [
          `<rect x="0" y="${y}" width="${width}" height="${Math.min(
            bandHeight,
            height - y
          )}" fill="${bandIndex % 2 === 0 ? color : '#ffffff'}"/>`,
          `<text x="${width / 2}" y="${Math.min(
            height - 24,
            y + bandHeight / 2
          )}" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(
            28,
            Math.min(52, Math.round(width / 12))
          )}" fill="#0f172a">${label} · ${bandIndex + 1}</text>`,
        ].join('')
      }
    ).join('')
    const name = `${templateKey}-appendix-${index}.svg`
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      bands,
      `<rect x="8" y="8" width="${Math.max(1, width - 16)}" height="${Math.max(
        1,
        height - 16
      )}" rx="18" fill="none" stroke="#334155" stroke-width="4"/>`,
      '</svg>',
    ].join('')
    return {
      name,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg),
    }
  }

  const createAppendixSVGFiles = (templateKey, startIndex, count) => {
    const halfWidthHeights = [360, 520, 420, 640, 480]
    return Array.from({ length: count }, (_, offset) => {
      const index = startIndex + offset
      return createAppendixSVGFile(templateKey, {
        index,
        height: halfWidthHeights[(index - 1) % halfWidthHeights.length],
      })
    })
  }

  const waitForPrintAppendixImageCount = async (
    page,
    { paperSelector, expectedCount }
  ) => {
    await page.waitForFunction(
      ({ paperSelector, expectedCount }) => {
        const paper = document.querySelector(paperSelector)
        const appendix = paper?.querySelector('[data-print-appendix-images]')
        const manager = document.querySelector('[data-print-appendix-manager]')
        const logicalImages = Array.from(
          appendix?.querySelectorAll('[data-print-appendix-image-id]') || []
        )
        const renderedSegments = Array.from(
          appendix?.querySelectorAll('[data-print-appendix-segment] img') || []
        )
        return (
          appendix?.getAttribute('data-print-appendix-image-count') ===
            String(expectedCount) &&
          manager?.querySelectorAll('[data-print-appendix-manager-item]')
            .length === expectedCount &&
          logicalImages.length === expectedCount &&
          renderedSegments.length >= expectedCount &&
          renderedSegments.every(
            (image) => image.complete && image.naturalWidth > 0
          )
        )
      },
      { paperSelector, expectedCount },
      { timeout: 20_000 }
    )
  }

  const assertPrintAppendixImageLayout = async (
    page,
    {
      templateTitle,
      paperSelector,
      expectedNames,
      expectedLayouts = expectedNames.map(() => 'half'),
      expectedRequestedLayouts = expectedNames.map(() => 'auto'),
      expectedSegmentCounts = expectedNames.map(() => 1),
    }
  ) => {
    await page.waitForFunction(
      ({ paperSelector, expectedNames }) => {
        const paper = document.querySelector(paperSelector)
        const appendix = paper?.querySelector('[data-print-appendix-images]')
        const names = Array.from(
          appendix?.querySelectorAll('[data-print-appendix-image-id]') || []
        ).map((image) => image.getAttribute('data-print-appendix-image-name'))
        return JSON.stringify(names) === JSON.stringify(expectedNames)
      },
      { paperSelector, expectedNames },
      { timeout: 10_000 }
    )
    const metrics = await page.evaluate((paperSelector) => {
      const paper = document.querySelector(paperSelector)
      const appendix = paper?.querySelector('[data-print-appendix-images]')
      const manager = document.querySelector('[data-print-appendix-manager]')
      const rows = Array.from(
        appendix?.querySelectorAll('[data-print-appendix-row]') || []
      )
      const images = Array.from(
        appendix?.querySelectorAll('[data-print-appendix-image-id]') || []
      )
      const rowMetrics = rows.map((row) => {
        const rowRect = row.getBoundingClientRect()
        const rowImages = Array.from(
          row.querySelectorAll('[data-print-appendix-image-id]')
        )
        const itemRects = rowImages.map((item) => item.getBoundingClientRect())
        return {
          layout: row.getAttribute('data-print-appendix-row-layout'),
          itemCount: rowImages.length,
          gridColumnCount: window
            .getComputedStyle(row)
            .gridTemplateColumns.split(/\s+/u)
            .filter(Boolean).length,
          top: rowRect.top,
          bottom: rowRect.bottom,
          itemTops: itemRects.map((rect) => rect.top),
          itemBottoms: itemRects.map((rect) => rect.bottom),
        }
      })
      const imageMetrics = images.map((item) => {
        const segmentImages = Array.from(item.querySelectorAll('img'))
        return {
          name: item.getAttribute('data-print-appendix-image-name'),
          requestedLayout: item.getAttribute(
            'data-print-appendix-requested-layout'
          ),
          resolvedLayout: item.getAttribute(
            'data-print-appendix-resolved-layout'
          ),
          column: item.getAttribute('data-print-appendix-column'),
          segmentCount: Number(
            item.getAttribute('data-print-appendix-segment-count') || 0
          ),
          objectFits: segmentImages.map(
            (image) => window.getComputedStyle(image).objectFit
          ),
          segmentRatios: segmentImages.map((image) => {
            const rect = image.getBoundingClientRect()
            return {
              rendered: rect.width > 0 ? rect.height / rect.width : 0,
              natural:
                image.naturalWidth > 0
                  ? image.naturalHeight / image.naturalWidth
                  : 0,
            }
          }),
        }
      })
      return {
        managerCount: document.querySelectorAll('[data-print-appendix-manager]')
          .length,
        managerInRecordPanel: Boolean(
          manager?.closest('.erp-print-shell__record-panel')
        ),
        managerInStage: Boolean(manager?.closest('.erp-print-shell__stage')),
        appendixCount: paper?.querySelectorAll('[data-print-appendix-images]')
          .length,
        declaredImageCount: appendix?.getAttribute(
          'data-print-appendix-image-count'
        ),
        rows: rowMetrics,
        images: imageMetrics,
        managerInsidePaper: Boolean(
          paper?.querySelector('[data-print-appendix-manager]')
        ),
        managerActionButtonsInsidePaper:
          paper?.querySelectorAll(
            '.erp-print-appendix-manager__item-actions button'
          ).length || 0,
      }
    }, paperSelector)
    const expectedRows = []
    let pendingHalf = []
    const flushHalf = () => {
      if (!pendingHalf.length) return
      expectedRows.push({ layout: 'half', indexes: pendingHalf })
      pendingHalf = []
    }
    expectedLayouts.forEach((layout, imageIndex) => {
      if (layout === 'full') {
        flushHalf()
        expectedRows.push({ layout: 'full', indexes: [imageIndex] })
        return
      }
      pendingHalf.push(imageIndex)
      if (pendingHalf.length === 2) flushHalf()
    })
    flushHalf()
    const expectedColumns = expectedRows.flatMap((row) =>
      row.indexes.map((_, columnIndex) =>
        row.layout === 'full' ? 'full' : columnIndex === 0 ? 'left' : 'right'
      )
    )

    assert.equal(
      metrics.managerCount,
      1,
      `${templateTitle} 应只有一个末尾附图管理区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerInRecordPanel,
      true,
      `${templateTitle} 末尾附图管理区应位于左侧控制面: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerInStage,
      false,
      `${templateTitle} 末尾附图管理区不应进入右侧纸面: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.appendixCount,
      1,
      `${templateTitle} 纸面应渲染一个末尾附图区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.declaredImageCount,
      String(expectedNames.length),
      `${templateTitle} 纸面末尾附图数量不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.rows.map((row) => ({
        layout: row.layout,
        itemCount: row.itemCount,
      })),
      expectedRows.map((row) => ({
        layout: row.layout,
        itemCount: row.indexes.length,
      })),
      `${templateTitle} 末尾附图混排行结构不符: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.every(
        (row) =>
          row.gridColumnCount === (row.layout === 'full' ? 1 : 2) &&
          row.itemTops.every((top) => Math.abs(top - row.top) <= 1) &&
          Math.abs(Math.max(...row.itemBottoms) - row.bottom) <= 1
      ),
      `${templateTitle} 半宽行应顶部对齐并由较高图片决定行高，整行图片应独占一列: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.some(
        (row) =>
          row.layout === 'half' &&
          row.itemBottoms.length === 2 &&
          Math.abs(row.itemBottoms[0] - row.itemBottoms[1]) >= 10
      ),
      `${templateTitle} 场景必须包含一组不同高度的半宽图片，才能真实证明下一行按较高图片换行: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.name),
      expectedNames,
      `${templateTitle} 末尾附图纸面顺序应和控制面顺序一致: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.column),
      expectedColumns,
      `${templateTitle} 末尾附图列位置不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.requestedLayout),
      expectedRequestedLayouts,
      `${templateTitle} 末尾附图手动排版偏好不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.resolvedLayout),
      expectedLayouts,
      `${templateTitle} 末尾附图实际排版不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.segmentCount),
      expectedSegmentCounts,
      `${templateTitle} 末尾附图切片数量不符: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.images.every(
        (image) =>
          image.objectFits.every((objectFit) => objectFit === 'contain') &&
          image.segmentRatios.every(
            (ratio) => Math.abs(ratio.rendered - ratio.natural) <= 0.02
          )
      ),
      `${templateTitle} 末尾附图应保持原始比例且不裁切: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.every(
        (row, rowIndex) =>
          rowIndex === metrics.rows.length - 1 ||
          metrics.rows[rowIndex + 1].top >= row.bottom
      ),
      `${templateTitle} 下一行必须从上一行最高图片下方开始: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerInsidePaper,
      false,
      `${templateTitle} 纸面 DOM 不应包含末尾附图管理区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerActionButtonsInsidePaper,
      0,
      `${templateTitle} 纸面 DOM 不应包含前移、后移或移除按钮: ${JSON.stringify(metrics)}`
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
  const multiMobileRoleAdminProfile = Object.freeze({
    username: 'style-l1-sales-quality',
    is_super_admin: false,
    roles: [
      { role_key: 'sales', name: '业务' },
      { role_key: 'quality', name: '品质' },
    ],
    permissions: [
      'mobile.sales.access',
      'mobile.quality.access',
      'workflow.task.read',
    ],
    menus: [{ path: '/erp/dashboard' }],
    erp_preferences: { column_orders: {} },
  })
  const multiMobileRoleEffectiveSession = Object.freeze({
    ...customerRuntimeEffectiveSession,
    configRevision: 'style-l1-entry-multi-role',
    actions: ['workflow.task.read'],
    workflow_visible_owner_role_keys_by_capability: {
      'workflow.task.read': ['sales', 'quality'],
    },
  })
  const localCustomerDesktopPreviewEffectiveSession = Object.freeze({
    configRevision: '',
    configHash: '',
    customer: { key: 'yoyoosun', name: '永绅' },
    pages: ['global-dashboard'],
    actions: ['erp.workbench.read', 'workflow.task.read'],
    workflow_visible_owner_role_keys_by_capability: {
      'workflow.task.read': ['boss'],
    },
    fieldPolicies: {},
    workPools: [],
    source: 'builtin_rbac_fallback',
  })
  let localCustomerDesktopPreviewWorkflowRequests = 0
  let transientProfileSyncCustomerConfigRequests = 0
  let transientProfileSyncAdminMeRequests = 0
  const createDeferred = () => {
    let resolve
    const promise = new Promise((settle) => {
      resolve = settle
    })
    return { promise, resolve }
  }
  let purchaseOrderMaterialReferenceAttempts = 0
  let purchaseOrderMaterialReferenceMode = 'pending'
  let purchaseOrderMaterialReferenceCounts = {}
  let purchaseOrderPendingReferenceRequests = 0
  let purchaseOrderPendingReferenceReleased = false
  let purchaseOrderInitialReferenceStarted = Promise.resolve()
  let purchaseOrderPendingReferenceDrained = Promise.resolve()
  let purchaseOrderFailedRefreshSettled = Promise.resolve()
  let purchaseOrderEmptyRefreshSettled = Promise.resolve()
  let purchaseOrderFullRefreshSettled = Promise.resolve()
  let releasePurchaseOrderInitialReference = () => {}
  let coverageFixtureEnvelopeStatus = 'current'
  let releaseCoverageLoadingResponse = () => {}
  const buildCoverageFixtureReport = () => ({
    schemaVersion: 'plush-test-coverage-report/v1',
    generatedAt: '2026-07-19T01:02:03.000Z',
    repository: {
      commit: 'abcdef1234567890abcdef1234567890abcdef12',
      dirty: false,
      fingerprint:
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
    codeCoverage: {
      go: {
        status: 'collected',
        metrics: { statements: { covered: 91, total: 100 } },
      },
      web: {
        status: 'collected',
        metrics: {
          lines: { percentage: 92.5 },
          branches: { percentage: 86 },
          functions: { covered: 47, total: 50 },
        },
      },
    },
    businessCoverage: {
      status: 'partial',
      domains: [
        {
          key: 'finance',
          label: '财务',
          status: 'passed',
          total: 12,
          passed: 12,
          metrics: { scenarios: { covered: 12, total: 12 } },
        },
        {
          key: 'production',
          label: '生产',
          status: 'not_collected',
        },
        {
          key: 'quality',
          label: '质检',
          status: 'passed',
          requiredCount: 5,
          passed: 4,
          missingCases: 1,
        },
      ],
    },
    gates: [
      {
        key: 'T0',
        label: 'T0 静态检查',
        status: 'passed',
        executed: 3,
        passed: 3,
      },
      {
        key: 'T7',
        label: 'T7 业务集成',
        status: 'blocked',
        executed: 0,
        blocked: 1,
      },
      {
        key: 'T4',
        label: 'T4 未受影响门禁',
        status: 'not_applicable',
        required: false,
        metrics: { scenarios: { percentage: 100 } },
      },
    ],
    acceptance: {
      postgres: { status: 'passed', executed: 2, passed: 2 },
      browser: { status: 'passed', executed: 4, passed: 4 },
      readiness: { status: 'stale', note: '绑定旧验收数据批次' },
      targetEnvironment: { status: 'missing' },
      uat: { status: 'not_collected' },
    },
    policy: {
      businessContracts: '适用业务合同与关键场景目标 100%',
      changedBusinessLogic:
        '新增或修改关键业务逻辑 lines / statements >= 90%、branches >= 85%',
      repositoryBaseline: '仓库整体 baseline 未建立前只采集趋势',
      requiredGates: '本轮 required gates 要求 100% executed + passed',
      runtimeAcceptance:
        '本轮承诺的 PostgreSQL、浏览器、readiness、目标环境和 UAT 分别要求 100%',
    },
  })

  return [
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
    {
      name: 'root-redirect-desktop',
      path: '/',
      mockAdminRpc: true,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务管理')
        await expectButton(page, /^登\s*录$/)
        await expectText(page, '毛绒玩具管理系统')
        await assertAdminLoginLayout(page, { minCardWidth: 520 })
      },
    },
    {
      name: 'root-redirect-mobile',
      path: '/',
      mockAdminRpc: true,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '业务管理')
        await expectButton(page, /^登\s*录$/)
        await expectText(page, '毛绒玩具管理系统')
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-mobile',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectButton(page, /^登\s*录$/)
        await expectText(page, '毛绒玩具管理系统')
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-password-errors-desktop',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/auth')
        await page.route('**/rpc/auth', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'password-error-mock', method, params = {} } = body
          if (method === 'capabilities') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: { sms_login: { enabled: false, mode: 'disabled' } },
                },
              }),
            })
            return
          }

          const failures = {
            missing: [RpcErrorCode.AUTH_USER_NOT_FOUND, '账号不存在'],
            wrong: [RpcErrorCode.AUTH_INVALID_PASSWORD, '密码错误'],
            disabled: [RpcErrorCode.AUTH_USER_DISABLED, '账号已停用'],
            revoked: [RpcErrorCode.AUTH_ACCOUNT_REVOKED, '账号已注销'],
            changed: [
              RpcErrorCode.AUTH_CREDENTIALS_CHANGED,
              '账号信息已变更，请重新登录',
            ],
          }
          const [code, message] = failures[String(params.username)] || [
            RpcErrorCode.INTERNAL,
            '服务器内部错误',
          ]
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { code, message, data: null },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '业务管理')
        const username = page.getByLabel('账号')
        const password = page.getByLabel('密码')
        const submit = page.locator('.erp-login-card button[type="submit"]')
        const alert = page.locator('.erp-login-card .ant-alert-message')
        for (const [account, message] of [
          ['missing', '账号不存在'],
          ['wrong', '密码错误'],
          ['disabled', '账号已停用'],
          ['revoked', '账号已注销'],
          ['changed', '账号信息已变更，请重新登录'],
        ]) {
          await username.fill(account)
          await password.fill('style-l1-password')
          await submit.click()
          await alert.filter({ hasText: message }).waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          assert.equal((await alert.textContent())?.trim(), message)
        }
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-theme-modes-desktop',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '业务管理')
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
        await page.getByText('手机端待办', { exact: true }).click()
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
        await expectText(page, '本次登录验证码')
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
          persistedLoginState.selectedTexts.includes('手机端待办'),
          `工作方式刷新后未保持手机端待办: ${JSON.stringify(
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
        await expectText(page, '业务管理')
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
      customerKey: 'yoyoosun',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await page.getByText('电脑端业务管理', { exact: true }).click()
        await page.getByLabel('账号').fill('style-l1-admin')
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
      name: 'entry-multi-role-login-direct',
      path: '/admin-login',
      mockAdminRpc: true,
      customerKey: 'yoyoosun',
      adminProfile: multiMobileRoleAdminProfile,
      effectiveSession: multiMobileRoleEffectiveSession,
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await page.addInitScript(() => {
          const roleButtonLabels = new Set([
            '老板手机待办',
            '业务手机待办',
            '采购手机待办',
            '生产手机待办',
            '生产经理手机待办',
            '仓库手机待办',
            '财务手机待办',
            'PMC手机待办',
            '品质手机待办',
            '工程手机待办',
          ])
          const evidence = {
            maxEntryButtonCount: 0,
            sawRoleButton: false,
            sawRolePrompt: false,
          }
          window.__entryRoutingEvidence = evidence
          const collect = () => {
            const entryButtons = Array.from(
              document.querySelectorAll('.erp-entry-card__button')
            )
            evidence.maxEntryButtonCount = Math.max(
              evidence.maxEntryButtonCount,
              entryButtons.length
            )
            evidence.sawRoleButton ||= entryButtons.some((button) =>
              roleButtonLabels.has(
                String(button.textContent || '')
                  .replace(/\s+/gu, '')
                  .trim()
              )
            )
            evidence.sawRolePrompt ||=
              document.body?.innerText.includes(
                '请选择这次要处理的岗位待办'
              ) === true
          }
          new MutationObserver(collect).observe(document, {
            childList: true,
            subtree: true,
            characterData: true,
          })
          window.addEventListener('DOMContentLoaded', collect, { once: true })
        })
      },
      verify: async (page) => {
        await page.getByText('手机端待办', { exact: true }).click()
        await page.getByLabel('账号').fill('style-l1-sales-quality')
        await page.locator('#password').fill('style-l1-password')
        await page.getByRole('button', { name: /^登\s*录$/u }).click()
        await waitForPath(page, '/m/sales/tasks')
        await expectText(page, '待办')

        const evidence = await page.evaluate(
          () => window.__entryRoutingEvidence || null
        )
        assert.deepEqual(
          evidence,
          {
            maxEntryButtonCount: 0,
            sawRoleButton: false,
            sawRolePrompt: false,
          },
          `多岗位登录不应经过岗位选择页: ${JSON.stringify(evidence)}`
        )
        assert.equal(
          await page.locator('.erp-entry-card').count(),
          0,
          '多岗位登录完成后不应停留在入口选择卡片'
        )
      },
    },
    {
      name: 'entry-recovery-actions-mobile',
      path: '/entry?reason=mobile-runtime-unavailable',
      auth: 'admin',
      mockAdminRpc: true,
      adminProfile: multiMobileRoleAdminProfile,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '手机待办暂时无法连接')
        await expectButton(page, '电脑端')
        await expectButton(page, '手机待办')
        await expectButton(page, '退出登录')

        const metrics = await page.evaluate(() => {
          const card = document.querySelector('.erp-entry-card')
          const entryButtons = Array.from(
            document.querySelectorAll('.erp-entry-card__button')
          )
          const allButtons = Array.from(
            document.querySelectorAll('.erp-entry-card button')
          )
          const rectFor = (node) => {
            const rect = node.getBoundingClientRect()
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              right: rect.right,
              bottom: rect.bottom,
            }
          }
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: {
              client: document.documentElement.clientWidth,
              scroll: document.documentElement.scrollWidth,
            },
            card: card ? rectFor(card) : null,
            entryButtons: entryButtons.map((button) => ({
              text: String(button.textContent || '')
                .replace(/\s+/gu, '')
                .trim(),
              ...rectFor(button),
            })),
            allButtonTexts: allButtons.map((button) =>
              String(button.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
            ),
          }
        })

        assert.deepEqual(
          metrics.allButtonTexts,
          ['电脑端', '手机待办', '退出登录'],
          `恢复页只应提供工作方式和退出登录: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.entryButtons.length,
          2,
          `恢复页应只有两个工作入口按钮: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.entryButtons.every(
            (button) =>
              button.height >= 56 &&
              Math.abs(button.width - metrics.entryButtons[0].width) <= 1
          ),
          `工作入口按钮应等宽且保持触控高度: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.card &&
            metrics.card.x >= 0 &&
            metrics.card.y >= 0 &&
            metrics.card.right <= metrics.viewport.width + 1 &&
            metrics.card.bottom <= metrics.viewport.height + 1,
          `入口卡片应完整位于手机视口内: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.documentWidth.scroll <= metrics.documentWidth.client + 1,
          `入口恢复页不应横向溢出: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          await page
            .getByRole('button', {
              name: /^(老板|业务|采购|生产|生产经理|仓库|财务|PMC|品质|工程)手机待办$/u,
            })
            .count(),
          0,
          '恢复页不应展示任何角色命名的岗位按钮'
        )
        await page.locator('.erp-entry-card').screenshot({
          path: path.join(outputDir, 'entry-recovery-actions-mobile-card.png'),
        })
      },
    },
    {
      name: 'app-alert-dialog-keyboard-contract',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        const focusOrigin = page
          .getByRole('button', { name: /^登\s*录$/ })
          .first()
        await focusOrigin.focus()
        await page.evaluate(async () => {
          const { appAlert } = await import(
            '/src/common/components/modal/alertBridge.js'
          )
          appAlert({
            title: '登录状态已失效',
            message: '请先登录',
            confirmText: '重新登录',
          })
        })
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'app-alert-dialog-keyboard-contract',
          exerciseEscape: true,
        })
        assert.equal(
          await focusOrigin.evaluate((node) => document.activeElement === node),
          true,
          '通用提示弹窗通过 Escape 关闭后，焦点应回到打开前的控件'
        )

        await page.evaluate(async () => {
          const { appAlert } = await import(
            '/src/common/components/modal/alertBridge.js'
          )
          window.__appAlertConfirmCount = 0
          appAlert({
            title: '登录状态已失效',
            message: '请先登录',
            confirmText: '重新登录',
            onConfirm: () => {
              window.__appAlertConfirmCount += 1
            },
          })
        })
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'app-alert-dialog-keyboard-contract-reopened',
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'app-alert-dialog-keyboard-contract-open.png'
          ),
          fullPage: true,
        })
        await page
          .getByRole('button', { name: '重新登录' })
          .evaluate((button) => {
            button.click()
            button.click()
          })
        await page
          .getByRole('alertdialog')
          .waitFor({ state: 'hidden', timeout: 10_000 })
        await page.waitForFunction(
          () => {
            const appRoot = document.getElementById('root')
            return (
              appRoot &&
              !appRoot.hasAttribute('inert') &&
              !appRoot.hasAttribute('aria-hidden')
            )
          },
          undefined,
          { timeout: 10_000 }
        )
        assert.equal(
          await page.evaluate(() => window.__appAlertConfirmCount),
          1,
          '通用提示弹窗的确认动作必须防止快速重复提交'
        )
        assert.equal(
          await focusOrigin.evaluate((node) => document.activeElement === node),
          true,
          '通用提示弹窗确认关闭后，焦点应回到打开前的控件'
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
        await expectText(page, '业务管理')
      },
    },
    {
      name: 'auth-disabled-alert-desktop',
      path: '/erp/dashboard',
      auth: 'admin-disabled',
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectText(page, '账号已停用')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-disabled-alert-desktop',
          expectedMessage: '账号已停用',
        })
        await assertTextAbsent(page, '今日焦点')
        await assertTextAbsent(page, '待我处理')
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectText(page, '业务管理')
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
        await expectText(page, '账号已停用')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-disabled-alert-mobile-dark',
          expectedMessage: '账号已停用',
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'auth-disabled-alert-mobile-dark-open.png'
          ),
          fullPage: true,
        })
        await assertTextAbsent(page, '今日焦点')
        await assertTextAbsent(page, '待我处理')
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectText(page, '业务管理')
      },
    },
    {
      name: 'erp-dashboard-redirect',
      path: '/erp/dashboard',
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '业务管理')
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
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, '超级管理员')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '功能预览')
        await expectHeading(page, '系统功能总览')
        await expectText(page, '业务功能')
        await expectText(page, '销售订单')
        await expectText(page, '尚未连接客户环境')
        await assertTextAbsent(page, '内部来源')
        await assertTextAbsent(page, '优先处理队列')
        await assertTextAbsent(page, '当前任务上下文')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        const productCoreMetrics = await page.evaluate(() => {
          const dashboard = document.querySelector(
            '[data-product-core-dashboard="true"]'
          )
          const table = document.querySelector('.ant-table')
          const metrics = Array.from(
            document.querySelectorAll('.erp-product-core-metric')
          ).map((item) => item.textContent || '')
          const entries = Array.from(
            document.querySelectorAll('.erp-product-core-entry')
          ).map((item) => item.textContent || '')
          const rect = dashboard?.getBoundingClientRect()
          return {
            hasDashboard: Boolean(dashboard),
            hasTable: Boolean(table),
            metrics,
            entries,
            width: rect?.width || 0,
            height: rect?.height || 0,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert.equal(productCoreMetrics.hasDashboard, true)
        assert.equal(productCoreMetrics.hasTable, false)
        assert(
          productCoreMetrics.metrics.some((item) =>
            item.includes('不读取客户订单')
          ) &&
            productCoreMetrics.entries.some((item) =>
              item.startsWith('销售订单')
            ),
          `Product Core 首页应展示能力总览和审阅入口: ${JSON.stringify(
            productCoreMetrics
          )}`
        )
        assert(
          productCoreMetrics.width > 0 && productCoreMetrics.height > 0,
          `Product Core 首页应有稳定占位: ${JSON.stringify(productCoreMetrics)}`
        )
        assert(
          productCoreMetrics.scrollWidth <= productCoreMetrics.clientWidth + 1,
          `Product Core 首页不应横向溢出: ${JSON.stringify(productCoreMetrics)}`
        )
        await page.getByRole('button', { name: /^销售订单/ }).click()
        await waitForPath(page, '/erp/sales/project-orders/sales-orders')
        await expectText(page, '销售订单 功能预览')
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '系统功能总览')
      },
    },
    {
      name: 'erp-yoyo-global-dashboard-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-yoyo-global-dashboard',
        configHash: 'style-l1-yoyo-global-dashboard-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard', 'task-board'],
        actions: [
          'erp.workbench.read',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['boss'],
          'workflow.task.update': ['boss'],
          'workflow.task.complete': ['boss'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-boss',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板' }],
        permissions: [
          'erp.workbench.read',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        menus: [
          {
            key: 'global-dashboard',
            label: '全局看板',
            path: '/erp/dashboard',
            required_any: ['erp.workbench.read'],
            required_all: [],
          },
          {
            key: 'task-board',
            label: '任务看板',
            path: '/erp/task-board',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
        ],
      },
      viewport: { width: 1440, height: 600 },
      verify: async (page) => {
        await expectHeading(page, '工作台')
        await expectText(page, '待我处理')
        await expectText(page, '阻塞/逾期')
        await expectText(page, '优先处理')
        await expectText(page, '任务详情')
        await assertTextAbsent(page, '等待交接')
        for (const engineeringText of [
          'Product Core',
          'customer key',
          'Workflow',
          'RBAC',
          'source document',
          '内部来源',
        ]) {
          await assertTextAbsent(page, engineeringText)
        }

        const seededTaskCount = await page.evaluate(async () => {
          const now = Math.floor(Date.now() / 1000)
          const createTask = async ({ index, overdue = false }) => {
            const suffix = String(index).padStart(2, '0')
            const kind = overdue ? 'risk' : 'actionable'
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `workbench-long-queue-${kind}-${suffix}`,
                method: 'create_task',
                params: {
                  task_code: `style-l1-workbench-${kind}-${suffix}`,
                  task_group: 'sales-orders',
                  task_name: `${overdue ? '长队列逾期' : '长队列待办'} ${suffix}`,
                  source_type: 'sales-orders',
                  source_id: 10_000 + index + (overdue ? 1_000 : 0),
                  source_no: `SO-LONG-${overdue ? 'R' : 'A'}-${suffix}`,
                  business_status_key: 'project_pending',
                  task_status_key: 'ready',
                  owner_role_key: 'boss',
                  priority: overdue ? 90 : 1,
                  due_at: overdue
                    ? now - (10 - index) * 60
                    : now + 86_400 + index * 60,
                  payload: { notification_type: 'task_created' },
                },
              }),
            })
            const body = await response.json()
            if (!response.ok || body?.result?.code !== 0) {
              throw new Error(
                `create long workbench task failed: ${JSON.stringify(body)}`
              )
            }
          }

          for (let index = 1; index <= 18; index += 1) {
            await createTask({ index })
          }
          for (let index = 1; index <= 9; index += 1) {
            await createTask({ index, overdue: true })
          }
          return 27
        })
        assert.equal(seededTaskCount, 27, '工作台长队列样本应完整创建')
        await page.getByRole('button', { name: '刷新当前页' }).click()

        const queuePanel = page.locator('.erp-workbench-queue-panel')
        const detailPanel = page.locator('.erp-workbench-task-detail')
        const actionableFilter = page.getByRole('button', {
          name: /待我处理，\d+ 项/,
        })
        const riskFilter = page.getByRole('button', {
          name: /阻塞\/逾期，\d+ 项/,
        })
        const actionableLabel =
          await actionableFilter.getAttribute('aria-label')
        const actionableTotal = Number(
          String(actionableLabel || '').match(/待我处理，(\d+) 项/u)?.[1] || 0
        )
        assert(
          actionableTotal >= 18,
          `工作台待处理队列应包含新建的 18 条样本: ${actionableLabel}`
        )
        assert.equal(
          await queuePanel.locator('.ant-table-tbody .ant-table-row').count(),
          8,
          '工作台长队列首屏应只展示 8 项'
        )
        await queuePanel.locator('.ant-pagination-item-2').click()
        await queuePanel
          .locator('.ant-pagination-item-2.ant-pagination-item-active')
          .waitFor({ state: 'visible', timeout: 10_000 })

        const riskLabel = await riskFilter.getAttribute('aria-label')
        const riskTotal = Number(
          String(riskLabel || '').match(/阻塞\/逾期，(\d+) 项/u)?.[1] || 0
        )
        assert(
          riskTotal >= 9,
          `工作台风险队列应包含新建的 9 条样本: ${riskLabel}`
        )
        await riskFilter.click()
        await queuePanel
          .locator('.ant-table-tbody .ant-table-row')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        await actionableFilter.click()

        const queueRows = queuePanel.locator('.ant-table-tbody .ant-table-row')
        const queueRowCount = await queueRows.count()
        assert.equal(queueRowCount, 8, '工作台待处理队列首屏应保持 8 条')
        const firstTaskName = String(
          await queueRows
            .first()
            .locator('.erp-workbench-task-cell .ant-typography')
            .first()
            .textContent()
        ).trim()
        const secondTaskName = String(
          await queueRows
            .nth(1)
            .locator('.erp-workbench-task-cell .ant-typography')
            .first()
            .textContent()
        ).trim()
        await queueRows.nth(1).focus()
        await detailPanel
          .getByText(secondTaskName, { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await queueRows.first().focus()
        await detailPanel
          .getByText(firstTaskName, { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await queueRows.first().dblclick({ position: { x: 24, y: 20 } })
        const workbenchTaskDrawer = page.locator('.erp-task-action-drawer')
        await workbenchTaskDrawer.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await workbenchTaskDrawer
          .getByText('长队列待办 01', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-row-double-click.png'
          ),
        })
        await workbenchTaskDrawer.locator('.ant-drawer-close').click()
        await workbenchTaskDrawer.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })

        const metrics = await page.evaluate(async () => {
          const dashboard = document.querySelector('.erp-workbench-command')
          const queue = document.querySelector('.erp-workbench-queue-panel')
          const detail = document.querySelector('.erp-workbench-task-detail')
          const content = document.querySelector('.erp-admin-content')
          const selectedRow = queue?.querySelector(
            '.erp-workbench-task-row--active[aria-selected="true"]'
          )
          const pageRows = queue?.querySelectorAll(
            '.ant-table-tbody .ant-table-row'
          )
          const pagination = queue?.querySelector('.ant-pagination')
          const sideStack = document.querySelector('.erp-workbench-side-stack')
          const processingHint = detail?.querySelector(
            '.erp-task-processing-hint'
          )
          const dashboardRect = dashboard?.getBoundingClientRect()
          const queueRect = queue?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          const paginationRect = pagination?.getBoundingClientRect()
          const contentRect = content?.getBoundingClientRect()
          const contentPaddingTop = content
            ? Number.parseFloat(window.getComputedStyle(content).paddingTop) ||
              0
            : 0
          const expectedStickyTop =
            (contentRect?.top || 0) + contentPaddingTop + 12
          const stickyThreshold = Math.max(
            0,
            (sideStack?.getBoundingClientRect().top || 0) - expectedStickyTop
          )
          if (content) {
            content.scrollTop = stickyThreshold + 48
          }
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
          const stickyTopAfterScroll =
            sideStack?.getBoundingClientRect().top || 0
          const contentScrollTop = content?.scrollTop || 0
          const sideStackHeight = sideStack?.getBoundingClientRect().height || 0
          const contentClientHeight = content?.clientHeight || 0
          const contentScrollHeight = content?.scrollHeight || 0
          if (content) content.scrollTop = 0
          return {
            dashboardWidth: dashboardRect?.width || 0,
            queueWidth: queueRect?.width || 0,
            detailWidth: detailRect?.width || 0,
            pageRowCount: pageRows?.length || 0,
            paginationVisible: Boolean(
              paginationRect?.width > 0 && paginationRect?.height > 0
            ),
            selectedRowText: String(selectedRow?.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            selectedRowCount: queue?.querySelectorAll(
              '.erp-workbench-task-row--active[aria-selected="true"]'
            ).length,
            focusableRowCount: queue?.querySelectorAll(
              '.ant-table-tbody .ant-table-row[tabindex="0"]'
            ).length,
            sideStackPosition: sideStack
              ? window.getComputedStyle(sideStack).position
              : '',
            contentScrollTop,
            contentClientHeight,
            contentScrollHeight,
            contentPaddingTop,
            expectedStickyTop,
            stickyThreshold,
            stickyTopAfterScroll,
            sideStackHeight,
            processingHintClientWidth: processingHint?.clientWidth || 0,
            processingHintScrollWidth: processingHint?.scrollWidth || 0,
            stickyPinnedAfterScroll: Boolean(
              contentRect &&
                contentScrollTop >= stickyThreshold &&
                Math.abs(stickyTopAfterScroll - expectedStickyTop) <= 2
            ),
            queueOverlapsDetail: Boolean(
              queueRect &&
                detailRect &&
                queueRect.right > detailRect.left + 1 &&
                queueRect.left < detailRect.right - 1
            ),
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert(
          metrics.dashboardWidth > 0 &&
            metrics.queueWidth > 0 &&
            metrics.detailWidth > 0 &&
            !metrics.queueOverlapsDetail &&
            metrics.pageRowCount === 8 &&
            metrics.paginationVisible &&
            metrics.selectedRowCount === 1 &&
            metrics.focusableRowCount === 8 &&
            metrics.selectedRowText.includes(firstTaskName) &&
            metrics.processingHintClientWidth > 0 &&
            metrics.processingHintScrollWidth <=
              metrics.processingHintClientWidth + 1 &&
            metrics.sideStackPosition === 'sticky' &&
            metrics.stickyPinnedAfterScroll &&
            metrics.documentOverflowX <= 1,
          `永绅全局工作台队列与上下文不得重叠或推宽页面: ${JSON.stringify(
            metrics
          )}`
        )

        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForFunction(
          () => {
            const grid = document.querySelector('.erp-workbench-main-grid')
            return (
              grid &&
              getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1
            )
          },
          null,
          { timeout: 10_000 }
        )
        const mobileMetrics = await page.evaluate(() => {
          const queue = document.querySelector('.erp-workbench-queue-panel')
          const detail = document.querySelector('.erp-workbench-task-detail')
          const pagination = queue?.querySelector('.ant-pagination')
          const sideStack = document.querySelector('.erp-workbench-side-stack')
          const processingHint = detail?.querySelector(
            '.erp-task-processing-hint'
          )
          const queueRect = queue?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          const paginationRect = pagination?.getBoundingClientRect()
          return {
            queueBottom: queueRect?.bottom || 0,
            detailTop: detailRect?.top || 0,
            paginationWidth: paginationRect?.width || 0,
            queueWidth: queueRect?.width || 0,
            sideStackPosition: sideStack
              ? window.getComputedStyle(sideStack).position
              : '',
            processingHintClientWidth: processingHint?.clientWidth || 0,
            processingHintScrollWidth: processingHint?.scrollWidth || 0,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert(
          mobileMetrics.queueWidth > 0 &&
            mobileMetrics.paginationWidth > 0 &&
            mobileMetrics.paginationWidth <= mobileMetrics.queueWidth + 1 &&
            mobileMetrics.detailTop >= mobileMetrics.queueBottom - 1 &&
            mobileMetrics.processingHintClientWidth > 0 &&
            mobileMetrics.processingHintScrollWidth <=
              mobileMetrics.processingHintClientWidth + 1 &&
            mobileMetrics.sideStackPosition !== 'sticky' &&
            mobileMetrics.documentOverflowX <= 1,
          `永绅全局工作台窄屏分页、队列和上下文应按文档流排列: ${JSON.stringify(
            mobileMetrics
          )}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-mobile-long-queue-top.png'
          ),
        })
        await detailPanel.scrollIntoViewIfNeeded()
        await detailPanel.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-mobile-long-queue-context.png'
          ),
        })

        await page.setViewportSize({ width: 1440, height: 900 })
        await clickERPThemeOption(page, '暗色')
        await assertERPThemeMode(page, {
          scenarioName: 'erp-yoyo-global-dashboard-dark-long-queue',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-yoyo-global-dashboard-dark-long-queue',
          selector: '.erp-workbench-queue-panel',
        })
        await page.locator('.erp-workbench-command-card').screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-dark-long-queue.png'
          ),
        })
        await clickERPThemeOption(page, '浅色')
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
        pages: ['global-dashboard', 'shipments'],
        actions: [
          'shipment.read',
          'shipment.create',
          'shipment.cancel',
          'shipment.ship',
          'sales_order.read',
        ],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      expectPath: '/erp/warehouse/shipments',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await assertTextAbsent(page, '产品核心评审不读取客户业务数据')
        await expectButton(page, '新建草稿')
        assert.equal(
          await page.getByRole('button', { name: '新建草稿' }).isDisabled(),
          false,
          'super admin 客户运行态应保留业务页动作入口'
        )
        const pageMetrics = await page.evaluate(() => {
          const shell = document.querySelector('.erp-admin-shell')
          const guard = document.querySelector(
            '[data-product-core-business-data-guard="true"]'
          )
          const table = document.querySelector('.ant-table')
          const menu = document.querySelector('.erp-admin-menu')
          const tableRect = table?.getBoundingClientRect()
          return {
            visibilityMode:
              shell?.getAttribute('data-effective-session-mode') || '',
            dataRuntimeScope:
              shell?.getAttribute('data-effective-session-data-scope') || '',
            hasGuard: Boolean(guard),
            hasTable: Boolean(table),
            menuText: menu?.textContent || '',
            tableWidth: tableRect?.width || 0,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert.equal(pageMetrics.visibilityMode, 'super_admin_product_core')
        assert.equal(pageMetrics.dataRuntimeScope, 'customer_runtime')
        assert.equal(pageMetrics.hasGuard, false)
        assert.equal(pageMetrics.hasTable, true)
        assert(
          pageMetrics.menuText.includes('出货单'),
          `super admin 客户运行态侧栏应显示客户业务导航: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          pageMetrics.scrollWidth <= pageMetrics.clientWidth + 1,
          `super admin 客户运行态业务页不应横向溢出: ${JSON.stringify(
            pageMetrics
          )}`
        )
      },
    },
    {
      name: 'erp-effective-session-super-admin-product-core-no-customer-business-dashboard',
      path: '/erp/business-dashboard',
      auth: 'admin',
      expectPath: '/erp/business-dashboard',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectText(page, '超级管理员')
        await expectText(page, '业务看板 功能预览')
        await expectText(page, '功能说明')
        await expectText(page, '尚未连接客户环境')
        await assertTextAbsent(page, '产品核心评审不读取客户业务数据')
        await assertTextAbsent(page, '业务对象')
        await assertTextAbsent(page, '对象总量')
        await assertTextAbsent(page, '核心链路健康')
        const pageMetrics = await page.evaluate(() => {
          const guard = document.querySelector(
            '[data-product-core-business-data-guard="true"]'
          )
          const review = document.querySelector(
            '[data-product-core-capability-review="true"]'
          )
          const dashboard = document.querySelector(
            '.erp-business-dashboard-page'
          )
          const table = document.querySelector('.ant-table')
          const menu = document.querySelector('.erp-admin-menu')
          const reviewRect = review?.getBoundingClientRect()
          return {
            hasGuard: Boolean(guard),
            hasReview: Boolean(review),
            hasBusinessDashboard: Boolean(dashboard),
            hasTable: Boolean(table),
            menuText: menu?.textContent || '',
            reviewWidth: reviewRect?.width || 0,
            reviewHeight: reviewRect?.height || 0,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert.equal(pageMetrics.hasGuard, true)
        assert.equal(pageMetrics.hasReview, true)
        assert.equal(pageMetrics.hasBusinessDashboard, false)
        assert.equal(pageMetrics.hasTable, false)
        assert(
          pageMetrics.menuText.includes('系统功能总览') &&
            pageMetrics.menuText.includes('系统设置') &&
            pageMetrics.menuText.includes('模板打印中心') &&
            pageMetrics.menuText.includes('权限管理'),
          `无客户 Product Core 侧栏应显示控制面导航: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          !pageMetrics.menuText.includes('业务看板') &&
            !pageMetrics.menuText.includes('BOM 管理') &&
            !pageMetrics.menuText.includes('委外订单'),
          `无客户 Product Core 侧栏不应显示客户业务导航: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          pageMetrics.reviewWidth > 0 && pageMetrics.reviewHeight > 0,
          `无客户 Product Core 能力审阅页应有稳定占位: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          pageMetrics.scrollWidth <= pageMetrics.clientWidth + 1,
          `无客户 Product Core 能力审阅页不应横向溢出: ${JSON.stringify(
            pageMetrics
          )}`
        )
      },
    },
    {
      name: 'erp-effective-session-direct-url-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [
          'system.permission.read',
          'system.role.permission.manage',
        ],
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
        await expectText(page, '毛绒玩具管理系统')
        await expectEffectiveSessionMode(
          page,
          'local_dev_customer_config_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '岗位设置')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-effective-session-configured-customer-builtin-fallback-local-preview',
      path: '/erp/dashboard',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-yoyo-preview-boss',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板' }],
        permissions: ['erp.workbench.read', 'workflow.task.read'],
        menus: [
          {
            key: 'global-dashboard',
            label: '全局看板',
            path: '/erp/dashboard',
            required_any: ['erp.workbench.read'],
            required_all: [],
          },
        ],
      },
      customerKey: 'yoyoosun',
      effectiveSession: localCustomerDesktopPreviewEffectiveSession,
      expectPath: '/erp/dashboard',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        localCustomerDesktopPreviewWorkflowRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname === '/rpc/workflow') {
            localCustomerDesktopPreviewWorkflowRequests += 1
          }
        })
      },
      verify: async (page) => {
        await page.locator('.erp-admin-shell').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await expectText(page, '工作台 功能预览')
        await expectText(page, '本地功能预览')
        await expectText(page, '当前尚未启用客户业务设置')
        await expectText(page, '工作台、任务看板和业务数据暂时不能使用')
        await assertTextAbsent(page, '暂时无法进入工作台')
        await assertTextAbsent(page, '优先处理队列')

        const shellMetrics = await page.evaluate(() => {
          const shell = document.querySelector('.erp-admin-shell')
          const previewNotice = document.querySelector(
            '[data-local-customer-desktop-preview="true"]'
          )
          return {
            source: shell?.getAttribute('data-effective-session-source') || '',
            dataRuntimeScope:
              shell?.getAttribute('data-effective-session-data-scope') || '',
            hasPreviewNotice: Boolean(previewNotice),
            hasBusinessDataGuard: Boolean(
              document.querySelector(
                '[data-product-core-business-data-guard="true"]'
              )
            ),
          }
        })
        assert.deepEqual(shellMetrics, {
          source: 'builtin_rbac_fallback',
          dataRuntimeScope: 'customer_runtime_missing',
          hasPreviewNotice: true,
          hasBusinessDataGuard: true,
        })
        assert.equal(
          localCustomerDesktopPreviewWorkflowRequests,
          0,
          '本地功能预览不得读取或写入 Workflow 任务'
        )
      },
    },
    {
      name: 'erp-effective-session-configured-customer-transient-sync-recovers',
      path: '/erp/dashboard',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['erp.workbench.read', 'workflow.task.read'],
        menus: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
      customerKey: 'yoyoosun',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        transientProfileSyncCustomerConfigRequests = 0
        transientProfileSyncAdminMeRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/admin') {
            return
          }
          const body = request.postDataJSON() || {}
          if (body.method === 'me') {
            transientProfileSyncAdminMeRequests += 1
          }
        })
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          transientProfileSyncCustomerConfigRequests += 1
          const result =
            method === 'get_effective_session' &&
            transientProfileSyncCustomerConfigRequests <= 2
              ? {
                  code: RpcErrorCode.INTERNAL,
                  message: '客户有效配置读取暂时不可用',
                  data: {},
                }
              : {
                  code: 0,
                  message: 'OK',
                  data: {
                    session: {
                      configRevision: 'style-l1-transient-recovery',
                      configHash: 'style-l1-transient-recovery-hash',
                      customer: { key: 'yoyoosun', name: '永绅' },
                      pages: ['global-dashboard'],
                      actions: ['erp.workbench.read', 'workflow.task.read'],
                      fieldPolicies: {},
                      workPools: [],
                      source: 'active_customer_config_revision',
                    },
                  },
                }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ jsonrpc: '2.0', id, result }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '工作台')
        await expectText(page, '优先处理')
        await assertTextAbsent(page, '暂时无法进入工作台')
        assert.equal(
          transientProfileSyncCustomerConfigRequests,
          3,
          '首次进入工作台应在两次瞬时失败后恢复，不要求用户手动重试'
        )
        assert.equal(
          transientProfileSyncAdminMeRequests,
          1,
          'React StrictMode 首次挂载必须复用同一个 profile single-flight'
        )
      },
    },
    {
      name: 'erp-effective-session-configured-customer-sync-failure-blocked',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [
          'system.permission.read',
          'system.role.permission.manage',
        ],
        menus: [{ key: 'permission-center', path: '/erp/system/permissions' }],
      },
      customerKey: 'yoyoosun',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          if (method === 'get_effective_session') {
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
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
        await expectText(page, '正在进入工作台')
        await expectText(page, '正在准备您的工作内容，请稍候...')
        await assertTextAbsent(page, '正在进入客户工作台')
        await expectText(page, '暂时无法进入工作台')
        await expectText(page, '为避免显示错误内容，系统没有加载工作台')
        await assertTextAbsent(page, '当前客户')
        await assertTextAbsent(page, '权限管理')
        await assertTextAbsent(page, '岗位设置')
        const boundaryMetrics = await page.evaluate(() => {
          const boundary = document.querySelector(
            '[data-customer-runtime-boundary="true"]'
          )
          const menu = document.querySelector('.erp-admin-menu')
          const visibleButtonTexts = [...document.querySelectorAll('button')]
            .filter(
              (button) => button.offsetWidth > 0 && button.offsetHeight > 0
            )
            .map((button) =>
              String(button.textContent || '').replace(/\s+/gu, '')
            )
          const rect = boundary?.getBoundingClientRect()
          return {
            boundaryWidth: rect?.width || 0,
            boundaryHeight: rect?.height || 0,
            hasMenu: Boolean(menu),
            visibleButtonTexts,
            overflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert(
          boundaryMetrics.boundaryWidth > 0 &&
            boundaryMetrics.boundaryHeight > 0 &&
            boundaryMetrics.hasMenu === false &&
            boundaryMetrics.visibleButtonTexts.includes('重试') &&
            boundaryMetrics.visibleButtonTexts.includes('退出登录') &&
            boundaryMetrics.overflow <= 1,
          `配置客户 effective session 同步失败时应 fail closed 且不挂载业务壳: ${JSON.stringify(
            boundaryMetrics
          )}`
        )
      },
    },
    {
      name: 'erp-effective-session-empty-pages-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [
          'system.permission.read',
          'system.role.permission.manage',
        ],
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
        await expectText(page, '毛绒玩具管理系统')
        await expectEffectiveSessionMode(
          page,
          'local_dev_customer_config_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '岗位设置')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-no-permission-menu-falls-back-help-center',
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
      expectPath: '/erp/help-center',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '岗位使用帮助')
        await assertTextAbsent(page, '当前客户有效配置')
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
            '质量检验',
            '入库管理',
            '销售订单',
            '采购订单',
            '委外订单',
            '权限管理',
            '系统操作记录',
          ]) {
            assert(
              menuText.includes(label),
              `普通账号菜单应保留 active pages 投影允许的入口 ${label}: ${menuText}`
            )
          }
          for (const label of [
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
        const shipmentDetailButton = page
          .getByRole('button', { name: '查看明细' })
          .first()
        await shipmentDetailButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(
          await shipmentDetailButton.isDisabled(),
          false,
          '出货详情是只读能力，不应被写动作投影禁用'
        )
        await expectProjectedActionDisabled(
          '确认出货',
          '出货页 actions 为空时不应允许确认出货'
        )

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '质量检验')
        await expectText(page, 'QI-STYLE-L1')
        await expectProjectedActionDisabled(
          '补建来料质检',
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
        await expectNoButton(page, '添加明细')
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
      effectiveSession: {
        configRevision: 'style-l1-task-board-customer-runtime',
        configHash: 'style-l1-task-board-customer-runtime-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard', 'task-board', 'shipping-release'],
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [
            'boss',
            'sales',
            'purchase',
            'engineering',
            'production',
            'warehouse',
            'finance',
            'pmc',
            'quality',
          ],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, '超级管理员')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '看板中心')
        await expectHeading(page, '任务看板')
        await expectText(page, '常规待办')
        await expectText(page, '阻塞')
        await expectText(page, '到期提醒')
        await expectText(page, '已结束')
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
        const approvalInboxButton = page.getByRole('button', {
          name: '待我审批',
          exact: true,
        })
        await approvalInboxButton.click()
        await expectHeading(page, '待我审批')
        await expectText(
          page,
          '只显示服务端登记为审批节点且当前账号可见的事项；审批仍受岗位、指定处理人、配置版本和单据状态约束。'
        )
        const approvalInboxLayout = await page.evaluate(() => {
          const card = document.querySelector('.erp-dashboard-task-board-card')
          const heading = [...document.querySelectorAll('h1, h2, h3')].find(
            (element) => element.textContent?.trim() === '待我审批'
          )
          const backButton = [...document.querySelectorAll('button')].find(
            (element) => element.textContent?.trim() === '返回全部任务'
          )
          const cardRect = card?.getBoundingClientRect()
          const headingRect = heading?.getBoundingClientRect()
          const backButtonRect = backButton?.getBoundingClientRect()
          return {
            cardFits:
              Boolean(card) &&
              Number(card?.scrollWidth || 0) <= Number(card?.clientWidth || 0),
            headingVisible:
              Boolean(cardRect && headingRect) &&
              headingRect.left >= cardRect.left &&
              headingRect.right <= cardRect.right,
            backButtonVisible:
              Boolean(cardRect && backButtonRect) &&
              backButtonRect.left >= cardRect.left &&
              backButtonRect.right <= cardRect.right,
          }
        })
        assert(
          approvalInboxLayout.cardFits &&
            approvalInboxLayout.headingVisible &&
            approvalInboxLayout.backButtonVisible,
          `待我审批入口存在溢出或不可见控件: ${JSON.stringify(
            approvalInboxLayout
          )}`
        )
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-approval-inbox.png'),
        })
        await page
          .getByRole('button', { name: '返回全部任务', exact: true })
          .click()
        await expectHeading(page, '任务看板')
        const navigationTask = await page.evaluate(async () => {
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
                task_group: 'trial_warehouse_work',
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
          const body = await response.json()
          if (!response.ok || body?.result?.code !== 0) {
            throw new Error(
              `create_task failed: ${JSON.stringify(body?.result || body)}`
            )
          }
          return body?.result?.data?.task || null
        })
        assert(
          Number(navigationTask?.id) > 0 && Number(navigationTask?.version) > 0,
          `任务看板冲突回归缺少任务版本: ${JSON.stringify(navigationTask)}`
        )
        const paginationTasks = await page.evaluate(async () => {
          const tasks = await Promise.all(
            Array.from({ length: 17 }, async (_, index) => {
              const suffix = String(index + 1).padStart(2, '0')
              const response = await fetch('/rpc/workflow', {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: `dashboard-task-pagination-${suffix}`,
                  method: 'create_task',
                  params: {
                    task_code: `style-l1-dashboard-pagination-${suffix}`,
                    task_group: 'trial_warehouse_work',
                    task_name: `看板分页测试任务 ${suffix}`,
                    source_type: 'shipping-release',
                    source_id: 9020 + index,
                    source_no: `OUT-DASH-PAGE-${suffix}`,
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
              const body = await response.json()
              if (!response.ok || body?.result?.code !== 0) {
                throw new Error(
                  `create pagination task failed: ${JSON.stringify(body?.result || body)}`
                )
              }
              return body?.result?.data?.task || null
            })
          )
          return tasks.filter((task) => Number(task?.id) > 0)
        })
        assert.equal(
          paginationTasks.length,
          17,
          '任务看板分页回归应成功准备十七条补充任务'
        )
        const expectedSecondPageFirstTask = [
          navigationTask,
          ...paginationTasks,
        ].sort((left, right) => Number(right.id) - Number(left.id))[8]
        assert(
          Number(expectedSecondPageFirstTask?.id) > 0,
          `任务看板分页回归缺少第二页首条任务: ${JSON.stringify({
            navigationTask,
            paginationTasks,
          })}`
        )
        await page.getByRole('button', { name: '刷新当前页' }).click()
        const actionableOverviewLane = page
          .locator('.erp-task-board-lane')
          .filter({ hasText: '常规待办' })
          .first()
        await actionableOverviewLane
          .getByText('已显示前 5 条，共 18 条', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await actionableOverviewLane.locator('.erp-task-board-card').count(),
          5,
          '任务看板总览每栏最多显示五条任务'
        )
        await actionableOverviewLane
          .getByRole('button', { name: '查看全部 18 条', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page
          .locator('.erp-task-center-metric')
          .filter({ hasText: '常规待办' })
          .click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('lane') === 'actionable' && params.get('page') === '1'
          )
        })
        await page
          .locator('.erp-task-board-lanes--focused')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-task-board-lanes--focused .erp-task-board-lane'
            ).length === 1 &&
            document.querySelectorAll(
              '.erp-task-board-lanes--focused .erp-task-board-card'
            ).length === 8,
          undefined,
          { timeout: 10_000 }
        )
        assert.equal(
          await page.locator('.erp-task-board-lane').count(),
          1,
          '聚焦任务泳道时只应显示当前泳道'
        )
        assert.equal(
          await page.locator('.erp-task-board-card').count(),
          8,
          '聚焦任务泳道每页应显示八条任务'
        )
        const secondPageButton = page.locator(
          '.erp-task-board-lane-footer .ant-pagination-item-2'
        )
        await secondPageButton.scrollIntoViewIfNeeded()
        const paginationScrollBefore = await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const pagination = document.querySelector(
            '.erp-task-board-lane-footer .ant-pagination'
          )
          const contentRect = content?.getBoundingClientRect()
          const paginationRect = pagination?.getBoundingClientRect()
          return {
            scrollTop: content?.scrollTop || 0,
            paginationVisible: Boolean(
              contentRect &&
                paginationRect &&
                paginationRect.top >= contentRect.top &&
                paginationRect.bottom <= contentRect.bottom
            ),
          }
        })
        assert(
          paginationScrollBefore.scrollTop > 0 &&
            paginationScrollBefore.paginationVisible,
          `任务看板分页前必须真实滚到页面下方并看见分页器: ${JSON.stringify(
            paginationScrollBefore
          )}`
        )
        await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const trace = [content?.scrollTop || 0]
          const handleScroll = () => trace.push(content?.scrollTop || 0)
          content?.addEventListener('scroll', handleScroll)
          window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__ = trace
          window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_CLEANUP__ = () =>
            content?.removeEventListener('scroll', handleScroll)
        })
        await secondPageButton.click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            params.get('lane') === 'actionable' &&
            params.get('page') === '2' &&
            document.querySelectorAll('.erp-task-board-card').length === 8
          )
        })
        await page
          .locator('.erp-task-board-card')
          .first()
          .getByText(expectedSecondPageFirstTask.task_name, { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const paginationScrollAfter = await page.evaluate(() => {
          window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_CLEANUP__?.()
          const content = document.querySelector('.erp-admin-content')
          const focusedLanes = document.querySelector(
            '.erp-task-board-lanes--focused'
          )
          const firstCard = focusedLanes?.querySelector('.erp-task-board-card')
          const contentRect = content?.getBoundingClientRect()
          const lanesRect = focusedLanes?.getBoundingClientRect()
          const firstCardRect = firstCard?.getBoundingClientRect()
          const paddingTop = content
            ? Number.parseFloat(window.getComputedStyle(content).paddingTop) ||
              0
            : 0
          const expectedTop = (contentRect?.top || 0) + paddingTop + 12
          const scrollTrace = Array.isArray(
            window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__
          )
            ? [...window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__]
            : []
          delete window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_TRACE__
          delete window.__PLUSH_TASK_BOARD_PAGINATION_SCROLL_CLEANUP__
          return {
            scrollTop: content?.scrollTop || 0,
            scrollTrace,
            expectedTop,
            lanesTop: lanesRect?.top || 0,
            lanesTopError: Math.abs((lanesRect?.top || 0) - expectedTop),
            firstCardVisible: Boolean(
              contentRect &&
                firstCardRect &&
                firstCardRect.top >= contentRect.top &&
                firstCardRect.top < contentRect.bottom
            ),
          }
        })
        assert(
          paginationScrollAfter.scrollTop > 0 &&
            paginationScrollAfter.scrollTrace.length > 0 &&
            Math.min(...paginationScrollAfter.scrollTrace) > 0 &&
            paginationScrollAfter.lanesTopError <= 2 &&
            paginationScrollAfter.firstCardVisible,
          `任务看板翻页后应定位当前泳道起点，不能跳回整页顶部: ${JSON.stringify(
            paginationScrollAfter
          )}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-desktop-pagination-page-2.png'
          ),
        })
        await page
          .getByRole('button', { name: '查看全部分类', exact: true })
          .click()
        await page.waitForFunction(() => {
          const params = new URLSearchParams(window.location.search)
          return (
            !params.has('lane') &&
            !params.has('page') &&
            document.querySelectorAll('.erp-task-board-lane').length === 4
          )
        })
        const taskBoardSearch =
          page.getByPlaceholder('搜索任务、单号、来源、处理原因')
        await taskBoardSearch.fill('OUT-DASH-NAV')
        await taskBoardSearch.press('Enter')
        await page.waitForFunction(() =>
          new URLSearchParams(window.location.search).has('q')
        )
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-task-role-filter-sales',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-role-filter-sales',
                task_group: 'trial_sales_work',
                task_name: '业务岗位筛选边界任务',
                source_type: 'project-orders',
                source_id: 9011,
                source_no: 'SO-ROLE-FILTER',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'sales',
                payload: {},
              },
            }),
          })
          const body = await response.json()
          if (!response.ok || body?.result?.code !== 0) {
            throw new Error(
              `create sales role task failed: ${JSON.stringify(body?.result || body)}`
            )
          }
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '任务看板')
        await page.getByText('全部可见岗位').click()
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
          .getByText('处理提示', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await navigationCurrentTask
          .getByText('系统按任务状态、可用操作和关联入口生成', {
            exact: true,
          })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const processingHintMetrics = await navigationCurrentTask
          .locator('.erp-task-processing-hint')
          .evaluate((node) => ({
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
          }))
        assert(
          processingHintMetrics.clientWidth > 0 &&
            processingHintMetrics.clientHeight > 0 &&
            processingHintMetrics.scrollWidth <=
              processingHintMetrics.clientWidth + 1 &&
            processingHintMetrics.scrollHeight <=
              processingHintMetrics.clientHeight + 1,
          `任务看板处理提示不应裁切或横向溢出: ${JSON.stringify(
            processingHintMetrics
          )}`
        )
        await navigationCurrentTask.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-processing-hint.png'),
        })
        await navigationCurrentTask
          .getByRole('button', { name: '处理任务', exact: true })
          .click()
        const taskDrawer = page.locator('.erp-task-action-drawer')
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-context-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '核对任务信息',
          expectReasonInput: false,
        })
        const actionStep = taskDrawer.getByRole('tab', {
          name: /选择处理/,
        })
        const confirmStep = taskDrawer.getByRole('tab', {
          name: /确认与提交/,
        })
        assert.equal(
          await confirmStep.getAttribute('aria-disabled'),
          'true',
          '未选择处理方式前确认步骤必须禁用'
        )
        await actionStep.click()
        await taskDrawer.getByRole('radio', { name: /处理完成/ }).click()
        assert.equal(
          await confirmStep.getAttribute('aria-disabled'),
          'false',
          '选择处理方式后确认步骤应可直接点击'
        )
        await confirmStep.click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-complete-confirmation',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '即将提交',
          expectReasonInput: false,
        })
        const conflictMutation = await page.evaluate(
          async ({ taskID, expectedVersion }) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'dashboard-task-version-conflict',
                method: 'urge_task',
                params: {
                  task_id: taskID,
                  expected_version: expectedVersion,
                  idempotency_key: `style-l1-dashboard-conflict:${taskID}`,
                  action: 'urge_task',
                  reason: '模拟另一位处理人先更新任务',
                },
              }),
            })
            return response.json()
          },
          {
            taskID: navigationTask.id,
            expectedVersion: navigationTask.version,
          }
        )
        assert.equal(
          conflictMutation?.result?.code,
          0,
          `准备任务版本冲突失败: ${JSON.stringify(conflictMutation)}`
        )
        await taskDrawer.getByRole('button', { name: '确认完成' }).click()
        await page
          .getByText('任务已被其他人更新，请刷新后重试', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await navigationCurrentTask
          .getByRole('button', { name: '处理任务', exact: true })
          .click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-desktop-refreshed-context-drawer',
          expectedTaskText: '看板跳转测试任务',
          expectedActionText: '核对任务信息',
          expectReasonInput: false,
        })
        await taskDrawer.getByRole('tab', { name: /选择处理/ }).click()
        await taskDrawer.getByRole('radio', { name: /标记阻塞/ }).click()
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
        await taskBoardSearch.fill('OUT-DASH-NAV')
        await taskBoardSearch.press('Enter')
        await page
          .locator('.erp-task-board-card')
          .filter({ hasText: '看板跳转测试任务' })
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        const navigationLaneTask = page
          .locator('.erp-task-board-card')
          .filter({ hasText: '看板跳转测试任务' })
          .first()
        await navigationLaneTask
          .locator('.erp-task-board-card-meta')
          .first()
          .dblclick()
        await taskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await taskDrawer
          .getByText('看板跳转测试任务', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.screenshot({
          path: path.resolve(outputDir, 'erp-task-board-card-double-click.png'),
        })
        await taskDrawer.locator('.ant-drawer-close').click()
        await taskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await expectNoButton(page, '看板跳转测试任务')
      },
    },
    {
      name: 'erp-task-board-single-role-scope-desktop',
      path: '/erp/task-board?role=sales',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-task-board-warehouse-scope',
        configHash: 'style-l1-task-board-warehouse-scope-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        roles: ['warehouse'],
        pages: ['task-board'],
        actions: ['workflow.task.read'],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
        },
        fieldPolicies: {},
        workPools: ['warehouse'],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        id: 42,
        username: 'style-l1-warehouse-board',
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['workflow.task.read'],
        menus: [
          {
            key: 'task-board',
            label: '任务看板',
            path: '/erp/task-board',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
        ],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '任务看板')
        await page.waitForFunction(
          () => !new URLSearchParams(window.location.search).has('role')
        )
        assert.equal(
          await page.getByLabel('负责岗位').count(),
          0,
          '普通单岗位账号不应显示可切换岗位的筛选控件'
        )
        assert.equal(
          await page.getByText('全部可见岗位', { exact: true }).count(),
          0,
          '普通单岗位账号不应出现全部岗位入口'
        )
        const filterMetrics = await page
          .locator('.erp-task-board-filters')
          .evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            roleSelectCount: element.querySelectorAll('[aria-label="负责岗位"]')
              .length,
          }))
        assert.equal(filterMetrics.roleSelectCount, 0)
        assert(
          filterMetrics.scrollWidth <= filterMetrics.clientWidth + 1,
          `单岗位筛选区不应溢出: ${JSON.stringify(filterMetrics)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-task-board-single-role-scope-desktop.png'
          ),
        })
      },
    },
    {
      name: 'erp-business-dashboard-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, '超级管理员')
        await expectText(page, '看板中心')
        await expectHeading(page, '业务看板')
        await expectText(page, '基础资料')
        await expectText(page, '业务单据')
        await expectText(page, '办理结果')
        await expectText(page, '需要关注')
        await expectText(page, '业务数据')
        await assertTextAbsent(page, '内部来源')
        await expectText(page, '业务环节')
        await expectText(page, '采购/入库')
        await expectText(page, '当前数量')
        await assertTextAbsent(page, '数字说明')
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
        await assertNoHorizontalOverflow(page, 'erp-business-dashboard-desktop')
        await assertBusinessDashboardCountStates(
          page,
          'erp-business-dashboard-desktop'
        )
        const customerSourceRow = page
          .getByRole('button', { name: '查看客户', exact: true })
          .locator('xpath=ancestor::tr[1]')
        const customerSourceBeforeHover = await customerSourceRow.evaluate(
          (element) => {
            const rect = element.getBoundingClientRect()
            const style = getComputedStyle(element.querySelector('td'))
            return {
              width: rect.width,
              height: rect.height,
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
            }
          }
        )
        await customerSourceRow.hover()
        await page.waitForFunction(
          ({ backgroundColor, borderColor }) => {
            const sourceItem = document
              .querySelector('[aria-label="查看客户"]')
              ?.closest('tr.erp-business-board-source-item--openable')
            const sourceCell = sourceItem?.querySelector('td')
            if (!sourceCell) return false
            const style = getComputedStyle(sourceCell)
            return (
              style.backgroundColor !== backgroundColor ||
              style.borderColor !== borderColor
            )
          },
          customerSourceBeforeHover,
          { timeout: 2_000 }
        )
        const customerSourceAfterHover = await customerSourceRow.evaluate(
          (element) => {
            const rect = element.getBoundingClientRect()
            const sourceCell = element.querySelector('td')
            const style = getComputedStyle(sourceCell)
            const cells = Array.from(element.querySelectorAll(':scope > td'))
            const recordCell = cells[1]
            const countCell = cells[2]
            const tableCard = element.closest('.erp-dashboard-table-card')
            const tableCardRect = tableCard?.getBoundingClientRect()
            const tableScrollContainer = tableCard?.querySelector(
              '.ant-table-content, .ant-table-body'
            )
            const tableScrollStyle = tableScrollContainer
              ? getComputedStyle(tableScrollContainer)
              : null
            const entryButton = element.querySelector(
              '.erp-business-board-source-entry'
            )
            const entryButtonRect = entryButton?.getBoundingClientRect()
            return {
              width: rect.width,
              height: rect.height,
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
              recordCellFits:
                Boolean(recordCell) &&
                recordCell.scrollWidth <= recordCell.clientWidth + 1,
              countCellFits:
                Boolean(countCell) &&
                countCell.scrollWidth <= countCell.clientWidth + 1,
              tableScroll: {
                clientWidth: tableScrollContainer?.clientWidth || 0,
                scrollWidth: tableScrollContainer?.scrollWidth || 0,
                overflowX: tableScrollStyle?.overflowX || '',
              },
              entryButtonWithinCard: Boolean(
                tableCardRect &&
                  entryButtonRect &&
                  entryButtonRect.left >= tableCardRect.left - 1 &&
                  entryButtonRect.right <= tableCardRect.right + 1
              ),
            }
          }
        )
        const tableScrollIsControlled =
          customerSourceAfterHover.tableScroll.clientWidth > 0 &&
          customerSourceAfterHover.tableScroll.scrollWidth >=
            customerSourceAfterHover.tableScroll.clientWidth &&
          (customerSourceAfterHover.tableScroll.scrollWidth <=
            customerSourceAfterHover.tableScroll.clientWidth + 1 ||
            ['auto', 'scroll'].includes(
              customerSourceAfterHover.tableScroll.overflowX
            ))
        assert(
          customerSourceAfterHover.width === customerSourceBeforeHover.width &&
            customerSourceAfterHover.height ===
              customerSourceBeforeHover.height &&
            customerSourceAfterHover.recordCellFits &&
            customerSourceAfterHover.countCellFits &&
            customerSourceAfterHover.entryButtonWithinCard &&
            tableScrollIsControlled &&
            (customerSourceAfterHover.backgroundColor !==
              customerSourceBeforeHover.backgroundColor ||
              customerSourceAfterHover.borderColor !==
                customerSourceBeforeHover.borderColor),
          `业务来源项 hover 应有反馈且不改变尺寸或产生溢出: ${JSON.stringify({
            before: customerSourceBeforeHover,
            after: customerSourceAfterHover,
          })}`
        )
        await customerSourceRow.screenshot({
          path: path.resolve(
            outputDir,
            'erp-business-dashboard-source-double-click-hover.png'
          ),
        })
        await customerSourceRow.dblclick()
        await waitForPath(page, '/erp/master/partners/customers')
        await page.goBack()
        await waitForPath(page, '/erp/business-dashboard')
        await expectHeading(page, '业务看板')
        await page
          .getByRole('button', { name: '查看客户', exact: true })
          .click()
        await waitForPath(page, '/erp/master/partners/customers')
        await page.goBack()
        await waitForPath(page, '/erp/business-dashboard')
        await expectHeading(page, '业务看板')
      },
    },
    {
      name: 'erp-business-dashboard-dark-desktop',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectHeading(page, '业务看板')
        await expectText(page, '基础资料')
        await expectText(page, '业务数据')
        await expectText(page, '需要关注')
        await assertTextAbsent(page, '数字说明')
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
          selector: '.erp-dashboard-table-card',
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
      name: 'erp-business-dashboard-stats-unavailable-desktop',
      path: '/erp/business-dashboard?__style_l1_business_dashboard_stats_unavailable=1',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务看板')
        await expectText(page, '业务统计暂不可用')
        await page
          .locator('[aria-label^="需要关注 93"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const customerCount = await page
          .getByRole('button', { name: '查看客户', exact: true })
          .locator('xpath=ancestor::tr[1]')
          .locator('.erp-business-board-source-count')
          .textContent()
        assert.equal(String(customerCount || '').trim(), '—')
        await assertTextAbsent(page, '待办概览暂不可用')
        await assertTextAbsent(page, '当前页面数据已刷新')
        await page
          .locator('.erp-admin-header button')
          .filter({ hasText: '刷新当前页' })
          .click()
        await expectText(page, '当前页面数据已刷新')
        await page.waitForFunction(
          () =>
            String(
              document
                .querySelector('[aria-label="查看客户"]')
                ?.closest('.erp-business-board-source-item--openable')
                ?.querySelector('.erp-business-board-source-count')
                ?.textContent || ''
            ).trim() === '60',
          undefined,
          { timeout: 10_000 }
        )
        await page
          .locator('.erp-business-board-inline-alert')
          .filter({ hasText: '业务统计暂不可用' })
          .waitFor({ state: 'detached', timeout: 10_000 })
        await page
          .locator('.ant-message-notice')
          .last()
          .waitFor({ state: 'detached', timeout: 10_000 })
      },
    },
    {
      name: 'erp-business-dashboard-workflow-unavailable-desktop',
      path: '/erp/business-dashboard?__style_l1_business_dashboard_workflow_unavailable=1',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务看板')
        await expectText(page, '待办概览暂不可用')
        await expectText(page, '60')
        await page
          .locator('[aria-label^="需要关注 暂不可用"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertTextAbsent(page, '业务统计暂不可用')
        await assertTextAbsent(page, '当前页面数据已刷新')
        await page
          .locator('.erp-admin-header button')
          .filter({ hasText: '刷新当前页' })
          .click()
        await expectText(page, '当前页面数据已刷新')
        await page
          .locator('[aria-label^="需要关注 93"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page
          .locator('.erp-business-board-inline-alert')
          .filter({ hasText: '待办概览暂不可用' })
          .waitFor({ state: 'detached', timeout: 10_000 })
        await page
          .locator('.ant-message-notice')
          .last()
          .waitFor({ state: 'detached', timeout: 10_000 })
      },
    },
    {
      name: 'erp-business-dashboard-large-count-desktop',
      path: '/erp/business-dashboard?__style_l1_business_dashboard_large=1',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '业务看板')
        await expectText(page, '1,234,567')
        await expectText(page, '1,234,698')
        await page
          .getByRole('button', { name: '查看客户', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
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
        await expectText(page, '业务管理')
        await expectText(page, '系统功能总览')
        await expectText(page, '业务功能')
        await expectText(page, '系统设置')
        await assertTextAbsent(page, '内部来源')
        await assertTextAbsent(page, '优先处理队列')
        await assertNoDuplicatedAdminPageTitle(page, {
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
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
        },
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'dashboard-mobile-task',
              method: 'create_task',
              params: {
                task_code: 'style-l1-dashboard-mobile-task',
                task_group: 'trial_warehouse_work',
                task_name: '移动端任务处理回归',
                source_type: 'shipping-release',
                source_id: 9050,
                source_no: 'OUT-DASH-MOBILE',
                business_status_key: 'shipment_pending',
                task_status_key: 'ready',
                owner_role_key: 'warehouse',
                payload: { notification_type: 'task_created' },
              },
            }),
          })
          const body = await response.json()
          if (!response.ok || body?.result?.code !== 0) {
            throw new Error(
              `create mobile task failed: ${JSON.stringify(body)}`
            )
          }
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '移动端任务处理回归')
        await expectText(page, '超级管理员')
        await expectText(page, '业务管理')
        await expectText(page, '任务看板')
        await expectText(page, '常规待办')
        await expectText(page, '到期提醒')
        await expectText(page, '从下方任务卡选择一条任务')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-task-board-mobile',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-task-board-mobile',
          expectTaskMetrics: true,
        })
        await page
          .locator('.erp-task-board-card')
          .filter({ hasText: '移动端任务处理回归' })
          .getByRole('button', {
            name: '查看移动端任务处理回归详情',
            exact: true,
          })
          .waitFor({ state: 'visible', timeout: 10_000 })
      },
    },
    {
      name: 'erp-dashboard-dark-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectText(page, '系统功能总览')
        await expectText(page, '业务功能')
        await expectText(page, '不显示客户业务数据')
        await assertTextAbsent(page, '优先处理队列')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
        })
        await assertERPThemeMode(page, {
          scenarioName: 'erp-dashboard-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
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
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-task-board-dark-wide',
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.reject',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
          'workflow.task.reject': ['warehouse'],
        },
      },
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectText(page, '任务看板')
        await expectText(page, '常规待办')
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
                task_group: 'trial_warehouse_work',
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
        await page
          .getByPlaceholder('搜索任务、单号、来源、处理原因')
          .press('Enter')
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
          .getByRole('button', { name: '处理任务', exact: true })
          .click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-context-drawer',
          expectedTaskText: '宽屏重叠回归任务',
          expectedActionText: '核对任务信息',
          expectReasonInput: false,
        })
        await page
          .locator('.erp-task-action-drawer')
          .getByRole('tab', { name: /选择处理/ })
          .click()
        await page
          .locator('.erp-task-action-drawer')
          .getByRole('radio', { name: /处理完成/ })
          .click()
        await assertTaskActionDrawerLayout(page, {
          scenarioName: 'erp-task-board-dark-wide-complete-action',
          expectedTaskText: '宽屏重叠回归任务',
          expectedActionText: '提交后任务会进入已完成',
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
      effectiveSession: customerRuntimeEffectiveSession,
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
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-module-dark-customers-desktop 客户档案不应展示空的任务面板'
        )
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
      name: 'mobile-customer-runtime-sync-failure-customer-copy',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      adminProfile: {
        username: 'style-l1-mobile-runtime-failure',
        is_super_admin: true,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions: [
          'mobile.engineering.access',
          'workflow.task.read',
          'workflow.task.update',
        ],
        menus: [],
      },
      viewport: { width: 430, height: 900 },
      beforeNavigate: async (page) => {
        page.__customerCopyWorkflowCalls = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.endsWith('/rpc/workflow')) {
            page.__customerCopyWorkflowCalls += 1
          }
        })
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          if (method === 'get_effective_session') {
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                code:
                  method === 'get_effective_session'
                    ? RpcErrorCode.INTERNAL
                    : 0,
                message:
                  method === 'get_effective_session'
                    ? '工作范围同步失败'
                    : 'OK',
                data: {},
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '正在准备手机待办')
        await expectText(page, '正在确认您的岗位权限和工作范围，请稍候...')
        await assertTextAbsent(page, '当前客户运行环境')
        await expectText(page, '暂时无法进入手机待办')
        await expectText(page, '当前账号的工作范围尚未准备完成')
        await expectButton(page, '选择其他工作入口')
        await expectButton(page, '退出登录')
        await assertTextAbsent(page, '客户运行环境')
        await assertTextAbsent(page, '对应客户入口')
        assert.equal(
          page.__customerCopyWorkflowCalls,
          0,
          '工作范围同步失败时不得请求岗位任务数据'
        )
      },
    },
    {
      name: 'mobile-yoyo-role-task-projection',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-yoyo-role-task-projection',
        configHash: 'style-l1-mobile-yoyo-role-task-projection-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [
            'engineering',
            'production',
            'warehouse',
            'quality',
            'finance',
          ],
          'workflow.task.update': [
            'engineering',
            'production',
            'warehouse',
            'quality',
            'finance',
          ],
          'workflow.task.complete': [
            'engineering',
            'production',
            'warehouse',
            'quality',
            'finance',
          ],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-role-user',
        is_super_admin: false,
        roles: [
          { role_key: 'engineering', name: '工程' },
          { role_key: 'production', name: '生产' },
          { role_key: 'warehouse', name: '仓库' },
          { role_key: 'quality', name: '品质' },
          { role_key: 'finance', name: '财务' },
        ],
        permissions: [
          'mobile.engineering.access',
          'mobile.production.access',
          'mobile.warehouse.access',
          'mobile.quality.access',
          'mobile.finance.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        menus: [],
      },
      viewport: { width: 430, height: 900 },
      verify: async (page) => {
        const roles = [
          {
            key: 'engineering',
            label: '工程',
            taskName: '工程资料与 BOM 待补齐核对任务',
          },
          {
            key: 'production',
            label: '生产',
            taskName: '车缝加工交期与现场进度核对任务',
          },
          {
            key: 'warehouse',
            label: '仓库',
            taskName: '主料仓到料与待检批次交接任务',
          },
          {
            key: 'quality',
            label: '品质',
            taskName: '来料检验判定与不合格品返馈任务',
          },
          {
            key: 'finance',
            label: '财务',
            taskName: '加工合同对账与应付确认任务',
          },
        ]

        await expectText(page, '工程')
        await page.evaluate(async (roleEntries) => {
          const createTask = async (role, index) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `mobile-role-projection-${role.key}`,
                method: 'create_task',
                params: {
                  task_code: `STYLE-L1-YOYO-${role.key.toUpperCase()}`,
                  task_group: 'project-orders',
                  task_name: role.taskName,
                  source_type: 'project-orders',
                  source_id: 12_000 + index,
                  source_no: `YOYO-${role.key.toUpperCase()}-超长来源单号-20260710`,
                  business_status_key: 'project_pending',
                  task_status_key: 'ready',
                  owner_role_key: role.key,
                  priority: index + 1,
                  payload: {
                    customer_name: '永绅试用模拟客户（非真实客户数据）',
                    style_no: `STYLE-${role.key.toUpperCase()}-LONG-VALUE`,
                    due_date: '2026-07-16',
                  },
                },
              }),
            })
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
          }
          await Promise.all(
            roleEntries.map((role, index) => createTask(role, index))
          )
        }, roles)

        for (const role of roles) {
          await gotoScenarioPath(page, `/m/${role.key}/tasks`, {
            waitUntil: 'domcontentloaded',
          })
          await waitForPath(page, `/m/${role.key}/tasks`)
          await expectText(page, role.label)
          await expectText(page, role.taskName)
          const metrics = await page.evaluate(() => {
            const root = document.querySelector('.mobile-role-tasks-page')
            const scroller = document.querySelector(
              '.mobile-role-tasks-page__scroll'
            )
            const taskRows = Array.from(
              document.querySelectorAll('.erp-mobile-list-item')
            )
            const rootRect = root?.getBoundingClientRect()
            return {
              rootWidth: rootRect?.width || 0,
              rootLeft: rootRect?.left || 0,
              rootRight: rootRect?.right || 0,
              viewportWidth: window.innerWidth,
              documentOverflowX:
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
              scrollerOverflowX:
                scroller instanceof HTMLElement
                  ? scroller.scrollWidth - scroller.clientWidth
                  : 0,
              taskRowOverflowX: taskRows.map((row) =>
                row instanceof HTMLElement
                  ? row.scrollWidth - row.clientWidth
                  : 0
              ),
            }
          })
          assert(
            metrics.rootWidth > 0 &&
              metrics.rootLeft >= -1 &&
              metrics.rootRight <= metrics.viewportWidth + 1 &&
              metrics.documentOverflowX <= 1 &&
              metrics.scrollerOverflowX <= 1 &&
              metrics.taskRowOverflowX.every((value) => value <= 1),
            `${role.label}岗位任务端长文字不应推宽页面或任务行: ${JSON.stringify(
              metrics
            )}`
          )
          await page.waitForTimeout(350)
          await page.screenshot({
            path: path.join(outputDir, `mobile-yoyo-${role.key}-task-list.png`),
            fullPage: true,
          })
          await page
            .locator('.erp-mobile-list-item')
            .filter({ hasText: role.taskName })
            .click()
          await expectText(page, role.taskName)
          const actionDiagnostic = await page.evaluate(async (taskName) => {
            const call = async (domain, method, params = {}) => {
              const response = await fetch(`/rpc/${domain}`, {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: `mobile-action-diagnostic-${method}`,
                  method,
                  params,
                }),
              })
              return response.json()
            }
            const [sessionPayload, taskPayload] = await Promise.all([
              call('customer_config', 'get_effective_session', {
                customer_key: 'yoyoosun',
              }),
              call('workflow', 'list_tasks', { limit: 200 }),
            ])
            const tasks = taskPayload?.result?.data?.tasks || []
            const selected = tasks.find((task) => task.task_name === taskName)
            const actionAccessPayload = selected
              ? await call('workflow', 'explain_action_access', {
                  task_id: selected.id,
                })
              : null
            return {
              roles: JSON.parse(localStorage.getItem('admin_roles') || '[]'),
              permissions: JSON.parse(
                localStorage.getItem('admin_permissions') || '[]'
              ),
              sessionActions:
                sessionPayload?.result?.data?.session?.actions || [],
              actionAccess: actionAccessPayload?.result || null,
              task: selected
                ? {
                    ownerRoleKey: selected.owner_role_key,
                    statusKey: selected.task_status_key,
                  }
                : null,
            }
          }, role.taskName)
          const processButton = page.getByRole('button', {
            name: '处理任务',
            exact: true,
          })
          await processButton
            .waitFor({ state: 'visible', timeout: 10_000 })
            .catch((error) => {
              throw new Error(
                `${error.message}\naction diagnostic: ${JSON.stringify(actionDiagnostic)}`
              )
            })
          assert.equal(
            await processButton.isDisabled(),
            false,
            `${role.label}岗位有角色、RBAC 与 effective-session 动作时应开放处理入口: ${JSON.stringify(
              actionDiagnostic
            )}`
          )
          await processButton.click()
          const actionScreen = page.getByTestId('mobile-task-action-screen')
          await actionScreen
            .waitFor({ state: 'visible', timeout: 10_000 })
            .catch((error) => {
              throw new Error(
                `${error.message}\naction diagnostic: ${JSON.stringify(actionDiagnostic)}`
              )
            })
          await expectText(page, '选择处理方式')
          const actionMetrics = await actionScreen.evaluate((screen) => {
            const card = screen.querySelector(
              '[data-testid="mobile-task-action-options"]'
            )
            const heading = card?.querySelector('h2')
            const cardRect = card?.getBoundingClientRect()
            const headingRect = heading?.getBoundingClientRect()
            return {
              actions: Array.from(
                screen.querySelectorAll('label[data-action-key]')
              ).map((choice) => ({
                text: choice.textContent?.replace(/\s+/g, ' ').trim() || '',
                disabled:
                  choice.querySelector('input[type="radio"]')?.disabled ?? true,
                selected:
                  choice.querySelector('input[type="radio"]')?.checked ?? false,
              })),
              radiogroupCount: screen.querySelectorAll('[role="radiogroup"]')
                .length,
              fakeActionButtonCount: card?.querySelectorAll(
                'button[aria-pressed]'
              ).length,
              cardContainsHeading: Boolean(
                cardRect &&
                  headingRect &&
                  headingRect.top >= cardRect.top - 1 &&
                  headingRect.bottom <= cardRect.bottom + 1 &&
                  headingRect.left >= cardRect.left - 1 &&
                  headingRect.right <= cardRect.right + 1
              ),
              cardOverflowX:
                card instanceof HTMLElement
                  ? card.scrollWidth - card.clientWidth
                  : null,
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
            }
          })
          assert(
            actionMetrics.actions.some(
              (action) => action.text === '阻塞' && !action.disabled
            ) &&
              actionMetrics.actions.some(
                (action) =>
                  action.text === '完成' && !action.disabled && action.selected
              ) &&
              actionMetrics.radiogroupCount === 1 &&
              actionMetrics.fakeActionButtonCount === 0 &&
              actionMetrics.cardContainsHeading &&
              actionMetrics.cardOverflowX <= 1,
            `${role.label}岗位独立处理页应提供可选的阻塞、完成动作: ${JSON.stringify(
              { actionDiagnostic, actionMetrics }
            )}`
          )
          assert(
            actionMetrics.documentScrollWidth <=
              actionMetrics.documentClientWidth + 1,
            `${role.label}岗位独立处理页不应横向溢出: ${JSON.stringify(actionMetrics)}`
          )
          if (role.key === 'engineering') {
            await actionScreen.screenshot({
              path: path.join(
                outputDir,
                'mobile-yoyo-engineering-task-action-430.png'
              ),
            })
          }
          await page.getByLabel('返回任务详情').click()
          await processButton.waitFor({ state: 'visible', timeout: 10_000 })
          await page.getByRole('button', { name: '任务列表' }).click()
          await expectText(page, role.taskName)
        }
      },
    },
    {
      name: 'mobile-yoyo-boss-urge-only',
      path: '/m/boss/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-yoyo-boss-urge-only',
        configHash: 'style-l1-mobile-yoyo-boss-urge-only-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
          'workflow.task.update': ['boss'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-boss-urge-only',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板' }],
        permissions: [
          'mobile.boss.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
        ],
        menus: [],
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        const taskName = '工程关键资料待催办任务'
        const sourceID = 12_150
        await page.evaluate(
          async ({ sourceID: taskSourceID, taskName: targetTaskName }) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'mobile-yoyo-boss-urge-only-create',
                method: 'create_task',
                params: {
                  task_code: 'STYLE-L1-YOYO-BOSS-URGE-ONLY',
                  task_group: 'project-orders',
                  task_name: targetTaskName,
                  source_type: 'project-orders',
                  source_id: taskSourceID,
                  source_no: 'YOYO-BOSS-URGE-ONLY',
                  business_status_key: 'project_pending',
                  task_status_key: 'ready',
                  owner_role_key: 'engineering',
                  priority: 9,
                  payload: {
                    critical_path: true,
                    due_date: '2026-07-18',
                  },
                },
              }),
            })
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
          },
          { sourceID, taskName }
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page
          .getByTestId('mobile-role-bottom-nav')
          .waitFor({ state: 'visible', timeout: 15_000 })
          .catch(async (error) => {
            const diagnostic = await page.evaluate(async () => {
              const call = async (domain, method, params = {}) => {
                const response = await fetch(`/rpc/${domain}`, {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: `mobile-yoyo-boss-diagnostic-${method}`,
                    method,
                    params,
                  }),
                })
                return response.json()
              }
              const [profile, effectiveSession] = await Promise.all([
                call('admin', 'me'),
                call('customer_config', 'get_effective_session', {
                  customer_key: 'yoyoosun',
                }),
              ])
              return {
                bodyText:
                  document.body.textContent?.replace(/\s+/g, ' ').trim() || '',
                effectiveSession,
                path: window.location.pathname,
                permissions: JSON.parse(
                  localStorage.getItem('admin_permissions') || '[]'
                ),
                profile,
                roles: JSON.parse(localStorage.getItem('admin_roles') || '[]'),
              }
            })
            throw new Error(
              `仅催办场景未进入岗位任务端: ${JSON.stringify(diagnostic)}`,
              { cause: error }
            )
          })
        await page.getByTestId('mobile-role-nav-messages').click()
        await page.waitForFunction(() => {
          const heading = document.querySelector('.mobile-role-tasks-page h1')
          return heading?.textContent?.trim() === '提醒'
        })
        const taskRow = page
          .locator('.mobile-role-message-card')
          .filter({ hasText: taskName })
          .first()
        await taskRow.waitFor({ state: 'visible', timeout: 10_000 })
        await taskRow.click()
        await expectText(page, '这条任务由工程办理，您可以查看并发起催办。')

        const actionDiagnostic = await page.evaluate(async (taskSourceID) => {
          const call = async (method, params = {}) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `mobile-yoyo-boss-urge-only-${method}`,
                method,
                params,
              }),
            })
            return response.json()
          }
          const taskPayload = await call('list_tasks', {
            source_id: taskSourceID,
            limit: 10,
          })
          const task = taskPayload?.result?.data?.tasks?.[0]
          const accessPayload = task
            ? await call('explain_action_access', { task_id: task.id })
            : null
          return {
            task: task
              ? {
                  id: task.id,
                  ownerRoleKey: task.owner_role_key,
                  statusKey: task.task_status_key,
                }
              : null,
            actions: accessPayload?.result?.data?.actions || [],
          }
        }, sourceID)
        assert.deepEqual(
          actionDiagnostic.actions
            .filter((action) => action.allowed === true)
            .map((action) => action.action_key),
          ['urge'],
          `仅催办场景的后端允许动作必须精确为 urge: ${JSON.stringify(actionDiagnostic)}`
        )

        const viewTaskAttachments = page.getByRole('button', {
          name: '查看任务附件',
          exact: true,
        })
        assert.equal(
          await viewTaskAttachments.count(),
          1,
          `仅催办角色应有一个只读任务附件入口: ${JSON.stringify(
            await page.locator('button').allTextContents()
          )}`
        )
        await viewTaskAttachments.click()
        const attachmentDialog = page.getByRole('dialog', {
          name: '任务附件',
          exact: true,
        })
        await attachmentDialog.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await attachmentDialog
            .getByRole('button', { name: '选择附件', exact: true })
            .count(),
          0,
          '仅催办角色的任务附件弹窗不应显示假上传按钮'
        )
        assert.equal(
          await attachmentDialog.locator('input[type="file"]').count(),
          0,
          '仅催办角色的任务附件弹窗不应渲染文件输入'
        )
        await attachmentDialog.locator('.ant-modal-close').click()
        await attachmentDialog.waitFor({ state: 'hidden', timeout: 10_000 })

        await page
          .getByRole('button', { name: '处理任务', exact: true })
          .click()
        const actionScreen = page.getByTestId('mobile-task-action-screen')
        await actionScreen.waitFor({ state: 'visible', timeout: 10_000 })
        await page.evaluate(() => {
          const currentState = window.history.state || {}
          window.history.replaceState(
            {
              ...currentState,
              mobileRoleTasksAction: 'done',
              mobileRoleTasksReason: '旧的完成反馈不应进入催办原因',
            },
            ''
          )
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await actionScreen.waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForFunction(
          () => window.history.state?.mobileRoleTasksAction === 'urge',
          undefined,
          { timeout: 10_000 }
        )
        await expectText(page, '本次操作')
        await expectText(page, '催办原因')
        assert.equal(
          await actionScreen.getByLabel('现场证据').count(),
          0,
          '仅催办处理页不应显示现场证据输入'
        )
        assert.equal(
          await actionScreen.locator('input[type="file"]').count(),
          0,
          '仅催办处理页不应显示附件上传入口'
        )
        assert.equal(
          await actionScreen.getByLabel('催办原因').inputValue(),
          '',
          '旧处理方式的草稿不能残留到唯一催办动作'
        )
        assert.equal(
          await actionScreen.getByText('选择处理方式', { exact: true }).count(),
          0,
          '仅有催办动作时不应继续提示选择处理方式'
        )
        assert.equal(
          await actionScreen.getByRole('radio').count(),
          0,
          '仅有催办动作时不应渲染单选组'
        )
        assert.equal(
          await actionScreen
            .getByRole('button', { name: '催办', exact: true })
            .count(),
          0,
          '催办摘要不能伪装成单击即执行的按钮'
        )

        const singleActionMetrics = await actionScreen.evaluate((screen) => {
          const card = screen.querySelector(
            '[data-testid="mobile-task-single-action"]'
          )
          const summary = screen.querySelector(
            '[data-testid="mobile-task-single-action-summary"]'
          )
          const heading = card?.querySelector('h2')
          const submit = screen.querySelector('button[type="submit"]')
          const cardRect = card?.getBoundingClientRect()
          const summaryRect = summary?.getBoundingClientRect()
          const headingRect = heading?.getBoundingClientRect()
          const submitRect = submit?.getBoundingClientRect()
          const contained = (outer, inner) =>
            Boolean(
              outer &&
                inner &&
                inner.top >= outer.top - 1 &&
                inner.bottom <= outer.bottom + 1 &&
                inner.left >= outer.left - 1 &&
                inner.right <= outer.right + 1
            )
          return {
            actionOptionsCount: screen.querySelectorAll(
              '[data-testid="mobile-task-action-options"]'
            ).length,
            cardContainsHeading: contained(cardRect, headingRect),
            cardContainsSummary: contained(cardRect, summaryRect),
            cardOverflowX:
              card instanceof HTMLElement
                ? card.scrollWidth - card.clientWidth
                : null,
            screenOverflowX: screen.scrollWidth - screen.clientWidth,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            headingText:
              heading?.textContent?.replace(/\s+/g, ' ').trim() || '',
            summaryText:
              summary?.textContent?.replace(/\s+/g, ' ').trim() || '',
            submitText: submit?.textContent?.replace(/\s+/g, ' ').trim() || '',
            submitType: submit?.getAttribute('type') || '',
            submitDisabled: submit?.disabled ?? true,
            submitHeight: submitRect?.height || 0,
          }
        })
        assert(
          singleActionMetrics.actionOptionsCount === 0 &&
            singleActionMetrics.headingText === '本次操作' &&
            singleActionMetrics.summaryText.includes('催办') &&
            singleActionMetrics.cardContainsHeading &&
            singleActionMetrics.cardContainsSummary &&
            singleActionMetrics.cardOverflowX <= 1 &&
            singleActionMetrics.screenOverflowX <= 1 &&
            singleActionMetrics.documentOverflowX <= 1 &&
            singleActionMetrics.submitText === '确认催办' &&
            singleActionMetrics.submitType === 'submit' &&
            !singleActionMetrics.submitDisabled &&
            singleActionMetrics.submitHeight >= 48,
          `仅催办处理页的语义或布局异常: ${JSON.stringify(singleActionMetrics)}`
        )
        await actionScreen.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-boss-urge-only-action-390.png'
          ),
        })

        await page.evaluate(async () => {
          document.documentElement.setAttribute('data-erp-theme', 'dark')
          await document.fonts?.ready
          await new Promise((resolve) => requestAnimationFrame(resolve))
          await new Promise((resolve) => requestAnimationFrame(resolve))
        })
        await assertThemeReadable(page, {
          scenarioName: 'mobile-yoyo-boss-urge-only-dark',
          selector: '[data-testid="mobile-task-single-action"]',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'mobile-yoyo-boss-urge-only-dark',
          selector: '[data-testid="mobile-task-single-action"]',
          minRatio: 4.5,
        })
        const darkSubmitMetrics = await actionScreen
          .getByRole('button', { name: '确认催办', exact: true })
          .evaluate((button) => {
            const buttonRect = button.getBoundingClientRect()
            const textElement = button.querySelector('span:not(.anticon)')
            const textRect = textElement?.getBoundingClientRect() || null
            return {
              buttonRect: {
                bottom: buttonRect.bottom,
                left: buttonRect.left,
                right: buttonRect.right,
                top: buttonRect.top,
              },
              clientHeight: button.clientHeight,
              clientWidth: button.clientWidth,
              scrollHeight: button.scrollHeight,
              scrollWidth: button.scrollWidth,
              text: button.innerText.trim(),
              textRect: textRect
                ? {
                    bottom: textRect.bottom,
                    left: textRect.left,
                    right: textRect.right,
                    top: textRect.top,
                    width: textRect.width,
                  }
                : null,
            }
          })
        assert(
          darkSubmitMetrics.text === '确认催办' &&
            darkSubmitMetrics.scrollWidth <= darkSubmitMetrics.clientWidth &&
            darkSubmitMetrics.scrollHeight <= darkSubmitMetrics.clientHeight &&
            darkSubmitMetrics.textRect?.width >= 56 &&
            darkSubmitMetrics.textRect.left >=
              darkSubmitMetrics.buttonRect.left - 1 &&
            darkSubmitMetrics.textRect.right <=
              darkSubmitMetrics.buttonRect.right + 1 &&
            darkSubmitMetrics.textRect.top >=
              darkSubmitMetrics.buttonRect.top - 1 &&
            darkSubmitMetrics.textRect.bottom <=
              darkSubmitMetrics.buttonRect.bottom + 1,
          `深色模式不能截断真正的催办命令文案: ${JSON.stringify(darkSubmitMetrics)}`
        )
        await actionScreen.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-boss-urge-only-action-dark-390.png'
          ),
        })
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-erp-theme', 'light')
        })

        let urgeTaskCalls = 0
        page.on('request', (request) => {
          if (!new URL(request.url()).pathname.endsWith('/rpc/workflow')) return
          if (request.postDataJSON()?.method === 'urge_task') urgeTaskCalls += 1
        })
        const confirmButton = actionScreen.getByRole('button', {
          name: '确认催办',
          exact: true,
        })
        await confirmButton.click()
        await expectText(page, '催办原因为必填项')
        assert.equal(urgeTaskCalls, 0, '催办原因缺失时不得发送催办请求')
        const reasonInput = actionScreen.getByLabel('催办原因')
        assert.equal(
          await reasonInput.evaluate((node) => document.activeElement === node),
          true,
          '催办原因缺失时应聚焦对应输入框'
        )
        await reasonInput.fill('请在今天下班前补齐工程关键资料')
        await confirmButton.click()
        const receiptScreen = page.getByTestId('mobile-task-receipt-screen')
        await receiptScreen.waitFor({ state: 'visible', timeout: 10_000 })
        const receiptText = (await receiptScreen.innerText())
          .replace(/\s+/g, ' ')
          .trim()
        assert(
          receiptText.includes('任务办理已确认'),
          `催办回执未确认: ${JSON.stringify({ receiptText, urgeTaskCalls })}`
        )
        await expectText(page, '催办')
        assert.equal(urgeTaskCalls, 1, '确认催办只应发送一次 urge_task 请求')

        const taskAfterUrge = await page.evaluate(async (taskSourceID) => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-yoyo-boss-urge-only-after',
              method: 'list_tasks',
              params: { source_id: taskSourceID, limit: 10 },
            }),
          })
          const payload = await response.json()
          const task = payload?.result?.data?.tasks?.[0]
          return task
            ? {
                statusKey: task.task_status_key,
                urgeCount: task.payload?.urge_count || 0,
                lastUrgeReason: task.payload?.last_urge_reason || '',
              }
            : null
        }, sourceID)
        assert.deepEqual(
          taskAfterUrge,
          {
            statusKey: 'ready',
            urgeCount: 1,
            lastUrgeReason: '请在今天下班前补齐工程关键资料',
          },
          '催办只能记录催办事实，不能替责任岗位完成任务'
        )
      },
    },
    {
      name: 'mobile-yoyo-role-task-readonly-actions',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-yoyo-role-task-readonly-actions',
        configHash: 'style-l1-mobile-yoyo-role-task-readonly-actions-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: ['workflow.task.create', 'workflow.task.read'],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-engineering-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions: [
          'mobile.engineering.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        menus: [],
      },
      viewport: { width: 430, height: 900 },
      verify: async (page) => {
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-role-readonly-engineering',
              method: 'create_task',
              params: {
                task_code: 'STYLE-L1-YOYO-ENGINEERING-READONLY',
                task_group: 'project-orders',
                task_name: '工程资料只读核对任务',
                source_type: 'project-orders',
                source_id: 12_100,
                source_no: 'YOYO-ENGINEERING-READONLY',
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: 'engineering',
                priority: 1,
                payload: { due_date: '2026-07-16' },
              },
            }),
          })
          const payload = await response.json()
          if (!response.ok || payload?.result?.code !== 0) {
            throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
          }
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '工程资料只读核对任务')
        await page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: '工程资料只读核对任务' })
          .click()
        const readonlyDiagnostic = await page.evaluate(async (taskName) => {
          const call = async (method, params = {}) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `mobile-readonly-diagnostic-${method}`,
                method,
                params,
              }),
            })
            return response.json()
          }
          const taskPayload = await call('list_tasks', { limit: 200 })
          const selected = (taskPayload?.result?.data?.tasks || []).find(
            (task) => task.task_name === taskName
          )
          const actionAccessPayload = selected
            ? await call('explain_action_access', { task_id: selected.id })
            : null
          return {
            task: selected
              ? {
                  id: selected.id,
                  ownerRoleKey: selected.owner_role_key,
                  statusKey: selected.task_status_key,
                }
              : null,
            actions: actionAccessPayload?.result?.data?.actions || [],
          }
        }, '工程资料只读核对任务')
        const deniedReasons = [
          ...new Set(
            readonlyDiagnostic.actions
              .filter((action) => action.allowed !== true && action.reason)
              .map((action) => action.reason)
          ),
        ]
        assert(
          deniedReasons.length > 0,
          `只读岗位应由后端返回不可执行原因: ${JSON.stringify(readonlyDiagnostic)}`
        )
        const guidance = page.getByTestId('mobile-role-action-guidance')
        await guidance.waitFor({ state: 'visible', timeout: 10_000 })
        const guidanceText = (await guidance.textContent())
          ?.replace(/\s+/g, ' ')
          .trim()
        assert(
          deniedReasons.some((reason) => guidanceText?.includes(reason)),
          `只读详情应展示后端动作说明，不应绑定前端固定句: ${JSON.stringify({
            guidanceText,
            readonlyDiagnostic,
          })}`
        )
        const readonlyActionBar = page.locator('.mobile-role-action-bar')
        await readonlyActionBar
          .getByRole('button', { name: '返回列表', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await readonlyActionBar.locator('button').count(),
          1,
          'effective-session 只读详情只应保留返回列表，不应渲染岗位写动作'
        )
        assert.equal(
          await page
            .locator('[data-step-key="process"]')
            .getAttribute('data-state'),
          'locked',
          'effective-session 只读详情的处理步骤应保持锁定'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-readonly-actions.png'
          ),
          fullPage: true,
        })
      },
    },
    {
      name: 'mobile-tasks-dark',
      path: '/m/sales/tasks?__style_l1_workflow_list_delay=1300',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-mobile-tasks-dark',
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.reject',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['sales', 'boss'],
          'workflow.task.update': ['sales', 'boss'],
          'workflow.task.complete': ['sales', 'boss'],
          'workflow.task.reject': ['sales', 'boss'],
        },
      },
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await assertMobileTaskInitialSkeleton(page, {
          scenarioName: 'mobile-tasks-dark',
        })
        await page.evaluate(async () => {
          const createTask = async (params) => {
            const desiredStatusKey = params.task_status_key || 'ready'
            const blockedReason = params.blocked_reason || ''
            const createParams = {
              ...params,
              task_status_key: 'ready',
            }
            delete createParams.blocked_reason
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
                params: createParams,
              }),
            })
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
            const task = payload.result.data?.task || null
            if (!task || desiredStatusKey === 'ready') return task
            const operationByStatus = {
              blocked: { method: 'block_task_action', actionKey: 'block' },
              done: { method: 'complete_task_action', actionKey: 'complete' },
            }
            const operation = operationByStatus[desiredStatusKey]
            if (!operation) {
              throw new Error(`unsupported seeded status: ${desiredStatusKey}`)
            }
            const mutationResponse = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `${params.task_code}-${operation.actionKey}`,
                method: operation.method,
                params: {
                  task_id: task.id,
                  expected_version: task.version,
                  idempotency_key: `style-l1-seed-${operation.actionKey}-${task.id}`,
                  action_key: operation.actionKey,
                  ...(desiredStatusKey === 'blocked'
                    ? { reason: blockedReason }
                    : {}),
                },
              }),
            })
            const mutationPayload = await mutationResponse.json()
            if (!mutationResponse.ok || mutationPayload?.result?.code !== 0) {
              throw new Error(
                `${operation.method} failed: ${JSON.stringify(mutationPayload)}`
              )
            }
            return mutationPayload.result.data?.task || null
          }

          await Promise.all(
            Array.from({ length: 30 }, (_, index) =>
              createTask({
                task_code: `STYLE-L1-MOBILE-SPARSE-OVERDUE-${String(index + 1).padStart(2, '0')}`,
                task_group: 'project-orders',
                task_name: `稀疏超时任务 ${index + 1}`,
                source_type: 'project-orders',
                source_id: 9050 + index,
                source_no: `STYLE-L1-SPARSE-OVERDUE-${String(index + 1).padStart(2, '0')}`,
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: 'sales',
                priority: 1,
                due_at: 1780272000,
                payload: {
                  customer_name: `稀疏超时客户 ${index + 1}`,
                  style_no: `SPARSE-OVERDUE-${index + 1}`,
                  due_date: '2026-06-01',
                },
              })
            )
          )

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
            ...Array.from({ length: 120 }, (_, index) => ({
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
            task_status_key: 'ready',
            owner_role_key: 'sales',
            priority: 9,
            payload: {
              critical_path: true,
              material_shortage: true,
              customer_name: '暗色客户',
              style_no: '深色测试款',
              due_date: '2026-06-06',
              mobile_action_evidence_refs: [
                '上一班次处理线索：成品照片已上传，并完成现场交接核对',
              ],
            },
          })
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByTestId('mobile-role-nav-todo').click()
        await page.waitForFunction(() => {
          const heading = document.querySelector('.mobile-role-tasks-page h1')
          return heading?.textContent?.trim() === '待办'
        })
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="mobile-role-scroll"]')
              ?.getAttribute('aria-busy') === 'false',
          undefined,
          { timeout: 10_000 }
        )
        const todoUI = await page.evaluate(() => ({
          heading:
            document
              .querySelector('.mobile-role-tasks-page h1')
              ?.textContent?.trim() || '',
          items: Array.from(
            document.querySelectorAll('.erp-mobile-list-item')
          ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || ''),
          loadError:
            document
              .querySelector('.mobile-role-load-error')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
        }))
        assert(
          todoUI.items.some((item) => item.includes('暗色任务验证')),
          `移动岗位待办投影未渲染到页面: ${JSON.stringify(todoUI)}`
        )
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
      path: '/m/sales/tasks',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-mobile-task-browser-back',
        actions: [
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['sales'],
          'workflow.task.update': ['sales'],
          'workflow.task.complete': ['sales'],
        },
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        const taskName = '浏览器返回栈验证任务'
        const createdTask = await page.evaluate(async (name) => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-task-browser-back-create',
              method: 'create_task',
              params: {
                task_code: 'STYLE-L1-MOBILE-BROWSER-BACK',
                task_group: 'sales-orders',
                task_name: name,
                source_type: 'sales-orders',
                source_id: 12_200,
                source_no: 'YOYO-MOBILE-BROWSER-BACK',
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: 'sales',
                priority: 1,
                payload: { due_date: '2026-07-19' },
              },
            }),
          })
          const payload = await response.json()
          if (!response.ok || payload?.result?.code !== 0) {
            throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
          }
          return payload.result.data?.task || null
        }, taskName)
        assert(
          createdTask?.id && createdTask?.version,
          `浏览器返回栈场景未取得任务快照: ${JSON.stringify(createdTask)}`
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="mobile-role-scroll"]')
              ?.getAttribute('aria-busy') === 'false',
          undefined,
          { timeout: 10_000 }
        )
        const taskRow = page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: taskName })
          .first()
        await taskRow.waitFor({ state: 'visible', timeout: 10_000 })
        await taskRow.click()
        await expectText(page, taskName)
        const processButton = page.getByRole('button', {
          name: '处理任务',
          exact: true,
        })
        await processButton.waitFor({ state: 'visible', timeout: 10_000 })
        await processButton.click()
        await page
          .getByTestId('mobile-task-action-screen')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '选择处理方式')

        await page.goBack()
        await waitForPath(page, '/m/sales/tasks')
        await page.waitForFunction(
          () =>
            Boolean(
              document.querySelector('.mobile-role-tasks-page--detail')
            ) &&
            !document.querySelector(
              '[data-testid="mobile-task-action-screen"]'
            ) &&
            !document.querySelector('.erp-admin-sider'),
          null,
          { timeout: 10_000 }
        )
        await expectText(page, taskName)
        await processButton.waitFor({ state: 'visible', timeout: 10_000 })
        const detailMetrics = await page.evaluate(() => ({
          path: window.location.pathname,
          hasDesktopShell: Boolean(document.querySelector('.erp-admin-sider')),
          hasMobileShell: Boolean(
            document.querySelector('.mobile-role-tasks-page')
          ),
          hasDetail: Boolean(
            document.querySelector('.mobile-role-tasks-page--detail')
          ),
          hasAction: Boolean(
            document.querySelector('[data-testid="mobile-task-action-screen"]')
          ),
          historyScreen: window.history.state?.mobileRoleTasksScreen || '',
        }))

        assert.equal(
          detailMetrics.path,
          '/m/sales/tasks',
          `处理页后退不应离开岗位任务端: ${JSON.stringify(detailMetrics)}`
        )
        assert.equal(
          detailMetrics.hasDesktopShell,
          false,
          `处理页后退不应渲染桌面后台壳层: ${JSON.stringify(detailMetrics)}`
        )
        assert(
          detailMetrics.hasMobileShell &&
            detailMetrics.hasDetail &&
            !detailMetrics.hasAction,
          `处理页后退应回到同一任务详情: ${JSON.stringify(detailMetrics)}`
        )

        await page.goBack()
        await waitForPath(page, '/m/sales/tasks')
        await page.waitForFunction(
          (name) => {
            const heading = document.querySelector('.mobile-role-tasks-page h1')
            const rows = Array.from(
              document.querySelectorAll('.erp-mobile-list-item')
            )
            return (
              heading?.textContent?.trim() === '待办' &&
              rows.some((row) => row.textContent?.includes(name)) &&
              !document.querySelector('.mobile-role-tasks-page--detail') &&
              !document.querySelector('.erp-admin-sider')
            )
          },
          taskName,
          { timeout: 10_000 }
        )
        const listMetrics = await page.evaluate(() => ({
          path: window.location.pathname,
          heading:
            document
              .querySelector('.mobile-role-tasks-page h1')
              ?.textContent?.trim() || '',
          hasDesktopShell: Boolean(document.querySelector('.erp-admin-sider')),
          hasMobileShell: Boolean(
            document.querySelector('.mobile-role-tasks-page')
          ),
          hasDetail: Boolean(
            document.querySelector('.mobile-role-tasks-page--detail')
          ),
        }))
        assert(
          listMetrics.path === '/m/sales/tasks' &&
            listMetrics.heading === '待办' &&
            !listMetrics.hasDesktopShell &&
            listMetrics.hasMobileShell &&
            !listMetrics.hasDetail,
          `详情页后退应回到移动端待办列表，不应由 remembered entry 劫持: ${JSON.stringify(listMetrics)}`
        )

        await taskRow.click()
        await processButton.waitFor({ state: 'visible', timeout: 10_000 })
        await processButton.click()
        await page
          .getByTestId('mobile-task-action-screen')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.evaluate(async (task) => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-task-browser-back-complete-externally',
              method: 'complete_task_action',
              params: {
                task_id: task.id,
                expected_version: task.version,
                idempotency_key: `style-l1-browser-back-complete-${task.id}`,
                action_key: 'complete',
                reason: '模拟其它终端已完成',
                payload: {},
              },
            }),
          })
          const payload = await response.json()
          if (!response.ok || payload?.result?.code !== 0) {
            throw new Error(
              `complete_task_action failed: ${JSON.stringify(payload)}`
            )
          }
        }, createdTask)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByTestId('mobile-role-bottom-nav').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await page.waitForFunction(
          (name) => {
            const heading = document.querySelector('.mobile-role-tasks-page h1')
            return (
              heading?.textContent?.trim() === '待办' &&
              !document.querySelector('.mobile-role-tasks-page--detail') &&
              !document.body.textContent?.includes(name)
            )
          },
          taskName,
          { timeout: 10_000 }
        )
        const missingTaskHistory = await page.evaluate(() => ({
          screen: window.history.state?.mobileRoleTasksScreen || '',
          depth: Number(window.history.state?.mobileRoleTasksDepth || 0),
          hasDetail: Boolean(
            document.querySelector('.mobile-role-tasks-page--detail')
          ),
          hasAction: Boolean(
            document.querySelector('[data-testid="mobile-task-action-screen"]')
          ),
        }))
        assert.deepEqual(
          missingTaskHistory,
          { screen: '', depth: 0, hasDetail: false, hasAction: false },
          `已被其它终端处理的任务应一次回到真实列表历史项: ${JSON.stringify(missingTaskHistory)}`
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
          window.history.replaceState(null, '', '/__dev/docs')
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('path') ===
            'docs/product/模块实施治理.md'
        )
        assert.equal(
          new URL(page.url()).searchParams.get('path'),
          'docs/product/模块实施治理.md',
          '开发文档查看器应把当前文档写入 URL 供刷新和深链恢复'
        )
        assert.equal(
          await page
            .locator(
              '.erp-dev-docs-pinned__item--active .erp-dev-docs-pinned__open'
            )
            .getAttribute('aria-current'),
          'true',
          '开发文档当前项应向读屏暴露 aria-current'
        )
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
          mermaidMetrics.width > 240 && mermaidMetrics.height >= 79,
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
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )
        await expectText(page, '当前 URL customer / Query')
        await expectText(page, 'yoyoosun')
        await expectText(page, '当前配置包 / Current Package')
        await expectText(page, '决策卡 / Decision Cards')
        await expectText(page, '可人工评审')
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
            overviewDefaultMetrics.clientHeight + 96,
          `桌面客户配置默认页只允许共享开发导航带来的轻量滚动，不应被摘要卡继续撑长: ${JSON.stringify(overviewDefaultMetrics)}`
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
          .getByRole('button', {
            name: /在开发文档中打开来源 config\/customers\/yoyoosun\/README\.md/,
          })
          .click()
        await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
        await expectText(
          page,
          '永绅 yoyoosun 客户配置 / Yoyoosun Customer Config'
        )
        assert.equal(
          new URL(page.url()).searchParams.get('path'),
          'config/customers/yoyoosun/README.md',
          '客户配置共享来源入口应命中真实配置包说明'
        )
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await expectHeading(
          page,
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )

        await page
          .locator('.erp-dev-customer-quick-action')
          .filter({ hasText: '看预检' })
          .click()
        await expectText(page, '包边界 / Package Guards')
        await expectText(page, '运行时启用')
        await expectText(page, '预检步骤 / Preflight Gates')
        await expectText(page, '客户包资产范围 / Package Asset Scope')
        await expectText(page, '客户包对象 / Package Objects')
        await assertTextAbsent(page, '模块状态投影 / Module States')
        await page
          .locator('[aria-label="配置预检任务"] .erp-dev-task-nav__item')
          .filter({ hasText: '运行投影' })
          .click()
        assert.equal(
          new URL(page.url()).searchParams.get('section'),
          'runtime',
          '配置预检子任务应写入可分享 URL'
        )
        await expectText(page, '模块状态投影 / Module States')
        await expectText(page, '模块状态只编译为客户配置控制面输入')
        await expectText(page, '默认登记模块会按启用编译')
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
            hasProductionOrderModuleLabel: items.some((item) =>
              item.textContent?.includes('生产订单')
            ),
            hasRawShipmentModuleKey: items.some((item) =>
              item.textContent?.includes('shipments')
            ),
            hasRawProductionOrderModuleKey: items.some((item) =>
              item.textContent?.includes('production_orders')
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
            hasProductionOrderModuleLabel:
              moduleStateMetrics.hasProductionOrderModuleLabel,
            hasRawShipmentModuleKey: moduleStateMetrics.hasRawShipmentModuleKey,
            hasRawProductionOrderModuleKey:
              moduleStateMetrics.hasRawProductionOrderModuleKey,
            enabledTags: moduleStateMetrics.enabledTags,
          },
          {
            itemCount: 17,
            hasCatalogDefaultCopy: true,
            hasInstallCopy: true,
            hasShipmentModuleLabel: true,
            hasProductionOrderModuleLabel: true,
            hasRawShipmentModuleKey: false,
            hasRawProductionOrderModuleKey: false,
            enabledTags: 17,
          },
          `客户配置控制台应展示 17 个模块状态预览项且不直出 raw module key: ${JSON.stringify(moduleStateMetrics)}`
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
          .locator('[aria-label="配置预检任务"] .erp-dev-task-nav__item')
          .filter({ hasText: '流程策略' })
          .click()
        await expectText(page, '策略与扩展点登记')
        await expectText(page, '工作流预览')
        await expectText(page, '销售订单审批')
        await expectText(page, '只做协同流转')
        await expectText(page, '状态机与策略')
        await assertTextAbsent(page, '模块状态投影 / Module States')
        await page
          .locator('[aria-label="配置预检任务"] .erp-dev-task-nav__item')
          .filter({ hasText: '验证证据' })
          .click()
        await expectText(page, '人工评审清单 / Review Checklist')
        await expectText(page, '校验结果 / Validation Checks')
        await expectText(page, '预检命令')
        await expectText(page, '生成预检报告')
        await expectText(page, '来源路径')
        await assertTextAbsent(page, '工作流预览')

        await page
          .locator('.erp-dev-customer-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '差异' })
          .click()
        await expectText(page, '差异对比 / Diff Preview')
        await expectText(page, '版本门禁 / Version Gates')
        await expectText(page, '当前不可执行真实业务数据导入')

        await page
          .locator('.erp-dev-customer-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '界面配置' })
          .click()
        await expectText(page, '客户编码')
        await expectText(page, '东莞市永绅玩具有限公司')
        await expectText(page, '打印模板字段 / Print Template Fields')
        await expectText(page, '当前展示合同和工程资料打印模板字段真源')
        await expectText(page, '销售订单受理当前未接打印模板')
        await expectText(page, '采购合同')
        await expectText(page, '加工合同')
        await expectText(page, '物料分析明细表')
        await expectText(page, '色卡')
        await expectText(page, '作业指导书')
        await expectText(page, '物料分析明细表')
        await expectText(page, '色卡')
        await expectText(page, '作业指导书')
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
            hasEngineeringTruth: items.some(
              (item) =>
                item.textContent?.includes('物料色卡分块') ||
                item.textContent?.includes('作业步骤和注意事项')
            ),
            hasRawTemplateKey:
              panel?.textContent?.includes('material-purchase-contract') ||
              panel?.textContent?.includes('processing-contract') ||
              panel?.textContent?.includes('engineering-material-detail') ||
              panel?.textContent?.includes('engineering-color-card') ||
              panel?.textContent?.includes('engineering-work-instruction') ||
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
            hasEngineeringTruth: printTemplateMetrics.hasEngineeringTruth,
            hasRawTemplateKey: printTemplateMetrics.hasRawTemplateKey,
          },
          {
            itemCount: 5,
            hasSalesOrderBoundary: true,
            hasCustomerCoreBoundary: true,
            hasPurchaseTruth: true,
            hasProcessingTruth: true,
            hasEngineeringTruth: true,
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
          .locator('.erp-dev-customer-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '执行发布' })
          .click()
        await expectText(page, '配置预检与发布 / Config Preflight & Release')
        await expectText(
          page,
          '配置预检与发布流程 / Config Preflight & Release Flow'
        )
        await expectText(page, '当前代理后端应用只写客户配置控制面')
        await expectText(page, '测试版页面试跑')
        await expectText(page, '尚未运行测试试跑')
        await assertTextAbsent(page, '当前代理后端应用 / Current Proxy Apply')
        await assertTextAbsent(page, '正式版发布 / Release Apply')
        await page
          .locator('[aria-label="配置执行任务"] .erp-dev-task-nav__item')
          .filter({ hasText: '应用测试配置' })
          .click()
        assert.equal(
          new URL(page.url()).searchParams.get('action'),
          'test-apply',
          '测试配置操作应写入可分享 URL'
        )
        await expectText(page, '当前代理后端应用 / Current Proxy Apply')
        await expectText(page, '应用到当前后端')
        await expectText(page, '校验 / 发布 / 激活 / 有效配置投影')
        await expectText(page, '写库目标 / Database Target')
        await expectText(page, '当前 Vite /rpc 代理后端')
        await assertTextAbsent(page, '127.0.0.1:8300')
        await expectText(page, '目标环境 ERP 应用数据库')
        await expectText(
          page,
          '客户配置版本、模块状态、角色画像、授权、责任池和审计记录'
        )
        await expectText(page, '客户配置投影')
        await expectText(page, '真实客户业务数据')
        await expectText(page, '业务数据导入')
        await assertTextAbsent(page, '测试版页面试跑')
        await assertTextAbsent(page, '正式版发布 / Release Apply')
        const testApplyViewMetrics = await page.evaluate(() => ({
          dbTargetCount: document.querySelectorAll(
            '.erp-dev-customer-db-target'
          ).length,
          testApplyButtons: [...document.querySelectorAll('button')].filter(
            (button) => /应用到当前后端/.test(button.textContent || '')
          ).length,
        }))
        assert.deepEqual(testApplyViewMetrics, {
          dbTargetCount: 5,
          testApplyButtons: 1,
        })
        await page
          .locator('[aria-label="配置执行任务"] .erp-dev-task-nav__item')
          .filter({ hasText: '检查正式发布' })
          .click()
        await expectText(page, '正式版发布 / Release Apply')
        await expectText(page, '正式发布只由统一执行器执行')
        await expectText(page, '检查发布门禁')
        await expectText(page, '复制正式执行器输入模板')
        await expectText(page, '尚未检查发布门禁')
        await expectText(page, '发布门禁输入模板')
        await expectText(page, '正式发布 / 回滚执行器输入模板')
        await expectText(page, '--print-input-template')
        await page.waitForFunction(
          () =>
            !document
              .querySelector('[aria-label="选择发布证据批次"]')
              ?.classList.contains('ant-select-loading')
        )
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
          releaseTemplateButtons: [
            ...document.querySelectorAll('button'),
          ].filter((button) =>
            /复制正式执行器输入模板/.test(button.textContent || '')
          ).length,
          rawFormalImportButtons: [
            ...document.querySelectorAll('button'),
          ].filter((button) =>
            /正式导入|直接写库|上传客户包|发布到正式版|直接发布|直接激活/.test(
              button.textContent || ''
            )
          ).length,
          releaseCheckDisabled:
            [...document.querySelectorAll('button')].find((button) =>
              /检查发布门禁/.test(button.textContent || '')
            )?.disabled ?? null,
        }))
        assert.deepEqual(
          importWorkbenchMetrics,
          {
            stepCount: 0,
            dbTargetCount: 0,
            formalGateCount: 11,
            testApplyButtons: 0,
            releaseCheckButtons: 1,
            releaseTemplateButtons: 1,
            rawFormalImportButtons: 0,
            releaseCheckDisabled: true,
          },
          `预检与发布工作台应提供测试应用、发布门禁检查和统一执行器输入模板，不应在页面直接发布: ${JSON.stringify(importWorkbenchMetrics)}`
        )
        await page.getByRole('combobox', { name: '选择发布证据批次' }).click()
        const releaseBatchOptions = await page
          .locator(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option-content'
          )
          .allTextContents()
        assert(
          releaseBatchOptions.length >= 1 &&
            releaseBatchOptions.every((value) =>
              /^\d{4}-\d{2}-\d{2}$/u.test(value.trim())
            ),
          `发布门禁只能选择已登记的具体日期批次: ${JSON.stringify(releaseBatchOptions)}`
        )
        await page
          .locator(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
          )
          .first()
          .click()
        await page.waitForFunction(() => {
          const button = [...document.querySelectorAll('button')].find((item) =>
            /^检查发布门禁$/u.test(item.textContent?.trim() || '')
          )
          return Boolean(button && !button.disabled)
        })
        const selectedReleaseBatchMetrics = await page.evaluate(() => ({
          releaseBatch: new URL(location.href).searchParams.get('release'),
          releaseCheckDisabled:
            [...document.querySelectorAll('button')].find((button) =>
              /检查发布门禁/.test(button.textContent || '')
            )?.disabled ?? null,
        }))
        assert(
          /^\d{4}-\d{2}-\d{2}$/u.test(
            selectedReleaseBatchMetrics.releaseBatch || ''
          ) && selectedReleaseBatchMetrics.releaseCheckDisabled === false,
          `选择已登记批次后 URL 应固定证据批次并启用只读检查: ${JSON.stringify(selectedReleaseBatchMetrics)}`
        )
        await page
          .locator('[aria-label="配置执行任务"] .erp-dev-task-nav__item')
          .filter({ hasText: '生成试跑证据' })
          .click()
        assert.equal(
          new URL(page.url()).searchParams.get('action'),
          null,
          '默认试跑任务应使用简洁 canonical URL'
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
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )
        await expectText(page, '未登记客户配置包')
        await expectText(page, 'missing-customer')
        await expectText(page, '已登记客户包 / Registered Packages')
        await expectText(page, '永绅 yoyoosun')
        await assertTextAbsent(page, '东莞市永绅玩具有限公司')

        await gotoScenarioPath(page, '/__dev/customer-config', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(
          page,
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )
        await expectText(page, '未选择客户配置包')
        await expectText(page, '已登记客户包 / Registered Packages')
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
          .locator('.erp-dev-customer-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '界面配置' })
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
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )
        await expectText(page, '当前 URL customer / Query')
        await expectText(page, 'yoyoosun')
        await assertDevPageUsesGlobalThemeOnly(page, {
          scenarioName: 'dev-customer-config-light-desktop',
          selector: '.erp-dev-customer-page',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await assertDevCustomerHeaderStacked(
          page,
          'dev-customer-config-light-desktop'
        )
      },
    },
    {
      name: 'dev-customer-config-mobile',
      path: '/__dev/customer-config?customer=yoyoosun',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(
          page,
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )
        await assertDevCustomerHeaderStacked(page, 'dev-customer-config-mobile')
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
          .locator('.erp-dev-customer-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '界面配置' })
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
        await expectText(
          page,
          '客户配置包预检与发布 / Package Preflight & Release'
        )
        await expectText(page, '本地 dev-only 入口')
        const defaultMetrics = await page.evaluate(() => ({
          path: location.pathname,
          documentTitle: document.title,
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          descriptionCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card__description'
          ).length,
          pinButtonCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card__pin'
          ).length,
          searchActionButtonCount: document.querySelectorAll(
            '.erp-dev-hub-toolbar .ant-input-search-button'
          ).length,
          enterAriaLabels: [
            ...document.querySelectorAll(
              '.erp-dev-hub-grid .erp-dev-hub-card__link'
            ),
          ].map((link) => link.getAttribute('aria-label') || ''),
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
        assert(
          defaultMetrics.documentTitle.startsWith('开发导航 · '),
          `开发导航应提供可区分的浏览器标题: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.cardCount,
          6,
          `开发导航应渲染 6 个入口: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.descriptionCount,
          6,
          `开发导航每张入口卡都应说明用途与边界: ${JSON.stringify(defaultMetrics)}`
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
          defaultMetrics.searchActionButtonCount,
          0,
          `开发导航不应保留无独立用途的搜索动作按钮: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.enterAriaLabels.length === 6 &&
            new Set(defaultMetrics.enterAriaLabels).size === 6 &&
            defaultMetrics.enterAriaLabels.every(Boolean),
          `每个“进入”动作应有唯一可访问名称: ${JSON.stringify(defaultMetrics)}`
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
        await page.waitForFunction(
          () =>
            document
              .querySelector(
                '.erp-dev-hub-toolbar > .erp-dev-hub-toolbar__note'
              )
              ?.textContent?.replace(/\s+/gu, '') === '1/6' &&
            document.querySelectorAll('.erp-dev-hub-grid .erp-dev-hub-card')
              .length === 1
        )
        const groupMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          onlyHref: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('href'),
          countText:
            document
              .querySelector(
                '.erp-dev-hub-toolbar > .erp-dev-hub-toolbar__note'
              )
              ?.textContent?.replace(/\s+/gu, '') || '',
          overflow:
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        }))
        assert.deepEqual(
          groupMetrics,
          {
            cardCount: 1,
            onlyHref: '/__dev/capability-ledger',
            countText: '1/6',
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
        await page.getByPlaceholder('搜索入口或路径').fill('测试入口')
        await page.waitForFunction(
          () =>
            document
              .querySelector(
                '.erp-dev-hub-toolbar > .erp-dev-hub-toolbar__note'
              )
              ?.textContent?.replace(/\s+/gu, '') === '1/6' &&
            document.querySelectorAll('.erp-dev-hub-grid .erp-dev-hub-card')
              .length === 1
        )
        const filteredMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-hub-grid .erp-dev-hub-card'
          ).length,
          onlyHref: document
            .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
            ?.getAttribute('href'),
          countText:
            document
              .querySelector(
                '.erp-dev-hub-toolbar > .erp-dev-hub-toolbar__note'
              )
              ?.textContent?.replace(/\s+/gu, '') || '',
        }))
        assert.deepEqual(filteredMetrics, {
          cardCount: 1,
          onlyHref: '/__dev/testing',
          countText: '1/6',
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
            titlePrefix: '开发导航 · ',
          },
          {
            path: '/__dev/governance',
            heading: '项目治理地图 / Governance Map',
            rootSelector: '.erp-dev-governance-page',
            titlePrefix: '项目治理地图 · ',
          },
          {
            path: '/__dev/docs',
            heading: '开发文档查看器 / Dev Docs Viewer',
            rootSelector: '.erp-dev-docs-page',
            titlePrefix: '开发文档 · ',
          },
          {
            path: '/__dev/testing',
            heading: '开发测试入口 / Dev Test Entry',
            rootSelector: '.erp-dev-testing-page',
            titlePrefix: '测试入口 · ',
          },
          {
            path: '/__dev/prototypes',
            heading: '产品原型与样板查看器 / Prototype Viewer',
            rootSelector: '.erp-dev-prototypes-page',
            titlePrefix: '产品原型 · ',
          },
          {
            path: '/__dev/capability-ledger',
            heading: '能力台账可视化 / Capability Ledger',
            rootSelector: '.erp-dev-capability-page',
            titlePrefix: '能力台账 · ',
          },
          {
            path: '/__dev/customer-config?customer=yoyoosun',
            heading:
              '客户配置包预检与发布控制台 / Package Preflight & Release Console',
            rootSelector: '.erp-dev-customer-page',
            titlePrefix: '客户配置包预检与发布 · ',
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
              documentTitle: document.title,
              hasPageH1: Boolean(header?.querySelector('h1')),
              devNavCount: document.querySelectorAll(
                'nav[aria-label="开发页面导航"]'
              ).length,
              copyActionCount: document.querySelectorAll(
                'button[aria-label="复制当前开发页深链"]'
              ).length,
              sourceActionCount: document.querySelectorAll(
                'button[aria-label^="在开发文档中打开来源"]'
              ).length,
              workspaceRouteCount: document.querySelectorAll(
                '.erp-dev-workspace-nav__route'
              ).length,
              currentWorkspaceRouteCount: document.querySelectorAll(
                '.erp-dev-workspace-nav__route[aria-current="page"]'
              ).length,
              workspacePageDisplay: root ? getComputedStyle(root).display : '',
              workspaceRoutesOverflowX:
                getComputedStyle(
                  document.querySelector('.erp-dev-workspace-nav__routes')
                ).overflowX || '',
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
            metrics.documentTitle.startsWith(devPage.titlePrefix),
            `开发页应提供可区分的浏览器标题: ${devPage.path} ${JSON.stringify(metrics)}`
          )
          assert.equal(
            metrics.hasPageH1,
            true,
            `开发页壳层主标题应使用 h1: ${devPage.path} ${JSON.stringify(metrics)}`
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
          assert.deepEqual(
            {
              devNavCount: metrics.devNavCount,
              copyActionCount: metrics.copyActionCount,
              sourceActionCount: metrics.sourceActionCount,
              workspaceRouteCount: metrics.workspaceRouteCount,
              currentWorkspaceRouteCount: metrics.currentWorkspaceRouteCount,
              workspacePageDisplay: metrics.workspacePageDisplay,
              workspaceRoutesOverflowX: metrics.workspaceRoutesOverflowX,
            },
            {
              devNavCount: 1,
              copyActionCount: 1,
              sourceActionCount: devPage.path === '/__dev/' ? 0 : 1,
              workspaceRouteCount: 7,
              currentWorkspaceRouteCount: 1,
              workspacePageDisplay: 'block',
              workspaceRoutesOverflowX: 'auto',
            },
            `开发页应统一提供移动端工作台导航、深链和来源入口: ${devPage.path} ${JSON.stringify(metrics)}`
          )
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
        const workspaceLayout = await page.evaluate(() => {
          const root = document.querySelector('.erp-dev-workspace-page')
          const nav = document.querySelector('.erp-dev-workspace-nav')
          const header = document.querySelector('.erp-dev-hub-header')
          const navRect = nav?.getBoundingClientRect()
          const headerRect = header?.getBoundingClientRect()
          return {
            gridTemplateColumns: root
              ? getComputedStyle(root).gridTemplateColumns
              : '',
            navPosition: nav ? getComputedStyle(nav).position : '',
            navWidth: Math.round(navRect?.width || 0),
            navRight: Math.round(navRect?.right || 0),
            headerLeft: Math.round(headerRect?.left || 0),
            workspaceRouteCount: document.querySelectorAll(
              '.erp-dev-workspace-nav__route'
            ).length,
          }
        })
        assert.deepEqual(
          {
            navPosition: workspaceLayout.navPosition,
            navWidth: workspaceLayout.navWidth,
            workspaceRouteCount: workspaceLayout.workspaceRouteCount,
          },
          {
            navPosition: 'sticky',
            navWidth: 232,
            workspaceRouteCount: 7,
          },
          `开发工作台桌面侧栏尺寸和入口应稳定: ${JSON.stringify(workspaceLayout)}`
        )
        assert(
          workspaceLayout.gridTemplateColumns.startsWith('232px ') &&
            workspaceLayout.headerLeft > workspaceLayout.navRight,
          `开发工作台桌面内容不应覆盖左侧栏: ${JSON.stringify(workspaceLayout)}`
        )
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
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
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
          '客户配置包预检与发布控制台 / Package Preflight & Release Console'
        )
        assertButtonGroup(
          '客户配置视图切换',
          await readControlGroup(
            '.erp-dev-customer-view-switch',
            '.erp-dev-task-nav__item'
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
            '.erp-dev-task-nav__item'
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
            activeAxisAriaCurrent:
              activeAxis?.getAttribute('aria-current') || '',
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
        assert.equal(
          defaultMetrics.activeAxisAriaCurrent,
          'true',
          `治理维度当前项应向读屏暴露 aria-current: ${JSON.stringify(defaultMetrics)}`
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
        const relatedPageUrl = new URL(page.url())
        assert(
          relatedPageUrl.searchParams.get('axis') &&
            relatedPageUrl.searchParams.get('scope') === 'related',
          `治理维度与相关任务范围应写入 URL: ${relatedPageUrl}`
        )
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
        assert.equal(
          new URL(page.url()).searchParams.get('scope'),
          'all',
          '治理任务“查看全部”应写入 URL 供刷新和历史恢复'
        )
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
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('filter') === 'current' &&
            document
              .querySelector('.erp-dev-prototypes-filter__item--active')
              ?.textContent?.includes('当前实现')
        )
        await expectText(page, '岗位任务端当前列表基线')
        await expectText(page, '岗位任务中心 v2 原型')
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
          currentSelectionCount: document.querySelectorAll(
            '.erp-dev-prototypes-card--active .erp-dev-prototypes-card__body[aria-current="true"]'
          ).length,
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
          2,
          `原型查看器当前实现筛选应展示岗位任务端列表和处理流程资产: ${JSON.stringify(currentMetrics)}`
        )
        assert.equal(
          currentMetrics.currentTagCount,
          2,
          `原型查看器当前实现标签数量异常: ${JSON.stringify(currentMetrics)}`
        )
        assert.equal(
          currentMetrics.currentSelectionCount,
          1,
          `原型当前资产应向读屏暴露 aria-current: ${JSON.stringify(currentMetrics)}`
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
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('filter') ===
              'to-implement' &&
            document.querySelectorAll('.erp-dev-prototypes-card').length === 14
        )
        await expectText(page, '后台工作台样板')
        await expectText(page, '任务中心样板')
        await expectText(page, 'Workflow 任务处理流程样板')
        await expectText(page, '业务管理中心样板')
        await expectText(page, '指标卡交互语义样板')
        await expectText(page, '产品核心菜单覆盖样板')
        await expectText(page, '正式菜单候选原型')
        await expectText(page, '审计日志页原型')
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
          14,
          `原型查看器待实现筛选应展示 14 个产品内核 HTML 样板: ${JSON.stringify(implementMetrics)}`
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
              '参照范围：仅有真实 Workflow 关联、能定位当前选中业务记录待办的业务页可参照；跨记录任务由任务中心承接。它是页内组件，不是独立菜单、路由或权限入口。',
            storedFilter: 'to-implement',
            storedSelected: 'business-task-collab-entry',
          },
          `原型查看器刷新后应恢复左侧筛选和当前资产: ${JSON.stringify(restoredSelectionMetrics)}`
        )

        await page
          .getByRole('button', { name: '复制当前原型资产路径', exact: true })
          .click()
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          'docs/product/prototypes/business-module-page-standard-v1/task-collab-entry-v2.html',
          '原型查看器应复制当前资产路径'
        )

        await page
          .getByRole('button', {
            name: '在开发文档中打开当前原型说明',
            exact: true,
          })
          .click()
        await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
        assert.equal(
          new URL(page.url()).searchParams.get('path'),
          'docs/product/prototypes/business-module-page-standard-v1/README.md',
          '原型说明应进入开发文档查看器中的对应 README'
        )
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')

        const fullscreenTrigger = page.getByRole('button', {
          name: '全屏预览当前原型',
          exact: true,
        })
        await fullscreenTrigger.click()
        const fullscreenDialog = page.getByRole('dialog', {
          name: /全屏预览/,
        })
        await fullscreenDialog.waitFor({ state: 'visible' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '关闭原型全屏预览'
        )
        const fullscreenOpenMetrics = await page.evaluate(() => ({
          activeText: document.activeElement?.textContent?.trim() || '',
          navInert: document
            .querySelector('nav[aria-label="开发页面导航"]')
            ?.hasAttribute('inert'),
          headerInert: document
            .querySelector('.erp-dev-prototypes-header')
            ?.hasAttribute('inert'),
          mainInert: document
            .querySelector('.erp-dev-prototypes-shell')
            ?.hasAttribute('inert'),
          backgroundAriaHidden: [
            document.querySelector('nav[aria-label="开发页面导航"]'),
            document.querySelector('.erp-dev-prototypes-header'),
            document.querySelector('.erp-dev-prototypes-shell'),
          ].every((element) => element?.getAttribute('aria-hidden') === 'true'),
          bodyOverflow: document.body.style.overflow,
          sandbox:
            document
              .querySelector(
                '.erp-dev-prototypes-fullscreen iframe[title="业务页协同入口组件样板"]'
              )
              ?.getAttribute('sandbox') || '',
        }))
        assert.deepEqual(
          fullscreenOpenMetrics,
          {
            activeText: '关闭',
            navInert: true,
            headerInert: true,
            mainInert: true,
            backgroundAriaHidden: true,
            bodyOverflow: 'hidden',
            sandbox: 'allow-scripts',
          },
          `原型全屏应锁定完整背景、聚焦关闭动作并保持最小 sandbox: ${JSON.stringify(fullscreenOpenMetrics)}`
        )
        await page.keyboard.press('Shift+Tab')
        assert.equal(
          await page.evaluate(() => document.activeElement?.tagName),
          'IFRAME',
          '全屏焦点循环应从第一个动作回到最后一个可聚焦元素'
        )
        await page.keyboard.press('Tab')
        let focusReturnedToClose = false
        for (let index = 0; index < 80; index += 1) {
          focusReturnedToClose = await page.evaluate(
            () => document.activeElement?.textContent?.trim() === '关闭'
          )
          if (focusReturnedToClose) break
          await page.keyboard.press('Tab')
        }
        assert.equal(
          focusReturnedToClose,
          true,
          '全屏焦点遍历 iframe 内容后应由末端 guard 回到关闭动作'
        )
        await page.keyboard.press('Escape')
        await fullscreenDialog.waitFor({ state: 'detached' })
        await page.waitForFunction(() =>
          document.activeElement?.textContent?.includes('全屏预览 / Fullscreen')
        )

        await page
          .getByRole('button', { name: '参考资料 / Reference', exact: true })
          .click()
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('filter') === 'reference' &&
            document.querySelectorAll('.erp-dev-prototypes-card').length === 10
        )
        await expectText(page, '后台工作台重设计方向图')
        await expectText(page, '任务看板重设计方向图')
        await expectText(page, '任务处理流程重设计方向图')
        await expectText(page, '业务看板重设计方向图')
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
          10,
          `原型查看器参考资料筛选应展示 10 个参考资产: ${JSON.stringify(referenceMetrics)}`
        )
        assert.equal(
          referenceMetrics.draftTagCount,
          7,
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
        await page
          .getByPlaceholder('搜索名称、目录、用途、参照范围')
          .fill('__no_match__')
        await expectText(page, '没有匹配的样板或参考资料')
        const emptyMetrics = await page.evaluate(() => ({
          q: new URL(location.href).searchParams.get('q'),
          cardCount: document.querySelectorAll('.erp-dev-prototypes-card')
            .length,
          iframeCount: document.querySelectorAll(
            '.erp-dev-prototypes-reader iframe'
          ).length,
          readerEmptyText:
            document.querySelector('.erp-dev-prototypes-reader__info')
              ?.textContent || '',
        }))
        assert.deepEqual(
          emptyMetrics,
          {
            q: '__no_match__',
            cardCount: 0,
            iframeCount: 0,
            readerEmptyText: '当前筛选没有匹配资产，请调整关键词或状态筛选。',
          },
          `原型零结果应保持真实空态，不能回退预览筛选外资产: ${JSON.stringify(emptyMetrics)}`
        )
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-prototypes-dark-desktop',
          selector: '.erp-dev-prototypes-page',
        })
      },
    },
    {
      name: 'dev-capability-select-long-text-desktop',
      path: '/__dev/capability-ledger',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '能力台账可视化 / Capability Ledger')
        const domainSelect = page.locator('.ant-select', {
          has: page.getByRole('combobox', { name: '按业务域筛选' }),
        })
        await domainSelect.click()
        const longOption = page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '架构 / Architecture · 工作流 / Workflow' })
        const optionMetrics = await longOption.evaluate((node) => {
          const content = node.querySelector('.ant-select-item-option-content')
          const nonLastOption = node.parentElement?.querySelector(
            '.ant-select-item-option:not(:last-child)'
          )
          const optionRect = node.getBoundingClientRect()
          const contentRect = content?.getBoundingClientRect()
          const optionStyle = getComputedStyle(node)
          const style = content ? getComputedStyle(content) : null
          return {
            optionHeight: Number(optionRect.height.toFixed(1)),
            contentHeight: Number((contentRect?.height || 0).toFixed(1)),
            clientWidth: content?.clientWidth || 0,
            scrollWidth: content?.scrollWidth || 0,
            borderRadius: optionStyle.borderRadius,
            dividerBoxShadow: nonLastOption
              ? getComputedStyle(nonLastOption).boxShadow
              : '',
            paddingBlock: [optionStyle.paddingTop, optionStyle.paddingBottom],
            paddingInline: [optionStyle.paddingLeft, optionStyle.paddingRight],
            overflowWrap: style?.overflowWrap || '',
            textOverflow: style?.textOverflow || '',
            whiteSpace: style?.whiteSpace || '',
          }
        })
        assert.deepEqual(
          {
            overflowWrap: optionMetrics.overflowWrap,
            textOverflow: optionMetrics.textOverflow,
            whiteSpace: optionMetrics.whiteSpace,
          },
          {
            overflowWrap: 'anywhere',
            textOverflow: 'clip',
            whiteSpace: 'normal',
          },
          `下拉选项应允许完整换行，不能继续单行省略: ${JSON.stringify(optionMetrics)}`
        )
        assert(
          optionMetrics.scrollWidth <= optionMetrics.clientWidth + 1 &&
            optionMetrics.optionHeight >= optionMetrics.contentHeight,
          `长下拉选项必须完整落在自身盒内，不能横向溢出或覆盖相邻项: ${JSON.stringify(optionMetrics)}`
        )
        assert.deepEqual(
          {
            borderRadius: optionMetrics.borderRadius,
            paddingBlock: optionMetrics.paddingBlock,
            paddingInline: optionMetrics.paddingInline,
          },
          {
            borderRadius: '8px',
            paddingBlock: ['8px', '8px'],
            paddingInline: ['10px', '10px'],
          },
          `每个下拉选项都应具备一致的可扫描 item 盒模型: ${JSON.stringify(optionMetrics)}`
        )
        assert(
          optionMetrics.dividerBoxShadow.includes('inset'),
          `非末项下拉选项应保留轻量分隔，避免多行文字与下一项粘连: ${JSON.stringify(optionMetrics)}`
        )
        await longOption.click()
        const selectedMetrics = await domainSelect.evaluate((node) => {
          const selected = node.querySelector('.ant-select-selection-item')
          const style = selected ? getComputedStyle(selected) : null
          return {
            text: selected?.textContent?.trim() || '',
            title: selected?.getAttribute('title') || '',
            textOverflow: style?.textOverflow || '',
            whiteSpace: style?.whiteSpace || '',
          }
        })
        assert.deepEqual(
          selectedMetrics,
          {
            text: '架构 / Architecture · 工作流 / Workflow',
            title: '架构 / Architecture · 工作流 / Workflow',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          `收起态应保持单行稳定高度，并通过 title 提供完整值: ${JSON.stringify(selectedMetrics)}`
        )
        await domainSelect.click()
        await page.keyboard.press('Home')
        await page.keyboard.press('Enter')
        await domainSelect.click()
        const reopenedDropdown = page
          .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .last()
        await reopenedDropdown.waitFor({ state: 'visible' })
        await page.waitForFunction(() => {
          const element = Array.from(
            document.querySelectorAll(
              '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
            )
          ).at(-1)
          if (!element) return false
          const rect = element.getBoundingClientRect()
          const style = getComputedStyle(element)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.opacity === '1' &&
            style.transform === 'none'
          )
        })
        await reopenedDropdown.screenshot({
          path: 'output/playwright/style-l1/dev-capability-select-long-text-options.png',
        })
        await page.keyboard.press('Escape')
      },
    },
    {
      name: 'dev-capability-ledger-dark-desktop',
      path: '/__dev/capability-ledger',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '能力台账可视化 / Capability Ledger')
        await expectText(page, '只显示构建安全的非权威短摘要')
        await expectText(page, '不读取或打包正式 Markdown / summaries only')
        await assertTextAbsent(page, '联动读取 4 份 Markdown / 4 linked docs')
        const readLedgerMetrics = () =>
          page.evaluate(() => ({
            view: new URL(location.href).searchParams.get('view'),
            item: new URL(location.href).searchParams.get('item'),
            rowCount: document.querySelectorAll('.erp-dev-capability-row')
              .length,
            currentRowCount: document.querySelectorAll(
              '.erp-dev-capability-row[aria-current="true"]'
            ).length,
            metricValues: [
              ...document.querySelectorAll('.erp-dev-capability-metric__value'),
            ].map((node) => node.textContent?.trim() || ''),
            diagnosticCount: document.querySelectorAll(
              '[aria-label="真源诊断"] .ant-alert'
            ).length,
            sourceLinks: [
              ...document.querySelectorAll('.erp-dev-capability-source a'),
            ].map((link) => link.getAttribute('href') || ''),
          }))

        const capabilityMetrics = await readLedgerMetrics()
        assert.equal(
          capabilityMetrics.view,
          'capabilities',
          `能力台账默认 URL 应归一化为产品能力视图: ${JSON.stringify(capabilityMetrics)}`
        )
        assert.equal(
          capabilityMetrics.rowCount,
          1,
          `能力台账开发页只应解析 1 项构建安全短摘要: ${JSON.stringify(capabilityMetrics)}`
        )
        assert.equal(
          capabilityMetrics.currentRowCount,
          1,
          `能力台账当前项应向读屏暴露 aria-current: ${JSON.stringify(capabilityMetrics)}`
        )
        assert.equal(
          capabilityMetrics.metricValues[0],
          '1',
          `能力台账总数指标异常: ${JSON.stringify(capabilityMetrics)}`
        )
        assert.equal(
          capabilityMetrics.diagnosticCount,
          0,
          `构建内短摘要不应出现解析或精确关联诊断: ${JSON.stringify(capabilityMetrics)}`
        )
        assert.equal(
          capabilityMetrics.sourceLinks.length,
          2,
          `产品能力视图应同时暴露快查和证据详情真源: ${JSON.stringify(capabilityMetrics)}`
        )

        await expectText(page, '所属层 / Product Layer')
        await expectText(page, '业务域 / Domain')
        await expectText(page, '成熟度 / Maturity')
        await page
          .locator('.ant-select', {
            has: page.getByRole('combobox', { name: '按所属层筛选' }),
          })
          .click()
        await expectText(page, '产品内核 / Product Core')
        const layerOptionTexts = await page
          .locator(
            '.ant-select-dropdown:visible .ant-select-item-option-content'
          )
          .allTextContents()
        assert(
          layerOptionTexts.every(
            (value) => value === '全部' || /[\u3400-\u9fff]/u.test(value)
          ),
          `所属层下拉不得出现无中文解释的纯英文选项: ${JSON.stringify(layerOptionTexts)}`
        )
        await page.keyboard.press('Escape')
        const domainSelect = page.locator('.ant-select', {
          has: page.getByRole('combobox', { name: '按业务域筛选' }),
        })
        await domainSelect.click()
        await expectText(page, '架构 / Architecture · 工作流 / Workflow')
        const domainOptionTexts = await page
          .locator(
            '.ant-select-dropdown:visible .ant-select-item-option-content'
          )
          .allTextContents()
        assert(
          domainOptionTexts.every(
            (value) => value === '全部' || /[\u3400-\u9fff]/u.test(value)
          ),
          `业务域下拉不得出现无中文解释的纯英文选项: ${JSON.stringify(domainOptionTexts)}`
        )
        const longDomainOption = page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '架构 / Architecture · 工作流 / Workflow' })
        const longDomainOptionMetrics = await longDomainOption.evaluate(
          (node) => {
            const content = node.querySelector(
              '.ant-select-item-option-content'
            )
            const optionRect = node.getBoundingClientRect()
            const contentRect = content?.getBoundingClientRect()
            const style = content ? getComputedStyle(content) : null
            return {
              optionHeight: Number(optionRect.height.toFixed(1)),
              contentHeight: Number((contentRect?.height || 0).toFixed(1)),
              clientWidth: content?.clientWidth || 0,
              scrollWidth: content?.scrollWidth || 0,
              overflowWrap: style?.overflowWrap || '',
              textOverflow: style?.textOverflow || '',
              whiteSpace: style?.whiteSpace || '',
            }
          }
        )
        assert.deepEqual(
          {
            overflowWrap: longDomainOptionMetrics.overflowWrap,
            textOverflow: longDomainOptionMetrics.textOverflow,
            whiteSpace: longDomainOptionMetrics.whiteSpace,
          },
          {
            overflowWrap: 'anywhere',
            textOverflow: 'clip',
            whiteSpace: 'normal',
          },
          `下拉选项应允许完整换行，不能继续单行省略: ${JSON.stringify(longDomainOptionMetrics)}`
        )
        assert(
          longDomainOptionMetrics.scrollWidth <=
            longDomainOptionMetrics.clientWidth + 1 &&
            longDomainOptionMetrics.optionHeight >=
              longDomainOptionMetrics.contentHeight,
          `长下拉选项必须完整落在自身盒内，不能横向溢出或覆盖相邻项: ${JSON.stringify(longDomainOptionMetrics)}`
        )
        await longDomainOption.click()
        const selectedDomainMetrics = await page
          .getByRole('combobox', { name: '按业务域筛选' })
          .locator('xpath=..')
          .evaluate((node) => {
            const selected = node
              .closest('.ant-select')
              ?.querySelector('.ant-select-selection-item')
            const style = selected ? getComputedStyle(selected) : null
            return {
              text: selected?.textContent?.trim() || '',
              title: selected?.getAttribute('title') || '',
              textOverflow: style?.textOverflow || '',
              whiteSpace: style?.whiteSpace || '',
            }
          })
        assert.deepEqual(
          selectedDomainMetrics,
          {
            text: '架构 / Architecture · 工作流 / Workflow',
            title: '架构 / Architecture · 工作流 / Workflow',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          `收起态应保持单行稳定高度，并通过 title 提供完整值: ${JSON.stringify(selectedDomainMetrics)}`
        )
        await domainSelect.click()
        await page.keyboard.press('Home')
        await page.keyboard.press('Enter')
        await expectText(page, '全部')

        await page.getByRole('button', { name: '查看分布分析' }).click()
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('analysis') === '1' &&
            document.querySelectorAll(
              '.erp-dev-capability-maturity-guide__item'
            ).length === 9
        )
        await expectText(page, '成熟度等级说明')
        await expectText(page, 'L0–L8 是能力成熟度')
        const maturityGuideMetrics = await page.evaluate(() => ({
          levels: [
            ...document.querySelectorAll(
              '.erp-dev-capability-maturity-guide__level'
            ),
          ].map((node) => node.textContent?.trim() || ''),
          guideText:
            document.querySelector('.erp-dev-capability-maturity-guide')
              ?.textContent || '',
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }))
        assert.deepEqual(
          maturityGuideMetrics.levels,
          ['L0', 'L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8'],
          `成熟度说明必须展示完整等级梯度: ${JSON.stringify(maturityGuideMetrics)}`
        )
        assert.match(maturityGuideMetrics.guideText, /style:l1/)
        assert.match(maturityGuideMetrics.guideText, /T0–T8/)
        assert(
          maturityGuideMetrics.scrollWidth <=
            maturityGuideMetrics.clientWidth + 1,
          `成熟度说明不应造成页面横向溢出: ${JSON.stringify(maturityGuideMetrics)}`
        )
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-capability-ledger-dark-desktop-analysis',
          selector: '.erp-dev-capability-page',
        })

        await page
          .locator('.erp-dev-capability-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '客户交付' })
          .click()
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('view') === 'delivery' &&
            document.querySelectorAll('.erp-dev-capability-row').length === 1
        )
        const deliveryMetrics = await readLedgerMetrics()
        assert.equal(
          deliveryMetrics.view,
          'delivery',
          `客户交付视图应写入 URL: ${JSON.stringify(deliveryMetrics)}`
        )
        assert.equal(
          deliveryMetrics.rowCount,
          1,
          `客户交付开发视图只应解析 1 项构建安全短摘要: ${JSON.stringify(deliveryMetrics)}`
        )
        assert(deliveryMetrics.item)

        await page
          .locator('.erp-dev-capability-view-switch .erp-dev-task-nav__item')
          .filter({ hasText: '客户差异' })
          .click()
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('view') === 'delta' &&
            document.querySelectorAll('.erp-dev-capability-row').length === 1
        )
        const deltaMetrics = await readLedgerMetrics()
        assert.equal(
          deltaMetrics.view,
          'delta',
          `客户差异视图应写入 URL: ${JSON.stringify(deltaMetrics)}`
        )
        assert.equal(
          deltaMetrics.rowCount,
          1,
          `客户差异开发视图只应解析 1 项构建安全短摘要: ${JSON.stringify(deltaMetrics)}`
        )

        await page
          .getByPlaceholder('搜索能力、风险、证据、下一步或客户项')
          .fill('__no_match__')
        await expectText(page, '没有匹配差异')
        const emptyMetrics = await readLedgerMetrics()
        assert.equal(
          emptyMetrics.rowCount,
          0,
          `零结果筛选不能回退显示筛选外条目: ${JSON.stringify(emptyMetrics)}`
        )
        await page
          .getByPlaceholder('搜索能力、风险、证据、下一步或客户项')
          .fill('')
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () =>
            new URL(location.href).searchParams.get('view') === 'delivery' &&
            document.querySelectorAll('.erp-dev-capability-row').length === 1
        )
        const historyMetrics = await readLedgerMetrics()
        assert.equal(
          historyMetrics.rowCount,
          1,
          `浏览器后退应恢复客户交付视图: ${JSON.stringify(historyMetrics)}`
        )
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-capability-ledger-dark-desktop',
          selector: '.erp-dev-capability-page',
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-capability-ledger-dark-desktop'
        )
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
            view: new URL(location.href).searchParams.get('view'),
            doc: new URL(location.href).searchParams.get('doc'),
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
            activeDocAriaCurrent:
              document
                .querySelector('.erp-dev-testing-doc-row--active')
                ?.getAttribute('aria-current') || '',
            pressedCategoryCount: document.querySelectorAll(
              '.erp-dev-testing-filter__item[aria-pressed="true"]'
            ).length,
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
          defaultMetrics.view === 'tiers' && Boolean(defaultMetrics.doc),
          `测试入口默认视图和选中文档应写入 URL: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.activeDocAriaCurrent === 'true' &&
            defaultMetrics.pressedCategoryCount === 1,
          `测试文档和分类当前项应向读屏暴露选中状态: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.tierCount >= 8,
          `测试入口应渲染测试分层: ${JSON.stringify(defaultMetrics)}`
        )
        assert.equal(
          defaultMetrics.docCount,
          9,
          `测试入口只应渲染当前白名单文档: ${JSON.stringify(defaultMetrics)}`
        )
        assert(
          defaultMetrics.docPaths.includes('scripts/README.md') &&
            defaultMetrics.docPaths.includes('web/scripts/README.md') &&
            defaultMetrics.docPaths.includes('web/README.md'),
          `测试入口应包含当前 QA、浏览器脚本和前端说明: ${JSON.stringify(defaultMetrics)}`
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
              'mvp-closure.mjs --run-report-tools --out output/customers/yoyoosun/mvp-closure'
            ) &&
            !mvpLocalClosureClipboard.includes('--with-postgres') &&
            !mvpLocalClosureClipboard.includes(
              'smoke:purchase-receipt-real-write'
            ) &&
            !mvpLocalClosureClipboard.includes('--apply') &&
            !mvpLocalClosureClipboard.includes('--execute'),
          `MVP 本地闭环预设应只复制 plan-only、preflight 和 no-write report tools 命令: ${mvpLocalClosureClipboard}`
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
          .filter({ hasText: 'T5 Frontend/UI' })
          .getByRole('button', { name: '复制' })
          .click()
        const tierClipboard = await page.evaluate(() =>
          navigator.clipboard.readText()
        )
        assert(
          tierClipboard.includes('pnpm --dir web lint') &&
            tierClipboard.includes('pnpm --dir web test'),
          `T5 层级复制内容应来自当前测试策略最小验证命令: ${tierClipboard}`
        )

        await page
          .locator('.erp-dev-testing-reader__toolbar .ant-segmented-item')
          .filter({ hasText: '命令入口 / Commands' })
          .click()
        await expectText(page, 'pnpm style:l1')
        assert.equal(
          new URL(page.url()).searchParams.get('view'),
          'commands',
          '测试命令视图应写入 URL 供刷新和历史恢复'
        )
        const commandMetrics = await page.evaluate(() => {
          const blocks = [
            ...document.querySelectorAll('.erp-dev-testing-command-block'),
          ]
          const blockMetrics = blocks.map((block) => {
            const rect = block.getBoundingClientRect()
            const command =
              block.querySelector('pre')?.textContent?.trim() || ''
            return {
              height: rect.height,
              scrollHeight: block.scrollHeight,
              endsWithContinuation: /\\\s*$/u.test(command),
            }
          })
          return {
            commandBlocks: blocks.length,
            hasCommandPre: Boolean(
              document.querySelector('.erp-dev-testing-command-block pre')
            ),
            minimumHeight: Math.min(...blockMetrics.map((item) => item.height)),
            clippedCount: blockMetrics.filter(
              (item) => item.height + 1 < item.scrollHeight
            ).length,
            danglingContinuationCount: blockMetrics.filter(
              (item) => item.endsWithContinuation
            ).length,
          }
        })
        assert(
          commandMetrics.commandBlocks > 0 && commandMetrics.hasCommandPre,
          `测试入口命令视图应渲染命令块: ${JSON.stringify(commandMetrics)}`
        )
        assert(
          commandMetrics.minimumHeight >= 80 &&
            commandMetrics.clippedCount === 0 &&
            commandMetrics.danglingContinuationCount === 0,
          `测试命令块必须完整可见且不能复制残缺续行: ${JSON.stringify(commandMetrics)}`
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
      name: 'dev-testing-coverage-loading-desktop',
      path: '/__dev/testing?view=coverage',
      themeMode: 'light',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const loadingRelease = createDeferred()
        releaseCoverageLoadingResponse = loadingRelease.resolve
        await page.route('**/__dev/api/qa/coverage', async (route) => {
          await loadingRelease.promise
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'missing',
              message: 'Style L1 loading fixture released',
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '开发测试入口 / Dev Test Entry')
        await page
          .getByLabel('覆盖报告加载中')
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await page.getByLabel('测试覆盖状态').getAttribute('aria-busy'),
          'true',
          '覆盖报告等待接口时必须暴露 loading 状态'
        )
        releaseCoverageLoadingResponse()
        await expectText(page, '当前没有可展示的覆盖报告 / No coverage report')
        await assertNoHorizontalOverflow(
          page,
          'dev-testing-coverage-loading-desktop'
        )
      },
    },
    {
      name: 'dev-testing-coverage-missing-mobile',
      path: '/__dev/testing?view=coverage',
      themeMode: 'light',
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await page.route('**/__dev/api/qa/coverage', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: 'missing',
              message: '尚未生成覆盖报告',
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '覆盖状态 / Coverage')
        await expectText(page, '尚未生成覆盖报告')
        await expectText(page, '当前没有可展示的覆盖报告 / No coverage report')
        await expectButton(page, '复制生成命令')
        await expectButton(page, '重新读取')
        assert.equal(
          await page.locator('.erp-dev-testing-sidebar').count(),
          0,
          '覆盖视图不应保留无关文档筛选侧栏'
        )
        const coverageMetrics = await page.evaluate(() => {
          const root = document.querySelector('.erp-dev-testing-coverage-view')
          const segmented = document.querySelector(
            '.erp-dev-testing-reader__toolbar .ant-segmented-group'
          )
          return {
            rootScrollWidth: root?.scrollWidth || 0,
            rootClientWidth: root?.clientWidth || 0,
            segmentedColumns: segmented
              ? getComputedStyle(segmented).gridTemplateColumns
              : '',
          }
        })
        assert(
          coverageMetrics.rootScrollWidth <=
            coverageMetrics.rootClientWidth + 1,
          `覆盖缺失移动态不应横向溢出: ${JSON.stringify(coverageMetrics)}`
        )
        assert(
          coverageMetrics.segmentedColumns.split(' ').length === 2,
          `四个覆盖视图按钮在移动端应使用两列: ${JSON.stringify(coverageMetrics)}`
        )
      },
    },
    {
      name: 'dev-testing-coverage-current-stale-dark-desktop',
      path: '/__dev/testing?view=coverage',
      themeMode: 'dark',
      viewport: { width: 1536, height: 900 },
      beforeNavigate: async (page) => {
        coverageFixtureEnvelopeStatus = 'current'
        await page.route('**/__dev/api/qa/coverage', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              status: coverageFixtureEnvelopeStatus,
              message:
                coverageFixtureEnvelopeStatus === 'stale'
                  ? 'fixture commit 与当前工作区不一致'
                  : '',
              report: buildCoverageFixtureReport(),
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '报告与当前仓库指纹匹配')
        await expectText(page, '91/100 · 91%')
        await expectText(page, '92.5%')
        await expectText(page, '86%')
        await expectText(page, '47/50 · 94%')
        await expectText(page, '业务合同与关键场景 / Business Coverage')
        await expectText(page, '本轮 T0-T8 门禁 / Required Gates')
        await expectText(page, '运行态与验收 / Runtime & Acceptance')
        await expectText(page, '目标环境 / Target Environment')
        await expectText(page, '客户验收 / UAT')
        await expectText(page, '仓库整体 baseline 未建立前只采集趋势')
        await expectText(
          page,
          '本轮承诺的 PostgreSQL、浏览器、readiness、目标环境和 UAT 分别要求 100%'
        )
        await expectText(page, '0 tests executed 均不能算通过')
        assert.equal(
          await page
            .locator('.erp-dev-testing-coverage-card--blocked')
            .filter({ hasText: 'T7 业务集成' })
            .count(),
          1,
          '受阻门禁必须保持 blocked，不能被汇总成通过'
        )
        assert.equal(
          await page
            .locator('.erp-dev-testing-coverage-card--not_collected')
            .filter({ hasText: '生产' })
            .count(),
          1,
          '未采集业务域必须明确显示未采集'
        )
        assert.equal(
          await page
            .locator('.erp-dev-testing-coverage-card--partial')
            .filter({ hasText: '质检' })
            .getByText('缺失 1', { exact: true })
            .count(),
          1,
          '存在 missingCases 的业务域必须降级 partial 并显示缺失数'
        )
        const notApplicableGate = page
          .locator('.erp-dev-testing-coverage-card--not_applicable')
          .filter({ hasText: 'T4 未受影响门禁' })
        assert.equal(
          await notApplicableGate.count(),
          1,
          '明确 required=false 的未受影响门禁应显示 N/A'
        )
        assert.equal(
          await notApplicableGate
            .locator('.erp-dev-testing-coverage-card__metrics')
            .count(),
          0,
          'N/A 门禁不能显示百分比'
        )
        await page.getByRole('button', { name: '复制生成命令' }).click()
        assert.equal(
          await page.evaluate(() => navigator.clipboard.readText()),
          'node scripts/qa/test-coverage-report.mjs --write',
          '覆盖页只应复制报告生成命令'
        )

        coverageFixtureEnvelopeStatus = 'stale'
        await page.getByRole('button', { name: '重新读取' }).click()
        await expectText(page, '覆盖报告已过期')
        await expectText(page, 'fixture commit 与当前工作区不一致')
        assert.equal(
          await page
            .locator('.erp-dev-testing-coverage-identity')
            .getByText('报告过期 / Stale', { exact: true })
            .count(),
          1,
          '重新读取 stale 报告后必须更新报告身份状态'
        )
        await assertERPThemeMode(page, {
          scenarioName: 'dev-testing-coverage-current-stale-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-testing-coverage-current-stale-dark-desktop',
          selector: '.erp-dev-testing-page',
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-testing-coverage-current-stale-dark-desktop'
        )
      },
    },
    {
      name: 'erp-business-dashboard-mobile',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '超级管理员')
        await expectText(page, '业务管理')
        await expectText(page, '业务看板')
        await expectText(page, '业务数据')
        await expectText(page, '需要关注')
        await assertTextAbsent(page, '数字说明')
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
        await page
          .getByRole('button', { name: '查看客户', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
      },
    },
    {
      name: 'permission-center-loading-state',
      path: '/erp/system/permissions?__style_l1_admin_list_delay=900',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '岗位设置加载中')
        await expectText(page, '正在加载员工账号和岗位，请稍候...')
        await assertERPThemeMode(page, {
          scenarioName: 'permission-center-loading-state',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkLoadingState(page, {
          scenarioName: 'permission-center-loading-state',
        })
        await expectHeading(page, '权限管理')
        await assertTextAbsent(page, '岗位设置加载中')
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
        await expectText(page, '岗位设置')
        await expectText(page, '员工账号')
        await expectText(page, '先设置岗位，再分配账号')
        await expectText(page, '已分配账号')
        await expectText(page, '可用功能')
        await expectText(page, '数据范围')
        await expectText(page, '敏感字段')
        await expectText(page, '最终有效权限')
        await expectText(page, '选择这个岗位可以使用的功能')
        await page.getByRole('tab', { name: '数据范围' }).click()
        await expectText(page, '仓库与库存查看范围已生效')
        await expectText(page, '仓库范围模式')
        await page.getByRole('tab', { name: '敏感字段' }).click()
        await expectText(page, '敏感字段由独立权限控制')
        await expectText(page, '销售商业')
        await page.waitForTimeout(350)
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-policy-tabs.png',
          fullPage: true,
        })
        await page.getByRole('tab', { name: '最终有效权限' }).click()
        await expectText(page, '当前客户已启用版本')
        await expectText(page, '当前可用结果')
        const permissionMapMetrics = await page.evaluate(() => {
          const table = document.querySelector(
            '.erp-role-policy-tabs .ant-table'
          )
          const holder = table?.querySelector('.ant-table-container')
          return {
            width: table?.getBoundingClientRect().width || 0,
            scrollWidth: holder?.scrollWidth || 0,
            clientWidth: holder?.clientWidth || 0,
          }
        })
        assert(
          permissionMapMetrics.width > 0 &&
            permissionMapMetrics.scrollWidth <=
              permissionMapMetrics.clientWidth + 1,
          `权限地图表格出现横向溢出: ${JSON.stringify(permissionMapMetrics)}`
        )
        await page.waitForTimeout(350)
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-permission-map.png',
          fullPage: true,
        })
        await expectText(page, '当前勾选的功能影响')
        await expectText(page, '可使用')
        await expectText(page, '不可使用')
        await page.getByRole('tab', { name: '可用功能' }).click()
        await assertTextAbsent(page, '当前角色权限尚未保存')
        await assertTextAbsent(page, '角色名称可按岗位调整，职责权限保持统一')
        await assertTextAbsent(page, 'system.role.permission.manage')
        await assertTextAbsent(page, '当前客户角色模板')
        await assertTextAbsent(page, '客户模板')
        await assertTextAbsent(page, '不同甲方')
        await expectText(page, '保存岗位设置')
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
          const capabilityOverview = document.querySelector(
            '.erp-role-capability-overview'
          )
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
            capabilityScrollWidth: capabilityOverview?.scrollWidth || 0,
            capabilityClientWidth: capabilityOverview?.clientWidth || 0,
          }
        })
        assert(
          roleCenterMetrics.activeTabText.includes('岗位设置') &&
            roleCenterMetrics.hasRoleSection &&
            roleCenterMetrics.roleHeight > 0,
          `权限管理默认应先显示岗位设置 tab: ${JSON.stringify(roleCenterMetrics)}`
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
        assert(
          roleCenterMetrics.capabilityScrollWidth <=
            roleCenterMetrics.capabilityClientWidth + 1,
          `权限管理岗位能力视图出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
        )
        await assertPermissionChecklistItemLayout(page, {
          scenarioName: 'permission-center-desktop',
        })
        await expectText(page, '只看已选')
        await page
          .locator('.erp-permission-checklist__actions button:not([disabled])')
          .filter({ hasText: '全选本组' })
          .first()
          .click()
        await expectText(page, '有未保存调整')
        const roleCards = page.locator('.erp-role-template-card')
        if ((await roleCards.count()) > 1) {
          await roleCards.nth(1).click()
          await expectText(page, '放弃未保存的岗位调整？')
          await page.getByRole('button', { name: '继续编辑' }).click()
          await expectText(page, '有未保存调整')
        }
        await page.getByRole('tab', { name: /员工账号/ }).click()
        await expectText(page, '切换页面前要放弃未保存的修改吗？')
        await page.getByRole('button', { name: '放弃修改' }).click()
        await expectText(page, '员工账号与岗位')
        await expectText(page, '创建员工账号')
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
          adminTabMetrics.activeTabText.includes('员工账号') &&
            adminTabMetrics.hasAdminSection &&
            adminTabMetrics.adminHeight > 0,
          `权限管理切换员工账号 tab 后应显示账号表: ${JSON.stringify(adminTabMetrics)}`
        )
        assert(
          adminTabMetrics.documentScrollWidth <=
            adminTabMetrics.documentClientWidth + 1,
          `权限管理员工账号 tab 出现横向溢出: ${JSON.stringify(adminTabMetrics)}`
        )
        const adminSearch = page.getByPlaceholder('搜索员工账号、手机号或岗位')
        await adminSearch.fill('assistant')
        await expectText(page, '命中 1/2 个员工账号')
        const filteredTableText = await page
          .locator('.erp-permission-section--admins .ant-table-tbody')
          .innerText()
        assert(
          filteredTableText.includes('assistant-admin') &&
            !filteredTableText.includes('style-l1-admin'),
          `权限管理搜索结果不符合预期: ${filteredTableText}`
        )
        await adminSearch.fill('')
        await expectText(page, '共 2 个员工账号')
        await assertPaginationSizeChangerFocusStyle(page, {
          scenarioName: 'permission-center-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'permission-center-desktop',
          expectVisible: true,
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '当前页面数据已刷新')
        await page.getByRole('button', { name: '创建员工账号' }).click()
        await expectText(page, '创建员工账号')
        await expectText(page, '初始密码')
        await expectText(page, '岗位')
        await expectText(page, '选择一个或多个岗位')
        await assertAdminRoleModalLayout(page, {
          scenarioName: 'permission-center-create-modal',
          title: '创建员工账号',
        })
        await assertTextAbsent(page, '搜索菜单权限名称或路径')
        await page
          .locator('.ant-modal-content')
          .filter({ hasText: '创建员工账号' })
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
        await expectText(page, '已重置员工账号 assistant-admin 的密码')
        await page
          .getByRole('row', { name: /assistant-admin/ })
          .getByRole('button', { name: '离职注销' })
          .click()
        await expectText(page, '未完成的个人待办将退回原负责岗位')
        await expectText(page, '注销原因')
        await page
          .locator('.ant-modal-content')
          .filter({ hasText: '离职注销账号' })
          .last()
          .locator('textarea')
          .fill('员工离职')
        await page
          .locator('.ant-modal-content')
          .filter({ hasText: '离职注销账号' })
          .last()
          .getByRole('button', { name: '确认注销' })
          .click()
        await expectText(page, '账号已注销，1 项未完成待办已退回原岗位')
        const revokedRow = page.getByRole('row', { name: /assistant-admin/ })
        await expectText(revokedRow, '已注销')
        await expectText(revokedRow, '员工离职')
        await expectText(revokedRow, '已注销')
        const revokeButton = revokedRow.getByRole('button', { name: '已注销' })
        assert.equal(
          await revokeButton.isDisabled(),
          true,
          '已注销账号不能再次执行注销或通过普通启停恢复'
        )
      },
    },
    {
      name: 'system-audit-logs-phone-390',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await expectText(page, '员工岗位变更')
        await assertAuditLogsCompactDetailDrawer(page, {
          scenarioName: 'system-audit-logs-phone-390',
          expectedPanelWidth: 390,
        })
      },
    },
    {
      name: 'system-audit-logs-tablet-820',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 820, height: 1180 },
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await expectText(page, '员工岗位变更')
        await assertAuditLogsCompactDetailDrawer(page, {
          scenarioName: 'system-audit-logs-tablet-820',
          expectedPanelWidth: 560,
        })
      },
    },
    {
      name: 'system-audit-logs-desktop',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await expectText(
          page,
          '查看员工账号、岗位和系统设置的操作记录，需要时按风险和操作类型筛选。'
        )
        await expectText(page, '员工岗位变更')
        await expectText(page, '员工账号已记录')
        await expectText(page, '系统准备未完成，请联系管理员检查系统设置')
        await expectText(page, '下一步')
        await expectText(page, '修改内容')
        await assertTextAbsent(page, '生产环境缺少显式初始化确认')
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
          5,
          `打印模板目录应展示五套正式模板按钮: ${JSON.stringify(templateButtonSemantics)}`
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
      name: 'print-center-engineering-preview-tablet',
      path: '/erp/print-center?template=engineering-material-detail',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 968, height: 534 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        await expectText(page, '纸面预览')
        const templateButtons = [
          { name: /^物料分析明细表/, title: '物料分析明细表' },
          { name: /^色卡/, title: '色卡' },
          { name: /^作业指导书/, title: '作业指导书' },
        ]
        for (const template of templateButtons) {
          await page
            .locator('.erp-print-center-template-list')
            .getByRole('button', { name: template.name })
            .click()
          await page
            .locator('.erp-print-center-preview-panel')
            .getByText(template.title, { exact: true })
            .waitFor({ state: 'visible' })
          const metrics = await page.evaluate((expectedTitle) => {
            const workbench = document.querySelector(
              '.erp-print-center-workbench'
            )
            const navPanel = document.querySelector(
              '.erp-print-center-nav-panel'
            )
            const previewPanel = document.querySelector(
              '.erp-print-center-preview-panel'
            )
            const previewPaper = document.querySelector(
              '.erp-print-center-paper-preview'
            )
            const navRect = navPanel?.getBoundingClientRect()
            const previewRect = previewPanel?.getBoundingClientRect()
            const paperRect = previewPaper?.getBoundingClientRect()
            return {
              gridTemplateColumns:
                workbench &&
                window.getComputedStyle(workbench).gridTemplateColumns,
              navRect: navRect
                ? {
                    x: navRect.x,
                    y: navRect.y,
                    width: navRect.width,
                    height: navRect.height,
                  }
                : null,
              previewRect: previewRect
                ? {
                    x: previewRect.x,
                    y: previewRect.y,
                    width: previewRect.width,
                    height: previewRect.height,
                  }
                : null,
              paperRect: paperRect
                ? {
                    width: paperRect.width,
                    height: paperRect.height,
                  }
                : null,
              previewText:
                previewPanel?.textContent?.replace(/\s+/gu, ' ').trim() || '',
              viewportHeight: window.innerHeight,
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
              expectedTitle,
            }
          }, template.title)
          assert(
            metrics.gridTemplateColumns &&
              metrics.gridTemplateColumns.split(' ').length >= 2,
            `968px 下工程模板预览不应被过早堆到列表下方: ${JSON.stringify(
              metrics
            )}`
          )
          assert(
            metrics.navRect &&
              metrics.previewRect &&
              metrics.previewRect.x > metrics.navRect.x &&
              metrics.previewRect.y <= metrics.navRect.y + 4 &&
              metrics.previewRect.y < metrics.viewportHeight - 160,
            `968px 下工程模板纸面预览应与模板列表同屏可见: ${JSON.stringify(
              metrics
            )}`
          )
          assert(
            metrics.paperRect?.width >= 360 &&
              metrics.paperRect?.height >= 320 &&
              metrics.previewText.includes(template.title),
            `工程模板纸面预览应渲染当前模板样例: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.documentScrollWidth <= metrics.documentClientWidth + 2,
            `工程模板预览不应产生横向溢出: ${JSON.stringify(metrics)}`
          )
        }
        await assertERPThemeMode(page, {
          scenarioName: 'print-center-engineering-preview-tablet',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoHorizontalOverflow(
          page,
          'print-center-engineering-preview-tablet'
        )
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
        await expectText(page, '加工项目')
        await expectText(page, '面*1')
        const totalRow = page.locator('.erp-print-table__total')
        await totalRow.getByText('300', { exact: true }).waitFor()
        await totalRow.getByText('45', { exact: true }).waitFor()
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
      name: 'print-workspace-engineering-material-detail-shell-refresh',
      path: '/erp/print-center?template=engineering-material-detail',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '物料分析明细表',
          editableSelector:
            '.erp-material-detail-table tbody td .erp-engineering-print-editable[contenteditable="true"]',
          editableScenarioLabel: '物料分析明细表弹窗刷新恢复',
        })
      },
    },
    {
      name: 'print-workspace-engineering-color-card-shell-refresh',
      path: '/erp/print-center?template=engineering-color-card',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '色卡',
          editableSelector:
            '.erp-color-card-paper__position-cell .erp-engineering-print-editable[contenteditable="true"]',
          editableScenarioLabel: '色卡弹窗刷新恢复',
        })
      },
    },
    {
      name: 'print-workspace-engineering-work-instruction-shell-refresh',
      path: '/erp/print-center?template=engineering-work-instruction',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '作业指导书',
          editableSelector:
            '.erp-work-instruction-paper__step-content-cell .erp-engineering-print-editable[contenteditable="true"]',
          editableScenarioLabel: '作业指导书弹窗刷新恢复',
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
        await expectText(page, '打印内容')
        await expectText(page, '使用默认模板')
        await expectText(page, '在线预览 PDF')
        await expectText(page, '选择明细行')
        await expectText(page, '下载 PDF')
        await assertPrintWorkspacePaginationStyle(page, {
          paperSelector: '.erp-material-contract-paper',
          rowSelector: '.erp-material-contract-table tbody tr',
          theadSelector: '.erp-material-contract-table thead',
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-material-contract-paper',
          scenarioLabel: '采购合同模板',
          screenshotName: 'print-workspace-material-paper-top-rhythm',
        })
        await assertContractPaperSidePaddingAndTableWidth(page, {
          paperSelector: '.erp-material-contract-paper',
          tableSelector: '.erp-material-contract-table',
          scenarioLabel: '采购合同模板',
          screenshotName: 'print-workspace-material-contract-narrow-padding',
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
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-material-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '采购合同模板表格',
        })
        await assertMaterialContractLineCellsWrapLongValues(page, {
          storageKey: '__plush_erp_material_purchase_contract_print_draft__',
          scenarioLabel: '采购合同明细长编号带值',
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
      name: 'print-workspace-contract-title-parity',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const readTitleMetrics = async (selector) =>
          page
            .locator(selector)
            .first()
            .evaluate((node) => {
              const style = window.getComputedStyle(node)
              const rect = node.getBoundingClientRect()
              return {
                text: String(node.textContent || '').trim(),
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                letterSpacing: style.letterSpacing,
                height: rect.height,
              }
            })

        await expectText(page, '合同订单')
        const materialTitle = await readTitleMetrics(
          '.erp-material-contract-paper__title'
        )
        await page
          .locator('.erp-material-contract-paper__title')
          .first()
          .screenshot({
            path: path.join(
              outputDir,
              'print-workspace-material-title-parity.png'
            ),
          })

        await gotoScenarioPath(page, '/erp/print-workspace/processing-contract')
        await expectText(page, '加工合同')
        const processingTitle = await readTitleMetrics(
          '.erp-processing-contract-paper__title'
        )
        await page
          .locator('.erp-processing-contract-paper__title')
          .first()
          .screenshot({
            path: path.join(
              outputDir,
              'print-workspace-processing-title-parity.png'
            ),
          })

        assert.deepEqual(
          {
            fontFamily: processingTitle.fontFamily,
            fontSize: processingTitle.fontSize,
            fontWeight: processingTitle.fontWeight,
            letterSpacing: processingTitle.letterSpacing,
          },
          {
            fontFamily: materialTitle.fontFamily,
            fontSize: materialTitle.fontSize,
            fontWeight: materialTitle.fontWeight,
            letterSpacing: materialTitle.letterSpacing,
          },
          `加工合同纸面标题应和采购合同纸面标题使用同一套字体规则: ${JSON.stringify(
            { materialTitle, processingTitle }
          )}`
        )
        assert(
          Math.abs(processingTitle.height - materialTitle.height) <= 1,
          `加工合同纸面标题高度应和采购合同纸面标题接近: ${JSON.stringify({
            materialTitle,
            processingTitle,
          })}`
        )
      },
    },
    {
      name: 'print-workspace-processing',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '加工合同')
        await expectText(page, '打印内容')
        await expectText(page, '使用默认模板')
        await expectText(page, '在线预览 PDF')
        await expectText(page, '下载 PDF')
        await expectText(page, '选择明细行')
        await expectText(page, '加工明细行: 3/300')
        await expectText(page, '打印')
        await expectButton(page, '添加末尾图片')
        await assertProcessingContractPaperRowCount(page)
        await assertProcessingContractSignatureLayout(page)
        await assertPrintWorkspacePaginationStyle(page, {
          paperSelector: '.erp-processing-contract-paper',
          rowSelector: '.erp-processing-contract-table tbody tr',
          theadSelector: '.erp-processing-contract-table thead',
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-processing-contract-paper',
          scenarioLabel: '加工合同模板',
          screenshotName: 'print-workspace-processing-paper-top-rhythm',
        })
        await assertContractPaperSidePaddingAndTableWidth(page, {
          paperSelector: '.erp-processing-contract-paper',
          tableSelector: '.erp-processing-contract-table',
          scenarioLabel: '加工合同模板',
          screenshotName: 'print-workspace-processing-contract-narrow-padding',
        })
        await assertContractTableHeadersStaySingleLine(page, {
          tableSelector: '.erp-processing-contract-table',
          expectedHeaders: [
            '委外加工订单号',
            '来源订单编号',
            '产品 / 材料编号',
            '产品 / 材料名称',
            '加工项目',
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
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
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
        const emptyAppendixState = await page.evaluate(() => {
          const manager = document.querySelector(
            '[data-print-appendix-manager]'
          )
          return {
            managerCount: document.querySelectorAll(
              '[data-print-appendix-manager]'
            ).length,
            managerInPanel: Boolean(
              manager?.closest('.erp-print-shell__record-panel')
            ),
            managerInStage: Boolean(
              manager?.closest('.erp-print-shell__stage')
            ),
            paperAppendixCount: document.querySelectorAll(
              '.erp-processing-contract-paper [data-print-appendix-images]'
            ).length,
            legacyAttachmentCount: document.querySelectorAll(
              '.erp-processing-contract-attachments'
            ).length,
          }
        })
        assert.deepEqual(
          emptyAppendixState,
          {
            managerCount: 1,
            managerInPanel: true,
            managerInStage: false,
            paperAppendixCount: 0,
            legacyAttachmentCount: 0,
          },
          `加工合同应使用左侧共享末尾附图管理区，未添加时不占纸面: ${JSON.stringify(emptyAppendixState)}`
        )
      },
    },
    {
      name: 'engineering-print-workspace-row-buttons',
      path: '/erp/print-workspace/engineering-material-detail?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        const collectToolbarGroups = async () =>
          page.evaluate(() =>
            [
              ...document.querySelectorAll('.erp-print-shell__toolbar-group'),
            ].map((group) => ({
              buttons: [...group.querySelectorAll('button')].map((button) => ({
                text: String(button.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                disabled: button.disabled,
              })),
            }))
          )
        const assertButtonTexts = (group, expectedTexts, scenarioLabel) => {
          const actualTexts = (group?.buttons || []).map(
            (button) => button.text
          )
          assert.deepEqual(
            actualTexts,
            expectedTexts,
            `${scenarioLabel} 按钮文案应对齐打印合同工作台: ${JSON.stringify(actualTexts)}`
          )
        }
        const assertNoLegacyEngineeringRowButtonText = async (
          scenarioLabel
        ) => {
          const text = await page.evaluate(() => document.body?.innerText || '')
          assert(
            !/追加|块内加行|段落加行|移除色卡行|移除作业行|上插作业行|下插作业行|选择作业行|选择段落行|上插段落行|下插段落行/u.test(
              text
            ),
            `${scenarioLabel} 不应保留旧行操作按钮文案: ${text}`
          )
        }
        const assertEngineeringEditorRounded = async (scenarioLabel) => {
          const metrics = await page.evaluate(() => {
            const panel = document.querySelector(
              '.erp-print-shell__record-panel'
            )
            const table = document.querySelector(
              '.erp-print-shell__record-table'
            )
            const editor = document.querySelector(
              '.erp-print-shell__field-editor'
            )
            const paper = document.querySelector('.erp-engineering-print-paper')
            const panelStyle = panel && window.getComputedStyle(panel)
            const tableStyle = table && window.getComputedStyle(table)
            const editorStyle = editor && window.getComputedStyle(editor)
            const paperStyle = paper && window.getComputedStyle(paper)
            return {
              panelRadius: panelStyle?.borderTopLeftRadius || '',
              tableRadius: tableStyle?.borderTopLeftRadius || '',
              tableOverflow: tableStyle?.overflow || '',
              tableBorderCollapse: tableStyle?.borderCollapse || '',
              editorRadius: editorStyle?.borderTopLeftRadius || '',
              paperRadius: paperStyle?.borderTopLeftRadius || '',
              paperOverflow: paperStyle?.overflow || '',
              isWorkInstructionPaper:
                paper?.classList.contains('erp-work-instruction-paper') ||
                false,
              tableWidth: table?.getBoundingClientRect().width || 0,
              tableScrollWidth: table?.scrollWidth || 0,
              tableClientWidth: table?.clientWidth || 0,
            }
          })
          assert(
            parseFloat(metrics.panelRadius) >= 8 &&
              parseFloat(metrics.tableRadius) >= 10 &&
              parseFloat(metrics.editorRadius) >= 8 &&
              parseFloat(metrics.paperRadius) >= 10 &&
              (metrics.paperOverflow === 'hidden' ||
                (metrics.isWorkInstructionPaper &&
                  metrics.paperOverflow === 'visible')) &&
              metrics.tableOverflow === 'hidden' &&
              metrics.tableBorderCollapse === 'separate' &&
              metrics.tableScrollWidth <= metrics.tableClientWidth + 1,
            `${scenarioLabel} 左侧字段表和右侧纸面编辑区应保持圆角且不横向溢出: ${JSON.stringify(metrics)}`
          )
        }
        const collectEngineeringPaperBox = async (paperSelector) =>
          page.evaluate((selector) => {
            const stage = document.querySelector('.erp-print-shell__stage')
            const paper = document.querySelector(selector)
            const style = paper && window.getComputedStyle(paper)
            const stageRect = stage?.getBoundingClientRect()
            const paperRect = paper?.getBoundingClientRect()
            return {
              foundPaper: Boolean(paper),
              boxSizing: style?.boxSizing || '',
              marginLeft: style?.marginLeft || '',
              marginRight: style?.marginRight || '',
              paddingLeft: style?.paddingLeft || '',
              paddingRight: style?.paddingRight || '',
              borderLeftWidth: style?.borderLeftWidth || '',
              borderRightWidth: style?.borderRightWidth || '',
              backgroundColor: style?.backgroundColor || '',
              paperWidth: paperRect?.width || 0,
              stageWidth: stageRect?.width || 0,
              paperLeftGap:
                stageRect && paperRect ? paperRect.left - stageRect.left : -1,
              paperRightGap:
                stageRect && paperRect ? stageRect.right - paperRect.right : -1,
            }
          }, paperSelector)
        const assertEngineeringPaperScreenPrintBox = async (
          paperSelector,
          scenarioLabel
        ) => {
          const screenMetrics = await collectEngineeringPaperBox(paperSelector)
          await page.emulateMedia({ media: 'print' })
          const printMetrics = await collectEngineeringPaperBox(paperSelector)
          await page.emulateMedia({ media: 'screen' })
          const parsePx = (value) => Number.parseFloat(value) || 0
          assert(
            screenMetrics.foundPaper &&
              printMetrics.foundPaper &&
              screenMetrics.boxSizing === 'border-box' &&
              printMetrics.boxSizing === 'border-box' &&
              Math.abs(
                parsePx(screenMetrics.paddingLeft) -
                  parsePx(screenMetrics.paddingRight)
              ) <= 1 &&
              Math.abs(
                parsePx(printMetrics.paddingLeft) -
                  parsePx(printMetrics.paddingRight)
              ) <= 1 &&
              Math.abs(screenMetrics.paperWidth - printMetrics.paperWidth) <=
                2 &&
              Math.abs(
                parsePx(screenMetrics.paddingLeft) -
                  parsePx(printMetrics.paddingLeft)
              ) <= 1 &&
              Math.abs(
                parsePx(screenMetrics.paddingRight) -
                  parsePx(printMetrics.paddingRight)
              ) <= 1 &&
              Math.abs(
                screenMetrics.paperLeftGap - screenMetrics.paperRightGap
              ) <= 4 &&
              printMetrics.stageWidth >= printMetrics.paperWidth - 1 &&
              printMetrics.stageWidth <= printMetrics.paperWidth + 1 &&
              Math.abs(printMetrics.paperLeftGap) <= 1 &&
              Math.abs(printMetrics.paperRightGap) <= 1 &&
              printMetrics.borderLeftWidth === '0px' &&
              printMetrics.borderRightWidth === '0px' &&
              printMetrics.backgroundColor === 'rgb(255, 255, 255)',
            `${scenarioLabel} 工程模板纸面 screen/print 左右留白和纸张盒模型应一致: ${JSON.stringify({ screenMetrics, printMetrics })}`
          )
        }
        const capturedEngineeringPdfRequests = []
        const diagnosticPdfBuffer = Buffer.from(
          '%PDF-1.4\n%plush-style-l1-engineering\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'
        )
        await page.route('**/templates/render-pdf', async (route) => {
          const payload = route.request().postDataJSON() || {}
          capturedEngineeringPdfRequests.push(payload)
          await route.fulfill({
            status: 200,
            contentType: 'application/pdf',
            headers: {
              'Content-Disposition': `inline; filename="${payload.file_name || 'style-l1.pdf'}"`,
              'Cache-Control': 'no-store',
            },
            body: diagnosticPdfBuffer,
          })
        })
        const assertEngineeringServerPdfSnapshotPageBox = async ({
          paperSelector,
          contentSelector,
          scenarioLabel,
          screenshotName,
        }) => {
          const requestCountBefore = capturedEngineeringPdfRequests.length
          const [popup] = await Promise.all([
            page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null),
            page.getByRole('button', { name: '在线预览 PDF' }).click(),
          ])
          const deadline = Date.now() + 10_000
          while (
            capturedEngineeringPdfRequests.length <= requestCountBefore &&
            Date.now() < deadline
          ) {
            await page.waitForTimeout(100)
          }
          if (popup && !popup.isClosed()) {
            await popup.close().catch(() => {})
          }
          const payload = capturedEngineeringPdfRequests.at(-1)
          assert(
            payload?.html,
            `${scenarioLabel} 应发起服务端 PDF HTML 快照请求`
          )

          const snapshotPage = await page.context().newPage()
          try {
            await snapshotPage.setViewportSize({ width: 1440, height: 900 })
            await snapshotPage.setContent(payload.html, { waitUntil: 'load' })
            await snapshotPage.emulateMedia({ media: 'print' })
            await snapshotPage
              .locator('[data-server-pdf-root="true"]')
              .waitFor({ state: 'visible', timeout: 10_000 })
            const metrics = await snapshotPage.evaluate(
              ({ paperSelector, contentSelector }) => {
                const paper = document.querySelector(
                  '[data-server-pdf-root="true"]'
                )
                const expectedPaper = document.querySelector(paperSelector)
                const content = paper?.querySelector(contentSelector)
                const bodyRect = document.body.getBoundingClientRect()
                const paperRect = paper?.getBoundingClientRect()
                const contentRect = content?.getBoundingClientRect()
                const paperStyle = paper ? window.getComputedStyle(paper) : null
                return {
                  foundPaper: Boolean(paper),
                  foundExpectedPaper: paper === expectedPaper,
                  foundContent: Boolean(content),
                  bodyWidth: bodyRect.width,
                  paperLeft: paperRect?.left || 0,
                  paperRight: paperRect?.right || 0,
                  paperWidth: paperRect?.width || 0,
                  paperPaddingLeft: parseFloat(paperStyle?.paddingLeft || '0'),
                  paperPaddingRight: parseFloat(
                    paperStyle?.paddingRight || '0'
                  ),
                  paperMarginLeft: paperStyle?.marginLeft || '',
                  paperMarginRight: paperStyle?.marginRight || '',
                  contentLeftGap:
                    paperRect && contentRect
                      ? contentRect.left - paperRect.left
                      : null,
                  contentRightGap:
                    paperRect && contentRect
                      ? paperRect.right - contentRect.right
                      : null,
                  inlineCssHasEngineering: /erp-engineering-print-paper/u.test(
                    document.querySelector('[data-server-pdf-inline-styles]')
                      ?.textContent || ''
                  ),
                  overrideCss: document.querySelector('[data-server-pdf-style]')
                    ?.textContent,
                }
              },
              { paperSelector, contentSelector }
            )
            assert(
              metrics.foundPaper &&
                metrics.foundExpectedPaper &&
                metrics.foundContent &&
                metrics.inlineCssHasEngineering &&
                metrics.bodyWidth >= 792 &&
                metrics.bodyWidth <= 795 &&
                Math.abs(metrics.paperLeft) <= 1 &&
                Math.abs(metrics.paperRight - metrics.bodyWidth) <= 1 &&
                metrics.paperWidth >= 792 &&
                metrics.paperWidth <= 795 &&
                Math.abs(
                  metrics.paperPaddingLeft - metrics.paperPaddingRight
                ) <= 1 &&
                Math.abs(metrics.contentLeftGap - metrics.contentRightGap) <=
                  1 &&
                metrics.paperMarginLeft === '0px' &&
                metrics.paperMarginRight === '0px',
              `${scenarioLabel} 服务端 PDF 快照应以 A4 宽 body 从页面原点输出，不能在 1440px viewport 内居中导致左右留白不一致: ${JSON.stringify(metrics)}`
            )
            await snapshotPage.screenshot({
              path: path.join(outputDir, `${screenshotName}.png`),
              fullPage: false,
            })
          } finally {
            await snapshotPage.close().catch(() => {})
          }
        }
        const assertFullCellEditableCoverage = async (
          scenarioLabel,
          cellSelector,
          editorSelector
        ) => {
          const metrics = await page.evaluate(
            ({ cellSelector, editorSelector }) => {
              const cell = document.querySelector(cellSelector)
              const editor = cell?.querySelector(editorSelector)
              const cellRect = cell?.getBoundingClientRect()
              const editorRect = editor?.getBoundingClientRect()
              return {
                foundCell: Boolean(cell),
                foundEditor: Boolean(editor),
                cellWidth: cellRect?.width || 0,
                cellHeight: cellRect?.height || 0,
                editorWidth: editorRect?.width || 0,
                editorHeight: editorRect?.height || 0,
                leftGap:
                  cellRect && editorRect
                    ? editorRect.left - cellRect.left
                    : null,
                rightGap:
                  cellRect && editorRect
                    ? cellRect.right - editorRect.right
                    : null,
                topGap:
                  cellRect && editorRect ? editorRect.top - cellRect.top : null,
                bottomGap:
                  cellRect && editorRect
                    ? cellRect.bottom - editorRect.bottom
                    : null,
                editorDisplay: editor
                  ? window.getComputedStyle(editor).display
                  : '',
                editorBoxSizing: editor
                  ? window.getComputedStyle(editor).boxSizing
                  : '',
              }
            },
            { cellSelector, editorSelector }
          )
          assert(
            metrics.foundCell &&
              metrics.foundEditor &&
              metrics.editorDisplay !== 'inline' &&
              metrics.editorBoxSizing === 'border-box' &&
              metrics.editorWidth >= metrics.cellWidth - 3 &&
              metrics.editorHeight >= metrics.cellHeight - 3 &&
              Math.abs(metrics.leftGap) <= 2 &&
              Math.abs(metrics.rightGap) <= 2 &&
              Math.abs(metrics.topGap) <= 2 &&
              Math.abs(metrics.bottomGap) <= 2,
            `${scenarioLabel} 可编辑层应像加工合同一样占满所在单元格: ${JSON.stringify(metrics)}`
          )
        }
        const assertMaterialDetailTableVerticalCentering = async () => {
          const metrics = await page.evaluate(() => {
            const measureTextRect = (node) => {
              if (!node) return null
              const range = document.createRange()
              range.selectNodeContents(node)
              const rect = range.getBoundingClientRect()
              range.detach()
              return rect.width || rect.height ? rect : null
            }
            const cells = [
              ...document.querySelectorAll(
                '.erp-material-detail-table th, .erp-material-detail-table td'
              ),
            ]
            const states = cells.map((cell, index) => {
              const editor = cell.querySelector(
                '.erp-material-detail-table__editable'
              )
              const cellRect = cell.getBoundingClientRect()
              const editorRect = editor?.getBoundingClientRect()
              const textRect = measureTextRect(editor)
              const editorStyle = editor
                ? window.getComputedStyle(editor)
                : null
              return {
                index,
                text: String(editor?.textContent || cell.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                cellHeight: cellRect.height,
                editorHeight: editorRect?.height || 0,
                textHeight: textRect?.height || 0,
                editorDisplay: editorStyle?.display || '',
                editorAlignItems: editorStyle?.alignItems || '',
                centerDelta:
                  cellRect && textRect
                    ? Math.abs(
                        cellRect.top +
                          cellRect.height / 2 -
                          (textRect.top + textRect.height / 2)
                      )
                    : -1,
                fillDelta:
                  cellRect && editorRect
                    ? Math.abs(cellRect.height - editorRect.height)
                    : -1,
              }
            })
            return {
              checkedCount: states.length,
              offCenterStates: states.filter(
                (state) =>
                  state.text &&
                  state.cellHeight > 0 &&
                  state.textHeight > 0 &&
                  state.centerDelta > 6
              ),
              nonFillStates: states.filter(
                (state) =>
                  state.text && state.editorHeight > 0 && state.fillDelta > 3
              ),
              nonFlexStates: states.filter(
                (state) =>
                  state.text &&
                  (state.editorDisplay !== 'flex' ||
                    state.editorAlignItems !== 'center')
              ),
            }
          })
          assert(
            metrics.checkedCount >= 28 &&
              metrics.offCenterStates.length === 0 &&
              metrics.nonFillStates.length === 0 &&
              metrics.nonFlexStates.length === 0,
            `物料分析明细表所有表头和明细单元格内容都应上下居中且编辑层铺满单元格: ${JSON.stringify(metrics)}`
          )
        }
        const assertMaterialDetailMetaGridFieldValueTextAlignment =
          async () => {
            const metrics = await page.evaluate(() => {
              const measureTextRect = (node) => {
                if (!node) return null
                const range = document.createRange()
                range.selectNodeContents(node)
                const rect = range.getBoundingClientRect()
                range.detach()
                return rect.width || rect.height ? rect : null
              }
              const cells = [
                ...document.querySelectorAll(
                  '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
                ),
              ]
              const states = cells.map((cell, index) => {
                const label = cell.querySelector(
                  '.erp-engineering-print-meta-grid__label'
                )
                const editor = cell.querySelector(
                  '.erp-engineering-print-editable'
                )
                const cellRect = cell.getBoundingClientRect()
                const labelRect = measureTextRect(label)
                const editorTextRect = measureTextRect(editor)
                const editorBoxRect = editor?.getBoundingClientRect()
                const style = window.getComputedStyle(cell)
                const editorCenter = editorTextRect
                  ? editorTextRect.top + editorTextRect.height / 2
                  : 0
                const editorBoxCenter = editorBoxRect
                  ? editorBoxRect.top + editorBoxRect.height / 2
                  : 0
                return {
                  index,
                  text: String(cell.textContent || '')
                    .replace(/\s+/gu, ' ')
                    .trim(),
                  display: style.display,
                  alignItems: style.alignItems,
                  cellHeight: cellRect.height,
                  textTopDelta:
                    labelRect && editorTextRect
                      ? Math.abs(labelRect.top - editorTextRect.top)
                      : -1,
                  editorBoxHeight: editorBoxRect?.height || 0,
                  editorTextCenterDelta: editorTextRect
                    ? Math.abs(editorCenter - editorBoxCenter)
                    : -1,
                }
              })
              return {
                checkedCount: states.length,
                offTextAlignmentStates: states.filter(
                  (state) => state.text && state.textTopDelta > 2
                ),
                offEditorTextCenterStates: states.filter(
                  (state) => state.text && state.editorTextCenterDelta > 4
                ),
                smallEditorBoxStates: states.filter(
                  (state) => state.text && state.editorBoxHeight < 20
                ),
                nonGridBaselineStates: states.filter(
                  (state) =>
                    state.text &&
                    (state.display !== 'grid' ||
                      state.alignItems !== 'baseline')
                ),
              }
            })
            assert(
              metrics.checkedCount === 9 &&
                metrics.offTextAlignmentStates.length === 0 &&
                metrics.offEditorTextCenterStates.length === 0 &&
                metrics.smallEditorBoxStates.length === 0 &&
                metrics.nonGridBaselineStates.length === 0,
              `物料分析明细表顶部信息格字段名文字和值文字应对齐，值槽内部文字应上下居中: ${JSON.stringify(metrics)}`
            )
          }
        const assertMaterialDetailMetaValueEditableCoverage = async () => {
          const metrics = await page.evaluate(() => {
            const cells = [
              ...document.querySelectorAll(
                '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
              ),
            ]
            const states = cells.map((cell, index) => {
              const labels = [
                ...cell.querySelectorAll(
                  '.erp-engineering-print-meta-grid__label'
                ),
              ]
              const editors = [
                ...cell.querySelectorAll('.erp-engineering-print-editable'),
              ]
              const cellRect = cell.getBoundingClientRect()
              const cellStyle = window.getComputedStyle(cell)
              const paddingTop = parseFloat(cellStyle.paddingTop || '0')
              const paddingRight = parseFloat(cellStyle.paddingRight || '0')
              const paddingBottom = parseFloat(cellStyle.paddingBottom || '0')
              const contentHeight = cellRect.height - paddingTop - paddingBottom
              const pairs = editors.map((editor, pairIndex) => {
                const label = labels[pairIndex]
                const labelRect = label?.getBoundingClientRect()
                const editorRect = editor?.getBoundingClientRect()
                const editorStyle = window.getComputedStyle(editor)
                const nextLabelRect =
                  labels[pairIndex + 1]?.getBoundingClientRect()
                return {
                  pairIndex,
                  isCompoundCell: editors.length > 1,
                  label: String(label?.textContent || '')
                    .replace(/\s+/gu, '')
                    .trim(),
                  editorText: String(editor?.textContent || '')
                    .replace(/\s+/gu, ' ')
                    .trim(),
                  labelRight: labelRect?.right || 0,
                  editorLeft: editorRect?.left || 0,
                  editorRight: editorRect?.right || 0,
                  editorWidth: editorRect?.width || 0,
                  editorHeight: editorRect?.height || 0,
                  rightGap:
                    pairIndex === editors.length - 1 && editorRect
                      ? cellRect.right - paddingRight - editorRect.right
                      : 0,
                  nextPairGap:
                    nextLabelRect && editorRect
                      ? nextLabelRect.left - editorRect.right
                      : 0,
                  labelEditorGap:
                    labelRect && editorRect
                      ? editorRect.left - labelRect.right
                      : -1,
                  heightDelta: editorRect
                    ? Math.abs(contentHeight - editorRect.height)
                    : -1,
                  editorDisplay: editorStyle.display,
                  editorAlignItems: editorStyle.alignItems,
                  editorAlignSelf: editorStyle.alignSelf,
                  editorBoxSizing: editorStyle.boxSizing,
                }
              })
              return {
                index,
                text: String(cell.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                cellWidth: cellRect.width,
                cellHeight: cellRect.height,
                contentHeight,
                pairCount: pairs.length,
                pairs,
              }
            })
            const pairStates = states.flatMap((state) =>
              state.pairs.map((pair) => ({
                ...pair,
                cellIndex: state.index,
                cellText: state.text,
              }))
            )
            return {
              checkedCount: states.length,
              pairCount: pairStates.length,
              headerText: String(
                document.querySelector('.erp-material-detail-paper__header')
                  ?.textContent || ''
              ).replace(/\s+/gu, ' '),
              metaText: String(
                document.querySelector('.erp-engineering-print-meta-grid')
                  ?.textContent || ''
              ).replace(/\s+/gu, ' '),
              narrowOrInlineStates: states.filter(
                (state) =>
                  state.text &&
                  state.pairs.some(
                    (pair) =>
                      pair.editorDisplay !== 'flex' ||
                      pair.editorAlignItems !== 'center' ||
                      pair.editorBoxSizing !== 'border-box' ||
                      pair.editorAlignSelf !== 'baseline'
                  )
              ),
              nonFillingValueSlots: pairStates.filter(
                (pair) =>
                  pair.editorWidth <= 0 ||
                  pair.editorHeight <= 0 ||
                  pair.rightGap > 2 ||
                  pair.labelEditorGap < 0 ||
                  (!pair.isCompoundCell && pair.nextPairGap < 0)
              ),
              states,
              pairStates,
            }
          })
          assert(
            metrics.checkedCount === 9 &&
              metrics.pairCount === 9 &&
              !metrics.headerText.includes('毛向') &&
              metrics.metaText.includes('毛向') &&
              metrics.narrowOrInlineStates.length === 0 &&
              metrics.nonFillingValueSlots.length === 0,
            `物料分析明细表顶部信息格的编辑层应铺满标签右侧值槽，毛向应移入顶部信息区且不能留在源文件噪点位置: ${JSON.stringify(metrics)}`
          )
        }
        const assertMaterialDetailMetaSourceHeaderVisual = async () => {
          const metrics = await page.evaluate(() => {
            const meta = document.querySelector(
              '.erp-material-detail-paper .erp-engineering-print-meta-grid'
            )
            const table = document.querySelector('.erp-material-detail-table')
            const metaRect = meta?.getBoundingClientRect()
            const tableRect = table?.getBoundingClientRect()
            const metaStyle = meta ? window.getComputedStyle(meta) : null
            const cells = [
              ...document.querySelectorAll(
                '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
              ),
            ]
            const states = cells.map((cell, index) => {
              const style = window.getComputedStyle(cell)
              return {
                index,
                text: String(cell.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                left: cell.getBoundingClientRect().left,
                borderTopWidth: parseFloat(style.borderTopWidth || '0'),
                borderRightWidth: parseFloat(style.borderRightWidth || '0'),
                borderBottomWidth: parseFloat(style.borderBottomWidth || '0'),
                borderLeftWidth: parseFloat(style.borderLeftWidth || '0'),
              }
            })
            const firstCellRect = cells[0]?.getBoundingClientRect()
            const hairCell = cells.find((cell) =>
              cell.classList.contains(
                'erp-engineering-print-meta-grid__hair-cell'
              )
            )
            const hairCellStyle = hairCell
              ? window.getComputedStyle(hairCell)
              : null
            const hairCellRect = hairCell?.getBoundingClientRect()
            const metaBorderWidths = metaStyle
              ? [
                  metaStyle.borderTopWidth,
                  metaStyle.borderRightWidth,
                  metaStyle.borderBottomWidth,
                  metaStyle.borderLeftWidth,
                ].map((value) => parseFloat(value || '0'))
              : []
            return {
              foundMeta: Boolean(meta),
              foundTable: Boolean(table),
              checkedCount: states.length,
              metaBorderWidths,
              hairGridColumnStart: hairCellStyle?.gridColumnStart || '',
              hairLeftDelta:
                firstCellRect && hairCellRect
                  ? Math.abs(hairCellRect.left - firstCellRect.left)
                  : -1,
              tableTopGap:
                metaRect && tableRect
                  ? Math.max(0, tableRect.top - metaRect.bottom)
                  : -1,
              borderedStates: states.filter(
                (state) =>
                  state.text &&
                  (state.borderTopWidth > 0 ||
                    state.borderRightWidth > 0 ||
                    state.borderBottomWidth > 0 ||
                    state.borderLeftWidth > 0)
              ),
              states,
            }
          })
          assert(
            metrics.foundMeta &&
              metrics.foundTable &&
              metrics.checkedCount === 9 &&
              metrics.metaBorderWidths.every((width) => width === 0) &&
              metrics.hairGridColumnStart === '1' &&
              metrics.hairLeftDelta <= 2 &&
              metrics.borderedStates.length === 0 &&
              metrics.tableTopGap <= 6,
            `物料分析明细表顶部信息区应按源 Excel 保持非格子打印视觉，毛向单独换行后应居左，主表格才开始画边框: ${JSON.stringify(metrics)}`
          )
        }
        const assertMaterialDetailTableWidthAndUnitWrapPolicy = async () => {
          const metrics = await page.evaluate(() => {
            const paper = document.querySelector('.erp-material-detail-paper')
            const table = document.querySelector('.erp-material-detail-table')
            const unitCell = [
              ...document.querySelectorAll(
                '.erp-material-detail-table tbody td:nth-child(6)'
              ),
            ].find((cell) =>
              String(cell.textContent || '')
                .replace(/\s+/gu, '')
                .toUpperCase()
                .includes('PCS')
            )
            const unitEditor = unitCell?.querySelector(
              '.erp-material-detail-table__editable'
            )
            const measureTextRect = (node) => {
              if (!node) return null
              const range = document.createRange()
              range.selectNodeContents(node)
              const rect = range.getBoundingClientRect()
              range.detach()
              return rect.width || rect.height ? rect : null
            }
            const paperRect = paper?.getBoundingClientRect()
            const tableRect = table?.getBoundingClientRect()
            const unitCellRect = unitCell?.getBoundingClientRect()
            const unitTextRect = measureTextRect(unitEditor)
            const paperStyle = paper ? window.getComputedStyle(paper) : null
            const unitStyle = unitEditor
              ? window.getComputedStyle(unitEditor)
              : null
            return {
              paperWidth: paperRect?.width || 0,
              tableWidth: tableRect?.width || 0,
              paddingLeft: parseFloat(paperStyle?.paddingLeft || '0'),
              paddingRight: parseFloat(paperStyle?.paddingRight || '0'),
              unitText: String(unitEditor?.textContent || '')
                .replace(/\s+/gu, ' ')
                .trim(),
              unitCellWidth: unitCellRect?.width || 0,
              unitTextWidth: unitTextRect?.width || 0,
              unitTextHeight: unitTextRect?.height || 0,
              unitLineHeight: parseFloat(unitStyle?.lineHeight || '0'),
              unitWhiteSpace: unitStyle?.whiteSpace || '',
              unitOverflowWrap: unitStyle?.overflowWrap || '',
              unitWordBreak: unitStyle?.wordBreak || '',
            }
          })
          assert(
            metrics.paperWidth > 0 &&
              metrics.tableWidth >= metrics.paperWidth - 24 &&
              metrics.paddingLeft <= 11 &&
              metrics.paddingRight <= 11 &&
              metrics.unitText === 'PCS' &&
              metrics.unitCellWidth >= metrics.unitTextWidth + 6 &&
              metrics.unitTextHeight <= metrics.unitLineHeight * 1.35 &&
              metrics.unitWhiteSpace === 'normal' &&
              metrics.unitOverflowWrap === 'anywhere' &&
              metrics.unitWordBreak === 'break-word',
            `物料分析明细表应收窄纸面左右留白，且单位列使用可换行策略，常规 PCS 仍应自然单行显示: ${JSON.stringify(metrics)}`
          )
        }
        const assertMaterialDetailPageBreakBottomBorder = async () => {
          await page.emulateMedia({ media: 'print' })
          try {
            const metrics = await page.evaluate(() => {
              const paper = document.querySelector('.erp-material-detail-paper')
              const table = document.querySelector('.erp-material-detail-table')
              const tbody = table?.querySelector('tbody')
              const sourceRow = tbody?.querySelector('tr')
              if (tbody && sourceRow) {
                while (tbody.querySelectorAll('tr').length < 72) {
                  const clone = sourceRow.cloneNode(true)
                  clone.classList.remove('erp-engineering-print-row--selected')
                  clone
                    .querySelectorAll('.erp-engineering-print-cell--selected')
                    .forEach((cell) =>
                      cell.classList.remove(
                        'erp-engineering-print-cell--selected'
                      )
                    )
                  tbody.appendChild(clone)
                }
              }

              const paperRect = paper?.getBoundingClientRect()
              const tableRect = table?.getBoundingClientRect()
              const tableStyle = table ? window.getComputedStyle(table) : null
              const rows = [...(tbody?.querySelectorAll('tr') || [])]
              const a4PageHeightPx = (297 / 25.4) * 96
              const firstPageBottom =
                paperRect && Number.isFinite(paperRect.top)
                  ? paperRect.top + a4PageHeightPx
                  : 0
              const rowStates = rows.map((row, index) => {
                const rect = row.getBoundingClientRect()
                return {
                  index,
                  top: rect.top,
                  bottom: rect.bottom,
                  height: rect.height,
                }
              })
              const pageTailRow = rowStates
                .filter((row) => row.bottom <= firstPageBottom - 1)
                .sort((left, right) => right.bottom - left.bottom)[0]
              const pageTailNode = rows[pageTailRow?.index ?? -1]
              const cells = [...(pageTailNode?.children || [])]
              const cellStates = cells.map((cell, index) => {
                const style = window.getComputedStyle(cell)
                return {
                  index,
                  text: String(cell.textContent || '')
                    .replace(/\s+/gu, ' ')
                    .trim(),
                  borderBottomWidth: parseFloat(style.borderBottomWidth || '0'),
                  borderLeftWidth: parseFloat(style.borderLeftWidth || '0'),
                  borderRightWidth: parseFloat(style.borderRightWidth || '0'),
                  borderBottomStyle: style.borderBottomStyle,
                }
              })
              return {
                foundPaper: Boolean(paper),
                foundTable: Boolean(table),
                rowCount: rows.length,
                a4PageHeightPx,
                firstPageBottom,
                tableBottom: tableRect?.bottom || 0,
                tableBorderCollapse: tableStyle?.borderCollapse || '',
                tableBorderSpacing: tableStyle?.borderSpacing || '',
                pageTailRow,
                pageTailDistance:
                  pageTailRow && firstPageBottom
                    ? firstPageBottom - pageTailRow.bottom
                    : null,
                pageTailCellCount: cellStates.length,
                pageTailMissingBottomBorders: cellStates.filter(
                  (cell) =>
                    cell.borderBottomWidth < 1 ||
                    cell.borderBottomStyle === 'none'
                ),
                pageTailMissingSideBorders: cellStates.filter(
                  (cell, index) =>
                    cell.borderRightWidth < 1 ||
                    (index === 0 && cell.borderLeftWidth < 1)
                ),
                cellStates,
              }
            })
            assert(
              metrics.foundPaper &&
                metrics.foundTable &&
                metrics.rowCount >= 72 &&
                metrics.tableBottom > metrics.firstPageBottom + 80 &&
                metrics.tableBorderCollapse === 'separate' &&
                /^0px(?: 0px)?$/u.test(metrics.tableBorderSpacing) &&
                metrics.pageTailRow &&
                metrics.pageTailCellCount > 0 &&
                metrics.pageTailDistance >= 0 &&
                metrics.pageTailDistance <= metrics.pageTailRow.height + 2 &&
                metrics.pageTailMissingBottomBorders.length === 0 &&
                metrics.pageTailMissingSideBorders.length === 0,
              `物料分析明细表跨页时上一页页尾行必须由单元格自身绘制底边线，不能依赖 collapsed table border: ${JSON.stringify(metrics)}`
            )
            const clip = await page.evaluate(() => {
              const paper = document.querySelector('.erp-material-detail-paper')
              const paperRect = paper?.getBoundingClientRect()
              const a4PageHeightPx = (297 / 25.4) * 96
              if (!paperRect) return null
              return {
                x: Math.max(0, paperRect.left),
                y: Math.max(0, paperRect.top + a4PageHeightPx - 68),
                width: Math.max(1, paperRect.width),
                height: 136,
              }
            })
            if (clip) {
              const fs = await import('node:fs/promises')
              const reviewDir = path.join(
                outputDir,
                'engineering-template-review',
                'runtime'
              )
              await fs.mkdir(reviewDir, { recursive: true })
              await page.screenshot({
                path: path.join(
                  reviewDir,
                  'material-detail-page-break-border-latest.png'
                ),
                clip,
              })
            }
          } finally {
            await page.emulateMedia({ media: 'screen' })
          }
        }
        const assertMaterialDetailFooterFieldsCompact = async () => {
          const metrics = await page.evaluate(() =>
            [
              ...document.querySelectorAll(
                '.erp-material-detail-paper__footer-field'
              ),
            ].map((field) => {
              const label = field.querySelector(
                '.erp-material-detail-paper__footer-label'
              )
              const value = field.querySelector(
                '.erp-material-detail-paper__footer-value'
              )
              const labelRect = label?.getBoundingClientRect()
              const valueRect = value?.getBoundingClientRect()
              const fieldRect = field.getBoundingClientRect()
              const fieldStyle = window.getComputedStyle(field)
              const valueStyle = value ? window.getComputedStyle(value) : null
              return {
                text: String(field.textContent || '').replace(/\s+/gu, ''),
                fieldDisplay: fieldStyle.display,
                fieldAlignItems: fieldStyle.alignItems,
                fieldHeight: fieldRect.height,
                labelRight: labelRect?.right || 0,
                valueLeft: valueRect?.left || 0,
                valueRight: valueRect?.right || 0,
                valueWidth: valueRect?.width || 0,
                valueHeight: valueRect?.height || 0,
                fieldWidth: fieldRect.width,
                labelValueGap:
                  labelRect && valueRect
                    ? valueRect.left - labelRect.right
                    : -1,
                valueDisplay: valueStyle?.display || '',
                valueAlignItems: valueStyle?.alignItems || '',
                valueAlignSelf: valueStyle?.alignSelf || '',
                valueBoxSizing: valueStyle?.boxSizing || '',
              }
            })
          )
          assert.equal(
            metrics.length,
            2,
            `物料明细底部应保留审核和制表两个字段组: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.every(
              (item) =>
                item.fieldDisplay === 'grid' &&
                item.fieldAlignItems === 'baseline' &&
                item.fieldHeight >= 24 &&
                item.labelValueGap >= 0 &&
                item.labelValueGap <= 8 &&
                item.valueRight <= item.labelRight + item.fieldWidth &&
                item.valueDisplay === 'flex' &&
                item.valueAlignItems === 'center' &&
                item.valueAlignSelf === 'baseline' &&
                item.valueBoxSizing === 'border-box' &&
                item.valueWidth >= 100 &&
                item.valueHeight >= 24
            ),
            `物料明细底部字段名和值应紧邻排列，值槽应有稳定点击高度并沿用顶部信息区焦点命中口径: ${JSON.stringify(metrics)}`
          )
        }
        const assertMaterialDetailSourceNoiseExcluded = async () => {
          const metrics = await page.evaluate(() => {
            const paper = document.querySelector('.erp-material-detail-paper')
            const paperText = String(paper?.textContent || '').replace(
              /\s+/gu,
              ''
            )
            return {
              summaryRowCount: document.querySelectorAll(
                '.erp-material-detail-paper__summary-row'
              ).length,
              hasSourceNoiseFooter: paperText.includes(
                '日期订单产品编号产品名称数量备品交期审核'
              ),
            }
          })
          assert.deepEqual(
            metrics,
            { summaryRowCount: 0, hasSourceNoiseFooter: false },
            `物料明细不应实现源 Excel 底部日期/订单/产品编号噪点行: ${JSON.stringify(metrics)}`
          )
        }
        const writeEngineeringPaperReviewScreenshot = async (
          selector,
          fileName
        ) => {
          const fs = await import('node:fs/promises')
          const reviewDir = path.join(
            outputDir,
            'engineering-template-review',
            'runtime'
          )
          await fs.mkdir(reviewDir, { recursive: true })
          const paperLocator = page.locator(selector).first()
          await paperLocator.evaluate((node) => {
            node.scrollIntoView({ block: 'center', inline: 'nearest' })
          })
          await page.waitForTimeout(100)
          const box = await paperLocator.boundingBox()
          assert(box, `${fileName} 应能获取纸面截图区域`)
          await page.evaluate(() => {
            document
              .querySelector('#engineering-template-review-screenshot-style')
              ?.remove()
            const style = document.createElement('style')
            style.id = 'engineering-template-review-screenshot-style'
            style.textContent =
              '.erp-print-shell__toolbar { display: none !important; }'
            document.head.appendChild(style)
          })
          await paperLocator.screenshot({
            path: path.join(reviewDir, fileName),
          })
          await page.evaluate(() => {
            document
              .querySelector('#engineering-template-review-screenshot-style')
              ?.remove()
          })
        }
        const assertWorkInstructionRemarkStaysInSheet = async ({
          scenarioLabel,
          paperSelector,
          screenshotName,
        }) => {
          await page.emulateMedia({ media: 'print' })
          try {
            const metrics = await page.evaluate(
              ({ paperSelector }) => {
                const paper = document.querySelector(paperSelector)
                const sheet = paper?.querySelector(
                  '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
                )
                const remarkTable = paper?.querySelector(
                  '.erp-work-instruction-paper__remark-table'
                )
                const remark = [
                  ...(sheet?.querySelectorAll(
                    'tbody > tr.erp-work-instruction-paper__text-row'
                  ) || []),
                ].find((row) => row.textContent.includes('备注：'))
                const lastRow = sheet?.querySelector('tbody > tr:last-child')
                const paperRect = paper?.getBoundingClientRect()
                const sheetRect = sheet?.getBoundingClientRect()
                const remarkRect = remark?.getBoundingClientRect()
                const paperStyle = paper ? window.getComputedStyle(paper) : null
                const a4PageHeightPx = (297 / 25.4) * 96
                return {
                  foundPaper: Boolean(paper),
                  foundSheet: Boolean(sheet),
                  foundRemark: Boolean(remark),
                  hasSeparateRemarkTable: Boolean(remarkTable),
                  remarkIsLastRow: remark === lastRow,
                  a4PageHeightPx,
                  paperHeight: paperRect?.height || 0,
                  sheetHeight: sheetRect?.height || 0,
                  remarkHeight: remarkRect?.height || 0,
                  remarkBottomDelta:
                    remarkRect && paperRect
                      ? remarkRect.bottom - paperRect.bottom
                      : null,
                  remarkInsideSheet:
                    remarkRect && sheetRect
                      ? remarkRect.top >= sheetRect.top - 1 &&
                        remarkRect.bottom <= sheetRect.bottom + 1
                      : false,
                  paperBoxSizing: paperStyle?.boxSizing || '',
                }
              },
              { paperSelector }
            )
            assert(
              metrics.foundPaper &&
                metrics.foundSheet &&
                metrics.foundRemark &&
                !metrics.hasSeparateRemarkTable &&
                metrics.remarkIsLastRow &&
                metrics.paperBoxSizing === 'border-box' &&
                metrics.remarkHeight > 0 &&
                metrics.remarkInsideSheet &&
                metrics.remarkBottomDelta <= 1 &&
                metrics.paperHeight < metrics.a4PageHeightPx &&
                metrics.sheetHeight < metrics.paperHeight,
              `${scenarioLabel} 打印态备注应作为主表最后一行留在第一页纸面内，不能渲染成独立备注表: ${JSON.stringify(metrics)}`
            )
            await writeEngineeringPaperReviewScreenshot(
              paperSelector,
              screenshotName
            )
          } finally {
            await page.emulateMedia({ media: 'screen' })
          }
        }
        const assertMaterialDetailFooterTracksTableInPrint = async () => {
          await page.emulateMedia({ media: 'print' })
          try {
            const metrics = await page.evaluate(() => {
              const paper = document.querySelector('.erp-material-detail-paper')
              const table = document.querySelector('.erp-material-detail-table')
              const footer = document.querySelector(
                '.erp-material-detail-paper__footer'
              )
              const paperRect = paper?.getBoundingClientRect()
              const tableRect = table?.getBoundingClientRect()
              const footerRect = footer?.getBoundingClientRect()
              const paperStyle = paper ? window.getComputedStyle(paper) : null
              const a4PageHeightPx = (297 / 25.4) * 96
              return {
                foundPaper: Boolean(paper),
                foundTable: Boolean(table),
                foundFooter: Boolean(footer),
                a4PageHeightPx,
                paperHeight: paperRect?.height || 0,
                tableHeight: tableRect?.height || 0,
                footerHeight: footerRect?.height || 0,
                footerTopGap:
                  footerRect && tableRect
                    ? footerRect.top - tableRect.bottom
                    : null,
                footerBottomGap:
                  footerRect && paperRect
                    ? paperRect.bottom - footerRect.bottom
                    : null,
                paperBoxSizing: paperStyle?.boxSizing || '',
              }
            })
            assert(
              metrics.foundPaper &&
                metrics.foundTable &&
                metrics.foundFooter &&
                metrics.paperBoxSizing === 'border-box' &&
                metrics.tableHeight > 0 &&
                metrics.footerHeight > 0 &&
                metrics.footerTopGap >= -1 &&
                metrics.footerTopGap <= 12 &&
                metrics.footerBottomGap >= 0 &&
                metrics.footerBottomGap <= 80 &&
                metrics.paperHeight < metrics.a4PageHeightPx,
              `物料分析明细表审核/制表应按源表贴近明细表下方，打印态纸面高度不能触发空白第二页: ${JSON.stringify(metrics)}`
            )
            await writeEngineeringPaperReviewScreenshot(
              '.erp-material-detail-paper',
              'material-detail-print-footer-near-table.png'
            )
          } finally {
            await page.emulateMedia({ media: 'screen' })
          }
        }
        const assertEngineeringRichTextRedToggle = async (
          editorSelector,
          blurSelector,
          scenarioLabel
        ) => {
          const selectEditorText = async () => {
            await page.evaluate((selector) => {
              const editor = document.querySelector(selector)
              if (!editor) return
              editor.focus()
              const range = document.createRange()
              range.selectNodeContents(editor)
              const selection = window.getSelection()
              selection?.removeAllRanges()
              selection?.addRange(range)
            }, editorSelector)
          }
          const readRichTextState = async () =>
            page.evaluate((selector) => {
              const editor = document.querySelector(selector)
              const redNode =
                editor?.querySelector('[style*="red"]') ||
                editor?.querySelector('[style*="255, 0, 0"]')
              return {
                html: editor?.innerHTML || '',
                color: redNode ? window.getComputedStyle(redNode).color : '',
              }
            }, editorSelector)

          await selectEditorText()
          await page.getByRole('button', { name: '文字标红/取消' }).click()
          await page.locator(blurSelector).first().click()
          let richTextState = await readRichTextState()
          assert(
            richTextState.color === 'rgb(255, 0, 0)',
            `${scenarioLabel} 选中文字标红后应保存红色: ${JSON.stringify(richTextState)}`
          )

          await selectEditorText()
          await page.getByRole('button', { name: '文字标红/取消' }).click()
          await page.locator(blurSelector).first().click()
          richTextState = await readRichTextState()
          assert(
            richTextState.color === '',
            `${scenarioLabel} 已标红文字再次点击应取消红色: ${JSON.stringify(richTextState)}`
          )
        }
        const assertRichEditableNbspArtifactGuard = async (
          rootSelector,
          scenarioLabel
        ) => {
          const prepareState = await page.evaluate((selector) => {
            const root = document.querySelector(selector)
            const editor = [
              ...(root?.querySelectorAll(
                '.erp-engineering-print-editable[contenteditable="true"]'
              ) || []),
            ].find(
              (node) =>
                String(node.textContent || '')
                  .replace(/\u00a0/g, ' ')
                  .trim() === ''
            )
            if (!editor) return { found: false }
            editor.setAttribute('data-nbsp-artifact-probe', 'true')
            editor.focus()
            return {
              found: true,
              text: String(editor.textContent || ''),
              html: String(editor.innerHTML || ''),
            }
          }, rootSelector)
          assert(
            prepareState.found,
            `${scenarioLabel} 应存在一个空白富文本单元格用于验证转义占位: ${JSON.stringify(prepareState)}`
          )
          await page.locator('[data-nbsp-artifact-probe]').click()
          await page
            .locator(
              `${rootSelector} .erp-engineering-print-editable[contenteditable="true"]:not([data-nbsp-artifact-probe])`
            )
            .first()
            .click()

          let artifactState = await page.evaluate((selector) => {
            const root = document.querySelector(selector)
            const editor = root?.querySelector('[data-nbsp-artifact-probe]')
            const text = String(root?.textContent || '').replace(/\u00a0/g, ' ')
            return {
              rootTextHasArtifact: /(?:amp;)?nbsp/i.test(text),
              probeText: String(editor?.textContent || '')
                .replace(/\u00a0/g, ' ')
                .trim(),
              probeHtml: String(editor?.innerHTML || ''),
            }
          }, rootSelector)
          assert(
            !artifactState.rootTextHasArtifact &&
              artifactState.probeText === '' &&
              !/(?:&amp;|amp;)+nbsp/i.test(artifactState.probeHtml),
            `${scenarioLabel} 空白富文本进入后离开不应显示或保存 nbsp 转义: ${JSON.stringify(artifactState)}`
          )

          await page.locator('[data-nbsp-artifact-probe]').click()
          await page.keyboard.press(
            process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
          )
          await page.keyboard.type('&amp;nbsp;')
          await page
            .locator(
              `${rootSelector} .erp-engineering-print-editable[contenteditable="true"]:not([data-nbsp-artifact-probe])`
            )
            .first()
            .click()
          await page.waitForTimeout(50)

          artifactState = await page.evaluate((selector) => {
            const root = document.querySelector(selector)
            const text = String(root?.textContent || '').replace(/\u00a0/g, ' ')
            return {
              rootText: text.replace(/\s+/gu, ' ').trim(),
              rootTextHasArtifact: /(?:amp;)?nbsp/i.test(text),
              rootHtmlHasEscapedArtifact: /(?:&amp;|amp;)+nbsp/i.test(
                String(root?.innerHTML || '')
              ),
            }
          }, rootSelector)
          assert(
            !artifactState.rootTextHasArtifact &&
              !artifactState.rootHtmlHasEscapedArtifact,
            `${scenarioLabel} 历史坏值 &amp;nbsp; 失焦后应被清成空白: ${JSON.stringify(artifactState)}`
          )
        }

        await page.locator('.erp-material-detail-paper').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-material-detail-paper',
          scenarioLabel: '物料分析明细表',
          screenshotName: 'print-workspace-material-detail-paper-top-rhythm',
        })
        await assertEngineeringPaperScreenPrintBox(
          '.erp-material-detail-paper',
          '物料分析明细表'
        )
        await assertEngineeringEditorRounded('物料分析明细表')
        await assertFullCellEditableCoverage(
          '物料分析明细表',
          '.erp-material-detail-table tbody tr:first-child td:nth-child(2)',
          '.erp-material-detail-table__editable'
        )
        await assertMaterialDetailMetaGridFieldValueTextAlignment()
        await assertMaterialDetailMetaValueEditableCoverage()
        await assertMaterialDetailMetaSourceHeaderVisual()
        await page
          .locator(
            '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
          )
          .nth(5)
          .locator('.erp-engineering-print-editable')
          .click()
        await writeEngineeringPaperReviewScreenshot(
          '.erp-material-detail-paper',
          'material-detail-meta-focus-latest.png'
        )
        await page
          .locator(
            '.erp-material-detail-paper .erp-engineering-print-meta-grid > .erp-engineering-print-meta-grid__hair-cell'
          )
          .locator('.erp-engineering-print-editable')
          .click()
        await writeEngineeringPaperReviewScreenshot(
          '.erp-material-detail-paper',
          'material-detail-hair-direction-focus-latest.png'
        )
        await assertMaterialDetailTableVerticalCentering()
        await assertMaterialDetailTableWidthAndUnitWrapPolicy()
        await assertMaterialDetailLineCellsWrapLongValues(page)
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-material-detail-table tbody tr:first-child td:nth-child(2) .erp-material-detail-table__editable',
          scenarioLabel: '物料分析明细表',
        })
        await assertPrintEditableFocusSurvivesSwitch(page, {
          firstSelector:
            '.erp-material-detail-table tbody tr:first-child td:nth-child(2) .erp-material-detail-table__editable',
          secondSelector:
            '.erp-material-detail-table tbody tr:first-child td:nth-child(3) .erp-material-detail-table__editable',
          scenarioLabel: '物料分析明细表',
        })
        await assertMaterialDetailFooterFieldsCompact()
        await assertPrintEditableFocusBorderStyle(page, {
          selector: '.erp-material-detail-paper__footer-value',
          scenarioLabel: '物料分析明细表审核/制表',
        })
        await writeEngineeringPaperReviewScreenshot(
          '.erp-material-detail-paper',
          'material-detail-footer-focus-latest.png'
        )
        await assertMaterialDetailSourceNoiseExcluded()
        await writeEngineeringPaperReviewScreenshot(
          '.erp-material-detail-paper',
          'material-detail-runtime-latest.png'
        )
        await assertEngineeringServerPdfSnapshotPageBox({
          paperSelector: '.erp-material-detail-paper',
          contentSelector: '.erp-material-detail-table',
          scenarioLabel: '物料分析明细表',
          screenshotName: 'material-detail-server-pdf-page-box',
        })
        await assertMaterialDetailFooterTracksTableInPrint()
        await assertEngineeringRichTextRedToggle(
          '.erp-material-detail-table tbody tr:first-child td:nth-child(2) .erp-material-detail-table__editable',
          '.erp-material-detail-paper__title',
          '物料分析明细表'
        )
        await assertRichEditableNbspArtifactGuard(
          '.erp-material-detail-paper',
          '物料分析明细表'
        )
        const materialImageState = await page.evaluate(() => {
          const headerUploadBar = document.querySelector(
            '.erp-processing-contract-upload-bar'
          )
          const appendixManager = document.querySelector(
            '[data-print-appendix-manager]'
          )
          return {
            headerUploadBarInPanel: Boolean(
              headerUploadBar?.closest('.erp-print-shell__record-panel')
            ),
            headerUploadBarInStage: Boolean(
              headerUploadBar?.closest('.erp-print-shell__stage')
            ),
            headerUploadItemCount:
              headerUploadBar?.querySelectorAll(
                '.erp-processing-contract-upload-bar__item'
              ).length || 0,
            topSlotCount: document.querySelectorAll(
              '.erp-material-detail-paper__images .erp-engineering-print-image-slot'
            ).length,
            appendixManagerInPanel: Boolean(
              appendixManager?.closest('.erp-print-shell__record-panel')
            ),
            appendixManagerInStage: Boolean(
              appendixManager?.closest('.erp-print-shell__stage')
            ),
            appendixSectionCount: document.querySelectorAll(
              '.erp-material-detail-paper [data-print-appendix-images]'
            ).length,
            legacyBottomSectionCount: document.querySelectorAll(
              '.erp-material-detail-paper__bottom-images'
            ).length,
            paperImageActionCount: document.querySelectorAll(
              '.erp-material-detail-paper .erp-engineering-print-image-slot__actions'
            ).length,
          }
        })
        assert.deepEqual(
          materialImageState,
          {
            headerUploadBarInPanel: true,
            headerUploadBarInStage: false,
            headerUploadItemCount: 2,
            topSlotCount: 2,
            appendixManagerInPanel: true,
            appendixManagerInStage: false,
            appendixSectionCount: 0,
            legacyBottomSectionCount: 0,
            paperImageActionCount: 0,
          },
          `物料明细应保留两个表头图片区，并用独立共享管理区接管末尾附图: ${JSON.stringify(materialImageState)}`
        )
        let toolbarGroups = await collectToolbarGroups()
        assertButtonTexts(
          toolbarGroups[0],
          [
            '上插一行',
            '下插一行',
            '移除当前行',
            '选择明细行',
            '选择单元格',
            '合并选区',
            '拆分当前',
          ],
          '物料分析明细表'
        )
        assert.equal(
          toolbarGroups[0].buttons[0].disabled,
          true,
          '物料明细未选择明细行前，上插一行应禁用'
        )
        await assertNoLegacyEngineeringRowButtonText('物料分析明细表')
        await page.getByRole('button', { name: '选择明细行' }).click()
        await page
          .locator('.erp-material-detail-table tbody tr')
          .nth(1)
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        toolbarGroups = await collectToolbarGroups()
        assert.equal(
          toolbarGroups[0].buttons[0].disabled,
          false,
          '物料明细进入选择明细行模式并选中行后，上插一行应可用'
        )
        const materialRowsBefore = await page
          .locator('.erp-material-detail-table tbody tr')
          .count()
        await page
          .locator('.erp-print-shell__toolbar-group')
          .first()
          .getByRole('button', { name: '下插一行' })
          .click()
        assert.equal(
          await page.locator('.erp-material-detail-table tbody tr').count(),
          materialRowsBefore + 1,
          '物料明细下插一行应新增一行'
        )
        await page.getByRole('button', { name: '移除当前行' }).click()
        assert.equal(
          await page.locator('.erp-material-detail-table tbody tr').count(),
          materialRowsBefore,
          '物料明细移除当前行后行数应恢复'
        )
        await page.getByRole('button', { name: '取消选择' }).click()
        await assertMaterialDetailPageBreakBottomBorder()

        await gotoScenarioPath(
          page,
          '/erp/print-workspace/engineering-color-card?draft=fresh',
          { waitUntil: 'domcontentloaded' }
        )
        await page.locator('.erp-color-card-paper').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-color-card-paper',
          scenarioLabel: '色卡',
          screenshotName: 'print-workspace-color-card-paper-top-rhythm',
        })
        await assertEngineeringPaperScreenPrintBox(
          '.erp-color-card-paper',
          '色卡'
        )
        await assertEngineeringEditorRounded('色卡')
        await assertFullCellEditableCoverage(
          '色卡',
          '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell',
          '.erp-engineering-print-editable'
        )
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell .erp-engineering-print-editable',
          scenarioLabel: '色卡',
        })
        await assertPrintEditableFocusSurvivesSwitch(page, {
          firstSelector:
            '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__position-cell .erp-engineering-print-editable',
          secondSelector:
            '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell .erp-engineering-print-editable',
          scenarioLabel: '色卡',
        })
        const colorCardMetaOriginalHTML = await page.evaluate(() => {
          const editors = [
            ...document.querySelectorAll(
              '.erp-color-card-paper__meta > .erp-engineering-print-editable'
            ),
          ]
          const samples = [
            '26204#-PRODUCT-NO-LONG-CONTINUOUS-WRAP-CHECK-20260708-ABCDEFGHIJKLMN',
            '抱抱猴子-黑色-产品名称超长连续值不应覆盖相邻区域-ColorCardProductNameLongWrapCheck20260708',
          ]
          return editors.map((editor, index) => {
            const html = editor.innerHTML
            editor.textContent = samples[index] || editor.textContent
            return html
          })
        })
        const colorCardMetaMetrics = await page.evaluate(() => {
          const meta = document.querySelector('.erp-color-card-paper__meta')
          const metaStyle = meta ? window.getComputedStyle(meta) : null
          const children = [...(meta?.children || [])]
          const states = children
            .map((child, index) => ({ child, index }))
            .filter(({ child }) =>
              child.classList.contains('erp-engineering-print-editable')
            )
            .map(({ child, index }) => {
              const previousLabel = children[index - 1]
              const nextLabel = children[index + 1]
              const rect = child.getBoundingClientRect()
              const style = window.getComputedStyle(child)
              const previousLabelRect = previousLabel?.getBoundingClientRect()
              const nextLabelRect = nextLabel?.getBoundingClientRect()
              const metaRect = meta?.getBoundingClientRect()
              const range = document.createRange()
              range.selectNodeContents(child)
              const lineBoxCount = [...range.getClientRects()].filter(
                (lineRect) => lineRect.width > 0 && lineRect.height > 0
              ).length
              range.detach()
              const lineHeight = Number.parseFloat(style.lineHeight || '0')
              return {
                index,
                text: String(child.textContent || '')
                  .replace(/\s+/gu, ' ')
                  .trim(),
                hasNextLabel: Boolean(nextLabelRect),
                editorWidth: rect.width,
                editorHeight: rect.height,
                labelEditorGap:
                  previousLabelRect && rect
                    ? rect.left - previousLabelRect.right
                    : -1,
                rightGap:
                  nextLabelRect && rect
                    ? nextLabelRect.left - rect.right
                    : metaRect && rect
                      ? metaRect.right - rect.right
                      : -1,
                display: style.display,
                alignItems: style.alignItems,
                alignSelf: style.alignSelf,
                boxSizing: style.boxSizing,
                whiteSpace: style.whiteSpace,
                overflowWrap: style.overflowWrap,
                wordBreak: style.wordBreak,
                lineHeight,
                lineBoxCount,
                editorClientWidth: child.clientWidth,
                editorScrollWidth: child.scrollWidth,
                editorClientHeight: child.clientHeight,
                editorScrollHeight: child.scrollHeight,
              }
            })
          return {
            checkedCount: states.length,
            metaAlignItems: metaStyle?.alignItems || '',
            metaText: String(meta?.textContent || '').replace(/\s+/gu, ' '),
            nonFillingValueSlots: states.filter(
              (state) =>
                state.editorWidth < 90 ||
                state.editorHeight <= 0 ||
                state.labelEditorGap < 0 ||
                (state.hasNextLabel
                  ? state.rightGap < 4 || state.rightGap > 12
                  : state.rightGap > 2) ||
                state.display !== 'flex' ||
                state.alignItems !== 'center' ||
                state.alignSelf !== 'baseline' ||
                state.boxSizing !== 'border-box' ||
                state.whiteSpace !== 'normal' ||
                state.overflowWrap !== 'anywhere' ||
                state.editorScrollWidth > state.editorClientWidth + 1 ||
                state.lineBoxCount < 2
            ),
            states,
          }
        })
        assert(
          colorCardMetaMetrics.checkedCount === 2 &&
            colorCardMetaMetrics.metaAlignItems === 'baseline' &&
            colorCardMetaMetrics.metaText.includes('产品编号') &&
            colorCardMetaMetrics.metaText.includes('产品名称') &&
            colorCardMetaMetrics.nonFillingValueSlots.length === 0,
          `色卡顶部产品编号/产品名称值槽应铺满标签右侧区域并允许长值换行: ${JSON.stringify(colorCardMetaMetrics)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-meta-long-value-wrap-latest.png'
        )
        await page.evaluate((originalHTML) => {
          const editors = [
            ...document.querySelectorAll(
              '.erp-color-card-paper__meta > .erp-engineering-print-editable'
            ),
          ]
          editors.forEach((editor, index) => {
            if (typeof originalHTML[index] === 'string') {
              editor.innerHTML = originalHTML[index]
            }
          })
        }, colorCardMetaOriginalHTML)
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-color-card-paper__meta > .erp-engineering-print-editable:nth-child(4)',
          scenarioLabel: '色卡顶部产品名称',
        })
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-meta-focus-latest.png'
        )
        const colorCardFooterMetrics = await page.evaluate(() => {
          const footer = document.querySelector('.erp-color-card-paper__footer')
          const items = [...(footer?.children || [])]
          const states = items.map((item, index) => {
            const editor = item.querySelector('.erp-engineering-print-editable')
            const itemRect = item.getBoundingClientRect()
            const itemStyle = window.getComputedStyle(item)
            const editorRect = editor?.getBoundingClientRect()
            const editorStyle = editor ? window.getComputedStyle(editor) : null
            return {
              index,
              text: String(item.textContent || '')
                .replace(/\s+/gu, ' ')
                .trim(),
              itemWidth: itemRect.width,
              itemHeight: itemRect.height,
              itemAlignItems: itemStyle.alignItems,
              editorWidth: editorRect?.width || 0,
              editorHeight: editorRect?.height || 0,
              rightGap: editorRect ? itemRect.right - editorRect.right : -1,
              heightDelta: editorRect
                ? Math.abs(itemRect.height - editorRect.height)
                : -1,
              editorDisplay: editorStyle?.display || '',
              editorAlignItems: editorStyle?.alignItems || '',
              editorAlignSelf: editorStyle?.alignSelf || '',
              editorBoxSizing: editorStyle?.boxSizing || '',
            }
          })
          return {
            checkedCount: states.length,
            footerText: String(footer?.textContent || '').replace(/\s+/gu, ' '),
            compactFooterText: String(footer?.textContent || '').replace(
              /\s+/gu,
              ''
            ),
            nonFillingValueSlots: states.filter(
              (state) =>
                state.editorWidth <= 0 ||
                state.editorHeight <= 0 ||
                state.rightGap > 2 ||
                state.heightDelta > 2 ||
                state.itemAlignItems !== 'baseline' ||
                state.editorDisplay !== 'flex' ||
                state.editorAlignItems !== 'center' ||
                state.editorAlignSelf !== 'baseline' ||
                state.editorBoxSizing !== 'border-box'
            ),
            states,
          }
        })
        assert(
          colorCardFooterMetrics.checkedCount === 4 &&
            colorCardFooterMetrics.compactFooterText.includes('审核：审核人') &&
            colorCardFooterMetrics.compactFooterText.includes('复核：复核人') &&
            colorCardFooterMetrics.nonFillingValueSlots.length === 0,
          `色卡页脚非表格字段应有默认审核/复核值，且编辑层铺满标签右侧值槽: ${JSON.stringify(colorCardFooterMetrics)}`
        )
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-color-card-paper__footer > span:nth-child(4) .erp-engineering-print-editable',
          scenarioLabel: '色卡页脚复核',
        })
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-footer-focus-latest.png'
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-runtime-latest.png'
        )
        await assertEngineeringServerPdfSnapshotPageBox({
          paperSelector: '.erp-color-card-paper',
          contentSelector: '.erp-color-card-paper__sheet',
          scenarioLabel: '色卡',
          screenshotName: 'color-card-server-pdf-page-box',
        })
        await page.emulateMedia({ media: 'print' })
        try {
          const colorCardPrintFooterMetrics = await page.evaluate(() => {
            const paper = document.querySelector('.erp-color-card-paper')
            const sheet = document.querySelector('.erp-color-card-paper__sheet')
            const footer = document.querySelector(
              '.erp-color-card-paper__footer'
            )
            const gutter = document.querySelector(
              '.erp-color-card-paper__gutter'
            )
            const sides = [
              ...document.querySelectorAll('.erp-color-card-paper__side'),
            ]
            const paperRect = paper?.getBoundingClientRect()
            const sheetRect = sheet?.getBoundingClientRect()
            const footerRect = footer?.getBoundingClientRect()
            const gutterRect = gutter?.getBoundingClientRect()
            const sideHeights = sides.map(
              (side) => side.getBoundingClientRect().height
            )
            const a4PageHeightPx = (297 / 25.4) * 96
            return {
              a4PageHeightPx,
              paperHeight: paperRect?.height || 0,
              sheetHeight: sheetRect?.height || 0,
              footerHeight: footerRect?.height || 0,
              footerTopGap:
                footerRect && sheetRect
                  ? footerRect.top - sheetRect.bottom
                  : null,
              footerBottomGap:
                footerRect && paperRect
                  ? paperRect.bottom - footerRect.bottom
                  : null,
              gutterHeight: gutterRect?.height || 0,
              maxSideHeight: Math.max(0, ...sideHeights),
            }
          })
          assert(
            colorCardPrintFooterMetrics.footerTopGap >= 8 &&
              colorCardPrintFooterMetrics.footerTopGap <= 16 &&
              colorCardPrintFooterMetrics.footerBottomGap >= 0 &&
              colorCardPrintFooterMetrics.footerBottomGap <= 80 &&
              colorCardPrintFooterMetrics.paperHeight <
                colorCardPrintFooterMetrics.a4PageHeightPx &&
              colorCardPrintFooterMetrics.gutterHeight <=
                colorCardPrintFooterMetrics.maxSideHeight + 1 &&
              colorCardPrintFooterMetrics.sheetHeight <
                colorCardPrintFooterMetrics.paperHeight,
            `色卡打印态制卡/日期/审核/复核应贴近色卡表格下方，打印态纸面高度不能触发空白第二页: ${JSON.stringify(colorCardPrintFooterMetrics)}`
          )
          await writeEngineeringPaperReviewScreenshot(
            '.erp-color-card-paper',
            'color-card-print-footer-near-table.png'
          )
        } finally {
          await page.emulateMedia({ media: 'screen' })
        }
        await assertEngineeringRichTextRedToggle(
          '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell .erp-engineering-print-editable',
          '.erp-color-card-paper__company',
          '色卡'
        )
        await assertRichEditableNbspArtifactGuard(
          '.erp-color-card-paper',
          '色卡'
        )
        toolbarGroups = await collectToolbarGroups()
        assertButtonTexts(
          toolbarGroups[0],
          ['上插色卡块', '下插色卡块', '移除当前块', '选择色卡块'],
          '色卡块'
        )
        assertButtonTexts(
          toolbarGroups[1],
          ['上插一行', '下插一行', '移除当前行', '选择色卡行'],
          '色卡行'
        )
        assert.equal(
          toolbarGroups[0].buttons[0].disabled,
          true,
          '色卡未选择色卡块前，上插色卡块应禁用'
        )
        assert.equal(
          toolbarGroups[1].buttons[0].disabled,
          true,
          '色卡未选择色卡行前，上插一行应禁用'
        )
        assert.equal(
          await page.locator('.erp-color-card-paper__side').count(),
          2,
          '色卡应按 Excel 原表渲染左右两张连续表格'
        )
        assert.equal(
          await page.locator('.erp-color-card-paper__gutter').count(),
          1,
          '色卡左右表之间应保留 Excel 原表窄隔栏'
        )
        assert.ok(
          (await page
            .locator('.erp-color-card-paper__swatch-cell[rowspan]')
            .count()) > 0,
          '色卡物料图片区应通过 rowSpan 合并多行'
        )
        await assertNoLegacyEngineeringRowButtonText('色卡')
        await page.getByRole('button', { name: '选择色卡行' }).click()
        await page
          .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
          .first()
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        const persistedLineSelectionState = await page.evaluate(() => ({
          selectedRows: document.querySelectorAll(
            '.erp-color-card-paper__line-row.erp-engineering-print-row--selected'
          ).length,
          blockSelectedRows: document.querySelectorAll(
            '.erp-color-card-paper__block-row--selected'
          ).length,
          swatchBoxShadow:
            window.getComputedStyle(
              document.querySelector(
                '.erp-color-card-paper__line-row.erp-engineering-print-row--selected .erp-color-card-paper__swatch-cell'
              )
            ).boxShadow || '',
          swatchBackground:
            window.getComputedStyle(
              document.querySelector(
                '.erp-color-card-paper__line-row.erp-engineering-print-row--selected .erp-color-card-paper__swatch-cell'
              )
            ).backgroundColor || '',
          positionBackground:
            window.getComputedStyle(
              document.querySelector(
                '.erp-color-card-paper__line-row.erp-engineering-print-row--selected .erp-color-card-paper__position-cell'
              )
            ).backgroundColor || '',
        }))
        assert(
          persistedLineSelectionState.selectedRows === 1 &&
            persistedLineSelectionState.blockSelectedRows === 0 &&
            persistedLineSelectionState.swatchBoxShadow === 'none' &&
            persistedLineSelectionState.swatchBackground !==
              persistedLineSelectionState.positionBackground,
          `色卡选择具体行时应只高亮部位/做法行，不能继续高亮整块或跨行图片区: ${JSON.stringify(persistedLineSelectionState)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-line-selection-persisted.png'
        )
        const colorLineRowsBefore = await page
          .locator('.erp-color-card-paper__side')
          .first()
          .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
          .count()
        await page.getByRole('button', { name: '下插一行' }).click()
        assert.equal(
          await page
            .locator('.erp-color-card-paper__side')
            .first()
            .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
            .count(),
          colorLineRowsBefore + 1,
          '色卡行下插一行应新增块内行'
        )
        const downInsertPositionState = await page.evaluate(() => {
          const firstBlockRows = [
            ...(document
              .querySelector('.erp-color-card-paper__side')
              ?.querySelectorAll(
                '.erp-color-card-paper__line-row[data-color-line="true"]'
              ) || []),
          ].slice(0, 4)
          return {
            selectedIndex: firstBlockRows.findIndex((row) =>
              row.classList.contains('erp-engineering-print-row--selected')
            ),
            rowTexts: firstBlockRows.map((row) =>
              String(row.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
            ),
          }
        })
        assert(
          downInsertPositionState.selectedIndex === 1 &&
            downInsertPositionState.rowTexts[1] === '',
          `色卡下插一行应插在当前选中行正下方并选中新空白行: ${JSON.stringify(downInsertPositionState)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-line-insert-after-selected-row.png'
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '移除当前行' })
          .click()
        assert.equal(
          await page
            .locator('.erp-color-card-paper__side')
            .first()
            .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
            .count(),
          colorLineRowsBefore,
          '色卡行移除当前行后行数应恢复'
        )
        await page
          .locator('.erp-color-card-paper__side')
          .first()
          .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
          .nth(1)
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '上插一行' })
          .click()
        const upInsertPositionState = await page.evaluate(() => {
          const firstBlockRows = [
            ...(document
              .querySelector('.erp-color-card-paper__side')
              ?.querySelectorAll(
                '.erp-color-card-paper__line-row[data-color-line="true"]'
              ) || []),
          ].slice(0, 4)
          return {
            selectedIndex: firstBlockRows.findIndex((row) =>
              row.classList.contains('erp-engineering-print-row--selected')
            ),
            rowTexts: firstBlockRows.map((row) =>
              String(row.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
            ),
          }
        })
        assert(
          upInsertPositionState.selectedIndex === 1 &&
            upInsertPositionState.rowTexts[1] === '' &&
            /后头\*2热裁-1/u.test(upInsertPositionState.rowTexts[2] || ''),
          `色卡上插一行应插在当前选中行正上方并选中新空白行: ${JSON.stringify(upInsertPositionState)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-line-insert-before-selected-row.png'
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '移除当前行' })
          .click()
        assert.equal(
          await page
            .locator('.erp-color-card-paper__side')
            .first()
            .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
            .count(),
          colorLineRowsBefore,
          '色卡行上插新增行移除后行数应恢复'
        )
        const firstColorBlockPlaceholderRows = page.locator(
          '.erp-color-card-paper__line-row[data-color-card-block-index="0"][data-color-line-placeholder="true"]'
        )
        assert(
          (await firstColorBlockPlaceholderRows.count()) > 0,
          '色卡应保留可选择的空白占位行，方便从纸面继续上插 / 下插'
        )
        const readFirstColorBlockLineState = async () =>
          page.evaluate(() => {
            const rows = [
              ...document.querySelectorAll(
                '.erp-color-card-paper__line-row[data-color-card-block-index="0"]'
              ),
            ]
            const selectedIndex = rows.findIndex((row) =>
              row.classList.contains('erp-engineering-print-row--selected')
            )
            const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : null
            return {
              visibleRows: rows.length,
              selectedIndex,
              selectedRows: rows.filter((row) =>
                row.classList.contains('erp-engineering-print-row--selected')
              ).length,
              blockSelectedRows: document.querySelectorAll(
                '.erp-color-card-paper__block-row--selected'
              ).length,
              selectedPersisted:
                selectedRow?.getAttribute('data-color-line') === 'true',
              selectedPlaceholder:
                selectedRow?.getAttribute('data-color-line-placeholder') ===
                'true',
              rowTexts: rows.map((row) =>
                String(row.textContent || '')
                  .replace(/\s+/gu, '')
                  .trim()
              ),
            }
          })
        await firstColorBlockPlaceholderRows
          .first()
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        toolbarGroups = await collectToolbarGroups()
        assert.equal(
          toolbarGroups[1].buttons[0].disabled,
          false,
          '色卡选择空白占位行后，上插一行应可用'
        )
        assert.equal(
          toolbarGroups[1].buttons[1].disabled,
          false,
          '色卡选择空白占位行后，下插一行应可用'
        )
        assert.equal(
          toolbarGroups[1].buttons[2].disabled,
          true,
          '色卡空白占位行不是已存在明细行，不应直接移除'
        )
        const placeholderSelectionState = await readFirstColorBlockLineState()
        assert(
          placeholderSelectionState.selectedRows === 1 &&
            placeholderSelectionState.blockSelectedRows === 0 &&
            placeholderSelectionState.selectedPlaceholder,
          `色卡空白占位行应被准确高亮为当前行: ${JSON.stringify(placeholderSelectionState)}`
        )
        const placeholderUpSourceIndex = placeholderSelectionState.selectedIndex
        const visibleRowsBeforePlaceholderUp =
          placeholderSelectionState.visibleRows
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-line-selection-placeholder.png'
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '上插一行' })
          .click()
        const placeholderUpInsertState = await readFirstColorBlockLineState()
        assert(
          placeholderUpInsertState.visibleRows ===
            visibleRowsBeforePlaceholderUp + 1 &&
            placeholderUpInsertState.selectedRows === 1 &&
            placeholderUpInsertState.blockSelectedRows === 0 &&
            placeholderUpInsertState.selectedPersisted &&
            placeholderUpInsertState.selectedIndex ===
              placeholderUpSourceIndex &&
            placeholderUpInsertState.rowTexts[placeholderUpSourceIndex] === '',
          `色卡空白占位行上插后应新增可见空白行并选中新行: ${JSON.stringify(placeholderUpInsertState)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-placeholder-insert-before.png'
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '移除当前行' })
          .click()
        assert.equal(
          (await readFirstColorBlockLineState()).visibleRows,
          visibleRowsBeforePlaceholderUp,
          '色卡空白占位行上插新增行移除后可见行数应恢复'
        )
        await page
          .locator(
            '.erp-color-card-paper__line-row[data-color-card-block-index="0"][data-color-line-placeholder="true"]'
          )
          .first()
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        const placeholderDownSelectionState =
          await readFirstColorBlockLineState()
        assert(
          placeholderDownSelectionState.selectedRows === 1 &&
            placeholderDownSelectionState.selectedPlaceholder,
          `色卡空白占位行下插前应先选中一个空白占位行: ${JSON.stringify(placeholderDownSelectionState)}`
        )
        const placeholderDownSourceIndex =
          placeholderDownSelectionState.selectedIndex
        const visibleRowsBeforePlaceholderDown =
          placeholderDownSelectionState.visibleRows
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '下插一行' })
          .click()
        const placeholderDownInsertState = await readFirstColorBlockLineState()
        assert(
          placeholderDownInsertState.visibleRows ===
            visibleRowsBeforePlaceholderDown + 1 &&
            placeholderDownInsertState.selectedRows === 1 &&
            placeholderDownInsertState.blockSelectedRows === 0 &&
            placeholderDownInsertState.selectedPersisted &&
            placeholderDownInsertState.selectedIndex ===
              placeholderDownSourceIndex + 1 &&
            placeholderDownInsertState.rowTexts[placeholderDownSourceIndex] ===
              '' &&
            placeholderDownInsertState.rowTexts[
              placeholderDownSourceIndex + 1
            ] === '',
          `色卡空白占位行下插后应保留原空白行、在其下新增可见空白行并选中新行: ${JSON.stringify(placeholderDownInsertState)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-placeholder-insert-after.png'
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '移除当前行' })
          .click()
        assert.equal(
          (await readFirstColorBlockLineState()).visibleRows,
          visibleRowsBeforePlaceholderDown,
          '色卡空白占位行下插新增行移除后可见行数应恢复'
        )
        const targetVisibleColorRows = 13
        for (let attempt = 0; attempt < targetVisibleColorRows; attempt += 1) {
          const currentColorLineState = await readFirstColorBlockLineState()
          if (currentColorLineState.visibleRows >= targetVisibleColorRows) {
            break
          }
          await page
            .locator(
              '.erp-color-card-paper__line-row[data-color-card-block-index="0"]'
            )
            .last()
            .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
          await page
            .locator('.erp-print-shell__toolbar-group')
            .nth(1)
            .getByRole('button', { name: '下插一行' })
            .click()
        }
        const overTwelveColorLineState = await readFirstColorBlockLineState()
        assert(
          overTwelveColorLineState.visibleRows >= targetVisibleColorRows,
          `色卡行数应允许超过 12 行，不应被源表样例长度锁死: ${JSON.stringify(overTwelveColorLineState)}`
        )
        assert.equal(
          await page.getByText('每个色卡块最多支持 12 行。').count(),
          0,
          '色卡超过 12 行时不应再出现旧的 12 行限制提示'
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-color-card-paper',
          'color-card-more-than-12-lines.png'
        )
        await page.getByRole('button', { name: '选择色卡块' }).click()
        await page
          .locator(
            '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
          )
          .first()
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        const colorBlocksBefore = await page
          .locator(
            '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
          )
          .count()
        await page.getByRole('button', { name: '上插色卡块' }).click()
        assert.equal(
          await page
            .locator(
              '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
            )
            .count(),
          colorBlocksBefore + 1,
          '色卡块上插色卡块应新增色卡块'
        )
        await page.getByRole('button', { name: '移除当前块' }).click()
        assert.equal(
          await page
            .locator(
              '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
            )
            .count(),
          colorBlocksBefore,
          '色卡块移除当前块后块数应恢复'
        )
        const rightSide = page.locator('.erp-color-card-paper__side').nth(1)
        await rightSide
          .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
          .first()
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        const rightBlocksBefore = await rightSide
          .locator(
            '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
          )
          .count()
        await page.getByRole('button', { name: '下插色卡块' }).click()
        assert.equal(
          await rightSide
            .locator(
              '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
            )
            .count(),
          rightBlocksBefore + 1,
          '色卡右侧普通行在块选择模式下应能选中并下插色卡块'
        )
        await page.getByRole('button', { name: '移除当前块' }).click()
        assert.equal(
          await rightSide
            .locator(
              '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
            )
            .count(),
          rightBlocksBefore,
          '色卡右侧新增块移除后右栏块数应恢复'
        )

        await gotoScenarioPath(
          page,
          '/erp/print-workspace/engineering-work-instruction?draft=fresh',
          { waitUntil: 'domcontentloaded' }
        )
        await page.locator('.erp-work-instruction-paper').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-work-instruction-paper',
          scenarioLabel: '作业指导书',
          screenshotName: 'print-workspace-work-instruction-paper-top-rhythm',
        })
        await assertEngineeringPaperScreenPrintBox(
          '.erp-work-instruction-paper',
          '作业指导书'
        )
        await assertEngineeringEditorRounded('作业指导书')
        await assertFullCellEditableCoverage(
          '作业指导书',
          '.erp-work-instruction-paper__step-content-cell',
          '.erp-engineering-print-editable'
        )
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-work-instruction-paper__step-content-cell .erp-engineering-print-editable',
          scenarioLabel: '作业指导书',
        })
        await assertPrintEditableFocusSurvivesSwitch(page, {
          firstSelector:
            '.erp-work-instruction-paper__step-no .erp-engineering-print-editable',
          secondSelector:
            '.erp-work-instruction-paper__step-content-cell .erp-engineering-print-editable',
          scenarioLabel: '作业指导书',
        })
        await writeEngineeringPaperReviewScreenshot(
          '.erp-work-instruction-paper',
          'work-instruction-runtime-latest.png'
        )
        await assertEngineeringServerPdfSnapshotPageBox({
          paperSelector: '.erp-work-instruction-paper',
          contentSelector: '.erp-work-instruction-paper__sheet',
          scenarioLabel: '作业指导书',
          screenshotName: 'work-instruction-server-pdf-page-box',
        })
        await assertWorkInstructionRemarkStaysInSheet({
          scenarioLabel: '作业指导书',
          paperSelector: '.erp-work-instruction-paper',
          screenshotName: 'work-instruction-print-remark-first-page.png',
        })
        toolbarGroups = await collectToolbarGroups()
        assertButtonTexts(
          toolbarGroups[0],
          [
            '上插一行',
            '下插一行',
            '移除当前行',
            '设为标题行',
            '设为编号行',
            '设为文本行',
            '给当前行加图',
            '清空当前行图片',
            '标注当前行图片',
            '选择行',
          ],
          '作业指导书纸面行'
        )
        assertButtonTexts(
          toolbarGroups[1],
          ['文字标红/取消'],
          '作业指导书文字格式'
        )
        await assertRichEditableNbspArtifactGuard(
          '.erp-work-instruction-paper',
          '作业指导书'
        )
        assert.equal(
          toolbarGroups[0].buttons[0].disabled,
          true,
          '作业指导书未选择纸面行前，上插一行应禁用'
        )
        assert.equal(
          toolbarGroups[0].buttons[1].disabled,
          true,
          '作业指导书未选择纸面行前，下插一行应禁用'
        )
        await assertNoLegacyEngineeringRowButtonText('作业指导书')
        let workInstructionRowImageControlState = await page.evaluate(() => ({
          visibleUploadButtons: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__row-image-button'
            ),
          ].filter((node) => window.getComputedStyle(node).display !== 'none')
            .length,
          visibleEmptyImageRows: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__row-images--empty'
            ),
          ].filter((node) => window.getComputedStyle(node).display !== 'none')
            .length,
          rowImageSlotCount: document.querySelectorAll(
            '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot'
          ).length,
        }))
        assert.deepEqual(
          workInstructionRowImageControlState,
          {
            visibleUploadButtons: 0,
            visibleEmptyImageRows: 0,
            rowImageSlotCount: 0,
          },
          `作业指导书作业行未选中时不应常驻行内加图按钮或空图片槽: ${JSON.stringify(workInstructionRowImageControlState)}`
        )
        assert.equal(
          toolbarGroups[0].buttons[6].disabled,
          true,
          '作业指导书未选择纸面行前，给当前行加图应禁用'
        )
        assert.equal(
          toolbarGroups[0].buttons[7].disabled,
          true,
          '作业指导书未选择纸面行前，清空当前行图片应禁用'
        )
        assert.equal(
          toolbarGroups[0].buttons[8].disabled,
          true,
          '作业指导书未选择纸面行前，标注当前行图片应禁用'
        )
        let workInstructionHeaderImageState = await page.evaluate(() => ({
          uploadBarInPanel: Boolean(
            document
              .querySelector('.erp-processing-contract-upload-bar')
              ?.closest('.erp-print-shell__record-panel')
          ),
          uploadBarInStage: Boolean(
            document
              .querySelector('.erp-processing-contract-upload-bar')
              ?.closest('.erp-print-shell__stage')
          ),
          headerImageActionCount: document.querySelectorAll(
            '.erp-work-instruction-paper__header .erp-engineering-print-image-slot__actions'
          ).length,
          headerImageCount: document.querySelectorAll(
            '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
          ).length,
          sheetHeaderImageCounts: [
            ...document.querySelectorAll('.erp-work-instruction-paper__sheet'),
          ].map(
            (sheet) =>
              sheet.querySelectorAll(
                '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
              ).length
          ),
          emptyHeaderImageBackground: window.getComputedStyle(
            document.querySelector(
              '.erp-work-instruction-paper__header .erp-engineering-print-image-slot'
            )
          ).backgroundColor,
          emptyHeaderImageBorderStyle: window.getComputedStyle(
            document.querySelector(
              '.erp-work-instruction-paper__header .erp-engineering-print-image-slot'
            )
          ).borderStyle,
        }))
        assert(
          workInstructionHeaderImageState.uploadBarInPanel &&
            !workInstructionHeaderImageState.uploadBarInStage &&
            workInstructionHeaderImageState.headerImageActionCount === 0 &&
            workInstructionHeaderImageState.headerImageCount === 0 &&
            workInstructionHeaderImageState.sheetHeaderImageCounts.length ===
              1 &&
            workInstructionHeaderImageState.sheetHeaderImageCounts.every(
              (count) => count === 0
            ) &&
            workInstructionHeaderImageState.emptyHeaderImageBackground ===
              'rgb(255, 255, 255)' &&
            workInstructionHeaderImageState.emptyHeaderImageBorderStyle ===
              'solid',
          `作业指导书右上产品图应由左侧上传栏维护，纸面 header 不应出现上传/清空按钮: ${JSON.stringify(workInstructionHeaderImageState)}`
        )
        const workInstructionGridState = await page.evaluate(() => {
          const paper = document.querySelector('.erp-work-instruction-paper')
          const stageWrap = document.querySelector(
            '.erp-engineering-print-workspace-shell .erp-print-shell__stage-wrap'
          )
          const headerRow = document.querySelector(
            '.erp-work-instruction-paper__header'
          )
          const imageCell = document.querySelector(
            '.erp-work-instruction-paper__header-image-cell'
          )
          const firstStepRow = document.querySelector(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )
          const companyText = document.querySelector(
            '.erp-work-instruction-paper__company'
          )
          const companyCell = document.querySelector(
            '.erp-work-instruction-paper__company-cell'
          )
          const titleCell = document.querySelector(
            '.erp-work-instruction-paper__title-cell'
          )
          const metaLabel = document.querySelector(
            '.erp-work-instruction-paper__meta-label'
          )
          const sectionTitleCell = document.querySelector(
            '.erp-work-instruction-paper__section-title-row td'
          )
          const firstStepNo = firstStepRow?.querySelector(
            '.erp-work-instruction-paper__step-no'
          )
          const firstStepContent = firstStepRow?.querySelector(
            '.erp-work-instruction-paper__step-content-cell'
          )
          const noticeCell = document.querySelector(
            '.erp-work-instruction-paper__text-row td'
          )
          const sheets = [
            ...document.querySelectorAll('.erp-work-instruction-paper__sheet'),
          ]
          const continuationSheets = [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__sheet--continuation'
            ),
          ]
          const headerRows = [
            ...document.querySelectorAll('.erp-work-instruction-paper__header'),
          ]
          const sectionTitleRows = [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__section-title-row'
            ),
          ]
          const fullTextRows = [
            ...document.querySelectorAll(
              [
                '.erp-work-instruction-paper__section-title-row',
                '.erp-work-instruction-paper__text-row',
              ].join(',')
            ),
          ]
          const stepRows = [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
            ),
          ]
          const sumColSpan = (row) =>
            [...(row?.children || [])].reduce(
              (sum, cell) => sum + (Number(cell.getAttribute('colspan')) || 1),
              0
            )
          const rowHeightVar = (row) =>
            row?.style.getPropertyValue('--work-instruction-row-height') || ''
          const normalizedText = (node) =>
            String(node?.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim()
          const companyCellRect = companyCell?.getBoundingClientRect()
          const companyTextRange = document.createRange()
          if (companyText) companyTextRange.selectNodeContents(companyText)
          const companyTextRect = companyText
            ? companyTextRange.getBoundingClientRect()
            : null
          companyTextRange.detach()
          const companyStyle = companyText
            ? window.getComputedStyle(companyText)
            : null
          const continuationSummaries = continuationSheets.map((sheet) => {
            const rows = [
              ...sheet.querySelectorAll(
                '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
              ),
            ]
            const headers = [
              ...sheet.querySelectorAll('.erp-work-instruction-paper__header'),
            ]
            return {
              text: String(sheet.textContent || '')
                .replace(/\s+/gu, ' ')
                .trim(),
              colCount: sheet.querySelectorAll('colgroup col').length,
              headerHeightVars: headers.map(rowHeightVar),
              stepRowCount: rows.length,
              row2HeightVar:
                rows[1]?.style.getPropertyValue(
                  '--instruction-row-min-height'
                ) || '',
              buttonCount: sheet.querySelectorAll('button').length,
              breakBefore: window.getComputedStyle(sheet).breakBefore,
              pageBreakBefore: window.getComputedStyle(sheet).pageBreakBefore,
            }
          })
          return {
            sheetCount: sheets.length,
            continuationSheetCount: continuationSheets.length,
            firstSheetColCount: document.querySelectorAll(
              '.erp-work-instruction-paper__sheet colgroup col'
            ).length
              ? sheets[0]?.querySelectorAll('colgroup col').length || 0
              : 0,
            allSheetColCounts: sheets.map(
              (sheet) => sheet.querySelectorAll('colgroup col').length
            ),
            headerFirstRowSpan: sumColSpan(headerRow),
            firstStepRowSpan: sumColSpan(firstStepRow),
            headerImageColSpan: Number(imageCell?.getAttribute('colspan')) || 1,
            headerMetaTexts: [
              ...(sheets[0]?.querySelectorAll(
                '.erp-work-instruction-paper__meta-label'
              ) || []),
            ].map(normalizedText),
            headerSummaryTexts: [
              ...(sheets[0]?.querySelectorAll(
                '.erp-work-instruction-paper__summary-label'
              ) || []),
            ].map(normalizedText),
            processHeader: {
              name: normalizedText(
                sheets[0]?.querySelector('[data-work-instruction-process-name]')
              ),
              date: normalizedText(
                sheets[0]?.querySelector('[data-work-instruction-process-date]')
              ),
              dateEditorCount:
                sheets[0]?.querySelectorAll(
                  '[data-work-instruction-process-date] > .erp-engineering-print-editable[contenteditable="true"]'
                ).length || 0,
            },
            companyAlignment: {
              display: companyStyle?.display || '',
              alignItems: companyStyle?.alignItems || '',
              justifyContent: companyStyle?.justifyContent || '',
              textAlign: companyStyle?.textAlign || '',
              xCenterDelta:
                companyCellRect && companyTextRect
                  ? Math.abs(
                      companyCellRect.left +
                        companyCellRect.width / 2 -
                        (companyTextRect.left + companyTextRect.width / 2)
                    )
                  : -1,
              yCenterDelta:
                companyCellRect && companyTextRect
                  ? Math.abs(
                      companyCellRect.top +
                        companyCellRect.height / 2 -
                        (companyTextRect.top + companyTextRect.height / 2)
                    )
                  : -1,
              clientWidth: companyText?.clientWidth || 0,
              scrollWidth: companyText?.scrollWidth || 0,
            },
            paperPaddingLeft: paper
              ? window.getComputedStyle(paper).paddingLeft
              : '',
            stageWrapJustify: stageWrap
              ? window.getComputedStyle(stageWrap).justifyContent
              : '',
            headerRowHeightVars: headerRows.map(rowHeightVar),
            headerRowPixelHeights: headerRows.map(
              (row) => row.getBoundingClientRect().height
            ),
            sectionTitleHeightVars: sectionTitleRows.map(rowHeightVar),
            sectionTitlePixelHeights: sectionTitleRows.map(
              (row) => row.getBoundingClientRect().height
            ),
            fullTextRowHeightVars: fullTextRows.map(rowHeightVar),
            fullTextRowPixelHeights: fullTextRows.map(
              (row) => row.getBoundingClientRect().height
            ),
            stepRowCount: stepRows.length,
            stepNumbers: stepRows.map((row) =>
              String(
                row.querySelector('.erp-work-instruction-paper__step-no')
                  ?.textContent || ''
              ).trim()
            ),
            stepRowHeightVars: stepRows.map(
              (row) =>
                row.style.getPropertyValue('--instruction-row-min-height') || ''
            ),
            annotatedStepRowCount: stepRows.filter((row) =>
              row.classList.contains(
                'erp-work-instruction-paper__step-row--annotated'
              )
            ).length,
            defaultStepRowImageCount: stepRows.reduce(
              (sum, row) =>
                sum +
                row.querySelectorAll('.erp-engineering-print-image-slot img')
                  .length,
              0
            ),
            firstStepHeightVar:
              stepRows[0]?.style.getPropertyValue(
                '--instruction-row-min-height'
              ) || '',
            firstStepPixelHeight:
              stepRows[0]?.getBoundingClientRect().height || 0,
            fontSizes: {
              paper: paper ? window.getComputedStyle(paper).fontSize : '',
              company: companyText
                ? window.getComputedStyle(companyText).fontSize
                : '',
              title: titleCell
                ? window.getComputedStyle(titleCell).fontSize
                : '',
              meta: metaLabel
                ? window.getComputedStyle(metaLabel).fontSize
                : '',
              sectionTitle: sectionTitleCell
                ? window.getComputedStyle(sectionTitleCell).fontSize
                : '',
              stepNo: firstStepNo
                ? window.getComputedStyle(firstStepNo).fontSize
                : '',
              stepContent: firstStepContent
                ? window.getComputedStyle(firstStepContent).fontSize
                : '',
              text: noticeCell
                ? window.getComputedStyle(noticeCell).fontSize
                : '',
            },
            textHeightVars: [
              ...document.querySelectorAll(
                '.erp-work-instruction-paper__text-row'
              ),
            ].map(rowHeightVar),
            continuationSummaries,
          }
        })
        assert(
          workInstructionGridState.firstSheetColCount === 9 &&
            workInstructionGridState.allSheetColCounts.every(
              (colCount) => colCount === 9
            ) &&
            workInstructionGridState.headerFirstRowSpan === 9 &&
            workInstructionGridState.firstStepRowSpan === 9 &&
            workInstructionGridState.headerImageColSpan === 1 &&
            parseFloat(workInstructionGridState.paperPaddingLeft) <= 12 &&
            workInstructionGridState.stageWrapJustify === 'center',
          `作业指导书应按 Excel Sheet1 A:I 主体合并范围渲染，并保持工程打印模板居中编辑位置: ${JSON.stringify(workInstructionGridState)}`
        )
        assert.deepEqual(
          {
            meta: workInstructionGridState.headerMetaTexts,
            summary: workInstructionGridState.headerSummaryTexts,
            processHeader: workInstructionGridState.processHeader,
          },
          {
            meta: ['产品编号', '版本/版次', '车缝', '制表', '设计师', '审核'],
            summary: ['发放部门：', '订单号：', '产品名称：'],
            processHeader: {
              name: '车缝',
              date: '',
              dateEditorCount: 1,
            },
          },
          `作业指导书头六行字段角色应与原 Excel 一致，G3 显示本页工序且 H3 保持独立日期值槽: ${JSON.stringify(workInstructionGridState)}`
        )
        assert(
          workInstructionGridState.companyAlignment.display === 'flex' &&
            workInstructionGridState.companyAlignment.alignItems === 'center' &&
            workInstructionGridState.companyAlignment.justifyContent ===
              'center' &&
            workInstructionGridState.companyAlignment.textAlign === 'center' &&
            workInstructionGridState.companyAlignment.xCenterDelta >= 0 &&
            workInstructionGridState.companyAlignment.xCenterDelta <= 2 &&
            workInstructionGridState.companyAlignment.yCenterDelta >= 0 &&
            workInstructionGridState.companyAlignment.yCenterDelta <= 4 &&
            workInstructionGridState.companyAlignment.scrollWidth <=
              workInstructionGridState.companyAlignment.clientWidth + 1,
          `作业指导书公司名称应在 A1:F2 合并单元格内水平和垂直居中: ${JSON.stringify(workInstructionGridState.companyAlignment)}`
        )
        assert.deepEqual(
          {
            headerRowHeightVars:
              workInstructionGridState.headerRowHeightVars.slice(0, 6),
            sectionTitleHeightVars:
              workInstructionGridState.sectionTitleHeightVars.slice(0, 3),
            fullTextRowHeightVars:
              workInstructionGridState.fullTextRowHeightVars,
            firstStepHeightVar: workInstructionGridState.firstStepHeightVar,
            textHeightVars: workInstructionGridState.textHeightVars,
          },
          {
            headerRowHeightVars: [
              '8.5mm',
              '8.5mm',
              '8.5mm',
              '8.5mm',
              '8.5mm',
              '8.5mm',
            ],
            sectionTitleHeightVars: ['11.6mm', '11.6mm', '11.6mm'],
            fullTextRowHeightVars: [
              '11.6mm',
              '11.6mm',
              '11.6mm',
              '11.6mm',
              '11.6mm',
            ],
            firstStepHeightVar: '11.6mm',
            textHeightVars: ['11.6mm', '11.6mm'],
          },
          `作业指导书统一行模型应让标题、文本和编号行使用一致行高: ${JSON.stringify(workInstructionGridState)}`
        )
        assert(
          workInstructionGridState.sheetCount === 1 &&
            workInstructionGridState.continuationSheetCount === 0 &&
            workInstructionGridState.continuationSummaries.length === 0 &&
            workInstructionGridState.stepRowCount === 5 &&
            workInstructionGridState.stepNumbers[0] !== '' &&
            JSON.stringify(workInstructionGridState.stepNumbers.slice(1)) ===
              JSON.stringify(['2', '1', '1', '2']) &&
            workInstructionGridState.stepRowHeightVars.every(
              (heightVar) => heightVar === '11.6mm'
            ) &&
            workInstructionGridState.annotatedStepRowCount === 0 &&
            workInstructionGridState.defaultStepRowImageCount === 0,
          `作业指导书纸面应按小模块重编 5 条编号行，备注后不渲染重复页块: ${JSON.stringify(workInstructionGridState)}`
        )
        assert(
          workInstructionGridState.headerRowPixelHeights.every(
            (height) => height >= 29 && height <= 36
          ) &&
            workInstructionGridState.fullTextRowPixelHeights.every(
              (height) => height >= 40 && height <= 54
            ) &&
            workInstructionGridState.firstStepPixelHeight >= 40 &&
            workInstructionGridState.firstStepPixelHeight <= 50,
          `作业指导书标题、文本和编号行高度应保持一致: ${JSON.stringify(workInstructionGridState)}`
        )
        const parseFontSize = (value) => parseFloat(String(value || '0'))
        assert(
          parseFontSize(workInstructionGridState.fontSizes.company) >= 21 &&
            parseFontSize(workInstructionGridState.fontSizes.company) <= 22 &&
            parseFontSize(workInstructionGridState.fontSizes.title) >= 21 &&
            parseFontSize(workInstructionGridState.fontSizes.title) <= 22 &&
            parseFontSize(workInstructionGridState.fontSizes.meta) >= 15.5 &&
            parseFontSize(workInstructionGridState.fontSizes.meta) <= 16.5 &&
            parseFontSize(workInstructionGridState.fontSizes.sectionTitle) >=
              18 &&
            parseFontSize(workInstructionGridState.fontSizes.sectionTitle) <=
              19.5 &&
            parseFontSize(workInstructionGridState.fontSizes.stepNo) >= 15.5 &&
            parseFontSize(workInstructionGridState.fontSizes.stepNo) <= 16.5 &&
            parseFontSize(workInstructionGridState.fontSizes.stepContent) >=
              14 &&
            parseFontSize(workInstructionGridState.fontSizes.stepContent) <=
              15 &&
            parseFontSize(workInstructionGridState.fontSizes.text) >= 14 &&
            parseFontSize(workInstructionGridState.fontSizes.text) <= 15,
          `作业指导书字号应按 Sheet1 16pt/12pt/14pt/11pt/9pt 比例映射: ${JSON.stringify(workInstructionGridState.fontSizes)}`
        )
        const defaultRichTextState = await page.evaluate(() => {
          const rows = document.querySelectorAll(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )
          const readEditorState = (rowIndex) => {
            const editor = rows[rowIndex]?.querySelector(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            )
            const redNode =
              editor?.querySelector('[style*="red"]') ||
              editor?.querySelector('[style*="255, 0, 0"]')
            const strongNode = editor?.querySelector('strong, b')
            return {
              color: redNode ? window.getComputedStyle(redNode).color : '',
              weight: strongNode
                ? window.getComputedStyle(strongNode).fontWeight
                : '',
            }
          }
          return {
            row2: readEditorState(1),
            row5: readEditorState(4),
          }
        })
        assert.deepEqual(
          defaultRichTextState,
          {
            row2: { color: '', weight: '' },
            row5: { color: '', weight: '' },
          },
          `作业指导书模板默认文字应保持黑色常规字重，红色只作为选中文本后的编辑能力: ${JSON.stringify(defaultRichTextState)}`
        )
        await page
          .locator('.erp-processing-contract-upload-bar__input')
          .first()
          .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))
        await expectText(page, '已同步：favicon.svg')
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
            ).length === 1
        )
        workInstructionHeaderImageState = await page.evaluate(() => ({
          headerImageActionCount: document.querySelectorAll(
            '.erp-work-instruction-paper__header .erp-engineering-print-image-slot__actions'
          ).length,
          headerImageCount: document.querySelectorAll(
            '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
          ).length,
          sheetHeaderImageCounts: [
            ...document.querySelectorAll('.erp-work-instruction-paper__sheet'),
          ].map(
            (sheet) =>
              sheet.querySelectorAll(
                '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
              ).length
          ),
        }))
        assert(
          workInstructionHeaderImageState.headerImageActionCount === 0 &&
            workInstructionHeaderImageState.headerImageCount === 1 &&
            workInstructionHeaderImageState.sheetHeaderImageCounts.length ===
              1 &&
            workInstructionHeaderImageState.sheetHeaderImageCounts.every(
              (count) => count === 1
            ),
          `作业指导书右上产品图上传后应只在纸面 header 输出图片: ${JSON.stringify(workInstructionHeaderImageState)}`
        )
        await page
          .locator('.erp-processing-contract-upload-bar__input')
          .nth(1)
          .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
            ).length === 2
        )
        const workInstructionDualHeaderImageState = await page.evaluate(() => {
          const cell = document.querySelector(
            '.erp-work-instruction-paper__header-image-cell'
          )
          const wrapper = cell?.querySelector(
            '.erp-work-instruction-paper__header-images--count-2'
          )
          const slots = [
            ...(wrapper?.querySelectorAll(
              '.erp-engineering-print-image-slot'
            ) || []),
          ]
          const cellRect = cell?.getBoundingClientRect()
          const wrapperRect = wrapper?.getBoundingClientRect()
          const slotRects = slots.map((slot) => {
            const rect = slot.getBoundingClientRect()
            return {
              top: rect.top,
              right: rect.right,
              bottom: rect.bottom,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            }
          })
          const wrapperStyle = wrapper && window.getComputedStyle(wrapper)
          return {
            imageCount: wrapper?.querySelectorAll('img').length || 0,
            snapshotCount:
              wrapper?.getAttribute(
                'data-work-instruction-header-image-count'
              ) || '',
            gridColumns: wrapperStyle?.gridTemplateColumns || '',
            wrapperClientWidth: wrapper?.clientWidth || 0,
            wrapperScrollWidth: wrapper?.scrollWidth || 0,
            wrapperClientHeight: wrapper?.clientHeight || 0,
            wrapperScrollHeight: wrapper?.scrollHeight || 0,
            cellRect: cellRect
              ? {
                  top: cellRect.top,
                  right: cellRect.right,
                  bottom: cellRect.bottom,
                  left: cellRect.left,
                }
              : null,
            wrapperRect: wrapperRect
              ? {
                  top: wrapperRect.top,
                  right: wrapperRect.right,
                  bottom: wrapperRect.bottom,
                  left: wrapperRect.left,
                }
              : null,
            slotRects,
          }
        })
        const dualImageCell = workInstructionDualHeaderImageState.cellRect
        const dualImageWrapper = workInstructionDualHeaderImageState.wrapperRect
        const dualImageSlots = workInstructionDualHeaderImageState.slotRects
        assert(
          workInstructionDualHeaderImageState.imageCount === 2 &&
            workInstructionDualHeaderImageState.snapshotCount === '2' &&
            workInstructionDualHeaderImageState.gridColumns.trim().split(/\s+/u)
              .length === 2 &&
            workInstructionDualHeaderImageState.wrapperScrollWidth <=
              workInstructionDualHeaderImageState.wrapperClientWidth + 1 &&
            workInstructionDualHeaderImageState.wrapperScrollHeight <=
              workInstructionDualHeaderImageState.wrapperClientHeight + 1 &&
            dualImageCell &&
            dualImageWrapper &&
            dualImageSlots.length === 2 &&
            dualImageWrapper.left >= dualImageCell.left - 1 &&
            dualImageWrapper.right <= dualImageCell.right + 1 &&
            dualImageWrapper.top >= dualImageCell.top - 1 &&
            dualImageWrapper.bottom <= dualImageCell.bottom + 1 &&
            dualImageSlots.every(
              (rect) =>
                rect.width > 0 &&
                rect.height > 0 &&
                rect.left >= dualImageWrapper.left - 1 &&
                rect.right <= dualImageWrapper.right + 1 &&
                rect.top >= dualImageWrapper.top - 1 &&
                rect.bottom <= dualImageWrapper.bottom + 1
            ) &&
            dualImageSlots[0].right <= dualImageSlots[1].left + 1,
          `作业指导书右上两张产品图应在同一单元格内横向并列且不溢出: ${JSON.stringify(workInstructionDualHeaderImageState)}`
        )
        await writeEngineeringPaperReviewScreenshot(
          '.erp-work-instruction-paper',
          'work-instruction-header-two-product-images.png'
        )
        await page
          .locator('.erp-processing-contract-upload-bar__item')
          .nth(1)
          .getByRole('button', { name: '清空' })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
            ).length === 1
        )
        await page
          .locator('.erp-processing-contract-upload-bar__item')
          .first()
          .getByRole('button', { name: '清空' })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
            ).length === 0
        )
        await page.getByRole('button', { name: '选择行' }).click()
        await page
          .locator(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )
          .nth(1)
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        toolbarGroups = await collectToolbarGroups()
        assert.equal(
          toolbarGroups[0].buttons[6].disabled,
          false,
          '作业指导书选择编号行后，给当前行加图应可用'
        )
        assert.equal(
          toolbarGroups[0].buttons[0].disabled,
          false,
          '作业指导书选择编号作业行后，上插一行应可用'
        )
        assert.equal(
          toolbarGroups[0].buttons[1].disabled,
          false,
          '作业指导书选择编号作业行后，下插一行应可用'
        )
        assert.equal(
          toolbarGroups[0].buttons[7].disabled,
          true,
          '作业指导书选中无图片行时，清空当前行图片仍应禁用'
        )
        assert.equal(
          toolbarGroups[0].buttons[8].disabled,
          true,
          '作业指导书选中无图片行时，标注当前行图片仍应禁用'
        )
        workInstructionRowImageControlState = await page.evaluate(() => ({
          visibleUploadButtons: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__row-image-button'
            ),
          ].filter((node) => window.getComputedStyle(node).display !== 'none')
            .length,
          visibleEmptyImageRows: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__row-images--empty'
            ),
          ].filter((node) => window.getComputedStyle(node).display !== 'none')
            .length,
        }))
        assert.deepEqual(
          workInstructionRowImageControlState,
          {
            visibleUploadButtons: 0,
            visibleEmptyImageRows: 0,
          },
          `作业指导书纸面行内不应显示加图按钮或空图片槽: ${JSON.stringify(workInstructionRowImageControlState)}`
        )
        const textRowLayoutState = await page.evaluate(() => {
          const row = document.querySelectorAll(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )[1]
          const cell = row?.querySelector(
            '.erp-work-instruction-paper__step-content-cell'
          )
          const editor = cell?.querySelector(
            ':scope > .erp-engineering-print-editable'
          )
          const emptyControls = cell?.querySelector(
            '.erp-work-instruction-paper__row-images--empty'
          )
          const cellRect = cell?.getBoundingClientRect()
          const editorRect = editor?.getBoundingClientRect()
          return {
            isTextRow: row?.classList.contains(
              'erp-work-instruction-paper__step-row--text'
            ),
            isImageRow: row?.classList.contains(
              'erp-work-instruction-paper__step-row--image'
            ),
            emptyControlsPosition: emptyControls
              ? window.getComputedStyle(emptyControls).position
              : '',
            emptyControlsDisplay: emptyControls
              ? window.getComputedStyle(emptyControls).display
              : '',
            centerDelta:
              cellRect && editorRect
                ? Math.abs(
                    cellRect.top +
                      cellRect.height / 2 -
                      (editorRect.top + editorRect.height / 2)
                  )
                : -1,
          }
        })
        assert(
          textRowLayoutState.isTextRow &&
            !textRowLayoutState.isImageRow &&
            textRowLayoutState.emptyControlsDisplay === 'none' &&
            textRowLayoutState.centerDelta >= 0 &&
            textRowLayoutState.centerDelta <= 3,
          `作业指导书文字行内容应上下居中，纸面不渲染空加图入口: ${JSON.stringify(textRowLayoutState)}`
        )
        const workInstructionCellVerticalState = await page.evaluate(() => {
          const mainSheet = document.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
          )
          const textRows = [
            ...(mainSheet?.querySelectorAll(
              '.erp-work-instruction-paper__step-row--text'
            ) || []),
          ]
          const measureTextRect = (node) => {
            if (!node) return null
            const range = document.createRange()
            range.selectNodeContents(node)
            const rect = range.getBoundingClientRect()
            range.detach()
            return rect.width || rect.height ? rect : null
          }
          const measure = (label, cellSelector, contentSelector = null) => {
            const cell = mainSheet?.querySelector(cellSelector)
            const content = contentSelector
              ? cell?.querySelector(contentSelector)
              : cell
            const cellRect = cell?.getBoundingClientRect()
            const contentRect = measureTextRect(content)
            const editable = content?.classList?.contains(
              'erp-engineering-print-editable'
            )
              ? content
              : content?.querySelector?.('.erp-engineering-print-editable')
            const editableStyle = editable
              ? window.getComputedStyle(editable)
              : null
            return {
              label,
              text: String(content?.textContent || '')
                .replace(/\s+/gu, ' ')
                .trim(),
              cellHeight: cellRect?.height || 0,
              textHeight: contentRect?.height || 0,
              centerDelta:
                cellRect && contentRect
                  ? Math.abs(
                      cellRect.top +
                        cellRect.height / 2 -
                        (contentRect.top + contentRect.height / 2)
                    )
                  : -1,
              cellVerticalAlign: cell
                ? window.getComputedStyle(cell).verticalAlign
                : '',
              editableDisplay: editableStyle?.display || '',
              editableAlignItems: editableStyle?.alignItems || '',
            }
          }
          const secondTextRow = textRows[1] || textRows[0]
          const textRowIndex = secondTextRow
            ? textRows.indexOf(secondTextRow)
            : -1
          const textRowSelector =
            textRowIndex >= 0
              ? `.erp-work-instruction-paper__step-row--text:nth-of-type(${
                  [...mainSheet.querySelectorAll('tr')].indexOf(secondTextRow) +
                  1
                })`
              : ''
          const states = [
            measure(
              'company',
              '.erp-work-instruction-paper__company-cell',
              ':scope > .erp-engineering-print-editable'
            ),
            measure('product-label', '.erp-work-instruction-paper__meta-label'),
            measure(
              'product-value',
              '.erp-work-instruction-paper__meta-value',
              ':scope > .erp-engineering-print-editable'
            ),
            measure(
              'summary-value',
              '.erp-work-instruction-paper__summary-value',
              ':scope > .erp-engineering-print-editable'
            ),
            measure(
              'section-title',
              '.erp-work-instruction-paper__section-title-row td',
              ':scope > .erp-engineering-print-editable'
            ),
            textRowSelector
              ? measure(
                  'step-no',
                  `${textRowSelector} .erp-work-instruction-paper__step-no`,
                  ':scope > .erp-engineering-print-editable'
                )
              : null,
            textRowSelector
              ? measure(
                  'step-content',
                  `${textRowSelector} .erp-work-instruction-paper__step-content-cell`,
                  ':scope > .erp-engineering-print-editable'
                )
              : null,
            measure(
              'text-row',
              '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__text-row td',
              ':scope > .erp-engineering-print-editable'
            ),
          ].filter(Boolean)
          return {
            states,
            offCenterStates: states.filter(
              (state) =>
                state.cellHeight > 0 &&
                state.textHeight > 0 &&
                state.centerDelta > 6
            ),
            nonMiddleCells: states.filter(
              (state) => state.cellVerticalAlign !== 'middle'
            ),
            nonCenteredEditables: states.filter(
              (state) =>
                state.editableDisplay &&
                (state.editableDisplay !== 'flex' ||
                  state.editableAlignItems !== 'center')
            ),
          }
        })
        assert(
          workInstructionCellVerticalState.states.length >= 8 &&
            workInstructionCellVerticalState.offCenterStates.length === 0 &&
            workInstructionCellVerticalState.nonMiddleCells.length === 0 &&
            workInstructionCellVerticalState.nonCenteredEditables.length === 0,
          `作业指导书头部、段落、编号、正文和文本单元格内容都应上下居中: ${JSON.stringify(workInstructionCellVerticalState)}`
        )
        await page
          .locator(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )
          .nth(1)
          .locator('.erp-work-instruction-paper__row-image-input')
          .setInputFiles([
            path.resolve(webDir, 'public', 'favicon.svg'),
            path.resolve(webDir, 'public', 'favicon-docs.svg'),
            path.resolve(webDir, 'public', 'favicon-dev.svg'),
            path.resolve(webDir, 'public', 'favicon-testing.svg'),
          ])
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
            ).length === 4
        )
        workInstructionRowImageControlState = await page.evaluate(() => ({
          selectedRowImageCount: document.querySelectorAll(
            '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
          ).length,
          selectedRowDirectTextEditorCount: document.querySelectorAll(
            '.erp-work-instruction-paper__step-row--image .erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
          ).length,
          isImageRow: document
            .querySelector('.erp-work-instruction-paper__step-row--image')
            ?.classList.contains('erp-work-instruction-paper__step-row--image'),
          rowHeight: document
            .querySelector('.erp-work-instruction-paper__step-row--image')
            ?.getBoundingClientRect().height,
          rowImagesWrap: window.getComputedStyle(
            document.querySelector('.erp-work-instruction-paper__row-images')
          ).flexWrap,
          visibleUploadButtons: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__row-image-button'
            ),
          ].filter((node) => window.getComputedStyle(node).display !== 'none')
            .length,
          visibleImageActionCount: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot__actions'
            ),
          ].filter(
            (node) => window.getComputedStyle(node).visibility !== 'hidden'
          ).length,
          imageSources: [
            ...document.querySelectorAll(
              '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
            ),
          ].map((image) => image.src),
        }))
        assert.deepEqual(
          {
            selectedRowImageCount:
              workInstructionRowImageControlState.selectedRowImageCount,
            selectedRowDirectTextEditorCount:
              workInstructionRowImageControlState.selectedRowDirectTextEditorCount,
            isImageRow: workInstructionRowImageControlState.isImageRow,
            visibleUploadButtons:
              workInstructionRowImageControlState.visibleUploadButtons,
            visibleImageActionCount:
              workInstructionRowImageControlState.visibleImageActionCount,
            rowImagesWrap: workInstructionRowImageControlState.rowImagesWrap,
          },
          {
            selectedRowImageCount: 4,
            selectedRowDirectTextEditorCount: 1,
            isImageRow: true,
            visibleUploadButtons: 0,
            visibleImageActionCount: 0,
            rowImagesWrap: 'wrap',
          },
          `作业指导书行内图片上传后应保留文字编辑器、纸面不显示图片按钮且支持横向换行: ${JSON.stringify(workInstructionRowImageControlState)}`
        )
        assert(
          workInstructionRowImageControlState.rowHeight >= 150,
          `作业指导书图片行高度应接近 Excel 大图行比例: ${JSON.stringify(workInstructionRowImageControlState)}`
        )
        toolbarGroups = await collectToolbarGroups()
        assert.equal(
          toolbarGroups[0].buttons[7].disabled,
          false,
          '作业指导书图片上传后，清空当前行图片应可用'
        )
        assert.equal(
          toolbarGroups[0].buttons[8].disabled,
          false,
          '作业指导书图片上传后，标注当前行图片应可用'
        )
        const instructionImageManager = page.locator(
          '.erp-work-instruction-annotation-modal'
        )
        await page
          .getByRole('button', { name: '标注当前行图片', exact: true })
          .click()
        await instructionImageManager.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await instructionImageManager
          .getByRole('tab', { name: '图片 2', exact: true })
          .click()
        await page.waitForFunction(() => {
          const modal = document.querySelector(
            '.erp-work-instruction-annotation-modal'
          )
          return (modal?.getBoundingClientRect().width || 0) >= 1000
        })
        await page.waitForTimeout(350)
        const instructionImageManagerLayout =
          await instructionImageManager.evaluate((modal) => {
            const tabs = modal.querySelector(
              '.erp-work-instruction-annotation-modal__image-tabs'
            )
            const activeTab = tabs?.querySelector('[aria-selected="true"]')
            const canvas = modal.querySelector(
              '[data-work-instruction-annotation-canvas="true"]'
            )
            const modalRect = modal.getBoundingClientRect()
            return {
              modalWidth: modalRect.width,
              tabsFit:
                Boolean(tabs) && tabs.scrollWidth <= tabs.clientWidth + 1,
              tabCount: tabs?.querySelectorAll('[role="tab"]').length || 0,
              activeTabText: activeTab?.textContent?.trim() || '',
              canvasVisible: Boolean(canvas?.getBoundingClientRect().width),
            }
          })
        assert(
          instructionImageManagerLayout.modalWidth >= 1000 &&
            instructionImageManagerLayout.tabsFit &&
            instructionImageManagerLayout.tabCount === 4 &&
            instructionImageManagerLayout.activeTabText === '图片 2' &&
            instructionImageManagerLayout.canvasVisible,
          `作业指导书多图标注弹窗应完整显示并允许切换图片: ${JSON.stringify(instructionImageManagerLayout)}`
        )
        await instructionImageManager.screenshot({
          path: path.resolve(
            outputDir,
            'work-instruction-image-annotation-multiple.png'
          ),
        })
        await instructionImageManager
          .getByRole('button', { name: '取消', exact: true })
          .click()
        await instructionImageManager.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        assert.equal(
          await page
            .getByRole('button', { name: '标注当前行图片', exact: true })
            .evaluate((button) => document.activeElement === button),
          true,
          '取消图片标注后焦点应返回标注当前行图片按钮'
        )
        assert.equal(
          await page
            .locator(
              '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
            )
            .count(),
          4,
          '取消图片标注后不应修改当前行图片'
        )
        await page
          .getByRole('button', { name: '清空当前行图片', exact: true })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
            ).length === 0
        )
        workInstructionRowImageControlState = await page.evaluate(() => {
          const row = document.querySelectorAll(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )[1]
          const editor = row?.querySelector(
            '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
          )
          return {
            isTextRow: row?.classList.contains(
              'erp-work-instruction-paper__step-row--text'
            ),
            imageCount: row?.querySelectorAll(
              '.erp-engineering-print-image-slot img'
            ).length,
            directTextEditorCount: row?.querySelectorAll(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            ).length,
            textAfterRemoval: String(editor?.textContent || '')
              .replace(/\u00a0/gu, '')
              .trim(),
          }
        })
        assert(
          workInstructionRowImageControlState.isTextRow &&
            workInstructionRowImageControlState.imageCount === 0 &&
            workInstructionRowImageControlState.directTextEditorCount === 1 &&
            workInstructionRowImageControlState.textAfterRemoval.length > 0,
          `作业指导书清空当前行图片后应保留当前行文字: ${JSON.stringify(workInstructionRowImageControlState)}`
        )
        const mainInstructionSheet = page.locator(
          '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
        )
        const mainInstructionRows = mainInstructionSheet.locator(
          '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
        )
        const lastInstructionRowIndex = (await mainInstructionRows.count()) - 1
        await mainInstructionRows
          .nth(lastInstructionRowIndex)
          .locator(
            '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
          )
          .click()
        const rowSelectionFromCellTextState = await page.evaluate(
          (rowIndex) => {
            const rows = [
              ...document.querySelectorAll(
                '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
              ),
            ]
            const row = rows[rowIndex]
            const editor = row?.querySelector(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            )
            return {
              selected: row?.classList.contains(
                'erp-engineering-print-row--selected'
              ),
              activeIsEditor: document.activeElement === editor,
              activeIsContentEditable:
                document.activeElement?.getAttribute('contenteditable') ===
                'true',
              rowNo: String(
                row?.querySelector('.erp-work-instruction-paper__step-no')
                  ?.textContent || ''
              ).trim(),
            }
          },
          lastInstructionRowIndex
        )
        assert(
          rowSelectionFromCellTextState.selected &&
            !rowSelectionFromCellTextState.activeIsEditor &&
            !rowSelectionFromCellTextState.activeIsContentEditable &&
            rowSelectionFromCellTextState.rowNo !== '',
          `作业指导书选择模式点击单元格文字应选中行而不是进入编辑: ${JSON.stringify(rowSelectionFromCellTextState)}`
        )
        toolbarGroups = await collectToolbarGroups()
        assert.equal(
          toolbarGroups[0].buttons[6].disabled,
          false,
          '作业指导书最后一条作业行选中后，给当前行加图应可用'
        )
        await mainInstructionRows
          .nth(lastInstructionRowIndex)
          .locator('.erp-work-instruction-paper__row-image-input')
          .setInputFiles([
            path.resolve(webDir, 'public', 'favicon.svg'),
            path.resolve(webDir, 'public', 'favicon.svg'),
            path.resolve(webDir, 'public', 'favicon.svg'),
            path.resolve(webDir, 'public', 'favicon.svg'),
          ])
        await page.waitForFunction((rowIndex) => {
          const sheet = document.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
          )
          const row = sheet?.querySelectorAll(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )[rowIndex]
          return (
            row?.querySelectorAll('.erp-engineering-print-image-slot img')
              .length === 4
          )
        }, lastInstructionRowIndex)
        const lastRowImageUploadState = await page.evaluate((rowIndex) => {
          const sheet = document.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
          )
          const row = sheet?.querySelectorAll(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )[rowIndex]
          const rowImages = row?.querySelector(
            '.erp-work-instruction-paper__row-images'
          )
          const imageSlots = [
            ...(row?.querySelectorAll(
              '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot'
            ) || []),
          ]
          const imageTops = imageSlots.map(
            (slot) => slot.getBoundingClientRect().top
          )
          return {
            imageCount:
              row?.querySelectorAll('.erp-engineering-print-image-slot img')
                .length || 0,
            buttonCount: row?.querySelectorAll('button').length || 0,
            rowImagesWrap: rowImages
              ? window.getComputedStyle(rowImages).flexWrap
              : '',
            rowHeight: row?.getBoundingClientRect().height || 0,
            rowMinHeightVar:
              row?.style.getPropertyValue('--instruction-row-min-height') || '',
            selected: row?.classList.contains(
              'erp-engineering-print-row--selected'
            ),
            wrappedLineCount: new Set(imageTops.map((top) => Math.round(top)))
              .size,
          }
        }, lastInstructionRowIndex)
        assert(
          lastRowImageUploadState.imageCount === 4 &&
            lastRowImageUploadState.buttonCount === 0 &&
            lastRowImageUploadState.rowImagesWrap === 'wrap' &&
            lastRowImageUploadState.rowHeight >= 150 &&
            lastRowImageUploadState.rowMinHeightVar === '11.6mm' &&
            lastRowImageUploadState.selected &&
            lastRowImageUploadState.wrappedLineCount >= 2,
          `作业指导书最后一条作业行应支持顶部选中后多图横排并自动换行: ${JSON.stringify(lastRowImageUploadState)}`
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .first()
          .getByRole('button', { name: '清空当前行图片', exact: true })
          .click()
        await page.waitForFunction((rowIndex) => {
          const sheet = document.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
          )
          const row = sheet?.querySelectorAll(
            '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
          )[rowIndex]
          return (
            row?.querySelectorAll('.erp-engineering-print-image-slot img')
              .length === 0
          )
        }, lastInstructionRowIndex)
        await page.evaluate(() => {
          const editor = document
            .querySelectorAll(
              '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
            )[0]
            ?.querySelector(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            )
          if (!editor) return
          editor.focus()
          const range = document.createRange()
          range.selectNodeContents(editor)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        })
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '文字标红/取消' })
          .click()
        await page
          .locator('.erp-work-instruction-paper__title-cell')
          .first()
          .click()
        let richTextPersistedState = await page.evaluate(() => {
          const editor = document
            .querySelectorAll(
              '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
            )[0]
            ?.querySelector(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            )
          const redNode =
            editor?.querySelector('[style*="red"]') ||
            editor?.querySelector('[style*="255, 0, 0"]')
          const strongNode = editor?.querySelector('strong, b')
          return {
            html: editor?.innerHTML || '',
            color: redNode ? window.getComputedStyle(redNode).color : '',
            strongCount: strongNode ? 1 : 0,
          }
        })
        assert(
          richTextPersistedState.color === 'rgb(255, 0, 0)' &&
            richTextPersistedState.strongCount === 0,
          `作业指导书选中文字标红后失焦保存应保留红色且不再产生加粗标签: ${JSON.stringify(richTextPersistedState)}`
        )
        await page.evaluate(() => {
          const editor = document
            .querySelectorAll(
              '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
            )[0]
            ?.querySelector(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            )
          if (!editor) return
          editor.focus()
          const range = document.createRange()
          range.selectNodeContents(editor)
          const selection = window.getSelection()
          selection?.removeAllRanges()
          selection?.addRange(range)
        })
        await page
          .locator('.erp-print-shell__toolbar-group')
          .nth(1)
          .getByRole('button', { name: '文字标红/取消' })
          .click()
        await page
          .locator('.erp-work-instruction-paper__title-cell')
          .first()
          .click()
        richTextPersistedState = await page.evaluate(() => {
          const editor = document
            .querySelectorAll(
              '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
            )[0]
            ?.querySelector(
              '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
            )
          const redNode =
            editor?.querySelector('[style*="red"]') ||
            editor?.querySelector('[style*="255, 0, 0"]')
          const strongNode = editor?.querySelector('strong, b')
          return {
            html: editor?.innerHTML || '',
            color: redNode ? window.getComputedStyle(redNode).color : '',
            strongCount: strongNode ? 1 : 0,
          }
        })
        assert(
          richTextPersistedState.color === '' &&
            richTextPersistedState.strongCount === 0,
          `作业指导书选中已标红文字再次点击应取消标红: ${JSON.stringify(richTextPersistedState)}`
        )
        await page
          .locator(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
          )
          .nth(1)
          .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
        const instructionRowsBefore = await page
          .locator(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
          )
          .count()
        await page.getByRole('button', { name: '下插一行' }).click()
        const instructionInsertState = await page.evaluate(() => {
          const mainSheet = document.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
          )
          const rows = [
            ...(mainSheet?.querySelectorAll(
              '.erp-work-instruction-paper__step-row--text > .erp-work-instruction-paper__step-no, .erp-work-instruction-paper__step-row--image > .erp-work-instruction-paper__step-no'
            ) || []),
          ].map((node) => String(node.textContent || '').trim())
          const stepRows = [
            ...(mainSheet?.querySelectorAll(
              '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
            ) || []),
          ]
          const insertedRow = stepRows[2]
          const selectedSourceRow = stepRows[1]
          const shiftedAnnotationRow = stepRows[3]
          return {
            rows,
            insertedText: String(insertedRow?.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            selectedSourceHeightVar:
              selectedSourceRow?.style.getPropertyValue(
                '--instruction-row-min-height'
              ) || '',
            insertedHeightVar:
              insertedRow?.style.getPropertyValue(
                '--instruction-row-min-height'
              ) || '',
            insertedPixelHeight:
              insertedRow?.getBoundingClientRect().height || 0,
            insertedImageCount:
              insertedRow?.querySelectorAll(
                '.erp-engineering-print-image-slot img'
              ).length || 0,
            insertedNoteCount:
              insertedRow?.querySelectorAll(
                '.erp-work-instruction-paper__annotation-note'
              ).length || 0,
            insertedCalloutCount:
              insertedRow?.querySelectorAll(
                '.erp-work-instruction-paper__annotation-callouts line'
              ).length || 0,
            insertedSelected: insertedRow?.classList.contains(
              'erp-engineering-print-row--selected'
            ),
            shiftedAnnotationNo: String(
              shiftedAnnotationRow?.querySelector(
                '.erp-work-instruction-paper__step-no'
              )?.textContent || ''
            ).trim(),
            shiftedAnnotationStillAnnotated:
              shiftedAnnotationRow?.classList.contains(
                'erp-work-instruction-paper__step-row--annotated'
              ) || false,
            shiftedAnnotationCalloutCount:
              shiftedAnnotationRow?.querySelectorAll(
                '.erp-work-instruction-paper__annotation-callouts line'
              ).length || 0,
          }
        })
        assert.deepEqual(
          instructionInsertState.rows,
          ['1', '2', '3', '1', '1', '2'],
          `作业指导书插行后应按小模块重编行号: ${JSON.stringify(instructionInsertState)}`
        )
        assert(
          /^3$/u.test(instructionInsertState.insertedText) &&
            instructionInsertState.selectedSourceHeightVar === '11.6mm' &&
            instructionInsertState.insertedHeightVar === '11.6mm' &&
            instructionInsertState.insertedPixelHeight >= 40 &&
            instructionInsertState.insertedPixelHeight <= 50 &&
            instructionInsertState.insertedImageCount === 0 &&
            instructionInsertState.insertedNoteCount === 0 &&
            instructionInsertState.insertedCalloutCount === 0 &&
            instructionInsertState.insertedSelected &&
            instructionInsertState.shiftedAnnotationNo === '1' &&
            !instructionInsertState.shiftedAnnotationStillAnnotated &&
            instructionInsertState.shiftedAnnotationCalloutCount === 0,
          `作业指导书下插应在已选编号行后插入同高空白普通行，不复制图片或批注: ${JSON.stringify(instructionInsertState)}`
        )
        assert.equal(
          await page
            .locator(
              '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
            )
            .count(),
          instructionRowsBefore + 1,
          '作业指导书下插一行应新增作业行'
        )
        await page
          .locator('.erp-print-shell__toolbar-group')
          .first()
          .getByRole('button', { name: '移除当前行' })
          .click()
        assert.equal(
          await page
            .locator(
              '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
            )
            .count(),
          instructionRowsBefore,
          '作业指导书移除当前作业行后行数应恢复'
        )
        const instructionMainBodyRowSelector =
          '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__section-title-row, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__text-row, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
        const firstTitleRow = page
          .locator(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__section-title-row'
          )
          .first()
        await firstTitleRow.dispatchEvent('mousedown', {
          bubbles: true,
          cancelable: true,
        })
        const titleSelectionFromCellTextState = await page.evaluate(() => {
          const row = document.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__section-title-row'
          )
          const editor = row?.querySelector(
            'td > .erp-engineering-print-editable'
          )
          return {
            selected: row?.classList.contains(
              'erp-engineering-print-row--selected'
            ),
            activeIsEditor: document.activeElement === editor,
            activeIsContentEditable:
              document.activeElement?.getAttribute('contenteditable') ===
              'true',
            text: String(editor?.textContent || '').trim(),
          }
        })
        assert(
          titleSelectionFromCellTextState.selected &&
            !titleSelectionFromCellTextState.activeIsEditor &&
            !titleSelectionFromCellTextState.activeIsContentEditable &&
            titleSelectionFromCellTextState.text.length > 0,
          `作业指导书选择模式点击标题行应选中行而不是进入编辑: ${JSON.stringify(titleSelectionFromCellTextState)}`
        )
        toolbarGroups = await collectToolbarGroups()
        assert.equal(
          toolbarGroups[0].buttons[6].disabled,
          true,
          '作业指导书标题行选中后，给当前行加图仍应禁用'
        )
        await page.getByRole('button', { name: '设为文本行' }).click()
        await page.waitForFunction(() =>
          Boolean(
            document.querySelector(
              '.erp-work-instruction-paper__text-row.erp-engineering-print-row--selected'
            )
          )
        )
        await page.getByRole('button', { name: '设为标题行' }).click()
        await page.waitForFunction(() =>
          Boolean(
            document.querySelector(
              '.erp-work-instruction-paper__section-title-row.erp-engineering-print-row--selected'
            )
          )
        )
        const instructionBodyRowsBefore = await page
          .locator(instructionMainBodyRowSelector)
          .count()
        await page.getByRole('button', { name: '下插一行' }).click()
        assert.equal(
          await page.locator(instructionMainBodyRowSelector).count(),
          instructionBodyRowsBefore + 1,
          '作业指导书标题行下插一行应新增统一正文行'
        )
        const titleInsertHeightState = await page.evaluate(() => {
          const insertedRow = document.querySelector(
            '.erp-work-instruction-paper__step-row--text.erp-engineering-print-row--selected, .erp-work-instruction-paper__step-row--image.erp-engineering-print-row--selected'
          )
          return {
            insertedRowHeightVar:
              insertedRow?.style.getPropertyValue(
                '--instruction-row-min-height'
              ) || '',
            insertedPixelHeight:
              insertedRow?.getBoundingClientRect().height || 0,
            insertedEditableText: String(
              insertedRow?.querySelector(
                '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
              )?.textContent || ''
            )
              .replace(/\s+/gu, '')
              .trim(),
            insertedHtml: String(
              insertedRow?.querySelector(
                '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
              )?.innerHTML || ''
            ),
            insertedNo: String(
              insertedRow?.querySelector('.erp-work-instruction-paper__step-no')
                ?.textContent || ''
            ).trim(),
            insertedImageCount:
              insertedRow?.querySelectorAll(
                '.erp-engineering-print-image-slot img'
              ).length || 0,
            insertedSelected: insertedRow?.classList.contains(
              'erp-engineering-print-row--selected'
            ),
          }
        })
        assert(
          titleInsertHeightState.insertedRowHeightVar === '11.6mm' &&
            titleInsertHeightState.insertedPixelHeight >= 40 &&
            titleInsertHeightState.insertedPixelHeight <= 54 &&
            titleInsertHeightState.insertedEditableText === '' &&
            !/amp|nbsp/u.test(titleInsertHeightState.insertedEditableText) &&
            !/amp;amp|amp;nbsp/u.test(titleInsertHeightState.insertedHtml) &&
            titleInsertHeightState.insertedNo.length > 0 &&
            titleInsertHeightState.insertedImageCount === 0 &&
            titleInsertHeightState.insertedSelected,
          `作业指导书标题行后新增行应继承相邻普通文本行高，但不复制图片或转义占位: ${JSON.stringify(titleInsertHeightState)}`
        )
        await page.getByRole('button', { name: '移除当前行' }).click()
        assert.equal(
          await page.locator(instructionMainBodyRowSelector).count(),
          instructionBodyRowsBefore,
          '作业指导书移除标题行后新增行后行数应恢复'
        )
        await assertNoHorizontalOverflow(
          page,
          'engineering-print-workspace-row-buttons'
        )
      },
    },
    {
      name: 'engineering-material-detail-long-value-wrap',
      path: '/erp/print-workspace/engineering-material-detail?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        await page.locator('.erp-material-detail-paper').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await assertMaterialDetailLineCellsWrapLongValues(page)
      },
    },
    {
      name: 'print-workspace-all-template-appendix-images',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1600, height: 1600 },
      verify: async (page) => {
        const templates = [
          {
            key: 'material-purchase-contract',
            title: '采购合同',
            paperSelector: '.erp-material-contract-paper',
          },
          {
            key: 'processing-contract',
            title: '加工合同',
            paperSelector: '.erp-processing-contract-paper',
          },
          {
            key: 'engineering-material-detail',
            title: '物料分析明细表',
            paperSelector: '.erp-material-detail-paper',
          },
          {
            key: 'engineering-color-card',
            title: '色卡',
            paperSelector: '.erp-color-card-paper',
          },
          {
            key: 'engineering-work-instruction',
            title: '作业指导书',
            paperSelector: '.erp-work-instruction-paper',
          },
        ]

        for (const [templateIndex, template] of templates.entries()) {
          if (templateIndex > 0) {
            await gotoScenarioPath(page, `/erp/print-workspace/${template.key}`)
          }
          await page.locator(template.paperSelector).first().waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await expectText(page, template.title)
          await page
            .locator('[data-print-appendix-manager]')
            .waitFor({ state: 'visible', timeout: 10_000 })

          const firstBatch = createAppendixSVGFiles(template.key, 1, 5)
          const firstBatchNames = firstBatch.map((file) => file.name)
          await page
            .locator('[data-print-appendix-input]')
            .setInputFiles(firstBatch)
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 5,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: template.title,
            paperSelector: template.paperSelector,
            expectedNames: firstBatchNames,
          })
          const appendix = page
            .locator(`${template.paperSelector} [data-print-appendix-images]`)
            .first()
          await appendix.scrollIntoViewIfNeeded()
          await appendix.screenshot({
            path: path.join(
              outputDir,
              `print-workspace-${template.key}-appendix-five.png`
            ),
          })

          const longImage = createAppendixSVGFile(template.key, {
            index: 50,
            width: 640,
            height: 3200,
            label: 'Long appendix',
          })
          const namesWithLongImage = [...firstBatchNames, longImage.name]
          await page
            .locator('[data-print-appendix-input]')
            .setInputFiles([longImage])
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 6,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}长图自动整行`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          if (templateIndex !== 0) {
            await page.getByRole('button', { name: '移除末尾图片 6' }).click()
            await waitForPrintAppendixImageCount(page, {
              paperSelector: template.paperSelector,
              expectedCount: 5,
            })
            continue
          }

          await page
            .locator('[data-print-appendix-manager-item]')
            .nth(5)
            .screenshot({
              path: path.join(
                outputDir,
                'print-workspace-appendix-layout-controls.png'
              ),
            })
          const longImageItem = page
            .locator(
              `${template.paperSelector} [data-print-appendix-image-name="${longImage.name}"]`
            )
            .first()
          await longImageItem
            .locator('[data-print-appendix-segment="1"]')
            .screenshot({
              path: path.join(
                outputDir,
                'print-workspace-appendix-long-first-segment.png'
              ),
            })

          await page
            .getByRole('button', { name: '将末尾图片 6 设为半宽' })
            .click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}长图手动半宽`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'half'],
            expectedRequestedLayouts: [
              'auto',
              'auto',
              'auto',
              'auto',
              'auto',
              'half',
            ],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          await page
            .getByRole('button', { name: '将末尾图片 6 设为整行' })
            .click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}长图手动整行`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedRequestedLayouts: [
              'auto',
              'auto',
              'auto',
              'auto',
              'auto',
              'full',
            ],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })

          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.locator(template.paperSelector).first().waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 6,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}手动整行刷新恢复`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedRequestedLayouts: [
              'auto',
              'auto',
              'auto',
              'auto',
              'auto',
              'full',
            ],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          await page
            .getByRole('button', { name: '将末尾图片 6 设为自动' })
            .click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}恢复自动排版`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          await page.emulateMedia({ media: 'print' })
          const printSegmentMetrics = await page
            .locator(
              `${template.paperSelector} [data-print-appendix-image-name="${longImage.name}"]`
            )
            .evaluate((item) => ({
              segmentBreaks: Array.from(
                item.querySelectorAll('[data-print-appendix-segment]')
              ).map((segment) => window.getComputedStyle(segment).breakBefore),
              managerDisplay: window.getComputedStyle(
                document.querySelector('[data-print-appendix-manager]')
              ).display,
            }))
          assert(
            printSegmentMetrics.managerDisplay === 'none' &&
              printSegmentMetrics.segmentBreaks
                .slice(1)
                .every((value) => value === 'page'),
            `超长图后续片段应逐页输出且管理区不进入打印件: ${JSON.stringify(
              printSegmentMetrics
            )}`
          )
          await page.emulateMedia({ media: 'screen' })
          await page.getByRole('button', { name: '移除末尾图片 6' }).click()
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 5,
          })

          await page.getByRole('button', { name: '将末尾图片 2 前移' }).click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}前移`,
            paperSelector: template.paperSelector,
            expectedNames: [
              firstBatchNames[1],
              firstBatchNames[0],
              ...firstBatchNames.slice(2),
            ],
          })
          await page.getByRole('button', { name: '将末尾图片 1 后移' }).click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}后移`,
            paperSelector: template.paperSelector,
            expectedNames: firstBatchNames,
          })

          await page.getByRole('button', { name: '移除末尾图片 3' }).click()
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 4,
          })
          const namesAfterRemove = [
            ...firstBatchNames.slice(0, 2),
            ...firstBatchNames.slice(3),
          ]
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}移除`,
            paperSelector: template.paperSelector,
            expectedNames: namesAfterRemove,
          })

          const additionalBatch = createAppendixSVGFiles(template.key, 6, 5)
          const nineImageNames = [
            ...namesAfterRemove,
            ...additionalBatch.map((file) => file.name),
          ]
          await page
            .locator('[data-print-appendix-input]')
            .setInputFiles(additionalBatch)
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 9,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}九张`,
            paperSelector: template.paperSelector,
            expectedNames: nineImageNames,
          })

          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.locator(template.paperSelector).first().waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 9,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}刷新恢复`,
            paperSelector: template.paperSelector,
            expectedNames: nineImageNames,
          })
          const refreshedAppendix = page
            .locator(`${template.paperSelector} [data-print-appendix-images]`)
            .first()
          await refreshedAppendix.scrollIntoViewIfNeeded()
          await refreshedAppendix.screenshot({
            path: path.join(
              outputDir,
              `print-workspace-${template.key}-appendix-nine-refreshed.png`
            ),
          })
        }
      },
    },
    {
      name: 'print-workspace-all-template-long-business-values',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        const templates = [
          {
            key: 'material-purchase-contract',
            title: '采购合同',
            paperSelector: '.erp-material-contract-paper',
          },
          {
            key: 'processing-contract',
            title: '加工合同',
            paperSelector: '.erp-processing-contract-paper',
          },
          {
            key: 'engineering-material-detail',
            title: '物料分析明细表',
            paperSelector: '.erp-material-detail-paper',
          },
          {
            key: 'engineering-color-card',
            title: '色卡',
            paperSelector: '.erp-color-card-paper',
          },
          {
            key: 'engineering-work-instruction',
            title: '作业指导书',
            paperSelector: '.erp-work-instruction-paper',
          },
        ]

        for (const [index, template] of templates.entries()) {
          if (index > 0) {
            await gotoScenarioPath(
              page,
              `/erp/print-workspace/${template.key}?draft=fresh`
            )
          }
          await page.locator(template.paperSelector).waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await expectText(page, template.title)
          await assertPrintTemplateLongBusinessValuesStayInsidePaper(page, {
            paperSelector: template.paperSelector,
            scenarioLabel: template.title,
            screenshotName: `print-workspace-${template.key}-long-business-values`,
          })
          await assertNoHorizontalOverflow(
            page,
            `print-workspace-${template.key}-long-business-values`
          )
        }
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
      name: 'print-workspace-engineering-preview-popups',
      path: '/erp/print-workspace/engineering-material-detail?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const templates = [
          {
            key: 'engineering-material-detail',
            title: '物料分析明细表',
            screenshotName:
              'print-workspace-engineering-material-detail-preview-popup-window',
          },
          {
            key: 'engineering-color-card',
            title: '色卡',
            screenshotName:
              'print-workspace-engineering-color-card-preview-popup-window',
          },
          {
            key: 'engineering-work-instruction',
            title: '作业指导书',
            screenshotName:
              'print-workspace-engineering-work-instruction-preview-popup-window',
          },
        ]

        for (const [index, template] of templates.entries()) {
          if (index > 0) {
            await page.goto(
              new URL(
                `/erp/print-workspace/${template.key}?draft=fresh`,
                page.url()
              ).toString(),
              {
                waitUntil: 'domcontentloaded',
              }
            )
          }
          await assertPrintPreviewPopup(page, {
            buttonName: '在线预览 PDF',
            title: template.title,
            screenshotName: template.screenshotName,
          })
        }
      },
    },
    {
      name: 'business-menu-groups-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectButton(page, '新建订单')
        await expectText(page, '当前操作')
        await expectText(page, '订单明细')
        await expectText(page, '工作台')
        await expectText(page, '任务看板')
        await expectText(page, '业务看板')
        await expectText(page, '基础资料')
        await expectText(page, '客户档案')
        await expectText(page, '供应商档案')
        await expectText(page, '产品档案')
        await expectText(page, '销售管理')
        await expectText(page, '销售订单')
        await expectText(page, '产品工程')
        await expectText(page, '物料清单（BOM）')
        await expectText(page, '采购管理')
        await expectText(page, '采购订单')
        await expectText(page, '质检管理')
        await expectText(page, '质量检验')
        await expectText(page, '库存管理')
        await expectText(page, '入库管理')
        await expectText(page, '库存台账')
        await expectText(page, '委外管理')
        await expectText(page, '委外订单')
        await expectText(page, '生产管理')
        await expectText(page, '生产排程')
        await expectText(page, '生产异常')
        await expectText(page, '出货管理')
        await expectText(page, '出货放行')
        await expectText(page, '财务管理')
        await expectText(page, '应收管理')
        await expectText(page, '导出筛选结果')
        await expectText(page, '列顺序')
        await expectText(page, '运营工具')
        await expectText(page, '模板打印中心')
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
          await menu.getByText('异常处理', { exact: true }).count(),
          0,
          '侧栏不应再显示已并入工作台和任务看板的“异常处理”入口'
        )
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
        await expectText(page, '使用帮助')
        await expectText(page, '岗位使用帮助')
        assert.equal(
          await page.getByText('高级文档', { exact: true }).count(),
          0,
          '侧栏不应再显示“高级文档”入口'
        )
      },
    },
    {
      name: 'print-template-business-entry-ownership',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '物料清单（BOM）')
        await expectText(page, '当前操作')
        for (const label of ['打印物料明细', '打印色卡', '打印作业指导书']) {
          await expectButton(page, label)
        }
        const bomActionMetrics = await page.evaluate(() => {
          const bar = document.querySelector(
            '.erp-business-selection-action-bar__actions'
          )
          const buttons = Array.from(bar?.querySelectorAll('button') || []).map(
            (button) => ({
              text: String(button.textContent || '')
                .replace(/\s+/g, ' ')
                .trim(),
              disabled: button.disabled,
            })
          )
          return {
            found: Boolean(bar),
            clientWidth: bar?.clientWidth || 0,
            scrollWidth: bar?.scrollWidth || 0,
            buttons,
          }
        })
        assert(
          bomActionMetrics.found &&
            bomActionMetrics.scrollWidth <= bomActionMetrics.clientWidth + 1,
          `BOM 当前操作区应容纳三套工程资料打印入口: ${JSON.stringify(
            bomActionMetrics
          )}`
        )

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        await expectButton(page, '加工合同打印')
        await expectButton(page, '作业指导书打印')
        const outsourcingActionMetrics = await page.evaluate(() => {
          const bar = document.querySelector(
            '.erp-business-selection-action-bar__actions'
          )
          return {
            found: Boolean(bar),
            text: String(bar?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            clientWidth: bar?.clientWidth || 0,
            scrollWidth: bar?.scrollWidth || 0,
          }
        })
        assert(
          outsourcingActionMetrics.found &&
            outsourcingActionMetrics.text.includes('加工合同打印') &&
            outsourcingActionMetrics.text.includes('作业指导书打印') &&
            outsourcingActionMetrics.scrollWidth <=
              outsourcingActionMetrics.clientWidth + 1,
          `委外当前操作区应容纳加工合同和作业指导书打印入口: ${JSON.stringify(
            outsourcingActionMetrics
          )}`
        )
        await assertNoHorizontalOverflow(
          page,
          'print-template-business-entry-ownership'
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
    {
      name: 'material-master-header-desktop',
      path: '/erp/master/materials',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
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
          expectedLabels: ['总材料', '本页显示', '启用材料'],
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
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        purchaseOrderMaterialReferenceAttempts = 0
        purchaseOrderMaterialReferenceMode = 'pending'
        purchaseOrderMaterialReferenceCounts = {
          pending: 0,
          fail: 0,
          empty: 0,
          full: 0,
        }
        purchaseOrderPendingReferenceRequests = 0
        purchaseOrderPendingReferenceReleased = false
        const initialStarted = createDeferred()
        const initialRelease = createDeferred()
        const pendingDrained = createDeferred()
        const failedRefreshSettled = createDeferred()
        const emptyRefreshSettled = createDeferred()
        const fullRefreshSettled = createDeferred()
        purchaseOrderInitialReferenceStarted = initialStarted.promise
        purchaseOrderPendingReferenceDrained = pendingDrained.promise
        purchaseOrderFailedRefreshSettled = failedRefreshSettled.promise
        purchaseOrderEmptyRefreshSettled = emptyRefreshSettled.promise
        purchaseOrderFullRefreshSettled = fullRefreshSettled.promise

        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_materials') {
            await route.fallback()
            return
          }

          purchaseOrderMaterialReferenceAttempts += 1
          const mode = purchaseOrderMaterialReferenceMode
          purchaseOrderMaterialReferenceCounts[mode] =
            Number(purchaseOrderMaterialReferenceCounts[mode] || 0) + 1
          if (mode === 'full') {
            try {
              await route.fallback()
            } finally {
              fullRefreshSettled.resolve()
            }
            return
          }

          let result
          if (mode === 'pending') {
            purchaseOrderPendingReferenceRequests += 1
            initialStarted.resolve()
            await initialRelease.promise
            result = {
              code: 0,
              message: 'OK',
              data: { materials: [], total: 0, limit: 200, offset: 0 },
            }
          } else if (mode === 'fail') {
            result = {
              code: RpcErrorCode.INTERNAL,
              message: '采购材料资料暂时不可用',
              data: {},
            }
          } else {
            result = {
              code: 0,
              message: 'OK',
              data: { materials: [], total: 0, limit: 200, offset: 0 },
            }
          }

          try {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id || 'mock-id',
                result,
              }),
            })
          } catch (error) {
            if (mode !== 'pending') throw error
          } finally {
            if (mode === 'pending') {
              purchaseOrderPendingReferenceRequests -= 1
              if (
                purchaseOrderPendingReferenceReleased &&
                purchaseOrderPendingReferenceRequests === 0
              ) {
                pendingDrained.resolve()
              }
            }
            if (mode === 'fail') failedRefreshSettled.resolve()
            if (mode === 'empty') emptyRefreshSettled.resolve()
          }
        })
        releasePurchaseOrderInitialReference = () => {
          purchaseOrderPendingReferenceReleased = true
          initialRelease.resolve()
          if (purchaseOrderPendingReferenceRequests === 0) {
            pendingDrained.resolve()
          }
        }
      },
      verify: async (page) => {
        await expectHeading(page, '采购订单')
        await expectText(page, '下单日期')
        await expectText(page, '预计到货日期')
        await expectText(page, '新建采购订单')
        await purchaseOrderInitialReferenceStarted
        const createButton = page
          .locator('button.erp-business-list-toolbar__primary-action')
          .filter({ hasText: '新建采购订单' })
          .first()
        const refreshButton = page
          .locator('.erp-admin-header button')
          .filter({ hasText: '刷新当前页' })
          .first()
        await createButton.waitFor({ state: 'visible', timeout: 10_000 })
        await refreshButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await createButton.isDisabled(),
          true,
          '采购基础资料尚在加载时，新建入口必须 fail-closed'
        )
        assert.equal(
          await page
            .locator('.erp-business-action-modal--form.ant-modal:visible')
            .count(),
          0,
          '采购基础资料尚在加载时不应打开空白采购订单弹窗'
        )

        purchaseOrderMaterialReferenceMode = 'fail'
        await refreshButton.click()
        await purchaseOrderFailedRefreshSettled
        releasePurchaseOrderInitialReference()
        await purchaseOrderPendingReferenceDrained
        await refreshButton.waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          (button) => Boolean(button && !button.disabled),
          await refreshButton.elementHandle()
        )
        assert.equal(
          await createButton.isDisabled(),
          true,
          '后发参考资料请求失败后，已取消的旧请求不得把页面改回 ready'
        )
        assert.equal(
          await page.locator('.ant-message-success:visible').count(),
          0,
          '采购参考资料刷新失败时不得误报“当前页面数据已刷新”'
        )
        purchaseOrderMaterialReferenceMode = 'empty'
        await refreshButton.click()
        await purchaseOrderEmptyRefreshSettled
        await page.waitForFunction(
          (button) => Boolean(button && !button.disabled),
          await refreshButton.elementHandle()
        )
        const emptyReferenceButtonState = await createButton.evaluate(
          (button) => ({
            disabled: button.disabled,
            title: button.getAttribute('title'),
            text: String(button.textContent || '').trim(),
          })
        )
        assert.equal(
          emptyReferenceButtonState.disabled,
          false,
          `成功空集合应恢复新建入口: ${JSON.stringify(
            emptyReferenceButtonState
          )}`
        )
        assert.equal(
          purchaseOrderMaterialReferenceCounts.empty,
          1,
          '成功返回空材料集合应完成参考资料加载，不能被误判为请求失败'
        )

        purchaseOrderMaterialReferenceMode = 'full'
        await refreshButton.click()
        await purchaseOrderFullRefreshSettled
        await page.waitForFunction(
          (button) => Boolean(button && !button.disabled),
          await refreshButton.elementHandle()
        )
        assert(
          purchaseOrderMaterialReferenceCounts.full >= 1 &&
            purchaseOrderMaterialReferenceAttempts >= 4,
          '再次刷新应恢复完整材料参考资料，供来源导入继续使用'
        )
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'purchase-order-date-filter-desktop',
          expectedLabels: ['总订单', '本页显示', '已审核'],
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
            '合同订购方信息',
            '订购单位',
            '订购人',
            '订购方电话',
            '公司地址',
            '订购方签字人',
            '采购明细',
            '从材料库添加明细',
            '已录入',
            '数量合计',
            '金额合计',
          ],
          afterOpen: async (modal) => {
            await verifySourceImportPicker(page, {
              parentModal: modal,
              triggerButton: '从材料库添加',
              titleText: '选择材料添加采购明细',
              expectedTexts: ['材料编码', '材料名称', 'MAT-STYLE-L1'],
              emptyDescriptionText: '暂无可选材料',
              collapseSelectTexts: [
                'MAT-STYLE-L1',
                'MAT-STYLE-L2',
                'MAT-STYLE-L3',
                'MAT-STYLE-L4',
                'MAT-STYLE-L5',
                'MAT-STYLE-L6',
              ],
              selectText: 'MAT-STYLE-L1',
              selectedNoun: '材料',
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
      effectiveSession: customerRuntimeEffectiveSession,
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
      name: 'processing-contract-form-modal-title-desktop',
      path: '/erp/purchase/processing-contracts',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-processing-contract-form',
        configHash: 'style-l1-processing-contract-form-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['processing-contracts'],
        actions: [
          'outsourcing.order.read',
          'outsourcing.order.create',
          'outsourcing.order.update',
          'outsourcing.order.confirm',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '委外订单')
        const createActionMetrics = await page.evaluate(() => ({
          bodyText: String(document.body?.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 1200),
          buttons: Array.from(document.querySelectorAll('button')).map(
            (button) => ({
              text: String(button.textContent || '')
                .replace(/\s+/g, ' ')
                .trim(),
              disabled: button.disabled,
            })
          ),
        }))
        assert(
          createActionMetrics.buttons.some(
            (button) => button.text === '新建加工合同' && !button.disabled
          ),
          `加工合同页应展示可用的新建入口: ${JSON.stringify(createActionMetrics)}`
        )
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建加工合同',
          titleText: '新建加工合同',
          minFieldCount: 6,
          screenshotName: 'business-v1-outsourcing-order-title-form-modal',
          expectedTexts: [
            '合同委托方信息',
            '委托单位',
            '委托人',
            '委托方电话',
            '公司地址',
            '委托方签字人',
            '加工合同号',
            '加工厂',
            '加工明细',
            '同一份加工合同内维护产品、工序、数量、单价和预计回货。',
            '来源产品订单编号',
            '加工项目',
            '工序',
            '单位',
          ],
          afterOpen: async (modal) => {
            await assertOutsourcingProcessSelectOptions(page, modal, {
              scenarioName: 'processing-contract-form-modal-title-desktop',
            })
            const productInput = modal
              .locator('input[id$="_product_id"]')
              .first()
            await productInput.click()
            await page
              .locator(
                '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
              )
              .filter({ hasText: /^PROD-STYLE-L1 \/ 样式产品$/u })
              .first()
              .click()
            const productSKUInput = modal
              .locator('input[id$="_product_sku_id"]')
              .first()
            await productSKUInput.click()
            await productSKUInput.fill('SKU-OUTSOURCE-CATALOG-L1')
            const secondPageSKUOption = page
              .locator(
                '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
              )
              .filter({ hasText: 'SKU-OUTSOURCE-CATALOG-L1' })
              .first()
            await secondPageSKUOption.waitFor({
              state: 'visible',
              timeout: 10_000,
            })
            assert(
              String((await secondPageSKUOption.innerText()) || '').includes(
                'SKU-OUTSOURCE-CATALOG-L1'
              ),
              '加工合同表单必须读到第二页的产品规格选项'
            )
            await productSKUInput.press('Escape')
            const subjectTypeField = modal
              .locator('.ant-form-item')
              .filter({ hasText: '加工品类' })
              .first()
            await subjectTypeField.locator('.ant-select-selector').click()
            await page
              .locator(
                '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
              )
              .filter({ hasText: '材料（布料加工等）' })
              .first()
              .click()
            const materialInput = modal
              .locator('input[id$="_material_id"]')
              .first()
            await materialInput.waitFor({ state: 'visible', timeout: 10_000 })
            await materialInput.click()
            await materialInput.press('ArrowDown')
            await materialInput.press('Enter')
            await modal.locator('input[id$="_unit_price"]').first().click()
            await page.waitForFunction(
              () =>
                document.querySelectorAll(
                  '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
                ).length === 0
            )
            await page.waitForTimeout(350)
            assert.equal(
              await modal.getByText('产品 / 半成品', { exact: true }).count(),
              0,
              '材料加工态不应继续显示产品选择字段'
            )
            const materialRowMetrics = await modal
              .locator('.erp-sales-order-lines-form__row')
              .first()
              .evaluate((row) => ({
                found: true,
                clientWidth: row.clientWidth,
                scrollWidth: row.scrollWidth,
                text: String(row.textContent || '')
                  .replace(/\s+/g, ' ')
                  .trim(),
              }))
            assert(
              materialRowMetrics.found &&
                materialRowMetrics.scrollWidth <=
                  materialRowMetrics.clientWidth + 1 &&
                materialRowMetrics.text.includes('材料（布料加工等）') &&
                materialRowMetrics.text.includes('MAT-STYLE-L') &&
                materialRowMetrics.text.includes('样式材料'),
              `材料加工行应完整显示并不溢出: ${JSON.stringify(
                materialRowMetrics
              )}`
            )
            await page.screenshot({
              path: path.join(
                outputDir,
                'processing-contract-material-subject-form.png'
              ),
              fullPage: true,
            })
            const titleMetrics = await modal
              .locator('.erp-sales-order-lines-form__head strong')
              .filter({ hasText: '加工明细' })
              .first()
              .evaluate((node) => {
                const style = window.getComputedStyle(node)
                return {
                  text: node.textContent?.trim() || '',
                  fontWeight: style.fontWeight,
                }
              })
            assert(
              Number.parseInt(titleMetrics.fontWeight, 10) >= 700,
              `加工合同明细标题应和采购明细一样加粗: ${JSON.stringify(
                titleMetrics
              )}`
            )
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'processing-contract-form-modal-title-desktop',
            })
          },
        })
        await assertNoHorizontalOverflow(
          page,
          'processing-contract-form-modal-title-desktop'
        )
      },
    },
    {
      name: 'business-collaboration-supplier-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-collaboration-supplier-desktop 未选中记录时不应展示空的任务面板'
        )
        await page
          .locator('.ant-table-row')
          .filter({ hasText: '样式供应商' })
          .first()
          .click()
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-collaboration-supplier-desktop 选中供应商后也不应展示无真实任务来源的面板'
        )
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
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['purchase', 'finance'],
          'workflow.task.update': ['purchase', 'finance'],
        },
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await seedBusinessCollaborationOverflowTasks(page, {
          sourceType: 'accessories-purchase',
          currentSourceID: 1,
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '采购订单')
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-collaboration-purchase-selected-desktop 未选中采购订单时不应展示任务面板'
        )
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
          checkDesktopResize: false,
          checkResizeHandleHover: false,
          expectedOverflowNote: '仅显示前 6 条，还有 2 条',
          expectedTabTexts: ['当前记录8', '阻塞异常3'],
        })
        await assertNoHorizontalOverflow(
          page,
          'business-collaboration-purchase-selected-desktop'
        )

        await seedBusinessCollaborationOverflowTasks(page, {
          sourceType: 'processing-contracts',
          currentSourceID: 1,
          currentSourceNo: 'SIM-OUTSOURCE-CONTRACT-L1',
          currentTaskLabel: '当前加工合同',
        })
        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-collaboration-purchase-selected-desktop 未选中加工合同时不应展示任务面板'
        )
        await page
          .locator('.erp-business-data-table-card .ant-table-tbody tr')
          .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
          .first()
          .click()
        await assertBusinessCollaborationPanelCollapsedByDefault(page, {
          scenarioName:
            'business-collaboration-processing-contract-selected-desktop',
          checkDesktopResize: false,
          checkResizeHandleHover: false,
          expectedOverflowNote: '仅显示前 6 条，还有 2 条',
          expectedTabTexts: ['当前记录8', '阻塞异常3'],
        })
        await assertNoHorizontalOverflow(
          page,
          'business-collaboration-processing-contract-selected-desktop'
        )
      },
    },
    {
      name: 'shipment-date-filter-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
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
          expectedLabels: ['总出货单', '本页显示', '草稿'],
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'shipment-date-filter-desktop',
        })
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'shipment-date-filter-desktop',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'shipment-date-filter-desktop',
          unsortableHeaders: ['实际 / 最终总净重（克）', '备注'],
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
      effectiveSession: customerRuntimeEffectiveSession,
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
      path: '/erp/purchase/accessories',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['purchase', 'finance'],
          'workflow.task.update': ['purchase', 'finance'],
        },
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await seedBusinessCollaborationOverflowTasks(page, {
          sourceType: 'accessories-purchase',
          currentSourceID: 1,
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '采购订单')
        assert.equal(
          await page.locator('.erp-business-collaboration-task-panel').count(),
          0,
          'business-collaboration-mobile 未选中采购订单时不应展示任务面板'
        )
        const purchaseOrderRow = page
          .locator('.erp-business-data-table-card .ant-table-tbody tr')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
        await purchaseOrderRow.getByRole('radio').check()
        await purchaseOrderRow.waitFor({ state: 'visible', timeout: 10_000 })
        assert(
          String((await purchaseOrderRow.getAttribute('class')) || '').includes(
            'ant-table-row-selected'
          ),
          'business-collaboration-mobile 选择采购订单后主表应进入选中态'
        )
        await assertBusinessCollaborationPanelCollapsedByDefault(page, {
          scenarioName: 'business-collaboration-mobile',
          checkDesktopResize: false,
          checkResizeHandleHover: false,
          expectedOverflowNote: '仅显示前 6 条，还有 2 条',
          expectedTabTexts: ['当前记录8', '阻塞异常3'],
        })
        await assertResponsiveSelectionActionBar(page, {
          scenarioName: 'business-collaboration-mobile',
          maxVisibleActions: 1,
        })
        await assertNoHorizontalOverflow(page, 'business-collaboration-mobile')
      },
    },
    {
      name: 'business-selection-actions-phone-320',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 320, height: 760 },
      verify: async (page) => {
        await expectHeading(page, '供应商档案')
        await page
          .locator('.ant-table-row')
          .filter({ hasText: '样式供应商' })
          .first()
          .click()
        await assertResponsiveSelectionActionBar(page, {
          scenarioName: 'business-selection-actions-phone-320',
          maxVisibleActions: 1,
        })
        await assertNoHorizontalOverflow(
          page,
          'business-selection-actions-phone-320'
        )
      },
    },
    {
      name: 'business-selection-actions-tablet-820',
      path: '/erp/purchase/accessories',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 820, height: 1180 },
      verify: async (page) => {
        await expectHeading(page, '采购订单')
        await page
          .locator('.erp-business-data-table-card .ant-table-tbody tr')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
          .click()
        await assertResponsiveSelectionActionBar(page, {
          scenarioName: 'business-selection-actions-tablet-820',
          maxVisibleActions: 2,
        })
        await assertNoHorizontalOverflow(
          page,
          'business-selection-actions-tablet-820'
        )
      },
    },
    {
      name: 'business-selection-actions-landscape-1024',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1024, height: 768 },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        const metrics = await page
          .locator('.erp-business-selection-action-bar__actions')
          .first()
          .evaluate((element) => ({
            compact: element.classList.contains(
              'erp-business-selection-action-bar__actions--compact'
            ),
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
            buttons: Array.from(element.querySelectorAll('button')).map(
              (button) => {
                const rect = button.getBoundingClientRect()
                const style = window.getComputedStyle(button)
                return {
                  text: String(button.textContent || '')
                    .replace(/\s+/gu, ' ')
                    .trim(),
                  width: rect.width,
                  height: rect.height,
                  writingMode: style.writingMode,
                }
              }
            ),
          }))
        assert.equal(
          metrics.compact,
          false,
          `1024px 应进入紧凑桌面布局而不是手机动作面板: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.scrollWidth <= metrics.clientWidth + 1 &&
            metrics.buttons.every(
              (item) =>
                item.width >= 36 &&
                item.height >= 30 &&
                !item.writingMode.startsWith('vertical')
            ),
          `1024px 当前操作应可读且无断点溢出: ${JSON.stringify(metrics)}`
        )
        await assertNoHorizontalOverflow(
          page,
          'business-selection-actions-landscape-1024'
        )
      },
    },
    {
      name: 'textarea-show-count-layout-desktop',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
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
    ...createWorkflowSourceTaskScenarios({
      assert,
      expectHeading,
      expectText,
      gotoScenarioPath,
      outputDir,
      path,
      waitForPath,
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
