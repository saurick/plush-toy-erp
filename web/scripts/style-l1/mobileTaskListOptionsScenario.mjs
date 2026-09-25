import { clickMobileThemeOption } from './mobileTaskThemeAssertions.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { assertMobileSearchAffordance } from './controlAffordanceAssertions.mjs'

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
        await filterTrigger.click()
        const dropdown = page.getByRole('group', {
          name: `筛选${contextLabel}`,
          exact: true,
        })
        await dropdown.waitFor({ state: 'visible' })
        return dropdown
      }
      const chooseFilter = async (dropdown, label) => {
        await dropdown.getByText(label, { exact: true }).click()
        await dropdown.waitFor({ state: 'hidden' })
      }
      const applyFilters = async ({ sort, status, contextLabel = '任务' }) => {
        if (sort) await chooseFilter(await openFilters(contextLabel), sort)
        if (status) await chooseFilter(await openFilters(contextLabel), status)
      }

      await waitFirst(97063)
      assert.match(await range.innerText(), /已显示 12 项.*共 64 项/u)
      assert.equal(await filterTrigger.getAttribute('aria-label'), '筛选任务')

      for (const width of [320, 390, 430]) {
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
            filter: rect('[data-testid="mobile-task-list-filter-trigger"]'),
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
          geometry.query.height <= 48 && geometry.filter.height >= 44,
          `搜索和统一筛选保持同一行：${JSON.stringify(geometry)}`
        )
        assert(
          geometry.search.right <= geometry.filter.x - 8,
          `搜索与筛选保留清晰间距：${JSON.stringify(geometry)}`
        )
        assert(
          geometry.chips.bottom - geometry.query.top <= 172,
          `列表顶部控制区保持紧凑：${JSON.stringify(geometry)}`
        )
        assert.equal(geometry.checkCount, 0, '选中控件不使用勾选图标')
        assert.equal(
          geometry.selectedShadow,
          'none',
          '快捷筛选不使用粗底边或阴影'
        )
      }
      await page.setViewportSize({ width: 390, height: 844 })

      const immediateDropdown = await openFilters()
      const alignedControls = await immediateDropdown.evaluate((node) => {
        const centerX = (element) => {
          const rect = element.getBoundingClientRect()
          return rect.left + rect.width / 2
        }
        const fieldsets = Array.from(node.querySelectorAll('fieldset'))
        const itemDeltas = Array.from(
          node.querySelectorAll('.ant-segmented-item')
        ).map((item) => {
          const label = item.querySelector('.ant-segmented-item-label')
          return label ? Math.abs(centerX(item) - centerX(label)) : Infinity
        })
        const legendDeltas = fieldsets.map((fieldset) => {
          const legend = fieldset.querySelector('legend')
          return legend
            ? Math.abs(centerX(fieldset) - centerX(legend))
            : Infinity
        })
        const reset = node.querySelector('.mobile-task-filter-dropdown__reset')
        return {
          itemDeltas,
          legendDeltas,
          resetDelta: reset
            ? Math.abs(centerX(node) - centerX(reset))
            : Infinity,
        }
      })
      assert(
        alignedControls.legendDeltas.every((delta) => delta <= 1) &&
          alignedControls.itemDeltas.every((delta) => delta <= 1) &&
          alignedControls.resetDelta <= 1,
        `筛选标题、选项和重置动作必须共用居中基线：${JSON.stringify(alignedControls)}`
      )
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

      const resetDropdown = await openFilters()
      await resetDropdown
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      await resetDropdown.waitFor({ state: 'hidden' })
      await waitFirst(97063)
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务',
        '重置应立即恢复默认条件'
      )
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
      const selectedID = (await ids())[0]
      await clickTaskCardContent(
        rows.first(),
        rows.first().locator('.mobile-task-list-row__head')
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

      const appliedResetDropdown = await openFilters()
      await appliedResetDropdown
        .getByRole('button', { name: '重置筛选', exact: true })
        .click()
      await appliedResetDropdown.waitFor({ state: 'hidden' })
      await waitFirst(97063)
      assert.match(await range.innerText(), /共 64 项/u)
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
        await page.getByTestId('mobile-task-list-filter-trigger').count(),
        0,
        '已办不展示无效筛选入口'
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
      await page.waitForTimeout(200)
      const narrowGeometry = await page.evaluate(() => {
        const root = document.querySelector('.mobile-task-filter-popover')
        const panel = root?.querySelector('.mobile-task-filter-dropdown')
        return {
          viewport: {
            width: document.documentElement.clientWidth,
            height: document.documentElement.clientHeight,
          },
          scrollWidth: document.documentElement.scrollWidth,
          root: root?.getBoundingClientRect().toJSON(),
          panel: panel?.getBoundingClientRect().toJSON(),
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
          narrowGeometry.panel.height <=
            narrowGeometry.viewport.height * 0.52 + 2,
        `窄屏任务筛选下拉层保持在视口内：${JSON.stringify(narrowGeometry)}`
      )
      await filterTrigger.click()
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
      await filterTrigger.click()
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
      await filterTrigger.click()
      await darkDropdown.waitFor({ state: 'hidden' })
    },
  }
}
