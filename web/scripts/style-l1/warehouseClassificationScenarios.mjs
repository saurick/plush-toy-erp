import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createWarehouseClassificationScenarios(deps) {
  let calls, warehouses, materials
  const install = async (page) => {
    calls = []
    warehouses = [
      {
        id: 1,
        code: 'WH-MAIN',
        name: '模拟主料仓',
        type: 'MAIN_MATERIAL',
        is_active: true,
      },
      {
        id: 2,
        code: 'WH-AUX',
        name: '模拟辅料仓',
        type: 'AUXILIARY_MATERIAL',
        is_active: true,
      },
      {
        id: 3,
        code: 'WH-FG',
        name: '模拟成品仓',
        type: 'FINISHED_GOODS',
        is_active: true,
      },
    ]
    materials = [
      {
        id: 1,
        code: 'MAT-MAIN',
        name: '模拟短毛绒',
        category: '面料',
        stock_category: 'MAIN',
        default_warehouse_id: 1,
        default_unit_id: 1,
        is_active: true,
      },
      {
        id: 2,
        code: 'MAT-AUX',
        name: '模拟车缝线',
        category: '线',
        stock_category: 'AUXILIARY',
        default_warehouse_id: 2,
        default_unit_id: 1,
        is_active: true,
      },
    ]
    await page.route('**/rpc/*', async (route) => {
      const { method, params = {}, id } = route.request().postDataJSON() || {}
      let data
      calls.push({ method, params })
      if (
        method === 'list_purchase_orders' ||
        method === 'get_purchase_order'
      ) {
        const order = {
          id: 1,
          purchase_order_no: 'PO-STYLE-L1',
          supplier_id: 1,
          lifecycle_status: 'approved',
          version: 1,
          currency: 'CNY',
          item_count: 2,
          purchase_date: 1788912000,
          expected_arrival_date: 1789516800,
        }
        data =
          method === 'list_purchase_orders'
            ? stylePaginatedRpcData([order], 'purchase_orders', params)
            : { purchase_order: order }
      } else if (
        method === 'list_warehouses' ||
        method === 'list_material_warehouses'
      )
        data = stylePaginatedRpcData(
          warehouses.filter(
            (row) =>
              method === 'list_warehouses' || row.type !== 'FINISHED_GOODS'
          ),
          'warehouses',
          params
        )
      else if (method === 'list_materials')
        data = stylePaginatedRpcData(materials, 'materials', params)
      else if (method === 'update_warehouse') {
        warehouses = warehouses.map((row) =>
          row.id === params.id ? { ...row, ...params } : row
        )
        data = { warehouse: warehouses.find((row) => row.id === params.id) }
      } else if (method === 'list_inventory_balances') {
        const balances = materials.map((row) => ({
          id: row.id,
          subject_type: 'MATERIAL',
          subject_id: row.id,
          stock_category: row.stock_category,
          warehouse_id: row.default_warehouse_id,
          unit_id: 1,
          quantity: '10',
          active_reserved_quantity: '0',
          available_quantity: '10',
          updated_at: 1788912000,
        }))
        data = stylePaginatedRpcData(
          balances.filter(
            (row) =>
              !params.stock_category ||
              row.stock_category === params.stock_category
          ),
          'inventory_balances',
          params
        )
      } else if (method === 'get_purchase_order_receipt_progress')
        data = {
          purchase_order_receipt_progress: {
            purchase_order_id: 1,
            purchase_order_no: 'PO-STYLE-L1',
            lifecycle_status: 'approved',
            items: materials.map((row) => ({
              purchase_order_item_id: row.id + 10,
              line_no: row.id,
              material_id: row.id,
              material_code: row.code,
              material_name: row.name,
              unit_id: 1,
              unit_code: 'PCS',
              unit_name: '件',
              line_status: 'open',
              purchased_quantity: '10',
              effective_received_quantity: '0',
              draft_reserved_quantity: '0',
              remaining_receivable_quantity: '10',
              remaining_generatable_quantity: '10',
              can_generate: true,
              disabled_reason: '',
            })),
          },
        }
      else if (method === 'create_purchase_receipt_from_purchase_order')
        data = {
          purchase_receipt: {
            id: 900,
            receipt_no: params.receipt_no,
            status: 'DRAFT',
            items: params.item_warehouses.map((item, index) => ({
              id: index + 1,
              receipt_id: 900,
              material_id: index + 1,
              warehouse_id: item.warehouse_id,
              unit_id: 1,
              lot_id: index + 901,
              quantity: '10',
            })),
          },
        }
      else return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: styleRpcResult(data),
        }),
      })
    })
  }
  const scenarios = [
    {
      name: 'warehouse-classification-and-settings-desktop',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: install,
      verify: async (page) => {
        await deps.expectHeading(page, '库存台账')
        await page
          .getByRole('button', { name: '仓库设置', exact: true })
          .click()
        const modal = page
          .getByRole('dialog')
          .filter({ hasText: '仓库设置' })
          .last()
        await modal.getByText('模拟主料仓', { exact: true }).waitFor()
        await page.screenshot({
          path: `${deps.outputDir}/warehouse-settings-initial.png`,
          fullPage: true,
        })
        await modal
          .locator('tbody tr')
          .filter({ hasText: '模拟主料仓' })
          .getByRole('button', { name: /编\s*辑/ })
          .click()
        await modal
          .getByLabel('仓库名称', { exact: true })
          .fill('模拟主料仓 A区')
        await modal
          .getByRole('button', { name: '保存修改', exact: true })
          .click()
        await modal.getByText('模拟主料仓 A区', { exact: true }).waitFor()
        deps.assert.equal(
          calls.filter((call) => call.method === 'update_warehouse').at(-1)
            .params.type,
          'MAIN_MATERIAL'
        )
        await page.screenshot({
          path: `${deps.outputDir}/warehouse-settings.png`,
          fullPage: true,
        })
        await modal.locator('.ant-modal-close').click()
        await modal.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () => document.activeElement?.textContent === '仓库设置'
        )
        // The shared modal restores trigger focus 80 ms after its close transition.
        await page.waitForTimeout(120)
        await page
          .locator('.ant-select')
          .filter({ has: page.getByRole('combobox', { name: '材料库存类别' }) })
          .locator('.ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('辅料', { exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-business-data-table-card')
            ?.textContent.includes('模拟车缝线')
        )
        deps.assert.equal(
          calls
            .filter((call) => call.method === 'list_inventory_balances')
            .at(-1).params.stock_category,
          'AUXILIARY'
        )
        await page.screenshot({
          path: `${deps.outputDir}/inventory-auxiliary-filter.png`,
          fullPage: true,
        })
      },
    },
    {
      name: 'purchase-receipt-per-line-warehouses-desktop',
      path: '/erp/purchase/accessories',
      auth: 'admin',
      effectiveSession: {
        ...deps.customerRuntimeEffectiveSession,
        actions: [
          ...deps.customerRuntimeEffectiveSession.actions,
          'purchase.receipt.create',
        ],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: install,
      verify: async (page) => {
        await deps.expectHeading(page, '采购订单')
        await page
          .locator('.erp-business-data-table-card tbody tr')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
          .click()
        if (page.viewportSize().width < 768) {
          await page.getByRole('button', { name: /^更多操作，共/u }).click()
        }
        await page
          .locator('[data-business-action-key="generate-inbound"]')
          .click()
        const modal = page
          .getByRole('dialog')
          .filter({ hasText: '生成采购入库草稿' })
          .last()
        await modal.getByText('模拟主料仓 / WH-MAIN', { exact: true }).waitFor()
        await modal.getByText('模拟辅料仓 / WH-AUX', { exact: true }).waitFor()
        await modal
          .locator('.ant-select')
          .filter({
            has: page.getByRole('combobox', { name: '第2行入库仓库' }),
          })
          .locator('.ant-select-selector')
          .click()
        const dropdown = page.locator('.ant-select-dropdown:visible')
        deps.assert.equal(
          await dropdown
            .getByText('模拟主料仓 / WH-MAIN', { exact: true })
            .count(),
          0
        )
        deps.assert.equal(
          await dropdown
            .getByText('模拟成品仓 / WH-FG', { exact: true })
            .count(),
          0
        )
        await dropdown.getByText('模拟辅料仓 / WH-AUX', { exact: true }).click()
        await modal.getByLabel('入库单号', { exact: true }).focus()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.ant-select-dropdown')].every(
            (node) => getComputedStyle(node).display === 'none'
          )
        )
        const sourceTable = modal.locator(
          '[aria-label="采购订单生成入库来源明细"]'
        )
        const tableWidth = await sourceTable.evaluate(
          (node) => node.getBoundingClientRect().width
        )
        const formWidth = await modal
          .locator('form')
          .evaluate((node) => node.getBoundingClientRect().width)
        deps.assert.ok(
          tableWidth >= formWidth - 2,
          `来源明细应独占整行: ${tableWidth}/${formWidth}`
        )
        const modalBox = await modal.boundingBox()
        deps.assert.ok(
          modalBox.x >= 0 &&
            modalBox.x + modalBox.width <= page.viewportSize().width + 1,
          '入库弹窗应完整位于当前视口'
        )
        await page.screenshot({
          path: `${deps.outputDir}/purchase-receipt-material-warehouses${page.viewportSize().width < 1000 ? '-narrow' : ''}.png`,
          fullPage: true,
        })
        await modal.locator('.ant-modal-footer .ant-btn-primary').click()
        await modal.waitFor({ state: 'hidden' })
        const submitted = calls
          .filter(
            (call) =>
              call.method === 'create_purchase_receipt_from_purchase_order'
          )
          .at(-1)
        deps.assert.deepEqual(submitted.params.item_warehouses, [
          { purchase_order_item_id: 11, warehouse_id: 1 },
          { purchase_order_item_id: 12, warehouse_id: 2 },
        ])
        deps.assert.equal(
          calls.some((call) => call.method === 'post_purchase_receipt'),
          false
        )
      },
    },
  ]
  return [
    ...scenarios,
    {
      ...scenarios[1],
      name: 'purchase-receipt-per-line-warehouses-narrow',
      viewport: { width: 720, height: 900 },
    },
  ]
}
