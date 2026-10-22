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
      expectedConsoleErrorPatterns: [/Failed to load resource:.*409/u],
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
        assert.equal(await security.getByRole('columnheader').count(), 3)
        const securityHeights = await security.locator('tbody tr').evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().height))
        assert(securityHeights.every((height) => height < 65), '默认安全行只保留检查项、状态与短动作')
        const firstCheck = security.locator('tbody tr').first()
        const evidence = firstCheck.getByText('本页尚未接入与当前运行版本绑定的安全审计回执。', { exact: true })
        assert.equal(await evidence.isVisible(), false)
        await firstCheck.getByText('核对审计与依赖', { exact: true }).click()
        await evidence.waitFor({ state: 'visible' })
        await firstCheck.getByRole('link', { name: '阅读应用与依赖安全核验要求' }).waitFor()
        await firstCheck.getByText('核对审计与依赖', { exact: true }).click()
        assert.equal(await evidence.isVisible(), false)
        assert.equal(
          await security.getByText('未核验', { exact: true }).count(),
          4,
          '交付证据不能替代专门的安全核验'
        )
        assert.equal(await page.getByRole('link', { name: '防入侵与防勒索指引', exact: true }).count(), 0)
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

        assert.equal(await page.getByRole('table', { name: '演练清单' }).getByRole('columnheader').count(), 3)
        assert.equal(await page.getByText('验证服务、网络或依赖故障发生时的告警、降级和恢复证据。', { exact: true }).isVisible(), false)
        const trigger = page.getByRole('button', {
          name: '查看故障注入与恢复要点',
        })
        assert.equal(await trigger.evaluate((element) => getComputedStyle(element).textDecorationLine), 'underline', '名称入口应能与普通文字区分')
        await trigger.click()
        const detail = page.getByRole('dialog')
        await detail.waitFor({ state: 'visible' })
        await detail.getByText('验证服务、网络或依赖故障发生时的告警、降级和恢复证据。', { exact: true }).waitFor()
        await detail.getByText('建议频率', { exact: true }).waitFor()
        await detail.getByText('暂不在页面执行', { exact: true }).waitFor()
        assert.equal(await detail.getByRole('button', { name: '暂不在页面执行' }).count(), 0)
        assert.equal(await page.locator('.erp-dev-recovery-recommendation').count(), 0)
        await detail.getByRole('button', { name: '关闭' }).click()
        await detail.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') ===
            '查看故障注入与恢复要点'
        )
        await verifySlidingMotion(page, assert, '.erp-dev-recovery-page .erp-dev-delivery-taskbar', 2, true)
        await page.getByRole('heading', { name: '疑似入侵或勒索时的处置', exact: true }).waitFor()
        assert.equal(await page.locator('details.erp-dev-recovery-emergency').count(), 1)
        assert.equal(await page.getByRole('region', { name: '安全事件处置顺序' }).getByRole('listitem').count(), 4)
        await page.getByRole('link', { name: '阅读事件处置与恢复边界', exact: true }).waitFor()
        await page.reload()
        await page.getByRole('tab', { name: '应急指引', exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '应急指引', exact: true }).getAttribute('aria-selected'), 'true')
        await page.getByRole('tab', { name: '安全核验', exact: true }).click()
        await security.waitFor({ state: 'visible' })
        assert.equal(await security.getByText('未核验', { exact: true }).count(), 4)
        await page.setViewportSize({ width: 1100, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-recovery-narrow-desktop')
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.route('**/__dev/api/delivery/summary', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ status: 'failed', message: '操作未完成；请刷新版本中心查看已记录状态' }) }))
        await page.getByRole('button', { name: '核验目标', exact: true }).click()
        await page.getByText('最新状态核对失败', { exact: true }).waitFor()
        await page.getByText(/读取恢复证据失败/u).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-recovery-read-failure')
      },
    },
  ]
}
