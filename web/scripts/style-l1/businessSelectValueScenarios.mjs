import assert from 'node:assert/strict'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertSingleSelectValues } from './singleSelectAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import {
  assertControlStyleSurvivesVisits,
  navigateWithinApp,
} from './styleIsolationAssertions.mjs'

const longName = '模拟长名称：米白小号配套材料与包装规格，保留完整来源识别信息'
const records = {
  products: [
    {
      id: 1,
      code: 'SELECT-PRODUCT-001',
      name: longName,
      default_unit_id: 1,
      is_active: true,
    },
  ],
  product_skus: [
    {
      id: 1,
      product_id: 1,
      sku_code: 'SELECT-SKU-001-VERY-LONG-CODE',
      sku_name: longName,
      color: '米白',
      size: '小号',
      default_unit_id: 1,
      is_active: true,
    },
  ],
  materials: [
    {
      id: 1,
      code: 'SELECT-MATERIAL-001',
      name: longName,
      supplier_id: 1,
      stock_category: 'MAIN',
      default_warehouse_id: 1,
      default_unit_id: 1,
      is_active: true,
    },
  ],
  units: [
    {
      id: 1,
      code: 'SELECT-UNIT-001',
      name: '模拟计量单位（包含配套包装与组件）',
      precision: 0,
      is_active: true,
    },
  ],
  warehouses: [
    {
      id: 1,
      code: 'SELECT-WAREHOUSE-001',
      name: `模拟在制仓 ${longName}`,
      type: 'MAIN_MATERIAL',
      is_active: true,
    },
  ],
  inventory_lots: [
    {
      id: 402,
      subject_type: 'PRODUCT',
      subject_id: 1,
      product_sku_id: 1,
      lot_no: 'SELECT-LOT-20261029-VERY-LONG-BATCH-NUMBER-001',
      status: 'ACTIVE',
    },
  ],
}

async function installLongReferenceOptions(page) {
  await page.route('**/rpc/*', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON() || {}
    const key =
      method === 'list_material_warehouses'
        ? 'warehouses'
        : method?.replace(/^list_/u, '')
    if (!method?.startsWith('list_') || !records[key]) return route.fallback()
    await route.fulfill({
      json: {
        jsonrpc: '2.0',
        id,
        result: styleRpcResult(
          stylePaginatedRpcData(records[key], key, params)
        ),
      },
    })
  })
}

async function chooseFirst(page, input) {
  await waitForFiniteAnimations(page)
  await input.click()
  await waitForFiniteAnimations(page)
  const options = page.locator(
    '.ant-select-dropdown:visible .ant-select-item-option:not(.ant-select-item-option-disabled)'
  )
  await options.first().waitFor()
  await options.first().click()
  await page
    .locator('.ant-select-dropdown:visible')
    .waitFor({ state: 'hidden' })
}

function selectField(scope, key) {
  return scope
    .locator('.ant-select')
    .filter({ has: scope.page().locator(`input[id$="${key}"]`) })
    .first()
}

async function checkSizes(page, scope, name, outputDir, minimum = 1) {
  for (const width of [1920, 1024, 720]) {
    await page.setViewportSize({ width, height: 1080 })
    await assertSingleSelectValues(scope, `${name}-${width}`, minimum)
  }
  await page.setViewportSize({ width: 1920, height: 1080 })
  await assertSingleSelectValues(scope, `${name}-restored`, minimum)
  await page.screenshot({ path: `${outputDir}/${name}-selected.png` })
}

