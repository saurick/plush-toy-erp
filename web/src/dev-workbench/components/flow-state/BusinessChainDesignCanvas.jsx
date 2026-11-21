import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button, Dropdown, Space, Splitter } from 'antd'
import DiagramViewControls from '@/common/components/diagram/DiagramViewControls.jsx'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
import BusinessChainDesignViewPanel from './BusinessChainDesignViewPanel.jsx'
import BusinessChainDesignPicker from './BusinessChainDesignPicker.jsx'
import { WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import {
  CHAIN_DESIGN_NODE_SIZE as size,
  CHAIN_DESIGN_TYPES,
  CHAIN_DESIGN_DOMAINS,
  assessBusinessChainConnection,
  addBusinessChainDraftEdge,
} from '../../config/devBusinessChainDesign.mjs'
import { routeBusinessChainEdges, businessChainNeighbors, orientBusinessChainPoint } from '../../config/devBusinessChainDesignView.mjs'
import {
  businessChainMapState,
  expandBusinessChainMap,
  growBusinessChainMap,
  collapseBusinessChainMapGrowth,
  businessChainMapCanCollapseGrowth,
  businessChainMapCanGrow,
  focusBusinessChainMap,
  arrangeBusinessChainMap,
  toggleBusinessChainMapRegion,
  hideBusinessChainMapEdges,
  removeBusinessChainMapNode,
} from '../../config/devBusinessChainMap.mjs'
import BusinessChainDesignDetails, {
  ChainDesignEvidence,
} from './BusinessChainDesignDetails.jsx'
import { businessChainHandoffs, businessChainLaneBands, businessChainRelationLayer, projectBusinessChainReading } from '../../config/devBusinessChainReading.mjs'
import BusinessChainHandoffMap from './BusinessChainHandoffMap.jsx'
import { ChainPurposeDetails, ChainHandoffDetails } from './BusinessChainReadingDetails.jsx'

const connectionLabels = {
  known: '有接入规则',
  unknown: '待核对',
  blocked: '不能直连',
  source: '当前起点',
}
const connectionPreview = (node, pointer, direction) => {
  const from = { x: node.x + size.width, y: node.y + size.height / 2 }
  const to = orientBusinessChainPoint(pointer, direction)
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2)
  const pointText = (point) => {
    const { x, y } = orientBusinessChainPoint(point, direction)
    return `${x} ${y}`
  }
  return `M ${pointText(from)} C ${pointText({ ...from, x: from.x + bend })}, ${pointText({ ...to, x: to.x - bend })}, ${pointText(to)}`
}

function CanvasCard({ title, onClose, actions, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => { ref.current?.focus({ preventScroll: true }) }, [])
  return (
    <section ref={ref} tabIndex={-1} role="dialog" aria-label={title} className="erp-chain-design__card">
      <header><strong>{title}</strong><Button aria-label="关闭画布说明" onClick={onClose}>关闭</Button></header>
      <div className="erp-chain-design__card-body">{children}</div>
      {actions ? <footer className="erp-chain-design__card-actions">{actions}</footer> : null}
    </section>
  )
}

function DraftNotes({ draft, change }) {
  const [text, setText] = useState('')
  return (
    <>
      <p>记录待讨论的顺序、接入条件或状态规则。</p>
      <BusinessTextArea
        aria-label="视图备注内容"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={2000}
        minRows={3}
        placeholder="例如：这个接点还需要核对哪项前置条件？"
      />
      <div className="erp-chain-design__actions">
        <Button
          disabled={!text.trim()}
          onClick={() => {
            change((previous) => ({
              ...previous,
              ideas: [...previous.ideas, { text: text.trim() }],
            }))
            setText('')
          }}
        >
          添加备注
        </Button>
      </div>
      {draft.ideas.map((idea, index) => (
        <div key={index} className="erp-chain-design__state-transition">
          <p>{idea.text}</p>
          <Button
            danger
            onClick={() =>
              change((previous) => ({
                ...previous,
                ideas: previous.ideas.filter((_, i) => i !== index),
              }))
            }
          >
            移除第 {index + 1} 条备注
          </Button>
        </div>
      ))}
    </>
  )
}

