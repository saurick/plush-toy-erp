import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDevDatabaseMigrationClient,
  databaseMigrationPathStatuses,
  databaseMigrationDataScopeText,
  databaseMigrationExecutionText,
  databaseMigrationPreparationAvailable,
  databaseMigrationRecoveryComplete,
  databaseMigrationUpgradePresentation,
  databaseMigrationStatusPresentation,
  selectActiveDatabaseMigrationOperation,
  selectDatabaseMigrationPathOperation,
  validateDatabaseMigrationOperation,
  validateDatabaseMigrationSummary,
} from './devDatabaseMigration.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'

test('an older healthy bundle cannot complete recovery while workspace migrations are pending', () => {
  const value = summary()
  value.runtime = { available: true, bundleId: 'previous-runtime' }
  assert.equal(databaseMigrationRecoveryComplete(value), false)
  value.target.pendingFiles = 0
  assert.equal(databaseMigrationRecoveryComplete(value), true)
  value.status = 'blocked'
  assert.equal(databaseMigrationRecoveryComplete(value), false)
  value.status = 'success'
  value.runtime.available = false
  assert.equal(databaseMigrationRecoveryComplete(value), false)
})

test('execution text preserves proven zero writes without inferring them from an error code', () => {
  const stopped = {
    ...operation('blocked'),
    events: [{ status: 'applying' }],
    issues: [{ code: 'migration_source_changed' }],
  }
  assert.match(databaseMigrationExecutionText(stopped), /尚未完成核对/u)
  stopped.readback = { noWritesProven: true, applyStarted: false }
  assert.match(databaseMigrationExecutionText(stopped), /迁移前停止，未写入原库/u)
  stopped.readback.applyStarted = true
  assert.match(databaseMigrationExecutionText(stopped), /已确认本次未写入原库/u)
  stopped.status = 'not_proven'
  assert.match(databaseMigrationExecutionText(stopped), /结果未知/u)
})

test('preparation is available only for known pending migrations and a ready idle target', () => {
  const value = summary()
  assert.equal(databaseMigrationPreparationAvailable(value), true)
  for (const pendingFiles of [0, undefined, null, -1]) {
    value.target.pendingFiles = pendingFiles
    assert.equal(databaseMigrationPreparationAvailable(value), false)
  }
  value.target.pendingFiles = 1
  value.operations = [operation('preparing')]
  assert.equal(databaseMigrationPreparationAvailable(value), false)
  value.operations = [operation('blocked')]
  assert.equal(databaseMigrationPreparationAvailable(value), true)
  value.status = 'blocked'
  assert.equal(databaseMigrationPreparationAvailable(value), false)
  value.status = 'success'
  value.tools.status = 'blocked'
  assert.equal(databaseMigrationPreparationAvailable(value), false)
})

test('LAN access preserves readable state but cannot prepare migrations', () => {
  const value = { ...summary(), readOnly: true }
  assert.equal(validateDatabaseMigrationSummary(value), value)
  assert.equal(databaseMigrationPreparationAvailable(value), false)
  value.readOnly = false
  assert.equal(databaseMigrationPreparationAvailable(value), true)
  value.readOnly = 'false'
  assert.throws(() => validateDatabaseMigrationSummary(value), /返回结构无效/u)
})

test('a rejected preparation leaves the completed upgrade path visible without hiding unknown execution outcomes', () => {
  const value = summary()
  const completed = {
    ...operation('passed'),
    readback: {
      migrationVerified: true,
      currentVersion: value.target.latestVersion,
      pendingFiles: 0,
    },
    events: [{ status: 'applying' }, { status: 'passed' }],
  }
  const rejected = { ...operation('blocked'), target: null }
  value.operations = [rejected, completed]
  value.target = {
    ...value.target,
    currentVersion: value.target.latestVersion,
    pendingFiles: 0,
  }
  assert.equal(selectDatabaseMigrationPathOperation(value), completed)
  rejected.status = 'not_proven'
  assert.equal(selectDatabaseMigrationPathOperation(value), rejected)
  rejected.status = 'blocked'
  rejected.events = [{ status: 'applying' }]
  assert.equal(selectDatabaseMigrationPathOperation(value), rejected)
  const unknown = { ...rejected, status: 'not_proven' }
  rejected.events = [{ status: 'blocked' }]
  value.operations = [rejected, unknown, completed]
  assert.equal(selectDatabaseMigrationPathOperation(value), unknown)
  value.target.pendingFiles = 1
  assert.equal(selectDatabaseMigrationPathOperation(value), rejected)
  value.target.latestVersion = '20260928120000'
  value.operations = [completed]
  assert.equal(selectDatabaseMigrationPathOperation(value), null)
})

