import React, { useEffect, useMemo } from 'react'
import { AppstoreOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Tag, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_PRODUCT_CORE_DOCS_HREF,
  DEV_PRODUCT_CORE_MEMBERSHIP_ALL,
  DEV_PRODUCT_CORE_MEMBERSHIP_ORDER,
  DEV_PRODUCT_CORE_SOURCE_PATH,
  DEV_PRODUCT_CORE_STATUS_PRESENTATION,
  buildProductCoreSummary,
  filterProductCoreCapabilities,
  normalizeProductCoreMembership,
  parseProductCoreCapabilities,
} from '../config/devProductCore.mjs'
import '../styles/dev-product-core.css'

const { Paragraph, Text, Title } = Typography

const STATUS_COLOR_BY_MEMBERSHIP = Object.freeze({
  entered: 'success',
  partial: 'warning',
  pending: 'blue',
  excluded: 'default',
  unknown: 'error',
})

const MEMBERSHIP_PRESENTATION = Object.freeze(
  Object.fromEntries(
    Object.values(DEV_PRODUCT_CORE_STATUS_PRESENTATION).map((item) => [
      item.key,
      item,
    ])
  )
)

const productCoreSource = import.meta.glob(
  '../../../../docs/product/产品能力进度台账.md',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

function getProductCoreSource() {
  return (
    productCoreSource['../../../../docs/product/产品能力进度台账.md'] ||
    Object.values(productCoreSource)[0] ||
    ''
  )
}

function CapabilityRow({ item }) {
  return (
    <tr data-membership={item.membershipKey}>
      <td data-label="业务能力">
        <strong>{item.capability}</strong>
      </td>
      <td data-label="状态">
        <div className="erp-dev-product-core-status">
          <Tag color={STATUS_COLOR_BY_MEMBERSHIP[item.membershipKey]}>
            {item.membership}
          </Tag>
          <small>台账：{item.status}</small>
        </div>
      </td>
      <td data-label="当前可用范围">{item.availableScope}</td>
      <td data-label="主要边界 / 下一步">{item.boundary}</td>
    </tr>
  )
}

export default function DevProductCorePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const source = useMemo(() => getProductCoreSource(), [])
  const capabilities = useMemo(
    () => parseProductCoreCapabilities(source),
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
  const filterOptions = useMemo(
    () => [
      {
        key: DEV_PRODUCT_CORE_MEMBERSHIP_ALL,
        label: '全部能力',
        count: summary.total,
      },
      ...DEV_PRODUCT_CORE_MEMBERSHIP_ORDER.map((key) => ({
        key,
        label: MEMBERSHIP_PRESENTATION[key]?.membership || '状态待核对',
        count: summary.counts[key] || 0,
      })),
    ],
    [summary.counts, summary.total]
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
              一张表查看哪些能力已进入内核、哪些仍在补齐，以及每项当前最重要的边界。
            </Paragraph>
          </div>
        </div>

        <div className="erp-dev-product-core-header__actions">
          <div
            className="erp-dev-product-core-header__summary"
            aria-label="产品内核汇总"
          >
            <strong>
              {summary.counts.entered || 0}/{summary.total}
            </strong>
            <span>项已进入内核</span>
          </div>
          <Button icon={<FileTextOutlined />} href={DEV_PRODUCT_CORE_DOCS_HREF}>
            打开唯一台账
          </Button>
        </div>
      </header>

      <main className="erp-dev-product-core-shell">
        {capabilities.length === 0 ? (
          <Alert
            type="error"
            showIcon
            message="暂时无法读取产品能力台账"
            description="页面没有解析到能力状态。请打开唯一台账核对 Markdown 表格结构，不要在页面里补造状态。"
            action={
              <Button href={DEV_PRODUCT_CORE_DOCS_HREF}>打开唯一台账</Button>
            }
          />
        ) : (
          <section
            className="erp-dev-product-core-inventory"
            aria-labelledby="product-core-inventory-title"
          >
            <div className="erp-dev-product-core-toolbar">
              <div>
                <Title level={2} id="product-core-inventory-title">
                  能力清单
                </Title>
                <Text type="secondary" aria-live="polite">
                  当前显示 {filteredCapabilities.length} / {summary.total} 项
                </Text>
              </div>
              <div className="erp-dev-product-core-toolbar__actions">
                <SearchInput
                  allowClear
                  aria-label="搜索产品内核能力"
                  placeholder="搜索能力、范围或边界"
                  searchHint="可搜索能力名称、当前可用范围、状态和主要边界"
                  value={keyword}
                  onChange={handleKeywordChange}
                />
                {hasActiveFilter ? (
                  <Button onClick={handleReset}>清除筛选</Button>
                ) : null}
              </div>
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
                    <strong>{option.count}</strong>
                    <span>{option.label}</span>
                  </button>
                )
              })}
            </div>

            {filteredCapabilities.length > 0 ? (
              <div className="erp-dev-product-core-table-wrap">
                <table className="erp-dev-product-core-table">
                  <caption>当前 Product Core 能力与边界</caption>
                  <thead>
                    <tr>
                      <th scope="col">业务能力</th>
                      <th scope="col">状态</th>
                      <th scope="col">当前可用范围</th>
                      <th scope="col">主要边界 / 下一步</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCapabilities.map((item) => (
                      <CapabilityRow key={item.key} item={item} />
                    ))}
                  </tbody>
                </table>
              </div>
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
        )}

        <Alert
          className="erp-dev-product-core-boundary"
          type="info"
          showIcon
          message="进入 Product Core 不等于已发布或已验收"
          description={summary.boundary}
        />
      </main>
    </div>
  )
}
