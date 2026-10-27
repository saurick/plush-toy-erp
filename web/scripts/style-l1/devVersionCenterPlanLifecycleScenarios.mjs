import { DEV_DELIVERY_TARGETS, deliveryOperationRetryPolicy } from '../../src/dev-workbench/config/devDelivery.mjs'
import { installSummaryRoute, operationIdempotency, waitForView } from './devVersionCenterScenarios.mjs'

export function createDevVersionCenterPlanLifecycleScenarios({ assert, assertNoHorizontalOverflow }) {
  let lifecycleSummary
  let lifecycleActionCount = 0
  return [
    {
      name: 'dev-version-center-plan-lifecycle-desktop',
      path: '/__dev/version-center?view=versions&target=demo-133&customer=yoyoosun',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      auth: 'admin',
      mockAdminRpc: true,
      beforeNavigate: async (page) => {
        lifecycleActionCount = 0
        lifecycleSummary = await installSummaryRoute(page)
        const ready = lifecycleSummary.operations.find(operation => operation.status === 'ready')
        ready.target = 'demo-133'
        ready.confirmationRequired = `PROMOTE:demo-133:${ready.gitSha}:${ready.id}`
        await page.route('**/__dev/api/delivery/session', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'plush.dev-delivery-session', csrfToken: 'a'.repeat(48), target: 'demo-133', targets: DEV_DELIVERY_TARGETS.map(target => target.key) }) }))
        await page.route('**/__dev/api/delivery/actions', async route => {
          const request = route.request().postDataJSON()
          lifecycleActionCount += 1
          const previous = lifecycleSummary.operations.find(operation => operation.id === request.payload.operationId)
          assert(previous, 'the action must address an existing scoped plan')
          let operation
          if (request.action === 'abandon-plan') {
            assert.equal(request.payload.target, 'demo-133')
            assert.equal(previous.status, 'ready')
            Object.assign(previous, { status: 'abandoned', terminal: true, confirmationRequired: '', retry: deliveryOperationRetryPolicy({ ...previous, status: 'abandoned' }) })
            previous.events.push({ at: previous.updatedAt, status: 'abandoned', message: '已放弃待确认计划，未执行目标写入' })
            operation = previous
          } else {
            assert.equal(request.action, 'retry-operation', 'browser regression must never execute a deployment')
            assert.equal(previous.status, 'abandoned')
            const id = 'f0000002-0000-4000-8000-000000000002'
            operation = { ...previous, id, status: 'ready', terminal: false, issues: [], events: [{ at: previous.updatedAt, status: 'ready', message: 'promotion plan is eligible; explicit confirmation is required' }], retry: deliveryOperationRetryPolicy({ ...previous, status: 'ready' }), idempotency: operationIdempotency(id, { attempt: 2, retryOfOperationId: previous.id }) }
            operation.confirmationRequired = `PROMOTE:demo-133:${operation.gitSha}:${id}`
            lifecycleSummary.operations.unshift(operation)
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ kind: 'plush.dev-delivery-action-result', action: request.action, operation }) })
        })
      },
      verify: async (page) => {
        const current = page.locator('.erp-dev-version-current-operation')
        await current.getByRole('button', { name: '放弃计划', exact: true }).waitFor()
        await current.getByText('准备耗时', { exact: false }).waitFor()
        const fullHeight = await current.evaluate(node => node.getBoundingClientRect().height)
        const nav = page.getByRole('tablist').filter({ has: page.getByRole('tab', { name: '版本与部署' }) })
        const navBefore = await nav.boundingBox()
        for (const [label, view] of [['发布检查', 'overview'], ['发布与部署耗时', 'pipeline'], ['操作记录', 'history']]) {
          await page.getByRole('tab', { name: label, exact: true }).click()
          await waitForView(page, view)
          assert.equal(await current.getByRole('button', { name: '确认部署', exact: true }).count(), 0)
          assert.equal(await current.locator('.ant-card-head').count(), 0)
          const compactHeight = await current.evaluate(node => node.getBoundingClientRect().height)
          assert(compactHeight <= 76 && compactHeight < fullHeight, 'cross-tab operation progress must be a compact row')
          const navAfter = await nav.boundingBox()
          assert(Math.abs(navBefore.y - navAfter.y) <= 1 && Math.abs(navBefore.height - navAfter.height) <= 1, 'switching tabs must preserve navigation geometry')
          await assertNoHorizontalOverflow(page, `plan lifecycle ${view}`)
        }
        await page.getByRole('tab', { name: '发布与部署耗时', exact: true }).click()
        await waitForView(page, 'pipeline')
        await page.setViewportSize({ width: 1280, height: 800 })
        await assertNoHorizontalOverflow(page, 'plan lifecycle compact desktop width')
        await page.setViewportSize({ width: 1440, height: 900 })
        await current.getByRole('button', { name: '查看详情', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await drawer.getByRole('button', { name: '放弃计划', exact: true }).waitFor()
        await drawer.getByRole('button', { name: '放弃计划', exact: true }).click()
        await drawer.getByText('已放弃', { exact: true }).first().waitFor()
        assert.equal(await drawer.getByRole('button', { name: '确认部署', exact: true }).count(), 0)
        assert.equal(await drawer.getByRole('button', { name: '放弃计划', exact: true }).count(), 0)
        await drawer.locator('.ant-drawer-close').click()
        await drawer.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'tab')
        await waitForView(page, 'pipeline')
        const focus = await page.evaluate(() => ({
          restored: document.activeElement === Array.from(document.querySelectorAll('[role="tab"][aria-selected="true"]')).find(node => node.getClientRects().length > 0),
          hidden: Boolean(document.activeElement?.closest('[aria-hidden="true"], [inert]')),
        }))
        assert.deepEqual(focus, { restored: true, hidden: false }, await page.evaluate(() => JSON.stringify({
          active: { text: document.activeElement?.textContent, role: document.activeElement?.getAttribute('role'), selected: document.activeElement?.getAttribute('aria-selected') },
          tabs: Array.from(document.querySelectorAll('[role="tab"]')).map(node => ({ text: node.textContent, selected: node.getAttribute('aria-selected'), visible: node.getClientRects().length > 0 })),
        })))
        assert.equal(await current.count(), 0)
        await page.getByRole('tab', { name: '操作记录', exact: true }).click()
        await waitForView(page, 'history')
        const abandoned = page.getByRole('row').filter({ hasText: '已放弃' })
        await page.getByLabel('当前筛选的操作统计').getByText('已放弃 1', { exact: true }).waitFor()
        await abandoned.getByRole('button', { name: '重新准备', exact: true }).click()
        await current.waitFor({ state: 'visible' })
        await current.getByRole('button', { name: '查看详情', exact: true }).click()
        await drawer.getByRole('button', { name: '确认部署', exact: true }).waitFor()
        await drawer.locator('.ant-drawer-close').click()
        await drawer.waitFor({ state: 'hidden' })
        const ready = lifecycleSummary.operations.find(operation => operation.status === 'ready')
        Object.assign(ready, { status: 'invalidated', terminal: true, confirmationRequired: '', issues: [{ code: 'delivery_plan_expired', level: 'warning', message: '待确认计划已超过 24 小时有效期，请重新准备' }] })
        ready.events.push({ at: ready.updatedAt, status: 'invalidated', message: '待确认计划已超过 24 小时有效期，请重新准备' })
        ready.retry = deliveryOperationRetryPolicy(ready)
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await page.getByRole('row').filter({ hasText: '已失效' }).waitFor()
        await page.getByLabel('当前筛选的操作统计').getByText('已失效 1', { exact: true }).waitFor()
        await page.getByRole('row').filter({ hasText: '已失效' }).getByRole('button', { name: '查看详情', exact: true }).click()
        await drawer.getByText('已失效', { exact: true }).first().waitFor()
        assert.equal(await drawer.getByRole('button', { name: '确认部署', exact: true }).count(), 0)
        await drawer.locator('.ant-drawer-close').click()
        await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('row').filter({ hasText: '已失效' }).waitFor()
        assert.equal(await current.count(), 0)
        assert.equal(lifecycleActionCount, 2)
        await page.reload()
        await waitForView(page, 'history')
        await page.getByRole('row').filter({ hasText: '已失效' }).waitFor()
        assert.equal(await current.count(), 0)
        await page.getByRole('tab', { name: '版本与部署', exact: true }).click()
        await waitForView(page, 'versions')
        assert.equal(await page.getByRole('button', { name: '准备部署', exact: true }).first().isEnabled(), true)
        const running = { ...ready, id: 'f0000003-0000-4000-8000-000000000003', status: 'running', terminal: false, issues: [], events: [{ at: ready.updatedAt, status: 'running', message: 'target write started with the fixed promotion contract' }], idempotency: operationIdempotency('f0000003-0000-4000-8000-000000000003', { attempt: 3, retryOfOperationId: ready.id }) }
        running.retry = deliveryOperationRetryPolicy(running)
        lifecycleSummary.operations.unshift(running)
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await current.getByText('执行中', { exact: true }).waitFor()
        assert.equal(await current.getByRole('button', { name: '放弃计划', exact: true }).count(), 0)
        const targetSelector = page.getByLabel('切换当前操作目标')
        await targetSelector.getByText('test 甲方测试验收', { exact: true }).click()
        await page.waitForURL(url => url.searchParams.get('target') === 'customer-test-133')
        await waitForView(page, 'versions')
        await current.waitFor({ state: 'detached' })
        assert.equal(await current.count(), 0)
        await targetSelector.getByText('demo 项目演练造数', { exact: true }).click()
        await current.waitFor({ state: 'visible' })
        Object.assign(running, { status: 'not_proven', terminal: true })
        running.retry = deliveryOperationRetryPolicy(running)
        running.events.push({ at: running.updatedAt, status: 'not_proven', message: 'target outcome unknown' })
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await page.getByText('有 1 条操作结果未证明，请先核对目标与原始回执', { exact: true }).waitFor()
        assert.equal(await current.count(), 0)
        await assertNoHorizontalOverflow(page, 'plan lifecycle complete')
      },
    },
  ]
}
