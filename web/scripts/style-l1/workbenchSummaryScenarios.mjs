import { exerciseTableScrollControls, exerciseTableScrollPagination } from './tableScrollControlAssertions.mjs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { assertTableSemanticAlignment } from './businessTableAssertions.mjs'
import { createMaterialSummaryScenarios } from './materialSummaryScenarios.mjs'

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
            await page
              .getByLabel('工作台视图')
              .getByText('业务汇总', { exact: true })
              .count(),
            0
          )
          await assertNoHorizontalOverflow(page)
          return
        }
        await page
          .getByLabel('工作台视图')
          .getByText('业务汇总', { exact: true })
          .click()
        const region = page.getByRole('region', { name: '工作台汇总' })
        await region.locator('.erp-workbench-summaries__heading > *').waitFor()
        const headingInset = await region.evaluate((node) => {
          const surface = node.getBoundingClientRect()
          const heading = node
            .querySelector('.erp-workbench-summaries__heading > *')
            .getBoundingClientRect()
          return {
            left: heading.left - surface.left,
            top: heading.top - surface.top,
          }
        })
        assert.ok(
          headingInset.left >= 11.5 && headingInset.top >= 9.5,
          `汇总标题或选择器保留左上间距 ${JSON.stringify(headingInset)}`
        )
        if (mode === 'both') {
          const toolbarGeometry = await region
            .locator('.erp-business-operation-panel__command')
            .evaluate((command) => {
              const controls = [
                command.querySelector('.erp-workbench-summaries__heading'),
                command.querySelector('.erp-business-operation-panel__search'),
                command.querySelector('button[aria-haspopup="dialog"]'),
                command.querySelector(
                  '.erp-business-operation-panel__actions .ant-btn'
                ),
              ]
              const boxes = controls.map((control) =>
                control.getBoundingClientRect()
              )
              return {
                tops: boxes.map(({ top }) => top),
                bottoms: boxes.map(({ bottom }) => bottom),
              }
            })
          assert.ok(
            Math.max(...toolbarGeometry.tops) -
              Math.min(...toolbarGeometry.tops) <=
              1 &&
              Math.max(...toolbarGeometry.bottoms) -
                Math.min(...toolbarGeometry.bottoms) <=
                1,
            `汇总类型、搜索、筛选与导出应在同一行 ${JSON.stringify(toolbarGeometry)}`
          )
        }
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
        await assertTableSemanticAlignment(region, {
          scenarioName: name,
          expected: {
            客户: 'left',
            产品名称: 'left',
            订单数量: 'right',
            单位: 'left',
            订单状态: 'left',
          },
        })
        await region
          .getByRole('button', { name: '列设置', exact: true })
          .click()
        const columnSettings = page.getByRole('dialog', { name: /^列设置/u })
        await columnSettings.waitFor()
        assert(
          !(await columnSettings
            .getByRole('checkbox', { name: '工艺', exact: true })
            .isChecked()),
          '工艺仍可按需开启'
        )
        if (mode === 'sales') {
          assert.equal(
            await columnSettings
              .getByRole('checkbox', { name: '单价', exact: true })
              .count(),
            0,
            '列设置不能绕过商业字段权限'
          )
        }
        await columnSettings
          .getByRole('button', { name: '全部显示', exact: true })
          .click()
        const savedColumns = page.waitForResponse(
          (response) =>
            response.url().includes('/rpc/admin') &&
            response.request().postDataJSON()?.method === 'set_erp_column_order'
        )
        await columnSettings.getByRole('button', { name: /^完\s*成$/u }).click()
        await savedColumns
        await columnSettings.waitFor({ state: 'hidden' })
        await region
          .getByRole('columnheader', { name: '工艺', exact: true })
          .waitFor()
        await assertTableSemanticAlignment(region, {
          scenarioName: name,
          expected: { 备注: 'left', 工艺: 'left' },
        })
        const tableCard = region.locator('.erp-business-data-table-card')
        const tableGeometry = await tableCard.evaluate((card) => {
          const wrapper = card.querySelector('.ant-table-wrapper')
          const content = card.querySelector('.ant-table-content')
          const cardBox = card.getBoundingClientRect()
          const wrapperBox = wrapper.getBoundingClientRect()
          return {
            leftInset: wrapperBox.left - cardBox.left,
            topInset: wrapperBox.top - cardBox.top,
            horizontalRange: content.scrollWidth - content.clientWidth,
            pageOverflow: document.documentElement.scrollWidth > innerWidth + 1,
          }
        })
        assert.ok(
          tableGeometry.leftInset >= 11 && tableGeometry.topInset >= 9,
          `${name} 表格应保留左上内边距: ${JSON.stringify(tableGeometry)}`
        )
        assert.equal(tableGeometry.pageOverflow, false)
        const scrollActions = region.getByRole('group', {
          name: '表格横向查看',
        })
        assert.equal(
          await scrollActions.count(),
          Number(tableGeometry.horizontalRange > 2),
          `${name} 横向查看按钮应随溢出显示`
        )
        if (tableGeometry.horizontalRange > 2) {
          await exerciseTableScrollControls(
            page,
            tableCard.locator('.ant-table-wrapper'),
            tableCard.locator('.ant-table-content')
          )
        }
        const search = region.getByRole('searchbox', {
          name: '搜索订单号、产品名称或款号',
        })
        assert.equal(await search.count(), 1, '汇总保留一个主要搜索入口')
        await search.fill('模拟产品 21')
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        assert.equal(calls.at(-1).params.keyword, '模拟产品 21')
        await search.fill('')
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        assert.equal(calls.at(-1).params.keyword, '')
        const filterTrigger = region.locator('button[aria-haspopup="dialog"]')
        await filterTrigger.click()
        const filterDialog = page.getByRole('dialog', { name: '筛选条件' })
        await filterDialog.waitFor()
        assert.equal(
          await filterDialog.getByRole('searchbox').count(),
          2,
          '客户与业务人员筛选在同一浮层'
        )
        const dateRange = filterDialog.locator(
          '.erp-business-date-range-filter'
        )
        assert.deepEqual(
          await dateRange
            .locator('.erp-business-date-input')
            .evaluateAll((nodes) =>
              nodes.map((node) => getComputedStyle(node).borderTopWidth)
            ),
          ['1px', '1px'],
          '起止日期各自保留清晰边框'
        )
        await filterDialog
          .getByRole('button', { name: '完成', exact: true })
          .click()
        await region.locator('.ant-pagination-item-2').scrollIntoViewIfNeeded()
        await exerciseTableScrollPagination(page, {
          wrapper: tableCard.locator('.ant-table-wrapper'),
          trigger: region.locator('.ant-pagination-item-2'),
          ready: region.getByText('模拟产品 21', { exact: true }),
          endpoint: '**/rpc/sales_order', method: 'list_sales_order_summary', offset: 20,
          shorterPage: true,
        })
        assert.equal(calls.at(-1).params.offset, 20)
        await filterTrigger.click()
        const customer = filterDialog.getByRole('searchbox', {
          name: '搜索客户',
          exact: true,
        })
        await customer.fill('模拟筛选客户')
        await customer.press('Enter')
        await filterDialog
          .getByRole('button', { name: '完成', exact: true })
          .click()
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
        await page
          .getByLabel('工作台视图')
          .getByText('待办', { exact: true })
          .click()
        await page.locator('[aria-label="工作台任务筛选"]').waitFor()
        await page
          .getByLabel('工作台视图')
          .getByText('业务汇总', { exact: true })
          .click()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        await filterTrigger.click()
        assert.equal(await customer.inputValue(), '模拟筛选客户')
        await filterDialog
          .getByRole('button', { name: '完成', exact: true })
          .click()
        failNext = true
        await page.getByRole('button', { name: '刷新当前页' }).click()
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
        await filterTrigger.click()
        await customer.fill('没有这家客户')
        await customer.press('Enter')
        await filterDialog
          .getByRole('button', { name: '完成', exact: true })
          .click()
        await region
          .getByText('暂无符合条件的销售订单明细', { exact: true })
          .waitFor()
        await filterTrigger.click()
        await customer.fill('模拟筛选客户')
        await customer.press('Enter')
        await filterDialog
          .getByRole('button', { name: '完成', exact: true })
          .click()
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
          const materialDialog = page.getByRole('dialog')
          await materialDialog.waitFor()
          await assertBusinessModalViewport(page, materialDialog, {
            label: 'engineering-material-summary',
            minWidthRatio: 0.9,
            maxWidth: 1800,
          })
          assert.match(
            await materialDialog
              .locator('.erp-material-sheet__purchase-basis')
              .textContent(),
            /采购订单按本表总用数量生成.*库存仅供参考.*未自动抵扣/u
          )
          const calculationBasis = materialDialog.locator(
            '.erp-material-sheet__help'
          )
          assert.equal(await calculationBasis.getAttribute('open'), null)
          await calculationBasis.locator('summary').click()
          assert.match(
            await calculationBasis.textContent(),
            /生产数量：.*订单数量加船头样数量/u
          )
          assert.match(
            await calculationBasis.textContent(),
            /提交审批时会冻结本次订单、BOM.*后续资料变更不会自动改写/u
          )
          assert.equal(calls.at(-1).method, 'get_engineering_material_request')
          assert.equal(calls.at(-1).params.request_id, 51)
          assert.equal(calls.at(-1).params.sales_order_id, 101)
          assert.equal(
            await materialDialog
              .getByRole('button', { name: /提交|批准采购|审核通过|重新整理/u })
              .count(),
            0
          )
          await materialDialog
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
    ...createMaterialSummaryScenarios({
      assert,
      outputDir,
      customerRuntimeEffectiveSession,
    }),
  ]
}
