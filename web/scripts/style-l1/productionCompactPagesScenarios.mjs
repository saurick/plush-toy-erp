import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createProductionCompactPagesScenarios({
  common,
  outputDir,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
}) {
  const base = {
    ...common,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  }
  async function compactCommand(page, name) {
    const command = page.locator('.erp-business-operation-panel__command')
    await command.waitFor()
    const centers = await command.evaluate((el) =>
      [...el.children]
        .filter((child) => child.getBoundingClientRect().width > 0)
        .map((child) => {
          const r = child.getBoundingClientRect()
          return r.y + r.height / 2
        })
    )
    assert.ok(
      Math.max(...centers) - Math.min(...centers) <= 1,
      `${name} 宽屏工具栏对齐同一行`
    )
    assert.equal(
      await page.locator('.erp-business-operation-panel__selection').count(),
      1,
      '操作区持续挂载，选择记录时不挤动表格'
    )
  }
  async function shot(page, name) {
    await waitForFiniteAnimations(page)
    await page.screenshot({
      path: path.join(outputDir, `${name}-4k.png`),
      scale: 'device',
    })
  }
  const scenarios = [
    {
      ...base,
      name: 'production-orders-compact-review',
      path: '/erp/production/orders',
      productionOrderReleased: true,
      verify: async (page) => {
        const row = page.locator('.ant-table-tbody tr[data-row-key="71"]')
        await row.waitFor()
        await compactCommand(page, '生产订单')
        await shot(page, 'production-orders-compact')
        await row.click()
        await page.locator('.erp-business-operation-panel__selection').waitFor()
        await page.locator('[data-business-action-key="view"]').click()
        await page
          .getByRole('button', { name: '返回列表', exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await row.waitFor()
        assert.equal(await row.locator('input[type="radio"]').isChecked(), true)
        for (const width of [1440, 1024, 768]) {
          await page.setViewportSize({ width, height: 1000 })
          await assertNoHorizontalOverflow(
            page,
            `production-orders-compact-${width}`
          )
        }
      },
    },
    {
      ...base,
      name: 'production-record-compact-details',
      path: '/erp/production/progress',
      verify: async (page) => {
        const row = page.locator('.ant-table-tbody tr[data-row-key="1"]')
        await row.waitFor()
        await compactCommand(page, '生产记录')
        const query = page.locator(
          '.erp-business-operation-panel__search input'
        )
        const searched = page.waitForResponse((response) => response.url().endsWith('/rpc/operational_fact') && response.request().postDataJSON()?.method === 'list_production_facts' && response.request().postDataJSON().params.keyword === 'PROD-FACT')
        await query.fill('PROD-FACT')
        await query.press('Enter')
        await searched
        await row.click()
        await page
          .locator('[data-business-action-key="operational-fact-details"]')
          .click()
        const drawer = page.getByRole('dialog', {
          name: '生产记录详情',
          exact: true,
        })
        await drawer
          .getByRole('heading', { name: '待仓库确认成品入库', exact: true })
          .waitFor()
        await drawer.getByText('PROD-FACT-L1', { exact: true }).waitFor()
        await drawer.getByText('产品', { exact: true }).waitFor()
        assert.equal(await page.locator('.ant-table-column-sort').count(), 0, '选中导致行移动时，第二次点击不能误触表头排序')
        await drawer.getByText(/确认成功才增加成品库存/u).waitFor()
        assert.equal(
          await drawer
            .getByRole('button', { name: '确认成品入库', exact: true })
            .count(),
          0,
          '查看详情不隐含执行入库'
        )
        await shot(page, 'production-record-drawer')
        await drawer
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(await query.inputValue(), 'PROD-FACT')
        await page.getByRole('tab', { name: '生产订单', exact: true }).click()
        await page.waitForURL('**/erp/production/orders')
        await page.locator('.ant-table-tbody tr[data-row-key="71"]').waitFor()
        await page.getByRole('tab', { name: '生产记录', exact: true }).click()
        await page.waitForURL('**/erp/production/progress')
        await row.waitFor()
        assert.equal(await query.inputValue(), 'PROD-FACT')
        await assertNoHorizontalOverflow(
          page,
          'production-record-drawer-return'
        )
      },
    },
    {
      ...base,
      name: 'production-exception-compact-details',
      path: '/erp/production/exceptions',
      beforeNavigate: async (page) => {
        const record = {
          id: 8801,
          version: 1,
          decision_no: 'PE-COMPACT-20261017',
          decision_type: 'SCRAP',
          status: 'APPROVED',
          execution_status: 'PENDING',
          requested_quantity: '20',
          production_order_id: 71,
          reason: '布料加工检验不合格，核对后按批准方案处理。',
          decision_reason: '已核对品质意见',
        }
        const records = [
          record,
          { ...record, id: 8802, decision_no: 'PE-APPLIED', execution_status: 'APPLIED' },
          { ...record, id: 8803, decision_no: 'PE-REVERSED', execution_status: 'REVERSED' },
          { ...record, id: 8804, decision_no: 'PE-SUBMITTED', status: 'SUBMITTED' },
        ]
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_production_exceptions') return route.fallback()
          const scoped = records.filter((item) =>
            (!params.keyword || `${item.decision_no} ${item.reason}`.toLowerCase().includes(params.keyword.toLowerCase())) &&
            (!params.decision_type || item.decision_type === params.decision_type) &&
            (!params.execution_status || item.execution_status === params.execution_status) &&
            (!params.production_order_id || item.production_order_id === params.production_order_id)
          )
          const status_counts = {}
          scoped.forEach((item) => {
            const key = item.status === 'APPROVED' ? `${item.status}:${item.execution_status}` : item.status
            status_counts[key] = (status_counts[key] || 0) + 1
          })
          const filtered = scoped.filter((item) => !params.handling_status || item.status === params.handling_status)
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult(
                { ...stylePaginatedRpcData(filtered, 'production_exceptions', params), status_counts }
              ),
            },
          })
        })
      },
      verify: async (page) => {
        const row = page.locator('.ant-table-tbody tr[data-row-key="8801"]')
        await row.waitFor()
        await compactCommand(page, '异常处理')
        assert.equal(
          await page
            .locator('.erp-business-data-table-card .ant-alert')
            .count(),
          0
        )
        await row.dblclick()
        const drawer = page.getByRole('dialog', {
          name: '生产异常详情',
          exact: true,
        })
        await drawer
          .getByRole('heading', { name: '已批准，待生产执行', exact: true })
          .waitFor()
        await drawer.getByText('已核对品质意见', { exact: true }).waitFor()
        await shot(page, 'production-exception-drawer')
        await drawer
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('group', { name: '异常审批状态' }).getByRole('button', { name: /^已批准/u }).click()
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        const filters = page.getByRole('dialog', { name: '筛选条件' })
        await filters
          .getByRole('group', { name: '业务状态', exact: true })
          .getByRole('button', { name: '待办理 / 额度生效', exact: true })
          .click()
        await filters.getByRole('button', { name: '完成', exact: true }).click()
        await page.getByRole('tab', { name: '生产订单', exact: true }).click()
        await page.waitForURL('**/erp/production/orders')
        await page.locator('.ant-table-tbody tr[data-row-key="71"]').waitFor()
        await page.getByRole('tab', { name: '异常处理', exact: true }).click()
        await page.waitForURL('**/erp/production/exceptions')
        await row.waitFor()
        await page
          .getByRole('button', { name: '筛选，已应用 1 项', exact: true })
          .click()
        await filters
          .getByRole('group', { name: '业务状态', exact: true })
          .getByRole('button', { name: '待办理 / 额度生效', exact: true })
          .waitFor()
        assert.equal(
          await filters
            .getByRole('group', { name: '业务状态', exact: true })
            .getByRole('button', { name: '待办理 / 额度生效', exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        await filters.getByRole('button', { name: '完成', exact: true }).click()
        await filters.waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(outputDir, 'production-exception-query-4k.png'), scale: 'device' })
        for (const width of [1440, 1024, 768]) {
          await page.setViewportSize({ width, height: 1000 })
          await assertNoHorizontalOverflow(
            page,
            `production-exception-compact-${width}`
          )
        }
      },
    },
  ]
  return [
    ...scenarios,
    {
      ...base,
      name: 'production-orders-server-table-sort',
      path: '/erp/production/orders?keyword=MO-SORT&page=2',
      beforeNavigate: async (page) => {
        const orders = Array.from({ length: 51 }, (_, index) => ({
          id: 7000 + index,
          order_no: `MO-SORT-${index + 1}`,
          status: 'DRAFT',
          version: 1,
          item_count: 0,
          planned_start_at: index === 50 ? 1781596800 : 1781683200,
        }))
        await page.route('**/rpc/production_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_production_orders') return route.fallback()
          const rows = params.sort_by === 'planned_start_at' && params.sort_direction === 'asc'
            ? [orders[50], ...orders.slice(0, 50)] : orders
          return route.fulfill({ json: {
            jsonrpc: '2.0', id, result: styleRpcResult(stylePaginatedRpcData(rows, 'production_orders', params)),
          } })
        })
      },
      verify: async (page) => {
        const header = page.getByRole('columnheader', { name: '计划开始', exact: true })
        const activePage = page.locator('.ant-pagination-item-active')
        await page.locator('.ant-table-tbody tr[data-row-key="7050"]').waitFor()
        assert.equal(await activePage.getAttribute('title'), '2')
        const [response] = await Promise.all([
          page.waitForResponse((response) => {
            if (!response.url().endsWith('/rpc/production_order')) return false
            const call = response.request().postDataJSON()
            return call.method === 'list_production_orders' && call.params?.sort_by === 'planned_start_at'
          }),
          header.click(),
        ])
        const { params } = response.request().postDataJSON()
        assert.equal(params.keyword, 'MO-SORT')
        assert.equal(params.sort_direction, 'asc')
        assert.equal(params.offset, 0)
        await header.and(page.locator('[aria-sort="ascending"]')).waitFor()
        assert.equal(await activePage.getAttribute('title'), '1')
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').first().getAttribute('data-row-key'), '7050')
        await assertNoHorizontalOverflow(page, 'production-orders-server-table-sort')
      },
    },
    {
      ...base,
      name: 'production-exception-query-consistency',
      path: '/erp/production/exceptions',
      beforeNavigate: scenarios[2].beforeNavigate,
      verify: async (page) => {
        const statuses = page.getByRole('group', { name: '异常审批状态' })
        await statuses.getByRole('button', { name: '已批准，共 3 条', exact: true }).waitFor()
        await statuses.getByRole('button', { name: '不限状态，共 4 条', exact: true }).waitFor()
        await statuses.getByRole('button', { name: /^已批准/u }).click()
        await page.locator('.ant-table-tbody tr[data-row-key="8804"]').waitFor({ state: 'hidden' })
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), 3, '批准筛选同时保留未执行、已执行和已冲正记录')
        const query = page.locator('.erp-business-operation-panel__search input')
        const request = page.waitForRequest((request) => request.url().endsWith('/rpc/operational_fact') && request.postDataJSON()?.method === 'list_production_exceptions' && request.postDataJSON().params.keyword === 'PE-COMPACT')
        await query.fill('PE-COMPACT')
        await query.press('Enter')
        const { params } = (await request).postDataJSON()
        assert.equal(params.offset, 0)
        assert.equal(params.handling_status, 'APPROVED')
        await statuses.getByRole('button', { name: '已批准，共 1 条', exact: true }).waitFor()
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        const filters = page.getByRole('dialog', { name: '筛选条件' })
        assert.equal(await filters.getByRole('group', { name: '审批状态', exact: true }).count(), 0, '筛选内不重复主审批条件')
        await filters.getByRole('group', { name: '异常类型' }).getByRole('button', { name: '放弃本批（报废）', exact: true }).click()
        await filters.getByRole('button', { name: '清空筛选', exact: true }).click()
        assert.equal(await query.inputValue(), 'PE-COMPACT')
        assert.equal(await statuses.getByRole('button', { name: /^已批准/u }).getAttribute('aria-pressed'), 'true')
        await filters.getByRole('button', { name: '完成', exact: true }).click()
        await filters.waitFor({ state: 'hidden' })
        await query.fill('不存在的异常')
        await query.press('Enter')
        await statuses.getByRole('button', { name: '不限状态，共 0 条', exact: true }).waitFor()
        assert.equal(await page.locator('.ant-table-tbody tr[data-row-key]').count(), 0)
        await query.fill('')
        await query.press('Enter')
        await statuses.getByRole('button', { name: '已批准，共 3 条', exact: true }).waitFor()
        await clickERPThemeOption(page, '暗色')
        for (const width of [1920, 1440, 1024, 768, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page, `production-exception-query-${width}`)
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.screenshot({ path: path.join(outputDir, 'production-exception-query-dark-4k.png'), scale: 'device' })
      },
    },
    {
      ...base,
      name: 'production-exception-source-details',
      path: '/erp/production/exceptions?production_exception_id=8801&production_order_id=71',
      beforeNavigate: async (page) => {
        await scenarios[2].beforeNavigate(page)
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'get_production_exception') return route.fallback()
          assert.equal(params.id, 8801)
          const record = {
            id: 8801,
            version: 1,
            decision_no: 'PE-COMPACT-20261017',
            decision_type: 'SCRAP',
            status: 'APPROVED',
            execution_status: 'PENDING',
            production_order_id: 71,
            requested_quantity: '20',
            reason: '核对当前异常申请',
          }
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult({ production_exception: record }),
            },
          })
        })
      },
      verify: async (page) => {
        const drawer = page.getByRole('dialog', {
          name: '生产异常详情',
          exact: true,
        })
        await drawer.getByText('PE-COMPACT-20261017', { exact: true }).waitFor()
        await drawer
          .getByRole('heading', { name: '已批准，待生产执行', exact: true })
          .waitFor()
        await drawer
          .getByRole('button', { name: '确认执行', exact: true })
          .click()
        const confirmation = page.getByRole('dialog', {
          name: '确认生产异常处置',
          exact: true,
        })
        await confirmation.getByLabel('执行原因', { exact: true }).waitFor()
        await confirmation
          .getByRole('button', { name: '返回', exact: true })
          .click()
        await page
          .getByRole('button', { name: '刷新当前页', exact: true })
          .click()
        await page.locator('.ant-table-tbody tr[data-row-key="8801"]').waitFor()
        assert.equal(
          await drawer.isVisible(),
          false,
          '关闭后刷新不重复弹出详情'
        )
      },
    },
    {
      ...base,
      name: 'production-record-reader-dark-drawer',
      path: '/erp/production/progress',
      adminProfile: {
        username: 'style-production-reader',
        is_super_admin: false,
        permissions: ['production.fact.read'],
        menus: [
          {
            key: 'production-progress',
            path: '/erp/production/progress',
            required_any: ['production.fact.read'],
          },
        ],
      },
      effectiveSession: {
        ...common.effectiveSession,
        pages: ['production-progress'],
        actions: ['production.fact.read'],
      },
      verify: async (page) => {
        const row = page.locator('.ant-table-tbody tr[data-row-key="1"]')
        await row.waitFor()
        await clickERPThemeOption(page, '暗色')
        await row.evaluate((element) => {
          window.__productionRecordInteraction = []
          const card = element.closest('.erp-business-data-table-card')
          for (const type of ['pointerdown', 'click', 'dblclick']) { card.addEventListener(type, (event) => {
            window.__productionRecordInteraction.push({ type, detail: event.detail, x: event.clientX, y: event.clientY, target: event.target.tagName, row: event.target.closest('tr')?.dataset.rowKey || null, rowTop: element.getBoundingClientRect().top })
          }, true) }
        })
        await row.getByText('草稿', { exact: true }).dblclick()
        await writeFile(path.join(outputDir, 'production-record-double-click.json'), JSON.stringify(await page.evaluate(() => window.__productionRecordInteraction), null, 2))
        const drawer = page.getByRole('dialog', {
          name: '生产记录详情',
          exact: true,
        })
        await drawer
          .getByRole('heading', { name: '待仓库确认成品入库', exact: true })
          .waitFor()
        assert.equal(
          await drawer.locator('.ant-drawer-footer button').count(),
          1,
          '只读账号只显示返回，不出现确认或执行入口'
        )
        for (const width of [1920, 1024, 768]) {
          await page.setViewportSize({ width, height: 1080 })
          const overflow = await drawer.evaluate(
            (node) => node.scrollWidth - node.clientWidth
          )
          assert.ok(overflow <= 1)
          assert.equal(await drawer.locator('.ant-descriptions-row').first().locator('.ant-descriptions-item-label').count(), 2, '抽屉宽屏固定两列，不沿用页面三列默认值')
          await assertNoHorizontalOverflow(
            page,
            `production-record-reader-${width}`
          )
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await shot(page, 'production-record-reader-dark')
      },
    },
  ]
}
