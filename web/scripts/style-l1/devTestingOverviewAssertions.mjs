export async function verifyTestingOverview(page, assert, assertNoHorizontalOverflow) {
  const tabs = page.getByRole('tablist', { name: '测试验证工作区主视图' })
  const overview = page.locator('.erp-dev-testing-overview')
  const methods = overview.getByRole('table', { name: '测试维度与入口' })
  const reports = overview.getByRole('region', { name: '已有测试报告' })
  await tabs.getByRole('tab', { name: '本地测试总览', exact: true, selected: true }).waitFor()
  assert.equal(await methods.locator('tbody tr').count(), 10)
  assert.deepEqual(await methods.getByRole('columnheader').allTextContents(), ['测试维度', '主要验证', '执行入口', '报告与证据'])
  await methods.getByRole('row', { name: /手机真机/u }).getByText('人工执行，未接入固定 runner', { exact: true }).waitFor()
  await methods.getByRole('row', { name: /Codex 探索/u }).getByText('探索记录与脚本回归分别留存', { exact: true }).waitFor()
  await assertNoHorizontalOverflow(page, '测试总览默认入口')

  for (const name of ['领域逻辑与 fuzz', '真实数据库', '浏览器与模拟接口', '浏览器与真实后端', '布局、打印与导出']) {
    await methods.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) }).getByRole('link', { name: '查看专项命令', exact: true }).click()
    await page.getByRole('heading', { name: '专项检查命令', exact: true }).waitFor()
    await page.locator('.erp-dev-testing-command-block').first().waitFor()
    assert.equal(new URL(page.url()).searchParams.get('returnView'), 'overview')
    if (name === '真实数据库') await page.reload()
    await page.getByRole('button', { name: '返回测试总览', exact: true }).click()
    await methods.waitFor()
  }

  await reports.getByRole('link', { name: /^业务场景/u }).click()
  await page.locator('.erp-dev-testing-coverage-tabs').getByRole('tab', { name: /^业务场景/u, selected: true }).waitFor()
  await page.reload()
  await page.locator('.erp-dev-testing-coverage-tabs').getByRole('tab', { name: /^业务场景/u, selected: true }).waitFor()
  await tabs.getByRole('tab', { name: '本地测试总览', exact: true }).click()

  await overview.getByRole('link', { name: '增长、并发与事务', exact: true }).click()
  await page.getByRole('table', { name: '增长、并发与事务验证', exact: true }).waitFor()
  await tabs.getByRole('tab', { name: '本地测试总览', exact: true }).click()
  await methods.getByRole('link', { name: '查看真机场景', exact: true }).click()
  await page.getByRole('table', { name: '真机回归场景范围', exact: true }).waitFor()
  await tabs.getByRole('tab', { name: '本地测试总览', exact: true }).click()

  const catalog = (route) => route.fulfill({ json: { batches: [] } })
  await page.route('**/__dev/api/qa/business-chain-audit', catalog)
  try {
    await reports.getByRole('link', { name: '链路实测报告', exact: true }).click()
    await page.getByText('尚未采集链路实测报告。', { exact: true }).waitFor()
    await page.reload()
    await page.getByRole('link', { name: '返回测试总览', exact: true }).click()
    await methods.waitFor()
  } finally {
    await page.unroute('**/__dev/api/qa/business-chain-audit', catalog)
  }

  let status = 'missing'
  const passed = { status: 'passed', total: 1, executed: 1, passed: 1, failed: 0, skipped: 0, metrics: { lines: { covered: 1, total: 1 } } }
  const response = (route) => route.fulfill({ json: {
    status,
    report: {
      schemaVersion: 'plush-test-coverage-report/v1',
      generatedAt: '2026-10-23T00:00:00Z',
      codeCoverage: { go: passed, web: passed },
      businessCoverage: { ...passed, domains: [] },
      gates: [],
      acceptance: {},
    },
  } })
  await page.route('**/__dev/api/qa/coverage', response)
  try {
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByText('当前开发机工作区的执行结果 · 尚未生成报告，可进入代码覆盖采集基线。', { exact: true }).waitFor()
    assert.equal(await reports.getByText('报告缺失', { exact: true }).count(), 4)
    await reports.getByRole('link', { name: '关键规则 查看独立结果', exact: true }).waitFor()
    assert.equal(await methods.locator('tbody tr').count(), 10)
    status = 'failed'
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByText('测试报告读取失败', { exact: true }).waitFor()
    assert.equal(await methods.getByRole('link', { name: '查看专项命令', exact: true }).count(), 6)
    status = 'stale'
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByText('测试报告读取失败', { exact: true }).waitFor({ state: 'hidden' })
    await reports.getByText('报告过期', { exact: true }).first().waitFor()
    assert.equal(await reports.getByText('报告过期', { exact: true }).count(), 4)
    assert.equal(await reports.getByText('通过', { exact: true }).count(), 0)
    status = 'current'
    await reports.getByRole('button', { name: '重新读取', exact: true }).click()
    await reports.getByRole('link', { name: /^代码覆盖/u }).getByText('通过', { exact: true }).waitFor()
  } finally {
    await page.unroute('**/__dev/api/qa/coverage', response)
  }

  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 1100, height: 800 })
  await assertNoHorizontalOverflow(page, '测试总览窄桌面')
  const boxes = await methods.getByRole('columnheader').evaluateAll((cells) => cells.map((cell) => ({
    width: cell.getBoundingClientRect().width,
    fontSize: parseFloat(getComputedStyle(cell).fontSize),
  })))
  assert(boxes.every(({ width, fontSize }) => width >= 130 && fontSize >= 14), '总览列保持可读宽度与字号')
  await page.setViewportSize(viewport)
  // 后续场景从本轮验证的默认查询开始，不继承本场景已验证的下钻筛选。
  await page.goto(new URL('?view=tiers', page.url()).href)
}
