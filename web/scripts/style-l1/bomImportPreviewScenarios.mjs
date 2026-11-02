import { expect } from 'playwright/test'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { assertImportPickerGeometry } from './importPickerAssertions.mjs'

export function createBOMImportPreviewScenarios(deps) {
  return [
    { name: 'bom-import-preview-material-details', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, detailsOnly: true },
    { name: 'bom-import-preview-desktop', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { name: 'bom-import-preview-short-desktop', viewport: { width: 1366, height: 768 } },
  ].map((scenario) => ({
    ...scenario,
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    verify: async (page) => {
      const { assert } = deps
      await deps.expectHeading(page, '物料清单（BOM）')
      let chooser
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      if (scenario.detailsOnly) {
        await page.getByRole('button', { name: /新建 BOM$/u }).click()
        await expect(editor.getByRole('button', { name: '从 Excel 导入', exact: true })).toBeEnabled()
        await editor.getByLabel('订单数量', { exact: true }).fill('1224')
        ;[chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click(),
        ])
      } else {
        await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
        ;[chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          page.getByRole('menuitem', { name: /从 Excel 新建/u }).click(),
        ])
      }
      await chooser.setFiles({
        name: 'BOM-PREVIEW-17.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: createBOMImportWorkbookFixture({ additionalParts: 15, additionalColumns: 5 }),
      })
      const modal = page.getByRole('dialog', { name: scenario.detailsOnly ? '导入材料明细' : '从 Excel 新建 BOM', exact: true })
      if (scenario.detailsOnly) await expect(modal.getByText(/保留当前订单数量 1224/u)).toBeVisible()
      const rows = modal.locator('.ant-table-tbody > tr[data-row-key]')
      const toolbar = modal.getByRole('group', { name: '导入筛选与搜索', exact: true })
      const left = toolbar.getByRole('button', { name: '向左查看列', exact: true })
      const right = toolbar.getByRole('button', { name: '向右查看列', exact: true })
      await expect(rows).toHaveCount(10)
      await expect(right).toBeVisible()
      await assertBusinessModalViewport(page, modal, {
        label: scenario.name,
        scrollable: scenario.viewport.height < 800,
      })
      assert.equal(await modal.locator('.app-table-scroll-top').count(), 0, '滚动按钮不再单独占一行')
      const geometry = await modal.evaluate((node) => {
        const box = (selector) => node.querySelector(selector).getBoundingClientRect().toJSON()
        return {
          content: box('.ant-modal-content'),
          footer: box('.ant-modal-footer'),
          toolbar: box('.erp-source-import-picker__toolbar'),
          clear: box('.erp-source-import-picker__clear-filter'),
          buttons: box('.app-table-scroll-buttons'),
          viewport: innerHeight,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
        }
      })
      assert.ok(geometry.content.height >= geometry.viewport * 0.85, JSON.stringify(geometry))
      assert.ok(geometry.content.height <= geometry.viewport * 0.91, JSON.stringify(geometry))
      assert.ok(geometry.content.y >= 0 && geometry.footer.bottom <= geometry.viewport, '弹窗及确认操作完整位于视口内')
      assert.ok(Math.abs(geometry.buttons.right - geometry.toolbar.right) <= 1, '滚动按钮位于筛选行最右侧')
      assert.ok(geometry.buttons.left >= geometry.clear.right, '滚动按钮不挤占清空筛选')
      assert.ok(Math.abs(geometry.buttons.y + geometry.buttons.height / 2 - geometry.clear.y - geometry.clear.height / 2) <= 1, '滚动按钮与筛选控件垂直居中')
      assert.ok(geometry.pageOverflow <= 1, '横向滚动限制在表格内部')
      await page.screenshot({ path: `${deps.outputDir}/${scenario.name}-modal.png`, fullPage: false })

      const scroller = modal.locator('.ant-table-content')
      await expect(left).toBeDisabled()
      await right.click()
      await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(1)
      await expect(left).toBeEnabled()
      await left.press('Enter')
      await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBeLessThanOrEqual(1)
      await modal.getByRole('button', { name: '下一页', exact: true }).click()
      await expect(rows).toHaveCount(7)
      await expect(modal.getByRole('button', { name: '带入并核对', exact: true })).toHaveText('带入并核对（17 个部位）')

      const search = modal.getByRole('textbox', { name: '搜索 BOM 导入明细', exact: true })
      await search.fill('预览部位17')
      await search.press('Enter')
      await expect(rows).toHaveCount(1)
      await search.fill('不存在的部位')
      await search.press('Enter')
      await expect(rows).toHaveCount(0)
      await expect(modal.getByText('没有符合条件的部位', { exact: true })).toBeVisible()
      await expect(right).toBeVisible()
      await toolbar.getByRole('button', { name: '清空筛选', exact: true }).click()
      await expect(rows).toHaveCount(10)
      if (scenario.name === 'bom-import-preview-desktop') {
        await assertImportPickerGeometry(page, modal, scenario.name)
      }
      await modal.getByRole('button', { name: '取消', exact: true }).click()
      await expect(modal).toBeHidden()
      if (scenario.detailsOnly) {
        await expect(editor.getByLabel('订单数量', { exact: true })).toHaveValue('1224')
      } else {
        await expect(page.getByRole('button', { name: '更多新建方式', exact: true })).toBeEnabled()
      }
    },
  }))
}
