import React, { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BarChartOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FilterOutlined,
  FundProjectionScreenOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Input,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
  buildCapabilityLedgerSummary,
  buildCustomerDeltaLedgerSummary,
  buildCustomerDeliveryMatrixSummary,
  buildDevCapabilityDocsHref,
  filterCapabilityLedgerItems,
  filterCustomerDeltaLedgerItems,
  filterCustomerDeliveryMatrixItems,
  parseCapabilityLedgerMarkdown,
  parseCustomerDeltaLedgerMarkdown,
  parseCustomerDeliveryMatrixMarkdown,
  selectVisibleLedgerItem,
} from '../config/devCapabilityLedger.mjs'
import DevPageNav from '../components/dev/DevPageNav.jsx'
import DevTaskNav from '../components/dev/DevTaskNav.jsx'
import { formatDevEnglishAnchor } from '../config/devVisibleLabels.mjs'

import deltaLedgerSource from '../../../../docs/customers/yoyoosun/客户差异台账.md?raw'
import deliveryMatrixSource from '../../../../docs/customers/yoyoosun/客户交付矩阵.md?raw'
import capabilityEvidenceSource from '../../../../docs/product/产品能力证据详情.md?raw'
import capabilityLedgerSource from '../../../../docs/product/产品能力进度台账.md?raw'

const { Paragraph, Text, Title } = Typography

const ALL_OPTION = 'all'
const VIEW_CAPABILITIES = 'capabilities'
const VIEW_DELIVERY = 'delivery'
const VIEW_DELTA = 'delta'
const VIEW_QUERY_KEY = 'view'
const ITEM_QUERY_KEY = 'item'
const ANALYSIS_QUERY_KEY = 'analysis'

const VIEW_OPTIONS = [
  {
    label: '产品能力',
    description: '成熟度、证据与下一步',
    value: VIEW_CAPABILITIES,
  },
  {
    label: '客户交付',
    description: '可试用、已交付与未开始',
    value: VIEW_DELIVERY,
  },
  {
    label: '客户差异',
    description: '内核、配置、延后与禁止',
    value: VIEW_DELTA,
  },
]
const VIEW_VALUES = new Set(VIEW_OPTIONS.map((option) => option.value))

const SOURCE_PATHS_BY_VIEW = {
  [VIEW_CAPABILITIES]: [
    DEV_CAPABILITY_LEDGER_SOURCE_PATH,
    DEV_CAPABILITY_EVIDENCE_SOURCE_PATH,
  ],
  [VIEW_DELIVERY]: [DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH],
  [VIEW_DELTA]: [DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH],
}

