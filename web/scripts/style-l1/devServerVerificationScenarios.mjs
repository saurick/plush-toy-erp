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
        const region = page.getByRole('region', {
          name: '服务器测试与交付证据',
          exact: true,
        })
        const table = region.getByRole('table', {
          name: '目标服务器验证结果',
          exact: true,
        })
        const ci = region.getByRole('region', {
          name: 'GitLab CI 记录',
          exact: true,
        })
        const refresh = async () => {
          await region
            .getByRole('button', { name: '重新核对服务器', exact: true })
            .click()
          await page.waitForFunction(
            () =>
              document
                .querySelector('.erp-dev-verification-evidence')
                ?.getAttribute('aria-busy') === 'false'
          )
        }
        try {
          await region
            .getByText('正在读取 GitLab CI、目标运行版本与执行回执…', {
              exact: true,
            })
            .waitFor()
          assert.equal(
            await table.locator('tbody tr').count(),
            3,
            'loading retains the three actual target identities'
          )
          assert.equal(
            await table.getByText('核对中', { exact: true }).count(),
            12
          )
          assert.equal(
            await region.locator('.ant-tag-success').count(),
            0,
            'loading cannot manufacture successful evidence'
          )
          await assertNoHorizontalOverflow(page, 'server-verification-loading')
          state.qualityPending = new Promise((resolve) => { state.releaseQuality = resolve })
          state.release()
          await table
            .getByRole('button', { name: '查看回执', exact: true })
            .first()
            .waitFor()
          assert.equal(await ci.getByText('完整 CI 通过', { exact: true }).count(), 0, 'CI 尚未返回时目标结果先可用')
          assert.equal(await region.getAttribute('aria-busy'), 'true')
          state.releaseQuality()
          await ci.getByText('完整 CI 通过', { exact: true }).waitFor()
          assert.equal(
            await table
              .locator('tbody tr')
              .first()
              .getByText('通过', { exact: true })
              .count(),
            4
          )
          assert(
            (await table.getByText('未证明', { exact: true }).count()) >= 4,
            'other targets cannot inherit demo proof'
          )
          assert.equal(
            await ci
              .getByRole('link', { name: '查看 GitLab 测试报告', exact: true })
              .getAttribute('href'),
            'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/41/test_report'
          )
          for (const viewport of [
            { width: 1280, height: 720 },
            { width: 1024, height: 768 },
            { width: 1920, height: 1080 },
          ]) {
            await page.setViewportSize(viewport)
            const boxes = await region.evaluate((node) => {
              const rect = (selector) =>
                node.querySelector(selector).getBoundingClientRect().toJSON()
              return {
                outer: node.getBoundingClientRect().toJSON(),
                heading: rect('.erp-workbench-section__heading'),
                ci: rect('.erp-dev-verification-evidence__ci'),
                targets: rect('.erp-dev-verification-evidence__targets'),
                table: rect('table'),
                font: getComputedStyle(node.querySelector('h2')).fontSize,
              }
            })
            assert(
              boxes.heading.x - boxes.outer.x >= 12,
              'heading must have real inset from the card edge'
            )
            assert(
              parseFloat(boxes.font) >= 14 && parseFloat(boxes.font) <= 18,
              'readable shared heading scale'
            )
            if (viewport.width >= 1600) {
              assert(
                Math.abs(boxes.ci.y - boxes.targets.y) <= 1,
                'CI and target table align on wide screens'
              )
              assert(
                boxes.ci.right < boxes.targets.x,
                'wide columns do not overlap'
              )
            } else
              { assert(
                boxes.targets.y >= boxes.ci.bottom,
                'ordinary desktops stack related evidence in order'
              ) }
            if (viewport.width >= 1280)
              { assert(
                boxes.table.bottom < viewport.height,
                'all target rows remain in the first screen'
              ) }
            await assertNoHorizontalOverflow(
              page,
              `server-verification-${viewport.width}`
            )
          }
          await page.setViewportSize({ width: 1280, height: 720 })
          const receipt = table
            .getByRole('button', { name: '查看回执', exact: true })
            .first()
          await receipt.click()
          const details = table.locator(
            '.erp-dev-verification-evidence__receipt-row'
          )
          await details.getByText('回执 SHA-256：', { exact: false }).waitFor()
          assert.equal(await details.locator('td').getAttribute('colspan'), '7')
          assert.equal(
            await details
              .getByRole('link', { name: 'GitLab 原始交付证据', exact: true })
              .getAttribute('href'),
            'https://gitlab.saurick.me/saurick/plush-toy-erp/-/packages/10'
          )
          await assertNoHorizontalOverflow(
            page,
            'server-verification-long-receipt'
          )
          await table
            .getByRole('button', { name: '收起详情', exact: true })
            .click()
          assert.equal(await details.count(), 0)
          state.hold()
          await region
            .getByRole('button', { name: '重新核对服务器', exact: true })
            .click()
          await ci.getByText('上次读取', { exact: true }).waitFor()
          assert.equal(
            await ci
              .getByRole('link', { name: '查看 GitLab 测试报告', exact: true })
              .count(),
            1,
            'refresh preserves traceable CI links'
          )
          assert.equal(
            await table.getByText('通过', { exact: true }).count(),
            0,
            'old target pass cannot be mistaken for this read'
          )
          assert.equal(
            await table.getByText('核对中', { exact: true }).count(),
            12
          )
          state.failQuality = true
          state.release()
          await region
            .getByText('GitLab CI 状态读取失败，请重新读取。', { exact: true })
            .waitFor()
          await ci.getByText('上次读取', { exact: true }).waitFor()
          assert.equal(await ci.getByRole('link', { name: '查看 GitLab 测试报告', exact: true }).count(), 1, 'CI 刷新失败保留原证据用于追溯')
          assert.equal(
            await table
              .locator('tbody tr')
              .first()
              .getByText('通过', { exact: true })
              .count(),
            4,
            'independent target receipt remains usable'
          )
          state.failDelivery = true
          await refresh()
          await region
            .getByText('目标服务器状态读取失败，请重新读取。', { exact: true })
            .waitFor()
          assert.equal(
            await table.getByText('未证明', { exact: true }).count(),
            12
          )
          state.failQuality = false
          state.failDelivery = false
          await refresh()
          await ci.getByText('完整 CI 通过', { exact: true }).waitFor()
          await region.getByRole('alert').waitFor({ state: 'detached' })
          assert.equal(await region.getByRole('alert').count(), 0)
          const gap = table
            .getByRole('button', { name: '查看缺口', exact: true })
            .last()
          await gap.click()
          await table
            .getByText(
              '没有取得与运行版本对应的完整执行回执，不能以健康检查或 CI 结果代替。',
              { exact: true }
            )
            .waitFor()
          await table
            .getByRole('button', { name: '收起详情', exact: true })
            .click()
          await page
            .getByRole('navigation', { name: '开发页面导航' })
            .getByRole('link', { name: '交付运维', exact: true })
            .click()
          await region.waitFor()
          await ci.getByText('完整 CI 通过', { exact: true }).waitFor()
          await assertNoHorizontalOverflow(
            page,
            'server-verification-delivery-consumer'
          )
          await page
            .getByRole('navigation', { name: '开发页面导航' })
            .getByRole('link', { name: '安全与恢复', exact: true })
            .click()
          await region.waitFor()
          await ci.getByText('完整 CI 通过', { exact: true }).waitFor()
          await assertNoHorizontalOverflow(
            page,
            'server-verification-recovery-consumer'
          )
          assert.equal(
            state.writes,
            0,
            'layout verification must not run tests or deploy'
          )
        } finally {
          state.release()
          state.releaseQuality?.()
        }
      },
    },
  ]
}
