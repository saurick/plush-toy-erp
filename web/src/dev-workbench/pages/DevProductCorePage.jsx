import React, { useEffect, useMemo, useRef } from 'react'
import { AppstoreOutlined, ArrowLeftOutlined, FileTextOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Empty, Tag, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_PRODUCT_CORE_ROUTE } from '../config/devRoutes.mjs'
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
  resolveProductCoreCapability,
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
  const requestedCapability = searchParams.get('capability') || ''
  const selectedCapability = resolveProductCoreCapability(filteredCapabilities, requestedCapability)
  const detailOpener = useRef(null)
  const capabilityGroups = useMemo(
    () => [...DEV_PRODUCT_CORE_MEMBERSHIP_ORDER, 'unknown']
      .map((key) => ({ key, items: filteredCapabilities.filter((item) => item.membershipKey === key) }))
      .filter((group) => group.items.length),
    [filteredCapabilities]
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
    const invalidMembership = requestedMembership && requestedMembership !== membership
    const invalidCapability = requestedCapability && selectedCapability?.capability !== requestedCapability
    if (!invalidMembership && !invalidCapability) return
    const nextParams = new URLSearchParams(searchParams)
    if (invalidMembership) nextParams.delete('status')
    if (invalidCapability) nextParams.delete('capability')
    setSearchParams(nextParams, { replace: true })
  }, [membership, requestedMembership, requestedCapability, selectedCapability, searchParams, setSearchParams])

  const handleMembershipChange = (nextMembership) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('capability')
    if (nextMembership === DEV_PRODUCT_CORE_MEMBERSHIP_ALL) {
      nextParams.delete('status')
    } else {
      nextParams.set('status', nextMembership)
    }
    setSearchParams(nextParams)
  }

  const handleKeywordSearch = (nextKeyword) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('capability')
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

  const selectCapability = (item, event) => {
    if (item === selectedCapability) return
    detailOpener.current = event.currentTarget
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('capability', item.capability)
    setSearchParams(nextParams)
  }

  const closeCapability = () => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.delete('capability')
    setSearchParams(nextParams, { replace: true })
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
            <Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_PRODUCT_CORE_ROUTE]}</Title>
          </div>
        </div>
      </header>

      <main className="erp-dev-product-core-shell">
        <div className="erp-dev-product-core-toolbar">
          <div
            className="erp-dev-product-core-filters"
            role="group"
            aria-label="按产品能力归属筛选"
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
              aria-label="搜索产品能力"
              placeholder="搜索能力、范围或边界"
              searchHint="可搜索能力名称、当前可用范围、状态和当前边界"
              value={keyword}
              onSearch={handleKeywordSearch}
            />
            <Text className="erp-dev-product-core-result-count" type="secondary" aria-live="polite">{filteredCapabilities.length} 项</Text>
            <Button disabled={!hasActiveFilter} onClick={handleReset}>清除筛选</Button>
          </div>
        </div>

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
            aria-label="产品能力目录"
          >
            {filteredCapabilities.length > 0 ? (
              <div className="erp-dev-product-core-groups">
                {capabilityGroups.map((group) => (
                  <section className="erp-dev-product-core-group" key={group.key} data-membership={group.key}>
                    <h2 className="erp-dev-directory-group-title">{group.items[0].membership}</h2>
                    <ul>
                      {group.items.map((item) => (
                        <li key={item.key}>
                          <button
                            type="button"
                            className="erp-dev-directory-item erp-dev-directory-item--nested"
                            aria-haspopup="dialog"
                            onClick={(event) => selectCapability(item, event)}
                          >
                            <span>{item.capability}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <div className="erp-dev-product-core-empty">
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="没有匹配的产品能力"
                />
              </div>
            )}
          </section>
        )}

        <DevStaticGuidance title="状态说明">
          <Text>进入 Product Core 不等于已发布或已验收。</Text>
          <Text>{summary.boundary}</Text>
        </DevStaticGuidance>
      </main>
      <Drawer
        rootClassName="erp-dev-product-core-drawer"
        title={selectedCapability?.capability || '能力详情'}
        open={Boolean(selectedCapability)}
        width={680}
        styles={{ wrapper: { maxWidth: '100%' } }}
        closable={false}
        extra={<Button type="text" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={closeCapability}>返回能力目录</Button>}
        onClose={closeCapability}
        afterOpenChange={(open) => {
          if (!open && detailOpener.current?.isConnected) detailOpener.current.focus({ preventScroll: true })
        }}
      >
        {selectedCapability ? (
          <article className="erp-dev-product-core-detail" aria-label="当前能力详情">
            <Tag color={STATUS_COLOR_BY_MEMBERSHIP[selectedCapability.membershipKey]}>{selectedCapability.membership}</Tag>
            <section>
              <Title level={3}>当前可用范围</Title>
              <ul>{selectedCapability.availableScope.split('；').map((text, index) => <li key={index}>{text}</li>)}</ul>
            </section>
            <section className="erp-dev-product-core-detail__boundary">
              <Title level={3}>当前边界</Title>
              <p>{selectedCapability.boundary}</p>
            </section>
            <Button icon={<FileTextOutlined />} href={DEV_PRODUCT_CORE_DOCS_HREF}>查看能力台账</Button>
          </article>
        ) : null}
      </Drawer>
    </div>
  )
}
