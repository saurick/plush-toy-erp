import { BusinessTextPolicy } from '../../src/common/consts/policies.generated.mjs'
import {
  assertBusinessFormPage,
  assertBusinessNoteTextAreas,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertSingleSelectValues } from './singleSelectAssertions.mjs'

const longText = '布底贴12g衬，衣片与披肩按尺寸配套，腰带两端留孔。'.repeat(4)
const multilineNote = Array.from(
  { length: 7 },
  (_, index) => `第${index + 1}项：保留尺寸和加工说明，整段文字应完整显示。`
).join('\n')

async function textMetrics(control) {
  return control.evaluate((node) => ({
    tag: node.tagName,
    value: node.value,
    width: node.clientWidth,
    height: node.clientHeight,
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
    lineHeight: Number.parseFloat(getComputedStyle(node).lineHeight),
    fontSize: getComputedStyle(node).fontSize,
    padding: getComputedStyle(node).padding,
    boxSizing: getComputedStyle(node).boxSizing,
    transition: getComputedStyle(node).transition,
  }))
}

async function assertReadable(control, assert) {
  await control.scrollIntoViewIfNeeded()
  await control
    .page()
    .waitForFunction(
      (node) =>
        node.clientWidth > 0 &&
        node.clientHeight > 0 &&
        node.scrollWidth <= node.clientWidth + 1 &&
        node.scrollHeight <= node.clientHeight + 1,
      await control.elementHandle()
    ).catch(async (error) => {
      throw new Error(`长文本未完整显示：${JSON.stringify(await textMetrics(control))}`, { cause: error })
    })
  const metrics = await textMetrics(control)
  assert.equal(metrics.tag, 'TEXTAREA', JSON.stringify(metrics))
  return metrics
}

async function exerciseText(control, assert, value = longText) {
  await control.fill(value)
  const expanded = await assertReadable(control, assert)
  assert.equal(expanded.value, value)
  assert.ok(expanded.height > expanded.lineHeight * 2, JSON.stringify(expanded))
  await control.press('Tab')
  assert.equal(
    await control.evaluate((node) => document.activeElement === node),
    false
  )
  await control.fill('短说明')
  await control
    .page()
    .waitForFunction(({ node, height }) => node.clientHeight < height, {
      node: await control.elementHandle(),
      height: expanded.height,
    })
  await assertReadable(control, assert)
  await control.fill(value)
  await assertReadable(control, assert)
}

