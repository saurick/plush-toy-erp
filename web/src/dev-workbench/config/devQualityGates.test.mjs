import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  DEFAULT_SERVER_VIEW,
  DEFAULT_VIEW,
  DEV_QUALITY_GATE_ACTION_API_PATH,
  DEV_QUALITY_GATE_API_PATH,
  DEV_QUALITY_GATE_SESSION_API_PATH,
  DEV_QUALITY_GATES_ROUTE,
  DEV_QUALITY_GATE_SERVER_VIEWS,
  QUERY_KEYS,
  VIEW_ITEMS,
  VIEW_KEYS,
  VIEW_QUERY_KEYS,
  buildQualityGateCoverageMatrix,
  buildQualityGateHistoryTrend,
  buildQualityGateServerPerformance,
  buildQualityGateServerDag,
  buildQualityGateServerTiming,
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
    serverEvidence: {
      schemaVersion: 'plush.dev-quality-gate-server-evidence/v5',
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
          role: 'terminal',
          group: 'pipeline',
          url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/390',
        },
      ],
      jobGuides: [
        {
          name: 'CI Gate',
          label: 'CI 最终门禁',
          summary: '核对最终证据并固定到当前 Pipeline。',
          checks: ['最终证据完整性'],
          outcome: '形成 exact-SHA CI Gate 证据。',
          registered: true,
        },
      ],
      topology: {
        status: 'available',
        gitSha: 'a'.repeat(40),
        jobs: [{ name: 'CI Gate', stage: 'gate', needs: [] }],
        message: '依赖来自当前 exact SHA 的 GitLab CI Lint。',
      },
      history: [
        {
          id: 39,
          result: 'passed',
          gitSha: 'a'.repeat(40),
          url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/39',
          createdAt: '2026-08-09T07:50:00.000Z',
          finishedAt: NOW,
          durationMs: 395_000,
          queueMs: 3_500,
          failureJob: '',
          jobs: [
            {
              id: 390,
              name: 'CI Gate',
              status: 'completed',
              conclusion: 'success',
              durationMs: 2_000,
              queueMs: 500,
              attemptCount: 1,
              role: 'terminal',
              group: 'pipeline',
              url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/390',
            },
          ],
        },
        {
          id: 38,
          result: 'failed',
          gitSha: 'c'.repeat(40),
          url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/38',
          createdAt: '2026-08-09T06:50:00.000Z',
          finishedAt: '2026-08-09T06:56:00.000Z',
          durationMs: 360_000,
          queueMs: 6_000,
          failureJob: 'quality_web',
          jobs: [
            {
              id: 380,
              name: 'quality_web',
              status: 'completed',
              conclusion: 'failure',
              durationMs: 120_000,
              queueMs: 2_000,
              attemptCount: 1,
              role: 'aggregate',
              group: 'web',
              url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/380',
            },
          ],
        },
      ],
      message: 'R640 已通过当前 exact SHA 的完整分片、聚合与 CI Gate。',
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

test('quality gates config: route, four views and per-view query contracts stay stable', () => {
  assert.equal(DEV_QUALITY_GATES_ROUTE, '/__dev/quality-gates')
  assert.equal(DEFAULT_VIEW, 'server')
  assert.equal(DEFAULT_SERVER_VIEW, 'pipeline')
  assert.deepEqual(DEV_QUALITY_GATE_SERVER_VIEWS, [
    'pipeline',
    'performance',
    'history',
  ])
  assert.deepEqual(VIEW_KEYS, ['server', 'run', 'governance', 'gaps'])
  assert.deepEqual(
    VIEW_ITEMS.map((item) => item.label),
    ['服务器门禁', '本机诊断', '门禁治理', '覆盖缺口']
  )
  assert.deepEqual(QUERY_KEYS, {
    view: 'view',
    serverView: 'serverView',
    profile: 'profile',
    operation: 'operation',
    q: 'q',
    filter: 'filter',
    range: 'range',
    risk: 'risk',
  })
  assert.deepEqual(VIEW_QUERY_KEYS, {
    server: ['view', 'serverView'],
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
    values: { view: 'server', serverView: 'pipeline' },
  })
  assert.equal(
    buildQualityGateViewSearch('server', {
      profile: 'strict',
      q: 'must not leak',
    }),
    '?view=server'
  )
  assert.equal(
    buildQualityGateViewSearch('server', { serverView: 'performance' }),
    '?view=server&serverView=performance'
  )
  assert.equal(
    parseQualityGateSearch('?view=server&serverView=history').values.serverView,
    'history'
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
  assert.equal(normalized.serverEvidence.topology.status, 'available')
  assert.equal(normalized.serverEvidence.history.length, 2)
  assert.equal(normalized.serverEvidence.history[1].failureJob, 'quality_web')
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
            topology: {
              ...summary().serverEvidence.topology,
              jobs: [{ name: 'CI Gate', stage: 'gate', needs: ['unknown'] }],
            },
          },
        })
      ),
    /topology graph is invalid/u
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

