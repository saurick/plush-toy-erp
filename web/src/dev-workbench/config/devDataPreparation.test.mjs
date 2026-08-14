import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildManualAcceptanceBusinessChainReviewPlan } from '../../../../scripts/qa/manual-acceptance-business-chain-contract.mjs'
import { MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS } from '../../../../scripts/qa/manual-acceptance-dataset.mjs'
import {
  DEV_DATA_PREPARATION_ACTION_API_PATH,
  DEV_DATA_PREPARATION_API_PREFIX,
  DEV_DATA_PREPARATION_OPERATION_API_PREFIX,
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DATA_PREPARATION_SESSION_API_PATH,
  DEV_DATA_PREPARATION_SOURCE_PATH,
  DEV_DATA_PREPARATION_SUMMARY_API_PATH,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  createDataPreparationIdempotencyKey,
  createDevDataPreparationClient,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
  validateDevDataPreparationOperation,
  validateDevDataPreparationSummary,
} from './devDataPreparation.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_HASH = 'a'.repeat(64)
const TARGET_FINGERPRINT = 'b'.repeat(64)
const REPOSITORY_FINGERPRINT = 'c'.repeat(64)
const RUN_ID = 'core_demo_20260729'
const SCENARIO_OPERATION_RUN_ID = 'scenario_demo_20260729'
const SCENARIO_DATASET_RUN_ID = '20260815-V6'
const CREATED_AT = '2026-07-29T02:00:00.000Z'
const UPDATED_AT = '2026-07-29T02:01:00.000Z'
const ACCEPTANCE_PLAN = buildManualAcceptanceBusinessChainReviewPlan({
  catalogTargetCount: 51,
  datasetStageKeys: MANUAL_ACCEPTANCE_DATASET_STAGE_KEYS,
})

function response(payload, ok = true) {
  return {
    ok,
    async json() {
      return payload
    },
  }
}

