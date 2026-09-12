export function createBusinessColumnPriorityScenarios({
  assert,
  customerRuntimeEffectiveSession,
  gotoScenarioPath,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  const headerSelector =
    '.erp-business-data-table-card .ant-table-thead:not([aria-hidden="true"]) .erp-module-column-header-text'
  const readLabels = (page) =>
    page
      .locator(headerSelector)
      .allTextContents()
      .then((labels) => labels.map((label) => label.trim()))
  const waitForLeadingLabels = (page, expected) =>
    page.waitForFunction(
      ({ selector, expected }) => {
        const labels = Array.from(document.querySelectorAll(selector)).map(
          (node) => node.textContent.trim()
        )
        return expected.every((label, index) => labels[index] === label)
      },
      { selector: headerSelector, expected }
    )

  const assertVisibleColumns = async (page, required, name) => {
    const metrics = await page.evaluate(
      ({ selector, required }) => {
        const card = document.querySelector('.erp-business-data-table-card')
        const scroller = card?.querySelector(
          '.ant-table-body, .ant-table-content'
        )
        const frame = scroller?.getBoundingClientRect()
        const columns = Array.from(document.querySelectorAll(selector))
          .filter((node) => required.includes(node.textContent.trim()))
          .map((node) => {
            const rect = node.closest('th').getBoundingClientRect()
            return {
              label: node.textContent.trim(),
              left: rect.left,
              right: rect.right,
            }
          })
        return { left: frame?.left, right: frame?.right, columns }
      },
      { selector: headerSelector, required }
    )
    assert.equal(metrics.columns.length, required.length, `${name} 缺少关键列`)
    assert(
      metrics.columns.every(
        (column) =>
          column.left >= metrics.left - 1 && column.right <= metrics.right + 1
      ),
      `${name} 关键列应无需横向滚动即可完整看到: ${JSON.stringify(metrics)}`
    )
  }

  const verifySavedOrderAndReset = async (page, targetLabel, direction) => {
    const defaults = await readLabels(page)
    const target = page
      .locator(headerSelector)
      .filter({ hasText: targetLabel })
      .first()
    const cell = target.locator('xpath=ancestor::th')
    await cell.locator('.erp-module-column-header-trigger').click()
    const menu = page.locator('.ant-dropdown:not(.ant-dropdown-hidden)').last()
    const saved = page.waitForResponse((response) => {
      if (!response.url().includes('/rpc/admin')) return false
      return (
        response.request().postDataJSON()?.method === 'set_erp_column_order'
      )
    })
    await menu.getByText(direction, { exact: true }).click()
    await saved
    const expected = defaults.filter((label) => label !== targetLabel)
    if (direction === '移到最前') expected.unshift(targetLabel)
    else expected.push(targetLabel)
    await waitForLeadingLabels(page, expected)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForLeadingLabels(page, expected)
    assert.deepEqual(
      await readLabels(page),
      expected,
      '刷新后应保留个人排列及展示列标识'
    )

    await page
      .locator(headerSelector)
      .first()
      .locator('xpath=ancestor::th')
      .locator('.erp-module-column-header-trigger')
      .click()
    await page
      .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      .last()
      .getByText('打开列顺序面板', { exact: true })
      .click()
    const dialog = page.getByRole('dialog', { name: '调整列表列顺序' })
    await dialog.getByRole('button', { name: '恢复默认' }).click()
    const reset = page.waitForResponse((response) => {
      if (!response.url().includes('/rpc/admin')) return false
      const body = response.request().postDataJSON()
      return (
        body?.method === 'set_erp_column_order' &&
        body.params?.order?.length === 0
      )
    })
    await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
    await reset
    await waitForLeadingLabels(page, defaults)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForLeadingLabels(page, defaults)
    assert.deepEqual(
      await readLabels(page),
      defaults,
      '恢复默认后应采用当前业务优先级'
    )
  }

  return [
    {
      name: 'business-column-priority-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const cases = [
          [
            '/erp/sales/project-orders/sales-orders',
            ['订单号', '客户', '状态', '计划交付日期'],
            ['订单总额', '币种'],
          ],
          ['/erp/master/partners/customers', ['编号', '名称', '状态']],
          ['/erp/master/partners/suppliers', ['编号', '名称', '状态']],
          ['/erp/master/products', ['产品编号', '产品名称', '状态']],
          [
            '/erp/master/products?catalog=product_skus',
            ['产品', 'SKU 编号', 'SKU 名称', '状态'],
          ],
          ['/erp/master/materials', ['系统物料编号', '名称', '状态']],
          ['/erp/engineering/processes', ['环节编号', '环节名称', '状态']],
          [
            '/erp/purchase/material-bom',
            ['产品', 'BOM 版本', '状态', '生效开始'],
          ],
          [
            '/erp/purchase/accessories',
            ['采购单号', '供应商', '状态', '预计到货日期'],
          ],
          [
            '/erp/purchase/processing-contracts',
            ['加工合同号', '加工厂', '状态', '预计回货日期'],
          ],
          [
            '/erp/production/quality-inspections',
            ['质检单号', '状态', '判定', '产品 / 材料 / 在制品'],
          ],
          [
            '/erp/warehouse/inbound',
            ['入库单号', '状态', '供应商', '收货日期'],
          ],
          [
            '/erp/warehouse/shipments',
            ['出货单号', '状态', '客户', '计划出货日期 / 实际出货日期'],
          ],
          [
            '/erp/warehouse/inventory?view=balances',
            ['材料 / 产品', '产品规格', '仓库', '可用量'],
            ['单位'],
          ],
          [
            '/erp/warehouse/inventory?view=lots',
            ['批次号', '状态', '材料 / 产品'],
          ],
          [
            '/erp/warehouse/inventory?view=txns',
            ['发生时间', '材料 / 产品', '产品规格', '方向'],
          ],
          [
            '/erp/warehouse/outbound',
            ['单号', '状态', '产品 / 规格', '预留数量'],
          ],
          [
            '/erp/finance/receivables',
            ['单号', '状态', '客户', '到期日期'],
            ['金额', '币种'],
          ],
          [
            '/erp/finance/payables',
            ['单号', '状态', '供应商', '到期日期'],
            ['金额', '币种'],
          ],
          ['/erp/finance/invoices', ['单号', '状态', '客户', '金额'], ['币种']],
          [
            '/erp/finance/reconciliation',
            ['单号', '状态', '往来方', '金额'],
            ['币种'],
          ],
          [
            '/erp/finance/payments',
            ['收付款单号', '状态', '往来方', '方向'],
            ['金额', '币种'],
          ],
          [
            '/erp/finance/payments',
            ['红冲单号', '状态', '来源财务记录'],
            [],
            '红冲记录',
          ],
          [
            '/erp/production/orders',
            ['生产单号', '状态', '计划开始', '计划结束'],
          ],
          [
            '/erp/production/exceptions',
            ['异常单号', '异常类型', '审批状态', '业务状态'],
            [],
            '处置申请',
          ],
        ]
        for (const [url, leading, extra = [], tab] of cases) {
          console.info(`[style:l1:columns] ${url}${tab ? ` ${tab}` : ''}`)
          await gotoScenarioPath(page, url, { waitUntil: 'domcontentloaded' })
          if (tab)
            await page.getByRole('tab', { name: tab, exact: true }).click()
          await waitForLeadingLabels(page, leading)
          await assertVisibleColumns(page, [...leading, ...extra], url)
          await assertNoHorizontalOverflow(page, url)
        }

        await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
          waitUntil: 'domcontentloaded',
        })
        await waitForLeadingLabels(page, ['订单号', '客户', '状态'])
        await page.setViewportSize({ width: 1280, height: 900 })
        await assertVisibleColumns(
          page,
          ['订单号', '客户', '状态', '计划交付日期'],
          '销售订单常用窗口'
        )
        await page.locator('.erp-business-data-table-card').screenshot({
          path: path.join(outputDir, 'business-column-priority-sales-1280.png'),
        })
        await verifySavedOrderAndReset(page, '状态', '移到最后')

        await page.setViewportSize({ width: 1440, height: 900 })
        await gotoScenarioPath(page, '/erp/warehouse/shipments', {
          waitUntil: 'domcontentloaded',
        })
        await waitForLeadingLabels(page, ['出货单号', '状态', '客户'])
        await verifySavedOrderAndReset(
          page,
          '计划出货日期 / 实际出货日期',
          '移到最前'
        )

        await page.setViewportSize({ width: 760, height: 900 })
        const scrollArea = page
          .locator(
            '.erp-business-data-table-card .ant-table-content, .erp-business-data-table-card .ant-table-body'
          )
          .first()
        const scroll = await scrollArea.evaluate((node) => {
          node.scrollLeft = node.scrollWidth - node.clientWidth
          return {
            left: node.scrollLeft,
            width: node.clientWidth,
            total: node.scrollWidth,
          }
        })
        assert(
          scroll.total > scroll.width && scroll.left > 0,
          '窄屏宽表应能在表内横向滚动'
        )
        await assertNoHorizontalOverflow(page, '出货列表窄屏横向滚动')
        await scrollArea.evaluate((node) => {
          node.scrollLeft = 0
        })
        await page.locator('.erp-business-data-table-card').screenshot({
          path: path.join(
            outputDir,
            'business-column-priority-shipments-760.png'
          ),
        })
      },
    },
  ]
}