test('quality gates config: R640 DAG is derived from exact needs and actual Job states', () => {
  const dag = buildQualityGateServerDag({
    status: 'running',
    topology: {
      status: 'available',
      gitSha: 'a'.repeat(40),
      message: '同 SHA 依赖已读取。',
      jobs: [
        { name: 'plan', stage: 'plan', needs: [] },
        { name: 'prepare', stage: 'prepare', needs: ['plan'] },
        {
          name: 'quality_node_core',
          stage: 'quality',
          needs: ['prepare'],
        },
        {
          name: 'quality_aggregate',
          stage: 'aggregate',
          needs: ['quality_node_core'],
        },
        { name: 'CI Gate', stage: 'gate', needs: ['quality_aggregate'] },
      ],
    },
    jobs: [
      {
        name: 'plan',
        status: 'completed',
        conclusion: 'success',
        durationMs: 1_000,
      },
      {
        name: 'prepare',
        status: 'completed',
        conclusion: 'success',
        durationMs: 2_000,
      },
      {
        name: 'quality_node_core',
        status: 'in_progress',
        conclusion: '',
        durationMs: 28_000,
      },
      {
        name: 'quality_aggregate',
        status: 'queued',
        conclusion: '',
        durationMs: null,
      },
      {
        name: 'CI Gate',
        status: 'queued',
        conclusion: '',
        durationMs: null,
      },
    ],
  })

  assert.equal(dag.status, 'available')
  assert.equal(dag.nodeCount, 5)
  assert.equal(dag.edgeCount, 4)
  assert.match(dag.chart, /^flowchart LR/mu)
  assert.match(dag.chart, /J0 --> J1/u)
  assert.match(dag.chart, /J3 --> J4/u)
  assert.match(dag.chart, /quality_node_core · 运行中 · 28 秒/u)
  assert.deepEqual(
    buildQualityGateServerDag({
      topology: {
        status: 'unavailable',
        gitSha: 'a'.repeat(40),
        jobs: [],
        message: '依赖暂不可读。',
      },
    }),
    {
      status: 'unavailable',
      chart: '',
      nodeCount: 0,
      edgeCount: 0,
      message: '依赖暂不可读。',
    }
  )
})

test('quality gates config: R640 timing ranks bottlenecks without summing parallel jobs', () => {
  const timing = buildQualityGateServerTiming({
    status: 'running',
    pipeline: { durationMs: 120_000, queueMs: 5_000 },
    jobs: [
      {
        id: 1,
        name: 'quality_web_build',
        status: 'completed',
        conclusion: 'success',
        durationMs: 60_000,
        queueMs: 1_000,
        role: 'execution',
        group: 'web',
      },
      {
        id: 2,
        name: 'quality_server_test_build',
        status: 'completed',
        conclusion: 'success',
        durationMs: 90_000,
        queueMs: 2_000,
        role: 'execution',
        group: 'server',
      },
      {
        id: 3,
        name: 'CI Gate',
        status: 'queued',
        conclusion: '',
        durationMs: null,
        queueMs: 3_000,
        role: 'terminal',
        group: 'pipeline',
      },
    ],
  })

  assert.equal(timing.wallClockMs, 120_000)
  assert.equal(timing.queueMs, 5_000)
  assert.equal(timing.longestJob.name, 'quality_server_test_build')
  assert.equal(timing.longestExecutionJob.name, 'quality_server_test_build')
  assert.equal(timing.flowJobs.length, 3)
  assert.equal(
    timing.flowJobs.find((job) => job.name === 'quality_server_test_build')
      .status,
    'passed'
  )
  assert.equal(
    timing.flowJobs.find((job) => job.name === 'CI Gate').status,
    'pending'
  )
  assert.deepEqual(
    timing.jobs.map(({ name, relativePercent }) => ({
      name,
      relativePercent,
    })),
    [
      { name: 'quality_server_test_build', relativePercent: 100 },
      { name: 'quality_web_build', relativePercent: 66.7 },
      { name: 'CI Gate', relativePercent: null },
    ]
  )
  assert.deepEqual(
    timing.flowGroups.map(({ key, jobs }) => [
      key,
      jobs.map((job) => job.name),
    ]),
    [
      ['web', ['quality_web_build']],
      ['server', ['quality_server_test_build']],
      ['closeout', ['CI Gate']],
    ]
  )
  assert.equal('totalDurationMs' in timing, false)
})

