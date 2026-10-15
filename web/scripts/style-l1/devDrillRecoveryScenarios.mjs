import {
  installDataPreparationContractFailureRoute,
  installSummaryRoute,
} from './devVersionCenterScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

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
        await expectHeading(page, '安全与恢复')
        assert.equal(
          await page
            .getByRole('link', { name: '安全与恢复', exact: true })
            .getAttribute('aria-current'),
          'page',
          '交付运行菜单必须明确标记当前安全与恢复入口'
        )
        await page.getByText('项目方演练造数环境', { exact: true }).waitFor()
        const security = page.getByRole('table', { name: '安全检查' })
        assert.equal(await security.locator('tbody tr').count(), 4)
        assert.equal(
          await security.getByText('未核验', { exact: true }).count(),
          4,
          '交付证据不能替代专门的安全核验'
        )
        assert.match(
          await page
            .getByRole('link', { name: '防入侵与防勒索指引', exact: true })
            .getAttribute('href'),
          /path=/u
        )
        assert.equal(
          await page.locator('.erp-dev-environment-evidence').count(),
          0,
          '双环境事实只在交付运行总览展示，演练子页不应重复常驻'
        )
        assert.equal(await page.getByRole('table', { name: '演练清单' }).isVisible(), false)
        await verifySlidingMotion(page, assert, '.erp-dev-recovery-page .erp-dev-delivery-taskbar', 1)
        await page.waitForURL((url) => url.searchParams.get('view') === 'drills')
        await page
          .getByText('新服务器或正式环境切换', { exact: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('table', { name: '演练清单' })
            .locator('tbody tr')
            .count(),
          6,
          '演练清单应完整显示六项演练并将详情按需打开'
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-drill-recovery-desktop-light'
        )

        const trigger = page.getByRole('button', {
          name: '查看故障注入与恢复要点',
        })
        await trigger.click()
        const detail = page.getByRole('dialog')
        await detail.waitFor({ state: 'visible' })
        assert.equal(
          await detail
            .getByRole('button', { name: '暂不在页面执行' })
            .isDisabled(),
          true
        )
        await detail.getByRole('button', { name: '关闭' }).click()
        await detail.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '查看故障注入与恢复要点'
        )
        await verifySlidingMotion(page, assert, '.erp-dev-recovery-page .erp-dev-delivery-taskbar', 2, true)
        await page.getByText('疑似入侵或勒索时的处置', { exact: true }).click()
        await page.getByRole('link', { name: '阅读事件处置与恢复边界', exact: true }).waitFor()
        await page.reload()
        await page.getByRole('tab', { name: '应急指引', exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '应急指引', exact: true }).getAttribute('aria-selected'), 'true')
        await page.getByRole('tab', { name: '安全核验', exact: true }).click()
        await security.waitFor({ state: 'visible' })
        assert.equal(await security.getByText('未核验', { exact: true }).count(), 4)
      },
    },
  ]
}
