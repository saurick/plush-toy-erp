import { styleRpcResult } from './rpcMockResult.mjs'

export function createBOMTaskActionsScenarios({
  assert,
  customerRuntimeEffectiveSession,
  assertNoHorizontalOverflow,
  outputDir,
  path,
}) {
  const relatedOrder = {
    id: 1,
    order_no: 'SO-BOM-TASK-RELATED',
    lifecycle_status: 'active',
    version: 1,
  }
  const permissions = [
    'bom.read',
    'sales_order.read',
    'workflow.task.read',
    'workflow.task.create',
    'mobile.engineering.access',
  ]
  const scenarios = [false, true].map((mobile) => {
    let requests = []
    let failOnce = true
    let trackingReads = 0
    let taskReads = 0
    const task = {
      id: 98902,
      task_code: 'FOLLOWUP-BOM-TASK',
      task_name: '核对色卡与 BOM',
      task_group: 'engineering_data',
      process_instance_id: 9801,
      process_node_instance_id: 9802,
      source_type: 'sales_order',
      source_id: 1,
      source_no: relatedOrder.order_no,
      owner_role_key: 'engineering',
      owner_pool_key: 'engineering',
      assignee_id: null,
      task_status_key: 'ready',
      version: 1,
      priority: 0,
      created_at: 1791648000,
      payload: { description: '核对本单工程资料' },
    }
    return {
      name: `bom-related-task-actions-${mobile ? 'mobile' : 'desktop'}`,
      path: mobile
        ? '/m/engineering/handle/purchase/material-bom'
        : '/erp/purchase/material-bom',
      auth: 'admin',
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions,
        menus: [
          {
            key: 'material-bom',
            path: '/erp/purchase/material-bom',
            label: '物料清单（BOM）',
            required_any: ['bom.read'],
            required_all: [],
          },
          {
            key: 'sales-orders',
            path: '/erp/sales/project-orders/sales-orders',
            label: '销售订单',
            required_any: ['sales_order.read'],
            required_all: [],
          },
          {
            key: 'task-board',
            path: '/erp/task-board',
            label: '任务管理',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['material-bom', 'sales-orders', 'task-board'],
        actions: permissions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
        },
      },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        requests = []
        failOnce = true
        trackingReads = 0
        taskReads = 0
        await page.route('**/src/erp/pages/SalesOrdersPage.jsx*', async (route) => {
          await new Promise((resolve) => setTimeout(resolve, 300))
          await route.continue()
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'list_sales_orders' || !params.sample_bom_id)
            { return route.fallback() }
          requests.push(params)
          if (failOnce) {
            failOnce = false
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: { code: 500, message: '读取失败' },
              },
            })
          }
          assert.equal(
            params.lifecycle_scope,
            'all',
            '历史订单的已有任务也应可追溯'
          )
          const orders =
            params.sample_bom_id === 1
              ? [
                  relatedOrder,
                  {
                    id: 2,
                    order_no: 'SO-BOM-TASK-CLOSED',
                    lifecycle_status: 'closed',
                  },
                ]
              : []
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: styleRpcResult({
                sales_orders: orders,
                total: orders.length,
              }),
            },
          })
        })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_task' && params.task_id === task.id) taskReads += 1
          if (method === 'list_tracking') {
            assert.equal(params.scope, 'visible')
            assert.equal(params.source_type, 'sales_order')
            assert.equal(params.source_id, relatedOrder.id)
            trackingReads += 1
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ items: [], total: 0, limit: params.limit, offset: params.offset }) } })
          }
          if (method === 'list_tasks') {
            assert.equal(params.source_type, 'sales_order')
            assert([relatedOrder.id, 2].includes(params.source_id))
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: styleRpcResult({ tasks: params.source_id === relatedOrder.id ? [task] : [], total: params.source_id === relatedOrder.id ? 1 : 0 }),
              },
            })
          }
          if (method === 'get_task_create_options') {
            assert.equal(params.source_type, 'sales_order')
            assert.equal(params.source_id, relatedOrder.id)
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: styleRpcResult({
                  ...params,
                  source_no: relatedOrder.order_no,
                  can_create: true,
                  roles: [
                    { role_key: 'engineering', label: '工程', assignees: [] },
                  ],
                }),
              },
            })
          }
          if (method === 'explain_action_access') {
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: styleRpcResult({
                  task_id: task.id,
                  source_access: {
                    applicable: true,
                    resolved: true,
                    allowed: true,
                    reason_code: 'source_access_allowed',
                    reason: '',
                  },
                  actions: [
                    {
                      action_key: 'complete',
                      allowed: false,
                      reason: '当前账号可查看来源单据',
                      reason_code: 'permission_missing',
                      required_permission: 'workflow.task.complete',
                      owner_role_key: 'engineering',
                    },
                  ],
                }),
              },
            })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const row = page.locator('tr[data-row-key="1"]').first()
        await row.waitFor({ state: 'visible' })
        const taskButton = page
          .locator('[data-business-action-key="related-tasks"]:visible')
          .first()
        if (!(await taskButton.count()))
          { await page.getByRole('button', { name: /更多操作/u }).click() }
        assert.equal(
          await taskButton.isDisabled(),
          true,
          '未选择 BOM 时保留禁用入口'
        )
        await row.locator('td').nth(1).click()
        if (!(await taskButton.count()))
          { await page.getByRole('button', { name: /更多操作/u }).click() }
        await taskButton.click()
        const sources = page.getByRole('dialog', { name: '相关任务', exact: true })
        await sources
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await sources.getByText('请选择关联销售订单，查看该订单的任务', { exact: true }).waitFor()
        const selectOrder = async (orderNo) => {
          await sources.locator('.business-task-panel__order .ant-select-selector').click()
          await page.locator('.ant-select-dropdown:visible').getByTitle(orderNo, { exact: true }).click()
          await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        }
        await selectOrder(relatedOrder.order_no)
        assert.equal(await page.locator('.ant-modal:visible').count(), 1, 'BOM 选择订单与任务列表共用一个窗口')
        assert.equal(await sources.locator('.ant-pagination:visible').count(), 0, '单页任务不显示分页')
        await sources
          .getByRole('button', { name: task.task_name, exact: true })
          .click()
        const drawer = page.locator('.erp-task-action-drawer:visible')
        const readsBeforeLeaving = taskReads
        await drawer.getByRole('button', { name: /进入单据办理$/u }).click()
        await page.waitForURL(
          mobile ? /\/m\/engineering\/handle\/sales\//u : /\/erp\/sales\//u
        )
        await page.getByRole('heading', { name: '销售订单', exact: true }).waitFor()
        assert.equal(taskReads, readsBeforeLeaving, '离开 BOM 时不能提前消费返回任务标记')
        await page
          .getByRole('button', { name: '返回任务', exact: true })
          .click()
        await drawer
          .getByText(task.task_name, { exact: true })
          .first()
          .waitFor()
        assert(taskReads > readsBeforeLeaving, '返回时重新读取原任务')
        await drawer.locator('.ant-drawer-close').click()
        await drawer.waitFor({ state: 'hidden' })
        await sources.getByRole('button', { name: /新建跟进任务$/u }).click()
        const create = page.getByRole('dialog', {
          name: '新建跟进任务',
          exact: true,
        })
        await create.getByText(relatedOrder.order_no, { exact: true }).waitFor()
        await create.getByRole('button', { name: '返回相关任务', exact: true }).click()
        await create.waitFor({ state: 'hidden' })
        await selectOrder('SO-BOM-TASK-CLOSED')
        await sources.getByText('当前单据暂无可见任务', { exact: true }).waitFor()
        assert.equal(await sources.getByRole('button', { name: task.task_name, exact: true }).count(), 0, '切换订单后清除原任务')
        assert.equal(
          await sources
            .getByRole('button', { name: /新建跟进任务$/u })
            .isDisabled(),
          true
        )
        assert.equal(
          await sources
            .getByRole('button', { name: '流程跟踪', exact: true })
            .isEnabled(),
          true
        )
        await selectOrder(relatedOrder.order_no)
        await sources.getByRole('button', { name: task.task_name, exact: true }).waitFor()
        const geometry = await sources.evaluate((node) => ({
          width: node.clientWidth,
          scroll: node.scrollWidth,
        }))
        assert(
          geometry.scroll <= geometry.width + 1,
          'BOM 任务弹窗不能撑破手机屏幕'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            `bom-related-tasks-${mobile ? 'mobile' : 'desktop'}.png`
          ),
          scale: 'device',
          animations: 'disabled',
        })
        await sources.getByRole('button', { name: '关闭', exact: true }).click()
        await page
          .locator('tr[data-row-key="2"]')
          .first()
          .locator('td')
          .nth(1)
          .click()
        if (!(await taskButton.count()))
          { await page.getByRole('button', { name: /更多操作/u }).click() }
        await taskButton.click()
        await sources
          .getByText('此 BOM 尚未在销售订单的工程与打样中关联。', {
            exact: true,
          })
          .waitFor()
        assert.equal(
          await sources
            .getByText(relatedOrder.order_no, { exact: true })
            .count(),
          0,
          '切换 BOM 后不能残留原订单任务'
        )
        assert.deepEqual(
          requests.map((item) => item.sample_bom_id),
          [1, 1, 1, 2]
        )
        if (mobile) {
          await sources.getByRole('button', { name: '关闭', exact: true }).click()
          await page
            .locator('tr[data-row-key="1"]')
            .first()
            .locator('td')
            .nth(1)
            .click()
          if (!(await taskButton.count())) {
            await page.getByRole('button', { name: /更多操作/u }).click()
          }
          await taskButton.click()
          await selectOrder(relatedOrder.order_no)
          await sources.getByRole('button', { name: '流程跟踪', exact: true }).click()
          await page.waitForURL(/\/m\/engineering\/tasks\?tracking=visible/u)
          await page.getByText('当前单据暂无可见流转记录', { exact: true }).waitFor()
          assert.equal(trackingReads, 1, '手机流程跟踪按所选订单读取且没有重复请求')
        } else {
          await sources.getByRole('button', { name: '打开销售订单', exact: true }).click()
          await page.waitForURL(/\/erp\/sales\//u)
        }
        await assertNoHorizontalOverflow(
          page,
          `bom-related-task-actions-${mobile ? 'mobile' : 'desktop'}`
        )
      },
    }
  })
  for (const deniedPermission of ['workflow.task.read', 'sales_order.read']) {
    const base = scenarios[0]
    const allowed = permissions.filter(
      (permission) => permission !== deniedPermission
    )
    scenarios.push({
      ...base,
      name: `bom-related-task-denied-${deniedPermission === 'workflow.task.read' ? 'tasks' : 'orders'}`,
      adminProfile: { ...base.adminProfile, permissions: allowed },
      effectiveSession: { ...base.effectiveSession, actions: allowed },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/sales_order', async (route) => {
          assert.equal(
            route.request().postDataJSON().params?.sample_bom_id,
            undefined,
            '缺少销售权限时不能读取 BOM 关联订单'
          )
          return route.fallback()
        })
      },
      verify: async (page) => {
        const row = page.locator('tr[data-row-key="1"]').first()
        await row.waitFor({ state: 'visible' })
        if (deniedPermission === 'workflow.task.read') {
          assert.equal(
            await page
              .locator('[data-business-action-key="related-tasks"]')
              .count(),
            0
          )
          return
        }
        await row.locator('td').nth(1).click()
        await page
          .locator('[data-business-action-key="related-tasks"]:visible')
          .click()
        await page
          .getByRole('alert')
          .filter({ hasText: '当前账号没有查看关联销售订单的权限' })
          .waitFor()
      },
    })
  }
  const base = scenarios[0]
  scenarios.push({
    ...base,
    name: 'bom-related-task-single-order',
    beforeNavigate: async (page) => {
      await base.beforeNavigate(page)
      await page.route('**/rpc/sales_order', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_sales_orders' || !params.sample_bom_id) return route.fallback()
        assert.equal(params.lifecycle_scope, 'all')
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ sales_orders: [relatedOrder], total: 1 }) } })
      })
    },
    verify: async (page) => {
      await page.locator('tr[data-row-key="1"]').first().locator('td').nth(1)
        .click()
      await page.locator('[data-business-action-key="related-tasks"]:visible').click()
      const panel = page.getByRole('dialog', { name: '相关任务', exact: true })
      await panel.getByRole('button', { name: '核对色卡与 BOM', exact: true }).waitFor()
      assert.equal(await panel.locator('.business-task-panel__order .ant-select-selection-item').innerText(), relatedOrder.order_no)
      assert.equal(await panel.locator('[data-business-action-key="create-followup"]').isEnabled(), true)
      assert.equal(await page.locator('.ant-modal:visible').count(), 1)
    },
  })
  return scenarios
}
