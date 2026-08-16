import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  createOrReuseDeliveryOperation,
  listDeliveryOperations,
  readDeliveryOperation,
  resolveDeliveryOperationStore,
  transitionDeliveryOperation,
} from '../../scripts/deploy/delivery-operation-store.mjs'
import {
  DEV_DELIVERY_ACTION_API_PATH,
  DEV_DELIVERY_SESSION_API_PATH,
  createDevDeliveryMiddleware,
  createDevDeliveryService,
  validateDevDeliveryAction,
} from './devDeliveryBridgePlugin.mjs'
import { readLatestBackupRestoreEvidence } from './devRecoveryEvidence.mjs'

const SHA = 'a'.repeat(40)
const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const ROLLBACK_OPERATION_ID = '22222222-2222-4222-8222-222222222222'
const IDEMPOTENCY_KEY = 'version-center:fixed:0001'

function createProject(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-delivery-bridge-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    root,
    store: resolveDeliveryOperationStore(root),
  }
}

function backupRestoreReport(overrides = {}) {
  const report = {
    customerCode: 'yoyoosun',
    environment: 'customer-trial-133',
    releaseVersion: SHA,
    backupId: 'br-yoyoosun-20260814T225613+0800',
    verifiedAt: '2026-08-14T14:56:26Z',
    restoreTarget: 'temp-postgres-container:postgres:18.1:removed-after-run',
    backup: {
      databaseBackupSize: 837_713,
      databaseBackupHash: 'b'.repeat(64),
      migrationVersion: '20260812043327',
      sourcePolicy: 'dedicated-backup',
      sourceRole: 'erp_backup',
    },
    restore: {
      restoreTestStatus: 'passed-temp-container',
      migrationBeforeApply: '20260812043327',
      restoreMigrationVersion: '20260812043327',
      pendingFiles: '0',
      schemaReadbackSha256: 'c'.repeat(64),
      programmability: '0|0|0',
      permissionReadbackStatus: 'passed',
      populatedUpgradeAuditStatus: 'passed',
      customerConfigCutoverAuditStatus: 'passed',
      databaseConstraintAuditStatus: 'passed',
    },
    smoke: {
      smokeQueryStatus: 'passed',
      publicTableCount: '74',
      backendHealthStatus: 'passed',
      backendReadyStatus: 'passed',
      webSmokeStatus: 'passed',
    },
    redaction: {
      containsSecrets: false,
      containsRawCustomerRows: false,
      containsDumpContent: false,
      containsFullDsn: false,
    },
    summary: {
      backupCreated: true,
      restoreCompleted: true,
      migrationStatus: 'ok',
      populatedUpgradeAuditStatus: 'passed',
      customerConfigCutoverAuditStatus: 'passed',
      databaseConstraintAuditStatus: 'passed',
      smokeQueryStatus: 'passed',
    },
  }
  return {
    ...report,
    ...overrides,
    backup: { ...report.backup, ...overrides.backup },
    restore: { ...report.restore, ...overrides.restore },
    smoke: { ...report.smoke, ...overrides.smoke },
    redaction: { ...report.redaction, ...overrides.redaction },
    summary: { ...report.summary, ...overrides.summary },
  }
}

function writeBackupRestoreReport(root, report, directory = 'target/run') {
  const reportDirectory = path.join(
    root,
    'output/customers/yoyoosun/backup-restore-rehearsal',
    directory
  )
  mkdirSync(reportDirectory, { recursive: true })
  writeFileSync(
    path.join(reportDirectory, 'backup-restore-report.json'),
    `${JSON.stringify(report)}\n`
  )
}

function requestMiddleware(
  middleware,
  {
    url = DEV_DELIVERY_SESSION_API_PATH,
    method = 'GET',
    host = '127.0.0.1:5175',
    remoteAddress = '127.0.0.1',
    headers = {},
    body = '',
  } = {}
) {
  return new Promise((resolve, reject) => {
    const request = Readable.from(body ? [body] : [])
    request.url = url
    request.method = method
    request.headers = { host, ...headers }
    request.socket = { remoteAddress }
    const responseHeaders = {}
    let settled = false
    const finish = (value) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const response = {
      statusCode: 200,
      setHeader(name, value) {
        responseHeaders[String(name).toLowerCase()] = value
      },
      end(payload = '') {
        finish({
          statusCode: this.statusCode,
          headers: responseHeaders,
          body: String(payload),
          nextCalled: false,
        })
      },
    }
    Promise.resolve(
      middleware(request, response, () =>
        finish({
          statusCode: response.statusCode,
          headers: responseHeaders,
          body: '',
          nextCalled: true,
        })
      )
    ).catch(reject)
  })
}

