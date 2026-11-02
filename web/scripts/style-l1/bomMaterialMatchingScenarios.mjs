import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'

export async function installBOMMaterialMatchingMocks(page, creates = []) {
  const records = [
    { id: 1, code: 'MAT-STYLE-L1', name: '样式材料', supplier_item_no: '示例织造AB-001#-02#米白', spec: '短毛绒 300g', color: '米白', default_unit_id: 1, is_active: true },
    { id: 2, code: 'MAT-FILLING', name: '测试填充材料', default_unit_id: 1, is_active: true },
    { id: 3, code: 'MAT-PACKAGING', name: '测试包装材料', default_unit_id: 1, is_active: true },
    { id: 77, code: 'MAT-MATCH', name: '对应测试材料', supplier_item_no: 'SUP-MISSING', spec: '测试规格', default_unit_id: 1, is_active: true },
    { id: 78, code: 'MAT-OTHER', name: '对应另一材料', supplier_item_no: 'SUP-OTHER', spec: '另一规格', default_unit_id: 1, is_active: true },
    { id: 79, code: 'MAT-CONFLICT', name: '冲突测试材料', supplier_item_no: 'SUP-MISSING', spec: '不一致规格', default_unit_id: 2, is_active: true },
    { id: 81, code: 'MAT-OFF', name: '停用测试材料', default_unit_id: 1, is_active: false },
  ]
  await page.route('**/rpc/masterdata', async (route) => {
    const { id, method, params = {} } = route.request().postDataJSON()
    let data
    if (method === 'list_materials') {
      const keyword = String(params.keyword || '').toLowerCase()
      const found = records.filter((record) =>
        (params.active_only !== true || record.is_active) &&
        (!keyword || Object.values(record).join(' ').toLowerCase().includes(keyword))
      )
      data = stylePaginatedRpcData(found, 'materials', params)
    } else if (method === 'create_material') {
      creates.push(params)
      const material = { ...params, id: 80, is_active: true }
      records.push(material)
      data = { material }
    } else return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: styleRpcResult(data) }) })
  })
  return records
}

