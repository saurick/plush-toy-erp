import React, { useMemo, useState } from 'react'
import {
  AppstoreOutlined,
  CloseOutlined,
  CopyOutlined,
  DownOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  FullscreenOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Space, Tag, Typography } from 'antd'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/dev/DevPageNav.jsx'
import {
  DEV_PROTOTYPE_EXPANDED_GROUPS_STORAGE_KEY,
  DEV_PROTOTYPE_FILTER_OPTIONS,
  DEV_PROTOTYPE_FILTERS,
  DEV_PROTOTYPE_PINNED_STORAGE_KEY,
  DEV_PROTOTYPE_SELECTED_STORAGE_KEY,
  DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY,
  applyDevPrototypePinnedState,
  buildDevPrototypeItems,
  filterDevPrototypeItems,
  groupDevPrototypeItemsByDirectory,
  normalizeDevPrototypeExpandedGroupKeys,
  normalizeDevPrototypePinnedKeys,
  normalizeDevPrototypeSelectedKey,
  normalizeDevPrototypeStatusFilter,
  prepareDevPrototypeSandboxSource,
  resolveDevPrototypeStatusFilterForSelection,
} from '../config/devPrototypes.mjs'
import { formatDevEnglishAnchor } from '../config/devVisibleLabels.mjs'

const { Paragraph, Text, Title } = Typography
const PROTOTYPE_REPOSITORY_ROOT = 'docs/product/prototypes'
const ASSET_QUERY_KEY = 'asset'
const FILTER_QUERY_KEY = 'filter'
const KEYWORD_QUERY_KEY = 'q'

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

function readStoredString(storageKey) {
  if (typeof window === 'undefined') return null

  try {
    const rawValue = window.localStorage?.getItem(storageKey)
    return typeof rawValue === 'string' && rawValue ? rawValue : null
  } catch {
    return null
  }
}

function writeStoredString(storageKey, value) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage?.setItem(storageKey, value)
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

function getPrototypeRepositoryPath(relativePath = '') {
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '')
  return normalizedPath
    ? `${PROTOTYPE_REPOSITORY_ROOT}/${normalizedPath}`
    : PROTOTYPE_REPOSITORY_ROOT
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
        aria-current={selected ? 'true' : undefined}
        onClick={() => onSelect(item.key)}
      >
        <span className="erp-dev-prototypes-card__title">
          {item.type === 'HTML' ? <FileTextOutlined /> : <FileImageOutlined />}
          {item.title}
        </span>
        <span className="erp-dev-prototypes-card__meta">
          <Tag color={item.type === 'HTML' ? 'green' : 'blue'}>
            {formatDevEnglishAnchor(item.type)}
          </Tag>
          <PrototypeStatusTags statuses={item.statuses} />
        </span>
        <span className="erp-dev-prototypes-card__dir">{item.directory}</span>
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
        <Empty description="请选择一个样板或参考资料" />
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
        srcDoc={prepareDevPrototypeSandboxSource(item.source)}
        sandbox="allow-scripts"
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

function FullscreenPrototypePreview({
  closeButtonRef,
  dialogRef,
  item,
  onClose,
}) {
  if (!item) return null

  return (
    <div
      ref={dialogRef}
      className="erp-dev-prototypes-fullscreen"
      role="dialog"
      aria-modal="true"
      aria-label={`${item.title} 全屏预览`}
      tabIndex={-1}
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
        <Button
          ref={closeButtonRef}
          icon={<CloseOutlined />}
          aria-label="关闭原型全屏预览"
          onClick={onClose}
        >
          关闭
        </Button>
      </div>
      <div className="erp-dev-prototypes-fullscreen__body">
        <PrototypePreview item={item} fullscreen />
      </div>
      <button
        type="button"
        data-prototype-focus-guard
        className="erp-dev-prototypes-fullscreen__focus-guard"
        aria-label="焦点循环至关闭按钮"
        onFocus={() => closeButtonRef.current?.focus()}
      />
    </div>
  )
}

