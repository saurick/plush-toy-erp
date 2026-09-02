const NOW = '2026-08-09T08:00:00.000Z'
const OPERATION_ID = '11111111-1111-4111-8111-111111111111'
const HISTORY_OPERATION_IDS = Object.freeze([
  OPERATION_ID,
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
])

const repository = Object.freeze({
  commit: '0d3f91e24d82133ba8ff1893ad6333fd7d6d1c54',
  dirty: true,
  fingerprint: 'b'.repeat(64),
})
const SERVER_JOB_TIMINGS = Object.freeze([
  ['plan', 6_000, 900, 'orchestration', 'pipeline', 1],
  ['prepare', 18_000, 1_200, 'orchestration', 'pipeline', 1],
  ['quality_static', 31_000, 1_400, 'execution', 'static', 1],
  ['quality_node_release_preflight', 129_000, 2_100, 'execution', 'node', 1],
  ['quality_node_release_a', 107_000, 1_900, 'execution', 'node', 1],
  ['quality_node_release_b', 85_000, 1_700, 'execution', 'node', 1],
  ['quality_node_core', 102_000, 1_600, 'execution', 'node', 2],
  ['quality_resource_contract', 48_000, 1_300, 'execution', 'resource', 1],
  ['quality_resource_runtime', 76_000, 1_500, 'execution', 'resource', 1],
  ['quality_web_checks', 64_000, 1_400, 'execution', 'web', 1],
  ['quality_web_build', 71_000, 1_500, 'execution', 'web', 1],
  ['quality_server_schema', 38_000, 1_300, 'execution', 'server', 1],
  ['quality_server_upgrade', 82_000, 1_800, 'execution', 'server', 1],
  ['quality_server_test_build', 96_000, 2_000, 'execution', 'server', 1],
  ['quality_server_critical_postgres', 70_000, 1_800, 'execution', 'server', 1],
  [
    'quality_browser_boundary_entry_print',
    81_000,
    2_400,
    'execution',
    'browser',
    1,
  ],
  ['quality_node', 28_000, 900, 'aggregate', 'node', 1],
  ['quality_resource', 8_000, 700, 'aggregate', 'resource', 1],
  ['quality_web', 7_000, 700, 'aggregate', 'web', 1],
  ['quality_server', 5_000, 600, 'aggregate', 'server', 1],
  ['quality_browser', 6_000, 600, 'aggregate', 'browser', 1],
  ['quality_security', 38_000, 1_300, 'execution', 'security', 1],
  ['quality_aggregate', 9_000, 500, 'aggregate', 'pipeline', 1],
  ['CI Gate', 2_000, 300, 'terminal', 'pipeline', 1],
])
const SERVER_CI_AGGREGATE_NEEDS = Object.freeze({
  quality_node: [
    'plan',
    'prepare',
    'quality_node_release_preflight',
    'quality_node_release_a',
    'quality_node_release_b',
    'quality_node_core',
  ],
  quality_resource: [
    'plan',
    'prepare',
    'quality_resource_contract',
    'quality_resource_runtime',
  ],
  quality_web: ['plan', 'prepare', 'quality_web_checks', 'quality_web_build'],
  quality_server: [
    'plan',
    'prepare',
    'quality_server_schema',
    'quality_server_upgrade',
    'quality_server_test_build',
    'quality_server_critical_postgres',
  ],
  quality_browser: ['plan', 'prepare', 'quality_browser_boundary_entry_print'],
})

function serverCiTopologyJob(name) {
  if (name === 'plan') return { name, stage: 'plan', needs: [] }
  if (name === 'prepare') {
    return { name, stage: 'prepare', needs: ['plan'] }
  }
  if (name === 'quality_aggregate') {
    return {
      name,
      stage: 'aggregate',
      needs: [
        'plan',
        'prepare',
        'quality_static',
        'quality_node',
        'quality_web',
        'quality_server',
        'quality_resource',
        'quality_browser',
        'quality_security',
      ],
    }
  }
  if (name === 'CI Gate') {
    return { name, stage: 'gate', needs: ['quality_aggregate'] }
  }
  if (Object.hasOwn(SERVER_CI_AGGREGATE_NEEDS, name)) {
    return {
      name,
      stage: 'quality',
      needs: SERVER_CI_AGGREGATE_NEEDS[name],
    }
  }
  if (name === 'quality_browser_boundary_entry_print') {
    return {
      name,
      stage: 'quality',
      needs: ['plan', 'prepare', 'quality_web_build'],
    }
  }
  return { name, stage: 'quality', needs: ['plan', 'prepare'] }
}

