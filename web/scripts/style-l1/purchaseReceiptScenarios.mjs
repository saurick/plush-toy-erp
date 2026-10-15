import { openBusinessRecordDetails } from './businessDetailsScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createBusinessAttachmentAssertions } from './businessAttachmentAssertions.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

export function createPurchaseReceiptScenarios(deps) {
  const {
    assert,
    assertAntdModalCentered,
    assertBusinessMainTableInitialSelectionEmpty,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertPurchaseReceiptRowItemCount,
    assertTextAbsent,
    expectButton,
    expectHeading,
    expectText,
    selectPurchaseReceiptRow,
    verifyBusinessModuleColumnOrderDialog,
    customerRuntimeEffectiveSession,
  } = deps
  const { assertPageAttachmentModalEntrypoint } =
    createBusinessAttachmentAssertions({
      assert,
      assertAntdModalCentered,
    })

  const getSelectionActionButton = async (page, name) => {
    const buttons = page.getByRole('button', { name, exact: true })
    for (let index = 0; index < (await buttons.count()); index += 1) {
      const button = buttons.nth(index)
      if (await button.isVisible()) return button
    }
    const moreButtons = page.getByRole('button', { name: /^更多操作，共/u })
    for (let index = 0; index < (await moreButtons.count()); index += 1) {
      const moreButton = moreButtons.nth(index)
      if (await moreButton.isVisible()) {
        await moreButton.click()
        break
      }
    }
    const menu = page.locator('.erp-business-selection-action-menu:visible')
    await menu.waitFor({ state: 'visible', timeout: 10_000 })
    const button = menu.getByRole('button', { name, exact: true }).first()
    await button.waitFor({ state: 'visible', timeout: 10_000 })
    return button
  }

  const clickSelectionAction = async (page, name) => {
    const button = await getSelectionActionButton(page, name)
    await button.click()
  }

  const assertPurchaseReceiptToolbarShell = async (page, scenarioName) => {
    for (const label of ['导出筛选结果', '列设置']) {
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
      .getByRole('button', { name: '导出筛选结果' })
      .first()
    const columnOrderButton = page
      .getByRole('button', { name: '列设置' })
      .first()
    assert.equal(
      await exportButton.isDisabled(),
      false,
      `${scenarioName} 入库本页有数据时应允许真实导出`
    )
    assert.equal(
      await columnOrderButton.isDisabled(),
      false,
      `${scenarioName} 入库数据列应允许安全调整列顺序`
    )
  }

  const assertPurchaseReceiptDateRangeSegmentedControl = async (
    page,
    scenarioName
  ) => {
    const filterDialog = page.getByRole('dialog', { name: '筛选条件' })
    if (!(await filterDialog.isVisible()))
      await page
        .locator('.erp-business-operation-panel button[aria-haspopup="dialog"]')
        .click()
    await filterDialog.waitFor()
    await waitForFiniteAnimations(page)
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
      const dateInputs = Array.from(
        control?.querySelectorAll('.erp-business-date-input.ant-picker') || []
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
        gap: Number.parseFloat(style?.gap || '0'),
        controlScrollWidth: control?.scrollWidth || 0,
        controlClientWidth: control?.clientWidth || 0,
        rangeScrollWidth: range?.scrollWidth || 0,
        rangeClientWidth: range?.clientWidth || 0,
        labelBackground: labelStyle?.backgroundColor || '',
        labelBorder: labelStyle?.borderColor || '',
        labelRadius: labelStyle?.borderRadius || '',
        dateInputs: dateInputs.map((input) => {
          const inputStyle = window.getComputedStyle(input)
          const inputBox = input.getBoundingClientRect()
          return {
            width: inputBox.width,
            height: inputBox.height,
            border: inputStyle.borderColor,
            radius: inputStyle.borderRadius,
          }
        }),
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
      metrics.gap >= 6 &&
        Number.parseFloat(metrics.labelRadius) >= 8 &&
        metrics.labelBorder !== 'rgba(0, 0, 0, 0)' &&
        metrics.dateInputs.length === 2 &&
        metrics.dateInputs.every(
          (input) =>
            input.width >= 120 &&
            input.height === 34 &&
            Number.parseFloat(input.radius) >= 8 &&
            input.border !== 'rgba(0, 0, 0, 0)'
        ) &&
        metrics.controlScrollWidth <= metrics.controlClientWidth + 1 &&
        metrics.rangeScrollWidth <= metrics.rangeClientWidth + 1,
      `${scenarioName} 入库日期类型和起止日期应有独立边界且不挤压: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 入库日期筛选不应造成页面级横向溢出: ${JSON.stringify(
        metrics
      )}`
    )
    await filterDialog
      .getByRole('button', { name: '完成', exact: true })
      .click()
  }

  const assertPurchaseReceiptDetailsReadable = async (
    page,
    { receiptNo, scenarioName }
  ) => {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByText(receiptNo, { exact: true }) })
      .first()
    await row.scrollIntoViewIfNeeded()
    await openBusinessRecordDetails(page, receiptNo)
    const details = page.getByRole('dialog', { name: /^采购入库详情/u })
    await details.locator('.erp-business-row-item-card').first().waitFor()
    const metrics = await page.evaluate(() => {
      const list = document.querySelector('.erp-business-details-modal')
      const cards = list
        ? Array.from(list.querySelectorAll('.erp-business-row-item-card'))
        : []
      const fields = list
        ? Array.from(
            list.querySelectorAll('.erp-business-row-item-card__field')
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
      '批次',
      '批次号',
      '本次实点数量',
      '送货标示数量',
      '实点与标示差异',
      '单位',
      '单价',
      '金额',
      '采购订单行',
      '来源行号',
      '备注',
    ]
    assert(metrics.hasList, `${scenarioName} 完整详情应显示入库明细`)
    assert.equal(
      metrics.nestedTableCount,
      0,
      `${scenarioName} 明细区不应继续嵌套一张横向表格: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cardCount > 0,
      `${scenarioName} 完整详情应显示至少一条入库明细卡片: ${JSON.stringify(metrics)}`
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
          field.whiteSpace === 'pre-wrap' &&
          ['anywhere', 'break-word'].includes(field.overflowWrap) &&
          field.valueScrollWidth <= field.valueClientWidth + 1
      ),
      `${scenarioName} 入库明细长文本应在字段内换行且不裁切: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.listOverflow <= 1 && metrics.cardOverflows.length === 0,
      `${scenarioName} 完整明细卡片不应产生内部水平溢出: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.documentOverflow,
      0,
      `${scenarioName} 完整明细不应造成页面级横向溢出: ${JSON.stringify(metrics)}`
    )
    await details.getByRole('button', { name: /关\s*闭/u }).click()
    await details.waitFor({ state: 'hidden' })
  }

  return [
    ...[
      ['return', '生成采购退货', '从入库单生成采购退货'],
      ['adjustment', '登记入库调整', '登记采购入库调整'],
    ].map(([mode, triggerName, title]) => ({
      name: `purchase-receipt-${mode}-rapid-add`,
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const addButtonName = mode === 'return' ? '添加退货明细' : '添加调整明细'
        await expectHeading(page, '采购入库')
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1')
        await clickSelectionAction(page, triggerName)
        const modal = page.getByRole('dialog', { name: title, exact: true })
        await modal.waitFor({ state: 'visible' })
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport)
          for (let count = 0; count < 3; count += 1) {
            const rows = modal.locator('.erp-purchase-receipt-exception-row')
            const before = await rows.count()
            assert.equal(
              await modal
                .getByRole('button', { name: addButtonName, exact: true })
                .count(),
              1,
              `${mode}-${viewport.width}-${count}: ${await modal.innerText()}`
            )
            await modal
              .getByRole('button', { name: addButtonName, exact: true })
              .click()
            const added = rows.nth(before).locator('input:focus')
            await added.waitFor({ state: 'visible' })
            assert.equal(await rows.count(), before + 1)
            assert.equal(await added.getAttribute('role'), 'combobox')
            const rect = await added.boundingBox()
            assert(
              rect.y >= 0 && rect.y + rect.height <= viewport.height,
              '追加后来源明细输入应可见并获得焦点'
            )
          }
        }
        const noteRows = modal.locator('.erp-purchase-receipt-exception-row')
        for (const [index, note] of ['待移除说明', '保留的明细说明'].entries()) {
          await noteRows.nth(index).locator('summary').click()
          await noteRows.nth(index).getByLabel('明细备注', { exact: true }).fill(note)
          await noteRows.nth(index).locator('summary').click()
        }
        await noteRows.first().getByRole('button', { name: '移除明细 1' }).click()
        assert.match(await noteRows.first().locator('summary').innerText(), /保留的明细说明/u)
        await noteRows.first().locator('summary').click()
        assert.equal(await noteRows.first().getByLabel('明细备注', { exact: true }).inputValue(), '保留的明细说明')
        await noteRows.first().getByLabel('明细备注', { exact: true }).fill('')
        assert.doesNotMatch(await noteRows.first().locator('summary').innerText(), /保留的明细说明/u)
        await page.setViewportSize({ width: 1440, height: 900 })
        await modal.getByRole('button', { name: /^取\s*消$/u }).click()
        await modal.waitFor({ state: 'hidden' })
        await clickSelectionAction(page, triggerName)
        await modal.waitFor({ state: 'visible' })
        assert.equal(
          await modal
            .locator('.erp-purchase-receipt-exception-row')
            .count(),
          1
        )
        await modal.getByRole('button', { name: /^取\s*消$/u }).click()
      },
    })),
    {
      name: 'purchase-receipts-table-control-columns-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购入库')
        await expectText(page, 'PR-STYLE-L1')
        await assertPurchaseReceiptToolbarShell(
          page,
          'purchase-receipts-table-control-columns-desktop'
        )
        await assertPurchaseReceiptDateRangeSegmentedControl(
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
          ['', '入库单号', '状态'],
          `入库表格前置选择列不应显示“选择”二字: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.headers[0].width <= 56 + 1 &&
            metrics.headers[0].scrollWidth <= metrics.headers[0].clientWidth &&
            metrics.headers[0].textAlign === 'center',
          `入库表格选择列应保持窄列、居中且不裁字: ${JSON.stringify(metrics)}`
        )
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
        await assertPurchaseReceiptDetailsReadable(page, {
          receiptNo: 'PR-STYLE-L1',
          scenarioName: 'purchase-receipts-details-readable-desktop',
        })
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1')
        await assertPageAttachmentModalEntrypoint(page, {
          scenarioName: 'purchase-receipts-attachment-modal-desktop',
          modalTitle: '入库附件',
          panelTitle: '入库附件',
        })
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'inbound',
          heading: '采购入库',
        })
      },
    },
    {
      name: 'purchase-receipt-source-generated-boundary-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购入库')
        await expectText(page, 'PR-STYLE-L1-DRAFT')
        await assertTextAbsent(page, '入库单：正式入库记录')
        await assertTextAbsent(page, '过账后更新库存记录')
        await assertTextAbsent(page, '维护明细')
        await assertTextAbsent(page, '添加明细')
        await assertTextAbsent(page, '添加入库明细')

        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-DRAFT')
        await assertPurchaseReceiptRowItemCount(page, 'PR-STYLE-L1-DRAFT', 1)
        await clickSelectionAction(page, /相关单据/u)
        const purchaseOrderMenuItem = page.getByRole('menuitem', {
          name: '采购订单',
          exact: true,
        })
        await purchaseOrderMenuItem.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await page.keyboard.press('Escape')
        await purchaseOrderMenuItem.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        const actionBarText = await page
          .locator('.erp-business-module-current-action')
          .innerText()
        const discardDraftButton = await getSelectionActionButton(
          page,
          /作废草稿/u
        )
        assert.equal(
          await discardDraftButton.isDisabled(),
          false,
          `采购入库草稿作废入口不应被禁用: ${actionBarText}`
        )
        await discardDraftButton.dispatchEvent('click')
        const visiblePopover = page
          .locator('.ant-popover:visible')
          .filter({ hasText: '确认作废采购入库草稿' })
          .last()
        await visiblePopover.waitFor({ state: 'visible', timeout: 10_000 })
        const confirmDiscardButton = visiblePopover
          .locator('button')
          .filter({ hasText: /确\s*认/u })
          .last()
        await confirmDiscardButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(await confirmDiscardButton.isDisabled(), false)
        await confirmDiscardButton.click()
        await expectText(page, '采购入库草稿已作废，未更新库存')
        await assertTextAbsent(page, '添加明细')
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-source-generated-boundary-desktop'
        )
      },
    },
    {
      name: 'purchase-receipt-exception-records-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购入库')
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1')
        await clickSelectionAction(page, '退货与调整记录')

        const modal = page
          .getByRole('dialog', {
            name: /退货与调整记录 · PR-STYLE-L1/u,
          })
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '确认草稿后库存会同步更新')
        await expectText(page, 'PRT-STYLE-L1')
        await assertBusinessModalViewport(page, modal, {
          label: 'purchase-return-adjustment-records',
          minWidthRatio: 0.9,
          maxWidth: 1800,
        })
        await page.setViewportSize({ width: 720, height: 568 })
        await assertBusinessModalViewport(page, modal, {
          label: 'purchase-return-adjustment-records-narrow',
          minWidthRatio: 0.9,
        })
        await page.setViewportSize({ width: 1440, height: 900 })

        const returnPostButton = modal.getByRole('button', {
          name: /确\s*认/u,
        })
        assert.equal(
          await returnPostButton.count(),
          1,
          `草稿采购退货应展示独立过账权限动作: ${await modal.innerText()}`
        )
        await returnPostButton.click()
        await page
          .locator('.ant-popover:visible')
          .getByRole('button', { name: /确\s*认/u })
          .click()
        await expectText(page, '采购退货已确认')
        await modal.getByRole('tab', { name: /入库调整/u }).click()
        await expectText(page, 'PRA-STYLE-L1')
        await modal.getByRole('button', { name: '取消并恢复库存' }).click()
        await page
          .locator('.ant-popover:visible')
          .last()
          .getByRole('button', { name: '确认取消', exact: true })
          .click()
        await expectText(page, '入库调整已取消，库存已恢复到调整前')

        const metrics = await modal.evaluate((node) => {
          const box = node.getBoundingClientRect()
          return {
            width: box.width,
            right: box.right,
            viewportWidth: window.innerWidth,
            modalOverflow: node.scrollWidth - node.clientWidth,
            documentOverflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            text: String(node.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
          }
        })
        assert(
          metrics.width > 900 &&
            metrics.right <= metrics.viewportWidth + 1 &&
            metrics.modalOverflow <= 1 &&
            metrics.documentOverflow === 0,
          `退货与调整记录弹窗应在桌面视口内完整显示: ${JSON.stringify(metrics)}`
        )
        for (const forbiddenText of [
          'purchase_receipt_id',
          'idempotency_key',
          'correction_group',
        ]) {
          assert.equal(
            metrics.text.includes(forbiddenText),
            false,
            `退货与调整记录不应显示技术字段 ${forbiddenText}`
          )
        }
      },
    },
    {
      name: 'purchase-receipt-source-generated-boundary-dark-desktop',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购入库')
        await assertERPThemeMode(page, {
          scenarioName:
            'purchase-receipt-source-generated-boundary-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertTextAbsent(page, '入库单：正式入库记录')
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-DRAFT')
        await assertPurchaseReceiptRowItemCount(page, 'PR-STYLE-L1-DRAFT', 1)
        await assertTextAbsent(page, '添加明细')
        await assertTextAbsent(page, '添加入库明细')
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-source-generated-boundary-dark-desktop'
        )
      },
    },
    {
      name: 'purchase-receipt-source-generated-boundary-mobile',
      path: '/erp/warehouse/inbound',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '采购入库')
        await assertTextAbsent(page, '入库单：正式入库记录')
        await selectPurchaseReceiptRow(page, 'PR-STYLE-L1-DRAFT')
        await assertPurchaseReceiptRowItemCount(page, 'PR-STYLE-L1-DRAFT', 1)
        await assertTextAbsent(page, '添加明细')
        await assertTextAbsent(page, '添加入库明细')
        await assertNoHorizontalOverflow(
          page,
          'purchase-receipt-source-generated-boundary-mobile'
        )
      },
    },
  ]
}
