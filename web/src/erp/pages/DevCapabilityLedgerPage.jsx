import React, { useMemo, useState } from 'react'
import {
  BarChartOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FilterOutlined,
  FundProjectionScreenOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Input,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
  DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
  buildCapabilityLedgerSummary,
  buildCustomerDeltaLedgerSummary,
  buildCustomerDeliveryMatrixSummary,
  filterCapabilityLedgerItems,
  filterCustomerDeltaLedgerItems,
  filterCustomerDeliveryMatrixItems,
  parseCapabilityLedgerMarkdown,
  parseCustomerDeltaLedgerMarkdown,
  parseCustomerDeliveryMatrixMarkdown,
} from '../config/devCapabilityLedger.mjs'

import deltaLedgerSource from '../../../../docs/customers/yoyoosun/delta-ledger.md?raw'
import deliveryMatrixSource from '../../../../docs/customers/yoyoosun/delivery-matrix.md?raw'
import capabilityLedgerSource from '../../../../docs/product/capability-ledger.md?raw'

const { Paragraph, Text, Title } = Typography

const ALL_OPTION = 'all'
const VIEW_CAPABILITIES = 'capabilities'
const VIEW_DELIVERY = 'delivery'
const VIEW_DELTA = 'delta'

const VIEW_OPTIONS = [
  { label: '产品能力', value: VIEW_CAPABILITIES },
  { label: '客户交付', value: VIEW_DELIVERY },
  { label: '客户差异', value: VIEW_DELTA },
]

const SOURCE_PATH_BY_VIEW = {
  [VIEW_CAPABILITIES]: DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  [VIEW_DELIVERY]: DEV_CUSTOMER_DELIVERY_MATRIX_SOURCE_PATH,
  [VIEW_DELTA]: DEV_CUSTOMER_DELTA_LEDGER_SOURCE_PATH,
}

