import { readFile } from 'node:fs/promises'
import { createDeliveryBoardScenarios } from './deliveryBoardScenarios.mjs'
import { assertProductionRecordTabMotion, createProductionTabStabilityScenarios } from './productionTabStabilityScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { currentBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { moveBusinessDate } from '../../src/erp/utils/businessVisualizationModels.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { expectHeading } from './pageAssertions.mjs'
import { purchaseFollowupFixture } from './purchaseFollowupFixtures.mjs'
import { assertReadableOnBackground, parseRgb } from './colorAssertions.mjs'
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

async function closeAppearanceNavigation(page) {
  const drawer = page.locator('.erp-admin-drawer:visible')
  if (await drawer.count()) {
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden' })
  }
}

async function firstDueCell(panel, label) {
  const header = panel.getByRole('columnheader', { name: label, exact: true }).first()
  const column = await header.evaluate((cell) => cell.cellIndex)
  return panel.locator('tbody tr[data-row-key]').first().getByRole('cell').nth(column)
}

async function assertVisualStatuses(panel, assert) {
  await waitForFiniteAnimations(panel.page())
  const statuses = await panel.evaluate((root) => Array.from(root.querySelectorAll('.erp-business-visual-status'), (node) => {
    const style = getComputedStyle(node)
    return {
      label: node.textContent.trim(),
      color: style.color,
      background: style.backgroundColor,
      semanticColor: style.getPropertyValue('--visual-status-color').trim(),
      icons: node.querySelectorAll('.anticon[aria-hidden="true"]').length,
      unknown: node.classList.contains('erp-business-visual-status--unknown'),
      borderStyle: style.borderStyle,
    }
  }))
  assert(statuses.length > 0)
  for (const status of statuses) {
    assert.equal(status.icons, 1, `${status.label} 同时保留状态文字和图标`)
    assert.deepEqual(parseRgb(status.color), parseRgb(status.semanticColor), '状态色读取共享语义变量')
    assertReadableOnBackground(status.color, status.background, status.label)
    if (status.unknown) assert.equal(status.borderStyle, 'dashed', '未知不冒充成功或零值')
  }
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
  let purchaseArrivalFail = false
  const scenarios = [
    ...createProductionTabStabilityScenarios({ common, outputDir, assertNoHorizontalOverflow, clickERPThemeOption }),
    {
      ...common,
      name: 'unified-production-execution-details',
      path: '/erp/production/progress?display=process',
      productionOrderReleased: true,
      verify: async (page) => {
        await page.getByRole('heading', { name: '生产管理', exact: true }).waitFor()
        const navigation = page.getByLabel('生产管理页面', { exact: true })
        assert.deepEqual(await navigation.getByRole('tab').allTextContents(), ['生产订单', '生产执行', '生产记录', '异常处理'])
        const strip = await navigation.locator('.ant-tabs-nav-list').elementHandle()
        const panel = page.getByRole('region', { name: '生产执行', exact: true })
        await panel.getByRole('table', { name: '当前生产事项' }).waitFor()
        await assertBusinessViewMotion(page, 'production-execution', outputDir, { presentationSelector: '.erp-production-process__layout .ant-segmented-group' })
        await panel.locator('.erp-production-process__lane').first().waitFor()
        assert.equal(await panel.getByRole('combobox', { name: '选择生产订单', exact: true }).count(), 1)
        assert.equal(await panel.getByRole('button', { name: '打开生产订单', exact: true }).count(), 0)
        assert.equal(await page.getByRole('button', { name: /列设置|新建生产订单/ }).count(), 0)
        const orderRefresh = page.waitForResponse((response) => {
          if (!response.url().endsWith('/rpc/production_order')) return false
          const { method, params } = response.request().postDataJSON() || {}
          return method === 'list_production_orders' && params?.lifecycle_scope === 'all' && params?.sort_by === 'updated_at' && params?.sort_direction === 'desc'
        })
        const progressRefresh = page.waitForResponse((response) => response.url().endsWith('/rpc/production_wip') && response.request().postDataJSON()?.method === 'get_production_wip')
        await page.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await Promise.all([orderRefresh, progressRefresh])
        await panel.locator('.erp-production-process__lane').first().waitFor()
        for (const width of [1440, 820, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `production-execution-${width}`)
          await captureBusinessView(page, panel, 'production-execution', width, outputDir)
        }
        await clickERPThemeOption(page, '暗色')
        const navigationDrawer = page.locator('.erp-admin-drawer:visible')
        if (await navigationDrawer.count()) {
          await page.keyboard.press('Escape')
          await navigationDrawer.waitFor({ state: 'hidden' })
        }
        await captureBusinessView(page, panel, 'production-execution-dark', 390, outputDir)
        await navigation.getByRole('tab', { name: '生产记录', exact: true }).click()
        await page.locator('.erp-production-record-workspace .ant-table-wrapper').waitFor()
        assert.equal(await strip.evaluate((node) => node.isConnected), true)
        await navigation.getByRole('tab', { name: '生产执行', exact: true }).click()
        await panel.locator('.erp-production-process__lane').first().waitFor()
        assert.equal(await strip.evaluate((node) => node.isConnected), true)
        assert.equal(await panel.getByRole('button', { name: '打开生产订单', exact: true }).count(), 0)
      },
    },
    {
      ...common,
      name: 'unified-inventory-distribution-details',
      path: '/erp/warehouse/inventory?view=balances',
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await assertBusinessViewMotion(
          page,
          'inventory-distribution',
          outputDir,
          { presentationSelector: '.erp-inventory-ledger-page .erp-business-operation-panel__view-switch .ant-segmented-group' }
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
              .locator('.erp-inventory-ledger-page .erp-business-operation-panel__view-switch')
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
        const navigationDrawer = page.locator('.erp-admin-drawer')
        if (await navigationDrawer.isVisible()) {
          await page.keyboard.press('Escape')
          await navigationDrawer.waitFor({ state: 'hidden' })
        }
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
    ...createDeliveryBoardScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession, outputDir }),
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
        assert.ok(await firstLine.getByLabel('产品名称', { exact: true }).isVisible())
        await firstLine
          .getByLabel('产品名称', { exact: true })
          .fill('保存前原始行')
        await firstLine
          .getByRole('button', { name: '复制第 1 行', exact: true })
          .click()
        const copiedLine = lines.nth(1)
        assert.ok(await copiedLine.getByLabel('产品名称', { exact: true }).isVisible())
        await copiedLine
          .getByLabel('产品名称', { exact: true })
          .fill('复制后的追加行')
        assert.equal(await firstLine.getByLabel('产品名称', { exact: true }).inputValue(), '保存前原始行')
        assert.equal(await editor.getByRole('button', { name: /^(上移|下移)第 \d+ 行$/u }).count(), 0)
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
          ['保存前原始行', '复制后的追加行']
        )
        assert.equal(params.items[0].id, 1)
        assert.ok(!params.items[1].id)
        await editor.waitFor({ state: 'hidden' })
      },
    },
    {
      ...common,
      name: 'unified-purchase-interactions',
      path: '/erp/purchase/accessories',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/purchase_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_purchase_orders', 'list_purchase_followups', 'get_purchase_order'].includes(method)) return route.fallback()
          if (purchaseArrivalFail && method === 'list_purchase_followups') {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message: '计划读取失败' } }) })
          }
          const orders = rows.map((row, index) => ({
            id: row.id,
            purchase_order_no: `PO-UI-${row.id}`,
            supplier_id: 1,
            supplier_snapshot: { name: index === 0 ? '交互验证供应商（加长名称与材料业务合作分公司）' : '交互验证供应商' },
            lifecycle_status: 'approved',
            version: 1,
            expected_arrival_date:
              index % 5
                ? unix(moveBusinessDate(today, index % 3 === 0 ? -2 : 2))
                : null,
            supplier_confirmed_arrival_date:
              index % 2 ? unix(moveBusinessDate(today, 3)) : null,
          }))
          if (method === 'get_purchase_order') return respond(route, id, { purchase_order: orders.find((order) => order.id === params.id) })
          if (method === 'list_purchase_followups') {
            const followups = orders.map((order) => {
              const due = order.supplier_confirmed_arrival_date || order.expected_arrival_date
              const date = due ? new Date(due * 1000).toISOString().slice(0, 10) : ''
              return { key: `arrival:${order.id}`, source_type: 'purchase_order', source_id: order.id, source_no: order.purchase_order_no, order_id: order.id, order_no: order.purchase_order_no, line_id: order.id, line_no: '1', supplier_id: 1, supplier_name: order.supplier_snapshot.name, material_code: `MAT-${order.id}`, material_name: '到货模拟材料', unit_name: '米', quantity: '20', due_date: date, date_source: order.supplier_confirmed_arrival_date ? 'confirmed' : 'expected', kind: !date ? 'unscheduled' : date < today ? 'overdue' : 'due_soon' }
            })
            return respond(route, id, purchaseFollowupFixture(followups, params, today))
          }
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
        const navigation = page.getByRole('tablist', { name: '查询视图', exact: true })
        const navigationNode = await navigation.elementHandle()
        const before = await navigation.boundingBox()
        assert.deepEqual(await navigation.getByRole('tab').allTextContents(), ['订单列表', '采购跟进'])
        await navigation.getByRole('tab', { name: '订单列表', exact: true }).focus()
        await navigation.getByRole('tab', { name: '订单列表', exact: true }).press('End')
        await navigation.getByRole('tab', { name: '采购跟进', selected: true }).waitFor()
        assert.equal(await navigationNode.evaluate((node) => node.isConnected && node === document.querySelector('.erp-business-visual-switch [role="tablist"]')), true, '切换内容保留同一分类条')
        const after = await navigation.boundingBox()
        assert.ok(Math.abs(before.y - after.y) < 1 && Math.abs(before.height - after.height) < 1, '内容切换不改变分类条位置')
        await navigation.getByRole('tab', { name: '采购跟进', exact: true }).press('Home')
        await navigation.getByRole('tab', { name: '订单列表', selected: true }).waitFor()
        await page.getByText('采购跟进', { exact: true }).click()
        const panel = page.getByRole('region', { name: '采购跟进' })
        assert.equal(await panel.locator('.erp-arrival-calendar__day').count(), 0)
        await panel.getByRole('button', { name: '到货日历', exact: true }).click()
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
        const geometry = await panel.locator('.erp-arrival-calendar__toolbar').evaluate((element) => {
          const period = element.querySelector('.erp-arrival-calendar__period').getBoundingClientRect()
          const filters = element.querySelector('.erp-arrival-calendar__filters').getBoundingClientRect()
          return { height: element.getBoundingClientRect().height, delta: Math.abs(period.top - filters.top), dateWidth: element.querySelector('.erp-arrival-calendar__date-jump').getBoundingClientRect().width }
        })
        assert.ok(geometry.height < 70 && geometry.delta < 1 && geometry.dateWidth < 180, JSON.stringify(geometry))
        assert.equal(await page.getByRole('button', { name: '表格工具', exact: true }).count(), 0)
        assert.equal(await panel.getByRole('button', { name: /^全部\s*500/ }).getAttribute('aria-pressed'), 'true')
        await page.screenshot({ path: `${outputDir}/purchase-arrival-default-4k.png`, fullPage: false })
        await panel.getByRole('group', { name: '交期来源', exact: true }).getByRole('button', { name: '供应商确认交期', exact: true }).click()
        await panel.getByRole('button', { name: /^全部\s*250/ }).waitFor()
        assert.ok((await panel.locator('.erp-arrival-calendar__detail-head').innerText()).includes('250 项'))
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 12000 }),
          panel.getByRole('button', { name: '导出当前结果', exact: true }).click({ timeout: 8000 }),
        ])
        const { readFile } = await import('node:fs/promises')
        const csv = await readFile(await download.path(), 'utf8')
        assert.equal(csv.trim().split('\n').length, 251, '导出应覆盖全部筛选结果，不受当前 25 行限制')
        assert.ok(csv.includes('待到货面料') || csv.includes('到货模拟材料'))
        await panel.getByRole('button', { name: '重置到货筛选', exact: true }).click()
        await panel.locator('.ant-pagination-next button').click()
        assert.equal(await panel.getByRole('button', { name: '打开采购单', exact: true }).count(), 25)
        await panel.getByRole('button', { name: '今天', exact: true }).click()
        await panel.getByText('当前范围没有需要跟进的事项', { exact: true }).waitFor()
        assert.equal(await panel.getByRole('button', { name: '导出当前结果', exact: true }).isEnabled(), false)
        assert.equal(await panel.locator('.ant-pagination').count(), 0)
        await panel.getByRole('button', { name: '重置到货筛选', exact: true }).click()
        await panel.getByRole('button', { name: /^全部\s*\d/ }).click()
        assert.equal(
          await panel.locator('.ant-table-tbody > tr[data-row-key]').count(),
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
        await panel.getByRole('button', { name: /^未排交期/ }).click()
        await panel.locator('.ant-table-tbody > tr[data-row-key]').first().waitFor()
        assert.equal(
          await panel.locator('.ant-table-tbody > tr[data-row-key]').count(),
          25
        )
        await page.getByText('订单列表', { exact: true }).click()
        await page.getByText('采购跟进', { exact: true }).click()
        await panel.locator('.erp-arrival-calendar__day').first().waitFor()
        assert.equal(
          await panel
            .getByRole('button', { name: /^未排交期/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        purchaseArrivalFail = true
        await page.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await panel.getByRole('button', { name: '重新加载', exact: true }).waitFor()
        assert.equal(await panel.locator('.ant-table-tbody > tr[data-row-key]').count(), 0, '加载失败不能展示旧清单')
        assert.equal(await panel.getByRole('button', { name: '打开采购单', exact: true }).count(), 0)
        purchaseArrivalFail = false
        await panel.getByRole('button', { name: '重新加载', exact: true }).click()
        await panel.locator('.ant-table-tbody > tr[data-row-key]').first().waitFor()
        for (const width of [1920, 1440, 768, 390]) {
          await page.setViewportSize({ width, height: width === 1920 ? 1080 : 900 })
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
        await page.keyboard.press('Escape')
        await page.locator('.erp-admin-drawer.ant-drawer-open').waitFor({ state: 'hidden' })
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
      name: 'purchase-arrival-design',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('.nav-item[data-page="purchase"]').click()
        await frame.locator('[data-action="purchase-view"][data-value="followup"]').click()
        const plan = frame.locator('.arrival-plan-surface')
        await plan.waitFor()
        assert.equal(await plan.locator('.arrival-day').count(), 0, '设计样例默认显示统一跟进清单')
        assert.ok(await plan.locator('tbody tr').count() > 0)
        assert.ok(await plan.getByText('缺少单价', { exact: true }).count() > 0)
        await plan.locator('[data-action="arrival-calendar"]').click()
        await plan.locator('.arrival-day').first().waitFor()
        assert.equal(await plan.locator('.arrival-day').count(), 14)
        assert.equal(await frame.locator('[data-action="arrival-select"][data-value="all"]').getAttribute('aria-pressed'), 'true')
        const { chooseSelectOption } = await import('./selectControlActions.mjs')
        await chooseSelectOption(plan.locator('#arrival-confirmation'), 'confirmed')
        assert.equal(await plan.locator('#arrival-confirmation').evaluate((element) => element.value), 'confirmed')
        await plan.locator('[data-action="arrival-reset"]').click()
        await frame.locator('[data-action="arrival-select"][data-value="missing_price"]').click()
        for (const text of await plan.locator('tbody tr td:nth-child(6)').allTextContents()) assert.equal(text, '缺少单价')
        await plan.locator('[data-action="arrival-period"][data-value="14"]').click()
        assert.match(await plan.locator('.arrival-results-head').first().innerText(), /当前 14 天/)
        await plan.locator('[data-action="arrival-reset"]').first().click()
        await plan.locator('[data-action="arrival-calendar"]').click()
        assert.equal(await plan.locator('.arrival-day').count(), 0)
        await assertNoHorizontalOverflow(page, 'purchase-arrival-design')
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
            status: index === 499 ? 'SETTLED' : 'POSTED',
            counterparty_type: params.fact_type === 'RECEIVABLE' ? 'CUSTOMER' : 'SUPPLIER',
            counterparty_id: 1,
            version: 1,
            source_type: 'SHIPMENT',
            source_id: 1,
            source_no: 'SH-STYLE-L1',
            amount: '100',
            outstanding_amount: index >= 498 ? '0' : index % 5 ? '60' : null,
            currency: index % 2 ? 'USD' : 'CNY',
            due_at: unix(moveBusinessDate(today, index % 2 ? -2 : 3)),
          }))
          const matching = params.status ? facts.filter((fact) => fact.status === params.status) : facts
          return respond(route, id, {
            ...stylePaginatedRpcData(matching, 'finance_facts', params),
            status_counts: { POSTED: 499, SETTLED: 1 },
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true, selected: true }).waitFor()
        const toolbar = page.locator('.erp-business-operation-panel__command')
        const assertToolbarLayout = async (width, groupLabel) => {
          const layout = await toolbar.evaluate((element, label) => {
            const view = element.querySelector('[aria-label="查询视图"]')
            const statuses = element.querySelector(`[aria-label="${label}"]`)
            if (!view || !statuses) return null
            const box = (node) => {
              const { x, y, width, height, right, bottom } = node.getBoundingClientRect()
              return { x, y, width, height, right, bottom }
            }
            const divider = getComputedStyle(view.closest('.erp-business-operation-panel__content-switch'), '::after')
            return {
              toolbar: box(element),
              view: box(view),
              statuses: box(statuses),
              dividerWidth: parseFloat(divider.width),
              dividerHeight: parseFloat(divider.height),
              statusOverflow: statuses.scrollWidth - statuses.clientWidth,
            }
          }, groupLabel)
          assert.ok(layout, '账款视图和状态须在同一工具栏内')
          assert.equal(layout.dividerWidth, 1, '视图与状态之间保留细竖线')
          assert.ok(layout.dividerHeight >= 16, '竖线分组应可见')
          assert.ok(layout.statusOverflow <= 1, '窄屏状态按钮应换行，不能裁切')
          assert.ok(layout.statuses.right <= layout.toolbar.right + 1, '状态筛选不能溢出工具栏')
          if (width >= 1440) {
            assert.ok(Math.abs(layout.view.y + layout.view.height / 2 - layout.statuses.y - layout.statuses.height / 2) <= 1, '宽屏视图与状态应在同一行居中对齐')
            assert.ok(layout.statuses.x > layout.view.right, '状态筛选位于视图切换右侧')
          } else if (width === 390) {
            assert.ok(layout.statuses.y >= layout.view.bottom, '窄屏状态组应自然换到下一行')
          }
        }
        await assertToolbarLayout(1440, '单据状态')
        const postedStatus = toolbar.getByRole('button', { name: /^已过账，/u })
        await postedStatus.click()
        await assertBusinessViewMotion(page, 'finance-view', outputDir)
        const dueChoices = toolbar.getByRole('group', { name: '到期情况', exact: true })
        const panel = page.getByRole('region', { name: '财务到期顺序' })
        const filters = page.getByRole('dialog', { name: '筛选条件' })
        const clearStatus = toolbar.getByRole('button', { name: '清除单据状态：已过账' })
        await dueChoices.getByRole('button', { name: /^全部\s*499$/u }).waitFor()
        assert.equal(await clearStatus.isVisible(), true)
        assert.equal(await postedStatus.count(), 0)
        assert.equal(await panel.locator('.erp-business-visual-frame__heading').count(), 0)
        assert.equal(await dueChoices.getByRole('button', { name: /^未填到期日|^已结清/u }).count(), 0)
        await toolbar.getByRole('button', { name: '筛选，已应用 1 项' }).click()
        await filters.getByRole('button', { name: /^已结清（含未结金额为零）\s*1$/u }).click()
        await filters.getByRole('button', { name: '收起' }).click()
        await panel.locator('tbody tr[data-row-key]').filter({ hasText: 'RECEIVABLE-UI-499' }).waitFor()
        assert.equal(await panel.locator('tbody tr[data-row-key]').count(), 1)
        await clearStatus.click()
        await dueChoices.getByRole('button', { name: /^已结清（含未结金额为零）\s*2$/u }).waitFor()
        assert.equal(await panel.locator('tbody tr[data-row-key]').count(), 2)
        await toolbar.getByRole('button', { name: '筛选，已应用 1 项' }).click()
        await filters.getByRole('button', { name: /^未填到期日\s*0$/u }).click()
        await filters.getByRole('button', { name: '收起' }).click()
        await panel.getByText('当前筛选暂无数据').waitFor()
        await toolbar.getByRole('button', { name: '清空筛选' }).click()
        await dueChoices.getByRole('button', { name: /^全部\s*500$/u, pressed: true }).waitFor()
        await panel.locator('tbody tr[data-row-key]').first().waitFor()
        await assertVisualStatuses(panel, assert)
        assert.equal(await (await firstDueCell(panel, '客户')).textContent(), '暗色客户')
        assert.match(await (await firstDueCell(panel, '到期情况')).textContent(), /逾期/u)
        assert.equal(
          await panel.locator('tbody tr[data-row-key]').count(),
          25
        )
        await dueChoices.getByRole('button', { name: /^金额待核对/ }).click()
        await toolbar.getByRole('button', { name: '筛选', exact: true }).click()
        await filters.getByRole('group', { name: '单据状态' }).getByRole('button', { name: /^已过账，/u }).click()
        await filters.getByRole('button', { name: '收起' }).click()
        await clearStatus.waitFor()
        await toolbar.getByRole('button', { name: '清空筛选' }).click()
        await clearStatus.waitFor({ state: 'hidden' })
        await dueChoices.getByRole('button', { name: /^金额待核对\s*100$/u, pressed: true }).waitFor()
        await panel.locator('tbody tr[data-row-key]').first().waitFor()
        assert.equal(await (await firstDueCell(panel, '未结金额')).textContent(), '—')
        await toolbar.getByRole('button', { name: '表格工具', exact: true }).click()
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          page.getByRole('menuitem', { name: /导出筛选结果/u }).click(),
        ])
        const csv = await readFile(await download.path(), 'utf8')
        const [, ...exportedRows] = csv.trim().split(/\r?\n/u)
        assert.equal(exportedRows.length, 100, '导出包含所有匹配账款')
        assert.ok(exportedRows.every((row) => row.includes('金额待核对') && row.includes('暗色客户')))
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应付', exact: true }).click()
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应付', exact: true, selected: true }).waitFor()
        await page.getByText('到期顺序', { exact: true }).click()
        await panel.locator('tbody tr[data-row-key]').first().waitFor()
        await assertToolbarLayout(1440, '到期情况')
        assert.equal(await (await firstDueCell(panel, '供应商')).textContent(), '样式供应商')
        assert.match(await (await firstDueCell(panel, '到期情况')).textContent(), /逾期/u)
        assert.equal(
          await dueChoices
            .getByRole('button', { name: /^全部/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true }).click()
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true, selected: true }).waitFor()
        await panel.locator('tbody tr[data-row-key]').first().waitFor()
        assert.equal(
          await dueChoices
            .getByRole('button', { name: /^金额待核对/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        const selectedFactNo = await panel
          .locator('[data-copyable-column="fact_no"] .erp-business-table-copyable-cell__content')
          .first()
          .textContent()
        await panel.locator('tbody tr[data-row-key]').first().click()
        const details = page.getByRole('dialog')
        await details
          .getByRole('button', { name: '查看来源单据', exact: true })
          .click()
        await page.waitForURL(/\/erp\/warehouse\/shipments/)
        assert.equal(new URL(page.url()).searchParams.get('shipment_id'), '1')
        await page.goBack()
        await details.getByText(selectedFactNo, { exact: true }).waitFor()
        await details.getByRole('button', { name: /^关\s*闭$/u }).click()
        await details.waitFor({ state: 'hidden' })
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true, selected: true }).waitFor()
        assert.equal(
          await dueChoices
            .getByRole('button', { name: /^金额待核对/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `finance-${width}`)
          await assertToolbarLayout(width, '到期情况')
          await captureBusinessView(
            page,
            panel,
            'finance-view',
            width,
            outputDir
          )
          assert.equal(await (await firstDueCell(panel, '未结金额')).isVisible(), true)
        }
        await clickERPThemeOption(page, '暗色')
        await closeAppearanceNavigation(page)
        await captureBusinessView(
          page,
          panel,
          'finance-view-dark',
          390,
          outputDir
        )
        await assertVisualStatuses(panel, assert)
      },
    },
    {
      ...common,
      name: 'unified-production-interactions',
      path: '/erp/production/progress?display=process',
      productionOrderReleased: true,
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产执行',
          exact: true,
        })
        await panel.getByRole('table', { name: '当前生产事项' }).waitFor()
        await panel.getByText('工序对照', { exact: true }).click()
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
          .getByRole('heading', { name: /本工序批次/u })
          .waitFor()
        assert.ok((await dialog.textContent()).includes('品质检验'))
        await dialog.locator('.ant-drawer-close').click()
        await dialog.waitFor({ state: 'hidden' })
        await page.getByRole('tab', { name: '生产记录', exact: true }).click()
        await page
          .locator('.erp-production-record-workspace .ant-table-wrapper')
          .waitFor()
        await assertProductionRecordTabMotion(page, '生产执行')
        await page.getByRole('tab', { name: '生产执行', exact: true }).click()
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
  const purchase = scenarios.find((scenario) => scenario.name === 'unified-purchase-interactions')
  const finance = scenarios.find((scenario) => scenario.name === 'unified-finance-interactions')
  return [...scenarios, {
    ...purchase,
    name: 'purchase-filter-rows',
    verify: async (page) => {
      await expectHeading(page, '采购订单')
      await page.getByRole('button', { name: '筛选', exact: true }).click()
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      await filters.waitFor()
      for (const width of [1440, 740]) {
        await page.setViewportSize({ width, height: 760 })
        await waitForFiniteAnimations(page)
        const layout = await filters.evaluate((dialog) => {
          const body = dialog.querySelector('.erp-business-operation-panel__filters')
          const box = (node) => {
            const { left, top, bottom, width } = node.getBoundingClientRect()
            return { left, top, bottom, width }
          }
          const rows = [...body.children].filter((node) => node.offsetHeight > 0 && !node.matches('.app-scroll-edges'))
          const scopeButtons = body.querySelectorAll('[aria-label="记录范围"] button')
          return {
            width: body.clientWidth,
            rows: rows.map(box),
            dateIndex: rows.findIndex((row) => row.matches('.erp-business-date-range-filter')),
            supplierIndex: rows.findIndex((row) => row.querySelector('[aria-label="供应商"]')),
            controls: [
              box(body.querySelector('[aria-label="供应商"]').closest('.ant-select')),
              box(body.querySelector('.erp-filter-date-trigger')),
            ],
            options: [box(scopeButtons[0]), box(scopeButtons[1])],
          }
        })
        const rowWidth = width > 768 ? 260 : layout.width
        const separateRows = layout.rows.every((row, index) => !index || row.top >= layout.rows[index - 1].bottom - 1)
        assert.ok(
          separateRows && layout.supplierIndex >= 0 && layout.dateIndex === layout.supplierIndex + 1,
          `${width}px 每个条件各占一行，日期在供应商下一行 ${JSON.stringify(layout.rows)}`
        )
        const [supplier, date] = layout.controls
        assert.ok(Math.abs(supplier.left - date.left) <= 1 && layout.controls.every((control) => Math.abs(control.width - rowWidth) <= 1),
          `${width}px 供应商和日期左对齐并沿用字段宽度 ${JSON.stringify(layout.controls)}`)
        const [first, second] = layout.options
        assert.ok(Math.abs(first.top - second.top) <= 1 && second.left > first.left + first.width - 1,
          `${width}px 记录范围内的按钮横排`)
      }
      await filters.locator('.erp-filter-date-trigger').click()
      const dates = page.getByRole('dialog', { name: '选择日期范围', exact: true })
      await dates.getByRole('button', { name: '返回筛选', exact: true }).click()
      await filters.getByRole('button', { name: '收起', exact: true }).click()
      await filters.waitFor({ state: 'hidden' })
    },
  }, {
    ...finance,
    name: 'finance-filter-rows',
    verify: async (page) => {
      const modules = page.locator('.erp-business-module-tabs')
      const toolbar = page.locator('.erp-business-operation-panel__command')
      const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
      for (const tabName of ['应收', '应付']) {
        await page.setViewportSize({ width: 1440, height: 900 })
        await expectHeading(page, '财务管理')
        await modules.getByRole('tab', { name: tabName, exact: true }).click()
        await page.getByRole('tab', { name: '到期顺序', exact: true }).click()
        await page.getByRole('region', { name: '财务到期顺序' }).locator('tbody tr[data-row-key]').first().waitFor()
        await toolbar.getByRole('button', { name: '筛选', exact: true }).click()
        await filters.waitFor()
        for (const width of [1440, 740]) {
          await page.setViewportSize({ width, height: 900 })
          await waitForFiniteAnimations(page)
          const layout = await filters.evaluate((dialog) => {
            const body = dialog.querySelector('.erp-business-operation-panel__filters')
            const box = (field) => {
              const { top, bottom, width } = field.getBoundingClientRect()
              return { top, bottom, width }
            }
            const group = (label) => body.querySelector(`[role="group"][aria-label="${label}"]`).closest('fieldset')
            return {
              width: body.clientWidth,
              status: box(group('单据状态')),
              due: box(group('其他到期情况')),
              date: box(body.querySelector('.erp-business-date-range-filter')),
            }
          })
          assert.ok(layout.due.top >= layout.status.bottom && [layout.status, layout.due].every((group) => Math.abs(group.width - layout.width) <= 1),
            `${tabName} ${width}px 的两组选项各占一行 ${JSON.stringify(layout)}`)
          assert.ok(Math.abs(layout.date.width - (width > 768 ? 260 : layout.width)) <= 1,
            `${tabName} ${width}px 的日期摘要使用单字段宽度 ${JSON.stringify(layout)}`)
        }
        await filters.getByRole('button', { name: '收起', exact: true }).click()
        await filters.waitFor({ state: 'hidden' })
      }
    },
  }, {
    ...finance,
    name: 'finance-source-return',
    verify: async (page) => {
      for (const tabName of ['应收', '应付']) {
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: tabName, exact: true }).click()
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: tabName, exact: true, selected: true }).waitFor()
        await page.getByText('到期顺序', { exact: true }).click()
        const panel = page.getByRole('region', { name: '财务到期顺序', exact: true })
        await panel.locator('tbody tr[data-row-key]').first().waitFor()
        const dueFilters = page.getByRole('group', { name: '到期情况', exact: true })
        for (const [choice, status] of [[/^逾期未结/u, /逾期/u], [/^7 天内到期/u, /天后到期/u]]) {
          await dueFilters.getByRole('button', { name: choice }).click()
          const labels = await panel.locator('tbody tr[data-row-key] .erp-business-visual-status').allTextContents()
          assert.equal(labels.length, 25)
          assert.ok(labels.every((item) => status.test(item)), `${tabName}到期筛选与每行状态一致`)
        }
        const filter = dueFilters.getByRole('button', { name: /^金额待核对/u })
        await filter.click()
        await panel.locator('.ant-pagination-item-2').click()
        await panel.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
        const factNo = await panel.locator('[data-copyable-column="fact_no"] .erp-business-table-copyable-cell__content').first().textContent()
        const financeURL = page.url()
        for (const immediate of [true, false]) {
          const row = panel.locator('tbody tr[data-row-key]').first()
          if (immediate) await row.press('Enter')
          else await row.click()
          const details = page.getByRole('dialog')
          await details.getByText(factNo, { exact: true }).waitFor()
          await details.getByRole('button', { name: '查看来源单据', exact: true }).click()
          await page.waitForURL(/\/erp\/warehouse\/shipments/u)
          assert.equal(new URL(page.url()).searchParams.get('shipment_id'), '1')
          if (!immediate) await expectHeading(page, '出货单')
          await page.goBack()
          await page.waitForURL(financeURL)
          await details.getByText(factNo, { exact: true }).waitFor()
          await details.getByRole('button', { name: /^关\s*闭$/u }).click()
          await details.waitFor({ state: 'hidden' })
          await expectHeading(page, '财务管理')
          assert.equal(await filter.getAttribute('aria-pressed'), 'true', `${tabName}返回保留金额筛选`)
          await panel.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
          assert.equal(await panel.locator('[data-copyable-column="fact_no"] .erp-business-table-copyable-cell__content').first().textContent(), factNo, `${tabName}返回保留页码与记录`)
        }
        await page.screenshot({ path: `${outputDir}/finance-source-return-${tabName}.png`, fullPage: false })
      }
    },
  }, {
    ...finance,
    name: 'finance-visual-status-semantics',
    verify: async (page) => {
      await expectHeading(page, '财务管理')
      await page.getByText('到期顺序', { exact: true }).click()
      const panel = page.getByRole('region', { name: '财务到期顺序', exact: true })
      await panel.locator('tbody tr[data-row-key]').first().waitFor()
      await assertVisualStatuses(panel, assert)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await assertNoHorizontalOverflow(page, `finance-status-${width}`)
        await assertVisualStatuses(panel, assert)
        await captureBusinessView(page, panel, 'finance-status', width, outputDir)
      }
      await page.getByRole('group', { name: '到期情况', exact: true }).getByRole('button', { name: /^金额待核对/u }).click()
      await panel.locator('.erp-business-visual-status--unknown').first().waitFor()
      assert.equal(await (await firstDueCell(panel, '未结金额')).textContent(), '—')
      await clickERPThemeOption(page, '暗色')
      await closeAppearanceNavigation(page)
      await page.getByRole('group', { name: '到期情况', exact: true }).getByRole('button', { name: /^全部/u }).click()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await assertVisualStatuses(panel, assert)
        await assertNoHorizontalOverflow(page, `finance-status-dark-${width}`)
        await captureBusinessView(page, panel, 'finance-status-dark', width, outputDir)
      }
    },
  }]
}
