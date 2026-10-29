import { openTestingDetails, closeTestingDetails } from './devTestingDetailsActions.mjs'
import { installDeliverySummaryRoute } from './devVersionCenterScenarios.mjs'
import { createQualityGateStyleSummary } from './devQualityGateScenarios.mjs'
import { validateDevDeliverySummary } from '../../src/dev-workbench/config/devDelivery.mjs'

export function createDevServerVerificationScenarios({
  assert,
  assertNoHorizontalOverflow,
}) {
  const states = new WeakMap()
  return [
    {
      name: 'dev-server-verification-layout-desktop-light',
      path: '/__dev/testing?view=server&customer=yoyoosun',
      viewport: { width: 1280, height: 720 },
      expectedConsoleErrorPatterns: [
        /console error.*status of 503.*\/__dev\/api\/qa\/quality-gates:0:0$/u,
        /console error.*status of 503.*\/__dev\/api\/delivery\/summary:0:0$/u,
      ],
      beforeNavigate: async (page) => {
        const state = { failQuality: false, failDelivery: false, writes: 0 }
        state.hold = () => {
          state.pending = new Promise((resolve) => {
            state.release = resolve
          })
        }
        state.hold()
        states.set(page, state)
        const summary = await installDeliverySummaryRoute(page)
        const operation = summary.operations.find(
          (item) => item.target === 'demo-133' && item.status === 'passed'
        )
        const { runtime } = summary.targets[0].preflight.remote
        runtime.serverSha = operation.gitSha
        runtime.webSha = operation.gitSha
        runtime.migrationVersion = '20261023044447'
        summary.targets[0].preflight.remote.publicEntry.gitSha =
          operation.gitSha
        operation.gitlabRecord = {
          status: 'recorded',
          evidenceUrl:
            'https://gitlab.saurick.me/saurick/plush-toy-erp/-/packages/10',
        }
        operation.stages = [
          {
            id: 'fresh_backup_and_restore_check',
            label: '新备份与隔离恢复',
            status: 'passed',
            durationMs: 3000,
          },
          {
            id: 'runtime_verified',
            label: '目标运行读回',
            status: 'passed',
            durationMs: 2000,
          },
        ]
        operation.evidence = {
          status: 'passed',
          contract: 'browser-verification-layout',
          receiptSha256: 'c'.repeat(64),
          finishedAt: operation.updatedAt,
          checks: {
            releaseIdentity: true,
            health: true,
            ready: true,
            basicSmoke: true,
            publicEntry: true,
            backupRestore: true,
          },
          migration: {
            required: runtime.migrationVersion,
            readback: runtime.migrationVersion,
            readbackStatus: 'passed',
            applyStarted: false,
          },
          backup: {
            alias: `browser-layout-${'long-backup-'.repeat(11)}`,
            sha256: 'd'.repeat(64),
            sizeBytes: 42,
            restoreChecked: true,
          },
        }
        validateDevDeliverySummary(summary)
        await page.route('**/__dev/api/delivery/summary', async (route) => {
          await state.pending
          await route.fulfill({
            status: state.failDelivery ? 503 : 200,
            contentType: 'application/json',
            body: JSON.stringify(state.failDelivery ? {} : summary),
          })
        })
        await page.route('**/__dev/api/qa/quality-gates', async (route) => {
          await state.pending
          await state.qualityPending
          await route.fulfill({
            status: state.failQuality ? 503 : 200,
            contentType: 'application/json',
            body: JSON.stringify(
              state.failQuality ? {} : createQualityGateStyleSummary('passed')
            ),
          })
        })
        await page.route('**/__dev/api/**', async (route) => {
          if (route.request().method() === 'GET') return route.fallback()
          state.writes += 1
          return route.fulfill({ status: 409, body: '{}' })
        })
      },
      verify: async (page) => {
        const state = states.get(page)
        const region = page.getByRole('region', { name: '服务器测试与交付证据', exact: true })
        const table = region.getByRole('table', { name: '目标服务器验证结果', exact: true })
        const ciRow = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'GitLab CI', exact: true }) })
        const demo = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: 'demo 环境', exact: true }) })
        const settled = () => page.waitForFunction(() => document.querySelector('.erp-dev-verification-evidence')?.getAttribute('aria-busy') === 'false')
        const refresh = async () => {
          state.hold()
          await region.getByRole('button', { name: '重新核对服务器', exact: true }).click()
          await region.getByText('核对中', { exact: true }).first().waitFor()
          state.release()
          await settled()
        }
        const openCI = () => openTestingDetails(page, ciRow.getByRole('button', { name: '查看 CI', exact: true }), 'GitLab CI 证据')
        try {
          await table.waitFor()
          assert.deepEqual(await table.getByRole('columnheader').allTextContents(), ['来源', '版本', '结果', '详情'])
          assert.equal(await table.locator('tbody > tr').count(), 4)
          assert.equal(await table.getByText('核对中', { exact: true }).count(), 4)
          assert.equal(await region.locator('.ant-tag-success').count(), 0, '读取中不能补造成功证据')
          state.qualityPending = new Promise((resolve) => { state.releaseQuality = resolve })
          state.release()
          await demo.getByRole('button', { name: '查看回执', exact: true }).waitFor()
          await ciRow.getByText('核对中', { exact: true }).waitFor()
          assert.equal(await region.getAttribute('aria-busy'), 'true', '目标回执不等待较慢的 CI')
          state.releaseQuality()
          await settled()
          await ciRow.getByText('历史 CI 通过', { exact: true }).waitFor()
          assert.equal(await ciRow.locator('.ant-tag-success').count(), 0, 'CI 没覆盖工作区时不能标成当前通过')
          assert.equal(await demo.getByText('通过', { exact: true }).count(), 1)
          assert.equal(await table.getByText('未证明', { exact: true }).count(), 2, '其他目标不能继承 demo 回执')
          let ci = await openCI()
          assert.equal(await ci.getByRole('link', { name: '查看 GitLab 测试报告', exact: true }).getAttribute('href'), 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/41/test_report')
          await closeTestingDetails(page)
          for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
            await page.setViewportSize(viewport)
            const box = await table.boundingBox()
            assert.equal(await region.getByRole('table').count(), 1, '默认合并为一个结果表')
            if (viewport.width >= 1280) assert(box.y + box.height < viewport.height, '默认结果在首屏可读')
            await assertNoHorizontalOverflow(page, `服务器结果 ${viewport.width}`)
          }
          await page.setViewportSize({ width: 1280, height: 720 })
          await demo.getByRole('button', { name: '查看回执', exact: true }).click()
          const details = table.locator('.erp-dev-verification-evidence__receipt-row')
          await details.getByText('回执 SHA-256：', { exact: false }).waitFor()
          assert.equal(await details.locator('td').getAttribute('colspan'), '4')
          assert.equal(await details.locator('.erp-dev-verification-evidence__checks').getByText('通过', { exact: true }).count(), 4, '四项独立核验仍可查看')
          assert.equal(await details.getByRole('link', { name: 'GitLab 原始交付证据', exact: true }).getAttribute('href'), 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/packages/10')
          await assertNoHorizontalOverflow(page, '服务器长回执')
          await demo.getByRole('button', { name: '收起详情', exact: true }).click()
          state.hold()
          await region.getByRole('button', { name: '重新核对服务器', exact: true }).click()
          await ciRow.getByText('核对中', { exact: true }).waitFor()
          assert.equal(await region.locator('.ant-tag-success').count(), 0)
          ci = await openCI()
          await ci.getByText('上次读取记录，仅供追溯；本次状态尚未确认。', { exact: true }).waitFor()
          await ci.getByRole('link', { name: '查看 GitLab 测试报告', exact: true }).waitFor()
          await closeTestingDetails(page)
          state.failQuality = true
          state.release()
          await settled()
          await ciRow.getByText('上次读取', { exact: true }).waitFor()
          assert.equal(await demo.getByText('通过', { exact: true }).count(), 1)
          state.failDelivery = true
          await refresh()
          assert.equal(await table.getByText('读取失败', { exact: true }).count(), 3)
          assert.equal(await region.locator('.ant-tag-success').count(), 0, '失败后旧回执不能冒充本次通过')
          state.failQuality = false
          state.failDelivery = false
          await refresh()
          await ciRow.getByText('历史 CI 通过', { exact: true }).waitFor()
          await region.getByRole('alert').waitFor({ state: 'detached' })
          await table.getByRole('button', { name: '查看缺口', exact: true }).last().click()
          await table.getByText('没有取得与运行版本对应的完整执行回执，不能以健康检查或 CI 结果代替。', { exact: true }).waitFor()
          await table.getByRole('button', { name: '收起详情', exact: true }).click()
          for (const label of ['交付运维', '安全与恢复']) {
            await page.getByRole('navigation', { name: '开发页面导航' }).getByRole('link', { name: label, exact: true }).click()
            if (label === '交付运维') await page.getByRole('tab', { name: '环境证据', exact: true }).click()
            await region.waitFor()
            if (label === '安全与恢复') {
              const summary = region.locator('[aria-label="服务器证据摘要"]')
              await summary.getByText('历史 CI 通过', { exact: true }).waitFor()
              assert.equal(await table.isVisible(), false, '安全与恢复默认只显示四个来源的摘要')
              assert.equal(await summary.locator('dt').count(), 4)
              assert.equal(await summary.getByText('通过', { exact: true }).count(), 1, '摘要不能将一个环境通过扩成全部通过')
              await region.getByText(/运行版本未证明与工作台源码一致/u).waitFor()
              state.failQuality = true
              state.failDelivery = true
              await refresh()
              assert.equal(await summary.getByText('读取失败', { exact: true }).count(), 3)
              assert.equal(await summary.locator('.ant-tag-success').count(), 0, '收起详情时仍必须撤销过期成功状态')
              await region.getByRole('alert').waitFor({ state: 'visible' })
              assert.equal(await table.isVisible(), false, '读取失败在摘要区域可见，无需打开明细')
              state.failQuality = false
              state.failDelivery = false
              await refresh()
              await summary.getByText('历史 CI 通过', { exact: true }).waitFor()
              await region.getByRole('alert').waitFor({ state: 'detached' })
              await region.getByText('核验详情', { exact: true }).click()
            }
            await ciRow.getByText('历史 CI 通过', { exact: true }).waitFor()
            await assertNoHorizontalOverflow(page, `服务器证据共享消费者 ${label}`)
          }
          assert.equal(state.writes, 0, '查看与刷新不能运行测试或部署')
        } finally {
          state.release()
          state.releaseQuality?.()
        }
      },
    },
  ]
}
