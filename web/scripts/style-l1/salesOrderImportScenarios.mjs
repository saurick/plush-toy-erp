import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { createSalesOrderWorkbook } from './salesOrderImportWorkbookFixture.mjs'
import { parseSalesOrderXlsx } from '../../src/erp/utils/salesOrderXlsxImport.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createSalesOrderImportScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    outputDir,
  } = deps
  const importPath = '/erp/sales/project-orders/sales-orders'
  function scenario(name, failSecond = false) {
    let parsed,
      file,
      customers,
      savedOrders,
      savedItems,
      mutations,
      attachments,
      failedOnce
    return {
      name,
      path: importPath,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        const filePath = !failSecond && process.env.SALES_ORDER_IMPORT_TEST_FILE
        const buffer = filePath
          ? await fs.readFile(filePath)
          : createSalesOrderWorkbook({
              cellImages: [
                {
                  id: 'untrusted',
                  bytes: Buffer.from(
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a0VEAAAAASUVORK5CYII=',
                    'base64'
                  ),
                },
              ],
            })
        file = {
          name: filePath ? path.basename(filePath) : '模拟销售订单.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer,
        }
        parsed = await parseSalesOrderXlsx(buffer, { fileName: file.name })
        customers = [
          ...new Set(parsed.orders.map((order) => order.customer)),
        ].map((name, index) => ({
          id: index + 1,
          code: name,
          name: `模拟客户 ${index + 1}`,
          is_active: true,
        }))
        savedOrders = []
        savedItems = []
        mutations = []
        attachments = []
        failedOnce = false
        const respond = (route, id, data, code = 0) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: code
                ? { code, message: '订单暂时无法保存' }
                : styleRpcResult(data),
            }),
          })
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'list_customers')
            return respond(
              route,
              id,
              stylePaginatedRpcData(customers, 'customers', params)
            )
          return route.fallback()
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          let data
          if (method === 'save_sales_order_with_items') {
            mutations.push(params)
            if (
              failSecond &&
              params.order_no === parsed.orders[1].order_no &&
              !failedOnce
            ) {
              failedOnce = true
              return respond(route, id, {}, 400)
            }
            const order = {
              ...params,
              id: 100 + savedOrders.length,
              lifecycle_status: 'draft',
              version: 1,
              order_date: Date.parse(params.order_date) / 1000,
              item_count: params.items.length,
            }
            delete order.items
            savedOrders.push(order)
            const items = params.items.map((item, index) => ({
              ...item,
              id: order.id * 1000 + index,
              sales_order_id: order.id,
              line_status: 'open',
              planned_delivery_date: item.planned_delivery_date
                ? Date.parse(item.planned_delivery_date) / 1000
                : null,
              unshipped_quantity: item.ordered_quantity,
            }))
            savedItems.push(...items)
            data = { sales_order: order, sales_order_items: items }
          } else if (method === 'list_sales_orders')
            data = stylePaginatedRpcData(savedOrders, 'sales_orders', params)
          else if (method === 'get_sales_order')
            data = {
              sales_order: savedOrders.find((order) => order.id === params.id),
            }
          else if (method === 'list_sales_order_items')
            data = stylePaginatedRpcData(
              savedItems.filter(
                (item) => item.sales_order_id === params.sales_order_id
              ),
              'sales_order_items',
              params
            )
          else return route.fallback()
          return respond(route, id, data)
        })
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'list_attachments')
            return respond(route, id, {
              attachments: attachments.filter(
                (item) =>
                  item.owner_type === params.owner_type &&
                  item.owner_id === params.owner_id
              ),
            })
          if (method === 'upload_attachment') {
            const attachment = {
              ...params,
              id: 5000 + attachments.length,
              sha256: createHash('sha256')
                .update(Buffer.from(params.content_base64, 'base64'))
                .digest('hex'),
            }
            attachments.push(attachment)
            return respond(route, id, { attachment })
          }
          if (method === 'download_attachment')
            return respond(route, id, {
              attachment: attachments.find((item) => item.id === params.id),
            })
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '销售订单', exact: true })
          .waitFor()
        const input = page.locator('[data-sales-order-import-input]')
        await page.waitForFunction(
          () =>
            !Array.from(document.querySelectorAll('button')).find((node) =>
              node.textContent.includes('导入 Excel')
            )?.disabled
        )
        await input.setInputFiles({
          name: 'invalid.xlsx',
          mimeType: file.mimeType,
          buffer: Buffer.from('invalid'),
        })
        await page.getByText(/不是有效的 .xlsx/u).waitFor()
        assert.equal(mutations.length, 0)
        await input.setInputFiles(file)
        const picker = page.getByRole('dialog', { name: /导入销售订单 Excel/u })
        await picker.waitFor()
        await picker
          .getByText(
            `已识别 ${parsed.orders.length} 张订单、${parsed.lineCount} 条明细。可多选或全选，展开订单核对明细，再批量保存草稿。`,
            { exact: true }
          )
          .waitFor()
        assert.equal(
          await picker
            .getByRole('button', { name: '核对所选订单', exact: true })
            .isDisabled(),
          true
        )
        await picker.getByRole('button', { name: /取\s*消/u }).click()
        assert.equal(mutations.length, 0)
        await input.setInputFiles(file)
        await picker.waitFor()
        await picker.locator('.ant-table-row-expand-icon').first().click()
        await picker
          .getByText(parsed.orders[0].lines[0].item.requested_product_name, {
            exact: true,
          })
          .waitFor()
        await picker.locator('img').first().waitFor()
        await picker
          .getByRole('combobox', { name: '原表缺少单位时使用' })
          .click()
        await page
          .locator(
            '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
          )
          .first()
          .click()
        await picker
          .getByRole('combobox', { name: '原表缺少币种时使用' })
          .click()
        await page
          .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .getByText(/人民币/u)
          .click()
        await picker
          .getByRole('button', { name: '全选筛选结果', exact: true })
          .click()
        await picker.screenshot({
          path: path.join(outputDir, 'sales-order-batch-preview.png'),
        })
        await picker
          .getByRole('button', { name: '核对所选订单', exact: true })
          .click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.waitFor()
        assert.equal(mutations.length, 0)
        const chooseOrder = async (position) => {
          const select = editor.getByRole('combobox', { name: '切换导入订单' })
          await select.fill(parsed.orders[position].order_no)
          await page
            .locator(
              '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
            )
            .filter({ hasText: parsed.orders[position].order_no })
            .click()
          await page.waitForFunction(
            (number) =>
              document.querySelector(
                '.erp-business-form-page:not([hidden]) #order_no'
              )?.value === number,
            parsed.orders[position].order_no
          )
        }
        for (const [position, order] of parsed.orders.entries()) {
          if (position > 0) await chooseOrder(position)
          assert.equal(
            await editor.locator('.erp-sales-order-lines-form__row').count(),
            order.lines.length
          )
          for (const [i, line] of order.lines.entries()) {
            for (const key of [
              'requested_product_name',
              'customer_product_no',
              'ordered_quantity',
              'pre_shipment_sample_quantity',
              'unit_price',
              'process_requirement',
              'note',
            ]) {
              assert.equal(
                await editor.locator(`#items_${i}_${key}`).inputValue(),
                line.item[key] || '',
                `order ${position + 1}, line ${i + 1}: ${key}`
              )
            }
            assert.equal(
              await editor
                .locator('.erp-sales-order-lines-form__row')
                .nth(i)
                .locator('details')
                .getAttribute('open'),
              ''
            )
          }
        }
        await chooseOrder(0)
        if (!process.env.SALES_ORDER_IMPORT_TEST_FILE) {
          const originalNote = parsed.orders[0].lines[0].item.note || ''
          await editor.locator('#items_0_note').fill('模拟逐单编辑保留校验')
          await editor.locator('#contact_email').fill('invalid-email')
          await chooseOrder(1)
          await editor.getByRole('button', { name: `保存全部 ${parsed.orders.length} 张草稿`, exact: true }).click()
          await editor.getByRole('alert').getByText('待补齐', { exact: true }).waitFor()
          await page.waitForFunction((number) => document.querySelector('.erp-business-form-page:not([hidden]) #order_no')?.value === number, parsed.orders[0].order_no)
          assert.equal(mutations.length, 0)
          assert.equal(await editor.locator('#items_0_note').inputValue(), '模拟逐单编辑保留校验')
          await editor.locator('#contact_email').fill('')
          await editor.locator('#items_0_note').fill(originalNote)
        }
        await editor
          .getByRole('button', {
            name: `核对原表：${parsed.orders[0].lines[0].sheetName} 第 ${parsed.orders[0].lines[0].rowNumber} 行`,
            exact: true,
          })
          .click()
        await page.getByText('首次导入的原表内容', { exact: true }).waitFor()
        await page
          .getByText(parsed.orders[0].lines[0].item.requested_product_name, {
            exact: true,
          })
          .last()
          .waitFor()
        await editor
          .getByRole('button', {
            name: `核对原表：${parsed.orders[0].lines[0].sheetName} 第 ${parsed.orders[0].lines[0].rowNumber} 行`,
            exact: true,
          })
          .click()
        await page
          .locator('.ant-popover:not(.ant-popover-hidden)')
          .waitFor({ state: 'hidden' })
        await editor.getByRole('heading', { name: '批量导入销售订单' }).click()
        await page
          .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
          .waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page, 'sales-order-batch-editor')
        await editor
          .getByRole('heading', { name: '批量导入销售订单' })
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(outputDir, 'sales-order-batch-editor.png'),
        })
        await editor
          .getByRole('button', {
            name: `保存全部 ${parsed.orders.length} 张草稿`,
            exact: true,
          })
          .click()
        if (failSecond) {
          await editor.getByText('保存失败', { exact: true }).waitFor()
          assert.equal(savedOrders.length, parsed.orders.length - 1)
          await editor
            .getByRole('button', {
              name: '重试未完成项 / 核对结果',
              exact: true,
            })
            .click()
        }
        await editor
          .getByText(
            `含图片已完成 ${parsed.orders.length} / ${parsed.orders.length} 张`,
            { exact: true }
          )
          .waitFor()
        assert.equal(savedOrders.length, parsed.orders.length)
        assert.equal(savedItems.length, parsed.lineCount)
        assert.equal(
          attachments.length,
          parsed.orders.reduce(
            (count, order) =>
              count +
              order.lines.reduce(
                (total, line) => total + line.images.length,
                0
              ),
            0
          )
        )
        for (const order of parsed.orders) {
          const attempts = mutations.filter(
            (params) => params.order_no === order.order_no
          )
          assert.equal(
            attempts.length,
            failSecond && order === parsed.orders[1] ? 2 : 1
          )
          const sent = attempts.at(-1)
          assert.equal(sent.id, undefined)
          assert.equal(sent.items.length, order.lines.length)
          sent.items.forEach((item, index) => {
            const expected = order.lines[index].item
            for (const key of [
              'requested_product_name',
              'customer_product_no',
              'ordered_quantity',
              'pre_shipment_sample_quantity',
              'unit_price',
              'order_category',
              'planned_delivery_date',
              'note',
              'process_requirement',
            ])
              assert.equal(item[key] || '', expected[key] || '', `saved ${key}`)
            assert.deepEqual(item.import_source, expected.import_source)
            assert.equal(item.product_id, undefined)
            assert.equal(item.product_sku_id, undefined)
          })
        }
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })
        await page.locator('.ant-table-tbody > tr[data-row-key]').filter({ hasText: parsed.orders[0].order_no }).first().click()
        await page.getByRole('button', { name: /编辑订单$/u }).click()
        await editor.getByRole('heading', { name: '编辑销售订单', exact: true }).waitFor()
        assert.equal(await editor.locator('.erp-sales-order-lines-form__row').count(), parsed.orders[0].lines.length)
        await editor.locator('img[alt="订单产品原表图片"]').first().waitFor()
        const sourceButton = editor.getByRole('button', { name: `核对原表：${parsed.orders[0].lines[0].sheetName} 第 ${parsed.orders[0].lines[0].rowNumber} 行`, exact: true })
        await sourceButton.click()
        await page.getByText('首次导入的原表内容', { exact: true }).waitFor()
        await sourceButton.click()
        await editor.getByRole('button', { name: '返回列表', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: /新建订单/u }).click()
        await editor.waitFor()
        assert.equal(
          await editor.locator('.erp-sales-order-lines-form__row').count(),
          0
        )
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
      },
    }
  }
  return [
    scenario('sales-order-xlsx-import-desktop'),
    scenario('sales-order-xlsx-import-partial-failure', true),
    {
      name: 'sales-order-xlsx-import-no-permission',
      path: importPath,
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: customerRuntimeEffectiveSession.actions.filter(
          (action) => action !== 'sales_order.create'
        ),
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '销售订单', exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '导入 Excel', exact: true })
            .count(),
          0
        )
      },
    },
  ]
}
