import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import {
  resolveDatabaseMigrationOperationStore,
  transitionDatabaseMigrationOperation,
} from '../scripts/qa/dev-database-migration-operation-store.mjs'
import {
  DEV_DATABASE_MIGRATION_ACTION_API_PATH,
  DEV_DATABASE_MIGRATION_SESSION_API_PATH,
  createDevDatabaseMigrationMiddleware,
  createDevDatabaseMigrationService,
  parseMigrationPlanOutput,
  parseMigrationStatusOutput,
  validateDevDatabaseMigrationAction,
} from './devDatabaseMigrationPlugin.mjs'

const PREPARE_KEY =
  'database-migration:prepare:11111111-1111-4111-8111-111111111111'

function createProject(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'plush-migration-plugin-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  return {
    root,
    store: resolveDatabaseMigrationOperationStore(root),
  }
}

async function waitForOperation(service, operationId, statuses) {
  const expected = new Set(statuses)
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const operation = service.readOperation(operationId)
    if (expected.has(operation.status)) return operation
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  throw new Error(
    `operation ${operationId} did not reach ${statuses.join(',')}`
  )
}

function target({ pendingFiles = 1 } = {}) {
  return {
    key: 'shared-dev',
    safeTarget: 'host=192.168.0.106 port=5432 database=plush_erp',
    currentVersion: pendingFiles === 0 ? '20260729043852' : '20260728100514',
    latestVersion: '20260729043852',
    appliedFiles: pendingFiles === 0 ? 105 : 104,
    availableFiles: 105,
    pendingFiles,
    targetConfirmation: 'TRUST_SHARED_DEV_DATABASE:fixed-target',
  }
}

function dependencies(calls) {
  let pendingFiles = 1
  return {
    async status() {
      calls.push('status')
      return target({ pendingFiles })
    },
    async sourceIdentity() {
      calls.push('source')
      return { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) }
    },
    async stopRuntime() {
      calls.push('stop')
    },
    async plan(confirmation) {
      calls.push(`plan:${confirmation}`)
      return {
        applyConfirmation: 'APPLY_DEV_MIGRATIONS:fixed-plan',
        maintenanceConfirmation: 'SHARED_DEV_MAINTENANCE_READY:fixed-plan',
        outputHash: 'c'.repeat(64),
      }
    },
    async backup(operationId) {
      calls.push(`backup:${operationId}`)
      return {
        id: 'br-yoyoosun-20260729T080000+0800',
        sizeBytes: 1234,
        sha256: 'd'.repeat(64),
        restoreVerified: true,
        migrationBefore: '20260728100514',
        migrationAfter: '20260729043852',
        verifiedAt: '2026-07-29T08:01:00.000Z',
      }
    },
    async verifyBackup() {
      calls.push('verify-backup')
      return true
    },
    async apply(internal) {
      calls.push(`apply:${internal.applyConfirmation}`)
      pendingFiles = 0
    },
    async runtime() {
      calls.push('runtime')
      return {
        available: true,
        health: {
          status: 'passed',
          httpCode: 200,
          expectedBodyMatched: true,
        },
        ready: {
          status: 'passed',
          httpCode: 200,
          expectedBodyMatched: true,
        },
      }
    },
    async restart(operationId) {
      calls.push(`restart:${operationId}`)
      return {
        available: true,
        health: {
          status: 'passed',
          httpCode: 200,
          expectedBodyMatched: true,
        },
        ready: {
          status: 'passed',
          httpCode: 200,
          expectedBodyMatched: true,
        },
      }
    },
  }
}

test('database migration output parser keeps low-level confirmations server-side', () => {
  const status = parseMigrationStatusOutput(`
[migration] target=shared-dev host=192.168.0.106 port=5432 database=plush_erp
[migration] current=20260728100514 latest=20260729043852 applied=104/105 pending=1
[migration] MIGRATE_TARGET_CONFIRM=TRUST_SHARED_DEV_DATABASE:target-proof
`)
  assert.equal(status.pendingFiles, 1)
  assert.equal(
    status.targetConfirmation,
    'TRUST_SHARED_DEV_DATABASE:target-proof'
  )
  const plan = parseMigrationPlanOutput(`
[migration] plan=complete writes=0
[migration] MIGRATE_CONFIRM=APPLY_DEV_MIGRATIONS:plan-proof
[migration] MIGRATE_MAINTENANCE_CONFIRM=SHARED_DEV_MAINTENANCE_READY:plan-proof
`)
  assert.equal(plan.applyConfirmation, 'APPLY_DEV_MIGRATIONS:plan-proof')
  assert.match(plan.outputHash, /^[a-f0-9]{64}$/u)
})

test('database migration service prepares once, applies once, reads back, and restarts', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: dependencies(calls),
  })

  const preparedResult = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  assert.equal(preparedResult.accepted, true)
  const prepared = await waitForOperation(
    service,
    preparedResult.operation.id,
    ['ready']
  )
  assert.equal(prepared.backup.restoreVerified, true)
  assert.equal(Object.hasOwn(prepared, 'internal'), false)
  assert.doesNotMatch(
    JSON.stringify(prepared),
    /TRUST_SHARED_DEV_DATABASE|APPLY_DEV_MIGRATIONS|SHARED_DEV_MAINTENANCE_READY/u
  )

  const reused = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  assert.equal(reused.accepted, false)
  assert.equal(reused.operation.id, prepared.id)

  const execute = await service.act({
    action: 'execute',
    operationId: prepared.id,
    confirmation: prepared.confirmationPrompt,
  })
  assert.equal(execute.accepted, true)
  const passed = await waitForOperation(service, prepared.id, ['passed'])
  assert.equal(passed.readback.pendingFiles, 0)
  assert.equal(passed.readback.runtime.available, true)
  assert.equal(calls.filter((call) => call.startsWith('apply:')).length, 1)
  assert.equal(calls.filter((call) => call.startsWith('restart:')).length, 1)
  await assert.rejects(
    service.act({
      action: 'execute',
      operationId: prepared.id,
      confirmation: prepared.confirmationPrompt,
    }),
    /确认文本或操作状态/u
  )
})

