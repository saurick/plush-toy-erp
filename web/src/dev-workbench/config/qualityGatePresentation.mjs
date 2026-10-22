import { DEV_DOCS_ROUTE } from './devDocs.mjs'
import {
  DEV_QUALITY_GATE_ACTIVE_STATUSES,
  formatQualityGateDuration,
  getQualityGateFlowSegments,
  getQualityGateStageLabel,
} from './devQualityGates.mjs'

export const SOURCE_PATH = 'scripts/qa/README.md'

export const SECURITY_GUIDE_HREF = `${DEV_DOCS_ROUTE}?path=${encodeURIComponent('docs/security/应用安全与验证边界.md')}`

export const PROFILE_LABELS = Object.freeze({
  full: '本机完整诊断',
  strict: '本机严格诊断',
})

export const STAGE_STATUS = Object.freeze({
  pending: Object.freeze({ label: '等待运行', color: 'default' }),
  running: Object.freeze({ label: '正在运行', color: 'processing' }),
  passed: Object.freeze({ label: '已通过', color: 'success' }),
  failed: Object.freeze({ label: '未通过', color: 'error' }),
  not_run: Object.freeze({ label: '未执行', color: 'default' }),
})

export const GOVERNANCE_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ label: '与当前改动有关', value: 'relevant' }),
  Object.freeze({ label: '需要关注', value: 'attention' }),
  Object.freeze({ label: '全部门禁', value: 'all' }),
])

export const GAP_RANGE_OPTIONS = Object.freeze([
  Object.freeze({ label: '当前改动', value: 'current' }),
  Object.freeze({ label: '已暂存改动', value: 'staged' }),
])

export const GAP_RISK_OPTIONS = Object.freeze([
  Object.freeze({ label: '全部风险', value: 'all' }),
  Object.freeze({ label: '只看高风险', value: 'high' }),
])

export const COVERAGE_STATUS = Object.freeze({
  current: Object.freeze({ label: '✓ 当前有效', tone: 'success' }),
  stale: Object.freeze({ label: '△ 旧结果', tone: 'warning' }),
  missing: Object.freeze({ label: '— 未运行', tone: 'missing' }),
  not_applicable: Object.freeze({ label: '· 不适用', tone: 'neutral' }),
})

export const MANAGED_DATABASE_STEPS = Object.freeze([
  '优先核对是否已登记可用的本机隔离数据库环境。',
  '未登记时，为本次 operation 创建专用 PostgreSQL 运行环境。',
  '在选定环境中运行同一套正式 full 或 strict runner。',
  '无论通过、失败或取消，都精确清理本次进程与数据库资源。',
  '只有正式回执和清理读回都能证明时，operation 才能报告终态。',
])

export const MANAGED_DATABASE_FLOW = String.raw`flowchart LR
  START["发起 full 或 strict"] --> READY{"已有登记的本机隔离环境？"}
  READY -->|"有"| REGISTERED["使用已登记环境"]
  READY -->|"没有"| MANAGED["创建本次专用 PostgreSQL"]
  REGISTERED --> RUNNER["运行同一正式门禁"]
  MANAGED --> RUNNER
  RUNNER --> CLEANUP["精确清理本次资源并读回"]
  CLEANUP --> PROVEN{"回执与清理都可证明？"}
  PROVEN -->|"是"| TERMINAL["报告正式终态"]
  PROVEN -->|"否"| CLOSED["失败关闭，不报告通过"]`

export function shortCommit(commit) {
  return typeof commit === 'string' && commit.length >= 12
    ? commit.slice(0, 12)
    : '尚未证明'
}

export function operationDuration(operation, nowMs = Date.now()) {
  if (!operation) return null
  if (operation.receipt?.durationMs !== undefined) {
    return operation.receipt.durationMs
  }
  const startedAt = Date.parse(operation.createdAt)
  const finishedAt = operation.finishedAt
    ? Date.parse(operation.finishedAt)
    : nowMs
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt)) return null
  return Math.max(0, finishedAt - startedAt)
}

function upsertOperation(operations, operation) {
  if (!operation) return Array.isArray(operations) ? operations : []
  return [
    operation,
    ...(Array.isArray(operations) ? operations : []).filter(
      (item) => item.id !== operation.id
    ),
  ]
}

export function mergeOperationIntoSummary(summary, operation) {
  if (!summary || !operation) return summary
  const active = DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
  return {
    ...summary,
    currentOperation: active ? operation : null,
    operations: upsertOperation(summary.operations, operation),
    busy: active
      ? { active: true, kind: 'quality', profile: operation.profile }
      : summary.busy,
  }
}