export function createBusinessCellTextScenarios(deps) {
  const forms = [
    {
      key: 'bom',
      path: '/erp/purchase/material-bom',
      fields: ['加工基础 1', '加工方式 1', '备注 1'],
    },
    {
      key: 'bom-readonly',
      path: '/erp/purchase/material-bom',
      readonly: true,
      fields: ['加工基础 1', '加工方式 1', '备注 1'],
    },
    {
      key: 'sales',
      path: '/erp/sales/project-orders/sales-orders',
      open: '新建订单',
      add: '添加订货明细',
      fields: ['订货产品名称', '工艺要求', '备注'],
    },
    {
      key: 'purchase',
      path: '/erp/purchase/accessories',
      open: '新建采购订单',
      fields: ['下单材料名称', '备注'],
    },
    {
      key: 'outsourcing',
      path: '/erp/purchase/processing-contracts',
      open: '新建加工合同',
      fields: ['加工项目', '行备注'],
    },
    {
      key: 'shipment',
      path: '/erp/warehouse/shipments',
      open: '新建出货单',
      fields: ['包装说明', '备注'],
    },
  ]
  return forms.map((config) => ({
    name: `business-cell-text-${config.key}`,
    path: config.path,
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 1000 },
    beforeNavigate: async (page) => {
      if (!config.key.startsWith('bom')) return
      await page.route('**/rpc/masterdata', async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        if (method !== 'list_materials') return route.fallback()
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id,
            result: styleRpcResult(
              stylePaginatedRpcData(
                [
                  {
                    id: 1,
                    name: longText,
                    code: 'LONG-MATERIAL',
                    default_unit_id: 1,
                    is_active: true,
                  },
                ],
                'materials',
                params
              )
            ),
          },
        })
      })
      await page.route('**/rpc/bom', async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        if (method !== 'get_bom_version') return route.fallback()
        const items = [
          {
            id: 1,
            material_id: 1,
            unit_id: 1,
            quantity: '1',
            loss_rate: '0',
            position: '前片',
            process_base: longText,
            process_method: longText,
            note: multilineNote,
          },
        ]
        const bom = {
          id: params.id,
          product_id: 1,
          version: config.readonly ? 'BOM-STYLE-L1' : 'BOM-STYLE-DRAFT',
          status: config.readonly ? 'ACTIVE' : 'DRAFT',
          edit_version: 1,
          items,
        }
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id,
            result: styleRpcResult({ bom_version: bom, bom_items: items }),
          },
        })
      })
    },
    verify: async (page) => {
      if (config.open) {
        await page.getByRole('button', { name: config.open }).click()
      } else {
        await page
          .getByText(config.readonly ? 'BOM-STYLE-L1' : 'BOM-STYLE-DRAFT', {
            exact: true,
          })
          .dblclick()
      }
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.querySelector('.erp-business-form-page:not([hidden])')?.getAttribute('aria-busy') === 'false')
      const headerNote = editor.locator('[data-form-section="备注与附件"] textarea')
      await headerNote.scrollIntoViewIfNeeded()
      const headerCount = headerNote.locator('..').locator('.ant-input-data-count')
      const initialHeader = await textMetrics(headerNote)
      deps.assert.equal(initialHeader.tag, 'TEXTAREA')
      deps.assert.ok(initialHeader.height >= initialHeader.lineHeight * 2, `整单备注两行起步：${JSON.stringify(initialHeader)}`)
      deps.assert.equal(await headerNote.getAttribute('maxlength'), null)
      if (config.readonly) {
        deps.assert.equal(await headerCount.count(), 0, '只读备注不显示字数')
      } else {
        await headerNote.fill(multilineNote)
        const expanded = await assertReadable(headerNote, deps.assert)
        deps.assert.ok(expanded.height > initialHeader.height)
        deps.assert.equal(await headerCount.innerText(), `${multilineNote.length} / ${BusinessTextPolicy.noteMaxCharacters}`)
        await headerNote.locator('..').locator('.ant-input-clear-icon').click()
        deps.assert.equal(await headerNote.inputValue(), '')
        await page.waitForFunction(({ node, height }) => node.clientHeight <= height + 1, {
          node: await headerNote.elementHandle(), height: initialHeader.height,
        })
        deps.assert.equal(await headerCount.innerText(), `0 / ${BusinessTextPolicy.noteMaxCharacters}`)
      }
      if (config.add) {
        await editor
          .getByRole('button', { name: config.add, exact: true })
          .click()
      }
      const line = config.key.startsWith('bom')
        ? editor.locator('.erp-bom-material-group').first()
        : editor.locator('.erp-sales-order-lines-form__row').first()
      await line.waitFor({ state: 'visible' })
      await assertBusinessNoteTextAreas(line)
      if (config.key.startsWith('bom')) {
        const selected = line.locator('.ant-select-selection-item').first()
        const metrics = await selected.evaluate((node) => ({
          text: node.textContent,
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
        }))
        deps.assert.equal(metrics.text, longText)
        deps.assert.ok(metrics.scrollWidth <= metrics.width + 1, '长材料名称在框内完整换行')
        await assertSingleSelectValues(line, `business-cell-text-${config.key}`)
      }
      const details = line.locator('details')
      if (await details.count()) {
        deps.assert.equal(await details.getAttribute('open'), null)
        await details.locator('summary').click()
      }
      for (const label of config.fields) {
        if (config.readonly) {
          const control = line.getByLabel(label, { exact: true })
          deps.assert.equal(await control.isDisabled(), true)
          await assertReadable(control, deps.assert)
          continue
        }
        await exerciseText(
          line.getByLabel(label, { exact: true }),
          deps.assert,
          label.startsWith('备注') ? multilineNote : longText
        )
      }
      const note = line.getByLabel(config.fields.at(-1), { exact: true })
      if (config.readonly) {
        deps.assert.equal(await note.inputValue(), multilineNote)
      } else if (config.key === 'bom') {
        const count = await editor.locator('tr[data-bom-part-index]').count()
        const consumed = await note.evaluate((node, value) => {
          const data = new DataTransfer()
          data.setData('text/plain', value)
          return !node.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            })
          )
        }, multilineNote)
        deps.assert.equal(
          consumed,
          false,
          'single-cell multiline notes must use native paste'
        )
        deps.assert.equal(
          await editor.locator('tr[data-bom-part-index]').count(),
          count
        )
      } else {
        await note.locator('..').locator('.ant-input-clear-icon').click()
        deps.assert.equal(await note.inputValue(), '')
        await note.fill(multilineNote)
        await assertReadable(note, deps.assert)
      }
      if (!config.key.startsWith('bom')) {
        deps.assert.equal(await details.count(), 0, '明细补充字段直接展示，不再折叠备注')
        deps.assert.equal(await note.isVisible(), true)
        deps.assert.equal(await note.inputValue(), multilineNote)
        await note.fill('')
        deps.assert.equal(await note.inputValue(), '')
        await assertBusinessNoteTextAreas(line)
        await note.fill(multilineNote)
        await assertReadable(note, deps.assert)
      }
      await assertBusinessFormPage(page, editor)
      await page.setViewportSize({ width: 1920, height: 1200 })
      const table = editor.locator(
        config.key.startsWith('bom')
          ? '.erp-bom-material-groups'
          : '.erp-sales-order-lines-form__list'
      )
      await table.screenshot({
        path: `${deps.outputDir}/business-cell-text-${config.key}-expanded.png`,
      })
      const noteBeforeResize = await note.inputValue()
      if (!config.readonly) await note.focus()
      await page.setViewportSize({ width: 720, height: 1000 })
      for (const label of config.fields) {
        await assertReadable(
          line.getByLabel(label, { exact: true }),
          deps.assert
        )
      }
      deps.assert.equal(await note.inputValue(), noteBeforeResize)
      if (!config.readonly) {
        deps.assert.equal(await note.evaluate((node) => node === document.activeElement), true, '切换宽度保留备注焦点')
      }
      await assertBusinessFormPage(page, editor)
      await closeBusinessFormPage(page, editor)
    },
  }))
}
