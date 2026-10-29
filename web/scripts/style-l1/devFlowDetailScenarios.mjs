import { expect } from 'playwright/test'
import { writeFile } from 'node:fs/promises'
import { DEV_FLOW_STATE_CATALOG as catalog } from '../../src/dev-workbench/config/devFlowStateCatalog.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function verifyFocusedFlowRules(page, { assert, assertNoHorizontalOverflow, outputDir, path, keys }) {
  const choose = async (label, value) => {
    const input = page.getByRole('combobox', { name: label, exact: true })
    await page.locator('.ant-select').filter({ has: input }).locator('.ant-select-selector').click()
    await page.locator('.ant-select-dropdown:visible').getByText(value, { exact: true }).click()
  }
  const { origin } = new URL(page.url())
  const flows = keys ? catalog.flows.filter((flow) => keys.includes(flow.key)) : catalog.flows
  let actions = 0
  for (const flow of flows) {
    await page.goto(`${origin}/__dev/business-rules?view=states&flow=${encodeURIComponent(flow.key)}`)
    const reader = page.locator('[data-selected-flow]')
    await expect(reader).toHaveAttribute('data-selected-flow', flow.key)
    await expect(reader.locator('[data-source-reference]:visible, [data-all-transitions]')).toHaveCount(0)
    for (const rule of flow.actionRules) {
      await choose('办理动作', rule.label)
      const content = reader.locator('[data-action-rules]')
      for (const field of ['condition', 'blocked', 'effect', 'recovery']) await expect(content).toContainText(rule[field])
      actions += 1
    }
    for (const rule of flow.lifecycleRules) {
      await choose('主数据对象', rule.label)
      const content = reader.locator('[data-master-lifecycle-rules]')
      for (const field of ['condition', 'blocked', 'effect', 'recovery']) await expect(content).toContainText(rule[field])
      actions += 1
    }
    if (flow.transitions.length) {
      await page.getByRole('button', { name: /^全部 / }).click()
      const graph = reader.locator('[data-business-flow]')
      await expect(graph).toHaveAttribute('data-graph-status', 'rendered')
      await graph.locator('[data-graph-node]').first().click()
      await expect(reader.locator('.erp-dev-flow-selected-state')).toBeVisible()
    }
    await assertNoHorizontalOverflow(page, flow.label)
  }
  assert(actions > 0, '实际遍历办理规则和启停规则')
  await writeFile(path.join(outputDir, keys ? 'focused-rule-reading.json' : 'all-rule-reading.json'), JSON.stringify({ flows: flows.map((flow) => ({ key: flow.key, actions: flow.actionRules.length, lifecycleRules: flow.lifecycleRules.length })), verifiedRules: actions }, null, 2))
  await page.goto(`${origin}/__dev/business-rules?view=states&flow=fact.shipment`)
  await expect(page.getByRole('combobox', { name: '办理动作', exact: true })).toBeVisible()
  for (const width of [1024, 1280, 1920]) {
    await page.setViewportSize({ width, height: 1080 })
    await assertNoHorizontalOverflow(page, `聚焦规则 ${width}`)
  }
  await page.screenshot({ path: path.join(outputDir, 'focused-business-rules-4k.png') })
}

