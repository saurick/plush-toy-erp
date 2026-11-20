import { expect } from 'playwright/test'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

const firstOrder = {
  id: 71,
version: 3,
outsourcing_order_no: 'OUT-PROGRESS-L1',
  lifecycle_status: 'confirmed',
expected_return_date: 1795363200,
supplier_name: '分批加工厂',
}
const secondOrder = { ...firstOrder, id: 72, outsourcing_order_no: 'OUT-PROGRESS-EMPTY-L1' }
const line = {
  id: 711,
outsourcing_order_id: firstOrder.id,
line_no: 1,
line_status: 'open',
  subject_type: 'PRODUCT',
product_id: 1,
product_name_snapshot: '星星挂兔',
  unit_id: 1,
unit_name_snapshot: '个',
outsourcing_quantity: '1200',
}
const firstFact = {
  id: 721,
fact_no: 'RETURN-L1-01',
fact_type: 'RETURN_RECEIPT',
status: 'POSTED',
  source_type: 'OUTSOURCING_ORDER',
source_id: firstOrder.id,
source_line_id: line.id,
  occurred_at: 1794787200,
posted_at: 1794788100,
lot_no: 'LOT-L1-01',
  unit_id: line.unit_id,
quantity: '450',
returned_to_vendor_quantity: '50',
}
const secondFact = {
  ...firstFact,
id: 722,
fact_no: 'RETURN-L1-02',
lot_no: 'LOT-L1-02',
  quantity: '500',
returned_to_vendor_quantity: '0',
}
const firstQuality = {
  id: 731,
source_type: 'OUTSOURCING_FACT',
source_id: firstFact.id,
  inspection_no: 'QI-L1-01',
status: 'PASSED',
result: 'PASS',
}
const secondQuality = {
  ...firstQuality,
id: 732,
source_id: secondFact.id,
inspection_no: 'QI-L1-02',
  status: 'SUBMITTED',
result: null,
}

export function createOutsourcingReturnProgressScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }) {
  return [{}, { restricted: true }, { stage: true }].map(({ restricted, stage }) => {
    let factReads
    let qualityReads
    const actions = [
      'outsourcing.order.read',
      'outsourcing.fact.read',
      ...(restricted ? [] : ['quality.inspection.read']),
      ...(stage ? ['production.wip.read'] : []),
    ]
    const contract = stage ? { ...firstOrder, source_wip_batch_id: 91021 } : firstOrder
    const contractLine = stage ? { ...line, production_order_id: 71, production_wip_batch_id: 91021 } : line
    return {
      name: stage
        ? 'outsourcing-stage-view-production-order-desktop'
        : restricted ? 'outsourcing-return-progress-limited-warehouse' : 'outsourcing-return-progress-desktop',
      viewport: restricted ? { width: 780, height: 600 } : { width: 1440, height: 720 },
      path: '/erp/purchase/processing-contracts',
      auth: 'admin',
      productionOrderReleased: stage,
      adminProfile: { is_super_admin: false, permissions: actions },
      effectiveSession: { ...customerRuntimeEffectiveSession, actions },
      beforeNavigate: async (page) => {
        factReads = []
        qualityReads = 0
        const reply = (route, id, data) => route.fulfill({
          json: { jsonrpc: '2.0', id, result: styleRpcResult(data) },
        })
        await page.route('**/rpc/outsourcing_order', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_outsourcing_orders') {
            return reply(route, id, stylePaginatedRpcData([contract, secondOrder], 'outsourcing_orders', params))
          }
          if (method === 'get_outsourcing_order') {
            return reply(route, id, { outsourcing_order: params.id === contract.id ? contract : secondOrder })
          }
          if (method === 'list_outsourcing_order_items') {
            const orderID = params.outsourcing_order_id
            const item = orderID === contract.id ? contractLine : { ...line, id: 712, outsourcing_order_id: secondOrder.id }
            return reply(route, id, stylePaginatedRpcData([item], 'outsourcing_order_items', params))
          }
          return route.fallback()
        })
        if (stage) {
          await page.route('**/rpc/production_order', (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            if (method !== 'list_production_orders' || params.lifecycle_scope !== 'all') return route.fallback()
            assert.equal(params.keyword || '', '')
            assert.equal(params.status || '', '')
            assert.equal(params.offset, 0)
            return reply(route, id, stylePaginatedRpcData([
              { id: 71, version: 2, item_count: 22, order_no: 'MO-STYLE-L1-20260713', status: 'RELEASED' },
              { id: 72, version: 3, item_count: 1, order_no: 'MO-HISTORY-L1', status: 'CLOSED' },
            ], 'production_orders', params))
          })
        }
        await page.route('**/rpc/operational_fact', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_outsourcing_facts') return route.fallback()
          factReads.push(params)
          const rows = params.source_id === firstOrder.id ? restricted ? [secondFact] : [secondFact, firstFact] : []
          return reply(route, id, {
            ...stylePaginatedRpcData(rows, 'outsourcing_facts', params), full_warehouse_scope: !restricted,
          })
        })
        await page.route('**/rpc/quality', (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_outsourcing_return_quality_inspections') return route.fallback()
          qualityReads += 1
          if (qualityReads === 1) {
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '场景注入读取失败' } } })
          }
          return reply(route, id, stylePaginatedRpcData([firstQuality, secondQuality], 'quality_inspections', params))
        })
      },
      verify: async (page) => {
        const open = async (orderNo) => {
          const row = page.getByRole('row').filter({ has: page.getByText(orderNo, { exact: true }) })
          await row.getByRole('radio').check()
          await page.getByRole('button', { name: /查看详情/u }).click()
          const details = page.getByRole('dialog', { name: /加工合同详情/u })
          await expect(details.getByRole('heading', { name: '回货进度', exact: true })).toBeVisible()
          return details
        }
        const dialog = await open(firstOrder.outsourcing_order_no)
        const progress = dialog.locator('[data-form-section="回货进度"]')
        if (stage) {
          await progress.getByRole('button', { name: '查看生产订单', exact: true }).click()
          await page.waitForURL((url) =>
            url.pathname === '/erp/production/orders' &&
            url.searchParams.get('production_order_id') === '71' &&
            url.searchParams.get('wip_batch_id') === '91021')
          await expect(page.getByText('已选择 MO-STYLE-L1-20260713', { exact: true })).toBeVisible()
          const scopeNotice = page.getByRole('alert').filter({ hasText: '当前仅查看这张订单' })
          await expect(scopeNotice).toBeVisible()
          await expect(page.getByRole('dialog')).toHaveCount(0)
          await page.setViewportSize({ width: 780, height: 600 })
          await assertNoHorizontalOverflow(page)
          await scopeNotice.getByRole('button', { name: '查看全部生产订单', exact: true }).click()
          await page.waitForURL((url) =>
            url.searchParams.get('scope') === 'all' &&
            !url.searchParams.has('production_order_id') &&
            !url.searchParams.has('wip_batch_id'))
          await expect(page.getByText('MO-HISTORY-L1', { exact: true })).toBeVisible()
          await expect(page.getByText('已选择 MO-STYLE-L1-20260713', { exact: true })).toHaveCount(0)
          await expect(scopeNotice).toHaveCount(0)
          await expect(page.getByRole('dialog')).toHaveCount(0)
          return
        }
        await expect(progress.getByRole('region', { name: '回货批次' })).toBeVisible()
        const sections = await dialog.locator('.erp-business-form-section').evaluateAll((nodes) =>
          nodes.map((node) => node.dataset.formSection))
        const index = sections.indexOf('回货进度')
        assert.equal(sections[index - 1], '单据信息')
        assert.match(sections[index + 1], /^加工合同明细/u)
        assert.equal(factReads[0].source_id, firstOrder.id)
        assert.equal(factReads[0].source_type, 'OUTSOURCING_ORDER')
        assert.equal(factReads[0].fact_type, 'RETURN_RECEIPT')
        assert.equal(factReads[0].status, 'POSTED')

        if (restricted) {
          await expect(progress.getByText('可查看已回货', { exact: true })).toBeVisible()
          await expect(progress.getByText('按仓库权限查看批次', { exact: true })).toBeVisible()
          await expect(progress.getByText('质检未授权', { exact: true })).toBeVisible()
          assert.equal(await progress.getByRole('button', { name: firstFact.lot_no }).count(), 0)
          assert.equal(qualityReads, 0)
          await assertNoHorizontalOverflow(page)
          return
        }

        await expect(progress.locator('dl')).toContainText(/预计回货日期.*2026/u)
        await expect(progress.locator('dl')).toContainText(/已回货900 个.*待回货300 个/u)
        const qualityError = progress.getByRole('alert').filter({ has: page.getByRole('button', { name: '重试', exact: true }) })
        await expect(qualityError).toBeVisible()
        await qualityError.getByRole('button', { name: '重试', exact: true }).click()
        const attention = progress.getByRole('button', { name: /查看批次 LOT-L1-02/u })
        await attention.click()
        const active = progress.getByRole('button', { name: secondFact.lot_no, exact: true })
        const details = progress.getByRole('region', { name: /回货批次详情 RETURN-L1-02/u })
        await expect(details).toContainText(secondQuality.inspection_no)
        assert.equal(await details.evaluate((node) => node.closest('tr').previousElementSibling?.innerText.includes('LOT-L1-02')), true)
        await expect(active).toHaveAttribute('aria-expanded', 'true')
        await expect(details.getByText(firstQuality.inspection_no, { exact: true })).toHaveCount(0)
        await details.getByRole('button', { name: '收起批次' }).click()
        await expect(active).toBeFocused()
        await expect(details).toHaveCount(0)

        await progress.getByRole('button', { name: firstFact.lot_no, exact: true }).click()
        await expect(progress.getByRole('region', { name: /RETURN-L1-01/u })).toContainText(firstQuality.inspection_no)
        await assertNoHorizontalOverflow(page)
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        const emptyDialog = await open(secondOrder.outsourcing_order_no)
        await expect(emptyDialog.getByText('暂无已确认回货批次', { exact: true })).toBeVisible()
        await expect(emptyDialog.getByRole('button', { name: firstFact.lot_no, exact: true })).toHaveCount(0)
        assert.equal(factReads.at(-1).source_id, secondOrder.id)
      },
    }
  })
}
