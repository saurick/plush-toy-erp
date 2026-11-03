import { expect } from 'playwright/test'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { createBusinessSplitPerformanceScenarios } from './businessSplitPerformanceScenarios.mjs'

export function createBusinessSplitScenarios({ assert, customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir }) {
  return [
    { name: 'business-split-material-sync', path: '/erp/master/materials', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-bom-draft', path: '/erp/purchase/material-bom', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'business-split-material-dark', path: '/erp/master/materials', viewport: { width: 1440, height: 900 }, themeMode: 'dark' },
    { name: 'business-split-material-narrow', path: '/erp/master/materials', viewport: { width: 800, height: 900 } },
  ].map((definition) => {
    const writes = []
    return {
      ...definition,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      beforeNavigate: async (page) => {
        writes.length = 0
        const records = await installBOMMaterialMatchingMocks(page)
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'create_material') {
            writes.push(params)
            const material = { ...params, id: 800, is_active: true }
            records.push(material)
            data = { material }
          } else if (method === 'get_material') data = { material: records.find((row) => row.id === params.id) }
          else if (method === 'list_materials') {
            const keyword = String(params.keyword || '').toLowerCase()
            data = stylePaginatedRpcData(records.filter((row) => (!params.active_only || row.is_active) && (!keyword || Object.values(row).join(' ').toLowerCase().includes(keyword))), 'materials', params)
          } else return route.fallback()
          return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: styleRpcResult(data) }) })
        })
      },
      verify: async (page) => {
        const draft = definition.name === 'business-split-bom-draft'
        if (draft) {
          await page.getByRole('button', { name: '新建 BOM' }).click()
          await page.locator('.erp-business-form-page:not([hidden])').waitFor()
          await page.getByLabel('订单数量', { exact: true }).fill('3030')
          await page.locator('.erp-business-form-page:not([hidden])').getByRole('button', { name: '添加物料' }).click()
        }
        await page.getByRole('button', { name: '分栏编辑', exact: true }).first().click()
        const left = page.getByRole('region', { name: '左栏页面', exact: true })
        const right = page.getByRole('region', { name: '右栏页面', exact: true })
        await right.waitFor()
        await right.getByRole('combobox', { name: '选择右栏页面' }).click()
        await page.locator('.ant-select-dropdown:visible').getByText('材料档案', { exact: true }).click()
        await right.getByRole('button', { name: '新建材料' }).waitFor()
        assert.equal(new URL(page.url()).pathname, definition.path, '右栏切页必须保留左栏路由')
        const leftDraft = draft ? await left.getByLabel('订单数量', { exact: true }).elementHandle() : null
        await right.getByRole('button', { name: '新建材料' }).click()
        const editor = right.locator('.erp-business-form-page:not([hidden])')
        await editor.waitFor()
        const newName = '分栏新增面料'
        await editor.getByLabel('名称', { exact: true }).fill(newName)
        await editor.getByLabel('库存类别', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        assert.equal(writes.length, 1)
        if (draft) {
          await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
          assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, leftDraft), true)
          const choose = left.getByRole('combobox', { name: '物料名称 1', exact: true })
          await choose.fill(newName)
          await page.locator('.ant-select-dropdown:visible').getByText(newName).waitFor()
          await choose.press('Escape')
        } else {
          if (definition.viewport.width < 992) await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await left.getByText(newName).waitFor()
        }
        await assertNoHorizontalOverflow(page, definition.name)
        await page.screenshot({ path: `${outputDir}/${definition.name}.png`, fullPage: true })
        await leftDraft?.dispose()
      },
    }
  }).concat(createBusinessSplitPerformanceScenarios({ assert, customerRuntimeEffectiveSession, outputDir }))
}
