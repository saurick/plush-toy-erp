import { createBusinessAttachmentAssertions } from './businessAttachmentAssertions.mjs'

export function createPurchaseReceiptScenarios(deps) {
  const {
    assert,
    assertAntdModalCentered,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessMainTableInitialSelectionEmpty,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertPurchaseReceiptActionButtonState,
    assertPurchaseReceiptAddItemModalDarkTokens,
    assertPurchaseReceiptAddItemModalMetrics,
    assertPurchaseReceiptAddItemModalMobileLayout,
    assertPurchaseReceiptRowItemCount,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectText,
    fillPurchaseReceiptAddItemModalBoundaryValues,
    openPurchaseReceiptAddItemModal,
    selectPurchaseReceiptRow,
    verifyBusinessModuleColumnOrderDialog,
  } = deps
  const { assertPageAttachmentModalEntrypoint } =
    createBusinessAttachmentAssertions({
      assert,
      assertAntdModalCentered,
    })

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
    assert.equal(
      await page.getByRole('button', { name: '新建入库单' }).count(),
      0,
      `${scenarioName} 入库草稿应从采购订单生成，入库列表不应展示页面级新建按钮`
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

  const assertPurchaseReceiptDateRangeRoundedShell = async (
    page,
    scenarioName
  ) => {
    const metrics = await page.evaluate(() => {
      const control = Array.from(
        document.querySelectorAll('.erp-business-date-range-filter')
      ).find((node) => node.textContent?.includes('入库日期'))
      const label = control?.querySelector(
        '.erp-business-date-range-filter__type-label'
      )
      const range = control?.querySelector(
        '.erp-business-date-range-filter__range'
      )
      const style = control ? window.getComputedStyle(control) : null
      const labelStyle = label ? window.getComputedStyle(label) : null
      const controlBox = control?.getBoundingClientRect()
      const labelBox = label?.getBoundingClientRect()
      return {
        controlWidth: controlBox?.width || 0,
        controlHeight: controlBox?.height || 0,
        labelText: label?.textContent?.trim() || '',
        overflowX: style?.overflowX || '',
        overflowY: style?.overflowY || '',
        borderTopLeftRadius: style?.borderTopLeftRadius || '',
        borderBottomLeftRadius: style?.borderBottomLeftRadius || '',
        controlScrollWidth: control?.scrollWidth || 0,
        controlClientWidth: control?.clientWidth || 0,
        rangeScrollWidth: range?.scrollWidth || 0,
        rangeClientWidth: range?.clientWidth || 0,
        labelBackground: labelStyle?.backgroundColor || '',
        labelLeftDelta:
          labelBox && controlBox
            ? Math.abs(labelBox.left - controlBox.left)
            : 0,
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }
    })
    assert.equal(
      metrics.labelText,
      '入库日期',
      `${scenarioName} 入库日期筛选应使用共享 DateRangeFilter 标签: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.controlWidth > 0 && metrics.controlHeight > 0,
      `${scenarioName} 入库日期筛选控件应可见: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.overflowX === 'hidden' && metrics.overflowY === 'hidden',
      `${scenarioName} 日期区间外壳应裁切内部标签背景到圆角内: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      Number.parseFloat(metrics.borderTopLeftRadius) >= 8 &&
        Number.parseFloat(metrics.borderBottomLeftRadius) >= 8,
      `${scenarioName} 日期区间外壳左侧应保留可见圆角: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.labelLeftDelta <= 1 &&
        metrics.controlScrollWidth <= metrics.controlClientWidth + 1 &&
        metrics.rangeScrollWidth <= metrics.rangeClientWidth + 1,
      `${scenarioName} 入库日期筛选内部不应挤压或横向溢出: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 入库日期筛选不应造成页面级横向溢出: ${JSON.stringify(
        metrics
      )}`
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
        await assertPurchaseReceiptDateRangeRoundedShell(
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
        await assertPageAttachmentModalEntrypoint(page, {
          scenarioName: 'purchase-receipts-attachment-modal-desktop',
          rowText: 'PR-STYLE-L1',
          modalTitle: '入库附件',
          panelTitle: '入库附件',
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'inbound',
          heading: '入库管理',
        })
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
