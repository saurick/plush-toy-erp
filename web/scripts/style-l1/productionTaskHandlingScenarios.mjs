import path from 'node:path'
import { buildWorkflowTaskBoardMock } from '../../src/mocks/workflowTaskBoardMock.mjs'
import { readWorkflowTaskBoardFiltersFromSearch } from '../../src/erp/utils/workflowTaskBoard.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { createTaskBusinessReturnScenarios } from './taskBusinessReturnScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'

export function createProductionTaskHandlingScenarios(deps) {
  const { assert, assertNoHorizontalOverflow, outputDir, path } = deps
  const base = createTaskBusinessReturnScenarios(deps).find((item) => item.name === 'task-business-return-desktop')
  const task = base.workflowTaskFixtures[0]
  let saved = false
  let attempts = 0
  const tasks = Array.from({ length: 60 }, (_, index) => ({
    ...task,
    id: index === 27 ? task.id : task.id + 27 - index,
    task_name: index === 27 ? task.task_name : `核对包材 ${index + 1}`,
    created_at: 1791648000 + (60 - index) * 60,
    source_id: index === 27 ? task.source_id : 94000 + index,
    task_code: `source-handoff-production-packaging-${index === 27 ? task.source_id : 94000 + index}`,
    payload: { ...task.payload, source_record_id: index === 27 ? task.source_id : 94000 + index },
  }))
  const filteredReturn = {
    ...base,
    name: 'production-task-return-filter-position',
    path: '/erp/task-board?mode=todo&lane=actionable&q=MO-STYLE&page=2&pageSize=20&source=production_packaging_confirmation&role=sales&sort=newest',
    workflowTaskFixtures: tasks,
    beforeNavigate: async (page) => {
      saved = false
      attempts = 0
      await base.beforeNavigate(page)
      await page.route('**/rpc/production_wip', async (route) => {
        const { id, params } = route.request().postDataJSON()
        if (params?.action !== 'CONFIRM_PACKAGING_MATERIAL') return route.fallback()
        attempts += 1
        if (attempts === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '保存失败' } } })
        saved = true
        return route.fallback()
      })
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'get_task_board') return route.fallback()
        const data = buildWorkflowTaskBoardMock({
          tasks: tasks.map((item) => saved && item.id === task.id ? { ...item, task_status_key: 'done' } : item),
          params,
          snapshotAt: 1791658000,
        })
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: (page) => verifyReturnedPosition(page, 7),
  }
  const verifyReturnedPosition = async (page, expectedRowIndex, tail = false) => {
      const row = page.locator(`[data-task-id="${task.id}"]`)
      await row.waitFor()
      assert.equal(await row.evaluate((node) => [...node.parentElement.querySelectorAll(':scope > [data-task-id]')].indexOf(node)), expectedRowIndex)
      await row.scrollIntoViewIfNeeded()
      const originURL = new URL(page.url())
      const originFilters = readWorkflowTaskBoardFiltersFromSearch(originURL.searchParams)
      const neighbor = row.locator('xpath=preceding-sibling::*[@data-task-id][1]')
      const neighborID = tail ? null : await neighbor.getAttribute('data-task-id')
      const visibleOffset = (taskRow) => taskRow.evaluate((node) =>
        node.getBoundingClientRect().top - node.closest('.erp-admin-content').getBoundingClientRect().top
      )
      const originalOffset = tail ? null : await visibleOffset(neighbor)
      await row.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
      await steps.getByRole('tab', { name: /任务办理/u }).click()
      const field = page.getByLabel('包装版本', { exact: true })
      const confirm = page.getByRole('button', { name: '确认办理', exact: true })
      const receiptTab = steps.getByRole('tab', { name: /结果回执/u })
      await field.waitFor()
      assert.equal(await page.getByLabel('生产管理页面', { exact: true }).count(), 0)
      await field.fill('彩盒与唛头已核对')
      await confirm.click()
      await page.waitForFunction(() => !document.querySelector('.ant-btn-loading'))
      assert.equal(attempts, 1)
      assert.equal(await field.inputValue(), '彩盒与唛头已核对')
      assert.equal(await receiptTab.isEnabled(), false)
      await page.getByRole('button', { name: '返回原任务', exact: true }).click()
      await page.getByRole('button', { name: '继续填写', exact: true }).click()
      assert.equal(await field.inputValue(), '彩盒与唛头已核对')
      await confirm.click()
      await receiptTab.click()
      const receipt = page.getByTestId('workflow-task-action-receipt')
      await receipt.getByText('已完成', { exact: true }).waitFor()
      await receipt.getByText(task.task_name, { exact: true }).waitFor()
      assert.equal(saved, true)
      assert.equal(attempts, 2)
      await steps.getByRole('tab', { name: /任务信息/u }).click()
      await page.getByRole('heading', { name: task.task_name, exact: true }).waitFor()
      await page.getByRole('dialog').getByRole('button', { name: '返回列表', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      await row.waitFor({ state: 'detached' })
      const expectedFilters = { ...originFilters, page: tail ? 1 : originFilters.page }
      await page.waitForURL((url) => url.pathname === originURL.pathname &&
        readWorkflowTaskBoardFiltersFromSearch(url.searchParams).page === expectedFilters.page)
      assert.deepEqual(readWorkflowTaskBoardFiltersFromSearch(new URL(page.url()).searchParams), expectedFilters)
      if (!tail) {
        const remainingRow = page.locator(`[data-task-id="${neighborID}"]`)
        const returnedOffset = await visibleOffset(remainingRow)
        assert.ok(Math.abs(returnedOffset - originalOffset) <= 3, `返回前后相邻任务位置应一致: ${originalOffset} -> ${returnedOffset}`)
      }
      await assertNoHorizontalOverflow(page, 'production-return-filter-position')
      await page.screenshot({ path: path.join(outputDir, tail ? 'production-task-return-tail-4k.png' : 'production-task-return-position-4k.png') })
  }
  const tailTasks = [...tasks.slice(0, 20), tasks[27]]
  const tailReturn = {
    ...filteredReturn,
    name: 'production-task-return-tail-page',
    workflowTaskFixtures: tailTasks,
    beforeNavigate: async (page) => {
      await filteredReturn.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'get_task_board') return route.fallback()
        const data = buildWorkflowTaskBoardMock({
          tasks: tailTasks.map((item) => saved && item.id === task.id ? { ...item, task_status_key: 'done' } : item),
          params,
snapshotAt: 1791658000,
        })
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: (page) => verifyReturnedPosition(page, 0, true),
  }
  return [filteredReturn, tailReturn, ...createQualityTaskFocusScenario(deps, base), ...createQualityTaskFocusScenario(deps, base, true), ...createProductionPostingTaskScenario(deps, base), createProductionExceptionTaskScenario(deps, base)]
}

function createQualityTaskFocusScenario(deps, base, shipment = false) {
  const permissions = ['workflow.task.read', 'quality.inspection.read', 'quality.inspection.update', 'production.wip.read']
  const entry = '/erp/production/quality-inspections?quality_inspection_id=701'
  const task = { ...base.workflowTaskFixtures[0],
task_name: shipment ? '办理出货前检验' : '检验当前裁片批次',
task_group: shipment ? 'handoff_shipment_quality' : 'handoff_production_quality',
    task_code: shipment ? 'source-handoff-shipment-quality-701' : 'source-handoff-production-quality-701',
    ...(shipment ? { source_no: 'QC-SHIP-701', discovery: { stage_key: 'shipment_quality' } } : {}),
source_type: 'quality_inspection',
source_id: 701,
    owner_role_key: 'quality',
owner_pool_key: 'quality',
required_capability_key: 'quality.inspection.update',
    payload: { ...base.workflowTaskFixtures[0].payload, source_record_id: 701, entry_path: entry } }
  let inspection
  let submits = 0
  return [{
    ...base,
    name: shipment ? 'shipment-quality-task-progress-entry' : 'production-task-quality-direct-focus',
    path: shipment ? `/erp/task-board?task_id=${task.id}` : base.path,
    workflowTaskFixtures: [task],
    adminProfile: { ...base.adminProfile,
roles: [{ role_key: 'quality', name: '品质' }],
permissions,
      menus: [{ key: 'task-board', path: '/erp/task-board', required_any: ['workflow.task.read'] },
        { key: 'quality-inspections', path: '/erp/production/quality-inspections', required_any: ['quality.inspection.read'] }] },
    effectiveSession: { ...base.effectiveSession,
pages: ['task-board', 'quality-inspections'],
actions: permissions,
      workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['quality'] } },
    beforeNavigate: async (page) => {
      submits = 0
      inspection = { id: 701,
inspection_no: 'QI-FOCUS-CUTTING',
status: 'DRAFT',
result: '',
        inspection_type: 'PRODUCTION_STAGE',
source_type: 'PRODUCTION_WIP',
source_id: 91021,
        production_order_id: 71,
production_order_item_id: 7101,
production_wip_batch_id: 91021,
        quality_gate: 'CUT_PIECE',
product_id: 1,
subject_type: 'PRODUCT',
subject_id: 1,
unit_id: 1,
quantity: '20',
        wip_batch_no: 'WIP-FOCUS-CUTTING',
unit_name: '只' }
      if (shipment) { inspection = { id: 701,
inspection_no: 'QC-SHIP-701',
status: 'DRAFT',
result: '',
        inspection_type: 'FINISHED_GOODS',
source_type: 'SHIPMENT',
source_no: 'SHIP-701',
source_id: 93010,
subject_type: 'PRODUCT',
subject_id: 1,
        inventory_lot_id: 5001,
warehouse_id: 1,
unit_id: 1,
unit_name: '只' } }
      await base.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method } = route.request().postDataJSON()
        if (method === 'explain_action_access') {
          return route.fulfill({ json: { jsonrpc: '2.0',
id,
result: styleRpcResult({ task_id: task.id,
            source_access: { applicable: true, resolved: true, allowed: true, reason_code: 'source_access_allowed', reason: '' },
            actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true, owner_role_key: 'quality', required_permission: 'quality.inspection.update', reason_code: 'source_generated_only', reason: '在检验单判定后更新待办' }],
          }) } })
        }
        if (method === 'get_task') return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ task }) } })
        return route.fallback()
      })
      await page.route('**/rpc/quality', async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        let data
        if (method === 'submit_quality_inspection') {
          submits += 1
          inspection = { ...inspection, status: 'SUBMITTED' }
          data = { quality_inspection: inspection }
        } else if (method === 'get_quality_inspection') data = { quality_inspection: inspection }
        else if (['list_quality_inspections', 'list_production_stage_quality_inspections'].includes(method)) data = stylePaginatedRpcData([inspection], 'quality_inspections', params)
        else return route.fallback()
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
      })
    },
    verify: async (page) => {
      if (shipment) await page.getByRole('heading', { name: task.task_name, exact: true }).waitFor()
      else await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      await page.getByRole('tablist', { name: '任务处理步骤' }).getByRole('tab', { name: /任务办理/ }).click()
      const focus = page.getByRole('region', { name: '办理本次质检', exact: true })
      await focus.getByText(inspection.inspection_no, { exact: true }).waitFor()
      if (shipment) await focus.getByText('SHIP-701', { exact: true }).waitFor()
      deps.assert.equal(submits, 0, '任务进入只打开表单，不自动提交质检')
      await page.getByRole('button', { name: '提交质检', exact: true }).click()
      await focus.getByText('待质量判定', { exact: true }).waitFor()
      await page.getByRole('button', { name: '判定不合格', exact: true }).waitFor()
      deps.assert.equal(submits, 1)
      deps.assert.equal(await page.getByRole('button', { name: '判定合格', exact: true }).isEnabled(), true)
      await page.getByRole('button', { name: '判定不合格', exact: true }).click()
      await page.getByRole('button', { name: '确认不合格', exact: true }).waitFor()
      await deps.assertNoHorizontalOverflow(page, 'production-quality-task-focus')
    },
  }]
}

