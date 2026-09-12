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
        themeMode: ['purchase', 'shipment', 'suppliers'].includes(key)
          ? 'dark'
          : 'light',
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
            targetRowCount: 10,
            ...(key === 'sales' ? { addButtonName: '添加订货明细' } : {}),
            ...(['customers', 'suppliers'].includes(key)
              ? {
                  listSelector: '.erp-master-contact-list__items',
                  rowSelector: '.erp-master-contact-list__row',
                }
              : {}),
          })
          const contacts = ['customers', 'suppliers'].includes(key)
          const list = editor.locator(
            contacts
              ? '.erp-master-contact-list__items'
              : '.erp-sales-order-lines-form__list'
          )
          if (contacts) {
            const rows = list.locator('.erp-master-contact-list__row')
            await rows
              .nth(0)
              .getByLabel('联系人', { exact: true })
              .fill('采购联系人')
            await rows
              .nth(1)
              .getByLabel('联系人', { exact: true })
              .fill('收货联系人')
            await editor
              .getByRole('button', { name: '复制联系人条目 1', exact: true })
              .click()
            await rows
              .nth(1)
              .locator('input:focus')
              .waitFor({ state: 'visible' })
            deps.assert.equal(
              await rows
                .nth(1)
                .getByLabel('联系人', { exact: true })
                .inputValue(),
              '采购联系人'
            )
            deps.assert.equal(
              await rows
                .nth(2)
                .getByLabel('联系人', { exact: true })
                .inputValue(),
              '收货联系人'
            )
          }
          if (['sales', 'purchase', 'outsourcing'].includes(key)) {
            const rows = list.locator('.erp-sales-order-lines-form__row')
            const count = await rows.count()
            await rows
              .first()
              .getByRole('button', { name: '复制第 1 行' })
              .click()
            await rows
              .nth(1)
              .locator('input:focus, textarea:focus, select:focus')
              .waitFor({ state: 'visible' })
            deps.assert.equal(await rows.count(), count + 1)
          }
          for (const [variant, viewport] of [
            ['desktop', { width: 1440, height: 900 }],
            ['narrow', { width: 390, height: 844 }],
          ]) {
            await page.setViewportSize(viewport)
            await assertBusinessFormPage(page, editor)
            const rowSelector = contacts
              ? '.erp-master-contact-list__row'
              : '.erp-sales-order-lines-form__row'
            const rowCount = await editor.locator(rowSelector).count()
            await editor
              .getByRole('button', {
                name: key === 'sales' ? '添加订货明细' : '添加条目',
                exact: true,
              })
              .click()
            const focused = editor
              .locator(rowSelector)
              .nth(rowCount)
              .locator('input:focus, textarea:focus, select:focus')
            await focused.waitFor({ state: 'visible' })
            const focusBox = await focused.boundingBox()
            const bodyBox = await editor
              .locator('.erp-business-form-page__body')
              .boundingBox()
            deps.assert(
              focusBox.y >= bodyBox.y - 1 &&
                focusBox.y + focusBox.height <=
                  bodyBox.y + bodyBox.height + 1 &&
                focusBox.x >= bodyBox.x - 1 &&
                focusBox.x + focusBox.width <= bodyBox.x + bodyBox.width + 1,
              `${name}-${variant}: 新行输入应进入正文可视区`
            )
            if (key === 'sales') {
              await page.keyboard.type(`连续录入 ${variant}`)
              deps.assert.equal(
                await focused.inputValue(),
                `连续录入 ${variant}`,
                '新增后应能直接输入订货产品名称'
              )
              await editor
                .getByRole('button', { name: '添加订货明细', exact: true })
                .scrollIntoViewIfNeeded()
            }
            await page.screenshot({
              path: `${deps.outputDir}/${name}-${variant}-appended.png`,
            })
            if (!contacts) {
              const details = list.locator('.erp-line-item-details').first()
              if (!(await details.evaluate((node) => node.open))) {
                await details.locator('summary').click()
              }
            }
            const flow = await list.evaluate((node) => {
              const body = node.closest('.erp-business-form-page__body')
              return {
                listHeight: node.clientHeight,
                contentHeight: node.scrollHeight,
                bodyWidth: body.clientWidth,
                contentWidth: body.scrollWidth,
              }
            })
            deps.assert(
              flow.contentHeight <= flow.listHeight + 2,
              `${name}-${variant}: 展开补充信息后仍不应出现明细区纵向滚动 ${JSON.stringify(flow)}`
            )
            deps.assert(
              flow.contentWidth <= flow.bodyWidth + 1,
              `${name}-${variant}: 宽表不能撑开页面 ${JSON.stringify(flow)}`
            )
            const firstRow = list
              .locator(
                contacts ? '.erp-master-contact-list__row-head' : 'thead'
              )
              .first()
            await firstRow.evaluate((node) =>
              node.scrollIntoView({ block: 'start', inline: 'start' })
            )
            await page.waitForTimeout(350)
            await page.screenshot({
              path: `${deps.outputDir}/${name}-${variant}.png`,
              fullPage: true,
            })
          }
          await closeBusinessFormPage(page, editor)
        },
      }
    }),
    {
      ...scenarios.find(
        (scenario) => scenario.name === 'business-form-page-production-desktop'
      ),
      name: 'business-form-page-production-rapid-add',
      verify: async (page) => {
        await page.getByRole('button', { name: '新建生产订单' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: '新建生产订单' }).waitFor()
        for (const viewport of [
          { width: 1440, height: 900 },
          { width: 390, height: 844 },
        ]) {
          await page.setViewportSize(viewport)
          for (let count = 0; count < 3; count += 1) {
            const rows = editor.locator('.erp-production-order-line')
            const before = await rows.count()
            deps.assert.equal(
              await editor
                .getByRole('button', { name: '添加明细', exact: true })
                .count(),
              1,
              `production-${viewport.width}-${count}: ${await editor.innerText()}`
            )
            await editor
              .getByRole('button', { name: '添加明细', exact: true })
              .click()
            const input = rows.nth(before).locator('input:focus')
            await input.waitFor({ state: 'visible' })
            deps.assert.equal(await rows.count(), before + 1)
            const inputBox = await input.boundingBox()
            const bodyBox = await editor
              .locator('.erp-business-form-page__body')
              .boundingBox()
            deps.assert(
              inputBox.y >= bodyBox.y &&
                inputBox.y + inputBox.height <= bodyBox.y + bodyBox.height
            )
          }
          await assertBusinessFormPage(page, editor)
        }
        await page.setViewportSize({ width: 1440, height: 900 })
        await closeBusinessFormPage(page, editor)
        await page.getByRole('button', { name: '新建生产订单' }).click()
        await editor.getByRole('heading', { name: '新建生产订单' }).waitFor()
        deps.assert.equal(
          await editor.locator('.erp-production-order-line').count(),
          1
        )
        await closeBusinessFormPage(page, editor)
      },
    },
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
