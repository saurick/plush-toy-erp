import { setTimeout as delay } from 'node:timers/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { DEFAULT_BUSINESS_PAGE_SIZE } from '../../src/erp/utils/businessPagination.mjs'
import { productionExceptionHandlingKey } from '../../src/erp/utils/productionExceptionListModel.mjs'

const receiptPath = '/erp/warehouse/inbound'
const receiptCount = DEFAULT_BUSINESS_PAGE_SIZE + 3
const receipts = Array.from({ length: receiptCount }, (_, index) => ({
  id: index + 1, receipt_no: `QUICK-RCV-${index + 1}`, supplier_name: index < 2 ? '指定供应商' : '统计供应商',
  status: index < receiptCount - 1 ? 'DRAFT' : 'POSTED', received_at: 1790430000, created_at: 1790430000,
  updated_at: 1790430000, items: [], item_count: 0,
}))
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
const listKeys = { list_purchase_receipts: 'purchase_receipts', list_inventory_lots: 'inventory_lots', list_tasks: 'tasks', list_production_facts: 'production_facts', list_stock_reservations: 'stock_reservations', list_bom_versions: 'bom_versions' }

async function installQuickCountsRoute(page) {
  page.quickCountRequests = []
  await page.route('**/rpc/**', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON() || {}
    const respond = (data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
    if (method === 'get_purchase_receipt' && Number(params.id) === 1) return respond({ purchase_receipt: receipts[0] })
    if (!params.include_status_counts) return route.fallback()
    page.quickCountRequests.push({ method, params })
    if (method === 'list_purchase_receipts') {
      if (params.keyword === '读取失败') return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '读取失败' } } })
      if (params.keyword === '慢查询') await delay(650)
      const scope = receipts.filter((row) => !params.keyword || params.keyword === '慢查询' || JSON.stringify(row).includes(params.keyword))
      const counts = {}
      scope.forEach((row) => { counts[row.status] = (counts[row.status] || 0) + 1 })
      return respond({ ...stylePaginatedRpcData(scope.filter((row) => !params.status || row.status === params.status), 'purchase_receipts', params), status_counts: counts })
    }
    if (method === 'list_production_exceptions') {
      const scope = exceptions.filter((row) => (!params.status || row.status === params.status) && (!params.execution_status || row.execution_status === params.execution_status) && (!params.decision_type || row.decision_type === params.decision_type))
      const counts = {}
      scope.forEach((row) => { const key = productionExceptionHandlingKey(row); counts[key] = (counts[key] || 0) + 1 })
      return respond({ ...stylePaginatedRpcData(scope.filter((row) => !params.handling_status || productionExceptionHandlingKey(row) === params.handling_status), 'production_exceptions', params), status_counts: counts })
    }
    if (listKeys[method]) return respond({ ...stylePaginatedRpcData([], listKeys[method], params), status_counts: {} })
    return route.fallback()
  })
}

