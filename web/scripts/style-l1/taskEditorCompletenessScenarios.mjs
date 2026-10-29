import { writeFile } from 'node:fs/promises'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { describeVisibleEditor } from './businessEditorWorkspaceTools.mjs'
import { assertBusinessFormNavigationSurface } from './businessFormSectionAssertions.mjs'

const HEADERS = {
  version: 'BOM-完整编辑验证',
  quantity_text: '100',
  source_order_no: 'SO-STYLE-L1',
  spare_text: '5',
  designer: '工程设计员',
  maker: '工程制表员',
  auditor: '工程审核员',
  hair_direction: '单方向',
  note: '需要验证清空的原备注',
}
const FIELD_BY_KEY = { version: 'BOM 版本', quantity_text: '订单数量', source_order_no: '来源订单号', spare_text: '备品', designer: '设计师', maker: '制表人', auditor: '审核人', hair_direction: '毛向', note: '备注', effective_from: '参考适用开始', effective_to: '参考适用结束', print_date: '制表日期' }
const FIELD_LABELS = ['产品', 'BOM 版本', '订单数量', '参考适用开始', '参考适用结束', '来源订单号', '备品', '制表日期', '设计师', '制表人', '审核人', '毛向', '备注']
const DATES = { effective_from: '2026-10-01', effective_to: '2026-11-01', print_date: '2026-10-27' }
const READONLY_BOM_PERMISSIONS = ['workflow.task.read', 'workflow.task.update', 'workflow.task.complete', 'sales_order.read', 'sales_order.item.read', 'sales_order.engineering.update', 'product.read', 'product_sku.read', 'material.read', 'unit.read', 'bom.read']
const XLSX = { name: '任务材料明细.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture() }

async function assertEditorFooter(page, name, assert, path, outputDir) {
  await waitForFiniteAnimations(page)
  const footer = page.locator('.erp-task-action-drawer .ant-drawer-footer')
  const metrics = await footer.locator('button,[role="status"]').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().width > 0).map((node) => ({ text: node.textContent, tag: node.tagName, ...node.getBoundingClientRect().toJSON() })))
  const centers = metrics.map((item) => item.y + item.height / 2)
  const readonly = await page.locator('.erp-bom-editor:visible').getAttribute('data-readonly') === 'true'
  if (readonly) {
    assert.ok(centers.length >= 1, 'a readonly footer preserves its authorized resource action')
    assert.equal(await footer.locator('.erp-business-form-page__actions button').count(), 0, 'readonly business editors publish no write action')
  } else {
    assert.ok(centers.length >= 2, 'a writable footer retains its save action and task resources')
    assert.ok(metrics.some((item) => item.text === '保存草稿'))
  }
  assert.ok(Math.max(...centers) - Math.min(...centers) <= 1, 'source editor actions and save feedback share one aligned row')
  const height = await footer.evaluate((node) => node.getBoundingClientRect().height)
  assert.ok(height <= 76, 'a desktop footer does not inherit the mobile two-row form layout')
  await writeFile(path.join(outputDir, `${name}-footer.json`), JSON.stringify({ metrics, height }, null, 2))
  await footer.screenshot({ path: path.join(outputDir, `${name}-footer.png`) })
}

async function openEditor(page, { entry, task }, assert) {
  if (entry === 'business') {
    await page.getByRole('cell').getByText(HEADERS.version, { exact: true }).dblclick()
  } else {
    if (entry === 'mobile') await page.getByTestId('mobile-role-nav-tasks').click()
    await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
    await page.getByRole('tablist', { name: '任务处理步骤', exact: true }).getByRole('tab').nth(1).click()
    const workspace = page.locator('[data-business-editor-workspace]:visible')
    await workspace.locator('.erp-bom-editor:visible').getByLabel('BOM 版本', { exact: true }).waitFor()
    assert.equal(await workspace.getByRole('tablist').count(), 0, 'related business objects are not a permanent second tab strip')
    assert.equal(await workspace.locator('[data-business-editor-pane="bom"]:visible').count(), 1, 'engineering tasks open the original complete BOM editor directly')
    assert.equal(await workspace.locator('[data-business-editor-pane="product"], [data-business-editor-pane="sku"]').count(), 0, 'related product editors remain on demand')
    assert.equal(await workspace.locator('.erp-sales-order-engineering-form:visible').count(), 0, 'the association and sampling supplement does not replace BOM authoring')
    assert.equal(await workspace.getByRole('button', { name: /^订单关联与打样|整理用料汇总/u }).count(), 0)

  }
  const editor = page.locator('.erp-bom-editor:visible')
  await editor.getByLabel('BOM 版本', { exact: true }).waitFor()
  await waitForFiniteAnimations(page)
  return editor
}

