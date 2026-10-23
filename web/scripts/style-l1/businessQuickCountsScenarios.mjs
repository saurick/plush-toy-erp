import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { productionExceptionHandlingKey } from '../../src/erp/utils/productionExceptionListModel.mjs'

const exceptions = ['SUBMITTED', 'APPROVED:PENDING', 'APPROVED:APPLIED', 'APPROVED:REVERSED', 'REJECTED', 'CANCELLED'].map((key, index) => {
  const [status, execution_status = 'PENDING'] = key.split(':')
  return {
    id: index + 1,
    decision_no: `QUICK-EX-${index + 1}`,
    decision_type: 'SCRAP',
    status,
    execution_status,
    version: 1,
    production_order_id: 1,
    production_order_item_id: 1,
    requested_quantity: '1',
    reason: '模拟快捷统计',
    requested_at: 1790430000,
  }
})
async function installQuickCountsRoute(page) {
  page.quickCountRequests = []
  await page.route('**/rpc/**', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON() || {}
    const respond = (data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
    if (!params.include_status_counts) return route.fallback()
    page.quickCountRequests.push({ method, params })
    if (method === 'list_production_exceptions') {
      const scope = exceptions.filter((row) => (!params.status || row.status === params.status) && (!params.execution_status || row.execution_status === params.execution_status) && (!params.decision_type || row.decision_type === params.decision_type))
      const counts = {}
      scope.forEach((row) => { const key = productionExceptionHandlingKey(row); counts[key] = (counts[key] || 0) + 1 })
      return respond({ ...stylePaginatedRpcData(scope.filter((row) => !params.handling_status || productionExceptionHandlingKey(row) === params.handling_status), 'production_exceptions', params), status_counts: counts })
    }
    return route.fallback()
  })
}

export function createBusinessQuickCountsScenarios({ assert, customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir, path }) {
  const group = (page, label = '单据状态') => page.getByRole('group', { name: label, exact: true })
  const ready = async (page, total, label = '单据状态') => {
    const filter = group(page, label)
    await filter.getByRole('button', { name: `不限状态，共 ${total} 条`, exact: true }).waitFor()
    await page.waitForFunction((name) => [...document.querySelectorAll('[role="group"]')].some((el) => el.getAttribute('aria-label') === name && el.getAttribute('aria-busy') === 'false'), label)
    return filter
  }
  const shared = { auth: 'admin', effectiveSession: customerRuntimeEffectiveSession, beforeNavigate: installQuickCountsRoute }
  return [
    {
      ...shared,
      name: 'business-quick-counts-exceptions',
      path: '/erp/production/exceptions',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const filter = await ready(page, 6, '异常办理状态')
        await filter.getByRole('button', { name: '待办理／额度生效，共 1 条', exact: true }).click()
        await ready(page, 6, '异常办理状态')
        await page.locator('.ant-table-tbody').getByText('QUICK-EX-2', { exact: true }).waitFor()
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), 1)
        const last = page.quickCountRequests.filter(({ method }) => method === 'list_production_exceptions').at(-1)
        assert.equal(last.params.handling_status, 'APPROVED:PENDING')
        const pending = filter.getByRole('button', { name: '待办理／额度生效，共 1 条', exact: true })
        await pending.click()
        await page.locator('.ant-table-tbody').getByText('QUICK-EX-1', { exact: true }).waitFor()
        await ready(page, 6, '异常办理状态')
        assert.equal(Object.hasOwn(page.quickCountRequests.filter(({ method }) => method === 'list_production_exceptions').at(-1).params, 'handling_status'), false)
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), 6)
        await pending.click()
        await page.locator('.ant-table-tbody').getByText('QUICK-EX-1', { exact: true }).waitFor({ state: 'hidden' })
        await ready(page, 6, '异常办理状态')
        const operation = page.locator('.erp-business-operation-panel').filter({ has: filter })
        const trigger = operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
        assert.equal(await trigger.getAttribute('aria-label'), '筛选')
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await dialog.getByRole('group', { name: '审批状态', exact: true }).getByRole('button', { name: '已批准', exact: true }).click()
        await ready(page, 3, '异常办理状态')
        await dialog.getByRole('button', { name: '清空筛选', exact: true }).click()
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await ready(page, 6, '异常办理状态')
        assert.equal(await filter.getByRole('button', { name: '待办理／额度生效，共 1 条', exact: true }).getAttribute('aria-pressed'), 'true')
        await page.screenshot({ path: path.join(outputDir, 'quick-counts-exceptions.png') })
        await page.setViewportSize({ width: 1024, height: 900 })
        await assertNoHorizontalOverflow(page, '生产异常快捷统计')
      },
    },
    {
      ...shared,
      name: 'business-quick-counts-dark',
      path: '/erp/production/exceptions',
      themeMode: 'dark',
      viewport: { width: 760, height: 900 },
      verify: async (page) => {
        const filter = await ready(page, 6, '异常办理状态')
        const metrics = await filter.evaluate((el) => ({ width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth }))
        assert(metrics.width > 0 && !metrics.overflow, JSON.stringify(metrics))
        await filter.getByRole('button', { name: '业务已执行，共 1 条', exact: true }).click()
        await ready(page, 6, '异常办理状态')
        await assertNoHorizontalOverflow(page, '生产异常深色窄屏')
        await page.screenshot({ path: path.join(outputDir, 'quick-counts-dark-narrow.png') })
      },
    },
  ]
}
