import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'
import { assertImportPickerGeometry, assertImportFilterPrompt, readImportPickerLayout, assertImportPickerStableLayout, assertImportPickerStableDuring } from './importPickerAssertions.mjs'
import { assertBusinessSectionTitleBands, assertCurrentBusinessSection } from './businessFormSectionAssertions.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'

export function createShipmentSourceCandidateAssertions(deps) {
  const { assert, assertTextAbsent, expectText, outputDir, path } = deps
  const installShipmentSourceCandidateContract = async (page) => {
    let failShipmentSourcesOnce = true
    const shipmentSourceCandidateParams = []
    const unscopedSalesOrderItemRequests = []
    page.on('request', (request) => {
      if (!request.url().includes('/rpc/sales_order')) return
      try {
        const body = request.postDataJSON() || {}
        if (
          body.method === 'list_sales_order_items' &&
          !Number(body.params?.sales_order_id || 0)
        ) {
          unscopedSalesOrderItemRequests.push(body.params || {})
        }
      } catch {
        // 非 JSON-RPC 请求不参与来源合同断言。
      }
    })
    await page.route('**/rpc/operational_fact', async (route) => {
      const body = route.request().postDataJSON() || {}
      if (body.method === 'list_shipment_source_candidates') {
        shipmentSourceCandidateParams.push(body.params || {})
        if (!failShipmentSourcesOnce) {
          await route.fallback()
          return
        }
        failShipmentSourcesOnce = false
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id || 'business-formal-shipment-source-error',
            result: {
              code: 50000,
              message: '加载销售订单来源失败',
              data: {},
            },
          }),
        })
        return
      }
      await route.fallback()
    })
    return { shipmentSourceCandidateParams, unscopedSalesOrderItemRequests }
  }

  const verifyShipmentSourceCandidateContract = async (
    page,
    modal,
    { shipmentSourceCandidateParams, unscopedSalesOrderItemRequests }
  ) => {
    const sourceTrigger = modal
      .getByRole('button', { name: '从销售订单导入' })
      .first()
    await sourceTrigger.click()
    const failedPicker = page
      .locator('.erp-source-import-picker-modal.ant-modal:visible')
      .last()
    await failedPicker.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(page, '加载销售订单来源失败')
    const initialSourceRequests = shipmentSourceCandidateParams.length
    await failedPicker.locator('.ant-input').first().fill('SO-STYLE-L1')
    await page.waitForTimeout(400)
    assert.equal(shipmentSourceCandidateParams.length, initialSourceRequests, '来源搜索输入不触发请求')
    await failedPicker.locator('.ant-input').first().press('Enter')
    await failedPicker
      .getByText('SO-STYLE-L1', { exact: true })
      .first()
      .waitFor({ timeout: 10_000 })
    assert.equal(
      await failedPicker.isVisible(),
      true,
      '出货来源首次加载失败后应保留弹窗，并允许搜索重试'
    )
    await failedPicker
      .getByText('从销售订单导入出货明细', { exact: true })
      .waitFor({ state: 'visible' })
    for (const headerText of [
      '销售订单号',
      '来源行',
      '客户',
      '产品 / SKU',
      '剩余可出货',
    ]) {
      await failedPicker
        .locator('.ant-table-thead th')
        .getByText(headerText, { exact: true })
        .waitFor({ state: 'visible' })
    }
    const sourceTable = failedPicker.locator('.ant-table-container')
    await sourceTable
      .getByText('SO-STYLE-L1', { exact: true })
      .first()
      .waitFor({ state: 'visible' })
    await sourceTable
      .getByText('PROD-STYLE-L1-01', { exact: false })
      .first()
      .waitFor({ state: 'visible' })
    const searchInput = failedPicker.locator('.ant-input').first()
    await assertImportPickerGeometry(page, failedPicker, 'shipment-source-picker')
    const layout = await readImportPickerLayout(failedPicker)
    await assertImportFilterPrompt(page, failedPicker, '导入来源客户', '按客户筛选')
    await assertImportFilterPrompt(page, failedPicker, '导入来源销售订单', '按销售订单筛选')
    const eligibleFilter = failedPicker.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '来源可导入条件', exact: true }) })
    assert.equal(await eligibleFilter.locator('.ant-select-selection-item').innerText(), '可导入')
    await eligibleFilter.locator('.ant-select-clear').click()
    await failedPicker.locator('.ant-table-row').first().waitFor()
    assert.equal(shipmentSourceCandidateParams.at(-1).selectable, undefined)
    await assertImportFilterPrompt(page, failedPicker, '来源可导入条件', '按可导入状态筛选', ['全部来源'])
    await failedPicker.getByRole('combobox', { name: '来源可导入条件', exact: true }).press('ArrowDown')
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').filter({ hasText: '不可导入（查看原因）' }).click()
    await failedPicker.getByText('暂无可导入销售订单行', { exact: true }).waitFor()
    await assertImportPickerStableLayout(failedPicker, layout, 'shipment-empty-filter')
    assert.equal(shipmentSourceCandidateParams.at(-1).selectable, false)
    await failedPicker.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '来源可导入条件', exact: true }) }).locator('.ant-select-clear').click()
    await failedPicker.locator('.ant-table-row').first().waitFor()
    assert.equal(shipmentSourceCandidateParams.at(-1).selectable, undefined)
    await assertImportFilterPrompt(page, failedPicker, '来源可导入条件', '按可导入状态筛选', ['全部来源'])
    await failedPicker.getByRole('button', { name: '清空筛选', exact: true }).click()
    await failedPicker.locator('.ant-table-row').first().waitFor()
    assert.equal(shipmentSourceCandidateParams.at(-1).selectable, undefined)
    await assertImportPickerStableDuring(failedPicker, 'shipment-empty-search', async () => {
      await searchInput.fill('NO-SOURCE-IMPORT-RESULT')
      await searchInput.press('Enter')
      await failedPicker
        .getByText('暂无可导入销售订单行', { exact: true })
        .waitFor({ state: 'visible', timeout: 10_000 })
    })
    await assertImportPickerStableLayout(failedPicker, layout, 'shipment-empty-search')
    await searchInput.fill('')
    await searchInput.press('Enter')
    const firstPageSourceRow = failedPicker
      .locator('.ant-table-row')
      .filter({ hasText: 'PROD-STYLE-L1-01' })
      .first()
    await firstPageSourceRow.waitFor({ state: 'visible', timeout: 10_000 })
    await firstPageSourceRow
      .locator('.ant-checkbox-wrapper, .ant-radio-wrapper')
      .first()
      .click()
    await expectText(page, '已选 1 条')
    await failedPicker.locator('.ant-pagination-item-2').click()
    const secondPageSourceRow = failedPicker
      .locator('.ant-table-row')
      .filter({ hasText: 'PROD-STYLE-L1-21' })
      .first()
    await secondPageSourceRow.waitFor({ state: 'visible', timeout: 10_000 })
    await secondPageSourceRow
      .locator('.ant-checkbox-wrapper, .ant-radio-wrapper')
      .first()
      .click()
    await expectText(page, '已选 2 条')
    const requestsBeforeSelected = shipmentSourceCandidateParams.length
    await failedPicker.getByRole('checkbox', { name: '仅看已选', exact: true }).check()
    assert.equal(await failedPicker.locator('.ant-table-row').count(), 2)
    assert.equal(shipmentSourceCandidateParams.length, requestsBeforeSelected)
    await assertImportPickerStableLayout(failedPicker, layout, 'shipment-two-selected')
    await failedPicker.getByRole('checkbox', { name: '仅看已选', exact: true }).uncheck()
    await secondPageSourceRow.waitFor()
    await failedPicker
      .locator('.erp-source-import-picker__footer-actions .ant-btn-primary')
      .last()
      .click()
    await failedPicker.waitFor({ state: 'hidden', timeout: 10_000 })
    await expectText(page, '已导入销售订单来源行和剩余可出货数量')
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await modal.getByLabel('币种（跟随销售订单）').inputValue(),
      'USD',
      '出货单币种应由销售订单带出并保持只读'
    )
    assert.equal(
      await modal.getByRole('combobox', { name: '实际运费币种' }).count(),
      0,
      '实际运费不应提供独立币种选择'
    )
    await modal.getByLabel('实际运费金额').fill('12.5')
    assert.equal(
      (await modal.getByLabel('实际运费币种（自动）').textContent()).trim(),
      'USD',
      '实际运费应展示销售订单币种'
    )
    assert.equal(
      await modal
        .getByLabel('实际运费币种（自动）')
        .evaluate(
          (node) =>
            node.isContentEditable || node.matches('input, textarea, select')
        ),
      false,
      '自动带出的实际运费币种不可编辑'
    )
    await expectText(page, '币种：USD')
    await modal.screenshot({
      path: path.join(outputDir, 'shipment-source-one-currency-modal.png'),
    })
    await modal.locator('.erp-line-item-details > summary').first().click()
    await expectText(page, '销售订单行追溯')
    assert.equal(
      await modal.getByText('销售订单行追溯', { exact: true }).count(),
      2,
      '跨页选择的两条销售订单来源行都应导入出货明细'
    )
    assert.equal(
      await modal
        .getByRole('button', { name: '添加出货明细', exact: true })
        .isDisabled(),
      true,
      '导入销售订单来源后应锁定为同一来源，禁止手工混加无来源明细'
    )
    assert.equal(
      unscopedSalesOrderItemRequests.length,
      0,
      `出货来源选择器不得回退无 sales_order_id 的明细列表: ${JSON.stringify(
        unscopedSalesOrderItemRequests
      )}`
    )
    assert(
      shipmentSourceCandidateParams.length >= 4,
      `出货来源选择器应覆盖打开失败、搜索重试、空结果和恢复导入: ${JSON.stringify(
        shipmentSourceCandidateParams
      )}`
    )
    const allowedSourceKeys = new Set([
      'keyword',
      'sales_order_id',
      'customer_id',
      'selectable',
      'limit',
      'offset',
    ])
    for (const params of shipmentSourceCandidateParams) {
      assert(params.selectable === undefined || typeof params.selectable === 'boolean')
      assert(params.customer_id === undefined || (Number.isSafeInteger(params.customer_id) && params.customer_id > 0))
      assert(
        Object.keys(params).every((key) => allowedSourceKeys.has(key)),
        `出货来源候选请求包含非合同字段: ${JSON.stringify(params)}`
      )
      assert(
        Number(params.limit || 0) > 0 &&
          Number(params.limit || 0) <= 200 &&
          Number(params.offset || 0) >= 0,
        `出货来源候选必须使用服务端分页: ${JSON.stringify(params)}`
      )
    }
    assert(
      shipmentSourceCandidateParams.some(
        (params) => params.keyword === 'SO-STYLE-L1'
      ),
      `出货来源搜索必须发送服务端 keyword: ${JSON.stringify(
        shipmentSourceCandidateParams
      )}`
    )
    assert(
      shipmentSourceCandidateParams.some(
        (params) => params.keyword === 'NO-SOURCE-IMPORT-RESULT'
      ),
      `出货来源空结果必须来自服务端搜索: ${JSON.stringify(
        shipmentSourceCandidateParams
      )}`
    )
    assert(
      shipmentSourceCandidateParams.some(
        (params) => Number(params.offset) === 20
      ),
      `出货来源第二页必须发送 offset=20: ${JSON.stringify(
        shipmentSourceCandidateParams
      )}`
    )
    await assertTextAbsent(page, 'sales_order_item_id 追溯')
  }
  return {
    installShipmentSourceCandidateContract,
    verifyShipmentSourceCandidateContract,
  }
}

