import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, Popover, Typography } from 'antd'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import DevPageHeader from '../DevPageHeader.jsx'
import {
  WorkbenchSection,
  WorkbenchNotice,
} from '../WorkbenchPattern.jsx'
import {
  CHAIN_CONNECTION_LABELS,
  CHAIN_DESIGN_DOMAINS,
  CHAIN_DESIGN_TYPES,
  buildBusinessChainDesignLibrary,
} from '../../config/devBusinessChainDesign.mjs'
import {
  addBusinessChainMapNode,
  businessChainMapState,
  businessChainMapScope,
  projectBusinessChainMap,
  showBusinessChainWhole,
  arrangeBusinessChainMap,
} from '../../config/devBusinessChainMap.mjs'
import { CHAIN_READING_LAYERS, businessChainBaseLayer } from '../../config/devBusinessChainReading.mjs'
import useBusinessChainDraft from './useBusinessChainDraft.mjs'
import BusinessChainDesignDrafts from './BusinessChainDesignDrafts.jsx'
import { CHAIN_CANVAS_OPERATIONS, CHAIN_CANVAS_RELATIONS } from '../../config/devBusinessChainExport.mjs'
import useBusinessChainDesignFullscreen from './useBusinessChainDesignFullscreen.mjs'
import BusinessChainDesignCanvas from './BusinessChainDesignCanvas.jsx'
import { CHAIN_DISPLAY_OPTIONS, CHAIN_LAYOUT_OPTIONS } from '../../config/devBusinessChainDesignView.mjs'
import BusinessChainDesignPicker from './BusinessChainDesignPicker.jsx'
import BusinessChainNodeLibrary from './BusinessChainNodeLibrary.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
import { applyDevFlowExplorerEntry } from '../../pages/devFlowExplorerNavigation.mjs'
import { DEV_FLOW_EXPLORER_ROUTE, DEV_PAGE_TITLE_BY_ROUTE } from '../../config/devRoutes.mjs'
import './businessChainDesigner.css'

