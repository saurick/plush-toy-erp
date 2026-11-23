import assert from 'node:assert/strict'
import { expect } from 'playwright/test'
import { readFile, writeFile } from 'node:fs/promises'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'

async function verifyCreditReversal(page, screenshotPath) {
  await page.getByRole('row').filter({ hasText: 'CR-NAV-901' }).click()
  const reverse = page.getByRole('button', { name: '冲回当前调整', exact: true })
  if (!(await reverse.isVisible())) {
    await page.getByRole('button', { name: /^更多操作，共/u }).click()
  }
  await reverse.click()
  const dialog = page.getByRole('dialog', { name: /^冲回账款调整/u })
  const number = dialog.getByRole('textbox', { name: '冲销单号' })
  assert.match(await number.inputValue(), /^CR-REV-/u)
  await waitForFiniteAnimations(page)
  const fields = await dialog.locator('form').evaluate((form) => ({
    width: form.getBoundingClientRect().width,
    rows: Array.from(form.querySelectorAll('.ant-form-item'), (item) =>
      item.getBoundingClientRect().toJSON()
    ),
  }))
  const [numberRow, reasonRow] = fields.rows
  assert(reasonRow.top >= numberRow.bottom, JSON.stringify(fields))
  for (const row of fields.rows) {
    assert(Math.abs(row.width - fields.width) <= 1, JSON.stringify(fields))
  }
  await page.screenshot({ path: screenshotPath })
  const reason = dialog.getByRole('textbox', { name: '冲回原因' })
  await dialog.getByRole('button', { name: '确认冲销' }).click()
  const required = dialog.getByText('请填写冲回原因', { exact: true })
  await required.waitFor()
  await reason.fill('原调整金额录错')
  await required.waitFor({ state: 'hidden' })
  await dialog.getByRole('button', { name: /取\s*消/u }).click()
  await dialog.waitFor({ state: 'hidden' })
}

