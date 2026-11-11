import { validateDatabaseMigrationSummary } from '../../src/dev-workbench/config/devDatabaseMigration.mjs'
import { DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL } from '../../src/dev-workbench/config/devRuntimeRecovery.mjs'
import { installDataPreparationContractFailureRoute } from './devVersionCenterScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const LONG_RELEASE_BATCH = 'review-b-configuration-configuration-configuration-configuration-archive'

function migrationFixture() {
  const target = {
    key: 'shared-dev',
    safeTarget: '登记的隔离浏览器夹具',
    currentVersion: '20260728100514',
    latestVersion: '20260729043852',
    appliedFiles: 104,
    availableFiles: 105,
    pendingFiles: 1,
  }
  const operation = {
    schemaVersion: 'plush.dev-database-migration-operation/v1',
    id: OPERATION_ID,
    idempotencyKey: `database-migration:prepare:${OPERATION_ID}`,
    kind: 'migration',
status: 'ready',
revision: 2,
    createdAt: '2026-07-29T08:00:00.000Z',
updatedAt: '2026-07-29T08:01:00.000Z',
    message: '升级计划与隔离恢复验证已完成',
target,
    source: { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) },
    plan: { hash: 'c'.repeat(64), preparedAt: '2026-07-29T08:00:30.000Z' },
    backup: {
      id: 'browser-verified-backup',
sizeBytes: 1234,
sha256: 'd'.repeat(64),
restoreVerified: true,
      migrationBefore: target.currentVersion,
migrationAfter: target.latestVersion,
      verifiedAt: '2026-07-29T08:00:50.000Z',
    },
    readback: null,
confirmationPrompt: `升级共享开发库:${target.latestVersion}:${OPERATION_ID}`,
    issues: [],
events: [{ at: '2026-07-29T08:01:00.000Z', status: 'ready', message: '准备完成，等待确认' }],
  }
  const summary = {
    kind: 'plush.dev-database-migration-summary',
status: 'success',
target,
    readOnly: false,
runtime: { available: true, health: { status: 'passed', httpCode: 200 }, ready: { status: 'passed', httpCode: 200 } },
    tools: {
      kind: 'plush.dev-database-migration-tools',
status: 'ready',
      checks: [
        { key: 'container_runtime', label: '容器运行环境', status: 'passed', message: '已就绪' },
        { key: 'atlas', label: 'Atlas', status: 'passed', message: '已就绪' },
        { key: 'postgresql_client', label: 'PostgreSQL 客户端', status: 'passed', message: '已就绪' },
        { key: 'supporting_commands', label: '基础命令', status: 'passed', message: '已就绪' },
      ],
    },
    operations: [],
issues: [],
    boundary: { targetKey: 'shared-dev', arbitraryTargetAccepted: false, arbitraryCommandAccepted: false, automaticApply: false, automaticRetry: false, productionSupported: false },
  }
  validateDatabaseMigrationSummary({ ...summary, operations: [operation] })
  return { summary, operation, actions: [], failReads: false }
}

async function installMigrationRoutes(page, fixture) {
  await page.route('**/__dev/api/database-migration/**', async (route) => {
    const { pathname } = new URL(route.request().url())
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (pathname.endsWith('/summary')) return fixture.failReads ? json({ message: '状态读取失败' }, 503) : json(fixture.summary)
    if (pathname.endsWith('/session')) return json({ kind: 'plush.dev-database-migration-session', target: 'shared-dev', csrfToken: 'browser-migration-csrf-token-fixture' })
    if (pathname.endsWith('/actions')) {
      const action = route.request().postDataJSON()
      fixture.actions.push(action)
      if (action.action !== 'prepare') throw new Error('浏览器布局回归不能执行迁移或重启')
      fixture.summary.operations = [fixture.operation]
      return json({ operation: fixture.operation })
    }
    if (pathname.endsWith(`/operations/${OPERATION_ID}`)) return json({ operation: fixture.operation })
    throw new Error(`未登记的迁移夹具路径：${pathname}`)
  })
}

export async function installDatabaseMigrationFixture(page) {
  const fixture = migrationFixture()
  await installMigrationRoutes(page, fixture)
  return fixture
}

