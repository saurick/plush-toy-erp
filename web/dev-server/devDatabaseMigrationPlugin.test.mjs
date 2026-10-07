import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'
import { LocalRuntimePreflightError } from '../../scripts/local-runtime-preflight.mjs'
import { createDevDatabaseMigrationRecoveryController } from './devDatabaseMigrationRecoveryPlugin.mjs'

import {
  acquireDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
  transitionDatabaseMigrationOperation,
} from '../../scripts/qa/dev-database-migration-operation-store.mjs'
import {
  DEV_DATABASE_MIGRATION_ACTION_API_PATH,
  DEV_DATABASE_MIGRATION_OPERATION_API_PREFIX,
  DEV_DATABASE_MIGRATION_SESSION_API_PATH,
  DEV_DATABASE_MIGRATION_SUMMARY_API_PATH,
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
    safeTarget: 'host=192.168.0.133 port=5432 database=plush_erp',
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
    async workspaceCheck() {
      calls.push('workspace-check')
    },
    async maintenance(enabled) {
      calls.push(`maintenance:${enabled}`)
    },
    async verifyReadiness() {
      calls.push('verify-readiness')
    },
    async toolReadiness() {
      calls.push('tools')
      return {
        schemaVersion: 'plush.dev-database-migration-tools/v1',
        status: 'ready',
        checks: [
          {
            key: 'container_runtime',
            label: '容器运行环境',
            status: 'passed',
            message: '已就绪',
          },
          {
            key: 'atlas',
            label: 'Atlas',
            status: 'passed',
            message: '已就绪',
          },
          {
            key: 'postgresql_client',
            label: 'PostgreSQL 客户端',
            status: 'passed',
            message: '已就绪',
          },
          {
            key: 'supporting_commands',
            label: '基础命令',
            status: 'passed',
            message: '已就绪',
          },
        ],
      }
    },
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
    async audit() {
      calls.push('audit')
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
[migration] target=shared-dev host=192.168.0.133 port=5432 database=plush_erp
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
  assert.equal(calls.includes('stop'), false)
  assert.equal(calls.includes('maintenance:true'), false)
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

test('a later plan failure preserves successful data audit evidence and leaves the running service intact', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.plan = async () => {
    throw new Error('plan unavailable')
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const prepared = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, prepared.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.readback.dataAuditPassed, true)
  assert.equal(calls.includes('stop'), false)
  assert.equal(
    calls.some(
      (call) => call.startsWith('apply:') || call.startsWith('restart:')
    ),
    false
  )
  assert.equal((await service.summary()).runtime.available, true)
})

test('preparation records live backup stages and allows retry after a cleaned-up timeout', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  const originalBackup = runtime.backup
  let releaseBackup
  const gate = new Promise((resolve) => {
    releaseBackup = resolve
  })
  let reportProgress
  runtime.backup = async (_operationId, _target, progress) => {
    reportProgress = progress
    progress('正在启动隔离恢复环境')
    await gate
    const error = new Error('command timed out')
    error.code = 'migration_command_timeout'
    throw error
  }
  let tick = 0
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
    now: () => new Date(Date.UTC(2026, 8, 9, 1, 0, tick++)),
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  for (let attempt = 0; attempt < 50 && !reportProgress; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  const preparing = service.readOperation(result.operation.id)
  assert.equal(preparing.status, 'preparing')
  assert.equal(preparing.message, '正在启动隔离恢复环境')
  assert(preparing.updatedAt > preparing.createdAt)
  assert(
    preparing.events.some(
      (event) => event.message === '正在只读生成迁移计划；当前服务继续运行'
    )
  )
  releaseBackup()
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'migration_command_timeout')
  assert.equal(blocked.confirmationPrompt, null)
  assert.equal(
    calls.some((call) => call.startsWith('apply:')),
    false
  )
  assert.throws(
    () => reportProgress('迟到的进度'),
    /operation transition is invalid/u
  )
  runtime.backup = originalBackup
  const retry = await service.act({
    action: 'prepare',
    idempotencyKey:
      'database-migration:prepare:22222222-2222-4222-8222-222222222222',
  })
  assert.equal(
    (await waitForOperation(service, retry.operation.id, ['ready'])).backup
      .restoreVerified,
    true
  )
})

