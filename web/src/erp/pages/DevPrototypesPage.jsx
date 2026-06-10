import React, { useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  CloseOutlined,
  DownOutlined,
  FileImageOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FullscreenOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Space, Tag, Typography } from 'antd'
import {
  DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
  DEV_PROTOTYPE_PINNED_STORAGE_KEY,
  DEV_PROTOTYPE_STATUS_OPTIONS,
  applyDevPrototypePinnedState,
  buildDevPrototypeItems,
  filterDevPrototypeItems,
  groupDevPrototypeItemsByDirectory,
  normalizeDevPrototypeExpandedGroupKeys,
  normalizeDevPrototypePinnedKeys,
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

function readStoredStringArray(storageKey) {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.localStorage?.getItem(storageKey)
    if (!rawValue) return null
    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue) ? parsedValue : null
  } catch {
    return null
  }
}

function writeStoredStringArray(storageKey, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage?.setItem(storageKey, JSON.stringify(value))
  } catch {
    // 本地偏好不可用时不影响原型查看器主路径。
  }
}

function areStringArraysEqual(left = [], right = []) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function PrototypeAssetCard({ item, selected, onSelect, onTogglePinned }) {
  return (
    <div
      className={
        selected
          ? 'erp-dev-prototypes-card erp-dev-prototypes-card--active'
          : 'erp-dev-prototypes-card'
      }
      data-dev-prototype-key={item.key}
    >
      <button
        type="button"
        className="erp-dev-prototypes-card__body"
        onClick={() => onSelect(item.key)}
      >
        <span className="erp-dev-prototypes-card__title">
          {item.type === 'HTML' ? <FileTextOutlined /> : <FileImageOutlined />}
          {item.title}
        </span>
        <span className="erp-dev-prototypes-card__meta">
          <Tag color={item.type === 'HTML' ? 'green' : 'blue'}>{item.type}</Tag>
          <PrototypeStatusTags statuses={item.statuses} />
        </span>
        <span className="erp-dev-prototypes-card__dir">{item.directory}</span>
        <span className="erp-dev-prototypes-card__desc">
          {item.description}
        </span>
      </button>
      <button
        type="button"
        className={
          item.pinned
            ? 'erp-dev-prototypes-card__pin erp-dev-prototypes-card__pin--active'
            : 'erp-dev-prototypes-card__pin'
        }
        aria-label={
          item.pinned ? `取消置顶 ${item.title}` : `置顶 ${item.title}`
        }
        aria-pressed={item.pinned}
        onClick={() => onTogglePinned(item.key)}
      >
        {item.pinned ? <PushpinFilled /> : <PushpinOutlined />}
      </button>
    </div>
  )
}

