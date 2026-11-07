import { expect } from 'playwright/test'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertBusinessFormPage } from './businessFormPageAssertions.mjs'

export function createWarehouseDraftPageScenarios(deps) {
  return [
    ['CYCLE_COUNT', '编辑盘点草稿', '实盘数量', '9'],
    ['TRANSFER', '编辑调拨草稿', '调拨数量', '3'],
    [
      'MANUAL_ADJUSTMENT',
      '编辑人工调整草稿',
      '调整数量（增加填正数，扣减填负数）',
      '-2',
    ],
  ].map(([kind, title, quantityLabel, nextQuantity]) => {
    let record
    let writes
    let posts
    return {
      name: `warehouse-draft-page-${kind.toLowerCase()}`,
      path: '/erp/warehouse/inventory?workspace=operations',
      auth: 'admin',
      effectiveSession: {
        ...deps.customerRuntimeEffectiveSession,
        actions: [
          ...deps.customerRuntimeEffectiveSession.actions,
          'warehouse.adjustment.create',
        ],
      },
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        writes = []
        posts = []
        record = {
          id: 991,
          operation_no: `SIM-DRAFT-${kind}`,
          operation_type: kind,
          status: 'DRAFT',
          version: 1,
          created_by: 1,
          created_at: 1784246400,
          updated_at: 1784246400,
          reason: '模拟草稿核对',
          items: [
            {
              id: 1991,
              line_no: 1,
              subject_type: 'PRODUCT',
              subject_id: 1,
              product_sku_id: 1,
              from_warehouse_id: 1,
              from_lot_id: 402,
              unit_id: 1,
              expected_quantity: '12',
              counted_quantity: kind === 'CYCLE_COUNT' ? '12' : null,
              adjustment_quantity: kind === 'CYCLE_COUNT' ? null : '2',
              to_warehouse_id: kind === 'TRANSFER' ? 2 : null,
              note: '原草稿备注',
            },
          ],
        }
        await page.route('**/rpc/masterdata', async (route) => {
          const { method, params = {}, id } = route.request().postDataJSON()
          if (method !== 'list_warehouses') return route.fallback()
          const warehouses = [1, 2].map((value) => ({
            id: value,
            code: `WH-DRAFT-${value}`,
            name: `模拟成品仓 ${value}`,
            type: 'FINISHED_GOODS',
            is_active: true,
          }))
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(
                stylePaginatedRpcData(warehouses, 'warehouses', params)
              ),
            },
          })
        })
        await page.route('**/rpc/inventory', async (route) => {
          const { method, params = {}, id } = route.request().postDataJSON()
          const fulfill = (data) =>
            route.fulfill({
              json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
            })
          if (method === 'list_inventory_operations')
            { return fulfill(
              stylePaginatedRpcData([record], 'inventory_operations', params)
            ) }
          if (method === 'get_inventory_operation') {
            deps.assert.equal(params.id, record.id)
            return fulfill({ inventory_operation: record })
          }
          if (method === 'post_inventory_operation') posts.push(params)
          if (method !== 'save_inventory_operation_draft')
            { return route.fallback() }
          writes.push(params)
          deps.assert.equal(params.id, record.id)
          deps.assert.equal(params.expected_version, record.version)
          deps.assert.equal(params.items[0].id, record.items[0].id)
          deps.assert.ok(
            Object.keys(params.items[0]).every((key) =>
              [
                'id',
                'counted_quantity',
                'adjustment_quantity',
                'to_warehouse_id',
                'note',
              ].includes(key)
            )
          )
          if (writes.length === 1) return fulfill({})
          record = {
            ...record,
            operation_no: params.operation_no,
            reason: params.reason,
            version: record.version + 1,
            items: record.items.map((row, index) => ({
              ...row,
              ...params.items[index],
            })),
          }
          return fulfill({ inventory_operation: record })
        })
      },
      verify: async (page) => {
        const row = page
          .getByRole('row')
          .filter({ hasText: record.operation_no })
        await row.getByRole('button', { name: '编辑草稿', exact: true }).click()
        const editor = page.locator(
          '.erp-inventory-operation-modal.erp-business-form-page:not([hidden])'
        )
        await editor
          .getByRole('heading', { name: title, exact: true })
          .waitFor()
        await assertBusinessFormPage(page, editor)
        await expect(
          editor.getByLabel('业务原因', { exact: true })
        ).toHaveValue('模拟草稿核对')
        await editor
          .getByLabel(quantityLabel, { exact: true })
          .fill(nextQuantity)
        await editor
          .getByLabel('业务原因', { exact: true })
          .fill('整页核对后的原因')
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await expect(
          editor.getByLabel(quantityLabel, { exact: true })
        ).toHaveValue(nextQuantity)
        const firstSave = page.waitForResponse(
          (response) =>
            response.request().postDataJSON()?.method ===
            'save_inventory_operation_draft'
        )
        await editor
          .getByRole('button', { name: '保存草稿', exact: true })
          .click()
        await firstSave
        await expect(
          editor.getByRole('button', { name: '保存草稿', exact: true })
        ).toBeEnabled()
        await expect(
          editor.getByLabel(quantityLabel, { exact: true })
        ).toHaveValue(nextQuantity)
        await editor
          .getByRole('button', { name: '保存草稿', exact: true })
          .click()
        await expect(editor).not.toBeVisible()
        deps.assert.equal(writes.length, 2)
        deps.assert.deepEqual(writes[0], writes[1])
        deps.assert.equal(record.version, 2)
        deps.assert.equal(record.status, 'DRAFT')
        deps.assert.equal(posts.length, 0)
        await expect(
          row.getByText('整页核对后的原因', { exact: true })
        ).toBeVisible()
        await row.getByRole('button', { name: '编辑草稿', exact: true }).click()
        await expect(
          editor.getByLabel(quantityLabel, { exact: true })
        ).toHaveValue(nextQuantity)
        await editor
          .getByLabel('业务原因', { exact: true })
          .fill('尚未保存的原因')
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await expect(editor).not.toBeVisible()
        await row.getByRole('button', { name: '编辑草稿', exact: true }).click()
        await expect(
          editor.getByLabel('业务原因', { exact: true })
        ).toHaveValue('整页核对后的原因')
        await deps.assertNoHorizontalOverflow(page, `warehouse-draft-${kind}`)
        await page.screenshot({
          path: deps.path.join(
            deps.outputDir,
            `warehouse-draft-${kind}-4k.png`
          ),
          fullPage: true,
        })
      },
    }
  })
}