const SERVER_CI_TOPOLOGY = Object.freeze(
  SERVER_JOB_TIMINGS.map(([name]) => Object.freeze(serverCiTopologyJob(name)))
)

function serverHistoryJobs(pipelineId, durationOffset = 0, failureJob = '') {
  return SERVER_JOB_TIMINGS.map(
    ([name, durationMs, queueMs, role, group, attemptCount], index) => ({
      id: pipelineId * 100 + index,
      name,
      status: 'completed',
      conclusion: name === failureJob ? 'failure' : 'success',
      durationMs: Math.max(1_000, durationMs + durationOffset),
      queueMs,
      attemptCount,
      role,
      group,
      url: `https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/${String(
        pipelineId * 100 + index
      )}`,
    })
  )
}
const SERVER_CI_HISTORY = Object.freeze([
  Object.freeze({
    id: 41,
    result: 'passed',
    gitSha: repository.commit,
    url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/41',
    createdAt: '2026-08-09T07:53:15.000Z',
    finishedAt: NOW,
    durationMs: 405_000,
    queueMs: 12_000,
    failureJob: '',
    jobs: serverHistoryJobs(41),
  }),
  Object.freeze({
    id: 40,
    result: 'failed',
    gitSha: '1'.repeat(40),
    url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/40',
    createdAt: '2026-08-09T06:48:00.000Z',
    finishedAt: '2026-08-09T06:55:00.000Z',
    durationMs: 420_000,
    queueMs: 18_000,
    failureJob: 'quality_web',
    jobs: serverHistoryJobs(40, 8_000, 'quality_web'),
  }),
  Object.freeze({
    id: 39,
    result: 'running',
    gitSha: '2'.repeat(40),
    url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/39',
    createdAt: '2026-08-09T05:50:00.000Z',
    finishedAt: null,
    durationMs: null,
    queueMs: 35_000,
    failureJob: '',
    jobs: serverHistoryJobs(39, -5_000),
  }),
])
const historicalRepository = Object.freeze({
  commit: 'f'.repeat(40),
  dirty: false,
  fingerprint: 'a'.repeat(64),
})

function passedStage(id, label, startedAt, finishedAt, durationMs) {
  return Object.freeze({
    id,
    label,
    status: 'passed',
    startedAt,
    finishedAt,
    durationMs,
  })
}