test('quality gates config: R640 history separates execution limits from fan-in and queue delay', () => {
  function historyJob(
    pipelineId,
    index,
    {
      name,
      role,
      group,
      durationMs,
      queueMs,
      conclusion = 'success',
      attemptCount = 1,
    }
  ) {
    return {
      id: pipelineId * 100 + index,
      name,
      role,
      group,
      status: 'completed',
      conclusion,
      durationMs,
      queueMs,
      attemptCount,
      url: `https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/${String(
        pipelineId * 100 + index
      )}`,
    }
  }

  const runs = [
    {
      id: 44,
      url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/44',
      executionMs: 125_000,
      aggregateMs: 35_000,
      prepareQueueMs: 40_000,
      attemptCount: 2,
    },
    {
      id: 43,
      url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/43',
      executionMs: 88_000,
      aggregateMs: 22_000,
      prepareQueueMs: 4_000,
      attemptCount: 1,
    },
    {
      id: 42,
      url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/42',
      executionMs: 92_000,
      aggregateMs: 20_000,
      prepareQueueMs: 3_000,
      attemptCount: 1,
    },
    {
      id: 41,
      url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/41',
      executionMs: 95_000,
      aggregateMs: 18_000,
      prepareQueueMs: 2_000,
      attemptCount: 1,
      failed: true,
    },
  ].map((run) => ({
    id: run.id,
    url: run.url,
    jobs: [
      historyJob(run.id, 1, {
        name: 'quality_node_release_preflight',
        role: 'execution',
        group: 'node',
        durationMs: run.executionMs,
        queueMs: 5_000,
        conclusion: run.failed ? 'failure' : 'success',
        attemptCount: run.attemptCount,
      }),
      historyJob(run.id, 2, {
        name: 'quality_node',
        role: 'aggregate',
        group: 'node',
        durationMs: run.aggregateMs,
        queueMs: 1_000,
      }),
      historyJob(run.id, 3, {
        name: 'prepare',
        role: 'orchestration',
        group: 'pipeline',
        durationMs: 10_000,
        queueMs: run.prepareQueueMs,
      }),
      historyJob(run.id, 4, {
        name: 'quality_web_checks',
        role: 'execution',
        group: 'web',
        durationMs: 20_000,
        queueMs: 1_000,
        attemptCount: run.id === 44 ? 2 : 1,
      }),
    ],
  }))

  const performance = buildQualityGateServerPerformance({ history: runs })
  const execution = performance.rows.find(
    (row) => row.name === 'quality_node_release_preflight'
  )
  const aggregate = performance.rows.find((row) => row.name === 'quality_node')
  const prepare = performance.rows.find((row) => row.name === 'prepare')
  const retried = performance.rows.find(
    (row) => row.name === 'quality_web_checks'
  )

  assert.equal(performance.historyCount, 4)
  assert.equal(performance.executionCount, 2)
  assert.equal(performance.criticalCount, 1)
  assert.equal(performance.unstableCount, 2)
  assert.equal(execution.attention, 'critical')
  assert.equal(execution.sampleCount, 3)
  assert.equal(execution.medianDurationMs, 92_000)
  assert.equal(execution.p95DurationMs, 125_000)
  assert.equal(execution.medianQueueMs, 5_000)
  assert.equal(execution.p95QueueMs, 5_000)
  assert.equal(execution.retryCount, 1)
  assert.equal(execution.failureCount, 1)
  assert.match(execution.latestJobUrl, /\/jobs\/4401$/u)
  assert.equal(aggregate.attention, 'aggregate_slow')
  assert.equal(prepare.attention, 'queued')
  assert.equal(retried.attention, 'unstable')
})

