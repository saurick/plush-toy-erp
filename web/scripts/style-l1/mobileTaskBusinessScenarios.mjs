import { createTaskBusinessReturnScenarios } from './taskBusinessReturnScenarios.mjs'
import { createProductionTaskHandlingScenarios } from './productionTaskHandlingScenarios.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { createTaskDetailVariantScenarios } from './taskDetailVariantScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { requireTrackingDetail } from '../../src/erp/utils/workflowTracking.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { writeFile } from 'node:fs/promises'

export function createMobileTaskBusinessScenarios(deps) {
  const { assert, assertNoHorizontalOverflow, outputDir, path } = deps
  const base = createTaskBusinessReturnScenarios(deps).find((item) => item.name === 'task-business-return-mobile')
  const task = base.workflowTaskFixtures[0]
  const open = async (page, taskName = task.task_name, beforeEnter = () => {}) => {
    const card = page.locator('.erp-task-card').filter({ hasText: taskName })
    await clickTaskCardContent(card, card.getByText(taskName, { exact: true }))
    await beforeEnter()
    await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '填写办理表单', exact: true }).click()
    await page.getByTestId('mobile-task-fact-form').waitFor()
    assert.match(new URL(page.url()).pathname, /^\/m\/[a-z_]+\/tasks$/u)
    assert.equal(await page.locator('.erp-admin-layout').count(), 0)
    assert.equal(await page.getByTestId('mobile-task-flow-steps').locator('[data-step-key]').count(), 3)
  }
  return [
    ...[320, 390].map((width) => {
      const scenario = createTaskDetailVariantScenarios(deps).find((item) => item.name === 'task-detail-rework-mobile-light')
      const current = { ...scenario.workflowTaskFixtures[0], task_status_key: 'done', completed_at: 1790085800 }
      const summary = { kind: 'task', id: current.id, process_key: '', title: current.task_name, source_type: current.source_type, source_id: current.source_id, source_no: current.source_no, display_context: { ...current.display_context, source_line_count: null }, status: 'done', resolution_kind: null, started_at: current.created_at, updated_at: current.completed_at, completed_at: current.completed_at, initiator_name: '生产核对员', initiator_role_key: 'production', current_tasks: [] }
      const detail = { summary, tasks: [{ task_id: current.id, task_name: current.task_name, node_instance_id: null, owner_role_key: 'production', assignee_name: '', status: 'done', created_at: current.created_at, completed_at: current.completed_at, due_at: null }], nodes: [], events: [{ id: 701, task_id: current.id, event_type: 'status_changed', actor_display_name: '生产核对员', actor_role_key: 'production', created_at: current.completed_at, from_status_key: 'ready', to_status_key: 'done', reason: '返工处理结论已记录' }], current_task_access: [], events_truncated: false, next_event_id: 0 }
      requireTrackingDetail(detail, { kind: 'task', id: current.id })
      return {
        ...scenario,
        name: `mobile-task-related-source-${width}`,
        workflowTaskFixtures: [current],
        viewport: { width, height: 568 },
        deviceScaleFactor: 2,
        themeMode: width === 320 ? 'dark' : 'light',
        beforeNavigate: async (page) => {
          await scenario.beforeNavigate(page)
          const fact = { id: current.source_id, fact_no: current.source_no, fact_type: 'REWORK', status: 'CANCELLED', version: 2, subject_type: 'PRODUCT', subject_id: 1, product_sku_id: 1, warehouse_id: 1, unit_id: 1, quantity: '1', occurred_at: current.created_at }
          await page.route('**/rpc/operational_fact', async (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            if (!['get_production_fact', 'list_production_facts'].includes(method)) return route.fallback()
            const data = method === 'get_production_fact' ? { production_fact: fact } : stylePaginatedRpcData([fact], 'production_facts', params)
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
          })
          page.relatedTasksFail = false
          page.relatedTrackingEmpty = false
          page.relatedReads = []
          await page.route('**/rpc/workflow', async (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            const respond = (data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
            if (method === 'get_task' && params.task_id === current.id) return respond({ task: current })
            if (method === 'list_tasks' && params.source_id) {
              page.relatedReads.push({ method, params })
              assert.equal(params.source_type, current.source_type, '使用任务来源身份，不能用表单类型替代')
              assert.equal(params.source_id, current.source_id)
              if (page.relatedTasksFail) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '读取失败' } } })
              return respond({ tasks: [current], total: 1 })
            }
            if (method === 'list_tracking') {
              page.relatedReads.push({ method, params })
              assert.equal(params.source_type, current.source_type)
              assert.equal(params.source_id, current.source_id)
              const total = page.relatedTrackingEmpty ? 0 : 1
              return respond({ items: total ? [summary] : [], total, limit: params.limit, offset: params.offset, status_counts: { active: 0, completed: total } })
            }
            if (method === 'get_tracking') {
              assert.deepEqual(params, { kind: 'task', id: current.id })
              return respond({ tracking: detail })
            }
            return route.fallback()
          })
        },
        verify: async (page) => {
          await page.getByTestId('mobile-role-bottom-nav').getByRole('tab', { name: /^任务管理/u }).click()
          await page.getByRole('tab', { name: /^已办(?:\s|$)/u }).click()
          await open(page, current.task_name)
          const entry = page.locator('[data-business-action-key="related-tasks"]:visible')
          await entry.click()
          const panel = page.getByRole('dialog', { name: '相关任务', exact: true })
          await panel.getByRole('button', { name: current.task_name, exact: true }).waitFor()
          const checkPanel = async (target) => {
            await waitForFiniteAnimations(page)
            const metrics = await target.evaluate((node) => {
              const box = node.getBoundingClientRect()
              const title = node.querySelector('.ant-drawer-title').getBoundingClientRect()
              const body = node.querySelector('.ant-drawer-body')
              const footer = node.querySelector('.ant-drawer-footer').getBoundingClientRect()
              return { width: box.width, height: box.height, viewportWidth: innerWidth, viewportHeight: innerHeight, titleOffset: Math.abs(title.left + title.width / 2 - box.left - box.width / 2), overflow: body.scrollWidth - body.clientWidth, footerBottom: footer.bottom }
            })
            assert.ok(metrics.width === metrics.viewportWidth && metrics.height === metrics.viewportHeight && metrics.titleOffset <= 1 && metrics.overflow <= 1 && Math.abs(metrics.footerBottom - metrics.viewportHeight) <= 1, JSON.stringify(metrics))
          }
          await checkPanel(panel)
          assert.equal(await panel.getByRole('button', { name: '打开任务管理' }).count(), 0)
          await page.screenshot({ path: path.join(outputDir, `mobile-related-tasks-${width}.png`) })
          await panel.getByRole('button', { name: '流程跟踪', exact: true }).click()
          const progress = page.getByRole('dialog', { name: '流程跟踪', exact: true })
          await progress.getByText('返工处理结论已记录', { exact: true }).waitFor()
          await checkPanel(progress)
          assert.equal(await page.getByRole('dialog').count(), 1, '只显示一个活动面板')
          await page.screenshot({ path: path.join(outputDir, `mobile-related-tracking-${width}.png`) })
          await progress.locator('.ant-drawer-header').getByRole('button', { name: '返回相关任务' }).click()
          await panel.getByRole('button', { name: current.task_name, exact: true }).waitFor()
          page.relatedTrackingEmpty = true
          await panel.getByRole('button', { name: '流程跟踪', exact: true }).click()
          await progress.getByText('当前单据暂无可见流程', { exact: true }).waitFor()
          await progress.getByText(current.source_no, { exact: true }).waitFor()
          await checkPanel(progress)
          assert.equal(await progress.getByRole('link', { name: '打开任务管理' }).count(), 0)
          const inset = await progress.locator('.erp-workflow-source-tracking').evaluate((node) => node.getBoundingClientRect().left)
          assert.ok(inset >= 10, '空态保持内容边距')
          await page.screenshot({ path: path.join(outputDir, `mobile-related-empty-${width}.png`) })
          await progress.locator('.ant-drawer-header').getByRole('button', { name: '返回相关任务' }).click()
          await panel.locator('.ant-drawer-header').getByRole('button', { name: '返回任务办理' }).click()
          page.relatedTasksFail = true
          await entry.click()
          await panel.getByRole('button', { name: '重新读取', exact: true }).waitFor()
          assert.equal(await panel.getByText('当前单据暂无可见任务', { exact: true }).count(), 0, '读取失败不冒充空数据')
          page.relatedTasksFail = false
          await panel.getByRole('button', { name: '重新读取', exact: true }).click()
          await panel.getByRole('button', { name: current.task_name, exact: true }).waitFor()
          assert.ok(page.relatedReads.some(({ method }) => method === 'list_tasks') && page.relatedReads.some(({ method }) => method === 'list_tracking'))
          await assertNoHorizontalOverflow(page, `mobile-task-related-source-${width}`)
        },
      }
    }),
    {
      ...base,
      name: 'mobile-task-business-production-packaging',
      verify: async (page) => {
        await open(page)
        const dialog = page.getByRole('dialog').filter({ hasText: task.source_no })
        await dialog.waitFor()
        assert.equal(await dialog.count(), 1)
        await dialog.getByLabel('包装版本', { exact: true }).fill('彩盒与唛头已核对')
        await dialog.getByRole('button', { name: '确认办理', exact: true }).click()
        await dialog.getByText('包材要求已确认', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: '办完返回原任务', exact: true }).click()
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.getByText('已完成', { exact: true }).first().waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/sales/tasks')
        await assertNoHorizontalOverflow(page, 'mobile-task-production-business-return')
        await page.screenshot({ path: path.join(outputDir, 'mobile-task-production-business-return.png') })
      },
    },
    {
      ...base,
      name: 'mobile-task-business-source-mismatch',
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        page.substituteTaskSource = false
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_task' || !page.substituteTaskSource) return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { task: { ...task, source_id: task.source_id + 1 } } } } })
        })
      },
      verify: async (page) => {
        await open(page, task.task_name, () => { page.substituteTaskSource = true })
        await page.getByText('暂时无法确认任务办理资料或权限，请重新读取。', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-production-orders-page').count(), 0)
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.equal(new URL(page.url()).pathname, '/m/sales/tasks')
        await assertNoHorizontalOverflow(page, 'mobile-task-source-mismatch')
        page.substituteTaskSource = false
        await page.getByTestId('mobile-task-fact-form').getByRole('button', { name: '重新读取', exact: true }).click()
        await page.locator('[data-testid="mobile-task-business-source"][data-record-id="71"]').waitFor()
        assert.equal(await page.getByTestId('mobile-task-business-source').getAttribute('data-record-id'), '71')
      },
    },
    {
      ...base,
      name: 'mobile-task-business-completed-source',
      workflowTaskFixtures: [{ ...task, task_status_key: 'done' }],
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        page.recordedHistoryFailure = false
        page.recordedHistoryEmpty = false
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'list_task_events') {
            if (page.recordedHistoryFailure) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '读取失败' } } })
            const items = page.recordedHistoryEmpty ? [] : [{ id: 52, task_id: task.id, event_type: 'status_changed', actor_display_name: '包装核对员', actor_role_key: 'sales', created_at: 1790085800, task_version: 2, from_status_key: 'ready', to_status_key: 'done', reason: '包装版本已核对，移交生产。' }]
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items, truncated: items.length > 0 } } } })
          }
          if (method !== 'get_task') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { task: { ...task, task_status_key: 'done' } } } } })
        })
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByLabel('任务状态', { exact: true }).getByText('已办', { exact: true }).click()
        const card = page.locator('.erp-task-card').filter({ hasText: task.task_name })
        await clickTaskCardContent(card, card.getByText(task.task_name, { exact: true }))
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.getByText('已完成', { exact: true }).first().waitFor()
        assert.equal(await detail.getByRole('button', { name: '选择处理方式', exact: true }).count(), 0)
        await detail.getByRole('button', { name: '填写办理表单', exact: true }).click()
        await page.locator('[data-testid="mobile-task-business-source"][data-record-id="71"]').waitFor()
        assert.equal(await page.getByTestId('mobile-task-business-source').getAttribute('data-record-id'), '71')
        const action = page.getByTestId('mobile-task-action-screen')
        await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
        page.recordedHistoryFailure = true
        await action.getByRole('button', { name: '结果回执', exact: true }).click()
        const receipt = page.getByTestId('mobile-task-receipt-screen')
        await receipt.getByRole('heading', { name: '已记录的办理结果', exact: true }).waitFor()
        await receipt.getByText('办理记录暂时无法读取，请重新读取。', { exact: true }).waitFor()
        assert.equal(await receipt.locator('[data-outcome="confirmed"]').count(), 0)
        page.recordedHistoryFailure = false
        await receipt.getByRole('button', { name: '重新读取办理记录', exact: true }).click()
        await receipt.getByText('包装核对员', { exact: true }).waitFor()
        await receipt.getByText('意见：包装版本已核对，移交生产。', { exact: true }).waitFor()
        await receipt.getByTestId('workflow-task-event-trail-truncated').waitFor()
        await page.screenshot({ path: path.join(outputDir, 'mobile-task-recorded-result.png') })
        await page.reload()
        await receipt.getByText('包装核对员', { exact: true }).waitFor()
        const receiptHistoryLength = await page.evaluate(() => window.history.length)
        for (let revisit = 0; revisit < 2; revisit += 1) {
          await receipt.getByRole('button', { name: '任务办理', exact: true }).click()
          await page.locator('[data-testid="mobile-task-business-source"][data-record-id="71"]').waitFor()
          await action.getByText('已完成', { exact: true }).first().waitFor()
          assert.equal(await action.getByRole('button', { name: '选择处理方式', exact: true }).count(), 0)
          await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
          await action.getByRole('button', { name: '结果回执', exact: true }).click()
          await receipt.getByText('包装核对员', { exact: true }).waitFor()
          assert.equal(await receipt.locator('[data-outcome="recorded"]').count(), 1, '往返后保留历史回执身份')
          assert.equal(await page.evaluate(() => window.history.length), receiptHistoryLength, '步骤往返不堆积回执历史')
        }
        await receipt.getByRole('button', { name: '任务信息', exact: true }).click()
        await detail.waitFor()
        page.recordedHistoryEmpty = true
        await detail.getByRole('button', { name: '结果回执', exact: true }).click()
        await receipt.getByText('暂无本任务处理记录', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'mobile-completed-source-access')
      },
    },
    ...createMobileQualityScenario(deps, open),
  ]
}