test('database migration service reports runtime recovery only after migration and health readback', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  let readyReports = 0
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: dependencies(calls),
    onRuntimeReady: () => {
      readyReports += 1
    },
  })

  await service.summary()
  assert.equal(readyReports, 0)
  const prepare = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const ready = await waitForOperation(service, prepare.operation.id, ['ready'])
  await service.act({
    action: 'execute',
    operationId: ready.id,
    confirmation: ready.confirmationPrompt,
  })
  await waitForOperation(service, ready.id, ['passed'])
  assert.equal(readyReports, 1)
  await service.summary()
  assert.equal(readyReports, 1)
})

test('migration contract failure stops preparation before database access or backend shutdown', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.workspaceCheck = async () => {
    calls.push('workspace-check')
    const error = new Error(
      'fixture includes docker timeout result=not_proven and private_password'
    )
    error.code = 'migration_workspace_check_failed'
    throw error
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.deepEqual(calls, ['source', 'workspace-check'])
  assert.equal(blocked.issues[0].code, 'migration_workspace_check_failed')
  assert.match(blocked.issues[0].message, /make migrate_check.*未停止后端/u)
  assert.match(blocked.message, /迁移链路.*未完成/u)
  assert.doesNotMatch(
    JSON.stringify(blocked),
    /private_password|docker timeout/u
  )
  assert.equal(blocked.confirmationPrompt, null)
})

test('data conflicts stop preparation before backend shutdown and explain the unit blocker', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.audit = async () => {
    calls.push('audit')
    const error = new Error('read-only audit failed')
    error.diagnostic =
      '[migration-summary] error_code=unit_normalization_blocked\nunit normalization blocked: production_facts.quantity=409 postgres://private_user:private_password@localhost/db'
    throw error
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'unit_normalization_blocked')
  assert.match(blocked.message, /只读检查存量数据/u)
  assert.match(blocked.issues[0].message, /数量精度或单据引用冲突/u)
  assert.match(blocked.issues[0].message, /未执行迁移/u)
  assert.doesNotMatch(JSON.stringify(blocked), /private_|production_facts/u)
  assert.equal(blocked.confirmationPrompt, null)
  assert.ok(calls.indexOf('tools') < calls.indexOf('audit'))
  assert.equal(
    calls.some((call) => /^(stop|plan|backup|apply)/u.test(call)),
    false
  )
})

test('migration edits during the workspace check invalidate preparation before backend shutdown', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  let reads = 0
  runtime.sourceIdentity = async () => ({
    commit: 'a'.repeat(40),
    fingerprint: (++reads === 1 ? 'b' : 'c').repeat(64),
  })
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'migration_source_changed')
  assert.equal(blocked.confirmationPrompt, null)
  assert.equal(calls.includes('workspace-check'), true)
  assert.equal(
    calls.some((call) => /^(stop|plan|backup|apply)/u.test(call)),
    false
  )
})

test('migration edits during the data audit leave the running backend untouched', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  let fingerprint = 'b'.repeat(64)
  runtime.sourceIdentity = async () => ({ commit: 'a'.repeat(40), fingerprint })
  runtime.audit = async () => {
    fingerprint = 'c'.repeat(64)
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'migration_source_changed')
  assert.equal(blocked.confirmationPrompt, null)
  assert.equal(
    calls.some((call) => /^(stop|plan|backup|apply)/u.test(call)),
    false
  )
})

test('database migration service checks tools before stopping the backend', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.toolReadiness = async () => ({
    schemaVersion: 'plush.dev-database-migration-tools/v1',
    status: 'blocked',
    checks: [
      {
        key: 'container_runtime',
        label: '容器运行环境',
        status: 'blocked',
        message: 'Docker-compatible 容器守护进程未就绪',
      },
    ],
  })
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: runtime,
  })

  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'migration_tool_unavailable')
  assert.match(blocked.issues[0].message, /不限定操作系统或产品/u)
  assert.equal(calls.includes('stop'), false)
  assert.equal(calls.includes('status'), true)
})

