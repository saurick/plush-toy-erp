import { openBusinessTableTool } from './businessTableTools.mjs'

export function createBusinessRecordNavigationScenarios(deps) {
  const {
    expectHeading,
    expectText,
    gotoScenarioPath,
    verifyBusinessRowDoubleClickModal,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    {
      name: 'business-row-double-click-modals-desktop',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await expectText(page, '12.5')
        await verifyBusinessRowDoubleClickModal(page, {
          rowText: '12.5',
          titleText: '库存余额详情',
          scenarioName: 'business-row-double-click-inventory',
          screenshotName: 'business-formal-inventory-double-click-details',
          afterModalOpen: async () => {
            await expectText(page, '当前弹窗只用于库存查询和追溯')
            await expectText(page, 'SKU-STYLE-L1')
          },
        })

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '质量检验')
        await expectText(page, 'QI-STYLE-L1')
        await verifyBusinessRowDoubleClickModal(page, {
          rowText: 'QI-STYLE-L1',
          titleText: '质量检验详情',
          scenarioName: 'business-row-double-click-quality-inspection',
          screenshotName:
            'business-formal-quality-inspection-double-click-details',
          afterModalOpen: async (modal) => {
            await modal
              .getByText('PR-STYLE-L1', { exact: false })
              .first()
              .waitFor({ state: 'visible' })
            await modal
              .getByText('INV-LOT-001', { exact: false })
              .first()
              .waitFor({ state: 'visible' })
            await modal
              .getByText('质检附件', { exact: false })
              .first()
              .waitFor({ state: 'visible' })
          },
        })

        await gotoScenarioPath(page, '/erp/warehouse/shipments', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await verifyBusinessRowDoubleClickModal(page, {
          rowText: 'SHIP-STYLE-L1',
          titleText: '查看出货明细',
          scenarioName: 'business-row-double-click-shipment',
          screenshotName: 'business-formal-shipment-double-click-details',
          afterModalOpen: async () => {
            await expectText(page, '已保存出货明细')
          },
        })
      },
    },
  ]
}

export function createBusinessHeaderScenarios(deps) {
  const {
    assert,
    assertBusinessMainTableSortableColumns,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    {
      name: 'business-table-headers-single-line-desktop',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '产品档案')
        await expectText(page, 'PROD-STYLE-L1')
        await expectText(page, '产品单重（净重）')
        await assertERPThemeMode(page, {
          scenarioName: 'business-table-headers-single-line-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-table-headers-single-line-desktop',
        })
        await assertNoHorizontalOverflow(
          page,
          'business-table-headers-single-line-desktop'
        )
        await page.locator('.erp-business-data-table-card').screenshot({
          path: path.join(
            outputDir,
            'business-table-headers-single-line-dark-desktop.png'
          ),
        })

        const firstSortableHeader = page
          .locator(
            '.erp-business-data-table-card .ant-table-thead th.ant-table-column-has-sorters'
          )
          .first()
        const beforeSettings =
          await firstSortableHeader.getAttribute('aria-sort')
        const settingsTrigger = await openBusinessTableTool(page, '列设置')
        const columnDialog = page.getByRole('dialog', { name: /^列设置/u })
        await columnDialog.waitFor({ state: 'visible' })
        await page.waitForFunction(() =>
          Boolean(document.activeElement?.closest('.ant-modal'))
        )
        assert.equal(
          await firstSortableHeader.getAttribute('aria-sort'),
          beforeSettings,
          '工具栏列设置不应改变当前排序'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'business-table-headers-column-settings-dark.png'
          ),
        })
        await page.keyboard.press('Escape')
        await columnDialog.waitFor({ state: 'hidden' })
        assert(
          await settingsTrigger.evaluate(
            (node) => node === document.activeElement
          ),
          '关闭列设置后焦点应回到触发按钮'
        )
        await page.mouse.move(0, 0)
        await page.waitForTimeout(120)

        await page
          .locator(
            '.erp-business-data-table-card .ant-table-content, .erp-business-data-table-card .ant-table-body'
          )
          .first()
          .evaluate((node) => {
            node.scrollLeft = node.scrollWidth - node.clientWidth
          })
        await page.waitForTimeout(120)
        await page.locator('.erp-business-data-table-card').screenshot({
          path: path.join(
            outputDir,
            'business-table-headers-single-line-dark-right-edge.png'
          ),
        })

        await page.setViewportSize({ width: 760, height: 900 })
        await page.waitForTimeout(180)
        await assertBusinessMainTableSortableColumns(page, {
          scenarioName: 'business-table-headers-single-line-narrow',
        })
        await assertNoHorizontalOverflow(
          page,
          'business-table-headers-single-line-narrow'
        )
        const tableScrollableWidth = await page
          .locator(
            '.erp-business-data-table-card .ant-table-content, .erp-business-data-table-card .ant-table-body'
          )
          .first()
          .evaluate((node) => node.scrollWidth - node.clientWidth)
        assert(
          tableScrollableWidth > 1,
          `产品档案窄屏态应保留表格内横向滚动: ${tableScrollableWidth}`
        )
        await page.locator('.erp-business-data-table-card').screenshot({
          path: path.join(
            outputDir,
            'business-table-headers-single-line-dark-narrow.png'
          ),
        })
      },
    },
  ]
}
