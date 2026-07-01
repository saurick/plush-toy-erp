import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ApartmentOutlined,
  CheckCircleOutlined,
  CodeOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  ExclamationCircleOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Segmented,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  activateCustomerConfig,
  getEffectiveSession,
  publishCustomerConfig,
  validateCustomerConfig,
} from '../api/customerConfigApi.mjs'
import {
  DEV_CUSTOMER_CONFIG_QUERY_KEY,
  buildCustomerConfigDevOverviewFromSearch,
} from '../config/devCustomerConfig.mjs'

const { Paragraph, Text, Title } = Typography

const VIEW_OVERVIEW = 'overview'
const VIEW_PREFLIGHT = 'preflight'
const VIEW_DIFF = 'diff'
const VIEW_ASSETS = 'assets'
const VIEW_IMPORT = 'import'

const VIEW_OPTIONS = [
  { label: '总览 / Overview', value: VIEW_OVERVIEW },
  { label: '包预检 / Preflight', value: VIEW_PREFLIGHT },
  { label: '差异预览 / Diff', value: VIEW_DIFF },
  { label: '菜单字段 / Assets', value: VIEW_ASSETS },
  { label: '导入工作台 / Import', value: VIEW_IMPORT },
]

function StatusTag({ status }) {
  const colorByStatus = {
    已接前端运行时: 'green',
    草案: 'gold',
    未批准: 'red',
    禁止误接: 'red',
    未登记: 'red',
    runtime_frontend_only: 'green',
    evidence_only: 'blue',
    preview_only: 'cyan',
    report_gate_only: 'purple',
    passed: 'green',
    blocked: 'red',
    blocked_by_design: 'volcano',
    draft_only: 'gold',
    REVIEW_READY: 'green',
    PREVIEW_READY: 'cyan',
    BLOCKED: 'red',
    no_write: 'green',
    test_apply_ready: 'blue',
    test_apply_done: 'green',
    release_gate_required: 'purple',
    separate_task_required: 'volcano',
    source_grounded: 'green',
    required: 'gold',
    enabled: 'green',
    read_only: 'gold',
    disabled: 'red',
    待客户确认: 'gold',
    暂不接运行时: 'orange',
    后续评审: 'default',
  }
  return <Tag color={colorByStatus[status] || 'default'}>{status}</Tag>
}

function DecisionCard({ item }) {
  return (
    <article className="erp-dev-customer-decision-card">
      <div className="erp-dev-customer-decision-card__head">
        <Text type="secondary">{item.label}</Text>
        <StatusTag status={item.status} />
      </div>
      <strong>{item.outcome}</strong>
      <Text>{item.note}</Text>
      <Text type="secondary">{item.nextAction}</Text>
    </article>
  )
}

function QuickAction({ icon, title, note, status, onClick }) {
  return (
    <button
      className="erp-dev-customer-quick-action"
      type="button"
      onClick={onClick}
    >
      <span className="erp-dev-customer-quick-action__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="erp-dev-customer-quick-action__copy">
        <span>{title}</span>
        <small>{note}</small>
      </span>
      <StatusTag status={status} />
    </button>
  )
}

function ReviewChecklistItem({ item }) {
  return (
    <article className="erp-dev-customer-review-item">
      <div className="erp-dev-customer-review-item__main">
        <div className="erp-dev-customer-review-item__head">
          <Text strong>{item.label}</Text>
          <StatusTag status={item.status} />
        </div>
        <Text type="secondary">{item.role}</Text>
        <Text className="erp-dev-customer-review-item__path">
          {item.sourcePath}
        </Text>
      </div>
      <Text>{item.nextAction}</Text>
    </article>
  )
}

function SourceReference({ item }) {
  return (
    <article className="erp-dev-customer-source-ref">
      <div>
        <Text strong>{item.label}</Text>
        <Text type="secondary">{item.sourcePath}</Text>
      </div>
      <StatusTag status={item.status} />
    </article>
  )
}

function copyText(value) {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    message.info('当前浏览器不支持直接复制')
    return
  }
  navigator.clipboard
    .writeText(value)
    .then(() => message.success('已复制命令'))
    .catch(() => message.error('复制失败，请手动选择命令'))
}

function getCustomerConfigActionError(error, fallback) {
  const code = error?.code
  const rawMessage =
    typeof error?.message === 'string' ? error.message.trim() : ''
  if (code === 40302 || rawMessage.includes('未登录')) {
    return '请先登录后台管理员账号，再执行客户配置应用。'
  }
  if (code === 40303 || rawMessage.includes('无权限')) {
    return '当前管理员没有客户配置发布或激活权限。'
  }
  if (error?.isNetworkError) {
    return '无法连接本地后端，请确认 server-dev 正在运行。'
  }
  return getActionErrorMessage(error, fallback)
}

function CommandBlock({ command }) {
  return (
    <div className="erp-dev-customer-command">
      <code>{command}</code>
      <Tooltip title="复制命令">
        <Button
          type="text"
          icon={<CopyOutlined />}
          aria-label="复制命令"
          onClick={() => copyText(command)}
        />
      </Tooltip>
    </div>
  )
}

function CommandList({ commands = [] }) {
  return (
    <div className="erp-dev-customer-tool-list">
      {commands.map((item) => (
        <article className="erp-dev-customer-tool" key={item.key}>
          <div className="erp-dev-customer-tool__head">
            <Text strong>{item.label}</Text>
          </div>
          <Text type="secondary">{item.note}</Text>
          <CommandBlock command={item.command} />
        </article>
      ))}
    </div>
  )
}

