import { expect } from 'playwright/test'
import { writeFile } from 'node:fs/promises'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDevFlowDetailScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const assertDefinitionSelectorWidth = async (page) => {
    const selector = page.locator('.erp-dev-flow-definition-selector > .ant-select')
    await expect(selector).toBeVisible()
    const bounds = await selector.boundingBox()
    const label = await page.locator('.erp-dev-flow-definition-selector > label').boundingBox()
    assert(bounds.width >= 240 && bounds.width <= 480, '定义选择器应保留可读宽度，不随桌面整行拉伸')
    assert(bounds.x - label.x - label.width >= 0 && bounds.x - label.x - label.width <= 16, '标签与选择器紧邻，不用空白列填满页面')
  }
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
  const node = { id: 20, process_instance_id: 10, node_key: active.key, node_type: 'approval', attempt: 2, version: 1, status: 'blocked', started_at: 1800000005 }
  const context = {
    source: { type: 'sales_order', id: 1001, no: 'SO-QA-DETAIL-001' },
    process_instance: { id: 10, process_key: definition.processKey, process_version: definition.processVersion, status: 'blocked', started_at: 1800000000 },
    linked_node: node,
    approval_form: null,
    nodes: [node, { id: 25, process_instance_id: 10, node_key: 'end', node_type: 'end', attempt: 1, version: 1, status: 'waiting' }],
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
      const state = { denyTask: false, denyEvents: true, denyRuntime: false, denyOlder: true, reads: [], eventQueries: [] }
      sessions.set(page, state)
      await page.route('**/rpc/workflow', async (route) => {
        const rpc = route.request().postDataJSON()
        state.reads.push(rpc.method)
        let result
        if (rpc.method === 'get_task') result = state.denyTask ? { code: 1, message: '当前任务不可读取' } : { code: 0, data: { task: task(Number(rpc.params.task_id)) } }
        else if (rpc.method === 'list_task_events') {
          state.eventQueries.push(rpc.params)
          const cursor = Number(rpc.params.before_event_id || 0)
          const events = Array.from({ length: 101 }, (_, index) => ({ id: 101 - index, event_type: index === 100 ? 'source_state_changed' : 'status_changed', from_status_key: 'ready', to_status_key: 'blocked', created_at: 1800000010 - index, reason: index === 0 ? '补齐审批资料' : '', payload: index === 100 ? { from_business_status_key: 'project_pending', to_business_status_key: 'project_approved' } : {} }))
          const remaining = events.filter((event) => !cursor || event.id < cursor)
          result = state.denyEvents || (cursor && state.denyOlder)
            ? { code: 1, message: '当前任务不可读取' }
            : { code: 0, data: { items: remaining.slice(0, rpc.params.limit), truncated: remaining.length > rpc.params.limit } }
        }
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
      await page.getByRole('tab', { name: '查看规则', exact: true }).click()
      await expect(tabs).toBeVisible()
      const strip = await tabs.elementHandle()
      const stripBox = await tabs.boundingBox()
      const fullList = page.locator('[data-all-transitions]')
      await expect(fullList).not.toHaveAttribute('open')
      await expect(page.locator('.erp-dev-flow-state-list')).toHaveCount(0)
      const graph = page.locator('.erp-dev-flow-state-rule [data-business-flow]')
      await expect(graph).toHaveAttribute('data-graph-status', 'rendered')
      await assertDefinitionSelectorWidth(page)
      await graph.locator('[data-graph-node]').first().click()
      await expect(page.getByRole('region', { name: '当前状态的转换条件' })).toBeVisible()
      await page.getByRole('button', { name: /^全部 / }).click()
      await fullList.locator(':scope > summary').click()
      await expect(fullList.locator('li').first()).toBeVisible()
      await fullList.locator(':scope > summary').click()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-state.png') })
      await choose('事实定义')
      await expect(page.getByText('何时生效', { exact: true })).toBeVisible()
      await assertDefinitionSelectorWidth(page)
      await expect(page.getByText('权威真源', { exact: true })).toBeHidden()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-fact.png') })
      const factsEvidence = page.locator('[data-selected-fact] [data-evidence-disclosure]')
      await factsEvidence.locator('summary').click()
      await expect(page.getByText('权威真源', { exact: true })).toBeVisible()
      await choose('流程轨迹')
      await expect(page.locator('.erp-dev-flow-process-definition')).toBeVisible()
      await expect(page.locator('.erp-dev-flow-runtime-instance')).toHaveCount(0)
      await expect(page.getByText('当前查看流程定义；实际进度按任务查询。', { exact: true })).toBeVisible()
      await assertDefinitionSelectorWidth(page)
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
      await expect(page.locator('.erp-dev-flow-events li')).toHaveCount(100)
      await page.getByRole('button', { name: '加载更早记录', exact: true }).click()
      await expect(page.getByText('更早记录读取失败', { exact: true })).toBeVisible()
      await expect(page.locator('.erp-dev-flow-events li')).toHaveCount(100)
      sessions.get(page).denyOlder = false
      await page.getByRole('button', { name: '重试加载更早记录', exact: true }).click()
      await expect(page.locator('.erp-dev-flow-events li')).toHaveCount(101)
      await expect(page.getByText('来源业务进度已更新', { exact: true })).toBeVisible()
      await expect(page.getByText('已显示该任务全部可见记录', { exact: true })).toBeVisible()
      assert.equal(sessions.get(page).eventQueries.at(-1).before_event_id, 2)

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
      await expect(instance.getByText('第 2 次', { exact: true })).toBeVisible()
      await expect(instance.locator('[aria-label="实际流程节点"] li')).toHaveCount(1)
      await expect(instance.getByText(/^开始：/)).toBeVisible()
      await expect(instance.getByText('尚有待确定的后续路径；未激活分支不列为已发生步骤。', { exact: true })).toBeVisible()

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
        if (query !== 'view=workflow&task_id=21') await assertDefinitionSelectorWidth(page)
        await assertNoHorizontalOverflow(page, `关联信息窄窗口 ${query}`)
      }
      assert(sessions.get(page).reads.every((method) => ['get_task', 'list_task_events', 'get_task_process_context'].includes(method)), '四个视图只读取正式任务和流程接口')
    },
  }, {
    name: 'dev-flow-rules-complete',
    path: '/__dev/status-flows?view=states&flow=process.instance',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => {
      const visit = async (flow) => page.goto(new URL(`/__dev/status-flows?view=states&flow=${flow}`, page.url()).href)
      const primary = page.getByRole('tablist', { name: '业务链路方式' })
      await expect(primary.getByRole('tab', { name: '查看规则', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('tab', { name: '状态与流转规则', exact: true })).toBeVisible()
      const details = page.locator('[data-selected-flow]')
      await expect(details.getByRole('heading', { name: '流程结束结果', exact: true })).toBeVisible()
      await expect(details.getByText('成功结束 / 驳回结束 / 取消结束 / 补偿结束', { exact: true })).toBeVisible()
      const activeFilterColor = await page.getByRole('button', { name: /^正常推进 / }).evaluate((button) => getComputedStyle(button).backgroundColor)
      await page.getByRole('button', { name: /^异常与纠正 / }).click()
      await expect(page.getByRole('button', { name: /^异常与纠正 / })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: /^异常与纠正 / })).toHaveClass(/ant-btn-primary/)
      await expect(page.getByRole('button', { name: /^正常推进 / })).not.toHaveClass(/ant-btn-primary/)
      await page.mouse.move(0, 0)
      await expect(page.getByRole('button', { name: /^异常与纠正 / })).toHaveCSS('background-color', activeFilterColor)
      await expect(page.getByRole('button', { name: /^正常推进 / })).not.toHaveCSS('background-color', activeFilterColor)
      await expect(details.locator('[data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      await expect(details.getByRole('button', { name: /已阻塞.*结束/ })).toHaveCount(0)
      await page.screenshot({ path: path.join(outputDir, 'flow-rules-process-results.png') })
      await visit('process.node')
      await expect(details.getByRole('heading', { name: '领域副作用与补偿', exact: true })).toBeVisible()
      await expect(details.getByText('影响待确认 / 没有业务副作用 / 业务影响已生效 / 业务影响已补偿', { exact: true })).toBeVisible()
      await visit('workflow.task')
      await page.getByRole('button', { name: /^全部 / }).click()
      await details.locator('[data-all-transitions] > summary').click()
      await expect(details.locator('[data-all-transitions]').getByText('可执行 → 已撤回', { exact: true })).toBeVisible()
      await expect(details.locator('[data-all-transitions]').getByText('阻塞 → 已撤回', { exact: true })).toBeVisible()
      await expect(details.getByText('系统内部触发；入口权限由来源动作校验', { exact: true })).toHaveCount(2)
      await visit('fact.shipment_finance_release')
      await page.getByRole('button', { name: /^全部 / }).click()
      await details.locator('[data-all-transitions] > summary').click()
      await expect(details.locator('[data-all-transitions]').getByText('待放行 → 已拒绝', { exact: true })).toBeVisible()
      await expect(details.locator('[data-all-transitions]').getByText('待放行 → 已放行', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: /^全部 / })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('button', { name: /^全部 / })).toHaveClass(/ant-btn-primary/)
      await expect(page.getByRole('button', { name: /^正常推进 / })).not.toHaveClass(/ant-btn-primary/)
      await page.mouse.move(0, 0)
      await expect(page.getByRole('button', { name: /^全部 / })).toHaveCSS('background-color', activeFilterColor)
      await expect(page.getByRole('button', { name: /^正常推进 / })).not.toHaveCSS('background-color', activeFilterColor)
      await page.screenshot({ path: path.join(outputDir, 'flow-rules-shipment-finance.png') })
      await visit('fact.quality_inspection')
      await expect(details.getByText('合格 / 不合格 / 让步接收', { exact: true })).toBeVisible()
      await visit('control.customer_config_revision')
      await expect(details.getByText('可读写 / 只读 / 停用', { exact: true })).toBeVisible()
      await page.getByRole('button', { name: '搜索定义', exact: true }).click()
      const search = page.getByRole('dialog', { name: '搜索定义', exact: true })
      await search.getByPlaceholder('例如：销售订单、销售 PMC、已提交').fill('domain_command_effect_state')
      await search.getByPlaceholder('例如：销售订单、销售 PMC、已提交').press('Enter')
      await search.getByRole('button').filter({ hasText: 'process.node' }).click()
      await expect(details).toHaveAttribute('data-selected-flow', 'process.node')
      await expect(details.getByRole('heading', { name: '领域副作用与补偿', exact: true })).toBeVisible()
      await visit('master.lifecycle')
      await expect(details.getByText('当前筛选没有登记的转换', { exact: true })).toHaveCount(0)
      await expect(details.getByRole('heading', { name: '逐对象启停规则', exact: true })).toBeVisible()
      await expect(details.locator('[data-master-lifecycle-rules] tbody tr.ant-table-row')).toHaveCount(5)
      await page.setViewportSize({ width: 1024, height: 768 })
      await assertNoHorizontalOverflow(page, '状态分类与规则窄窗口')
    },
  }, {
    name: 'dev-flow-action-rules-desktop-light',
    path: '/__dev/status-flows?view=states&flow=workflow.task',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => {
      const calls = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('jsonrpc')) calls.push(request.postDataJSON()?.method)
      })
      const detail = page.locator('[data-selected-flow]')
      const rules = detail.locator('[data-action-rules]')
      const select = page.getByRole('combobox', { name: '选择状态对象', exact: true })
      const choose = async (label) => {
        const { key } = catalog.flows.find((flow) => flow.label === label)
        await select.fill(label)
        await page.getByRole('option').filter({ has: page.getByText(key, { exact: true }) }).click()
        await expect(detail.getByRole('heading', { name: label, exact: true })).toBeVisible()
      }
      await expect(rules.locator('tbody tr.ant-table-row')).toHaveCount(2)
      await expect(rules.getByText('指定或改派办理人', { exact: true })).toBeVisible()
      await expect(rules.getByText('退回责任池', { exact: true })).toBeVisible()
      await rules.locator('summary').first().click()
      await expect(rules.locator('tbody tr.ant-table-row').first().getByText('workflow.task.assign', { exact: true })).toBeVisible()
      for (const cell of await rules.locator('tbody tr.ant-table-row').first().locator('td').all()) {
        await expect(cell).toHaveCSS('vertical-align', 'top')
      }
      await rules.scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(outputDir, 'action-rules-assignment.png') })

      await choose('出货单')
      await expect(rules.locator('tbody tr.ant-table-row')).toHaveCount(2)
      await expect(rules.getByText(/没有有效成品质检时可继续/u)).toBeVisible()
      await expect(rules.getByText('退回责任池', { exact: true })).toHaveCount(0)
      await rules.scrollIntoViewIfNeeded()
      await assertNoHorizontalOverflow(page, '出货办理条件')
      await page.screenshot({ path: path.join(outputDir, 'action-rules-shipment.png') })

      for (const key of ['source.sales_order', 'source.purchase_order', 'source.outsourcing_order', 'source.production_order', 'fact.purchase_receipt', 'fact.production', 'fact.outsourcing', 'fact.finance', 'fact.finance_payment', 'source.production_exception_execution']) {
        const flow = catalog.flows.find((item) => item.key === key)
        await choose(flow.label)
        await expect(rules.locator('tbody tr.ant-table-row')).toHaveCount(flow.actionRules.length)
        await expect(rules.getByText(flow.actionRules[0].blocked, { exact: false })).toBeVisible()
      }

      await page.getByRole('button', { name: '搜索定义', exact: true }).click()
      const search = page.getByRole('dialog', { name: '搜索定义', exact: true })
      await search.getByPlaceholder('例如：销售订单、销售 PMC、已提交').fill('默认仓引用')
      await search.getByPlaceholder('例如：销售订单、销售 PMC、已提交').press('Enter')
      await search.getByRole('button').filter({ hasText: 'master.lifecycle' }).click()
      const master = detail.locator('[data-master-lifecycle-rules]')
      await expect(master.locator('tbody tr.ant-table-row')).toHaveCount(5)
      await expect(rules).toHaveCount(0)
      await expect(detail.locator('[data-business-flow]')).toHaveCount(0)
      await expect(detail.getByRole('combobox', { name: '聚焦状态', exact: true })).toHaveCount(0)
      await master.getByText('仓库', { exact: true }).scrollIntoViewIfNeeded()
      await expect(master.getByText(/停用时仍有正数库存或材料默认仓引用/u)).toBeVisible()
      await master.locator('tbody tr.ant-table-row').last().locator('summary').click()
      await expect(master.getByText('update_warehouse', { exact: true })).toBeVisible()
      for (const cell of await master.locator('tbody tr.ant-table-row').last().locator('td').all()) {
        await expect(cell).toHaveCSS('vertical-align', 'top')
      }
      await page.screenshot({ path: path.join(outputDir, 'action-rules-master-lifecycle.png') })
      for (const width of [1440, 1024]) {
        await page.setViewportSize({ width, height: 900 })
        await assertNoHorizontalOverflow(page, `主数据规则 ${width}px`)
        const metrics = await master.locator('.ant-table-content').evaluate((element) => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: getComputedStyle(element).overflowX }))
        assert(metrics.width > 0 && (metrics.scrollWidth <= metrics.width + 1 || ['auto', 'scroll'].includes(metrics.overflowX)), '宽表在局部容器内滚动')
      }
      await choose('销售订单')
      await expect(master).toHaveCount(0)
      await expect(rules.getByText('正常关单或短结', { exact: true })).toBeVisible()
      const mutations = calls.filter((method) => /^(?:reassign|set|update|create|delete|post|cancel|close|execute|reverse|approve|reject|submit)_/u.test(method || ''))
      assert.deepEqual(mutations, [], '规则查阅、搜索和对象切换不调用业务写接口')
    },
  }, {
    name: 'dev-flow-details-design-preview',
    path: '/__dev/ui-design?page=workbench&workbenchMode=preview',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('table', { name: '开发工具对照' }).getByRole('button', { name: '业务链路', exact: true }).click()
      const preview = frame.locator('[data-dev-flow-preview]')
      await preview.getByRole('tab', { name: '查看规则', exact: true }).click()
      const rules = preview.locator('[data-flow-rules]')
      await expect(rules).toHaveAttribute('open')
      const stateRules = rules.locator('[data-dev-rule-preview]')
      await stateRules.getByRole('button', { name: '全部', exact: true }).click()
      const complete = stateRules.locator('[data-rule-panel="all"] details')
      await expect(complete).not.toHaveAttribute('open')
      await complete.locator('summary').click()
      await expect(complete.locator('li')).toHaveCount(3)
      await expect(stateRules.getByRole('table', { name: '办理条件与影响样例', exact: true })).toBeVisible()
      await expect(stateRules.getByRole('table', { name: '逐对象启停规则样例', exact: true })).toBeVisible()
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