function operationFixture(overrides = {}) {
  const operation = {
    id: OPERATION_ID,
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo,
    status: 'ready',
    planHash: PLAN_HASH,
    runId: RUN_ID,
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

function scenarioReadbackFixture(overrides = {}) {
  return {
    schemaVersion: 'plush.dev-data-preparation-readback/v1',
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
    targetEnvironment: DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
    targetFingerprint: '9'.repeat(64),
    databaseName: 'plush_erp',
    release: 'd'.repeat(40),
    migrationVersion: '20260728100514',
    customerConfigRevision:
      'yoyoosun-customer-package-v7.local-d05ec61cc4ea9cee.runtime-v1',
    datasetKey: 'yoyoosun-manual-acceptance',
    dataVersion: '2026.08.15-v6',
    runId: SCENARIO_DATASET_RUN_ID,
    semanticDigest: '6'.repeat(64),
    stageCount: 9,
    sourceDocumentCount: 16,
    processRuntimeCount: 20,
    factCount: 14,
    catalogReadyCount: 41,
    catalogTargetCount: 51,
    browserChecksPending: 10,
    manualAcceptanceCompleted: false,
    cleanupSupported: false,
    replayMode: 'exact-create-or-readback',
    ...overrides,
  }
}

function scenarioOperationFixture(overrides = {}) {
  return operationFixture({
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    status: 'passed',
    runId: SCENARIO_OPERATION_RUN_ID,
    targetSummary: {
      targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
      safeTarget: '共享开发库业务场景（固定身份）',
      targetFingerprint: '9'.repeat(64),
      preflightFingerprint: '8'.repeat(64),
      disposable: false,
      automaticCleanup: false,
    },
    confirmationRequired: '',
    terminal: true,
    readback: scenarioReadbackFixture(),
    ...overrides,
  })
}

function fullOperationFixture(overrides = {}) {
  const stageTimings = ACCEPTANCE_PLAN.dataStages.map(({ key }, index) => ({
    key,
    status: 'completed',
    startedAt: `2026-07-29T02:00:${String(index).padStart(2, '0')}.000Z`,
    completedAt: `2026-07-29T02:00:${String(index + 1).padStart(2, '0')}.000Z`,
    durationMs: 1000,
  }))
  return operationFixture({
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
    status: 'passed',
    targetSummary: {
      targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal,
      safeTarget: '专用隔离验收库',
      targetFingerprint: 'e'.repeat(64),
      preflightFingerprint: 'f'.repeat(64),
      disposable: true,
      automaticCleanup: true,
    },
    confirmationRequired: '',
    terminal: true,
    timing: {
      startedAt: CREATED_AT,
      completedAt: UPDATED_AT,
      durationMs: 60_000,
    },
    readback: {
      schemaVersion: 'plush.dev-data-preparation-readback/v1',
      profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
      targetFingerprint: 'e'.repeat(64),
      reportStatus: 'passed',
      cleanupComplete: true,
      residualDatabaseCount: 0,
      dataVersion: '2026.08.15-v6',
      chainDataDigest: ACCEPTANCE_PLAN.chainDataDigest,
      chainVerificationDigest: ACCEPTANCE_PLAN.chainVerificationDigest,
      chainCount: ACCEPTANCE_PLAN.chainCount,
      stepCount: ACCEPTANCE_PLAN.stepCount,
      scenarioCount: ACCEPTANCE_PLAN.scenarioCount,
      dataStageCount: ACCEPTANCE_PLAN.dataStageCount,
      catalogTargetCount: ACCEPTANCE_PLAN.catalogTargetCount,
      datasetStartedAt: CREATED_AT,
      datasetCompletedAt: UPDATED_AT,
      datasetDurationMs: 60_000,
      stageTimings,
    },
    ...overrides,
  })
}

function summaryFixture() {
  return {
    schemaVersion: 'plush.dev-data-preparation-summary/v1',
    status: 'success',
    generatedAt: CREATED_AT,
    repository: {
      commit: 'd'.repeat(40),
      dirty: false,
      fingerprint: REPOSITORY_FINGERPRINT,
    },
    acceptancePlan: ACCEPTANCE_PLAN,
    datasetContract: {
      schemaVersion: 'plush.dev-data-environment-contract/v1',
      datasetKey: 'yoyoosun-manual-acceptance',
      dataVersion: '2026.08.15-v6',
      runId: '20260815-V6',
      semanticDigest: '6'.repeat(64),
      simulatedOnly: true,
      realCustomerImport: false,
      unitCount: 11,
      warehouseCount: 4,
      customerTrial133: {
        target: 'customer-trial-133',
        databaseName: 'plush_erp_uat_20260716_v5',
        databaseLifecycle: 'long-lived-registered-target',
        minimumMigration: '20260728100514',
        configRevision:
          'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1',
        configProductVersion: 'customer-trial-133-test-2026.08.15-v6',
      },
    },
    target: {
      coreDemo: {
        status: 'available',
        safeTarget: '共享开发库（固定身份）',
        databaseName: 'plush_erp',
        migrationVersion: '20260728100514',
        customerConfigRevision: 'not-proven',
        customerConfigProductVersion: 'not-proven',
        targetFingerprint: TARGET_FINGERPRINT,
      },
      scenarioDemo: {
        status: 'available',
        safeTarget: '共享开发库业务场景（固定身份）',
        databaseName: 'plush_erp',
        migrationVersion: '20260728100514',
        customerConfigRevision:
          'yoyoosun-customer-package-v7.local-d05ec61cc4ea9cee.runtime-v1',
        customerConfigProductVersion: 'local-customer-package-test-apply',
        targetFingerprint: '9'.repeat(64),
      },
      scenarioDemo133: {
        status: 'not_proven',
        safeTarget: 'customer-trial-133:plush_erp_uat_20260716_v5',
        databaseName: 'plush_erp_uat_20260716_v5',
        migrationVersion: '20260728100514',
        customerConfigRevision:
          'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1',
        customerConfigProductVersion: 'customer-trial-133-test-2026.08.15-v6',
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
    operations: [operationFixture()],
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

test('data preparation uses one fixed DEV-only API surface', () => {
  assert.equal(DEV_DATA_PREPARATION_ROUTE, '/__dev/data-preparation')
  assert.equal(DEV_DATA_PREPARATION_API_PREFIX, '/__dev/api/data-preparation')
  assert.equal(
    DEV_DATA_PREPARATION_SESSION_API_PATH,
    '/__dev/api/data-preparation/session'
  )
  assert.equal(
    DEV_DATA_PREPARATION_SUMMARY_API_PATH,
    '/__dev/api/data-preparation/summary'
  )
  assert.equal(
    DEV_DATA_PREPARATION_ACTION_API_PATH,
    '/__dev/api/data-preparation/actions'
  )
  assert.equal(
    DEV_DATA_PREPARATION_OPERATION_API_PREFIX,
    '/__dev/api/data-preparation/operations'
  )
  assert.equal(
    DEV_DATA_PREPARATION_SOURCE_PATH,
    'docs/engineering/研发效能工作台与CI-CD设计.md'
  )
})

test('scenario demo copy keeps one-click review, forward-only and acceptance boundaries visible', () => {
  const copy =
    DEV_DATA_PREPARATION_PROFILE_COPY[
      DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
    ]

  assert.equal(copy.targetKey, 'scenarioDemo')
  assert.equal(copy.badgeLabel, '长期保留')
  assert.equal(copy.prepareButtonLabel, '生成业务场景测试数据')
  assert.match(copy.prepareDescription, /权威读回目标身份/u)
  assert.match(copy.prepareDescription, /二次确认/u)
  assert.match(copy.prepareDescription, /133/u)
  assert.match(copy.prepareDescription, /DSN/u)
  assert.match(copy.confirmationDescription, /release/u)
  assert.match(copy.confirmationDescription, /不清空历史/u)
  assert.match(copy.retention, /不清空已有数据/u)
  assert.match(copy.cleanup, /forward-only/u)
  assert.match(copy.purpose, /不是完整验收/u)
})

test('scenario demo uses the prepared confirmation without exposing a typed secret or long token', () => {
  const scenarioOperation = operationFixture({
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    confirmationRequired: `DATA_PREPARATION:scenario-demo:local-development:${SCENARIO_OPERATION_RUN_ID}:${PLAN_HASH}:${OPERATION_ID}`,
  })
  assert.equal(
    resolveDataPreparationExecutionConfirmation(
      scenarioOperation,
      'ignored-browser-text'
    ),
    scenarioOperation.confirmationRequired
  )
  assert.equal(
    resolveDataPreparationExecutionConfirmation(
      operationFixture(),
      'typed-exact-confirmation'
    ),
    'typed-exact-confirmation'
  )
  assert.throws(
    () => resolveDataPreparationExecutionConfirmation(null),
    /operation 无效/u
  )
})

test('summary contract requires three fixed profiles and fail-closed boundaries', () => {
  assert.equal(
    validateDevDataPreparationSummary(summaryFixture()).status,
    'success'
  )

  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        profiles: summaryFixture().profiles.slice(0, 1),
      }),
    /profile set/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        arbitraryInput: true,
      }),
    /unsupported fields/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        profiles: [
          ...summaryFixture().profiles,
          {
            ...summaryFixture().profiles[0],
            key: 'custom-profile',
          },
        ],
      }),
    /profile/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        boundaries: {
          ...summaryFixture().boundaries,
          browserTargetInputAllowed: true,
        },
      }),
    /boundary/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationSummary({
        ...summaryFixture(),
        repository: {
          ...summaryFixture().repository,
          commit: 'd'.repeat(64),
        },
      }),
    /repository identity/u
  )
  assert.equal(
    validateDevDataPreparationSummary(summaryFixture()).acceptancePlan
      .catalogTargetCount,
    51
  )
})

