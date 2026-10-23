import { setTimeout as delay } from 'node:timers/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { DEFAULT_BUSINESS_PAGE_SIZE } from '../../src/erp/utils/businessPagination.mjs'

const salesPath = '/erp/sales/project-orders/sales-orders'
const draftCount = DEFAULT_BUSINESS_PAGE_SIZE + 22
const currentCount = draftCount + 3
const rows = Array.from({ length: currentCount + 2 }, (_, index) => ({
  id: index + 1,
  order_no: `SO-COUNT-${String(index + 1).padStart(3, '0')}`,
  customer_id: 1,
  customer_snapshot: { id: 1, code: 'COUNT-C', name: '数量验证客户' },
  customer_order_no: index === 0 || index === draftCount ? '指定' : '',
  lifecycle_status: index < draftCount ? 'draft' : index < currentCount ? 'submitted' : 'closed',
  version: 1,
  item_count: 0,
  order_date: 1790430000,
  created_at: 1790430000,
  updated_at: 1790430000,
}))
const keys = {
  list_purchase_orders: 'purchase_orders',
  list_outsourcing_orders: 'outsourcing_orders',
  list_production_orders: 'production_orders',
  list_quality_inspections: 'quality_inspections',
  list_finished_goods_quality_inspections: 'quality_inspections',
  list_outsourcing_return_quality_inspections: 'quality_inspections',
  list_production_stage_quality_inspections: 'quality_inspections',
  list_shipments: 'shipments',
  list_finance_payments: 'payments',
  list_finance_credit_notes: 'credit_notes',
  list_finance_facts: 'finance_facts',
}

async function installRoute(page) {
  page.statusCountRequests = []
  await page.route('**/rpc/**', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON() || {}
    const fulfill = (data) =>
      route.fulfill({
        json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
      })
    if (method === 'get_sales_order' && Number(params.id) === rows.at(-1).id)
      { return fulfill({ sales_order: rows.at(-1) }) }
    if (method === 'list_sales_orders' && params.include_status_counts) {
      page.statusCountRequests.push({ method, params })
      if (params.keyword === '慢查询') await delay(650)
      if (params.keyword === '读取失败') {
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id,
            result: { code: 50000, message: '读取失败' },
          },
        })
      }
      const scope = params.lifecycle_scope || 'current'
      const counted = rows.filter(
        (row) =>
          (scope === 'all' ||
            (scope === 'history'
              ? row.lifecycle_status === 'closed'
              : row.lifecycle_status !== 'closed')) &&
          (!params.keyword ||
            (params.keyword === '慢查询'
              ? true
              : JSON.stringify(row).includes(params.keyword)))
      )
      const counts = {}
      for (const row of counted)
        { counts[row.lifecycle_status] = (counts[row.lifecycle_status] || 0) + 1 }
      const filtered = counted.filter(
        (row) =>
          !params.lifecycle_status ||
          row.lifecycle_status === params.lifecycle_status
      )
      return fulfill({
        ...stylePaginatedRpcData(filtered, 'sales_orders', params),
        status_counts: counts,
      })
    }
    if (keys[method] && params.include_status_counts) {
      page.statusCountRequests.push({ method, params })
      return fulfill({
        ...stylePaginatedRpcData([], keys[method], params),
        status_counts: {},
      })
    }
    return route.fallback()
  })
}

