import { createBusinessFormalAssertions } from './businessFormalAssertions.mjs'

export async function verifyBusinessCoreFinance(page, deps) {
  const {
    assertBusinessPageRefreshEntrypoint,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectHeading,
    expectText,
    gotoScenarioPath,
  } = deps
  const { assertUnifiedListToolbarShell } = createBusinessFormalAssertions(deps)
  await gotoScenarioPath(page, '/erp/finance/receivables', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '应收')

  await expectText(page, 'AR-STYLE-L1')

  await assertTextAbsent(page, 'finance_facts')

  await assertTextAbsent(page, 'RECEIVABLE')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-receivables',
  })

  await assertTextAbsent(page, '登记应收事实')

  await assertTextAbsent(page, '生成应收')

  await assertBusinessPageRefreshEntrypoint(page, {
    scenarioName: 'business-formal-receivables',
  })

  await assertNoHorizontalOverflow(page, 'business-formal-receivables')

  await gotoScenarioPath(page, '/erp/finance/payables', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '应付')

  await expectText(page, 'AP-STYLE-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-payables',
  })

  await assertTextAbsent(page, '登记应付事实')

  await assertTextAbsent(page, '生成应付')

  await assertNoHorizontalOverflow(page, 'business-formal-payables')

  await gotoScenarioPath(page, '/erp/finance/invoices', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '发票')

  await expectText(page, 'INV-STYLE-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-invoices',
  })

  await assertTextAbsent(page, '登记发票事实')

  await assertTextAbsent(page, '生成发票')

  await assertNoHorizontalOverflow(page, 'business-formal-invoices')

  await gotoScenarioPath(page, '/erp/finance/reconciliation', {
    waitUntil: 'domcontentloaded',
  })

  await expectHeading(page, '对账')

  await expectText(page, 'REC-STYLE-L1')

  await assertUnifiedListToolbarShell(page, {
    scenarioName: 'business-formal-reconciliation',
  })

  await assertTextAbsent(page, '登记对账事实')

  await assertTextAbsent(page, '生成对账')

  await assertNoHorizontalOverflow(page, 'business-formal-reconciliation')
}
