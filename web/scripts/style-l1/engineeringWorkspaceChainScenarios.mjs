import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { assertBusinessFormNavigationSurface } from './businessFormSectionAssertions.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'

const IMAGE = readFileSync(new URL('../../../scripts/qa/fixtures/manual-acceptance-image.png', import.meta.url))
const PRODUCT = { code: 'NEW-WORKSPACE-P', name: '新开发玩偶', style_no: '27027#', customer_style_no: 'CUSTOMER-NEW', english_name: 'New plush', hs_code: '950300', default_unit_id: 1, unit_net_weight_g: '125.125' }
const SKU = { product_id: 71, sku_code: 'NEW-WORKSPACE-SKU', sku_name: '蓝色30cm', barcode: '12345678', customer_sku: 'C-SKU', color: '蓝色', color_no: 'B01', size: '30cm', packaging_version: 'PK-V1', default_unit_id: 1, unit_net_weight_g: '125.125' }
const LABELS = { code: '产品编号（自动）', name: '产品名称', style_no: '内部款号', customer_style_no: '客户款号', english_name: '英文品名', hs_code: '海关编码（HS Code）', unit_net_weight_g: '产品单重（净重）', sku_code: 'SKU 编号（自动）', sku_name: 'SKU 名称', barcode: '条码', customer_sku: '客户 SKU', color: '颜色', color_no: '色号', size: '尺码', packaging_version: '包装版本' }
const permissions = ['workflow.task.read', 'workflow.task.complete', 'sales_order.read', 'sales_order.item.read', 'sales_order.engineering.update', 'engineering.material.submit', 'engineering.material.read', 'product.read', 'product.create', 'product.update', 'product_sku.read', 'product_sku.create', 'product_sku.update', 'material.read', 'bom.read', 'bom.create', 'bom.update', 'bom.activate']
const reply = (route, id, data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })

async function setTextFields(editor, values, excluded = []) {
  for (const [key, value] of Object.entries(values)) {
    if (key.endsWith('_id') || excluded.includes(key)) continue
    const label = key === 'unit_net_weight_g' && values.sku_code ? 'SKU 单重（净重）' : LABELS[key]
    await editor.getByLabel(label, { exact: true }).fill(value)
  }
}

async function prepareBOM(page) {
  const bomEditor = page.locator('.erp-bom-editor:visible')
  await assertBusinessFormNavigationSurface(page, bomEditor)
  await bomEditor.getByLabel('BOM 版本', { exact: true }).fill('NEW-WORKSPACE-BOM')
  for (const [label, value] of Object.entries({ 备品: '2', 设计师: '工程甲', 制表人: '制表乙', 审核人: '审核丙', 毛向: '向下' })) await bomEditor.getByLabel(label, { exact: true }).fill(value)
  const importWorkbook = async () => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), bomEditor.getByRole('button', { name: '从 Excel 导入', exact: true }).click()])
    await chooser.setFiles({ name: '本次用料.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture() })
    return page.getByRole('dialog', { name: '导入材料明细', exact: true })
  }
  let preview = await importWorkbook()
  await preview.getByRole('button', { name: '取消', exact: true }).click()
  if (await bomEditor.getByRole('combobox', { name: '物料名称 2', exact: true }).count()) throw new Error('取消导入改变了明细')
  preview = await importWorkbook()
  await preview.getByRole('button', { name: '带入并核对', exact: true }).click()
  await bomEditor.getByRole('button', { name: '撤销本次导入', exact: true }).click()
  if (await bomEditor.getByRole('combobox', { name: '物料名称 2', exact: true }).count()) throw new Error('撤销未恢复原明细')
  preview = await importWorkbook()
  await preview.getByRole('button', { name: '带入并核对', exact: true }).click()
  const secondMaterial = bomEditor.getByRole('combobox', { name: '物料名称 2', exact: true })
  await preview.waitFor({ state: 'hidden' })
  await secondMaterial.click()
  await secondMaterial.fill('样式材料')
  await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '样式材料' }).first().click()
  return bomEditor
}