test('operation contract binds lowercase run identity and exact confirmation to the immutable plan', () => {
  assert.equal(
    validateDevDataPreparationOperation(operationFixture()).status,
    'ready'
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({ runId: 'Core-Demo-20260729' })
      ),
    /operation/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          issues: [
            {
              code: 'UPPER_CODE',
              severity: 'blocked',
              message: '不接受扩张后的 issue code',
            },
          ],
        })
      ),
    /issue/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({ confirmationRequired: 'DATA_PREPARATION:any' })
      ),
    /state/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          status: 'passed',
          confirmationRequired: '',
          terminal: false,
        })
      ),
    /state/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          events: [
            {
              at: CREATED_AT,
              status: 'custom_status',
              message: '不得扩张 event status',
            },
          ],
        })
      ),
    /event status/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        operationFixture({
          status: 'passed',
          confirmationRequired: '',
          terminal: true,
          readback: {
            schemaVersion: 'plush.dev-data-preparation-readback/v1',
            profileKey: 'core-demo',
            targetFingerprint: TARGET_FINGERPRINT,
            preflight: 'passed',
            roleAccounts: 0,
            core: {
              units: 1,
              materials: 1,
              products: 1,
              warehouses: 1,
              processes: 1,
              bomHeaders: 1,
            },
            stableUpsert: true,
            cleanupSupported: false,
          },
        })
      ),
    /core demo readback/u
  )
})

