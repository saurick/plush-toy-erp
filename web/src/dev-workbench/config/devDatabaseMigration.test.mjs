import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDevDatabaseMigrationClient,
  databaseMigrationStatusPresentation,
  selectActiveDatabaseMigrationOperation,
  validateDatabaseMigrationOperation,
  validateDatabaseMigrationSummary,
} from './devDatabaseMigration.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'

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
      safeTarget: 'host=192.168.0.106 port=5432 database=plush_erp',
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