export function createDevDeliveryWorkspaceScenarios({ assert, assertNoHorizontalOverflow, expectHeading }) {
  let migration
  let finishDryRun
  let dryRunRequests = 0
  return [
    {
      name: 'dev-recovery-menu-navigation-desktop',
      path: '/__dev/database-migration',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.addInitScript((key) => { window[key] = true }, DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL)
        await installMigrationRoutes(page, migrationFixture())
      },
      verify: async (page) => {
        assert.equal(await page.evaluate((key) => window[key], DEV_DATABASE_MIGRATION_RECOVERY_GLOBAL), true)
        await page.getByText('当前处于数据库迁移恢复模式', { exact: true }).waitFor()
        const nav = page.getByRole('navigation', { name: '开发页面导航' })
        for (const [label, pathname] of [
          ['项目文档', '/__dev/docs'],
          ['产品能力', '/__dev/product-core'],
          ['交互设计', '/__dev/ui-design'],
          ['数据库迁移', '/__dev/database-migration'],
        ]) {
          await nav.getByRole('link', { name: label, exact: true }).click()
          await expectHeading(page, label)
          assert.equal(new URL(page.url()).pathname, pathname)
          await assertNoHorizontalOverflow(page, `recovery-${label}`)
          await nav.getByRole('link', { name: label, exact: true }).click()
          assert.equal(new URL(page.url()).pathname, pathname)
          assert.equal(await nav.getAttribute('aria-busy'), null)
        }
        await page.goBack()
        await expectHeading(page, '交互设计')
        await page.goForward()
        await expectHeading(page, '数据库迁移')

        const deepLink = new URL('/__dev/docs?path=README.md#navigation', page.url()).href
        await page.goto(deepLink)
        await expectHeading(page, '项目文档')
        assert.equal(page.url(), deepLink)
        await page.reload()
        await expectHeading(page, '项目文档')
        assert.equal(page.url(), deepLink)
      },
    },
    {
      name: 'dev-delivery-task-navigation-desktop',
path: '/__dev/delivery',
viewport: { width: 1440, height: 900 },
      beforeNavigate: installDataPreparationContractFailureRoute,
      verify: async (page) => {
        await expectHeading(page, '交付运维')
        const tasks = page.getByRole('region', { name: '交付运维任务' })
        assert.equal(await tasks.locator('article').count(), 4)
        assert.equal(await tasks.getByRole('link').count(), 4)
        const guide = page.getByRole('region', { name: '发布上线的顺序' })
        assert.equal(await guide.isVisible(), false, '总览先展示任务入口，发布教程按需阅读')
        await page.getByText('发布顺序', { exact: true }).click()
        assert.equal(await guide.getByRole('listitem').count(), 3)
        await page.getByText('发布顺序', { exact: true }).click()
        await page.setViewportSize({ width: 1100, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-delivery-narrow-desktop')
        await page.setViewportSize({ width: 1440, height: 900 })
        for (const link of await tasks.getByRole('link').all()) assert.match(await link.getAttribute('href'), /customer=yoyoosun/u)
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 1)
        await page.locator('.erp-dev-environment-evidence').waitFor({ state: 'visible' })
        assert.equal(await tasks.isVisible(), false)
        const environmentTable = page.getByRole('table', { name: '环境证据对照表' })
        const environments = environmentTable.locator('tr[data-environment]')
        assert.equal(await environments.count(), 4)
        assert.equal(await environmentTable.getByRole('columnheader').count(), 6, '四类证据继续并排比较')
        const detailButton = environmentTable.getByRole('button', { name: '查看本地开发证据', exact: true })
        const detail = page.getByRole('region', { name: '本地开发证据详情', exact: true })
        assert.equal(await detail.isVisible(), false)
        const rowHeight = await environments.first().evaluate((element) => element.getBoundingClientRect().height)
        assert(rowHeight <= 120, '默认环境行不应被重复说明撑成长卡片')
        await detailButton.click()
        await detail.waitFor({ state: 'visible' })
        await detail.getByText('Release / SHA', { exact: true }).waitFor()
        await detail.getByText('人工验收', { exact: true }).waitFor()
        await page.getByRole('button', { name: '收起本地开发证据', exact: true }).click()
        assert.equal(await detail.isVisible(), false)
        await assertNoHorizontalOverflow(page, 'dev-delivery-environment-evidence')
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 0, true)
        await tasks.getByRole('link', { name: '检查客户配置' }).click()
        await expectHeading(page, '客户配置')
      },
    },
    {
      name: 'dev-customer-config-workspace-desktop',
      path: '/__dev/customer-config',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      expectedConsoleErrorPatterns: [/Failed to load resource:.*503/u],
      beforeNavigate: async (page) => {
        finishDryRun = null
        dryRunRequests = 0
        await page.route('**/__dev/api/customer-config/**', async (route) => {
          const { pathname } = new URL(route.request().url())
          const batch = route.request().postDataJSON()?.releaseBatch
          const missing = batch === LONG_RELEASE_BATCH
            ? Array.from({ length: 10 }, (_, index) => `缺少发布证据 ${index + 1}`)
            : []
          const body = pathname.endsWith('/session')
            ? { kind: 'plush.dev-customer-config-session', csrfToken: 'browser-config-csrf-token-fixture-32' }
            : pathname.endsWith('/release-batches') ? { batches: ['review-a', LONG_RELEASE_BATCH] }
              : pathname.endsWith('/release-readiness')
                ? { status: missing.length > 0 ? 'blocked' : 'ready', releaseBatch: batch, missing, generatedAt: '2026-10-17T02:00:00Z', summary: {} }
                : { operations: [{ action: 'release-readiness', status: 'passed', result: { releaseBatch: 'review-a', generatedAt: '2026-10-16T02:00:00Z' } }] }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        })
        await page.route('**/__dev/api/customer-import/dry-run', async (route) => {
          dryRunRequests += 1
          const heldRequest = new Promise((resolve) => { finishDryRun = resolve })
          await heldRequest
          await route.fulfill({
            status: dryRunRequests === 1 ? 503 : 200,
            contentType: 'application/json',
            body: JSON.stringify(dryRunRequests === 1 ? { message: '试跑失败' } : {
              generatedAt: '2026-10-22T02:00:00Z',
              outputPath: 'output/customer-import/browser-fixture',
              reportPath: 'output/customer-import/browser-fixture/report.json',
              summary: { totalSources: 3, blockerCount: 1, candidateCountsByAction: { create: 2 }, unresolvedCountsBySeverity: { block: 1 }, canExecuteRealImport: false },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '客户配置')
        const nav = page.getByRole('tablist', { name: '客户配置工作任务' })
        await page.getByRole('heading', { name: '配置如何上线', exact: true }).waitFor()
        const configurationFlow = page.getByRole('list', { name: '配置与部署的关系' })
        assert.equal(await configurationFlow.isVisible(), true, '总览直接显示上线交接流程')
        assert.equal(await configurationFlow.getByRole('listitem').count(), 3)
        assert.equal(await configurationFlow.evaluate((list) => Boolean(list.closest('details'))), false)
        assert.equal(await nav.getByRole('tab').count(), 6)
        assert.equal(await page.locator('.erp-dev-customer-step-footer').count(), 0)
        assert.equal(await page.getByRole('link', { name: '版本发布与部署', exact: true }).count(), 0)
        assert.equal(await nav.locator('.erp-dev-customer-step-number').count(), 5)
        const alignment = await nav.locator('.erp-dev-customer-step-label').evaluateAll((labels) => labels.filter((label) => label.querySelector('.erp-dev-customer-step-number')).map((label) => {
          const circle = label.firstElementChild.getBoundingClientRect()
          const text = label.lastElementChild.getBoundingClientRect()
          return Math.abs(circle.y + circle.height / 2 - text.y - text.height / 2)
        }))
        assert(alignment.every((offset) => offset <= 1), '步骤数字与标题中心对齐')
        await verifySlidingMotion(page, assert, '.erp-dev-customer-journey', 1)
        await page.setViewportSize({ width: 1280, height: 720 })
        const structure = page.getByRole('region', { name: '客户包结构', exact: true })
        const packageMap = structure.getByRole('group', { name: '客户包组成与去向' })
        const configRoute = packageMap.getByRole('button', { name: '后端配置', exact: true })
        const menuRoute = packageMap.getByRole('button', { name: '品牌与菜单', exact: true })
        const draftRoute = packageMap.getByRole('button', { name: '流程策略与评审草案', exact: true })
        const extensionRoute = packageMap.getByRole('button', { name: '扩展登记', exact: true })
        await packageMap.waitFor({ state: 'visible' })
        const structureBox = await packageMap.boundingBox()
        assert(structureBox && structureBox.y >= 0 && structureBox.y + structureBox.height <= 720, '四条去向在桌面首屏完整可读')
        await structure.getByText('包结构检查通过', { exact: true }).waitFor()
        await structure.getByText('目标环境未核验', { exact: true }).waitFor()
        assert.equal(await packageMap.getByRole('button', { expanded: true }).count(), 0, '首次进入只显示去向与关键数量')
        assert.match(await configRoute.innerText(), /18 个模块 · 7 列字段 · 9 个岗位 · 2 套打印默认值[\s\S]+编译正式清单[\s\S]+发布并激活[\s\S]+目标读回/u)
        assert.match(await menuRoute.innerText(), /13 个分组 · 27 个菜单项[\s\S]+前端展示/u)
        assert.match(await draftRoute.innerText(), /3 条策略草案 · 12 项字段 · 5 条编号规则[\s\S]+草案仅供预览/u)
        assert.match(await extensionRoute.innerText(), /0 项扩展声明\s+暂无扩展登记/u)
        await configRoute.press('Enter')
        const configDetails = structure.getByRole('region', { name: '本包后端配置', exact: true })
        await configDetails.waitFor()
        const configBox = await configDetails.boundingBox()
        const routeBox = await configRoute.boundingBox()
        assert(configBox && routeBox && configBox.y >= routeBox.y + routeBox.height - 1 && configBox.y + configBox.height <= 720, '明细紧跟所在去向')
        assert.match(await configDetails.innerText(), /18 个模块沿用产品默认（启用）/u)
        assert.match(await configDetails.innerText(), /7 列沿用产品默认（显示）/u)
        assert.match(await configDetails.innerText(), /采购合同：永绅；加工合同：永绅/u)
        assert.match(await configDetails.innerText(), /正式流程选择\s*6 项发布候选/u)
        await configRoute.press('Escape')
        await configDetails.waitFor({ state: 'hidden' })
        assert(await configRoute.evaluate((node) => node === document.activeElement), '关闭明细后焦点留在触发按钮')
        await menuRoute.click()
        const menuDetails = structure.getByRole('region', { name: '本包品牌与菜单', exact: true })
        await menuDetails.getByText('东莞市永绅玩具有限公司', { exact: true }).waitFor()
        const sections = page.getByRole('tablist', { name: '配置预检任务' })
        await extensionRoute.press('Enter')
        await page.waitForURL((url) => url.searchParams.get('section') === 'extensions')
        const extensionTab = sections.getByRole('tab', { name: '扩展登记', exact: true, selected: true })
        assert(await extensionTab.evaluate((node) => node === document.activeElement), '直达扩展登记后焦点进入对应页签')
        const extensionDetails = page.getByRole('region', { name: '本包扩展登记', exact: true })
        await extensionDetails.getByText('暂无扩展登记', { exact: true }).waitFor()
        await extensionDetails.getByText(/当前没有运行时扩展能力/u).waitFor()
        await menuDetails.waitFor({ state: 'hidden' })
        await extensionDetails.getByText('扩展登记的来源与清单', { exact: true }).click()
        const extensionTrace = extensionDetails.getByRole('region', { name: '配置来源与使用位置' })
        await extensionTrace.getByText('compiled_snapshot.extensionPointCatalog.extension_points', { exact: true }).waitFor()
        await extensionTrace.getByText('[]', { exact: true }).waitFor()
        await extensionTrace.getByText('发布 JSON · 仅评审', { exact: true }).waitFor()
        await page.goBack()
        await menuDetails.waitFor({ state: 'visible' })
        assert.equal(await packageMap.getByRole('button', { expanded: true }).count(), 1, '返回包结构保留原展开项')
        await menuRoute.press('Escape')
        await page.setViewportSize({ width: 800, height: 900 })
        assert(await configRoute.evaluate((node) => {
          const [source, , destination, caret] = node.children
          return source.getBoundingClientRect().bottom <= destination.getBoundingClientRect().top &&
            node.getBoundingClientRect().height >= 44 &&
            caret.getBoundingClientRect().right <= node.getBoundingClientRect().right &&
            node.scrollWidth <= node.clientWidth + 1
        }), '窄窗口中配置与去向纵向相接，完整保留点击区域')
        await assertNoHorizontalOverflow(page, 'dev-customer-config-package-narrow')
        await page.setViewportSize({ width: 1280, height: 720 })
        await sections.getByRole('tab', { name: '评审依据', exact: true }).click()
        const evidence = page.getByRole('region', { name: '配置校验', exact: true })
        await evidence.waitFor()
        await evidence.getByRole('table', { name: '配置校验明细', exact: true }).waitFor()
        assert.match(await evidence.innerText(), /已通过 \d+ 项/u)
        const preflight = page.getByRole('table', { name: '客户配置预检步骤' })
        await preflight.waitFor()
        assert.equal(await preflight.getByRole('columnheader').count(), 2)
        assert.equal(await preflight.locator('tbody tr:visible').count(), 5)
        assert.match(await preflight.getByRole('row', { name: /测试版页面试跑/u }).innerText(), /仅预览/u)
        assert.equal(await page.getByRole('region', { name: '配置字段说明', exact: true }).isVisible(), false, '源码和规则说明归到技术依据')
        const fieldToggle = page.getByText('技术依据', { exact: true })
        await fieldToggle.click()
        const guide = page.getByRole('region', { name: '配置字段说明', exact: true })
        const moduleFields = guide.getByRole('table', { name: '模块运行设置' })
        await moduleFields.getByText('moduleStates[].state', { exact: true }).waitFor()
        const fieldTrace = guide.getByRole('region', { name: '配置来源与使用位置' })
        const moduleTraceButton = moduleFields.getByRole('button', { name: '运行状态的来源与清单', exact: true })
        await moduleTraceButton.click()
        await fieldTrace.getByText('config/customers/yoyoosun/customerPackage.mjs', { exact: true }).waitFor()
        await fieldTrace.getByText('module_states[].state', { exact: true }).waitFor()
        await fieldTrace.getByText(/模块查询和页面、动作门禁/u).waitFor()
        await moduleTraceButton.click()
        await fieldTrace.waitFor({ state: 'hidden' })
        await guide.getByText('JSON 示例（非当前值）', { exact: true }).waitFor()
        assert(await moduleFields.getByRole('columnheader', { name: '类型与要求' }).evaluate((node) => {
          const style = getComputedStyle(node)
          const oneLine = [style.lineHeight, style.paddingTop, style.paddingBottom, style.borderBottomWidth].reduce((sum, value) => sum + Number.parseFloat(value), 0)
          return node.getBoundingClientRect().height <= oneLine + 1
        }), '字段类型表头在首屏保持一行')
        await chooseSelectOption(guide.getByRole('combobox', { name: '配置字段分类' }), { label: '列表与导出字段' })
        const visibilityFields = guide.getByRole('table', { name: '列表与导出字段' })
        await visibilityFields.getByText('fieldPolicyOverrides[].visible', { exact: true }).waitFor()
        await visibilityFields.getByRole('button', { name: '原因的来源与清单', exact: true }).click()
        await fieldTrace.getByText('不进入发布清单', { exact: true }).waitFor()
        assert.equal(await fieldTrace.getByText('customer-config-runtime-manifest.json', { exact: true }).count(), 0)
        assert.equal(await moduleFields.count(), 0, '切换字段分类只展示当前说明')
        await page.setViewportSize({ width: 1100, height: 900 })
        assert(await visibilityFields.evaluate((table) => table.scrollWidth <= table.clientWidth + 1), '窄窗口下完整字段说明可换行阅读')
        await assertNoHorizontalOverflow(page, 'dev-customer-config-package-details')
        await page.setViewportSize({ width: 1440, height: 900 })
        await chooseSelectOption(guide.getByRole('combobox', { name: '配置字段分类' }), { label: '品牌与菜单' })
        await guide.getByRole('button', { name: '公司名称的来源与清单', exact: true }).click()
        await fieldTrace.getByText('config/customers/yoyoosun/menuConfig.mjs', { exact: true }).waitFor()
        await fieldTrace.getByText('前端部署 JS', { exact: true }).waitFor()
        await fieldTrace.getByText('window.__PLUSH_ERP_CUSTOMER_CONFIG__.brand.companyName', { exact: true }).waitFor()
        await page.locator('.erp-dev-customer-package-guards .erp-dev-customer-guard-list').waitFor({ state: 'visible' })
        await fieldToggle.click()
        assert.equal(await guide.isVisible(), false, '收起技术依据后，主要校验结果仍在')
        assert.equal(await preflight.isVisible(), true)
        await page.getByRole('tab', { name: '运行设置', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('section') === 'runtime')
        const runtime = page.getByRole('region', { name: '模块运行设置', exact: true })
        await runtime.getByText('工作区候选 · 18 个模块均沿用产品默认（启用）', { exact: true }).waitFor()
        const moduleValues = runtime.getByRole('table', { name: '模块候选取值', exact: true })
        assert.equal(await moduleValues.locator('tbody tr:visible').count(), 18)
        assert.equal(await runtime.locator('details').count(), 0, '全部模块取值无需展开')
        assert.equal(await page.getByRole('table', { name: '打印默认方信息', exact: true }).locator('tbody tr:visible').count(), 2)
        await page.getByRole('tab', { name: '包结构', exact: true }).click()
        await draftRoute.click()
        await page.waitForURL((url) => url.searchParams.get('section') === 'flow')
        await page.goBack()
        await draftRoute.waitFor({ state: 'visible' })
        await draftRoute.click()
        const review = page.getByRole('region', { name: '本包的流程与策略', exact: true })
        const reviewGraph = review.locator('[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas svg')
        const drafts = review.getByRole('group', { name: '流程策略草案' })
        await drafts.getByRole('button', { name: '跳过策略', exact: true, pressed: true }).waitFor()
        assert.deepEqual(await drafts.getByRole('button').allTextContents(), ['跳过策略', '自动生成策略', '关闭策略'])
        await review.getByText('仅预览 · 不执行', { exact: true }).waitFor()
        const selection = review.getByRole('combobox', { name: '查看发布候选流程' })
        await selection.press('ArrowDown')
        const flowOptions = page.locator('.ant-select-dropdown:visible').getByRole('option')
        await flowOptions.first().waitFor()
        assert.equal(await flowOptions.count(), 6, '发布候选流程独立列出')
        await chooseSelectOption(selection, { label: '销售订单受理（审批 + 工程 + PMC）' })
        await reviewGraph.waitFor({ state: 'visible' })
        await review.getByRole('region', { name: '销售订单受理（审批 + 工程 + PMC）', exact: true }).waitFor()
        await review.getByText('发布候选 · 未核验目标', { exact: true }).waitFor()
        assert.doesNotMatch(await reviewGraph.textContent(), /engineering_data|order_review/u, '登记责任池按岗位名称展示')
        const strategyTrace = review.getByRole('region', { name: '配置来源与使用位置' })
        const strategyTraceToggle = review.getByText('当前条目的来源与清单', { exact: true })
        await strategyTraceToggle.click()
        await strategyTrace.getByText('compiled_snapshot.runtimeProcessSelections[0]', { exact: true }).waitFor()
        assert.match(await strategyTrace.locator('pre').innerText(), /approval_engineering_pmc/u)
        await chooseSelectOption(selection, { label: '物料供应（采购提交与审批）' })
        await review.getByRole('region', { name: '物料供应（采购提交与审批）', exact: true }).waitFor()
        await drafts.getByRole('button', { name: '关闭策略', exact: true }).click()
        await review.getByText('仅预览 · 不执行', { exact: true }).waitFor()
        await reviewGraph.getByRole('button', { name: '条件：必需节点完成后', exact: true }).waitFor()
        await reviewGraph.getByRole('button', { name: '结果：需要业务规则评审', exact: true }).waitFor()
        assert.equal(await strategyTrace.isVisible(), false, '切换条目不保留上一条的追溯状态')
        await strategyTraceToggle.click()
        await strategyTrace.getByText('compiled_snapshot.policyCatalog.process_policies[2]', { exact: true }).waitFor()
        await strategyTrace.getByText('发布 JSON · 仅评审', { exact: true }).waitFor()
        assert.match(await strategyTrace.locator('pre').innerText(), /close_after_required_nodes_done/u)
        await page.getByText('产品通用审批规则', { exact: true }).click()
        const policy = page.getByRole('region', { name: '销售与采购订单审批', exact: true })
        const graph = policy.locator('[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas svg')
        await graph.waitFor({ state: 'visible' })
        assert.match(await graph.textContent(), /人工审批/u)
        assert.match(await graph.textContent(), /按规则免审/u)
        assert.equal(await policy.getByRole('link', { name: /审批责任/u }).getAttribute('href'), '/erp/system/permissions?tab=approvals')
        await page.getByText('产品通用审批规则', { exact: true }).click()
        await page.setViewportSize({ width: 1100, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-customer-config-policy-narrow')
        await page.setViewportSize({ width: 1440, height: 900 })
        await nav.getByRole('tab', { name: /^核对变化/u }).click()
        await page.getByRole('table', { name: '客户配置变化对比' }).waitFor()
        await page.getByText(/18 个登记模块和 7 列字段无客户覆盖/u).waitFor()
        const badgeWidths = await page.getByRole('table', { name: '客户配置变化对比' }).locator('tbody .ant-tag').evaluateAll((tags) => tags.map((tag) => ({ tag: tag.getBoundingClientRect().width, cell: tag.parentElement.getBoundingClientRect().width })))
        assert(badgeWidths.length > 0 && badgeWidths.every((item) => item.tag < item.cell * 0.8), '状态标签保持内容宽度，不得拉满差异表列')
        await page.getByRole('columnheader', { name: '产品默认 / 现有实现', exact: true }).waitFor()
        const candidate = page.getByRole('table', { name: '模块与列表字段候选取值' })
        assert.deepEqual(
          await candidate.getByRole('row', { name: /销售订单 · 客户订单号/u }).getByRole('cell').allTextContents(),
          ['显示', '显示', '目录默认', '列表与 CSV']
        )
        await assertNoHorizontalOverflow(page, 'dev-customer-config-value-details')
        assert.equal(dryRunRequests, 0, '说明、策略图和差异查阅不运行样本试跑')
        await nav.getByRole('tab', { name: /^预览界面/u }).click()
        await page.getByText('菜单分组', { exact: true }).waitFor()
        const menu = page.getByRole('table', { name: '菜单分组与页面', exact: true })
        assert.equal(await menu.locator('tbody tr:visible').count(), 13)
        assert.equal(await menu.locator('li:visible').count(), 27, '所有菜单名称默认可读')
        assert.equal(await menu.locator('code').count(), 0)
        const menuKeys = page.getByRole('checkbox', { name: '显示菜单标识', exact: true })
        await menuKeys.check()
        await menu.getByText('global-dashboard', { exact: true }).waitFor()
        await menuKeys.uncheck()
        assert.equal(await menu.locator('code').count(), 0)
        for (const [name, count] of [['字段显示候选', 12], ['编号规则候选', 5], ['打印模板清单', 5]]) {
          assert.equal(await page.getByRole('table', { name, exact: true }).locator('tbody tr:visible').count(), count)
        }
        const print = page.getByRole('table', { name: '打印模板清单', exact: true })
        const evidenceButton = print.getByRole('button', { name: '加工合同字段依据', exact: true })
        await evidenceButton.press('Enter')
        const printEvidence = print.getByRole('region', { name: '加工合同字段依据', exact: true })
        await printEvidence.waitFor()
        assert.equal(await evidenceButton.getAttribute('aria-expanded'), 'true')
        await evidenceButton.click()
        await printEvidence.waitFor({ state: 'hidden' })
        assert.equal(await evidenceButton.getAttribute('aria-expanded'), 'false')
        await page.setViewportSize({ width: 1024, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-customer-config-preview')
        await page.setViewportSize({ width: 1440, height: 900 })
        await verifySlidingMotion(page, assert, '.erp-dev-customer-journey', 4, true)
        const runButton = page.getByRole('button', { name: '运行样本试跑', exact: true })
        assert.deepEqual(await page.getByRole('list', { name: '样本试跑路径', exact: true }).locator('li').allTextContents(), ['固定样本', '匹配与校验', '本机评审报告'])
        const runBox = await runButton.boundingBox()
        assert(runBox && runBox.y < 700, '试跑入口必须在桌面首屏可见')
        const requestReached = page.waitForRequest((request) => request.url().endsWith('/customer-import/dry-run'), { timeout: 10000 })
        await runButton.click()
        await requestReached
        await page.getByText('试跑正在生成', { exact: true }).waitFor()
        for (const tab of await nav.getByRole('tab').all()) assert.equal(await tab.isDisabled(), true)
        for (const tab of await page.getByRole('tablist', { name: '配置验证方式' }).getByRole('tab').all()) assert.equal(await tab.isDisabled(), true)
        await page.getByText('配置操作进行中，客户包已锁定；离开页面不会撤销操作。', { exact: true }).waitFor()
        assert.equal(typeof finishDryRun, 'function')
        finishDryRun()
        await page.locator('.erp-dev-customer-workspace .ant-alert-error').getByText('试跑生成失败', { exact: true }).waitFor()
        assert.equal(await runButton.isDisabled(), false)
        assert.equal(dryRunRequests, 1, '失败后不能自动重复试跑')
        const retryReached = page.waitForRequest((request) => request.url().endsWith('/customer-import/dry-run'))
        await runButton.click()
        await retryReached
        finishDryRun()
        await page.getByText('样本试跑报告已生成', { exact: true }).waitFor()
        const report = page.locator('.erp-dev-customer-dry-run-result')
        assert.equal(await report.getByRole('button', { name: '查看报告摘要' }).count(), 0)
        assert.equal(await report.locator('details').count(), 1)
        await report.getByText('报告详情', { exact: true }).click()
        await report.getByText('阻塞 1 / 延后 0 / 复核 0', { exact: true }).waitFor()
        assert.equal(await report.locator('.ant-typography-copy').count(), 2)
        await report.getByText('报告详情', { exact: true }).click()
        assert.equal(await report.getByText('未决队列', { exact: true }).isVisible(), false)
        assert.equal(dryRunRequests, 2, '报告展开和收起不重复试跑')
        await page.getByRole('tab', { name: '本地配置应用', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('action') === 'test-apply')
        await page.reload()
        assert.equal(await page.getByRole('tab', { name: '本地配置应用', exact: true }).getAttribute('aria-selected'), 'true')
        assert.deepEqual(await page.getByRole('list', { name: '本地配置应用路径', exact: true }).locator('li').allTextContents(), ['编译候选清单', '写入登记的本地开发库', '读回有效配置'])
        await page.getByRole('button', { name: '应用本地配置', exact: true }).click()
        await page.getByRole('dialog', { name: '确认应用测试配置？', exact: true }).waitFor()
        await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
        await assertNoHorizontalOverflow(page, 'dev-customer-config-test-apply')
        await nav.getByRole('tab', { name: /^发布交接/u }).click()
        const batchSelect = page.getByRole('combobox', { name: '选择发布证据批次' })
        const releasePath = page.getByRole('list', { name: '发布检查与交接路径', exact: true })
        const executor = page.getByRole('button', { name: '复制配置执行器模板', exact: true })
        assert.equal(await executor.count(), 0)
        await batchSelect.press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText('review-a', { exact: true }).click()
        await page.getByText('所选批次有历史检查记录，请重新检查当前工作区。', { exact: true }).waitFor()
        assert.match(await releasePath.innerText(), /历史检查，待复核.*待通过本次检查/su)
        assert.equal(await executor.count(), 0, '历史成功不能开放当前执行器输入')
        await page.getByRole('button', { name: '重新检查发布条件', exact: true }).click()
        await page.getByText('选定批次的发布门禁已通过', { exact: true }).waitFor()
        assert.match(await releasePath.innerText(), /本次检查通过.*可以交接/su)
        assert.equal(await executor.isDisabled(), false)
        await batchSelect.press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(LONG_RELEASE_BATCH, { exact: true }).click()
        assert.equal(await executor.count(), 0, '切换批次必须使上一批次的成功失效')
        await page.getByRole('button', { name: '检查发布条件', exact: true }).click()
        await page.getByText('发布门禁未通过', { exact: true }).waitFor()
        await page.getByText('缺少发布证据 10', { exact: true }).waitFor()
        assert.match(await releasePath.innerText(), /条件未通过.*待通过本次检查/su)
        assert.equal(await executor.count(), 0, '缺证据时不能交接执行器')
        await assertNoHorizontalOverflow(page, 'dev-customer-config-release')
        await page.route('**/__dev/api/customer-config/release-batches*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ batches: [] }) }))
        await page.reload()
        await page.getByText('还没有登记发布证据批次', { exact: true }).waitFor()
        assert.equal(await batchSelect.count(), 0)
        assert.equal(await page.getByRole('button', { name: /检查发布条件/u }).count(), 0)
        await page.getByRole('button', { name: '刷新批次', exact: true }).click()
        await page.getByText('还没有登记发布证据批次', { exact: true }).waitFor()
        await page.setViewportSize({ width: 1100, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-customer-config-narrow-desktop')
        await page.setViewportSize({ width: 1440, height: 900 })
        const missing = new URL(page.url())
        missing.searchParams.set('customer', 'unregistered-customer')
        await page.goto(missing.href)
        await page.getByText(/未登记客户配置包：unregistered-customer/u).waitFor()
        const selector = page.getByRole('combobox', { name: '客户包选择' })
        await selector.focus()
        await selector.press('ArrowDown')
        await selector.press('Enter')
        await page.getByRole('tablist', { name: '客户配置工作任务' }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('customer'), 'yoyoosun')
        assert.equal(await nav.getByRole('tab', { name: /^发布交接/u }).getAttribute('aria-selected'), 'true')
        assert.equal(await page.getByText(/未登记客户配置包：unregistered-customer/u).count(), 0)
        await page.setViewportSize({ width: 1920, height: 1080 })
        await nav.getByRole('tab', { name: /^检查配置/u }).click()
        await page.waitForURL((url) => url.searchParams.get('view') === 'preflight')
        await page.reload()
        await packageMap.waitFor({ state: 'visible' })
        assert.equal(await packageMap.getByRole('button', { expanded: true }).count(), 0, '刷新后直接显示去向并收起明细')
        await page.getByRole('tab', { name: '评审依据', exact: true }).click()
        await fieldToggle.click()
        await moduleTraceButton.click()
        await fieldTrace.getByText('module_states[].state', { exact: true }).waitFor()
      },
    },
    {
      name: 'dev-database-migration-workspace-desktop',
path: '/__dev/database-migration',
viewport: { width: 1440, height: 900 },
      expectedConsoleErrorPatterns: [/Failed to load resource:.*503/u],
      beforeNavigate: async (page) => {
        migration = migrationFixture()
        migration.summary.tools.status = 'blocked'
        migration.summary.tools.checks[1] = { key: 'atlas', label: 'Atlas', status: 'blocked', message: '迁移工具暂不可用，请先修复工具' }
        await installMigrationRoutes(page, migration)
      },
      verify: async (page) => {
        await expectHeading(page, '数据库迁移')
        const header = page.locator('.erp-dev-page-header')
        const scope = page.getByRole('region', { name: '数据库迁移范围' })
        await scope.getByText('共享开发库', { exact: true }).waitFor()
        const navigationBox = await header.getByRole('tablist', { name: '数据库迁移视图' }).boundingBox()
        const headerBox = await header.boundingBox()
        assert(navigationBox && headerBox && navigationBox.x >= headerBox.x && navigationBox.x + navigationBox.width <= headerBox.x + headerBox.width && Math.abs(navigationBox.y + navigationBox.height / 2 - headerBox.y - headerBox.height / 2) <= 1, '迁移页签在共享页头内垂直居中且不溢出')
        const prepare = page.getByRole('button', { name: '检查并准备', exact: true })
        await page.waitForFunction(() => document.querySelector('header [role=status]')?.textContent.includes('已核对'))
        assert.equal(await prepare.isDisabled(), true)
        const boundaries = page.getByText('查看事务与恢复边界', { exact: true })
        const diagram = page.getByRole('region', { name: '数据库完整升级流程图画布', exact: true, includeHidden: true })
        const steps = page.getByText('查看升级步骤', { exact: true })
        await steps.click()
        assert.equal(await boundaries.isVisible(), true, '收起步骤后仍可直接查看事务与恢复边界')
        assert.equal(await diagram.count(), 0, '默认不挂载补充流程图')
        await steps.click()
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 1)
        await page.getByText('迁移工具暂不可用，请先修复工具', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-migration-tools-blocked')
        migration.summary.tools.status = 'ready'
        migration.summary.tools.checks[1] = { key: 'atlas', label: 'Atlas', status: 'passed', message: '已就绪' }
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        assert.equal(await prepare.isVisible(), false, '运行检查不重复提供迁移准备动作')
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 0, true)
        await prepare.waitFor({ state: 'visible' })
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === '检查并准备' && !button.disabled))
        await prepare.click()
        const confirm = page.getByRole('button', { name: '确认升级并重启', exact: true })
        await confirm.waitFor({ state: 'visible' })
        assert.equal(await page.getByRole('button', { name: '查看当前操作', exact: true }).count(), 0)
        const path = page.getByRole('region', { name: '数据库升级步骤' })
        assert.equal(await path.getByRole('listitem').count(), 6)
        const alignment = await path.locator('li').evaluateAll((items) => items.map((item) => { const number = item.querySelector('.erp-dev-delivery-path__number').getBoundingClientRect(); const title = item.querySelector('.erp-dev-delivery-path__title').getBoundingClientRect(); return Math.abs(number.y + number.height / 2 - title.y - title.height / 2) }))
        assert(alignment.every((offset) => offset <= 1), '升级步骤编号与标题中心对齐')
        await page.setViewportSize({ width: 1100, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-migration-numbered-path-narrow')
        await page.setViewportSize({ width: 1440, height: 900 })
        await page.getByRole('tab', { name: '操作记录', exact: true }).click()
        assert.equal(await page.getByRole('status').filter({ hasText: '当前数据库升级' }).isVisible(), true)
        await page.getByRole('button', { name: '查看当前操作', exact: true }).click()
        await confirm.click()
        const dialog = page.getByRole('dialog', { name: '确认升级共享开发库', exact: true })
        const execute = dialog.getByRole('button', { name: '确认升级并重启', exact: true })
        assert.equal(await execute.isDisabled(), true)
        await dialog.getByRole('textbox', { name: '数据库升级确认文本' }).fill('错误文本')
        assert.equal(await execute.isDisabled(), true)
        await dialog.getByRole('textbox', { name: '数据库升级确认文本' }).fill(migration.operation.confirmationPrompt)
        assert.equal(await execute.isDisabled(), false)
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.deepEqual(migration.actions.map((action) => action.action), ['prepare'])
        migration.summary.operations = [{ ...migration.operation, status: 'passed', terminal: true }]
        migration.summary.target = { ...migration.summary.target, currentVersion: migration.summary.target.latestVersion, pendingFiles: 0 }
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await page.getByRole('tab', { name: '数据库升级', exact: true }).click()
        const completedPath = page.getByRole('region', { name: '数据库升级步骤' })
        const lastUpgrade = page.getByText('最近一次升级', { exact: true })
        await lastUpgrade.waitFor()
        assert.equal(await page.getByRole('button', { name: '无需迁移', exact: true }).count(), 0)
        assert.equal(await prepare.count(), 0)
        await completedPath.waitFor({ state: 'visible' })
        assert.equal(await completedPath.locator('li').count(), 6)
        await lastUpgrade.click()
        assert.equal(await completedPath.isVisible(), false, '默认展开后仍可手动收起')
        await boundaries.click()
        await diagram.locator('svg').waitFor({ state: 'visible' })
        for (const label of ['提交前失败：', '提交后验证失败：', '提交结果不明：']) {
          await page.getByText(label, { exact: true }).waitFor({ state: 'visible' })
        }
        await page.setViewportSize({ width: 1100, height: 900 })
        await assertNoHorizontalOverflow(page, 'dev-migration-boundaries-narrow')
        await boundaries.press('Enter')
        await diagram.waitFor({ state: 'detached' })
        await page.setViewportSize({ width: 1440, height: 900 })
        await lastUpgrade.click()
        await completedPath.waitFor({ state: 'visible' })
        await page.getByRole('button', { name: '查看运行检查', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('view') === 'runtime')
        await page.locator('#dev-migration-panel-runtime').waitFor({ state: 'visible' })
        assert.equal(await page.getByRole('tab', { name: '运行检查', exact: true }).getAttribute('aria-selected'), 'true')
        await page.getByRole('tab', { name: '数据库升级', exact: true }).click()
        await completedPath.waitFor({ state: 'visible' })
        migration.summary.operations = []
        migration.summary.target = { ...migration.summary.target, currentVersion: migration.summary.target.latestVersion, pendingFiles: 0 }
        migration.summary.runtime.available = false
        migration.summary.runtime.health = { status: 'unavailable', httpCode: null }
        migration.summary.runtime.ready = { status: 'unavailable', httpCode: null }
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await page.getByText(/迁移已完成，服务尚未恢复/u).waitFor()
        await page.getByRole('tab', { name: '运行检查', exact: true }).click()
        const restart = page.getByRole('button', { name: '恢复已验证后端', exact: true })
        assert.equal(await restart.isDisabled(), false)
        migration.failReads = true
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await page.getByText('最新状态核对失败', { exact: true }).waitFor()
        assert.equal(await restart.isDisabled(), true)
        await assertNoHorizontalOverflow(page, 'dev-migration-failed-refresh')
        migration.failReads = false
        migration.summary.readOnly = true
        await page.reload()
        await page.getByText('局域网只读查看', { exact: true }).waitFor()
        assert.equal(await page.getByRole('tab', { name: '运行检查', exact: true }).getAttribute('aria-selected'), 'true')
        assert.equal(await restart.isDisabled(), true)
        assert.deepEqual(migration.actions.map((action) => action.action), ['prepare'])
      },
    },
  ]
}