export function profileDuration(summary, profile) {
  return summary?.proofs?.[profile]?.receipt?.durationMs ?? null
}

function comparableDurations(summary, profile) {
  const operations = Array.isArray(summary?.operations)
    ? summary.operations
    : []
  const candidates = operations.filter(
    (operation) =>
      operation.profile === profile &&
      operation.status === 'passed' &&
      operation.repository?.dirty === summary?.repository?.dirty &&
      operation.receipt?.status === 'passed' &&
      Number.isFinite(operation.receipt.durationMs)
  )
  const environmentFingerprint =
    candidates[0]?.receipt?.environmentFingerprint || ''
  return candidates
    .filter(
      (operation) =>
        operation.receipt.environmentFingerprint === environmentFingerprint
    )
    .map((operation) => operation.receipt.durationMs)
    .sort((left, right) => left - right)
}

export function estimatedRemaining(summary, operation) {
  if (!operation) return '尚未运行'
  if (!DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)) {
    return operation.status === 'passed' ? '已完成' : '已结束'
  }
  const durations = comparableDurations(summary, operation.profile)
  if (durations.length < 3) return '暂无法估计'
  const median = durations[Math.floor((durations.length - 1) / 2)]
  return formatQualityGateDuration(
    Math.max(0, median - operationDuration(operation))
  )
}

export function deriveStages(summary, operation) {
  if (!operation) return []
  const definition = summary?.profiles?.[operation.profile]
  const expected = definition?.stages || []
  const substeps = definition?.substeps || {}
  const actual = new Map(
    (operation.stageTimings || []).map((stage) => [stage.id, stage])
  )
  const stages = expected.map((stage) => ({
    ...stage,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    ...actual.get(stage.id),
    label: getQualityGateStageLabel(stage, expected),
    substeps: substeps[stage.id] || [],
  }))
  for (const stage of operation.stageTimings || []) {
    if (!stages.some((item) => item.id === stage.id)) {
      stages.push({
        ...stage,
        label: getQualityGateStageLabel(stage, expected),
        parallel: false,
        substeps: [],
      })
    }
  }
  return stages
}

export function stageProgress(stages) {
  if (stages.length === 0) return 0
  const completed = stages.reduce((total, stage) => {
    if (['passed', 'failed'].includes(stage.status)) return total + 1
    if (stage.status === 'running') return total + 0.5
    return total
  }, 0)
  return Math.round((completed / stages.length) * 100)
}

export function previewStages(summary, profile) {
  const definition = summary?.profiles?.[profile]
  const expected = definition?.stages || []
  const substeps = definition?.substeps || {}
  return expected.map((stage) => ({
    ...stage,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    label: getQualityGateStageLabel(stage, expected),
    substeps: substeps[stage.id] || [],
  }))
}

export function flowStageStatus(stage, operation) {
  if (stage.status !== 'pending' || !operation) return stage.status
  return DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
    ? 'pending'
    : 'not_run'
}

export function flowGroups(summary, profile, stages) {
  const definitions = getQualityGateFlowSegments(summary?.profiles, profile)
  const actual = new Map(stages.map((stage) => [stage.id, stage]))
  const knownIds = new Set()
  const groups = definitions
    .map((segment) => {
      const segmentStages = segment.stages
        .map((stage) => {
          knownIds.add(stage.id)
          return actual.get(stage.id)
        })
        .filter(Boolean)
      return { ...segment, stages: segmentStages }
    })
    .filter((segment) => segment.stages.length > 0)
  const unregistered = stages.filter((stage) => !knownIds.has(stage.id))
  if (unregistered.length > 0) {
    groups.push({
      id: 'unregistered-runtime',
      label: '未登记运行阶段',
      scopeLabel: '需要核对',
      stages: unregistered,
    })
  }
  return groups
}

export function terminalEvidence(operation) {
  const active = Boolean(
    operation && DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
  )
  const receipt = !operation
    ? { status: 'pending', label: '运行后生成' }
    : operation.receipt?.status === 'passed'
      ? { status: 'passed', label: '已取得通过回执' }
      : operation.receipt?.status === 'failed'
        ? { status: 'failed', label: '已取得失败回执' }
        : active
          ? { status: 'pending', label: '等待门禁终态' }
          : { status: 'not_run', label: '未取得正式回执' }
  const cleanup = !operation
    ? { status: 'pending', label: '运行后读回' }
    : operation.cleanup?.status === 'complete'
      ? { status: 'passed', label: '已完成清理读回' }
      : operation.cleanup?.status === 'not_required'
        ? { status: 'passed', label: '无需页面管理的清理' }
        : operation.cleanup?.status === 'failed'
          ? { status: 'failed', label: '清理读回未通过' }
          : active
            ? { status: 'pending', label: '等待运行结束' }
            : { status: 'not_run', label: '清理状态尚未证明' }
  return { receipt, cleanup }
}

