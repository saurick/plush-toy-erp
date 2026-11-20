import fs from 'node:fs/promises'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { ProcessKey } from '../../src/common/consts/statuses.generated.mjs'

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

export async function assertNoTaskReadFailures(page, surface, assert) {
  await waitForFiniteAnimations(page)
  const failures = await surface.getByRole('alert').filter({ hasText: /读取.*失败|暂时无法.*(?:读取|确认)|业务资料暂不可用/u }).allTextContents()
  assert.deepEqual(failures, [], '来源模块读取成功，不能把错误占位当成只读办理页')
}

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
            if (method.startsWith('get_')) assert.equal(params.id, source.id)
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
          if (method === 'get_task_handling_chain' && params.task_id === task.id) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items: params.offset ? [] : [task], truncated: false } } } })
          if (method === 'get_task_process_context' && params.task_id === task.id) {
            const processKey = { sales_order: ProcessKey.SALES_ORDER_ACCEPTANCE, production_order: ProcessKey.SALES_ORDER_ACCEPTANCE, production_fact: ProcessKey.SALES_ORDER_ACCEPTANCE, shipment: ProcessKey.FINISHED_GOODS_DELIVERY, finance_payment: ProcessKey.FINANCE_PAYMENT_APPROVAL, inventory_operation: ProcessKey.INVENTORY_ADJUSTMENT_APPROVAL }[task.source_type] || ProcessKey.MATERIAL_SUPPLY
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { process_context: { source: { type: task.source_type, id: task.source_id, no: task.source_no }, process_instance: { id: task.process_instance_id, process_key: processKey, process_version: 'v1', status: source.pending ? 'active' : 'completed', started_at: task.created_at }, nodes: [], current_nodes: [], completed_nodes: [], current_responsibilities: [], linked_node: null } } } } })
          }
          if (method !== 'list_task_events' || params.task_id !== task.id) return route.fallback()
          const event = { id: task.id * 10, task_id: task.id, ...(params.scope === 'flow' ? { task } : {}), event_type: source.pending ? 'created' : 'status_changed', actor_display_name: '核对员', actor_role_key: 'boss', created_at: task.completed_at || task.created_at, task_version: 1, from_status_key: source.pending ? null : 'ready', to_status_key: task.task_status_key, reason: source.pending ? '' : '本次资料已核对' }
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { items: params.before_event_id && event.id >= params.before_event_id ? [] : [event], truncated: false } } } })
        })
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByRole('tab', { name: source.pending ? /^待办(?:\s|$)/u : /^已办(?:\s|$)/u }).click()
        const card = page.locator(`[data-mobile-task-id="${task.id}"]`)
        await card.waitFor()
        await clickTaskCardContent(card, card.getByText(task.task_name, { exact: true }))
        const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
        const tabs = steps.getByRole('tab')
        assert.equal(await tabs.count(), 3)
        const titles = await tabs.allTextContents()
        for (const [index, label] of ['任务信息', '任务办理', '结果回执'].entries()) assert.ok(titles[index].includes(label))
        assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
        assert.equal(await page.locator('.mobile-task-flow-header').count(), 1)
        const strip = await steps.elementHandle()
        const information = page.getByTestId('workflow-task-business-information')
        const inventory = business === 'inventory'
        await page.getByTestId('mobile-task-detail-screen').getByText(task.task_name, { exact: true }).waitFor()
        const records = page.getByTestId('workflow-task-event-trail').filter({ visible: true })
        await records.getByText(source.pending ? '任务已创建' : '任务已完成', { exact: true }).first().waitFor()
        if (!source.pending) assert.match(await records.locator('.workflow-task-event-trail__reason').innerText(), /本次资料已核对/u)
        assert.equal(await page.getByText('暂时无法读取任务处理链，请重新读取。', { exact: true }).filter({ visible: true }).count(), 0)
        await tabs.nth(1).click()
        const businessPanel = page.getByTestId('mobile-task-fact-form')
        await businessPanel.waitFor()
        await page.waitForFunction(() => document.querySelector('[data-task-business-page]')?.getAttribute('aria-busy') !== 'true')
        if (!inventory) await tabs.nth(0).click()
        const sourceView = inventory
          ? businessPanel.locator('.erp-inventory-ledger-page')
          : information.getByTestId('mobile-task-business-source')
        await sourceView.getByText(source.no, { exact: true }).first().waitFor()
        const fields = await sourceView.locator(inventory ? '.ant-descriptions-item-label, .ant-descriptions-item-content' : 'dt, dd').allTextContents()
        assert.ok(fields.length >= 6, `${source.key} 保留来自原业务记录的完整只读资料`)
        assert.ok(fields.some((value) => value.includes(source.no)))
        await tabs.nth(1).click()
        await businessPanel.waitFor()
        if (!inventory) {
          assert.equal(await sourceView.isVisible(), false, '完整来源资料只在任务信息中展示')
          assert.equal(await businessPanel.getByTestId('mobile-task-business-source').count(), 0)
        }
        assert.equal(await businessPanel.locator('input:not(:disabled):not([readonly]):not([type="range"]), textarea:not(:disabled):not([readonly])').filter({ visible: true }).count(), 0)
        await assertNoTaskReadFailures(page, businessPanel, assert)
        assert.equal(await page.locator('[data-business-action-role="primary"]:visible:not(:disabled)').count(), 0, '历史任务和当前无获准动作的待办不开放业务写入')
        if (inventory) {
          assert.equal(await businessPanel.getByRole('button', { name: '过账', exact: true }).filter({ visible: true }).evaluateAll((buttons) => buttons.some((button) => !button.disabled)), false)
          assert.equal(page.inventoryOperationStatus, 'APPROVED', '任务已完成不代表库存事实已过账')
        }
        const attachment = page.getByTestId('mobile-task-attachment-action').filter({ visible: true })
        assert.equal(await attachment.count(), 1)
        const attachmentBox = await attachment.boundingBox()
        assert.ok(attachmentBox && attachmentBox.width >= 44 && attachmentBox.height >= 44)
        assert.ok(attachmentBox.y >= 0 && attachmentBox.y + attachmentBox.height <= page.viewportSize().height + 1)
        const sourceRead = /^(?:get_(?:sales_order|purchase_order|outsourcing_order|purchase_receipt|quality_inspection|production_order|production_fact|shipment|finance_payment|inventory_operation)|list_production_facts)$/u
        const initialSourceReads = page.handlingRequests.filter((method) => sourceRead.test(method)).length
        await tabs.nth(0).click()
        await tabs.nth(1).click()
        assert.equal(page.handlingRequests.filter((method) => sourceRead.test(method)).length, initialSourceReads, '资料与办理步骤往返不重复读取业务记录')
        let receiptText = null
        if (source.pending) {
          assert.equal(await tabs.nth(2).isEnabled(), false, '尚未办理的任务不显示成功回执')
          assert.equal(task.task_status_key, 'ready')
          assert.equal(task.version, 1)
        } else {
          assert.equal(await tabs.nth(2).isEnabled(), true)
          await tabs.nth(2).click()
          const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
          await receipt.getByText('本次资料已核对', { exact: true }).waitFor()
          await receipt.getByText(/核对员/u).waitFor()
          const recordedAt = new Date(task.completed_at * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
          await receipt.getByText(recordedAt, { exact: true }).waitFor()
          await receipt.getByRole('region', { name: '来源业务当前资料', exact: true }).getByText(source.no, { exact: true }).waitFor()
          receiptText = await receipt.innerText()
          await page.screenshot({ path: path.join(outputDir, `mobile-handling-${source.key}-receipt.png`) })
          await tabs.nth(1).click()
          assert.equal(await tabs.nth(2).isEnabled(), true, '查看历史回执后仍可再次进入')
          await tabs.nth(2).click()
          await receipt.getByText('本次资料已核对', { exact: true }).waitFor()
          await receipt.getByText(recordedAt, { exact: true }).waitFor()
        }
        await tabs.nth(0).click()
        assert.equal(await tabs.nth(0).getAttribute('aria-selected'), 'true')
        if (!inventory) await sourceView.getByText(source.no, { exact: true }).first().waitFor()
        await tabs.nth(1).click()
        if (inventory) await sourceView.waitFor()
        else {
          await tabs.nth(0).click()
          await sourceView.waitFor()
        }
        assert.equal(await steps.evaluate((node, previous) => node === previous, strip), true, '步骤导航保持挂载')
        assert.ok((await sourceView.innerText()).includes(source.no), '步骤往返仍显示当前来源业务')
        const mutations = page.handlingRequests.filter((method) => /^(?:save_|post_|create_|execute_|submit_|ship_|start_|complete_|reject_|resume_|block_|urge_|reassign_|cancel_|update_|delete_|release_|confirm_)/u.test(method))
        assert.deepEqual(mutations, [], '浏览和步骤切换不得写业务或任务状态')
        assert.equal(new URL(page.url()).pathname, '/m/all/tasks')
        await assertNoHorizontalOverflow(page, `mobile-task-handling-${source.key}`)
        await waitForFiniteAnimations(page)
        await fs.writeFile(path.join(outputDir, `mobile-handling-${source.key}-steps.json`), JSON.stringify({ fields, receipt: receiptText, editorReads: initialSourceReads, totalSourceReads: page.handlingRequests.filter((method) => sourceRead.test(method)).length, mutations, attachment: attachmentBox, pending: Boolean(source.pending) }, null, 2))
        await page.screenshot({ path: path.join(outputDir, `mobile-handling-${source.key}.png`) })
      },
    }
  })
}
