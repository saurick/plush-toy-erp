import { fileURLToPath } from 'node:url'
import {
  buildQualityGateGapAnalysis,
  buildQualityGateGovernance,
} from '../../../scripts/qa/quality-gate-catalog.mjs'
import { createQualityGateStyleSummary } from './devQualityGateScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const changedFiles = [
  'web/src/dev-workbench/pages/DevQualityGatesPage.jsx',
  'server/internal/biz/workflow.go',
]

export function createDevQualityGateLayoutScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  const states = new WeakMap()
  return [
    {
      name: 'dev-quality-gates-layout-desktop-light',
      path: '/__dev/quality-gates?view=run',
      viewport: { width: 1280, height: 720 },
      expectedConsoleErrorPatterns: [
        /console error.*status of 503.*\/__dev\/api\/qa\/quality-gates\/governance\?filter=all:0:0$/u,
        /console error.*status of 503.*\/__dev\/api\/qa\/quality-gates\/gaps\?range=staged&risk=all:0:0$/u,
        /console error.*status of 503.*\/__dev\/api\/qa\/quality-gates:0:0$/u,
      ],
      beforeNavigate: async (page) => {
        const state = {
          mode: 'failed',
          empty: false,
          unknown: false,
          error: '',
          writes: 0,
        }
        states.set(page, state)
        await page.route('**/__dev/api/qa/quality-gates**', async (route) => {
          const request = route.request()
          const url = new URL(request.url())
          if (request.method() !== 'GET') {
            state.writes += 1
            return route.fulfill({ status: 409, body: '{}' })
          }
          const view = url.pathname.endsWith('/governance')
            ? 'governance'
            : url.pathname.endsWith('/gaps')
              ? 'gaps'
              : 'summary'
          if (state.error === view) {
            return route.fulfill({ status: 503, body: '{}' })
          }
          const summary = createQualityGateStyleSummary(state.mode)
          const input = {
            changedFiles: state.empty
              ? []
              : state.unknown
                ? ['unmapped-layout-sample.txt']
                : changedFiles,
            operations: [],
            receipts: {},
            repository: summary.repository,
            root,
          }
          let payload = summary
          if (view === 'governance') {
            payload = buildQualityGateGovernance({
              ...input,
              filter: url.searchParams.get('filter') || 'relevant',
              q: url.searchParams.get('q') || '',
            })
            payload = {
              ...payload,
              rows: payload.rows.map((row, index) =>
                index
                  ? row
                  : {
                      ...row,
                      sources: [
                        ...row.sources,
                        `scripts/${'layout_check/'.repeat(20)}guard.mjs`,
                      ],
                    }
              ),
            }
            if (state.empty) payload = { ...payload, complexity: [] }
          } else if (view === 'gaps') {
            payload = buildQualityGateGapAnalysis({
              ...input,
              range: url.searchParams.get('range') || 'current',
              risk: url.searchParams.get('risk') || 'all',
            })
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
          })
        })
      },
      verify: async (page) => {
        const state = states.get(page)
        const refresh = async () => {
          await page.getByRole('button', { name: /刷新状态/u }).click()
          await page.waitForFunction(
            () =>
              !document.querySelector(
                '.erp-dev-quality-header .ant-btn-loading'
              )
          )
        }
        const inFirstScreen = async (selector) => {
          const box = await page.locator(selector).boundingBox()
          assert(
            box &&
              box.y >= 0 &&
              box.y + box.height <= page.viewportSize().height,
            `${selector} should be fully visible in the first screen: ${JSON.stringify(box)}`
          )
        }
        await expectHeading(page, '质量门禁')
        await page.getByRole('tab', { name: '本地检查', exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '本地检查', exact: true }).getAttribute('aria-selected'), 'true')
        assert.match(await page.locator('[aria-label="执行与报告来源"]').innerText(), /本地开发机/u)
        await page.locator('.erp-dev-quality-operation .ant-alert').waitFor()
        for (const viewport of [
          { width: 1280, height: 720 },
          { width: 1024, height: 768 },
          { width: 1920, height: 1080 },
        ]) {
          await page.setViewportSize(viewport)
          await inFirstScreen('.erp-dev-quality-actions')
          await inFirstScreen('.erp-dev-quality-operation .ant-alert')
          const flow = await page.locator('.erp-dev-quality-flow').boundingBox()
          assert(
            flow.y < viewport.height - 90,
            'diagnostic track must begin in the first screen'
          )
          const summary = await page
            .locator('.erp-dev-quality-context')
            .boundingBox()
          assert(
            summary.height <= 140,
            `status and identity remain compact: ${summary.height}`
          )
          assert.equal(
            await page
              .locator('.erp-dev-quality-status-banner.ant-alert-success')
              .count(),
            0
          )
          assert(
            (await page
              .locator('.erp-dev-quality-operation h2')
              .evaluate((node) =>
                parseFloat(getComputedStyle(node).fontSize)
              )) <= 18
          )
          await assertNoHorizontalOverflow(
            page,
            `quality layout ${viewport.width}`
          )
        }
        await page.setViewportSize({ width: 1280, height: 720 })
        await page.locator('.erp-dev-quality-status-details summary').click()
        await page
          .getByText('尚未证明：干净 exact SHA、目标环境发布、客户 UAT', {
            exact: true,
          })
          .waitFor()
        await page.locator('.erp-dev-quality-status-details summary').click()
        const stages = page.locator('.erp-dev-quality-flow__step')
        assert.equal(await stages.count(), 13)
        await stages.first().locator('summary').click()
        await stages.first().locator('details[open]').waitFor()
        await assertNoHorizontalOverflow(page, 'expanded stage evidence')
        await page.locator('.erp-dev-quality-technical summary').click()
        await page.getByText('工作区指纹', { exact: true }).waitFor()

        await verifySlidingMotion(page, assert, '.erp-dev-quality-tabs', 2)
        await page
          .locator('.erp-dev-quality-governance-view .ant-table-row')
          .first()
          .waitFor()
        await inFirstScreen('.erp-dev-quality-view-tools')
        const toolsBox = await page
          .locator('.erp-dev-quality-view-tools')
          .boundingBox()
        const search = page.getByRole('textbox', { name: '搜索门禁名称或风险' })
        await search.fill('不存在的门禁布局样例')
        await search.press('Enter')
        await page
          .getByText('当前筛选下没有相关门禁', { exact: true })
          .waitFor()
        const emptyBox = await page
          .locator('.erp-dev-quality-view-tools')
          .boundingBox()
        for (const key of ['x', 'y', 'width', 'height']) {
          assert(
            Math.abs(emptyBox[key] - toolsBox[key]) <= 1,
            `empty results must not move tools ${key}`
          )
        }
        await page
          .locator('.erp-dev-quality-empty')
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await page
          .locator('.erp-dev-quality-governance-view .ant-table-row')
          .first()
          .waitFor()
        assert.equal(await search.inputValue(), '')
        await verifySlidingMotion(page, assert, '[aria-label="门禁范围"]', 2)
        await page.waitForURL((url) => url.searchParams.get('filter') === 'all')
        await page.locator('.ant-table-row-expand-icon').first().click()
        await page.getByText('替代或退出条件', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'expanded governance evidence')
        state.empty = true
        await page.getByText('与当前改动有关', { exact: true }).click()
        await page.getByText('当前没有待核对的改动', { exact: true }).waitFor()
        assert.equal(
          await page.locator('.erp-dev-quality-complexity').count(),
          0
        )
        await page
          .getByRole('button', { name: '查看全部门禁', exact: true })
          .click()
        await page
          .locator('.erp-dev-quality-governance-view .ant-table-row')
          .first()
          .waitFor()
        state.error = 'governance'
        await refresh()
        await page.getByText('门禁目录读取失败', { exact: true }).waitFor()
        state.error = ''
        await refresh()
        await page
          .locator('.erp-dev-quality-governance-view .ant-table-row')
          .first()
          .waitFor()
        await verifySlidingMotion(page, assert, '.erp-dev-quality-tabs', 0)
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-quality-workspace-tabs',
          1,
          true
        )
        await page.getByText('当前没有待核对的改动', { exact: true }).waitFor()
        assert.equal(
          await page
            .locator('.erp-dev-quality-gap-empty.ant-alert-warning')
            .count(),
          0
        )
        assert.equal(await page.locator('.erp-dev-quality-gap-flow').count(), 0)
        await inFirstScreen('.erp-dev-quality-gap-empty')
        await page.getByText('已暂存改动', { exact: true }).click()
        await page.getByText('当前没有已暂存改动', { exact: true }).waitFor()
        await page.reload()
        await page.getByText('当前没有已暂存改动', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('range'), 'staged')
        await page.getByRole('tab', { name: '服务器 CI', exact: true }).click()
        await page.getByText('服务器 · GitLab Runner', { exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '改动缺口', exact: true }).isVisible(), false)
        await page.getByRole('tab', { name: '本地检查', exact: true }).click()
        await page.getByText('当前没有已暂存改动', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('range'), 'staged')
        state.empty = false
        state.unknown = true
        await refresh()
        await page.getByText('当前改动没有匹配门禁', { exact: true }).waitFor()
        await page
          .getByRole('link', { name: '核对验证范围', exact: true })
          .waitFor()
        await verifySlidingMotion(page, assert, '[aria-label="风险范围"]', 1)
        await page
          .getByText('当前筛选下没有高风险匹配项', { exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '查看全部风险', exact: true })
          .click()
        state.unknown = false
        await refresh()
        await page
          .getByRole('heading', { name: '风险 × 门禁覆盖矩阵' })
          .waitFor()
        await inFirstScreen('.erp-dev-quality-coverage')
        await page
          .locator('.erp-dev-quality-gap-category summary')
          .first()
          .click()
        await page
          .locator('.erp-dev-quality-gap-category details[open]')
          .waitFor()
        await assertNoHorizontalOverflow(page, 'risk evidence expanded')
        state.error = 'gaps'
        await refresh()
        await page.getByText('改动缺口读取失败', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-dev-quality-coverage').count(), 0)
        state.error = ''
        await refresh()
        await page.locator('.erp-dev-quality-coverage').waitFor()

        state.mode = 'running'
        await verifySlidingMotion(page, assert, '.erp-dev-quality-workspace-tabs', 0)
        await refresh()
        await page.getByRole('button', { name: /取消运行/u }).waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '运行本机严格诊断', exact: true })
            .isEnabled(),
          false
        )
        state.mode = 'idle'
        state.error = 'summary'
        await refresh()
        await page.getByText('质量门禁状态读取失败', { exact: true }).waitFor()
        state.error = ''
        await refresh()
        await page
          .getByRole('heading', { name: '本机严格诊断流程预览', exact: true })
          .waitFor()
        assert.equal(
          await page.getByText('质量门禁状态读取失败', { exact: true }).count(),
          0
        )
        assert.equal(
          state.writes,
          0,
          'layout verification must not run or cancel diagnostics'
        )
      },
    },
  ]
}
