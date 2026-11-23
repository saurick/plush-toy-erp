import { readFile } from 'node:fs/promises'
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
      name: 'dev-customer-config-json-desktop',
      path: '/__dev/customer-config?customer=yoyoosun',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.route('**/__dev/api/customer-config/release-batches*', (route) => route.fulfill({ json: { batches: [] } }))
        await page.route('**/__dev/api/customer-config/operations*', (route) => route.fulfill({ json: { operations: [] } }))
      },
      verify: async (page) => {
        await expectHeading(page, '客户配置')
        const trigger = page.getByRole('button', { name: '查看配置声明', exact: true })
        const panel = page.getByRole('region', { name: '配置声明', exact: true })
        const tableTab = panel.getByRole('tab', { name: '表格视图', exact: true })
        const jsonTab = panel.getByRole('tab', { name: 'JSONC', exact: true })
        const table = panel.getByRole('table', { name: '客户包声明', exact: true })
        const search = panel.getByRole('textbox', { name: '搜索配置声明', exact: true })
        const sourceFilter = panel.getByRole('combobox', { name: '配置来源', exact: true })
        const locate = table.getByRole('button', { name: /^定位 JSONC：/u })
        const preview = panel.getByLabel('JSON 内容预览', { exact: true })
        const locatedLine = preview.locator('.erp-dev-customer-json-location')
        const jsonFromPreview = () => preview.locator('code').evaluate((code) => {
          const original = code.cloneNode(true)
          original.querySelectorAll('.erp-dev-customer-json-comment').forEach((comment) => comment.remove())
          return original.textContent
        })
        const meanings = panel.getByRole('switch', { name: '显示字段含义', exact: true })
        const downloadButton = panel.getByRole('button', { name: '下载 JSON', exact: true })
        const downloadJson = async (filename, originalJson) => {
          const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 15000 }),
            downloadButton.click(),
          ])
          assert.equal(download.suggestedFilename(), filename)
          const json = await readFile(await download.path(), 'utf8')
          assert.equal(json, originalJson)
          return JSON.parse(json)
        }

        const filter = page.getByRole('checkbox', { name: '只看客户单独设置', exact: true })
        await filter.uncheck()
        await trigger.click()
        await table.waitFor()
        assert.equal(new URL(page.url()).searchParams.get('detail'), 'export')
        assert.equal(await tableTab.getAttribute('aria-selected'), 'true')
        assert.equal(await locate.count(), 20)
        await panel.getByRole('button', { name: '下一页', exact: true }).click()
        await search.fill('buyerCompany')
        await search.press('Enter')
        await table.getByText('"永绅"', { exact: true }).first().waitFor()
        assert.equal(await locate.count(), 2)
        const processingBuyer = table.getByRole('row').filter({ hasText: 'templateKey = processing-contract' })
        await processingBuyer.getByRole('button', { name: /^定位 JSONC：/u }).click()
        assert.equal(await jsonTab.getAttribute('aria-selected'), 'true')
        await preview.locator('.erp-dev-customer-json-location:focus').waitFor()
        assert.match(await locatedLine.textContent(), /"buyerCompany": "永绅",? {2}\/\/ 加工合同/u)
        assert(await locatedLine.evaluate((line) => {
          const rect = line.getBoundingClientRect()
          return rect.top >= 0 && rect.bottom <= window.innerHeight
        }), '定位后对应的 JSONC 行进入视口')
        await tableTab.click()
        assert.equal(await search.inputValue(), 'buyerCompany')
        await processingBuyer.locator('button:focus').waitFor()
        await chooseSelectOption(sourceFilter, { label: 'menuConfig.mjs' })
        await panel.getByText('没有匹配的配置字段', { exact: true }).waitFor()
        await panel.getByRole('button', { name: '清除筛选', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('input[aria-label="搜索配置声明"]')?.value === '')
        await table.waitFor()
        assert.equal(await locate.count(), 20)

        await jsonTab.click()
        await preview.waitFor()
        assert.equal(await panel.getByRole('radio').count(), 0)
        assert.equal(await meanings.getAttribute('aria-checked'), 'true')
        const yoyoAnnotated = await preview.textContent()
        assert.match(yoyoAnnotated, /^\{\n {2}"[^"]+\/customerPackage\.mjs": \{\n {4}"customerKey": "yoyoosun", {2}\/\/ 客户标识/u)
        assert.match(yoyoAnnotated, /"buyerCompany": "永绅",? {2}\/\/ 采购合同/u)
        assert.match(yoyoAnnotated, /"buyerCompany": "永绅",? {2}\/\/ 加工合同/u)
        assert.match(yoyoAnnotated, /"brandMark": "永",? {2}\/\/ 品牌简称/u)
        const customerKeyComment = preview.locator('.erp-dev-customer-json-comment').filter({ hasText: /\/\/ 客户标识。/u })
        const rightOfSource = await customerKeyComment.evaluate((comment) => {
          const source = comment.previousSibling
          const range = document.createRange()
          range.setStart(source, source.textContent.lastIndexOf('\n') + 1)
          range.setEnd(source, source.textContent.length)
          const codeRect = range.getBoundingClientRect()
          const commentRect = comment.getBoundingClientRect()
          return Math.abs(codeRect.top - commentRect.top) <= 1 && commentRect.left >= codeRect.right - 1
        })
        assert(rightOfSource, '桌面上字段值和注释同行，注释在右侧')
        const yoyoSourceText = await jsonFromPreview()
        await meanings.press('Space')
        assert.equal(await meanings.getAttribute('aria-checked'), 'false')
        const yoyoJson = await preview.textContent()
        assert.equal(yoyoJson, yoyoSourceText)
        await meanings.press('Space')
        const yoyoSource = await downloadJson('yoyoosun-配置声明.json', yoyoJson)
        assert.equal(Object.hasOwn(yoyoSource['config/customers/yoyoosun/customerPackage.mjs'], 'moduleStates'), false)
        assert.equal(yoyoSource['config/customers/yoyoosun/menuConfig.mjs'].brand.brandMark, '永')
        await meanings.press('Space')
        assert.equal(await preview.textContent(), yoyoJson)

        await panel.getByRole('button', { name: '返回配置核对', exact: true }).click()
        await trigger.waitFor()
        assert.equal(await trigger.evaluate((button) => button === document.activeElement), true)
        assert.equal(await filter.isChecked(), false)
        await trigger.click()
        const customer = page.getByRole('combobox', { name: '客户包选择' })
        await chooseSelectOption(customer, { label: '标准样例毛绒制造有限公司（工程参考）' })
        await panel.getByText('reference-customer-配置声明.json', { exact: true }).waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(await tableTab.getAttribute('aria-selected'), 'true')
        assert.equal(await sourceFilter.count(), 0)
        await search.fill('supplier_type false')
        await search.press('Enter')
        await table.getByText('false', { exact: true }).waitFor()
        assert.equal(await locate.count(), 1)
        await assertNoHorizontalOverflow(page, '配置声明表格 390px')
        await locate.click()
        assert.match(await locatedLine.textContent(), /"visible": false/u)
        assert.equal(await meanings.getAttribute('aria-checked'), 'true')
        const referenceAnnotated = await preview.textContent()
        assert.match(referenceAnnotated, /"fieldKey": "supplier_type",\n +"visible": false,? {2}\/\/ [^\n]*供应商分类。隐藏/u)
        assert.doesNotMatch(referenceAnnotated, /"brandMark"/u)
        const referenceSourceText = await jsonFromPreview()
        await meanings.click()
        const referenceJson = await preview.textContent()
        assert.equal(referenceJson, referenceSourceText)
        await meanings.click()
        assert.equal(await preview.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true)
        const referenceSource = await downloadJson('reference-customer-配置声明.json', referenceJson)
        const referencePath = 'config/customers/reference-customer/customerPackage.mjs'
        assert.deepEqual(Object.keys(referenceSource), [referencePath])
        assert.equal(referenceSource[referencePath].fieldPolicyOverrides[0].visible, false)
        await assertNoHorizontalOverflow(page, '配置声明 JSON 390px')
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
        const nav = page.getByRole('tablist', { name: '客户配置工作任务', exact: true })
        const sections = page.getByRole('tablist', { name: '配置核对内容', exact: true })
        const validationTab = nav.getByRole('tab', { name: '本地验证', exact: true })
        const validationPanel = page.getByRole('tabpanel', { name: '本地验证', exact: true })
        const closeDialog = async (dialog) => {
          await dialog.getByRole('button', { name: 'Close', exact: true }).press('Escape')
          await dialog.waitFor({ state: 'hidden' })
          await page.locator('.erp-dev-customer-dialog .ant-modal-wrap:visible').waitFor({ state: 'hidden' })
        }
        const customerSelector = page.getByRole('combobox', { name: '客户包选择' })
        assert.deepEqual(await nav.getByRole('tab').allTextContents(), ['配置核对', '本地验证', '发布交接'])
        assert.deepEqual(await sections.getByRole('tab').allTextContents(), ['配置字段', '流程与策略', '扩展登记'])
        assert.equal(await page.getByRole('region', { name: '样本试跑', exact: true }).count(), 0)
        const fields = page.getByRole('table', { name: '配置字段及影响', exact: true })
        await fields.waitFor()
        assert.equal(await page.locator('.erp-dev-customer-workspace details').count(), 0)
        await fields.getByRole('columnheader', { name: '系统默认值', exact: true }).waitFor()
        const previewValueColumn = fields.getByRole('columnheader', { name: '客户包预览值', exact: true })
        const overrides = page.getByRole('checkbox', { name: '只看客户单独设置', exact: true })
        const filterHelp = page.getByRole('button', { name: '查看客户单独设置说明', exact: true })
        const fieldHelp = page.getByRole('button', { name: '查看字段取值说明', exact: true })
        const fieldHelpInHeader = previewValueColumn.getByRole('button', { name: '查看字段取值说明', exact: true })
        await fieldHelpInHeader.waitFor()
        const labelBox = await previewValueColumn.getByText('客户包预览值', { exact: true }).boundingBox()
        const headerHelpBox = await fieldHelpInHeader.boundingBox()
        assert(labelBox && headerHelpBox && headerHelpBox.x >= labelBox.x + labelBox.width, '说明在预览值列名右边')
        assert.equal(await fieldHelp.count(), 1)
        const helpPopup = page.locator('.erp-supplemental-help-popover:visible')
        const valuePopup = helpPopup.filter({ hasText: /服务器实际生效的值需到目标环境核对/u })
        const filterPopup = helpPopup.filter({ hasText: /值和系统默认一样也会显示/u })
        const locationPopup = helpPopup.filter({ hasText: /怎么在配置文件里找到这项设置/u })
        const locationHelpName = '查看配置文件位置说明'
        const locationCellSelector = 'td[data-customer-value-label="配置文件位置"]'
        assert.deepEqual(await fields.getByRole('columnheader').allTextContents(), [
          '配置字段', '配置文件位置', '系统默认值', '客户包预览值', '用途与影响',
        ])
        const locationHelpInHeader = fields.getByRole('columnheader', { name: '配置文件位置', exact: true })
          .getByRole('button', { name: locationHelpName, exact: true })
        await locationHelpInHeader.press('Enter')
        await locationPopup.getByText('moduleStates[].state', { exact: true }).waitFor()
        await locationPopup.getByText('moduleKey = production_orders', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await locationPopup.waitFor({ state: 'hidden' })
        const checkboxBox = await page.locator('label').filter({ has: overrides }).boundingBox()
        const filterHelpBox = await filterHelp.boundingBox()
        assert(checkboxBox && filterHelpBox && filterHelpBox.x >= checkboxBox.x + checkboxBox.width &&
          filterHelpBox.x - checkboxBox.x - checkboxBox.width <= 8, '筛选说明紧邻复选框')
        await fieldHelp.hover()
        await valuePopup.getByText(/客户没单独设置时，沿用系统默认值/u).waitFor()
        await filterHelp.click()
        await filterPopup.waitFor()
        assert.equal(await fieldHelp.getAttribute('aria-expanded'), 'false')
        await page.keyboard.press('Escape')
        await filterPopup.waitFor({ state: 'hidden' })
        await valuePopup.waitFor({ state: 'hidden' })
        assert.equal(await overrides.isChecked(), true)
        await overrides.uncheck()
        const productionRow = fields.getByRole('row').filter({ hasText: 'production_orders' })
        const productionLocation = productionRow.locator(locationCellSelector)
        assert.deepEqual(await productionLocation.locator('code').allTextContents(), ['moduleStates[].state', 'moduleKey', 'production_orders'])
        assert.match((await productionLocation.innerText()).replace(/\s+/gu, ' '), /记录条件 moduleKey 为 production_orders/u)
        await verifySlidingMotion(page, assert, '[aria-label="配置核对内容"]', 1)
        const review = page.getByRole('region', { name: '本包的流程与策略', exact: true })
        const flows = review.getByRole('table', { name: '发布候选流程', exact: true })
        const drafts = review.getByRole('table', { name: '流程策略草案', exact: true })
        assert.equal(await flows.locator('tbody tr').count(), 6)
        assert.equal(await drafts.locator('tbody tr').count(), 3)
        await drafts.getByText('preview_only', { exact: true }).first().waitFor()
        const sales = flows.getByRole('button', { name: '查看销售订单受理（审批 + 工程 + PMC）', exact: true })
        await sales.click()
        const flowDialog = page.getByRole('dialog', { name: '销售订单受理（审批 + 工程 + PMC）', exact: true })
        const reviewGraph = flowDialog.locator('[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas > svg')
        await reviewGraph.waitFor()
        assert.doesNotMatch(await reviewGraph.textContent(), /engineering_data|order_review/u)
        await flowDialog.getByText('compiled_snapshot.runtimeProcessSelections[0]', { exact: true }).waitFor()
        assert.match(await flowDialog.locator('pre').innerText(), /approval_engineering_pmc/u)
        await closeDialog(flowDialog)
        await page.waitForFunction(() => document.activeElement?.textContent === '查看销售订单受理（审批 + 工程 + PMC）')
        await drafts.getByRole('button', { name: '查看关闭策略', exact: true }).click()
        const policyDialog = page.getByRole('dialog', { name: '关闭策略', exact: true })
        await policyDialog.getByText('仅预览 · 不执行', { exact: true }).waitFor()
        await policyDialog.getByRole('button', { name: '条件：必需节点完成后', exact: true }).waitFor()
        await policyDialog.getByRole('button', { name: '结果：需要业务规则评审', exact: true }).waitFor()
        await policyDialog.getByText('compiled_snapshot.policyCatalog.process_policies[2]', { exact: true }).waitFor()
        await closeDialog(policyDialog)
        await review.getByRole('button', { name: '其他草案与通用审批规则' }).click()
        const approvals = page.getByRole('dialog', { name: '其他流程草案与审批规则', exact: true })
        const policy = approvals.getByRole('region', { name: '销售与采购订单审批', exact: true })
        const graph = policy.locator('[data-mermaid-status="rendered"] .erp-markdown-mermaid__canvas > svg')
        await graph.waitFor()
        assert.match(await graph.textContent(), /人工审批/u)
        assert.match(await graph.textContent(), /按规则免审/u)
        assert.equal(await policy.getByRole('link', { name: /审批责任/u }).getAttribute('href'), '/erp/system/permissions?tab=approvals')
        await closeDialog(approvals)
        await sections.getByRole('tab', { name: '扩展登记', exact: true }).click()
        await page.getByText('暂无扩展登记', { exact: true }).waitFor()
        await page.getByText('extensionPoints: []', { exact: true }).waitFor()
        await page.goBack()
        await sections.getByRole('tab', { name: '流程与策略', selected: true }).waitFor()
        await sections.getByRole('tab', { name: '配置字段', exact: true }).click()
        assert.equal(await overrides.isChecked(), false, '换页签后保留字段筛选')
        await page.getByRole('button', { name: '校验与来源', exact: true }).click()
        const validation = page.getByRole('dialog', { name: '校验与来源', exact: true })
        await validation.getByRole('table', { name: '配置校验明细' }).waitFor()
        const guide = validation.getByRole('region', { name: '配置字段说明', exact: true })
        const moduleFields = guide.getByRole('table', { name: '模块运行设置', exact: true })
        await moduleFields.getByRole('button', { name: '运行状态的来源与清单', exact: true }).click()
        const fieldTrace = guide.getByRole('region', { name: '配置来源与使用位置' })
        await fieldTrace.getByText('module_states[].state', { exact: true }).waitFor()
        await fieldTrace.getByText('config/customers/yoyoosun/customerPackage.mjs', { exact: true }).waitFor()
        await chooseSelectOption(guide.getByRole('combobox', { name: '配置字段分类' }), { label: '列表与导出字段' })
        await guide.getByRole('button', { name: '原因的来源与清单', exact: true }).click()
        await fieldTrace.getByText('不进入发布清单', { exact: true }).waitFor()
        await closeDialog(validation)
        await page.getByRole('button', { name: '界面预览', exact: true }).click()
        const preview = page.getByRole('dialog', { name: '界面预览', exact: true })
        const menu = preview.getByRole('table', { name: '菜单分组与页面', exact: true })
        await menu.locator('tbody tr').first().waitFor()
        assert.equal(await menu.locator('tbody tr:visible').count(), 13)
        assert.equal(await menu.locator('li:visible').count(), 27)
        const menuKeys = preview.getByRole('checkbox', { name: '显示菜单代码', exact: true })
        await preview.getByRole('button', { name: '查看菜单代码说明', exact: true }).click()
        await helpPopup.getByText('global-dashboard', { exact: true }).waitFor()
        assert.equal(await menuKeys.isChecked(), false)
        await page.keyboard.press('Escape')
        await helpPopup.waitFor({ state: 'hidden' })
        assert.equal(await preview.isVisible(), true)
        await menuKeys.check()
        await menu.getByText('global-dashboard', { exact: true }).waitFor()
        await menuKeys.uncheck()
        assert.equal(await menu.locator('code').count(), 0)
        for (const [name, count] of [['字段显示候选', 12], ['编号规则候选', 5], ['打印模板清单', 5]]) {
          assert.equal(await preview.getByRole('table', { name, exact: true }).locator('tbody tr:visible').count(), count)
        }
        const printButton = preview.getByRole('button', { name: '加工合同字段依据', exact: true })
        await printButton.click()
        await preview.getByRole('region', { name: '加工合同字段依据', exact: true }).waitFor()
        await closeDialog(preview)

        await verifySlidingMotion(page, assert, '[aria-label="客户配置工作任务"]', 1)
        await validationPanel.waitFor()
        assert.equal(await sections.count(), 0)
        assert.equal(await validationPanel.getByRole('tab').count(), 0)
        assert.equal(await fields.count(), 0)
        const runButton = validationPanel.getByRole('button', { name: '运行样本试跑', exact: true })
        const requestReached = page.waitForRequest((request) => request.url().endsWith('/customer-import/dry-run'), { timeout: 10000 })
        await runButton.click()
        await requestReached
        await page.getByText('试跑正在生成', { exact: true }).waitFor()
        for (const tab of await nav.getByRole('tab').all()) assert.equal(await tab.isDisabled(), true)
        await page.getByText('配置操作进行中，客户包已锁定；离开页面不会撤销操作。', { exact: true }).waitFor()
        assert.equal(typeof finishDryRun, 'function')
        finishDryRun()
        await page.getByRole('region', { name: '样本试跑', exact: true }).getByText('试跑生成失败', { exact: true }).waitFor()
        assert.equal(await runButton.isDisabled(), false)
        assert.equal(dryRunRequests, 1, '失败后不能自动重复试跑')
        const retryReached = page.waitForRequest((request) => request.url().endsWith('/customer-import/dry-run'))
        await runButton.click()
        await retryReached
        finishDryRun()
        await page.getByText('样本试跑报告已生成', { exact: true }).waitFor()
        const reportButton = validationPanel.getByRole('button', { name: '查看本次报告', exact: true })
        const reportBox = await reportButton.boundingBox()
        const resultBox = await validationPanel.locator('.erp-dev-customer-dry-run-result').boundingBox()
        assert(reportBox && resultBox && reportBox.width < resultBox.width / 2, '报告入口应随内容取宽')
        await reportButton.click()
        const report = page.getByRole('dialog', { name: '本次样本试跑报告', exact: true })
        await report.getByText('阻塞 1 / 延后 0 / 复核 0', { exact: true }).waitFor()
        assert.equal(await report.locator('.ant-typography-copy').count(), 2)
        await closeDialog(report)
        assert.equal(dryRunRequests, 2, '查阅报告不重复试跑')
        await verifySlidingMotion(page, assert, '[aria-label="客户配置工作任务"]', 0, true)
        await fields.waitFor()
        assert.equal(await overrides.isChecked(), false)
        await validationTab.click()
        await reportButton.waitFor()
        assert.equal(dryRunRequests, 2, '切回本地验证应恢复报告')
        await page.setViewportSize({ width: 390, height: 844 })
        await assertNoHorizontalOverflow(page, '本地验证 390px')
        await page.setViewportSize({ width: 1440, height: 900 })

        await page.goto(new URL('/__dev/customer-config?customer=yoyoosun&view=import&action=test-apply', page.url()).href)
        await validationPanel.waitFor()
        await page.getByRole('region', { name: '应用本地配置', exact: true }).waitFor()
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '应用本地配置')
        await page.getByRole('button', { name: '应用本地配置', exact: true }).click()
        const confirmation = page.getByRole('dialog', { name: '确认应用测试配置？', exact: true })
        await confirmation.getByRole('button', { name: '取消', exact: true }).click()
        await confirmation.waitFor({ state: 'hidden' })
        await nav.getByRole('tab', { name: '发布交接', exact: true }).click()
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
        await chooseSelectOption(customerSelector, { label: '永绅 yoyoosun' })
        await page.waitForURL((url) => url.searchParams.get('customer') === 'yoyoosun')
        await page.getByRole('tablist', { name: '客户配置工作任务' }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('customer'), 'yoyoosun')
        assert.equal(await nav.getByRole('tab', { name: /^发布交接/u }).getAttribute('aria-selected'), 'true')
        assert.equal(await page.getByText(/未登记客户配置包：unregistered-customer/u).count(), 0)
        await nav.getByRole('tab', { name: '配置核对', exact: true }).click()
        await chooseSelectOption(customerSelector, { label: '标准样例毛绒制造有限公司（工程参考）' })
        await page.waitForURL((url) => url.searchParams.get('customer') === 'reference-customer')
        const vendorField = fields.getByRole('row').filter({ hasText: 'supplier_type' })
        await vendorField.getByText('false', { exact: true }).waitFor()
        assert.match(await vendorField.innerText(), /suppliers.default/u)
        await page.getByRole('button', { name: '界面预览', exact: true }).click()
        await preview.getByRole('heading', { name: '标准样例毛绒制造有限公司（工程参考）', exact: true }).waitFor()
        await closeDialog(preview)
        await sections.getByRole('tab', { name: '流程与策略', exact: true }).click()
        await flows.getByText('approval_pmc', { exact: true }).waitFor()
        assert.equal(await flows.locator('tbody tr').count(), 1)
        await review.getByText('暂无流程策略草案', { exact: true }).waitFor()
        await page.reload()
        await sections.getByRole('tab', { name: '流程与策略', exact: true, selected: true }).waitFor()
        await sections.getByRole('tab', { name: '扩展登记', exact: true }).click()
        await page.getByText('暂无扩展登记', { exact: true }).waitFor()
        await validationTab.click()
        await validationPanel.getByText('当前客户包未开放样本试跑。', { exact: true }).waitFor()
        assert.equal(await runButton.isDisabled(), true)
        assert.equal(await validationPanel.getByRole('button', { name: '应用本地配置', exact: true }).isDisabled(), true)
        assert.equal(await validationPanel.getByRole('button', { name: /查看.*报告/u }).count(), 0)
        await nav.getByRole('tab', { name: '发布交接', exact: true }).click()
        assert.equal(await executor.count(), 0)
        assert.equal(await page.getByRole('button', { name: /检查发布条件/u }).count(), 0)
        await nav.getByRole('tab', { name: '配置核对', exact: true }).click()
        await sections.getByRole('tab', { name: '扩展登记', exact: true, selected: true }).waitFor()
        await sections.getByRole('tab', { name: '配置字段', exact: true }).click()
        const filterBeforeResize = await overrides.isChecked()
        await fieldHelpInHeader.click()
        await valuePopup.waitFor()
        await page.setViewportSize({ width: 390, height: 844 })
        const fieldHelpAboveTable = page.getByRole('region', { name: '配置字段对照', exact: true })
          .locator('.erp-workbench-toolbar').getByRole('button', { name: '查看字段取值说明', exact: true })
        await fieldHelpAboveTable.waitFor()
        assert.equal(await fieldHelp.count(), 1)
        await valuePopup.waitFor({ state: 'hidden' })
        await fieldHelpAboveTable.click()
        await valuePopup.waitFor()
        const helpBox = await valuePopup.boundingBox()
        assert(helpBox && helpBox.x >= 0 && helpBox.x + helpBox.width <= 391, '窄屏说明在视口内')
        await filterHelp.click()
        await filterPopup.waitFor()
        const narrowFilterHelpBox = await filterPopup.boundingBox()
        assert(narrowFilterHelpBox && narrowFilterHelpBox.x >= 0 &&
          narrowFilterHelpBox.x + narrowFilterHelpBox.width <= 391, '窄屏筛选说明在视口内')
        assert.equal(await overrides.isChecked(), filterBeforeResize)
        await page.keyboard.press('Escape')
        await filterPopup.waitFor({ state: 'hidden' })
        await valuePopup.waitFor({ state: 'hidden' })
        const locationHelpAboveTable = page.getByRole('region', { name: '配置字段对照', exact: true })
          .locator('.erp-workbench-toolbar').getByRole('button', { name: locationHelpName, exact: true })
        await locationHelpAboveTable.getByText('配置文件位置', { exact: true }).waitFor()
        assert.equal(await page.getByRole('button', { name: locationHelpName, exact: true }).count(), 1)
        await locationHelpAboveTable.click()
        await locationPopup.getByText('moduleKey = production_orders', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await locationPopup.waitFor({ state: 'hidden' })
        const compactLocation = fields.getByRole('row').filter({ hasText: 'supplier_type' }).locator(locationCellSelector)
        const compactLocationLayout = await compactLocation.evaluate((cell) => ({
          widthGap: Math.abs(cell.closest('tr').getBoundingClientRect().width - cell.getBoundingClientRect().width),
          caption: getComputedStyle(cell, '::before').content,
        }))
        assert(compactLocationLayout.widthGap <= 1, '窄屏配置文件位置独占一行')
        assert.equal(compactLocationLayout.caption, '"配置文件位置"')
        await assertNoHorizontalOverflow(page, '工程参考客户包 390px')
        await page.setViewportSize({ width: 1440, height: 900 })
        await fieldHelpInHeader.waitFor()
        assert.equal(await fieldHelp.count(), 1)
        assert.equal(await overrides.isChecked(), filterBeforeResize)
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
        const guide = page.getByRole('region', { name: '数据库升级步骤' })
        assert.equal(await guide.getByRole('listitem').count(), 6)
        assert.equal(await guide.locator('li[data-status="guide"]').count(), 6, '没有操作记录时，所有步骤只作示意')
        assert.equal(await boundaries.isVisible(), true)
        assert.equal(await diagram.count(), 0, '默认不挂载补充流程图')
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
        await page.getByText('选择“检查并准备”，先在隔离库验证候选版本。', { exact: true }).waitFor()
        const readyReceipt = migration.operation
        const preparingEvent = { at: readyReceipt.createdAt, status: 'preparing', message: '正在隔离数据库验证升级' }
        migration.operation = { ...readyReceipt, status: 'preparing', plan: null, backup: null, events: [preparingEvent] }
        migration.summary.operations = [migration.operation]
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
        await page.getByText(`最近记录 · ${preparingEvent.message}`, { exact: true }).waitFor()
        assert.equal(await guide.locator('li[data-status="finish"]').count(), 0, '准备事件不能证明原库事务或恢复演练已完成')
        migration.operation = readyReceipt
        migration.summary.operations = []
        await page.getByRole('button', { name: '刷新状态', exact: true }).click()
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
        await page.getByRole('status').filter({ hasText: '当前数据库升级' }).waitFor({ state: 'visible' })
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
