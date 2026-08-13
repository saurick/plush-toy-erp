import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowsAltOutlined,
  ColumnHeightOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  OneToOneOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Remarkable } from 'remarkable'
import RemarkableReactRenderer from 'remarkable-react'

import './mermaid.css'

const MERMAID_FONT_FAMILY =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const MERMAID_THEME_CONFIG = {
  light: {
    theme: 'base',
    themeVariables: {
      primaryColor: '#eef7ef',
      primaryTextColor: '#173f2a',
      primaryBorderColor: '#8cc49a',
      lineColor: '#2f6f4e',
      secondaryColor: '#f8fbf8',
      tertiaryColor: '#ffffff',
      fontFamily: MERMAID_FONT_FAMILY,
    },
  },
  dark: {
    theme: 'dark',
    themeVariables: {
      primaryColor: '#16351f',
      primaryTextColor: '#e5edf5',
      primaryBorderColor: '#3f7d53',
      lineColor: '#86efac',
      secondaryColor: '#0f172a',
      tertiaryColor: '#111827',
      fontFamily: MERMAID_FONT_FAMILY,
    },
  },
}

let mermaidRenderSequence = 0
let mermaidRenderQueue = Promise.resolve()

function enqueueMermaidRender(render) {
  const queuedRender = mermaidRenderQueue.then(render, render)
  mermaidRenderQueue = queuedRender.then(
    () => undefined,
    () => undefined
  )
  return queuedRender
}

const MERMAID_ZOOM = {
  min: 0.1,
  max: 2.4,
  step: 0.2,
  defaultValue: 1,
}

const MERMAID_FIT_HEIGHT = {
  minPageHeight: 240,
  pageBottomGap: 24,
}

function getCurrentERPTheme() {
  if (typeof document === 'undefined') {
    return 'light'
  }
  return document.documentElement.dataset.erpTheme === 'dark' ? 'dark' : 'light'
}

function useCurrentERPTheme() {
  const [theme, setTheme] = useState(getCurrentERPTheme)

  useEffect(() => {
    if (
      typeof document === 'undefined' ||
      typeof MutationObserver === 'undefined'
    ) {
      return undefined
    }

    const root = document.documentElement
    const syncTheme = () => {
      setTheme(getCurrentERPTheme())
    }
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-erp-theme'],
    })
    syncTheme()
    return () => observer.disconnect()
  }, [])

  return theme
}

