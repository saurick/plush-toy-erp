import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Popover } from 'antd'
import DiagramViewControls from './DiagramViewControls.jsx'
import { canRestoreOverlayFocus, useOverlayScope } from '../overlay/OverlayScopeContext.mjs'
import { isolateOverlaySiblings, lockOverlayScroll } from '../overlay/ScopedOverlayDialog.jsx'
import {
  MERMAID_ZOOM,
  normalizeMermaidZoom,
  getMermaidDirection,
  toggleMermaidDirection,
  withMermaidDirection,
  fitMermaidZoom,
} from './mermaidViewport.mjs'
import './mermaid.css'
import { bindMermaidNodeActions } from './mermaidNodeActions.mjs'
import { getMermaidTheme } from './mermaidTheme.mjs'
import { prepareMermaidSource } from './mermaidSemantics.mjs'

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

function getCurrentERPAppearance() {
  const root = typeof document === 'undefined' ? undefined : document.documentElement
  return { mode: root?.dataset.erpTheme === 'dark' ? 'dark' : 'light', accent: root?.dataset.erpAccent }
}

function useCurrentERPAppearance() {
  const [appearance, setAppearance] = useState(getCurrentERPAppearance)

  useEffect(() => {
    if (
      typeof document === 'undefined' ||
      typeof MutationObserver === 'undefined'
    ) {
      return undefined
    }

    const root = document.documentElement
    const syncTheme = () => {
      const next = getCurrentERPAppearance()
      setAppearance((previous) => previous.mode === next.mode && previous.accent === next.accent ? previous : next)
    }
    const observer = new MutationObserver(syncTheme)
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-erp-theme', 'data-erp-accent'],
    })
    syncTheme()
    return () => observer.disconnect()
  }, [])

  return appearance
}

