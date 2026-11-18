import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, Checkbox, Popover, Typography } from 'antd'
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons'
import DevPageHeader from '../DevPageHeader.jsx'
import AppSelect from '@/common/components/select/AppSelect.jsx'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList.jsx'
import {
  WorkbenchSection,
  WorkbenchToolbar,
  WorkbenchNotice,
} from '../WorkbenchPattern.jsx'
import {
  CHAIN_DESIGN_DOMAINS,
  CHAIN_DESIGN_TYPES,
  buildBusinessChainDesignLibrary,
} from '../../config/devBusinessChainDesign.mjs'
import {
  addBusinessChainMapNode,
  businessChainMapState,
  businessChainMapScope,
  showBusinessChainWhole,
  arrangeBusinessChainMap,
} from '../../config/devBusinessChainMap.mjs'
import { CHAIN_READING_LAYERS } from '../../config/devBusinessChainReading.mjs'
import useBusinessChainDraft from './useBusinessChainDraft.mjs'
import BusinessChainDesignDrafts from './BusinessChainDesignDrafts.jsx'
import BusinessChainDesignExport from './BusinessChainDesignExport.jsx'
import { CHAIN_CANVAS_OPERATIONS, CHAIN_CANVAS_RELATIONS } from '../../config/devBusinessChainExport.mjs'
import useBusinessChainDesignFullscreen from './useBusinessChainDesignFullscreen.mjs'
import BusinessChainDesignCanvas from './BusinessChainDesignCanvas.jsx'
import BusinessChainNodeLibrary from './BusinessChainNodeLibrary.jsx'
import BusinessChainEmployeeExample from './BusinessChainEmployeeExample.jsx'
import DiagramNodeIcon from '@/common/components/diagram/DiagramNodeIcon.jsx'
import { diagramDomainStyle } from '@/common/components/diagram/diagramSemantics.mjs'
import { applyDevFlowExplorerEntry } from '../../pages/devFlowExplorerNavigation.mjs'
import { DEV_FLOW_EXPLORER_ROUTE, DEV_PAGE_TITLE_BY_ROUTE } from '../../config/devRoutes.mjs'
import './businessChainDesigner.css'