export default function BusinessChainDesigner({
  catalog, entry, onEntryApplied, initialRange, startBlank = false, onOpenVerification, returnToSource, restoredPurpose,
}) {
  const legendId = useId()
  const { fullscreen, toggleFullscreen, workspaceRef, buttonRef } =
    useBusinessChainDesignFullscreen()
  const library = useMemo(
    () => buildBusinessChainDesignLibrary(catalog),
    [catalog]
  )
  const draftModel = useBusinessChainDraft(library, initialRange, startBlank)
  const { draft, change, undo, redo, past, future, issue } = draftModel
  const [connecting, setConnecting] = useState(null)
  const [selection, setSelection] = useState(() =>
    library.chainDefinitions.has(restoredPurpose?.chainKey) ? restoredPurpose : null
  )
  const [notice, setNotice] = useState('')
  const [libraryVisible, setLibraryVisible] = useState(false)
  const resultTrigger = useRef(null)
  const [filters, setFilters] = useState({ view: 'steps', search: '', domain: '', type: '', role: '', chain: '' })
  const [nodeScope, setNodeScope] = useState('current')
  const libraryList = useRef(null)
  const libraryToggle = useRef(null)
  const [history, setHistory] = useState([])
  const [camera, setCamera] = useState({ x: 0, y: 0, scale: 1, mode: 'fit-all' })
  const [legendOpen, setLegendOpen] = useState(false)
  const legendTrigger = useRef(null)
  const legendPanel = useRef(null)
  const appliedEntry = useRef(null)
  useEffect(() => {
    if (startBlank) {
      if (appliedEntry.current === 'blank') {
        if (draftModel.persisted) onEntryApplied()
      } else {
        appliedEntry.current = 'blank'
        // Keep the entry until this tab has persisted its blank state, even if opener storage was copied.
        draftModel.startNew()
      }
      return
    }
    if (!entry || issue || appliedEntry.current === entry) return
    appliedEntry.current = entry
    // Opening a source changes only reading scope; existing coordinates are preserved.
    change((previous) => applyDevFlowExplorerEntry(previous, library, entry))
    onEntryApplied()
  }, [startBlank, entry, issue, change, library, onEntryApplied, draftModel])
  const { mode: viewMode = 'mainline', highlightedRoles = [] } = draft.presentation || {}
  const selectedRoles = library.roles.filter(({ value }) => highlightedRoles.includes(value))
  const layout = draft.presentation?.layout || 'flow'
  const layers = draft.presentation?.layers || ['normal']
  const setPresentation = draftModel.changePresentation
  const setViewMode = (mode) => setPresentation({ mode })
  const map = businessChainMapState(draft, library)
  const globalOverview = map.scope === 'whole' && map.chainKey === 'all' && viewMode === 'overview'
  const legendRelations = globalOverview || map.showHandoffs
    ? Object.keys(CHAIN_CANVAS_RELATIONS)
    : ['known', 'exception', 'correction', 'unknown']
  const projected = useMemo(
    () => projectBusinessChainMap(draft, library, viewMode),
    [draft, library, viewMode]
  )
  const scope = businessChainMapScope(draft, library)
  const present = new Set(scope.nodes.map((node) => node.id))
  const restoreEdit = (restore) => () => {
    restore()
    setConnecting(null)
    setSelection(null)
    setNotice('')
  }
  const onUndo = past.length ? restoreEdit(undo) : undefined
  const onRedo = future.length ? restoreEdit(redo) : undefined
  const resetInteraction = () => {
    setConnecting(null)
    setSelection(null)
    setNotice('')
  }
  const navigateReading = (next, selected = null, kind = 'focus') => {
    setHistory((previous) => [...previous.slice(-15), {
      draft,
      selection,
      filters,
      nodeScope,
      libraryVisible,
      scrollTop: libraryList.current?.scrollTop || 0,
      kind,
    }])
    change(next)
    setSelection(selected)
    setConnecting(null)
    setNotice('')
  }
  const navigateChain = (key, mode = key === 'all' ? 'overview' : globalOverview ? 'mainline' : viewMode) => {
    let next = showBusinessChainWhole(draft, library, key)
    if (!next.nodes.some((node) => node.manual && next.map.visibleIds.includes(node.id))) {
      next = arrangeBusinessChainMap(next, library, mode, layout)
    }
    const defaultLayer = key === 'all' ? 'normal' : businessChainBaseLayer(library.chainDefinitions.get(key))
    const nextLayers = defaultLayer !== 'normal' && layers.length && !layers.includes(defaultLayer) ? [...layers, defaultLayer] : layers
    navigateReading({ ...next, presentation: { ...draft.presentation, mode, highlightedRoles, layout, layers: nextLayers } }, null, 'chain')
  }
  const returnReading = (preserveGranularity = false) => {
    const previous = history.at(-1)
    if (!previous) return
    change(preserveGranularity === true ? { ...previous.draft, presentation: { ...previous.draft.presentation, mode: viewMode, highlightedRoles } } : previous.draft)
    setHistory((items) => items.slice(0, -1))
    setSelection(previous.selection)
    setFilters(previous.filters)
    setNodeScope(previous.nodeScope)
    setLibraryVisible(previous.libraryVisible)
    setConnecting(null)
    setNotice('')
    requestAnimationFrame(() => {
      if (libraryList.current) libraryList.current.scrollTop = previous.scrollTop
    })
  }
  const addNode = (id, position) => {
    const item = library.byId.get(id)
    if (present.has(id) && projected.salesAcceptance && library.salesAcceptanceVariants.some(({ key }) => key === item.processNode?.definitionKey)) {
      setPresentation({ salesAcceptanceVariant: item.processNode.definitionKey })
    }
    if (!present.has(id)) {
      change((previous) =>
        addBusinessChainMapNode(previous, library, id, position)
      )
      setNotice(`已加入“${library.byId.get(id).label}”，可逐步展开上下游。`)
    }
    setSelection(
      connecting && connecting !== id
        ? { from: connecting, to: id }
        : { nodeId: id }
    )
  }
  const scopeField = (
    <BusinessChainDesignPicker
      kind="scope"
      value={draft.nodes.length ? map.chainKey : null}
      groups={library.chainOptionGroups}
      onChange={(key) => {
        if (key !== map.chainKey || map.scope !== 'whole') navigateChain(key)
      }}
    />
  )
  const setLayout = (value) => {
    // A collapsed chain card also needs positions for the steps it will reveal.
    const arrangementMode = projected.scopeSummary ? 'all' : viewMode
    const next = arrangeBusinessChainMap(draft, library, arrangementMode, value)
    change({ ...next, presentation: { ...draft.presentation, mode: viewMode, highlightedRoles, layout: value, layers } })
    resetInteraction()
    setNotice(value === 'lanes' ? '已按业务领域划分泳道。' : '已按阶段排布。')
  }
  const showLibrary = libraryVisible && !selection?.detailsOnly
  const renderWorkspace = (searchTools, resultsPanel) => (
    <WorkbenchSection
      flat
      className="erp-chain-design"
      aria-label="流程探索"
    >
      <DevPageHeader
        className="erp-chain-design__header"
        title={<Typography.Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_FLOW_EXPLORER_ROUTE]}</Typography.Title>}
        tools={
          <div className="erp-chain-design__file-actions">
            {returnToSource}
            <Button
              ref={libraryToggle}
              icon={showLibrary ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              aria-label={showLibrary ? '收起节点库' : '展开节点库'}
              aria-expanded={showLibrary}
              aria-controls={`${legendId}-library`}
              onClick={() => { if (selection?.detailsOnly) setSelection(null); setLibraryVisible(!showLibrary) }}
            >
              节点库
            </Button>
            <BusinessChainDesignDrafts
              confirmNew={draftModel.needsNewConfirmation}
              onNew={() => {
                const error = draftModel.startNew()
                if (!error) {
                  resetInteraction()
                  setHistory([])
                }
                return error
              }}
              onUndo={onUndo}
              onRedo={onRedo}
              exportDisabled={!scope.nodes.length}
              onNotice={setNotice}
              getGraph={() => {
                const chain = library.chains.find(({ value }) => value === map.chainKey)?.label || '业务全流程地图'
                return {
                  surface: workspaceRef.current.querySelector('.erp-chain-design__surface'),
                  scale: camera.scale,
                  title: chain,
                  context: [
                    `${map.scope === 'whole' ? '整体' : '局部'} · ${chain}`,
                    map.focusId ? library.byId.get(map.focusId)?.label : '',
                    CHAIN_DISPLAY_OPTIONS[viewMode].label,
                    viewMode === 'overview' ? '' : CHAIN_LAYOUT_OPTIONS[layout].label,
                    projected.salesAcceptance ? library.salesAcceptanceVariants.find(({ key }) => key === draft.presentation?.salesAcceptanceVariant)?.label || '合并共同步骤' : '',
                    selectedRoles.length ? `高亮岗位：${selectedRoles.map(({ label }) => label).join('、')}` : '',
                    layers.map((key) => CHAIN_READING_LAYERS.find((layer) => layer.value === key)?.label).join('、'),
                  ].filter(Boolean).join(' · '),
                }
              }}
            />
          </div>
        }
      >
        <div className="erp-chain-design__query-slot">{searchTools}</div>
      </DevPageHeader>
      {issue ? <WorkbenchNotice tone="error" title={issue} action={!draftModel.restoreFailed ? <Button onClick={draftModel.retryPersistence}>重试自动保留</Button> : null} /> : null}
      <div className="erp-chain-design__workspace" data-library-visible={showLibrary}>
        <BusinessChainDesignCanvas
          libraryVisible={showLibrary}
          scopeField={scopeField}
          setLayout={setLayout}
          returnAction={history.length > 0 ? <Button type="text" onClick={returnReading}>返回来处</Button> : null}
          resultTrigger={resultTrigger}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
          fullscreenButtonRef={buttonRef}
          map={map}
          projected={projected}
          globalOverview={globalOverview}
          viewMode={viewMode}
          setViewMode={setViewMode}
          catalog={catalog}
          library={library}
          draft={draft}
          change={change}
          onUndo={onUndo}
          onRedo={onRedo}
          addNode={addNode}
          selectedRoles={selectedRoles}
          connecting={connecting}
          setConnecting={setConnecting}
          selection={selection}
          setSelection={setSelection}
          notice={notice}
          setNotice={setNotice}
          view={camera}
          setView={setCamera}
          onNavigate={navigateReading}
          onNavigateChain={navigateChain}
          onOpenVerification={onOpenVerification}
          onReturn={() => history.at(-1)?.kind === 'focus' ? returnReading(true) : navigateChain(map.chainKey, viewMode)}
          layers={layers}
          layout={layout}
          setReadingOptions={setPresentation}
        />
        {resultsPanel}
      </div>
      <footer className="erp-chain-design__footer">
        <span>{projected.wholeDetail || projected.salesAcceptance ? '已载入的原始流程' : '当前范围已载入'}：{scope.nodes.length} 个节点 · {scope.edges.length} 条关系</span>
        <Popover
          trigger="click"
          open={legendOpen}
          onOpenChange={setLegendOpen}
          placement="topRight"
          arrow={false}
          afterOpenChange={(visible) => {
            if (visible) legendPanel.current?.focus({ preventScroll: true })
          }}
          getPopupContainer={(element) => element.closest('.erp-chain-design')}
          classNames={{ root: 'erp-chain-legend-popover' }}
          content={
            <div
              className="erp-chain-design__legend"
              aria-label="画布图例"
              role="dialog"
              ref={legendPanel}
              tabIndex={-1}
              onKeyDownCapture={(event) => {
                if (event.key !== 'Escape') return
                event.preventDefault()
                event.stopPropagation()
                setLegendOpen(false)
                legendTrigger.current?.focus({ preventScroll: true })
              }}
            >
              <div>
                <strong>业务领域</strong>
                {Object.entries(CHAIN_DESIGN_DOMAINS).map(([key, label]) => (
                  <span
                    className="erp-chain-design__legend-item"
                    key={key}
                    data-domain={key}
                    style={diagramDomainStyle(key)}
                  >
                    <i
                      className="erp-chain-design__legend-swatch"
                      aria-hidden="true"
                    />
                    {label}
                  </span>
                ))}
              </div>
              <div>
                <strong>节点类型</strong>
                {Object.entries(CHAIN_DESIGN_TYPES).map(([type, label]) => (
                  <span
                    className="erp-chain-design__legend-item"
                    key={type}
                    data-type={type}
                  >
                    <DiagramNodeIcon type={type} />
                    {label}
                  </span>
                ))}
                <span className="erp-chain-design__legend-item" data-exception-node>
                  <i className="erp-chain-design__legend-node" aria-hidden="true" />
                  异常分支节点
                </span>
              </div>
              <div>
                <strong>业务关系</strong>
                {legendRelations.map((kind) => (
                  <span className="erp-chain-design__legend-item" key={kind} data-legend-edge={kind}>
                    <svg
                      className="erp-chain-design__legend-line"
                      viewBox="0 0 64 24"
                      aria-hidden="true"
                      focusable="false"
                    >
                      {kind !== 'unknown' ? (
                        <defs>
                          <marker
                            id={`${legendId}-${kind}`}
                            viewBox="0 0 10 10"
                            refX="9"
                            refY="5"
                            markerWidth="7"
                            markerHeight="7"
                            orient="auto-start-reverse"
                          >
                            <path d="M 0 0 L 10 5 L 0 10 z" />
                          </marker>
                        </defs>
                      ) : null}
                      <path
                        className="erp-chain-design__edge"
                        d="M 3 12 H 55"
                        markerEnd={
                          kind === 'unknown' ? undefined : `url(#${legendId}-${kind})`
                        }
                      />
                    </svg>
                    {CHAIN_CANVAS_RELATIONS[kind]}
                  </span>
                ))}
              </div>
              <div>
                <strong>拖线提示</strong>
                {[
                  ['known', '实际办理仍需满足对应条件。'],
                  ['blocked', '查看连线说明，了解具体原因。'],
                  ['unknown', '尚未登记这两个节点的衔接规则，可先保留一条无方向的参考线。'],
                ].map(([status, description]) => (
                  <span
                    className="erp-chain-design__legend-item"
                    key={status}
                    data-legend-candidate={status}
                  >
                    <span
                      className="erp-chain-design__legend-node"
                      aria-hidden="true"
                    />
                    <span><strong>{CHAIN_CONNECTION_LABELS[status]}</strong><small>{description}</small></span>
                  </span>
                ))}
              </div>
              <div>
                <strong>画布操作</strong>
                <span>{CHAIN_CANVAS_OPERATIONS}</span>
              </div>
            </div>
          }
        >
          <Button ref={legendTrigger} type="text" aria-expanded={legendOpen} aria-label="图例与操作说明">图例与操作</Button>
        </Popover>
      </footer>
    </WorkbenchSection>
  )
  return (
    <div
      ref={workspaceRef}
      className="erp-chain-design-shell"
      data-fullscreen={fullscreen ? 'true' : undefined}
      role={fullscreen ? 'dialog' : undefined}
      aria-modal={fullscreen ? 'true' : undefined}
      aria-label={fullscreen ? '流程探索全屏' : undefined}
    >
      <BusinessChainNodeLibrary
        id={`${legendId}-library`}
        hidden={!showLibrary}
        library={library}
        present={present}
        selectedNodeId={selection?.nodeId}
        connecting={connecting}
        onAdd={addNode}
        onOpenChain={(key) => {
          navigateChain(key)
          setLibraryVisible(false)
          setFilters((previous) => ({ ...previous, search: '' }))
        }}
        onInspect={(nodeId, element) => { resultTrigger.current = element; setConnecting(null); setSelection({ nodeId, detailsOnly: true }) }}
        onToggle={() => {
          setLibraryVisible(false)
          libraryToggle.current?.focus({ preventScroll: true })
        }}
        filters={filters}
        setFilters={setFilters}
        chainKey={map.chainKey}
        nodeScope={nodeScope}
        setNodeScope={setNodeScope}
        listRef={libraryList}
        onShowResults={() => { setLibraryVisible(true); setSelection(null) }}
      >
        {renderWorkspace}
      </BusinessChainNodeLibrary>
    </div>
  )
}
