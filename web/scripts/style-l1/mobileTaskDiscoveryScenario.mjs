import { mobileTaskListOptionsScenario } from './mobileTaskListOptionsScenario.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { clickMobileThemeOption } from './mobileTaskThemeAssertions.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'

export function mobileTaskDiscoveryScenario({ assert, path, outputDir }) {
  const base = mobileTaskListOptionsScenario({ assert, path, outputDir })
  const task = base.workflowTaskFixtures[0]
  const reads = []
  let failNext = false
  return {
    ...base,
    name: 'mobile-task-discovery-entry',
    deviceScaleFactor: 3,
    beforeNavigate: async (page) => {
      reads.length = 0
      failNext = false
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        reads.push({ method, params })
        if (method !== 'list_exceptions') return route.fallback()
        if (failNext) {
          failNext = false
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '暂时无法读取异常记录', data: null } } })
        }
        const empty = params.keyword === '无匹配'
        const item = {
          key: 'quality:1',
number: 'EX-ENTRY-001',
state: 'open',
          orders: [{ id: 1, number: 'SO-ENTRY-001' }],
batch_no: 'WIP-ENTRY-001',
          reason: '裁片尺寸需要复检',
occurred_at: '2026-10-12T08:00:00Z',
          task_ids: [task.id, task.id + 10000, task.id + 10001],
tasks: [task, { ...task, id: task.id + 10000, task_name: '办理加工回货检验', task_status_key: 'done' }, { ...task, id: task.id + 10001, task_name: '决定质量异常处理方案', task_status_key: 'done' }],
        }
        const total = empty ? 0 : params.keyword === '长文本' ? 123456789 : params.keyword === '多条' ? 45 : 1
        const items = Array.from({ length: Math.min(45, total) }, (_, index) => ({
          ...item,
          key: `quality:${index + 1}`,
          number: params.keyword === '长文本' ? `EX-${'LONG'.repeat(20)}-${index}` : `EX-ENTRY-${String(index + 1).padStart(3, '0')}`,
          tasks: params.keyword === '长文本' ? [{ ...task, task_name: `复核${'LongTaskName'.repeat(12)}` }] : item.tasks,
        })).slice(params.offset || 0, (params.offset || 0) + params.limit)
        const data = {
          total,
view_total: total,
          pending_tasks: empty ? 0 : 1,
affected_orders: empty ? 0 : 1,
          open: empty ? 0 : 1,
closed: 0,
          items,
tasks: empty ? [] : [task],
orders: empty ? [] : item.orders,
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: async (page) => {
      page.setDefaultTimeout(15000)
      const tabs = page.getByLabel('任务状态', { exact: true })
      const chooseTab = async (name) => {
        await tabs.getByText(name === '异常记录' ? '流程跟踪' : name, { exact: true }).click()
        if (name === '异常记录') await page.getByLabel('跟踪内容', { exact: true }).getByText(name, { exact: true }).click()
        await waitForFiniteAnimations(page)
      }
      const select = async (root, label, option) => {
        await root.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: label, exact: true }) }).click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: option }).first().click()
      }
      const trigger = page.getByTestId('mobile-task-list-filter-trigger')
      const dialog = page.getByRole('dialog', { name: '筛选任务', exact: true })
      const open = async () => {
        await trigger.click()
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
      }
      const close = async (panel = dialog) => {
        await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await panel.waitFor({ state: 'hidden' })
      }
      await trigger.waitFor()
      assert.equal(await page.getByRole('button', { name: '按模块、环节和办理人查找' }).count(), 0)
      assert.equal(await page.locator('.mobile-task-discovery').count(), 0)
      assert.equal(await tabs.getByText('异常记录', { exact: true }).count(), 0)
      assert.equal(await tabs.locator('.ant-segmented-item').count(), 3)
      await page.getByRole('searchbox').fill('排序')
      await page.getByRole('searchbox').press('Enter')
      await open()
      for (const label of ['业务模块', '业务链路', '业务环节', '办理人']) {
        assert.equal(await dialog.getByRole('combobox', { name: label, exact: true }).count(), 1)
      }
      await select(dialog, '业务模块', '工程 / BOM')
      await select(dialog, '办理人', '岗位待领取')
      await close()
      await page.getByLabel('当前任务分类筛选').waitFor()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务，已应用 2 项')
      assert(reads.some(({ method, params }) => method === 'list_role_tasks' && params.module_key === 'engineering' && params.assignee === 'unassigned' && params.keyword === '排序'))
      await chooseTab('已办')
      const historyTrigger = page.getByTestId('mobile-history-filter-trigger')
      assert.equal(await historyTrigger.getAttribute('aria-label'), '筛选已办')
      await historyTrigger.click()
      const historyDialog = page.getByRole('dialog', { name: '筛选已办', exact: true })
      await select(historyDialog, '业务模块', '采购')
      await close(historyDialog)
      await chooseTab('待办')
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务，已应用 2 项')
      assert.equal(await page.getByRole('searchbox').inputValue(), '排序')
      await open()
      await dialog.getByRole('button', { name: '重置筛选', exact: true }).click()
      await close()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务')
      assert.equal(await page.getByRole('searchbox').inputValue(), '排序')
      await chooseTab('已办')
      assert.equal(await historyTrigger.getAttribute('aria-label'), '筛选已办，已应用 1 项')
      await chooseTab('待办')
      await verifyMobileNavigationMotion(page, assert, '.mobile-workspace-task-views .erp-sliding-segmented', 2)
      await verifyMobileNavigationMotion(page, assert, '.mobile-workspace-tracking-views .erp-sliding-segmented', 1)
      const exceptions = page.getByRole('region', { name: '异常记录', exact: true })
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      const firstException = exceptions.locator('.workflow-exceptions__item').first()
      assert.equal(await firstException.locator('details').getAttribute('open'), null)
      assert.equal(await firstException.getByRole('button', { name: '办理加工回货检验', exact: true }).count(), 0)
      await firstException.locator('summary').click()
      await firstException.getByRole('button', { name: '办理加工回货检验', exact: true }).waitFor()
      await firstException.locator('summary').click()
      assert.equal(await firstException.locator('.workflow-exceptions__pending').getByRole('button', { name: task.task_name, exact: true }).count(), 1)
      assert.equal(await page.locator('.mobile-role-task-query').count(), 0)
      assert.equal(reads.findLast(({ method }) => method === 'list_exceptions').params.owner_role_key, undefined)
      const search = exceptions.getByLabel('搜索异常单号、订单、批次或原因')
      const liveSearch = page.waitForResponse((response) => response.url().endsWith('/rpc/workflow') && response.request().postDataJSON()?.params?.keyword === '裁片')
      await search.fill('裁片')
      await liveSearch
      await exceptions.getByText('未闭环', { exact: true }).click()
      await exceptions.getByTitle('待处理关联任务', { exact: true }).click()
      await exceptions.getByRole('button', { name: task.task_name, exact: true }).click()
      await page.getByTestId('mobile-task-detail-screen').waitFor()
      await page.getByRole('button', { name: '返回异常记录', exact: true }).click()
      await exceptions.getByRole('button', { name: task.task_name, exact: true }).waitFor()
      assert.equal(await search.inputValue(), '裁片')
      const restored = reads.findLast(({ method }) => method === 'list_exceptions').params
      assert.equal(restored.keyword, '裁片')
      assert.equal(restored.state, 'open')
      assert.equal(restored.view, 'tasks')
      await page.reload()
      await exceptions.getByRole('button', { name: task.task_name, exact: true }).waitFor()
      assert.equal(await search.inputValue(), '裁片')
      await verifyMobileNavigationMotion(page, assert, '.mobile-workspace-task-views .erp-sliding-segmented', 1, true)
      await chooseTab('异常记录')
      assert.equal(await search.inputValue(), '裁片')
      await verifyMobileNavigationMotion(page, assert, '.workflow-exceptions__views', 2)
      await exceptions.getByTitle('异常事件', { exact: true }).click()
      assert.equal(await exceptions.getByRole('button', { name: '刷新', exact: true }).count(), 0)
      assert.equal(await exceptions.getByText('查看明细', { exact: true }).count(), 0)
      const scroll = page.getByTestId('mobile-role-scroll')
      let readCount = reads.filter(({ method }) => method === 'list_exceptions').length
      await pullToRefresh(page, scroll)
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-pull-refresh"]')?.dataset.state === 'idle')
      assert(reads.filter(({ method }) => method === 'list_exceptions').length > readCount)
      failNext = true
      await pullToRefresh(page, scroll)
      await exceptions.getByText('已保留上次结果。', { exact: true }).waitFor()
      assert.equal(await exceptions.getByText('EX-ENTRY-001', { exact: true }).count(), 1)
      await exceptions.getByRole('button', { name: '重试', exact: true }).click()
      await exceptions.getByText('已保留上次结果。', { exact: true }).waitFor({ state: 'detached' })
      await search.fill('多条')
      await search.press('Enter')
      await exceptions.getByText('已显示 20 / 共 45 条', { exact: true }).waitFor()
      failNext = true
      await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight })
      await exceptions.getByRole('button', { name: '重新读取更多', exact: true }).waitFor()
      assert.equal(await exceptions.locator('.workflow-exceptions__item').count(), 20)
      await exceptions.getByRole('button', { name: '重新读取更多', exact: true }).click()
      await exceptions.getByText('已显示 40 / 共 45 条', { exact: true }).waitFor()
      assert.equal(await exceptions.locator('.ant-pagination').count(), 0)
      await exceptions.getByText('EX-ENTRY-021', { exact: true }).scrollIntoViewIfNeeded()
      const linkedTask = exceptions.locator('.workflow-exceptions__item').nth(20).getByRole('button', { name: task.task_name, exact: true })
      await linkedTask.scrollIntoViewIfNeeded()
      const originalPosition = await scroll.evaluate((node) => node.scrollTop)
      await linkedTask.click()
      await page.getByTestId('mobile-task-detail-screen').waitFor()
      await page.getByRole('button', { name: '返回异常记录', exact: true }).click()
      await exceptions.getByText('EX-ENTRY-021', { exact: true }).waitFor()
      assert.equal(await exceptions.locator('.workflow-exceptions__item').count(), 40)
      const restoredPosition = await scroll.evaluate((node) => node.scrollTop)
      assert(Math.abs(restoredPosition - originalPosition) < 2, `返回应恢复已读位置：${JSON.stringify({ originalPosition, restoredPosition })}`)
      readCount = reads.filter(({ method }) => method === 'list_exceptions').length
      await pullToRefresh(page, scroll)
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-pull-refresh"]')?.dataset.state === 'idle')
      assert.equal(await exceptions.locator('.workflow-exceptions__item').count(), 40)
      assert.deepEqual(reads.filter(({ method }) => method === 'list_exceptions').slice(readCount).map(({ params }) => params.offset), [0, 20])
      await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight })
      await exceptions.getByText('已显示全部 45 条', { exact: true }).waitFor()
      await scroll.evaluate((node) => { node.scrollTop = 0 })
      await search.fill('无匹配')
      await search.press('Enter')
      await exceptions.getByText('当前条件下没有异常记录', { exact: true }).waitFor()
      await pullToRefresh(page, scroll)
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-pull-refresh"]')?.dataset.state === 'idle')
      await exceptions.getByRole('button', { name: '清除搜索', exact: true }).click()
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      assert.equal(reads.findLast(({ method }) => method === 'list_exceptions').params.keyword, undefined)
      await chooseTab('待办')
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await open()
        await select(dialog, '业务链路', '订单履约')
        const boxes = await dialog.evaluate((el) => ({
          left: el.getBoundingClientRect().left,
right: el.getBoundingClientRect().right,
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          client: el.clientHeight,
content: el.scrollHeight,
overflow: getComputedStyle(el).overflowY,
        }))
        assert(boxes.left >= 0 && boxes.right <= width + 1 && boxes.scroll <= boxes.width + 1, JSON.stringify(boxes))
        assert(boxes.content <= boxes.client || boxes.overflow === 'auto', JSON.stringify(boxes))
        await close()
        await page.screenshot({ path: path.join(outputDir, `mobile-task-entry-${width}.png`) })
      }
      await open()
      await page.screenshot({ path: path.join(outputDir, 'mobile-task-entry-filter.png') })
      await close()
      await chooseTab('异常记录')
      await search.fill('长文本')
      await search.press('Enter')
      await exceptions.getByText('123456789', { exact: true }).waitFor()
      await page.setViewportSize({ width: 320, height: 844 })
      const longContent = await exceptions.evaluate((root) => ({ width: root.clientWidth, content: root.scrollWidth, pageWidth: document.documentElement.clientWidth, pageContent: document.documentElement.scrollWidth }))
      assert(longContent.content <= longContent.width + 1 && longContent.pageContent <= longContent.pageWidth + 1, JSON.stringify(longContent))
      await page.screenshot({ path: path.join(outputDir, 'mobile-exceptions-long-320.png') })
      await search.fill('裁片')
      await search.press('Enter')
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      await page.setViewportSize({ width: 390, height: 844 })
      await page.screenshot({ path: path.join(outputDir, 'mobile-exceptions-light-390.png') })
      await page.getByTestId('mobile-role-nav-mine').click()
      await clickMobileThemeOption(page, '暗色')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await chooseTab('异常记录')
      await search.fill('裁片')
      await search.press('Enter')
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await waitForFiniteAnimations(page)
        const geometry = await exceptions.evaluate((node) => {
          const search = node.querySelector('.workflow-exceptions__query').getBoundingClientRect()
          const views = node.querySelector('.workflow-exceptions__views').getBoundingClientRect()
          const first = node.querySelector('.workflow-exceptions__item').getBoundingClientRect()
          return { firstTop: first.top, searchTop: search.top, viewsHeight: views.height, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }
        })
        assert(geometry.firstTop - geometry.searchTop < 180 && geometry.viewsHeight <= 56, JSON.stringify(geometry))
        assert(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
        await exceptions.getByRole('button', { name: '筛选', exact: true }).click()
        const filters = page.getByRole('dialog', { name: '筛选异常记录', exact: true })
        await filters.waitFor()
        await waitForFiniteAnimations(page)
        const box = await filters.boundingBox()
        assert(box.height < 844 * 0.8 + 1 && box.x >= 0 && box.x + box.width <= width + 1, JSON.stringify(box))
        await filters.getByRole('button', { name: '查看结果', exact: true }).click()
        await filters.waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(outputDir, `mobile-exceptions-compact-${width}.png`) })
      }
      await page.screenshot({ path: path.join(outputDir, 'mobile-task-entry-exceptions-dark.png') })
    },
  }
}