const PRE_WEB_STAGE_TIMINGS = Object.freeze([
  passedStage(
    'strict_profile',
    '严格门禁配置',
    '2026-08-09T07:55:00.000Z',
    '2026-08-09T07:55:10.000Z',
    10_000
  ),
  passedStage(
    'shellcheck',
    'Shell 静态检查',
    '2026-08-09T07:55:10.000Z',
    '2026-08-09T07:55:15.000Z',
    5_000
  ),
  passedStage(
    'shfmt',
    'Shell 格式检查',
    '2026-08-09T07:55:15.000Z',
    '2026-08-09T07:55:20.000Z',
    5_000
  ),
  passedStage(
    'yamllint',
    'YAML 静态检查',
    '2026-08-09T07:55:20.000Z',
    '2026-08-09T07:55:25.000Z',
    5_000
  ),
  passedStage(
    'environment_profile',
    '环境与工具链准备',
    '2026-08-09T07:55:25.000Z',
    '2026-08-09T07:55:45.000Z',
    20_000
  ),
  passedStage(
    'shared',
    '共享基础检查',
    '2026-08-09T07:55:45.000Z',
    '2026-08-09T07:55:55.000Z',
    10_000
  ),
  passedStage(
    'secrets',
    '敏感信息扫描',
    '2026-08-09T07:55:55.000Z',
    '2026-08-09T07:56:00.000Z',
    5_000
  ),
])
const PASSED_WEB_STAGE_TIMING = passedStage(
  'web',
  'Web 测试与生产构建',
  '2026-08-09T07:56:00.000Z',
  '2026-08-09T07:58:00.000Z',
  120_000
)
const POST_WEB_STAGE_TIMINGS = Object.freeze([
  passedStage(
    'server',
    '隔离数据库、迁移与 Server 测试',
    '2026-08-09T07:58:00.000Z',
    '2026-08-09T07:59:00.000Z',
    60_000
  ),
  passedStage(
    'resource_sensitive_node',
    '资源敏感发布合同',
    '2026-08-09T07:59:00.000Z',
    '2026-08-09T07:59:15.000Z',
    15_000
  ),
  passedStage(
    'critical_postgres',
    '关键 PostgreSQL 合同',
    '2026-08-09T07:59:15.000Z',
    '2026-08-09T07:59:35.000Z',
    20_000
  ),
  passedStage(
    'browser',
    '浏览器回归',
    '2026-08-09T07:59:35.000Z',
    '2026-08-09T07:59:50.000Z',
    15_000
  ),
  passedStage(
    'govulncheck',
    'Go 可达漏洞检查',
    '2026-08-09T07:59:50.000Z',
    NOW,
    10_000
  ),
])

function qualityOperation(
  status = 'running',
  operationRepository = repository
) {
  const terminal = ['failed', 'passed', 'cancelled', 'timed_out'].includes(
    status
  )
  const stageTimings =
    status === 'passed'
      ? [
          ...PRE_WEB_STAGE_TIMINGS,
          PASSED_WEB_STAGE_TIMING,
          ...POST_WEB_STAGE_TIMINGS,
        ]
      : [
          ...PRE_WEB_STAGE_TIMINGS,
          {
            id: 'web',
            label: 'Web 测试与生产构建',
            status: status === 'failed' ? 'failed' : 'running',
            startedAt: '2026-08-09T07:56:00.000Z',
            finishedAt: status === 'running' ? null : NOW,
            durationMs: status === 'running' ? null : 240_000,
          },
        ]
  const receiptStatus = ['failed', 'passed'].includes(status) ? status : null
  return {
    schemaVersion: 'plush.dev-quality-gate-operation-public/v1',
    id: OPERATION_ID,
    profile: 'strict',
    repository: operationRepository,
    status,
    stage: status === 'passed' ? 'govulncheck' : 'web',
    stageTimings,
    receipt: receiptStatus
      ? {
          profile: 'strict',
          status: receiptStatus,
          gitCommit: operationRepository.commit,
          treeState: operationRepository.dirty ? 'dirty' : 'clean',
          durationMs: 300_000,
          finishedAt: NOW,
          executed: status === 'passed' ? 13 : 8,
          passed: status === 'passed' ? 13 : 7,
          failed: status === 'failed' ? 1 : 0,
          skipped: 0,
          environmentFingerprint: 'e'.repeat(64),
          bottleneckStageId: 'web',
          stageTimings,
        }
      : null,
    cleanup: terminal
      ? { status: 'complete', message: '进程组和运行锁已完成清理读回' }
      : { status: 'pending', message: '等待运行结束后清理' },
    firstFailure: status === 'failed' ? 'Web 测试与生产构建未通过' : '',
    cancelRequestedAt: null,
    revision: 3,
    createdAt: '2026-08-09T07:55:00.000Z',
    updatedAt: NOW,
    finishedAt: terminal ? NOW : null,
    message:
      status === 'failed'
        ? 'Web 测试与生产构建未通过，请修复后重新运行'
        : status === 'running'
          ? '正在运行 Web 测试与生产构建'
          : '质量门禁已通过',
  }
}

