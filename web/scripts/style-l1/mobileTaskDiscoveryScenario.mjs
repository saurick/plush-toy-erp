import { mobileTaskListOptionsScenario } from './mobileTaskListOptionsScenario.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { clickMobileThemeOption } from './mobileTaskThemeAssertions.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'
import { assertMobileFilterDensity } from './mobileFilterPopoverAssertions.mjs'
import { assertMobileFilterConsistency } from './mobileFilterConsistencyAssertions.mjs'

export function mobileTaskDiscoveryScenario({ assert, path, outputDir }) {
  const base = mobileTaskListOptionsScenario({ assert, path, outputDir })
  const task = base.workflowTaskFixtures[0]
  const reads = []
  let failNext = false
  let failPeople = true
  return {
    ...base,
    name: 'mobile-task-discovery-entry',
    deviceScaleFactor: 3,
    beforeNavigate: async (page) => {
      reads.length = 0
      failNext = false
      failPeople = true
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        reads.push({ method, params })
        if (method === 'get_task_board' && params.limit === 1) {
          if (failPeople) {
            failPeople = false
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '办理人名单暂时不可用', data: null } } })
          }
          const lanes = ['actionable', 'exception', 'due', 'finished']
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data: {
            snapshot_at: Math.floor(Date.now() / 1000), total: 0,
            counts: Object.fromEntries(lanes.map((key) => [key, 0])),
            lanes: lanes.map((key) => ({ key, total: 0, limit: 1, offset: 0, tasks: [] })),
            source_types: ['sales_order', 'purchase_order', 'production_order', 'shipment', 'purchase_receipt'], owner_role_keys: ['engineering'], assignees: [{ id: 12, name: '工程小李' }],
          } } } })
        }
        if (method !== 'list_exceptions') return route.fallback()
        if (failNext) {
          failNext = false
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '暂时无法读取异常跟踪信息', data: null } } })
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
        const selectedTotal = params.state === 'closed' ? 0 : total
        const data = {
          total: selectedTotal,
          view_total: params.view ? (selectedTotal ? 1 : 0) : selectedTotal,
          pending_tasks: selectedTotal ? 1 : 0,
          affected_orders: selectedTotal ? 1 : 0,
          open: total,
          closed: 0,
          items: selectedTotal ? items : [],
          tasks: selectedTotal ? [task] : [],
          orders: selectedTotal ? item.orders : [],
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: async (page) => {
      page.setDefaultTimeout(15000)
      const tabs = page.getByLabel('任务状态', { exact: true })
      const chooseTab = async (name) => {
        await tabs.getByText(name === '异常跟踪' ? '流程跟踪' : name, { exact: true }).click()
        if (name === '异常跟踪') await page.getByLabel('跟踪内容', { exact: true }).getByText(name, { exact: true }).click()
        await waitForFiniteAnimations(page)
      }
      const select = async (root, label, option) => {
        if (['办理人', '来源单据'].includes(label)) {
          const fields = root.locator('.mobile-filter-fields')
          await root.getByRole('button', { name: new RegExp(`^选择${label}：`) }).scrollIntoViewIfNeeded()
          const position = await fields.evaluate((node) => node.scrollTop)
          await root.getByRole('button', { name: new RegExp(`^选择${label}：`) }).click()
          const search = root.getByRole('textbox', { name: `搜索${label}`, exact: true })
          await search.fill('没有这个选项')
          await root.getByText('没有匹配的选项，请换个关键词', { exact: true }).waitFor()
          await search.fill(option)
          await root.getByRole('group', { name: `${label}选项`, exact: true }).getByRole('button', { name: option, exact: true }).click()
          await fields.waitFor({ state: 'visible' })
          await page.waitForFunction(({ label, position }) => {
            const root = [...document.querySelectorAll('.mobile-filter-panel')].find((el) => el.getAttribute('aria-label') === label)
            return root && Math.abs(root.querySelector('.mobile-filter-fields').scrollTop - position) < 2
          }, { label: await root.getAttribute('aria-label'), position })
          await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label')?.startsWith(`选择${label}：`), label)
        } else {
          await root.getByRole('group', { name: label, exact: true }).getByRole('button', { name: option, exact: true }).click()
        }
      }
      const trigger = page.getByTestId('mobile-task-list-filter-trigger')
      const dialog = page.getByRole('dialog', { name: '筛选任务', exact: true })
      const open = async () => {
        await trigger.click()
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
        await page.waitForFunction(() => {
          const panel = document.querySelector('[role="dialog"][aria-label="筛选任务"]')?.closest('.ant-popover')
          return panel && getComputedStyle(panel).opacity === '1' && !/-(appear|enter|leave)(-|\s|$)/u.test(panel.className)
        })
      }
      const close = async (panel = dialog) => {
        await panel.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await panel.waitFor({ state: 'hidden' })
      }
      await trigger.waitFor()
      assert.equal(await page.getByRole('button', { name: '按模块、环节和办理人查找' }).count(), 0)
      assert.equal(await page.locator('.mobile-task-discovery').count(), 0)
      assert.equal(await tabs.getByText('异常跟踪', { exact: true }).count(), 0)
      assert.equal(await tabs.locator('.ant-segmented-item').count(), 3)
      await page.getByRole('searchbox').fill('排序')
      await page.getByRole('searchbox').press('Enter')
      await open()
      await dialog.getByRole('button', { name: '重新读取办理人', exact: true }).click()
      await dialog.getByRole('button', { name: '重新读取办理人', exact: true }).waitFor({ state: 'hidden' })
      for (const label of ['业务模块', '业务流程', '业务环节']) {
        assert.equal(await dialog.getByText(label, { exact: true }).count(), 0)
      }
      assert.equal(await dialog.locator('legend').filter({ hasText: /^办理人$/ }).count(), 1)
      await assertMobileFilterDensity({ assert, dialog })
      await select(dialog, '来源单据', '销售订单')
      await close()
      await page.getByRole('button', { name: '清除来源单据：销售订单', exact: true }).click()
      await open()
      await select(dialog, '办理人', '工程小李')
      assert.equal(await dialog.getByText('本机常用筛选', { exact: true }).count(), 0)
      await close()
      await page.getByRole('button', { name: '清除办理人：工程小李', exact: true }).waitFor()
      await assertMobileFilterConsistency({ assert, quick: page.getByTestId('mobile-role-task-filters'), applied: page.getByLabel('当前任务筛选') })
      assert(reads.some(({ method, params }) => method === 'list_role_tasks' && params.assignee === '12'))
      await open()
      await select(dialog, '办理人', '岗位待领取')
      await close()
      await page.getByLabel('当前任务筛选').waitFor()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务，已应用 1 项')
      assert(reads.some(({ method, params }) => method === 'list_role_tasks' && !params.module_key && !params.chain_key && !params.stage_key && params.assignee === 'unassigned' && params.keyword === '排序'))
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务，已应用 1 项')
      await page.getByRole('button', { name: '清除办理人：岗位待领取', exact: true }).waitFor()
      assert.equal(await page.getByRole('searchbox').inputValue(), '排序')
      await open()
      await select(dialog, '办理人', '工程小李')
      await close()
      await chooseTab('已办')
      const historyTrigger = page.getByTestId('mobile-history-filter-trigger')
      assert.equal(await historyTrigger.getAttribute('aria-label'), '筛选已办')
      await historyTrigger.click()
      const historyDialog = page.getByRole('dialog', { name: '筛选已办', exact: true })
      await select(historyDialog, '办理人', '岗位待领取')
      assert.equal(await historyDialog.getByText('截止时间', { exact: true }).count(), 0)
      await assertMobileFilterDensity({ assert, dialog: historyDialog })
      await close(historyDialog)
      await chooseTab('待办')
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务，已应用 1 项')
      assert.equal(await page.getByRole('searchbox').inputValue(), '排序')
      await open()
      await dialog.getByRole('button', { name: '重置筛选', exact: true }).click()
      await close()
      assert.equal(await trigger.getAttribute('aria-label'), '筛选任务')
      assert.equal(await page.getByRole('searchbox').inputValue(), '排序')
      await page.evaluate(() => {
        const saved = window.history.state
        saved.mobileRoleTasksQueryPages.history = {
          ...saved.mobileRoleTasksQueryPages.history,
          moduleKey: 'quality', chainKey: 'fulfillment', stageKey: 'cutting_quality', due: 'noDue',
        }
        window.history.replaceState(saved, '')
      })
      await page.reload()
      await trigger.waitFor()
      await chooseTab('已办')
      assert.equal(await historyTrigger.getAttribute('aria-label'), '筛选已办，已应用 1 项')
      await page.waitForFunction(() => {
        const restored = window.history.state?.mobileRoleTasksQueryPages?.history
        return restored && !restored.moduleKey && !restored.chainKey && !restored.stageKey && !restored.due
      })
      const restoredHistory = reads.findLast(({ method, params }) => method === 'list_role_tasks' && params.view_key === 'history').params
      for (const key of ['module_key', 'chain_key', 'stage_key', 'due']) assert.equal(restoredHistory[key], undefined)
      await chooseTab('待办')
      await verifyMobileNavigationMotion(page, assert, '.mobile-workspace-task-views .erp-sliding-segmented', 2)
      await verifyMobileNavigationMotion(page, assert, '.mobile-workspace-tracking-views .erp-sliding-segmented', 1)
      const exceptions = page.getByRole('region', { name: '异常跟踪', exact: true })
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      const counts = () => exceptions.locator('.workflow-exceptions__states .erp-filter-chip__count').allTextContents()
      assert.deepEqual(await counts(), ['1', '1', '0'])
      assert.equal(await exceptions.getByText(/共 \d+ 项异常/).count(), 0)
      await exceptions.getByRole('button', { name: /^已处理完/ }).click()
      await exceptions.getByText('当前条件下没有可跟踪的异常', { exact: true }).waitFor()
      assert.deepEqual(await counts(), ['1', '1', '0'])
      assert.equal(await exceptions.getByRole('button', { name: /^已处理完/ }).locator('.erp-filter-chip__clear').count(), 1)
      await exceptions.getByRole('button', { name: /^已处理完/ }).click()
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      assert.equal(await exceptions.getByRole('button', { name: /^全部异常/ }).getAttribute('aria-pressed'), 'true')
      await exceptions.getByRole('button', { name: '筛选异常跟踪', exact: true }).click()
      const exceptionFilters = page.getByRole('dialog', { name: '筛选异常跟踪', exact: true })
      assert.equal(await exceptionFilters.locator('legend').count(), 1)
      await assertMobileFilterDensity({ assert, dialog: exceptionFilters })
      await select(exceptionFilters, '办理人', '工程小李')
      await close(exceptionFilters)
      await assertMobileFilterConsistency({ assert, quick: exceptions.getByRole('group', { name: '异常处理状态', exact: true }), applied: exceptions.getByLabel('当前异常筛选') })
      await exceptions.getByRole('button', { name: '清除办理人：工程小李', exact: true }).click()

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
      await exceptions.getByText('未处理完', { exact: true }).click()
      await exceptions.getByRole('button', { name: /^关联待办/ }).click()
      await exceptions.getByRole('button', { name: task.task_name, exact: true }).click()
      await page.getByTestId('mobile-task-detail-screen').waitFor()
      await page.getByRole('button', { name: '返回关联待办', exact: true }).click()
      await exceptions.getByRole('button', { name: task.task_name, exact: true }).waitFor()
      assert.equal(await search.count(), 0, '关联明细不重复搜索与筛选')
      const restored = reads.findLast(({ method }) => method === 'list_exceptions').params
      assert.equal(restored.keyword, '裁片')
      assert.equal(restored.state, 'open')
      assert.equal(restored.view, 'tasks')
      await page.reload()
      await exceptions.getByRole('button', { name: task.task_name, exact: true }).waitFor()
      await exceptions.getByRole('heading', { name: /^关联待办/ }).waitFor()
      await verifyMobileNavigationMotion(page, assert, '.mobile-workspace-task-views .erp-sliding-segmented', 1, true)
      await chooseTab('异常跟踪')
      await exceptions.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
      assert.equal(await search.inputValue(), '裁片')
      await exceptions.getByRole('button', { name: /^关联订单/ }).click()
      await exceptions.getByRole('heading', { name: /^关联订单/ }).waitFor()
      await exceptions.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
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
      assert.deepEqual(await counts(), ['45', '45', '0'])
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
      await page.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
      await exceptions.getByText('EX-ENTRY-021', { exact: true }).waitFor()
      assert.equal(await exceptions.locator('.workflow-exceptions__item').count(), 40)
      const restoredPosition = await scroll.evaluate((node) => node.scrollTop)
      const savedPosition = await page.evaluate(() => window.history.state.mobileWorkflowExceptions?.query?.scrollTop)
      assert(Math.abs(restoredPosition - originalPosition) < 2, `返回应恢复已读位置：${JSON.stringify({ originalPosition, restoredPosition, savedPosition })}`)
      // Keep the related entry below the sticky query bar while testing a nonzero position.
      await scroll.evaluate((node) => { node.scrollTop = 20 })
      const listPosition = await scroll.evaluate((node) => node.scrollTop)
      await exceptions.getByRole('button', { name: /^关联待办/ }).click()
      await exceptions.getByRole('heading', { name: /^关联待办/ }).waitFor()
      await exceptions.getByRole('button', { name: '返回异常跟踪', exact: true }).click()
      await exceptions.getByText('EX-ENTRY-021', { exact: true }).waitFor()
      assert.equal(await exceptions.locator('.workflow-exceptions__item').count(), 40, '关联明细返回保留已加载范围')
      const relatedRestoredPosition = await scroll.evaluate((node) => node.scrollTop)
      const relatedSavedPosition = await page.evaluate(() => window.history.state.mobileWorkflowExceptions?.query?.listPosition?.scrollTop)
      assert(Math.abs(relatedRestoredPosition - listPosition) < 2, `关联明细返回保留异常列表位置：${JSON.stringify({ listPosition, relatedRestoredPosition, relatedSavedPosition })}`)
      assert.equal(await exceptions.getByRole('button', { name: /^关联待办/ }).evaluate((node) => node === document.activeElement), true, '返回后焦点回到原入口')
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
      await exceptions.getByText('当前条件下没有可跟踪的异常', { exact: true }).waitFor()
      assert.deepEqual(await counts(), ['0', '0', '0'])
      await pullToRefresh(page, scroll)
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-pull-refresh"]')?.dataset.state === 'idle')
      await exceptions.getByRole('button', { name: '清除搜索', exact: true }).click()
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      assert.equal(reads.findLast(({ method }) => method === 'list_exceptions').params.keyword, undefined)
      await chooseTab('待办')
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await open()
        await select(dialog, '办理人', '工程小李')
        await assertMobileFilterDensity({ assert, dialog })
        const boxes = await dialog.evaluate((el) => ({
          left: el.getBoundingClientRect().left,
right: el.getBoundingClientRect().right,
          width: document.documentElement.clientWidth,
          scroll: document.documentElement.scrollWidth,
          client: el.querySelector('.mobile-filter-fields').clientHeight,
content: el.querySelector('.mobile-filter-fields').scrollHeight,
overflow: getComputedStyle(el.querySelector('.mobile-filter-fields')).overflowY,
        }))
        assert(boxes.left >= 0 && boxes.right <= width + 1 && boxes.scroll <= boxes.width + 1, JSON.stringify(boxes))
        assert(boxes.content <= boxes.client || boxes.overflow === 'auto', JSON.stringify(boxes))
        await close()
        await page.screenshot({ path: path.join(outputDir, `mobile-task-entry-${width}.png`) })
      }
      await open()
      await page.screenshot({ path: path.join(outputDir, 'mobile-task-entry-filter.png') })
      await close()
      await chooseTab('异常跟踪')
      await search.fill('长文本')
      await search.press('Enter')
      await exceptions.getByRole('button', { name: /^全部异常\s*123456789$/ }).waitFor()
      assert.deepEqual(await counts(), ['123456789', '123456789', '0'])
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
      await chooseTab('异常跟踪')
      await search.fill('裁片')
      await search.press('Enter')
      await exceptions.getByText('EX-ENTRY-001', { exact: true }).waitFor()
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await waitForFiniteAnimations(page)
        const geometry = await exceptions.evaluate((node) => {
          const search = node.querySelector('.workflow-exceptions__query').getBoundingClientRect()
          const views = node.querySelector('.workflow-exceptions__summary').getBoundingClientRect()
          const first = node.querySelector('.workflow-exceptions__item').getBoundingClientRect()
          return { firstTop: first.top, searchTop: search.top, viewsHeight: views.height, width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }
        })
        assert(geometry.firstTop - geometry.searchTop < 180 && geometry.viewsHeight <= 56, JSON.stringify(geometry))
        assert(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry))
        await exceptions.getByRole('button', { name: '筛选异常跟踪', exact: true }).click()
        const filters = page.getByRole('dialog', { name: '筛选异常跟踪', exact: true })
        await filters.waitFor()
        await waitForFiniteAnimations(page)
        const box = await filters.boundingBox()
        assert(box.height < 844 * 0.8 + 1 && box.x >= 0 && box.x + box.width <= width + 1, JSON.stringify(box))
        await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        await filters.waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(outputDir, `mobile-exceptions-compact-${width}.png`) })
      }
      await page.screenshot({ path: path.join(outputDir, 'mobile-task-entry-exceptions-dark.png') })
    },
  }
}
