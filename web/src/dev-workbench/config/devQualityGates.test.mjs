import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEFAULT_VIEW,
  DEV_QUALITY_GATE_ACTION_API_PATH,
  DEV_QUALITY_GATE_API_PATH,
  DEV_QUALITY_GATE_SESSION_API_PATH,
  DEV_QUALITY_GATES_ROUTE,
  QUERY_KEYS,
  VIEW_ITEMS,
  VIEW_KEYS,
  VIEW_QUERY_KEYS,
  buildQualityGateViewSearch,
  createDevQualityGateClient,
  createQualityGateIdempotencyKey,
  formatQualityGateDuration,
  getQualityGateStageLabel,
  getQualityGateStatusMeta,
  normalizeDevQualityGateSummary,
  parseQualityGateSearch,
} from './devQualityGates.mjs'

const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const REQUEST_ID = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-08-09T08:00:00.000Z'

function operation(overrides = {}) {
  return {
    schemaVersion: 'plush.dev-quality-gate-operation-public/v1',
    id: OPERATION_ID,
    profile: 'strict',
    repository: {
      commit: 'a'.repeat(40),
      dirty: false,
      fingerprint: 'b'.repeat(64),
    },
    status: 'running',
    stage: 'preparing',
    stageTimings: [],
    receipt: null,
    cleanup: { status: 'pending', message: '等待运行结束后清理' },
    firstFailure: '',
    cancelRequestedAt: null,
    revision: 2,
    createdAt: NOW,
    updatedAt: NOW,
    finishedAt: null,
    message: '正在准备严格门禁',
    ...overrides,
  }
}

function summary(overrides = {}) {
  const currentOperation = operation()
  return {
    schemaVersion: 'plush.dev-quality-gates-summary/v1',
    generatedAt: NOW,
    repository: currentOperation.repository,
    environment: {
      disposableDatabaseReady: true,
      message: '一次性数据库环境已就绪',
    },
    busy: { active: true, kind: 'quality', profile: 'strict' },
    profiles: {
      full: {
        timeoutMs: 5_400_000,
        stages: [{ id: 'environment_profile', label: '环境与工具链准备' }],
      },
      strict: {
        timeoutMs: 10_800_000,
        stages: [{ id: 'strict_profile', label: '严格门禁配置' }],
      },
    },
    currentOperation,
    operations: [currentOperation],
    proofs: {
      full: {
        profile: 'full',
        status: 'missing',
        current: false,
        releaseEligible: false,
        reused: false,
        receipt: null,
      },
      strict: {
        profile: 'strict',
        status: 'missing',
        current: false,
        releaseEligible: false,
        reused: false,
        receipt: null,
      },
    },
    status: {
      tone: 'info',
      title: '严格门禁正在运行',
      description: '正在准备严格门禁',
      recommendation: '等待当前运行结束。',
      releaseEligible: false,
      notProven: ['目标环境发布', '客户 UAT'],
    },
    ...overrides,
  }
}

test('quality gates config: route, three views and per-view query contracts stay stable', () => {
  assert.equal(DEV_QUALITY_GATES_ROUTE, '/__dev/quality-gates')
  assert.equal(DEFAULT_VIEW, 'run')
  assert.deepEqual(VIEW_KEYS, ['run', 'governance', 'gaps'])
  assert.deepEqual(
    VIEW_ITEMS.map((item) => item.label),
    ['运行与结果', '门禁治理', '覆盖缺口']
  )
  assert.deepEqual(QUERY_KEYS, {
    view: 'view',
    profile: 'profile',
    operation: 'operation',
    q: 'q',
    filter: 'filter',
    range: 'range',
    risk: 'risk',
  })
  assert.deepEqual(VIEW_QUERY_KEYS, {
    run: ['view', 'profile', 'operation'],
    governance: ['view', 'q', 'filter'],
    gaps: ['view', 'range', 'risk'],
  })
})

test('quality gates config: deep links restore each view and switching drops foreign query', () => {
  assert.deepEqual(parseQualityGateSearch(''), {
    valid: true,
    canonicalMissingView: true,
    issues: [],
    view: 'run',
    values: { view: 'run', profile: '', operation: '' },
  })
  assert.equal(
    buildQualityGateViewSearch('run', {
      profile: 'strict',
      operation: OPERATION_ID,
      q: 'must not leak',
    }),
    `?view=run&profile=strict&operation=${OPERATION_ID}`
  )
  assert.equal(
    buildQualityGateViewSearch('governance', {
      q: '迁移',
      filter: 'attention',
      operation: OPERATION_ID,
    }),
    '?view=governance&q=%E8%BF%81%E7%A7%BB&filter=attention'
  )
  assert.equal(
    buildQualityGateViewSearch('gaps', {
      range: 'staged',
      risk: 'high',
      profile: 'strict',
    }),
    '?view=gaps&range=staged&risk=high'
  )
})

