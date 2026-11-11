import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  DownOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UpOutlined,
} from '@ant-design/icons'
import { Button, Tooltip } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SearchInput from '@/common/components/SearchInput'
import { Markdown } from '@/common/components/markdown'
import {
  buildDevDocsLocation,
  resolveDevDocsMarkdownHref,
} from '../pages/devDocsNavigation.mjs'
import {
  readUIDesignChapters,
  getUIDesignTopics,
  findUIDesignRule,
  filterUIDesignTopics,
  resolveUIDesignReading,
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

const isNarrowReader = () => window.matchMedia('(max-width: 680px)').matches

function revealRuleInPanel(panel, article, target) {
  let placedTop
  const align = () => {
    const top = panel.scrollTop + target.getBoundingClientRect().top - panel.getBoundingClientRect().top - 16
    panel.scrollTop = top
    placedTop = panel.scrollTop
    return top > placedTop + 1
  }

  // A rule that loads a diagram can grow after the initial scroll reaches the bottom.
  if (!align()) return undefined
  const inputEvents = ['wheel', 'pointerdown', 'keydown']
  const observer = new ResizeObserver(() => {
    if (Math.abs(panel.scrollTop - placedTop) > 1 || !align()) stop()
  })
  function stop() {
    observer.disconnect()
    for (const event of inputEvents) panel.removeEventListener(event, stop, true)
  }
  for (const event of inputEvents) {
    panel.addEventListener(event, stop, { capture: true, passive: true })
  }
  observer.observe(article)
  return stop
}

export default function DevUIDesignDocument({ source, specification, view }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [directoryOpen, setDirectoryOpen] = useState(() => !isNarrowReader())
  const directoryAction = directoryOpen ? '收起目录' : '展开目录'
  const contentRef = useRef(null)
  const directoryRef = useRef(null)
  const searchRef = useRef(null)
  const focusSearchAfterClear = useRef(false)
  const ruleRef = useRef(null)
  const ruleTriggerRef = useRef(null)
  const ruleReturnRef = useRef(null)
  const previousSelection = useRef(null)
  const chapters = useMemo(() => readUIDesignChapters(source), [source])
  const diagramChapters = useMemo(
    () => source === specification ? chapters : readUIDesignChapters(specification),
    [chapters, source, specification]
  )
  const topics = useMemo(
    () => getUIDesignTopics(view, chapters),
    [view, chapters]
  )
  const params = new URLSearchParams(location.search)
  const hash = decodeHash(location.hash)
  const { topic, rule } = resolveUIDesignReading(chapters, topics, params, hash)
  const topicKey = topic.key
  const ruleId = rule?.id
  const topicRuleOpen = Boolean(ruleId && ruleId === topic.rule?.id)
  const query = params.get('q') || ''
  const filtered = filterUIDesignTopics(topics, query)
  const groups = [...new Set(filtered.map((entry) => entry.group))]

  const updateLocation = useCallback((changes, { replace = false, fragment = location.hash } = {}) => {
    // Match Help Center: merge into the latest URL during rapid navigation.
    const next = new URLSearchParams(window.location.search)
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, value)
      else next.delete(key)
    })
    navigate(
      { pathname: location.pathname, search: `?${next}`, hash: fragment },
      { replace }
    )
  }, [location.hash, location.pathname, navigate])
  const selectTopic = (entry) =>
    updateLocation({ topic: entry.key, read: '', chapter: '', point: '' }, { fragment: '' })
  const clearEmptySearch = () => {
    focusSearchAfterClear.current = true
    updateLocation({ q: '' }, { replace: true })
  }
  const closeRule = () =>
    updateLocation({ topic: topicKey, read: '', chapter: '' }, { fragment: '' })
  const toggleTopicRule = () => {
    if (topicRuleOpen) {
      closeRule()
      return
    }
    ruleReturnRef.current = { topicKey, scrollTop: contentRef.current.scrollTop }
    updateLocation({ topic: topicKey, read: '', chapter: topic.rule.id }, { fragment: '' })
  }

  useEffect(() => {
    if (query || !focusSearchAfterClear.current) return
    focusSearchAfterClear.current = false
    searchRef.current?.focus({ preventScroll: true })
  }, [query])

  useLayoutEffect(() => {
    const panel = contentRef.current
    if (!panel) return undefined
    const previous = previousSelection.current
    previousSelection.current = { topicKey, ruleId }
    const article = ruleRef.current
    if (article) {
      const anchor = hash ? [...article.querySelectorAll('[id]')].find((element) => element.id === hash) : null
      const target = anchor?.closest('[data-markdown-anchor="heading"]') || anchor || article
      const stop = revealRuleInPanel(panel, article, target)
      article.focus({ preventScroll: true })
      return stop
    }
    if (previous?.ruleId && previous.topicKey === topicKey) {
      const trigger = ruleTriggerRef.current
      const origin = ruleReturnRef.current
      if (origin?.topicKey === topicKey) {
        panel.scrollTop = origin.scrollTop
        trigger?.focus({ preventScroll: true })
      } else {
        (trigger || panel).focus()
      }
      return undefined
    }
    panel.scrollTop = 0
    return undefined
  }, [topicKey, ruleId, hash])

  useEffect(() => {
    const article = ruleRef.current
    if (!article) return undefined
    const followRuleLink = (event) => {
      const anchor = event.target?.closest?.('a[href^="#"]')
      if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      if (!findUIDesignRule(chapters, decodeHash(anchor.hash))) return
      event.preventDefault()
      updateLocation({ topic: topicKey, read: '', chapter: '' }, { fragment: anchor.hash })
    }
    article.addEventListener('click', followRuleLink)
    return () => article.removeEventListener('click', followRuleLink)
  }, [chapters, ruleId, topicKey, updateLocation])

  useLayoutEffect(() => {
    const directory = directoryRef.current
    if (!directory || !directoryOpen) return
    const revealCurrent = () => {
      const selected = directory.querySelector('[aria-current="page"]')
      if (!selected) return
      const bounds = directory.getBoundingClientRect()
      const item = selected.getBoundingClientRect()
      if (item.top < bounds.top) directory.scrollTop -= bounds.top - item.top
      else if (item.bottom > bounds.bottom) {
        directory.scrollTop += item.bottom - bounds.bottom
      }
    }
    revealCurrent()
    const observer = new ResizeObserver(revealCurrent)
    observer.observe(directory)
    return () => observer.disconnect()
  }, [topicKey, query, directoryOpen])

  return (
    <section
      className="erp-dev-ui-design-document"
      aria-label={view === 'specification' ? '设计说明' : '设计依据'}
    >
      <div className="erp-design-reader-location">
        <div className="erp-design-reader-search" role="search" aria-label="查找图解主题">
          <SearchInput
            ref={searchRef}
            aria-label="搜索设计图解"
            aria-controls="design-reading-directory"
            placeholder="搜索图解主题"
            value={query}
            allowClear
            onSearch={(value) => updateLocation({ q: value }, { replace: true })}
            onSubmitted={() => setDirectoryOpen(true)}
          />
        </div>
        <div className="erp-design-reader-context">
          <span>
            {topic.group === '工作中心' ? topic.group : <>{topic.group} / <strong>{topic.title}</strong></>}
          </span>
          <Tooltip title={directoryAction} trigger={['hover', 'focus']} placement="bottomRight">
            <Button
              className="erp-design-directory-toggle"
              icon={
                directoryOpen ? (
                  <MenuFoldOutlined aria-hidden="true" />
                ) : (
                  <MenuUnfoldOutlined aria-hidden="true" />
                )
              }
              aria-label={directoryAction}
              aria-controls="design-reading-directory"
              aria-expanded={directoryOpen}
              onClick={() => setDirectoryOpen((open) => !open)}
            />
          </Tooltip>
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
          <nav
            ref={directoryRef}
            className="erp-design-document-toc"
            aria-label="设计阅读目录"
          >
            {groups.map((group) => (
              <div key={group} className="erp-design-topic-group">
                <h3 className="erp-dev-directory-group-title">{group}</h3>
                {filtered
                  .filter((entry) => entry.group === group)
                  .map((entry) => (
                    <button
                      type="button"
                      key={entry.key}
                      className="erp-dev-directory-item erp-dev-directory-item--nested erp-design-topic-button"
                      aria-current={
                        entry.key === topicKey ? 'page' : undefined
                      }
                      onClick={() => {
                        selectTopic(entry)
                        if (isNarrowReader()) {
                          setDirectoryOpen(false)
                          contentRef.current?.focus({ preventScroll: true })
                        }
                      }}
                    >
                      <span>{entry.title}</span>
                    </button>
                  ))}
              </div>
            ))}
            {!filtered.length ? (
              <Empty
                description="没有匹配的图解主题"
              >
                <Button onClick={clearEmptySearch}>
                  清除搜索
                </Button>
              </Empty>
            ) : null}
          </nav>
        </aside>
        <div className="erp-design-reader-pane">
          <div
            ref={contentRef}
            tabIndex={-1}
            className="erp-design-document-content"
            aria-label="当前设计内容"
          >
            <DevUIDesignIllustrations
              key={topicKey}
              topic={topic}
              chapters={diagramChapters}
              view={view}
            />
            {topic.rule ? (
              <div className="erp-design-related-rules" role="group" aria-label="当前图解的规范来源">
                <span>查阅规则</span>
                <Button
                  ref={ruleTriggerRef}
                  aria-expanded={topicRuleOpen}
                  aria-controls={topicRuleOpen ? 'design-related-rule' : undefined}
                  onClick={toggleTopicRule}
                >
                  {topic.rule.title}
                  {topicRuleOpen ? <UpOutlined aria-hidden="true" /> : <DownOutlined aria-hidden="true" />}
                </Button>
              </div>
            ) : null}
            {rule ? (
              <article
                id="design-related-rule"
                aria-label={rule.title}
                tabIndex={-1}
                className="erp-design-prose"
                ref={(element) => {
                  ruleRef.current = element
                  element?.querySelectorAll('a[href]').forEach((link) => {
                    const href = link.getAttribute('href')
                    if (!href || /^(?:#|[a-z]+:|\/)/iu.test(href)) return
                    const next = documentHref(href)
                    if (next) link.setAttribute('href', next)
                  })
                }}
              >
                <Markdown source={rule.content} />
                <Button className="erp-design-rule-close" icon={<UpOutlined aria-hidden="true" />} onClick={closeRule}>
                  收起规则
                </Button>
              </article>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  )
}
