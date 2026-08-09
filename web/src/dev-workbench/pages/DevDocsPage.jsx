import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOutlined,
  CopyOutlined,
  DownOutlined,
  FileMarkdownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PushpinFilled,
  PushpinOutlined,
  RightOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Empty,
  Segmented,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
} from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import { Markdown, extractMarkdownHeadings } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
  DEV_DOCS_LIFECYCLE_ARCHIVE,
  DEV_DOCS_LIFECYCLE_CURRENT,
  DEV_DOCS_LIFECYCLE_REVIEW,
  DEV_DOCS_LIFECYCLE_STORAGE_KEY,
  DEV_DOCS_PINNED_STORAGE_KEY,
  DEV_DOCS_SEARCH_SCOPE_ALL,
  DEV_DOCS_SEARCH_SCOPE_TITLE,
  DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
  DEV_DOCS_TOC_EXPANDED_STORAGE_KEY,
  applyDevDocsPinnedState,
  buildDevDocsItems,
  buildDevDocsTree,
  filterDevDocsByLifecycle,
  filterDevDocsItems,
  getDevDocsTitle,
  getDefaultDevDocsPinnedPaths,
  normalizeDevDocsLifecycle,
  normalizeDevDocsExpandedDirKeys,
  normalizeDevDocsPinnedPaths,
  normalizeDevDocsSelectedPath,
  sortDevDocsItemsByPinned,
} from '../config/devDocs.mjs'
import {
  buildDevDocsLocation,
  resolveDevDocsMarkdownHref,
} from './devDocsNavigation.mjs'

const { Paragraph, Text, Title } = Typography

const DEFAULT_EXPANDED_DIR_KEYS = Object.freeze([])
const SEARCH_SCOPE_OPTIONS = Object.freeze([
  { label: '全部', value: DEV_DOCS_SEARCH_SCOPE_ALL },
  { label: '仅标题', value: DEV_DOCS_SEARCH_SCOPE_TITLE },
])
const LIFECYCLE_OPTIONS = Object.freeze([
  { label: '当前', value: DEV_DOCS_LIFECYCLE_CURRENT },
  { label: '评审与参考', value: DEV_DOCS_LIFECYCLE_REVIEW },
  { label: '历史', value: DEV_DOCS_LIFECYCLE_ARCHIVE },
])
const LIFECYCLE_LABELS = Object.freeze({
  [DEV_DOCS_LIFECYCLE_CURRENT]: '当前文档',
  [DEV_DOCS_LIFECYCLE_REVIEW]: '评审与参考',
  [DEV_DOCS_LIFECYCLE_ARCHIVE]: '历史归档',
})

