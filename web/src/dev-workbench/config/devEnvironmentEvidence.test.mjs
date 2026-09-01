import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDevDeliveryOperationOverview,
  buildDevEnvironmentEvidence,
  devEnvironmentEvidenceStatusPresentation,
} from './devEnvironmentEvidence.mjs'

const COMMIT = 'a'.repeat(40)
const DIGEST = 'b'.repeat(64)
const TARGET_FINGERPRINT = 'c'.repeat(64)
const GENERATED_AT = '2026-08-15T02:00:00.000Z'

function operation(profileKey, readback, targetKey = 'local-development') {
  return {
    profileKey,
    status: 'passed',
    repository: {
      commit: COMMIT,
      dirty: false,
      fingerprint: 'd'.repeat(64),
    },
    targetSummary: { targetKey, targetFingerprint: TARGET_FINGERPRINT },
    runId:
      profileKey === 'full-acceptance' ? 'd260815020000_abcd1234' : 'fixed',
    updatedAt: GENERATED_AT,
    readback,
  }
}

function dataSummaryFixture() {
  return {
    generatedAt: GENERATED_AT,
    repository: {
      commit: COMMIT,
      dirty: false,
      fingerprint: 'd'.repeat(64),
    },
    datasetContract: {
      dataVersion: '2026.08.15-v6',
      runId: '20260815-V6',
      semanticDigest: DIGEST,
      unitCount: 11,
      warehouseCount: 4,
      customerTrial133: {
        databaseName: 'plush_erp_demo_v1',
        minimumMigration: '20260728100514',
        configRevision:
          'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1',
        configProductVersion: 'customer-trial-133-test-2026.08.15-v6',
      },
    },
    target: {
      scenarioDemo: {
        status: 'available',
        databaseName: 'plush_erp',
        migrationVersion: '20260728100514',
        customerConfigRevision: 'local-v8',
        customerConfigProductVersion: 'local-2026.08.15-v6',
        targetFingerprint: TARGET_FINGERPRINT,
      },
      fullAcceptance: { migrationVersion: '20260728100514' },
    },
    acceptancePlan: {
      chainDataDigest: 'e'.repeat(64),
      chainVerificationDigest: 'f'.repeat(64),
    },
    operations: [
      operation('core-demo', {
        core: { units: 11, warehouses: 4 },
      }),
      operation('scenario-demo', {
        dataVersion: '2026.08.15-v6',
        runId: '20260815-V6',
        targetFingerprint: TARGET_FINGERPRINT,
      }),
      operation('full-acceptance', {
        dataVersion: '2026.08.15-v6',
        reportStatus: 'passed',
        cleanupComplete: true,
        residualDatabaseCount: 0,
        chainDataDigest: 'e'.repeat(64),
        chainVerificationDigest: 'f'.repeat(64),
      }),
    ],
  }
}

function addTrialReadback(summary) {
  summary.operations.push(
    operation(
      'scenario-demo',
      {
        targetKey: 'customer-trial-133',
        databaseName: 'plush_erp_demo_v1',
        release: COMMIT,
        migrationVersion: '20260728100514',
        customerConfigRevision:
          'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1',
        dataVersion: '2026.08.15-v6',
        runId: '20260815-V6',
        semanticDigest: DIGEST,
        backupReceipt: {
          status: 'passed',
          backupAlias: 'pre-data-aaaaaaaaaaaa-d260815020304_01020304',
          sha256: '2'.repeat(64),
          sizeBytes: 4096,
        },
      },
      'customer-trial-133'
    )
  )
  return summary
}

