import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Button, Dropdown, Space, Splitter } from 'antd'
import { UndoOutlined, RedoOutlined } from '@ant-design/icons'
import DiagramViewControls from '@/common/components/diagram/DiagramViewControls.jsx'
import SupplementalHelp from '@/common/components/help/SupplementalHelp.jsx'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
import AppSelect from '@/common/components/select/AppSelect.jsx'
import { WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import {
  CHAIN_DESIGN_NODE_SIZE as size,
  CHAIN_DESIGN_TYPES,
  CHAIN_DESIGN_DOMAINS,
  assessBusinessChainConnection,
  addBusinessChainDraftEdge,
} from '../../config/devBusinessChainDesign.mjs'
import { routeBusinessChainEdges, businessChainNeighbors } from '../../config/devBusinessChainDesignView.mjs'
import {
  businessChainMapState,
  expandBusinessChainMap,
  growBusinessChainMap,
  collapseBusinessChainMapGrowth,
  businessChainMapCanCollapseGrowth,
  businessChainMapCanGrow,
  focusBusinessChainMap,
  moveBusinessChainMapNode,
  arrangeBusinessChainMap,
  toggleBusinessChainMapRegion,
  hideBusinessChainMapEdges,
  removeBusinessChainMapNode,
} from '../../config/devBusinessChainMap.mjs'
import BusinessChainDesignDetails, {
  ChainDesignEvidence,
} from './BusinessChainDesignDetails.jsx'
import { businessChainLaneBands, businessChainRelationLayer, projectBusinessChainReading } from '../../config/devBusinessChainReading.mjs'
import { ChainPurposeDetails, ChainHandoffDetails } from './BusinessChainReadingDetails.jsx'

const connectionLabels = {
  known: '有接入规则',
  unknown: '待核对',
  blocked: '不能直连',
  source: '当前起点',
}
const curve = (from, to) => {
  const bend = Math.max(48, Math.abs(to.x - from.x) / 2)
  return `M ${from.x} ${from.y} C ${from.x + bend} ${from.y}, ${to.x - bend} ${to.y}, ${to.x} ${to.y}`
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
  displayFields,
  returnAction,
  adjusting,
  onFinishEditing,
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
  undo,
  canUndo,
  redo,
  canRedo,
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
  const panTarget = useRef(null)
  const surface = useRef(null)
  const gesture = useRef(null)
  const suppressClick = useRef(false)
  const [moving, setMoving] = useState(null)
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
  const reading = projectBusinessChainReading(projected, library, { scope: map.scope, mode: effectiveMode, expandedNodes: map.expandedNodes, showBranches: draft.presentation?.showBranches, selection, pathIds: highlightPath || [] })
  const hasBranches = projectBusinessChainReading(projected, library, { scope: map.scope, mode: effectiveMode }).nodes.length < projected.nodes.length
  const graph = {
    ...reading,
    edges: reading.edges.filter((edge) => !edge.overview || layers.includes(businessChainRelationLayer(edge.overview)) || selection?.overview?.key === edge.overview.key),
    nodes: reading.nodes.map((node) =>
      moving?.id === node.id ? { ...node, ...moving } : node
    ),
  }
  const itemFor = (id) =>
    graph.nodes.find((node) => node.id === id && node.summary) ||
    library.byId.get(id)
  const { nodes } = graph
  const roleMatchCount = role ? nodes.filter((node) => library.byId.get(node.id)?.roles?.includes(role)).length : 0
  const bands = layout === 'lanes' ? businessChainLaneBands(graph, library) : []
  const routes = routeBusinessChainEdges(graph)
  const positions = new Map(
    [...draft.nodes, ...graph.nodes].map((node) => [node.id, node])
  )
  const width = Math.max(720, ...nodes.map((node) => node.x + size.width + 60))
  const height = Math.max(
    440,
    ...nodes.map((node) => node.y + size.height + 80),
    ...routes.map((edge) => edge.labelY + 40)
  )
  const fromPoint = (node) => ({
    x: node.x + size.width,
    y: node.y + size.height / 2,
  })
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
    setMoving(null)
    setPointer(null)
    setConnecting(null)
    setSelection(null)
  }
  const restoreHistory = (restore) => {
    restore()
    cancel()
    setNotice('')
    panTarget.current?.focus({ preventScroll: true })
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
    const fittedNodes = chainKey
      ? nodes.filter(
          (node) =>
            !node.summary && library.byId.get(node.id).chainKey === chainKey
        )
      : nodes
    const ids = new Set(fittedNodes.map((node) => node.id))
    const fittedBands = chainKey && layout === 'lanes'
      ? businessChainLaneBands({ ...graph, nodes: fittedNodes }, library)
      : bands
    const bounds = [...fittedNodes.map((node) => ({ ...node, ...size })), ...fittedBands]
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
  const scopeKey = `${frameKey}:${frameRequest.revision}:${effectiveMode}:${viewRequest.revision}`
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
    const refitScope = expandedInScope && viewRequest.view?.mode !== 'manual'
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
    fitRef.current(
      view.mode === 'fit-width' ? 'fit-width' : 'fit-all',
      false,
      changedFrame ? frameRequest.chainKey : view.chainKey
    )
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
  const down = (event, node, kind) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (kind === 'line') startConnect(node.id)
    else if (connecting || !adjusting) return
    gesture.current = {
      kind,
      id: node.id,
      start: point(event),
      original: node,
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
    if (active.kind === 'line') setPointer(position)
    else {
      setView((previous) =>
        previous.mode === 'manual' ? previous : { ...previous, mode: 'manual' }
      )
      setMoving({
        id: active.id,
        x: active.original.x + dx,
        y: active.original.y + dy,
      })
    }
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
    if (active.kind === 'line') {
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest('[data-design-node]')
      if (active.moved && target && surface.current.contains(target)) {
        setSelection({ from: active.id, to: target.dataset.designNode })
      }
      setPointer(null)
    } else if (active.moved && moving) {
      setCameraDirty(true)
      change((previous) =>
        moveBusinessChainMapNode(previous, library, active.id, {
          x: moving.x,
          y: moving.y,
        })
      )
    } else if (!active.moved && active.kind === 'move') {
      inspect(active.id)
    }
    suppressClick.current = active.moved
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
    setMoving(null)
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
    change((previous) => toggleBusinessChainMapRegion(previous, library, key))
    setSelection(null)
    requestFrame(map.expandedChains.includes(key) ? null : key)
    setNotice('已调整这条链路的展开状态，其他区域位置保留。')
  }
  const cardActions = selectedSummary ? (
    <>
      {effectiveMode === 'overview' ? (
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
      (connecting || selection || moving || panning)
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
      if (event.shiftKey ? canRedo : canUndo) {
        restoreHistory(event.shiftKey ? redo : undo)
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
  const toolbar = (
    <WorkbenchToolbar
      className="erp-chain-design__toolbar erp-chain-design__canvas-bar"
      onKeyDown={(event) => {
        if (event.target.closest('.erp-chain-design__canvas-actions')) handleCanvasKeyDown(event)
      }}
    >
      {scopeField}
      <div className="erp-chain-design__detail-control" data-mode={effectiveMode}>
        <AppSelect
          aria-label="流程颗粒度"
          label="显示"
          presentation="compact"
          className="erp-chain-design__mode"
          allowClear={false /* 不可清空：显示方式始终有一个选中值。 */}
          value={effectiveMode}
          disabled={globalOverview}
          options={[
            { value: 'overview', label: '链路概览' },
            { value: 'mainline', label: '业务步骤' },
            { value: 'all', label: '全部已载入节点' },
          ]}
          onChange={(mode) => {
            cancel()
            setViewMode(mode)
            setNotice('')
          }}
        />
        <SupplementalHelp
          label="全部已载入节点"
          placement="bottom"
          content={
            <>
              <p>仅切换显示内容，展示当前范围内已经载入的全部节点。</p>
              <p>不会新增节点，也不会自动载入整条流程。</p>
              <p>需要整条流程时，在上方“流程范围”选择链路；已聚焦局部时，点击“回到整体”。</p>
            </>
          }
        />
      </div>
      {displayFields}
      <div className="erp-chain-design__scope-bar" aria-label="当前探索范围">
        <span className="erp-chain-design__scope-label erp-chain-design__scope-summary" aria-live="polite">
          {map.focusId && <span>局部 · {library.byId.get(map.focusId).label}</span>}
          {!draft.nodes.length ? '尚未加载链路' : scopeSummary ? `${scopeSummary.count} 步` : `${nodes.length} 个节点`}
        </span>
        {map.chainKey !== 'all' ? (
          <Button ref={scopePurpose} onClick={() => setSelection({ chainKey: map.chainKey })}>
            用途与交接
          </Button>
        ) : null}
        {scopeSummary ? (
          <Button aria-expanded={expandedInScope} onClick={() => toggleChain(scopeSummary.chainKey)}>
            {expandedInScope ? '折叠为链路卡片' : '展开链路步骤'}
          </Button>
        ) : null}
      </div>
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
            <Button
              disabled={!canGrowUpstream}
              onClick={() => {
                change((previous) => growBusinessChainMap(previous, library, 'upstream'))
                cancel()
                setNotice('已扩大一层上游，已有节点位置保留。')
              }}
            >
              往前展开一步
            </Button>
            <Button
              disabled={!canGrowDownstream}
              onClick={() => {
                change((previous) => growBusinessChainMap(previous, library, 'downstream'))
                cancel()
                setNotice('已扩大一层下游，已有节点位置保留。')
              }}
            >
              往后展开一步
            </Button>
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
        {adjusting && (
          <div className="erp-chain-design__edit-actions">
            <Button
              aria-label="撤销"
              title="撤销"
              icon={<UndoOutlined />}
              disabled={!canUndo || !!moving || panning}
              onClick={() => restoreHistory(undo)}
            />
            <Button
              aria-label="重做"
              title="重做"
              icon={<RedoOutlined />}
              disabled={!canRedo || !!moving || panning}
              onClick={() => restoreHistory(redo)}
            />
            <Button
              disabled={!nodes.length}
              onClick={() => {
                change(arrangeBusinessChainMap(draft, library, effectiveMode, layout))
                cancel()
                setNotice('已重新排布当前范围，可撤销。')
              }}
            >
              重新排布
            </Button>
            <Button
              onClick={() => {
                cancel()
                onFinishEditing()
              }}
            >
              结束调整
            </Button>
          </div>
        )}
        <DiagramViewControls
          label="画布"
          zoom={view.scale}
          zoomMode={view.mode}
          minZoom={0.05}
          maxZoom={2}
          onFit={fit}
          onZoomOut={() => zoomTo((scale) => scale / 1.2)}
          onZoomIn={() => zoomTo((scale) => scale * 1.2)}
          onReset={() => zoomTo(1)}
          disabled={!!moving || panning || inspectorOnly}
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
      onKeyDown={handleCanvasKeyDown}
    >
      <div role="status" className="erp-chain-design__canvas-status" hidden={!pending && !notice && !adjusting}>
        {pending
          ? `从“${pending.label}”连接：拖到节点松开，或点节点查看条件`
          : notice ||
            (adjusting
              ? '拖动节点调整位置，方向键也可微调。'
              : '')}
        {pending ? <Button onClick={cancel}>取消连线</Button> : null}
      </div>
      <Splitter
        className="erp-chain-design__reading-split"
        onResize={(sizes) => {
          if (selection && !inspectorOnly) setDetailShare(sizes[1] / (sizes[0] + sizes[1]) * 100)
        }}
      >
        <Splitter.Panel className="erp-chain-design__diagram-panel" size={`${!selection ? 100 : inspectorOnly ? 0 : 100 - detailShare}%`} min={selection && !inspectorOnly ? '35%' : 0} resizable={Boolean(selection && !inspectorOnly)}>
          <Dropdown
            trigger={['contextMenu']}
            disabled={!!moving || panning}
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
              data-adjusting={adjusting || undefined}
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
            addNode(id, {
              x: position.x - size.width / 2,
              y: position.y - size.height / 2,
            })
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
                  {pending && pointer && positions.has(connecting) ? (
                    <path
                      className="erp-chain-design__preview"
                      d={curve(fromPoint(positions.get(connecting)), pointer)}
                    />
              ) : null}
                </svg>
                {nodes.map((node) => {
              const item = itemFor(node.id)
              const type = node.summary ? 'group' : item.type
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
                  data-candidate={status}
                  data-dimmed={
                    (role && item.roles && !item.roles.includes(role)) ||
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
                    onPointerDown={(event) => down(event, node, 'move')}
                    onClick={() =>
                      node.summary
                        ? setSelection({ chainKey: node.chainKey })
                        : inspect(node.id)
                    }
                    onKeyDown={(event) => {
                      const delta = {
                        ArrowLeft: [-12, 0],
                        ArrowRight: [12, 0],
                        ArrowUp: [0, -12],
                        ArrowDown: [0, 12],
                      }[event.key]
                      if (!delta || !adjusting) return
                      event.preventDefault()
                      setView((previous) => ({ ...previous, mode: 'manual' }))
                      change((previous) =>
                        moveBusinessChainMapNode(previous, library, node.id, {
                          x: node.x + delta[0],
                          y: node.y + delta[1],
                        })
                      )
                    }}
                  >
                    <small className="erp-chain-design__node-type">
                      <DiagramNodeIcon type={type} />
                      <span>
                        {node.summary
                          ? `范围内 ${node.count} 步 · ${map.expandedChains.includes(node.chainKey) ? '已展开' : '可展开'}`
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
                  {!node.summary ? (
                    <button
                      type="button"
                      className="erp-chain-design__port"
                      aria-label={`从${item.label}拖出连线`}
                      title="拖出连线，也可点此后再点下游节点"
                      onPointerDown={(event) => down(event, node, 'line')}
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
                <ChainPurposeDetails catalog={catalog} chainKey={selectedSummary.value} onRelation={(overview) => setSelection({ overview })} />
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
