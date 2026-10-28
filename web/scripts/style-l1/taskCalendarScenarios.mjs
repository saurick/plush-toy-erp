import { createHash } from 'node:crypto'
import { mobileTaskListOptionsScenario } from './mobileTaskListOptionsScenario.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { currentBusinessDate, unixSecondsToBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { shiftCalendarMonth } from '../../src/erp/utils/workflowTaskCalendar.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../src/erp/utils/workflowTaskChanges.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { assertContentTabAffordance } from './controlAffordanceAssertions.mjs'

async function verifyCalendarAlignment(calendar, assert) {
  const geometry = await calendar.evaluate((root) => {
    const center = (node) => {
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x: x + width / 2, y: y + height / 2, width, height }
    }
    const day = root.querySelector('button[data-date][aria-pressed="true"]')
    const selection = day.querySelector('.workflow-task-calendar__date')
    const number = day.querySelector('.workflow-task-calendar__number')
    const toolbar = root.querySelector('.workflow-task-calendar__toolbar')
    const week = [...root.querySelectorAll('.workflow-task-calendar__week span')]
    const dayCells = [...root.querySelector('.workflow-task-calendar__grid').children]
    return {
      selected: day.dataset.date,
      selection: center(selection),
      number: center(number),
      toolbar: center(toolbar),
      month: center(toolbar.querySelector('strong')),
      headerGap: toolbar.querySelector('.workflow-task-calendar__navigation').getBoundingClientRect().left - toolbar.querySelector('strong').getBoundingClientRect().right,
      columnOffsets: dayCells.flatMap((node, index) => node.matches('button') ? [Math.abs(center(node).x - center(week[index % 7]).x)] : []),
      overflow: root.scrollWidth - root.clientWidth,
      foreground: getComputedStyle(number).color,
      background: getComputedStyle(selection).backgroundColor,
      dayStyle: { display: getComputedStyle(day).display, padding: getComputedStyle(day).padding, lineHeight: getComputedStyle(number).lineHeight },
    }
  })
  assert(Math.abs(geometry.selection.x - geometry.number.x) <= 1 && Math.abs(geometry.selection.y - geometry.number.y) <= 1, `date number is centered in its selection: ${JSON.stringify(geometry)}`)
  assert(Math.abs(geometry.toolbar.x - geometry.month.x) <= 1, `month title is centered in the whole toolbar: ${JSON.stringify(geometry)}`)
  assert(geometry.headerGap >= 0, `larger month title does not overlap navigation: ${JSON.stringify(geometry)}`)
  assert(Math.max(...geometry.columnOffsets) <= 1, `weekdays and dates share column centers: ${JSON.stringify(geometry)}`)
  assert(geometry.overflow <= 1, `calendar has no horizontal overflow: ${JSON.stringify(geometry)}`)
  assert(getContrastRatio(parseRgb(geometry.foreground), parseRgb(geometry.background)) >= 4.5, `selected date remains readable: ${JSON.stringify(geometry)}`)
  return geometry
}