function deliverySummaryFixture() {
  const target = (key, purpose, databaseName, endpoint) => ({
    target: key,
    purpose,
    generatedAt: GENERATED_AT,
    status: 'passed',
    remote: {
      runtime: {
        serverSha: COMMIT,
        webSha: COMMIT,
        databaseName,
        migrationVersion: '20260728100514',
        activeCustomerConfig: {
          revision:
            'yoyoosun-customer-trial-133-package-v8.runtime-manifest-v1',
          productVersion: 'customer-trial-133-test-2026.08.15-v6',
          datasetVersion: '2026.08.15-v6',
        },
        serverHealth: 'passed',
        serverReady: 'passed',
        webHealth: 'passed',
      },
      publicEntry: { status: 'passed', endpoint },
      backup: {
        tooling: 'passed',
        latestSha256: '1'.repeat(64),
        latestSizeBytes: 1024,
      },
    },
  })
  const demo = target(
    'demo-133',
    'project-demo-simulated',
    'plush_erp_demo_v1',
    'https://demo.yoyoosun.net'
  )
  const customerTest = target(
    'customer-test-133',
    'customer-clean-acceptance',
    'plush_erp_customer_test_v1',
    'https://test.yoyoosun.net'
  )
  return {
    generatedAt: GENERATED_AT,
    target: demo,
    targets: [
      {
        key: 'demo-133',
        purpose: 'project-demo-simulated',
        endpoint: 'https://demo.yoyoosun.net',
        preflight: demo,
      },
      {
        key: 'customer-test-133',
        purpose: 'customer-clean-acceptance',
        endpoint: 'https://test.yoyoosun.net',
        preflight: customerTest,
      },
    ],
    operations: [],
  }
}

test('environment evidence keeps one controller and four evidence cards', () => {
  const evidence = buildDevEnvironmentEvidence({
    dataSummary: dataSummaryFixture(),
    deliverySummary: deliverySummaryFixture(),
  })

  assert.equal(evidence.controller, '本地 DEV-only')
  assert.deepEqual(
    evidence.cards.map(({ key }) => key),
    [
      'local-development',
      'demo-133',
      'customer-test-133',
      'isolated-acceptance',
    ]
  )
  assert.equal(evidence.cards[0].status, 'success')
  assert.equal(evidence.cards[1].status, 'not_proven')
  assert.match(evidence.cards[1].nextAction, /demo 目标卡/u)
  assert.equal(evidence.cards[2].status, 'success')
  assert.equal(evidence.cards[2].datasetVersion, '保留现有数据')
  assert.match(evidence.cards[2].nextAction, /独立清空并重建/u)
  assert.equal(evidence.cards[3].status, 'success')
})

test('customer test data rebuild is independent from normal deployment readiness', () => {
  const deliverySummary = deliverySummaryFixture()
  deliverySummary.operations.push({
    id: '11111111-1111-4111-8111-111111111111',
    action: 'rebuild-database',
    target: 'customer-test-133',
    status: 'passed',
    updatedAt: '2026-08-15T03:00:00.000Z',
  })
  const evidence = buildDevEnvironmentEvidence({
    dataSummary: dataSummaryFixture(),
    deliverySummary,
  })
  const customerTest = evidence.cards[2]

  assert.equal(customerTest.status, 'success')
  assert.equal(customerTest.datasetVersion, 'clean-baseline')
  assert.equal(customerTest.datasetRunId, '11111111')
  assert.match(customerTest.datasetEvidence, /受控重建/u)
  assert.match(customerTest.rollbackBoundary, /绑定回滚点/u)
})

test('local and remote target failures remain independent', () => {
  const localFailed = buildDevEnvironmentEvidence({
    dataError: '本地读取失败',
    deliverySummary: deliverySummaryFixture(),
  })
  assert.equal(localFailed.cards[0].status, 'failed')
  assert.notEqual(localFailed.cards[1].status, 'failed')
  assert.notEqual(localFailed.cards[2].status, 'failed')

  const remoteFailed = buildDevEnvironmentEvidence({
    dataSummary: dataSummaryFixture(),
    deliveryError: '133 读取失败',
  })
  assert.equal(remoteFailed.cards[0].status, 'success')
  assert.equal(remoteFailed.cards[1].status, 'failed')
  assert.equal(remoteFailed.cards[2].status, 'failed')
  assert.equal(remoteFailed.cards[3].status, 'success')
})

