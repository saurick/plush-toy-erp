import React, { useMemo, useState } from 'react'
import {
  CodeOutlined,
  CopyOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Pagination,
  Progress,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SearchInput from '@/common/components/SearchInput'
import { message } from '@/common/utils/antdApp'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevPressurePanel from '../components/DevPressurePanel.jsx'
import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_COMMAND_PAGE_QUERY_KEY,
  DEV_TESTING_COMMAND_PAGE_SIZE,
  DEV_TESTING_COVERAGE_ACCEPTANCE_ITEMS,
  DEV_TESTING_COVERAGE_API_PATH,
  DEV_TESTING_COVERAGE_SNAPSHOT_API_PATH,
  DEV_TESTING_COVERAGE_COLLECT_COMMAND,
  DEV_TESTING_COVERAGE_SECTION_QUERY_KEY,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingDocs,
  buildDevTestingCommandPage,
  buildDevTestingSummary,
  buildDevTestingCoverageSectionSummaries,
  filterDevTestingCommandBlocks,
  filterDevTestingDocs,
  formatDevTestingCoverageMetric,
  getDevTestingDocumentRoleOptions,
  getDevTestingCoverageStatusMeta,
  normalizeDevTestingCoverageEnvelope,
  normalizeDevTestingCoverageSnapshot,
  parseDevTestingStrategyTiers,
  parseDevTestingCoverageSection,
} from '../config/devTesting.mjs'
import {
  DEV_BUSINESS_USABILITY_ROUTE,
  DEV_DELIVERY_ROUTE,
  DEV_DOCS_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
} from '../config/devRoutes.mjs'
import {
  createDevCoverageIdempotencyKey,
  createDevCoverageOperationClient,
  getDevCoverageOperationPresentation,
  isDevCoverageOperationActive,
  normalizeOptionalDevCoverageOperation,
} from '../config/devCoverageOperation.mjs'
import { formatDevTimestamp } from '../config/devTimestamp.mjs'
import {
  DEV_TESTING_GIT_CLOSEOUT_STAGES,
  DEV_TESTING_GIT_HOOK_PATH_COMMAND,
  DEV_TESTING_FIXED_ACTIONS,
  DEV_TESTING_PREPARE_PUSH_COMMAND,
  createDevTestingIdempotencyKey,
  createDevTestingOperationClient,
  getDevTestingGitHookStatusMeta,
  getDevTestingOperationPresentation,
  isDevTestingOperationActive,
} from '../config/devTestingOperation.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_TIERS = 'tiers'
const VIEW_COMMANDS = 'commands'
const VIEW_CLOSEOUT = 'closeout'
const VIEW_COVERAGE = 'coverage'
const VIEW_PRESSURE = 'pressure'
const VIEW_QUERY_KEY = 'view'
const DOCUMENT_ROLE_QUERY_KEY = 'role'
const COMMAND_QUERY_KEY = 'q'

const VIEW_OPTIONS = [
  { label: '本轮验证', value: VIEW_TIERS },
  { label: '证据与覆盖', value: VIEW_COVERAGE },
  { label: '压力测试', value: VIEW_PRESSURE },
]
const AUXILIARY_VIEW_VALUES = new Set([VIEW_COMMANDS, VIEW_CLOSEOUT])
const VIEW_VALUES = new Set([
  ...VIEW_OPTIONS.map((option) => option.value),
  ...AUXILIARY_VIEW_VALUES,
])

const COPY_MESSAGE_KEY = 'dev-testing-command-copy'
const EMPTY_TESTING_OPERATIONS = Object.freeze({
  fast: null,
  'role-access': null,
  'field-linkage': null,
  'pressure-quick': null,
  'pressure-capacity': null,
})

