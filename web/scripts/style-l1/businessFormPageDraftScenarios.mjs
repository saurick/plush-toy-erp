import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'

export function createBusinessFormPageDraftScenarios(deps) {
  const effectiveSession = {
    ...deps.customerRuntimeEffectiveSession,
    pages: [
      ...deps.customerRuntimeEffectiveSession.pages,
      'production-progress',
      'finance-payments',
    ],
    actions: [
      ...deps.customerRuntimeEffectiveSession.actions,
      'production.fact.read',
      'production.material_issue.create',
      'production.completion.create',
      'production.rework.create',
      'production.order.read',
      'production.plan.read',
      'production.wip.read',
      'warehouse.read',
      'inventory.read',
    ],
  }
  const draftScenarios = [
    ['material', 'MATERIAL_ISSUE', '编辑生产领料草稿'],
    ['completion', 'FINISHED_GOODS_RECEIPT', '核对待入库完工报告'],
    ['rework', 'REWORK', '编辑返工草稿'],
  ].map(([key, factType, title]) => ({
    name: `business-form-page-production-${key}-draft`,
    path: '/erp/production/progress',
    auth: 'admin',
    adminProfile: {
      is_super_admin: true,
      permissions: effectiveSession.actions,
    },
    effectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      const draft = {
        id: 991,
        version: 1,
        fact_no: `DRAFT-EDITOR-${key}`,
        fact_type: factType,
        status: 'DRAFT',
        subject_type: key === 'material' ? 'MATERIAL' : 'PRODUCT',
        subject_id: key === 'material' ? 1 : 301,
        warehouse_id: 1,
        unit_id: key === 'material' ? 1 : 501,
        lot_id: key === 'material' ? 1 : 480,
        quantity: '2',
        source_type: key === 'rework' ? 'PRODUCTION_FACT' : 'PRODUCTION_ORDER',
        source_id: key === 'rework' ? 81 : 71,
        source_line_id: key === 'material' ? 7201 : 7100,
        production_order_id: 71,
        production_order_item_id: key === 'material' ? 7101 : 7100,
        ...(key === 'completion' ? { production_wip_batch_id: 91004 } : {}),
        occurred_at: 1750000000,
        note: '草稿编辑测试',
        reason: '返工草稿测试',
      }
      await page.route('**/rpc/operational_fact', async (route) => {
        const request = route.request().postDataJSON()
        if (request.method !== 'list_production_facts') return route.fallback()
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: request.id,
            result: {
              code: 0,
              message: 'OK',
              data: {
                production_facts: [draft],
                total: 1,
                limit: request.params?.limit || 50,
                offset: request.params?.offset || 0,
              },
            },
          }),
        })
      })
    },
    verify: async (page) => {
      if (key === 'completion') {
        // Establish the released source in the intercepted fixture, as on the production path.
        const result = await page.evaluate(async () => {
          const response = await fetch('/rpc/production_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'editor-draft-release',
              method: 'release_production_order',
              params: {
                production_order_id: 71,
                expected_version: 1,
                idempotency_key: 'editor-draft-release',
              },
            }),
          })
          return response.json()
        })
        deps.assert.equal(result.result.code, 0)
      }
      await page.getByText(`DRAFT-EDITOR-${key}`, { exact: true }).click()
      await page
        .locator('[data-business-action-key="production-fact-edit-draft"]')
        .click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('heading', { name: title, exact: true }).waitFor()
      await assertBusinessFormPage(page, editor)
      await editor.getByRole('status').getByText('尚未修改').waitFor()
      deps.assert.equal(
        await editor.locator('input[id$="quantity"]').inputValue(),
        '2'
      )
      const note = editor.locator('textarea').first()
      const original = await note.inputValue()
      await note.fill('草稿修改后仍可继续编辑')
      await editor.getByRole('button', { name: '返回列表' }).click()
      await page.getByRole('button', { name: '继续编辑', exact: true }).click()
      await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden' })
      deps.assert.equal(await note.inputValue(), '草稿修改后仍可继续编辑')
      await note.fill(original)
      await editor.getByRole('status').getByText('尚未修改').waitFor()
      await closeBusinessFormPage(page, editor)
      await page
        .locator('[data-business-action-key="production-fact-edit-draft"]')
        .click()
      await editor.getByRole('status').getByText('尚未修改').waitFor()
      deps.assert.equal(await note.inputValue(), original)
      deps.assert.equal(
        await editor.locator('input[id$="quantity"]').inputValue(),
        '2'
      )
      await closeBusinessFormPage(page, editor)
    },
  }))
  return [
    ...draftScenarios,
    {
      name: 'business-form-page-credit-registration',
      path: '/erp/finance/payments',
      auth: 'admin',
      effectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.getByRole('tab', { name: /红冲/ }).click()
        await page
          .getByRole('button', { name: '登记红冲', exact: true })
          .click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor
          .getByRole('heading', { name: '登记红冲', exact: true })
          .waitFor()
        await assertBusinessFormPage(page, editor)
        await editor.locator('textarea').fill('红冲登记未保存')
        await closeBusinessFormPage(page, editor)
        await page.getByRole('tab', { name: /收付款/ }).click()
        await page
          .getByRole('button', { name: '登记收付款' })
          .click()
        await editor
          .getByRole('heading', { name: '登记收付款', exact: true })
          .waitFor()
        await editor.getByRole('status').getByText('尚未修改').waitFor()
        await closeBusinessFormPage(page, editor)
      },
    },
  ]
}
