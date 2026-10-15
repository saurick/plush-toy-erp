import { mobileTaskRefreshScenario } from './mobileTaskRefreshScenario.mjs'
import { createMobileProgressScenarios } from './mobileProgressScenarios.mjs'
import { createMobileWorkflowTrackingScenarios } from './mobileWorkflowTrackingScenarios.mjs'
import { assertMobileBackToTop } from './mobileBackToTopAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'

async function assertScrollEdge(page, assert, scroll, controls) {
  const edge = controls.locator('.mobile-scroll-edge')
  assert.equal(await edge.count(), 1, '每组吸顶操作区只有一处边缘效果')
  for (const top of [0, 420, 300, 0]) {
    await scroll.evaluate((node, value) => {
      node.scrollTop = value
    }, top)
    await page
      .waitForFunction(
        ({ node, shown }) => node.dataset.visible === String(shown),
        { node: await edge.elementHandle(), shown: top > 0 },
        { timeout: 5000 }
      )
      .catch(async (error) => {
        throw new Error(
          `${error.message}: ${JSON.stringify(await edge.evaluate((node) => ({ markup: node.outerHTML, position: getComputedStyle(node.parentElement).position, scrollTop: node.closest('[data-testid="mobile-role-scroll"],.mobile-progress-scroll')?.scrollTop })))}`
        )
      })
    await waitForFiniteAnimations(page)
    const style = await edge.evaluate((node) => {
      const css = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return {
        opacity: Number(css.opacity),
        pointerEvents: css.pointerEvents,
        blur: css.backdropFilter,
        height: box.height,
        top: box.top,
        parentBottom: node.parentElement.getBoundingClientRect().bottom,
      }
    })
    assert.equal(
      style.opacity,
      top > 0 ? 1 : 0,
      '滚离顶部显示、回看和停留保持、回顶消失'
    )
    assert.equal(style.pointerEvents, 'none', '边缘效果不拦截点击或拖动')
    assert.equal(style.blur, 'blur(3px)')
    assert(
      style.height <= 10 && Math.abs(style.top - style.parentBottom) <= 1,
      '模糊仅限固定区下沿'
    )
  }
}

async function assertPinnedControls(page, assert, scroll, controls, label) {
  await scroll.evaluate((node) =>
    node.scrollTo({ top: 0, behavior: 'instant' })
  )
  const boxes = await Promise.all(
    controls.map((control) => control.boundingBox())
  )
  for (const top of [420, 900, 360]) {
    const actual = await scroll.evaluate((node, next) => {
      node.scrollTo({ top: next, behavior: 'instant' })
      return node.scrollTop
    }, top)
    assert(actual > 0, `${label}需要真实长列表`)
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(resolve))
    )
    for (const [index, control] of controls.entries()) {
      const box = await control.boundingBox()
      assert(
        box && boxes[index] && Math.abs(box.y - boxes[index].y) <= 1,
        `${label}上下滚动时操作区保持原位：${JSON.stringify({ before: boxes[index], after: box, top: actual })}`
      )
    }
  }
  const bodyBox = await scroll.boundingBox()
  assert(bodyBox.height >= 150, `${label}为列表保留阅读空间`)
  const button = scroll.locator('..').getByTestId('mobile-back-to-top')
  await button.waitFor({ state: 'visible', timeout: 5000 })
  await button.click({ trial: true })
}