async function chooseImport(page, editor) {
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    editor.getByRole('button', { name: '从 Excel 导入', exact: true }).click(),
  ])
  await chooser.setFiles(XLSX)
  const preview = page.getByRole('dialog', { name: '导入材料明细', exact: true })
  await preview.waitFor()
  return preview
}

async function expandAttachments(editor) {
  const panel = editor.locator('.business-attachment-panel')
  const toggle = panel.getByRole('button', { name: /展开附件$/u })
  if (await toggle.count()) await toggle.click()
  return panel
}

export function createTaskEditorCompletenessScenarios(deps, taskScenarios) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  return [
    { key: 'business', entry: 'business' },
    { key: 'task', entry: 'task' },
    { key: 'task-dark', entry: 'task', themeMode: 'dark' },
    { key: 'mobile', entry: 'mobile', readonly: true },
    { key: 'mobile-owner', entry: 'mobile', readonly: true, ownerComplete: true },
    { key: 'no-bom-update', entry: 'task', readonly: true, denyUpdate: true },
    { key: 'attachment-retry', entry: 'task', retryUpload: true },
    { key: 'save-retry', entry: 'task', retrySave: true },
  ].map((definition) => {
    const base = taskScenarios.find((item) => item.name === `task-unified-authoring-${definition.entry === 'mobile' ? 'mobile' : 'desktop'}`)
    const task = base.workflowTaskFixtures[0]
    const rolePermissions = [...READONLY_BOM_PERMISSIONS, ...(definition.ownerComplete ? ['bom.update', 'mobile.engineering.access'] : [])]
    let record
    let files
    let calls
    let uploads
    return {
      ...base,
      name: `task-editor-bom-${definition.key}`,
      themeMode: definition.themeMode || base.themeMode,
      path: definition.entry === 'business' ? '/erp/purchase/material-bom?product_id=1' : definition.ownerComplete ? '/m/engineering/tasks' : base.path,
      ...(definition.denyUpdate || definition.ownerComplete ? {
        adminProfile: { is_super_admin: false,
roles: [{ role_key: 'engineering', name: '工程' }],
permissions: rolePermissions,
menus: [
          { key: 'task-board', path: '/erp/task-board', label: '任务管理', required_any: ['workflow.task.read'], required_all: [] },
          { key: 'material-bom', path: '/erp/purchase/material-bom', label: '物料清单（BOM）', required_any: ['bom.read'], required_all: [] },
          { key: 'sales-orders', path: '/erp/sales/project-orders/sales-orders', label: '销售订单', required_any: ['sales_order.read'], required_all: [] },
        ] },
        effectiveSession: { ...base.effectiveSession, roles: ['engineering'], workPools: ['engineering'], pages: ['task-board', 'material-bom', 'sales-orders'], actions: rolePermissions, workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['engineering'] } },
      } : {}),
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        if (definition.ownerComplete) { await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'explain_action_access') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: true, owner_role_matched: true, required_permission: 'sales_order.engineering.update' }] } } } })
        }) }
        record = { id: 2, product_id: 1, status: 'DRAFT', edit_version: 2000000000000, ...HEADERS, effective_from: 1790784000, effective_to: 1793462400, print_date: 1793030400, item_count: 1, items: [{ id: 11, bom_header_id: 2, material_id: 1, unit_id: 1, quantity: '0.125', loss_rate: '0.03', position: '身体', piece_count: '2', process_base: '贴衬', process_method: '车缝', note: '原材料明细' }] }
        files = []
        calls = []
        uploads = 0
        await page.route('**/rpc/bom', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'list_bom_versions') data = stylePaginatedRpcData([record], 'bom_versions', params)
          else if (method === 'get_bom_version') { assert.equal(params.id, 2); data = { bom_version: record, bom_items: record.items } }
          else if (method === 'save_bom_with_items') {
            assert.equal(definition.readonly, undefined, 'read-only entries must never save')
            assert.equal(params.id, 2)
            assert.equal(params.product_id, 1)
            assert.equal(params.expected_version, record.edit_version)
            calls.push({ method, params })
            if (definition.retrySave && calls.length === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '模拟 BOM 保存暂时失败' } } })
            // Aggregate saves clear omitted optional values (inventory_repo_bom_fields.go).
            record = { ...record, ...params, ...Object.fromEntries(Object.keys(DATES).map((field) => [field, params[field] ? Date.parse(`${params[field]}T00:00:00+08:00`) / 1000 : null])), note: params.note ?? null, edit_version: record.edit_version + 1 }
            data = { bom_version: record, bom_items: record.items }
          } else return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        })
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (params.owner_type !== 'bom_header') return route.fallback()
          assert.equal(params.owner_id, 2, 'BOM attachments must not bind to the workflow task or another BOM')
          let data
          if (method === 'list_attachments') data = { attachments: files }
          else if (method === 'upload_attachment') {
            assert.equal(definition.readonly, undefined)
            uploads += 1
            if (definition.retryUpload && uploads === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '模拟附件暂时不可用' } } })
            const attachment = { ...params, id: 8100 + uploads, sha256: 'a'.repeat(64), file_size: Buffer.from(params.content_base64, 'base64').length, uploaded_by: 1, uploaded_by_username: '工程验收账号', created_at: 1793030400 }
            files.push(attachment)
            data = { attachment }
          } else return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        })
      },
      verify: async (page) => {
        let editor = await openEditor(page, { ...definition, task }, assert)
        await assertBusinessFormNavigationSurface(page, editor)
        const fieldset = await editor.locator('.ant-form-item-label label').evaluateAll((nodes) => nodes.map((node) => node.textContent.trim()))
        for (const label of FIELD_LABELS) assert.ok(fieldset.includes(label), `complete BOM header includes ${label}`)
        for (const [field, value] of Object.entries(HEADERS)) assert.equal(await editor.getByLabel(FIELD_BY_KEY[field], { exact: true }).inputValue(), value, field)
        for (const [field, value] of Object.entries(DATES)) assert.equal(await editor.getByLabel(FIELD_BY_KEY[field], { exact: true }).inputValue(), value.replaceAll('-', '/'), field)
        for (const [label, value] of Object.entries({ '部位 1': '身体', '片数 1': '2', '单位用量 1': '0.125', '损耗 % 1': '3', '加工基础 1': '贴衬', '加工方式 1': '车缝', '备注 1': '原材料明细' })) assert.equal(await editor.getByLabel(label, { exact: true }).inputValue(), value, label)
        if (definition.themeMode === 'dark') await deps.assertDarkThemeContrast(page, { scenarioName: 'task-editor-bom-task-dark', selector: '.erp-bom-editor:not([hidden])' })
        if (definition.entry === 'task') await assertEditorFooter(page, `task-editor-bom-${definition.key}-pristine`, assert, path, outputDir)
        await page.screenshot({ path: path.join(outputDir, `task-editor-bom-${definition.key}-editing.png`) })
        if (definition.entry === 'task') {
          const geometry = await page.locator('.ant-drawer-content-wrapper:visible').evaluate((node) => ({ width: node.getBoundingClientRect().width, viewport: innerWidth }))
          assert.ok(geometry.width >= geometry.viewport - 25, 'complex editors receive the available desktop workspace')
          await editor.getByRole('heading', { name: definition.readonly ? /查看 BOM 版本/u : /编辑 BOM 草稿/u }).waitFor()
        }
        const navigation = editor.getByRole('navigation', { name: '表单分区', exact: true })
        await navigation.waitFor()
        const sections = ['版本信息', '材料分析明细表', '订单与制表资料', '备注与附件']
        assert.deepEqual(await navigation.locator('.erp-business-form-page__section-links button').allTextContents(), sections, 'all entries use the original complete BOM directory')
        await writeFile(path.join(outputDir, `task-editor-bom-${definition.key}-editor-structure.json`), JSON.stringify(await describeVisibleEditor(editor), null, 2))
        if (definition.entry !== 'business') {
          const workspace = page.locator('[data-business-editor-workspace]')
          assert.equal(await workspace.locator('[data-business-form-page]').filter({ visible: true }).count(), 1, 'one complete editor is presented at a time')
          assert.equal(await workspace.locator('.erp-business-form-page__header').filter({ visible: true }).count(), 1, 'editor chrome is not nested')
          const instance = await editor.elementHandle()
          if (definition.entry === 'task') await navigation.getByRole('button', { name: '订单与制表资料', exact: true }).click()
          else {
            await navigation.locator('.erp-business-form-page__section-picker .ant-select-selector').click()
            await page.getByRole('option', { name: '订单与制表资料', exact: true }).click()
          }
          await waitForFiniteAnimations(page)
          const position = await editor.getByLabel('参考适用开始', { exact: true }).evaluate((node) => {
            const scroller = node.closest('.mobile-role-tasks-page__detail-main, .ant-drawer-body')
            const workspaceNavigation = node.closest('[data-business-editor-workspace]').querySelector('[data-business-editor-navigation]')
            const picker = node.closest('[data-business-form-page]').querySelector('.erp-business-form-page__section-picker')
            const r = node.getBoundingClientRect()
            const footer = document.querySelector('.mobile-task-action-footer, .ant-drawer-footer')
            return { top: r.top, bottom: r.bottom, fixedBottom: workspaceNavigation.getBoundingClientRect().bottom + (picker.getClientRects().length ? picker.closest('nav').offsetHeight : 0), height: innerHeight, footerTop: footer?.getBoundingClientRect().top ?? innerHeight, scrollTop: scroller.scrollTop }
          })
          assert.ok(position.scrollTop > 0 && position.top >= position.fixedBottom && position.bottom <= position.height, 'the original section navigation reaches actual fields below the fixed controls')
          assert.ok(position.bottom <= position.footerTop, 'the fixed action footer does not cover the field reached by section navigation')
          await writeFile(path.join(outputDir, `task-editor-bom-${definition.key}-section-navigation.json`), JSON.stringify(position, null, 2))
          await assertBusinessFormNavigationSurface(page, editor)
          const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
          await steps.getByRole('tab').nth(0).click()
          await steps.getByRole('tab').nth(1).click()
          assert.equal(await editor.evaluate((node, previous) => node === previous, instance), true, 'task steps preserve the complete editor instance')
          assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), HEADERS.version)
          if (definition.entry === 'task') await navigation.getByRole('button', { name: '版本信息', exact: true }).click()
          else {
            await navigation.locator('.erp-business-form-page__section-picker .ant-select-selector').click()
            await page.getByRole('option', { name: '版本信息', exact: true }).click()
          }
          await waitForFiniteAnimations(page)
        }
        if (definition.readonly) {
          assert.equal(await editor.getByRole('button', { name: '从 Excel 导入', exact: true }).count(), 0)
          assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).filter({ visible: true }).count(), 0)
          assert.equal(await editor.locator('.ant-form .ant-select:not(.ant-select-disabled) [role="combobox"]').filter({ visible: true }).count(), 0, 'all source form selectors are read-only')
          const editable = await editor.locator('input,textarea').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length && !node.disabled && !node.readOnly && !node.closest('.ant-select-disabled')).map((node) => ({ id: node.id, type: node.type, label: node.getAttribute('aria-label'), placeholder: node.getAttribute('placeholder'), formField: Boolean(node.closest('.ant-form-item')), classes: node.className })))
          assert.deepEqual(editable.filter((field) => field.formField), [])
          assert.ok(editable.every((field) => field.type === 'range' && field.label === '横向滚动位置'), 'only the viewer scroll control remains interactive')
          const attachments = await expandAttachments(editor)
          assert.equal(await attachments.getByRole('button', { name: '选择附件', exact: true }).count(), 0)
          assert.deepEqual(calls, [])
          assert.equal(uploads, 0)
        } else {
          const save = async () => {
            await waitForFiniteAnimations(page)
            await page.getByRole('button', { name: '保存草稿', exact: true }).filter({ visible: true }).click()
          }
          await editor.getByLabel('BOM 版本', { exact: true }).fill('')
          if (definition.entry === 'task') await assertEditorFooter(page, `task-editor-bom-${definition.key}-dirty`, assert, path, outputDir)
          await save()
          await editor.getByText('请填写 BOM 版本', { exact: true }).waitFor()
          assert.equal(calls.length, 0, 'missing required fields cannot reach persistence')
          await editor.getByLabel('BOM 版本', { exact: true }).fill(HEADERS.version)
          let preview = await chooseImport(page, editor)
          await preview.getByRole('button', { name: '取消', exact: true }).click()
          assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 1)
          preview = await chooseImport(page, editor)
          await preview.getByRole('button', { name: '追加 2 个部位', exact: true }).click()
          assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 3)
          await editor.getByRole('button', { name: '撤销本次导入', exact: true }).click()
          assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 1)
          preview = await chooseImport(page, editor)
          await preview.getByRole('radio', { name: '替换现有 1 个部位', exact: true }).check()
          await preview.getByRole('button', { name: '替换并带入 2 个部位', exact: true }).click()
          assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 2)
          for (const [field, value] of Object.entries(HEADERS)) assert.equal(await editor.getByLabel(FIELD_BY_KEY[field], { exact: true }).inputValue(), value, `item import preserves ${field}`)
          await save()
          assert.equal(calls.length, 0, 'unresolved imported references cannot be silently saved')
          const material = editor.getByRole('combobox', { name: '物料名称 2', exact: true })
          await material.click()
          await material.fill('样式材料')
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '样式材料' }).first().click()
          await editor.getByLabel('备注', { exact: true }).fill('')
          const attachments = await expandAttachments(editor)
          const [chooser] = await Promise.all([page.waitForEvent('filechooser'), attachments.getByRole('button', { name: '选择附件', exact: true }).click()])
          await chooser.setFiles({ name: 'BOM-工艺依据.txt', mimeType: 'text/plain', buffer: Buffer.from('BOM evidence retained for the current record') })
          if (definition.retrySave) {
            const failedSave = page.waitForResponse((response) => response.url().includes('/rpc/bom') && response.request().postDataJSON()?.method === 'save_bom_with_items')
            await save()
            await failedSave
            await page.waitForFunction(() => document.querySelector('.erp-bom-editor:not([hidden])')?.getAttribute('aria-busy') === 'false')
            assert.equal(calls.length, 1)
            assert.equal(uploads, 0, 'failed aggregate save retains pending attachments without uploading')
            assert.equal(await editor.getByLabel('备注', { exact: true }).inputValue(), '')
            assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 2)
            assert.equal(await page.getByRole('tablist', { name: '任务处理步骤', exact: true }).getByRole('tab').nth(2).isEnabled(), false)
          }
          await save()
          if (definition.retryUpload) {
            const failed = page.getByRole('dialog', { name: '部分附件上传失败', exact: true })
            await failed.getByText('BOM-工艺依据.txt', { exact: true }).waitFor()
            assert.equal(calls.length, 1, 'attachment failure must not repeat the aggregate save')
            await failed.getByRole('button', { name: /重试失败项/u }).click()
          }
          if (definition.entry === 'business') await editor.waitFor({ state: 'hidden' })
          else await page.waitForFunction(() => [...document.querySelectorAll('.erp-bom-editor')].some((node) => node.getClientRects().length && !node.closest('[hidden]') && node.getAttribute('aria-busy') === 'false' && node.getAttribute('data-unsaved') === 'false'))
          assert.equal(calls.length, definition.retrySave ? 2 : 1)
          if (definition.retrySave) assert.deepEqual(calls[0].params, calls[1].params, 'retry preserves the exact current draft and expected version')
          assert.equal(record.edit_version, 2000000000001, 'one aggregate update advances the stored version once')
          assert.equal(uploads, definition.retryUpload ? 2 : 1)
          const saved = calls[0].params
          for (const [field, value] of Object.entries(HEADERS)) if (field !== 'note') assert.equal(saved[field], value, `persisted ${field}`)
          for (const [field, value] of Object.entries(DATES)) assert.equal(saved[field], value, `persisted ${field}`)
          assert.equal(saved.note, undefined, 'clearing a header does not retain its old value')
          assert.equal(saved.items.length, 2)
          assert.equal(saved.items[0].material_id, 1)
          assert.equal(saved.items[0].quantity, '0.5')
          assert.equal(saved.items[0].loss_rate, '0.1')
          assert.ok(saved.items.every((item) => item.material_id === 1 && item.unit_id === 1))
          assert.equal(saved.items[0].process_base, '贴衬')
          assert.equal(saved.items[0].process_method, '激光')
          assert.equal(files.length, 1)
          assert.equal(files[0].owner_id, 2)
          assert.equal(files[0].content_base64, Buffer.from('BOM evidence retained for the current record').toString('base64'))
          if (definition.entry === 'business') await page.getByRole('cell').getByText(HEADERS.version, { exact: true }).dblclick()
          else {
            assert.equal(await editor.isVisible(), true, 'saving retains the complete task editor')
            assert.equal(await page.getByRole('button', { name: '返回办理', exact: true }).filter({ visible: true }).count(), 0)
            const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
            await steps.getByRole('tab').nth(2).click()
            const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
            await receipt.getByText('BOM 草稿已保存', { exact: false }).first().waitFor()
            assert.match(await receipt.innerText(), new RegExp(HEADERS.version, 'u'))
            assert.doesNotMatch(await receipt.innerText(), /任务已完成|已入账|已发货/u)
            await steps.getByRole('tab').nth(1).click()
            await page.locator('.erp-task-action-drawer').getByRole('button', { name: '返回列表', exact: true }).click()
            await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click()
            await page.getByRole('tablist', { name: '任务处理步骤', exact: true }).getByRole('tab').nth(1).click()
          }
          editor = page.locator('.erp-bom-editor:visible')
          await editor.getByLabel('BOM 版本', { exact: true }).waitFor()
          for (const [field, value] of Object.entries(HEADERS)) if (field !== 'note') assert.equal(await editor.getByLabel(FIELD_BY_KEY[field], { exact: true }).inputValue(), value, `readback ${field}`)
          for (const [field, value] of Object.entries(DATES)) assert.equal(await editor.getByLabel(FIELD_BY_KEY[field], { exact: true }).inputValue(), value.replaceAll('-', '/'), `readback ${field}`)
          assert.equal(await editor.getByLabel('备注', { exact: true }).inputValue(), '')
          assert.equal(await editor.locator('tr[data-bom-part-index]').count(), 2)
          await (await expandAttachments(editor)).getByText('BOM-工艺依据.txt', { exact: true }).waitFor()
          assert.equal(calls.length, definition.retrySave ? 2 : 1, 'readback never repeats the business save')
        }
        await assertNoHorizontalOverflow(page, `task-editor-bom-${definition.key}`)
        if (definition.entry === 'mobile') {
          const attachmentToolbar = editor.locator('.business-attachment-panel__toolbar').first()
          const categories = await attachmentToolbar.locator('.ant-segmented-item-label').evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent, width: node.clientWidth, contentWidth: node.scrollWidth, top: node.getBoundingClientRect().top, bottom: node.getBoundingClientRect().bottom })))
          assert.equal(categories.length, 3)
          assert.ok(categories.every((item) => item.contentWidth <= item.width + 1), 'all attachment category labels fit on the smallest phone')
          const refresh = await attachmentToolbar.getByRole('button', { name: '刷新列表', exact: true }).boundingBox()
          assert.ok(refresh.y >= Math.max(...categories.map((item) => item.bottom)) - 1, 'attachment tools use a separate row instead of squeezing the categories')
          await writeFile(path.join(outputDir, `task-editor-bom-${definition.key}-attachment-geometry.json`), JSON.stringify({ categories, refresh }, null, 2))
          await attachmentToolbar.scrollIntoViewIfNeeded()
          await page.waitForFunction(() => document.querySelector('.erp-bom-editor:not([hidden]) .erp-business-form-page__section-picker .ant-select-selection-item')?.textContent.trim() === '备注与附件')
          assert.equal(await page.getByTestId('mobile-back-to-top').count(), 0, 'the full source editor uses its own section navigation without a floating action over the attachment tools')
          const footer = page.getByTestId('mobile-task-action-screen').locator(':scope > .mobile-role-action-bar')
          const sizes = await footer.getByRole('button').evaluateAll((nodes) => nodes.map((node) => ({ label: node.textContent, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height, bottom: node.getBoundingClientRect().bottom })))
          assert.ok(sizes.every((item) => item.height >= 44 && item.height <= 54), 'phone footer actions retain their touch size without narrow text columns')
          const caption = await footer.locator('.mobile-task-device-scope').boundingBox()
          assert.ok(caption.y >= Math.max(...sizes.map((item) => item.bottom)) - 1, 'the device scope has its own row instead of shrinking actions')
          await writeFile(path.join(outputDir, `task-editor-bom-${definition.key}-footer-geometry.json`), JSON.stringify({ sizes, caption }, null, 2))
        }
        await writeFile(path.join(outputDir, `task-editor-bom-${definition.key}-data.json`), JSON.stringify({ entry: definition.entry, readonly: Boolean(definition.readonly), fields: fieldset, record, saves: calls, uploads, attachments: files.map((file) => ({ id: file.id, owner_type: file.owner_type, owner_id: file.owner_id, file_name: file.file_name, file_size: file.file_size, sha256: file.sha256 })) }, null, 2))
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `task-editor-bom-${definition.key}.png`) })
      },
    }
  })
}