test('database migration service never applies a stale source plan', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  const originalSource = runtime.sourceIdentity
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: runtime,
  })
  const prepare = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const ready = await waitForOperation(service, prepare.operation.id, ['ready'])
  runtime.sourceIdentity = async () => ({
    ...(await originalSource()),
    fingerprint: 'e'.repeat(64),
  })

  await service.act({
    action: 'execute',
    operationId: ready.id,
    confirmation: ready.confirmationPrompt,
  })
  const blocked = await waitForOperation(service, ready.id, ['blocked'])
  assert.equal(blocked.issues[0].code, 'migration_source_changed')
  assert.equal(calls.filter((call) => call.startsWith('apply:')).length, 0)
})

test('database migration service reuses an unchanged verified backup', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: dependencies(calls),
  })
  const firstResult = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const first = await waitForOperation(service, firstResult.operation.id, [
    'ready',
  ])
  transitionDatabaseMigrationOperation(store, first.id, {
    status: 'blocked',
    message: '其它数据库连接阻断了执行',
    issues: [
      {
        code: 'database_clients_active',
        severity: 'blocked',
        message: '共享开发库仍有其它连接',
      },
    ],
  })

  const secondResult = await service.act({
    action: 'prepare',
    idempotencyKey:
      'database-migration:prepare:22222222-2222-4222-8222-222222222222',
  })
  const second = await waitForOperation(service, secondResult.operation.id, [
    'ready',
  ])
  assert.equal(second.backup.id, first.backup.id)
  assert.equal(calls.filter((call) => call.startsWith('backup:')).length, 1)
  assert.equal(calls.filter((call) => call === 'verify-backup').length, 1)
})

function requestMiddleware(
  middleware,
  {
    url = DEV_DATABASE_MIGRATION_SESSION_API_PATH,
    method = 'GET',
    body = '',
    remoteAddress = '127.0.0.1',
    headers = {},
  } = {}
) {
  const request = Readable.from(body ? [body] : [])
  request.url = url
  request.method = method
  request.socket = { remoteAddress }
  request.headers = {
    host: '127.0.0.1:5175',
    ...headers,
  }
  let responseBody = ''
  const responseHeaders = {}
  const response = {
    statusCode: 200,
    setHeader(name, value) {
      responseHeaders[name.toLowerCase()] = value
    },
    end(value = '') {
      responseBody += String(value)
    },
  }
  let nextCalled = false
  return Promise.resolve(
    middleware(request, response, () => {
      nextCalled = true
    })
  ).then(() => ({
    body: responseBody,
    headers: responseHeaders,
    nextCalled,
    statusCode: response.statusCode,
  }))
}

test('database migration middleware is loopback, same-origin, CSRF, and fixed-action only', async () => {
  const calls = []
  const middleware = createDevDatabaseMigrationMiddleware({
    service: {
      async summary() {
        return { status: 'success' }
      },
      readOperation() {
        return { id: 'fixed' }
      },
      async act(action) {
        calls.push(action)
        return { accepted: true, operation: { status: 'preparing' } }
      },
    },
    csrfToken: 'fixed-csrf-token',
  })
  const session = await requestMiddleware(middleware)
  assert.equal(session.statusCode, 200)
  assert.equal(JSON.parse(session.body).csrfToken, 'fixed-csrf-token')

  const remote = await requestMiddleware(middleware, {
    remoteAddress: '192.168.0.8',
  })
  assert.equal(remote.statusCode, 403)

  const body = JSON.stringify({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const missingCsrf = await requestMiddleware(middleware, {
    url: DEV_DATABASE_MIGRATION_ACTION_API_PATH,
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:5175',
      'sec-fetch-site': 'same-origin',
    },
  })
  assert.equal(missingCsrf.statusCode, 403)

  const accepted = await requestMiddleware(middleware, {
    url: DEV_DATABASE_MIGRATION_ACTION_API_PATH,
    method: 'POST',
    body,
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

test('database migration action rejects arbitrary targets, commands, and fields', () => {
  assert.deepEqual(
    validateDevDatabaseMigrationAction({
      action: 'prepare',
      idempotencyKey: PREPARE_KEY,
    }),
    {
      action: 'prepare',
      idempotencyKey: PREPARE_KEY,
    }
  )
  assert.throws(
    () =>
      validateDevDatabaseMigrationAction({
        action: 'prepare',
        idempotencyKey: PREPARE_KEY,
        target: 'production',
      }),
    /unsupported fields/u
  )
  assert.throws(
    () =>
      validateDevDatabaseMigrationAction({
        action: 'prepare',
        idempotencyKey: PREPARE_KEY,
        command: 'psql',
      }),
    /unsupported fields/u
  )
})
