import { expect as expectLocator } from 'playwright/test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { prepareUIDesignSandboxSource } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { createSalesOrderWorkbook } from './salesOrderImportWorkbookFixture.mjs'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'
import { assertImportPickerGeometry, assertImportToolbarLayout, assertImportFilterPrompt, readImportPickerLayout, assertImportPickerStableLayout, assertImportPickerStableDuring } from './importPickerAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

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
        await picker.getByRole('button', { name: '全选筛选结果', exact: true }).click()
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
        await picker.getByText('暂无可导入记录', { exact: true }).waitFor()
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
name: 'import-filter-bom-excel',
path: '/erp/purchase/material-bom',
      verify: async (page) => {
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /从 Excel 新建/u }).click()])
        await chooser.setFiles({ name: '筛选模拟BOM.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture({ grouped: true, unmatchedProduct: true }) })
        const picker = page.getByRole('dialog', { name: '从 Excel 新建 BOM', exact: true })
        await picker.locator('.ant-table-row').first().waitFor()
        await assertImportPickerGeometry(page, picker, 'bom-excel-filter')
        await assertImportFilterPrompt(page, picker, 'BOM 核对筛选', '按核对结果筛选', ['全部部位'])
        const before = await picker.locator('.ant-table-row').count()
        await choose(page, picker, 'BOM 核对筛选', '待选择材料')
        assert.ok(await picker.locator('.ant-table-row').count() < before)
        await picker.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: 'BOM 核对筛选', exact: true }) }).locator('.ant-select-clear').click()
        assert.equal(await picker.locator('.ant-table-row').count(), before)
        await assertImportFilterPrompt(page, picker, 'BOM 核对筛选', '按核对结果筛选', ['全部部位'])
        await choose(page, picker, 'BOM 核对筛选', '待选择材料')
        assert.match(await picker.getByRole('status').innerText(), /确认后带入全部/u)
        const search = picker.getByRole('textbox', { name: '搜索 BOM 导入明细', exact: true })
        await search.fill('不存在的材料'); await search.press('Enter')
        assert.equal(await picker.locator('.ant-table-row').count(), 0)
        await assertImportToolbarLayout(page, picker, 'bom-excel-empty-search')
        await picker.getByRole('button', { name: '清空筛选', exact: true }).click()
        assert.equal(await picker.locator('.ant-table-row').count(), before)
        await capture(page, 'bom-excel-import')
        await picker.getByRole('button', { name: '带入并核对', exact: true }).click()
        await page.locator('.erp-bom-import-review').waitFor()
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
          await picker.getByText('暂无可选材料', { exact: true }).waitFor()
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
        await picker.waitFor({ state: 'hidden' })
        assert.match(await editor.innerText(), /样式材料/u)
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
        for (const [kind, menu] of [['bom', '产品工程'], ['shipment', '出货管理']]) {
          if (kind !== 'bom') await page.reload()
          const frame = page.frameLocator('iframe')
          await frame.getByRole('button', { name: menu, exact: true }).click()
          if (kind === 'bom') {
            await frame.getByLabel('更多新建方式', { exact: true }).click()
            await frame.locator('[data-action="bom-import-new"]').click()
          } else {
            await frame.locator('[data-action="new-record"]').click()
            await frame.locator(`[data-action="${kind}-import"]`).click()
          }
          const dialog = frame.locator('.overlay .modal:visible').last()
          const before = await dialog.locator('tbody tr').count()
          assert.ok(before > 0)
          const label = kind === 'purchase' ? '库存分类' : kind === 'bom' ? '核对结果' : '可导入状态'
          assert.equal(await dialog.locator('[data-import-review-filter] .design-select-value').innerText(), `按${label}筛选`)
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
          await search.press('Enter')
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
