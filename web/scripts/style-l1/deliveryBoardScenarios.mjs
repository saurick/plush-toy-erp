import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertControlCursor } from './controlAffordanceAssertions.mjs'
import { BUSINESS_ROUTE_PATHS } from '../../src/erp/utils/masterDataOrderView.mjs'

export function createDeliveryBoardScenarios({
  assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession, outputDir,
}) {
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    actions: ['erp.business_dashboard.read', 'sales_order.read', 'sales_order_item.read', 'product.read'],
  }
  const common = {
    auth: 'admin', effectiveSession, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
  }
  const orders = [1, 2].map(id => ({
    id, order_no: 'SO-000' + id, lifecycle_status: 'active',
    customer_snapshot: { name: '模拟客户 ' + id }, version: 1, order_date: 1789963200, updated_at: 1789963200,
  }))
  const fulfill = (route, id, data) => route.fulfill({ json: {
    jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data },
  } })
  const display = (page, label) => page.locator('[aria-label="交付查看方式"]').getByText(label, { exact: true })
  const details = (page) => page.getByRole('table', { name: '交付明细', exact: true })
  const facets = (page) => page.getByRole('group', { name: '交付明细状态', exact: true })
  const select = (page) => page.locator('.erp-sales-orders-page tbody tr[data-row-key="1"]')
  return [
    {
      ...common,
      name: 'unified-sales-interactions',
      path: BUSINESS_ROUTE_PATHS.salesOrders,
      beforeNavigate: async page => {
        await page.route('**/rpc/sales_order', route => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_orders') {
            const sales_orders = orders.filter(row => !params.keyword || row.order_no.includes(params.keyword))
            return fulfill(route, id, { sales_orders, total: sales_orders.length, status_counts: { active: sales_orders.length } })
          }
          if (method === 'get_sales_order') return fulfill(route, id, { sales_order: orders.find(row => row.id === params.id) })
          return route.fallback()
        })
        await page.route('**/rpc/business', route => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_progress', 'get_progress'].includes(method)) return route.fallback()
          const detail = method === 'get_progress'
          const data = progressFixtureData(params, { detail })
          if (detail) {
            data.sections.lines[0].id = 101
          }
          return fulfill(route, id, data)
        })
      },
      verify: async page => {
        const search = page.locator('.erp-sales-orders-page input.erp-search-input, .erp-sales-orders-page .erp-search-input input').first()
        await select(page).waitFor()
        await assertControlCursor(page.getByRole('button', { name: '表格工具', exact: true }), 'pointer')
        await search.fill('SO-0001')
        const applied = page.waitForRequest(req => req.url().endsWith('/rpc/sales_order') &&
          req.postDataJSON()?.params?.keyword === 'SO-0001')
        await search.press('Enter')
        await applied
        await select(page).click()
        assert.equal(await page.getByRole('tab', { name: '交付进度', exact: true }).count(), 0)
        await search.fill('尚未提交的输入')
        await page.getByRole('button', { name: '查看交付进度', exact: true }).click()
        await page.waitForURL(url => url.pathname === BUSINESS_ROUTE_PATHS.businessDashboard &&
          url.searchParams.get('sales_order_id') === '1' && url.searchParams.get('display') === 'lines')
        await details(page).locator('tbody tr').last().waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 2, '按所选订单读取，排除同客户或同名其他单')
        const first = details(page).locator('tbody tr').first()
        await assertControlCursor(first.getByRole('cell').nth(2), 'pointer')
        assert.match(await first.textContent(), /云朵小熊.*48 \/ 120 只.*72 只/u)
        assert.match(await details(page).locator('tbody tr').last().textContent(), /星星挂兔.*0 \/ 120 套.*120 套/u)
        await page.screenshot({ path: outputDir + '/delivery-board-lines-4k.png' })
        await facets(page).getByRole('button', { name: /逾期.*1 条/u }).click()
        await page.waitForURL(url => url.searchParams.get('delivery_status') === 'overdue')
        await details(page).locator('tbody tr[data-progress-line-id="102"]').waitFor({ state: 'hidden' })
        await details(page).locator('tbody tr[data-progress-line-id="101"]').waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 1)
        await display(page, '整单').click()
        await page.getByRole('table', { name: '订单交付紧凑总览' }).waitFor()
        await display(page, '产品明细').click()
        await details(page).locator('tbody tr').first().waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 1, '切回明细恢复本视图的快捷条件')
        const drill = details(page).getByRole('button', { name: /SO-0001.*第 1 行进度/u })
        await drill.click()
        const dialog = page.getByRole('dialog')
        await dialog.locator('[data-progress-line-selected]').waitFor()
        assert.match(await dialog.textContent(), /SO-0001.*云朵小熊/u)
        await dialog.getByRole('button', { name: '返回进度', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.matches('.erp-progress-line-open'))
        await page.getByRole('button', { name: '返回销售订单', exact: true }).click()
        await page.waitForURL(url => url.pathname === BUSINESS_ROUTE_PATHS.salesOrders)
        await select(page).filter({ has: page.getByRole('radio', { checked: true }) }).waitFor()
        assert.equal(await search.inputValue(), '尚未提交的输入', '返回保留输入但未替换已提交的筛选词')
        assert.equal(await page.locator('.erp-sales-orders-page tbody tr[data-row-key="2"]').count(), 0)
        await page.getByRole('button', { name: '查看交付进度', exact: true }).click()
        await details(page).waitFor()
        await page.goBack()
        await select(page).filter({ has: page.getByRole('radio', { checked: true }) }).waitFor()
        assert.equal(await search.inputValue(), '尚未提交的输入')
      },
    },
    {
      ...common,
      name: 'delivery-board-pagination-and-recovery',
      path: BUSINESS_ROUTE_PATHS.businessDashboard + '?view=orders&display=lines',
      beforeNavigate: async page => {
        let first = true
        await page.route('**/rpc/business', route => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_progress') return route.fallback()
          if (first) {
            first = false
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '查询失败' } } })
          }
          return fulfill(route, id, progressFixtureData(params))
        })
      },
      verify: async page => {
        await page.getByRole('button', { name: '重试', exact: true }).click()
        await details(page).locator('tbody tr').first().waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 20)
        await facets(page).getByRole('button', { name: /全部明细.*24 条/u }).waitFor()
        await page.locator('.erp-progress-board').getByRole('button', { name: '下一页' }).click()
        await details(page).locator('tbody tr[data-progress-line-id="121"]').waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 4)
        await details(page).getByRole('button', { name: '按订单号升序排列' }).press('Enter')
        await details(page).locator('tbody tr:first-child[data-progress-line-id="101"]').waitFor()
        await details(page).getByRole('button', { name: '按订单号降序排列' }).press('Enter')
        await details(page).locator('tbody tr:first-child[data-progress-line-id="123"]').waitFor()
        await details(page).getByRole('button', { name: '按产品升序排列' }).click()
        await details(page).locator('th[aria-sort="ascending"]').getByText('产品', { exact: true }).waitFor()
        await details(page).getByRole('button', { name: '按产品降序排列' }).click()
        await details(page).getByRole('button', { name: '恢复默认排序' }).click()
        await details(page).locator('tbody tr:first-child[data-progress-line-id="101"]').waitFor()
        await facets(page).getByRole('button', { name: /待核对.*1 条/u }).click()
        await details(page).locator('tbody tr:only-child[data-progress-line-id="105"]').waitFor()
        const cells = details(page).locator('tbody tr').first().locator('td')
        assert.match(await cells.nth(3).textContent(), /待核对/u)
        assert.equal((await cells.nth(4).textContent()).trim(), '—')
        for (const width of [1440, 840, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, 'delivery-board-' + width)
          const overflow = await cells.evaluateAll(nodes => nodes.some(el => el.scrollWidth > el.clientWidth + 1))
          assert.equal(overflow, false, '列内容无需页面横向滚动')
        }
      },
    },
  ]
}