export function longestStageId(stages) {
  return stages.reduce(
    (longest, stage) =>
      (stage.durationMs || 0) > (longest?.durationMs || 0) ? stage : longest,
    null
  )?.id
}

export function currentStageLabel(stages, operation) {
  if (operation?.status === 'passed') return '全部完成'
  if (
    operation &&
    !DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
  ) {
    return stages.find((stage) => stage.status === 'failed')?.label || '已结束'
  }
  return (
    stages.find((stage) => stage.status === 'running')?.label ||
    stages.find((stage) => stage.status === 'failed')?.label ||
    stages.filter((stage) => stage.status !== 'pending').at(-1)?.label ||
    '正在准备'
  )
}

export function operationUpdateAction(operation) {
  return operation?.finishedAt ? '完成于' : '更新于'
}

export const SERVER_EVIDENCE_STATUS = Object.freeze({
  docs_passed: Object.freeze({
    label: '文档检查已通过',
    color: 'blue',
    alert: 'info',
  }),
  loading: Object.freeze({
    label: '正在读取',
    color: 'processing',
    alert: 'info',
  }),
  passed: Object.freeze({
    label: '普通 CI 已通过',
    color: 'success',
    alert: 'success',
  }),
  running: Object.freeze({
    label: '普通 CI 运行中',
    color: 'processing',
    alert: 'info',
  }),
  failed: Object.freeze({
    label: '普通 CI 未通过',
    color: 'error',
    alert: 'error',
  }),
  missing: Object.freeze({
    label: '连接正常 · 当前提交无 CI',
    color: 'warning',
    alert: 'info',
  }),
  unavailable: Object.freeze({
    label: '读取失败',
    color: 'error',
    alert: 'warning',
  }),
  pageUnavailable: Object.freeze({
    label: '页面状态读取失败',
    color: 'error',
    alert: 'error',
  }),
})

export const SERVER_JOB_STATUS = Object.freeze({
  success: '通过',
  failure: '失败',
  cancelled: '取消',
  skipped: '跳过',
})

export const SERVER_PIPELINE_JOB_STATUS = Object.freeze({
  passed: '已通过',
  failed: '未通过',
  running: '运行中',
  pending: '等待运行',
  cancelled: '已取消',
  skipped: '已跳过',
  not_run: '未形成记录',
  missing: '未产生 CI 记录',
  unavailable: '读取失败',
})

export const SERVER_PIPELINE_JOB_LEGEND = Object.freeze([
  'passed',
  'running',
  'pending',
  'failed',
  'cancelled',
  'skipped',
  'not_run',
  'missing',
  'unavailable',
])

export const SERVER_HISTORY_STATUS = Object.freeze({
  docs_passed: Object.freeze({ label: '文档已通过', color: 'blue' }),
  queued: Object.freeze({ label: '等待运行', color: 'processing' }),
  running: Object.freeze({ label: '运行中', color: 'processing' }),
  passed: Object.freeze({ label: '已通过', color: 'success' }),
  failed: Object.freeze({ label: '未通过', color: 'error' }),
  cancelled: Object.freeze({ label: '已取消', color: 'default' }),
  skipped: Object.freeze({ label: '已跳过', color: 'default' }),
})

export const SERVER_JOB_ROLE = Object.freeze({
  orchestration: Object.freeze({ label: '准备', color: 'default' }),
  execution: Object.freeze({ label: '执行', color: 'blue' }),
  aggregate: Object.freeze({ label: '汇总', color: 'purple' }),
  terminal: Object.freeze({ label: '终态', color: 'success' }),
})

export const SERVER_JOB_GROUP = Object.freeze({
  preparation: '准备',
  static: '静态检查',
  node: 'Node 合同',
  resource: '资源敏感',
  web: 'Web',
  server: 'Server / PostgreSQL',
  browser: '浏览器',
  security: '安全',
  other: '其他执行',
  closeout: '聚合与终态',
})

