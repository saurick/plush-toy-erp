import path from 'node:path'
import { progressFixtureData } from './businessProgressFixtures.mjs'

export function createMobileNavigationBadgeScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  return [false, true].map((withProgress) => {
    const role = withProgress ? 'pmc' : 'warehouse'
    const permissions = [
      `mobile.${role}.access`,
      'workflow.task.read',
      ...(withProgress
        ? [
            'erp.business_dashboard.read',
            'pmc.plan.read',
            'production.wip.read',
          ]
        : []),
    ]
    const task = {
      id: 701,
      version: 1,
      task_code: 'TASK-0701',
      task_name: '确认面料到货',
      task_group: 'material_check',
      owner_role_key: role,
      task_status_key: 'ready',
      source_type: 'sales_order',
      source_id: 1,
      source_no: 'SO-0001',
      created_at: 1788840000,
      payload: {},
    }
    const summary = (todo, risk, overdue = 0) => ({
      ready: todo,
      blocked: 0,
      todo,
      done: 0,
      rejected: 0,
      withdrawn: 0,
      history: 0,
      total: todo,
      approval: 0,
      risk,
      overdue,
    })
    let currentCounts, fail
    const countRequests = []
    const name = `mobile-nav-badges-${withProgress ? 'four' : 'three'}`
    return {
      name,
      path: `/m/${role}/tasks`,
      auth: 'admin',
      customerKey: 'yoyoosun',
      hasTouch: true,
      themeMode: withProgress ? 'dark' : 'light',
      viewport: { width: withProgress ? 390 : 360, height: 844 },
      adminProfile: {
        username: name,
        is_super_admin: false,
        roles: [{ role_key: role }],
        permissions,
        menus: [],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: permissions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [role],
        },
      },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        currentCounts = summary(124, 7, 3)
        fail = withProgress
        countRequests.length = 0
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_role_tasks' || params.limit !== 1)
            return route.fallback()
          countRequests.push(params)
          const hasMore = currentCounts.todo > 1
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: fail
                ? { code: 50000, message: '模拟计数更新失败' }
                : {
                    code: 0,
                    data: {
                      items: currentCounts.todo ? [task] : [],
                      next_cursor: hasMore ? 'badge-next-page' : '',
                      has_more: hasMore,
                      counts: currentCounts,
                      risk_scope: 'role',
                      server_time: Math.floor(Date.now() / 1000),
                    },
                  },
            }),
          })
        })
        await page.route('**/rpc/business', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_progress') return route.fallback()
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { code: 0, data: progressFixtureData(params) },
            }),
          })
        })
      },
      verify: async (page) => {
        const nav = page.getByTestId('mobile-role-bottom-nav')
        const todo = page.getByTestId('mobile-nav-todo-count')
        const risk = page.getByTestId('mobile-nav-risk-count')
        const retry = page.getByRole('button', {
          name: '角标更新失败 · 点此重试',
          exact: true,
        })
        const expectCounts = async (expectedTodo, expectedRisk) => {
          await page.waitForFunction(
            ([a, b]) =>
              document.querySelector('[data-testid="mobile-nav-todo-count"]')
                ?.textContent === a &&
              document.querySelector('[data-testid="mobile-nav-risk-count"]')
                ?.textContent === b,
            [expectedTodo, expectedRisk]
          )
        }
        await nav.waitFor()
        if (withProgress) {
          await retry.waitFor()
          assert.equal(await todo.count(), 0, 'unknown is not a zero badge')
          assert.equal(await risk.count(), 0)
          fail = false
          await retry.tap()
        }
        await expectCounts('99+', '7')
        assert.deepEqual(
          await nav
            .getByRole('tab')
            .evaluateAll((nodes) =>
              nodes.map((node) => node.getAttribute('aria-label'))
            ),
          withProgress
            ? ['进度', '任务', '风险', '我的']
            : ['任务', '风险', '我的']
        )
        assert.equal(
          await nav
            .getByRole('tab', { name: '任务', exact: true })
            .evaluate(
              (node) =>
                document.getElementById(node.getAttribute('aria-describedby'))
                  ?.textContent
            ),
          '124 项待办'
        )
        assert.equal(await nav.locator('.mobile-navigation-badge').count(), 2)
        await page.getByTestId('mobile-role-nav-tasks').tap()
        await page.locator('.erp-mobile-list-item').first().waitFor()
        await nav.evaluate(async (node) => {
          await new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          )
          await Promise.allSettled(
            node
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished)
          )
        })
        await assertNoHorizontalOverflow(page, name)
        await page.screenshot({
          path: path.join(outputDir, `${name}-tasks.png`),
        })
        const boxes = await nav.getByRole('tab').evaluateAll((nodes) =>
          nodes.map((node) => {
            const tab = node.getBoundingClientRect()
            const badge = node
              .querySelector('.mobile-navigation-badge')
              ?.getBoundingClientRect()
            return {
              tab: tab.toJSON(),
              badge: badge?.toJSON(),
              width: tab.width,
              height: tab.height,
              contained:
                !badge ||
                (badge.left >= tab.left &&
                  badge.right <= tab.right &&
                  badge.top >= tab.top &&
                  badge.bottom <= tab.bottom),
            }
          })
        )
        for (const box of boxes) {
          assert(box.width >= 44 && box.height >= 44)
          assert(
            box.contained,
            `badge must stay inside the tab touch target: ${JSON.stringify(box)}`
          )
        }
        const bounds = await nav.boundingBox()
        assert(bounds.y + bounds.height <= 844)
        const colors = await nav
          .locator('.mobile-navigation-badge')
          .evaluateAll((nodes) =>
            nodes.map((node) => getComputedStyle(node).backgroundColor)
          )
        assert.notEqual(colors[0], colors[1], 'risk has its own alert color')
        await nav.screenshot({
          path: path.join(outputDir, `${name}-navigation.png`),
        })
        await page.screenshot({ path: path.join(outputDir, `${name}.png`) })

        const searchResponse = page.waitForResponse((response) => {
          if (!response.url().endsWith('/rpc/workflow')) return false
          const body = response.request().postDataJSON()
          return (
            body?.method === 'list_role_tasks' &&
            body.params?.keyword === '没有匹配的任务'
          )
        })
        await page
          .getByLabel('搜索订单、产品、物料或款号')
          .fill('没有匹配的任务')
        await searchResponse
        await page.waitForFunction(
          () => document.querySelectorAll('.erp-mobile-list-item').length === 0
        )
        await expectCounts('99+', '7')
        await page.getByTestId('mobile-role-nav-messages').tap()
        await expectCounts('99+', '7')
        await page.getByTestId('mobile-role-nav-mine').tap()
        await expectCounts('99+', '7')
        await page.getByTestId('mobile-role-nav-tasks').tap()
        await page
          .getByLabel('任务状态', { exact: true })
          .getByText('已办', { exact: true })
          .tap()
        await page.getByText('已办任务', { exact: true }).waitFor()
        await expectCounts('99+', '7')

        fail = true
        await page.evaluate(() => window.dispatchEvent(new Event('online')))
        await retry.waitFor()
        await expectCounts('99+', '7')
        assert.equal(
          await nav
            .getByRole('tab', { name: '任务', exact: true })
            .evaluate(
              (node) =>
                document.getElementById(node.getAttribute('aria-describedby'))
                  ?.textContent
            ),
          '124 项待办，数量待更新'
        )
        await page.screenshot({
          path: path.join(outputDir, `${name}-retry.png`),
        })
        fail = false
        currentCounts = summary(9, 2)
        await retry.tap()
        await expectCounts('9', '2')
        await retry.waitFor({ state: 'hidden' })

        currentCounts = summary(0, 0)
        await page.getByRole('button', { name: '刷新', exact: true }).tap()
        await todo.waitFor({ state: 'hidden' })
        await risk.waitFor({ state: 'hidden' })
        assert.equal(
          await nav
            .getByRole('tab', { name: '任务', exact: true })
            .evaluate(
              (node) =>
                document.getElementById(node.getAttribute('aria-describedby'))
                  ?.textContent
            ),
          '0 项待办'
        )
        assert(countRequests.length >= 4)
        for (const query of countRequests) {
          assert.equal(query.role_key, role)
          assert.equal(query.view_key, 'todo')
          assert.equal(query.keyword || '', '')
          assert.equal(query.status_key || '', '')
          assert.equal(query.cursor || '', '')
        }
      },
    }
  })
}
