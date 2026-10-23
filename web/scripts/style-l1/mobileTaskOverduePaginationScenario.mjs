import path from 'node:path'
import { writeFile } from 'node:fs/promises'

export function mobileTaskOverduePaginationScenario({ assert, outputDir }) {
  const now = Math.floor(Date.now() / 1000)
  const makeTask = (id, index, overdue) => ({
    id,
    version: 1,
    task_code: `STYLE-L1-DEADLINE-${id}`,
    task_name: overdue ? `超时模拟任务 ${index}${index === 94 ? ' 跨页末尾核对' : ''}` : `未设截止任务 ${index}`,
    task_group: 'engineering_check',
    owner_role_key: 'engineering',
    task_status_key: overdue && index % 3 === 0 ? 'blocked' : 'ready',
    required_capability_key: 'workflow.task.approve',
    source_type: 'style_task',
    source_id: id,
    source_no: `DEADLINE-${id}`,
    created_at: now - (overdue ? 1000 : 0) - index,
    updated_at: now - index,
    due_at: overdue ? now - 3600 - index : null,
    priority: 3,
    blocked_reason: overdue && index % 3 === 0 ? '等待确认包装资料。' : '',
    handling_note: '核对订单要求并补齐记录。',
    payload: {},
  })
  const undated = Array.from({ length: 65 }, (_, i) => makeTask(200000 + i, i, false))
  const overdue = Array.from({ length: 95 }, (_, i) => makeTask(100000 + i, i, true))
  const permissions = ['mobile.engineering.access', 'workflow.task.read', 'workflow.task.approve']
  let requests = []
  let holdNextOverdue = false
  let releaseHeldRequest
  return {
    name: 'mobile-task-overdue-server-pagination',
    path: '/m/engineering/tasks',
    auth: 'admin',
    customerKey: 'yoyoosun',
    viewport: { width: 393, height: 852 },
    hasTouch: true,
    adminProfile: {
      username: 'style-l1-overdue',
      is_super_admin: false,
      roles: [{ role_key: 'engineering', name: '工程' }],
      permissions,
      menus: [],
    },
    effectiveSession: {
      configRevision: 'style-l1-overdue',
      configHash: 'style-l1-overdue-hash',
      customer: { key: 'yoyoosun', name: '永绅' },
      pages: [],
      actions: permissions,
      workflow_visible_owner_role_keys_by_capability: {
        'workflow.task.read': ['engineering'],
        'workflow.task.approve': ['engineering'],
      },
      fieldPolicies: {},
      workPools: [],
      source: 'active_customer_config_revision',
    },
    workflowTaskFixtures: [
      ...undated,
      ...overdue,
      { ...makeTask(300000, 0, true), owner_role_key: 'quality' },
    ],
    beforeNavigate: async (page) => {
      requests = []
      holdNextOverdue = false
      releaseHeldRequest = null
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON()
        if (body?.method === 'list_role_tasks' && body.params.limit > 1) {
          requests.push(body.params)
          if (holdNextOverdue && body.params.due === 'overdue' && !body.params.cursor) {
            holdNextOverdue = false
            await new Promise((resolve) => { releaseHeldRequest = resolve })
          }
        }
        await route.fallback()
      })
    },
    verify: async (page) => {
      const rows = page.locator('[data-mobile-task-id]')
      const ids = () => rows.evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.mobileTaskId)))
      const waitFirst = (id) => page.waitForFunction((expected) => Number(document.querySelector('[data-mobile-task-id]')?.dataset.mobileTaskId) === expected, id)
      const latestQuery = () => requests.at(-1)
      const taskAll = page.getByTestId('mobile-role-filter-all')
      const taskOverdue = page.getByTestId('mobile-role-filter-overdue')
      const riskAll = page.getByTestId('mobile-role-risk-filter-warning')
      const riskOverdue = page.getByTestId('mobile-role-risk-filter-notice')
      const trigger = page.getByTestId('mobile-task-list-filter-trigger')
      const expandAll = async (count) => {
        for (let attempt = 0; await rows.count() < count && attempt < 30; attempt++) {
          const previous = await rows.count()
          await page.locator('.mobile-role-list-control__button').click()
          await page.waitForFunction((before) => document.querySelectorAll('[data-mobile-task-id]').length > before, previous)
        }
        assert.equal(await rows.count(), count, '完整查询结果可跨页展开')
        assert.equal(new Set(await ids()).size, count, '追加没有重复任务')
      }
      const openFilters = async () => {
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: /^筛选(任务|风险)$/ })
        await dialog.waitFor()
        return dialog
      }
      const closeFilters = (dialog) => dialog.getByRole('button', { name: '关闭筛选', exact: true }).click()
      const chooseDue = async (label) => {
        const dialog = await openFilters()
        await dialog.getByRole('group', { name: '截止时间', exact: true }).getByRole('button', { name: label, exact: true }).click()
        await closeFilters(dialog)
      }
      const assertOverdueQuery = () => {
        assert.equal(latestQuery().view_key, 'risk')
        assert.equal(latestQuery().due, 'overdue')
        assert(!latestQuery().cursor, '切换筛选重新查询第一页')
      }
      const assertWidth = async (name) => {
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        assert(overflow <= 1, `${name} 不产生横向溢出`)
        await page.screenshot({ path: path.join(outputDir, `${name}.png`) })
      }

      await waitFirst(200000)
      assert.match(await taskOverdue.innerText(), /95/u, '超时总量来自服务端')
      await taskOverdue.click()
      await waitFirst(100000)
      assertOverdueQuery()
      assert(!(await page.locator('body').innerText()).includes('当前筛选下暂无任务'))
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务', '快捷项不重复计入额外条件')
      await expandAll(95)
      assert.deepEqual(await ids(), overdue.map((task) => task.id))
      const pages = requests.filter((query) => query.due === 'overdue')
      assert.equal(pages.length, 2, '95 条超时按 50 条一批查询')
      assert(pages[1].cursor && pages[1].due === 'overdue', '后续分页保留超时条件')

      await rows.last().locator('.erp-task-card__open').click()
      const detail = page.getByTestId('mobile-task-detail-screen')
      await detail.getByRole('heading', { name: overdue.at(-1).task_name, exact: true }).waitFor()
      await page.reload()
      await detail.getByRole('heading', { name: overdue.at(-1).task_name, exact: true }).waitFor()
      await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()
      await page.waitForFunction(() => document.querySelectorAll('[data-mobile-task-id]').length === 95)
      assert.equal(await taskOverdue.getAttribute('aria-pressed'), 'true')
      await page.reload()
      await waitFirst(100000)
      assert.equal(await taskOverdue.getAttribute('aria-pressed'), 'true')
      await expandAll(95)
      assert.deepEqual(await ids(), overdue.map((task) => task.id), '刷新恢复超时条件，后续分页持续使用同一条件')

      await taskAll.click()
      await waitFirst(200000)
      holdNextOverdue = true
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.params?.due === 'overdue' && request.postDataJSON()?.params?.limit === 50),
        taskOverdue.click(),
      ])
      await taskAll.click()
      await waitFirst(200000)
      assert.equal(typeof releaseHeldRequest, 'function')
      const oldResponse = page.waitForResponse((response) => response.request().postDataJSON()?.params?.due === 'overdue')
      releaseHeldRequest()
      await oldResponse
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      assert.equal((await ids())[0], 200000, '迟到超时响应不能覆盖已切回的全部列表')
      assert.equal(await taskAll.getAttribute('aria-pressed'), 'true')

      await taskOverdue.click()
      await waitFirst(100000)
      await page.getByTestId('mobile-role-nav-messages').click()
      await waitFirst(200000)
      assert.equal(await riskAll.getAttribute('aria-pressed'), 'true', '风险页不继承任务页的超时条件')
      await riskOverdue.click()
      await waitFirst(100000)
      assertOverdueQuery()
      await expandAll(95)
      assert.deepEqual(await ids(), overdue.map((task) => task.id), '风险页超时同样完整分页')

      await chooseDue('未设置到期')
      await waitFirst(200000)
      assert.equal(latestQuery().due, 'noDue')
      assert.equal(await riskOverdue.getAttribute('aria-pressed'), 'false')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await waitFirst(100000)
      assert.equal(await taskOverdue.getAttribute('aria-pressed'), 'true', '任务页保持自己的超时查询')
      await page.getByTestId('mobile-role-nav-messages').click()
      await waitFirst(200000)
      assert.equal(latestQuery().due, 'noDue', '返回风险页恢复其独立截止条件')

      await riskOverdue.click()
      await waitFirst(100000)
      const dialog = await openFilters()
      await dialog.getByText('阻塞', { exact: true }).click()
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-role-risk-filter-notice"]')?.textContent.includes('32'))
      await closeFilters(dialog)
      assert.equal(latestQuery().due, 'overdue')
      assert.equal(latestQuery().status_key, 'blocked')
      assert(!latestQuery().cursor)
      await expandAll(32)
      assert.deepEqual(await ids(), overdue.filter((task) => task.task_status_key === 'blocked').map((task) => task.id))
      const resetDialog = await openFilters()
      await resetDialog.getByRole('button', { name: '重置筛选', exact: true }).click()
      await closeFilters(resetDialog)
      await waitFirst(100000)
      assert.equal(await riskOverdue.getAttribute('aria-pressed'), 'true', '面板重置保留超时快捷项')
      assert.equal(latestQuery().due, 'overdue')
      assert(!latestQuery().status_key)

      const search = page.getByRole('searchbox')
      await search.fill('跨页末尾核对')
      await search.press('Enter')
      await waitFirst(100094)
      assert.equal(await rows.count(), 1)
      assert.equal(latestQuery().keyword, '跨页末尾核对')
      assert.equal(latestQuery().due, 'overdue')
      assert(!latestQuery().cursor)
      await search.fill('没有匹配的超时任务')
      await search.press('Enter')
      await page.getByText('暂无超时任务', { exact: true }).waitFor()
      assert.equal(await rows.count(), 0)
      assert.match(await riskOverdue.innerText(), /0/u)
      await search.fill('')
      await search.press('Enter')
      await waitFirst(100000)
      for (const width of [393, 320]) {
        await page.setViewportSize({ width, height: 852 })
        await assertWidth(`overdue-risk-${width}`)
        await page.getByTestId('mobile-role-nav-tasks').click()
        await waitFirst(100000)
        await assertWidth(`overdue-tasks-${width}`)
        await page.getByTestId('mobile-role-nav-messages').click()
        await waitFirst(100000)
      }
      assert(!(await ids()).includes(300000), '跨页查询保留岗位可见范围')
      await writeFile(path.join(outputDir, 'overdue-pagination-requests.json'), JSON.stringify(requests, null, 2))
    },
  }
}
