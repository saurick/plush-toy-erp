import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'
import { createBusinessFormPageDraftScenarios } from './businessFormPageDraftScenarios.mjs'
import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'

export function createBusinessFormPagesScenarios(deps) {
  const documents = [
    ['customers', '/erp/master/partners/customers', '新建客户', '新建客户档案'],
    [
      'suppliers',
      '/erp/master/partners/suppliers',
      '新建供应商',
      '新建供应商或加工厂',
    ],
    ['materials', '/erp/master/materials', '新建材料', '新建材料档案'],
    ['products', '/erp/master/products', '新建产品', '新建产品'],
    [
      'product-skus',
      '/erp/master/products?catalog=product_skus',
      '新建产品规格',
      '新建产品规格',
    ],
    ['processes', '/erp/engineering/processes', '新建加工环节', '新建加工环节'],
    ['production', '/erp/production/orders', '新建生产订单', '新建生产订单'],
    [
      'quality',
      '/erp/production/quality-inspections',
      '补建来料质检',
      '生成来料质检草稿',
    ],
    ['payment', '/erp/finance/payments', '登记收付款', '登记收付款'],

    ['bom', '/erp/purchase/material-bom', '新建草稿', '新建 BOM 草稿'],
    [
      'sales',
      '/erp/sales/project-orders/sales-orders',
      '新建订单',
      '新建销售订单',
    ],
    ['purchase', '/erp/purchase/accessories', '新建采购订单', '新建采购订单'],
    [
      'outsourcing',
      '/erp/purchase/processing-contracts',
      '新建加工合同',
      '新建加工合同',
    ],
    ['shipment', '/erp/warehouse/shipments', '新建草稿', '新建出货单'],
  ]
  const scenarios = documents.map(([key, path, triggerName, title]) => ({
    name: `business-form-page-${key}-desktop`,
    path,
    auth: 'admin',
    effectiveSession: {
      ...deps.customerRuntimeEffectiveSession,
      pages: [
        ...deps.customerRuntimeEffectiveSession.pages,
        'processes',
        'production-orders',
        'finance-payments',
      ],
    },
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const trigger = page.getByRole('button', { name: triggerName })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('heading', { name: title, exact: true }).waitFor()
      await assertBusinessFormPage(page, editor)
      await page.waitForFunction(() =>
        document.activeElement?.closest('.erp-business-form-page:not([hidden])')
      )
      await page.waitForFunction(
        () =>
          document
            .querySelector('.erp-business-form-page:not([hidden])')
            ?.getAttribute('data-unsaved') === 'false',
        undefined,
        { timeout: 4000 }
      )
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await editor.waitFor({ state: 'hidden' })
      await page.waitForFunction(
        (name) => document.activeElement?.textContent?.includes(name),
        triggerName,
        { timeout: 2000 }
      )
      deps.assert.equal(
        await trigger.evaluate((node) => document.activeElement === node),
        true,
        `${key}: returning to the list restores keyboard focus`
      )

      await trigger.click()
      await editor.waitFor()
      const note =
        key === 'payment'
          ? editor.getByLabel('收付款单号')
          : key === 'products'
            ? editor.getByLabel('内部款号')
            : key === 'product-skus'
              ? editor.locator('input#barcode')
              : editor.locator('textarea:visible').first()
      const originalNote = await note.inputValue()
      await note.fill('整页编辑保留输入')
      deps.assert.equal(await editor.getAttribute('data-unsaved'), 'true')
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await page.getByRole('button', { name: '继续编辑', exact: true }).click()
      await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden' })
      deps.assert.equal(await note.inputValue(), '整页编辑保留输入')
      await note.fill(originalNote)
      await editor.getByRole('status').getByText('尚未修改').waitFor()
      await note.fill('整页编辑保留输入')
      await page.screenshot({
        path: `${deps.outputDir}/business-form-page-${key}.png`,
        fullPage: true,
      })
      deps.assert.equal(
        await page.evaluate(() => {
          const event = new Event('beforeunload', { cancelable: true })
          window.dispatchEvent(event)
          return event.defaultPrevented
        }),
        true,
        `${key}: reload must warn before losing edits`
      )
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await page.getByRole('button', { name: '放弃修改', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })
      await trigger.click()
      await editor.waitFor()
      deps.assert.notEqual(
        await (
          key === 'payment'
            ? editor.getByLabel('收付款单号')
            : key === 'products'
              ? editor.getByLabel('内部款号')
              : key === 'product-skus'
                ? editor.locator('input#barcode')
                : editor.locator('textarea:visible').first()
        ).inputValue(),
        '整页编辑保留输入'
      )
      await editor
        .getByRole('button', { name: '返回列表', exact: true })
        .click()
      await editor.waitFor({ state: 'hidden' })
    },
  }))
  return [
    ...createBusinessFormPageDraftScenarios(deps),
    ...scenarios,
    ...[
      'sales',
      'purchase',
      'outsourcing',
      'shipment',
      'customers',
      'suppliers',
    ].map((key) => {
      const original = scenarios.find(
        (scenario) => scenario.name === `business-form-page-${key}-desktop`
      )
      const document = documents.find(([documentKey]) => documentKey === key)
      const name = `business-form-page-${key}-rapid-add`
      return {
        ...original,
        name,
        verify: async (page) => {
          await page.getByRole('button', { name: document[2] }).click()
          const editor = page.locator('.erp-business-form-page:not([hidden])')
          await editor
            .getByRole('heading', { name: document[3], exact: true })
            .waitFor()
          await assertBusinessFormPage(page, editor)
          const { assertLineItemAddActionScrollsToNewRow } =
            createLineItemUnitAssertions(deps)
          await assertLineItemAddActionScrollsToNewRow(editor, {
            scenarioName: name,
            ...(['customers', 'suppliers', 'shipment'].includes(key)
              ? {
                  listSelector: '.erp-master-contact-list__items',
                  rowSelector: '.erp-master-contact-list__row',
                }
              : {}),
          })
          await closeBusinessFormPage(page, editor)
        },
      }
    }),
    ...[
      ['customers', 'mobile', { width: 390, height: 844 }, 'light'],
      ['suppliers', 'dark', { width: 1440, height: 900 }, 'dark'],
      ['production', 'mobile', { width: 390, height: 844 }, 'light'],
      ['payment', 'dark-tablet', { width: 720, height: 900 }, 'dark'],
    ].map(([key, variant, viewport, themeMode]) => ({
      ...scenarios.find(
        (scenario) => scenario.name === `business-form-page-${key}-desktop`
      ),
      name: `business-form-page-${key}-${variant}`,
      viewport,
      themeMode,
    })),
    {
      name: 'business-form-page-pending-attachment-recovery',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: '新建草稿' })
        await trigger.click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('status').getByText('尚未修改').waitFor()
        const attachmentInput = editor.locator(
          '.business-attachment-panel input[type="file"]'
        )
        const file = {
          name: '未保存附件.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('整页编辑待上传附件测试'),
        }
        await attachmentInput.setInputFiles(file)
        await editor.getByText(file.name, { exact: true }).waitFor()
        deps.assert.equal(await editor.getAttribute('data-unsaved'), 'true')
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await editor.getByText(file.name, { exact: true }).waitFor()
        await editor
          .getByRole('button', { name: '移除待上传附件', exact: true })
          .click()
        await editor.getByRole('status').getByText('尚未修改').waitFor()
        await attachmentInput.setInputFiles(file)
        await editor.getByText(file.name, { exact: true }).waitFor()
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })
        await trigger.click()
        await editor.getByRole('status').getByText('尚未修改').waitFor()
        deps.assert.equal(
          await editor.getByText(file.name, { exact: true }).count(),
          0
        )
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })
      },
    },
    {
      name: 'business-form-page-navigation-recovery',
      path: '/erp/master/materials',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page
          .locator('.erp-admin-menu')
          .getByText('物料清单（BOM）', { exact: true })
          .click()
        await page.getByRole('button', { name: '新建草稿' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.locator('textarea').fill('导航保护测试')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await page
          .locator('.erp-admin-menu')
          .getByText('材料档案', { exact: true })
          .click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        deps.assert.equal(
          await editor.locator('textarea').inputValue(),
          '导航保护测试'
        )
        const back = page.goBack().catch(() => null)
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await back
        await editor.waitFor()
        deps.assert.ok(page.url().endsWith('/erp/purchase/material-bom'))
        const leave = page.goBack().catch(() => null)
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await leave
        await page
          .getByRole('heading', { name: '材料档案', exact: true })
          .waitFor()
        await page
          .locator('.erp-admin-menu')
          .getByText('物料清单（BOM）', { exact: true })
          .click()
        await page.getByRole('button', { name: '新建草稿' }).click()
        await editor.locator('textarea').fill('刷新放弃测试')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })
        await page
          .getByRole('heading', { name: '物料清单（BOM）', exact: true })
          .waitFor()
      },
    },
  ]
}