test('full regression readback requires current chain counts and real stage timings', () => {
  const operation = fullOperationFixture()
  assert.equal(
    validateDevDataPreparationOperation(operation).readback.stageTimings.length,
    9
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        fullOperationFixture({
          readback: {
            ...operation.readback,
            datasetDurationMs: -1,
          },
        })
      ),
    /timing/u
  )
})

test('scenario demo readback binds the fixed batch and rejects half batches or drift', () => {
  const operation = validateDevDataPreparationOperation(
    scenarioOperationFixture()
  )
  assert.equal(operation.profileKey, 'scenario-demo')
  assert.equal(operation.readback.catalogReadyCount, 41)
  assert.equal(operation.readback.browserChecksPending, 10)
  assert.equal(operation.readback.cleanupSupported, false)
  assert.equal(operation.readback.manualAcceptanceCompleted, false)
  assert.equal(operation.readback.replayMode, 'exact-create-or-readback')

  const remoteTargetSummary = {
    targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133,
    safeTarget: 'customer-trial-133:plush_erp_uat_20260716_v5',
    targetFingerprint: '7'.repeat(64),
    preflightFingerprint: '8'.repeat(64),
    disposable: false,
    automaticCleanup: false,
    releaseSha: 'd'.repeat(40),
    databaseName: 'plush_erp_uat_20260716_v5',
    migrationVersion: '20260728100514',
    customerConfigRevision:
      'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1',
    datasetVersion: '2026.08.15-v6',
    datasetRunId: SCENARIO_DATASET_RUN_ID,
    semanticDigest: '6'.repeat(64),
    rollbackPoint: 'pre-data-dddddddddddd-d260729020304_01020304',
  }
  const remoteReadback = scenarioReadbackFixture({
    targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133,
    targetEnvironment: DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133,
    targetFingerprint: remoteTargetSummary.targetFingerprint,
    databaseName: remoteTargetSummary.databaseName,
    customerConfigRevision: remoteTargetSummary.customerConfigRevision,
    backupReceipt: {
      schemaVersion: 'plush.customer-trial-133-data-backup/v1',
      status: 'passed',
      backupAlias: remoteTargetSummary.rollbackPoint,
      releaseSha: remoteTargetSummary.releaseSha,
      databaseName: remoteTargetSummary.databaseName,
      migrationVersion: remoteTargetSummary.migrationVersion,
      sha256: '9'.repeat(64),
      sizeBytes: 4096,
      createdAt: '2026-07-29T02:03:04.000Z',
      containsSecrets: false,
      containsCredentials: false,
      containsPaths: false,
    },
  })
  const remoteOperation = validateDevDataPreparationOperation(
    scenarioOperationFixture({
      targetSummary: remoteTargetSummary,
      readback: remoteReadback,
    })
  )
  assert.equal(remoteOperation.readback.backupReceipt.status, 'passed')
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          targetSummary: remoteTargetSummary,
          readback: {
            ...remoteReadback,
            backupReceipt: {
              ...remoteReadback.backupReceipt,
              backupAlias: 'pre-data-eeeeeeeeeeee-d260729020304_01020304',
            },
          },
        })
      ),
    /backup receipt/u
  )

  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({ catalogReadyCount: 51 }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({
            runId: '20260816-V7',
          }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({ browserChecksPending: 9 }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({
            targetFingerprint: '7'.repeat(64),
          }),
        })
      ),
    /readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: scenarioReadbackFixture({ cleanupSupported: true }),
        })
      ),
    /scenario demo readback/u
  )
  assert.throws(
    () =>
      validateDevDataPreparationOperation(
        scenarioOperationFixture({
          readback: {
            ...scenarioReadbackFixture(),
            arbitraryCount: 1,
          },
        })
      ),
    /unsupported fields/u
  )
})

