import fs from 'node:fs/promises'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { orderSubmissionSuccessMessage } from '../../src/erp/utils/approvalCondition.mjs'

const SOURCES = [
  { key: 'sales', type: 'sales_order', id: 1, no: 'SO-STYLE-L1' },
  { key: 'purchase', type: 'purchase_order', id: 1, no: 'PO-STYLE-L1' },
  { key: 'outsourcing', type: 'outsourcing_order', id: 1, no: 'SIM-OUTSOURCE-CONTRACT-L1' },
  { key: 'receipt', type: 'purchase_receipt', id: 603, no: 'PR-STYLE-L1-DRAFT' },
  { key: 'quality', type: 'quality_inspection', id: 701, no: 'QI-STYLE-L1' },
  { key: 'production', type: 'production_order', id: 71, no: 'MO-STYLE-L1-20260713' },
  { key: 'production-inbound', type: 'production_fact', id: 1, no: 'PROD-FACT-L1' },
  { key: 'shipment', type: 'shipment', id: 1, no: 'SHIP-STYLE-L1' },
  { key: 'payment', type: 'finance_payment', id: 41, no: 'PAY-STYLE-L1' },
  { key: 'inventory', type: 'inventory_operation', id: 51, no: 'INV-STYLE-L1' },
]

export function createMobileTaskHandlingCoverageScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession, assertNoHorizontalOverflow }) {
  return [...SOURCES, { ...SOURCES[0], key: 'sales-pending', kind: 'sales', pending: true }].map((source, index) => {
    const business = source.kind || source.key
    const task = { id: 99730 + index, version: 1, task_name: `核对${source.no}办理资料`, task_group: 'business_source_check', process_instance_id: 98730 + index, task_code: `SIM-MOBILE-HANDLING-${source.key}`, task_status_key: source.pending ? 'ready' : 'done', owner_role_key: 'boss', source_type: source.type, source_id: source.id, source_no: source.no, created_at: 1790085600, completed_at: source.pending ? null : 1790085800 }
    return {
      name: `mobile-task-handling-${source.key}`,
      path: '/m/all/tasks',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: source.pending ? 320 : 390, height: source.pending ? 568 : 844 },
      deviceScaleFactor: 2,
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        page.handlingRequests = []
        page.on('request', (request) => {
          if (request.url().includes('/rpc/')) page.handlingRequests.push(request.postDataJSON()?.method)
        })
        if (['sales', 'purchase'].includes(business)) {
          const sales = business === 'sales'
          const record = { id: source.id, [sales ? 'order_no' : 'purchase_order_no']: source.no, customer_id: 1, supplier_id: 1, currency: 'CNY', lifecycle_status: 'draft', version: 1 }
          const instance = { id: 10, process_key: sales ? 'sales_order_acceptance' : 'material_supply', business_ref_type: source.type, business_ref_id: source.id, status: 'active' }
          const node = { id: 20, process_instance_id: 10, node_key: sales ? 'submit_sales_order' : 'submit_purchase_order', node_type: 'domain_command', status: 'active', version: 1 }
          await page.route(`**/rpc/${source.type}`, async (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            if (![`get_${source.type}`, `list_${source.type}s`].includes(method)) return route.fallback()
            const data = method.startsWith('get_') ? { [source.type]: record } : stylePaginatedRpcData([record], `${source.type}s`, params)
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
          })
          await page.route('**/rpc/customer_config', async (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            let data
            if (sales && method === 'get_sales_order_acceptance_process') data = { process_context: null }
            else if (method === (sales ? 'start_sales_order_acceptance_process' : 'start_material_supply_purchase_order_process')) data = { process_instance: instance, started_node: node, nodes: [node] }
            else if (method === (sales ? 'execute_sales_order_acceptance_submit' : 'execute_material_supply_purchase_order_submit')) {
              assert.equal(params.expected_version, 1)
              assert.equal(params[`${source.type}_id`], source.id)
              assert.ok(params.idempotency_key)
              record.lifecycle_status = 'submitted'
              record.version = 2
              const completed = { ...node, status: 'completed', version: 2, outcome: `${source.type}.submitted` }
              data = { completed_node: completed, nodes: [completed] }
            } else return route.fallback()
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
          })
        }
        if (business === 'shipment') {
          await page.route('**/rpc/customer_config', async (route) => {
            const { id, method, params } = route.request().postDataJSON()
            if (method !== 'start_finished_goods_delivery_process') return route.fallback()
            assert.equal(params.shipment_id, source.id)
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { process_instance: { id: 10, process_key: 'finished_goods_delivery', status: 'active' }, started_node: { id: 20, process_instance_id: 10, node_key: 'shipment_finance_approval', status: 'active' } } } } })
          })
        }
        if (business === 'outsourcing') {
          const record = { id: source.id, outsourcing_order_no: source.no, supplier_id: 1, currency: 'CNY', lifecycle_status: 'draft', version: 1, expected_return_date: 1790690400, contract_party_snapshot: { buyerCompany: '模拟委托单位', buyerContact: '模拟联系人', buyerPhone: '000-00000000', buyerAddress: '模拟委托地址' }, supplier_snapshot: { name: '模拟加工厂', contact_name: '模拟联系人', contact_phone: '000-00000000', address: '模拟加工地址' } }
          const item = { id: 11, outsourcing_order_id: source.id, line_no: 1, subject_type: 'PRODUCT', product_id: 1, product_sku_id: 1, unit_id: 1, product_name_snapshot: '模拟玩具', outsourcing_quantity: '20', unit_price: '2', processing_item: '车缝', line_status: 'open' }
          await page.route('**/rpc/outsourcing_order', async (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            let data
            if (method === 'get_outsourcing_order') data = { outsourcing_order: record }
            else if (method === 'list_outsourcing_orders') data = stylePaginatedRpcData([record], 'outsourcing_orders', params)
            else if (method === 'list_outsourcing_order_items') data = stylePaginatedRpcData([item], 'outsourcing_order_items', params)
            else if (method === 'submit_outsourcing_order') {
              assert.equal(params.id, source.id)
              assert.equal(params.expected_version, 1)
              assert.ok(params.idempotency_key)
              record.lifecycle_status = 'submitted'
              record.version = 2
              data = { outsourcing_order: record }
            } else return route.fallback()
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
          })
        }
        if (business === 'receipt') {
          const record = { id: source.id, receipt_no: source.no, supplier_id: 1, supplier_name: '模拟供应商', purchase_order_id: 1, warehouse_id: 1, received_at: 1790085600, status: 'DRAFT', posted_lines: 0, pending_inbound_lines: 1, can_post: true, items: [{ id: 604, receipt_id: source.id, material_id: 1, warehouse_id: 1, unit_id: 1, quantity: '12', posted: false }] }
          await page.route('**/rpc/purchase', async (route) => {
            const { id, method, params = {} } = route.request().postDataJSON()
            let data
            if (method === 'list_purchase_receipts') data = stylePaginatedRpcData([record], 'purchase_receipts', params)
            else if (['get_purchase_receipt', 'post_purchase_receipt'].includes(method)) {
              assert.equal(params.id, source.id)
              if (method === 'post_purchase_receipt') {
                Object.assign(record, { status: 'POSTED', posted_lines: 1, pending_inbound_lines: 0, can_post: false })
                record.items[0].posted = true
              }
              data = { purchase_receipt: record }
            } else return route.fallback()
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
          })
        }
        if (business === 'payment') {
          await page.route('**/rpc/operational_fact', async (route) => {
            const { id, method } = route.request().postDataJSON()
            if (method !== 'get_finance_payment') return route.fallback()
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { payment: { id: source.id, payment_no: source.no, kind: 'SETTLEMENT', direction: 'RECEIPT', status: 'APPROVED', counterparty_type: 'CUSTOMER', counterparty_id: 1, amount: '1200.00', currency: 'CNY', account_ref: '模拟收款账户', evidence_ref: '模拟收款凭据', version: 1, occurred_at: 1790085600, allocations: [] } } } } })
          })
        }
        if (business === 'inventory') {
          page.inventoryOperationStatus = 'APPROVED'
          await page.route('**/rpc/inventory', async (route) => {
            const { id, method } = route.request().postDataJSON()
            if (method !== 'get_inventory_operation') return route.fallback()
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { inventory_operation: { id: source.id, operation_no: source.no, operation_type: 'CYCLE_COUNT', status: page.inventoryOperationStatus, reason: '盘点差异已复核', version: 3, created_by: 1, items: [{ id: 1, subject_type: 'MATERIAL', subject_id: 1, from_warehouse_id: 1, from_lot_id: 401, unit_id: 1, expected_quantity: '10', counted_quantity: '11', adjustment_quantity: '1' }] } } } } })
          })
        }
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'explain_action_access' && params.task_id === task.id) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { task_id: task.id, source_access: { applicable: true, resolved: true, allowed: true }, actions: ['complete', 'block', 'reject', 'resume', 'urge'].map((action_key) => ({ action_key, allowed: false })) } } } })
          if (method !== 'list_task_events') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items: [{ id: 1, task_id: task.id, event_type: source.pending ? 'created' : 'status_changed', actor_display_name: '核对员', actor_role_key: 'boss', created_at: task.completed_at || task.created_at, task_version: 1, from_status_key: source.pending ? null : 'ready', to_status_key: task.task_status_key, reason: source.pending ? '' : '本次资料已核对' }], truncated: false } } } })
        })
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByRole('tab', { name: source.pending ? /^待办(?:\s|$)/u : /^已办(?:\s|$)/u }).click()
        const card = page.locator(`[data-mobile-task-id="${task.id}"]`)
        await clickTaskCardContent(card, card.getByText(task.task_name, { exact: true }))
        await page.getByTestId('mobile-task-detail-screen').getByRole('button', { name: '填写办理表单', exact: true }).click()
        const screen = page.getByTestId('mobile-task-action-screen')
        const sourceView = business === 'inventory' ? screen.locator('.erp-inventory-operation-receipt').filter({ hasText: source.no }) : page.locator(`[data-testid="mobile-task-business-source"][data-record-id="${source.id}"]`)
        await sourceView.waitFor()
        const footer = screen.locator('.mobile-role-action-bar')
        if (business !== 'inventory') await footer.getByRole('group', { name: '本次业务操作', exact: true }).waitFor()
        assert.equal(await screen.getByRole('group', { name: '其他业务操作', exact: true }).count(), 0)
        assert.equal(await screen.locator('[data-business-action-key="related-records"], [data-business-action-key$="-attachments"], [data-business-action-key$="-details"], [data-business-action-role="output"]').filter({ visible: true }).count(), 0)
        assert.equal(await footer.getByTestId('mobile-task-attachment-action').count(), 1)
        const attachment = await footer.getByTestId('mobile-task-attachment-action').boundingBox()
        assert.ok(attachment && attachment.width >= 44 && attachment.height >= 44, '统一附件入口可见且可触达')
        const footerMetrics = await footer.evaluate((node) => ({
          viewport: { width: innerWidth, height: innerHeight },
          footer: node.getBoundingClientRect().toJSON(),
          children: [...node.children].map((child) => ({ className: child.className, rect: child.getBoundingClientRect().toJSON(), display: getComputedStyle(child).display })),
        }))
        await fs.writeFile(path.join(outputDir, `mobile-handling-${source.key}-footer.json`), JSON.stringify(footerMetrics, null, 2))
        assert.ok(attachment.y >= 0 && attachment.y + attachment.height <= footerMetrics.viewport.height + 1, '附件位于屏幕可触达区域')
        const actionButtons = business === 'inventory' ? sourceView.getByRole('button', { name: '过账', exact: true }) : footer.locator('.erp-business-selection-action-bar__compact-visible button')
        const actions = await actionButtons.evaluateAll((nodes) => nodes.map((node) => ({ key: node.dataset.businessActionKey, text: node.textContent.trim(), disabled: node.disabled })))
        await fs.writeFile(path.join(outputDir, `mobile-handling-${source.key}-actions.json`), JSON.stringify(actions, null, 2))
        assert.ok(actions.some((action) => !action.disabled), `${source.key} 保留可用的办理入口`)
        assert.equal(await screen.locator('[data-business-action-key="workflow-progress"]').filter({ visible: true }).count(), 0)
        await assertNoHorizontalOverflow(page, `mobile-task-handling-${source.key}`)
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `mobile-handling-${source.key}.png`) })
        if (business === 'inventory') {
          const width = await sourceView.locator('.ant-alert-content').evaluate((node) => node.getBoundingClientRect().width)
          assert.ok(width >= 200, '库存作业说明保留可阅读宽度')
        }
        await actionButtons.first().click()
        await waitForFiniteAnimations(page)
        await fs.writeFile(path.join(outputDir, `mobile-handling-${source.key}-clicked.json`), JSON.stringify({ requests: page.handlingRequests, text: await page.locator('body').innerText() }, null, 2))
        const resultMessage = ['sales', 'purchase'].includes(business) ? orderSubmissionSuccessMessage(source.type, {}) : ({ receipt: '本次合格材料已入库', outsourcing: '提交合同成功', shipment: '财务审批已提交；成品质检仍由品质检验单独判定' })[business]
        if (!['sales', 'purchase'].includes(business)) {
          const confirmation = page.locator('.ant-modal:visible, .ant-popconfirm:visible').last()
          await confirmation.waitFor()
          await waitForFiniteAnimations(page)
          await assertNoHorizontalOverflow(page, `mobile-task-handling-${source.key}-confirmation`)
          await page.screenshot({ path: path.join(outputDir, `mobile-handling-${source.key}-confirmation.png`) })
          const confirmText = { receipt: /^确\s*认$/u, outsourcing: '确认提交', shipment: '提交放行' }[business]
          if (confirmText) await confirmation.getByRole('button', { name: confirmText, exact: typeof confirmText === 'string' }).click()
          else {
            await confirmation.getByRole('button', { name: /^(取\s*消|返\s*回|返回核对|稍后处理|关\s*闭)$/u }).last().click()
            await confirmation.waitFor({ state: 'hidden' })
          }
        }
        if (resultMessage) {
          await footer.getByRole('button', { name: '查看办理结果', exact: true }).waitFor()
          assert.equal(await footer.locator('.mobile-task-business-action-host').isVisible(), false, '提交成功后只保留结果主入口')
          assert.equal(await page.getByRole('button', { name: '打开任务管理', exact: true }).count(), 0)
          await footer.getByRole('button', { name: '查看办理结果', exact: true }).click()
          const result = page.getByTestId('mobile-task-receipt-screen')
          await result.getByText(resultMessage, { exact: true }).waitFor()
          await result.getByText(`业务单号：${source.no}`, { exact: true }).waitFor()
          if (source.pending) await result.getByText('可执行', { exact: true }).waitFor()
          await page.waitForFunction(() => !document.querySelector('.ant-message-notice'))
          await page.screenshot({ path: path.join(outputDir, `mobile-handling-${source.key}-receipt.png`) })
          await result.getByRole('button', { name: '任务办理', exact: true }).click()
          await sourceView.waitFor()
        }
        await screen.getByRole('button', { name: '结果回执', exact: true }).click()
        const receipt = page.getByTestId('mobile-task-receipt-screen')
        await receipt.getByText(resultMessage || '本次资料已核对', { exact: false }).waitFor()
        await receipt.getByRole('button', { name: '任务办理', exact: true }).click()
        await sourceView.waitFor()
        assert.equal(new URL(page.url()).pathname, '/m/all/tasks')
        if (business === 'inventory') {
          page.inventoryOperationStatus = 'SUBMITTED'
          assert.equal(await screen.getByText('未读取到任务对应单据，请返回任务后重新读取。', { exact: true }).count(), 0)
          await sourceView.getByRole('button', { name: '重新读取', exact: true }).click()
          await sourceView.getByText('等待另一位有权人员批准或驳回；审批本身不会改变库存。', { exact: true }).waitFor()
          assert.equal(await screen.getByRole('button', { name: '去任务中心审批', exact: true }).count(), 0)
          assert.equal(await screen.locator('[data-business-action-key="workflow-progress"]').filter({ visible: true }).count(), 0)
        }
        if (business === 'receipt') {
          await screen.getByRole('button', { name: '登记本次实际收付', exact: true }).click()
          const payment = screen.getByTestId('mobile-task-payment-entry')
          await payment.getByRole('button', { name: '填写收付款', exact: true }).click()
          const editor = screen.locator('[data-business-form-page="true"]:visible')
          await editor.waitFor()
          await editor.getByPlaceholder('填写账户，或选择最近用过的账户', { exact: true }).fill('A'.repeat(129))
          await footer.getByRole('button', { name: '创建收付款记录', exact: true }).click()
          assert.ok(await editor.locator('.ant-form-item-has-error').count() > 0, '登记收付款仍执行必填校验')
          await editor.getByText('账户摘要不能超过128个字符', { exact: true }).waitFor()
          await footer.getByRole('button', { name: '返回办理', exact: true }).click()
          await page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' }).getByRole('button', { name: '放弃修改', exact: true }).click()
          await editor.waitFor({ state: 'hidden' })
          assert.equal(await screen.getByRole('button', { name: '返回任务办理', exact: true }).count(), 1)
          assert.equal(await screen.getByRole('button', { name: '返回业务办理', exact: true }).count(), 0)
          await screen.getByRole('button', { name: '返回任务办理', exact: true }).click()
          await sourceView.waitFor()
        }
      },
    }
  })
}
