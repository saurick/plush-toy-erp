import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

async function verifyProgressMotion(page, assert, reduced) {
  const selector = '[aria-label="进度查看方式"]'
  const root = page.locator(selector)
  await root.getByRole('tab', { name: '订单交付', exact: true }).click()
  await root.getByRole('tab', { name: '订单交付', exact: true, selected: true }).waitFor()
  const index = await root.getByRole('tab').evaluateAll((tabs) => tabs.findIndex((tab) => tab.textContent.trim() === '生产执行'))
  assert(index >= 0, '内容导航包含目标页签')
  await verifyMobileNavigationMotion(page, assert, selector, index, reduced)
}

export function createBusinessProgressScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const make = (
    name,
    { dark = false, failed = false, restricted = false, mobile = false } = {}
  ) => {
    let failNext = failed
    const calls = []
    return {
      name,
      path: '/erp/business-dashboard',
      auth: 'admin',
      themeMode: dark ? 'dark' : 'light',
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: mobile ? 3 : 3840 / 1440,
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          'erp.business_dashboard.read',
          'sales_order.read',
          'sales_order_item.read',
          'pmc.plan.read',
          'production.wip.read',
          'workflow.task.read',
        ],
      },
      beforeNavigate: async (page) => {
        failNext = failed
        calls.length = 0
        await page.route('**/rpc/business', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_progress', 'get_progress'].includes(method)) {
            return route.fallback()
          }
          calls.push({ method, params })
          if (params.keyword === '迟到响应') await delay(400)
          if (failNext) {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '查询暂不可用' },
              }),
            })
          }
          const data = progressFixtureData(params, {
            restricted,
            detail: method === 'get_progress',
          })
          if (!restricted) {
            const rows = data.rows || [data.row]
            for (const row of rows) {
              if (row.id === 2) {
                Object.assign(row, {
                  attention_task: 'engineering_data',
                  attention_task_id: 102,
                  attention_role: 'engineering',
                  open_tasks: 1,
                })
              }
            }
            if (data.sections?.tasks) {
              data.sections.tasks[0].label = 'order_approval'
            }
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { code: 0, message: 'OK', data },
            }),
          })
        })
      },
      verify: async (page) => {
        const board = page.getByRole('region', { name: '进度看板', exact: true })
        const progressCard = (orderNo) => board.getByRole('button', { name: `查看 ${orderNo} 完整进度`, exact: true })
        const search = board.getByPlaceholder('搜单号、客户、产品')
        if (failed) {
          await board.getByRole('button', { name: '重试', exact: true }).waitFor()
          assert((await board.getByRole('group', { name: '交期情况', exact: true }).locator('.erp-filter-chip__count').allTextContents()).every((count) => count === '—'))
          failNext = false
          await board.getByRole('button', { name: '重试', exact: true }).click()
        }
        await progressCard('SO-0001').waitFor()
        assert.equal(await board.locator('.erp-progress-summary').count(), 0)
        assert.equal(await board.locator('.erp-progress-list img').count(), 0)
        const density = await board.locator('.erp-progress-row').evaluateAll((rows) => rows.slice(0, 4).map((row) => ({ height: row.getBoundingClientRect().height, overflow: row.scrollWidth - row.clientWidth })))
        assert(density.every((row) => row.overflow <= 1), JSON.stringify(density))
        if (!mobile) assert(density.every((row) => row.height < 135), JSON.stringify(density))
        await assertNoHorizontalOverflow(page, name)
        await page.screenshot({ path: path.join(outputDir, `${name}-overview.png`) })
        if (restricted) {
          const blocked = board.getByRole('button', { name: /仅看任务受阻/ })
          assert(await blocked.isDisabled())
          assert.equal(await blocked.locator('.erp-filter-chip__count').innerText(), '—')
          await board.getByText('任务无查看权限').first().waitFor()
          assert.equal(await board.getByText('面料交期尚未确认', { exact: true }).count(), 0)
          await progressCard('SO-0001').click()
          const detail = page.getByRole('dialog')
          await detail.getByRole('button', { name: /生产：无权限/ }).waitFor()
          assert(await detail.getByRole('button', { name: /生产：无权限/ }).isDisabled())
          await page.keyboard.press('Escape')
          return
        }
        await board.getByText('面料交期尚未确认', { exact: true }).waitFor()
        await board.getByText('采购待领取', { exact: false }).first().waitFor()
        await board.getByText('工程资料', { exact: true }).waitFor()
        assert.equal(await board.getByText('engineering_data', { exact: true }).count(), 0)
        const listReadCount = calls.filter((call) => call.method === 'list_progress').length
        await progressCard('SO-0002').click()
        let drawer = page.getByRole('dialog')
        await drawer.getByRole('heading', { name: 'SO-0002', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('selected'), 'orders:2')
        assert.equal(calls.filter((call) => call.method === 'list_progress').length, listReadCount)
        await drawer.getByRole('button', { name: '质检：1 批待检', exact: true }).click()
        await drawer.getByRole('tab', { name: '工序批次', exact: true, selected: true }).waitFor()
        await assertBusinessModalViewport(page, drawer, { label: name })
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert(await progressCard('SO-0002').evaluate((node) => node === document.activeElement))
        await progressCard('SO-0001').focus()
        await page.keyboard.press('Space')
        await page.getByRole('dialog').getByRole('heading', { name: 'SO-0001', exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        if (name === 'erp-business-dashboard-desktop') {
          await board.getByRole('button', { name: '查看 SO-0002 的关联任务', exact: true }).click()
          await page.waitForURL((url) => url.pathname === '/erp/task-board' && url.searchParams.get('link_task') === '102')
          await page.goBack()
          await progressCard('SO-0002').waitFor()
          const pagination = board.getByRole('navigation', { name: '进度分页' })
          await pagination.getByText('第 1–20 单，共 24 单', { exact: true }).waitFor()
          await pagination.locator('.ant-select-selector').click()
          await page.getByText('8 单 / 页', { exact: true }).click()
          await pagination.getByText('第 1–8 单，共 24 单', { exact: true }).waitFor()
          await pagination.getByRole('button', { name: '下一页', exact: true }).click()
          await pagination.getByText('第 9–16 单，共 24 单', { exact: true }).waitFor()
          assert(calls.some((call) => call.params.limit === 8 && call.params.offset === 8))
          await pagination.locator('.ant-select-selector').click()
          await page.getByText('20 单 / 页', { exact: true }).click()
          await board.locator('.ant-pagination-next button').click()
          await progressCard('SO-0025').waitFor()
          await board.locator('.ant-pagination-prev button').click()
          await progressCard('SO-0001').waitFor()
          await board.getByRole('button', { name: /^筛选进度/ }).click()
          await page.getByPlaceholder('输入姓名').fill('查无负责人')
          await board.getByText('没有符合条件的记录').waitFor()
          assert.equal(new URL(page.url()).searchParams.get('owner'), '查无负责人')
          await page.getByRole('button', { name: '重置筛选', exact: true }).click()
          await page.keyboard.press('Escape')
          await progressCard('SO-0001').waitFor()
        }
        await board.getByRole('button', { name: /已逾期/ }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-progress-row').length === 1)
        await board.getByRole('button', { name: /仅看任务受阻/ }).click()
        await progressCard('SO-0001').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('blocked_only'), 'true')
        await board.getByRole('button', { name: '查看 SO-0001 的关联任务', exact: true }).click()
        drawer = page.getByRole('dialog')
        await drawer.getByRole('tab', { name: '关联任务', exact: true, selected: true }).waitFor()
        await drawer.getByText('订单审批', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '产品明细', exact: true }).click()
        await drawer.getByText('已出货 400', { exact: true }).waitFor()
        const stageLabels = await drawer.locator('[data-progress-stage]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-progress-stage')))
        assert.deepEqual(stageLabels, ['engineering', 'materials', 'production', 'quality', 'shipment'])
        await drawer.getByRole('tab', { name: '领料', exact: true }).click()
        await drawer.getByText('短毛绒面料', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '领料', exact: true }).focus()
        await page.keyboard.press('ArrowRight')
        await drawer.getByRole('tab', { name: '关联任务', exact: true, selected: true }).waitFor()
        await drawer.getByRole('button', { name: '查看 TASK-0100', exact: true }).waitFor()
        assert.equal(await drawer.getByText('order_approval', { exact: true }).count(), 0)
        await assertBusinessModalViewport(page, drawer, { label: name })
        await page.screenshot({ path: path.join(outputDir, `${name}-complete-progress.png`) })
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(new URL(page.url()).searchParams.get('due_status'), 'overdue')
        await board.getByRole('button', { name: /仅看任务受阻/ }).click()
        await board.getByRole('button', { name: /^不限交期/ }).click()
        await search.fill('查找目标客户')
        await progressCard('SO-0025').waitFor()
        if (name === 'erp-business-dashboard-desktop') {
          const late = page.waitForRequest((request) => request.url().endsWith('/rpc/business') && request.postDataJSON()?.params?.keyword === '迟到响应')
          await search.fill('迟到响应')
          await late
          await search.fill('查找目标客户')
          await progressCard('SO-0025').waitFor()
          await page.waitForTimeout(500)
          assert.equal(await progressCard('SO-0025').count(), 1)
        }
        await search.fill('查无此单')
        await board.getByText('没有符合条件的记录').waitFor()
        assert.equal(await board.locator('.erp-progress-row').count(), 0)
        await search.fill('')
        await progressCard('SO-0001').waitFor()
        await verifyProgressMotion(page, assert, false)
        await progressCard('MO-0001').waitFor()
        await verifyProgressMotion(page, assert, true)
        await board.getByRole('button', { name: /^筛选进度/ }).click()
        await page.getByPlaceholder('输入姓名').waitFor()
        await assertNoHorizontalOverflow(page, `${name}-filters-open`)
        if (mobile) {
          await page.getByRole('button', { name: '自定义交期日期', exact: true }).click()
          const dates = page.getByRole('dialog', { name: '选择交期日期范围', exact: true })
          await dates.waitFor()
          await assertNoHorizontalOverflow(page, `${name}-date-filter`)
          await dates.getByRole('button', { name: '取消', exact: true }).click()
        }
        await page.getByRole('button', { name: /^仅看未关联销售/ }).click()
        await page.getByRole('dialog', { name: '筛选进度', exact: true }).getByRole('button', { name: '完成', exact: true }).click()
        assert.equal(await board.getByRole('button', { name: /^筛选进度/ }).evaluate((node) => node === document.activeElement), true)
        await progressCard('MO-0003').waitFor()
        await page.waitForFunction(() => document.querySelectorAll('.erp-progress-row').length === 1)
        await board.getByText('按明细查看', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, `${name}-production.png`) })
        await assertNoHorizontalOverflow(page, `${name}-production`)
        await board.locator('[aria-label="进度查看方式"]').getByText('订单交付', { exact: true }).click()
        await progressCard('SO-0001').waitFor()
        assert.equal(new URL(page.url()).searchParams.has('unlinked_only'), false)
        await board.locator('[aria-label="进度查看方式"]').getByText('生产执行', { exact: true }).click()
        await progressCard('MO-0003').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('unlinked_only'), 'true')
        await progressCard('MO-0003').click()
        drawer = page.getByRole('dialog')
        await drawer.getByRole('tab', { name: '产品明细', exact: true }).waitFor()
        if (name === 'erp-business-dashboard-desktop') {
          await drawer.getByRole('button', { name: '打开原单', exact: true }).click()
          await page.waitForURL((url) => url.pathname === '/erp/production/orders' && url.searchParams.get('production_order_id') === '3')
          await page.goBack()
          await progressCard('MO-0003').waitFor()
          assert.equal(new URL(page.url()).searchParams.get('unlinked_only'), 'true')
        } else {
          await page.keyboard.press('Escape')
        }
      },
    }
  }
  return [
    make('erp-business-dashboard-desktop'),
    make('erp-business-dashboard-dark-desktop', { dark: true }),
    make('erp-business-dashboard-stats-unavailable-desktop', { failed: true }),
    make('erp-business-dashboard-workflow-unavailable-desktop', {
      restricted: true,
    }),
    make('erp-business-dashboard-mobile', { mobile: true }),
  ]
}
