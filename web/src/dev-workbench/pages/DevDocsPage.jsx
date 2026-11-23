import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  BookOutlined,
  CopyOutlined,
  FileMarkdownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  PushpinFilled,
  PushpinOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SupplementalHelp from '@/common/components/help/SupplementalHelp.jsx'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_DOCS_ROUTE } from '../config/devRoutes.mjs'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import SearchInput from '@/common/components/SearchInput'
import { Markdown, extractMarkdownHeadings } from '@/common/components/markdown'
import BusinessFormSectionTitle from '@/erp/components/business-list/BusinessFormSectionTitle.jsx'
import { message } from '@/common/utils/antdApp'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import DevDocsLayout from '../components/DevDocsLayout.jsx'
import Directory, { DirectoryBranch, DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
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
  applyDevDocsPinnedState,
  applyDevDocsSourceState,
  buildDevDocsItems,
  buildDevDocsTree,
  filterDevDocsByLifecycle,
  filterDevDocsItems,
  getDevDocsDisplayTitle,
  getDefaultDevDocsPinnedPaths,
  normalizeDevDocsLifecycle,
  normalizeDevDocsExpandedDirKeys,
  normalizeDevDocsPinnedPaths,
  normalizeDevDocsSelectedPath,
  sortDevDocsItemsByPinned,
} from '../config/devDocs.mjs'
import {
  buildDevDocsChapterOutline,
  buildDevDocsLocation,
  findDevDocsMarkdownAnchor,
  resolveDevDocsMarkdownHref,
  resolveDevDocsReadingHeading,
} from './devDocsNavigation.mjs'

const { Text, Title } = Typography
const DOCS_SECTION_SELECTOR = 'details.erp-dev-docs-section'

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

