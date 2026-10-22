import { stylePaginatedRpcData } from './rpcMockResult.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'
import { createShipmentSourceCandidateAssertions } from './shipmentPresentationScenarios.mjs'

export async function verifyBusinessCoreShipments(page, deps) {
  const {
    assert,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableSortableColumns,
    assertBusinessPageRefreshEntrypoint,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickModal,
  } = deps
  const {
    assertLineItemAddActionScrollsToNewRow,
    findSelectionActionButton,
    confirmVisiblePopconfirm,
    assertUnifiedListToolbarShell,
    assertBusinessTableEmptyState,
  } = createBusinessFormalAssertions(deps)
  const {
    installShipmentSourceCandidateContract,
    verifyShipmentSourceCandidateContract,
  } = createShipmentSourceCandidateAssertions(deps)
  await gotoScenarioPath(page, '/erp/warehouse/shipments', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '出货单')

  await expectButton(page, '新建出货单')

  for (const headerText of [
    '总净重（克）',
    '出货日期',
  ]) {
    const header = page
      .locator(
        '.erp-shipments-page .erp-business-data-table-card .ant-table-thead th'
      )
      .filter({ hasText: headerText })
      .first()
    await header.waitFor({ state: 'visible' })
    const headerLabel = header.getByText(headerText, { exact: true })
    await headerLabel.waitFor({ state: 'visible' })
    assert.equal(String(await headerLabel.textContent()).trim(), headerText)
  }

  await expectText(page, '待确认')

  await expectText(page, 'SHIP-STYLE-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-shipments',
  })

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-formal-shipments',
  })

  const shipmentDraftRow = page
    .locator(
      '.erp-shipments-page .erp-business-data-table-card .ant-table-tbody .ant-table-row'
    )
    .filter({ hasText: 'SHIP-STYLE-L1' })
    .first()

  await shipmentDraftRow.click()

  await shipmentDraftRow
    .and(page.locator('.ant-table-row-selected'))
    .waitFor({ state: 'visible' })

  const cancelShipmentDraftButton = await findSelectionActionButton(
    page,
    '作废草稿'
  )

  assert.equal(await cancelShipmentDraftButton.isDisabled(), false)

  await cancelShipmentDraftButton.click()

  await confirmVisiblePopconfirm(page)

  await expectText(page, '作废出货草稿已完成')

  await expectText(page, '已取消')

  let emptiedShipmentsOnce = false

  await page.route('**/rpc/operational_fact', async (route) => {
    const body = route.request().postDataJSON() || {}
    if (
      !emptiedShipmentsOnce &&
      body.method === 'list_shipments' &&
      String(body.params?.status || '') === 'CANCELLED'
    ) {
      emptiedShipmentsOnce = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || 'business-formal-shipments-empty-filter',
          result: {
            code: 0,
            message: 'OK',
            data: stylePaginatedRpcData([], 'shipments', body.params || {}),
          },
        }),
      })
      return
    }
    await route.fallback()
  })

  const shipmentStatusFilters = page.getByRole('group', {
    name: '出货单状态',
  })

  await shipmentStatusFilters
    .getByRole('button', { name: /^已取消，/u })
    .click()

  await assertBusinessTableEmptyState(page, {
    scenarioName: 'business-formal-shipments-empty-status-filter',
    emptyText: '暂无出货单',
    staleText: 'SHIP-STYLE-L1',
  })

  await shipmentStatusFilters
    .getByRole('button', { name: /^不限状态，/u })
    .click()

  await expectText(page, 'SHIP-STYLE-L1')

  await verifyBusinessRowDoubleClickModal(page, {
    rowText: 'SHIP-STYLE-L1',
    titleText: '查看出货明细',
    scenarioName: 'business-formal-shipments',
    screenshotName: 'business-formal-shipment-double-click-details',
    afterModalOpen: async () => {
      await expectText(page, '已保存出货明细')
    },
  })

  await assertBusinessFormModalKeyboardRecovery(page, {
    triggerName: '新建出货单',
    titleText: '新建出货单',
    scenarioName: 'business-formal-shipments',
  })

  const shipmentSourceContract =
    await installShipmentSourceCandidateContract(page)

  await verifyBusinessActionFormModal(page, {
    buttonName: '新建出货单',
    titleText: '新建出货单',
    minFieldCount: 12,
    screenshotName: 'business-formal-shipment-create-form-modal',
    expectedTexts: [
      '出货明细',
      '从销售订单导入',
      '产品',
      '仓库',
      '填写出货明细后显示预计总净重。',
      '实际总净重（克）',
    ],
    afterOpen: async (modal) => {
      await assertLineItemAddActionScrollsToNewRow(modal, {
        scenarioName: 'business-formal-shipment-create-form-modal',
        targetRowCount: 5,
        addButtonName: '添加出货明细',
      })
      await verifyShipmentSourceCandidateContract(
        page,
        modal,
        shipmentSourceContract
      )
      await modal.screenshot({
        path: path.join(
          outputDir,
          'business-formal-shipment-create-predicted-weight.png'
        ),
      })
    },
  })

  await page.getByText('SHIP-STYLE-L1', { exact: true }).click()

  await assertBusinessFormModalKeyboardRecovery(page, {
    triggerName: '查看明细',
    titleText: '查看出货明细',
    scenarioName: 'business-formal-shipment-readonly-detail',
  })

  const shipmentDetailTrigger = page.getByRole('button', {
    name: '查看明细',
  })

  await shipmentDetailTrigger.click()

  await expectText(page, '查看出货明细')

  await expectText(page, '已保存出货明细')

  await assertTextAbsent(page, '新增出货明细')

  const shipmentDetailPage = page.locator(
    '.erp-business-form-page:not([hidden])'
  )

  await shipmentDetailPage.waitFor({ state: 'visible' })

  assert.equal(
    await shipmentDetailPage
      .getByRole('button', { name: '保存', exact: true })
      .count(),
    0,
    '出货只读明细页不应提供保存动作'
  )

  const editableShipmentDetailControls = await shipmentDetailPage
    .locator(
      'input:visible:not([type="hidden"]):not([type="range"]):not([disabled]):not([readonly]), textarea:visible:not([disabled]):not([readonly]), .ant-select:visible:not(.ant-select-disabled)'
    )
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        tagName: node.tagName,
        className: node.className,
        name: node.getAttribute('name'),
        placeholder: node.getAttribute('placeholder'),
        selectClassName: node.closest('.ant-select')?.className || '',
      }))
    )

  assert.deepEqual(
    editableShipmentDetailControls,
    [],
    `出货只读明细页不应暴露可编辑表单控件: ${JSON.stringify(editableShipmentDetailControls)}`
  )

  await closeBusinessFormModal(page, shipmentDetailPage)

  assert.equal(
    await shipmentDetailTrigger.evaluate(
      (node) => document.activeElement === node
    ),
    true,
    '返回出货列表后焦点应回到查看明细按钮'
  )

  await assertBusinessMainTableHasNoOperationColumn(page, {
    scenarioName: 'business-formal-shipments',
  })

  await verifyBusinessModuleColumnOrderDialog(page, {
    moduleKey: 'shipments',
    heading: '出货单',
    headerMenuTargetLabel: '客户',
  })

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-formal-shipments',
    unsortableHeaders: [
      '总净重（克）',
      '包装信息',
      '实际运费',
      '唛头',
      '备注',
    ],
  })

  await assertNoHorizontalOverflow(page, 'business-formal-shipments')
}