test('quality gates config: unknown, repeated, stale and cross-view query fail closed', () => {
  for (const search of [
    '?view=unknown',
    '?view=run&view=gaps',
    '?view=run&command=rm',
    '?view=run&q=wrong-view',
    `?view=governance&operation=${OPERATION_ID}`,
    '?view=gaps&risk=critical',
  ]) {
    assert.equal(parseQualityGateSearch(search).valid, false, search)
  }
  assert.equal(
    parseQualityGateSearch(`?view=run&operation=${OPERATION_ID}`, {
      operationIds: [],
    }).valid,
    false
  )
  assert.equal(
    parseQualityGateSearch(`?view=run&operation=${OPERATION_ID}`, {
      operationIds: [OPERATION_ID],
    }).valid,
    true
  )
})

test('quality gates config: idempotency and duration presentation are bounded', () => {
  assert.equal(
    createQualityGateIdempotencyKey('strict', {
      randomUUID: () => REQUEST_ID,
    }),
    `quality-gate:strict:${REQUEST_ID}`
  )
  assert.throws(() => createQualityGateIdempotencyKey('release'), /类型无效/u)
  assert.equal(formatQualityGateDuration(704_000), '11 分 44 秒')
  assert.equal(formatQualityGateDuration(3_661_000), '1 小时 1 分 1 秒')
  assert.equal(formatQualityGateDuration(null), '尚无可用耗时记录')
})

test('quality gates config: every operation status and stage label has a safe Chinese presentation', () => {
  const statuses = [
    'queued',
    'running',
    'cancelling',
    'passed',
    'failed',
    'cancelled',
    'timed_out',
    'blocked',
    'not_proven',
    'missing',
    'stale',
  ]
  for (const status of statuses) {
    assert.match(getQualityGateStatusMeta(status).label, /[\u4e00-\u9fff]/u)
  }
  assert.equal(
    getQualityGateStageLabel({ id: 'web', label: 'raw-web-label' }, [
      { id: 'web', label: 'Web 测试与生产构建' },
    ]),
    'Web 测试与生产构建'
  )
  assert.equal(
    getQualityGateStageLabel({ id: 'future_stage', label: 'future_stage' }, [
      { id: 'web', label: 'Web 测试与生产构建' },
    ]),
    '未登记阶段'
  )
})

test('quality gates config: summary preserves one shared operation truth', () => {
  const normalized = normalizeDevQualityGateSummary(summary())
  assert.equal(normalized.currentOperation.id, OPERATION_ID)
  assert.equal(normalized.operations[0].id, OPERATION_ID)
  assert.equal(normalized.repository.commit, 'a'.repeat(40))
  assert.equal(normalized.busy.kind, 'quality')
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({ currentOperation: operation({ id: REQUEST_ID }) })
      ),
    /inconsistent/u
  )
})

test('quality gates config: client uses fixed endpoints, CSRF and exact action payload', async () => {
  const calls = []
  const fetchImpl = async (url, options) => {
    calls.push({ url, options })
    if (url === DEV_QUALITY_GATE_SESSION_API_PATH) {
      return {
        ok: true,
        async json() {
          return {
            schemaVersion: 'plush.dev-quality-gate-session/v1',
            apiPath: DEV_QUALITY_GATE_API_PATH,
            csrfToken: 'c'.repeat(48),
          }
        },
      }
    }
    if (url === DEV_QUALITY_GATE_ACTION_API_PATH) {
      return {
        ok: true,
        async json() {
          return {
            schemaVersion: 'plush.dev-quality-gate-action-result/v1',
            profile: 'strict',
            reused: false,
            operation: operation(),
          }
        },
      }
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const client = createDevQualityGateClient({ fetchImpl })
  const idempotencyKey = `quality-gate:strict:${REQUEST_ID}`

  const result = await client.start('strict', idempotencyKey)

  assert.equal(result.operation.id, OPERATION_ID)
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    action: 'run',
    payload: { profile: 'strict', idempotencyKey },
  })
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'c'.repeat(48))
  await assert.rejects(
    client.start('strict', 'quality-gate:strict:not-a-uuid'),
    /运行请求无效/u
  )
})

test('quality gates page contract reuses DevTaskNav and a single page polling owner', () => {
  const pageSource = readFileSync(
    new URL('../pages/DevQualityGatesPage.jsx', import.meta.url),
    'utf8'
  )
  const taskNavSource = readFileSync(
    new URL('../components/DevTaskNav.jsx', import.meta.url),
    'utf8'
  )

  assert.match(pageSource, /<DevTaskNav/u)
  assert.match(pageSource, /idPrefix="quality-gates"/u)
  assert.equal((pageSource.match(/setInterval\(/gu) || []).length, 1)
  assert.match(pageSource, /AbortController/u)
  assert.match(pageSource, /viewState\.view === activeView/u)
  assert.match(pageSource, /data=\{activeViewState\.data\}/u)
  assert.match(taskNavSource, /aria-controls/u)
  assert.match(taskNavSource, /-panel-/u)
})