test('demo becomes green only after its current target-bound persistent readback', () => {
  const evidence = buildDevEnvironmentEvidence({
    dataSummary: addTrialReadback(dataSummaryFixture()),
    deliverySummary: deliverySummaryFixture(),
  })

  assert.equal(evidence.cards[1].status, 'success')
  assert.equal(
    evidence.cards[1].datasetEvidence,
    'demo 项目演练造数已独立持久读回'
  )
  assert.match(evidence.cards[1].rollbackBoundary, /新回滚点/u)
  assert.equal(evidence.cards[0].status, 'success')
})

test('stale release, config or dataset evidence never becomes green', () => {
  const delivery = deliverySummaryFixture()
  delivery.targets[0].preflight.remote.runtime.serverSha = '9'.repeat(40)
  delivery.targets[0].preflight.remote.runtime.webSha = '9'.repeat(40)
  const evidence = buildDevEnvironmentEvidence({
    dataSummary: dataSummaryFixture(),
    deliverySummary: delivery,
  })

  assert.equal(evidence.cards[1].status, 'warning')
  assert.match(evidence.cards[1].nextAction, /Exact-SHA/u)

  const staleData = dataSummaryFixture()
  staleData.operations[1].readback.dataVersion = '2026.07.16-v5'
  assert.equal(
    buildDevEnvironmentEvidence({ dataSummary: staleData }).cards[0].status,
    'not_proven'
  )
})

test('delivery operation overview separates normal, empty, stale and failure states', () => {
  const operationSummary = {
    generatedAt: GENERATED_AT,
    issues: [],
    operations: [
      {
        action: 'promote',
        target: 'demo-133',
        status: 'failed',
        updatedAt: GENERATED_AT,
      },
    ],
  }
  const currentTime = Date.parse(GENERATED_AT) + 60_000
  assert.equal(
    buildDevDeliveryOperationOverview({
      summary: operationSummary,
      now: currentTime,
    }).state,
    'normal'
  )
  assert.match(
    buildDevDeliveryOperationOverview({
      summary: operationSummary,
      now: currentTime,
    }).strongestBlocker,
    /demo-133 · failed/u
  )
  assert.equal(
    buildDevDeliveryOperationOverview({
      summary: {
        ...operationSummary,
        issues: [
          {
            code: 'gitlab_provider_unavailable',
            level: 'error',
            message: 'GitLab 版本列表不可用',
          },
        ],
        operations: [
          {
            ...operationSummary.operations[0],
            issues: [
              {
                code: 'target_operation_failed',
                level: 'error',
                message: 'demo 目标初始化失败',
              },
            ],
          },
        ],
      },
      now: currentTime,
    }).strongestBlocker,
    'demo 目标初始化失败'
  )
  assert.equal(
    buildDevDeliveryOperationOverview({
      summary: {
        ...operationSummary,
        issues: [
          {
            code: 'gitlab_provider_unavailable',
            level: 'error',
            message: '远端 CI/CD 证据暂不可读',
          },
        ],
        operations: [],
      },
      now: currentTime,
    }).strongestBlocker,
    '远端 CI/CD 证据暂不可读'
  )
  assert.equal(
    buildDevDeliveryOperationOverview({
      summary: { ...operationSummary, operations: [] },
      now: currentTime,
    }).state,
    'empty'
  )
  assert.equal(
    buildDevDeliveryOperationOverview({
      summary: operationSummary,
      now: currentTime + 180_000,
    }).state,
    'stale'
  )
  assert.equal(
    buildDevDeliveryOperationOverview({ error: 'unreadable' }).state,
    'failure'
  )
  assert.equal(
    buildDevDeliveryOperationOverview({
      summary: operationSummary,
      error: 'latest readback failed',
      now: currentTime,
    }).state,
    'stale'
  )
  assert.equal(
    buildDevDeliveryOperationOverview({ loading: true }).state,
    'loading'
  )
})

test('status presentation keeps environment accent separate from result color', () => {
  assert.deepEqual(devEnvironmentEvidenceStatusPresentation('success'), {
    label: '已读回',
    color: 'success',
  })
  assert.deepEqual(devEnvironmentEvidenceStatusPresentation('unknown'), {
    label: '未证明',
    color: 'default',
  })
})
