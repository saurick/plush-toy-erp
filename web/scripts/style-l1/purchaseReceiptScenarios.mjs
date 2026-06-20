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
    verifyBusinessModuleColumnOrderDialog,
  } = deps

  const assertPurchaseReceiptToolbarShell = async (page, scenarioName) => {
    for (const label of ['导出当前结果', '列顺序']) {
      await expectButton(page, label)
    }
    assert.equal(
      await page.getByRole('button', { name: '批量删除' }).count(),
      0,
      `${scenarioName} 入库列表没有批量删除主路径时不应展示占位按钮`
    )
    assert.equal(
      await page.getByRole('button', { name: '回收站' }).count(),
      0,
      `${scenarioName} 入库列表没有回收站主路径时不应展示占位按钮`
    )
    const exportButton = page
      .getByRole('button', { name: '导出当前结果' })
      .first()
    const columnOrderButton = page
      .getByRole('button', { name: '列顺序' })
      .first()
    assert.equal(
      await exportButton.isDisabled(),
      false,
      `${scenarioName} 入库当前结果有数据时应允许真实导出`
    )
    assert.equal(
      await columnOrderButton.isDisabled(),
      false,
      `${scenarioName} 入库数据列应允许安全调整列顺序`
    )
  }

  const assertPurchaseReceiptExpandedItemsReadable = async (
    page,
    { receiptNo, scenarioName }
  ) => {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(receiptNo, { exact: true }) })
      .first()
    await row.scrollIntoViewIfNeeded()
    await row.locator('button').first().click()
    await page
      .locator('.erp-purchase-receipt-items-list')
      .waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await page.evaluate(() => {
      const list = document.querySelector('.erp-purchase-receipt-items-list')
      const cards = list
        ? Array.from(list.querySelectorAll('.erp-purchase-receipt-item-card'))
        : []
      const fields = list
        ? Array.from(
            list.querySelectorAll('.erp-purchase-receipt-item-card__field')
          ).map((node) => {
            const valueNode = node.querySelector('dd')
            const valueStyle = valueNode
              ? window.getComputedStyle(valueNode)
              : null
            return {
              label:
                node
                  .querySelector('dt')
                  ?.textContent?.replace(/\s+/g, ' ')
                  .trim() || '',
              value: valueNode?.textContent?.replace(/\s+/g, ' ').trim() || '',
              valueScrollWidth: valueNode?.scrollWidth || 0,
              valueClientWidth: valueNode?.clientWidth || 0,
              whiteSpace: valueStyle?.whiteSpace || '',
              overflowWrap: valueStyle?.overflowWrap || '',
            }
          })
        : []
      return {
        hasList: Boolean(list),
        nestedTableCount: list ? list.querySelectorAll('.ant-table').length : 0,
        cardCount: cards.length,
        fields,
        listOverflow: list ? list.scrollWidth - list.clientWidth : 0,
        cardOverflows: cards
          .map((card) => card.scrollWidth - card.clientWidth)
          .filter((overflow) => overflow > 1),
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }
    })
    const expectedHeaders = [
      '材料',
      '仓库',
      '单位',
      '批次',
      '批次号',
      '数量',
      '单价',
      '金额',
      '采购订单行',
      '来源行号',
      '备注',
    ]
    assert(metrics.hasList, `${scenarioName} 展开后应显示入库明细`)
    assert.equal(
      metrics.nestedTableCount,
      0,
      `${scenarioName} 展开区不应继续嵌套一张横向表格: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cardCount > 0,
      `${scenarioName} 展开后应显示至少一条入库明细卡片: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.fields.map((field) => field.label),
      expectedHeaders,
      `${scenarioName} 入库明细字段不完整: ${JSON.stringify(metrics)}`
    )
    const noteField = metrics.fields.find((field) => field.label === '备注')
    const materialField = metrics.fields.find((field) => field.label === '材料')
    assert(
      noteField?.value.includes('样式入库明细'),
      `${scenarioName} 备注内容应直接可见，不应依赖横向滚动: ${JSON.stringify(metrics)}`
    )
    assert(
      materialField?.value.includes('MAT-STYLE-L1'),
      `${scenarioName} 材料业务编号应直接可见: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.fields.every(
        (field) =>
          field.whiteSpace === 'normal' &&
          ['anywhere', 'break-word'].includes(field.overflowWrap) &&
          field.valueScrollWidth <= field.valueClientWidth + 1
      ),
      `${scenarioName} 入库明细长文本应在字段内换行且不裁切: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.listOverflow <= 1 && metrics.cardOverflows.length === 0,
      `${scenarioName} 展开明细卡片不应产生内部水平溢出: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 展开明细不应造成页面级横向溢出: ${JSON.stringify(metrics)}`
    )
  }

  return [
    {
      name: 'purchase-receipts-table-control-columns-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1')
        await assertPurchaseReceiptToolbarShell(
          page,
          'purchase-receipts-table-control-columns-desktop'
        )
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
          const selectionInputTypes = Array.from(
            document.querySelectorAll(
              '.erp-business-module-table-card .ant-table-selection-column input'
            )
          ).map((input) => input.getAttribute('type') || '')
          const dataHeaderTexts = Array.from(
            document.querySelectorAll(
              '.erp-business-module-table-card .ant-table-thead th .erp-module-column-header-text'
            )
          ).map((node) => ({
            text: String(node.textContent || '').trim(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
          }))
          return {
            headers,
            clippedDataHeaderTexts: dataHeaderTexts.filter((node) =>
              [
                '入库单号',
                '状态',
                '供应商',
                '收货日期',
                '过账时间',
                '明细行数',
                '入库数量',
                '创建时间',
              ].includes(node.text)
                ? node.scrollWidth > node.clientWidth + 1
                : false
            ),
            tableOverflowX: scrollContainer
              ? window.getComputedStyle(scrollContainer).overflowX
              : '',
            selectionInputTypes,
            documentOverflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })

        assert.deepEqual(
          metrics.headers.map((header) => header.text),
          ['明细', '', '入库单号'],
          `入库表格前置选择列不应显示“选择”二字: ${JSON.stringify(metrics)}`
        )
        for (const header of metrics.headers.slice(0, 2)) {
          assert(
            header.width <= 56 &&
              header.scrollWidth <= header.clientWidth &&
              header.textAlign === 'center',
            `入库表格控制列表头应保持窄列、居中且不裁字: ${JSON.stringify(metrics)}`
          )
        }
        assert(
          metrics.selectionInputTypes.length > 0 &&
            metrics.selectionInputTypes.every((type) => type === 'radio'),
          `入库当前操作只支持单张单据，选择控件应为 radio: ${JSON.stringify(metrics)}`
        )
        assert.deepEqual(
          metrics.clippedDataHeaderTexts,
          [],
          `入库表格短数据表头不应被列设置和排序控件挤成省略号: ${JSON.stringify(metrics)}`
        )
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
        await assertPurchaseReceiptExpandedItemsReadable(page, {
          receiptNo: 'PR-STYLE-L1',
          scenarioName: 'purchase-receipts-expanded-items-readable-desktop',
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'inbound',
          heading: '入库管理',
        })
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
        await assertPurchaseReceiptExpandedItemsReadable(page, {
          receiptNo: 'PR-STYLE-L1',
          scenarioName:
            'purchase-receipts-expanded-items-readable-dark-desktop',
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
