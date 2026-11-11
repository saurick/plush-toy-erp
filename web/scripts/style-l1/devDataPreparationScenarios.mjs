import { CUSTOMER_TRIAL_133_CONFIG_REVISION, CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION, LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION } from '../../../scripts/qa/manual-acceptance-target-policy.mjs'
import { MANUAL_ACCEPTANCE_CORE_CONTRACT } from '../../../scripts/qa/manual-acceptance-core-contract.mjs'
import { buildManualAcceptanceBusinessChainReviewPlan } from '../../../scripts/qa/manual-acceptance-business-chain-contract.mjs'
import { MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS } from '../../../scripts/qa/manual-acceptance-dataset.mjs'
import {
  projectDataPreparationAcceptancePlan,
  validateDevDataPreparationSummary,
  validateDevDataPreparationOperation,
} from '../../src/dev-workbench/config/devDataPreparation.mjs'
import { DATA_PREPARATION_PROFILE_SEMANTIC_DIGESTS, DEV_DATA_PREPARATION_PROFILES } from '../../dev-server/devDataPreparationPlugin.mjs'

const OPERATION_IDS = {
  'local-development': '11111111-1111-4111-8111-111111111111',
  'customer-trial-133': '22222222-2222-4222-8222-222222222222',
  'isolated-local': '33333333-3333-4333-8333-333333333333',
}
const REPOSITORY = { commit: 'd'.repeat(40), dirty: false, fingerprint: 'c'.repeat(64) }
const PLAN_HASH = 'a'.repeat(64)
const TARGET_FINGERPRINT = 'b'.repeat(64)
const RUN_ID = 'd260729020000_01020304'
const CREATED_AT = '2026-07-29T02:00:00.000Z'
const UPDATED_AT = '2026-07-29T02:01:00.000Z'
const ACCEPTANCE_PLAN = buildManualAcceptanceBusinessChainReviewPlan({
  catalogTargetCount: 50,
  datasetStageKeys: MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
})