export function createFinanceWorkspaceScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    pages: [
      ...new Set([
        ...customerRuntimeEffectiveSession.pages,
        'finance-payments',
        'receivables',
        'payables',
        'reconciliation',
        'invoices',
      ]),
    ],
    actions: [
      ...new Set([
        ...customerRuntimeEffectiveSession.actions,
        'finance.payment.read',
        'finance.receivable.read',
        'finance.payable.read',
        'finance.reconciliation.read',
        'finance.credit_note.create',
        'finance.credit_note.reverse',
        'purchase_receipt.read',
        'purchase_return.read',
        'purchase_receipt_adjustment.read',
      ]),
    ],
  }
  return [
    {
      name: 'finance-payment-summary-menu',
      path: '/erp/finance/payments',
      auth: 'admin',
      effectiveSession,
      viewport: { width: 1280, height: 720 },
      beforeNavigate: async (page) => {
        const groups = [
          { currency: 'HKD', direction: 'RECEIPT', status: 'POSTED', count: 1, amount: '5', unitAmount: '5' },
          { currency: 'CNY', direction: 'DISBURSEMENT', status: 'DRAFT', count: 1, amount: '2.123456', unitAmount: '2.123456' },
          { currency: 'CNY', direction: 'RECEIPT', status: 'POSTED', count: 51, amount: '63.75', unitAmount: '1.25' },
        ]
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'list_finance_payments') return route.fallback()
          const totals = groups.filter((g) => !params.status || g.status === params.status)
            .map(({ currency, direction, status, count, amount }) => ({ currency, direction, status, count, amount }))
          const sourceExamples = [
            { kind: 'ADVANCE', source_no: 'SO-PAY-001' },
            { kind: 'REFUND', refund_of_payment_no: 'PAY-ORIGINAL-001' },
            { kind: 'ADVANCE' },
          ]
          const payments = groups.flatMap((g) => Array.from({ length: g.count }, () => g))
            .map((g, i) => ({ id: i + 1, payment_no: `PAY-SUM-${i + 1}`, amount: g.unitAmount, status: g.status, direction: g.direction, currency: g.currency, ...sourceExamples[i] }))
            .filter((row) => !params.status || row.status === params.status)
          const data = { ...stylePaginatedRpcData(payments, 'payments', params), status_counts: { DRAFT: 1, POSTED: 52 } }
          if (params.include_totals) data.totals = totals
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
        })
      },
      verify: async (page) => {
        const paymentRow = (number) => page.getByRole('row').filter({ has: page.getByText(number, { exact: true }) })
        for (const [number, label, value] of [
          ['PAY-SUM-1', '关联订单号', 'SO-PAY-001'],
          ['PAY-SUM-2', '原收付款单号', 'PAY-ORIGINAL-001'],
        ]) {
          const row = paymentRow(number)
          await assertTaskCopy(page, row.getByRole('button', { name: `复制${label}`, exact: true }), value, { keyboard: true })
          await page.getByRole('button', { name: `关闭「${label}已复制」提示`, exact: true }).click()
          await expect(row.getByRole('radio')).not.toBeChecked()
        }
        await expect(paymentRow('PAY-SUM-3')).toContainText('关联订单待核对')
        await expect(paymentRow('PAY-SUM-3').getByRole('button', { name: '复制关联订单号', exact: true })).toHaveCount(0)
        const tools = page.getByRole('button', { name: '表格工具', exact: true })
        const dialog = page.getByRole('dialog', { name: '金额汇总', exact: true })
        const openSummary = async () => {
          await tools.click()
          const menu = page.getByRole('menu').filter({ hasText: '导出筛选结果' })
          await expect(menu.getByRole('menuitem')).toHaveText(['查看金额汇总', '导出筛选结果', '列设置'])
          await menu.getByRole('menuitem', { name: /查看金额汇总/u }).click()
          await expect(dialog).toBeVisible()
          await waitForFiniteAnimations(page)
        }
        const record = page.getByRole('row').filter({ hasText: 'PAY-SUM-53' })
        await page.locator('.ant-pagination-item-2:visible').click()
        await record.click()
        await expect(page.getByLabel('收付款筛选汇总')).toHaveCount(0)
        await openSummary()
        await expect(dialog).toContainText('全部页 · 共 53 笔')
        await expect(dialog.locator('tr[data-row-key="CNY:RECEIPT:POSTED"] td')).toHaveText(['CNY', '收款', '已入账', '51', '63.75'])
        await expect(dialog.locator('tr[data-row-key="CNY:DISBURSEMENT:DRAFT"] td')).toHaveText(['付款', '待审批', '1', '2.123456'])
        await expect(dialog.locator('tr[data-row-key="HKD:RECEIPT:POSTED"] td')).toHaveText(['HKD', '收款', '已入账', '1', '5.00'])
        await page.setViewportSize({ width: 390, height: 660 })
        await waitForFiniteAnimations(page)
        const bounds = await dialog.boundingBox()
        assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= 391)
        await expect(dialog.getByRole('columnheader', { name: '金额', exact: true })).toBeInViewport()
        await page.setViewportSize({ width: 1280, height: 720 })
        await waitForFiniteAnimations(page)
        await page.keyboard.press('Escape')
        await expect(dialog).toBeHidden()
        await expect(tools).toBeFocused()
        await expect(page.locator('.ant-pagination-item-active:visible')).toHaveAttribute('title', '2')
        await expect(record.getByRole('radio')).toBeChecked()
        await page.getByRole('button', { name: /^待审批，共/u }).click()
        await openSummary()
        await expect(dialog).toContainText('待审批 · 全部页 · 共 1 笔')
        await expect(dialog.locator('tbody tr[data-row-key]')).toHaveCount(1)
        await dialog.getByRole('button', { name: /Close|关闭/u }).click()
        await page.getByRole('button', { name: /^已取消，共/u }).click()
        await openSummary()
        await expect(dialog).toContainText('当前筛选下没有可汇总的金额')
        await expect(dialog).not.toContainText('2.123456')
        await assertNoHorizontalOverflow(page, 'finance-payment-summary-menu')
      },
    },
    ...[1920, 390].map((width) => ({
      name: `finance-workspace-navigation-${width}`,
      path: '/erp/finance/payments',
      auth: 'admin',
      effectiveSession,
      viewport: { width, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          let data
          if (method === 'list_finance_credit_notes') {
            data = {
              credit_notes: [
                {
                  id: 901,
                  credit_note_no: 'CR-NAV-901',
                  finance_fact_id: 71,
                  finance_fact_no: 'AR-NAV-71',
                  finance_fact_type: 'RECEIVABLE',
                  amount: '20.00',
                  currency: 'CNY',
                  balance_direction: 'DECREASE',
                  status: 'POSTED',
                  finance_fact_original_amount: '200.00',
                  finance_fact_outstanding_amount: '180.00',
                },
              ],
              total: 1,
              status_counts: { POSTED: 1 },
              limit: params.limit,
              offset: params.offset,
            }
          } else if (method === 'list_finance_source_adjustments') {
            data = {
              adjustments: [
                {
                  source_type: 'PURCHASE_RETURN',
                  source_id: 81,
                  source_no: 'RET-NAV-81',
                  finance_fact_no: 'AP-NAV-81',
                  counterparty_name: '模拟供应商',
                  balance_direction: 'DECREASE',
                  amount: '5.00',
                  outstanding_amount: '10.00',
                  currency: 'CNY',
                },
              ],
              total: 1,
            }
          } else if (method === 'get_finance_statement') {
            data = {
              statement: {
                ...params,
                snapshot_at: 1793880000,
                opening: '200.00',
                increase: '30.00',
                decrease: '20.00',
                closing: '210.00',
                total: 1,
                entries: [
                  {
                    key: 'NAV-1',
                    date: params.date_from,
                    kind: 'RECEIVABLE',
                    number: 'AR-NAV-71',
                    amount: '30.00',
                    balance: '230.00',
                  },
                ],
              },
            }
          } else return route.fallback()
          return route.fulfill({
            json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
          })
        })
      },
      verify: async (page) => {
        const header = page
          .locator(
            '.erp-business-page-header-card:not(.erp-business-page-header-card--secondary)'
          )
          .first()
        await header
          .getByRole('tab', { name: '收付款', exact: true, selected: true })
          .waitFor()
        assert.equal(
          await page
            .locator('.erp-business-page-header-card--secondary')
            .count(),
          0
        )
        assert.equal(
          await page
            .getByRole('tab', { name: '收付款记录', exact: true })
            .count(),
          0
        )
        await page
          .locator('.erp-business-operation-panel__search input')
          .waitFor()
        await waitForFiniteAnimations(page)
        await page.screenshot({
          path: `${outputDir}/finance-payments-${width}.png`,
        })
        await header.getByRole('tab', { name: '应收', exact: true }).click()
        const nav = page.locator('.erp-finance-workspace .erp-sliding-tab-list')
        await nav
          .getByRole('tab', { name: '账款列表', exact: true, selected: true })
          .waitFor()
        const navigationNode = await nav.elementHandle()
        const measurements = []
        for (const label of ['到期顺序', '账款调整', '账款列表']) {
          await nav.getByRole('tab', { name: label, exact: true }).click()
          await nav
            .getByRole('tab', { name: label, exact: true, selected: true })
            .waitFor()
          assert.equal(
            await navigationNode.evaluate((node) => node.isConnected),
            true
          )
          await waitForFiniteAnimations(page)
          const geometry = await header.evaluate((node) => {
            const content = document.querySelector(
              '.erp-finance-workspace .erp-business-operation-panel'
            )
            return {
              gap:
                content.getBoundingClientRect().top -
                node.getBoundingClientRect().bottom,
              expectedGap: parseFloat(
                getComputedStyle(node).getPropertyValue('--erp-page-gap')
              ),
            }
          })
          assert(
            Math.abs(geometry.gap - geometry.expectedGap) <= 0.5,
            JSON.stringify(geometry)
          )
          measurements.push({ label, ...geometry })
          await assertNoHorizontalOverflow(page)
          if (label === '账款调整') {
            await verifyCreditReversal(page, `${outputDir}/finance-credit-reversal-${width}.png`)
          }
        }
        if (width === 1920) {
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.erp-finance-workspace .erp-sliding-tab-list',
            2
          )
          await page.getByText('CR-NAV-901', { exact: true }).waitFor()
          await page.getByRole('row').filter({ hasText: 'CR-NAV-901' }).click()
          await page
            .getByRole('button', { name: '查看详情', exact: true })
            .click()
          const detail = page.getByRole('dialog', { name: /^账款调整详情/u })
          await detail.getByText('AR-NAV-71', { exact: true }).waitFor()
          await detail
            .getByRole('button', { name: '关闭', exact: true })
            .last()
            .click()
          await page
            .getByRole('button', { name: '表格工具', exact: true })
            .click()
          const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('menuitem', { name: /导出筛选结果/u }).click(),
          ])
          assert.match(
            await readFile(await download.path(), 'utf8'),
            /CR-NAV-901/u
          )
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.erp-finance-workspace .erp-sliding-tab-list',
            0,
            true
          )
        }
        await header.getByRole('tab', { name: '应付', exact: true }).click()
        await nav.getByRole('tab', { name: '采购待调整', exact: true }).click()
        await page.getByText('RET-NAV-81', { exact: true }).waitFor()
        if (width === 1920) {
          const row = page.getByRole('row').filter({ hasText: 'RET-NAV-81' })
          await assertTaskCopy(page, row.getByRole('button', { name: '复制来源单号', exact: true }), 'RET-NAV-81', { keyboard: true })
          await page.getByRole('button', { name: '关闭「来源单号已复制」提示', exact: true }).click()
          await assertTaskCopy(page, row.getByRole('button', { name: '复制应付单号', exact: true }), 'AP-NAV-81', { keyboard: true })
          await page.getByRole('button', { name: '关闭「应付单号已复制」提示', exact: true }).click()
        }
        await page.screenshot({
          path: `${outputDir}/finance-payables-${width}.png`,
        })
        await header.getByRole('tab', { name: '对账', exact: true }).click()
        await nav
          .getByRole('tab', { name: '单笔核对', exact: true, selected: true })
          .waitFor()
        await nav.getByRole('tab', { name: '期间对账', exact: true }).click()
        await nav
          .getByRole('tab', { name: '期间对账', exact: true, selected: true })
          .waitFor()
        if (width === 1920) {
          await page.getByRole('button', { name: '筛选', exact: true }).click()
          await page
            .getByRole('combobox', { name: '对账往来方', exact: true })
            .click()
          await page
            .locator('.ant-select-dropdown:visible .ant-select-item-option')
            .first()
            .click()
          await page.keyboard.press('Escape')
          await page
            .getByRole('button', { name: '查询对账', exact: true })
            .click()
          await page.getByText('期末 210.00 CNY', { exact: true }).waitFor()
        }
        await nav.getByRole('tab', { name: '单笔核对', exact: true }).click()
        await page
          .locator('.erp-business-operation-panel__search input')
          .waitFor()
        await nav.getByRole('tab', { name: '期间对账', exact: true }).click()
        await page.goBack()
        await nav
          .getByRole('tab', { name: '单笔核对', exact: true, selected: true })
          .waitFor()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({
          path: `${outputDir}/finance-workspace-${width}.png`,
        })
        await writeFile(
          `${outputDir}/finance-workspace-${width}.json`,
          JSON.stringify(measurements, null, 2)
        )
      },
    })),
  ]
}
