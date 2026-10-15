import { assertProductionRecordTabMotion, createProductionTabStabilityScenarios } from './productionTabStabilityScenarios.mjs'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { moveBusinessDate } from '../../src/erp/utils/businessVisualizationModels.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import {
  assertBusinessViewMotion,
  captureBusinessView,
} from './businessViewDetailAssertions.mjs'

const unix = (date) => Date.parse(`${date}T00:00:00Z`) / 1000
const today = currentBusinessDate()
const rows = Array.from({ length: 500 }, (_, index) => ({
  id: index + 1,
  sales_order_id: index + 1,
  order_no: `SO-UI-${String(index + 1).padStart(4, '0')}`,
  customer_name: '交互验证客户',
  requested_product_name: `产品 ${index + 1}`,
  ordered_quantity: '100',
  shipped_quantity: index % 3 ? '40' : null,
  unshipped_quantity: index % 3 ? '60' : null,
  unit_name: '只',
  planned_delivery_date: unix(
    moveBusinessDate(today, index % 3 === 1 ? -2 : 3)
  ),
  lifecycle_status: 'active',
  line_status: 'open',
}))
async function respond(route, id, data) {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      jsonrpc: '2.0',
      id,
      result: { code: 0, message: 'OK', data },
    }),
  })
}

