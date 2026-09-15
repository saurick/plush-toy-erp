import { clickMobileThemeOption } from './mobileTaskThemeAssertions.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'

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
      const rows = page.locator('.erp-mobile-list-item')
      const sort = page.getByTestId('mobile-task-sortKey-trigger')
      const status = page.getByTestId('mobile-task-statusKey-trigger')
      const range = page.getByTestId('mobile-task-list-range')
      const scroller = page.getByTestId('mobile-role-scroll')
      const toolbarOptions = page.getByTestId(
        'mobile-task-list-toolbar-options'
      )
      const scrollTo = async (top) => {
        await scroller.evaluate(async (node, nextTop) => {
          node.scrollTop = nextTop
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
        }, top)
      }
      const waitToolbar = async (visible) => {
        await page.waitForFunction(
          (expected) =>
            document
              .querySelector('[data-testid="mobile-task-list-toolbar-options"]')
              ?.getAttribute('aria-hidden') === String(!expected),
          visible
        )
        await toolbarOptions.evaluate(async (node) => {
          await Promise.all(
            node
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => {}))
          )
        })
      }
      const menu = page
        .locator('.mobile-task-options-dropdown:visible')
        .getByRole('menu')
      const openMenu = async (trigger) => {
        if ((await toolbarOptions.getAttribute('aria-hidden')) === 'true') {
          await scrollTo(
            await scroller.evaluate((node) => Math.max(0, node.scrollTop - 32))
          )
        }
        await waitToolbar(true)
        const title = (await trigger.getAttribute('aria-label')).split('：')[0]
        await trigger.tap()
        await page
          .getByRole('menu', { name: title, exact: true })
          .waitFor({ state: 'visible' })
        await page.waitForFunction(
          (expectedTitle) =>
            document.activeElement
              ?.closest('[role="menu"]')
              ?.getAttribute('aria-label') === expectedTitle &&
            Array.from(
              document.querySelectorAll(
                '.mobile-task-options-dropdown [role="menu"]'
              )
            ).filter((node) => node.getClientRects().length > 0).length === 1,
          title
        )
        await menu.evaluate(async (node) => {
          await Promise.all(
            node.parentElement
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => {}))
          )
        })
      }
      const choose = async (trigger, label) => {
        await openMenu(trigger)
        await menu
          .getByRole('menuitemradio', { name: label, exact: true })
          .tap()
        await menu.waitFor({ state: 'hidden' })
        assert.equal(await trigger.innerText(), label)
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
      await waitFirst(97063)
      assert.match(await range.innerText(), /已显示 12 项.*共 64 项/u)
      assert.equal(await sort.innerText(), '最近进入')
      const contentHeight = await scroller.evaluate((node) => node.scrollHeight)
      await scrollTo(600)
      await waitToolbar(false)
      const pinnedTabs = await page
        .getByTestId('mobile-role-task-filters')
        .boundingBox()
      const scrollBox = await scroller.boundingBox()
      assert(
        Math.abs(pinnedTabs.y - scrollBox.y) <= 1,
        '向下滚动仍保留分类 tab 吸顶'
      )
      assert(
        await toolbarOptions.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const target = document.elementFromPoint(
            rect.x + rect.width / 2,
            rect.y + rect.height / 2
          )
          return !target?.closest('.mobile-task-list-toolbar')
        }),
        '隐藏的筛选区域不遮挡下方任务点击'
      )
      await page.screenshot({
        path: path.join(outputDir, 'mobile-task-filters-scroll-down.png'),
        fullPage: true,
      })
      await scrollTo(592)
      assert.equal(
        await toolbarOptions.getAttribute('aria-hidden'),
        'true',
        '轻微向上移动不闪动'
      )
      await scrollTo(584)
      await waitToolbar(true)
      await page.screenshot({
        path: path.join(outputDir, 'mobile-task-filters-scroll-up.png'),
        fullPage: true,
      })
      await scrollTo(596)
      assert.equal(await toolbarOptions.getAttribute('aria-hidden'), 'false')
      await scrollTo(610)
      await waitToolbar(false)
      await scrollTo(590)
      await waitToolbar(true)
      assert.equal(
        await scroller.evaluate((node) => node.scrollHeight),
        contentHeight,
        '筛选展开收起不改变列表高度'
      )
      await openMenu(sort)
      await scrollTo(650)
      await waitToolbar(true)
      await sort.tap()
      await menu.waitFor({ state: 'hidden' })
      await scrollTo(680)
      await waitToolbar(false)
      await scrollTo(660)
      await waitToolbar(true)
      await sort.focus()
      await page.keyboard.press('Tab')
      assert(
        await status.evaluate(
          (node) =>
            node === document.activeElement && node.matches(':focus-visible')
        )
      )
      await scrollTo(720)
      await waitToolbar(true)
      await scroller.tap({ position: { x: 3, y: 180 } })
      await scrollTo(750)
      await waitToolbar(false)
      await scrollTo(0)
      await waitToolbar(true)
      await openMenu(sort)
      assert.equal(
        await page.getByRole('dialog').count(),
        0,
        '就地下拉不遮罩整页'
      )
      assert.equal(
        await menu
          .getByRole('menuitemradio', { name: '最近进入', exact: true })
          .getAttribute('aria-checked'),
        'true'
      )
      await sort.tap()
      await menu.waitFor({ state: 'hidden' })
      assert.equal(await sort.innerText(), '最近进入', '再次点击入口只收起菜单')
      await openMenu(sort)
      await page.getByTestId('mobile-role-list-heading').tap()
      await menu.waitFor({ state: 'hidden' })
      await openMenu(sort)
      await openMenu(status)
      assert.equal(await menu.getAttribute('aria-label'), '任务状态')
      assert.equal(await menu.count(), 1, '同时只展开一个菜单')
      await status.tap()
      await menu.waitFor({ state: 'hidden' })
      await sort.focus()
      await sort.press('Enter')
      await menu.waitFor({ state: 'visible' })
      await page.waitForFunction(() =>
        document.activeElement?.closest('.mobile-task-options-dropdown')
      )
      await page.keyboard.press('Home')
      await page.keyboard.press('ArrowDown')
      assert(
        await menu
          .getByRole('menuitemradio', { name: '截止最早', exact: true })
          .evaluate((node) => node === document.activeElement),
        '方向键切换菜单选项'
      )
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'hidden' })
      assert(
        await sort.evaluate((node) => node === document.activeElement),
        '收起后焦点回到入口'
      )
      await choose(sort, '等待最久')
      await waitFirst(97001)
      assert.deepEqual((await ids()).slice(0, 4), [97001, 97000, 97003, 97002])
      await choose(sort, '截止最早')
      await waitFirst(97063)
      while ((await rows.count()) < 64) {
        const previous = await rows.count()
        await page.getByTestId('mobile-role-list-toggle-todo').click()
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll('.erp-mobile-list-item').length > count,
          previous
        )
      }
      const deadlineOrder = await ids()
      assert.equal(new Set(deadlineOrder).size, 64)
      const orderedTasks = deadlineOrder.map((id) =>
        tasks.find((task) => task.id === id)
      )
      for (let i = 1; i < orderedTasks.length; i++) {
        assert(
          (orderedTasks[i - 1].due_at || Infinity) <=
            (orderedTasks[i].due_at || Infinity),
          '截止排序必须覆盖下一页且缺值置后'
        )
      }
      await choose(status, '阻塞')
      await waitCount(12)
      assert.match(await range.innerText(), /共 22 项/u)
      assert((await ids()).every((id) => (id - 97000) % 3 === 0))
      await page.getByTestId('mobile-role-filter-approval').click()
      await waitCount(12)
      assert.match(await range.innerText(), /共 22 项/u)
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
      assert.equal(await sort.innerText(), '截止最早')
      assert.equal(await status.innerText(), '阻塞')
      await scrollTo(600)
      await waitToolbar(false)
      await scrollTo(580)
      await waitToolbar(true)
      await scrollTo(0)
      await waitToolbar(true)
      const search = page.getByRole('searchbox')
      await search.fill('不存在的模拟订单')
      await page
        .getByText('当前筛选下暂无任务', { exact: true })
        .waitFor({ state: 'visible' })
      assert.match(await range.innerText(), /共 0 项/u)
      await page.getByRole('button', { name: '重置', exact: true }).tap()
      await waitFirst(97063)
      assert.equal(await sort.innerText(), '最近进入')
      assert.equal(await status.innerText(), '全部状态')
      assert.equal(await search.inputValue(), '')
      await choose(sort, '等待最久')
      await choose(status, '待处理')
      await choose(status, '全部状态')
      await waitFirst(97001)
      await choose(status, '阻塞')
      await waitFirst(97000)
      assert((await ids()).every((id) => (id - 97000) % 3 === 0))
      await page.getByTestId('mobile-role-nav-done').click()
      await waitFirst(98000)
      assert.equal(await rows.count(), 1, '已办不受待办阻塞状态筛选影响')
      assert.equal(
        await page.getByTestId('mobile-task-list-options').count(),
        0
      )
      await page.getByTestId('mobile-role-nav-todo').click()
      await waitFirst(97000)
      assert.equal(await status.innerText(), '阻塞')
      await page.getByTestId('mobile-role-nav-messages').tap()
      await page
        .locator('.mobile-role-message-card')
        .first()
        .waitFor({ state: 'visible' })
      await scrollTo(600)
      await waitToolbar(false)
      await scrollTo(580)
      await waitToolbar(true)
      await openMenu(status)
      await status.tap()
      await menu.waitFor({ state: 'hidden' })
      await page.getByTestId('mobile-role-nav-todo').tap()
      await waitFirst(97000)
      for (const width of [320, 390, 430, 1440]) {
        await page.setViewportSize({ width, height: 844 })
        const metrics = await page
          .getByTestId('mobile-task-list-options')
          .evaluate((node) => {
            const controls = Array.from(node.children).map((child) =>
              child.getBoundingClientRect()
            )
            return {
              width: node.clientWidth,
              scrollWidth: node.scrollWidth,
              controls: controls.map((rect) => ({
                x: rect.x,
                right: rect.right,
                height: rect.height,
              })),
            }
          })
        assert(metrics.scrollWidth <= metrics.width + 1)
        assert(
          metrics.controls.every(
            (control) => control.height >= 48 && control.right <= width
          )
        )
        await openMenu(status)
        const triggerBox = await status.boundingBox()
        const menuMetrics = await menu.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          return {
            x: rect.x,
            right: rect.right,
            y: rect.y,
            width: rect.width,
            controls: Array.from(
              node.querySelectorAll('[role="menuitemradio"]')
            ).map((item) => {
              const box = item.getBoundingClientRect()
              return { width: box.width, height: box.height, right: box.right }
            }),
          }
        })
        assert(menuMetrics.x >= 0 && menuMetrics.right <= width)
        assert(
          menuMetrics.y >= triggerBox.y + triggerBox.height - 1 &&
            menuMetrics.y <= triggerBox.y + triggerBox.height + 16,
          '菜单直接位于入口下方'
        )
        assert(
          menuMetrics.controls.every(
            (control) =>
              control.height >= 48 &&
              control.width >= menuMetrics.width - 16 &&
              control.right <= width
          )
        )
        await status.tap()
        await menu.waitFor({ state: 'hidden' })
      }
      await page.setViewportSize({ width: 568, height: 320 })
      await openMenu(sort)
      await menu
        .getByRole('menuitemradio', { name: '等待最久', exact: true })
        .tap()
      await menu.waitFor({ state: 'hidden' })
      await page.setViewportSize({ width: 390, height: 844 })
      await page.getByTestId('mobile-role-scroll').evaluate((node) => {
        node.scrollTop = 0
      })
      await page.screenshot({
        path: path.join(outputDir, 'mobile-task-list-options-light.png'),
        fullPage: true,
      })
      await openMenu(sort)
      await page.screenshot({
        path: path.join(
          outputDir,
          'mobile-task-list-options-dropdown-light.png'
        ),
        fullPage: true,
      })
      await sort.tap()
      await menu.waitFor({ state: 'hidden' })
      await clickMobileThemeOption(page, '暗色')
      const colors = await sort.evaluate((node) => ({
        background: getComputedStyle(node).backgroundColor,
        color: getComputedStyle(node).color,
      }))
      assert.notEqual(colors.background, 'rgb(255, 255, 255)')
      assert.notEqual(colors.background, colors.color)
      await openMenu(status)
      const selectedColors = await menu
        .getByRole('menuitemradio', { name: '阻塞', exact: true })
        .evaluate((node) => ({
          background: getComputedStyle(node).backgroundColor,
          color: getComputedStyle(node).color,
        }))
      assert.notEqual(selectedColors.background, 'rgb(232, 245, 234)')
      assert.notEqual(selectedColors.background, selectedColors.color)
      await page.screenshot({
        path: path.join(outputDir, 'mobile-task-list-options-dark.png'),
        fullPage: true,
      })
      await status.tap()
      await menu.waitFor({ state: 'hidden' })
    },
  }
}