export function createBusinessStatusCountsScenarios({ assert, customerRuntimeEffectiveSession, gotoScenarioPath, assertNoHorizontalOverflow, outputDir, path }) {
  const group = (page, label = '销售订单状态') => page.getByRole('group', { name: label, exact: true })
  const ready = async (page, total, label = '销售订单状态') => {
    const filter = group(page, label)
    await filter.waitFor()
    await page.waitForFunction((name) => [...document.querySelectorAll('[role="group"]')].some((el) => el.getAttribute('aria-label') === name && el.getAttribute('aria-busy') === 'false'), label)
    assert.equal(await filter.getByRole('combobox').count(), 0, '状态与数量应直接展示为快捷按钮')
    const all = filter.getByRole('button', { name: `不限状态，共 ${total} 条`, exact: true })
    await all.waitFor()
    return all
  }
  const assertCounts = async (page, label, entries) => {
    const filter = group(page, label)
    for (const [text, count] of entries) await filter.getByRole('button', { name: `${text}，共 ${count} 条`, exact: true }).waitFor()
  }
  const choose = async (page, label, text, count) => {
    const filter = group(page, label)
    await filter.getByRole('button', { name: `${text}，共 ${count} 条`, exact: true }).click()
  }
  const shared = { path: salesPath, auth: 'admin', effectiveSession: customerRuntimeEffectiveSession, beforeNavigate: installRoute }
  const applyDateRange = async (page, filters) => {
    await filters.getByRole('textbox', { name: '开始日期', exact: true }).click()
    const picker = page.locator('.ant-picker-dropdown:visible')
    const day = picker.locator('td.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)[title]').nth(10)
    const date = await day.getAttribute('title')
    await day.locator('.ant-picker-cell-inner').click()
    await picker.waitFor({ state: 'hidden' })
    await filters.getByRole('textbox', { name: '结束日期', exact: true }).click()
    await picker.locator(`td[title="${date}"] .ant-picker-cell-inner`).click()
    await picker.waitFor({ state: 'hidden' })
  }
  return [
    {
      ...shared,
      name: 'business-extra-filter-semantics',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await ready(page, currentCount)
        const operation = page.locator('.erp-business-operation-panel')
        const trigger = operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
        const search = operation.locator('.erp-business-operation-panel__search input').first()
        const clear = operation.getByRole('button', { name: '清空筛选', exact: true })
        const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await search.fill('指定')
        await search.press('Enter')
        await ready(page, 2)
        await choose(page, '销售订单状态', '草稿', 1)
        await ready(page, 2)
        const status = group(page).getByRole('button', { name: '草稿，共 1 条', exact: true })
        assert.equal(await status.getAttribute('aria-pressed'), 'true')
        assert.equal(await status.locator('.erp-filter-chip__clear').count(), 1)
        assert.equal(await trigger.getAttribute('aria-label'), '筛选')
        assert.equal(await clear.count(), 0, '搜索和快捷状态不计入额外条件')
        await page.screenshot({ path: path.join(outputDir, 'desktop-search-and-quick-filter.png') })
        await trigger.click()
        await applyDateRange(page, filters)
        assert.equal(await trigger.getAttribute('aria-label'), '筛选，已应用 1 项', '日期范围按一项计数')
        await filters.getByRole('combobox', { name: '排序方式', exact: true }).press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible').getByText('最早优先', { exact: true }).click()
        assert.equal(await trigger.getAttribute('aria-label'), '筛选，已应用 2 项', '非默认排序按一项计数')
        await filters.getByRole('group', { name: '记录范围', exact: true }).getByRole('button', { name: '全部记录', exact: true }).click()
        await ready(page, 2)
        assert.equal(await trigger.getAttribute('aria-label'), '筛选，已应用 3 项')
        await filters.getByRole('button', { name: '完成', exact: true }).click()
        await page.screenshot({ path: path.join(outputDir, 'desktop-extra-filter-count.png') })
        await clear.press('Enter')
        await ready(page, 2)
        assert.equal(await search.inputValue(), '指定')
        assert.equal(await status.getAttribute('aria-pressed'), 'true')
        assert.equal(await trigger.getAttribute('aria-label'), '筛选')
        assert.equal(await clear.count(), 0)
        assert.equal(await trigger.evaluate((node) => document.activeElement === node), true)
        await page.evaluate(() => {
          history.pushState(history.state, '', '/erp/business-dashboard')
          dispatchEvent(new PopStateEvent('popstate', { state: history.state }))
        })
        await page.getByRole('region', { name: '进度看板', exact: true }).waitFor()
        await page.goBack()
        await ready(page, 2)
        assert.equal(await search.inputValue(), '指定')
        assert.equal(await status.getAttribute('aria-pressed'), 'true', '返回保留搜索与快捷项，不恢复已清空条件')
        assert.equal(await trigger.getAttribute('aria-label'), '筛选')
        await status.press('Enter')
        await ready(page, 2)
        assert.equal(await status.getAttribute('aria-pressed'), 'false', '选中的快捷状态可原位取消')
        assert.equal(await search.inputValue(), '指定')
        await assertNoHorizontalOverflow(page, '桌面搜索和两类筛选')
      },
    },
    {
      ...shared,
      name: 'business-extra-filter-pages',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const cases = [
          ['/erp/master/partners/customers', '记录范围', '历史记录'],
          ['/erp/master/partners/suppliers', '记录范围', '历史记录'],
          ['/erp/master/materials', '记录范围', '历史记录'],
          ['/erp/purchase/material-bom', '记录范围', '历史记录'],
          ['/erp/warehouse/inbound', null, null],
          ['/erp/warehouse/inventory?view=balances', '存货类型', '材料'],
          ['/erp/system/audit-logs', null, null],
        ]
        for (const [url, label, option] of cases) {
          await gotoScenarioPath(page, url, { waitUntil: 'domcontentloaded' })
          const operation = page.locator('.erp-business-operation-panel')
          const trigger = operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
          const search = operation.locator('.erp-business-operation-panel__search input').first()
          await search.fill('筛选核对')
          await search.press('Enter')
          assert.equal(await trigger.getAttribute('aria-label'), '筛选', `${url} 搜索不计入额外条件`)
          await trigger.click()
          const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
          if (label) await filters.getByRole('group', { name: label, exact: true }).getByRole('button', { name: option, exact: true }).click()
          else await applyDateRange(page, filters)
          assert.equal(await trigger.getAttribute('aria-label'), '筛选，已应用 1 项', `${url} 面板内条件按项计数`)
          await filters.getByRole('button', { name: '清空筛选', exact: true }).click()
          assert.equal(await search.inputValue(), '筛选核对', `${url} 面板重置保留搜索`)
          assert.equal(await trigger.getAttribute('aria-label'), '筛选')
          await filters.getByRole('button', { name: '完成', exact: true }).click()
          assert.equal(await operation.getByRole('button', { name: '清空筛选', exact: true }).count(), 0)
          await assertNoHorizontalOverflow(page, url)
        }
      },
    },
    {
      name: 'business-status-counts-design',
path: '/__dev/ui-design',
viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        const filter = frame.getByRole('group', { name: '状态筛选', exact: true })
        await filter.waitFor()
        const labels = () => filter.getByRole('button').evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
        const before = await labels()
        assert(before.some((text) => text.startsWith('已生效，')))
        assert(!before.some((text) => /工程中|生产中|已阻塞/u.test(text)))
        const counts = before.map((text) => Number(text.match(/共 (\d+) 条$/u)?.[1]))
        assert.equal(counts[0], counts.slice(1).reduce((sum, value) => sum + value, 0))
        await filter.getByRole('button', { name: /^草稿，/u }).click()
        assert.deepEqual(await labels(), before)
        await frame.locator('#list-search').fill('SO-20260925-001')
        await frame.locator('#list-search').press('Enter')
        await filter.getByRole('button', { name: '不限状态，共 1 条', exact: true }).waitFor()
        assert((await labels()).includes('已生效，共 1 条'))
        assert((await labels()).includes('草稿，共 0 条'))
        await assertNoHorizontalOverflow(page, 'business-status-counts-design')
      },
    },
    {
      ...shared,
name: 'business-status-counts-query',
viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await ready(page, currentCount)
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), DEFAULT_BUSINESS_PAGE_SIZE)
        await assertCounts(page, '销售订单状态', [['已生效', 0]])
        await page.locator('.ant-pagination-item-2').click()
        await page.locator('.ant-table-tbody').getByText(rows[DEFAULT_BUSINESS_PAGE_SIZE].order_no, { exact: true }).waitFor()
        await ready(page, currentCount)
        await choose(page, '销售订单状态', '已提交', 3)
        await page.locator('.ant-table-tbody').getByText(rows[draftCount].order_no, { exact: true }).waitFor()
        await ready(page, currentCount)
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), 3)
        assert.equal(page.statusCountRequests.at(-1).params.offset, 0, '切换状态返回第一页')
        assert.equal(await group(page).getByRole('button', { name: '已提交，共 3 条', exact: true }).getAttribute('aria-pressed'), 'true')
        const all = group(page).getByRole('button', { name: `不限状态，共 ${currentCount} 条`, exact: true })
        await all.focus()
        await all.press('Enter')
        await page.locator('.ant-table-tbody').getByText('SO-COUNT-001', { exact: true }).waitFor()
        await ready(page, currentCount)
        const search = page.locator('.erp-business-operation-panel__search input').first()
        await search.fill('指定')
        await search.press('Enter')
        await ready(page, 2)
        await assertCounts(page, '销售订单状态', [['草稿', 1], ['已提交', 1]])
        await search.fill('慢查询')
        await search.press('Enter')
        await group(page).getByRole('button', { name: '不限状态，数量暂不可用', exact: true }).waitFor()
        await search.fill('指定')
        await search.press('Enter')
        await ready(page, 2)
        await delay(750)
        await ready(page, 2)
        await search.fill('读取失败')
        await search.press('Enter')
        await page.locator('.ant-message-error').waitFor()
        await group(page).getByRole('button', { name: '不限状态，数量暂不可用', exact: true }).waitFor()
        await search.fill('')
        await search.press('Enter')
        await ready(page, currentCount)
        await search.blur()
        await page.locator('.ant-message-error').waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(outputDir, 'business-status-counts-desktop.png') })
        await assertNoHorizontalOverflow(page, 'business-status-counts-query')
        await gotoScenarioPath(page, `${salesPath}?scope=history`, { waitUntil: 'domcontentloaded' })
        await ready(page, 2)
        await assertCounts(page, '销售订单状态', [['已关闭', 2]])
        assert.equal(await group(page).getByRole('button', { name: /^草稿/u }).count(), 0)
        await gotoScenarioPath(page, `${salesPath}?scope=all&sales_order_id=${rows.at(-1).id}`, { waitUntil: 'domcontentloaded' })
        const exact = await ready(page, 1)
        assert(await exact.isDisabled(), '关联单据范围内不能误用全库统计或改变状态条件')
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), 1)
        await page.locator('.ant-table-tbody').getByText('已关闭', { exact: true }).waitFor()
      },
    },
    {
      ...shared,
name: 'business-status-counts-pages',
viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await ready(page, currentCount)
        const cases = [
          ['/erp/purchase/accessories', '采购订单状态', 'list_purchase_orders'],
          ['/erp/purchase/processing-contracts', '委外订单状态', 'list_outsourcing_orders'],
          ['/erp/production/orders', '生产订单状态', 'list_production_orders'],
          ['/erp/production/quality-inspections', '质检状态', 'list_quality_inspections'],
          ['/erp/warehouse/shipments', '出货单状态', 'list_shipments'],
          ['/erp/finance/payments', '收付款状态', 'list_finance_payments'],
          ['/erp/finance/receivables', '单据状态', 'list_finance_facts'],
          ['/erp/finance/payables', '单据状态', 'list_finance_facts'],
          ['/erp/finance/invoices', '单据状态', 'list_finance_facts'],
          ['/erp/finance/reconciliation', '单据状态', 'list_finance_facts'],
        ]
        for (const [url, label, method] of cases) {
          await gotoScenarioPath(page, url, { waitUntil: 'domcontentloaded' })
          await ready(page, 0, label)
          const filter = group(page, label)
          assert(await filter.locator('..').evaluate((el) => el.classList.contains('erp-business-operation-panel__quick')), `${url} 状态应直接可见`)
          assert(page.statusCountRequests.some((request) => request.method === method), `${url} 必须请求后端统计`)
          if (label === '单据状态') {
            assert.equal(await filter.getByRole('button', { name: /^(已发货|生效中|已释放|已消耗)/u }).count(), 0, '财务只能使用财务状态')
          }
          const operation = page.locator('.erp-business-operation-panel')
          const trigger = operation.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u })
          const search = operation.locator('.erp-business-operation-panel__search input').first()
          const selected = filter.getByRole('button').nth(1)
          await selected.click()
          await ready(page, 0, label)
          await search.fill('筛选核对')
          await search.press('Enter')
          await ready(page, 0, label)
          assert.equal(await trigger.getAttribute('aria-label'), '筛选', `${url} 快捷状态和搜索不计数`)
          assert.equal(await operation.getByRole('button', { name: '清空筛选', exact: true }).count(), 0)
          assert.equal(await selected.locator('.erp-filter-chip__clear').count(), 1)
          await trigger.click()
          const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
          if (label === '收付款状态') await filters.getByRole('group', { name: '收付款方向', exact: true }).getByRole('button', { name: '收款', exact: true }).click()
          else await applyDateRange(page, filters)
          assert.equal(await trigger.getAttribute('aria-label'), '筛选，已应用 1 项', `${url} 一个额外条件只计一项`)
          await filters.getByRole('button', { name: '完成', exact: true }).click()
          await operation.getByRole('button', { name: '清空筛选', exact: true }).click()
          await ready(page, 0, label)
          assert.equal(await search.inputValue(), '筛选核对', `${url} 清空保留搜索`)
          assert.equal(await selected.getAttribute('aria-pressed'), 'true', `${url} 清空保留快捷状态`)
          assert.equal(await trigger.getAttribute('aria-label'), '筛选')
          await selected.click()
          await ready(page, 0, label)
          assert.equal(await selected.getAttribute('aria-pressed'), 'false')
          await search.fill('')
          await search.press('Enter')
          await ready(page, 0, label)
          if (label === '质检状态') {
            await page.locator('.erp-business-operation-panel').getByRole('button', { name: '筛选', exact: true }).click()
            const types = page.getByRole('dialog', { name: '筛选条件', exact: true }).getByRole('group', { name: '检验类型', exact: true })
            for (const [type, rpc] of [['委外回货', 'list_outsourcing_return_quality_inspections'], ['成品检验', 'list_finished_goods_quality_inspections'], ['生产分段质检', 'list_production_stage_quality_inspections']]) {
              const response = page.waitForResponse((res) => res.request().postDataJSON()?.method === rpc)
              await types.getByRole('button', { name: type, exact: true }).click()
              await response
              await ready(page, 0, label)
            }
            await page.keyboard.press('Escape')
          }
          if (label === '收付款状态') {
            await page.getByRole('tab', { name: '红冲记录', exact: true }).click()
            await ready(page, 0, '红冲状态')
          }
          await assertNoHorizontalOverflow(page, url)
        }
      },
    },
    {
      ...shared,
name: 'business-status-counts-dark-narrow',
themeMode: 'dark',
viewport: { width: 760, height: 900 },
      verify: async (page) => {
        await ready(page, currentCount)
        const metrics = await group(page).evaluate((el) => ({ width: el.getBoundingClientRect().width, overflow: el.scrollWidth > el.clientWidth, height: el.getBoundingClientRect().height }))
        assert(metrics.width > 0 && metrics.height >= 28 && !metrics.overflow, JSON.stringify(metrics))
        await choose(page, '销售订单状态', '已提交', 3)
        await ready(page, currentCount)
        await page.screenshot({ path: path.join(outputDir, 'business-status-counts-dark-narrow.png') })
        await assertNoHorizontalOverflow(page, 'business-status-counts-dark-narrow')
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_finance_payments' || !params.include_status_counts) return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ payments: [], total: 0, status_counts: { APPROVED: 1234567890 } }) } })
        })
        await gotoScenarioPath(page, '/erp/finance/payments', { waitUntil: 'domcontentloaded' })
        await ready(page, 1234567890, '收付款状态')
        await assertCounts(page, '收付款状态', [['已批准待核销', 1234567890]])
        await choose(page, '收付款状态', '已批准待核销', 1234567890)
        await ready(page, 1234567890, '收付款状态')
        assert(!(await group(page, '收付款状态').evaluate((el) => el.scrollWidth > el.clientWidth)))
        const summary = group(page, '收付款状态').getByRole('button', { name: '已批准待核销，共 1234567890 条', exact: true })
        assert(await summary.evaluate((el) => el.scrollWidth <= el.clientWidth + 1), '长状态和完整数量不应被省略')
        await assertNoHorizontalOverflow(page, 'business-status-counts-wide-numbers')
        await page.screenshot({ path: path.join(outputDir, 'business-status-counts-finance-narrow.png') })
      },
    },
  ]
}
