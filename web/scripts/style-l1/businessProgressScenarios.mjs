import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { progressFixtureData } from './businessProgressFixtures.mjs'

async function verifyProgressMotion(page, assert, reduced) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
  const root = page.locator('.erp-progress-toolbar .erp-sliding-segmented')
  if (reduced) {
    await root.getByText('订单交付', { exact: true }).click()
    await page.waitForTimeout(100)
  }
  const result = await root.evaluate(async (root) => {
    const group = root.querySelector('.ant-segmented-group')
    const target = group.querySelectorAll('.ant-segmented-item')[1]
    const before = root.getBoundingClientRect()
    const read = () => {
      const style = getComputedStyle(group, '::before')
      return {
        x: new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform
        ).m41,
        duration: style.transitionDuration,
      }
    }
    const start = read().x,
      frames = []
    target.click()
    const began = performance.now()
    await new Promise((resolve) => {
      const tick = () => {
        frames.push(read())
        if (performance.now() - began < 650) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    const after = root.getBoundingClientRect()
    return {
      start,
      target: target.offsetLeft,
      frames,
      stable: root.querySelector('.ant-segmented-group') === group,
      widthDelta: after.width - before.width,
      heightDelta: after.height - before.height,
      selected: target.querySelector('input').checked,
    }
  })
  assert(result.stable && result.selected)
  assert(Math.abs(result.widthDelta) < 1 && Math.abs(result.heightDelta) < 1)
  assert(
    Math.abs(result.frames.at(-1).x - result.target) < 1.5,
    JSON.stringify(result)
  )
  if (reduced)
    assert(
      result.frames.every((frame) =>
        frame.duration.split(',').every((value) => parseFloat(value) === 0)
      )
    )
  else
    assert(
      result.frames.some(
        (frame) => frame.x > result.start + 2 && frame.x < result.target - 2
      ),
      JSON.stringify(result)
    )
  if (reduced) await page.emulateMedia({ reducedMotion: 'no-preference' })
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
          if (!['list_progress', 'get_progress'].includes(method))
            return route.fallback()
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
        const board = page.getByRole('region', {
          name: '进度看板',
          exact: true,
        })
        await board.waitFor({ state: 'visible' })
        if (failed) {
          const retry = board.getByRole('button', { name: '重试', exact: true })
          await retry.waitFor()
          failNext = false
          await retry.click()
        }
        await board
          .getByRole('button', { name: 'SO-0001', exact: true })
          .waitFor()
        assert.equal(
          await page.locator('.erp-business-board-source-count').count(),
          0
        )
        await assertNoHorizontalOverflow(page, name)
        const geometry = await page.evaluate(() => {
          const root = document
            .querySelector('.erp-progress-board')
            .getBoundingClientRect()
          const controls = document
            .querySelector('.erp-progress-controls')
            .getBoundingClientRect()
          const table = document
            .querySelector('.erp-progress-table')
            .getBoundingClientRect()
          return {
            controlHeight: controls.height,
            tableTop: table.top,
            rootTop: root.top,
            overflow: document.documentElement.scrollWidth > innerWidth,
          }
        })
        assert.equal(geometry.overflow, false)
        if (!mobile)
          assert(geometry.controlHeight < 165, JSON.stringify(geometry))
        await page.screenshot({
          path: path.join(outputDir, name + '-overview.png'),
          fullPage: false,
        })
        if (restricted) {
          assert(
            await board
              .getByRole('button', { name: /生产：无权限/ })
              .first()
              .isDisabled()
          )
          assert(
            await board.getByRole('button', { name: /任务阻塞/ }).isDisabled()
          )
          return
        }
        if (name === 'erp-business-dashboard-desktop') {
          await board.locator('.ant-pagination-next button').click()
          await board
            .getByRole('button', { name: 'SO-0025', exact: true })
            .waitFor()
          assert.equal(new URL(page.url()).searchParams.get('page'), '2')
          await board.locator('.ant-pagination-prev button').click()
          await board
            .getByRole('button', { name: 'SO-0001', exact: true })
            .waitFor()
          await board.getByRole('button', { name: '筛选', exact: true }).click()
          await page.getByPlaceholder('输入姓名').fill('查无负责人')
          await page.getByRole('button', { name: '应用', exact: true }).click()
          await board.getByText('没有符合条件的记录').waitFor()
          assert.equal(
            new URL(page.url()).searchParams.get('owner'),
            '查无负责人'
          )
          await board
            .getByRole('button', { name: '清空筛选', exact: true })
            .click()
          await board
            .getByRole('button', { name: 'SO-0001', exact: true })
            .waitFor()
        }
        await board.getByRole('button', { name: /已逾期/ }).click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-progress-table .ant-table-tbody .ant-table-row'
            ).length === 1
        )
        assert(
          (
            await board
              .getByRole('group', { name: '按风险筛选进度' })
              .textContent()
          ).includes('24')
        )
        await board
          .getByRole('button', { name: 'SO-0001', exact: true })
          .click()
        const drawer = page.getByRole('dialog')
        await drawer.getByText('已出货 400', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '领料', exact: true }).click()
        await drawer.getByText('短毛绒面料', { exact: true }).waitFor()
        await drawer.getByRole('tab', { name: '关联任务', exact: true }).click()
        await drawer
          .getByRole('button', { name: '查看 TASK-0100', exact: true })
          .waitFor()
        await page.waitForTimeout(700)
        await page.screenshot({
          path: path.join(outputDir, name + '-detail.png'),
          fullPage: false,
        })
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert(
          (await board
            .getByRole('button', { name: /已逾期/ })
            .getAttribute('aria-pressed')) === 'true'
        )
        await board.getByRole('button', { name: '清空筛选' }).click()
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.erp-progress-table .ant-table-row')
              .length === 20 &&
            !document.querySelector('.erp-progress-table .ant-spin-spinning')
        )
        const search = board.getByPlaceholder('搜单号、客户、产品')
        await search.fill('查找目标客户')
        await search.press('Enter')
        await board
          .getByRole('button', { name: 'SO-0025', exact: true })
          .waitFor()
        assert(
          calls.some(
            (call) =>
              call.params.keyword === '查找目标客户' && call.params.offset === 0
          )
        )
        if (name === 'erp-business-dashboard-desktop') {
          const late = page.waitForRequest(
            (request) =>
              request.url().endsWith('/rpc/business') &&
              request.postDataJSON()?.params?.keyword === '迟到响应'
          )
          await search.fill('迟到响应')
          await search.press('Enter')
          await late
          await search.fill('查找目标客户')
          await search.press('Enter')
          await board
            .getByRole('button', { name: 'SO-0025', exact: true })
            .waitFor()
          await page.waitForTimeout(500)
          assert.equal(
            await board
              .getByRole('button', { name: 'SO-0025', exact: true })
              .count(),
            1
          )
          assert.equal(await board.getByText('没有符合条件的记录').count(), 0)
        }
        await search.fill('查无此单')
        await search.press('Enter')
        await board.getByText('没有符合条件的记录').waitFor()
        await board.getByRole('button', { name: '清空筛选' }).click()
        await board
          .getByRole('button', { name: 'SO-0001', exact: true })
          .waitFor()
        await verifyProgressMotion(page, assert, false)
        await board
          .getByRole('button', { name: 'MO-0001', exact: true })
          .waitFor()
        await verifyProgressMotion(page, assert, true)
        await page.screenshot({
          path: path.join(outputDir, name + '-production.png'),
          fullPage: false,
        })
        await board.getByRole('button', { name: '筛选', exact: true }).click()
        await page.getByPlaceholder('输入姓名').waitFor()
        await page.waitForTimeout(250)
        await assertNoHorizontalOverflow(page, name + '-filters-open')
        const filterGeometry = await page
          .locator('.erp-progress-filters')
          .evaluate((root) => {
            const box = root.getBoundingClientRect()
            return {
              height: box.height,
              inputs: [...root.querySelectorAll('.ant-picker')].map((input) => {
                const r = input.getBoundingClientRect()
                return { height: r.height, right: r.right, limit: box.right }
              }),
            }
          })
        assert(filterGeometry.height < 260, JSON.stringify(filterGeometry))
        assert(
          filterGeometry.inputs.every(
            (input) =>
              input.height >= 28 &&
              input.height <= 40 &&
              input.right <= input.limit + 1
          ),
          JSON.stringify(filterGeometry)
        )
        if (mobile) {
          await page
            .locator('.erp-progress-filters .ant-picker-input input')
            .first()
            .click()
          await page
            .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
            .waitFor()
          await page.waitForTimeout(300)
          await page.screenshot({
            path: path.join(outputDir, name + '-date-filter.png'),
            fullPage: false,
          })
          await assertNoHorizontalOverflow(page, name + '-date-filter')
          await page.keyboard.press('Escape')
        }
        await page
          .getByRole('button', { name: '查看未关联销售的生产单', exact: true })
          .click()
        await board
          .getByRole('button', { name: 'MO-0003', exact: true })
          .waitFor()
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.erp-progress-table .ant-table-row')
              .length === 1
        )
        assert(
          calls.some(
            (call) =>
              call.params.view === 'production' &&
              call.params.risk === 'unlinked'
          )
        )
        await assertNoHorizontalOverflow(page, name + '-production')
        if (name === 'erp-business-dashboard-desktop') {
          await board
            .getByRole('button', { name: 'MO-0003', exact: true })
            .click()
          const sourceDialog = page.getByRole('dialog')
          await sourceDialog
            .getByRole('tab', { name: '产品明细', exact: true })
            .waitFor()
          await page.waitForTimeout(100)
          const sourceOpen = sourceDialog.getByRole('button', {
            name: '打开原单',
            exact: true,
          })
          assert.equal(
            await sourceOpen.count(),
            1,
            await sourceDialog.innerText()
          )
          await sourceOpen.click()
          await page.waitForURL(
            (url) =>
              url.pathname === '/erp/production/orders' &&
              url.searchParams.get('production_order_id') === '3'
          )
          await page.goBack()
          await board
            .getByRole('button', { name: 'MO-0003', exact: true })
            .waitFor()
          assert(new URL(page.url()).searchParams.get('risk') === 'unlinked')
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