test('delivery action contract accepts fixed actions and bounded explicit retry', () => {
  assert.equal(
    validateDevDeliveryAction({
      action: 'prepare-promotion',
      payload: {
        gitSha: SHA,
        version: '2026.07.29-1',
        target: 'test-133',
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    }).action,
    'prepare-promotion'
  )
  assert.throws(
    () =>
      validateDevDeliveryAction({
        action: 'prepare-promotion',
        payload: {
          gitSha: SHA,
          version: '2026.07.29-1',
          target: 'production',
          idempotencyKey: IDEMPOTENCY_KEY,
        },
      }),
    /invalid/u
  )
  assert.throws(
    () =>
      validateDevDeliveryAction({
        action: 'execute-shell',
        payload: { command: 'rm -rf /' },
      }),
    /allowlisted/u
  )
  assert.throws(
    () =>
      validateDevDeliveryAction({
        action: 'dispatch-release',
        payload: {
          gitSha: SHA,
          version: '2026.07.29-1',
          idempotencyKey: IDEMPOTENCY_KEY,
          repository: 'attacker/repo',
        },
      }),
    /unsupported fields/u
  )
  assert.equal(
    validateDevDeliveryAction({
      action: 'prepare-rollback',
      payload: {
        fromGitSha: SHA,
        fromVersion: '2026.07.29-2',
        toGitSha: 'b'.repeat(40),
        toVersion: '2026.07.29-1',
        target: 'test-133',
        idempotencyKey: IDEMPOTENCY_KEY,
      },
    }).action,
    'prepare-rollback'
  )
  assert.equal(
    validateDevDeliveryAction({
      action: 'retry-operation',
      payload: {
        operationId: OPERATION_ID,
        idempotencyKey: 'version-center:retry:fixed-0001',
      },
    }).action,
    'retry-operation'
  )
  assert.throws(
    () =>
      validateDevDeliveryAction({
        action: 'retry-operation',
        payload: {
          operationId: OPERATION_ID,
          idempotencyKey: 'version-center:retry:fixed-0001',
          gitSha: SHA,
        },
      }),
    /unsupported fields/u
  )
})

test('recovery evidence reader exposes only the newest strict passed receipt', (t) => {
  const { root } = createProject(t)
  writeBackupRestoreReport(root, backupRestoreReport(), 'target/valid')
  writeBackupRestoreReport(
    root,
    backupRestoreReport({
      backupId: 'br-yoyoosun-20260815T010000+0800',
      verifiedAt: '2026-08-14T17:00:00Z',
      summary: { restoreCompleted: false },
    }),
    'target/invalid-newer'
  )

  const receipt = readLatestBackupRestoreEvidence({
    projectRoot: root,
    target: 'test-133',
    customer: 'yoyoosun',
    environment: 'customer-trial-133',
  })
  assert.equal(receipt.status, 'passed')
  assert.equal(receipt.target, 'test-133')
  assert.equal(receipt.customer, 'yoyoosun')
  assert.equal(receipt.releaseVersion, SHA)
  assert.equal(receipt.verifiedAt, '2026-08-14T14:56:26.000Z')
  assert.equal(receipt.pendingFiles, 0)
  assert.equal(receipt.disposableCleanup, 'passed')
  assert.match(receipt.reportPath, /^output\/customers\/yoyoosun\//u)
  assert.match(receipt.reportSha256, /^[0-9a-f]{64}$/u)
  assert.equal(Object.hasOwn(receipt, 'restoreTarget'), false)
  assert.equal(Object.hasOwn(receipt, 'sourceAlias'), false)
  assert.equal(Object.hasOwn(receipt, 'smoke'), false)
})

test('recovery evidence reader rejects a report that does not prove cleanup', (t) => {
  const { root } = createProject(t)
  writeBackupRestoreReport(
    root,
    backupRestoreReport({
      restoreTarget: 'temp-postgres-container:still-running',
    })
  )
  assert.equal(
    readLatestBackupRestoreEvidence({
      projectRoot: root,
      target: 'test-133',
      customer: 'yoyoosun',
      environment: 'customer-trial-133',
    }),
    null
  )
})

test('delivery summary binds a recovery receipt to registered target identity', async (t) => {
  const { root, store } = createProject(t)
  const receipt = Object.freeze({ status: 'passed', backupId: 'br-fixed' })
  const contexts = []
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
    readRepositoryState: () => ({
      commit: SHA,
      dirty: false,
      fingerprint: 'd'.repeat(64),
    }),
    runPreflight: () => ({
      status: 'passed',
      target: 'test-133',
      customer: 'yoyoosun',
      trialTarget: 'customer-trial-133',
    }),
    readRecoveryEvidence(context) {
      contexts.push(context)
      return receipt
    },
  })

  const result = await service.summary()
  assert.strictEqual(result.recovery.backupRestore, receipt)
  assert.deepEqual(contexts, [
    {
      projectRoot: root,
      target: 'test-133',
      customer: 'yoyoosun',
      environment: 'customer-trial-133',
    },
  ])
})

