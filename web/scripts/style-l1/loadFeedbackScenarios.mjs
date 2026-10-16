import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'

export function createLoadFeedbackScenarios({
  assert,
  assertNoHorizontalOverflow,
  outputDir,
  customerRuntimeEffectiveSession,
}) {
  const scenarios = ['progress', 'tasks', 'desktop'].map((view) => {
    const mobile = view !== 'desktop'
    const role = mobile ? 'pmc' : 'sales'
    const permissions = [
      'workflow.task.read',
      `mobile.${role}.access`,
      ...(view === 'progress'
        ? [
            'erp.business_dashboard.read',
            'pmc.plan.read',
            'production.wip.read',
          ]
        : []),
    ]
    let failing
    const reads = []
    const name = `load-feedback-${view}`
    return {
      name,
      path: mobile ? `/m/${role}/tasks` : '/erp/task-board?mode=todo',
      auth: 'admin',
      customerKey: 'yoyoosun',
      themeMode: view === 'tasks' ? 'dark' : 'light',
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1920, height: 1080 },
      deviceScaleFactor: mobile ? 1 : 2,
      hasTouch: mobile,
      adminProfile: {
        id: mobile ? 1 : 7,
        username: name,
        is_super_admin: false,
        roles: [{ role_key: role }],
        permissions,
        menus: mobile ? [] : ['/erp/task-board'],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        ...(mobile ? {} : { pages: ['task-board'] }),
        actions: permissions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [role],
        },
      },
      workflowTaskFixtures: [
        {
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
        },
      ],
      beforeNavigate: async (page) => {
        failing = new Set()
        reads.length = 0
        await page.route('**/rpc/**', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          const kind =
            method === 'get_effective_session'
              ? 'profile'
              : method === 'list_progress'
                ? 'progress'
                : method === 'list_role_tasks'
                  ? params.limit === 1
                    ? 'counts'
                    : 'tasks'
                  : method === 'get_task_board' && params.limit !== 1
                    ? 'desktop'
                    : null
          if (kind) reads.push(kind)
          const respond = (result) =>
            route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({ jsonrpc: '2.0', id, result }),
            })
          if (failing.has(kind)) {
            return respond({
              code: 50000,
              message: '系统暂时不可用，请稍后重试',
            })
          }
          if (kind === 'progress') {
            return respond({ code: 0, data: progressFixtureData(params) })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        const rows = page.locator(
          view === 'progress'
            ? '.mobile-progress-card'
            : mobile
              ? '.erp-mobile-list-item'
              : '.erp-task-board-card'
        )
        await rows.first().waitFor()
        const errorSurfaces = page
          .locator(
            '.mobile-role-sync-banner, .mobile-role-load-error, .mobile-progress-error, .mobile-navigation-count-error, .ant-message-error, .erp-admin-content .ant-alert-error'
          )
          .filter({ visible: true })
        const trigger = async () => {
          if (mobile) {
            await page.evaluate(() =>
              document.dispatchEvent(new Event('visibilitychange'))
            )
            await pullToRefresh(
              page,
              view === 'progress'
                ? page.locator('.mobile-progress-scroll')
                : page.getByTestId('mobile-role-scroll')
            )
          } else {
            await page
              .getByRole('button', { name: '刷新当前页', exact: true })
              .click()
          }
        }
        failing = new Set(mobile ? ['profile', 'counts', view] : ['desktop'])
        await trigger()
        await page.waitForFunction(
          (mobileView) =>
            mobileView
              ? Boolean(
                  document.querySelector('.mobile-role-sync-banner') ||
                  document.querySelector('.mobile-role-load-error') ||
                  document.querySelector('.mobile-progress-error')
                )
              : Boolean(
                  document.querySelector('.erp-admin-content .ant-alert-error')
                ),
          mobile
        )
        if (mobile) {
          await page.waitForFunction(() => {
            const id = document
              .querySelector('[data-testid="mobile-role-nav-tasks"]')
              ?.getAttribute('aria-describedby')
            return (
              id &&
              document.getElementById(id)?.textContent.includes('数量待更新')
            )
          })
        }
        const readSurfaces = await errorSurfaces.allTextContents()
        await page.screenshot({
          path: path.join(outputDir, `${name}-failure.png`),
          fullPage: true,
        })
        await writeFile(
          path.join(outputDir, `${name}-failure.json`),
          JSON.stringify({ readSurfaces, reads }, null, 2)
        )
        assert.equal(
          readSurfaces.length,
          1,
          `${name}: 同一轮读取失败只保留一个提示区域: ${JSON.stringify(readSurfaces)}`
        )
        if (mobile) assert((await rows.count()) > 0, '刷新失败必须保留原列表')
        await assertNoHorizontalOverflow(page)
        const retry = errorSurfaces
          .getByRole('button')
          .or(errorSurfaces.and(page.getByRole('button')))
        if (mobile) {
          failing.delete('profile')
          await retry.click()
          await page
            .locator('.mobile-role-sync-banner')
            .waitFor({ state: 'hidden' })
          await page
            .locator(
              view === 'progress'
                ? '.mobile-progress-error'
                : '.mobile-role-load-error'
            )
            .waitFor()
          assert.equal(
            await errorSurfaces.count(),
            1,
            '连接恢复但数据仍失败时只保留列表提示'
          )
        }
        const before = reads.length
        failing = new Set()
        await retry.click()
        await errorSurfaces.waitFor({ state: 'hidden' })
        await rows.first().waitFor()
        assert(reads.slice(before).includes(view), '重试必须刷新当前列表')
        if (mobile) {
          assert(reads.slice(before).includes('counts'), '重试必须恢复导航计数')
          failing = new Set(['counts'])
          await page.evaluate(() => window.dispatchEvent(new Event('online')))
          await page.locator('.mobile-navigation-count-error').waitFor()
          assert.equal(
            await errorSurfaces.count(),
            1,
            '只有角标失败时仍保留可用重试入口'
          )
          failing.clear()
          await page.locator('.mobile-navigation-count-error').click()
          await errorSurfaces.waitFor({ state: 'hidden' })
        }
        await page.screenshot({
          path: path.join(outputDir, `${name}-recovered.png`),
          fullPage: true,
        })
      },
    }
  })
  scenarios.push({
    name: 'load-feedback-inventory',
    path: '/erp/warehouse/inventory?inventory_operation_id=701',
    auth: 'admin',
    customerKey: 'yoyoosun',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      await page.route('**/rpc/inventory', async (route) => {
        const { id, method } = route.request().postDataJSON()
        if (method !== 'get_inventory_operation') return route.fallback()
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: { code: 50000, message: '系统暂时不可用，请稍后重试' },
          }),
        })
      })
    },
    verify: async (page) => {
      const feedback = page.locator('.erp-inventory-operation-receipt')
      await feedback.waitFor()
      assert.match(await feedback.textContent(), /最近库存作业暂时无法恢复/u)
      assert.equal(
        await page.locator('.ant-message-error').count(),
        0,
        '恢复库存作业失败已在页面反馈，不再重复浮动提示'
      )
      await assertNoHorizontalOverflow(page)
      await page.screenshot({
        path: path.join(outputDir, 'load-feedback-inventory.png'),
        fullPage: true,
      })
    },
  })
  scenarios.push(
    ...[
      ['sales', '/erp/sales/project-orders/sales-orders'],
      ['purchase', '/erp/purchase/accessories'],
      ['receipts', '/erp/warehouse/inbound'],
      ['quality', '/erp/production/quality-inspections'],
      ['inventory-list', '/erp/warehouse/inventory'],
      ['shipments', '/erp/warehouse/shipments'],
      ['bom', '/erp/purchase/material-bom'],
      ['materials', '/erp/master/materials'],
    ].map(([module, routePath]) => {
      let failing = true
      const failedReads = new Set()
      return {
        name: `load-feedback-parallel-${module}`,
        path: routePath,
        auth: 'admin',
        customerKey: 'yoyoosun',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1440, height: 900 },
        beforeNavigate: async (page) => {
          failing = true
          failedReads.clear()
          await page.route('**/rpc/**', async (route) => {
            const domain = new URL(route.request().url()).pathname
              .split('/')
              .at(-1)
            if (
              !failing ||
              ![
                'masterdata',
                'sales_order',
                'purchase_order',
                'purchase',
                'quality',
                'inventory',
                'bom',
              ].includes(domain)
            ) {
              return route.fallback()
            }
            const { id, method } = route.request().postDataJSON()
            failedReads.add(`${domain}/${method}`)
            return route.fulfill({
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '系统暂时不可用，请稍后重试' },
              }),
            })
          })
        },
        verify: async (page) => {
          await page.locator('.ant-message-error').first().waitFor()
          await page.waitForFunction(
            () =>
              ![...document.querySelectorAll('.ant-spin-spinning')].some(
                (spinner) => {
                  const bounds = spinner.getBoundingClientRect()
                  return bounds.width > 0 && bounds.height > 0
                }
              )
          )
          assert(
            failedReads.size > 1,
            `${module}: 必须实际覆盖多个并行读取失败`
          )
          assert.equal(
            await page.locator('.ant-message-error').count(),
            1,
            `${module}: 并行读取只显示一条浮动提示`
          )
          failing = false
          await page
            .getByRole('button', { name: '刷新当前页', exact: true })
            .click()
          await page.locator('.ant-message-success').waitFor()
          await assertNoHorizontalOverflow(page)
        },
      }
    })
  )
  return scenarios
}
