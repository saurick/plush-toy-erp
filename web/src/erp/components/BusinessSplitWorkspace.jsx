import React, { forwardRef, Suspense, useCallback, useContext, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, ConfigProvider, Grid, Splitter } from 'antd'
import { createPath, resolvePath, UNSAFE_NavigationContext as RouterNavigationContext, UNSAFE_RouteContext as RouterRouteContext, useBlocker } from 'react-router-dom'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { Loading } from '@/common/components/loading'
import OverlayScopeProvider from '@/common/components/overlay/OverlayScopeProvider.jsx'
import { message } from '@/common/utils/antdApp'
import { getPageLoadErrorMessage } from '@/common/utils/errorMessage'
import { RPC_RECORDS_CHANGED, registerRpcChangeSource } from '@/common/utils/rpcChanges.mjs'
import { reportBrowserError } from '@/common/runtime/browserErrors.js'
import { BusinessSplitContext } from './business-list/BusinessSplitContext.jsx'
import ERPPageActions, { ERPPageActionsContext } from './ERPPageActions.jsx'
import { BusinessSplitHeaderContext, BusinessSplitPageTitle } from './BusinessSplitHeader.jsx'
import BusinessModuleTabs from './BusinessModuleTabs.jsx'
import { getBusinessModuleTabs, groupSidebarNavigationSections, rememberBusinessModuleLocation, resolveBusinessModuleMenuTarget } from '../utils/businessModuleGroups.mjs'
import { TaskBusinessWorkspaceContext } from '../hooks/useBusinessPageContext.js'
import './businessSplitWorkspace.css'

export const SPLIT_PAGE_DRAG_TYPE = 'application/x-erp-business-page'
const DEFAULT_LEFT_WIDTH = 50
const emptyRouteContext = { outlet: null, matches: [], isDataRoute: false }

function SplitPaneHeader({ title }) {
  return <div className="erp-split-fallback-header"><h1 aria-label={title}><BusinessSplitPageTitle title={title} /></h1><ERPPageActions /></div>
}

class SplitPageBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() { return { failed: true } }

  componentDidCatch(error) { reportBrowserError(error, 'react_render') }

  render() {
    const { failed } = this.state
    const { children, headerTitle } = this.props
    return failed ? <>{headerTitle ? <SplitPaneHeader title={headerTitle} /> : null}<Alert type="error" showIcon message="这一栏暂时无法显示" action={<Button onClick={() => this.setState({ failed: false })}>重新打开页面</Button>} /></> : children
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

// 原页面始终保留 Outlet；附加页复用同一组路由和表单，互换只改变显示方向。
function BusinessSplitWorkspace({
  open, onOpenChange, activeSide, onActiveSideChange, location, navigate,
  outletContext, leftGuard, leftRefresh, renderPage, sections, resolvePage, onRightLocationChange, taskWorkspace, children,
}, ref) {
  const workspaceID = useId()
  const leftPaneRef = useRef(null)
  const rightPaneRef = useRef(null)
  const emptyTitleFocusPending = useRef(false)
  useEffect(() => {
    const clearDropTargets = () => {
      for (const pane of [leftPaneRef.current, rightPaneRef.current]) pane?.removeAttribute('data-drop-target')
    }
    if (!open) { clearDropTargets(); return undefined }
    window.addEventListener('dragend', clearDropTargets)
    return () => { window.removeEventListener('dragend', clearDropTargets); clearDropTargets() }
  }, [open])
  const parentNavigation = useContext(RouterNavigationContext)
  const inheritedActions = useContext(ERPPageActionsContext)
  const { direction: contentDirection = 'ltr' } = useContext(ConfigProvider.ConfigContext)
  const [rightLocation, setRightLocation] = useState(null)
  const [rightGuard, setRightGuard] = useState(null)
  const [rightRefresh, setRightRefresh] = useState(null)
  const [leftOverlayGuard, setLeftOverlayGuard] = useState(null)
  const [rightOverlayGuard, setRightOverlayGuard] = useState(null)
  const registerLeftOverlayGuard = useCallback((guard) => setLeftOverlayGuard(() => guard), [])
  const registerRightOverlayGuard = useCallback((guard) => setRightOverlayGuard(() => guard), [])
  const guardLeft = useMemo(() => leftOverlayGuard || leftGuard ? async (options) => {
    for (const guard of [leftOverlayGuard, leftGuard]) if (guard && !(await guard(options))) return false
    return true
  } : null, [leftGuard, leftOverlayGuard])
  const guardRight = useMemo(() => rightOverlayGuard || rightGuard ? async (options) => {
    for (const guard of [rightOverlayGuard, rightGuard]) if (guard && !(await guard(options))) return false
    return true
  } : null, [rightGuard, rightOverlayGuard])
  const [pending, setPending] = useState({ left: false, right: false })
  const [errors, setErrors] = useState({ left: null, right: null })
  const [refreshing, setRefreshing] = useState({ left: false, right: false })
  const [sizes, setSizes] = useState([DEFAULT_LEFT_WIDTH, 100 - DEFAULT_LEFT_WIDTH])
  const [relatedCreates, setRelatedCreates] = useState({ left: null, right: null })
  const relatedCreatesRef = useRef(relatedCreates)
  relatedCreatesRef.current = relatedCreates
  const [swapped, setSwapped] = useState(false)
  const paneLabel = useCallback((side) => (side === 'left') !== swapped ? '左栏' : '右栏', [swapped])
  const splitterDirection = swapped ? 'rtl' : 'ltr'
  const swapPanes = useCallback(() => {
    setSwapped((value) => !value)
    setSizes((value) => [value[1], value[0]])
  }, [])
  const screens = Grid.useBreakpoint()
  const narrow = screens.lg === false
  const history = useRef({ entries: [], index: -1 })
  const timers = useRef({})
  const reads = useRef({})
  const queuedReads = useRef({})
  const readScopes = useRef({})
  const focus = useRef(activeSide)
  const current = useRef({})
  const ownsNavigation = Boolean(rightLocation || leftOverlayGuard || rightOverlayGuard)
  const focusPane = useCallback((side) => {
    focus.current = side
    onActiveSideChange(side)
  }, [onActiveSideChange])
  useEffect(() => { focus.current = activeSide }, [activeSide])
  useEffect(() => { onRightLocationChange?.(rightLocation) }, [onRightLocationChange, rightLocation])
  const rightAccess = useMemo(() => rightLocation ? resolvePage(rightLocation.pathname) : null, [rightLocation, resolvePage])
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
      if (guard && !(await guard({ ...options, overlay: 'workspace' }))) return false
    }
    return true
  }, [])
  const confirmOuter = useCallback(async (next) => {
    const guards = next.pathname.startsWith('/erp/')
      ? [current.current.leftGuard]
      : [current.current.leftGuard, current.current.rightGuard]
    for (const guard of guards) if (guard && !(await guard(next.pathname.startsWith('/erp/') ? undefined : { overlay: 'workspace' }))) return false
    return true
  }, [])
  const navigatePane = useCallback(async (side, to, options = {}) => {
    const state = current.current
    if (side === 'left') {
      if (typeof to === 'number') { navigate(to); return true }
      const target = resolvePath(to, state.location.pathname)
      if (!(await (!target.pathname.startsWith('/erp/') ? confirmAll() : state.leftGuard?.() ?? true))) return false
      current.current.permitted = createPath(target)
      navigate(to, options)
      return true
    }
    const previous = state.rightLocation || state.location
    const target = typeof to === 'number'
      ? history.current.entries[history.current.index + to]
      : { ...resolvePath(to, previous.pathname), state: options.state || null, key: crypto.randomUUID() }
    if (!target) return false
    if (!target.pathname.startsWith('/erp/') || target.pathname.startsWith('/erp/print-workspace/')) {
      if (await confirmAll()) {
        current.current.permitted = createPath(target)
        navigate(target, options)
        return true
      }
      return false
    }
    if (!resolvePage(target.pathname).allowed) {
      message.info('当前账号不能打开这个页面')
      return false
    }
    if (state.rightLocation && createPath(target) === createPath(state.rightLocation) && JSON.stringify(target.state) === JSON.stringify(state.rightLocation.state)) return true
    if (state.rightGuard && !(await state.rightGuard())) return false
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
    return true
  }, [confirmAll, focusPane, navigate, resolvePage])
  const openRelatedCreate = useCallback(async (sourceSide, request) => {
    if (!resolvePage(request.path).allowed) return null
    const targetSide = sourceSide === 'left' ? 'right' : 'left'
    const source = current.current[sourceSide === 'left' ? 'location' : 'rightLocation']
    if (!source) return false
    const destination = current.current[targetSide === 'left' ? 'location' : 'rightLocation']
    if (destination?.pathname === request.path) {
      const guard = current.current[`${targetSide}Guard`]
      if (guard && !(await guard())) return false
    } else if (!(await navigatePane(targetSide, request.path))) return false
    const latestSource = current.current[sourceSide === 'left' ? 'location' : 'rightLocation']
    if (!latestSource || createPath(latestSource) !== createPath(source)) return false
    const id = crypto.randomUUID()
    setRelatedCreates((previous) => ({ ...previous, [targetSide]: { ...request, id, sourceSide, sourcePath: createPath(source), targetReady: false } }))
    onOpenChange(true)
    focusPane(targetSide)
    return () => setRelatedCreates((previous) => previous[targetSide]?.id === id ? { ...previous, [targetSide]: null } : previous)
  }, [focusPane, navigatePane, onOpenChange, resolvePage])
  const completeRelatedCreate = useCallback(async (side, id, record) => {
    const request = relatedCreatesRef.current[side]
    if (request?.id !== id) return false
    let applied = false
    try {
      applied = (await request.onCreated(record)) !== false
    } catch (error) {
      reportBrowserError(error)
    }
    setRelatedCreates((previous) => previous[side]?.id === id ? { ...previous, [side]: null } : previous)
    return applied
  }, [])
  const cancelRelatedCreate = useCallback((side, id) => setRelatedCreates((previous) => previous[side]?.id === id ? { ...previous, [side]: null } : previous), [])
  current.current = {
    ...current.current,
location,
rightLocation,
leftGuard: guardLeft,
rightGuard: guardRight,
leftRefresh,
rightRefresh,
    confirmOuter,
navigatePane,
rightAllowed: rightAccess?.allowed,
  }
  const leftScope = `${createPath(location)}:${outletContext.pageUIState?.generation}`
  const rightScope = `${rightLocation ? createPath(rightLocation) : ''}:${outletContext.pageUIState?.generation}`
  useEffect(() => {
    const paths = { left: createPath(location), right: rightLocation ? createPath(rightLocation) : '' }
    setRelatedCreates((previous) => {
      let next = previous
      for (const side of ['left', 'right']) {
        const request = previous[side]
        if (!request) continue
        const targetMatches = paths[side].split('?')[0] === request.path
        if (paths[request.sourceSide] !== request.sourcePath || (request.targetReady && !targetMatches)) {
          next = { ...next, [side]: null }
        } else if (targetMatches && !request.targetReady) next = { ...next, [side]: { ...request, targetReady: true } }
      }
      return next
    })
  }, [location, rightLocation, outletContext.pageUIState?.generation, relatedCreates])
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
    if (pending.left && !guardLeft) refreshPane('left')
    if (pending.right && !guardRight) refreshPane('right')
  }, [guardLeft, guardRight, pending, leftRefresh, rightRefresh, refreshPane])
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
    navigateAfterLeaveConfirmation: (to, options) => {
      // A leave dialog can register an overlay guard while its confirmation is pending.
      if (ownsNavigation) current.current.permitted = createPath(resolvePath(to, current.current.location.pathname))
      navigate(to, options)
    },
    confirmLeaveAll: async (options) => {
      const allowed = await confirmAll(options)
      if (allowed) current.current.permitted = '*'
      return allowed
    },
    dragPage: (event, path) => event.dataTransfer.setData(SPLIT_PAGE_DRAG_TYPE, path),
    refresh: (side = 'left') => refreshPane(side, true),
    navigateMenu: (item) => navigatePane('right', resolveBusinessModuleMenuTarget(item, current.current.rightLocation || current.current.location, rightUIState.values, outletContext.visibleMenuPaths)),
  }), [confirmAll, navigatePane, navigate, open, ownsNavigation, refreshPane, rightUIState, outletContext.visibleMenuPaths])
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
  // 确认框解除本栏隔离后再聚焦；收起或切栏时取消这次恢复。
  useLayoutEffect(() => {
    if (!emptyTitleFocusPending.current) return
    if (!open || activeSide !== 'right' || rightLocation) { emptyTitleFocusPending.current = false; return }
    if (!rightVisible || rightOverlayGuard) return
    const input = rightPaneRef.current?.querySelector('.erp-split-page-title input[role="combobox"]')
    if (input && !input.closest('[inert]')) {
      emptyTitleFocusPending.current = false
      input.focus({ preventScroll: true })
    }
  }, [open, activeSide, rightLocation, rightVisible, rightOverlayGuard])
  const paneContext = useMemo(() => ({ handlingNavigation: ownsNavigation, open, visible: leftVisible, active: activeSide === 'left', side: 'left', scope: `${workspaceID.replace(/:/gu, '')}-left`, openRelatedCreate: (request) => openRelatedCreate('left', request), relatedCreate: relatedCreates.left, completeRelatedCreate: (id, record) => completeRelatedCreate('left', id, record), cancelRelatedCreate: (id) => cancelRelatedCreate('left', id) }), [open, ownsNavigation, workspaceID, leftVisible, activeSide, openRelatedCreate, relatedCreates.left, completeRelatedCreate, cancelRelatedCreate])
  const rightPaneContext = useMemo(() => ({ ...paneContext, visible: rightVisible, active: activeSide === 'right', side: 'right', scope: `${workspaceID.replace(/:/gu, '')}-right`, openRelatedCreate: (request) => openRelatedCreate('right', request), relatedCreate: relatedCreates.right, completeRelatedCreate: (id, record) => completeRelatedCreate('right', id, record), cancelRelatedCreate: (id) => cancelRelatedCreate('right', id) }), [paneContext, rightVisible, activeSide, workspaceID, openRelatedCreate, relatedCreates.right, completeRelatedCreate, cancelRelatedCreate])
  const rightActions = useMemo(() => ({
    ...inheritedActions,
    onSplit: open ? null : inheritedActions?.onSplit,
    onRefresh: rightRefresh ? () => refreshPane('right', true) : null,
    refreshing: refreshing.right,
    refreshPending: pending.right && !errors.right,
  }), [inheritedActions, open, rightRefresh, refreshing.right, refreshPane, pending.right, errors.right])
  const leftActions = useMemo(() => open || ownsNavigation ? ({
    ...inheritedActions,
    onSplit: open ? null : inheritedActions?.onSplit,
    onRefresh: leftRefresh ? () => refreshPane('left', true) : null,
    refreshing: refreshing.left,
    refreshPending: pending.left && !errors.left,
  }) : inheritedActions, [inheritedActions, open, ownsNavigation, leftRefresh, refreshing.left, refreshPane, pending.left, errors.left])
  const choices = useMemo(() => groupSidebarNavigationSections(sections, { pageCatalog: true })
    .map((section) => ({ label: section.title, options: section.items.map((item) => ({ value: item.path, label: item.label })) })), [sections])
  const availableChoices = useMemo(() => rightLocation && !rightAccess?.allowed
    ? [...choices.map((group) => ({ ...group, options: group.options.filter((choice) => choice.value !== rightLocation.pathname) })).filter((group) => group.options.length), { label: '不可用页面', options: [{ value: rightLocation.pathname, label: '原页面已不可用', disabled: true }] }]
    : choices, [choices, rightLocation, rightAccess?.allowed])
  const clearRightPage = useCallback(async () => {
    if (guardRight && !(await guardRight())) return
    emptyTitleFocusPending.current = true
    setRightLocation(null)
    setRightGuard(null)
    setRightRefresh(null)
    history.current = { entries: [], index: -1 }
    focusPane('right')
  }, [guardRight, focusPane])
  const leftAccess = useMemo(() => resolvePage(location.pathname), [location.pathname, resolvePage])
  const selectLeftPage = useCallback((path) => { if (path) navigatePane('left', path) }, [navigatePane])
  const selectRightPage = useCallback((path) => { if (path) navigatePane('right', path) }, [navigatePane])
  const changeLeftWidth = useCallback((value) => {
    if (typeof value === 'number' && value >= 32 && value <= 68) setSizes(swapped ? [100 - value, value] : [value, 100 - value])
  }, [swapped])
  const collapseSplit = useCallback(() => { onOpenChange(false); focusPane('left') }, [onOpenChange, focusPane])
  const sharedHeader = useMemo(() => ({ open, width: Math.round(sizes[swapped ? 1 : 0]), defaultWidth: DEFAULT_LEFT_WIDTH, isDefaultWidth: Math.abs(sizes[swapped ? 1 : 0] - DEFAULT_LEFT_WIDTH) < 0.001, onWidthChange: changeLeftWidth, canSwap: Boolean(rightLocation && rightAccess?.allowed), onSwap: swapPanes }), [open, sizes, swapped, changeLeftWidth, rightLocation, rightAccess?.allowed, swapPanes])
  const leftHeader = useMemo(() => ({ ...sharedHeader, label: paneLabel('left'), visible: leftVisible, path: leftAccess.entry?.path || location.pathname, options: choices, onNavigate: selectLeftPage, onClose: narrow ? collapseSplit : null, showLayout: true }), [sharedHeader, paneLabel, leftVisible, leftAccess, location.pathname, choices, selectLeftPage, narrow, collapseSplit])
  const rightHeader = useMemo(() => ({ ...sharedHeader, label: paneLabel('right'), visible: rightVisible, path: rightLocation ? rightAccess?.allowed ? rightAccess.entry.path : rightLocation.pathname : undefined, options: availableChoices, onNavigate: selectRightPage, onClear: rightLocation ? clearRightPage : null, onClose: collapseSplit, showLayout: narrow || !leftAccess.allowed || Boolean(leftAccess.guarded) }), [sharedHeader, paneLabel, rightVisible, rightLocation, rightAccess, availableChoices, selectRightPage, clearRightPage, collapseSplit, narrow, leftAccess])
  const rightTitle = rightLocation ? rightAccess?.entry?.label || '关联页面' : '选择页面'
  const rightNeedsHeader = !rightLocation || !rightAccess?.allowed || Boolean(rightAccess.guarded) || (!rightWorkspace && !rightAccess.selfContainedHeader)
  const dropPage = (side) => (event) => {
    delete event.currentTarget.dataset.dropTarget
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
    return null
  }
  const rightContent = useMemo(() => {
    if (!rightLocation) return <Empty description="点击标题选择页面，或将左侧菜单拖到这里" detail="两栏分别编辑和保存。" />
    return rightAccess?.allowed ? (
      <ERPPageActionsContext.Provider value={rightActions}>
        <RouterNavigationContext.Provider value={rightNavigation}>
          <RouterRouteContext.Provider value={emptyRouteContext}>
            <div className="erp-admin-outlet erp-admin-outlet--module">
              <BusinessModuleTabs workspace={rightWorkspace} cache={rightUIState.values} onNavigate={(to) => navigatePane('right', to)} helpKey={rightAccess.entry?.key} />
              {rightAccess.guarded || (
                <SplitPageBoundary key={`${rightUIState.generation}:${rightLocation.pathname}`} headerTitle={rightWorkspace ? undefined : rightTitle}>
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
  }, [rightLocation, rightAccess, rightActions, rightNavigation, rightUIState, rightWorkspace, rightContext, renderPage, navigatePane, rightTitle])
  const visibleSizes = !open ? [100, 0] : narrow ? activeSide === 'left' ? [100, 0] : [0, 100] : sizes
  const resizePanes = (values) => {
    const total = values[0] + values[1]
    if (open && !narrow && total > 0) {
      const next = values.map((value) => value / total * 100)
      setSizes((previous) => Math.abs(previous[0] - next[0]) < 0.001 ? previous : next)
    }
  }
  const paneEvents = (side) => ({
    onPointerDownCapture: () => focusPane(side),
    onFocusCapture: () => { if (!open || !narrow || focus.current === side) focusPane(side) },
    onDragOver: (event) => {
      if (!event.dataTransfer.types.includes(SPLIT_PAGE_DRAG_TYPE)) return
      event.preventDefault()
      if (open) event.currentTarget.dataset.dropTarget = 'true'
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) delete event.currentTarget.dataset.dropTarget
    },
    onDrop: dropPage(side),
  })
  return (
    <TaskBusinessWorkspaceContext.Provider value={taskWorkspace}>
      <BusinessSplitContext.Provider value={paneContext}>
        {ownsNavigation ? <SplitNavigationGuard current={current} /> : null}
        <div className="erp-split-workspace" data-split-open={open} data-active-pane={activeSide}>
          {open ? (
            <div className="erp-split-switcher">
              <SlidingSegmented block aria-label="选择编辑栏" options={swapped ? [{ value: 'right', label: '左栏' }, { value: 'left', label: '右栏' }] : [{ value: 'left', label: '左栏' }, { value: 'right', label: '右栏' }]} value={activeSide} onChange={focusPane} />
            </div>
        ) : null}
          <ConfigProvider direction={splitterDirection}>
            <Splitter
              className="erp-split-panels"
              style={{ direction: splitterDirection }}
              lazy
              onResize={resizePanes}
              onResizeEnd={resizePanes}
            >
              <Splitter.Panel className="erp-split-panel--left" style={{ direction: contentDirection }} size={`${visibleSizes[0]}%`} min={open && !narrow ? '32%' : 0} max={open && !narrow ? '68%' : '100%'} resizable={open && !narrow}>
                <ConfigProvider direction={contentDirection}>
                  <OverlayScopeProvider enabled={open} visible={leftVisible} containerRef={leftPaneRef} layoutKey={`${swapped}:${sizes[0]}`} scopeKey={leftScope} onInteract={() => focusPane('left')} onGuardChange={registerLeftOverlayGuard}>
                    <BusinessSplitHeaderContext.Provider value={leftHeader}>
                      <ERPPageActionsContext.Provider value={leftActions}>
                        <section ref={leftPaneRef} className="erp-split-pane erp-split-pane--left" data-erp-split-pane={open ? 'left' : undefined} aria-label={open ? `${paneLabel('left')}页面` : undefined} hidden={!leftVisible} {...paneEvents('left')}>
                          {feedback('left')}
                          {children}
                        </section>
                      </ERPPageActionsContext.Provider>
                    </BusinessSplitHeaderContext.Provider>
                  </OverlayScopeProvider>
                </ConfigProvider>
              </Splitter.Panel>
              <Splitter.Panel className="erp-split-panel--right" style={{ direction: contentDirection }} size={`${visibleSizes[1]}%`} min={open && !narrow ? '32%' : 0} max={open && !narrow ? '68%' : '100%'} resizable={open && !narrow}>
                <ConfigProvider direction={contentDirection}>
                  <OverlayScopeProvider enabled={open} visible={rightVisible} containerRef={rightPaneRef} layoutKey={`${swapped}:${sizes[1]}`} scopeKey={rightScope} onInteract={() => focusPane('right')} onGuardChange={registerRightOverlayGuard}>
                    <BusinessSplitHeaderContext.Provider value={rightHeader}>
                      <ERPPageActionsContext.Provider value={rightActions}>
                        <BusinessSplitContext.Provider value={rightPaneContext}>
                          <section ref={rightPaneRef} className="erp-split-pane erp-split-pane--right" data-erp-split-pane={open ? 'right' : undefined} aria-label={`${paneLabel('right')}页面`} hidden={!rightVisible} {...paneEvents('right')}>
                            {rightNeedsHeader ? <SplitPaneHeader title={rightTitle} /> : null}
                            {feedback('right')}
                            {rightContent}
                          </section>
                        </BusinessSplitContext.Provider>
                      </ERPPageActionsContext.Provider>
                    </BusinessSplitHeaderContext.Provider>
                  </OverlayScopeProvider>
                </ConfigProvider>
              </Splitter.Panel>
            </Splitter>
          </ConfigProvider>
        </div>
      </BusinessSplitContext.Provider>
    </TaskBusinessWorkspaceContext.Provider>
  )
}

export default forwardRef(BusinessSplitWorkspace)