test('quality gates config: R640 timing does not invent jobs without evidence', () => {
  const timing = buildQualityGateServerTiming({
    status: 'unavailable',
    pipeline: null,
    jobs: [],
  })

  assert.deepEqual(timing.flowJobs, [])
  assert.equal(timing.jobs.length, 0)
  assert.equal(timing.longestJob, null)
})

test('quality gates config: R640 missing evidence is distinct from unreadable evidence', () => {
  const timing = buildQualityGateServerTiming({
    status: 'missing',
    pipeline: null,
    jobs: [],
  })

  assert.deepEqual(timing.flowJobs, [])
})

test('quality gates config: R640 queued and in-progress jobs keep distinct states', () => {
  const timing = buildQualityGateServerTiming({
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
  assert.equal((pageSource.match(/<MermaidDiagram/gu) || []).length, 2)
  assert.match(pageSource, /静态工作原理，不代表当前运行状态/u)
  assert.match(pageSource, /buildQualityGateStageDurationComposition/u)
  assert.match(pageSource, /buildQualityGateHistoryTrend/u)
  assert.match(pageSource, /buildQualityGateCoverageMatrix/u)
  assert.match(pageSource, /当前正式回执/u)
  assert.match(pageSource, /R640 服务器门禁/u)
  assert.match(pageSource, /正式主路径/u)
  assert.match(
    pageSource,
    /全部 Job 的状态、运行与等待直接来自当前 GitLab 流水线/u
  )
  assert.match(pageSource, /工作台不复制 CI DAG/u)
  assert.match(pageSource, /aria-label="服务器门禁详情"/u)
  assert.match(pageSource, /<Drawer/u)
  assert.match(pageSource, />\s*Job 说明\s*</u)
  assert.match(pageSource, /aria-label=\{`查看 \$\{job\.name\} 说明`\}/u)
  assert.match(pageSource, /先看阶段，再按需查看单个 Job/u)
  assert.match(pageSource, /核对子 Job 回执并形成领域结论/u)
  assert.match(pageSource, /data-server-view="performance"/u)
  assert.match(pageSource, /data-server-view="history"/u)
  assert.doesNotMatch(pageSource, /serverJobLocalStageLabels/u)
  assert.doesNotMatch(pageSource, /本机阶段与 R640 CI Job 对照/u)
  assert.doesNotMatch(pageSource, /CI：\{ciJob\.label\}/u)
  assert.equal((pageSource.match(/label: '本次流水线'/gu) || []).length, 1)
  assert.equal((pageSource.match(/label: 'Job 性能'/gu) || []).length, 1)
  assert.equal((pageSource.match(/label: 'CI 历史'/gu) || []).length, 1)
  assert.match(pageSource, /pending: '等待运行'/u)
  assert.match(pageSource, /missing: '未产生 CI 记录'/u)
  assert.match(pageSource, /unavailable: '读取失败'/u)
  assert.match(pageSource, /连接正常 · 当前提交无 CI/u)
  assert.match(pageSource, /GitLab 读取正常/u)
  assert.match(pageSource, /R640 正在读取服务器证据/u)
  assert.match(pageSource, /最近 CI/u)
  assert.match(pageSource, /历史结果不代表当前提交已通过/u)
  assert.match(pageSource, /最近普通 push CI 历史/u)
  assert.match(pageSource, /serverHistoryFailureLabel/u)
  assert.doesNotMatch(pageSource, /missing: '暂无当前 CI'/u)
  assert.doesNotMatch(pageSource, /unavailable: '待读取'/u)
  assert.match(pageSource, /本机诊断（按需）/u)
  assert.match(pageSource, /本机最近诊断/u)
  assert.doesNotMatch(pageSource, /严格门禁：发版前验证/u)
  assert.match(pageSource, /\? '预计剩余'[\s\S]*?: '运行状态'/u)
  assert.doesNotMatch(pageSource, /Fixed quality evidence/u)
  assert.match(taskNavSource, /aria-controls/u)
  assert.match(taskNavSource, /-panel-/u)
})