function createProductionPostingTaskScenario(deps, base) {
  const permissions = ['workflow.task.read', 'production.fact.read', 'warehouse.inbound.confirm', 'mobile.warehouse.access']
  const task = { ...base.workflowTaskFixtures[0],
task_name: '确认本次成品入库',
task_group: 'handoff_production_inbound',
    task_code: 'source-handoff-production-inbound-1',
source_type: 'production_fact',
source_id: 1,
    owner_role_key: 'warehouse',
owner_pool_key: 'warehouse',
required_capability_key: 'warehouse.inbound.confirm',
    payload: { ...base.workflowTaskFixtures[0].payload, source_record_id: 1, entry_path: '/erp/production/progress?fact_id=1' } }
  return [false, true].map((mobile) => {
    let posts = 0
    let attempts = 0
    let sourceGate
    return {
    ...base,
    name: mobile ? 'production-task-posting-mobile-inline' : 'production-task-posting-direct-focus',
    path: mobile ? '/m/warehouse/tasks' : '/erp/task-board',
    viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 560 },
    workflowTaskFixtures: [task],
    adminProfile: { ...base.adminProfile,
roles: [{ role_key: 'warehouse', name: '仓库' }],
permissions,
      menus: [{ key: 'task-board', path: '/erp/task-board', required_any: ['workflow.task.read'] },
        { key: 'production-progress', path: '/erp/production/progress', required_any: ['production.fact.read'] }] },
    effectiveSession: { ...base.effectiveSession,
pages: ['task-board', 'production-progress'],
actions: permissions,
      workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['warehouse'] } },
    beforeNavigate: async (page) => {
      posts = 0
      attempts = 0
      sourceGate = Promise.withResolvers()
      await page.route('**/rpc/operational_fact', async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        if (!mobile && method === 'list_production_facts') await sourceGate.promise
        if (method === 'post_production_fact') {
          attempts += 1
          deps.assert.equal(params.id, 1)
          deps.assert.equal(params.expected_version, 1)
          if (attempts === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '确认失败，请重试' } } })
          posts += 1
        }
        return route.fallback()
      })
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        const current = posts ? { ...task, task_status_key: 'done', version: task.version + 1 } : task
        const data = method === 'explain_action_access'
          ? { task_id: task.id, source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true, owner_role_key: 'warehouse', required_permission: 'warehouse.inbound.confirm', reason_code: 'source_business_required', reason: '请通过成品入库办理。' }] }
          : method === 'get_task' ? { task: current } : method === 'get_task_board'
          ? buildWorkflowTaskBoardMock({ tasks: [current], params, snapshotAt: 1791658000 }) : null
        if (!data) return route.fallback()
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
      })
    },
    verify: async (page) => {
      const originURL = page.url()
      if (mobile) await page.getByTestId('mobile-role-nav-tasks').click()
      const taskRow = page.locator(`[${mobile ? 'data-mobile-task-id' : 'data-task-id'}="${task.id}"]`)
      await taskRow.waitFor()
      const originTop = await taskRow.evaluate((node) => node.getBoundingClientRect().top)
      if (mobile) await clickTaskCardContent(taskRow, taskRow.getByText(task.task_name, { exact: true }))
      else await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      const tabs = page.getByRole('tablist', { name: '任务处理步骤', exact: true }).getByRole('tab')
      const information = page.getByTestId('workflow-task-business-information')
      const reader = page.locator('.erp-task-action-drawer-root.ant-drawer-open .ant-drawer-body')
      let initialScroll
      if (!mobile) {
        try {
          await tabs.nth(0).waitFor()
          await waitForFiniteAnimations(page)
          initialScroll = await reader.evaluate(async (element) => {
            element.scrollTop = Math.min(150, element.scrollHeight - element.clientHeight)
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            return element.scrollTop
          })
          deps.assert.ok(initialScroll > 0, '资料未返回时已在阅读任务下半部分')
        } finally { sourceGate.resolve() }
      }
      await information.getByText('PROD-FACT-L1', { exact: true }).waitFor()
      if (!mobile) {
        await page.locator('[data-business-form-page][aria-label="核对本次生产记录"]').waitFor({ state: 'attached' })
        const afterLoad = await reader.evaluate(async (element) => {
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
          return element.scrollTop
        })
        deps.assert.ok(afterLoad >= initialScroll - 1, '后台加载办理表单应保留信息页的阅读位置')
      }
      deps.assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
      deps.assert.equal(await page.getByRole('dialog').filter({ visible: true }).count(), mobile ? 0 : 1, '任务信息预加载不能打开第二层抽屉')
      const review = page.locator('[data-business-form-page][aria-label="核对本次生产记录"]')
      deps.assert.equal(await review.isVisible(), false)
      await tabs.nth(1).click()
      await review.getByText('PROD-FACT-L1', { exact: true }).waitFor()
      await review.getByRole('img', { name: /无图片读取权限/u }).waitFor()
      const instance = await review.elementHandle()
      await tabs.nth(0).click()
      deps.assert.equal(await review.isVisible(), false)
      await tabs.nth(1).click()
      deps.assert.equal(await review.evaluate((node, previous) => node === previous, instance), true, '步骤往返保留核对组件实例')
      deps.assert.equal(await page.getByRole('dialog').filter({ visible: true }).count(), mobile ? 0 : 1, '任务办理复用外层工作区')
      deps.assert.equal(page.url(), originURL, '办理保留原任务路由')
      deps.assert.equal(posts, 0, '进入核对表单不能自动过账')
      const submit = page.getByRole('button', { name: '确认成品入库', exact: true }).filter({ visible: true })
      deps.assert.equal(await submit.count(), 1, '同一任务只有一组主操作')
      await submit.click()
      await page.locator('.ant-message-error').waitFor()
      await page.waitForFunction(() => !document.querySelector('.ant-btn-loading'))
      deps.assert.equal(attempts, 1)
      deps.assert.equal(posts, 0)
      deps.assert.equal(await review.isVisible(), true, '确认失败保留核对资料')
      await deps.assertNoHorizontalOverflow(page, `production-task-posting-${mobile ? 'mobile' : 'desktop'}`)
      await page.screenshot({ path: path.join(deps.outputDir, `production-task-posting-${mobile ? 'mobile' : 'desktop'}-inline.png`) })
      await submit.click()
      await review.waitFor({ state: 'hidden' })
      deps.assert.equal(posts, 1)
      deps.assert.equal(attempts, 2)
      await page.waitForURL(originURL)
      await page.getByRole('button', { name: '查看办理结果', exact: true }).filter({ visible: true }).click()
      await tabs.nth(2).waitFor()
      deps.assert.equal(await tabs.nth(2).getAttribute('aria-selected'), 'true')
      const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
      await receipt.getByText('已完成', { exact: true }).waitFor()
      await receipt.locator('dl > div').filter({ has: page.getByText('业务状态', { exact: true }) }).getByText('已过账', { exact: true }).waitFor()
      await page.getByRole('button', { name: mobile ? '返回任务列表' : '返回列表', exact: true }).filter({ visible: true }).last().click()
      await taskRow.waitFor({ state: 'visible' })
      deps.assert.ok(Math.abs(await taskRow.evaluate((node) => node.getBoundingClientRect().top) - originTop) <= 3)
    },
  } })
}