function operationFixture({ profileKey, targetKey, repository }, status = 'ready') {
  const id = OPERATION_IDS[targetKey]
  const terminal = status === 'passed'
  const targetFingerprint = TARGET_FINGERPRINT
  const databaseName = targetKey === 'customer-trial-133' ? 'plush_erp_demo_v1' : 'plush_erp'
  const migrationVersion = MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.minimumMigration
  return validateDevDataPreparationOperation({
    id,
profileKey,
status,
terminal,
planHash: PLAN_HASH,
runId: RUN_ID,
repository,
    contract: {
      kind: 'plush.dev-data-preparation-operation-contract',
      classification: 'current',
      dataVersion: MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion,
      datasetRunId: MANUAL_ACCEPTANCE_CORE_CONTRACT.runId,
      semanticDigest: DATA_PREPARATION_PROFILE_SEMANTIC_DIGESTS[profileKey],
    },
    targetSummary: {
      targetKey,
targetFingerprint,
safeTarget: `登记目标：${targetKey}`,
      preflightFingerprint: 'f'.repeat(64),
      disposable: targetKey === 'isolated-local',
      automaticCleanup: targetKey === 'isolated-local',
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    timing: {
      startedAt: status === 'ready' ? null : CREATED_AT,
      completedAt: terminal ? UPDATED_AT : null,
      durationMs: terminal ? 60000 : null,
    },
    events: [{ at: UPDATED_AT, status, message: '执行状态已记录' }],
    issues: [],
    readback: terminal ? {
      schemaVersion: 'plush.dev-data-preparation-readback/v1',
      profileKey,
targetKey,
targetEnvironment: targetKey,
targetFingerprint,
      databaseName,
migrationVersion,
release: repository.commit,
      customerConfigRevision: LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
      datasetKey: 'yoyoosun-manual-acceptance',
      dataVersion: MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion,
      runId: MANUAL_ACCEPTANCE_CORE_CONTRACT.runId,
      semanticDigest: DATA_PREPARATION_PROFILE_SEMANTIC_DIGESTS[profileKey],
      stageCount: 9,
sourceDocumentCount: 1002,
processRuntimeCount: 160,
      factCount: 500,
catalogReadyCount: 40,
catalogTargetCount: 50,
browserChecksPending: 10,
      manualAcceptanceCompleted: false,
cleanupSupported: false,
replayMode: 'exact-create-or-readback',
    } : null,
    confirmationRequired: status === 'ready' ? `DATA_PREPARATION:${profileKey}:${targetKey}:${RUN_ID}:${PLAN_HASH}:${id}` : '',
  })
}

function createSummary() {
  return {
    kind: 'plush.dev-data-preparation-summary',
    status: 'success',
    generatedAt: CREATED_AT,
    repository: { ...REPOSITORY },
    acceptancePlan: projectDataPreparationAcceptancePlan(ACCEPTANCE_PLAN),
    datasetContract: {
      kind: 'plush.dev-data-environment-contract',
      datasetKey: 'yoyoosun-manual-acceptance',
      dataVersion: MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion,
      runId: MANUAL_ACCEPTANCE_CORE_CONTRACT.runId,
      semanticDigest: DATA_PREPARATION_PROFILE_SEMANTIC_DIGESTS['full-acceptance'],
      profileSemanticDigests: { ...DATA_PREPARATION_PROFILE_SEMANTIC_DIGESTS },
      simulatedOnly: true,
      realCustomerImport: false,
      unitCount: MANUAL_ACCEPTANCE_CORE_CONTRACT.units.length,
      warehouseCount: 4,
      customerTrial133: {
        target: 'customer-trial-133',
        deploymentTarget: 'demo-133',
        databaseName: 'plush_erp_demo_v1',
        databaseLifecycle: 'long-lived-registered-target',
        minimumMigration:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.minimumMigration,
        configRevision:
          CUSTOMER_TRIAL_133_CONFIG_REVISION,
        configProductVersion:
          CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
      },
    },
    target: {
      scenarioDemo: {
        status: 'available',
        safeTarget: '共享开发库业务场景（固定身份）',
        databaseName: 'plush_erp',
        migrationVersion:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.minimumMigration,
        customerConfigRevision:
          LOCAL_MANUAL_ACCEPTANCE_CONFIG_REVISION,
        customerConfigProductVersion: 'local-customer-package-test-apply',
        targetFingerprint: '9'.repeat(64),
      },
      scenarioDemo133: {
        status: 'not_proven',
        safeTarget: 'customer-trial-133:plush_erp_demo_v1',
        databaseName: 'plush_erp_demo_v1',
        migrationVersion:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.minimumMigration,
        customerConfigRevision:
          CUSTOMER_TRIAL_133_CONFIG_REVISION,
        customerConfigProductVersion:
          CUSTOMER_TRIAL_133_CONFIG_PRODUCT_VERSION,
        targetFingerprint: '7'.repeat(64),
      },
      fullAcceptance: {
        status: 'available',
        safeTarget: '专用隔离验收库',
        databaseName: 'isolated-per-run',
        migrationVersion: 'not-proven',
        customerConfigRevision: 'not-proven',
        customerConfigProductVersion: 'not-proven',
        targetFingerprint: 'e'.repeat(64),
      },
    },
    profiles: DEV_DATA_PREPARATION_PROFILES,
    currentOperations: [],
    historicalOperations: [],
    unresolvedOperations: [],
    issues: [],
    boundaries: {
      developmentOnly: true,
      browserTargetInputAllowed: false,
      browserShellAccess: false,
      arbitraryPathInputAllowed: false,
      fullAcceptanceAutomaticCleanup: true,
      customerUAT: false,
    },
  }
}

export function createDataPreparationBrowserFixture({ fullAcceptanceHistory = false } = {}) {
  const summary = createSummary()
  summary.repository.dirty = true
  summary.target.fullAcceptance.status = 'blocked'
  summary.target.scenarioDemo.status = 'blocked'
  summary.issues = [
    {
      code: 'full_acceptance_requires_clean_repository',
      severity: 'warning',
      message: '完整回归需要干净提交',
    },
    {
      code: 'full_acceptance_target_unavailable',
      severity: 'blocked',
      message: '完整验收数据库环境未配置',
    },
    {
      code: 'scenario_demo_target_unavailable',
      severity: 'blocked',
      message: '本地业务场景的运行预检未通过',
    },
  ]
  if (fullAcceptanceHistory) {
    const profileKey = 'full-acceptance'
    const targetKey = 'isolated-local'
    const { id, contract } = operationFixture({ profileKey, targetKey, repository: REPOSITORY })
    summary.unresolvedOperations = [{
      id,
      profileKey,
      targetKey,
      status: 'not_proven',
      updatedAt: UPDATED_AT,
      terminal: true,
      contract: { ...contract, classification: 'unresolved' },
    }]
  }
  validateDevDataPreparationSummary(summary)
  return {
    summary,
    actions: [],
    reads: [],
    failReads: false,
  }
}

export async function installDataPreparationBrowserRoutes(page, fixture) {
  await page.route('**/__dev/api/data-preparation/**', async (route) => {
    const url = new URL(route.request().url())
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      })
    if (url.pathname.endsWith('/summary')) {
      fixture.reads.push(url.search)
      return fixture.failReads
        ? json({ message: '预检暂不可用' }, 503)
        : json(fixture.summary)
    }
    if (url.pathname.endsWith('/session')) {
      return json({
        kind: 'plush.dev-data-preparation-session',
        csrfToken: 'data-preparation-browser-csrf-token-fixture',
        apiPrefix: '/__dev/api/data-preparation',
      })
    }
    if (url.pathname.endsWith('/actions')) {
      const action = route.request().postDataJSON()
      fixture.actions.push(action)
      if (action.action === 'execute' && !fixture.allowExecute) throw new Error('该用例不允许执行')
      const previous = fixture.summary.currentOperations.find(({ id }) => id === action.payload.operationId)
      const input = action.action === 'prepare' ? action.payload : {
        profileKey: previous.profileKey,
        targetKey: previous.targetSummary.targetKey,
      }
      const operation = operationFixture({ ...input, repository: fixture.summary.repository }, action.action === 'prepare' ? 'ready' : 'running')
      fixture.summary.currentOperations = [operation, ...fixture.summary.currentOperations.filter(({ id }) => id !== operation.id)]
      return json({ kind: 'plush.dev-data-preparation-action-result', action: action.action, operation })
    }
    if (url.pathname.includes('/operations/')) {
      const previous = fixture.summary.currentOperations.find(({ id }) => id === url.pathname.split('/').at(-1))
      const operation = previous.status === 'running' ? operationFixture({
        profileKey: previous.profileKey, targetKey: previous.targetSummary.targetKey, repository: previous.repository,
      }, 'passed') : previous
      fixture.summary.currentOperations = [operation, ...fixture.summary.currentOperations.filter(({ id }) => id !== operation.id)]
      return json({ kind: 'plush.dev-data-preparation-operation-result', operation })
    }
    throw new Error(`未登记的数据准备夹具路径：${url.pathname}`)
  })
}

