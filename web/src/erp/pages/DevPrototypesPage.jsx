import React, { useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  CloseOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FullscreenOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Space, Tag, Typography } from 'antd'
import {
  DEV_PROTOTYPE_STATUS_OPTIONS,
  buildDevPrototypeItems,
  filterDevPrototypeItems,
} from '../config/devPrototypes.mjs'

const { Paragraph, Text, Title } = Typography

const htmlModules = import.meta.glob(
  '../../../../docs/product/prototypes/**/*.html',
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

const imageModules = import.meta.glob(
  '../../../../docs/product/prototypes/**/*.png',
  {
    eager: true,
    import: 'default',
    query: '?url',
  }
)

function PrototypeStatusTags({ statuses = [] }) {
  return (
    <Space size={4} wrap>
      {statuses.map((status) => (
        <Tag key={status} className="erp-dev-prototypes-status">
          {status}
        </Tag>
      ))}
    </Space>
  )
}

function PrototypePreview({ item, fullscreen = false }) {
  if (!item) {
    return (
      <div className="erp-dev-prototypes-preview__empty">
        <Empty description="请选择一个原型资产" />
      </div>
    )
  }

  if (!item.available) {
    return (
      <div className="erp-dev-prototypes-preview__empty">
        <Empty description="当前资产未被 Vite 开发态加载" />
      </div>
    )
  }

  if (item.type === 'HTML') {
    return (
      <iframe
        className={
          fullscreen
            ? 'erp-dev-prototypes-preview__frame erp-dev-prototypes-preview__frame--fullscreen'
            : 'erp-dev-prototypes-preview__frame'
        }
        title={item.title}
        srcDoc={item.source}
        sandbox="allow-scripts allow-same-origin"
      />
    )
  }

  return (
    <div
      className={
        fullscreen
          ? 'erp-dev-prototypes-preview__image-wrap erp-dev-prototypes-preview__image-wrap--fullscreen'
          : 'erp-dev-prototypes-preview__image-wrap'
      }
    >
      <img
        className={
          fullscreen
            ? 'erp-dev-prototypes-preview__image erp-dev-prototypes-preview__image--fullscreen'
            : 'erp-dev-prototypes-preview__image'
        }
        src={item.url}
        alt={item.title}
      />
    </div>
  )
}

function FullscreenPrototypePreview({ item, onClose }) {
  if (!item) return null

  return (
    <div
      className="erp-dev-prototypes-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} 全屏预览`}
    >
      <div className="erp-dev-prototypes-fullscreen__bar">
        <div className="erp-dev-prototypes-fullscreen__title">
          <Text strong>{item.title}</Text>
          <Text
            type="secondary"
            className="erp-dev-prototypes-fullscreen__path"
          >
            {item.assetPath}
          </Text>
        </div>
        <Button icon={<CloseOutlined />} onClick={onClose}>
          关闭
        </Button>
      </div>
      <div className="erp-dev-prototypes-fullscreen__body">
        <PrototypePreview item={item} fullscreen />
      </div>
    </div>
  )
}

export default function DevPrototypesPage() {
  const items = useMemo(
    () => buildDevPrototypeItems({ htmlModules, imageModules }),
    []
  )
  const [statusFilter, setStatusFilter] = useState('all')
  const [keyword, setKeyword] = useState('')
  const visibleItems = useMemo(
    () =>
      filterDevPrototypeItems(items, {
        status: statusFilter,
        keyword,
      }),
    [items, keyword, statusFilter]
  )
  const [selectedKey, setSelectedKey] = useState(items[0]?.key || '')
  const [fullscreenItem, setFullscreenItem] = useState(null)
  const selectedItem =
    visibleItems.find((item) => item.key === selectedKey) ||
    visibleItems[0] ||
    items.find((item) => item.key === selectedKey) ||
    items[0]

  React.useEffect(() => {
    if (!fullscreenItem) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setFullscreenItem(null)
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [fullscreenItem])

  return (
    <div className="erp-dev-prototypes-page">
      <header className="erp-dev-prototypes-header">
        <div className="erp-dev-prototypes-header__copy">
          <Space align="center" size={10} wrap>
            <AppstoreOutlined className="erp-dev-prototypes-header__icon" />
            <Title level={3} className="erp-dev-prototypes-title">
              产品原型查看器
            </Title>
            <Tag color="green">DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-prototypes-summary">
            只浏览 docs/product/prototypes 下的 HTML 原型、PNG
            方案图和截图证据；不进入 ERP
            菜单、权限、seedData、后端业务或开发文档 registry。
          </Paragraph>
        </div>
        <div className="erp-dev-prototypes-header__stats">
          <span>
            HTML {items.filter((item) => item.type === 'HTML').length}
          </span>
          <span>PNG {items.filter((item) => item.type === 'PNG').length}</span>
          <span>总计 {items.length}</span>
        </div>
      </header>

      <main className="erp-dev-prototypes-shell">
        <aside className="erp-dev-prototypes-sidebar">
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined />}
            placeholder="搜索名称、目录、用途"
            className="erp-dev-prototypes-search"
            onChange={(event) => setKeyword(event.target.value)}
          />
          <div className="erp-dev-prototypes-filter" aria-label="按状态筛选">
            {[
              { label: '全部', value: 'all' },
              ...DEV_PROTOTYPE_STATUS_OPTIONS.map((status) => ({
                label: status,
                value: status,
              })),
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  statusFilter === option.value
                    ? 'erp-dev-prototypes-filter__item erp-dev-prototypes-filter__item--active'
                    : 'erp-dev-prototypes-filter__item'
                }
                aria-pressed={statusFilter === option.value}
                onClick={() => setStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="erp-dev-prototypes-list" aria-label="产品原型资产">
            {visibleItems.length > 0 ? (
              visibleItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={
                    selectedItem?.key === item.key
                      ? 'erp-dev-prototypes-card erp-dev-prototypes-card--active'
                      : 'erp-dev-prototypes-card'
                  }
                  data-dev-prototype-key={item.key}
                  onClick={() => setSelectedKey(item.key)}
                >
                  <span className="erp-dev-prototypes-card__title">
                    {item.type === 'HTML' ? (
                      <FileTextOutlined />
                    ) : (
                      <FileImageOutlined />
                    )}
                    {item.title}
                  </span>
                  <span className="erp-dev-prototypes-card__meta">
                    <Tag color={item.type === 'HTML' ? 'green' : 'blue'}>
                      {item.type}
                    </Tag>
                    <PrototypeStatusTags statuses={item.statuses} />
                  </span>
                  <span className="erp-dev-prototypes-card__dir">
                    {item.directory}
                  </span>
                  <span className="erp-dev-prototypes-card__desc">
                    {item.description}
                  </span>
                </button>
              ))
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配的原型资产"
              />
            )}
          </div>
        </aside>

        <section className="erp-dev-prototypes-reader">
          <div className="erp-dev-prototypes-reader__toolbar">
            <div className="erp-dev-prototypes-reader__title">
              <Text strong>{selectedItem?.title}</Text>
              <Text
                type="secondary"
                className="erp-dev-prototypes-reader__path"
              >
                {selectedItem?.assetPath}
              </Text>
            </div>
            <div className="erp-dev-prototypes-reader__meta">
              {selectedItem ? (
                <>
                  <Tag color={selectedItem.type === 'HTML' ? 'green' : 'blue'}>
                    {selectedItem.type}
                  </Tag>
                  <PrototypeStatusTags statuses={selectedItem.statuses} />
                  <Button
                    icon={<FullscreenOutlined />}
                    disabled={!selectedItem.available}
                    onClick={() => setFullscreenItem(selectedItem)}
                  >
                    全屏预览
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="erp-dev-prototypes-reader__info">
            <Text>{selectedItem?.description}</Text>
            <Text type="secondary">
              <FolderOpenOutlined /> {selectedItem?.directory}
            </Text>
          </div>

          <PrototypePreview item={selectedItem} />
        </section>
      </main>
      <FullscreenPrototypePreview
        item={fullscreenItem}
        onClose={() => setFullscreenItem(null)}
      />
    </div>
  )
}