export function createEngineeringWorkspaceChainScenarios(deps, existing) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  return [{ key: 'admin' }, { key: 'handler', ordinary: true }, { key: 'image-retry', ordinary: true, retry: true }, { key: 'link-retry', ordinary: true, linkRetry: true }, { key: 'revision', ordinary: true, revision: true }, { key: 'revision-mobile', mobile: true, revision: true }, { key: 'mobile', mobile: true }, { key: 'no-create', ordinary: true, deny: true }].map((definition) => {
    const base = existing.find((entry) => entry.name === `task-unified-authoring-${definition.mobile ? 'mobile' : 'desktop'}`)
    const task = { ...base.workflowTaskFixtures[0], version: 1 }
    if (definition.revision) Object.assign(task, { task_group: 'engineering_material_revision', task_name: '修订退回的工程用料', task_code: 'source-material-revision-74', source_type: 'engineering_material_request', source_id: 74, required_capability_key: 'engineering.material.submit', owner_role_key: 'engineering', process_instance_id: null, process_node_instance_id: null, payload: { sales_order_id: 1, engineering_material_request_id: 74, source_task_contract: 'workflow.source-task/v1', source_task_producer: 'engineering_material_request.approval', source_task_intent_hash: 'a'.repeat(64) } })
    let order; let row; let product; let sku; let bom; let request; let files; let calls; let
imageAttempts
    const granted = permissions.filter((permission) => !definition.deny || !['product.create', 'product_sku.create', 'bom.create'].includes(permission))
    return {
      ...base,
      name: `engineering-workspace-chain-${definition.key}`,
      workflowTaskFixtures: [task],
      ...(definition.ordinary ? {
        adminProfile: { is_super_admin: false,
roles: [{ role_key: 'engineering', name: '工程' }],
permissions: granted,
menus: [
          { key: 'task-board', path: '/erp/task-board', label: '任务管理', required_any: ['workflow.task.read'], required_all: [] },
          { key: 'sales-orders', path: '/erp/sales/project-orders/sales-orders', label: '销售订单', required_any: ['sales_order.read'], required_all: [] },
          { key: 'material-bom', path: '/erp/purchase/material-bom', label: '物料清单（BOM）', required_any: ['bom.read'], required_all: [] },
        ] },
        effectiveSession: { ...base.effectiveSession, roles: ['engineering'], workPools: ['engineering'], pages: ['task-board', 'sales-orders', 'material-bom'], actions: granted, workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['engineering'] } },
      } : {}),
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        calls = []; files = []; product = null; sku = null; bom = null; request = null; imageAttempts = 0
        task.task_status_key = 'ready'; task.version = 1; task.completed_at = null
        order = { id: 1, order_no: task.source_no, lifecycle_status: 'active', version: 1, customer_id: 1, currency: 'CNY' }
        row = { id: 11, sales_order_id: 1, line_no: 1, line_status: 'open', order_category: 'NEW', product_id: null, product_sku_id: null, bom_id: null, unit_id: 1, requested_product_name: PRODUCT.name, customer_product_no: PRODUCT.customer_style_no, ordered_quantity: '100', pre_shipment_sample_quantity: '2', quantity: '100' }
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_products') return reply(route, id, stylePaginatedRpcData(product ? [product] : [], 'products', params))
          if (method === 'list_product_skus') return reply(route, id, stylePaginatedRpcData(sku ? [sku] : [], 'product_skus', params))
          if (['create_product', 'update_product', 'create_product_sku', 'update_product_sku'].includes(method)) {
            assert.ok(!definition.mobile && !definition.deny, 'read-only or missing-create cannot write')
            calls.push({ method, params })
            if (method.endsWith('_sku')) {
              assert.deepEqual(params, { ...(method.startsWith('update') ? { id: 72 } : {}), ...SKU })
              sku = { id: 72, active: true, ...params }; return reply(route, id, { product_sku: sku })
            }
            assert.deepEqual(params, { ...(method.startsWith('update') ? { id: 71 } : {}), ...PRODUCT })
            product = { id: 71, active: true, ...params }; return reply(route, id, { product })
          }
          return route.fallback()
        })
        await page.route('**/rpc/bom', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_bom_versions') return reply(route, id, stylePaginatedRpcData(bom ? [bom] : [], 'bom_versions', params))
          if (method === 'get_bom_version') { assert.equal(params.id, 73); return reply(route, id, { bom_version: bom, bom_items: bom.items }) }
          if (method === 'save_bom_with_items') {
            assert.equal(params.product_id, 71); assert.equal(params.source_order_no, order.order_no)
            assert.equal(params.quantity_text, '102'); assert.equal(params.version, 'NEW-WORKSPACE-BOM')
            assert.equal(params.designer, '工程甲'); assert.equal(params.maker, '制表乙'); assert.equal(params.auditor, '审核丙'); assert.equal(params.hair_direction, '向下'); assert.equal(params.spare_text, '2')
            assert.equal(params.items.length, 2); assert.ok(params.items.every((item) => item.material_id > 0 && item.unit_id > 0 && Number(item.quantity) > 0))
            calls.push({ method, params })
            bom = { ...params, id: 73, status: 'DRAFT', edit_version: (bom?.edit_version || 2000000000000) + 1, item_count: params.items.length, items: params.items.map((item, index) => ({ ...item, id: 730 + index })) }
            return reply(route, id, { bom_version: bom })
          }
          if (method === 'activate_bom_version') { assert.equal(params.id, 73); calls.push({ method, params }); bom = { ...bom, status: 'ACTIVE', edit_version: bom.edit_version + 1 }; return reply(route, id, { bom_version: bom }) }
          return route.fallback()
        })
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_product_image_references') return reply(route, id, { images: params.product_ids.map((productID) => ({ product_id: productID, image_attachment_id: files.find((file) => file.owner_type === 'product' && file.owner_id === productID)?.id || 0 })) })
          if (method === 'list_attachments') return reply(route, id, { attachments: files.filter((file) => file.owner_type === params.owner_type && file.owner_id === params.owner_id) })
          if (method === 'download_attachment' && files.some((file) => file.id === params.id)) return reply(route, id, { attachment: files.find((file) => file.id === params.id) })
          if (method === 'upload_attachment') {
            assert.ok(!definition.mobile && !definition.deny)
            if (params.owner_type === 'product') {
              assert.equal(params.owner_id, 71); assert.equal(params.attachment_type, 'product_image'); assert.equal(params.slot_key, 'primary')
              imageAttempts += 1
              if (definition.retry && imageAttempts === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '模拟图片存储暂不可用' } } })
            } else { assert.equal(params.owner_type, 'product_sku'); assert.equal(params.owner_id, 72) }
            const file = { ...params, id: 800 + files.length, file_size: Buffer.from(params.content_base64, 'base64').length, sha256: 'b'.repeat(64), created_at: 1793030400 }
            files.push(file); calls.push({ method, params }); return reply(route, id, { attachment: file })
          }
          return route.fallback()
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'get_sales_order') return reply(route, id, { sales_order: order })
          if (method === 'list_sales_order_items') return reply(route, id, stylePaginatedRpcData([row], 'sales_order_items', params))
          if (method === 'save_sales_order_engineering') {
            assert.equal(params.expected_version, order.version)
            const value = params.items[0]; assert.equal(value.id, 11); assert.equal(value.product_id, 71); assert.equal(value.product_sku_id, null); assert.equal(value.bom_id, 73); assert.equal(value.expected_bom_version, bom.edit_version)
            assert.equal(Object.hasOwn(value, 'engineering_status'), false)
            calls.push({ method, params }); row = { ...row, ...value }; order = { ...order, version: order.version + 1 }
            if (params.complete === true) {
              bom = { ...bom, status: 'ACTIVE', edit_version: bom.edit_version + 1 }
              order.engineering_material_status = 'SUBMITTED'
              if (definition.revision) { task.task_status_key = 'done'; task.version += 1; task.completed_at = 1793030500 }
            }
            if (definition.linkRetry && calls.filter((call) => call.method === 'save_sales_order_engineering').length === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '模拟关联成功但响应丢失' } } })
            return reply(route, id, { sales_order_id: 1, version: order.version })
          }
          if (method === 'get_engineering_material_request') {
            if (definition.revision && !params.preview) {
              request ||= { id: 74, sales_order_id: 1, order_no: order.order_no, source_order_version: 1, version: 3, source_hash: 'a'.repeat(64), status: 'REJECTED', issues: [], sources: [{ sales_order_item_id: 11, line_no: 1, product_name: '原工程产品', bom_version: '原 BOM', bom_item_id: 10, material_id: 1, unit_id: 1, position: '身体', piece_count: '2', unit_usage: '.1', loss_rate: '.03', production_quantity: '102', total_usage: '10.506' }], purchase_orders: [], items: [{ id: 741, material_id: 1, unit_id: 1, supplier_id: 1, supplier_name: '模拟厂商', material_name: '原用料', unit_name: '米', required_quantity: '10.506' }] }
              return reply(route, id, request)
            }
            assert.equal(order.engineering_material_status, 'SUBMITTED')
            if (definition.revision && params.preview) request = null
            request ||= { id: 74, sales_order_id: 1, order_no: order.order_no, source_order_version: order.version, version: definition.revision ? 3 : 1, source_hash: 'a'.repeat(64), status: 'PREVIEW', issues: [], sources: [{ sales_order_item_id: 11, line_no: 1, product_name: product.name, bom_version: bom.version, bom_item_id: bom.items[0].id, material_id: 1, unit_id: 1, position: '身体', piece_count: '2', unit_usage: '.1', loss_rate: '.03', production_quantity: '102', total_usage: '10.506' }], purchase_orders: [], items: [{ id: 741, material_id: 1, unit_id: 1, supplier_id: 1, supplier_name: '模拟厂商', supplier_item_no: 'A10', material_name: '短绒', unit_name: '米', required_quantity: '10.506' }] }
            return reply(route, id, request)
          }
          if (method === 'submit_engineering_material_request') {
            assert.equal(params.sales_order_id, 1); assert.equal(params.expected_version, request.source_order_version); assert.equal(params.expected_source_hash, request.source_hash)
            if (definition.revision) { assert.equal(params.task_id, task.id); assert.equal(params.expected_task_version, task.version) }
            assert.equal(bom.status, 'ACTIVE'); calls.push({ method, params }); request = { ...request, status: 'SUBMITTED', version: definition.revision ? request.version + 1 : request.version }
            task.task_status_key = 'done'; task.version += 1; task.completed_at = 1793030500
            return reply(route, id, request)
          }
          return route.fallback()
        })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'complete_task_action') {
            assert.equal(params.expected_version, task.version); assert.ok(params.idempotency_key); assert.equal(order.engineering_material_status, 'SUBMITTED')
            calls.push({ method, params }); task.task_status_key = 'done'; task.version += 1; task.completed_at = 1793030500
            return reply(route, id, { task })
          }
          if (method === 'get_task') return reply(route, id, { task })
          if (method === 'get_task_process_context' && task.process_instance_id) {
            const node = { id: task.process_node_instance_id, process_instance_id: task.process_instance_id, node_key: 'engineering_data', node_type: 'domain_command', status: task.task_status_key === 'done' ? 'completed' : 'active', version: task.version, attempt: 1 }
            const approval = { id: 21, process_instance_id: task.process_instance_id, node_key: 'boss_review_material', node_type: 'approval', owner_role_key: 'boss', status: 'active', version: 1, attempt: 1 }
            return reply(route, id, { process_context: { source: { type: task.source_type, id: task.source_id, no: task.source_no }, process_instance: { id: task.process_instance_id, process_key: 'sales_order_acceptance', process_version: 'v1', status: 'active', started_at: 1793030000 }, linked_node: node, nodes: [node, approval], current_nodes: task.task_status_key === 'done' ? [approval] : [node], completed_nodes: task.task_status_key === 'done' ? [node] : [], current_responsibilities: [] } })
          }
          if (method === 'list_task_events' && task.task_status_key === 'done') return reply(route, id, { items: [{ id: 991, task_id: task.id, event_type: 'status_changed', from_status_key: 'ready', to_status_key: 'done', actor_role_key: 'engineering', actor_display_name: '工程验收人', reason: '用料资料已提交老板审核', task_version: task.version, created_at: task.completed_at }], total: 1, limit: 40, truncated: false })
          return route.fallback()
        })
      },
      verify: async (page) => {
        page.setDefaultTimeout(10000)
        if (definition.mobile) await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
        const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
        await steps.getByRole('tab').nth(1).click()
        await page.locator('.erp-bom-editor:visible').waitFor()
        assert.equal(await page.getByRole('button', { name: /订单关联与打样|整理用料汇总|按当前资料重新整理|提交老板审核/u }).count(), 0)
        if (definition.mobile || definition.deny) {
          assert.equal(await page.getByRole('button', { name: '新建产品', exact: true }).count(), 0)
          assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).filter({ visible: true }).count(), 0)
          assert.deepEqual(calls, [])
          await assertNoHorizontalOverflow(page, `chain-${definition.key}`)
          return
        }
        await page.getByRole('button', { name: '新建产品', exact: true }).click()
        const productEditor = page.locator('[data-business-editor-pane="product"] [data-business-form-page]')
        await productEditor.getByLabel('产品编号（自动）', { exact: true }).waitFor()
        await page.waitForFunction(() => document.querySelector('[data-business-editor-pane="product"] [data-business-form-page]')?.getAttribute('aria-busy') === 'false')
        assert.equal(await productEditor.getAttribute('data-unsaved'), 'false', 'loading defaults must not fabricate edits')
        await assertBusinessFormNavigationSurface(page, productEditor)
        await setTextFields(productEditor, PRODUCT)
        const primary = productEditor.locator('.product-image-slot').filter({ hasText: '产品图 1（主图）' })
        const imageChoice = page.waitForEvent('filechooser', { timeout: 7000 })
        await primary.getByRole('button', { name: /选择图片/u }).click({ timeout: 6000 })
        const imageChooser = await imageChoice
        await imageChooser.setFiles({ name: '新产品主图.png', mimeType: 'image/png', buffer: IMAGE })
        await primary.getByText('保存产品后上传', { exact: true }).waitFor()
        await page.getByRole('button', { name: '保存产品', exact: true }).filter({ visible: true }).click()
        if (definition.retry) {
          await productEditor.getByText('产品已保存，图片尚未全部确认，请保留当前内容重试。', { exact: true }).waitFor()
          assert.equal(calls.filter((call) => call.method === 'create_product').length, 1)
          await page.getByRole('button', { name: '保存产品', exact: true }).filter({ visible: true }).click()
        }
          const bomEditor = await prepareBOM(page)
          await page.getByRole('button', { name: '保存草稿', exact: true }).filter({ visible: true }).click()
          if (definition.linkRetry) {
            await bomEditor.getByRole('button', { name: '重试保存', exact: true }).waitFor()
            assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
            await bomEditor.getByRole('button', { name: '重试保存', exact: true }).click()
          }
          await page.waitForFunction(() => document.querySelector('.erp-bom-editor')?.getAttribute('data-unsaved') === 'false' && document.querySelector('[data-handler-mode]')?.getAttribute('data-result-state') === 'ready')
          assert.equal(row.product_id, product.id)
          assert.equal(row.bom_id, bom.id)
          assert.equal(row.product_sku_id, null)
          assert.equal(calls.filter((call) => call.method === 'create_product').length, 1)
          assert.equal(calls.filter((call) => call.method === 'save_bom_with_items').length, 1)
          assert.equal(calls.filter((call) => call.method === 'save_sales_order_engineering').length, 1)
          assert.equal(calls.filter((call) => call.method === 'submit_engineering_material_request').length, 0)
          assert.equal(files[0].owner_id, product.id)
          assert.equal(task.task_status_key, 'ready')
        assert.equal(await page.getByRole('button', { name: /打样进度|启用 BOM/u }).count(), 0)
        await page.mouse.move(3800, 40)
        await page.screenshot({ path: path.join(outputDir, `engineering-workspace-chain-${definition.key}-editing.png`) })
        await page.getByRole('button', { name: '完成工程资料', exact: true }).filter({ visible: true }).click()
        await page.getByText('用料已自动送审', { exact: true }).waitFor()
        assert.equal(order.engineering_material_status, 'SUBMITTED')
        assert.equal(task.task_status_key, 'done')
        assert.equal(calls.filter((call) => call.method === 'complete_task_action').length, definition.revision ? 0 : 1)
        assert.equal(calls.filter((call) => call.method === 'submit_engineering_material_request').length, 0)
        assert.equal(calls.filter((call) => call.method === 'save_sales_order_engineering').length, 2)
        assert.equal(page.taskUnifiedMutations.filter((call) => /post_|create_purchase/u.test(call.method)).length, 0)
        await steps.getByRole('tab').nth(2).click()
        await page.getByTestId('workflow-task-action-receipt').getByText('工程资料已完成，用料已自动送审', { exact: false }).first().waitFor()
        await steps.getByRole('tab').nth(1).click()
        await bomEditor.getByRole('heading', { name: /查看 BOM 版本.*已启用/u }).waitFor()
        assert.equal(await bomEditor.getByLabel('BOM 版本', { exact: true }).inputValue(), 'NEW-WORKSPACE-BOM', 'automatic review and step changes must preserve the saved editor')
        assert.equal(await bomEditor.getByLabel('BOM 版本', { exact: true }).isDisabled(), true)
        await assertNoHorizontalOverflow(page, `chain-${definition.key}`)
        await page.screenshot({ path: path.join(outputDir, `engineering-workspace-chain-${definition.key}.png`) })
        await writeFile(path.join(outputDir, `engineering-workspace-chain-${definition.key}.json`), JSON.stringify({ calls, product, bom, order, files: files.map(({ content_base64: _contentBase64, ...file }) => file), imageAttempts }, null, 2))
      },
    }
  })
}
