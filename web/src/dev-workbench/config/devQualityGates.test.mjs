import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { projectCiJobGuides } from '../../../../scripts/qa/ci-job-guide.mjs'
import { getQualityGateProfileLabel } from './qualityGatePresentation.mjs'

import {
  DEFAULT_VIEW,
  DEV_QUALITY_GATE_ACTION_API_PATH,
  DEV_QUALITY_GATE_API_PATH,
  DEV_QUALITY_GATE_SESSION_API_PATH,
  DEV_QUALITY_GATES_ROUTE,
  QUERY_KEYS,
  VIEW_ITEMS,
  WORKSPACE_VIEW_ITEMS,
  getQualityGateViewGroup,
  getQualityGateViewGroups,
  getQualityGateEnvironment,
  VIEW_KEYS,
  VIEW_QUERY_KEYS,
  buildQualityGateCoverageMatrix,
  buildQualityGateHistoryTrend,
  buildQualityGateServerJobGuide,
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

test('diagnostic headings and execution tracks share the same execution-side labels', () => {
  assert.equal(getQualityGateProfileLabel('full'), '本机完整诊断')
  assert.equal(getQualityGateProfileLabel('strict'), '本机严格诊断')
  assert.equal(getQualityGateProfileLabel('full', true), '服务端完整诊断')
  assert.equal(getQualityGateProfileLabel('strict', true), '服务端严格诊断')
  assert.equal(getQualityGateProfileLabel('unknown', true), '未登记门禁')
})

test('quality views separate workspace checks, remote CI and shared rules without changing URLs', () => {
  assert.deepEqual(WORKSPACE_VIEW_ITEMS.map(({ value }) => value), ['run', 'gaps'])
  assert.deepEqual(VIEW_KEYS.map(getQualityGateViewGroup), ['server', 'workspace', 'governance', 'workspace'])
  for (const view of VIEW_KEYS) {
    assert.equal(parseQualityGateSearch(new URLSearchParams({ view })).view, view)
  }
  assert.equal(getQualityGateViewGroups()[0].label, '本地检查')
  assert.equal(getQualityGateViewGroups(true)[0].label, '服务端检查')
  for (const standalone of [false, true]) {
    assert.equal(getQualityGateEnvironment('server', standalone).kind, 'server')
    assert.equal(getQualityGateEnvironment('governance', standalone).kind, 'reference')
    assert.equal(getQualityGateEnvironment('run', standalone).kind, standalone ? 'server' : 'local')
    assert.equal(getQualityGateEnvironment('gaps', standalone).kind, standalone ? 'server' : 'local')
  }
})

function operation(overrides = {}) {
  return {
    kind: 'plush.dev-quality-gate-operation-public',
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
    kind: 'plush.dev-quality-gates-summary',
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
    serverEvidence: {
      kind: 'plush.dev-quality-gate-server-evidence',
      reports: null,
      status: 'passed',
      current: true,
      coversWorkingTree: true,
      gitSha: 'a'.repeat(40),
      pipeline: {
        id: 39,
        attempt: 39,
        url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/39',
        status: 'completed',
        conclusion: 'success',
        queueMs: 3_500,
        durationMs: 395_000,
        finishedAt: NOW,
      },
      jobs: [
        {
          id: 390,
          name: 'CI Gate',
          status: 'completed',
          conclusion: 'success',
          durationMs: 2_000,
          queueMs: 500,
          attemptCount: 1,
          startedAt: null,
          finishedAt: null,
          role: 'terminal',
          group: 'pipeline',
          url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/390',
        },
      ],
      jobGuides: projectCiJobGuides(['CI Gate']),
      historyStatus: 'available',
      history: [
        { id: 39, result: 'success', gitSha: 'a'.repeat(40), url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/39' },
        { id: 38, result: 'failed', gitSha: 'c'.repeat(40), url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/38' },
      ],
      message: 'GitLab CI 已通过当前 exact SHA 的完整分片、聚合与 CI Gate。',
      notProven: ['不可变 Release', '目标部署', '客户 UAT'],
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
    kind: 'plush.quality-gate-gap-analysis',
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
        kind: 'invalid-quality-gap-analysis',
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

test('quality gates config: route, four views and per-view query contracts stay stable', () => {
  assert.equal(DEV_QUALITY_GATES_ROUTE, '/__dev/quality-gates')
  assert.equal(DEFAULT_VIEW, 'server')
  assert.deepEqual(VIEW_KEYS, ['server', 'run', 'governance', 'gaps'])
  assert.deepEqual(
    VIEW_ITEMS.map((item) => item.label),
    ['CI 结果', '本机诊断', '门禁目录', '改动缺口']
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
    server: ['view'],
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
    view: 'server',
    values: { view: 'server' },
  })
  assert.equal(
    buildQualityGateViewSearch('server', {
      profile: 'strict',
      q: 'must not leak',
    }),
    '?view=server'
  )
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
    '?view=server&profile=strict',
    '?view=server&serverView=unknown',
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
  assert.equal(normalized.serverEvidence.pipeline.id, 39)
  assert.equal(normalized.serverEvidence.jobs[0].name, 'CI Gate')
  assert.equal(normalized.serverEvidence.jobGuides[0].label, 'CI 最终门禁')
  assert.match(normalized.serverEvidence.jobGuides[0].diagnostics.entry, /CI Gate/u)
  assert.equal(normalized.serverEvidence.history.length, 2)
  assert.equal(normalized.serverEvidence.history[1].result, 'failed')
  assert.equal('jobs' in normalized.serverEvidence.history[0], false)
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({ currentOperation: operation({ id: REQUEST_ID }) })
      ),
    /inconsistent/u
  )
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({
          serverEvidence: {
            ...summary().serverEvidence,
            pipeline: {
              ...summary().serverEvidence.pipeline,
              url: 'https://example.com/pipelines/39',
            },
          },
        })
      ),
    /pipeline is invalid/u
  )
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({
          serverEvidence: {
            ...summary().serverEvidence,
            history: [...summary().serverEvidence.history].reverse(),
          },
        })
      ),
    /history order is invalid/u
  )
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({
          serverEvidence: {
            ...summary().serverEvidence,
            jobs: [
              summary().serverEvidence.jobs[0],
              summary().serverEvidence.jobs[0],
            ],
          },
        })
      ),
    /state is inconsistent/u
  )
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({
          serverEvidence: {
            ...summary().serverEvidence,
            jobGuides: [],
          },
        })
      ),
    /state is inconsistent/u
  )
  assert.throws(
    () =>
      normalizeDevQualityGateSummary(
        summary({
          serverEvidence: {
            ...summary().serverEvidence,
            jobGuides: [
              summary().serverEvidence.jobGuides[0],
              summary().serverEvidence.jobGuides[0],
            ],
          },
        })
      ),
    /state is inconsistent/u
  )
})