function createProductionExceptionTaskScenario(deps, base) {
  const permissions = ['workflow.task.read', 'production.fact.read', 'production.exception.execute']
  const record = { id: 8801, version: 1, decision_no: 'SIM-EXCEPTION-8801', decision_type: 'SCRAP', status: 'APPROVED', execution_status: 'PENDING', requested_quantity: '20', approved_quantity: '20', production_order_id: 71, reason: '核对批准的报废方案。', decision_reason: '品质意见已确认' }
  const task = { id: 98910, version: 1, task_name: '执行本次报废处置', task_group: 'business_source_check', task_status_key: 'ready', owner_role_key: 'production', owner_pool_key: 'production', required_capability_key: 'production.exception.execute', process_instance_id: 98710, process_node_instance_id: 98711, discovery: { stage_key: 'production_exception' }, source_type: 'production_exception_decision', source_id: record.id, source_no: record.decision_no, created_at: 1791648000 }
  return {
    ...base,
    name: 'production-exception-task-inline',
    workflowTaskFixtures: [task],
    adminProfile: { ...base.adminProfile,
erp_preferences: { hidden_columns: { 'production-exceptions-decisions': ['requested_quantity'] } },
roles: [{ role_key: 'production', name: '生产' }],
permissions,
menus: [
      { key: 'task-board', path: '/erp/task-board', required_any: ['workflow.task.read'] },
      { key: 'production-exceptions', path: '/erp/production/exceptions', required_any: ['production.fact.read'] },
    ] },
    effectiveSession: { ...base.effectiveSession, pages: ['task-board', 'production-exceptions'], actions: permissions, workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['production'] } },
    beforeNavigate: async (page) => {
      await page.route('**/rpc/operational_fact', async (route) => {
        const { id, method } = route.request().postDataJSON()
        if (method !== 'get_production_exception') return route.fallback()
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult({ production_exception: record }) } })
      })
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        const data = method === 'get_task' ? { task } : method === 'get_task_board'
          ? buildWorkflowTaskBoardMock({ tasks: [task], params, snapshotAt: 1791658000 })
          : method === 'explain_action_access'
            ? { task_id: task.id, source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true, owner_role_key: 'production', required_permission: 'production.exception.execute', reason_code: 'source_business_required', reason: '请通过异常处置办理。' }] } : null
        if (!data) return route.fallback()
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
      })
    },
    verify: async (page) => {
      await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      const tabs = page.getByRole('tablist', { name: '任务处理步骤', exact: true }).getByRole('tab')
      const information = page.getByTestId('workflow-task-business-information')
      await information.getByText(record.decision_no, { exact: true }).waitFor()
      await information.locator('[data-field-key="requested_quantity"]').getByText('20', { exact: true }).waitFor()
      await information.getByText(record.decision_reason, { exact: true }).waitFor()
      await information.locator('[data-field-key="approved_quantity"]').getByText('20', { exact: true }).waitFor()
      deps.assert.equal(await page.getByRole('dialog').filter({ visible: true }).count(), 1, '异常详情不得随任务来源预加载自动弹出')
      await tabs.nth(1).click()
      await page.getByRole('button', { name: '确认执行', exact: true }).click()
      const form = page.locator('[data-business-form-page][aria-label="确认生产异常处置"]')
      await form.getByLabel('执行原因', { exact: true }).fill('按本次批准方案执行')
      deps.assert.equal(await page.getByRole('dialog').filter({ visible: true }).count(), 1)
      await tabs.nth(0).click()
      await tabs.nth(1).click()
      deps.assert.equal(await form.getByLabel('执行原因', { exact: true }).inputValue(), '按本次批准方案执行')
      await form.getByText(`审批意见：${record.decision_reason}`, { exact: true }).waitFor()
      const closeTask = page.getByRole('button', { name: '返回列表', exact: true }).first()
      await closeTask.click()
      const discard = page.getByRole('dialog', { name: '放弃未保存的修改？' })
      await discard.getByRole('button', { name: '继续编辑', exact: true }).click()
      deps.assert.equal(await form.getByLabel('执行原因', { exact: true }).inputValue(), '按本次批准方案执行')
      await closeTask.click()
      await discard.getByRole('button', { name: '放弃修改', exact: true }).click()
      await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      await tabs.nth(1).click()
      await page.getByRole('button', { name: '确认执行', exact: true }).click()
      deps.assert.equal(await form.getByLabel('执行原因', { exact: true }).inputValue(), '')
      await deps.assertNoHorizontalOverflow(page, 'production-exception-task-inline')
    },
  }
}
