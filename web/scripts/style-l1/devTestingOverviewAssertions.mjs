export async function verifyTestingOverview(page, assert, assertNoHorizontalOverflow) {
  const tabs = page.getByRole('tablist', { name: '测试验证工作区主视图' })
  const groups = page.getByRole('tablist', { name: '测试环境与指引' })
  const overview = page.locator('.erp-dev-testing-overview')
  const reports = overview.getByRole('region', { name: '已有测试报告' })
  await tabs.getByRole('tab', { name: '测试总览', exact: true, selected: true }).waitFor()
  assert.deepEqual(await reports.getByRole('columnheader').allTextContents(), ['报告', '状态'])
  assert.equal(await reports.locator('tbody tr').count(), 5)
  assert.equal(await overview.locator('a').count(), 0, '总览只读状态，不重复提供跨页或跨视图入口')
  assert.equal(await overview.getByRole('table').count(), 1)
  await assertNoHorizontalOverflow(page, '极简报告总览')
  await tabs.getByRole('tab', { name: '覆盖报告', exact: true }).click()
  await page.locator('.erp-dev-testing-coverage-view').waitFor()
  await page.reload()
  await tabs.getByRole('tab', { name: '测试总览', exact: true }).click()
  await reports.waitFor()
  await groups.getByRole('tab', { name: '测试指引', exact: true }).click()
  await page.getByRole('navigation', { name: '测试指引目录', exact: true }).getByRole('button', { name: '增长验证', exact: true }).click()
  await page.getByRole('table', { name: '增长、并发与事务验证', exact: true }).waitFor()
  await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
  await tabs.getByRole('tab', { name: '测试总览', exact: true }).click()
  let status = 'missing'
  const passed = { status: 'passed', total: 1, executed: 1, passed: 1, failed: 0, skipped: 0, metrics: { lines: { covered: 1, total: 1 } } }
  const response = (route) => route.fulfill({ json: { status,
report: {
    schemaVersion: 'plush-test-coverage-report/v1', generatedAt: '2026-10-23T00:00:00Z', codeCoverage: { go: passed, web: passed }, businessCoverage: { ...passed, domains: [] }, gates: [], acceptance: {},
  } } })
  await page.route('**/__dev/api/qa/coverage', response)
  try {
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByText('尚未生成报告，可进入代码覆盖采集基线。', { exact: true }).waitFor()
    assert.equal(await reports.getByText('报告缺失', { exact: true }).count(), 4)
    await reports.getByText('单独核对', { exact: true }).waitFor()
    status = 'failed'
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByText('测试报告读取失败', { exact: true }).waitFor()
    status = 'stale'
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByText('报告已过期，仅供追溯。', { exact: true }).waitFor()
    assert.equal(await reports.getByText('报告过期', { exact: true }).count(), 4)
    assert.equal(await reports.getByText('通过', { exact: true }).count(), 0)
    status = 'current'
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '代码覆盖', exact: true }) }).getByText('通过', { exact: true }).waitFor()
    await page.setViewportSize({ width: 1100, height: 800 })
    await assertNoHorizontalOverflow(page, '报告总览窄桌面')
  } finally { await page.unroute('**/__dev/api/qa/coverage', response) }
  await page.goto(new URL('?view=tiers', page.url()).href)
}
