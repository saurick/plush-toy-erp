import assert from 'node:assert/strict'
import path from 'node:path'

const filtersSelector = '.erp-dev-product-core-filters'

async function sampleFilterLayout(page, index) {
  return page
    .locator(filtersSelector)
    .evaluate(async (filters, targetIndex) => {
      const selectors = [
        '.erp-dev-product-core-toolbar',
        '.erp-dev-product-core-filters',
        '.erp-dev-product-core-toolbar .erp-search-input',
        ...[0, 1, 2, 3].map(
          (i) => `.erp-dev-product-core-filters > :nth-child(${i + 1})`
        ),
      ]
      const elements = selectors.map((selector) =>
        document.querySelector(selector)
      )
      const read = () =>
        elements.map((element) => {
          const { x, y, width, height } = element.getBoundingClientRect()
          return { x, y, width, height }
        })
      const before = read()
      const samples = []
      const buttons = [...filters.querySelectorAll('button')]
      buttons[targetIndex].click()
      const start = performance.now()
      await new Promise((resolve) => {
        const frame = () => {
          samples.push({
            boxes: read(),
            mounted: elements.every(
              (element, i) =>
                element.isConnected &&
                document.querySelector(selectors[i]) === element
            ),
            selected: buttons.findIndex(
              (button) => button.getAttribute('aria-pressed') === 'true'
            ),
          })
          if (performance.now() - start < 300) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      return { selectors, before, samples }
    }, index)
}

export async function verifyProductCoreLayout(
  page,
  { assertNoHorizontalOverflow }
) {
  const originalViewport = page.viewportSize()
  const filters = page.locator(`${filtersSelector} button`)
  const search = page.getByRole('textbox', { name: '搜索产品能力' })
  try {
    for (const width of [1024, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      await filters.first().click()
      await page.evaluate(() => document.fonts.ready)
      const itemWidth = await page
        .locator('.erp-dev-product-core-group button')
        .first()
        .evaluate((element) => element.getBoundingClientRect().width)
      for (const index of [1, 2, 3, 0, 3, 1, 0]) {
        const result = await sampleFilterLayout(page, index)
        let selected = false
        for (const sample of result.samples) {
          assert(sample.mounted, '筛选过程中复用原筛选栏和搜索节点')
          if (sample.selected === index) selected = true
          if (selected)
            assert.equal(sample.selected, index, '已切换的筛选状态不得回跳')
          for (const [i, box] of sample.boxes.entries()) {
            for (const dimension of ['x', 'y', 'width', 'height']) {
              const delta = Math.abs(
                box[dimension] - result.before[i][dimension]
              )
              assert(
                delta <= 1,
                `${width}px 筛选 ${index} 的 ${result.selectors[i]} ${dimension} 位移 ${delta}px`
              )
            }
          }
        }
        assert(selected, '切换完成后选中目标筛选')
        const widths = await page
          .locator('.erp-dev-product-core-group button')
          .evaluateAll((items) =>
            items.map((item) => item.getBoundingClientRect().width)
          )
        assert(
          widths.every((value) => Math.abs(value - itemWidth) <= 1),
          '全部与单一状态沿用相同目录列宽'
        )
        await assertNoHorizontalOverflow(page)
      }

      const beforeSearch = await page
        .locator('.erp-dev-product-core-toolbar')
        .boundingBox()
      await search.fill('没有匹配的能力查询')
      await search.press('Enter')
      await page.getByText('没有匹配的产品能力', { exact: true }).waitFor()
      const emptyToolbar = await page
        .locator('.erp-dev-product-core-toolbar')
        .boundingBox()
      assert.deepEqual(
        emptyToolbar,
        beforeSearch,
        '空结果不改变筛选工具栏的位置和尺寸'
      )
      await page.getByRole('button', { name: '清除筛选', exact: true }).click()
      await page.locator('.erp-dev-product-core-group button').first().waitFor()
      assert.equal(await search.inputValue(), '')
      assert.equal(await filters.first().getAttribute('aria-pressed'), 'true')
      await assertNoHorizontalOverflow(page)
    }
  } finally {
    await page.setViewportSize(originalViewport)
  }
}

export async function verifyProductCoreRelations(page, { assertNoHorizontalOverflow }) {
  const origin = new URL(page.url()).origin
  const originalURL = page.url()
  const writes = []
  const recordRequest = (request) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && /\/__dev\/api\//u.test(request.url())) writes.push(request.url())
  }
  page.on('request', recordRequest)
  const emptyReports = (route) => route.fulfill({ json: { batches: [] } })
  await page.route('**/__dev/api/qa/business-chain-audit', emptyReports)
  try {
    for (const [capability, chainKey, chainLabel] of [
      ['出货', 'delivery_to_settlement', '成品出货到应收建立'],
      ['应收、应付、发票、收付款、核销与账款调整', 'finance_payment_and_reversal', '首款、结算与退款'],
      ['生产订单、WIP、生产事实与委外', 'production_exception', '生产异常决策与执行'],
    ]) {
      const search = new URLSearchParams({ status: 'entered', q: capability, capability })
      const sourceURL = `${origin}/__dev/product-core?${search}`
      await page.goto(sourceURL)
      const detail = page.getByRole('region', { name: '当前能力详情', exact: true })
      const links = detail.getByRole('region', { name: '关联业务与证据', exact: true })
      const definition = links.getByRole('link', { name: chainLabel, exact: true })
      await definition.waitFor()
      await definition.click()
      await page.locator(`[data-topic-diagram="${chainKey}"]`).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('flow_topic'), chainKey)
      const reverse = page.getByRole('region', { name: '关联产品能力', exact: true })
      await reverse.getByRole('link', { name: capability, exact: true }).click()
      await detail.getByRole('heading', { name: capability, exact: true }).waitFor()
      await page.getByRole('button', { name: '返回 业务专题', exact: true }).click()
      await page.locator(`[data-topic-diagram="${chainKey}"]`).waitFor()
      await page.locator('.erp-dev-chain-topics__verification > summary').click()
      const evidence = page.locator('.erp-dev-chain-topics__verification')
      assert.equal(new URL(await evidence.getByRole('link', { name: '链路实测报告', exact: true }).getAttribute('href'), origin).searchParams.get('chain'), chainKey)
      assert.equal(await evidence.getByRole('link', { name: '版本发布记录', exact: true }).getAttribute('href'), '/__dev/version-center?view=history')
      assert((await evidence.innerText()).includes('二者都不代表客户验收'))
      await page.getByRole('button', { name: '返回 产品能力', exact: true }).click()
      await definition.waitFor()
      assert.equal(new URL(page.url()).searchParams.get('q'), capability)
      assert.equal(new URL(page.url()).searchParams.get('status'), 'entered')
      assert.equal(new URL(page.url()).searchParams.get('capability'), capability)
      await page.waitForFunction((name) => document.activeElement?.textContent.trim() === name, chainLabel)
      await page.waitForFunction(() => !window.history.state?.usr?.flowRestoreFrame)
      await links.getByRole('link', { name: `${chainLabel}实测报告`, exact: true }).click()
      await page.getByText('尚未采集链路实测报告。', { exact: true }).waitFor()
      assert.equal(new URL(page.url()).searchParams.get('chain'), chainKey, '无报告仍保留所查链路')
      await page.getByRole('heading', { name: '当前定义关联的产品能力', exact: true }).waitFor()
      assert.equal(await page.getByText('本批次步骤均通过', { exact: true }).count(), 0, '入口关联不能将缺失报告提升为通过')
      await page.getByRole('button', { name: '返回 产品能力', exact: true }).click()
      await definition.waitFor()
      await page.waitForFunction((name) => document.activeElement?.getAttribute('aria-label') === name, `${chainLabel}实测报告`)
      await page.waitForFunction(() => !window.history.state?.usr?.flowRestoreFrame)
      if (chainKey === 'delivery_to_settlement') {
        await links.getByRole('link', { name: '版本发布记录', exact: true }).click()
        await page.getByRole('tab', { name: '操作记录', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('view'), 'history')
        await page.getByRole('button', { name: '返回 产品能力', exact: true }).click()
        await definition.waitFor()
        await page.waitForFunction(() => document.activeElement?.textContent === '版本发布记录')
        assert.equal(new URL(page.url()).searchParams.get('q'), capability, '版本中心补齐默认范围时不丢失来源阅读上下文')
      }
      for (const width of [1024, 1280, 1920]) {
        await page.setViewportSize({ width, height: 900 })
        await assertNoHorizontalOverflow(page)
        assert(await links.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), '长能力及链路名称在详情内换行')
      }
      if (chainKey === 'production_exception' && process.env.STYLE_L1_OUTPUT_DIR) {
        const viewport = page.viewportSize()
        await page.setViewportSize({ width: 3840, height: 2160 })
        await detail.getByRole('heading', { name: capability, exact: true }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(process.env.STYLE_L1_OUTPUT_DIR, 'product-capability-4k.png') })
        await page.setViewportSize(viewport)
      }
    }
    for (const [query, chainKey, capability] of [
      ['flow_stage=shipment', 'delivery_to_settlement', '出货'],
      ['flow_stage=financial_settlement', 'finance_payment_and_reversal', '应收、应付、发票、收付款、核销与账款调整'],
      ['flow_tab=exceptions&flow_exception=production_quality', 'production_exception', '生产订单、WIP、生产事实与委外'],
    ]) {
      await page.goto(`${origin}/__dev/status-flows?view=chain&chain=all&${query}`)
      const panel = page.getByRole('region', { name: '流程详情', exact: true })
      const links = panel.locator(`[data-chain-capabilities="${chainKey}"]`)
      await links.getByRole('link', { name: capability, exact: true }).click()
      await page.getByRole('region', { name: '当前能力详情', exact: true }).getByRole('heading', { name: capability, exact: true }).waitFor()
      await page.getByRole('button', { name: '返回 业务链路', exact: true }).click()
      await links.waitFor()
      for (const [key, value] of new URLSearchParams(query)) {
        assert.equal(new URL(page.url()).searchParams.get(key), value, '返回保留原环节或异常选择')
      }
      await assertNoHorizontalOverflow(page)
    }
    await page.goto(`${origin}/__dev/product-core?${new URLSearchParams({ capability: 'SaaS、多租户、license 与计费' })}`)
    const unrelated = page.getByRole('region', { name: '关联业务与证据', exact: true })
    await unrelated.getByText('当前能力没有登记关联的业务链路，按现有可用范围与边界核对。', { exact: true }).waitFor()
    assert.equal(await unrelated.getByRole('link').count(), 0, '无关联时不残留上一能力的入口')
    assert.deepEqual(writes, [], '查看关联不运行测试、发布或业务写入')
  } finally {
    page.off('request', recordRequest)
    await page.unroute('**/__dev/api/qa/business-chain-audit', emptyReports)
    await page.goto(originalURL)
  }
}
