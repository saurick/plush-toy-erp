export function createPurchaseReceiptScenarios(deps) {
  const {
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
  } = deps

  return [
    {
      name: 'purchase-receipts-table-control-columns-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1')
        await assertBusinessMainTableInitialSelectionEmpty(page, {
          scenarioName: 'purchase-receipts-table-control-columns-desktop',
        })
        const metrics = await page.evaluate(() => {
          const headers = Array.from(
            document.querySelectorAll(
              '.erp-business-module-table-card .ant-table-thead th'
            )
          )
            .slice(0, 3)
            .map((header) => {
              const style = window.getComputedStyle(header)
              const rect = header.getBoundingClientRect()
              return {
                text: header.textContent?.replace(/\s+/g, ' ').trim() || '',
                width: rect.width,
                scrollWidth: header.scrollWidth,
                clientWidth: header.clientWidth,
                paddingLeft: style.paddingLeft,
                paddingRight: style.paddingRight,
                textAlign: style.textAlign,
              }
            })
          const scrollContainer = document.querySelector(
            '.erp-business-module-table-card .ant-table-content, .erp-business-module-table-card .ant-table-body'
          )
          return {
            headers,
            tableOverflowX: scrollContainer
              ? window.getComputedStyle(scrollContainer).overflowX
              : '',
            documentOverflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })

        assert.deepEqual(
          metrics.headers.map((header) => header.text),
          ['明细', '选择', '入库单号'],
          `入库表格前置控制列表头不应继续显示为空白块: ${JSON.stringify(metrics)}`
        )
        for (const header of metrics.headers.slice(0, 2)) {
          assert(
            header.width <= 56 &&
              header.scrollWidth <= header.clientWidth &&
              header.textAlign === 'center',
            `入库表格控制列表头应保持窄列、居中且不裁字: ${JSON.stringify(metrics)}`
          )
        }
        assert.equal(
          metrics.tableOverflowX,
          'auto',
          `入库表格横向滚动应保留在表格容器内: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.documentOverflow,
          0,
          `入库表格不应造成页面级横向溢出: ${JSON.stringify(metrics)}`
        )
      },
    },
    {
      name: 'purchase-receipt-create-modal-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1')
        await assertPurchaseReceiptCreateModalKeyboardRecovery(page)
        await assertBusinessListEmptySearchState(page, {
          scenarioName: 'purchase-receipt-empty-search-state',
          searchPlaceholder: '搜索入库单号 / 供应商',
          emptyText: '暂无采购入库单',
          staleText: 'PR-STYLE-L1',
        })

        const modal = await openPurchaseReceiptCreateModal(page)
        await expectText(page, '新建采购入库单')
        await expectText(page, '入库明细')
        await expectText(page, '单头和初始明细由后端一次创建')
        await assertTextAbsent(page, '材料 ID')
        await assertTextAbsent(page, '仓库 ID')
        await assertTextAbsent(page, '单位 ID')

        await modal.getByRole('button', { name: '创建草稿' }).click()
        await expectText(page, '请填写供应商')
        await expectText(page, '请选择材料')
        await expectText(page, '请选择仓库')
        await expectText(page, '请选择单位')
        await expectText(page, '请填写入库数量')

        await fillPurchaseReceiptCreateModalBoundaryValues(page, modal)
        await assertPurchaseReceiptCreateModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-desktop',
          expectedRows: 1,
        })
        await assertPurchaseReceiptCreateModalFocusStyles(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-desktop',
        })

        await modal.getByRole('button', { name: '添加条目' }).click()
        await expectText(page, '明细 2')
        await assertPurchaseReceiptCreateModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-desktop-after-add',
          expectedRows: 2,
        })

        await closeBusinessFormModal(page, modal)
        await expectText(page, 'PR-STYLE-L1')
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-create-modal-desktop-recovery'
        )

        const reopenedModal = await openPurchaseReceiptCreateModal(page)
        await assertPurchaseReceiptCreateModalMetrics(page, reopenedModal, {
          scenarioName: 'purchase-receipt-create-modal-desktop-reopen',
          expectedRows: 1,
        })
        await closeBusinessFormModal(page, reopenedModal)
      },
    },
    {
      name: 'purchase-receipt-create-modal-dark-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await assertERPThemeMode(page, {
          scenarioName: 'purchase-receipt-create-modal-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertPurchaseReceiptCreateModalKeyboardRecovery(page)
        const modal = await openPurchaseReceiptCreateModal(page)
        await fillPurchaseReceiptCreateModalBoundaryValues(page, modal)
        await assertPurchaseReceiptCreateModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-dark-desktop',
          expectedRows: 1,
        })
        await assertPurchaseReceiptCreateModalDarkTokens(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-dark-desktop',
        })
        await closeBusinessFormModal(page, modal)
      },
    },
    {
      name: 'purchase-receipt-create-modal-mobile',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await assertPurchaseReceiptCreateModalKeyboardRecovery(page)
        const modal = await openPurchaseReceiptCreateModal(page)
        await expectText(page, '新建采购入库单')
        await fillPurchaseReceiptCreateModalBoundaryValues(page, modal)
        await assertPurchaseReceiptCreateModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-mobile',
          expectedRows: 1,
        })
        await assertPurchaseReceiptCreateModalMobileLayout(page, modal, {
          scenarioName: 'purchase-receipt-create-modal-mobile',
        })
        await closeBusinessFormModal(page, modal)
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-create-modal-mobile-recovery'
        )
      },
    },
    {
      name: 'purchase-receipt-add-item-modal-draft-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1-DRAFT')
        await expectButton(page, '添加明细')
        await assertTextAbsent(page, '维护明细')

        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1')
        await assertPurchaseReceiptActionButtonState(page, {
          name: '添加明细',
          disabled: true,
          scenarioName: 'purchase-receipt-add-item-posted-disabled',
        })

        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-CANCELLED')
        await assertPurchaseReceiptActionButtonState(page, {
          name: '添加明细',
          disabled: true,
          scenarioName: 'purchase-receipt-add-item-cancelled-disabled',
        })

        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-DRAFT')
        await assertPurchaseReceiptRowItemCount(page, 'PR-STYLE-L1-DRAFT', 1)
        await assertPurchaseReceiptActionButtonState(page, {
          name: '添加明细',
          disabled: false,
          scenarioName: 'purchase-receipt-add-item-draft-enabled',
        })
        await assertBusinessFormModalKeyboardRecovery(page, {
          triggerName: /添加\s*明细/,
          titleText: '添加入库明细',
          scenarioName: 'purchase-receipt-add-item-modal',
          closeMode: 'close-button',
        })

        const modal = await openPurchaseReceiptAddItemModal(page)
        await expectText(page, '添加入库明细')
        await assertTextAbsent(page, '编辑入库明细')
        await modal.getByRole('button', { name: '添加明细' }).click()
        await expectText(page, '请选择材料')
        await expectText(page, '请选择仓库')
        await expectText(page, '请选择单位')
        await expectText(page, '请填写入库数量')

        await fillPurchaseReceiptAddItemModalBoundaryValues(page, modal)
        await assertPurchaseReceiptAddItemModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-add-item-modal-draft-desktop',
        })
        await modal.getByRole('button', { name: '添加明细' }).click()
        await expectText(page, '入库明细已添加')
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertPurchaseReceiptRowItemCount(page, 'PR-STYLE-L1-DRAFT', 2)
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-add-item-modal-draft-desktop-recovery'
        )
      },
    },
    {
      name: 'purchase-receipt-add-item-modal-dark-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await assertERPThemeMode(page, {
          scenarioName: 'purchase-receipt-add-item-modal-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-DRAFT')
        const modal = await openPurchaseReceiptAddItemModal(page)
        await expectText(page, '添加入库明细')
        await fillPurchaseReceiptAddItemModalBoundaryValues(page, modal)
        await assertPurchaseReceiptAddItemModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-add-item-modal-dark-desktop',
        })
        await assertPurchaseReceiptAddItemModalDarkTokens(page, modal, {
          scenarioName: 'purchase-receipt-add-item-modal-dark-desktop',
        })
        await closeBusinessFormModal(page, modal)
      },
    },
    {
      name: 'purchase-receipt-add-item-modal-mobile',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-DRAFT')
        const modal = await openPurchaseReceiptAddItemModal(page)
        await expectText(page, '添加入库明细')
        await fillPurchaseReceiptAddItemModalBoundaryValues(page, modal)
        await assertPurchaseReceiptAddItemModalMetrics(page, modal, {
          scenarioName: 'purchase-receipt-add-item-modal-mobile',
        })
        await assertPurchaseReceiptAddItemModalMobileLayout(page, modal, {
          scenarioName: 'purchase-receipt-add-item-modal-mobile',
        })
        await closeBusinessFormModal(page, modal)
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-add-item-modal-mobile-recovery'
        )
      },
    },
  ]
}
