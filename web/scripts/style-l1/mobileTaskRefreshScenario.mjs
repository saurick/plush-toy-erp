import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { clickERPThemeOption } from './themeAssertions.mjs'
import { MOBILE_ROLE_TASK_PAGE_LIMIT } from '../../src/erp/utils/mobileTaskQueries.mjs'

export function mobileTaskRefreshScenario({ assert, path, outputDir }) {
  const permissions = [
    'mobile.engineering.access',
    'workflow.task.read',
    'workflow.task.approve',
  ]
  const baseTime = 1_788_840_000
  return {
    name: 'mobile-task-touch-refresh',
    path: '/m/engineering/tasks',
    auth: 'admin',
    customerKey: 'yoyoosun',
    themeMode: 'light',
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    adminProfile: {
      username: 'style-l1-refresh',
      is_super_admin: false,
      roles: [{ role_key: 'engineering', name: '工程' }],
      permissions,
      menus: [],
    },
    effectiveSession: {
      configRevision: 'style-l1-refresh',
      configHash: 'style-l1-refresh-hash',
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
    workflowTaskFixtures: Array.from({ length: 24 }, (_, index) => ({
      id: 97500 + index,
      version: 1,
      task_code: `STYLE-L1-REFRESH-${index}`,
      task_name: `刷新模拟任务 ${index}`,
      task_group: 'engineering_check',
      owner_role_key: 'engineering',
      task_status_key:
        index === 23 ? 'done' : index % 3 === 0 ? 'blocked' : 'ready',
      required_capability_key: 'workflow.task.approve',
      source_type: 'style_task',
      source_id: index + 1,
      source_no: `REFRESH-${index}`,
      created_at: baseTime + index * 60,
      updated_at: baseTime + index * 60,
      due_at: index === 0 ? baseTime - 3600 : undefined,
      completed_at: index === 23 ? baseTime + 7200 : undefined,
      blocked_reason: index % 3 === 0 ? '等待确认' : '',
      payload: {},
    })),
    verify: async (page) => {
      const scroll = page.getByTestId('mobile-role-scroll')
      const indicator = page.getByTestId('mobile-task-pull-refresh')
      const rows = page.locator('.erp-mobile-list-item')
      const refresh = page.getByRole('button', { name: '刷新', exact: true })
      const filterTrigger = page.getByTestId('mobile-task-list-filter-trigger')
      const openTaskFilters = async () => {
        await filterTrigger.click()
        const dropdown = page.getByRole('group', {
          name: '筛选任务',
          exact: true,
        })
        await dropdown.waitFor({ state: 'visible' })
        return dropdown
      }
      const chooseTaskFilter = async (label) => {
        const dropdown = await openTaskFilters()
        await dropdown.getByText(label, { exact: true }).click()
        await dropdown.waitFor({ state: 'hidden' })
      }
      const applyTaskFilters = async ({ sort, status }) => {
        if (sort) await chooseTaskFilter(sort)
        if (status) await chooseTaskFilter(status)
      }
      const client = await page.context().newCDPSession(page)
      await client.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 2,
      })
      await rows.first().waitFor({ state: 'visible' })
      const requests = []
      let nextResponse = 'normal'
      let releaseResponse
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON()
        // 独立的角标计数读取不属于列表刷新；手势仍须精确触发一次当前列表请求。
        if (
          body.method !== 'list_role_tasks' ||
          body.params.limit !== MOBILE_ROLE_TASK_PAGE_LIMIT
        ) {
          return route.fallback()
        }
        requests.push(body.params)
        const response = nextResponse
        nextResponse = 'normal'
        if (response.startsWith('hold')) {
          await new Promise((resolve) => {
            releaseResponse = resolve
          })
        }
        if (response.endsWith('fail')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { code: RpcErrorCode.INTERNAL, message: '模拟刷新失败' },
            }),
          })
        }
        return route.fallback()
      })
      const send = (type, points = []) =>
        client.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: points.map((point, index) => ({
            id: index + 1,
            ...point,
          })),
        })
      const start = (x = 180, y = 350) => send('touchStart', [{ x, y }])
      const move = (x, y) => send('touchMove', [{ x, y }])
      const end = () => send('touchEnd')
      const state = (value) =>
        page.waitForFunction(
          (expected) =>
            document.querySelector('[data-testid="mobile-task-pull-refresh"]')
              ?.dataset.state === expected,
          value,
          { timeout: 5000 }
        )
      const top = async () => {
        await scroll.evaluate((node) => {
          node.scrollTop = 0
        })
        await page
          .waitForFunction(
            () =>
              document.querySelector('[data-testid="mobile-role-scroll"]')
                .scrollTop === 0,
            null,
            { timeout: 5000 }
          )
          .catch(async (error) => {
            const position = await page.evaluate(() => ({
              scrollTop: document.querySelector(
                '[data-testid="mobile-role-scroll"]'
              ).scrollTop,
            }))
            throw new Error(
              `${error.message}\n回到顶部状态：${JSON.stringify(position)}`
            )
          })
      }
      const refreshLayout = () =>
        page.evaluate(() => {
          const rect = (node) => node?.getBoundingClientRect().toJSON() ?? null
          const controls = {
            header: '.mobile-task-list-header',
            search: '.mobile-role-task-search',
            tabs: '.mobile-role-task-filters, .mobile-role-message-tabs',
            filter: '[data-testid="mobile-task-list-filter-trigger"]',
            navigation: '[data-testid="mobile-role-bottom-nav"]',
          }
          return {
            controls: Object.fromEntries(
              Object.entries(controls).map(([name, selector]) => [
                name,
                rect(document.querySelector(selector)),
              ])
            ),
            indicator: rect(
              document.querySelector('[data-testid="mobile-task-pull-refresh"]')
            ),
            data: rect(
              document.querySelector(
                '.mobile-task-list, .mobile-role-messages'
              ) ||
                document.querySelector(
                  '.mobile-role-tasks-page__scroll > section:not(.mobile-role-load-error)'
                )
            ),
            scrollTop: document.querySelector(
              '[data-testid="mobile-role-scroll"]'
            ).scrollTop,
          }
        })
      const assertControlsStay = (before, after, label) => {
        for (const [name, box] of Object.entries(before.controls)) {
          if (!box) continue
          assert(after.controls[name], `${label}保留${name}`)
          for (const edge of ['x', 'y', 'width', 'height']) {
            assert(
              Math.abs(after.controls[name][edge] - box[edge]) <= 1,
              `${label}时${name}的${edge}应保持原位：${JSON.stringify({ before: box, after: after.controls[name] })}`
            )
          }
        }
      }
      const assertRefreshLayout = async (before, label) => {
        const after = await refreshLayout()
        assertControlsStay(before, after, label)
        assert.equal(after.scrollTop, 0, `${label}保持列表在顶部`)
        assert(
          Math.abs(
            after.data.y -
              before.data.y -
              (after.indicator.height - before.indicator.height)
          ) <= 1,
          `${label}只带动数据区：${JSON.stringify({ before, after })}`
        )
        const controlsBottom = Math.max(
          ...Object.entries(after.controls)
            .filter(([name, box]) => name !== 'navigation' && box)
            .map(([, box]) => box.bottom)
        )
        assert(
          after.indicator.y >= controlsBottom - 1,
          `${label}的刷新提示位于筛选区下方`
        )
      }
      const pull = async (label = '下拉') => {
        await top()
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        )
        const before = await refreshLayout()
        assert(
          (await page.locator('.ant-message-notice').count()) <= 1,
          '连续刷新只保留一条结果提示'
        )
        assert(
          await scroll.evaluate((node) =>
            node.contains(document.elementFromPoint(180, 350))
          ),
          `${label}的手指落点不应被结果提示遮挡`
        )
        await start()
        for (const y of [370, 395, 430, 470, 500]) await move(180, y)
        try {
          await state('ready')
        } catch (error) {
          await page.screenshot({
            path: path.join(outputDir, 'mobile-refresh-gesture-failure.png'),
            fullPage: true,
          })
          const evidence = await page.evaluate(() => ({
            title: document.querySelector(
              '[data-testid="mobile-role-list-heading"]'
            )?.textContent,
            busy: document.querySelector('.mobile-task-list-header__refresh')
              ?.disabled,
            scrollTop: document.querySelector(
              '[data-testid="mobile-role-scroll"]'
            )?.scrollTop,
            indicator: document.querySelector(
              '[data-testid="mobile-task-pull-refresh"]'
            )?.outerHTML,
            target: document
              .elementFromPoint(180, 350)
              ?.outerHTML.slice(0, 400),
          }))
          throw new Error(
            `${label}: ${error.message}\n${JSON.stringify(evidence, null, 2)}`
          )
        }
        await assertRefreshLayout(before, '下拉')
        return before
      }
      const settle = async () => {
        await state('idle')
        await refresh.waitFor({ state: 'visible' })
        await page.waitForFunction(
          () =>
            !document.querySelector('.mobile-task-list-header__refresh')
              ?.disabled
        )
      }
      const noRefresh = async (gesture, label) => {
        const before = requests.length
        await top()
        await gesture()
        await page.waitForTimeout(100)
        assert.equal(requests.length, before, label)
        await state('idle')
      }

      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        const geometry = await page.evaluate(() => {
          const rect = (selector) =>
            document.querySelector(selector).getBoundingClientRect().toJSON()
          return {
            header: rect('[data-testid="mobile-task-list-header"]'),
            refresh: rect('.mobile-task-list-header__refresh'),
            search: rect('.mobile-role-task-search'),
            width: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
          }
        })
        assert(geometry.header.height <= 72, '顶部保持一行紧凑布局')
        assert(
          geometry.refresh.height >= 44 && geometry.refresh.width >= 72,
          '刷新文字与点击区不能缩成难点的小图标'
        )
        assert(
          geometry.search.y <= 76,
          '搜索应紧接顶部，不再被常驻更新时间挤下去'
        )
        assert(
          geometry.scrollWidth <= geometry.width + 1,
          JSON.stringify(geometry)
        )
        const beforePull = await pull()
        await send('touchCancel')
        await state('idle')
        await assertRefreshLayout(beforePull, `${width}px取消下拉后`)
      }
      await page.setViewportSize({ width: 390, height: 844 })
      assert.equal(
        await page.locator('.erp-theme-toggle, .erp-theme-menu-toggle').count(),
        0
      )
      assert.equal(
        await indicator.evaluate((node) => node.getBoundingClientRect().height),
        0
      )
      await page.screenshot({
        path: path.join(outputDir, 'mobile-refresh-list-light.png'),
        fullPage: true,
      })
      const headingClip = await page
        .getByTestId('mobile-role-list-heading')
        .boundingBox()
      const restingHeading = await page.screenshot({ clip: headingClip })

      await noRefresh(async () => {
        await start()
        await move(180, 380)
        await end()
      }, '轻微下拉不请求')
      await noRefresh(async () => {
        await start()
        await move(270, 355)
        await end()
      }, '横向滑动不请求')
      await noRefresh(async () => {
        const before = await refreshLayout()
        await start()
        await move(180, 280)
        // 停住手指后松开，避免浏览惯性混入下一次独立下拉的起点。
        await page.waitForTimeout(150)
        await end()
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="mobile-role-scroll"]')
              .scrollTop > 0
        )
        const after = await refreshLayout()
        assert(
          after.controls.header.y < before.controls.header.y,
          '正常浏览时标题仍随列表滚动'
        )
      }, '上滑浏览列表不请求')
      await noRefresh(async () => {
        await scroll.evaluate((node) => {
          node.scrollTop = 200
        })
        await start()
        await move(180, 500)
        await end()
      }, '中途滚回顶部不触发刷新')
      await noRefresh(async () => {
        await pull()
        await send('touchCancel')
      }, '取消手势不请求')
      await noRefresh(async () => {
        await start()
        await send('touchStart', [
          { x: 180, y: 350 },
          { x: 210, y: 360 },
        ])
        await send('touchMove', [
          { x: 180, y: 500 },
          { x: 210, y: 510 },
        ])
        await end()
      }, '双指操作不请求')
      await noRefresh(async () => {
        const box = await page.getByRole('searchbox').boundingBox()
        await start(box.x + 30, box.y + 20)
        await move(box.x + 30, box.y + 160)
        await end()
      }, '搜索框内手势不触发刷新')

      const firstTask = await rows.first().elementHandle()
      const beforeRefresh = requests.length
      nextResponse = 'hold'
      const beforePull = await pull()
      assert(
        restingHeading.equals(await page.screenshot({ clip: headingClip })),
        '下拉时标题的实际画面保持原位，不受浏览器原生回弹带动'
      )
      await page.screenshot({
        path: path.join(outputDir, 'mobile-refresh-pull-ready.png'),
        fullPage: true,
      })
      await end()
      await state('refreshing')
      await page.waitForFunction(
        () =>
          document.querySelector('.mobile-task-list-header__refresh')?.disabled
      )
      await assertRefreshLayout(beforePull, '刷新中')
      assert.equal(requests.length, beforeRefresh + 1)
      assert.equal(
        await firstTask.evaluate((node) => node.isConnected),
        true,
        '刷新时保持已有任务节点'
      )
      assert.equal(
        await page.getByTestId('mobile-task-detail-screen').count(),
        0,
        '从任务卡下拉不得误打开任务'
      )
      await start()
      await move(180, 510)
      await end()
      assert.equal(
        requests.length,
        beforeRefresh + 1,
        '刷新中再次下拉不重复请求'
      )
      releaseResponse()
      await settle()
      await assertRefreshLayout(beforePull, '刷新完成后')

      await page.getByRole('searchbox').fill('刷新模拟')
      await page.getByRole('searchbox').press('Enter')
      await applyTaskFilters({ sort: '等待最久', status: '阻塞' })
      await page.getByTestId('mobile-role-filter-approval').click()
      await settle()
      await page.waitForFunction(
        () => document.querySelectorAll('.erp-mobile-list-item').length === 8
      )
      const taskIDs = () =>
        rows.evaluateAll((nodes) =>
          nodes.map((node) => node.dataset.mobileTaskId)
        )
      const previousIDs = await taskIDs()
      nextResponse = 'fail'
      const beforeFailure = await pull()
      await end()
      await page
        .locator('.mobile-role-load-error')
        .waitFor({ state: 'visible' })
      await settle()
      assertControlsStay(beforeFailure, await refreshLayout(), '刷新失败')
      assert.deepEqual(await taskIDs(), previousIDs)
      assert.match(
        await page.locator('.mobile-role-load-error').innerText(),
        /保留上次已加载内容/u
      )
      assert.equal(await page.getByRole('searchbox').inputValue(), '刷新模拟')
      assert.equal(
        await filterTrigger.getAttribute('aria-label'),
        '筛选任务，已应用 2 项'
      )
      const persistedFilterDropdown = await openTaskFilters()
      assert.equal(
        await persistedFilterDropdown
          .getByRole('radio', { name: '等待最久', exact: true })
          .isChecked(),
        true
      )
      assert.equal(
        await persistedFilterDropdown
          .getByRole('radio', { name: '阻塞', exact: true })
          .isChecked(),
        true
      )
      await filterTrigger.click()
      await persistedFilterDropdown.waitFor({ state: 'hidden' })
      assert.equal(
        await page
          .getByTestId('mobile-role-filter-approval')
          .getAttribute('aria-pressed'),
        'true'
      )
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await page.locator('.mobile-role-load-error').waitFor({ state: 'hidden' })
      await settle()
      await assertRefreshLayout(beforeFailure, '重试成功后')

      await page.getByTestId('mobile-role-nav-mine').click()
      assert.equal(await indicator.count(), 0)
      assert.equal(await refresh.count(), 0)
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        const geometry = await page
          .locator('.mobile-task-display-settings')
          .evaluate((node) => ({
            width: node.clientWidth,
            scrollWidth: node.scrollWidth,
            buttons: Array.from(
              node.querySelectorAll('.ant-segmented-item-label')
            ).map((item) => item.getBoundingClientRect().toJSON()),
          }))
        assert(geometry.scrollWidth <= geometry.width + 1)
        assert.equal(geometry.buttons.length, 3)
        assert(
          geometry.buttons.every(
            (button) =>
              button.height >= 48 && button.width >= 44 && button.right <= width
          ),
          JSON.stringify(geometry)
        )
      }
      await page.setViewportSize({ width: 390, height: 844 })
      await clickERPThemeOption(page, '暗色')
      await page.waitForFunction(
        () => document.querySelectorAll('.ant-message-notice').length === 0
      )
      await page
        .locator('.erp-theme-toggle .ant-segmented-item-selected')
        .filter({ hasText: '暗色' })
        .waitFor({ state: 'visible' })
      await page.screenshot({
        path: path.join(outputDir, 'mobile-refresh-mine-dark.png'),
        fullPage: true,
      })
      await clickERPThemeOption(page, '跟系统')
      await clickERPThemeOption(page, '浅色')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('待办', { exact: true })
        .click()
      assert.equal(
        await page
          .getByTestId('mobile-role-filter-approval')
          .getAttribute('aria-pressed'),
        'true',
        '改主题后返回保留待办分类'
      )
      assert.deepEqual(await taskIDs(), previousIDs)
      await settle()

      await page.locator('.ant-message-error').waitFor({ state: 'hidden' })
      nextResponse = 'hold-fail'
      await refresh.click()
      await page
        .getByRole('button', { name: '刷新中', exact: true })
        .waitFor({ state: 'visible' })
      await page.getByTestId('mobile-role-nav-mine').click()
      releaseResponse()
      await page.waitForTimeout(250)
      assert.equal(
        await page.locator('.mobile-role-load-error').count(),
        0,
        '任务错误不应出现于我的页'
      )
      assert.equal(
        await page.locator('.ant-message-error').count(),
        0,
        '离开列表后旧请求不得弹出错误'
      )
      await clickERPThemeOption(page, '暗色')
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('待办', { exact: true })
        .click()
      await page.getByRole('button', { name: '重新加载', exact: true }).click()
      await settle()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await pull()
      await page.screenshot({
        path: path.join(outputDir, 'mobile-refresh-pull-ready-dark.png'),
        fullPage: true,
      })
      await send('touchCancel')
      await page.screenshot({
        path: path.join(outputDir, 'mobile-refresh-list-dark.png'),
        fullPage: true,
      })

      const searchList = async (keyword, viewKey) => {
        const searchbox = page.getByRole('searchbox')
        if ((await searchbox.inputValue()) === keyword) {
          return
        }
        const request = page.waitForRequest((candidate) => {
          if (!candidate.url().endsWith('/rpc/workflow')) return false
          const body = candidate.postDataJSON()
          return (
            body.method === 'list_role_tasks' &&
            body.params.view_key === viewKey &&
            body.params.keyword === keyword
          )
        })
        await searchbox.fill(keyword)
        await searchbox.press('Enter')
        await request
      }

      for (const { tab, messageTab, viewKey, label, emptyText } of [
        {
          tab: 'done',
          viewKey: 'history',
          label: '已办',
          emptyText: '暂无已办任务',
        },
        {
          tab: 'messages',
          messageTab: 'warning',
          viewKey: 'risk',
          label: '风险',
          emptyText: '暂无风险任务',
        },
        {
          tab: 'messages',
          messageTab: 'notice',
          viewKey: 'risk',
          label: '超时',
          emptyText: '暂无超时任务',
        },
      ]) {
        await page
          .getByTestId(`mobile-role-nav-${tab === 'done' ? 'tasks' : tab}`)
          .tap()
        if (tab === 'done') {
          await page
            .getByLabel('任务状态', { exact: true })
            .getByText('已办', { exact: true })
            .tap()
        }
        if (messageTab) {
          await page.getByTestId(`mobile-role-message-tab-${messageTab}`).tap()
        }
        const listRows = page.locator('[data-mobile-task-id]')
        const listIDs = () =>
          listRows.evaluateAll((nodes) =>
            nodes.map((node) => node.dataset.mobileTaskId)
          )
        await listRows.first().waitFor({ state: 'visible' })
        await settle()
        const savedIDs = await listIDs()

        await listRows
          .first()
          .locator('.erp-task-card__open')
          .tap({
            position: { x: 24, y: 24 },
          })
        await page
          .getByTestId('mobile-task-detail-screen')
          .waitFor({ state: 'visible' })
        await page
          .getByRole('button', { name: '返回任务列表', exact: true })
          .tap()
        await listRows.first().waitFor({ state: 'visible' })
        await settle()

        const before = requests.length
        const firstRow = await listRows.first().elementHandle()
        nextResponse = 'hold'
        const layout = await pull()
        await page.screenshot({
          path: path.join(
            outputDir,
            `mobile-refresh-${messageTab || tab}-ready.png`
          ),
          fullPage: true,
        })
        await end()
        await state('refreshing')
        assert.equal(
          requests.length,
          before + 1,
          `${label}返回列表后支持下拉刷新`
        )
        assert.equal(
          requests.at(-1).view_key,
          viewKey,
          `${label}刷新当前列表的数据`
        )
        const savedQuery = requests.at(-1)
        assert.equal(
          await firstRow.evaluate((node) => node.isConnected),
          true,
          `${label}刷新中保留当前数据`
        )
        await assertRefreshLayout(layout, `${label}刷新中`)
        releaseResponse()
        await settle()
        await assertRefreshLayout(layout, `${label}刷新完成后`)

        nextResponse = 'fail'
        await pull()
        await end()
        await page
          .locator('.mobile-role-load-error')
          .waitFor({ state: 'visible' })
        await settle()
        assert.deepEqual(
          await listIDs(),
          savedIDs,
          `${label}刷新失败保留已有任务`
        )
        assertControlsStay(layout, await refreshLayout(), `${label}刷新失败`)
        assert.deepEqual(
          requests.at(-1),
          savedQuery,
          `${label}刷新保留查询条件`
        )
        const beforeRetry = requests.length
        await pull()
        await end()
        await page
          .locator('.mobile-role-load-error')
          .waitFor({ state: 'hidden' })
        await settle()
        assert.equal(
          requests.length,
          beforeRetry + 1,
          `${label}失败后可再次下拉重试`
        )
        await assertRefreshLayout(layout, `${label}重试成功后`)

        await searchList('不存在的任务', viewKey)
        await page
          .getByText(emptyText, { exact: true })
          .waitFor({ state: 'visible' })
        await settle()
        const beforeEmpty = requests.length
        const emptyLayout = await pull(`${label}空列表`)
        await end()
        await settle()
        assert.equal(
          requests.length,
          beforeEmpty + 1,
          `${label}空列表也能下拉刷新`
        )
        assert.equal(requests.at(-1).view_key, viewKey)
        assert.equal(requests.at(-1).keyword, '不存在的任务')
        assert.equal(await listRows.count(), 0, `${label}空列表刷新不补造任务`)
        await assertRefreshLayout(emptyLayout, `${label}空列表刷新后`)
        if (messageTab) {
          assert.equal(
            await page
              .getByTestId(`mobile-role-message-tab-${messageTab}`)
              .getAttribute('aria-selected'),
            'true'
          )
        }
        await searchList('刷新模拟', viewKey)
        await listRows.first().waitFor({ state: 'visible' })
        await settle()
      }
      await page.getByTestId('mobile-role-nav-tasks').click()
      await page
        .getByLabel('任务状态', { exact: true })
        .getByText('待办', { exact: true })
        .click()
      await searchList('不存在的任务', 'approval')
      await page
        .getByText('当前筛选下暂无任务', { exact: true })
        .waitFor({ state: 'visible' })
      await settle()
      assert.equal(await rows.count(), 0)
      await pull()
      await end()
      await settle()
      assert.equal(await rows.count(), 0, '空列表也可刷新且不补造任务')
      await client.detach()
    },
  }
}