const markdownModules = import.meta.glob(
  [
    '../../../../README.md',
    '../../../../docs/product/自动化测试策略.md',
    '../../../../docs/部署约定.md',
    '../../../../server/README.md',
    '../../../../server/deploy/README.md',
    '../../../../server/deploy/compose/prod/README.md',
    '../../../../scripts/README.md',
    '../../../../scripts/qa/README.md',
    '../../../../web/README.md',
    '../../../../web/scripts/README.md',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

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

function CommandBlock({ block, onOpenSource }) {
  return (
    <article
      className="erp-dev-testing-command-block"
      data-command-lines={block.commands.length}
    >
      <div className="erp-dev-testing-command-block__purpose">
        <Text strong>{block.context || block.title}</Text>
        <span>解决什么问题</span>
      </div>
      <div className="erp-dev-testing-command-block__source">
        <span>当前来源</span>
        <div className="erp-dev-testing-command-block__path">
          {block.sourceLabel || block.title || '测试命令来源'}
        </div>
      </div>
      <div className="erp-dev-testing-command-block__scope">
        <strong>{block.commands.length} 条固定命令</strong>
        <span>结果以命令回执和来源合同分别判断</span>
      </div>
      <div className="erp-dev-testing-command-block__actions">
        <Space size={8} wrap>
          <Button
            size="small"
            icon={<FileTextOutlined />}
            aria-label={`打开来源文档 ${block.sourcePath}`}
            onClick={() => onOpenSource(block.sourcePath)}
          >
            来源文档
          </Button>
          <Button
            size="small"
            icon={<CodeOutlined />}
            onClick={() => runCopy(block.commandText)}
          >
            复制
          </Button>
        </Space>
      </div>
      <details className="erp-dev-testing-command-block__details">
        <summary>查看固定命令</summary>
        <pre>
          <code>{block.commandText}</code>
        </pre>
      </details>
    </article>
  )
}

function CommandLibraryGuide() {
  return (
    <section
      className="erp-dev-testing-command-guide"
      aria-labelledby="command-library-guide-title"
    >
      <div>
        <Text className="erp-dev-testing-validation__eyebrow">
          三步定位，不通读命令墙
        </Text>
        <Title level={2} id="command-library-guide-title">
          专项检查库
        </Title>
      </div>
      <ol>
        <li>
          <b>1</b>
          <span>
            <strong>搜索问题</strong>
            <small>按命令、来源或验收词定位</small>
          </span>
        </li>
        <li>
          <b>2</b>
          <span>
            <strong>筛选职责</strong>
            <small>只保留当前来源类型</small>
          </span>
        </li>
        <li>
          <b>3</b>
          <span>
            <strong>打开或复制</strong>
            <small>先看用途，需要时展开命令</small>
          </span>
        </li>
      </ol>
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
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const scenarios = item?.scenarios || []
  const visibleScenarios = onlyIncomplete
    ? scenarios.filter((scenario) => scenario.status !== 'passed')
    : scenarios
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
      <div className="erp-dev-testing-coverage-card__reading">
        {metrics.length > 0 ? (
          <div className="erp-dev-testing-coverage-card__metrics">
            {metrics.map(([key, metric]) => (
              <span key={key}>
                <small>{COVERAGE_METRIC_LABELS[key] || key}</small>
                <b>{formatDevTestingCoverageMetric(metric)}</b>
                {metric.collected && metric.percentage !== null ? (
                  <Progress
                    percent={metric.percentage}
                    size="small"
                    showInfo={false}
                  />
                ) : null}
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
        {metrics.length === 0 && counts.length === 0 ? (
          <span className="erp-dev-testing-coverage-card__no-reading">
            未提供数值；以当前状态和说明判断
          </span>
        ) : null}
      </div>
      <div className="erp-dev-testing-coverage-card__conclusion">
        <p className="erp-dev-testing-coverage-card__note">
          {item?.note ||
            (item?.status === 'not_applicable'
              ? '本轮未受影响，不属于必跑门禁。'
              : item?.status === 'not_collected' || item?.status === 'missing'
                ? '当前报告未采集这一层；空值不是 0%，也不能计为通过。'
                : '报告未提供补充说明。')}
        </p>
        {evidence.length > 0 ? (
          <details className="erp-dev-testing-coverage-card__details">
            <summary>查看 {evidence.length} 条证据</summary>
            <div className="erp-dev-testing-coverage-card__evidence">
              {evidence.map((entry) => (
                <code key={entry}>{entry}</code>
              ))}
            </div>
          </details>
        ) : (
          <small className="erp-dev-testing-coverage-card__no-evidence">
            没有附加证据路径
          </small>
        )}
      </div>
      {scenarios.length > 0 ? (
        <details
          className="erp-dev-testing-coverage-scenarios"
          open={
            item.key === 'go' && item.status === 'failed' ? true : undefined
          }
        >
          <summary>查看 {scenarios.length} 个场景明细</summary>
          <Checkbox
            checked={onlyIncomplete}
            onChange={(event) => setOnlyIncomplete(event.target.checked)}
          >
            仅看未通过场景
          </Checkbox>
          {visibleScenarios.length > 0 ? (
            <div className="erp-dev-testing-coverage-scenarios__table">
              <table>
                <thead>
                  <tr>
                    <th>规则 / 场景</th>
                    <th>结果</th>
                    <th>执行记录</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleScenarios.map((scenario) => (
                    <tr key={scenario.key}>
                      <td>
                        <strong>{scenario.label}</strong>
                        {scenario.note ? <p>{scenario.note}</p> : null}
                      </td>
                      <td>
                        <CoverageStatusTag status={scenario.status} />
                      </td>
                      <td>
                        <details>
                          <summary>
                            {scenario.matchedTests.length} 条记录
                          </summary>
                          {scenario.package ? (
                            <code>{scenario.package}</code>
                          ) : null}
                          <ul>
                            {scenario.matchedTests.map((test) => (
                              <li key={test}>
                                <code>{test}</code>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>没有未通过场景。</p>
          )}
        </details>
      ) : null}
    </article>
  )
}

function CoverageSection({
  title,
  description,
  status,
  matrix = true,
  children,
}) {
  return (
    <section className="erp-dev-testing-coverage-section">
      <div className="erp-dev-testing-coverage-section__head">
        <div>
          <Title level={3}>{title}</Title>
          {description ? <Paragraph>{description}</Paragraph> : null}
        </div>
        {status ? <CoverageStatusTag status={status} /> : null}
      </div>
      {matrix ? (
        <div className="erp-dev-testing-coverage-matrix__head" aria-hidden>
          <span>检查项与状态</span>
          <span>本次读数</span>
          <span>结论与证据</span>
        </div>
      ) : null}
      {children}
    </section>
  )
}

function GitHookStatusTag({ status }) {
  const meta = getDevTestingGitHookStatusMeta(status)
  return <Tag color={coverageTagColor(meta.tone)}>{meta.label}</Tag>
}

function getGitStageWiring(stage, hooks) {
  const checks = (hooks?.checks || []).filter((check) =>
    stage.sources.includes(check.sourcePath)
  )
  const readyCount = checks.filter((check) => check.status === 'ready').length
  const firstIssue = checks.find((check) => check.status !== 'ready')
  return {
    checkCount: checks.length,
    readyCount,
    status:
      checks.length > 0 && readyCount === checks.length
        ? 'ready'
        : firstIssue?.status || 'invalid',
  }
}

function GitCloseoutView({ hooks, loading, error, onReload }) {
  const readyCount =
    hooks?.checks?.filter((check) => check.status === 'ready').length || 0
  const checkCount = hooks?.checks?.length || 0
  const ready = hooks?.status === 'ready'

  return (
    <div
      className="erp-dev-testing-closeout-view"
      aria-label="Git Hook 与推送收口治理"
      aria-busy={loading}
    >
      <div className="erp-dev-testing-closeout-heading">
        <div>
          <Text className="erp-dev-testing-validation__eyebrow">
            自动守住机械边界
          </Text>
          <Title level={2}>Git 收口</Title>
          <Paragraph>
            看清每一道检查何时触发、证明什么，再决定是否进入提交或推送。
          </Paragraph>
        </div>
        <Tag>只读接线检查</Tag>
      </div>

      {loading ? (
        <div className="erp-dev-testing-closeout-loading">
          <Skeleton active paragraph={{ rows: 3 }} />
        </div>
      ) : null}

      {!loading && error ? (
        <Alert
          showIcon
          type="error"
          message="暂时无法读取 Hook 接线"
          description={`${error} 页面不会据此推断提交或推送已经安全。`}
          action={
            <Button icon={<ReloadOutlined />} onClick={onReload}>
              重新读取
            </Button>
          }
        />
      ) : null}

      {!loading && !error && hooks ? (
        <>
          <Alert
            showIcon
            type={ready ? 'success' : 'warning'}
            message={ready ? 'Hook 接线完整' : 'Hook 接线未完整'}
            description={`${readyCount}/${checkCount} 项接线完整；当前 core.hooksPath：${hooks.configuredHooksPath}。这只证明入口与可执行权限，不代表任何门禁已经运行。`}
            action={
              <Button icon={<ReloadOutlined />} onClick={onReload}>
                重新读取
              </Button>
            }
          />

          <section
            className="erp-dev-testing-closeout-section"
            aria-labelledby="git-closeout-flow-title"
          >
            <div className="erp-dev-testing-closeout-section__head">
              <div>
                <Title level={3} id="git-closeout-flow-title">
                  四道收口检查
                </Title>
                <Paragraph>从暂存快照到推送前复核，前后职责不重叠。</Paragraph>
              </div>
              <Text type="secondary">按触发顺序阅读</Text>
            </div>
            <ol className="erp-dev-testing-closeout-steps">
              {DEV_TESTING_GIT_CLOSEOUT_STAGES.map((stage, index) => {
                const wiring = getGitStageWiring(stage, hooks)
                return (
                  <li key={stage.key} data-stage={stage.key}>
                    <span className="erp-dev-testing-closeout-step__number">
                      {index + 1}
                    </span>
                    <div className="erp-dev-testing-closeout-step__copy">
                      <div className="erp-dev-testing-closeout-step__title">
                        <Title level={4}>{stage.label}</Title>
                        <GitHookStatusTag status={wiring.status} />
                      </div>
                      <Tag className="erp-dev-testing-closeout-step__trigger">
                        {stage.trigger}
                      </Tag>
                      <p>{stage.description}</p>
                      <div className="erp-dev-testing-closeout-step__wiring">
                        <span>当前接线</span>
                        <strong>
                          {wiring.readyCount}/{wiring.checkCount} 项完整
                        </strong>
                      </div>
                      <details className="erp-dev-testing-closeout-step__details">
                        <summary>查看边界与来源</summary>
                        <small>{stage.boundary}</small>
                        <div className="erp-dev-testing-closeout-step__sources">
                          {stage.sources.map((sourcePath) => (
                            <code key={sourcePath}>{sourcePath}</code>
                          ))}
                        </div>
                      </details>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          <section
            className="erp-dev-testing-closeout-section"
            aria-labelledby="git-hook-wiring-title"
          >
            <div className="erp-dev-testing-closeout-section__head">
              <div>
                <Title level={3} id="git-hook-wiring-title">
                  当前接线
                </Title>
                <Paragraph>
                  缺失、不可执行或未接入都会单独显示，不用颜色代替结论。
                </Paragraph>
              </div>
              <Text type="secondary">期望目录 {hooks.expectedHooksPath}</Text>
            </div>
            <div className="erp-dev-testing-hook-list__head" aria-hidden>
              <span>入口与实现</span>
              <span>当前接线</span>
            </div>
            <div className="erp-dev-testing-hook-list" role="list">
              {hooks.checks.map((check) => (
                <div
                  className="erp-dev-testing-hook-row"
                  role="listitem"
                  key={check.key}
                >
                  <div>
                    <strong>{check.label}</strong>
                    <code>{check.sourcePath}</code>
                  </div>
                  <GitHookStatusTag status={check.status} />
                </div>
              ))}
            </div>
          </section>

          <details className="erp-dev-testing-closeout-command-disclosure">
            <summary>
              <span>
                <strong>需要时再复制</strong>
                <small>
                  页面只复制仓库固定命令，不执行、不暂存、不提交，也不推送。
                </small>
              </span>
              <span>2 条固定命令</span>
            </summary>
            <div className="erp-dev-testing-closeout-commands">
              <article>
                <div>
                  <strong>核对 Hook 目录</strong>
                  <code>{DEV_TESTING_GIT_HOOK_PATH_COMMAND}</code>
                </div>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => runCopy(DEV_TESTING_GIT_HOOK_PATH_COMMAND)}
                >
                  复制核对命令
                </Button>
              </article>
              <article>
                <div>
                  <strong>准备推送门禁</strong>
                  <code>{DEV_TESTING_PREPARE_PUSH_COMMAND}</code>
                </div>
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => runCopy(DEV_TESTING_PREPARE_PUSH_COMMAND)}
                >
                  复制准备命令
                </Button>
              </article>
            </div>
          </details>

          <Alert
            showIcon
            type="info"
            message="提交、推送与发布仍是独立动作"
            description="接线完整、Hook 通过或 prepare-push 有回执，都不能自动取得 Git 写入、远端推送、部署或客户验收授权。"
          />
        </>
      ) : null}
    </div>
  )
}

function coverageReportAlert(state) {
  if (state?.status === 'snapshot') {
    return {
      type: 'info',
      title: '正在查看最近一次隔离验证',
      description:
        '结果仅对应下方记录的源码快照；当前工作区、提交后 CI 和目标环境仍需各自核验。',
    }
  }
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
    }；空值表示未采集，不是 0%。请在代码基本稳定的检查点采集本地覆盖基线；“重新读取”仍只读取本地报告。`,
  }
}

function operationUpdateAction(operation) {
  return operation?.finishedAt ? '完成于' : '更新于'
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
        {operation ? (
          <Space direction="vertical" size={2}>
            <DevTimestamp
              value={operation?.createdAt}
              action="开始于"
              missing="开始时间未证明"
            />
            <DevTimestamp
              value={operation.finishedAt || operation.updatedAt}
              action={operationUpdateAction(operation)}
              missing="更新时间未证明"
            />
          </Space>
        ) : null}
      </div>
      <Progress
        percent={presentation.percentage}
        status={progressStatus}
        showInfo={false}
        size="small"
      />
      {operation?.message ? <p>{operation.message}</p> : null}
      {operation?.events?.length ? (
        <details>
          <summary>查看 {operation.events.length} 条采集事件</summary>
          <ol>
            {operation.events.map((event, index) => (
              <li key={`${event.at}:${event.stage}:${index}`}>
                <DevTimestamp value={event.at} missing="事件时间未证明" />
                {' · '}
                {event.message}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      {error ? (
        <p className="erp-dev-testing-coverage-operation__error">{error}</p>
      ) : null}
    </div>
  )
}

function ValidationPlanPanel({ plan, loading, error, busy, onGenerate }) {
  const shortCommit = plan?.repository?.commit?.slice(0, 12) || '未生成'
  return (
    <section className="erp-dev-testing-validation-plan">
      <div className="erp-dev-testing-validation-plan__head">
        <div>
          <Title level={3}>验证计划</Title>
          <Paragraph>
            只读分析当前改动，给出建议检查和待补证据；不会运行测试或写入数据。
          </Paragraph>
        </div>
        <Button
          type="primary"
          icon={<FileSearchOutlined />}
          loading={loading}
          onClick={onGenerate}
        >
          {plan ? '重新生成计划' : '生成本轮验证计划'}
        </Button>
      </div>
      {busy?.active ? (
        <Alert
          showIcon
          type="info"
          message="已有本地 QA 任务正在运行"
          description={`当前类型：${
            busy.kind === 'coverage' ? '覆盖基线' : '固定验证'
          } · ${busy.profile}。计划仍可只读生成，但新的执行动作会保持禁用。`}
        />
      ) : null}
      {error ? <Alert showIcon type="error" message={error} /> : null}
      {plan ? (
        <div className="erp-dev-testing-validation-plan__body">
          <div
            className="erp-dev-testing-validation-plan__map"
            role="list"
            aria-label="改动到验证建议的映射"
          >
            <span role="listitem">
              <small>改动输入</small>
              <b>{plan.changedCount} 个文件</b>
              <em>读取当前工作区</em>
            </span>
            <span role="listitem">
              <small>建议范围</small>
              <b>{plan.affectedScopes.join(' · ')}</b>
              <em>T0–T8 只表示选测范围</em>
            </span>
            <span role="listitem">
              <small>后续判断</small>
              <b>
                {plan.commands.length} 项命令 · {plan.followUps.length} 项补证
              </b>
              <em>每项证据分别收口</em>
            </span>
          </div>
          {plan.localGate === 'full' ? (
            <Alert
              showIcon
              type="warning"
              message="当前改动需要完整门禁"
              description="计划只说明选择结果，不会替你执行 full、数据库、浏览器、发布或 UAT。"
            />
          ) : null}
          <details className="erp-dev-testing-validation-plan__details">
            <summary>查看建议命令、待补证据与计划身份</summary>
            <div className="erp-dev-testing-validation-plan__identity">
              <span>
                <small>最广受影响范围</small>
                <b>{plan.maxAffectedScope}</b>
              </span>
              <span>
                <small>仓库身份</small>
                <code>
                  {shortCommit} ·{' '}
                  {plan.repository.dirty ? '有未提交改动' : '干净现场'}
                </code>
              </span>
              <span>
                <small>计划生成</small>
                <DevTimestamp
                  value={plan.generatedAt}
                  missing="计划生成时间未证明"
                />
              </span>
            </div>
            <div className="erp-dev-testing-validation-plan__lists">
              <div>
                <strong>建议命令</strong>
                {plan.commands.length > 0 ? (
                  <ol>
                    {plan.commands.map((command) => (
                      <li key={command.id}>
                        <span>
                          [
                          {command.scope === 'LOCAL_FULL'
                            ? '本地完整门禁'
                            : command.scope}
                          ] {command.label}
                        </span>
                        <code>{command.command}</code>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p>当前只保留 T0 静态检查。</p>
                )}
              </div>
              <div>
                <strong>待补证据</strong>
                {plan.followUps.length > 0 ? (
                  <ul>
                    {plan.followUps.map((item, index) => (
                      <li key={`${item.scope}-${index}`}>
                        [{item.scope}] {item.text}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>计划未声明额外 follow-up。</p>
                )}
              </div>
            </div>
            <p className="erp-dev-testing-validation-plan__note">
              计划生成后代码继续变化会使它失去当前性；执行前应重新生成。最终
              clean HEAD 仍需独立 prepare-push 回执。
            </p>
          </details>
        </div>
      ) : (
        <p className="erp-dev-testing-validation-plan__empty">
          尚未生成；该动作不运行测试、不写数据库，也不启动浏览器。
        </p>
      )}
    </section>
  )
}

function ValidationActionRow({ action, operation, disabled, starting, onRun }) {
  const presentation = getDevTestingOperationPresentation(operation)
  const tagColor = {
    primary: 'blue',
    success: 'green',
    warning: 'gold',
    danger: 'red',
  }[presentation.tone]
  return (
    <tr className="erp-dev-testing-validation-row" data-action-key={action.key}>
      <th scope="row">
        <strong>{action.label}</strong>
        <p>{action.description}</p>
      </th>
      <td>
        <Tag color={action.priority === 'P0' ? 'blue' : 'default'}>
          {action.priority === 'P0' ? '优先' : '按需'}
        </Tag>
        <Tag color={tagColor}>{presentation.label}</Tag>
        {operation?.message ? <p role="status">{operation.message}</p> : null}
      </td>
      <td>
        <details className="erp-dev-testing-validation-row__details">
          <summary>证据与时间</summary>
          <p>{action.boundary}</p>
          {operation ? (
            <Space direction="vertical" size={2}>
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
          ) : (
            <p>尚无本项执行回执</p>
          )}
        </details>
      </td>
      <td>
        <Button
          icon={<PlayCircleOutlined />}
          loading={starting || presentation.active}
          disabled={disabled || presentation.active}
          aria-label={action.label}
          onClick={() => onRun(action.key)}
        >
          {presentation.active ? '运行中…' : '运行检查'}
        </Button>
      </td>
    </tr>
  )
}

function ValidationWorkspace({
  plan,
  planLoading,
  planError,
  summary,
  summaryError,
  actionStarting,
  customerScope,
  customerReady,
  onGeneratePlan,
  onRunAction,
}) {
  const operations = summary?.operations || EMPTY_TESTING_OPERATIONS
  const busy = summary?.busy || { active: false, kind: '', profile: '' }
  const anyActive = Object.values(operations).some(isDevTestingOperationActive)
  const actionsDisabled =
    !summary ||
    Boolean(summaryError) ||
    busy.active ||
    anyActive ||
    Boolean(actionStarting)
  const customerSelectorDisabled =
    busy.active || anyActive || Boolean(actionStarting)

  return (
    <section
      className="erp-dev-testing-validation"
      aria-label="本轮验证固定动作"
    >
      <ValidationPlanPanel
        plan={plan}
        loading={planLoading}
        error={planError}
        busy={busy}
        onGenerate={onGeneratePlan}
      />
      {summaryError ? (
        <Alert
          showIcon
          type="error"
          message={summaryError}
          description="后台任务可能仍在运行；状态恢复前请勿重复发起。"
        />
      ) : null}
      <div className="erp-dev-testing-validation__action-intro">
        <div>
          <Text strong>可运行检查</Text>
          <Text type="secondary">
            三项检查互相独立；若不匹配本轮改动，可以不运行。
          </Text>
        </div>
      </div>
      <DevCustomerScopeSelector
        scope={customerScope}
        onChange={customerScope.selectCustomer}
        disabled={customerSelectorDisabled}
        label="岗位权限检查甲方"
        note="仅“岗位权限与任务可见性巡检”按甲方选择；当前永绅对应固定 yoyoosun 九岗位检查。"
        invalidDescription="岗位权限与任务可见性巡检已停止；开发门禁与字段联动专项仍可独立运行。"
      />
      <div className="erp-dev-testing-validation__actions erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table" aria-label="固定检查与独立证据">
          <thead>
            <tr>
              <th scope="col">检查与用途</th>
              <th scope="col">选择与状态</th>
              <th scope="col">证据</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {DEV_TESTING_FIXED_ACTIONS.map((action) => (
              <ValidationActionRow
                key={action.key}
                action={action}
                operation={operations[action.key]}
                disabled={
                  actionsDisabled ||
                  (action.key === 'role-access' && !customerReady)
                }
                starting={actionStarting === action.key}
                onRun={onRunAction}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function CoverageReportView({
  state,
  snapshotState,
  section,
  onSectionChange,
  loading,
  operation,
  operationError,
  operationStarting,
  qaBusy,
  qaReady,
  onCollect,
  onReload,
}) {
  const [requestedSource, setRequestedSource] = useState('')
  const [requestedDomain, setRequestedDomain] = useState('')
  const source =
    requestedSource ||
    (!state?.report && snapshotState?.report ? 'snapshot' : 'workspace')
  React.useEffect(() => {
    if (requestedSource || loading || (!state && !snapshotState)) return
    // 自动选择只用于首次读取；刷新失败时留在原来源，保证错误仍可见。
    setRequestedSource(
      !state?.report && snapshotState?.report ? 'snapshot' : 'workspace'
    )
  }, [loading, requestedSource, snapshotState, state])
  const activeState = source === 'snapshot' ? snapshotState : state
  const alert = coverageReportAlert(activeState)
  const report = activeState?.report || null
  const sections = buildDevTestingCoverageSectionSummaries(report)
  const domains = report?.businessCoverage.domains || []
  const selectedDomain = domains.find((item) => item.key === requestedDomain)
  const operationPresentation = getDevCoverageOperationPresentation(operation)
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
      <div className="erp-dev-testing-coverage-heading">
        <div>
          <Text className="erp-dev-testing-validation__eyebrow">
            证据分层，不合并总分
          </Text>
          <Title level={2}>证据与覆盖</Title>
          <Paragraph>按证据类型查看读数、缺口与执行结果。</Paragraph>
        </div>
        <Tag>分项判断</Tag>
      </div>
      <div className="erp-dev-testing-coverage-overview">
        <div className="erp-dev-testing-coverage-toolbar">
          <Segmented
            aria-label="覆盖报告来源"
            className="erp-dev-testing-coverage-source"
            value={source}
            onChange={setRequestedSource}
            options={[
              { label: '当前工作区', value: 'workspace' },
              { label: '最近隔离验证', value: 'snapshot' },
            ]}
          />
          <div className="erp-dev-testing-coverage-actions">
            <Button
              type="primary"
              icon={<PlayCircleOutlined aria-hidden="true" />}
              loading={operationStarting || operationPresentation.active}
              disabled={
                operationPresentation.active || qaBusy?.active || !qaReady
              }
              onClick={() => {
                setRequestedSource('workspace')
                onCollect()
              }}
            >
              {operationPresentation.active
                ? '采集中…'
                : qaBusy?.active
                  ? '已有验证在运行'
                  : !qaReady
                    ? '正在核对任务状态'
                    : '采集本地覆盖基线'}
            </Button>
            <Button
              icon={<ReloadOutlined aria-hidden="true" />}
              loading={loading}
              onClick={onReload}
            >
              重新读取
            </Button>
            <Button
              icon={<CopyOutlined aria-hidden="true" />}
              onClick={() => runCopy(DEV_TESTING_COVERAGE_COLLECT_COMMAND)}
            >
              复制备用命令
            </Button>
          </div>
        </div>
        <Alert
          showIcon
          type={alert.type}
          message={alert.title}
          description={alert.description}
        />
        <CoverageOperationPanel operation={operation} error={operationError} />
        <details className="erp-dev-testing-coverage-boundary">
          <summary>查看采集、覆盖目标与判定规则</summary>
          <div className="erp-dev-testing-coverage-scope-map">
            <section>
              <strong>本页证明</strong>
              <ul>
                <li>报告是否绑定当前仓库身份</li>
                <li>各层证据的状态、读数与缺口</li>
              </ul>
            </section>
            <section>
              <strong>本页不证明</strong>
              <ul>
                <li>未采集的数据库、浏览器或目标环境结果</li>
                <li>发布、恢复可用或客户 UAT 已完成</li>
              </ul>
            </section>
          </div>
          <Paragraph>
            空值表示未采集，不是 0%。采集本地覆盖基线固定运行真实本地 baseline
            测试并自动聚合报告，但不会执行数据库写入、真实业务浏览器、目标环境部署或客户
            UAT；切换页面不会停止后台任务，“重新读取”只读取本地报告。指标口径不同，不合并为“全系统覆盖率”；skipped、blocked、missing、failed
            和 0 tests executed
            均不能算通过。应在代码基本稳定的检查点运行，不必每次编辑后执行；备用命令
            {DEV_TESTING_COVERAGE_COLLECT_COMMAND}{' '}
            用于开发接口不可用时手工执行同一采集器。
          </Paragraph>
          {report?.policy.length > 0 ? (
            <div className="erp-dev-testing-coverage-policy-list">
              {report.policy.map((item) => (
                <article key={item.key}>
                  <strong>{item.label}</strong>
                  <p>{item.note}</p>
                </article>
              ))}
            </div>
          ) : null}
        </details>
      </div>

      <DevTaskNav
        idPrefix="dev-testing-coverage"
        ariaLabel="覆盖证据类型"
        className="erp-dev-testing-coverage-tabs"
        compact
        items={sections.map(({ value, label, status }) => ({
          value,
          label: (
            <>
              {label}
              <Tag
                color={coverageTagColor(
                  getDevTestingCoverageStatusMeta(status).tone
                )}
              >
                {getDevTestingCoverageStatusMeta(status).label.split(' / ')[0]}
              </Tag>
            </>
          ),
        }))}
        value={section}
        onChange={onSectionChange}
      />
      <div
        id={`dev-testing-coverage-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`dev-testing-coverage-tab-${section}`}
        className="erp-dev-testing-coverage-panel"
        tabIndex={0}
      >
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
                {source === 'snapshot' ? (
                  <Tag color="blue">隔离源码快照</Tag>
                ) : (
                  <CoverageStatusTag status={activeState.status} />
                )}
              </span>
              <span>
                <small>生成时间</small>
                <DevTimestamp
                  value={report.generatedAt}
                  missing="生成时间未证明"
                  strong
                />
              </span>
              <span>
                <small>Commit</small>
                <code>{shortCommit}</code>
              </span>
              <span>
                <small>验证源码</small>
                <b>
                  {repository.dirty === null
                    ? '未记录'
                    : repository.dirty
                      ? 'Dirty'
                      : 'Clean'}
                </b>
              </span>
              <details className="erp-dev-testing-coverage-identity__details">
                <summary>查看完整报告身份</summary>
                <span>
                  <small>Fingerprint</small>
                  <code>{repository.fingerprint || '未记录'}</code>
                </span>
              </details>
            </section>

            {section === 'code' ? (
              <CoverageSection
                title="代码覆盖 / Code Coverage"
                description="Go 全包语句可能包含生成物；Web 只统计实际加载模块。两者不等于本轮改动覆盖，空值表示未采集。"
              >
                <div className="erp-dev-testing-coverage-grid erp-dev-testing-coverage-grid--code">
                  <CoverageEvidenceCard item={report.codeCoverage.go} />
                  <CoverageEvidenceCard item={report.codeCoverage.web} />
                </div>
              </CoverageSection>
            ) : null}

            {section === 'business' ? (
              <CoverageSection
                title="业务合同与关键场景 / Business Coverage"
                description="按业务域看适用合同、关键场景和模块覆盖，不以代码行覆盖替代。"
                status={report.businessCoverage.status}
                matrix={false}
              >
                {domains.length > 0 ? (
                  <>
                    <div className="erp-dev-testing-coverage-domain-picker">
                      <label htmlFor="dev-testing-coverage-domain">
                        查看业务域
                      </label>
                      <Select
                        id="dev-testing-coverage-domain"
                        value={selectedDomain?.key || ''}
                        onChange={setRequestedDomain}
                        options={[
                          { value: '', label: '全部业务域总览' },
                          ...domains.map(({ key, label }) => ({
                            value: key,
                            label,
                          })),
                        ]}
                      />
                      {selectedDomain ? (
                        <Button onClick={() => setRequestedDomain('')}>
                          返回业务域总览
                        </Button>
                      ) : null}
                    </div>
                    {selectedDomain ? (
                      <CoverageEvidenceCard item={selectedDomain} />
                    ) : (
                      <div className="erp-dev-testing-coverage-domain-table-wrap">
                        <table
                          className="erp-dev-testing-coverage-domain-table"
                          aria-label="业务域覆盖总览"
                        >
                          <thead>
                            <tr>
                              <th scope="col">业务域</th>
                              <th scope="col">状态</th>
                              <th scope="col">执行 / 声明</th>
                              <th scope="col">通过</th>
                              <th scope="col">失败 / 跳过 / 受阻 / 缺失</th>
                              <th scope="col">场景与证据</th>
                            </tr>
                          </thead>
                          <tbody>
                            {domains.map((item) => (
                              <tr key={item.key}>
                                <th scope="row">{item.label}</th>
                                <td>
                                  <CoverageStatusTag status={item.status} />
                                </td>
                                <td>
                                  {item.counts.executed ?? '—'} /{' '}
                                  {item.counts.total ?? '—'}
                                </td>
                                <td>{item.counts.passed ?? '—'}</td>
                                <td>
                                  {item.counts.failed ?? '—'} /{' '}
                                  {item.counts.skipped ?? '—'} /{' '}
                                  {item.counts.blocked ?? '—'} /{' '}
                                  {item.counts.missing ?? '—'}
                                </td>
                                <td>
                                  <Button
                                    size="small"
                                    aria-label={`查看 ${item.label} 场景与证据`}
                                    onClick={() => setRequestedDomain(item.key)}
                                  >
                                    查看详情
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : (
                  <CoverageEvidenceCard item={report.businessCoverage} />
                )}
              </CoverageSection>
            ) : null}

            {section === 'gates' ? (
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
            ) : null}

            {section === 'acceptance' ? (
              <CoverageSection
                title="运行态与验收 / Runtime & Acceptance"
                description="PostgreSQL、浏览器、readiness、目标环境与 UAT 各自独立，不由本地绿色替代。"
              >
                <div className="erp-dev-testing-coverage-grid">
                  {DEV_TESTING_COVERAGE_ACCEPTANCE_ITEMS.map(({ key }) => (
                    <CoverageEvidenceCard
                      key={key}
                      item={report.acceptance[key]}
                    />
                  ))}
                </div>
              </CoverageSection>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function DevTestingPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const testingSummaryRequestSequence = React.useRef(0)
  const testingIdempotencyKeys = React.useRef({})
  const handledTestingTerminals = React.useRef(new Set())
  const coverageRequestSequence = React.useRef(0)
  const coverageStartInFlight = React.useRef(false)
  const coverageIdempotencyKey = React.useRef('')
  const handledCoverageTerminal = React.useRef('')
  const [testingSummaryReloadKey, setTestingSummaryReloadKey] = useState(0)
  const [testingSummary, setTestingSummary] = useState(null)
  const [testingSummaryError, setTestingSummaryError] = useState('')
  const [testingPlan, setTestingPlan] = useState(null)
  const [testingPlanLoading, setTestingPlanLoading] = useState(false)
  const [testingPlanError, setTestingPlanError] = useState('')
  const [testingActionStarting, setTestingActionStarting] = useState('')
  const [coverageReloadKey, setCoverageReloadKey] = useState(0)
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageState, setCoverageState] = useState(null)
  const [coverageSnapshotState, setCoverageSnapshotState] = useState(null)
  const [coverageOperation, setCoverageOperation] = useState(null)
  const [coverageOperationError, setCoverageOperationError] = useState('')
  const [coverageOperationStarting, setCoverageOperationStarting] =
    useState(false)
  const coverageOperationClient = useMemo(
    () => createDevCoverageOperationClient(),
    []
  )
  const testingOperationClient = useMemo(
    () => createDevTestingOperationClient(),
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
  const documentRoleOptions = useMemo(
    () => getDevTestingDocumentRoleOptions(docs),
    [docs]
  )
  const documentRoleValues = useMemo(
    () => new Set(documentRoleOptions.map((option) => option.value)),
    [documentRoleOptions]
  )
  const requestedView = searchParams.get(VIEW_QUERY_KEY) || ''
  const view = VIEW_VALUES.has(requestedView) ? requestedView : VIEW_TIERS
  const coverageSection = parseDevTestingCoverageSection(searchParams)
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
    normalize: view === VIEW_TIERS,
  })
  const customerReady = customerScope.status === 'ready'
  const isCloseoutView = view === VIEW_CLOSEOUT
  const isCoverageView = view === VIEW_COVERAGE
  const isAuxiliaryView = AUXILIARY_VIEW_VALUES.has(view)
  const requestedDocumentRole =
    searchParams.get(DOCUMENT_ROLE_QUERY_KEY) || 'all'
  const documentRole = documentRoleValues.has(requestedDocumentRole)
    ? requestedDocumentRole
    : 'all'
  const keyword = searchParams.get(COMMAND_QUERY_KEY) || ''
  const roleFilteredDocs = useMemo(
    () => filterDevTestingDocs(docs, { documentRole }),
    [docs, documentRole]
  )
  const obsoleteDocKey = searchParams.get('doc') || ''
  const allCommandBlocks = useMemo(
    () =>
      filterDevTestingCommandBlocks(roleFilteredDocs, {
        keyword,
      }),
    [keyword, roleFilteredDocs]
  )
  const matchedSourceCount = new Set(
    allCommandBlocks.map((block) => block.sourcePath)
  ).size
  const commandPage = useMemo(
    () => buildDevTestingCommandPage(allCommandBlocks, searchParams),
    [allCommandBlocks, searchParams]
  )
  const coverageOperationId = coverageOperation?.id || ''
  const coverageOperationIsActive =
    isDevCoverageOperationActive(coverageOperation)
  const testingOperations =
    testingSummary?.operations || EMPTY_TESTING_OPERATIONS
  const testingActiveOperations = Object.values(testingOperations).filter(
    isDevTestingOperationActive
  )
  const testingActiveOperationIds = testingActiveOperations
    .map((operation) => operation.id)
    .sort()
    .join(',')
  const testingHasActive = testingActiveOperations.length > 0
  const testingBusy = testingSummary?.busy || {
    active: false,
    kind: '',
    profile: '',
  }

  React.useEffect(() => {
    const controller = new AbortController()
    const requestSequence = testingSummaryRequestSequence.current + 1
    testingSummaryRequestSequence.current = requestSequence

    const loadTestingSummary = async () => {
      try {
        const nextSummary = await testingOperationClient.summary({
          signal: controller.signal,
        })
        if (
          controller.signal.aborted ||
          requestSequence !== testingSummaryRequestSequence.current
        ) {
          return
        }
        setTestingSummary(nextSummary)
        setTestingSummaryError('')
      } catch (_error) {
        if (
          controller.signal.aborted ||
          requestSequence !== testingSummaryRequestSequence.current
        ) {
          return
        }
        setTestingSummaryError('固定验证状态读取失败，请检查本地开发服务。')
      }
    }

    loadTestingSummary()
    return () => controller.abort()
  }, [testingOperationClient, testingSummaryReloadKey])

  const handleTestingTerminal = React.useCallback((operation) => {
    if (!operation || isDevTestingOperationActive(operation)) return
    const terminalKey = `${operation.id}:${operation.revision}`
    if (handledTestingTerminals.current.has(terminalKey)) return
    handledTestingTerminals.current.add(terminalKey)
    delete testingIdempotencyKeys.current[operation.action]
    setTestingSummaryReloadKey((current) => current + 1)
    const toastKey = `dev-testing-${operation.action}`
    if (operation.status === 'completed') {
      message.success({ content: operation.message, key: toastKey })
    } else if (operation.status === 'failed') {
      message.error({ content: operation.message, key: toastKey })
    } else {
      message.warning({ content: operation.message, key: toastKey })
    }
  }, [])

  React.useEffect(() => {
    if (!testingActiveOperationIds) return undefined
    const operationIds = testingActiveOperationIds.split(',')
    const controller = new AbortController()
    let timer = null

    const poll = async () => {
      try {
        const nextOperations = await Promise.all(
          operationIds.map((operationId) =>
            testingOperationClient.read(operationId, {
              signal: controller.signal,
            })
          )
        )
        if (controller.signal.aborted) return
        setTestingSummary((current) => {
          if (!current) return current
          const operations = { ...current.operations }
          for (const operation of nextOperations) {
            const previous = operations[operation.action]
            if (
              !previous ||
              previous.id !== operation.id ||
              previous.revision <= operation.revision
            ) {
              operations[operation.action] = operation
            }
          }
          return { ...current, operations }
        })
        setTestingSummaryError('')
        for (const operation of nextOperations) {
          handleTestingTerminal(operation)
        }
        if (nextOperations.some(isDevTestingOperationActive)) {
          timer = window.setTimeout(poll, 1200)
        }
      } catch (_error) {
        if (controller.signal.aborted) return
        setTestingSummaryError(
          '固定验证进度读取暂时失败，后台任务可能仍在执行。'
        )
        timer = window.setTimeout(poll, 1800)
      }
    }

    timer = window.setTimeout(poll, 800)
    return () => {
      controller.abort()
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [handleTestingTerminal, testingActiveOperationIds, testingOperationClient])

  React.useEffect(() => {
    if (!isCoverageView) return undefined

    const controller = new AbortController()
    const requestSequence = coverageRequestSequence.current + 1
    coverageRequestSequence.current = requestSequence
    setCoverageLoading(true)

    const loadCoverage = async () => {
      const readReport = async (apiPath) => {
        const response = await fetch(apiPath, {
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
        return { payload, httpStatus: response.status }
      }
      const [workspace, snapshot] = await Promise.allSettled([
        readReport(DEV_TESTING_COVERAGE_API_PATH),
        readReport(DEV_TESTING_COVERAGE_SNAPSHOT_API_PATH),
      ])
      if (
        controller.signal.aborted ||
        requestSequence !== coverageRequestSequence.current
      ) {
        return
      }
      const workspaceResult =
        workspace.status === 'fulfilled'
          ? workspace.value
          : {
              payload: {
                status: 'failed',
                message: '覆盖报告读取失败，请检查本地开发接口',
              },
              httpStatus: 500,
            }
      const snapshotResult =
        snapshot.status === 'fulfilled'
          ? snapshot.value
          : {
              payload: {
                status: 'failed',
                message: '隔离验证报告读取失败，请检查本地开发接口',
              },
              httpStatus: 500,
            }
      setCoverageState(
        normalizeDevTestingCoverageEnvelope(
          workspaceResult.payload,
          workspaceResult
        )
      )
      setCoverageSnapshotState(
        normalizeDevTestingCoverageSnapshot(
          snapshotResult.payload,
          snapshotResult
        )
      )
      // A failed read cannot erase an operation whose execution is still known.
      if (workspace.status === 'fulfilled') {
        const incomingOperation = normalizeOptionalDevCoverageOperation(
          workspaceResult.payload?.operation
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
      }
      setCoverageLoading(false)
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
    setTestingSummaryReloadKey((current) => current + 1)
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
    const hasNonCanonicalRole =
      requestedDocumentRole !== documentRole ||
      (documentRole === 'all' && searchParams.has(DOCUMENT_ROLE_QUERY_KEY))
    const hasEmptyKeyword = searchParams.has(COMMAND_QUERY_KEY) && !keyword
    const hasNonCanonicalCoverage =
      searchParams.has(DEV_TESTING_COVERAGE_SECTION_QUERY_KEY) &&
      coverageSection === 'code'
    const hasNonCanonicalCommandPage =
      searchParams.has(DEV_TESTING_COMMAND_PAGE_QUERY_KEY) &&
      (commandPage.page === 1 ||
        searchParams.getAll(DEV_TESTING_COMMAND_PAGE_QUERY_KEY).length !== 1 ||
        searchParams.get(DEV_TESTING_COMMAND_PAGE_QUERY_KEY) !==
          String(commandPage.page))
    if (
      requestedView === view &&
      !obsoleteDocKey &&
      !hasNonCanonicalRole &&
      !hasEmptyKeyword &&
      !hasNonCanonicalCoverage &&
      !hasNonCanonicalCommandPage
    ) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(VIEW_QUERY_KEY, view)
    nextParams.delete('doc')
    if (documentRole === 'all') {
      nextParams.delete(DOCUMENT_ROLE_QUERY_KEY)
    } else {
      nextParams.set(DOCUMENT_ROLE_QUERY_KEY, documentRole)
    }
    if (!keyword) nextParams.delete(COMMAND_QUERY_KEY)
    if (hasNonCanonicalCoverage) {
      nextParams.delete(DEV_TESTING_COVERAGE_SECTION_QUERY_KEY)
    }
    if (hasNonCanonicalCommandPage) {
      if (commandPage.page === 1) {
        nextParams.delete(DEV_TESTING_COMMAND_PAGE_QUERY_KEY)
      } else {
        nextParams.set(
          DEV_TESTING_COMMAND_PAGE_QUERY_KEY,
          String(commandPage.page)
        )
      }
    }
    setSearchParams(nextParams, { replace: true })
  }, [
    coverageSection,
    commandPage.page,
    documentRole,
    keyword,
    obsoleteDocKey,
    requestedDocumentRole,
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
    nextParams.delete('doc')
    setSearchParams(nextParams)
  }

  const selectCoverageSection = (nextSection) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(DEV_TESTING_COVERAGE_SECTION_QUERY_KEY, nextSection)
    if (parseDevTestingCoverageSection(nextParams) === 'code') {
      nextParams.delete(DEV_TESTING_COVERAGE_SECTION_QUERY_KEY)
    }
    setSearchParams(nextParams)
  }

  const selectDocumentRole = (nextDocumentRole) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(DEV_TESTING_COMMAND_PAGE_QUERY_KEY)
    if (
      nextDocumentRole === 'all' ||
      !documentRoleValues.has(nextDocumentRole)
    ) {
      nextParams.delete(DOCUMENT_ROLE_QUERY_KEY)
    } else {
      nextParams.set(DOCUMENT_ROLE_QUERY_KEY, nextDocumentRole)
    }
    setSearchParams(nextParams)
  }

  const setCommandKeyword = (nextKeyword) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete(DEV_TESTING_COMMAND_PAGE_QUERY_KEY)
    if (nextKeyword) {
      nextParams.set(COMMAND_QUERY_KEY, nextKeyword)
    } else {
      nextParams.delete(COMMAND_QUERY_KEY)
    }
    setSearchParams(nextParams, { replace: true })
  }

  const selectCommandPage = (nextPage) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextPage === 1) nextParams.delete(DEV_TESTING_COMMAND_PAGE_QUERY_KEY)
    else nextParams.set(DEV_TESTING_COMMAND_PAGE_QUERY_KEY, String(nextPage))
    setSearchParams(nextParams)
  }

  const openSourceDoc = (sourcePath) => {
    if (!sourcePath) return
    navigate(`${DEV_DOCS_ROUTE}?path=${encodeURIComponent(sourcePath)}`)
  }

  const reloadCoverage = () => {
    setCoverageReloadKey((current) => current + 1)
    setTestingSummaryReloadKey((current) => current + 1)
  }

  const reloadTestingSummary = () => {
    setTestingSummaryError('')
    setTestingSummaryReloadKey((current) => current + 1)
  }

  const generateTestingPlan = async () => {
    if (testingPlanLoading) return
    setTestingPlanLoading(true)
    setTestingPlanError('')
    try {
      setTestingPlan(await testingOperationClient.plan())
    } catch (_error) {
      setTestingPlanError(
        '本轮验证计划生成失败；代码可能正在变化，请稳定后重新生成。'
      )
    } finally {
      setTestingPlanLoading(false)
    }
  }

  const runTestingAction = async (action) => {
    if (
      (action === 'role-access' && !customerReady) ||
      testingActionStarting ||
      !testingSummary ||
      testingSummaryError ||
      testingBusy.active ||
      testingHasActive
    ) {
      return
    }
    setTestingActionStarting(action)
    setTestingSummaryError('')
    try {
      if (!testingIdempotencyKeys.current[action]) {
        testingIdempotencyKeys.current[action] =
          createDevTestingIdempotencyKey(action)
      }
      const operation = await testingOperationClient.start(
        action,
        testingIdempotencyKeys.current[action]
      )
      setTestingSummary((current) => ({
        ...(current || {
          schemaVersion: 'plush.dev-qa-testing-summary/v2',
          operations: { ...EMPTY_TESTING_OPERATIONS },
        }),
        busy: isDevTestingOperationActive(operation)
          ? { active: true, kind: 'testing', profile: action }
          : { active: false, kind: '', profile: '' },
        operations: {
          ...(current?.operations || EMPTY_TESTING_OPERATIONS),
          [action]: operation,
        },
      }))
      if (!isDevTestingOperationActive(operation)) {
        handleTestingTerminal(operation)
      }
    } catch (_error) {
      setTestingSummaryError(
        '固定验证请求暂时未确认；再次点击会复用同一请求，不会重复启动。'
      )
      message.error({
        content: '固定验证暂时无法确认，请检查本地开发服务',
        key: `dev-testing-${action}`,
      })
    } finally {
      setTestingActionStarting('')
    }
  }

  const collectCoverage = async () => {
    if (
      coverageStartInFlight.current ||
      isDevCoverageOperationActive(coverageOperation) ||
      !testingSummary ||
      testingSummaryError ||
      testingBusy.active ||
      testingHasActive
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
      setTestingSummaryReloadKey((current) => current + 1)
      if (!isDevCoverageOperationActive(operation)) {
        handleCoverageTerminal(operation)
      }
    } catch (_error) {
      setCoverageOperationError(
        '采集请求暂时未确认；再次点击会复用同一请求，不会重复启动测试。'
      )
      message.error({
        content: '覆盖基线采集暂时无法确认，请检查本地开发服务',
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
        ? `${formatDevTimestamp(coverageState.report.generatedAt, {
            missing: '生成时间未证明',
          })} · ${
            coverageState.report.repository.commit?.slice(0, 12) ||
            'commit 未记录'
          }`
        : getDevTestingCoverageStatusMeta(coverageState?.status).label
  const hookReadyCount =
    testingSummary?.hooks?.checks?.filter((check) => check.status === 'ready')
      .length || 0
  const hookCheckCount = testingSummary?.hooks?.checks?.length || 0
  const closeoutToolbarText = testingSummaryError
    ? 'Hook 接线读取失败'
    : testingSummary?.hooks
      ? `${hookReadyCount}/${hookCheckCount} 项接线完整`
      : '正在读取 Hook 接线…'
  return (
    <div className="erp-dev-testing-page erp-dev-workspace-page">
      <DevPageNav sourcePath={DEV_TESTING_STRATEGY_SOURCE_PATH} />
      <header className="erp-dev-testing-header">
        <div className="erp-dev-testing-header__copy">
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-testing-header__icon" />
            <Title level={1} className="erp-dev-testing-title">
              {isCloseoutView
                ? 'Git 收口检查'
                : view === VIEW_COMMANDS
                  ? '专项检查命令'
                  : '改动验证'}
            </Title>
          </Space>
        </div>
      </header>

      <main className="erp-dev-testing-shell">
        <section className="erp-dev-testing-reader">
          <div className="erp-dev-testing-reader__toolbar">
            <div
              className="erp-dev-testing-primary-nav"
              hidden={isAuxiliaryView}
            >
              <Segmented
                aria-label="质量验证工作区主视图"
                options={VIEW_OPTIONS}
                value={isAuxiliaryView ? VIEW_TIERS : view}
                onChange={selectView}
              />
              {isCoverageView ? (
                <Text type="secondary">当前工作区：{coverageToolbarText}</Text>
              ) : null}
            </div>
            <div
              className="erp-dev-testing-auxiliary-nav"
              hidden={!isAuxiliaryView}
            >
              {isCloseoutView ? (
                <Link to={DEV_DELIVERY_ROUTE}>
                  <LeftOutlined aria-hidden="true" /> 返回交付运行
                </Link>
              ) : (
                <Button
                  type="link"
                  icon={<LeftOutlined aria-hidden="true" />}
                  onClick={() => selectView(VIEW_TIERS)}
                >
                  返回本轮验证
                </Button>
              )}
              <Text type="secondary">
                {isCloseoutView
                  ? closeoutToolbarText
                  : `找到 ${allCommandBlocks.length} 项命令`}
              </Text>
            </div>
          </div>

          {view === VIEW_TIERS ? (
            <div className="erp-dev-testing-tier-view">
              <ValidationWorkspace
                plan={testingPlan}
                planLoading={testingPlanLoading}
                planError={testingPlanError}
                summary={testingSummary}
                summaryError={testingSummaryError}
                actionStarting={testingActionStarting}
                customerScope={customerScope}
                customerReady={customerReady}
                onGeneratePlan={generateTestingPlan}
                onRunAction={runTestingAction}
              />
              <details className="erp-dev-testing-disclosure erp-dev-testing-disclosure--tools">
                <summary>更多检查</summary>
                <Space wrap size={16}>
                  <Link to={DEV_BUSINESS_USABILITY_ROUTE}>页面说明检查</Link>
                  <Link
                    to={`${DEV_QUALITY_GATES_ROUTE}?view=run&profile=strict`}
                  >
                    完整或严格门禁
                  </Link>
                  <Button type="link" onClick={() => selectView(VIEW_COMMANDS)}>
                    查专项命令
                  </Button>
                </Space>
              </details>

              <details className="erp-dev-testing-disclosure erp-dev-testing-disclosure--presets">
                <summary>
                  <span>
                    <strong>复制专项检查命令</strong>
                    <small>
                      {DEV_TESTING_COPY_PRESETS.length}{' '}
                      组固定预设，按改动类型选择
                    </small>
                  </span>
                  <span>按需展开</span>
                </summary>
                <div
                  className="erp-dev-testing-presets"
                  aria-label="常用测试命令预设"
                >
                  {DEV_TESTING_COPY_PRESETS.map((preset) => (
                    <QuickPreset key={preset.key} preset={preset} />
                  ))}
                </div>
              </details>
              <details className="erp-dev-testing-disclosure erp-dev-testing-disclosure--tiers">
                <summary>
                  <span>
                    <strong>了解验证范围</strong>
                    <small>
                      T0–T8 是内部选测键，不是完成进度，也不是逐级验收
                    </small>
                  </span>
                  <span>按需展开</span>
                </summary>
                <div className="erp-dev-testing-tier-grid">
                  {tiers.map((tier) => (
                    <TierCard key={tier.key} tier={tier} />
                  ))}
                </div>
              </details>
            </div>
          ) : null}

          {view === VIEW_COMMANDS ? (
            <div className="erp-dev-testing-command-view">
              <CommandLibraryGuide />
              <div className="erp-dev-testing-command-tools">
                <SearchInput
                  allowClear
                  className="erp-dev-testing-search"
                  placeholder="搜索命令、来源、验收词"
                  value={keyword}
                  onChange={(event) => setCommandKeyword(event.target.value)}
                />
                <div
                  className="erp-dev-testing-filter"
                  role="group"
                  aria-label="按文档职责筛选命令来源"
                >
                  {documentRoleOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={
                        option.value === documentRole
                          ? 'erp-dev-testing-filter__item erp-dev-testing-filter__item--active'
                          : 'erp-dev-testing-filter__item'
                      }
                      aria-pressed={option.value === documentRole}
                      onClick={() => selectDocumentRole(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <nav
                className="erp-dev-testing-command-pagination"
                aria-label="专项检查命令分页"
              >
                <Text type="secondary" role="status">
                  显示 {commandPage.from}–{commandPage.to} 项，共{' '}
                  {commandPage.total} 项命令
                </Text>
                <Pagination
                  current={commandPage.page}
                  pageSize={DEV_TESTING_COMMAND_PAGE_SIZE}
                  total={commandPage.total}
                  showSizeChanger={false}
                  hideOnSinglePage
                  onChange={selectCommandPage}
                />
              </nav>
              <div className="erp-dev-testing-command-matrix__head" aria-hidden>
                <span>用途</span>
                <span>当前来源</span>
                <span>固定范围</span>
                <span>操作</span>
              </div>
              <div className="erp-dev-testing-command-list">
                {allCommandBlocks.length > 0 ? (
                  commandPage.items.map((block) => (
                    <CommandBlock
                      key={block.key}
                      block={block}
                      onOpenSource={openSourceDoc}
                    />
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
            </div>
          ) : null}

          {view === VIEW_CLOSEOUT ? (
            <GitCloseoutView
              hooks={testingSummary?.hooks || null}
              loading={!testingSummary && !testingSummaryError}
              error={testingSummaryError}
              onReload={reloadTestingSummary}
            />
          ) : null}

          {view === VIEW_COVERAGE ? (
            <CoverageReportView
              section={coverageSection}
              onSectionChange={selectCoverageSection}
              state={coverageState}
              snapshotState={coverageSnapshotState}
              loading={coverageLoading}
              operation={coverageOperation}
              operationError={coverageOperationError}
              operationStarting={coverageOperationStarting}
              qaBusy={testingBusy}
              qaReady={Boolean(testingSummary) && !testingSummaryError}
              onCollect={collectCoverage}
              onReload={reloadCoverage}
            />
          ) : null}
          {view === VIEW_PRESSURE ? (
            <DevPressurePanel
              summary={testingSummary}
              summaryError={testingSummaryError}
              actionStarting={testingActionStarting}
              onRun={runTestingAction}
              onReloadTesting={reloadTestingSummary}
              onOpenDocs={() => navigate(`${DEV_DOCS_ROUTE}?path=${encodeURIComponent('scripts/qa/README.md')}#pressure-testing`)}
            />
          ) : null}
          <details className="erp-dev-testing-disclosure erp-dev-testing-disclosure--help">
            <summary>工具说明与来源</summary>
            <Paragraph>
              本机开发工具只接受固定检查，不接受自定义命令、路径或凭据。验证范围和命令需要时再查阅。
            </Paragraph>
            <Paragraph>
              {summary.tierCount} 个验证范围 · {summary.docCount} 个当前来源 ·{' '}
              {summary.commandBlockCount} 个命令块
              {view === VIEW_COMMANDS
                ? `；当前筛选涉及 ${matchedSourceCount} 个来源。`
                : '。'}
            </Paragraph>
            <Button
              type="link"
              onClick={() => openSourceDoc(DEV_TESTING_STRATEGY_SOURCE_PATH)}
            >
              查看验证策略
            </Button>
          </details>
        </section>
      </main>
    </div>
  )
}
