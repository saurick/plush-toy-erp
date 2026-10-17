import { buildWorkflowTaskBoardMock } from '../../src/mocks/workflowTaskBoardMock.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { createTaskBusinessReturnScenarios } from './taskBusinessReturnScenarios.mjs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

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
      const originURL = page.url()
      const origin = await row.evaluate((node) => ({
        top: node.getBoundingClientRect().top - node.closest('.erp-admin-content').getBoundingClientRect().top,
      }))
      await row.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      await page.getByRole('button', { name: /进入单据办理$/u }).click()
      const modal = page.getByRole('dialog').filter({ hasText: '包装版本' }).last()
      await modal.getByLabel('包装版本', { exact: true }).waitFor()
      assert.equal(await page.getByLabel('生产管理页面', { exact: true }).count(), 0)
      await modal.getByLabel('包装版本', { exact: true }).fill('彩盒与唛头已核对')
      await modal.getByRole('button', { name: '确认办理', exact: true }).click()
      await page.waitForFunction(() => !document.querySelector('.ant-btn-loading'))
      assert.equal(attempts, 1)
      assert.equal(await modal.getByLabel('包装版本', { exact: true }).inputValue(), '彩盒与唛头已核对')
      assert.equal(await modal.getByRole('button', { name: '办完返回原任务' }).count(), 0)
      await modal.locator('.ant-modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      await page.getByRole('button', { name: '继续填写', exact: true }).click()
      assert.equal(await modal.getByLabel('包装版本', { exact: true }).inputValue(), '彩盒与唛头已核对')
      await modal.getByRole('button', { name: '确认办理', exact: true }).click()
      await modal.getByRole('button', { name: '办完返回原任务' }).waitFor()
      assert.equal(saved, true)
      assert.equal(attempts, 2)
      await modal.getByRole('button', { name: '办完返回原任务' }).click()
      await page.waitForURL(originURL)
      const detail = page.locator('.ant-drawer:visible').last()
      await detail.getByText('已完成', { exact: true }).first().waitFor()
      await detail.getByRole('button', { name: '返回列表', exact: true }).click()
      await row.getByText('刚办理，保留原位置', { exact: true }).waitFor()
      assert.equal(await row.evaluate((node) => [...node.parentElement.querySelectorAll(':scope > [data-task-id]')].indexOf(node)), expectedRowIndex)
      await row.getByText('已完成', { exact: true }).waitFor()
      const returnedTop = await row.evaluate((node) => node.getBoundingClientRect().top - node.closest('.erp-admin-content').getBoundingClientRect().top)
      assert.ok(Math.abs(returnedTop - origin.top) <= 3, `返回前后行位置应一致: ${origin.top} -> ${returnedTop}`)
      if (tail) await page.getByText('原第 2 页位置，当前筛选共 20 项', { exact: true }).waitFor()
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
  return [filteredReturn, tailReturn, ...createQualityTaskFocusScenario(deps, base), ...createProductionPostingTaskScenario(deps, base)]
}

function createQualityTaskFocusScenario(deps, base) {
  const permissions = ['workflow.task.read', 'quality.inspection.read', 'quality.inspection.update', 'production.wip.read']
  const entry = '/erp/production/quality-inspections?quality_inspection_id=701'
  const task = { ...base.workflowTaskFixtures[0],
task_name: '检验当前裁片批次',
task_group: 'handoff_production_quality',
    task_code: 'source-handoff-production-quality-701',
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
    name: 'production-task-quality-direct-focus',
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
      await base.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method } = route.request().postDataJSON()
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
      await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      await page.getByRole('button', { name: /进入单据办理$/u }).click()
      const focus = page.getByRole('dialog', { name: '办理本次质检', exact: true })
      await focus.getByText(inspection.inspection_no, { exact: true }).waitFor()
      deps.assert.equal(submits, 0, '任务进入只打开表单，不自动提交质检')
      await focus.getByRole('button', { name: '提交质检', exact: true }).click()
      await page.locator('.ant-modal:visible').getByText('待质量判定', { exact: true }).waitFor()
      try {
        await focus.getByRole('button', { name: '判定不合格', exact: true }).waitFor()
      } catch (error) {
        await writeFile(path.join(deps.outputDir, 'production-quality-focus-dom.json'), JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.ant-modal')].map(node => ({
          html: node.outerHTML,
          ancestors: [...(function* () { let current = node.parentElement; while (current) { yield current; current = current.parentElement } })()].map(parent => ({ tag: parent.tagName, className: parent.className, hidden: parent.getAttribute('aria-hidden'), inert: parent.inert })),
        }))), null, 2))
        throw error
      }
      deps.assert.equal(submits, 1)
      deps.assert.equal(await focus.getByRole('button', { name: '判定合格', exact: true }).isEnabled(), true)
      await focus.getByRole('button', { name: '判定不合格', exact: true }).click()
      await page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '确认不合格', exact: true }) }).waitFor()
      await deps.assertNoHorizontalOverflow(page, 'production-quality-task-focus')
    },
  }]
}

function createProductionPostingTaskScenario(deps, base) {
  const permissions = ['workflow.task.read', 'production.fact.read', 'warehouse.inbound.confirm']
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
  let posts = 0
  return [{
    ...base,
    name: 'production-task-posting-direct-focus',
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
      await base.beforeNavigate(page)
      await page.route('**/rpc/operational_fact', async (route) => {
        const { method, params } = route.request().postDataJSON()
        if (method === 'post_production_fact') {
          posts += 1
          deps.assert.equal(params.id, 1)
          deps.assert.equal(params.expected_version, 1)
        }
        return route.fallback()
      })
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        const current = posts ? { ...task, task_status_key: 'done', version: task.version + 1 } : task
        const data = method === 'get_task' ? { task: current } : method === 'get_task_board'
          ? buildWorkflowTaskBoardMock({ tasks: [current], params, snapshotAt: 1791658000 }) : null
        if (!data) return route.fallback()
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
      })
    },
    verify: async (page) => {
      const originURL = page.url()
      const taskRow = page.locator(`[data-task-id="${task.id}"]`)
      await taskRow.waitFor()
      const originTop = await taskRow.evaluate(node => node.getBoundingClientRect().top)
      await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
      await page.getByRole('button', { name: /进入单据办理$/u }).click()
      const review = page.getByRole('dialog').filter({ hasText: '核对本次生产记录' })
      await review.getByText('PROD-FACT-L1', { exact: true }).waitFor()
      deps.assert.equal(posts, 0, '进入核对表单不能自动过账')
      await review.getByRole('button', { name: '确认成品入库', exact: true }).click()
      await review.waitFor({ state: 'hidden' })
      deps.assert.equal(posts, 1)
      await page.getByTestId('task-source-return').getByText('确认成品入库已完成', { exact: true }).waitFor()
      await page.getByTestId('task-source-return').getByRole('button', { name: '办完返回原任务', exact: true }).click()
      await page.waitForURL(originURL)
      const detail = page.locator('.ant-drawer:visible').last()
      await detail.getByText('已完成', { exact: true }).first().waitFor()
      await detail.getByRole('button', { name: '返回列表', exact: true }).click()
      await taskRow.getByText('刚办理，保留原位置', { exact: true }).waitFor()
      deps.assert.ok(Math.abs(await taskRow.evaluate(node => node.getBoundingClientRect().top) - originTop) <= 3)
    },
  }]
}
