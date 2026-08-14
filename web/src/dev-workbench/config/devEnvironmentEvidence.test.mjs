import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
        databaseName: 'plush_erp_uat_20260716_v5',
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
        databaseName: 'plush_erp_uat_20260716_v5',
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
  return {
    generatedAt: GENERATED_AT,
    target: {
      generatedAt: GENERATED_AT,
      status: 'passed',
      remote: {
        runtime: {
          serverSha: COMMIT,
          webSha: COMMIT,
          databaseName: 'plush_erp_uat_20260716_v5',
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
        publicEntry: { status: 'passed' },
        backup: {
          tooling: 'passed',
          latestSha256: '1'.repeat(64),
          latestSizeBytes: 1024,
        },
      },
    },
  }
}

test('environment evidence keeps one local controller and three explicit targets', () => {
  const evidence = buildDevEnvironmentEvidence({
    dataSummary: dataSummaryFixture(),
    deliverySummary: deliverySummaryFixture(),
  })

  assert.equal(evidence.controller, '本地 DEV-only')
  assert.deepEqual(
    evidence.cards.map(({ key }) => key),
    ['local-development', 'customer-trial-133', 'isolated-acceptance']
  )
  assert.equal(evidence.cards[0].status, 'success')
  assert.equal(evidence.cards[1].status, 'not_proven')
  assert.match(evidence.cards[1].nextAction, /133 目标卡/u)
  assert.equal(evidence.cards[2].status, 'success')
})

test('local and 133 failures remain independent', () => {
  const localFailed = buildDevEnvironmentEvidence({
    dataError: '本地读取失败',
    deliverySummary: deliverySummaryFixture(),
  })
  assert.equal(localFailed.cards[0].status, 'failed')
  assert.notEqual(localFailed.cards[1].status, 'failed')

  const remoteFailed = buildDevEnvironmentEvidence({
    dataSummary: dataSummaryFixture(),
    deliveryError: '133 读取失败',
  })
  assert.equal(remoteFailed.cards[0].status, 'success')
  assert.equal(remoteFailed.cards[1].status, 'failed')
  assert.equal(remoteFailed.cards[2].status, 'success')
})

test('133 becomes green only after the current target-bound persistent readback', () => {
  const evidence = buildDevEnvironmentEvidence({
    dataSummary: addTrialReadback(dataSummaryFixture()),
    deliverySummary: deliverySummaryFixture(),
  })

  assert.equal(evidence.cards[1].status, 'success')
  assert.equal(evidence.cards[1].datasetEvidence, '133 持久数据已独立读回')
  assert.match(evidence.cards[1].rollbackBoundary, /新回滚点/u)
  assert.equal(evidence.cards[0].status, 'success')
})

test('stale release, config or dataset evidence never becomes green', () => {
  const delivery = deliverySummaryFixture()
  delivery.target.remote.runtime.serverSha = '9'.repeat(40)
  delivery.target.remote.runtime.webSha = '9'.repeat(40)
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