test('pending migrations keep preparation reachable with an existing runtime bundle', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.runtime = async () => ({ available: true, bundleId: 'previous-runtime' })
  runtime.verifyReadiness = async () => {
    calls.push('verify-readiness')
    throw new LocalRuntimePreflightError('database_migration_pending', '待迁移')
  }
  let opened = 0
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
    onRuntimeReady: () => { opened += 1 },
  })
  const summary = await service.summary()
  assert.equal(summary.status, 'success')
  assert.equal(summary.target.pendingFiles, 1)
  assert.equal(opened, 0)
  assert.equal(calls.includes('verify-readiness'), false)
  const result = await service.act({ action: 'prepare', idempotencyKey: PREPARE_KEY })
  const prepared = await waitForOperation(service, result.operation.id, ['ready', 'blocked', 'failed'])
  assert.equal(prepared.status, 'ready')
  assert.equal(opened, 0)
  assert.equal(calls.includes('apply'), false)
})

test('database migration service keeps recovery blocked until the original startup checks pass', async (t) => {
  const { root, store } = createProject(t)
  const runtime = dependencies([])
  runtime.status = async () => target({ pendingFiles: 0 })
  runtime.verifyReadiness = async () => {
    throw new LocalRuntimePreflightError(
      'database_programmability_blocked',
      '数据库安全检查未通过'
    )
  }
  let opened = 0
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
    onRuntimeReady: () => {
      opened += 1
    },
  })
  const blocked = await service.summary()
  assert.equal(blocked.status, 'blocked')
  assert.equal(blocked.runtime.available, true)
  assert.equal(blocked.issues[0].code, 'database_programmability_blocked')
  assert.equal(opened, 0)
  runtime.verifyReadiness = async () => {}
  assert.equal((await service.summary()).status, 'success')
  assert.equal(opened, 1)
})

test('已验证的服务再次停服后，完整检查通过才能再次解除恢复限制', async (t) => {
  const { root, store } = createProject(t)
  let online = true
  let reports = 0
  const recovery = createDevDatabaseMigrationRecoveryController({
    runtimeChecks: true,
    fetchImpl: async () =>
      new Response(online ? 'ok' : 'offline', { status: online ? 200 : 503 }),
  })
  let middleware
  recovery.plugin.configureServer({
    middlewares: {
      use: (handler) => {
        middleware = handler
      },
    },
  })
  const runtime = dependencies([])
  runtime.status = async () => target({ pendingFiles: 0 })
  runtime.verifyReadiness = async () => {
    if (!online) {
      throw new LocalRuntimePreflightError(
        'local_backend_unavailable',
        'fixture offline'
      )
    }
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
    onRuntimeReady: () => {
      reports += 1
      recovery.markRuntimeReady()
    },
    isRuntimeRecoveryActive: recovery.isActive,
  })
  assert.equal((await service.summary()).status, 'success')
  assert.equal(reports, 1)
  online = false
  await middleware(
    { method: 'POST', url: '/rpc/admin', headers: {} },
    { setHeader() {}, end() {} },
    () => assert.fail('停服时不能开放 RPC')
  )
  assert.equal(recovery.isActive(), true)
  assert.equal((await service.summary()).status, 'blocked')
  assert.equal(reports, 1)
  online = true
  assert.equal((await service.summary()).status, 'success')
  assert.equal(recovery.isActive(), false)
  assert.equal(reports, 2)
  await service.summary()
  assert.equal(reports, 2)
})

test('database migration summary distinguishes connection and identity failures from successful workspace checks', async (t) => {
  for (const [diagnostic, expectedCode] of [
    [
      '[migration] 工作区 schema/migration 守卫通过\n[migration-summary] error_code=target_identity_failed next_action=verify_database_identity\npsql: connection to server failed: Connection refused',
      'database_status_unavailable',
    ],
    [
      '[migration] 工作区 schema/migration 守卫通过\n[migration-summary] error_code=target_identity_failed next_action=verify_database_identity',
      'database_target_unverified',
    ],
    [
      '[migration-summary] error_code=workspace_guard_failed next_action=fix_workspace',
      'migration_source_changed',
    ],
  ]) {
    const { root, store } = createProject(t)
    const calls = []
    const runtime = dependencies(calls)
    runtime.status = async () => {
      throw Object.assign(new Error('make migrate_status failed'), {
        diagnostic,
      })
    }
    const service = createDevDatabaseMigrationService({
      projectRoot: root,
      operationStore: store,
      dependencies: runtime,
    })
    const summary = await service.summary()
    assert.equal(summary.status, 'blocked')
    assert.equal(summary.target, null)
    assert.equal(summary.issues[0].code, expectedCode)
    assert.equal(calls.includes('verify-readiness'), false)
  }
})

