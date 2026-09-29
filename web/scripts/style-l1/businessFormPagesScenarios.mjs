import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'
import { createBusinessFormPageDraftScenarios } from './businessFormPageDraftScenarios.mjs'
import { createLineItemUnitAssertions } from './lineItemUnitAssertions.mjs'
import { assertBusinessFormSections } from './businessFormSectionAssertions.mjs'

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
      await trigger.click({ trial: true })
      await trigger.focus()
      await page.keyboard.press('Enter')
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      await editor.getByRole('heading', { name: title, exact: true }).waitFor()
      await assertBusinessFormPage(page, editor)
      await page.screenshot({
        path: `${deps.outputDir}/business-form-page-${key}-initial.png`,
        fullPage: true,
      })
      await assertBusinessFormSections(page, editor, key)
      if (key === 'outsourcing') {
        const headers = await editor
          .locator('.erp-line-item-table thead th')
          .allTextContents()
        deps.assert.deepEqual(
          headers.map((value) => value.replace(/\*|\s/gu, '')),
          [
            '序号',
            '产品订单编号',
            '加工品类',
            '产品/材料',
            '加工项目',
            '工序',
            '单位',
            '单价',
            '加工数量',
            '加工金额',
            '预计回货日期',
            '操作',
          ]
        )
        const parties = editor.locator(
          '.erp-outsourcing-contract-form__parties section'
        )
        const left = await parties.nth(0).boundingBox()
        const right = await parties.nth(1).boundingBox()
        deps.assert.ok(
          left &&
            right &&
            Math.abs(left.y - right.y) < 2 &&
            left.x + left.width <= right.x + 2,
          'contract parties retain the paired Excel header'
        )
      }
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
      // The page focuses its first control after business defaults and the dirty baseline are ready.
      await page.waitForFunction(() =>
        document.activeElement?.closest('.erp-business-form-page__body')
      )
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
      await page.waitForFunction(
        () =>
          document.querySelector('.erp-business-form-page:not([hidden])')
            ?.dataset.unsaved === 'true'
      )
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
      if (key === 'outsourcing') {
        const row = editor.locator('.erp-line-item-table__main-row').first()
        const price = row.locator('input[id$="_unit_price"]')
        const quantity = row.locator('input[id$="_outsourcing_quantity"]')
        const amount = row.getByRole('textbox', { name: '第 1 行加工金额' })
        const originalPrice = await price.inputValue()
        const originalQuantity = await quantity.inputValue()
        await price.fill('2.5')
        await quantity.fill('12')
        deps.assert.equal(
          Number(await amount.inputValue()),
          30,
          'amount follows the edited quantity and price'
        )
        await page.screenshot({
          path: `${deps.outputDir}/outsourcing-excel-form.png`,
          fullPage: true,
        })
        await price.fill('')
        deps.assert.equal(
          await amount.inputValue(),
          '',
          'clearing price clears the amount'
        )
        await price.fill(originalPrice)
        await quantity.fill(originalQuantity)
      }
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
            ...(key === 'purchase'
              ? { addButtonName: '添加采购明细' }
              : {}),
            ...(key === 'outsourcing'
              ? { addButtonName: '添加加工明细' }
              : {}),
            ...(key === 'shipment'
              ? { addButtonName: '添加出货明细' }
              : {}),
            ...(['customers', 'suppliers'].includes(key)
              ? {
                  addButtonName: '添加联系人',
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
          const columnWidths = () =>
            list.locator('thead th').evaluateAll((headers) =>
              headers.map((header) => ({
                label: header.textContent.replace(/\*/gu, '').trim(),
                width: header.getBoundingClientRect().width,
              }))
            )
          await page.setViewportSize({ width: 1920, height: 1000 })
          const desktopColumns = await columnWidths()
          await page.setViewportSize({ width: 2560, height: 1000 })
          const wideColumns = await columnWidths()
          const shortColumn = contacts
            ? /^(手机|电话|主联系人|操作)$/u
            : /^(序号|.*数量|单位|单价|.*金额|.*日期|操作)$/u
          const fixedColumns = wideColumns.filter(({ label }) =>
            shortColumn.test(label)
          )
          deps.assert(fixedColumns.length >= 3, `${name}: 应覆盖短内容列`)
          for (const column of fixedColumns) {
            const previous = desktopColumns.find(
              ({ label }) => label === column.label
            )
            deps.assert(
              column.width <= 196 &&
                Math.abs(column.width - previous.width) <= 1,
              `${name}: ${column.label}不应随大屏继续拉宽 ${JSON.stringify({ previous, column })}`
            )
          }
          const textColumn = contacts
            ? '联系人'
            : key === 'outsourcing'
              ? '产品 / 材料'
              : key === 'purchase'
                ? '材料名称'
                : key === 'sales'
                  ? '订货产品 / 客户款号'
                  : '产品'
          deps.assert(
            wideColumns.find(({ label }) => label === textColumn).width >
              desktopColumns.find(({ label }) => label === textColumn).width,
            `${name}: 剩余空间应分配给长内容`
          )
          if (!contacts) {
            const quantity = list
              .locator('.erp-sales-order-lines-form__row')
              .first()
              .getByLabel(
                key === 'sales'
                  ? '订单数量'
                  : key === 'purchase'
                    ? '采购数量'
                    : key === 'outsourcing'
                      ? '加工数量'
                      : '数量',
                { exact: true }
              )
            const previousValue = await quantity.inputValue()
            await quantity.fill('123456789')
            deps.assert.equal(await quantity.inputValue(), '123456789')
            const inputWidth = await quantity.evaluate(
              (node) => node.getBoundingClientRect().width
            )
            deps.assert(inputWidth >= 96, `${name}: 数量输入需保留可读宽度`)
            await quantity.fill(previousValue)
          }
          await assertBusinessFormPage(page, editor)
          if (key === 'sales') {
            await list.scrollIntoViewIfNeeded()
            await page.screenshot({
              path: `${deps.outputDir}/${name}-wide.png`,
            })
          }
          await page.setViewportSize({ width: 1440, height: 900 })
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
            const nameLabel = key === 'sales' ? '订货产品名称' : '产品名称'
            if (key === 'purchase') {
              await rows.nth(0).locator('summary').click()
              await rows.nth(1).locator('summary').click()
            }
            if (key !== 'outsourcing') {
              await rows
                .first()
                .getByLabel(nameLabel, { exact: true })
                .fill('尚未保存的明细甲')
              await rows
                .nth(1)
                .getByLabel(nameLabel, { exact: true })
                .fill('相邻明细乙')
            }
            await rows
              .first()
              .getByRole('button', { name: '复制第 1 行' })
              .click()
            await rows
              .nth(1)
              .locator('input:focus, textarea:focus, select:focus')
              .waitFor({ state: 'visible' })
            deps.assert.equal(await rows.count(), count + 1)
            if (key !== 'outsourcing') {
              const valueAt = (index) =>
                rows
                  .nth(index)
                  .getByLabel(nameLabel, { exact: true })
                  .inputValue()
              deps.assert.equal(await valueAt(1), '尚未保存的明细甲')
              deps.assert.equal(await valueAt(2), '相邻明细乙')
              if (key === 'purchase') {
                await rows.nth(1).locator('summary').click()
              }
              await rows
                .nth(1)
                .getByLabel(nameLabel, { exact: true })
                .fill('独立修改的复制行')
              await rows
                .nth(1)
                .getByRole('button', { name: '上移第 2 行', exact: true })
                .click()
              deps.assert.equal(await valueAt(0), '独立修改的复制行')
              deps.assert.equal(await valueAt(1), '尚未保存的明细甲')
              await rows
                .first()
                .getByRole('button', { name: /移除行/ })
                .click()
              deps.assert.equal(await valueAt(0), '尚未保存的明细甲')
              deps.assert.equal(await valueAt(1), '相邻明细乙')
            }
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
                name: contacts
                  ? '添加联系人'
                  : key === 'sales'
                    ? '添加订货明细'
                    : key === 'purchase'
                      ? '添加采购明细'
                      : key === 'outsourcing'
                        ? '添加加工明细'
                        : '添加出货明细',
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
              const note = details.locator('textarea[id$="_note"]').first()
              const previousNote = await note.inputValue()
              await note.fill(
                '第一行说明\n第二行说明\n第三行说明\n第四行说明\n第五行说明'
              )
              await page.waitForFunction(() =>
                [
                  ...document.querySelectorAll(
                    '.erp-line-item-details[open] textarea'
                  ),
                ].some(
                  (input) =>
                    input.value.includes('第五行说明') &&
                    input.clientHeight >= input.scrollHeight - 2
                )
              )
              const noteHeight = (await note.boundingBox()).height
              deps.assert(
                noteHeight >= 100,
                `${name}-${variant}: 长备注需要随内容增高`
              )
              await note.fill(previousNote)
              if (variant === 'desktop' && key !== 'purchase') {
                const paired = await details
                  .locator('.erp-line-item-details__notes > .ant-form-item')
                  .evaluateAll((nodes) =>
                    nodes.map((node) => node.getBoundingClientRect().top)
                  )
                deps.assert.equal(paired.length, 2, `${name}: 两个关联字段同组`)
                deps.assert(
                  Math.abs(paired[0] - paired[1]) < 2,
                  `${name}: 展开区关联字段应并排`
                )
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
              .locator(contacts ? '.erp-contact-editor__fields' : 'thead')
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
          const first = editor.locator('.erp-production-order-line').first()
          const details = first.locator('details')
          await details.locator('summary').click()
          const layout = await first
            .locator('.erp-production-order-line__supplement')
            .evaluate((node) => ({
              height: node.getBoundingClientRect().height,
              top: [...node.children].map(
                (field) => field.getBoundingClientRect().top
              ),
            }))
          if (viewport.width > 720) {
            deps.assert(
              layout.height < 200,
              `生产展开区应紧凑：${JSON.stringify(layout)}`
            )
            deps.assert(
              Math.abs(layout.top[0] - layout.top[1]) < 2,
              '生产路线与验货应并排'
            )
          } else {
            deps.assert(layout.top[1] > layout.top[0], '窄屏生产字段自然换行')
          }
          const note = first.getByLabel('明细备注', { exact: true })
          await note.fill(
            '第一行生产要求\n第二行生产要求\n第三行生产要求\n第四行生产要求\n第五行生产要求'
          )
          await page.waitForFunction(() => {
            const input = document.querySelector(
              '.erp-production-order-line textarea'
            )
            return (
              input.clientHeight >= input.scrollHeight - 2 &&
              input.clientHeight >= 100
            )
          })
          await note.fill('')
          await first.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: `${deps.outputDir}/production-expanded-density-${viewport.width}.png`,
          })
          await details.locator('summary').click()
          for (let count = 0; count < 3; count += 1) {
            const rows = editor.locator('.erp-production-order-line')
            const before = await rows.count()
            deps.assert.equal(
              await editor
                .getByRole('button', {
                  name: '添加生产明细',
                  exact: true,
                })
                .count(),
              1,
              `production-${viewport.width}-${count}: ${await editor.innerText()}`
            )
            await editor
              .getByRole('button', {
                name: '添加生产明细',
                exact: true,
              })
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
        const rows = editor.locator('.erp-production-order-line')
        for (const [index, note] of ['待移除说明', '保留生产说明'].entries()) {
          await rows.nth(index).locator('summary').click()
          await rows
            .nth(index)
            .getByLabel('明细备注', { exact: true })
            .fill(note)
          await rows.nth(index).locator('summary').click()
        }
        await rows.first().getByRole('button', { name: '移除明细 1' }).click()
        deps.assert.match(
          await rows.first().locator('summary').innerText(),
          /保留生产说明/u
        )
        await rows.first().locator('summary').click()
        deps.assert.equal(
          await rows
            .first()
            .getByLabel('明细备注', { exact: true })
            .inputValue(),
          '保留生产说明'
        )
        await rows.first().getByLabel('明细备注', { exact: true }).fill('')
        deps.assert.doesNotMatch(
          await rows.first().locator('summary').innerText(),
          /保留生产说明/u
        )
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
        const openModule = async (label) => {
          await page.locator('.erp-module-catalog-trigger:visible').click()
          const catalog = page.getByRole('dialog', {
            name: '全部模块',
            exact: true,
          })
          await catalog.waitFor({ state: 'visible' })
          await catalog
            .getByRole('button', { name: label, exact: true })
            .click()
        }
        await openModule('物料清单（BOM）')
        await page.getByRole('button', { name: '新建草稿' }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.locator('textarea').fill('导航保护测试')
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await openModule('材料档案')
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
        await openModule('物料清单（BOM）')
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
