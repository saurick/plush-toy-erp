import { validateDatabaseMigrationSummary } from '../../src/dev-workbench/config/devDatabaseMigration.mjs'
import { installDataPreparationContractFailureRoute } from './devVersionCenterScenarios.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'

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
        await expectHeading(page, '交付运行')
        const tasks = page.getByRole('table', { name: '交付运行任务' })
        assert.equal(await tasks.locator('tbody tr').count(), 4)
        assert.equal(await tasks.getByRole('link').count(), 4)
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 1)
        await page.locator('.erp-dev-environment-evidence').waitFor({ state: 'visible' })
        assert.equal(await tasks.isVisible(), false)
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
          const body = pathname.endsWith('/session') ? { kind: 'plush.dev-customer-config-session', csrfToken: 'browser-config-csrf-token-fixture-32' }
            : pathname.endsWith('/release-batches') ? { batches: [] } : { operations: [] }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        })
        await page.route('**/__dev/api/customer-import/dry-run', async (route) => {
          dryRunRequests += 1
          const heldRequest = new Promise((resolve) => { finishDryRun = resolve })
          await heldRequest
          await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '试跑失败' }) })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '客户配置')
        const nav = page.getByRole('tablist', { name: '客户配置工作任务' })
        await verifySlidingMotion(page, assert, '.erp-dev-customer-journey', 1)
        const preflight = page.getByRole('table', { name: '客户配置预检步骤' })
        await preflight.waitFor()
        assert.match(await preflight.getByRole('row', { name: /测试版页面试跑/u }).innerText(), /仅预览/u)
        await page.getByText('配置包边界', { exact: true }).click()
        await page.locator('.erp-dev-customer-guard-list').waitFor({ state: 'visible' })
        await assertNoHorizontalOverflow(page, 'dev-customer-config-package-details')
        await page.getByText('配置包边界', { exact: true }).click()
        await page.getByText('客户包对象', { exact: true }).click()
        await page.getByText('只读取已登记配置对象，不接收任意代码、SQL 或业务事实', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '运行投影', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('section') === 'runtime')
        await page.getByRole('tab', { name: '查看变化', exact: true }).click()
        await page.getByText('差异对比 / Diff Preview', { exact: true }).waitFor()
        await page.getByRole('tab', { name: '页面配置预览', exact: true }).click()
        await page.getByText('菜单分组 / Menu Groups', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-customer-config-preview')
        await verifySlidingMotion(page, assert, '.erp-dev-customer-journey', 4, true)
        const runButton = page.getByRole('button', { name: '运行测试试跑', exact: true })
        const runBox = await runButton.boundingBox()
        assert(runBox && runBox.y < 650, '试跑入口必须在桌面首屏可见')
        const requestReached = page.waitForRequest((request) => request.url().endsWith('/customer-import/dry-run'), { timeout: 10000 })
        await runButton.click()
        await requestReached
        await page.getByText('试跑正在生成', { exact: true }).waitFor()
        for (const tab of await nav.getByRole('tab').all()) assert.equal(await tab.isDisabled(), true)
        for (const tab of await page.getByRole('tablist', { name: '配置执行任务' }).getByRole('tab').all()) assert.equal(await tab.isDisabled(), true)
        assert.equal(await page.getByRole('combobox', { name: '客户包选择' }).isDisabled(), true)
        assert.equal(typeof finishDryRun, 'function')
        finishDryRun()
        await page.locator('.erp-dev-customer-workspace .ant-alert-error').getByText('试跑生成失败', { exact: true }).waitFor()
        assert.equal(await runButton.isDisabled(), false)
        assert.equal(dryRunRequests, 1, '失败后不能自动重复试跑')
        await page.getByRole('tab', { name: '应用测试配置', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('action') === 'test-apply')
        await page.reload()
        assert.equal(await page.getByRole('tab', { name: '应用测试配置', exact: true }).getAttribute('aria-selected'), 'true')
        await page.getByRole('button', { name: '应用到当前后端', exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-customer-config-test-apply')
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
        assert.equal(await page.getByRole('tab', { name: '应用测试配置', exact: true }).getAttribute('aria-selected'), 'true')
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
        const prepare = page.getByRole('button', { name: '检查并准备', exact: true })
        await page.waitForFunction(() => document.querySelector('header [role=status]')?.textContent.includes('已核对'))
        assert.equal(await prepare.isDisabled(), true)
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 1)
        await page.getByText('迁移工具暂不可用，请先修复工具', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'dev-migration-tools-blocked')
        migration.summary.tools.status = 'ready'
        migration.summary.tools.checks[1] = { key: 'atlas', label: 'Atlas', status: 'passed', message: '已就绪' }
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await prepare.waitFor({ state: 'visible' })
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === '检查并准备' && !button.disabled))
        await verifySlidingMotion(page, assert, '.erp-dev-delivery-taskbar', 0, true)
        await prepare.click()
        const confirm = page.getByRole('button', { name: '确认升级并重启', exact: true })
        await confirm.waitFor({ state: 'visible' })
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
