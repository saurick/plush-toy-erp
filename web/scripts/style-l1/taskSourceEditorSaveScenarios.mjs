import { writeFile } from 'node:fs/promises'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { assertBusinessFormNavigationSurface } from './businessFormSectionAssertions.mjs'

const definitions = [
  { source: 'purchase_order', group: 'purchase_prepare', stage: 'purchasing', rpc: 'purchase_order', get: 'get_purchase_order', save: 'save_purchase_order_with_items', root: 'purchase_order', lines: 'purchase_order_items', title: '编辑采购订单', quantity: 'purchased_quantity', quantityLabel: '采购数量', result: '采购订单已保存' },
  { source: 'outsourcing_order', group: 'handoff_outsourcing_contract', stage: 'outsourcing_contract', rpc: 'outsourcing_order', get: 'get_outsourcing_order', save: 'save_outsourcing_order_with_items', root: 'outsourcing_order', lines: 'outsourcing_order_items', title: '编辑加工合同', quantity: 'outsourcing_quantity', quantityLabel: '加工数量', result: '加工合同已保存' },
  { source: 'production_order', group: 'production_prepare', stage: 'production_schedule', rpc: 'production_order', get: 'get_production_order', save: 'save_production_order', root: 'production_order', lines: 'production_order_items', title: '编辑生产订单', quantity: 'planned_quantity', quantityLabel: '计划数量', result: '生产订单草稿保存成功' },
  { source: 'shipment', group: 'handoff_shipment_execute', stage: 'shipment', rpc: 'operational_fact', get: 'get_shipment', save: 'save_shipment_draft', root: 'shipment', lines: 'items', title: '核对本次出货', quantity: 'quantity', quantityLabel: '数量', result: '出货草稿和明细已更新' },
]
const reply = (route, id, data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })

