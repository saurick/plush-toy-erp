import { readFile } from 'node:fs/promises'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const orders = Array.from({ length: 251 }, (_, index) => ({
  id: index + 1,
  order_no: `EXPORT-${String(index + 1).padStart(3, '0')}`,
  customer_id: 1,
  customer_snapshot: { name: '导出模拟客户' },
  contact_snapshot: {},
  delivery_snapshot: {},
  currency: 'CNY',
  lifecycle_status: 'draft',
  order_date: 1700000000,
  updated_at: 1700000000,
  created_at: 1700000000,
  item_count: 1,
  version: 1,
}))

export function createSalesOrderExportScenarios({ assert, customerRuntimeEffectiveSession, outputDir, path }) {
  const openExport = async (page) => {
    await page.mouse.move(0, 0)
    await page.locator('.ant-tooltip:visible').first().waitFor({ state: 'hidden' })
    await openBusinessTableTool(page, '导出筛选结果')
  }
  const beforeNavigate = async (page) => {
    page.salesExportState = { mode: 'complete', requests: [], listRequests: [], downloads: 0 }
    page.on('download', () => { page.salesExportState.downloads += 1 })
    await page.route('**/rpc/sales_order', async (route) => {
      const { id, method, params = {} } = route.request().postDataJSON()
      const state = page.salesExportState
      const sourceRows = params.lifecycle_scope === 'history'
        ? orders.map((row) => ({ ...row, lifecycle_status: 'closed' }))
        : orders
      let result
      if (method === 'list_sales_orders') {
        state.listRequests.push(params)
        result = styleRpcResult(stylePaginatedRpcData(sourceRows, 'sales_orders', params))
      } else if (method === 'get_sales_order') {
        result = styleRpcResult({ sales_order: orders.find((row) => row.id === Number(params.id)) })
      } else if (method === 'export_sales_orders') {
        state.requests.push(params)
        if (state.mode === 'hold') await new Promise((resolve) => { state.release = resolve })
        if (state.mode === 'limit') result = { code: 41323, message: '导出的销售订单较多，请缩小筛选范围后重试' }
        else if (state.mode === 'busy') result = { code: 42923, message: '当前导出人数较多，请稍后重试' }
        else if (state.mode === 'timeout') result = { code: 40823, message: '导出超时，请缩小筛选范围后重试' }
        else {
          const rows = params.id ? sourceRows.filter((row) => row.id === params.id) : state.mode === 'empty' ? [] : sourceRows
          result = styleRpcResult({ sales_orders: rows, total: rows.length + (state.mode === 'partial' ? 1 : 0) })
        }
      } else {
        await route.fallback()
        return
      }
      await route.fulfill({ json: { jsonrpc: '2.0', id, result } })
    })
  }
  const base = {
    path: '/erp/sales/project-orders/sales-orders?keyword=EXPORT',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 3840, height: 2160 },
    beforeNavigate,
  }
  return [
    {
      ...base,
      name: 'sales-order-export-snapshot',
      verify: async (page) => {
        await page.getByText('EXPORT-001', { exact: true }).waitFor()
        const state = page.salesExportState
        state.mode = 'hold'
        const download = page.waitForEvent('download')
        const request = page.waitForRequest((request) => request.postDataJSON()?.method === 'export_sales_orders')
        await openExport(page)
        await request
        // The toolbar can be reopened during a pending export; the same action
        // remains disabled and cannot start a second request.
        await page.getByRole('button', { name: '表格工具', exact: true }).click()
        const action = page.getByRole('menuitem', { name: /导出筛选结果/u })
        assert.equal(await action.getAttribute('aria-disabled'), 'true')
        assert.equal(state.requests.length, 1)
        await page.keyboard.press('Escape')
        state.mode = 'complete'
        state.release()
        const csv = await readFile(await (await download).path(), 'utf8')
        assert(csv.includes('EXPORT-251'), 'CSV 必须包含正常分页以外的订单')
        assert.equal(csv.trim().split('\n').length, 252)
        const { limit: _limit, offset: _offset, include_status_counts: _counts, ...filters } = state.listRequests.at(-1)
        assert.deepEqual(state.requests[0], filters, '导出必须保留当前列表条件且不能分页')
        await page.getByText('已导出 251 条销售订单', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'sales-order-export-snapshot-4k.png') })
      },
    },
    {
      ...base,
      name: 'sales-order-export-failure-retry',
      verify: async (page) => {
        await page.getByText('EXPORT-001', { exact: true }).waitFor()
        const state = page.salesExportState
        for (const [mode, text] of [
          ['limit', '请缩小筛选范围'],
          ['busy', '请稍后重试'],
          ['timeout', '导出超时'],
          ['partial', '导出内容不完整'],
          ['empty', '当前筛选没有可导出的销售订单'],
        ]) {
          state.mode = mode
          await openExport(page)
          await page.locator('.ant-message-notice-content').filter({ hasText: text }).last().waitFor()
          assert.equal(state.downloads, 0, `${mode} 不得生成部分文件`)
        }
        state.mode = 'complete'
        const download = page.waitForEvent('download')
        await openExport(page)
        await download
        assert.equal(state.downloads, 1, '失败后可重新导出')
      },
    },
    {
      ...base,
      path: '/erp/history?source=sales_orders&keyword=EXPORT',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...new Set([...customerRuntimeEffectiveSession.pages, 'history-records'])],
      },
      name: 'sales-order-export-history',
      verify: async (page) => {
        await page.getByText('EXPORT-001', { exact: true }).waitFor()
        const download = page.waitForEvent('download')
        await openExport(page)
        const csv = await readFile(await (await download).path(), 'utf8')
        assert.deepEqual(page.salesExportState.requests, [{ keyword: 'EXPORT', lifecycle_scope: 'history' }])
        assert.equal(csv.trim().split('\n').length, 252)
        assert(csv.includes('EXPORT-251') && csv.includes('已关闭'))
      },
    },
    {
      ...base,
      path: '/erp/history?source=customers&keyword=HISTORY',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...new Set([...customerRuntimeEffectiveSession.pages, 'history-records'])],
      },
      name: 'sales-order-export-preserves-other-history',
      beforeNavigate: async (page) => {
        await beforeNavigate(page)
        page.customerHistoryRequests = []
        const rows = Array.from({ length: 201 }, (_, index) => ({ id: index + 1, code: `HISTORY-${index+1}`, name: '历史模拟客户', is_active: false }))
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_customers') return route.fallback()
          page.customerHistoryRequests.push(params)
          await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(rows, 'customers', params)) } })
        })
      },
      verify: async (page) => {
        await page.getByText('HISTORY-1', { exact: true }).waitFor()
        const download = page.waitForEvent('download')
        await openExport(page)
        const csv = await readFile(await (await download).path(), 'utf8')
        assert(csv.includes('HISTORY-201'))
        assert.equal(csv.trim().split('\n').length, 202)
        const requests = page.customerHistoryRequests.filter((params) => params.limit === 200)
        assert.deepEqual(requests.map((params) => params.offset), [0, 200])
        assert(requests.every((params) => params.lifecycle_scope === 'history'))
        assert.deepEqual(page.salesExportState.requests, [])
      },
    },
    {
      ...base,
      path: '/erp/sales/project-orders/sales-orders?sales_order_id=251',
      name: 'sales-order-export-exact-id',
      verify: async (page) => {
        await page.getByText('EXPORT-251', { exact: true }).first().waitFor()
        const download = page.waitForEvent('download')
        await openExport(page)
        const csv = await readFile(await (await download).path(), 'utf8')
        assert.deepEqual(page.salesExportState.requests, [{ id: 251 }])
        assert.equal(csv.trim().split('\n').length, 2)
        assert(csv.includes('EXPORT-251'))
        assert(!csv.includes('EXPORT-001'))
      },
    },
  ]
}