export function createShipmentWeightScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    expectButton,
    expectText,
    outputDir,
    path,
    verifyBusinessActionFormModal,
    customerRuntimeEffectiveSession,
  } = deps
  const { assertLineItemAddActionScrollsToNewRow } =
    createBusinessFormalAssertions(deps)
  return [
    ...[
      { variant: 'desktop', viewport: { width: 1920, height: 1080 }, themeMode: 'light', deviceScaleFactor: 2 },
      { variant: 'dark', viewport: { width: 1440, height: 900 }, themeMode: 'dark', deviceScaleFactor: 1 },
      { variant: 'narrow', viewport: { width: 1440, height: 900 }, targetViewport: { width: 390, height: 844 }, themeMode: 'light', deviceScaleFactor: 2 },
    ].map(({ variant, targetViewport, ...presentation }) => ({
      name: `shipment-readonly-sections-${variant}`,
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      ...presentation,
      verify: async (page) => {
        await page.getByText('SHIP-STYLE-L1', { exact: true }).first().click()
        await page.getByRole('button', { name: '查看明细', exact: false }).click()
        const editor = page.getByRole('region', { name: '查看出货明细', exact: true })
        await editor.waitFor()
        if (targetViewport) await page.setViewportSize(targetViewport)
        const details = editor.getByRole('region', { name: '出货明细', exact: true })
        assert.equal(await details.getByRole('heading', { name: '出货明细', exact: true }).count(), 1)
        assert.equal(await editor.getAttribute('data-readonly'), 'true')
        await assertBusinessSectionTitleBands(editor)
        const nav = editor.getByRole('navigation', { name: '表单分区' })
        const jump = async (title) => {
          const button = nav.getByRole('button', { name: title, exact: true })
          if (await button.isVisible()) await button.click()
          else await chooseSelectOption(nav.getByRole('combobox', { name: '跳转到', exact: true }), await editor.getByRole('region', { name: title, exact: true }).getAttribute('id'))
          await assertCurrentBusinessSection(page, editor, title)
        }
        for (const title of ['财务审批', '出货明细', '收货信息', '财务审批', '备注与附件']) {
          await jump(title)
        }
        await jump('财务审批')
        const number = editor.getByRole('textbox', { name: /出货单号/u })
        assert.equal(await number.isDisabled(), true)
        await number.scrollIntoViewIfNeeded()
        const box = await number.boundingBox()
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
        await assertCurrentBusinessSection(page, editor, '单据与客户')
        assert.equal(await number.inputValue(), 'SHIP-STYLE-L1')
        assert.equal(await editor.getAttribute('data-unsaved'), 'false')
        await jump('出货明细')
        await assertNoHorizontalOverflow(page, `shipment-readonly-sections-${variant}`)
        await page.screenshot({ path: path.join(outputDir, `shipment-readonly-sections-${variant}.png`), fullPage: true })
      },
    })),
    ...[
      { variant: 'desktop', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 },
      { variant: 'compact-desktop', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, focused: true },
      { variant: 'compact-dark', viewport: { width: 1440, height: 900 }, themeMode: 'dark', focused: true },
      { variant: 'compact-narrow', viewport: { width: 1440, height: 900 }, targetViewport: { width: 390, height: 844 }, focused: true },
    ].map(({ variant, targetViewport, focused, ...presentation }) => ({
      name: `shipment-net-weight-${variant}`,
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      ...presentation,
      verify: async (page) => {
        await expectText(page, '出货单')
        await expectButton(page, '新建出货单')
        await page
          .locator('.erp-business-data-table-card .ant-table-body, .erp-business-data-table-card .ant-table-content')
          .first()
          .evaluate((element) => {
            element.scrollLeft = element.scrollWidth
          })
        await expectText(page, 'SHIP-STYLE-L1')
        const weightColumnMetrics = await page
          .locator('.erp-business-data-table-card')
          .first()
          .evaluate((element) => ({
            headers: Array.from(element.querySelectorAll('th')).map((node) =>
              String(node.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
            ),
            text: String(element.textContent || '')
              .replace(/\s+/gu, '')
              .trim(),
          }))
        assert(
          weightColumnMetrics.headers.includes('总净重（克）') &&
            weightColumnMetrics.text.includes('待确认'),
          `出货列表应显示总净重列和草稿待确认状态: ${JSON.stringify(
            weightColumnMetrics
          )}`
        )
        const formChecks = {
          buttonName: '新建出货单',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: `shipment-net-weight-empty-${variant}`,
          expectedTexts: [
            '出货明细',
            '从销售订单导入',
            '填写出货明细后显示预计总净重。',
          ],
          afterOpen: async (modal) => {
            if (targetViewport) await page.setViewportSize(targetViewport)
            const summary = modal.locator('.erp-shipment-weight-summary')
            const weight = modal.getByLabel('实际总净重（克）', { exact: true })
            const quantity = modal.getByLabel('数量', { exact: true })
            assert.equal(await weight.count(), 0, '空白明细不显示人工补录框')
            const emptyHeight = await summary.evaluate((node) => node.getBoundingClientRect().height)
            assert(emptyHeight <= 40, `空白重量区只占一行：${emptyHeight}`)
            await quantity.fill('2')
            await weight.waitFor({ state: 'visible' })
            await weight.fill('1500')
            await summary.scrollIntoViewIfNeeded()
            const manualLayout = await summary.evaluate((node) => {
              const bounds = node.getBoundingClientRect()
              const field = node.querySelector('.erp-shipment-weight-summary__field').getBoundingClientRect()
              const notice = node.querySelector('.erp-shipment-weight-summary__notice').getBoundingClientRect()
              return {
                summary: { width: bounds.width, height: bounds.height },
                field: { left: field.left, right: field.right, width: field.width, top: field.top },
                notice: { right: notice.right, bottom: notice.bottom, top: notice.top },
                fits: field.left >= bounds.left - 1 && field.right <= bounds.right + 1 && notice.right <= bounds.right + 1,
              }
            })
            assert(manualLayout.field.width <= 241, `补录框不应随整页拉伸：${JSON.stringify(manualLayout)}`)
            assert(manualLayout.fits, `重量提示和补录框应留在当前区域：${JSON.stringify(manualLayout)}`)
            if (targetViewport) {
              assert(manualLayout.field.top >= manualLayout.notice.bottom, '窄屏补录框应排在原因提示下方')
            } else {
              assert(Math.abs(manualLayout.field.top - manualLayout.notice.top) <= 1, '桌面提示和补录框应并排对齐')
            }
            await summary.screenshot({ path: path.join(outputDir, `shipment-net-weight-manual-${variant}.png`) })
            await assertNoHorizontalOverflow(page, `shipment-net-weight-manual-${variant}`)
            await quantity.fill('3')
            await page.waitForFunction(() => document.querySelector('#total_net_weight_g')?.value === '')
            await weight.fill('1600')
            await quantity.fill('')
            await weight.waitFor({ state: 'hidden' })
            await quantity.fill('2')
            await weight.waitFor({ state: 'visible' })
            assert.equal(await weight.inputValue(), '', '清空明细再输入不能恢复旧人工重量')
            await weight.fill('1700')
            for (const name of ['SKU', '批次']) {
              const input = modal.getByRole('combobox', { name, exact: true })
              assert.equal(await input.isDisabled(), true)
              const control = input.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
              assert.equal(await control.locator('.ant-select-selection-placeholder').innerText(), '请先选择产品')
            }
            await modal.locator('#items_0_product_id').click()
            await page.getByText('PROD-STYLE-L1').last().click()
            await expectText(page, '预计总净重：850 克')
            await weight.waitFor({ state: 'hidden' })
            await quantity.fill('')
            await weight.waitFor({ state: 'visible' })
            assert.equal(await weight.inputValue(), '', '恢复自动计算时应清空旧人工重量')
            await modal.getByLabel('数量').fill('10')
            await expectText(page, '预计总净重：4250 克')
            assert.equal(await weight.count(), 0, '完整自动计算时不显示补录框')
            const calculatedHeight = await summary.evaluate((node) => node.getBoundingClientRect().height)
            assert(calculatedHeight <= 40, `预计净重只占一行：${calculatedHeight}`)
            await modal.screenshot({
              path: path.join(outputDir, `shipment-net-weight-predicted-${variant}.png`),
            })
            if (targetViewport) await page.setViewportSize(presentation.viewport)
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: `shipment-net-weight-${variant}`,
              targetRowCount: 5,
              addButtonName: '添加出货明细',
            })
          },
        }
        if (focused) {
          await page.getByRole('button', { name: /新建出货单$/u }).click()
          const editor = page.getByRole('region', { name: '新建出货单', exact: true })
          await editor.waitFor({ state: 'visible' })
          await formChecks.afterOpen(editor)
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          const discard = page.getByRole('button', { name: '放弃修改', exact: true })
          if (await discard.isVisible()) await discard.click()
          await editor.waitFor({ state: 'hidden' })
        } else {
          await verifyBusinessActionFormModal(page, formChecks)
        }
        await assertNoHorizontalOverflow(page, `shipment-net-weight-${variant}`)
      },
    })),
  ]
}

export function createShipmentSourceCandidateScenarios(deps) {
  const {
    expectButton,
    expectHeading,
    verifyBusinessActionFormModal,
    customerRuntimeEffectiveSession,
  } = deps
  const {
    installShipmentSourceCandidateContract,
    verifyShipmentSourceCandidateContract,
  } = createShipmentSourceCandidateAssertions(deps)
  return [
    {
      name: 'shipment-source-candidates-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '出货单')
        await expectButton(page, '新建出货单')
        const shipmentSourceContract =
          await installShipmentSourceCandidateContract(page)
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建出货单',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: 'shipment-source-candidates-desktop',
          expectedTexts: ['出货明细', '从销售订单导入', '产品', '仓库'],
          afterOpen: async (modal) => {
            await verifyShipmentSourceCandidateContract(
              page,
              modal,
              shipmentSourceContract
            )
          },
        })
      },
    },
  ]
}