function buildOptions(field, items = [], formatLabel = (value) => value) {
  return [
    { label: '全部', value: ALL_OPTION },
    ...[...new Set(items.map((item) => item[field]).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((value) => ({ label: formatLabel(value), value })),
  ]
}

function formatPercent(value, total) {
  if (!total) return '0%'
  return `${Math.round((value / total) * 100)}%`
}

function MetricTile({ icon, label, value, note, tone = 'default' }) {
  return (
    <div
      className={`erp-dev-capability-metric erp-dev-capability-metric--${tone}`}
    >
      <span className="erp-dev-capability-metric__icon">{icon}</span>
      <span className="erp-dev-capability-metric__copy">
        <span className="erp-dev-capability-metric__label">{label}</span>
        <span className="erp-dev-capability-metric__value">{value}</span>
        <span className="erp-dev-capability-metric__note">{note}</span>
      </span>
    </div>
  )
}

function DistributionBars({ title, items = [], total, formatLabel }) {
  return (
    <section className="erp-dev-capability-panel">
      <div className="erp-dev-capability-panel__head">
        <Text strong>{title}</Text>
        <Text type="secondary">{items.length} 组</Text>
      </div>
      <div className="erp-dev-capability-bars">
        {items.slice(0, 9).map((item) => (
          <div className="erp-dev-capability-bar" key={item.key}>
            <div className="erp-dev-capability-bar__meta">
              <span className="erp-dev-capability-bar__label">
                {formatLabel ? formatLabel(item.key) : item.key}
              </span>
              <span className="erp-dev-capability-bar__value">
                {item.count} / {formatPercent(item.count, total)}
              </span>
            </div>
            <div className="erp-dev-capability-bar__track">
              <span
                className="erp-dev-capability-bar__fill"
                style={{ width: formatPercent(item.count, total) }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function MaturityDefinitions({ items = [] }) {
  return (
    <section
      className="erp-dev-capability-panel erp-dev-capability-maturity-guide"
      aria-labelledby="capability-maturity-guide-title"
    >
      <div className="erp-dev-capability-panel__head">
        <Text strong id="capability-maturity-guide-title">
          成熟度等级说明
        </Text>
        <Text type="secondary">L0–L8</Text>
      </div>
      <Text className="erp-dev-capability-maturity-guide__summary">
        表示一项能力已经推进到哪一层；等级越高，闭环越完整，但只有 L8
        才能对客户承诺交付。
      </Text>
      <div className="erp-dev-capability-maturity-guide__list">
        {items.map((item) => (
          <div
            className="erp-dev-capability-maturity-guide__item"
            key={item.level}
          >
            <span className="erp-dev-capability-maturity-guide__level">
              {item.level}
            </span>
            <span className="erp-dev-capability-maturity-guide__copy">
              <strong>{item.name}</strong>
              <span>{item.meaning}</span>
              <small>客户承诺：{item.customerCommitment}</small>
            </span>
          </div>
        ))}
      </div>
      <Text className="erp-dev-capability-maturity-guide__note">
        注意：这里的 L0–L8 是能力成熟度，不是前端样式检查 <code>style:l1</code>
        ，也不是 T0–T8 验证层级。
      </Text>
      <Link
        className="erp-dev-capability-maturity-guide__source"
        to={buildDevCapabilityDocsHref(DEV_CAPABILITY_LEDGER_SOURCE_PATH)}
      >
        查看正式定义：产品能力进度台账
      </Link>
    </section>
  )
}

function trialTagFor(item) {
  if (item.trialStatus === 'yes') return <Tag color="green">可试用</Tag>
  if (item.trialStatus === 'limited') return <Tag color="gold">有限试用</Tag>
  if (item.trialStatus === 'no') return <Tag>不可试用</Tag>
  return <Tag>试用状态未标记</Tag>
}

function deliveryCommitmentTagFor(item) {
  if (item.deliveryStatus === 'yes') return <Tag color="green">可承诺</Tag>
  if (item.deliveryStatus === 'no') return <Tag color="red">不承诺</Tag>
  return <Tag>承诺状态未标记</Tag>
}

function customerDeliveryStatusTag(status) {
  const colorByStatus = {
    未开始: 'default',
    内部可用: 'blue',
    可演示: 'cyan',
    可试用: 'green',
    已交付: 'purple',
  }
  return (
    <Tag color={colorByStatus[status] || 'default'}>{status || '未标记'}</Tag>
  )
}

function productCoreDecisionTag(value) {
  const decision = value || ''
  if (decision === '是' || decision.includes('已进入')) {
    return (
      <Tag color="green">
        {decision === '是' ? '进入产品内核 / Product Core' : decision}
      </Tag>
    )
  }
  if (decision.includes('可能') || decision.includes('待评审')) {
    return <Tag color="gold">{decision}</Tag>
  }
  if (decision.startsWith('暂不进入')) {
    return <Tag color="orange">{decision}</Tag>
  }
  return <Tag>{decision || '未判断'}</Tag>
}

function maturityClass(item) {
  const level = item.maturityMax ?? 0
  if (level >= 7) return 'erp-dev-capability-maturity--high'
  if (level >= 4) return 'erp-dev-capability-maturity--mid'
  return 'erp-dev-capability-maturity--low'
}

function CapabilityList({
  items = [],
  selectedKey,
  onSelect,
  emptyDescription = '没有匹配能力',
}) {
  if (items.length === 0) {
    return (
      <div className="erp-dev-capability-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyDescription}
        />
      </div>
    )
  }

  return (
    <div className="erp-dev-capability-list" aria-label="产品能力列表">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={
            item.key === selectedKey
              ? 'erp-dev-capability-row erp-dev-capability-row--active'
              : 'erp-dev-capability-row'
          }
          aria-current={item.key === selectedKey ? 'true' : undefined}
          onClick={() => onSelect(item.key)}
        >
          <span className="erp-dev-capability-row__top">
            <span className="erp-dev-capability-row__id">
              {item.detailMatched ? '详情已对齐' : '详情未对齐'}
            </span>
            <span
              className={`erp-dev-capability-maturity ${maturityClass(item)}`}
            >
              {item.maturityLabel || '未标级'}
            </span>
          </span>
          <span className="erp-dev-capability-row__title">{item.name}</span>
          <span className="erp-dev-capability-row__meta">
            <span>{formatDevEnglishAnchor(item.layer)}</span>
            {item.domain ? (
              <span>{formatDevEnglishAnchor(item.domain)}</span>
            ) : null}
          </span>
          <span className="erp-dev-capability-row__tags">
            {trialTagFor(item)}
            {deliveryCommitmentTagFor(item)}
          </span>
        </button>
      ))}
    </div>
  )
}

function DeliveryList({
  items = [],
  selectedKey,
  onSelect,
  emptyDescription = '没有匹配交付项',
}) {
  if (items.length === 0) {
    return (
      <div className="erp-dev-capability-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyDescription}
        />
      </div>
    )
  }

  return (
    <div className="erp-dev-capability-list" aria-label="客户交付矩阵列表">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={
            item.key === selectedKey
              ? 'erp-dev-capability-row erp-dev-capability-row--active'
              : 'erp-dev-capability-row'
          }
          aria-current={item.key === selectedKey ? 'true' : undefined}
          onClick={() => onSelect(item.key)}
        >
          <span className="erp-dev-capability-row__top">
            <span className="erp-dev-capability-row__id">
              {item.customerKey}
            </span>
            {customerDeliveryStatusTag(item.customerDeliveryStatus)}
          </span>
          <span className="erp-dev-capability-row__title">
            {item.moduleName}
          </span>
          <span className="erp-dev-capability-row__meta">
            <span>{item.visibleCommitment}</span>
          </span>
          <span className="erp-dev-capability-row__tags">
            <Tag>
              {item.acceptanceEvidence ? '验收证据已登记' : '未登记证据'}
            </Tag>
          </span>
        </button>
      ))}
    </div>
  )
}

function DeltaList({
  items = [],
  selectedKey,
  onSelect,
  emptyDescription = '没有匹配差异',
}) {
  if (items.length === 0) {
    return (
      <div className="erp-dev-capability-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={emptyDescription}
        />
      </div>
    )
  }

  return (
    <div className="erp-dev-capability-list" aria-label="客户差异台账列表">
      {items.map((item) => (
        <button
          type="button"
          key={item.key}
          className={
            item.key === selectedKey
              ? 'erp-dev-capability-row erp-dev-capability-row--active'
              : 'erp-dev-capability-row'
          }
          aria-current={item.key === selectedKey ? 'true' : undefined}
          onClick={() => onSelect(item.key)}
        >
          <span className="erp-dev-capability-row__top">
            <span className="erp-dev-capability-row__id">{item.id}</span>
            {productCoreDecisionTag(item.productCoreDecision)}
          </span>
          <span className="erp-dev-capability-row__title">{item.demand}</span>
          <span className="erp-dev-capability-row__meta">
            <span>{formatDevEnglishAnchor(item.category)}</span>
            <span>{item.source}</span>
          </span>
        </button>
      ))}
    </div>
  )
}

function DetailBlock({ title, children }) {
  const content = children || '未填写'
  return (
    <div className="erp-dev-capability-detail__block">
      <Text strong>{title}</Text>
      {typeof content === 'string' ? <Paragraph>{content}</Paragraph> : content}
    </div>
  )
}

function SourceDiagnostics({ diagnostics = [] }) {
  if (diagnostics.length === 0) return null
  const hasError = diagnostics.some((item) => item.severity === 'error')

  return (
    <section className="erp-dev-capability-metrics" aria-label="真源诊断">
      <Alert
        showIcon
        type={hasError ? 'error' : 'warning'}
        message={hasError ? '真源解析需要处理' : '真源存在未对齐项'}
        description={
          <Space direction="vertical" size={4}>
            {diagnostics.map((item, index) => (
              <Text key={`${item.code}:${item.sourcePath}:${index}`}>
                {item.message}
                {item.names?.length > 0 ? ` ${item.names.join('、')}` : ''}
                {item.lineNumbers?.length > 0
                  ? `（行 ${item.lineNumbers.join('、')}）`
                  : ''}
              </Text>
            ))}
          </Space>
        }
        style={{ gridColumn: '1 / -1', width: '100%' }}
      />
    </section>
  )
}

function CapabilityDetail({ item }) {
  if (!item) {
    return (
      <section className="erp-dev-capability-detail">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前筛选没有可显示能力 / No capability in current result"
        />
      </section>
    )
  }

  return (
    <section className="erp-dev-capability-detail">
      <div className="erp-dev-capability-detail__head">
        <Space align="center" size={8} wrap>
          <Tag color={item.detailMatched ? 'green' : 'gold'}>
            {item.detailMatched ? '详情已对齐' : '详情未对齐'}
          </Tag>
          <span
            className={`erp-dev-capability-maturity ${maturityClass(item)}`}
          >
            {item.maturityLabel || '未标级'}
          </span>
          {trialTagFor(item)}
          {deliveryCommitmentTagFor(item)}
        </Space>
        <Title level={4} className="erp-dev-capability-detail__title">
          {item.name}
        </Title>
        <Text type="secondary">
          {formatDevEnglishAnchor(item.layer)}
          {item.domain ? ` · ${formatDevEnglishAnchor(item.domain)}` : ''}
        </Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        {!item.detailMatched ? (
          <DetailBlock title="证据详情对齐 / Evidence Alignment">
            未找到与“{item.name}”完全同名的三级详情标题；当前页面不做模糊匹配，
            请按顶部诊断核对两份正式文档。
          </DetailBlock>
        ) : null}
        <DetailBlock title="客户可见性 / Customer Visibility">
          {item.customerVisibility}
        </DetailBlock>
        <DetailBlock title="当前结果 / Current Result">
          {item.currentResult}
        </DetailBlock>
        <DetailBlock title="当前不包含 / Not Included">
          {item.notIncluded}
        </DetailBlock>
        <DetailBlock title="证据 / Evidence">{item.evidence}</DetailBlock>
        <DetailBlock title="下一步 / Next Step">{item.nextStep}</DetailBlock>
        {item.detailNextStep && item.detailNextStep !== item.nextStep ? (
          <DetailBlock title="证据详情中的下一步 / Detail Next Step">
            {item.detailNextStep}
          </DetailBlock>
        ) : null}
        <DetailBlock title="风险 / Risk">{item.risk}</DetailBlock>
      </div>
    </section>
  )
}

function DeliveryDetail({ item }) {
  if (!item) {
    return (
      <section className="erp-dev-capability-detail">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前筛选没有可显示交付项 / No delivery item in current result"
        />
      </section>
    )
  }

  return (
    <section className="erp-dev-capability-detail">
      <div className="erp-dev-capability-detail__head">
        <Space align="center" size={8} wrap>
          {customerDeliveryStatusTag(item.customerDeliveryStatus)}
          <Tag>{item.customerKey}</Tag>
        </Space>
        <Title level={4} className="erp-dev-capability-detail__title">
          {item.moduleName}
        </Title>
        <Text type="secondary">{item.customerKey}</Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        <DetailBlock title="客户可见承诺 / Visible Commitment">
          {item.visibleCommitment}
        </DetailBlock>
        <DetailBlock title="验收证据 / Acceptance Evidence">
          {item.acceptanceEvidence}
        </DetailBlock>
        <DetailBlock title="风险与下一步 / Risk & Next Step">
          {item.riskNextStep}
        </DetailBlock>
      </div>
    </section>
  )
}

function DeltaDetail({ item }) {
  if (!item) {
    return (
      <section className="erp-dev-capability-detail">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="当前筛选没有可显示差异 / No delta item in current result"
        />
      </section>
    )
  }

  return (
    <section className="erp-dev-capability-detail">
      <div className="erp-dev-capability-detail__head">
        <Space align="center" size={8} wrap>
          <Tag color="blue">{item.id}</Tag>
          {productCoreDecisionTag(item.productCoreDecision)}
        </Space>
        <Title level={4} className="erp-dev-capability-detail__title">
          {item.demand}
        </Title>
        <Text type="secondary">
          {item.customerKey} · {formatDevEnglishAnchor(item.category)}
        </Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        <DetailBlock title="来源 / Source">{item.source}</DetailBlock>
        <DetailBlock title="当前判断 / Current Judgement">
          {item.judgement}
        </DetailBlock>
        <DetailBlock title="处理方式 / Handling">{item.handling}</DetailBlock>
        <DetailBlock title="前置条件 / Prerequisites">
          {item.prerequisites}
        </DetailBlock>
        <DetailBlock title="风险 / Risk">{item.risk}</DetailBlock>
        <DetailBlock title="下一步 / Next Step">{item.nextStep}</DetailBlock>
      </div>
    </section>
  )
}

export default function DevCapabilityLedgerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const capabilityResult = useMemo(
    () =>
      parseCapabilityLedgerMarkdown(
        capabilityLedgerSource,
        capabilityEvidenceSource
      ),
    []
  )
  const deliveryResult = useMemo(
    () => parseCustomerDeliveryMatrixMarkdown(deliveryMatrixSource),
    []
  )
  const deltaResult = useMemo(
    () => parseCustomerDeltaLedgerMarkdown(deltaLedgerSource),
    []
  )
  const capabilities = capabilityResult.items
  const deliveryItems = deliveryResult.items
  const deltaItems = deltaResult.items
  const capabilitySummary = useMemo(
    () => buildCapabilityLedgerSummary(capabilities),
    [capabilities]
  )
  const deliverySummary = useMemo(
    () => buildCustomerDeliveryMatrixSummary(deliveryItems),
    [deliveryItems]
  )
  const deltaSummary = useMemo(
    () => buildCustomerDeltaLedgerSummary(deltaItems),
    [deltaItems]
  )
  const requestedView = searchParams.get(VIEW_QUERY_KEY) || ''
  const activeView = VIEW_VALUES.has(requestedView)
    ? requestedView
    : VIEW_CAPABILITIES
  const showAnalysis = searchParams.get(ANALYSIS_QUERY_KEY) === '1'
  const [keyword, setKeyword] = useState('')
  const [layer, setLayer] = useState(ALL_OPTION)
  const [domain, setDomain] = useState(ALL_OPTION)
  const [maturity, setMaturity] = useState(ALL_OPTION)
  const [deliveryStatus, setDeliveryStatus] = useState(ALL_OPTION)
  const [deltaCategory, setDeltaCategory] = useState(ALL_OPTION)
  const [deltaCoreDecision, setDeltaCoreDecision] = useState(ALL_OPTION)
  const filteredCapabilities = useMemo(
    () =>
      filterCapabilityLedgerItems(capabilities, {
        keyword,
        layer,
        domain,
        maturity,
      }),
    [capabilities, domain, keyword, layer, maturity]
  )

  const filteredDeliveryItems = useMemo(
    () =>
      filterCustomerDeliveryMatrixItems(deliveryItems, {
        keyword,
        status: deliveryStatus,
      }),
    [deliveryItems, deliveryStatus, keyword]
  )

  const filteredDeltaItems = useMemo(
    () =>
      filterCustomerDeltaLedgerItems(deltaItems, {
        keyword,
        category: deltaCategory,
        coreDecision: deltaCoreDecision,
      }),
    [deltaCategory, deltaCoreDecision, deltaItems, keyword]
  )

  const activeItems =
    activeView === VIEW_CAPABILITIES
      ? capabilities
      : activeView === VIEW_DELIVERY
        ? deliveryItems
        : deltaItems
  const activeFilteredItems =
    activeView === VIEW_CAPABILITIES
      ? filteredCapabilities
      : activeView === VIEW_DELIVERY
        ? filteredDeliveryItems
        : filteredDeltaItems
  const requestedItemKey = searchParams.get(ITEM_QUERY_KEY) || ''
  const requestedItem = selectVisibleLedgerItem(activeItems, requestedItemKey)
  const selectedItem = selectVisibleLedgerItem(
    activeFilteredItems,
    requestedItem?.key || ''
  )
  const canonicalItemKey = selectedItem?.key || requestedItem?.key || ''
  const selectedCapability =
    activeView === VIEW_CAPABILITIES ? selectedItem : null
  const selectedDelivery = activeView === VIEW_DELIVERY ? selectedItem : null
  const selectedDelta = activeView === VIEW_DELTA ? selectedItem : null

  const layerOptions = useMemo(
    () => buildOptions('layer', capabilities, formatDevEnglishAnchor),
    [capabilities]
  )
  const domainOptions = useMemo(
    () => buildOptions('domain', capabilities, formatDevEnglishAnchor),
    [capabilities]
  )
  const maturityOptions = useMemo(
    () => buildOptions('maturityBucket', capabilities),
    [capabilities]
  )
  const deliveryStatusOptions = useMemo(
    () => buildOptions('customerDeliveryStatus', deliveryItems),
    [deliveryItems]
  )
  const deltaCategoryOptions = useMemo(
    () => buildOptions('category', deltaItems, formatDevEnglishAnchor),
    [deltaItems]
  )
  const deltaCoreDecisionOptions = useMemo(
    () => buildOptions('productCoreDecision', deltaItems),
    [deltaItems]
  )
  const activeDiagnostics =
    activeView === VIEW_CAPABILITIES
      ? capabilityResult.diagnostics
      : activeView === VIEW_DELIVERY
        ? deliveryResult.diagnostics
        : deltaResult.diagnostics
  const activeHasSourceError = activeDiagnostics.some(
    (item) => item.severity === 'error'
  )

  useEffect(() => {
    if (requestedView === activeView && requestedItemKey === canonicalItemKey) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(VIEW_QUERY_KEY, activeView)
    if (canonicalItemKey) {
      nextParams.set(ITEM_QUERY_KEY, canonicalItemKey)
    } else {
      nextParams.delete(ITEM_QUERY_KEY)
    }
    setSearchParams(nextParams, { replace: true })
  }, [
    activeView,
    canonicalItemKey,
    requestedItemKey,
    requestedView,
    searchParams,
    setSearchParams,
  ])

  const selectView = (nextView) => {
    const normalizedView = VIEW_VALUES.has(nextView)
      ? nextView
      : VIEW_CAPABILITIES
    const nextItems =
      normalizedView === VIEW_CAPABILITIES
        ? capabilities
        : normalizedView === VIEW_DELIVERY
          ? deliveryItems
          : deltaItems
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(VIEW_QUERY_KEY, normalizedView)
    if (nextItems[0]?.key) {
      nextParams.set(ITEM_QUERY_KEY, nextItems[0].key)
    } else {
      nextParams.delete(ITEM_QUERY_KEY)
    }
    setSearchParams(nextParams)
  }

  const selectItem = (nextItemKey) => {
    const nextItem = selectVisibleLedgerItem(activeItems, nextItemKey)
    const nextParams = new URLSearchParams(searchParams)
    if (nextItem?.key) {
      nextParams.set(ITEM_QUERY_KEY, nextItem.key)
    } else {
      nextParams.delete(ITEM_QUERY_KEY)
    }
    setSearchParams(nextParams)
  }

  const resetFilters = () => {
    setKeyword('')
    setLayer(ALL_OPTION)
    setDomain(ALL_OPTION)
    setMaturity(ALL_OPTION)
    setDeliveryStatus(ALL_OPTION)
    setDeltaCategory(ALL_OPTION)
    setDeltaCoreDecision(ALL_OPTION)
  }

  const toggleAnalysis = () => {
    const nextParams = new URLSearchParams(searchParams)
    if (showAnalysis) {
      nextParams.delete(ANALYSIS_QUERY_KEY)
    } else {
      nextParams.set(ANALYSIS_QUERY_KEY, '1')
    }
    setSearchParams(nextParams)
  }

  return (
    <div className="erp-dev-capability-page erp-dev-workspace-page">
      <DevPageNav sourcePath={SOURCE_PATHS_BY_VIEW[activeView][0]} />
      <header className="erp-dev-capability-header">
        <div className="erp-dev-capability-header__copy">
          <Space align="center" size={10} wrap>
            <FundProjectionScreenOutlined className="erp-dev-capability-header__icon" />
            <Title level={1} className="erp-dev-capability-title">
              能力台账可视化 / Capability Ledger
            </Title>
            <Tag color="green">仅开发环境 / DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-capability-summary">
            只读解析能力快查、能力证据详情、yoyoosun 客户交付矩阵和客户差异台账
            / read-only ledger visualization；不进入 ERP 菜单、权限、后端业务
            API 或产品文档 registry。
          </Paragraph>
          <DevTaskNav
            compact
            className="erp-dev-capability-view-switch"
            ariaLabel="能力台账视图"
            value={activeView}
            items={VIEW_OPTIONS}
            onChange={selectView}
          />
        </div>
        <div className="erp-dev-capability-source">
          <Text type="secondary">当前视图真源 / Source</Text>
          {SOURCE_PATHS_BY_VIEW[activeView].map((sourcePath) => (
            <Link key={sourcePath} to={buildDevCapabilityDocsHref(sourcePath)}>
              {sourcePath}
            </Link>
          ))}
          <Text type="secondary">联动读取 4 份 Markdown / 4 linked docs</Text>
        </div>
      </header>

      <SourceDiagnostics diagnostics={activeDiagnostics} />

      <section className="erp-dev-capability-metrics" aria-label="台账概览">
        {activeView === VIEW_CAPABILITIES ? (
          <>
            <MetricTile
              icon={<DatabaseOutlined />}
              label="能力总数"
              value={capabilitySummary.total}
              note={`${filteredCapabilities.length} 条匹配当前筛选`}
            />
            <MetricTile
              icon={<BarChartOutlined />}
              label="高成熟度"
              value={capabilitySummary.highMaturity}
              note="L7 及以上"
              tone="success"
            />
            <MetricTile
              icon={<DeploymentUnitOutlined />}
              label="客户试用"
              value={
                capabilitySummary.trialYes + capabilitySummary.trialLimited
              }
              note={`${capabilitySummary.trialYes} 可试用 / ${capabilitySummary.trialLimited} 有限试用`}
              tone="warning"
            />
            <MetricTile
              icon={<WarningOutlined />}
              label="详情未对齐"
              value={capabilitySummary.detailMissing}
              note={`${capabilitySummary.detailMatched} 项已精确对齐`}
              tone="danger"
            />
          </>
        ) : null}
        {activeView === VIEW_DELIVERY ? (
          <>
            <MetricTile
              icon={<DatabaseOutlined />}
              label="交付项"
              value={deliverySummary.total}
              note={`${filteredDeliveryItems.length} 条匹配当前筛选`}
            />
            <MetricTile
              icon={<BarChartOutlined />}
              label="可试用"
              value={deliverySummary.trialReady}
              note="Trial Ready"
              tone="success"
            />
            <MetricTile
              icon={<DeploymentUnitOutlined />}
              label="已交付"
              value={deliverySummary.delivered}
              note={`${deliverySummary.internalReady} 项内部可用`}
              tone="warning"
            />
            <MetricTile
              icon={<WarningOutlined />}
              label="未开始"
              value={deliverySummary.notStarted}
              note="当前不对客户承诺"
              tone="danger"
            />
          </>
        ) : null}
        {activeView === VIEW_DELTA ? (
          <>
            <MetricTile
              icon={<DatabaseOutlined />}
              label="差异项"
              value={deltaSummary.total}
              note={`${filteredDeltaItems.length} 条匹配当前筛选`}
            />
            <MetricTile
              icon={<BarChartOutlined />}
              label="已进内核"
              value={deltaSummary.productCoreYes}
              note="进入产品内核 / Product Core"
              tone="success"
            />
            <MetricTile
              icon={<DeploymentUnitOutlined />}
              label="内核候选"
              value={deltaSummary.productCoreCandidates}
              note="分类包含产品内核 / Product Core"
              tone="warning"
            />
            <MetricTile
              icon={<WarningOutlined />}
              label="延后/禁止"
              value={deltaSummary.deferredOrForbidden}
              note="分类含 Deferred / Forbidden"
              tone="danger"
            />
          </>
        ) : null}
      </section>

      <main className="erp-dev-capability-shell">
        <aside className="erp-dev-capability-sidebar">
          <section className="erp-dev-capability-panel erp-dev-capability-filters">
            <div className="erp-dev-capability-panel__head">
              <Text strong>
                <FilterOutlined /> 筛选
              </Text>
              <Button type="text" size="small" onClick={resetFilters}>
                重置
              </Button>
            </div>
            <Input
              allowClear
              value={keyword}
              placeholder="搜索能力、风险、证据、下一步或客户项"
              onChange={(event) => setKeyword(event.target.value)}
            />
            {activeView === VIEW_CAPABILITIES ? (
              <>
                <label className="erp-dev-capability-filter-field">
                  <span>所属层 / Product Layer</span>
                  <Select
                    value={layer}
                    options={layerOptions}
                    onChange={setLayer}
                    aria-label="按所属层筛选"
                  />
                </label>
                <label className="erp-dev-capability-filter-field">
                  <span>业务域 / Domain</span>
                  <Select
                    value={domain}
                    options={domainOptions}
                    onChange={setDomain}
                    aria-label="按业务域筛选"
                  />
                </label>
                <label className="erp-dev-capability-filter-field">
                  <span>成熟度 / Maturity</span>
                  <Select
                    value={maturity}
                    options={maturityOptions}
                    onChange={setMaturity}
                    aria-label="按成熟度筛选"
                  />
                </label>
              </>
            ) : null}
            {activeView === VIEW_DELIVERY ? (
              <label className="erp-dev-capability-filter-field">
                <span>交付状态 / Delivery Status</span>
                <Select
                  value={deliveryStatus}
                  options={deliveryStatusOptions}
                  onChange={setDeliveryStatus}
                  aria-label="按交付状态筛选"
                />
              </label>
            ) : null}
            {activeView === VIEW_DELTA ? (
              <>
                <label className="erp-dev-capability-filter-field">
                  <span>差异分类 / Delta Category</span>
                  <Select
                    value={deltaCategory}
                    options={deltaCategoryOptions}
                    onChange={setDeltaCategory}
                    aria-label="按差异分类筛选"
                  />
                </label>
                <label className="erp-dev-capability-filter-field">
                  <span>产品内核判断 / Product Core</span>
                  <Select
                    value={deltaCoreDecision}
                    options={deltaCoreDecisionOptions}
                    onChange={setDeltaCoreDecision}
                    aria-label="按 Product Core 判断筛选"
                  />
                </label>
              </>
            ) : null}
          </section>

          <Button block onClick={toggleAnalysis}>
            {showAnalysis ? '收起分布分析' : '查看分布分析'}
          </Button>

          {showAnalysis && activeView === VIEW_CAPABILITIES ? (
            <>
              <DistributionBars
                title="成熟度分布"
                items={capabilitySummary.byMaturity}
                total={capabilitySummary.total}
              />
              <MaturityDefinitions
                items={capabilityResult.maturityDefinitions}
              />
              <DistributionBars
                title="所属层分布"
                items={capabilitySummary.byLayer}
                total={capabilitySummary.total}
                formatLabel={formatDevEnglishAnchor}
              />
            </>
          ) : null}
          {showAnalysis && activeView === VIEW_DELIVERY ? (
            <>
              <DistributionBars
                title="交付状态分布"
                items={deliverySummary.byStatus}
                total={deliverySummary.total}
              />
              <DistributionBars
                title="客户分布"
                items={deliverySummary.byCustomer}
                total={deliverySummary.total}
              />
            </>
          ) : null}
          {showAnalysis && activeView === VIEW_DELTA ? (
            <>
              <DistributionBars
                title="差异分类分布"
                items={deltaSummary.byCategory}
                total={deltaSummary.total}
                formatLabel={formatDevEnglishAnchor}
              />
              <DistributionBars
                title="产品内核判断 / Product Core"
                items={deltaSummary.byCoreDecision}
                total={deltaSummary.total}
              />
            </>
          ) : null}
        </aside>

        <section className="erp-dev-capability-results">
          <div className="erp-dev-capability-results__head">
            <div>
              <Text strong>
                {activeView === VIEW_CAPABILITIES
                  ? '产品能力进度台账'
                  : activeView === VIEW_DELIVERY
                    ? 'yoyoosun 客户交付矩阵'
                    : 'yoyoosun 客户差异台账'}
              </Text>
              <Text type="secondary">
                {activeView === VIEW_CAPABILITIES
                  ? `${filteredCapabilities.length} / ${capabilities.length}`
                  : activeView === VIEW_DELIVERY
                    ? `${filteredDeliveryItems.length} / ${deliveryItems.length}`
                    : `${filteredDeltaItems.length} / ${deltaItems.length}`}
              </Text>
            </div>
            <Text type="secondary">Markdown 派生，只读展示</Text>
          </div>
          {activeView === VIEW_CAPABILITIES ? (
            <CapabilityList
              items={filteredCapabilities}
              selectedKey={selectedCapability?.key}
              onSelect={selectItem}
              emptyDescription={
                activeHasSourceError
                  ? '能力真源解析失败，请先处理上方诊断'
                  : '没有匹配能力，请调整筛选'
              }
            />
          ) : null}
          {activeView === VIEW_DELIVERY ? (
            <DeliveryList
              items={filteredDeliveryItems}
              selectedKey={selectedDelivery?.key}
              onSelect={selectItem}
              emptyDescription={
                activeHasSourceError
                  ? '交付矩阵解析失败，请先处理上方诊断'
                  : '没有匹配交付项，请调整筛选'
              }
            />
          ) : null}
          {activeView === VIEW_DELTA ? (
            <DeltaList
              items={filteredDeltaItems}
              selectedKey={selectedDelta?.key}
              onSelect={selectItem}
              emptyDescription={
                activeHasSourceError
                  ? '差异台账解析失败，请先处理上方诊断'
                  : '没有匹配差异，请调整筛选'
              }
            />
          ) : null}
        </section>

        {activeView === VIEW_CAPABILITIES ? (
          <CapabilityDetail item={selectedCapability} />
        ) : null}
        {activeView === VIEW_DELIVERY ? (
          <DeliveryDetail item={selectedDelivery} />
        ) : null}
        {activeView === VIEW_DELTA ? (
          <DeltaDetail item={selectedDelta} />
        ) : null}
      </main>
    </div>
  )
}