export const SERVER_JOB_ROLE_HELP = Object.freeze({
  orchestration: '确定范围或准备环境，本身不代表测试覆盖耗时。',
  execution: '实际运行检查、测试或构建，是性能优化的主要对象。',
  aggregate: '核对子 Job 回执并形成领域结论，不代表前序测试只耗时这么久。',
  terminal: '核对最终证据并决定整条 CI 是否可信通过。',
})

export const SERVER_JOB_GROUP_HELP = Object.freeze({
  preparation: '先确定本次验证范围并准备统一运行环境。',
  static: '尽早检查脚本和配置中的静态问题。',
  node: '验证 Node 工具、发布合同以及共享检查。',
  resource: '验证会占用进程、端口或临时数据库的敏感场景及清理。',
  web: '分别完成前端代码检查与生产构建。',
  server: '验证 Schema、存量升级、Go 测试构建和关键 PostgreSQL 合同。',
  browser: '复用同一提交的前端构建，验证浏览器主路径。',
  security: '检查 Go 依赖中的可达漏洞。',
  other: '当前流水线已运行，但尚未归入既有业务阶段。',
  closeout: '只核对前序回执并形成聚合或最终结论。',
})

export const SERVER_JOB_ATTENTION = Object.freeze({
  critical: Object.freeze({ label: '超过 120 秒', color: 'error' }),
  review: Object.freeze({ label: '超过 90 秒', color: 'warning' }),
  regressed: Object.freeze({ label: '较中位数变慢', color: 'warning' }),
  queued: Object.freeze({ label: '等待偏长', color: 'processing' }),
  aggregate_slow: Object.freeze({ label: '汇总偏慢', color: 'warning' }),
  unstable: Object.freeze({ label: '有失败或重试', color: 'warning' }),
  healthy: Object.freeze({ label: '正常', color: 'success' }),
})

export const SERVER_VIEW_OPTIONS = Object.freeze([
  Object.freeze({ label: '本次流水线', value: 'pipeline' }),
  Object.freeze({ label: 'Job 性能', value: 'performance' }),
  Object.freeze({ label: 'CI 历史', value: 'history' }),
])

export const SERVER_VIEW_HELP = Object.freeze({
  pipeline: '核对本次提交的真实 needs、并行关系、Job 状态与耗时。',
  performance: '比较近 20 次同名 Job 的中位数、P95、等待与重试。',
  history: '按流水线回看近 20 次 push 与手动完整 CI 的结果与失败环节。',
})

export function qualityGateViewStatus(summary, view, summaryError) {
  if (view !== 'server') return summary?.status
  const evidence = summary?.serverEvidence
  if (!evidence) {
    return summaryError
      ? {
          tone: 'error',
          title: 'GitLab CI 页面状态读取失败',
          description: summaryError,
          recommendation: '确认本机开发服务可用后刷新状态。',
          notProven: [],
        }
      : {
          tone: 'info',
          title: 'GitLab CI 正在读取服务器证据',
          description: '正在读取当前提交的 GitLab CI 证据。',
          recommendation: '',
          notProven: [],
        }
  }
  const status =
    SERVER_EVIDENCE_STATUS[evidence.status] ||
    SERVER_EVIDENCE_STATUS.unavailable
  return {
    tone: status.alert,
    title: `GitLab ${status.label}`,
    description: evidence?.message || '正在读取当前提交的服务器门禁证据。',
    recommendation:
      evidence?.status === 'passed'
        ? '未提交改动请使用“本机诊断”。'
        : evidence?.status === 'docs_passed'
          ? '发布前在 GitLab 新建 main 流水线，设置 QA_MODE=full。'
          : evidence?.status === 'running'
            ? '等待当前流水线结束。'
            : evidence?.status === 'missing'
              ? '读取链路正常；等待该提交触发 CI。'
              : evidence?.status === 'failed'
                ? '查看未通过的 Job，修复后重新验证。'
                : '先恢复 GitLab 读取链路，再刷新状态。',
    notProven: evidence?.notProven || [],
  }
}

export function serverHistoryFailureLabel(jobName) {
  return jobName || '—'
}

export function serverHistoryJobStatusLabel(job) {
  if (SERVER_JOB_STATUS[job.conclusion]) {
    return SERVER_JOB_STATUS[job.conclusion]
  }
  if (job.status === 'in_progress') return '运行中'
  if (['queued', 'waiting', 'requested', 'pending'].includes(job.status)) {
    return '等待运行'
  }
  if (job.status === 'completed') return '已结束'
  return '状态未证明'
}

export function serverJobFlowGroup(job) {
  if (job?.role === 'orchestration') return 'preparation'
  if (job?.group === 'pipeline') return 'closeout'
  return job?.group || 'other'
}