export function createBusinessQuickCountsScenarios({ assert, customerRuntimeEffectiveSession, gotoScenarioPath, assertNoHorizontalOverflow, outputDir, path }) {
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
      ...shared, name: 'business-quick-counts-pages', path: '/erp/warehouse/inventory?view=lots', viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const cases = [
          ['/erp/warehouse/inventory?view=lots', '批次状态', 'list_inventory_lots'],
          ['/erp/production/scheduling', '任务状态', 'list_tasks'],
          ['/erp/production/scheduling', '任务状态', 'list_tasks'],
          ['/erp/production/progress?view=records', '单据状态', 'list_production_facts'],
          ['/erp/warehouse/outbound', '单据状态', 'list_stock_reservations'],
          ['/erp/purchase/material-bom', 'BOM 状态', 'list_bom_versions'],
        ]
        for (const [url, label, method] of cases) {
          await gotoScenarioPath(page, url, { waitUntil: 'domcontentloaded' })
          const filter = await ready(page, 0, label)
          assert(await filter.locator('..').evaluate((el) => el.classList.contains('erp-business-operation-panel__quick')), `${url} 快捷项应直接可见`)
          const operation = page.locator('.erp-business-operation-panel').filter({ has: filter })
          const trigger = operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
          const quick = filter.getByRole('button').nth(1)
          await quick.click()
          await ready(page, 0, label)
          assert.equal(await quick.getAttribute('aria-pressed'), 'true')
          assert.equal(await trigger.getAttribute('aria-label'), '筛选', `${url} 快捷项不算额外条件`)
          const last = page.quickCountRequests.filter((request) => request.method === method).at(-1)
          assert(last?.params.include_status_counts, `${url} 必须请求服务端数量`)
          assert.equal(last.params.offset, 0)
          await quick.press('Enter')
          await ready(page, 0, label)
          assert.equal(await quick.getAttribute('aria-pressed'), 'false', `${url} 再次点击应取消`)
          if (method === 'list_tasks') await filter.getByRole('button', { name: '已撤回，共 0 条', exact: true }).waitFor()
          if (method === 'list_production_facts') assert.equal(await filter.getByRole('button', { name: /^(已发货|已结清|生效中|已消耗)/u }).count(), 0)
          if (method === 'list_stock_reservations') assert.equal(await filter.getByRole('button', { name: /^(草稿|已过账|已发货|已结清)/u }).count(), 0)
          await page.setViewportSize({ width: 1024, height: 900 })
          await assertNoHorizontalOverflow(page, url)
          await page.setViewportSize({ width: 1440, height: 900 })
        }
        const bom = group(page, 'BOM 状态')
        const operation = page.locator('.erp-business-operation-panel')
        await operation.getByRole('button', { name: '筛选', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await dialog.getByRole('group', { name: '记录范围', exact: true }).getByRole('button', { name: '历史记录', exact: true }).click()
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await ready(page, 0, 'BOM 状态')
        assert.equal(await bom.getByRole('button', { name: /^草稿/u }).count(), 0)
        await bom.getByRole('button', { name: '历史版本，共 0 条', exact: true }).click()
        await ready(page, 0, 'BOM 状态')
        await operation.getByRole('button', { name: '清空筛选', exact: true }).click()
        await ready(page, 0, 'BOM 状态')
        await bom.getByRole('button', { name: '草稿，共 0 条', exact: true }).waitFor()
        assert.equal(await bom.getByRole('button', { name: '不限状态，共 0 条', exact: true }).getAttribute('aria-pressed'), 'true')
        await page.screenshot({ path: path.join(outputDir, 'quick-counts-bom.png') })
      },
    },
    {
      ...shared, name: 'business-quick-counts-receipts', path: receiptPath, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: async (page) => {
        const filter = await ready(page, receiptCount)
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), DEFAULT_BUSINESS_PAGE_SIZE)
        await page.locator('.ant-pagination-item-2').click()
        await page.locator('.ant-table-tbody').getByText(`QUICK-RCV-${DEFAULT_BUSINESS_PAGE_SIZE + 1}`, { exact: true }).waitFor()
        await ready(page, receiptCount)
        const posted = filter.getByRole('button', { name: '已过账，共 1 条', exact: true })
        await posted.click()
        await page.locator('.ant-table-tbody').getByText(`QUICK-RCV-${receiptCount}`, { exact: true }).waitFor()
        await ready(page, receiptCount)
        assert.equal(page.quickCountRequests.filter(({ method }) => method === 'list_purchase_receipts').at(-1).params.offset, 0)
        await posted.click()
        await ready(page, receiptCount)
        const operation = page.locator('.erp-business-operation-panel')
        const search = operation.locator('.erp-business-operation-panel__search input').first()
        await search.fill('指定')
        await search.press('Enter')
        await ready(page, 2)
        const draft = filter.getByRole('button', { name: '草稿，共 2 条', exact: true })
        await draft.click()
        await ready(page, 2)
        const trigger = operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await dialog.getByRole('textbox', { name: '开始日期', exact: true }).click()
        const picker = page.locator('.ant-picker-dropdown:visible')
        await picker.locator('td.ant-picker-cell-in-view:not(.ant-picker-cell-disabled) .ant-picker-cell-inner').nth(10).click()
        await picker.waitFor({ state: 'hidden' })
        await dialog.getByRole('button', { name: '清空筛选', exact: true }).click()
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await ready(page, 2)
        assert.equal(await search.inputValue(), '指定')
        assert.equal(await draft.getAttribute('aria-pressed'), 'true')
        assert.equal(await trigger.getAttribute('aria-label'), '筛选')
        await search.fill('慢查询'); await search.press('Enter')
        await filter.getByRole('button', { name: '不限状态，数量暂不可用', exact: true }).waitFor()
        await search.fill('指定'); await search.press('Enter')
        await ready(page, 2); await delay(750); await ready(page, 2)
        await search.fill('读取失败'); await search.press('Enter')
        await page.locator('.ant-message-error').waitFor()
        await filter.getByRole('button', { name: '不限状态，数量暂不可用', exact: true }).waitFor()
        await search.fill('无结果'); await search.press('Enter'); await ready(page, 0)
        await search.fill(''); await search.press('Enter'); await ready(page, receiptCount)
        await page.locator('.ant-message-error').waitFor({ state: 'hidden' })
        await search.blur()
        await page.screenshot({ path: path.join(outputDir, 'quick-counts-receipts-4k.png') })
        await assertNoHorizontalOverflow(page, '采购入库快捷统计')
        await page.evaluate(() => { history.pushState(history.state, '', '/erp/business-dashboard'); dispatchEvent(new PopStateEvent('popstate', { state: history.state })) })
        await page.getByRole('region', { name: '进度看板', exact: true }).waitFor()
        await page.goBack()
        await ready(page, receiptCount)
        assert.equal(await filter.getByRole('button', { name: `草稿，共 ${receiptCount - 1} 条`, exact: true }).getAttribute('aria-pressed'), 'true')
        await gotoScenarioPath(page, `${receiptPath}?receipt_id=1`, { waitUntil: 'domcontentloaded' })
        const exact = await ready(page, 1)
        assert(await exact.getByRole('button', { name: '不限状态，共 1 条', exact: true }).isDisabled())
      },
    },
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