export default function BusinessChainDesigner({ catalog, entry, onEntryApplied, initialRange, startBlank = false }) {
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
  const [selection, setSelection] = useState(null)
  const [notice, setNotice] = useState('')
  const [frameKey, setFrameKey] = useState(0)
  const [libraryVisible, setLibraryVisible] = useState(() => window.innerWidth >= 1440)
  const [workspace, setWorkspace] = useState('explore')
  const [filters, setFilters] = useState({ view: 'steps', search: '', domain: '', type: '', role: '', chain: '' })
  const [nodeScope, setNodeScope] = useState('current')
  const libraryList = useRef(null)
  const libraryToggle = useRef(null)
  const [history, setHistory] = useState([])
  const initialCamera = draft.presentation?.viewport || { x: 0, y: 0, scale: 1, mode: 'manual' }
  const [camera, setCamera] = useState(initialCamera)
  const [viewRequest, setViewRequest] = useState({ revision: 0, view: draft.presentation?.viewport || null })
  const [legendOpen, setLegendOpen] = useState(false)
  const legendTrigger = useRef(null)
  const legendPanel = useRef(null)
  const appliedEntry = useRef(null)
  useEffect(() => {
    if (startBlank) {
      if (appliedEntry.current === 'blank') {
        if (!issue) onEntryApplied()
      } else {
        appliedEntry.current = 'blank'
        // Keep the entry until this tab has persisted its blank state, even if opener storage was copied.
        draftModel.startNew()
      }
      return
    }
    if (!entry || issue || appliedEntry.current === entry) return
    appliedEntry.current = entry
    // Opening a source changes only reading scope; existing coordinates and notes are preserved.
    change((previous) => {
      const next = applyDevFlowExplorerEntry(previous, library, entry)
      const { viewport: _viewport, ...presentation } = next.presentation || {}
      return { ...next, presentation }
    })
    setFrameKey((value) => value + 1)
    onEntryApplied()
  }, [startBlank, entry, issue, change, library, onEntryApplied, draftModel])
  const { mode: viewMode = 'mainline', role = '' } = draft.presentation || {}
  const layout = draft.presentation?.layout || 'flow'
  const layers = draft.presentation?.layers || ['normal']
  const setPresentation = (value) =>
    draftModel.changePresentation({ ...draft.presentation, mode: viewMode, role, ...value })
  const setViewMode = (mode) => setPresentation({ mode })
  const setRole = (value) => setPresentation({ role: value })
  const map = businessChainMapState(draft, library)
  const scope = businessChainMapScope(draft, library)
  const present = new Set(scope.nodes.map((node) => node.id))
  const resetInteraction = () => {
    setFrameKey((value) => value + 1)
    setConnecting(null)
    setSelection(null)
    setNotice('')
  }
  const restoreCamera = (value, fitMode = 'fit-all') => {
    setCamera(value || { x: 0, y: 0, scale: 1, mode: fitMode })
    setViewRequest((previous) => ({ revision: previous.revision + 1, view: value || null }))
  }
  const navigateReading = (next, selected = null, kind = 'focus') => {
    setHistory((previous) => [...previous.slice(-15), {
      draft,
      selection,
      camera,
      filters,
      nodeScope,
      workspace,
      libraryVisible,
      scrollTop: libraryList.current?.scrollTop || 0,
      kind,
    }])
    change(next)
    setSelection(selected)
    setConnecting(null)
    setWorkspace('explore')
    setNotice('')
    restoreCamera(kind === 'chain' && !selected && camera.mode !== 'fit-width' && next.presentation?.layout === 'lanes' && next.map?.chainKey !== 'all'
      ? { x: 24, y: 24, scale: 1, mode: 'manual' } : null,
      kind === 'chain' && !selected && camera.mode === 'fit-width' ? 'fit-width' : 'fit-all')
    setFrameKey((value) => value + 1)
  }
  const navigateChain = (key, selected = null) => {
    const mode = key === 'all' ? 'overview' : map.chainKey === 'all' || selected ? 'mainline' : viewMode
    let next = showBusinessChainWhole(draft, library, key)
    if (!next.nodes.some((node) => node.manual && next.map.visibleIds.includes(node.id))) {
      next = arrangeBusinessChainMap(next, library, mode, layout)
    }
    const { viewport: _viewport, ...readingOptions } = draft.presentation || {}
    navigateReading({ ...next, presentation: { ...readingOptions, mode, role, layout, layers } }, selected, 'chain')
  }
  const returnReading = (preserveGranularity = false) => {
    const previous = history.at(-1)
    if (!previous) return
    change(preserveGranularity === true ? { ...previous.draft, presentation: { ...previous.draft.presentation, mode: viewMode, role } } : previous.draft)
    setHistory((items) => items.slice(0, -1))
    setSelection(previous.selection)
    setFilters(previous.filters)
    setNodeScope(previous.nodeScope)
    setLibraryVisible(previous.libraryVisible)
    setWorkspace(previous.workspace)
    setConnecting(null)
    setNotice('')
    restoreCamera(previous.camera)
    requestAnimationFrame(() => {
      if (libraryList.current) libraryList.current.scrollTop = previous.scrollTop
    })
  }
  const addNode = (id, position) => {
    if (!present.has(id)) {
      change((previous) =>
        addBusinessChainMapNode(previous, library, id, position)
      )
      setNotice(`已加入“${library.byId.get(id).label}”，可逐步展开上下游。`)
      if (!position) setFrameKey((value) => value + 1)
    }
    setSelection(
      connecting && connecting !== id
        ? { from: connecting, to: id }
        : { nodeId: id }
    )
  }
  const editor = (
    <WorkbenchSection
      flat
      className="erp-chain-design"
      aria-label="流程探索"
    >
      <DevPageHeader
        className="erp-chain-design__header"
        title={<Typography.Title level={1}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_FLOW_EXPLORER_ROUTE]}</Typography.Title>}
        navigation={<SlidingTabList
          aria-label="流程探索入口"
          value={workspace}
          onChange={setWorkspace}
          options={[
          { value: 'explore', label: '规则探索' },
          { value: 'example', label: '员工定位示例' },
        ]}
        />}
        tools={
          <div className="erp-chain-design__file-actions" hidden={workspace !== 'explore'}>
            <BusinessChainDesignDrafts
              confirmNew={draftModel.needsNewConfirmation}
              onNew={() => {
                const error = draftModel.startNew()
                if (!error) {
                  resetInteraction()
                  setHistory([])
                  restoreCamera(null)
                }
                return error
              }}
              notesCount={draft.ideas.length}
              onNotes={() => {
                setConnecting(null)
                setSelection({ ideas: true })
              }}
            />
            <BusinessChainDesignExport
              disabled={!scope.nodes.length || workspace !== 'explore'}
              onNotice={setNotice}
              getGraph={() => {
                const chain = library.chains.find(({ value }) => value === map.chainKey)?.label || '业务全流程地图'
                const mode = map.scope === 'whole' && map.chainKey === 'all' ? 'overview' : viewMode
                return {
                  surface: workspaceRef.current.querySelector('.erp-chain-design__surface'),
                  scale: camera.scale,
                  title: chain,
                  context: [
                    `${map.scope === 'whole' ? '整体' : '局部'} · ${chain}`,
                    map.focusId ? library.byId.get(map.focusId)?.label : '',
                    { overview: '链路概览', mainline: '业务步骤', all: '全部已载入节点' }[mode],
                    mode === 'overview' ? '' : layout === 'lanes' ? '业务泳道' : '阶段排布',
                    role ? `岗位：${library.roles.find(({ value }) => value === role)?.label}` : '',
                    draft.presentation?.showBranches ? '分支已展开' : '',
                  ].filter(Boolean).join(' · '),
                }
              }}
            />
          </div>
        }
        context={
          <WorkbenchToolbar className="erp-chain-design__toolbar" hidden={workspace !== 'explore'}>
            <Button
              ref={libraryToggle}
              icon={libraryVisible ? <MenuFoldOutlined /> : <MenuUnfoldOutlined />}
              aria-label={libraryVisible ? '收起节点库' : '展开节点库'}
              aria-expanded={libraryVisible}
              aria-controls={`${legendId}-library`}
              onClick={() => setLibraryVisible((value) => !value)}
            >
              节点库
            </Button>
            <div className="erp-chain-design__role-filter">
              <label htmlFor={`${legendId}-scope`}>流程范围</label>
              <AppSelect
                id={`${legendId}-scope`}
                aria-label="选择流程范围"
                allowClear={false /* 不可清空：明确选择后加载链路，空白画布保持未选状态。 */}
                value={draft.nodes.length ? map.chainKey : undefined}
                placeholder="尚未加载链路"
                options={[{ value: 'all', label: '业务全流程地图' }, ...library.chains]}
                onChange={(key) => {
                if (key !== map.chainKey || map.scope !== 'whole') navigateChain(key)
              }}
              />
            </div>
            <div className="erp-chain-design__role-filter">
              <FilterSelect
                label="岗位高亮"
                id={`${legendId}-role`}
                aria-label="岗位高亮"
                placeholder="全链路视角"
                value={role}
                options={library.roles}
                onChange={setRole}
                allowClear
              />
            </div>
            <div className="erp-chain-design__role-filter erp-chain-design__layout-filter">
              <label htmlFor={`${legendId}-layout`}>布局</label>
              <AppSelect
                id={`${legendId}-layout`}
                aria-label="流程布局"
                allowClear={false /* 不可清空：布局必须指定一种已支持的排布方式。 */}
                value={map.scope === 'whole' && map.chainKey === 'all' ? 'map' : layout}
                options={map.scope === 'whole' && map.chainKey === 'all' ? [{ value: 'map', label: '链路地图' }] : [{ value: 'lanes', label: '业务泳道' }, { value: 'flow', label: '阶段排布' }]}
                disabled={map.scope === 'whole' && map.chainKey === 'all'}
                onChange={(value) => {
                const next = arrangeBusinessChainMap(draft, library, viewMode, value)
                const { viewport: _viewport, ...readingOptions } = draft.presentation || {}
                const nextCamera = value === 'lanes' ? { x: 24, y: 24, scale: 1, mode: 'manual' } : null
                change({ ...next, presentation: { ...readingOptions, mode: viewMode, role, layout: value, layers, ...(nextCamera ? { viewport: nextCamera } : {}) } })
                resetInteraction()
                restoreCamera(nextCamera)
                setNotice(value === 'lanes' ? '已按领域分行；可平移查看交接，也可适应全图。' : '已调整当前布局，可撤销；业务关系保持不变。')
              }}
              />
            </div>
            <Popover
              trigger="click"
              content={<Checkbox.Group
                aria-label="显示哪些跨链关系"
                value={layers}
                options={CHAIN_READING_LAYERS.map(({ value, label }) => ({ value, label }))}
                onChange={(value) => setPresentation({ layers: value })}
              />}
            >
              <Button aria-label="关系层">关系层</Button>
            </Popover>
            {history.length > 0 ? <Button onClick={returnReading}>{history.at(-1).workspace === 'example' ? '返回员工示例' : '返回来处'}</Button> : null}
          </WorkbenchToolbar>
        }
      />
      {issue ? <WorkbenchNotice tone="error" title={issue} action={!draftModel.restoreFailed ? <Button onClick={draftModel.retryPersistence}>重试自动保留</Button> : null} /> : null}
      <div className="erp-chain-design__workspace" data-library-visible={libraryVisible} hidden={workspace !== 'explore'}>
        <BusinessChainNodeLibrary
          id={`${legendId}-library`}
          hidden={!libraryVisible}
          library={library}
          present={present}
          selectedNodeId={selection?.nodeId}
          connecting={connecting}
          onAdd={addNode}
          onInspect={(nodeId) => { setConnecting(null); setSelection({ nodeId, detailsOnly: true }) }}
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
        />
        <BusinessChainDesignCanvas
          frameKey={frameKey}
          fullscreen={fullscreen}
          toggleFullscreen={toggleFullscreen}
          fullscreenButtonRef={buttonRef}
          viewMode={viewMode}
          setViewMode={setViewMode}
          catalog={catalog}
          library={library}
          draft={draft}
          change={change}
          undo={undo}
          canUndo={past.length > 0}
          redo={redo}
          canRedo={future.length > 0}
          addNode={addNode}
          role={role}
          connecting={connecting}
          setConnecting={setConnecting}
          selection={selection}
          setSelection={setSelection}
          notice={notice}
          setNotice={setNotice}
          view={camera}
          setView={setCamera}
          viewRequest={viewRequest}
          onNavigate={navigateReading}
          onNavigateChain={navigateChain}
          onReturn={history.at(-1)?.kind === 'focus' ? () => returnReading(true) : null}
          layers={layers}
          layout={layout}
          setReadingOptions={setPresentation}
          onCameraCommit={(viewport) => setPresentation({ viewport })}
        />
      </div>
      <div hidden={workspace !== 'example'}>
        <BusinessChainEmployeeExample library={library} onLocate={(value) => navigateChain(value.chainKey, { nodeId: value.nodeId, preview: value.preview })} />
      </div>
      <footer className="erp-chain-design__footer" hidden={workspace !== 'explore'}>
        <span>当前范围已载入：{scope.nodes.length} 个节点 · {scope.edges.length} 条关系</span>
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
              </div>
              <div>
                <strong>业务关系</strong>
                {['known', 'exception', 'unknown'].map((kind) => (
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
                  [
                    'known',
                    '有接入规则',
                    '已登记这两个节点的衔接关系；实际办理仍需满足相应条件。',
                  ],
                  [
                    'blocked',
                    '不能直连',
                    '现有规则限制直接连接，可能需要经过其他步骤；具体原因见连线说明。',
                  ],
                  [
                    'unknown',
                    '待核对',
                    '当前目录尚未登记明确的衔接关系，需要进一步核对。',
                  ],
                ].map(([status, label, description]) => (
                  <span
                    className="erp-chain-design__legend-item"
                    key={status}
                    data-legend-candidate={status}
                  >
                    <span
                      className="erp-chain-design__legend-node"
                      aria-hidden="true"
                    />
                    <span><strong>{label}</strong><small>{description}</small></span>
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
      {editor}
    </div>
  )
}
