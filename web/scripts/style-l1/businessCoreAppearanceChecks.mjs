import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreAppearance(page, deps) {
  const {
    assert,
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

  await expectHeading(page, '生产管理')
  const productionTabs = page.locator('.erp-business-module-tabs')
  const exceptionsTab = productionTabs.getByRole('tab', { name: '异常处理', exact: true })
  assert.equal(await exceptionsTab.getAttribute('aria-selected'), 'true')
  assert.equal(await page.getByRole('tab', { name: '待审批', exact: true }).count(), 0)

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
      'business-production-exceptions-dark.png'
    ),
    fullPage: true,
  })

  await productionTabs.getByRole('tab', { name: '生产记录', exact: true }).click()
  await expectHeading(page, '生产记录')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-production-records-dark',
  })

  await assertERPThemeMode(page, {
    scenarioName: 'business-production-records-dark',
    expectedMode: 'dark',
    expectedEffectiveTheme: 'dark',
  })
  await exceptionsTab.click()
  await expectText(page, '暂无生产异常处置申请')
  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-production-exceptions-return-dark',
    exportVisible: false,
  })
  await assertERPThemeMode(page, {
    scenarioName: 'business-production-exceptions-return-dark',
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