export function createBOMMaterialMatchingScenarios(deps) {
  const creates = []
  return [{
    name: 'bom-material-matching-inline',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => { creates.length = 0; await installBOMMaterialMatchingMocks(page, creates) },
    verify: async (page) => {
      const { assert } = deps
      const saves = []
      await page.route('**/rpc/bom', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method === 'save_bom_with_items') saves.push(body.params)
        await route.fallback()
      })
      await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('menuitem', { name: /从 Excel 新建/u }).click()])
      await chooser.setFiles({ name: 'BOM-MATCH-SYNTHETIC.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: createBOMImportWorkbookFixture({ grouped: true }) })
      await page.getByRole('dialog', { name: '从 Excel 新建 BOM', exact: true }).getByRole('button', { name: '带入编辑', exact: true }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('button', { name: '全部展开', exact: true }).click()
      await editor.getByRole('button', { name: '全部展开', exact: true }).click()
      const group = editor.locator('.erp-bom-material-group').nth(1)
      const select = editor.getByRole('combobox', { name: '物料名称 2', exact: true })
      const selectField = editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '物料名称 2', exact: true }) })
      await selectField.locator('.ant-select-selector').click()
      const dropdown = page.locator('.ant-select-dropdown:visible')
      const conflict = dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-CONFLICT' })
      await conflict.waitFor()
      assert.equal(await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-OFF' }).count(), 0, '停用物料不应出现在新关联候选中')
      assert.equal(await page.getByRole('dialog').count(), 0, '打开下拉不应打开弹窗')
      assert.equal(await dropdown.getByRole('button', { name: /核对/u }).count(), 0, '候选旁不应再提供逐项核对入口')
      assert.match(await conflict.getAttribute('class'), /ant-select-item-option-disabled/u)
      await conflict.getByText('规格、单位与原表不同', { exact: true }).waitFor()
      await page.waitForFunction(() => {
        const popup = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
        return popup && getComputedStyle(popup).opacity === '1' && !/slide-up-(?:appear|enter)/u.test(popup.className)
      })
      const dropdownBox = await dropdown.boundingBox()
      assert.ok(dropdownBox.x >= 0 && dropdownBox.y >= 0 && dropdownBox.x + dropdownBox.width <= 1921 && dropdownBox.y + dropdownBox.height <= 1081, '物料候选应完整位于视口内')
      assert.equal(await conflict.evaluate((node) => node.scrollWidth > node.clientWidth + 1), false, '候选的身份和冲突提示不得横向溢出')
      await page.screenshot({ path: `${deps.outputDir}/bom-material-candidates.png`, fullPage: true })
      await page.keyboard.press('Escape')
      await dropdown.waitFor({ state: 'hidden' })
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '物料名称 2')
      await selectField.locator('.ant-select-selector').click()
      await select.fill('MAT-MATCH')
      await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-MATCH' }).click()
      await dropdown.waitFor({ state: 'hidden' })
      assert.equal(await group.locator('tr[data-bom-part-index]').count(), 2)
      await selectField.locator('.ant-select-selection-item').filter({ hasText: '对应测试材料' }).waitFor()
      assert.equal(await page.getByRole('dialog').count(), 0)
      assert.equal(await group.getByLabel('单位用量 3', { exact: true }).inputValue(), '0.123456789')
      const lastSelect = editor.getByRole('combobox', { name: '物料名称 4', exact: true })
      await lastSelect.click()
      await lastSelect.fill('不存在的测试物料')
      await dropdown.getByText('未找到对应物料', { exact: true }).waitFor()
      assert.equal(await dropdown.locator('.ant-select-item-option').count(), 0)
      await lastSelect.press('Tab')
      const createButton = dropdown.getByRole('button', { name: '新建物料并使用', exact: true })
      await page.waitForFunction(() => document.activeElement?.textContent.trim() === '新建物料并使用')
      await createButton.press('Shift+Tab')
      await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '物料名称 4')
      await lastSelect.press('Tab')
      await page.waitForFunction(() => document.activeElement?.textContent.trim() === '新建物料并使用')
      await createButton.press('Enter')
      const create = page.getByRole('dialog').filter({ hasText: '新建物料并使用' }).last()
      await create.waitFor()
      assert.equal(await create.locator('input#name').inputValue(), '尚未建档材料')
      assert.equal(await create.locator('input#supplier_item_no').inputValue(), 'SUP-OTHER')
      assert.equal(await create.locator('input#spec').inputValue(), '另一规格')
      assert.equal(creates.length, 0)
      await create.getByRole('button', { name: '取消', exact: true }).click()
      await create.waitFor({ state: 'hidden' })
      assert.equal(creates.length, 0, '取消建档不得创建物料')
      assert.equal(await editor.locator('.erp-bom-material-group').count(), 3, '取消建档保留 BOM 物料分组')
      await lastSelect.click()
      await dropdown.getByRole('button', { name: '新建物料并使用', exact: true }).click()
      await create.waitFor()
      assert.equal(await create.locator('input#name').inputValue(), '尚未建档材料')
      await create.getByLabel('库存类别', { exact: true }).click()
      await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
      await create.getByLabel('默认入库仓', { exact: true }).click()
      await page.locator('.ant-select-dropdown:visible').getByText('样式仓库（主料仓）', { exact: true }).click()
      await create.getByRole('button', { name: '新建并使用', exact: true }).click()
      await create.waitFor({ state: 'hidden' })
      assert.equal(creates.length, 1)
      assert.equal(creates[0].spec, '另一规格')
      await page.screenshot({ path: `${deps.outputDir}/bom-material-match-in-editor.png`, fullPage: true })
      await editor.getByRole('button', { name: '保存草稿', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      assert.equal(saves.length, 1)
      assert.deepEqual(saves[0].items.map((item) => item.material_id), [1, 77, 77, 80])
      assert.equal(saves[0].items[1].source_snapshot.material_name, '尚未建档材料')
      assert.equal(saves[0].items[1].source_snapshot.material_spec, '测试规格')
      assert.equal(saves[0].items[2].source_snapshot.supplier_item_no, 'SUP-MISSING')
    },
  }, {
    name: 'bom-material-active-candidates-history',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      const records = await installBOMMaterialMatchingMocks(page)
      records.find((record) => record.id === 1).is_active = false
    },
    verify: async (page) => {
      const { assert } = deps
      await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('button', { name: '全部展开', exact: true }).click()
      const select = editor.getByRole('combobox', { name: '物料名称 1', exact: true })
      const selectField = editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '物料名称 1', exact: true }) })
      await selectField.locator('.ant-select-selection-item').filter({ hasText: '样式材料（已停用）' }).waitFor()
      const quantity = await editor.getByLabel('单位用量 1', { exact: true }).inputValue()
      await selectField.locator('.ant-select-selector').click()
      const dropdown = page.locator('.ant-select-dropdown:visible')
      await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-MATCH' }).waitFor()
      await dropdown.locator('.rc-virtual-list-holder').evaluate((node) => {
        node.scrollTop = node.scrollHeight
        node.dispatchEvent(new Event('scroll'))
      })
      const historical = dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-STYLE-L1' })
      await historical.waitFor()
      assert.equal(await historical.count(), 1)
      assert.match(await historical.getAttribute('class'), /ant-select-item-option-disabled/u)
      await historical.getByText('物料已停用', { exact: true }).waitFor()
      assert.equal(await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-OFF' }).count(), 0)
      await page.screenshot({ path: `${deps.outputDir}/bom-material-inactive-history.png`, fullPage: true })
      await select.press('Escape')
      await dropdown.waitFor({ state: 'hidden' })
      await selectField.hover()
      await selectField.locator('.ant-select-clear').click()
      await selectField.locator('.ant-select-selector').click()
      await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-MATCH' }).waitFor()
      assert.equal(await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-STYLE-L1' }).count(), 0, '历史关联清空后不得重新成为候选')
      await select.fill('MAT-OFF')
      await dropdown.locator('.ant-empty-description').filter({ hasText: '未找到对应物料' }).waitFor()
      assert.equal(await dropdown.locator('.ant-select-item-option').count(), 0)
      await select.fill('MAT-MATCH')
      await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-MATCH' }).click()
      await selectField.locator('.ant-select-selection-item').filter({ hasText: '对应测试材料' }).waitFor()
      assert.equal(await editor.getByLabel('单位用量 1', { exact: true }).inputValue(), quantity, '清空与替换物料应保留部位用量')
      assert.equal((await selectField.innerText()).includes('已停用'), false)
    },
  }, {
    name: 'bom-material-matching-without-create-permission',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    adminProfile: {
      is_super_admin: false,
      permissions: deps.customerRuntimeEffectiveSession.actions.filter((action) => action !== 'material.create'),
    },
    beforeNavigate: async (page) => { creates.length = 0; await installBOMMaterialMatchingMocks(page, creates) },
    verify: async (page) => {
      const { assert } = deps
      await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('button', { name: '全部展开', exact: true }).click()
      const select = editor.getByRole('combobox', { name: '物料名称 1', exact: true })
      const selectField = editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '物料名称 1', exact: true }) })
      await selectField.hover()
      await selectField.locator('.ant-select-clear').click()
      await select.press('ArrowDown')
      const dropdown = page.locator('.ant-select-dropdown:visible')
      await dropdown.waitFor()
      assert.equal(await dropdown.getByRole('button', { name: '新建物料并使用', exact: true }).count(), 0)
      assert.equal(await dropdown.getByRole('button', { name: /核对/u }).count(), 0)
      await select.fill('不存在的测试物料')
      await dropdown.getByText('未找到对应物料', { exact: true }).waitFor()
      assert.equal(await dropdown.getByRole('button').count(), 0)
      assert.equal(creates.length, 0)
      await select.fill('MAT-MATCH')
      await dropdown.locator('.ant-select-item-option').filter({ hasText: 'MAT-MATCH' }).click()
      await dropdown.waitFor({ state: 'hidden' })
      await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '物料名称 1', exact: true }) }).getByText('对应测试材料', { exact: true }).waitFor()
      assert.equal(creates.length, 0)
    },
  }]
}
