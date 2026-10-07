import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowsAltOutlined,
  ColumnWidthOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
  OneToOneOutlined,
  SwapOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons'
import { Remarkable } from 'remarkable'
import RemarkableReactRenderer from 'remarkable-react'

import {
  extractMarkdownHeadings,
  stripSupportedExplicitAnchorLines,
} from './anchors.mjs'
import {
  MERMAID_ZOOM,
  normalizeMermaidZoom,
  getMermaidDirection,
  toggleMermaidDirection,
  withMermaidDirection,
  fitMermaidZoom,
} from './mermaidViewport.mjs'
import './mermaid.css'

export { extractMarkdownHeadings }

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
  initialZoom,
}) {
  const currentTheme = useCurrentERPTheme()
  const theme =
    themeMode === 'light' || themeMode === 'dark' ? themeMode : currentTheme
  const useFlowchartHtmlLabels = flowchartHtmlLabels !== false
  const autoPreview = !Number.isFinite(initialZoom)
  const startingZoom = autoPreview
    ? MERMAID_ZOOM.preview
    : normalizeMermaidZoom(initialZoom)
  const displayLabel = String(label || '').trim() || '图表'
  const diagramId = useMemo(() => {
    mermaidRenderSequence += 1
    return `erp-markdown-mermaid-${mermaidRenderSequence}`
  }, [])
  const [zoom, setZoom] = useState(startingZoom)
  const [fullscreenZoom, setFullscreenZoom] = useState(
    MERMAID_ZOOM.defaultValue
  )
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [direction, setDirection] = useState('')
  const activeDirection = direction || getMermaidDirection(chart)
  const nextDirection = toggleMermaidDirection(activeDirection)
  const renderedChart = withMermaidDirection(chart, direction)
  const layoutButtonRef = useRef(null)
  const fitOnRenderRef = useRef(false)
  const previewOnRenderRef = useRef(autoPreview)
  const restoreLayoutFocusRef = useRef(false)
  const dragRef = useRef(null)
  const [panning, setPanning] = useState(false)
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

  const setNextZoom = useCallback(
    (nextZoom) => {
      const nextValue = normalizeMermaidZoom(nextZoom)
      if (fullscreenOpen) setFullscreenZoom(nextValue)
      else setZoom(nextValue)
    },
    [fullscreenOpen]
  )

  const fitToView = useCallback(
    ({ preview = false } = {}) => {
      const viewport = viewportRef.current
      const canvas = canvasRef.current
      if (!viewport || !canvas) return
      const canvasStyle = window.getComputedStyle(canvas)
      const padding =
        (Number.parseFloat(canvasStyle.paddingTop) || 0) +
        (Number.parseFloat(canvasStyle.paddingBottom) || 0)
      const heightLimit = Number.parseFloat(
        window.getComputedStyle(viewport).maxHeight
      )
      const height = fullscreenOpen ? viewport.clientHeight : heightLimit
      const fittedZoom = fitMermaidZoom({
        width: renderState.intrinsicWidth,
        height: renderState.intrinsicHeight,
        viewportWidth: viewport.clientWidth,
        viewportHeight: height - padding,
      })
      setNextZoom(
        preview
          ? Math.max(
              MERMAID_ZOOM.previewMin,
              Math.min(MERMAID_ZOOM.preview, fittedZoom)
            )
          : fittedZoom
      )
      viewport.scrollTo(0, 0)
    },
    [
      fullscreenOpen,
      renderState.intrinsicWidth,
      renderState.intrinsicHeight,
      setNextZoom,
    ]
  )

  useLayoutEffect(() => {
    if (renderState.status !== 'rendered') return
    if (!fitOnRenderRef.current && !previewOnRenderRef.current) return
    const preview = !fitOnRenderRef.current && previewOnRenderRef.current
    fitOnRenderRef.current = false
    previewOnRenderRef.current = false
    fitToView({ preview })
    if (restoreLayoutFocusRef.current) {
      restoreLayoutFocusRef.current = false
      layoutButtonRef.current?.focus({ preventScroll: true })
    }
  }, [renderState.status, renderState.svg, fitToView])

  useEffect(() => {
    setZoom(startingZoom)
    setFullscreenZoom(MERMAID_ZOOM.defaultValue)
    setFullscreenOpen(false)
    setDirection('')
    fitOnRenderRef.current = false
    previewOnRenderRef.current = autoPreview
    restoreLayoutFocusRef.current = false
    dragRef.current = null
    setPanning(false)
  }, [chart, startingZoom, autoPreview])

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
    const source = String(renderedChart || '').trim()
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
          // Mermaid HTML labels contain HTML void tags such as <br>, not XML.
          const svgElement = new DOMParser()
            .parseFromString(svg, 'text/html')
            .querySelector('svg')
          const viewBox = svgElement
            ?.getAttribute('viewBox')
            ?.trim()
            .split(/\s+/u)
          const intrinsicWidth = Number(viewBox?.[2])
          const intrinsicHeight = Number(viewBox?.[3])
          setRenderState({
            status: 'rendered',
            svg,
            intrinsicWidth,
            intrinsicHeight,
            error: '',
          })
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
  }, [renderedChart, diagramId, theme, useFlowchartHtmlLabels])

  if (renderState.status === 'empty') {
    return null
  }

  const switchLayout = () => {
    fitOnRenderRef.current = true
    restoreLayoutFocusRef.current = true
    setDirection(nextDirection)
  }

  const startPan = (event) => {
    const viewport = event.currentTarget
    if (
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      event.target.closest('a, button, input, select, textarea') ||
      (viewport.scrollWidth <= viewport.clientWidth &&
        viewport.scrollHeight <= viewport.clientHeight)
    ) {
      return
    }
    event.preventDefault()
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: viewport.scrollLeft,
      top: viewport.scrollTop,
    }
    viewport.setPointerCapture(event.pointerId)
    setPanning(true)
  }

  const movePan = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = drag.left + drag.x - event.clientX
    event.currentTarget.scrollTop = drag.top + drag.y - event.clientY
  }

  const stopPan = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const openFullscreen = () => {
    fullscreenReturnFocusRef.current =
      typeof document === 'undefined' ? null : document.activeElement
    fitOnRenderRef.current = true
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
      data-mermaid-direction={activeDirection || undefined}
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
            {nextDirection ? (
              <button
                ref={layoutButtonRef}
                type="button"
                className="erp-markdown-mermaid__tool erp-markdown-mermaid__tool--layout"
                data-mermaid-layout-action="toggle"
                title={`切换为${['LR', 'RL'].includes(nextDirection) ? '左右' : '上下'}布局`}
                aria-label={`切换${displayLabel}为${['LR', 'RL'].includes(nextDirection) ? '左右' : '上下'}布局`}
                onClick={switchLayout}
              >
                <SwapOutlined />
                <span>切换布局</span>
              </button>
            ) : null}
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="fit-all"
              title="适应全图"
              aria-label={`适应${displayLabel}全图`}
              onClick={fitToView}
            >
              <FullscreenOutlined />
            </button>
            <button
              type="button"
              className="erp-markdown-mermaid__tool"
              data-mermaid-zoom-action="fit"
              title="适配宽度"
              aria-label={`适配${displayLabel}宽度`}
              onClick={() => setNextZoom(MERMAID_ZOOM.defaultValue)}
            >
              <ColumnWidthOutlined />
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
          {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- 图内滚动区域需要键盘聚焦，方向键沿用浏览器原生滚动。 */}
          <div
            ref={viewportRef}
            className="erp-markdown-mermaid__viewport"
            role="region"
            aria-label={`${displayLabel}画布`}
            tabIndex={0}
            data-mermaid-panning={panning ? 'true' : undefined}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={stopPan}
            onPointerCancel={stopPan}
            onLostPointerCapture={stopPan}
          >
            <div
              ref={canvasRef}
              className="erp-markdown-mermaid__canvas"
              data-mermaid-zoom={zoomPercent}
              style={{
                '--mermaid-zoom': activeZoom,
                '--mermaid-intrinsic-width':
                  Number.isFinite(renderState.intrinsicWidth) &&
                  renderState.intrinsicWidth > 0
                    ? `${renderState.intrinsicWidth}px`
                    : undefined,
              }}
              // Mermaid returns the rendered SVG; securityLevel=strict is set above.
              dangerouslySetInnerHTML={{ __html: renderState.svg }}
            />
          </div>
          {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
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

  const aliasAnchors = nextHeading.aliases.map((alias) => (
    <span
      key={`markdown-anchor-${alias}`}
      id={alias}
      data-markdown-anchor="alias"
      aria-hidden="true"
    />
  ))

  return React.cloneElement(node, {
    id: nextHeading.id,
    'data-markdown-anchor': 'heading',
    children: [...aliasAnchors, ...React.Children.toArray(children)],
  })
}

// Markdown md展示
export const Markdown = ({ source }) => {
  const md = new Remarkable()
  const ReactRenderer =
    RemarkableReactRenderer.default || RemarkableReactRenderer
  md.renderer = new ReactRenderer({
    components: {
      pre: MarkdownPre,
    },
  })
  const headingQueue = extractMarkdownHeadings(source, [1, 2, 3, 4, 5, 6])
  const renderSource = stripSupportedExplicitAnchorLines(source)
  return React.Children.map(md.render(renderSource), (node) =>
    addHeadingIds(node, headingQueue)
  )
}
