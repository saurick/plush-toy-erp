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
  SearchOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Space, Tag, Tooltip, Typography } from 'antd'
import { Markdown, extractMarkdownHeadings } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import {
  DEV_DOCS_EXPANDED_DIRS_STORAGE_KEY,
  DEV_DOCS_PINNED_STORAGE_KEY,
  DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
  DEV_DOCS_TOC_EXPANDED_STORAGE_KEY,
  applyDevDocsPinnedState,
  buildDevDocsItems,
  buildDevDocsTree,
  filterDevDocsItems,
  getDefaultDevDocsPinnedPaths,
  normalizeDevDocsExpandedDirKeys,
  normalizeDevDocsPinnedPaths,
  normalizeDevDocsSelectedPath,
  sortDevDocsItemsByPinned,
} from '../config/devDocs.mjs'

const { Paragraph, Text, Title } = Typography

const DEFAULT_EXPANDED_DIR_KEYS = Object.freeze(['dir:docs'])

const markdownModules = import.meta.glob(
  [
    '../../../../README.md',
    '../../../README.md',
    '../../../../server/README.md',
    '../../../../scripts/README.md',
    '../../../../docs/**/*.md',
  ],
  {
    eager: true,
    import: 'default',
    query: '?raw',
  }
)

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
  } catch (error) {
    return getDefaultDevDocsPinnedPaths(docs)
  }
}

function readSelectedKey(docs = []) {
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
  } catch (error) {
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
  } catch (error) {
    return defaultKeys
  }
}

