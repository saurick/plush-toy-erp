import React, { forwardRef, Suspense, useCallback, useContext, useEffect, useId, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Alert, Button, Grid, InputNumber, Popover, Splitter } from 'antd'
import { CloseOutlined } from '@ant-design/icons'
import { createPath, resolvePath, UNSAFE_NavigationContext as RouterNavigationContext, UNSAFE_RouteContext as RouterRouteContext, useBlocker } from 'react-router-dom'
import AppSelect from '@/common/components/select/AppSelect'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { Loading } from '@/common/components/loading'
import { message } from '@/common/utils/antdApp'
import { getPageLoadErrorMessage } from '@/common/utils/errorMessage'
import { RPC_RECORDS_CHANGED, registerRpcChangeSource } from '@/common/utils/rpcChanges.mjs'
import { reportBrowserError } from '@/common/runtime/browserErrors.js'
import { BusinessSplitContext } from './business-list/BusinessSplitContext.jsx'
import { ERPPageActionsContext } from './ERPPageActions.jsx'
import BusinessModuleTabs from './BusinessModuleTabs.jsx'
import { getBusinessModuleTabs, rememberBusinessModuleLocation, resolveBusinessModuleMenuTarget } from '../utils/businessModuleGroups.mjs'
import { TaskBusinessWorkspaceContext } from '../hooks/useBusinessPageContext.js'
import './businessSplitWorkspace.css'

export const SPLIT_PAGE_DRAG_TYPE = 'application/x-erp-business-page'
const emptyRouteContext = { outlet: null, matches: [], isDataRoute: false }

class SplitPageBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error) { reportBrowserError(error, 'react_render') }

  render() {
    const { failed } = this.state
    const { children } = this.props
    return failed ? <Alert type="error" showIcon message="这一栏暂时无法显示" action={<Button onClick={() => this.setState({ failed: false })}>重新打开页面</Button>} /> : children
  }
}

function SplitNavigationGuard({ current }) {
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (createPath(currentLocation) === createPath(nextLocation)) return false
    if (current.current.permitted === '*' || current.current.permitted === createPath(nextLocation)) {
      current.current.permitted = null
      return false
    }
    return Boolean(current.current.leftGuard || (!nextLocation.pathname.startsWith('/erp/') && current.current.rightGuard))
  })
  useEffect(() => {
    if (blocker.state !== 'blocked') return undefined
    let active = true
    current.current.confirmOuter(blocker.location).then((allowed) => {
      if (!active) return
      if (allowed) blocker.proceed()
      else blocker.reset()
    })
    return () => { active = false }
  }, [blocker, current])
  return null
}

