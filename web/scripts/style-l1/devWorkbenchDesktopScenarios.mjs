import { installIntegrationWorkspaceMock, verifyIntegrationWorkspace, verifyProjectGraphDirectory } from './devProjectGraphAssertions.mjs'
import { DEV_HUB_ITEMS } from '../../src/dev-workbench/config/devHub.mjs'
import { DEV_TESTING_FIXED_ACTIONS } from '../../src/dev-workbench/config/devTestingOperation.mjs'
import { TASK_HANDLING_ROWS } from '../../src/dev-workbench/config/devTaskHandling.mjs'
import { ROLE_DISPLAY_NAMES } from '../../src/erp/utils/roleKeys.mjs'
import { DEV_TESTING_WORKSPACE_VIEWS } from '../../src/dev-workbench/config/devTesting.mjs'
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
  DEV_TASK_HANDLING_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { assertDevDocsDirectorySpace, createDevDocsReadingFixture, verifyDevDocsReadingNavigation } from './devDocsLayoutAssertions.mjs'
import { verifyTestingOverview } from './devTestingOverviewAssertions.mjs'
import { verifyProductCoreLayout } from './devProductCoreAssertions.mjs'

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
  const scenarios = ORDINARY_DEV_ROUTES.map((item) => ({
    name: `dev-page-${item.key}-desktop-light`,
    path: item.route,
    ...(item.route === DEV_PERMISSION_RELATIONSHIPS_ROUTE
      ? { beforeNavigate: installPermissionRelationshipMock }
      : item.route === DEV_INTEGRATION_ROUTE
        ? { beforeNavigate: installIntegrationWorkspaceMock }
        : item.route === DEV_TESTING_ROUTE
          ? { beforeNavigate: async (page) => {
              await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) => route.fulfill({ json: {
                status: 'missing', message: '尚未采集覆盖报告',
              } }))
              await page.route('**/__dev/api/qa/quality-gates/integration-evidence', (route) => route.fulfill({ json: {
                kind: 'plush.integration-evidence', current: false, scenarios: [], run: null, ruleTests: [],
              } }))
            } }
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
      if (item.route === DEV_TASK_HANDLING_ROUTE) {
        const header = page.locator('.erp-dev-task-handling__header')
        const before = await header.boundingBox()
        const filterControl = (name) => page.locator('.erp-dev-task-matrix .ant-select')
          .filter({ has: page.getByRole('combobox', { name, exact: true }) })
          .locator('.ant-select-selector')
        assert.equal(await page.getByRole('tab').count(), 0)
        assert.deepEqual(await page.locator('.erp-dev-task-matrix').getByRole('columnheader').allTextContents(),
          ['办理事项', '办理岗位', '办理类型', '本次办理', '审批与交接', '电脑', '手机'])
        for (const [key, label] of Object.entries(ROLE_DISPLAY_NAMES)) {
          await filterControl('办理岗位').click()
          await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: new RegExp(`^${label}$`, 'u') }).click()
          await page.waitForFunction(({ roleKey, roleLabel }) => {
            const rows = [...document.querySelectorAll('.erp-dev-task-matrix .ant-table-row')]
            return new URL(window.location.href).searchParams.get('role') === roleKey &&
              rows.length > 0 && rows.every((row) => row.children[1]?.textContent.startsWith(roleLabel))
          }, { roleKey: key, roleLabel: label })
          const keys = await page.locator('.erp-dev-task-matrix .ant-table-row').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-row-key')))
          assert.deepEqual(keys, TASK_HANDLING_ROWS.filter((row) => row.roleKeys.includes(key)).map((row) => row.key), `${label} 办理事项缺失或混入其他岗位`)
          await assertNoHorizontalOverflow(page)
          if (key === 'engineering') {
            assert.equal(keys.length, 2)
            const text = await page.locator('.erp-dev-task-matrix').innerText()
            assert.match(text, /工程用料提交与修订/u)
            assert.match(text, /老板审核.*另一位财务复核/u)
            assert.doesNotMatch(text, /销售订单编制与提交|订单审批/u)
          }
        }
        await filterControl('办理岗位').click()
        await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: /^业务$/u }).click()
        await page.reload()
        await expectHeading(page, '任务办理')
        assert.equal(new URL(page.url()).searchParams.get('role'), 'sales')
        assert.equal(await page.getByRole('alert').count(), 0)
        await page.getByRole('button', { name: '重置', exact: true }).click()
        assert.equal(new URL(page.url()).searchParams.has('role'), false)
        await filterControl('办理类型').click()
        await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: /^审核决策$/u }).click()
        const rows = page.locator('.ant-table-row')
        for (const role of ['老板', 'PMC', '财务']) assert((await rows.allTextContents()).some((text) => text.includes(role)), `审核清单缺少 ${role}`)
        await filterControl('办理岗位').click()
        await page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option').filter({ hasText: /^PMC$/u }).click()
        await page.reload()
        await page.getByRole('button', { name: '订单评审', exact: true }).waitFor()
        assert.equal(await rows.count(), 1)
        assert.equal(await page.getByRole('alert').count(), 0)
        await page.getByRole('button', { name: '重置', exact: true }).click()
        const after = await header.boundingBox()
        for (const key of ['x', 'y', 'width', 'height']) assert(Math.abs(before[key] - after[key]) <= 1, `任务办理页头 ${key} 不应跳动`)
      }
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
        await search.press('Enter')
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
        await search.press('Enter')
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
          key: ['purchase_to_inventory', 'delivery_to_settlement'][index],
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
          files: [{ path: 'report.json', bytes: 1, sha256: 'a'.repeat(64) }],
          freshness: 'historical',
          definitionComparison: { status: 'unverified', chains: [] },
          currentRepository: { commit: 'b'.repeat(40), dirty: true },
          report: {
            generatedAt: '2026-10-22T03:00:00Z',
            verdict: '模拟失败用于验证筛选',
            scope: {
              sourceCommit: 'a'.repeat(40),
              customer: 'demo',
              data: '页面夹具',
              mode: 'fixture',
              terminal: '读回',
              notIncluded: ['真实业务'],
              chainCount: 2,
              stepCount: 2,
              registeredScenarioCount: 0,
            },
            metrics: { stepStates: { failed: 2 } },
            chains,
            lineage: [],
            findings: [],
            coverageLimits: ['仅证明页面操作'],
            createEdit: [],
            mobileActions: [],
            pages: [],
            printing: { templates: [] },
            pdfValidation: { templates: [] },
            evidence: [],
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
        await page.getByText('尚未采集链路实测报告。', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-dev-workspace-nav').getByRole('link', { name: '链路实测报告', exact: true }).count(), 0)
        assert.equal(await page.getByRole('combobox', { name: '实跑批次' }).count(), 0)
        assert.equal(await page.getByRole('tab', { name: '链路结果', exact: true }).count(), 0)
        await page.route('**/__dev/api/qa/coverage{,/snapshot}', (route) => route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ status: 'missing', message: '尚未采集覆盖报告' }),
        }))
        await page.locator('.erp-dev-chain-audit__header a[href="/__dev/testing?view=coverage"]').click()
        await page.waitForURL('**/__dev/testing?view=coverage')
        const coverage = page.locator('.erp-dev-testing-coverage-view')
        await coverage.getByRole('link', { name: '链路实测报告', exact: true }).waitFor()
        await coverage.getByRole('tab', { name: /^业务场景/u }).click()
        await coverage.getByRole('link', { name: '链路实测报告', exact: true }).click()
        await page.getByText('尚未采集链路实测报告。', { exact: true }).waitFor()
        await page.goBack()
        await coverage.getByRole('tab', { name: /^业务场景/u, selected: true }).waitFor()
        await assertNoHorizontalOverflow(page, '测试报告中的链路实测入口')
        await coverage.getByRole('link', { name: '链路实测报告', exact: true }).click()
        await page.reload()
        await page.locator('.erp-dev-chain-audit__header a[href="/__dev/testing?view=coverage&coverage=business"]').click()
        await coverage.getByRole('tab', { name: /^业务场景/u, selected: true }).waitFor()
        await coverage.getByRole('link', { name: '链路实测报告', exact: true }).click()
        await page.getByRole('link', { name: '前往本轮验证', exact: true }).click()
        await page.getByRole('region', { name: '本轮验证固定动作' }).waitFor()
        await page.goBack()
        await page.getByText('尚未采集链路实测报告。', { exact: true }).waitFor()
        batches = [{ id: batch, status: 'ready' }]
        await page.getByRole('button', { name: '重新读取', exact: true }).click()
        await page.getByRole('heading', { name: '本批次链路与结果', exact: true }).waitFor()
        assert.equal(await page.getByRole('combobox', { name: '实跑批次' }).count(), 0, '只有一个批次时无需选择')
        assert.equal(await page.getByRole('combobox', { name: '筛选链路' }).count(), 0)
        await page.getByRole('button', { name: '采购测试链', exact: true }).click()
        await page.getByRole('cell', { name: '采购步骤', exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('chain'), 'purchase_to_inventory')
        const stepTable = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: '实际操作与读回', exact: true }) })
        await stepTable.getByText('1. 出货步骤', { exact: true }).waitFor({ state: 'hidden' })
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 1)
        await page.reload()
        await page.getByRole('button', { name: '全部链路', exact: true }).click()
        await stepTable.getByText('1. 出货步骤', { exact: true }).waitFor()
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 2)
        const stepSearch = page.getByRole('textbox', { name: '搜索环节、岗位或实际读回', exact: true })
        await stepSearch.fill('采购')
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 2, 'typing keeps the current chain results')
        await stepSearch.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('q') === '采购')
        await stepTable.getByText('1. 出货步骤', { exact: true }).waitFor({ state: 'hidden' })
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 1)
        await stepSearch.locator('xpath=..').getByRole('button', { name: '清除搜索', exact: true }).click()
        await stepTable.getByText('1. 出货步骤', { exact: true }).waitFor()
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 2)

        await page.getByRole('tab', { name: '问题与复验', exact: true }).click()
        await page.getByText('本批次没有登记问题；覆盖边界以执行记录为准。', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '执行与证据', exact: true }).click()
        assert.match(await page.getByRole('link', { name: '下载 report.json', exact: true }).getAttribute('href'), /artifact\?batch=ui-controls-fixture&file=report.json$/u)
        await page.reload()
        await page.getByRole('tab', { name: '执行与证据', exact: true, selected: true }).waitFor()
        await page.getByRole('tab', { name: '链路结果', exact: true }).click()
        await page.getByRole('button', { name: '采购测试链', exact: true }).click()
        await page.locator('.erp-dev-chain-audit__header').getByRole('link', { name: '业务链路', exact: true }).click()
        await page.waitForURL('**/__dev/status-flows?view=chain&chain=purchase_to_inventory')
        await page.locator('[data-dev-flow-state-observatory][data-catalog-status="ready"]').waitFor()
        const chainReportLink = page.getByRole('link', { name: '查看链路实测报告', exact: true })
        assert.equal(await chainReportLink.getAttribute('href'), '/__dev/business-chain-audit?chain=purchase_to_inventory')
        await chainReportLink.click()
        await page.getByRole('cell', { name: '采购步骤', exact: true }).waitFor()
        assert.equal(await stepTable.locator('tbody > tr.ant-table-row').count(), 1, '从业务链路返回时保留所选链路')
        await page.setViewportSize({ width: 1100, height: 800 })
        await assertNoHorizontalOverflow(page, '链路唯一选择入口与窄窗口')
      }
      if (item.route === DEV_TESTING_ROUTE) {
        await verifyTestingOverview(page, assert, assertNoHorizontalOverflow)
        const validation = page.getByRole('region', { name: '本轮验证固定动作' })
        await validation.waitFor()
        assert.deepEqual(
          await validation.getByRole('rowheader').allTextContents(),
          DEV_TESTING_FIXED_ACTIONS.map((action) => action.shortLabel)
        )
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
        const primaryTabs = page.getByRole('tablist', { name: '测试验证工作区主视图' })
        assert.deepEqual(await primaryTabs.getByRole('tab').allTextContents(), DEV_TESTING_WORKSPACE_VIEWS.map(({ label }) => label))
        const groups = page.getByRole('tablist', { name: '测试环境与指引' })
        assert.deepEqual(await groups.getByRole('tab').allTextContents(), ['本地测试', '服务器验证', '测试指引'])
        const primaryIndex = (value) => DEV_TESTING_WORKSPACE_VIEWS.findIndex((view) => view.value === value)
        assert.equal(await page.getByRole('button', { name: '测试指引', exact: true }).count(), 0)
        await verifySlidingMotion(page, assert, '.erp-dev-testing-group-nav > .erp-sliding-tab-list', 2)
        await verifySlidingMotion(page, assert, '.erp-dev-testing-group-nav > .erp-sliding-tab-list', 0, true)
        await groups.getByRole('tab', { name: '测试指引', exact: true }).click()
        await page.getByRole('heading', { name: '测试执行', exact: true }).waitFor()
        const guideNav = page.getByRole('tablist', { name: '测试指引主题' })
        await guideNav.getByRole('tab', { name: '真机回归', exact: true }).click()
        await page.getByRole('table', { name: '真机回归场景范围', exact: true }).waitFor()
        assert.equal(await page.getByRole('table', { name: '自动化测试方式', exact: true }).count(), 0)
        await page.reload()
        await groups.getByRole('tab', { name: '测试指引', exact: true, selected: true }).waitFor()
        await guideNav.getByRole('tab', { name: '真机回归', exact: true, selected: true }).waitFor()
        await guideNav.getByRole('tab', { name: '常用命令', exact: true }).click()
        await page.locator('.erp-dev-testing-presets article').first().waitFor()
        const totalPresets = await page.locator('.erp-dev-testing-presets article').count()
        const presetSearch = page.getByPlaceholder('搜索常用检查')
        await presetSearch.fill('没有这种检查xyz')
        await presetSearch.press('Enter')
        await page.getByText('没有匹配的常用检查', { exact: true }).waitFor()
        await presetSearch.fill('字段')
        await presetSearch.press('Enter')
        await page.getByText('没有匹配的常用检查', { exact: true }).waitFor({ state: 'hidden' })
        const presets = page.locator('.erp-dev-testing-presets')
        assert((await presets.locator('article').count()) > 0)
        assert((await presets.locator('article').count()) < totalPresets)
        await presets.locator('summary').first().click()
        await presets.locator('pre').first().waitFor({ state: 'visible' })
        await assertNoHorizontalOverflow(page, '测试使用指引与命令详情')
        await presetSearch.fill('')
        await presetSearch.press('Enter')
        await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
        await primaryTabs.getByRole('tab', { name: '本轮验证', exact: true }).click()
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
        await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
        await verifySlidingMotion(page, assert, '.erp-dev-testing-primary-nav > .erp-sliding-tab-list', primaryIndex('coverage'))
        await verifySlidingMotion(page, assert, '.erp-dev-testing-primary-nav > .erp-sliding-tab-list', primaryIndex('tiers'), true)
        await page.getByRole('tab', { name: '测试报告', exact: true }).click()
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
        const labels = ['代码覆盖', '业务场景', '关键规则', '门禁结果', '运行与验收']
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
        await switchEvidence('门禁结果', true)
        await coverage
          .getByRole('region', { name: '门禁结果', exact: true })
          .waitFor()
        await switchEvidence('运行与验收')
        assert.equal(await page.getByRole('region', { name: '服务器测试与交付证据', exact: true }).count(), 0, '服务器证据只在独立入口读取')
        assert((await coverage.innerText()).includes('RPC 夹具只证明页面协作'))
        await page.goBack()
        await coverage
          .getByRole('region', { name: '门禁结果', exact: true })
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
        assert.equal(new URL(page.url()).searchParams.get('coverageDomain'), 'source-documents')
        await groups.getByRole('tab', { name: '测试指引', exact: true }).click()
        assert.equal(new URL(page.url()).searchParams.has('returnView'), false)
        await page.reload()
        await groups.getByRole('tab', { name: '测试指引', exact: true, selected: true }).waitFor()
        await page.getByRole('link', { name: '页面说明检查', exact: true }).click()
        await page.getByRole('heading', { name: '页面说明检查', exact: true }).waitFor()
        await page.getByLabel('执行与报告来源').getByText('通用资料 · 页面说明目录', { exact: true }).waitFor()
        await page.getByRole('textbox', { name: '搜索页面说明', exact: true }).fill('可用量')
        await page.getByRole('textbox', { name: '搜索页面说明', exact: true }).press('Enter')
        await page.getByText('当前显示 1 个页面', { exact: true }).waitFor()
        await page.reload()
        await page.getByRole('link', { name: '返回测试指引', exact: true }).click()
        await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
        await primaryTabs.getByRole('tab', { name: '测试报告', exact: true }).click()
        await business.waitFor()
        assert.equal(new URL(page.url()).searchParams.get('coverage'), 'business')
        assert.equal(new URL(page.url()).searchParams.get('coverageDomain'), 'source-documents')
        assert.equal(new URL(page.url()).searchParams.get('reportSource'), 'snapshot')
        assert.equal(new URL(page.url()).searchParams.has('returnView'), false)
        await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
        await coverage
          .getByRole('button', { name: '返回业务域总览', exact: true })
          .click()
        await domainTable.waitFor()
        await page.reload()
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
        await mainViews.getByText('测试报告', { exact: true }).click()
        await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
        await source.getByText('当前工作区', { exact: true }).click()
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
        await groups.getByRole('tab', { name: '测试指引', exact: true }).click()
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
        await commandSearch.press('Enter')
        await page
          .getByText('当前筛选没有命令块 / No command blocks', { exact: true })
          .waitFor()
        await commandSearch.fill('')
        await commandSearch.press('Enter')
        await commands.first().waitFor()
        await assertNoHorizontalOverflow(page, '专项检查命令分页与空结果恢复')
        await page.getByRole('button', { name: '返回测试指引', exact: true }).click()
        await groups.getByRole('tab', { name: '测试指引', exact: true, selected: true }).waitFor()
        await groups.getByRole('tab', { name: '本地测试', exact: true }).click()
        await primaryTabs.getByRole('tab', { name: '测试报告', exact: true }).click()
        await page.getByRole('tab', { name: '测试报告', exact: true, selected: true }).waitFor()
        await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
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
        await search.press('Enter')
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
        await page.getByRole('textbox', { name: '搜索项目文档' }).press('Enter')
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
        await verifyProductCoreLayout(page, { assertNoHorizontalOverflow })
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
            await preflight.getByText('配置范围与依据', { exact: true }).click()
            await preflight.getByText('客户包对象', { exact: true }).waitFor({ state: 'visible' })
            const declarations = preflight
              .locator('.erp-dev-customer-db-target')
              .filter({
                has: page.getByText('策略 / 命令声明', { exact: true }),
              })
            assert((await declarations.innerText()).includes('仅预览'))
            await preflight.getByText('配置范围与依据', { exact: true }).click()
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
  return [...scenarios, createTestingReportLayoutScenario({ assert, assertNoHorizontalOverflow })]
}