function readTocExpanded() {
  if (typeof window === 'undefined') {
    return true
  }

  try {
    const rawValue = window.localStorage.getItem(
      DEV_DOCS_TOC_EXPANDED_STORAGE_KEY
    )
    if (rawValue === null) {
      return true
    }
    return rawValue !== 'false'
  } catch (error) {
    return true
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
  const docs = useMemo(() => buildDevDocsItems(markdownModules), [])
  const [pinnedPaths, setPinnedPaths] = useState(() => readPinnedPaths(docs))
  const docsWithPinnedState = useMemo(
    () => applyDevDocsPinnedState(docs, pinnedPaths),
    [docs, pinnedPaths]
  )
  const docTree = useMemo(
    () => buildDevDocsTree(docsWithPinnedState),
    [docsWithPinnedState]
  )
  const allDirectoryKeys = useMemo(
    () => collectDirectoryKeys(docTree),
    [docTree]
  )
  const [keyword, setKeyword] = useState('')
  const [selectedKey, setSelectedKey] = useState(() =>
    readSelectedKey(docsWithPinnedState)
  )
  const [expandedKeys, setExpandedKeys] = useState(
    () => new Set(readExpandedKeys(allDirectoryKeys))
  )
  const [tocExpanded, setTocExpanded] = useState(() => readTocExpanded())
  const markdownRef = useRef(null)

  const docsWithSearchText = useMemo(
    () =>
      docsWithPinnedState.map((item) => ({
        ...item,
        searchText: item.source,
      })),
    [docsWithPinnedState]
  )

  const visibleDocs = useMemo(
    () =>
      sortDevDocsItemsByPinned(filterDevDocsItems(docsWithSearchText, keyword)),
    [docsWithSearchText, keyword]
  )
  const pinnedDocs = useMemo(
    () =>
      sortDevDocsItemsByPinned(
        docsWithPinnedState.filter((item) => item.pinned)
      ),
    [docsWithPinnedState]
  )
  const trimmedKeyword = keyword.trim()
  const isSearching = trimmedKeyword.length > 0
  const allExpanded =
    allDirectoryKeys.length > 0 &&
    allDirectoryKeys.every((key) => expandedKeys.has(key))

  const selectedDoc =
    docsWithPinnedState.find((item) => item.key === selectedKey) ||
    visibleDocs[0] ||
    docsWithPinnedState[0]
  const selectedDocPinned = Boolean(selectedDoc?.pinned)
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedDoc?.source || '', [1, 2, 3]),
    [selectedDoc?.source]
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
    } catch (error) {
      // 本地偏好写入失败时不影响 dev docs 主路径浏览。
    }
  }, [docs, pinnedPaths])

  useEffect(() => {
    if (typeof window === 'undefined' || !selectedDoc?.path) {
      return
    }
    try {
      window.localStorage.setItem(
        DEV_DOCS_SELECTED_PATH_STORAGE_KEY,
        normalizeDevDocsSelectedPath(selectedDoc.path, docs)
      )
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      // 章节导航偏好写入失败时不影响 dev docs 主路径浏览。
    }
  }, [tocExpanded])

  useEffect(() => {
    markdownRef.current?.scrollTo({ top: 0 })
  }, [selectedDoc?.key])

  const copyPath = async () => {
    if (!selectedDoc?.path) {
      return
    }
    try {
      await navigator.clipboard.writeText(selectedDoc.path)
      message.success('已复制文档路径')
    } catch (error) {
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
    setSelectedKey(docKey)
  }

  const scrollReaderToTop = () => {
    markdownRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollToHeading = (headingId) => {
    const container = markdownRef.current
    if (!container || !headingId) {
      return
    }

    const target = [...container.querySelectorAll('h1, h2, h3')].find(
      (element) => element.id === headingId
    )
    if (!target) {
      return
    }

    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    container.scrollTo({
      top: container.scrollTop + targetRect.top - containerRect.top - 8,
      behavior: 'smooth',
    })
  }

  return (
    <div className="erp-dev-docs-page">
      <header className="erp-dev-docs-header">
        <div className="erp-dev-docs-header__copy">
          <Space align="center" size={10} wrap>
            <BookOutlined className="erp-dev-docs-header__icon" />
            <Title level={3} className="erp-dev-docs-title">
              开发文档查看器 / Dev Docs Viewer
            </Title>
            <Tag color="green">DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-docs-summary">
            左侧专用于仓库目录树浏览全量 Markdown / browse repo Markdown by
            directory tree；不进入 ERP 菜单、权限、seedData 或产品文档
            registry。
          </Paragraph>
        </div>
      </header>

      <main className="erp-dev-docs-shell">
        <aside className="erp-dev-docs-sidebar">
          <Input
            allowClear
            value={keyword}
            prefix={<SearchOutlined />}
            placeholder="搜索标题、路径或正文；不搜索时按目录树浏览"
            onChange={(event) => setKeyword(event.target.value)}
            className="erp-dev-docs-search"
          />

          {pinnedDocs.length > 0 ? (
            <section className="erp-dev-docs-sidebar__section erp-dev-docs-pinned">
              <div className="erp-dev-docs-sidebar__section-head">
                <Text strong>
                  <PushpinOutlined className="erp-dev-docs-sidebar__section-icon" />
                  置顶 / Pinned
                </Text>
                <Text type="secondary">{pinnedDocs.length}</Text>
              </div>
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
            </section>
          ) : null}

          {isSearching ? (
            <section className="erp-dev-docs-sidebar__section erp-dev-docs-sidebar__section--results">
              <div className="erp-dev-docs-sidebar__section-head">
                <Text strong>搜索结果 / Search Results</Text>
                <Text type="secondary">
                  {visibleDocs.length} / {docs.length}
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
                    description="没有匹配的文档"
                  />
                )}
              </div>
            </section>
          ) : (
            <section className="erp-dev-docs-sidebar__section erp-dev-docs-sidebar__section--tree">
              <div className="erp-dev-docs-sidebar__section-head">
                <Text strong>目录树 / Directory Tree</Text>
                <Space size={6}>
                  <Text type="secondary">{docs.length} 篇</Text>
                  <Button
                    size="small"
                    type="text"
                    onClick={toggleAllDirectories}
                  >
                    {allExpanded ? '收起 / Collapse' : '展开 / Expand'}
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
          <div className="erp-dev-docs-reader__toolbar">
            <div className="erp-dev-docs-reader__title">
              <Text strong>{selectedDoc?.title}</Text>
              <Text type="secondary" className="erp-dev-docs-reader__path">
                {selectedDoc?.path}
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
                    selectedDocPinned ? <PushpinFilled /> : <PushpinOutlined />
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

          {headings.length > 0 ? (
            <div className="erp-dev-docs-toc-shell">
              <div className="erp-dev-docs-toc-shell__head">
                <Text strong>章节 / Sections</Text>
                <Button
                  size="small"
                  type="text"
                  data-dev-doc-toc-toggle
                  aria-expanded={tocExpanded}
                  onClick={() => setTocExpanded((current) => !current)}
                >
                  {tocExpanded ? '收起 / Scroll' : '展开 / Wrap'}
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

          <article className="erp-dev-docs-markdown" ref={markdownRef}>
            <Markdown source={selectedDoc?.source || ''} />
          </article>
        </section>
      </main>
    </div>
  )
}