const docs = buildDevDocsItems({
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

function getHeadingScrollTop(container, headingTop) {
  return Math.max(0, Math.min(headingTop - 8, container.scrollHeight - container.clientHeight))
}

function getMarkdownHeadingTop(heading) {
  const summary = heading.closest(`${DOCS_SECTION_SELECTOR} > summary`)
  return (summary ?? heading).getBoundingClientRect().top
}

function scrollMarkdownContainerToHeading(container, headingId, { reveal = false } = {}) {
  const anchor = headingId ? findDevDocsMarkdownAnchor(container, headingId) : null
  if (headingId && !anchor) return null

  const target = anchor?.closest('[data-markdown-anchor="heading"]') ?? anchor
  const section = reveal && target?.closest(DOCS_SECTION_SELECTOR)
  if (section) section.open = true
  const scrollTop = target
    ? getHeadingScrollTop(
      container,
      container.scrollTop + getMarkdownHeadingTop(target) - container.getBoundingClientRect().top
    )
    : 0
  container.scrollTo({ top: scrollTop, behavior: 'instant' })
  return { id: target?.id, scrollTop }
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
  const defaultKeys = availableKeys
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
    return Array.isArray(parsedValue)
      ? normalizeDevDocsExpandedDirKeys(parsedValue, availableKeys)
      : defaultKeys
  } catch {
    return defaultKeys
  }
}

function DevDocsTreeNode({
  node,
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
        <DirectoryItem
          data-dev-doc-dir={node.path}
          title={node.path}
          className="erp-dev-docs-tree__row"
          expanded={expanded}
          onClick={() => onToggleDirectory(node.key)}
        >
          {expanded ? <FolderOpenOutlined /> : <FolderOutlined />}
          <span className="erp-dev-docs-tree__name">{node.label}</span>
          <span className="erp-dev-docs-tree__count">{node.docCount}</span>
        </DirectoryItem>
        {expanded ? (
          <DirectoryBranch>
            {node.children.map((child) => (
              <DevDocsTreeNode
                key={child.key}
                node={child}
                expandedKeys={expandedKeys}
                selectedKey={selectedKey}
                onToggleDocPin={onToggleDocPin}
                onToggleDirectory={onToggleDirectory}
                onSelectDoc={onSelectDoc}
              />
            ))}
          </DirectoryBranch>
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
    >
      <DirectoryItem
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
      </DirectoryItem>
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

function DevDocsChapterNavigation({ chapters, activeLocation, onOpenHeading }) {
  const tocRef = useRef(null)
  const [sectionsExpanded, setSectionsExpanded] = useState(true)
  const hasSections = chapters.some(({ sections }) => sections.length > 0)
  const { chapterId, tocHeadingId } = activeLocation ?? {}
  const currentItemId = sectionsExpanded ? tocHeadingId : chapterId

  useEffect(() => {
    const toc = tocRef.current
    if (!toc) return
    const currentItem = toc.querySelector('[aria-current="location"]')
    if (!currentItem) {
      toc.scrollTop = 0
      return
    }

    const listBox = toc.getBoundingClientRect()
    const itemBox = currentItem.getBoundingClientRect()
    if (itemBox.top < listBox.top) {
      toc.scrollTop += itemBox.top - listBox.top
    } else if (itemBox.bottom > listBox.bottom) {
      toc.scrollTop += itemBox.bottom - listBox.bottom
    }
  }, [chapters, currentItemId, sectionsExpanded])

  const renderTocHeading = (heading) => (
    <DirectoryItem
      className="erp-dev-docs-toc__item"
      data-dev-doc-heading-id={heading.id}
      aria-current={heading.id === currentItemId ? 'location' : undefined}
      title={heading.title}
      onClick={() => onOpenHeading(heading.id)}
    >
      <span>{getDevDocsDisplayTitle(heading.title)}</span>
    </DirectoryItem>
  )

  if (chapters.length === 0) return null

  return (
    <Directory
      className="erp-dev-docs-toc-shell"
      aria-label="文档章节"
      headerClassName="erp-dev-docs-sidebar__section-head erp-dev-docs-toc__header"
      title={<Text strong>章节目录</Text>}
      allExpanded={sectionsExpanded}
      onToggleAll={hasSections ? () => setSectionsExpanded((expanded) => !expanded) : undefined}
    >
      <ul className="erp-directory-list erp-dev-docs-toc" ref={tocRef}>
        {chapters.map(({ heading, sections }) => (
          <li key={heading.id}>
            {renderTocHeading(heading)}
            {sections.length > 0 ? (
              <DirectoryBranch as="ul" hidden={!sectionsExpanded}>
                {sections.map((section) => (
                  <li key={section.id}>{renderTocHeading(section)}</li>
                ))}
              </DirectoryBranch>
            ) : null}
          </li>
        ))}
      </ul>
    </Directory>
  )
}

export default function DevDocsPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const [sourceLoadState, setSourceLoadState] = useState({})
  const [sourceReloadToken, setSourceReloadToken] = useState(0)
  const sourceLoadRequestedRef = useRef(new Map())
  const docsWithSources = useMemo(
    () => applyDevDocsSourceState(docs, sourceLoadState),
    [sourceLoadState]
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
  const markdownRef = useRef(null)
  const headingLandingRef = useRef(null)
  const [readingHeading, setReadingHeading] = useState(null)
  const treeRef = useRef(null)
  const pendingTreeRevealRef = useRef('')

  const visibleDocs = useMemo(
    () =>
      sortDevDocsItemsByPinned(
        filterDevDocsItems(lifecycleDocs, keyword, searchScope)
      ),
    [lifecycleDocs, keyword, searchScope]
  )
  const pinnedDocs = useMemo(
    () => sortDevDocsItemsByPinned(lifecycleDocs.filter((item) => item.pinned)),
    [lifecycleDocs]
  )
  const trimmedKeyword = keyword.trim()
  const isSearching = trimmedKeyword.length > 0
  const fullTextSearchPending =
    isSearching &&
    searchScope === DEV_DOCS_SEARCH_SCOPE_ALL &&
    lifecycleDocs.some((item) => item.loadSource && !item.source && item.sourceLoad?.status !== 'error')
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
  const selectedSourceLoadState = selectedDoc?.sourceLoad
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedDocSource || '', [1, 2, 3, 4, 5, 6]),
    [selectedDocSource]
  )
  const titleHeadingId =
    headings[0]?.level === 1 && headings[0].title === selectedDoc?.title
      ? headings[0].id
      : ''
  const { chapters, locationByHeadingId } = useMemo(
    () => buildDevDocsChapterOutline(headings, titleHeadingId),
    [headings, titleHeadingId]
  )
  const firstHeadingId = headings[0]?.id || ''
  const requestedHeadingId = readHeadingIdFromHash(location.hash)
  const activeHeadingId =
    readingHeading?.path === selectedDocPath &&
    headings.some((heading) => heading.id === readingHeading.id)
      ? readingHeading.id
      : requestedHeadingId || firstHeadingId
  const activeLocation = locationByHeadingId.get(activeHeadingId)
  const activeChapterId = activeLocation?.chapterId
  const renderChapterHeading = useCallback((heading, { collapsed }) => {
    const { id } = heading.props
    if (collapsed || locationByHeadingId.get(id)?.chapterId !== id) return heading
    return (
      <BusinessFormSectionTitle
        as={heading.type}
        {...heading.props}
        data-current-section-title={id === activeChapterId ? 'true' : undefined}
      />
    )
  }, [activeChapterId, locationByHeadingId])

  const renderCollapsedSection = useCallback((heading, content) => (
    <details
      key={heading.props.id}
      className="erp-dev-disclosure erp-dev-docs-section"
      data-current-section-title={heading.props.id === activeChapterId ? 'true' : undefined}
    >
      <summary onClick={() => { headingLandingRef.current = null }}>{heading}</summary>
      <div className="erp-dev-docs-section__content">{content}</div>
    </details>
  ), [activeChapterId])

  const markReadingHeading = useCallback((id) => {
    setReadingHeading((current) =>
      current?.path === selectedDocPath && current.id === id
        ? current
        : { path: selectedDocPath, id }
    )
  }, [selectedDocPath])

  const jumpToHeading = useCallback((headingId) => {
    const container = markdownRef.current
    if (!container) return

    const landing = scrollMarkdownContainerToHeading(container, headingId, { reveal: true })
    if (!landing) return

    headingLandingRef.current = landing
    markReadingHeading(landing.id ?? firstHeadingId)
  }, [firstHeadingId, markReadingHeading])

  const openHeading = useCallback((headingId) => {
    if (!selectedDocPath) return
    jumpToHeading(headingId)
    if (requestedHeadingId === headingId) return

    navigate(buildDevDocsLocation({
      pathname: location.pathname,
      search: location.search,
      path: selectedDocPath,
      headingId,
    }))
  }, [jumpToHeading, location.pathname, location.search, navigate, requestedHeadingId, selectedDocPath])

  useLayoutEffect(() => {
    headingLandingRef.current = null
    jumpToHeading(requestedHeadingId)
  }, [jumpToHeading, requestedHeadingId, selectedDocSource])

  useEffect(() => {
    const container = markdownRef.current
    if (!container || !selectedDocSource || headings.length === 0) return undefined
    const anchors = headings
      .map((heading) => findDevDocsMarkdownAnchor(container, heading.id))
      .filter(Boolean)
    let frame
    const update = () => {
      const { top } = container.getBoundingClientRect()
      const { scrollTop } = container
      const positions = anchors
        .filter((anchor) => {
          const closedSection = anchor.closest(`${DOCS_SECTION_SELECTOR}:not([open])`)
          return !closedSection || closedSection.firstElementChild.contains(anchor)
        })
        .map((anchor) => ({
          id: anchor.id,
          top: getMarkdownHeadingTop(anchor) - top + scrollTop,
        }))
      const landing = headingLandingRef.current
      const target = landing?.id && positions.find((position) => position.id === landing.id)
      // Delayed content can move the heading or make more of the document scrollable.
      if (target && Math.abs(getHeadingScrollTop(container, target.top) - landing.scrollTop) > 1) {
        headingLandingRef.current = scrollMarkdownContainerToHeading(container, landing.id)
        markReadingHeading(landing.id)
        return
      }
      if (landing && Math.abs(landing.scrollTop - scrollTop) > 1) {
        headingLandingRef.current = null
      }
      const { paddingBlockStart, fontSize } = window.getComputedStyle(container)
      const readingInset = Number.parseFloat(paddingBlockStart) + Number.parseFloat(fontSize)
      const id = resolveDevDocsReadingHeading(
        positions,
        {
          scrollTop,
          clientHeight: container.clientHeight,
          scrollHeight: container.scrollHeight,
          readingInset,
        },
        headingLandingRef.current?.id
      )
      // 阅读位置只更新章节提示，不改写 URL 或增加历史记录。
      markReadingHeading(id)
    }
    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }
    const releaseLanding = () => {
      headingLandingRef.current = null
    }
    const releaseOnScrollKey = ({ key }) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(key)) {
        releaseLanding()
      }
    }
    container.addEventListener('scroll', schedule, { passive: true })
    container.addEventListener('wheel', releaseLanding, { passive: true })
    container.addEventListener('pointerdown', releaseLanding, { passive: true })
    container.addEventListener('keydown', releaseOnScrollKey)
    const observer = new ResizeObserver(schedule)
    observer.observe(container)
    const documentContent = container.firstElementChild
    if (documentContent) observer.observe(documentContent)
    schedule()
    return () => {
      window.cancelAnimationFrame(frame)
      container.removeEventListener('scroll', schedule)
      container.removeEventListener('wheel', releaseLanding)
      container.removeEventListener('pointerdown', releaseLanding)
      container.removeEventListener('keydown', releaseOnScrollKey)
      observer.disconnect()
    }
  }, [headings, markReadingHeading, selectedDocSource])

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
  }, [pinnedPaths])

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
    const requested = sourceLoadRequestedRef.current
    for (const item of pendingDocs) {
      const { path, loadSource } = item
      if (!loadSource || item.source || requested.get(path)?.loadSource === loadSource) {
        continue
      }
      // HMR replaces the loader for the changed Markdown file.
      const request = { loadSource }
      requested.set(path, request)
      const updateSourceLoad = (value) => {
        if (requested.get(path) !== request) return
        setSourceLoadState((current) => ({ ...current, [path]: { ...value, loadSource } }))
      }
      updateSourceLoad({ status: 'loading' })

      Promise.resolve()
        .then(() => loadSource())
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
          updateSourceLoad({ status: 'ready', source })
        })
        .catch(() => {
          updateSourceLoad({ status: 'error', message: '文档正文加载失败，请重试' })
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
  }, [selectedDoc?.path])

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
      if (targetPath === selectedDoc.path) {
        openHeading(target.headingId)
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
    location.pathname,
    location.search,
    navigate,
    openHeading,
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
    setExpandedKeys(new Set(allExpanded ? [] : allDirectoryKeys))
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

  return (
    <div className="erp-dev-docs-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-docs-header"
        title={
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
            <SupplementalHelp
              label="收录范围"
              placement="bottomLeft"
              content="只读加载当前工作区的 Markdown；历史正文在打开或全文搜索时加载。收录不代表已纳入 Git；实现、运行和验收仍需核对对应证据。"
            >
              收录范围
            </SupplementalHelp>
          </div>
        }
      >
        <div
          className="erp-dev-docs-controls"
          role="group"
          aria-label="项目文档检索"
        >
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
            onSearch={(value) => setKeyword(value)}
            className="erp-dev-docs-search"
          />
          <FilterChipGroup
            aria-label="项目文档搜索范围"
            options={SEARCH_SCOPE_OPTIONS}
            value={searchScope}
            onChange={setSearchScope}
          />
        </div>
      </DevPageHeader>

      <DevDocsLayout>
        <aside id="dev-docs-sidebar" className="erp-dev-docs-sidebar">
          {pinnedDocs.length > 0 ? (
            <details className="erp-dev-disclosure erp-dev-docs-sidebar__section erp-dev-docs-pinned erp-dev-docs-pinned-disclosure">
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
                      className="erp-directory-item erp-dev-docs-pinned__open"
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
              <div className="erp-directory-header erp-dev-docs-sidebar__section-head">
                <Text strong>搜索结果</Text>
                <Text type="secondary">
                  {visibleDocs.length} / {lifecycleDocs.length}
                </Text>
              </div>
              {fullTextSearchPending ? (
                <Space role="status">
                  <Spin size="small" />
                  <Text type="secondary">正在检索完整正文</Text>
                </Space>
              ) : null}
              {keyword.trim() &&
              searchScope === DEV_DOCS_SEARCH_SCOPE_ALL &&
              lifecycleDocs.some(
                (item) => item.sourceLoad?.status === 'error'
              ) ? (
                <Button
                  size="small"
                  onClick={() => {
                    for (const item of lifecycleDocs) {
                      if (item.sourceLoad?.status === 'error') {
                        sourceLoadRequestedRef.current.delete(item.path)
                      }
                    }
                    setSourceReloadToken((value) => value + 1)
                  }}
                >
                  部分正文加载失败，重新检索
                </Button>
              ) : null}
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
                        className="erp-directory-item erp-directory-item--stacked erp-dev-docs-list__open"
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
                          <span className="erp-dev-docs-list__tag">
                            {item.group}
                          </span>
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
            <Directory
              as="section"
              className="erp-dev-docs-sidebar__section erp-dev-docs-sidebar__section--tree"
              aria-label="文档目录"
              headerClassName="erp-dev-docs-sidebar__section-head"
              allExpanded={allExpanded}
              onToggleAll={allDirectoryKeys.length > 0 ? toggleAllDirectories : undefined}
              title={
                <Space size={6}>
                  <Text strong>目录</Text>
                  <Text
                    type="secondary"
                    title={`本层级 ${lifecycleDocs.length} 篇，共 ${docs.length} 篇`}
                  >
                    {lifecycleDocs.length}/{docs.length}
                  </Text>
                </Space>
              }
            >
              <div ref={treeRef} className="erp-directory-list erp-dev-docs-tree" aria-label="项目文档目录树">
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
            </Directory>
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
                  onClick={() => openHeading('')}
                >
                  回到顶部
                </Button>
                <Button icon={<CopyOutlined aria-hidden="true" />} onClick={copyPath}>
                  复制路径
                </Button>
              </Space>
            </div>
          ) : null}

          <div className="erp-dev-docs-reader__body">
            <DevDocsChapterNavigation
              key={selectedDocPath}
              chapters={chapters}
              activeLocation={activeLocation}
              onOpenHeading={openHeading}
            />

            {selectedDoc?.source ? (
              <article className="erp-dev-docs-markdown" ref={markdownRef}>
                <div className="erp-dev-docs-document">
                  <Markdown
                    key={selectedDocPath}
                    source={selectedDoc.source}
                    renderHeading={renderChapterHeading}
                    renderCollapsedSection={renderCollapsedSection}
                  />
                </div>
              </article>
            ) : selectedDoc && selectedSourceLoadState?.status === 'error' ? (
              <div className="erp-dev-docs-markdown erp-dev-docs-reader-state">
                <Empty description={selectedSourceLoadState.message}>
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
                <Empty description="没有匹配的文档，阅读操作已隐藏" />
              </div>
            )}
          </div>
        </section>
      </DevDocsLayout>
    </div>
  )
}
