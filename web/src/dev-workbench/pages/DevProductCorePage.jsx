import React, { useEffect, useMemo } from 'react'
import {
  AppstoreOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  MinusCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { Alert, Button, Empty, Tag, Typography } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_PRODUCT_CORE_MEMBERSHIP_ALL,
  DEV_PRODUCT_CORE_MEMBERSHIP_ORDER,
  DEV_PRODUCT_CORE_SOURCE_PATH,
  buildProductCoreSummary,
  filterProductCoreCapabilities,
  normalizeProductCoreMembership,
  parseProductCoreCapabilities,
  parseProductCoreEvidenceEntries,
  parseProductCoreStatusDefinitions,
} from '../config/devProductCore.mjs'
import '../styles/dev-product-core.css'

const { Paragraph, Text, Title } = Typography

const productCoreSource = import.meta.glob(
  '../../../../docs/product/产品能力进度台账.md',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

const STATUS_COLOR_BY_MEMBERSHIP = Object.freeze({
  entered: 'success',
  partial: 'warning',
  pending: 'blue',
  excluded: 'default',
  unknown: 'error',
})

const STATUS_ICON_BY_MEMBERSHIP = Object.freeze({
  entered: <CheckCircleOutlined aria-hidden="true" />,
  partial: <ClockCircleOutlined aria-hidden="true" />,
  pending: <MinusCircleOutlined aria-hidden="true" />,
  excluded: <StopOutlined aria-hidden="true" />,
})

function getProductCoreSource() {
  return (
    productCoreSource['../../../../docs/product/产品能力进度台账.md'] ||
    Object.values(productCoreSource)[0] ||
    ''
  )
}

function CapabilityItem({ item }) {
  return (
    <li
      className={`erp-dev-product-core-capability erp-dev-product-core-capability--${item.membershipKey}`}
    >
      <div className="erp-dev-product-core-capability__identity">
        <span
          className="erp-dev-product-core-capability__index"
          aria-hidden="true"
        >
          {String(item.index).padStart(2, '0')}
        </span>
        <div>
          <Title level={2}>{item.capability}</Title>
          <div className="erp-dev-product-core-capability__status">
            <Tag color={STATUS_COLOR_BY_MEMBERSHIP[item.membershipKey]}>
              {item.membership}
            </Tag>
            <Text type="secondary">台账状态：{item.status}</Text>
          </div>
        </div>
      </div>
      <div className="erp-dev-product-core-capability__section">
        <Text className="erp-dev-product-core-capability__label">
          当前可用范围
        </Text>
        <Paragraph>{item.availableScope}</Paragraph>
      </div>
      <div className="erp-dev-product-core-capability__section erp-dev-product-core-capability__section--boundary">
        <Text className="erp-dev-product-core-capability__label">
          主要边界 / 下一步
        </Text>
        <Paragraph>{item.boundary}</Paragraph>
      </div>
    </li>
  )
}

function EvidenceEntry({ item }) {
  return (
    <article className="erp-dev-product-core-evidence__item">
      <div>
        <Text strong>{item.label}</Text>
        {item.description ? <Paragraph>{item.description}</Paragraph> : null}
      </div>
      {item.links.length > 0 ? (
        <div className="erp-dev-product-core-evidence__links">
          {item.links.map((link) => (
            <Link
              key={link.path}
              to={link.devDocsHref}
              target="_blank"
              rel="noreferrer"
            >
              <FileTextOutlined aria-hidden="true" />
              <span>{link.label}</span>
            </Link>
          ))}
        </div>
      ) : (
        <Text type="secondary" className="erp-dev-product-core-evidence__note">
          该项需要到对应客户受控资料和目标环境证据中核对。
        </Text>
      )}
    </article>
  )
}

export default function DevProductCorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const source = useMemo(() => getProductCoreSource(), [])
  const capabilities = useMemo(
    () => parseProductCoreCapabilities(source),
    [source]
  )
  const statusDefinitions = useMemo(
    () => parseProductCoreStatusDefinitions(source),
    [source]
  )
  const evidenceEntries = useMemo(
    () => parseProductCoreEvidenceEntries(source),
    [source]
  )
  const summary = useMemo(
    () => buildProductCoreSummary(capabilities),
    [capabilities]
  )
  const requestedMembership = searchParams.get('status') || ''
  const membership = normalizeProductCoreMembership(requestedMembership)
  const keyword = searchParams.get('q') || ''
  const filteredCapabilities = useMemo(
    () => filterProductCoreCapabilities(capabilities, { membership, keyword }),
    [capabilities, keyword, membership]
  )
  const definitionByMembership = useMemo(
    () => new Map(statusDefinitions.map((item) => [item.key, item])),
    [statusDefinitions]
  )
  const filterOptions = useMemo(
    () => [
      {
        key: DEV_PRODUCT_CORE_MEMBERSHIP_ALL,
        label: '全部能力',
        description: '完整查看当前台账',
        count: summary.total,
        icon: <AppstoreOutlined aria-hidden="true" />,
      },
      ...DEV_PRODUCT_CORE_MEMBERSHIP_ORDER.map((key) => {
        const definition = definitionByMembership.get(key)
        return {
          key,
          label: definition?.membership || '状态待核对',
          description: definition?.shortDescription || '台账状态需要重新核对',
          count: summary.counts[key] || 0,
          icon: STATUS_ICON_BY_MEMBERSHIP[key],
        }
      }),
    ],
    [definitionByMembership, summary.counts, summary.total]
  )

  useEffect(() => {
    if (!requestedMembership || requestedMembership === membership) return
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('status')
    setSearchParams(nextParams, { replace: true })
  }, [membership, requestedMembership, searchParams, setSearchParams])

  const handleMembershipChange = (nextMembership) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextMembership === DEV_PRODUCT_CORE_MEMBERSHIP_ALL) {
      nextParams.delete('status')
    } else {
      nextParams.set('status', nextMembership)
    }
    setSearchParams(nextParams)
  }

  const handleKeywordChange = (event) => {
    const nextKeyword = event.target.value
    const nextParams = new URLSearchParams(searchParams)
    if (nextKeyword.trim()) {
      nextParams.set('q', nextKeyword)
    } else {
      nextParams.delete('q')
    }
    setSearchParams(nextParams, { replace: true })
  }

  const handleReset = () => {
    setSearchParams(new URLSearchParams())
  }

  const hasActiveFilter =
    membership !== DEV_PRODUCT_CORE_MEMBERSHIP_ALL || Boolean(keyword.trim())

  return (
    <div className="erp-dev-product-core-page erp-dev-workspace-page">
      <DevPageNav sourcePath={DEV_PRODUCT_CORE_SOURCE_PATH} />

      <header className="erp-dev-product-core-header">
        <div className="erp-dev-product-core-header__copy">
          <span
            className="erp-dev-product-core-header__icon"
            aria-hidden="true"
          >
            <AppstoreOutlined />
          </span>
          <div>
            <Text className="erp-dev-product-core-eyebrow">
              当前产品能力事实 · 只读
            </Text>
            <Title level={1}>产品内核 / Product Core</Title>
            <Paragraph>
              完整查看哪些能力已经进入产品内核、哪些只完成了一部分，以及当前明确不在内核中的范围。
            </Paragraph>
          </div>
        </div>
        <div
          className="erp-dev-product-core-header__summary"
          aria-label="产品内核汇总"
        >
          <strong>{summary.counts.entered || 0}</strong>
          <span>项已进入内核</span>
          <small>
            另有 {summary.counts.partial || 0} 项部分进入 · 共 {summary.total}{' '}
            项
          </small>
        </div>
      </header>

      <main className="erp-dev-product-core-shell">
        {capabilities.length === 0 ? (
          <Alert
            type="error"
            showIcon
            message="暂时无法读取产品能力台账"
            description="页面没有解析到能力状态。请打开唯一来源核对 Markdown 表格结构，不要在页面里补造状态。"
            action={
              <Button
                href={`/__dev/docs?path=${encodeURIComponent(
                  DEV_PRODUCT_CORE_SOURCE_PATH
                )}`}
              >
                打开来源
              </Button>
            }
          />
        ) : (
          <>
            <section
              className="erp-dev-product-core-overview"
              aria-labelledby="product-core-overview-title"
            >
              <div className="erp-dev-product-core-overview__head">
                <div>
                  <Text className="erp-dev-product-core-eyebrow">先看归属</Text>
                  <Title level={2} id="product-core-overview-title">
                    当前哪些能力进入了产品内核？
                  </Title>
                </div>
                <Text type="secondary">
                  默认显示全部；筛选只改变查阅范围，不改变台账状态。
                </Text>
              </div>

              <div
                className="erp-dev-product-core-filters"
                role="group"
                aria-label="按产品内核归属筛选"
              >
                {filterOptions.map((option) => {
                  const isActive = membership === option.key
                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`erp-dev-product-core-filter${
                        isActive ? ' erp-dev-product-core-filter--active' : ''
                      }`}
                      aria-pressed={isActive}
                      onClick={() => handleMembershipChange(option.key)}
                    >
                      <span className="erp-dev-product-core-filter__icon">
                        {option.icon}
                      </span>
                      <span className="erp-dev-product-core-filter__copy">
                        <span>
                          <strong>{option.count}</strong>
                          <span>{option.label}</span>
                        </span>
                        <small>{option.description}</small>
                      </span>
                    </button>
                  )
                })}
              </div>

              <details className="erp-dev-product-core-status-help">
                <summary>状态是怎么换算成“进入内核”的？</summary>
                <div>
                  {statusDefinitions.map((definition) => (
                    <article key={definition.key}>
                      <Tag color={STATUS_COLOR_BY_MEMBERSHIP[definition.key]}>
                        {definition.membership}
                      </Tag>
                      <Text strong>{definition.status}</Text>
                      <Paragraph>{definition.meaning}</Paragraph>
                    </article>
                  ))}
                </div>
              </details>
            </section>

            <section
              className="erp-dev-product-core-inventory"
              aria-labelledby="product-core-inventory-title"
            >
              <div className="erp-dev-product-core-toolbar">
                <div>
                  <Title level={2} id="product-core-inventory-title">
                    产品能力清单
                  </Title>
                  <Text type="secondary">
                    当前显示 {filteredCapabilities.length} / {summary.total} 项
                  </Text>
                </div>
                <div className="erp-dev-product-core-toolbar__actions">
                  <SearchInput
                    allowClear
                    aria-label="搜索产品内核能力"
                    placeholder="搜索能力、可用范围或边界"
                    searchHint="可搜索能力名称、当前可用范围、状态和主要边界"
                    value={keyword}
                    onChange={handleKeywordChange}
                  />
                  {hasActiveFilter ? (
                    <Button onClick={handleReset}>清除筛选</Button>
                  ) : null}
                </div>
              </div>

              {filteredCapabilities.length > 0 ? (
                <ol
                  className="erp-dev-product-core-capabilities"
                  aria-label="产品内核能力列表"
                >
                  {filteredCapabilities.map((item) => (
                    <CapabilityItem key={item.key} item={item} />
                  ))}
                </ol>
              ) : (
                <div className="erp-dev-product-core-empty">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="没有匹配的产品能力"
                  >
                    <Button onClick={handleReset}>查看全部能力</Button>
                  </Empty>
                </div>
              )}
            </section>

            <section
              className="erp-dev-product-core-evidence"
              aria-labelledby="product-core-evidence-title"
            >
              <div className="erp-dev-product-core-evidence__head">
                <div>
                  <Text className="erp-dev-product-core-eyebrow">
                    需要继续核对时
                  </Text>
                  <Title level={2} id="product-core-evidence-title">
                    正式证据入口
                  </Title>
                </div>
                <Text type="secondary">
                  本页不复制领域合同；字段、状态和实现细节继续回到正式真源。
                </Text>
              </div>
              <div className="erp-dev-product-core-evidence__list">
                {evidenceEntries.map((item) => (
                  <EvidenceEntry key={item.key} item={item} />
                ))}
              </div>
            </section>

            <Alert
              className="erp-dev-product-core-boundary"
              type="info"
              showIcon
              message="进入 Product Core 不等于已发布或已验收"
              description={summary.boundary}
            />
          </>
        )}
      </main>
    </div>
  )
}
