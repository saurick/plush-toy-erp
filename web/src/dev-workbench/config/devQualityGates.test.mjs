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
  buildQualityGateCoverageMatrix,
  buildQualityGateHistoryTrend,
  buildQualityGateStageDurationComposition,
  buildQualityGateViewSearch,
  createDevQualityGateClient,
  createQualityGateIdempotencyKey,
  formatQualityGateDuration,
  getQualityGateFlowSegments,
  getQualityGateStageLabel,
  getQualityGateStatusMeta,
  normalizeDevQualityGateGaps,
  normalizeDevQualityGateSummary,
  parseQualityGateSearch,
  projectCurrentQualityGateProof,
  selectDisplayedQualityGateOperation,
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
        stages: [
          {
            id: 'environment_profile',
            label: '环境与工具链准备',
            parallel: false,
          },
        ],
        substeps: {},
      },
      strict: {
        timeoutMs: 10_800_000,
        stages: [
          {
            id: 'strict_profile',
            label: '严格门禁配置',
            parallel: false,
          },
        ],
        substeps: {},
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

test('quality gap protocol separates affected scopes from the local gate', () => {
  const gaps = normalizeDevQualityGateGaps({
    schemaVersion: 'plush.quality-gate-gap-analysis/v2',
    range: 'current',
    risk: 'all',
    changedCount: 1,
    affectedScopes: ['T0', 'T5'],
    maxAffectedScope: 'T5',
    localGate: 'full',
    matched: false,
    categories: [],
    boundaries: ['本地门禁不等于发布证据'],
  })
  assert.deepEqual(gaps.affectedScopes, ['T0', 'T5'])
  assert.equal(gaps.localGate, 'full')
  assert.throws(
    () =>
      normalizeDevQualityGateGaps({
        ...gaps,
        schemaVersion: 'plush.quality-gate-gap-analysis/v1',
      }),
    /quality gaps are invalid/u
  )
})

function receipt(overrides = {}) {
  return {
    profile: 'strict',
    status: 'passed',
    gitCommit: 'a'.repeat(40),
    treeState: 'clean',
    durationMs: 2000,
    finishedAt: NOW,
    executed: 12,
    passed: 12,
    failed: 0,
    skipped: 0,
    environmentFingerprint: 'c'.repeat(64),
    bottleneckStageId: 'web',
    stageTimings: [
      {
        id: 'web',
        label: 'Web 测试与生产构建',
        status: 'passed',
        startedAt: '2026-08-09T07:59:58.000Z',
        finishedAt: NOW,
        durationMs: 2000,
      },
    ],
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

test('quality gates config: flow segments derive strict additions and the shared full suffix', () => {
  const profiles = {
    full: {
      stages: [
        { id: 'environment_profile', label: '环境与工具链准备' },
        { id: 'web', label: 'Web 测试与生产构建' },
      ],
    },
    strict: {
      stages: [
        { id: 'strict_profile', label: '严格门禁配置' },
        { id: 'shellcheck', label: 'Shell 静态检查' },
        { id: 'environment_profile', label: '环境与工具链准备' },
        { id: 'web', label: 'Web 测试与生产构建' },
      ],
    },
  }

  assert.deepEqual(
    getQualityGateFlowSegments(profiles, 'strict').map((segment) => ({
      id: segment.id,
      scopeLabel: segment.scopeLabel,
      stageIds: segment.stages.map((stage) => stage.id),
    })),
    [
      {
        id: 'strict-extra',
        scopeLabel: '仅 strict',
        stageIds: ['strict_profile', 'shellcheck'],
      },
      {
        id: 'full-core',
        scopeLabel: 'full / strict 共用',
        stageIds: ['environment_profile', 'web'],
      },
    ]
  )
  assert.equal(getQualityGateFlowSegments(profiles, 'full')[0].id, 'full-core')
  assert.equal(
    getQualityGateFlowSegments(profiles, 'full')[0].scopeLabel,
    'full / strict 共用'
  )
  assert.deepEqual(getQualityGateFlowSegments(profiles, 'release'), [])
  assert.deepEqual(getQualityGateFlowSegments({}, 'strict'), [])
})

test('quality gates config: stage composition uses recorded durations and exposes parallel caveat', () => {
  const composition = buildQualityGateStageDurationComposition([
    {
      id: 'shared',
      label: '共享基础检查',
      durationMs: 100,
      parallel: true,
    },
    {
      id: 'web',
      label: 'Web 测试与生产构建',
      durationMs: 300,
      parallel: true,
    },
    { id: 'browser', label: '真实浏览器回归', durationMs: null },
  ])
  assert.equal(composition.totalDurationMs, 400)
  assert.equal(composition.hasParallel, true)
  assert.deepEqual(
    composition.items.map((item) => ({
      id: item.id,
      sharePercent: item.sharePercent,
      longest: item.longest,
    })),
    [
      { id: 'shared', sharePercent: 25, longest: false },
      { id: 'web', sharePercent: 75, longest: true },
    ]
  )
})

test('quality gates config: history trend requires three comparable passed receipts', () => {
  const reference = {
    profile: 'strict',
    receipt: {
      environmentFingerprint: 'c'.repeat(64),
      treeState: 'dirty',
    },
  }
  const samples = [3000, 2000, 4000, 1000].map((durationMs, index) => ({
    id: `${index + 1}`,
    profile: 'strict',
    status: 'passed',
    receipt: {
      status: 'passed',
      durationMs,
      finishedAt: `2026-08-09T0${index + 1}:00:00.000Z`,
      environmentFingerprint: 'c'.repeat(64),
      treeState: 'dirty',
    },
  }))
  samples.push({
    ...samples[0],
    id: 'other-environment',
    receipt: {
      ...samples[0].receipt,
      environmentFingerprint: 'd'.repeat(64),
    },
  })
  const trend = buildQualityGateHistoryTrend(samples, reference)
  assert.equal(trend.enoughSamples, true)
  assert.equal(trend.sampleCount, 4)
  assert.equal(trend.maxDurationMs, 4000)
  assert.deepEqual(
    trend.samples.map((sample) => sample.durationMs),
    [3000, 2000, 4000, 1000]
  )
  assert.equal(
    buildQualityGateHistoryTrend(samples.slice(0, 2), reference).enoughSamples,
    false
  )
})

test('quality gates config: coverage matrix keeps missing and not-applicable cells explicit', () => {
  const matrix = buildQualityGateCoverageMatrix([
    {
      key: 'frontend',
      label: '前端页面',
      highRisk: false,
      gateResults: [
        { gateKey: 'browser', label: '真实浏览器', status: 'current' },
        { gateKey: 'full', label: '完整门禁', status: 'stale' },
      ],
    },
    {
      key: 'database',
      label: '数据库',
      highRisk: true,
      gateResults: [
        { gateKey: 'strict', label: '严格门禁', status: 'missing' },
      ],
    },
  ])
  assert.deepEqual(
    matrix.gates.map((gate) => gate.key),
    ['browser', 'full', 'strict']
  )
  assert.deepEqual(
    matrix.rows[1].cells.map((cell) => cell.status),
    ['not_applicable', 'not_applicable', 'missing']
  )
})

test('quality gates config: summary preserves one shared operation truth', () => {
  const normalized = normalizeDevQualityGateSummary(summary())
  assert.equal(normalized.currentOperation.id, OPERATION_ID)
  assert.equal(normalized.operations[0].id, OPERATION_ID)
  assert.equal(normalized.repository.commit, 'a'.repeat(40))
  assert.equal(normalized.busy.kind, 'quality')
  assert.deepEqual(normalized.profiles.strict.substeps, {})
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({ currentOperation: operation({ id: REQUEST_ID }) })
      ),
    /inconsistent/u
  )
})

test('quality gates config: current formal proof wins over unrelated history', () => {
  const currentRepository = {
    commit: 'a'.repeat(40),
    dirty: false,
    fingerprint: 'd'.repeat(64),
  }
  const historical = operation({
    status: 'passed',
    finishedAt: NOW,
    receipt: receipt({ gitCommit: 'e'.repeat(40) }),
    repository: {
      commit: 'e'.repeat(40),
      dirty: true,
      fingerprint: 'f'.repeat(64),
    },
  })
  const currentSummary = summary({
    repository: currentRepository,
    currentOperation: null,
    operations: [historical],
    busy: { active: false, kind: '', profile: '' },
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
        status: 'passed',
        current: true,
        releaseEligible: true,
        reused: true,
        receipt: receipt(),
      },
    },
  })

  const projected = projectCurrentQualityGateProof(currentSummary, 'strict')
  assert.equal(projected.proofOnly, true)
  assert.equal(projected.repository.fingerprint, currentRepository.fingerprint)
  assert.equal(projected.message.includes('当前版本'), true)
  assert.equal(
    selectDisplayedQualityGateOperation(currentSummary).displayContext,
    'current-proof'
  )
  assert.equal(
    selectDisplayedQualityGateOperation(currentSummary, {
      operationId: historical.id,
    }).displayContext,
    'history'
  )
  const selectedHistory = selectDisplayedQualityGateOperation(currentSummary, {
    operationId: historical.id,
  })
  assert.match(selectedHistory.message, /不代表当前版本/u)
  assert.notEqual(selectedHistory.message, historical.message)
  assert.equal(historical.message, '正在准备严格门禁')

  const historyOnlySummary = summary({
    repository: currentRepository,
    currentOperation: null,
    operations: [historical],
    busy: { active: false, kind: '', profile: '' },
  })
  const defaultHistory = selectDisplayedQualityGateOperation(
    historyOnlySummary,
    { profile: 'strict' }
  )
  assert.equal(defaultHistory.displayContext, 'history')
  assert.match(defaultHistory.message, /当前仓库身份的正式回执/u)
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
  assert.match(pageSource, /selectDisplayedQualityGateOperation/u)
  assert.match(pageSource, /getQualityGateFlowSegments/u)
  assert.match(pageSource, /<ol/u)
  assert.match(pageSource, /aria-current=/u)
  assert.equal((pageSource.match(/<MermaidDiagram/gu) || []).length, 1)
  assert.match(pageSource, /静态工作原理，不代表当前运行状态/u)
  assert.match(pageSource, /buildQualityGateStageDurationComposition/u)
  assert.match(pageSource, /buildQualityGateHistoryTrend/u)
  assert.match(pageSource, /buildQualityGateCoverageMatrix/u)
  assert.match(pageSource, /当前正式回执/u)
  assert.match(pageSource, /\? '预计剩余'[\s\S]*?: '运行状态'/u)
  assert.doesNotMatch(pageSource, /Fixed quality evidence/u)
  assert.match(taskNavSource, /aria-controls/u)
  assert.match(taskNavSource, /-panel-/u)
})
