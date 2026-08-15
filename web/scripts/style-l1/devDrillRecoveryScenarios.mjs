import { installSummaryRoute } from './devVersionCenterScenarios.mjs'

export function createDevDrillRecoveryScenarios({
  assert,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
  expectHeading,
  outputDir,
  path,
}) {
  return [
    {
      name: 'dev-drill-recovery-desktop-light',
      path: '/__dev/drill-recovery',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => installSummaryRoute(page),
      verify: async (page) => {
        await expectHeading(page, '演练与恢复中心')
        assert.equal(
          await page
            .getByRole('link', { name: '演练与恢复', exact: true })
            .getAttribute('aria-current'),
          'page',
          '交付运行菜单必须明确标记当前演练与恢复入口'
        )
        await page.getByText('客户试用环境', { exact: true }).waitFor()
        assert.equal(
          await page.locator('.erp-dev-recovery-row').count(),
          6,
          '演练目录应保持六项受控能力'
        )
        assert.deepEqual(
          await page
            .locator('.erp-dev-recovery-row')
            .evaluateAll((rows) => rows.map((row) => row.dataset.priority)),
          ['P0', 'P0', 'P0', 'P1', 'P1', 'P2']
        )
        assert.equal(
          await page.locator('.erp-dev-recovery-row[open]').count(),
          1,
          '首屏只展开当前建议，避免六项内容同时铺开'
        )
        assert.equal(
          await page
            .getByText('新服务器或正式环境切换', { exact: true })
            .count(),
          1
        )
        const defaultMetrics = await page.evaluate(() => ({
          cardCount: document.querySelectorAll(
            '.erp-dev-recovery-shell > .ant-card, .erp-dev-recovery-support > .ant-card'
          ).length,
          documentHeight: document.documentElement.scrollHeight,
        }))
        assert(defaultMetrics.cardCount <= 4, '主页面不得退化为演练卡片墙')
        assert(
          defaultMetrics.documentHeight < 1900,
          `桌面首屏信息应保持紧凑，当前高度 ${defaultMetrics.documentHeight}px`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-drill-recovery-desktop-light'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-drill-recovery-desktop-light-default.png'
          ),
          fullPage: true,
        })
        const faultRow = page
          .locator('.erp-dev-recovery-row')
          .filter({ hasText: '故障注入与恢复' })
        await faultRow.locator('summary').focus()
        await page.keyboard.press('Enter')
        assert.equal(await faultRow.getAttribute('open'), '')
        assert.equal(
          await faultRow
            .getByRole('button', { name: '暂不在页面执行' })
            .isDisabled(),
          true
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-drill-recovery-desktop-fault-detail.png'
          ),
          fullPage: true,
        })
      },
    },
    {
      name: 'dev-drill-recovery-mobile-dark',
      path: '/__dev/drill-recovery',
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => installSummaryRoute(page),
      verify: async (page) => {
        await expectHeading(page, '演练与恢复中心')
        await clickERPThemeOption(page, '暗色')
        await page.evaluate(() => window.scrollTo(0, 0))
        await page.getByText('客户试用环境', { exact: true }).waitFor()
        await page
          .locator('.erp-dev-environment-evidence[aria-busy="false"]')
          .waitFor({ timeout: 20_000 })
        const metrics = await page.evaluate(() => {
          const summary = document.querySelector(
            '.erp-dev-recovery-overview__facts'
          )
          const drill = document.querySelector('.erp-dev-recovery-row')
          const nav = document.querySelector('.erp-dev-workspace-nav')
          const customerScope = document.querySelector(
            '.erp-dev-customer-scope'
          )
          const environmentEvidence = document.querySelector(
            '.erp-dev-environment-evidence'
          )
          const environmentScroller = document.querySelector(
            '.erp-dev-environment-evidence__grid'
          )
          return {
            summaryColumns: summary
              ? getComputedStyle(summary).gridTemplateColumns
              : '',
            drillWidth: Math.round(drill?.getBoundingClientRect().width || 0),
            navPosition: nav ? getComputedStyle(nav).position : '',
            customerScopeHeight: customerScope
              ? Math.round(customerScope.getBoundingClientRect().height)
              : null,
            environmentEvidenceHeight: environmentEvidence
              ? Math.round(environmentEvidence.getBoundingClientRect().height)
              : null,
            environmentCardCount: document.querySelectorAll(
              '.erp-dev-environment-card'
            ).length,
            environmentCardWidths: environmentScroller
              ? [...environmentScroller.children].map((card) =>
                  Math.round(card.getBoundingClientRect().width)
                )
              : [],
            environmentScrollerClientWidth:
              environmentScroller?.clientWidth || 0,
            environmentScrollerScrollWidth:
              environmentScroller?.scrollWidth || 0,
            viewportWidth: window.innerWidth,
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight,
            openCount: document.querySelectorAll('.erp-dev-recovery-row[open]')
              .length,
          }
        })
        const summaryColumnWidths = metrics.summaryColumns
          .split(/\s+/u)
          .map((width) => Number.parseFloat(width))
        assert.equal(summaryColumnWidths.length, 2)
        assert(
          summaryColumnWidths.every(
            (width) => Number.isFinite(width) && width > 0
          )
        )
        assert(metrics.drillWidth > 300 && metrics.drillWidth < 390)
        assert.equal(metrics.navPosition, 'static')
        assert.equal(metrics.openCount, 0)
        assert(metrics.documentWidth <= metrics.viewportWidth + 2)
        assert(
          metrics.customerScopeHeight > 0 && metrics.customerScopeHeight < 200,
          `移动端甲方范围选择器高度异常，当前高度 ${metrics.customerScopeHeight}px`
        )
        assert(
          metrics.environmentEvidenceHeight > 0 &&
            metrics.environmentEvidenceHeight < 450,
          `移动端双环境事实应使用紧凑对照带，当前高度 ${metrics.environmentEvidenceHeight}px`
        )
        assert.equal(metrics.environmentCardCount, 3)
        assert(
          metrics.environmentCardWidths.every(
            (width) => width >= 240 && width <= 310
          ),
          `移动端目标卡宽度异常: ${metrics.environmentCardWidths.join(', ')}`
        )
        assert(
          metrics.environmentScrollerScrollWidth >
            metrics.environmentScrollerClientWidth,
          '移动端三目标事实应在页面内形成可横向浏览的对照带'
        )
        const environmentScroller = page.locator(
          '.erp-dev-environment-evidence__grid'
        )
        await environmentScroller.focus()
        assert.equal(
          await environmentScroller.evaluate(
            (element) => document.activeElement === element
          ),
          true
        )
        await page.keyboard.press('ArrowRight')
        await page.waitForTimeout(100)
        assert(
          (await environmentScroller.evaluate((element) =>
            Math.round(element.scrollLeft)
          )) > 0,
          '移动端双环境对照带应支持键盘横向浏览'
        )
        await environmentScroller.evaluate((element) => {
          element.scrollLeft = 0
        })
        const coreDocumentHeight =
          metrics.documentHeight - metrics.customerScopeHeight
        assert(
          coreDocumentHeight < 2700,
          `移动端核心信息应保持可扫描，当前总高度 ${metrics.documentHeight}px，核心内容 ${coreDocumentHeight}px，甲方范围 ${metrics.customerScopeHeight}px`
        )
        await assertNoHorizontalOverflow(page, 'dev-drill-recovery-mobile-dark')
        await page.locator('.erp-dev-recovery-catalog').scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-drill-recovery-mobile-dark-default.png'
          ),
        })
        const recommendedRow = page
          .locator('.erp-dev-recovery-row')
          .filter({ hasText: '相同 SHA 幂等与缓存核验' })
        await recommendedRow.locator('summary').focus()
        await page.keyboard.press('Enter')
        assert.equal(await recommendedRow.getAttribute('open'), '')
        await recommendedRow.scrollIntoViewIfNeeded()
        const detailMetrics = await page.evaluate(() => {
          const action = document.querySelector(
            '.erp-dev-recovery-row[open] .erp-dev-recovery-row__footer'
          )
          return {
            actionDirection: action
              ? getComputedStyle(action).flexDirection
              : '',
            documentHeight: document.documentElement.scrollHeight,
          }
        })
        assert.equal(detailMetrics.actionDirection, 'column')
        const expandedCoreDocumentHeight =
          detailMetrics.documentHeight - metrics.customerScopeHeight
        assert(
          expandedCoreDocumentHeight < 3200,
          `移动端展开详情后仍应可读，当前总高度 ${detailMetrics.documentHeight}px，核心内容 ${expandedCoreDocumentHeight}px，甲方范围 ${metrics.customerScopeHeight}px`
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-drill-recovery-mobile-dark-detail'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'dev-drill-recovery-mobile-dark-detail.png'
          ),
        })
      },
    },
  ]
}