function createMobileQualityScenario(deps, open) {
  const base = createProductionTaskHandlingScenarios(deps).find((item) => item.name === 'production-task-quality-direct-focus')
  const task = base.workflowTaskFixtures[0]
  const permission = 'mobile.quality.access'
  return [{
    ...base,
    name: 'mobile-task-business-quality-submit-reject',
    path: '/m/quality/tasks',
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    adminProfile: { ...base.adminProfile, permissions: [...base.adminProfile.permissions, permission] },
    effectiveSession: { ...base.effectiveSession, actions: [...base.effectiveSession.actions, permission] },
    verify: async (page) => {
      const qualityReads = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/rpc/quality') {
          const method = request.postDataJSON()?.method
          if (method?.startsWith('get_') || method?.startsWith('list_')) qualityReads.push(method)
        }
      })
      await open(page, task.task_name)
      const focus = page.getByRole('dialog', { name: '办理本次质检', exact: true })
      await focus.waitFor()
      await focus.getByRole('button', { name: '提交质检', exact: true }).click()
      await focus.getByRole('button', { name: '判定不合格', exact: true }).click()
      const decision = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '确认不合格', exact: true }) })
      await decision.waitFor()
      const date = decision.getByLabel('检验日期', { exact: true })
      for (const [width, height] of [[320, 568], [390, 844]]) {
        await page.setViewportSize({ width, height })
        await date.click()
        const calendar = page.locator('.ant-picker-dropdown:visible')
        await calendar.waitFor()
        await waitForFiniteAnimations(page)
        const calendarGeometry = await calendar.evaluate((root) => {
          const metrics = (node) => {
            const box = node.getBoundingClientRect()
            const style = getComputedStyle(node)
            return { className: node.className, left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, minWidth: style.minWidth, padding: style.padding, fontSize: style.fontSize }
          }
          return { viewportWidth: innerWidth, viewportHeight: innerHeight, panel: metrics(root), columns: [...root.querySelectorAll('th')].map(metrics), ancestors: [...root.querySelectorAll('.ant-picker-panel-container, .ant-picker-date-panel, .ant-picker-body, .ant-picker-content')].map(metrics) }
        })
        deps.assert.equal(calendarGeometry.columns.length, 7)
        deps.assert.ok(calendarGeometry.panel.left >= 0 && calendarGeometry.panel.right <= calendarGeometry.viewportWidth && calendarGeometry.panel.top >= 0 && calendarGeometry.panel.bottom <= calendarGeometry.viewportHeight, `手机日历及翻月控件完整可见: ${JSON.stringify(calendarGeometry)}`)
        deps.assert.ok(calendarGeometry.columns.every((column) => column.left >= 0 && column.right <= calendarGeometry.viewportWidth), `手机日历七列均在视口内: ${JSON.stringify(calendarGeometry)}`)
        await writeFile(deps.path.join(deps.outputDir, `mobile-quality-calendar-${width}.json`), JSON.stringify(calendarGeometry, null, 2))
        await page.screenshot({ path: deps.path.join(deps.outputDir, `mobile-quality-calendar-${width}.png`) })
        const selectedDate = calendar.locator('.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)').first()
        const selectedValue = await selectedDate.getAttribute('title')
        await selectedDate.click()
        await calendar.waitFor({ state: 'hidden' })
        deps.assert.equal(await date.inputValue(), selectedValue.replaceAll('-', '/'))
      }
      await decision.getByRole('button', { name: '确认不合格', exact: true }).click()
      deps.assert.equal(await decision.locator('.ant-form-item-has-error').count() > 0, true)
      deps.assert.deepEqual([...new Set(qualityReads)], ['get_quality_inspection'], '工序质检任务只读取指定质检单，不依赖来料列表权限')
      await deps.assertNoHorizontalOverflow(page, 'mobile-task-quality-invalid-decision')
      await page.screenshot({ path: deps.path.join(deps.outputDir, 'mobile-task-quality-decision-validation.png') })
    },
  }]
}
