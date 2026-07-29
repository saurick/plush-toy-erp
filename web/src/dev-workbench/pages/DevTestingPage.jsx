import React, { useMemo, useState } from 'react'
import {
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  FileSearchOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Input,
  Progress,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_COVERAGE_ACCEPTANCE_ITEMS,
  DEV_TESTING_COVERAGE_API_PATH,
  DEV_TESTING_COVERAGE_COLLECT_COMMAND,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingDocs,
  buildDevTestingSummary,
  filterDevTestingDocs,
  formatDevTestingCoverageMetric,
  getDevTestingCategoryOptions,
  getDevTestingCoverageStatusMeta,
  normalizeDevTestingCoverageEnvelope,
  parseDevTestingStrategyTiers,
  resolveDevTestingSelectedDoc,
} from '../config/devTesting.mjs'
import {
  createDevCoverageIdempotencyKey,
  createDevCoverageOperationClient,
  getDevCoverageOperationPresentation,
  isDevCoverageOperationActive,
  normalizeOptionalDevCoverageOperation,
} from '../config/devCoverageOperation.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_TIERS = 'tiers'
const VIEW_COMMANDS = 'commands'
const VIEW_DOCS = 'docs'
const VIEW_COVERAGE = 'coverage'
const VIEW_QUERY_KEY = 'view'
const DOC_QUERY_KEY = 'doc'

const VIEW_OPTIONS = [
  { label: '测试分层 / Tiers', value: VIEW_TIERS },
  { label: '命令入口 / Commands', value: VIEW_COMMANDS },
  { label: '相关文档 / Docs', value: VIEW_DOCS },
  { label: '覆盖状态 / Coverage', value: VIEW_COVERAGE },
]
const VIEW_VALUES = new Set(VIEW_OPTIONS.map((option) => option.value))

const COPY_MESSAGE_KEY = 'dev-testing-command-copy'

