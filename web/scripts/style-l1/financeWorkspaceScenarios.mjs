import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { styleRpcResult } from './rpcMockResult.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

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
