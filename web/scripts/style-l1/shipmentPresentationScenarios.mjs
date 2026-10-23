import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

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
    await searchInput.fill('NO-SOURCE-IMPORT-RESULT')
    await searchInput.press('Enter')
    await failedPicker
      .getByText('暂无可导入销售订单行', { exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
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
      'limit',
      'offset',
    ])
    for (const params of shipmentSourceCandidateParams) {
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
    {
      name: 'shipment-net-weight-desktop',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '出货单')
        await expectButton(page, '新建出货单')
        await page
          .locator('.erp-business-data-table-card .ant-table-content')
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
          weightColumnMetrics.headers.includes('实际/最终总净重（克）') &&
            weightColumnMetrics.text.includes('待确认'),
          `出货列表应显示总净重列和草稿待确认状态: ${JSON.stringify(
            weightColumnMetrics
          )}`
        )
        await verifyBusinessActionFormModal(page, {
          buttonName: '新建出货单',
          titleText: '新建出货单',
          minFieldCount: 12,
          screenshotName: 'shipment-net-weight-incomplete',
          expectedTexts: [
            '出货明细',
            '从销售订单导入',
            '填写出货明细后显示预计总净重。',
            '实际总净重（克）',
          ],
          afterOpen: async (modal) => {
            await modal.getByLabel('产品').click()
            await page.getByText('PROD-STYLE-L1').last().click()
            await modal.getByLabel('数量').fill('10')
            await expectText(page, '预计总净重：4250 克')
            await modal.screenshot({
              path: path.join(outputDir, 'shipment-net-weight-predicted.png'),
            })
            await assertLineItemAddActionScrollsToNewRow(modal, {
              scenarioName: 'shipment-net-weight-incomplete',
              targetRowCount: 5,
              addButtonName: '添加出货明细',
            })
          },
        })
        await assertNoHorizontalOverflow(page, 'shipment-net-weight-desktop')
      },
    },
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
