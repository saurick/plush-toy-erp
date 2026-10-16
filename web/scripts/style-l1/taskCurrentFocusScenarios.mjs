import { assertTaskMenuCopy } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import fs from 'node:fs/promises'

export function createTaskCurrentFocusScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession }) {
  return ['desktop', 'mobile'].flatMap((surface) => ['light', 'dark'].map((themeMode) => {
    const mobile = surface === 'mobile'
    const blocked = themeMode === 'dark'
    const sourceNo = 'SO-FOCUS-001'
    const ended = [
      { id: 711, node_key: 'submit_sales_order', node_type: 'domain_command', status: 'completed' },
      { id: 712, node_key: 'order_approval', node_type: 'approval', status: 'completed' },
    ].map((node) => ({ ...node, process_instance_id: 710, attempt: 1, version: 1 }))
    const current = { id: 713, process_instance_id: 710, node_key: 'engineering_data', node_type: 'human_task', status: blocked ? 'blocked' : 'active', attempt: 1, version: 1 }
    const context = {
      source: { type: 'sales_order', id: 701, no: sourceNo },
      process_instance: { id: 710, process_key: 'sales_order_acceptance', process_version: 'v1', status: blocked ? 'blocked' : 'active', started_at: 1790085600 },
      nodes: [...ended, current], current_nodes: [current], completed_nodes: ended, linked_node: current,
      current_responsibilities: [{ node_instance_id: current.id, owner_role_key: 'engineering' }], approval_form: null,
    }
    const fixture = {
      id: 714, version: 1, task_code: 'STYLE-L1-CURRENT-FOCUS', task_name: '工程资料', task_group: 'engineering_data',
      task_status_key: blocked ? 'blocked' : 'ready', owner_role_key: 'engineering', assignee_id: null,
      source_type: 'sales_order', source_id: 701, source_no: sourceNo, created_at: 1790085600,
      required_capability_key: 'workflow.task.complete', process_instance_id: 710, process_node_instance_id: current.id,
      blocked_reason: blocked ? '物料规格待补齐，需业务岗位核对。' : '',
      display_context: { available: true, source_no: sourceNo, items: [
        { kind: 'product', product_id: 7, name: blocked ? '海盐企鹅礼盒（可拆卸挂件、加长规格与多语言包装说明）' : '海盐企鹅', code: '27007#', style_no: 'PENGUIN-7', image_attachment_id: blocked ? 0 : 8801 },
        { kind: 'product', product_id: 2, name: '海盐企鹅挂件', code: '27007-GJ', image_attachment_id: 0 },
      ] }, processContext: context,
    }
    const actions = ['workflow.task.read', 'workflow.task.update', 'workflow.task.complete', 'workflow.task.reject', 'workflow.task.urge', 'sales_order.read', 'engineering.material.read', 'product.read', 'mobile.engineering.access']
    const effectiveSession = {
      ...customerRuntimeEffectiveSession, configRevision: 'style-l1-current-focus', roles: ['engineering'], pages: ['task-board', 'sales-orders'], workPools: ['engineering'], actions,
      workflow_visible_owner_role_keys_by_capability: Object.fromEntries(actions.filter((key) => key.startsWith('workflow.task.')).map((key) => [key, ['engineering']])),
    }
    let processReads = 0
    let failProcessRead = !blocked
    let handlingReads = 0
    return {
      name: `task-current-focus-${surface}-${themeMode}`,
      path: mobile ? '/m/engineering/tasks' : '/erp/task-board', auth: 'admin', customerKey: 'yoyoosun', themeMode,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 }, deviceScaleFactor: mobile ? 1 : 2,
      effectiveSession,
      adminProfile: { id: 1, username: 'style-l1-current-focus', is_super_admin: false, roles: [{ role_key: 'engineering', name: '工程' }], permissions: actions, menus: [{ key: 'task-board', label: '任务管理', path: '/erp/task-board', required_any: ['workflow.task.read'], required_all: [] }, { key: 'sales-orders', label: '销售订单', path: '/erp/sales/project-orders/sales-orders', required_any: ['sales_order.read'], required_all: [] }] },
      workflowTaskFixtures: [fixture],
      beforeNavigate: async (page) => {
        processReads = 0; handlingReads = 0; failProcessRead = !blocked
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method === 'explain_action_access' && body.params.task_id === fixture.id) {
            const permitted = blocked ? ['resume', 'urge'] : ['complete', 'block', 'reject', 'urge']
            const actions = ['complete', 'block', 'reject', 'resume', 'urge'].map((key) => ({ action_key: key, allowed: permitted.includes(key), required_permission: key === 'complete' ? 'workflow.task.complete' : 'workflow.task.update', owner_role_key: 'engineering', reason: permitted.includes(key) ? '' : '当前状态不可办理', reason_code: permitted.includes(key) ? 'allowed' : 'invalid_task_status' }))
            const source_access = { applicable: true, resolved: true, allowed: true, reason: '', reason_code: 'source_access_allowed' }
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: body.params.action_key ? { source_access, action: actions.find((item) => item.action_key === body.params.action_key) } : { task_id: fixture.id, source_access, actions } } } })
          }
          if (body?.method === 'get_task_process_context' && body.params.task_id === fixture.id) {
            processReads++
            if (failProcessRead) { failProcessRead = false; return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '读取失败' } } }) }
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { process_context: context } } } })
          }
          if (body?.method === 'get_task_handling_chain') {
            handlingReads++
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: [fixture], truncated: false } } } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '查看工程资料详情', exact: true }).click()
        const detail = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.erp-task-action-drawer')
        const currentSummary = detail.locator('.workflow-task-current')
        await currentSummary.waitFor()
        if (!blocked) {
          await detail.getByText('暂时无法读取任务处理链，请重新读取。', { exact: true }).waitFor()
          await detail.getByRole('button', { name: '重新读取', exact: true }).click()
        } else {
          assert.match(await currentSummary.innerText(), /物料规格待补齐/u)
        }
        const chain = detail.getByTestId(mobile ? 'mobile-task-process-context' : 'workflow-task-handling-chain')
        const track = chain.getByTestId('workflow-process-stage')
        await track.getByText('前序 2 步已完成', { exact: true }).waitFor()
        if (!blocked) assert.equal(processReads, 2, '进度读取失败后只重读进度')
        const history = track.locator('details')
        assert.notEqual(await history.getAttribute('open'), null)
        assert.equal(await track.locator(':scope > ol [data-linked-task="true"]').count(), 0, '本任务当前责任已在上方突出，不再重复一个当前节点卡片')
        assert.equal(handlingReads, 0, '默认详情不请求整单任务链')
        const records = detail.getByTestId('workflow-task-event-trail')
        await records.locator('details').waitFor()
        assert.notEqual(await records.locator('details').getAttribute('open'), null)
        await waitForFiniteAnimations(page)
        const geometry = await detail.evaluate((el) => {
          const current = el.querySelector('.workflow-task-current').getBoundingClientRect()
          const chain = el.querySelector('[aria-label="任务处理链"]').getBoundingClientRect()
          const footer = el.querySelector('.ant-drawer-footer, .mobile-role-action-bar').getBoundingClientRect()
          const main = el.querySelector('.ant-drawer-body, .mobile-role-tasks-page__detail-main')
          const resources = el.querySelector('.erp-task-action-drawer__resources, .mobile-detail-inline-actions')
          const buttons = [...resources.querySelectorAll('button')].map(button => button.getBoundingClientRect().toJSON())
          const title = el.querySelector('.erp-task-action-drawer__task-title, .mobile-detail-heading > h2').getBoundingClientRect()
          const source = el.querySelector('.erp-task-action-drawer__source, .mobile-detail-source').getBoundingClientRect()
          const more = el.querySelector('[aria-label="更多操作"]')
          const recordHeading = [...el.querySelector('.workflow-task-event-trail__heading-label').children].map(node => { const rect = node.getBoundingClientRect(); return { text: node.textContent, centerY: rect.y + rect.height / 2 } })
          return { current: current.toJSON(), chain: chain.toJSON(), footer: footer.toJSON(), buttons, recordHeading, headingInHeader: Boolean(more.closest('.ant-drawer-header, header')), alignedLeft: [title.left, source.left, current.left, chain.left], overflow: main.scrollWidth - main.clientWidth, viewport: { width: window.innerWidth, height: window.innerHeight } }
        })
        assert.ok(geometry.current.bottom <= geometry.chain.top + 1, JSON.stringify(geometry))
        assert.ok(geometry.current.top < geometry.footer.top && geometry.overflow <= 1, JSON.stringify(geometry))
        assert.ok(geometry.headingInHeader, '更多操作位于页头')
        assert.ok(Math.max(...geometry.alignedLeft) - Math.min(...geometry.alignedLeft) <= 1, '标题、来源、当前摘要与流程同一左基线')
        assert.equal(geometry.buttons.length, 2)
        assert.ok(Math.max(...geometry.recordHeading.map(item => item.centerY)) - Math.min(...geometry.recordHeading.map(item => item.centerY)) <= 1, `记录区图标、标题及数量垂直居中：${JSON.stringify(geometry.recordHeading)}`)
        assert.ok(Math.abs(geometry.buttons[0].top - geometry.buttons[1].top) <= 1 && Math.abs(geometry.buttons[0].height - geometry.buttons[1].height) <= 1, `资料按钮顶边与高度一致：${JSON.stringify(geometry.buttons)}`)
        if (!mobile) assert.ok(geometry.chain.top < 600, '当前节点和流程入口应位于桌面首屏')
        if (mobile) {
          const footer = detail.locator('.mobile-role-action-bar')
          assert.equal(await footer.getByRole('button', { name: '进入单据办理', exact: true }).count(), 1)
          assert.equal(await footer.getByRole('button', { name: '选择处理方式', exact: true }).count(), 1)
          const buttons = await footer.locator('button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().toJSON()))
          assert.ok(Math.abs(buttons[0].top - buttons[1].top) <= 1, '手机底部操作保持一行')
        }
        await page.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-overview.png`) })
        await detail.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-detail.png`) })
        const more = detail.getByRole('button', { name: '更多操作', exact: true })
        await more.click()
        const menu = page.locator('.erp-task-copy-menu .ant-dropdown-menu')
        await menu.waitFor()
        await waitForFiniteAnimations(page)
        const menuStyle = await menu.evaluate(el => ({ width: el.getBoundingClientRect().width, rows: [...el.children].map(node => ({ shadow: getComputedStyle(node).boxShadow, height: node.getBoundingClientRect().height })), icons: [...el.querySelectorAll('svg')].map(svg => svg.getAttribute('data-icon')) }))
        assert.ok(Math.abs(menuStyle.width - 180) <= 1 && menuStyle.rows.every(row => row.shadow === 'none' && row.height >= (mobile ? 44 : 40) - 1), JSON.stringify(menuStyle))
        assert.deepEqual(menuStyle.icons, ['copy', 'link', 'copy'])
        await fs.writeFile(path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-geometry.json`), JSON.stringify({ geometry, menuStyle }, null, 2))
        await page.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-menu.png`) })
        await page.keyboard.press('Escape')
        await menu.waitFor({ state: 'hidden' })
        assert.equal(await detail.isVisible(), true, 'Escape 只关闭菜单，保留任务详情')
        const productsTrigger = detail.getByRole('button', { name: '共 2 项产品', exact: true })
        await productsTrigger.click()
        const products = page.getByRole('dialog', { name: '关联产品', exact: true })
        await products.waitFor()
        assert.equal(await products.locator('.erp-task-identity__row').count(), 2)
        assert.ok(await products.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth + 1), '关联产品弹窗在窄屏不横向溢出')
        await products.locator('.ant-modal-close').click()
        await products.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        assert.equal(await productsTrigger.evaluate(node => node === document.activeElement), true, '关闭关联产品后焦点返回数量入口')
        await assertTaskMenuCopy(page, detail, '任务信息', ['工程资料', sourceNo, '海盐企鹅'], { keyboard: true })
        await assertTaskMenuCopy(page, detail, '产品信息', ['27007#', '27007-GJ'])
        await assertTaskMenuCopy(page, detail, '任务链接', '', { failure: true })
        await assertTaskMenuCopy(page, detail, '任务链接', `${new URL(page.url()).origin}/task-link/714`, { fallback: true })
        if (!blocked) {
          const image = detail.getByRole('button', { name: '查看海盐企鹅大图', exact: true })
          await image.click()
          const preview = page.getByRole('dialog', { name: '海盐企鹅图片预览', exact: true })
          await preview.waitFor()
          await preview.getByRole('button', { name: '关闭图片预览', exact: true }).click()
          await preview.waitFor({ state: 'hidden' })
        }
        await detail.getByTestId(mobile ? 'mobile-task-attachment-action' : 'workflow-task-attachment-action').click()
        const attachments = page.getByRole('dialog', { name: '任务附件', exact: true })
        await attachments.waitFor()
        await attachments.locator('.ant-modal-close').click()
        await attachments.waitFor({ state: 'hidden' })
        await history.locator('summary').click()
        assert.equal(await history.locator('li').count(), 2)
        await chain.getByRole('button', { name: '查看订单全流程', exact: true }).click()
        await chain.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        await chain.locator('.workflow-business-chain').waitFor()
        assert.equal(handlingReads, 1)
        await chain.getByRole('button', { name: '返回本任务', exact: true }).click()
        assert.equal(await history.getAttribute('open'), null, '从全流程返回保留手动收起状态')
        if (mobile) {
          await page.setViewportSize({ width: 320, height: 720 })
          await waitForFiniteAnimations(page)
          const small = await detail.evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth, buttons: [...el.querySelectorAll('.mobile-role-action-bar button')].map(button => button.getBoundingClientRect().toJSON()), overflow: [...el.querySelectorAll('*')].filter(node => node.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).slice(0, 8).map(node => ({ className: node.className, text: node.textContent.slice(0, 35), right: node.getBoundingClientRect().right })) }))
          assert.ok(small.scroll <= small.width + 1 && small.buttons.every(b => b.width >= 44 && b.height >= 44), JSON.stringify(small))
          await page.setViewportSize({ width: 390, height: 844 })
        }
        const resources = mobile ? detail.locator('.mobile-detail-inline-actions') : detail.locator('.erp-task-action-drawer__resources')
        await resources.getByRole('button', { name: '查看材料汇总', exact: true }).waitFor()
        const action = detail.getByRole('button', { name: '选择处理方式', exact: true })
        await action.click()
        const handling = mobile ? page.getByTestId('mobile-task-action-screen') : detail
        if (mobile) await handling.waitFor()
        else await handling.locator('.erp-task-action-drawer__action-prompt').waitFor()
        if (mobile) await handling.getByRole('button', { name: '返回任务详情', exact: true }).click()
        else await handling.getByRole('tab', { name: /核对任务/u }).click()
        await detail.locator('.workflow-task-current').waitFor()
        assert.match(await currentSummary.innerText(), /工程/u)
      },
    }
  }))
}