function DryRunSummary({ dryRunState, onRunDryRun }) {
  const [showReportPreview, setShowReportPreview] = useState(false)

  if (dryRunState.status === 'idle') {
    return (
      <Alert
        type="info"
        showIcon
        message="尚未运行测试 Dry Run"
        description="点击运行后会调用本地开发服务，只生成 output evidence，不写后端数据库。"
      />
    )
  }

  if (dryRunState.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        message="Dry Run 正在生成"
        description="正在读取 fixture source snapshot 与现有 V1 sample，完成后会回显报告路径和阻塞数量。"
      />
    )
  }

  if (dryRunState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="Dry Run 生成失败"
        description={dryRunState.error || '请查看 Vite 终端输出。'}
      />
    )
  }

  const result = dryRunState.result || {}
  const summary = result.summary || {}
  const actionCounts = summary.candidateCountsByAction || {}
  const unresolvedCounts = summary.unresolvedCountsBySeverity || {}
  const hasReportPreview = Boolean(result.reportPreview)

  return (
    <div className="erp-dev-customer-dry-run-result">
      <Alert
        type="success"
        showIcon
        message="Dry Run 已生成"
        description="测试版 UI 已生成 evidence；该结果仍不代表正式导入批准。"
      />
      <div className="erp-dev-customer-dry-run-actions">
        <Button
          type="primary"
          loading={dryRunState.status === 'running'}
          onClick={onRunDryRun}
        >
          重新运行 Dry Run
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={() => copyText(result.outputPath || '')}
        >
          复制输出目录
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={() => copyText(result.reportPath || '')}
        >
          复制报告路径
        </Button>
        <Button
          icon={<FileTextOutlined />}
          disabled={!hasReportPreview}
          onClick={() => setShowReportPreview((visible) => !visible)}
        >
          {showReportPreview ? '收起报告摘要' : '查看报告摘要'}
        </Button>
      </div>
      <div className="erp-dev-customer-dry-run-metrics">
        <div>
          <Text type="secondary">来源行 / Sources</Text>
          <Text strong>{summary.totalSources}</Text>
        </div>
        <div>
          <Text type="secondary">候选创建 / Creates</Text>
          <Text strong>{actionCounts.create || 0}</Text>
        </div>
        <div>
          <Text type="secondary">阻塞 / Blockers</Text>
          <Text strong>{summary.blockerCount}</Text>
        </div>
        <div>
          <Text type="secondary">正式导入</Text>
          <Text strong>
            {summary.canExecuteRealImport ? '可执行' : '不可执行'}
          </Text>
        </div>
      </div>
      <div className="erp-dev-customer-dry-run-paths">
        <Text type="secondary">输出目录 / Output</Text>
        <Text code>{result.outputPath}</Text>
        <Text type="secondary">报告 / Report</Text>
        <Text code>{result.reportPath}</Text>
        <Text type="secondary">未决队列 / Unresolved</Text>
        <Text>
          block {unresolvedCounts.block || 0} / defer{' '}
          {unresolvedCounts.defer || 0} / review {unresolvedCounts.review || 0}
        </Text>
      </div>
      {showReportPreview && hasReportPreview ? (
        <pre className="erp-dev-customer-dry-run-report">
          {result.reportPreview}
        </pre>
      ) : null}
    </div>
  )
}

