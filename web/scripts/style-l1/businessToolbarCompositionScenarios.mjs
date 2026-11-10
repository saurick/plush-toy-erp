import { writeFile } from 'node:fs/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertBusinessListSurfaceSpacing } from './businessTableAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { INVENTORY_VIEWS, WAREHOUSE_HANDLING_VIEWS } from '../../src/erp/utils/warehouseViews.mjs'
import { createOutsourcingSummaryScenarios } from './outsourcingSummaryScenarios.mjs'

export function createBusinessToolbarCompositionScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession, gotoScenarioPath, outputDir, path }) {
  const session = { ...customerRuntimeEffectiveSession, pages: [...new Set([...customerRuntimeEffectiveSession.pages, 'history-records'])] }
  async function inspect(page, label, width) {
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    const command = page.locator('.erp-business-operation-panel__command').first()
    const metrics = await command.evaluate((element) => {
      const box = element.getBoundingClientRect()
      const groups = [...element.children].flatMap((child) => child.classList.contains('erp-business-operation-panel__command-host') ? [...child.children] : [child])
      const pageRoot = element.closest('.erp-business-page-layout')
      const heading = pageRoot?.querySelector(':scope > .erp-business-page-header-card')
      const panel = element.closest('.erp-business-operation-panel')
      const headingBox = heading?.getBoundingClientRect()
      const panelBox = panel?.getBoundingClientRect()
      const headerSpacing = headingBox?.height > 0 && panelBox?.height > 0
        ? { actual: panelBox.top - headingBox.bottom, expected: parseFloat(getComputedStyle(pageRoot).getPropertyValue('--erp-page-gap')) }
        : null
      return { command: box.toJSON(), headerSpacing, groups: groups.map((group) => ({ name: group.className, ...group.getBoundingClientRect().toJSON() })).filter((group) => group.width > 1) }
    })
    for (const group of metrics.groups) {
      assert.ok(group.left >= metrics.command.left - 1 && group.right <= metrics.command.right + 1, `${label} 工具组应在所属栏内: ${JSON.stringify(metrics)}`)
      assert.ok(group.top >= metrics.command.top - 1 && group.bottom <= metrics.command.bottom + 1, `${label} 工具组应完整可见: ${JSON.stringify(metrics)}`)
    }
    if (metrics.headerSpacing) {
      assert.ok(Math.abs(metrics.headerSpacing.actual - metrics.headerSpacing.expected) <= 1, `${label} 标题与查询区沿用页面标准间距: ${JSON.stringify(metrics.headerSpacing)}`)
    }
    assert.equal(await page.locator('.erp-business-page-header-card--secondary').count(), 0, `${label} 内容分类不另起页头`)
    assert.doesNotMatch(await page.locator('.erp-admin-outlet').first().innerText(), /业务决定|共用交互|共用位置|按权限出现|扩展分类 [A-E]/u)
    await assertNoHorizontalOverflow(page, `${label}-${width}`)
    return { label, width, ...metrics }
  }
  const orderExamples = [
    { key: 'purchase', path: '/erp/purchase/accessories', labels: ['订单列表', '采购跟进'] },
    { key: 'sales', path: '/erp/sales/project-orders/sales-orders', labels: ['订单列表', '交付进度'] },
  ].map((example) => ({
    name: `business-toolbar-composition-${example.key}`,
    path: example.path,
auth: 'admin',
effectiveSession: session,
    viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
    verify: async (page) => {
      const navigation = page.locator('.erp-business-operation-panel__content-switch').getByRole('tablist', { name: '查询视图', exact: true })
      await navigation.getByRole('tab', { name: example.labels[0], selected: true, exact: true }).waitFor()
      await navigation.evaluate((element) => { window.__toolbarContentNavigation = element })
      await page.locator('.erp-business-operation-panel__command').first().evaluate((element) => { window.__toolbarCommand = element })
      const evidence = []
      for (const width of [1920, 1366, 820, 390]) {
        await page.setViewportSize({ width, height: 1080 })
        for (const label of [...example.labels.slice(1), example.labels[0]]) {
          await navigation.getByRole('tab', { name: label, exact: true }).click()
          await navigation.getByRole('tab', { name: label, selected: true, exact: true }).waitFor()
          await page.locator('.erp-business-operation-panel__search input').first().waitFor()
          assert.equal(await navigation.evaluate((element) => element === window.__toolbarContentNavigation), true, `${label} 分类条保持挂载`)
          assert.equal(await page.locator('.erp-business-operation-panel__command').first().evaluate((element) => element === window.__toolbarCommand), true, `${label} 工具栏保持挂载`)
          evidence.push(await inspect(page, `${example.key}-${label}`, width))
        }
      }
      await page.setViewportSize({ width: 1920, height: 1080 })
      const search = page.locator('.erp-business-operation-panel__search input').first()
      await search.fill('STYLE')
      await search.press('Enter')
      await navigation.getByRole('tab', { name: example.labels[1], exact: true }).click()
      await navigation.getByRole('tab', { name: example.labels[0], exact: true }).click()
      assert.equal(await search.inputValue(), 'STYLE', '往返视图保留本页已提交查询')
      const tools = page.getByRole('button', { name: '表格工具', exact: true })
      await tools.click()
      await page.getByRole('menuitem', { name: /列设置/u }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('menuitem', { name: /列设置/u }).waitFor({ state: 'hidden' })
      await page.screenshot({ path: path.join(outputDir, `toolbar-${example.key}-4k.png`) })
      const headingBox = await page.locator('.erp-business-page-header-card').first().boundingBox()
      const commandBox = await page.locator('.erp-business-operation-panel__command').first().boundingBox()
      await page.screenshot({ path: path.join(outputDir, `toolbar-${example.key}-header.png`), clip: { x: headingBox.x, y: headingBox.y, width: headingBox.width, height: commandBox.y + commandBox.height - headingBox.y } })
      await writeFile(path.join(outputDir, `toolbar-${example.key}-geometry.json`), JSON.stringify(evidence, null, 2))
    },
  }))
  return [
    ...orderExamples,
    ...[
      { key: 'light', width: 1920 },
      { key: 'dark-narrow', width: 1024, themeMode: 'dark' },
      { key: 'phone-width', width: 390 },
    ].map(({ key, width, themeMode = 'light' }) => ({
      name: `business-list-surface-spacing-${key}`,
      path: '/erp/purchase/processing-contracts',
      auth: 'admin',
      effectiveSession: session,
      themeMode,
      viewport: { width, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: createOutsourcingSummaryScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession, outputDir })[0].beforeNavigate,
      verify: async (page) => {
        const entries = [
          { key: 'outsourcing', path: '/erp/purchase/processing-contracts', navigation: '委外订单内容分类', labels: ['加工合同', '加工明细'] },
          ...Object.entries(WAREHOUSE_HANDLING_VIEWS).map(([direction, views]) => ({ key: direction, path: `/erp/warehouse/${direction}`, navigation: direction === 'inbound' ? '入库办理分类' : '出库办理分类', labels: views.map(({ label }) => label) })),
          { key: 'inventory', path: '/erp/warehouse/inventory', navigation: '库存查询分类', labels: INVENTORY_VIEWS.map(({ label }) => label) },
          { key: 'purchase', path: '/erp/purchase/accessories', navigation: '查询视图', labels: ['订单列表', '采购跟进'] },
          { key: 'sales', path: '/erp/sales/project-orders/sales-orders', navigation: '查询视图', labels: ['订单列表', '交付进度'] },
        ]
        const evidence = []
        for (const entry of entries) {
          if (new URL(page.url()).pathname !== entry.path) await gotoScenarioPath(page, entry.path, { waitUntil: 'domcontentloaded' })
          const navigation = page.getByRole('tablist', { name: entry.navigation, exact: true })
          await navigation.waitFor()
          // 往返后重新测量，保留已加载样式及共享工具栏。
          for (const label of [...entry.labels, entry.labels[0]]) {
            await navigation.getByRole('tab', { name: label, exact: true }).click()
            await navigation.getByRole('tab', { name: label, selected: true, exact: true }).waitFor()
            await page.locator('.erp-business-operation-panel__search input').first().waitFor()
            await waitForFiniteAnimations(page)
            await page.locator('.erp-admin-content').evaluate((node) => { node.scrollTop = 0 })
            evidence.push(await assertBusinessListSurfaceSpacing(page, `${entry.key}-${label}-${key}`, { tableView: !['采购跟进', '交付进度'].includes(label) }))
            await assertNoHorizontalOverflow(page, `${entry.key}-${label}-${key}`)
          }
          if (['outsourcing', 'inbound', 'outbound'].includes(entry.key)) await page.screenshot({ path: path.join(outputDir, `list-spacing-${entry.key}-${key}.png`) })
        }
        await writeFile(path.join(outputDir, `list-spacing-${key}.json`), JSON.stringify(evidence, null, 2))
      },
    })),
    {
      name: 'business-list-surface-spacing-recovery',
      path: '/erp/purchase/processing-contracts',
      auth: 'admin',
      effectiveSession: session,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/outsourcing_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_outsourcing_orders' || params.keyword !== 'SPACING-NO-RESULT') return route.fallback()
          await new Promise((resolve) => setTimeout(resolve, 1000))
          await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData([], 'outsourcing_orders', params)) } })
        })
      },
      verify: async (page) => {
        const evidence = []
        const rows = page.locator('.erp-outsourcing-orders-page .erp-business-data-table-card tbody tr.ant-table-row')
        await rows.first().waitFor()
        await rows.first().click()
        await page.locator('.erp-outsourcing-orders-page tr.ant-table-row-selected').waitFor()
        await waitForFiniteAnimations(page)
        evidence.push(await assertBusinessListSurfaceSpacing(page, '已选择当前记录'))
        const search = page.locator('.erp-business-operation-panel__search input').first()
        await search.fill('SPACING-NO-RESULT')
        await search.press('Enter')
        await page.locator('.erp-business-data-table-card .ant-spin-spinning').waitFor()
        evidence.push(await assertBusinessListSurfaceSpacing(page, '列表加载中'))
        await page.getByText('暂无加工合同', { exact: true }).waitFor()
        evidence.push(await assertBusinessListSurfaceSpacing(page, '空结果'))
        await search.fill('')
        await search.press('Enter')
        await rows.first().waitFor()
        await waitForFiniteAnimations(page)
        evidence.push(await assertBusinessListSurfaceSpacing(page, '清空搜索后恢复'))
        await page.screenshot({ path: path.join(outputDir, 'list-spacing-recovery-4k.png') })
        await writeFile(path.join(outputDir, 'list-spacing-recovery.json'), JSON.stringify(evidence, null, 2))
      },
    },
    {
      name: 'business-toolbar-form-entry',
path: '/erp/warehouse/outbound?warehouse_view=shipment',
auth: 'admin',
effectiveSession: session,
      viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
      verify: async (page) => {
        const navigation = page.getByRole('tablist', { name: '出库办理分类', exact: true })
        await navigation.getByRole('tab', { name: '销售出货', selected: true, exact: true }).waitFor()
        await navigation.evaluate((element) => { window.__toolbarFormNavigation = element })
        await page.getByRole('button', { name: '新建出货单' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: '新建出货单', exact: true }).waitFor()
        await page.waitForFunction(() => document.querySelector('.erp-business-form-page:not([hidden])')?.getAttribute('aria-busy') === 'false')
        assert.equal(await page.locator('.erp-business-toolbar-workspace > .erp-business-operation-panel').isVisible(), false, '整页编辑隐藏父工作区的查询和分类')
        await page.screenshot({ path: path.join(outputDir, 'toolbar-form-entry-4k.png') })
        await editor.getByRole('button', { name: '返回列表', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        await navigation.waitFor()
        assert.equal(await navigation.evaluate((element) => element === window.__toolbarFormNavigation), true, '返回列表复用原分类条')
        await page.getByRole('button', { name: '表格工具', exact: true }).waitFor()
        await inspect(page, 'warehouse-form-return', 1920)
      },
    },
    {
      name: 'business-toolbar-composition-history',
path: '/erp/history',
auth: 'admin',
effectiveSession: session,
      viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
      verify: async (page) => {
        const picker = page.getByRole('combobox', { name: '历史记录类型', exact: true })
        await picker.waitFor()
        assert.equal(await page.locator('.erp-business-operation-panel__content-switch').locator(picker).count(), 1)
        await page.locator('.ant-select').filter({ has: picker }).locator('.ant-select-selector').click()
        await picker.fill('销售订单')
        await page.locator('.ant-select-dropdown:visible').getByText('销售订单', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        await page.waitForFunction(() => new URL(location.href).searchParams.get('source') === 'sales_orders')
        assert.equal(await page.locator('.erp-business-operation-panel__primary').count(), 0, '历史记录没有新建动作')
        const evidence = []
        for (const width of [1920, 1366, 820, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          evidence.push(await inspect(page, 'history', width))
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'toolbar-history-4k.png') })
        await writeFile(path.join(outputDir, 'toolbar-history-geometry.json'), JSON.stringify(evidence, null, 2))
      },
    },
    {
      name: 'business-toolbar-dynamic-options-growth',
path: '/erp/warehouse/inventory?view=balances',
auth: 'admin',
effectiveSession: session,
      viewport: { width: 1366, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/**', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_warehouses', 'list_material_warehouses'].includes(method)) return route.fallback()
          const warehouses = Array.from({ length: 30 }, (_, index) => ({ id: index + 1, code: `WH-TOOLBAR-${index + 1}`, name: `布局核对仓库 ${String(index + 1).padStart(2, '0')} · 长名称材料与成品存放区`, status: 'ACTIVE', is_active: true }))
          await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(warehouses, 'warehouses', params)) } })
        })
      },
      verify: async (page) => {
        const categories = page.getByRole('tablist', { name: '库存查询分类', exact: true })
        await categories.getByRole('tab', { name: '库存余额', selected: true, exact: true }).waitFor()
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        const picker = page.getByRole('combobox', { name: '仓库', exact: true })
        await page.locator('.ant-select').filter({ has: picker }).locator('.ant-select-selector').click()
        await picker.fill('仓库 30')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '布局核对仓库 30 · 长名称材料与成品存放区' }).click()
        await page.getByRole('button', { name: '完成', exact: true }).click()
        assert.equal(await categories.getByRole('tab').count(), 3, '动态仓库名单增长不增加库存内容分类')
        const evidence = await inspect(page, 'inventory-30-warehouses', 1366)
        await page.screenshot({ path: path.join(outputDir, 'toolbar-dynamic-options-growth.png') })
        await writeFile(path.join(outputDir, 'toolbar-dynamic-options-growth.json'), JSON.stringify(evidence, null, 2))
      },
    },
  ]
}
