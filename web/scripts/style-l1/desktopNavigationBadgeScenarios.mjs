import { writeFile } from 'node:fs/promises'
import { buildWorkflowTaskBoardMock } from '../../src/mocks/workflowTaskBoardMock.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { clickERPThemeOption } from './themeAssertions.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDesktopNavigationBadgeScenarios({ assert, assertNoHorizontalOverflow, outputDir, path, customerRuntimeEffectiveSession }) {
  const permissions = ['workflow.task.read', 'workflow.task.complete', 'workflow.task.update', 'sales.order.read']
  const fixtures = ['ready', 'blocked', 'ready', 'done'].map((status, index) => ({
    id: 8701 + index,
version: 1,
task_code: `BADGE-${index + 1}`,
    task_name: ['核对样品尺寸', '处理面料阻塞', '确认样品交期', '已完成的任务'][index],
    task_group: 'material_check',
source_type: 'sales_order',
source_id: 101,
    source_no: 'SO-DEMO-101',
owner_role_key: 'sales',
task_status_key: status,
    due_at: index === 2 ? Math.floor(Date.now() / 1000) + 3600 : null,
    blocked_reason: index === 1 ? '等待确认材料' : '',
    created_at: 1788840000,
payload: {},
  }))
  const scenarios = ['light', 'dark'].map((themeMode) => {
    let tasks; let fail; let releaseCount; let
holdCount
    const requests = []
    const name = `desktop-nav-badges-${themeMode}`
    return {
      name,
path: '/erp/task-board',
auth: 'admin',
customerKey: 'yoyoosun',
themeMode,
      viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
      adminProfile: { id: 7, username: name, is_super_admin: false, roles: [{ role_key: 'sales' }], permissions, menus: ['/erp/task-board'], erp_preferences: { appearance: { theme_mode: themeMode } } },
      effectiveSession: { ...customerRuntimeEffectiveSession,
pages: ['task-board'],
actions: permissions,
        workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['sales'], 'workflow.task.complete': ['sales'], 'workflow.task.update': ['sales'] } },
      workflowTaskFixtures: fixtures,
      beforeNavigate: async (page) => {
        tasks = structuredClone(fixtures)
        requests.length = 0
        fail = false
        holdCount = new Promise((resolve) => { releaseCount = resolve })
        await page.route('**/rpc/workflow', async (route) => {
          const { method, params = {}, id } = route.request().postDataJSON()
          const respond = (result) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result }) })
          if (method === 'complete_task_action') {
            const task = tasks.find((item) => item.id === params.task_id)
            assert.equal(params.expected_version, task.version)
            task.task_status_key = 'done'
            task.version += 1
            return respond({ code: 0, data: { task } })
          }
          if (method !== 'get_task_board') return route.fallback()
          requests.push(params)
          if (params.todo_only && params.limit === 1) {
            await holdCount
            if (fail) return respond({ code: 50000, message: '模拟数量读取失败' })
          }
          return respond({ code: 0, data: buildWorkflowTaskBoardMock({ tasks, params, snapshotAt: Math.floor(Date.now() / 1000) }) })
        })
      },
      verify: async (page) => {
        const nav = page.locator('.erp-admin-sider')
        const menu = nav.getByRole('menuitem', { name: '任务看板', exact: true })
        const badge = menu.locator('.erp-menu-task-label .navigation-count-badge')
        await badge.waitFor()
        assert.equal(await badge.textContent(), '…')
        releaseCount()
        const expectCount = async (text) => {
          await page.waitForFunction((expected) => document.querySelector('.erp-admin-sider .erp-menu-task-label .navigation-count-badge')?.textContent === expected, text)
        }
        await expectCount('3')
        if (themeMode === 'dark') await clickERPThemeOption(page, '暗色')
        await page.waitForFunction((mode) => document.documentElement.dataset.erpTheme === mode, themeMode)
        await menu.click()
        await page.waitForURL('**/erp/task-board?mode=todo')
        await page.locator('.erp-task-board-lanes--todo .erp-task-board-card').first().waitFor()
        assert.equal(await page.locator('.erp-task-board-lane--finished').count(), 0)
        if (themeMode === 'light') {
          await verifyMobileNavigationMotion(page, assert, '.erp-task-board-scope-filter .erp-sliding-segmented', 1)
          await page.locator('.erp-task-board-lane--finished').waitFor()
          await verifyMobileNavigationMotion(page, assert, '.erp-task-board-scope-filter .erp-sliding-segmented', 0, true)
          assert.equal(await page.locator('.erp-task-board-lane--finished').count(), 0)
        }
        const reads = requests.length
        await menu.click()
        await page.waitForTimeout(350)
        assert.equal(requests.length, reads, 'active menu clicks must not duplicate reads')
        assert.equal(await badge.textContent(), '3', 'viewing cannot clear a pending count')
        const paints = await badge.evaluate((el) => { const s = getComputedStyle(el); return { foreground: s.color, background: s.backgroundColor } })
        // Transparent fills are composited by Ant Design; assert text contrast against the actual menu surface below.
        const surface = await nav.evaluate((el) => getComputedStyle(el).backgroundColor)
        const fg = parseRgb(paints.foreground)
        const bg = parseRgb(surface)
        if (fg && bg && bg.a !== 0) assert(getContrastRatio(fg, bg) >= 3, `${name}: count must be readable`)
        await assertNoHorizontalOverflow(page, name)
        await page.screenshot({ path: path.join(outputDir, `${name}-expanded.png`) })
        if (themeMode === 'light') {
          const card = page.locator('.erp-task-board-card').filter({ hasText: '核对样品尺寸' }).first()
          await card.click()
          const drawer = page.locator('.erp-task-action-drawer')
          await drawer.waitFor()
          await drawer.getByRole('button', { name: '选择处理方式', exact: true }).click()
          await drawer.getByRole('radio', { name: /处理完成/ }).click()
          await drawer.getByRole('tab', { name: /确认与结果/ }).click()
          await drawer.locator('.erp-task-action-drawer__footer-primary button').click()
          await expectCount('2')
          await drawer.getByRole('button', { name: '完成并关闭', exact: true }).click()
        }
        tasks = Array.from({ length: 128 }, (_, index) => ({ ...fixtures[0], id: 9000 + index }))
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        await expectCount('99+')
        assert.match(await menu.getAttribute('aria-description'), /128 项/)
        await page.getByRole('button', { name: '收起侧边菜单', exact: true }).click()
        const collapsedBadge = menu.locator('.erp-menu-task-icon .navigation-count-badge')
        await collapsedBadge.waitFor()
        await nav.evaluate(async (el) => {
          await Promise.allSettled(el.getAnimations({ subtree: true }).map((animation) => animation.finished))
        })
        const geometry = await collapsedBadge.evaluate((el) => {
          const b = el.getBoundingClientRect(); const m = el.closest('.ant-menu-item').getBoundingClientRect(); const
s = el.closest('.erp-admin-sider').getBoundingClientRect()
          return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, menuTop: m.top, menuBottom: m.bottom, siderRight: s.right, width: b.width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth, opacity: getComputedStyle(el).opacity, display: getComputedStyle(el).display, iconHeight: el.parentElement.getBoundingClientRect().height, iconHTML: el.parentElement.outerHTML }
        })
        await writeFile(path.join(outputDir, `${name}-geometry.json`), JSON.stringify(geometry, null, 2))
        assert(geometry.right <= geometry.siderRight && geometry.top >= geometry.menuTop && geometry.bottom <= geometry.menuBottom && geometry.width >= 24, `collapsed count clipped: ${JSON.stringify(geometry)}`)
        assert(geometry.scrollWidth <= geometry.clientWidth)
        assert.equal(geometry.opacity, '1', 'collapsed menu must not hide the badge as label text')
        await page.screenshot({ path: path.join(outputDir, `${name}-collapsed.png`) })
        await page.getByRole('button', { name: '展开侧边菜单', exact: true }).click()
        fail = true
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        await expectCount('99+↻')
        assert.match(await badge.getAttribute('title'), /数量待更新/)
        fail = false
        await menu.click()
        await expectCount('99+')
        tasks = []
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        await badge.waitFor({ state: 'detached' })
        assert.equal(await menu.locator('.navigation-count-badge').count(), 0)
        await assertNoHorizontalOverflow(page, name)
      },
    }
  })
  scenarios.push({
    name: 'dev-control-count-badges',
path: '/__dev/ui-design?page=controls&control=counts',
    viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
    verify: async (page) => {
      const stage = page.locator('.erp-control-library-stage')
      await page.getByRole('heading', { name: '数字提醒', exact: true }).waitFor()
      await stage.getByRole('button', { name: /任务看板/ }).click()
      await stage.getByRole('heading', { name: '待我处理 · 3 项' }).waitFor()
      await stage.getByRole('button', { name: '办理一项' }).click()
      await stage.getByRole('heading', { name: '待我处理 · 2 项' }).waitFor()
      await stage.getByText('大数量', { exact: true }).click()
      assert.equal(await stage.locator('.erp-control-count-entry .navigation-count-badge').textContent(), '99+')
      await stage.getByText('失败', { exact: true }).click()
      await stage.getByRole('button', { name: '重新读取数量' }).click()
      assert.equal(await stage.locator('.erp-control-count-entry .navigation-count-badge').textContent(), '3')
      await stage.getByText('零项', { exact: true }).click()
      await stage.getByText('当前没有待办', { exact: true }).waitFor()
      assert.equal(await stage.locator('.erp-control-count-entry .navigation-count-badge').count(), 0)
      await stage.getByText('3 项', { exact: true }).click()
      await assertNoHorizontalOverflow(page, 'dev-control-count-badges')
      await page.screenshot({ path: path.join(outputDir, 'dev-control-count-badges-4k.png') })
    },
  })
  return scenarios
}