test('an up-to-date database only needs readback even without a matching runtime bundle or backup tools', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.status = async () => target({ pendingFiles: 0 })
  runtime.toolReadiness = async () => {
    throw new Error('must not require Docker')
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const operation = await waitForOperation(service, result.operation.id, [
    'passed',
  ])
  assert.equal(operation.readback.migrationVerified, true)
  assert.equal(operation.readback.pendingFiles, 0)
  assert.equal(operation.backup, null)
  assert.equal(operation.confirmationPrompt, null)
  assert.match(operation.message, /无需迁移/u)
  assert.deepEqual(calls.slice(0, 2), ['source', 'workspace-check'])
  assert.equal(
    calls.some((call) => /^(?:stop|plan|backup|apply|restart)/u.test(call)),
    false
  )
})

test('concurrent migration and restart requests explain the busy owner and leave its lock and backend intact', async (t) => {
  const { root, store } = createProject(t)
  const ownerId = '33333333-3333-4333-8333-333333333333'
  acquireDatabaseMigrationExecutionLock(store, ownerId)
  const before = readFileSync(path.join(store, 'execution.lock'), 'utf8')
  const calls = []
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: dependencies(calls),
  })
  for (const action of ['prepare', 'restart']) {
    const result = await service.act({
      action,
      idempotencyKey: PREPARE_KEY.replace(':prepare:', `:${action}:`),
    })
    assert.equal(result.operation.status, 'blocked')
    assert.equal(result.operation.issues[0].code, 'database_migration_busy')
    assert.equal(result.operation.issues[0].severity, 'warning')
    assert.match(result.operation.message, /本次操作未开始/u)
    assert.match(
      result.operation.issues[0].message,
      /后端重启正在进行.*未停止后端/u
    )
    assert.equal(result.operation.target, null)
    assert.equal(result.operation.readback, null)
  }
  assert.deepEqual(calls, [])
  assert.equal(readFileSync(path.join(store, 'execution.lock'), 'utf8'), before)
  releaseDatabaseMigrationExecutionLock(store, ownerId)
})

test('runtime verification failure preserves an already current database without preparing another upgrade', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.status = async () => target({ pendingFiles: 0 })
  runtime.verifyReadiness = async () => {
    throw new Error('runtime readiness unavailable')
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const operation = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(operation.readback.migrationVerified, true)
  assert.equal(operation.readback.pendingFiles, 0)
  assert.match(operation.message, /数据库升级已完成.*只需重启后端/u)
  assert.equal(
    calls.some((call) =>
      /^(?:tools|audit|stop|plan|backup|apply|restart)/u.test(call)
    ),
    false
  )
})

test('database migration service marks lost apply or readback evidence as not-proven without retry', async (t) => {
  for (const failure of ['apply', 'readback']) {
    const { root, store } = createProject(t)
    const calls = []
    const runtime = dependencies(calls)
    const originalApply = runtime.apply
    runtime.apply = async (internal) => {
      await originalApply(internal)
      if (failure === 'apply') throw new Error('connection lost')
      runtime.status = async () => {
        throw new Error('readback unavailable')
      }
    }
    const service = createDevDatabaseMigrationService({
      projectRoot: root,
      operationStore: store,
      dependencies: runtime,
    })
    const prepared = await service.act({
      action: 'prepare',
      idempotencyKey: PREPARE_KEY,
    })
    const ready = await waitForOperation(service, prepared.operation.id, [
      'ready',
    ])
    await service.act({
      action: 'execute',
      operationId: ready.id,
      confirmation: ready.confirmationPrompt,
    })
    const result = await waitForOperation(service, ready.id, ['not_proven'])
    assert.equal(result.issues[0].code, 'migration_outcome_unknown')
    assert.equal(result.readback.applyStarted, true)
    assert.equal(result.readback.noWritesProven, false)
    assert.equal(
      calls.includes('maintenance:false'),
      false,
      'unknown apply outcome keeps application writes disabled'
    )
    assert.equal(calls.filter((call) => call.startsWith('apply:')).length, 1)
    assert.equal(
      calls.some((call) => call.startsWith('restart:')),
      false
    )
    await assert.rejects(
      service.act({
        action: 'execute',
        operationId: ready.id,
        confirmation: ready.confirmationPrompt,
      })
    )
  }
})

