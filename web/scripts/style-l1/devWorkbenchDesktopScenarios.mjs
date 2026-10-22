import { installIntegrationWorkspaceMock, verifyIntegrationWorkspace, verifyProjectGraphDirectory } from './devProjectGraphAssertions.mjs'
import { DEV_HUB_ITEMS } from '../../src/dev-workbench/config/devHub.mjs'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { assertMermaidFits, fitMermaidDiagram, switchMermaidLayout, verifyMermaidViewer, verifyMermaidDarkTheme, waitForMermaidFit } from './mermaidViewerAssertions.mjs'
import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_INTEGRATION_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_DEVELOPMENT_RESOURCES_ROUTE,
  DEV_PRODUCT_CORE_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_SECONDARY_NAV_ITEMS,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { assertDevDocsDirectorySpace, createDevDocsReadingFixture, verifyDevDocsReadingNavigation } from './devDocsLayoutAssertions.mjs'

const SPECIALIZED_ROUTES = new Set([
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
])

const DESKTOP_HEADING_BY_ROUTE = Object.freeze({
  '/__dev': '总览',
  [DEV_TESTING_ROUTE]: '测试执行',
  [DEV_DATA_PREPARATION_ROUTE]: '测试数据',
})

const ORDINARY_DEV_ROUTES = Object.freeze(
  [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]
    .filter((item) => !SPECIALIZED_ROUTES.has(item.route))
    .map((item) => {
      return Object.freeze({
        key: item.key,
        route: item.route,
        expectedRoute: item.route,
        title:
          DESKTOP_HEADING_BY_ROUTE[item.route] ||
          DEV_PAGE_TITLE_BY_ROUTE[item.route] ||
          item.label,
      })
    })
)

export function createDevWorkbenchDesktopScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  return ORDINARY_DEV_ROUTES.map((item) => ({
    name: `dev-page-${item.key}-desktop-light`,
    path: item.route,
    ...(item.route === DEV_PERMISSION_RELATIONSHIPS_ROUTE
      ? { beforeNavigate: installPermissionRelationshipMock }
      : item.route === DEV_INTEGRATION_ROUTE
        ? { beforeNavigate: installIntegrationWorkspaceMock }
        : {}),
    viewport: { width: 1440, height: 900 },
    ...(item.route === DEV_TESTING_ROUTE
      ? {
          expectedConsoleErrorPatterns: [
            /console error.*net::ERR_FAILED.*\/__dev\/api\/qa\/coverage/u,
          ],
        }
      : item.route === DEV_INTEGRATION_ROUTE
        ? { expectedConsoleErrorPatterns: [/console error.*status of 500.*\/__dev\/api\/qa\/quality-gates\/rpc-contract-review\?range=worktree/u] }
      : {}),
    verify: async (page) => {
      await expectHeading(page, item.title)
      const root = page.locator('.erp-dev-workspace-page')
      await root.waitFor({ state: 'visible', timeout: 10_000 })
      assert.equal(
        await root.count(),
        1,
        `${item.route} 应只有一个工作台页面根节点`
      )
      assert.equal(
        new URL(page.url()).pathname.replace(/\/+$/u, '') || '/',
        item.expectedRoute.replace(/\/+$/u, '') || '/',
        `${item.route} 桌面 smoke 必须落到登记页面`
      )
      if (item.route === '/__dev') {
        const nav = page.locator('.erp-dev-workspace-nav')
        for (const entry of DEV_SECONDARY_NAV_ITEMS.filter(
          (entry) => entry.showInNavigation !== false
        )) {
          assert.equal(
            await nav.locator(`a[href="${entry.route}"]`).count(),
            1,
            `${entry.label} 应可直接进入`
          )
        }
        const search = page.getByRole('textbox', { name: '搜索全部开发工具' })
        await search.fill('质量门禁 / Quality Gates')
        await page
          .locator('table[aria-label="全部开发工具"] tbody tr')
          .first()
          .waitFor()
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              'table[aria-label="全部开发工具"] tbody tr'
            ).length === 1
        )
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          1
        )
        await page
          .getByRole('button', { name: '置顶质量门禁', exact: true })
          .click()
        await page.reload()
        await search.waitFor()
        assert.equal(await search.inputValue(), '质量门禁 / Quality Gates')
        assert.equal(
          await page
            .getByRole('button', { name: '取消置顶质量门禁', exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        await page
          .getByRole('button', { name: '清除筛选', exact: true })
          .click()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-overview-view-tabs',
          1
        )
        assert.equal(
          await page
            .locator('table[aria-label="常用开发工具"] tbody tr')
            .count(),
          1
        )
        await page
          .getByRole('button', { name: '取消置顶质量门禁', exact: true })
          .click()
        await page
          .getByText('还没有常用工具，在全部工具中点击图钉即可添加。')
          .waitFor()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-overview-view-tabs',
          2,
          true
        )
        await page.getByRole('table', { name: '开发工具使用指南' }).waitFor()
        await page
          .getByRole('table', { name: '开发工具使用指南' })
          .getByRole('link', { name: '查阅改动规则', exact: true })
          .click()
        await page.waitForURL(
          (url) =>
            url.pathname === DEV_DOCS_ROUTE &&
            url.searchParams.get('path') === 'docs/项目治理地图.md'
        )
        const governanceHeading = page
          .locator('.erp-dev-docs-reader')
          .getByRole('heading', {
            name: '项目治理地图 / Project Governance Map',
            exact: true,
          })
        await governanceHeading.waitFor()
        await assertNoHorizontalOverflow(page, DEV_DOCS_ROUTE)
        await page.reload()
        await governanceHeading.waitFor()
        await page.goBack()
        await page.getByRole('table', { name: '开发工具使用指南' }).waitFor()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-overview-view-tabs',
          0
        )
        await search.fill('不存在的工具名称')
        await page.getByText('没有匹配的工具', { exact: true }).waitFor()
        await page
          .getByRole('button', { name: '清除筛选', exact: true })
          .first()
          .click()
        await page
          .getByRole('button', { name: '查看质量门禁来源与边界', exact: true })
          .click()
        await page
          .locator('.ant-popover-inner')
          .getByText('质量门禁 · 来源与边界', { exact: true })
          .waitFor()
        await page
          .getByRole('button', { name: '查看质量门禁来源与边界', exact: true })
          .press('Escape')
        await page.locator('.ant-popover-inner').waitFor({ state: 'hidden' })
        await page
          .locator('.erp-dev-overview-library__toolbar .ant-select-selector')
          .click()
        await page.locator('.ant-select-dropdown [title="测试验证"]').click()
        assert.equal(new URL(page.url()).searchParams.get('group'), 'quality')
        const qualityToolCount = DEV_HUB_ITEMS.filter((tool) => tool.areaKey === 'quality').length
        await page.waitForFunction(
          (expected) =>
            document.querySelectorAll(
              'table[aria-label="全部开发工具"] tbody tr'
            ).length === expected,
          qualityToolCount
        )
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          qualityToolCount
        )
        await page.reload()
        await page
          .locator('table[aria-label="全部开发工具"] tbody tr')
          .first()
          .waitFor()
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          qualityToolCount
        )
        await page
          .getByRole('table', { name: '全部开发工具' })
          .getByRole('link', { name: '质量门禁', exact: true })
          .click()
        await page.waitForURL('**/__dev/quality-gates')
        await page.goBack()
        await page.getByRole('table', { name: '全部开发工具' }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('group'), 'quality')
        assert.equal(
          await page
            .getByRole('table', { name: '全部开发工具' })
            .locator('tbody tr')
            .count(),
          qualityToolCount
        )
      }
      if (item.route === '/__dev/business-chain-audit') {
        const batch = 'ui-controls-fixture'
        let batches = []
        const chains = ['采购', '出货'].map((label, index) => ({
          key: `fixture_${index}`,
          label: `${label}测试链`,
          summary: `${label}模拟读回`,
          status: 'failed',
          stepCount: 1,
          scenarios: [],
          evidence: [],
          steps: [{
            key: `step_${index}`,
            number: 1,
            label: `${label}步骤`,
            responsibleRole: '测试岗位',
            status: 'failed',
            level: '页面夹具',
            observed: '测试未通过',
            fromLabel: '准备',
            toLabel: '读回',
            preconditions: [],
            actions: [],
            results: [],
            facts: [],
          }],
        }))
        const data = {
          batch,
          files: [],
          freshness: 'historical',
          definitionComparison: { status: 'unverified', chains: [] },
          currentRepository: { commit: 'b'.repeat(40), dirty: true },
          report: {
            generatedAt: '2026-10-22T03:00:00Z',
            verdict: '模拟失败用于验证筛选',
            scope: {
              sourceCommit: 'a'.repeat(40), customer: 'demo', data: '页面夹具',
              mode: 'fixture', terminal: '读回', notIncluded: ['真实业务'],
              chainCount: 2, stepCount: 2, registeredScenarioCount: 0,
            },
            metrics: { stepStates: { failed: 2 } },
            chains,
            lineage: [],
            findings: [],
            coverageLimits: ['仅证明页面操作'],
          },
        }
        await page.route('**/__dev/api/qa/business-chain-audit**', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            new URL(route.request().url()).pathname.endsWith('/report') ? data : { batches }
          ),
        }))
        await page.reload()
        await page.getByText('尚无链路实跑报告。将完整批次及证据清单放入本地报告目录后重新读取。', { exact: true }).waitFor()
        assert.equal(await page.getByRole('combobox', { name: '实跑批次' }).count(), 0)
        assert.equal(await page.getByRole('tab', { name: '链路结果', exact: true }).count(), 0)
        batches = [{ id: batch, status: 'valid' }]
        await page.getByRole('button', { name: '重新读取', exact: true }).click()
        await page.getByRole('heading', { name: '本批次链路与结果', exact: true }).waitFor()
        assert.equal(await page.getByRole('combobox', { name: '实跑批次' }).count(), 0, '只有一个批次时无需选择')
        assert.equal(await page.getByRole('combobox', { name: '筛选链路' }).count(), 0)
        await page.getByRole('button', { name: '采购测试链', exact: true }).click()
        await page.getByRole('cell', { name: '采购步骤', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('chain'), 'fixture_0')
        const stepTable = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: '实际操作与读回', exact: true }) })
        await stepTable.getByText('1. 出货步骤', { exact: true }).waitFor({ state: 'hidden' })
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 1)
        await page.reload()
        await page.getByRole('button', { name: '全部链路', exact: true }).click()
        await stepTable.getByText('1. 出货步骤', { exact: true }).waitFor()
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 2)
        await page.setViewportSize({ width: 1100, height: 800 })
        await assertNoHorizontalOverflow(page, '链路唯一选择入口与窄窗口')
      }
      if (item.route === DEV_TESTING_ROUTE) {
        const primaryNav = page.locator('.erp-dev-testing-primary-nav')
        const validation = page.getByRole('region', { name: '本轮验证固定动作' })
        await validation.waitFor()
        assert.equal(await validation.getByRole('row').count(), 5)
        assert.equal(await validation.getByRole('columnheader').count(), 3)
        const fieldTrigger = validation.getByRole('button', { name: '查看字段联动专项详情', exact: true })
        const fieldDetails = validation.locator('#testing-action-field-linkage-details')
        assert.equal(await fieldTrigger.getAttribute('aria-expanded'), 'false')
        await fieldTrigger.click()
        await fieldDetails.getByText('字段来源、覆盖、清空、回显与打印。', { exact: true }).waitFor()
        await fieldDetails.getByText('不连接数据库、不启动真实业务浏览器，也不代替端到端验收。', { exact: true }).waitFor()
        const detailCell = await fieldDetails.locator('..').boundingBox()
        const actionTable = await validation.getByRole('table').boundingBox()
        assert(detailCell.width > actionTable.width * 0.95, '检查详情应使用整行宽度，避免挤在名称列')
        await fieldTrigger.click()
        assert.equal(await page.locator('.erp-dev-testing-disclosure').count(), 0, '默认执行页不堆放教程折叠区')
        await verifySlidingMotion(page, assert, '.erp-dev-testing-primary-nav > .erp-sliding-tab-list', 3)
        await verifySlidingMotion(page, assert, '.erp-dev-testing-primary-nav > .erp-sliding-tab-list', 0, true)
        await primaryNav.getByRole('tab', { name: '使用指引', exact: true }).click()
        const guideNav = page.getByRole('tablist', { name: '测试指引主题' })
        await guideNav.getByRole('tab', { name: '真机回归', exact: true }).click()
        await page.getByRole('table', { name: '真机回归场景范围', exact: true }).waitFor()
        assert.equal(await page.getByRole('table', { name: '自动化测试方式', exact: true }).count(), 0)
        await page.reload()
        await guideNav.getByRole('tab', { name: '真机回归', exact: true, selected: true }).waitFor()
        await guideNav.getByRole('tab', { name: '常用命令', exact: true }).click()
        await page.locator('.erp-dev-testing-presets article').first().waitFor()
        const totalPresets = await page.locator('.erp-dev-testing-presets article').count()
        const presetSearch = page.getByPlaceholder('搜索常用检查')
        await presetSearch.fill('没有这种检查xyz')
        await page.getByText('没有匹配的常用检查', { exact: true }).waitFor()
        await presetSearch.fill('字段')
        await page.getByText('没有匹配的常用检查', { exact: true }).waitFor({ state: 'hidden' })
        const presets = page.locator('.erp-dev-testing-presets')
        assert((await presets.locator('article').count()) > 0)
        assert((await presets.locator('article').count()) < totalPresets)
        await presets.locator('summary').first().click()
        await presets.locator('pre').first().waitFor({ state: 'visible' })
        await assertNoHorizontalOverflow(page, '测试使用指引与命令详情')
        await presetSearch.fill('')
        await primaryNav.getByRole('tab', { name: '本轮验证', exact: true }).click()
        const counts = {
          status: 'passed',
          total: 1,
          executed: 1,
          passed: 1,
          failed: 0,
          skipped: 0,
        }
        const snapshot = {
          schemaVersion: 'plush-test-coverage-report/v1',
          generatedAt: '2026-10-02T11:58:22.496Z',
          snapshot: { kind: 'isolated' },
          repository: {
            commit: 'a'.repeat(40),
            fingerprint: 'b'.repeat(64),
            dirty: true,
          },
          codeCoverage: {
            go: {
              status: 'failed',
              metrics: { statements: { percent: 14.83 } },
              testExecution: { total: 3, executed: 3, passed: 2, failed: 1 },
              scenarios: [
                {
                  id: 'config-failure',
                  label: '配置加载失败',
                  status: 'failed',
                  note: '文件监听资源不足',
                  matchedTests: ['TestConfig/dev'],
                },
              ],
            },
          },
          businessCoverage: {
            ...counts,
            domains: [
              {
                ...counts,
                key: 'source-documents',
                label: '业务来源',
                scenarios: [
                  {
                    id: 'material-rounding',
                    label: '生产量、损耗与材料归并后取整',
                    status: 'passed',
                    package: 'server/internal/data',
                    matchedTests: [
                      `TestMaterialCalculation/long_source_name_${'x'.repeat(100)}`,
                    ],
                  },
                ],
              },
              {
                ...counts,
                key: 'procurement',
                label: '采购',
                status: 'failed',
                passed: 0,
                failed: 1,
                scenarios: [
                  {
                    id: 'supplier-grouping',
                    label: '按供应商生成采购结果',
                    status: 'failed',
                    matchedTests: ['TestPurchaseGeneration/supplier_grouping'],
                  },
                ],
              },
            ],
          },
          gates: [{ key: 'T5', label: '页面与浏览器', ...counts }],
          acceptance: {
            postgres: { ...counts, note: '真实 PostgreSQL 专项' },
            browser: { ...counts, note: 'RPC 夹具只证明页面协作' },
          },
        }
        let snapshotStatus = 'snapshot'
        let workspaceStatus = 'missing'
        let postponeSnapshot = false
        let postponedResponse = null
        let markPostponedReady = () => {}
        let workspaceReads = 0
        let snapshotReads = 0
        const reply = (route, body) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
          })
        await page.route('**/__dev/api/qa/coverage', (route) => {
          workspaceReads += 1
          return workspaceStatus === 'network-error'
            ? route.abort('failed')
            : reply(route, {
                status: workspaceStatus,
                message: '当前工作区尚未采集',
              })
        })
        await page.route('**/__dev/api/qa/coverage/snapshot', (route) => {
          snapshotReads += 1
          if (postponeSnapshot) {
            return new Promise((resolve) => {
              postponedResponse = { route, resolve }
              markPostponedReady()
            })
          }
          return reply(
            route,
            snapshotStatus === 'snapshot'
              ? { status: 'snapshot', report: snapshot }
              : { status: snapshotStatus, message: '隔离验证暂不可用' }
          )
        })
        await page
          .locator('.erp-dev-testing-primary-nav')
          .getByText('证据与覆盖', { exact: true })
          .click()
        const coverage = page.locator('.erp-dev-testing-coverage-view')
        await coverage
          .getByText('当前工作区尚未验证', { exact: true })
          .waitFor({ state: 'visible' })
        assert.equal(
          await coverage.locator('.erp-dev-testing-coverage-card').count(),
          0,
          '当前报告缺失时不能自动展示历史失败',
        )
        const source = coverage.locator('.erp-dev-testing-coverage-source')
        await source.getByText('历史隔离验证', { exact: true }).click()
        await coverage
          .getByText('正在查看历史隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        await coverage
          .getByText('文件监听资源不足', { exact: true })
          .waitFor({ state: 'visible' })
        assert((await coverage.innerText()).includes('14.8%'))
        const evidenceTabs = coverage.getByRole('tablist', {
          name: '覆盖证据类型',
        })
        const evidenceTab = (label) => evidenceTabs.getByRole('tab', {
          name: new RegExp(`^${label}`, 'u'),
        })
        const labels = ['代码覆盖', '业务场景', '关键规则', '验证门禁', '运行与验收']
        assert.equal(await evidenceTabs.getByRole('tab').count(), labels.length)
        for (const label of labels) assert.equal(await evidenceTab(label).count(), 1)
        assert.match(await evidenceTab('代码覆盖').innerText(), /失败/u)
        assert.match(await evidenceTab('业务场景').innerText(), /失败/u)
        assert.match(await evidenceTab('运行与验收').innerText(), /部分覆盖/u)
        const switchEvidence = async (label, reduced = false) => {
          const text = await evidenceTabs.getByRole('tab').allTextContents()
          const index = text.findIndex((value) => value.trim().startsWith(label))
          assert(index >= 0, `缺少证据页签：${label}`)
          await verifySlidingMotion(page, assert, '.erp-dev-testing-coverage-tabs', index, reduced)
          assert.equal(await evidenceTab(label).getAttribute('aria-selected'), 'true')
        }
        assert.equal(
          await coverage.locator('.erp-dev-testing-coverage-section').count(),
          1
        )
        const initialBox = await source.boundingBox()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-testing-coverage-source',
          0
        )
        await coverage
          .getByText('当前工作区尚未验证', { exact: true })
          .waitFor({ state: 'visible' })
        assert.equal(
          await coverage.locator('.erp-dev-testing-coverage-card').count(),
          0
        )
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-testing-coverage-source',
          1,
          true
        )
        const reportDetails = coverage.locator('.erp-dev-testing-coverage-report-details')
        await reportDetails.locator('summary').click()
        await reportDetails.locator('.erp-dev-testing-coverage-identity').waitFor({ state: 'visible' })
        assert.match(await reportDetails.innerText(), /历史隔离验证/u)
        await reportDetails.getByText(snapshot.repository.fingerprint, { exact: true }).waitFor()
        await reportDetails.locator('summary').click()
        const readsBeforeTabs = { workspaceReads, snapshotReads }
        await switchEvidence('业务场景')
        assert.equal(
          new URL(page.url()).searchParams.get('coverage'),
          'business'
        )
        const domainTable = coverage.getByRole('table', {
          name: '业务域覆盖总览',
        })
        assert.equal(await domainTable.locator('tbody tr').count(), 2)
        assert.match(
          await domainTable.locator('tbody tr').nth(1).innerText(),
          /失败/
        )
        await coverage
          .getByRole('button', {
            name: '查看 业务来源 场景与证据',
            exact: true,
          })
          .click()
        const business = coverage
          .locator('.erp-dev-testing-coverage-card')
          .filter({ hasText: '业务来源' })
        assert.equal(await business.locator('.erp-dev-testing-coverage-scenarios > summary').count(), 0, '选中业务域后直接显示场景，避免二次展开')
        await business.getByRole('checkbox', { name: '仅看未通过场景' }).check()
        await business
          .getByText('没有未通过场景。', { exact: true })
          .waitFor({ state: 'visible' })
        await business
          .getByRole('checkbox', { name: '仅看未通过场景' })
          .uncheck()
        await business.getByText('1 条记录', { exact: true }).click()
        await business
          .getByText(
            `TestMaterialCalculation/long_source_name_${'x'.repeat(100)}`,
            { exact: true }
          )
          .waitFor({ state: 'visible' })
        await assertNoHorizontalOverflow(page, '覆盖报告长场景名')
        await switchEvidence('关键规则', true)
        await coverage.getByRole('region', { name: '关键规则与发布门禁', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('coverage'), 'rules')
        await switchEvidence('验证门禁', true)
        await coverage
          .getByRole('region', { name: '验证门禁', exact: true })
          .waitFor()
        await switchEvidence('运行与验收')
        assert((await coverage.innerText()).includes('RPC 夹具只证明页面协作'))
        await page.goBack()
        await coverage
          .getByRole('region', { name: '验证门禁', exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).searchParams.get('coverage'), 'gates')
        await page.goForward()
        await coverage
          .getByRole('region', { name: '运行与验收', exact: true })
          .waitFor()
        await evidenceTab('运行与验收').press('Home')
        await coverage.getByText('文件监听资源不足', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.has('coverage'), false)
        await evidenceTab('代码覆盖').press('ArrowRight')
        await business.waitFor()
        assert.deepEqual(
          { workspaceReads, snapshotReads },
          readsBeforeTabs,
          '切换证据类型和前进后退不得重复请求覆盖报告'
        )
        await coverage
          .getByRole('button', { name: '返回业务域总览', exact: true })
          .click()
        await domainTable.waitFor()
        await page.reload()
        await coverage.getByText('当前工作区尚未验证', { exact: true }).waitFor()
        await source.getByText('历史隔离验证', { exact: true }).click()
        await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
        await domainTable.waitFor()
        assert.equal(
          new URL(page.url()).searchParams.get('coverage'),
          'business'
        )
        assert.equal(await coverage.getByRole('combobox', { name: '查看业务域' }).count(), 0)
        await domainTable.getByRole('button', { name: '查看 采购 场景与证据', exact: true }).click()
        const procurement = coverage
          .locator('.erp-dev-testing-coverage-card')
          .filter({ hasText: '采购' })
        await procurement.getByRole('checkbox', { name: '仅看未通过场景' }).waitFor()
        await coverage
          .getByText('按供应商生成采购结果', { exact: true })
          .waitFor()
        await evidenceTab('业务场景').press('End')
        await coverage
          .getByRole('region', { name: '运行与验收', exact: true })
          .waitFor()
        await assertNoHorizontalOverflow(page, '覆盖证据五类标签与业务域详情')
        const finalBox = await source.boundingBox()
        assert(
          Math.abs(initialBox.x - finalBox.x) < 1 &&
            Math.abs(initialBox.width - finalBox.width) < 1,
          '来源切换控件必须保持挂载与稳定几何'
        )
        snapshotStatus = 'failed'
        await coverage
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await coverage
          .getByText('覆盖报告读取失败', { exact: true })
          .waitFor({ state: 'visible' })
        snapshotStatus = 'snapshot'
        await coverage
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await coverage
          .getByText('正在查看历史隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        snapshotStatus = 'missing'
        await coverage.getByRole('button', { name: '重新读取', exact: true }).click()
        await coverage.getByText('尚未归档隔离验证', { exact: true }).waitFor()
        assert.equal(await coverage.getByText('当前工作区尚未验证', { exact: true }).count(), 0)
        snapshotStatus = 'snapshot'
        await coverage.getByRole('button', { name: '重新读取', exact: true }).click()
        await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
        workspaceStatus = 'network-error'
        await Promise.all([
          page.waitForResponse((response) =>
            response.url().endsWith('/__dev/api/qa/coverage/snapshot')
          ),
          coverage
            .getByRole('button', { name: '重新读取', exact: true })
            .click(),
        ])
        await coverage
          .getByText('正在查看历史隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        await source.getByText('当前工作区', { exact: true }).click()
        await coverage
          .getByText('覆盖报告读取失败', { exact: true })
          .waitFor({ state: 'visible' })
        workspaceStatus = 'missing'
        await coverage
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await coverage
          .getByText('当前工作区尚未验证', { exact: true })
          .waitFor({ state: 'visible' })
        await source.getByText('历史隔离验证', { exact: true }).click()
        await coverage
          .getByText('正在查看历史隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        const postponedReady = new Promise((resolve) => {
          markPostponedReady = resolve
        })
        postponeSnapshot = true
        await coverage
          .getByRole('button', { name: '重新读取', exact: true })
          .click()
        await postponedReady
        const mainViews = page.locator('.erp-dev-testing-primary-nav')
        await mainViews.getByText('本轮验证', { exact: true }).click()
        await page
          .locator('.erp-dev-testing-validation')
          .waitFor({ state: 'visible' })
        postponeSnapshot = false
        await mainViews.getByText('证据与覆盖', { exact: true }).click()
        await coverage.getByText('当前工作区尚未验证', { exact: true }).waitFor()
        await source.getByText('历史隔离验证', { exact: true }).click()
        await coverage
          .getByText('正在查看历史隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        await reply(postponedResponse.route, {
          status: 'failed',
          message: '过期的失败回复',
        })
        postponedResponse.resolve()
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            })
        )
        assert.equal(
          await coverage.getByText('覆盖报告读取失败', { exact: true }).count(),
          0,
          '迟到的旧报告不得覆盖新读取'
        )
        await coverage
          .getByText('正在查看历史隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        await mainViews.getByText('使用指引', { exact: true }).click()
        await page.getByRole('tab', { name: '常用命令', exact: true }).click()
        await page
          .getByRole('button', { name: '查专项命令', exact: true })
          .click()
        const commandList = page.locator('.erp-dev-testing-command-list')
        const commands = commandList.locator('.erp-dev-testing-command-block')
        const commandPager = page.getByRole('navigation', {
          name: '专项检查命令分页',
        })
        await commands.first().waitFor()
        assert.equal(await commands.count(), 10, '命令清单每页最多展示十项')
        const firstPageCommand = await commands.first().textContent()
        await commandPager.locator('[title="2"]').click()
        await commandPager.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
        assert.equal(new URL(page.url()).searchParams.get('commandsPage'), '2')
        const secondPageCommand = await commands.first().textContent()
        assert.notEqual(secondPageCommand, firstPageCommand)
        await page.reload()
        await commands.first().waitFor()
        await commandPager.locator('.ant-pagination-item-2.ant-pagination-item-active').waitFor()
        assert.equal(await commands.first().textContent(), secondPageCommand)
        await page.goBack()
        await page.waitForFunction(
          () => !new URL(location.href).searchParams.has('commandsPage')
        )
        await commandPager.locator('.ant-pagination-item-1.ant-pagination-item-active').waitFor()
        assert.equal(await commands.first().textContent(), firstPageCommand)
        await page.goForward()
        await page.waitForFunction(
          () => new URL(location.href).searchParams.get('commandsPage') === '2'
        )
        await page
          .getByRole('button', { name: '工程说明', exact: true })
          .click()
        assert.equal(
          new URL(page.url()).searchParams.has('commandsPage'),
          false
        )
        assert((await commands.count()) <= 10)
        const commandSearch = page.locator('.erp-dev-testing-search input')
        await commandSearch.fill('没有这条专项命令')
        await page
          .getByText('当前筛选没有命令块 / No command blocks', { exact: true })
          .waitFor()
        await commandSearch.fill('')
        await commands.first().waitFor()
        await assertNoHorizontalOverflow(page, '专项检查命令分页与空结果恢复')
      }
      if (item.route === DEV_DOCS_ROUTE) {
        await assertDevDocsDirectorySpace(page, assert)
        await page.setViewportSize({ width: 1024, height: 800 })
        await assertDevDocsDirectorySpace(page, assert)
        await assertNoHorizontalOverflow(page, '文档检索页头窄窗口')
        await page.setViewportSize({ width: 1440, height: 900 })
        await assertDevDocsDirectorySpace(page, assert)
        await verifySlidingMotion(page, assert, '[aria-label="项目文档搜索范围"]', 1)
        await verifySlidingMotion(page, assert, '[aria-label="项目文档搜索范围"]', 0, true)
        const selector = '[aria-label="项目文档层级"]'
        const selectedLifecycle = page.locator(
          `${selector} .erp-segmented-item-selected`
        )
        for (const target of [1, 2, 0, 2, 1, 0]) {
          await verifySlidingMotion(page, assert, selector, target)
        }
        await page.goBack()
        await selectedLifecycle.filter({ hasText: /^评审与参考$/u }).waitFor()
        assert.equal(await selectedLifecycle.innerText(), '评审与参考')
        await page.goForward()
        await selectedLifecycle.filter({ hasText: /^当前$/u }).waitFor()
        assert.equal(await selectedLifecycle.innerText(), '当前')
        await page.reload()
        await page.locator(`${selector} [data-sliding-ready="true"]`).waitFor()
        assert.equal(await selectedLifecycle.innerText(), '当前')
        const search = page.getByRole('textbox', { name: '搜索项目文档' })
        await search.fill('不存在的文档检索内容 navigation-no-result')
        await page
          .getByText('没有匹配的文档，阅读操作已隐藏', { exact: true })
          .waitFor()
        await verifySlidingMotion(page, assert, selector, 1)
        assert.equal(await search.inputValue(), '', '切换层级清除当前搜索')
        await verifySlidingMotion(page, assert, selector, 0)
        const source = 'docs/engineering/跨层公共契约与生成规范.md'
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.goto(
          new URL(
            `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(source)}`,
            page.url()
          ).href
        )
        const diagrams = page.locator(
          '.erp-dev-docs-markdown .erp-markdown-mermaid'
        )
        await verifyMermaidViewer(page, diagrams.first(), assert)
        await verifyMermaidDarkTheme(page, diagrams.first(), assert)
        // The second diagram is much taller; its preview stays bounded without losing content.
        const tallViewport = diagrams
          .nth(1)
          .locator('.erp-markdown-mermaid__viewport')
        await tallViewport.waitFor()
        assert((await tallViewport.boundingBox()).height <= 520)
        await waitForMermaidFit(page, diagrams.nth(1))
        await assertMermaidFits(diagrams.nth(1), assert)
        await switchMermaidLayout(page, diagrams.nth(1), assert)
        await switchMermaidLayout(page, diagrams.nth(1), assert)
        await fitMermaidDiagram(diagrams.nth(1), assert)
        await page.setViewportSize({ width: 1440, height: 900 })
        assert(
          await diagrams
            .first()
            .locator('.erp-markdown-mermaid__viewport')
            .evaluate((node) => node.scrollWidth <= node.clientWidth + 2)
        )
      }
      if (item.route === DEV_DOCS_ROUTE) {
        const keyword = '仅在未打开归档正文中的检索探针'
        await page.route('**/docs/archive/progress-2026-10-10-before-task-governance.md*', (route) => route.fulfill({
          contentType: 'application/javascript',
          body: `export default ${JSON.stringify(createDevDocsReadingFixture(keyword))}`,
        }))
        await page.locator('[aria-label="项目文档层级"]').getByText('历史', { exact: true }).click()
        await page.getByRole('textbox', { name: '搜索项目文档' }).fill(keyword)
        await page.getByText('归档全文检索探针', { exact: true }).waitFor()
        assert.equal(await page.getByText('没有匹配的文档', { exact: true }).count(), 0)
        await verifyDevDocsReadingNavigation(page, assert)
      }
      if (item.route === DEV_PERMISSION_RELATIONSHIPS_ROUTE) {
        assert.equal(await page.getByRole('tab', { name: '关系图', exact: true }).getAttribute('aria-selected'), 'true')
        assert((await page.locator('.erp-permission-relationship > .ant-alert-warning').count()) <= 1, '权限读取问题集中显示，避免重复警告')
        await page.getByRole('tab', { name: '关系图', exact: true }).click()
        await verifyMermaidViewer(
          page,
          page.locator('.erp-permission-relationship .erp-markdown-mermaid'),
          assert
        )
      }
      if (item.route === DEV_PRODUCT_CORE_ROUTE) {
        const filters = page.locator('.erp-dev-product-core-filters .erp-filter-chip')
        await filters.nth(1).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-dev-product-core-filters .erp-filter-chip')[1]?.getAttribute('aria-pressed') === 'true')
        assert.equal(new URL(page.url()).searchParams.get('status'), 'entered')
        assert.equal(await filters.nth(1).getAttribute('aria-pressed'), 'true')
        await page.reload()
        await page.waitForFunction(() => document.querySelectorAll('.erp-dev-product-core-filters .erp-filter-chip')[1]?.getAttribute('aria-pressed') === 'true')
        assert.equal(await filters.nth(1).getAttribute('aria-pressed'), 'true')
        assert((await page.locator('.erp-dev-product-core-group').evaluateAll((groups) => groups.every((group) => group.dataset.membership === 'entered'))), '筛选与返回必须保持同一能力范围')
        assert.equal(await page.getByRole('dialog').count(), 0, '默认能力目录不同时铺开详情')
        const capability = page.locator('.erp-dev-product-core-group button').nth(2)
        const name = await capability.innerText()
        await capability.click()
        assert.equal(new URL(page.url()).searchParams.get('capability'), name)
        await page.getByRole('dialog', { name, exact: true }).waitFor()
        await page.reload()
        const detail = page.getByRole('dialog', { name, exact: true })
        await detail.waitFor()
        await detail.getByRole('heading', { name: '当前边界', exact: true }).waitFor()
        await detail.getByRole('button', { name: '返回能力目录', exact: true }).click()
        await detail.waitFor({ state: 'hidden' })
        assert.equal(new URL(page.url()).searchParams.get('status'), 'entered')
        assert.equal(new URL(page.url()).searchParams.has('capability'), false)
        const catalogFits = await page.locator('.erp-dev-product-core-groups').evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
        assert(catalogFits, '能力目录不依赖横向滚动')
      }
      if ([DEV_PRODUCT_ENGINEERING_ROUTE, DEV_DEVELOPMENT_RESOURCES_ROUTE].includes(item.route)) {
        const areaKey = item.route === DEV_PRODUCT_ENGINEERING_ROUTE ? 'product-engineering' : 'development-resources'
        const visibleTools = await page.locator('.erp-dev-tool-table tbody th a').evaluateAll((links) => links.map((link) => link.getAttribute('href')).sort())
        const registeredTools = DEV_SECONDARY_NAV_ITEMS.filter((entry) => entry.areaKey === areaKey && entry.showInNavigation !== false).map((entry) => entry.route).sort()
        assert.deepEqual(visibleTools, registeredTools, '按用途分组后全部常驻工具仍各有一个入口')
      }
      if (item.route === DEV_DEVELOPMENT_RESOURCES_ROUTE) {
        await verifyProjectGraphDirectory(page, { assert, assertNoHorizontalOverflow })
      }
      if (item.route === DEV_INTEGRATION_ROUTE) {
        await verifyIntegrationWorkspace(page, { assert, assertNoHorizontalOverflow })
      }
      if (item.route === DEV_QUALITY_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-tool-table tbody tr').count(),
          DEV_SECONDARY_NAV_ITEMS.filter((entry) => entry.areaKey === 'quality' && entry.showInNavigation !== false).length,
          '测试验证首页应完整显示已登记的常驻工具'
        )
        assert.equal(
          await page
            .locator(
              '[data-tool-key="quality-gates"] a[href="/__dev/quality-gates"]'
            )
            .count(),
          1,
          '测试验证首页应提供质量门禁入口'
        )
      }
      if (item.route === DEV_CUSTOMER_CONFIG_ROUTE) {
        await page
          .getByRole('tablist', { name: '客户配置工作任务' })
          .getByRole('tab', { name: /^检查配置(?:\s|$)/u })
          .click()
        const preflight = page.locator('[data-dev-customer-view="包预检"]')
        await preflight.waitFor({ state: 'visible' })
        const sections = page.getByRole('tablist', { name: '配置预检任务' })
        for (const section of [
          { label: '包结构', key: 'package' },
          { label: '运行设置', key: 'runtime' },
          { label: '流程策略', key: 'flow' },
          { label: '包结构', key: 'package' },
        ]) {
          await sections
            .getByRole('tab', { name: new RegExp(`^${section.label}`, 'u') })
            .click()
          await page.waitForURL(
            (url) =>
              url.searchParams.get('view') === 'preflight' &&
              (url.searchParams.get('section') || 'package') === section.key
          )
          if (section.key === 'package') {
            await preflight.getByText('客户包对象', { exact: true }).click()
            const declarations = preflight
              .locator('.erp-dev-customer-db-target')
              .filter({
                has: page.getByText('策略 / 命令声明', { exact: true }),
              })
            assert((await declarations.innerText()).includes('仅预览'))
            await preflight.getByText('客户包对象', { exact: true }).click()
          } else if (section.key === 'runtime') {
            const catalog = preflight.locator('.erp-dev-customer-tool')
            assert(
              (
                await catalog
                  .filter({ has: page.getByText('策略目录', { exact: true }) })
                  .innerText()
              ).includes('仅声明式预览')
            )
            assert(
              (
                await catalog
                  .filter({
                    has: page.getByText('扩展点目录', { exact: true }),
                  })
                  .innerText()
              ).includes('当前未实现')
            )
          } else {
            const checks = preflight.locator('.erp-dev-customer-formal-gate')
            await checks
              .filter({ hasText: '仅声明式预览' })
              .first()
              .waitFor({ state: 'visible' })
            const previews = await checks
              .filter({ hasText: '仅声明式预览' })
              .allTextContents()
            assert(previews.length > 0)
            assert(previews.every((text) => text.includes('仅预览')))
            assert(
              (
                await checks.filter({ hasText: '当前未实现' }).innerText()
              ).includes('受控空目录')
            )
          }
          assert.doesNotMatch(
            await preflight.innerText(),
            /已登记绑定|实现来自已登记部署包/u
          )
          await assertNoHorizontalOverflow(
            page,
            `${item.route} ${section.label}`
          )
        }
        await page.reload()
        await preflight.waitFor({ state: 'visible' })
        assert.equal(new URL(page.url()).searchParams.get('view'), 'preflight')
        assert.equal(new URL(page.url()).searchParams.get('section'), null)
      }
      await assertNoHorizontalOverflow(page, item.route)
    },
  }))
}
