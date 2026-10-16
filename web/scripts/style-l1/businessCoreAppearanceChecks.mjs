import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreAppearance(page, deps) {
  const {
    assertBusinessHeaderCompact,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    clickERPThemeOption,
    expectHeading,
    expectText,
    gotoScenarioPath,
    outputDir,
    path,
    verifyBusinessActionFormModal,
  } = deps
  const {
    assertBusinessCollaborationPanelAbsent,
    assertUnifiedListToolbarShell,
  } = createBusinessFormalAssertions(deps)
  await clickERPThemeOption(page, '暗色')
  await assertERPThemeMode(page, {
    scenarioName: 'business-core-saved-dark',
    expectedMode: 'dark',
    expectedEffectiveTheme: 'dark',
  })

  await gotoScenarioPath(page, '/erp/finance/receivables', {
    waitUntil: 'domcontentloaded',
  })

  await assertERPThemeMode(page, {
    scenarioName: 'business-formal-receivables-dark',
    expectedMode: 'dark',
    expectedEffectiveTheme: 'dark',
  })

  await expectHeading(page, '应收')

  await assertTextAbsent(page, '登记应收事实')

  await assertTextAbsent(page, '生成应收')

  await assertNoHorizontalOverflow(page, 'business-formal-receivables-dark')

  await gotoScenarioPath(page, '/erp/production/exceptions', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '生产记录')

  await expectText(page, '异常处理')

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-workflow-production-exceptions-dark'
  )

  await assertTextAbsent(page, '登记异常协同')

  await expectText(page, '暂无生产异常处置申请')

  await assertTextAbsent(page, '新建异常单')

  await assertTextAbsent(page, '生成异常处理')

  await assertERPThemeMode(page, {
    scenarioName: 'business-workflow-production-exceptions-dark',
    expectedMode: 'dark',
    expectedEffectiveTheme: 'dark',
  })

  await assertNoHorizontalOverflow(
    page,
    'business-workflow-production-exceptions-dark'
  )

  await page.screenshot({
    path: path.join(
      outputDir,
      'business-production-exceptions-decisions-tab-dark.png'
    ),
    fullPage: true,
  })

  await page.getByRole('tab', { name: '待审批' }).click()

  await expectText(page, '暂无待审批的生产异常处置申请。')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-workflow-production-exceptions-tasks-dark',
    exportVisible: false,
  })

  await assertERPThemeMode(page, {
    scenarioName: 'business-workflow-production-exceptions-tasks-dark',
    expectedMode: 'dark',
    expectedEffectiveTheme: 'dark',
  })

  await clickERPThemeOption(page, '浅色')
  await assertERPThemeMode(page, {
    scenarioName: 'business-core-saved-light',
    expectedMode: 'light',
    expectedEffectiveTheme: 'light',
  })
  await page.setViewportSize({ width: 390, height: 844 })

  await gotoScenarioPath(page, '/erp/warehouse/shipping-release', {
    waitUntil: 'domcontentloaded',
  })

  await assertERPThemeMode(page, {
    scenarioName: 'business-formal-shipping-release-mobile',
    expectedMode: 'light',
    expectedEffectiveTheme: 'light',
  })

  await expectHeading(page, '放行审批')

  await assertTextAbsent(page, '业务处理分开完成')

  await assertBusinessCollaborationPanelAbsent(
    page,
    'business-workflow-shipping-release-mobile'
  )

  await assertTextAbsent(page, '发起放行协同')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-workflow-shipping-release-mobile',
    exportVisible: false,
  })

  await assertTextAbsent(page, '新建放行单')

  await assertTextAbsent(page, '生成出货放行')

  await assertTextAbsent(page, '导出预览字段')

  await assertNoHorizontalOverflow(
    page,
    'business-workflow-shipping-release-mobile'
  )

  await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
    waitUntil: 'domcontentloaded',
  })

  await assertERPThemeMode(page, {
    scenarioName: 'business-formal-outsourcing-mobile',
    expectedMode: 'light',
    expectedEffectiveTheme: 'light',
  })

  await expectHeading(page, '委外订单')

  await assertBusinessHeaderCompact(page, {
    scenarioName: 'business-formal-outsourcing-mobile',
  })

  await verifyBusinessActionFormModal(page, {
    buttonName: '新建加工合同',
    titleText: '新建加工合同',
    minFieldCount: 6,
    screenshotName: 'business-formal-outsourcing-mobile-modal',
    expectedTexts: [
      '加工合同号',
      '加工厂',
      '加工明细',
      '工序',
      '单位',
      '工序选择电绣、激光等加工方式',
    ],
    requireMultiColumn: false,
  })

  await assertTextAbsent(page, '销售订单ID')

  await assertTextAbsent(page, '单位ID')

  await assertNoHorizontalOverflow(page, 'business-formal-outsourcing-mobile')
}
