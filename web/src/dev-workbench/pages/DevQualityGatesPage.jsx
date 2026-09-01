import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  QuestionCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Descriptions,
  Empty,
  List,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import { MermaidDiagram } from '@/common/components/markdown'
import { message, modal } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import {
  DEFAULT_VIEW,
  DEV_QUALITY_GATE_ACTIVE_STATUSES,
  DEV_QUALITY_GATE_GOVERNANCE_FILTERS,
  DEV_QUALITY_GATE_GAP_RANGES,
  DEV_QUALITY_GATE_GAP_RISKS,
  DEV_QUALITY_GATE_PROFILES,
  VIEW_ITEMS,
  buildQualityGateCoverageMatrix,
  buildQualityGateHistoryTrend,
  buildQualityGateServerTiming,
  buildQualityGateStageDurationComposition,
  buildQualityGateViewSearch,
  createDevQualityGateClient,
  createQualityGateIdempotencyKey,
  formatQualityGateDuration,
  getQualityGateFlowSegments,
  getQualityGateStageLabel,
  getQualityGateStatusMeta,
  parseQualityGateSearch,
  selectDisplayedQualityGateOperation,
} from '../config/devQualityGates.mjs'

const { Link, Paragraph, Text, Title } = Typography
const POLL_INTERVAL_MS = 1500
const SOURCE_PATH = 'scripts/qa/README.md'
const EMPTY_VIEW_STATE = Object.freeze({
  server: Object.freeze({}),
  run: Object.freeze({ profile: '', operation: '' }),
  governance: Object.freeze({ q: '', filter: 'relevant' }),
  gaps: Object.freeze({ range: 'current', risk: 'all' }),
})
const EMPTY_ASYNC_VIEW_STATE = Object.freeze({
  data: null,
  loading: false,
  error: '',
})
const PROFILE_LABELS = Object.freeze({
  full: '本机完整诊断',
  strict: '本机严格诊断',
})
const STAGE_STATUS = Object.freeze({
  pending: Object.freeze({ label: '等待运行', color: 'default' }),
  running: Object.freeze({ label: '正在运行', color: 'processing' }),
  passed: Object.freeze({ label: '已通过', color: 'success' }),
  failed: Object.freeze({ label: '未通过', color: 'error' }),
  not_run: Object.freeze({ label: '未执行', color: 'default' }),
})
const GOVERNANCE_FILTER_OPTIONS = Object.freeze([
  Object.freeze({ label: '与当前改动有关', value: 'relevant' }),
  Object.freeze({ label: '需要关注', value: 'attention' }),
  Object.freeze({ label: '全部门禁', value: 'all' }),
])
const GAP_RANGE_OPTIONS = Object.freeze([
  Object.freeze({ label: '当前改动', value: 'current' }),
  Object.freeze({ label: '已暂存改动', value: 'staged' }),
])
const GAP_RISK_OPTIONS = Object.freeze([
  Object.freeze({ label: '全部风险', value: 'all' }),
  Object.freeze({ label: '只看高风险', value: 'high' }),
])
const COVERAGE_STATUS = Object.freeze({
  current: Object.freeze({ label: '✓ 当前有效', tone: 'success' }),
  stale: Object.freeze({ label: '△ 旧结果', tone: 'warning' }),
  missing: Object.freeze({ label: '— 未运行', tone: 'missing' }),
  not_applicable: Object.freeze({ label: '· 不适用', tone: 'neutral' }),
})
const MANAGED_DATABASE_STEPS = Object.freeze([
  '优先核对是否已登记可用的本机隔离数据库环境。',
  '未登记时，为本次 operation 创建专用 PostgreSQL 运行环境。',
  '在选定环境中运行同一套正式 full 或 strict runner。',
  '无论通过、失败或取消，都精确清理本次进程与数据库资源。',
  '只有正式回执和清理读回都能证明时，operation 才能报告终态。',
])
const MANAGED_DATABASE_FLOW = String.raw`flowchart LR
  START["发起 full 或 strict"] --> READY{"已有登记的本机隔离环境？"}
  READY -->|"有"| REGISTERED["使用已登记环境"]
  READY -->|"没有"| MANAGED["创建本次专用 PostgreSQL"]
  REGISTERED --> RUNNER["运行同一正式门禁"]
  MANAGED --> RUNNER
  RUNNER --> CLEANUP["精确清理本次资源并读回"]
  CLEANUP --> PROVEN{"回执与清理都可证明？"}
  PROVEN -->|"是"| TERMINAL["报告正式终态"]
  PROVEN -->|"否"| CLOSED["失败关闭，不报告通过"]`

function shortCommit(commit) {
  return typeof commit === 'string' && commit.length >= 12
    ? commit.slice(0, 12)
    : '尚未证明'
}

