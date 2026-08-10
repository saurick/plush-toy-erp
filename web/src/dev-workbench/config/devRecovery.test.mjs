import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEV_DRILL_RECOVERY_CATALOG,
  buildDevRecoveryOverview,
  resolveDevRecoveryTarget,
  validateDevDrillRecoveryCatalog,
} from './devRecovery.mjs'

const CURRENT_SHA = 'a'.repeat(40)
const PREVIOUS_SHA = 'b'.repeat(40)

function operation({
  id,
  action,
  gitSha,
  updatedAt,
  target = 'test-133',
  message = 'target promotion and basic runtime verification passed',
}) {
  return {
    id,
    action,
    target,
    gitSha,
    status: 'passed',
    terminal: true,
    updatedAt,
    events: [{ message }],
  }
}

function summary({ targetStatus = 'passed', operations = [] } = {}) {
  return {
    generatedAt: '2026-08-10T01:00:00.000Z',
    boundaries: { target: 'test-133' },
    target: {
      schemaVersion: 'plush.target-preflight/v1',
      generatedAt: '2026-08-10T00:59:00.000Z',
      status: targetStatus,
      target: 'test-133',
      purpose: 'customer-trial',
      customer: 'yoyoosun',
      trialTarget: 'customer-trial-133',
      remote: {
        runtime: { serverSha: CURRENT_SHA, webSha: CURRENT_SHA },
        publicEntry: {
          gitSha: CURRENT_SHA,
          status: 'passed',
          health: 'passed',
          provider: 'passed',
        },
      },
    },
    versions: [
      {
        gitSha: CURRENT_SHA,
        status: 'published',
        completeAssets: true,
      },
      {
        gitSha: PREVIOUS_SHA,
        status: 'published',
        completeAssets: true,
      },
    ],
    operations,
  }
}

test('devRecovery: 演练目录按 P0、P1、P2 排序且不暴露任意执行输入', () => {
  assert.equal(
    validateDevDrillRecoveryCatalog(DEV_DRILL_RECOVERY_CATALOG),
    DEV_DRILL_RECOVERY_CATALOG
  )
  assert.deepEqual(
    DEV_DRILL_RECOVERY_CATALOG.map((drill) => drill.priority),
    ['P0', 'P0', 'P0', 'P1', 'P1', 'P2']
  )
  assert.deepEqual(
    DEV_DRILL_RECOVERY_CATALOG.map((drill) => drill.key),
    [
      'target-readiness',
      'same-sha-idempotency',
      'rollback-forward',
      'backup-restore-isolated',
      'target-cutover',
      'fault-injection',
    ]
  )
  const forbiddenKeys = new Set([
    'command',
    'argv',
    'host',
    'path',
    'ssh',
    'sql',
    'databaseUrl',
  ])
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      assert.equal(forbiddenKeys.has(key), false, `禁止演练目录字段 ${key}`)
      visit(child)
    }
  }
  visit(DEV_DRILL_RECOVERY_CATALOG)
})

test('devRecovery: 目标展示使用业务环境语义并保留技术 key', () => {
  assert.deepEqual(resolveDevRecoveryTarget(summary()), {
    key: 'test-133',
    label: '客户试用环境',
    purpose: 'customer-trial',
    customer: 'yoyoosun',
    trialTarget: 'customer-trial-133',
  })
  assert.deepEqual(
    resolveDevRecoveryTarget({
      boundaries: { target: 'prod-primary' },
      target: { purpose: 'production', customer: 'yoyoosun' },
    }),
    {
      key: 'prod-primary',
      label: '正式生产环境',
      purpose: 'production',
      customer: 'yoyoosun',
      trialTarget: '',
    }
  )
  assert.doesNotMatch(
    DEV_DRILL_RECOVERY_CATALOG.map((drill) => drill.title).join(' '),
    /133|192\.168|admin\.yoyoosun/u,
    '演练名称不能绑定当前物理服务器'
  )
})