test('delivery middleware requires loopback, same-origin and CSRF for writes', async () => {
  const calls = []
  const middleware = createDevDeliveryMiddleware({
    service: {
      async summary() {
        return { status: 'success' }
      },
      readOperation() {
        return { id: OPERATION_ID }
      },
      async act(action) {
        calls.push(action)
        return { action: action.action, accepted: true }
      },
    },
    csrfToken: 'fixed-csrf-token',
  })
  const session = await requestMiddleware(middleware)
  assert.equal(session.statusCode, 200)
  assert.equal(JSON.parse(session.body).csrfToken, 'fixed-csrf-token')
  assert.equal(session.headers['cache-control'], 'no-store')

  const remote = await requestMiddleware(middleware, {
    remoteAddress: '192.168.0.8',
  })
  assert.equal(remote.statusCode, 403)

  const payload = JSON.stringify({
    action: 'dispatch-release',
    payload: {
      gitSha: SHA,
      version: '2026.07.29-1',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  })
  const missingCsrf = await requestMiddleware(middleware, {
    url: DEV_DELIVERY_ACTION_API_PATH,
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5175',
      'sec-fetch-site': 'same-origin',
    },
  })
  assert.equal(missingCsrf.statusCode, 403)

  const crossOrigin = await requestMiddleware(middleware, {
    url: DEV_DELIVERY_ACTION_API_PATH,
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      origin: 'http://localhost:5175',
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': 'fixed-csrf-token',
    },
  })
  assert.equal(crossOrigin.statusCode, 403)

  const accepted = await requestMiddleware(middleware, {
    url: DEV_DELIVERY_ACTION_API_PATH,
    method: 'POST',
    body: payload,
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5175',
      'sec-fetch-site': 'same-origin',
      'x-csrf-token': 'fixed-csrf-token',
    },
  })
  assert.equal(accepted.statusCode, 202)
  assert.equal(calls.length, 1)

  const unrelated = await requestMiddleware(middleware, {
    url: '/assets/application.js',
  })
  assert.equal(unrelated.nextCalled, true)
})

test('release dispatch is idempotent and never writes the target', async (t) => {
  const { root, store } = createProject(t)
  let dispatchCount = 0
  const provider = {
    getReleaseStatus() {
      return { status: 'missing', release: null }
    },
    dispatchRelease() {
      dispatchCount += 1
      return { status: 'accepted' }
    },
    listVersions() {
      return []
    },
    downloadRelease() {
      throw new Error('not used')
    },
  }
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider,
    readRepositoryState: async () => ({
      commit: SHA,
      dirty: false,
      fingerprint: 'b'.repeat(64),
    }),
    runPreflight: () => {
      throw new Error('target preflight must not run for release dispatch')
    },
  })
  const request = {
    action: 'dispatch-release',
    payload: {
      gitSha: SHA,
      version: '2026.07.29-1',
      idempotencyKey: IDEMPOTENCY_KEY,
    },
  }
  const first = await service.act(request)
  const second = await service.act({
    ...request,
    payload: {
      ...request.payload,
      idempotencyKey: 'version-center:fixed:0002',
    },
  })
  assert.equal(first.operation.status, 'waiting')
  assert.equal(second.operation.id, first.operation.id)
  assert.equal(second.operation.idempotency.requestCount, 2)
  assert.equal(second.operation.idempotency.reuseCount, 1)
  assert.deepEqual(second.operation.idempotency.basis, [
    'action',
    'target',
    'git_sha',
    'version',
    'delivery_inputs',
  ])
  assert.equal(dispatchCount, 1)
})

