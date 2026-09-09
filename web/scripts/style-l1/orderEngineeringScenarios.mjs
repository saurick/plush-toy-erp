import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const fulfill = (route, id, data) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ jsonrpc: '2.0', id, result: styleRpcResult(data) }),
  })

export function createOrderEngineeringScenarios(deps) {
  let calls, request, order, item
  return [
    {
      name: 'sales-order-demand-and-material-approval-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        calls = []
        order = {
          id: 1,
          order_no: 'SO-REQUIREMENT-001',
          customer_id: 1,
          currency: 'CNY',
          customer_snapshot: { name: '模拟定制客户' },
          order_date: 1788883200,
          lifecycle_status: 'draft',
          version: 1,
          item_count: 1,
          tax_mode: 'NONE',
          tax_rate: null,
          freight_terms: 'INCLUDED',
        }
        item = {
          id: 1,
          sales_order_id: 1,
          line_no: 1,
          product_id: null,
          product_sku_id: null,
          requested_product_name: '待开发定制玩偶',
          customer_product_no: 'STYLE-NEW',
          order_category: 'NEW',
          ordered_quantity: '1000',
          pre_shipment_sample_quantity: '12',
          unit_id: 1,
          unit_price: '10',
          amount: '10000',
          line_status: 'open',
          engineering_status: 'PREPARING',
        }
        request = {
          id: 5,
          sales_order_id: 1,
          order_no: order.order_no,
          source_order_version: 4,
          version: 1,
          source_hash: 'a'.repeat(64),
          status: 'PREVIEW',
          issues: [],
          sources: [
            {
              sales_order_item_id: 1,
              line_no: 1,
              product_name: '模拟定制玩偶',
              bom_version: 'V1',
              bom_item_id: 1,
              material_id: 1,
              unit_id: 1,
              position: '身体',
              piece_count: '2',
              unit_usage: '0.1',
              loss_rate: '0.1',
              production_quantity: '1012',
              total_usage: '111.32',
            },
          ],
          purchase_orders: [],
          items: [
            {
              id: 11,
              material_id: 1,
              unit_id: 1,
              supplier_id: 1,
              supplier_name: '模拟厂商',
              supplier_item_no: 'A10',
              color: '01',
              material_name: '短绒',
              unit_name: '米',
              spec: '1.5 米宽',
              required_quantity: '111.32',
            },
          ],
        }
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          switch (method) {
            case 'list_sales_orders':
              return fulfill(
                route,
                id,
                stylePaginatedRpcData([order], 'sales_orders', params)
              )
            case 'get_sales_order':
              return fulfill(route, id, { sales_order: order })
            case 'list_sales_order_items':
              return fulfill(
                route,
                id,
                stylePaginatedRpcData([item], 'sales_order_items', params)
              )
            case 'save_sales_order_with_items':
              calls.push({ method, params })
              item = { ...item, ...params.items[0] }
              order = { ...order, ...params, version: order.version + 1 }
              return fulfill(route, id, {
                sales_order: order,
                sales_order_items: [item],
              })
            case 'save_sales_order_engineering':
              calls.push({ method, params })
              order.version += 1
              return fulfill(route, id, {
                sales_order_id: 1,
                version: order.version,
              })
            case 'get_engineering_material_request':
              return fulfill(route, id, request)
            case 'submit_engineering_material_request':
              request = { ...request, status: 'SUBMITTED', version: 1 }
              calls.push({ method, params })
              return fulfill(route, id, request)
            case 'boss_review_engineering_material_request':
              request = { ...request, status: 'BOSS_APPROVED', version: 2 }
              calls.push({ method, params })
              return fulfill(route, id, request)
            case 'finance_review_engineering_material_request':
              calls.push({ method, params })
              request = {
                ...request,
                status: 'APPROVED',
                version: 3,
                items: request.items.map((line, index) => ({
                  ...line,
                  ...params.items[index],
                })),
                purchase_orders: [{ id: 77, purchase_order_no: 'PO-MR-5-1' }],
              }
              return fulfill(route, id, request)
            default:
              return route.fallback()
          }
        })
      },
      verify: async (page) => {
        await deps.expectHeading(page, '销售订单')
        await page.getByText(order.order_no, { exact: true }).first().dblclick()
        const edit = page
          .getByRole('dialog')
          .filter({ hasText: '编辑销售订单' })
          .last()
        await edit.waitFor({ state: 'visible' })
        await edit
          .locator('input[id$="requested_product_name"]')
          .fill('需求先录入，工程后开发')
        await edit.locator('.ant-modal-footer .ant-btn-primary').last().click()
        try {
          await edit.waitFor({ state: 'hidden', timeout: 12000 })
        } catch (error) {
          throw new Error(
            `${error.message}; validation: ${await edit.locator('.ant-form-item-explain-error').allTextContents()}; alerts: ${await page.locator('[role=alert], .ant-message').allTextContents()}; saves: ${calls.length}`
          )
        }
        const save = calls.find(
          (call) => call.method === 'save_sales_order_with_items'
        )
        deps.assert.ok(save, 'customer requirement must save without a product')
        deps.assert.ok(!save.params.items[0].product_id)
        deps.assert.equal(
          save.params.items[0].pre_shipment_sample_quantity,
          '12'
        )
        await page.getByText(order.order_no, { exact: true }).first().click()
        await page
          .getByRole('button', { name: '工程与打样', exact: true })
          .click()
        const engineering = page
          .getByRole('dialog')
          .filter({ hasText: '工程与打样 ·' })
          .last()
        await engineering
          .locator('.erp-sales-order-engineering-section')
          .waitFor({ state: 'visible' })
        await engineering
          .locator('textarea[id$="sample_note"]')
          .fill('待工程建档，先记录客户的设计要求')
        await engineering.evaluate(async (node) => {
          await Promise.all(
            node
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => {}))
          )
        })
        const engineeringWidth = await engineering
          .locator('.erp-sales-order-engineering-section')
          .evaluate((node) => node.getBoundingClientRect().width)
        await page.screenshot({
          path: `${deps.outputDir}/sales-order-engineering-form.png`,
          fullPage: true,
        })
        const engineeringLayout = await engineering
          .locator('.erp-sales-order-engineering-section')
          .evaluate((node) =>
            Array.from(
              (function* () {
                for (
                  let p = node;
                  p && !p.matches('[role=dialog]');
                  p = p.parentElement
                )
                  yield p
              })()
            ).map((p) => ({
              class: p.className,
              width: p.getBoundingClientRect().width,
              display: getComputedStyle(p).display,
              columns: getComputedStyle(p).gridTemplateColumns,
            }))
          )
        deps.assert.ok(
          engineeringWidth >
            (await engineering.evaluate((node) => node.clientWidth)) * 0.85,
          JSON.stringify(engineeringLayout)
        )
        await engineering
          .locator('.ant-modal-footer .ant-btn-primary')
          .last()
          .click()
        await engineering.waitFor({ state: 'hidden', timeout: 10000 })
        const engineeringSave = calls.find(
          (call) => call.method === 'save_sales_order_engineering'
        )
        deps.assert.ok(engineeringSave)
        deps.assert.equal(engineeringSave.params.items[0].id, 1)
        deps.assert.ok(!engineeringSave.params.items[0].product_id)
        deps.assert.equal(
          engineeringSave.params.items[0].engineering_status,
          'PREPARING'
        )
        await page
          .getByRole('button', { name: '材料汇总与审批', exact: true })
          .click()
        const modal = page
          .getByRole('dialog')
          .filter({ hasText: '材料汇总与审批' })
          .last()
        await modal
          .getByText('111.32', { exact: true })
          .waitFor({ state: 'visible' })
        await modal.locator('.ant-table-row-expand-icon').first().click()
        await modal
          .getByText('身体', { exact: true })
          .waitFor({ state: 'visible' })
        await modal
          .getByRole('button', { name: '提交老板审核', exact: true })
          .click()
        await modal
          .getByRole('button', { name: '审核通过，交财务', exact: true })
          .click()
        await modal.getByLabel('实购数量 1', { exact: true }).fill('110')
        await modal.getByLabel('单价 1', { exact: true }).fill('8.5')
        await modal.getByLabel('到货日期 1', { exact: true }).fill('2026-10-01')
        await modal
          .getByLabel('调整原因 1', { exact: true })
          .fill('经核对使用库存 1.32 米')
        const tableWidth = await modal
          .locator('.erp-engineering-material-review > .ant-table-wrapper')
          .evaluate((node) => node.getBoundingClientRect().width)
        const modalWidth = await modal.evaluate((node) => node.clientWidth)
        deps.assert.ok(
          tableWidth > modalWidth * 0.85,
          'finance material table must occupy the modal row'
        )
        await modal
          .locator('.ant-table-body, .ant-table-content')
          .evaluateAll((nodes) =>
            nodes.forEach((node) => {
              node.scrollLeft = 0
            })
          )
        await page.screenshot({
          path: `${deps.outputDir}/engineering-material-finance-form.png`,
          fullPage: true,
        })
        await modal
          .getByRole('button', { name: '批准并生成采购订单', exact: true })
          .click()
        await modal
          .getByRole('button', { name: 'PO-MR-5-1', exact: true })
          .waitFor({ state: 'visible' })
        const approvals = calls.filter(
          (call) =>
            call.method === 'finance_review_engineering_material_request'
        )
        deps.assert.equal(approvals.length, 1)
        deps.assert.equal(approvals[0].params.items[0].id, 11)
        deps.assert.equal(approvals[0].params.items[0].purchase_quantity, '110')
        deps.assert.equal(approvals[0].params.items[0].unit_price, '8.5')
        deps.assert.ok(
          !Object.hasOwn(approvals[0].params.items[0], 'material_id')
        )
      },
    },
  ]
}
