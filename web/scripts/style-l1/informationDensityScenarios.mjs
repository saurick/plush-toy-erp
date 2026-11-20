import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'

export async function captureInformationDensityHelp({ page, trigger, key, expected, assert, outputDir, path }) {
  await trigger.click()
  const content = page.locator('.erp-business-inline-help-popover:visible')
  await content.waitFor()
  assert.ok((await content.innerText()).includes(expected), '按需帮助保留原说明')
  await page.screenshot({ path: path.join(outputDir, `${key}.png`), animations: 'disabled' })
  await content.screenshot({ path: path.join(outputDir, `${key}-popover.png`), animations: 'disabled' })
  await trigger.press('Escape')
  await content.waitFor({ state: 'hidden' })
  assert.equal(await trigger.isVisible(), true, '关闭帮助后保留当前页面')
}

// Samples exercise presentation without contacting a business database.
export function createInformationDensityScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession, assertNoHorizontalOverflow }) {
  const actions = Object.values(PermissionCode)
  const fixtures = [
    { id: 99021, version: 3, task_code: 'TASK-DENSITY-001', task_name: '核对包装交期', task_group: 'material_check', owner_role_key: 'engineering', task_status_key: 'ready', source_type: null, payload: {}, created_at: 1790085600, due_at: 1792000000, discovery: { path: '协同跟进 / 业务跟进 / 资料复核', assignee_name: '演示工程' }, display_context: { available: true, items: [{ kind: 'product', name: '海盐企鹅', code: 'P-DENSITY-001', image_attachment_id: 8801 }] } },
    { id: 99022, version: 3, task_code: 'TASK-DENSITY-002', task_name: '核对订单资料', task_group: 'material_check', owner_role_key: 'engineering', task_status_key: 'blocked', blocked_reason: '规格待核对，需业务补齐包装尺寸。', source_type: 'sales_order', source_id: 1, source_no: 'SO-DENSITY-20261018-000000001', created_at: 1790085600, due_at: 1792000000, discovery: { path: '订单履约 / 接单与用料 / 工程资料', assignee_name: '张敏' }, display_context: { available: true, source_no: 'SO-DENSITY-20261018-000000001', items: [{ kind: 'product', name: '长耳兔抱枕（多语言洗标及礼盒包装）', code: 'P-RABBIT-CUSTOM-20261018-000000002', image_attachment_id: 8801 }] } },
  ]
  const capture = async (page, name, region) => {
    if (!name.includes('-help-') && !name.includes('-audit-')) await page.mouse.move(2, 2)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: path.join(outputDir, `${name}.png`), animations: 'disabled' })
    if (region) await region.screenshot({ path: path.join(outputDir, `${name}-region.png`), animations: 'disabled' })
  }
  const scenarios = [1920, 390, 320].map((width) => {
    const mobile = width < 600
    const surface = mobile ? `mobile-${width}` : 'desktop'
    return {
      name: `information-density-${surface}`,
      path: mobile ? '/m/engineering/tasks' : '/erp/task-board?mode=todo',
      auth: 'admin', customerKey: 'yoyoosun', themeMode: 'light',
      viewport: { width, height: mobile ? 844 : 1080 }, deviceScaleFactor: 2,
      workflowTaskFixtures: fixtures,
      adminProfile: { id: 1, username: 'density-fixture', is_super_admin: true, permissions: actions, roles: [{ role_key: 'engineering' }], menus: [{ key: 'task-board', path: '/erp/task-board' }] },
      effectiveSession: { ...customerRuntimeEffectiveSession, actions, roles: ['engineering'], workPools: ['engineering'], workflow_visible_owner_role_keys_by_capability: Object.fromEntries(actions.filter(key => key.startsWith('workflow.task.')).map(key => [key, ['engineering']])) },
      beforeNavigate: async (page) => {
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'list_task_events') return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: [
            { id: 901, task_id: body.params.task_id, task_version: 3, event_type: 'status_changed', actor_display_name: '张敏', actor_role_key: 'engineering', created_at: 1792200000, from_status_key: 'ready', to_status_key: 'blocked', reason: '规格待核对，需业务补齐包装尺寸。' },
            { id: 900, task_id: body.params.task_id, task_version: 2, event_type: 'created', actor_display_name: '演示工程', actor_role_key: 'engineering', created_at: 1790085600, to_status_key: 'ready', reason: '产品资料已交接。' },
          ], truncated: false } } } })
          if (body.method === 'get_task_handling_chain') return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: fixtures.filter(t => t.id === body.params.task_id), truncated: false } } } })
          return route.fallback()
        })
      },
      verify: async (page) => {
        page.setDefaultTimeout(15000)
        if (mobile) await page.getByTestId('mobile-role-bottom-nav').getByRole('tab', { name: /^任务管理/u }).click()
        await page.getByRole('button', { name: '查看核对包装交期详情', exact: true }).waitFor().catch(async error => {
          const state = await page.evaluate(() => ({ path: location.pathname, authPresent: Boolean(localStorage.getItem('admin_access_token')), text: document.body.innerText.slice(0, 600) }))
          throw new Error(`${error.message}\n${JSON.stringify(state)}`)
        })
        await capture(page, `tasks-list-${surface}`)
        assert.equal(await page.locator('.workflow-task-discovery__summary:visible').count(), 0)
        assert.doesNotMatch(await page.locator(mobile ? '.mobile-task-results' : '.erp-task-board-lane').first().innerText(), /模拟|数据性质/u)
        assert.equal(await page.locator('[aria-label="模拟数据"]').count(), 0)
        await page.getByRole('button', { name: '查看核对订单资料详情', exact: true }).click()
        const detail = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.erp-task-action-drawer')
        await detail.locator('.workflow-task-info-card[aria-label="任务信息"]').waitFor()
        await detail.getByText('产品资料已交接。', { exact: false }).waitFor()
        await capture(page, `task-info-${surface}`, detail.locator('.workflow-task-info-card[aria-label="任务信息"]'))
        await capture(page, `task-records-${surface}`, detail.getByTestId('workflow-task-event-trail'))
        const information = detail.locator('.workflow-task-info-card__details')
        assert.equal(await information.getAttribute('open'), null)
        await information.locator('summary').click()
        assert.match(await information.innerText(), /进入岗位/u)
        await capture(page, `task-info-expanded-${surface}`, information)
        await information.locator('summary').click()
        const audit = detail.locator('.workflow-task-event-trail__audit-trigger').first()
        await audit.click()
        const auditContent = page.locator('.workflow-task-event-trail__audit:visible')
        await auditContent.waitFor()
        assert.match(await auditContent.innerText(), /版本 3/u)
        await capture(page, `task-record-audit-${surface}`, auditContent)
        await audit.press('Escape')
        await auditContent.waitFor({ state: 'hidden' })
        assert.equal(await detail.isVisible(), true)
        assert.match(await detail.innerText(), /规格待核对/u)
        await detail.locator(mobile ? '.mobile-role-action-bar' : '.ant-drawer-footer').getByRole('button', { name: '选择处理方式', exact: true }).click()
        const action = mobile ? page.getByTestId('mobile-task-action-screen') : detail.locator('#erp-task-action-step-action')
        if (mobile) {
          const resume = action.locator('[data-action-key="resume"]')
          if (await resume.count()) await resume.click()
        } else await action.getByRole('radio', { name: /解除阻塞|恢复/u }).click()
        await capture(page, `task-action-${surface}`, action)
        const help = action.locator('.erp-business-inline-help-trigger').first()
        await help.click()
        await page.locator('.erp-business-inline-help-popover:visible').waitFor()
        assert.equal(await help.getAttribute('aria-expanded'), 'true')
        await capture(page, `task-action-help-${surface}`, action)
        await page.locator('.erp-business-inline-help-popover:visible').screenshot({ path: path.join(outputDir, `task-action-help-${surface}-popover.png`), animations: 'disabled' })
        if (mobile) {
          const box = await help.boundingBox()
          assert.ok(box.width >= 44 && box.height >= 44, JSON.stringify(box))
        }
        await help.press('Escape')
        assert.equal(await action.isVisible(), true, 'Escape 只关闭填写帮助，保留办理页')
        await action.locator('textarea').fill('规格已核对，保留本次处理意见。')
        if (mobile) await action.locator('[data-step-key="detail"]').click()
        else await detail.getByRole('tab', { name: /核对任务/u }).click()
        await detail.locator(mobile ? '.mobile-role-action-bar' : '.ant-drawer-footer').getByRole('button', { name: '选择处理方式', exact: true }).click()
        assert.equal(await action.locator('textarea').inputValue(), '规格已核对，保留本次处理意见。')
        if (!mobile) {
          await detail.getByRole('button', { name: '核对并确认', exact: true }).click()
          await capture(page, `task-confirm-${surface}`, detail)
        }
        await assertNoHorizontalOverflow(page, `information-density-${surface}`)
      },
    }
  })
  scenarios.push({
    name: 'information-density-business-desktop', path: '/erp/purchase/accessories', auth: 'admin', themeMode: 'light',
    effectiveSession: { ...customerRuntimeEffectiveSession, actions }, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
    verify: async (page) => {
      page.setDefaultTimeout(15000)
      const origin = new URL(page.url()).origin
      const forms = [
        ['purchase', '/erp/purchase/accessories', '新建采购订单', '新建采购订单'],
        ['supplier', '/erp/master/partners/suppliers', '新建供应商', '新建供应商或加工厂'],
        ['outsourcing', '/erp/purchase/processing-contracts', '新建加工合同', '新建加工合同'],
        ['shipment', '/erp/warehouse/shipments', '新建出货单', '新建出货单'],
      ]
      // Only selection and read-only details are exercised in the real page; RPC is mocked.
      const row = page.locator('.ant-table-tbody tr[data-row-key]').first()
      await row.waitFor()
      await row.click()
      await page.getByRole('button', { name: /查看详情/u }).click()
      const dialog = page.locator('.erp-business-details-modal:visible')
      await dialog.waitFor()
      await capture(page, 'business-details-desktop', dialog)
      await captureInformationDensityHelp({ page, trigger: dialog.locator('.ant-modal-title .erp-business-inline-help-trigger'), key: 'business-details-help-desktop', expected: '查看采购订单摘要和完整明细', assert, outputDir, path })
      await dialog.getByRole('button', { name: /^关\s*闭$/u }).click()
      for (const [key, route, trigger, title] of forms) {
        await page.goto(`${origin}${route}`)
        await page.getByRole('button', { name: trigger }).click()
        const form = page.locator('.erp-business-form-page:not([hidden])')
        await form.getByRole('heading', { name: title, exact: true }).waitFor()
        if (key === 'supplier') {
          await form.getByText('付款默认值仅用于新建订单；已保存订单的付款条件保持不变。', { exact: true }).waitFor()
        }
        await capture(page, `form-${key}-desktop`, form)
        const labels = key === 'supplier' ? ['默认付款方式', '默认付款周期（天）', '默认是否需要发票', '可加工工序'] : key === 'outsourcing' ? ['整单来源订单号', '付款周期（天）'] : []
        for (const [index, label] of labels.entries()) {
          const field = form.locator('.ant-form-item').filter({ has: page.getByText(label, { exact: true }) }).first()
          await field.scrollIntoViewIfNeeded()
          await capture(page, `field-${key}-${index + 1}-desktop`, field)
          if (key === 'supplier' || index === 0) {
            const expected = key === 'supplier'
              ? ['仅作为新建采购订单的默认值', '仅作为新建采购或委外订单的默认值', '历史资料可不设置', '具体订单仍需逐行选择工序'][index]
              : '各行产品订单编号在明细中填写'
            await captureInformationDensityHelp({ page, trigger: field.getByRole('button', { name: `查看${label}说明`, exact: true }), key: `field-${key}-${index + 1}-help-desktop`, expected, assert, outputDir, path })
          }
        }
        if (key === 'shipment') {
          const address = form.locator('[data-form-section="收货信息"]')
          await address.scrollIntoViewIfNeeded()
          await capture(page, 'field-shipment-address-desktop', address)
          await captureInformationDensityHelp({ page, trigger: address.locator('.erp-business-inline-help-trigger'), key: 'field-shipment-address-help-desktop', expected: '从销售订单带出后可按本次出货调整', assert, outputDir, path })
        }
        if (key === 'purchase') {
          await form.getByRole('button', { name: '从材料库添加', exact: true }).click()
          const picker = page.locator('.erp-source-import-picker-modal:visible, .ant-modal:visible').last()
          await picker.waitFor()
          await capture(page, 'purchase-material-picker-desktop', picker)
          await captureInformationDensityHelp({ page, trigger: picker.locator('.ant-modal-title .erp-business-inline-help-trigger'), key: 'purchase-material-picker-help-desktop', expected: '数量、单价和预计到货日期在编辑页的采购明细里维护', assert, outputDir, path })
          await picker.getByRole('button', { name: /取消/u }).click()
        }
        await form.getByRole('button', { name: '返回列表', exact: true }).click()
        const discard = page.getByRole('button', { name: '放弃修改', exact: true })
        if (await discard.isVisible()) await discard.click()
      }
    },
  })
  return scenarios
}
