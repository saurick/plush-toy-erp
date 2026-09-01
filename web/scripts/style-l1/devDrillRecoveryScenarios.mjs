import {
  installDataPreparationContractFailureRoute,
  installSummaryRoute,
} from './devVersionCenterScenarios.mjs'

export async function installDrillRecoveryRoutes(page) {
  await installDataPreparationContractFailureRoute(page)
  await installSummaryRoute(page)
}

export function createDevDrillRecoveryScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  return [
    {
      name: 'dev-drill-recovery-desktop-light',
      path: '/__dev/drill-recovery',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: installDrillRecoveryRoutes,
      verify: async (page) => {
        await expectHeading(page, '演练与恢复中心')
        assert.equal(
          await page
            .getByRole('link', { name: '演练与恢复', exact: true })
            .getAttribute('aria-current'),
          'page',
          '交付运行菜单必须明确标记当前演练与恢复入口'
        )
        await page.getByText('项目方演练造数环境', { exact: true }).waitFor()
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '双环境事实只在交付运行总览展示，演练子页不应重复常驻'
        )
        await page
          .getByText('新服务器或正式环境切换', { exact: true })
          .waitFor()
        assert.equal(
          await page.locator('.erp-dev-recovery-row[open]').count(),
          1,
          '首屏只展开当前建议，避免全部演练内容同时铺开'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-drill-recovery-desktop-light'
        )

        const faultRow = page
          .locator('.erp-dev-recovery-row')
          .filter({ hasText: '故障注入与恢复' })
        await faultRow.locator('summary').click()
        assert.equal(await faultRow.getAttribute('open'), '')
        assert.equal(
          await faultRow
            .getByRole('button', { name: '暂不在页面执行' })
            .isDisabled(),
          true
        )
      },
    },
  ]
}
