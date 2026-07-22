import { styleRpcResult } from './rpcMockResult.mjs'

const HEADER_NOTE = '仅修改订单头备注，不改变历史未分配规格'

async function fulfillRpc(route, id, data) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: styleRpcResult(data),
    }),
  })
}

function historicalUnallocatedLine(
  id,
  lineNo,
  {
    productCodeSnapshot = '',
    productNameSnapshot = `历史未分规格产品 ${lineNo}`,
    skuCodeSnapshot = '',
    colorSnapshot = '',
  } = {}
) {
  return {
    id,
    sales_order_id: 1,
    line_no: lineNo,
    product_id: 1,
    product_sku_id: null,
    product_code_snapshot: productCodeSnapshot,
    product_name_snapshot: productNameSnapshot,
    sku_code_snapshot: skuCodeSnapshot,
    color_snapshot: colorSnapshot,
    ordered_quantity: '10',
    unit_id: 1,
    unit_name_snapshot: '只',
    unit_price: '12.50',
    amount: '125.00',
    line_status: 'open',
    note: '',
  }
}

export function createSalesOrderSkuGrainScenarios(deps) {
  const {
    assert,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
  } = deps
  let activeAttempt = null

  return [
    {
      name: 'sales-order-historical-null-sku-preserved-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const attempt = { saveRequests: [] }
        activeAttempt = attempt

        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'sales-order-null-sku-masterdata', method } = body
          if (method !== 'list_product_skus') {
            await route.fallback()
            return
          }

          await fulfillRpc(route, id, {
            product_skus: [
              {
                id: 101,
                product_id: 1,
                sku_code: 'SKU-NULL-CANDIDATE-A',
                sku_name: '未分规格候选 A',
                color: '棕色',
                default_unit_id: 1,
                is_active: true,
              },
              {
                id: 102,
                product_id: 1,
                sku_code: 'SKU-NULL-CANDIDATE-B',
                sku_name: '未分规格候选 B',
                color: '蓝色',
                default_unit_id: 1,
                is_active: true,
              },
            ],
            total: 2,
            limit: 200,
            offset: 0,
          })
        })

        await page.route('**/rpc/sales_order', async (route) => {
          const body = route.request().postDataJSON() || {}
          const {
            id = 'sales-order-null-sku-order',
            method,
            params = {},
          } = body
          if (method === 'list_sales_order_items') {
            await fulfillRpc(route, id, {
              sales_order_items: [
                historicalUnallocatedLine(1, 1, {
                  productCodeSnapshot: 'SKU-NULL-CANDIDATE-A',
                  productNameSnapshot: '未分规格候选 A 历史快照',
                  skuCodeSnapshot: 'SKU-NULL-CANDIDATE-A',
                  colorSnapshot: '棕色',
                }),
                historicalUnallocatedLine(2, 2),
              ],
              total: 2,
              limit: Number(params.limit || 50),
              offset: Number(params.offset || 0),
            })
            return
          }
          if (method === 'save_sales_order_with_items') {
            attempt.saveRequests.push(params)
          }
          await route.fallback()
        })
      },
      verify: async (page) => {
        const attempt = activeAttempt
        if (!attempt) throw new Error('销售订单 SKU 粒度场景缺少当前尝试状态')

        await expectHeading(page, '销售订单')
        await expectText(page, 'SO-STYLE-L1')
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await page.getByRole('button', { name: '编辑订单' }).click()
        const modal = page
          .getByRole('dialog')
          .filter({ hasText: '编辑销售订单' })
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        const lineRows = modal.locator('.erp-sales-order-lines-form__row')
        await lineRows.nth(1).waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(await lineRows.count(), 2)

        for (const lineIndex of [0, 1]) {
          assert.equal(
            await lineRows
              .nth(lineIndex)
              .locator('.erp-line-item-field--source .ant-select-selection-item')
              .count(),
            0,
            `历史 NULL 订单行 ${lineIndex + 1} 在显式选择前不得自动选中 SKU`
          )
        }

        const secondLineSKUSelect = lineRows
          .nth(1)
          .locator('.erp-line-item-field--source .ant-select-selector')
        await secondLineSKUSelect.click()
        const explicitOption = page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: 'SKU-NULL-CANDIDATE-B' })
          .first()
        await explicitOption.waitFor({ state: 'visible', timeout: 10_000 })
        await explicitOption.click()
        await lineRows
          .nth(1)
          .locator('.ant-select-selection-item')
          .filter({ hasText: 'SKU-NULL-CANDIDATE-B' })
          .waitFor({ state: 'visible', timeout: 10_000 })

        const headerNoteField = modal.locator(
          '.erp-business-action-form > .erp-business-action-form__field--full',
          { has: page.getByText('备注', { exact: true }) }
        )
        assert.equal(
          await headerNoteField.count(),
          1,
          '场景必须唯一定位销售订单头备注，不能命中订单行备注'
        )
        await headerNoteField.locator('textarea').fill(HEADER_NOTE)
        await modal.locator('.ant-modal-footer .ant-btn-primary').last().click()
        await expectText(page, '销售订单与订单行已更新')
        await modal.waitFor({ state: 'hidden', timeout: 10_000 })

        for (let pollAttempt = 0; pollAttempt < 30; pollAttempt += 1) {
          if (attempt.saveRequests.length > 0) break
          await page.waitForTimeout(100)
        }
        assert.equal(attempt.saveRequests.length, 1)
        assert.equal(attempt.saveRequests[0].note, HEADER_NOTE)
        const savedItems = attempt.saveRequests[0]?.items
        assert.equal(Array.isArray(savedItems), true)
        assert.equal(savedItems.length, 2)
        assert.equal(savedItems[0].id, 1)
        assert.equal(savedItems[0].product_id, 1)
        assert.equal(savedItems[0].unit_id, 1)
        assert.equal(Object.hasOwn(savedItems[0], 'note'), false)
        assert.equal(Object.hasOwn(savedItems[0], 'product_sku_id'), false)
        assert.equal(savedItems[1].id, 2)
        assert.equal(savedItems[1].product_sku_id, 102)
      },
    },
  ]
}
