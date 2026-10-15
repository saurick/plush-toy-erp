import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createBOMPreparationScenarios(deps) {
  return ['create', 'draft-mobile', 'multiple', 'readonly-mobile', 'stale', 'read-failure'].map((mode) => {
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
        item = { id: 1, sales_order_id: 1, line_no: 1, product_id: 1, product_sku_id: null, sample_bom_id: ['create', 'multiple'].includes(mode) ? null : 2, requested_product_name: '模拟工程产品', ordered_quantity: '100', pre_shipment_sample_quantity: '2', unit_id: 1, unit_price: '10', amount: '1000', line_status: 'open', engineering_status: 'PREPARING' }
        records = mode === 'create' ? [] : [structuredClone(original)]
        if (mode === 'multiple') records.push({ ...structuredClone(original), id: 3, version: 'V3' })
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
        await page.getByRole('button', { name: '工程与打样', exact: true }).click()
        const engineering = page.getByRole('dialog').filter({ hasText: `工程与打样 · ${orderNo}` }).last()
        const action = engineering.getByRole('button', { name: readonly ? '查看 BOM' : mode === 'create' || mode === 'multiple' ? '编制 BOM' : '继续编制', exact: true })
        await action.waitFor()
        const bomGeometry = await engineering.locator('.ant-select:has(input[id$="sample_bom_id"])').evaluate((node) => {
          const box = node.getBoundingClientRect()
          const cell = node.closest('td').getBoundingClientRect()
          return { right: box.right, cellRight: cell.right, width: box.width }
        })
        deps.assert.ok(bomGeometry.width > 0 && bomGeometry.right <= bomGeometry.cellRight + 1, 'BOM 选择框不能覆盖相邻字段')
        if (mode === 'create') {
          await page.screenshot({ path: deps.path.join(deps.outputDir, 'engineering-bom-entry-desktop-4k.png'), animations: 'disabled' })
          await engineering.locator('.erp-optional-field > summary').click()
          await engineering.locator('textarea[id$="sample_note"]').fill('编制前的工程备注')
        }
        await action.click()
        if (mode === 'create') {
          await page.getByRole('button', { name: '继续填写', exact: true }).click()
          deps.assert.equal(writes.length, 0)
          await action.click()
          await page.getByRole('button', { name: '保存并继续', exact: true }).click()
          await page.locator('.ant-message-error').waitFor()
          deps.assert.equal(rejectSave, false)
          deps.assert.equal(writes.length, 0)
          deps.assert.ok(page.url().includes('sales-orders'), '保存失败不能离开工程表单')
          await action.click()
          await page.getByRole('button', { name: '保存并继续', exact: true }).click()
        }
        if (mode === 'multiple') {
          const chooser = page.getByRole('dialog').filter({ hasText: '选择要编制的 BOM' }).last()
          deps.assert.equal(await chooser.getByRole('button', { name: '继续编制', exact: true }).isDisabled(), true)
          deps.assert.equal(await chooser.getByText('新建独立 BOM 草稿').count(), 0)
          await chooser.getByRole('radio', { name: 'V3 · 草稿', exact: true }).check()
          await chooser.getByRole('button', { name: '继续编制', exact: true }).click()
        }
        if (mode === 'read-failure') {
          const failure = page.locator('.ant-alert-error')
          await failure.waitFor()
          deps.assert.equal(writes.length, 0)
          await failure.getByRole('button', { name: '重新读取', exact: true }).click()
        }
        const editor = page.locator('[data-business-form-page]:visible')
        await editor.waitFor()
        deps.assert.ok(page.url().includes(mobile ? '/m/engineering/handle/purchase/material-bom' : '/erp/purchase/material-bom'))
        await editor.getByRole('button', { name: '返回工程与打样', exact: true }).waitFor()
        if (mobile) deps.assert.equal(await page.evaluate(() => window.history.state.usr.workflowTaskNavigation.taskID), 91)
        if (readonly || mode === 'stale') {
          await editor.getByRole('heading', { name: '查看 BOM 版本' }).waitFor()
          deps.assert.equal(await editor.getByRole('button', { name: '保存草稿', exact: true }).count(), 0)
        } else {
          await editor.getByRole('heading', { name: mode === 'create' ? '新建 BOM 草稿' : '编辑 BOM 草稿' }).waitFor()
          if (mode === 'create') {
            deps.assert.equal(await editor.locator('input[id$="source_order_no"]').inputValue(), orderNo)
            deps.assert.equal(await editor.locator('input[id$="quantity_text"]').inputValue(), '102')
            await editor.locator('input[id$="version"]').fill('V1')
          } else {
            deps.assert.equal(await editor.locator('input[id$="version"]').inputValue(), mode === 'multiple' ? 'V3' : 'V2')
          }
          if (mobile) {
            await editor.locator('input[id$="version"]').fill('V2-补充')
            await editor.getByRole('button', { name: '返回工程与打样', exact: true }).click()
            const discard = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' }).last()
            await discard.getByRole('button', { name: '继续编辑', exact: true }).click()
            deps.assert.equal(await editor.locator('input[id$="version"]').inputValue(), 'V2-补充')
          }
          if (mode === 'create' || mobile) {
            await page.waitForFunction(() => !document.querySelector('.ant-message-notice'))
            await page.screenshot({ path: deps.path.join(deps.outputDir, `engineering-bom-editor-${mode}.png`), animations: 'disabled' })
          }
          await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
          await editor.waitFor({ state: 'hidden' })
          const save = writes.find((call) => call.method === 'save_bom_with_items')
          deps.assert.ok(save)
          deps.assert.equal(save.params.product_id, 1)
          if (mode === 'create') deps.assert.equal(writes[0].params.items[0].sample_note, '编制前的工程备注')
        }
        await page.getByRole('button', { name: '返回工程与打样', exact: true }).filter({ visible: true }).click()
        await engineering.waitFor()
        const returnedAction = engineering.getByRole('button', { name: readonly || mode === 'stale' ? '查看 BOM' : '继续编制', exact: true })
        await returnedAction.waitFor()
        if (mobile) deps.assert.equal(await page.evaluate(() => window.history.state.usr.workflowTaskNavigation.taskID), 91)
        deps.assert.equal(writes.filter((call) => call.method === 'save_sales_order_engineering').length, mode === 'create' ? 1 : 0, '返回仅带回 BOM 选择，不自动改写工程资料')
        await deps.assertNoHorizontalOverflow(page)
        if (mobile || mode === 'create') await page.screenshot({ path: deps.path.join(deps.outputDir, `engineering-bom-entry-${mode}.png`), animations: 'disabled' })
      },
    }
  })
}
