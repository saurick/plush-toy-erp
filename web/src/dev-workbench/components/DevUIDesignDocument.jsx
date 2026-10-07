import React, { useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
} from '@ant-design/icons'
import { Button, Empty } from 'antd'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SearchInput from '@/common/components/SearchInput'
import { Markdown } from '@/common/components/markdown'
import {
  buildDevDocsLocation,
  resolveDevDocsMarkdownHref,
} from '../pages/devDocsNavigation.mjs'
import {
  readUIDesignChapters,
  getUIDesignTopics,
  findUIDesignChapter,
  filterUIDesignEntries,
} from '../config/devUIDesignReading.mjs'
import DevUIDesignIllustrations from './DevUIDesignIllustrations.jsx'

function documentHref(href) {
  const [path, anchor = ''] = href.split('#')
  if (path === 'index.html') return '/__dev/ui-design'
  if (path === '交互设计说明.md' || path === '设计依据.md') {
    return `/__dev/ui-design?view=${path === '设计依据.md' ? 'rationale' : 'specification'}&read=reference${anchor ? `#${anchor}` : ''}`
  }
  const target = resolveDevDocsMarkdownHref(
    href,
    'docs/product/ui-design/README.md'
  )
  if (!target) return null
  const next = buildDevDocsLocation(target)
  return `${next.pathname}${next.search}${next.hash}`
}

