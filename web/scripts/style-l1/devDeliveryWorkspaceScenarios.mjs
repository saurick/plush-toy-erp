import { validateDatabaseMigrationSummary } from '../../src/dev-workbench/config/devDatabaseMigration.mjs'
import { installDataPreparationContractFailureRoute } from './devVersionCenterScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

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
      expectedConsoleErrorPatterns: [/Failed to load resource:.*503/u],
      beforeNavigate: async (page) => {
        finishDryRun = null
        dryRunRequests = 0
        await page.route('**/__dev/api/customer-config/**', async (route) => {
          const { pathname } = new URL(route.request().url())
          const body = pathname.endsWith('/session')
            ? { kind: 'plush.dev-customer-config-session', csrfToken: 'browser-config-csrf-token-fixture-32' }
            : pathname.endsWith('/release-batches') ? { batches: ['review-a', LONG_RELEASE_BATCH] }
              : pathname.endsWith('/release-readiness')
                ? { status: 'ready', releaseBatch: route.request().postDataJSON().releaseBatch, generatedAt: '2026-10-17T02:00:00Z', summary: {} }
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
        const configurationFlow = page.getByRole('list', { name: '配置与部署的关系' })
        assert.equal(await configurationFlow.isVisible(), false)
        await page.getByText('配置如何上线', { exact: true }).click()
        assert.equal(await configurationFlow.getByRole('listitem').count(), 3)
        await page.getByText('配置如何上线', { exact: true }).click()
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
        const preflight = page.getByRole('table', { name: '客户配置预检步骤' })
        await preflight.waitFor()
        assert.equal(await preflight.getByRole('columnheader').count(), 2)
        assert.equal(await preflight.locator('tbody tr').count(), 5)
        assert.equal(await page.locator('.erp-dev-customer-guard-list').isVisible(), false)
        assert.match(await preflight.getByRole('row', { name: /测试版页面试跑/u }).innerText(), /仅预览/u)
        await page.getByText('配置范围与依据', { exact: true }).click()
        await page.locator('.erp-dev-customer-guard-list').waitFor({ state: 'visible' })
        await assertNoHorizontalOverflow(page, 'dev-customer-config-package-details')
        await page.getByText('配置范围与依据', { exact: true }).click()
        await page.getByRole('tab', { name: '运行设置', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('section') === 'runtime')
        await nav.getByRole('tab', { name: /^核对变化/u }).click()
        await page.getByRole('table', { name: '客户配置变化对比' }).waitFor()
        const badgeWidths = await page.getByRole('table', { name: '客户配置变化对比' }).locator('tbody .ant-tag').evaluateAll((tags) => tags.map((tag) => ({ tag: tag.getBoundingClientRect().width, cell: tag.parentElement.getBoundingClientRect().width })))
        assert(badgeWidths.length > 0 && badgeWidths.every((item) => item.tag < item.cell * 0.8), '状态标签保持内容宽度，不得拉满差异表列')
        await page.getByRole('columnheader', { name: '产品默认 / 现有实现', exact: true }).waitFor()
        await nav.getByRole('tab', { name: /^预览界面/u }).click()
        await page.getByText('菜单分组', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-customer-config-preview')
        await verifySlidingMotion(page, assert, '.erp-dev-customer-journey', 4, true)
        const runButton = page.getByRole('button', { name: '运行样本试跑', exact: true })
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
        await report.locator('pre').getByText(/试跑报告摘要/u).waitFor()
        assert.equal(await report.locator('.ant-typography-copy').count(), 2)
        await report.getByText('报告详情', { exact: true }).click()
        assert.equal(await report.locator('pre').isVisible(), false)
        assert.equal(dryRunRequests, 2, '报告展开和收起不重复试跑')
        await page.getByRole('tab', { name: '本地配置应用', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('action') === 'test-apply')
        await page.reload()
        assert.equal(await page.getByRole('tab', { name: '本地配置应用', exact: true }).getAttribute('aria-selected'), 'true')
        await page.getByRole('button', { name: '应用本地配置', exact: true }).click()
        await page.getByRole('dialog', { name: '确认应用测试配置？', exact: true }).waitFor()
        await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
        await assertNoHorizontalOverflow(page, 'dev-customer-config-test-apply')
        await nav.getByRole('tab', { name: /^发布交接/u }).click()
        const batchSelect = page.getByRole('combobox', { name: '选择发布证据批次' })
        const executor = page.getByRole('button', { name: '复制配置执行器模板', exact: true })
        assert.equal(await executor.count(), 0)
        await batchSelect.press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText('review-a', { exact: true }).click()
        await page.getByText('所选批次有历史检查记录，请重新检查当前工作区。', { exact: true }).waitFor()
        assert.equal(await executor.count(), 0, '历史成功不能开放当前执行器输入')
        await page.getByRole('button', { name: '重新检查发布条件', exact: true }).click()
        await page.getByText('选定批次的发布门禁已通过', { exact: true }).waitFor()
        assert.equal(await executor.isDisabled(), false)
        await batchSelect.press('ArrowDown')
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').getByText(LONG_RELEASE_BATCH, { exact: true }).click()
        assert.equal(await executor.count(), 0, '切换批次必须使上一批次的成功失效')
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
        const scope = page.getByRole('region', { name: '数据库迁移范围' })
        const navigationBox = await scope.getByRole('tablist', { name: '数据库迁移视图' }).boundingBox()
        const scopeBox = await scope.boundingBox()
        assert(navigationBox && scopeBox && navigationBox.x >= scopeBox.x && navigationBox.x + navigationBox.width <= scopeBox.x + scopeBox.width && Math.abs(navigationBox.y + navigationBox.height / 2 - scopeBox.y - scopeBox.height / 2) <= 1, '迁移页签在同一范围栏内垂直居中且不溢出')
        const prepare = page.getByRole('button', { name: '检查并准备', exact: true })
        await page.waitForFunction(() => document.querySelector('header [role=status]')?.textContent.includes('已核对'))
        assert.equal(await prepare.isDisabled(), true)
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
        assert.equal(await completedPath.isVisible(), false)
        await lastUpgrade.click()
        await completedPath.waitFor({ state: 'visible' })
        assert.equal(await completedPath.locator('li').count(), 6)
        await lastUpgrade.click()
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