export function createBusinessSelectValueScenarios(deps) {
  const forms = [
    {
      key: 'sales',
      path: '/erp/sales/project-orders/sales-orders',
      open: '新建订单',
      add: '添加订货明细',
      field: 'unit_id',
    },
    {
      key: 'purchase',
      path: '/erp/purchase/accessories',
      record: 'PO-STYLE-L1',
    },
    {
      key: 'outsourcing',
      path: '/erp/purchase/processing-contracts',
      open: '新建加工合同',
      field: 'product_id',
    },
    { key: 'bom', path: '/erp/purchase/material-bom' },
    { key: 'shipment', path: '/erp/warehouse/shipments', open: '新建出货单' },
    { key: 'arrival', path: '/erp/purchase/accessories' },
  ]
  return forms.map((config) => ({
    name: `business-select-values-${config.key}`,
    path: config.path,
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      await installLongReferenceOptions(page)
      if (config.key === 'arrival') {
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_purchase_order_receipt_progress') {
            const items = [
              {
                purchase_order_item_id: 1,
                line_no: 1,
                material_id: 1,
                material_code: records.materials[0].code,
                material_name: longName,
                unit_id: 1,
                unit_code: 'EA',
                unit_name: '个',
                line_status: 'open',
                purchased_quantity: '10',
                effective_received_quantity: '0',
                draft_reserved_quantity: '0',
                remaining_receivable_quantity: '10',
                remaining_generatable_quantity: '10',
                can_generate: true,
                disabled_reason: '',
              },
            ]
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: styleRpcResult({
                  purchase_order_receipt_progress: {
                    purchase_order_id: 1,
                    purchase_order_no: 'PO-STYLE-L1',
                    lifecycle_status: 'approved',
                    items,
                  },
                }),
              },
            })
          }
          if (!['list_purchase_orders', 'get_purchase_order'].includes(method)) {
            return route.fallback()
          }
          const order = {
            id: 1,
            purchase_order_no: 'PO-STYLE-L1',
            supplier_id: 1,
            lifecycle_status: 'approved',
            version: 1,
            item_count: 1,
            currency: 'CNY',
          }
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(
                method === 'list_purchase_orders'
                  ? stylePaginatedRpcData([order], 'purchase_orders', params)
                  : { purchase_order: order }
              ),
            },
          })
        })
      }
    },
    verify: async (page) => {
      if (config.key === 'arrival') {
        await page
          .locator('.ant-table-row')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
          .click()
        await page.getByRole('button', { name: '登记到货' }).click()
        const modal = page.getByRole('dialog', {
          name: '登记采购到货',
          exact: true,
        })
        await chooseFirst(
          page,
          selectField(modal, 'warehouse_id').locator('.ant-select-selector')
        )
        await checkSizes(
          page,
          modal,
          `business-select-values-${config.key}`,
          deps.outputDir
        )
        const reader = modal.locator('.app-select__inspect').first()
        await reader.click()
        const valueDialog = page.locator('.app-select-value-popover [role="dialog"]')
        await valueDialog.waitFor()
        await waitForFiniteAnimations(page)
        await page.waitForFunction(() => document.activeElement === document.querySelector('.app-select-value-popover [role="dialog"]'), null, { timeout: 1500 })
        assert(await valueDialog.evaluate((node) => node === document.activeElement), '单据弹窗内也能聚焦完整值')
        assert((await valueDialog.innerText()).includes(longName), '到货仓库完整名称可读')
        await valueDialog.press('Escape')
        await valueDialog.waitFor({ state: 'hidden' })
        assert(await modal.isVisible(), 'Escape 只关闭完整值，不关闭到货单据')
        assert(await reader.evaluate((node) => node === document.activeElement), '焦点回到原单据的阅读入口')
        await modal.getByRole('button', { name: /^关\s*闭$/u }).click()
        return
      }
      if (config.open) {
        await page.getByRole('button', { name: config.open }).click()
      } else {
        await page
          .getByText(config.record || 'BOM-STYLE-DRAFT', { exact: true })
          .dblclick()
      }
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.waitFor()
      await page.waitForFunction(
        () =>
          document
            .querySelector('.erp-business-form-page:not([hidden])')
            ?.getAttribute('aria-busy') === 'false'
      )
      if (config.add) {
        await editor.getByRole('button', { name: config.add }).first().click()
      }

      if (config.key === 'shipment') {
        await editor.getByRole('button', { name: '从销售订单导入' }).click()
        const picker = page.locator(
          '.erp-source-import-picker-modal.ant-modal:visible'
        )
        const rows = picker.locator('.ant-table-tbody .ant-table-row')
        await rows.first().waitFor()
        for (const index of [0, 1]) {
          await rows.nth(index).getByRole('checkbox').check()
          await picker
            .getByText(`已选 ${index + 1} 条：`, { exact: true })
            .waitFor()
        }
        await picker
          .locator('.erp-source-import-picker__footer-actions .ant-btn-primary')
          .click()
        await picker.waitFor({ state: 'hidden' })
        const lines = editor.locator('.erp-sales-order-lines-form__row')
        assert.equal(await lines.count(), 2)
        const line = lines.first()
        const sku = line.getByRole('combobox', { name: 'SKU', exact: true })
        assert.equal(await sku.isDisabled(), true, '导入后 SKU 仍按来源锁定')
        await assertSingleSelectValues(editor, 'shipment-imported', 6)
        await chooseFirst(
          page,
          selectField(line, 'warehouse_id').locator('.ant-select-selector')
        )
        await chooseFirst(
          page,
          selectField(line, 'lot_id').locator('.ant-select-selector')
        )
        await checkSizes(
          page,
          editor,
          'business-select-values-shipment',
          deps.outputDir,
          8
        )
        const warehouse = selectField(line, 'warehouse_id')
        const selectedHeight = (await warehouse.boundingBox()).height
        await warehouse.locator('.ant-select-clear').click()
        assert.equal(
          await warehouse.locator('.ant-select-selection-item').count(),
          0
        )
        assert.ok(
          Math.abs((await warehouse.boundingBox()).height - selectedHeight) <=
            1,
          '清空来源选择后控件高度不变'
        )
        await chooseFirst(page, warehouse.locator('.ant-select-selector'))
        await assertSingleSelectValues(editor, 'shipment-reselected', 8)
      } else {
        if (config.key === 'purchase') {
          await editor.getByRole('button', { name: '从材料库添加' }).click()
          const picker = page.locator(
            '.erp-source-import-picker-modal.ant-modal:visible'
          )
          await picker
            .locator('.ant-table-tbody .ant-table-row')
            .first()
            .getByRole('checkbox')
            .check()
          await picker.getByText('已选 1 条：', { exact: true }).waitFor()
          await picker.getByRole('button', { name: '添加到采购明细' }).click()
          await picker.waitFor({ state: 'hidden' })
          await editor
            .locator('.ant-select-selection-item')
            .filter({ hasText: longName })
            .first()
            .waitFor()
        }
        if (config.field) {
          await chooseFirst(
            page,
            selectField(editor, config.field).locator('.ant-select-selector')
          )
        }
        const table = editor
          .locator('table')
          .filter({ has: page.locator('.ant-select-single') })
          .first()
        await checkSizes(
          page,
          table,
          `business-select-values-${config.key}`,
          deps.outputDir
        )
        if (config.key === 'bom') {
          const input = table.locator('.ant-select:not(.ant-select-disabled) input').first()
          await assertControlStyleSurvivesVisits(page, {
            input,
            label: 'BOM 长选中值跨模块隔离',
            close: () => closeBusinessFormPage(page, editor),
            reopen: async () => {
              await navigateWithinApp(page, config.path, page.getByText('BOM-STYLE-DRAFT', { exact: true }))
              await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
              await input.waitFor({ state: 'visible' })
              await assertSingleSelectValues(table, 'bom-after-module-visit')
            },
            visits: [
              async () => {
                await navigateWithinApp(page, '/erp/purchase/processing-contracts', page.getByRole('button', { name: '新建加工合同' }))
                await page.getByRole('button', { name: '新建加工合同' }).click()
                await editor.waitFor()
                await closeBusinessFormPage(page, editor)
              },
              () => navigateWithinApp(page, '/__dev/ui-design?page=controls&control=inputs', page.locator('.erp-control-library-stage')),
            ],
          })
        }
      }
      await closeBusinessFormPage(page, editor)
    },
  }))
}