function buildOptions(field, items = []) {
  return [
    { label: '全部', value: ALL_OPTION },
    ...[...new Set(items.map((item) => item[field]).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((value) => ({ label: value, value })),
  ]
}

function buildCapabilityIdOptions(items = []) {
  return [
    { label: '全部能力', value: ALL_OPTION },
    ...[...new Set(items.flatMap((item) => item.capabilityIds || []))]
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
      .map((value) => ({ label: value, value })),
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

function DistributionBars({ title, items = [], total }) {
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
              <span className="erp-dev-capability-bar__label">{item.key}</span>
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

function trialTagFor(item) {
  if (item.trialStatus === 'yes') return <Tag color="green">可试用</Tag>
  if (item.trialStatus === 'limited') return <Tag color="gold">有限试用</Tag>
  return <Tag>不可试用</Tag>
}

function deliveryCommitmentTagFor(item) {
  return item.deliveryStatus === 'yes' ? (
    <Tag color="green">可承诺</Tag>
  ) : (
    <Tag color="red">不可承诺</Tag>
  )
}

function customerDeliveryStatusTag(status) {
  const colorByStatus = {
    'Trial Ready': 'green',
    'Target Released': 'cyan',
    'Delivery Ready': 'green',
    'Local Verified': 'blue',
    'Internal Ready': 'blue',
    'Template Ready': 'cyan',
    'Candidate Ready': 'geekblue',
    'Draft Ready': 'geekblue',
    'Config Draft': 'gold',
    'Post-delivery': 'purple',
    Deferred: 'orange',
    Deprecated: 'red',
    'Not Planned': 'default',
    Blocked: 'red',
  }
  return (
    <Tag color={colorByStatus[status] || 'default'}>{status || '未标记'}</Tag>
  )
}

function productCoreDecisionTag(value) {
  if (value === '是') return <Tag color="green">进 Product Core</Tag>
  if (value === '可能' || value === '待评审') {
    return <Tag color="gold">{value}</Tag>
  }
  if (value === '暂不进入') return <Tag color="orange">暂不进入</Tag>
  return <Tag>{value || '未判断'}</Tag>
}

function maturityClass(item) {
  const level = item.maturityMax ?? 0
  if (level >= 7) return 'erp-dev-capability-maturity--high'
  if (level >= 4) return 'erp-dev-capability-maturity--mid'
  return 'erp-dev-capability-maturity--low'
}

function CapabilityList({ items = [], selectedKey, onSelect }) {
  if (items.length === 0) {
    return (
      <div className="erp-dev-capability-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配能力"
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
          onClick={() => onSelect(item.key)}
        >
          <span className="erp-dev-capability-row__top">
            <span className="erp-dev-capability-row__id">{item.id}</span>
            <span
              className={`erp-dev-capability-maturity ${maturityClass(item)}`}
            >
              {item.maturityLabel || '未标级'}
            </span>
          </span>
          <span className="erp-dev-capability-row__title">{item.name}</span>
          <span className="erp-dev-capability-row__meta">
            <span>{item.layer}</span>
            <span>{item.domain}</span>
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

function DeliveryList({ items = [], selectedKey, onSelect }) {
  if (items.length === 0) {
    return (
      <div className="erp-dev-capability-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配交付项"
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
          onClick={() => onSelect(item.key)}
        >
          <span className="erp-dev-capability-row__top">
            <span className="erp-dev-capability-row__id">
              {item.capabilityIds.join(' / ') || '无 CAP ID'}
            </span>
            {customerDeliveryStatusTag(item.customerDeliveryStatus)}
          </span>
          <span className="erp-dev-capability-row__title">
            {item.moduleName}
          </span>
          <span className="erp-dev-capability-row__meta">
            <span>{item.customerKey}</span>
            <span>{item.visibleMethod}</span>
          </span>
          <span className="erp-dev-capability-row__tags">
            {item.capabilityIds.slice(0, 4).map((id) => (
              <Tag key={id}>{id}</Tag>
            ))}
          </span>
        </button>
      ))}
    </div>
  )
}

function DeltaList({ items = [], selectedKey, onSelect }) {
  if (items.length === 0) {
    return (
      <div className="erp-dev-capability-empty">
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="没有匹配差异"
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
          onClick={() => onSelect(item.key)}
        >
          <span className="erp-dev-capability-row__top">
            <span className="erp-dev-capability-row__id">{item.id}</span>
            {productCoreDecisionTag(item.productCoreDecision)}
          </span>
          <span className="erp-dev-capability-row__title">{item.demand}</span>
          <span className="erp-dev-capability-row__meta">
            <span>{item.category}</span>
            <span>{item.source}</span>
          </span>
          <span className="erp-dev-capability-row__tags">
            {item.capabilityIds.map((id) => (
              <Tag key={id}>{id}</Tag>
            ))}
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

function RelationList({ items = [], renderItem }) {
  if (items.length === 0) {
    return (
      <Text type="secondary" className="erp-dev-capability-relation-empty">
        没有显式关联记录
      </Text>
    )
  }

  return (
    <div className="erp-dev-capability-relation-list">
      {items.slice(0, 6).map((item) => (
        <div className="erp-dev-capability-relation" key={item.key}>
          {renderItem(item)}
        </div>
      ))}
    </div>
  )
}

function CapabilityDetail({
  item,
  deliveryRelations = [],
  deltaRelations = [],
}) {
  if (!item) {
    return (
      <section className="erp-dev-capability-detail">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择能力" />
      </section>
    )
  }

  return (
    <section className="erp-dev-capability-detail">
      <div className="erp-dev-capability-detail__head">
        <Space align="center" size={8} wrap>
          <Tag color="green">{item.id}</Tag>
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
          {item.layer} / {item.domain}
        </Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        <DetailBlock title="yoyoosun 交付关联">
          <RelationList
            items={deliveryRelations}
            renderItem={(deliveryItem) => (
              <>
                <span className="erp-dev-capability-relation__title">
                  {deliveryItem.moduleName}
                </span>
                <span className="erp-dev-capability-relation__meta">
                  {deliveryItem.customerDeliveryStatus} /{' '}
                  {deliveryItem.visibleMethod || '未填写可见方式'}
                </span>
              </>
            )}
          />
        </DetailBlock>
        <DetailBlock title="yoyoosun 差异关联">
          <RelationList
            items={deltaRelations}
            renderItem={(deltaItem) => (
              <>
                <span className="erp-dev-capability-relation__title">
                  {deltaItem.id} · {deltaItem.demand}
                </span>
                <span className="erp-dev-capability-relation__meta">
                  {deltaItem.category} / {deltaItem.productCoreDecision}
                </span>
              </>
            )}
          />
        </DetailBlock>
        <DetailBlock title="当前结果">{item.currentResult}</DetailBlock>
        <DetailBlock title="当前不包含">{item.notIncluded}</DetailBlock>
        <DetailBlock title="证据">{item.evidence}</DetailBlock>
        <DetailBlock title="下一步">{item.nextStep}</DetailBlock>
        <DetailBlock title="风险">{item.risk}</DetailBlock>
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
          description="请选择交付项"
        />
      </section>
    )
  }

  return (
    <section className="erp-dev-capability-detail">
      <div className="erp-dev-capability-detail__head">
        <Space align="center" size={8} wrap>
          {customerDeliveryStatusTag(item.customerDeliveryStatus)}
          {item.capabilityIds.map((id) => (
            <Tag key={id}>{id}</Tag>
          ))}
        </Space>
        <Title level={4} className="erp-dev-capability-detail__title">
          {item.moduleName}
        </Title>
        <Text type="secondary">{item.customerKey}</Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        <DetailBlock title="当前客户可见方式">{item.visibleMethod}</DetailBlock>
        <DetailBlock title="交付结果">{item.deliveryResult}</DetailBlock>
        <DetailBlock title="不包含">{item.notIncluded}</DetailBlock>
        <DetailBlock title="前置条件">{item.prerequisites}</DetailBlock>
        <DetailBlock title="客户确认项">
          {item.customerConfirmation}
        </DetailBlock>
        <DetailBlock title="风险">{item.risk}</DetailBlock>
      </div>
    </section>
  )
}

function DeltaDetail({ item }) {
  if (!item) {
    return (
      <section className="erp-dev-capability-detail">
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="请选择差异" />
      </section>
    )
  }

  return (
    <section className="erp-dev-capability-detail">
      <div className="erp-dev-capability-detail__head">
        <Space align="center" size={8} wrap>
          <Tag color="blue">{item.id}</Tag>
          {productCoreDecisionTag(item.productCoreDecision)}
          {item.capabilityIds.map((id) => (
            <Tag key={id}>{id}</Tag>
          ))}
        </Space>
        <Title level={4} className="erp-dev-capability-detail__title">
          {item.demand}
        </Title>
        <Text type="secondary">
          {item.customerKey} / {item.category}
        </Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        <DetailBlock title="来源">{item.source}</DetailBlock>
        <DetailBlock title="当前判断">{item.judgement}</DetailBlock>
        <DetailBlock title="处理方式">{item.handling}</DetailBlock>
        <DetailBlock title="前置条件">{item.prerequisites}</DetailBlock>
        <DetailBlock title="风险">{item.risk}</DetailBlock>
        <DetailBlock title="下一步">{item.nextStep}</DetailBlock>
      </div>
    </section>
  )
}

export default function DevCapabilityLedgerPage() {
  const capabilities = useMemo(
    () => parseCapabilityLedgerMarkdown(capabilityLedgerSource),
    []
  )
  const deliveryItems = useMemo(
    () => parseCustomerDeliveryMatrixMarkdown(deliveryMatrixSource),
    []
  )
  const deltaItems = useMemo(
    () => parseCustomerDeltaLedgerMarkdown(deltaLedgerSource),
    []
  )
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
  const [activeView, setActiveView] = useState(VIEW_CAPABILITIES)
  const [keyword, setKeyword] = useState('')
  const [layer, setLayer] = useState(ALL_OPTION)
  const [domain, setDomain] = useState(ALL_OPTION)
  const [maturity, setMaturity] = useState(ALL_OPTION)
  const [deliveryStatus, setDeliveryStatus] = useState(ALL_OPTION)
  const [deliveryCapabilityId, setDeliveryCapabilityId] = useState(ALL_OPTION)
  const [deltaCategory, setDeltaCategory] = useState(ALL_OPTION)
  const [deltaCoreDecision, setDeltaCoreDecision] = useState(ALL_OPTION)
  const [selectedCapabilityKey, setSelectedCapabilityKey] = useState(
    capabilities[0]?.key || ''
  )
  const [selectedDeliveryKey, setSelectedDeliveryKey] = useState(
    deliveryItems[0]?.key || ''
  )
  const [selectedDeltaKey, setSelectedDeltaKey] = useState(
    deltaItems[0]?.key || ''
  )

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
        capabilityId: deliveryCapabilityId,
      }),
    [deliveryCapabilityId, deliveryItems, deliveryStatus, keyword]
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

  const selectedCapability =
    filteredCapabilities.find((item) => item.key === selectedCapabilityKey) ||
    filteredCapabilities[0] ||
    capabilities.find((item) => item.key === selectedCapabilityKey) ||
    capabilities[0]
  const selectedDelivery =
    filteredDeliveryItems.find((item) => item.key === selectedDeliveryKey) ||
    filteredDeliveryItems[0] ||
    deliveryItems.find((item) => item.key === selectedDeliveryKey) ||
    deliveryItems[0]
  const selectedDelta =
    filteredDeltaItems.find((item) => item.key === selectedDeltaKey) ||
    filteredDeltaItems[0] ||
    deltaItems.find((item) => item.key === selectedDeltaKey) ||
    deltaItems[0]

  const selectedCapabilityDeliveryRelations = useMemo(() => {
    if (!selectedCapability?.id) return []
    return deliveryItems.filter((item) =>
      item.capabilityIds.includes(selectedCapability.id)
    )
  }, [deliveryItems, selectedCapability])
  const selectedCapabilityDeltaRelations = useMemo(() => {
    if (!selectedCapability?.id) return []
    return deltaItems.filter((item) =>
      item.capabilityIds.includes(selectedCapability.id)
    )
  }, [deltaItems, selectedCapability])

  const layerOptions = useMemo(
    () => buildOptions('layer', capabilities),
    [capabilities]
  )
  const domainOptions = useMemo(
    () => buildOptions('domain', capabilities),
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
  const deliveryCapabilityOptions = useMemo(
    () => buildCapabilityIdOptions(deliveryItems),
    [deliveryItems]
  )
  const deltaCategoryOptions = useMemo(
    () => buildOptions('category', deltaItems),
    [deltaItems]
  )
  const deltaCoreDecisionOptions = useMemo(
    () => buildOptions('productCoreDecision', deltaItems),
    [deltaItems]
  )

  const resetFilters = () => {
    setKeyword('')
    setLayer(ALL_OPTION)
    setDomain(ALL_OPTION)
    setMaturity(ALL_OPTION)
    setDeliveryStatus(ALL_OPTION)
    setDeliveryCapabilityId(ALL_OPTION)
    setDeltaCategory(ALL_OPTION)
    setDeltaCoreDecision(ALL_OPTION)
  }

  return (
    <div className="erp-dev-capability-page">
      <header className="erp-dev-capability-header">
        <div className="erp-dev-capability-header__copy">
          <Space align="center" size={10} wrap>
            <FundProjectionScreenOutlined className="erp-dev-capability-header__icon" />
            <Title level={3} className="erp-dev-capability-title">
              能力台账可视化
            </Title>
            <Tag color="green">DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-capability-summary">
            只读解析产品能力台账、yoyoosun 客户交付矩阵和客户差异台账；不进入
            ERP 菜单、权限、后端业务 API 或产品文档 registry。
          </Paragraph>
          <Segmented
            className="erp-dev-capability-view-switch"
            value={activeView}
            options={VIEW_OPTIONS}
            onChange={setActiveView}
          />
        </div>
        <div className="erp-dev-capability-source">
          <Text type="secondary">当前视图真源</Text>
          <Text strong>{SOURCE_PATH_BY_VIEW[activeView]}</Text>
          <Text type="secondary">联动读取 3 份 Markdown</Text>
        </div>
      </header>

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
              label="不可承诺"
              value={capabilitySummary.noCommitment}
              note={`${capabilitySummary.deliveryYes} 项可交付承诺`}
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
              label="目标已发布"
              value={deliverySummary.targetReleased}
              note="Target Released / Delivery Ready"
              tone="warning"
            />
            <MetricTile
              icon={<WarningOutlined />}
              label="阻塞或延后"
              value={deliverySummary.blockedOrDeferred}
              note={`${deliverySummary.linkedCapabilities} 项显式关联 CAP`}
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
              note="是否进入 Product Core = 是"
              tone="success"
            />
            <MetricTile
              icon={<DeploymentUnitOutlined />}
              label="内核候选"
              value={deltaSummary.productCoreCandidates}
              note="分类含 Product Core"
              tone="warning"
            />
            <MetricTile
              icon={<WarningOutlined />}
              label="延后/禁止"
              value={deltaSummary.deferredOrForbidden}
              note={`${deltaSummary.linkedCapabilities} 项显式关联 CAP`}
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
                <Select
                  value={layer}
                  options={layerOptions}
                  onChange={setLayer}
                  aria-label="按所属层筛选"
                />
                <Select
                  value={domain}
                  options={domainOptions}
                  onChange={setDomain}
                  aria-label="按业务域筛选"
                />
                <Select
                  value={maturity}
                  options={maturityOptions}
                  onChange={setMaturity}
                  aria-label="按成熟度筛选"
                />
              </>
            ) : null}
            {activeView === VIEW_DELIVERY ? (
              <>
                <Select
                  value={deliveryStatus}
                  options={deliveryStatusOptions}
                  onChange={setDeliveryStatus}
                  aria-label="按交付状态筛选"
                />
                <Select
                  value={deliveryCapabilityId}
                  options={deliveryCapabilityOptions}
                  onChange={setDeliveryCapabilityId}
                  aria-label="按产品能力 ID 筛选"
                />
              </>
            ) : null}
            {activeView === VIEW_DELTA ? (
              <>
                <Select
                  value={deltaCategory}
                  options={deltaCategoryOptions}
                  onChange={setDeltaCategory}
                  aria-label="按差异分类筛选"
                />
                <Select
                  value={deltaCoreDecision}
                  options={deltaCoreDecisionOptions}
                  onChange={setDeltaCoreDecision}
                  aria-label="按 Product Core 判断筛选"
                />
              </>
            ) : null}
          </section>

          {activeView === VIEW_CAPABILITIES ? (
            <>
              <DistributionBars
                title="成熟度分布"
                items={capabilitySummary.byMaturity}
                total={capabilitySummary.total}
              />
              <DistributionBars
                title="所属层分布"
                items={capabilitySummary.byLayer}
                total={capabilitySummary.total}
              />
            </>
          ) : null}
          {activeView === VIEW_DELIVERY ? (
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
          {activeView === VIEW_DELTA ? (
            <>
              <DistributionBars
                title="差异分类分布"
                items={deltaSummary.byCategory}
                total={deltaSummary.total}
              />
              <DistributionBars
                title="Product Core 判断"
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
              onSelect={setSelectedCapabilityKey}
            />
          ) : null}
          {activeView === VIEW_DELIVERY ? (
            <DeliveryList
              items={filteredDeliveryItems}
              selectedKey={selectedDelivery?.key}
              onSelect={setSelectedDeliveryKey}
            />
          ) : null}
          {activeView === VIEW_DELTA ? (
            <DeltaList
              items={filteredDeltaItems}
              selectedKey={selectedDelta?.key}
              onSelect={setSelectedDeltaKey}
            />
          ) : null}
        </section>

        {activeView === VIEW_CAPABILITIES ? (
          <CapabilityDetail
            item={selectedCapability}
            deliveryRelations={selectedCapabilityDeliveryRelations}
            deltaRelations={selectedCapabilityDeltaRelations}
          />
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
