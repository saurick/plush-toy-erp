import { setTimeout as delay } from 'node:timers/promises'
import { createBusinessStatusCountsScenarios } from './businessStatusCountsScenarios.mjs'
import { createTaskTrackingFilterScenarios } from './taskTrackingFilterScenarios.mjs'
import { mobileTaskListOptionsScenario } from './mobileTaskListOptionsScenario.mjs'
import { DEFAULT_BUSINESS_PAGE_SIZE } from '../../src/erp/utils/businessPagination.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createSearchSubmissionScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const desktop = createBusinessStatusCountsScenarios(deps).find((item) => item.name === 'business-status-counts-query')
  const mobile = mobileTaskListOptionsScenario(deps)
  const tracking = createTaskTrackingFilterScenarios(deps)[0]
  return [
    {
      ...tracking,
      name: 'search-submit-tracking',
      beforeNavigate: async (page) => {
        await tracking.beforeNavigate(page)
        page.searchRPCs = []
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'list_tracking') page.searchRPCs.push(body.params)
          return route.fallback()
        })
      },
      verify: async (page) => {
        const panel = page.locator('.erp-workflow-tracking-panel')
        const controls = page.locator('.erp-workflow-tracking-controls')
        const search = controls.getByPlaceholder('单号 / 任务 / 产品 / 款号')
        await panel.getByText('SO-FILTER-801', { exact: true }).waitFor()
        const before = page.searchRPCs.length
        await search.fill('小熊')
        await delay(450)
        assert.equal(page.searchRPCs.length, before)
        const response = page.waitForResponse((item) => item.request().postDataJSON()?.method === 'list_tracking' && item.request().postDataJSON()?.params?.keyword === '小熊')
        await controls.getByRole('button', { name: '搜索', exact: true }).click()
        await response
        await page.waitForFunction(() => new URLSearchParams(location.search).get('track_search_started') === '小熊')
        await page.waitForLoadState('networkidle')
        assert.equal(page.searchRPCs.length, before + 1)
        assert.equal(page.searchRPCs.at(-1).keyword, '小熊')
        await search.fill('尚未提交')
        await search.press('Escape')
        assert.equal(await search.inputValue(), '小熊')
        await controls.getByRole('button', { name: '清除搜索', exact: true }).click()
        await page.waitForFunction(() => !new URLSearchParams(location.search).has('track_search_started'))
        await page.waitForLoadState('networkidle')
        assert.equal(page.searchRPCs.at(-1).scope, 'started')
        await search.fill('没有匹配的任务')
        await search.press('Enter')
        await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await page.locator('.erp-task-management-scope').getByText('待我处理', { exact: true }).click()
        await page.locator('.erp-task-management-scope').getByText('流程跟踪', { exact: true }).click()
        await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        assert.equal(await search.inputValue(), '没有匹配的任务')
      },
    },
    {
      ...desktop,
      name: 'search-submit-desktop',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await desktop.beforeNavigate(page)
        page.searchRPCs = []
        await page.route('**/rpc/**', async (route) => {
          const body = route.request().postDataJSON()
          page.searchRPCs.push(body)
          if (body.method === 'list_customers') {
            const customers = [1, 2].filter((id) => body.params?.ids?.includes(id)).map((id) => ({ id, code: `SEARCH-C${id}`, name: `搜索验证客户${id}`, active: true }))
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: styleRpcResult(stylePaginatedRpcData(customers, 'customers', body.params)) } })
          }
          if (body.method === 'list_sales_orders') {
            const { params = {}, id } = body
            page.statusCountRequests.push({ method: body.method, params })
            const orders = Array.from({ length: DEFAULT_BUSINESS_PAGE_SIZE + 3 }, (_, index) => ({
              id: index + 1,
              order_no: `SO-COUNT-${String(index + 1).padStart(3, '0')}`,
              customer_id: 1,
              customer_snapshot: { id: 1, code: 'SEARCH-C', name: '搜索验证客户' },
              customer_order_no: index === 0 || index === DEFAULT_BUSINESS_PAGE_SIZE + 2 ? '指定' : '',
              lifecycle_status: index === DEFAULT_BUSINESS_PAGE_SIZE + 2 ? 'submitted' : 'draft',
              version: 1, item_count: 0, order_date: 1790430000,
            })).filter((order) => !params.keyword || JSON.stringify(order).includes(params.keyword))
            if (params.keyword === '另一客户') orders.push({
              id: 10000, order_no: 'SO-SEARCH-OTHER-CUSTOMER', customer_id: 2,
              customer_snapshot: { id: 2, code: 'SEARCH-C2', name: '搜索验证客户2' },
              lifecycle_status: 'draft', version: 1, item_count: 0, order_date: 1790430000,
            })
            const status_counts = {}
            for (const order of orders) status_counts[order.lifecycle_status] = (status_counts[order.lifecycle_status] || 0) + 1
            const filtered = orders.filter((order) => !params.lifecycle_status || order.lifecycle_status === params.lifecycle_status)
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ ...stylePaginatedRpcData(filtered, 'sales_orders', params), status_counts }) } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const search = page.locator('.erp-business-operation-panel__search input')
        await page.locator('.ant-table-tbody').getByText('SO-COUNT-001', { exact: true }).waitFor()
        await page.waitForLoadState('networkidle')
        const references = () => page.searchRPCs.filter((call) => ['list_customers', 'list_product_skus', 'list_units'].includes(call?.method)).map((call) => call.method)
        const baseline = references()
        assert.deepEqual(baseline.toSorted(), ['list_customers', 'list_units'], 'initial hydration loads the visible customer and units without preloading every SKU')
        const before = page.statusCountRequests.length
        await search.fill('指')
        await search.fill('指定')
        await delay(450)
        assert.equal(page.statusCountRequests.length, before, 'typing must not request the order list')
        await page.locator('.erp-business-operation-panel__search').getByRole('button', { name: '搜索', exact: true }).click()
        await page.getByRole('button', { name: '不限状态，共 2 条', exact: true }).waitFor()
        assert.equal(page.statusCountRequests.length, before + 1, 'button submits once')
        await search.press('Enter')
        await delay(80)
        assert.equal(page.statusCountRequests.length, before + 1, 'same query must not be duplicated')
        await page.getByRole('button', { name: '草稿，共 1 条', exact: true }).click()
        await page.getByRole('button', { name: '清除搜索', exact: true }).click()
        await page.locator('.ant-table-tbody').getByText('SO-COUNT-001', { exact: true }).waitFor()
        await page.locator('.ant-pagination-item-2').click()
        await page.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
        await page.waitForLoadState('networkidle')
        assert.equal(page.statusCountRequests.at(-1).params.lifecycle_status, 'draft', 'clear preserves status')
        assert.deepEqual(references(), baseline, 'search, status and pagination must not reload base data')
        const refreshResponse = page.waitForResponse((item) => item.request().postDataJSON()?.method === 'list_customers')
        await page.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await refreshResponse
        await page.waitForLoadState('networkidle')
        assert.deepEqual(references(), [...baseline, 'list_customers'], 'manual refresh must reload the visible customer without reloading units or SKUs')
        await search.fill('另一客户')
        await search.press('Enter')
        await page.locator('.ant-table-tbody').getByText('SO-SEARCH-OTHER-CUSTOMER', { exact: true }).waitFor()
        await page.waitForLoadState('networkidle')
        assert.deepEqual(references(), [...baseline, 'list_customers', 'list_customers'], 'a new visible customer must be hydrated once')
        assert.deepEqual(page.searchRPCs.filter((call) => call.method === 'list_customers').at(-1).params.ids, [2])
        await page.getByRole('button', { name: '清除搜索', exact: true }).click()
        await page.locator('.ant-table-tbody').getByText('SO-COUNT-001', { exact: true }).waitFor()
        await page.waitForLoadState('networkidle')
        assert.deepEqual(references(), [...baseline, 'list_customers', 'list_customers'], 'returning to a known customer reuses the page reference records')
        await search.fill('不存在的搜索结果')
        await search.press('Enter')
        await page.getByRole('button', { name: '不限状态，共 0 条', exact: true }).waitFor()
        assert.equal(await search.inputValue(), '不存在的搜索结果')
        await assertNoHorizontalOverflow(page, 'search-submit-desktop')
        await page.screenshot({ path: path.join(outputDir, 'search-submit-desktop.png') })
      },
    },
    ...['light', 'dark'].map((themeMode) => ({
      ...mobile,
      name: `search-submit-mobile-${themeMode}`,
      themeMode,
      deviceScaleFactor: 3,
      beforeNavigate: async (page) => {
        page.searchRPCs = []
        page.releaseSearch = null
        await page.route('**/rpc/**', async (route) => {
          const body = route.request().postDataJSON()
          page.searchRPCs.push(body)
          if (body?.params?.keyword?.startsWith('慢搜索')) {
            await new Promise((resolve) => { page.releaseSearch = resolve })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const root = page.locator('.mobile-role-task-search .erp-mobile-search')
        const input = root.getByRole('searchbox')
        await input.waitFor()
        await page.waitForLoadState('networkidle')
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          const row = page.locator('.mobile-role-task-query')
          const collapsed = await root.boundingBox()
          const rowBefore = await row.boundingBox()
          const before = page.searchRPCs.length
          await input.click()
          await input.fill(`慢搜索${width}`)
          await delay(450)
          assert.equal(page.searchRPCs.length, before, 'mobile typing must not query')
          const expanded = await root.locator('.erp-mobile-search__control').boundingBox()
          const rowAfter = await row.boundingBox()
          assert(expanded.width > collapsed.width + 20, JSON.stringify({ collapsed, expanded, state: await root.evaluate((node) => ({ className: node.className, width: node.style.cssText, focus: document.activeElement?.outerHTML, row: node.closest('.erp-mobile-search-row')?.getBoundingClientRect().toJSON() })) }))
          assert(Math.abs(expanded.x + expanded.width - rowAfter.x - rowAfter.width) <= 2, 'focused search fills the toolbar row')
          assert.equal(rowAfter.height, rowBefore.height, 'expansion must not shift the list vertically')
          for (const button of await root.getByRole('button').all()) {
            const box = await button.boundingBox()
            assert(box.width >= 44 && box.height >= 44, JSON.stringify(box))
          }
          await page.screenshot({ path: path.join(outputDir, `search-mobile-${themeMode}-${width}-expanded.png`) })
          await root.getByRole('button', { name: '搜索', exact: true }).click()
          await delay(220)
          try {
            assert.equal(await root.evaluate((node) => node.classList.contains('erp-mobile-search--expanded')), false, 'collapse must not wait for the response')
            assert.equal(await input.evaluate((node) => document.activeElement === node), false, 'submit dismisses keyboard focus')
            assert(page.releaseSearch, 'the delayed request must still be pending')
            assert.equal(await input.inputValue(), `慢搜索${width}`)
          } finally { page.releaseSearch?.(); page.releaseSearch = null }
          await page.waitForLoadState('networkidle')
          await input.fill('取消这段输入')
          await root.getByRole('button', { name: '取消搜索', exact: true }).click()
          assert.equal(await input.inputValue(), `慢搜索${width}`)
          await input.click()
          await root.getByRole('button', { name: '清除搜索', exact: true }).click()
          await root.getByRole('button', { name: '搜索', exact: true }).click()
          await page.waitForLoadState('networkidle')
          assert.equal(await input.inputValue(), '')
          await assertNoHorizontalOverflow(page, `search-mobile-${width}`)
        }
        await page.screenshot({ path: path.join(outputDir, `search-mobile-${themeMode}-collapsed.png`) })
      },
    })),
  ]
}
