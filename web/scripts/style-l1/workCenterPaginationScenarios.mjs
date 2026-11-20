import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'

export function createWorkCenterPaginationScenarios(deps) {
  const { assert } = deps
  const base = createDashboardTaskScenarios(deps).find((item) => item.name === 'erp-task-board-desktop')
  const tasks = Array.from({ length: 105 }, (_, index) => ({
    ...base.workflowTaskFixtures[0],
    id: 94000 + index,
    task_code: `STYLE-PAGINATION-${index}`,
    task_name: `核对出货资料与数量 ${index + 1}`,
    source_no: `SHIP-PAGINATION-${index}`,
    due_at: index === 0 ? null : Date.UTC(2099, 0, index + 1) / 1000,
  }))
  return ['tasks', 'risk'].map((kind) => ({
    ...base,
    name: `work-center-pagination-${kind}`,
    path: kind === 'risk' ? '/erp/task-board?view=risk' : '/erp/task-board?mode=todo&lane=actionable',
    effectiveSession: { ...base.effectiveSession, actions: [...base.effectiveSession.actions, 'erp.workbench.read'] },
    workflowTaskFixtures: kind === 'risk' ? tasks.map((task) => ({ ...task, urge_count: 1 })) : tasks,
    verify: async (page) => {
      const rows = page.locator('.ant-table-tbody tr[data-row-key]')
      const pager = page.locator('.erp-task-pagination')
      const method = kind === 'risk' ? 'get_workbench' : 'get_task_board'
      const readPage = (limit, offset) => page.waitForResponse((response) => {
        if (!response.url().endsWith('/rpc/workflow')) return false
        const body = response.request().postDataJSON()
        return body?.method === method && body.params?.limit === limit && body.params?.offset === offset
      })
      const assertRows = async (count) => {
        await page.waitForFunction((expected) => document.querySelectorAll('.ant-table-tbody tr[data-row-key]').length === expected, count)
        assert.equal(await rows.count(), count)
      }
      const selectSize = async (size) => {
        await pager.locator('.ant-select-selector').click()
        const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option-content')
        assert.deepEqual((await options.allTextContents()).map((value) => Number(value.match(/^\d+/u)?.[0])), [20, 50, 100])
        await options.filter({ hasText: new RegExp(`^${size}\\s`, 'u') }).click()
      }
      await assertRows(20)
      const originalID = await rows.first().getAttribute('data-task-id')
      const nextPage = readPage(20, 20)
      await pager.getByRole('button', { name: '下一页', exact: true }).click()
      await nextPage
      await pager.getByText('第 21-40 条 / 共 105 条', { exact: true }).waitFor()
      const header = page.locator('.erp-work-center-table th.ant-table-column-has-sorters:visible').filter({ hasText: '任务时间' }).first()
      for (const [direction, sortKey, expectedID] of [
        ['ascending', 'time_asc', 94001], ['descending', 'time_desc', 94104], [null, kind === 'tasks' ? 'smart' : undefined, originalID],
      ]) {
        const read = readPage(20, 0)
        await header.press('Enter')
        const response = await read
        assert.equal(response.request().postDataJSON().params.sort, sortKey)
        await page.waitForFunction((id) => document.querySelector('.erp-work-center-table tr[data-task-id]')?.dataset.taskId === id, String(expectedID))
        await pager.getByText('第 1-20 条 / 共 105 条', { exact: true }).waitFor()
        assert.equal(await header.getAttribute('aria-sort'), direction)
      }
      for (const size of [50, 100]) {
        const read = readPage(size, 0)
        await selectSize(size)
        const response = await (await read).json()
        assert.equal(response.result.code, 0)
        const data = kind === 'risk' ? response.result.data : response.result.data.lanes[0]
        assert.equal(data.total, 105)
        assert.equal(data.limit, size)
        assert.equal(data.offset, 0)
        await assertRows(size)
      }
      const nextRead = readPage(100, 100)
      await pager.getByRole('button', { name: '下一页', exact: true }).click()
      await nextRead
      await assertRows(5)
      assert.equal(await pager.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true)
      const firstRead = readPage(20, 0)
      await selectSize(20)
      await firstRead
      await assertRows(20)
      assert.equal(await pager.getByRole('button', { name: '上一页', exact: true }).isDisabled(), true)
      if (kind === 'tasks') {
        let failNext = true
        const rejectReadOnce = async (route) => {
          const body = route.request().postDataJSON()
          if (failNext && body?.method === method && body.params?.limit === 50) {
            failNext = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: RpcErrorCode.INTERNAL, message: '任务列表暂时无法读取', data: {} } } })
          }
          return route.fallback()
        }
        await page.route('**/rpc/workflow', rejectReadOnce)
        await selectSize(50)
        await page.locator('.ant-alert').filter({ hasText: '任务管理加载失败' }).waitFor()
        const retryRead = readPage(50, 0)
        await page.getByRole('button', { name: '重新加载', exact: true }).click()
        await retryRead
        await assertRows(50)
        await page.unroute('**/rpc/workflow', rejectReadOnce)
      }
    },
  }))
}