test('failed release can create one linked explicit retry attempt', async (t) => {
  const { root, store } = createProject(t)
  let dispatchCount = 0
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      getReleaseStatus: () => ({ status: 'missing', release: null }),
      dispatchRelease() {
        dispatchCount += 1
        if (dispatchCount === 1) throw new Error('temporary dispatch failure')
        return { status: 'accepted' }
      },
      listVersions: () => [],
      downloadRelease: () => {
        throw new Error('not used')
      },
    },
    readRepositoryState: async () => ({
      commit: SHA,
      dirty: false,
      fingerprint: 'b'.repeat(64),
    }),
  })
  await assert.rejects(
    service.act({
      action: 'dispatch-release',
      payload: {
        gitSha: SHA,
        version: '2026.07.29-1',
        idempotencyKey: 'version-center:release:fixed-0001',
      },
    }),
    /temporary dispatch failure/u
  )
  const failed = listDeliveryOperations(store)[0]
  assert.equal(failed.status, 'failed')
  const retried = await service.act({
    action: 'retry-operation',
    payload: {
      operationId: failed.id,
      idempotencyKey: 'version-center:retry:fixed-0002',
    },
  })
  assert.equal(retried.operation.status, 'waiting')
  assert.equal(retried.operation.idempotency.attempt, 2)
  assert.equal(retried.operation.idempotency.retryOfOperationId, failed.id)
  assert.equal(retried.operation.retry.allowed, false)
  assert.equal(dispatchCount, 2)
  assert.equal(listDeliveryOperations(store).length, 2)
  assert.equal(readDeliveryOperation(store, failed.id).status, 'failed')
})

test('workbench retry refuses an unknown target outcome', async (t) => {
  const { root, store } = createProject(t)
  const created = createOrReuseDeliveryOperation(store, {
    action: 'promote',
    target: 'test-133',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: 'version-center:promote:fixed-0001',
  })
  transitionDeliveryOperation(store, created.operation.id, {
    status: 'running',
    message: 'target write started',
  })
  transitionDeliveryOperation(store, created.operation.id, {
    status: 'not_proven',
    message: 'target outcome is unknown',
  })
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
  })
  await assert.rejects(
    service.act({
      action: 'retry-operation',
      payload: {
        operationId: created.operation.id,
        idempotencyKey: 'version-center:retry:fixed-0002',
      },
    }),
    /read back before retry/u
  )
})

test('workbench does not offer generic retry for dedicated high-risk actions', async (t) => {
  const { root, store } = createProject(t)
  const created = createOrReuseDeliveryOperation(store, {
    action: 'rebuild-database',
    target: 'test-133',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: 'version-center:rebuild:fixed-0001',
  })
  transitionDeliveryOperation(store, created.operation.id, {
    status: 'failed',
    message: 'database qualification failed before target write',
  })
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
  })
  const operation = service.readOperation(created.operation.id)
  assert.equal(operation.retry.allowed, false)
  assert.equal(operation.retry.reason, 'action_not_retryable')
  await assert.rejects(
    service.act({
      action: 'retry-operation',
      payload: {
        operationId: created.operation.id,
        idempotencyKey: 'version-center:retry:fixed-0002',
      },
    }),
    /cannot be retried/u
  )
})

