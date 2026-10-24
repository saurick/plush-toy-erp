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
      await page.getByRole('tab', { name: '增长验证', exact: true }).click()
      const table = page.getByRole('table', { name: '增长、并发与事务验证', exact: true })
      await table.waitFor()
      for (const label of ['功能可扩展性', '数据与负载可伸缩性', '并发正确性', '事务一致性', '性能、资源与恢复']) {
        assert.equal(await table.getByRole('rowheader', { name: label, exact: true }).count(), 1)
      }
      await page.getByRole('link', { name: '查看关键规则证据', exact: true }).click()
      const rules = page.getByRole('region', { name: '关键规则与发布门禁', exact: true })
      await rules.getByText('销售导出快照与完整结果', { exact: true }).waitFor()
      const row = rules.getByRole('row').filter({ hasText: '销售导出预算、准入与取消释放' })
      // Static registration never supplies execution evidence.
      assert.equal(await rules.getByText('用例通过', { exact: true }).count(), 0)
      assert.equal(await rules.getByText('销售导出预算、准入与取消释放', { exact: true }).count(), 1)
      assert.equal(await rules.getByText('数据增长与资源边界', { exact: true }).count(), 2)
      await row.getByRole('button', { name: '查看销售导出预算、准入与取消释放的测试与门禁', exact: true }).click()
      const detail = rules.getByRole('table', { name: '销售导出预算、准入与取消释放测试对应关系', exact: true })
      await detail.waitFor()
      assert.equal(await detail.getByRole('row').count(), 6)
      assert.equal(await detail.getByText('未验证', { exact: true }).count(), 5)
      await rules.getByText('查看校验与恢复图', { exact: true }).click()
      await rules.getByRole('region', { name: '有界读取与完整快照画布', exact: true }).locator('svg').waitFor()
      await page.screenshot({ path: path.join(outputDir, 'growth-correctness-rules-4k.png') })
    },
  }]
}