const markdownModules = import.meta.glob(
  [
    '../../../../README.md',
    '../../../../docs/product/自动化测试策略.md',
    '../../../../docs/部署约定.md',
    '../../../../server/README.md',
    '../../../../server/deploy/README.md',
    '../../../../server/deploy/compose/prod/README.md',
    '../../../../scripts/README.md',
    '../../../../web/README.md',
    '../../../../web/scripts/README.md',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

function MetricTile({ icon, label, value, note, tone = 'default' }) {
  return (
    <div className={`erp-dev-testing-metric erp-dev-testing-metric--${tone}`}>
      <span className="erp-dev-testing-metric__icon">{icon}</span>
      <span className="erp-dev-testing-metric__copy">
        <span className="erp-dev-testing-metric__label">{label}</span>
        <span className="erp-dev-testing-metric__value">{value}</span>
        <span className="erp-dev-testing-metric__note">{note}</span>
      </span>
    </div>
  )
}

function runCopy(text) {
  if (!String(text || '').trim()) {
    message.warning({
      key: COPY_MESSAGE_KEY,
      content: '当前层级没有可复制命令',
    })
    return
  }
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    message.warning({
      key: COPY_MESSAGE_KEY,
      content: '当前浏览器不支持复制',
    })
    return
  }
  navigator.clipboard
    .writeText(text)
    .then(() =>
      message.success({ key: COPY_MESSAGE_KEY, content: '命令已复制' })
    )
    .catch(() =>
      message.error({
        key: COPY_MESSAGE_KEY,
        content: '复制失败，请手动选择命令',
      })
    )
}

function TierCard({ tier }) {
  const hasCopyText = Boolean(tier.copyText)

  return (
    <article className="erp-dev-testing-tier">
      <div className="erp-dev-testing-tier__head">
        <div className="erp-dev-testing-tier__identity">
          <span className="erp-dev-testing-tier__level">{tier.key}</span>
          <span className="erp-dev-testing-tier__title">{tier.level}</span>
        </div>
        <Button
          size="small"
          icon={<CopyOutlined />}
          disabled={!hasCopyText}
          onClick={() => runCopy(tier.copyText)}
        >
          复制
        </Button>
      </div>
      <div className="erp-dev-testing-tier__type">{tier.changeType}</div>
      <p className="erp-dev-testing-tier__desc">{tier.description}</p>
      <div className="erp-dev-testing-command-tags">
        {tier.copyCommands.map((command) => (
          <code key={command}>{command}</code>
        ))}
      </div>
    </article>
  )
}

function QuickPreset({ preset }) {
  return (
    <button
      type="button"
      className="erp-dev-testing-preset"
      onClick={() => runCopy(preset.commands.join('\n'))}
    >
      <span className="erp-dev-testing-preset__head">
        <span className="erp-dev-testing-preset__label">{preset.label}</span>
        <CopyOutlined />
      </span>
      <span className="erp-dev-testing-preset__desc">{preset.description}</span>
    </button>
  )
}

function CommandBlock({ block }) {
  return (
    <article
      className="erp-dev-testing-command-block"
      data-command-lines={block.commands.length}
    >
      <div className="erp-dev-testing-command-block__head">
        <div>
          <Text strong>{block.context || block.title}</Text>
          <div className="erp-dev-testing-command-block__path">
            {block.sourceLabel || block.title || '测试命令来源'}
          </div>
        </div>
        <Button
          size="small"
          icon={<CodeOutlined />}
          onClick={() => runCopy(block.commandText)}
        >
          复制
        </Button>
      </div>
      <pre>
        <code>{block.commandText}</code>
      </pre>
    </article>
  )
}

function TestingDocRow({ doc, active, onSelect }) {
  return (
    <button
      type="button"
      className={
        active
          ? 'erp-dev-testing-doc-row erp-dev-testing-doc-row--active'
          : 'erp-dev-testing-doc-row'
      }
      aria-current={active ? 'true' : undefined}
      onClick={() => onSelect(doc.key)}
    >
      <span className="erp-dev-testing-doc-row__top">
        <span className="erp-dev-testing-doc-row__title">{doc.title}</span>
        <Tag>{doc.category}</Tag>
      </span>
      <span className="erp-dev-testing-doc-row__path">{doc.path}</span>
      <span className="erp-dev-testing-doc-row__meta">
        命令 {doc.commandCount} / 命中 {doc.keywordHits}
      </span>
    </button>
  )
}

function SelectedDocDetail({ doc }) {
  if (!doc) {
    return (
      <div className="erp-dev-testing-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配文档 / No matching docs"
        />
      </div>
    )
  }

  return (
    <section className="erp-dev-testing-doc-detail">
      <div className="erp-dev-testing-doc-detail__head">
        <div>
          <Title level={4}>{doc.title}</Title>
          <Text className="erp-dev-testing-doc-detail__path">{doc.path}</Text>
        </div>
        <Tag>{doc.category}</Tag>
      </div>
      <div className="erp-dev-testing-doc-detail__stats">
        <span>关键词命中 / Hits {doc.keywordHits}</span>
        <span>命令 / Commands {doc.commandCount}</span>
        <span>
          {doc.path === DEV_TESTING_STRATEGY_SOURCE_PATH
            ? '策略真源 / Strategy source'
            : '测试相关 / Test related'}
        </span>
      </div>
      {doc.commandBlocks.length > 0 ? (
        <div className="erp-dev-testing-command-list">
          {doc.commandBlocks.map((block) => (
            <CommandBlock key={block.key} block={block} />
          ))}
        </div>
      ) : (
        <Paragraph className="erp-dev-testing-doc-detail__note">
          该文档没有 fenced command block / no fenced command
          block；更多验证口径请回到正文阅读。
        </Paragraph>
      )}
    </section>
  )
}

const COVERAGE_METRIC_LABELS = Object.freeze({
  statements: 'Statements',
  lines: 'Lines',
  branches: 'Branches',
  functions: 'Functions',
  scenarios: '业务场景',
  modules: '业务模块',
})

const COVERAGE_COUNT_LABELS = Object.freeze({
  total: '总数',
  executed: '已执行',
  passed: '通过',
  failed: '失败',
  skipped: '跳过',
  blocked: '受阻',
  missing: '缺失',
})

function coverageTagColor(tone) {
  if (tone === 'primary') return 'blue'
  if (tone === 'success') return 'green'
  if (tone === 'warning') return 'gold'
  if (tone === 'danger') return 'red'
  return undefined
}

function CoverageStatusTag({ status }) {
  const meta = getDevTestingCoverageStatusMeta(status)
  return (
    <Tag
      className={`erp-dev-testing-coverage-status erp-dev-testing-coverage-status--${meta.tone}`}
      color={coverageTagColor(meta.tone)}
    >
      {meta.label}
    </Tag>
  )
}

function CoverageEvidenceCard({ item }) {
  const metrics = Object.entries(item?.metrics || {})
  const counts = Object.entries(item?.counts || {}).filter(
    ([, value]) => value !== null
  )
  const evidence = Array.isArray(item?.evidence) ? item.evidence : []

  return (
    <article
      className={`erp-dev-testing-coverage-card erp-dev-testing-coverage-card--${item?.status || 'not_collected'}`}
    >
      <div className="erp-dev-testing-coverage-card__head">
        <strong>{item?.label || '未命名证据'}</strong>
        <CoverageStatusTag status={item?.status} />
      </div>
      {metrics.length > 0 ? (
        <div className="erp-dev-testing-coverage-card__metrics">
          {metrics.map(([key, metric]) => (
            <span key={key}>
              <small>{COVERAGE_METRIC_LABELS[key] || key}</small>
              <b>{formatDevTestingCoverageMetric(metric)}</b>
            </span>
          ))}
        </div>
      ) : null}
      {counts.length > 0 ? (
        <div className="erp-dev-testing-coverage-card__counts">
          {counts.map(([key, value]) => (
            <span key={key}>
              {COVERAGE_COUNT_LABELS[key] || key} {value}
            </span>
          ))}
        </div>
      ) : null}
      <p className="erp-dev-testing-coverage-card__note">
        {item?.note ||
          (item?.status === 'not_applicable'
            ? '本轮未受影响，不属于必跑门禁。'
            : item?.status === 'not_collected' || item?.status === 'missing'
              ? '当前报告未采集这一层；空值不是 0%，也不能计为通过。'
              : '报告未提供补充说明。')}
      </p>
      {evidence.length > 0 ? (
        <div className="erp-dev-testing-coverage-card__evidence">
          {evidence.map((entry) => (
            <code key={entry}>{entry}</code>
          ))}
        </div>
      ) : null}
    </article>
  )
}

function CoverageSection({ title, description, status, children }) {
  return (
    <section className="erp-dev-testing-coverage-section">
      <div className="erp-dev-testing-coverage-section__head">
        <div>
          <Title level={3}>{title}</Title>
          {description ? <Paragraph>{description}</Paragraph> : null}
        </div>
        {status ? <CoverageStatusTag status={status} /> : null}
      </div>
      {children}
    </section>
  )
}

function coverageReportAlert(state) {
  if (state?.status === 'current') {
    return {
      type: 'success',
      title: '报告与当前仓库指纹匹配',
      description:
        'Current 只表示报告身份新鲜；各层是否通过仍以本页分项状态为准。空值表示未采集，不是 0%。',
    }
  }
  if (state?.status === 'stale') {
    return {
      type: 'warning',
      title: '覆盖报告已过期',
      description: `${
        state.message || '报告未绑定当前工作区，数值只能作为历史参考。'
      } 空值表示未采集，不是 0%。`,
    }
  }
  if (state?.status === 'failed') {
    return {
      type: 'error',
      title: '覆盖报告读取失败',
      description:
        state.message && state.message !== '覆盖报告读取失败'
          ? `${state.message}；空值表示未采集，不是 0%。`
          : '请检查本地只读报告接口；空值表示未采集，不是 0%。',
    }
  }
  return {
    type: 'info',
    title: '尚未生成覆盖报告',
    description: `${
      state?.message || '当前还没有可展示的覆盖证据'
    }；空值表示未采集，不是 0%。可以直接一键采集；“重新读取”仍只读取本地报告。`,
  }
}

function formatCoverageGeneratedAt(value) {
  if (!value) return '未记录'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function CoverageOperationPanel({ operation, error }) {
  if (!operation && !error) return null
  const presentation = getDevCoverageOperationPresentation(operation)
  const progressStatus = presentation.active
    ? 'active'
    : operation?.status === 'completed' && operation?.outcome === 'passed'
      ? 'success'
      : operation?.status === 'failed'
        ? 'exception'
        : 'normal'
  const tagColor = {
    primary: 'blue',
    success: 'green',
    warning: 'gold',
    danger: 'red',
  }[presentation.tone]

  return (
    <div
      className={`erp-dev-testing-coverage-operation erp-dev-testing-coverage-operation--${presentation.tone}`}
      role="status"
      aria-live="polite"
    >
      <div className="erp-dev-testing-coverage-operation__head">
        <div>
          <Tag color={tagColor}>{presentation.label}</Tag>
          <strong>{presentation.stageLabel}</strong>
        </div>
        {operation?.updatedAt ? (
          <small>{formatCoverageGeneratedAt(operation.updatedAt)}</small>
        ) : null}
      </div>
      <Progress
        percent={presentation.percentage}
        status={progressStatus}
        showInfo={false}
        size="small"
      />
      {operation?.message ? <p>{operation.message}</p> : null}
      {error ? (
        <p className="erp-dev-testing-coverage-operation__error">{error}</p>
      ) : null}
    </div>
  )
}

function CoverageReportView({
  state,
  loading,
  operation,
  operationError,
  operationStarting,
  onCollect,
  onReload,
}) {
  const alert = coverageReportAlert(state)
  const report = state?.report || null
  const operationPresentation =
    getDevCoverageOperationPresentation(operation)
  const repository = report?.repository || {}
  const shortCommit = repository.commit
    ? repository.commit.slice(0, 12)
    : '未记录'

  return (
    <div
      className="erp-dev-testing-coverage-view"
      aria-label="测试覆盖状态"
      aria-busy={loading || operationPresentation.active}
    >
      <div className="erp-dev-testing-coverage-overview">
        <Alert
          showIcon
          type={alert.type}
          message={alert.title}
          description={alert.description}
        />
        <CoverageOperationPanel
          operation={operation}
          error={operationError}
        />
        <div className="erp-dev-testing-coverage-actions">
          <code>{DEV_TESTING_COVERAGE_COLLECT_COMMAND}</code>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={operationStarting || operationPresentation.active}
            disabled={operationPresentation.active}
            onClick={onCollect}
          >
            {operationPresentation.active ? '采集中…' : '一键采集覆盖率'}
          </Button>
          <Button
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={onReload}
          >
            重新读取
          </Button>
          <Button
            icon={<CopyOutlined />}
            onClick={() => runCopy(DEV_TESTING_COVERAGE_COLLECT_COMMAND)}
          >
            复制备用命令
          </Button>
        </div>
        <Paragraph className="erp-dev-testing-coverage-boundary">
          空值表示未采集，不是
          0%。一键采集固定运行真实本地 baseline
          测试并自动聚合报告，但不会执行数据库写入、真实业务浏览器、目标环境部署或客户
          UAT；切换页面不会停止后台任务，“重新读取”只读取本地报告。指标口径不同，不合并为“全系统覆盖率”；skipped、blocked、missing、failed
          和 0 tests executed 均不能算通过。备用命令用于开发接口不可用时手工执行同一采集器。
        </Paragraph>
      </div>

      {loading && !report ? (
        <section
          className="erp-dev-testing-coverage-loading"
          aria-label="覆盖报告加载中"
        >
          <Skeleton active paragraph={{ rows: 8 }} />
        </section>
      ) : null}

      {!loading && !report ? (
        <div className="erp-dev-testing-coverage-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="尚未采集可展示的覆盖证据；空值不是 0% / No coverage evidence collected"
          />
        </div>
      ) : null}

      {report ? (
        <>
          <section className="erp-dev-testing-coverage-identity">
            <span>
              <small>报告状态</small>
              <CoverageStatusTag status={state.status} />
            </span>
            <span>
              <small>生成时间</small>
              <b>{formatCoverageGeneratedAt(report.generatedAt)}</b>
            </span>
            <span>
              <small>Commit</small>
              <code>{shortCommit}</code>
            </span>
            <span>
              <small>工作区</small>
              <b>
                {repository.dirty === null
                  ? '未记录'
                  : repository.dirty
                    ? 'Dirty'
                    : 'Clean'}
              </b>
            </span>
            <span>
              <small>Fingerprint</small>
              <code>{repository.fingerprint || '未记录'}</code>
            </span>
          </section>

          {report.policy.length > 0 ? (
            <CoverageSection
              title="报告策略 / Policy"
              description="只展示报告携带的目标和门禁策略，不由页面推断达标。"
            >
              <div className="erp-dev-testing-coverage-policy-grid">
                {report.policy.map((item) => (
                  <article key={item.key}>
                    <strong>{item.label}</strong>
                    <p>{item.note}</p>
                  </article>
                ))}
              </div>
            </CoverageSection>
          ) : null}

          <CoverageSection
            title="代码覆盖 / Code Coverage"
            description="后端与前端分开统计；空值表示未采集，不是 0%，不显示推测百分比。"
          >
            <div className="erp-dev-testing-coverage-grid erp-dev-testing-coverage-grid--code">
              <CoverageEvidenceCard item={report.codeCoverage.go} />
              <CoverageEvidenceCard item={report.codeCoverage.web} />
            </div>
          </CoverageSection>

          <CoverageSection
            title="业务合同与关键场景 / Business Coverage"
            description="按业务域看适用合同、关键场景和模块覆盖，不以代码行覆盖替代。"
            status={report.businessCoverage.status}
          >
            {report.businessCoverage.domains.length > 0 ? (
              <div className="erp-dev-testing-coverage-grid">
                {report.businessCoverage.domains.map((item) => (
                  <CoverageEvidenceCard key={item.key} item={item} />
                ))}
              </div>
            ) : (
              <CoverageEvidenceCard item={report.businessCoverage} />
            )}
          </CoverageSection>

          <CoverageSection
            title="本轮 T0-T8 门禁 / Required Gates"
            description="只对报告声明的本轮 required gates 判断执行结果；没有回执就是未采集。"
          >
            {report.gates.length > 0 ? (
              <div className="erp-dev-testing-coverage-grid">
                {report.gates.map((item) => (
                  <CoverageEvidenceCard key={item.key} item={item} />
                ))}
              </div>
            ) : (
              <CoverageEvidenceCard
                item={{
                  label: 'T0-T8',
                  status: 'not_collected',
                  metrics: {},
                  counts: {},
                  evidence: [],
                }}
              />
            )}
          </CoverageSection>

          <CoverageSection
            title="运行态与验收 / Runtime & Acceptance"
            description="PostgreSQL、浏览器、readiness、目标环境与 UAT 各自独立，不由本地绿色替代。"
          >
            <div className="erp-dev-testing-coverage-grid">
              {DEV_TESTING_COVERAGE_ACCEPTANCE_ITEMS.map(({ key }) => (
                <CoverageEvidenceCard key={key} item={report.acceptance[key]} />
              ))}
            </div>
          </CoverageSection>
        </>
      ) : null}
    </div>
  )
}

export default function DevTestingPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const coverageRequestSequence = React.useRef(0)
  const coverageStartInFlight = React.useRef(false)
  const coverageIdempotencyKey = React.useRef('')
  const handledCoverageTerminal = React.useRef('')
  const [coverageReloadKey, setCoverageReloadKey] = useState(0)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageState, setCoverageState] = useState(null)
  const [coverageOperation, setCoverageOperation] = useState(null)
  const [coverageOperationError, setCoverageOperationError] = useState('')
  const [coverageOperationStarting, setCoverageOperationStarting] =
    useState(false)
  const coverageOperationClient = useMemo(
    () => createDevCoverageOperationClient(),
    []
  )
  const docs = useMemo(() => buildDevTestingDocs(markdownModules), [])
  const strategySource =
    docs.find((item) => item.path === DEV_TESTING_STRATEGY_SOURCE_PATH)
      ?.source || ''
  const tiers = useMemo(
    () => parseDevTestingStrategyTiers(strategySource),
    [strategySource]
  )
  const summary = useMemo(
    () => buildDevTestingSummary({ tiers, docs }),
    [docs, tiers]
  )
  const categoryOptions = useMemo(
    () => getDevTestingCategoryOptions(docs),
    [docs]
  )
  const requestedView = searchParams.get(VIEW_QUERY_KEY) || ''
  const view = VIEW_VALUES.has(requestedView) ? requestedView : VIEW_TIERS
  const isCoverageView = view === VIEW_COVERAGE
  const [keyword, setKeyword] = useState('')
  const [category, setCategory] = useState('all')
  const filteredDocs = useMemo(
    () => filterDevTestingDocs(docs, { keyword, category }),
    [category, docs, keyword]
  )
  const requestedDocKey = searchParams.get(DOC_QUERY_KEY) || ''
  const requestedDoc = resolveDevTestingSelectedDoc(docs, requestedDocKey)
  const selectedDoc = resolveDevTestingSelectedDoc(
    filteredDocs,
    requestedDoc?.key || ''
  )
  const canonicalDocKey = selectedDoc?.key || requestedDoc?.key || ''
  const allCommandBlocks = filteredDocs.flatMap((doc) => doc.commandBlocks)
  const coverageOperationId = coverageOperation?.id || ''
  const coverageOperationIsActive =
    isDevCoverageOperationActive(coverageOperation)

  React.useEffect(() => {
    if (!isCoverageView) return undefined

    const controller = new AbortController()
    const requestSequence = coverageRequestSequence.current + 1
    coverageRequestSequence.current = requestSequence
    setCoverageLoading(true)

    const loadCoverage = async () => {
      try {
        const response = await fetch(DEV_TESTING_COVERAGE_API_PATH, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal,
        })
        let payload = null
        try {
          payload = await response.json()
        } catch (_error) {
          payload = {
            status: response.ok ? 'failed' : undefined,
            message: '覆盖报告接口没有返回有效 JSON',
          }
        }
        if (
          controller.signal.aborted ||
          requestSequence !== coverageRequestSequence.current
        ) {
          return
        }
        setCoverageState(
          normalizeDevTestingCoverageEnvelope(payload, {
            httpStatus: response.status,
          })
        )
        const incomingOperation = normalizeOptionalDevCoverageOperation(
          payload?.operation
        )
        setCoverageOperation((current) => {
          if (
            isDevCoverageOperationActive(current) &&
            (!incomingOperation ||
              incomingOperation.id !== current.id ||
              incomingOperation.revision < current.revision)
          ) {
            return current
          }
          return incomingOperation
        })
      } catch (_error) {
        if (
          controller.signal.aborted ||
          requestSequence !== coverageRequestSequence.current
        ) {
          return
        }
        setCoverageState(
          normalizeDevTestingCoverageEnvelope(
            {
              status: 'failed',
              message: '覆盖报告读取失败，请检查本地开发接口',
            },
            { httpStatus: 500 }
          )
        )
      } finally {
        if (
          !controller.signal.aborted &&
          requestSequence === coverageRequestSequence.current
        ) {
          setCoverageLoading(false)
        }
      }
    }

    loadCoverage()
    return () => controller.abort()
  }, [coverageReloadKey, isCoverageView])

  const handleCoverageTerminal = React.useCallback((operation) => {
    if (!operation || isDevCoverageOperationActive(operation)) return
    const terminalKey = `${operation.id}:${operation.revision}`
    if (handledCoverageTerminal.current === terminalKey) return
    handledCoverageTerminal.current = terminalKey
    coverageIdempotencyKey.current = ''
    setCoverageReloadKey((current) => current + 1)
    if (operation.status === 'completed' && operation.outcome === 'passed') {
      message.success({ content: operation.message, key: 'coverage-collect' })
    } else if (operation.status === 'completed') {
      message.warning({ content: operation.message, key: 'coverage-collect' })
    } else if (operation.status === 'failed') {
      message.error({ content: operation.message, key: 'coverage-collect' })
    } else {
      message.warning({ content: operation.message, key: 'coverage-collect' })
    }
  }, [])

  React.useEffect(() => {
    if (!isCoverageView || !coverageOperationIsActive) {
      return undefined
    }
    const operationId = coverageOperationId
    const controller = new AbortController()
    let timer = null

    const poll = async () => {
      try {
        const nextOperation = await coverageOperationClient.read(operationId, {
          signal: controller.signal,
        })
        if (controller.signal.aborted) return
        setCoverageOperation((current) =>
          current?.id === nextOperation.id &&
          current.revision > nextOperation.revision
            ? current
            : nextOperation
        )
        setCoverageOperationError('')
        if (isDevCoverageOperationActive(nextOperation)) {
          timer = window.setTimeout(poll, 1200)
        } else {
          handleCoverageTerminal(nextOperation)
        }
      } catch (_error) {
        if (controller.signal.aborted) return
        setCoverageOperationError(
          '进度读取暂时失败，后台任务可能仍在执行；请勿重复发起采集。'
        )
        timer = window.setTimeout(poll, 1800)
      }
    }

    timer = window.setTimeout(poll, 800)
    return () => {
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [
    coverageOperationId,
    coverageOperationIsActive,
    coverageOperationClient,
    handleCoverageTerminal,
    isCoverageView,
  ])

  React.useEffect(() => {
    if (requestedView === view && requestedDocKey === canonicalDocKey) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(VIEW_QUERY_KEY, view)
    if (canonicalDocKey) {
      nextParams.set(DOC_QUERY_KEY, canonicalDocKey)
    } else {
      nextParams.delete(DOC_QUERY_KEY)
    }
    setSearchParams(nextParams, { replace: true })
  }, [
    canonicalDocKey,
    requestedDocKey,
    requestedView,
    searchParams,
    setSearchParams,
    view,
  ])

  const selectView = (nextView) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(
      VIEW_QUERY_KEY,
      VIEW_VALUES.has(nextView) ? nextView : VIEW_TIERS
    )
    setSearchParams(nextParams)
  }

  const selectDoc = (nextDocKey) => {
    const nextParams = new URLSearchParams(searchParams)
    const nextDoc = resolveDevTestingSelectedDoc(docs, nextDocKey)
    if (nextDoc?.key) {
      nextParams.set(DOC_QUERY_KEY, nextDoc.key)
    } else {
      nextParams.delete(DOC_QUERY_KEY)
    }
    setSearchParams(nextParams)
  }

  const reloadCoverage = () => {
    setCoverageReloadKey((current) => current + 1)
  }

  const collectCoverage = async () => {
    if (
      coverageStartInFlight.current ||
      isDevCoverageOperationActive(coverageOperation)
    ) {
      return
    }
    coverageStartInFlight.current = true
    setCoverageOperationStarting(true)
    setCoverageOperationError('')
    handledCoverageTerminal.current = ''
    try {
      if (!coverageIdempotencyKey.current) {
        coverageIdempotencyKey.current = createDevCoverageIdempotencyKey()
      }
      const operation = await coverageOperationClient.start(
        coverageIdempotencyKey.current
      )
      setCoverageOperation(operation)
      if (!isDevCoverageOperationActive(operation)) {
        handleCoverageTerminal(operation)
      }
    } catch (_error) {
      setCoverageOperationError(
        '采集请求暂时未确认；再次点击会复用同一请求，不会重复启动测试。'
      )
      message.error({
        content: '一键采集暂时无法确认，请检查本地开发服务',
        key: 'coverage-collect',
      })
    } finally {
      coverageStartInFlight.current = false
      setCoverageOperationStarting(false)
    }
  }

  const coverageOperationPresentation =
    getDevCoverageOperationPresentation(coverageOperation)
  const coverageToolbarText = coverageOperationPresentation.active
    ? coverageOperationPresentation.stageLabel
    : coverageLoading
    ? '正在读取本地覆盖报告…'
    : coverageState?.report
      ? `${coverageState.report.generatedAt || '生成时间未记录'} · ${
          coverageState.report.repository.commit?.slice(0, 12) ||
          'commit 未记录'
        }`
      : getDevTestingCoverageStatusMeta(coverageState?.status).label

  return (
    <div className="erp-dev-testing-page erp-dev-workspace-page">
      <DevPageNav
        sourcePath={
          isCoverageView
            ? DEV_TESTING_STRATEGY_SOURCE_PATH
            : selectedDoc?.path || DEV_TESTING_STRATEGY_SOURCE_PATH
        }
      />
      <header className="erp-dev-testing-header">
        <div className="erp-dev-testing-header__copy">
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-testing-header__icon" />
            <Title level={1} className="erp-dev-testing-title">
              开发测试入口 / Dev Test Entry
            </Title>
          </Space>
          <Paragraph className="erp-dev-testing-summary">
            读取当前测试策略、QA 脚本和部署 / 前后端说明；index current
            validation tiers and executable command references.
          </Paragraph>
        </div>
        <div className="erp-dev-testing-header__stats">
          <MetricTile
            icon={<CheckCircleOutlined />}
            label="测试层级 / Tiers"
            value={summary.tierCount}
            note="来自自动化测试策略"
            tone="primary"
          />
          <MetricTile
            icon={<FileSearchOutlined />}
            label="相关文档 / Docs"
            value={summary.docCount}
            note={`${summary.docsWithCommands} 篇含命令`}
          />
          <MetricTile
            icon={<CodeOutlined />}
            label="命令行 / Commands"
            value={summary.commandCount}
            note={`${summary.strategyCommandCount} 条来自策略`}
          />
        </div>
      </header>

      <main
        className={`erp-dev-testing-shell${
          isCoverageView ? ' erp-dev-testing-shell--coverage' : ''
        }`}
      >
        {!isCoverageView ? (
          <aside className="erp-dev-testing-sidebar">
            <Input
              allowClear
              className="erp-dev-testing-search"
              placeholder="搜索文档、命令、验收词"
              prefix={<SearchOutlined aria-hidden="true" />}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <div className="erp-dev-testing-filter" aria-label="文档分类筛选">
              {categoryOptions.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={
                    option.value === category
                      ? 'erp-dev-testing-filter__item erp-dev-testing-filter__item--active'
                      : 'erp-dev-testing-filter__item'
                  }
                  aria-pressed={option.value === category}
                  onClick={() => setCategory(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="erp-dev-testing-doc-list" aria-label="测试相关文档">
              {filteredDocs.map((doc) => (
                <TestingDocRow
                  key={doc.key}
                  doc={doc}
                  active={doc.key === selectedDoc?.key}
                  onSelect={selectDoc}
                />
              ))}
            </div>
          </aside>
        ) : null}

        <section className="erp-dev-testing-reader">
          <div className="erp-dev-testing-reader__toolbar">
            <Segmented
              options={VIEW_OPTIONS}
              value={view}
              onChange={selectView}
            />
            <Text type="secondary">
              {isCoverageView
                ? coverageToolbarText
                : selectedDoc?.path || '无匹配文档 / No matching docs'}
            </Text>
          </div>

          {view === VIEW_TIERS ? (
            <div className="erp-dev-testing-tier-view">
              <div
                className="erp-dev-testing-presets"
                aria-label="常用测试命令预设"
              >
                {DEV_TESTING_COPY_PRESETS.map((preset) => (
                  <QuickPreset key={preset.key} preset={preset} />
                ))}
              </div>
              <div className="erp-dev-testing-tier-grid">
                {tiers.map((tier) => (
                  <TierCard key={tier.key} tier={tier} />
                ))}
              </div>
            </div>
          ) : null}

          {view === VIEW_COMMANDS ? (
            <div className="erp-dev-testing-command-list">
              {allCommandBlocks.length > 0 ? (
                allCommandBlocks.map((block) => (
                  <CommandBlock key={block.key} block={block} />
                ))
              ) : (
                <div className="erp-dev-testing-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="当前筛选没有命令块 / No command blocks"
                  />
                </div>
              )}
            </div>
          ) : null}

          {view === VIEW_DOCS ? <SelectedDocDetail doc={selectedDoc} /> : null}

          {view === VIEW_COVERAGE ? (
            <CoverageReportView
              state={coverageState}
              loading={coverageLoading}
              operation={coverageOperation}
              operationError={coverageOperationError}
              operationStarting={coverageOperationStarting}
              onCollect={collectCoverage}
              onReload={reloadCoverage}
            />
          ) : null}
        </section>
      </main>
    </div>
  )
}
