import { clickMobileThemeOption } from './mobileTaskThemeAssertions.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertFilterAffordance, assertMobileSearchAffordance } from './controlAffordanceAssertions.mjs'
import {
  assertMobileFilterEdgePositions,
  assertMobileFilterOutsideDismissal,
} from './mobileFilterPopoverAssertions.mjs'
import { assertMobileFilterClearControl } from './mobileFilterConsistencyAssertions.mjs'

export async function chooseMobileFilterOption(control, label) {
  const select = control.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
  if (label === '最近进入') {
    const clear = select.locator('.ant-select-clear')
    if (await clear.count()) {
      await select.hover()
      await clear.click()
    }
    return
  }
  await select.locator('.ant-select-selector').click()
  await control.page().locator('.ant-select-dropdown:visible').getByText(label, { exact: true }).click()
}

export function mobileTaskListOptionsScenario({ assert, path, outputDir }) {
  const baseTime = 1_788_840_000
  const tasks = Array.from({ length: 64 }, (_, index) => ({
    id: 97000 + index,
    version: 1,
    task_code: `STYLE-L1-SORT-${index}`,
    task_name: `排序模拟任务 ${index}`,
    task_group: 'engineering_check',
    owner_role_key: 'engineering',
    task_status_key: index % 3 === 0 ? 'blocked' : 'ready',
    required_capability_key: 'workflow.task.approve',
    source_type: 'style_task',
    source_id: index + 1,
    source_no: `SORT-${index}`,
    created_at: baseTime + Math.floor(index / 2) * 60,
    updated_at: baseTime + (64 - index) * 60,
    due_at:
      index % 5 === 0 ? null : baseTime + Math.floor((64 - index) / 2) * 60,
    priority: index % 4,
    blocked_reason: index % 3 === 0 ? '等待确认' : '',
    payload: {},
  }))
  const permissions = [
    'mobile.engineering.access',
    'workflow.task.read',
    'workflow.task.approve',
  ]
  return {
    name: 'mobile-task-list-sort-and-status',
    path: '/m/engineering/tasks',
    auth: 'admin',
    customerKey: 'yoyoosun',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    adminProfile: {
      username: 'style-l1-task-order',
      is_super_admin: false,
      roles: [{ role_key: 'engineering', name: '工程' }],
      permissions,
      menus: [],
    },
    effectiveSession: {
      configRevision: 'style-l1-task-order',
      configHash: 'style-l1-task-order-hash',
      customer: { key: 'yoyoosun', name: '永绅' },
      pages: [],
      actions: permissions,
      workflow_visible_owner_role_keys_by_capability: {
        'workflow.task.read': ['engineering'],
        'workflow.task.approve': ['engineering'],
      },
      fieldPolicies: {},
      workPools: [],
      source: 'active_customer_config_revision',
    },
    workflowTaskFixtures: [
      ...tasks,
      {
        ...tasks[0],
        id: 98000,
        task_code: 'STYLE-L1-SORT-DONE',
        task_name: '已办模拟任务',
        task_status_key: 'done',
        completed_at: baseTime + 7200,
      },
    ],
    verify: async (page) => {
      const searchRoot = page.locator(
        '.mobile-role-task-search .erp-mobile-search'
      )
      await searchRoot.waitFor()
      await assertMobileSearchAffordance(searchRoot)

      const rows = page.locator('.erp-mobile-list-item')
      const range = page.getByTestId('mobile-task-list-range')
      const scroller = page.getByTestId('mobile-role-scroll')
      const filterTrigger = page.getByTestId('mobile-task-list-filter-trigger')
      const assertRiskFilters = async (theme) => {
        const filters = page.getByTestId('mobile-role-risk-filters')
        const warning = page.getByTestId('mobile-role-risk-filter-warning')
        const overdue = page.getByTestId('mobile-role-risk-filter-notice')
        await page.evaluate(() => document.fonts.ready)
        assert.equal(await filters.getAttribute('role'), 'group')
        assert.equal(await filters.getByRole('tab').count(), 0)
        if (await overdue.getAttribute('aria-pressed') === 'true') await warning.click()
        await page.waitForFunction(() => {
          const counts = document.querySelectorAll('[data-testid="mobile-role-risk-filters"] .mobile-role-task-filter__count')
          return counts.length === 2 && Array.from(counts).every((item) => /^\d+$/.test(item.textContent.trim())) && document.querySelectorAll('.mobile-role-message-card').length > 0
        })
        const keyword = await page.getByRole('searchbox').inputValue()
        const filterLabel = await filterTrigger.getAttribute('aria-label')
        const counts = await filters.locator('.mobile-role-task-filter__count').allTextContents()
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await assertFilterAffordance(filters.getByRole('button'), 34)
          const geometry = await filters.evaluate((node) => {
            const box = node.getBoundingClientRect()
            const buttons = Array.from(node.querySelectorAll('button')).map((button) => {
              const label = button.querySelector('.mobile-role-task-filter__label').getBoundingClientRect()
              const count = button.querySelector('.mobile-role-task-filter__count').getBoundingClientRect()
              return { box: button.getBoundingClientRect().toJSON(), centerDelta: Math.abs((label.top + label.bottom - count.top - count.bottom) / 2) }
            })
            return { width: node.clientWidth, scrollWidth: node.scrollWidth, edgesVisible: Boolean(node.querySelector(':scope > .app-scroll-edges:not([hidden])[data-left="true"],:scope > .app-scroll-edges:not([hidden])[data-right="true"]')), box: box.toJSON(), buttons, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth }
          })
          assert(geometry.pageOverflow <= 1, JSON.stringify(geometry))
          assert(geometry.scrollWidth <= geometry.width + 1, JSON.stringify(geometry))
          assert.equal(geometry.edgesVisible, false, `${theme}/${width} 两项筛选完整显示时不得渐隐`)
          assert(geometry.buttons.every((item) => item.centerDelta <= 1 && item.box.right <= geometry.box.right + 1), JSON.stringify(geometry))
        }
        await page.setViewportSize({ width: 390, height: 844 })
        const before = await filters.boundingBox()
        await overdue.focus()
        await page.keyboard.press('Enter')
        assert.equal(await overdue.getAttribute('aria-pressed'), 'true')
        assert.equal(await warning.getAttribute('aria-pressed'), 'false')
        await page.waitForFunction(() => document.querySelectorAll('.mobile-role-message-card').length > 0)
        const overdueIDs = await page.locator('.mobile-role-message-card').evaluateAll((nodes) => nodes.map((node) => Number(node.dataset.mobileTaskId)))
        assert(overdueIDs.length > 0, '超时筛选需要实际匹配的任务')
        assert(overdueIDs.every((id) => tasks.some((task) => task.id === id && task.due_at && task.due_at < Date.now() / 1000)), '超时结果只含已超过截止时间的风险任务')
        await assertFilterAffordance(filters.getByRole('button'), 34)
        await warning.focus()
        await page.keyboard.press('Space')
        assert.equal(await warning.getAttribute('aria-pressed'), 'true')
        assert.equal(await overdue.getAttribute('aria-pressed'), 'false')
        await page.waitForFunction((expected) => {
          const counts = Array.from(document.querySelectorAll('[data-testid="mobile-role-risk-filters"] .mobile-role-task-filter__count'), (node) => node.textContent.trim())
          return counts.length === expected.length && counts.every((count, index) => count === expected[index].trim())
        }, counts)
        assert.equal(await page.getByRole('searchbox').inputValue(), keyword)
        assert.equal(await filterTrigger.getAttribute('aria-label'), filterLabel)
        assert.deepEqual(await filters.locator('.mobile-role-task-filter__count').allTextContents(), counts)
        const after = await filters.boundingBox()
        assert(Math.abs(before.height - after.height) <= 1, '切换风险筛选后高度稳定')
        if (theme === 'light') {
          await scroller.evaluate((node) => node.scrollTo({ top: 420, behavior: 'instant' }))
          assert(await scroller.evaluate((node) => node.scrollTop > 0), '风险列表需实际发生滚动')
          const pinned = await filters.boundingBox()
          assert(Math.abs(pinned.y - after.y) <= 1, '风险筛选与搜索整体吸顶')
        }
        await scroller.evaluate((node) => node.scrollTo({ top: 0, behavior: 'instant' }))
        await page.screenshot({ path: path.join(outputDir, `mobile-risk-filters-${theme}.png`) })
      }
      const ids = () =>
        rows.evaluateAll((elements) =>
          elements.map((element) => Number(element.dataset.mobileTaskId))
        )
      const waitCount = async (count) =>
        page.waitForFunction(
          (expected) =>
            document.querySelectorAll('.erp-mobile-list-item').length ===
            expected,
          count
        )
      const waitFirst = async (id) =>
        page.waitForFunction(
          (expected) =>
            Number(
              document.querySelector('.erp-mobile-list-item')?.dataset
                .mobileTaskId
            ) === expected,
          id
        )
      const waitSearchValue = async (value) =>
        page.waitForFunction(
          (expected) =>
            document.querySelector('.mobile-role-task-search input')?.value ===
            expected,
          value
        )
      const openFilters = async (contextLabel = '任务') => {
        if (!(await filterTrigger.isVisible())) await page.getByRole('button', { name: '取消搜索', exact: true }).click()
        await filterTrigger.click()
        const dropdown = page.getByRole('dialog', {
          name: `筛选${contextLabel}`,
          exact: true,
        })
        await dropdown.waitFor({ state: 'visible' })
        assert.equal(await dropdown.getByRole('textbox', { name: '搜索办理人', exact: true }).count(), 0, '少量办理人直接点选')
        return dropdown
      }
      const tapCloseFilter = async (dropdown) => {
        const bounds = await dropdown.getByRole('button', { name: '关闭筛选', exact: true }).boundingBox()
        await page.touchscreen.tap(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2
        )
      }
      const chooseFilter = async (dropdown, label) => {
        const sort = { 最近进入: 'newest', 截止最早: 'due', 等待最久: 'oldest' }[label]
        if (sort) await chooseMobileFilterOption(dropdown.getByRole('combobox', { name: '任务排序', exact: true }), label)
        else await dropdown.getByText(label, { exact: true }).click()
        assert(await dropdown.isVisible(), '即时筛选保持浮层打开，允许连续切换')
        await dropdown
          .getByRole('button', { name: '关闭筛选', exact: true })
          .click()
        await dropdown.waitFor({ state: 'hidden' })
      }
      const applyFilters = async ({ sort, status, contextLabel = '任务' }) => {
        if (sort) await chooseFilter(await openFilters(contextLabel), sort)
        if (status) await chooseFilter(await openFilters(contextLabel), status)
      }

      await waitFirst(97063)
      assert.match(await range.innerText(), /已显示 12 项.*共 64 项/u)
      assert.equal(await filterTrigger.getAttribute('aria-label'), '筛选任务')

      await page.getByTestId('mobile-role-filter-overdue').click()
      const deadlineFilters = await openFilters()
      await deadlineFilters.getByRole('group', { name: '截止时间', exact: true }).getByRole('button', { name: '未设置到期', exact: true }).click()
      assert.equal(await page.getByTestId('mobile-role-filter-overdue').getAttribute('aria-pressed'), 'false', '具体截止条件替换超时快捷范围')
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-list-range"]')?.textContent.includes('共 13 项'))
      const sourceOption = deadlineFilters.getByRole('group', { name: '来源单据', exact: true }).getByRole('button', { name: '来源待核对', exact: true })
      await sourceOption.waitFor({ timeout: 5000 })
      await Promise.all([
        page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.postDataJSON()?.method === 'list_role_tasks' && request.postDataJSON()?.params.due === 'noDue' && request.postDataJSON()?.params.source_type === 'style_task'),
        sourceOption.click(),
      ])
      await deadlineFilters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await deadlineFilters.waitFor({ state: 'hidden' })
      await chooseFilter(await openFilters(), '全部截止时间')
      await waitFirst(97063)
      const sourceFilters = await openFilters()
      await sourceFilters.getByRole('group', { name: '来源单据', exact: true }).getByRole('button', { name: '全部', exact: true }).click()
      await sourceFilters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await waitFirst(97063)
      assert.match(await range.innerText(), /共 64 项/u)
      const approvalShortcut = page.getByTestId('mobile-role-filter-approval')
      await approvalShortcut.click()
      assert.equal(await approvalShortcut.locator('.erp-filter-chip__clear').count(), 1)
      await approvalShortcut.click()
      assert.equal(await approvalShortcut.getAttribute('aria-pressed'), 'false')
      await waitFirst(97063)

      for (const width of [320, 390, 440]) {
        await page.setViewportSize({ width, height: 844 })
        const geometry = await page.evaluate(() => {
          const rect = (selector) =>
            document.querySelector(selector)?.getBoundingClientRect().toJSON()
          const selected = document.querySelector(
            '.mobile-role-task-filters .erp-filter-chip[aria-pressed="true"]'
          )
          return {
            clientWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            query: rect('.mobile-role-task-query'),
            search: rect('.mobile-role-task-search'),
            filter: rect('.mobile-role-task-query .mobile-filter-control'),
            tabs: rect('.mobile-task-view-switch'),
            chips: rect('.mobile-role-task-filters'),
            selectedShadow: selected
              ? getComputedStyle(selected).boxShadow
              : null,
            checkCount: document.querySelectorAll('.erp-filter-chip__check')
              .length,
          }
        })
        assert(
          geometry.scrollWidth <= geometry.clientWidth + 1,
          JSON.stringify(geometry)
        )
        assert(
          geometry.query.height === 46 && geometry.filter.height === 46,
          `搜索和统一筛选保持同一行：${JSON.stringify(geometry)}`
        )
        assert(
          geometry.search.right <= geometry.filter.x - 6,
          `搜索与筛选保留清晰间距：${JSON.stringify(geometry)}`
        )
        assert(
          geometry.chips.bottom - geometry.query.top <= 110,
          `列表顶部控制区保持紧凑：${JSON.stringify(geometry)}`
        )
        assert.equal(geometry.checkCount, 0, '选中控件不使用勾选图标')
        assert.equal(
          geometry.selectedShadow,
          'none',
          '快捷筛选不使用粗底边或阴影'
        )
        await assertMobileFilterEdgePositions({
          page,
          assert,
          trigger: filterTrigger,
          dialog: page.getByRole('dialog', { name: '筛选任务', exact: true }),
        })
      }
      await page.setViewportSize({ width: 390, height: 844 })

      for (const fromField of [false, true]) {
        const escapeDropdown = await openFilters()
        if (fromField) await escapeDropdown.getByRole('combobox', { name: '任务排序', exact: true }).focus()
        await page.keyboard.press('Escape')
        await escapeDropdown.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('data-testid') ===
            'mobile-task-list-filter-trigger'
        )
        assert.equal(
          await filterTrigger.getAttribute('aria-label'),
          '筛选任务',
          'Escape 只关闭浮层，不改变查询'
        )
      }

      const immediateDropdown = await openFilters()
      assert.equal(await immediateDropdown.locator('details').count(), 0, '手机常用条件保持直接可见')
      assert.equal(await immediateDropdown.locator('.ant-select').count(), 1, '少量来源直接点选，仅次要排序使用单行选择')
      const controls = await immediateDropdown.locator('.mobile-filter-options .erp-filter-chip').evaluateAll((nodes) => nodes.map((node) => ({ height: node.getBoundingClientRect().height, overflow: node.scrollWidth - node.clientWidth })))
      for (const label of ['任务状态筛选', '截止时间']) await immediateDropdown.getByRole('group', { name: label, exact: true }).waitFor()
      await immediateDropdown.getByRole('combobox', { name: '任务排序', exact: true }).waitFor()
      assert(controls.length > 0 && controls.every(({ height, overflow }) => height >= 44 && overflow <= 1), JSON.stringify(controls))
      await chooseMobileFilterOption(immediateDropdown.getByRole('combobox', { name: '任务排序', exact: true }), '截止最早')
      assert(await immediateDropdown.isVisible(), '点选立即生效且保留筛选面板')
      await chooseMobileFilterOption(immediateDropdown.getByRole('combobox', { name: '任务排序', exact: true }), '最近进入')
      await chooseFilter(immediateDropdown, '等待最久')
      await waitFirst(97001)
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务，已应用 1 项',
        '下拉层内选择应立即生效'
      )
      assert(
        await filterTrigger.evaluate((node) => node === document.activeElement),
        '收起后焦点返回筛选入口'
      )
      await assertMobileFilterOutsideDismissal({
        page,
        assert,
        trigger: filterTrigger,
        dialog: page.getByRole('dialog', { name: '筛选任务', exact: true }),
      })
      await waitFirst(97001)

      const resetDropdown = await openFilters()
      await resetDropdown
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      assert(await resetDropdown.isVisible(), '重置后浮层保持打开')
      await resetDropdown
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await resetDropdown.waitFor({ state: 'hidden' })
      await waitFirst(97063)
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务',
        '重置应立即恢复默认条件'
      )
      await applyFilters({ sort: '截止最早', status: '阻塞' })
      const applied = page.getByRole('group', { name: '当前任务筛选', exact: true })
      await assertMobileFilterClearControl({ assert, trigger: filterTrigger })
      await page.getByRole('button', { name: '清空任务筛选', exact: true }).tap()
      await waitFirst(97063)
      assert.equal(await filterTrigger.getAttribute('aria-label'), '筛选任务')
      assert.equal(await filterTrigger.getAttribute('aria-expanded'), 'false')
      assert(await filterTrigger.evaluate((node) => document.activeElement === node))
      assert.equal(await applied.count(), 0)
      await applyFilters({ sort: '截止最早', status: '阻塞' })
      await waitFirst(97063)
      await waitCount(12)
      assert.match(await range.innerText(), /共 22 项/u)
      assert((await ids()).every((id) => (id - 97000) % 3 === 0))
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务，已应用 2 项'
      )

      while ((await rows.count()) < 22) {
        const previous = await rows.count()
        await page.getByTestId('mobile-role-list-toggle-todo').click()
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll('.erp-mobile-list-item').length > count,
          previous
        )
      }
      const deadlineOrder = await ids()
      const orderedTasks = deadlineOrder.map((id) =>
        tasks.find((task) => task.id === id)
      )
      for (let index = 1; index < orderedTasks.length; index += 1) {
        assert(
          (orderedTasks[index - 1].due_at || Infinity) <=
            (orderedTasks[index].due_at || Infinity),
          '截止排序覆盖已加载的全部阻塞任务且缺值置后'
        )
      }

      await page.getByTestId('mobile-role-filter-approval').click()
      await waitCount(12)
      assert.equal(await filterTrigger.getAttribute('aria-label'), '筛选任务，已应用 2 项', '审批快捷条件在原胶囊表达，不重复计数')
      const selectedID = (await ids())[0]
      await clickTaskCardContent(
        rows.first(),
        rows.first().locator('.erp-task-identity__card-heading')
      )
      await page
        .getByTestId('mobile-task-detail-screen')
        .waitFor({ state: 'visible' })
      await page.reload()
      await page
        .getByTestId('mobile-task-detail-screen')
        .waitFor({ state: 'visible' })
      await page
        .getByRole('button', { name: '返回任务列表', exact: true })
        .click()
      await waitFirst(selectedID)
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务，已应用 2 项',
        '进入详情并返回后保留筛选条件'
      )
      assert.equal(await page.getByTestId('mobile-role-filter-approval').getAttribute('aria-pressed'), 'true', '返回后保留审批快捷范围')

      const search = page.getByRole('searchbox')
      await search.fill('不存在的模拟订单')
      await search.press('Enter')
      await page
        .getByText('当前筛选下暂无任务', { exact: true })
        .waitFor({ state: 'visible' })
      assert.match(await range.innerText(), /已显示 0 项/u)
      await page.getByRole('button', { name: '清除搜索', exact: true }).click()
      await waitFirst(97063)
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务，已应用 2 项',
        '清除搜索不连带清除任务筛选'
      )
      assert.equal(await page.getByTestId('mobile-role-filter-approval').getAttribute('aria-pressed'), 'true', '清除搜索保留审批快捷范围')

      const appliedResetDropdown = await openFilters()
      await appliedResetDropdown
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      assert(await appliedResetDropdown.isVisible(), '重置后浮层保持打开')
      await appliedResetDropdown
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await appliedResetDropdown.waitFor({ state: 'hidden' })
      await waitFirst(97063)
      assert.match(await range.innerText(), /共 64 项/u)
      assert.equal(await page.getByTestId('mobile-role-filter-approval').getAttribute('aria-pressed'), 'true', '重置额外条件保留审批快捷范围')
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务',
        '重置应立即清除任务筛选'
      )
      await applyFilters({ sort: '等待最久', status: '阻塞' })
      await waitFirst(97000)
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('已办', { exact: true })
        .click()
      await waitFirst(98000)
      assert.equal(await rows.count(), 1, '已办不受待办状态筛选影响')
      assert.equal(
        await page.getByTestId('mobile-history-filter-trigger').count(),
        1,
        '已办展示独立的处理时间与结果筛选'
      )
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('待办', { exact: true })
        .click()
      await waitFirst(97000)
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务，已应用 2 项',
        '返回待办后恢复原筛选'
      )
      await search.fill('SORT-0')
      await search.press('Enter')
      await waitFirst(97000)

      await page.getByTestId('mobile-role-nav-messages').click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="mobile-task-list-filter-trigger"]')
            ?.getAttribute('aria-label') === '筛选风险'
      )
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选风险',
        '首次进入风险页使用该页默认筛选'
      )
      await waitSearchValue('')
      assert.equal(await search.inputValue(), '', '风险页使用自己的搜索词')
      await assertRiskFilters('light')
      const overdueRisk = page.getByTestId('mobile-role-risk-filter-notice')
      await overdueRisk.click()
      const riskDates = await openFilters('风险')
      await riskDates.getByRole('group', { name: '截止时间', exact: true }).getByRole('button', { name: '未设置到期', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('[data-testid="mobile-role-risk-filter-notice"]')?.getAttribute('aria-pressed') === 'false')
      await riskDates.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await riskDates.waitFor({ state: 'hidden' })
      await page.evaluate(() => window.history.replaceState({ ...window.history.state, mobileRoleTasksMessageTab: 'notice' }, ''))
      await page.reload()
      await overdueRisk.waitFor()
      assert.equal(await overdueRisk.getAttribute('aria-pressed'), 'false', '恢复旧查询时丢弃冲突的超时快捷范围')
      await chooseFilter(await openFilters('风险'), '全部截止时间')
      assert.equal(await overdueRisk.getAttribute('aria-pressed'), 'false', '清空截止条件不恢复旧超时范围')
      await applyFilters({ sort: '截止最早', contextLabel: '风险' })
      await search.fill('SORT-6')
      await search.press('Enter')
      await page.waitForFunction(
        (expected) =>
          window.history.state?.mobileRoleTasksQueryPages?.risks?.keyword ===
          expected,
        'SORT-6'
      )
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选风险，已应用 1 项'
      )
      await page.reload()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="mobile-task-list-filter-trigger"]')
            ?.getAttribute('aria-label') === '筛选风险，已应用 1 项'
      )
      await waitSearchValue('SORT-6')
      assert.equal(await search.inputValue(), 'SORT-6')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="mobile-task-list-filter-trigger"]')
            ?.getAttribute('aria-label') === '筛选任务，已应用 2 项'
      )
      await waitSearchValue('SORT-0')
      assert.equal(
        await search.inputValue(),
        'SORT-0',
        '返回任务页恢复任务页自己的搜索词'
      )
      await page.getByTestId('mobile-role-nav-messages').click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="mobile-task-list-filter-trigger"]')
            ?.getAttribute('aria-label') === '筛选风险，已应用 1 项'
      )
      await waitSearchValue('SORT-6')
      assert.equal(await search.inputValue(), 'SORT-6')
      const riskDropdown = await openFilters('风险')
      await page.waitForTimeout(250)
      await riskDropdown.waitFor({ state: 'visible' })
      await page.screenshot({
        path: path.join(
          outputDir,
          'mobile-risk-list-filter-dropdown-light.png'
        ),
      })
      await riskDropdown
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      assert(await riskDropdown.isVisible(), '重置后浮层保持打开')
      await riskDropdown
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await riskDropdown.waitFor({ state: 'hidden' })
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选风险',
        '风险页重置只恢复风险页默认条件'
      )
      assert.equal(
        await search.inputValue(),
        'SORT-6',
        '重置筛选不重复承担清除搜索职责'
      )
      await overdueRisk.tap()
      await applyFilters({ sort: '截止最早', contextLabel: '风险' })
      assert.equal(await filterTrigger.getAttribute('aria-label'), '筛选风险，已应用 1 项', '超时快捷条件在原胶囊表达，不重复计数')
      await page.getByRole('button', { name: '清空风险筛选', exact: true }).tap()
      assert.equal(await filterTrigger.getAttribute('aria-label'), '筛选风险')
      assert.equal(await overdueRisk.getAttribute('aria-pressed'), 'true', '清空额外条件保留超时快捷条件')
      assert.equal(await search.inputValue(), 'SORT-6', '直接清空风险条件保留当前搜索')
      await page.reload()
      await page.getByRole('button', { name: '筛选风险', exact: true }).waitFor()
      assert.equal(await overdueRisk.getAttribute('aria-pressed'), 'true', '刷新后保留超时快捷条件')
      assert.equal(await search.inputValue(), 'SORT-6')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="mobile-task-list-filter-trigger"]')
            ?.getAttribute('aria-label') === '筛选任务，已应用 2 项'
      )
      await page.getByRole('button', { name: '清除搜索', exact: true }).click()
      await waitFirst(97000)

      await page.setViewportSize({ width: 320, height: 568 })
      const narrowDropdown = await openFilters()
      await waitForFiniteAnimations(page)
      const narrowGeometry = await page.evaluate(() => {
        const root = document.querySelector('.mobile-filter-popover')
        const panel = root?.querySelector('.mobile-filter-panel')
        return {
          viewport: {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          },
          scrollWidth: document.documentElement.scrollWidth,
          root: root?.getBoundingClientRect().toJSON(),
          panel: panel?.getBoundingClientRect().toJSON(),
          footer: panel?.querySelector('footer').getBoundingClientRect().toJSON(),
        }
      })
      assert(
        narrowGeometry.scrollWidth <= narrowGeometry.viewport.width + 1,
        JSON.stringify(narrowGeometry)
      )
      assert(
        narrowGeometry.root.x >= 0 &&
          narrowGeometry.root.y >= 0 &&
          narrowGeometry.root.right <= narrowGeometry.viewport.width + 1 &&
          narrowGeometry.root.bottom <= narrowGeometry.viewport.height + 1 &&
          narrowGeometry.panel.top >= 11 &&
          narrowGeometry.panel.bottom <= narrowGeometry.viewport.height - 11 &&
          narrowGeometry.footer.bottom <= narrowGeometry.panel.bottom + 1,
        `窄屏任务筛选下拉层保持在视口内：${JSON.stringify(narrowGeometry)}`
      )
      await tapCloseFilter(narrowDropdown)
      await narrowDropdown.waitFor({ state: 'hidden' })

      await page.setViewportSize({ width: 390, height: 844 })
      await scroller.evaluate((node) => {
        node.scrollTop = 0
      })
      await page.screenshot({
        path: path.join(outputDir, 'mobile-task-list-options-light.png'),
        fullPage: true,
      })
      const lightDropdown = await openFilters()
      await page.waitForTimeout(350)
      await page.screenshot({
        path: path.join(
          outputDir,
          'mobile-task-list-filter-dropdown-light.png'
        ),
      })
      await tapCloseFilter(lightDropdown)
      await lightDropdown.waitFor({ state: 'hidden' })

      await clickMobileThemeOption(page, '暗色')
      const darkDropdown = await openFilters()
      await page.waitForTimeout(350)
      const darkColors = await darkDropdown.evaluate((node) => {
        const surface = node.closest('.ant-popover-inner') || node
        return {
          background: getComputedStyle(surface).backgroundColor,
          color: getComputedStyle(node).color,
        }
      })
      assert.notEqual(darkColors.background, 'rgb(255, 255, 255)')
      assert.notEqual(darkColors.background, darkColors.color)
      await page.screenshot({
        path: path.join(outputDir, 'mobile-task-list-filter-dropdown-dark.png'),
      })
      await tapCloseFilter(darkDropdown)
      await darkDropdown.waitFor({ state: 'hidden' })
      await page.getByTestId('mobile-role-nav-messages').click()
      await assertRiskFilters('dark')
    },
  }
}
