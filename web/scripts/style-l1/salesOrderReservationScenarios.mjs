import { stylePaginatedRpcData } from './rpcMockResult.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export function createSalesOrderReservationScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  const { findSelectionActionButton } = createBusinessFormalAssertions(deps)
  return [
    (() => {
      let operationalFactMethods = []
      let reservationCreateParams = []
      let salesOrderMethods = []
      return {
        name: 'sales-order-source-reservation-create-desktop',
        path: '/erp/sales/project-orders/sales-orders',
        auth: 'admin',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        adminProfile: {
          username: 'style-l1-sales-order-reservation',
          is_super_admin: true,
          permissions: ['stock.reservation.create'],
        },
        beforeNavigate: async (page) => {
          operationalFactMethods = []
          reservationCreateParams = []
          salesOrderMethods = []
          page.on('request', (request) => {
            if (request.url().includes('/rpc/sales_order')) {
              try {
                const method = request.postDataJSON()?.method
                if (method) salesOrderMethods.push(method)
              } catch {
                // 非 JSON-RPC 请求不参与本断言。
              }
            }
            if (!request.url().includes('/rpc/operational_fact')) return
            try {
              const body = request.postDataJSON() || {}
              if (body.method) operationalFactMethods.push(body.method)
              if (body.method === 'create_stock_reservation_from_sales_order') {
                reservationCreateParams.push(body.params || {})
              }
            } catch {
              // 非 JSON-RPC 请求不参与本断言。
            }
          })

          await page.route('**/rpc/operational_fact', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            const recordKey = {
              list_stock_reservations: 'stock_reservations',
              list_shipments: 'shipments',
            }[method]
            if (!recordKey) {
              await route.fallback()
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: stylePaginatedRpcData([], recordKey, params),
                },
              }),
            })
          })

          await page.route('**/rpc/sales_order', async (route) => {
            const body = route.request().postDataJSON() || {}
            const { id = 'mock-id', method, params = {} } = body
            const salesOrder = {
              id: 1,
              order_no: 'SO-RESERVE-L1',
              customer_id: 1,
              customer_snapshot: {
                id: 1,
                code: 'CUS-STYLE-L1',
                name: '暗色客户',
              },
              customer_order_no: 'PO-RESERVE-L1',
              title: '库存预留样式订单',
              order_date: 1_784_000_000,
              expected_ship_date: 1_784_086_400,
              lifecycle_status: 'active',
              version: 3,
              note: '',
              created_at: 1_784_000_000,
              updated_at: 1_784_000_000,
            }
            const salesOrderItem = {
              id: 1,
              sales_order_id: 1,
              line_no: 1,
              product_id: 1,
              product_sku_id: 1,
              product_code_snapshot: 'PROD-STYLE-L1',
              product_name_snapshot: '样式产品',
              sku_code_snapshot: 'SKU-STYLE-L1',
              color_snapshot: '深棕',
              ordered_quantity: '10',
              unit_id: 1,
              unit_name_snapshot: '只',
              unit_price: '12.50',
              amount: '125.00',
              line_status: 'open',
              note: '',
              created_at: 1_784_000_000,
              updated_at: 1_784_000_000,
            }
            let data
            if (method === 'list_sales_orders') {
              data = {
                sales_orders: [salesOrder],
                total: 1,
                limit: Number(params.limit || 100),
                offset: Number(params.offset || 0),
              }
            } else if (method === 'get_sales_order') {
              data = { sales_order: salesOrder }
            } else if (method === 'list_sales_order_items') {
              data = {
                sales_order_items: [salesOrderItem],
                total: 1,
                limit: Number(params.limit || 100),
                offset: Number(params.offset || 0),
              }
            } else {
              await route.fallback()
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 0, message: 'OK', data },
              }),
            })
          })
        },
        verify: async (page) => {
          await expectHeading(page, '销售订单')
          await page
            .getByText('SO-RESERVE-L1', { exact: false })
            .first()
            .click()
          const reserveButton = await findSelectionActionButton(
            page,
            '预留库存'
          )
          await reserveButton.click()

          const modal = page
            .locator('.ant-modal')
            .filter({ hasText: '预留销售订单库存' })
            .last()
          try {
            await modal.waitFor({ state: 'visible', timeout: 10_000 })
          } catch (error) {
            const bodyText = String(
              (await page.locator('body').innerText()) || ''
            ).replace(/\s+/gu, ' ')
            throw new Error(
              `库存预留弹窗未打开: ${JSON.stringify({
                operationalFactMethods,
                salesOrderMethods,
                bodyText: bodyText.slice(0, 2000),
              })}; ${error.message}`
            )
          }
          await modal.getByText('SO-RESERVE-L1', { exact: true }).waitFor()
          await modal
            .getByText(/PROD-STYLE-L1.*样式产品/u)
            .first()
            .waitFor({ timeout: 10_000 })
          const modalText = String((await modal.innerText()) || '').replace(
            /\s+/gu,
            ' '
          )
          assert.match(
            modalText,
            /PROD-STYLE-L1.*样式产品/u,
            `库存预留来源摘要缺少产品: ${modalText}`
          )
          assert.match(
            modalText,
            /SKU-STYLE-L1.*深棕/u,
            `库存预留来源摘要缺少 SKU / 规格: ${modalText}`
          )
          assert.match(
            modalText,
            /单位.*只/u,
            `库存预留来源摘要缺少单位: ${modalText}`
          )
          for (const technicalCopy of [
            'product_id',
            'product_sku_id',
            'unit_id',
            'idempotency_key',
          ]) {
            assert.equal(
              (await modal.getByText(technicalCopy, { exact: true }).count()) >
                0,
              false,
              `库存预留弹窗不应显示技术字段 ${technicalCopy}`
            )
          }
          await modal.getByLabel('本次预留数量').fill('2')
          await modal.locator('textarea').fill('订单备货')
          await modal.screenshot({
            path: path.resolve(
              outputDir,
              'sales-order-source-reservation-create-desktop.png'
            ),
          })
          await modal.getByRole('button', { name: '确认预留' }).click()
          await expectText(page, '库存预留已创建')

          assert.equal(
            reservationCreateParams.length,
            1,
            `应且只应提交一次来源绑定的库存预留: ${JSON.stringify({
              operationalFactMethods,
              reservationCreateParams,
            })}`
          )
          const params = reservationCreateParams[0]
          const allowedKeys = new Set([
            'customer_key',
            'reservation_no',
            'sales_order_id',
            'sales_order_item_id',
            'warehouse_id',
            'lot_id',
            'quantity',
            'reserved_at',
            'note',
            'idempotency_key',
          ])
          assert(
            Object.keys(params).every((key) => allowedKeys.has(key)),
            `库存预留请求包含后端派生字段: ${JSON.stringify(params)}`
          )
          assert.equal(params.customer_key, 'yoyoosun')
          assert.equal(params.sales_order_id, 1)
          assert.equal(params.sales_order_item_id, 1)
          assert.equal(params.warehouse_id, 1)
          assert.equal(params.lot_id, 402)
          assert.equal(params.quantity, '2')
          assert.equal(params.note, '订单备货')
          assert.equal(typeof params.idempotency_key, 'string')
          assert.equal(params.idempotency_key.length > 0, true)
          assert.equal(
            operationalFactMethods.includes('create_stock_reservation'),
            false,
            `不得回退旧库存预留 RPC: ${JSON.stringify(operationalFactMethods)}`
          )
          for (const serverDerivedField of [
            'product_id',
            'product_sku_id',
            'unit_id',
          ]) {
            assert.equal(serverDerivedField in params, false)
          }
          await assertNoHorizontalOverflow(
            page,
            'sales-order-source-reservation-create-desktop'
          )
        },
      }
    })(),
  ]
}