export function createTaskSourceEditorSaveScenarios(deps, existing) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  return definitions.map((definition) => {
    const base = existing.find((scenario) => scenario.name === `task-unified-history-desktop-${definition.source}`)
    const task = { ...base.workflowTaskFixtures[0], task_group: definition.group, discovery: { stage_key: definition.stage }, task_status_key: 'ready', completed_at: null, version: 1 }
    if (task.task_group.startsWith('handoff_')) {
      task.task_code = `source-${task.task_group.replaceAll('_', '-')}-${task.source_id}`
      task.payload = { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: task.source_id, source_task_intent_hash: 'a'.repeat(64), entry_path: definition.source === 'shipment' ? `/erp/warehouse/shipments?shipment_id=${task.source_id}` : `/erp/purchase/processing-contracts?outsourcing_order_id=${task.source_id}` }
    }
    let original; let stored; let lines; let writes; let files; let
reads
    return {
      ...base,
      name: `task-source-editor-save-${definition.source}`,
      path: '/erp/task-board',
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        await page.addInitScript(() => {
          window.__sourceNotices = []
          document.addEventListener('DOMContentLoaded', () => {
            new MutationObserver(() => {
              for (const node of document.querySelectorAll('.ant-message-error, .ant-message-warning')) {
                const value = node.textContent
                if (!window.__sourceNotices.includes(value)) window.__sourceNotices.push(value)
              }
            }).observe(document.body, { childList: true, subtree: true })
          })
        })
        await base.beforeNavigate(page)
        original = null; stored = null; lines = []; writes = []; files = []; reads = []
        if (definition.source === 'purchase_order') original = { purchase_order: { id: task.source_id, purchase_order_no: task.source_no, supplier_id: 1, supplier_snapshot: { id: 1, code: 'SUP-STYLE-L1', name: '样式供应商' }, currency: 'CNY', purchase_date: 1793030400, lifecycle_status: 'draft', version: 1, item_count: 1, payment_method: '货到付款', payment_term_days: 0, invoice_required: false }, purchase_order_items: [{ id: 11, purchase_order_id: task.source_id, line_no: 1, line_status: 'open', material_id: 1, unit_id: 1, purchased_quantity: '20', unit_price: '3.5', amount: '70', material_code_snapshot: 'MAT-STYLE-L1', material_name_snapshot: '样式材料', expected_arrival_date: 1793116800 }] }
        if (definition.source === 'outsourcing_order') original = { outsourcing_order: { id: task.source_id, outsourcing_order_no: task.source_no, supplier_id: 1, currency: 'CNY', lifecycle_status: 'draft', version: 1, item_count: 1, order_date: 1790085600, expected_return_date: 1790690400, payment_term_days: 0, contract_party_snapshot: { buyerCompany: '模拟委托单位', buyerContact: '模拟联系人', buyerPhone: '000-00000000', buyerAddress: '模拟委托地址' }, supplier_snapshot: { name: '模拟加工厂', contact_name: '模拟联系人', contact_phone: '000-00000000', address: '模拟加工地址' } }, outsourcing_order_items: [{ id: 11, outsourcing_order_id: task.source_id, line_no: 1, subject_type: 'PRODUCT', product_id: 1, product_sku_id: 1, unit_id: 1, product_name_snapshot: '模拟玩具', outsourcing_quantity: '20', unit_price: '2', processing_item: '车缝', process_id: 1, line_status: 'open' }] }
        if (definition.source === 'shipment') original = { shipment: { id: task.source_id, shipment_no: task.source_no, status: 'DRAFT', version: 1, finance_release_status: 'PENDING', finance_release_version: 1, sales_order_id: 1, customer_id: 1, customer_snapshot: '模拟客户', currency: 'CNY', planned_ship_at: 1793116800, shipping_mark: '本次唛头', items: [{ id: 11, shipment_id: task.source_id, sales_order_item_id: 1, product_id: 1, product_sku_id: 1, warehouse_id: 1, unit_id: 1, lot_id: 1, quantity: '10', unit_net_weight_g_snapshot: null, note: '原始出货明细' }] } }
        page.on('response', async (response) => {
          if (!response.url().endsWith(`/rpc/${definition.rpc}`) || response.request().postDataJSON()?.method !== definition.get || original) return
          const body = await response.json()
          if (body.result?.data?.[definition.root]) original = structuredClone(body.result.data)
        })
        await page.route(`**/rpc/${definition.rpc}`, async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          reads.push({ method, params })
          if (method === definition.save) {
            const record = stored || original[definition.root]
            assert.equal(params.expected_version, record.version)
            assert.equal(params.id || params.production_order_id, task.source_id)
            assert.equal(params.note, '当前任务保存的完整编辑备注')
            assert.equal(params.items[0][definition.quantity], '21')
            assert.ok(params.items.every((item) => Number(item.unit_id) > 0))
            writes.push({ method, params })
            stored = { ...record, note: params.note, version: record.version + 1 }
            const oldLines = original[definition.lines] || original[definition.root]?.items || []
            lines = params.items.map((item, index) => ({ ...oldLines[index], ...item, id: ['production_order', 'shipment'].includes(definition.source) ? 9001 + index : item.id || oldLines[index]?.id || 901 + index }))
            if (definition.source === 'shipment') return reply(route, id, { shipment: { ...stored, items: lines } })
            return reply(route, id, { ...original, [definition.root]: stored, [definition.lines]: lines })
          }
          const lifecycleStatus = {
            submit_outsourcing_order: 'submitted',
            confirm_outsourcing_order: 'confirmed',
            release_production_order: 'RELEASED',
          }[method]
          if (stored && lifecycleStatus) {
            assert.equal(params.expected_version, stored.version, 'lifecycle uses the freshly saved version')
            assert.equal(params.id || params.production_order_id, task.source_id)
            if (definition.source === 'outsourcing_order') assert.ok(params.idempotency_key)
            writes.push({ method, params })
            stored = { ...stored, [definition.source === 'production_order' ? 'status' : 'lifecycle_status']: lifecycleStatus, version: stored.version + 1 }
            return reply(route, id, { ...original, [definition.root]: stored, [definition.lines]: lines })
          }
          if (stored && method === `list_${definition.source}s`) return reply(route, id, stylePaginatedRpcData([stored], `${definition.source}s`, params))
          if (original && !stored && ['purchase_order', 'outsourcing_order', 'shipment'].includes(definition.source)) {
            if (method === definition.get) return reply(route, id, { [definition.root]: original[definition.root] })
            if (method === `list_${definition.source}s`) return reply(route, id, stylePaginatedRpcData([original[definition.root]], `${definition.source}s`, params))
            if (method === `list_${definition.lines}`) return reply(route, id, stylePaginatedRpcData(original[definition.lines], definition.lines, params))
          }
          if (stored && method === definition.get) return reply(route, id, definition.source === 'shipment' ? { shipment: { ...stored, items: lines } } : { ...original, [definition.root]: stored, [definition.lines]: lines })
          if (stored && method === `list_${definition.lines}`) return reply(route, id, stylePaginatedRpcData(lines, definition.lines, params))
          return route.fallback()
        })
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (params.owner_type !== definition.source) return route.fallback()
          assert.equal(params.owner_id, task.source_id)
          if (method === 'list_attachments') return reply(route, id, { attachments: files })
          if (method === 'upload_attachment') {
            const file = { ...params, id: 6001, created_at: 1793030400, sha256: 'a'.repeat(64), file_size: Buffer.from(params.content_base64, 'base64').length }
            files.push(file); return reply(route, id, { attachment: file })
          }
          return route.fallback()
        })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'get_task') return reply(route, id, { task })
          if (method === 'explain_action_access') return reply(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true }] })
          if (method === 'list_task_events') return reply(route, id, { items: [], truncated: false, total: 0, limit: 100 })
          return route.fallback()
        })
      },
      verify: async (page) => {
        try {
        page.setDefaultTimeout(10000)
        await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
        const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
        await steps.getByRole('tab').nth(1).click()
        const editor = page.locator('[data-business-form-page]').filter({ has: page.getByRole('heading', { name: definition.title, exact: true }) }).last()
        await editor.waitFor()
        await page.waitForFunction((title) => [...document.querySelectorAll('[data-business-form-page]')].some((node) => node.getAttribute('aria-label') === title && node.getAttribute('aria-busy') === 'false'), definition.title)
        await assertBusinessFormNavigationSurface(page, editor)
        await writeFile(path.join(outputDir, `source-${definition.source}-initial.json`), JSON.stringify({ original, reads, fields: await editor.locator('input,textarea').evaluateAll((nodes) => nodes.map((node) => ({ id: node.id, value: node.value, disabled: node.disabled }))) }, null, 2))
        const instance = await editor.elementHandle()
        const term = editor.getByLabel('付款周期（天）', { exact: true }).filter({ visible: true })
        if (await term.count() && !(await term.inputValue())) await term.fill('0')
        const date = editor.getByLabel('下单日期', { exact: true }).filter({ visible: true })
        if (await date.count()) assert.ok(await date.inputValue(), 'existing document date is read back before editing')
        await editor.getByLabel('备注', { exact: true }).filter({ visible: true }).last().fill('当前任务保存的完整编辑备注')
        const quantity = editor.locator(`input[id$="_0_${definition.quantity}"]`).or(editor.getByLabel(definition.quantityLabel, { exact: true }).first()).first()
        await quantity.fill('21')
        const panel = editor.locator('.business-attachment-panel').first()
        if (await panel.count()) {
          const expand = panel.getByRole('button', { name: /展开附件$/u })
          if (await expand.count()) await expand.click()
          const [chooser] = await Promise.all([page.waitForEvent('filechooser'), panel.getByRole('button', { name: '选择附件', exact: true }).click()])
          await chooser.setFiles({ name: '本次办理依据.txt', mimeType: 'text/plain', buffer: Buffer.from('task source evidence') })
        }
        await page.locator('.mobile-task-business-action-host').getByRole('button', { name: '保存草稿', exact: true }).click()
        await page.waitForFunction(() => [...document.querySelectorAll('[data-handler-mode]')].some((node) => node.dataset.resultState === 'ready'))
        assert.equal(writes.length, 1, `${definition.source}: one aggregate save`)
        assert.equal(await editor.evaluate((node, previous) => node === previous, instance), true, 'save retains the original editor')
        assert.equal(await editor.getByLabel('备注', { exact: true }).filter({ visible: true }).last().inputValue(), stored.note)
        assert.equal(await quantity.inputValue(), '21')
        if (await panel.count()) { assert.equal(files.length, 1); assert.equal(files[0].owner_id, task.source_id) }
        assert.equal(task.task_status_key, 'ready', 'draft persistence cannot complete the workflow task')
        await steps.getByRole('tab').nth(2).click()
        await page.getByTestId('workflow-task-action-receipt').filter({ visible: true }).getByText(definition.result, { exact: true }).waitFor()
        await steps.getByRole('tab').nth(1).click()
        assert.equal(await quantity.inputValue(), '21')
        if (['production_order', 'shipment'].includes(definition.source)) {
          const sourceLines = original[definition.lines] || original[definition.root].items
          assert.equal(writes[0].params.items[0].sales_order_item_id, sourceLines[0].sales_order_item_id, 'aggregate replacement preserves the source order relationship')
          assert.equal(writes[0].params.items[0].id, undefined, 'draft replacement uses the existing aggregate contract')
        } else assert.equal(writes[0].params.items[0].id, lines[0].id, 'editing preserves authoritative line identity')
        if (['production_order', 'outsourcing_order'].includes(definition.source)) {
          const actionLabel = definition.source === 'production_order' ? '发布' : '提交合同'
          const actionHost = page.locator('.mobile-task-business-action-host')
          const action = actionHost.getByRole('button', { name: actionLabel, exact: true })
          assert.equal(await action.count(), 1, 'the current source action appears once in the native editor footer')
          assert.equal(await action.isEnabled(), true)
          await quantity.fill('22')
          assert.equal(await action.isDisabled(), true, 'publishing cannot bypass unsaved line changes')
          await quantity.fill('21')
          await page.waitForFunction(() => !document.querySelector('[data-business-form-page][data-unsaved="true"]'))
          await action.click()
          const confirmation = page.getByRole('dialog').filter({ hasText: definition.source === 'production_order' ? '确认发布生产订单？' : '确认提交加工合同' })
          await confirmation.getByRole('button', { name: definition.source === 'production_order' ? '确认发布' : '确认提交', exact: true }).click()
          await editor.waitFor({ state: 'hidden' })
          await page.waitForFunction(() => [...document.querySelectorAll('[data-handler-mode]')].some((node) => node.dataset.resultState === 'ready'))
          assert.equal(writes[1].method, definition.source === 'production_order' ? 'release_production_order' : 'submit_outsourcing_order')
          assert.equal(stored[definition.source === 'production_order' ? 'status' : 'lifecycle_status'], definition.source === 'production_order' ? 'RELEASED' : 'submitted')
          if (definition.source === 'outsourcing_order') {
            await actionHost.getByRole('button', { name: '确认下单', exact: true }).click()
            await page.locator('.ant-modal-confirm').filter({ hasText: '确认下单' }).getByRole('button', { name: '确认下单', exact: true }).click()
            await page.waitForFunction(() => !document.querySelector('.ant-btn-loading'))
            assert.equal(writes[2].method, 'confirm_outsourcing_order')
            assert.equal(stored.lifecycle_status, 'confirmed')
          }
          assert.equal(task.task_status_key, 'ready', 'a business status transition does not invent workflow task completion')
          await steps.getByRole('tab').nth(2).click()
          const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
          await receipt.getByText(definition.source === 'production_order' ? '生产订单已发布，排产确认已进入 PMC 待办' : '确认下单成功', { exact: true }).waitFor()
          await steps.getByRole('tab').nth(1).click()
          assert.equal(await editor.isVisible(), false, 'the published source is displayed read-only after its lifecycle change')
          assert.ok(reads.some(({ method }) => method === definition.get), 'canonical source data is read back after the transition')
        }
        await assertNoHorizontalOverflow(page, `source-save-${definition.source}`)
        await page.screenshot({ path: path.join(outputDir, `task-source-editor-save-${definition.source}.png`) })
        await writeFile(path.join(outputDir, `task-source-editor-save-${definition.source}.json`), JSON.stringify({ writes, stored, lines, attachmentOwners: files.map((file) => ({ owner_type: file.owner_type, owner_id: file.owner_id, file_name: file.file_name, file_size: file.file_size })) }, null, 2))
        } catch (error) {
          await writeFile(path.join(outputDir, `source-${definition.source}-errors.json`), JSON.stringify({ notices: await page.evaluate(() => window.__sourceNotices), invalid: await page.locator('[aria-invalid="true"]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.id, label: node.closest('.ant-form-item')?.textContent }))), errors: page.taskUnifiedErrors, reads, writes, text: (await page.locator('body').innerText()).slice(-3500) }, null, 2))
          throw error
        }
      },
    }
  })
}