test('quality job diagnostics rejects unknown fields and unbounded copied content', () => {
  const original = summary()
  const guide = original.serverEvidence.jobGuides[0]
  for (const diagnostics of [
    { ...guide.diagnostics, token: 'must-not-be-published' },
    { ...guide.diagnostics, steps: Array(9).fill('step') },
    { ...guide.diagnostics, entry: 'x'.repeat(241) },
    { ...guide.diagnostics, triage: ['line\ncontrol'] },
  ]) {
    assert.throws(() => normalizeDevQualityGateSummary({ ...original, serverEvidence: { ...original.serverEvidence, jobGuides: [{ ...guide, diagnostics }] } }))
  }
})

test('quality gates config: GitLab CI timing does not invent jobs without evidence', () => {
  const timing = buildQualityGateServerJobGuide({
    status: 'unavailable',
    pipeline: null,
    jobs: [],
  })

  assert.deepEqual(timing.flowJobs, [])
  assert.deepEqual(timing.flowGroups, [])
})

test('quality gates config: GitLab CI missing evidence is distinct from unreadable evidence', () => {
  const timing = buildQualityGateServerJobGuide({
    status: 'missing',
    pipeline: null,
    jobs: [],
  })

  assert.deepEqual(timing.flowJobs, [])
})

test('quality gates config: GitLab CI queued and in-progress jobs keep distinct states', () => {
  const timing = buildQualityGateServerJobGuide({
    status: 'running',
    pipeline: { durationMs: null, queueMs: 2_000 },
    jobs: [
      {
        id: 1,
        name: 'plan',
        status: 'queued',
        conclusion: '',
        durationMs: null,
      },
      {
        id: 2,
        name: 'prepare',
        status: 'in_progress',
        conclusion: '',
        durationMs: null,
      },
    ],
  })

  assert.equal(
    timing.flowJobs.find((job) => job.name === 'plan').status,
    'pending'
  )
  assert.equal(
    timing.flowJobs.find((job) => job.name === 'prepare').status,
    'running'
  )
  assert.equal(timing.flowJobs.length, 2)
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
            kind: 'plush.dev-quality-gate-session',
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
            kind: 'plush.dev-quality-gate-action-result',
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
  const sources = {
    page: pageSource,
    presentation: readFileSync(new URL('./qualityGatePresentation.mjs', import.meta.url), 'utf8'),
    execution: readFileSync(new URL('../components/quality-gates/QualityGateExecutionFlow.jsx', import.meta.url), 'utf8'),
    charts: readFileSync(new URL('../components/quality-gates/QualityGateEvidenceCharts.jsx', import.meta.url), 'utf8'),
    server: readFileSync(new URL('../components/quality-gates/ServerCiEvidencePanel.jsx', import.meta.url), 'utf8'),
    guide: readFileSync(new URL('../components/quality-gates/ServerCiJobGuideDrawer.jsx', import.meta.url), 'utf8'),
    run: readFileSync(new URL('../components/quality-gates/QualityGateRunView.jsx', import.meta.url), 'utf8'),
    governance: readFileSync(new URL('../components/quality-gates/QualityGateGovernanceViews.jsx', import.meta.url), 'utf8'),
    context: readFileSync(new URL('../components/quality-gates/QualityGateContextStrip.jsx', import.meta.url), 'utf8'),
  }
  const assertNoSourceMatches = (pattern) => {
    for (const moduleSource of Object.values(sources)) assert.doesNotMatch(moduleSource, pattern)
  }
  for (const [name, moduleSource] of Object.entries(sources)) {
    if (name !== 'page') {
      assert.doesNotMatch(
        moduleSource,
        /\b(?:setInterval|createDevQualityGateClient)\s*\(/u,
        `${name} keeps requests and polling with the page owner`
      )
    }
  }

  assert.match(sources.page, /<DevTaskNav/u)
  assert.match(sources.page, /idPrefix="quality-gates"/u)
  assert.equal((sources.page.match(/setInterval\(/gu) || []).length, 1)
  assert.match(sources.page, /AbortController/u)
  assert.match(sources.page, /viewState\.key === viewKey/u)
  assert.match(sources.page, /data=\{activeViewState\.data\}/u)
  assert.match(sources.page, /selectDisplayedQualityGateOperation/u)
  assert.match(sources.presentation, /getQualityGateFlowSegments/u)
  assert.match(sources.execution, /<ol/u)
  assert.match(sources.execution, /aria-current=/u)
  assert.match(sources.execution, /静态工作原理，不代表当前运行状态/u)
  assert.match(sources.execution, /buildQualityGateStageDurationComposition/u)
  assert.match(sources.charts, /buildQualityGateHistoryTrend/u)
  assert.match(sources.charts, /buildQualityGateCoverageMatrix/u)
  assert.match(sources.execution, /当前正式回执/u)
  assert.match(sources.server, /aria-label="GitLab CI 质量证据"/u)
  assert.match(sources.server, /查看 GitLab 测试报告/u)
  assert.match(sources.server, /target="_blank"/u)
  assert.doesNotMatch(sources.server, /ServerCiPipelineFlow|ServerJobPerformance/u)
  assert.match(sources.server, /evidence\.pipeline\?\.url/u)
  assert.match(sources.guide, /<Drawer/u)

  assert.match(sources.guide, /先看阶段，再按需查看单个 Job/u)
  assert.match(sources.presentation, /核对子 Job 回执并形成领域结论/u)

  assertNoSourceMatches(/serverJobLocalStageLabels/u)
  assertNoSourceMatches(/本机阶段与 GitLab CI Job 对照/u)
  assertNoSourceMatches(/CI：\{ciJob\.label\}/u)
  assert.equal((sources.presentation.match(/label: '本次流水线'/gu) || []).length, 1)
  assert.equal((sources.presentation.match(/label: 'Job 性能'/gu) || []).length, 1)
  assert.equal((sources.presentation.match(/label: 'CI 历史'/gu) || []).length, 1)
  assert.match(sources.presentation, /pending: '等待运行'/u)
  assert.match(sources.presentation, /missing: '未产生 CI 记录'/u)
  assert.match(sources.presentation, /unavailable: '读取失败'/u)
  assert.match(sources.presentation, /连接正常 · 当前提交无 CI/u)
  assert.match(sources.presentation, /连接正常 · 当前提交无 CI/u)
  assert.match(sources.presentation, /GitLab CI 正在读取服务器证据/u)
  assert.match(sources.presentation, /serverHistoryFailureLabel/u)
  assertNoSourceMatches(/missing: '暂无当前 CI'/u)
  assertNoSourceMatches(/unavailable: '待读取'/u)
  assert.match(sources.run, /aria-label="诊断范围"/u)
  assert.match(sources.run, /本机最近诊断/u)
  assertNoSourceMatches(/严格门禁：发版前验证/u)
  assert.match(sources.run, /\? '预计剩余'[\s\S]*?: '运行状态'/u)
  assertNoSourceMatches(/Fixed quality evidence/u)
  assert.match(taskNavSource, /aria-controls/u)
  assert.match(taskNavSource, /-panel-/u)
})

test('native reports reject another pipeline, stale results and untrusted coverage links', () => {
  const payload = summary()
  const evidence = payload.serverEvidence
  const reports = {
    status: 'available',
    gitSha: evidence.gitSha,
    pipelineId: evidence.pipeline.id,
    tests: { count: 3, success: 2, failed: 1, skipped: 0, error: 0 },
    testsUrl: `${evidence.pipeline.url}/test_report`,
    coverage: [{ job: evidence.jobs[0].name, percent: 81.25, url: evidence.jobs[0].url, artifactUrl: null }],
  }
  evidence.reports = reports
  assert.equal(normalizeDevQualityGateSummary(payload).serverEvidence.reports.tests.failed, 1)
  for (const override of [
    { pipelineId: 40 }, { gitSha: 'b'.repeat(40) }, { testsUrl: 'https://example.com/test_report' },
    { status: 'unavailable' }, { status: 'missing' },
    { tests: { ...reports.tests, count: 4 } },
    { coverage: [{ ...reports.coverage[0], percent: 101 }] },
    { coverage: [{ ...reports.coverage[0], url: `${evidence.jobs[0].url}0` }] },
    { coverage: [{ ...reports.coverage[0], artifactUrl: 'https://example.com/archive' }] },
    { coverage: [...reports.coverage, ...reports.coverage] },
  ]) {
    evidence.reports = { ...reports, ...override }
    assert.throws(() => normalizeDevQualityGateSummary(payload), /quality /u)
  }
  evidence.reports = { ...reports, status: 'unavailable', tests: null, testsUrl: null, coverage: [] }
  assert.equal(normalizeDevQualityGateSummary(payload).serverEvidence.reports.status, 'unavailable')
})

test('server Job timestamp contract accepts missing records and rejects reversed intervals', () => {
  const payload = summary()
  const job = payload.serverEvidence.jobs[0]
  job.startedAt = '2026-08-09T07:59:58.000Z'
  job.finishedAt = NOW
  assert.equal(normalizeDevQualityGateSummary(payload).serverEvidence.jobs[0].startedAt, job.startedAt)
  job.finishedAt = '2026-08-09T07:59:57.000Z'
  assert.throws(() => normalizeDevQualityGateSummary(payload), /quality server evidence job is invalid/u)
  job.finishedAt = null
  assert.equal(normalizeDevQualityGateSummary(payload).serverEvidence.jobs[0].finishedAt, null)
  job.startedAt = 'invalid'
  assert.throws(() => normalizeDevQualityGateSummary(payload), /quality server evidence job is invalid/u)
})

test('quality reads and session acquisition have bounded deadlines, and a stalled session cannot launch a run', async () => {
  const calls = []
  const client = createDevQualityGateClient({ timeoutMs: 5, fetchImpl: (url, options) => {
    calls.push({ url, method: options.method })
    return new Promise(() => {})
  } })
  for (const read of [() => client.summary(), () => client.governance(), () => client.gaps(),
    () => client.start('strict', createQualityGateIdempotencyKey('strict'))]) {
    await assert.rejects(read(), { name: 'TimeoutError' })
  }
  assert.equal(calls.length, 4)
  assert(calls.every(({ method }) => method === 'GET'))
})