function historicalQualityOperation(id, durationMs, createdAt, finishedAt) {
  const operation = qualityOperation('passed', historicalRepository)
  return {
    ...operation,
    id,
    createdAt,
    updatedAt: finishedAt,
    finishedAt,
    receipt: {
      ...operation.receipt,
      durationMs,
      finishedAt,
    },
  }
}

function createServerEvidence(status = 'passed') {
  if (status === 'unavailable') {
    return {
      schemaVersion: 'plush.dev-quality-gate-server-evidence/v4',
      status: 'unavailable',
      current: false,
      coversWorkingTree: false,
      gitSha: '',
      pipeline: null,
      jobs: [],
      topology: {
        status: 'unavailable',
        gitSha: '',
        jobs: [],
        message: '当前 exact SHA 的 GitLab CI 依赖暂不可读。',
      },
      history: [],
      message: '未登记只读 GitLab 凭据，当前仅显示本机回执。',
      notProven: ['当前 exact SHA 的 R640 普通 CI'],
    }
  }
  if (status === 'missing') {
    return {
      schemaVersion: 'plush.dev-quality-gate-server-evidence/v4',
      status: 'missing',
      current: false,
      coversWorkingTree: false,
      gitSha: repository.commit,
      pipeline: null,
      jobs: [],
      topology: {
        status: 'missing',
        gitSha: repository.commit,
        jobs: [],
        message: '当前提交尚未形成实际 Pipeline Job。',
      },
      history: SERVER_CI_HISTORY.slice(1),
      message:
        'GitLab 凭据与 API 读取正常；R640 尚无绑定当前已提交 SHA 的普通 push CI 记录。',
      notProven: ['当前 exact SHA 的 R640 普通 CI'],
    }
  }
  return {
    schemaVersion: 'plush.dev-quality-gate-server-evidence/v4',
    status: 'passed',
    current: true,
    coversWorkingTree: false,
    gitSha: repository.commit,
    pipeline: {
      id: 41,
      attempt: 41,
      url: 'https://gitlab.saurick.me/saurick/plush-toy-erp/-/pipelines/41',
      status: 'completed',
      conclusion: 'success',
      queueMs: 12_000,
      durationMs: 405_000,
      finishedAt: NOW,
    },
    jobs: SERVER_JOB_TIMINGS.map(
      ([name, durationMs, queueMs, role, group, attemptCount], index) => ({
        id: 4_100 + index,
        name,
        status: 'completed',
        conclusion: 'success',
        durationMs,
        queueMs,
        attemptCount,
        role,
        group,
        url: `https://gitlab.saurick.me/saurick/plush-toy-erp/-/jobs/${String(
          4_100 + index
        )}`,
      })
    ),
    topology: {
      status: 'available',
      gitSha: repository.commit,
      jobs: SERVER_CI_TOPOLOGY,
      message:
        '依赖来自当前 exact SHA 的 GitLab CI Lint，状态来自本次实际 Pipeline。',
    },
    history: SERVER_CI_HISTORY,
    message: 'R640 已证明当前提交 SHA；该证据不覆盖本机未提交改动。',
    notProven: ['本机未提交改动', '不可变 Release', '目标部署', '客户 UAT'],
  }
}

