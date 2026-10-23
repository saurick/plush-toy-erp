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
          '页面说明检查应归属测试验证'
        )
        assert.equal(
          await page
            .locator(
              '.erp-dev-workspace-nav__secondary-route[href="/__dev/business-usability"]'
            )
            .count(),
          0,
          '辅助检查通过测试执行进入，不再占据常驻导航'
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

        const table = page.locator('.erp-dev-business-usability-table-card')
        const pager = table.locator('.app-pagination')
        const range = pager.locator('.ant-pagination-total-text')
        await range.waitFor()
        const rangeText = await range.innerText()
        assert.match(rangeText, /^第 1-10 条 \/ 共 \d+ 条$/u)
        const total = Number(rangeText.match(/共 (\d+) 条/u)[1])
        assert(total > 10)
        const firstItem = await pager
          .locator('.ant-pagination-item-1')
          .boundingBox()
        const summaryBox = await range.boundingBox()
        assert(firstItem && summaryBox)
        assert.equal(firstItem.height, 28, '分页使用业务页相同的紧凑尺寸')
        assert.equal(firstItem.width, firstItem.height)
        assert(
          summaryBox.x + summaryBox.width < firstItem.x,
          '记录范围与页码不重叠'
        )
        assert.match(await pager.getAttribute('class'), /ant-pagination-mini/u)
        await pager.locator('.ant-pagination-prev.ant-pagination-disabled').waitFor()

        const rows = table.locator('.ant-table-tbody > .ant-table-row')
        const firstRow = await rows.first().textContent()
        await pager.locator('.ant-pagination-item-2').click()
        await table
          .getByText(`第 11-${Math.min(20, total)} 条 / 共 ${total} 条`, { exact: true })
          .waitFor()
        assert.notEqual(await rows.first().textContent(), firstRow)
        const lastPage = Math.ceil(total / 10)
        await pager.locator(`.ant-pagination-item-${lastPage}`).click()
        await table
          .getByText(`第 ${(lastPage - 1) * 10 + 1}-${total} 条 / 共 ${total} 条`, { exact: true })
          .waitFor()
        assert.equal(await rows.count(), total - (lastPage - 1) * 10)
        await pager.locator('.ant-pagination-next.ant-pagination-disabled').waitFor()

        const search = page.getByRole('textbox', {
          name: '搜索页面说明',
        })
        await search.fill('可用量')
        await search.press('Enter')
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
        assert.equal(await pager.count(), 0, '单页结果沿用隐藏分页的规则')
        await search.fill('不存在的分页检查页面')
        await search.press('Enter')
        await page.getByText('没有符合当前条件的页面', { exact: true }).waitFor()
        assert.equal(await pager.count(), 0)
        await search.fill('')
        await search.press('Enter')
        await table.getByText(`第 1-10 条 / 共 ${total} 条`, { exact: true }).waitFor()
        assert.equal(
          await rows.first().textContent(),
          firstRow,
          '清空筛选恢复第一页'
        )
        await assertNoHorizontalOverflow(page, '工作台分页翻页、筛选与空结果恢复')
        await page.getByRole('link', { name: '工作中心设计说明', exact: true }).click()
        await page.getByRole('region', { name: '工作中心界面说明', exact: true }).waitFor()
      },
    },
  ]
}