export default function BusinessChainDesignCanvas({
  scopeField,
  setLayout,
  returnAction,
  resultTrigger,
  frameKey,
  fullscreen,
  toggleFullscreen,
  fullscreenButtonRef,
  map,
  projected,
  globalOverview,
  effectiveMode,
  setViewMode,
  catalog,
  library,
  draft,
  change,
  onUndo,
  onRedo,
  addNode,
  role,
  connecting,
  setConnecting,
  selection,
  setSelection,
  notice,
  setNotice,
  view,
  setView,
  viewRequest,
  onNavigate,
  onNavigateChain,
  onReturn,
  layers,
  layout,
  setReadingOptions,
  onCameraCommit,
}) {
  const viewport = useRef(null)
  const scopePurpose = useRef(null)
  const handoffDock = useRef(null)
  const handoffTrigger = useRef(null)
  const panTarget = useRef(null)
  const surface = useRef(null)
  const gesture = useRef(null)
  const suppressClick = useRef(false)
  const [pointer, setPointer] = useState(null)
  const [panning, setPanning] = useState(false)
  const [highlightPath, setHighlightPath] = useState(null)
  const [areaWidth, setAreaWidth] = useState(1000)
  const [detailShare, setDetailShare] = useState(36)
  const inspectorOnly = Boolean(selection && areaWidth < 820)
  const [cameraDirty, setCameraDirty] = useState(false)
  useEffect(() => { setCameraDirty(false) }, [viewRequest.revision])
  useEffect(() => {
    if (!cameraDirty) return undefined
    const commit = () => { onCameraCommit(view); setCameraDirty(false) }
    const timer = window.setTimeout(commit, 200)
    window.addEventListener('pagehide', commit)
    return () => { window.clearTimeout(timer); window.removeEventListener('pagehide', commit) }
  }, [cameraDirty, onCameraCommit, view])
  useEffect(() => { setHighlightPath(null) }, [selection?.nodeId])
  const canGrowUpstream = businessChainMapCanGrow(draft, library, 'upstream')
  const canGrowDownstream = businessChainMapCanGrow(draft, library, 'downstream')
  const canCollapseGrowth = businessChainMapCanCollapseGrowth(draft, library)
  const cameraScope = useRef(null)
  const pendingFit = useRef(false)
  const [frameRequest, setFrameRequest] = useState({ revision: 0, chainKey: null })
  const requestFrame = (chainKey = null) =>
    setFrameRequest((previous) => ({
      revision: previous.revision + 1,
      chainKey,
    }))
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const area = viewport.current
    const outer = area.closest('.erp-chain-design__canvas-area')
    const measure = () => {
      setAreaWidth(outer.clientWidth)
      setViewportSize((previous) =>
        previous.width === area.clientWidth &&
        previous.height === area.clientHeight
          ? previous
          : { width: area.clientWidth, height: area.clientHeight }
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(area)
    observer.observe(outer)
    measure()
    return () => observer.disconnect()
  }, [])
  const zoomTo = useCallback((next, anchor) => {
    setCameraDirty(true)
    const area = viewport.current
    const focus = anchor || {
      x: area.clientWidth / 2,
      y: area.clientHeight / 2,
    }
    setView((previous) => {
      const scale = Math.max(
        0.05,
        Math.min(2, typeof next === 'function' ? next(previous.scale) : next)
      )
      const ratio = scale / previous.scale
      return {
        ...previous,
        scale,
        mode: 'manual',
        x: focus.x - (focus.x - previous.x) * ratio,
        y: focus.y - (focus.y - previous.y) * ratio,
      }
    })
  }, [setView])
  useEffect(() => {
    const area = viewport.current
    const wheel = (event) => {
      event.preventDefault()
      if (gesture.current) return
      const unit =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? area.clientHeight
            : 1
      if (event.ctrlKey || event.metaKey) {
        const rect = area.getBoundingClientRect()
        zoomTo((scale) => scale * Math.exp(-event.deltaY * unit * 0.002), {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        })
      } else {
        setCameraDirty(true)
        setView((previous) => ({
          ...previous,
          mode: 'manual',
          x:
            previous.x -
            (event.deltaX + (event.shiftKey ? event.deltaY : 0)) * unit,
          y: previous.y - (event.shiftKey ? 0 : event.deltaY) * unit,
        }))
      }
    }
    area.addEventListener('wheel', wheel, { passive: false })
    return () => area.removeEventListener('wheel', wheel)
  }, [zoomTo, setView])
  const arrow = useId().replaceAll(':', '')
  const { scopeSummary } = projected
  const expandedInScope = Boolean(scopeSummary && map.expandedChains.includes(scopeSummary.chainKey))
  const expandedOverview = globalOverview && map.expandedChains.length > 0
  const reading = projectBusinessChainReading(projected, library, { scope: map.scope, mode: effectiveMode, layout, expandedNodes: map.expandedNodes, showBranches: draft.presentation?.showBranches, selection, pathIds: highlightPath || [] })
  const hasBranches = projectBusinessChainReading(projected, library, { scope: map.scope, mode: effectiveMode }).nodes.length < projected.nodes.length
  const directHandoffs = businessChainHandoffs(catalog, map.chainKey)
  const showHandoffs = Boolean(map.showHandoffs && directHandoffs.length)
  const relations = globalOverview ? reading.edges.flatMap((edge) => edge.overview || []) : showHandoffs ? directHandoffs : []
  const graph = {
    ...reading,
    edges: reading.edges.filter((edge) => !edge.overview || (globalOverview && layers.includes(businessChainRelationLayer(edge.overview)))),
  }
  const usesDirection = globalOverview || layout === 'flow'
  const canSwitchDirection = usesDirection && (globalOverview || map.chainKey !== 'all')
  const direction = usesDirection && draft.presentation?.direction === 'TB' ? 'TB' : 'LR'
  const nextDirection = direction === 'TB' ? 'LR' : 'TB'
  const itemFor = (id) =>
    graph.nodes.find((node) => node.id === id && node.summary) ||
    library.byId.get(id)
  const nodes = direction === 'TB'
    ? graph.nodes.map((node) => ({ ...node, ...orientBusinessChainPoint(node, direction) }))
    : graph.nodes
  const roleCounts = new Map()
  for (const node of reading.nodes) {
    if (node.summary) continue
    for (const key of new Set(library.byId.get(node.id).roles)) {
      roleCounts.set(key, (roleCounts.get(key) || 0) + 1)
    }
  }
  const presentRoles = library.roles.filter(({ value }) => roleCounts.has(value))
  const absentRoles = library.roles.filter(({ value }) => !roleCounts.has(value))
  const roleGroups = [
    { key: 'present', label: '本图有节点', options: presentRoles.map((item) => ({ ...item, count: roleCounts.get(item.value) })) },
    { key: 'absent', label: '本图暂无节点', options: absentRoles },
  ].filter((group) => group.options.length)
  const roleMatchCount = roleCounts.get(role) || 0
  const bands = layout === 'lanes' ? businessChainLaneBands(graph, library, direction) : []
  const routes = routeBusinessChainEdges(graph, direction)
  const connectingNode = connecting && graph.nodes.find((node) => node.id === connecting)
  const width = Math.max(720, ...nodes.map((node) => node.x + size.width + 60))
  const height = Math.max(
    440,
    ...nodes.map((node) => node.y + size.height + 80),
    ...routes.map((edge) => edge.labelY + 40)
  )
  const point = (event) => {
    const rect = surface.current.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / view.scale,
      y: (event.clientY - rect.top) / view.scale,
    }
  }
  const close = () => {
    const id = selection?.anchorId || selection?.nodeId || selection?.to
    setSelection(null)
    if (handoffTrigger.current?.isConnected && (selection?.overview || selection?.chainKey)) {
      handoffTrigger.current.focus({ preventScroll: true })
      handoffTrigger.current = null
      return
    }
    if (selection?.detailsOnly && resultTrigger.current?.isConnected) {
      const source = resultTrigger.current
      requestAnimationFrame(() => source.focus({ preventScroll: true }))
      return
    }
    if (selection?.chainKey === map.chainKey && scopePurpose.current) {
      scopePurpose.current.focus({ preventScroll: true })
      return
    }
    const item = [
      ...(surface.current?.querySelectorAll('[data-design-node]') || []),
    ].find((el) => el.dataset.designNode === id)
    item?.querySelector('button')?.focus({ preventScroll: true })
  }
  const cancel = () => {
    gesture.current = null
    setPanning(false)
    setPointer(null)
    setConnecting(null)
    setSelection(null)
  }
  const fit = (mode, reset = true, preferredChain = null) => {
    if (!nodes.length) return
    const area = viewport.current
    if (!area.clientWidth || !area.clientHeight) return
    if (reset) cancel()
    // Overview cards use their own map positions; width reading follows the expanded steps.
    const chainKey =
      effectiveMode === 'overview' && mode === 'fit-width'
        ? [
            preferredChain,
            reset &&
              (selection?.chainKey ||
                library.byId.get(selection?.nodeId)?.chainKey),
            view.chainKey,
            ...map.expandedChains.toReversed(),
          ].find(
            (key) =>
              key &&
              map.expandedChains.includes(key) &&
              nodes.some(
                (node) =>
                  !node.summary && library.byId.get(node.id).chainKey === key
              )
          ) || null
        : null
    const overviewOnly = mode === 'fit-overview'
    const fittedNodes = chainKey
      ? nodes.filter(
          (node) =>
            !node.summary && library.byId.get(node.id).chainKey === chainKey
        )
      : overviewOnly ? nodes.filter((node) => node.summary) : nodes
    const ids = new Set(fittedNodes.map((node) => node.id))
    const fittedBands = chainKey && layout === 'lanes'
      ? businessChainLaneBands({ ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)) }, library, direction)
      : bands
    const bounds = fittedNodes.map((node) => ({ ...node, ...size }))
    if (!overviewOnly) bounds.push(...fittedBands)
    for (const edge of surface.current.querySelectorAll('[data-design-edge]')) {
      if (ids.has(edge.dataset.edgeFrom) && ids.has(edge.dataset.edgeTo)) {
        bounds.push(edge.getBBox())
      }
    }
    const left = Math.min(...bounds.map((box) => box.x)) - 16
    const top = Math.min(...bounds.map((box) => box.y)) - 16
    const right = Math.max(...bounds.map((box) => box.x + box.width)) + 16
    const bottom = Math.max(...bounds.map((box) => box.y + box.height)) + 16
    // Fit all nodes even when the overview needs less than the manual zoom minimum.
    const scale = Math.min(
      1,
      area.clientWidth / (right - left),
      mode === 'fit-width' ? 1 : area.clientHeight / (bottom - top)
    )
    setView({
      scale,
      mode,
      chainKey,
      x: (area.clientWidth - (right + left) * scale) / 2,
      y:
        mode === 'fit-width' || expandedInScope
          ? -top * scale
          : (area.clientHeight - (bottom + top) * scale) / 2,
    })
    if (reset) {
      setCameraDirty(true)
      const label = chainKey
        ? library.chains.find(({ value }) => value === chainKey).label
        : '当前范围'
      setNotice(
        mode === 'fit-width'
          ? `${label}已适配宽度，滚轮可上下查看。`
          : '已显示全图。'
      )
    }
  }
  const switchLayout = () => {
    setCameraDirty(false)
    setView((previous) => ({ ...previous, mode: 'fit-all', chainKey: null }))
    setReadingOptions({ direction: nextDirection, viewport: undefined })
  }
  const scopeKey = `${frameKey}:${frameRequest.revision}:${effectiveMode}:${viewRequest.revision}:${direction}`
  const geometryKey = JSON.stringify([
    nodes.map(({ id, x, y }) => [id, x, y]),
    graph.edges.map(({ from, to, kind }) => [from, to, kind]),
  ])
  const viewportKey = `${fullscreen}:${viewportSize.width}:${viewportSize.height}`
  const fitRef = useRef(fit)
  useLayoutEffect(() => {
    fitRef.current = fit
  })
  useLayoutEffect(() => {
    const previous = cameraScope.current
    if (!nodes.length) {
      if (previous) setView({ x: 0, y: 0, scale: 1, mode: 'manual' })
      cameraScope.current = null
      return
    }
    const changedScope = previous?.scopeKey !== scopeKey
    const changedFrame = previous?.revision !== frameRequest.revision
    cameraScope.current = {
      scopeKey,
      geometryKey,
      viewportKey,
      revision: frameRequest.revision,
      restoreRevision: viewRequest.revision,
    }
    // A saved automatic camera may have included a distant overview card.
    const refitScope = (expandedInScope || expandedOverview) && viewRequest.view?.mode !== 'manual'
    if (previous?.restoreRevision !== viewRequest.revision && viewRequest.view && !refitScope) {
      pendingFit.current = false
      return
    }
    if (changedScope) pendingFit.current = true
    if (
      !changedScope &&
      previous?.geometryKey === geometryKey &&
      previous?.viewportKey === viewportKey
    ) return
    if (!pendingFit.current && !changedScope && (view.mode === 'manual' || selection)) return
    // An entry from the example first unhides the canvas; fit after its size is available.
    if (!viewport.current.clientWidth || !viewport.current.clientHeight) return
    const fitOverview = expandedOverview && (changedScope || view.mode === 'fit-overview')
    const mode = view.mode === 'fit-width' ? 'fit-width' : fitOverview ? 'fit-overview' : 'fit-all'
    fitRef.current(mode, false, changedFrame ? frameRequest.chainKey : view.chainKey)
    pendingFit.current = false
  }, [
    nodes.length,
    scopeKey,
    geometryKey,
    viewportKey,
    frameRequest.revision,
    frameRequest.chainKey,
    view.mode,
    view.chainKey,
    selection,
    viewRequest,
    expandedInScope,
    expandedOverview,
    setView,
  ])
  const pan = (event) => {
    if (event.button !== 0 && event.button !== 1) return
    if (
      event.button === 0 &&
      event.target.closest('[data-design-node], [data-design-edge]')
    ) {
      return
    }
    event.preventDefault()
    gesture.current = {
      kind: 'pan',
      start: { x: event.clientX, y: event.clientY },
      original: view,
    }
    setPanning(true)
    panTarget.current.focus({ preventScroll: true })
    viewport.current.setPointerCapture(event.pointerId)
  }
  const startConnect = (id) => {
    setConnecting(id)
    setSelection(null)
    setPointer(null)
  }
  const inspect = (id) => {
    if (suppressClick.current) {
      suppressClick.current = false
      return
    }
    setSelection(
      id.startsWith('map:')
        ? { chainKey: id.slice(4) }
        : connecting
          ? { from: connecting, to: id }
          : { nodeId: id }
    )
  }
  const startLine = (event, id) => {
    if (event.button !== 0) return
    event.stopPropagation()
    startConnect(id)
    gesture.current = {
      kind: 'line',
      id,
      start: point(event),
      moved: false,
    }
    viewport.current.setPointerCapture(event.pointerId)
  }
  const move = (event) => {
    const active = gesture.current
    if (!active) return
    if (active.kind === 'pan') {
      setView({
        ...active.original,
        mode: 'manual',
        x: active.original.x + event.clientX - active.start.x,
        y: active.original.y + event.clientY - active.start.y,
      })
      return
    }
    const position = point(event)
    const dx = position.x - active.start.x
    const dy = position.y - active.start.y
    if (Math.hypot(dx, dy) * view.scale < 4 && !active.moved) return
    active.moved = true
    setPointer(position)
  }
  const up = (event) => {
    const active = gesture.current
    if (!active) return
    gesture.current = null
    if (viewport.current.hasPointerCapture(event.pointerId)) {
      viewport.current.releasePointerCapture(event.pointerId)
    }
    if (active.kind === 'pan') {
      setPanning(false)
      setCameraDirty(true)
      return
    }
    const target = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-design-node]')
    if (active.moved && target && surface.current.contains(target) &&
        library.byId.has(target.dataset.designNode)) {
      setSelection({ from: active.id, to: target.dataset.designNode })
    }
    setPointer(null)
    suppressClick.current = active.moved
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }
  const assessment =
    selection?.from && !selection.summary
      ? assessBusinessChainConnection(library, selection.from, selection.to)
      : null
  const existingEdge =
    selection?.from &&
    !selection.summary &&
    draft.edges.find(
      (edge) =>
        (edge.from === selection.from && edge.to === selection.to) ||
        (edge.kind === 'unknown' &&
          edge.from === selection.to &&
          edge.to === selection.from)
    )
  const selectedSummary =
    selection?.chainKey &&
    library.chains.find(({ value }) => value === selection.chainKey)
  const selectedNode = library.byId.get(selection?.nodeId)
  const removableNode =
    selectedNode && map.visibleIds.includes(selectedNode.id)
  // A mainline edge represents paths; disconnect their final links without removing intermediate nodes.
  const selectedEdges = new Set(
    selection?.summary
      ? selection.summary.paths.map((path) =>
          JSON.stringify([path.at(-1).from, path.at(-1).to])
        )
      : existingEdge
        ? [JSON.stringify([existingEdge.from, existingEdge.to])]
        : []
  )
  const canRemove =
    removableNode ||
    draft.edges.some((edge) =>
      selectedEdges.has(JSON.stringify([edge.from, edge.to]))
    )
  const removeSelection = () => {
    if (!canRemove) return
    change((previous) =>
      removableNode
        ? removeBusinessChainMapNode(previous, library, selectedNode.id)
        : hideBusinessChainMapEdges(previous, library, [...selectedEdges])
    )
    cancel()
    setNotice(
      removableNode
        ? '节点及相关视图连线已移出，可撤销。'
        : '已移除视图连线，可撤销。'
    )
    panTarget.current?.focus({ preventScroll: true })
  }
  const focusId = selection?.chainKey
    ? nodes.some((node) => node.id === `map:${selection.chainKey}`) ? `map:${selection.chainKey}` : null
    : nodes.some((node) => node.id === (selection?.anchorId || selection?.nodeId)) ? selection?.anchorId || selection?.nodeId : null
  const nearby = new Set([
    focusId,
    ...graph.edges
      .filter((edge) => edge.from === focusId || edge.to === focusId)
      .flatMap((edge) => [edge.from, edge.to]),
  ])
  const overviewInGraph = Boolean(selection?.overview && graph.edges.some((edge) => edge.overview?.key === selection.overview.key))
  const emphasized = highlightPath ? new Set(highlightPath) : overviewInGraph
    ? new Set([`map:${selection.overview.fromChainKey}`, `map:${selection.overview.toChainKey}`]) : nearby
  const hasEmphasis = Boolean(highlightPath || overviewInGraph || focusId)
  const pending = connecting && library.byId.get(connecting)
  const toggleChain = (key) => {
    const opening = !map.expandedChains.includes(key)
    change((previous) => toggleBusinessChainMapRegion(previous, library, key))
    if (globalOverview) {
      setView((previous) => ({ ...previous, mode: 'manual', chainKey: opening ? key : previous.chainKey }))
      setNotice(opening ? '已展开步骤，可用「适配宽度」查看。' : '已收起这条链路的步骤。')
      return
    }
    setSelection(null)
    requestFrame(opening ? key : null)
    setNotice('已调整这条链路的展开状态，其他区域位置保留。')
  }
  const cardActions = selectedSummary ? (
    <>
      {effectiveMode === 'overview' && !globalOverview && selectedSummary.value === map.chainKey ? (
        <Button type="primary" onClick={() => toggleChain(selectedSummary.value)}>
          {map.expandedChains.includes(selectedSummary.value)
            ? '折叠这条链路为卡片'
            : '展开这条链路的步骤'}
        </Button>
      ) : null}
      {map.chainKey !== selectedSummary.value ? (
        <Button onClick={() => onNavigateChain(selectedSummary.value)}>只看这条链路</Button>
      ) : null}
    </>
  ) : selection?.overview ? null : selection?.summary ? (
    <>
      <Button
        onClick={() => {
          const ids = selection.summary.paths.flatMap((path) =>
            path.flatMap((edge) => [edge.from, edge.to])
          )
          change((previous) => ({
            ...previous,
            map: {
              ...map,
              expandedNodes: [...new Set([...map.expandedNodes, ...ids])],
            },
          }))
          setSelection(null)
        }}
      >
        展开这段节点
      </Button>
      <Button danger onClick={removeSelection}>
        移除这条视图线
      </Button>
    </>
  ) : selectedNode ? (
    <>
      {!nodes.some((node) => node.id === selectedNode.id) && removableNode && effectiveMode !== 'overview' ? (
        <Button onClick={() => {
          change((previous) => ({ ...previous, map: { ...map, expandedNodes: [...new Set([...map.expandedNodes, selectedNode.id])] } }))
          setSelection({ nodeId: selectedNode.id })
        }}
        >展开此节点
        </Button>
      ) : null}
      <Button
        type="primary"
        onClick={() => {
          onNavigate(focusBusinessChainMap(draft, library, selectedNode.id), { nodeId: selectedNode.id })
        }}
      >
        聚焦此处
      </Button>
      {!removableNode ? <Button onClick={() => addNode(selectedNode.id)}>加入画布</Button> : null}
      <Button disabled={!nodes.some((node) => node.id === selectedNode.id)} onClick={() => startConnect(selectedNode.id)}>
        从此节点连线
      </Button>
      <Button danger disabled={!removableNode} onClick={removeSelection}>
        移出画布
      </Button>
    </>
  ) : assessment ? (
    <>
      {assessment.action ? (
        <Button onClick={() => addNode(assessment.action)}>加入所需动作</Button>
      ) : null}
      {existingEdge ? (
        <Button danger onClick={removeSelection}>
          移除这条视图线
        </Button>
      ) : assessment.status !== 'blocked' ? (
        <Button
          type="primary"
          onClick={() => {
            change((previous) => {
              const next = addBusinessChainDraftEdge(
                previous,
                library,
                selection.from,
                selection.to
              )
              const current = businessChainMapState(next, library)
              return {
                ...next,
                map: {
                  ...current,
                  hiddenEdges: (current.hiddenEdges || []).filter(
                    (key) =>
                      key !== JSON.stringify([selection.from, selection.to])
                  ),
                },
              }
            })
            close()
            setConnecting(null)
            setNotice(
              assessment.status === 'known'
                ? '已加入视图；业务是否能办理仍以实际条件为准。'
                : '已保留无方向的待核对参考线。'
            )
          }}
        >
          {assessment.status === 'known' ? '加入视图连线' : '保留待核对参考线'}
        </Button>
      ) : null}
      <Button onClick={close}>继续选点</Button>
    </>
  ) : null
  const handleCanvasKeyDown = (event) => {
    if (
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      !event.currentTarget.contains(event.target)
    ) {
      return
    }
    if (
      event.key === 'Escape' &&
      (connecting || selection || panning)
    ) {
      event.preventDefault()
      cancel()
      return
    }
    if (
      gesture.current ||
      event.target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'
      )
    ) {
      return
    }
    if (event.altKey) return
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === 'z'
    ) {
      event.preventDefault()
      const restore = event.shiftKey ? onRedo : onUndo
      if (restore) {
        restore()
        panTarget.current?.focus({ preventScroll: true })
      }
    } else if (
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      ['Delete', 'Backspace'].includes(event.key) &&
      canRemove
    ) {
      event.preventDefault()
      removeSelection()
    }
  }
  const toggleHandoffs = (open) => {
    change((previous) => ({ ...previous, map: { ...businessChainMapState(previous, library), showHandoffs: open } }))
    cancel()
    setNotice('')
    requestAnimationFrame(() => (open ? viewport.current?.closest('.erp-chain-design__workspace')?.querySelector('button[data-picker="view"]') : scopePurpose.current)?.focus({ preventScroll: true }))
  }
  const toolbar = (
    <WorkbenchToolbar
      className="erp-chain-design__toolbar erp-chain-design__canvas-bar"
      onKeyDown={(event) => {
        if (event.target.closest('.erp-chain-design__canvas-actions')) handleCanvasKeyDown(event)
      }}
    >
      {scopeField}
      {globalOverview ? (
        <span className="erp-chain-design__map-summary erp-chain-design__scope-label" role="status" aria-label="当前探索范围">
          {relations.length === 0 && '链路概览 · '}{nodes.length} 个节点
        </span>
      ) : null}
      {(!globalOverview || relations.length > 0) && (
        <BusinessChainDesignViewPanel
          mode={effectiveMode}
          layout={layout}
          globalOverview={globalOverview}
          dock={showHandoffs ? handoffDock : undefined}
          relations={relations}
          layers={layers}
          onLayersChange={(value) => {
            if (selection?.overview && !value.includes(businessChainRelationLayer(selection.overview))) setSelection(null)
            setReadingOptions({ layers: value })
          }}
          collapsedOverview={Boolean(scopeSummary && !expandedInScope)}
          onModeChange={(value) => {
            cancel()
            setViewMode(value)
            setNotice('')
          }}
          onLayoutChange={setLayout}
        />
      )}
      <BusinessChainDesignPicker
        kind="role"
        value={role}
        groups={roleGroups}
        onSelect={(value) => setReadingOptions({ role: value })}
        hint={nodes.length > 0 && nodes.every((node) => node.summary) ? '展开一条链路的步骤后，可查看办理岗位。' : undefined}
      />
      {!globalOverview && (
        <div className="erp-chain-design__scope-bar" aria-label="当前探索范围">
          <span className="erp-chain-design__scope-label erp-chain-design__scope-summary" aria-live="polite">
            {map.focusId && <span>局部 · {library.byId.get(map.focusId).label}</span>}
            {!draft.nodes.length ? '尚未加载链路' : scopeSummary ? `${scopeSummary.count} 步` : `${nodes.length} 个节点`}
          </span>
          {map.chainKey !== 'all' ? (
            <Button ref={scopePurpose} onClick={() => { handoffTrigger.current = null; setSelection({ chainKey: map.chainKey }) }}>
              用途与交接
            </Button>
          ) : null}
          {scopeSummary ? (
            <Button aria-expanded={expandedInScope} onClick={() => toggleChain(scopeSummary.chainKey)}>
              {expandedInScope ? '折叠为链路卡片' : '展开链路步骤'}
            </Button>
          ) : null}
        </div>
      )}
      <div className="erp-chain-design__canvas-actions" role="group" aria-label="画布操作">
        {role && <span className="erp-chain-design__scope-label" role="status">{roleMatchCount ? `高亮 ${roleMatchCount} 个节点` : '本图无该岗位节点'}</span>}
        {returnAction}
        {map.scope !== 'whole' && draft.nodes.length > 0 ? (
          <Button onClick={() => (onReturn ? onReturn() : onNavigateChain(map.chainKey))}>回到整体</Button>
        ) : null}
        {map.visibleIds.length > 0 && !canGrowUpstream && !canGrowDownstream && (
          <span className="erp-chain-design__scope-label">已没有更多前后内容可展开</span>
        )}
        {hasBranches ? (
          <Button
            aria-pressed={Boolean(draft.presentation?.showBranches)}
            onClick={() => setReadingOptions({ showBranches: !draft.presentation?.showBranches })}
          >
            {draft.presentation?.showBranches ? '收起分支' : '展开分支'}
          </Button>
        ) : null}
        {draft.nodes.length > 0 ? (
          <Space wrap>
            <div className="erp-chain-design__growth" role="group" aria-label="展开一步">
              <span className="erp-chain-design__scope-label">展开一步</span>
              <Space.Compact>
                <Button
                  aria-label="往前展开一步"
                  disabled={!canGrowUpstream}
                  onClick={() => {
                    change((previous) => growBusinessChainMap(previous, library, 'upstream'))
                    cancel()
                    setNotice('已扩大一层上游，已有节点位置保留。')
                  }}
                >
                  往前
                </Button>
                <Button
                  aria-label="往后展开一步"
                  disabled={!canGrowDownstream}
                  onClick={() => {
                    change((previous) => growBusinessChainMap(previous, library, 'downstream'))
                    cancel()
                    setNotice('已扩大一层下游，已有节点位置保留。')
                  }}
                >
                  往后
                </Button>
              </Space.Compact>
            </div>
            {canCollapseGrowth ? (
              <Button
                onClick={() => {
                  change((previous) => collapseBusinessChainMapGrowth(previous, library))
                  cancel()
                  setNotice('已收起额外展开，节点位置已保留。')
                }}
              >
                收起扩展
              </Button>
            ) : null}
          </Space>
        ) : null}
        <DiagramViewControls
          label="画布"
          zoom={view.scale}
          zoomMode={view.mode}
          minZoom={0.05}
          maxZoom={2}
          onFit={fit}
          nextLayoutDirection={canSwitchDirection ? nextDirection : undefined}
          onSwitchLayout={switchLayout}
          onZoomOut={() => zoomTo((scale) => scale / 1.2)}
          onZoomIn={() => zoomTo((scale) => scale * 1.2)}
          onReset={() => zoomTo(1)}
          disabled={panning || inspectorOnly}
          fitDisabled={!nodes.length || inspectorOnly}
          fullscreen={fullscreen}
          onFullscreen={toggleFullscreen}
          fullscreenButtonRef={fullscreenButtonRef}
          fullscreenLabel="全屏探索"
          exitFullscreenLabel="退出全屏"
        />
      </div>
    </WorkbenchToolbar>
  )
  const canvas = (
    <div
      className="erp-chain-design__canvas-area"
      data-handoffs={showHandoffs || undefined}
      onKeyDown={handleCanvasKeyDown}
    >
      <div role="status" className="erp-chain-design__canvas-status" hidden={!pending && !notice}>
        {pending ? `从“${pending.label}”连接：拖到节点松开，或点节点查看条件` : notice}
        {pending ? <Button onClick={cancel}>取消连线</Button> : null}
      </div>
      {showHandoffs && <BusinessChainHandoffMap
        dockRef={handoffDock}
        chainKey={map.chainKey}
        library={library}
        relations={directHandoffs}
        layers={layers}
        onRelation={(overview, trigger) => { handoffTrigger.current = trigger; setSelection({ overview }) }}
        onChain={(chainKey, trigger) => { handoffTrigger.current = trigger; setSelection({ chainKey }) }}
        onClose={() => toggleHandoffs(false)}
      />}
      <Splitter
        className="erp-chain-design__reading-split"
        onResize={(sizes) => {
          if (selection && !inspectorOnly) setDetailShare(sizes[1] / (sizes[0] + sizes[1]) * 100)
        }}
      >
        <Splitter.Panel className="erp-chain-design__diagram-panel" size={`${!selection ? 100 : inspectorOnly ? 0 : 100 - detailShare}%`} min={selection && !inspectorOnly ? '35%' : 0} resizable={Boolean(selection && !inspectorOnly)}>
          <Dropdown
            trigger={['contextMenu']}
            disabled={panning}
            getPopupContainer={(trigger) => trigger.parentElement}
            menu={{
          items: [
            { key: 'arrange', label: '自动排布', disabled: !nodes.length },
          ],
          onClick: () => {
            change(arrangeBusinessChainMap(draft, library, effectiveMode, layout))
            cancel()
            setNotice('已自动排布，可撤销。')
          },
        }}
          >
            <div
              ref={viewport}
              className="erp-chain-design__viewport"
              role="region"
              aria-label="流程探索画布"
              data-view-mode={effectiveMode}
              data-direction={direction}
              data-map-scope={map.scope}
              data-panning={panning || undefined}
              style={{
            backgroundSize: `${20 * view.scale}px ${20 * view.scale}px`,
            backgroundPosition: `${view.x}px ${view.y}px`,
          }}
              onPointerDown={pan}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={cancel}
              onLostPointerCapture={() => {
            if (gesture.current) cancel()
          }}
              onDragOver={(event) => {
            if (
              event.dataTransfer.types.includes(
                'application/x-plush-chain-node'
              )
            ) {
              event.preventDefault()
              setCameraDirty(true)
              event.dataTransfer.dropEffect = 'copy'
            }
          }}
              onDrop={(event) => {
            const id = event.dataTransfer.getData(
              'application/x-plush-chain-node'
            )
            if (!library.byId.has(id)) return
            event.preventDefault()
            const position = point(event)
            setView((previous) => ({ ...previous, mode: 'manual' }))
            addNode(id, orientBusinessChainPoint({
              x: position.x - size.width / 2,
              y: position.y - size.height / 2,
            }, direction))
          }}
            >
              <button
                ref={panTarget}
                type="button"
                className="erp-chain-design__pan-target"
                aria-label="平移画布，使用方向键移动视图"
                onKeyDown={(event) => {
              const delta = {
                ArrowLeft: [40, 0],
                ArrowRight: [-40, 0],
                ArrowUp: [0, 40],
                ArrowDown: [0, -40],
              }[event.key]
              if (!delta) return
              event.preventDefault()
              setView((previous) => ({
                ...previous,
                mode: 'manual',
                x: previous.x + delta[0],
                y: previous.y + delta[1],
              }))
            }}
              />
              <div
                ref={surface}
                className="erp-chain-design__surface"
                style={{
              width,
              height,
              transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
            }}
              >
                {!nodes.length ? (
                  <div className="erp-chain-design__empty">
                    <strong>从一个业务节点开始</strong>
                    <p>尚未加载链路。选择上方流程范围，或从节点库加入一个节点。</p>
                    <Button onPointerDown={(event) => event.stopPropagation()} onClick={() => onNavigateChain('all')}>加载业务全流程地图</Button>
                  </div>
            ) : null}
                {bands.map((band) => <div key={band.domain} className="erp-chain-design__lane" data-domain={band.domain} style={{ ...diagramDomainStyle(band.domain), left: band.x, top: band.y, width: band.width, height: band.height }}><strong>{CHAIN_DESIGN_DOMAINS[band.domain]}</strong></div>)}
                <svg
                  className="erp-chain-design__lines"
                  width={width}
                  height={height}
                  aria-label="视图关系"
                >
                  <defs>
                    {['known', 'exception', 'highlighted'].map((kind) => (
                      <marker
                        key={kind}
                        id={`${arrow}-${kind}`}
                        data-design-arrow={kind}
                        viewBox="0 0 10 10"
                        refX="9"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                      >
                        <path d="M 0 0 L 10 5 L 0 10 z" />
                      </marker>
                ))}
                  </defs>
                  {routes.map((edge) => {
                const unknown = edge.kind === 'unknown'
                const condensed =
                  edge.paths.length > 1 || edge.paths[0]?.length > 1
                const exceptionLabels = [
                  ...new Set(
                    edge.paths
                      .flat()
                      .map((part) =>
                        library.byPair.get(JSON.stringify([part.from, part.to]))
                      )
                      .filter((relation) => relation?.kind === 'exception')
                      .map((relation) => relation.evidence.step.label)
                  ),
                ]
                const highlighted = highlightPath
                  ? emphasized.has(edge.from) && emphasized.has(edge.to)
                  : overviewInGraph ? selection.overview.key === edge.overview?.key
                    : Boolean(focusId && [edge.from, edge.to].includes(focusId))
                const label = edge.overview
                  ? selection?.overview?.key === edge.overview.key ? edge.overview.label : ''
                  : unknown
                    ? '待核对'
                    : edge.kind === 'exception'
                      ? exceptionLabels.length === 1
                        ? exceptionLabels[0]
                        : '异常分支'
                      : edge.dependency
                        ? '前置条件'
                        : ''
                const name = `${itemFor(edge.from).label}${unknown ? ' 与 ' : ' → '}${itemFor(edge.to).label}`
                const selectEdge = () =>
                  setSelection(
                    edge.overview
                      ? { overview: edge.overview }
                      : {
                          from: edge.from,
                          to: edge.to,
                          ...(condensed ? { summary: edge } : {}),
                        }
                  )
                return (
                  <g
                    key={edge.key}
                    data-design-edge={edge.kind}
                    data-edge-from={edge.from}
                    data-edge-to={edge.to}
                    data-condensed={condensed || undefined}
                    data-relation-kind={edge.overview?.kind}
                    data-highlighted={highlighted || undefined}
                    data-muted={
                      (hasEmphasis && !highlighted) ||
                      undefined
                    }
                    role="button"
                    tabIndex={0}
                    aria-label={`查看连线：${name}`}
                    onClick={selectEdge}
                    onKeyDown={(event) => {
                      if (['Enter', ' '].includes(event.key)) {
                        event.preventDefault()
                        selectEdge()
                      }
                    }}
                  >
                    <title>{edge.overview ? `${name}：${edge.overview.label}` : name}</title>
                    <path className="erp-chain-design__edge-hit" d={edge.d} />
                    <path
                      className="erp-chain-design__edge"
                      d={edge.d}
                      markerEnd={unknown ? undefined : `url(#${arrow}-${highlighted ? 'highlighted' : edge.kind})`}
                    />
                    {label ? (
                      <text x={edge.labelX} y={edge.labelY} textAnchor="middle">
                        {label}
                      </text>
                    ) : null}
                  </g>
                )
              })}
                  {pending && pointer && connectingNode ? (
                    <path
                      className="erp-chain-design__preview"
                      d={connectionPreview(connectingNode, pointer, direction)}
                    />
              ) : null}
                </svg>
                {nodes.map((node) => {
              const item = itemFor(node.id)
              const type = node.summary ? 'group' : item.type
              const overviewCard = globalOverview && node.summary
              const expanded = node.summary && map.expandedChains.includes(node.chainKey)
              const matchesRole = Boolean(role && !node.summary && item.roles.includes(role))
              const roleLabels = (item.roles || []).map((key) => library.roles.find((entry) => entry.value === key)?.label).filter(Boolean)
              const status =
                pending && !node.summary
                  ? connecting === node.id
                    ? 'source'
                    : assessBusinessChainConnection(
                        library,
                        connecting,
                        node.id
                      ).status
                  : null
              return (
                <div
                  key={node.id}
                  className="erp-chain-design__node"
                  data-design-node={node.id}
                  data-domain={item.domain}
                  data-type={type}
                  data-chain-expandable={overviewCard || undefined}
                  data-candidate={status}
                  data-role-highlighted={matchesRole || undefined}
                  data-dimmed={
                    (role && !node.summary && !matchesRole) ||
                    (hasEmphasis && !emphasized.has(node.id)) ||
                    undefined
                  }
                  data-selected={focusId === node.id || undefined}
                  style={{ ...diagramDomainStyle(item.domain), left: node.x, top: node.y }}
                >
                  <button
                    type="button"
                    className="erp-chain-design__node-body"
                    aria-label={`查看节点：${item.label}`}
                    onClick={() =>
                      node.summary
                        ? setSelection({ chainKey: node.chainKey })
                        : inspect(node.id)
                    }
                  >
                    <small className="erp-chain-design__node-type">
                      <DiagramNodeIcon type={type} />
                      <span>
                        {node.summary
                          ? overviewCard ? `${node.count} 步` : `范围内 ${node.count} 步 · ${expanded ? '已展开' : '可展开'}`
                          : [CHAIN_DESIGN_TYPES[type], roleLabels.length > 1 ? `${roleLabels.length} 个岗位` : roleLabels[0]].filter(Boolean).join(' · ')}
                      </span>
                    </small>
                    <strong>{item.label}</strong>
                    {status || item.terminal || item.entry ? (
                      <small>
                        {status
                          ? connectionLabels[status]
                          : item.terminal
                            ? '本次终止'
                            : item.entry
                              ? '链路入口'
                              : null}
                      </small>
                    ) : null}
                  </button>
                  {overviewCard ? (
                    <Button
                      size="small"
                      className="erp-chain-design__chain-toggle"
                      aria-label={`${expanded ? '收起' : '展开'}步骤：${item.label}`}
                      aria-expanded={expanded}
                      onClick={() => toggleChain(node.chainKey)}
                    >
                      {expanded ? '收起' : '展开'}
                    </Button>
                  ) : null}
                  {!node.summary ? (
                    <button
                      type="button"
                      className="erp-chain-design__port"
                      aria-label={`从${item.label}拖出连线`}
                      title="拖出连线，也可点此后再点下游节点"
                      onPointerDown={(event) => startLine(event, node.id)}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false
                          return
                        }
                        startConnect(node.id)
                      }}
                    />
                  ) : null}
                </div>
              )
            })}
              </div>
            </div>
          </Dropdown>
        </Splitter.Panel>
        <Splitter.Panel className="erp-chain-design__details-panel" size={`${!selection ? 0 : inspectorOnly ? 100 : detailShare}%`} min={selection ? inspectorOnly ? '100%' : 280 : 0} max={inspectorOnly ? '100%' : '60%'} resizable={Boolean(selection && !inspectorOnly)}>
          {selection ? (
            <CanvasCard
              key={selectedNode ? `${selectedNode.id}:${selection.preview?.stateKey || ''}` : JSON.stringify(selection)}
              title={
            selection.ideas
              ? '视图备注'
              : selectedSummary?.label ||
                (selection.overview
                  ? '链路衔接'
                  : selectedNode?.label || '接入条件')
          }
              onClose={close}
              actions={cardActions}
            >
              {selection.anchorId && selection.anchorId !== selection.nodeId ? (
                <Button
                  onClick={() => setSelection({ nodeId: selection.anchorId })}
                >
                  返回原节点
                </Button>
          ) : null}
              {selectedSummary ? (
                <ChainPurposeDetails
                  catalog={catalog}
                  chainKey={selectedSummary.value}
                  onRelation={(overview) => setSelection({ overview })}
                  onShowHandoffs={selectedSummary.value === map.chainKey && !showHandoffs ? () => toggleHandoffs(true) : undefined}
                />
          ) : selection.overview ? (
            <ChainHandoffDetails catalog={catalog} relation={selection.overview} onNavigate={onNavigateChain} />
          ) : selection.ideas ? (
            <DraftNotes draft={draft} change={change} />
          ) : selection.summary ? (
            <>
              <p>这条主线归并了下列视图关系，具体动作与条件保留。</p>
              {selection.summary.paths.map((path, index) => (
                <div key={index} className="erp-chain-design__related-path">
                  {[path[0].from, ...path.map((edge) => edge.to)].map(
                    (id, i) => (
                      <React.Fragment key={`${id}-${i}`}>
                        {i ? <span aria-hidden="true">↓</span> : null}
                        <Button
                          onClick={() =>
                            setSelection({ nodeId: id, anchorId: selection.to })
                          }
                        >
                          {library.byId.get(id).label}
                        </Button>
                      </React.Fragment>
                    )
                  )}
                </div>
              ))}
            </>
          ) : selectedNode ? (
            <BusinessChainDesignDetails
              key={selectedNode.id}
              catalog={catalog}
              library={library}
              node={selectedNode}
              draft={draft}
              preview={selection.preview}
              onCanvas={nodes.some((node) => node.id === selectedNode.id)}
              onHighlight={setHighlightPath}
              onRelation={(overview) => setSelection({ overview, anchorId: selectedNode.id })}
              onInspect={(nodeId) =>
                setSelection({
                  nodeId,
                  anchorId: selection.anchorId || selection.nodeId,
                })
              }
              onAdd={addNode}
              onExpand={(direction, recursive, targetId) => {
              change((previous) => {
                const next = expandBusinessChainMap(
                    previous,
                    library,
                    selectedNode.id,
                    direction,
                    recursive,
                    targetId
                  )
                const directions = direction === 'both' ? ['upstream', 'downstream'] : [direction]
                const ids = targetId ? [targetId] : recursive ? next.map.visibleIds : directions.flatMap((part) => businessChainNeighbors(library, selectedNode.id, part).flatMap((edge) => [edge.from, edge.to]))
                return { ...next, map: { ...next.map, expandedNodes: [...new Set([...next.map.expandedNodes, ...ids])] } }
              })
                setNotice(
                  '已按登记关系展开；已有节点位置保留，可用“适应全图”查看。'
                )
              }}
            />
          ) : (
            <>
              <p>
                <strong>
                  {library.byId.get(selection.from).label} →{' '}
                  {library.byId.get(selection.to).label}
                </strong>
              </p>
              <p data-connection-status={assessment.status}>
                <strong>{connectionLabels[assessment.status]}：</strong>
                {assessment.reason}
              </p>
              <ChainDesignEvidence evidence={assessment.relation?.evidence} />
              {existingEdge ? (
                <p className="erp-chain-design__muted">这条关系已在视图中。</p>
              ) : null}
            </>
          )}
            </CanvasCard>
      ) : null}
        </Splitter.Panel>
      </Splitter>
    </div>
  )
  return <>{toolbar}{canvas}</>
}
