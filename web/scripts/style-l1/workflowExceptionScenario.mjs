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
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '暂时无法读取异常记录', data: null } } })
        }
        const order = { id: 1, number: 'SO-EXCEPTION-001' }
        const items = Array.from({ length: 45 }, (_, index) => ({
          key: `quality:${index + 1}`,
          number: `EX-DESKTOP-${String(index + 1).padStart(3, '0')}`,
          state: index % 2 ? 'executing' : 'open',
          orders: [order],
          batch_no: 'WIP-EXCEPTION-001',
          reason: '批次颜色和尺寸与确认样不一致，须按确认的返工方案执行并重新检验。',
          disposition: 'REWORK',
          occurred_at: '2026-10-13T08:00:00Z',
          tasks: [task],
          task_ids: [task.id],
        })).slice(params.offset, params.offset + params.limit)
        const data = {
          items,
          tasks: [task],
          orders: [order],
          total: 45,
          pending_tasks: 1,
          affected_orders: 1,
          view_total: params.view ? 1 : 45,
          open: 45,
          closed: 0,
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
      })
    },
    verify: async (page) => {
      const panel = page.getByRole('region', { name: '异常记录', exact: true })
      await panel.getByText('EX-DESKTOP-001', { exact: true }).waitFor()
      assert.equal(await page.getByLabel('任务范围', { exact: true }).getByText('异常记录', { exact: true }).count(), 0)
      assert.equal(await page.getByLabel('跟踪内容', { exact: true }).getByText('异常记录', { exact: true }).count(), 1)
      assert.equal(await panel.locator('details[open]').count(), 0)
      assert.equal(await panel.getByRole('heading', { name: '异常记录', exact: true }).count(), 0)
      assert.equal(await panel.getByText('查看明细', { exact: true }).count(), 0)
      assert.equal(await panel.locator('.workflow-exceptions__query button').filter({ hasText: '刷新' }).count(), 0)
      const geometry = await panel.evaluate((root) => ({
        controlsToRecord: root.querySelector('.workflow-exceptions__item').getBoundingClientRect().top - root.querySelector('.workflow-exceptions__query').getBoundingClientRect().top,
        overflow: root.scrollWidth - root.clientWidth,
      }))
      assert(geometry.controlsToRecord < 180 && geometry.overflow <= 1, JSON.stringify(geometry))
      await page.screenshot({ path: path.join(outputDir, 'desktop-exceptions-4k.png') })
      await panel.locator('.ant-pagination-item-2').click()
      await panel.getByText('EX-DESKTOP-021', { exact: true }).waitFor()
      assert.equal(reads.at(-1).offset, 20)
      await verifyMobileNavigationMotion(page, assert, '.erp-task-tracking-views', 0)
      await page.locator('.erp-workflow-tracking-panel').getByPlaceholder('单号 / 任务 / 产品 / 款号').waitFor()
      await verifyMobileNavigationMotion(page, assert, '.erp-task-tracking-views', 1, true)
      await panel.getByText('EX-DESKTOP-021', { exact: true }).waitFor()
      assert.equal(reads.at(-1).offset, 20, '切换追踪视图保留异常页码')
      failNext = true
      await page.getByRole('button', { name: '刷新当前页', exact: true }).click()
      await panel.getByText('已保留上次结果。', { exact: true }).waitFor()
      assert.equal(await panel.getByText('EX-DESKTOP-021', { exact: true }).count(), 1)
      await panel.getByRole('button', { name: '重试', exact: true }).click()
      await panel.getByText('已保留上次结果。', { exact: true }).waitFor({ state: 'detached' })
      await panel.getByTitle('待处理关联任务', { exact: true }).click()
      await panel.getByRole('button', { name: task.task_name, exact: true }).click()
      const drawer = page.locator('.erp-task-action-drawer')
      await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
      await drawer.waitFor({ state: 'hidden' })
      await panel.getByTitle('受影响订单', { exact: true }).click()
      await panel.getByText('SO-EXCEPTION-001', { exact: true }).waitFor()
      assert.equal(reads.at(-1).view, 'orders')
      assert.equal(reads.at(-1).offset, 0)
      await waitForFiniteAnimations(page)
      assert.equal(await panel.locator('.ant-pagination').count(), 0)
    },
  }
}
