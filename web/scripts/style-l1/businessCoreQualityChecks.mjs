import { stylePaginatedRpcData } from './rpcMockResult.mjs'

import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreQuality(page, deps) {
  const {
    assert,
    assertBusinessFormModalKeyboardRecovery,
    assertBusinessMainTableHasNoOperationColumn,
    assertBusinessMainTableSortableColumns,
    assertBusinessPageRefreshEntrypoint,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectButton,
    expectHeading,
    expectText,
    gotoScenarioPath,
    verifyBusinessActionFormModal,
    verifyBusinessModuleColumnOrderDialog,
    verifyBusinessRowDoubleClickModal,
  } = deps
  const {
    findSelectionActionButton,
    assertNonItemTextareaFullRow,
    assertNoListDeleteTrashToolbar,
    assertBusinessTableEmptyState,
  } = createBusinessFormalAssertions(deps)
  await gotoScenarioPath(page, '/erp/production/quality-inspections', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '质量检验')

  await expectButton(page, '补建来料质检')

  await expectButton(page, '导出筛选结果')

  await expectButton(page, '列设置')

  await assertNoListDeleteTrashToolbar(page)

  await assertTextAbsent(page, 'quality_inspections')

  const qualityDispositionAction = await findSelectionActionButton(
    page,
    '不合格处置'
  )

  assert.equal(
    await qualityDispositionAction.isDisabled(),
    true,
    '未选择记录时保留岗位入口并提示先选择'
  )

  await page.keyboard.press('Escape')

  await page
    .locator('.erp-business-selection-action-menu')
    .waitFor({ state: 'hidden' })

  await expectText(page, 'QI-STYLE-L1')

  await expectText(page, 'PR-STYLE-L1')

  await expectText(page, 'INV-LOT-001')

  const qualityInspectionHeaderMetrics = await page.evaluate(() => {
    const headers = Array.from(
      document.querySelectorAll(
        '.erp-business-data-table-card .ant-table-thead th .erp-module-column-header-text'
      )
    ).map((node) => ({
      text: String(node.textContent || '').trim(),
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth,
    }))
    return {
      headers,
      clippedHeaders: headers.filter(
        (header) => header.scrollWidth > header.clientWidth + 1
      ),
    }
  })

  assert.deepEqual(
    qualityInspectionHeaderMetrics.headers.map((header) => header.text),
    [
      '质检单号',
      '状态 / 判定',
      '产品 / 材料 / 在制品',
      '检验来源',
      '估算不良比例',
      '检验信息',
      '判定备注',
    ],
    `质量检验默认表头应合并为可扫读列: ${JSON.stringify(
      qualityInspectionHeaderMetrics
    )}`
  )

  assert.deepEqual(
    qualityInspectionHeaderMetrics.clippedHeaders,
    [],
    `质量检验默认表头不应出现省略号: ${JSON.stringify(
      qualityInspectionHeaderMetrics
    )}`
  )

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-formal-quality-inspections',
  })

  await assertBusinessMainTableHasNoOperationColumn(page, {
    scenarioName: 'business-formal-quality-inspections',
  })

  await assertBusinessMainTableSortableColumns(page, {
    scenarioName: 'business-formal-quality-inspections',
    unsortableHeaders: ['估算不良比例', '判定备注'],
  })

  await assertNoListDeleteTrashToolbar(page)

  let forceEmptyQualityInspections = false

  const qualityEmptySearchKeyword =
    'NO-MATCH-business-formal-quality-inspections-empty-search'

  await page.route('**/rpc/quality', async (route) => {
    const body = route.request().postDataJSON() || {}
    if (
      forceEmptyQualityInspections &&
      body.method === 'list_quality_inspections'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || 'business-formal-quality-inspections-empty-search',
          result: {
            code: 0,
            message: 'OK',
            data: stylePaginatedRpcData(
              [],
              'quality_inspections',
              body.params || {}
            ),
          },
        }),
      })
      return
    }
    await route.fallback()
  })

  await page.getByText('QI-STYLE-L1', { exact: false }).first().click()

  forceEmptyQualityInspections = true

  await page
    .getByPlaceholder('搜单号、产品、材料、批次')
    .first()
    .fill(qualityEmptySearchKeyword)
  await page
    .getByPlaceholder('搜单号、产品、材料、批次')
    .first().press('Enter')

  await page.keyboard.press('Enter')

  await assertBusinessTableEmptyState(page, {
    scenarioName: 'business-formal-quality-inspections-empty-search',
    emptyText: '暂无质量检验单',
    staleText: 'QI-STYLE-L1',
  })

  forceEmptyQualityInspections = false

  await page.getByPlaceholder('搜单号、产品、材料、批次').first().fill('')
  await page.getByPlaceholder('搜单号、产品、材料、批次').first().press('Enter')

  await page.keyboard.press('Enter')

  await expectText(page, 'QI-STYLE-L1')

  await verifyBusinessRowDoubleClickModal(page, {
    rowText: 'QI-STYLE-L1',
    titleText: '质量检验详情',
    scenarioName: 'business-formal-quality-inspections',
    screenshotName: 'business-formal-quality-inspection-double-click-details',
    afterModalOpen: async () => {
      await expectText(page, 'PR-STYLE-L1')
      await expectText(page, 'INV-LOT-001')
      await expectText(page, '质检附件')
    },
  })

  await verifyBusinessModuleColumnOrderDialog(page, {
    moduleKey: 'quality-inspections',
    heading: '质量检验',
  })

  await assertBusinessFormModalKeyboardRecovery(page, {
    triggerName: '补建来料质检',
    titleText: '生成来料质检草稿',
    scenarioName: 'business-formal-quality-inspections',
  })

  await page
    .getByRole('row')
    .filter({ hasText: 'QI-STYLE-L1' })
    .getByRole('radio')
    .check()

  await expectText(page, 'QI-STYLE-L1 / INV-LOT-001')

  await findSelectionActionButton(page, '判定合格')

  await findSelectionActionButton(page, '判定不合格')

  if (
    await page.locator('.erp-business-selection-action-menu:visible').count()
  ) {
    await page.keyboard.press('Escape')
    await page
      .locator('.erp-business-selection-action-menu')
      .waitFor({ state: 'hidden' })
  }

  await verifyBusinessActionFormModal(page, {
    buttonName: '补建来料质检',
    titleText: '生成来料质检草稿',
    minFieldCount: 4,
    screenshotName: 'business-formal-quality-inspection-create-form-modal',
    expectedTexts: ['质检单号（自动）', '采购入库单', '采购入库行', '备注'],
    absentTexts: [
      '采购入库单 ID',
      '批次 ID',
      '材料 ID',
      '仓库 ID',
      'source_type',
      'source_id',
    ],
    afterOpen: async (modal) => {
      await assertNonItemTextareaFullRow(modal, {
        labels: ['备注'],
        scenarioName: 'business-formal-quality-inspection-create-form-modal',
      })
    },
  })

  await assertNoHorizontalOverflow(page, 'business-formal-quality-inspections')
}
