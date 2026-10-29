import {
  installDataPreparationContractFailureRoute,
  installSummaryRoute,
} from './devVersionCenterScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

export async function installDrillRecoveryRoutes(page) {
  await installDataPreparationContractFailureRoute(page)
  const summary = await installSummaryRoute(page)
  summary.retention = {
    status: 'passed',
    generatedAt: new Date().toISOString(),
    backups: ['demo', 'test', 'erp', 'gitlab'].flatMap((environment) =>
      Array.from({ length: 9 }, (_, index) => ({
        id: `${environment}-backup-${index + 1}`,
        environment,
        name: `${environment}-backup-${index + 1}.tar`,
        location: '数据库与附件',
        sizeBytes: 42,
        createdAt: new Date(Date.UTC(2026, 7, 9, 0, 0, -index)).toISOString(),
        state: index === 0 ? 'protected' : 'retained',
        reasons: index === 0 ? ['当前或回滚版本恢复点'] : [],
      }))
    ),
  }
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
          '交付运维菜单必须明确标记当前安全与恢复入口'
        )
        await page.getByText('项目方演练造数环境', { exact: true }).waitFor()
        const taskNav = page.getByRole('tablist', { name: '安全与恢复任务', exact: true })
        assert.deepEqual(await taskNav.getByRole('tab').allTextContents(), ['安全核验', '恢复演练', '备份记录', '应急指引'])
        const serverEvidence = page.getByRole('region', { name: '服务器测试与交付证据', exact: true })
        await serverEvidence.locator('[aria-label="服务器证据摘要"]').waitFor()
        assert.equal(await serverEvidence.getByRole('table', { name: '目标服务器验证结果', exact: true }).isVisible(), false, '服务器明细默认收起，摘要常显')
        let viewReadCount = 0
        const countViewReads = (request) => {
          if (/\/__dev\/api\/(?:delivery|qa)\//u.test(request.url())) viewReadCount += 1
        }
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
        await firstCheck.getByText('核对应用审计、秘密检查和依赖检查的范围及未完成项。', { exact: true }).waitFor()
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
          '双环境事实只在交付运维总览展示，演练子页不应重复常驻'
        )
        assert.equal(await page.getByRole('table', { name: '演练清单' }).isVisible(), false)
        await page.waitForFunction(() => document.querySelector('.erp-dev-verification-evidence')?.getAttribute('aria-busy') === 'false')
        page.on('request', countViewReads)
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
        const drillsBox = await page.getByRole('table', { name: '演练清单' }).boundingBox()
        assert(drillsBox.y + drillsBox.height < 900, '收起服务器明细后演练清单应能在首屏读完')
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
        await verifySlidingMotion(page, assert, '.erp-dev-recovery-page .erp-dev-delivery-taskbar', 2)
        const backups = page.getByRole('tabpanel', { name: '备份记录', exact: true })
        await backups.waitFor({ state: 'visible' })
        assert.equal(await page.getByRole('table', { name: '演练清单' }).isVisible(), false)
        assert.equal(await backups.getByRole('table').locator('tbody tr[data-row-key]').count(), 7)
        await backups.getByText('test', { exact: true }).click()
        await backups.getByRole('button', { name: '下一页', exact: true }).click()
        await backups.getByText('备份详情', { exact: true }).first().click()
        await backups.getByText('test-backup-8.tar', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '恢复演练', exact: true }).click()
        await page.getByRole('table', { name: '演练清单' }).waitFor({ state: 'visible' })
        await page.getByRole('tab', { name: '备份记录', exact: true }).click()
        await backups.getByText('test-backup-8.tar', { exact: true }).waitFor()
        assert.equal(await backups.getByRole('radio', { name: 'test', exact: true }).isChecked(), true, '切换任务保留备份环境和分页')
        assert.equal(viewReadCount, 0, '页签切换复用现有读取，不新增服务器请求')
        page.off('request', countViewReads)
        await page.reload()
        await backups.waitFor({ state: 'visible' })
        assert.equal(await taskNav.getByRole('tab', { name: '备份记录', exact: true }).getAttribute('aria-selected'), 'true', '刷新恢复备份记录页签')
        await verifySlidingMotion(page, assert, '.erp-dev-recovery-page .erp-dev-delivery-taskbar', 3, true)
        await page.getByRole('heading', { name: '疑似入侵或勒索时的处置', exact: true }).waitFor()
        assert.equal(await page.locator('details.erp-dev-recovery-emergency').count(), 1)
        assert.equal(await page.getByRole('region', { name: '安全事件处置顺序' }).getByRole('listitem').count(), 4)
        assert.equal(await page.getByRole('link', { name: '阅读事件处置与恢复边界', exact: true }).count(), 0)
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