export function createUnifiedInteractionScenarios({
  assert,
  customerRuntimeEffectiveSession,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
  outputDir,
}) {
  const common = {
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 900 },
  }
  let recoveryMode
  let releaseRecovery
  let recoveryRequested
  return [
    ...createProductionTabStabilityScenarios({ common, outputDir, assertNoHorizontalOverflow, clickERPThemeOption }),
    {
      ...common,
      name: 'unified-production-overview-details',
      path: '/erp/production/orders',
      productionOrderReleased: true,
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '生产订单', exact: true })
          .waitFor()
        await assertBusinessViewMotion(page, 'production-overview', outputDir)
        const panel = page.getByRole('region', {
          name: '生产总览',
          exact: true,
        })
        await panel.locator('.erp-production-overview__row').first().waitFor()
        const overviewRefresh = page.waitForResponse((response) => {
          if (!response.url().endsWith('/rpc/production_order')) return false
          const request = response.request()
          const payload = request.postDataJSON()
          return (
            payload?.method === 'list_production_orders' &&
            payload.params?.limit === 200
          )
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await overviewRefresh
        await panel.locator('.erp-production-overview__row').first().waitFor()
        for (const width of [1440, 820, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `production-overview-${width}`)
          await captureBusinessView(
            page,
            panel,
            'production-overview',
            width,
            outputDir
          )
        }
        await clickERPThemeOption(page, '暗色')
        await captureBusinessView(
          page,
          panel,
          'production-overview-dark',
          390,
          outputDir
        )
        await panel
          .getByRole('button', { name: /查看工序/ })
          .first()
          .click()
        await page.waitForURL(/\/erp\/production\/progress/)
        await page
          .getByRole('region', { name: '生产工序', exact: true })
          .locator('.erp-production-process__lane')
          .first()
          .waitFor()
      },
    },
    {
      ...common,
      name: 'unified-inventory-distribution-details',
      path: '/erp/warehouse/inventory?view=balances',
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '库存台账', exact: true })
          .waitFor()
        await assertBusinessViewMotion(
          page,
          'inventory-distribution',
          outputDir
        )
        const panel = page.getByRole('region', {
          name: '仓库库存分布',
          exact: true,
        })
        await panel
          .locator('.erp-inventory-distribution-grid__card')
          .first()
          .waitFor()
        for (const width of [1440, 820, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(
            page,
            `inventory-distribution-${width}`
          )
          if (width === 390) {
            const toolbar = await page
              .locator('.erp-inventory-ledger-view-bar')
              .evaluate((element) => {
                const switcher = element.querySelector(
                  '.erp-business-visual-switch'
                )
                return {
                  height: element.getBoundingClientRect().height,
                  switchHeight: switcher.getBoundingClientRect().height,
                  flexBasis: getComputedStyle(switcher).flexBasis,
                }
              })
            assert.ok(
              toolbar.height < 160 && toolbar.switchHeight < 90,
              `库存窄屏视图切换不能撑出空白: ${JSON.stringify(toolbar)}`
            )
          }
          await captureBusinessView(
            page,
            panel,
            'inventory-distribution',
            width,
            outputDir
          )
        }
        await clickERPThemeOption(page, '暗色')
        await captureBusinessView(
          page,
          panel,
          'inventory-distribution-dark',
          390,
          outputDir
        )
        await panel
          .locator('.erp-inventory-distribution-grid__card')
          .first()
          .click()
        await page
          .locator('.erp-business-data-table-card tbody tr[data-row-key]')
          .first()
          .waitFor()
      },
    },
    {
      ...common,
      name: 'unified-sales-loading-error-recovery',
      path: '/erp/sales/project-orders/sales-orders',
      beforeNavigate: async (page) => {
        recoveryMode = 'loading'
        recoveryRequested = false
        const ready = new Promise((resolve) => {
          releaseRecovery = resolve
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_sales_order_summary') return route.fallback()
          recoveryRequested = true
          if (recoveryMode === 'loading') {
            await ready
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '暂时无法读取交付进度' },
              }),
            })
          }
          return respond(
            route,
            id,
            stylePaginatedRpcData(
              recoveryMode === 'empty' ? [] : rows.slice(0, 3),
              'items',
              params
            )
          )
        })
      },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '销售订单', exact: true })
          .waitFor()
        await page.getByText('交付进度', { exact: true }).click()
        const panel = page.getByRole('region', { name: '销售交付进度' })
        await panel.getByRole('status').waitFor()
        assert.equal(recoveryRequested, true)
        const count = panel.locator('.erp-filter-chip__count').first()
        assert.equal(
          await count.textContent(),
          '—',
          '读取中不应显示虚假的零条统计'
        )
        await captureBusinessView(page, panel, 'sales-loading', 1440, outputDir)
        releaseRecovery()
        await panel.getByRole('button', { name: '重新加载' }).waitFor()
        assert.equal(
          await count.textContent(),
          '—',
          '读取失败不能等同于零条记录'
        )
        await captureBusinessView(page, panel, 'sales-error', 1440, outputDir)
        recoveryMode = 'empty'
        await panel.getByRole('button', { name: '重新加载' }).click()
        await panel.getByText('当前筛选暂无数据', { exact: true }).waitFor()
        assert.equal(await count.textContent(), '0')
        await captureBusinessView(page, panel, 'sales-empty', 1440, outputDir)
        recoveryMode = 'data'
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await panel.locator('.erp-business-visual-list__row').first().waitFor()
        assert.equal(await count.textContent(), '3')
        await captureBusinessView(
          page,
          panel,
          'sales-recovered',
          1440,
          outputDir
        )
      },
    },
    {
      ...common,
      name: 'unified-purchase-line-save',
      path: '/erp/purchase/accessories',
      verify: async (page) => {
        await page
          .locator('.erp-business-data-table-card tbody tr')
          .filter({ hasText: 'PO-STYLE-L1' })
          .first()
          .dblclick()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor
          .getByRole('heading', { name: '编辑采购订单', exact: true })
          .waitFor()
        const saves = []
        page.on('request', (request) => {
          if (request.url().endsWith('/rpc/purchase_order') &&
              request.postDataJSON()?.method === 'save_purchase_order_with_items') {
            saves.push(request.postDataJSON().params)
          }
        })
        await editor.getByLabel('付款周期（天）', { exact: true }).fill('30')
        const lines = editor.locator('.erp-sales-order-lines-form__row')
        const firstLine = lines.first()
        for (const [label, invalid, message] of [
          ['采购数量', '0', '数量必须大于 0，且最多保留 6 位小数'],
          ['采购数量', '-1', '数量必须大于 0，且最多保留 6 位小数'],
          ['单价', '-1', '单价必须为非负数，且最多保留 6 位小数'],
          ['金额', '0.0000001', '金额必须为非负数，且最多保留 6 位小数'],
        ]) {
          const input = firstLine.getByLabel(label, { exact: true })
          const original = await input.inputValue()
          await input.fill(invalid)
          await editor.getByRole('button', { name: /保存草稿$/u }).click()
          await firstLine.getByText(message, { exact: true }).waitFor()
          assert.equal(saves.length, 0, `${label}无效时不得发出保存请求`)
          await input.fill(original)
        }
        await firstLine.locator('summary').click()
        await firstLine
          .getByLabel('产品名称', { exact: true })
          .fill('保存前原始行')
        await firstLine
          .getByRole('button', { name: '复制第 1 行', exact: true })
          .click()
        const copiedLine = lines.nth(1)
        await copiedLine.locator('summary').click()
        await copiedLine
          .getByLabel('产品名称', { exact: true })
          .fill('复制后移到首行')
        await copiedLine
          .getByRole('button', { name: '上移第 2 行', exact: true })
          .click()
        const requestPromise = page.waitForRequest(
          (request) =>
            request.url().endsWith('/rpc/purchase_order') &&
            request.postDataJSON()?.method === 'save_purchase_order_with_items'
        )
        await editor.getByRole('button', { name: /保存草稿$/u }).click()
        const { params } = (await requestPromise).postDataJSON()
        assert.deepEqual(
          params.items.map((item) => item.line_no),
          [1, 2]
        )
        assert.deepEqual(
          params.items.map((item) => item.product_name_snapshot),
          ['复制后移到首行', '保存前原始行']
        )
        assert.ok(!params.items[0].id)
        assert.equal(params.items[1].id, 1)
        await editor.waitFor({ state: 'hidden' })
      },
    },
    {
      ...common,
      name: 'unified-sales-interactions',
      path: '/erp/sales/project-orders/sales-orders',
      beforeNavigate: async (page) => {
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_order_summary')
            { return respond(
              route,
              id,
              stylePaginatedRpcData(rows, 'items', params)
            ) }
          if (method === 'get_sales_order')
            { return respond(route, id, {
              sales_order: {
                ...rows.find((row) => row.id === params.id),
                customer_snapshot: { name: '交互验证客户' },
                version: 1,
              },
            }) }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '销售订单', exact: true })
          .waitFor()
        await assertBusinessViewMotion(page, 'sales-view', outputDir)
        await page.getByText('交付进度', { exact: true }).click()
        const panel = page.getByRole('region', { name: '销售交付进度' })
        await panel.locator('.erp-business-visual-list__row').first().waitFor()
        assert.equal(
          await panel.locator('.erp-business-visual-list__row').count(),
          25
        )
        await panel.locator('.ant-pagination-item-2').click()
        const firstRow = await panel
          .locator('.erp-business-visual-list__row')
          .first()
          .textContent()
        await page.getByText('订单列表', { exact: true }).click()
        await page.getByText('交付进度', { exact: true }).click()
        await panel.locator('.erp-business-visual-list__row').first().waitFor()
        assert.equal(
          await panel
            .locator('.erp-business-visual-list__row')
            .first()
            .textContent(),
          firstRow
        )
        await panel.getByRole('button', { name: /^待核对/ }).click()
        assert.equal(await panel.locator('.ant-progress').count(), 0)
        assert.equal(
          await panel.locator('.erp-business-visual-list__row').count(),
          25
        )
        await panel.getByRole('button', { name: /^逾期/ }).click()
        const orderNo = await panel
          .locator('.erp-business-visual-identity strong')
          .first()
          .textContent()
        await panel.locator('.erp-business-visual-list__row').first().click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        assert.ok((await dialog.textContent()).includes(orderNo))
        await dialog.getByRole('button', { name: /^关\s*闭$/ }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(
          await panel
            .locator('.erp-business-visual-list__row')
            .first()
            .evaluate((element) => element.contains(document.activeElement)),
          true
        )
        assert.equal(
          await panel
            .getByRole('button', { name: /^逾期/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        await panel
          .locator('.erp-business-visual-list__row')
          .nth(12)
          .scrollIntoViewIfNeeded()
        const scrollTop = await panel.evaluate(
          (element) => element.closest('.erp-admin-content').scrollTop
        )
        assert.ok(scrollTop > 0)
        await page.getByRole('menuitem', { name: /采购管理/ }).click()
        await page
          .getByRole('heading', { name: '采购订单', exact: true })
          .waitFor()
        await page.goBack()
        await panel.locator('.erp-business-visual-list__row').first().waitFor()
        await page.waitForFunction(
          (top) =>
            Math.abs(
              document.querySelector('.erp-admin-content').scrollTop - top
            ) < 2,
          scrollTop
        )
        assert.equal(
          await panel
            .getByRole('button', { name: /^逾期/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `sales-${width}`)
          await captureBusinessView(page, panel, 'sales-view', width, outputDir)
        }
        await clickERPThemeOption(page, '暗色')
        await assertNoHorizontalOverflow(page, 'sales-dark')
        await captureBusinessView(
          page,
          panel,
          'sales-view-dark',
          390,
          outputDir
        )
      },
    },
    {
      ...common,
      name: 'unified-purchase-interactions',
      path: '/erp/purchase/accessories',
      beforeNavigate: async (page) => {
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_purchase_orders') return route.fallback()
          const orders = rows.map((row, index) => ({
            id: row.id,
            purchase_order_no: `PO-UI-${row.id}`,
            supplier_id: 1,
            supplier_snapshot: { name: '交互验证供应商' },
            lifecycle_status: 'approved',
            version: 1,
            expected_arrival_date:
              index % 5
                ? unix(moveBusinessDate(today, index % 3 === 0 ? -2 : 2))
                : null,
            supplier_confirmed_arrival_date:
              index % 2 ? unix(moveBusinessDate(today, 3)) : null,
          }))
          return respond(
            route,
            id,
            stylePaginatedRpcData(orders, 'purchase_orders', params)
          )
        })
      },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '采购订单', exact: true })
          .waitFor()
        await assertBusinessViewMotion(page, 'purchase-view', outputDir)
        await page.getByText('到货计划', { exact: true }).click()
        const panel = page.getByRole('region', { name: '采购到货计划' })
        await panel.locator('.erp-arrival-calendar__day').first().waitFor()
        assert.equal(
          await panel.locator('.erp-arrival-calendar__day').count(),
          14
        )
        assert.equal(
          await panel
            .locator('.erp-arrival-calendar__day[aria-current="date"]')
            .count(),
          1
        )
        await panel.getByRole('button', { name: /^全部\s*\d/ }).click()
        assert.equal(
          await panel.locator('.erp-arrival-calendar__order').count(),
          25
        )
        await panel
          .getByRole('button', { name: '后 14 天', exact: true })
          .click()
        assert.ok(
          (
            await panel
              .locator('.erp-arrival-calendar__toolbar strong')
              .textContent()
          ).includes(moveBusinessDate(today, 14))
        )
        await panel
          .getByRole('button', { name: '前 14 天', exact: true })
          .click()
        await panel.getByRole('button', { name: /^未填日期/ }).click()
        assert.equal(
          await panel.locator('.erp-arrival-calendar__order').count(),
          25
        )
        await page.getByText('订单列表', { exact: true }).click()
        await page.getByText('到货计划', { exact: true }).click()
        await panel.locator('.erp-arrival-calendar__day').first().waitFor()
        assert.equal(
          await panel
            .getByRole('button', { name: /^未填日期/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `purchase-${width}`)
          await captureBusinessView(
            page,
            panel,
            'purchase-view',
            width,
            outputDir
          )
        }
        await clickERPThemeOption(page, '暗色')
        await captureBusinessView(
          page,
          panel,
          'purchase-view-dark',
          390,
          outputDir
        )
      },
    },
    {
      ...common,
      name: 'unified-finance-interactions',
      path: '/erp/finance/receivables',
      beforeNavigate: async (page) => {
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_finance_facts') return route.fallback()
          const facts = rows.map((row, index) => ({
            id: row.id,
            fact_no: `${params.fact_type}-UI-${row.id}`,
            fact_type: params.fact_type,
            status: 'POSTED',
            version: 1,
            source_type: 'SHIPMENT',
            source_id: 1,
            source_no: 'SH-STYLE-L1',
            amount: '100',
            outstanding_amount: index % 5 ? '60' : null,
            currency: index % 2 ? 'USD' : 'CNY',
            due_at: unix(moveBusinessDate(today, index % 2 ? -2 : 3)),
          }))
          return respond(
            route,
            id,
            stylePaginatedRpcData(facts, 'finance_facts', params)
          )
        })
      },
      verify: async (page) => {
        await page.getByRole('heading', { name: /应收管理/ }).waitFor()
        await assertBusinessViewMotion(page, 'finance-view', outputDir)
        await page.getByText('到期顺序', { exact: true }).click()
        const panel = page.getByRole('region', { name: '财务到期顺序' })
        await panel.locator('.erp-finance-due-list__row').first().waitFor()
        assert.equal(
          await panel.locator('.erp-finance-due-list__row').count(),
          25
        )
        await panel.getByRole('button', { name: /^金额待核对/ }).click()
        assert.equal(
          await panel
            .locator('.erp-finance-due-list__amount')
            .nth(2)
            .textContent(),
          '未结金额—'
        )
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应付', exact: true }).click()
        await page.getByRole('heading', { name: /应付管理/ }).waitFor()
        await page.getByText('到期顺序', { exact: true }).click()
        await panel.locator('.erp-finance-due-list__row').first().waitFor()
        assert.equal(
          await panel
            .getByRole('button', { name: /^全部/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true }).click()
        await page.getByRole('heading', { name: /应收管理/ }).waitFor()
        await panel.locator('.erp-finance-due-list__row').first().waitFor()
        assert.equal(
          await panel
            .getByRole('button', { name: /^金额待核对/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        const selectedFactNo = await panel
          .locator('.erp-finance-due-list__row strong')
          .first()
          .textContent()
        await panel.locator('.erp-finance-due-list__row').first().click()
        const details = page.getByRole('dialog')
        await details
          .getByRole('button', { name: '查看来源单据', exact: true })
          .click()
        await page.waitForURL(/\/erp\/warehouse\/shipments/)
        assert.equal(new URL(page.url()).searchParams.get('shipment_id'), '1')
        await page.goBack()
        await page.getByRole('heading', { name: /应收管理/ }).waitFor()
        await details.getByText(selectedFactNo, { exact: true }).waitFor()
        await details.getByRole('button', { name: /^关\s*闭$/u }).click()
        await details.waitFor({ state: 'hidden' })
        assert.equal(
          await panel
            .getByRole('button', { name: /^金额待核对/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `finance-${width}`)
          await captureBusinessView(
            page,
            panel,
            'finance-view',
            width,
            outputDir
          )
          assert.equal(
            await panel
              .locator('.erp-finance-due-list__amount')
              .nth(2)
              .isVisible(),
            true
          )
        }
        await clickERPThemeOption(page, '暗色')
        await captureBusinessView(
          page,
          panel,
          'finance-view-dark',
          390,
          outputDir
        )
      },
    },
    {
      ...common,
      name: 'unified-production-interactions',
      path: '/erp/production/progress?display=process',
      productionOrderReleased: true,
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产工序',
          exact: true,
        })
        await panel.locator('.erp-production-process__step').first().waitFor()
        const lanes = panel.locator('.erp-production-process__lane')
        assert.ok((await lanes.count()) > 0)
        assert.ok((await lanes.count()) <= 25)
        for (const lane of await lanes.all()) {
          assert.equal(
            await lane.locator('.erp-production-process__step').count(),
            4
          )
          assert.equal(
            await lane
              .locator('.erp-production-process__step strong')
              .allTextContents()
              .then((names) => new Set(names).size),
            4
          )
        }
        await panel.locator('.erp-production-process__step').first().click()
        const dialog = page.getByRole('dialog')
        await dialog
          .getByRole('heading', { name: '在制批次', exact: true })
          .waitFor()
        assert.ok((await dialog.textContent()).includes('品质检验'))
        await dialog.locator('.ant-drawer-close').click()
        await dialog.waitFor({ state: 'hidden' })
        await page.getByText('记录明细', { exact: true }).click()
        await page
          .locator('.erp-production-record-workspace .ant-table-wrapper')
          .waitFor()
        await assertProductionRecordTabMotion(page, '生产工序')
        await page.getByRole('tab', { name: '生产工序', exact: true }).click()
        await panel.locator('.erp-production-process__step').first().waitFor()
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `production-${width}`)
          await captureBusinessView(
            page,
            panel,
            'production-view',
            width,
            outputDir
          )
        }
        await clickERPThemeOption(page, '暗色')
        await captureBusinessView(
          page,
          panel,
          'production-view-dark',
          390,
          outputDir
        )
      },
    },
  ]
}
