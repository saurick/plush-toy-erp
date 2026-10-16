import { createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createTaskLinkScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  return ['desktop', 'mobile'].flatMap((device) => ['own', 'readonly', 'multiple', 'ended', 'login', 'revoked', 'late-revoked', 'handoff', 'unavailable', 'retry', 'paged'].map((mode) => {
    const base = createTaskTrackingScenarios(deps)[0]
    const mobile = device === 'mobile'
    const actions = [...base.adminProfile.permissions.filter((action) => !['readonly', 'revoked'].includes(mode) || !['workflow.task.update', 'workflow.task.complete'].includes(action)), 'mobile.engineering.access']
    const tasks = base.workflowTaskFixtures.map((task) => ({ ...task, task_name: '工程资料', ...(mode === 'ended' ? { task_status_key: 'done' } : {}) }))
    if (mode === 'readonly') Object.assign(tasks[0], { task_name: '核对长款产品材料与供应商资料，确认包装及工艺要求后进入下一环节', source_no: `SO-${'LONGSOURCE'.repeat(8)}` })
    if (['multiple', 'handoff'].includes(mode)) tasks.push({ ...tasks[0], id: 302, task_code: 'PROC-10-NODE-22-A1', task_name: '复核工艺资料' })
    if (mode === 'paged') tasks.push(...Array.from({ length: 100 }, (_, index) => ({ ...tasks[0], id: 302 + index, task_name: `历史任务 ${302 + index}`, task_status_key: 'done' })))
    const calls = []
    let linkReads = 0
    let advanced = false
    let accessReads = 0
    let nextRead
    let receiveNextRead
    return {
      ...base,
      name: `task-link-${device}-${mode}`,
      path: '/task-link/300',
      auth: mode === 'login' ? undefined : 'admin',
      mockAdminRpc: true,
      ...(mode === 'login' ? { expectPath: '/admin-login' } : {}),
      customerKey: 'yoyoosun',
      viewport: mobile ? { width: mode === 'readonly' ? 320 : 390, height: 844 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: { ...base.adminProfile, permissions: actions, menus: mobile ? [] : [{ path: '/erp/task-board' }] },
      effectiveSession: { ...base.effectiveSession, actions, ...(mobile ? { pages: [] } : {}) },
      workflowTaskFixtures: tasks,
      beforeNavigate: async (page) => {
        if (mobile) await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari' }))
        calls.length = 0
        linkReads = 0
        advanced = false
        accessReads = 0
        nextRead = new Promise((resolve) => { receiveNextRead = resolve })
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          calls.push(body.method)
          if (mode === 'late-revoked' && body.method === 'explain_action_access') {
            accessReads += 1
            if (accessReads > 1) return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { task_id: body.params.task_id, source_access: { applicable: true, resolved: true, allowed: false }, actions: ['complete', 'block', 'reject', 'resume', 'urge'].map((action) => ({ action_key: action, allowed: false, reason: '任务已交给其他人员办理', reason_code: 'assigned_to_other' })) } } } })
          }
          if (body.method !== 'get_task_link') return route.fallback()
          linkReads += 1
          if (linkReads > 1) receiveNextRead()
          assert.equal(body.params.task_id, 300)
          if (mode === 'unavailable' || (mode === 'retry' && linkReads === 1)) return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 404, message: '任务不存在或无权查看' } } })
          const candidates = mode === 'handoff' ? tasks.filter((task) => task.id === (advanced ? 302 : 301)) : tasks
          const offset = body.params.offset || 0
          const items = candidates.slice(offset, offset + 100).map((task) => ({ ...task, can_handle: task.task_status_key === 'ready' && !['readonly', 'ended'].includes(mode) && (!['revoked', 'late-revoked'].includes(mode) || linkReads === 1) }))
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items, truncated: candidates.length > offset + 100 } } } })
        })
      },
      verify: async (page) => {
        if (mode === 'login') {
          await page.getByLabel('账号').fill('style-l1-admin')
          await page.locator('#password').fill('style-l1-password')
          await page.getByRole('button', { name: /^登\s*录$/u }).click()
        }
        const chain = page.getByRole('dialog', { name: '任务链', exact: true })
        const handling = mobile ? page.getByTestId('mobile-task-action-screen') : page.locator('.erp-task-action-drawer')
        if (['retry', 'unavailable'].includes(mode)) {
          await chain.getByText('无法打开任务链', { exact: true }).waitFor()
          assert.equal(await handling.isVisible(), false)
          if (mode === 'retry') await chain.getByRole('button', { name: '重新读取', exact: true }).click()
        }
        if (mode === 'late-revoked') {
          let deadline
          try { await Promise.race([nextRead, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('任务责任变化后未重读分享链')), 10000) })]) } finally { clearTimeout(deadline) }
        }
        if (['readonly', 'ended', 'revoked', 'late-revoked', 'multiple', 'paged'].includes(mode)) {
          await chain.getByRole('heading', { name: '当前待办', exact: true }).waitFor()
          if (mode === 'revoked') await page.waitForFunction(() => document.querySelector('[aria-label="分享任务链"]')?.getAttribute('aria-busy') === 'false')
          await handling.waitFor({ state: 'hidden' })
          assert.equal(await handling.isVisible(), false)
          if (mode === 'ended') await chain.getByText('当前可见任务已结束。', { exact: true }).waitFor()
          if (mode === 'paged') {
            await chain.getByRole('button', { name: '继续加载关联任务', exact: true }).click()
            await chain.getByRole('button', { name: '历史任务 401', exact: true }).waitFor()
            assert.equal(await chain.getByRole('button', { name: '继续加载关联任务', exact: true }).count(), 0)
            assert.equal(await handling.isVisible(), false, '读全任务链后仍由本人选择办理任务')
          }
          if (['multiple', 'paged'].includes(mode)) await chain.getByRole('button', { name: '工程资料', exact: true }).click()
        }
        if (['own', 'login', 'multiple', 'retry', 'handoff', 'paged'].includes(mode)) {
          let openedID = 301
          if (mode === 'handoff') {
            await handling.waitFor({ state: 'visible' })
            advanced = true
            await page.goto(new URL('/task-link/300', page.url()).href)
            openedID = 302
          }
          await handling.waitFor({ state: 'visible' })
          if (mobile) {
            await handling.getByRole('heading', { name: '选择处理方式', exact: true }).waitFor()
            await handling.getByRole('button', { name: '返回任务详情', exact: true }).click()
            const detail = page.getByTestId('mobile-task-detail-screen')
            await detail.waitFor()
            await assertTaskCopy(page, detail.getByRole('button', { name: '复制任务链接', exact: true }), `${new URL(page.url()).origin}/task-link/${openedID}`)
            await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()
          } else {
            await handling.locator('.erp-task-action-drawer__action-prompt').getByText('选择处理方式', { exact: true }).waitFor()
            await handling.getByRole('tab', { name: /核对任务/u }).click()
            await assertTaskCopy(page, handling.getByRole('button', { name: '复制任务链接', exact: true }), `${new URL(page.url()).origin}/task-link/${openedID}`)
            await handling.getByRole('button', { name: '返回列表', exact: true }).click()
          }
          await chain.getByRole('heading', { name: '当前待办', exact: true }).waitFor()
        }
        await waitForFiniteAnimations(page)
        await handling.waitFor({ state: 'hidden' })
        await assertNoHorizontalOverflow(page)
        const layout = await chain.evaluate((element) => {
          const body = element.querySelector('.ant-drawer-body')
          const content = element.querySelector('[aria-label="分享任务链"]')
          const footer = element.querySelector('.ant-drawer-footer')
          return { bodyOverflow: body.scrollWidth - body.clientWidth, footerOverflow: footer.scrollWidth - footer.clientWidth, padding: content ? Number.parseFloat(getComputedStyle(content).paddingLeft) : 16 }
        })
        assert.ok(layout.bodyOverflow < 2 && layout.footerOverflow < 2 && layout.padding >= (mobile ? 10 : 16), JSON.stringify(layout))
        assert.ok(new URL(page.url()).pathname.startsWith(mobile ? '/m/' : '/erp/'))
        assert.equal(new URL(page.url()).searchParams.get('link_task'), '300')
        await assertTaskCopy(page, chain.getByRole('button', { name: '复制任务链接', exact: true }), `${new URL(page.url()).origin}/task-link/300`)
        assert.ok(calls.includes('get_task_link'))
        assert.equal(calls.some((method) => /^(complete|block|reject|resume|reassign)_task/u.test(method)), false, 'opening a link never writes a task')
        await page.screenshot({ path: path.join(outputDir, `task-link-${device}-${mode}.png`), fullPage: true })
      },
    }
  })).concat(createTaskLinkRecipientScenarios(deps))
}

