import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertControlCursor } from './controlAffordanceAssertions.mjs'
import { BUSINESS_ROUTE_PATHS } from '../../src/erp/utils/masterDataOrderView.mjs'

export function createDeliveryBoardScenarios({
  assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession, outputDir,
}) {
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    actions: ['erp.business_dashboard.read', 'sales_order.read', 'sales_order_item.read', 'product.read'],
  }
  const common = {
    auth: 'admin', effectiveSession, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
  }
  const orders = [1, 2].map((id) => ({
    id,
order_no: `SO-000${id}`,
lifecycle_status: 'active',
    customer_snapshot: { name: `模拟客户 ${id}` },
version: 1,
order_date: 1789963200,
updated_at: 1789963200,
  }))
  const fulfill = (route, id, data) => route.fulfill({ json: {
    jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data },
  } })
  const display = (page, label) => page.locator('[aria-label="交付查看方式"]').getByText(label, { exact: true })
  const details = (page) => page.getByRole('table', { name: '交付明细', exact: true })
  const facets = (page) => page.getByRole('group', { name: '交付明细状态', exact: true })
  const select = (page) => page.locator('.erp-sales-orders-page tbody tr[data-row-key="1"]')
  const deliveryModal = (page) => page.getByRole('dialog', { name: '交付进度', exact: true })
  const deliveryData = ({ id }) => {
    const board = progressFixtureData({ display: 'lines', id })
    return {
      order_id: id,
label: orders.find((order) => order.id === id)?.order_no,
      status: 'active',
customer: '模拟客户 1',
owner: '模拟业务员',
      snapshot_at: board.snapshot_at,
lines: board.rows,
total: board.rows.length,
tasks_available: true,
      current: { label: '工程资料', role: 'engineering', assignee: '工程经办', status: 'blocked', date: '2026-09-24', reason: '' },
      recent: [{ label: '订单审批', role: 'boss', assignee: '', status: 'done', date: '2026-09-22', reason: '' }],
    }
  }
  const roleProgressScenarios = [false, true].map((mobile) => {
    const permissions = ['mobile.sales.access', 'workflow.task.read', 'workflow.task.complete', 'sales_order.read', 'sales_order_item.read', 'product.read']
    const roles = ['sales']
    const snapshot = Math.floor(Date.now() / 1000)
    const items = [
      { id: 801, task_name: '确认包装规格', task_status_key: 'blocked', assignee_id: 1, blocked_reason: '等待包装规格确认' },
      { id: 802, task_name: '核对客户交期', task_status_key: 'ready', assignee_id: 1, due_at: snapshot + 3600 },
      { id: 803, task_name: '跟进出货预约', task_status_key: 'ready', assignee_id: null },
      { id: 804, task_name: '交期核对完成', task_status_key: 'done', assignee_id: 1, completed_at: snapshot - 30 },
    ].map((item) => ({
      ...item,
task_code: `RW20261120-0${item.id}`,
version: 1,
task_group: 'business_followup',
      owner_role_key: 'sales',
source_type: 'sales_order',
source_id: 1,
source_no: 'SO-0001',
      process_instance_id: null,
required_capability_key: 'workflow.task.complete',
      created_at: snapshot - 86400,
payload: {},
    }))
    const resultText = '已预约次日出货。'
    let completedTask
    let recordedReason
    const trackingData = (task, reason) => {
      const completedAt = task.completed_at ?? null
      const row = {
        task_id: task.id,
task_name: task.task_name,
node_instance_id: null,
owner_role_key: task.owner_role_key,
        assignee_name: task.assignee_id ? '跟单经办' : '',
status: task.task_status_key,
        created_at: task.created_at,
completed_at: completedAt,
due_at: task.due_at ?? null,
      }
      return { tracking: {
        summary: {
          kind: 'task',
id: task.id,
process_key: '',
title: task.task_name,
source_type: task.source_type,
          source_no: task.source_no,
source_id: task.source_id,
display_context: null,
status: row.status,
          started_at: task.created_at,
updated_at: completedAt ?? task.created_at,
completed_at: completedAt,
          resolution_kind: null,
initiator_name: '跟单经办',
current_tasks: completedAt ? [] : [row],
        },
        tasks: [row],
nodes: [],
        current_task_access: completedAt ? [] : [{ task_id: task.id, can_read: true, can_handle: true }],
        events: completedAt ? [{
          id: 1,
task_id: task.id,
event_type: 'status_changed',
actor_display_name: '跟单经办',
          actor_role_key: 'sales',
reason,
created_at: completedAt,
from_status_key: 'ready',
to_status_key: 'done',
        }] : [],
        events_truncated: false,
next_event_id: 0,
      } }
    }
    return {
      ...common,
      name: mobile ? 'unified-role-progress-mobile' : 'unified-role-progress-desktop',
      path: mobile ? '/m/sales/tasks' : '/erp/task-board',
      customerKey: 'yoyoosun',
      ...(mobile ? { hasTouch: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 } : {}),
      adminProfile: {
        id: 1,
username: 'style-role-progress-sales',
display_name: '跟单经办',
is_super_admin: false,
        roles: [{ role_key: 'sales' }],
permissions,
        menus: [
          { key: 'business-dashboard', path: BUSINESS_ROUTE_PATHS.businessDashboard, label: '进度看板' },
          { key: 'task-board', path: '/erp/task-board', label: '任务管理' },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
roles,
actions: permissions,
workPools: roles,
        pages: ['business-dashboard', 'task-board', 'sales-orders'],
        workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': roles, 'workflow.task.complete': roles },
      },
      workflowTaskFixtures: items,
      beforeNavigate: async (page) => {
        completedTask = null
        recordedReason = ''
        await page.route('**/rpc/workflow', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_task_board' && params.progress_view) assert.equal(params.owner_role_key, 'sales')
          if (method === 'get_tracking' && params.kind === 'task' && params.id === 803) {
            return fulfill(route, id, trackingData(completedTask || items[2], recordedReason))
          }
          if (method === 'get_tracking' && params.kind === 'task' && params.id === 804) {
            return fulfill(route, id, trackingData(items[3], '已按客户确认日期核对'))
          }
          return route.fallback()
        })
        await page.route('**/rpc/business', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_progress') return route.fallback()
          assert.equal(params.view, 'orders')
          assert.equal(params.display, 'lines')
          return fulfill(route, id, progressFixtureData(params, { restricted: true }))
        })
        await page.route('**/rpc/sales_order', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_delivery_progress') return fulfill(route, id, deliveryData(params))
          return route.fallback()
        })
      },
      verify: async (page) => {
        if (mobile) await page.getByTestId('mobile-role-nav-tasks').click()
        else await page.getByRole('tab',{name:'全部任务',exact:true}).click()
        if (mobile) await page.getByRole('tab',{name:'按单据',exact:true}).click()
        else await page.getByLabel('全部任务查看方式',{exact:true}).getByText('按单据',{exact:true}).click()
        const panel = page.getByRole('region', { name: '按单据查看任务', exact: true })
        await panel.getByRole('button', { name: /受阻与异常/ }).click()
        await panel.getByText('确认包装规格', { exact:true }).waitFor()
        await panel.getByRole('button', { name: /临期与超时/ }).click()
        await panel.getByText('核对客户交期', { exact:true }).waitFor()
        await panel.getByRole('button', { name: /无人接手/ }).click()
        await panel.getByRole('button', { name: /SO-0001/ }).click()
        const documentItems = panel.getByRole('region', { name: '单据事项' })
        await documentItems.getByRole('button', { name: '跟进出货预约', exact: true }).waitFor()
        assert.equal(await panel.locator('table table').count(), 0)
        assert.equal(await panel.getByRole('button', { name: /无人接手/ }).count(), 0)
        await documentItems.getByRole('button', { name: '返回单据列表' }).click()
        assert(await panel.getByRole('button', { name: /SO-0001/ }).evaluate(node => node === document.activeElement))
        await panel.getByRole('button', { name: /SO-0001/ }).click()
        await documentItems.getByRole('button', { name: '跟进出货预约', exact: true }).click()
        const tracking = page.getByRole('dialog', { name: '流程跟踪', exact: true })
        await tracking.getByText('下一步', { exact: true }).waitFor()
        await tracking.getByRole('button', { name: '查看交付进度', exact: true }).click()
        const orderProgress = mobile ? page.getByRole('dialog', { name: /交付进度/u }) : deliveryModal(page)
        const remaining = orderProgress.getByText(mobile ? /剩余待交\s*72 只/u : '72 只', { exact: !mobile })
        await remaining.waitFor()
        if (mobile) await page.goBack()
        else await orderProgress.getByRole('button', { name: '关闭', exact: true }).last().click()
        await orderProgress.waitFor({ state: 'hidden' })
        await tracking.getByRole('button', { name: '去处理跟进出货预约', exact: true }).click()
        const taskDetail = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.erp-task-action-drawer')
        await taskDetail.getByRole('button', { name: mobile ? '选择处理方式' : '任务办理', exact: true }).click()
        const action = mobile ? page.getByTestId('mobile-task-action-screen') : taskDetail.locator('#erp-task-action-step-action')
        if (!mobile) await action.getByRole('radio', { name: '完成跟进任务', exact: true }).click()
        await action.locator('textarea').fill(resultText)
        if (!mobile) await taskDetail.getByRole('button', { name: '核对并确认', exact: true }).click()
        const submit = mobile ? action.locator('button[type="submit"]') : taskDetail.getByRole('button', { name: /确认完成/u })
        const [response] = await Promise.all([
          page.waitForResponse((res) => res.request().method() === 'POST' && res.url().includes('/rpc/workflow') &&
            res.request().postDataJSON()?.method === 'complete_task_action'),
          submit.click({ timeout: 8000 }),
        ])
        const { result } = await response.json()
        assert.equal(result.code, 0, result.message)
        assert.equal(result.data.task.id, 803)
        assert.equal(result.data.task.task_status_key, 'done')
        completedTask = result.data.task
        const actionParams = response.request().postDataJSON().params
        recordedReason = mobile ? actionParams.payload.feedback : actionParams.reason
        assert.equal(recordedReason, resultText)
        if (mobile) {
          await page.getByTestId('mobile-task-receipt-screen').getByRole('button', { name: '返回单据任务', exact: true }).last().click()
        } else {
          await taskDetail.getByRole('button', { name: '返回单据任务', exact: true }).last().click()
        }
        await tracking.getByText(resultText, { exact: true }).waitFor()
        await tracking.getByRole('button', { name: '返回列表', exact: true }).click()
        await documentItems.getByRole('button', { name: '返回单据列表' }).click()
        await panel.getByRole('button', { name: '无人接手 0', exact: true }).waitFor()
        await panel.getByRole('button', { name: '处理结果 2', exact: true }).click()
        await panel.getByRole('button', { name: /SO-0001/ }).click()
        await panel.getByRole('button', { name: /交期核对完成/u }).click()
        await tracking.getByText('已按客户确认日期核对', { exact: true }).waitFor()
        await tracking.getByText('跟单经办', { exact: false }).first().waitFor()
        await tracking.getByRole('button', { name: '返回列表', exact: true }).click()
        if(mobile) await page.getByTestId('mobile-role-nav-progress').click()
        else await page.locator('.erp-admin-menu:visible').getByRole('menuitem',{name:'进度看板',exact:true}).click()
        assert.equal(await page.getByRole('tab', { name: '经营统计', exact: true }).count(), 0)
        assert.equal(await page.getByRole('tab', { name: '生产执行', exact: true }).count(), 0)
        const drill = (mobile ? page : details(page)).getByRole('button', { name: mobile ? /SO-0001.*第 1 行进度/u : /查看进度：SO-0001.*第 1 行/u })
        await drill.click()
        await remaining.waitFor()
        if (mobile) {
          await page.goBack()
          await orderProgress.waitFor({ state: 'hidden' })
          await drill.waitFor()
        }
        await assertNoHorizontalOverflow(page, 'role-progress')
      },
    }
  })
  return [
    ...roleProgressScenarios,
    {
      ...common,
      name: 'unified-sales-interactions',
      path: BUSINESS_ROUTE_PATHS.salesOrders,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/sales_order', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_orders') {
            const sales_orders = orders.filter((row) => !params.keyword || row.order_no.includes(params.keyword))
            return fulfill(route, id, { sales_orders, total: sales_orders.length, status_counts: { active: sales_orders.length } })
          }
          if (method === 'get_sales_order') return fulfill(route, id, { sales_order: orders.find((row) => row.id === params.id) })
          if (method === 'get_delivery_progress') return fulfill(route, id, deliveryData(params))
          return route.fallback()
        })
        await page.route('**/rpc/business', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_progress', 'get_progress'].includes(method)) return route.fallback()
          const detail = method === 'get_progress'
          const data = progressFixtureData(params, { detail })
          if (detail) {
            data.sections.lines[0].id = 101
          }
          return fulfill(route, id, data)
        })
      },
      verify: async (page) => {
        const search = page.locator('.erp-sales-orders-page input.erp-search-input, .erp-sales-orders-page .erp-search-input input').first()
        await select(page).waitFor()
        await assertControlCursor(page.getByRole('button', { name: '表格工具', exact: true }), 'pointer')
        await search.fill('SO-0001')
        const applied = page.waitForRequest((req) => req.url().endsWith('/rpc/sales_order') &&
          req.postDataJSON()?.params?.keyword === 'SO-0001')
        await search.press('Enter')
        await applied
        await select(page).click()
        assert.equal(await page.getByRole('tab', { name: '交付进度', exact: true }).count(), 0)
        await search.fill('尚未提交的输入')
        await page.getByRole('button', { name: '查看交付进度', exact: true }).click()
        await deliveryModal(page).getByRole('button', { name: '在进度看板查看', exact: true }).click()
        await page.waitForURL((url) => url.pathname === BUSINESS_ROUTE_PATHS.businessDashboard &&
          url.searchParams.get('sales_order_id') === '1' && url.searchParams.get('display') === 'lines')
        await details(page).locator('tbody tr').last().waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 2, '按所选订单读取，排除同客户或同名其他单')
        const first = details(page).locator('tbody tr').first()
        await assertControlCursor(first.getByRole('cell').nth(2), 'auto')
        assert.match(await first.textContent(), /云朵小熊.*120 只.*48 只.*72 只/u)
        assert.match(await details(page).locator('tbody tr').last().textContent(), /星星挂兔.*120 套.*0 套.*120 套/u)
        await page.screenshot({ path: `${outputDir}/delivery-board-lines-4k.png` })
        await facets(page).getByRole('button', { name: /逾期.*1 条/u }).click()
        await page.waitForURL((url) => url.searchParams.get('delivery_status') === 'overdue')
        await details(page).locator('tbody tr[data-progress-line-id="102"]').waitFor({ state: 'hidden' })
        await details(page).locator('tbody tr[data-progress-line-id="101"]').waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 1)
        await display(page, '整单').click()
        await page.getByRole('table', { name: '订单交付紧凑总览' }).waitFor()
        await display(page, '产品明细').click()
        await details(page).locator('tbody tr').first().waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 1, '切回明细恢复本视图的快捷条件')
        assert.deepEqual(await details(page).locator('th').allTextContents(), ['订单 / 客户', '产品', '交付日期', '订购数量', '实际出货', '剩余待交', '交付状态', '操作'])
        const cells = details(page).locator('tbody tr').first().getByRole('cell')
        const drill = cells.last().getByRole('button', { name: /查看进度：SO-0001.*第 1 行/u })
        await drill.waitFor()
        const date = cells.nth(2)
        await date.click()
        const dialog = page.getByRole('dialog')
        assert.equal(await dialog.isVisible(), false)
        await date.dblclick()
        await dialog.locator('[data-progress-line-selected]').waitFor()
        assert.match(await dialog.textContent(), /SO-0001.*云朵小熊/u)
        await dialog.getByRole('button', { name: '返回进度看板', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert(await drill.evaluate((node) => node === document.activeElement))
        await page.getByRole('button', { name: '返回销售订单', exact: true }).click()
        await page.waitForURL((url) => url.pathname === BUSINESS_ROUTE_PATHS.salesOrders)
        await select(page).filter({ has: page.getByRole('radio', { checked: true }) }).waitFor()
        assert.equal(await search.inputValue(), '尚未提交的输入', '返回保留输入但未替换已提交的筛选词')
        assert.equal(await page.locator('.erp-sales-orders-page tbody tr[data-row-key="2"]').count(), 0)
        await page.getByRole('button', { name: '查看交付进度', exact: true }).click()
        await deliveryModal(page).getByRole('button', { name: '在进度看板查看', exact: true }).click()
        await details(page).waitFor()
        await page.goBack()
        await select(page).filter({ has: page.getByRole('radio', { checked: true }) }).waitFor()
        assert.equal(await search.inputValue(), '尚未提交的输入')
      },
    },
    {
      ...common,
      name: 'delivery-board-pagination-and-recovery',
      path: `${BUSINESS_ROUTE_PATHS.businessDashboard}?view=orders&display=lines`,
      beforeNavigate: async (page) => {
        let first = true
        await page.route('**/rpc/business', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_progress') return route.fallback()
          if (first) {
            first = false
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '查询失败' } } })
          }
          return fulfill(route, id, progressFixtureData(params))
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '重试', exact: true }).click()
        await details(page).locator('tbody tr').first().waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 20)
        await facets(page).getByRole('button', { name: /全部明细.*24 条/u }).waitFor()
        await page.locator('.erp-progress-board').getByRole('button', { name: '下一页' }).click()
        await details(page).locator('tbody tr[data-progress-line-id="121"]').waitFor()
        assert.equal(await details(page).locator('tbody tr').count(), 4)
        await details(page).getByRole('button', { name: '按订单号升序排列' }).press('Enter')
        await details(page).locator('tbody tr:first-child[data-progress-line-id="101"]').waitFor()
        await details(page).getByRole('button', { name: '按订单号降序排列' }).press('Enter')
        await details(page).locator('tbody tr:first-child[data-progress-line-id="123"]').waitFor()
        await details(page).getByRole('button', { name: '按产品升序排列' }).click()
        await details(page).locator('th[aria-sort="ascending"]').getByText('产品', { exact: true }).waitFor()
        await details(page).getByRole('button', { name: '按产品降序排列' }).click()
        await details(page).getByRole('button', { name: '恢复默认排序' }).click()
        await details(page).locator('tbody tr:first-child[data-progress-line-id="101"]').waitFor()
        await facets(page).getByRole('button', { name: /待核对.*1 条/u }).click()
        await details(page).locator('tbody tr:only-child[data-progress-line-id="105"]').waitFor()
        const cells = details(page).locator('tbody tr').first().locator('td')
        assert.match(await cells.nth(4).textContent(), /待核对/u)
        assert.equal((await cells.nth(5).textContent()).trim(), '—')
        for (const width of [1440, 840, 390]) {
          await page.setViewportSize({ width, height: 900 })
          await assertNoHorizontalOverflow(page, `delivery-board-${width}`)
          const overflow = await cells.evaluateAll((nodes) => nodes.some((el) => el.scrollWidth > el.clientWidth + 1))
          assert.equal(overflow, false, '列内容无需页面横向滚动')
        }
      },
    },
  ]
}
