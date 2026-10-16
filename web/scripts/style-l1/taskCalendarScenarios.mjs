import { mobileTaskListOptionsScenario } from './mobileTaskListOptionsScenario.mjs'
import { createDashboardTaskScenarios } from './dashboardTaskScenarios.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { currentBusinessDate, unixSecondsToBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { shiftCalendarMonth } from '../../src/erp/utils/workflowTaskCalendar.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../src/erp/utils/workflowTaskChanges.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

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
          if (heldNext) {
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
          const offset = duplicateNext && q.calendar_offset ? 0 : q.calendar_offset || 0
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
offset: q.calendar_offset || 0,
limit: q.limit,
snapshot_at: now,
            items: selected.slice(offset, offset + q.limit),
          } } })
        })
      },
      verify: async (page) => {
        const switcher = '[aria-label="待办显示方式"]'
        await page.locator(switcher).waitFor()
        assert.equal(await page.getByRole('region', { name: '待办日历', exact: true }).count(), 0)
        const initial = { started: Promise.withResolvers(), release: Promise.withResolvers() }
        heldNext = initial
        await verifyMobileNavigationMotion(page, assert, switcher, 1)
        const calendar = page.getByRole('region', { name: '待办日历', exact: true })
        await initial.started.promise
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
          if (selection !== 'date') await page.getByRole('button', { name: `清除${label}`, exact: true }).waitFor()
        }
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        assert(calls.every((call) => !call.due), 'calendar requests do not retain list deadline conditions')
        if (!mobile) {
          await page.locator('.erp-task-board-filters').getByRole('button', { name: /^筛选/ }).click()
          const filters = page.getByRole('dialog', { name: '筛选条件', exact: true })
          assert.equal(await filters.getByText('截止时间', { exact: true }).count(), 0, 'desktop calendar has one date condition')
          await filters.getByRole('button', { name: '完成', exact: true }).click()
        }
        assert.equal(await calendar.locator('.workflow-task-calendar__task').count(), 30)
        const monthBefore = await calendar.locator('.workflow-task-calendar__month').boundingBox()
        const emptyDay = calendar.locator('button[data-date][aria-label$="，0 项待办"]').first()
        const held = { started: Promise.withResolvers(), release: Promise.withResolvers() }
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
        const cancelled = { started: Promise.withResolvers(), release: Promise.withResolvers() }
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
        const filtered = { started: Promise.withResolvers(), release: Promise.withResolvers() }
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
        tasks[0].task_status_key = 'ready'
        await calendar.getByRole('button', { name: '刷新待办日历', exact: true }).click()
        await calendar.locator(`button[data-date="${today}"]`).getByText('65 项', { exact: true }).waitFor()
        if (mobile) {
          await page.getByTestId('mobile-task-list-filter-trigger').click()
          const filters = page.getByRole('dialog', { name: '筛选任务', exact: true })
          assert.equal(await filters.getByText('任务排序', { exact: true }).count(), 0)
          await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
          await page.getByRole('searchbox').fill('未设置截止的跟进')
          await page.getByRole('searchbox').press('Enter')
          await selectBucket('undated')
          await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
          await page.reload()
          await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
          assert.equal(await page.getByRole('searchbox').inputValue(), '未设置截止的跟进', 'changing the calendar date preserves mobile search on reload')
          await page.getByRole('searchbox').fill('')
          await page.getByRole('searchbox').press('Enter')
        }
        await selectBucket('undated')
        await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
        await calendar.locator('.erp-task-card__open').click()
        if (mobile) {
          await page.getByTestId('mobile-task-detail-screen').waitFor()
          await page.getByRole('button', { name: '返回任务列表', exact: true }).click()
        } else {
          await page.locator('.erp-task-action-drawer:visible').waitFor()
          await page.getByRole('button', { name: '返回列表', exact: true }).click()
        }
        if (mobile) await page.getByRole('button', { name: '清除未设置截止', exact: true }).waitFor()
        else await calendar.getByRole('button', { name: /^未设置截止/, pressed: true }).waitFor()
        await page.reload()
        await calendar.getByText('未设置截止的跟进', { exact: true }).waitFor()
        await selectBucket('overdue')
        await calendar.getByText('上月尚未处理的跟进', { exact: true }).waitFor()
        if (mobile) {
          await page.screenshot({ path: path.join(outputDir, `${name}-overdue.png`) })
          await page.getByRole('button', { name: '清除已逾期', exact: true }).click()
          await calendar.locator('.workflow-task-calendar__month').waitFor()
          assert.equal(await page.getByTestId('mobile-task-list-filter-trigger').getAttribute('aria-label'), '筛选任务')
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
        while (await calendar.locator('.workflow-task-calendar__task').count() < 65) {
          const before = await calendar.locator('.workflow-task-calendar__task').count()
          await calendar.locator('.workflow-task-calendar__tail').scrollIntoViewIfNeeded()
          if (!mobile) await calendar.getByRole('button', { name: /继续加载/ }).click()
          await page.waitForFunction((minimum) => document.querySelectorAll('.workflow-task-calendar__task').length > minimum, before)
        }
        assert.equal(new Set(await calendar.locator('.workflow-task-calendar__task').evaluateAll((nodes) => nodes.map((node) => node.dataset.taskId))).size, 65)
        await page.locator(switcher).scrollIntoViewIfNeeded()
        await verifyMobileNavigationMotion(page, assert, switcher, 0, true)
        await verifyMobileNavigationMotion(page, assert, switcher, 1, true)
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
      await page.getByRole('heading', { name: 'UI 交互设计', exact: true }).waitFor()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.locator('[data-action="board-mode"][data-value="todo"]').click()
      await frame.locator('[data-action="task-calendar-layout"][data-value="calendar"]').click()
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
      assert(await calendar.locator('.task-calendar-demo-items .task-card').count() > 0)
      await calendar.getByRole('button', { name: '下个月', exact: true }).click()
      await calendar.getByRole('button', { name: /^2026-11-01/ }).waitFor()
      await calendar.getByRole('button', { name: '今天', exact: true }).click()
      await frame.locator('.nav-item[data-page="dashboard"]').click()
      await frame.getByRole('button', { name: '待办日历', exact: true }).click()
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      await page.screenshot({ path: path.join(outputDir, 'task-calendar-design-desktop-4k.png') })
      await page.goto(new URL('/__dev/ui-design?page=mobile-tasks', page.url()).href)
      await frame.locator('[data-action="task-calendar-layout"][data-value="calendar"]').click()
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      assert(await calendar.locator('.rm-task-card').count() > 0)
      await frame.locator('[data-action="mobile-options"]').click()
      await frame.locator('[data-action="mobile-calendar-filter"][data-value="undated"]').click()
      await frame.locator('[data-action="mobile-options-close"]').click()
      await calendar.getByText(/未设置截止日期/).waitFor()
      assert.equal(await calendar.locator('.task-calendar-demo-month').count(), 0)
      assert.equal(await calendar.locator('.task-calendar-demo-buckets').count(), 0)
      await frame.getByRole('button', { name: '清除未设置截止', exact: true }).click()
      await calendar.getByRole('button', { name: /^2026-10-14/ }).waitFor()
      await frame.locator('[data-action="task-calendar-layout"][data-value="list"]').click()
      assert.equal(await calendar.count(), 0)
      await frame.locator('[data-action="task-calendar-layout"][data-value="calendar"]').click()
      await page.screenshot({ path: path.join(outputDir, 'task-calendar-design-mobile-4k.png') })
    },
  }
}
