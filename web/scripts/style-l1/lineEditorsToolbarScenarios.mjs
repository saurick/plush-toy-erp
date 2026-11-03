import assert from 'node:assert/strict'
import { createBusinessFormPagesScenarios } from './businessFormPagesScenarios.mjs'
import { assertEditorTableHeadersCentered } from './businessFormPageAssertions.mjs'
import { clickLineItemAction, revealLineItemDetails, selectLineItem } from './lineEditorActions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const editors = [
  ['sales', '新建订单', '新建销售订单', '添加订货明细', '.erp-sales-order-lines-form__row', '订单数量'],
  ['purchase', '新建采购订单', '新建采购订单', '添加采购明细', '.erp-sales-order-lines-form__row', '采购数量'],
  ['outsourcing', '新建加工合同', '新建加工合同', '添加加工明细', '.erp-sales-order-lines-form__row', '加工数量'],
  ['shipment', '新建出货单', '新建出货单', '添加出货明细', '.erp-sales-order-lines-form__row', '数量'],
  ['production', '新建生产订单', '新建生产订单', '添加生产明细', '.erp-compact-field-table__row', '计划数量'],
  ['customers', '新建客户', '新建客户档案', '添加联系人', '.erp-master-contact-list__row', '联系人'],
  ['suppliers', '新建供应商', '新建供应商或加工厂', '添加联系人', '.erp-master-contact-list__row', '联系人'],
  ['quality', '补建来料质检', '生成来料质检草稿', '添加检查项', '.erp-compact-field-table__row', '检查项目 1'],
]

