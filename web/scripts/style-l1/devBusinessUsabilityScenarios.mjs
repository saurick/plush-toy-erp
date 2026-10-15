export function createDevBusinessUsabilityScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  return [
    {
      name: 'dev-business-usability-desktop-light',
      path: '/__dev/business-usability?status=unknown&role=unknown&legacy=1',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '页面说明检查')
        await page.waitForURL((url) => url.search === '')
        assert.match(
          await page
            .locator('.erp-dev-workspace-nav__route[href="/__dev/quality"]')
            .getAttribute('class'),
          /erp-dev-workspace-nav__route--context/u,
          '页面说明检查应归属质量验证'
        )
        assert.equal(
          await page
            .locator(
              '.erp-dev-workspace-nav__secondary-route[href="/__dev/business-usability"]'
            )
            .count(),
          0,
          '辅助检查通过改动验证进入，不再占据常驻导航'
        )
        await page
          .locator('.erp-dev-business-usability-boundary > summary')
          .click()
        await page
          .getByText('推荐岗位不是权限，覆盖状态也不是客户验收。', {
            exact: true,
          })
          .waitFor()
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '业务易用性子页不应重复常驻双环境事实'
        )

        const tableOverflowX = await page
          .locator(
            '.erp-dev-business-usability-table-card .ant-table-container'
          )
          .evaluate((element) => getComputedStyle(element).overflowX)
        assert.equal(
          tableOverflowX,
          'auto',
          '宽表应在自身容器内滚动，不能撑宽整个 DEV 页面'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-business-usability-desktop-light'
        )

        const search = page.getByRole('textbox', {
          name: '搜索页面说明',
        })
        await search.fill('可用量')
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
      },
    },
  ]
}