/* eslint-disable react/no-danger */
export function MermaidDiagram({
  chart,
  label = 'Mermaid 图表',
  showSourceOnError = true,
  themeMode,
  flowchartHtmlLabels = true,
}) {
  const currentTheme = useCurrentERPTheme()
  const theme =
    themeMode === 'light' || themeMode === 'dark' ? themeMode : currentTheme
  const useFlowchartHtmlLabels = flowchartHtmlLabels !== false
  const displayLabel = String(label || '').trim() || '图表'
  const diagramId = useMemo(() => {
    mermaidRenderSequence += 1
    return `erp-markdown-mermaid-${mermaidRenderSequence}`
  }, [])
  const [zoom, setZoom] = useState(MERMAID_ZOOM.defaultValue)
  const [fullscreenZoom, setFullscreenZoom] = useState(
    MERMAID_ZOOM.defaultValue
  )
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const fullscreenOpenRef = useRef(null)
  const fullscreenExitRef = useRef(null)
  const fullscreenReturnFocusRef = useRef(null)
  const viewportRef = useRef(null)
  const canvasRef = useRef(null)
  const [renderState, setRenderState] = useState({
    status: 'loading',
    svg: '',
    error: '',
  })
  const restoreFullscreenFocus = useCallback((returnFocusElement) => {
    window.setTimeout(() => {
      const focusTarget = fullscreenOpenRef.current || returnFocusElement
      if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') {
        focusTarget.focus()
      }
    }, 0)
  }, [])

  const activeZoom = fullscreenOpen ? fullscreenZoom : zoom
  const zoomPercent = Math.round(activeZoom * 100)

  useEffect(() => {
    setZoom(MERMAID_ZOOM.defaultValue)
    setFullscreenZoom(MERMAID_ZOOM.defaultValue)
    setFullscreenOpen(false)
  }, [chart])

  useEffect(() => {
    if (!fullscreenOpen || typeof document === 'undefined') {
      return undefined
    }

    const previousOverflow = document.body.style.overflow
    const returnFocusElement = fullscreenReturnFocusRef.current
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        setFullscreenOpen(false)
      }
    }
    document.addEventListener('keydown', closeOnEscape, true)
    window.setTimeout(() => fullscreenExitRef.current?.focus(), 0)

    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape, true)
      restoreFullscreenFocus(returnFocusElement)
    }
  }, [fullscreenOpen, restoreFullscreenFocus])

  useEffect(() => {
    const source = String(chart || '').trim()
    let cancelled = false

    if (!source) {
      setRenderState({ status: 'empty', svg: '', error: '' })
      return undefined
    }

    async function renderMermaid() {
      setRenderState({ status: 'loading', svg: '', error: '' })
      try {
        const mermaidModule = await import('mermaid')
        const mermaid = mermaidModule.default || mermaidModule
        const renderTheme =
          MERMAID_THEME_CONFIG[theme] || MERMAID_THEME_CONFIG.light
        const { svg } = await enqueueMermaidRender(async () => {
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            htmlLabels: useFlowchartHtmlLabels,
            flowchart: {
              htmlLabels: useFlowchartHtmlLabels,
              curve: 'basis',
            },
            ...renderTheme,
          })
          const renderId = `${diagramId}-${theme}-${useFlowchartHtmlLabels ? 'html' : 'svg'}-${Date.now()}`
          return mermaid.render(renderId, source)
        })
        if (!cancelled) {
          setRenderState({ status: 'rendered', svg, error: '' })
        }
      } catch (_error) {
        if (!cancelled) {
          setRenderState({
            status: 'error',
            svg: '',
            error: '请检查 Mermaid 源码语法或稍后重试。',
          })
        }
      }
    }

    renderMermaid()
    return () => {
      cancelled = true
    }
  }, [chart, diagramId, theme, useFlowchartHtmlLabels])

  if (renderState.status === 'empty') {
    return null
  }

  const setNextZoom = (nextZoom) => {
    const numericZoom = Number(nextZoom)
    const safeZoom = Number.isFinite(numericZoom)
      ? numericZoom
      : MERMAID_ZOOM.defaultValue
    const normalizedZoom = Math.min(
      MERMAID_ZOOM.max,
      Math.max(MERMAID_ZOOM.min, safeZoom)
    )
    const nextValue = Number(normalizedZoom.toFixed(2))
    if (fullscreenOpen) {
      setFullscreenZoom(nextValue)
      return
    }
    setZoom(nextValue)
  }

  const fitHeight = () => {
    const viewport = viewportRef.current
    const canvas = canvasRef.current
    const diagram = canvas?.querySelector('svg')
    if (!viewport || !canvas || !diagram || typeof window === 'undefined') {
      return
    }

    const diagramHeight = diagram.getBoundingClientRect().height
    if (!Number.isFinite(diagramHeight) || diagramHeight <= 0) {
      return
    }

    const viewportRect = viewport.getBoundingClientRect()
    const browserHeight = window.visualViewport?.height || window.innerHeight
    const targetViewportHeight = fullscreenOpen
      ? viewport.clientHeight
      : Math.max(
          MERMAID_FIT_HEIGHT.minPageHeight,
          browserHeight -
            Math.max(viewportRect.top, 0) -
            MERMAID_FIT_HEIGHT.pageBottomGap
        )
    const canvasStyle = window.getComputedStyle(canvas)
    const verticalPadding =
      (Number.parseFloat(canvasStyle.paddingTop) || 0) +
      (Number.parseFloat(canvasStyle.paddingBottom) || 0)
    const availableHeight = Math.max(1, targetViewportHeight - verticalPadding)
    const fittedZoom = (activeZoom * availableHeight) / diagramHeight

    setNextZoom(Math.min(MERMAID_ZOOM.defaultValue, fittedZoom))
  }

  const openFullscreen = () => {
    fullscreenReturnFocusRef.current =
      typeof document === 'undefined' ? null : document.activeElement
    setFullscreenZoom(MERMAID_ZOOM.defaultValue)
    setFullscreenOpen(true)
  }

  return (
    <div
      className={[
        'erp-markdown-mermaid',
        renderState.status === 'error' ? 'erp-markdown-mermaid--error' : '',
        fullscreenOpen ? 'erp-markdown-mermaid--fullscreen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-mermaid-status={renderState.status}
      data-mermaid-theme={theme}
      data-mermaid-html-labels={useFlowchartHtmlLabels ? 'true' : 'false'}
      data-mermaid-fullscreen={fullscreenOpen ? 'true' : 'false'}
      role={fullscreenOpen ? 'dialog' : undefined}
      aria-modal={fullscreenOpen ? 'true' : undefined}
      aria-label={fullscreenOpen ? `${displayLabel}全屏查看` : undefined}
    >
      {renderState.status === 'loading' ? (
        <div className="erp-markdown-mermaid__loading">
          {`正在渲染 ${displayLabel}...`}
        </div>
      ) : null}
      {renderState.status === 'rendered' ? (
        <>
          <div
            className="erp-markdown-mermaid__toolbar"
            aria-label={`${displayLabel}工具`}
          >
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="fit"
              title="适配宽度"
              aria-label={`适配${displayLabel}宽度`}
              onClick={() => setNextZoom(MERMAID_ZOOM.defaultValue)}
            >
              <FullscreenOutlined />
            </button>
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="fit-height"
              title="适配高度"
              aria-label={`适配${displayLabel}高度`}
              onClick={fitHeight}
            >
              <ColumnHeightOutlined />
            </button>
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="zoom-out"
              title="缩小"
              aria-label={`缩小${displayLabel}`}
              disabled={activeZoom <= MERMAID_ZOOM.min}
              onClick={() => setNextZoom(activeZoom - MERMAID_ZOOM.step)}
            >
              <ZoomOutOutlined />
            </button>
            <span
              className="erp-markdown-mermaid__zoom-label"
              data-mermaid-zoom-label
            >
              {zoomPercent}%
            </span>
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="zoom-in"
              title="放大"
              aria-label={`放大${displayLabel}`}
              disabled={activeZoom >= MERMAID_ZOOM.max}
              onClick={() => setNextZoom(activeZoom + MERMAID_ZOOM.step)}
            >
              <ZoomInOutlined />
            </button>
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="reset"
              title="重置 100%"
              aria-label={`重置${displayLabel}为 100%`}
              onClick={() => setNextZoom(MERMAID_ZOOM.defaultValue)}
            >
              <OneToOneOutlined />
            </button>
            {fullscreenOpen ? (
              <button
                ref={fullscreenExitRef}
                type="button"
                className="erp-markdown-mermaid__tool"
                data-mermaid-fullscreen-action="close"
                title="退出全屏"
                aria-label={`退出${displayLabel}全屏`}
                onClick={() => setFullscreenOpen(false)}
              >
                <FullscreenExitOutlined />
              </button>
            ) : (
              <button
                ref={fullscreenOpenRef}
                type="button"
                className="erp-markdown-mermaid__tool"
                data-mermaid-fullscreen-action="open"
                title="全屏查看"
                aria-label={`全屏查看${displayLabel}`}
                onClick={openFullscreen}
              >
                <ArrowsAltOutlined />
              </button>
            )}
          </div>
          <div ref={viewportRef} className="erp-markdown-mermaid__viewport">
            <div
              ref={canvasRef}
              className="erp-markdown-mermaid__canvas"
              data-mermaid-zoom={zoomPercent}
              style={{ '--mermaid-zoom': activeZoom }}
              // Mermaid returns the rendered SVG; securityLevel=strict is set above.
              dangerouslySetInnerHTML={{ __html: renderState.svg }}
            />
          </div>
        </>
      ) : null}
      {renderState.status === 'error' ? (
        <>
          <div className="erp-markdown-mermaid__error" role="alert">
            {`${displayLabel}渲染失败${showSourceOnError ? '，已保留源码：' : '：'}`}
            {renderState.error}
          </div>
          {showSourceOnError ? (
            <pre className="erp-markdown-mermaid__source">
              <code>{String(chart || '')}</code>
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
/* eslint-enable react/no-danger */

function MarkdownPre({ type, params, content, children }) {
  const language = String(params || '')
    .trim()
    .split(/\s+/)[0]
    .toLowerCase()

  if (type === 'fence' && language === 'mermaid') {
    return <MermaidDiagram chart={content} />
  }

  return <pre>{children}</pre>
}

const stripHeadingMarkdown = (rawTitle = '') =>
  String(rawTitle || '')
    .replace(/\s+#+\s*$/, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim()

const slugifyHeading = (rawTitle = '') =>
  stripHeadingMarkdown(rawTitle)
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

export const extractMarkdownHeadings = (source = '', levels = [2]) => {
  const normalizedLevels = new Set(
    levels
      .map((level) => Number(level || 0))
      .filter((level) => Number.isInteger(level) && level > 0)
  )
  const headingCounts = new Map()
  const headings = []
  const lines = String(source || '').split(/\r?\n/)
  let inFence = false

  lines.forEach((line) => {
    const trimmed = line.trim()

    if (/^```/.test(trimmed)) {
      inFence = !inFence
      return
    }

    if (inFence) {
      return
    }

    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(trimmed)
    if (!match) {
      return
    }

    const level = match[1].length
    if (!normalizedLevels.has(level)) {
      return
    }

    const title = stripHeadingMarkdown(match[2])
    if (!title) {
      return
    }

    const baseId = slugifyHeading(title) || `section-${headings.length + 1}`
    const nextCount = (headingCounts.get(baseId) || 0) + 1
    headingCounts.set(baseId, nextCount)

    headings.push({
      id: nextCount > 1 ? `${baseId}-${nextCount}` : baseId,
      level,
      title,
    })
  })

  return headings
}

const addHeadingIds = (node, headingQueue) => {
  if (!React.isValidElement(node)) {
    return node
  }

  const elementType = String(node.type || '')
  const headingMatch = /^h([1-6])$/.exec(elementType)
  const nextHeading = headingMatch ? headingQueue.shift() : null
  const children = React.Children.map(node.props.children, (child) =>
    addHeadingIds(child, headingQueue)
  )

  if (!nextHeading) {
    return React.cloneElement(node, undefined, children)
  }

  return React.cloneElement(
    node,
    {
      id: nextHeading.id,
    },
    children
  )
}

// Markdown md展示
export const Markdown = ({ source }) => {
  const md = new Remarkable()
  md.renderer = new RemarkableReactRenderer({
    components: {
      pre: MarkdownPre,
    },
  })
  const headingQueue = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
  return React.Children.map(md.render(source), (node) =>
    addHeadingIds(node, headingQueue)
  )
}
