import { MANUAL_ACCEPTANCE_CORE_CONTRACT } from '../../../scripts/qa/manual-acceptance-core-contract.mjs'
import { buildManualAcceptanceBusinessChainReviewPlan } from '../../../scripts/qa/manual-acceptance-business-chain-contract.mjs'
import { MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS } from '../../../scripts/qa/manual-acceptance-dataset.mjs'
import {
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  projectDataPreparationAcceptancePlan,
  validateDevDataPreparationSummary,
  validateDevDataPreparationOperation,
} from '../../src/dev-workbench/config/devDataPreparation.mjs'
import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_HASH = 'a'.repeat(64)
const TARGET_FINGERPRINT = 'b'.repeat(64)
const REPOSITORY_FINGERPRINT = 'c'.repeat(64)
const RUN_ID = 'core_demo_20260729'
const CREATED_AT = '2026-07-29T02:00:00.000Z'
const UPDATED_AT = '2026-07-29T02:01:00.000Z'
const ACCEPTANCE_PLAN = buildManualAcceptanceBusinessChainReviewPlan({
  catalogTargetCount: 51,
  datasetStageKeys: MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
})

function operationFixture(overrides = {}) {
  const operation = {
    id: OPERATION_ID,
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo,
    status: 'ready',
    planHash: PLAN_HASH,
    runId: RUN_ID,
    contract: {
      schemaVersion: 'plush.dev-data-preparation-operation-contract/v1',
      classification: 'current',
      dataVersion: MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion,
      datasetRunId: MANUAL_ACCEPTANCE_CORE_CONTRACT.runId,
      semanticDigest: '6'.repeat(64),
    },
    repository: {
      commit: 'd'.repeat(40),
      dirty: false,
      fingerprint: REPOSITORY_FINGERPRINT,
    },
    targetSummary: {
      targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
      safeTarget: '共享开发库（固定身份）',
      targetFingerprint: TARGET_FINGERPRINT,
      preflightFingerprint: 'f'.repeat(64),
      disposable: false,
      automaticCleanup: false,
    },
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    timing: {
      startedAt: null,
      completedAt: null,
      durationMs: null,
    },
    events: [
      {
        at: CREATED_AT,
        status: 'ready',
        message: '固定计划已准备',
      },
    ],
    issues: [],
    readback: null,
    confirmationRequired: `DATA_PREPARATION:core-demo:local-development:${RUN_ID}:${PLAN_HASH}:${OPERATION_ID}`,
    terminal: false,
    ...overrides,
  }
  return operation
}