export function createLineEditorsToolbarScenarios(deps) {
  const bases = createBusinessFormPagesScenarios(deps)
  const scenarios = editors.map(([key, trigger, title, add, rowSelector, fieldLabel]) => ({
    ...bases.find((item) => item.name === `business-form-page-${key}-desktop`),
    name: `line-editor-toolbar-${key}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      if (key === 'quality') {
        const record = page.getByRole('row').filter({ has: page.getByText('QI-STYLE-L1', { exact: true }) })
        await record.getByRole('radio').check()
        await page.getByRole('button', { name: '判定合格' }).click()
      } else await page.getByRole('button', { name: trigger }).click()
      const editor = key === 'quality' ? page.locator('.ant-modal:visible').filter({ hasText: '判定合格' }).last() : page.locator('.erp-business-form-page:not([hidden])')
      if (key === 'quality') await editor.waitFor()
      else await editor.getByRole('heading', { name: title, exact: true }).waitFor()
      const rows = editor.locator(rowSelector)
      while (await rows.count() < 2) await editor.getByRole('button', { name: add, exact: true }).click()
      const first = rows.first()
      const scope = first.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " erp-line-editor ")][1]')
      await page.waitForFunction((node) => node.dataset.lineEditorCompact === 'false', await scope.elementHandle())
      if (key === 'purchase') {
        const choose = async (input) => {
          await input.scrollIntoViewIfNeeded()
          await input.click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option:not(.ant-select-item-option-disabled)').first().click()
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        await choose(editor.locator('#supplier_id'))
        await editor.locator('#payment_term_days').fill('0')
        await choose(first.locator('input[id$="_material_id"]'))
        await first.getByLabel('单价', { exact: true }).fill('1.25')
      }
      const fields = first.getByLabel(fieldLabel, { exact: true })
      const value = ['customers', 'suppliers', 'quality'].includes(key) ? '操作区核对条目' : '12'
      await fields.fill(value)
      const fieldNode = await fields.elementHandle()
      await selectLineItem(first)
      const host = scope.locator('.erp-line-editor__action-host')
      assert.match(await host.locator('[data-line-editor-selected="true"]').innerText(), /第 1 行/u)
      await revealLineItemDetails(rows.nth(1))
      assert.match(await host.locator('[data-line-editor-selected="true"]').innerText(), /第 1 行/u, '展开另一行不更换操作对象')
      assert.equal(await fields.evaluate((node, previous) => node === previous, fieldNode), true, '选行不重建字段')
      const markers = await scope.locator('.erp-line-editor__row-marker').evaluateAll((nodes) => nodes.map((node) => ({ marker: node.getBoundingClientRect().toJSON(), cell: node.closest('td').getBoundingClientRect().toJSON() })))
      assert.ok(markers.every(({ marker, cell }) => marker.x >= cell.x && marker.right <= cell.right + 1), `序号操作区应留在首列 ${JSON.stringify(markers)}`)
      const headers = await scope.locator('table thead th:visible').allTextContents()
      assert.equal(headers.some((label) => label.trim() === '操作'), false, '桌面移除右侧操作列')
      assert.equal(await scope.locator('td.erp-line-item-table__actions, td.erp-compact-field-table__actions, td.erp-contact-editor__actions').count(), 0)
      const copy = host.getByRole('button', { name: /^复制/u })
      const hasCopy = Boolean(await copy.count())
      const before = await rows.count()
      if (hasCopy) {
        await copy.click()
        assert.equal(await rows.count(), before + 1)
        const appended = await rows.nth(1).elementHandle()
        await page.waitForFunction((row) => row.contains(document.activeElement) && document.activeElement.matches('input, textarea, select') && !document.activeElement.closest('.erp-line-editor__row-marker'), appended)
        await appended.dispose()
      }
      await clickLineItemAction(rows.nth(1), /移除/u)
      await page.waitForFunction(({ node, count, selector }) => node.querySelectorAll(selector).length === count, { node: await editor.elementHandle(), count: hasCopy ? before : before - 1, selector: rowSelector }).catch(async (error) => {
        throw new Error(`${key} 移除后的数量未更新`, { cause: error })
      })
      assert.equal(await host.locator('[data-line-editor-selected="true"]').count(), 0, '移除后清空选择')
      assert.equal(await fields.inputValue(), value)
      assert.equal(await fields.evaluate((node, previous) => node === previous, fieldNode), true)
      if (key === 'purchase') {
        assert.equal(await rows.last().locator('.erp-purchase-line-summary').count(), 0, '插入复制行后空白行不串用相邻摘要')
        await clickLineItemAction(rows.last(), /移除/u)
        const opened = scope.locator('.erp-line-editor__details-toggle[aria-expanded="true"]')
        while (await opened.count()) await opened.first().click()
        while (await rows.count() < 8) await clickLineItemAction(first, '复制第 1 行')
        assert.equal(await rows.count(), 8)
        assert.equal(await scope.locator('.erp-line-item-table__details-row:visible').count(), 0)
        await selectLineItem(rows.nth(2))
        await scope.locator('.erp-line-editor__heading').scrollIntoViewIfNeeded()
      } else await selectLineItem(first)
      await waitForFiniteAnimations(page)
      await assertEditorTableHeadersCentered(editor)
      const geometry = await editor.evaluate((node) => ({ overflow: node.scrollWidth - node.clientWidth, scopeOverflow: node.querySelector('.erp-line-editor').scrollWidth - node.querySelector('.erp-line-editor').clientWidth }))
      assert.ok(geometry.overflow <= 1 && geometry.scopeOverflow <= 1, JSON.stringify(geometry))
      const mode = await page.locator('[data-erp-theme="dark"]').count() ? 'dark' : 'light'
      await page.screenshot({ path: `${deps.outputDir}/line-editor-toolbar-${key}-${mode}-editor.png` })
      await fieldNode.dispose()
    },
  }))
  const purchase = scenarios.find((item) => item.name === 'line-editor-toolbar-purchase')
  const finance = {
    ...bases.find((item) => item.name === 'business-form-page-payment-desktop'),
    name: 'line-editor-fixed-finance',
    viewport: { width: 1600, height: 900 },
    themeMode: 'dark',
    verify: async (page) => {
      await page.getByRole('row').filter({ hasText: 'PAY-STYLE-L1' }).first().click()
      await page.getByRole('button', { name: /选择应收 \/ 应付核销/u }).click()
      const dialog = page.getByRole('dialog').filter({ hasText: '选择核销记录' })
      await dialog.waitFor()
      assert.match(await dialog.getByLabel('应收 / 应付', { exact: true }).inputValue(), /AR-STYLE-L1/u)
      assert.equal(await dialog.getByLabel('未核销余额', { exact: true }).inputValue(), '1200')
      assert.equal(await dialog.locator('.erp-line-editor__row-marker input[type="radio"]').count(), 0)
      assert.equal(await dialog.locator('.erp-line-editor__action-host').count(), 0, '固定来源没有虚构的行操作')
      await dialog.getByRole('textbox', { name: /本次核销金额/u }).fill('1200')
      await assertEditorTableHeadersCentered(dialog)
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(await dialog.getByRole('textbox', { name: /本次核销金额/u }).inputValue(), '1200')
      assert.ok(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
      await page.screenshot({ path: `${deps.outputDir}/line-editor-fixed-finance-narrow.png` })
    },
  }
  return [...scenarios, { ...purchase, name: 'line-editor-toolbar-dark', themeMode: 'dark', deviceScaleFactor: 1 }, finance]
}
