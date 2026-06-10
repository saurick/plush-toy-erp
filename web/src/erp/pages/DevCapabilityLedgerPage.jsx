import React, { useMemo, useState } from 'react'
import {
  BarChartOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  FilterOutlined,
  FundProjectionScreenOutlined,
  WarningOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Select, Space, Tag, Typography } from 'antd'
import {
  DEV_CAPABILITY_LEDGER_SOURCE_PATH,
  buildCapabilityLedgerSummary,
  filterCapabilityLedgerItems,
  parseCapabilityLedgerMarkdown,
} from '../config/devCapabilityLedger.mjs'

import capabilityLedgerSource from '../../../../docs/product/product-delivery-ledgers.md?raw'

const { Paragraph, Text, Title } = Typography

const ALL_OPTION = 'all'

function buildOptions(field, items = []) {
  return [
    { label: '全部', value: ALL_OPTION },
    ...[...new Set(items.map((item) => item[field]).filter(Boolean))]
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

function deliveryTagFor(item) {
  return item.deliveryStatus === 'yes' ? (
    <Tag color="green">可承诺</Tag>
  ) : (
    <Tag color="red">不可承诺</Tag>
  )
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
            {deliveryTagFor(item)}
          </span>
        </button>
      ))}
    </div>
  )
}

function DetailBlock({ title, children }) {
  return (
    <div className="erp-dev-capability-detail__block">
      <Text strong>{title}</Text>
      <Paragraph>{children || '未填写'}</Paragraph>
    </div>
  )
}

function CapabilityDetail({ item }) {
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
          {deliveryTagFor(item)}
        </Space>
        <Title level={4} className="erp-dev-capability-detail__title">
          {item.name}
        </Title>
        <Text type="secondary">
          {item.layer} / {item.domain}
        </Text>
      </div>

      <div className="erp-dev-capability-detail__grid">
        <DetailBlock title="当前结果">{item.currentResult}</DetailBlock>
        <DetailBlock title="当前不包含">{item.notIncluded}</DetailBlock>
        <DetailBlock title="证据">{item.evidence}</DetailBlock>
        <DetailBlock title="下一步">{item.nextStep}</DetailBlock>
        <DetailBlock title="风险">{item.risk}</DetailBlock>
      </div>
    </section>
  )
}

export default function DevCapabilityLedgerPage() {
  const capabilities = useMemo(
    () => parseCapabilityLedgerMarkdown(capabilityLedgerSource),
    []
  )
  const summary = useMemo(
    () => buildCapabilityLedgerSummary(capabilities),
    [capabilities]
  )
  const [keyword, setKeyword] = useState('')
  const [layer, setLayer] = useState(ALL_OPTION)
  const [domain, setDomain] = useState(ALL_OPTION)
  const [maturity, setMaturity] = useState(ALL_OPTION)
  const [selectedKey, setSelectedKey] = useState(capabilities[0]?.key || '')

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

  const selectedCapability =
    filteredCapabilities.find((item) => item.key === selectedKey) ||
    filteredCapabilities[0] ||
    capabilities.find((item) => item.key === selectedKey) ||
    capabilities[0]

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

  const resetFilters = () => {
    setKeyword('')
    setLayer(ALL_OPTION)
    setDomain(ALL_OPTION)
    setMaturity(ALL_OPTION)
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
            只读解析 {DEV_CAPABILITY_LEDGER_SOURCE_PATH}{' '}
            的产品能力进度台账；不进入 ERP 菜单、权限、后端业务 API 或产品文档
            registry。
          </Paragraph>
        </div>
        <div className="erp-dev-capability-source">
          <Text type="secondary">当前真源</Text>
          <Text strong>{DEV_CAPABILITY_LEDGER_SOURCE_PATH}</Text>
        </div>
      </header>

      <section className="erp-dev-capability-metrics" aria-label="能力概览">
        <MetricTile
          icon={<DatabaseOutlined />}
          label="能力总数"
          value={summary.total}
          note={`${filteredCapabilities.length} 条匹配当前筛选`}
        />
        <MetricTile
          icon={<BarChartOutlined />}
          label="高成熟度"
          value={summary.highMaturity}
          note="L7 及以上"
          tone="success"
        />
        <MetricTile
          icon={<DeploymentUnitOutlined />}
          label="客户试用"
          value={summary.trialYes + summary.trialLimited}
          note={`${summary.trialYes} 可试用 / ${summary.trialLimited} 有限试用`}
          tone="warning"
        />
        <MetricTile
          icon={<WarningOutlined />}
          label="不可承诺"
          value={summary.noCommitment}
          note={`${summary.deliveryYes} 项可交付承诺`}
          tone="danger"
        />
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
              placeholder="搜索能力、风险、证据或下一步"
              onChange={(event) => setKeyword(event.target.value)}
            />
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
          </section>

          <DistributionBars
            title="成熟度分布"
            items={summary.byMaturity}
            total={summary.total}
          />
          <DistributionBars
            title="所属层分布"
            items={summary.byLayer}
            total={summary.total}
          />
        </aside>

        <section className="erp-dev-capability-results">
          <div className="erp-dev-capability-results__head">
            <div>
              <Text strong>产品能力进度台账</Text>
              <Text type="secondary">
                {filteredCapabilities.length} / {capabilities.length}
              </Text>
            </div>
            <Text type="secondary">Markdown 派生，只读展示</Text>
          </div>
          <CapabilityList
            items={filteredCapabilities}
            selectedKey={selectedCapability?.key}
            onSelect={setSelectedKey}
          />
        </section>

        <CapabilityDetail item={selectedCapability} />
      </main>
    </div>
  )
}
