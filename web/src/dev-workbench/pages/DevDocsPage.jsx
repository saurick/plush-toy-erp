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
import { Button, Empty, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_DOCS_ROUTE } from '../config/devRoutes.mjs'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SearchInput from '@/common/components/SearchInput'
import { Markdown, extractMarkdownHeadings } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import DevPageNav from '../components/DevPageNav.jsx'
import {
  DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
  DEV_DOCS_HOME_PATH,
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
  getDevDocsDisplayTitle,
  getDefaultDevDocsPinnedPaths,
  normalizeDevDocsLifecycle,
  normalizeDevDocsExpandedDirKeys,
  normalizeDevDocsPinnedPaths,
  normalizeDevDocsSelectedPath,
  sortDevDocsItemsByPinned,
} from '../config/devDocs.mjs'
import {
  buildDevDocsLocation,
  findDevDocsMarkdownAnchor,
  resolveDevDocsMarkdownHref,
  resolveDevDocsReadingHeading,
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
    '../../../../.agents/skills/**/*.md',
    '../../../README.md',
    '../../../scripts/README.md',
    '../../../dev-server/README.md',
    '../../../../server/README.md',
    '../../../../server/docs/**/*.md',
    '../../../../server/deploy/README.md',
    '../../../../server/deploy/compose/prod/README.md',
    '../../../../server/deploy/gitlab/README.md',
    '../../../../scripts/README.md',
    '../../../../scripts/qa/README.md',
    '../../../../scripts/deploy/README.md',
    '../../../../scripts/import/README.md',
    '../../../../deployments/README.md',
    '../../../../deployments/*/README.md',
    '../../../../deployments/*/runbooks/*.md',
    '../../../../deployments/*/checklists/*.md',
    '../../../../config/customers/**/*.md',
    '../../../../docs/**/*.md',
    '!../../../../docs/archive/**/*.md',
    '!../../../../docs/customers/*/甲方反馈记录.md',
  ],
  {
    eager: true,
    import: 'default',
    query: '?dev-doc-meta',
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

  const target = findDevDocsMarkdownAnchor(container, headingId)
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
          title={node.path}
          className="erp-dev-docs-tree__row erp-dev-docs-tree__folder"
          style={{ '--depth-offset': `${depth * 14}px` }}
          aria-expanded={expanded}
          onClick={() => onToggleDirectory(node.key)}
        >
          {expanded ? <DownOutlined /> : <RightOutlined />}
          {expanded ? <FolderOpenOutlined /> : <FolderOutlined />}
          <span className="erp-dev-docs-tree__name">{node.label}</span>
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
        title={`${node.item.title}\n${node.item.path}`}
        aria-current={active ? 'true' : undefined}
        onClick={() => onSelectDoc(node.item.key)}
      >
        <FileMarkdownOutlined />
        <span className="erp-dev-docs-tree__doc-copy">
          <span className="erp-dev-docs-tree__doc-title">
            {getDevDocsDisplayTitle(node.item.title)}
          </span>
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
  const [fallbackSelection, setFallbackSelection] = useState(() => {
    const lifecycle = readLifecycle(docs, location.search)
    return {
      lifecycle,
      key: readSelectedKey(
        filterDevDocsByLifecycle(docs, lifecycle),
        location.search
      ),
    }
  })
  const querySelectedPath = normalizeDevDocsSelectedPath(
    readSelectedPathFromSearch(location.search),
    docs
  )
  const querySelectedDoc = docsWithPinnedState.find(
    (item) => item.path === querySelectedPath
  )
  const lifecycle = querySelectedDoc?.lifecycle || fallbackSelection.lifecycle
  const selectedKey = querySelectedDoc?.key || fallbackSelection.key
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
  const [expandedKeys, setExpandedKeys] = useState(
    () => new Set(readExpandedKeys(allDirectoryKeys))
  )
  const [tocExpanded, setTocExpanded] = useState(() => readTocExpanded())
  const markdownRef = useRef(null)
  const tocRef = useRef(null)
  const [readingHeading, setReadingHeading] = useState(null)
  const treeRef = useRef(null)
  const pendingTreeRevealRef = useRef('')

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
    () => sortDevDocsItemsByPinned(lifecycleDocs.filter((item) => item.pinned)),
    [lifecycleDocs]
  )
  const trimmedKeyword = keyword.trim()
  const isSearching = trimmedKeyword.length > 0
  const fullTextSearchPending = isSearching && searchScope === DEV_DOCS_SEARCH_SCOPE_ALL && lifecycleDocs.some((item) => item.loadSource && !item.source && sourceLoadState[item.path]?.status !== 'error')
  const isTitleOnlySearch = searchScope === DEV_DOCS_SEARCH_SCOPE_TITLE
  const allExpanded =
    allDirectoryKeys.length > 0 &&
    allDirectoryKeys.every((key) => expandedKeys.has(key))

  const selectedDoc =
    (isSearching ? visibleDocs : lifecycleDocs).find(
      (item) => item.key === selectedKey
    ) || (isSearching ? undefined : visibleDocs[0] || lifecycleDocs[0])
  const { path: selectedDocPath, source: selectedDocSource } = selectedDoc || {}
  const selectedDocPinned = Boolean(selectedDoc?.pinned)
  const selectedSourceLoadState = selectedDocPath
    ? sourceLoadState[selectedDocPath]
    : undefined
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedDocSource || '', [1, 2, 3, 4, 5, 6]),
    [selectedDocSource]
  )
  const titleHeadingId =
    headings[0]?.level === 1 && headings[0].title === selectedDoc?.title
      ? headings[0].id
      : ''
  const tocHeadings = titleHeadingId ? headings.slice(1) : headings
  const activeHeadingId =
    readingHeading?.path === selectedDocPath &&
    headings.some((heading) => heading.id === readingHeading.id)
      ? readingHeading.id
      : readHeadingIdFromHash(location.hash) || headings[0]?.id || ''

  useEffect(() => {
    const container = markdownRef.current
    if (!container || !selectedDocSource || headings.length === 0) return undefined
    const anchors = headings
      .map((heading) => findDevDocsMarkdownAnchor(container, heading.id))
      .filter(Boolean)
    let frame
    const update = () => {
      const { top } = container.getBoundingClientRect()
      const id = resolveDevDocsReadingHeading(
        anchors.map((anchor) => ({
          id: anchor.id,
          top: anchor.getBoundingClientRect().top - top + container.scrollTop,
        })),
        container
      )
      // 阅读位置只更新章节提示，不改写 URL 或增加历史记录。
      setReadingHeading((current) =>
        current?.path === selectedDocPath && current.id === id
          ? current
          : { path: selectedDocPath, id }
      )
    }
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }
    container.addEventListener('scroll', schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    schedule()
    return () => {
      window.cancelAnimationFrame(frame)
      container.removeEventListener('scroll', schedule)
      observer.disconnect()
    }
  }, [headings, selectedDocPath, selectedDocSource])

  useEffect(() => {
    tocRef.current
      ?.querySelector('[aria-current="location"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeHeadingId, tocExpanded])

  useEffect(() => {
    pendingTreeRevealRef.current = selectedDocPath || ''
    if (!selectedDocPath) return
    const segments = selectedDocPath.split('/').slice(0, -1)
    const parentKeys = segments.map((_, index) =>
      `dir:${segments.slice(0, index + 1).join('/')}`
    )
    setExpandedKeys((current) => parentKeys.some((key) => !current.has(key))
      ? new Set([...current, ...parentKeys])
      : current)
  }, [selectedDocPath])

  useEffect(() => {
    if (isSearching || !pendingTreeRevealRef.current) return
    const current = treeRef.current?.querySelector('[aria-current="true"]')
    if (!current) return
    current.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    pendingTreeRevealRef.current = ''
  }, [selectedDocPath, expandedKeys, isSearching])

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
    const searchAllSources =
      keyword.trim() && searchScope === DEV_DOCS_SEARCH_SCOPE_ALL
    const pendingDocs = searchAllSources
      ? lifecycleDocs
      : [selectedDoc].filter(Boolean)
    for (const item of pendingDocs) {
      if (
        !item.loadSource ||
        item.source ||
        sourceLoadRequestedRef.current.has(item.path)
      ) {
        continue
      }
      const { path } = item
      sourceLoadRequestedRef.current.add(path)
      setSourceLoadState((current) => ({
        ...current,
        [path]: { status: 'loading' },
      }))

      Promise.resolve()
        .then(() => item.loadSource())
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
        .catch(() => {
          setSourceLoadState((current) => ({
            ...current,
            [path]: {
              status: 'error',
              message: '文档正文加载失败，请重试',
            },
          }))
        })
    }
  }, [selectedDoc, lifecycleDocs, keyword, searchScope, sourceReloadToken])

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
    if (!querySelectedPath && selectedDoc?.path) {
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
    location.pathname,
    location.search,
    navigate,
    querySelectedPath,
    selectedDoc?.path,
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
  }, [location.hash, selectedDoc?.key, selectedDoc?.source])

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
    navigate,
    selectedDoc?.path,
    selectedDoc?.source,
  ])

  const copyPath = async () => {
    if (!selectedDoc?.path) {
      return
    }
    try {
      await copyTextToClipboard(selectedDoc.path)
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
    setFallbackSelection({ lifecycle: nextLifecycle, key: '' })
    navigate(
      buildDevDocsLocation({
        pathname: location.pathname,
        search: location.search,
        path: '',
      })
    )
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
    <div className="erp-dev-docs-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav />
      <header className="erp-dev-docs-header">
        <div className="erp-dev-docs-header__copy">
          <Space align="center" size={10} wrap>
            <BookOutlined className="erp-dev-docs-header__icon" />
            <Title level={1} className="erp-dev-docs-title">
              {DEV_PAGE_TITLE_BY_ROUTE[DEV_DOCS_ROUTE]}
            </Title>
          </Space>
          <Button
            type="link"
            onClick={() => {
              setKeyword('')
              selectDoc(`doc:${DEV_DOCS_HOME_PATH}`)
            }}
          >
            文档首页
          </Button>
          <details className="erp-dev-docs-boundary-details">
            <summary>收录范围</summary>
            <Paragraph>
              {
                '只读加载当前工作区的 Markdown；历史正文在打开或全文搜索时加载。 '
              }
              收录不代表已纳入 Git；实现、运行和验收仍需核对对应证据。
            </Paragraph>
          </details>
        </div>
        <div className="erp-dev-docs-controls" role="group" aria-label="项目文档检索">
          <div className="erp-dev-docs-lifecycle">
            <Segmented
              size="small"
              aria-label="项目文档层级"
              className="erp-dev-docs-lifecycle__control"
              options={LIFECYCLE_OPTIONS}
              value={lifecycle}
              onChange={selectLifecycle}
            />
          </div>
          <SearchInput
            allowClear
            aria-label="搜索项目文档"
            value={keyword}
            placeholder="搜索项目文档"
            searchHint={
              isTitleOnlySearch
                ? '当前仅搜索文档标题；切换“全部”可搜索路径和正文'
                : '搜索时按需加载当前层级正文，匹配标题、路径和完整正文'
            }
            onChange={(event) => setKeyword(event.target.value)}
            className="erp-dev-docs-search"
          />
          <div className="erp-dev-docs-search-scope">
            <Segmented
              size="small"
              aria-label="项目文档搜索范围"
              className="erp-dev-docs-search-scope__control"
              options={SEARCH_SCOPE_OPTIONS}
              value={searchScope}
              onChange={setSearchScope}
            />
          </div>

          {keyword.trim() &&
          searchScope === DEV_DOCS_SEARCH_SCOPE_ALL &&
          lifecycleDocs.some(
            (item) =>
              item.loadSource &&
              !item.source &&
              sourceLoadState[item.path]?.status !== 'error'
          ) ? (
            <Space role="status">
              <Spin size="small" />
              <Text type="secondary">正在检索完整正文</Text>
            </Space>
          ) : null}
          {keyword.trim() &&
          searchScope === DEV_DOCS_SEARCH_SCOPE_ALL &&
          lifecycleDocs.some(
            (item) => sourceLoadState[item.path]?.status === 'error'
          ) ? (
            <Button
              size="small"
              onClick={() => {
                for (const item of lifecycleDocs) {
                  if (sourceLoadState[item.path]?.status === 'error') {
                    sourceLoadRequestedRef.current.delete(item.path)
                  }
                }
                setSourceReloadToken((value) => value + 1)
              }}
            >
              部分正文加载失败，重新检索
            </Button>
          ) : null}
        </div>
      </header>

      <main className="erp-dev-docs-shell">
        <aside className="erp-dev-docs-sidebar">
          {pinnedDocs.length > 0 ? (
            <details className="erp-dev-docs-sidebar__section erp-dev-docs-pinned erp-dev-docs-pinned-disclosure">
              <summary>
                <span>
                  <PushpinOutlined className="erp-dev-docs-sidebar__section-icon" />
                  置顶文档
                </span>
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
                      title={`${item.title}\n${item.path}`}
                      aria-current={
                        item.key === selectedDoc?.key ? 'true' : undefined
                      }
                      onClick={() => selectDoc(item.key)}
                    >
                      <FileMarkdownOutlined />
                      <span className="erp-dev-docs-pinned__copy">
                        <span className="erp-dev-docs-pinned__title">
                          {getDevDocsDisplayTitle(item.title)}
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
                <Text strong>搜索结果</Text>
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
                        title={item.title}
                        aria-current={
                          item.key === selectedDoc?.key ? 'true' : undefined
                        }
                        onClick={() => selectDoc(item.key)}
                      >
                        <span className="erp-dev-docs-list__title">
                          <FileMarkdownOutlined />
                          {getDevDocsDisplayTitle(item.title)}
                        </span>
                        <span className="erp-dev-docs-list__meta">
                          <Tag className="erp-dev-docs-list__tag">
                            {item.group}
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
                      fullTextSearchPending
                        ? '正在检索完整正文'
                        : isTitleOnlySearch
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
              <div ref={treeRef} className="erp-dev-docs-tree" aria-label="项目文档目录树">
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
                <Text
                  strong
                  className="erp-dev-docs-reader__name"
                  title={selectedDoc.title}
                >
                  {getDevDocsDisplayTitle(selectedDoc.title)}
                </Text>
                {selectedDoc.lifecycle !== DEV_DOCS_LIFECYCLE_CURRENT ? (
                  <Tag className="erp-dev-docs-reader__lifecycle">
                    {LIFECYCLE_LABELS[selectedDoc.lifecycle]}
                  </Tag>
                ) : null}
                <Text
                  type="secondary"
                  className="erp-dev-docs-reader__path"
                  title={selectedDoc.path}
                >
                  {selectedDoc.path}
                </Text>
              </div>
              <Space size={6} className="erp-dev-docs-reader__actions">
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
                  className="erp-dev-docs-reader__top"
                  icon={<VerticalAlignTopOutlined aria-hidden="true" />}
                  aria-current={titleHeadingId && activeHeadingId === titleHeadingId ? 'location' : undefined}
                  onClick={scrollReaderToTop}
                >
                  回到顶部
                </Button>
                <Button icon={<CopyOutlined aria-hidden="true" />} onClick={copyPath}>
                  复制路径
                </Button>
              </Space>
            </div>
          ) : null}

          {tocHeadings.length > 0 ? (
            <div className={tocExpanded ? 'erp-dev-docs-toc-shell erp-dev-docs-toc-shell--expanded' : 'erp-dev-docs-toc-shell'}>
              <Text strong className="erp-dev-docs-toc-shell__label">章节</Text>
              <div
                id="dev-docs-chapters"
                className={
                  tocExpanded
                    ? 'erp-dev-docs-toc erp-dev-docs-toc--expanded'
                    : 'erp-dev-docs-toc erp-dev-docs-toc--collapsed'
                }
                aria-label="文档章节"
                ref={tocRef}
              >
                {tocHeadings.map((heading) => (
                  <button
                    type="button"
                    key={heading.id}
                    className="erp-dev-docs-toc__tag"
                    data-dev-doc-heading-id={heading.id}
                    data-dev-doc-heading-level={heading.level}
                    style={{ '--heading-depth': Math.max(0, heading.level - 2) }}
                    aria-current={heading.id === activeHeadingId ? 'location' : undefined}
                    title={heading.title}
                    onClick={() => scrollToHeading(heading.id)}
                  >
                    {getDevDocsDisplayTitle(heading.title)}
                  </button>
                ))}
              </div>
              <Button
                size="small"
                type="text"
                className="erp-dev-docs-toc-shell__toggle"
                data-dev-doc-toc-toggle
                aria-controls="dev-docs-chapters"
                aria-expanded={tocExpanded}
                onClick={() => setTocExpanded((current) => !current)}
              >
                {tocExpanded ? '收起为一行' : '展开全部'}
              </Button>
            </div>
          ) : null}

          {selectedDoc?.source ? (
            <article className="erp-dev-docs-markdown" ref={markdownRef}>
              <div className="erp-dev-docs-document">
                <Markdown source={selectedDoc.source} />
              </div>
            </article>
          ) : selectedDoc && selectedSourceLoadState?.status === 'error' ? (
            <div className="erp-dev-docs-markdown erp-dev-docs-reader-state">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={selectedSourceLoadState.message}
              >
                <Button onClick={retrySelectedSource}>重新加载</Button>
              </Empty>
            </div>
          ) : selectedDoc ? (
            <div className="erp-dev-docs-markdown erp-dev-docs-reader-state">
              <Space direction="vertical" align="center" size="small">
                <Spin />
                <Typography.Text type="secondary">
                  正在加载文档正文…
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