export function createQualityGateStyleSummary(
  mode = 'idle',
  { serverStatus = 'passed' } = {}
) {
  const historicalOperations = [
    historicalQualityOperation(
      HISTORY_OPERATION_IDS[0],
      300_000,
      '2026-08-09T07:55:00.000Z',
      NOW
    ),
    historicalQualityOperation(
      HISTORY_OPERATION_IDS[1],
      345_000,
      '2026-08-09T06:54:15.000Z',
      '2026-08-09T07:00:00.000Z'
    ),
    historicalQualityOperation(
      HISTORY_OPERATION_IDS[2],
      270_000,
      '2026-08-09T05:55:30.000Z',
      '2026-08-09T06:00:00.000Z'
    ),
  ]
  const operations =
    mode === 'idle'
      ? []
      : mode === 'history'
        ? historicalOperations
        : [qualityOperation(mode)]
  const operation = operations[0] || null
  const active = mode === 'running'
  return {
    schemaVersion: 'plush.dev-quality-gates-summary/v1',
    generatedAt: NOW,
    repository,
    environment: {
      disposableDatabaseReady: true,
      message: '一次性数据库环境已就绪',
    },
    busy: active
      ? { active: true, kind: 'quality', profile: 'strict' }
      : { active: false, kind: '', profile: '' },
    profiles: {
      full: {
        timeoutMs: 5_400_000,
        stages: [
          {
            id: 'environment_profile',
            label: '环境与工具链准备',
            parallel: false,
          },
          { id: 'shared', label: '共享基础检查', parallel: true },
          { id: 'secrets', label: '敏感信息扫描', parallel: false },
          { id: 'web', label: 'Web 测试与生产构建', parallel: true },
          {
            id: 'server',
            label: '隔离数据库、迁移与 Server 测试',
            parallel: true,
          },
          {
            id: 'resource_sensitive_node',
            label: '资源敏感发布合同',
            parallel: false,
          },
          {
            id: 'critical_postgres',
            label: '关键 PostgreSQL 合同',
            parallel: false,
          },
          { id: 'browser', label: '浏览器回归', parallel: false },
          { id: 'govulncheck', label: 'Go 可达漏洞检查', parallel: false },
        ],
        substeps: {
          shared: [
            { id: 'repository_guards', label: '仓库与生成物守卫' },
            { id: 'node_tests', label: 'Scripts Node 合同测试' },
            { id: 'script_boundaries', label: '脚本与私有化边界' },
            { id: 'customer_config', label: '客户配置合同' },
          ],
          web: [
            { id: 'eslint', label: 'JavaScript 静态检查' },
            { id: 'stylelint', label: '样式静态检查' },
            { id: 'web_test', label: 'Web 自动化测试' },
            { id: 'production_build', label: 'Web 生产构建' },
            { id: 'production_boundary', label: 'DEV 与生产隔离检查' },
          ],
        },
      },
      strict: {
        timeoutMs: 10_800_000,
        stages: [
          { id: 'strict_profile', label: '严格门禁配置', parallel: false },
          { id: 'shellcheck', label: 'Shell 静态检查', parallel: false },
          { id: 'shfmt', label: 'Shell 格式检查', parallel: false },
          { id: 'yamllint', label: 'YAML 静态检查', parallel: false },
          {
            id: 'environment_profile',
            label: '环境与工具链准备',
            parallel: false,
          },
          { id: 'shared', label: '共享基础检查', parallel: true },
          { id: 'secrets', label: '敏感信息扫描', parallel: false },
          { id: 'web', label: 'Web 测试与生产构建', parallel: true },
          {
            id: 'server',
            label: '隔离数据库、迁移与 Server 测试',
            parallel: true,
          },
          {
            id: 'resource_sensitive_node',
            label: '资源敏感发布合同',
            parallel: false,
          },
          {
            id: 'critical_postgres',
            label: '关键 PostgreSQL 合同',
            parallel: false,
          },
          { id: 'browser', label: '浏览器回归', parallel: false },
          { id: 'govulncheck', label: 'Go 可达漏洞检查', parallel: false },
        ],
        substeps: {
          shared: [
            { id: 'repository_guards', label: '仓库与生成物守卫' },
            { id: 'node_tests', label: 'Scripts Node 合同测试' },
            { id: 'script_boundaries', label: '脚本与私有化边界' },
            { id: 'customer_config', label: '客户配置合同' },
          ],
          web: [
            { id: 'eslint', label: 'JavaScript 静态检查' },
            { id: 'stylelint', label: '样式静态检查' },
            { id: 'web_test', label: 'Web 自动化测试' },
            { id: 'production_build', label: 'Web 生产构建' },
            { id: 'production_boundary', label: 'DEV 与生产隔离检查' },
          ],
        },
      },
    },
    currentOperation: active ? operation : null,
    operations,
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
    serverEvidence: createServerEvidence(serverStatus),
    status: {
      tone: active ? 'info' : mode === 'failed' ? 'warning' : 'warning',
      title: active
        ? '严格门禁正在运行'
        : mode === 'failed'
          ? '最近严格门禁未通过'
          : '工作区还有未提交改动',
      description: active
        ? '正在运行 Web 测试与生产构建'
        : mode === 'failed'
          ? '请先修复第一失败阶段，再重新运行。'
          : '可以验证当前改动，但结果不能作为固定版本发布证明。',
      recommendation: active
        ? '等待当前运行结束；如确需停止，请使用取消运行。'
        : '运行本机严格诊断，先确认当前改动没有质量阻断。',
      releaseEligible: false,
      notProven: ['干净 exact SHA', '目标环境发布', '客户 UAT'],
    },
  }
}