function TestApplySummary({ applyState, onApplyTestConfig }) {
  if (applyState.status === 'idle') {
    return (
      <Alert
        type="info"
        showIcon
        message="尚未应用到测试环境"
        description="点击后会编译受控 runtime manifest，并用当前管理员登录态调用后端 validate / publish / activate。"
      />
    )
  }

  if (applyState.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        message="正在应用测试配置"
        description={applyState.step || '正在准备 runtime manifest。'}
      />
    )
  }

  if (applyState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="测试配置应用失败"
        description={applyState.error || '请确认本地后端、管理员登录态和权限。'}
      />
    )
  }

  const result = applyState.result || {}
  const manifestSummary = result.manifestSummary || {}
  const session = result.effectiveSession || {}

  return (
    <div className="erp-dev-customer-test-apply-result">
      <Alert
        type="success"
        showIcon
        message="测试配置已应用"
        description="后台和岗位任务端会通过 active customer config revision 读取测试配置投影；这不包含真实客户业务数据导入。"
      />
      <div className="erp-dev-customer-test-apply-actions">
        <Button
          type="primary"
          loading={applyState.status === 'running'}
          onClick={onApplyTestConfig}
        >
          重新应用测试配置
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={() => copyText(result.manifestPath || '')}
        >
          复制 Manifest 路径
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={() => copyText(manifestSummary.revision || '')}
        >
          复制 Revision
        </Button>
      </div>
      <div className="erp-dev-customer-test-apply-steps">
        {result.steps?.map((step) => (
          <article className="erp-dev-customer-test-apply-step" key={step.key}>
            <Text type="secondary">{step.label}</Text>
            <StatusTag status={step.status} />
            <Text>{step.note}</Text>
          </article>
        ))}
      </div>
      <div className="erp-dev-customer-test-apply-facts">
        <div>
          <Text type="secondary">Revision</Text>
          <Text strong>{manifestSummary.revision || '-'}</Text>
        </div>
        <div>
          <Text type="secondary">页面投影 / Pages</Text>
          <Text strong>{manifestSummary.pageCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">角色画像 / Roles</Text>
          <Text strong>{manifestSummary.roleProfileCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">责任池 / Work Pools</Text>
          <Text strong>{manifestSummary.workPoolCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">模块状态 / Module States</Text>
          <Text strong>{manifestSummary.moduleStateCount ?? '-'}</Text>
        </div>
      </div>
      <div className="erp-dev-customer-test-apply-session">
        <Text type="secondary">当前 effective session</Text>
        <Text>
          {session.source || '-'} / {session.configRevision || '-'}
        </Text>
      </div>
    </div>
  )
}

function ReleaseApplySummary({
  releaseState,
  onCheckReleaseReadiness,
  onApplyReleaseConfig,
}) {
  const isReady = releaseState.status === 'ready'

  if (releaseState.status === 'idle') {
    return (
      <Alert
        type="info"
        showIcon
        message="尚未检查发布门禁"
        description="先检查 release evidence、manifest hash 绑定和发布前证据；门禁通过后才允许发布到正式版。"
      />
    )
  }

  if (releaseState.status === 'checking') {
    return (
      <Alert
        type="info"
        showIcon
        message="正在检查发布门禁"
        description="正在编译正式版 runtime manifest，并校验 release evidence。"
      />
    )
  }

  if (releaseState.status === 'publishing') {
    return (
      <Alert
        type="info"
        showIcon
        message="正在发布正式配置"
        description={releaseState.step || '正在调用后端 customer_config。'}
      />
    )
  }

  if (releaseState.status === 'blocked') {
    const missing = releaseState.result?.missing || []
    return (
      <div className="erp-dev-customer-release-result">
        <Alert
          type="warning"
          showIcon
          message="发布门禁未通过"
          description="正式版不能直接发布；先补齐下列 release evidence，再重新检查。"
        />
        <div className="erp-dev-customer-release-missing">
          {missing.slice(0, 8).map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </div>
        <div className="erp-dev-customer-release-actions">
          <Button onClick={onCheckReleaseReadiness}>重新检查发布门禁</Button>
          <Button
            icon={<CopyOutlined />}
            onClick={() => copyText(releaseState.result?.evidenceDir || '')}
          >
            复制证据目录
          </Button>
        </div>
      </div>
    )
  }

  if (releaseState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="发布版操作失败"
        description={
          releaseState.error || '请确认发布门禁、本地后端和管理员权限。'
        }
      />
    )
  }

  const result = releaseState.result || {}
  const summary = result.summary || result.manifestSummary || {}
  const session = result.effectiveSession || {}

  return (
    <div className="erp-dev-customer-release-result">
      <Alert
        type={isReady ? 'success' : 'success'}
        showIcon
        message={isReady ? '发布门禁已通过' : '正式配置已发布'}
        description={
          isReady
            ? '可以发布到正式版；发布仍只调用后端 customer_config 控制面，不导入业务数据。'
            : '正式版 active revision 已切换；后台和岗位任务端会读取该配置投影。'
        }
      />
      <div className="erp-dev-customer-release-actions">
        <Button onClick={onCheckReleaseReadiness}>重新检查发布门禁</Button>
        <Button
          type="primary"
          disabled={!isReady}
          loading={releaseState.status === 'publishing'}
          onClick={onApplyReleaseConfig}
        >
          发布到正式版
        </Button>
        <Button
          icon={<CopyOutlined />}
          onClick={() => copyText(result.manifestPath || '')}
        >
          复制 Manifest 路径
        </Button>
      </div>
      <div className="erp-dev-customer-release-facts">
        <div>
          <Text type="secondary">Evidence</Text>
          <Text strong>{result.evidenceDir || '-'}</Text>
        </div>
        <div>
          <Text type="secondary">Revision</Text>
          <Text strong>{summary.revision || '-'}</Text>
        </div>
        <div>
          <Text type="secondary">页面投影 / Pages</Text>
          <Text strong>{summary.pageCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">模块状态 / Module States</Text>
          <Text strong>{summary.moduleStateCount ?? '-'}</Text>
        </div>
        <div>
          <Text type="secondary">当前 effective session</Text>
          <Text strong>
            {session.source || '-'} / {session.configRevision || '-'}
          </Text>
        </div>
      </div>
    </div>
  )
}

function ImportFlowStep({ item }) {
  return (
    <article className="erp-dev-customer-import-step">
      <div className="erp-dev-customer-import-step__index">{item.step}</div>
      <div className="erp-dev-customer-import-step__body">
        <div className="erp-dev-customer-import-step__head">
          <Text strong>{item.title}</Text>
          <StatusTag status={item.status} />
        </div>
        <Text>{item.outcome}</Text>
        <Text type="secondary">{item.target}</Text>
      </div>
    </article>
  )
}

function DatabaseTargetCard({ item }) {
  return (
    <article className="erp-dev-customer-db-target">
      <div className="erp-dev-customer-db-target__head">
        <Text strong>{item.label}</Text>
        <StatusTag status={item.status} />
      </div>
      <div className="erp-dev-customer-db-target__body">
        <Text type="secondary">目标 / Target</Text>
        <Text strong>{item.target}</Text>
        <Text type="secondary">写入 / Writes</Text>
        <Text>{item.writes}</Text>
      </div>
      <Text type="secondary">{item.reason}</Text>
    </article>
  )
}

function FormalGateItem({ item }) {
  return (
    <article className="erp-dev-customer-formal-gate">
      <div>
        <Text strong>{item.label}</Text>
        <Text type="secondary">{item.note}</Text>
      </div>
      <StatusTag status={item.status} />
    </article>
  )
}

function CustomerPackageSelector({ overview, onChange }) {
  const options = (overview.registeredCustomers || []).map((item) => ({
    value: item.customerKey,
    label: `${item.label} (${item.customerKey})`,
  }))
  const matched = options.some((item) => item.value === overview.customerKey)

  return (
    <div className="erp-dev-customer-selector">
      <Text type="secondary">客户包选择 / Customer Package</Text>
      <Select
        value={matched ? overview.customerKey : undefined}
        placeholder="选择已登记客户包 / Select registered package"
        options={options}
        onChange={onChange}
      />
      <Text type="secondary" className="erp-dev-customer-selector__note">
        只更新 URL，不写后端或正式运行配置。
      </Text>
    </div>
  )
}

function GateRow({ item }) {
  return (
    <article className="erp-dev-customer-gate" key={item.key}>
      <div className="erp-dev-customer-gate__main">
        <Text strong>{item.label}</Text>
        <Text type="secondary">{item.note}</Text>
      </div>
      <StatusTag status={item.status} />
    </article>
  )
}

function AssetTile({ item }) {
  return (
    <article className="erp-dev-customer-asset" key={item.key}>
      <div className="erp-dev-customer-asset__top">
        <Text type="secondary">{item.label}</Text>
        <StatusTag status={item.status} />
      </div>
      <div className="erp-dev-customer-asset__value">
        <span>{item.value}</span>
        <small>{item.unit}</small>
      </div>
      <Text type="secondary">{item.note}</Text>
    </article>
  )
}

function MissingCustomerPanel({ overview }) {
  return (
    <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-missing">
      <div className="erp-dev-customer-panel__head">
        <ExclamationCircleOutlined />
        <Text strong>未登记客户配置包 / Missing Customer Package</Text>
      </div>
      <Alert
        type="warning"
        showIcon
        message={`未登记客户配置包：${overview.requestedCustomerKey}`}
        description="当前 URL customer 参数没有对应客户配置包 / no registered package for this customer query. 开发态总控不会 fallback 到 yoyoosun 冒充，不创建 SaaS tenant，不新增 tenant_id，也不接后端或数据库。"
      />
      <div className="erp-dev-customer-registered-list">
        <Text type="secondary">已登记客户包 / Registered Packages</Text>
        <Space wrap>
          {(overview.registeredCustomers || []).map((item) => (
            <Tag key={item.customerKey}>
              {item.label} / {item.customerKey}
            </Tag>
          ))}
        </Space>
      </div>
    </section>
  )
}

function OverviewPanel({ overview, onNavigate }) {
  const consoleSummary = overview.packageConsoleSummary

  return (
    <div className="erp-dev-customer-overview" data-dev-customer-view="总览">
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-console">
        <div>
          <Text type="secondary">当前配置包 / Current Package</Text>
          <Title level={2}>{consoleSummary.packageLabel}</Title>
          <Text strong>{consoleSummary.reviewDecision.title}</Text>
          <Text type="secondary">{consoleSummary.reviewDecision.summary}</Text>
        </div>
        <div className="erp-dev-customer-console__status">
          <StatusTag status={consoleSummary.primaryStatus} />
          <Text type="secondary">
            {consoleSummary.reviewDecision.nextAction}
          </Text>
        </div>
      </section>

      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ExclamationCircleOutlined />
          <Text strong>决策卡 / Decision Cards</Text>
        </div>
        <div className="erp-dev-customer-decision-grid">
          {consoleSummary.decisionCards.map((item) => (
            <DecisionCard item={item} key={item.key} />
          ))}
        </div>
      </section>

      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CheckCircleOutlined />
          <Text strong>下一步 / Next</Text>
        </div>
        <div className="erp-dev-customer-quick-actions">
          <QuickAction
            icon={<SafetyCertificateOutlined />}
            title="看预检"
            note="结构、禁止项、Workflow 边界"
            status="passed"
            onClick={() => onNavigate(VIEW_PREFLIGHT)}
          />
          <QuickAction
            icon={<ApartmentOutlined />}
            title="看差异"
            note="当前值、待导入、影响范围"
            status="preview_only"
            onClick={() => onNavigate(VIEW_DIFF)}
          />
          <QuickAction
            icon={<DatabaseOutlined />}
            title="看工具"
            note="dry-run 和报告命令"
            status="blocked_by_design"
            onClick={() => onNavigate(VIEW_IMPORT)}
          />
        </div>
      </section>
    </div>
  )
}

function AssetsPanel({
  menuSummary,
  fieldNumberingSummary,
  printTemplateSummary,
}) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="菜单字段"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--brand">
        <div className="erp-dev-customer-brand-mark">
          {menuSummary.brand.brandMark || menuSummary.customerKey.slice(0, 1)}
        </div>
        <div>
          <Title level={2}>{menuSummary.brand.companyName}</Title>
          <Paragraph>{menuSummary.brand.systemName}</Paragraph>
          <Space wrap>
            <StatusTag status={menuSummary.runtimeStatus} />
            <Tag>{menuSummary.sourcePath}</Tag>
          </Space>
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ApartmentOutlined />
          <Text strong>菜单分组 / Menu Groups</Text>
        </div>
        <div className="erp-dev-customer-menu-groups">
          {menuSummary.sections.map((section) => (
            <article
              className="erp-dev-customer-menu-group"
              key={section.title}
            >
              <div className="erp-dev-customer-menu-group__title">
                <Text strong>{section.title}</Text>
                <Tag>{section.items.length}</Tag>
              </div>
              <div className="erp-dev-customer-menu-group__items">
                {section.items.map((item) => (
                  <Tag key={item}>{item}</Tag>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <SafetyCertificateOutlined />
          <Text strong>边界守卫 / Boundary Guards</Text>
        </div>
        <div className="erp-dev-customer-guard-list">
          {fieldNumberingSummary.boundaries.map((item) => (
            <div className="erp-dev-customer-guard" key={item.key}>
              <Text>{item.key}</Text>
              <Tag color={item.ok ? 'green' : 'red'}>
                {item.ok ? 'false / ok' : String(item.value)}
              </Tag>
            </div>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <SettingOutlined />
          <Text strong>字段显示候选 / Field Candidates</Text>
        </div>
        <div className="erp-dev-customer-field-list">
          {fieldNumberingSummary.fieldCandidates.map((candidate) => (
            <article
              className="erp-dev-customer-field"
              key={`${candidate.module}:${candidate.key}`}
            >
              <div className="erp-dev-customer-field__head">
                <Text strong>{candidate.label}</Text>
                <Tag>{candidate.moduleLabel}</Tag>
                <StatusTag status={candidate.decisionLabel} />
              </div>
              <Text className="erp-dev-customer-field__key">
                {candidate.key} / {candidate.source}
              </Text>
              <Paragraph>{candidate.note}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CodeOutlined />
          <Text strong>编号规则候选 / Numbering Candidates</Text>
        </div>
        <div className="erp-dev-customer-numbering-list">
          {fieldNumberingSummary.numberingRules.map((rule) => (
            <article className="erp-dev-customer-numbering" key={rule.key}>
              <div>
                <Text strong>{rule.label}</Text>
                <Text type="secondary">{rule.domain}</Text>
              </div>
              <StatusTag status={rule.decisionLabel} />
              <Paragraph>{rule.unresolvedQuestion}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--print-templates">
        <div className="erp-dev-customer-panel__head">
          <FileTextOutlined />
          <Text strong>打印模板字段 / Print Template Fields</Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="当前只展示采购合同和加工合同字段真源"
          description="销售订单受理当前未接打印模板；客户抬头、签章和固定文案应留在客户配置或模板边界，不进入 Product Core 表单。"
        />
        <div className="erp-dev-customer-tool-list">
          {printTemplateSummary.templates.map((template) => (
            <article className="erp-dev-customer-tool" key={template.key}>
              <div className="erp-dev-customer-tool__head">
                <Space wrap>
                  <Text strong>{template.title}</Text>
                  <Tag>{template.key}</Tag>
                  <Tag>{template.fieldTruthCount} fieldTruth</Tag>
                </Space>
                <StatusTag status={template.readiness} />
              </div>
              <Text type="secondary">{template.category}</Text>
              <div className="erp-dev-customer-field-list">
                {template.fieldTruth.map((truth) => (
                  <Text key={truth}>{truth}</Text>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

function PreflightPanel({ consoleSummary, customerPackageSummary }) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="包预检"
    >
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <SafetyCertificateOutlined />
          <Text strong>包边界 / Package Guards</Text>
        </div>
        <div className="erp-dev-customer-guard-list">
          {customerPackageSummary.boundaries.map((item) => (
            <div className="erp-dev-customer-guard" key={item.key}>
              <Text>{item.key}</Text>
              <Tag color={item.ok ? 'green' : 'red'}>
                {item.ok ? String(item.expected) : String(item.value)}
              </Tag>
            </div>
          ))}
        </div>
        <CommandBlock command={customerPackageSummary.qaCommand} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CheckCircleOutlined />
          <Text strong>预检步骤 / Preflight Gates</Text>
        </div>
        <div className="erp-dev-customer-gate-list">
          {consoleSummary.preflightStages.map((item) => (
            <GateRow item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DatabaseOutlined />
          <Text strong>资产摘要 / Asset Summary</Text>
        </div>
        <div className="erp-dev-customer-asset-grid">
          {consoleSummary.assetSummary.map((item) => (
            <AssetTile item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--module-states">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>模块状态投影 / Module States</Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="moduleStates 只编译为客户配置控制面输入"
          description="默认 catalog 模块会编译为 enabled；客户包若声明 read_only / disabled 必须带 reason。这里不安装或卸载模块，也不证明完整模块关闭流程已交付。"
        />
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.moduleStates.map((item) => (
            <article className="erp-dev-customer-tool" key={item.moduleKey}>
              <div className="erp-dev-customer-tool__head">
                <Space wrap>
                  <Text strong>{item.label}</Text>
                  <Tag>{item.moduleKey}</Tag>
                  {item.overridden ? <Tag>override</Tag> : null}
                </Space>
                <StatusTag status={item.state} />
              </div>
              <Paragraph>{item.reason}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <SafetyCertificateOutlined />
          <Text strong>人工评审清单 / Review Checklist</Text>
        </div>
        <div className="erp-dev-customer-review-list">
          {consoleSummary.reviewChecklist.map((item) => (
            <ReviewChecklistItem item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <SafetyCertificateOutlined />
          <Text strong>校验结果 / Validation Checks</Text>
        </div>
        <div className="erp-dev-customer-tool-list">
          {consoleSummary.validationChecks.map((check) => (
            <article className="erp-dev-customer-tool" key={check.key}>
              <div className="erp-dev-customer-tool__head">
                <Space wrap>
                  <Text strong>{check.label}</Text>
                  <Tag>{check.level}</Tag>
                </Space>
                <StatusTag status={check.status} />
              </div>
              <Paragraph>{check.note}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>工作流预览 / Workflows</Text>
        </div>
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.workflows.map((workflow) => (
            <article className="erp-dev-customer-tool" key={workflow.key}>
              <div className="erp-dev-customer-tool__head">
                <Text strong>{workflow.label}</Text>
                <StatusTag status={workflow.status} />
              </div>
              <Space wrap>
                <Tag>{workflow.key}</Tag>
                <Tag>{workflow.nodeCount} nodes</Tag>
                <Tag>{workflow.factBoundary}</Tag>
                {workflow.ownerPools.map((pool) => (
                  <Tag key={pool}>{pool}</Tag>
                ))}
              </Space>
              <Paragraph>{workflow.guardrail}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ApartmentOutlined />
          <Text strong>业务流转 / Business Flows</Text>
        </div>
        <div className="erp-dev-customer-field-list">
          {customerPackageSummary.businessFlows.map((flow) => (
            <article className="erp-dev-customer-field" key={flow.key}>
              <div className="erp-dev-customer-field__head">
                <Text strong>{flow.label}</Text>
                <StatusTag status={flow.status} />
              </div>
              <Text className="erp-dev-customer-field__key">
                {flow.key} / {(flow.modules || []).join(' -> ')}
              </Text>
              <Paragraph>{flow.guardrail}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CodeOutlined />
          <Text strong>状态机与策略 / State Machines And Policies</Text>
        </div>
        <div className="erp-dev-customer-numbering-list">
          {customerPackageSummary.stateMachines.map((item) => (
            <article className="erp-dev-customer-numbering" key={item.key}>
              <div>
                <Text strong>{item.label}</Text>
                <Text type="secondary">
                  {item.stateCount} states / {item.transitionCount} transitions
                </Text>
              </div>
              <StatusTag status={item.status} />
              <Paragraph>{item.guardrail}</Paragraph>
            </article>
          ))}
          {customerPackageSummary.processPolicies.map((item) => (
            <article className="erp-dev-customer-numbering" key={item.key}>
              <div>
                <Text strong>{item.label}</Text>
                <Text type="secondary">
                  {item.kind} / {item.ruleCount} rules
                </Text>
              </div>
              <StatusTag status={item.status} />
              <Paragraph>{item.guardrail}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CopyOutlined />
          <Text strong>预检命令 / Preflight Commands</Text>
        </div>
        <CommandList commands={consoleSummary.qaCommands} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CodeOutlined />
          <Text strong>来源路径 / Source References</Text>
        </div>
        <div className="erp-dev-customer-source-ref-list">
          {consoleSummary.sourceReferences.map((item) => (
            <SourceReference item={item} key={item.key} />
          ))}
        </div>
      </section>
    </div>
  )
}

function DiffPanel({ consoleSummary }) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="差异预览"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ApartmentOutlined />
          <Text strong>差异对比 / Diff Preview</Text>
        </div>
        <div className="erp-dev-customer-diff-list">
          {consoleSummary.diffItems.map((item) => (
            <article className="erp-dev-customer-diff" key={item.key}>
              <div className="erp-dev-customer-diff__type">
                <Tag>{item.type}</Tag>
                <StatusTag status={item.status} />
              </div>
              <div className="erp-dev-customer-diff__value">
                <Text type="secondary">当前值 / Current</Text>
                <Text strong>{item.current}</Text>
              </div>
              <div className="erp-dev-customer-diff__value">
                <Text type="secondary">待导入 / Incoming</Text>
                <Text strong>{item.incoming}</Text>
              </div>
              <Paragraph>{item.impact}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>版本门禁 / Version Gates</Text>
        </div>
        <div className="erp-dev-customer-guard-list">
          {consoleSummary.versionGates.map((gate) => (
            <div className="erp-dev-customer-guard" key={gate.key}>
              <Text>{gate.label}</Text>
              <Tag color={gate.enabled ? 'green' : 'red'}>
                {gate.enabled ? 'enabled' : 'disabled'}
              </Tag>
            </div>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel">
        <div className="erp-dev-customer-panel__head">
          <ExclamationCircleOutlined />
          <Text strong>导入结论 / Import Decision</Text>
        </div>
        <Alert
          type="warning"
          showIcon
          message="当前不可正式导入"
          description="Dry Run 和 execution report 只能生成评审证据；没有客户确认、备份 evidence、未匹配队列清零和单独真实导入任务前，不允许写数据库。"
        />
      </section>
    </div>
  )
}

function ImportPanel({
  importSummary,
  dryRunState,
  applyState,
  releaseState,
  onRunDryRun,
  onApplyTestConfig,
  onCheckReleaseReadiness,
  onApplyReleaseConfig,
}) {
  return (
    <div
      className="erp-dev-customer-panel-grid"
      data-dev-customer-view="导入工作台"
    >
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-import-hero">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>导入工作台 / Import Workbench</Text>
        </div>
        <div className="erp-dev-customer-import-hero__copy">
          <Text strong>
            当前页支持测试版 Dry Run 和测试环境应用；正式发布必须通过 release
            evidence 门禁。
          </Text>
          <Text type="secondary">
            这里把参考文档里的上传、解析、预检、Dry
            Run、正式导入、发布和审计流程压缩成当前可执行的开发态工作台；不会上传
            raw 包，不会直接写业务事实。
          </Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="测试环境应用只写客户配置控制面"
          description="UI Dry Run 不写数据库；应用到测试环境会调用后端 customer_config validate / publish / activate，让后台和岗位任务端读取 active revision。真实客户业务数据导入仍是单独专项。"
        />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CheckCircleOutlined />
          <Text strong>可视化导入流程 / Visual Import Flow</Text>
        </div>
        <div className="erp-dev-customer-import-flow">
          {importSummary.importFlow.map((step) => (
            <ImportFlowStep item={step} key={step.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CheckCircleOutlined />
          <Text strong>测试版 UI Dry Run</Text>
        </div>
        <Paragraph type="secondary">
          直接在页面生成 dry-run evidence；只写本地 output，不写数据库。
        </Paragraph>
        <Button
          type="primary"
          loading={dryRunState.status === 'running'}
          disabled={!importSummary.canRunUiDryRun}
          onClick={onRunDryRun}
        >
          运行测试 Dry Run
        </Button>
        <DryRunSummary dryRunState={dryRunState} onRunDryRun={onRunDryRun} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>测试环境应用 / Test Apply</Text>
        </div>
        <Paragraph type="secondary">
          一键把已选甲方配置应用到本地测试后端；成功后后台和岗位任务端会读取测试配置版本。
        </Paragraph>
        <div className="erp-dev-customer-test-apply-primary">
          <Button
            type="primary"
            loading={applyState.status === 'running'}
            disabled={!importSummary.canApplyTestConfig}
            onClick={onApplyTestConfig}
          >
            应用到测试环境
          </Button>
          <Text type="secondary">
            validate / publish / activate / effective
            session；不导入客户业务数据。
          </Text>
        </div>
        <TestApplySummary
          applyState={applyState}
          onApplyTestConfig={onApplyTestConfig}
        />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DatabaseOutlined />
          <Text strong>写库目标 / Database Target</Text>
        </div>
        <div className="erp-dev-customer-db-targets">
          {importSummary.databaseTargets.map((target) => (
            <DatabaseTargetCard item={target} key={target.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <ExclamationCircleOutlined />
          <Text strong>正式版发布 / Release Apply</Text>
        </div>
        <Alert
          type="warning"
          showIcon
          message="正式版必须先过发布门禁"
          description="发布版只写客户配置控制面；没有 manifest evidence、release evidence、管理员确认、审计和回滚方案前，发布按钮不可执行。"
        />
        <div className="erp-dev-customer-release-primary">
          <Button
            type="default"
            loading={releaseState.status === 'checking'}
            disabled={!importSummary.canCheckReleaseReadiness}
            onClick={onCheckReleaseReadiness}
          >
            检查发布门禁
          </Button>
          <Button
            type="primary"
            loading={releaseState.status === 'publishing'}
            disabled={releaseState.status !== 'ready'}
            onClick={onApplyReleaseConfig}
          >
            发布到正式版
          </Button>
          <Text type="secondary">
            release readiness / validate / publish /
            activate；不导入客户业务数据。
          </Text>
        </div>
        <ReleaseApplySummary
          releaseState={releaseState}
          onCheckReleaseReadiness={onCheckReleaseReadiness}
          onApplyReleaseConfig={onApplyReleaseConfig}
        />
        <div className="erp-dev-customer-formal-gates">
          {importSummary.formalGates.map((gate) => (
            <FormalGateItem item={gate} key={gate.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DatabaseOutlined />
          <Text strong>执行边界 / Execution Boundary</Text>
        </div>
        <div className="erp-dev-customer-import-flags">
          <div>
            <Text type="secondary">canExecuteRealImport</Text>
            <Tag color="red">{String(importSummary.canExecuteRealImport)}</Tag>
          </div>
          <div>
            <Text type="secondary">writesBusinessData</Text>
            <Tag color="red">{String(importSummary.writesBusinessData)}</Tag>
          </div>
          <div>
            <Text type="secondary">writesConfigControl</Text>
            <Tag color="blue">{String(importSummary.writesDatabase)}</Tag>
          </div>
        </div>
        <CommandBlock command={importSummary.qaCommand} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>备用命令 / Command Fallback</Text>
        </div>
        <div className="erp-dev-customer-tool-list">
          {importSummary.tools.map((tool) => (
            <article className="erp-dev-customer-tool" key={tool.key}>
              <div className="erp-dev-customer-tool__head">
                <Text strong>{tool.title}</Text>
                <StatusTag status={tool.status} />
              </div>
              <CommandBlock command={tool.command} />
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}

export default function DevCustomerConfigPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const overview = useMemo(
    () => buildCustomerConfigDevOverviewFromSearch(searchParams),
    [searchParams]
  )
  const [activeView, setActiveView] = useState(VIEW_OVERVIEW)
  const [dryRunState, setDryRunState] = useState({ status: 'idle' })
  const [applyState, setApplyState] = useState({ status: 'idle' })
  const [releaseState, setReleaseState] = useState({ status: 'idle' })
  const dryRunRequestRef = useRef(0)
  const dryRunAbortRef = useRef(null)
  const applyRequestRef = useRef(0)
  const applyAbortRef = useRef(null)
  const releaseRequestRef = useRef(0)
  const releaseAbortRef = useRef(null)
  const isMissingCustomer = overview.status === 'missing'

  useEffect(() => {
    dryRunAbortRef.current?.abort()
    applyAbortRef.current?.abort()
    releaseAbortRef.current?.abort()
    dryRunRequestRef.current += 1
    applyRequestRef.current += 1
    releaseRequestRef.current += 1
    setDryRunState({ status: 'idle' })
    setApplyState({ status: 'idle' })
    setReleaseState({ status: 'idle' })
  }, [overview.customerKey])

  useEffect(
    () => () => {
      dryRunAbortRef.current?.abort()
      applyAbortRef.current?.abort()
      releaseAbortRef.current?.abort()
    },
    []
  )

  const handleCustomerChange = (customerKey) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(DEV_CUSTOMER_CONFIG_QUERY_KEY, customerKey)
    setSearchParams(nextParams, { replace: true })
  }

  const handleRunDryRun = async () => {
    const requestId = dryRunRequestRef.current + 1
    dryRunRequestRef.current = requestId
    dryRunAbortRef.current?.abort()
    const controller = new AbortController()
    dryRunAbortRef.current = controller
    setDryRunState({ status: 'running' })

    try {
      const response = await fetch(overview.importSummary.uiDryRunApiPath, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ customerKey: overview.customerKey }),
        signal: controller.signal,
      })
      const payload = await response.json()
      if (dryRunRequestRef.current !== requestId) {
        return
      }
      if (!response.ok) {
        throw new Error(payload?.message || 'Dry Run 生成失败')
      }
      setDryRunState({ status: 'success', result: payload })
      message.success('Dry Run evidence 已生成')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      if (dryRunRequestRef.current !== requestId) {
        return
      }
      setDryRunState({
        status: 'error',
        error: getActionErrorMessage(error, 'Dry Run 生成失败'),
      })
      message.error('Dry Run 生成失败')
    }
  }

  const handleApplyTestConfig = async () => {
    const requestId = applyRequestRef.current + 1
    applyRequestRef.current = requestId
    applyAbortRef.current?.abort()
    const controller = new AbortController()
    applyAbortRef.current = controller
    setApplyState({
      status: 'running',
      step: '正在编译 runtime manifest',
    })

    const ensureCurrent = () => applyRequestRef.current === requestId

    try {
      const response = await fetch(
        overview.importSummary.uiRuntimeManifestApiPath,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ customerKey: overview.customerKey }),
          signal: controller.signal,
        }
      )
      const manifestPayload = await response.json()
      if (!ensureCurrent()) {
        return
      }
      if (!response.ok) {
        throw new Error(manifestPayload?.message || 'Runtime manifest 编译失败')
      }
      const { manifest } = manifestPayload

      setApplyState({
        status: 'running',
        step: '正在调用 validate_customer_config',
      })
      const validation = await validateCustomerConfig(manifest)
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在调用 publish_customer_config',
      })
      let publish = null
      let publishSkipped = false
      try {
        publish = await publishCustomerConfig(manifest)
      } catch (publishError) {
        const messageText = String(publishError?.message || '')
        if (!messageText.includes('已激活客户配置版本')) {
          throw publishError
        }
        publishSkipped = true
      }
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在调用 activate_customer_config',
      })
      const activated = await activateCustomerConfig({
        customer_key: manifest.customer_key,
        revision: manifest.revision,
      })
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在读取 get_effective_session',
      })
      const effectiveSession = await getEffectiveSession({
        customer_key: manifest.customer_key,
      })
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'success',
        result: {
          manifestPath: manifestPayload.manifestPath,
          manifestSummary: manifestPayload.summary,
          validation,
          publish,
          activated,
          effectiveSession,
          steps: [
            {
              key: 'compile',
              label: '编译 manifest',
              status: 'passed',
              note: manifestPayload.manifestPath,
            },
            {
              key: 'validate',
              label: '后端校验',
              status: 'passed',
              note:
                validation?.config_hash || 'validate_customer_config passed',
            },
            {
              key: 'publish',
              label: '发布测试版本',
              status: publishSkipped ? 'test_apply_done' : 'passed',
              note: publishSkipped
                ? '当前 revision 已激活，跳过重复发布'
                : publish?.status || 'publish_customer_config passed',
            },
            {
              key: 'activate',
              label: '激活测试版本',
              status: 'test_apply_done',
              note: activated?.status || 'activate_customer_config passed',
            },
            {
              key: 'session',
              label: '读取会话投影',
              status: 'test_apply_done',
              note:
                effectiveSession?.configRevision ||
                'get_effective_session passed',
            },
          ],
        },
      })
      message.success('测试配置已应用')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      if (!ensureCurrent()) {
        return
      }
      setApplyState({
        status: 'error',
        error: getCustomerConfigActionError(
          error,
          '测试配置应用失败，请确认本地后端和管理员权限。'
        ),
      })
      message.error('测试配置应用失败')
    }
  }

  const handleCheckReleaseReadiness = async () => {
    const requestId = releaseRequestRef.current + 1
    releaseRequestRef.current = requestId
    releaseAbortRef.current?.abort()
    const controller = new AbortController()
    releaseAbortRef.current = controller
    setReleaseState({ status: 'checking' })

    const ensureCurrent = () => releaseRequestRef.current === requestId

    try {
      const response = await fetch(
        overview.importSummary.uiReleaseReadinessApiPath,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
          },
          body: JSON.stringify({ customerKey: overview.customerKey }),
          signal: controller.signal,
        }
      )
      const payload = await response.json()
      if (!ensureCurrent()) {
        return
      }
      if (!response.ok) {
        throw new Error(payload?.message || '发布门禁检查失败')
      }
      if (payload.status === 'ready') {
        setReleaseState({ status: 'ready', result: payload })
        message.success('发布门禁已通过')
        return
      }
      setReleaseState({ status: 'blocked', result: payload })
      message.warning('发布门禁未通过')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      if (!ensureCurrent()) {
        return
      }
      setReleaseState({
        status: 'error',
        error: getActionErrorMessage(error, '发布门禁检查失败'),
      })
      message.error('发布门禁检查失败')
    }
  }

  const handleApplyReleaseConfig = async () => {
    const readiness = releaseState.result
    if (releaseState.status !== 'ready' || !readiness?.manifest) {
      setReleaseState({
        status: 'blocked',
        result: readiness,
      })
      message.warning('请先通过发布门禁')
      return
    }
    const requestId = releaseRequestRef.current + 1
    releaseRequestRef.current = requestId
    setReleaseState({
      status: 'publishing',
      step: '正在调用 validate_customer_config',
      result: readiness,
    })
    const ensureCurrent = () => releaseRequestRef.current === requestId
    const { manifest } = readiness

    try {
      const validation = await validateCustomerConfig(manifest)
      if (!ensureCurrent()) {
        return
      }
      setReleaseState({
        status: 'publishing',
        step: '正在调用 publish_customer_config',
        result: readiness,
      })
      const publish = await publishCustomerConfig(manifest)
      if (!ensureCurrent()) {
        return
      }
      setReleaseState({
        status: 'publishing',
        step: '正在调用 activate_customer_config',
        result: readiness,
      })
      const activated = await activateCustomerConfig({
        customer_key: manifest.customer_key,
        revision: manifest.revision,
      })
      if (!ensureCurrent()) {
        return
      }
      const effectiveSession = await getEffectiveSession({
        customer_key: manifest.customer_key,
      })
      if (!ensureCurrent()) {
        return
      }
      setReleaseState({
        status: 'published',
        result: {
          ...readiness,
          manifestSummary: readiness.summary,
          validation,
          publish,
          activated,
          effectiveSession,
        },
      })
      message.success('正式配置已发布')
    } catch (error) {
      if (!ensureCurrent()) {
        return
      }
      setReleaseState({
        status: 'error',
        result: readiness,
        error: getCustomerConfigActionError(
          error,
          '正式配置发布失败，请确认发布门禁、本地后端和管理员权限。'
        ),
      })
      message.error('正式配置发布失败')
    }
  }

  const panel = {
    [VIEW_OVERVIEW]: (
      <OverviewPanel overview={overview} onNavigate={setActiveView} />
    ),
    [VIEW_PREFLIGHT]: (
      <PreflightPanel
        consoleSummary={overview.packageConsoleSummary}
        customerPackageSummary={overview.customerPackageSummary}
      />
    ),
    [VIEW_DIFF]: <DiffPanel consoleSummary={overview.packageConsoleSummary} />,
    [VIEW_ASSETS]: (
      <AssetsPanel
        menuSummary={overview.menuSummary}
        fieldNumberingSummary={overview.fieldNumberingSummary}
        printTemplateSummary={overview.printTemplateSummary}
      />
    ),
    [VIEW_IMPORT]: (
      <ImportPanel
        importSummary={overview.importSummary}
        dryRunState={dryRunState}
        applyState={applyState}
        releaseState={releaseState}
        onRunDryRun={handleRunDryRun}
        onApplyTestConfig={handleApplyTestConfig}
        onCheckReleaseReadiness={handleCheckReleaseReadiness}
        onApplyReleaseConfig={handleApplyReleaseConfig}
      />
    ),
  }[activeView]

  return (
    <main className="erp-dev-customer-page">
      <header className="erp-dev-customer-header">
        <div className="erp-dev-customer-header__copy">
          <Space align="center" size={10}>
            <SettingOutlined className="erp-dev-customer-header__icon" />
            <Title className="erp-dev-customer-title" level={1}>
              客户配置包预检控制台 / Package Preflight Console
            </Title>
          </Space>
          <Text className="erp-dev-customer-summary">
            dev-only，评审客户配置包；可 Dry Run、应用测试版，并在 release
            evidence 通过后发布正式版。
          </Text>
          <CustomerPackageSelector
            overview={overview}
            onChange={handleCustomerChange}
          />
          {isMissingCustomer ? null : (
            <Segmented
              className="erp-dev-customer-view-switch"
              options={VIEW_OPTIONS}
              value={activeView}
              onChange={setActiveView}
            />
          )}
        </div>
        <div className="erp-dev-customer-source">
          <Text type="secondary">当前 URL customer / Query</Text>
          <Text strong>{overview.requestedCustomerKey}</Text>
          <Text type="secondary">
            {overview.sourcePath || '未登记客户配置包'}
          </Text>
        </div>
      </header>

      {isMissingCustomer ? <MissingCustomerPanel overview={overview} /> : panel}
    </main>
  )
}
