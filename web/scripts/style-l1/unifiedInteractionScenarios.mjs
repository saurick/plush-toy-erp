import { assertProductionRecordTabMotion, createProductionTabStabilityScenarios } from './productionTabStabilityScenarios.mjs'
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

async function assertVisualStatuses(panel, assert) {
  const statuses = await panel.locator('.erp-business-visual-status').evaluateAll((nodes) => nodes.map((node) => {
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
  let recoveryMode
  let releaseRecovery
  let recoveryRequested
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
    {
      ...common,
      name: 'sales-delivery-context-filters',
      path: '/erp/sales/project-orders/sales-orders',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        const orders = Array.from({ length: 40 }, (_, index) => ({
          id: index + 1,
          order_no: `SO-FILTER-${String(index + 1).padStart(3, '0')}`,
          customer_snapshot: { name: '交付筛选验证客户' },
          lifecycle_status: index % 2 ? 'active' : 'draft',
          version: 1,
          item_count: 2,
        }))
        const details = orders.flatMap((order, index) => [0, 1].map((line) => ({
          ...order,
          id: index * 2 + line + 1,
          sales_order_id: order.id,
          customer_name: order.customer_snapshot.name,
          requested_product_name: `交付产品 ${line + 1}`,
          ordered_quantity: '100',
          shipped_quantity: '40',
          unshipped_quantity: '60',
          unit_name: '只',
          planned_delivery_date: unix(moveBusinessDate(today, line ? 3 : -2)),
          line_status: 'open',
        })))
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_orders') {
            const counted = orders.filter((order) => !params.keyword || order.order_no.includes(params.keyword))
            const selected = counted.filter((order) => !params.lifecycle_status || order.lifecycle_status === params.lifecycle_status)
            return respond(route, id, {
              ...stylePaginatedRpcData(selected, 'sales_orders', params),
              status_counts: Object.fromEntries(['draft', 'active'].map((status) => [status, counted.filter((order) => order.lifecycle_status === status).length])),
            })
          }
          if (method === 'list_sales_order_summary') {
            const selected = details.filter((row) => (!params.keyword || row.order_no.includes(params.keyword)) && (!params.lifecycle_status || row.lifecycle_status === params.lifecycle_status))
            return respond(route, id, stylePaginatedRpcData(selected, 'items', params))
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const operation = page.locator('.erp-business-operation-panel')
        const orderFilters = page.getByRole('group', { name: '销售订单状态', exact: true })
        await orderFilters.getByRole('button', { name: '草稿，共 20 张', exact: true }).click()
        await page.getByText('交付进度', { exact: true }).click()
        const deliveryFilters = page.getByRole('group', { name: '交付情况', exact: true })
        const panel = page.getByRole('region', { name: '销售交付进度', exact: true })
        await deliveryFilters.getByRole('button', { name: '全部明细，共 40 条', exact: true }).waitFor()
        await panel.locator('tbody tr[data-row-key]').first().waitFor()
        assert.equal(await orderFilters.count(), 0, '交付视图不再同时展示订单状态快捷筛选')
        assert.equal(await operation.getByRole('group', { name: '快捷筛选', exact: true }).count(), 1)
        assert.equal(await panel.locator('.erp-business-visual-frame__heading').count(), 0)
        await operation.getByRole('button', { name: '清除订单状态：草稿', exact: true }).waitFor()
        await panel.locator('.ant-pagination-item-2').click()
        await page.getByText('订单列表', { exact: true }).click()
        await page.getByText('交付进度', { exact: true }).click()
        await panel.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
        await operation.getByRole('button', { name: /^筛选/u }).click()
        const filterDialog = page.getByRole('dialog', { name: '筛选条件', exact: true })
        await filterDialog.getByRole('group', { name: '订单状态', exact: true }).getByRole('button', { name: '已生效', exact: true }).click()
        await filterDialog.getByRole('button', { name: '完成', exact: true }).click()
        await operation.getByRole('button', { name: '清除订单状态：已生效', exact: true }).waitFor()
        await panel.locator('.ant-pagination-item-1.ant-pagination-item-active').waitFor()
        await deliveryFilters.getByRole('button', { name: '逾期，共 20 条', exact: true }).click()
        await operation.getByRole('button', { name: '清空筛选', exact: true }).click()
        await deliveryFilters.getByRole('button', { name: '逾期，共 40 条', exact: true }).waitFor()
        assert.equal(await deliveryFilters.getByRole('button', { name: /^逾期/u }).getAttribute('aria-pressed'), 'true', '清空额外条件保留交付快捷筛选')
        assert.equal(await operation.getByRole('button', { name: /^清除订单状态/u }).count(), 0)
        await panel.locator('.ant-pagination-item-2').click()
        const search = operation.getByRole('textbox')
        await search.fill('SO-FILTER-003')
        await search.press('Enter')
        await deliveryFilters.getByRole('button', { name: '全部明细，共 2 条', exact: true }).waitFor()
        await panel.locator('.ant-pagination-item-1.ant-pagination-item-active').waitFor()
        assert.equal(await panel.locator('tbody tr[data-row-key]').count(), 1, '搜索与逾期条件取交集')
        await search.fill('')
        await search.press('Enter')
        await deliveryFilters.getByRole('button', { name: '逾期，共 40 条', exact: true }).click()
        assert.equal(await deliveryFilters.getByRole('button', { name: /^全部明细/u }).getAttribute('aria-pressed'), 'true', '再次点击已选快捷条件恢复全部明细')
        await operation.getByRole('button', { name: /^筛选/u }).click()
        await filterDialog.getByRole('group', { name: '订单状态', exact: true }).getByRole('button', { name: '草稿', exact: true }).click()
        await filterDialog.getByRole('button', { name: '完成', exact: true }).click()
        await deliveryFilters.getByRole('button', { name: '全部明细，共 40 条', exact: true }).waitFor()
        await operation.getByRole('button', { name: '清除订单状态：草稿', exact: true }).click()
        await deliveryFilters.getByRole('button', { name: '全部明细，共 80 条', exact: true }).waitFor()
        await page.screenshot({ path: `${outputDir}/sales-delivery-filters-4k.png` })
        for (const width of [1440, 820, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `sales-delivery-filters-${width}`)
        }
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
        const deliveryFilters = page.getByRole('group', { name: '交付情况', exact: true })
        const count = deliveryFilters.locator('.erp-filter-chip__count').first()
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
        assert.equal(await count.textContent(), '0 条')
        await captureBusinessView(page, panel, 'sales-empty', 1440, outputDir)
        recoveryMode = 'data'
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').first().waitFor()
        assert.equal(await page.locator('.erp-business-operation-panel__selection').count(), 0)
        assert.equal(await page.getByRole('button', { name: /列设置|新建订单/ }).count(), 0)
        assert.equal(await panel.locator('.erp-business-visual-frame__heading').count(), 0, '表格上方不再重复放交付快捷筛选')
        assert.match(await deliveryFilters.textContent(), /全部明细.*条/u)
        assert.equal(await count.textContent(), '3 条')
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
      name: 'unified-sales-interactions',
      path: '/erp/sales/project-orders/sales-orders',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        const deliveryRows = rows.map((row, index) => ({
          ...row,
          product_id: 7,
          ...(index === 4 ? {
            customer_name: '交付交互验证客户（毛绒玩具礼品定制与海外业务分公司）',
            requested_product_name: '可拆卸服装长名称毛绒玩具组合套装（含礼盒与多语言包装）',
            customer_product_no: 'CUSTOMER-PLUSH-TOY-GIFT-2026-EXPORT-0005',
          } : {}),
        }))
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_product_image_references') {
            return respond(route, id, { images: (params.product_ids || []).map((product_id) => ({ product_id, image_attachment_id: 8801 })) })
          }
          if (method === 'list_attachments' && params.owner_type === 'product' && params.owner_id === 7) {
            return respond(route, id, { attachments: [{ id: 8801, owner_type: 'product', owner_id: 7, attachment_type: 'product_image', slot_key: 'primary', mime_type: 'image/png' }] })
          }
          return route.fallback()
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_order_summary')
            { return respond(
              route,
              id,
              stylePaginatedRpcData(deliveryRows, 'items', params)
            ) }
          if (method === 'get_sales_order')
            { return respond(route, id, {
              sales_order: {
                ...deliveryRows.find((row) => row.id === params.id),
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
        const deliveryFilters = page.getByRole('group', { name: '交付情况', exact: true })
        await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').first().waitFor()
        await assertVisualStatuses(panel, assert)
        const table = panel.locator('.erp-sales-delivery-table')
        assert.deepEqual(await table.locator('thead th').allTextContents(), ['订单 / 客户', '产品', '交付日期', '出货进度', '剩余待交', '交付状态'])
        const first = table.locator('tbody tr[data-row-key]').first()
        const geometry = await first.evaluate((row) => ({
          height: row.getBoundingClientRect().height,
          progressWidth: row.querySelector('.erp-sales-delivery-progress').getBoundingClientRect().width,
          imageWidth: row.querySelector('.erp-task-product-image').getBoundingClientRect().width,
        }))
        assert.ok(geometry.height <= 90, `交付行沿用紧凑表格密度：${JSON.stringify(geometry)}`)
        assert.ok(geometry.progressWidth <= 220, '进度条保持短列内展示')
        assert.equal(geometry.imageWidth, 48, '保留共享产品缩略图尺寸')
        await page.screenshot({ path: `${outputDir}/sales-delivery-table-4k.png` })
        const picture = first.getByRole('button', { name: /查看.*大图/u })
        await picture.click()
        const preview = page.locator('.erp-task-image-preview .ant-image-preview')
        await preview.waitFor()
        const previewImage = preview.locator('.erp-task-image-preview__stage img')
        await previewImage.waitFor()
        await previewImage.evaluate((image) => image.decode())
        assert.equal(await page.getByRole('dialog', { name: '销售订单详情' }).count(), 0, '图片预览不误开订单')
        await page.keyboard.press('Escape')
        await preview.waitFor({ state: 'hidden' })
        assert.equal(await picture.evaluate((node) => node === document.activeElement), true)
        const progress = first.getByRole('button', { name: /出货进度$/u })
        await progress.focus()
        await page.getByText('完成比例 40%', { exact: true }).waitFor()
        await progress.press('Escape')
        assert.equal(await progress.getAttribute('aria-expanded'), 'false')
        const orderLink = first.getByRole('button', { name: /^打开销售订单/u })
        await orderLink.click()
        const orderDetails = page.getByRole('dialog', { name: '销售订单详情' })
        await orderDetails.waitFor()
        await orderDetails.getByRole('button', { name: /^关\s*闭$/u }).click()
        await orderDetails.waitFor({ state: 'hidden' })
        assert.equal(await orderLink.evaluate((node) => node === document.activeElement), true)
        assert.equal(
          await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').count(),
          25
        )
        await panel.locator('.ant-pagination-item-2').click()
        const firstRow = await panel
          .locator('.erp-sales-delivery-table tbody tr[data-row-key]')
          .first()
          .textContent()
        await page.getByText('订单列表', { exact: true }).click()
        await page.getByText('交付进度', { exact: true }).click()
        await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').first().waitFor()
        assert.equal(
          await panel
            .locator('.erp-sales-delivery-table tbody tr[data-row-key]')
            .first()
            .textContent(),
          firstRow
        )
        await deliveryFilters.getByRole('button', { name: /^待核对/ }).click()
        assert.equal(await panel.locator('.ant-progress').count(), 0)
        assert.equal(
          await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').count(),
          25
        )
        await deliveryFilters.getByRole('button', { name: /^逾期/ }).click()
        const orderNo = await panel
          .locator('.erp-sales-delivery-order button')
          .first()
          .textContent()
        await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').first().dblclick()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        assert.ok((await dialog.textContent()).includes(orderNo))
        await dialog.getByRole('button', { name: /^关\s*闭$/ }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(
          await panel
            .locator('.erp-sales-delivery-table tbody tr[data-row-key]')
            .first()
            .evaluate((element) => element.contains(document.activeElement)),
          true
        )
        assert.equal(
          await deliveryFilters
            .getByRole('button', { name: /^逾期/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        await panel
          .locator('.erp-sales-delivery-table tbody tr[data-row-key]')
          .last()
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
        await panel.locator('.erp-sales-delivery-table tbody tr[data-row-key]').first().waitFor()
        await page.waitForFunction(
          (top) =>
            Math.abs(
              document.querySelector('.erp-admin-content').scrollTop - top
            ) < 2,
          scrollTop
        )
        assert.equal(
          await deliveryFilters
            .getByRole('button', { name: /^逾期/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `sales-${width}`)
          const longRow = panel.locator('tbody tr[data-row-key]').filter({ hasText: '可拆卸服装长名称毛绒玩具组合套装' })
          const overflow = await longRow.locator('td').evaluateAll((cells) => cells.map((cell) => cell.scrollWidth - cell.clientWidth))
          assert.ok(overflow.length === 6 && overflow.every((value) => value <= 1), `长名称保持在所属列内：${JSON.stringify({ width, overflow })}`)
          await captureBusinessView(page, panel, 'sales-view', width, outputDir)
        }
        await clickERPThemeOption(page, '暗色')
        await closeAppearanceNavigation(page)
        await assertNoHorizontalOverflow(page, 'sales-dark')
        await assertVisualStatuses(panel, assert)
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
      name: 'sales-delivery-order-focus',
      path: '/erp/sales/project-orders/sales-orders',
      beforeNavigate: async (page) => {
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_order_summary') return respond(route, id, stylePaginatedRpcData(rows.slice(0, 1), 'items', params))
          if (method === 'get_sales_order') return respond(route, id, { sales_order: { ...rows[0], customer_snapshot: { name: '交互验证客户' }, version: 1 } })
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.getByRole('heading', { name: '销售订单', exact: true }).waitFor()
        await page.getByRole('tab', { name: '交付进度', exact: true }).click()
        const row = page.locator('.erp-sales-delivery-table tbody tr[data-row-key]').first()
        const order = row.getByRole('button', { name: /^打开销售订单/u })
        const details = page.getByRole('dialog', { name: '销售订单详情' })
        await order.click()
        await details.waitFor()
        await details.getByRole('button', { name: /^关\s*闭$/u }).click()
        await details.waitFor({ state: 'hidden' })
        assert.equal(await order.evaluate((node) => node === document.activeElement), true, '鼠标打开详情后返回订单号')
        await order.press('Enter')
        await details.waitFor()
        await details.getByRole('button', { name: /^关\s*闭$/u }).click()
        await details.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.matches('.erp-sales-delivery-order button'))
        assert.equal(await order.evaluate((node) => node === document.activeElement), true, '键盘打开详情后返回订单号')
        await row.locator('td').nth(2).dblclick()
        await details.waitFor()
        await details.getByRole('button', { name: /^关\s*闭$/u }).click()
        await details.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.matches('.erp-sales-delivery-order button'))
        assert.equal(await order.evaluate((node) => node === document.activeElement), true, '双击明细后返回同一订单号')
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
        await panel.getByRole('combobox', { name: '交期来源', exact: true }).click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '供应商确认交期' }).click()
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
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true, selected: true }).waitFor()
        const toolbar = page.locator('.erp-business-operation-panel__command')
        const assertToolbarLayout = async (width) => {
          const layout = await toolbar.evaluate((element) => {
            const view = element.querySelector('[aria-label="查询视图"]')
            const statuses = element.querySelector('[aria-label="单据状态"]')
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
          })
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
        await assertToolbarLayout(1440)
        const postedStatus = toolbar.getByRole('button', { name: /^已过账，/u })
        await postedStatus.click()
        await assertBusinessViewMotion(page, 'finance-view', outputDir)
        assert.equal(await postedStatus.getAttribute('aria-pressed'), 'true', '切换视图应保留状态筛选')
        await toolbar.getByRole('button', { name: /^不限状态，/u }).click()
        await page.getByText('到期顺序', { exact: true }).click()
        const panel = page.getByRole('region', { name: '财务到期顺序' })
        await panel.locator('.erp-finance-due-list__row').first().waitFor()
        await assertVisualStatuses(panel, assert)
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
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应付', exact: true, selected: true }).waitFor()
        await page.getByText('到期顺序', { exact: true }).click()
        await panel.locator('.erp-finance-due-list__row').first().waitFor()
        await assertToolbarLayout(1440)
        assert.equal(
          await panel
            .getByRole('button', { name: /^全部/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true }).click()
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true, selected: true }).waitFor()
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
        await details.getByText(selectedFactNo, { exact: true }).waitFor()
        await details.getByRole('button', { name: /^关\s*闭$/u }).click()
        await details.waitFor({ state: 'hidden' })
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: '应收', exact: true, selected: true }).waitFor()
        assert.equal(
          await panel
            .getByRole('button', { name: /^金额待核对/ })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `finance-${width}`)
          await assertToolbarLayout(width)
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
  const finance = scenarios.find((scenario) => scenario.name === 'unified-finance-interactions')
  return [...scenarios, {
    ...finance,
    name: 'finance-source-return',
    verify: async (page) => {
      for (const tabName of ['应收', '应付']) {
        await expectHeading(page, '财务管理')
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: tabName, exact: true }).click()
        await page.locator('.erp-business-module-tabs').getByRole('tab', { name: tabName, exact: true, selected: true }).waitFor()
        await page.getByText('到期顺序', { exact: true }).click()
        const panel = page.getByRole('region', { name: '财务到期顺序', exact: true })
        await panel.locator('.erp-finance-due-list__row').first().waitFor()
        const filter = panel.getByRole('button', { name: /^金额待核对/u })
        await filter.click()
        await panel.locator('.ant-pagination-item-2').click()
        await panel.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
        const factNo = await panel.locator('.erp-finance-due-list__row strong').first().textContent()
        const financeURL = page.url()
        for (const immediate of [true, false]) {
          await panel.locator('.erp-finance-due-list__row').first().click()
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
          assert.equal(await panel.locator('.erp-finance-due-list__row strong').first().textContent(), factNo, `${tabName}返回保留页码与记录`)
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
      await panel.locator('.erp-finance-due-list__row').first().waitFor()
      await assertVisualStatuses(panel, assert)
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await assertNoHorizontalOverflow(page, `finance-status-${width}`)
        await assertVisualStatuses(panel, assert)
        await captureBusinessView(page, panel, 'finance-status', width, outputDir)
      }
      await panel.getByRole('button', { name: /^金额待核对/u }).click()
      await panel.locator('.erp-business-visual-status--unknown').first().waitFor()
      assert.equal(await panel.locator('.erp-finance-due-list__amount').nth(2).textContent(), '未结金额—')
      await clickERPThemeOption(page, '暗色')
      await closeAppearanceNavigation(page)
      await panel.getByRole('button', { name: /^全部/u }).click()
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: 900 })
        await assertVisualStatuses(panel, assert)
        await assertNoHorizontalOverflow(page, `finance-status-dark-${width}`)
        await captureBusinessView(page, panel, 'finance-status-dark', width, outputDir)
      }
    },
  }]
}