export default function DevPrototypesPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const pageNavRef = React.useRef(null)
  const pageHeaderRef = React.useRef(null)
  const pageMainRef = React.useRef(null)
  const fullscreenDialogRef = React.useRef(null)
  const fullscreenCloseButtonRef = React.useRef(null)
  const fullscreenTriggerRef = React.useRef(null)
  const fullscreenReturnFocusRef = React.useRef(null)
  const items = useMemo(
    () => buildDevPrototypeItems({ htmlModules, imageModules }),
    []
  )
  const requestedStatusFilter = searchParams.has(FILTER_QUERY_KEY)
    ? searchParams.get(FILTER_QUERY_KEY) || ''
    : readStoredString(DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY) ||
      DEV_PROTOTYPE_FILTERS.ALL
  const keyword = searchParams.get(KEYWORD_QUERY_KEY) || ''
  const hasRequestedSelectedKey = searchParams.has(ASSET_QUERY_KEY)
  const requestedSelectedKey = hasRequestedSelectedKey
    ? searchParams.get(ASSET_QUERY_KEY) || ''
    : readStoredString(DEV_PROTOTYPE_SELECTED_STORAGE_KEY) || ''
  const statusFilter = resolveDevPrototypeStatusFilterForSelection(
    normalizeDevPrototypeStatusFilter(requestedStatusFilter),
    hasRequestedSelectedKey ? requestedSelectedKey : '',
    items
  )
  const selectedKey = normalizeDevPrototypeSelectedKey(
    requestedSelectedKey,
    items
  )
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
  const [fullscreenItem, setFullscreenItem] = useState(null)
  const selectedItem =
    visibleItems.find((item) => item.key === selectedKey) || visibleItems[0]
  const canonicalSelectedKey = selectedItem?.key || selectedKey

  const copySelectedAssetPath = async () => {
    if (!selectedItem?.assetPath) return

    const assetPath = getPrototypeRepositoryPath(selectedItem.assetPath)
    try {
      await navigator.clipboard.writeText(assetPath)
      message.success('已复制原型资产路径')
    } catch {
      message.error('复制失败，请手动选中原型资产路径')
    }
  }

  const openSelectedReadme = () => {
    if (!selectedItem?.readmePath) return

    const params = new URLSearchParams({
      path: getPrototypeRepositoryPath(selectedItem.readmePath),
    })
    navigate({ pathname: '/__dev/docs', search: `?${params.toString()}` })
  }

  const openFullscreen = (item) => {
    fullscreenReturnFocusRef.current =
      fullscreenTriggerRef.current || document.activeElement
    setFullscreenItem(item)
  }

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

  const selectStatusFilter = (filter) => {
    const nextParams = new URLSearchParams(searchParams)
    const nextFilter = normalizeDevPrototypeStatusFilter(filter)
    nextParams.set(FILTER_QUERY_KEY, nextFilter)
    const requestedItem = items.find(
      (item) => item.key === nextParams.get(ASSET_QUERY_KEY)
    )
    if (
      requestedItem &&
      filterDevPrototypeItems([requestedItem], { status: nextFilter })
        .length === 0
    ) {
      nextParams.delete(ASSET_QUERY_KEY)
    }
    setSearchParams(nextParams)
  }

  const selectPrototypeAsset = (itemKey) => {
    const nextParams = new URLSearchParams(searchParams)
    const normalizedItemKey = normalizeDevPrototypeSelectedKey(itemKey, items)
    if (normalizedItemKey) {
      nextParams.set(ASSET_QUERY_KEY, normalizedItemKey)
    } else {
      nextParams.delete(ASSET_QUERY_KEY)
    }
    setSearchParams(nextParams)
  }

  const updateKeyword = (nextKeyword) => {
    const nextParams = new URLSearchParams(searchParams)
    if (nextKeyword) {
      nextParams.set(KEYWORD_QUERY_KEY, nextKeyword)
    } else {
      nextParams.delete(KEYWORD_QUERY_KEY)
    }
    setSearchParams(nextParams, { replace: true })
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
    writeStoredString(DEV_PROTOTYPE_STATUS_FILTER_STORAGE_KEY, statusFilter)
  }, [statusFilter])

  React.useEffect(() => {
    if (canonicalSelectedKey) {
      writeStoredString(
        DEV_PROTOTYPE_SELECTED_STORAGE_KEY,
        canonicalSelectedKey
      )
    }
  }, [canonicalSelectedKey])

  React.useEffect(() => {
    const requestedFilter = searchParams.get(FILTER_QUERY_KEY) || ''
    const requestedAsset = searchParams.get(ASSET_QUERY_KEY) || ''
    if (
      requestedFilter === statusFilter &&
      requestedAsset === canonicalSelectedKey
    ) {
      return
    }

    const nextParams = new URLSearchParams(searchParams)
    nextParams.set(FILTER_QUERY_KEY, statusFilter)
    if (canonicalSelectedKey) {
      nextParams.set(ASSET_QUERY_KEY, canonicalSelectedKey)
    } else {
      nextParams.delete(ASSET_QUERY_KEY)
    }
    setSearchParams(nextParams, { replace: true })
  }, [canonicalSelectedKey, searchParams, setSearchParams, statusFilter])

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

    const dialog = fullscreenDialogRef.current
    const backgroundElements = [
      pageNavRef.current,
      pageHeaderRef.current,
      pageMainRef.current,
    ].filter(Boolean)
    const backgroundState = backgroundElements.map((element) => ({
      element,
      hadInert: element.hasAttribute('inert'),
      ariaHidden: element.getAttribute('aria-hidden'),
    }))
    backgroundElements.forEach((element) => {
      element.setAttribute('inert', '')
      element.setAttribute('aria-hidden', 'true')
    })

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setFullscreenItem(null)
        return
      }
      if (event.key !== 'Tab' || !dialog) {
        return
      }

      const focusableElements = [
        ...dialog.querySelectorAll(
          'a[href], button:not([disabled]):not([data-prototype-focus-guard]), iframe, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]):not([data-prototype-focus-guard])'
        ),
      ].filter((element) => element.getAttribute('aria-hidden') !== 'true')
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements.at(-1)
      const { activeElement } = document
      if (event.shiftKey && activeElement === firstElement) {
        event.preventDefault()
        lastElement.focus()
      } else if (
        !event.shiftKey &&
        (activeElement === lastElement || !dialog.contains(activeElement))
      ) {
        event.preventDefault()
        firstElement.focus()
      }
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)
    const focusFrame = window.requestAnimationFrame(() => {
      const initialFocusElement = fullscreenCloseButtonRef.current || dialog
      initialFocusElement?.focus()
    })
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
      backgroundState.forEach(({ element, hadInert, ariaHidden }) => {
        if (!hadInert) element.removeAttribute('inert')
        if (ariaHidden === null) {
          element.removeAttribute('aria-hidden')
        } else {
          element.setAttribute('aria-hidden', ariaHidden)
        }
      })
      const returnFocusElement = fullscreenReturnFocusRef.current
      window.setTimeout(() => {
        if (returnFocusElement?.isConnected) {
          returnFocusElement.focus({ preventScroll: true })
        }
      }, 0)
    }
  }, [fullscreenItem])

  return (
    <div className="erp-dev-prototypes-page erp-dev-workspace-page">
      <DevPageNav
        navRef={pageNavRef}
        sourcePath={
          selectedItem?.readmePath
            ? getPrototypeRepositoryPath(selectedItem.readmePath)
            : 'docs/product/prototypes/README.md'
        }
      />
      <header ref={pageHeaderRef} className="erp-dev-prototypes-header">
        <div className="erp-dev-prototypes-header__copy">
          <Space align="center" size={10} wrap>
            <AppstoreOutlined className="erp-dev-prototypes-header__icon" />
            <Title level={1} className="erp-dev-prototypes-title">
              产品原型与样板查看器 / Prototype Viewer
            </Title>
            <Tag color="green">仅开发环境 / DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-prototypes-summary">
            只查看 docs/product/prototypes 下的 HTML 样板、PNG
            方案图和截图证据；参照范围只说明可借鉴的页面 /
            菜单类型，不是正式菜单映射中心；不进入 ERP
            菜单、权限、seedData、后端业务或正式文档入口。
          </Paragraph>
        </div>
        <div className="erp-dev-prototypes-header__stats">
          <span>
            网页原型 / HTML{' '}
            {items.filter((item) => item.type === 'HTML').length}
          </span>
          <span>
            图片方案 / PNG {items.filter((item) => item.type === 'PNG').length}
          </span>
          <span>总计 / Total {items.length}</span>
        </div>
      </header>

      <main ref={pageMainRef} className="erp-dev-prototypes-shell">
        <aside className="erp-dev-prototypes-sidebar">
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined />}
            placeholder="搜索名称、目录、用途、参照范围"
            className="erp-dev-prototypes-search"
            onChange={(event) => updateKeyword(event.target.value)}
          />
          <div className="erp-dev-prototypes-filter" aria-label="按状态筛选">
            {DEV_PROTOTYPE_FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={
                  statusFilter === option.value
                    ? 'erp-dev-prototypes-filter__item erp-dev-prototypes-filter__item--active'
                    : 'erp-dev-prototypes-filter__item'
                }
                aria-pressed={statusFilter === option.value}
                onClick={() => selectStatusFilter(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
          <Paragraph className="erp-dev-prototypes-filter-note">
            顶部筛选只用于判断当前、待实现和参考资料；起草阶段、截图证据和方案对比保留在卡片标签里。
          </Paragraph>
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

          <div className="erp-dev-prototypes-list" aria-label="产品原型与样板">
            {visibleItems.length > 0 ? (
              <>
                {pinnedItems.length > 0 ? (
                  <section
                    className="erp-dev-prototypes-pinned"
                    aria-label="置顶原型与样板"
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
                          onSelect={selectPrototypeAsset}
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
                      aria-label={`${group.directory} 原型与样板`}
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
                              onSelect={selectPrototypeAsset}
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
                description="没有匹配的样板或参考资料"
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
                    {formatDevEnglishAnchor(selectedItem.type)}
                  </Tag>
                  <PrototypeStatusTags statuses={selectedItem.statuses} />
                  <Button
                    icon={<CopyOutlined />}
                    aria-label="复制当前原型资产路径"
                    onClick={copySelectedAssetPath}
                  >
                    复制路径 / Copy
                  </Button>
                  <Button
                    icon={<FileMarkdownOutlined />}
                    aria-label="在开发文档中打开当前原型说明"
                    onClick={openSelectedReadme}
                  >
                    打开说明 / README
                  </Button>
                  <Button
                    icon={
                      selectedItem.pinned ? (
                        <PushpinFilled />
                      ) : (
                        <PushpinOutlined />
                      )
                    }
                    aria-label={
                      selectedItem.pinned
                        ? '取消置顶当前原型资产'
                        : '置顶当前原型资产'
                    }
                    aria-pressed={selectedItem.pinned}
                    onClick={() => togglePinned(selectedItem.key)}
                  >
                    {selectedItem.pinned ? '取消置顶 / Unpin' : '置顶 / Pin'}
                  </Button>
                  <Button
                    ref={fullscreenTriggerRef}
                    icon={<FullscreenOutlined />}
                    aria-label="全屏预览当前原型"
                    disabled={!selectedItem.available}
                    onClick={() => openFullscreen(selectedItem)}
                  >
                    全屏预览 / Fullscreen
                  </Button>
                </>
              ) : null}
            </div>
          </div>

          <div className="erp-dev-prototypes-reader__info">
            {selectedItem ? (
              <>
                <Text>{selectedItem.description}</Text>
                {selectedItem.appliesTo ? (
                  <Text className="erp-dev-prototypes-reader__applies">
                    参照范围：{selectedItem.appliesTo}
                  </Text>
                ) : null}
                <Text type="secondary">
                  <FolderOpenOutlined /> {selectedItem.directory}
                </Text>
                <Text type="secondary">
                  <FileMarkdownOutlined />{' '}
                  {getPrototypeRepositoryPath(selectedItem.readmePath)}
                </Text>
              </>
            ) : (
              <Text type="secondary">
                当前筛选没有匹配资产，请调整关键词或状态筛选。
              </Text>
            )}
          </div>

          <PrototypePreview item={selectedItem} />
        </section>
      </main>
      <FullscreenPrototypePreview
        closeButtonRef={fullscreenCloseButtonRef}
        dialogRef={fullscreenDialogRef}
        item={fullscreenItem}
        onClose={() => setFullscreenItem(null)}
      />
    </div>
  )
}