function createTaskLinkRecipientScenarios(deps) {
  const { assert, assertNoHorizontalOverflow } = deps
  const roleKeys = ['sales', 'engineering', 'purchase', 'production', 'warehouse', 'quality', 'finance', 'pmc', 'boss']
  const recipients = [...roleKeys, 'assigned-other', 'multi-role', 'login-finance']
  return ['desktop', 'mobile'].flatMap((device) => recipients.map((recipient) => {
    const base = createTaskTrackingScenarios(deps)[0]
    const mobile = device === 'mobile'
    const roles = recipient === 'multi-role' ? ['finance', 'engineering'] : recipient === 'assigned-other' ? ['engineering'] : recipient === 'login-finance' ? ['finance'] : [recipient]
    const canHandle = ['engineering', 'multi-role'].includes(recipient)
    const visibleRoles = recipient === 'boss' ? roleKeys : roles
    const actions = ['workflow.task.read', 'workflow.task.update', 'workflow.task.complete', ...roles.map((role) => `mobile.${role}.access`)]
    if (recipient === 'boss') actions.push('workflow.task.supervise')
    const tasks = roleKeys.map((role, index) => ({
      ...base.workflowTaskFixtures[0],
      id: role === 'engineering' ? 301 : 310 + index,
      task_code: `TASK-LINK-${role.toUpperCase()}`,
      task_name: role === 'engineering' ? '工程资料' : `${role}已处理任务`,
      owner_role_key: role,
      task_status_key: role === 'engineering' ? 'ready' : 'done',
      ...(role === 'engineering' && recipient === 'assigned-other' ? { assignee_id: 9 } : {}),
    }))
    const visibleTasks = tasks.filter((task) => visibleRoles.includes(task.owner_role_key))
    const calls = []
    return {
      ...base,
      name: `task-link-recipient-${device}-${recipient}`,
      path: recipient === 'login-finance' ? `${mobile ? '/m/warehouse/tasks' : '/erp/task-board'}?link_task=300` : '/task-link/300',
      auth: recipient === 'login-finance' ? undefined : 'admin',
      ...(recipient === 'login-finance' ? { expectPath: '/admin-login' } : {}),
      mockAdminRpc: true,
      customerKey: 'yoyoosun',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: { id: 1, is_super_admin: false, roles: roles.map((role) => ({ role_key: role })), permissions: actions, menus: mobile ? [] : [{ path: '/erp/task-board' }] },
      effectiveSession: {
        ...base.effectiveSession,
        roles,
        actions,
        ...(mobile ? { pages: [] } : {}),
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': visibleRoles,
          'workflow.task.update': roles,
          'workflow.task.complete': roles,
        },
      },
      workflowTaskFixtures: tasks,
      beforeNavigate: async (page) => {
        calls.length = 0
        if (mobile) await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari' }))
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          calls.push(body)
          if (body.method !== 'get_task_link') return route.fallback()
          assert.deepEqual(body.params, { task_id: 300 })
          await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: visibleTasks.map((task) => ({ ...task, can_handle: task.id === 301 && canHandle })), truncated: false } } } })
        })
      },
      verify: async (page) => {
        if (recipient === 'login-finance') {
          await page.getByLabel('账号').fill('style-l1-admin')
          await page.locator('#password').fill('style-l1-password')
          await page.getByRole('button', { name: /^登\s*录$/u }).click()
        }
        const chain = page.getByRole('dialog', { name: '任务链', exact: true })
        const drawer = page.locator('.erp-task-action-drawer')
        const handling = mobile ? page.getByTestId('mobile-task-action-screen') : drawer
        if (canHandle) {
          await handling.waitFor({ state: 'visible' })
          await (mobile ? handling.getByRole('heading', { name: '选择处理方式', exact: true }) : handling.locator('.erp-task-action-drawer__action-prompt').getByText('选择处理方式', { exact: true })).waitFor()
          assert.ok(calls.some((call) => call.method === 'get_task' && call.params.task_id === 301))
          if (mobile) {
            await handling.getByRole('button', { name: '返回任务详情', exact: true }).click()
            await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '返回任务列表', exact: true }).click()
          } else await handling.getByRole('button', { name: '返回列表', exact: true }).click()
        }
        await chain.getByRole('heading', { name: '当前待办', exact: true }).waitFor()
        await handling.waitFor({ state: 'hidden' })
        for (const task of tasks) {
          assert.equal(await chain.getByRole('button', { name: task.task_name, exact: true }).count(), visibleTasks.includes(task) ? 1 : 0, `${recipient} must see only permitted tasks`)
        }
        if (!canHandle) assert.equal(calls.some((call) => call.method === 'get_task'), false, 'read-only recipients must not auto-open handling')
        if (recipient === 'assigned-other') {
          await chain.getByRole('button', { name: '工程资料', exact: true }).click()
          if (mobile) {
            const detail = page.getByTestId('mobile-task-detail-screen')
            await detail.waitFor({ state: 'visible' })
            assert.equal(await handling.isVisible(), false)
            await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()
          } else {
            await drawer.waitFor({ state: 'visible' })
            await drawer.locator('#erp-task-action-step-context').waitFor({ state: 'visible' })
            const options = drawer.locator('.erp-task-action-drawer__action-options button')
            await options.first().waitFor({ state: 'attached' })
            assert.equal(await options.count(), 1)
            assert.match(await options.first().textContent(), /催办/u)
            await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
          }
        }
        await waitForFiniteAnimations(page)
        await assertNoHorizontalOverflow(page)
        const { pathname } = new URL(page.url())
        assert.equal(pathname, mobile ? `/m/${roles[0]}/tasks` : '/erp/task-board')
        assert.equal(calls.some((call) => /^(complete|block|reject|resume|reassign)_task/u.test(call.method)), false)
      },
    }
  }))
}
