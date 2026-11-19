import fs from 'node:fs/promises'
import path from 'node:path'
import { exerciseTableScrollControls, exerciseTableScrollPagination } from './tableScrollControlAssertions.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { assertTableSemanticAlignment } from './businessTableAssertions.mjs'
import { assertCompactBusinessFilter } from './businessListAssertions.mjs'
import { createMaterialSummaryScenarios } from './materialSummaryScenarios.mjs'
import { workbenchPaymentSummaryScenario } from './workbenchPaymentSummaryScenario.mjs'

const baseActions = ['erp.workbench.read', 'workflow.task.read']
const salesActions = ['sales_order.read', 'sales_order_item.read']
const materialsActions = ['sales_order.read', 'engineering.material.read']

const salesAndMaterialsActions = [
  ...salesActions,
  ...materialsActions,
  'field.sales_commercial.read',
  'field.finance_settlement.read',
  'engineering.material.submit',
]

export function createWorkbenchSummaryScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  async function verifySummaryPanels(region) {
    const geometry = await region.evaluate((node) => {
      const header = node.closest('[aria-label="工作台"]').querySelector('.erp-business-page-header-card')
      const toolbar = node.querySelector('.erp-business-operation-panel')
      const results = toolbar.nextElementSibling
      const [head, bar, body] = [header, toolbar, results].map((el) => el.getBoundingClientRect())
      const gap = body.top - bar.bottom
      const between = document.elementFromPoint(bar.left + bar.width / 2, bar.bottom + gap / 2)
      return {
        gap,
        pageGap: Number.parseFloat(getComputedStyle(node).getPropertyValue('--erp-page-gap')),
        aligned: [bar, body].every((box) => Math.abs(box.left - head.left) <= 1 && Math.abs(box.right - head.right) <= 1),
        pageVisibleBetweenPanels: Boolean(between && !between.closest('.ant-card')),
      }
    })
    assert(geometry.aligned && geometry.pageVisibleBetweenPanels && geometry.gap > 0 && Math.abs(geometry.gap - geometry.pageGap) <= 1,
      `汇总的筛选栏和结果面板与页头对齐，中间露出页面底色：${JSON.stringify(geometry)}`)
  }

  const fixtureRows = Array.from({ length: 21 }, (_, index) => ({
    id: index + 1,
    sales_order_id: 100 + index,
    order_no: `SO-SUM-${index + 1}`,
    customer_id: index === 20 ? 42 : 7,
    customer_name: index === 20 ? '模拟筛选客户' : '模拟普通客户',
    order_date: 1788883200 + index * 86400,
    planned_delivery_date: 1789747200,
    requested_product_name: `模拟产品 ${index + 1}`,
    customer_product_no: `STYLE-${index + 1}`,
    product_id: null,
    product_image_attachment_id: null,
    order_category: 'NEW',
    ordered_quantity: String(100 + index),
    pre_shipment_sample_quantity: '2',
    production_quantity: String(102 + index),
    unshipped_quantity: '60',
    unit_name: '只',
    sales_owner: index === 20 ? '历史跟单' : '历史跟单甲',
    lifecycle_status: index === 0 ? 'canceled' : 'active',
    line_status: index === 0 ? 'canceled' : 'open',
    designer: null,
    unit_price: '12.5',
    currency: 'CNY',
    process_requirement: '刺绣',
  }))

  function makeScenario(name, actions, mode, dark = false) {
    let calls = []
    let failNext = false
    let failOptionRead = false
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
        failOptionRead = mode === 'sales'
        if (mode === 'none') {
          page.on('request', (request) => {
            if (request.url().endsWith('/rpc/operational_fact') && request.postDataJSON()?.method === 'list_finance_payments') {
              calls.push('list_finance_payments')
            }
          })
        }
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (
            ![
              'list_sales_order_summary',
              'list_sales_order_summary_filter_options',
              'list_engineering_material_requests',
              'get_engineering_material_request',
            ].includes(method)
          ) {
            return route.fallback()
          }
          calls.push({ method, params })
          let data
          if (method === 'list_sales_order_summary_filter_options') {
            if (failOptionRead) {
              failOptionRead = false
              return route.fulfill({
                json: { jsonrpc: '2.0', id, result: { code: 50000, message: '暂时无法读取名单' } },
              })
            }
            data = {
              customers: [
                { id: 42, name: '模拟筛选客户', code: 'C-42', previous_names: ['客户旧名'] },
                { id: 7, name: '模拟普通客户', code: 'C-7', previous_names: [] },
              ],
              sales_owners: ['历史跟单', '历史跟单甲'],
            }
          } else if (method === 'list_sales_order_summary') {
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
                  (!params.customer_id || row.customer_id === params.customer_id) &&
                  (!params.sales_owner_name || row.sales_owner === params.sales_owner_name) &&
                  (!params.lifecycle_status || row.lifecycle_status === params.lifecycle_status) &&
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
            if (params.sort_by) {
              rows.sort((a, b) => {
                const field = params.sort_by
                const numeric = ['order_date', 'planned_delivery_date', 'ordered_quantity', 'production_quantity', 'pre_shipment_sample_quantity', 'unshipped_quantity', 'unit_price'].includes(field)
                const read = (row) => field === 'product' ? row.requested_product_name || row.product_name_snapshot : row[field]
                const left = read(a)
                const right = read(b)
                if (left == null || right == null) return Number(left == null) - Number(right == null)
                const comparison = numeric ? Number(left) - Number(right) : String(left).localeCompare(String(right), 'zh-CN')
                return comparison * (params.sort_direction === 'asc' ? 1 : -1)
              })
            }
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
            if (mode === 'materials' && !params.keyword) {
              data.items.unshift({ ...data.items[0], id: 52, order_no: 'SO-MATERIAL-NEW', submitted_at: '2026-09-16T08:00:00Z' })
              if (params.sort_direction === 'asc') data.items.reverse()
              data.total = data.items.length
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
        assert.equal(await page.getByLabel('工作台视图').count(), 0)
        if (mode === 'none') {
          await page.getByText('当前岗位没有可查看的业务汇总', { exact: true }).waitFor()
          assert.equal(calls.length, 0)
          await page.goto(new URL('/erp/dashboard?summary=payments', page.url()).href, { waitUntil: 'domcontentloaded' })
          await page.getByText('当前岗位没有可查看的业务汇总', { exact: true }).waitFor()
          assert.equal(calls.length, 0)
          await assertNoHorizontalOverflow(page)
          return
        }
        const region = page.getByRole('region', { name: '工作台汇总' })
        await region.locator('.erp-workbench-summaries__heading > *').waitFor()
        if (mode === 'both') {
          await region.locator('.erp-workbench-summaries__heading .ant-select-clear').click()
          await region.getByText('请选择汇总类型', { exact: true }).waitFor()
          await verifySummaryPanels(region)
          assert.equal(new URL(page.url()).searchParams.get('summary'), '')
          assert.equal(await region.locator('table').count(), 0)
          await page.reload()
          await region.getByText('请选择汇总类型', { exact: true }).waitFor()
          await region.getByRole('combobox', { name: '汇总类型' }).click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
          await region.locator('.ant-table-tbody').waitFor()
        }
        await verifySummaryPanels(region)
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
          const submitted = region.locator('th.ant-table-column-has-sorters:visible').filter({ hasText: '提交时间' }).first()
          await submitted.press('Enter')
          await page.waitForFunction(() => document.querySelector('.erp-workbench-summaries tr[data-row-key]')?.dataset.rowKey === '51')
          assert.equal(calls.at(-1).params.sort_by, 'submitted_at')
          await submitted.press('Enter')
          await page.waitForFunction(() => document.querySelector('.erp-workbench-summaries tr[data-row-key]')?.dataset.rowKey === '52')
          assert.equal(
            await region.getByRole('combobox', { name: '汇总类型' }).count(),
            0
          )
          assert.equal(
            calls.some(({ method }) => method === 'list_sales_order_summary'),
            false
          )
          const search = region.locator('.erp-business-operation-panel__search input').first()
          await search.fill('SO-MATERIAL-SUM')
          await search.press('Enter')
          await region.getByRole('button', { name: '筛选', exact: true }).click()
          const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
          await filters.getByRole('group', { name: '审批状态', exact: true }).getByRole('button').nth(1).click()
          await region.getByRole('button', { name: '筛选，已应用 1 项', exact: true }).waitFor()
          await filters.getByRole('button', { name: '收起', exact: true }).click()
          await region.getByRole('button', { name: '清空筛选', exact: true }).click()
          await region.getByRole('button', { name: '清空筛选', exact: true }).waitFor({ state: 'hidden' })
          assert.equal(await search.inputValue(), 'SO-MATERIAL-SUM')
          assert.equal(new URL(page.url()).searchParams.has('materials.status'), false)
          assert.equal(await region.getByRole('button', { name: '清空筛选', exact: true }).count(), 0)
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
          const content = card.querySelector('.ant-table-body, .ant-table-content')
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
          Math.abs(tableGeometry.leftInset - 1) <= 0.5 && Math.abs(tableGeometry.topInset - 1) <= 0.5,
          `${name} 主表应紧贴卡片边框: ${JSON.stringify(tableGeometry)}`
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
            tableCard.locator('.ant-table-body, .ant-table-content')
          )
        }
        const search = region.getByRole('searchbox', {
          name: '搜索订单号、产品名称或款号',
        })
        assert.equal(await search.count(), 1, '汇总保留一个主要搜索入口')
        await search.fill('模拟产品 21')
        await search.press('Enter')
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        assert.equal(calls.at(-1).params.keyword, '模拟产品 21')
        await search.fill('')
        await search.press('Enter')
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        assert.equal(calls.at(-1).params.keyword, '')
        const filterTrigger = region.locator('button[aria-haspopup="dialog"]')
        await filterTrigger.click()
        const filterDialog = page.getByRole('dialog', { name: '筛选条件' })
        await filterDialog.waitFor()
        assert.equal(await filterDialog.getByRole('button', { name: '搜索', exact: true }).count(), 0)
        const customer = filterDialog.getByRole('combobox', { name: '客户', exact: true })
        const owner = filterDialog.getByRole('combobox', { name: '跟单业务人员', exact: true })
        const selectControl = (input) => input.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
        const pick = async (input, keyword, label) => {
          await selectControl(input).locator('.ant-select-selector').click()
          await input.fill(keyword)
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).click()
        }
        if (mode === 'sales') {
          await filterDialog.getByRole('button', { name: '重试', exact: true }).click()
          await filterDialog.getByRole('alert').waitFor({ state: 'hidden' })
        }
        await customer.waitFor()
        await owner.waitFor()
        const dateRange = filterDialog.locator(
          '.erp-business-date-range-filter'
        )
        await waitForFiniteAnimations(page)
        const dateTitle = dateRange.getByText('日期类型', { exact: true })
        await dateTitle.waitFor({ state: 'visible', timeout: 2000 })
        const statusBox = await filterDialog.getByRole('group', { name: '订单状态', exact: true }).boundingBox()
        const titleBox = await dateTitle.boundingBox()
        const typesBox = await dateRange.getByRole('group', { name: '日期类型', exact: true }).boundingBox()
        assert(statusBox && titleBox && typesBox && titleBox.y > statusBox.y + statusBox.height && typesBox.y >= titleBox.y + titleBox.height, `日期类型标题位于订单状态下方、类型按钮上方: ${JSON.stringify({ statusBox, titleBox, typesBox })}`)
        assert.equal(await filterDialog.locator('.erp-business-filter-field--choices .erp-business-date-range-filter').count(), 0, '日期范围不嵌套在订单状态组内')
        await dateRange.getByRole('button', { name: '自定义日期', exact: true }).click()
        await filterDialog.screenshot({ path: path.join(outputDir, `${name}-date-filter-groups.png`) })
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
          .getByRole('button', { name: '收起', exact: true })
          .click()
        await region.locator('.ant-pagination-item-2').scrollIntoViewIfNeeded()
        await exerciseTableScrollPagination(page, {
          wrapper: tableCard.locator('.ant-table-wrapper'),
          trigger: region.locator('.ant-pagination-item-2'),
          ready: region.getByText('模拟产品 21', { exact: true }),
          endpoint: '**/rpc/sales_order',
          method: 'list_sales_order_summary',
          offset: 20,
          shorterPage: true,
        })
        assert.equal(calls.at(-1).params.offset, 20)
        const orderDate = region.locator('th.ant-table-column-has-sorters:visible').filter({ hasText: '下单日期' }).first()
        await orderDate.press('Enter')
        await region.locator('tr[data-row-key="1"]').waitFor()
        assert.equal(calls.at(-1).params.offset, 0)
        await orderDate.press('Enter')
        await page.waitForFunction(() => document.querySelector('.erp-workbench-summaries tr[data-row-key]')?.dataset.rowKey === '21')
        const [sortedDownload] = await Promise.all([
          page.waitForEvent('download'),
          region.getByRole('button', { name: '导出当前筛选', exact: true }).click(),
        ])
        const exported = await fs.readFile(await sortedDownload.path(), 'utf8')
        assert.deepEqual([...exported.matchAll(/SO-SUM-(\d+)/gu)].map((match) => Number(match[1])), Array.from({ length: 21 }, (_, index) => 21 - index))
        assert.equal(calls.at(-1).params.sort_direction, 'desc')
        await orderDate.press('Enter')
        await region.locator('tr[data-row-key="1"]').waitFor()
        await filterTrigger.click()
        await pick(customer, '客户旧名', '模拟筛选客户')
        await region.getByText('模拟产品 1', { exact: true }).waitFor({ state: 'hidden' })
        await pick(owner, '历史', /^历史跟单$/u)
        await region.getByRole('button', { name: '筛选，已应用 2 项' }).waitFor()
        assert.equal(calls.at(-1).params.customer_id, 42)
        assert.equal(calls.at(-1).params.sales_owner_name, '历史跟单')
        const ownerSelect = selectControl(owner)
        await ownerSelect.hover()
        await ownerSelect.locator('.ant-select-clear').click()
        await region.getByRole('button', { name: '筛选，已应用 1 项' }).waitFor()
        assert.equal(calls.at(-1).params.customer_id, 42)
        assert.equal(calls.at(-1).params.sales_owner_name, undefined)
        await filterDialog
          .getByRole('button', { name: '收起', exact: true })
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
        const directClear = region.getByRole('button', { name: '清空筛选', exact: true })
        await directClear.click()
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        await filterDialog.waitFor({ state: 'hidden' })
        assert.equal(await directClear.count(), 0)
        assert.equal(await filterDialog.isVisible(), false)
        assert.equal(await filterTrigger.evaluate((node) => node === document.activeElement), true)
        await filterTrigger.click()
        await filterDialog.waitFor({ state: 'visible' })
        await waitForFiniteAnimations(page)
        assert.equal(await customer.inputValue(), '', '重开面板不能恢复已清空的客户条件')
        await pick(customer, '筛选', '模拟筛选客户')
        await filterDialog.getByRole('button', { name: '收起', exact: true }).click()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        await page.reload()
        await region.getByText('模拟产品 21', { exact: true }).waitFor()
        await filterTrigger.click()
        await filterDialog.locator('.ant-select-selection-item').getByText('模拟筛选客户', { exact: true }).waitFor()
        await filterDialog
          .getByRole('button', { name: '收起', exact: true })
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
        await customer.press('ArrowDown')
        const beforeTyping = calls.length
        await customer.fill('没有这家客户')
        await page.locator('.ant-select-dropdown:visible').getByText('没有匹配的选项').waitFor()
        assert.equal(calls.length, beforeTyping, '查找候选不提交汇总查询')
        await customer.press('Escape')
        await filterDialog.getByRole('button', { name: '已取消', exact: true }).click()
        await filterDialog
          .getByRole('button', { name: '收起', exact: true })
          .click()
        await region
          .getByText('暂无符合条件的销售订单明细', { exact: true })
          .waitFor()
        await filterTrigger.click()
        await filterDialog.getByRole('group', { name: '订单状态' }).getByRole('button', { name: '不限', exact: true }).click()
        await filterDialog
          .getByRole('button', { name: '收起', exact: true })
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
          await verifySummaryPanels(region)
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
            /自动送审时会冻结本次订单、BOM.*后续资料变更不会自动改写/u
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
    {
      ...makeScenario('erp-workbench-summary-column-edges', [...salesActions, 'field.sales_commercial.read', 'field.finance_settlement.read'], 'sales'),
      path: '/erp/dashboard?view=summary',
      viewport: { width: 1920, height: 1028 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const table = page.locator('.erp-workbench-summaries .app-table')
        await table.locator('tr[data-row-key="1"]').waitFor()
        const heads = table.locator('.ant-table-header th:not(.ant-table-cell-scrollbar)')
        assert.equal(await heads.count(), 16)
        const leadingColumns = ['订单编号', '客户', '产品名称', '客户款号', '计划交付日期', '订单数量', '未出货数', '单位', '订单状态']
        const headerLabels = () => heads.locator('.ant-table-column-title').allInnerTexts()
        assert.deepEqual((await headerLabels()).slice(0, leadingColumns.length), leadingColumns)
        assert.equal(await table.locator('.ant-table-header th.ant-table-column-has-sorters').count(), await heads.count())
        const quantity = heads.filter({ hasText: '订单数量' })
        for (const [direction, id] of [['asc', '1'], ['desc', '21'], [undefined, '1']]) {
          const read = page.waitForResponse((res) => {
            if (!res.url().endsWith('/rpc/sales_order')) return false
            const body = res.request().postDataJSON()
            return body.method === 'list_sales_order_summary' && body.params.sort_direction === direction
          })
          await quantity.press('Enter')
          await read
          await page.waitForFunction((key) => document.querySelector('.erp-workbench-summaries tr[data-row-key]')?.dataset.rowKey === key, id)
          assert.equal(await quantity.getAttribute('aria-sort'), { asc: 'ascending', desc: 'descending' }[direction] || null)
        }
        for (const fraction of [0, 0.5, 1, 0]) {
          const geometry = await table.evaluate(async (root, position) => {
            const header = root.querySelector('.ant-table-header')
            const body = root.querySelector('.ant-table-body')
            const extent = (node) => node.scrollWidth - node.clientWidth
            body.scrollLeft = Math.round(extent(body) * position)
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const heads = [...header.querySelectorAll('th:not(.ant-table-cell-scrollbar)')]
            const cells = [...body.querySelector('tr[data-row-key]').cells]
            return {
              bodyRange: extent(body),
              headRange: extent(header),
              bodyLeft: body.scrollLeft,
              headLeft: header.scrollLeft,
              edges: heads.map((th, i) => {
                const head = th.getBoundingClientRect()
                const cell = cells[i].getBoundingClientRect()
                return Math.max(Math.abs(head.left - cell.left), Math.abs(head.right - cell.right))
              }),
            }
          }, fraction)
          assert(geometry.bodyRange > 0 && geometry.edges.every((delta) => delta <= 1), JSON.stringify(geometry))
          if (fraction === 1) assert(Math.abs(geometry.bodyRange - geometry.headRange) <= 1, JSON.stringify(geometry))
        }
        const defaultHeaders = await headerLabels()
        await page.getByRole('button', { name: '列设置', exact: true }).click()
        const settings = page.getByRole('dialog', { name: /^列设置/u })
        await settings.getByRole('button', { name: '下单日期 移到最前' }).click()
        await settings.getByRole('checkbox', { name: '客户款号', exact: true }).uncheck()
        await settings.getByRole('button', { name: /^完\s*成$/u }).click()
        await settings.waitFor({ state: 'hidden' })
        await page.reload()
        await table.locator('tr[data-row-key="1"]').waitFor()
        assert.deepEqual(await headerLabels(), ['下单日期', ...defaultHeaders.filter((label) => !['下单日期', '客户款号'].includes(label))])
        await page.getByRole('button', { name: '列设置', exact: true }).click()
        await settings.getByRole('button', { name: '恢复默认', exact: true }).click()
        await settings.getByRole('button', { name: /^完\s*成$/u }).click()
        await settings.waitFor({ state: 'hidden' })
        assert.deepEqual(await headerLabels(), defaultHeaders)
      },
    },
    makeScenario('erp-workbench-summaries-desktop', salesAndMaterialsActions, 'both'),
    {
      ...makeScenario('erp-workbench-summary-filter-toolbar', salesAndMaterialsActions, 'both'),
      verify: async (page) => {
        const region = page.getByRole('region', { name: '工作台汇总' })
        const trigger = region.getByRole('button', { name: '筛选', exact: true })
        const search = region.getByRole('searchbox', { name: '搜索订单号、产品名称或款号' })
        const filteredOutRow = region.getByText('模拟产品 2', { exact: true })
        await region.getByRole('combobox', { name: '汇总类型' }).waitFor()
        await filteredOutRow.waitFor()
        await assertCompactBusinessFilter(trigger)
        await search.fill('模拟产品')
        await search.press('Enter')
        await trigger.press('Enter')
        const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await filters.waitFor()
        await waitForFiniteAnimations(page)
        const openedFilter = await filters.boundingBox()
        await filters.getByRole('button', { name: '已取消', exact: true }).click()
        await region.getByRole('button', { name: '筛选，已应用 1 项', exact: true }).waitFor()
        await region.getByText('模拟产品 1', { exact: true }).waitFor()
        await filteredOutRow.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        const appliedFilter = await filters.boundingBox()
        assert(openedFilter && appliedFilter && Math.abs(openedFilter.x - appliedFilter.x) <= 1, '应用条件时筛选面板横向位置保持稳定')
        const clear = region.getByRole('button', { name: '清空筛选', exact: true })
        await clear.click()
        await filteredOutRow.waitFor()
        await filters.waitFor({ state: 'hidden' })
        assert.equal(await clear.count(), 0)
        assert.equal(await search.inputValue(), '模拟产品')
        assert.equal(await trigger.evaluate((node) => node === document.activeElement), true)
        await assertCompactBusinessFilter(trigger)
        await assertNoHorizontalOverflow(page)
      },
    },
    makeScenario('erp-workbench-summary-sales-light', salesActions, 'sales'),
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
    workbenchPaymentSummaryScenario(customerRuntimeEffectiveSession),
    ...createMaterialSummaryScenarios({
      assert,
      outputDir,
      customerRuntimeEffectiveSession,
    }),
  ]
}