test('prepare intent keeps one idempotency key until the intent is proven or reset', () => {
  const firstIntent = resolveDataPreparationPrepareIntent(
    null,
    'core-demo',
    'local-development',
    () => '22222222-2222-4222-8222-222222222222'
  )
  const retriedIntent = resolveDataPreparationPrepareIntent(
    firstIntent,
    'core-demo',
    'local-development',
    () => {
      throw new Error('retry must not allocate a second key')
    }
  )
  assert.equal(retriedIntent, firstIntent)

  const resetIntent = resolveDataPreparationPrepareIntent(
    firstIntent,
    'full-acceptance',
    'isolated-local',
    () => '33333333-3333-4333-8333-333333333333'
  )
  assert.equal(resetIntent.profileKey, 'full-acceptance')
  assert.notEqual(resetIntent.idempotencyKey, firstIntent.idempotencyKey)

  const scenarioIntent = resolveDataPreparationPrepareIntent(
    resetIntent,
    'scenario-demo',
    'customer-trial-133',
    () => '77777777-7777-4777-8777-777777777777'
  )
  assert.equal(scenarioIntent.profileKey, 'scenario-demo')
  assert.equal(scenarioIntent.targetKey, 'customer-trial-133')
  assert.match(
    scenarioIntent.idempotencyKey,
    /^data-preparation:prepare:scenario-demo:/u
  )
})

