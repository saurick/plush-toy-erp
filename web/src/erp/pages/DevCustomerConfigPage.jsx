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
import { message, modal } from '@/common/utils/antdApp'
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

const STATUS_LABELS = Object.freeze({
  已接前端运行时: '已接前端运行时',
  草案: '草案',
  未批准: '未批准',
  禁止误接: '禁止误接',
  未登记: '未登记',
  runtime_frontend_only: '前端展示',
  evidence_only: '只生成证据',
  preview_only: '仅预览',
  report_gate_only: '报告门禁',
  passed: '已通过',
  blocked: '阻塞',
  blocked_by_design: '设计上阻断',
  draft_only: '草案',
  REVIEW_READY: '可人工评审',
  PREVIEW_READY: '预检通过',
  BLOCKED: '阻塞',
  no_write: '不写入',
  test_apply_ready: '可应用到当前后端',
  test_apply_done: '当前后端已应用',
  release_gate_required: '需要发布门禁',
  separate_task_required: '需单独专项',
  source_grounded: '真源已登记',
  required: '必需',
  registered_binding: '已登记绑定',
  controlled_empty: '受控空目录',
  contract_preview_only: '合同预览',
  snapshot_supported: '支持快照',
  audit_supported: '支持审计',
  rollback_supported: '支持回滚',
  enabled: '启用',
  read_only: '只读',
  disabled: '关闭',
  启用: '启用',
  只读: '只读',
  关闭: '关闭',
  待客户确认: '待客户确认',
  暂不接运行时: '暂不接运行时',
  后续评审: '后续评审',
  effective_session_projected: '有效配置投影',
})

function statusText(status) {
  const key = String(status || '').trim()
  if (!key) return '-'
  if (STATUS_LABELS[key]) return STATUS_LABELS[key]
  return /[\u4e00-\u9fff]/u.test(key) ? key : '状态'
}

function guardItemLabel(item, fallbackLabel) {
  const label = String(item?.label || '').trim()
  return label || fallbackLabel
}

function StatusTag({ status }) {
  const normalizedStatus = String(status || '').trim()
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
    registered_binding: 'green',
    controlled_empty: 'blue',
    contract_preview_only: 'cyan',
    snapshot_supported: 'green',
    audit_supported: 'green',
    rollback_supported: 'purple',
    enabled: 'green',
    read_only: 'gold',
    disabled: 'red',
    启用: 'green',
    只读: 'gold',
    关闭: 'red',
    待客户确认: 'gold',
    暂不接运行时: 'orange',
    后续评审: 'default',
  }
  return (
    <Tag color={colorByStatus[normalizedStatus] || 'default'}>
      {statusText(normalizedStatus)}
    </Tag>
  )
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
          {item.sourceLabel || '来源已登记'}
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
        <Text type="secondary">{item.sourceLabel || '来源已登记'}</Text>
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

function buildDryRunReportPreviewLines(result = {}) {
  const summary = result.summary || {}
  const actionCounts = summary.candidateCountsByAction || {}
  const unresolvedCounts = summary.unresolvedCountsBySeverity || {}

  if (!result.reportPreview && !result.reportPath) {
    return []
  }

  return [
    '试跑报告摘要',
    `来源行：${summary.totalSources ?? '-'}`,
    `候选创建：${actionCounts.create || 0}`,
    `阻塞项：${summary.blockerCount ?? 0}`,
    `正式导入：${summary.canExecuteRealImport ? '可执行' : '不可执行'}`,
    `未决队列：阻塞 ${unresolvedCounts.block || 0} / 延后 ${
      unresolvedCounts.defer || 0
    } / 复核 ${unresolvedCounts.review || 0}`,
    '边界：只生成证据，不写业务数据库，不代表正式导入批准。',
    `原始报告：${result.reportPath || '未生成'}`,
  ]
}

