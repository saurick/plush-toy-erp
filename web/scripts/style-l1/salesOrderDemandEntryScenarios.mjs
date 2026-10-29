import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'

export function createSalesOrderDemandEntryVerifier(deps) {
  const {
    assert,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessHeaderHasNoSectionTitle,
    assertBusinessMainTableInitialSelectionEmpty,
    assertBusinessMainTableSortableColumns,
    assertBusinessModuleToolbarControlStyle,
    assertBusinessPageRefreshEntrypoint,
    assertNoHorizontalOverflow,
    assertOrderLifecycleActionsConsolidated,
    assertTextAbsent,
    expectButton,
    expectHeading,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
    verifyBusinessActionFormModal,
    verifyBusinessRowDoubleClickModal,
  } = deps
  const {
    assertLineItemAddActionScrollsToNewRow,
    assertLineItemDuplicateAction,
    assertLineItemFieldLayout,
    assertLineAmountCalculation,
    assertLineQuantityPrecisionBlocksAmount,
    assertLineQuantityUnitSuffix,
    assertLineSourceSummaryReadableUnit,
    assertNonItemTextareaFullRow,
    assertBusinessCollaborationPanelAbsent,
    assertNoListDeleteTrashToolbar,
    assertCurrentOperationBarCompact,
  } = createBusinessFormalAssertions(deps)
  const verifySalesOrderDemandEntry = async (page) => {
    await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
      waitUntil: 'domcontentloaded',
    })
    await expectHeading(page, '销售订单')
    await expectButton(page, '新建订单')
    await expectText(page, '当前操作')
    await assertCurrentOperationBarCompact(page, {
      scenarioName: 'business-formal-sales-orders',
    })
    await page.getByText('SO-STYLE-L1', { exact: true }).first().waitFor()
    await assertBusinessCollaborationPanelAbsent(
      page,
      'business-formal-sales-orders'
    )
    await assertNoListDeleteTrashToolbar(page)
    await assertBusinessMainTableInitialSelectionEmpty(page, {
      scenarioName: 'business-formal-sales-orders',
    })
    await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
    await assertOrderLifecycleActionsConsolidated(page, {
      scenarioName: 'business-formal-sales-orders',
      primaryActionLabel: '提交订单',
      menuActionLabels: ['取消'],
      absentButtonLabels: ['生效', '关闭', '取消'],
    })
    await assertBusinessPageRefreshEntrypoint(page, {
      scenarioName: 'business-formal-sales-orders',
    })
    await assertBusinessHeaderHasNoSectionTitle(page, {
      scenarioName: 'business-formal-sales-orders',
    })
    await assertBusinessModuleToolbarControlStyle(page, {
      scenarioName: 'business-formal-sales-orders',
    })
    await assertBusinessMainTableSortableColumns(page, {
      scenarioName: 'business-formal-sales-orders',
    })
    await assertBusinessFormModalKeyboardRecovery(page, {
      triggerName: '新建订单',
      titleText: '新建销售订单',
      scenarioName: 'business-formal-sales-orders',
    })
    await page.getByRole('button', { name: '新建订单' }).click()
    const completeCommercialTerms = async (form) => {
      for (const [label, value] of [
        ['计税方式', '不计税'],
        ['报价是否含运费', '报价含运费'],
      ]) {
        await form.getByLabel(label, { exact: true }).click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(value, { exact: true })
          .click()
      }
    }
    const draftForm = page.locator('.erp-business-form-page:not([hidden])')
    await draftForm.getByLabel('客户', { exact: true }).click()
    await page.getByText('CUS-STYLE-L1 - 暗色客户', { exact: true }).click()
    await completeCommercialTerms(draftForm)
    const [draftSaved] = await Promise.all([
      page.waitForRequest(
        (request) =>
          request.url().endsWith('/rpc/sales_order') &&
          request.postDataJSON()?.method === 'save_sales_order_with_items'
      ),
      draftForm
        .locator('.erp-business-form-page__footer .ant-btn-primary')
        .click(),
    ])
    assert.deepEqual(
      draftSaved.postDataJSON().params.items,
      [],
      '草稿不得自动提交空白明细'
    )
    await draftForm.waitFor({ state: 'hidden' })
    await verifyBusinessActionFormModal(page, {
      buttonName: '新建订单',
      titleText: '新建销售订单',
      minFieldCount: 6,
      screenshotName: 'business-formal-sales-order-form-modal',
      expectedTexts: ['订货明细', '添加订货明细', '暂无订货明细'],
      absentTexts: ['产品引用 ID', '单位引用 ID', '从已有规格添加'],
      afterOpen: async (modal) => {
        await completeCommercialTerms(modal)
        assert.equal(
          await modal.locator('.erp-sales-order-lines-form__row').count(),
          0
        )
        assert.equal(
          await modal
            .getByRole('button', { name: '调整明细顺序', exact: true })
            .count(),
          0
        )
        await modal
          .getByRole('button', { name: '添加订货明细', exact: true })
          .click()
        await modal
          .getByLabel('订货产品名称', { exact: true })
          .fill('客户新款毛绒挂件')
        await modal.getByLabel('单位', { exact: true }).click()
        await page
          .locator(
            '.ant-select-dropdown:visible .ant-select-item-option-content'
          )
          .getByText('个', { exact: true })
          .click()
        assert.equal(
          await modal
            .getByRole('button', { name: '调整明细顺序', exact: true })
            .count(),
          0
        )
        await modal
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await modal.getByText('请填写订单数量', { exact: true }).waitFor()
        assert.equal(
          await modal.getByLabel('订货产品名称', { exact: true }).inputValue(),
          '客户新款毛绒挂件',
          '校验失败应保留已填写的需求'
        )
        await modal
          .getByLabel('订货产品名称', { exact: true })
          .scrollIntoViewIfNeeded()
        await assertNonItemTextareaFullRow(modal, {
          labels: ['报价备注', '备注'],
          scenarioName: 'business-formal-sales-order-form-modal',
        })
        await assertLineQuantityUnitSuffix(modal, {
          label: '订单数量',
          expectedText: '个',
          scenarioName: 'business-formal-sales-order-form-modal-empty-line',
        })
        await assertLineItemFieldLayout(modal, {
          scenarioName: 'business-formal-sales-order-form-modal-empty-line',
          visibleThroughLabel: '单位',
          absentLabels: ['产品编号快照', '产品名称快照', '颜色快照'],
        })
        const amountInput = modal
          .locator('.erp-line-item-field--money input[readonly]')
          .first()
        await amountInput.scrollIntoViewIfNeeded()
        assert(
          await amountInput.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            const list = node
              .closest('.erp-sales-order-lines-form__list')
              ?.getBoundingClientRect()
            return Boolean(
              list && rect.left >= list.left - 1 && rect.right <= list.right + 1
            )
          }),
          '销售订单金额须可通过明细区横向滚动完整查看'
        )
        await assertLineQuantityPrecisionBlocksAmount(modal, {
          quantityLabel: '订单数量',
          unitPriceLabel: '单价',
          amountLabel: '金额',
          quantity: '123.11',
          unitPrice: '12.11',
          expectedErrorText: '当前单位只允许整数数量',
          scenarioName: 'business-formal-sales-order-form-modal-empty-line',
        })
        await assertLineAmountCalculation(modal, {
          quantityLabel: '订单数量',
          unitPriceLabel: '单价',
          amountLabel: '金额',
          quantity: '11',
          unitPrice: '12.11',
          expected: '133.21',
          scenarioName: 'business-formal-sales-order-form-modal-empty-line',
        })
        assert.equal(
          await modal
            .locator('.erp-line-items-form__stat--emphasis strong')
            .innerText(),
          'CNY 133.21',
          '订单总额在汇总区保持可见并沿用税费运费计算'
        )
        await modal
          .getByRole('button', { name: '金额明细', exact: true })
          .click()
        const amountDetails = page.locator(
          '.erp-line-items-form__amount-details:visible'
        )
        assert.equal(
          await amountDetails
            .locator('div')
            .filter({ hasText: '货款金额' })
            .locator('dd')
            .innerText(),
          'CNY 133.21',
          '数量和单价齐全时，货款应显示真实计算结果'
        )
        await modal
          .getByRole('button', { name: '金额明细', exact: true })
          .click()
        const demandRow = modal
          .locator('.erp-sales-order-lines-form__row')
          .first()
        const details = demandRow.locator('.erp-line-item-details')
        assert.equal(await details.evaluate((node) => node.open), false)
        await details.locator('summary').click()
        await demandRow.getByLabel('备注', { exact: true }).fill('分两批交货')
        const sampleQuantity = demandRow.getByLabel('船头版数量', {
          exact: true,
        })
        await sampleQuantity.fill('-1')
        await details.locator('summary').click()
        await modal.getByLabel('客户', { exact: true }).click()
        await page.getByText('CUS-STYLE-L1 - 暗色客户', { exact: true }).click()
        await modal
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await demandRow.getByText('请填写非负数量', { exact: true }).waitFor()
        assert.equal(
          await details.evaluate((node) => node.open),
          true,
          '校验应自动展开含错误的补充信息'
        )
        assert.equal(
          await sampleQuantity.evaluate(
            (node) => document.activeElement === node
          ),
          true,
          '校验应聚焦出错字段'
        )
        await sampleQuantity.fill('0')
        await details.locator('summary').click()
        assert.equal(
          await demandRow.getByLabel('备注', { exact: true }).inputValue(),
          '分两批交货'
        )
        const [savedDemand] = await Promise.all([
          page.waitForRequest(
            (request) =>
              request.url().endsWith('/rpc/sales_order') &&
              request.postDataJSON()?.method === 'save_sales_order_with_items'
          ),
          modal
            .locator('.erp-business-form-page__footer .ant-btn-primary')
            .click(),
        ])
        const savedItems = savedDemand.postDataJSON().params.items
        assert.equal(savedItems.length, 1)
        assert.equal(
          savedItems[0].note,
          '分两批交货',
          '收起补充信息不能丢失保存内容'
        )
        assert.equal(savedItems[0].requested_product_name, '客户新款毛绒挂件')
        await modal.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '新建订单' }).click()
        await modal
          .getByRole('button', { name: '添加订货明细', exact: true })
          .click()
        await modal
          .getByLabel('订货产品名称', { exact: true })
          .fill('客户新款毛绒挂件')
        await modal.getByLabel('订单数量', { exact: true }).fill('11')
        await modal.getByLabel('单价', { exact: true }).fill('12.11')
        const linkedRow = modal
          .locator('.erp-sales-order-lines-form__row')
          .first()
        await linkedRow.locator('.erp-line-item-details > summary').click()
        const skuSelect = linkedRow.getByLabel('已有规格（选填）', {
          exact: true,
        })
        await skuSelect.click()
        await skuSelect.fill('SKU-STYLE-L1')
        await page
          .getByText('SKU-STYLE-L1 / 样式产品 SKU', { exact: true })
          .click()
        assert.equal(
          await linkedRow
            .getByLabel('订货产品名称', { exact: true })
            .inputValue(),
          '客户新款毛绒挂件'
        )
        assert.equal(
          await linkedRow.getByLabel('订单数量', { exact: true }).inputValue(),
          '11'
        )
        assert.equal(
          await linkedRow.getByLabel('单价', { exact: true }).inputValue(),
          '12.11'
        )
        await assertLineQuantityUnitSuffix(modal, {
          label: '订单数量',
          expectedText: '个',
          scenarioName: 'business-formal-sales-order-form-modal',
        })
        await assertLineSourceSummaryReadableUnit(modal, {
          label: '已关联产品',
          expectedText: '个',
          scenarioName: 'business-formal-sales-order-form-modal',
        })
        const skuField = linkedRow.locator(
          '.erp-line-item-field--source .ant-select'
        )
        await skuField.hover()
        await skuField.locator('.ant-select-clear').click()
        assert.equal(
          await linkedRow.getByText('已关联产品', { exact: true }).count(),
          0
        )
        assert.equal(
          await linkedRow.getByLabel('订单数量', { exact: true }).inputValue(),
          '11'
        )
        assert.equal(
          await linkedRow.getByLabel('单价', { exact: true }).inputValue(),
          '12.11'
        )
        await skuSelect.click()
        await skuSelect.fill('SKU-STYLE-L1')
        await page
          .getByText('SKU-STYLE-L1 / 样式产品 SKU', { exact: true })
          .click()
        await modal
          .getByRole('button', { name: '添加订货明细', exact: true })
          .click()
        const readDemandRows = () =>
          modal
            .locator('.erp-sales-order-lines-form__row')
            .evaluateAll((rows) =>
              rows.map((row) =>
                [
                  'requested_product_name',
                  'product_id',
                  'product_sku_id',
                  'ordered_quantity',
                  'unit_price',
                ].map(
                  (field) => row.querySelector(`[id$="_${field}"]`)?.value || ''
                )
              )
            )
        const beforeOrder = await readDemandRows()
        assert.equal(
          beforeOrder.length,
          2,
          '行内关联规格不新增明细，添加按钮每次新增一行'
        )
        assert.equal(
          await modal
            .getByRole('button', { name: '调整明细顺序', exact: true })
            .count(),
          0,
          '多条明细不提供独立排序弹窗'
        )
        assert.equal(
          await modal.getByRole('button', { name: /^上移第 /u }).count(),
          0,
          '订货明细不提供行内排序操作'
        )
        assert.deepEqual(
          await readDemandRows(),
          beforeOrder,
          '明细保持录入顺序与原有内容'
        )
        await modal
          .getByRole('button', { name: '添加订货明细', exact: true })
          .focus()
        await page
          .locator('.ant-select-dropdown:visible')
          .waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 760, height: 900 })
        await assertNoHorizontalOverflow(
          page,
          'sales-order-demand-entry-narrow'
        )
        await modal
          .getByLabel('订货产品名称', { exact: true })
          .first()
          .scrollIntoViewIfNeeded()
        await page.screenshot({
          path: path.join(outputDir, 'sales-order-demand-entry-narrow.png'),
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        await assertLineItemDuplicateAction(modal, {
          scenarioName: 'business-formal-sales-order-form-modal',
        })
        await assertLineItemAddActionScrollsToNewRow(modal, {
          addButtonName: '添加订货明细',
          scenarioName: 'business-formal-sales-order-form-modal',
        })
        await modal
          .getByRole('button', { name: '金额明细', exact: true })
          .click()
        assert.equal(
          await page
            .locator('.erp-line-items-form__amount-details:visible')
            .locator('div')
            .filter({ hasText: '货款金额' })
            .locator('dd')
            .innerText(),
          '待补齐',
          '存在未填写数量或单价的明细时，货款不能被显示成零'
        )
        await modal
          .getByRole('button', { name: '金额明细', exact: true })
          .click()
        await page.setViewportSize({ width: 1920, height: 1080 })
        await modal
          .locator('.erp-sales-order-lines-form__head')
          .evaluate((node) => node.scrollIntoView({ block: 'start' }))
        await page.waitForTimeout(350)
        await page.screenshot({
          path: path.join(outputDir, 'sales-order-lines-wide.png'),
        })
        await page.setViewportSize({ width: 1440, height: 900 })
      },
    })
    await assertNoHorizontalOverflow(page, 'business-standard-sales-orders')
    await verifyBusinessRowDoubleClickModal(page, {
      rowText: 'SO-STYLE-L1',
      titleText: '编辑销售订单',
      scenarioName: 'business-formal-sales-orders',
      afterModalOpen: async () => {
        await expectText(page, '订货明细')
        const editedRow = page
          .locator(
            '.erp-business-form-page:not([hidden]) .erp-sales-order-lines-form__row'
          )
          .first()
        await editedRow.getByText('已保存', { exact: true }).waitFor()
        const editedDetails = editedRow.locator('.erp-line-item-details')
        if (!(await editedDetails.evaluate((node) => node.open))) {
          await editedDetails.locator('summary').click()
        }
        await editedRow
          .getByLabel('已有规格（选填）', { exact: true })
          .scrollIntoViewIfNeeded()
        await expectText(page, '已有规格（选填）')
        await editedRow
          .getByText('已关联产品', { exact: true })
          .scrollIntoViewIfNeeded()
        await expectText(page, '已关联产品')
        await assertTextAbsent(page, '产品引用 ID')
        await assertTextAbsent(page, '单位引用 ID')
      },
    })
  }
  return verifySalesOrderDemandEntry
}

