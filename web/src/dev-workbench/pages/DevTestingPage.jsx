import React, { useMemo, useState } from 'react'
import {
  CodeOutlined,
  CopyOutlined,
  DownOutlined,
  FileSearchOutlined,
  LeftOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Checkbox,
  Empty,
  Progress,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import { Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import Pagination from '@/common/components/pagination/AppPagination'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import SearchInput from '@/common/components/SearchInput'
import { message } from '@/common/utils/antdApp'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import { DEV_PAGINATION } from '../config/devPagination.mjs'
import DevTimestamp from '../components/DevTimestamp.jsx'
import { DevSourceReference } from '../components/DevSourceReferences.jsx'
import { WorkbenchNotice, WorkbenchReading, WorkbenchSection, WorkbenchToolbar } from '../components/WorkbenchPattern.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevPressurePanel from '../components/DevPressurePanel.jsx'
import DevBusinessRulesPanel from '../components/DevBusinessRulesPanel.jsx'
import DevTestingDetails from '../components/DevTestingDetails.jsx'
import DevTestingStrategyGuide from '../components/DevTestingStrategyGuide.jsx'
import DevTestingOverview from '../components/DevTestingOverview.jsx'
import DevTestingEnvironment from '../components/DevTestingEnvironment.jsx'
import DevVerificationEvidence from '../components/DevVerificationEvidence.jsx'
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
  DEV_TESTING_PRIMARY_VIEWS,
  DEV_TESTING_WORKSPACE_VIEWS,
  getDevTestingViewGroup,
  getDevTestingViewGroups,
  buildDevTestingViewNavigation,
  resolveDevTestingReturnView,
  buildDevTestingDocs,
  buildDevTestingCommandPage,
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
import { DEV_BUSINESS_CHAIN_AUDIT_ROUTE, DEV_PAGE_TITLE_BY_ROUTE, DEV_TESTING_ROUTE } from '../config/devRoutes.mjs'
import {
  createDevCoverageIdempotencyKey,
  createDevCoverageOperationClient,
  getDevCoverageOperationPresentation,
  isDevCoverageOperationActive,
  normalizeOptionalDevCoverageOperation,
} from '../config/devCoverageOperation.mjs'
import {
  DEV_TESTING_GIT_CLOSEOUT_STAGES,
  DEV_TESTING_GIT_HOOK_PATH_COMMAND,
  DEV_TESTING_FIXED_ACTIONS,
  DEV_TESTING_PREPARE_PUSH_COMMAND,
  getDevTestingGitHookStatusMeta,
  getDevTestingOperationPresentation,
  isDevTestingOperationActive,
} from '../config/devTestingOperation.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'
import useDevTestingOperations, { EMPTY_TESTING_OPERATIONS } from '../hooks/useDevTestingOperations.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_OVERVIEW = 'overview'
const VIEW_TIERS = 'tiers'
const VIEW_COMMANDS = 'commands'
const VIEW_CLOSEOUT = 'closeout'
const VIEW_COVERAGE = 'coverage'
const VIEW_CHAINS = 'chains'
const VIEW_PRESSURE = 'pressure'
const VIEW_GUIDE = 'guide'
const VIEW_QUERY_KEY = 'view'
const DOCUMENT_ROLE_QUERY_KEY = 'role'
const COMMAND_QUERY_KEY = 'q'

const VIEW_OPTIONS = DEV_TESTING_PRIMARY_VIEWS
const GUIDE_OPTIONS = [
  { label: '测试方式', value: 'methods' },
  { label: '真机回归', value: 'devices' },
  { label: '增长验证', value: 'growth' },
  { label: '验证范围', value: 'tiers' },
  { label: '常用命令', value: 'presets' },
]
const AUXILIARY_VIEW_VALUES = new Set([VIEW_COMMANDS, VIEW_CLOSEOUT])
const VIEW_VALUES = new Set([
  ...VIEW_OPTIONS.filter((option) => option.value !== VIEW_CHAINS).map((option) => option.value),
  ...AUXILIARY_VIEW_VALUES,
])

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
  return (
    <article className="erp-dev-testing-tier erp-dev-testing-simple-row">
      <DevTestingDetails inline id={`guide-tier-${tier.key}`} label={tier.level} title={tier.level}>
        <p>{tier.changeType}</p>
        {tier.description ? <p>{tier.description}</p> : null}
        <pre><code>{tier.copyText}</code></pre>
      </DevTestingDetails>
      <Button icon={<CopyOutlined aria-hidden="true" />} disabled={!tier.copyText} onClick={() => runCopy(tier.copyText)}>复制</Button>
    </article>
  )
}

function QuickPreset({ preset }) {
  return (
    <article className="erp-dev-testing-preset erp-dev-testing-simple-row">
      <DevTestingDetails inline id={`guide-preset-${preset.key}`} label={preset.label} title={preset.label}>
        <p>{preset.description}</p>
        <pre><code>{preset.commands.join('\n')}</code></pre>
      </DevTestingDetails>
      <Button icon={<CopyOutlined aria-hidden="true" />} onClick={() => runCopy(preset.commands.join('\n'))}>复制</Button>
    </article>
  )
}

function CommandBlock({ block }) {
  return (
    <article className="erp-dev-testing-command-block erp-dev-testing-command-block--simple" data-command-lines={block.commands.length}>
      <DevTestingDetails inline id={`command-${block.key}`} label={block.context || block.title} title={block.context || block.title}>
        <Text type="secondary">{block.sourceLabel || block.title} · {block.commands.length} 条固定命令</Text>
        <pre><code>{block.commandText}</code></pre>
      </DevTestingDetails>
      <Button icon={<CodeOutlined aria-hidden="true" />} onClick={() => runCopy(block.commandText)}>复制</Button>
    </article>
  )
}

function CommandLibraryGuide() {
  return (
    <Text type="secondary">按问题搜索，核对来源后复制命令；复制不会执行检查。</Text>
  )
}

const COVERAGE_METRIC_LABELS = Object.freeze({
  statements: '语句',
  lines: '行',
  branches: '分支',
  functions: '函数',
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
const COVERAGE_ISSUE_COUNTS = ['failed', 'skipped', 'blocked', 'missing']

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
      {meta.label.split(' / ')[0]}
    </Tag>
  )
}

function CoverageEvidenceCard({ item, showScenarios = false, noteInDetails = false }) {
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)
  const scenarios = item?.scenarios || []
  const visibleScenarios = onlyIncomplete
    ? scenarios.filter((scenario) => scenario.status !== 'passed')
    : scenarios
  const metrics = Object.entries(item?.metrics || {})
  const counts = Object.entries(item?.counts || {}).filter(
    ([, value]) => value !== null
  )
  const summaryCounts = counts.filter(([key, value]) =>
    key === 'executed' || key === 'passed' ||
    (key === 'total' ? value !== item?.counts?.executed : value > 0)
  )
  const evidence = Array.isArray(item?.evidence) ? item.evidence : []
  const deferNote = noteInDetails && ['collected', 'passed'].includes(item?.status) &&
    item?.counts?.executed > 0 && !counts.some(([key, value]) => value > 0 && COVERAGE_ISSUE_COUNTS.includes(key))
  const ScenarioContainer = showScenarios ? 'section' : 'details'

  const primaryMetric = metrics.find(([key]) => key === 'lines') || metrics[0]
  const issues = counts.filter(([key, value]) => COVERAGE_ISSUE_COUNTS.includes(key) && value > 0)
  const firstProblem = scenarios.find((scenario) => ['failed', 'blocked'].includes(scenario.status))
  const scenarioDetails = (
scenarios.length > 0 ? (
  <ScenarioContainer
    className="erp-dev-disclosure erp-dev-testing-coverage-scenarios"
    open={
            !showScenarios && item.key === 'go' && item.status === 'failed' ? true : undefined
          }
  >
    {showScenarios ? <Text strong>{scenarios.length} 个场景</Text> : <summary>查看 {scenarios.length} 个场景明细</summary>}
    <Checkbox
      checked={onlyIncomplete}
      onChange={(event) => setOnlyIncomplete(event.target.checked)}
    >
      仅看未通过场景
    </Checkbox>
    {visibleScenarios.length > 0 ? (
      <div className="erp-dev-testing-coverage-scenarios__table">
        <table data-table-lines="appearance">
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
                  {scenario.matchedTests.length > 0 || scenario.package ? (
                    <details className="erp-dev-disclosure">
                      <summary>{scenario.matchedTests.length} 条记录</summary>
                      {scenario.package ? <code>{scenario.package}</code> : null}
                      <ul>
                        {scenario.matchedTests.map((test) => (
                          <li key={test}><code>{test}</code></li>
                        ))}
                      </ul>
                    </details>
                  ) : <Text type="secondary">未记录</Text>}
                </td>
              </tr>
                  ))}
          </tbody>
        </table>
      </div>
          ) : (
            <p>没有未通过场景。</p>
          )}
  </ScenarioContainer>
      ) : null
  )
  return (
    <article className={`erp-dev-testing-coverage-card erp-dev-testing-coverage-card--${item?.status || 'not_collected'}`}>
      <div className="erp-dev-testing-coverage-card__head"><strong>{item?.label || '未命名证据'}</strong><CoverageStatusTag status={item?.status} /></div>
      <div className="erp-dev-testing-coverage-card__reading">
        {primaryMetric ? <span>{COVERAGE_METRIC_LABELS[primaryMetric[0]] || primaryMetric[0]} <b>{formatDevTestingCoverageMetric(primaryMetric[1])}</b></span> : item?.counts?.executed != null ? <span>已执行 {item.counts.executed} 项</span> : null}
        {issues.map(([key, value]) => <span key={key} data-issue={key}>{COVERAGE_COUNT_LABELS[key]} {value}</span>)}
      </div>
      <div className="erp-dev-testing-coverage-card__conclusion">
        {(['failed', 'blocked'].includes(item?.status) || issues.length > 0) && item.note ? <p className="erp-dev-testing-coverage-card__note">{item.note}</p> : null}
        {!showScenarios && firstProblem && (firstProblem.note || firstProblem.label) !== item.note ? <p className="erp-dev-testing-coverage-card__note">{firstProblem.note || firstProblem.label}</p> : null}
        <DevTestingDetails id={`coverage-${item?.key || item?.label || 'result'}`} label="结果详情" title={item?.label || '覆盖结果详情'}>
          <CoverageStatusTag status={item?.status} />
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
                {summaryCounts.map(([key, value]) => (
                  <span key={key} data-issue={value > 0 && COVERAGE_ISSUE_COUNTS.includes(key) ? key : undefined}>
                    {COVERAGE_COUNT_LABELS[key] || key} {value}
                  </span>
            ))}
              </div>
        ) : null}
            {metrics.length === 0 && counts.length === 0 ? (
              <span className="erp-dev-testing-coverage-card__no-reading">
                未采集数值
              </span>
        ) : null}
          </div>
          <div className="erp-dev-testing-coverage-card__conclusion">
            {item?.note && !deferNote ? (
              <p className="erp-dev-testing-coverage-card__note">{item.note}</p>
        ) : null}
            {evidence.length > 0 || counts.length > 0 || (deferNote && item?.note) ? (
              <section className="erp-dev-disclosure erp-dev-testing-coverage-card__details">
                <h3>口径与证据</h3>
                {deferNote && item?.note ? <p className="erp-dev-testing-coverage-card__note">{item.note}</p> : null}
                {counts.length > 0 ? <p>{counts.map(([key, value]) => `${COVERAGE_COUNT_LABELS[key] || key} ${value}`).join(' · ')}</p> : null}
                <div className="erp-dev-testing-coverage-card__evidence">
                  {evidence.map((entry) => (
                    <code key={entry}>{entry}</code>
              ))}
                </div>
              </section>
        ) : null}
          </div>
          {!showScenarios ? scenarioDetails : null}
        </DevTestingDetails>
      </div>
      {showScenarios ? scenarioDetails : null}
    </article>
  )
}