/* eslint-disable react/no-danger */
export function MermaidDiagram({
  chart,
  label = 'Mermaid 图表',
  showSourceOnError = true,
  themeMode,
  flowchartHtmlLabels = true,
  printSize = false,
  nativeSize = false,
  interactiveNodes,
  interactiveEdges,
  selectedNodeId,
  onNodeSelect,
  onNodeInspect,
  onStatusChange,
  compactControls = false,
}) {
  const [inspection, setInspection] = useState(null)
  const overlay = useOverlayScope()
  const overlayRef = useRef(overlay)
  overlayRef.current = overlay
  const fullscreenVisible = overlay?.visible !== false
  const inspectionTrigger = useRef(null)
  const inspect = useCallback((item, trigger) => {
    if (trigger) inspectionTrigger.current = trigger
    onNodeInspect?.(item?.id || null, trigger)
    const target = trigger?.getBoundingClientRect()
    const root = trigger?.closest('.erp-markdown-mermaid')?.getBoundingClientRect()
    const anchor = target && root ? { left: target.left - root.left, top: target.top - root.top, width: target.width, height: target.height } : null
    setInspection(item ? { ...item, chart, anchor } : null)
  }, [chart, onNodeInspect])
  const appearance = useCurrentERPAppearance()
  const fixedTheme = themeMode === 'light' || themeMode === 'dark'
  const theme = fixedTheme ? themeMode : appearance.mode
  const accent = fixedTheme ? null : appearance.accent
  const useFlowchartHtmlLabels = flowchartHtmlLabels !== false
  const initialZoomMode = printSize ? 'manual' : 'fit-all'
  const displayLabel = String(label || '').trim() || '图表'
  const diagramId = useMemo(() => {
    mermaidRenderSequence += 1
    return `erp-markdown-mermaid-${mermaidRenderSequence}`
  }, [])
  const [zoom, setZoom] = useState(MERMAID_ZOOM.defaultValue)
  const [zoomMode, setZoomMode] = useState(initialZoomMode)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)
  const [fullscreenPlaceholder, setFullscreenPlaceholder] = useState(null)
  const [inlineViewportHeight, setInlineViewportHeight] = useState()
  const [direction, setDirection] = useState('')
  const activeDirection = direction || getMermaidDirection(chart)
  const nextDirection = toggleMermaidDirection(activeDirection)
  const renderedChart = withMermaidDirection(chart, direction)
  const diagramRef = useRef(null)
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
      if (!canRestoreOverlayFocus(overlayRef.current)) return
      const focusTarget = fullscreenOpenRef.current || returnFocusElement
      if (focusTarget?.isConnected && typeof focusTarget.focus === 'function') {
        focusTarget.focus({ preventScroll: true })
      }
    }, 0)
  }, [])

  const zoomPercent = Math.round(zoom * 100)
  const setNextZoom = useCallback((nextZoom, { mode = 'manual' } = {}) => {
    setInspection(null)
    setZoomMode(mode)
    setZoom(normalizeMermaidZoom(nextZoom))
  }, [])
  const closeFullscreen = useCallback(() => {
    setZoomMode('fit-all')
    setFullscreenOpen(false)
  }, [])

  const fitToView = useCallback(
    (mode = 'fit-all') => {
      const viewport = viewportRef.current
      const canvas = canvasRef.current
      if (!viewport || !canvas) return false
      const canvasStyle = window.getComputedStyle(canvas)
      const padding =
        (Number.parseFloat(canvasStyle.paddingTop) || 0) +
        (Number.parseFloat(canvasStyle.paddingBottom) || 0)
      const viewportStyle = window.getComputedStyle(viewport)
      const heightLimit = Number.parseFloat(viewportStyle.maxHeight)
      // 自适应高度取上限，避免图形缩小后继续把自身高度当成新的缩放上限。
      // 固定高度和 flex 画布取实际剩余空间，计入工具栏换行。
      const constrainedHeight =
        fullscreenOpen ||
        inlineViewportHeight ||
        Number.parseFloat(viewportStyle.flexGrow) > 0
      const height =
        constrainedHeight || !Number.isFinite(heightLimit)
          ? viewport.clientHeight
          : heightLimit
      if (
        viewport.clientWidth <= 0 ||
        viewport.clientHeight <= 0 ||
        height <= padding
      ) {
        return false
      }
      const fittedZoom = fitMermaidZoom({
        width: renderState.intrinsicWidth,
        height: renderState.intrinsicHeight,
        viewportWidth: viewport.clientWidth,
        viewportHeight:
          mode === 'fit-width' ? renderState.intrinsicHeight : height - padding,
        nativeSize,
      })
      setNextZoom(fittedZoom, { mode })
      viewport.scrollTo(0, 0)
      return true
    },
    [
      fullscreenOpen,
      inlineViewportHeight,
      nativeSize,
      renderState.intrinsicWidth,
      renderState.intrinsicHeight,
      setNextZoom,
    ]
  )

  useLayoutEffect(() => {
    if (
      renderState.status !== 'rendered' ||
      renderState.source !== renderedChart ||
      (zoomMode === 'manual' || zoomMode === 'reset')
    ) {
      return undefined
    }
    const viewport = viewportRef.current
    if (!viewport) return undefined
    let frame
    const fit = () => fitToView(zoomMode)
    const scheduleFit = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(fit)
    }
    fit()
    const observer = new ResizeObserver(scheduleFit)
    observer.observe(viewport)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
    }
  }, [
    renderState.status,
    renderState.svg,
    renderState.source,
    renderedChart,
    fullscreenOpen,
    zoomMode,
    fitToView,
  ])

  useEffect(() => {
    setZoom(MERMAID_ZOOM.defaultValue)
    setFullscreenOpen(false)
    setInlineViewportHeight(undefined)
    setDirection('')
    setZoomMode(initialZoomMode)
    dragRef.current = null
    setPanning(false)
  }, [chart, initialZoomMode])

  useLayoutEffect(() => {
    if (!fullscreenOpen || !fullscreenVisible) return undefined

    const root = diagramRef.current
    // 顶层显示保留 DOM 和主题继承，同时越过父级的裁剪与层叠上下文。
    root.showPopover()
    return () => {
      if (root.matches(':popover-open')) root.hidePopover()
    }
  }, [fullscreenOpen, fullscreenVisible])

  useEffect(() => {
    if (!fullscreenOpen || !fullscreenVisible || typeof document === 'undefined') {
      return undefined
    }

    const root = diagramRef.current
    const boundary = overlay?.enabled ? overlay.containerRef.current : document.body
    const releases = [lockOverlayScroll(boundary)]
    if (overlay?.enabled) releases.push(isolateOverlaySiblings(root, boundary))
    const returnFocusElement = fullscreenReturnFocusRef.current
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && (!overlay?.enabled || root.contains(event.target))) {
        event.preventDefault()
        event.stopPropagation()
        closeFullscreen()
      }
    }
    document.addEventListener('keydown', closeOnEscape, true)
    const focusTimer = window.setTimeout(
      () => { if (canRestoreOverlayFocus(overlayRef.current)) fullscreenExitRef.current?.focus({ preventScroll: true }) },
      0
    )

    return () => {
      window.clearTimeout(focusTimer)
      releases.toReversed().forEach((release) => release())
      document.removeEventListener('keydown', closeOnEscape, true)
      restoreFullscreenFocus(returnFocusElement)
    }
  }, [fullscreenOpen, fullscreenVisible, overlay, restoreFullscreenFocus, closeFullscreen])

  useEffect(() => {
    const source = String(renderedChart || '').trim()
    let cancelled = false

    if (!source) {
      setRenderState({ status: 'empty', svg: '', error: '' })
      return undefined
    }

    async function renderMermaid() {
      // Keep the current diagram mounted while changing its presentation.
      // A different chart must not display the previous chart's content.
      setRenderState((previous) => ({
        ...(previous.chart === chart ? previous : { svg: '' }),
        status: 'loading',
        error: '',
      }))
      try {
        const mermaidModule = await import('mermaid')
        const mermaid = mermaidModule.default || mermaidModule
        if (source.includes('fa:fa-erp-') && useFlowchartHtmlLabels) {
          const { mermaidIconPack } = await import('./mermaidIcons.jsx')
          mermaid.registerIconPacks([{ name: 'fa', icons: mermaidIconPack }])
        }
        const renderTheme = getMermaidTheme({ mode: theme })
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
          return mermaid.render(renderId, prepareMermaidSource(source, { mode: theme, htmlLabels: useFlowchartHtmlLabels }))
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
            theme,
            chart,
            source: renderedChart,
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
            error: '请刷新页面后重试。',
          })
        }
      }
    }

    renderMermaid()
    return () => {
      cancelled = true
    }
  }, [chart, renderedChart, diagramId, theme, useFlowchartHtmlLabels])

  useEffect(() => {
    if (renderState.chart !== chart || !interactiveNodes?.length) {
      return undefined
    }
    return bindMermaidNodeActions(
      canvasRef.current,
      interactiveNodes,
      onNodeSelect ? (id) => {
        onNodeSelect?.(id)
        if (fullscreenOpen) closeFullscreen()
        else setZoomMode('fit-all')
      } : undefined,
      selectedNodeId,
      { edges: interactiveEdges, onInspect: inspect }
    )
  }, [
    chart,
    renderState.chart,
    renderState.svg,
    interactiveNodes,
    interactiveEdges,
    inspect,
    selectedNodeId,
    onNodeSelect,
    fullscreenOpen,
    closeFullscreen,
  ])

  useEffect(() => { onStatusChange?.(renderState.status) }, [onStatusChange, renderState.status])

  if (renderState.status === 'empty') {
    return null
  }

  const switchLayout = () => {
    if (!fullscreenOpen) {
      setInlineViewportHeight(viewportRef.current?.clientHeight)
    }
    setZoomMode('fit-all')
    setDirection((previous) =>
      toggleMermaidDirection(previous || getMermaidDirection(chart))
    )
  }

  const startPan = (event) => {
    const viewport = event.currentTarget
    if (
      event.button !== 0 ||
      event.pointerType === 'touch' ||
      event.target.closest(
        'a, button, input, select, textarea, [role="button"]'
      ) ||
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
    setZoomMode('fit-all')
    const root = diagramRef.current
    setFullscreenPlaceholder({
      height: root.getBoundingClientRect().height,
      margin: window.getComputedStyle(root).margin,
    })
    setInlineViewportHeight(viewportRef.current?.clientHeight)
    setFullscreenOpen(true)
  }

  const diagram = (
    <div
      ref={diagramRef}
      className={[
        'erp-markdown-mermaid',
        renderState.status === 'error' ? 'erp-markdown-mermaid--error' : '',
        fullscreenOpen ? 'erp-markdown-mermaid--fullscreen' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-mermaid-status={renderState.status}
      data-mermaid-theme={renderState.theme || theme}
      data-mermaid-accent={accent || 'fixed'}
      data-mermaid-html-labels={useFlowchartHtmlLabels ? 'true' : 'false'}
      data-mermaid-direction={activeDirection || undefined}
      data-mermaid-fullscreen={fullscreenOpen ? 'true' : 'false'}
      data-mermaid-native-size={nativeSize || undefined}
      data-mermaid-toolbar={compactControls && !fullscreenOpen ? 'compact' : 'full'}
      data-mermaid-zoom-mode={zoomMode}
      popover={fullscreenOpen ? 'manual' : undefined}
      aria-busy={renderState.status === 'loading'}
      role={fullscreenOpen ? 'dialog' : undefined}
      aria-modal={fullscreenOpen ? overlay?.enabled ? 'false' : 'true' : undefined}
      aria-label={fullscreenOpen ? `${displayLabel}全屏查看` : undefined}
    >
      {renderState.status === 'loading' ? (
        <div
          className={`erp-markdown-mermaid__loading${renderState.svg ? ' erp-markdown-mermaid__loading--overlay' : ''}`}
          role="status"
        >
          {`正在渲染 ${displayLabel}...`}
        </div>
      ) : null}
      {renderState.svg ? (
        <>
          <div
            className="erp-markdown-mermaid__toolbar"
            aria-label={`${displayLabel}工具`}
          >
            <DiagramViewControls
              compact={compactControls && !fullscreenOpen}
              label={displayLabel}
              zoom={zoom}
              zoomMode={zoomMode}
              minZoom={MERMAID_ZOOM.min}
              maxZoom={MERMAID_ZOOM.max}
              onFit={fitToView}
              nextLayoutDirection={nextDirection}
              onSwitchLayout={switchLayout}
              onZoomOut={() => setNextZoom(zoom - MERMAID_ZOOM.step)}
              onZoomIn={() => setNextZoom(zoom + MERMAID_ZOOM.step)}
              onReset={() => setNextZoom(MERMAID_ZOOM.defaultValue, { mode: 'reset' })}
              fullscreen={fullscreenOpen}
              fullscreenButtonRef={fullscreenOpen ? fullscreenExitRef : fullscreenOpenRef}
              onFullscreen={fullscreenOpen ? closeFullscreen : openFullscreen}
            />
          </div>
          {/* eslint-disable jsx-a11y/no-noninteractive-tabindex -- 图内滚动区域需要键盘聚焦，方向键沿用浏览器原生滚动。 */}
          <div
            ref={viewportRef}
            className="erp-markdown-mermaid__viewport"
            data-scroll-edges="off"
            role="region"
            aria-label={`${displayLabel}画布`}
            tabIndex={0}
            data-mermaid-panning={panning ? 'true' : undefined}
            style={{
              '--mermaid-viewport-height': inlineViewportHeight
                ? `${inlineViewportHeight}px`
                : undefined,
            }}
            onPointerDown={startPan}
            onPointerMove={movePan}
            onPointerUp={stopPan}
            onPointerCancel={stopPan}
            onLostPointerCapture={stopPan}
            onScroll={() => setInspection(null)}
          >
            <div
              ref={canvasRef}
              className="erp-markdown-mermaid__canvas"
              data-mermaid-zoom={zoomPercent}
              style={{
                '--mermaid-zoom': zoom,
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
          {(!onNodeInspect || fullscreenOpen) && inspection?.chart === chart && inspection.description && inspection.anchor ? (
            <Popover
              open
              trigger={[]}
              placement="top"
              getPopupContainer={fullscreenOpen ? () => diagramRef.current : undefined}
              content={(
                <div className="erp-markdown-mermaid__inspection" role="status" aria-live="polite">
                  <strong>{inspection.label}</strong>
                  {inspection.description !== inspection.label ? <span>{inspection.description}</span> : null}
                  <button
                    type="button"
                    className="erp-diagram-view-controls__button"
                    aria-label="关闭图形说明"
                    onKeyDown={(event) => { if (event.key === 'Escape') { inspectionTrigger.current?.focus({ preventScroll: true }); setInspection(null) } }}
                    onClick={() => {
                const current = [...(canvasRef.current?.querySelectorAll('[data-mermaid-node-id], [data-id][role="button"]') || [])].find((element) => element.getAttribute('data-mermaid-node-id') === inspection.id || element.getAttribute('data-id') === inspection.id)
                ;(current || inspectionTrigger.current)?.focus({ preventScroll: true })
                setInspection(null)
              }}
                  ><CloseOutlined />
                  </button>
                </div>
            )}
            >
              <span aria-hidden="true" className="erp-markdown-mermaid__inspection-anchor" style={inspection.anchor} />
            </Popover>
          ) : null}
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

  return (
    <>
      {fullscreenOpen ? (
        <div
          className="erp-markdown-mermaid-placeholder"
          style={fullscreenPlaceholder}
          aria-hidden="true"
        />
      ) : null}
      {diagram}
    </>
  )
}
/* eslint-enable react/no-danger */