export function createTaskCalendarScenarios(deps) {
  const { assert, path, outputDir } = deps
  const mobileBase = mobileTaskListOptionsScenario(deps)
  const desktopBase = createDashboardTaskScenarios(deps).find((scenario) => scenario.name === 'erp-task-board-desktop')
  return [
    { mobile: false, themeMode: 'light', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { mobile: false, themeMode: 'dark', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
    { mobile: true, themeMode: 'light', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
    { mobile: true, themeMode: 'dark', viewport: { width: 320, height: 844 }, deviceScaleFactor: 3 },
  ].map(({ mobile, themeMode, viewport, deviceScaleFactor }) => {
    const today = currentBusinessDate()
    const month = today.slice(0, 7)
    const nextMonth = shiftCalendarMonth(month, 1)
    const timestamp = (date) => Date.parse(`${date}T23:59:59+08:00`) / 1000
    const tasks = Array.from({ length: 65 }, (_, index) => ({
      ...mobileBase.workflowTaskFixtures[0],
id: 98100 + index,
      task_code: `STYLE-L1-CALENDAR-${index}`,
task_name: `日历跟进 ${index + 1}`,
      task_status_key: 'ready',
due_at: timestamp(today),
      display_context: { available: true, source_no: `CAL-${index}`, items: [] },
    }))
    const fixture = (id, name, due) => ({ ...tasks[0], id, task_code: `STYLE-L1-CALENDAR-${id}`, task_name: name, due_at: due })
    tasks.push(fixture(98201, '未设置截止的跟进', null), fixture(98202, '上月尚未处理的跟进', timestamp(`${shiftCalendarMonth(month, -1)}-01`)), fixture(98203, '下月跟进', timestamp(`${nextMonth}-01`)))
    let failNext = false
    let slowNext = false
    let heldNext = null
    let duplicateNext = false
    const calls = []
    const name = `task-calendar-${mobile ? 'mobile' : 'desktop'}-${themeMode}`
    return {
      ...(mobile ? mobileBase : desktopBase),
name,
themeMode,
viewport,
deviceScaleFactor,
      effectiveSession: mobile ? mobileBase.effectiveSession : { ...desktopBase.effectiveSession, actions: [...desktopBase.effectiveSession.actions, 'erp.workbench.read'] },
      path: mobile ? '/m/engineering/tasks' : '/erp/task-board?mode=todo',
      workflowTaskFixtures: tasks,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params: q = {} } = route.request().postDataJSON()
          if (!q.calendar_month) return route.fallback()
          calls.push({ method, ...q })
          if (heldNext &&
            (heldNext.expectedSelection === undefined || heldNext.expectedSelection === q.calendar_selection) &&
            (heldNext.expectedKeyword === undefined || heldNext.expectedKeyword === String(q.keyword || ''))) {
            const held = heldNext
            heldNext = null
            held.id = id
            held.selection = q.calendar_selection
            held.started.resolve()
            await held.release.promise
          }
          if (slowNext) { slowNext = false; await new Promise((resolve) => setTimeout(resolve, 450)) }
          const reply = (result) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result }) })
          if (failNext) { failNext = false; return reply({ code: 50000, message: '暂时无法读取' }) }
          const now = Math.floor(Date.now() / 1000)
          const visible = tasks.filter((task) => ['ready', 'blocked'].includes(task.task_status_key) && (!q.keyword || task.task_name.includes(q.keyword)) && (!(q.status_key || q.status) || q.status === 'all' || task.task_status_key === (q.status_key || q.status)))
          const days = {}
          for (const task of visible) { const day = unixSecondsToBusinessDate(task.due_at); if (day.startsWith(`${q.calendar_month}-`)) days[day] = (days[day] || 0) + 1 }
          const overdue = visible.filter((task) => task.due_at && task.due_at < now)
          const undated = visible.filter((task) => task.due_at == null)
          const selected = q.calendar_selection === 'overdue' ? overdue : q.calendar_selection === 'undated' ? undated : visible.filter((task) => unixSecondsToBusinessDate(task.due_at) === q.calendar_selection)
          const revision = createHash('sha256')
            .update(JSON.stringify(selected.map((task) => [task.id, task.version, task.due_at])))
            .digest('hex')
          const restarted = q.calendar_revision && q.calendar_revision !== revision
          const offset = restarted || (duplicateNext && q.calendar_offset) ? 0 : q.calendar_offset || 0
          if (q.calendar_offset) duplicateNext = false
          return reply({ code: 0,
message: 'OK',
data: { calendar: {
            month: q.calendar_month,
selection: q.calendar_selection,
days,
overdue: overdue.length,
undated: undated.length,
            total: selected.length,
offset: restarted ? 0 : q.calendar_offset || 0,
limit: q.limit,
snapshot_at: now,
revision,
            items: selected.slice(offset, offset + q.limit),
          } } })
        })
      },
      verify: async (page) => {
        const switcher = '[aria-label="待办显示方式"]'
        const verifyLayout = async (layout) => {
          if (mobile) {
            const button = page.getByRole('button', { name: layout === 'calendar' ? '切换到列表' : '切换到日历', exact: true })
            await button.waitFor()
            assert.equal(await button.getAttribute('aria-pressed'), String(layout === 'calendar'), '日历按钮的选中状态与当前内容一致')
            assert.equal(await button.locator('svg').getAttribute('data-icon'), layout === 'calendar' ? 'calendar' : 'unordered-list', '图标表示当前视图')
          } else {
            const tabs = page.getByRole('tablist', { name: '待办显示方式', exact: true })
            const selected = tabs.getByRole('tab', { name: layout === 'calendar' ? '日历' : '列表', selected: true, exact: true })
            await selected.waitFor()
            assert.equal(await selected.getAttribute('tabindex'), '0')
            await assertContentTabAffordance(tabs)
          }
          assert.equal(await page.locator('html').getAttribute('data-erp-theme'), themeMode, '场景使用指定的浅色或深色主题')
          assert.equal(await page.getByRole('region', { name: '待办日历', exact: true }).count(), layout === 'calendar' ? 1 : 0)
          assert.equal(new URL(page.url()).searchParams.get('layout'), layout === 'calendar' ? 'calendar' : null)
        }
        if (mobile) await page.getByRole('button', { name: '切换到日历', exact: true }).waitFor()
        else await page.locator(switcher).waitFor()
        assert.equal(await page.getByRole('region', { name: '待办日历', exact: true }).count(), 0)
        await verifyLayout('list')
        let listPageTaskIDs = []
        if (!mobile) {
          const rows = page.locator('.erp-task-board-lane--all tr[data-task-id]')
          await rows.first().waitFor()
          assert.equal(await rows.count(), 20, '待我处理默认显示全部待办的完整分页')
          const firstTaskID = await rows.first().getAttribute('data-task-id')
          await page.locator('.erp-task-pagination .ant-pagination-item-2').click()
          await page.waitForFunction((previousID) => {
            const first = document.querySelector('.erp-task-board-lane--all tr[data-task-id]')
            return first && first.dataset.taskId !== previousID
          }, firstTaskID)
          listPageTaskIDs = await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.taskId))
          assert.equal(listPageTaskIDs.length, 20, '全部待办第二页保持每页条数')
          await page.locator(switcher).evaluate((node) => {
            for (let parent = node.parentElement; parent; parent = parent.parentElement) parent.scrollTop = 0
          })
        }
        const initial = { expectedSelection: today, started: Promise.withResolvers(), release: Promise.withResolvers() }
        heldNext = initial
        if (mobile) await page.getByRole('button', { name: '切换到日历', exact: true }).click()
        else await verifyMobileNavigationMotion(page, assert, switcher, 1)
        const calendar = page.getByRole('region', { name: '待办日历', exact: true })
        await initial.started.promise
        await verifyLayout('calendar')
        try {
          assert.equal(await calendar.locator('.workflow-task-calendar__count').count(), 0, 'initial load leaves unavailable counts blank')
          await calendar.locator('.ant-spin-spinning').waitFor()
          assert.equal(await calendar.locator('.ant-spin-spinning').count(), 1, 'slow initial reads have one local loading indicator')
        } finally {
          initial.release.resolve()
        }
        const selectBucket = async (selection) => {
          const label = selection === 'undated' ? '未设置截止' : selection === 'overdue' ? '已逾期' : '按日期'
          if (!mobile) {
            await calendar.getByRole('button', { name: new RegExp(`^${label}`) }).click()
            return
          }
          await page.getByTestId('mobile-task-list-filter-trigger').click()
          const filters = page.getByRole('dialog', { name: '筛选任务', exact: true })
          assert.equal(await filters.getByText('截止时间', { exact: true }).count(), 0, 'calendar has one date condition')
          await filters.getByLabel('任务截止筛选', { exact: true }).getByText(label, { exact: true }).click()
          await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
          await filters.waitFor({ state: 'hidden' })
          assert.equal(await calendar.locator('.workflow-task-calendar__buckets').count(), 0, 'mobile has one deadline filter entry')
          assert.equal(await calendar.locator('.workflow-task-calendar__month').count(), selection === 'date' ? 1 : 0, 'cross-date results hide the month')
          if (selection !== 'date') assert((await page.getByTestId('mobile-task-list-filter-trigger').getAttribute('title')).includes(label))
        }
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        assert(calls.every((call) => !call.due), 'calendar requests do not retain list deadline conditions')
        if (!mobile) {
          assert(calls.every((call) => !call.lane_key && !call.sort && call.offset === 0), '日历查询独立于列表分类、排序和分页')
          await verifyMobileNavigationMotion(page, assert, switcher, 0, true)
          const rows = page.locator('.erp-task-board-lane--all tr[data-task-id]')
          await rows.first().waitFor()
          assert.equal(new URL(page.url()).searchParams.get('page'), '2', '从日历返回保留全部待办页码')
          assert.deepEqual(await rows.evaluateAll((nodes) => nodes.map((node) => node.dataset.taskId)), listPageTaskIDs, '从日历返回恢复同一页待办')
          await verifyMobileNavigationMotion(page, assert, switcher, 1, true)
          await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
          await page.locator('.erp-task-board-filters').getByRole('button', { name: /^筛选/ }).click()
          const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
          assert.equal(await filters.getByText('截止时间', { exact: true }).count(), 0, 'desktop calendar has one date condition')
          await filters.getByRole('button', { name: '完成', exact: true }).click()
        }
        assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30)
        const monthBefore = await calendar.locator('.workflow-task-calendar__month').boundingBox()
        const emptyDay = calendar.locator('button[data-date][aria-label$="，0 项待办"]').first()
        const emptySelection = await emptyDay.getAttribute('data-date')
        const held = { expectedSelection: emptySelection, started: Promise.withResolvers(), release: Promise.withResolvers() }
        heldNext = held
        await emptyDay.click()
        await held.started.promise
        try {
          await calendar.locator('.ant-spin-spinning').waitFor()
          await page.screenshot({ path: path.join(outputDir, `${name}-pending-date.png`), fullPage: false })
          const pendingCounts = await calendar.locator('.workflow-task-calendar__count').allTextContents()
          assert(!pendingCounts.some((value) => value.trim() === '—'), `switching dates must not replace the month with placeholders: ${JSON.stringify(pendingCounts)}`)
          assert.equal(await calendar.locator(`button[data-date="${today}"] .workflow-task-calendar__count`).textContent(), '65 项', 'same-month totals remain visible while another date loads')
          assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 0, 'another date never displays the previous date tasks')
          const monthPending = await calendar.locator('.workflow-task-calendar__month').boundingBox()
          for (const dimension of ['x', 'y', 'width', 'height']) assert(Math.abs(monthBefore[dimension] - monthPending[dimension]) <= 1, `month ${dimension} stays stable during selection`)
        } finally {
          held.release.resolve()
        }
        await calendar.getByText('当前筛选下暂无待办', { exact: true }).waitFor()
        await calendar.getByRole('button', { name: '今天', exact: true }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        await calendar.locator('.workflow-task-calendar__agenda[aria-busy="false"]').waitFor()
        const cancelled = { expectedSelection: emptySelection, started: Promise.withResolvers(), release: Promise.withResolvers() }
        heldNext = cancelled
        await page.evaluate(() => {
          const originalFetch = window.fetch
          window.__calendarAbortProbe = { originalFetch, requests: [] }
          window.fetch = (input, options) => {
            if (typeof options?.body === 'string') {
              const payload = JSON.parse(options.body)
              if (payload?.params?.calendar_selection) window.__calendarAbortProbe.requests.push({ id: payload.id, selection: payload.params.calendar_selection, signal: options.signal })
            }
            return originalFetch(input, options)
          }
        })
        await emptyDay.click()
        await cancelled.started.promise
        assert.equal(cancelled.selection, emptySelection, 'the held request belongs to the date the user selected')
        try {
          await calendar.getByRole('button', { name: '今天', exact: true }).click()
          await calendar.locator(`button[data-date="${today}"][aria-pressed="true"]`).waitFor()
          await calendar.locator('.workflow-task-calendar__agenda[aria-busy="false"]').waitFor()
          const requests = await page.evaluate(() => window.__calendarAbortProbe.requests.map(({ id, selection, signal }) => ({ id, selection, aborted: signal?.aborted })))
          assert.equal(requests.find(({ id }) => id === cancelled.id)?.aborted, true, `superseded date reads abort their actual fetch signal: ${JSON.stringify({ held: { id: cancelled.id, selection: cancelled.selection }, requests, url: page.url() })}`)
          cancelled.release.resolve()
          assert.equal(await calendar.locator(`button[data-date="${today}"]`).getAttribute('aria-pressed'), 'true', 'the final date selection wins while an earlier read is pending')
          assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30)
        } finally {
          cancelled.release.resolve()
          await page.evaluate(() => {
            window.fetch = window.__calendarAbortProbe.originalFetch
            delete window.__calendarAbortProbe
          })
        }
        const filtered = { expectedKeyword: '未设置截止的跟进', started: Promise.withResolvers(), release: Promise.withResolvers() }
        heldNext = filtered
        const search = mobile ? page.getByRole('searchbox') : page.getByPlaceholder('订单 / 产品 / 物料 / 款号', { exact: true })
        await search.fill('未设置截止的跟进')
        await search.press('Enter')
        await filtered.started.promise
        try {
          assert.equal(await calendar.locator('.workflow-task-calendar__count').count(), 0, 'changed filters cannot reuse totals from the previous scope')
          assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 0, 'changed filters cannot reuse the previous agenda')
        } finally {
          filtered.release.resolve()
        }
        await calendar.getByText('当前筛选下暂无待办', { exact: true }).waitFor()
        await search.fill('')
        await search.press('Enter')
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        tasks[0].task_status_key = 'done'
        await page.evaluate((event) => window.dispatchEvent(new Event(event)), WORKFLOW_TASKS_CHANGED)
        await calendar.locator(`button[data-date="${today}"]`).getByText('64 项', { exact: true }).waitFor()
        const refreshSuccess = page.getByRole('status').filter({ hasText: '待办日历已刷新' })
        assert.equal(await refreshSuccess.count(), 0, 'initial loads, date changes and automatic updates do not announce manual refresh success')
        tasks[0].task_status_key = 'ready'
        const refreshButton = calendar.getByRole('button', { name: '刷新待办日历', exact: true })
        assert.equal(await page.getByRole('button', { name: '刷新当前页', exact: true }).count(), 0, '日历已有独立刷新，页头不重复提供')
        const refreshing = { expectedSelection: today, expectedKeyword: '', started: Promise.withResolvers(), release: Promise.withResolvers() }
        heldNext = refreshing
        await refreshButton.click()
        await refreshing.started.promise
        try {
          assert.equal(await refreshButton.isDisabled(), true, 'refresh stays disabled for the whole request')
          assert.equal(await refreshButton.getAttribute('aria-busy'), 'true')
          await refreshButton.locator('.anticon-loading').waitFor()
          assert.equal(await refreshSuccess.count(), 0, 'success is not shown before the response')
          assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30, 'refresh retains the current agenda')
        } finally {
          refreshing.release.resolve()
        }
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        await refreshSuccess.waitFor()
        assert.equal(await refreshSuccess.count(), 1)
        assert.equal(await refreshButton.isEnabled(), true)
        await page.waitForFunction(() => {
          const notice = [...document.querySelectorAll('[role="status"]')].find((node) => node.textContent === '待办日历已刷新')
          if (!notice) return false
          for (let node = notice; node; node = node.parentElement) {
            if (Number(getComputedStyle(node).opacity) < 0.99) return false
          }
          return true
        })
        await page.screenshot({ path: path.join(outputDir, `${name}-refresh-success.png`), fullPage: false })
        failNext = true
        await refreshButton.click()
        const refreshFailure = page.locator('.ant-message-error [role="alert"]')
        await refreshFailure.waitFor()
        await calendar.getByRole('alert').waitFor()
        assert.equal(await refreshFailure.textContent(), await calendar.locator('.ant-alert-message').textContent(), 'refresh failure has one consistent error explanation')
        assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30, 'a failed refresh retains loaded tasks')
        assert.equal(await refreshButton.isEnabled(), true, 'a failed refresh can be retried')
        await refreshButton.click()
        await refreshSuccess.waitFor()
        await calendar.getByRole('alert').waitFor({ state: 'hidden' })
        if (mobile) {
          await page.getByTestId('mobile-task-list-filter-trigger').click()
          const filters = page.getByRole('dialog', { name: '筛选任务', exact: true })
          assert.equal(await filters.getByText('任务排序', { exact: true }).count(), 0)
          await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
        }
        await search.fill('未设置截止的跟进')
        await search.press('Enter')
        await selectBucket('undated')
        await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
        const filteredCalendarURL = page.url()
        await page.reload()
        await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
        await verifyLayout('calendar')
        assert.equal(page.url(), filteredCalendarURL, '刷新保留日历视图、选定范围与搜索条件')
        assert.equal(await search.inputValue(), '未设置截止的跟进', '刷新后搜索框与当前日历结果一致')
        await search.fill('')
        await search.press('Enter')
        await selectBucket('undated')
        await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
        await calendar.locator('.erp-task-timing').getByText('未设置截止', { exact: true }).waitFor()
        assert.equal(await calendar.locator('.erp-task-timing time').count(), 0)
        await calendar.locator('.erp-task-card__open').click()
        if (mobile) {
          await page.getByTestId('mobile-task-detail-screen').waitFor()
          await page.getByRole('button', { name: '返回任务列表', exact: true }).click()
        } else {
          await page.locator('.erp-task-action-drawer:visible').waitFor()
          await page.getByRole('button', { name: '返回列表', exact: true }).click()
        }
        if (mobile) assert((await page.getByTestId('mobile-task-list-filter-trigger').getAttribute('title')).includes('未设置截止'))
        else await calendar.getByRole('button', { name: /^未设置截止/, pressed: true }).waitFor()
        await page.reload()
        await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
        await verifyLayout('calendar')
        await selectBucket('overdue')
        await calendar.getByText('上月尚未处理的跟进', { exact: true }).waitFor()
        if (mobile) {
          await page.screenshot({ path: path.join(outputDir, `${name}-overdue.png`) })
          await page.getByRole('button', { name: '清空任务筛选', exact: true }).click()
          await calendar.locator('.workflow-task-calendar__month').waitFor()
          assert.equal(await page.getByTestId('mobile-task-list-filter-trigger').getAttribute('aria-label'), '筛选任务')
          await selectBucket('undated')
          await page.getByRole('button', { name: '清空任务筛选', exact: true }).tap()
          await calendar.locator(`button[data-date="${today}"][aria-pressed="true"]`).waitFor()
          assert.equal(await page.getByRole('button', { name: '清空任务筛选', exact: true }).count(), 0)
          await selectBucket('undated')
          await page.getByTestId('mobile-task-list-filter-trigger').click()
          const filters = page.getByRole('dialog', { name: '筛选任务', exact: true })
          await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
          await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
          await calendar.locator(`button[data-date="${today}"][aria-pressed="true"]`).waitFor()
        }
        await calendar.getByRole('button', { name: '下个月', exact: true }).click()
        await calendar.getByText('下月跟进', { exact: true }).waitFor()
        await verifyCalendarAlignment(calendar, assert)
        assert.equal(await calendar.getByRole('button', { name: /已逾期/ }).count(), mobile ? 0 : 1)
        failNext = true
        await calendar.locator(`button[data-date="${nextMonth}-02"]`).click()
        await calendar.getByRole('alert').waitFor()
        assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 0, 'failed date never retains another day')
        await calendar.getByRole('button', { name: '重新加载', exact: true }).click()
        await calendar.getByText('当前筛选下暂无待办', { exact: true }).waitFor()
        slowNext = true
        await calendar.getByRole('button', { name: '上个月', exact: true }).click()
        await calendar.getByRole('button', { name: '下个月', exact: true }).click()
        await calendar.getByText('下月跟进', { exact: true }).waitFor()
        await calendar.getByRole('button', { name: '今天', exact: true }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        duplicateNext = true
        await calendar.locator('.workflow-task-calendar__tail').scrollIntoViewIfNeeded()
        if (!mobile) await calendar.getByRole('button', { name: /继续加载/ }).click()
        await calendar.getByRole('alert').waitFor()
        assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30, 'changed pagination stops instead of repeatedly appending duplicates')
        await calendar.getByRole('button', { name: '重新加载', exact: true }).click()
        await calendar.getByRole('alert').waitFor({ state: 'hidden' })
        tasks[0].task_status_key = 'done'
        await calendar.locator('.workflow-task-calendar__tail').scrollIntoViewIfNeeded()
        if (!mobile) await calendar.getByRole('button', { name: /继续加载/ }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('64 项', { exact: true }).waitFor()
        assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30, 'a changed live result set replaces the first page')
        await calendar.getByText('日历跟进 31', { exact: true }).waitFor()
        tasks[0].task_status_key = 'ready'
        await calendar.getByRole('button', { name: '刷新待办日历', exact: true }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        while (await calendar.locator('.workflow-task-calendar__task').count() < 65) {
          const before = await calendar.locator('.workflow-task-calendar__task').count()
          await calendar.locator('.workflow-task-calendar__tail').scrollIntoViewIfNeeded()
          if (!mobile) await calendar.getByRole('button', { name: /继续加载/ }).click()
          await page.waitForFunction((minimum) => document.querySelectorAll('.workflow-task-calendar__task').length > minimum, before)
        }
        assert.equal(new Set(await calendar.locator('.workflow-task-calendar__task').evaluateAll((nodes) => nodes.map((node) => node.dataset.taskId))).size, 65)
        if (mobile) {
          await page.getByTestId('mobile-role-scroll').evaluate((node) => node.scrollTo({ top: 0 }))
          await page.getByRole('button', { name: '切换到列表', exact: true }).click()
          await verifyLayout('list')
          await page.reload()
          await verifyLayout('list')
          await page.getByRole('button', { name: '切换到日历', exact: true }).click()
          await verifyLayout('calendar')
        } else {
          await page.locator(switcher).scrollIntoViewIfNeeded()
          await verifyMobileNavigationMotion(page, assert, switcher, 0, true)
          await verifyMobileNavigationMotion(page, assert, switcher, 1, true)
        }
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        if (!mobile) {
          await page.goto(new URL('/erp/dashboard', page.url()).href)
          await page.getByRole('button', { name: '待办日历', exact: true }).click()
          await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        }
        assert(calls.every((q) => mobile ? q.method === 'list_role_tasks' && q.role_key === 'engineering' && q.view_key === 'todo' : q.method === 'get_task_board' && q.todo_only === true), 'both views preserve their original server scope')
        await calendar.getByRole('button', { name: '今天', exact: true }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        const geometry = await calendar.evaluate((node) => {
          const month = node.querySelector('.workflow-task-calendar__month').getBoundingClientRect()
          const agenda = node.querySelector('.workflow-task-calendar__agenda').getBoundingClientRect()
          return { monthRight: month.right, monthBottom: month.bottom, agendaLeft: agenda.left, agendaTop: agenda.top, overflow: node.scrollWidth - node.clientWidth }
        })
        assert(geometry.overflow < 2 && (mobile ? geometry.agendaTop >= geometry.monthBottom : geometry.agendaLeft >= geometry.monthRight), `responsive calendar layout: ${JSON.stringify(geometry)}`)
        await page.keyboard.press('Escape')
        if (!mobile) await page.locator('.ant-popover:visible').waitFor({ state: 'hidden' })
        const emptyDate = calendar.locator('button[data-date][aria-label$="，0 项待办"]').first()
        await emptyDate.click()
        await calendar.getByText('当前筛选下暂无待办', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, `${name}-empty-preview.png`), fullPage: false })
        await verifyCalendarAlignment(calendar, assert)
        await emptyDate.focus()
        await page.keyboard.press('Space')
        assert.equal(await emptyDate.getAttribute('aria-pressed'), 'true', 'dates support keyboard selection')
        const focus = await emptyDate.locator('.workflow-task-calendar__date').evaluate((node) => getComputedStyle(node).outlineStyle)
        assert.equal(focus, 'solid', 'keyboard focus is visible on the date marker')
        await calendar.getByRole('button', { name: '今天', exact: true }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        const ordinary = await verifyCalendarAlignment(calendar, assert)
        const fixtureLength = tasks.length
        tasks.push(...Array.from({ length: 70 }, (_, index) => fixture(98900 + index, `大量待办 ${index + 1}`, timestamp(today))))
        await calendar.getByRole('button', { name: '刷新待办日历', exact: true }).click()
        const crowdedDay = calendar.locator(`button[data-date="${today}"]`)
        await crowdedDay.getByText('99+', { exact: true }).waitFor()
        assert.equal(await crowdedDay.getAttribute('aria-label'), `${today}，135 项待办`, 'compact day count preserves the complete accessible count')
        await calendar.getByText(/到期 · 135 项/, { exact: false }).waitFor()
        const crowded = await verifyCalendarAlignment(calendar, assert)
        assert(Math.abs(ordinary.selection.width - crowded.selection.width) <= 1, 'wide counts do not stretch the selection marker')
        tasks.length = fixtureLength
        await calendar.getByRole('button', { name: '刷新待办日历', exact: true }).click()
        await crowdedDay.getByText('65 项', { exact: true }).waitFor()
        await page.mouse.move(0, 0)
        await page.screenshot({ path: path.join(outputDir, `${name}-preview.png`), fullPage: false })
      },
    }
  }).concat(taskCalendarDesignScenario(deps))
}

