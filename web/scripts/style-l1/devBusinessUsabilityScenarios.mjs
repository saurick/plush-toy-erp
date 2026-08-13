import { DEV_BUSINESS_USABILITY_PAGE_SIZE } from '../../src/dev-workbench/config/devBusinessUsability.mjs'

export function createDevBusinessUsabilityScenarios({
  assert,
  assertDarkThemeContrast,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
  expectHeading,
  outputDir,
  path,
}) {
  return [
    {
      name: 'dev-business-usability-desktop-light',
      path: '/__dev/business-usability',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '员工能不能看懂、能不能自己完成？')
        assert.equal(
          await page
            .getByRole('link', { name: '业务易用性', exact: true })
            .getAttribute('aria-current'),
          'page',
          '产品工程菜单必须明确标记当前业务易用性入口'
        )
        await page
          .getByText('推荐岗位不是权限，覆盖状态也不是客户验收', {
            exact: true,
          })
          .waitFor()
        const defaultMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-business-usability-summary > .ant-card'
          ).length,
          rowCount: document.querySelectorAll(
            '.erp-dev-business-usability-table-card .ant-table-tbody > .ant-table-row'
          ).length,
          documentHeight: document.documentElement.scrollHeight,
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
          tableOverflowX: getComputedStyle(
            document.querySelector(
              '.erp-dev-business-usability-table-card .ant-table-container'
            )
          ).overflowX,
        }))
        assert.equal(defaultMetrics.cardCount, 4)
        assert.equal(defaultMetrics.rowCount, DEV_BUSINESS_USABILITY_PAGE_SIZE)
        assert.equal(defaultMetrics.tableOverflowX, 'auto')
        assert(defaultMetrics.documentWidth <= defaultMetrics.viewportWidth + 2)
        assert(
          defaultMetrics.documentHeight < 2200,
          `桌面业务易用性页面应保持可扫描，当前高度 ${defaultMetrics.documentHeight}px`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-business-usability-desktop-light'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-business-usability-desktop-light-default.png'
          ),
          fullPage: true,
        })

        const search = page.getByRole('textbox', {
          name: '搜索业务易用性说明',
        })
        await search.focus()
        await search.fill('可用量')
        await page.keyboard.press('Enter')
        await page.getByText('当前显示 1 个页面', { exact: true }).waitFor()
        assert.equal(
          await page
            .locator(
              '.erp-dev-business-usability-table-card .ant-table-tbody > .ant-table-row'
            )
            .count(),
          1,
          '关键词筛选应只保留匹配的业务页面'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-business-usability-desktop-light-filtered.png'
          ),
          fullPage: true,
        })
      },
    },
    {
      name: 'dev-business-usability-mobile-dark',
      path: '/__dev/business-usability',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '员工能不能看懂、能不能自己完成？')
        await clickERPThemeOption(page, '暗色')
        await page.evaluate(() => window.scrollTo(0, 0))
        const metrics = await page.evaluate(() => {
          const summary = document.querySelector(
            '.erp-dev-business-usability-summary'
          )
          const filters = document.querySelector(
            '.erp-dev-business-usability-filters .ant-card-body'
          )
          const table = document.querySelector(
            '.erp-dev-business-usability-table-card .ant-table-container'
          )
          return {
            summaryColumns: summary
              ? getComputedStyle(summary).gridTemplateColumns
              : '',
            filterColumns: filters
              ? getComputedStyle(filters).gridTemplateColumns
              : '',
            tableOverflowX: table ? getComputedStyle(table).overflowX : '',
            cardCount: document.querySelectorAll(
              '.erp-dev-business-usability-summary > .ant-card'
            ).length,
            rowCount: document.querySelectorAll(
              '.erp-dev-business-usability-table-card .ant-table-tbody > .ant-table-row'
            ).length,
            documentHeight: document.documentElement.scrollHeight,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          }
        })
        assert.match(metrics.summaryColumns, /^\d+(?:\.\d+)?px$/u)
        assert.match(metrics.filterColumns, /^\d+(?:\.\d+)?px$/u)
        assert.equal(metrics.tableOverflowX, 'auto')
        assert.equal(metrics.cardCount, 4)
        assert.equal(metrics.rowCount, DEV_BUSINESS_USABILITY_PAGE_SIZE)
        assert(metrics.documentWidth <= metrics.viewportWidth + 2)
        assert(
          metrics.documentHeight < 4600,
          `移动端业务易用性页面应保持可扫描，当前高度 ${metrics.documentHeight}px`
        )
        await assertDarkThemeContrast(page, {
          scenarioName: 'dev-business-usability-mobile-dark',
          selector: '.erp-dev-business-usability-page',
        })
        await assertNoHorizontalOverflow(
          page,
          'dev-business-usability-mobile-dark'
        )

        const search = page.getByRole('textbox', {
          name: '搜索业务易用性说明',
        })
        await search.focus()
        await search.fill('可用量')
        await page.keyboard.press('Enter')
        await page.getByText('当前显示 1 个页面', { exact: true }).waitFor()
        const filteredRowCount = await page
          .locator(
            '.erp-dev-business-usability-table-card .ant-table-tbody > .ant-table-row'
          )
          .count()
        assert(
          filteredRowCount > 0 && filteredRowCount < metrics.rowCount,
          `移动端关键词筛选应缩小结果集，当前 ${filteredRowCount}/${metrics.rowCount}`
        )
        await page
          .locator('.erp-dev-business-usability-table-card')
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-business-usability-mobile-dark-filtered.png'
          ),
        })
      },
    },
  ]
}
