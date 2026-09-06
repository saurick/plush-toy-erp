import { Buffer } from 'node:buffer'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'

export function createBusinessFormInteractionScenarios({
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
}) {
  const {
    assertLineItemAddActionScrollsToNewRow,
    assertLineQuantityUnitSuffix,
  } = createLineItemUnitAssertions({
    assert,
  })
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
  return [
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
          const purchaseOrderReceiptProgress = {
            purchase_order_id: 1,
            purchase_order_no: 'PO-STYLE-L1',
            lifecycle_status: 'approved',
            items: [
              {
                purchase_order_item_id: 1,
                line_no: 1,
                material_id: 1,
                material_code: 'MAT-STYLE-L1',
                material_name: '样式材料',
                unit_id: 1,
                unit_code: 'PCS',
                unit_name: '件',
                line_status: 'open',
                purchased_quantity: '20',
                effective_received_quantity: '5.000001',
                draft_reserved_quantity: '2.000002',
                remaining_receivable_quantity: '14.999999',
                remaining_generatable_quantity: '12.999997',
                can_generate: true,
                disabled_reason: '',
              },
              {
                purchase_order_item_id: 2,
                line_no: 2,
                material_id: 2,
                material_code: 'MAT-STYLE-L1-OVER',
                material_name: '草稿超占材料',
                unit_id: 1,
                unit_code: 'PCS',
                unit_name: '件',
                line_status: 'open',
                purchased_quantity: '10',
                effective_received_quantity: '8',
                draft_reserved_quantity: '5',
                remaining_receivable_quantity: '2',
                remaining_generatable_quantity: '0',
                can_generate: false,
                disabled_reason:
                  '现有入库草稿占用超过剩余可收数量，请先处理草稿',
              },
            ],
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
            case 'get_purchase_order_receipt_progress':
              data = {
                purchase_order_receipt_progress: purchaseOrderReceiptProgress,
              }
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
        for (const columnTitle of [
          '已过账入库',
          '草稿占用',
          '剩余可收',
          '剩余可生成',
          '本次生成',
          '不可生成原因',
        ]) {
          await expectText(page, columnTitle)
        }
        await expectText(page, '12.999997 件')
        await expectText(page, '现有入库草稿占用超过剩余可收数量，请先处理草稿')
        await assertTextAbsent(page, 'purchase_order_item_id')
        await assertNoHorizontalOverflow(
          page,
          'purchase-order-inbound-draft-modal-controls-desktop'
        )
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
        await expectHeading(page, '供应商与加工厂')
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
        await expectHeading(page, '供应商与加工厂')
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
        await expectHeading(page, '供应商与加工厂')
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建供应商',
          titleText: '新建供应商或加工厂',
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
    {
      name: 'exception-inventory-operation-dark-desktop',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      themeMode: 'dark',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'inventory'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'warehouse.adjustment.create',
        ],
      },
      viewport: { width: 1600, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await page.locator('.ant-table-row').first().click()
        const cycleCountButton = page
          .locator('button:visible')
          .filter({ hasText: /盘\s*点/u })
          .first()
        await cycleCountButton.waitFor({ state: 'visible', timeout: 10_000 })
        await cycleCountButton.click()
        await page
          .getByRole('dialog')
          .getByText('登记库存盘点', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '保存和过账时都会重新核对账面数量')
        await expectText(page, '盘点期间库存变化时')
        await page.screenshot({
          path: path.join(
            outputDir,
            'exception-inventory-operation-dark-desktop.png'
          ),
          fullPage: true,
        })
        await assertERPThemeMode(page, {
          scenarioName: 'exception-inventory-operation-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoHorizontalOverflow(
          page,
          'exception-inventory-operation-dark-desktop'
        )
      },
    },
    {
      name: 'exception-finance-payment-dark-desktop',
      path: '/erp/finance/payments',
      auth: 'admin',
      themeMode: 'dark',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'finance-payments'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'finance.payment.read',
          'finance.payment.create',
          'finance.payment.post',
          'finance.payment.reverse',
          'finance.credit_note.create',
          'finance.credit_note.reverse',
        ],
      },
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectHeading(page, '收付款与核销')
        await expectText(page, 'PAY-STYLE-L1')
        await expectText(page, '回单 STYLE-L1')
        await expectText(page, '暗色客户')
        await expectButton(page, '登记收付款')
        await expectButton(page, '导出筛选结果')
        await expectButton(page, '列顺序')
        const paymentExportButton = page.getByRole('button', {
          name: '导出筛选结果',
        })
        if (await paymentExportButton.isDisabled()) {
          await paymentExportButton.locator('xpath=..').hover()
          const disabledTooltip = page.locator('.ant-tooltip:visible').last()
          await disabledTooltip.waitFor({ state: 'visible', timeout: 10_000 })
          throw new Error(
            `收付款导出按钮未进入可用态：${String(
              await disabledTooltip.textContent()
            ).trim()}`
          )
        }
        await paymentExportButton.click({ trial: true })
        const [paymentExportDownload] = await Promise.all([
          page.waitForEvent('download'),
          paymentExportButton.click(),
        ])
        assert.match(
          paymentExportDownload.suggestedFilename(),
          /^收付款记录-\d{4}-\d{2}-\d{2}\.csv$/u
        )
        const paymentExportStream =
          await paymentExportDownload.createReadStream()
        assert(paymentExportStream, '收付款筛选结果应产生可读取的 CSV 下载')
        const paymentExportChunks = []
        for await (const chunk of paymentExportStream) {
          paymentExportChunks.push(chunk)
        }
        const paymentExportCSV =
          Buffer.concat(paymentExportChunks).toString('utf8')
        for (const text of [
          '收付款单号',
          '方向',
          '往来方',
          '状态',
          'PAY-STYLE-L1',
          '收款',
          '暗色客户',
          '已批准待核销',
        ]) {
          assert(
            paymentExportCSV.includes(text),
            `收付款筛选结果缺少业务可读内容：${text}`
          )
        }
        await assertBusinessPageRefreshEntrypoint(page, {
          scenarioName: 'exception-finance-payment-dark-desktop',
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'exception-finance-payment-dark-desktop',
          expectedLabels: ['收付款记录', '本页显示'],
        })
        await assertBusinessMainTableHasNoOperationColumn(page, {
          scenarioName: 'exception-finance-payment-dark-desktop',
        })
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'exception-finance-payment-dark-desktop',
        })

        const financeDataCard = page
          .locator('.erp-finance-payments-page .erp-business-data-table-card')
          .first()
        const financeTabsNav = financeDataCard.locator('.ant-tabs-nav').first()
        const financeTable = financeDataCard
          .locator('.ant-table-wrapper')
          .first()
        assert.equal(
          await page.locator('.erp-finance-payments-page > .ant-tabs').count(),
          0,
          '收付款页签不应悬在业务页面卡片之外'
        )
        assert.equal(
          await financeDataCard
            .getByRole('tab', { name: '收付款记录', exact: true })
            .count(),
          1,
          '收付款记录页签应位于数据表卡片内'
        )
        assert.equal(
          await financeDataCard
            .getByRole('tab', { name: '红冲记录', exact: true })
            .count(),
          1,
          '红冲记录页签应位于数据表卡片内'
        )
        const [financeCardBox, financeTabsBox, financeTableBox] =
          await Promise.all([
            financeDataCard.boundingBox(),
            financeTabsNav.boundingBox(),
            financeTable.boundingBox(),
          ])
        assert(financeCardBox, '收付款数据表卡片应有可测量布局')
        assert(financeTabsBox, '收付款页签应有可测量布局')
        assert(financeTableBox, '收付款表格应有可测量布局')
        assert(
          financeTabsBox.x >= financeCardBox.x &&
            financeTabsBox.x + financeTabsBox.width <=
              financeCardBox.x + financeCardBox.width + 1,
          '收付款页签不应横向溢出数据表卡片'
        )
        assert(
          financeTabsBox.y >= financeCardBox.y &&
            financeTabsBox.y + financeTabsBox.height <= financeTableBox.y + 1,
          '收付款页签应位于数据表卡片顶部、表格之前'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'exception-finance-payment-dark-desktop-payment-tab.png'
          ),
          fullPage: true,
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'finance-payments-records',
          heading: '收付款与核销',
          headerMenuTargetLabel: '方向',
        })
        await page.getByRole('tab', { name: '红冲记录', exact: true }).click()
        assert.equal(
          await page
            .getByRole('tab', { name: '红冲记录', exact: true })
            .getAttribute('aria-selected'),
          'true',
          '红冲记录页签应在切换后保持选中'
        )
        await expectButton(page, '登记红冲')
        await expectButton(page, '导出筛选结果')
        await expectButton(page, '列顺序')
        const creditToolbarActions = page
          .locator('.erp-business-operation-panel__actions')
          .first()
        assert(
          await creditToolbarActions
            .getByRole('button', {
              name: '导出筛选结果',
            })
            .isDisabled(),
          '没有红冲记录时导出筛选结果应保持禁用'
        )
        await creditToolbarActions
          .getByRole('button', { name: '列顺序' })
          .click()
        const creditColumnOrderDialog = page.locator(
          '.erp-business-action-modal--columns:visible'
        )
        await creditColumnOrderDialog.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await page
          .getByRole('list', {
            name: '收付款与核销 / 红冲记录列顺序',
            exact: true,
          })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await assertAntdModalCentered(
          page,
          creditColumnOrderDialog,
          'exception-finance-payment-dark-desktop-credit-column-order'
        )
        await creditColumnOrderDialog.screenshot({
          path: path.join(
            outputDir,
            'exception-finance-payment-dark-desktop-credit-column-order.png'
          ),
        })
        await creditColumnOrderDialog.locator('.ant-modal-close').click()
        await creditColumnOrderDialog.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        await assertBusinessHeaderStatsSingleLine(page, {
          scenarioName: 'exception-finance-payment-dark-desktop-credit-tab',
          expectedLabels: ['红冲记录', '本页显示'],
        })
        await assertNoHorizontalOverflow(
          page,
          'exception-finance-payment-dark-desktop-credit-tab'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'exception-finance-payment-dark-desktop-credit-tab.png'
          ),
          fullPage: true,
        })
        await page.getByRole('tab', { name: '收付款记录', exact: true }).click()
        await expectButton(page, '登记收付款')

        const paymentRow = page
          .locator('.ant-table-tbody .ant-table-row')
          .filter({ hasText: 'PAY-STYLE-L1' })
          .first()
        await paymentRow.click()
        await page
          .getByRole('button', { name: '查看详情', exact: true })
          .click()
        const detailDialog = page
          .getByRole('dialog')
          .filter({ hasText: '收付款详情' })
        await detailDialog.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(detailDialog, '银行账户尾号 6688')
        await expectText(detailDialog, '当前收付款尚未形成核销明细')
        await assertAntdModalCentered(
          page,
          detailDialog,
          'exception-finance-payment-dark-desktop-detail'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'exception-finance-payment-dark-desktop-detail.png'
          ),
          fullPage: true,
        })
        await page.keyboard.press('Escape')
        await detailDialog.waitFor({ state: 'hidden', timeout: 10_000 })

        await paymentRow.click()
        await page
          .getByRole('button', {
            name: '选择应收 / 应付核销',
            exact: true,
          })
          .click()
        const allocationDialog = page
          .getByRole('dialog')
          .filter({ hasText: '选择核销记录' })
        await allocationDialog.waitFor({ state: 'visible', timeout: 10_000 })
        const allocationLabel = await allocationDialog
          .getByLabel('应收 / 应付')
          .inputValue()
        assert.match(allocationLabel, /AR-STYLE-L1/)
        assert.match(allocationLabel, /未核销 1200/)
        await allocationDialog
          .getByRole('textbox', { name: /本次核销金额/u })
          .fill('1200')
        await assertOperationalFactModalViewport(
          page,
          'exception-finance-payment-dark-desktop-allocation'
        )
        await assertERPThemeMode(page, {
          scenarioName: 'exception-finance-payment-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoHorizontalOverflow(
          page,
          'exception-finance-payment-dark-desktop'
        )
      },
    },
  ]
}
