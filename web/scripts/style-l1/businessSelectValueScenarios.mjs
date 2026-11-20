import assert from 'node:assert/strict'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertSingleSelectValues } from './singleSelectAssertions.mjs'
import { assertShipmentLineGrouping } from './shipmentLineGroupingAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import {
  assertControlStyleSurvivesVisits,
  navigateWithinApp,
} from './styleIsolationAssertions.mjs'

const longName = '模拟长名称：米白小号配套材料与包装规格，保留完整来源识别信息'
const records = {
  customers: [{ id: 1, code: 'SELECT-CUSTOMER-001', name: '模拟订货客户', short_name: '订货客户', is_active: true }],
  suppliers: [{ id: 1, code: 'SELECT-SUPPLIER-001', name: '模拟甲厂', short_name: '甲厂', supplier_type: 'mixed', is_active: true }],
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
      supplier_name: '模拟甲厂',
      supplier_item_no: 'SUP-STYLE-001',
      spec: '10mm',
      color: '米白',
      stock_category: 'MAIN',
      default_warehouse_id: 1,
      default_unit_id: 1,
      is_active: true,
    },
    {
      id: 1002,
      code: 'SELECT-MATERIAL-002',
      name: longName,
      supplier_id: 2,
      supplier_name: '模拟乙厂',
      supplier_item_no: 'SUP-STYLE-002',
      spec: '20mm',
      color: '黑色',
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
      if (config.key === 'shipment') {
        await page.route('**/rpc/*', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON() || {}
          const key = method === 'list_products' ? 'products' : method === 'list_units' ? 'units' : ''
          if (!key) return route.fallback()
          const extra = key === 'products'
            ? { id: 2, code: 'SELECT-PRODUCT-002', name: '模拟小兔', default_unit_id: 1, is_active: true }
            : { id: 2, code: 'CTN', name: '箱', precision: 0, is_active: true }
          await route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData([...records[key], extra], key, params)) } })
        })
      }
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
        const warehouse = selectField(modal, 'warehouse_id')
        assert.equal(await warehouse.locator('.ant-select-selection-item').innerText(), records.warehouses[0].name, '到货仓库选中后只显示名称')
        assert.equal(await warehouse.locator('.app-select__inspect').count(), 0, '宽屏名称已完整显示，不额外占用信息按钮')
        await page.setViewportSize({ width: 1024, height: 1080 })
        await assertSingleSelectValues(modal, 'arrival-narrow-readable')
        assert((await warehouse.locator('.app-select__reference-name').innerText()).includes(longName), '窄弹窗直接显示完整仓库名称')
        assert.equal(await warehouse.locator('.app-select__inspect').count(), 0, '完整换行不依赖额外点击')
        await page.setViewportSize({ width: 1920, height: 1080 })
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
      if (['sales', 'purchase', 'outsourcing'].includes(config.key)) {
        const partyType = config.key === 'sales' ? 'customers' : 'suppliers'
        const party = selectField(editor, config.key === 'sales' ? 'customer_id' : 'supplier_id')
        await chooseFirst(page, party.locator('.ant-select-selector'))
        assert.equal(await party.locator('.ant-select-selection-item').innerText(), records[partyType][0].name, '单据表头往来方选中后只显示名称')
        await party.getByRole('combobox').press('ArrowDown')
        const menu = page.locator('.ant-select-dropdown:visible')
        await menu.locator('.ant-select-item-option').first().waitFor()
        assert((await menu.innerText()).includes(records[partyType][0].code), '往来方编码保留在候选项')
        await party.getByRole('combobox').press('Escape')
        await menu.waitFor({ state: 'hidden' })
      }
      if (config.add) {
        await editor.getByRole('button', { name: config.add }).first().click()
      }

      if (config.key === 'shipment') {
        await assertShipmentLineGrouping(page, editor, deps.outputDir)
        await closeBusinessFormPage(page, editor)
        await page.getByRole('button', { name: config.open }).click()
        await editor.waitFor()
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
        const product = selectField(line, 'product_id')
        const productHeading = editor.locator('.erp-line-item-identity-group').first()
        assert((await productHeading.innerText()).includes(longName), '真实出货页在产品组标题显示完整名称')
        assert((await productHeading.innerText()).includes(records.products[0].code), '产品编码独立显示在组标题')
        const skuControl = selectField(line, 'product_sku_id')
        assert.equal(await skuControl.locator('.ant-select-selection-item').innerText(), records.product_skus[0].sku_name, '锁定规格只显示规格名称')
        assert.equal(await product.locator('.ant-select-arrow').count(), 0, '锁定产品不显示可编辑箭头')
        assert(await product.getByRole('combobox').isDisabled(), '产品组标题不会解除单行来源锁定')
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
        await editor.locator('.erp-sales-order-lines-form__list').screenshot({ path: `${deps.outputDir}/shipment-reference-row.png` })
        const warehouse = selectField(line, 'warehouse_id')
        const selectedHeight = (await warehouse.boundingBox()).height
        await warehouse.locator('.ant-select-clear').click()
        assert.equal(
          await warehouse.locator('.ant-select-selection-item').count(),
          0
        )
        const emptyHeight = (await warehouse.boundingBox()).height
        assert.ok(emptyHeight >= 32 && emptyHeight <= selectedHeight + 1, '清空后恢复标准框高')
        assert.equal(await warehouse.locator('xpath=..').locator('.app-select__reference-code').count(), 0, '清空后不残留编码')
        await chooseFirst(page, warehouse.locator('.ant-select-selector'))
        assert.ok(Math.abs((await warehouse.boundingBox()).height - selectedHeight) <= 1, '重选后按当前名称恢复高度')
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
          const material = selectField(table, 'material_id')
          const cell = material.locator('xpath=ancestor::td[1]')
          const assertNameOnly = async (name) => {
            assert.equal(await material.locator('.app-select__reference-name').innerText(), name, 'BOM 选择后保留完整物料名称')
            assert.equal(await material.locator('.ant-select-selection-item').innerText(), name, 'BOM 选中标签只显示名称')
            assert.equal(await cell.locator('.app-select__reference-code').count(), 0, 'BOM 名称列不另显编码')
            assert.equal(await cell.locator('.erp-bom-material-cell__context').count(), 0, 'BOM 已选名称下不重复显示厂商或颜色')
          }
          const assertMaterialDetails = async (record) => {
            assert.equal(await cell.locator('xpath=following-sibling::td[1]').innerText(), record?.supplier_item_no || '—', '厂商料号跟随当前物料')
            assert.equal(await cell.locator('xpath=following-sibling::td[2]').innerText(), record?.spec || '—', '规格跟随当前物料')
          }
          await assertNameOnly(longName)
          await assertMaterialDetails(records.materials[0])
          const materialWidth = await material.evaluate((node) => node.closest('td').getBoundingClientRect().width)
          assert(materialWidth >= 279, `BOM 物料列不被其他明细列挤窄: ${materialWidth}`)
          await material.getByRole('combobox').fill(records.materials[0].code)
          const menu = page.locator('.ant-select-dropdown:visible')
          await menu.locator('.ant-select-item-option').first().waitFor()
          assert((await menu.boundingBox()).width >= 559, 'BOM 候选列表独立加宽')
          const option = menu.locator('.ant-select-item-option').filter({ hasText: records.materials[0].code }).first()
          for (const text of [longName, records.materials[0].code, records.materials[0].supplier_name, records.materials[0].supplier_item_no, records.materials[0].spec, records.materials[0].color]) {
            assert((await option.innerText()).includes(text), `BOM 下拉候选保留辨认信息：${text}`)
          }
          await page.screenshot({ path: `${deps.outputDir}/bom-material-name-dropdown.png` })
          await option.click()
          await menu.waitFor({ state: 'hidden' })
          await assertNameOnly(longName)
          await material.getByRole('combobox').fill(records.materials[1].code)
          const replacement = menu.locator('.ant-select-item-option').filter({ hasText: records.materials[1].code }).first()
          await replacement.waitFor()
          assert((await replacement.innerText()).includes(longName), '同名物料仍能按编码定位')
          assert((await replacement.innerText()).includes(records.materials[1].supplier_name), '替换物料的候选保留厂商')
          assert((await replacement.innerText()).includes(records.materials[1].color), '替换物料的候选保留颜色')
          await replacement.click()
          await menu.waitFor({ state: 'hidden' })
          await assertNameOnly(records.materials[1].name)
          await assertMaterialDetails(records.materials[1])
          await page.screenshot({ path: `${deps.outputDir}/bom-material-same-name-selected.png` })
          await material.locator('.ant-select-clear').click()
          assert.equal(await material.locator('.app-select__reference-name').count(), 0, 'BOM 清空不残留旧名称')
          assert.equal(await cell.locator('.app-select__reference-code').count(), 0, 'BOM 清空不残留旧编码')
          await assertMaterialDetails(null)
          assert.equal(await selectField(table, 'unit_id').locator('.ant-select-selection-item').count(), 0, '清空物料同时清空关联单位')
          await chooseFirst(page, material.locator('.ant-select-selector'))
          await assertNameOnly(longName)
          await assertMaterialDetails(records.materials[0])
          await assertSingleSelectValues(table, 'bom-reselected')
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
