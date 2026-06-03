import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  BookOutlined,
  CopyOutlined,
  DownOutlined,
  FileMarkdownOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  RightOutlined,
  SearchOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Empty, Input, Space, Tag, Typography } from 'antd'
import { Markdown, extractMarkdownHeadings } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import {
  buildDevDocsItems,
  buildDevDocsTree,
  filterDevDocsItems,
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

function DevDocsTreeNode({
  node,
  depth = 0,
  expandedKeys,
  selectedKey,
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
  return (
    <button
      type="button"
      data-dev-doc-key={node.item.key}
      className={
        active
          ? 'erp-dev-docs-tree__row erp-dev-docs-tree__doc erp-dev-docs-tree__doc--active'
          : 'erp-dev-docs-tree__row erp-dev-docs-tree__doc'
      }
      style={{ '--depth-offset': `${depth * 14}px` }}
      onClick={() => onSelectDoc(node.item.key)}
    >
      <FileMarkdownOutlined />
      <span className="erp-dev-docs-tree__doc-copy">
        <span className="erp-dev-docs-tree__doc-title">{node.item.title}</span>
        <span className="erp-dev-docs-tree__doc-path">{node.item.path}</span>
      </span>
    </button>
  )
}

export default function DevDocsPage() {
  const docs = useMemo(() => buildDevDocsItems(markdownModules), [])
  const docTree = useMemo(() => buildDevDocsTree(docs), [docs])
  const allDirectoryKeys = useMemo(
    () => collectDirectoryKeys(docTree),
    [docTree]
  )
  const [keyword, setKeyword] = useState('')
  const [selectedKey, setSelectedKey] = useState(docs[0]?.key || '')
  const [expandedKeys, setExpandedKeys] = useState(
    () => new Set(DEFAULT_EXPANDED_DIR_KEYS)
  )
  const markdownRef = useRef(null)

  const docsWithSearchText = useMemo(
    () =>
      docs.map((item) => ({
        ...item,
        searchText: item.source,
      })),
    [docs]
  )

  const visibleDocs = useMemo(
    () => filterDevDocsItems(docsWithSearchText, keyword),
    [docsWithSearchText, keyword]
  )
  const trimmedKeyword = keyword.trim()
  const isSearching = trimmedKeyword.length > 0
  const allExpanded =
    allDirectoryKeys.length > 0 &&
    allDirectoryKeys.every((key) => expandedKeys.has(key))

  const selectedDoc =
    docs.find((item) => item.key === selectedKey) || visibleDocs[0] || docs[0]
  const headings = useMemo(
    () => extractMarkdownHeadings(selectedDoc?.source || '', [1, 2, 3]),
    [selectedDoc?.source]
  )

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
      return next
    })
  }

  const toggleAllDirectories = () => {
    setExpandedKeys(
      allExpanded
        ? new Set(DEFAULT_EXPANDED_DIR_KEYS)
        : new Set(allDirectoryKeys)
    )
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
              开发文档查看器
            </Title>
            <Tag color="green">DEV ONLY</Tag>
          </Space>
          <Paragraph className="erp-dev-docs-summary">
            左侧专用于仓库目录树浏览全量 Markdown；不进入 ERP
            菜单、权限、seedData 或产品文档 registry。
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

          {isSearching ? (
            <section className="erp-dev-docs-sidebar__section erp-dev-docs-sidebar__section--results">
              <div className="erp-dev-docs-sidebar__section-head">
                <Text strong>搜索结果</Text>
                <Text type="secondary">
                  {visibleDocs.length} / {docs.length}
                </Text>
              </div>
              <div className="erp-dev-docs-list">
                {visibleDocs.length > 0 ? (
                  visibleDocs.map((item) => (
                    <button
                      type="button"
                      key={item.key}
                      data-dev-doc-key={item.key}
                      className={
                        item.key === selectedDoc?.key
                          ? 'erp-dev-docs-list__item erp-dev-docs-list__item--active'
                          : 'erp-dev-docs-list__item'
                      }
                      onClick={() => setSelectedKey(item.key)}
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
                <Text strong>目录树</Text>
                <Space size={6}>
                  <Text type="secondary">{docs.length} 篇</Text>
                  <Button
                    size="small"
                    type="text"
                    onClick={toggleAllDirectories}
                  >
                    {allExpanded ? '收起' : '展开'}
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
                    onToggleDirectory={toggleDirectory}
                    onSelectDoc={setSelectedKey}
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
              <Button
                icon={<VerticalAlignTopOutlined />}
                onClick={scrollReaderToTop}
              >
                回到顶部
              </Button>
              <Button icon={<CopyOutlined />} onClick={copyPath}>
                复制路径
              </Button>
            </Space>
          </div>

          {headings.length > 0 ? (
            <div className="erp-dev-docs-toc" aria-label="文档章节">
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
          ) : null}

          <article className="erp-dev-docs-markdown" ref={markdownRef}>
            <Markdown source={selectedDoc?.source || ''} />
          </article>
        </section>
      </main>
    </div>
  )
}
