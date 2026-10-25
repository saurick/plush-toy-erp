import { expect } from 'playwright/test'
import { writeFile } from 'node:fs/promises'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDevFlowDetailScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const sessions = new WeakMap()
  const definition = catalog.processDefinitions.find((item) => item.processKey === 'sales_order_acceptance')
  const active = definition.nodes.find((item) => item.type === 'approval')
  const task = (id) => ({
    id,
    version: 1,
    task_code: `QA-TASK-${id}`,
    task_name: '模拟订单审批',
    task_group: 'sales_order_approval',
    task_status_key: 'blocked',
    owner_role_key: active.ownerPool,
    source_type: 'sales_order',
    source_id: 1001,
    source_no: 'SO-QA-DETAIL-001',
    blocked_reason: '补齐审批资料',
    discovery: { assignee_name: '模拟办理人' },
    assignee_id: 31,
    ...(id === 21 ? { process_instance_id: 10, process_node_instance_id: 20 } : {}),
  })
  const node = { id: 20, process_instance_id: 10, node_key: active.key, node_type: 'approval', attempt: 2, version: 1, status: 'blocked' }
  const context = {
    source: { type: 'sales_order', id: 1001, no: 'SO-QA-DETAIL-001' },
    process_instance: { id: 10, process_key: definition.processKey, process_version: definition.processVersion, status: 'blocked', started_at: 1800000000 },
    linked_node: node,
    approval_form: null,
    nodes: [node],
    current_nodes: [node],
    completed_nodes: [],
    current_responsibilities: [{ node_instance_id: node.id, owner_role_key: active.ownerPool }],
  }
  return [{
    name: 'dev-flow-state-details-desktop-light',
    path: '/__dev/status-flows?view=chain&chain=all',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    beforeNavigate: async (page) => {
      const state = { denyTask: false, denyEvents: true, denyRuntime: false, reads: [] }
      sessions.set(page, state)
      await page.route('**/rpc/workflow', async (route) => {
        const rpc = route.request().postDataJSON()
        state.reads.push(rpc.method)
        let result
        if (rpc.method === 'get_task') result = state.denyTask ? { code: 1, message: '当前任务不可读取' } : { code: 0, data: { task: task(Number(rpc.params.task_id)) } }
        else if (rpc.method === 'list_task_events') result = state.denyEvents ? { code: 1, message: '当前任务不可读取' } : { code: 0, data: { items: [{ id: 1, event_type: 'status_changed', from_status_key: 'ready', to_status_key: 'blocked', created_at: 1800000010, reason: '补齐审批资料' }], truncated: false } }
        else if (rpc.method === 'get_task_process_context') result = state.denyRuntime ? { code: 1, message: '流程暂不可读取' } : { code: 0, data: { process_context: context } }
        else return route.fallback()
        await route.fulfill({ json: { jsonrpc: '2.0', id: rpc.id, result } })
      })
    },
    verify: async (page) => {
      const visit = async (query) => page.goto(new URL(`/__dev/status-flows?${query}`, page.url()).href)
      const tabs = page.getByRole('tablist', { name: '关联信息类型' })
      const choose = async (label) => tabs.getByRole('tab', { name: label, exact: true }).click()
      await expect(page.getByRole('button', { name: '技术详情', exact: true })).toHaveCount(0)
      await page.getByRole('button', { name: '查看规则', exact: true }).click()
      await expect(tabs).toBeVisible()
      const strip = await tabs.elementHandle()
      const stripBox = await tabs.boundingBox()
      const fullList = page.locator('[data-all-transitions]')
      await expect(fullList).not.toHaveAttribute('open')
      await expect(page.locator('.erp-dev-flow-state-list')).toHaveCount(0)
      const graph = page.locator('.erp-dev-flow-state-rule [data-business-flow]')
      await expect(graph).toHaveAttribute('data-graph-status', 'rendered')
      await graph.locator('[data-graph-node]').first().click()
      await expect(page.getByRole('region', { name: '当前状态的转换条件' })).toBeVisible()
      await page.getByRole('button', { name: /^全部 / }).click()
      await fullList.locator(':scope > summary').click()
      await expect(fullList.locator('li').first()).toBeVisible()
      await fullList.locator(':scope > summary').click()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-state.png') })
      await choose('事实定义')
      await expect(page.getByText('何时生效', { exact: true })).toBeVisible()
      await expect(page.getByText('权威真源', { exact: true })).toBeHidden()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-fact.png') })
      const factsEvidence = page.locator('[data-selected-fact] [data-evidence-disclosure]')
      await factsEvidence.locator('summary').click()
      await expect(page.getByText('权威真源', { exact: true })).toBeVisible()
      await choose('流程轨迹')
      await expect(page.locator('.erp-dev-flow-process-definition')).toBeVisible()
      await expect(page.locator('.erp-dev-flow-runtime-instance')).toHaveCount(0)
      await expect(page.getByText('当前查看流程定义；实际进度按任务查询。', { exact: true })).toBeVisible()
      await choose('协同记录')
      await expect(page.getByRole('button', { name: '定位任务', exact: true })).toBeVisible()
      const motion = await verifyMobileNavigationMotion(page, assert, '[aria-label="关联信息类型"]', 2)
      const reduced = await verifyMobileNavigationMotion(page, assert, '[aria-label="关联信息类型"]', 3, true)
      await writeFile(path.join(outputDir, 'flow-details-navigation-motion.json'), JSON.stringify({ motion, reduced }, null, 2))
      await choose('协同记录')
      assert(await strip.evaluate((el) => el.isConnected), '关联页签在四个视图间保持挂载')
      const afterBox = await tabs.boundingBox()
      assert(Math.abs(stripBox.x - afterBox.x) <= 1 && Math.abs(stripBox.width - afterBox.width) <= 1, '关联页签条保持位置与宽度')
      await page.getByRole('button', { name: '定位任务', exact: true }).click()
      await expect(page.locator('#dev-flow-task-search')).toBeVisible()
      await visit('view=workflow&task_id=21')
      await expect(page.getByText('任务协同记录读取失败', { exact: true })).toBeVisible()
      sessions.get(page).denyEvents = false
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await expect(page.getByText('模拟办理人', { exact: true })).toBeVisible()
      await expect(page.locator('.erp-dev-flow-events blockquote')).toHaveText('补齐审批资料')
      await expect(page.getByText('数据来源', { exact: true })).toBeHidden()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-workflow.png') })
      await expect(page.getByRole('button', { name: '返回 实例跟踪', exact: true })).toBeVisible()
      sessions.get(page).denyTask = true
      await page.reload()
      await expect(page.getByText('任务读取失败', { exact: true })).toBeVisible()
      await expect(page.locator('[data-workflow-task]')).toHaveCount(0)
      sessions.get(page).denyTask = false
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await expect(page.getByText('模拟办理人', { exact: true })).toBeVisible()

      await choose('流程轨迹')
      const instance = page.locator('.erp-dev-flow-runtime-instance')
      await expect(instance).toBeVisible()
      await expect(page.locator('#dev-flow-process-select')).toHaveCount(0)
      await expect(page.locator('.erp-dev-flow-process-definition')).toHaveCount(0)
      await expect(instance.getByText('实例标识', { exact: true })).toBeHidden()
      await expect(instance.getByText('第 2 次尝试', { exact: true })).toBeVisible()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-runtime.png') })
      await instance.locator('[data-evidence-disclosure] summary').click()
      await expect(instance.getByText('实例标识', { exact: true })).toBeVisible()
      await expect(instance.getByLabel('流程责任来源核对')).toBeVisible()
      sessions.get(page).denyRuntime = true
      await page.reload()
      await expect(page.getByText('运行实例读取失败', { exact: true })).toBeVisible()
      await expect(instance).toHaveCount(0)
      sessions.get(page).denyRuntime = false
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await expect(instance).toBeVisible()
      await page.getByRole('button', { name: '浏览流程定义', exact: true }).click()
      assert.equal(new URL(page.url()).searchParams.has('task_id'), false)
      await expect(page.locator('.erp-dev-flow-process-definition')).toBeVisible()
      await page.getByRole('button', { name: '返回 流程轨迹', exact: true }).click()
      await expect(instance).toBeVisible()
      const runtimeReads = sessions.get(page).reads.filter((name) => name === 'get_task_process_context').length
      await visit('view=runtime&task_id=22')
      await expect(page.locator('[data-task-runtime-boundary="unlinked"]')).toBeVisible()
      await expect(instance).toHaveCount(0)
      assert(sessions.get(page).reads.filter((name) => name === 'get_task_process_context').length === runtimeReads, '未关联任务不补造运行节点')
      await page.setViewportSize({ width: 1024, height: 768 })
      for (const query of ['view=states', 'view=facts', 'view=runtime', 'view=workflow&task_id=21']) {
        await visit(query)
        await expect(page.locator('[data-catalog-status="ready"]')).toBeVisible()
        await assertNoHorizontalOverflow(page, `关联信息窄窗口 ${query}`)
      }
      assert(sessions.get(page).reads.every((method) => ['get_task', 'list_task_events', 'get_task_process_context'].includes(method)), '四个视图只读取正式任务和流程接口')
    },
  }, {
    name: 'dev-flow-details-design-preview',
    path: '/__dev/ui-design?page=workbench&workbenchMode=preview',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('table', { name: '开发工具对照' }).getByRole('button', { name: '业务链路', exact: true }).click()
      const preview = frame.locator('[data-dev-flow-preview]')
      await preview.getByRole('button', { name: '查看规则', exact: true }).click()
      const rules = preview.locator('[data-flow-rules]')
      await expect(rules).toHaveAttribute('open')
      const stateRules = rules.locator('[data-dev-rule-preview]')
      await stateRules.getByRole('button', { name: '全部', exact: true }).click()
      const complete = stateRules.locator('[data-rule-panel="all"] details')
      await expect(complete).not.toHaveAttribute('open')
      await complete.locator('summary').click()
      await expect(complete.locator('li')).toHaveCount(3)
      await expect(rules.getByText('事实定义 · 采购入库', { exact: true })).toBeVisible()
      await preview.getByRole('tab', { name: '实例跟踪', exact: true }).click()
      await preview.getByRole('button', { name: '定位', exact: true }).click()
      const task = preview.locator('[data-flow-example]')
      await expect(task).toBeVisible()
      await task.getByText('协同记录 · 模拟任务', { exact: true }).click()
      await expect(task.getByText('当前责任：IQC · 待处理 · 原因：色差待确认', { exact: true })).toBeVisible()
      await task.getByText('流程轨迹 · 模拟任务', { exact: true }).click()
      await expect(task.getByText('当前环节：质量处理 · IQC', { exact: true })).toBeVisible()
      await assertNoHorizontalOverflow(page, '业务链路设计预览')
    },
  }]
}
