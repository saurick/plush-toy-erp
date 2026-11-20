import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createTaskDetailVariantScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession }) {
  return ['rework', 'shipment'].flatMap((kind) => ['desktop', 'mobile'].flatMap((surface) => ['light', 'dark'].map((themeMode) => {
    const mobile = surface === 'mobile'
    const role = kind === 'rework' ? 'production' : 'sales'
    const actions = Object.values(PermissionCode)
    const roles = ['production', 'sales', 'warehouse', 'boss', 'engineering']
    const current = {
      id: kind === 'rework' ? 8801 : 8901,
      version: 1,
      task_code: kind === 'rework' ? 'source-production-exception-1' : 'source-handoff-shipment-execute-1',
      task_name: kind === 'rework' ? '处理返工异常 STYLE-RW-001' : '准备并办理发货',
      task_group: kind === 'rework' ? 'production_exception' : 'handoff_shipment_execute',
      source_type: kind === 'rework' ? 'production-progress' : 'shipment',
      source_id: 1,
      source_no: kind === 'rework' ? 'STYLE-RW-001' : 'STYLE-SHIP-001',
      task_status_key: 'ready',
      owner_role_key: role,
      assignee_id: null,
      required_capability_key: 'workflow.task.complete',
      created_at: 1790085600,
      payload: {
        source_task_contract: 'workflow.source-task/v1',
        source_task_intent_hash: 'a'.repeat(64),
        source_task_producer: kind === 'rework' ? 'production_rework.post' : 'fulfillment.source',
        ...(kind === 'rework' ? { production_fact_id: 1 } : { source_record_id: 1, entry_path: '/erp/warehouse/shipments?shipment_id=1' }),
      },
      display_context: { available: true, source_no: kind === 'rework' ? 'STYLE-RW-001' : 'STYLE-SHIP-001', items: [] },
    }
    const related = kind === 'rework' ? [
      { ...current, id: 8802, task_name: '登记成品收仓', owner_role_key: 'warehouse', task_group: 'handoff_finished_goods_inbound', source_type: 'production_wip_batch', source_no: 'STYLE-WIP-001' },
      { ...current, id: 8803, task_name: '安排并办理本工序', task_group: 'handoff_handwork_execute', source_type: 'production_wip_batch', source_no: 'STYLE-WIP-002' },
      { ...current, id: 8799, task_name: '前轮检验已记录', task_status_key: 'done', completed_at: 1790085620, owner_role_key: 'quality' },
      { ...current, id: 8800, task_name: '前轮安排已撤回', task_status_key: 'withdrawn', completed_at: null },
    ] : []
    let processReads = 0
    let chainReads = 0
    const fixtureTasks = [current, ...related]
    return {
      name: `task-detail-${kind}-${surface}-${themeMode}`,
      path: mobile ? `/m/${role}/tasks` : '/erp/task-board?mode=todo',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
      deviceScaleFactor: mobile ? 1 : 2,
      auth: 'admin',
      customerKey: 'yoyoosun',
      themeMode,
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-task-variants',
        actions,
        roles,
        workPools: roles,
        pages: [...new Set([...(customerRuntimeEffectiveSession.pages || []), 'task-board', 'production-progress', 'shipments', 'production-exceptions'])],
        workflow_visible_owner_role_keys_by_capability: Object.fromEntries(actions.filter((key) => key.startsWith('workflow.task.')).map((key) => [key, roles])),
      },
      adminProfile: {
        id: 1,
        username: 'style-l1-task-variants',
        is_super_admin: true,
        roles: roles.map((role_key) => ({ role_key, name: role_key })),
        permissions: actions,
        menus: [{ key: 'task-board', label: '任务管理', path: '/erp/task-board' }, { key: 'production-progress', label: '生产记录', path: '/erp/production/progress' }, { key: 'shipments', label: '出货单', path: '/erp/warehouse/shipments' }],
      },
      workflowTaskFixtures: fixtureTasks,
      beforeNavigate: async (page) => {
        processReads = 0; chainReads = 0
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'get_task_process_context') { processReads++; return route.fallback() }
          if (body.method === 'get_task_handling_chain') {
            chainReads++
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: fixtureTasks, truncated: false } } } })
          }
          if (body.method === 'get_task') {
            const task = fixtureTasks.find((item) => item.id === body.params.task_id)
            if (task) return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { task } } } })
          }
          if (body.method === 'list_task_events') {
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: [{ id: 70001, event_type: 'created', actor_role_key: role, created_at: current.created_at, task_version: 1, to_status_key: 'ready' }], truncated: false } } } })
          }
          if (body.method === 'explain_action_access') {
            const permitted = kind === 'shipment' ? ['urge'] : ['complete', 'block', 'urge']
            const allowed = ['complete', 'block', 'reject', 'resume', 'urge'].map((action_key) => ({ action_key, allowed: permitted.includes(action_key), required_permission: action_key === 'complete' ? 'workflow.task.complete' : 'workflow.task.update', owner_role_key: role, reason: permitted.includes(action_key) ? '' : '当前状态不可办理', reason_code: permitted.includes(action_key) ? 'allowed' : 'invalid_task_status' }))
            const source_access = { applicable: true, resolved: true, allowed: true, reason: '', reason_code: 'source_access_allowed' }
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: body.params.action_key ? { source_access, action: allowed.find((item) => item.action_key === body.params.action_key) } : { task_id: body.params.task_id, source_access, actions: allowed } } } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        if (mobile) await page.getByTestId('mobile-role-bottom-nav').getByRole('tab', { name: /^任务管理/u }).click()
        else await page.getByRole('button', { name: /^常规待办，/u }).click()
        await page.getByRole('button', { name: `查看${current.task_name}详情`, exact: true }).click()
        const detail = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.erp-task-action-drawer')
        const chain = detail.locator('.workflow-business-chain[data-view="task"]')
        await chain.waitFor()
        await chain.getByText(kind === 'rework' ? '关联待办' : '当前暂无其他关联任务。', { exact: kind !== 'rework' }).waitFor()
        assert.equal(await chain.locator('li[aria-current="step"]').count(), 0, '当前任务只在上方摘要展示一次')
        assert.equal(await chain.getByText(current.task_name, { exact: true }).count(), 0)
        assert.equal(await detail.locator('.workflow-task-current').count(), 1)
        assert.equal(processReads, 0, '无正式流程关联时不请求或编造流程步骤')
        assert.equal(chainReads, 1)
        const records = detail.getByTestId('workflow-task-event-trail')
        await records.locator('details[open]').waitFor()
        assert.equal(await records.locator('select, [role="combobox"]').count(), 0)
        const heading = await records.locator('summary').evaluate((el) => {
          const rect = el.getBoundingClientRect()
          const label = el.querySelector('.workflow-task-event-trail__heading-label').getBoundingClientRect()
          const toggle = el.querySelector(':scope > .anticon').getBoundingClientRect()
          return { display: getComputedStyle(el).display, rightGap: rect.right - toggle.right, labelClear: toggle.left - label.right, within: toggle.top >= rect.top && toggle.bottom <= rect.bottom }
        })
        assert.ok(heading.display === 'flex' && heading.rightGap <= 1 && heading.labelClear >= 7 && heading.within, JSON.stringify(heading))
        await records.screenshot({ path: path.resolve(outputDir, `task-detail-${kind}-${surface}-${themeMode}-records.png`) })
        if (kind === 'rework') {
          const history = chain.locator('.workflow-business-chain__history')
          assert.notEqual(await history.getAttribute('open'), null)
          assert.match(await history.locator('summary').innerText(), /关联已处理任务 2 项/u)
          assert.doesNotMatch(await history.locator('summary').innerText(), /最近在前|从早到晚/u)
          assert.equal(await history.locator('li').count(), 2)
          const nodes = await chain.locator('.workflow-business-chain__task').evaluateAll((items) => items.map((item) => {
            const marker = item.querySelector('.workflow-process-stage__marker')
            const box = marker.getBoundingClientRect()
            const style = getComputedStyle(marker)
            const title = item.querySelector('.workflow-business-chain__task-heading > :first-child').getBoundingClientRect()
            const row = item.getBoundingClientRect()
            return { status: item.dataset.status, symbol: marker.textContent, width: box.width, height: box.height, radius: parseFloat(style.borderRadius), border: style.borderStyle, centerOffset: Math.abs((box.top + box.bottom - title.top - title.bottom) / 2), within: box.left >= row.left && box.right <= title.left, after: getComputedStyle(item, '::after').content, before: getComputedStyle(item, '::before').content }
          }))
          assert.deepEqual(nodes.map((item) => item.symbol), ['●', '●', '✓', '−'])
          assert.ok(nodes.every((item) => item.width === 26 && item.height === 26 && item.radius >= 13 && item.border === 'solid' && item.centerOffset <= 1 && item.within && item.after === 'none' && item.before === 'none'), JSON.stringify(nodes))
          await chain.screenshot({ path: path.resolve(outputDir, `task-progress-nodes-${surface}-${themeMode}.png`) })
          await history.locator('summary').press('Enter')
          assert.equal(await history.getAttribute('open'), null)
          await detail.getByRole('button', { name: '查看订单全流程', exact: true }).click()
          await detail.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
          await detail.getByRole('button', { name: '返回本任务', exact: true }).click()
          assert.equal(await history.getAttribute('open'), null, '全流程返回保留关联历史的手动收起')
          await history.locator('summary').click()
        }
        await waitForFiniteAnimations(page)
        await detail.screenshot({ path: path.resolve(outputDir, `task-detail-${kind}-${surface}-${themeMode}.png`) })
        if (mobile) {
          assert.equal(await detail.locator('.workflow-task-current__guidance').count(), 0, '不重复显示正常办理的通用操作说明')
          assert.equal(await detail.getByRole('button', { name: '进入单据办理', exact: true }).count(), 0)
          assert.equal(await detail.locator('.mobile-detail-source button:not(.erp-task-copy), .mobile-detail-source a, a[href*="/handle/"]').count(), 0, '手机来源只允许编号复制，不提供单据跳转')
          const footer = detail.locator('.mobile-role-action-bar')
          assert.equal(await footer.locator('button').count(), 2)
          assert.equal(await footer.locator('.mobile-detail-footer-resources').count(), 0, '非用料任务不增加材料汇总入口')
          const actionBox = await footer.locator('button').last().boundingBox()
          const attachmentBox = await footer.getByTestId('mobile-task-attachment-action').boundingBox()
          assert.ok(actionBox.width >= attachmentBox.width && actionBox.height >= 44, JSON.stringify({ actionBox, attachmentBox }))
          assert.ok(Math.abs(attachmentBox.y - actionBox.y) <= 1 && Math.abs(attachmentBox.height - actionBox.height) <= 1)
          assert.ok(new URL(page.url()).pathname.startsWith(`/m/${role}/`))
          await detail.locator('main').evaluate((element) => { element.scrollTop = 0 })
          await detail.screenshot({ path: path.resolve(outputDir, `task-detail-${kind}-${surface}-${themeMode}-overview.png`) })
          await page.setViewportSize({ width: 320, height: 844 })
          assert.ok(await detail.evaluate((el) => el.scrollWidth <= el.clientWidth + 1))
          if (kind === 'rework') {
            const nodes = await chain.locator('.workflow-business-chain__task').evaluateAll((items) => items.map((item) => ({ row: item.getBoundingClientRect().toJSON(), marker: item.querySelector('.workflow-process-stage__marker').getBoundingClientRect().toJSON(), content: item.querySelector('.workflow-business-chain__task-content').getBoundingClientRect().toJSON(), overflow: item.scrollWidth - item.clientWidth })))
            assert.ok(nodes.every((item) => item.overflow <= 1 && item.marker.right <= item.content.left && item.content.right <= item.row.right + 1), JSON.stringify(nodes))
            await chain.screenshot({ path: path.resolve(outputDir, `task-progress-nodes-${surface}-${themeMode}-320.png`) })
          }
          await detail.screenshot({ path: path.resolve(outputDir, `task-detail-${kind}-${surface}-${themeMode}-320.png`) })
          await page.setViewportSize({ width: 390, height: 844 })
        } else {
          await detail.getByRole('button', { name: '进入单据办理', exact: true }).click()
          await page.waitForURL((url) => url.pathname.startsWith('/erp/') && url.pathname !== '/erp/task-board')
          await page.locator('.erp-business-page-layout').waitFor()
          assert.equal(await page.evaluate(() => history.state.usr.workflowTaskNavigation.taskID), current.id, '桌面进入来源单据时保留原任务上下文')
          await page.screenshot({ path: path.resolve(outputDir, `task-detail-${kind}-${surface}-${themeMode}-source.png`) })
          await page.getByRole('button', { name: '返回原任务', exact: true }).click()
          await detail.waitFor()
          await detail.getByRole('heading', { name: current.task_name, exact: true }).waitFor()
        }
      },
    }
  })))
}
