import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export function createSalesOrderAcceptanceScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    assertOrderLifecycleActionsConsolidated,
    expectHeading,
    expectText,
    customerRuntimeEffectiveSession,
  } = deps
  const { waitForCapturedMethods } = createBusinessFormalAssertions(deps)
  return [
    {
      name: 'sales-order-acceptance-submit-action-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method, params = {} } = body
          let data = {}
          if (method === 'get_effective_session') {
            data = { session: customerRuntimeEffectiveSession }
          } else if (method === 'start_sales_order_acceptance_process') {
            assert.equal(
              Number(params.sales_order_id),
              1,
              `接单流程启动必须绑定当前销售订单: ${JSON.stringify(params)}`
            )
            assert.equal(
              params.business_ref_no,
              'SO-STYLE-L1',
              `接单流程启动必须携带业务编号: ${JSON.stringify(params)}`
            )
            data = {
              process_instance: {
                id: 101,
                process_key: 'sales_order_acceptance',
                business_ref_type: 'sales_order',
                business_ref_id: 1,
                business_ref_no: 'SO-STYLE-L1',
                status: 'active',
              },
              started_node: {
                id: 201,
                process_instance_id: 101,
                node_key: 'submit_sales_order',
                node_type: 'domain_command',
                version: 7,
                status: 'active',
              },
              nodes: [
                {
                  id: 201,
                  process_instance_id: 101,
                  node_key: 'submit_sales_order',
                  node_type: 'domain_command',
                  version: 7,
                  status: 'active',
                },
              ],
              runtime_boundary: {
                fact_boundary: 'no_fact_posting',
              },
            }
          } else if (method === 'execute_sales_order_acceptance_submit') {
            assert.equal(
              params.process_instance_id,
              101,
              `提交命令必须使用启动返回的流程实例: ${JSON.stringify(params)}`
            )
            assert.equal(
              params.process_node_instance_id,
              201,
              `提交命令必须使用启动返回的节点实例: ${JSON.stringify(params)}`
            )
            assert.equal(
              params.expected_version,
              7,
              `提交命令必须使用启动返回的节点版本: ${JSON.stringify(params)}`
            )
            assert.equal(
              Number(params.sales_order_id),
              1,
              `提交命令必须绑定当前销售订单: ${JSON.stringify(params)}`
            )
            data = {
              completed_node: {
                id: 201,
                process_instance_id: 101,
                node_key: 'submit_sales_order',
                node_type: 'domain_command',
                status: 'completed',
                outcome: 'sales_order.submitted',
                version: 8,
              },
              next_node: {
                id: 202,
                node_key: 'order_approval',
                status: 'active',
              },
              linked_task: {
                id: 301,
                task_code: 'order_approval',
                owner_role_key: 'boss',
              },
              nodes: [
                {
                  id: 201,
                  process_instance_id: 101,
                  node_key: 'submit_sales_order',
                  node_type: 'domain_command',
                  status: 'completed',
                  outcome: 'sales_order.submitted',
                  version: 8,
                },
                {
                  id: 202,
                  process_instance_id: 101,
                  node_key: 'order_approval',
                  node_type: 'approval',
                  status: 'active',
                  version: 2,
                },
              ],
            }
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                message: 'OK',
                data,
              },
            }),
          })
        })
      },
      verify: async (page) => {
        const customerConfigMethods = []
        const salesOrderMethods = []
        page.on('request', (request) => {
          try {
            const method = request.postDataJSON()?.method
            if (!method) return
            if (request.url().includes('/rpc/customer_config')) {
              customerConfigMethods.push(method)
            }
            if (request.url().includes('/rpc/sales_order')) {
              salesOrderMethods.push(method)
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })

        await expectHeading(page, '销售订单')
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await assertOrderLifecycleActionsConsolidated(page, {
          scenarioName: 'sales-order-acceptance-submit-action-desktop',
          primaryActionLabel: '提交订单',
          menuActionLabels: ['取消'],
          absentButtonLabels: ['生效', '关闭', '取消'],
        })
        await page
          .locator('.erp-business-module-current-action')
          .first()
          .getByRole('button', { name: '提交订单', exact: true })
          .click()
        await waitForCapturedMethods(
          customerConfigMethods,
          [
            'start_sales_order_acceptance_process',
            'execute_sales_order_acceptance_submit',
          ],
          { scenarioName: 'sales-order-acceptance-submit-action-desktop' }
        )
        await expectText(page, '销售订单已提交，已进入审批流程')
        assert.equal(
          salesOrderMethods.includes('submit_sales_order'),
          false,
          `正式销售订单页提交不应回退旧 submit_sales_order: ${JSON.stringify({
            customerConfigMethods,
            salesOrderMethods,
          })}`
        )
        await expectText(page, 'SO-STYLE-L1')
        await assertNoHorizontalOverflow(
          page,
          'sales-order-acceptance-submit-action-desktop'
        )
      },
    },
  ]
}