// 左栏始终保留原 Outlet；右栏只复用同一组路由和页面，不复制业务表单。
function BusinessSplitWorkspace({
  open, onOpenChange, activeSide, onActiveSideChange, location, navigate,
  outletContext, leftGuard, leftRefresh, renderPage, sections, resolvePage, onRightLocationChange, taskWorkspace, children,
}, ref) {
  const workspaceID = useId()
  const parentNavigation = useContext(RouterNavigationContext)
  const inheritedActions = useContext(ERPPageActionsContext)
  const [rightLocation, setRightLocation] = useState(null)
  const [rightGuard, setRightGuard] = useState(null)
  const [rightRefresh, setRightRefresh] = useState(null)
  const [pending, setPending] = useState({ left: false, right: false })
  const [errors, setErrors] = useState({ left: null, right: null })
  const [refreshing, setRefreshing] = useState({ left: false, right: false })
  const [sizes, setSizes] = useState([50, 50])
  const screens = Grid.useBreakpoint()
  const narrow = screens.lg === false
  const history = useRef({ entries: [], index: -1 })
  const timers = useRef({})
  const reads = useRef({})
  const queuedReads = useRef({})
  const readScopes = useRef({})
  const focus = useRef(activeSide)
  const current = useRef({})
  const ownsNavigation = Boolean(rightLocation)
  const focusPane = useCallback((side) => {
    focus.current = side
    onActiveSideChange(side)
  }, [onActiveSideChange])
  useEffect(() => { focus.current = activeSide }, [activeSide])
  useEffect(() => { onRightLocationChange?.(rightLocation) }, [onRightLocationChange, rightLocation])
  const rightAccess = rightLocation ? resolvePage(rightLocation.pathname) : null
  const rightUIState = useMemo(() => ({
    generation: outletContext.pageUIState?.generation,
    values: new Map(),
  }), [outletContext.pageUIState?.generation])
  useEffect(() => {
    if (rightLocation) rememberBusinessModuleLocation(rightUIState.values, rightLocation)
  }, [rightLocation, rightUIState])
  const registerRightGuard = useCallback((guard) => {
    setRightGuard(() => guard)
    return () => setRightGuard((previous) => previous === guard ? null : previous)
  }, [])
  const registerRightRefresh = useCallback((handler) => {
    setRightRefresh(() => handler)
    return () => setRightRefresh((previous) => previous === handler ? null : previous)
  }, [])
  const confirmAll = useCallback(async (options) => {
    for (const guard of [current.current.leftGuard, current.current.rightGuard]) {
      if (guard && !(await guard(options))) return false
    }
    return true
  }, [])
  const confirmOuter = useCallback(async (next) => {
    const guards = next.pathname.startsWith('/erp/')
      ? [current.current.leftGuard]
      : [current.current.leftGuard, current.current.rightGuard]
    for (const guard of guards) if (guard && !(await guard())) return false
    return true
  }, [])
  const navigatePane = useCallback(async (side, to, options = {}) => {
    const state = current.current
    if (side === 'left') {
      if (typeof to === 'number') { navigate(to); return }
      const target = resolvePath(to, state.location.pathname)
      if (!(await (!target.pathname.startsWith('/erp/') ? confirmAll() : state.leftGuard?.() ?? true))) return
      state.permitted = createPath(target)
      navigate(to, options)
      return
    }
    const previous = state.rightLocation || state.location
    const target = typeof to === 'number'
      ? history.current.entries[history.current.index + to]
      : { ...resolvePath(to, previous.pathname), state: options.state || null, key: crypto.randomUUID() }
    if (!target) return
    if (!target.pathname.startsWith('/erp/') || target.pathname.startsWith('/erp/print-workspace/')) {
      if (await confirmAll()) {
        state.permitted = createPath(target)
        navigate(target, options)
      }
      return
    }
    if (!resolvePage(target.pathname).allowed) {
      message.info('当前账号不能打开这个页面')
      return
    }
    if (state.rightLocation && createPath(target) === createPath(state.rightLocation) && JSON.stringify(target.state) === JSON.stringify(state.rightLocation.state)) return
    if (state.rightGuard && !(await state.rightGuard())) return
    if (typeof to === 'number') history.current.index += to
    else if (options.replace && history.current.index >= 0) history.current.entries[history.current.index] = target
    else {
      history.current.entries = [...history.current.entries.slice(0, history.current.index + 1), target]
      history.current.index = history.current.entries.length - 1
    }
    setPending((value) => ({ ...value, right: false }))
    setErrors((value) => ({ ...value, right: null }))
    setRightLocation(target)
    focusPane('right')
  }, [confirmAll, focusPane, navigate, resolvePage])
  current.current = {
    ...current.current,
location,
rightLocation,
leftGuard,
rightGuard,
leftRefresh,
rightRefresh,
    confirmOuter,
navigatePane,
rightAllowed: rightAccess?.allowed,
  }
  const leftScope = `${createPath(location)}:${outletContext.pageUIState?.generation}`
  const rightScope = `${rightLocation ? createPath(rightLocation) : ''}:${outletContext.pageUIState?.generation}`
  useEffect(() => {
    for (const [side, scope] of [['left', leftScope], ['right', rightScope]]) {
      if (readScopes.current[side] === scope) continue
      readScopes.current[side] = scope
      delete reads.current[side]
      delete queuedReads.current[side]
      clearTimeout(timers.current[side])
      setPending((value) => ({ ...value, [side]: false }))
      setErrors((value) => ({ ...value, [side]: null }))
      setRefreshing((value) => ({ ...value, [side]: false }))
    }
  }, [leftScope, rightScope])
  const refreshPane = useCallback(async (side, manual = false) => {
    let latest = current.current
    const scope = readScopes.current[side]
    const guard = latest[`${side}Guard`]
    if (guard && !manual) {
      setPending((value) => ({ ...value, [side]: true }))
      return
    }
    if (guard && !(await guard({ intent: 'refresh' }))) return
    if (readScopes.current[side] !== scope) return
    latest = current.current
    const handler = latest[`${side}Refresh`]
    if (!handler || (side === 'right' && !latest.rightAllowed)) return
    if (reads.current[side]) { if (!manual) queuedReads.current[side] = true; return }
    const read = {}
    reads.current[side] = read
    setRefreshing((value) => ({ ...value, [side]: true }))
    try {
      const result = await handler()
      if (reads.current[side] !== read) return
      if (result === false) throw new Error('资料暂时未能更新，请重试')
      setPending((value) => ({ ...value, [side]: false }))
      setErrors((value) => ({ ...value, [side]: null }))
    } catch (error) {
      if (reads.current[side] === read) setErrors((value) => ({ ...value, [side]: error }))
    } finally {
      if (reads.current[side] === read) {
        delete reads.current[side]
        setRefreshing((value) => ({ ...value, [side]: false }))
        if (queuedReads.current[side]) {
          delete queuedReads.current[side]
          refreshPane(side)
        }
      }
    }
  }, [])
  useEffect(() => {
    if (pending.left && !leftGuard) refreshPane('left')
    if (pending.right && !rightGuard) refreshPane('right')
  }, [leftGuard, rightGuard, pending, leftRefresh, rightRefresh, refreshPane])
  useEffect(() => registerRpcChangeSource(() => ({ workspaceID, pane: focus.current })), [workspaceID])
  useEffect(() => {
    const pendingTimers = timers.current
    const changed = ({ detail }) => {
      if (detail?.source?.workspaceID !== workspaceID || !current.current.rightLocation) return
      for (const side of ['left', 'right']) {
        clearTimeout(timers.current[side])
        timers.current[side] = setTimeout(() => refreshPane(side), 80)
      }
    }
    window.addEventListener(RPC_RECORDS_CHANGED, changed)
    return () => {
      window.removeEventListener(RPC_RECORDS_CHANGED, changed)
      Object.values(pendingTimers).forEach(clearTimeout)
      reads.current = {}
    }
  }, [refreshPane, workspaceID])
  useImperativeHandle(ref, () => ({
    ownsNavigation,
    navigate: (to, options) => navigatePane(open ? focus.current : 'left', to, options),
    confirmLeaveAll: async (options) => {
      const allowed = await confirmAll(options)
      if (allowed) current.current.permitted = '*'
      return allowed
    },
    dragPage: (event, path) => event.dataTransfer.setData(SPLIT_PAGE_DRAG_TYPE, path),
    refresh: (side = 'left') => refreshPane(side, true),
    navigateMenu: (item) => navigatePane('right', resolveBusinessModuleMenuTarget(item, current.current.rightLocation || current.current.location, rightUIState.values, outletContext.visibleMenuPaths)),
  }), [confirmAll, navigatePane, open, ownsNavigation, refreshPane, rightUIState, outletContext.visibleMenuPaths])
  const rightNavigator = useMemo(() => ({
    createHref: createPath,
    encodeLocation: (to) => resolvePath(to, current.current.rightLocation?.pathname),
    push: (to, state) => current.current.navigatePane('right', to, { state }),
    replace: (to, state) => current.current.navigatePane('right', to, { state, replace: true }),
    go: (delta) => current.current.navigatePane('right', delta),
  }), [])
  const rightNavigation = useMemo(() => ({ ...parentNavigation, navigator: rightNavigator }), [parentNavigation, rightNavigator])
  const rightWorkspace = useMemo(() => rightLocation ? getBusinessModuleTabs(rightLocation.pathname, sections, {
    search: rightLocation.search, adminProfile: outletContext.adminProfile,
  }) : null, [rightLocation, sections, outletContext.adminProfile])
  const rightContext = useMemo(() => ({
    ...outletContext,
    workflowTaskNavigation: null,
    registerPageLeaveGuard: registerRightGuard,
    registerPageRefresh: registerRightRefresh,
    pageUIState: rightUIState,
    moduleWorkspace: rightWorkspace,
  }), [outletContext, registerRightGuard, registerRightRefresh, rightUIState, rightWorkspace])
  const leftVisible = !open || !narrow || activeSide === 'left'
  const rightVisible = open && (!narrow || activeSide === 'right')
  const paneContext = useMemo(() => ({ handlingNavigation: ownsNavigation, open, visible: leftVisible, side: 'left', scope: `${workspaceID.replace(/:/gu, '')}-left` }), [open, ownsNavigation, workspaceID, leftVisible])
  const rightPaneContext = useMemo(() => ({ ...paneContext, visible: rightVisible, side: 'right', scope: `${workspaceID.replace(/:/gu, '')}-right` }), [paneContext, rightVisible, workspaceID])
  const rightActions = useMemo(() => ({
    ...inheritedActions,
    onRefresh: rightRefresh ? () => refreshPane('right', true) : null,
    refreshing: refreshing.right,
  }), [inheritedActions, rightRefresh, refreshing.right, refreshPane])
  const leftActions = useMemo(() => open || ownsNavigation ? ({
    ...inheritedActions,
    onRefresh: leftRefresh ? () => refreshPane('left', true) : null,
    refreshing: refreshing.left,
  }) : inheritedActions, [inheritedActions, open, ownsNavigation, leftRefresh, refreshing.left, refreshPane])
  const choices = useMemo(() => sections.flatMap((section) => section.items || [])
    .map((item) => ({ value: item.path, label: item.label })), [sections])
  const availableChoices = rightLocation && !rightAccess?.allowed
    ? [...choices.filter((choice) => choice.value !== rightLocation.pathname), { value: rightLocation.pathname, label: '原页面已不可用', disabled: true }]
    : choices
  const clearRightPage = async () => {
    if (rightGuard && !(await rightGuard())) return
    setRightLocation(null)
    setRightGuard(null)
    setRightRefresh(null)
    history.current = { entries: [], index: -1 }
  }
  const dropPage = (side) => (event) => {
    const path = event.dataTransfer.getData(SPLIT_PAGE_DRAG_TYPE)
    if (!path) return
    event.preventDefault()
    navigatePane(side, path)
  }
  const feedback = (side) => {
    if (side === 'right' && !rightAccess?.allowed) return null
    if (errors[side]) { return (
      <Alert
        type="warning"
        showIcon
        message="关联页面更新失败"
        description={getPageLoadErrorMessage(errors[side], '更新页面资料')}
        action={<Button onClick={() => refreshPane(side, true)} loading={refreshing[side]}>重试读取</Button>}
      />
    ) }
    return pending[side] ? <Alert type="info" showIcon message="资料已更新" description="当前编辑内容已保留；返回列表后自动更新。" /> : null
  }
  let rightContent = <Empty description="选择一个页面，或将左侧菜单拖到这里" detail="两栏分别编辑和保存。" />
  if (rightLocation) {
    rightContent = rightAccess?.allowed ? (
      <ERPPageActionsContext.Provider value={rightActions}>
        <RouterNavigationContext.Provider value={rightNavigation}>
          <RouterRouteContext.Provider value={emptyRouteContext}>
            <div className="erp-admin-outlet erp-admin-outlet--module">
              <BusinessModuleTabs workspace={rightWorkspace} cache={rightUIState.values} onNavigate={(to) => navigatePane('right', to)} helpKey={rightAccess.entry?.key} />
              {rightAccess.guarded || (
                <SplitPageBoundary key={`${rightUIState.generation}:${rightLocation.pathname}`}>
                  <Suspense key={rightLocation.pathname} fallback={<Loading title="正在加载页面" description={null} />}>
                    {renderPage(rightLocation, rightContext)}
                  </Suspense>
                </SplitPageBoundary>
              )}
            </div>
          </RouterRouteContext.Provider>
        </RouterNavigationContext.Provider>
      </ERPPageActionsContext.Provider>
    ) : <Alert type="warning" message="当前账号不能查看这个页面" />
  }
  const visibleSizes = !open ? [100, 0] : narrow ? activeSide === 'left' ? [100, 0] : [0, 100] : sizes
  const paneEvents = (side) => ({
    onPointerDownCapture: () => focusPane(side),
    onFocusCapture: () => focusPane(side),
    onDragOver: (event) => { if (event.dataTransfer.types.includes(SPLIT_PAGE_DRAG_TYPE)) event.preventDefault() },
    onDrop: dropPage(side),
  })
  return (
    <TaskBusinessWorkspaceContext.Provider value={taskWorkspace}>
      <BusinessSplitContext.Provider value={paneContext}>
        {ownsNavigation ? <SplitNavigationGuard current={current} /> : null}
        <div className="erp-split-workspace" data-split-open={open} data-active-pane={activeSide}>
          {open ? (
            <div className="erp-split-switcher">
              <SlidingSegmented block aria-label="选择编辑栏" options={[{ value: 'left', label: '左栏' }, { value: 'right', label: '右栏' }]} value={activeSide} onChange={focusPane} />
            </div>
        ) : null}
          <Splitter
            className="erp-split-panels"
            lazy
            onResize={(values) => {
          const total = values[0] + values[1]
          if (open && !narrow && total > 0) setSizes(values.map((value) => value / total * 100))
        }}
          >
            <Splitter.Panel className="erp-split-panel--left" size={`${visibleSizes[0]}%`} min={open && !narrow ? '32%' : 0} max={open && !narrow ? '68%' : '100%'} resizable={open && !narrow}>
              <ERPPageActionsContext.Provider value={leftActions}>
                <section className="erp-split-pane erp-split-pane--left" data-erp-split-pane={open ? 'left' : undefined} aria-label={open ? '左栏页面' : undefined} hidden={!leftVisible} {...paneEvents('left')}>
                  {open ? (
                    <div className="erp-split-pane__header">
                      <Button type={activeSide === 'left' ? 'primary' : 'default'} aria-pressed={activeSide === 'left'} onClick={() => focusPane('left')}>左栏</Button>
                      <span>点击菜单在当前栏打开</span>
                      <Popover trigger="click" content={<label>左栏宽度（%） <InputNumber aria-label="左栏宽度百分比" min={32} max={68} value={Math.round(sizes[0])} onChange={(value) => { if (value !== null) { const width = Math.max(32, Math.min(68, value)); setSizes([width, 100 - width]) } }} /></label>}>
                        <Button>布局</Button>
                      </Popover>
                    </div>
              ) : null}
                  {feedback('left')}
                  {children}
                </section>
              </ERPPageActionsContext.Provider>
            </Splitter.Panel>
            <Splitter.Panel className="erp-split-panel--right" size={`${visibleSizes[1]}%`} min={open && !narrow ? '32%' : 0} max={open && !narrow ? '68%' : '100%'} resizable={open && !narrow}>
              <BusinessSplitContext.Provider value={rightPaneContext}>
                <section className="erp-split-pane erp-split-pane--right" data-erp-split-pane={open ? 'right' : undefined} aria-label="右栏页面" hidden={!rightVisible} {...paneEvents('right')}>
                  <div className="erp-split-pane__header">
                    <Button type={activeSide === 'right' ? 'primary' : 'default'} aria-pressed={activeSide === 'right'} onClick={() => focusPane('right')}>右栏</Button>
                    <AppSelect aria-label="选择右栏页面" showSearch optionFilterProp="label" placeholder="选择要并排打开的页面" value={rightLocation ? rightAccess?.allowed ? rightAccess.entry.path : rightLocation.pathname : undefined} options={availableChoices} onChange={(path) => { if (path) navigatePane('right', path); else clearRightPage() }} />
                    <Button aria-label="收起分栏" icon={<CloseOutlined />} onClick={() => { onOpenChange(false); focusPane('left') }} />
                  </div>
                  {feedback('right')}
                  {rightContent}
                </section>
              </BusinessSplitContext.Provider>
            </Splitter.Panel>
          </Splitter>
        </div>
      </BusinessSplitContext.Provider>
    </TaskBusinessWorkspaceContext.Provider>
  )
}

export default forwardRef(BusinessSplitWorkspace)