function operationDuration(operation, nowMs = Date.now()) {
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

function mergeOperationIntoSummary(summary, operation) {
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

function profileDuration(summary, profile) {
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

function estimatedRemaining(summary, operation) {
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

function deriveStages(summary, operation) {
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

function stageProgress(stages) {
  if (stages.length === 0) return 0
  const completed = stages.reduce((total, stage) => {
    if (['passed', 'failed'].includes(stage.status)) return total + 1
    if (stage.status === 'running') return total + 0.5
    return total
  }, 0)
  return Math.round((completed / stages.length) * 100)
}

function previewStages(summary, profile) {
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

function flowStageStatus(stage, operation) {
  if (stage.status !== 'pending' || !operation) return stage.status
  return DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
    ? 'pending'
    : 'not_run'
}

function flowGroups(summary, profile, stages) {
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

function terminalEvidence(operation) {
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

function renderGovernanceEvidence(row) {
  return (
    <Descriptions
      size="small"
      column={1}
      bordered
      items={[
        {
          key: 'key',
          label: 'Stable key',
          children: <Text code>{row.key}</Text>,
        },
        { key: 'risk', label: '风险等级', children: row.riskLevel },
        {
          key: 'profiles',
          label: '适用 profile',
          children: row.profiles.join(' / '),
        },
        {
          key: 'sources',
          label: '正式执行入口引用',
          children: row.sources.join('；'),
        },
        { key: 'evidence', label: '唯一验证记录', children: row.evidence },
        { key: 'blocks', label: '失败阻断', children: row.blocks },
        {
          key: 'median',
          label: '中位数',
          children: formatQualityGateDuration(row.statistics?.medianDurationMs),
        },
        {
          key: 'slower',
          label: '较慢运行参考',
          children: row.statistics?.enoughSamples
            ? formatQualityGateDuration(row.statistics.slowerDurationMs)
            : '暂无足够样本',
        },
        {
          key: 'relationship',
          label: '与其他门禁关系',
          children: row.relationship,
        },
        {
          key: 'exit-condition',
          label: '替代或退出条件',
          children: row.exitCondition,
        },
      ]}
    />
  )
}

function longestStageId(stages) {
  return stages.reduce(
    (longest, stage) =>
      (stage.durationMs || 0) > (longest?.durationMs || 0) ? stage : longest,
    null
  )?.id
}

function currentStageLabel(stages, operation) {
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

function OperationStatusTag({ operation }) {
  const meta = getQualityGateStatusMeta(operation?.status || 'missing')
  return <Tag color={meta.tone}>{meta.label}</Tag>
}

function operationUpdateAction(operation) {
  return operation?.finishedAt ? '完成于' : '更新于'
}

function ContextStrip({ summary, view, summaryError, onReturnLocal }) {
  const serverEvidence = summary?.serverEvidence
  const serverStatus = serverEvidence
    ? SERVER_EVIDENCE_STATUS[serverEvidence.status] ||
      SERVER_EVIDENCE_STATUS.unavailable
    : summaryError
      ? SERVER_EVIDENCE_STATUS.pageUnavailable
      : SERVER_EVIDENCE_STATUS.loading
  const serverLabel = serverEvidence?.pipeline?.id
    ? `${serverStatus.label} · #${serverEvidence.pipeline.id}`
    : serverStatus.label
  const strictProof = summary?.proofs?.strict
  const strictStatus =
    summary?.currentOperation?.profile === 'strict'
      ? `${getQualityGateStatusMeta(summary.currentOperation.status).label} ${formatQualityGateDuration(operationDuration(summary.currentOperation))}`
      : strictProof?.current
        ? `当前版本${getQualityGateStatusMeta(strictProof.status).label}`
        : strictProof?.receipt
          ? `旧版本${getQualityGateStatusMeta(strictProof.status).label}`
          : '尚未运行'
  const viewLabel = VIEW_ITEMS.find((item) => item.value === view)?.label

  return (
    <section
      className="erp-dev-quality-context"
      aria-label="当前质量门禁上下文"
    >
      <dl>
        <div>
          <dt>当前视图</dt>
          <dd>{viewLabel}</dd>
        </div>
        <div>
          <dt>当前版本</dt>
          <dd>{shortCommit(summary?.repository?.commit)}</dd>
        </div>
        <div>
          <dt>工作区</dt>
          <dd>{summary?.repository?.dirty ? '有未提交改动' : '干净'}</dd>
        </div>
        <div>
          <dt>R640 CI</dt>
          <dd>{serverLabel}</dd>
        </div>
        <div>
          <dt>本机诊断</dt>
          <dd>{strictStatus || '尚未运行'}</dd>
        </div>
        <div>
          <dt>统计读取于</dt>
          <dd>
            <DevTimestamp
              value={summary?.generatedAt}
              missing="统计时间未证明"
            />
          </dd>
        </div>
      </dl>
      {view !== 'run' && summary?.currentOperation?.profile === 'strict' ? (
        <Button type="link" onClick={onReturnLocal}>
          查看本机运行
        </Button>
      ) : null}
    </section>
  )
}

const SERVER_EVIDENCE_STATUS = Object.freeze({
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
    label: 'GitLab 读取失败',
    color: 'error',
    alert: 'warning',
  }),
  pageUnavailable: Object.freeze({
    label: '页面状态读取失败',
    color: 'error',
    alert: 'error',
  }),
})
const SERVER_JOB_STATUS = Object.freeze({
  success: '通过',
  failure: '失败',
  cancelled: '取消',
  skipped: '跳过',
})
const SERVER_PIPELINE_JOB_STATUS = Object.freeze({
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
const SERVER_PIPELINE_JOB_LEGEND = Object.freeze([
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
const SERVER_HISTORY_STATUS = Object.freeze({
  queued: Object.freeze({ label: '等待运行', color: 'processing' }),
  running: Object.freeze({ label: '运行中', color: 'processing' }),
  passed: Object.freeze({ label: '已通过', color: 'success' }),
  failed: Object.freeze({ label: '未通过', color: 'error' }),
  cancelled: Object.freeze({ label: '已取消', color: 'default' }),
  skipped: Object.freeze({ label: '已跳过', color: 'default' }),
})

function qualityGateViewStatus(summary, view, summaryError) {
  if (view !== 'server') return summary?.status
  const evidence = summary?.serverEvidence
  if (!evidence) {
    return summaryError
      ? {
          tone: 'error',
          title: 'R640 页面状态读取失败',
          description: summaryError,
          recommendation: '确认本机开发服务可用后刷新状态。',
          notProven: [],
        }
      : {
          tone: 'info',
          title: 'R640 正在读取服务器证据',
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
    title: `R640 ${status.label}`,
    description: evidence?.message || '正在读取当前提交的服务器门禁证据。',
    recommendation:
      evidence?.status === 'passed'
        ? '优先查看排队耗时与最长主路径 Job；未提交改动请切换到“本机诊断”定位。'
        : evidence?.status === 'running'
          ? '等待当前服务器流水线结束；页面不会用本机回执替代服务器结果。'
          : evidence?.status === 'missing'
            ? '读取链路无需修复；该提交产生普通 push CI 后，页面才会出现服务器运行结果。'
            : '先恢复 GitLab 读取链路，再核对当前 SHA 的服务器证据。',
    notProven: evidence?.notProven || [],
  }
}

function ServerJobTimingRows({ jobs }) {
  return (
    <ol className="erp-dev-quality-server-evidence__job-list">
      {jobs.map((job) => (
        <li key={job.id} className="erp-dev-quality-server-evidence__job-row">
          <Text
            className="erp-dev-quality-server-evidence__job-name"
            type={job.conclusion === 'failure' ? 'danger' : undefined}
          >
            {job.name} ·{' '}
            {SERVER_JOB_STATUS[job.conclusion] ||
              SERVER_PIPELINE_JOB_STATUS[job.flowStatus] ||
              '状态未证明'}
          </Text>
          <div
            className="erp-dev-quality-server-evidence__job-track"
            aria-hidden="true"
          >
            <span
              style={{
                '--quality-server-job-width': `${job.relativePercent || 0}%`,
              }}
            />
          </div>
          <Text type="secondary">
            {job.durationMs === null
              ? '尚未完成'
              : formatQualityGateDuration(job.durationMs)}
          </Text>
        </li>
      ))}
    </ol>
  )
}

function serverHistoryFailureLabel(jobName) {
  return jobName || '—'
}

function ServerCiHistory({ evidence, currentCommit }) {
  const history = Array.isArray(evidence?.history) ? evidence.history : []
  return (
    <section
      className="erp-dev-quality-server-history"
      aria-labelledby="r640-ci-history-title"
    >
      <div className="erp-dev-quality-server-history__heading">
        <div>
          <Title level={3} id="r640-ci-history-title">
            最近 CI
          </Title>
          <Text type="secondary">
            GitLab 最近读取到的普通 push CI；历史结果不代表当前提交已通过。
          </Text>
        </div>
        <Tag>{history.length} 条</Tag>
      </div>
      {history.length ? (
        <div className="erp-dev-quality-server-history__table-wrap">
          <table
            className="erp-dev-quality-server-history__table"
            aria-label="最近普通 push CI 历史"
          >
            <thead>
              <tr>
                <th scope="col">结果</th>
                <th scope="col">提交</th>
                <th scope="col">时间</th>
                <th scope="col">总耗时</th>
                <th scope="col">失败环节</th>
                <th scope="col">详情</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => {
                const presentation =
                  SERVER_HISTORY_STATUS[run.result] ||
                  SERVER_HISTORY_STATUS.failed
                const current = run.gitSha === currentCommit
                return (
                  <tr key={run.id} data-current={current ? 'true' : undefined}>
                    <td data-label="结果">
                      <Tag color={presentation.color}>{presentation.label}</Tag>
                    </td>
                    <td data-label="提交">
                      <Space size={6} wrap>
                        <Text code>{shortCommit(run.gitSha)}</Text>
                        {current ? <Tag color="blue">当前提交</Tag> : null}
                      </Space>
                    </td>
                    <td data-label="时间">
                      <DevTimestamp
                        value={run.finishedAt || run.createdAt}
                        action={run.finishedAt ? '完成于' : '创建于'}
                      />
                    </td>
                    <td data-label="总耗时">
                      <Text>{formatQualityGateDuration(run.durationMs)}</Text>
                    </td>
                    <td data-label="失败环节">
                      <Text type={run.failureJob ? 'danger' : 'secondary'}>
                        {serverHistoryFailureLabel(run.failureJob)}
                      </Text>
                    </td>
                    <td data-label="详情">
                      <Link href={run.url} target="_blank" rel="noreferrer">
                        查看 #{run.id}
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            evidence?.status === 'unavailable'
              ? 'GitLab 读取失败，历史 CI 暂不可用'
              : '尚无可展示的普通 push CI 历史'
          }
        />
      )}
    </section>
  )
}

function ServerCiPipelineFlow({ timing }) {
  const visibleStatuses = new Set(timing.flowJobs.map((job) => job.status))
  return (
    <section
      className="erp-dev-quality-server-pipeline"
      aria-labelledby="r640-pipeline-flow-title"
    >
      <div className="erp-dev-quality-server-pipeline__heading">
        <div>
          <Text id="r640-pipeline-flow-title" strong>
            本次 GitLab Pipeline Jobs
          </Text>
          <Text type="secondary">
            Job 名称、状态与耗时直接来自当前 GitLab 流水线。
          </Text>
        </div>
        <Text type="secondary">
          工作台不复制 CI DAG，新增或调整 Job 时以服务端读回为准。
        </Text>
      </div>
      <div className="erp-dev-quality-server-pipeline__track">
        <section className="erp-dev-quality-server-pipeline__phase">
          <div className="erp-dev-quality-server-pipeline__nodes">
            {timing.flowJobs.map((job) => (
              <article
                key={job.id}
                className={`erp-dev-quality-server-pipeline__node erp-dev-quality-server-pipeline__status--${job.status}`}
                data-status={job.status}
              >
                <div className="erp-dev-quality-server-pipeline__node-heading">
                  <span
                    className="erp-dev-quality-server-pipeline__status-indicator"
                    aria-hidden="true"
                  />
                  <Text
                    className="erp-dev-quality-server-pipeline__node-text"
                    code
                    strong
                  >
                    {job.name}
                  </Text>
                </div>
                <Text
                  className="erp-dev-quality-server-pipeline__node-text"
                  type="secondary"
                >
                  {job.durationMs === null
                    ? SERVER_PIPELINE_JOB_STATUS[job.status] || '状态未证明'
                    : `${SERVER_PIPELINE_JOB_STATUS[job.status] || '状态未证明'} · ${formatQualityGateDuration(job.durationMs)}`}
                </Text>
              </article>
            ))}
          </div>
        </section>
      </div>
      <div className="erp-dev-quality-server-pipeline__legend">
        {SERVER_PIPELINE_JOB_LEGEND.filter((status) =>
          visibleStatuses.has(status)
        ).map((status) => (
          <span
            key={status}
            className={`erp-dev-quality-server-pipeline__legend-item erp-dev-quality-server-pipeline__status--${status}`}
            data-status={status}
          >
            <i
              className="erp-dev-quality-server-pipeline__status-indicator"
              aria-hidden="true"
            />
            {SERVER_PIPELINE_JOB_STATUS[status]}
          </span>
        ))}
      </div>
    </section>
  )
}

function ServerCiEvidencePanel({ summary }) {
  const evidence = summary?.serverEvidence
  if (!evidence) return null
  const status =
    SERVER_EVIDENCE_STATUS[evidence.status] ||
    SERVER_EVIDENCE_STATUS.unavailable
  const timing = buildQualityGateServerTiming(evidence)
  const highlightedJobs = timing.jobs.slice(0, 3)
  const remainingJobs = timing.jobs.slice(3)
  return (
    <section
      className="erp-dev-quality-server-evidence"
      aria-label="R640 服务器质量证据"
    >
      <div className="erp-dev-quality-section-heading">
        <div className="erp-dev-quality-server-evidence__heading-copy">
          <Title level={2}>R640 服务器门禁</Title>
          <Text type="secondary">
            正式主路径 · 当前提交的普通 push CI、实际 Job、聚合回执与 CI Gate
          </Text>
        </div>
        <Space wrap size={6}>
          <Tag color="blue">正式主路径</Tag>
          <Tag color={evidence.status === 'unavailable' ? 'error' : 'success'}>
            {evidence.status === 'unavailable'
              ? 'GitLab 读取失败'
              : 'GitLab 读取正常'}
          </Tag>
          <Tag color={status.color}>{status.label}</Tag>
        </Space>
      </div>
      <ServerCiPipelineFlow timing={timing} />
      <div className="erp-dev-quality-server-evidence__facts">
        <div>
          <Text type="secondary">证据读取</Text>
          <Text
            strong
            type={evidence.status === 'unavailable' ? 'danger' : undefined}
          >
            {evidence.status === 'unavailable'
              ? 'GitLab API 失败'
              : 'GitLab API 正常'}
          </Text>
        </div>
        <div>
          <Text type="secondary">绑定提交</Text>
          <Text code>{shortCommit(evidence.gitSha)}</Text>
        </div>
        <div>
          <Text type="secondary">流水线</Text>
          {evidence.pipeline?.url ? (
            <Link href={evidence.pipeline.url} target="_blank" rel="noreferrer">
              #{evidence.pipeline.id}
            </Link>
          ) : (
            <Text>
              {evidence.status === 'missing'
                ? '当前提交未触发 CI'
                : evidence.status === 'unavailable'
                  ? '读取失败'
                  : '尚未证明'}
            </Text>
          )}
        </div>
        <div>
          <Text type="secondary">服务器总耗时</Text>
          <Text strong>{formatQualityGateDuration(timing.wallClockMs)}</Text>
        </div>
        <div>
          <Text type="secondary">排队耗时</Text>
          <Text strong>{formatQualityGateDuration(timing.queueMs)}</Text>
        </div>
        <div>
          <Text type="secondary">最长主路径 Job</Text>
          <Text strong>
            {timing.longestJob
              ? `${timing.longestJob.name} · ${formatQualityGateDuration(
                  timing.longestJob.durationMs
                )}`
              : '尚未形成'}
          </Text>
        </div>
        <div>
          <Text type="secondary">完成时间</Text>
          <DevTimestamp
            value={evidence.pipeline?.finishedAt}
            missing="尚未完成"
          />
        </div>
      </div>
      <Text>{evidence.message}</Text>
      {timing.jobs.length ? (
        <section
          className="erp-dev-quality-server-evidence__timing"
          aria-labelledby="r640-job-timing-title"
        >
          <div className="erp-dev-quality-server-evidence__timing-heading">
            <Text id="r640-job-timing-title" strong>
              最慢主路径 Job
            </Text>
            <Text type="secondary">条长相对最长主路径 Job，不是总耗时占比</Text>
          </div>
          <ServerJobTimingRows jobs={highlightedJobs} />
          {remainingJobs.length ? (
            <details className="erp-dev-quality-server-evidence__jobs">
              <summary>展开其余 {remainingJobs.length} 个 Job</summary>
              <ServerJobTimingRows jobs={remainingJobs} />
            </details>
          ) : null}
          <Text type="secondary">
            并行 Job
            可能互相重叠，不能累加推算服务器墙钟时间；优化时优先检查最长主路径
            Job 与排队耗时。
          </Text>
        </section>
      ) : null}
      <Text type="secondary">
        证据分层：服务器只证明已提交 SHA；本机 dirty 状态与本地回执不会被覆盖。
        {evidence.notProven?.length
          ? ` 尚未证明：${evidence.notProven.join('、')}。`
          : ''}
      </Text>
      <ServerCiHistory
        evidence={evidence}
        currentCommit={summary?.repository?.commit || ''}
      />
    </section>
  )
}

function TechnicalDetails({ operation }) {
  if (!operation) return null
  return (
    <details className="erp-dev-quality-technical">
      <summary>查看技术详情</summary>
      <Descriptions
        size="small"
        column={1}
        bordered
        items={[
          operation.proofOnly
            ? {
                key: 'evidence-source',
                label: '证据来源',
                children: '当前版本正式回执（无单独页面运行记录）',
              }
            : {
                key: 'operation-id',
                label: 'Operation ID',
                children: (
                  <Text code copyable>
                    {operation.id}
                  </Text>
                ),
              },
          {
            key: 'commit',
            label: '完整 SHA',
            children: (
              <Text code copyable>
                {operation.repository.commit}
              </Text>
            ),
          },
          {
            key: 'fingerprint',
            label: '工作区指纹',
            children: <Text code>{operation.repository.fingerprint}</Text>,
          },
          {
            key: 'stage',
            label: '当前 stage id',
            children: <Text code>{operation.stage}</Text>,
          },
          {
            key: 'receipt',
            label: '验证记录',
            children: operation.receipt
              ? `${operation.receipt.executed} 项执行 · ${operation.receipt.passed} 项通过 · ${operation.receipt.failed} 项失败 · ${operation.receipt.skipped} 项跳过`
              : '尚未取得正式回执',
          },
          {
            key: 'cache',
            label: '缓存信息',
            children: '当前正式回执未登记独立缓存指标',
          },
          {
            key: 'cleanup',
            label: '清理读回',
            children: operation.cleanup.message,
          },
          {
            key: 'created-at',
            label: '操作开始',
            children: (
              <DevTimestamp
                value={operation.createdAt}
                missing="开始时间未证明"
              />
            ),
          },
          {
            key: 'updated-at',
            label: '最近状态时间',
            children: (
              <DevTimestamp
                value={operation.finishedAt || operation.updatedAt}
                action={operationUpdateAction(operation)}
                missing="更新时间未证明"
              />
            ),
          },
          ...(operation.cancelRequestedAt
            ? [
                {
                  key: 'cancel-requested-at',
                  label: '取消请求',
                  children: (
                    <DevTimestamp
                      value={operation.cancelRequestedAt}
                      missing="取消请求时间未证明"
                    />
                  ),
                },
              ]
            : []),
        ]}
      />
    </details>
  )
}

function FlowMarker({ index, status }) {
  if (status === 'passed') return <CheckCircleOutlined aria-hidden="true" />
  if (status === 'failed') return <CloseCircleOutlined aria-hidden="true" />
  return <span aria-hidden="true">{index}</span>
}

function TerminalEvidence({ operation }) {
  const evidence = terminalEvidence(operation)
  const items = [
    {
      key: 'receipt',
      title: '正式回执',
      timestamp: operation?.receipt?.finishedAt,
      ...evidence.receipt,
    },
    { key: 'cleanup', title: '资源清理', ...evidence.cleanup },
  ]
  return (
    <section
      className="erp-dev-quality-flow__terminal"
      aria-label="门禁终态证明"
    >
      <div className="erp-dev-quality-flow__segment-heading">
        <div>
          <Text strong>终态证明</Text>
          <Text type="secondary">不计入 runner 运行阶段</Text>
        </div>
        <Tag>回执 + 清理读回</Tag>
      </div>
      <div className="erp-dev-quality-flow__terminal-items">
        {items.map((item) => {
          const status = STAGE_STATUS[item.status] || STAGE_STATUS.not_run
          return (
            <div
              className="erp-dev-quality-flow__terminal-item"
              data-status={item.status}
              key={item.key}
            >
              <span className="erp-dev-quality-flow__terminal-marker">
                <FlowMarker index="•" status={item.status} />
              </span>
              <div>
                <Text strong>{item.title}</Text>
                <Text type="secondary">{item.label}</Text>
                {item.timestamp ? (
                  <DevTimestamp
                    value={item.timestamp}
                    action="完成于"
                    missing="完成时间未证明"
                  />
                ) : null}
              </div>
              <Tag color={status.color}>{status.label}</Tag>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StageDetails({ stage, operation }) {
  const hasSubsteps = stage.substeps.length > 0
  if (!hasSubsteps && !operation) return null
  return (
    <details className="erp-dev-quality-flow__details">
      <summary>
        {hasSubsteps
          ? `固定子步骤 ${stage.substeps.length} 项`
          : '阶段技术信息'}
      </summary>
      {hasSubsteps ? (
        <>
          <ol className="erp-dev-quality-flow__substeps">
            {stage.substeps.map((substep) => (
              <li key={substep.id}>{substep.label}</li>
            ))}
          </ol>
          <Text type="secondary">
            来自正式 runner 的固定结构；这里不推测子步骤实时状态。
          </Text>
        </>
      ) : null}
      {operation ? (
        <div className="erp-dev-quality-flow__technical-detail">
          <Text code>{stage.id}</Text>
          <Space direction="vertical" size={2}>
            <DevTimestamp
              value={stage.startedAt}
              action="开始于"
              missing="开始时间未证明"
            />
            <DevTimestamp
              value={stage.finishedAt}
              action="完成于"
              missing="完成时间未证明"
            />
          </Space>
          <Text type="secondary">
            来源：正式 {operation.profile} runner · 验证记录：
            {operation.proofOnly ? '当前版本正式回执' : '页面门禁运行记录'}
          </Text>
        </div>
      ) : null}
    </details>
  )
}

function StageDurationComposition({ stages }) {
  const composition = buildQualityGateStageDurationComposition(stages)
  if (composition.items.length === 0) return null
  return (
    <section
      className="erp-dev-quality-duration"
      aria-labelledby="quality-duration-title"
    >
      <div className="erp-dev-quality-flow__segment-heading">
        <div>
          <Text id="quality-duration-title" strong>
            已记录阶段耗时构成
          </Text>
          <Text type="secondary">
            用于发现瓶颈；精确耗时和占比同时保留，不依赖悬停读取。
          </Text>
        </div>
        <Tag>{formatQualityGateDuration(composition.totalDurationMs)} 合计</Tag>
      </div>
      <div className="erp-dev-quality-duration__bar" aria-hidden="true">
        {composition.items.map((item, index) => (
          <span
            className="erp-dev-quality-duration__segment"
            data-tone={index % 5}
            key={item.id}
            style={{ '--quality-duration-share': `${item.sharePercent}%` }}
          />
        ))}
      </div>
      <ol className="erp-dev-quality-duration__legend">
        {composition.items.map((item, index) => (
          <li key={item.id}>
            <span
              className="erp-dev-quality-duration__swatch"
              data-tone={index % 5}
              aria-hidden="true"
            />
            <span>{item.label}</span>
            <Text
              type="secondary"
              className="erp-dev-quality-duration__legend-copy"
            >
              {formatQualityGateDuration(item.durationMs)} · {item.sharePercent}
              %{item.parallel ? ' · 可并行' : ''}
            </Text>
          </li>
        ))}
      </ol>
      <Text type="secondary" className="erp-dev-quality-duration__caveat">
        {composition.hasParallel
          ? '标为“可并行”的阶段可能互相重叠；图中比例按已记录阶段耗时之和归一化，不能相加推算墙钟时间。正式回执总耗时才是运行总时间。'
          : '图中比例按已记录阶段耗时之和归一化；正式回执总耗时仍是运行总时间真源。'}
      </Text>
    </section>
  )
}

function QualityGateHistoryTrend({ operations, operation }) {
  const trend = buildQualityGateHistoryTrend(operations, operation)
  return (
    <section
      className="erp-dev-quality-history-trend"
      aria-labelledby="quality-history-trend-title"
    >
      <div className="erp-dev-quality-section-heading">
        <div>
          <Text id="quality-history-trend-title" strong>
            同环境通过耗时趋势
          </Text>
          <Text type="secondary">
            只比较相同 profile、环境指纹和 dirty / clean 状态的正式通过回执。
          </Text>
        </div>
        <Tag>{trend.sampleCount} 个可比样本</Tag>
      </div>
      {trend.enoughSamples ? (
        <ol className="erp-dev-quality-history-trend__list">
          {trend.samples.map((sample) => {
            const width = trend.maxDurationMs
              ? (sample.durationMs / trend.maxDurationMs) * 100
              : 0
            return (
              <li key={sample.id}>
                <DevTimestamp
                  value={sample.finishedAt}
                  action="完成于"
                  missing="完成时间未证明"
                />
                <span
                  className="erp-dev-quality-history-trend__track"
                  aria-hidden="true"
                >
                  <span
                    className="erp-dev-quality-history-trend__bar"
                    style={{ '--quality-history-width': `${width}%` }}
                  />
                </span>
                <Text strong>
                  {formatQualityGateDuration(sample.durationMs)}
                </Text>
              </li>
            )
          })}
        </ol>
      ) : (
        <Text type="secondary">
          至少需要 3
          个可比的正式通过回执才绘制趋势；当前不会用不同环境或工作区状态的数据补数。
        </Text>
      )}
    </section>
  )
}

function QualityGateCoverageMatrix({ categories }) {
  const matrix = buildQualityGateCoverageMatrix(categories)
  if (matrix.gates.length === 0 || matrix.rows.length === 0) return null
  return (
    <section
      className="erp-dev-quality-coverage"
      aria-labelledby="quality-coverage-title"
    >
      <div className="erp-dev-quality-section-heading">
        <div>
          <Title id="quality-coverage-title" level={2}>
            风险 × 门禁覆盖矩阵
          </Title>
          <Text type="secondary">
            先横向比较每类风险的证据状态，再到下方查看原因与证据清单。
          </Text>
        </div>
      </div>
      <div className="erp-dev-quality-coverage__table-wrap">
        <table>
          <caption>当前筛选范围内的风险与门禁覆盖关系</caption>
          <thead>
            <tr>
              <th scope="col">风险</th>
              {matrix.gates.map((gate) => (
                <th scope="col" key={gate.key}>
                  {gate.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((row) => (
              <tr key={row.key}>
                <th scope="row">
                  <Space size={6} wrap>
                    <span>{row.label}</span>
                    {row.highRisk ? <Tag color="error">高风险</Tag> : null}
                  </Space>
                </th>
                {row.cells.map((cell) => {
                  const status =
                    COVERAGE_STATUS[cell.status] ||
                    COVERAGE_STATUS.not_applicable
                  return (
                    <td key={cell.gateKey}>
                      <span
                        className="erp-dev-quality-coverage__status"
                        data-tone={status.tone}
                      >
                        {status.label}
                      </span>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ManagedDatabaseLifecycleGuide() {
  const [diagramOpen, setDiagramOpen] = useState(false)
  return (
    <details
      className="erp-dev-quality-managed-database"
      onToggle={(event) => setDiagramOpen(event.currentTarget.open)}
    >
      <summary>查看本机托管数据库的静态运行与清理流程</summary>
      <div className="erp-dev-quality-managed-database__body">
        <div className="erp-dev-quality-managed-database__copy">
          <Text strong>静态工作原理，不代表当前运行状态</Text>
          <ol>
            {MANAGED_DATABASE_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <Text type="secondary">
            当前是否就绪、运行到哪里、是否清理完成，仍以上方状态和正式 operation
            回执为准。
          </Text>
        </div>
        {diagramOpen ? (
          <MermaidDiagram
            chart={MANAGED_DATABASE_FLOW}
            label="本机托管数据库生命周期图"
            showSourceOnError={false}
            flowchartHtmlLabels={false}
          />
        ) : null}
      </div>
    </details>
  )
}

function GateExecutionFlow({ summary, operation, profile }) {
  const stages = operation
    ? deriveStages(summary, operation)
    : previewStages(summary, profile)
  const groups = flowGroups(summary, profile, stages)
  const longestId = longestStageId(stages)
  const composition = buildQualityGateStageDurationComposition(stages)
  const compositionById = new Map(
    composition.items.map((item) => [item.id, item])
  )
  const strictSegments = getQualityGateFlowSegments(summary?.profiles, 'strict')
  const strictExtraCount =
    strictSegments.find((segment) => segment.id === 'strict-extra')?.stages
      .length || 0

  if (stages.length === 0) {
    return <Empty description="正在读取正式门禁阶段" />
  }

  return (
    <section className="erp-dev-quality-flow" aria-label="本机诊断执行轨道">
      <div className="erp-dev-quality-flow__heading">
        <div>
          <Text strong>本机诊断执行轨道</Text>
          <Text type="secondary">
            {profile === 'strict'
              ? `先运行 ${strictExtraCount} 个 strict 附加检查，再进入 full 共用主路径。`
              : `直接运行 full 共用主路径；strict 会在此之前增加 ${strictExtraCount} 个检查。`}
          </Text>
        </div>
        <Tag color={operation ? 'blue' : 'default'}>
          {PROFILE_LABELS[profile]} · {stages.length} 个阶段
        </Tag>
      </div>
      <div className="erp-dev-quality-flow__segments">
        {groups.map((group) => (
          <section className="erp-dev-quality-flow__segment" key={group.id}>
            <div className="erp-dev-quality-flow__segment-heading">
              <Text strong>{group.label}</Text>
              <Tag>{group.scopeLabel}</Tag>
            </div>
            <ol className="erp-dev-quality-flow__track">
              {group.stages.map((stage) => {
                const displayStatus = flowStageStatus(stage, operation)
                const status =
                  STAGE_STATUS[displayStatus] || STAGE_STATUS.not_run
                const index =
                  stages.findIndex((item) => item.id === stage.id) + 1
                const duration = compositionById.get(stage.id)
                const emphasis =
                  displayStatus === 'failed'
                    ? 'failed'
                    : displayStatus === 'running'
                      ? 'current'
                      : longestId === stage.id && duration
                        ? 'longest'
                        : 'supporting'
                return (
                  <li
                    className="erp-dev-quality-flow__step"
                    data-status={displayStatus}
                    data-emphasis={emphasis}
                    aria-current={
                      displayStatus === 'running' ? 'step' : undefined
                    }
                    key={stage.id}
                  >
                    <span className="erp-dev-quality-flow__marker">
                      <FlowMarker index={index} status={displayStatus} />
                    </span>
                    <div className="erp-dev-quality-flow__step-body">
                      <div className="erp-dev-quality-flow__step-title">
                        <Text type="secondary">第 {index} 步</Text>
                        <Text strong>{stage.label}</Text>
                      </div>
                      <Space size={6} wrap>
                        <Tag color={status.color}>{status.label}</Tag>
                        {longestId === stage.id && duration ? (
                          <Tag color="gold">最长阶段</Tag>
                        ) : null}
                        {stage.substeps.length ? (
                          <Tag>{stage.substeps.length} 个固定子步骤</Tag>
                        ) : null}
                      </Space>
                      {operation && duration ? (
                        <Text type="secondary">
                          {formatQualityGateDuration(duration.durationMs)} ·
                          已记录阶段耗时占比 {duration.sharePercent}%
                        </Text>
                      ) : null}
                      <StageDetails stage={stage} operation={operation} />
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
      <StageDurationComposition stages={stages} />
      <TerminalEvidence operation={operation} />
    </section>
  )
}

function LocalDiagnosticsActions({
  summary,
  initialLoading,
  canRun,
  actionProfile,
  onStart,
}) {
  return (
    <section className="erp-dev-quality-actions" aria-label="本机质量诊断操作">
      <div className="erp-dev-quality-actions__heading">
        <div>
          <Text strong>本机诊断（按需）</Text>
          <Text type="secondary">
            用于定位当前工作区问题；正式 main 门禁由推送后的 R640 CI 执行。
          </Text>
        </div>
        <Tag>不替代服务器 CI</Tag>
      </div>
      <div className="erp-dev-quality-actions__buttons">
        <div className="erp-dev-quality-actions__primary">
          <Button
            size="large"
            disabled={!canRun}
            loading={actionProfile === 'strict'}
            onClick={() => onStart('strict')}
          >
            运行本机严格诊断
          </Button>
          <Tooltip
            title="严格门禁比完整门禁多检查工具链、Shell 与 YAML，并生成绑定当前仓库身份的正式回执；若工作区有未提交改动，结果只证明当前工作区，不能作为干净 exact SHA 的发布证明。"
            placement="bottom"
            trigger={['hover', 'focus']}
          >
            <Button
              type="text"
              shape="circle"
              size="small"
              className="erp-dev-quality-actions__help"
              icon={<QuestionCircleOutlined />}
              aria-label="什么时候运行本机严格诊断"
            />
          </Tooltip>
        </div>
        <Button
          size="large"
          disabled={!canRun}
          loading={actionProfile === 'full'}
          onClick={() => onStart('full')}
        >
          运行本机完整诊断
        </Button>
      </div>
      <div className="erp-dev-quality-actions__durations">
        <Text>
          本机严格诊断：按需定位严格门禁问题 · 最近实际耗时{' '}
          {formatQualityGateDuration(profileDuration(summary, 'strict'))}
        </Text>
        <Text>
          本机完整诊断：按需定位完整门禁问题 · 最近实际耗时{' '}
          {formatQualityGateDuration(profileDuration(summary, 'full'))}
        </Text>
      </div>
      {!initialLoading && summary?.environment ? (
        <div className="erp-dev-quality-actions__environment">
          <Tag
            color={
              summary.environment.disposableDatabaseReady
                ? 'success'
                : 'warning'
            }
          >
            {summary.environment.disposableDatabaseReady
              ? '运行环境已就绪'
              : '运行环境未就绪'}
          </Tag>
          <Text type="secondary">
            {summary.environment.disposableDatabaseReady
              ? summary.environment.message
              : '请按上方建议完成本机运行环境准备。'}
          </Text>
        </div>
      ) : null}
      <ManagedDatabaseLifecycleGuide />
    </section>
  )
}

function RunView({
  summary,
  operation,
  previewProfile,
  actionProfile,
  onCancel,
  cancelButtonRef,
}) {
  const profile = operation?.profile || previewProfile
  const stages = operation
    ? deriveStages(summary, operation)
    : previewStages(summary, profile)
  const cancellable =
    operation && ['queued', 'running'].includes(operation.status)
  const progress = operation ? stageProgress(stages) : 0
  const history = (summary?.operations || []).slice(0, 20)
  const historyColumns = [
    {
      title: '门禁',
      dataIndex: 'profile',
      key: 'profile',
      render: (profile) => PROFILE_LABELS[profile] || '未登记门禁',
    },
    {
      title: '结果',
      dataIndex: 'status',
      key: 'status',
      render: (_, row) => <OperationStatusTag operation={row} />,
    },
    {
      title: '耗时',
      key: 'duration',
      render: (_, row) => formatQualityGateDuration(operationDuration(row)),
    },
    {
      title: '时间',
      key: 'time',
      width: 220,
      render: (_, row) => (
        <Space direction="vertical" size={2}>
          <DevTimestamp
            value={row.createdAt}
            action="开始于"
            missing="开始时间未证明"
          />
          <DevTimestamp
            value={row.finishedAt || row.updatedAt}
            action={operationUpdateAction(row)}
            missing="更新时间未证明"
          />
        </Space>
      ),
    },
    {
      title: '版本',
      key: 'version',
      render: (_, row) => (
        <Space size={6}>
          <Text code>{shortCommit(row.repository.commit)}</Text>
          {row.repository.dirty ? <Tag color="warning">dirty</Tag> : null}
        </Space>
      ),
    },
  ]

  return (
    <div className="erp-dev-quality-run-view">
      <section className="erp-dev-quality-operation" aria-live="polite">
        {operation ? (
          <>
            <div className="erp-dev-quality-operation__heading">
              <div>
                <Space size={8} wrap>
                  <Title level={2}>{PROFILE_LABELS[operation.profile]}</Title>
                  <OperationStatusTag operation={operation} />
                  {operation.displayContext === 'current-proof' ? (
                    <Tag color="blue">当前正式回执</Tag>
                  ) : null}
                  {operation.displayContext === 'history' ? (
                    <Tag color="warning">本机历史</Tag>
                  ) : null}
                </Space>
                <Paragraph>{operation.message}</Paragraph>
                <Space wrap size={[12, 4]}>
                  <DevTimestamp
                    value={operation.createdAt}
                    action="开始于"
                    missing="开始时间未证明"
                  />
                  <DevTimestamp
                    value={operation.finishedAt || operation.updatedAt}
                    action={operationUpdateAction(operation)}
                    missing="更新时间未证明"
                  />
                </Space>
              </div>
              {cancellable ? (
                <Button
                  ref={cancelButtonRef}
                  icon={<StopOutlined />}
                  danger
                  onClick={() => onCancel(operation)}
                >
                  取消运行
                </Button>
              ) : null}
            </div>
            <div className="erp-dev-quality-operation__facts">
              <div>
                <Text type="secondary">已运行 / 总耗时</Text>
                <Text strong>
                  {formatQualityGateDuration(operationDuration(operation))}
                </Text>
              </div>
              <div>
                <Text type="secondary">当前阶段</Text>
                <Text strong>{currentStageLabel(stages, operation)}</Text>
              </div>
              <div>
                <Text type="secondary">
                  {DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
                    ? '预计剩余'
                    : '运行状态'}
                </Text>
                <Text strong>{estimatedRemaining(summary, operation)}</Text>
              </div>
            </div>
            <Progress
              percent={progress}
              status={
                operation.status === 'failed'
                  ? 'exception'
                  : operation.status === 'passed'
                    ? 'success'
                    : 'active'
              }
              aria-label={`${PROFILE_LABELS[operation.profile]}进度 ${progress}%`}
            />
            {operation.firstFailure ? (
              <Alert
                type="error"
                showIcon
                message={`第一失败：${operation.firstFailure}`}
                description="请先修复第一失败阶段，再重新运行；页面不会自动重试。"
              />
            ) : null}
          </>
        ) : (
          <div className="erp-dev-quality-operation__heading">
            <div>
              <Space size={8} wrap>
                <Title level={2}>{PROFILE_LABELS[profile]}流程预览</Title>
                <Tag>尚未运行</Tag>
              </Space>
              <Paragraph>
                运行后会在同一条轨道上原位显示当前阶段、第一失败、耗时、正式回执和清理读回。
              </Paragraph>
            </div>
          </div>
        )}
        <GateExecutionFlow
          summary={summary}
          operation={operation}
          profile={profile}
        />
        {operation ? <TechnicalDetails operation={operation} /> : null}
      </section>

      <section
        className="erp-dev-quality-history"
        aria-labelledby="quality-history-title"
      >
        <div className="erp-dev-quality-section-heading">
          <Title id="quality-history-title" level={2}>
            本机最近诊断
          </Title>
          <Text type="secondary">
            每种本机诊断最多保留最近 20 次脱敏记录；不混入 GitLab 流水线
          </Text>
        </div>
        <QualityGateHistoryTrend
          operations={summary?.operations || []}
          operation={operation}
        />
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={history}
          columns={historyColumns}
          locale={{ emptyText: '尚无运行记录' }}
          scroll={{ x: 900 }}
        />
      </section>

      <Text type="secondary" className="erp-dev-quality-action-status">
        {actionProfile
          ? `正在启动${PROFILE_LABELS[actionProfile]}`
          : '本机诊断完成后不会自动提交、推送、发布或部署，也不替代 R640 CI Gate。'}
      </Text>
    </div>
  )
}

function GovernanceView({ data, loading, error, values, onSearch, onFilter }) {
  const [draft, setDraft] = useState(values.q || '')
  useEffect(() => setDraft(values.q || ''), [values.q])
  const columns = [
    { title: '门禁', dataIndex: 'label', key: 'label', width: 160 },
    { title: '防什么问题', dataIndex: 'prevents', key: 'prevents', width: 260 },
    { title: '什么时候跑', dataIndex: 'trigger', key: 'trigger', width: 260 },
    {
      title: '最近耗时',
      key: 'duration',
      width: 140,
      render: (_, row) =>
        formatQualityGateDuration(row.statistics?.medianDurationMs),
    },
    {
      title: '最近结果',
      key: 'result',
      width: 120,
      render: (_, row) => (
        <Tag color={row.current ? 'success' : 'warning'}>
          {row.current
            ? '属于当前改动'
            : row.recentResult === 'missing'
              ? '尚未运行'
              : '不可用于当前改动'}
        </Tag>
      ),
    },
    { title: '建议', dataIndex: 'advice', key: 'advice', width: 220 },
  ]

  return (
    <div className="erp-dev-quality-governance-view">
      <div className="erp-dev-quality-view-tools">
        <form
          className="erp-dev-quality-view-search"
          onSubmit={(event) => {
            event.preventDefault()
            onSearch(draft)
          }}
        >
          <SearchInput
            allowClear
            value={draft}
            placeholder="搜索门禁或风险"
            searchHint="输入门禁名称或风险后按回车搜索"
            onChange={(event) => {
              const nextDraft = event.target.value
              setDraft(nextDraft)
              if (!nextDraft && values.q) onSearch('')
            }}
          />
          <Button type="primary" htmlType="submit">
            搜索
          </Button>
        </form>
        <Segmented
          aria-label="门禁范围"
          options={GOVERNANCE_FILTER_OPTIONS}
          value={values.filter}
          onChange={onFilter}
        />
      </div>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="门禁治理读取失败"
          description={error}
        />
      ) : null}
      <Table
        rowKey="key"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={data?.rows || []}
        columns={columns}
        scroll={{ x: 1160 }}
        locale={{ emptyText: '当前筛选下没有相关门禁' }}
        expandable={{ expandedRowRender: renderGovernanceEvidence }}
      />

      <section
        className="erp-dev-quality-complexity"
        aria-labelledby="quality-complexity-title"
      >
        <div className="erp-dev-quality-section-heading">
          <Title id="quality-complexity-title" level={2}>
            客观复杂度候选
          </Title>
          <Text type="secondary">
            只给出可解释信号，不计算健康总分，也不自动删除门禁。
          </Text>
        </div>
        <List
          dataSource={data?.complexity || []}
          locale={{ emptyText: '当前没有客观复杂度候选' }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Text strong>{item.signal}</Text>
                    <Tag
                      color={
                        item.severity === 'success'
                          ? 'success'
                          : item.severity === 'warning'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {item.recommendation}
                    </Tag>
                  </Space>
                }
                description={item.detail}
              />
            </List.Item>
          )}
        />
      </section>
    </div>
  )
}

function GapsView({ data, loading, error, values, onRange, onRisk }) {
  return (
    <div className="erp-dev-quality-gaps-view">
      <div className="erp-dev-quality-view-tools">
        <Segmented
          aria-label="改动范围"
          options={GAP_RANGE_OPTIONS}
          value={values.range}
          onChange={onRange}
        />
        <Segmented
          aria-label="风险范围"
          options={GAP_RISK_OPTIONS}
          value={values.risk}
          onChange={onRisk}
        />
      </div>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="覆盖缺口读取失败"
          description={error}
        />
      ) : null}
      {loading ? (
        <Progress percent={35} status="active" showInfo={false} />
      ) : null}
      {data && !data.matched ? (
        <Alert
          type="warning"
          showIcon
          message="当前改动没有匹配门禁"
          description="未知改动不能据此视为安全；请回到改动验证核对 affected 计划，必要时运行完整门禁。"
        />
      ) : null}
      <div className="erp-dev-quality-gap-flow" aria-label="覆盖缺口判断路径">
        <span>当前改动</span>
        <span aria-hidden="true">→</span>
        <span>涉及风险</span>
        <span aria-hidden="true">→</span>
        <span>应运行门禁</span>
        <span aria-hidden="true">→</span>
        <span>当前结果</span>
        <span aria-hidden="true">→</span>
        <span>仍缺证据</span>
      </div>
      <QualityGateCoverageMatrix categories={data?.categories || []} />
      <div className="erp-dev-quality-gap-categories">
        {(data?.categories || []).map((category) => (
          <section key={category.key} className="erp-dev-quality-gap-category">
            <div>
              <Space wrap>
                <Title level={3}>{category.label}</Title>
                <Tag color={category.highRisk ? 'error' : 'warning'}>
                  {category.highRisk ? '高风险' : '需核对'}
                </Tag>
                <Tag
                  color={category.status === 'covered' ? 'success' : 'warning'}
                >
                  {category.status === 'covered'
                    ? '当前证据齐全'
                    : '仍缺必需门禁'}
                </Tag>
              </Space>
              <Paragraph>{category.risk}</Paragraph>
            </div>
            <div className="erp-dev-quality-gap-category__grid">
              <div>
                <Text type="secondary">应运行门禁</Text>
                <Text>
                  {category.gateResults.map((item) => item.label).join('、')}
                </Text>
              </div>
              <div>
                <Text type="secondary">当前结果</Text>
                <Text>
                  {category.gateResults
                    .map(
                      (item) =>
                        `${item.label}：${item.status === 'current' ? '当前有效' : item.status === 'stale' ? '旧结果' : '未运行'}`
                    )
                    .join('；')}
                </Text>
              </div>
              <div>
                <Text type="secondary">还缺什么</Text>
                <Text>
                  {category.missing.length
                    ? category.gateResults
                        .filter((item) => item.status !== 'current')
                        .map((item) => item.label)
                        .join('、')
                    : '没有自动化缺口'}
                </Text>
              </div>
            </div>
            <details>
              <summary>查看该风险的证据清单</summary>
              <ul>
                {category.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </section>
        ))}
      </div>
      {data ? (
        <Alert
          type="info"
          showIcon
          message="自动化证据边界"
          description={data.boundaries.join('；')}
        />
      ) : null}
    </div>
  )
}

export default function DevQualityGatesPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const client = useMemo(() => createDevQualityGateClient(), [])
  const titleRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const viewValuesRef = useRef({
    server: { ...EMPTY_VIEW_STATE.server },
    run: { ...EMPTY_VIEW_STATE.run },
    governance: { ...EMPTY_VIEW_STATE.governance },
    gaps: { ...EMPTY_VIEW_STATE.gaps },
  })
  const summaryRequestRef = useRef(0)
  const viewRequestRef = useRef(0)
  const idempotencyRef = useRef(new Map())
  const mutationRef = useRef(false)
  const [summary, setSummary] = useState(null)
  const [initialLoading, setInitialLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [viewState, setViewState] = useState({
    view: DEFAULT_VIEW,
    ...EMPTY_ASYNC_VIEW_STATE,
  })
  const [viewRefresh, setViewRefresh] = useState(0)
  const [actionProfile, setActionProfile] = useState('')

  const operationIds = useMemo(
    () => summary?.operations?.map((operation) => operation.id) || null,
    [summary?.operations]
  )
  const parsed = useMemo(
    () => parseQualityGateSearch(searchParams, { operationIds }),
    [operationIds, searchParams]
  )
  const activeView = parsed.view
  const activeViewState =
    viewState.view === activeView ? viewState : EMPTY_ASYNC_VIEW_STATE
  const activeDescription = VIEW_ITEMS.find(
    (item) => item.value === activeView
  )?.description

  useEffect(() => {
    window.requestAnimationFrame(() => titleRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!parsed.valid) return
    viewValuesRef.current[activeView] = {
      ...viewValuesRef.current[activeView],
      ...parsed.values,
    }
  }, [activeView, parsed.valid, parsed.values])

  useEffect(() => {
    if (!parsed.valid || !parsed.canonicalMissingView) return
    setSearchParams(new URLSearchParams({ view: DEFAULT_VIEW }), {
      replace: true,
    })
  }, [parsed.canonicalMissingView, parsed.valid, setSearchParams])

  const loadSummary = useCallback(
    async ({ quiet = false, signal } = {}) => {
      const requestId = summaryRequestRef.current + 1
      summaryRequestRef.current = requestId
      if (!quiet) setRefreshing(true)
      try {
        const next = await client.summary({ signal })
        if (summaryRequestRef.current !== requestId) return null
        setSummary(next)
        setSummaryError('')
        return next
      } catch (error) {
        if (
          error?.name === 'AbortError' ||
          summaryRequestRef.current !== requestId
        ) {
          return null
        }
        setSummaryError('质量门禁状态暂时不可用，请确认本机开发服务。')
        return null
      } finally {
        if (summaryRequestRef.current === requestId) {
          setInitialLoading(false)
          setRefreshing(false)
        }
      }
    },
    [client]
  )

  useEffect(() => {
    const controller = new AbortController()
    loadSummary({ quiet: true, signal: controller.signal })
    return () => controller.abort()
  }, [loadSummary])

  const currentOperation = summary?.currentOperation
  const polling = Boolean(
    currentOperation &&
      DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(currentOperation.status)
  )
  useEffect(() => {
    if (!polling) return undefined
    let pending = false
    let controller = null
    const timer = window.setInterval(() => {
      if (pending) return
      pending = true
      controller = new AbortController()
      loadSummary({ quiet: true, signal: controller.signal }).finally(() => {
        pending = false
        controller = null
      })
    }, POLL_INTERVAL_MS)
    return () => {
      window.clearInterval(timer)
      controller?.abort()
    }
  }, [loadSummary, polling])

  useEffect(() => {
    if (!parsed.valid || ['server', 'run'].includes(activeView)) {
      viewRequestRef.current += 1
      setViewState({
        view: activeView,
        ...EMPTY_ASYNC_VIEW_STATE,
      })
      return undefined
    }
    const controller = new AbortController()
    const requestId = viewRequestRef.current + 1
    viewRequestRef.current = requestId
    setViewState({
      view: activeView,
      data: null,
      loading: true,
      error: '',
    })
    const request =
      activeView === 'governance'
        ? client.governance({
            filter: parsed.values.filter,
            q: parsed.values.q,
            signal: controller.signal,
          })
        : client.gaps({
            range: parsed.values.range,
            risk: parsed.values.risk,
            signal: controller.signal,
          })
    request
      .then((data) => {
        if (viewRequestRef.current !== requestId) return
        setViewState((current) =>
          current.view === activeView ? { ...current, data } : current
        )
      })
      .catch((error) => {
        if (
          error?.name === 'AbortError' ||
          viewRequestRef.current !== requestId
        ) {
          return
        }
        setViewState((current) =>
          current.view === activeView
            ? {
                ...current,
                error: '当前视图暂时不可用；不会使用旧请求结果覆盖本页。',
              }
            : current
        )
      })
      .finally(() => {
        if (viewRequestRef.current !== requestId) return
        setViewState((current) =>
          current.view === activeView ? { ...current, loading: false } : current
        )
      })
    return () => controller.abort()
  }, [
    activeView,
    client,
    parsed.valid,
    parsed.values.filter,
    parsed.values.q,
    parsed.values.range,
    parsed.values.risk,
    viewRefresh,
  ])

  const selectView = useCallback(
    (nextView) => {
      if (nextView === activeView) return
      const values =
        viewValuesRef.current[nextView] || EMPTY_VIEW_STATE[nextView]
      const nextSearch = buildQualityGateViewSearch(nextView, values)
      setSearchParams(new URLSearchParams(nextSearch.slice(1)))
    },
    [activeView, setSearchParams]
  )

  const updateViewValues = useCallback(
    (values) => {
      const nextValues = { ...parsed.values, ...values }
      viewValuesRef.current[activeView] = nextValues
      const nextSearch = buildQualityGateViewSearch(activeView, nextValues)
      setSearchParams(new URLSearchParams(nextSearch.slice(1)))
    },
    [activeView, parsed.values, setSearchParams]
  )

  const refresh = useCallback(async () => {
    await loadSummary()
    if (['governance', 'gaps'].includes(activeView)) {
      setViewRefresh((value) => value + 1)
    }
  }, [activeView, loadSummary])

  const start = useCallback(
    async (profile) => {
      if (
        mutationRef.current ||
        !parsed.valid ||
        !DEV_QUALITY_GATE_PROFILES.includes(profile)
      ) {
        return
      }
      mutationRef.current = true
      setActionProfile(profile)
      let idempotencyKey = idempotencyRef.current.get(profile)
      if (!idempotencyKey) {
        idempotencyKey = createQualityGateIdempotencyKey(profile)
        idempotencyRef.current.set(profile, idempotencyKey)
      }
      try {
        const result = await client.start(profile, idempotencyKey)
        setSummary((current) =>
          mergeOperationIntoSummary(current, result.operation)
        )
        updateViewValues({ profile, operation: result.operation.id })
        message.success(
          result.reused
            ? `已恢复${PROFILE_LABELS[profile]}的原运行记录`
            : `${PROFILE_LABELS[profile]}已启动`
        )
        await loadSummary({ quiet: true })
      } catch (error) {
        if (error?.name !== 'AbortError') {
          message.error(
            '质量门禁未能启动，请核对当前状态以及本机 Docker 或一次性数据库环境。'
          )
        }
      } finally {
        mutationRef.current = false
        setActionProfile('')
        idempotencyRef.current.delete(profile)
      }
    },
    [client, loadSummary, parsed.valid, updateViewValues]
  )

  const cancel = useCallback(
    (operation) => {
      modal.confirm({
        centered: true,
        title: '确认取消当前门禁？',
        content:
          '将停止当前测试，并等待一次性数据库、容器、进程和运行锁完成清理。已完成阶段仍会保留，页面不会自动重试。',
        okText: '确认取消',
        okButtonProps: { danger: true },
        cancelText: '继续运行',
        afterClose: () => cancelButtonRef.current?.focus(),
        onOk: async () => {
          if (mutationRef.current) return
          mutationRef.current = true
          try {
            const next = await client.cancel(operation.id)
            setSummary((current) => mergeOperationIntoSummary(current, next))
            message.info('正在停止测试并等待清理读回')
            await loadSummary({ quiet: true })
          } catch {
            message.error('取消请求未完成，请刷新状态后再判断。')
          } finally {
            mutationRef.current = false
          }
        },
      })
    },
    [client, loadSummary]
  )

  const displayedOperation = selectDisplayedQualityGateOperation(summary, {
    operationId: parsed.values.operation,
    profile: parsed.values.profile,
  })
  const busy = summary?.busy?.active || Boolean(actionProfile)
  const canRun = Boolean(
    parsed.valid &&
      summary?.environment?.disposableDatabaseReady &&
      !busy &&
      !initialLoading
  )
  const displayedStatus = qualityGateViewStatus(
    summary,
    activeView,
    summaryError
  )

  return (
    <div className="erp-dev-quality-gates-page erp-dev-workspace-page">
      <DevPageNav sourcePath={SOURCE_PATH} />
      <header className="erp-dev-quality-header">
        <div>
          <Text className="erp-dev-quality-header__eyebrow">
            研发效能工作台 · 服务器证据优先
          </Text>
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-quality-header__icon" />
            <Title ref={titleRef} tabIndex={-1} level={1}>
              质量门禁
            </Title>
          </Space>
          <Paragraph>
            先核对当前提交的 R640 exact-SHA CI，再按需使用本机 full / strict
            诊断未提交改动；两类证据分开记录。
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={refresh}
        >
          刷新状态
        </Button>
      </header>

      <main className="erp-dev-quality-shell">
        {summaryError ? (
          <Alert
            type="error"
            showIcon
            message="质量门禁状态读取失败"
            description={summaryError}
          />
        ) : null}
        {!parsed.valid ? (
          <Alert
            type="warning"
            showIcon
            message="当前质量门禁链接无效或已经过期"
            description={parsed.issues.join('；')}
            action={
              <Button
                onClick={() =>
                  setSearchParams(new URLSearchParams({ view: DEFAULT_VIEW }), {
                    replace: true,
                  })
                }
              >
                安全返回默认视图
              </Button>
            }
          />
        ) : null}

        <Alert
          className="erp-dev-quality-status-banner"
          type={displayedStatus?.tone || 'info'}
          showIcon
          icon={
            displayedStatus?.tone === 'success' ? (
              <CheckCircleOutlined />
            ) : displayedStatus?.tone === 'error' ? (
              <CloseCircleOutlined />
            ) : (
              <InfoCircleOutlined />
            )
          }
          message={displayedStatus?.title || '正在读取当前质量状态'}
          description={
            <Space direction="vertical" size={4}>
              <Text>
                {displayedStatus?.description ||
                  '请稍候，页面不会自动执行任何门禁。'}
              </Text>
              {displayedStatus?.recommendation ? (
                <Text strong>建议：{displayedStatus.recommendation}</Text>
              ) : null}
              {displayedStatus?.notProven?.length ? (
                <Text type="secondary">
                  尚未证明：{displayedStatus.notProven.join('、')}
                </Text>
              ) : null}
            </Space>
          }
        />

        <DevTaskNav
          idPrefix="quality-gates"
          ariaLabel="质量门禁视图"
          items={VIEW_ITEMS.map(({ value, label }) => ({ value, label }))}
          value={activeView}
          onChange={selectView}
          disabled={!parsed.valid}
          compact
          className="erp-dev-quality-tabs"
        />
        <Text className="erp-dev-quality-view-description">
          {activeDescription}
        </Text>
        <ContextStrip
          summary={summary}
          view={activeView}
          summaryError={summaryError}
          onReturnLocal={() => selectView('run')}
        />

        <section className="erp-dev-quality-content">
          <div
            id={`quality-gates-panel-${activeView}`}
            role="tabpanel"
            aria-labelledby={`quality-gates-tab-${activeView}`}
            tabIndex={0}
          >
            {parsed.valid && activeView === 'server' ? (
              <ServerCiEvidencePanel summary={summary} />
            ) : null}
            {parsed.valid && activeView === 'run' ? (
              <>
                <LocalDiagnosticsActions
                  summary={summary}
                  initialLoading={initialLoading}
                  canRun={canRun}
                  actionProfile={actionProfile}
                  onStart={start}
                />
                <RunView
                  summary={summary}
                  operation={displayedOperation}
                  previewProfile={parsed.values.profile || 'strict'}
                  actionProfile={actionProfile}
                  onCancel={cancel}
                  cancelButtonRef={cancelButtonRef}
                />
              </>
            ) : null}
            {parsed.valid && activeView === 'governance' ? (
              <GovernanceView
                data={activeViewState.data}
                loading={activeViewState.loading}
                error={activeViewState.error}
                values={parsed.values}
                onSearch={(q) => updateViewValues({ q })}
                onFilter={(filter) =>
                  DEV_QUALITY_GATE_GOVERNANCE_FILTERS.includes(filter) &&
                  updateViewValues({ filter })
                }
              />
            ) : null}
            {parsed.valid && activeView === 'gaps' ? (
              <GapsView
                data={activeViewState.data}
                loading={activeViewState.loading}
                error={activeViewState.error}
                values={parsed.values}
                onRange={(range) =>
                  DEV_QUALITY_GATE_GAP_RANGES.includes(range) &&
                  updateViewValues({ range })
                }
                onRisk={(risk) =>
                  DEV_QUALITY_GATE_GAP_RISKS.includes(risk) &&
                  updateViewValues({ risk })
                }
              />
            ) : null}
          </div>
        </section>
      </main>
    </div>
  )
}