test('delivery summary exposes cached GitHub timings and readable operation durations', async (t) => {
  const { root, store } = createProject(t)
  createOrReuseDeliveryOperation(store, {
    action: 'release',
    target: 'github-release',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    now: '2026-08-08T01:00:00.000Z',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'running',
    message: 'release dispatch started',
    now: '2026-08-08T01:00:05.000Z',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'waiting',
    message: 'release workflow accepted',
    metadata: {
      transferBytes: 1_265_345_566,
      transferDurationMs: 65_000,
      transferBytesPerSecond: 19_466_855,
      serverArchiveBytes: 1_029_740_032,
      webArchiveBytes: 235_604_992,
      backupSizeBytes: 612_412,
      serverDigest: `sha256:${'c'.repeat(64)}`,
      webDigest: `sha256:${'d'.repeat(64)}`,
      buildPerformance: {
        schemaVersion: 'plush.release-build-performance/v1',
        durationMs: 240_000,
        cacheMode: 'gha',
        completedVertexCount: 20,
        cacheHitCount: 16,
        cacheMissCount: 4,
        cacheHitRateBasisPoints: 8_000,
      },
    },
    now: '2026-08-08T01:01:10.000Z',
  })
  let timingReads = 0
  const timingPayload = {
    schemaVersion: 'plush.delivery-pipeline-timings/v1',
    generatedAt: '2026-08-08T01:01:00.000Z',
    runs: [],
  }
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      listPipelineTimings() {
        timingReads += 1
        return timingPayload
      },
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
    readRepositoryState: () => ({
      commit: SHA,
      dirty: false,
      fingerprint: 'b'.repeat(64),
    }),
    runPreflight: () => ({ status: 'passed' }),
  })

  const first = await service.summary()
  const second = await service.summary()
  assert.strictEqual(first.timings, timingPayload)
  assert.strictEqual(second.timings, timingPayload)
  assert.equal(timingReads, 1)
  assert.equal(first.operations[0].durationMs, 70_000)
  assert.deepEqual(
    first.operations[0].stages.map((item) => item.durationMs),
    [65_000]
  )
  assert.equal(first.operations[0].stages[0].label, '制品传输')
  assert.deepEqual(first.operations[0].metrics, {
    transferBytes: 1_265_345_566,
    transferDurationMs: 65_000,
    transferBytesPerSecond: 19_466_855,
    serverArchiveBytes: 1_029_740_032,
    webArchiveBytes: 235_604_992,
    backupSizeBytes: 612_412,
    serverDigest: `sha256:${'c'.repeat(64)}`,
    webDigest: `sha256:${'d'.repeat(64)}`,
    buildPerformance: {
      schemaVersion: 'plush.release-build-performance/v1',
      durationMs: 240_000,
      cacheMode: 'gha',
      completedVertexCount: 20,
      cacheHitCount: 16,
      cacheMissCount: 4,
      cacheHitRateBasisPoints: 8_000,
    },
    targetCacheHit: null,
    targetImageCacheHit: null,
    targetCacheSource: null,
    avoidedTransferBytes: null,
    avoidedTransferDurationMs: null,
    avoidedTransferBaselineOperationId: null,
    dockerLoadSkipped: null,
    cacheBasis: [],
    stillExecutedChecks: [],
  })
})

test('promotion executor is launched once and an unstarted child fails closed', async (t) => {
  const { root, store } = createProject(t)
  createOrReuseDeliveryOperation(store, {
    action: 'promote',
    target: 'test-133',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'running',
    message: 'preflight started',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'ready',
    message: 'promotion ready',
  })
  const currentSha = 'b'.repeat(40)
  createOrReuseDeliveryOperation(store, {
    action: 'rollback',
    target: 'test-133',
    gitSha: 'c'.repeat(40),
    version: '2026.07.28-1',
    idempotencyKey: 'version-center:rollback:fixed-0002',
    operationId: ROLLBACK_OPERATION_ID,
    metadata: {
      source: 'version-center',
      currentGitSha: currentSha,
      currentVersion: '2026.07.29-1',
    },
  })
  transitionDeliveryOperation(store, ROLLBACK_OPERATION_ID, {
    status: 'running',
    message: 'rollback qualification started',
  })
  transitionDeliveryOperation(store, ROLLBACK_OPERATION_ID, {
    status: 'ready',
    message: 'rollback ready',
  })
  const child = new EventEmitter()
  let spawnCount = 0
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
    spawnProcess(command, args, options) {
      spawnCount += 1
      assert.equal(command, process.execPath)
      assert.equal(options.shell, undefined)
      assert.equal(options.stdio, 'ignore')
      assert(
        args.some((item) => String(item).endsWith('/promotion-executor.mjs'))
      )
      return child
    },
  })
  const confirmation = `PROMOTE:test-133:${SHA}:${OPERATION_ID}`
  const accepted = await service.act({
    action: 'execute-promotion',
    payload: { operationId: OPERATION_ID, confirmation },
  })
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.operation.status, 'launching')
  await assert.rejects(
    service.act({
      action: 'execute-promotion',
      payload: { operationId: OPERATION_ID, confirmation },
    }),
    /already running/u
  )
  await assert.rejects(
    service.act({
      action: 'execute-rollback',
      payload: {
        operationId: ROLLBACK_OPERATION_ID,
        confirmation: `ROLLBACK:test-133:${currentSha}:${'c'.repeat(40)}:${ROLLBACK_OPERATION_ID}`,
      },
    }),
    /already running/u
  )
  child.emit('close', 1)
  assert.equal(spawnCount, 1)
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, 'failed')
})

