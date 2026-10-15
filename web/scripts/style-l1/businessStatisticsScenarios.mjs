import { setTimeout as pause } from 'node:timers/promises'
import { statisticsFixtureData } from './businessStatisticsFixtures.mjs'

async function select(page, name, label) {
  await page.getByRole('combobox', { name, exact: true }).focus()
  await page.getByRole('combobox', { name, exact: true }).press('ArrowDown')
  await page
    .locator('.ant-select-dropdown:visible')
    .getByText(label, { exact: true })
    .click()
  await page.waitForFunction(() => {
    const body = document.querySelector('.erp-statistics-body')
    return (
      body?.getAttribute('aria-busy') === 'false' &&
      body.querySelector(
        '.erp-statistics-table, .erp-statistics-chart, .ant-empty, .ant-alert'
      )
    )
  })
}
async function verifyMotion(root, assert, reduced = false) {
  const value = await root.evaluate(async (root) => {
    const group = root.querySelector('.ant-segmented-group')
    const buttons = group.querySelectorAll('.ant-segmented-item')
    const target = buttons[2]
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
    const start = read().x
    target.click()
    const frames = []
    const time = performance.now()
    await new Promise((resolve) => {
      const tick = () => {
        frames.push(read())
        if (performance.now() - time < 420) requestAnimationFrame(tick)
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
    }
  })
  assert(
    value.stable &&
      Math.abs(value.widthDelta) < 1 &&
      Math.abs(value.heightDelta) < 1
  )
  assert(Math.abs(value.frames.at(-1).x - value.target) < 1.5)
  assert(
    reduced
      ? value.frames.every((frame) =>
          frame.duration
            .split(',')
            .every((duration) => parseFloat(duration) === 0)
        )
      : value.frames.some(
          (frame) => frame.x > value.start + 1 && frame.x < value.target - 1
        ),
    JSON.stringify(value)
  )
}
export function createBusinessStatisticsScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const actions = [
    'erp.business_dashboard.read',
    'sales_order.read',
    'sales_order_item.read',
    'field.sales_commercial.read',
    'finance.receivable.read',
    'field.finance_settlement.read',
    'pmc.plan.read',
    'production.wip.read',
  ]
  const make = (
    name,
    { restricted = false, dark = false, narrow = false } = {}
  ) => {
    let failNext = false
      let malformed = false
    const calls = []
    const ownActions = restricted
      ? actions.filter(
          (key) => !key.startsWith('field.') && !key.startsWith('finance.')
        )
      : actions
    return {
      name,
      path: '/erp/business-dashboard?view=statistics',
      auth: 'admin',
      themeMode: dark ? 'dark' : 'light',
      viewport: narrow
        ? { width: 760, height: 900 }
        : { width: 1920, height: 1080 },
      adminProfile: restricted
        ? {
            id: 1,
            is_super_admin: false,
            roles: [{ role_key: 'sales', name: '业务' }],
            permissions: ownActions,
          }
        : undefined,
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ownActions,
      },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/business', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          calls.push({ method, params })
          if (method === 'list_progress')
            { return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '无关进度请求' },
              },
            }) }
          if (!method.includes('statistics')) return route.fallback()
          if (params.keyword === '迟到响应') await pause(450)
          if (failNext)
            { return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: { code: 50000, message: '统计暂不可用' },
              },
            }) }
          const data = statisticsFixtureData(params, {
            sources: method.endsWith('_sources'),
            ages: method.includes('receivable'),
            restricted,
          })
          if (malformed && data.totals) data.totals.done += 1
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: { code: 0, message: 'OK', data },
            },
          })
        })
      },
      verify: async (page) => {
        const stats = page.locator('.erp-progress-board--statistics')
        await stats
          .locator('.erp-statistics-table tbody tr.ant-table-row')
          .first()
          .waitFor()
        assert.equal(
          calls.filter((call) => call.method === 'list_progress').length,
          0
        )
        assert.match(
          await stats.locator('.erp-statistics-metrics').innerText(),
          /订单总数\s*48/
        )
        assert.equal(await stats.locator('.erp-statistics-column').count(), 8)
        const summaryPager = stats.getByRole('navigation', {
          name: '统计汇总分页',
        })
        assert.equal(calls.at(-1).params.limit, 8)
        assert.equal(calls.at(-1).params.offset, 0)
        assert.match(
          await summaryPager.innerText(),
          narrow ? /1–8 \/ 10 项/ : /第 1–8 项，共 10 项/
        )
        assert.equal(
          await summaryPager
            .getByRole('button', { name: '上一页', exact: true })
            .isDisabled(),
          true
        )
        assert.equal(
          (await stats.locator('.erp-statistics-stack button').count()) > 10,
          true
        )
        await assertNoHorizontalOverflow(page)
        if (restricted) {
          assert.equal(await stats.getByText(/订单金额 ·/).count(), 0)
          await page.getByRole('combobox', { name: '统计内容' }).focus()
          await page
            .getByRole('combobox', { name: '统计内容' })
            .press('ArrowDown')
          assert.equal(
            await page
              .getByRole('option', { name: '应收账龄', exact: true })
              .count(),
            0
          )
          await page.keyboard.press('Escape')
          return
        }
        if (narrow || dark) {
          assert.equal(
            await stats
              .locator('.erp-statistics-table .ant-table-content')
              .evaluate((node) => getComputedStyle(node).overflowX),
            'auto'
          )
          if (narrow) {
            assert.equal(
              await summaryPager
                .locator('.ant-pagination-simple-pager')
                .count(),
              1
            )
            await summaryPager
              .getByRole('button', { name: '下一页', exact: true })
              .click()
            await page.waitForFunction(() =>
              document
                .querySelector('.erp-task-pagination [role=status]')
                ?.textContent.includes('9–10')
            )
            assert.equal(
              await stats
                .locator('.erp-statistics-table .ant-table-row')
                .count(),
              2
            )
            await assertNoHorizontalOverflow(page)
          }
          return
        }
        await summaryPager
          .getByRole('button', { name: '下一页', exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('9–10')
        )
        assert.equal(calls.at(-1).params.limit, 8)
        assert.equal(calls.at(-1).params.offset, 8)
        assert.equal(
          await stats.locator('.erp-statistics-table .ant-table-row').count(),
          2
        )
        assert.equal(
          await summaryPager
            .getByRole('button', { name: '下一页', exact: true })
            .isDisabled(),
          true
        )
        assert.match(
          await stats.locator('.ant-table-summary').innerText(),
          /48/
        )
        await stats
          .locator('.erp-statistics-table .ant-table-row')
          .first()
          .getByRole('button', { name: '时光百货', exact: true })
          .click()
        await select(page, '每页来源订单数', '20 单 / 页')
        await stats
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('9–10')
        )
        assert.equal(new URL(page.url()).searchParams.get('stats_page'), '2')
        assert.equal(calls.at(-1).params.limit, 8)
        await select(page, '每页统计汇总数', '20 项 / 页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('1–10')
        )
        assert.equal(calls.at(-1).params.limit, 20)
        assert.equal(calls.at(-1).params.offset, 0)
        assert.equal(new URL(page.url()).searchParams.get('stats_page'), '1')
        await select(page, '每页统计汇总数', '8 项 / 页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('1–8')
        )
        await page.screenshot({
          path: `${outputDir}/statistics-delivery-desktop.png`,
        })
        await stats
          .locator('.erp-statistics-table tbody tr.ant-table-row')
          .first()
          .getByRole('button', { name: '晨星礼品', exact: true })
          .click()
        await stats
          .getByRole('button', { name: '返回汇总', exact: true })
          .waitFor()
        assert.match(
          await stats.locator('.erp-task-pagination').innerText(),
          /10 单/
        )
        await stats
          .getByRole('navigation', { name: '来源订单分页' })
          .getByRole('button', { name: '下一页', exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('9–10')
        )
        assert.equal(calls.at(-1).params.offset, 8)
        await select(page, '每页来源订单数', '20 单 / 页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('1–10')
        )
        assert.equal(calls.at(-1).params.limit, 20)
        assert.equal(calls.at(-1).params.offset, 0)
        await select(page, '来源状态', '当前逾期')
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-statistics-table tbody tr.ant-table-row'
            ).length === 2
        )
        const last = calls.at(-1)
        assert.equal(last.method, 'list_delivery_statistics_sources')
        assert.equal(last.params.source_status, 'overdue')
        assert.equal(last.params.currency, 'CNY')
        await page.screenshot({
          path: `${outputDir}/statistics-sources-desktop.png`,
        })
        await stats
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        await stats
          .locator('.erp-statistics-table tbody tr.ant-table-row')
          .first()
          .waitFor()
        await select(page, '汇总维度', '按产品')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-statistics-result-head')
            ?.textContent.includes('产品交付汇总')
        )
        assert.equal(calls.at(-1).params.group_by, 'product')
        await verifyMotion(
          stats.locator('.erp-business-visual-switch .erp-sliding-segmented'),
          assert
        )
        assert.equal(await stats.locator('.erp-statistics-table').count(), 0)
        await stats.getByText('图表与表格', { exact: true }).click()
        await select(page, '每页统计汇总数', '50 项 / 页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination')
            ?.textContent.includes('50 项 / 页')
        )
        assert.equal(calls.at(-1).params.limit, 50)
        assert.equal(calls.at(-1).params.offset, 0)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await verifyMotion(
          stats.locator('.erp-business-visual-switch .erp-sliding-segmented'),
          assert,
          true
        )
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await select(page, '统计内容', '应收账龄')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-statistics-metrics')
            ?.textContent.includes('358,100.00')
        )
        assert.equal(
          await stats.getByRole('combobox', { name: '交期范围' }).count(),
          0
        )
        await stats.getByText('图表与表格', { exact: true }).click()
        await page.screenshot({
          path: `${outputDir}/statistics-aging-desktop.png`,
        })
        await stats
          .locator('.erp-statistics-table tbody tr.ant-table-row')
          .first()
          .getByRole('button', { name: '晨星礼品', exact: true })
          .click()
        await select(page, '来源状态', '逾期 31–60 天')
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              '.erp-statistics-table tbody tr.ant-table-row'
            ).length === 1
        )
        assert.match(
          await stats.locator('.erp-statistics-table tbody').innerText(),
          /12,000.00/
        )
        await stats
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        await select(page, '统计内容', '订单交付')
        const search = stats.getByRole('textbox', { name: '搜索客户' })
        await search.fill('迟到响应')
        await search.press('Enter')
        await pause(60)
        await search.fill('晨星')
        await search.press('Enter')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-statistics-table tbody')
            ?.textContent.includes('晨星礼品')
        )
        await pause(500)
        assert.equal(
          await stats
            .locator('.erp-statistics-table tbody tr.ant-table-row')
            .count(),
          1
        )
        failNext = true
        await search.fill('海棠')
        await search.press('Enter')
        await stats.getByRole('button', { name: '重试', exact: true }).waitFor()
        assert.equal(await stats.locator('.erp-statistics-table').count(), 0)
        assert.equal(
          await stats
            .locator('.erp-statistics-metrics')
            .innerText()
            .then((text) => text.includes('48')),
          false
        )
        failNext = false
        await stats.getByRole('button', { name: '重试', exact: true }).click()
        await stats
          .locator('.erp-statistics-table tbody tr.ant-table-row')
          .first()
          .waitFor()
        malformed = true
        await search.fill('远帆')
        await search.press('Enter')
        await stats.getByRole('button', { name: '重试', exact: true }).waitFor()
        assert.equal(await stats.locator('.erp-statistics-table').count(), 0)
        malformed = false
        await search.fill('不存在')
        await search.press('Enter')
        await stats.getByText('当前筛选暂无记录', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page)
      },
    }
  }
  return [
    make('erp-business-statistics-desktop'),
    make('erp-business-statistics-restricted', { restricted: true }),
    make('erp-business-statistics-dark', { dark: true }),
    make('erp-business-statistics-narrow', { narrow: true }),
    {
      name: 'dev-ui-design-business-statistics',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: 'UI 交互设计', exact: true })
          .waitFor()
        await page.getByRole('button', { name: /全屏预览/ }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('[data-action="nav"][data-page="progress"]').click()
        await frame.getByRole('tab', { name: '经营统计', exact: true }).click()
        await frame
          .locator('.statistics-design-table tbody tr')
          .first()
          .waitFor()
        assert.match(
          await frame.locator('.erp-statistics-metrics').innerText(),
          /订单总数\s*48/
        )
        await frame.getByRole('tab', { name: '表格', exact: true }).click()
        assert.equal(await frame.locator('.erp-statistics-chart').count(), 0)
        const pager = frame.getByRole('navigation', { name: '统计汇总分页' })
        assert.match(await pager.innerText(), /第 1–8 项，共 10 项/)
        await pager.getByRole('button', { name: '下一页', exact: true }).click()
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          2
        )
        await frame
          .locator('.statistics-design-table tbody')
          .getByRole('button', { name: '时光百货', exact: true })
          .click()
        await frame
          .getByRole('combobox', { name: '每页来源订单数' })
          .selectOption('20')
        await frame
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        assert.match(await pager.innerText(), /第 9–10 项，共 10 项/)
        await frame
          .getByRole('combobox', { name: '每页统计汇总数' })
          .selectOption('20')
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          10
        )
        await frame
          .getByRole('combobox', { name: '每页统计汇总数' })
          .selectOption('8')
        await frame
          .locator('.statistics-design-table tbody')
          .getByRole('button', { name: '晨星礼品', exact: true })
          .click()
        await frame
          .getByRole('navigation', { name: '来源订单分页' })
          .getByRole('button', { name: '下一页', exact: true })
          .click()
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          2
        )
        await frame
          .getByRole('combobox', { name: '每页来源订单数' })
          .selectOption('20')
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          10
        )
        await frame
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        await frame.locator('#statistics-report').selectOption('receivables')
        assert.match(
          await frame.locator('.erp-statistics-metrics').innerText(),
          /358,100.00/
        )
        await page.screenshot({
          path: `${outputDir}/statistics-ui-design-desktop.png`,
        })
      },
    },
  ]
}