test('devRecovery: 只把精确幂等和完整回滚再前滚 operation 认作最近证据', () => {
  const overview = buildDevRecoveryOverview(
    summary({
      operations: [
        operation({
          id: '30000000-0000-4000-8000-000000000003',
          action: 'promote',
          gitSha: CURRENT_SHA,
          updatedAt: '2026-08-10T00:50:00.000Z',
          message: 'requested exact SHA is already current and healthy',
        }),
        operation({
          id: '20000000-0000-4000-8000-000000000002',
          action: 'promote',
          gitSha: CURRENT_SHA,
          updatedAt: '2026-08-10T00:40:00.000Z',
        }),
        operation({
          id: '10000000-0000-4000-8000-000000000001',
          action: 'rollback',
          gitSha: PREVIOUS_SHA,
          updatedAt: '2026-08-10T00:30:00.000Z',
          message: 'code-only rollback and basic runtime verification passed',
        }),
      ],
    })
  )
  assert.equal(overview.target.label, '客户试用环境')
  assert.equal(overview.currentSha, CURRENT_SHA)
  assert.equal(overview.publicSha, CURRENT_SHA)
  assert.deepEqual(
    overview.drills.slice(0, 3).map((drill) => drill.status),
    ['current', 'current', 'current']
  )
  assert.equal(overview.next.key, 'backup-restore-isolated')
  assert.equal(
    overview.drills.find((drill) => drill.key === 'same-sha-idempotency')
      .evidenceState.operationId,
    '30000000-0000-4000-8000-000000000003'
  )
})

test('devRecovery: 普通部署不冒充幂等演练，故障注入保持禁用', () => {
  const overview = buildDevRecoveryOverview(
    summary({
      operations: [
        operation({
          id: '10000000-0000-4000-8000-000000000001',
          action: 'promote',
          gitSha: CURRENT_SHA,
          updatedAt: '2026-08-10T00:30:00.000Z',
        }),
      ],
    })
  )
  assert.equal(
    overview.drills.find((drill) => drill.key === 'same-sha-idempotency')
      .status,
    'available'
  )
  assert.equal(
    overview.drills.find((drill) => drill.key === 'fault-injection').action
      .type,
    'disabled'
  )
  assert.equal(
    overview.drills.find((drill) => drill.key === 'target-readiness').action
      .type,
    'refresh'
  )
})

test('devRecovery: 新增目标后只消费当前目标自己的演练证据', () => {
  const overview = buildDevRecoveryOverview(
    summary({
      operations: [
        operation({
          id: '40000000-0000-4000-8000-000000000004',
          action: 'promote',
          target: 'prod-primary',
          gitSha: CURRENT_SHA,
          updatedAt: '2026-08-10T00:55:00.000Z',
          message: 'requested exact SHA is already current and healthy',
        }),
        operation({
          id: '30000000-0000-4000-8000-000000000003',
          action: 'promote',
          gitSha: CURRENT_SHA,
          updatedAt: '2026-08-10T00:50:00.000Z',
        }),
      ],
    })
  )
  assert.equal(
    overview.drills.find((drill) => drill.key === 'same-sha-idempotency')
      .status,
    'available'
  )
  assert.deepEqual(
    overview.operations.map((item) => item.id),
    ['30000000-0000-4000-8000-000000000003']
  )
})

test('devRecovery: 页面只读消费版本摘要，不创建第二套写动作', () => {
  const source = readFileSync(
    new URL('../pages/DevDrillRecoveryPage.jsx', import.meta.url),
    'utf8'
  )
  assert.match(source, /createDevDeliveryClient/u)
  assert.match(source, /client\.summary\(\)/u)
  assert.doesNotMatch(source, /client\.action|fetch\(|WebSocket|EventSource/u)
  assert.match(source, /当前没有可冒充演练结果的正式回执/u)
  assert.match(source, /禁止对当前试用或正式环境临时注入故障/u)
})