test('database migration service preserves proven migration after backend failure and restarts without reapplying', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  const { restart } = runtime
  runtime.restart = async () => {
    throw new Error('backend failed')
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const prepared = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const ready = await waitForOperation(service, prepared.operation.id, [
    'ready',
  ])
  await service.act({
    action: 'execute',
    operationId: ready.id,
    confirmation: ready.confirmationPrompt,
  })
  const failed = await waitForOperation(service, ready.id, ['failed'])
  assert.equal(failed.readback.migrationVerified, true)
  assert.match(failed.message, /只需重启后端/u)
  runtime.restart = restart
  const result = await service.act({
    action: 'restart',
    idempotencyKey: PREPARE_KEY.replace(':prepare:', ':restart:'),
  })
  await waitForOperation(service, result.operation.id, ['passed'])
  assert.equal(calls.filter((call) => call.startsWith('apply:')).length, 1)
})

test('database migration service explicitly re-prepares and invalidates the old confirmation', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: dependencies(calls),
  })
  const prepared = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const ready = await waitForOperation(service, prepared.operation.id, [
    'ready',
  ])
  const next = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY.replace('111111111111', '222222222222'),
  })
  await waitForOperation(service, next.operation.id, ['ready'])
  assert.equal(service.readOperation(ready.id).status, 'blocked')
  await assert.rejects(
    service.act({
      action: 'execute',
      operationId: ready.id,
      confirmation: ready.confirmationPrompt,
    })
  )
  assert.equal(
    calls.some((call) => call.startsWith('apply:')),
    false
  )
})

test('database migration service does not misclassify passive client diagnostics', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.plan = async (confirmation) => {
    calls.push(`plan:${confirmation}`)
    const error = new Error('make migrate_plan 未完成')
    error.diagnostic = [
      '[migration-client] pid=123 application="DbGate" state="idle" passive_idle=true blocks_migration=false reason=none',
      'atlas executable not found',
    ].join('\n')
    throw error
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: runtime,
  })

  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'migration_tool_unavailable')
  assert.equal(calls.filter((call) => call.startsWith('plan:')).length, 1)
  assert.equal(calls.filter((call) => call.startsWith('backup:')).length, 0)
})

test('database migration service blocks active or transactional clients', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.plan = async (confirmation) => {
    calls.push(`plan:${confirmation}`)
    const error = new Error('make migrate_plan 未完成')
    error.diagnostic = [
      '[migration-client] pid=456 application="DbGate" state="idle in transaction" passive_idle=false blocks_migration=true reason=open_transaction',
      '[migration] other_client_sessions_blocking=1',
      '共享开发库存在会影响 migration 的 client session',
    ].join('\n')
    throw error
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    apiOrigin: 'http://127.0.0.1:8300',
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.confirmationPrompt, null)
  assert.equal(blocked.issues[0].code, 'database_clients_active')
  assert.match(blocked.issues[0].message, /open_transaction/u)
  assert.equal(calls.filter((call) => call.startsWith('plan:')).length, 1)
  assert.equal(calls.filter((call) => call.startsWith('backup:')).length, 0)
})