test('busy requests are shown as not started while real blockers retain the blocked label', () => {
  assert.deepEqual(
    databaseMigrationStatusPresentation('blocked', [
      { code: 'database_migration_busy' },
    ]),
    { color: 'warning', label: '未开始' }
  )
  assert.equal(databaseMigrationStatusPresentation('blocked').label, '已阻断')
})

test('candidate data conflicts survive later infrastructure failures until a newer audit passes', () => {
  const value = summary()
  const conflict = {
    ...operation('blocked'),
    plan: null,
    backup: null,
    issues: [{ code: 'unit_normalization_blocked', message: '数量与单位冲突' }],
  }
  const laterFailure = {
    ...operation('blocked'),
    plan: null,
    backup: null,
    issues: [
      { code: 'migration_workspace_check_failed', message: '代码检查失败' },
    ],
  }
  value.operations = [laterFailure, conflict]
  let state = databaseMigrationUpgradePresentation(value)
  assert.match(state.description, /数量与单位冲突/u)
  assert.match(state.description, /代码检查失败/u)
  assert.match(state.description, /尚未执行原库迁移/u)
  laterFailure.readback = { dataAuditPassed: true }
  state = databaseMigrationUpgradePresentation(value)
  assert.doesNotMatch(state.description, /数量与单位冲突/u)
})

test('live upgraded database and runtime recovery are independent of historical blockers', () => {
  const value = summary()
  value.operations = [
    {
      ...operation('blocked'),
      issues: [{ code: 'unit_normalization_blocked', message: '旧冲突' }],
    },
  ]
  value.target = {
    ...value.target,
    currentVersion: value.target.latestVersion,
    pendingFiles: 0,
  }
  value.runtime.available = false
  let state = databaseMigrationUpgradePresentation(value)
  assert.match(state.label, /迁移已完成，服务尚未恢复/u)
  assert.match(state.description, /无需重复迁移/u)
  assert.doesNotMatch(state.description, /旧冲突/u)
  value.runtime.available = true
  state = databaseMigrationUpgradePresentation(value)
  assert.equal(state.type, 'success')
  assert.match(state.label, /原库已是最新版本/u)
})

test('rehearsal evidence distinguishes empty business data, retained records and unrecorded historical scope', () => {
  assert.match(
    databaseMigrationDataScopeText({
      restoreVerified: true,
      businessRowsBeforeUpgrade: 0,
    }),
    /清理后重建.*不证明清理前/u
  )
  assert.match(
    databaseMigrationDataScopeText({
      restoreVerified: true,
      businessRowsBeforeUpgrade: 25,
    }),
    /保留.*25 条/u
  )
  assert.match(
    databaseMigrationDataScopeText({ restoreVerified: true }),
    /未记录/u
  )
  assert.match(
    databaseMigrationExecutionText({ status: 'not_proven' }),
    /结果未知.*不要重复执行/u
  )
  assert.match(
    databaseMigrationExecutionText({
      readback: {
        migrationVerified: true,
        currentVersion: 'v2',
        pendingFiles: 0,
      },
    }),
    /原库已核对至 v2/u
  )
})

function operation(status = 'ready') {
  return {
    schemaVersion: 'plush.dev-database-migration-operation/v1',
    id: OPERATION_ID,
    idempotencyKey:
      'database-migration:prepare:11111111-1111-4111-8111-111111111111',
    kind: 'migration',
    status,
    revision: 2,
    createdAt: '2026-07-29T08:00:00.000Z',
    updatedAt: '2026-07-29T08:01:00.000Z',
    message: '升级计划、真实备份和隔离恢复验证已完成',
    target: {
      key: 'shared-dev',
      safeTarget: 'host=192.168.0.133 port=5432 database=plush_erp',
      currentVersion: '20260728100514',
      latestVersion: '20260729043852',
      appliedFiles: 104,
      availableFiles: 105,
      pendingFiles: 1,
    },
    source: { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64) },
    plan: {
      hash: 'c'.repeat(64),
      preparedAt: '2026-07-29T08:00:30.000Z',
    },
    backup: {
      id: 'br-yoyoosun-20260729T080000+0800',
      sizeBytes: 1234,
      sha256: 'd'.repeat(64),
      restoreVerified: true,
      migrationBefore: '20260728100514',
      migrationAfter: '20260729043852',
      verifiedAt: '2026-07-29T08:00:50.000Z',
    },
    readback: null,
    confirmationPrompt: `升级共享开发库:20260729043852:${OPERATION_ID}`,
    issues: [],
    events: [
      {
        at: '2026-07-29T08:01:00.000Z',
        status,
        message: '迁移状态已经更新',
      },
    ],
  }
}

