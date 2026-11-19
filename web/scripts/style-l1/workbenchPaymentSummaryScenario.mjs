import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import {
  numeric20Scale6TextFromUnits,
  numeric20Scale6Units,
} from '../../src/erp/utils/numeric20Scale6.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { collapseBusinessSplit } from './businessSplitActions.mjs'

function paymentTotals(records) {
  const groups = new Map()
  for (const { currency, direction, amount } of records) {
    const key = `${currency}:${direction}`
    const group = groups.get(key) ?? { currency, direction, count: 0, units: 0n }
    group.count += 1
    group.units += BigInt(numeric20Scale6Units(amount))
    groups.set(key, group)
  }
  return [...groups.values()].map(({ units, ...group }) => ({
    ...group, status: 'POSTED', amount: numeric20Scale6TextFromUnits(units),
  }))
}

export function workbenchPaymentSummaryScenario(session) {
  const today = '2026-11-18'
  const monthStart = '2026-11-01'
  const lastMonthStart = '2026-10-01'
  const lastMonthEnd = '2026-10-31'
  const permissions = ['erp.workbench.read', 'finance.payment.read', 'sales_order.read', 'sales_order_item.read']
  const receipt = { currency: 'CNY', direction: 'RECEIPT', status: 'POSTED', amount: '1.25', occurred: '2026-11-17T16:05:00Z' }
  const records = [
    ...Array.from({ length: 21 }, () => receipt),
    { ...receipt, direction: 'DISBURSEMENT', amount: '10.023456' },
    { ...receipt, currency: 'USD', amount: '5' },
    { ...receipt, occurred: '2026-11-17T15:59:59Z', amount: '3' },
    { ...receipt, occurred: '2026-10-31T15:59:59Z', amount: '11' },
    { ...receipt, occurred: '2026-10-31T16:00:00Z', amount: '2' },
    { ...receipt, occurred: '2026-09-03T01:00:00Z', direction: 'DISBURSEMENT', amount: '7' },
    { ...receipt, status: 'APPROVED', amount: '999' },
    { ...receipt, status: 'REVERSED', amount: '998' },
    ...['HKD', 'JPY'].flatMap((currency) => [
      { ...receipt, currency, amount: '99999999999999.999999' },
      { ...receipt, currency, amount: currency === 'HKD' ? '1.000001' : '1' },
    ]),
    ...Array.from({ length: 2 }, () => ({ ...receipt, currency: 'HKD', direction: 'DISBURSEMENT', amount: '0.01' })),
  ].map(({ occurred, ...row }, i) => ({
    ...row,
    occurred_at: Date.parse(occurred) / 1000,
    posted_at: Date.parse('2026-11-17T16:20:00Z') / 1000,
    id: i + 1,
    payment_no: `PAY-WB-${i + 1}`,
  })).sort((a, b) => b.occurred_at - a.occurred_at || b.id - a.id)
  let calls = []
  let failLastMonth = true
  let noPayments = false
  return {
    name: 'erp-workbench-payment-summary',
    path: '/erp/dashboard?summary=payments',
    auth: 'admin',
    viewport: { width: 1280, height: 820 },
    adminProfile: { is_super_admin: false, roles: [{ role_key: 'summary-review' }], permissions },
    effectiveSession: { ...session, actions: permissions, pages: ['global-dashboard'] },
    beforeNavigate: async (page) => {
      calls = []
      failLastMonth = true
      noPayments = false
      await page.clock.setFixedTime(new Date('2026-11-17T16:30:00Z'))
      await page.route('**/rpc/operational_fact', async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        if (method !== 'list_finance_payments') return route.fallback()
        calls.push(params)
        let result
        if (params.include_totals && params.date_from === lastMonthStart && failLastMonth) {
          failLastMonth = false
          result = { code: 50000, message: '模拟查询失败' }
        } else {
          const from = params.date_from ? Date.parse(`${params.date_from}T00:00:00+08:00`) / 1000 : -Infinity
          const through = params.date_to ? Date.parse(`${params.date_to}T23:59:59+08:00`) / 1000 : Infinity
          const matching = noPayments ? [] : records.filter((row) => row.status === params.status &&
            row.occurred_at >= from && row.occurred_at <= through &&
            (!params.currency || row.currency === params.currency) && (!params.direction || row.direction === params.direction))
          const data = stylePaginatedRpcData(matching, 'payments', params)
          if (params.include_totals) data.totals = paymentTotals(matching)
          result = styleRpcResult(data)
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result } })
      })
    },
    verify: async (page) => {
      const region = page.getByRole('region', { name: '工作台汇总' })
      const filters = region.locator('.erp-payment-summary-filters')
      const scope = (dateText) => filters.getByText(dateText ? `${dateText} · 仅已入账` : '仅已入账', { exact: true })
      const amount = (currency, direction) => region.getByRole('button', { name: new RegExp(`^查看 ${currency} ${direction}明细`, 'u') })
      const currencyRow = (currency) => region.locator(`tr[data-row-key="${currency}"] td`)
      const selector = (label) => region.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: label }) })
      const type = selector('汇总类型')
      const period = region.getByRole('button', { name: /^统计期间：/u })
      const select = async (control, option) => {
        await control.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(option, { exact: true }).click()
      }
      const rangeDialog = page.getByRole('dialog', { name: '选择收付日期范围' })
      const months = rangeDialog.getByRole('group', { name: /^\d{4} 年 \d+ 月$/u })
      const presets = rangeDialog.getByRole('group', { name: '快捷期间' })
      const day = (value) => rangeDialog.getByRole('button', { name: value, exact: true })
      const apply = rangeDialog.getByRole('button', { name: '应用日期' })
      const openPeriod = async () => {
        await period.click()
        await expect(period).toHaveAttribute('aria-expanded', 'true')
        await expect(rangeDialog).toBeVisible()
        await waitForFiniteAnimations(page, { selector: '.erp-payment-period-popover' })
      }
      const choosePreset = async (label) => {
        await openPeriod()
        await presets.getByRole('button', { name: label, exact: true }).click()
        await expect(rangeDialog).toBeHidden()
        await expect(period).toBeFocused()
      }
      const bounds = (from, to) => from ? { date_from: from, date_to: to } : {}
      const assertSummaryCall = (from, to) => assert.deepEqual(calls.at(-1), {
        status: 'POSTED', ...bounds(from, to), include_totals: true, limit: 1,
      })
      const assertDetailCall = (from, to, currency, direction, offset = 0) => assert.deepEqual(calls.at(-1), {
        status: 'POSTED', ...bounds(from, to), currency, direction, limit: 20, offset,
      })
      const closeDetails = async (dialog, trigger) => {
        await waitForFiniteAnimations(page)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(trigger).toBeFocused()
      }

      await expect(scope(`收付日期：${monthStart} 至 ${today}`)).toBeVisible()
      await expect(currencyRow('CNY')).toHaveText(['CNY', '31.25', '23', '10.023456', '1'])
      await expect(currencyRow('USD')).toHaveText(['USD', '5.00', '1', '0.00', '0'])
      await expect(amount('USD', '付款')).toHaveCount(0)
      assertSummaryCall(monthStart, today)
      const typeBox = await type.boundingBox()
      const periodBox = await period.boundingBox()
      const scopeBox = await scope(`收付日期：${monthStart} 至 ${today}`).boundingBox()
      assert.ok(typeBox && periodBox && Math.abs(typeBox.y - periodBox.y) <= 2 &&
        Math.abs(typeBox.height - periodBox.height) <= 2 && periodBox.x >= typeBox.x + typeBox.width,
      '桌面期间和汇总类型控件应同高、同排且不重叠')
      assert.ok(scopeBox.x >= periodBox.x + periodBox.width &&
        scopeBox.y < periodBox.y + periodBox.height && scopeBox.y + scopeBox.height > periodBox.y,
      '桌面日期说明应紧随期间控件同排展示')
      await expect(region.locator('.erp-business-data-table-card__header')).toHaveCount(0)

      const currencyCells = region.locator('tbody tr[data-row-key] td:first-child')
      const defaultOrder = ['CNY', 'HKD', 'JPY', 'USD']
      const beforeSort = calls.length
      for (const [title, ascending, descending] of [
        ['币种', defaultOrder, ['USD', 'JPY', 'HKD', 'CNY']],
        ['已入账收款', ['USD', 'CNY', 'JPY', 'HKD'], ['HKD', 'JPY', 'CNY', 'USD']],
        ['收款笔数', ['USD', 'HKD', 'JPY', 'CNY'], ['CNY', 'HKD', 'JPY', 'USD']],
        ['已入账付款', ['JPY', 'USD', 'HKD', 'CNY'], ['CNY', 'HKD', 'JPY', 'USD']],
        ['付款笔数', ['JPY', 'USD', 'CNY', 'HKD'], ['HKD', 'CNY', 'JPY', 'USD']],
      ]) {
        const head = region.getByRole('columnheader', { name: title, exact: true })
        await head.press('Enter')
        await expect(head).toHaveAttribute('aria-sort', 'ascending')
        await expect(currencyCells).toHaveText(ascending)
        await head.click()
        await expect(head).toHaveAttribute('aria-sort', 'descending')
        await expect(currencyCells).toHaveText(descending)
      }
      assert.equal(calls.length, beforeSort, '汇总表排序应在已读取的全部币种上完成')
      const receiptHead = region.getByRole('columnheader', { name: '已入账收款', exact: true })
      await receiptHead.locator('.ant-table-column-sorter').hover()
      const tip = page.getByRole('tooltip', { name: '点击升序' })
      await expect(tip).toBeVisible()
      assert.ok((await tip.boundingBox()).y >= periodBox.y + periodBox.height, '排序提示应避开统计期间')
      await amount('HKD', '收款').click({ trial: true })

      for (const [currency, direction, wireDirection, record, date] of [
        ['CNY', '收款', 'RECEIPT', 26, monthStart],
        ['CNY', '付款', 'DISBURSEMENT', 22, today],
        ['USD', '收款', 'RECEIPT', 23, today],
      ]) {
        const trigger = amount(currency, direction)
        await trigger.click()
        const dialog = page.getByRole('dialog', { name: `${currency} ${direction}明细` })
        await expect(dialog.getByText(`收付日期：${monthStart} 至 ${today} · 仅已入账`, { exact: true })).toBeVisible()
        const rows = dialog.locator('tbody tr[data-row-key]')
        await expect(rows).toHaveCount(record === 26 ? 20 : 1)
        assertDetailCall(monthStart, today, currency, wireDirection)
        if (record === 26) {
          await dialog.locator('.ant-pagination-item-2').click()
          await expect(rows).toHaveCount(3)
          assertDetailCall(monthStart, today, currency, wireDirection, 20)
        }
        const row = rows.filter({ hasText: `PAY-WB-${record}` })
        await expect(row.getByRole('cell', { name: date, exact: true })).toBeVisible()
        if (currency === 'USD') {
          await page.setViewportSize({ width: 390, height: 700 })
          await expect(dialog.getByRole('columnheader', { name: '金额', exact: true })).toBeInViewport()
        }
        await closeDetails(dialog, trigger)
        if (currency === 'USD') await page.setViewportSize({ width: 1280, height: 820 })
      }
      const sortedHead = region.getByRole('columnheader', { name: '付款笔数', exact: true })
      await expect(sortedHead).toHaveAttribute('aria-sort', 'descending')
      await sortedHead.click()
      await expect(currencyCells).toHaveText(defaultOrder)
      await period.press('Enter')
      await expect(rangeDialog).toBeFocused()
      await expect(months).toHaveCount(2)
      const macWebKit = process.platform === 'darwin' && page.context().browser().browserType().name() === 'webkit'
      await page.keyboard.press(macWebKit ? 'Alt+Tab' : 'Tab')
      await expect(presets.getByRole('button', { name: '本月', exact: true })).toBeFocused()
      await page.keyboard.press('Escape')
      await expect(rangeDialog).toBeHidden()
      await expect(period).toBeFocused()
      await choosePreset('今天')
      await expect(scope(`收付日期：${today}`)).toBeVisible()
      await expect(currencyRow('CNY')).toHaveText(['CNY', '26.25', '21', '10.023456', '1'])
      assertSummaryCall(today, today)
      await choosePreset('上月')
      await expect(region.getByRole('button', { name: '查看全部历史' })).toHaveCount(0)
      await region.getByRole('button', { name: '重新加载' }).click()
      await expect(scope(`收付日期：${lastMonthStart} 至 ${lastMonthEnd}`)).toBeVisible()
      await expect(currencyRow('CNY')).toHaveText(['CNY', '11.00', '1', '0.00', '0'])
      assertSummaryCall(lastMonthStart, lastMonthEnd)

      await choosePreset('本月')
      await expect(currencyRow('CNY')).toHaveText(['CNY', '31.25', '23', '10.023456', '1'])
      const beforeCustom = calls.length
      await openPeriod()
      await expect(months).toHaveCount(2)
      await expect(months.nth(0)).toHaveAccessibleName('2026 年 10 月')
      await expect(months.nth(1)).toHaveAccessibleName('2026 年 11 月')
      await waitForFiniteAnimations(page)
      const [presetBox, firstMonth, secondMonth] = await Promise.all([
        presets.boundingBox(), months.nth(0).boundingBox(), months.nth(1).boundingBox(),
      ])
      assert.ok(presetBox.x + presetBox.width <= firstMonth.x &&
        firstMonth.x + firstMonth.width <= secondMonth.x && Math.abs(firstMonth.y - secondMonth.y) <= 1,
      '桌面快捷项位于并排双月左侧')
      await day(lastMonthEnd).click()
      await expect(apply).toBeDisabled()
      await day(monthStart).click()
      await expect(day(monthStart)).toHaveAttribute('aria-pressed', 'true')
      await expect(scope(`收付日期：${monthStart} 至 ${today}`)).toBeVisible()
      assert.equal(calls.length, beforeCustom, '日期草稿不能触发收付款查询')
      await apply.click()
      await expect(rangeDialog).toBeHidden()
      await expect(period).toBeFocused()
      await expect(period).toHaveAccessibleName(`统计期间：${lastMonthEnd} 至 ${monthStart}`)
      await expect(scope()).toBeVisible()
      await expect(currencyRow('CNY')).toHaveText(['CNY', '13.00', '2', '0.00', '0'])
      assertSummaryCall(lastMonthEnd, monthStart)
      await select(type, '销售订单汇总')
      await select(type, '收付款汇总')
      await expect(currencyRow('CNY')).toHaveText(['CNY', '13.00', '2', '0.00', '0'])

      await page.setViewportSize({ width: 320, height: 560 })
      const controlBoxes = await Promise.all([type, period, scope()].map((control) => control.boundingBox()))
      assert.ok(controlBoxes.every((box) => box && box.x >= 0 && box.x + box.width <= 320), '窄窗期间控件应完整可见')
      assert.equal(await period.locator('.erp-payment-period__value').evaluate((value) =>
        value.scrollWidth <= value.clientWidth && value.scrollHeight <= value.clientHeight &&
        Array.from(value.children).every((date) => date.getClientRects().length === 1)
      ), true, '窄窗完整显示已选日期')
      await openPeriod()
      await expect(rangeDialog.getByText(`${lastMonthEnd} 至 ${monthStart}`, { exact: true })).toBeVisible()
      await expect(months).toHaveCount(1)
      await expect(months).toHaveAccessibleName('2026 年 11 月')
      await waitForFiniteAnimations(page)
      const [narrowPresets, narrowMonth] = await Promise.all([presets.boundingBox(), months.boundingBox()])
      const popup = await rangeDialog.boundingBox()
      assert.ok(narrowPresets.y + narrowPresets.height <= narrowMonth.y &&
        popup.x >= 0 && popup.x + popup.width <= 320 && popup.y >= 0 && popup.y + popup.height <= 560,
      '窄窗快捷项位于日历上方，浮层完整在视口内')
      const [anchorBox, popupBox] = await Promise.all([
        period.boundingBox(), page.locator('.erp-payment-period-popover:visible').boundingBox(),
      ])
      assert.ok(popupBox.y >= anchorBox.y + anchorBox.height ||
        popupBox.y + popupBox.height <= anchorBox.y, '空间不足时缩短浮层，避免盖住统计期间入口')
      await day(today).click()
      await expect(rangeDialog.getByText(`${today} 起，请选择结束日期`)).toBeVisible()
      await rangeDialog.getByRole('button', { name: '取消' }).click()
      await expect(rangeDialog).toBeHidden()
      await expect(period).toBeFocused()
      await expect(amount('CNY', '收款')).toHaveText('13.00')
      assertSummaryCall(lastMonthEnd, monthStart)

      await openPeriod()
      await rangeDialog.getByRole('button', { name: '上个月' }).click()
      await expect(months).toHaveAccessibleName('2026 年 10 月')
      const emptyDate = '2026-10-30'
      await day(emptyDate).click()
      await expect(rangeDialog.getByText(`${emptyDate} 起，请选择结束日期`)).toBeVisible()
      await day(emptyDate).click()
      await expect(rangeDialog.getByText(`${emptyDate} 至 ${emptyDate}`)).toBeVisible()
      await rangeDialog.hover()
      await page.mouse.wheel(0, 420)
      await expect(apply).toBeInViewport({ ratio: 1 })
      await apply.click()
      await expect(period).toHaveAccessibleName(`统计期间：${emptyDate}`)
      await expect(scope()).toBeVisible()
      await expect(region.getByText('所选期间没有已入账的收付款')).toBeVisible()
      assertSummaryCall(emptyDate, emptyDate)
      await region.getByRole('button', { name: '查看全部历史' }).click()
      await expect(period).toBeFocused()
      await expect(period).toHaveAccessibleName('统计期间：全部历史')
      await expect(scope()).toBeVisible()
      await expect(currencyRow('CNY')).toHaveText(['CNY', '42.25', '24', '17.023456', '2'])
      assertSummaryCall()
      const allAmount = amount('CNY', '付款')
      await allAmount.click()
      const allDialog = page.getByRole('dialog', { name: 'CNY 付款明细' })
      await expect(allDialog.getByRole('cell', { name: '2026-09-03', exact: true })).toBeVisible()
      assertDetailCall(undefined, undefined, 'CNY', 'DISBURSEMENT')
      await closeDetails(allDialog, allAmount)
      await openPeriod()
      await expect(apply).toBeDisabled()
      await day(today).click()
      const historyPreset = presets.getByRole('button', { name: '全部历史', exact: true })
      await expect(historyPreset).toHaveAttribute('aria-pressed', 'true')
      await historyPreset.click()
      await expect(rangeDialog).toBeHidden()
      await expect(scope()).toBeVisible()
      await page.setViewportSize({ width: 1280, height: 820 })
      await page.emulateMedia({ colorScheme: 'dark' })
      await expect(page.locator('html')).toHaveAttribute('data-erp-theme', 'dark')
      await page.getByRole('button', { name: '分栏', exact: true }).click()
      const leftPane = page.locator('.erp-split-pane--left')
      await expect(leftPane.getByRole('region', { name: '工作台汇总' })).toBeVisible()
      const outside = page.locator('.erp-split-pane--right').getByText('两栏分别编辑和保存。', { exact: true })
      await outside.click()
      await openPeriod()
      await expect(months).toHaveCount(1)
      await waitForFiniteAnimations(page)
      const [paneBox, dialogBox] = await Promise.all([leftPane.boundingBox(), rangeDialog.boundingBox()])
      assert.ok(dialogBox.x >= paneBox.x && dialogBox.x + dialogBox.width <= paneBox.x + paneBox.width &&
        dialogBox.y >= paneBox.y && dialogBox.y + dialogBox.height <= paneBox.y + paneBox.height,
      '窄分栏日历浮层完整留在所属栏')
      await day(today).click()
      await outside.click()
      await expect(rangeDialog).toBeHidden()
      await openPeriod()
      await expect(rangeDialog.getByRole('status')).toHaveText('请选择开始日期')
      await page.keyboard.press('Escape')
      await expect(rangeDialog).toBeHidden()
      await collapseBusinessSplit(page)
      await page.emulateMedia({ colorScheme: 'light' })
      noPayments = true
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expect(region.getByText('没有已入账的收付款', { exact: true })).toBeVisible()
      await expect(region.getByRole('button', { name: '查看全部历史' })).toHaveCount(0)
      assertSummaryCall()
    },
  }
}
