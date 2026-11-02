import { expect as expectLocator } from 'playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { createSalesOrderWorkbook } from './salesOrderImportWorkbookFixture.mjs'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'
import { assertImportPickerGeometry, assertImportToolbarLayout, assertImportFilterPrompt, readImportPickerLayout, assertImportPickerStableLayout, assertImportPickerStableDuring } from './importPickerAssertions.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

async function choose(page, scope, label, text) {
  const input = page.getByRole('combobox', { name: label, exact: true })
  await scope.locator('.ant-select').filter({ has: input }).locator('.ant-select-selector').click()
  await waitForFiniteAnimations(page)
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: text }).click()
}

export function createImportPickerScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  const base = { auth: 'admin', effectiveSession: customerRuntimeEffectiveSession, viewport: { width: 1440, height: 900 } }
  const capture = async (page, name) => {
    await page.setViewportSize({ width: 3840, height: 2160 })
    await waitForFiniteAnimations(page)
    await page.screenshot({ path: `${outputDir}/${name}-4k.png` })
    await page.setViewportSize(base.viewport)
  }
  return [
    {
      ...base,
name: 'import-filter-sales-excel',
path: '/erp/sales/project-orders/sales-orders',
      verify: async (page) => {
        await page.getByRole('button', { name: '导入 Excel', exact: true }).waitFor()
        await page.waitForFunction(() => !document.querySelector('button[aria-label="导入 Excel"]').disabled)
        await page.locator('[data-sales-order-import-input]').setInputFiles({ name: '筛选模拟订单.xlsx',
mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createSalesOrderWorkbook({ sheets: [{ name: '订单表',
rows: [
            ['订单编号', '客户', '下单日期', '产品名称', '订单数量', '单位', '币种'],
            ['SO-FILTER-A', '', '2026-09-01', '模拟产品甲', 2, '个', 'CNY'],
            ['SO-FILTER-B', '暗色客户', '2026-09-01', '模拟产品乙', 3, '个', 'CNY'],
          ] }] }) })
        const picker = page.getByRole('dialog', { name: '导入销售订单 Excel', exact: true })
        await picker.locator('.ant-table-row').first().waitFor()
        await assertImportPickerGeometry(page, picker, 'sales-excel-filter')
        const layout = await readImportPickerLayout(picker)
        await assertImportFilterPrompt(page, picker, '原表客户筛选', '按原表客户筛选')
        await assertImportFilterPrompt(page, picker, '订单核对筛选', '按核对状态筛选', ['全部订单'])
        await choose(page, picker, '原表客户筛选', '未填写客户')
        assert.equal(await picker.locator('.ant-table-row').count(), 1)
        await assertImportPickerStableLayout(picker, layout, 'sales-excel-one-result')
        await picker.locator('.ant-table-row input[type="checkbox"]').check()
        await choose(page, picker, '原表客户筛选', '暗色客户')
        assert.match(await picker.innerText(), /已选 1 条/u)
        assert.equal(await picker.getByRole('button', { name: /全选筛选结果/u }).count(), 0, 'one page uses the header selection')
        await picker.getByRole('checkbox', { name: '全选本页', exact: true }).check()
        assert.match(await picker.innerText(), /已选 2 条/u)
        await picker.locator('.ant-table-row input[type="checkbox"]').uncheck()
        assert.match(await picker.innerText(), /已选 1 条/u)
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).check()
        assert.match(await picker.locator('.ant-table-row').innerText(), /SO-FILTER-A/u)
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).uncheck()
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        await choose(page, picker, '订单核对筛选', '待核对（1）')
        assert.equal(await picker.locator('.ant-table-row').count(), 1)
        await picker.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '订单核对筛选', exact: true }) }).locator('.ant-select-clear').click()
        assert.equal(await picker.locator('.ant-table-row').count(), 2)
        await assertImportFilterPrompt(page, picker, '订单核对筛选', '按核对状态筛选', ['全部订单'])
        await choose(page, picker, '订单核对筛选', '待核对（1）')
        await choose(page, picker, '订单 SO-FILTER-A 的客户', 'CUS-STYLE-L1')
        await picker.getByText('当前范围没有待核对订单', { exact: true }).waitFor()
        await assertImportPickerStableLayout(picker, layout, 'sales-excel-empty-review')
        assert.equal(await picker.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '订单核对筛选', exact: true }) }).locator('.ant-select-selection-item').innerText(), '待核对（0）')
        await assertImportToolbarLayout(page, picker, 'sales-excel-empty-review')
        assert.match(await picker.innerText(), /已选 1 条/u)
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        await capture(page, 'sales-excel-import')
        await picker.getByRole('button', { name: '核对所选订单', exact: true }).click()
        await page.getByRole('heading', { name: '批量导入销售订单', exact: true }).waitFor()
      },
    },
    {
      ...base,
      name: 'import-selection-sales-excel',
      path: '/erp/sales/project-orders/sales-orders',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page.getByRole('button', { name: '导入 Excel', exact: true }).waitFor()
        await page.waitForFunction(() => !document.querySelector('button[aria-label="导入 Excel"]').disabled)
        await page.locator('[data-sales-order-import-input]').setInputFiles({
          name: '跨页核对订单.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createSalesOrderWorkbook({ sheets: [{ name: '订单表', rows: [
            ['订单编号', '客户', '下单日期', '产品名称', '订单数量', '单位', '币种'],
            ...Array.from({ length: 10 }, (_, index) => [`SO-BULK-${String(index + 1).padStart(2, '0')}`, index ? '暗色客户' : '', '2026-09-01', `模拟产品${index + 1}`, 2, '个', 'CNY']),
          ] }] }),
        })
        const picker = page.getByRole('dialog', { name: '导入销售订单 Excel', exact: true })
        await expectLocator(picker.locator('.ant-table-row')).toHaveCount(5)
        const count = picker.locator('.erp-source-import-picker__selection-items > .ant-typography')
        const confirm = picker.getByRole('button', { name: '核对所选订单', exact: true })
        await assertImportPickerGeometry(page, picker, 'sales-excel-bulk')
        await picker.getByRole('checkbox', { name: '全选本页', exact: true }).check()
        await expectLocator(count).toContainText('已选 5 条')
        await expectLocator(confirm).toContainText('（5 条）')
        await picker.getByRole('button', { name: '下一页', exact: true }).click()
        await expectLocator(picker.locator('.ant-table-row').first()).toContainText('SO-BULK-06')
        await picker.getByRole('checkbox', { name: '全选本页', exact: true }).check()
        await expectLocator(count).toContainText('已选 10 条')
        await picker.getByRole('button', { name: '清空已选', exact: true }).click()
        await choose(page, picker, '原表客户筛选', '未填写客户')
        await expectLocator(picker.locator('.ant-table-row')).toHaveCount(1)
        await picker.getByRole('checkbox', { name: '全选本页', exact: true }).check()
        await choose(page, picker, '原表客户筛选', '暗色客户')
        await expectLocator(count).toContainText('已选 1 条')
        await picker.getByRole('button', { name: '全选筛选结果（9 条）', exact: true }).click()
        await expectLocator(count).toContainText('已选 10 条')
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).check()
        await expectLocator(picker.getByRole('button', { name: /全选筛选结果/u })).toHaveCount(0)
        await picker.locator('.ant-table-row[data-row-key="SO-BULK-01"] input[type="checkbox"]').click()
        await expectLocator(count).toContainText('已选 9 条')
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).uncheck()
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        await picker.getByRole('button', { name: '全选筛选结果（10 条）', exact: true }).click()
        await expectLocator(count).toContainText('已选 10 条')
        for (const width of [1920, 1024, 736, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          await waitForFiniteAnimations(page)
          await assertImportToolbarLayout(page, picker, `sales-excel-bulk-selected-${width}`)
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${outputDir}/sales-excel-bulk-4k.png` })
        await confirm.click()
        const editor = page.getByRole('region', { name: '批量导入销售订单', exact: true })
        await editor.getByRole('button', { name: '保存全部 10 张草稿', exact: true }).waitFor()
      },
    },
    {
      ...base,
name: 'import-filter-bom-excel',
path: '/erp/purchase/material-bom',
      verify: async (page) => {
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /从 Excel 新建/u }).click()])
        await chooser.setFiles({ name: '筛选模拟BOM.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture({ grouped: true, unmatchedProduct: true }) })
        const picker = page.getByRole('dialog', { name: '从 Excel 新建 BOM', exact: true })
        await picker.locator('.ant-table-row').first().waitFor()
        await assertImportPickerGeometry(page, picker, 'bom-excel-filter')
        await assertImportFilterPrompt(page, picker, 'BOM 待处理筛选', '筛选待处理项', ['全部部位'])
        const before = await picker.locator('.ant-table-row').count()
        await choose(page, picker, 'BOM 待处理筛选', '待选择物料')
        assert.ok(await picker.locator('.ant-table-row').count() < before)
        await picker.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: 'BOM 待处理筛选', exact: true }) }).locator('.ant-select-clear').click()
        assert.equal(await picker.locator('.ant-table-row').count(), before)
        await assertImportFilterPrompt(page, picker, 'BOM 待处理筛选', '筛选待处理项', ['全部部位'])
        await choose(page, picker, 'BOM 待处理筛选', '待选择物料')
        assert.match(await picker.getByRole('status').innerText(), /确认后带入全部/u)
        const search = picker.getByRole('textbox', { name: '搜索 BOM 导入明细', exact: true })
        await search.fill('不存在的材料'); await search.press('Enter')
        assert.equal(await picker.locator('.ant-table-row').count(), 0)
        await picker.getByText('没有符合条件的部位', { exact: true }).waitFor()
        await assertImportToolbarLayout(page, picker, 'bom-excel-empty-search')
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        assert.equal(await picker.locator('.ant-table-row').count(), before)
        await capture(page, 'bom-excel-import')
        assert.match(await picker.getByRole('button', { name: '带入编辑', exact: true }).innerText(), new RegExp(`${before} 个部位`, 'u'))
        await choose(page, picker, 'BOM 待处理筛选', '待选择物料')
        assert.ok(await picker.locator('.ant-table-row').count() < before)
        await expectLocator(picker.getByRole('checkbox', { name: '全选本页', exact: true })).toHaveCount(0)
        await picker.getByRole('button', { name: '带入编辑', exact: true }).click()
        await page.locator('.erp-bom-import-review').waitFor()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await expectLocator(editor.locator('[data-bom-part-index]')).toHaveCount(before)
        const [detailChooser] = await Promise.all([page.waitForEvent('filechooser'), editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click()])
        await detailChooser.setFiles({ name: '筛选模拟BOM明细.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture({ grouped: true, unmatchedProduct: true }) })
        const detailPicker = page.getByRole('dialog', { name: '导入材料明细', exact: true })
        await detailPicker.locator('.ant-table-row').first().waitFor()
        assert.match(await detailPicker.getByRole('status').innerText(), /确认后带入全部/u)
        const detailSearch = detailPicker.getByRole('textbox', { name: '搜索 BOM 导入明细', exact: true })
        await detailSearch.fill('不存在的部位'); await detailSearch.press('Enter')
        await detailPicker.getByText('没有符合条件的部位', { exact: true }).waitFor()
        const append = detailPicker.getByRole('button', { name: `追加 ${before} 个部位`, exact: true })
        await expectLocator(append).toBeEnabled()
        await append.click()
        await editor.locator('.erp-bom-import-review').waitFor()
        await expectLocator(editor.locator('[data-bom-part-index]')).toHaveCount(before * 2)
        const [cancelChooser] = await Promise.all([page.waitForEvent('filechooser'), editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click()])
        await cancelChooser.setFiles({ name: '取消模拟BOM明细.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture({ grouped: true }) })
        await detailPicker.getByRole('button', { name: '取消', exact: true }).click()
        await expectLocator(editor.locator('[data-bom-part-index]')).toHaveCount(before * 2)
      },
    },
    {
      ...base,
name: 'import-filter-purchase-materials',
path: '/erp/purchase/accessories',
      verify: async (page) => {
        const requests = []
        page.on('request', (request) => { if (request.url().includes('/rpc/masterdata') && request.method() === 'POST') { const body = request.postDataJSON(); if (body.method === 'list_materials') requests.push(body.params) } })
        await page.getByRole('button', { name: /新建采购订单$/u }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.locator('.ant-select').filter({ has: page.locator('input[id$="supplier_id"]') }).locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
        const invoiceRequired = editor.locator('.ant-select').filter({ has: page.locator('input[id$="invoice_required"]') })
        const invoiceCategory = editor.locator('.ant-select').filter({ has: page.locator('input[id$="invoice_category"]') })
        assert.equal(await invoiceCategory.locator('.ant-select-selection-placeholder').innerText(), '请先选择需要发票')
        await invoiceRequired.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^需要发票$/u }).click()
        await expectLocator(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
        assert.equal(await invoiceCategory.locator('.ant-select-selection-placeholder').innerText(), '选择发票类别')
        await invoiceCategory.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '出口普通发票' }).click()
        await expectLocator(page.locator('.ant-select-dropdown:visible')).toHaveCount(0)
        await invoiceRequired.locator('.ant-select-clear').click()
        assert.equal(await invoiceCategory.getByRole('combobox').isDisabled(), true)
        assert.equal(await invoiceCategory.locator('.ant-select-selection-item').count(), 0)
        assert.equal(await invoiceCategory.locator('.ant-select-selection-placeholder').innerText(), '请先选择需要发票')
        await editor.getByRole('button', { name: '从材料库添加', exact: true }).click()
        const picker = page.locator('.erp-source-import-picker-modal.ant-modal:visible')
        await picker.locator('.ant-table-row').first().waitFor()
        await assertImportPickerGeometry(page, picker, 'purchase-material-filter')
        const layout = await readImportPickerLayout(picker)
        await assertImportFilterPrompt(page, picker, '库存分类', '按库存分类筛选')
        await picker.locator('.ant-table-row input[type="checkbox"]').first().check()
        await assertImportPickerStableDuring(picker, 'purchase-material-empty-category', async () => {
          await choose(page, picker, '库存分类', '辅料')
          await picker.getByText('没有符合条件的可选资料', { exact: true }).waitFor()
        })
        await assertImportPickerStableLayout(picker, layout, 'purchase-material-filtered')
        await assertImportToolbarLayout(page, picker, 'purchase-material-empty-category')
        assert.equal(requests.at(-1).stock_category, 'AUXILIARY')
        assert.equal(requests.at(-1).purchase_supplier_id, 1)
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).check()
        assert.equal(await picker.locator('.ant-table-row').count(), 1)
        await assertImportPickerStableLayout(picker, layout, 'purchase-material-one-selected')
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        await picker.locator('.ant-table-row').first().waitFor()
        assert.match(await picker.innerText(), /已选 1 条/u)
        await assertImportFilterPrompt(page, picker, '库存分类', '按库存分类筛选')
        assert.equal(requests.at(-1).stock_category, undefined)
        await assertImportPickerStableLayout(picker, layout, 'purchase-material-cleared')
        await capture(page, 'purchase-material-import')
        await picker.getByRole('button', { name: '添加到采购明细', exact: true }).click()
        await editor.getByRole('button', { name: '撤销本次导入', exact: true }).waitFor()
      },
    },
    {
      ...base,
      name: 'import-selection-purchase-materials',
      path: '/erp/purchase/accessories',
      verify: async (page) => {
        const requests = []
        const materials = Array.from({ length: 251 }, (_, index) => ({
          id: index + 1, code: `MAT-SELECT-${index + 1}`,
          name: `批量选择材料${index + 1}——用于核对超长名称、跨页与分类范围`,
          default_unit_id: 1, is_active: true, stock_category: index < 151 ? 'MAIN' : 'AUXILIARY',
          category: index < 151 ? '面料' : '洗水标', spec: '60 英寸', color: '米白',
        }))
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method !== 'list_materials') return route.fallback()
          const params = body.params
          requests.push(params)
          const filtered = materials.filter((row) => (!params.stock_category || row.stock_category === params.stock_category) &&
            (!params.keyword || `${row.code} ${row.name}`.includes(params.keyword)))
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify({
            jsonrpc: '2.0', id: body.id,
            result: styleRpcResult(stylePaginatedRpcData(filtered, 'materials', params, 50)),
          }) })
        })
        await page.getByRole('button', { name: /新建采购订单$/u }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.locator('.ant-select').filter({ has: page.locator('input[id$="supplier_id"]') }).locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
        await editor.getByRole('button', { name: '从材料库添加', exact: true }).click()
        const picker = page.getByRole('dialog').filter({ hasText: '从材料库添加' })
        const count = picker.locator('.erp-source-import-picker__selection-items > .ant-typography')
        const confirm = picker.getByRole('button', { name: '添加到采购明细', exact: true })
        await expectLocator(picker.locator('.ant-table-row')).toHaveCount(50)
        await assertImportPickerGeometry(page, picker, 'purchase-material-bulk')
        await picker.locator('.ant-table-row input').first().check()
        await choose(page, picker, '库存分类', '辅料')
        await expectLocator(picker.locator('.ant-table-row').first()).toContainText('MAT-SELECT-152')
        await picker.getByRole('checkbox', { name: '全选本页', exact: true }).check()
        await expectLocator(count).toContainText('已选 51 条')
        await picker.getByRole('button', { name: '全选筛选结果（100 条）', exact: true }).click()
        await expectLocator(count).toContainText('已选 101 条')
        await expectLocator(confirm).toContainText('（101 条）')
        const bulkRead = requests.findLast((params) => params.limit === 200)
        assert.equal(bulkRead.stock_category, 'AUXILIARY')
        assert.equal(bulkRead.purchase_supplier_id, 1)
        await choose(page, picker, '库存分类', '主料')
        await expectLocator(picker.locator('.ant-table-row').first()).toContainText('MAT-SELECT-1')
        await expectLocator(count).toContainText('已选 101 条')
        await picker.getByRole('button', { name: '全选筛选结果（151 条）', exact: true }).click()
        await expectLocator(count).toContainText('已选 251 条')
        for (const width of [1440, 736, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await waitForFiniteAnimations(page)
          await assertImportToolbarLayout(page, picker, `purchase-material-bulk-selected-${width}`)
        }
        await page.setViewportSize(base.viewport)
        await capture(page, 'purchase-material-bulk-selection')
        await picker.getByRole('checkbox', { name: '全选本页', exact: true }).uncheck()
        await expectLocator(count).toContainText('已选 201 条')
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).check()
        assert.equal(await picker.getByRole('button', { name: /全选筛选结果/u }).count(), 0)
        await picker.getByRole('button', { name: '清空已选', exact: true }).click()
        await expectLocator(count).toContainText('已选 0 条')
        await expectLocator(confirm).toBeDisabled()
        await picker.getByRole('checkbox', { name: '仅看已选', exact: true }).uncheck()
        const search = picker.getByRole('textbox', { name: /可搜索：材料编码/u })
        await search.fill('MAT-SELECT-251'); await search.press('Enter')
        await expectLocator(picker.locator('.ant-table-row')).toHaveCount(0)
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        await expectLocator(picker.locator('.ant-table-row')).toHaveCount(50)
        await picker.getByRole('button', { name: '全选筛选结果（251 条）', exact: true }).click()
        await expectLocator(count).toContainText('已选 251 条')
        assert.deepEqual(requests.filter((params) => params.limit === 200 && !params.stock_category).map((params) => params.offset), [0, 200])
        await confirm.click()
        await expectLocator(editor.locator('.erp-sales-order-lines-form__row')).toHaveCount(251)
      },
    },
    {
      name: 'import-selection-purchase-design',
      path: '/__style-fixtures/purchase-import-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        const source = prepareUIDesignSandboxSource(await readFile(new URL('../../../docs/product/ui-design/index.html', import.meta.url), 'utf8'))
        await page.route('**/__style-fixtures/purchase-import-design', (route) => route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><head><style>html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto minmax(0,1fr)}h1{margin:0;font:14px system-ui}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><h1>采购导入原型验证</h1><iframe title="采购导入原型" sandbox="allow-scripts" srcdoc="${source.replaceAll('&', '&amp;').replaceAll('"', '&quot;')}"></iframe></body></html>`,
        }))
      },
      verify: async (page) => {
        const design = page.frameLocator('iframe[title="采购导入原型"]')
        await design.getByRole('button', { name: '采购管理', exact: true }).click()
        await design.locator('[data-action="new-record"]').click()
        const form = design.locator('.form-view')
        const importButton = form.locator('[data-action="purchase-import"]')
        const picker = design.getByRole('dialog', { name: '从材料库添加', exact: true })
        await importButton.click()
        await design.getByText('请先选择供应商', { exact: true }).waitFor()
        await expectLocator(picker).toHaveCount(0)
        await chooseSelectOption(form.locator('[data-form-field="party"]'), { index: 0 })
        const note = form.locator('[data-form-field="remark"]')
        await note.fill('采购原型核对，导入与取消均保留')
        const lineRows = form.locator('.line-items tbody[data-form-row], .line-items tbody:not([data-form-row]) > tr')
        const before = await lineRows.count()
        await importButton.click()
        const count = picker.locator('#purchase-import-selected-count')
        const confirm = picker.getByRole('button', { name: '添加到采购明细', exact: true })
        const header = picker.getByRole('checkbox', { name: '全选本页', exact: true })
        const rowChecks = picker.locator('tbody input[type="checkbox"]')
        await expectLocator(count).toHaveText('已选 2 条')
        await picker.getByRole('button', { name: '清空已选', exact: true }).click()
        await expectLocator(count).toHaveText('已选 0 条')
        await expectLocator(confirm).toBeDisabled()
        await expectLocator(rowChecks).toHaveCount(5)
        await rowChecks.first().check()
        assert.equal(await header.evaluate((node) => node.indeterminate), true)
        await header.check()
        await expectLocator(count).toHaveText('已选 5 条')
        await picker.getByRole('button', { name: '下一页', exact: true }).click()
        await expectLocator(rowChecks).toHaveCount(3)
        await header.check()
        await expectLocator(count).toHaveText('已选 8 条')
        await picker.getByRole('button', { name: '上一页', exact: true }).click()
        await header.uncheck()
        await expectLocator(count).toHaveText('已选 3 条')
        await picker.getByRole('button', { name: '全选筛选结果（8 条）', exact: true }).click()
        await expectLocator(count).toHaveText('已选 8 条')
        await expectLocator(picker.getByRole('button', { name: '全选筛选结果（8 条）', exact: true })).toBeDisabled()
        await picker.getByRole('button', { name: '清空已选', exact: true }).click()
        const filter = picker.locator('[data-import-review-filter]')
        await chooseSelectOption(filter, { label: '辅料' })
        await expectLocator(rowChecks).toHaveCount(2)
        await expectLocator(picker.getByRole('button', { name: /全选筛选结果/u })).toHaveCount(0)
        await header.check()
        await chooseSelectOption(filter, { label: '主料' })
        await expectLocator(count).toHaveText('已选 2 条')
        await picker.getByRole('button', { name: '全选筛选结果（6 条）', exact: true }).click()
        await expectLocator(count).toHaveText('已选 8 条')
        await expectLocator(confirm).toContainText('（8 条）')
        assert.equal(await confirm.getAttribute('aria-describedby'), 'purchase-import-selected-count')
        const search = picker.getByRole('searchbox', { name: '搜索导入记录', exact: true })
        await search.fill('不存在的材料'); await search.press('Enter')
        await expectLocator(rowChecks).toHaveCount(0)
        await expectLocator(header).toBeDisabled()
        await expectLocator(count).toHaveText('已选 8 条')
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        await search.fill('短毛绒'); await search.press('Enter')
        await expectLocator(rowChecks).toHaveCount(1)
        const onlySelected = picker.getByRole('checkbox', { name: '仅看已选', exact: true })
        await onlySelected.check()
        await expectLocator(rowChecks).toHaveCount(5)
        await expectLocator(picker.getByRole('button', { name: /全选筛选结果/u })).toHaveCount(0)
        await onlySelected.uncheck()
        await expectLocator(rowChecks).toHaveCount(1)
        assert.equal(await search.inputValue(), '短毛绒')
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        for (const width of [1920, 1024, 390]) {
          await page.setViewportSize({ width, height: 600 })
          await waitForFiniteAnimations(page)
          const layout = await picker.evaluate((node) => {
            const box = node.getBoundingClientRect()
            const selectors = ['.import-review-toolbar', '.import-review-selection', '.import-review-selection-actions', '.import-review-selection-summary', '.modal-foot']
            return { left: box.left, right: box.right, viewport: innerWidth, overflow: selectors.filter((selector) => { const element = node.querySelector(selector); return element.scrollWidth > element.clientWidth + 1 }) }
          })
          assert.ok(layout.left >= 0 && layout.right <= layout.viewport + 1)
          assert.deepEqual(layout.overflow, [], `采购选择布局 ${width}`)
          await picker.locator('.modal-body').hover()
          await page.mouse.wheel(0, 900)
          await expectLocator(confirm).toBeVisible()
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${outputDir}/purchase-import-prototype-4k.png` })
        await picker.getByRole('button', { name: '取消', exact: true }).click()
        await expectLocator(lineRows).toHaveCount(before)
        assert.equal(await note.inputValue(), '采购原型核对，导入与取消均保留')
        await importButton.click()
        await expectLocator(count).toHaveText('已选 2 条')
        await picker.getByRole('button', { name: '全选筛选结果（8 条）', exact: true }).click()
        await confirm.click()
        await expectLocator(picker).toHaveCount(0)
        await expectLocator(lineRows).toHaveCount(before + 8)
        const materials = await form.locator('ui-select[data-form-field^="item-"]').evaluateAll((nodes) => nodes.slice(-8).map((node) => node.value))
        assert.equal(new Set(materials).size, 8)
        assert.equal(materials.includes('洗水标'), true)
        assert.equal(materials.includes('颗粒绒 / 奶油色'), true)
        assert.equal(await note.inputValue(), '采购原型核对，导入与取消均保留')
      },
    },
    {
      name: 'import-toolbar-design-preview',
      path: '/__style-fixtures/import-toolbar-design',
      viewport: base.viewport,
      beforeNavigate: async (page) => {
        const source = prepareUIDesignSandboxSource(await readFile(new URL('../../../docs/product/ui-design/index.html', import.meta.url), 'utf8'))
        const srcdoc = source.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
        await page.route('**/__style-fixtures/import-toolbar-design', (route) => route.fulfill({
          contentType: 'text/html; charset=utf-8',
          body: `<!doctype html><html><head><style>html,body{height:100%;margin:0}body{display:grid;grid-template-rows:auto minmax(0,1fr)}h1{margin:0;font:14px system-ui}iframe{width:100%;height:100%;border:0;display:block}</style></head><body><h1>导入工具栏设计验证</h1><iframe title="导入工具栏设计" sandbox="allow-scripts" srcdoc="${srcdoc}"></iframe></body></html>`,
        }))
      },
      verify: async (page) => {
        for (const [kind, menu] of [['bom', '产品工程'], ['purchase', '采购管理'], ['shipment', '出货管理']]) {
          if (kind !== 'bom') await page.reload()
          const frame = page.frameLocator('iframe')
          await frame.getByRole('button', { name: menu, exact: true }).click()
          if (kind === 'bom') {
            await frame.getByLabel('更多新建方式', { exact: true }).click()
            await frame.locator('[data-action="bom-import-new"]').click()
          } else {
            await frame.locator('[data-action="new-record"]').click()
            if (kind === 'purchase') await chooseSelectOption(frame.locator('[data-form-field="party"]'), { index: 0 })
            await frame.locator(`[data-action="${kind}-import"]`).click()
          }
          const dialog = frame.locator('.overlay .modal:visible').last()
          const before = await dialog.locator('tbody tr').count()
          assert.ok(before > 0)
          if (kind === 'purchase') {
            const pageSelection = dialog.getByRole('checkbox', { name: '全选本页', exact: true })
            await pageSelection.check()
            await pageSelection.uncheck()
            assert.equal(await dialog.locator('.import-review-selection-summary').innerText(), '已选 0 条')
            await pageSelection.check()
            assert.match(await dialog.locator('.import-review-selection-summary').innerText(), /已选 5 条/u)
          }
          if (kind === 'shipment') {
            await dialog.getByRole('button', { name: '查看不可导入原因', exact: true }).click()
            assert.equal(await dialog.locator('tbody tr').count(), 1)
            await dialog.getByRole('button', { name: '返回可导入明细', exact: true }).click()
            assert.equal(await dialog.locator('tbody tr').count(), before)
          } else {
            const prompt = kind === 'purchase' ? '按库存分类筛选' : '筛选待处理项'
            assert.equal(await dialog.locator('[data-import-review-filter] .design-select-value').innerText(), prompt)
          }
          for (const width of [1440, 390]) {
            await page.setViewportSize({ width, height: 900 })
            const metrics = await dialog.locator('.import-review-toolbar').evaluate((node) => {
              const rect = (item) => {
                const box = item.getBoundingClientRect()
                return { left: box.left, right: box.right, top: box.top }
              }
              return { bar: rect(node), controls: [...node.querySelectorAll(':scope > .control, .import-review-search-actions > .search, .import-review-search-actions > button')].map(rect), overflow: node.scrollWidth > node.clientWidth + 1 }
            })
            assert.equal(metrics.overflow, false, `${kind} design toolbar must be contained`)
            assert.ok(metrics.controls.every((control) => control.left >= metrics.bar.left - 1 && control.right <= metrics.bar.right + 1), `${kind} design toolbar controls: ${JSON.stringify(metrics)}`)
            if (width === 1440) assert.ok(metrics.controls.every((control) => Math.abs(control.top - metrics.controls[0].top) <= 1), `${kind} design toolbar must fit one row`)
          }
          const search = dialog.getByRole('searchbox', { name: '搜索导入记录', exact: true })
          await search.fill('不存在的模拟来源')
          if (kind === 'purchase') await dialog.getByRole('button', { name: '搜索', exact: true }).click()
          else await search.press('Enter')
          assert.equal(await dialog.locator('tbody tr').count(), 0)
          await dialog.getByRole('button', { name: '清空筛选', exact: true }).click()
          assert.equal(await dialog.locator('tbody tr').count(), before)
          assert.equal(await search.inputValue(), '')
          await page.setViewportSize(base.viewport)
        }
      },
    },
  ]
}
