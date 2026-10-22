import { CopyOutlined, ExclamationCircleOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Tag, Tooltip, Typography } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { message } from '@/common/utils/antdApp'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'

const { Paragraph, Text } = Typography

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

export function statusText(status) {
  const key = String(status || '').trim()
  if (!key) return '-'
  if (STATUS_LABELS[key]) return STATUS_LABELS[key]
  return /[\u4e00-\u9fff]/u.test(key) ? key : '状态'
}

export function guardItemLabel(item, fallbackLabel) {
  const label = String(item?.label || '').trim()
  return label || fallbackLabel
}

export function StatusTag({ status }) {
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

export function ReviewChecklistItem({ item }) {
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

export function SourceReference({ item }) {
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

export function copyText(value, successMessage = '已复制命令') {
  copyTextToClipboard(value)
    .then(() => message.success(successMessage))
    .catch(() => message.error('复制失败，请手动选择命令'))
}

export function CommandBlock({ command }) {
  return (
    <div className="erp-dev-customer-command">
      <code>{command}</code>
      <Tooltip title="复制命令">
        <Button
          type="text"
          icon={<CopyOutlined aria-hidden="true" />}
          aria-label="复制命令"
          onClick={() => copyText(command)}
        />
      </Tooltip>
    </div>
  )
}

export function CommandList({ commands = [] }) {
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

export function FormalGateItem({ item }) {
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

export function ImportAssetScopeItem({ item }) {
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

export function RegistryCheckItem({ item }) {
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

export function CompiledCatalogItem({ item }) {
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

export function CustomerPackageSelector({
  overview,
  onChange,
  disabled = false,
}) {
  const options = (overview.registeredCustomers || []).map((item) => ({
    value: item.customerKey,
    label: item.label,
  }))
  const matched = options.some((item) => item.value === overview.customerKey)

  return (
    <div className="erp-dev-customer-selector">
      <Text strong>当前客户包</Text>
      {matched && options.length === 1 ? (
        <Text strong>{options[0].label}</Text>
      ) : (
        <Select
          allowClear={false}
          label="客户包选择"
          aria-label="客户包选择"
          value={matched ? overview.customerKey : undefined}
          placeholder="选择已登记客户包"
          options={options}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      {disabled ? (
        <Text type="secondary" className="erp-dev-customer-selector__note">
          配置操作进行中，客户包已锁定；离开页面不会撤销操作。
        </Text>
      ) : null}
    </div>
  )
}

export function AssetTile({ item }) {
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

export function MissingCustomerPanel({ overview }) {
  const requestedCustomerKey = overview.requestedCustomerKey || '未选择'
  const missingTitle = overview.sourceLabel || '未登记客户配置包'
  const missingDescription =
    overview.blockedPieces?.[0]?.boundary || '请选择已登记的客户配置包后重试。'

  return (
    <section className="erp-dev-customer-panel erp-dev-customer-panel--wide erp-dev-customer-missing">
      <div className="erp-dev-customer-panel__head">
        <ExclamationCircleOutlined aria-hidden="true" />
        <Text strong>{missingTitle}</Text>
      </div>
      <Alert
        type="warning"
        showIcon
        message={`${missingTitle}：${requestedCustomerKey}`}
        description={missingDescription}
      />
      <div className="erp-dev-customer-registered-list">
        <Text type="secondary">已登记客户包</Text>
        <Space wrap>
          {(overview.registeredCustomers || []).map((item) => (
            <Tag key={item.customerKey}>{item.label}</Tag>
          ))}
        </Space>
      </div>
    </section>
  )
}