function governance() {
  const statistics = {
    sampleCount: 2,
    medianDurationMs: 704_000,
    slowerDurationMs: 760_000,
    enoughSamples: false,
    environmentFingerprint: 'e'.repeat(64),
    treeState: 'dirty',
  }
  return {
    schemaVersion: 'plush.quality-gate-governance/v1',
    catalogSchemaVersion: 'plush.quality-gate-catalog/v1',
    filter: 'relevant',
    q: '',
    changedCount: 18,
    rows: [
      {
        key: 'strict',
        label: '严格门禁',
        prevents: '发版前工具链、Shell、YAML 和完整质量证据缺失',
        trigger: '准备发版或需要严格发布候选证据时',
        riskLevel: 'high',
        profiles: ['strict'],
        sources: ['scripts/qa/strict.sh', '.github/workflows/release.yml'],
        evidence: 'dev-workbench-receipt/v1',
        blocks: '当前版本进入版本发布',
        relationship: '在 full 主路径前增加严格静态检查',
        exitCondition: '不能因耗时或近期无失败删除',
        highConsequence: true,
        current: false,
        recentResult: 'missing',
        statistics,
        advice: '有独立高风险价值，建议保留',
      },
      {
        key: 'browser-experience',
        label: '页面与真实浏览器',
        prevents: '路由、交互、暗色、移动端和真实渲染回归',
        trigger: '用户可见页面或样式变化时',
        riskLevel: 'high',
        profiles: ['full', 'strict'],
        sources: ['web/scripts/styleL1.mjs'],
        evidence: 'browser stage and scenario evidence',
        blocks: '用户可见页面交付',
        relationship: '静态测试不能替代真实浏览器',
        exitCondition: '只有等价真实浏览器证据稳定接入后才能替代',
        highConsequence: false,
        current: false,
        recentResult: 'missing',
        statistics,
        advice: '暂无足够样本',
      },
    ],
    complexity: [
      {
        key: 'strict-sample-shortage',
        gateKeys: ['strict'],
        signal: '暂无足够样本',
        detail: '严格门禁的同环境、同工作区状态样本少于 3 次，暂不判断趋势。',
        recommendation: '需要人工确认，不能自动删除',
        severity: 'info',
      },
      {
        key: 'strict-full-layering',
        gateKeys: ['full', 'strict'],
        signal: '共享同一 full 主路径',
        detail: 'strict 复用 full，不复制第二份测试列表。',
        recommendation: '有独立高风险价值，建议保留',
        severity: 'success',
      },
    ],
  }
}

