export function createDevPaginationScenarios({ assert, assertNoHorizontalOverflow }) {
  return [{
    name: 'dev-ui-shared-pagination',
    path: '/__dev/ui-design?page=controls&control=components',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const businessRequests = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.startsWith('/rpc/')) businessRequests.push(request.url())
      })
      await page.getByRole('link', { name: '操作列表与分页示例', exact: true }).click()
      await page.waitForURL((url) => url.searchParams.get('control') === 'pagination')
      const stage = page.locator('.erp-control-library-stage')
      const pager = stage.locator('.app-pagination')
      const rows = stage.locator('tbody tr.ant-table-row')
      const result = stage.getByLabel('分页示例结果', { exact: true })
      const selectState = async (name) => stage.getByRole('radio', { name, exact: true }).locator('..').click()
      const expectRange = async (text, rowCount, first) => {
        await pager.getByText(text, { exact: true }).waitFor()
        assert.equal(await rows.count(), rowCount)
        if (first) assert.equal(await result.innerText(), `当前页首项：演示记录 ${first}`)
        const dimensions = await pager.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const children = [...node.children].filter((child) => child.getBoundingClientRect().width > 0)
          return {
            overflow: node.scrollWidth - node.clientWidth,
            childrenInside: children.every((child) => {
              const rect = child.getBoundingClientRect()
              return rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.bottom <= box.bottom + 1
            }),
          }
        })
        assert(dimensions.overflow <= 1 && dimensions.childrenInside, `分页内容应在自身边界内：${JSON.stringify(dimensions)}`)
      }

      await expectRange('第 1-10 条 / 共 123 条', 10, '001')
      await pager.locator('.ant-pagination-item-2').focus()
      await page.keyboard.press('Enter')
      await expectRange('第 11-20 条 / 共 123 条', 10, '011')
      await pager.locator('.ant-select-selector').click()
      await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').getByText('20 条/页', { exact: true }).click()
      await expectRange('第 1-20 条 / 共 123 条', 20, '001')
      await pager.getByRole('button', { name: '下一页', exact: true }).click()
      await expectRange('第 21-40 条 / 共 123 条', 20, '021')
      await selectState('独立分页')
      assert.equal(await pager.count(), 1, '切换呈现方式不重复创建分页条')
      await expectRange('第 21-40 条 / 共 123 条', 20, '021')
      await pager.locator('.ant-pagination-item-7').click()
      await expectRange('第 121-123 条 / 共 123 条', 3, '121')
      assert(await pager.getByRole('button', { name: '下一页', exact: true }).isDisabled())

      await selectState('加载中')
      await stage.getByText('正在读取，保留当前内容', { exact: true }).waitFor()
      assert(await pager.getByRole('button', { name: '上一页', exact: true }).isDisabled())
      assert(await pager.getByRole('combobox', { name: '每页示例条数', exact: true }).isDisabled())
      assert.equal(await rows.count(), 3, '加载中保留已经读取的行')
      await selectState('加载失败')
      await stage.getByRole('alert').waitFor()
      await expectRange('第 121-123 条 / 共 123 条', 3, '121')
      await stage.getByRole('button', { name: '重试', exact: true }).click()
      assert.equal(await stage.getByRole('alert').count(), 0)
      await expectRange('第 121-123 条 / 共 123 条', 3, '121')

      await selectState('单页')
      await expectRange('第 1-7 条 / 共 7 条', 7, '001')
      assert(await pager.getByRole('button', { name: '上一页', exact: true }).isDisabled())
      assert(await pager.getByRole('button', { name: '下一页', exact: true }).isDisabled())
      await selectState('空列表')
      await expectRange('第 0-0 条 / 共 0 条', 0)
      await stage.getByText('没有符合条件的记录', { exact: true }).waitFor()
      await stage.getByRole('button', { name: '恢复初始内容', exact: true }).click()
      await expectRange('第 1-10 条 / 共 123 条', 10, '001')
      await page.reload()
      await expectRange('第 1-10 条 / 共 123 条', 10, '001')
      assert.deepEqual(businessRequests, [], '分页示例不读取或写入业务数据')
      await assertNoHorizontalOverflow(page)
    },
  }]
}