export function createSalesOrderDemandEntryScenarios(deps) {
  const { assert, outputDir, path, customerRuntimeEffectiveSession } = deps
  const verifySalesOrderDemandEntry = createSalesOrderDemandEntryVerifier(deps)
  let regressionState
  return [
    {
      name: 'sales-order-number-and-customer-filter',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 3840, height: 2160 },
      beforeNavigate: async (page) => {
        regressionState = {
          saves: [],
          summaries: [],
          lists: [],
          orders: [],
          unknown: false,
        }
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          const respond = (data, code = 0) =>
            route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code,
                  message: code ? '暂时无法确认保存结果' : 'OK',
                  data,
                },
              }),
            })
          if (method === 'list_sales_order_summary') {
            regressionState.summaries.push(params)
            return respond(stylePaginatedRpcData([], 'items', params))
          }
          if (method === 'list_sales_orders') {
            regressionState.lists.push(params)
            return respond(
              stylePaginatedRpcData(
                regressionState.orders,
                'sales_orders',
                params
              )
            )
          }
          if (method === 'save_sales_order_with_items') {
            regressionState.saves.push(params)
            if (regressionState.unknown) return respond({}, 50000)
            const order = {
              ...params,
              id: 8100 + regressionState.saves.length,
              order_no: params.order_no || 'SO-20261026-042',
              version: 1,
              lifecycle_status: 'draft',
              order_date: Date.parse(`${params.order_date}T00:00:00Z`) / 1000,
              item_count: 0,
            }
            regressionState.orders.push(order)
            return respond({ sales_order: order, sales_order_items: [] })
          }
          if (method === 'get_sales_order')
            return respond({
              sales_order: regressionState.orders.find(
                (order) => order.id === params.id
              ),
            })
          if (method === 'list_sales_order_items')
            return respond(
              stylePaginatedRpcData([], 'sales_order_items', params)
            )
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page
          .getByRole('heading', { name: '销售订单', exact: true })
          .waitFor()
        await page.getByRole('button', { name: '筛选', exact: true }).click()
        const customerFilter = page.getByRole('combobox', {
          name: '客户',
          exact: true,
        })
        await customerFilter.click()
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().postDataJSON()?.method ===
                'list_sales_orders' &&
              response.request().postDataJSON()?.params?.customer_id === 1
          ),
          page
            .locator('.ant-select-dropdown:visible .ant-select-item-option')
            .filter({ hasText: 'CUS-STYLE-L1' })
            .click(),
        ])
        await page.getByRole('button', { name: '完成', exact: true }).click()
        await page.getByText('交付进度', { exact: true }).click()
        await page
          .getByRole('region', { name: '销售交付进度' })
          .getByText('当前筛选暂无数据', { exact: true })
          .waitFor()
        assert.equal(regressionState.summaries.at(-1)?.customer_id, 1)
        assert.equal(
          Object.hasOwn(regressionState.summaries.at(-1), 'customer'),
          false
        )
        await page.getByRole('button', { name: /^筛选，已应用/u }).click()
        const customerSelect = page
          .locator('.ant-select')
          .filter({ has: customerFilter })
        await customerSelect.hover()
        await Promise.all([
          page.waitForResponse(
            (response) =>
              response.request().postDataJSON()?.method ===
                'list_sales_order_summary' &&
              !response.request().postDataJSON()?.params?.customer_id
          ),
          customerSelect.locator('.ant-select-clear').click(),
        ])
        assert.equal(
          Object.hasOwn(regressionState.summaries.at(-1), 'customer_id'),
          false
        )
        await page.getByRole('button', { name: '完成', exact: true }).click()
        await page.getByText('订单列表', { exact: true }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        const openDraft = async () => {
          await page.getByRole('button', { name: '新建订单' }).click()
          assert.equal(
            await editor
              .getByLabel('订单号（自动）', { exact: true })
              .inputValue(),
            ''
          )
          await editor.getByLabel('客户', { exact: true }).click()
          await page
            .locator('.ant-select-dropdown:visible .ant-select-item-option')
            .filter({ hasText: 'CUS-STYLE-L1' })
            .click()
          for (const [label, value] of [
            ['计税方式', '不计税'],
            ['报价是否含运费', '报价含运费'],
          ]) {
            await editor.getByLabel(label, { exact: true }).click()
            await page
              .locator('.ant-select-dropdown:visible')
              .getByText(value, { exact: true })
              .click()
          }
        }
        await openDraft()
        await editor
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await editor.waitFor({ state: 'hidden' })
        assert.equal(Object.hasOwn(regressionState.saves[0], 'order_no'), false)
        await page
          .getByText('SO-20261026-042', { exact: true })
          .first()
          .dblclick()
        assert.equal(
          await editor
            .getByLabel('订单号（自动）', { exact: true })
            .inputValue(),
          'SO-20261026-042'
        )
        await editor.getByLabel('订单号（自动）', { exact: true }).fill('')
        await editor
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await editor.getByText('请保留或填写订单号', { exact: true }).waitFor()
        assert.equal(
          regressionState.saves.length,
          1,
          '编辑清空编号不得重新分配或提交保存'
        )
        await editor
          .getByLabel('订单号（自动）', { exact: true })
          .fill('SO-20261026-042')
        await closeBusinessFormPage(page, editor)
        await openDraft()
        await editor
          .getByLabel('订单号（自动）', { exact: true })
          .fill('SO-MANUAL-REGRESSION')
        await editor
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await editor.waitFor({ state: 'hidden' })
        assert.equal(regressionState.saves[1].order_no, 'SO-MANUAL-REGRESSION')
        await openDraft()
        regressionState.unknown = true
        await editor
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await page
          .getByText(
            '保存结果尚未确认，请先核对该单据的最新状态，不要连续重复提交。',
            { exact: true }
          )
          .waitFor()
        await editor
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .click()
        await page
          .getByText(
            '上次保存结果尚未确认，请先返回列表刷新核对，避免重复创建订单。',
            { exact: true }
          )
          .waitFor()
        assert.equal(
          regressionState.saves.length,
          3,
          '结果未知后再次点击不得重复创建'
        )
        await page.screenshot({
          path: path.join(outputDir, 'sales-order-save-unknown.png'),
        })
        await closeBusinessFormPage(page, editor)
      },
    },
    {
      name: 'sales-order-demand-entry',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        try {
          await verifySalesOrderDemandEntry(page)
        } catch (error) {
          await page.screenshot({
            path: path.join(outputDir, 'sales-order-demand-entry-failed.png'),
          })
          throw error
        }
      },
    },
  ]
}
