import assert from 'node:assert/strict'
import { createBusinessFormPagesScenarios } from './businessFormPagesScenarios.mjs'
import { assertEditorTableHeadersCentered } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { clickLineItemAction, revealLineItemDetails } from './lineEditorActions.mjs'

export function createPurchaseLineDetailsScenarios(deps) {
  const base = createBusinessFormPagesScenarios(deps).find((scenario) => scenario.name === 'business-form-page-purchase-desktop')
  const scenarios = [
    ['desktop', { width: 1920, height: 1080 }, 'light', 2],
    ['dark', { width: 1440, height: 900 }, 'dark', 1],
    ['narrow', { width: 390, height: 844 }, 'light', 1],
  ].map(([variant, viewport, themeMode, deviceScaleFactor]) => ({
    ...base,
    name: `purchase-line-details-${variant}`,
    viewport,
    themeMode,
    deviceScaleFactor,
    verify: async (page) => {
      const writes = []
      page.on('request', (entry) => {
        if (entry.method() !== 'POST' || !entry.url().includes('/rpc/purchase_order')) return
        const body = entry.postDataJSON()
        if (body?.method === 'save_purchase_order_with_items') writes.push(body.params)
      })
      await page.getByRole('button', { name: '新建采购订单' }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('heading', { name: '新建采购订单', exact: true }).waitFor()
      const choose = async (field) => {
        await field.click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option:not(.ant-select-item-option-disabled)').first().click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
      }
      await choose(editor.locator('#supplier_id'))
      await editor.locator('#payment_term_days').fill('0')
      const rows = editor.locator('.erp-sales-order-lines-form__row, .erp-task-line-card')
      const first = rows.first()
      await choose(first.locator('input[id$="_material_id"]'))
      await first.getByLabel('采购数量', { exact: true }).fill('12')
      const unitPrice = first.getByLabel('单价', { exact: true })
      const amount = first.getByLabel('金额', { exact: true })
      const amountTotal = editor.locator('.erp-line-items-form__stat').filter({ hasText: '金额合计' })
      await unitPrice.fill('1.25')
      assert.equal(await amount.getAttribute('readonly'), '')
      await unitPrice.fill('')
      assert.equal(await amount.inputValue(), '')
      assert.match(await amountTotal.innerText(), /待补齐/u)
      await unitPrice.fill('0')
      assert.match(await amountTotal.innerText(), /0\.00/u)
      await unitPrice.fill('1.25')
      await revealLineItemDetails(first)
      await first.getByLabel('下单材料名称', { exact: true }).fill('本单确认的长材料名称，供采购和打印核对')
      await first.getByLabel('下单颜色', { exact: true }).fill('米白（按确认色样）')
      await first.getByLabel('产品订单编号', { exact: true }).fill('SO-LINE-DETAILS')
      const note = first.getByLabel('备注', { exact: true })
      await note.fill('收起资料以后仍须保留本条草稿。')
      const noteNode = await note.elementHandle()
      if (variant !== 'narrow') {
        await first.getByRole('button', { name: '收起第 1 行下单资料', exact: true }).click()
        assert.equal(await first.locator('.erp-line-item-table__details-row').isVisible(), false)
      }
      assert.equal(await note.inputValue(), '收起资料以后仍须保留本条草稿。')
      assert.equal(await noteNode.evaluate((node) => node.isConnected), true)
      assert.match(await first.locator('.erp-purchase-line-summary').innerText(), /本单确认的长材料名称.*米白/su)

      await clickLineItemAction(first, '复制第 1 行')
      assert.equal(await rows.count(), 2)
      assert.equal(await rows.nth(1).getByLabel('采购数量', { exact: true }).inputValue(), '12')
      if (variant !== 'narrow') assert.equal(await rows.nth(1).locator('.erp-line-item-table__details-row').isVisible(), false)
      await rows.nth(1).getByLabel('采购数量', { exact: true }).fill('0')
      await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
      await rows.nth(1).locator('.ant-form-item-has-error').first().waitFor()
      if (variant !== 'narrow') {
        await rows.nth(1).getByRole('button', { name: '收起第 2 行下单资料', exact: true }).waitFor()
        assert.equal(await rows.nth(1).locator('.erp-line-item-table__details-row').isVisible(), true, '错误行和资料在保存失败后可定位')
        await rows.nth(1).getByRole('button', { name: '收起第 2 行下单资料', exact: true }).click()
      } else {
        assert.equal(await rows.nth(1).getByLabel('下单材料名称', { exact: true }).isVisible(), true, '窄屏直接展示完整资料')
      }
      await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
      if (variant !== 'narrow') await rows.nth(1).getByRole('button', { name: '收起第 2 行下单资料', exact: true }).waitFor()
      assert.equal(writes.length, 0, '相同错误重复保存仍不写入')
      await rows.nth(1).getByLabel('采购数量', { exact: true }).fill('5')
      if (variant !== 'narrow') await rows.nth(1).getByRole('button', { name: '收起第 2 行下单资料', exact: true }).click()

      await editor.getByRole('button', { name: '添加采购明细', exact: true }).click()
      assert.equal(await rows.count(), 3)
      await clickLineItemAction(rows.nth(2), /移除行/u)
      assert.equal(await rows.count(), 2)
      await assertEditorTableHeadersCentered(editor)
      const quantityUnit = first.locator('.erp-purchase-line-quantity')
      assert.equal(await quantityUnit.getByLabel('采购数量', { exact: true }).count(), 1)
      assert.equal(await quantityUnit.locator('input[id$="_unit_id"]').count(), 1)
      if (variant !== 'narrow') {
        await editor.getByRole('button', { name: '查看金额说明', exact: true }).click()
        await page.locator('.erp-business-inline-help-popover:visible').waitFor()
        await editor.getByRole('button', { name: '查看金额说明', exact: true }).press('Escape')
        await page.locator('.erp-business-inline-help-popover:visible').waitFor({ state: 'hidden' })
      }
      await revealLineItemDetails(first)
      await waitForFiniteAnimations(page)
      const geometry = await editor.evaluate((root) => ({
        pageOverflow: root.scrollWidth - root.clientWidth,
        bodyOverflow: root.querySelector('.erp-business-form-page__body').scrollWidth - root.querySelector('.erp-business-form-page__body').clientWidth,
        mainRows: [...root.querySelectorAll('.erp-line-item-table__main-row, .erp-task-line-card')].filter((node) => node.getClientRects().length).length,
        quantityColumns: [...root.querySelectorAll('.erp-purchase-line-quantity')].map((node) => ({ width: node.clientWidth, scrollWidth: node.scrollWidth })),
      }))
      assert.ok(geometry.pageOverflow <= 1 && geometry.bodyOverflow <= 1, JSON.stringify(geometry))
      assert.equal(geometry.mainRows, 2, '采购主行无需逐条展开后录入')
      assert.ok(geometry.quantityColumns.every((column) => column.scrollWidth <= column.width + 1), JSON.stringify(geometry))
      console.log(`[style:l1] purchase-line-details=${JSON.stringify({ variant, ...geometry })}`)
      await page.screenshot({ path: `${deps.outputDir}/purchase-line-details-${variant}-editor.png` })
      await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      assert.equal(writes.length, 1, '错误校验不写入，最终保存只发送一次完整采购请求')
      const [params] = writes
      assert.equal(params.items.length, 2)
      assert.equal(params.items[0].material_name_snapshot, '本单确认的长材料名称，供采购和打印核对')
      assert.equal(params.items[0].color_snapshot, '米白（按确认色样）')
      assert.equal(params.items[0].product_order_no_snapshot, 'SO-LINE-DETAILS')
      assert.equal(params.items[0].note, '收起资料以后仍须保留本条草稿。')
      assert.equal(Object.hasOwn(params.items[0], 'detailsOpen'), false)
      await noteNode.dispose()
    },
  }))
  return [...scenarios, {
    name: 'purchase-line-details-formal-design',
    path: '/__dev/ui-design',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('button', { name: /全屏预览/u }).click()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.locator('.nav-item[data-page="purchase"]').click()
      await frame.locator('[data-action="new-record"]').click()
      const editor = frame.locator('.form-view')
      const rows = editor.locator('tbody[data-form-row]')
      if (!(await rows.count())) await editor.getByRole('button', { name: '添加采购明细', exact: true }).click()
      await rows.first().waitFor()
      const first = rows.first()
      assert.deepEqual(await editor.locator('.document-line-table thead th').allTextContents(), ['序号', '材料名称', '采购数量 / 单位', '单价', '金额', '预计到货'])
      const name = first.getByLabel('下单材料名称 1', { exact: true })
      const node = await name.elementHandle()
      await first.locator('[data-action="line-details"]').click()
      await name.fill('正式设计稿的本单材料名称')
      await first.locator('[data-action="line-details"]').click()
      assert.equal(await first.locator('.document-line-more').isVisible(), false)
      assert.equal(await name.inputValue(), '正式设计稿的本单材料名称')
      assert.equal(await node.evaluate((element) => element.isConnected), true)
      assert.match(await first.locator('[data-purchase-summary]').innerText(), /正式设计稿的本单材料名称/u)
      await first.locator('[data-action="line-details"]').click()
      assert.equal(await first.locator('.document-line-more').isVisible(), true)
      const count = await rows.count()
      await first.locator('td').first().click()
      await editor.locator('.line-editor-toolbar').getByRole('button', { name: /^复制/u }).click()
      assert.equal(await rows.count(), count + 1)
      assert.equal(await rows.nth(1).getByLabel('下单材料名称 2', { exact: true }).inputValue(), '正式设计稿的本单材料名称')
      await page.screenshot({ path: `${deps.outputDir}/purchase-line-details-formal-design.png` })
      await node.dispose()
    },
  }]
}
