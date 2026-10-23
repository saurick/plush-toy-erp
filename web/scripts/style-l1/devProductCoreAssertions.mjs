import assert from 'node:assert/strict'

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
