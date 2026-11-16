import { setTimeout as pause } from 'node:timers/promises'
import { chooseSelectOption } from './selectControlActions.mjs'
import { statisticsFixtureData } from './businessStatisticsFixtures.mjs'

async function select(page, name, label) {
  const input = page.getByRole('combobox', { name, exact: true })
  await input.focus()
  await input.press('ArrowDown')
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option')
    .getByText(label, { exact: true })
    .click()
  await input
    .locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
    .locator('.ant-select-selection-item')
    .filter({ hasText: label })
    .waitFor()
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
async function verifyChartTooltip(page, stats, assert, { value, total, share, action }) {
  const segment = stats.locator('.erp-statistics-stack button').first()
  const tooltip = page.getByRole('tooltip')
  assert.equal(await segment.getAttribute('title'), null, '使用统一浮层，不叠加浏览器原生提示')
  await page.mouse.move(0, 0)
  await segment.hover()
  await tooltip.waitFor()
  assert.match(await tooltip.innerText(), /晨星礼品/u)
  assert((await tooltip.innerText()).includes(value))
  assert((await tooltip.innerText()).includes(total))
  assert((await tooltip.innerText()).includes(`占本行 ${share}%`))
  assert((await tooltip.innerText()).includes(action))
  const bounds = await tooltip.boundingBox()
  const viewport = page.viewportSize()
  assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, '提示浮层保持在视口内')
  await page.mouse.move(0, 0)
  await tooltip.waitFor({ state: 'hidden' })
  await segment.focus()
  await tooltip.waitFor()
  await page.keyboard.press('Escape')
  await tooltip.waitFor({ state: 'hidden' })
  assert(await segment.evaluate((button) => document.activeElement === button), '关闭提示后保留图表焦点')
}
async function verifyToolbarRows(scope, assert, { wrapped = false } = {}) {
  const layout = await scope.locator('.erp-statistics-toolbar').evaluate((toolbar) => {
    const bounds = (node) => {
      const { left, right, top, bottom, width, height } = node.getBoundingClientRect()
      return { left, right, top, bottom, width, height }
    }
    const box = (selector) => bounds(toolbar.querySelector(selector))
    const filters = toolbar.querySelector('.erp-statistics-filters')
    return {
      toolbar: bounds(toolbar),
      report: box('.erp-statistics-report-picker'),
      filters: bounds(filters),
      views: box('.erp-business-visual-switch, .statistics-display-tabs'),
      metrics: box('.erp-statistics-metrics'),
      snapshot: box('.erp-statistics-meta'),
      controlHeights: Array.from(filters.children, (node) =>
        bounds(node.querySelector('.ant-select-selector') || node).height
      ),
      searchSubmitHeight: filters.querySelector('.erp-search-submit')?.getBoundingClientRect().height,
    }
  })
  const { report, filters, views, metrics, snapshot } = layout
  const aligned = (a, b) => Math.abs(a.top + a.height / 2 - b.top - b.height / 2) <= 1
  const afterPrimary = Math.max(report.bottom, views.bottom)
  assert(aligned(report, views), '主题与展示切换应保持同行')
  assert(metrics.top >= Math.max(afterPrimary, filters.bottom), '状态快捷筛选应在查询组下方')
  assert(
    wrapped
      ? filters.top >= afterPrimary && Math.abs(filters.left - report.left) <= 1
      : aligned(report, filters) && report.right <= filters.left &&
        filters.right <= views.left && aligned(metrics, snapshot),
    `查询组应${wrapped ? '整组换行' : '与主题、展示切换同排'}：${JSON.stringify(layout)}`
  )
  return layout
}
async function verifyMotion(root, assert, reduced = false) {
  const value = await root.evaluate(async (root) => {
    const group = root.querySelector('.ant-segmented-group')
    const buttons = group.querySelectorAll('.ant-segmented-item')
    const target = [...buttons].find((button) => button.textContent.trim() === '图表')
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
          (frame) => frame.x > Math.min(value.start, value.target) + 1 && frame.x < Math.max(value.start, value.target) - 1
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
    { restricted = false, dark = false, narrow = false, touch = false } = {}
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
      hasTouch: touch,
      deviceScaleFactor: !narrow && !dark && !restricted ? 2 : 1,
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
        assert.equal(await stats.locator('.erp-statistics-chart').count(), 0, '默认先显示可核对的汇总表')
        const views = stats.locator('.erp-business-visual-switch')
        assert.deepEqual(await views.locator('.ant-segmented-item').allTextContents(), ['表格', '图表'])
        const riskTone = await stats.locator('.erp-statistics-table .erp-statistics-danger:not(:disabled)').first().evaluate((button) => ({
          button: getComputedStyle(button).color,
          text: getComputedStyle(button.querySelector('span') || button).color,
          metric: getComputedStyle(document.querySelector('.erp-statistics-metrics .erp-statistics-danger')).color,
        }))
        assert.equal(riskTone.text, riskTone.metric, `逾期数值应保留与概览一致的风险色：${JSON.stringify(riskTone)}`)
        if (!narrow) {
          const firstRow = await stats.locator('.erp-statistics-table tbody tr.ant-table-row').first().boundingBox()
          assert(firstRow.y < page.viewportSize().height / 2, '首屏应直接读到汇总数据')
        }
        const defaultToolbar = await verifyToolbarRows(stats, assert, { wrapped: narrow })
        if (!narrow && !dark && !restricted) {
          assert(defaultToolbar.controlHeights.every((height) => height === 34), '桌面筛选控件应保持 34px')
          await page.screenshot({ path: `${outputDir}/statistics-table-desktop.png` })
          const desktopViewport = page.viewportSize()
          await page.setViewportSize({ ...desktopViewport, width: 1440 })
          await verifyToolbarRows(stats, assert)
          await page.setViewportSize({ ...desktopViewport, width: 1280 })
          const toolbar = stats.locator('.erp-statistics-filters')
          const start = toolbar.getByRole('textbox', { name: '开始日期', exact: true })
          const end = toolbar.getByRole('textbox', { name: '结束日期', exact: true })
          assert.equal(await start.count(), 0, '预设交期只显示一个控件')
          const controlPosition = (field) => field.evaluate((input) => {
            const { x, y, height } = input.closest('.ant-picker, .ant-select, .ant-input-affix-wrapper').getBoundingClientRect()
            return { x, center: y + height / 2 }
          })
          const filterBoxes = await Promise.all([
            toolbar.getByRole('combobox', { name: '汇总维度', exact: true }),
            toolbar.getByRole('combobox', { name: '交期范围', exact: true }),
            toolbar.getByRole('combobox', { name: '统计币种', exact: true }),
            toolbar.getByRole('textbox', { name: '搜索客户', exact: true }),
            toolbar.getByRole('combobox', { name: '统计排序', exact: true }),
          ].map(controlPosition))
          assert(filterBoxes.every((box, index) =>
            Math.abs(box.center - filterBoxes[0].center) <= 2 &&
            (index === 0 || box.x > filterBoxes[index - 1].x)
          ), '1280px 下常用筛选、搜索和排序应按操作顺序同排对齐')
          await verifyToolbarRows(stats, assert, { wrapped: true })
          await page.setViewportSize(desktopViewport)
          await select(page, '交期范围', '自定义')
          const customToolbar = await verifyToolbarRows(stats, assert, { wrapped: true })
          assert.deepEqual(customToolbar.controlHeights, defaultToolbar.controlHeights, '自定义换行不压缩筛选控件')
          assert.equal(customToolbar.views.height, defaultToolbar.views.height)
          const [startBox, endBox] = await Promise.all([start, end].map(controlPosition))
          assert(startBox.x < endBox.x && Math.abs(startBox.center - endBox.center) <= 2, '自定义起止日期应成组换行')
          assert.equal(await start.inputValue(), '2026/10/01')
          assert.equal(await end.inputValue(), '2026/10/31')
          for (const [input, date, field, otherField, otherDate] of [
            [start, '2026/10/04', 'date_from', 'date_to', '2026-10-31'],
            [end, '2026/10/28', 'date_to', 'date_from', '2026-10-04'],
          ]) {
            const [request] = await Promise.all([
              page.waitForRequest((request) => {
                if (!request.url().endsWith('/rpc/business') || request.method() !== 'POST') return false
                const { method, params } = request.postDataJSON()
                return method === 'get_delivery_statistics' && params[field] === date.replaceAll('/', '-')
              }),
              (async () => {
                await input.click()
                await input.press('ControlOrMeta+a')
                await input.pressSequentially(date)
                await input.press('Enter')
              })(),
            ])
            const { params: dates } = request.postDataJSON()
            assert.equal(dates.period, 'custom')
            assert.equal(dates[otherField], otherDate)
          }
          const period = toolbar.locator('.erp-statistics-delivery-period .ant-select')
          await period.hover()
          await period.locator('.ant-select-clear').click()
          await page.waitForURL((url) => url.searchParams.get('period') === 'all')
          await start.waitFor({ state: 'detached' })
          const clearedQuery = new URL(page.url()).searchParams
          assert(!clearedQuery.has('stfrom') && !clearedQuery.has('stto'), '清空范围后不留自定义日期')
          await select(page, '交期范围', '本月')
          await verifyToolbarRows(stats, assert)
          const delivered = stats.getByRole('button', { name: /已交齐.*18/ })
          await delivered.click()
          await page.waitForFunction(() => document.querySelector('.ant-table-summary td:nth-child(2)')?.textContent === '18')
          assert.equal(calls.at(-1).params.status, 'done')
          await delivered.click()
          await page.waitForFunction(() => document.querySelector('.ant-table-summary td:nth-child(2)')?.textContent === '48')
          await select(page, '统计币种', 'USD')
          await stats.getByText('当前筛选暂无记录', { exact: true }).waitFor()
          await select(page, '统计币种', 'CNY')
        }
        const beforeDisplay = calls.length
        await views.getByText('图表', { exact: true }).click()
        await stats.locator('.erp-statistics-column').first().waitFor()
        assert.equal(await stats.locator('.erp-statistics-column').count(), 8)
        assert.equal(await stats.locator('.erp-statistics-table').count(), 0)
        assert.equal(calls.length, beforeDisplay, '切换表格或图表不应重复查询')
        const chartTrack = await stats.locator('.erp-statistics-bar-track').first().boundingBox()
        assert(chartTrack.width > chartTrack.height, '客户和账龄使用可横向比较的条形图')
        const beforeHover = calls.length
        const firstSegment = stats.locator('.erp-statistics-stack button').first()
        if (touch) {
          await firstSegment.tap()
          const tip = page.getByRole('tooltip')
          assert.match(await tip.innerText(), /3 单.+占本行 30%/su)
          await stats.locator('.erp-statistics-legend span').first().tap()
          await tip.waitFor({ state: 'hidden' })
          await firstSegment.tap()
          assert.equal(calls.length, beforeHover, '触屏查看提示不直接进入来源')
          await tip.getByRole('button', { name: '查看来源订单', exact: true }).tap()
        } else {
          await verifyChartTooltip(page, stats, assert, { value: '3 单', total: '当前筛选共 10 单', share: 30, action: '点击查看这 3 单' })
          assert.equal(calls.length, beforeHover, '悬停和聚焦不重新查询统计')
          await firstSegment.click()
        }
        await stats.getByRole('button', { name: '返回汇总', exact: true }).waitFor()
        await stats.locator('.erp-statistics-body[aria-busy="false"] .ant-table-row').first().waitFor()
        assert.equal(calls.at(-1).method, 'list_delivery_statistics_sources')
        assert.equal(calls.at(-1).params.source_status, 'done')
        assert.equal(await stats.locator('.erp-statistics-filters').count(), 0)
        assert.match(await stats.locator('.erp-statistics-source-context').innerText(), /按客户.+2026-10-01 至 2026-10-31.+CNY/u)
        await page.getByRole('tooltip').waitFor({ state: 'hidden' })
        await stats.getByRole('button', { name: '返回汇总', exact: true }).click()
        await stats.locator('.erp-statistics-column').first().waitFor()
        await page.waitForFunction(() => document.activeElement?.matches('.erp-statistics-chart-name[data-statistics-group]'))
        const summaryPager = stats.getByRole('navigation', {
          name: '统计汇总分页',
        })
        assert.equal(calls.at(-1).params.limit, 8)
        assert.equal(calls.at(-1).params.offset, 0)
        assert.match(
          await summaryPager.innerText(),
          /第 1-8 条 \/ 共 10 条/
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
        if (!narrow && !dark && !restricted) {
          // The chart mode belongs to statistics and must survive leaving the view.
          await page.getByRole('tab', { name: '订单交付', exact: true }).click()
          await page.waitForURL((url) => url.searchParams.get('view') === 'orders')
          assert.equal(new URL(page.url()).searchParams.get('display'), null)
          await page.getByRole('tab', { name: '经营统计', exact: true }).click()
          await stats.locator('.erp-statistics-chart').waitFor()
          assert.equal(new URL(page.url()).searchParams.get('display'), 'chart')
        }
        await views.getByText('表格', { exact: true }).click()
        await stats.locator('.erp-statistics-table').waitFor()
        if (restricted) {
          assert.equal(await stats.getByText(/订单金额 ·/).count(), 0)
          assert.equal(await stats.getByRole('tablist', { name: '统计内容', exact: true }).count(), 0)
          await stats.getByText('交付汇总', { exact: true }).waitFor()
          await stats.getByRole('combobox', { name: '统计排序' }).press('ArrowDown')
          await page.locator('.ant-select-dropdown:visible').waitFor()
          assert.equal(await page.getByRole('option', { name: '金额降序', exact: true }).count(), 0)
          await page.keyboard.press('Escape')
          return
        }
        if (narrow || dark) {
          assert.equal(
            await stats
              .locator('.erp-statistics-table .ant-table-body, .erp-statistics-table .ant-table-content')
              .first()
              .evaluate((node) => getComputedStyle(node).overflowX),
            'auto'
          )
          if (narrow) {
            assert.equal(
              await summaryPager
                .locator('.ant-pagination-mini')
                .count(),
              1
            )
            await summaryPager
              .getByRole('button', { name: '下一页', exact: true })
              .click()
            await page.waitForFunction(() =>
              document
                .querySelector('.erp-task-pagination [role=status]')
                ?.textContent.includes('9-10')
            )
            assert.equal(
              await stats
                .locator('.erp-statistics-table .ant-table-row')
                .count(),
              2
            )
            await assertNoHorizontalOverflow(page)
          } else {
            await select(page, '交期范围', '自定义')
            const dates = stats.getByRole('group', { name: '订单交期', exact: true }).getByRole('textbox')
            assert.deepEqual(await dates.evaluateAll((inputs) => inputs.map((input) => input.readOnly)), [false, false])
          }
          return
        }
        await summaryPager
          .getByRole('button', { name: '下一页', exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('9-10')
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
        await select(page, '每页来源订单数', '20 条/页')
        await stats
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('9-10')
        )
        assert.equal(new URL(page.url()).searchParams.get('stats_page'), '2')
        assert.equal(calls.at(-1).params.limit, 8)
        await select(page, '每页统计汇总数', '20 条/页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('1-10')
        )
        assert.equal(calls.at(-1).params.limit, 20)
        assert.equal(calls.at(-1).params.offset, 0)
        assert.equal(new URL(page.url()).searchParams.get('stats_page'), '1')
        await select(page, '每页统计汇总数', '8 条/页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('1-8')
        )
        await select(page, '统计排序', '名称升序')
        assert.equal(calls.at(-1).params.sort, 'name')
        assert.equal(calls.at(-1).params.direction, 'asc')
        assert.equal(calls.at(-1).params.offset, 0)
        await select(page, '统计排序', '订单数降序')
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
          /共 10 条/
        )
        await stats
          .getByRole('navigation', { name: '来源订单分页' })
          .getByRole('button', { name: '下一页', exact: true })
          .click()
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('9-10')
        )
        assert.equal(calls.at(-1).params.offset, 8)
        await select(page, '每页来源订单数', '20 条/页')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination [role=status]')
            ?.textContent.includes('1-10')
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
        await stats.getByRole('textbox', { name: '搜索产品', exact: true }).waitFor()
        assert.equal(calls.at(-1).params.group_by, 'product')
        await verifyMotion(
          stats.locator('.erp-business-visual-switch .erp-sliding-segmented'),
          assert
        )
        assert.equal(await stats.locator('.erp-statistics-table').count(), 0)
        await views.getByText('表格', { exact: true }).click()
        const pageSizeResponse = page.waitForResponse((response) => {
          if (!response.url().endsWith('/rpc/business')) return false
          const body = response.request().postDataJSON() || {}
          return body.method?.includes('statistics') && body.params?.limit === 50
        })
        await select(page, '每页统计汇总数', '50 条/页')
        await pageSizeResponse
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-task-pagination .ant-select-selection-item')
            ?.textContent.includes('50 条/页')
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
        const productSearch = stats.getByRole('textbox', { name: '搜索产品', exact: true })
        await productSearch.fill('坐姿')
        await productSearch.press('Enter')
        await stats.locator('.erp-statistics-chart-name').getByText('坐姿小熊', { exact: true }).waitFor()
        const reports = stats.getByRole('tablist', { name: '统计内容', exact: true })
        await reports.getByRole('tab', { name: '交付汇总', exact: true }).press('ArrowRight')
        await page.waitForFunction(() =>
          document
            .querySelector('.erp-statistics-metrics')
            ?.textContent.includes('358,100.00')
        )
        assert.equal(
          await stats.getByRole('combobox', { name: '交期范围' }).count(),
          0
        )
        assert.equal(await reports.getByRole('tab', { name: '应收账龄', selected: true }).count(), 1)
        assert.equal(await stats.getByRole('combobox', { name: '汇总维度' }).count(), 0)
        assert.equal(calls.at(-1).params.group_by, 'customer')
        assert.equal(calls.at(-1).params.keyword, '')
        for (const [width, controlHeight, wrapped = false] of [[1280, 34], [760, 46, true], [1920, 34]]) {
          await page.setViewportSize({ ...page.viewportSize(), width })
          const toolbar = await verifyToolbarRows(stats, assert, { wrapped })
          assert.deepEqual(toolbar.controlHeights, Array(3).fill(controlHeight), `${width}px 下币种、搜索和排序应立即同高`)
          assert.equal(toolbar.searchSubmitHeight, controlHeight - 4, `${width}px 下搜索按钮应同步调整高度`)
          if (wrapped) await assertNoHorizontalOverflow(page)
        }
        await verifyChartTooltip(page, stats, assert, { value: '18,000.00 CNY', total: '当前筛选未结 72,000.00 CNY', share: 25, action: '点击查看来源应收' })
        await views.getByText('表格', { exact: true }).click()
        const noDue = stats.locator('.erp-statistics-table tbody tr.ant-table-row').first().locator('td').last()
        assert.equal(await noDue.innerText(), '0.00')
        assert.equal(await noDue.getByRole('button').count(), 0, '零余额不跳空的来源列表')
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
        await reports.getByRole('tab', { name: '交付汇总', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('report') === 'delivery')
        await stats.getByRole('group', { name: '订单交期', exact: true }).waitFor()
        assert.equal(calls.at(-1).params.group_by, 'product', '返回交付恢复原汇总维度')
        await select(page, '汇总维度', '按客户')
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
    make('erp-business-statistics-touch', { narrow: true, touch: true }),
    {
      name: 'dev-ui-design-business-statistics',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '交互设计', exact: true })
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
        await verifyToolbarRows(frame, assert)
        await chooseSelectOption(frame.locator('#statistics-period'), 'custom')
        await verifyToolbarRows(frame, assert, { wrapped: true })
        await chooseSelectOption(frame.locator('#statistics-period'), 'month')
        const displayModes = frame.getByRole('group', { name: '统计展示方式', exact: true })
        await displayModes.getByRole('button', { name: '图表', exact: true }).click()
        const designSegment = frame.locator('[data-statistics-tooltip]').first()
        await designSegment.hover()
        await frame.getByRole('tooltip').waitFor()
        assert.match(await frame.getByRole('tooltip').innerText(), /占本行 30%/u)
        await designSegment.focus()
        await page.keyboard.press('Escape')
        await frame.getByRole('tooltip').waitFor({ state: 'hidden' })
        await displayModes.getByRole('button', { name: '表格', exact: true }).click()
        assert.equal(await frame.locator('.erp-statistics-chart').count(), 0)
        const pager = frame.getByRole('navigation', { name: '统计汇总分页' })
        assert.equal(await pager.getByRole('status').innerText(), '第 1–8 项，共 10 项')
        await pager.getByRole('button', { name: '下一页', exact: true }).click()
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          2
        )
        await frame
          .locator('.statistics-design-table tbody')
          .getByRole('button', { name: '时光百货', exact: true })
          .click()
        await chooseSelectOption(frame
          .getByRole('combobox', { name: '每页来源订单数' }), '20')
        await frame
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        assert.equal(await pager.getByRole('status').innerText(), '第 9–10 项，共 10 项')
        await chooseSelectOption(frame
          .getByRole('combobox', { name: '每页统计汇总数' }), '20')
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          10
        )
        await chooseSelectOption(frame
          .getByRole('combobox', { name: '每页统计汇总数' }), '8')
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
        await chooseSelectOption(frame
          .getByRole('combobox', { name: '每页来源订单数' }), '20')
        assert.equal(
          await frame.locator('.statistics-design-table tbody tr').count(),
          10
        )
        await frame
          .getByRole('button', { name: '返回汇总', exact: true })
          .click()
        await frame.getByRole('tab', { name: '应收账龄', exact: true }).click()
        await verifyToolbarRows(frame, assert)
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
