import { createSalesOrderWorkbook } from './salesOrderImportWorkbookFixture.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createSalesOrderImportValidationScenarios(deps) {
  const { assert } = deps
  let saves = []
  return [
    {
      name: 'sales-order-xlsx-import-save-review',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        saves = []
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          const records =
            method === 'list_customers'
              ? [
                  {
                    id: 1,
                    code: 'CUS-IMPORT-TARGET',
                    name: '模拟匹配客户',
                    is_active: true,
                  },
                ]
              : method === 'list_units'
                ? [
                    {
                      id: 1,
                      code: 'PCS',
                      name: '件',
                      precision: 0,
                      is_active: true,
                    },
                    {
                      id: 2,
                      code: 'M',
                      name: '米',
                      precision: 2,
                      is_active: true,
                    },
                  ]
                : null
          if (!records) return route.fallback()
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(
                stylePaginatedRpcData(
                  records,
                  method === 'list_customers' ? 'customers' : 'units',
                  params
                )
              ),
            },
          })
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'save_sales_order_with_items') return route.fallback()
          saves.push(params)
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult({
                sales_order: {
                  ...params,
                  id: 900 + saves.length,
                  lifecycle_status: 'draft',
                  version: 1,
                },
                sales_order_items: params.items.map((item, index) => ({
                  ...item,
                  id: (900 + saves.length) * 1000 + index,
                  sales_order_id: 900 + saves.length,
                  line_status: 'open',
                })),
              }),
            },
          })
        })
      },
      verify: async (page) => {
        await deps.expectHeading(page, '销售订单')
        await page
          .getByRole('button', { name: '导入 Excel', exact: true })
          .waitFor()
        await page.waitForFunction(
          () =>
            !document.querySelector('button[aria-label="导入 Excel"]').disabled
        )
        await page.locator('[data-sales-order-import-input]').setInputFiles({
          name: '模拟缺项订单.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createSalesOrderWorkbook({
            sheets: [
              {
                name: '订单',
                rows: [
                  [
                    '订单编号',
                    '客户',
                    '下单日期',
                    '产品名称',
                    '订单数量',
                    '单位',
                    '币种',
                  ],
                  [
                    'SO-REVIEW-001',
                    '未关联客户',
                    '2026-09-01',
                    '模拟产品甲',
                    2,
                  ],
                  [
                    'SO-REVIEW-001',
                    '未关联客户',
                    '2026-09-01',
                    '模拟产品乙',
                    3,
                  ],
                  [
                    'SO-REVIEW-002',
                    '未关联客户',
                    '2026-09-01',
                    '模拟产品丙',
                    4,
                  ],
                ],
              },
            ],
          }),
        })
        const picker = page.getByRole('dialog', { name: /导入销售订单 Excel/u })
        await picker
          .getByRole('button', { name: '全选筛选结果', exact: true })
          .click()
        await picker
          .getByRole('button', { name: '核对所选订单', exact: true })
          .click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        const issues = editor.locator('[data-sales-import-issue-count]')
        const save = editor.getByRole('button', {
          name: '保存全部 2 张草稿',
          exact: true,
        })
        const select = async (id, text) => {
          const input = editor.locator(`input#${id}`)
          await input.press('ArrowDown')
          await input.press('Enter')
          await editor.locator(`.ant-select:has(input#${id}) .ant-select-selection-item`)
            .filter({ hasText: text }).waitFor()
        }
        const waitForCount = (count) =>
          editor.locator(`[data-sales-import-issue-count="${count}"]`).waitFor()
        const waitForFocus = async (id) => {
          try {
            await page.waitForFunction(
              (expected) => document.activeElement?.id === expected,
              id,
              { timeout: 5000 }
            )
          } catch (error) {
            const state = await editor.evaluate((node) => ({
              active: document.activeElement?.id || document.activeElement?.tagName,
              order: node.querySelector('#order_no')?.value,
              busy: node.getAttribute('aria-busy'),
              errors: [...node.querySelectorAll('.ant-form-item-has-error')].map((field) => ({
                id: field.querySelector('input,textarea')?.id,
                text: field.textContent,
              })),
            }))
            throw new Error(`Expected focus ${id}: ${JSON.stringify(state)}`, { cause: error })
          }
        }
        await waitForCount(4)
        await save.click()
        await waitForFocus('customer_id')
        assert.equal(
          await issues.getAttribute('data-sales-import-issue-count'),
          '4'
        )
        const initialText = await issues.innerText()
        assert.equal((initialText.match(/客户/gu) || []).length, 1)
        assert.equal((initialText.match(/币种/gu) || []).length, 1)
        assert.equal((initialText.match(/请选择单位/gu) || []).length, 2)
        assert.equal(saves.length, 0)
        await issues.screenshot({
          path: `${deps.outputDir}/sales-import-missing-fields.png`,
        })

        await select('customer_id', 'CUS-IMPORT-TARGET')
        await waitForCount(3)
        await select('currency', '人民币')
        await select('items_0_unit_id', '件')
        await select('items_1_unit_id', '件')
        await issues.waitFor({ state: 'hidden' })
        await editor
          .locator('.ant-select:has(input#customer_id) .ant-select-clear')
          .click({ force: true })
        await waitForCount(1)
        await select('customer_id', 'CUS-IMPORT-TARGET')
        await issues.waitFor({ state: 'hidden' })

        await editor.locator('#contact_email').fill('invalid-email')
        await editor
          .getByRole('button', { name: '下一单', exact: true })
          .click()
        await waitForCount(3)
        await save.click()
        await waitForFocus('contact_email')
        assert.equal(
          await editor.locator('#order_no').inputValue(),
          'SO-REVIEW-001'
        )
        assert.equal(
          await issues.getAttribute('data-sales-import-issue-count'),
          '1'
        )
        assert.equal(saves.length, 0)
        await editor.locator('#contact_email').fill('')
        await issues.waitFor({ state: 'hidden' })
        await save.click()
        await waitForFocus('customer_id')
        assert.equal(
          await editor.locator('#order_no').inputValue(),
          'SO-REVIEW-002'
        )
        assert.equal(saves.length, 0)

        await select('customer_id', 'CUS-IMPORT-TARGET')
        await select('currency', '人民币')
        await select('items_0_unit_id', '件')
        await issues.waitFor({ state: 'hidden' })
        await editor.locator('#items_0_ordered_quantity').fill('0')
        await save.click()
        await waitForFocus('items_0_ordered_quantity')
        assert.equal(
          await issues.getAttribute('data-sales-import-issue-count'),
          '1'
        )
        assert.equal(saves.length, 0)
        await editor.locator('#items_0_ordered_quantity').fill('4')
        await issues.waitFor({ state: 'hidden' })
        await save.click()
        await editor
          .getByText('含图片已完成 2 / 2 张', { exact: true })
          .waitFor()
        assert.equal(saves.length, 2)
        assert.deepEqual(
          saves.map((order) => order.items.length),
          [2, 1]
        )
        assert.ok(
          saves.every(
            (order) => order.customer_id === 1 && order.currency === 'CNY'
          )
        )
        assert.ok(
          saves
            .flatMap((order) => order.items)
            .every((item) => item.unit_id === 1 && !item.product_id)
        )
        await page.screenshot({
          path: `${deps.outputDir}/sales-import-save-complete.png`,
          fullPage: true,
        })
      },
    },
  ]
}