function summary() {
  return {
    schemaVersion: 'plush.dev-database-migration-summary/v1',
    status: 'success',
    target: operation().target,
    runtime: {
      available: true,
      health: { status: 'passed', httpCode: 200 },
      ready: { status: 'passed', httpCode: 200 },
    },
    tools: {
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
    },
    operations: [operation()],
    issues: [],
    boundary: {
      targetKey: 'shared-dev',
      arbitraryTargetAccepted: false,
      arbitraryCommandAccepted: false,
      automaticApply: false,
      automaticRetry: false,
      productionSupported: false,
    },
  }
}

function rehearsedOperation(status = 'ready') {
  const result = operation(status)
  result.backup.bundleId = OPERATION_ID
  result.backup.candidate = {
    bundleId: OPERATION_ID,
    populatedRestore: true,
    attachmentsRestored: true,
    health: true,
    ready: true,
    login: true,
    customerConfig: true,
    business: true,
  }
  return result
}

function migratedOperation(status = 'restarting') {
  const result = rehearsedOperation(status)
  result.events.unshift({
    at: '2026-07-29T08:00:55.000Z',
    status: 'applying',
    message: '正在执行已确认的迁移',
  })
  result.readback = {
    migrationVerified: true,
    currentVersion: result.target.latestVersion,
    pendingFiles: 0,
    runtime: null,
  }
  return result
}

test('migration path never treats rehearsal or an applying status as original database completion', () => {
  assert.deepEqual(databaseMigrationPathStatuses(null), Array(6).fill('wait'))
  assert.deepEqual(
    databaseMigrationPathStatuses(operation('passed')),
    Array(6).fill('wait')
  )
  for (const status of ['ready', 'applying', 'blocked', 'not_proven']) {
    assert.deepEqual(
      databaseMigrationPathStatuses(rehearsedOperation(status)),
      ['finish', 'finish', 'wait', 'wait', 'wait', 'wait']
    )
  }
  const incomplete = rehearsedOperation()
  incomplete.backup.candidate.business = false
  assert.deepEqual(databaseMigrationPathStatuses(incomplete), [
    'finish',
    'wait',
    'wait',
    'wait',
    'wait',
    'wait',
  ])
})

test('migration path preserves proven database completion when startup fails', () => {
  const failed = migratedOperation('failed')
  assert.deepEqual(databaseMigrationPathStatuses(failed), [
    'finish',
    'finish',
    'finish',
    'finish',
    'wait',
    'wait',
  ])
  for (const mismatch of [
    { migrationVerified: false },
    { pendingFiles: 1 },
    { currentVersion: failed.target.currentVersion },
  ]) {
    assert.deepEqual(
      databaseMigrationPathStatuses({
        ...failed,
        readback: { ...failed.readback, ...mismatch },
      }),
      ['finish', 'finish', 'wait', 'wait', 'wait', 'wait']
    )
  }
})

test('migration path requires the verified candidate runtime before marking the version switched', () => {
  const completed = migratedOperation('passed')
  completed.readback.runtime = {
    available: true,
    bundleId: completed.backup.bundleId,
    activeVersion: completed.target.latestVersion,
  }
  assert.deepEqual(
    databaseMigrationPathStatuses(completed),
    Array(6).fill('finish')
  )
  for (const mismatch of [
    { available: false },
    { bundleId: '22222222-2222-4222-8222-222222222222' },
    { activeVersion: completed.target.currentVersion },
  ]) {
    assert.deepEqual(
      databaseMigrationPathStatuses({
        ...completed,
        readback: {
          ...completed.readback,
          runtime: { ...completed.readback.runtime, ...mismatch },
        },
      }),
      ['finish', 'finish', 'finish', 'finish', 'wait', 'wait']
    )
  }
  assert.deepEqual(
    databaseMigrationPathStatuses({ ...completed, kind: 'restart' }),
    Array(6).fill('wait')
  )
})

test('migration path does not mark a SQL transaction completed when no migrations were pending', () => {
  const unchanged = migratedOperation()
  unchanged.target.pendingFiles = 0
  assert.deepEqual(databaseMigrationPathStatuses(unchanged), [
    'finish',
    'finish',
    'finish',
    'wait',
    'wait',
    'wait',
  ])
})

test('database migration client accepts fixed safe summaries and operations', () => {
  assert.equal(
    validateDatabaseMigrationSummary(summary()).target.pendingFiles,
    1
  )
  assert.equal(validateDatabaseMigrationOperation(operation()).status, 'ready')
  assert.equal(
    selectActiveDatabaseMigrationOperation([operation('passed'), operation()])
      .status,
    'ready'
  )
  assert.equal(
    databaseMigrationStatusPresentation('not_proven').label,
    '结果待核对'
  )
})