export function createDevDataPreparationScenarios({ assert, assertNoHorizontalOverflow, expectHeading }) {
  let workflow
  let history
  return [
    {
      name: 'dev-data-preparation-workflow-desktop',
      path: '/__dev/data-preparation?dataProfile=full-acceptance&view=confirm&customer=yoyoosun',
      viewport: { width: 1440, height: 1000 },
      deviceScaleFactor: 2,
      expectedConsoleErrorPatterns: [
        /console error.*status of 503.*\/__dev\/api\/data-preparation\/summary\?refresh=authoritative/u,
      ],
      beforeNavigate: async (page) => {
        workflow = createDataPreparationBrowserFixture({ fullAcceptanceHistory: true })
        workflow.summary.target.scenarioDemo.status = 'available'
        workflow.allowExecute = true
        await installDataPreparationBrowserRoutes(page, workflow)
      },
      verify: async (page) => {
        await expectHeading(page, '准备手测数据')
        const prepare = page.getByRole('button', { name: '补齐手测数据', exact: true })
        const dialog = page.getByRole('dialog')
        const coverage = page.getByRole('region', { name: '覆盖内容', exact: true })
        const directory = coverage.getByRole('navigation', { name: '业务链范围目录' })
        const detail = coverage.getByRole('region', { name: '业务链详情' })
        const [firstChain, nextChain] = workflow.summary.acceptancePlan.chains
        assert.equal(await page.getByRole('radio').count(), 2)
        assert.equal(await page.getByRole('radio', { name: '本地开发' }).isChecked(), true)
        assert.equal(await page.getByRole('tab', { name: '当前批次' }).count(), 0)
        await detail.getByRole('heading', { name: firstChain.label, exact: true }).waitFor()
        assert.equal(await directory.getByRole('button').count(), workflow.summary.acceptancePlan.chainCount)
        await detail.getByText(`1. ${firstChain.steps[0].label}`, { exact: true }).click()
        await detail.getByText('责任岗位', { exact: true }).waitFor()
        const readsBeforeChainChange = workflow.reads.length
        await directory.getByRole('button', { name: nextChain.label, exact: true }).click()
        await detail.getByRole('heading', { name: nextChain.label, exact: true }).waitFor()
        assert.equal(new URL(page.url()).searchParams.get('planChain'), nextChain.key)
        assert.equal(await detail.getByText('责任岗位', { exact: true }).isVisible(), false, '切链后不沿用上一条链的已展开步骤')
        assert.equal(workflow.reads.length, readsBeforeChainChange, '查看链路不重复预检')
        assert.deepEqual(workflow.actions, [], '查看范围和预选环境不得写入')

        await prepare.click()
        await dialog.getByText('补齐手测数据 · 本地开发', { exact: true }).waitFor()
        assert.equal(await dialog.getByRole('textbox').count(), 0)
        assert.equal(await dialog.getByText(/release|migration|版本|批次/u).count(), 0)
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        assert.deepEqual(workflow.actions.map(({ action, payload }) => [action, payload.targetKey]), [['prepare', 'local-development']])

        await page.getByRole('radio', { name: '服务器 Demo' }).click()
        await page.waitForURL((url) => url.searchParams.get('dataTarget') === 'customer-trial-133')
        await prepare.click()
        await dialog.getByText('补齐手测数据 · 服务器 Demo', { exact: true }).waitFor()
        assert.deepEqual(workflow.actions.map(({ action, payload }) => [action, payload.targetKey]), [
          ['prepare', 'local-development'], ['prepare', 'customer-trial-133'],
        ])
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.getByRole('radio', { name: '本地开发' }).click()
        await page.waitForURL((url) => url.searchParams.get('dataTarget') === 'local-development')
        await prepare.click()
        await dialog.getByText('补齐手测数据 · 本地开发', { exact: true }).waitFor()
        await dialog.getByRole('button', { name: '确认补齐', exact: true }).click()
        await page.getByText('正在补齐手测数据', { exact: true }).waitFor()
        await page.getByText('手测数据已补齐并核对，可以登录各岗位开始手测。').waitFor()
        assert.equal(workflow.actions.length, 3, '同目标准备结果应复用，确认仅执行一次')
        assert.equal(workflow.actions[2].payload.operationId, OPERATION_IDS['local-development'])
        const reads = workflow.reads.length
        await page.getByRole('tab', { name: '执行记录', exact: true }).click()
        const records = page.getByRole('tabpanel', { name: '执行记录', exact: true })
        await records.getByText('服务器 Demo', { exact: true }).waitFor()
        await coverage.waitFor({ state: 'hidden' })
        await page.getByRole('tab', { name: '准备数据', exact: true }).click()
        await detail.getByRole('heading', { name: nextChain.label, exact: true }).waitFor()
        assert.equal(await page.getByRole('radio', { name: '本地开发' }).isChecked(), true)
        assert.equal(workflow.reads.length, reads, '切换记录视图不得重复预检')
        await assertNoHorizontalOverflow(page, 'daily data preparation')

        // Full regression stays in test execution, with its own environment and confirmation.
        await page.goto(new URL('/__dev/testing?view=full-acceptance', page.url()).href)
        const run = page.getByRole('region', { name: '运行条件', exact: true })
        const full = run.getByRole('button', { name: '准备完整回归', exact: true })
        const recheck = run.getByRole('button', { name: '重新检查', exact: true })
        const scope = page.getByRole('region', { name: '回归范围', exact: true })
        const receipts = page.getByRole('region', { name: '执行记录', exact: true })
        const fullCoverage = page.getByRole('region', { name: '业务链与步骤', exact: true })
        const fullDirectory = fullCoverage.getByRole('navigation', { name: '业务链范围目录' })
        const fullDetail = fullCoverage.getByRole('region', { name: '业务链详情' })
        const blocked = run.getByRole('status').filter({ hasText: '暂不能运行' })
        await blocked.getByRole('listitem').filter({ hasText: '有未提交改动' }).waitFor()
        await blocked.getByRole('listitem').filter({ hasText: '隔离库未就绪' }).waitFor()
        assert.equal(await full.isDisabled(), true, '完整回归受干净提交和临时库约束')
        const { chainCount, scenarioCount, stepCount, dataStageCount, catalogTargetCount } = workflow.summary.acceptancePlan
        assert.deepEqual(await scope.locator('dd').allTextContents(), [chainCount, scenarioCount, stepCount, dataStageCount, catalogTargetCount].map(String))
        await fullDirectory.waitFor()
        assert.equal(await fullDirectory.getByRole('button').count(), chainCount, '打开页面即可浏览完整链路目录')
        await fullDetail.getByRole('heading', { name: firstChain.label, exact: true }).waitFor()
        for (const width of [1920, 1280, 1024]) {
          await page.setViewportSize({ width, height: 900 })
          const [conditions, range, records, directory, action, refresh, shell, available] = await Promise.all(
            [run, scope, receipts, fullDirectory, full, recheck, page.locator('.erp-dev-testing-reader'), page.locator('.erp-dev-testing-shell')].map((item) => item.boundingBox())
          )
          assert(conditions && range && records && directory && action && refresh && shell && available, `${width}px 下可直接读条件、范围、记录和链路`)
          assert(Math.abs(shell.width - available.width) <= 1, '内容区用满可用宽度')
          assert(action.y + action.height <= 900 && Math.min(directory.y + directory.height, 900) - directory.y >= 220, '首屏直接显示运行操作及多条业务链')
          assert(Math.abs(action.y - refresh.y) <= 1 && refresh.x >= action.x + action.width, '重新检查紧邻准备操作')
          assert(records.y >= range.y + range.height && directory.y >= records.y + records.height, '记录跟在范围下方，目录使用剩余纵向空间')
          if (width >= 1280) {
            assert(range.x >= conditions.x + conditions.width && Math.abs(range.y - conditions.y) <= 1, '宽屏摘要与运行条件并排、顶端对齐')
          } else {
            assert(range.y >= conditions.y + conditions.height && Math.abs(range.x - conditions.x) <= 1, '窄窗口先看条件再看范围')
          }
          await assertNoHorizontalOverflow(page, `full acceptance ${width}px`)
        }

        const lastChain = workflow.summary.acceptancePlan.chains.at(-1)
        const chainReads = workflow.reads.length
        const lastChainButton = fullDirectory.getByRole('button', { name: lastChain.label, exact: true })
        await lastChainButton.focus()
        await lastChainButton.scrollIntoViewIfNeeded()
        const readSelection = (button) => {
          const scroller = document.scrollingElement
          return {
            y: button.getBoundingClientRect().top,
            scroll: scroller.scrollTop,
            scrollMax: scroller.scrollHeight - scroller.clientHeight,
            history: window.history.length,
            focused: document.activeElement === button,
          }
        }
        const beforeSelection = await lastChainButton.evaluate(readSelection)
        await lastChainButton.press('Enter')
        await fullDetail.getByRole('heading', { name: lastChain.label, exact: true }).waitFor()
        const afterSelection = await lastChainButton.evaluate(readSelection)
        const retainedScroll = Math.min(beforeSelection.scroll, afterSelection.scrollMax)
        assert(Math.abs(afterSelection.scroll - retainedScroll) <= 1, `切换业务链只允许浏览器自然收束到较短页尾 ${JSON.stringify({ beforeSelection, afterSelection })}`)
        assert(Math.abs(beforeSelection.y + beforeSelection.scroll - afterSelection.y - afterSelection.scroll) <= 1, '切换业务链不改变目录项在页面内的位置')
        assert.equal(afterSelection.history, beforeSelection.history, '切换业务链不增加返回历史')
        assert.equal(afterSelection.focused, true, '键盘切链后焦点留在原项')
        assert.equal(new URL(page.url()).searchParams.get('planChain'), lastChain.key)
        await fullDetail.getByText(`1. ${lastChain.steps[0].label}`, { exact: true }).click()
        const roleLabel = fullDetail.getByText('责任岗位', { exact: true })
        await roleLabel.waitFor()
        const roleLabelLines = await roleLabel.evaluate((label) => {
          const text = document.createRange()
          text.selectNodeContents(label)
          return new Set(Array.from(text.getClientRects(), (rect) => Math.round(rect.top))).size
        })
        assert.equal(roleLabelLines, 1, '窄窗口展开明细时短标签不拆行')
        assert.equal(workflow.reads.length, chainReads, '查阅覆盖步骤不发起预检')
        await assertNoHorizontalOverflow(page, 'expanded regression coverage at 1024px')

        workflow.failReads = true
        await recheck.click()
        await page.getByRole('alert').getByText('无法检查回归条件', { exact: true }).waitFor()
        await scope.getByText('显示上次读取的覆盖范围。', { exact: true }).waitFor()
        await receipts.getByText('显示上次读取的记录。', { exact: true }).waitFor()
        await fullDetail.getByRole('heading', { name: lastChain.label, exact: true }).waitFor()
        assert.equal(await full.isDisabled(), true, '重新检查失败仍禁止执行')
        workflow.failReads = false
        workflow.summary.repository.dirty = false
        workflow.summary.target.fullAcceptance.status = 'available'
        await recheck.click()
        await full.click()
        await dialog.getByText('确认完整回归', { exact: true }).waitFor()
        assert.equal(await dialog.getByRole('button', { name: '开始回归' }).isDisabled(), true)
        assert.equal(workflow.actions.at(-1).payload.targetKey, 'isolated-local')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        await page.setViewportSize({ width: 1280, height: 900 })
        const recordsLocation = page.url()
        const recordsReads = workflow.reads.length
        const recordHeader = receipts.locator('.ant-collapse-header').filter({ hasText: '计划待确认' })
        await recordHeader.press('Enter')
        await receipts.getByText('排查信息', { exact: true }).press('Enter')
        await receipts.getByText('不可变计划', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'expanded regression record in the 1280px sidebar')
        await recordHeader.press('Enter')
        const moreRecords = receipts.locator('summary').filter({ hasText: /^更多记录/u })
        await moreRecords.press('Enter')
        assert.equal(await moreRecords.evaluate((summary) => document.activeElement === summary), true, '打开更多记录后焦点留在原处')
        await receipts.locator('summary').filter({ hasText: '结果未证明' }).press('Enter')
        await receipts.getByText('原记录', { exact: true }).waitFor()
        await fullDetail.getByRole('heading', { name: lastChain.label, exact: true }).waitFor()
        await roleLabel.waitFor()
        assert.equal(await run.isVisible(), true, '展开执行记录不替换运行条件和覆盖内容')
        assert.equal(page.url(), recordsLocation, '查阅执行记录不切换页面地址')
        assert.equal(workflow.reads.length, recordsReads, '查阅执行记录不发起预检')
        await assertNoHorizontalOverflow(page, 'full acceptance in testing')

        workflow.summary.repository.dirty = true
        workflow.summary.target.fullAcceptance.status = 'blocked'
        workflow.summary.currentOperations = workflow.summary.currentOperations.filter((operation) => operation.profileKey !== 'full-acceptance')
        workflow.summary.unresolvedOperations = []
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.reload()
        await fullDetail.getByRole('heading', { name: lastChain.label, exact: true }).waitFor()
        await blocked.waitFor()
        await receipts.getByText('暂无执行记录', { exact: true }).waitFor()
        assert.equal(await full.isDisabled(), true)
      },
    },
    {
      name: 'dev-data-preparation-4k',
      path: '/__dev/data-preparation',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        history = createDataPreparationBrowserFixture()
        const { contract } = operationFixture({ profileKey: 'scenario-demo', targetKey: 'local-development', repository: REPOSITORY })
        history.summary.unresolvedOperations = [{
          id: '44444444-4444-4444-8444-444444444444',
          profileKey: 'core-demo',
          targetKey: null,
          status: 'not_proven',
          updatedAt: UPDATED_AT,
          terminal: true,
          contract: { ...contract, classification: 'unresolved' },
        }]
        await installDataPreparationBrowserRoutes(page, history)
      },
      verify: async (page) => {
        await expectHeading(page, '准备手测数据')
        const action = page.getByRole('button', { name: '补齐手测数据', exact: true })
        assert.equal(await action.isDisabled(), true, '本地前置不通过不能执行')
        await page.getByText('所选环境暂不能执行', { exact: true }).waitFor()
        assert.equal(await page.getByText('历史记录', { exact: true }).count(), 0)
        const records = JSON.stringify(history.summary.unresolvedOperations)
        await page.getByRole('tab', { name: '执行记录', exact: true }).click()
        const older = page.getByRole('region', { name: '历史记录' })
        await older.getByText('本地长期基础数据', { exact: true }).waitFor()
        await older.getByText('目标未确认', { exact: true }).waitFor()
        await older.locator('summary').first().click()
        await older.getByText('44444444-4444-4444-8444-444444444444', { exact: true }).waitFor()
        assert.equal(JSON.stringify(history.summary.unresolvedOperations), records, '查看记录不得改写历史')
        await page.getByRole('tab', { name: '准备数据', exact: true }).click()
        await page.getByRole('radio', { name: '服务器 Demo' }).click()
        await page.waitForURL((url) => url.searchParams.get('dataTarget') === 'customer-trial-133')
        await page.waitForFunction(() => [...document.querySelectorAll('button')].some(
          (button) => button.textContent.trim() === '补齐手测数据' && !button.disabled
        ))
        const target = page.getByLabel('数据目标', { exact: true })
        const coverage = page.getByRole('heading', { name: '覆盖内容', exact: true })
        for (const viewport of [{ width: 3840, height: 2160 }, { width: 1280, height: 720 }, { width: 1024, height: 768 }, { width: 1920, height: 1080 }]) {
          await page.setViewportSize(viewport)
          const [box, targetBox, coverageBox] = await Promise.all([action.boundingBox(), target.boundingBox(), coverage.boundingBox()])
          assert(box && box.y >= 0 && box.y + box.height <= viewport.height, '主动作在首屏')
          assert(targetBox && Math.abs(targetBox.y + targetBox.height / 2 - box.y - box.height / 2) <= 1, '环境与主动作同一行')
          const gap = box.x - targetBox.x - targetBox.width
          assert(gap >= 0 && gap <= 24, '主动作紧邻环境选择')
          assert(coverageBox && coverageBox.y >= box.y + box.height && coverageBox.y + coverageBox.height <= viewport.height, '覆盖内容在主动作下方的首屏')
          await assertNoHorizontalOverflow(page, `data preparation ${viewport.width}`)
        }
        assert.deepEqual(history.actions, [], '切换环境和查看记录不发送写操作')
      },
    },
  ]
}
