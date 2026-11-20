import { installSummaryRoute, waitForView } from './devVersionCenterScenarios.mjs'

export function createDevVersionCenterReleaseEvidenceScenarios({ assert }) {
  return [
    {
      name: 'dev-version-center-release-evidence-desktop',
      path: '/__dev/version-center?view=versions&target=demo-133',
      viewport: { width: 1440, height: 900 },
      auth: 'admin',
      mockAdminRpc: true,
      beforeNavigate: async (page) => {
        const summary = await installSummaryRoute(page)
        summary.operations = summary.operations.filter(operation => operation.terminal)
        const [missingSource, incomplete] = summary.versions
        missingSource.promotionEligible = false
        missingSource.promotionBlocker = 'source_package_missing'
        incomplete.assets = incomplete.assets.filter(name => name !== 'release-rehearsal.json')
        incomplete.completeAssets = false
        incomplete.promotionEligible = false
        Object.assign(summary.versions[8], {
          promotionEligible: false,
          promotionBlocker: 'source_package_missing',
        })
      },
      verify: async (page) => {
        await waitForView(page, 'versions')
        const table = page.locator('.erp-dev-version-tab--versions .ant-table')
        const row = version => table.getByRole('row').filter({ hasText: `2026.08.08-${version}` })
        assert.equal(await row(12).getByRole('button', { name: '准备部署' }).isEnabled(), true)
        async function verifyBlocked(version, action, reason) {
          const button = row(version).getByRole('button', { name: action })
          assert.equal(await button.isDisabled(), true)
          await button.hover({ force: true })
          const tooltip = page.getByRole('tooltip').filter({ hasText: reason })
          await tooltip.waitFor({ state: 'visible' })
          await row(version).getByRole('link').hover()
          await tooltip.waitFor({ state: 'hidden' })
        }
        await verifyBlocked(13, '准备部署', '缺少发布制品：release-rehearsal.json')
        await verifyBlocked(14, '准备部署', '缺少同一提交的源码包')
        await page.locator('.erp-dev-version-tab--versions .ant-pagination-item-2').click()
        await verifyBlocked(6, '检查回滚', '缺少同一提交的源码包')
        assert.equal(await row(5).getByRole('button', { name: '检查回滚' }).isEnabled(), true)
      },
    },
  ]
}
