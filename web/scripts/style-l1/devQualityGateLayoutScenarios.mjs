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
  const scenarios = [
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
          if (view === 'governance') await state.governanceWait
          if (state.error === view) {
            return route.fulfill({ status: 503, body: '{}' })
          }
          const summary = createQualityGateStyleSummary(state.mode)
          if (state.historyCount) {
            summary.operations = Array.from({ length: state.historyCount }, (_, index) => ({
              ...summary.operations[index % summary.operations.length],
              id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
            }))
          }
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
        const verifyRunRecovery = async () => {
          state.mode = 'running'
          await refresh()
          const cancel = page.getByRole('button', { name: /取消运行/u })
          await cancel.waitFor()
          await page.locator('.erp-dev-quality-flow__table').waitFor()
          await page.locator('.erp-dev-quality-operation .ant-progress').waitFor()
          await page.locator('.erp-dev-quality-operation').getByText('预计剩余', { exact: true }).waitFor()
          assert.equal(await page.getByRole('button', { name: '运行本机严格诊断', exact: true }).isEnabled(), false)
          assert.equal(await page.getByRole('combobox', { name: '诊断范围', exact: true }).isEnabled(), false)
          await cancel.click()
          await page.getByRole('button', { name: '继续运行', exact: true }).click()
          await page.getByRole('dialog').waitFor({ state: 'hidden' })
          assert(await cancel.evaluate((node) => document.activeElement === node), '取消确认关闭后恢复原操作焦点')
          state.mode = 'failed'
          await refresh()
          await page.locator('.erp-dev-quality-operation [role="alert"]').waitFor()
          assert.equal(await page.locator('.erp-dev-quality-flow__step').count(), 13)
          assert.equal(await page.locator('.erp-dev-quality-operation .ant-progress').count(), 0)
          assert.equal(await page.locator('.erp-dev-quality-operation').getByText('预计剩余', { exact: true }).count(), 0)
          state.mode = 'idle'
          state.error = 'summary'
          await refresh()
          await page.getByText('质量门禁状态读取失败', { exact: true }).waitFor()
          state.error = ''
          await refresh()
          await page.getByRole('heading', { name: '诊断结果', exact: true }).waitFor()
          assert.equal(await page.locator('.erp-dev-quality-flow__step').count(), 13)
          assert.equal(await page.getByText('质量门禁状态读取失败', { exact: true }).count(), 0)
          assert.equal(state.writes, 0, 'layout verification must not run or cancel diagnostics')
        }
        await expectHeading(page, '质量门禁')
        await page.getByRole('tab', { name: '本地检查', exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '本地检查', exact: true }).getAttribute('aria-selected'), 'true')
        assert.match(await page.locator('[aria-label="执行与报告来源"]').innerText(), /本地开发机/u)
        await page.locator('.erp-dev-quality-operation [role="alert"]').waitFor()
        for (const viewport of [
          { width: 1280, height: 720 },
          { width: 1024, height: 768 },
          { width: 1920, height: 1080 },
        ]) {
          await page.setViewportSize(viewport)
          await inFirstScreen('.erp-dev-quality-actions')
          await inFirstScreen('.erp-dev-quality-operation [role="alert"]')
          const flow = await page.locator('.erp-dev-quality-flow__heading').boundingBox()
          assert(
            flow && flow.y >= 0 && flow.y + flow.height <= viewport.height,
            `stage details remain reachable below the result: ${JSON.stringify(flow)}`
          )
          const summary = await page
            .locator('.erp-dev-quality-context')
            .boundingBox()
          assert(
            summary.height <= 44,
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
          const operationBox = await page.locator('.erp-dev-quality-operation').boundingBox()
          const historyBox = await page.locator('.erp-dev-quality-history').boundingBox()
          if (viewport.width >= 1280) {
            assert(historyBox.x >= operationBox.x + operationBox.width + 8, '历史与当前结果并排，保留清楚的栏间距')
            assert(Math.abs(historyBox.y - operationBox.y) <= 1, '两栏顶端对齐')
          } else {
            assert(historyBox.y >= operationBox.y + operationBox.height, '窄桌面自然转为上下布局')
          }
          const factGeometry = await page.locator('.erp-dev-quality-operation__facts > div').evaluateAll((nodes) => nodes.map((node) => ({
            labelBottom: node.querySelector('dt').getBoundingClientRect().bottom,
            valueTop: node.querySelector('dd').getBoundingClientRect().top,
          })))
          assert(factGeometry.every((item) => item.valueTop >= item.labelBottom - 1), '结果字段标签与值按列对齐')
          await assertNoHorizontalOverflow(
            page,
            `quality layout ${viewport.width}`
          )
        }
        await page.setViewportSize({ width: 1280, height: 720 })
        await page.getByRole('button', { name: '工作区判断依据', exact: true }).click()
        await page.locator('.erp-dev-quality-context-help .erp-workbench-notice__details summary').click()
        await page.getByText('尚未证明：干净 exact SHA、目标环境发布、客户 UAT', { exact: true }).waitFor()
        await page.getByRole('button', { name: '工作区判断依据', exact: true }).click()
        assert.equal(await page.locator('.erp-dev-quality-context .erp-dev-quality-status-banner').count(), 0, '普通工作区状态不占用警告框')
        assert.equal(await page.locator('.erp-dev-quality-operation .ant-progress').count(), 0, '已结束的诊断不显示运行中进度')
        await page.getByText('已完成清理读回', { exact: true }).first().waitFor()
        const stages = page.locator('.erp-dev-quality-flow__step')
        assert.equal(await stages.count(), 13)
        assert.equal(await stages.last().isVisible(), true, '阶段直接展示，不依赖整体展开')
        await stages.first().getByRole('button').click()
        await page.locator('.erp-dev-quality-flow__expanded').waitFor()
        await assertNoHorizontalOverflow(page, 'expanded stage evidence')
        await stages.first().getByRole('button').click()
        await page.getByRole('button', { name: '技术详情', exact: true }).click()
        const technicalDrawer = page.locator('.ant-drawer:visible')
        await technicalDrawer.getByText('工作区指纹', { exact: true }).waitFor()
        await technicalDrawer.locator('.ant-drawer-close').click()
        await technicalDrawer.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '运行说明', exact: true }).click()
        const helpDrawer = page.locator('.ant-drawer:visible')
        await helpDrawer.getByText('静态工作原理，不代表当前运行状态', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'diagnostic scope and database guide')
        await helpDrawer.locator('.ant-drawer-close').click()
        await helpDrawer.waitFor({ state: 'hidden' })

        state.mode = 'history'
        state.historyCount = 12
        await refresh()
        await page.getByText('历史版本，不代表当前工作区', { exact: true }).waitFor()
        const historyRows = page.locator('.erp-dev-quality-history .ant-table-row')
        assert.equal(await historyRows.count(), 5, '默认只显示最近 5 条，分页保留所有记录')
        const firstPageTime = await historyRows.first().locator('time').first().getAttribute('datetime')
        await page.locator('.erp-dev-quality-history .ant-pagination-item-2').click()
        assert.equal(await historyRows.count(), 5)
        assert.notEqual(await historyRows.first().locator('time').first().getAttribute('datetime'), firstPageTime)
        await page.locator('.erp-dev-quality-history .ant-pagination-item-3').click()
        assert.equal(await historyRows.count(), 2)
        await page.locator('.erp-dev-quality-history-analysis > summary').click()
        await page.locator('.erp-dev-quality-history-trend').waitFor()
        await assertNoHorizontalOverflow(page, 'history pagination and trend')
        await page.locator('.erp-dev-quality-history-analysis > summary').click()
        state.historyCount = 0
        state.mode = 'failed'
        await refresh()
        await page.locator('.erp-dev-quality-operation [role="alert"]').waitFor()

        if (state.localOnly) {
          await verifyRunRecovery()
          const profile = page.getByRole('combobox', { name: '诊断范围', exact: true })
          await profile.press('ArrowDown')
          await page.locator('.ant-select-dropdown:visible').getByText('完整诊断', { exact: true }).click()
          await page.getByRole('button', { name: '运行本机完整诊断', exact: true }).waitFor()
          assert.equal(new URL(page.url()).searchParams.get('profile'), 'full')
          await page.reload()
          await page.getByRole('button', { name: '运行本机完整诊断', exact: true }).waitFor()
          await page.locator('.erp-dev-quality-flow__heading').getByText('9 个阶段', { exact: true }).waitFor()
          assert.equal(await page.locator('.erp-dev-quality-flow__step').count(), 9)
          await assertNoHorizontalOverflow(page, 'diagnostic range restored')
          await profile.press('ArrowDown')
          await page.locator('.ant-select-dropdown:visible').getByText('严格诊断', { exact: true }).click()
          await verifySlidingMotion(page, assert, '.erp-dev-quality-workspace-tabs', 1)
          await page.locator('.erp-dev-quality-coverage').waitFor()
          await verifySlidingMotion(page, assert, '.erp-dev-quality-workspace-tabs', 0)
          await page.getByRole('button', { name: '运行本机严格诊断', exact: true }).waitFor()
          state.mode = 'failed'
          await refresh()
          await page.setViewportSize({ width: 1920, height: 1080 })
          return
        }

        await verifySlidingMotion(page, assert, '.erp-dev-quality-tabs', 2)
        await page
          .locator('.erp-dev-quality-governance-view .ant-table-row')
          .first()
          .waitFor()
        await inFirstScreen('.erp-dev-quality-view-tools')
        const toolsBox = await page
          .locator('.erp-dev-quality-view-tools')
          .boundingBox()
        assert(
          toolsBox.height <= 44,
          `directory search and scope should share a row when space is sufficient: ${toolsBox.height}`
        )
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
        await page.getByText('调整条件', { exact: true }).waitFor()
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
        let releaseGovernance
        state.governanceWait = new Promise((resolve) => { releaseGovernance = resolve })
        await page.getByRole('button', { name: /刷新状态/u }).click()
        await page.getByText('正在刷新；以下为上次读取的门禁目录。', { exact: true }).waitFor()
        assert(await page.locator('.erp-dev-quality-governance-view .ant-table-row').count() > 0)
        state.governanceWait = null
        await page.getByText('与当前改动有关', { exact: true }).click()
        await page.getByText('当前筛选下没有相关门禁', { exact: true }).waitFor()
        releaseGovernance()
        await page.waitForTimeout(100)
        assert.equal(await page.locator('.erp-dev-quality-governance-view .ant-table-row').count(), 0, '迟到的全部门禁结果不能覆盖已切换的相关范围')
        await page.getByRole('button', { name: '查看全部门禁', exact: true }).click()
        await page.locator('.erp-dev-quality-governance-view .ant-table-row').first().waitFor()
        state.error = 'governance'
        await refresh()
        await page.getByText('门禁目录读取失败', { exact: true }).waitFor()
        assert(await page.locator('.erp-dev-quality-governance-view .ant-table-row').count() > 0, '刷新失败保留当前筛选的上次门禁目录')
        await page.getByText('上次读取 · 待核对', { exact: true }).first().waitFor()
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
            .locator('.erp-dev-quality-gap-empty[data-tone="warning"]')
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
        await page.getByText('未知改动需要人工核对验证范围，必要时运行完整门禁。', { exact: true }).waitFor()
        assert.equal(await page.getByRole('link', { name: '核对验证范围', exact: true }).count(), 0, '未知改动保留范围核对说明，不重复提供跨页入口')
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
        assert.equal(await page.locator('.erp-dev-quality-coverage').count(), 1, '刷新失败保留已有矩阵，不能把缺少新数据当成没有缺口')
        state.error = ''
        await refresh()
        await page.locator('.erp-dev-quality-coverage').waitFor()

        await verifySlidingMotion(page, assert, '.erp-dev-quality-workspace-tabs', 0)
        await verifyRunRecovery()
      },
    },
  ]
  return [
    ...scenarios,
    {
      ...scenarios[0],
      name: 'dev-quality-gates-local-diagnostics-desktop-light',
      deviceScaleFactor: 2,
      expectedConsoleErrorPatterns: [
        /console error.*status of 503.*\/__dev\/api\/qa\/quality-gates:0:0$/u,
      ],
      verify: async (page) => {
        states.get(page).localOnly = true
        await scenarios[0].verify(page)
      },
    },
    {
      ...scenarios[0],
      name: 'dev-workbench-content-desktop-light',
      path: '/__dev/quality-gates?view=governance&filter=all',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      expectedConsoleErrorPatterns: [],
      verify: async (page) => {
        const view = page.locator('.erp-dev-quality-governance-view')
        await view.locator('.ant-table-row').first().waitFor()
        await view.locator('.ant-table-row-expand-icon').first().click()
        const detail = view.locator('.ant-table-expanded-row')
        await detail.waitFor()
        assert.equal(await detail.locator('[data-source-reference]').count(), 0)
        for (const label of ['适用范围', '失败影响', '与其他门禁关系', '调整条件']) await detail.getByText(label, { exact: true }).waitFor()
        assert(!/Stable key|正式执行入口引用|唯一验证记录/u.test(await detail.innerText()))
        for (const width of [1024, 1280, 1920]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page, '门禁规则摘要')
        }
        assert.equal(states.get(page).writes, 0)
      },
    },
  ]
}