function taskCalendarDesignScenario({ assert, path, outputDir }) {
  return {
    name: 'task-calendar-design',
    path: '/__dev/ui-design?page=task-handling',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('heading', { name: '交互设计', exact: true }).waitFor()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.locator('[data-action="board-mode"][data-value="todo"]').click()
      const desktopSwitch = frame.locator('.task-calendar-switch[data-device="desktop"]')
      const calendarButton = desktopSwitch.getByRole('button', { name: '日历', exact: true })
      await calendarButton.click()
      assert.equal(await calendarButton.getAttribute('aria-pressed'), 'true', '电脑版日历切换必须实际更新选中状态')
      const calendar = frame.getByRole('region', { name: '待办日历', exact: true })
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      const geometry = await calendar.evaluate((root) => {
        const centerX = (node) => { const rect = node.getBoundingClientRect(); return rect.x + rect.width / 2 }
        const week = root.querySelector('.task-calendar-demo-week')
        const grid = root.querySelector('.task-calendar-demo-grid')
        const head = root.querySelector('.task-calendar-demo-head')
        return {
          titleOffset: Math.abs(centerX(head) - centerX(head.querySelector('strong'))),
          columnOffsets: [...grid.children].flatMap((node, index) => node.matches('button') ? [Math.abs(centerX(node) - centerX(week.children[index % 7]))] : []),
          week: { columns: getComputedStyle(week).gridTemplateColumns, gap: getComputedStyle(week).gap, before: getComputedStyle(week, '::before').content, children: [...week.children].map((node) => node.outerHTML) },
          grid: { columns: getComputedStyle(grid).gridTemplateColumns, gap: getComputedStyle(grid).gap },
        }
      })
      assert(geometry.titleOffset <= 1 && Math.max(...geometry.columnOffsets) <= 1, `design calendar shares centered title and weekday columns: ${JSON.stringify(geometry)}`)
      const agenda = calendar.getByRole('table', { name: '待办任务', exact: true })
      const taskRows = agenda.locator('tbody tr[data-action="open-task"]')
      assert(await taskRows.count() > 0)
      const firstTaskId = await taskRows.first().getAttribute('data-id')
      await taskRows.first().locator('button[data-action="open-task"]').click()
      await frame.locator('.drawer').waitFor()
      await frame.locator('.drawer-head [data-action="close-drawer"]').click()
      await frame.locator('.drawer').waitFor({ state: 'hidden' })
      assert.equal(await calendar.getByRole('button', { name: /^2026-10-14/ }).getAttribute('aria-pressed'), 'true', '关闭任务详情后保留日历选择')
      assert.equal(await taskRows.first().getAttribute('data-id'), firstTaskId)
      const agendaGeometry = await calendar.evaluate((root) => {
        const month = root.querySelector('.task-calendar-demo-month').getBoundingClientRect()
        const items = root.querySelector('.task-calendar-demo-items').getBoundingClientRect()
        const table = root.querySelector('.table-wrap').getBoundingClientRect()
        return {
          calendarOverflow: root.scrollWidth - root.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          monthRight: month.right,
          agendaLeft: items.left,
          agendaRight: items.right,
          tableRight: table.right,
        }
      })
      assert(agendaGeometry.calendarOverflow <= 1 && agendaGeometry.pageOverflow <= 1 && agendaGeometry.agendaLeft >= agendaGeometry.monthRight && agendaGeometry.tableRight <= agendaGeometry.agendaRight + 1, `日历任务表格在议程内滚动并与月份并排：${JSON.stringify(agendaGeometry)}`)
      await calendar.getByRole('button', { name: '下个月', exact: true }).click()
      await calendar.getByRole('button', { name: /^2026-11-01/ }).waitFor()
      await calendar.getByRole('button', { name: '今天', exact: true }).click()
      await frame.locator('.nav-item[data-page="dashboard"]').click()
      await frame.getByRole('button', { name: '待办日历', exact: true }).click()
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      await page.screenshot({ path: path.join(outputDir, 'task-calendar-design-desktop-4k.png') })
      await page.goto(new URL('/__dev/ui-design?page=mobile-tasks', page.url()).href)
      const switchMobileLayout = async (layout) => {
        const button = frame.getByRole('button', { name: layout === 'calendar' ? '切换到日历' : '切换到列表', exact: true })
        await button.waitFor()
        const icon = button.locator('svg')
        assert.equal(await icon.count(), 1, '手机视图切换使用已登记图标')
        assert.equal(await icon.isVisible(), true, '手机视图切换图标可见')
        await button.click()
      }
      await switchMobileLayout('calendar')
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      assert(await calendar.locator('.rm-task-card').count() > 0)
      await frame.locator('[data-action="mobile-options"]').click()
      await frame.locator('[data-action="mobile-calendar-filter"][data-value="undated"]').click()
      await frame.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await calendar.getByText(/未设置截止日期/).waitFor()
      assert.equal(await calendar.locator('.task-calendar-demo-month').count(), 0)
      assert.equal(await calendar.locator('.task-calendar-demo-buckets').count(), 0)
      await frame.getByRole('button', { name: '清空任务筛选', exact: true }).click()
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      await switchMobileLayout('list')
      assert.equal(await calendar.count(), 0)
      await page.screenshot({ path: path.join(outputDir, 'task-calendar-design-mobile-list-4k.png') })
      await switchMobileLayout('calendar')
      await page.screenshot({ path: path.join(outputDir, 'task-calendar-design-mobile-4k.png') })
    },
  }
}
