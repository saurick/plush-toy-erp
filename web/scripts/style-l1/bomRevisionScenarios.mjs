import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createBOMRevisionScenarios({ assert, customerRuntimeEffectiveSession, assertNoHorizontalOverflow, outputDir, path }) {
  const scenarios = ['create', 'multiple-mobile', 'read-failure', 'lost-response', 'no-create', 'resume-no-create', 'detail', 'detail-existing'].map((mode) => {
    const mobile = mode === 'multiple-mobile'
    const existingDraft = mobile || ['resume-no-create', 'detail-existing'].includes(mode)
    const permissions = [
      'bom.read', 'bom.update', 'mobile.engineering.access',
      ...(mode === 'resume-no-create' ? [] : ['bom.activate']),
      ...(['no-create', 'resume-no-create'].includes(mode) ? [] : ['bom.create']),
    ]
    let records
    let writes
    let failReads
    const original = {
      id: 1,
      product_id: 1,
      version: 'V1',
      status: 'ACTIVE',
      item_count: 1,
      edit_version: 1791648000000000,
      created_at: 1791648000,
      updated_at: 1791648000,
      items: [{ id: 11, bom_header_id: 1, material_id: 1, quantity: '2.5', unit_id: 1, loss_rate: '0.03', position: '面料' }],
    }
    return {
      name: `bom-revision-${mode}`,
      path: mobile ? '/m/engineering/handle/purchase/material-bom' : '/erp/purchase/material-bom',
      auth: 'admin',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions,
        menus: [{ key: 'material-bom', path: '/erp/purchase/material-bom', label: '物料清单（BOM）', required_any: ['bom.read'], required_all: [] }],
      },
      effectiveSession: { ...customerRuntimeEffectiveSession, pages: ['material-bom'], actions: permissions },
      beforeNavigate: async (page) => {
        records = [structuredClone(original), { ...structuredClone(original), id: 9, version: 'V9', status: 'ARCHIVED' }]
        if (mobile) records.push(...[2, 3].map((id) => ({ ...structuredClone(original), id, version: `V${id}`, status: 'DRAFT' })))
        if (existingDraft && !mobile) records.push({ ...structuredClone(original), id: 3, version: 'V3', status: 'DRAFT' })
        writes = []
        failReads = mode === 'read-failure'
        await page.route('**/rpc/bom', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          const reply = (data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: styleRpcResult(data) } })
          if (method === 'list_bom_versions') {
            if (params.product_id && failReads) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '读取失败' } } })
            const selected = records.filter((record) =>
              (!params.product_id || record.product_id === params.product_id) &&
              (!params.status || record.status === params.status) &&
              (params.lifecycle_scope === 'all' || record.status !== 'ARCHIVED')
            )
            return reply(stylePaginatedRpcData(selected, 'bom_versions', params))
          }
          if (method === 'get_bom_version') return reply({ bom_version: records.find((record) => record.id === params.id) })
          if (method === 'copy_bom_version') {
            writes.push({ method, params })
            assert.equal(params.source_id, 1)
            assert.equal(params.version, 'V10', '自动版本号须包括当前页以外的历史版本')
            assert.equal(records.some((record) => record.status === 'DRAFT'), false, '已有草稿时不重复创建')
            const draft = { ...structuredClone(original), id: 10, version: params.version, status: 'DRAFT', items: original.items.map((item) => ({ ...item, id: 101, bom_header_id: 10 })) }
            records.push(draft)
            if (mode === 'lost-response') return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '请求未取得结果' } } })
            return reply({ bom_version: draft })
          }
          if (method === 'save_bom_with_items') {
            writes.push({ method, params })
            const draft = records.find((record) => record.id === params.id)
            assert.equal(draft.status, 'DRAFT')
            assert.equal(params.expected_version, draft.edit_version)
            Object.assign(draft, params, { edit_version: draft.edit_version + 1 })
            return reply({ bom_version: draft })
          }
          if (method === 'activate_bom_version') {
            writes.push({ method, params })
            for (const record of records) {
              if (record.id === params.id) record.status = 'ACTIVE'
              else if (record.status === 'ACTIVE') record.status = 'ARCHIVED'
            }
            return reply({ bom_version: records.find((record) => record.id === params.id) })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.locator('tr[data-row-key="1"] input[type="checkbox"]').check()
        if (mode.startsWith('detail')) {
          await page.locator('button[data-business-action-key="view"]:visible').click()
          const detail = page.locator('.erp-business-form-page:visible')
          await detail.getByRole('heading', { name: '查看 BOM 版本 · 已启用 · 只读', exact: true }).waitFor()
          assert.equal(await detail.locator('#version').inputValue(), 'V1')
          assert.equal(await detail.locator('#version').isDisabled(), true)
          assert.equal(await detail.getByRole('button', { name: '保存草稿', exact: true }).count(), 0)
        }
        const action = page.locator('button[data-business-action-key="revise-bom"]:visible')
        await action.waitFor({ state: 'visible' })
        await action.filter({ hasText: existingDraft ? `查看草稿（${mobile ? 2 : 1}）` : mode === 'read-failure' ? '查看草稿' : '创建修订草稿' }).waitFor()
        if (mode.startsWith('detail')) await page.screenshot({ path: path.join(outputDir, `bom-revision-${mode}-4k.png`), animations: 'disabled' })
        await action.click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        await dialog.getByText('当前查看：V1 · 已启用（只读）', { exact: true }).waitFor()
        assert.equal(writes.length, 0, '查看修订选项不能修改已启用版本或创建草稿')
        if (mode === 'create') {
          await dialog.getByRole('button', { name: '取消', exact: true }).click()
          await dialog.waitFor({ state: 'hidden' })
          assert.equal(writes.length, 0, '取消开始修改不能创建草稿')
          await action.click()
        }
        if (mode === 'read-failure') {
          await dialog.getByRole('alert').waitFor()
          assert.equal(await dialog.getByRole('button', { name: '创建并编辑草稿', exact: true }).isDisabled(), true)
          assert.equal(writes.length, 0)
          failReads = false
          await dialog.getByRole('button', { name: '重新读取草稿', exact: true }).click()
        }
        if (mode === 'no-create') {
          await dialog.getByText('当前账号没有新建 BOM 版本的权限，请联系有权限的同事。').waitFor()
          assert.equal(await dialog.getByRole('button', { name: '创建并编辑草稿', exact: true }).isDisabled(), true)
          assert.equal(writes.length, 0)
          return
        }
        if (mobile) {
          assert.equal(await dialog.getByRole('button', { name: '编辑所选草稿', exact: true }).isDisabled(), true)
          await dialog.getByRole('radio', { name: 'V3 · 草稿', exact: true }).check()
          await page.screenshot({ path: path.join(outputDir, 'bom-revision-mobile-choose.png'), animations: 'disabled' })
        } else if (existingDraft) {
          assert.equal(await dialog.getByRole('radio', { name: 'V3 · 草稿', exact: true }).isChecked(), true)
        } else {
          await dialog.getByText(/自动填写版本号/u).waitFor()
        }
        const start = dialog.getByRole('button', { name: existingDraft ? '编辑所选草稿' : '创建并编辑草稿', exact: true })
        if (mode === 'create') {
          await start.click({ trial: true })
          await page.mouse.move(0, 0)
          await page.screenshot({ path: path.join(outputDir, 'bom-revision-start-4k.png'), animations: 'disabled' })
          await start.evaluate((button) => { button.click(); button.click() })
        }
        else await start.click()
        if (mode === 'lost-response') {
          await dialog.getByRole('alert').waitFor()
          await dialog.getByRole('button', { name: '重新读取草稿', exact: true }).click()
          await dialog.getByRole('radio', { name: 'V10 · 草稿', exact: true }).waitFor()
          await dialog.getByRole('button', { name: '编辑所选草稿', exact: true }).click()
        }
        const editor = page.locator('.erp-business-form-page:visible')
        await editor.waitFor()
        await editor.getByRole('heading', { name: '编辑 BOM 草稿 · 未生效', exact: true }).waitFor()
        await editor.getByText('正在修改草稿，尚未生效。保存后需启用，已有订单仍使用原 BOM。', { exact: true }).waitFor()
        assert.equal(await editor.locator('#version').inputValue(), existingDraft ? 'V3' : 'V10')
        assert.equal(await editor.locator('.erp-bom-material-group').count(), 1)
        assert.deepEqual(records[0], original, '编辑新版本不能修改原 BOM')
        assert.equal(writes.filter((item) => item.method === 'copy_bom_version').length, existingDraft ? 0 : 1)
        await assertNoHorizontalOverflow(page)
        if (mode === 'create') {
          const noteGeometry = await editor.locator('.erp-business-inline-note').evaluate((node) => ({
            width: node.getBoundingClientRect().width,
            parentWidth: node.parentElement.clientWidth,
            gridColumn: getComputedStyle(node).gridColumn,
          }))
          assert(noteGeometry.width >= noteGeometry.parentWidth * 0.9, `草稿状态说明应横跨表单，当前布局：${JSON.stringify(noteGeometry)}`)
          await page.screenshot({ path: path.join(outputDir, 'bom-revision-editor-4k.png'), animations: 'disabled' })
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          const draftRow = page.locator('tr[data-row-key="10"]')
          await draftRow.waitFor()
          await draftRow.locator('input[type="checkbox"]').uncheck()
          await page.locator('tr[data-row-key="1"] input[type="checkbox"]').check()
          await action.filter({ hasText: '查看草稿（1）' }).waitFor()
          await action.click()
          await dialog.getByRole('button', { name: '编辑所选草稿', exact: true }).click()
          await editor.waitFor()
          assert.equal(await editor.locator('#version').inputValue(), 'V10', '返回后可找到并继续刚创建的草稿')
          assert.equal(writes.filter((item) => item.method === 'copy_bom_version').length, 1)
        }
        await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
        const receipt = page.getByRole('dialog', { name: 'BOM 草稿已保存', exact: true })
        await receipt.waitFor()
        assert.equal(records[0].status, 'ACTIVE', '保存不能自动启用')
        assert.equal(writes.some((item) => item.method === 'activate_bom_version'), false)
        if (mode === 'create') await page.screenshot({ path: path.join(outputDir, 'bom-revision-saved-4k.png'), animations: 'disabled' })
        if (mode === 'resume-no-create') {
          await receipt.getByText('请有启用权限的同事确认并启用新版本。', { exact: true }).waitFor()
          assert.equal(await receipt.getByRole('button', { name: '启用此版本', exact: true }).count(), 0)
          await receipt.getByRole('button', { name: '继续编辑草稿', exact: true }).click()
          await editor.waitFor()
          assert.equal(await editor.locator('#version').inputValue(), 'V3')
          return
        }
        await receipt.getByRole('button', { name: '启用此版本', exact: true }).click()
        await page.locator('.ant-popconfirm').getByRole('button', { name: '启用', exact: true }).click()
        await receipt.waitFor({ state: 'hidden' })
        assert.equal(records[0].status, 'ARCHIVED')
        assert.deepEqual(records[0].items, original.items, '启用保留原版本明细')
        assert.equal(writes.filter((item) => item.method === 'activate_bom_version').length, 1)
      },
    }
  })
  return [...scenarios, {
    name: 'dev-ui-bom-revision',
    path: '/__dev/ui-design',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('button', { name: /全屏预览/u }).click()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.locator('.nav-item[data-page="engineering-hub"]').click()
      const toolbar = frame.locator('.business-record-actions').first()
      const edit = toolbar.locator('[data-operation="edit"]')
      const select = async (id) => {
        const selectedIDs = await frame.locator('.table-wrap [data-action="select-row"]:checked').evaluateAll((nodes) => nodes.map((node) => node.dataset.id))
        for (const selectedID of selectedIDs) await frame.locator(`.table-wrap [data-action="select-row"][data-id="${selectedID}"]`).uncheck()
        await frame.locator(`.table-wrap [data-action="select-row"][data-id="${id}"]`).check()
      }
      const confirm = () => frame.locator('[data-action="business-record-confirm"]').click()
      const save = () => frame.locator('[data-action="save-form"]').click()
      const enable = async () => {
        await frame.locator('.form-foot').getByRole('button', { name: '启用此版本', exact: true }).click()
        await confirm()
        await frame.getByRole('dialog', { name: 'BOM详情', exact: true }).locator('.modal-head').getByText('已启用 · 只读', { exact: true }).waitFor()
        assert.equal(await frame.locator('.form-view').count(), 0, '启用后退出草稿编辑页')
        await frame.getByRole('button', { name: '返回原视图', exact: true }).click()
      }
      await select('bom-5')
      assert.equal(await edit.innerText(), '查看草稿（2）')
      await edit.click()
      const dialog = frame.getByRole('dialog', { name: /^(选择要编辑的 BOM 草稿|创建 BOM 修订草稿)$/u })
      assert.equal(await dialog.locator('#business-draft option').count(), 3, '同产品多个草稿供明确选择')
      await dialog.locator('#business-draft').selectOption('bom-13')
      await confirm()
      await frame.locator('[data-form-field="usage-0"]').fill('1.26')
      await save()
      await enable()
      await edit.click()
      assert.equal(await dialog.locator('#business-draft').inputValue(), 'bom-1', '只有一个草稿时预选该版本')
      await confirm()
      await frame.locator('[data-form-field="bom-version"]').fill('V9')
      await frame.locator('[data-form-field="usage-0"]').fill('2.5')
      await save()
      await enable()
      assert.equal(await edit.innerText(), '创建修订草稿')
      await edit.click()
      await dialog.getByText(/自动填写版本号/u).waitFor()
      await page.screenshot({ path: path.join(outputDir, 'bom-revision-prototype-4k.png'), animations: 'disabled' })
      await confirm()
      assert.equal(await frame.locator('[data-form-field="bom-version"]').inputValue(), 'V10')
      assert.equal(await frame.locator('[data-form-field="usage-0"]').inputValue(), '2.5', '新版本带入原材料用量')
      await frame.locator('[data-form-field="usage-0"]').fill('3.25')
      await save()
      await frame.locator('[data-action="back-list"]').click()
      assert.equal(await frame.locator('tr[data-row="bom-1"] .cell-status').innerText(), '当前生效', '保存草稿不替换原版本')
      await select('bom-1')
      await edit.click()
      await confirm()
      assert.equal(await frame.locator('[data-form-field="bom-version"]').inputValue(), 'V10')
      assert.equal(await frame.locator('[data-form-field="usage-0"]').inputValue(), '3.25', '再次修改继续已有草稿')
      await save()
      await enable()
      assert.equal(await frame.locator('tr[data-row="bom-1"] .cell-status').innerText(), '历史版本')
      assert.equal(await frame.locator('tr[data-row^="bom-revision-"]').count(), 1, '继续修改不重复创建版本')
    },
  }]
}
