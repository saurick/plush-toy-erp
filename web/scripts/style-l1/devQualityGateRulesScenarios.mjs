import { createQualityGateStyleSummary } from './devQualityGateScenarios.mjs'
import { buildQualityGateGovernance } from '../../../scripts/qa/quality-gate-catalog.mjs'
import { QUALITY_GATE_FLOWS } from '../../src/dev-workbench/config/devQualityGateGuide.mjs'

export function createDevQualityGateRulesScenarios({
  assert,
  assertNoHorizontalOverflow,
}) {
  const states = new WeakMap()
  return [
    {
      name: 'dev-quality-gates-rules-desktop-light',
      path: '/__dev/quality-gates?view=governance&guide=hooks',
      viewport: { width: 1280, height: 800 },
      expectedConsoleErrorPatterns: [
        /console error.*status of 503.*\/__dev\/api\/qa\/quality-gates\/test-directory:0:0$/u,
      ],
      beforeNavigate: async (page) => {
        const state = {
          writes: 0,
          fail: false,
          files: [
            ...['pre-commit', 'commit-msg', 'pre-push'].map((name) => ({
              path: `scripts/git-hooks/${name}.test.mjs`,
              group: 'fast',
              present: true,
            })),
            ...Array.from({ length: 24 }, (_, index) => ({
              path: `web/src/directory-${index}.test.mjs`,
              group: 'web',
              present: true,
            })),
            {
              path: 'scripts/qa/unregistered.test.mjs',
              group: 'unregistered',
              present: true,
            },
            {
              path: 'scripts/qa/missing.test.mjs',
              group: 'fast',
              present: false,
            },
          ],
        }
        states.set(page, state)
        await page.route('**/__dev/api/qa/quality-gates**', async (route) => {
          const request = route.request()
          if (request.method() !== 'GET') {
            state.writes += 1
            return route.fulfill({ status: 405, body: '{}' })
          }
          const url = new URL(request.url())
          if (url.pathname.endsWith('/test-directory')) {
            return route.fulfill({
              status: state.fail ? 503 : 200,
              contentType: 'application/json',
              body: JSON.stringify(
                state.fail
                  ? {}
                  : {
                      kind: 'plush.quality-gate-test-directory',
                      readAt: '2026-11-18T00:00:00Z',
                      missingRoots: [],
                      files: state.files,
                    }
              ),
            })
          }
          const summary = createQualityGateStyleSummary('failed')
          const payload = url.pathname.endsWith('/governance')
            ? buildQualityGateGovernance({
                changedFiles: [],
                operations: [],
                receipts: {},
                repository: summary.repository,
                filter: 'all',
                q: '',
              })
            : summary
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(payload),
          })
        })
      },
      verify: async (page) => {
        const state = states.get(page)
        const rules = page.locator('.erp-dev-quality-guide')
        await page
          .getByRole('heading', { name: 'Hook 入口与调用关系', exact: true })
          .waitFor()
        assert.equal(
          await rules.locator('[data-quality-hook-file]').count(),
          10
        )
        await page.evaluate(() => {
          window.qualityRulesNav = document.querySelector(
            '[aria-label="门禁规则内容"]'
          )
        })
        await rules
          .getByRole('button', {
            name: 'scripts/git-hooks/commit-msg.sh',
            exact: true,
          })
          .click()
        await rules
          .getByText('中文摘要是项目约定，当前正则并不检查摘要语言。', {
            exact: false,
          })
          .waitFor()
        await rules
          .getByRole('button', { name: '进入对应流程', exact: true })
          .click()
        await rules.locator('[data-mermaid-node-id="MSG"]').first().waitFor()
        assert.equal(new URL(page.url()).searchParams.get('guide'), 'flows')
        await rules
          .getByRole('region', { name: '门禁节点说明', exact: true })
          .getByText('提交标题检查', { exact: true })
          .waitFor()
        await rules.locator('[data-mermaid-node-id="FIX"]').first().click()
        await rules
          .getByRole('region', { name: '门禁节点说明', exact: true })
          .getByText('修复并重新暂存', { exact: true })
          .waitFor()
        await rules
          .getByRole('button', { name: '返回 Hook 入口', exact: true })
          .click()
        assert.equal(
          await rules
            .locator(
              '[data-quality-hook-file="scripts/git-hooks/commit-msg.sh"]'
            )
            .getAttribute('aria-pressed'),
          'true'
        )
        state.fail = true
        await rules
          .getByRole('button', {
            name: 'scripts/git-hooks/commit-msg.test.mjs · 定位',
            exact: true,
          })
          .click()
        await rules
          .getByText('测试目录读取失败，暂不能核对该文件。', { exact: true })
          .waitFor()
        state.fail = false
        await rules
          .getByRole('button', { name: '刷新测试目录', exact: true })
          .click()
        await rules
          .getByRole('button', {
            name: 'scripts/git-hooks/commit-msg.test.mjs',
            exact: true,
          })
          .waitFor()
        const search = rules.getByRole('textbox', {
          name: '搜索测试名称或路径',
          exact: true,
        })
        await search.fill('没有这样的测试')
        await search.press('Enter')
        await rules
          .getByText('当前范围没有匹配的测试文件', { exact: true })
          .waitFor()
        await rules
          .getByRole('button', { name: '清除筛选', exact: true })
          .click()
        await rules.getByRole('button', { name: '下一页', exact: true }).click()
        await rules
          .getByText('第 11-20 条 / 共 29 条', { exact: true })
          .waitFor()
        await page.getByRole('tab', { name: 'Hook 入口', exact: true }).click()
        await page.getByRole('tab', { name: '测试结构', exact: true }).click()
        await rules
          .getByText('第 11-20 条 / 共 29 条', { exact: true })
          .waitFor()
        await rules.getByText('已发现文件', { exact: true }).first().waitFor()
        state.fail = true
        await rules
          .getByRole('button', { name: '刷新测试目录', exact: true })
          .click()
        await rules.getByText('测试目录读取失败', { exact: true }).waitFor()
        assert((await rules.getByText('上次读取', { exact: true }).count()) > 0)
        state.fail = false
        state.files = state.files.slice(0, 2)
        await rules
          .getByRole('button', { name: '刷新测试目录', exact: true })
          .click()
        await rules.getByText('第 1-2 条 / 共 2 条', { exact: true }).waitFor()
        assert.equal(
          await page.evaluate(
            () =>
              window.qualityRulesNav ===
              document.querySelector('[aria-label="门禁规则内容"]')
          ),
          true
        )
        await page.reload()
        await page
          .getByRole('heading', { name: '测试结构与文件目录', exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).searchParams.get('guide'), 'tests')
        await assertNoHorizontalOverflow(page, 'quality gate rules directory')
        await page.getByRole('tab', { name: '执行流程', exact: true }).click()
        for (const flow of Object.values(QUALITY_GATE_FLOWS)) {
          const { title } = flow
          await rules
            .getByRole('tablist', { name: '门禁流程专题', exact: true })
            .getByRole('tab', { name: flow.label, exact: true })
            .click()
          await rules
            .locator(
              '.erp-dev-quality-guide__diagram [data-mermaid-status="rendered"]'
            )
            .nth((flow.charts?.length || 1) - 1)
            .waitFor()
          const textSizes = await rules
            .locator('.erp-dev-quality-guide__diagram svg')
            .evaluateAll((elements) =>
              elements
                .filter((svg) => svg.querySelector('.node'))
                .map(
                  (svg) =>
                    (parseFloat(getComputedStyle(svg).fontSize) *
                      svg.getBoundingClientRect().width) /
                    Number(svg.getAttribute('viewBox').split(' ')[2])
                )
            )
          assert(
            textSizes.length > 0 && textSizes.every((size) => size >= 11),
            `${title}: diagram text ${textSizes.join(',')}`
          )
          assert.equal(
            await rules.locator('.erp-markdown-mermaid-error').count(),
            0
          )
          await assertNoHorizontalOverflow(page, title)
        }
        assert.equal(state.writes, 0)
      },
    },
  ]
}