function createSummary() {
  return {
    schemaVersion: 'plush.dev-data-preparation-summary/v2',
    status: 'success',
    generatedAt: CREATED_AT,
    repository: {
      commit: 'd'.repeat(40),
      dirty: false,
      fingerprint: REPOSITORY_FINGERPRINT,
    },
    acceptancePlan: projectDataPreparationAcceptancePlan(ACCEPTANCE_PLAN),
    datasetContract: {
      schemaVersion: 'plush.dev-data-environment-contract/v1',
      datasetKey: 'yoyoosun-manual-acceptance',
      dataVersion: MANUAL_ACCEPTANCE_CORE_CONTRACT.dataVersion,
      runId: MANUAL_ACCEPTANCE_CORE_CONTRACT.runId,
      semanticDigest: '6'.repeat(64),
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
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configRevision,
        configProductVersion:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configProductVersion,
      },
    },
    target: {
      coreDemo: {
        status: 'available',
        safeTarget: '共享开发库（固定身份）',
        databaseName: 'plush_erp',
        migrationVersion:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.minimumMigration,
        customerConfigRevision: 'not-proven',
        customerConfigProductVersion: 'not-proven',
        targetFingerprint: TARGET_FINGERPRINT,
      },
      scenarioDemo: {
        status: 'available',
        safeTarget: '共享开发库业务场景（固定身份）',
        databaseName: 'plush_erp',
        migrationVersion:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.minimumMigration,
        customerConfigRevision:
          'yoyoosun-customer-package-v7.local-bfd51004a4c35b47.runtime-v1',
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
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configRevision,
        customerConfigProductVersion:
          MANUAL_ACCEPTANCE_CORE_CONTRACT.customerTrial133.configProductVersion,
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
    profiles: [
      {
        key: 'core-demo',
        title: '共享开发基础数据',
        purpose: '稳定准备共享账号与基础主数据',
        writesDatabase: true,
        dataRetention: 'long-lived',
        cleanupMode: 'not-supported',
        exactCleanCommitRequired: false,
        requiredEnvironment: ['共享开发库'],
      },
      {
        key: 'scenario-demo',
        title: '业务场景演示数据',
        purpose: '补齐固定批次业务场景，不是完整验收',
        writesDatabase: true,
        dataRetention: 'long-lived',
        cleanupMode: 'forward-only',
        exactCleanCommitRequired: false,
        requiredEnvironment: ['共享开发库', '固定场景目录'],
      },
      {
        key: 'full-acceptance',
        title: '完整验收数据',
        purpose: '在隔离库执行 51 项验收',
        writesDatabase: true,
        dataRetention: 'ephemeral',
        cleanupMode: 'automatic',
        exactCleanCommitRequired: true,
        requiredEnvironment: ['clean exact commit', '专用隔离库'],
      },
    ],
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

export function createDataPreparationBrowserFixture() {
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
  validateDevDataPreparationSummary(summary)
  const operation = operationFixture({ repository: summary.repository })
  validateDevDataPreparationOperation(operation)
  return {
    summary,
    operation,
    actions: [],
    reads: [],
    failReads: false,
    releaseRead: null,
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
      if (fixture.releaseRead) await fixture.releaseRead
      return fixture.failReads
        ? json({ message: '预检暂不可用' }, 503)
        : json(fixture.summary)
    }
    if (url.pathname.endsWith('/session')) {
      return json({
        schemaVersion: 'plush.dev-data-preparation-session/v1',
        csrfToken: 'data-preparation-browser-csrf-token-fixture',
        apiPrefix: '/__dev/api/data-preparation',
      })
    }
    if (url.pathname.endsWith('/actions')) {
      const action = route.request().postDataJSON()
      fixture.actions.push(action)
      if (action.action !== 'prepare') {
        throw new Error('页面回归只核对准备与确认，不执行数据写入')
      }
      fixture.summary.currentOperations = [fixture.operation]
      if (fixture.prepareWait) await fixture.prepareWait
      return json({
        schemaVersion: 'plush.dev-data-preparation-action-result/v1',
        action: 'prepare',
        operation: fixture.operation,
      })
    }
    if (url.pathname.endsWith(`/operations/${OPERATION_ID}`)) {
      return json({
        schemaVersion: 'plush.dev-data-preparation-operation-result/v1',
        operation: fixture.operation,
      })
    }
    throw new Error(`未登记的数据准备夹具路径：${url.pathname}`)
  })
}

export function createDevDataPreparationScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  let fixture
  return [
    {
      name: 'dev-data-preparation-workflow-desktop',
      path: '/__dev/data-preparation?view=confirm',
      viewport: { width: 1440, height: 1000 },
      expectedConsoleErrorPatterns: [/console error.*503/u],
      beforeNavigate: async (page) => {
        fixture = createDataPreparationBrowserFixture()
        await installDataPreparationBrowserRoutes(page, fixture)
      },
      verify: async (page) => {
        await expectHeading(page, '选择要准备的数据')
        assert.equal(
          await page
            .getByRole('radio', { name: '长期业务场景数据', exact: true })
            .isChecked(),
          true
        )
        assert.equal(
          await page
            .getByRole('radio', { name: '本地开发', exact: true })
            .isChecked(),
          true
        )
        assert.equal(
          await page
            .getByRole('button', {
              name: '生成业务场景测试数据',
              exact: true,
            })
            .isDisabled(),
          true
        )
        assert.deepEqual(fixture.actions, [], '默认选择不得自动准备或执行')
        await page
          .getByRole('radio', { name: '按最新业务链完整回归', exact: true })
          .check()
        assert.equal(
          await page
            .getByRole('tab', { name: '当前批次', exact: true })
            .count(),
          0
        )
        assert.equal(
          await page
            .getByRole('button', { name: '准备新批次', exact: true })
            .isDisabled(),
          true
        )
        const blockers = page.getByRole('region', {
          name: '本次准备需要处理的条件',
        })
        await blockers
          .getByText('完整验收数据库环境未配置', { exact: true })
          .waitFor()
        assert.equal(
          await blockers.getByText('本地业务场景的运行预检未通过').count(),
          0
        )
        assert.deepEqual(fixture.actions, [])
        await page
          .getByRole('radio', { name: '本地长期基础数据', exact: true })
          .check()
        const prepare = page.getByRole('button', {
          name: '准备不可变计划',
          exact: true,
        })
        await prepare.waitFor()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('button')].some(
            (button) =>
              button.textContent.includes('准备不可变计划') && !button.disabled
          )
        )
        await prepare.click()
        await page.getByRole('tab', { name: '当前批次', exact: true }).waitFor()
        assert.equal(
          await page
            .getByRole('tab', { name: '当前批次', exact: true })
            .getAttribute('aria-selected'),
          'true'
        )
        assert.equal(fixture.actions.length, 1)
        assert.equal(fixture.actions[0].payload.profileKey, 'core-demo')
        await page
          .getByRole('button', { name: '确认执行', exact: true })
          .click()
        const dialog = page.getByRole('dialog', {
          name: '确认执行不可变数据计划',
        })
        const execute = dialog.getByRole('button', {
          name: '执行固定计划',
          exact: true,
        })
        assert.equal(await execute.isDisabled(), true)
        await dialog
          .getByRole('textbox', { name: '不可变计划确认文本' })
          .fill(fixture.operation.confirmationRequired)
        assert.equal(await execute.isDisabled(), false)
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        await verifySlidingMotion(
          page,
          assert,
          '[aria-label="测试数据视图"]',
          2
        )
        await page
          .getByRole('heading', { name: '执行记录', exact: true })
          .waitFor()
        await verifySlidingMotion(
          page,
          assert,
          '[aria-label="测试数据视图"]',
          1,
          true
        )
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await page.reload()
        await page
          .getByRole('button', { name: '确认执行', exact: true })
          .waitFor()
        assert.equal(fixture.actions.length, 1, '刷新恢复批次不得重复准备')
        fixture.failReads = true
        await page
          .getByRole('button', { name: '重新检查', exact: true })
          .click()
        await page.getByText('预检读取失败', { exact: true }).waitFor()
        assert.equal(fixture.reads.at(-1), '?refresh=authoritative')
        assert.equal(
          await page
            .getByRole('button', { name: '确认执行', exact: true })
            .isDisabled(),
          true
        )
        fixture.failReads = false
        await page
          .getByRole('button', { name: '重新读取预检', exact: true })
          .click()
        await page
          .getByText('预检读取失败', { exact: true })
          .waitFor({ state: 'hidden' })
        assert.equal(
          await page
            .getByRole('button', { name: '确认执行', exact: true })
            .isDisabled(),
          false
        )
        await page.getByRole('tab', { name: '准备数据', exact: true }).click()
        assert.equal(
          await prepare.isDisabled(),
          false,
          '待确认计划允许重新准备，不要求先执行旧计划'
        )
        await page
          .getByRole('radio', { name: '长期业务场景数据', exact: true })
          .check()
        await page
          .getByRole('radio', { name: 'demo 演练环境', exact: true })
          .check()
        const scenarioPrepare = page.getByRole('button', {
          name: '生成业务场景测试数据',
          exact: true,
        })
        await page.waitForFunction(() =>
          [...document.querySelectorAll('button')].some(
            (button) =>
              button.textContent.includes('生成业务场景测试数据') &&
              !button.disabled
          )
        )
        assert.equal(await scenarioPrepare.isDisabled(), false)
        assert.equal(fixture.actions.length, 1)
        await assertNoHorizontalOverflow(page, 'dev-data-preparation-workflow')
        let releasePrepare
        fixture.prepareWait = new Promise((resolve) => {
          releasePrepare = resolve
        })
        await page
          .getByRole('radio', { name: '本地长期基础数据', exact: true })
          .check()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('button')].some(
            (button) =>
              button.textContent.includes('准备不可变计划') && !button.disabled
          )
        )
        await prepare.click()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('button')].some(
            (button) =>
              button.textContent.includes('准备不可变计划') && button.disabled
          )
        )
        await page.locator('a[href="/__dev"]').first().click()
        const departedUrl = page.url()
        releasePrepare()
        await page.waitForTimeout(250)
        assert.equal(
          page.url(),
          departedUrl,
          '离开页面后的准备响应不得修改新页面地址'
        )
        assert.equal(new URL(page.url()).pathname, '/__dev')
      },
    },
    {
      name: 'dev-data-preparation-4k',
      path: '/__dev/data-preparation',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        fixture = createDataPreparationBrowserFixture()
        fixture.summary.target.coreDemo.status = 'blocked'
        fixture.summary.issues.push({
          code: 'core_demo_target_unavailable',
          severity: 'blocked',
          message:
            '开发数据库迁移尚未到最新版本，请核对当前工作区的迁移、目标身份与运行状态后重新检查。',
        })
        await installDataPreparationBrowserRoutes(page, fixture)
      },
      verify: async (page) => {
        await expectHeading(page, '选择要准备的数据')
        const metrics = await page
          .locator('.erp-dev-data-section, .erp-dev-data-prepare-actions')
          .evaluateAll((elements) =>
            elements.map((element) => ({
              width: element.clientWidth,
              scrollWidth: element.scrollWidth,
              top: element.getBoundingClientRect().top,
              bottom: element.getBoundingClientRect().bottom,
            }))
          )
        assert(
          metrics.every((box) => box.scrollWidth <= box.width + 1),
          JSON.stringify(metrics)
        )
        assert(metrics[1].bottom < 1000, '准备按钮应处于首屏内')
        assert.equal(
          await page.locator('.erp-dev-data-disclosure[open]').count(),
          0
        )
        await assertNoHorizontalOverflow(page, 'dev-data-preparation-4k')
      },
    },
  ]
}
