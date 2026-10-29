import { readFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { yoyoosunRoleFlowMatrix } from '../../../config/customers/yoyoosun/roleFlowMatrix.mjs'
import { businessModuleDefinitions } from '../../src/erp/config/businessModules.mjs'
import { navigationItemRegistry } from '../../src/erp/config/seedData.mjs'

const customers = Array.from({ length: 201 }, (_, index) => ({
  id: index + 1,
  code: `HISTORY-${String(index + 1).padStart(3, '0')}`,
  name: `历史客户${index + 1}`,
  is_active: false,
  note: index
    ? '历史查询浏览器样例'
    : '长文本用于验证历史摘要自动换行与详情完整展示。'.repeat(8),
  updated_at: 1790430000,
  created_at: 1780430000,
}))

export function createHistoryRecordScenarios(deps) {
  const {
    assert,
    expectHeading,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
  } = deps
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    pages: [
      ...new Set([...customerRuntimeEffectiveSession.pages, 'history-records']),
    ],
  }
  const historyAccessScenarios = [
    { key: 'engineering', roles: ['engineering'], allowed: true, requestedSource: 'processes' },
    { key: 'engineering-purchase', roles: ['engineering'], allowed: true, requestedSource: 'purchase_orders' },
    { key: 'pmc', roles: ['pmc'], allowed: true, requestedSource: 'processes' },
    { key: 'warehouse', roles: ['warehouse'], allowed: false, checkModuleHistory: true },
    { key: 'quality', roles: ['quality'], allowed: false },
    { key: 'production-manager', roles: ['production'], allowed: true },
    { key: 'production-executor', roles: ['production'], allowed: false, actions: ['erp.workbench.read', 'material.read', 'production.wip.read', 'production.wip.execute'] },
    { key: 'multi-role', roles: ['warehouse', 'finance'], allowed: true },
    { key: 'no-source', roles: ['engineering'], allowed: false, noSources: true },
    { key: 'purpose-revoked', roles: ['engineering'], allowed: false, actions: ['erp.workbench.read', 'material.read', 'product.read', 'product_sku.read', 'process.read', 'sales_order.read', 'bom.read'] },
    { key: 'system-admin', roles: [], allowed: false, noSources: true },
  ].map((scenario) => {
    const roles = yoyoosunRoleFlowMatrix.roles.filter((role) => scenario.roles.includes(role.roleKey))
    const permissions = [...new Set(roles.flatMap((role) => role.capabilityKeys))]
    const pageKeys = new Set(scenario.noSources ? ['global-dashboard'] : roles.flatMap((role) => role.menuSurfaces))
    const entries = [...businessModuleDefinitions, ...Object.values(navigationItemRegistry)]
      .filter((entry) => pageKeys.has(entry.key))
    return {
      name: `history-records-access-${scenario.key}`,
      path: `/erp/history?source=${scenario.requestedSource || 'materials'}`,
      auth: 'admin',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: {
        is_super_admin: false,
        roles: roles.length ? roles.map((role) => ({ role_key: role.roleKey, name: role.displayName })) : [{ role_key: 'admin', name: '系统管理员' }],
        permissions,
        menus: entries.map(({ key, path, label }) => ({ key, path, label })),
      },
      effectiveSession: {
        ...effectiveSession,
        roles: scenario.roles,
        pages: [...pageKeys],
        actions: scenario.actions || permissions,
      },
      beforeNavigate: async (page) => {
        page.historyAccessReads = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/')) return
          const body = request.postDataJSON()
          if (body?.params?.lifecycle_scope === 'history') page.historyAccessReads.push(body)
        })
      },
      verify: async (page) => {
        const historyMenu = page.getByRole('menuitem', { name: '历史记录中心', exact: true })
        if (scenario.allowed) {
          await expectHeading(page, '历史记录中心')
          await historyMenu.waitFor()
          await page.getByRole('combobox', { name: '历史记录类型', exact: true }).waitFor()
          await page.waitForFunction(() => !document.querySelector('.ant-spin-spinning'))
          assert(page.historyAccessReads.length > 0, '获准入口应读取现有历史来源')
          if (scenario.roles.length === 1 && scenario.roles[0] === 'engineering') {
            assert.equal(new URL(page.url()).searchParams.get('source'), 'materials')
            assert.equal(page.historyAccessReads.some((request) => request.method === 'list_purchase_orders'), false, '不可读来源不得触发历史请求')
            assert.equal(page.historyAccessReads.some((request) => request.method === 'list_processes'), false, '工序引用读取不得开放历史来源')
            await page.getByRole('combobox', { name: '历史记录类型', exact: true }).press('ArrowDown')
            await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').waitFor()
            assert.equal(await page.getByRole('option', { name: '加工环节', exact: true }).count(), 0)
            await page.keyboard.press('Escape')
            assert.equal(await page.getByRole('menuitem', { name: '加工环节', exact: true }).count(), 0)
            await page.goto(new URL('/erp/engineering/processes', page.url()).href)
            await page.waitForURL('**/erp/dashboard')
            await expectHeading(page, '工作台')
            await page.goto(new URL('/erp/history?source=materials', page.url()).href)
            await expectHeading(page, '历史记录中心')
          }
          if (scenario.key === 'pmc') {
            assert.equal(new URL(page.url()).searchParams.get('source'), 'processes')
            assert.ok(page.historyAccessReads.some((request) => request.method === 'list_processes'), 'PMC 可以查询加工环节历史')
            await page.goto(new URL('/erp/engineering/processes', page.url()).href)
            await expectHeading(page, '加工环节')
            await page.getByRole('button', { name: /新建加工环节$/u }).waitFor()
            await page.getByRole('radio').first().check()
            const edit = page.getByRole('button', { name: /编辑加工环节$/u })
            assert.ok(await edit.isEnabled(), 'PMC 可修改加工环节')
            assert.ok(await page.getByRole('button', { name: /停\s*用$/u }).isEnabled(), 'PMC 可维护启停')
            await edit.click()
            const editor = page.locator('.erp-business-form-page:not([hidden])')
            await editor.getByRole('heading', { name: '编辑加工环节', exact: true }).waitFor()
            assert.ok(await editor.getByRole('switch').first().isEnabled(), 'PMC 可编辑加工能力')
            await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          }
        } else {
          await page.waitForURL('**/erp/dashboard')
          await page.getByRole('heading', { name: '工作台', exact: true }).waitFor()
          assert.equal(await historyMenu.count(), 0, '执行岗位或无来源账号不显示集中入口')
          assert.equal(page.historyAccessReads.length, 0, '拒绝直达时不能先读取历史数据')
        }
        await assertNoHorizontalOverflow(page, `history-access-${scenario.key}`)
        await page.screenshot({ path: deps.path.join(deps.outputDir, `history-access-${scenario.key}-4k.png`) })
        if (scenario.checkModuleHistory) {
          await page.goto(new URL('/erp/master/materials?scope=history', page.url()).href)
          await page.getByRole('heading', { name: '基础资料', exact: true }).waitFor()
          await page.getByRole('tab', { name: '材料档案', exact: true }).waitFor()
          await page.waitForFunction(() => !document.querySelector('.ant-spin-spinning'))
          assert(page.historyAccessReads.some((request) => request.method === 'list_materials'), '仓库仍能在所属模块查询历史材料')
        }
      },
    }
  })
  const assertUnselectedActions = async (page) => {
    const actions = page.locator('.erp-business-selection-action-bar')
    await actions.waitFor({ state: 'visible' })
    for (const name of ['查看详情', '前往所属模块']) {
      assert.equal(
        await actions.getByRole('button', { name, exact: true }).isEnabled(),
        false,
        '有可选记录但未选择时，保留禁用的记录动作'
      )
    }
    assert.equal(await page.locator('.ant-table-row-selected').count(), 0)
  }
  const assertQueryLayout = async (page) => {
    const header = page.locator('.erp-business-page-header-card')
    const command = page.locator('.erp-business-operation-panel__command')
    assert.equal(await header.getByRole('combobox').count(), 0)
    const source = command.locator('.ant-select').filter({
      has: page.getByRole('combobox', { name: '历史记录类型', exact: true }),
    })
    await source.getByText('记录类型', { exact: true }).waitFor()
    const [headerBox, commandBox, sourceBox, searchBox] = await Promise.all([
      header.boundingBox(),
      command.boundingBox(),
      source.boundingBox(),
      page.getByPlaceholder('搜索历史记录', { exact: true }).boundingBox(),
    ])
    assert(sourceBox.y >= headerBox.y + headerBox.height, '记录类型应位于标题下方的查询栏')
    assert(sourceBox.x >= commandBox.x && sourceBox.x + sourceBox.width <= commandBox.x + commandBox.width + 1, '记录类型应完整显示在查询栏内')
    assert(sourceBox.y + sourceBox.height <= searchBox.y || sourceBox.x + sourceBox.width <= searchBox.x, '类型选择与搜索不应重叠')
  }
  const installRoute = async (page) => {
    page.historyRequests = []
    let failed = false
    await page.route('**/rpc/masterdata', async (route) => {
      const { id, method, params = {} } = route.request().postDataJSON()
      if (method !== 'list_customers') return route.fallback()
      page.historyRequests.push(params)
      if (params.keyword === '慢查询') await delay(500)
      if (params.keyword === '读取失败' && !failed) {
        failed = true
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id,
            result: { code: 50000, message: '读取失败' },
          },
        })
      }
      const rows = customers.filter(
        (row) =>
          !params.keyword ||
          params.keyword === '读取失败' ||
          JSON.stringify(row).includes(params.keyword)
      )
      await route.fulfill({
        json: {
          jsonrpc: '2.0',
          id,
          result: styleRpcResult(
            stylePaginatedRpcData(rows, 'customers', params)
          ),
        },
      })
    })
  }
  const desktop = {
    name: 'history-records-list-recovery',
    path: '/erp/history?source=customers',
    auth: 'admin',
    effectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: installRoute,
    verify: async (page) => {
      await expectHeading(page, '历史记录中心')
      await assertQueryLayout(page)
      const table = page.locator('.ant-table-tbody')
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      const source = page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '历史记录类型', exact: true }) })
      const sourceLabel = await source.locator('.ant-select-selection-item').innerText()
      await source.locator('.ant-select-clear').click()
      await page.getByText('请选择记录类型', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('source'), '')
      assert.equal(await table.getByText('HISTORY-001', { exact: true }).count(), 0)
      await page.reload()
      await page.getByText('请选择记录类型', { exact: true }).waitFor()
      await source.locator('.ant-select-selector').click()
      await page.locator('.ant-select-dropdown:visible').getByText(sourceLabel, { exact: true }).click()
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      await assertUnselectedActions(page)
      assert(
        page.historyRequests.every(
          (params) => params.lifecycle_scope === 'history'
        )
      )
      const downloadPromise = page.waitForEvent('download')
      await openBusinessTableTool(page, '导出筛选结果')
      const csv = await readFile(await (await downloadPromise).path(), 'utf8')
      assert.equal(csv.trim().split('\n').length, 202)
      assert(csv.includes('HISTORY-201'))
      assert(csv.includes('已停用'))
      assert(
        page.historyRequests.some(
          (params) => params.offset === 200 && params.limit === 200
        )
      )
      await openBusinessTableTool(page, '列设置')
      await page
        .getByRole('dialog')
        .getByText('编号 / 名称', { exact: true })
        .waitFor()
      await page.waitForFunction(() =>
        document.querySelector('.ant-modal')?.contains(document.activeElement)
      )
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await page.locator('.ant-pagination-item-2').click()
      await table.getByText('HISTORY-051', { exact: true }).waitFor()
      await table.getByText('HISTORY-051', { exact: true }).click()
      assert.equal(
        await page.getByRole('button', { name: '清空已选', exact: true }).isEnabled(),
        true,
        '选中记录后可以清空选择'
      )
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await page
        .getByRole('dialog')
        .getByText('HISTORY-051', { exact: true })
        .waitFor()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await page
        .getByRole('button', { name: '前往所属模块', exact: true })
        .click()
      await page.waitForURL(
        /\/erp\/master\/partners\/customers.*scope=history/u
      )
      await page.goBack()
      await expectHeading(page, '历史记录中心')
      await table.getByText('HISTORY-051', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('page'), '2')
      await table.getByText('HISTORY-051', { exact: true }).click()
      assert.equal(
        await page.getByRole('button', { name: '查看详情', exact: true }).isEnabled(),
        true
      )
      const search = page.getByPlaceholder('搜索历史记录', { exact: true })
      await search.fill('读取失败')
      await search.press('Enter')
      await page.getByText('历史记录加载失败', { exact: true }).waitFor()
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        0
      )
      await page.locator('.erp-business-selection-action-bar').waitFor({ state: 'hidden' })
      assert.equal(await page.getByRole('dialog').count(), 0, '读取失败后关闭旧记录详情')
      const failedQuery = page.historyRequests.at(-1)
      assert.equal(failedQuery.keyword, '读取失败')
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      assert.deepEqual(
        page.historyRequests.at(-1),
        failedQuery,
        '重新加载应沿用失败查询的来源、关键词和分页'
      )
      await page.getByText('历史记录加载失败', { exact: true }).waitFor({ state: 'hidden' })
      await assertUnselectedActions(page)
      await table.getByText('HISTORY-001', { exact: true }).click()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      const recoveredDetail = page.getByRole('dialog')
      await recoveredDetail.getByText('HISTORY-001', { exact: true }).waitFor()
      assert.equal(await recoveredDetail.getByText('HISTORY-051', { exact: true }).count(), 0)
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await page.getByRole('button', { name: '清空已选', exact: true }).click()
      await assertUnselectedActions(page)
      await search.fill('没有匹配的历史记录')
      await search.press('Enter')
      await page.getByText('当前筛选没有匹配的历史记录', { exact: true }).waitFor()
      await page.locator('.erp-business-selection-action-bar').waitFor({ state: 'hidden' })
      assert.equal(await table.locator('tr[data-row-key]').count(), 0)
      const slowRequest = page.waitForRequest((request) =>
        request.url().includes('/rpc/masterdata') &&
        request.postDataJSON()?.method === 'list_customers' &&
        request.postDataJSON()?.params?.keyword === '慢查询'
      )
      await search.fill('慢查询')
      await search.press('Enter')
      await slowRequest
      await search.fill('HISTORY-201')
      await search.press('Enter')
      await table.getByText('HISTORY-201', { exact: true }).waitFor()
      await delay(550)
      assert.equal(
        await page.locator('.ant-table-tbody tr[data-row-key]').count(),
        1
      )
      await assertUnselectedActions(page)
      await table.getByText('HISTORY-201', { exact: true }).click()
      await page.getByRole('button', { name: '查看详情', exact: true }).click()
      await page.getByRole('dialog').getByText('HISTORY-201', { exact: true }).waitFor()
      await page.getByRole('button', { name: '关闭', exact: true }).click()
      await search.fill('')
      await search.press('Enter')
      await table.getByText('HISTORY-001', { exact: true }).waitFor()
      await assertUnselectedActions(page)
      await assertNoHorizontalOverflow(page, 'history-records-list-recovery')
    },
  }
  const statusCounts = {
    ...desktop,
    name: 'history-records-status-counts',
    path: '/erp/history?source=sales_orders',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      const rows = Array.from({ length: 43 }, (_, i) => ({ id: i + 1, order_no: `HIS-SO-${i + 1}`, lifecycle_status: i < 40 ? 'closed' : 'canceled', customer_name: '历史订单', order_date: '2026-10-01', currency: 'CNY', total_amount: 10 }))
      await page.route('**/rpc/**', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_sales_orders') return route.fallback()
        assert.equal(params.lifecycle_scope, 'history')
        assert.equal(params.include_status_counts, true)
        if (params.keyword === '失败') return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '读取失败' } } })
        const facets = params.keyword ? [] : rows
        const counts = { closed: facets.filter((r) => r.lifecycle_status === 'closed').length, canceled: facets.filter((r) => r.lifecycle_status === 'canceled').length }
        const selected = facets.filter((r) => !params.lifecycle_status || r.lifecycle_status === params.lifecycle_status)
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ sales_orders: selected.slice(params.offset, params.offset + params.limit), total: selected.length, status_counts: counts }) } })
      })
    },
    verify: async (page) => {
      const states = page.getByRole('group', { name: '历史状态', exact: true })
      await states.getByRole('button', { name: '全部历史状态，共 43 条', exact: true }).waitFor()
      const counts = () => states.locator('.erp-filter-chip__count').allTextContents()
      assert.deepEqual(await counts(), ['43', '40', '3'])
      await states.getByRole('button', { name: '已取消，共 3 条', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('[aria-label="历史状态"]')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.ant-table-tbody tr[data-row-key]').length === 3)
      assert.deepEqual(await counts(), ['43', '40', '3'])
      await page.screenshot({ path: deps.path.join(deps.outputDir, 'history-status-counts-4k.png') })
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await assertNoHorizontalOverflow(page, `history-state-counts-${width}`)
        assert.equal(await states.getByRole('button', { name: '已取消，共 3 条', exact: true }).getAttribute('aria-pressed'), 'true')
      }
      const search = page.getByPlaceholder('搜索历史记录')
      await search.fill('没有结果')
      await search.press('Enter')
      await states.getByRole('button', { name: '全部历史状态，共 0 条', exact: true }).waitFor()
      assert.deepEqual(await counts(), ['0', '0', '0'])
      await search.fill('失败')
      await search.press('Enter')
      await page.getByText('历史记录加载失败', { exact: true }).waitFor()
      assert.deepEqual(await counts(), ['—', '—', '—'])
      await search.fill('')
      await search.press('Enter')
      await states.getByRole('button', { name: '全部历史状态，共 43 条', exact: true }).waitFor()
      assert.deepEqual(await counts(), ['43', '40', '3'])
    },
  }
  return [
    ...historyAccessScenarios,
    {
      ...desktop,
      name: 'history-records-source-switch',
      path: '/erp/history?source=customers&keyword=HISTORY&page=2',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await installRoute(page)
        await page.route('**/rpc/**', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_sales_orders') return route.fallback()
          assert.equal(params.lifecycle_scope, 'history')
          const rows = [{ id: 1, order_no: 'HISTORY-SO-001', lifecycle_status: 'closed', customer_name: '历史客户', order_date: '2026-10-01' }]
          const selected = rows.filter((row) => !params.lifecycle_status || row.lifecycle_status === params.lifecycle_status)
          await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ sales_orders: selected, total: selected.length, status_counts: { closed: 1, canceled: 0 } }) } })
        })
      },
      verify: async (page) => {
        const source = page.getByRole('combobox', { name: '历史记录类型', exact: true })
        const sourceControl = page.locator('.ant-select').filter({ has: source }).locator('.ant-select-selector')
        const table = page.locator('.ant-table-tbody')
        await table.getByText('HISTORY-021', { exact: true }).click()
        await assertQueryLayout(page)
        await sourceControl.click()
        const options = page.locator('.ant-select-dropdown:visible')
        await options.getByText('基础资料', { exact: true }).waitFor()
        await options.getByText('业务单据与版本', { exact: true }).waitFor()
        await options.getByText('销售订单', { exact: true }).click()
        await table.getByText('HISTORY-SO-001', { exact: true }).waitFor()
        const query = new URL(page.url()).searchParams
        assert.equal(query.get('source'), 'sales_orders')
        assert.equal(query.has('keyword'), false)
        assert.equal(query.has('page'), false)
        assert.equal(await page.getByRole('button', { name: '查看详情', exact: true }).isEnabled(), false)
        await page.getByRole('button', { name: '已取消，共 0 条', exact: true }).click()
        await page.waitForFunction(() => new URL(location.href).searchParams.get('status') === 'canceled' && document.querySelector('[aria-label="历史状态"]')?.getAttribute('aria-busy') === 'false' && document.querySelectorAll('.ant-table-tbody tr[data-row-key]').length === 0)
        assert.equal(await table.locator('tr[data-row-key]').count(), 0)
        await sourceControl.click()
        await options.locator('.rc-virtual-list-holder').evaluate((node) => { node.scrollTop = 0 })
        await options.getByText('客户档案', { exact: true }).click()
        await table.getByText('HISTORY-001', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.has('status'), false)
        await page.reload()
        await table.getByText('HISTORY-001', { exact: true }).waitFor()
        await assertQueryLayout(page)
        await source.focus()
        await page.keyboard.press('ArrowDown')
        await options.waitFor()
        await page.keyboard.press('Escape')
        await options.waitFor({ state: 'hidden' })
        await page.screenshot({ path: deps.path.join(deps.outputDir, 'history-records-query-bar-4k.png') })
        for (const width of [320, 390, 820]) {
          await page.setViewportSize({ width, height: 844 })
          await assertQueryLayout(page)
          await assertNoHorizontalOverflow(page, `history-records-source-${width}`)
        }
      },
    },
    statusCounts,
    desktop,
    {
      ...desktop,
      name: 'history-records-tablet-dark',
      themeMode: 'dark',
      viewport: { width: 820, height: 1180 },
      verify: async (page) => {
        await expectHeading(page, '历史记录中心')
        await assertQueryLayout(page)
        await page
          .locator('.ant-table-tbody')
          .getByText('HISTORY-001', { exact: true })
          .dblclick()
        const dialog = page.getByRole('dialog')
        await dialog.getByText('HISTORY-001', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(
          page,
          'history-records-tablet-dark-detail'
        )
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page, 'history-records-tablet-dark')
      },
    },
  ]
}
