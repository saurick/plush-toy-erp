import { createTaskDrawerAppearanceScenarios } from './taskDrawerAppearanceScenarios.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function workflowExceptionScenario(deps) {
  const { assert, path, outputDir } = deps
  const base = createTaskDrawerAppearanceScenarios(deps)[0]
  const task = base.workflowTaskFixtures[0]
  const reads = []
  let failNext = false
  return {
    ...base,
    name: 'erp-workflow-exceptions',
    path: '/erp/task-board?view=exceptions',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      reads.length = 0
      failNext = false
      await page.route('**/rpc/workflow', (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_exceptions') return route.fallback()
        reads.push(params)
        if (failNext) {
          failNext = false
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '暂时无法读取异常跟踪信息', data: null } } })
        }
        const order = { id: 1, number: 'SO-EXCEPTION-001' }
        const scopedItems = Array.from({ length: params.keyword === '无匹配' ? 0 : 45 }, (_, index) => ({
          key: `quality:${index + 1}`,
          number: `EX-DESKTOP-${String(index + 1).padStart(3, '0')}`,
          state: index >= 40 ? 'closed' : index % 2 ? 'executing' : 'open',
          orders: [order],
          batch_no: 'WIP-EXCEPTION-001',
          reason: '批次颜色和尺寸与确认样不一致，须按确认的返工方案执行并重新检验。',
          disposition: 'REWORK',
          occurred_at: '2026-10-13T08:00:00Z',
          tasks: index >= 40 ? [] : [task],
          task_ids: index >= 40 ? [] : [task.id],
        }))
        const selected = scopedItems.filter((item) => !params.state || (params.state === 'closed' ? item.state === 'closed' : item.state !== 'closed'))
        const open = scopedItems.filter((item) => item.state !== 'closed').length
        const closed = scopedItems.length - open
        const pendingTasks = selected.some((item) => item.tasks.length) ? 1 : 0
        const orders = selected.length ? [order] : []
        const data = {
          items: selected.slice(params.offset, params.offset + params.limit),
          tasks: pendingTasks ? [task] : [],
          orders,
          total: selected.length,
          pending_tasks: pendingTasks,
          affected_orders: orders.length,
          view_total: params.view === 'tasks' ? pendingTasks : params.view === 'orders' ? orders.length : selected.length,
          open,
          closed,
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
      })
    },
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '异常跟踪', exact: true })
      const toolbar = page.locator('.erp-task-tracking-toolbar')
      await panel.getByText('EX-DESKTOP-001', { exact: true }).waitFor()
      assert.equal(await page.getByLabel('任务范围', { exact: true }).getByText('异常跟踪', { exact: true }).count(), 0)
      assert.equal(await page.getByLabel('跟踪内容', { exact: true }).getByText('异常跟踪', { exact: true }).count(), 1)
      assert.equal(await panel.locator('details[open]').count(), 0)
      assert.equal(await panel.locator('.erp-sliding-segmented').count(), 0, '统计和状态不再增加导航层')
      assert.equal(await panel.getByLabel('异常关联入口', { exact: true }).count(), 1)
      assert.equal(await page.getByLabel('跟踪内容', { exact: true }).evaluate((node) => getComputedStyle(node).borderTopWidth), '0px')
      const counts = () => toolbar.locator('.workflow-exceptions__states .erp-filter-chip__count').allTextContents()
      assert.deepEqual(await counts(), ['45', '40', '5'])
      assert.equal(await panel.getByText(/共 \d+ 项异常/).count(), 0)
      await toolbar.getByRole('button', { name: /^已处理完/ }).click()
      await panel.getByText('EX-DESKTOP-041', { exact: true }).waitFor()
      assert.deepEqual(await counts(), ['45', '40', '5'])
      assert.equal(await panel.locator('.workflow-exceptions__item').count(), 5)
      await toolbar.getByRole('button', { name: /^未处理完/ }).click()
      await panel.getByText('EX-DESKTOP-001', { exact: true }).waitFor()
      assert.deepEqual(await counts(), ['45', '40', '5'])
      await toolbar.getByRole('button', { name: /^全部异常/ }).click()
      await panel.getByText('EX-DESKTOP-001', { exact: true }).waitFor()
      const search = toolbar.getByLabel('搜索异常单号、订单、批次或原因')
      await search.fill('无匹配')
      await search.press('Enter')
      await panel.getByText('当前条件下没有可跟踪的异常', { exact: true }).waitFor()
      assert.deepEqual(await counts(), ['0', '0', '0'])
      await search.fill('')
      await search.press('Enter')
      await panel.getByText('EX-DESKTOP-001', { exact: true }).waitFor()
      assert.equal(await panel.getByRole('heading', { name: '异常跟踪', exact: true }).count(), 0)
      assert.equal(await panel.getByText('查看明细', { exact: true }).count(), 0)
      assert.equal(await toolbar.locator('.workflow-exceptions__query button').filter({ hasText: '刷新' }).count(), 0)
      const geometry = await page.locator('.erp-dashboard-task-board-card').evaluate((root) => ({
        controlsToRecord: root.querySelector('.workflow-exceptions__item').getBoundingClientRect().top - root.querySelector('.workflow-exceptions__query').getBoundingClientRect().top,
        overflow: root.scrollWidth - root.clientWidth,
      }))
      assert(geometry.controlsToRecord < 180 && geometry.overflow <= 1, JSON.stringify(geometry))
      await page.screenshot({ path: path.join(outputDir, 'desktop-exceptions-4k.png') })
      await panel.locator('.ant-pagination-item-2').click()
      await panel.getByText('EX-DESKTOP-021', { exact: true }).waitFor()
      assert.equal(reads.at(-1).offset, 20)
      await verifyMobileNavigationMotion(page, assert, '.erp-task-tracking-views', 0)
      await toolbar.getByPlaceholder('单号 / 任务 / 产品 / 款号').waitFor()
      await verifyMobileNavigationMotion(page, assert, '.erp-task-tracking-views', 1, true)
      await panel.getByText('EX-DESKTOP-021', { exact: true }).waitFor()
      assert.equal(reads.at(-1).offset, 20, '切换追踪视图保留异常页码')
      failNext = true
      await page.getByRole('button', { name: '刷新当前页', exact: true }).click()
      await panel.getByText('已保留上次结果。', { exact: true }).waitFor()
      assert.equal(await panel.getByText('EX-DESKTOP-021', { exact: true }).count(), 1)
      await panel.getByRole('button', { name: '重试', exact: true }).click()
      await panel.getByText('已保留上次结果。', { exact: true }).waitFor({ state: 'detached' })
      await panel.getByRole('button', { name: /^关联待办/ }).click()
      await panel.getByRole('button', { name: task.task_name, exact: true }).click()
      const drawer = page.locator('.erp-task-action-drawer')
      await drawer.getByRole('button', { name: '返回关联待办', exact: true }).click()
      await drawer.waitFor({ state: 'hidden' })
      await panel.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
      await panel.getByText('EX-DESKTOP-021', { exact: true }).waitFor()
      assert.equal(reads.at(-1).offset, 20, '从关联明细返回原异常页码')
      await panel.getByRole('button', { name: /^关联订单/ }).click()
      await panel.getByText('SO-EXCEPTION-001', { exact: true }).waitFor()
      assert.equal(reads.at(-1).view, 'orders')
      assert.equal(reads.at(-1).offset, 0)
      await waitForFiniteAnimations(page)
      assert.equal(await panel.locator('.ant-pagination').count(), 0)
      await panel.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
      await panel.getByText('EX-DESKTOP-021', { exact: true }).waitFor()
    },
  }
}