function gaps() {
  return {
    schemaVersion: 'plush.quality-gate-gap-analysis/v2',
    range: 'current',
    risk: 'all',
    changedCount: 18,
    affectedScopes: ['T0', 'T1', 'T5'],
    maxAffectedScope: 'T5',
    localGate: 'full',
    matched: true,
    categories: [
      {
        key: 'frontend',
        label: '前端页面',
        risk: '静态检查通过仍可能遗漏真实交互、错误态和移动端布局问题。',
        highRisk: false,
        gates: ['browser-experience', 'full'],
        evidence: [
          '页面合同测试',
          '错误边界',
          '真实浏览器',
          '浅色与深色',
          '移动端、长文本和失败态',
        ],
        matchedCount: 12,
        gateResults: [
          {
            gateKey: 'browser-experience',
            label: '页面与真实浏览器',
            status: 'missing',
          },
          { gateKey: 'full', label: '完整门禁', status: 'missing' },
        ],
        status: 'missing',
        missing: ['browser-experience', 'full'],
      },
      {
        key: 'test-data',
        label: '测试数据',
        risk: '一次性数据库清理不完整会留下错误现场。',
        highRisk: true,
        gates: ['test-data-isolation', 'full'],
        evidence: [
          '固定 profile',
          '一次性数据库',
          'run identity 与 TTL',
          '成功和失败清理',
          'cleanup readback',
        ],
        matchedCount: 3,
        gateResults: [
          {
            gateKey: 'test-data-isolation',
            label: '测试数据隔离',
            status: 'missing',
          },
          { gateKey: 'full', label: '完整门禁', status: 'missing' },
        ],
        status: 'missing',
        missing: ['test-data-isolation', 'full'],
      },
    ],
    boundaries: [
      '本地门禁结果不证明目标环境发布',
      '部署 smoke 与回滚证据需要固定目标读回',
      '自动化通过不替代客户 UAT 与签收',
    ],
  }
}

async function installQualityRoutes(page, mode, counters, options = {}) {
  await page.route('**/__dev/api/qa/quality-gates**', async (route) => {
    const url = new URL(route.request().url())
    let payload
    if (url.pathname.endsWith('/governance')) {
      counters.governance += 1
      payload = governance()
    } else if (url.pathname.endsWith('/gaps')) {
      counters.gaps += 1
      payload = gaps()
    } else {
      counters.summary += 1
      payload = createQualityGateStyleSummary(mode, options)
      if (options.summaryDelayMs) {
        await new Promise((resolve) =>
          setTimeout(resolve, options.summaryDelayMs)
        )
      }
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    })
  })
}

