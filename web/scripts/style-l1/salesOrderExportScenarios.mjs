import { readFile } from 'node:fs/promises'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { purchaseFollowupFixture } from './purchaseFollowupFixtures.mjs'

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
  ...(index === 0 ? {
    order_date: 0,
    planned_delivery_date: null,
    goods_amount: '0',
    tax_amount: '0',
    order_total: '0',
    payment_method: '月结',
    payment_term_days: 0,
    sales_owner: '跟单-甲',
  } : {}),
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
      path: '/erp/purchase/accessories',
      name: 'purchase-order-export-empty-values',
      beforeNavigate: async (page) => {
        const rows = [{
          id: 8801,
          purchase_order_no: 'PO-EXPORT-EMPTY',
          supplier_id: 1,
          supplier_snapshot: { name: '导出模拟供应商' },
          lifecycle_status: 'draft',
          currency: 'CNY',
          purchase_date: 0,
          expected_arrival_date: null,
          supplier_confirmed_arrival_date: 0,
          payment_method: '月结',
          payment_term_days: 0,
          invoice_required: false,
          delivery_address: '-',
          items: [],
        }]
        page.purchaseExportRows = rows
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_purchase_followups') return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(purchaseFollowupFixture([{ key: 'unscheduled:8801:1', source_type: 'purchase_order', source_id: 8801, source_no: 'PO-EXPORT-EMPTY', order_id: 8801, order_no: 'PO-EXPORT-EMPTY', supplier_id: 0, supplier_name: '', line_id: 1, line_no: '1', material_code: '', material_name: '', unit_name: '', quantity: '', due_date: '', date_source: '', kind: 'unscheduled' }], params)) } })
          if (method !== 'list_purchase_orders') return route.fallback()
          await route.fulfill({ json: {
            jsonrpc: '2.0',
            id,
            result: styleRpcResult(stylePaginatedRpcData(rows, 'purchase_orders', params)),
          } })
        })
      },
      verify: async (page) => {
        await page.getByText('PO-EXPORT-EMPTY', { exact: true }).waitFor()
        const downloadPromise = page.waitForEvent('download')
        await openExport(page)
        const download = await downloadPromise
        const csv = await readFile(await download.path(), 'utf8')
        await download.saveAs(path.join(outputDir, 'purchase-order-empty-values.csv'))
        const [header, values] = csv.replace(/^\uFEFF/u, '').split('\n').map((line) => line.split(','))
        const row = Object.fromEntries(header.map((label, index) => [label, values[index]]))
        for (const label of ['下单日期', '预计到货日期', '供应商确认到货日期']) {
          assert.equal(row[label], '', `${label} 缺失时必须导出空单元格`)
        }
        assert.equal(row['采购单号'], 'PO-EXPORT-EMPTY')
        assert.equal(row['付款条件'], '月结 0天')
        assert.equal(row['发票要求'], '不需要发票')
        assert.equal(row['收货地址'], "'-", '真实横杠保留并继续执行 CSV 公式防护')
        await page.getByText('已导出 1 条采购订单', { exact: true }).waitFor()
        page.purchaseExportRows[0] = { ...page.purchaseExportRows[0], supplier_id: 0, supplier_snapshot: {} }
        await page.getByText('到货计划', { exact: true }).click()
        await page.getByRole('region', { name: '采购到货计划' }).getByText('PO-EXPORT-EMPTY', { exact: true }).waitFor()
        const arrivalDownloadPromise = page.waitForEvent('download')
        await page.getByRole('button', { name: '导出当前结果', exact: true }).click()
        const arrivalDownload = await arrivalDownloadPromise
        await arrivalDownload.saveAs(path.join(outputDir, 'purchase-arrival-empty-values.csv'))
        const [arrivalHeader, arrivalValues] = (await readFile(await arrivalDownload.path(), 'utf8'))
          .replace(/^\uFEFF/u, '').split('\n').map((line) => line.split(','))
        const arrivalRow = Object.fromEntries(arrivalHeader.map((label, index) => [label, arrivalValues[index]]))
        assert.equal(arrivalRow['供应商'], '')
        assert.equal(arrivalRow['交期'], '')
        assert.equal(arrivalRow['需跟进事项'], '未排交期')
      },
    },
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
        const [header, firstRow] = csv.replace(/^\uFEFF/u, '').split('\n').map((line) => line.split(','))
        const exported = Object.fromEntries(header.map((label, index) => [label, firstRow[index]]))
        for (const label of ['下单日期', '计划交付日期', '联系人', '收货信息', '计税信息', '运费条件']) {
          assert.equal(exported[label], '', `${label} 缺失时必须导出空单元格`)
        }
        assert.equal(exported['付款条件'], '月结 0天')
        assert.equal(exported['订单总额'], 'CNY 0.00')
        assert.equal(exported['业务员（跟单人）'], '跟单-甲')
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
        const [header, , secondRow] = csv.replace(/^\uFEFF/u, '').split('\n').map((line) => line.split(','))
        assert.equal(secondRow[header.indexOf('摘要')], '')
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
        const rows = Array.from({ length: 201 }, (_, index) => ({ id: index + 1, code: `HISTORY-${index + 1}`, name: '历史模拟客户', is_active: false }))
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
        const [header, firstRow] = csv.replace(/^\uFEFF/u, '').split('\n').map((line) => line.split(','))
        assert.equal(firstRow[header.indexOf('摘要')], '')
        assert.equal(firstRow[header.indexOf('最后更新')], '')
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