test('refresh recovery resumes the newest nonterminal operation and preserves an explicit current receipt', () => {
  const olderReady = operationFixture({
    id: '44444444-4444-4444-8444-444444444444',
    updatedAt: '2026-07-29T02:02:00.000Z',
  })
  const newerRunning = operationFixture({
    id: '55555555-5555-4555-8555-555555555555',
    status: 'running',
    confirmationRequired: '',
    updatedAt: '2026-07-29T02:03:00.000Z',
  })
  const newestScenarioRunning = scenarioOperationFixture({
    id: '77777777-7777-4777-8777-777777777777',
    status: 'running',
    confirmationRequired: '',
    terminal: false,
    readback: null,
    updatedAt: '2026-07-29T02:05:00.000Z',
  })
  const terminal = operationFixture({
    id: '66666666-6666-4666-8666-666666666666',
    status: 'passed',
    confirmationRequired: '',
    terminal: true,
    updatedAt: '2026-07-29T02:04:00.000Z',
  })
  const operations = [olderReady, terminal, newerRunning, newestScenarioRunning]

  assert.equal(
    selectRecoverableDataPreparationOperation(operations)?.id,
    newestScenarioRunning.id
  )
  assert.equal(
    selectRecoverableDataPreparationOperation(operations)?.profileKey,
    'scenario-demo'
  )
  assert.equal(
    selectRecoverableDataPreparationOperation(operations, terminal.id)?.id,
    terminal.id
  )
  assert.equal(selectRecoverableDataPreparationOperation([terminal]), null)

  const fullAcceptanceReady = operationFixture({
    id: '88888888-8888-4888-8888-888888888888',
    profileKey: DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
    updatedAt: '2026-07-29T02:01:00.000Z',
  })
  assert.equal(
    selectRecoverableDataPreparationOperation(
      [olderReady],
      '',
      DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
    ),
    null
  )
  assert.equal(
    selectRecoverableDataPreparationOperation(
      [olderReady, fullAcceptanceReady],
      '',
      DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
    )?.id,
    fullAcceptanceReady.id
  )
  const trialReady = scenarioOperationFixture({
    id: '99999999-9999-4999-8999-999999999999',
    targetSummary: {
      ...scenarioOperationFixture().targetSummary,
      targetKey: DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133,
      targetFingerprint: '7'.repeat(64),
    },
    readback: null,
    status: 'ready',
    confirmationRequired:
      'DATA_PREPARATION:scenario-demo:customer-trial-133:d260729020304_01020304:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc:99999999-9999-4999-8999-999999999999',
    terminal: false,
  })
  assert.equal(
    selectRecoverableDataPreparationOperation(
      [olderReady, trialReady],
      '',
      DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
      DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
    )?.id,
    trialReady.id
  )
  assert.equal(
    selectRecoverableDataPreparationOperation(
      [fullAcceptanceReady, newerRunning],
      '',
      DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
    )?.id,
    newerRunning.id
  )
})

test('client reuses one CSRF session and only posts prepare or execute envelopes', async () => {
  const requests = []
  const readyOperation = operationFixture()
  const runningOperation = operationFixture({
    status: 'running',
    confirmationRequired: '',
    terminal: false,
    updatedAt: '2026-07-29T02:02:00.000Z',
  })
  const client = createDevDataPreparationClient({
    async fetchImpl(url, options) {
      requests.push({ url, options })
      if (url === DEV_DATA_PREPARATION_SESSION_API_PATH) {
        return response({
          schemaVersion: 'plush.dev-data-preparation-session/v1',
          csrfToken: 's'.repeat(43),
          apiPrefix: DEV_DATA_PREPARATION_API_PREFIX,
        })
      }
      if (url === DEV_DATA_PREPARATION_SUMMARY_API_PATH) {
        return response(summaryFixture())
      }
      if (url.startsWith(DEV_DATA_PREPARATION_OPERATION_API_PREFIX)) {
        return response({
          schemaVersion: 'plush.dev-data-preparation-operation-result/v1',
          operation: runningOperation,
        })
      }
      const body = JSON.parse(options.body)
      return response({
        schemaVersion: 'plush.dev-data-preparation-action-result/v1',
        action: body.action,
        operation:
          body.action === 'prepare' ? readyOperation : runningOperation,
        reused: false,
      })
    },
  })

  assert.equal((await client.summary()).profiles.length, 3)
  assert.equal((await client.operation(OPERATION_ID)).status, 'running')
  const idempotencyKey = createDataPreparationIdempotencyKey(
    'core-demo',
    'local-development',
    () => '22222222-2222-4222-8222-222222222222'
  )
  await client.prepare('core-demo', 'local-development', idempotencyKey)
  await client.execute(OPERATION_ID, readyOperation.confirmationRequired)

  assert.equal(
    requests.filter(
      (request) => request.url === DEV_DATA_PREPARATION_SESSION_API_PATH
    ).length,
    1
  )
  const posts = requests.filter(
    (request) => request.url === DEV_DATA_PREPARATION_ACTION_API_PATH
  )
  assert.equal(posts.length, 2)
  assert.deepEqual(JSON.parse(posts[0].options.body), {
    action: 'prepare',
    payload: {
      profileKey: 'core-demo',
      targetKey: 'local-development',
      idempotencyKey,
    },
  })
  assert.deepEqual(JSON.parse(posts[1].options.body), {
    action: 'execute',
    payload: {
      operationId: OPERATION_ID,
      confirmation: readyOperation.confirmationRequired,
    },
  })
  assert(
    posts.every(
      (request) => request.options.headers['x-csrf-token'] === 's'.repeat(43)
    )
  )
  assert.throws(
    () =>
      client.prepare(
        'core-demo',
        'local-development',
        'data-preparation:prepare:core-demo:arbitrary'
      ),
    /参数无效/u
  )
  assert.throws(
    () =>
      client.execute(
        OPERATION_ID,
        readyOperation.confirmationRequired.replace(
          OPERATION_ID,
          '77777777-7777-4777-8777-777777777777'
        )
      ),
    /参数无效/u
  )
})