function createTestingReportLayoutScenario({ assert, assertNoHorizontalOverflow }) {
  const counts = { total: 100, executed: 100, passed: 100, failed: 0, skipped: 0 }
  const report = {
    schemaVersion: 'plush-test-coverage-report/v1',
    generatedAt: '2026-10-24T04:49:17Z',
    repository: { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64), dirty: false },
    codeCoverage: {
      go: { ...counts, status: 'collected', metrics: { statements: { covered: 42305, total: 252400 } }, note: 'Go 包含生成代码，未执行 PostgreSQL 测试。', evidence: [`output/qa/${'long-evidence-path-'.repeat(16)}coverage.out`] },
      web: { ...counts, status: 'collected', metrics: { lines: { percentage: 59.4 }, branches: { percentage: 84.1 }, functions: { percentage: 79.7 } }, note: 'Web 仅统计实际加载模块，不等于浏览器覆盖。' },
    },
    businessCoverage: { ...counts, status: 'passed' },
    gates: [{ key: 'T5', label: '页面与浏览器', ...counts, status: 'passed' }],
    acceptance: {},
  }
  let status = 'current'
  const writes = []
  return {
    name: 'dev-testing-report-layout-desktop-light',
    path: '/__dev/testing?view=coverage',
    viewport: { width: 1280, height: 720 },
    beforeNavigate: async (page) => {
      page.on('request', (request) => {
        if (request.url().includes('/__dev/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())) writes.push(request.url())
      })
      await page.route('**/__dev/api/qa/coverage', (route) => route.fulfill({ json: { status, report: ['missing', 'failed'].includes(status) ? null : report } }))
      await page.route('**/__dev/api/qa/coverage/snapshot', (route) => route.fulfill({ json: { status: 'snapshot', report: { ...report, snapshot: { kind: 'isolated' } } } }))
    },
    verify: async (page) => {
      const coverage = page.locator('.erp-dev-testing-coverage-view')
      const evidenceTabs = coverage.getByRole('tablist', { name: '覆盖证据类型' })
      const source = coverage.locator('.erp-dev-testing-coverage-source')
      const reload = () => coverage.getByRole('button', { name: '重新读取', exact: true }).click()
      await coverage.getByText('报告与当前仓库指纹匹配', { exact: true }).waitFor()
      await page.getByLabel('执行与报告来源').getByText('报告来源：本地工作台', { exact: true }).waitFor()
      assert.equal(await page.getByRole('region', { name: '服务器测试与交付证据', exact: true }).count(), 0)
      assert.equal(await coverage.locator('.ant-alert-success').count(), 0, '身份匹配不能呈现为整页测试成功')
      const codeRows = coverage.locator('.erp-dev-testing-coverage-grid--code > article')
      const go = codeRows.filter({ hasText: '后端 Go' })
      for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
        await page.setViewportSize(viewport)
        await page.locator('.erp-dev-testing-primary-nav').scrollIntoViewIfNeeded()
        const readingBoxes = await codeRows.evaluateAll((rows) => rows.map((row) => {
          const rect = row.getBoundingClientRect()
          return { top: rect.top, bottom: rect.bottom }
        }))
        assert.equal(readingBoxes.length, 2)
        assert(readingBoxes.every((box) => box.top >= 0 && box.bottom < viewport.height - 40), `Go / Web 读数应在 ${viewport.width} 首屏完整可读`)
        await assertNoHorizontalOverflow(page, `报告布局 ${viewport.width}`)
      }
      assert.equal(await go.getByText(report.codeCoverage.go.note, { exact: true }).isVisible(), false, '正常口径按需阅读')
      await go.locator('summary').click()
      await go.getByText(report.codeCoverage.go.note, { exact: true }).waitFor()
      await go.getByText(report.codeCoverage.go.evidence[0], { exact: true }).waitFor()
      await assertNoHorizontalOverflow(page, '长证据路径原处展开')
      await go.locator('summary').click()
      const details = coverage.locator('.erp-dev-testing-coverage-report-details')
      await details.locator('summary').click()
      await details.getByText(report.repository.fingerprint, { exact: true }).waitFor()
      await details.locator('summary').click()
      for (const [index, label] of ['业务场景', '关键规则', '门禁结果', '运行与验收', '代码覆盖'].entries()) {
        const optionIndex = index === 4 ? 0 : index + 1
        await verifySlidingMotion(page, assert, '.erp-dev-testing-coverage-tabs', optionIndex, index % 2 === 0)
        await evidenceTabs.getByRole('tab', { name: new RegExp(`^${label}`, 'u'), selected: true }).waitFor()
        assert.equal(await page.getByRole('region', { name: '服务器测试与交付证据', exact: true }).count(), 0, '报告页签不重复挂载服务器证据')
        await assertNoHorizontalOverflow(page, label)
      }
      await source.getByText('历史隔离验证', { exact: true }).click()
      await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
      await page.reload()
      await coverage.getByText('正在查看历史隔离验证', { exact: true }).waitFor()
      await source.getByText('当前工作区', { exact: true }).click()
      await coverage.getByText('报告与当前仓库指纹匹配', { exact: true }).waitFor()
      status = 'stale'
      report.codeCoverage.go = { ...report.codeCoverage.go, status: 'failed', passed: 99, failed: 1, note: '编译失败，测试未完成。' }
      await reload()
      await coverage.getByText('覆盖报告已过期', { exact: true }).waitFor()
      await go.getByText('编译失败，测试未完成。', { exact: true }).waitFor()
      await go.locator('[data-issue="failed"]').getByText('失败 1', { exact: true }).waitFor()
      await assertNoHorizontalOverflow(page, '过期与失败报告')
      report.codeCoverage.go = { ...report.codeCoverage.go, status: 'collected', failed: 0, skipped: 1, note: '已有覆盖率，但有 1 条用例跳过。' }
      await reload()
      await go.getByText(report.codeCoverage.go.note, { exact: true }).waitFor()
      await go.locator('[data-issue="skipped"]').getByText('跳过 1', { exact: true }).waitFor()
      status = 'failed'
      await reload()
      await coverage.getByText('覆盖报告读取失败', { exact: true }).waitFor()
      status = 'missing'
      await reload()
      await coverage.getByText('当前工作区尚未验证', { exact: true }).waitFor()
      assert.equal(await codeRows.count(), 0, '缺报告不能回填旧读数')
      status = 'current'
      report.codeCoverage.go = { ...report.codeCoverage.go, status: 'collected', passed: 100, failed: 0, skipped: 0, note: 'Go 包含生成代码，未执行 PostgreSQL 测试。' }
      await reload()
      await coverage.getByText('报告与当前仓库指纹匹配', { exact: true }).waitFor()
      await go.getByText('已执行 100', { exact: true }).waitFor()
      assert.deepEqual(writes, [], '布局核验不启动采集或其他写入')
    },
  }
}
