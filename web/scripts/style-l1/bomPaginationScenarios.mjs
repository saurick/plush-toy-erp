import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createBOMPaginationScenarios({ assert, customerRuntimeEffectiveSession, assertNoHorizontalOverflow }) {
  return ['create', 'copy', 'edit'].map((mode) => {
    let records
    let listRequests
    let writes
    return {
      name: `bom-save-pagination-${mode}`,
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        records = Array.from({ length: 124 }, (_, index) => ({
          id: 124 - index,
          product_id: 1,
          version: `V${124 - index}`,
          status: 'DRAFT',
          item_count: 0,
          items: [],
          edit_version: 1791648000000000,
          created_at: 1791648000 + 124 - index,
          updated_at: 1791648000 + 124 - index,
        }))
        listRequests = []
        writes = []
        await page.route('**/rpc/bom', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          const reply = (data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
          if (method === 'list_bom_versions') {
            if (Number(params.limit) === 50) listRequests.push(Number(params.offset || 0))
            return reply(stylePaginatedRpcData(records.filter((record) => !params.product_id || record.product_id === params.product_id), 'bom_versions', params))
          }
          if (method === 'get_bom_version') return reply({ bom_version: records.find((record) => record.id === params.id) })
          if (['save_bom_with_items', 'copy_bom_version'].includes(method)) {
            writes.push({ method, params })
            const previous = records.find((record) => record.id === (params.id || params.source_id))
            const record = {
              ...(previous || {}),
              ...params,
              id: params.id || 125,
              status: 'DRAFT',
              items: params.items || previous?.items || [],
              item_count: 0,
              edit_version: 1791648000000001,
              created_at: previous?.created_at || 1791649000,
              updated_at: 1791649000,
            }
            records = [...records.filter((entry) => entry.id !== record.id), record].sort((left, right) => right.id - left.id)
            return reply({ bom_version: record })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        page.setDefaultTimeout(10000)
        await page.locator('.ant-pagination-item-3').click()
        const row = page.locator('.erp-business-data-table-card tr[data-row-key="24"]')
        await row.waitFor()
        assert.equal(listRequests.at(-1), 100)
        if (mode === 'create') {
          await page.getByRole('button', { name: /新建\s*BOM/u }).click()
        } else {
          await row.click()
          await page.locator(`button[data-business-action-key="${mode}"]:visible`).click()
        }
        const editor = page.locator('.erp-bom-editor:not([hidden])')
        await editor.waitFor()
        await page.waitForFunction(() => document.querySelector('.erp-bom-editor:not([hidden])')?.getAttribute('aria-busy') === 'false')
        if (mode === 'create') {
          await editor.getByLabel('产品', { exact: true }).click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'PROD-STYLE-L1' }).click()
        }
        if (mode !== 'edit') await editor.getByLabel('BOM 版本', { exact: true }).fill('V125')
        else await editor.getByLabel('备注', { exact: true }).fill('当前页编辑后的说明')
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        const expectedPage = mode === 'edit' ? '3' : '1'
        await page.waitForFunction((expected) => document.querySelector('.ant-pagination-item-active')?.textContent.trim() === expected, expectedPage)
        await page.locator(`.erp-business-data-table-card tr[data-row-key="${mode === 'edit' ? 24 : 125}"]`).waitFor()
        assert.equal(listRequests.at(-1), mode === 'edit' ? 100 : 0)
        assert.equal(writes.length, 1, '保存只写入一次，分页刷新不能重复创建版本')
        assert.equal(writes[0].method, mode === 'copy' ? 'copy_bom_version' : 'save_bom_with_items')
        assert.equal(writes[0].params.id, mode === 'edit' ? 24 : undefined)
        if (mode === 'copy') assert.equal(writes[0].params.source_id, 24)
        await assertNoHorizontalOverflow(page, `BOM ${mode} 保存后的分页`)
      },
    }
  })
}