test('client surfaces only a bounded backend message on rejected requests', async () => {
  const client = createDevDataPreparationClient({
    async fetchImpl() {
      return response(
        {
          message: '固定目标预检未通过',
        },
        false
      )
    },
  })
  await assert.rejects(
    () => client.summary(),
    /数据准备预检读取失败：固定目标预检未通过/u
  )
})

test('page defaults to the latest business-chain regression while retaining daily integration profiles', () => {
  const pageSource = readFileSync(
    new URL('../pages/DevDataPreparationPage.jsx', import.meta.url),
    'utf8'
  )
  assert.match(pageSource, /DEV_DATA_PREPARATION_PROFILE_COPY/u)
  assert.match(pageSource, /profiles\.map/u)
  assert.match(pageSource, /生成业务场景测试数据/u)
  assert.match(pageSource, /确认生成业务场景测试数据/u)
  assert.match(pageSource, /准备回归数据/u)
  assert.match(pageSource, /确认完整回归能否开始/u)
  assert.match(pageSource, /核对最新业务链与数据范围/u)
  assert.match(pageSource, /准备并确认新批次/u)
  assert.match(pageSource, /查看回执与耗时/u)
  assert.match(pageSource, /AcceptancePlanReview/u)
  assert.match(pageSource, /DatasetEnvironmentContract/u)
  assert.match(pageSource, /统一数据合同/u)
  assert.match(pageSource, /本地长期数据/u)
  assert.match(pageSource, /133 试用数据/u)
  assert.match(pageSource, /隔离完整验收/u)
  assert.match(pageSource, /不是永绅真实客户导入/u)
  assert.match(pageSource, /选择只影响计划下钻/u)
  assert.match(pageSource, /代码变化后，旧数据怎么处理/u)
  assert.match(pageSource, /实际执行：/u)
  assert.match(pageSource, /stageTimings/u)
  assert.match(pageSource, /PROFILE_QUERY_KEY/u)
  assert.match(pageSource, /TARGET_QUERY_KEY/u)
  assert.match(pageSource, /searchParams\.get\(PROFILE_QUERY_KEY\)/u)
  assert.match(pageSource, /searchParams\.get\(TARGET_QUERY_KEY\)/u)
  assert.match(pageSource, /new AbortController\(\)/u)
  assert.match(pageSource, /signal: controller\.signal/u)
  assert.match(pageSource, /customerTrial133/u)
  assert.match(pageSource, /targetSummary\.targetKey/u)
  assert.match(pageSource, /erp-dev-data-operation-technical/u)
  assert.match(pageSource, /erp-dev-data-history/u)
  assert.match(pageSource, /展开历史回执/u)
  assert.match(pageSource, /compact && operation\.status === 'ready'/u)
  assert.match(pageSource, /open=\{technicalOpen\}/u)
  assert.match(pageSource, /onToggle=\{\(event\) =>/u)
  assert.match(pageSource, /READBACK_PRESENTATIONS/u)
  assert.match(pageSource, /selectedProfileCopy\.prepareDescription/u)
  assert.match(pageSource, /successDescription/u)
  assert.match(pageSource, /confirmationDescription/u)
  assert.match(pageSource, /resolveDataPreparationExecutionConfirmation/u)
  assert.match(pageSource, /DevCustomerScopeSelector/u)
  assert.match(pageSource, /useDevCustomerScope/u)
  assert.match(pageSource, /normalize: selectedIsScenarioDemo/u)
  assert.match(pageSource, /\(!selectedIsScenarioDemo \|\| customerReady\)/u)
  assert.match(pageSource, /\(!currentIsScenarioDemo \|\| customerReady\)/u)
  assert.match(pageSource, /label="业务场景甲方"/u)
  assert.match(pageSource, /其他数据准备方式不受影响/u)
  assert.match(pageSource, /exact confirmation/u)
  assert.match(
    pageSource,
    /<DevPageNav sourcePath=\{DEV_DATA_PREPARATION_SOURCE_PATH\}/u
  )
  assert.match(pageSource, /selectRecoverableDataPreparationOperation/u)
  assert.match(pageSource, /profileTargetKey\(selectedProfileKey/u)
  assert.match(pageSource, /releaseSha/u)
  assert.match(pageSource, /customerConfigRevision/u)
  assert.match(pageSource, /rollbackPoint/u)
  assert.equal(pageSource.match(/<Input\b/gu)?.length, 1)
  assert.match(pageSource, /aria-label="不可变计划确认文本"/u)
  assert.doesNotMatch(pageSource, /<label\b/u)
  assert.match(
    pageSource,
    /function ProfileOption[\s\S]*?<div[\s\S]*?<Radio value=\{profile\.key\}>/u
  )
  assert.match(pageSource, /cancelButtonProps=\{\{ disabled: executing \}\}/u)
  assert.match(pageSource, /closable=\{!executing\}/u)
  assert.match(pageSource, /maskClosable=\{!executing\}/u)
  assert.match(pageSource, /keyboard=\{!executing\}/u)
  assert.doesNotMatch(
    pageSource,
    /name=["'](?:host|target|path|command|sql|dsn|url|password)["']/iu
  )
  assert.doesNotMatch(
    pageSource,
    /(?:spawn|child_process|execFile|\/Users\/|192[.]168)/u
  )

  const buttonLabels = Array.from(
    pageSource.matchAll(/<Button\b[^>]*>([\s\S]*?)<\/Button>/gu),
    (match) => match[1].replace(/<[^>]+>/gu, '').trim()
  )
  assert(
    buttonLabels.every((label) => !/(?:清理|删除)/u.test(label)),
    'the page must not expose cleanup or delete buttons'
  )
})

test('data preparation route stays outside formal menu, seedData and RBAC projection', () => {
  const routerSource = readFileSync(
    new URL('../../erp/router.jsx', import.meta.url),
    'utf8'
  )
  const formalSources = [
    '../../erp/config/seedData.mjs',
    '../../erp/config/menuPermissions.mjs',
  ].map((relativePath) =>
    readFileSync(new URL(relativePath, import.meta.url), 'utf8')
  )

  assert.match(
    routerSource,
    /const DevWorkbenchRoutes\s*=\s*import\.meta\.env\.DEV/u
  )
  assert.match(
    routerSource,
    /<Route path="\/__dev\/\*" element=\{<DevWorkbenchRoutes \/>\}/u
  )
  formalSources.forEach((source) => {
    assert.doesNotMatch(source, /data-preparation|测试数据准备中心/u)
  })
})
