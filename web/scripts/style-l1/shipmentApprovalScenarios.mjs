import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export function createShipmentApprovalScenarios(deps) {
  const { assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession } = deps
  const { findSelectionActionButton } = createBusinessFormalAssertions(deps)
  return ['status-link', 'no-task-permission', 'load-recovery'].map((variant) => {
    let failRead = false
    let trackingRequests = []
    const shipments = ['PENDING', 'APPROVED', 'REJECTED'].map((status, index) => ({
      id: index + 1,
      shipment_no: `SHIP-APPROVAL-${index + 1}`,
      status: 'DRAFT',
      sales_order_id: 1,
      customer_id: 1,
      customer_snapshot: '审批入口验证客户',
      finance_release_status: status,
      finance_release_process_instance_id: index ? 701 + index : null,
      finance_release_note: index === 2 ? '包装资料待补齐' : null,
      items: [],
      created_at: 1_800_000_000,
      updated_at: 1_800_000_000,
    }))
    return {
      name: `business-shipment-approval-${variant}`,
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: variant === 'no-task-permission' ? {
        ...customerRuntimeEffectiveSession,
        actions: customerRuntimeEffectiveSession.actions.filter((action) => !action.startsWith('workflow.task.')),
      } : customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        trackingRequests = []
        failRead = variant === 'load-recovery'
        await page.route('**/rpc/operational_fact', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (!['list_shipments', 'get_shipment'].includes(body.method)) return route.fallback()
          const failure = body.method === 'list_shipments' && failRead
          failRead = false
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: failure
              ? { code: 40010, message: 'list_shipments 不接收参数 include_status_counts', data: null }
              : { code: 0, message: 'OK', data: body.method === 'list_shipments'
                ? stylePaginatedRpcData(shipments, 'shipments', body.params || {})
                : { shipment: shipments.find((item) => item.id === body.params.id) } },
            }),
          })
        })
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON() || {}
          if (body.method !== 'list_tracking') return route.fallback()
          trackingRequests.push(body.params)
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
            jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: {
              items: [], total: 0, limit: body.params.limit, offset: body.params.offset,
            } },
          }) })
        })
      },
      verify: async (page) => {
        assert.deepEqual(await page.locator('.erp-business-module-tabs').getByRole('tab').allTextContents(), ['出货单', '库存预留'])
        if (variant === 'load-recovery') {
          await page.getByRole('alert').filter({ hasText: '出货单读取失败' }).waitFor()
          assert.equal(await page.getByText('暂无出货单', { exact: true }).count(), 0)
          assert.equal(await page.getByText('请检查填写内容后重试', { exact: true }).count(), 0)
          await page.getByRole('button', { name: '重新读取', exact: true }).click()
        }
        const row = (id) => page.locator(`.erp-shipments-page .ant-table-row[data-row-key="${id}"]`)
        for (const [index, label] of ['待放行', '已放行', '已退回'].entries()) {
          await row(index + 1).getByText(label, { exact: true }).waitFor()
        }
        await row(1).click()
        if (variant === 'no-task-permission') {
          assert.equal(await page.locator('[data-business-action-key="shipment-approval"]').count(), 0)
          await row(1).dblclick()
          await page.getByRole('heading', { name: '查看出货明细', exact: true }).waitFor()
          assert.equal(await page.getByRole('link', { name: '查看审批', exact: true }).count(), 0)
          return
        }
        if (variant === 'load-recovery') {
          await page.getByRole('alert').filter({ hasText: '出货单读取失败' }).waitFor({ state: 'hidden' })
          return
        }
        const approval = await findSelectionActionButton(page, '查看审批')
        await approval.click()
        await page.waitForURL('**/erp/task-board?**track_source_id=1')
        const target = new URL(page.url())
        assert.equal(target.searchParams.get('track_source_type'), 'shipment')
        assert.equal(target.searchParams.get('tracking'), 'visible')
        await page.getByRole('button', { name: '清除单据范围', exact: true }).waitFor()
        assert.ok(trackingRequests.some((params) => params.source_type === 'shipment' && params.source_id === 1))
        await assertNoHorizontalOverflow(page, 'shipment-approval-task-management')
      },
    }
  })
}
