import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  List,
  Progress,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import { message, modal } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import {
  DEFAULT_VIEW,
  DEV_QUALITY_GATE_ACTIVE_STATUSES,
  DEV_QUALITY_GATE_GOVERNANCE_FILTERS,
  DEV_QUALITY_GATE_GAP_RANGES,
  DEV_QUALITY_GATE_GAP_RISKS,
  DEV_QUALITY_GATE_PROFILES,
  VIEW_ITEMS,
  buildQualityGateViewSearch,
  createDevQualityGateClient,
  createQualityGateIdempotencyKey,
  formatQualityGateDuration,
  getQualityGateStageLabel,
  getQualityGateStatusMeta,
  parseQualityGateSearch,
} from '../config/devQualityGates.mjs'
import { DEV_VERSION_CENTER_ROUTE } from '../config/devRoutes.mjs'

const { Paragraph, Text, Title } = Typography
const POLL_INTERVAL_MS = 1500
const SOURCE_PATH = 'scripts/qa/README.md'
const EMPTY_VIEW_STATE = Object.freeze({
  run: Object.freeze({ profile: '', operation: '' }),
  governance: Object.freeze({ q: '', filter: 'relevant' }),
  gaps: Object.freeze({ range: 'current', risk: 'all' }),
})
const EMPTY_ASYNC_VIEW_STATE = Object.freeze({
  data: null,
  loading: false,
  error: '',
})
const PROFILE_LABELS = Object.freeze({ full: '完整门禁', strict: '严格门禁' })
const STAGE_STATUS = Object.freeze({
  pending: Object.freeze({ label: '等待运行', color: 'default' }),
  running: Object.freeze({ label: '正在运行', color: 'processing' }),
  passed: Object.freeze({ label: '已通过', color: 'success' }),
  failed: Object.freeze({ label: '未通过', color: 'error' }),
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
  if (
    !operation ||
    !DEV_QUALITY_GATE_ACTIVE_STATUSES.includes(operation.status)
  ) {
    return '暂无法估计'
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
  const expected = summary?.profiles?.[operation.profile]?.stages || []
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
  }))
  for (const stage of operation.stageTimings || []) {
    if (!stages.some((item) => item.id === stage.id)) {
      stages.push({
        ...stage,
        label: getQualityGateStageLabel(stage, expected),
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

function renderGovernanceEvidence(row) {
  return (
    <Descriptions size="small" column={1} bordered>
      <Descriptions.Item label="Stable key">
        <Text code>{row.key}</Text>
      </Descriptions.Item>
      <Descriptions.Item label="风险等级">{row.riskLevel}</Descriptions.Item>
      <Descriptions.Item label="适用 profile">
        {row.profiles.join(' / ')}
      </Descriptions.Item>
      <Descriptions.Item label="正式执行入口引用">
        {row.sources.join('；')}
      </Descriptions.Item>
      <Descriptions.Item label="唯一验证记录">{row.evidence}</Descriptions.Item>
      <Descriptions.Item label="失败阻断">{row.blocks}</Descriptions.Item>
      <Descriptions.Item label="中位数">
        {formatQualityGateDuration(row.statistics?.medianDurationMs)}
      </Descriptions.Item>
      <Descriptions.Item label="较慢运行参考">
        {row.statistics?.enoughSamples
          ? formatQualityGateDuration(row.statistics.slowerDurationMs)
          : '暂无足够样本'}
      </Descriptions.Item>
      <Descriptions.Item label="与其他门禁关系">
        {row.relationship}
      </Descriptions.Item>
      <Descriptions.Item label="替代或退出条件">
        {row.exitCondition}
      </Descriptions.Item>
    </Descriptions>
  )
}

function stageShare(stage, operation) {
  const total = operationDuration(operation)
  if (!Number.isFinite(stage.durationMs) || !total) return '—'
  return `${Math.round((stage.durationMs / total) * 100)}%`
}

function longestStageId(stages) {
  return stages.reduce(
    (longest, stage) =>
      (stage.durationMs || 0) > (longest?.durationMs || 0) ? stage : longest,
    null
  )?.id
}

function currentStageLabel(stages) {
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

function ContextStrip({ summary, view, onReturnRun }) {
  const strictOperation = summary?.operations?.find(
    (operation) => operation.profile === 'strict'
  )
  const strictStatus =
    summary?.currentOperation?.profile === 'strict'
      ? `${getQualityGateStatusMeta(summary.currentOperation.status).label} ${formatQualityGateDuration(operationDuration(summary.currentOperation))}`
      : strictOperation
        ? getQualityGateStatusMeta(strictOperation.status).label
        : getQualityGateStatusMeta(summary?.proofs?.strict?.status).label
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
          <dt>严格门禁</dt>
          <dd>{strictStatus || '尚未运行'}</dd>
        </div>
      </dl>
      {view !== 'run' && summary?.currentOperation?.profile === 'strict' ? (
        <Button type="link" onClick={onReturnRun}>
          返回运行
        </Button>
      ) : null}
    </section>
  )
}

function TechnicalDetails({ operation }) {
  if (!operation) return null
  return (
    <details className="erp-dev-quality-technical">
      <summary>查看技术详情</summary>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="Operation ID">
          <Text code copyable>
            {operation.id}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="完整 SHA">
          <Text code copyable>
            {operation.repository.commit}
          </Text>
        </Descriptions.Item>
        <Descriptions.Item label="工作区指纹">
          <Text code>{operation.repository.fingerprint}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="当前 stage id">
          <Text code>{operation.stage}</Text>
        </Descriptions.Item>
        <Descriptions.Item label="验证记录">
          {operation.receipt
            ? `${operation.receipt.executed} 项执行 · ${operation.receipt.passed} 项通过 · ${operation.receipt.failed} 项失败 · ${operation.receipt.skipped} 项跳过`
            : '尚未取得正式回执'}
        </Descriptions.Item>
        <Descriptions.Item label="缓存信息">
          当前正式回执未登记独立缓存指标
        </Descriptions.Item>
        <Descriptions.Item label="清理读回">
          {operation.cleanup.message}
        </Descriptions.Item>
      </Descriptions>
    </details>
  )
}

function StageList({ operation, stages }) {
  const longestId = longestStageId(stages)
  if (stages.length === 0) return <Empty description="尚无阶段记录" />
  return (
    <div className="erp-dev-quality-stage-list" aria-label="门禁阶段进度">
      {stages.map((stage) => {
        const status = STAGE_STATUS[stage.status] || STAGE_STATUS.pending
        return (
          <div className="erp-dev-quality-stage" key={stage.id}>
            <div className="erp-dev-quality-stage__main">
              <Text strong>{stage.label}</Text>
              <Space size={6} wrap>
                <Tag color={status.color}>{status.label}</Tag>
                {longestId === stage.id && stage.durationMs ? (
                  <Tag color="gold">最长阶段</Tag>
                ) : null}
              </Space>
            </div>
            <div className="erp-dev-quality-stage__timing">
              <Text>{formatQualityGateDuration(stage.durationMs)}</Text>
              <Text type="secondary">占比 {stageShare(stage, operation)}</Text>
            </div>
            <details>
              <summary>阶段技术信息</summary>
              <Text code>{stage.id}</Text>
              <Text type="secondary">
                来源：正式 {operation.profile} runner · 缓存：回执未单独登记 ·
                验证记录：本次正式门禁 operation
              </Text>
            </details>
          </div>
        )
      })}
    </div>
  )
}

function RunView({
  summary,
  operation,
  actionProfile,
  onCancel,
  cancelButtonRef,
}) {
  const stages = deriveStages(summary, operation)
  const cancellable =
    operation && ['queued', 'running'].includes(operation.status)
  const progress = stageProgress(stages)
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
                </Space>
                <Paragraph>{operation.message}</Paragraph>
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
                <Text strong>{currentStageLabel(stages)}</Text>
              </div>
              <div>
                <Text type="secondary">预计剩余</Text>
                <Text strong>{estimatedRemaining(summary, operation)}</Text>
              </div>
            </div>
            <Progress
              percent={progress}
              status={operation.status === 'failed' ? 'exception' : 'active'}
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
            <StageList operation={operation} stages={stages} />
            <TechnicalDetails operation={operation} />
          </>
        ) : (
          <Empty description="尚未运行质量门禁。建议先运行严格门禁，确认当前改动是否存在阻断。" />
        )}
      </section>

      <section
        className="erp-dev-quality-history"
        aria-labelledby="quality-history-title"
      >
        <div className="erp-dev-quality-section-heading">
          <Title id="quality-history-title" level={2}>
            最近运行
          </Title>
          <Text type="secondary">每种门禁最多保留最近 20 次脱敏记录</Text>
        </div>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={history}
          columns={historyColumns}
          locale={{ emptyText: '尚无运行记录' }}
          scroll={{ x: 680 }}
        />
      </section>

      <Text type="secondary" className="erp-dev-quality-action-status">
        {actionProfile
          ? `正在启动${PROFILE_LABELS[actionProfile]}`
          : '运行完成后不会自动提交、推送、发布或部署。'}
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const client = useMemo(() => createDevQualityGateClient(), [])
  const titleRef = useRef(null)
  const contentRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const viewValuesRef = useRef({
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
  const [whyOpen, setWhyOpen] = useState(false)

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
    if (!parsed.valid || activeView === 'run') {
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
      contentRef.current?.scrollIntoView({ block: 'start' })
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
    if (activeView !== 'run') setViewRefresh((value) => value + 1)
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
          message.error('质量门禁未能启动，请核对当前状态和一次性数据库环境。')
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

  const selectedOperation = parsed.values.operation
    ? summary?.operations?.find(
        (operation) => operation.id === parsed.values.operation
      )
    : null
  const selectedProfileOperation = parsed.values.profile
    ? summary?.operations?.find(
        (operation) => operation.profile === parsed.values.profile
      )
    : null
  const displayedOperation =
    summary?.currentOperation ||
    selectedOperation ||
    selectedProfileOperation ||
    summary?.operations?.[0] ||
    null
  const busy = summary?.busy?.active || Boolean(actionProfile)
  const canRun = Boolean(
    parsed.valid &&
      summary?.environment?.disposableDatabaseReady &&
      !busy &&
      !initialLoading
  )

  return (
    <div className="erp-dev-quality-gates-page erp-dev-workspace-page">
      <DevPageNav sourcePath={SOURCE_PATH} />
      <header className="erp-dev-quality-header">
        <div>
          <Text className="erp-dev-quality-header__eyebrow">
            本机开发工具 · Fixed quality evidence
          </Text>
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-quality-header__icon" />
            <Title ref={titleRef} tabIndex={-1} level={1}>
              质量门禁
            </Title>
          </Space>
          <Paragraph>
            运行正式 full /
            strict，查看真实阶段与耗时，并判断当前结果能否继续提交或发布。
          </Paragraph>
        </div>
        <Button
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
          type={summary?.status?.tone || 'info'}
          showIcon
          icon={
            summary?.status?.tone === 'success' ? (
              <CheckCircleOutlined />
            ) : summary?.status?.tone === 'error' ? (
              <CloseCircleOutlined />
            ) : (
              <InfoCircleOutlined />
            )
          }
          message={summary?.status?.title || '正在读取当前质量状态'}
          description={
            <Space direction="vertical" size={4}>
              <Text>
                {summary?.status?.description ||
                  '请稍候，页面不会自动执行任何门禁。'}
              </Text>
              {summary?.status?.recommendation ? (
                <Text strong>建议：{summary.status.recommendation}</Text>
              ) : null}
              {summary?.status?.notProven?.length ? (
                <Text type="secondary">
                  尚未证明：{summary.status.notProven.join('、')}
                </Text>
              ) : null}
            </Space>
          }
        />

        <section
          className="erp-dev-quality-actions"
          aria-label="质量门禁主操作"
        >
          <div className="erp-dev-quality-actions__buttons">
            <Button
              type="primary"
              size="large"
              disabled={!canRun}
              loading={actionProfile === 'strict'}
              onClick={() => start('strict')}
            >
              运行严格门禁
            </Button>
            <Button
              size="large"
              disabled={!canRun}
              loading={actionProfile === 'full'}
              onClick={() => start('full')}
            >
              运行完整门禁
            </Button>
            <Button type="link" onClick={() => setWhyOpen(true)}>
              为什么推荐这个门禁
            </Button>
          </div>
          <div className="erp-dev-quality-actions__durations">
            <Text>
              严格门禁：发版前验证 · 最近实际耗时{' '}
              {formatQualityGateDuration(profileDuration(summary, 'strict'))}
            </Text>
            <Text>
              完整门禁：日常完整验证 · 最近实际耗时{' '}
              {formatQualityGateDuration(profileDuration(summary, 'full'))}
            </Text>
          </div>
          {!summary?.environment?.disposableDatabaseReady && !initialLoading ? (
            <Text type="danger">{summary?.environment?.message}</Text>
          ) : null}
        </section>

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
          onReturnRun={() => selectView('run')}
        />

        <section ref={contentRef} className="erp-dev-quality-content">
          <div
            id={`quality-gates-panel-${activeView}`}
            role="tabpanel"
            aria-labelledby={`quality-gates-tab-${activeView}`}
            tabIndex={0}
          >
            {parsed.valid && activeView === 'run' ? (
              <RunView
                summary={summary}
                operation={displayedOperation}
                actionProfile={actionProfile}
                onCancel={cancel}
                cancelButtonRef={cancelButtonRef}
              />
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

      <Drawer
        title="为什么优先推荐严格门禁"
        open={whyOpen}
        onClose={() => setWhyOpen(false)}
        width={480}
      >
        <Paragraph>
          严格门禁在正式 full 主路径前增加工具链、Shell 与 YAML
          检查，并生成绑定当前仓库身份的正式回执；它不会复制第二份测试列表。
        </Paragraph>
        <Paragraph>
          工作区有未提交改动时仍可运行，但该结果只能证明当前工作区，不能作为干净
          exact SHA 的发布证明。
        </Paragraph>
        <Button
          type="link"
          onClick={() => navigate(`${DEV_VERSION_CENTER_ROUTE}?view=pipeline`)}
        >
          查看版本发布边界
        </Button>
      </Drawer>
    </div>
  )
}