test('database migration service explains preflight blockers without exposing diagnostics', async (t) => {
  for (const detail of [
    'workflow_tasks has 29 incompatible status or anchor rows',
    'other inventory constraint failed',
  ]) {
    const { root, store } = createProject(t)
    const calls = []
    const runtime = dependencies(calls)
    runtime.plan = async () => {
      calls.push('plan')
      const error = new Error('make migrate_plan 未完成')
      error.diagnostic = [
        '[migration-summary] error_code=migration_preflight_failed next_action=resolve_preflight_blockers',
        `ERROR: populated upgrade preflight failed: ${detail}`,
        'postgres://private_user:private_password@127.0.0.1/private_database',
        '/Users/private/workspace/secret.sql',
      ].join('\n')
      throw error
    }
    const service = createDevDatabaseMigrationService({
      projectRoot: root,
      operationStore: store,
      dependencies: runtime,
    })
    const result = await service.act({
      action: 'prepare',
      idempotencyKey: PREPARE_KEY,
    })
    const blocked = await waitForOperation(service, result.operation.id, [
      'blocked',
    ])
    assert.equal(blocked.issues[0].code, 'migration_preflight_failed')
    assert.equal(blocked.target.currentVersion, target().currentVersion)
    assert.equal(blocked.source.fingerprint, 'b'.repeat(64))
    assert.match(blocked.message, /只读生成迁移计划/u)
    assert.match(blocked.issues[0].message, /本次未执行迁移/u)
    assert.match(
      blocked.issues[0].message,
      detail.startsWith('workflow_tasks')
        ? /29 条工作流任务.*预检规则与当前数据库版本/u
        : /本地开发终端的具体阻断原因/u
    )
    assert.doesNotMatch(JSON.stringify(blocked), /private_|secret\.sql|ERROR:/u)
    assert.equal(blocked.confirmationPrompt, null)
    assert.deepEqual(
      calls.filter((call) => /^(plan|backup:|apply:)/u.test(call)),
      ['plan']
    )
  }
})

test('database migration service distinguishes backup script arguments from missing tools', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.backup = async () => {
    const error = new Error('bash exited: 1')
    error.diagnostic = [
      '用法: 使用 pg_dump、docker 和 atlas 执行备份恢复',
      '[backup-restore-rehearsal] 不支持的参数: --release-version',
    ].join('\n')
    throw error
  }
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const result = await service.act({
    action: 'prepare',
    idempotencyKey: PREPARE_KEY,
  })
  const blocked = await waitForOperation(service, result.operation.id, [
    'blocked',
  ])
  assert.equal(blocked.issues[0].code, 'migration_script_contract_failed')
  assert.match(blocked.issues[0].message, /参数不一致.*本次未执行迁移/u)
  assert.equal(
    calls.some((call) => call.startsWith('apply:')),
    false
  )
})

test('backup failures retain their stage instead of treating any tool name as missing tooling', async (t) => {
  for (const diagnostic of [
    'pg_dump: error: permission denied for table private_table',
    'docker restore exited with status 1',
  ]) {
    const { root, store } = createProject(t)
    const calls = []
    const runtime = dependencies(calls)
    runtime.backup = async () => {
      throw new Error(diagnostic)
    }
    const service = createDevDatabaseMigrationService({
      projectRoot: root,
      operationStore: store,
      dependencies: runtime,
    })
    const result = await service.act({
      action: 'prepare',
      idempotencyKey: PREPARE_KEY,
    })
    const blocked = await waitForOperation(service, result.operation.id, [
      'blocked',
    ])
    assert.equal(blocked.issues[0].code, 'backup_restore_failed')
    assert.match(blocked.message, /备份与隔离恢复/u)
    assert.doesNotMatch(JSON.stringify(blocked), /private_table|pg_dump:/u)
    assert.equal(
      calls.some((call) => call.startsWith('apply:')),
      false
    )
  }
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
  assert.equal(blocked.readback.applyStarted, false)
  assert.equal(blocked.readback.noWritesProven, true)
  assert.match(blocked.message, /本次未写入原库/u)
})