const currentMarkdownModules = import.meta.glob(
  [
    '../../../../README.md',
    '../../../../AGENTS.md',
    '../../../README.md',
    '../../../scripts/README.md',
    '../../../../server/README.md',
    '../../../../server/deploy/README.md',
    '../../../../server/deploy/compose/prod/README.md',
    '../../../../scripts/README.md',
    '../../../../config/customers/**/*.md',
    '../../../../docs/**/*.md',
    '!../../../../docs/archive/**/*.md',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

const archiveMarkdownModules = import.meta.glob(
  '../../../../docs/archive/**/*.md',
  {
    import: 'default',
    query: '?raw',
  }
)

const markdownModules = Object.freeze({
  ...currentMarkdownModules,
  ...archiveMarkdownModules,
})

function readSelectedPathFromSearch(search = '') {
  try {
    return new URLSearchParams(search).get('path') || ''
  } catch {
    return ''
  }
}

function readHeadingIdFromHash(hash = '') {
  const rawHash = String(hash || '')
    .replace(/^#/, '')
    .trim()
  if (!rawHash) {
    return ''
  }
  try {
    return decodeURIComponent(rawHash)
  } catch {
    return rawHash
  }
}

function readLifecycle(docs = [], search = '') {
  const querySelectedPath = normalizeDevDocsSelectedPath(
    readSelectedPathFromSearch(search),
    docs
  )
  const queryLifecycle = docs.find(
    (item) => item.path === querySelectedPath
  )?.lifecycle
  if (queryLifecycle) {
    return normalizeDevDocsLifecycle(queryLifecycle)
  }
  if (typeof window === 'undefined') {
    return DEV_DOCS_LIFECYCLE_CURRENT
  }
  try {
    return normalizeDevDocsLifecycle(
      window.localStorage.getItem(DEV_DOCS_LIFECYCLE_STORAGE_KEY)
    )
  } catch {
    return DEV_DOCS_LIFECYCLE_CURRENT
  }
}

function scrollMarkdownContainerToHeading(container, headingId) {
  if (!container || !headingId) {
    return false
  }

  const target = [...container.querySelectorAll('h1, h2, h3')].find(
    (element) => element.id === headingId
  )
  if (!target) {
    return false
  }

  const containerRect = container.getBoundingClientRect()
  const targetRect = target.getBoundingClientRect()
  container.scrollTo({
    top: container.scrollTop + targetRect.top - containerRect.top - 8,
    behavior: 'smooth',
  })
  return true
}

function collectDirectoryKeys(nodes = []) {
  return nodes.flatMap((node) =>
    node.type === 'directory'
      ? [node.key, ...collectDirectoryKeys(node.children)]
      : []
  )
}

function readPinnedPaths(docs = []) {
  if (typeof window === 'undefined') {
    return getDefaultDevDocsPinnedPaths(docs)
  }

  try {
    const rawValue = window.localStorage.getItem(DEV_DOCS_PINNED_STORAGE_KEY)
    if (!rawValue) {
      return getDefaultDevDocsPinnedPaths(docs)
    }
    const parsedValue = JSON.parse(rawValue)
    return normalizeDevDocsPinnedPaths(
      Array.isArray(parsedValue) ? parsedValue : [],
      docs
    )
  } catch {
    return getDefaultDevDocsPinnedPaths(docs)
  }
}

function readSelectedKey(docs = [], search = '') {
  const querySelectedPath = normalizeDevDocsSelectedPath(
    readSelectedPathFromSearch(search),
    docs
  )
  if (querySelectedPath) {
    return (
      docs.find((item) => item.path === querySelectedPath)?.key ||
      docs[0]?.key ||
      ''
    )
  }

  if (typeof window === 'undefined') {
    return docs[0]?.key || ''
  }

  try {
    const selectedPath = normalizeDevDocsSelectedPath(
      window.localStorage.getItem(DEV_DOCS_SELECTED_PATH_STORAGE_KEY),
      docs
    )
    return (
      docs.find((item) => item.path === selectedPath)?.key || docs[0]?.key || ''
    )
  } catch {
    return docs[0]?.key || ''
  }
}

function readExpandedKeys(availableKeys = []) {
  const defaultKeys = normalizeDevDocsExpandedDirKeys(
    DEFAULT_EXPANDED_DIR_KEYS,
    availableKeys
  )
  if (typeof window === 'undefined') {
    return defaultKeys
  }

  try {
    const rawValue = window.localStorage.getItem(
      DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY
    )
    if (!rawValue) {
      return defaultKeys
    }
    const parsedValue = JSON.parse(rawValue)
    return normalizeDevDocsExpandedDirKeys(
      Array.isArray(parsedValue) ? parsedValue : [],
      availableKeys
    )
  } catch {
    return defaultKeys
  }
}

function readTocExpanded() {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const rawValue = window.localStorage.getItem(
      DEV_DOCS_TOC_EXPANDED_STORAGE_KEY
    )
    if (rawValue === null) {
      return false
    }
    return rawValue !== 'false'
  } catch {
    return false
  }
}

function DevDocsTreeNode({
  node,
  depth = 0,
  expandedKeys,
  selectedKey,
  onToggleDocPin,
  onToggleDirectory,
  onSelectDoc,
}) {
  if (node.type === 'directory') {
    const expanded = expandedKeys.has(node.key)
    return (
      <div className="erp-dev-docs-tree__node">
        <button
          type="button"
          data-dev-doc-dir={node.path}
          className="erp-dev-docs-tree__row erp-dev-docs-tree__folder"
          style={{ '--depth-offset': `${depth * 14}px` }}
          aria-expanded={expanded}
          onClick={() => onToggleDirectory(node.key)}
        >
          {expanded ? <DownOutlined /> : <RightOutlined />}
          {expanded ? <FolderOpenOutlined /> : <FolderOutlined />}
          <span className="erp-dev-docs-tree__name">{node.name}</span>
          <span className="erp-dev-docs-tree__count">{node.docCount}</span>
        </button>
        {expanded ? (
          <div className="erp-dev-docs-tree__children">
            {node.children.map((child) => (
              <DevDocsTreeNode
                key={child.key}
                node={child}
                depth={depth + 1}
                expandedKeys={expandedKeys}
                selectedKey={selectedKey}
                onToggleDocPin={onToggleDocPin}
                onToggleDirectory={onToggleDirectory}
                onSelectDoc={onSelectDoc}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }

  const active = node.item.key === selectedKey
  const pinned = Boolean(node.item.pinned)
  return (
    <div
      data-dev-doc-key={node.item.key}
      className={
        active
          ? 'erp-dev-docs-tree__doc-shell erp-dev-docs-tree__doc-shell--active'
          : 'erp-dev-docs-tree__doc-shell'
      }
      style={{ '--depth-offset': `${depth * 14}px` }}
    >
      <button
        type="button"
        className="erp-dev-docs-tree__row erp-dev-docs-tree__doc"
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelectDoc(node.item.key)}
      >
        <FileMarkdownOutlined />
        <span className="erp-dev-docs-tree__doc-copy">
          <span className="erp-dev-docs-tree__doc-title">
            {node.item.title}
          </span>
          <span className="erp-dev-docs-tree__doc-path">{node.item.path}</span>
        </span>
      </button>
      <Tooltip title={pinned ? '取消置顶' : '置顶文档'}>
        <button
          type="button"
          className={
            pinned
              ? 'erp-dev-docs-row-pin erp-dev-docs-row-pin--active'
              : 'erp-dev-docs-row-pin'
          }
          aria-label={
            pinned ? `取消置顶 ${node.item.title}` : `置顶 ${node.item.title}`
          }
          aria-pressed={pinned}
          onClick={() => onToggleDocPin(node.item)}
        >
          {pinned ? <PushpinFilled /> : <PushpinOutlined />}
        </button>
      </Tooltip>
    </div>
  )
}

export default function DevDocsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const docs = useMemo(() => buildDevDocsItems(markdownModules), [])
  const [sourceLoadState, setSourceLoadState] = useState({})
  const [sourceReloadToken, setSourceReloadToken] = useState(0)
  const sourceLoadRequestedRef = useRef(new Set())
  const docsWithSources = useMemo(
    () =>
      docs.map((item) => {
        const loaded = sourceLoadState[item.path]
        if (loaded?.status !== 'ready') {
          return item
        }
        return {
          ...item,
          source: loaded.source,
          title: getDevDocsTitle(loaded.source, item.path),
        }
      }),
    [docs, sourceLoadState]
  )
  const [pinnedPaths, setPinnedPaths] = useState(() => readPinnedPaths(docs))
  const docsWithPinnedState = useMemo(
    () => applyDevDocsPinnedState(docsWithSources, pinnedPaths),
    [docsWithSources, pinnedPaths]
  )
  const [lifecycle, setLifecycle] = useState(() =>
    readLifecycle(docs, location.search)
  )
  const lifecycleDocs = useMemo(
    () => filterDevDocsByLifecycle(docsWithPinnedState, lifecycle),
    [docsWithPinnedState, lifecycle]
  )
  const docTree = useMemo(
    () => buildDevDocsTree(lifecycleDocs),
    [lifecycleDocs]
  )
  const allDirectoryKeys = useMemo(
    () => collectDirectoryKeys(docTree),
    [docTree]
  )
  const [keyword, setKeyword] = useState('')
  const [searchScope, setSearchScope] = useState(DEV_DOCS_SEARCH_SCOPE_ALL)
  const [selectedKey, setSelectedKey] = useState(() =>
    readSelectedKey(
      filterDevDocsByLifecycle(
        docs,
        readLifecycle(docs, location.search)
      ),
      location.search
    )
  )
  const [expandedKeys, setExpandedKeys] = useState(
    () => new Set(readExpandedKeys(allDirectoryKeys))
  )
  const [tocExpanded, setTocExpanded] = useState(() => readTocExpanded())
  const markdownRef = useRef(null)

  const docsWithSearchText = useMemo(
    () =>
      lifecycleDocs.map((item) => ({
        ...item,
        searchText: item.source,
      })),
    [lifecycleDocs]
  )

  const visibleDocs = useMemo(
    () =>
      sortDevDocsItemsByPinned(
        filterDevDocsItems(docsWithSearchText, keyword, searchScope)
      ),
    [docsWithSearchText, keyword, searchScope]
  )
  const pinnedDocs = useMemo(
    () =>
      sortDevDocsItemsByPinned(
        lifecycleDocs.filter((item) => item.pinned)
      ),
    [lifecycleDocs]
  )
  const trimmedKeyword = keyword.trim()
  const isSearching = trimmedKeyword.length > 0
  const isTitleOnlySearch = searchScope === DEV_DOCS_SEARCH_SCOPE_TITLE
  const allExpanded =
    allDirectoryKeys.length > 0 &&
    allDirectoryKeys.every((key) => expandedKeys.has(key))

  const selectedDoc =
    (isSearching
      ? visibleDocs.find((item) => item.key === selectedKey)
      : lifecycleDocs.find((item) => item.key === selectedKey)) ||
    visibleDocs[0] ||
    (isSearching ? undefined : lifecycleDocs[0])
  const {
    path: selectedDocPath,
    source: selectedDocSource,
    loadSource: loadSelectedDocSource,
  } = selectedDoc || {}
  const selectedDocPinned = Boolean(selectedDoc?.pinned)
  const selectedSourceLoadState = selectedDocPath
    ? sourceLoadState[selectedDocPath]
    : undefined
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedDocSource || '', [1, 2, 3]),
    [selectedDocSource]
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        DEV_DOCS_PINNED_STORAGE_KEY,
        JSON.stringify(normalizeDevDocsPinnedPaths(pinnedPaths, docs))
      )
    } catch {
      // 本地偏好写入失败时不影响 dev docs 主路径浏览。
    }
  }, [docs, pinnedPaths])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        DEV_DOCS_LIFECYCLE_STORAGE_KEY,
        normalizeDevDocsLifecycle(lifecycle)
      )
    } catch {
      // 文档层级偏好写入失败时仍保持当前会话可浏览。
    }
  }, [lifecycle])

  useEffect(() => {
    if (
      !selectedDocPath ||
      !loadSelectedDocSource ||
      selectedDocSource ||
      sourceLoadRequestedRef.current.has(selectedDocPath)
    ) {
      return
    }

    const path = selectedDocPath
    sourceLoadRequestedRef.current.add(path)
    setSourceLoadState((current) => ({
      ...current,
      [path]: { status: 'loading' },
    }))

    Promise.resolve(loadSelectedDocSource())
      .then((value) => {
        const source =
          typeof value === 'string'
            ? value
            : typeof value?.default === 'string'
              ? value.default
              : ''
        if (!source) {
          throw new Error('文档内容为空')
        }
        setSourceLoadState((current) => ({
          ...current,
          [path]: { status: 'ready', source },
        }))
      })
      .catch((error) => {
        setSourceLoadState((current) => ({
          ...current,
          [path]: {
            status: 'error',
            message: error instanceof Error ? error.message : '加载失败',
          },
        }))
      })
  }, [
    loadSelectedDocSource,
    selectedDocPath,
    selectedDocSource,
    sourceReloadToken,
  ])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedDoc?.path) {
      return
    }
    try {
      window.localStorage.setItem(
        DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
        normalizeDevDocsSelectedPath(selectedDoc.path, docs)
      )
    } catch {
      // 当前文档偏好写入失败时不影响 dev docs 主路径浏览。
    }
  }, [docs, selectedDoc?.path])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
        JSON.stringify(
          normalizeDevDocsExpandedDirKeys([...expandedKeys], allDirectoryKeys)
        )
      )
    } catch {
      // 目录展开偏好写入失败时不影响 dev docs 主路径浏览。
    }
  }, [allDirectoryKeys, expandedKeys])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }
    try {
      window.localStorage.setItem(
        DEV_DOCS_TOC_EXPANDED_STORAGE_KEY,
        tocExpanded ? 'true' : 'false'
      )
    } catch {
      // 章节导航偏好写入失败时不影响 dev docs 主路径浏览。
    }
  }, [tocExpanded])

  useEffect(() => {
    const querySelectedPath = normalizeDevDocsSelectedPath(
      readSelectedPathFromSearch(location.search),
      docsWithPinnedState
    )
    if (querySelectedPath) {
      const querySelectedDoc = docsWithPinnedState.find(
        (item) => item.path === querySelectedPath
      )
      if (
        querySelectedDoc?.lifecycle &&
        querySelectedDoc.lifecycle !== lifecycle
      ) {
        setLifecycle(querySelectedDoc.lifecycle)
      }
      if (querySelectedDoc?.key && querySelectedDoc.key !== selectedKey) {
        setSelectedKey(querySelectedDoc.key)
      }
      return
    }

    if (selectedDoc?.path) {
      navigate(
        buildDevDocsLocation({
          pathname: location.pathname,
          search: location.search,
          path: selectedDoc.path,
        }),
        { replace: true }
      )
    }
  }, [
    docsWithPinnedState,
    location.pathname,
    location.search,
    lifecycle,
    navigate,
    selectedDoc?.path,
    selectedKey,
  ])

  useEffect(() => {
    const headingId = readHeadingIdFromHash(location.hash)
    if (headingId) {
      const timeoutId = window.setTimeout(
        () => scrollMarkdownContainerToHeading(markdownRef.current, headingId),
        120
      )
      return () => window.clearTimeout(timeoutId)
    }
    markdownRef.current?.scrollTo({ top: 0 })
    return undefined
  }, [location.hash, selectedDoc?.key])

  useEffect(() => {
    const container = markdownRef.current
    if (!container || !selectedDoc?.path) {
      return undefined
    }

    const handleMarkdownLinkClick = (event) => {
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor || !container.contains(anchor)) {
        return
      }

      const target = resolveDevDocsMarkdownHref(
        anchor.getAttribute('href'),
        selectedDoc.path
      )
      if (!target) {
        return
      }

      event.preventDefault()
      const targetPath = normalizeDevDocsSelectedPath(target.path, docs)
      if (!targetPath) {
        message.warning(`当前查看器未加载文档：${target.path}`)
        return
      }
      const targetDoc = docs.find((item) => item.path === targetPath)
      if (targetDoc?.lifecycle && targetDoc.lifecycle !== lifecycle) {
        setLifecycle(targetDoc.lifecycle)
      }

      const currentPath = normalizeDevDocsSelectedPath(
        readSelectedPathFromSearch(location.search),
        docs
      )
      const currentHeadingId = readHeadingIdFromHash(location.hash)
      if (targetPath === currentPath && target.headingId === currentHeadingId) {
        if (target.headingId) {
          scrollMarkdownContainerToHeading(container, target.headingId)
        } else {
          container.scrollTo({ top: 0, behavior: 'smooth' })
        }
        return
      }

      navigate(
        buildDevDocsLocation({
          pathname: location.pathname,
          search: location.search,
          path: targetPath,
          headingId: target.headingId,
        })
      )
    }

    container.addEventListener('click', handleMarkdownLinkClick)
    return () => container.removeEventListener('click', handleMarkdownLinkClick)
  }, [
    docs,
    location.hash,
    location.pathname,
    location.search,
    lifecycle,
    navigate,
    selectedDoc?.path,
  ])

  const copyPath = async () => {
    if (!selectedDoc?.path) {
      return
    }
    try {
      await navigator.clipboard.writeText(selectedDoc.path)
      message.success('已复制文档路径')
    } catch {
      message.error('复制失败，请手动选中文档路径')
    }
  }

  const toggleDirectory = (key) => {
    setExpandedKeys((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return new Set(
        normalizeDevDocsExpandedDirKeys([...next], allDirectoryKeys)
      )
    })
  }

  const toggleAllDirectories = () => {
    setExpandedKeys(
      allExpanded
        ? new Set(
            normalizeDevDocsExpandedDirKeys(
              DEFAULT_EXPANDED_DIR_KEYS,
              allDirectoryKeys
            )
          )
        : new Set(
            normalizeDevDocsExpandedDirKeys(allDirectoryKeys, allDirectoryKeys)
          )
    )
  }

  const toggleDocPin = (doc) => {
    if (!doc?.path) {
      return
    }

    setPinnedPaths((current) => {
      const normalizedCurrent = normalizeDevDocsPinnedPaths(current, docs)
      const next = normalizedCurrent.includes(doc.path)
        ? normalizedCurrent.filter((path) => path !== doc.path)
        : [doc.path, ...normalizedCurrent]
      return normalizeDevDocsPinnedPaths(next, docs)
    })
  }

  const selectDoc = (docKey) => {
    const doc = docsWithPinnedState.find((item) => item.key === docKey)
    if (!doc?.path) {
      return
    }
    if (doc.lifecycle !== lifecycle) {
      setLifecycle(doc.lifecycle)
    }
    setSelectedKey(docKey)
    navigate(
      buildDevDocsLocation({
        pathname: location.pathname,
        search: location.search,
        path: doc.path,
      })
    )
  }

  const selectLifecycle = (value) => {
    const nextLifecycle = normalizeDevDocsLifecycle(value)
    if (nextLifecycle === lifecycle) {
      return
    }
    setKeyword('')
    const nextDoc = filterDevDocsByLifecycle(
      docsWithPinnedState,
      nextLifecycle
    )[0]
    if (nextDoc) {
      selectDoc(nextDoc.key)
      return
    }
    setLifecycle(nextLifecycle)
  }

  const retrySelectedSource = () => {
    if (!selectedDoc?.path) {
      return
    }
    sourceLoadRequestedRef.current.delete(selectedDoc.path)
    setSourceLoadState((current) => {
      const next = { ...current }
      delete next[selectedDoc.path]
      return next
    })
    setSourceReloadToken((current) => current + 1)
  }

  const scrollReaderToTop = () => {
    if (!selectedDoc?.path) {
      return
    }
    if (!location.hash) {
      markdownRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    navigate(
      buildDevDocsLocation({
        pathname: location.pathname,
        search: location.search,
        path: selectedDoc.path,
      })
    )
  }

  const scrollToHeading = (headingId) => {
    if (!selectedDoc?.path || !headingId) {
      return
    }
    const currentHeadingId = readHeadingIdFromHash(location.hash)
    if (currentHeadingId === headingId) {
      scrollMarkdownContainerToHeading(markdownRef.current, headingId)
      return
    }
    navigate(
      buildDevDocsLocation({
        pathname: location.pathname,
        search: location.search,
        path: selectedDoc.path,
        headingId,
      })
    )
  }

  return (
    <div className="erp-dev-docs-page erp-dev-workspace-page">
      <DevPageNav />
      <header className="erp-dev-docs-header">
        <div className="erp-dev-docs-header__copy">
          <Space align="center" size={10} wrap>
            <BookOutlined className="erp-dev-docs-header__icon" />
            <Title level={1} className="erp-dev-docs-title">
              开发文档查看器 / Dev Docs Viewer
            </Title>
            <Tag color="green">仅开发环境 / DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-docs-summary">
            默认只看当前合同；评审参考与历史证据分层浏览，避免旧结论混入当前搜索。
          </Paragraph>
          <details className="erp-dev-docs-boundary-details">
            <summary>查看收录范围与维护边界</summary>
            <Paragraph>
              查看器只读加载当前工作区内已匹配的 Markdown；历史正文仅在打开时加载。
              文件可见不代表已经纳入 Git，也不代表内容是 runtime、schema、权限、发布或客户验收真源。
            </Paragraph>
          </details>
        </div>
      </header>

      <main className="erp-dev-docs-shell">
        <aside className="erp-dev-docs-sidebar">
          <Text className="erp-dev-docs-sidebar__hint">
            先搜索；找不到再展开目录
          </Text>
          <div className="erp-dev-docs-lifecycle">
            <Text type="secondary">文档层级</Text>
            <Segmented
              size="small"
              block
              aria-label="开发文档层级"
              className="erp-dev-docs-lifecycle__control"
              options={LIFECYCLE_OPTIONS}
              value={lifecycle}
              onChange={selectLifecycle}
            />
            <Text type="secondary" className="erp-dev-docs-lifecycle__count">
              {lifecycleDocs.length} / {docs.length} 篇
            </Text>
          </div>
          <SearchInput
            allowClear
            aria-label="搜索开发文档"
            value={keyword}
            placeholder="搜索开发文档"
            searchHint={
              isTitleOnlySearch
                ? '当前仅搜索文档标题；切换“全部”可搜索路径和正文'
                : lifecycle === DEV_DOCS_LIFECYCLE_ARCHIVE
                  ? '历史正文按需加载；未打开的历史文档先按标题和路径搜索'
                  : '当前层级搜索标题、路径或正文；不搜索时按目录树浏览'
            }
            onChange={(event) => setKeyword(event.target.value)}
            className="erp-dev-docs-search"
          />
          <div className="erp-dev-docs-search-scope">
            <Text type="secondary">搜索范围</Text>
            <Segmented
              size="small"
              aria-label="开发文档搜索范围"
              className="erp-dev-docs-search-scope__control"
              options={SEARCH_SCOPE_OPTIONS}
              value={searchScope}
              onChange={setSearchScope}
            />
          </div>

          {pinnedDocs.length > 0 ? (
            <details className="erp-dev-docs-sidebar__section erp-dev-docs-pinned erp-dev-docs-pinned-disclosure">
              <summary>
                <span>
                  <PushpinOutlined className="erp-dev-docs-sidebar__section-icon" />
                  置顶文档
                </span>
                <span>{pinnedDocs.length}</span>
              </summary>
              <div className="erp-dev-docs-pinned__list">
                {pinnedDocs.map((item) => (
                  <div
                    key={item.key}
                    data-dev-doc-pinned-key={item.key}
                    className={
                      item.key === selectedDoc?.key
                        ? 'erp-dev-docs-pinned__item erp-dev-docs-pinned__item--active'
                        : 'erp-dev-docs-pinned__item'
                    }
                  >
                    <button
                      type="button"
                      className="erp-dev-docs-pinned__open"
                      aria-current={
                        item.key === selectedDoc?.key ? 'true' : undefined
                      }
                      onClick={() => selectDoc(item.key)}
                    >
                      <FileMarkdownOutlined />
                      <span className="erp-dev-docs-pinned__copy">
                        <span className="erp-dev-docs-pinned__title">
                          {item.title}
                        </span>
                        <span className="erp-dev-docs-pinned__path">
                          {item.path}
                        </span>
                      </span>
                    </button>
                    <Tooltip title="取消置顶">
                      <button
                        type="button"
                        className="erp-dev-docs-row-pin erp-dev-docs-row-pin--active erp-dev-docs-row-pin--pinned"
                        aria-label={`取消置顶 ${item.title}`}
                        aria-pressed
                        onClick={() => toggleDocPin(item)}
                      >
                        <PushpinFilled />
                      </button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {isSearching ? (
            <section className="erp-dev-docs-sidebar__section erp-dev-docs-sidebar__section--results">
              <div className="erp-dev-docs-sidebar__section-head">
                <Text strong>搜索结果 / Search Results</Text>
                <Text type="secondary">
                  {visibleDocs.length} / {lifecycleDocs.length}
                </Text>
              </div>
              <div className="erp-dev-docs-list">
                {visibleDocs.length > 0 ? (
                  visibleDocs.map((item) => (
                    <div
                      key={item.key}
                      data-dev-doc-key={item.key}
                      className={
                        item.key === selectedDoc?.key
                          ? 'erp-dev-docs-list__item erp-dev-docs-list__item--active'
                          : 'erp-dev-docs-list__item'
                      }
                    >
                      <button
                        type="button"
                        className="erp-dev-docs-list__open"
                        aria-current={
                          item.key === selectedDoc?.key ? 'true' : undefined
                        }
                        onClick={() => selectDoc(item.key)}
                      >
                        <span className="erp-dev-docs-list__title">
                          <FileMarkdownOutlined />
                          {item.title}
                        </span>
                        <span className="erp-dev-docs-list__meta">
                          <Tag
                            color={item.pinned ? 'green' : 'default'}
                            className="erp-dev-docs-list__tag"
                          >
                            {item.pinned ? '置顶' : item.group}
                          </Tag>
                          {item.pinned ? (
                            <Tag className="erp-dev-docs-list__tag">
                              {item.group}
                            </Tag>
                          ) : null}
                          <Tag className="erp-dev-docs-list__tag">
                            {LIFECYCLE_LABELS[item.lifecycle]}
                          </Tag>
                        </span>
                        <span className="erp-dev-docs-list__path">
                          {item.path}
                        </span>
                      </button>
                      <Tooltip title={item.pinned ? '取消置顶' : '置顶文档'}>
                        <button
                          type="button"
                          className={
                            item.pinned
                              ? 'erp-dev-docs-row-pin erp-dev-docs-row-pin--active'
                              : 'erp-dev-docs-row-pin'
                          }
                          aria-label={
                            item.pinned
                              ? `取消置顶 ${item.title}`
                              : `置顶 ${item.title}`
                          }
                          aria-pressed={item.pinned}
                          onClick={() => toggleDocPin(item)}
                        >
                          {item.pinned ? (
                            <PushpinFilled />
                          ) : (
                            <PushpinOutlined />
                          )}
                        </button>
                      </Tooltip>
                    </div>
                  ))
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      isTitleOnlySearch
                        ? '标题中没有匹配文档，可切换到“全部”搜索路径和正文'
                        : '没有匹配的文档'
                    }
                  />
                )}
              </div>
            </section>
          ) : (
            <section className="erp-dev-docs-sidebar__section erp-dev-docs-sidebar__section--tree">
              <div className="erp-dev-docs-sidebar__section-head">
                <Text strong>按目录找</Text>
                <Space size={6}>
                  <Text type="secondary">
                    {lifecycleDocs.length} / {docs.length} 篇
                  </Text>
                  <Button
                    size="small"
                    type="text"
                    onClick={toggleAllDirectories}
                  >
                    {allExpanded ? '收起全部' : '展开全部'}
                  </Button>
                </Space>
              </div>
              <div className="erp-dev-docs-tree" aria-label="开发文档目录树">
                {docTree.map((node) => (
                  <DevDocsTreeNode
                    key={node.key}
                    node={node}
                    expandedKeys={expandedKeys}
                    selectedKey={selectedDoc?.key}
                    onToggleDocPin={toggleDocPin}
                    onToggleDirectory={toggleDirectory}
                    onSelectDoc={selectDoc}
                  />
                ))}
              </div>
            </section>
          )}
        </aside>

        <section className="erp-dev-docs-reader">
          {selectedDoc ? (
            <div className="erp-dev-docs-reader__toolbar">
              <div className="erp-dev-docs-reader__title">
                <Space size={6} wrap>
                  <Text strong>{selectedDoc.title}</Text>
                  <Tag>{LIFECYCLE_LABELS[selectedDoc.lifecycle]}</Tag>
                </Space>
                <Text type="secondary" className="erp-dev-docs-reader__path">
                  {selectedDoc.path}
                </Text>
              </div>
              <Space size={8} wrap>
                <Tooltip title={selectedDocPinned ? '取消置顶' : '置顶文档'}>
                  <Button
                    type="text"
                    shape="circle"
                    className={
                      selectedDocPinned
                        ? 'erp-dev-docs-pin-button erp-dev-docs-pin-button--active'
                        : 'erp-dev-docs-pin-button'
                    }
                    icon={
                      selectedDocPinned ? (
                        <PushpinFilled />
                      ) : (
                        <PushpinOutlined />
                      )
                    }
                    aria-label={selectedDocPinned ? '取消置顶' : '置顶文档'}
                    aria-pressed={selectedDocPinned}
                    onClick={() => toggleDocPin(selectedDoc)}
                  />
                </Tooltip>
                <Button
                  icon={<VerticalAlignTopOutlined />}
                  onClick={scrollReaderToTop}
                >
                  回到顶部 / Top
                </Button>
                <Button icon={<CopyOutlined />} onClick={copyPath}>
                  复制路径 / Copy Path
                </Button>
              </Space>
            </div>
          ) : null}

          {headings.length > 0 ? (
            <div className="erp-dev-docs-toc-shell">
              <div className="erp-dev-docs-toc-shell__head">
                <Text strong>本页章节</Text>
                <Button
                  size="small"
                  type="text"
                  data-dev-doc-toc-toggle
                  aria-expanded={tocExpanded}
                  onClick={() => setTocExpanded((current) => !current)}
                >
                  {tocExpanded ? '收起为一行' : '展开全部'}
                </Button>
              </div>
              <div
                className={
                  tocExpanded
                    ? 'erp-dev-docs-toc erp-dev-docs-toc--expanded'
                    : 'erp-dev-docs-toc erp-dev-docs-toc--collapsed'
                }
                aria-label="文档章节"
              >
                {headings.slice(0, 16).map((heading) => (
                  <button
                    type="button"
                    key={heading.id}
                    className="erp-dev-docs-toc__tag"
                    data-dev-doc-heading-id={heading.id}
                    onClick={() => scrollToHeading(heading.id)}
                  >
                    {heading.title}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {selectedDoc?.source ? (
            <article className="erp-dev-docs-markdown" ref={markdownRef}>
              <Markdown source={selectedDoc.source} />
            </article>
          ) : selectedDoc && selectedSourceLoadState?.status === 'error' ? (
            <div className="erp-dev-docs-markdown erp-dev-docs-reader-state">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={`历史正文加载失败：${selectedSourceLoadState.message}`}
              >
                <Button onClick={retrySelectedSource}>重新加载</Button>
              </Empty>
            </div>
          ) : selectedDoc ? (
            <div className="erp-dev-docs-markdown erp-dev-docs-reader-state">
              <Space direction="vertical" align="center" size="small">
                <Spin />
                <Typography.Text type="secondary">
                  正在加载历史正文…
                </Typography.Text>
              </Space>
            </div>
          ) : (
            <div className="erp-dev-docs-markdown">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配的文档，阅读操作已隐藏"
              />
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
