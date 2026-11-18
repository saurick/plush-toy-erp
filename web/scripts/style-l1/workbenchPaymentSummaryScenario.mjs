import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function workbenchPaymentSummaryScenario(session) {
  const today = '2026-11-18'
  const yesterday = '2026-11-17'
  const permissions = ['erp.workbench.read', 'finance.payment.read', 'sales_order.read', 'sales_order_item.read']
  const receipt = { currency: 'CNY', direction: 'RECEIPT', status: 'POSTED', amount: '1.25', date: today }
  const records = [
    ...Array.from({ length: 21 }, () => receipt),
    { ...receipt, direction: 'DISBURSEMENT', amount: '10.023456' },
    { ...receipt, currency: 'USD', amount: '5' },
    { ...receipt, date: yesterday, amount: '3' },
    { ...receipt, status: 'APPROVED', amount: '999' },
  ].map((row, i) => ({ ...row, id: i + 1, payment_no: `PAY-WB-${i + 1}` }))
  let failYesterday = true
  return {
    name: 'erp-workbench-payment-summary',
    path: '/erp/dashboard?summary=payments',
    auth: 'admin',
    viewport: { width: 1280, height: 820 },
    adminProfile: { is_super_admin: false, roles: [{ role_key: 'summary-review' }], permissions },
    effectiveSession: { ...session, actions: permissions, pages: ['global-dashboard'] },
    beforeNavigate: async (page) => {
      failYesterday = true
      await page.clock.setFixedTime(new Date('2026-11-17T16:30:00Z'))
      await page.route('**/rpc/operational_fact', async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        if (method !== 'list_finance_payments') return route.fallback()
        assert.equal(params.status, 'POSTED')
        assert.equal(params.date_from, params.date_to)
        let result
        if (params.include_totals && params.date_from === yesterday && failYesterday) {
          failYesterday = false
          result = { code: 50000, message: '模拟查询失败' }
        } else {
          const matching = records.filter((row) => row.status === params.status && row.date === params.date_from &&
            (!params.currency || row.currency === params.currency) && (!params.direction || row.direction === params.direction))
          const data = stylePaginatedRpcData(matching, 'payments', params)
          if (params.include_totals) {
            assert.equal(params.limit, 1)
            data.totals = params.date_from === today ? [
              { ...receipt, count: 1, currency: 'USD', amount: '5' },
              { ...receipt, count: 1, direction: 'DISBURSEMENT', amount: '10.023456' },
              { ...receipt, count: 21, amount: '26.25' },
            ] : matching.map((row) => ({ ...row, count: 1 }))
          } else {
            assert.ok(params.currency && params.direction)
          }
          result = styleRpcResult(data)
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result } })
      })
    },
    verify: async (page) => {
      const region = page.getByRole('region', { name: '工作台汇总' })
      const amount = (currency, direction) => region.getByRole('button', { name: new RegExp(`^查看 ${currency} ${direction}明细`, 'u') })
      const date = region.getByRole('textbox', { name: '收付日期' })
      const chooseDate = async (value) => {
        await date.click()
        await page.locator(`.ant-picker-dropdown:visible .ant-picker-cell-in-view[title="${value}"]`).click()
      }
      await expect(amount('CNY', '收款')).toHaveText('26.25')
      await expect(amount('CNY', '付款')).toHaveText('10.023456')
      await expect(amount('USD', '收款')).toHaveText('5.00')
      await expect(amount('USD', '付款')).toHaveCount(0)
      await expect(region.locator('tr[data-row-key="USD"] td')).toHaveText(['USD', '5.00', '1', '0.00', '0'])
      const selectorBounds = await region.getByRole('combobox', { name: '汇总类型' }).boundingBox()
      const dateBounds = await date.boundingBox()
      assert.ok(selectorBounds && dateBounds && Math.abs(selectorBounds.y - dateBounds.y) < 12, '桌面日期与汇总类型应在同一行')
      for (const [currency, direction, record] of [['CNY', '收款', 21], ['CNY', '付款', 22], ['USD', '收款', 23]]) {
        const trigger = amount(currency, direction)
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: `${currency} ${direction}明细` })
        if (currency === 'USD') {
          await page.setViewportSize({ width: 390, height: 700 })
          await expect(dialog.getByRole('columnheader', { name: '金额', exact: true })).toBeInViewport()
        }
        if (record === 21) {
          await expect(dialog.locator('tbody tr[data-row-key]')).toHaveCount(20)
          await dialog.locator('.ant-pagination-item-2').click()
        }
        await expect(dialog.locator('tbody tr[data-row-key]')).toHaveCount(1)
        await expect(dialog.getByText(`PAY-WB-${record}`, { exact: true })).toBeVisible()
        await waitForFiniteAnimations(page)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
        if (currency === 'USD') await page.setViewportSize({ width: 1280, height: 820 })
      }
      await chooseDate(yesterday)
      await expect(amount('CNY', '收款')).toHaveCount(0)
      await region.getByRole('button', { name: '重新加载' }).click()
      await expect(amount('CNY', '收款')).toHaveText('3.00')
      const type = region.locator('.erp-workbench-summaries__heading .ant-select-selector')
      const select = async (label) => {
        await type.click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: label }).click()
      }
      await select('销售订单汇总')
      await select('收付款汇总')
      await expect(amount('CNY', '收款')).toHaveText('3.00')
      await chooseDate('2026-11-16')
      await expect(region.getByText('该收付日期没有已入账的收付款')).toBeVisible()
    },
  }
}
