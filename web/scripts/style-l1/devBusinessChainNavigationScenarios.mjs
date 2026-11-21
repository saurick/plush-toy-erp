import { expect } from 'playwright/test'

export function createDevBusinessChainNavigationScenarios({ assertNoHorizontalOverflow }) {
  return [{
    name: 'dev-business-chain-navigation-desktop',
    path: '/__dev/status-flows',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      const flowViews = page.getByRole('tablist', { name: '流程视图', exact: true })
      await expect(flowViews.getByRole('tab')).toHaveText(['订单全流程', '异常处理', '财务关联概览'])
      const originalTabs = await flowViews.elementHandle()
      const financeTab = flowViews.getByRole('tab', { name: '财务关联概览', exact: true })
      await financeTab.click()
      await expect(financeTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('[data-finance-overview]')).toBeVisible()
      expect(await flowViews.evaluate((current, previous) => current === previous, originalTabs)).toBe(true)
      await originalTabs.dispose()
      const relatedFilter = page.getByRole('button', { name: '关联筛选', exact: true })
      await relatedFilter.click()
      const filterDialog = page.getByLabel('关联筛选条件', { exact: true })
      await expect(filterDialog).toBeVisible()
      await relatedFilter.click()
      await expect(filterDialog).toBeHidden()

      await page.goto(new URL('/__dev/status-flows?flow_stage=incoming_quality&flow_role=purchase', page.url()).href)
      const orderEntry = page.getByRole('link', { name: '在流程探索中查看链路', exact: true })
      await expect(orderEntry).toHaveAttribute('href', '/__dev/flow-explorer?chain=purchase_to_inventory')
      const orderURL = page.url()
      await orderEntry.click()
      await expect(page.getByRole('button', { name: '流程范围：采购下单到入库应付', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '返回 订单全流程', exact: true }).click()
      await expect(page).toHaveURL(orderURL)
      await expect(orderEntry).toBeFocused()

      for (const [guide, chain, title] of [
        ['production_quality', 'production_exception', '生产异常决策与执行'],
        ['purchase_rejection', 'purchase_quality_disposition', '采购拒收处置'],
        ['outsourcing_rejection', 'outsourcing_quality_disposition', '委外不合格回货处置'],
      ]) {
        await page.goto(new URL(`/__dev/status-flows?flow_tab=exceptions&flow_exception=${guide}`, page.url()).href)
        const entry = page.getByRole('link', { name: '在流程探索中查看链路', exact: true })
        await expect(entry).toHaveAttribute('href', `/__dev/flow-explorer?chain=${chain}`)
        await entry.click()
        await expect(page.getByRole('button', { name: `流程范围：${title}`, exact: true })).toBeVisible()
        await page.getByRole('button', { name: '返回 异常详情', exact: true }).click()
        await expect(page).toHaveURL((url) => url.searchParams.get('flow_exception') === guide)
        await expect(entry).toBeFocused()
      }

      await page.goto(new URL('/__dev/ui-design?page=workbench&workbenchMode=preview', page.url()).href)
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('navigation', { name: '效能工作台主导航', exact: true })
        .getByRole('button', { name: '业务链路', exact: true }).click()
      await frame.getByRole('tab', { name: '财务关联概览', exact: true }).click()
      const financeLink = frame.getByRole('link', { name: '查看三行关联概览', exact: true })
      await expect(financeLink).toHaveAttribute('href', '/__dev/status-flows?flow_tab=finance')
      await page.goto(new URL(await financeLink.getAttribute('href'), page.url()).href)
      await expect(financeTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('[data-finance-overview]')).toBeVisible()
      await page.setViewportSize({ width: 1024, height: 900 })
      await assertNoHorizontalOverflow(page)
    },
  }]
}