test('a synchronous executor start failure is terminal and is not retried', async (t) => {
  const { root, store } = createProject(t)
  createOrReuseDeliveryOperation(store, {
    action: 'promote',
    target: 'test-133',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'running',
    message: 'preflight started',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'ready',
    message: 'promotion ready',
  })
  let spawnCount = 0
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
    spawnProcess() {
      spawnCount += 1
      throw new Error('executor unavailable')
    },
  })
  const confirmation = `PROMOTE:test-133:${SHA}:${OPERATION_ID}`
  await assert.rejects(
    service.act({
      action: 'execute-promotion',
      payload: { operationId: OPERATION_ID, confirmation },
    }),
    /executor unavailable/u
  )
  assert.equal(spawnCount, 1)
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, 'failed')
  await assert.rejects(
    service.act({
      action: 'execute-promotion',
      payload: { operationId: OPERATION_ID, confirmation },
    }),
    /not ready/u
  )
  assert.equal(spawnCount, 1)
})

test('rollback executor uses the operation-bound current and target versions', async (t) => {
  const { root, store } = createProject(t)
  const currentSha = 'b'.repeat(40)
  createOrReuseDeliveryOperation(store, {
    action: 'rollback',
    target: 'test-133',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
    metadata: {
      source: 'version-center',
      currentGitSha: currentSha,
      currentVersion: '2026.07.29-2',
    },
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'running',
    message: 'rollback qualification started',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'ready',
    message: 'rollback ready',
  })
  const child = new EventEmitter()
  let spawnedArgs = []
  const service = createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
    spawnProcess(_command, args) {
      spawnedArgs = args
      return child
    },
  })
  const confirmation = `ROLLBACK:test-133:${currentSha}:${SHA}:${OPERATION_ID}`
  const accepted = await service.act({
    action: 'execute-rollback',
    payload: { operationId: OPERATION_ID, confirmation },
  })
  assert.equal(accepted.accepted, true)
  assert.equal(accepted.operation.status, 'launching')
  assert(
    spawnedArgs.some((item) => String(item).endsWith('/rollback-executor.mjs'))
  )
  assert(spawnedArgs.some((item) => String(item).includes(currentSha)))
  assert(spawnedArgs.some((item) => String(item).includes(SHA)))
  child.emit('close', 1)
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, 'failed')
})

test('workbench startup freezes an interrupted launch as not_proven', (t) => {
  const { root, store } = createProject(t)
  createOrReuseDeliveryOperation(store, {
    action: 'promote',
    target: 'test-133',
    gitSha: SHA,
    version: '2026.07.29-1',
    idempotencyKey: IDEMPOTENCY_KEY,
    operationId: OPERATION_ID,
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'running',
    message: 'preflight started',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'ready',
    message: 'promotion ready',
  })
  transitionDeliveryOperation(store, OPERATION_ID, {
    status: 'launching',
    message: 'promotion child launched',
  })
  createDevDeliveryService({
    projectRoot: root,
    operationStore: store,
    provider: {
      listVersions: () => [],
      getReleaseStatus: () => ({ status: 'missing' }),
      dispatchRelease: () => {},
      downloadRelease: () => {},
    },
  })
  assert.equal(readDeliveryOperation(store, OPERATION_ID).status, 'not_proven')
})
