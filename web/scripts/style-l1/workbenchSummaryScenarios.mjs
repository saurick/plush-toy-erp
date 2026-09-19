import fs from 'node:fs/promises'
import path from 'node:path'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

const baseActions = ['erp.workbench.read', 'workflow.task.read']
const salesActions = ['sales_order.read', 'sales_order_item.read']
const materialsActions = ['sales_order.read', 'engineering.material.read']

export function createWorkbenchSummaryScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const fixtureRows = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    sales_order_id: 100 + index,
    order_no: `SO-SUM-${index + 1}`,
    customer_name: index === 20 ? '模拟筛选客户' : '模拟普通客户',
    order_date: 1788883200,
    planned_delivery_date: 1789747200,
    requested_product_name: `模拟产品 ${index + 1}`,
    customer_product_no: `STYLE-${index + 1}`,
    product_id: null,
    product_image_attachment_id: null,
    order_category: 'NEW',
    ordered_quantity: '100',
    pre_shipment_sample_quantity: '2',
    production_quantity: '102',
    unshipped_quantity: '60',
    unit_name: '只',
    sales_owner: '模拟业务员',
    lifecycle_status: 'active',
    line_status: 'open',
    designer: null,
    unit_price: '12.5',
    currency: 'CNY',
    process_requirement: '刺绣',
  }))

  function makeScenario(name, actions, mode, dark = false) {
    let calls = []
    let failNext = false
    const allowed = [...new Set([...baseActions, ...actions])]
    const result = {
      name,
      auth: 'admin',
      path:
        mode === 'none'
          ? '/erp/dashboard?view=summary&summary=materials'
          : '/erp/dashboard',
      viewport: { width: dark ? 1100 : 1440, height: 900 },
      themeMode: dark ? 'dark' : 'light',
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'sales', name: '业务' }],
        permissions: allowed,
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['global-dashboard', 'sales-orders'],
        actions: allowed,
      },
      beforeNavigate: async (page) => {
        calls = []
        failNext = false
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (
            ![
              'list_sales_order_summary',
              'list_engineering_material_requests',
              'get_engineering_material_request',
            ].includes(method)
          ) {
            return route.fallback()
          }
          calls.push({ method, params })
          let data
          if (method === 'list_sales_order_summary') {
            if (failNext) {
              failNext = false
              return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id,
                  result: { code: 50000, message: '暂时无法读取汇总' },
                }),
              })
            }
            const rows = fixtureRows
              .filter(
                (row) =>
                  (!params.customer ||
                    row.customer_name.includes(params.customer)) &&
                  (!params.keyword ||
                    row.order_no.includes(params.keyword) ||
                    row.requested_product_name.includes(params.keyword))
              )
              .map((row) => {
                const copy = { ...row }
                if (!allowed.includes('field.sales_commercial.read')) {
                  delete copy.unit_price
                }
                return copy
              })
            data = stylePaginatedRpcData(rows, 'items', params)
          } else if (method === 'list_engineering_material_requests') {
            data = {
              items: [
                {
                  id: 51,
                  sales_order_id: 101,
                  order_no: 'SO-MATERIAL-SUM',
                  order_status: 'active',
                  products: ['模拟小熊'],
                  status: 'REJECTED',
                  submitted_at: '2026-09-15T08:00:00Z',
                },
              ],
              total: 1,
              page: 1,
              limit: 20,
            }
          } else {
            data = {
              id: 51,
              sales_order_id: 101,
              order_no: 'SO-MATERIAL-SUM',
              order_status: 'active',
              status: 'REJECTED',
              version: 1,
              issues: [],
              sources: [],
              items: [],
              purchase_orders: [],
            }
          }
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
      },
      verify: async (page) => {
        await page.locator('[aria-label="工作台任务筛选"]').waitFor()
        assert.equal(calls.length, 0, '默认待办不预取汇总')
        assert.equal(
          await page.locator('aside a[href="/erp/material-summary"]').count(),
          0
        )
        if (mode === 'none') {
          assert.equal(
            await page.getByRole('tab', { name: '汇总', exact: true }).count(),
            0
          )
          await assertNoHorizontalOverflow(page)
          return
        }
        await page.getByRole('tab', { name: '汇总', exact: true }).click()
        const region = page.getByRole('region', { name: '工作台汇总' })
        if (mode === 'materials') {
          await region
            .getByRole('heading', { name: '材料汇总', exact: true })
            .waitFor()
          await region.getByText('SO-MATERIAL-SUM', { exact: true }).waitFor()
          assert.equal(
            await region.getByRole('combobox', { name: '汇总类型' }).count(),
            0
          )
          assert.equal(
            calls.some(({ method }) => method === 'list_sales_order_summary'),
            false
          )
          return
        }
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        assert.equal(
          calls.some(
            ({ method }) => method === 'list_engineering_material_requests'
          ),
          false
        )
        if (mode === 'sales') {
          assert.equal(
            await region.getByRole('combobox', { name: '汇总类型' }).count(),
            0
          )
          assert.equal(
            await region
              .getByRole('columnheader', { name: '单价', exact: true })
              .count(),
            0
          )
        } else {
          await region
            .getByRole('columnheader', { name: '单价', exact: true })
            .waitFor()
        }
        await region.locator('.ant-pagination-item-2').click()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        assert.equal(calls.at(-1).params.offset, 20)
        const customer = region.getByRole('searchbox', {
          name: '搜索客户',
          exact: true,
        })
        await customer.fill('模拟筛选客户')
        await customer.press('Enter')
        await page.waitForFunction(() =>
          document
            .querySelector('.ant-pagination-total-text')
            ?.textContent.includes('共 1 条')
        )
        assert.equal(calls.at(-1).params.offset, 0)
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          region
            .getByRole('button', { name: '导出当前筛选', exact: true })
            .click(),
        ])
        const csv = await fs.readFile(await download.path(), 'utf8')
        assert(csv.includes('模拟产品 21') && !csv.includes('模拟产品 20'))
        assert.equal(csv.includes('单价'), mode !== 'sales')
        await page.getByRole('tab', { name: '待办', exact: true }).click()
        await page.locator('[aria-label="工作台任务筛选"]').waitFor()
        await page.getByRole('tab', { name: '汇总', exact: true }).click()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        assert.equal(await customer.inputValue(), '模拟筛选客户')
        failNext = true
        await region.getByRole('button', { name: '刷新', exact: true }).click()
        await region
          .getByRole('button', { name: '重新加载', exact: true })
          .waitFor()
        assert.equal(
          await region.getByText('模拟产品 21', { exact: true }).count(),
          0
        )
        await region
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        await customer.fill('没有这家客户')
        await customer.press('Enter')
        await region
          .getByText('暂无符合条件的销售订单明细', { exact: true })
          .waitFor()
        await customer.fill('模拟筛选客户')
        await customer.press('Enter')
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        await page.waitForFunction(() =>
          [
            ...document.querySelectorAll(
              '.erp-workbench-summaries .ant-spin-container'
            ),
          ].every((node) => getComputedStyle(node).opacity === '1')
        )
        await assertNoHorizontalOverflow(page)
        if (mode === 'both') {
          await page.screenshot({
            path: path.join(outputDir, `${name}-sales.png`),
            fullPage: true,
          })
          await region
            .locator('.erp-workbench-summaries__heading .ant-select-selector')
            .click()
          await page
            .locator(
              '.ant-select-dropdown:visible .ant-select-item-option-content'
            )
            .getByText('材料汇总', { exact: true })
            .click()
          await region.getByText('SO-MATERIAL-SUM', { exact: true }).waitFor()
          await region
            .getByRole('button', { name: '查看材料汇总', exact: true })
            .click()
          await page.getByRole('dialog').waitFor()
          await assertBusinessModalViewport(page, page.getByRole('dialog'), {
            label: 'engineering-material-summary',
            minWidthRatio: 0.9,
            maxWidth: 1800,
          })
          assert.equal(calls.at(-1).method, 'get_engineering_material_request')
          assert.equal(calls.at(-1).params.request_id, 51)
          assert.equal(calls.at(-1).params.sales_order_id, 101)
          assert.equal(
            await page
              .getByRole('dialog')
              .getByRole('button', { name: /提交|批准采购|审核通过|重新整理/u })
              .count(),
            0
          )
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Close', exact: true })
            .click()
          await assertNoHorizontalOverflow(page)
        }
      },
    }
    return result
  }
  return [
    makeScenario(
      'erp-workbench-summaries-desktop',
      [
        ...salesActions,
        ...materialsActions,
        'field.sales_commercial.read',
        'field.finance_settlement.read',
        'engineering.material.submit',
      ],
      'both'
    ),
    makeScenario(
      'erp-workbench-summary-sales-limited-dark',
      salesActions,
      'sales',
      true
    ),
    makeScenario(
      'erp-workbench-summary-materials-only',
      materialsActions,
      'materials'
    ),
    makeScenario('erp-workbench-summary-unrelated-role', [], 'none'),
  ]
}