test('source drift during backup is reported as source drift rather than backup corruption', async (t) => {
  for (const failure of ['candidate-build', 'final-source-check']) {
    const { root, store } = createProject(t)
    const calls = []
    const runtime = dependencies(calls)
    const originalBackup = runtime.backup
    const originalSource = runtime.sourceIdentity
    runtime.backup = async (...args) => {
      if (failure === 'candidate-build') {
        throw Object.assign(new Error('构建期间运行代码已变化，请重新准备'), {
          code: 'WORKSPACE_RUNTIME_SOURCE_CHANGED',
        })
      }
      const backup = await originalBackup(...args)
      runtime.sourceIdentity = async () => ({
        ...(await originalSource()), fingerprint: 'f'.repeat(64),
      })
      return backup
    }
    const service = createDevDatabaseMigrationService({
      projectRoot: root, operationStore: store, dependencies: runtime,
    })
    const prepare = await service.act({ action: 'prepare', idempotencyKey: PREPARE_KEY })
    const blocked = await waitForOperation(service, prepare.operation.id, ['blocked'])
    assert.equal(blocked.issues[0].code, 'migration_source_changed', failure)
    assert.match(blocked.issues[0].message, /待相关修改结束/u)
    assert.equal(calls.some((call) => /^(?:stop|apply:|maintenance:)/u.test(call)), false)
  }
})

test('failures during maintenance preserve zero-write evidence and allow a new preparation', async (t) => {
  for (const failure of ['source-after-backup', 'backup', 'apply-preflight']) {
    const { root, store } = createProject(t)
    const calls = []
    const runtime = dependencies(calls)
    const service = createDevDatabaseMigrationService({
      projectRoot: root, operationStore: store, dependencies: runtime,
    })
    const prepared = await service.act({ action: 'prepare', idempotencyKey: PREPARE_KEY })
    const ready = await waitForOperation(service, prepared.operation.id, ['ready'])
    const originalBackup = runtime.backup
    const originalSource = runtime.sourceIdentity
    const originalApply = runtime.apply
    runtime.backup = async (...args) => {
      if (failure === 'backup') throw new Error('final backup unavailable')
      const backup = await originalBackup(...args)
      if (failure === 'source-after-backup') {
        runtime.sourceIdentity = async () => ({
          ...(await originalSource()), fingerprint: 'f'.repeat(64),
        })
      }
      return backup
    }
    if (failure === 'apply-preflight') {
      runtime.apply = async () => {
        calls.push('apply:preflight')
        throw Object.assign(new Error('workspace check failed'), {
          diagnostic: '[migration-summary] result=blocked writes=0 apply=not_started auto_retry=false\n[migration-summary] error_code=workspace_guard_failed next_action=fix_workspace',
        })
      }
    }
    await service.act({ action: 'execute', operationId: ready.id, confirmation: ready.confirmationPrompt })
    const blocked = await waitForOperation(service, ready.id, ['blocked'])
    assert.equal(blocked.readback.noWritesProven, true, failure)
    assert.equal(blocked.readback.applyStarted, failure === 'apply-preflight', failure)
    assert.equal(blocked.readback.dataAuditPassed, true)
    assert.equal(calls.includes('maintenance:false'), true)
    assert.equal(calls.filter((call) => call.startsWith('apply:')).length, failure === 'apply-preflight' ? 1 : 0)
    runtime.backup = originalBackup
    runtime.sourceIdentity = originalSource
    runtime.apply = originalApply
    const retry = await service.act({ action: 'prepare', idempotencyKey: `database-migration:prepare:${randomUUID()}` })
    assert.equal((await waitForOperation(service, retry.operation.id, ['ready'])).status, 'ready')
  }
})

test('database migration service re-verifies the prepared backup before apply', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  runtime.verifyBackup = async () => {
    calls.push('verify-backup')
    return false
  }
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

  await service.act({
    action: 'execute',
    operationId: ready.id,
    confirmation: ready.confirmationPrompt,
  })
  const blocked = await waitForOperation(service, ready.id, ['blocked'])
  assert.equal(blocked.issues[0].code, 'backup_restore_failed')
  assert.match(blocked.issues[0].message, /请重新准备/u)
  assert.equal(calls.filter((call) => call === 'verify-backup').length, 1)
  assert.equal(calls.filter((call) => call.startsWith('apply:')).length, 0)
})

test('database migration service takes a fresh backup even when schema is unchanged', async (t) => {
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
  assert.equal(calls.filter((call) => call.startsWith('backup:')).length, 2)
  assert.equal(calls.filter((call) => call === 'verify-backup').length, 0)
})

