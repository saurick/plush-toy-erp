import path from 'node:path'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createFinanceAdvanceScenarios({
  assert,
  customerRuntimeEffectiveSession,
  expectText,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  return [
    { name: 'finance-order-advance-refund-desktop', amount: '200', reopen: false },
    { name: 'finance-full-balance-unknown-reopen-desktop', amount: '1000', reopen: true },
  ].map(({ name, amount, reopen }) => {
    const allocationRequests = []
    const remaining = reopen ? '0' : '800'
    return {
      name,
      path: '/erp/finance/payments',
      auth: 'admin',
      expectedConsoleErrorPatterns: [/net::ERR_FAILED.*\/rpc\/operational_fact/u],
      viewport: { width: 3840, height: 2160 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'finance-payments'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'finance.payment.read',
          'finance.payment.create',
          'finance.payment.post',
          'finance.payment.reverse',
          'finance.receivable.read',
          'sales.order.read',
        ],
      },
      beforeNavigate: async (page) => {
        allocationRequests.length = 0
        let payment = {
          id: 41,
          payment_no: 'ADVANCE-ORDER-01',
          kind: 'ADVANCE',
          direction: 'RECEIPT',
          status: 'POSTED',
          counterparty_type: 'CUSTOMER',
          counterparty_id: 1,
          currency: 'CNY',
          amount: '1000',
          account_ref: '模拟银行账户',
          evidence_ref: '模拟首款凭据',
          source_type: 'sales_order',
          source_id: 311,
          source_no: 'SO-ADVANCE-01',
          allocated_amount: '0',
          refunded_amount: '0',
          available_amount: '1000',
          version: 3,
          allocations: [],
          occurred_at: Math.floor(Date.now() / 1000),
        }
        const fact = {
          id: 71,
          fact_no: 'AR-ADVANCE-01',
          fact_type: 'RECEIVABLE',
          status: 'POSTED',
          counterparty_type: 'CUSTOMER',
          counterparty_id: 1,
          currency: 'CNY',
          amount: reopen ? '1000' : '2000',
          outstanding_amount: reopen ? '1000' : '2000',
        }
        await page.route('**/rpc/operational_fact', async (route) => {
          const body = route.request().postDataJSON()
          const params = body.params || {}
          let data
          switch (body.method) {
            case 'list_finance_payments':
              data = stylePaginatedRpcData([payment], 'payments', params)
              break
            case 'get_finance_payment':
              data = { payment }
              break
            case 'list_finance_payment_allocation_candidates':
              assert.equal(params.id, 41)
              data = { facts: Number(fact.outstanding_amount) > 0 ? [fact] : [] }
              break
            case 'allocate_finance_payment':
              allocationRequests.push(params)
              assert.equal(params.expected_version, 3)
              assert.deepEqual(params.allocations, [
                { finance_fact_id: 71, amount },
              ])
              assert(params.idempotency_key)
              if (allocationRequests.length > 1) {
                assert.equal(allocationRequests.length, 2)
                assert.equal(params.idempotency_key, allocationRequests[0].idempotency_key)
                data = { payment }
                break
              }
              fact.outstanding_amount = String(Number(fact.amount) - Number(amount))
              payment = {
                ...payment,
                allocated_amount: amount,
                available_amount: remaining,
                version: 4,
                allocations: [
                  {
                    id: 91,
                    payment_id: 41,
                    finance_fact_id: 71,
                    finance_fact_no: fact.fact_no,
                    amount,
                    currency: 'CNY',
                    status: 'POSTED',
                  },
                ],
              }
              await route.abort('failed')
              return
            case 'reverse_finance_allocation':
              fact.outstanding_amount = fact.amount
              assert.equal(params.allocation_id, 91)
              assert.equal(params.expected_version, 4)
              assert.equal(params.reason, '调整抵扣批次')
              payment = {
                ...payment,
                allocated_amount: '0',
                available_amount: '1000',
                version: 5,
                allocations: [
                  ...payment.allocations,
                  {
                    id: 92,
                    reversal_of_allocation_id: 91,
                    finance_fact_id: 71,
                    finance_fact_no: fact.fact_no,
                    amount,
                    currency: 'CNY',
                    status: 'REVERSED',
                    reason: params.reason,
                  },
                ],
              }
              data = { payment }
              break
            default:
              await route.fallback()
              return
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: styleRpcResult(data),
            }),
          })
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'list_sales_orders') {
            await route.fallback()
            return
          }
          const orders = [
            {
              id: 311,
              order_no: 'SO-ADVANCE-01',
              customer_id: 1,
              currency: 'USD',
              lifecycle_status: 'active',
            },
          ]
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: styleRpcResult(
                stylePaginatedRpcData(orders, 'sales_orders', body.params)
              ),
            }),
          })
        })
      },
      verify: async (page) => {
        const choose = async (label, text) => {
          await page
            .getByLabel(label, { exact: true })
            .locator(
              'xpath=ancestor::div[contains(@class, "ant-select-selector")][1]'
            )
            .click()
          await page
            .locator('.ant-select-dropdown:visible')
            .getByText(text, { exact: true })
            .click()
        }
        const action = async (name) => {
          const direct = page.getByRole('button', { name, exact: true }).first()
          if (await direct.isVisible().catch(() => false)) {
            await direct.click()
            return
          }
          await page
            .getByRole('button', { name: /^更多操作，共/u })
            .first()
            .click()
          await page
            .locator('.erp-business-selection-action-menu:visible')
            .getByRole('button', { name, exact: true })
            .click()
        }
        await expectText(page, 'ADVANCE-ORDER-01')
        await page
          .getByRole('row')
          .filter({ hasText: 'ADVANCE-ORDER-01' })
          .first()
          .click()
        await action('抵扣应收 / 应付')
        const allocation = page.getByRole('dialog', { name: '选择核销记录' })
        await allocation.waitFor({ state: 'visible' })
        await allocation
          .getByRole('textbox', { name: /本次核销金额/u })
          .fill(amount)
        await allocation
          .getByRole('button', { name: '确认抵扣', exact: true })
          .click()
        await allocation.getByText(new RegExp(`可抵扣余额 ${remaining} CNY`, 'u')).waitFor()
        if (reopen) {
          await allocation.getByRole('button', { name: '取消', exact: true }).click()
          await allocation.waitFor({ state: 'hidden' })
          await action('抵扣应收 / 应付')
          await allocation.waitFor({ state: 'visible' })
          assert.equal(await allocation.getByRole('textbox', { name: /本次核销金额/u }).inputValue(), amount)
          await allocation.getByText('当前没有可核销的应收或应付记录', { exact: true }).waitFor()
        }
        await allocation.getByRole('button', { name: '确认抵扣', exact: true }).click()
        await allocation.waitFor({ state: 'hidden' })
        await expectText(page, '已抵扣应收应付，剩余款项继续保留')
        await page.screenshot({
          path: path.join(outputDir, reopen ? 'finance-full-balance-recovery-4k.png' : 'finance-advance-balance-4k.png'),
          fullPage: false,
        })
        await action('撤销抵扣')
        const reversal = page.getByRole('dialog', {
          name: '撤销抵扣',
          exact: true,
        })
        await choose('已抵扣记录', `AR-ADVANCE-01 · ${amount} CNY`)
        await reversal.getByLabel('撤销原因').fill('调整抵扣批次')
        await reversal
          .getByRole('button', { name: '确认撤销抵扣', exact: true })
          .click()
        await reversal.waitFor({ state: 'hidden' })
        await action('登记实际退款')
        await expectText(page, '退回原款 ADVANCE-ORDER-01；当前可退 1000 CNY')
        assert.equal(
          await page.getByLabel('收付款方向', { exact: true }).isDisabled(),
          true
        )
        await page
          .getByLabel('实收 / 实付金额', { exact: true })
          .fill('1000.000001')
        await expectText(page, '退款金额不能超过原款可用余额')
        await page.screenshot({
          path: path.join(outputDir, 'finance-refund-validation-4k.png'),
          fullPage: false,
        })
        await page.setViewportSize({ width: 600, height: 1000 })
        await assertNoHorizontalOverflow(page, 'finance-refund-narrow')
        await page.screenshot({
          path: path.join(outputDir, 'finance-refund-narrow.png'),
          fullPage: false,
        })
        // Discard only this synthetic form; the posted cash remains in the fixture.
        await page
          .getByRole('button', { name: /返回列表/u })
          .first()
          .click()
        const discard = page
          .getByRole('button', { name: /放弃.*修改|确认离开/u })
          .first()
        await discard.waitFor({ state: 'visible' })
        await discard.click()
        await page.setViewportSize({ width: 3840, height: 2160 })
        await page
          .getByRole('button', { name: '登记收付款', exact: true })
          .click()
        await choose('款项用途', '订单预收 / 预付（首款、分期款、发货前尾款）')
        await choose('客户', /暗色客户/u)
        await choose('关联单据', '销售订单')
        await choose('订单 / 合同', 'SO-ADVANCE-01 · USD')
        assert.equal(
          await page.getByLabel('币种', { exact: true }).isDisabled(),
          true
        )
        await choose('款项用途', '应收应付结算')
        await page
          .getByLabel('订单 / 合同', { exact: true })
          .waitFor({ state: 'detached' })
        assert.equal(
          await page.getByLabel('订单 / 合同', { exact: true }).count(),
          0
        )
        assert.equal(
          await page.getByLabel('币种', { exact: true }).inputValue(),
          ''
        )
      },
    }
  })
}