function decodeHash(value) {
  try {
    return decodeURIComponent(value.replace(/^#/, ''))
  } catch {
    return ''
  }
}

export default function DevUIDesignDocument({ source, specification, view }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [directoryOpen, setDirectoryOpen] = useState(true)
  const contentRef = useRef(null)
  const directoryRef = useRef(null)
  const chapters = useMemo(() => readUIDesignChapters(source), [source])
  const diagramChapters = useMemo(
    () => readUIDesignChapters(specification),
    [specification]
  )
  const topics = useMemo(
    () => getUIDesignTopics(view, chapters),
    [view, chapters]
  )
  const params = new URLSearchParams(location.search)
  const hash = decodeHash(location.hash)
  const hashChapter = findUIDesignChapter(chapters, hash)
  const read =
    hashChapter || params.get('read') === 'reference' ? 'reference' : 'guide'
  const topic =
    topics.find((item) => item.key === params.get('topic')) || topics[0]
  const chapter =
    hashChapter ||
    findUIDesignChapter(chapters, params.get('chapter')) ||
    topic.references[0] ||
    chapters[0]
  const query = params.get('q') || ''
  const entries = read === 'guide' ? topics : chapters
  const current = read === 'guide' ? topic.key : chapter.id
  const filtered = filterUIDesignEntries(entries, query)
  const groups = [
    ...new Set(filtered.map((entry) => entry.group || '规范章节')),
  ]
  const index = entries.findIndex(
    (entry) => (entry.key || entry.id) === current
  )

  const updateLocation = (changes, replace = false) => {
    // Match Help Center: merge into the latest URL during rapid navigation.
    const next = new URLSearchParams(window.location.search)
    if (hashChapter) {
      next.set('read', 'reference')
      next.set('chapter', hashChapter.id)
    }
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    navigate(
      { pathname: location.pathname, search: `?${next}`, hash: '' },
      { replace }
    )
  }
  const selectEntry = (entry) =>
    updateLocation({
      [read === 'guide' ? 'topic' : 'chapter']: entry.key || entry.id,
      read,
      q: '',
    })
  const reference = (id) =>
    updateLocation({ read: 'reference', chapter: id, q: '' })
  const previewParams = new URLSearchParams(location.search)
  ;['view', 'read', 'chapter', 'topic', 'q'].forEach((key) =>
    previewParams.delete(key)
  )
  const previewHref = `${location.pathname}${previewParams.size ? `?${previewParams}` : ''}`

  useLayoutEffect(() => {
    const panel = contentRef.current
    if (!panel) return
    panel.scrollTop = 0
    if (hash) {
      const anchor = [...panel.querySelectorAll('[id]')].find(
        (element) => element.id === hash
      )
      const heading =
        anchor?.closest('[data-markdown-anchor="heading"]') || anchor
      if (heading) {
        panel.scrollTop =
          heading.getBoundingClientRect().top -
          panel.getBoundingClientRect().top -
          20
      }
    }
  }, [current, read, hash])

  useLayoutEffect(() => {
    const directory = directoryRef.current
    const selected = directory?.querySelector('[aria-current="page"]')
    if (!selected) return
    const bounds = directory.getBoundingClientRect()
    const item = selected.getBoundingClientRect()
    if (item.top < bounds.top) directory.scrollTop -= bounds.top - item.top
    else if (item.bottom > bounds.bottom) {
      directory.scrollTop += item.bottom - bounds.bottom
    }
  }, [current, read, directoryOpen])

  return (
    <section
      className="erp-dev-ui-design-document"
      aria-label={view === 'specification' ? '设计说明' : '设计依据'}
    >
      <div className="erp-design-reader-toolbar">
        <Segmented
          aria-label="设计阅读方式"
          value={read}
          onChange={(value) => updateLocation({ read: value, q: '' })}
          options={[
            { value: 'guide', label: '图解' },
            { value: 'reference', label: '规范原文' },
          ]}
        />
        <div>
          <Button
            icon={
              directoryOpen ? (
                <MenuFoldOutlined aria-hidden="true" />
              ) : (
                <MenuUnfoldOutlined aria-hidden="true" />
              )
            }
            aria-controls="design-reading-directory"
            aria-expanded={directoryOpen}
            onClick={() => setDirectoryOpen(!directoryOpen)}
          >
            {directoryOpen ? '收起目录' : '展开目录'}
          </Button>
          <Link to={previewHref}>
            打开可交互设计 <ArrowRightOutlined aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div
        className="erp-design-document-shell"
        data-directory-open={directoryOpen}
      >
        <aside
          id="design-reading-directory"
          className="erp-design-document-sidebar"
          hidden={!directoryOpen}
        >
          <div className="erp-design-directory-search">
            <SearchInput
              aria-label="搜索设计图解或规范"
              placeholder="搜索主题或规则"
              value={query}
              allowClear
              onChange={(event) =>
                updateLocation({ q: event.target.value }, true)
              }
            />
            <span role="status">
              {filtered.length} / {entries.length}{' '}
              {read === 'guide' ? '个图解' : '个章节'}
            </span>
          </div>
          <nav
            ref={directoryRef}
            className="erp-design-document-toc"
            aria-label="设计阅读目录"
          >
            {groups.map((group) => (
              <div key={group} className="erp-design-topic-group">
                <h3>{group}</h3>
                {filtered
                  .filter((entry) => (entry.group || '规范章节') === group)
                  .map((entry) => (
                    <button
                      type="button"
                      key={entry.key || entry.id}
                      className="erp-design-topic-button"
                      aria-current={
                        (entry.key || entry.id) === current ? 'page' : undefined
                      }
                      onClick={() => selectEntry(entry)}
                    >
                      <span>{entry.title}</span>
                      <ArrowRightOutlined aria-hidden="true" />
                    </button>
                  ))}
              </div>
            ))}
            {!filtered.length ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="没有匹配的主题或章节"
              >
                <Button onClick={() => updateLocation({ q: '' }, true)}>
                  清除搜索
                </Button>
              </Empty>
            ) : null}
          </nav>
        </aside>
        <div className="erp-design-reader-pane">
          <div className="erp-design-reader-location">
            <span>
              {read === 'guide' ? topic.group : '规范原文'} /{' '}
              <strong>{read === 'guide' ? topic.title : chapter.title}</strong>
            </span>
            <div>
              <Button
                aria-label="上一个设计主题"
                icon={<ArrowLeftOutlined />}
                disabled={index <= 0}
                onClick={() => selectEntry(entries[index - 1])}
              />
              <span>
                {index + 1} / {entries.length}
              </span>
              <Button
                aria-label="下一个设计主题"
                icon={<ArrowRightOutlined />}
                disabled={index >= entries.length - 1}
                onClick={() => selectEntry(entries[index + 1])}
              />
            </div>
          </div>
          <div
            ref={contentRef}
            tabIndex={-1}
            className="erp-design-document-content"
            aria-label="当前设计内容"
          >
            {read === 'guide' ? (
              <>
                <DevUIDesignIllustrations
                  key={topic.key}
                  topic={topic}
                  chapters={diagramChapters}
                  view={view}
                />
                <nav
                  className="erp-design-related-rules"
                  aria-label="当前图解的规范来源"
                >
                  <span>查阅规则</span>
                  {topic.references.map((item) => (
                    <Button key={item.id} onClick={() => reference(item.id)}>
                      {item.title}
                      <ArrowRightOutlined aria-hidden="true" />
                    </Button>
                  ))}
                </nav>
              </>
            ) : (
              <article
                className="erp-design-prose"
                ref={(element) => {
                  element?.querySelectorAll('a[href]').forEach((link) => {
                    const href = link.getAttribute('href')
                    if (!href || /^(?:#|[a-z]+:|\/)/iu.test(href)) return
                    const next = documentHref(href)
                    if (next) link.setAttribute('href', next)
                  })
                }}
              >
                <Markdown source={chapter.content} />
              </article>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
