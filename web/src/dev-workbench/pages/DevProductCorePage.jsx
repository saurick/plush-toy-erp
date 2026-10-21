import React, { useEffect, useMemo } from 'react'
import { AppstoreOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Tag, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import FilterChip from '@/common/components/navigation/FilterChip'
import DevPageNav from '../components/DevPageNav.jsx'
import DevStaticGuidance from '../components/DevStaticGuidance.jsx'
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

const { Text, Title } = Typography

const STATUS_COLOR_BY_MEMBERSHIP = Object.freeze({
  entered: 'success',
  partial: 'warning',
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

function CapabilityRow({ item, keyword }) {
  const [scopeLead, ...scopeDetails] = item.availableScope.split('；')
  const showMatchedScope = Boolean(keyword.trim()) && scopeDetails.join('；').toLowerCase().includes(keyword.trim().toLowerCase())
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
        </div>
      </td>
      <td data-label="当前可用范围">
        {scopeLead}
        {scopeDetails.length > 0 ? (
          <details className="erp-dev-product-core-scope" open={showMatchedScope || undefined}>
            <summary>其余可用范围（{scopeDetails.length} 项）</summary>
            <ul>{scopeDetails.map((text, index) => <li key={index}>{text}</li>)}</ul>
          </details>
        ) : null}
      </td>
      <td data-label="当前边界">{item.boundary}</td>
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
    <div className="erp-dev-product-core-page erp-dev-workspace-page erp-dev-tool-page">
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
            <Title level={1}>产品内核</Title>
          </div>
        </div>

        <div className="erp-dev-product-core-toolbar">
          <div>
            <Text id="product-core-inventory-title" type="secondary" aria-live="polite">
              {filteredCapabilities.length} / {summary.total} 项能力
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
                <FilterChip
                  key={option.key}
                  selected={isActive}
                  count={option.count}
                  onClick={() => handleMembershipChange(option.key)}
                >
                  {option.label}
                </FilterChip>
              )
            })}
          </div>
          <div className="erp-dev-product-core-toolbar__actions">
            <SearchInput
              allowClear
              aria-label="搜索产品内核能力"
              placeholder="搜索能力、范围或边界"
              searchHint="可搜索能力名称、当前可用范围、状态和当前边界"
              value={keyword}
              onChange={handleKeywordChange}
            />
            {hasActiveFilter ? (
              <Button onClick={handleReset}>清除筛选</Button>
            ) : null}
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
            查看能力台账
          </Button>
        </div>
      </header>

      <main className="erp-dev-product-core-shell">
        {capabilities.length === 0 ? (
          <Alert
            type="error"
            showIcon
            message="暂时无法读取产品能力台账"
            description="请打开能力台账，核对表格格式与状态。"
            action={
              <Button href={DEV_PRODUCT_CORE_DOCS_HREF}>查看能力台账</Button>
            }
          />
        ) : (
          <section
            className="erp-dev-product-core-inventory"
            aria-labelledby="product-core-inventory-title"
          >
            {filteredCapabilities.length > 0 ? (
              <div className="erp-dev-product-core-table-wrap">
                <table className="erp-dev-product-core-table" data-table-lines="appearance">
                  <caption>当前 Product Core 能力与边界</caption>
                  <thead>
                    <tr>
                      <th scope="col">业务能力</th>
                      <th scope="col">状态</th>
                      <th scope="col">当前可用范围</th>
                      <th scope="col">当前边界</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCapabilities.map((item) => (
                      <CapabilityRow key={`${item.key}:${keyword}`} item={item} keyword={keyword} />
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

        <DevStaticGuidance title="进入 Product Core 不等于已发布或已验收">
          <Text>{summary.boundary}</Text>
        </DevStaticGuidance>
      </main>
    </div>
  )
}
