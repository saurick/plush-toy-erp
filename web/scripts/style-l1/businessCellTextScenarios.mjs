import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

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
  }))
}

async function assertReadable(control, assert) {
  await control
    .page()
    .waitForFunction(
      (node) =>
        node.clientWidth > 0 &&
        node.clientHeight > 0 &&
        node.scrollWidth <= node.clientWidth + 1 &&
        node.scrollHeight <= node.clientHeight + 1,
      await control.elementHandle()
    )
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
      fields: ['加工项目', '备注'],
    },
    {
      key: 'shipment',
      path: '/erp/warehouse/shipments',
      open: '新建草稿',
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
      if (config.add) {
        await editor
          .getByRole('button', { name: config.add, exact: true })
          .click()
      }
      const line = config.key.startsWith('bom')
        ? editor.locator('.erp-bom-material-group').first()
        : editor.locator('.erp-sales-order-lines-form__row').first()
      await line.waitFor({ state: 'visible' })
      if (config.key.startsWith('bom')) {
        const selected = line.locator('.ant-select-selection-item').first()
        const metrics = await selected.evaluate((node) => ({
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
          height: node.clientHeight,
          text: node.textContent,
        }))
        deps.assert.equal(metrics.text, longText)
        deps.assert.ok(
          metrics.scrollWidth <= metrics.width + 1,
          `selected material is clipped: ${JSON.stringify(metrics)}`
        )
      }
      const details = line.locator('details')
      if (await details.count()) await details.locator('summary').click()
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
      await page.setViewportSize({ width: 720, height: 1000 })
      for (const label of config.fields) {
        await assertReadable(
          line.getByLabel(label, { exact: true }),
          deps.assert
        )
      }
      await assertBusinessFormPage(page, editor)
      await closeBusinessFormPage(page, editor)
    },
  }))
}
