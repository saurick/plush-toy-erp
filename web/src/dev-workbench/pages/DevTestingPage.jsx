import React, { useMemo, useState } from 'react'
import {
  CodeOutlined,
  CopyOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Progress,
  Segmented,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import {
  DEV_TESTING_COPY_PRESETS,
  DEV_TESTING_COVERAGE_ACCEPTANCE_ITEMS,
  DEV_TESTING_COVERAGE_API_PATH,
  DEV_TESTING_COVERAGE_COLLECT_COMMAND,
  DEV_TESTING_STRATEGY_SOURCE_PATH,
  buildDevTestingDocs,
  buildDevTestingSummary,
  filterDevTestingCommandBlocks,
  filterDevTestingDocs,
  formatDevTestingCoverageMetric,
  getDevTestingDocumentRoleOptions,
  getDevTestingCoverageStatusMeta,
  normalizeDevTestingCoverageEnvelope,
  parseDevTestingStrategyTiers,
} from '../config/devTesting.mjs'
import {
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

const { Paragraph, Text, Title } = Typography

const VIEW_TIERS = 'tiers'
const VIEW_COMMANDS = 'commands'
const VIEW_CLOSEOUT = 'closeout'
const VIEW_COVERAGE = 'coverage'
const VIEW_QUERY_KEY = 'view'
const DOCUMENT_ROLE_QUERY_KEY = 'role'
const COMMAND_QUERY_KEY = 'q'

const VIEW_OPTIONS = [
  { label: '本轮验证', value: VIEW_TIERS },
  { label: '专项检查库', value: VIEW_COMMANDS },
  { label: 'Git 收口', value: VIEW_CLOSEOUT },
  { label: '证据与覆盖', value: VIEW_COVERAGE },
]
const VIEW_VALUES = new Set(VIEW_OPTIONS.map((option) => option.value))

const COPY_MESSAGE_KEY = 'dev-testing-command-copy'
const EMPTY_TESTING_OPERATIONS = Object.freeze({
  fast: null,
  'role-access': null,
  'field-linkage': null,
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
      <div className="erp-dev-testing-command-block__head">
        <div>
          <Text strong>{block.context || block.title}</Text>
          <div className="erp-dev-testing-command-block__path">
            {block.sourceLabel || block.title || '测试命令来源'}
          </div>
        </div>
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
      <pre>
        <code>{block.commandText}</code>
      </pre>
    </article>
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

function GitHookStatusTag({ status }) {
  const meta = getDevTestingGitHookStatusMeta(status)
  return <Tag color={coverageTagColor(meta.tone)}>{meta.label}</Tag>
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
              {DEV_TESTING_GIT_CLOSEOUT_STAGES.map((stage, index) => (
                <li key={stage.key}>
                  <span className="erp-dev-testing-closeout-step__number">
                    {index + 1}
                  </span>
                  <div className="erp-dev-testing-closeout-step__copy">
                    <div className="erp-dev-testing-closeout-step__title">
                      <Title level={4}>{stage.label}</Title>
                      <Tag>{stage.trigger}</Tag>
                    </div>
                    <p>{stage.description}</p>
                    <small>{stage.boundary}</small>
                    <div className="erp-dev-testing-closeout-step__sources">
                      {stage.sources.map((sourcePath) => (
                        <code key={sourcePath}>{sourcePath}</code>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
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

          <section
            className="erp-dev-testing-closeout-section"
            aria-labelledby="git-closeout-copy-title"
          >
            <div className="erp-dev-testing-closeout-section__head">
              <div>
                <Title level={3} id="git-closeout-copy-title">
                  需要时再复制
                </Title>
                <Paragraph>
                  页面只复制仓库固定命令，不执行、不暂存、不提交，也不推送。
                </Paragraph>
              </div>
            </div>
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
          </section>

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
          <Tag color="blue">验证计划</Tag>
          <Title level={3}>先判断本轮需要验证什么</Title>
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
          <div className="erp-dev-testing-validation-plan__identity">
            <span>
              <small>改动文件</small>
              <b>{plan.changedCount}</b>
            </span>
            <span>
              <small>验证范围</small>
              <b>{plan.levels.join(' · ')}</b>
            </span>
            <span>
              <small>最高层级</small>
              <b>{plan.highestLevel}</b>
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
          {plan.requiresFull ? (
            <Alert
              showIcon
              type="warning"
              message="当前改动需要完整门禁"
              description="计划只说明选择结果，不会替你执行 full、数据库、浏览器、发布或 UAT。"
            />
          ) : null}
          <div className="erp-dev-testing-validation-plan__lists">
            <div>
              <strong>建议命令</strong>
              {plan.commands.length > 0 ? (
                <ol>
                  {plan.commands.map((command) => (
                    <li key={command.id}>
                      <span>
                        [{command.level}] {command.label}
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
                    <li key={`${item.level}-${index}`}>
                      [{item.level}] {item.text}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>计划未声明额外 follow-up。</p>
              )}
            </div>
          </div>
          <p className="erp-dev-testing-validation-plan__note">
            计划生成后代码继续变化会使它失去当前性；执行前应重新生成。最终 clean
            HEAD 仍需独立 prepare-push 回执。
          </p>
        </div>
      ) : (
        <p className="erp-dev-testing-validation-plan__empty">
          尚未生成；该动作不运行测试、不写数据库，也不启动浏览器。
        </p>
      )}
    </section>
  )
}

function ValidationActionCard({
  action,
  operation,
  disabled,
  starting,
  onRun,
}) {
  const presentation = getDevTestingOperationPresentation(operation)
  const tagColor = {
    primary: 'blue',
    success: 'green',
    warning: 'gold',
    danger: 'red',
  }[presentation.tone]
  return (
    <article
      className={`erp-dev-testing-validation-action erp-dev-testing-validation-action--${presentation.tone}`}
    >
      <div className="erp-dev-testing-validation-action__copy">
        <div className="erp-dev-testing-validation-action__head">
          <div>
            <Tag color={action.priority === 'P0' ? 'blue' : 'cyan'}>
              {action.priority === 'P0' ? '优先' : '按需'}
            </Tag>
            <Tag color={tagColor}>{presentation.label}</Tag>
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
        <Title level={3}>{action.label}</Title>
        <p>{action.description}</p>
        {operation?.message ? (
          <p className="erp-dev-testing-validation-action__message">
            {operation.message}
          </p>
        ) : null}
        <details className="erp-dev-testing-validation-action__details">
          <summary>查看证据边界</summary>
          <small className="erp-dev-testing-validation-action__boundary">
            {action.priority} · {action.boundary}
          </small>
        </details>
      </div>
      <Button
        type={action.priority === 'P0' ? 'primary' : 'default'}
        icon={<PlayCircleOutlined />}
        loading={starting || presentation.active}
        disabled={disabled || presentation.active}
        onClick={() => onRun(action.key)}
      >
        {presentation.active ? '运行中…' : action.label}
      </Button>
    </article>
  )
}

function ValidationWorkspace({
  plan,
  planLoading,
  planError,
  summary,
  summaryError,
  actionStarting,
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

  return (
    <section
      className="erp-dev-testing-validation"
      aria-label="本轮验证固定动作"
    >
      <div className="erp-dev-testing-validation__title">
        <div>
          <Text className="erp-dev-testing-validation__eyebrow">
            推荐主路径
          </Text>
          <Title level={2}>本轮验证</Title>
          <Paragraph>
            先生成建议，再只运行与改动匹配的检查。每项独立出结果，不合成“全系统已通过”。
          </Paragraph>
        </div>
        {summaryError ? <Tag color="red">状态读取失败</Tag> : null}
      </div>
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
          <Text strong>运行匹配的固定检查</Text>
          <Text type="secondary">
            三项检查互相独立；若不匹配本轮改动，可以不运行。
          </Text>
        </div>
        <Tag>固定白名单</Tag>
      </div>
      <div className="erp-dev-testing-validation__actions">
        {DEV_TESTING_FIXED_ACTIONS.map((action) => (
          <ValidationActionCard
            key={action.key}
            action={action}
            operation={operations[action.key]}
            disabled={actionsDisabled}
            starting={actionStarting === action.key}
            onRun={onRunAction}
          />
        ))}
      </div>
    </section>
  )
}

function CoverageReportView({
  state,
  loading,
  operation,
  operationError,
  operationStarting,
  qaBusy,
  qaReady,
  onCollect,
  onReload,
}) {
  const alert = coverageReportAlert(state)
  const report = state?.report || null
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
      <div className="erp-dev-testing-coverage-overview">
        <Alert
          showIcon
          type={alert.type}
          message={alert.title}
          description={alert.description}
        />
        <CoverageOperationPanel operation={operation} error={operationError} />
        <div className="erp-dev-testing-coverage-actions">
          <code>{DEV_TESTING_COVERAGE_COLLECT_COMMAND}</code>
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={operationStarting || operationPresentation.active}
            disabled={
              operationPresentation.active || qaBusy?.active || !qaReady
            }
            onClick={onCollect}
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
          空值表示未采集，不是 0%。采集本地覆盖基线固定运行真实本地 baseline
          测试并自动聚合报告，但不会执行数据库写入、真实业务浏览器、目标环境部署或客户
          UAT；切换页面不会停止后台任务，“重新读取”只读取本地报告。指标口径不同，不合并为“全系统覆盖率”；skipped、blocked、missing、failed
          和 0 tests executed
          均不能算通过。应在代码基本稳定的检查点运行，不必每次编辑后执行；备用命令用于开发接口不可用时手工执行同一采集器。
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
  const isCloseoutView = view === VIEW_CLOSEOUT
  const isCoverageView = view === VIEW_COVERAGE
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
    if (
      requestedView === view &&
      !obsoleteDocKey &&
      !hasNonCanonicalRole &&
      !hasEmptyKeyword
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
    setSearchParams(nextParams, { replace: true })
  }, [
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

  const selectDocumentRole = (nextDocumentRole) => {
    const nextParams = new URLSearchParams(searchParams)
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
    if (nextKeyword) {
      nextParams.set(COMMAND_QUERY_KEY, nextKeyword)
    } else {
      nextParams.delete(COMMAND_QUERY_KEY)
    }
    setSearchParams(nextParams, { replace: true })
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
  const toolbarContext =
    view === VIEW_COMMANDS
      ? `${matchedSourceCount} 个来源 · ${allCommandBlocks.length} 个命令块`
      : isCloseoutView
        ? closeoutToolbarText
        : isCoverageView
          ? coverageToolbarText
          : DEV_TESTING_STRATEGY_SOURCE_PATH

  return (
    <div className="erp-dev-testing-page erp-dev-workspace-page">
      <DevPageNav sourcePath={DEV_TESTING_STRATEGY_SOURCE_PATH} />
      <header className="erp-dev-testing-header">
        <div className="erp-dev-testing-header__copy">
          <Text className="erp-dev-testing-header__eyebrow">
            本机开发工具 · Quality validation
          </Text>
          <Space align="center" size={10}>
            <SafetyCertificateOutlined className="erp-dev-testing-header__icon" />
            <Title level={1} className="erp-dev-testing-title">
              质量验证工作台
            </Title>
          </Space>
          <Paragraph className="erp-dev-testing-summary">
            先判断本轮要验证什么，再运行固定检查并核对结果。页面不接受自定义命令、路径或凭据。
          </Paragraph>
        </div>
        <div className="erp-dev-testing-header__context">
          <div>
            <Text strong>默认只看下一步</Text>
            <Text type="secondary">验证范围和复制命令放在下方按需展开。</Text>
          </div>
          <details>
            <summary>查看来源规模</summary>
            <Text type="secondary">
              {summary.tierCount} 个验证范围 · {summary.docCount} 个当前来源 ·{' '}
              {summary.commandBlockCount} 个命令块
            </Text>
          </details>
        </div>
      </header>

      <main className="erp-dev-testing-shell">
        <section className="erp-dev-testing-reader">
          <div className="erp-dev-testing-reader__toolbar">
            <Segmented
              aria-label="质量验证工作区主视图"
              options={VIEW_OPTIONS}
              value={view}
              onChange={selectView}
            />
            <Text type="secondary">{toolbarContext}</Text>
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
                onGeneratePlan={generateTestingPlan}
                onRunAction={runTestingAction}
              />
              <Alert
                className="erp-dev-testing-quality-gate-link"
                type="info"
                showIcon
                message="需要完整或严格门禁？"
                description="full / strict 的主操作、正式回执、真实耗时和覆盖缺口已统一放在质量门禁。终端命令仍可在策略文档详情中查阅。"
                action={
                  <Button
                    type="link"
                    onClick={() =>
                      navigate(
                        `${DEV_QUALITY_GATES_ROUTE}?view=run&profile=strict`
                      )
                    }
                  >
                    前往质量门禁
                  </Button>
                }
              />
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
              <div className="erp-dev-testing-command-list">
                {allCommandBlocks.length > 0 ? (
                  allCommandBlocks.map((block) => (
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
              state={coverageState}
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
        </section>
      </main>
    </div>
  )
}
