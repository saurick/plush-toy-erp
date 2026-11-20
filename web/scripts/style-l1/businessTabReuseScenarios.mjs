import assert from 'node:assert/strict'

export function createBusinessTabReuseScenarios({ customerRuntimeEffectiveSession }) {
  return [
    { key: 'production', path: '/erp/production/progress', view: 'list', other: '生产执行', back: '生产记录' },
    { key: 'purchase', path: '/erp/purchase/accessories', view: 'list', other: '采购跟进', back: '订单列表' },
    { key: 'inventory', path: '/erp/warehouse/inventory', view: 'balances', other: '库存批次', back: '库存余额' },
  ].map((entry) => ({
    name: `business-tab-reuse-${entry.key}`,
    path: entry.path,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    productionOrderReleased: true,
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const selector = `[data-business-view-panel="${entry.view}"]`
      await page.locator(`${selector} tr[data-row-key]`).first().waitFor()
      const body = await page.locator(`${selector} .ant-table-tbody`).elementHandle()
      assert.equal(Boolean(body), true)
      const scrollID = await body.evaluate((node) => node.closest('.ant-table-wrapper').dataset.tableScrollId)
      for (let round = 0; round < 2; round += 1) {
        await page.getByRole('tab', { name: entry.other, exact: true }).click()
        await page.locator(`${selector}[hidden]`).waitFor({ state: 'attached' })
        assert.equal(await body.evaluate((node) => node.isConnected), true, '切换视图不重建已打开的表体')
        assert.equal(await page.locator(selector).getAttribute('inert'), '')
        if (scrollID) assert.equal(await page.locator(`[data-table-scroll-for="${scrollID}"]`).count(), 0, '隐藏表格不占用当前工具栏')
        await page.getByRole('tab', { name: entry.back, exact: true }).click()
        await page.locator(`${selector}:not([hidden])`).waitFor({ state: 'attached' })
        assert.equal(await page.locator(`${selector} .ant-table-tbody`).evaluate((node, original) => node === original, body), true)
        assert.equal(await page.locator(selector).getAttribute('inert'), null)
      }
      assert.equal(await page.locator('[data-business-view-panel]').count(), 2, '只保留已访问的分类')
      await body.dispose()
    },
  }))
}
