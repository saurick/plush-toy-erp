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
      const roleSelect = page.getByRole('combobox', { name: '参与岗位', exact: true })
      const exceptionSelect = page.getByRole('combobox', { name: '异常类型', exact: true })
      await roleSelect.click()
      await expect(roleSelect).not.toBeEditable()
      await page.getByRole('option', { name: '工程', exact: true }).click()
      await expect(page).toHaveURL((url) => url.searchParams.get('flow_role') === 'engineering')
      await expect(page.locator('[data-chain-stage]')).toHaveCount(17)
      await financeTab.click()
      await expect(financeTab).toHaveAttribute('aria-selected', 'true')
      await expect(page.locator('[data-finance-overview]')).toBeVisible()
      await expect(roleSelect).toHaveCount(0)
      await expect(exceptionSelect).toHaveCount(0)
      expect(await flowViews.evaluate((current, previous) => current === previous, originalTabs)).toBe(true)
      await originalTabs.dispose()
      await flowViews.getByRole('tab', { name: '异常处理', exact: true }).click()
      await expect(roleSelect).toHaveCount(0)
      await expect(page.getByRole('button', { name: '关联筛选', exact: true })).toHaveCount(0)
      await exceptionSelect.click()
      await expect(exceptionSelect).not.toBeEditable()
      await expect(page.getByRole('option', { name: '首次来料不合格', exact: true })).toBeVisible()
      await exceptionSelect.press('Escape')
      await flowViews.getByRole('tab', { name: '订单全流程', exact: true }).click()
      await expect(page).toHaveURL((url) => url.searchParams.get('flow_role') === 'engineering')
      await page.locator('.erp-dev-fulfillment-guide__role-select .ant-select-clear').click()
      await expect(page).toHaveURL((url) => !url.searchParams.has('flow_role'))

      await page.goto(new URL('/__dev/status-flows?flow_tab=exceptions&flow_exception=purchase_rejection&flow_role=engineering&flow_exception_origin=incoming_quality&flow_decision=return_to_vendor', page.url()).href)
      await expect(page.getByRole('heading', { name: '退厂', exact: true })).toBeVisible()
      await expect(page.getByRole('combobox')).toHaveCount(1)
      await expect(page.getByText('当前范围没有匹配的关联动作')).toHaveCount(0)
      await page.getByText('关联动作与规则', { exact: true }).click()
      const openRules = page.locator('[data-relation-action]').getByRole('button', { name: '查看动作规则', exact: true })
      await openRules.click()
      await expect(page).toHaveURL((url) => url.pathname === '/__dev/business-rules' && !url.searchParams.has('flow_role'))
      await expect(page.locator('[data-selected-flow]')).toBeVisible()
      await page.getByRole('button', { name: '返回 业务结构', exact: true }).click()
      await expect(openRules).toBeFocused()
      await expect(page).toHaveURL((url) => url.searchParams.get('flow_role') === 'engineering' && url.searchParams.get('flow_decision') === 'return_to_vendor')

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

      await page.goto(new URL('/__dev/ui-design?page=workbench', page.url()).href)
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.getByRole('table', { name: '开发工具对照' })
        .getByRole('button', { name: '业务链路', exact: true }).click()
      await frame.getByRole('tab', { name: '财务关联概览', exact: true }).click()
      await expect(frame.locator('[data-flow-directory-view="finance"]').getByRole('combobox', { name: '参与岗位', exact: true })).toHaveCount(0)
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