function CoverageSection({
  title,
  description,
  matrix = false,
  children,
}) {
  return (
    <WorkbenchSection flat className="erp-dev-testing-coverage-section" aria-label={title}>
      {description ? <Text type="secondary">{description}</Text> : null}
      {matrix ? (
        <div className="erp-dev-testing-coverage-matrix__head" aria-hidden>
          <span>检查项与状态</span>
          <span>本次读数</span>
          <span>结论与证据</span>
        </div>
      ) : null}
      {children}
    </WorkbenchSection>
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
                      <details className="erp-dev-disclosure erp-dev-testing-closeout-step__details">
                        <summary>职责边界</summary>
                        <small>{stage.boundary}</small>
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
                    <DevSourceReference path={check.sourcePath} />
                  </div>
                  <GitHookStatusTag status={check.status} />
                </div>
              ))}
            </div>
          </section>

          <details className="erp-dev-disclosure erp-dev-testing-closeout-command-disclosure">
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

function coverageReportAlert(state, source) {
  if (state?.status === 'snapshot') {
    return {
      type: 'info',
      title: '正在查看历史隔离验证',
      description:
        '仅对应报告中的源码快照，不能作为当前工作区结果。',
    }
  }
  if (state?.status === 'current') {
    return {
      type: 'success',
      title: '报告与当前仓库指纹匹配',
      description:
        '是否通过请看分项结果；空值表示未采集。',
    }
  }
  if (state?.status === 'stale') {
    return {
      type: 'warning',
      title: '覆盖报告已过期',
      description: `${
        state.message || '报告未绑定当前工作区，数值只能作为历史参考。'
      }`,
    }
  }
  if (state?.status === 'failed') {
    return {
      type: 'error',
      title: '覆盖报告读取失败',
      description:
        state.message && state.message !== '覆盖报告读取失败'
          ? `${state.message}；空值表示未采集，不是 0%。`
          : '请检查当前工作台报告接口；空值表示未采集，不是 0%。',
    }
  }
  if (source === 'snapshot') {
    return {
      type: 'info',
      title: '尚未归档隔离验证',
      description: state?.message || '当前没有可展示的历史隔离验证报告。',
    }
  }
  return {
    type: 'info',
    title: '当前工作区尚未验证',
    description: state?.message || (import.meta.env.PLUSH_STANDALONE_WORKBENCH ? '本服务尚未保存覆盖报告；CI 测试与覆盖率见服务器验证。' : '代码稳定后可采集本地覆盖基线；空值表示未采集，不是 0%。'),
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
        <details className="erp-dev-disclosure">
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

function ValidationPlanPanel({ plan, tiers, loading, error, busy, onGenerate, children }) {
  const shortCommit = plan?.repository?.commit?.slice(0, 12) || '未生成'
  return (
    <section className="erp-dev-testing-validation-plan" aria-label="验证计划">
      <div className="erp-dev-testing-validation-plan__head">
        <Button
          type="primary"
          icon={<FileSearchOutlined />}
          loading={loading}
          onClick={onGenerate}
          aria-label={plan ? '重新生成计划' : '生成本轮验证计划'}
        >
          {plan ? '更新验证计划' : '生成验证计划'}
        </Button>
        {children}
      </div>
      {busy?.active ? (
        <Alert
          showIcon
          type="info"
          message="当前执行端已有 QA 任务正在运行"
          description={`当前类型：${
            busy.kind === 'coverage' ? '覆盖基线' : '固定验证'
          } · ${busy.profile}。计划仍可只读生成，但新的执行动作会保持禁用。`}
        />
      ) : null}
      {error ? <Alert showIcon type="error" message={error} /> : null}
      {plan ? (
        <div className="erp-dev-testing-plan-summary">
          <span>{plan.changedCount} 个改动文件 · 建议 {plan.affectedScopes.length} 类检查</span>
          <DevTestingDetails id="validation-plan" label="计划详情" title="本轮验证计划">
            <div className="erp-dev-testing-validation-plan__body">
              <div
                className="erp-dev-testing-validation-plan__map"
                role="list"
                aria-label="改动到验证建议的映射"
              >
                <span role="listitem">
                  <small>改动输入</small>
                  <b>{plan.changedCount} 个文件</b>
                </span>
                <span role="listitem">
                  <small>建议范围</small>
                  <b>{plan.affectedScopes.map((scope) => tiers.find((tier) => tier.key === scope)?.level.replace(/^T[0-8]\s*/u, '') || scope).join('、')}</b>
                </span>
                <span role="listitem">
                  <small>后续判断</small>
                  <b>
                    {plan.commands.length} 项命令 · {plan.followUps.length} 项补证
                  </b>
                </span>
              </div>
              <section className="erp-dev-testing-validation-plan__details">
                <h3>查看建议命令、待补证据与计划身份</h3>
                <p>T0–T8 只表示选测范围，不表示检查已执行。</p>
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
                            <span>[{command.scope === 'LOCAL_FULL' ? '本地完整门禁' : command.scope}] {command.label}</span>
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
              </section>
            </div>
          </DevTestingDetails>
          {plan.localGate === 'full' ? (
            <Alert
              showIcon
              type="warning"
              message="当前改动需要完整门禁"
              description="计划只说明选择结果，不会替你执行 full、数据库、浏览器、发布或 UAT。"
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function ValidationActionRow({ action, operation, disabled, starting, onRun }) {
  const [expanded, setExpanded] = useState(false)
  const presentation = getDevTestingOperationPresentation(operation)
  const detailId = `testing-action-${action.key}-details`
  const tagColor = {
    primary: 'blue',
    success: 'green',
    warning: 'gold',
    danger: 'red',
  }[presentation.tone]
  return (
    <>
      <tr className="erp-dev-testing-validation-row" data-action-key={action.key}>
        <th scope="row">
          <Button
            type="link"
            className="erp-dev-testing-action-details-trigger"
            icon={expanded ? <DownOutlined /> : <RightOutlined />}
            aria-label={`查看${action.label}详情`}
            aria-expanded={expanded}
            aria-controls={detailId}
            onClick={() => setExpanded((value) => !value)}
          >
            {action.shortLabel}
          </Button>
        </th>
        <td>
          <Tag color={tagColor}>{presentation.label}</Tag>
          {operation?.message && presentation.tone !== 'success' && action.key !== 'rpc-examples' ? <p role="status">{operation.message}</p> : null}
        </td>
        <td>
          {action.key === 'rpc-examples' ? (
            <Text type="secondary">接口样例检查</Text>
          ) : (
            <Button
              icon={<PlayCircleOutlined />}
              loading={starting || presentation.active}
              disabled={disabled || presentation.active}
              aria-label={action.label}
              onClick={() => onRun(action.key)}
            >
              {presentation.active ? '运行中…' : '运行'}
            </Button>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={3}>
            <div id={detailId} className="erp-dev-testing-validation-row__details">
              <p>{action.description}</p>
              <p>{action.boundary}</p>
              {operation?.message ? <p>{operation.message}</p> : null}
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
            </div>
          </td>
        </tr>
      ) : null}
    </>
  )
}

function ValidationWorkspace({
  plan,
  tiers,
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
        tiers={tiers}
        loading={planLoading}
        error={planError}
        busy={busy}
        onGenerate={onGeneratePlan}
      >
        <DevCustomerScopeSelector
          compact
          scope={customerScope}
          onChange={customerScope.selectCustomer}
          disabled={customerSelectorDisabled}
          label="权限检查客户"
          note=""
          invalidDescription="岗位权限与任务可见性巡检已停止；开发门禁与字段联动专项仍可独立运行。"
        />
      </ValidationPlanPanel>
      {summaryError ? (
        <Alert
          showIcon
          type="error"
          message={summaryError}
          description="后台任务可能仍在运行；状态恢复前请勿重复发起。"
        />
      ) : null}
      <div className="erp-dev-testing-validation__actions erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="固定检查与独立证据">
          <thead>
            <tr>
              <th scope="col">检查</th>
              <th scope="col">最近结果</th>
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
  strategySource,
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
  onRunConsistency,
  onReload,
}) {
  const [reportParams, setReportParams] = useSearchParams()
  const { state: coverageNavigationState } = useLocation()
  const source = reportParams.getAll('reportSource').length === 1 && reportParams.get('reportSource') === 'snapshot'
    ? 'snapshot' : 'workspace'
  const requestedDomain = reportParams.getAll('coverageDomain').length === 1 ? reportParams.get('coverageDomain') : ''
  const setSource = (nextSource) => {
    const next = new URLSearchParams(reportParams)
    if (nextSource === 'snapshot') next.set('reportSource', nextSource)
    else next.delete('reportSource')
    next.delete('coverageDomain')
    setReportParams(next, { state: coverageNavigationState })
  }
  const setRequestedDomain = (domain) => {
    const next = new URLSearchParams(reportParams)
    if (domain) next.set('coverageDomain', domain)
    else next.delete('coverageDomain')
    setReportParams(next, { state: coverageNavigationState })
  }
  const activeState = source === 'snapshot' ? snapshotState : state
  const alert = coverageReportAlert(activeState, source)
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
      <div className="erp-dev-testing-coverage-overview">
        <WorkbenchToolbar
          className="erp-dev-testing-coverage-toolbar"
          actions={(
            <>
              {!import.meta.env.PLUSH_STANDALONE_WORKBENCH ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined aria-hidden="true" />}
                  loading={operationStarting || operationPresentation.active}
                  disabled={
                operationPresentation.active || qaBusy?.active || !qaReady
              }
                  onClick={() => {
                setSource('workspace')
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
            ) : null}
              <Button
                icon={<ReloadOutlined aria-hidden="true" />}
                loading={loading}
                onClick={onReload}
              >
                重新读取
              </Button>
            </>
          )}
        >

          <Segmented
            aria-label="覆盖报告来源"
            className="erp-dev-testing-coverage-source"
            value={source}
            onChange={setSource}
            options={[
              { label: '当前工作区', value: 'workspace' },
              { label: '历史隔离验证', value: 'snapshot' },
            ]}
          />
        </WorkbenchToolbar>
        <WorkbenchNotice
          className="erp-dev-testing-coverage-summary"
          tone={loading && !report ? 'loading' : alert.type}
          title={loading && !report ? '正在读取报告…' : alert.title}
          description={alert.type === 'error' ? alert.description : undefined}
          action={report ? <DevTimestamp value={report.generatedAt} action="采集于" missing="采集时间未记录" /> : null}
        />
        {operationError || (operation && operation.status !== 'completed') ? (
          <CoverageOperationPanel operation={operation} error={operationError} />
        ) : null}

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
              {report && status && !['passed', 'collected', 'not_applicable'].includes(status) ? (
                <Tag color={coverageTagColor(getDevTestingCoverageStatusMeta(status).tone)}>
                  {getDevTestingCoverageStatusMeta(status).label.split(' / ')[0]}
                </Tag>
              ) : null}
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
        {section === 'rules' ? <DevBusinessRulesPanel report={report} reportCurrent={source === 'workspace' && activeState?.status === 'current'} onRunConsistency={onRunConsistency} consistencyBusy={!qaReady || qaBusy?.active} /> : null}

        {loading && !report && section !== 'rules' ? (
          <section
            className="erp-dev-testing-coverage-loading"
            aria-label="覆盖报告加载中"
          >
            <Skeleton active paragraph={{ rows: 2 }} />
          </section>
        ) : null}

        {!loading && !report && source === 'snapshot' && activeState?.status !== 'failed' && section !== 'rules' ? <Button onClick={() => setSource('workspace')}>查看当前工作区</Button> : null}

        {report && section !== 'rules' ? (
          <>
            {section === 'code' ? (
              <CoverageSection
                title="代码覆盖"
                description="Go 含生成物，Web 仅计已加载模块；均不等于本轮改动覆盖。"
              >
                <div className="erp-dev-testing-coverage-grid erp-dev-testing-coverage-grid--code">
                  <CoverageEvidenceCard item={report.codeCoverage.go} noteInDetails />
                  <CoverageEvidenceCard item={report.codeCoverage.web} noteInDetails />
                </div>
              </CoverageSection>
            ) : null}

            {section === 'business' ? (
              <CoverageSection
                title="业务场景"
                description="按业务域看适用合同、关键场景和模块覆盖，不以代码行覆盖替代。"
                matrix={false}
              >
                {domains.length > 0 ? (
                  <div className="erp-dev-testing-coverage-domain-table-wrap">
                    <table
                      className="erp-dev-testing-coverage-domain-table"
                      data-table-lines="appearance"
                      aria-label="业务域覆盖总览"
                    >
                      <thead>
                        <tr>
                          <th scope="col">业务域</th>
                          <th scope="col">状态</th>
                          <th scope="col">执行 / 声明</th>
                          <th scope="col">通过</th>
                          <th scope="col">失败 / 跳过 / 受阻 / 缺失</th>
                        </tr>
                      </thead>
                      <tbody>
                        {domains.map((item) => (
                          <React.Fragment key={item.key}>
                            <tr>
                              <th scope="row">
                                <Button
                                  type="link"
                                  aria-label={`查看 ${item.label} 场景与证据`}
                                  aria-expanded={selectedDomain?.key === item.key}
                                  onClick={() => setRequestedDomain(selectedDomain?.key === item.key ? '' : item.key)}
                                >
                                  {item.label}
                                </Button>
                              </th>
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
                            </tr>
                            {selectedDomain?.key === item.key ? <tr><td colSpan={5}><CoverageEvidenceCard item={item} showScenarios /></td></tr> : null}
                          </React.Fragment>
                            ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <CoverageEvidenceCard item={report.businessCoverage} />
                )}
              </CoverageSection>
            ) : null}

            {section === 'gates' ? (
              <CoverageSection
                title="门禁结果"
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
                title="运行与验收"
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
        <DevTestingDetails id="coverage-info" label="报告信息" title="覆盖报告信息">
          {section === 'acceptance' ? <DevTestingStrategyGuide source={strategySource} evidence /> : null}
          {report || operation?.status === 'completed' ? (
            <section className="erp-dev-testing-coverage-report-details">
              <h3>报告详情与采集记录</h3>
              {report ? (
                <div className="erp-dev-testing-coverage-identity">
                  <span><small>来源</small>{source === 'snapshot' ? '历史隔离验证' : '工作区报告'}</span>
                  <span><small>提交</small><code>{shortCommit}</code></span>
                  <span><small>源码</small>{repository.dirty === null ? '未记录' : repository.dirty ? '有未提交改动' : '干净'}</span>
                  <span><small>采集时间</small><DevTimestamp value={report.generatedAt} missing="时间未记录" /></span>
                  <span className="erp-dev-testing-coverage-identity__fingerprint"><small>Fingerprint</small><code>{repository.fingerprint || '未记录'}</code></span>
                </div>
            ) : null}
              {operation?.status === 'completed' ? (
                <div className="erp-dev-testing-coverage-last-run">
                  <Text strong>工作区上次采集：{operationPresentation.label}</Text>
                  <CoverageOperationPanel operation={operation} error="" />
                </div>
            ) : null}
            </section>
        ) : null}
          <section className="erp-dev-testing-coverage-boundary">
            <h3>采集与判定说明</h3>
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
              空值表示未采集，不是 0%。“重新读取”只读取当前工作台保存的报告，历史报告的执行环境与范围按原始证据核对。指标口径不同，不合并为“全系统覆盖率”；skipped、blocked、missing、failed
              和 0 tests executed
              均不能算通过。
            </Paragraph>
            {import.meta.env.PLUSH_STANDALONE_WORKBENCH ? (
              <Paragraph>采集覆盖基线请到本地开发机工作台；服务器 CI 测试与覆盖率在“服务器验证”核对。</Paragraph>
          ) : (
            <>
              <Paragraph>
                采集本地覆盖基线固定运行真实本地 baseline 测试并聚合报告，不会执行数据库写入、真实业务浏览器、目标环境部署或客户 UAT。
                切换页面不会停止后台任务。应在代码基本稳定的检查点运行，不必每次编辑后执行；开发接口不可用时，可在本地开发机运行备用命令 {DEV_TESTING_COVERAGE_COLLECT_COMMAND}。
              </Paragraph>
              <Button icon={<CopyOutlined />} onClick={() => runCopy(DEV_TESTING_COVERAGE_COLLECT_COMMAND)}>复制本地采集命令</Button>
            </>
          )}
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
          </section>
        </DevTestingDetails>
      </div>
    </div>
  )
}

export default function DevTestingPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, updateSearchParams] = useSearchParams()
  const setSearchParams = React.useCallback((next, options) => {
    updateSearchParams(next, { state: location.state, ...options })
  }, [location.state, updateSearchParams])
  const isChainReportView = location.pathname.replace(/\/+$/u, '') === DEV_BUSINESS_CHAIN_AUDIT_ROUTE
  const coverageRequestSequence = React.useRef(0)
  const coverageStartInFlight = React.useRef(false)
  const coverageIdempotencyKey = React.useRef('')
  const handledCoverageTerminal = React.useRef('')
  const [testingPlan, setTestingPlan] = useState(null)
  const [testingPlanLoading, setTestingPlanLoading] = useState(false)
  const [testingPlanError, setTestingPlanError] = useState('')
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
  const {
    testingOperationClient,
    testingSummary,
    testingSummaryError,
    testingBusy,
    testingHasActive,
    testingActionStarting,
    reloadTestingSummary,
    runTestingAction: startTestingAction,
  } = useDevTestingOperations()
  const consistencyTerminal = testingSummary?.operations?.['business-consistency']
  const consistencyStatus = consistencyTerminal?.status
  React.useEffect(() => {
    if (['completed', 'failed'].includes(consistencyStatus)) {
      setCoverageReloadKey((value) => value + 1)
    }
  }, [consistencyTerminal?.id, consistencyTerminal?.revision, consistencyStatus])
  const docs = useMemo(() => buildDevTestingDocs(markdownModules), [])
  const strategySource =
    docs.find((item) => item.path === DEV_TESTING_STRATEGY_SOURCE_PATH)
      ?.source || ''
  const tiers = useMemo(
    () => parseDevTestingStrategyTiers(strategySource),
    [strategySource]
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
  const view = isChainReportView ? VIEW_CHAINS : VIEW_VALUES.has(requestedView) ? requestedView : import.meta.env.PLUSH_STANDALONE_WORKBENCH ? 'server' : VIEW_OVERVIEW
  const coverageSection = parseDevTestingCoverageSection(searchParams)
  const guideTopic = GUIDE_OPTIONS.find((item) => item.value === searchParams.get('guide'))?.value || GUIDE_OPTIONS[0].value
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
    normalize: view === VIEW_TIERS,
  })
  const customerReady = customerScope.status === 'ready'
  const isCloseoutView = view === VIEW_CLOSEOUT
  const isCoverageView = view === VIEW_COVERAGE
  const readsCoverage = isCoverageView || view === VIEW_OVERVIEW
  const isAuxiliaryView = AUXILIARY_VIEW_VALUES.has(view)
  const viewGroup = getDevTestingViewGroup(view)
  const lastWorkspaceView = React.useRef(VIEW_OVERVIEW)
  React.useEffect(() => {
    if (DEV_TESTING_WORKSPACE_VIEWS.some(({ value }) => value === view)) {
      lastWorkspaceView.current = view
    }
  }, [view])
  const returnView = resolveDevTestingReturnView(searchParams)
  const returnViewLabel = DEV_TESTING_PRIMARY_VIEWS.find(({ value }) => value === returnView).label
  const requestedDocumentRole =
    searchParams.get(DOCUMENT_ROLE_QUERY_KEY) || 'all'
  const documentRole = documentRoleValues.has(requestedDocumentRole)
    ? requestedDocumentRole
    : 'all'
  const keyword = searchParams.get(COMMAND_QUERY_KEY) || ''
  const matchingPresets = useMemo(() => {
    const query = keyword.trim().toLowerCase()
    return DEV_TESTING_COPY_PRESETS.filter((preset) =>
      `${preset.label} ${preset.description} ${preset.commands.join(' ')}`.toLowerCase().includes(query)
    )
  }, [keyword])
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
  const commandPage = useMemo(
    () => buildDevTestingCommandPage(allCommandBlocks, searchParams),
    [allCommandBlocks, searchParams]
  )
  const coverageOperationId = coverageOperation?.id || ''
  const coverageOperationIsActive =
    isDevCoverageOperationActive(coverageOperation)
  React.useEffect(() => {
    if (!readsCoverage) return undefined

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
                message: '覆盖报告读取失败，请检查当前工作台报告接口',
              },
              httpStatus: 500,
            }
      const snapshotResult =
        snapshot.status === 'fulfilled'
          ? snapshot.value
          : {
              payload: {
                status: 'failed',
                message: '隔离验证报告读取失败，请检查当前工作台报告接口',
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
  }, [coverageReloadKey, readsCoverage, view])

  const handleCoverageTerminal = React.useCallback((operation) => {
    if (!operation || isDevCoverageOperationActive(operation)) return
    const terminalKey = `${operation.id}:${operation.revision}`
    if (handledCoverageTerminal.current === terminalKey) return
    handledCoverageTerminal.current = terminalKey
    coverageIdempotencyKey.current = ''
    setCoverageReloadKey((current) => current + 1)
    reloadTestingSummary()
    if (operation.status === 'completed' && operation.outcome === 'passed') {
      message.success({ content: operation.message, key: 'coverage-collect' })
    } else if (operation.status === 'completed') {
      message.warning({ content: operation.message, key: 'coverage-collect' })
    } else if (operation.status === 'failed') {
      message.error({ content: operation.message, key: 'coverage-collect' })
    } else {
      message.warning({ content: operation.message, key: 'coverage-collect' })
    }
  }, [reloadTestingSummary])

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
    if (isChainReportView) return
    const hasNonCanonicalRole =
      requestedDocumentRole !== documentRole ||
      (documentRole === 'all' && searchParams.has(DOCUMENT_ROLE_QUERY_KEY))
    const hasEmptyKeyword = searchParams.has(COMMAND_QUERY_KEY) && !keyword
    const hasNonCanonicalReturnView = searchParams.has('returnView') &&
      (view !== VIEW_COMMANDS || searchParams.getAll('returnView').length !== 1 || searchParams.get('returnView') !== returnView)
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
      !hasNonCanonicalCommandPage &&
      !hasNonCanonicalReturnView
    ) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(VIEW_QUERY_KEY, view)
    nextParams.delete('doc')
    if (hasNonCanonicalReturnView) nextParams.delete('returnView')
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
    isChainReportView,
    coverageSection,
    commandPage.page,
    documentRole,
    keyword,
    obsoleteDocKey,
    requestedDocumentRole,
    requestedView,
    returnView,
    searchParams,
    setSearchParams,
    view,
  ])

  const selectView = (nextView) => {
    if (nextView === view) return
    const destination = buildDevTestingViewNavigation(location, nextView)
    navigate(destination.to, { state: destination.state })
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

  const reloadCoverage = () => {
    setCoverageReloadKey((current) => current + 1)
    reloadTestingSummary()
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

  const runTestingAction = (action, dataScale) => {
    if (action === 'role-access' && !customerReady) return
    return startTestingAction(action, dataScale)
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
      reloadTestingSummary()
      if (!isDevCoverageOperationActive(operation)) {
        handleCoverageTerminal(operation)
      }
    } catch (_error) {
      setCoverageOperationError(
        '采集请求暂时未确认；再次点击会复用同一请求，不会重复启动测试。'
      )
      message.error({
        content: '覆盖基线采集暂时无法确认，请检查当前工作台服务',
        key: 'coverage-collect',
      })
    } finally {
      coverageStartInFlight.current = false
      setCoverageOperationStarting(false)
    }
  }

  const hookReadyCount =
    testingSummary?.hooks?.checks?.filter((check) => check.status === 'ready')
      .length || 0
  const hookCheckCount = testingSummary?.hooks?.checks?.length || 0
  const closeoutToolbarText = testingSummaryError
    ? 'Hook 接线读取失败'
    : testingSummary?.hooks
      ? `${hookReadyCount}/${hookCheckCount} 项接线完整`
      : '正在读取 Hook 接线…'
  const commandLibrary = (
    <div className="erp-dev-testing-command-view">
      <WorkbenchToolbar actions={returnView !== VIEW_GUIDE ? <Button type="link" onClick={() => selectView(returnView)}>返回{returnViewLabel}</Button> : null}>
        <Text type="secondary">找到 {allCommandBlocks.length} 项命令</Text>
      </WorkbenchToolbar>
      <CommandLibraryGuide />
      <div className="erp-dev-testing-command-tools">
        <SearchInput
          allowClear
          className="erp-dev-testing-search"
          placeholder="搜索命令、来源、验收词"
          value={keyword}
          onSearch={(value) => setCommandKeyword(value)}
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
        <Pagination
          {...DEV_PAGINATION}
          current={commandPage.page}
          pageSize={DEV_TESTING_COMMAND_PAGE_SIZE}
          total={commandPage.total}
          hideOnSinglePage
          onChange={selectCommandPage}
        />
      </nav>
      <div className="erp-dev-testing-command-matrix__head erp-dev-testing-command-matrix__head--simple" aria-hidden><span>检查</span><span>操作</span></div>
      <div className="erp-dev-testing-command-list">
        {allCommandBlocks.length > 0 ? (
                  commandPage.items.map((block) => (
                    <CommandBlock
                      key={block.key}
                      block={block}
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
  )
  return (
    <div className="erp-dev-testing-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-testing-header"
        title={
          <div className="erp-dev-testing-header__copy">
            <Space align="center" size={10}>
              <SafetyCertificateOutlined className="erp-dev-testing-header__icon" />
              <Title level={1} className="erp-dev-testing-title">
                {isCloseoutView
                  ? 'Git 收口检查'
                  : view === VIEW_COMMANDS
                    ? '专项检查命令'
                    : DEV_PAGE_TITLE_BY_ROUTE[DEV_TESTING_ROUTE]}
              </Title>
            </Space>
          </div>
        }
        navigation={
          <>
            <div
              className="erp-dev-testing-group-nav"
              hidden={isAuxiliaryView && view !== VIEW_COMMANDS}
            >
              <SlidingTabList
                aria-label="测试环境与指引"
                options={getDevTestingViewGroups(
                  Boolean(import.meta.env.PLUSH_STANDALONE_WORKBENCH)
                )}
                value={viewGroup}
                onChange={(group) =>
                  selectView(
                    group === 'workspace' ? lastWorkspaceView.current : group
                  )
                }
              />
            </div>
            <div
              className="erp-dev-testing-auxiliary-nav"
              hidden={!isAuxiliaryView || view === VIEW_COMMANDS}
            >
              {!isCloseoutView ? (
                <Button
                  type="link"
                  icon={<LeftOutlined aria-hidden="true" />}
                  onClick={() => selectView(returnView)}
                >
                  返回{returnViewLabel}
                </Button>
              ) : null}
              <Text type="secondary">
                {isCloseoutView
                  ? closeoutToolbarText
                  : `找到 ${allCommandBlocks.length} 项命令`}
              </Text>
            </div>
          </>
        }
      />

      <main className="erp-dev-testing-shell">
        <div className="erp-dev-testing-scope">
          <DevTestingEnvironment view={view} compact />
          <div className="erp-dev-testing-primary-nav" hidden={viewGroup !== 'workspace' || isAuxiliaryView}>
            <SlidingTabList
              aria-label="测试验证工作区主视图"
              options={DEV_TESTING_WORKSPACE_VIEWS}
              value={viewGroup === 'workspace' && !isAuxiliaryView ? view : lastWorkspaceView.current}
              onChange={selectView}
            />
          </div>
        </div>
        <section className={view === 'server' ? undefined : 'erp-dev-testing-reader'}>
          <React.Suspense fallback={<Loading title="正在读取链路报告" />}>
            <Outlet />
          </React.Suspense>
          {view === 'server' ? <DevVerificationEvidence /> : null}
          {view === VIEW_OVERVIEW ? (
            <DevTestingOverview
              state={coverageState}
              snapshotState={coverageSnapshotState}
              loading={coverageLoading}
              onReload={() => setCoverageReloadKey((value) => value + 1)}
            />
          ) : null}
          {view === VIEW_TIERS && import.meta.env.PLUSH_STANDALONE_WORKBENCH ? (
            <Alert type="info" showIcon message="本轮固定检查与覆盖基线采集在本地开发机执行；CI 结果见“服务器验证”，本服务的压力测试使用隔离环境。" />
          ) : null}
          {view === VIEW_TIERS && !import.meta.env.PLUSH_STANDALONE_WORKBENCH ? (
            <div className="erp-dev-testing-tier-view">
              <ValidationWorkspace
                plan={testingPlan}
                tiers={tiers}
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
            </div>
          ) : null}

          {view === VIEW_GUIDE || view === VIEW_COMMANDS ? (
            <section className="erp-dev-testing-guide" aria-label="测试指引">
              <WorkbenchReading
                className="erp-dev-testing-guide-reading"
                label="测试指引目录"
                items={GUIDE_OPTIONS}
                value={view === VIEW_COMMANDS ? 'presets' : guideTopic}
                onChange={(value) => {
                  const next = new URLSearchParams(searchParams)
                  next.set('guide', value)
                  next.set(VIEW_QUERY_KEY, VIEW_GUIDE)
                  next.delete('returnView')
                  next.delete('testingDetail')
                  setSearchParams(next, { state: location.state })
                }}
              >
                <h2>{view === VIEW_COMMANDS ? '常用命令' : GUIDE_OPTIONS.find((item) => item.value === guideTopic).label}</h2>
                {view === VIEW_COMMANDS ? commandLibrary : ['methods', 'devices', 'growth'].includes(guideTopic) ? (
                  <DevTestingStrategyGuide source={strategySource} topic={guideTopic} />
                  ) : guideTopic === 'tiers' ? (
                    <section className="erp-dev-testing-guide-tiers">
                      <div className="erp-dev-testing-tier-grid">{tiers.map((tier) => <TierCard key={tier.key} tier={tier} />)}</div>
                    </section>
                  ) : (
                    <section className="erp-dev-testing-guide-presets">
                      <div className="erp-dev-testing-related">
                        <SearchInput allowClear placeholder="搜索常用检查" value={keyword} onSearch={(value) => setCommandKeyword(value)} />
                        <Button onClick={() => selectView(VIEW_COMMANDS)}>查专项命令</Button>
                      </div>
                      <div className="erp-dev-testing-presets" aria-label="常用测试命令预设">{matchingPresets.map((preset) => <QuickPreset key={preset.key} preset={preset} />)}</div>
                      {matchingPresets.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的常用检查" /> : null}
                    </section>
                  )}
              </WorkbenchReading>
            </section>
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
              strategySource={strategySource}
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
              onRunConsistency={() => runTestingAction('business-consistency')}
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
            />
          ) : null}

        </section>
      </main>
    </div>
  )
}