function requestMiddleware(
  middleware,
  {
    url = DEV_DATABASE_MIGRATION_SESSION_API_PATH,
    method = 'GET',
    body = '',
    remoteAddress = '127.0.0.1',
    localAddress = '127.0.0.1',
    localPort = 5175,
    headers = {},
  } = {}
) {
  const request = Readable.from(body ? [body] : [])
  request.url = url
  request.method = method
  request.socket = { remoteAddress, localAddress, localPort }
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

test('database migration writes are loopback, same-origin, CSRF, and fixed-action only', async () => {
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

test('LAN can read migration state and obtain a session while invalid writes remain rejected', async () => {
  const calls = []
  const middleware = createDevDatabaseMigrationMiddleware({
    service: {
      async summary() {
        calls.push('summary')
        return { status: 'success' }
      },
      readOperation(id) {
        calls.push('operation')
        return { id }
      },
      async act() {
        calls.push('write')
        return { accepted: true }
      },
    },
    csrfToken: 'fixed-csrf-token',
  })
  const lan = {
    remoteAddress: '192.168.0.66',
    localAddress: '192.168.0.133',
    localPort: 15200,
    headers: {
      host: '192.168.0.133:15200',
      'sec-fetch-site': 'same-origin',
    },
  }
  const summary = await requestMiddleware(middleware, {
    ...lan,
    url: DEV_DATABASE_MIGRATION_SUMMARY_API_PATH,
  })
  assert.equal(summary.statusCode, 200)
  assert.equal(JSON.parse(summary.body).readOnly, false)
  assert.equal(summary.headers['cache-control'], 'no-store')
  const operationId = '11111111-1111-4111-8111-111111111111'
  const detail = await requestMiddleware(middleware, {
    ...lan,
    url: `${DEV_DATABASE_MIGRATION_OPERATION_API_PREFIX}/${operationId}`,
  })
  assert.equal(detail.statusCode, 200)
  assert.equal(JSON.parse(detail.body).operation.id, operationId)
  assert.equal((await requestMiddleware(middleware, lan)).statusCode, 200)
  for (const action of ['prepare', 'execute', 'restart']) {
    const response = await requestMiddleware(middleware, {
      ...lan,
      url: DEV_DATABASE_MIGRATION_ACTION_API_PATH,
      method: 'POST',
      body: JSON.stringify({ action }),
      headers: {
        ...lan.headers,
        origin: 'http://192.168.0.133:15200',
        'content-type': 'application/json',
        'x-csrf-token': 'fixed-csrf-token',
      },
    })
    assert.equal(response.statusCode, 400)
  }
  const foreign = await requestMiddleware(middleware, {
    ...lan,
    url: DEV_DATABASE_MIGRATION_SUMMARY_API_PATH,
    headers: { ...lan.headers, origin: 'http://evil.test' },
  })
  assert.equal(foreign.statusCode, 403)
  const local = await requestMiddleware(middleware, {
    url: DEV_DATABASE_MIGRATION_SUMMARY_API_PATH,
  })
  assert.equal(local.statusCode, 200)
  assert.equal(JSON.parse(local.body).readOnly, false)
  assert.deepEqual(calls, ['summary', 'operation', 'summary'])
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
        disconnectClient: true,
      }),
    /unsupported fields/u
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

test('a verified daily version can restart while an unfinished candidate has pending migrations', async (t) => {
  const { root, store } = createProject(t)
  const calls = []
  const runtime = dependencies(calls)
  const originalRuntime = runtime.runtime
  runtime.runtime = async () => ({
    ...(await originalRuntime()),
    bundleId: 'verified-daily-version',
  })
  const originalRestart = runtime.restart
  runtime.restart = async (...args) => ({
    ...(await originalRestart(...args)),
    bundleId: 'verified-daily-version',
  })
  const service = createDevDatabaseMigrationService({
    projectRoot: root,
    operationStore: store,
    dependencies: runtime,
  })
  const accepted = await service.act({
    action: 'restart',
    idempotencyKey:
      'database-migration:restart:11111111-1111-4111-8111-111111111111',
  })
  const result = await waitForOperation(service, accepted.operation.id, [
    'passed',
  ])
  assert.equal(result.readback.pendingFiles, 1)
  assert.equal(
    calls.some((value) => value.startsWith('apply:')),
    false
  )
})
