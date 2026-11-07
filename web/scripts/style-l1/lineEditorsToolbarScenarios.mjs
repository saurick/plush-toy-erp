import assert from 'node:assert/strict'
import { createBusinessFormPagesScenarios } from './businessFormPagesScenarios.mjs'
import { assertEditorTableHeadersCentered, assertSharedLineTableSurface, assertSharedLineActions } from './businessFormPageAssertions.mjs'
import { assertBusinessLineItemsFooterSpacing, assertBusinessSectionTitleBands, assertCurrentBusinessSection } from './businessFormSectionAssertions.mjs'
import { clickLineItemAction, revealLineItemDetails, selectLineItem } from './lineEditorActions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertCompactLineNoteDisclosure, assertIndependentLineDetails } from './businessLineItemDisclosureAssertions.mjs'
import { assertVisibleControlPlaceholdersFit } from './inputControlAssertions.mjs'

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
      await waitForFiniteAnimations(page)
      await assertBusinessLineItemsFooterSpacing(editor)
      await assertSharedLineTableSurface(editor)
      await assertSharedLineActions(editor)
      if (key === 'production') {
        await assertCompactLineNoteDisclosure(page, editor, { persistentSelectors: ['input[id$="_route_code"]', 'button[id$="_customer_inspection_required"]'] })
        await assertSharedLineTableSurface(editor)
        await editor.getByLabel('计划数量', { exact: true }).first().focus()
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${deps.outputDir}/production-order-shared-header-default.png` })
      }
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
      if (key === 'sales') {
        const amount = first.locator('.erp-line-item-field--money input[readonly]')
        assert.equal(await amount.getAttribute('placeholder'), '待核对', '金额栏使用短状态提示')
        await first.getByText('请先选择已配置精度的单位', { exact: true }).waitFor()
        await assertVisibleControlPlaceholdersFit(page, 'line-editor-toolbar-sales-invalid-unit')
        const unitSelector = first.getByLabel('单位', { exact: true }).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
        await unitSelector.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option[title="个"]').click()
        await first.getByText('请先选择已配置精度的单位', { exact: true }).waitFor({ state: 'hidden' })
        await first.getByLabel('单价', { exact: true }).fill('2.5')
        assert.equal(await amount.getAttribute('placeholder'), '自动计算')
        assert.equal(Number(await amount.inputValue()), 30, '补齐合法单位后仍按原数量和单价计算金额')
      }
      if (key === 'quality') {
        await assertVisibleControlPlaceholdersFit(page, 'line-editor-toolbar-quality-empty-fields')
        await first.getByLabel('实际情况', { exact: true }).fill('样品无明显色差')
        const scopeSelector = first.getByLabel('检查范围', { exact: true }).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
        await scopeSelector.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: /^全检$/u }).click()
        assert.equal(await scopeSelector.locator('.ant-select-selection-item').innerText(), '全检')
      }
      const fieldNode = await fields.elementHandle()
      await selectLineItem(first)
      const host = scope.locator('.erp-line-editor__action-host')
      assert.equal(await scope.locator('.erp-line-editor__row-marker input').count(), 0, '行选择不增加圆圈或独立控件')
      assert.match(await host.locator('[data-line-editor-selected="true"]').innerText(), /第 1 行/u)
      await assertIndependentLineDetails(page, editor, rows.nth(1))
      await revealLineItemDetails(rows.nth(1))
      await selectLineItem(rows.nth(1))
      assert.match(await host.locator('[data-line-editor-selected="true"]').innerText(), /第 2 行/u, '点击另一行后操作跟随所在行')
      await fields.focus()
      assert.match(await host.locator('[data-line-editor-selected="true"]').innerText(), /第 1 行/u, '键盘进入字段也能确定操作对象')
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
      if (key === 'quality') {
        assert.equal(await first.getByLabel('实际情况', { exact: true }).inputValue(), '样品无明显色差')
        const scopeSelector = first.getByLabel('检查范围', { exact: true }).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
        assert.equal(await scopeSelector.locator('.ant-select-selection-item').innerText(), '全检', '移除相邻检查项后保留原检查范围')
      }
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
      if (key === 'production') {
        await fields.focus()
        await assertCurrentBusinessSection(page, editor, '生产明细')
      }
      await waitForFiniteAnimations(page)
      await assertBusinessSectionTitleBands(editor)
      await assertBusinessLineItemsFooterSpacing(editor)
      await assertEditorTableHeadersCentered(editor)
      await assertSharedLineTableSurface(editor)
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
  const salesMobile = {
    ...bases.find((item) => item.name === 'business-form-page-sales-desktop'),
    name: 'line-editor-toolbar-sales-mobile',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await page.getByRole('button', { name: '新建订单', exact: false }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('button', { name: '添加订货明细', exact: true }).click()
      await editor.getByRole('button', { name: '添加订货明细', exact: true }).click()
      const expand = editor.getByRole('button', { name: '全部展开', exact: true })
      if (await expand.count()) await expand.click()
      const cards = editor.locator('.erp-task-line-card')
      assert.equal(await cards.count(), 2)
      const field = cards.first().locator('textarea').first()
      await field.fill('手机订货要求')
      const original = await field.elementHandle()
      await cards.first().getByRole('button', { name: /^复制/u }).click()
      assert.equal(await cards.count(), 3)
      await cards.nth(1).getByRole('button', { name: /移除/u }).click()
      assert.equal(await cards.count(), 2)
      assert.equal(await field.inputValue(), '手机订货要求')
      assert.equal(await field.evaluate((node, previous) => node === previous, original), true)
      await assertBusinessSectionTitleBands(editor)
      await assertBusinessLineItemsFooterSpacing(editor)
      await assertSharedLineTableSurface(editor)
      await assertSharedLineActions(editor)
      await deps.assertNoHorizontalOverflow(page, 'line-editor-toolbar-sales-mobile')
      await page.screenshot({ path: `${deps.outputDir}/line-editor-toolbar-sales-mobile.png` })
      await original.dispose()
    },
  }
  return [...scenarios, { ...purchase, name: 'line-editor-toolbar-dark', themeMode: 'dark', deviceScaleFactor: 1 }, finance, salesMobile]
}
