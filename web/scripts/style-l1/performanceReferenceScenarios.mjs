import assert from 'node:assert/strict'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'

export function createPerformanceReferenceScenarios({ customerRuntimeEffectiveSession }) {
  const scenarios = []
  for (const kind of ['sales', 'purchase', 'purchase-recovery']) {
    let calls = []
    let failedPage = false
    scenarios.push({
      name: `performance-reference-${kind}`,
      path: kind === 'sales' ? '/erp/sales/project-orders/sales-orders' : '/erp/purchase/accessories',
      auth: 'admin', effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      expectedConsoleErrorPatterns: kind === 'purchase-recovery'
        ? [/Failed to load resource:.*503.*\/rpc\/masterdata/u]
        : [],
      beforeNavigate: async (page) => {
        calls = []
        failedPage = false
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          const key = { list_customers: 'customers', list_suppliers: 'suppliers', list_materials: 'materials', list_product_skus: 'product_skus' }[method]
          if (!key) return route.fallback()
          calls.push({ method, params })
          if (kind === 'purchase-recovery' && method === 'list_materials' && params.offset === 50 && !failedPage) {
            failedPage = true
            return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
          }
          const ids = params.ids || (params.keyword ? [5001] : Array.from({ length: 5001 }, (_, index) => index + 1))
          const rows = ids.map((recordID) => ({
            id: recordID, code: `PERF-${recordID}`, name: `性能资料${recordID}`, sku_code: `PERF-SKU-${recordID}`,
            is_active: true, default_unit_id: 1, unit_id: 1, product_id: 1,
            supplier_type: 'material', default_payment_method: '现结', default_payment_term_days: 0,
          }))
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: { code: 0, data: stylePaginatedRpcData(rows, key, params, 50) } }) })
        })
      },
      verify: async (page) => {
        const title = kind === 'sales' ? '新建销售订单' : '新建采购订单'
        await page.locator('button').filter({ hasText: kind === 'sales' ? '新建订单' : title }).first().click()
        const editor = page.locator('.erp-business-form-page:not([hidden])').filter({ hasText: title }).last()
        await editor.waitFor({ state: 'visible' })
        assert.ok(calls.every((call) => Array.isArray(call.params.ids)), 'opening a page/editor must not walk a 5001-record catalog')
        if (kind === 'sales') {
          const customer = editor.getByLabel('客户', { exact: true })
          await customer.click()
          await page.locator('.ant-select-item-option').filter({ hasText: '性能资料1' }).first().waitFor()
          await customer.fill('性能资料5001')
          await page.locator('.ant-select-item-option').filter({ hasText: '性能资料5001' }).click()
          await editor.locator('.ant-select-selection-item').filter({ hasText: '性能资料5001' }).waitFor()
          const pages = calls.filter((call) => call.method === 'list_customers' && !call.params.ids)
          assert.equal(pages.length, 2)
          assert.ok(pages.every((call) => call.params.limit === 50 && call.params.offset === 0))
          assert.equal(pages[1].params.keyword, '性能资料5001')
        } else {
          await editor.locator('button').filter({ hasText: '从材料库添加' }).click()
          const picker = page.getByRole('dialog').filter({ hasText: '从材料库添加' }).last()
          await picker.getByText('PERF-1', { exact: true }).waitFor()
          await picker.getByText('PERF-1', { exact: true }).click()
          const failedResponse = kind === 'purchase-recovery'
            ? page.waitForResponse((response) => response.url().endsWith('/rpc/masterdata') && response.status() === 503)
            : null
          await picker.locator('.ant-pagination-next button').click()
          if (failedResponse) {
            await failedResponse
            await page.waitForFunction(() => {
              const picker = document.querySelector('.erp-source-import-picker-modal')
              const reload = [...(picker?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === '重新加载')
              return reload && !reload.disabled
            })
            assert.deepEqual(calls.filter((call) => call.method === 'list_materials' && !call.params.ids).map((call) => call.params.offset), [0, 50])
            assert.equal(await picker.locator('.ant-pagination-item-active').innerText(), '1')
            await picker.getByText('PERF-1', { exact: true }).waitFor()
            assert.equal(await picker.getByRole('button', { name: '添加到采购明细', exact: true }).isDisabled(), true)
            await picker.getByRole('button', { name: '重新加载', exact: true }).click()
          }
          await picker.getByText('PERF-51', { exact: true }).click()
          const search = picker.getByPlaceholder('搜索材料', { exact: true })
          await search.fill('性能资料5001')
          await search.press('Enter')
          await picker.getByText('PERF-5001', { exact: true }).click()
          await picker.locator('button').filter({ hasText: '添加到采购明细' }).click()
          await editor.locator('.ant-select-selection-item').filter({ hasText: '性能资料5001' }).waitFor()
          await editor.locator('.ant-select-selection-item').filter({ hasText: /性能资料1$/u }).waitFor()
          await editor.locator('.ant-select-selection-item').filter({ hasText: /性能资料51$/u }).waitFor()
          const pages = calls.filter((call) => call.method === 'list_materials' && !call.params.ids)
          assert.equal(pages.length, kind === 'purchase-recovery' ? 4 : 3)
          assert.ok(pages.every((call) => call.params.limit === 50))
          assert.equal(pages[1].params.offset, 50)
          if (kind === 'purchase-recovery') assert.equal(pages[2].params.offset, 50)
        }
      },
    })
  }
  return scenarios
}
