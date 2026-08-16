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
        const defaultMetrics = await page.evaluate(() => {
          const environmentEvidence = document.querySelector(
            '.erp-dev-environment-evidence'
          )
          const environmentHeight =
            environmentEvidence?.getBoundingClientRect().height || 0
          const environmentMarginBottom = environmentEvidence
            ? Number.parseFloat(
                getComputedStyle(environmentEvidence).marginBottom
              ) || 0
            : 0
          const documentHeight = document.documentElement.scrollHeight
          return {
            cardCount: document.querySelectorAll(
              '.erp-dev-business-usability-summary > .ant-card'
            ).length,
            rowCount: document.querySelectorAll(
              '.erp-dev-business-usability-table-card .ant-table-tbody > .ant-table-row'
            ).length,
            openEnvironmentDetailsCount: document.querySelectorAll(
              '.erp-dev-environment-card details[open]'
            ).length,
            documentHeight,
            coreDocumentHeight:
              documentHeight - environmentHeight - environmentMarginBottom,
            environmentHeight,
            documentWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
            tableOverflowX: getComputedStyle(
              document.querySelector(
                '.erp-dev-business-usability-table-card .ant-table-container'
              )
            ).overflowX,
          }
        })
        assert.equal(defaultMetrics.cardCount, 4)
        assert.equal(defaultMetrics.rowCount, DEV_BUSINESS_USABILITY_PAGE_SIZE)
        assert.equal(defaultMetrics.openEnvironmentDetailsCount, 0)
        assert.equal(defaultMetrics.tableOverflowX, 'auto')
        assert(defaultMetrics.documentWidth <= defaultMetrics.viewportWidth + 2)
        assert(
          defaultMetrics.environmentHeight > 0 &&
            defaultMetrics.environmentHeight < 220,
          `桌面双环境事实面板应保持紧凑，当前高度 ${defaultMetrics.environmentHeight}px`
        )
        assert(
          defaultMetrics.coreDocumentHeight < 2200,
          `桌面业务易用性主体应保持可扫描，当前主体高度 ${defaultMetrics.coreDocumentHeight}px，总高度 ${defaultMetrics.documentHeight}px`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-business-usability-desktop-light'
        )
        const firstEnvironmentDetails = page
          .locator('.erp-dev-environment-card details')
          .first()
        await firstEnvironmentDetails.locator('summary').click()
        assert.equal(
          await firstEnvironmentDetails.evaluate((details) => details.open),
          true,
          '技术身份与边界应可显式展开'
        )
        assert.equal(
          await firstEnvironmentDetails.locator('dt').count(),
          6,
          '展开后应保留完整的 Release、数据库、迁移、配置和数据身份'
        )
        await firstEnvironmentDetails.locator('summary').click()
        assert.equal(
          await firstEnvironmentDetails.evaluate((details) => details.open),
          false,
          '技术身份与边界应可恢复为紧凑摘要'
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
          const environmentEvidence = document.querySelector(
            '.erp-dev-environment-evidence'
          )
          const environmentHeight =
            environmentEvidence?.getBoundingClientRect().height || 0
          const environmentMarginBottom = environmentEvidence
            ? Number.parseFloat(
                getComputedStyle(environmentEvidence).marginBottom
              ) || 0
            : 0
          const documentHeight = document.documentElement.scrollHeight
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
            documentHeight,
            coreDocumentHeight:
              documentHeight - environmentHeight - environmentMarginBottom,
            environmentHeight,
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
          metrics.environmentHeight > 0 && metrics.environmentHeight < 450,
          `移动端双环境事实面板应保持紧凑，当前高度 ${metrics.environmentHeight}px`
        )
        assert(
          metrics.coreDocumentHeight < 4600,
          `移动端业务易用性主体应保持可扫描，当前主体高度 ${metrics.coreDocumentHeight}px，总高度 ${metrics.documentHeight}px`
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