function PrototypePreview({ item, fullscreen = false }) {
  if (!item) {
    return (
      <div className="erp-dev-prototypes-preview__empty">
        <Empty description="请选择一个原型资产 / Select a prototype asset" />
      </div>
    )
  }

  if (!item.available) {
    return (
      <div className="erp-dev-prototypes-preview__empty">
        <Empty description="当前资产未被 Vite 开发态加载 / Asset not loaded by Vite dev" />
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
  const [pinnedKeys, setPinnedKeys] = useState(() =>
    normalizeDevPrototypePinnedKeys(
      readStoredStringArray(DEV_PROTOTYPE_PINNED_STORAGE_KEY) || [],
      items
    )
  )
  const [storedExpandedGroupKeys, setStoredExpandedGroupKeys] = useState(() =>
    readStoredStringArray(DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY)
  )
  const itemsWithPinnedState = useMemo(
    () => applyDevPrototypePinnedState(items, pinnedKeys),
    [items, pinnedKeys]
  )
  const visibleItems = useMemo(
    () =>
      filterDevPrototypeItems(itemsWithPinnedState, {
        status: statusFilter,
        keyword,
      }),
    [itemsWithPinnedState, keyword, statusFilter]
  )
  const pinnedItems = useMemo(
    () => visibleItems.filter((item) => item.pinned),
    [visibleItems]
  )
  const directoryGroups = useMemo(
    () =>
      groupDevPrototypeItemsByDirectory(
        visibleItems.filter((item) => !item.pinned)
      ),
    [visibleItems]
  )
  const visibleGroupKeys = useMemo(
    () => directoryGroups.map((group) => group.key),
    [directoryGroups]
  )
  const allGroupKeys = useMemo(
    () => groupDevPrototypeItemsByDirectory(items).map((group) => group.key),
    [items]
  )
  const expandedGroupKeys = useMemo(() => {
    if (storedExpandedGroupKeys === null) return allGroupKeys
    return normalizeDevPrototypeExpandedGroupKeys(
      storedExpandedGroupKeys,
      allGroupKeys
    )
  }, [allGroupKeys, storedExpandedGroupKeys])
  const expandedGroupKeySet = useMemo(
    () => new Set(expandedGroupKeys),
    [expandedGroupKeys]
  )
  const visibleGroupsExpanded =
    visibleGroupKeys.length > 0 &&
    visibleGroupKeys.every((groupKey) => expandedGroupKeySet.has(groupKey))
  const [selectedKey, setSelectedKey] = useState(items[0]?.key || '')
  const [fullscreenItem, setFullscreenItem] = useState(null)
  const selectedItem =
    visibleItems.find((item) => item.key === selectedKey) ||
    visibleItems[0] ||
    itemsWithPinnedState.find((item) => item.key === selectedKey) ||
    itemsWithPinnedState[0]

  const togglePinned = (itemKey) => {
    setPinnedKeys((currentPinnedKeys) => {
      const normalizedPinnedKeys = normalizeDevPrototypePinnedKeys(
        currentPinnedKeys,
        items
      )
      if (normalizedPinnedKeys.includes(itemKey)) {
        return normalizedPinnedKeys.filter((key) => key !== itemKey)
      }
      return normalizeDevPrototypePinnedKeys(
        [itemKey, ...normalizedPinnedKeys],
        items
      )
    })
  }

  const toggleDirectoryGroup = (groupKey) => {
    setStoredExpandedGroupKeys((currentGroupKeys) => {
      const normalizedGroupKeys =
        currentGroupKeys === null
          ? allGroupKeys
          : normalizeDevPrototypeExpandedGroupKeys(
              currentGroupKeys,
              allGroupKeys
            )
      if (normalizedGroupKeys.includes(groupKey)) {
        return normalizedGroupKeys.filter((key) => key !== groupKey)
      }
      return normalizeDevPrototypeExpandedGroupKeys(
        [...normalizedGroupKeys, groupKey],
        allGroupKeys
      )
    })
  }

  const toggleAllDirectoryGroups = () => {
    setStoredExpandedGroupKeys(visibleGroupsExpanded ? [] : allGroupKeys)
  }

  React.useEffect(() => {
    setPinnedKeys((currentPinnedKeys) => {
      const normalizedPinnedKeys = normalizeDevPrototypePinnedKeys(
        currentPinnedKeys,
        items
      )
      return areStringArraysEqual(currentPinnedKeys, normalizedPinnedKeys)
        ? currentPinnedKeys
        : normalizedPinnedKeys
    })
  }, [items])

  React.useEffect(() => {
    writeStoredStringArray(DEV_PROTOTYPE_PINNED_STORAGE_KEY, pinnedKeys)
  }, [pinnedKeys])

  React.useEffect(() => {
    if (storedExpandedGroupKeys === null) return

    const normalizedGroupKeys = normalizeDevPrototypeExpandedGroupKeys(
      storedExpandedGroupKeys,
      allGroupKeys
    )
    if (!areStringArraysEqual(storedExpandedGroupKeys, normalizedGroupKeys)) {
      setStoredExpandedGroupKeys(normalizedGroupKeys)
      return
    }
    writeStoredStringArray(
      DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
      normalizedGroupKeys
    )
  }, [allGroupKeys, storedExpandedGroupKeys])

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
              产品原型查看器 / Prototype Viewer
            </Title>
            <Tag color="green">DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-prototypes-summary">
            只浏览 docs/product/prototypes 下的 HTML 原型、PNG 方案图和截图证据
            / preview prototype assets only；不进入 ERP
            菜单、权限、seedData、后端业务或开发文档 registry。
          </Paragraph>
        </div>
        <div className="erp-dev-prototypes-header__stats">
          <span>
            HTML {items.filter((item) => item.type === 'HTML').length}
          </span>
          <span>PNG {items.filter((item) => item.type === 'PNG').length}</span>
          <span>总计 / Total {items.length}</span>
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
              { label: '全部 / All', value: 'all' },
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
          <div
            className="erp-dev-prototypes-group-controls"
            aria-label="目录分组操作"
          >
            <Button
              size="small"
              type="text"
              disabled={visibleGroupKeys.length === 0}
              onClick={toggleAllDirectoryGroups}
            >
              {visibleGroupsExpanded ? '收起' : '展开'}
            </Button>
          </div>

          <div className="erp-dev-prototypes-list" aria-label="产品原型资产">
            {visibleItems.length > 0 ? (
              <>
                {pinnedItems.length > 0 ? (
                  <section
                    className="erp-dev-prototypes-pinned"
                    aria-label="置顶原型资产"
                  >
                    <div className="erp-dev-prototypes-list-section__head">
                      <span>
                        <PushpinFilled /> 置顶 / Pinned
                      </span>
                      <Text type="secondary">{pinnedItems.length}</Text>
                    </div>
                    <div className="erp-dev-prototypes-group__items">
                      {pinnedItems.map((item) => (
                        <PrototypeAssetCard
                          key={item.key}
                          item={item}
                          selected={selectedItem?.key === item.key}
                          onSelect={setSelectedKey}
                          onTogglePinned={togglePinned}
                        />
                      ))}
                    </div>
                  </section>
                ) : null}

                {directoryGroups.map((group) => {
                  const expanded = expandedGroupKeySet.has(group.key)
                  return (
                    <section
                      key={group.key}
                      className="erp-dev-prototypes-group"
                      aria-label={`${group.directory} 原型资产`}
                    >
                      <button
                        type="button"
                        className="erp-dev-prototypes-group__head"
                        aria-expanded={expanded}
                        onClick={() => toggleDirectoryGroup(group.key)}
                      >
                        <span className="erp-dev-prototypes-group__title">
                          {expanded ? <DownOutlined /> : <RightOutlined />}
                          <FolderOpenOutlined />
                          {group.directory}
                        </span>
                        <span className="erp-dev-prototypes-group__count">
                          {group.items.length}
                        </span>
                      </button>
                      {expanded ? (
                        <div className="erp-dev-prototypes-group__items">
                          {group.items.map((item) => (
                            <PrototypeAssetCard
                              key={item.key}
                              item={item}
                              selected={selectedItem?.key === item.key}
                              onSelect={setSelectedKey}
                              onTogglePinned={togglePinned}
                            />
                          ))}
                        </div>
                      ) : null}
                    </section>
                  )
                })}
              </>
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配的原型资产 / No matching prototype assets"
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
                    icon={
                      selectedItem.pinned ? (
                        <PushpinFilled />
                      ) : (
                        <PushpinOutlined />
                      )
                    }
                    aria-pressed={selectedItem.pinned}
                    onClick={() => togglePinned(selectedItem.key)}
                  >
                    {selectedItem.pinned ? '取消置顶 / Unpin' : '置顶 / Pin'}
                  </Button>
                  <Button
                    icon={<FullscreenOutlined />}
                    disabled={!selectedItem.available}
                    onClick={() => setFullscreenItem(selectedItem)}
                  >
                    全屏预览 / Fullscreen
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