export function createDevFlowDetailScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const assertDefinitionSelectorWidth = async (page) => {
    const selector = page.locator('.erp-dev-flow-definition-selector > .erp-workbench-toolbar__controls > .ant-select')
    await expect(selector).toBeVisible()
    const viewport = page.viewportSize()
    const input = selector.getByRole('combobox')
    const selectedLabel = await selector.locator('.ant-select-selection-item').innerText()
    const popup = page.locator('.erp-dev-flow-definition-select-popup:visible')
    await selector.locator('.ant-select-selector').click()
    await expect(popup.locator('.ant-select-item-option-selected')).toHaveCount(1)
    const selectedTitle = await popup.locator('.ant-select-item-option-selected').getAttribute('title')
    await input.press('Escape')
    await expect(popup).toBeHidden()
    for (const hasValue of [true, false]) {
      if (!hasValue) await selector.locator('.ant-select-clear').click()
      for (const width of [1024, 1920, 3840]) {
        await page.setViewportSize({ width, height: 1080 })
        const bounds = await selector.boundingBox()
        const toolbar = await page.locator('.erp-dev-flow-definition-selector').boundingBox()
        assert(Math.abs(bounds.width - 420) <= 1, '定义选择器在空值及选中后均保留 420px 可读宽度，不随桌面拉伸或按内容收缩')
        assert(Math.abs(bounds.x - toolbar.x) <= 1, '对象选择从阅读区左侧开始，不叠加标签或留空白列')
        const filter = page.getByRole('button', { name: '关联筛选', exact: true })
        if (await filter.count()) {
          const box = await filter.boundingBox()
          assert(Math.abs(box.y - bounds.y) <= 1 && box.x - bounds.x - bounds.width <= 16, '筛选紧接对象选择，同一行就近操作')
        }
        await selector.locator('.ant-select-selector').click()
        await expect(popup.locator('.erp-dev-flow-definition-option').first()).toBeVisible()
        await waitForFiniteAnimations(page, { selector: '.erp-dev-flow-definition-select-popup' })
        const menu = await popup.boundingBox()
        assert(Math.abs(menu.width - 560) <= 1, '复杂定义菜单保留独立的 560px 阅读宽度')
        assert(menu.x >= 16 && menu.x + menu.width <= width - 16, '定义菜单保留视口边距')
        const options = await popup.locator('.erp-dev-flow-definition-option').evaluateAll((nodes) => nodes.map((node) => {
          const label = node.querySelector('.erp-dev-flow-definition-option__label')
          return {
            labelWidth: label.getBoundingClientRect().width,
            labelBottom: label.getBoundingClientRect().bottom,
            labelOverflow: label.scrollWidth - label.clientWidth,
          }
        }))
        assert(options.length > 0, '实际定义选项已加载')
        for (const option of options) {
          assert(option.labelWidth >= menu.width - 40, '业务名称使用完整行宽，不被技术标识挤成逐字折行')
          assert(option.labelOverflow <= 1, '名称不裁切或横向溢出')
        }
        if (!hasValue && width === 1920 && await input.getAttribute('id') === 'dev-flow-state-select') {
          await page.screenshot({ path: path.join(outputDir, 'flow-definition-dropdown-4k.png') })
          await page.screenshot({ path: path.join(outputDir, 'flow-definition-dropdown-detail.png'), clip: { x: bounds.x - 12, y: bounds.y - 12, width: menu.width + 32, height: menu.y + menu.height - bounds.y + 28 } })
        }
        await input.press('Escape')
        await expect(popup).toBeHidden()
        await assertNoHorizontalOverflow(page)
      }
    }
    await page.setViewportSize(viewport)
    await input.fill(selectedLabel)
    await popup.locator(`.ant-select-item-option[title=${JSON.stringify(selectedTitle)}]`).click()
    await expect(popup).toBeHidden()
    await expect(selector.locator('.ant-select-selection-item')).toHaveText(selectedLabel)
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
      await page.addInitScript(() => { window.print = () => {} })
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
      const primary = page.getByRole('tablist', { name: '业务链路方式' })
      const primaryMotion = await verifyMobileNavigationMotion(page, assert, '[aria-label="业务链路方式"]', 1)
      const primaryReduced = await verifyMobileNavigationMotion(page, assert, '[aria-label="业务链路方式"]', 0, true)
      await page.getByRole('link', { name: '业务规则', exact: true }).click()
      await expect(tabs).toBeVisible()
      await expect(page.getByRole('button', { name: /^返回 / })).toHaveCount(0)
      await writeFile(path.join(outputDir, 'flow-primary-navigation-motion.json'), JSON.stringify({ primaryMotion, primaryReduced }, null, 2))
      await expect(page.locator('[data-all-transitions]')).toHaveCount(0)
      await expect(page.locator('.erp-dev-flow-state-list')).toHaveCount(0)
      const graph = page.locator('.erp-dev-flow-state-rule [data-business-flow]')
      await expect(graph).toHaveAttribute('data-graph-status', 'rendered')
      await assertDefinitionSelectorWidth(page)
      await graph.locator('[data-graph-node]').first().click()
      await expect(page.getByRole('region', { name: '当前状态的转换条件' })).toBeVisible()
      await page.getByRole('button', { name: /^全部 / }).click()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-state.png') })
      await choose('事实规则')
      await expect(page.getByText('何时生效', { exact: true })).toBeVisible()
      await assertDefinitionSelectorWidth(page)
      await expect(page.getByText('权威真源', { exact: true })).toBeHidden()
      await page.screenshot({ path: path.join(outputDir, 'flow-details-fact.png') })
      await expect(page.locator('[data-selected-fact] [data-evidence-disclosure]')).toHaveCount(0)
      await expect(page.getByText('防止重复', { exact: true })).toBeVisible()
      await choose('流程定义')
      await expect(page.locator('.erp-dev-flow-process-definition')).toBeVisible()
      await expect(page.locator('.erp-dev-flow-runtime-instance')).toHaveCount(0)
      await expect(page.getByText('当前查看流程定义；实际进度按任务查询。', { exact: true })).toHaveCount(0)
      await expect(page.getByText('流程定义与 variant', { exact: true })).toHaveCount(0)
      await expect(page.locator('.erp-dev-flow-process-definition .erp-workbench-section__heading')).toHaveCount(0)
      await assertDefinitionSelectorWidth(page)
      const processGraph = page.locator('.erp-dev-flow-process-definition [data-business-flow]')
      await expect(processGraph).toHaveAttribute('data-graph-status', 'rendered')
      const selectorBox = await page.locator('.erp-dev-flow-definition-selector').boundingBox()
      const graphBox = await processGraph.boundingBox()
      assert(graphBox.y - selectorBox.y - selectorBox.height <= 24, '选择后紧接流程图，中间没有重复标题与说明层')
      await expect(page.locator('.erp-dev-flow-process-definition')).toHaveCSS('border-width', '0px')
      await page.screenshot({ path: path.join(outputDir, 'flow-details-process.png') })
      for (const node of await processGraph.locator('[data-graph-node]').all()) {
        await node.click()
        await expect(node).toHaveAttribute('aria-pressed', 'true')
        await expect(page.locator('.erp-dev-flow-process-definition .erp-dev-fulfillment-guide__focus strong')).toHaveText(await node.locator('strong').innerText())
      }
      await processGraph.locator('[data-graph-node][aria-pressed="true"]').click()
      await expect(page.locator('.erp-dev-flow-process-definition .erp-dev-fulfillment-guide__focus')).toHaveCount(0)
      const strip = await tabs.elementHandle()
      const stripBox = await tabs.boundingBox()
      const motion = await verifyMobileNavigationMotion(page, assert, '[aria-label="关联信息类型"]', 2)
      const reduced = await verifyMobileNavigationMotion(page, assert, '[aria-label="关联信息类型"]', 0, true)
      await writeFile(path.join(outputDir, 'flow-details-navigation-motion.json'), JSON.stringify({ motion, reduced }, null, 2))
      assert(await strip.evaluate((el) => el.isConnected), '规则分类切换保持挂载')
      const afterBox = await tabs.boundingBox()
      assert(Math.abs(stripBox.x - afterBox.x) <= 1 && Math.abs(stripBox.width - afterBox.width) <= 1, '关联页签条保持位置与宽度')
      await choose('财务口径')
      const financeControl = page.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '财务口径类型', exact: true }) })
      await expect(financeControl).toBeVisible()
      await expect(page.getByRole('tablist', { name: '财务口径类型', exact: true })).toHaveCount(0)
      await financeControl.locator('.ant-select-clear').click()
      await expect(page.getByText('请选择财务口径', { exact: true })).toBeVisible()
      assert.equal(new URL(page.url()).searchParams.get('finance_rule'), '')
      await page.reload()
      await expect(page.getByText('请选择财务口径', { exact: true })).toBeVisible()
      await page.getByRole('combobox', { name: '财务口径类型', exact: true }).fill('月结')
      await page.getByRole('option', { name: '月结到期日', exact: true }).click()
      await expect(page.getByText('日期示例', { exact: true })).toBeVisible()
      await expect(page.getByText('这里只演示日期。真实账款保留发生时刻，到期时间以服务端冻结记录为准。', { exact: true })).toBeVisible()
      await choose('事实规则')
      await choose('财务口径')
      await expect(financeControl.locator('.ant-select-selection-item')).toHaveText('月结到期日')
      await page.getByRole('link', { name: '业务链路', exact: true }).click()
      await primary.getByRole('tab', { name: '实例跟踪', exact: true }).click()
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
      await expect(page.getByRole('button', { name: /^返回 / })).toHaveCount(0)
      const primaryStrip = await primary.elementHandle()
      await page.evaluate(() => window.scrollTo({ top: 420, behavior: 'instant' }))
      const readingY = await page.evaluate(() => window.scrollY)
      assert(readingY > 0, '事件列表足够长，可验证异步重新读取后的阅读位置')
      // Trigger the tab without the test runner first scrolling its header into view.
      await primary.getByRole('tab', { name: '业务结构', exact: true }).evaluate((el) => el.click())
      await expect(page.locator('#dev-flow-task-search')).toHaveCount(0)
      await primary.getByRole('tab', { name: '实例跟踪', exact: true }).click()
      await expect(page.locator('.erp-dev-flow-events li')).toHaveCount(100)
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(readingY)
      await expect(tabs.getByRole('tab', { name: '协同记录', exact: true })).toHaveAttribute('aria-selected', 'true')
      await expect(page.getByRole('button', { name: /^返回 / })).toHaveCount(0)
      assert(await primaryStrip.evaluate((el) => el.isConnected), '一级页签切换保持同一导航节点')
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
      assert.equal(new URL(page.url()).searchParams.get('view'), 'processes')
      await expect(page.locator('.erp-dev-flow-process-definition')).toBeVisible()
      await page.getByRole('button', { name: '返回 流程轨迹', exact: true }).click()
      await expect(instance).toBeVisible()
      const runtimeReads = sessions.get(page).reads.filter((name) => name === 'get_task_process_context').length
      await visit('view=runtime&task_id=22')
      await expect(page.locator('[data-task-runtime-boundary="unlinked"]')).toBeVisible()
      await expect(instance).toHaveCount(0)
      assert(sessions.get(page).reads.filter((name) => name === 'get_task_process_context').length === runtimeReads, '未关联任务不补造运行节点')
      for (const view of ['states', 'facts', 'processes', 'finance_rules']) {
        await visit(`view=${view}`)
        const selector = page.locator('.erp-dev-flow-definition-selector')
        await expect(selector).toBeVisible()
        const label = await selector.locator('.ant-select-selection-item').first().innerText()
        const printTitle = page.locator(view === 'states' ? '.erp-dev-rule-heading h2' : '.erp-dev-flow-print-title')
        if (view === 'states') await expect(printTitle).toBeVisible()
        else await expect(printTitle).toBeHidden()
        const diagram = page.locator('.erp-dev-flow-main [data-business-flow]')
        if (await diagram.count()) await expect(diagram).toHaveAttribute('data-graph-status', 'rendered')
        await page.getByRole('button', { name: '导出', exact: true }).click()
        await page.getByRole('menuitem', { name: '当前视图 · 打印 / 保存 PDF', exact: true }).click()
        await expect(page.locator('[data-flow-print-current]')).toBeVisible()
        await expect(printTitle).toBeVisible()
        await expect(printTitle).toHaveText(label)
        await expect(selector).toBeHidden()
        if (await diagram.count()) await expect(diagram.locator('[data-graph-node]').first()).toBeVisible()
        await page.evaluate(() => window.dispatchEvent(new Event('afterprint')))
        await expect(selector).toBeVisible()
        if (view === 'states') await expect(printTitle).toBeVisible()
        else await expect(printTitle).toBeHidden()
      }
      await page.setViewportSize({ width: 1024, height: 768 })
      for (const query of ['view=states', 'view=facts', 'view=processes', 'view=workflow&task_id=21']) {
        await visit(query)
        await expect(page.locator('[data-catalog-status="ready"]')).toBeVisible()
        if (query !== 'view=workflow&task_id=21') await assertDefinitionSelectorWidth(page)
        await assertNoHorizontalOverflow(page, `关联信息窄窗口 ${query}`)
      }
      assert(sessions.get(page).reads.every((method) => ['get_task', 'get_task_handling_chain', 'list_task_events', 'get_task_process_context'].includes(method)), '一级切换与四个视图只读取正式任务和流程接口')
    },
  }, {
    name: 'dev-flow-rules-complete',
    path: '/__dev/status-flows?view=states&flow=process.instance',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => verifyFocusedFlowRules(page, { assert, assertNoHorizontalOverflow, outputDir, path }),
  }, {
    name: 'dev-flow-action-rules-desktop-light',
    path: '/__dev/status-flows?view=states&flow=workflow.task',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    auth: 'admin',
    mockAdminRpc: true,
    verify: async (page) => verifyFocusedFlowRules(page, { assert, assertNoHorizontalOverflow, outputDir, path, keys: ['workflow.task', 'fact.shipment', catalog.flows.find((flow) => flow.lifecycleRules.length).key] }),
  }, {
    name: 'dev-flow-details-design-preview',
    path: '/__dev/ui-design?page=workbench&workbenchMode=preview',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('table', { name: '开发工具对照' }).getByRole('button', { name: '业务链路', exact: true }).click()
      const preview = frame.locator('[data-dev-flow-preview]')
      await preview.getByText('关联筛选与动作详情 · 交互示例', { exact: true }).click()
      const example = preview.locator('[data-dev-relation-example]')
      await example.getByText('筛选', { exact: true }).click()
      await example.getByRole('combobox', { name: '样例参与岗位', exact: true }).click()
      await example.getByRole('option', { name: '仓库 · 1', exact: true }).click()
      await expect(example.locator('[data-relation-demo-detail]')).toContainText('采购入库：草稿 → 已过账')
      await example.getByRole('button', { name: '移除样例参与岗位筛选', exact: true }).click()
      await expect(example.getByRole('combobox', { name: '样例参与岗位', exact: true })).toContainText('全部')
      await expect(preview.getByRole('tab', { name: '查看规则', exact: true })).toHaveCount(0)
      await page.reload()
      await frame.getByRole('table', { name: '开发工具对照' }).getByRole('button', { name: '业务规则', exact: true }).click()
      const rules = frame.locator('[data-flow-rules]')
      await expect(rules).toBeVisible()
      const stateRules = rules.locator('[data-dev-rule-preview]')
      await stateRules.getByRole('button', { name: '全部', exact: true }).click()
      const complete = stateRules.locator('[data-rule-panel="all"] details')
      await expect(complete).not.toHaveAttribute('open')
      await complete.locator('summary').click()
      await expect(complete.locator('li')).toHaveCount(3)
      await expect(stateRules.getByRole('table', { name: '办理条件与影响样例', exact: true })).toBeVisible()
      await expect(stateRules.getByRole('table', { name: '逐对象启停规则样例', exact: true })).toBeVisible()
      await stateRules.getByRole('button', { name: '财务红冲单', exact: true }).click()
      await expect(stateRules.getByRole('img', { name: '反向记录引用原记录', exact: true })).toBeVisible()
      await expect(stateRules).toContainText('不修改原行状态')
      await stateRules.getByRole('button', { name: '采购订单', exact: true }).click()
      await rules.getByRole('tab', { name: '事实规则', exact: true }).click()
      await expect(rules.locator('[data-rule-kind="facts"]')).toBeVisible()
      await expect(rules.locator('[data-dev-rule-preview]')).toBeHidden()
      await rules.getByRole('tab', { name: '流程定义', exact: true }).click()
      await expect(rules.getByRole('img', { name: '采购审批路径样例', exact: true })).toBeVisible()
      await rules.getByRole('tab', { name: '财务口径', exact: true }).click()
      await expect(rules.locator('[data-rule-kind="finance"]')).toBeVisible()
      await page.reload()
      await frame.getByRole('table', { name: '开发工具对照' }).getByRole('button', { name: '业务链路', exact: true }).click()
      await preview.getByRole('tab', { name: '实例跟踪', exact: true }).click()
      await preview.getByRole('button', { name: '定位', exact: true }).click()
      const task = preview.locator('[data-flow-example]')
      await expect(task).toBeVisible()
      await task.getByText('协同记录 · 模拟任务', { exact: true }).click()
      await expect(task.getByText('当前责任：IQC · 待处理 · 原因：色差待确认', { exact: true })).toBeVisible()
      await task.getByText('流程轨迹 · 模拟任务', { exact: true }).click()
      await expect(task.getByText('当前环节：质量处理 · IQC', { exact: true })).toBeVisible()
      await preview.getByRole('tab', { name: '业务结构', exact: true }).click()
      await expect(preview.getByRole('button', { name: /^返回 / })).toHaveCount(0)
      await preview.getByRole('tab', { name: '实例跟踪', exact: true }).click()
      await expect(task).toBeVisible()
      await expect(task.getByText('当前环节：质量处理 · IQC', { exact: true })).toBeVisible()
      await assertNoHorizontalOverflow(page, '业务链路设计预览')
    },
  }]
}
