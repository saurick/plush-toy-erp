export function createDevBusinessUsabilityScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
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
          name: '搜索业务易用性说明',
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