function DryRunSummary({ dryRunState, onRunDryRun }) {
  const [showReportPreview, setShowReportPreview] = useState(false)

  if (dryRunState.status === 'idle') {
    return (
      <Alert
        type="info"
        showIcon
        message="尚未运行测试试跑"
        description="点击运行后会调用本地开发服务，只生成本地输出证据，不写后端数据库。"
      />
    )
  }

  if (dryRunState.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        message="试跑正在生成"
        description="正在读取固定样本快照与现有 V1 样本，完成后会回显报告路径和阻塞数量。"
      />
    )
  }

  if (dryRunState.status === 'error') {
    return (
      <Alert
        type="error"
        showIcon
        message="试跑生成失败"
        description={dryRunState.error || '请查看 Vite 终端输出。'}
      />
    )
  }

  const result = dryRunState.result || {}
  const summary = result.summary || {}
  const actionCounts = summary.candidateCountsByAction || {}
  const unresolvedCounts = summary.unresolvedCountsBySeverity || {}
  const reportPreviewLines = buildDryRunReportPreviewLines(result)
  const hasReportPreview = reportPreviewLines.length > 0

  return (
    <div className="erp-dev-customer-dry-run-result">
      <Alert
        type="success"
        showIcon
        message="试跑已生成"
        description="测试版页面已生成证据；该结果仍不代表正式导入批准。"
      />
      <div className="erp-dev-customer-dry-run-actions">
        <Button
          type="primary"
          loading={dryRunState.status === 'running'}
          onClick={onRunDryRun}
        >
          重新运行试跑
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
          {reportPreviewLines.join('\n')}
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
        message="尚未应用到当前后端"
        description="点击后会编译受控运行时清单，并用当前管理员登录态调用当前后端校验、发布和激活。"
      />
    )
  }

  if (applyState.status === 'running') {
    return (
      <Alert
        type="info"
        showIcon
        message="正在应用测试配置"
        description={applyState.step || '正在准备运行时清单。'}
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
        description="后台和岗位任务端会通过有效客户配置版本读取测试配置投影；这不包含真实客户业务数据导入。"
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
          复制清单路径
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
        <Text type="secondary">当前有效配置投影</Text>
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
        description="先检查发布证据、清单指纹绑定和发布前证据；门禁通过后才允许发布到正式版。"
      />
    )
  }

  if (releaseState.status === 'checking') {
    return (
      <Alert
        type="info"
        showIcon
        message="正在检查发布门禁"
        description="正在编译正式版运行时清单，并校验发布证据。"
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
          description="正式版不能直接发布；先补齐下列发布证据，再重新检查。"
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
            : '正式版有效配置版本已切换；后台和岗位任务端会读取该配置投影。'
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
          复制清单路径
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
          <Text type="secondary">当前有效配置投影</Text>
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
        <Space wrap size={4}>
          <StatusTag status={item.status} />
          <Tag>{item.writeClassLabel || '未标记写入类别'}</Tag>
          {item.writesBusinessData ? (
            <Tag color="red">
              {item.dataBoundaryLabel || '业务数据导入专项'}
            </Tag>
          ) : (
            <Tag color="blue">{item.dataBoundaryLabel || '配置控制面'}</Tag>
          )}
        </Space>
      </div>
      <div className="erp-dev-customer-db-target__body">
        <Text type="secondary">目标 / Target</Text>
        <Text strong>{item.target}</Text>
        <Text type="secondary">写入 / Writes</Text>
        <Text>{item.writesLabel || item.writes}</Text>
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

function ImportAssetScopeItem({ item }) {
  return (
    <article className="erp-dev-customer-db-target">
      <div className="erp-dev-customer-db-target__head">
        <Text strong>{item.label}</Text>
        <Space wrap size={4}>
          <Tag>{item.value}</Tag>
          <StatusTag status={item.status} />
        </Space>
      </div>
      <Text type="secondary">{item.note}</Text>
    </article>
  )
}

function RegistryCheckItem({ item }) {
  return (
    <article className="erp-dev-customer-formal-gate">
      <div>
        <Text strong>{item.label}</Text>
        <Text type="secondary">{item.note}</Text>
        <Text type="secondary">
          {item.implementationSourceLabel || '实现来源未登记'}
        </Text>
      </div>
      <StatusTag status={item.status} />
    </article>
  )
}

function CompiledCatalogItem({ item }) {
  return (
    <article className="erp-dev-customer-tool">
      <div className="erp-dev-customer-tool__head">
        <Space wrap>
          <Text strong>{item.label}</Text>
          <Tag>{item.summary}</Tag>
        </Space>
        <StatusTag status={item.status} />
      </div>
      <Space wrap size={4}>
        <Tag>{item.runtimeEnabledLabel || '运行时关闭'}</Tag>
        <Tag>{item.catalogStatusLabel || '目录状态未标记'}</Tag>
        <Tag>{item.implementationSourceLabel || '实现来源未登记'}</Tag>
        {item.handlerAllowed === false ? (
          <Tag>{item.handlerAllowedLabel || '禁止客户包处理器'}</Tag>
        ) : null}
      </Space>
      <Paragraph>{item.note}</Paragraph>
    </article>
  )
}

function CustomerPackageSelector({ overview, onChange }) {
  const options = (overview.registeredCustomers || []).map((item) => ({
    value: item.customerKey,
    label: item.label,
  }))
  const matched = options.some((item) => item.value === overview.customerKey)

  return (
    <div className="erp-dev-customer-selector">
      <Text type="secondary">客户包选择</Text>
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
  const requestedCustomerKey = overview.requestedCustomerKey || '未选择'
  const missingTitle = overview.sourceLabel || '未登记客户配置包'
  const missingDescription = overview.requestedCustomerKey
    ? '当前 URL customer 参数没有对应客户配置包 / no registered package for this customer query. 开发态总控不会 fallback 到 yoyoosun 冒充，不创建 SaaS tenant，不新增 tenant_id，也不接后端或数据库。'
    : '当前 URL 缺少 customer 参数 / no customer query selected. 开发态总控必须显式选择客户配置包，不会 fallback 到 yoyoosun 冒充，不创建 SaaS tenant，不新增 tenant_id，也不接后端或数据库。'

  return (
    <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-missing">
      <div className="erp-dev-customer-panel__head">
        <ExclamationCircleOutlined />
        <Text strong>{missingTitle}</Text>
      </div>
      <Alert
        type="warning"
        showIcon
        message={`${missingTitle}：${requestedCustomerKey}`}
        description={missingDescription}
      />
      <div className="erp-dev-customer-registered-list">
        <Text type="secondary">已登记客户包 / Registered Packages</Text>
        <Space wrap>
          {(overview.registeredCustomers || []).map((item) => (
            <Tag key={item.customerKey}>{item.label}</Tag>
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
            note="试跑和报告命令"
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
          {menuSummary.brand.brandMark || '客'}
        </div>
        <div>
          <Title level={2}>{menuSummary.brand.companyName}</Title>
          <Paragraph>{menuSummary.brand.systemName}</Paragraph>
          <Space wrap>
            <StatusTag status={menuSummary.runtimeStatus} />
            <Tag>{menuSummary.sourceLabel || '来源已登记'}</Tag>
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
              <Text>{guardItemLabel(item, '字段编号边界')}</Text>
              <Tag color={item.ok ? 'green' : 'red'}>
                {item.ok ? item.expectedLabel : item.valueLabel}
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
                {candidate.fieldKeyLabel} / {candidate.sourceLabel}
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
          message="当前展示合同和工程资料打印模板字段真源"
          description="销售订单受理当前未接打印模板；客户抬头、签章和固定文案应留在客户配置或模板边界，不进入产品核心表单。"
        />
        <div className="erp-dev-customer-tool-list">
          {printTemplateSummary.templates.map((template) => (
            <article className="erp-dev-customer-tool" key={template.key}>
              <div className="erp-dev-customer-tool__head">
                <Space wrap>
                  <Text strong>{template.title}</Text>
                  <Tag>{template.templateKeyLabel}</Tag>
                  <Tag>{template.fieldTruthCountLabel}</Tag>
                  <Tag>{template.fieldRequirementCountLabel}</Tag>
                  <Tag>{template.factBoundaryLabel}</Tag>
                </Space>
                <StatusTag status={template.readiness} />
              </div>
              <Text type="secondary">{template.category}</Text>
              <div className="erp-dev-customer-field-list">
                {template.fieldTruth.map((truth) => (
                  <Text key={truth}>{truth}</Text>
                ))}
              </div>
              <div className="erp-dev-customer-tool-list mt-3">
                {template.fieldRequirementItems.map((requirement) => (
                  <div
                    className="erp-dev-customer-asset"
                    key={`${template.key}-${requirement.label}`}
                  >
                    <Space wrap>
                      <Text strong>{requirement.label}</Text>
                      <Tag>{requirement.requirementKeyLabel}</Tag>
                    </Space>
                    <Text type="secondary">{requirement.sourceLabel}</Text>
                    <Paragraph>{requirement.boundary}</Paragraph>
                  </div>
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
              <Text>{guardItemLabel(item, '客户配置包边界')}</Text>
              <Tag color={item.ok ? 'green' : 'red'}>
                {item.ok ? item.expectedLabel : item.valueLabel}
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
          <Text strong>导入资产范围 / Import Asset Scope</Text>
        </div>
        <div className="erp-dev-customer-asset-grid">
          {consoleSummary.assetSummary.map((item) => (
            <AssetTile item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DatabaseOutlined />
          <Text strong>客户包对象 / Package Objects</Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="只导入配置对象，不导入任意代码、SQL 或业务事实"
          description="本页覆盖配置、规则、流程编排、策略绑定、扩展点绑定、模板和导入映射；策略实现与扩展点实现必须来自产品核心、行业模板或已注册客户部署包。"
        />
        <div className="erp-dev-customer-db-targets">
          {consoleSummary.packageAssetScope.map((item) => (
            <ImportAssetScopeItem item={item} key={item.key} />
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
          message="模块状态只编译为客户配置控制面输入"
          description="默认登记模块会按启用编译；客户包若声明只读或关闭必须带原因。这里不安装或卸载模块，也不证明完整模块关闭流程已交付。"
        />
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.moduleStates.map((item) => (
            <article className="erp-dev-customer-tool" key={item.moduleKey}>
              <div className="erp-dev-customer-tool__head">
                <Space wrap>
                  <Text strong>{item.label}</Text>
                  <Tag>{item.sourceLabel}</Tag>
                  {item.overridden ? <Tag>已覆盖</Tag> : null}
                </Space>
                <StatusTag status={item.stateLabel} />
              </div>
              <Paragraph>{item.reason}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-panel--print-template-defaults">
        <div className="erp-dev-customer-panel__head">
          <FileTextOutlined />
          <Text strong>打印默认方信息 / Print Party Defaults</Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="客户包只声明打印默认方信息草案"
          description="这些默认值只进入客户配置包预检和运行时清单快照；正式打印工作台仍需后续通过客户配置投影接入，不覆盖供应商业务快照，不启用销售订单打印模板。"
        />
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.printTemplateDefaults.map((item) => (
            <article className="erp-dev-customer-tool" key={item.templateKey}>
              <div className="erp-dev-customer-tool__head">
                <Space wrap>
                  <Text strong>{item.templateLabel}</Text>
                  <Tag>{item.defaultFieldCountLabel}</Tag>
                  <Tag>{item.supplierDefaultsAllowedLabel}</Tag>
                </Space>
                <StatusTag status={item.status} />
              </div>
              <Text type="secondary">
                {item.partyDefaultKeysLabel || '默认方字段未声明'}
              </Text>
              <Paragraph>{item.guardrail}</Paragraph>
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
          <Text strong>编译目录投影</Text>
        </div>
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.compiledCatalogSummary.map((item) => (
            <CompiledCatalogItem item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <SafetyCertificateOutlined />
          <Text strong>策略与扩展点登记</Text>
        </div>
        <div className="erp-dev-customer-formal-gates">
          {consoleSummary.registryChecks.map((item) => (
            <RegistryCheckItem item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>工作流预览</Text>
        </div>
        <div className="erp-dev-customer-tool-list">
          {customerPackageSummary.workflows.map((workflow) => (
            <article className="erp-dev-customer-tool" key={workflow.key}>
              <div className="erp-dev-customer-tool__head">
                <Text strong>{workflow.label}</Text>
                <StatusTag status={workflow.status} />
              </div>
              <Space wrap>
                <Tag>{workflow.nodeCount} 个节点</Tag>
                <Tag>{workflow.factBoundaryLabel}</Tag>
                {(workflow.ownerPoolLabels || []).map((poolLabel) => (
                  <Tag key={poolLabel}>{poolLabel}</Tag>
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
          <Text strong>业务流转</Text>
        </div>
        <div className="erp-dev-customer-field-list">
          {customerPackageSummary.businessFlows.map((flow) => (
            <article className="erp-dev-customer-field" key={flow.key}>
              <div className="erp-dev-customer-field__head">
                <Text strong>{flow.label}</Text>
                <StatusTag status={flow.status} />
              </div>
              <Text className="erp-dev-customer-field__key">
                {flow.flowKeyLabel} / {flow.moduleRouteLabel}
              </Text>
              <Paragraph>{flow.guardrail}</Paragraph>
            </article>
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CodeOutlined />
          <Text strong>状态机与策略</Text>
        </div>
        <div className="erp-dev-customer-numbering-list">
          {customerPackageSummary.stateMachines.map((item) => (
            <article className="erp-dev-customer-numbering" key={item.key}>
              <div>
                <Text strong>{item.label}</Text>
                <Text type="secondary">
                  {item.stateCountLabel} / {item.transitionCountLabel}
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
                  {item.kindLabel} / {item.ruleCountLabel}
                </Text>
                {(item.ruleItems || []).length > 0 ? (
                  <div className="erp-dev-customer-policy-rule-list">
                    {item.ruleItems.map((rule) => (
                      <div
                        className="erp-dev-customer-policy-rule"
                        key={rule.key}
                      >
                        <Text>{rule.triggerLabel}</Text>
                        <Text type="secondary">{rule.resultLabel}</Text>
                      </div>
                    ))}
                  </div>
                ) : null}
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
          <Text strong>预检命令</Text>
        </div>
        <CommandList commands={consoleSummary.qaCommands} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <CodeOutlined />
          <Text strong>来源路径</Text>
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
                {gate.enabled ? '已开启' : '未开启'}
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
          description="试跑和执行报告只能生成评审证据；没有客户确认、备份证据、未匹配队列清零和单独真实导入任务前，不允许写数据库。"
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
            当前页支持测试版试跑和本地/测试后端应用；正式发布必须通过发布证据门禁。
          </Text>
          <Text type="secondary">
            这里把参考文档里的上传、解析、预检、Dry
            Run、正式导入、发布和审计流程压缩成当前可执行的开发态工作台；不会上传
            原始包，不会直接写业务事实。
          </Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="本地/测试后端应用只写客户配置控制面"
          description="页面试跑不写数据库；应用到当前后端会调用客户配置校验、发布和激活。本地开发默认写 8300；若连接测试环境必须先确认后端目标。真实客户业务数据导入仍是单独专项。"
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
          <Text strong>测试版页面试跑</Text>
        </div>
        <Paragraph type="secondary">
          直接在页面生成试跑证据；只写本地输出目录，不写数据库。
        </Paragraph>
        <Button
          type="primary"
          loading={dryRunState.status === 'running'}
          disabled={!importSummary.canRunUiDryRun}
          onClick={onRunDryRun}
        >
          运行测试试跑
        </Button>
        <DryRunSummary dryRunState={dryRunState} onRunDryRun={onRunDryRun} />
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DeploymentUnitOutlined />
          <Text strong>本地/测试后端应用 / Local Or Test Apply</Text>
        </div>
        <Paragraph type="secondary">
          一键把已选甲方配置应用到当前后端的客户配置控制面；本地开发默认写
          8300，若连接测试环境必须先确认后端目标。
        </Paragraph>
        <div className="erp-dev-customer-test-apply-primary">
          <Button
            type="primary"
            loading={applyState.status === 'running'}
            disabled={!importSummary.canApplyTestConfig}
            onClick={onApplyTestConfig}
          >
            应用到当前后端
          </Button>
          <Text type="secondary">
            校验 / 发布 / 激活 / 有效配置投影；不导入客户业务数据。
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
          description="发布版只写客户配置控制面；没有清单证据、发布证据、管理员确认、审计和回滚方案前，发布按钮不可执行。"
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
          <SafetyCertificateOutlined />
          <Text strong>版本快照 / 回滚 / 审计</Text>
        </div>
        <Alert
          type="info"
          showIcon
          message="回滚只恢复配置版本，不删除业务事实"
          description="客户配置版本写入配置控制面；发布 / 激活 / 回滚会记录脱敏运行审计。已产生的库存、出货、财务和业务单据必须走对应业务补偿，不能由配置回滚抹除。"
        />
        <div className="erp-dev-customer-formal-gates">
          {importSummary.versionAuditSupport.map((item) => (
            <FormalGateItem item={item} key={item.key} />
          ))}
        </div>
      </section>
      <section className="erp-dev-customer-panel erp-dev-customer-panel--wide">
        <div className="erp-dev-customer-panel__head">
          <DatabaseOutlined />
          <Text strong>执行边界 / Execution Boundary</Text>
        </div>
        <div className="erp-dev-customer-import-flags">
          {importSummary.executionFlagSummary.map((item) => (
            <div key={item.key}>
              <Text type="secondary">{item.label}</Text>
              <Tag color={item.value === true ? 'blue' : 'red'}>
                {item.valueLabel}
              </Tag>
            </div>
          ))}
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
              {tool.note ? <Text type="secondary">{tool.note}</Text> : null}
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
        throw new Error('试跑生成失败')
      }
      setDryRunState({ status: 'success', result: payload })
      message.success('试跑证据已生成')
    } catch (error) {
      if (error?.name === 'AbortError') {
        return
      }
      if (dryRunRequestRef.current !== requestId) {
        return
      }
      setDryRunState({
        status: 'error',
        error: getActionErrorMessage(error, '试跑生成失败'),
      })
      message.error('试跑生成失败')
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
      step: '正在编译运行时清单',
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
        throw new Error('运行时清单编译失败')
      }
      const { manifest } = manifestPayload

      setApplyState({
        status: 'running',
        step: '正在校验客户配置',
      })
      const validation = await validateCustomerConfig(manifest)
      if (!ensureCurrent()) {
        return
      }

      setApplyState({
        status: 'running',
        step: '正在发布测试配置版本',
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
        step: '正在激活测试配置版本',
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
        step: '正在读取有效配置投影',
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
              label: '编译清单',
              status: 'passed',
              note: manifestPayload.manifestPath,
            },
            {
              key: 'validate',
              label: '后端校验',
              status: 'passed',
              note: validation?.config_hash || '客户配置校验通过',
            },
            {
              key: 'publish',
              label: '发布测试版本',
              status: publishSkipped ? 'test_apply_done' : 'passed',
              note: publishSkipped
                ? '当前 revision 已激活，跳过重复发布'
                : publish?.status || '客户配置发布通过',
            },
            {
              key: 'activate',
              label: '激活测试版本',
              status: 'test_apply_done',
              note: activated?.status || '客户配置激活通过',
            },
            {
              key: 'session',
              label: '读取会话投影',
              status: 'test_apply_done',
              note: effectiveSession?.configRevision || '有效配置投影读取通过',
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

  const requestApplyTestConfig = () => {
    modal.confirm({
      centered: true,
      title: '确认应用测试配置？',
      content:
        '该操作会用当前管理员登录态写入当前后端的客户配置控制面，并激活测试配置版本；本地开发默认写 8300，若连接测试环境必须先确认后端目标；不会导入客户业务数据，也不代表正式发布通过。',
      okText: '确认应用测试配置',
      cancelText: '取消',
      onOk: handleApplyTestConfig,
    })
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
        throw new Error('发布门禁检查失败')
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
      step: '正在校验客户配置',
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
        step: '正在发布正式配置版本',
        result: readiness,
      })
      const publish = await publishCustomerConfig(manifest)
      if (!ensureCurrent()) {
        return
      }
      setReleaseState({
        status: 'publishing',
        step: '正在激活正式配置版本',
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

  const requestApplyReleaseConfig = () => {
    modal.confirm({
      centered: true,
      title: '确认发布正式配置？',
      content:
        '仅在 release readiness 已通过后继续。该操作会写入并激活正式客户配置控制面，不导入客户业务数据，也不替代生产部署、备份恢复或客户签收。',
      okText: '确认发布正式配置',
      cancelText: '取消',
      onOk: handleApplyReleaseConfig,
    })
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
        onApplyTestConfig={requestApplyTestConfig}
        onCheckReleaseReadiness={handleCheckReleaseReadiness}
        onApplyReleaseConfig={requestApplyReleaseConfig}
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
              客户配置包导入控制台 / Package Import Console
            </Title>
          </Space>
          <Text className="erp-dev-customer-summary">
            dev-only，受控评审客户配置包；按上传解析、校验、差异、Dry
            Run、草稿版本和发布推进，不上传任意代码、SQL 或脚本。
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
            {overview.sourceLabel || '未登记客户配置包'}
          </Text>
        </div>
      </header>

      {isMissingCustomer ? <MissingCustomerPanel overview={overview} /> : panel}
    </main>
  )
}
