import { chooseWorkspaceEditor } from './businessEditorWorkspaceTools.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createBOMPreparationScenarios(deps) {
  return ['create', 'multiple', 'stale', 'read-failure'].map((mode) => {
    const mobile = mode.endsWith('mobile')
    const readonly = mode === 'readonly-mobile'
    const orderNo = `SO-BOM-PREPARE-${mode}`
    let order
    let item
    let records
    let writes
    let rejectSave
    let rejectRead
    const permissions = ['sales_order.read', 'sales_order.item.read', 'sales_order.engineering.update', 'product.read', 'product_sku.read', 'material.read', 'unit.read', 'bom.read', 'mobile.engineering.access', ...(!readonly ? ['bom.update'] : []), ...(mode !== 'multiple' && !readonly ? ['bom.create'] : [])]
    const original = { id: 2, product_id: 1, version: 'V2', status: 'DRAFT', item_count: 1, edit_version: 1791648000000000, created_at: 1791648000, updated_at: 1791648000, items: [{ id: 11, bom_header_id: 2, material_id: 1, quantity: '2.5', unit_id: 1, loss_rate: '0.03', position: '面料' }] }
    return {
      name: `engineering-bom-entry-${mode}`,
      path: mobile ? '/m/engineering/handle/sales/project-orders/sales-orders' : '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions,
        menus: [
          { key: 'material-bom', path: '/erp/purchase/material-bom', label: '物料清单（BOM）', required_any: ['bom.read'], required_all: [] },
          { key: 'sales-orders', path: '/erp/sales/project-orders/sales-orders', label: '销售订单', required_any: ['sales_order.read'], required_all: [] },
        ],
      },
      effectiveSession: { ...deps.customerRuntimeEffectiveSession, pages: ['material-bom', 'sales-orders'], actions: permissions },
      beforeNavigate: async (page) => {
        writes = []
        rejectSave = mode === 'create'
        rejectRead = mode === 'read-failure'
        order = { id: 1, order_no: orderNo, customer_id: 1, currency: 'CNY', customer_snapshot: { name: '模拟客户' }, order_date: 1791648000, lifecycle_status: 'active', version: 1, item_count: 1 }
        item = { id: 1, sales_order_id: 1, line_no: 1, product_id: 1, product_sku_id: null, bom_id: ['create', 'multiple'].includes(mode) ? null : 2, requested_product_name: '模拟工程产品', ordered_quantity: '100', pre_shipment_sample_quantity: '2', unit_id: 1, unit_price: '10', amount: '1000', line_status: 'open' }
        records = mode === 'create' ? [] : [structuredClone(original)]
        if (mode === 'multiple') records.push({ ...structuredClone(original), id: 3, version: 'V3', items: [{ ...original.items[0], id: 12, bom_header_id: 3 }] })
        if (mobile) {
          await page.addInitScript(() => {
            const history = window.history.state || {}
            window.history.replaceState({
              ...history,
              usr: {
                ...history.usr,
                workflowTaskNavigation: {
                  taskID: 91,
                  taskName: '编制订单 BOM',
                  adminID: 1,
                  entryPath: '/m/engineering/handle/sales/project-orders/sales-orders',
                  returnPath: '/m/engineering/tasks',
                },
              },
            }, '')
          })
        }
        const reply = (route, id, data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_orders') return reply(route, id, stylePaginatedRpcData([order], 'sales_orders', params))
          if (method === 'get_sales_order') return reply(route, id, { sales_order: order })
          if (method === 'list_sales_order_items') return reply(route, id, stylePaginatedRpcData([item], 'sales_order_items', params))
          if (method === 'save_sales_order_engineering') {
            if (rejectSave) {
              rejectSave = false
              return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '保存失败' } } })
            }
            deps.assert.equal(params.expected_version, order.version)
            writes.push({ method, params })
            item = { ...item, ...params.items[0] }
            order.version += 1
            return reply(route, id, { sales_order_id: 1, version: order.version })
          }
          return route.fallback()
        })
        await page.route('**/rpc/bom', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_bom_versions') return reply(route, id, stylePaginatedRpcData(records.filter((bom) => !params.product_id || bom.product_id === params.product_id), 'bom_versions', params))
          if (method === 'get_bom_version') {
            if (rejectRead) {
              rejectRead = false
              return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '读取失败' } } })
            }
            const record = records.find((bom) => bom.id === params.id)
            if (mode === 'stale') record.status = 'ACTIVE'
            return reply(route, id, { bom_version: record })
          }
          if (method === 'save_bom_with_items') {
            writes.push({ method, params })
            const record = { ...structuredClone(original), ...params, id: params.id || 4, edit_version: original.edit_version + 1, status: 'DRAFT' }
            records = [...records.filter((bom) => bom.id !== record.id), record]
            return reply(route, id, { bom_version: record })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        page.setDefaultTimeout(10000)
        await page.getByText(orderNo, { exact: true }).first().click()
        if (mobile) await page.getByRole('button', { name: /更多操作/u }).click()
        await page.getByRole('button', { name: '工程资料', exact: true }).click()
        const engineering = page.locator('[data-business-form-page]').filter({ has: page.locator('.erp-sales-order-engineering-form') })
        await engineering.waitFor()
        const editor = page.locator('.erp-bom-editor:visible')
        deps.assert.equal(new URL(page.url()).pathname, '/erp/sales/project-orders/sales-orders', 'all editing remains in the business workspace')
        deps.assert.equal(await engineering.getByRole('button', { name: '返回办理', exact: true }).count(), 0)
        deps.assert.equal(await engineering.getByRole('button', { name: '返回工程资料', exact: true }).count(), 0)
        if (mode === 'multiple') {
          const choose = engineering.locator('.erp-sales-order-engineering-form').getByLabel('工程 BOM', { exact: true })
          await choose.click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: 'V3（草稿）' }).click()
        }
        await chooseWorkspaceEditor(page, 'bom')
        await editor.getByLabel('BOM 版本', { exact: true }).waitFor()
        if (mode === 'read-failure') {
          const failure = editor.getByRole('alert')
          await failure.waitFor()
          deps.assert.equal(writes.length, 0)
          await failure.getByRole('button', { name: '重新读取', exact: true }).click()
        }
        if (mode === 'stale') {
          await editor.getByRole('heading', { name: /查看 BOM 版本.*只读/u }).waitFor()
          deps.assert.equal(await editor.getByRole('button', { name: '保存草稿', exact: true }).count(), 0)
        } else {
          await page.waitForFunction(() => document.querySelector('.erp-bom-editor')?.getAttribute('aria-busy') === 'false')
          if (mode === 'create') {
            deps.assert.equal(await editor.getByLabel('来源订单号', { exact: true }).inputValue(), orderNo)
            deps.assert.equal(await editor.getByLabel('订单数量', { exact: true }).inputValue(), '102')
            await editor.getByLabel('BOM 版本', { exact: true }).fill('V1')
          } else {
            deps.assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), mode === 'multiple' ? 'V3' : 'V2')
          }
          await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
          await page.waitForFunction(() => document.querySelector('.erp-bom-editor')?.getAttribute('data-unsaved') === 'false')
          const saved = writes.find((call) => call.method === 'save_bom_with_items')
          deps.assert.ok(saved)
          deps.assert.equal(saved.params.product_id, 1)
          deps.assert.equal(await editor.isVisible(), true, 'saving retains the complete workspace')
          deps.assert.equal(writes.filter((call) => call.method === 'save_sales_order_engineering').length, 0, 'saving a BOM does not silently save order source changes')
          if (mode === 'create') {
            await chooseWorkspaceEditor(page, 'engineering')
            const selection = engineering.locator('.erp-sales-order-engineering-form').getByLabel('工程 BOM', { exact: true })
            await engineering.getByRole('button', { name: '保存工程资料', exact: true }).click()
            await page.locator('.ant-message-error').waitFor()
            deps.assert.equal(await selection.isVisible(), true, 'failed engineering save preserves the source form')
            deps.assert.equal(writes.filter((call) => call.method === 'save_sales_order_engineering').length, 0)
            await engineering.getByRole('button', { name: '保存工程资料', exact: true }).click()
            await engineering.waitFor({ state: 'hidden' })
            deps.assert.equal(writes.filter((call) => call.method === 'save_sales_order_engineering').length, 1)
          }
        }
        await deps.assertNoHorizontalOverflow(page)
        await page.screenshot({ path: deps.path.join(deps.outputDir, `engineering-bom-entry-${mode}.png`), animations: 'disabled' })
      },
    }
  })
}
