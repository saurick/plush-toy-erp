import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'
import { summaryFixture } from './materialSummaryScenarios.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createMaterialReviewTrackingScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession }) {
  return ['desktop', 'mobile'].map((surface) => {
    const mobile = surface === 'mobile'
    const actions = Object.values(PermissionCode)
    const now = 1790384400
    const label = 'SO-MATERIAL-UI'
    const permission = PermissionCode.ENGINEERING_MATERIAL_FINANCE_APPROVE
    const task = {
      id: 9452, task_code: 'source-material-finance-review-51', task_group: 'engineering_material_finance_review',
      task_name: '审核并批准采购用料', source_type: 'engineering_material_request', source_id: 51,
      source_no: label, task_status_key: 'ready', owner_role_key: 'finance', required_capability_key: permission,
      created_at: now + 60, version: 1,
      payload: { sales_order_id: 101, engineering_material_request_id: 51, source_task_contract: 'workflow.source-task/v1', source_task_producer: 'engineering_material_request.approval', source_task_intent_hash: 'a'.repeat(64) },
    }
    const current = {
      task_id: task.id, task_name: task.task_name, task_group: task.task_group, node_instance_id: null,
      owner_role_key: 'finance', assignee_name: '财务核对人', status: 'ready', required_capability_key: permission,
      created_at: now + 60, completed_at: null, due_at: null,
    }
    const boss = {
      ...current, task_id: 9451, task_name: '审核工程用料', task_group: 'engineering_material_boss_review',
      owner_role_key: 'boss', assignee_name: '', status: 'done', completed_at: now + 60,
    }
    const summary = {
      kind: 'material_review', id: 51, process_key: '', title: '本次用料审批',
      source_type: task.source_type, source_id: task.source_id, source_no: label, status: 'active', resolution_kind: null,
      started_at: now, updated_at: now + 60, completed_at: null, initiator_name: '工程提交人', initiator_role_key: 'engineering',
      current_tasks: [current], display_context: null,
    }
    const notes = Array.from({ length: 12 }, (_, index) => ({
      id: 100 + index, task_id: task.id, task_version: 1, event_type: 'payload_refreshed',
      actor_role_key: 'finance', actor_display_name: '财务核对人', from_status_key: 'ready',
      to_status_key: 'ready', created_at: now + 70 + index,
      reason: `第 ${index + 1} 项已核对，按更新后的材料规格和供应商报价准备审批。`,
    })).reverse()
    const request = { ...summaryFixture(), status: 'BOSS_APPROVED', boss_reviewed_at: '2026-09-26T01:01:00Z', version: 2 }
    let submitted = false
    let writes = 0
    let listTypes = []
    const trackedSummary = () => submitted
      ? { ...summary, current_tasks: [], status: 'completed', resolution_kind: 'succeeded', completed_at: now + 130 }
      : summary

    return {
      name: `material-review-tracking-${surface}`,
      path: mobile ? '/m/finance/tasks?tracking=visible&track_source_type=engineering_material_request&track_source_id=51' : '/erp/task-board?tracking=visible',
      auth: 'admin',
      viewport: mobile ? { width: 390, height: 720 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: { id: 1, username: 'style-l1-material-review', is_super_admin: true, permissions: actions, roles: [{ role_key: 'finance' }], menus: [{ key: 'task-board', path: '/erp/task-board' }] },
      effectiveSession: { ...customerRuntimeEffectiveSession, actions, roles: ['finance'], workPools: ['finance'], workflow_visible_owner_role_keys_by_capability: Object.fromEntries(actions.map((key) => [key, ['finance']])) },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        submitted = false; writes = 0; listTypes = []
        const reply = (route, id, data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'explain_action_access' && params.task_id === task.id) {
            const source_access = { applicable: true, resolved: true, allowed: true, reason: '', reason_code: 'source_access_allowed' }
            const complete = { action_key: 'complete', allowed: !submitted, owner_role_matched: true, required_permission: permission }
            const actions = [complete]
            return reply(route, id, params.action_key ? { source_access, action: actions.find((item) => item.action_key === params.action_key) } : { task_id: task.id, source_access, actions })
          }
          if (method === 'get_task' && params.task_id === task.id && submitted) {
            return reply(route, id, { task: { ...task, task_status_key: 'done', version: 2, completed_at: now + 130 } })
          }
          if (method === 'list_tracking') {
            listTypes.push(params.record_type)
            const items = params.record_type === 'task' ? [] : [trackedSummary()]
            return reply(route, id, { items, total: items.length, status_counts: submitted ? { active: 0, completed: items.length } : { active: items.length, completed: 0 }, limit: params.limit, offset: params.offset })
          }
          if (method === 'get_tracking') {
            assert.deepEqual(params, { kind: 'material_review', id: 51 })
            return reply(route, id, {
              tracking: {
                summary: trackedSummary(),
                current_task_access: submitted ? [] : [{ task_id: task.id, can_read: true, can_handle: true }],
                tasks: [boss, submitted ? { ...current, status: 'done', completed_at: now + 130 } : current],
                nodes: [], events: [], events_truncated: false, next_event_id: 0,
                material_review: {
                  status: submitted ? 'APPROVED' : 'BOSS_APPROVED', order_status: 'active',
                  submitted_at: now, submitted_by_name: '工程提交人',
                  boss_reviewed_at: now + 60, boss_reviewed_by_name: '老板审核人',
                  finance_reviewed_at: submitted ? now + 130 : null, finance_reviewed_by_name: submitted ? '财务核对人' : '',
                  rejected_at: null, rejected_by_name: '',
                },
              },
            })
          }
          if (method === 'list_task_events' && params.task_id === task.id) {
            return reply(route, id, { items: notes, truncated: false })
          }
          return route.fallback()
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'get_engineering_material_request') {
            assert.equal(params.request_id, 51)
            return reply(route, id, request)
          }
          if (method === 'finance_review_engineering_material_request') {
            writes += 1
            assert.equal(params.note, '报价和数量已核对')
            assert.equal(params.expected_version, 2)
            submitted = true
            return reply(route, id, { ...request, status: 'APPROVED', version: 3, purchase_orders: [{ id: 888, purchase_order_no: 'PO-MATERIAL-UI', supplier_id: 1, supplier_name: '模拟材料厂商' }] })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const modes = page.getByRole('tablist', { name: '跟踪内容', exact: true })
        await modes.getByRole('tab', { name: '单项跟进', exact: true }).click()
        await page.waitForFunction(() => /当前单据暂无可见流转记录|暂无可查看的跟进记录/u.test(document.body.innerText))
        await modes.getByRole('tab', { name: '流程进度', exact: true }).click()
        const tracking = page.getByRole(mobile ? 'dialog' : 'region', { name: mobile ? '流程跟踪' : '流程详情', exact: true })
        if (mobile) await page.getByRole('button', { name: new RegExp(label, 'u') }).click()
        const currentProgress = tracking.getByRole('group', { name: '当前进度' })
        await currentProgress.getByText('财务核对人', { exact: false }).waitFor()
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `material-review-tracking-${surface}-progress.png`) })
        await tracking.getByRole('button', { name: /老板审核/u }).click()
        const inspected = tracking.getByRole('group', { name: '所选环节' })
        assert.match(await inspected.innerText(), /老板审核人/u)
        assert.match(await currentProgress.innerText(), /财务/u)
        const openTask = () => tracking.getByRole('button', { name: '去审批', exact: true }).click()
        await openTask()
        const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
        await steps.getByRole('tab', { name: /任务信息/u }).waitFor()
        assert.equal(await steps.getByRole('tab', { name: /结果回执/u }).isEnabled(), false)
        const info = page.locator('.workflow-task-information:visible')
        const contents = info.getByRole('navigation', { name: '任务信息目录' })
        const records = contents.getByRole('button', { name: '处理记录', exact: true })
        await records.waitFor()
        await records.press('Enter')
        const anchor = await info.evaluate((root) => {
          const scroller = root.closest('.ant-drawer-body, .mobile-role-tasks-page__detail-main')
          const nav = root.querySelector('nav').getBoundingClientRect()
          const heading = document.activeElement.getBoundingClientRect()
          return { top: scroller.scrollTop, text: document.activeElement.textContent, belowNav: heading.top >= nav.bottom - 1, visible: heading.bottom <= scroller.getBoundingClientRect().bottom + 1 }
        })
        assert.ok(anchor.top > 0 && /本任务处理记录/u.test(anchor.text) && anchor.belowNav && anchor.visible, JSON.stringify(anchor))
        await page.screenshot({ path: path.join(outputDir, `material-review-tracking-${surface}-directory.png`) })

        const handling = () => steps.getByRole('tab', { name: /任务办理/u }).click()
        const backToInfo = () => steps.getByRole('tab', { name: /任务信息/u }).click()
        const note = page.locator('.erp-material-task-action:visible textarea')
        await handling()
        await note.fill('报价和数量已核对', { timeout: 12000 })
        await backToInfo()
        await waitForFiniteAnimations(page)
        await contents.locator('[aria-current="location"]').getByText('处理记录', { exact: true }).waitFor()
        const restored = await info.evaluate((root) => root.closest('.ant-drawer-body, .mobile-role-tasks-page__detail-main').scrollTop)
        assert.ok(restored > 0, '返回任务信息应恢复正文滚动位置')
        await handling()
        assert.equal(await note.inputValue(), '报价和数量已核对')
        if (mobile) await backToInfo()
        await page.getByRole('button', { name: mobile ? '返回流程跟踪' : '返回流程', exact: true }).click()
        await inspected.waitFor()
        assert.match(await inspected.innerText(), /老板审核人/u)
        await inspected.getByRole('button', { name: '回到当前环节', exact: true }).click()
        await openTask()
        await handling()
        await note.waitFor()
        assert.equal(await note.inputValue(), '报价和数量已核对')
        assert.equal(writes, 0)
        await page.getByRole('button', { name: '批准并生成采购订单', exact: true }).click()
        const receipt = mobile ? page.getByTestId('mobile-task-receipt-screen') : page.getByTestId('workflow-task-action-receipt')
        if (!mobile) {
          const receiptStep = steps.getByRole('tab', { name: /结果回执/u })
          await receiptStep.click()
        }
        await receipt.waitFor()
        assert.match(await receipt.innerText(), /已生成 1 张采购订单/u)
        assert.equal(writes, 1)
        assert.deepEqual([...new Set(listTypes)].sort(), ['flow', 'task'])
        await page.screenshot({ path: path.join(outputDir, `material-review-tracking-${surface}-receipt.png`) })
        await page.getByRole('button', { name: mobile ? '返回流程跟踪' : '返回流程', exact: true }).first().click()
        await currentProgress.getByText('已批准采购', { exact: true }).waitFor()
      },
    }
  })
}