export function createDevQualityGateScenarios({
  assert,
  assertNoHorizontalOverflow,
  expectHeading,
}) {
  return [
    {
      name: 'dev-quality-gates-desktop-light',
      path: '/__dev/quality-gates?view=server',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await installQualityRoutes(page, 'idle', {
          summary: 0,
          governance: 0,
          gaps: 0,
        })
      },
      verify: async (page) => {
        await expectHeading(page, '质量门禁')
        await page.getByText('R640 普通 CI 已通过', { exact: true }).waitFor()

        const serverPanel = page.getByRole('region', {
          name: 'R640 服务器质量证据',
        })
        await serverPanel.waitFor()
        await serverPanel
          .getByText(
            '全部 Job 的状态、运行与等待直接来自当前 GitLab 流水线。',
            {
              exact: true,
            }
          )
          .waitFor()
        await serverPanel
          .getByText(
            '工作台不复制 CI DAG；依赖不可读时失败关闭，不画推测连线。',
            { exact: true }
          )
          .waitFor()
        assert.equal(
          await serverPanel
            .getByRole('table', {
              name: '本机阶段与 R640 CI Job 对照',
            })
            .count(),
          0
        )
        const pipelineDag = serverPanel.locator(
          '.erp-dev-quality-server-pipeline__dag .erp-markdown-mermaid'
        )
        await pipelineDag
          .locator('.erp-markdown-mermaid__canvas > svg')
          .waitFor()
        assert.equal(
          await pipelineDag.getAttribute('data-mermaid-status'),
          'rendered'
        )
        assert.equal(
          await pipelineDag.getAttribute('data-mermaid-html-labels'),
          'false'
        )
        assert.deepEqual(
          await serverPanel
            .locator('.erp-dev-quality-server-pipeline__relationship .ant-tag')
            .allTextContents(),
          ['22 个 Job', '59 条依赖']
        )

        const pipelineNodes = serverPanel.locator(
          '.erp-dev-quality-server-pipeline__node'
        )
        await pipelineNodes.first().waitFor()
        assert.deepEqual(
          (await pipelineNodes.locator('code').allTextContents()).sort(),
          SERVER_JOB_TIMINGS.map(([jobName]) => jobName).sort()
        )
        assert.deepEqual(
          await serverPanel
            .locator('.erp-dev-quality-server-pipeline__phase-heading')
            .locator('strong')
            .allTextContents(),
          [
            '准备',
            '静态检查',
            'Node 合同',
            '资源敏感',
            'Web',
            'Server / PostgreSQL',
            '浏览器',
            '安全',
            '聚合与终态',
          ]
        )
        const viewSwitch = serverPanel.locator('[aria-label="服务器门禁详情"]')
        await viewSwitch.getByText('Job 性能', { exact: true }).click()
        await page.waitForFunction(
          () =>
            new URL(window.location.href).searchParams.get('serverView') ===
            'performance'
        )
        const performance = serverPanel.getByRole('region', {
          name: '历史 Job 性能',
        })
        await performance.waitFor()
        await performance.getByText('超过 120 秒', { exact: true }).waitFor()
        await performance
          .getByText('超过 90 秒', { exact: true })
          .first()
          .waitFor()
        const remainingPerformance = performance.locator(
          '.erp-dev-quality-server-performance__remaining'
        )
        await remainingPerformance.locator('summary').click()
        await remainingPerformance
          .getByText('quality_node', { exact: true })
          .waitFor()
        await remainingPerformance.locator('summary').click()

        await viewSwitch.getByText('CI 历史', { exact: true }).click()
        await page.waitForFunction(
          () =>
            new URL(window.location.href).searchParams.get('serverView') ===
            'history'
        )
        await page.reload()
        await expectHeading(page, '质量门禁')
        await serverPanel.locator('[data-server-view="history"]').waitFor()
        const firstHistoryDetails = serverPanel
          .locator('.erp-dev-quality-server-history__jobs')
          .first()
        await firstHistoryDetails.locator('summary').click()
        await firstHistoryDetails
          .getByText('quality_node_release_preflight', { exact: true })
          .waitFor()
        await firstHistoryDetails.locator('summary').click()

        await viewSwitch.getByText('本次流水线', { exact: true }).click()
        await page.waitForFunction(
          () =>
            new URL(window.location.href).searchParams.get('serverView') ===
            'pipeline'
        )
        await serverPanel.locator('[data-server-view="pipeline"]').waitFor()
        const pipelineGeometry = await serverPanel
          .locator('.erp-dev-quality-server-pipeline__track')
          .evaluate((track) => {
            const phase = track.querySelector(
              '.erp-dev-quality-server-pipeline__phase'
            )
            const nodes = phase?.querySelector(
              '.erp-dev-quality-server-pipeline__nodes'
            )
            const nodeRects = Array.from(
              nodes?.querySelectorAll(
                '.erp-dev-quality-server-pipeline__node'
              ) || []
            ).map((node) => node.getBoundingClientRect())
            const trackRect = track.getBoundingClientRect()
            const phaseRect = phase?.getBoundingClientRect()
            const nodesRect = nodes?.getBoundingClientRect()
            return {
              trackWidth: trackRect.width,
              phaseWidth: phaseRect?.width || 0,
              nodesClientWidth: nodes?.clientWidth || 0,
              nodesScrollWidth: nodes?.scrollWidth || 0,
              columnCount: new Set(nodeRects.map((rect) => Math.round(rect.x)))
                .size,
              maxNodeRight: nodeRects.reduce(
                (right, rect) => Math.max(right, rect.right),
                0
              ),
              nodesRight: nodesRect?.right || 0,
            }
          })
        assert(
          pipelineGeometry.phaseWidth >= pipelineGeometry.trackWidth - 1,
          JSON.stringify(pipelineGeometry)
        )
        assert(
          pipelineGeometry.columnCount > 1,
          JSON.stringify(pipelineGeometry)
        )
        assert(
          pipelineGeometry.nodesScrollWidth <=
            pipelineGeometry.nodesClientWidth + 1,
          JSON.stringify(pipelineGeometry)
        )
        assert(
          pipelineGeometry.maxNodeRight <= pipelineGeometry.nodesRight + 1,
          JSON.stringify(pipelineGeometry)
        )
        await assertNoHorizontalOverflow(
          page,
          'dev-quality-gates-desktop-light'
        )
      },
    },
  ]
}
