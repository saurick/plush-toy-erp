import { createTaskTrackingScenarios } from './taskTrackingScenarios.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'

export function createMobileWorkflowTrackingScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  return createTaskTrackingScenarios(deps).slice(0, 2).map((base) => {
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
      effectiveSession: { ...base.effectiveSession, actions, pages: [] },
      beforeNavigate: async (page) => {
        calls.length = 0
        failRefresh = false
        const fixture = readonly ? createTaskTrackingScenarios(deps, { readonly: true })[1] : base
        await fixture.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'list_tracking') calls.push(body.params)
          if (body.method === 'list_tracking' && failRefresh) {
            failRefresh = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '任务进度加载失败', data: {} } } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const tabs = '.mobile-workspace-task-views .ant-segmented'
        const scopes = '.mobile-workflow-tracking > .ant-segmented'
        await page.locator(tabs).getByText('流程跟踪', { exact: true }).waitFor()
        const tabPosition = await page.locator(tabs).boundingBox()
        await verifyMobileNavigationMotion(page, assert, tabs, 2)
        assert.ok(Math.abs((await page.locator(tabs).boundingBox()).y - tabPosition.y) < 1, '任务 Tab 切换时位置稳定')
        const panel = page.getByRole('region', { name: '流程跟踪', exact: true })
        await panel.getByRole('button', { name: '重新读取', exact: true }).click()
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        const scroll = page.getByTestId('mobile-role-scroll')
        const scrollToEnd = () => panel.locator('.mobile-workflow-tracking-more').scrollIntoViewIfNeeded()
        await scrollToEnd()
        await panel.getByRole('button', { name: '重新读取更多', exact: true }).waitFor()
        assert.equal(await panel.locator('[data-mobile-tracking-entry]').count(), 20, '追加失败保留首批记录')
        await panel.getByRole('button', { name: '重新读取更多', exact: true }).click()
        const card = panel.locator('[data-mobile-tracking-entry="process:10"]')
        await card.waitFor()
        assert.match(await card.innerText(), /岗位：工程.*待处理/s)
        await card.scrollIntoViewIfNeeded()
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `mobile-workflow-tracking-${base.themeMode}-list.png`) })
        await card.locator('.erp-task-card__open').click()
        const drawer = page.getByRole('dialog', { name: '任务流转进度', exact: true })
        await drawer.getByText('全部节点处理记录', { exact: true }).waitFor()
        assert.match(await drawer.innerText(), /订单审批.*工程资料/s)
        await assertTaskCopy(page, drawer.getByRole('button', { name: '复制单据编号', exact: true }), 'SO-TRACK-001')
        await drawer.getByRole('button', { name: '加载更早记录', exact: true }).click()
        await drawer.getByText('审批已发起', { exact: true }).waitFor()
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
        if (readonly) assert.equal(await detail.getByRole('button', { name: '处理任务', exact: true }).count(), 0)
        else {
          await detail.getByRole('button', { name: '处理任务', exact: true }).click()
          const action = page.getByTestId('mobile-task-action-screen')
          await action.waitFor()
          await action.getByRole('button', { name: '返回任务', exact: true }).click()
          await detail.waitFor()
        }
        await detail.getByRole('button', { name: '返回流程跟踪', exact: true }).click()
        await drawer.getByText('全部节点处理记录', { exact: true }).waitFor()
        await page.goBack()
        await drawer.waitFor({ state: 'hidden' })
        await card.waitFor()
        assert.ok(await card.isVisible())
        await waitForFiniteAnimations(page)
        assert.ok(await scroll.evaluate((node) => node.scrollTop) > 500, '从任务办理返回保留已读位置')
        await page.waitForFunction(() => document.querySelector('[data-mobile-tracking-entry="process:10"] .erp-task-card__open') === document.activeElement, null, { timeout: 3000 })
        const history = await page.evaluate(() => window.history.state.mobileWorkflowTracking)
        assert.equal(history.selection, null)
        assert.ok(history.scopes.started.loadedCount >= 40)
        await scroll.evaluate((node) => { node.scrollTop = 0 })
        await verifyMobileNavigationMotion(page, assert, scopes, 1)
        const search = panel.getByRole('searchbox', { name: '搜索流转记录' })
        await search.fill('不存在的单据')
        await search.press('Enter')
        await panel.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await panel.getByRole('button', { name: '筛选流程', exact: true }).click()
        const filters = page.getByRole('dialog', { name: '筛选流程', exact: true })
        await filters.locator('.ant-select[aria-label="当前岗位"]').click()
        await page.locator('.ant-select-dropdown:visible').getByText('老板', { exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await verifyMobileNavigationMotion(page, assert, scopes, 0, true)
        assert.equal(await search.inputValue(), '')
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        await search.fill('切换前未提交')
        await panel.getByText('我参与的', { exact: true }).click()
        assert.equal(await search.inputValue(), '不存在的单据')
        await panel.getByRole('button', { name: '筛选流程，已应用 1 项', exact: true }).click()
        assert.match(await filters.innerText(), /老板/)
        await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        assert.equal(await search.inputValue(), '不存在的单据', '重置筛选保留当前搜索')
        await panel.getByText('我发起的', { exact: true }).click()
        assert.equal(await search.inputValue(), '', '切换范围取消未提交搜索')
        assert.ok(calls.some((item) => item.scope === 'participated' && item.owner_role_key === 'boss'))
        assert.equal(calls.some((item) => item.keyword === '切换前未提交'), false)
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
        await assertNoHorizontalOverflow(page, '手机任务管理')
        assert.equal(await scroll.count(), 1)
      },
    }
  })
}
