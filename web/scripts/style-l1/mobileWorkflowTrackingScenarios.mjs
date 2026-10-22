import { assertMobileBackToTop } from './mobileBackToTopAssertions.mjs'
import { assertTrackingNavigation, assertTrackingExceptionContext, createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertTaskCopy, clickTaskCardContent } from './taskCopyAssertions.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'
import { assertMobileFilterSummary, assertMobileFilterClearControl } from './mobileFilterConsistencyAssertions.mjs'

export function createMobileWorkflowTrackingScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const scenarios = createTaskTrackingScenarios(deps).slice(0, 2).map((base) => {
    const readonly = base.themeMode === 'dark'
    const actions = ['mobile.engineering.access', ...base.adminProfile.permissions.filter((action) => !readonly || !['workflow.task.update', 'workflow.task.complete'].includes(action))]
    const calls = []
    let failRefresh = false
    return {
      ...base,
      name: `mobile-workflow-tracking-${base.themeMode}`,
      path: '/m/engineering/tasks',
      customerKey: 'yoyoosun',
      viewport: { width: readonly ? 320 : 390, height: 844 },
      deviceScaleFactor: 2,
      adminProfile: { ...base.adminProfile, permissions: actions, menus: [] },
      effectiveSession: { ...base.effectiveSession, actions, pages: [], workflow_visible_owner_role_keys_by_capability: { ...base.effectiveSession.workflow_visible_owner_role_keys_by_capability, 'workflow.task.read': ['engineering', 'warehouse'] } },
      beforeNavigate: async (page) => {
        calls.length = 0
        failRefresh = false
        const fixture = readonly ? createTaskTrackingScenarios(deps, { readonly: true })[1] : base
        await fixture.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'list_tracking') calls.push(body.params)
          if (body.method === 'list_tracking' && body.params.keyword === 'PO-MR-25-221') {
            const items = body.params.scope === 'visible' ? [{ kind: 'task', id: 99122, process_key: '', title: '采购到货点数', source_type: 'purchase_order', source_id: 221, source_no: 'PO-MR-25-221', status: 'ready', started_at: 1791367200, updated_at: 1791367200, completed_at: null, resolution_kind: null, initiator_name: '', initiator_role_key: '', current_tasks: [{ task_id: 99122, task_name: '采购到货点数', node_instance_id: null, owner_role_key: 'warehouse', assignee_name: '', status: 'ready', created_at: 1791367200, completed_at: null, due_at: null }], display_context: null }] : []
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data: { items, total: items.length, status_counts: { active: items.length, completed: 0 }, limit: body.params.limit, offset: 0 } } } })
          }
          if (body.method === 'list_tracking' && failRefresh) {
            failRefresh = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '任务进度加载失败', data: {} } } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const tabs = '.mobile-workspace-task-views .erp-sliding-tab-list'
        const chooseScope = async (label) => {
          await panel.getByRole('button', { name: /^筛选流程/u }).click()
          const filters = page.getByRole('dialog', { name: '筛选流程', exact: true })
          await waitForFiniteAnimations(page)
          await filters.getByRole('group', { name: '跟踪范围', exact: true }).getByRole('button', { name: label, exact: true }).click()
          await filters.waitFor({ state: 'hidden' })
        }
        await page.locator(tabs).getByText('流程跟踪', { exact: true }).waitFor()
        const tabPosition = await page.locator(tabs).boundingBox()
        await verifyMobileNavigationMotion(page, assert, tabs, 2)
        assert.ok(Math.abs((await page.locator(tabs).boundingBox()).y - tabPosition.y) < 1, '任务 Tab 切换时位置稳定')
        const panel = page.getByRole('region', { name: '流程跟踪', exact: true })
        await panel.getByRole('button', { name: '重新读取', exact: true }).click()
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        assert.equal(calls[0].scope, 'visible', '默认查询权限内相关流程')
        const statusCounts = () => panel.getByRole('group', { name: '流转状态', exact: true }).locator('.erp-filter-chip__count').allTextContents()
        assert.deepEqual(await statusCounts(), ['161', '1', '160'])
        const quick = panel.getByRole('group', { name: '流转状态', exact: true })
        const activeStatus = quick.getByRole('button', { name: /^进行中/ })
        await activeStatus.click()
        await activeStatus.locator('.erp-filter-chip__clear').waitFor()
        await activeStatus.click()
        assert.equal(await activeStatus.getAttribute('aria-pressed'), 'false', '再次点击流程状态恢复全部')
        const sourceSearch = panel.getByRole('searchbox', { name: '搜索流转记录' })
        await sourceSearch.fill('PO-MR-25-221')
        await sourceSearch.press('Enter')
        await panel.locator('[data-mobile-tracking-entry="task:99122"]').waitFor()
        assert.deepEqual(await statusCounts(), ['1', '1', '0'])
        assert.match(await panel.locator('[data-mobile-tracking-entry="task:99122"]').innerText(), /采购订单 · PO-MR-25-221/u)
        for (const label of ['我发起的', '我参与的']) {
          await chooseScope(label)
          await sourceSearch.fill('PO-MR-25-221')
          await sourceSearch.press('Enter')
          await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
          await sourceSearch.fill('')
          await sourceSearch.press('Enter')
          await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        }
        await chooseScope('相关流程')
        assert.equal(await sourceSearch.inputValue(), 'PO-MR-25-221', '相关流程独立恢复搜索')
        await panel.locator('[data-mobile-tracking-entry="task:99122"]').waitFor()
        assert.match(await panel.locator('[data-mobile-tracking-entry="task:99122"]').innerText(), /采购订单 · PO-MR-25-221/u)
        await page.screenshot({ path: path.join(outputDir, `mobile-related-workflow-search-${base.themeMode}.png`) })
        await chooseScope('我发起的')
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        const historicalInitiator = panel.locator('[data-mobile-tracking-entry]').first().locator('.erp-workflow-initiator')
        assert.match(await historicalInitiator.innerText(), /业务小李.*发起岗位：未记录/s)
        assert.equal(await historicalInitiator.locator('small').isVisible(), true)
        const scroll = page.getByTestId('mobile-role-scroll')
        const scrollToEnd = () => panel.locator('.mobile-workflow-tracking-more').scrollIntoViewIfNeeded()
        await scrollToEnd()
        await panel.getByRole('button', { name: '重新读取更多', exact: true }).waitFor()
        assert.equal(await panel.locator('[data-mobile-tracking-entry]').count(), 20, '追加失败保留首批记录')
        await panel.getByRole('button', { name: '重新读取更多', exact: true }).click()
        const card = panel.locator('[data-mobile-tracking-entry="process:10"]')
        await card.waitFor()
        assert.match(await card.innerText(), /岗位：工程.*待处理/s)
        assert.match(await card.locator('.erp-workflow-initiator').innerText(), /业务小李.*发起岗位：业务/s)
        await card.scrollIntoViewIfNeeded()
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `mobile-workflow-tracking-${base.themeMode}-list.png`) })
        await clickTaskCardContent(card, card.getByText('销售订单受理', { exact: true }))
        const drawer = page.getByRole('dialog', { name: '流程跟踪', exact: true })
        await drawer.getByText('全部节点处理记录', { exact: true }).waitFor()
        await assertTrackingNavigation(page, assert, drawer)
        await assertTrackingExceptionContext(page, assert, drawer, path.join(outputDir, `tracking-exceptions-mobile-${base.themeMode}.png`))
        assert.match(await drawer.innerText(), /订单审批.*工程资料/s)
        await assertTaskCopy(page, drawer.getByRole('button', { name: '复制单据编号', exact: true }), 'SO-TRACK-001')
        await drawer.getByRole('button', { name: '加载更早记录', exact: true }).click()
        await drawer.getByText('审批已发起', { exact: true }).waitFor()
        const trackingViewport = page.viewportSize()
        await page.setViewportSize({ ...trackingViewport, height: 600 })
        assert(await assertMobileBackToTop(page, drawer.locator('.ant-drawer-body')), '小屏流程长历史支持回顶')
        await page.setViewportSize(trackingViewport)
        await assertNoHorizontalOverflow(page, '手机任务流转详情')
        await page.screenshot({ path: path.join(outputDir, `mobile-workflow-tracking-${base.themeMode}-detail.png`) })
        assert.equal(await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).getByRole('button').count(), 0)
        const taskEntry = drawer.locator('.ant-drawer-footer').getByRole('button', { name: readonly ? '查看任务' : '去处理工程资料', exact: true })
        await taskEntry.click()
        await drawer.getByRole('alert').waitFor()
        await taskEntry.click()
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.waitFor()
        assert.equal(await drawer.isVisible(), false)
        if (readonly) assert.equal(await detail.getByRole('button', { name: '选择处理方式', exact: true }).count(), 0)
        else {
          await detail.getByRole('button', { name: '选择处理方式', exact: true }).click()
          const action = page.getByTestId('mobile-task-action-screen')
          await action.waitFor()
          assert.equal(await action.getByRole('button', { name: '返回任务', exact: true }).count(), 0)
          await action.getByRole('button', { name: '返回任务详情', exact: true }).click()
          await detail.waitFor()
        }
        await detail.getByRole('button', { name: '返回流程跟踪', exact: true }).click()
        await drawer.getByText('全部节点处理记录', { exact: true }).waitFor()
        await drawer.locator('.ant-drawer-header').getByRole('button', { name: '返回列表', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await card.waitFor()
        assert.ok(await card.isVisible())
        await waitForFiniteAnimations(page)
        assert.ok(await scroll.evaluate((node) => node.scrollTop) > 500, '从任务办理返回保留已读位置')
        await page.waitForFunction(() => document.querySelector('[data-mobile-tracking-entry="process:10"] .erp-task-card__open') === document.activeElement, null, { timeout: 3000 })
        const history = await page.evaluate(() => window.history.state.mobileWorkflowTracking)
        assert.equal(history.selection, null)
        assert.ok(history.scopes.started.loadedCount >= 40)
        await clickTaskCardContent(card, card.getByText('销售订单受理', { exact: true }))
        await drawer.getByText('全部节点处理记录', { exact: true }).waitFor()
        await page.goBack()
        await drawer.waitFor({ state: 'hidden' })
        await scroll.evaluate((node) => { node.scrollTop = 0 })
        await chooseScope('我参与的')
        const search = panel.getByRole('searchbox', { name: '搜索流转记录' })
        await search.fill('不存在的单据')
        await search.press('Enter')
        await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await panel.getByRole('button', { name: '筛选流程', exact: true }).click()
        const filters = page.getByRole('dialog', { name: '筛选流程', exact: true })
        await waitForFiniteAnimations(page)
        assert.equal(await filters.getByRole('textbox').count(), 0, '岗位与单据类型固定选项直接平铺，无搜索框')
        await filters.getByRole('group', { name: '当前岗位', exact: true }).getByRole('button', { name: '老板', exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await assertMobileFilterSummary({ assert, trigger: panel.locator('.mobile-filter-trigger') })
        await chooseScope('我发起的')
        assert.equal(await search.inputValue(), '')
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        await search.fill('独立范围搜索')
        await search.press('Enter')
        await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await chooseScope('我参与的')
        assert.equal(await search.inputValue(), '不存在的单据')
        await activeStatus.click()
        const applied = panel.getByRole('group', { name: '当前流程筛选', exact: true })
        await assertMobileFilterSummary({ assert, trigger: panel.locator('.mobile-filter-trigger') })
        assert.equal(await applied.count(), 0, '流程条件不再另占标签行')
        await assertMobileFilterClearControl({ assert, trigger: panel.locator('.mobile-filter-trigger') })
        await page.screenshot({ path: path.join(outputDir, `mobile-filter-clear-tracking-${base.themeMode}.png`) })
        await panel.getByRole('button', { name: '清空流程筛选', exact: true }).press('Space')
        assert.equal(await search.inputValue(), '不存在的单据', '清空流程筛选保留当前范围搜索')
        assert.equal(await activeStatus.getAttribute('aria-pressed'), 'true', '清空额外条件保留快捷状态')
        assert.equal(await panel.getByRole('button', { name: '筛选流程', exact: true }).count(), 1)
        assert.equal(calls.at(-1).scope, 'participated', '清空保留跟踪范围')
        await panel.getByRole('button', { name: '筛选流程', exact: true }).click()
        await filters.getByRole('group', { name: '当前岗位', exact: true }).getByRole('button', { name: '老板', exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await panel.getByRole('button', { name: '筛选流程，已应用 1 项', exact: true }).click()
        await filters.waitFor({ state: 'visible' })
        await waitForFiniteAnimations(page)
        assert.match(await filters.innerText(), /老板/)
        await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        assert.equal(await search.inputValue(), '不存在的单据', '重置筛选保留当前搜索')
        assert.equal(await activeStatus.getAttribute('aria-pressed'), 'true', '面板重置保留快捷状态')
        await chooseScope('我发起的')
        assert.equal(await search.inputValue(), '独立范围搜索', '范围切换恢复原搜索')
        await search.fill('')
        await search.press('Enter')
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        assert.ok(calls.some((item) => item.scope === 'participated' && item.owner_role_key === 'boss'))
        assert.equal(calls.some((item) => item.scope === 'participated' && item.keyword === '独立范围搜索'), false, '旧范围搜索不进入新范围')
        assert.equal(calls.some((item) => item.scope === 'started' && item.owner_role_key === 'boss'), false)
        await page.locator(tabs).getByText('已办', { exact: true }).click()
        await page.locator('.mobile-task-history').waitFor()
        await page.locator(tabs).getByText('流程跟踪', { exact: true }).click()
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        const loadedBeforeRefresh = await panel.locator('[data-mobile-tracking-entry]').count()
        failRefresh = true
        await pullToRefresh(page, scroll)
        await panel.getByRole('button', { name: '重新读取', exact: true }).waitFor()
        assert.equal(await panel.locator('[data-mobile-tracking-entry]').count(), loadedBeforeRefresh, '刷新失败保留当前记录')
        await panel.getByRole('button', { name: '重新读取', exact: true }).click()
        await panel.getByRole('button', { name: '重新读取', exact: true }).waitFor({ state: 'hidden' })
        await pullToRefresh(page, scroll)
        await page.getByText('任务进度已刷新', { exact: true }).waitFor()
        await panel.getByRole('button', { name: '筛选流程', exact: true }).click()
        assert.equal(await filters.locator('input, select, textarea').count(), 0)
        assert.equal(await filters.getByRole('group', { name: '单据类型', exact: true }).count(), 0)
        assert.equal(await filters.getByRole('button', { name: '自定义发起日期', exact: true }).count(), 0)
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await page.evaluate(() => {
          const history = window.history.state
          const tracking = history.mobileWorkflowTracking
          tracking.scopes[tracking.scope].query = { ...tracking.scopes[tracking.scope].query, source_type: 'sales_order', date_from: '2026-09-01', date_to: '2026-09-30' }
          window.history.replaceState(history, '')
        })
        await page.reload()
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        assert(calls.slice(-1).every((query) => !query.source_type && !query.date_from && !query.date_to), '刷新不带回撤下的分类和日期')
        await assertNoHorizontalOverflow(page, '手机任务管理')
        assert.equal(await scroll.count(), 1)
      },
    }
  })
  return [...scenarios, ...scenarios.map((base) => ({
    ...base,
    name: `mobile-workflow-exceptions-${base.themeMode}`,
    beforeNavigate: async (page) => {
      await base.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method !== 'list_exceptions') return route.fallback()
        const items = ['open', 'executing', 'open', 'closed'].map((state, index) => ({ key: `quality:${index + 1}`, number: `STYLE-L1-EX-${index + 1}`, state, reason: '筛选密度验证', tasks: [], task_ids: [], orders: [] }))
        const { state, keyword = '' } = body.params
        const matching = items.filter((item) => (!state || (state === 'closed' ? item.state === 'closed' : item.state !== 'closed')) && (!keyword || item.reason.includes(keyword) || item.number.includes(keyword)))
        return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data: { items: matching, total: matching.length, view_total: matching.length, open: 3, closed: 1, tasks: [], orders: [], pending_tasks: 0, affected_orders: 0 } } } })
      })
    },
    verify: async (page) => {
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page.locator('.mobile-workspace-task-views').getByText('流程跟踪', { exact: true }).click()
      await page.locator('.mobile-workspace-tracking-views').getByText('异常跟踪', { exact: true }).click()
      const panel = page.locator('.mobile-workspace-exceptions .workflow-exceptions')
      await panel.getByText('STYLE-L1-EX-1', { exact: true }).waitFor()
      const search = panel.getByRole('searchbox', { name: '搜索异常单号、订单、批次或原因', exact: true })
      const statuses = panel.getByRole('group', { name: '异常处理状态', exact: true })
      const clear = panel.getByRole('button', { name: '清空异常筛选', exact: true })
      assert.equal(await clear.count(), 0)
      await search.fill('密度')
      await search.press('Enter')
      await statuses.getByRole('button', { name: /^未处理完/ }).click()
      await page.waitForFunction(() => document.querySelectorAll('.mobile-workspace-exceptions .workflow-exceptions__item').length === 3)
      assert.equal(await clear.count(), 0, '仅快捷状态不重复提供全局清空')
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        const geometry = await panel.evaluate((root) => {
          const rect = (selector) => root.querySelector(selector).getBoundingClientRect().toJSON()
          return { input: rect('input'), selected: rect('button[aria-pressed="true"]'), controls: rect('.workflow-exceptions__controls'), overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
        })
        assert(geometry.input.width >= 44 && geometry.selected.width >= 44 && geometry.selected.height >= 44, JSON.stringify(geometry))
        assert(geometry.controls.height <= 110 && geometry.overflow <= 1, JSON.stringify(geometry))
      }
      await page.screenshot({ path: path.join(outputDir, `mobile-exception-clear-${base.themeMode}.png`) })
      await page.locator('.mobile-workspace-tracking-views').getByText('流程进度', { exact: true }).click()
      const trackingSearch = page.getByRole('searchbox', { name: '搜索流转记录', exact: true })
      await trackingSearch.fill('流程对照')
      await trackingSearch.press('Enter')
      await page.locator('.mobile-workspace-tracking-views').getByText('异常跟踪', { exact: true }).click()
      assert.equal(await search.inputValue(), '密度')
      assert.equal(await statuses.getByRole('button', { name: /^未处理完/ }).getAttribute('aria-pressed'), 'true')
      const selectedStatus = statuses.getByRole('button', { name: /^未处理完/ })
      assert.equal(await selectedStatus.locator('.erp-filter-chip__clear').count(), 1, '选中状态提供就地取消反馈')
      await selectedStatus.press('Enter')
      await page.waitForFunction(() => document.querySelectorAll('.mobile-workspace-exceptions .workflow-exceptions__item').length === 4)
      assert.equal(await search.inputValue(), '密度', '取消快捷状态保留异常搜索')
      assert.equal(await clear.count(), 0)
      assert(await selectedStatus.evaluate((button) => document.activeElement === button), '取消后保留快捷项焦点')
      assert.equal(await statuses.getByRole('button', { name: /^全部异常/ }).getAttribute('aria-pressed'), 'true')
      await page.reload()
      assert.equal(await search.inputValue(), '密度')
      assert.equal(await clear.count(), 0)
      await page.locator('.mobile-workspace-tracking-views').getByText('流程进度', { exact: true }).click()
      assert.equal(await trackingSearch.inputValue(), '流程对照', '异常清空不改变流程页签')
      await assertNoHorizontalOverflow(page, '手机跟踪页签切换')
    },
  }))]
}
