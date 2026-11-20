import { businessRuleTests, businessTestKey } from '../../../scripts/qa/lib/business-rule-catalog.mjs'

export function createGrowthValidationScenarios({ assert, path, outputDir }) {
  return [{
    name: 'dev-growth-correctness-evidence',
    path: '/__dev/testing',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) => route.fulfill({ json: {
        status: 'missing', message: '当前样例没有覆盖报告',
      } }))
      await page.route('**/__dev/api/qa/quality-gates/integration-evidence', (route) => route.fulfill({ json: {
        kind: 'plush.integration-evidence',
        current: false,
        scenarios: [],
        run: null,
        ruleTests: businessRuleTests('postgres').map((test) => ({ id: businessTestKey(test), status: 'missing' })),
      } }))
    },
    verify: async (page) => {
      await page.getByRole('tablist', { name: '测试环境与指引' }).getByRole('tab', { name: '测试指引', exact: true }).click()
      await page.getByRole('navigation', { name: '测试指引目录', exact: true }).getByRole('button', { name: '增长验证', exact: true }).click()
      const table = page.getByRole('table', { name: '增长、并发与事务验证', exact: true })
      await table.waitFor()
      for (const label of ['功能可扩展性', '数据与负载可伸缩性', '并发正确性', '事务一致性', '性能、资源与恢复']) {
        assert.equal(await table.getByRole('rowheader', { name: label, exact: true }).count(), 1)
      }
      await page.getByRole('tablist', { name: '测试环境与指引' }).getByRole('tab', { name: '本地测试', exact: true }).click()
      await page.getByRole('tablist', { name: '测试验证工作区主视图' }).getByRole('tab', { name: '覆盖报告', exact: true }).click()
      await page.getByRole('tab', { name: /^关键规则/u }).click()
      const rules = page.getByRole('region', { name: '关键规则与发布门禁', exact: true })
      const search = rules.getByRole('textbox', { name: '搜索关键规则', exact: true })
      await search.fill('销售导出')
      await search.press('Enter')
      await rules.getByText('销售导出快照与完整结果', { exact: true }).waitFor()
      const row = rules.getByRole('row').filter({ hasText: '销售导出预算、准入与取消释放' })
      // Static registration never supplies execution evidence.
      assert.equal(await rules.getByText('用例通过', { exact: true }).count(), 0)
      assert.equal(await rules.getByText('销售导出预算、准入与取消释放', { exact: true }).count(), 1)
      assert.equal(await rules.getByRole('columnheader').count(), 2, '默认只展示规则名称和证据状态')
      await row.getByRole('button', { name: '查看销售导出预算、准入与取消释放的测试与门禁', exact: true }).click()
      const detail = rules.getByRole('table', { name: '销售导出预算、准入与取消释放验证范围', exact: true })
      await detail.waitFor()
      assert.equal(await detail.getByRole('row').count(), 3, '五项检查按两个验证范围归组')
      assert.equal(await detail.getByText('未验证', { exact: true }).count(), 2)
      const counts = await detail.locator('tbody tr td:last-child').allTextContents()
      assert.equal(counts.reduce((sum, value) => sum + Number.parseInt(value, 10), 0), 5, '简化展示保留所有关联检查')
      assert.equal(await search.isVisible(), true, '查看规则依据时仍可继续搜索同一结果表')
      await rules.getByText('查看校验与恢复图', { exact: true }).click()
      await rules.getByRole('region', { name: '有界读取与完整快照画布', exact: true }).locator('svg').waitFor()
      await page.screenshot({ path: path.join(outputDir, 'growth-correctness-rules-4k.png') })
      const toggle = row.getByRole('button', { name: '查看销售导出预算、准入与取消释放的测试与门禁', exact: true })
      await toggle.click()
      await detail.waitFor({ state: 'hidden' })
      assert.equal(await search.isVisible(), true, '收起详情后仍在原搜索结果中')
      await search.fill('不存在的规则xyz')
      await search.press('Enter')
      await rules.getByText('没有匹配的关键规则', { exact: true }).waitFor()
      await search.fill('销售导出')
      await search.press('Enter')
      await toggle.click()
      await detail.waitFor()
      assert.equal(await rules.getByRole('button', { name: '查看销售导出快照与完整结果的测试与门禁', exact: true }).isVisible(), true, '重新展开后同类规则仍可直接选择')

    },
  }]
}
