import { waitForFiniteAnimations } from './browserReadiness.mjs'

import { stylePaginatedRpcData } from './rpcMockResult.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreInventory(page, deps) {
  const {
    assert,
    assertBusinessHeaderCompact,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessPageRefreshEntrypoint,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectHeading,
    expectNoButton,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
    verifyBusinessRowDoubleClickModal,
  } = deps
  const { assertUnifiedListToolbarShell, assertBusinessTableEmptyState } =
    createBusinessFormalAssertions(deps)
  await gotoScenarioPath(page, '/erp/warehouse/inventory', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '库存台账')

  await assertTextAbsent(page, '余额只读')

  await assertBusinessHeaderCompact(page, {
    scenarioName: 'business-standard-inventory',
  })

  await assertTextAbsent(page, '查看内容')

  await expectText(page, '12.5')

  await expectText(page, '已预留')

  await expectText(page, '4')

  await expectText(page, '可用量')

  await expectText(page, '8.5')

  await expectText(page, 'SKU-STYLE-L1')

  await page
    .locator('.erp-business-operation-panel button[aria-haspopup="dialog"]')
    .click()

  await page.getByRole('dialog', { name: '筛选条件' }).waitFor()

  await waitForFiniteAnimations(page)

  const inventoryFilterControls = page.locator(
    '.erp-business-filter-popover .erp-business-operation-panel__filters :is(.ant-select, .erp-business-filter-choices)'
  )

  assert.equal(
    await inventoryFilterControls.count(),
    6,
    '库存余额筛选区应包含存货类型、材料类别、具体对象、产品规格、仓库和批次'
  )

  for (const name of ['存货类型', '材料库存类别']) {
    assert.equal(
      await page.getByRole('group', { name, exact: true }).count(),
      1
    )
  }
  for (const name of ['材料或产品', '产品规格', '仓库', '批次']) {
    assert.equal(
      await page.getByRole('combobox', { name, exact: true }).count(),
      1
    )
  }

  const inventorySKUFilter = inventoryFilterControls.filter({
    has: page.getByRole('combobox', { name: '产品规格', exact: true }),
  })

  assert.equal(
    await inventorySKUFilter
      .getAttribute('class')
      .then((value) => String(value || '').includes('ant-select-disabled')),
    true,
    '非成品类型时产品规格筛选应禁用'
  )

  assert.equal(
    await page
      .getByRole('group', { name: '材料库存类别', exact: true })
      .getByRole('button', { name: '全部材料类别', exact: true })
      .isDisabled(),
    false
  )

  await page
    .getByRole('group', { name: '存货类型', exact: true })
    .getByRole('button', { name: '成品', exact: true })
    .click()

  await inventorySKUFilter
    .locator('input:not(:disabled)')
    .waitFor({ state: 'visible' })

  assert.equal(
    await page
      .getByRole('group', { name: '材料库存类别', exact: true })
      .getByRole('button', { name: '全部材料类别', exact: true })
      .isDisabled(),
    true
  )

  await inventorySKUFilter.click()

  await inventorySKUFilter.locator('input').fill('SKU-STYLE-L1')

  await page.keyboard.press('Enter')

  await inventorySKUFilter
    .locator('.ant-select-selection-item')
    .filter({ hasText: 'SKU-STYLE-L1' })
    .waitFor({ state: 'visible' })

  const inventorySKUMetrics = await page.evaluate(() => {
    const filters = document.querySelector(
      '.erp-business-filter-popover .erp-business-operation-panel__filters'
    )
    const table = document.querySelector(
      '.erp-inventory-ledger-page .ant-table-content'
    )
    const filterRect = filters?.getBoundingClientRect()
    const controls = Array.from(filters?.children || []).map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      }
    })
    return {
      filterOverflowX: filters ? filters.scrollWidth - filters.clientWidth : -1,
      controlsInsideFilters: controls.every(
        (rect) =>
          rect.left >= (filterRect?.left || 0) - 1 &&
          rect.right <= (filterRect?.right || 0) + 1
      ),
      tableOverflowX: table ? table.scrollWidth - table.clientWidth : -1,
      documentOverflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })

  assert(
    inventorySKUMetrics.filterOverflowX <= 1 &&
      inventorySKUMetrics.controlsInsideFilters &&
      inventorySKUMetrics.tableOverflowX > 1 &&
      inventorySKUMetrics.documentOverflowX === 0,
    `库存 SKU 筛选应在筛选区内换行，宽表只在表格内滚动: ${JSON.stringify(
      inventorySKUMetrics
    )}`
  )

  await page.screenshot({
    path: path.join(outputDir, 'business-formal-inventory-sku-grain.png'),
    fullPage: true,
  })

  await page
    .getByRole('dialog', { name: '筛选条件', exact: true })
    .getByRole('button', { name: '清空筛选', exact: true })
    .click()

  await page.setViewportSize({ width: 390, height: 844 })

  await waitForFiniteAnimations(page)

  const inventoryNarrowMetrics = await page.evaluate(() => {
    const filters = document.querySelector(
      '.erp-business-filter-popover .erp-business-operation-panel__filters'
    )
    const table = document.querySelector(
      '.erp-inventory-ledger-page .ant-table-content'
    )
    const filterRect = filters?.getBoundingClientRect()
    const controls = Array.from(filters?.children || []).map((node) => {
      const rect = node.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
      }
    })
    return {
      filterWidth: filterRect?.width || 0,
      filterOverflowX: filters ? filters.scrollWidth - filters.clientWidth : -1,
      controlsInsideFilters: controls.every(
        (rect) =>
          rect.left >= (filterRect?.left || 0) - 1 &&
          rect.right <= (filterRect?.right || 0) + 1 &&
          rect.width <= (filterRect?.width || 0) + 1
      ),
      tableOverflowX: table ? table.scrollWidth - table.clientWidth : -1,
      documentOverflowX:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    }
  })

  await assertNoHorizontalOverflow(
    page,
    'business-core-inventory-open-filter-narrow'
  )
  assert(
    inventoryNarrowMetrics.filterWidth > 0 &&
      inventoryNarrowMetrics.filterOverflowX <= 1 &&
      inventoryNarrowMetrics.controlsInsideFilters &&
      inventoryNarrowMetrics.tableOverflowX > 1 &&
      inventoryNarrowMetrics.documentOverflowX === 0,
    `库存 SKU 筛选在窄视口应留在筛选卡片内，宽表继续内部滚动: ${JSON.stringify(
      inventoryNarrowMetrics
    )}`
  )

  await page.screenshot({
    path: path.join(
      outputDir,
      'business-formal-inventory-sku-grain-narrow.png'
    ),
    fullPage: true,
  })

  await page.setViewportSize({ width: 1440, height: 900 })

  await page.waitForTimeout(160)

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-standard-inventory',
  })

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-standard-inventory',
  })

  await expectNoButton(page, '新建库存')

  await expectNoButton(page, '新建库存调整')

  await expectNoButton(page, '生成库存调整')

  await assertBusinessMainTableHasNoOperationColumn(page, {
    scenarioName: 'business-standard-inventory',
  })

  let forceEmptyInventoryBalances = false

  await page.route('**/rpc/inventory', async (route) => {
    const body = route.request().postDataJSON() || {}
    if (
      forceEmptyInventoryBalances &&
      body.method === 'list_inventory_balances'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || 'business-standard-inventory-empty-search',
          result: {
            code: 0,
            message: 'OK',
            data: stylePaginatedRpcData(
              [],
              'inventory_balances',
              body.params || {}
            ),
          },
        }),
      })
      return
    }
    await route.fallback()
  })

  await page.getByText('12.5', { exact: false }).first().click()

  forceEmptyInventoryBalances = true

  await page.getByRole('button', { name: '刷新当前页' }).click()

  await assertBusinessTableEmptyState(page, {
    scenarioName: 'business-standard-inventory-balances-empty-search',
    emptyText: '暂无库存余额',
    staleText: '12.5',
  })

  forceEmptyInventoryBalances = false

  await page.getByRole('button', { name: '刷新当前页' }).click()

  await expectText(page, '12.5')

  await verifyBusinessRowDoubleClickModal(page, {
    rowText: '12.5',
    titleText: '库存余额详情',
    scenarioName: 'business-standard-inventory-balances',
    screenshotName: 'business-formal-inventory-double-click-details',
    afterModalOpen: async () => {
      await expectText(page, '当前弹窗只用于库存查询和追溯')
      await expectText(page, 'SKU-STYLE-L1')
    },
  })

  await page.getByRole('tab', { name: '库存批次' }).click()

  await expectText(page, 'INV-LOT-001')

  await expectText(page, 'SUP-LOT-001')

  await expectText(page, '冻结')

  await assertBusinessMainTableHasNoOperationColumn(page, {
    scenarioName: 'business-standard-inventory-lots',
  })

  await page.getByRole('tab', { name: '库存变动记录' }).click()

  await expectText(page, '撤销调整')

  await expectText(page, '其他来源')

  await expectText(page, '未提供业务单号')

  await expectText(page, '已关联来源明细')

  await expectText(page, '已关联原库存变动记录')

  await expectText(page, 'ledger seed')

  await assertTextAbsent(page, 'MANUAL_SEED')

  await assertTextAbsent(page, 'INV-TXN-001')

  await assertTextAbsent(page, '9001')

  await assertTextAbsent(page, '9002')

  await assertTextAbsent(page, '888500999')

  await assertBusinessMainTableHasNoOperationColumn(page, {
    scenarioName: 'business-standard-inventory-txns',
  })

  await assertNoHorizontalOverflow(page, 'business-standard-inventory')
}