test('database migration client rejects hidden confirmations and arbitrary targets', () => {
  assert.throws(
    () =>
      validateDatabaseMigrationOperation({
        ...operation(),
        internal: { applyConfirmation: 'hidden' },
      }),
    /返回结构无效/u
  )
  const unsafe = summary()
  unsafe.target = { ...unsafe.target, key: 'production' }
  assert.throws(
    () => validateDatabaseMigrationSummary(unsafe),
    /数据库目标返回结构无效/u
  )
})

test('database migration client rejects inconsistent tool readiness', () => {
  const invalid = summary()
  invalid.tools = {
    ...invalid.tools,
    status: 'ready',
    checks: invalid.tools.checks.map((check, index) =>
      index === 0 ? { ...check, status: 'blocked' } : check
    ),
  }
  assert.throws(
    () => validateDatabaseMigrationSummary(invalid),
    /迁移准备环境状态不一致/u
  )
})

test('database migration client rejects missing or ambiguous evidence timestamps', () => {
  assert.throws(
    () =>
      validateDatabaseMigrationOperation({
        ...operation(),
        createdAt: '2026-07-29T08:00:00',
      }),
    /迁移操作返回结构无效/u
  )
  assert.throws(
    () =>
      validateDatabaseMigrationOperation({
        ...operation(),
        plan: { ...operation().plan, preparedAt: 'not-a-date' },
      }),
    /迁移计划返回结构无效/u
  )
  assert.throws(
    () =>
      validateDatabaseMigrationOperation({
        ...operation(),
        backup: { ...operation().backup, verifiedAt: null },
      }),
    /备份验证返回结构无效/u
  )
  assert.throws(
    () =>
      validateDatabaseMigrationOperation({
        ...operation(),
        events: [
          {
            at: '2026-07-29T08:01:00',
            status: 'ready',
            message: '迁移状态已经更新',
          },
        ],
      }),
    /迁移状态事件返回结构无效/u
  )
})

test('database migration client sends only fixed action intent with CSRF', async () => {
  const calls = []
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options })
    if (url.endsWith('/session')) {
      return new Response(
        JSON.stringify({
          schemaVersion: 'plush.dev-database-migration-session/v1',
          csrfToken: 'x'.repeat(32),
          target: 'shared-dev',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    return new Response(
      JSON.stringify({ accepted: true, operation: operation('preparing') }),
      { status: 202, headers: { 'content-type': 'application/json' } }
    )
  }
  const client = createDevDatabaseMigrationClient({ fetchImpl })
  await client.act({
    action: 'prepare',
    idempotencyKey:
      'database-migration:prepare:11111111-1111-4111-8111-111111111111',
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[1].options.headers['x-csrf-token'], 'x'.repeat(32))
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: 'prepare',
    idempotencyKey:
      'database-migration:prepare:11111111-1111-4111-8111-111111111111',
  })
})

test('database migration client refreshes an expired session on the next explicit action without replaying writes', async () => {
  let sessions = 0
  let actions = 0
  const client = createDevDatabaseMigrationClient({
    fetchImpl: async (url, options) => {
      assert(options.signal instanceof AbortSignal)
      if (url.endsWith('/session')) {
        sessions += 1
        return Response.json({
          schemaVersion: 'plush.dev-database-migration-session/v1',
          target: 'shared-dev',
          csrfToken: String(sessions).repeat(32),
        })
      }
      actions += 1
      assert.equal(options.headers['x-csrf-token'], String(sessions).repeat(32))
      return actions === 1
        ? Response.json({ message: 'expired' }, { status: 403 })
        : Response.json(
            { accepted: true, operation: operation('preparing') },
            { status: 202 }
          )
    },
  })
  const action = {
    action: 'prepare',
    idempotencyKey: operation().idempotencyKey,
  }
  await assert.rejects(client.act(action), /会话已失效.*本次请求未执行/u)
  assert.equal(actions, 1)
  await client.act(action)
  assert.equal(sessions, 2)
  assert.equal(actions, 2)
})

test('database migration client gives bounded actionable network errors without automatic retry', async () => {
  let calls = 0
  const client = createDevDatabaseMigrationClient({
    fetchImpl: async (_, options) => {
      assert(options.signal instanceof AbortSignal)
      calls += 1
      throw new Error('private raw network error')
    },
  })
  await assert.rejects(client.summary(), /刷新状态核对结果.*没有自动重试/u)
  assert.equal(calls, 1)
})