export function createMobileScrollScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const taskBase = mobileTaskRefreshScenario(deps)
  const tasks = ['light', 'dark'].map((themeMode) => ({
    ...taskBase,
    name: `mobile-scroll-tasks-${themeMode}`,
    themeMode,
    deviceScaleFactor: 3,
    workflowTaskFixtures: [
      ...taskBase.workflowTaskFixtures,
      ...taskBase.workflowTaskFixtures.map((task, index) => ({
        ...task,
        id: 97600 + index,
        task_code: `STYLE-L1-SCROLL-DONE-${index}`,
        task_status_key: 'done',
        completed_at: task.created_at + 7200,
      })),
    ],
    verify: async (page) => {
      const scroll = page.getByTestId('mobile-role-scroll')
      const toolbar = page.getByTestId('mobile-task-list-toolbar')
      const tabs = page.locator('.mobile-workspace-task-views')
      await page.locator('.mobile-task-list-row').first().waitFor()
      const input = page.getByRole('searchbox').first()
      await input.focus()
      await scroll.evaluate((node) =>
        node.scrollTo({ top: 420, behavior: 'instant' })
      )
      await scroll
        .locator('..')
        .getByTestId('mobile-back-to-top')
        .waitFor({ state: 'visible', timeout: 5000 })
      assert(
        await input.evaluate((node) => node === document.activeElement),
        '输入框仍保留焦点时滚动也能回顶'
      )
      await input.evaluate((node) => node.blur())
      await assertScrollEdge(page, assert, scroll, toolbar)
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await assertPinnedControls(
          page,
          assert,
          scroll,
          [tabs, toolbar],
          `待办 ${width}`
        )
        await assertNoHorizontalOverflow(page, `手机操作区 ${width}`)
      }
      const beforeFilter = await scroll.evaluate((node) => node.scrollTop)
      await page.getByTestId('mobile-task-list-filter-trigger').click()
      const filters = page.getByRole('dialog', {
        name: '筛选任务',
        exact: true,
      })
      await filters.waitFor()
      await filters
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await filters.waitFor({ state: 'hidden' })
      assert(
        Math.abs(
          (await scroll.evaluate((node) => node.scrollTop)) - beforeFilter
        ) <= 1,
        '滚动后打开并关闭吸顶筛选保留列表位置'
      )
      await page.screenshot({
        path: path.join(
          outputDir,
          `mobile-scroll-tasks-${themeMode}-pinned.png`
        ),
      })
      await assertMobileBackToTop(page, scroll, { keyboard: true })
      await tabs.getByText('已办', { exact: true }).click()
      await page
        .locator('.mobile-task-history .erp-mobile-list-item')
        .first()
        .waitFor()
      await assertPinnedControls(page, assert, scroll, [tabs, toolbar], '已办')
      await page.getByTestId('mobile-role-nav-messages').click()
      await page.locator('.mobile-role-message-card').first().waitFor()
      await assertPinnedControls(page, assert, scroll, [toolbar], '风险')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await tabs.getByText('待办', { exact: true }).click()
      await page.locator('.mobile-task-list-row').first().waitFor()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await assertScrollEdge(page, assert, scroll, toolbar)
      assert.equal(
        await toolbar
          .locator('.mobile-scroll-edge')
          .evaluate((node) => getComputedStyle(node).transitionDuration),
        '0s',
        '减少动态效果时不播放边缘淡入淡出'
      )
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.setViewportSize({ width: 667, height: 375 })
      await assertPinnedControls(page, assert, scroll, [tabs], '横屏待办')
      const shortLayout = await toolbar.boundingBox()
      const bodyLayout = await scroll.boundingBox()
      assert.equal(
        await toolbar.locator('.mobile-scroll-edge').isVisible(),
        false,
        '短屏不保留失去吸顶意义的模糊层'
      )
      assert(
        shortLayout.y + shortLayout.height <= bodyLayout.y + 1,
        '短屏查询区可滚走，优先保留正文空间'
      )
    },
  }))
  const progressBase = createMobileProgressScenarios(deps).find(
    (scenario) => scenario.name === 'mobile-progress-pmc'
  )
  const trackingBase = createMobileWorkflowTrackingScenarios(deps)[0]
  const tracking = {
    ...trackingBase,
    name: 'mobile-scroll-tracking',
    beforeNavigate: async (page) => {
      await trackingBase.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method !== 'list_exceptions' || body.params.tracking_kind)
          return route.fallback()
        const items = Array.from({ length: 35 }, (_, index) => ({
          key: `quality:${70000 + index}`,
          number: `EX-SCROLL-${index + 1}`,
          state: 'open',
          reason: '模拟批次需要核对确认样与工艺说明',
          batch_no: `WIP-SCROLL-${index + 1}`,
          occurred_at: '2026-10-13T08:00:00Z',
          tasks: [],
          task_ids: [],
          orders: [],
        }))
        const offset = body.params.offset || 0
        await route.fulfill({
          json: {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              code: 0,
              data: {
                items: items.slice(offset, offset + (body.params.limit || 20)),
                tasks: [],
                orders: [],
                total: 35,
                view_total: 35,
                open: 35,
                closed: 0,
                pending_tasks: 0,
                affected_orders: 0,
              },
            },
          },
        })
      })
    },
    verify: async (page) => {
      const scroll = page.getByTestId('mobile-role-scroll')
      const navigation = page.locator('.mobile-workspace-navigation')
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('流程跟踪', { exact: true })
        .click()
      const panel = page.getByRole('region', { name: '流程跟踪', exact: true })
      await panel.getByRole('button', { name: '重新读取', exact: true }).click()
      await panel.locator('.mobile-workflow-tracking-card').first().waitFor()
      await assertScrollEdge(
        page,
        assert,
        scroll,
        panel.locator('.mobile-workflow-tracking-controls')
      )
      await assertPinnedControls(
        page,
        assert,
        scroll,
        [navigation, panel.locator('.mobile-workflow-tracking-controls')],
        '流程跟踪'
      )
      await page.screenshot({
        path: path.join(outputDir, 'mobile-scroll-tracking-list.png'),
      })
      await assertMobileBackToTop(page, scroll)
      await navigation.getByText('异常跟踪', { exact: true }).click()
      const exceptions = page.getByRole('region', {
        name: '异常跟踪',
        exact: true,
      })
      await exceptions.getByText('EX-SCROLL-1', { exact: true }).waitFor()
      await assertScrollEdge(
        page,
        assert,
        scroll,
        exceptions.locator('.workflow-exceptions__controls')
      )
      await page.setViewportSize({ width: 320, height: 844 })
      await assertPinnedControls(
        page,
        assert,
        scroll,
        [navigation, exceptions.locator('.workflow-exceptions__controls')],
        '异常跟踪'
      )
      await assertNoHorizontalOverflow(page, '异常跟踪操作区')
      await page.screenshot({
        path: path.join(outputDir, 'mobile-scroll-exceptions.png'),
      })
      await assertMobileBackToTop(page, scroll)
    },
  }
  return [
    ...tasks,
    tracking,
    {
      ...progressBase,
      name: 'mobile-scroll-progress',
      verify: async (page) => {
        const panel = page.getByTestId('mobile-progress-panel')
        const scroll = panel.locator('.mobile-progress-scroll')
        const controls = panel.locator('.mobile-progress-controls')
        await panel
          .getByRole('button', { name: '查看 MO-0001 进度', exact: true })
          .waitFor()
        await assertScrollEdge(page, assert, scroll, controls)
        for (const width of [320, 390, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await assertPinnedControls(
            page,
            assert,
            scroll,
            [controls],
            `生产进度 ${width}`
          )
          await assertNoHorizontalOverflow(page, `进度操作区 ${width}`)
        }
        await panel.getByLabel('搜索进度').focus()
        await scroll
          .locator('..')
          .getByTestId('mobile-back-to-top')
          .waitFor({ state: 'visible', timeout: 5000 })
        await panel.getByLabel('搜索进度').evaluate((node) => node.blur())
        await page.screenshot({
          path: path.join(outputDir, 'mobile-scroll-progress.png'),
        })
        await assertMobileBackToTop(page, scroll)
        await panel
          .getByLabel('进度视图', { exact: true })
          .getByText('订单交付', { exact: true })
          .click()
        await panel
          .getByRole('button', { name: '查看 SO-0001 进度', exact: true })
          .waitFor()
        await assertPinnedControls(page, assert, scroll, [controls], '订单进度')
        await assertMobileBackToTop(page, scroll)
        const query = await page.evaluate(
          () => window.history.state.mobileProgress.query
        )
        const requests = []
        let releaseRefresh
        const responseReady = new Promise((resolve) => {
          releaseRefresh = resolve
        })
        await page.route('**/rpc/business', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'list_progress') return route.fallback()
          requests.push(body.params)
          await responseReady
          return route.fallback()
        })
        const beforePull = await controls.boundingBox()
        await pullToRefresh(page, scroll)
        const indicator = scroll.getByTestId('mobile-task-pull-refresh')
        await page.waitForFunction(
          (node) => node.dataset.state === 'refreshing',
          await indicator.elementHandle()
        )
        await waitForFiniteAnimations(page)
        assert.equal(requests.length, 1, '进度下拉只触发一次当前列表刷新')
        assert(
          Math.abs((await indicator.boundingBox()).height - 56) <= 1,
          '刷新中指示器平滑收拢至稳定高度'
        )
        assert(
          Math.abs((await controls.boundingBox()).y - beforePull.y) <= 1,
          '进度下拉刷新不带动顶部查询区'
        )
        assert.equal(
          await scroll.evaluate((node) => node.scrollTop),
          0,
          '刷新保持列表顶部，不叠加浏览器回弹'
        )
        assert.equal(
          await controls
            .locator('.mobile-scroll-edge')
            .getAttribute('data-visible'),
          'false',
          '顶部下拉时不显示滚动边缘'
        )
        releaseRefresh()
        await page.waitForFunction(
          (node) =>
            node.dataset.state === 'idle' &&
            node.getBoundingClientRect().height === 0,
          await indicator.elementHandle()
        )
        assert.deepEqual(
          await page.evaluate(() => window.history.state.mobileProgress.query),
          query,
          '刷新保留当前进度查询'
        )
        await panel
          .getByRole('button', { name: '查看 SO-0001 进度', exact: true })
          .waitFor()
      },
    },
  ]
}
