import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreProduction(page, deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    closeBusinessFormModal,
    expectButton,
    expectHeading,
    expectNoButton,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
  } = deps
  const {
    findSelectionActionButton,
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
  } = createBusinessFormalAssertions(deps)
  const verifyWorkflowPage = async ({
    path,
    heading,
    absentTexts,
    scenarioName,
    refreshMessage,
    afterPageReady,
  }) => {
    await gotoScenarioPath(page, path, {
      waitUntil: 'domcontentloaded',
    })
    await expectHeading(page, heading)
    await assertTextAbsent(page, '业务处理分开完成')
    await assertBusinessCollaborationPanelAbsent(page, scenarioName)
    for (const text of absentTexts) {
      await assertTextAbsent(page, text)
    }
    await assertTextAbsent(page, '导出预览字段')
    await assertTextAbsent(page, '打印单据')
    await assertTextAbsent(page, '加工合同打印')
    if (afterPageReady) {
      await afterPageReady()
    }
    await assertUnifiedListToolbarShell(page, {
      scenarioName,
      exportVisible: false,
    })
    await page.getByRole('button', { name: '刷新当前页' }).click()
    const expectedRefreshMessage = refreshMessage || `${heading}任务已刷新`
    await expectText(page, expectedRefreshMessage)
    await expectNoButton(page, '删除')
    await assertNoHorizontalOverflow(page, scenarioName)
  }

  await gotoScenarioPath(page, '/erp/production/orders', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产订单')

  await expectText(page, 'MO-STYLE-L1-20260713')

  await expectButton(page, '新建生产订单')

  await page.getByText('MO-STYLE-L1-20260713', { exact: true }).click()

  await expectButton(page, '编辑')

  await expectButton(page, /^发\s*布$/u)

  await page.getByText('MO-STYLE-L1-20260713', { exact: true }).dblclick()

  const productionOrderModal = page
    .locator('.erp-business-form-page:not([hidden])')
    .filter({ hasText: '编辑生产订单' })

  await expectText(page, '编辑生产订单')

  await expectText(page, '销售订单行（可选）')

  await expectText(page, 'BOM 版本（可选）')

  assert.equal(
    await productionOrderModal.locator('.erp-production-order-line').count(),
    22,
    '生产订单编辑页应完整加载 22 条生产明细'
  )

  await productionOrderModal
    .locator('.erp-production-order-line[aria-label="生产明细 22"]')
    .waitFor({ state: 'visible' })

  await assertNoHorizontalOverflow(page, 'business-production-orders')

  await closeBusinessFormModal(page, productionOrderModal)

  await verifyWorkflowPage({
    path: '/erp/production/scheduling',
    heading: '生产订单',
    refreshMessage: '排产确认任务已刷新',
    absentTexts: ['发起排程协同', '新建排程单', '生成生产任务'],
    scenarioName: 'business-workflow-production-scheduling',
    afterPageReady: async () => {
      await expectText(page, '暂无排产确认任务。')
    },
  })

  await gotoScenarioPath(page, '/erp/production/exceptions', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产管理')

  const productionTabs = page.locator('.erp-business-module-tabs')
  const productionExceptionTab = productionTabs.getByRole('tab', {
    name: '异常处理',
    exact: true,
  })
  const productionRecordTab = productionTabs.getByRole('tab', {
    name: '生产记录',
    exact: true,
  })

  assert.deepEqual(
    (await productionTabs.getByRole('tab').allTextContents()).map((label) => label.trim()),
    ['生产订单', '生产执行', '生产记录', '异常处理'],
    '生产业务入口保持四个同级工作区'
  )
  assert.equal(await productionExceptionTab.getAttribute('aria-selected'), 'true')
  assert.equal(await productionRecordTab.getAttribute('aria-selected'), 'false')
  assert.equal(await productionTabs.getByRole('tab', { selected: true }).count(), 1)
  assert.equal(await page.getByRole('tab', { name: '待审批', exact: true }).count(), 0, '审批统一由任务管理承接，不在生产中重复排队')

  await expectText(page, '暂无生产异常处置申请')
  await assertTextAbsent(page, '异常记录')
  await assertTextAbsent(page, '当前显示')
  assert.equal(await page.getByLabel('搜索待办任务').count(), 0, '异常工作区只展示正式申请，不挂载第二份任务筛选区')
  await assertBusinessCollaborationPanelAbsent(page, 'business-production-exceptions')
  await expectButton(page, '列设置')
  await expectNoButton(page, '导出筛选结果')
  const approvalEntry = page.getByRole('button', { name: '去任务中心审批', exact: true })
  assert.equal(await approvalEntry.isDisabled(), true, '未选择异常申请时不能发起审批入口')
  for (const text of [
    '登记异常协同',
    '新建异常单',
    '关闭异常单',
    '生成异常处理',
    '打印单据',
  ]) {
    await assertTextAbsent(page, text)
  }
  await page.getByRole('button', { name: '刷新当前页' }).click()
  await expectText(page, '异常处理申请已刷新')
  await expectNoButton(page, '删除')
  await assertNoHorizontalOverflow(page, 'business-production-exceptions')
  await page.screenshot({
    path: path.join(outputDir, 'business-production-exceptions.png'),
    fullPage: true,
  })

  await productionRecordTab.click()
  await expectHeading(page, '生产记录')
  assert.equal(await productionExceptionTab.getAttribute('aria-selected'), 'false')
  await productionExceptionTab.click()
  await expectText(page, '暂无生产异常处置申请')
  assert.equal(await productionExceptionTab.getAttribute('aria-selected'), 'true', '从生产记录返回后恢复异常工作区')
  await assertBusinessCollaborationPanelAbsent(page, 'business-production-exceptions-return')
  await expectButton(page, '列设置')
  await expectNoButton(page, '导出筛选结果')
  await page.getByRole('button', { name: '刷新当前页' }).click()
  await expectText(page, '异常处理申请已刷新')
  await expectNoButton(page, '删除')
  await assertNoHorizontalOverflow(page, 'business-production-exceptions-return')

  await gotoScenarioPath(page, '/erp/production/progress', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产记录')

  await expectText(page, 'PROD-FACT-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-production-progress',
  })

  await assertTextAbsent(page, '生成生产进度')

  await assertTextAbsent(page, '登记生产事实')

  await assertTextAbsent(page, '幂等键')

  await assertTextAbsent(page, '内部引用')

  const productionDraftRow = page
    .locator('.erp-business-data-table-card .ant-table-tbody .ant-table-row')
    .filter({ hasText: 'PROD-FACT-L1' })
    .first()

  await productionDraftRow.click()

  await productionDraftRow
    .and(page.locator('.ant-table-row-selected'))
    .waitFor({ state: 'visible' })

  const cancelProductionDraftButton = await findSelectionActionButton(
    page,
    '作废完工报告'
  )

  assert.equal(await cancelProductionDraftButton.isDisabled(), false)

  await cancelProductionDraftButton.click()

  const cancelProductionDraftModal = page
    .locator('.ant-modal:visible')
    .filter({ hasText: '作废生产完工报告' })

  await cancelProductionDraftModal.waitFor({ state: 'visible' })

  await cancelProductionDraftModal
    .locator('textarea')
    .fill('L1 回归：确认未过账生产草稿可追溯作废')

  await cancelProductionDraftModal
    .getByRole('button', { name: '作废完工报告' })
    .click()

  await expectText(page, '作废生产完工报告已完成')

  await assertNoHorizontalOverflow(page, 'business-formal-production-progress')

  await page.getByRole('menuitem', { name: /财务管理/u }).click()

  await page
    .locator('.erp-business-module-tabs')
    .getByRole('tab', { name: '对账', exact: true })
    .click()

  await expectHeading(page, '对账')

  await expectText(page, 'REC-STYLE-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-production-to-reconciliation-navigation',
  })

  await assertTextAbsent(page, '登记对账事实')

  await assertTextAbsent(page, '生成对账')

  await assertNoHorizontalOverflow(
    page,
    'business-formal-production-to-reconciliation-navigation'
  )

  await gotoScenarioPath(page, '/erp/warehouse/outbound', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '库存预留')

  await expectText(page, 'RSV-STYLE-L1')

  await expectText(page, 'SO-RESERVATION-STYLE-L1')

  await expectText(page, '第 3 行')

  await expectText(page, '库存预留毛绒兔')

  await expectText(page, 'SKU-RESERVATION-STYLE-L1')

  await expectText(page, '成品仓')

  await expectText(page, 'LOT-RESERVATION-STYLE-L1')

  await expectText(page, '件')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-outbound-reservations',
  })

  await assertTextAbsent(page, '登记库存预留')

  await assertTextAbsent(page, '新建出货单')

  await assertTextAbsent(page, '生成出库')

  for (const technicalField of [
    'sales_order_id',
    'sales_order_item_id',
    'product_id',
    'product_sku_id',
    'warehouse_id',
    'unit_id',
    'lot_id',
  ]) {
    await assertTextAbsent(page, technicalField)
  }

  await expectNoButton(page, '消耗')

  await assertNoHorizontalOverflow(page, 'business-formal-outbound')
}
