import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_CUSTOMER_CONFIG_ROUTE,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_PAGE_TITLE_BY_ROUTE,
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_PRODUCT_ENGINEERING_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_QUALITY_ROUTE,
  DEV_SECONDARY_NAV_ITEMS,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_TESTING_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
  DEV_WORKSPACE_NAV_ITEMS,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

const SPECIALIZED_ROUTES = new Set([
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DRILL_RECOVERY_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_STATUS_FLOWS_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
])

const DESKTOP_HEADING_BY_ROUTE = Object.freeze({
  '/__dev': '总览',
  [DEV_TESTING_ROUTE]: '改动验证',
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
    mockAdminRpc: item.route === DEV_PERMISSION_RELATIONSHIPS_ROUTE,
    viewport: { width: 1440, height: 900 },
    ...(item.route === DEV_TESTING_ROUTE
      ? {
          expectedConsoleErrorPatterns: [
            /console error.*net::ERR_FAILED.*\/__dev\/api\/qa\/coverage/u,
          ],
        }
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
        await search.fill('质量门禁')
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
        assert.equal(await search.inputValue(), '质量门禁')
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
        await page.locator('.ant-select-dropdown [title="质量验证"]').click()
        assert.equal(new URL(page.url()).searchParams.get('group'), 'quality')
        await page.waitForFunction(
          () =>
            document.querySelectorAll(
              'table[aria-label="全部开发工具"] tbody tr'
            ).length === 4
        )
        assert.equal(
          await page
            .locator('table[aria-label="全部开发工具"] tbody tr')
            .count(),
          4
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
          4
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
          4
        )
      }
      if (item.route === DEV_TESTING_ROUTE) {
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
          .getByText('正在查看最近一次隔离验证', { exact: true })
          .waitFor({ state: 'visible' })
        await coverage
          .getByText('文件监听资源不足', { exact: true })
          .waitFor({ state: 'visible' })
        assert((await coverage.innerText()).includes('14.8%'))
        const evidenceTabs = coverage.getByRole('tablist', {
          name: '覆盖证据类型',
        })
        assert.equal(await evidenceTabs.getByRole('tab').count(), 4)
        assert.match(
          await evidenceTabs.getByRole('tab').nth(0).innerText(),
          /失败/
        )
        assert.match(
          await evidenceTabs.getByRole('tab').nth(1).innerText(),
          /失败/
        )
        assert.match(
          await evidenceTabs.getByRole('tab').nth(3).innerText(),
          /部分覆盖/
        )
        assert.equal(
          await coverage.locator('.erp-dev-testing-coverage-section').count(),
          1
        )
        const source = coverage.locator('.erp-dev-testing-coverage-source')
        const initialBox = await source.boundingBox()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-testing-coverage-source',
          0
        )
        await coverage
          .getByText('尚未生成覆盖报告', { exact: true })
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
        await coverage
          .getByText('隔离源码快照', { exact: true })
          .waitFor({ state: 'visible' })
        const readsBeforeTabs = { workspaceReads, snapshotReads }
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-testing-coverage-tabs',
          1
        )
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
        await business
          .locator('.erp-dev-testing-coverage-scenarios > summary')
          .click()
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
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-testing-coverage-tabs',
          2,
          true
        )
        await coverage
          .getByText('本轮 T0-T8 门禁 / Required Gates', { exact: true })
          .waitFor()
        await verifySlidingMotion(
          page,
          assert,
          '.erp-dev-testing-coverage-tabs',
          3
        )
        assert((await coverage.innerText()).includes('RPC 夹具只证明页面协作'))
        await page.goBack()
        await coverage
          .getByText('本轮 T0-T8 门禁 / Required Gates', { exact: true })
          .waitFor()
        assert.equal(new URL(page.url()).searchParams.get('coverage'), 'gates')
        await page.goForward()
        await coverage
          .getByText('运行态与验收 / Runtime & Acceptance', { exact: true })
          .waitFor()
        await evidenceTabs.getByRole('tab').nth(3).press('Home')
        await coverage.getByText('文件监听资源不足', { exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.has('coverage'), false)
        await evidenceTabs.getByRole('tab').nth(0).press('ArrowRight')
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
        await coverage.getByText('隔离源码快照', { exact: true }).waitFor()
        await domainTable.waitFor()
        assert.equal(
          new URL(page.url()).searchParams.get('coverage'),
          'business'
        )
        const domainPicker = coverage.getByRole('combobox', {
          name: '查看业务域',
        })
        await domainPicker.focus()
        await domainPicker.press('ArrowDown')
        await page.locator('.ant-select-dropdown [title="采购"]').click()
        const procurement = coverage
          .locator('.erp-dev-testing-coverage-card')
          .filter({ hasText: '采购' })
        await procurement
          .locator('.erp-dev-testing-coverage-scenarios > summary')
          .click()
        await coverage
          .getByText('按供应商生成采购结果', { exact: true })
          .waitFor()
        await evidenceTabs.getByRole('tab').nth(1).press('End')
        await coverage
          .getByText('运行态与验收 / Runtime & Acceptance', { exact: true })
          .waitFor()
        await assertNoHorizontalOverflow(page, '覆盖证据四类标签与业务域详情')
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
          .getByText('隔离源码快照', { exact: true })
          .waitFor({ state: 'visible' })
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
          .getByText('隔离源码快照', { exact: true })
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
          .getByText('尚未生成覆盖报告', { exact: true })
          .waitFor({ state: 'visible' })
        await source.getByText('最近隔离验证', { exact: true }).click()
        await coverage
          .getByText('隔离源码快照', { exact: true })
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
        await coverage
          .getByText('隔离源码快照', { exact: true })
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
          .getByText('隔离源码快照', { exact: true })
          .waitFor({ state: 'visible' })
        await mainViews.getByText('本轮验证', { exact: true }).click()
        await page.locator('.erp-dev-testing-disclosure--tools > summary').click()
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
        const source = 'docs/product/配置与权限策略.md'
        await page.setViewportSize({ width: 3840, height: 2160 })
        await page.goto(new URL(`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(source)}`, page.url()).href)
        const diagram = page
          .locator('.erp-dev-docs-markdown [data-mermaid-status="rendered"]')
          .first()
        await diagram.waitFor()
        const svg = diagram.locator('.erp-markdown-mermaid__canvas > svg')
        const defaultGeometry = await svg.evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          intrinsicWidth: node.viewBox.baseVal.width,
        }))
        assert(defaultGeometry.width > 0)
        assert(
          defaultGeometry.width <= defaultGeometry.intrinsicWidth + 1,
          `短图不能被宽屏强制放大：${JSON.stringify(defaultGeometry)}`
        )
        await diagram.getByRole('button', { name: '放大Mermaid 图表', exact: true }).click()
        assert(
          (await svg.boundingBox()).width > defaultGeometry.width * 1.1,
          '图表仍可主动放大'
        )
        await diagram.getByRole('button', { name: '重置Mermaid 图表为 100%', exact: true }).click()
        assert(Math.abs((await svg.boundingBox()).width - defaultGeometry.width) < 1)
        const fullscreen = diagram.getByRole('button', { name: '全屏查看Mermaid 图表', exact: true })
        await fullscreen.click()
        await diagram.locator('[data-mermaid-fullscreen-action="close"]').waitFor()
        assert((await svg.boundingBox()).width <= defaultGeometry.intrinsicWidth + 1)
        await diagram.locator('[data-mermaid-fullscreen-action="close"]').press('Escape')
        await fullscreen.waitFor()
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '全屏查看Mermaid 图表')
        await page.setViewportSize({ width: 1440, height: 900 })
        assert(
          await diagram.locator('.erp-markdown-mermaid__viewport').evaluate((node) => node.scrollWidth <= node.clientWidth),
          '缩回普通桌面宽度后仍能看到完整概览'
        )
      }
      if (item.route === DEV_PRODUCT_ENGINEERING_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-tool-table tbody tr').count(),
          5,
          '产品工程应完整显示五个工具入口'
        )
        assert.equal(
          await page.locator('.erp-dev-product-task__index').count(),
          0,
          '并列工具不能显示为虚假的执行序号'
        )
        assert.equal(
          await page.getByRole('tablist', { name: '产品工程查看方式' }).count(),
          0,
          '产品工程工具应直接显示，不再要求选择查看方式'
        )
      }
      if (item.route === DEV_QUALITY_ROUTE) {
        assert.equal(
          await page.locator('.erp-dev-tool-table tbody tr').count(),
          3,
          '质量验证首页应完整显示改动验证、质量门禁和测试数据'
        )
        assert.equal(
          await page
            .locator(
              '[data-tool-key="quality-gates"] a[href="/__dev/quality-gates"]'
            )
            .count(),
          1,
          '质量验证首页应提供质量门禁入口'
        )
      }
      if (item.route === DEV_CUSTOMER_CONFIG_ROUTE) {
        await page
          .getByRole('tablist', { name: '客户配置工作任务' })
          .getByRole('tab', { name: /^检查配置包/u })
          .click()
        const preflight = page.locator('[data-dev-customer-view="包预检"]')
        await preflight.waitFor({ state: 'visible' })
        const sections = page.getByRole('tablist', { name: '配置预检任务' })
        for (const section of [
          { label: '包结构', key: 'package' },
          { label: '运行投影', key: 'runtime' },
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
            const declarations = preflight
              .locator('.erp-dev-customer-db-target')
              .filter({
                has: page.getByText('策略 / 命令声明', { exact: true }),
              })
            assert((await declarations.innerText()).includes('仅预览'))
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
