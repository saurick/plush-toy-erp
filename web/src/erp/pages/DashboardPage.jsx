import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Alert, Button, Card, Tag } from 'antd'
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import { businessDocumentTypeOptions } from '../config/businessModules.mjs'
import {
  TaskBoardSearch,
  TaskBoardProgressRail,
  TaskLane,
  getWorkflowTaskStableKey,
} from '../components/workflow/WorkflowDashboardViews.jsx'
import { WORKFLOW_HISTORY_PERIOD_OPTIONS } from '../utils/workflowRoleTaskHistory.mjs'
import FilterDateRangePicker from '../components/business-list/FilterDateRangePicker.jsx'
import { DateRangeFilter } from '../components/business-list/BusinessDateInputs.jsx'
import WorkflowTaskLinkDrawer from '../components/workflow/WorkflowTaskLinkDrawer.jsx'
import WorkflowExactTaskEntry from '../components/workflow/WorkflowExactTaskEntry.jsx'
import WorkflowTaskDiscoveryFilters from '../components/workflow/WorkflowTaskDiscoveryFilters.jsx'
import WorkflowTaskDocumentFilter from '../components/workflow/WorkflowTaskDocumentFilter.jsx'
import WorkflowTaskCalendar from '../components/workflow/WorkflowTaskCalendar.jsx'
import useWorkflowTaskCalendarView from '../hooks/useWorkflowTaskCalendarView.js'
import WorkflowExceptionPanel from '../components/workflow/WorkflowExceptionPanel.jsx'
import { TRACKING_VIEW_OPTIONS } from '../utils/workflowTrackingFilters.mjs'
import useReturnedWorkflowTask from '../hooks/useReturnedWorkflowTask.js'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

import SlidingTabList from '@/common/components/navigation/SlidingTabList'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import WorkflowTaskActionDrawer from '../components/workflow/WorkflowTaskActionDrawer.jsx'
import { TASK_ACTION_META, getWorkflowTaskActionMeta } from '../utils/workflowTaskActionPresentation.mjs'
import WorkflowTaskPagination from '../components/workflow/WorkflowTaskPagination.jsx'
import WorkflowTrackingPanel from '../components/workflow/WorkflowTrackingPanel.jsx'

import { retainWorkflowTaskIdentity } from '../utils/workflowTaskIdentity.mjs'
import {
  BusinessOperationPanel,
  PageHeaderCard,
  SelectFilter,
} from '../components/business-list/BusinessListLayout.jsx'
import {
  blockWorkflowTaskAction,
  completeWorkflowTaskAction,
  reassignWorkflowTask,
  rejectWorkflowTaskAction,
  resumeWorkflowTaskAction,
  urgeWorkflowTask,
} from '../api/workflowApi.mjs'
import useWorkflowTaskActionAccess from '../hooks/useWorkflowTaskActionAccess.js'
import useWorkflowTaskAssignmentAccess from '../hooks/useWorkflowTaskAssignmentAccess.js'
import useWorkflowDashboardData from '../hooks/useWorkflowDashboardData.js'
import {
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import { workflowTaskAdminAccessRequestIdentity } from '../utils/workflowTaskActionAccess.mjs'
import { isTerminalWorkflowTask } from '../utils/workflowTaskLifecycle.mjs'
import { verifyWorkflowTaskActionAccessBeforeSubmit } from '../utils/workflowTaskActionSubmitGuard.mjs'
import { buildDesktopWorkflowTaskActionParams } from '../utils/desktopWorkflowTaskAction.mjs'
import {
  createTaskMutationAttemptStore,
  createTaskMutationInFlightGuard,
  isWorkflowTaskMutationResultUnknown,
  verifyNewWorkflowTaskMutationAttempt,
} from '../utils/workflowTaskMutation.mjs'
import {
  TASK_BOARD_SORT_OPTIONS,
  buildWorkflowTaskBoardRoleOptions,
  buildWorkflowTaskBoardModel,
  buildWorkflowTaskBoardRequest,
  getWorkflowTaskBoardRequestKey,
  getWorkflowTaskBoardStatusOptions,
  getWorkflowTaskBoardDueOptions,
  getWorkflowTaskReason,
  workflowTaskBoardExtraFilterCount,
  normalizeWorkflowTaskPageSize,
  readWorkflowTaskBoardFiltersFromSearch,
  resolveWorkflowTaskBoardResponseState,
  writeWorkflowTaskBoardFiltersToSearch,
} from '../utils/workflowTaskBoard.mjs'
import { canOpenWorkflowTaskEntry } from '../utils/workflowTaskEntryAccess.mjs'
import { workflowTaskEntryNavigation, readWorkflowTaskReturn } from '../utils/workflowTaskNavigation.mjs'
import { hasActionPermission } from '../utils/masterDataOrderView.mjs'
import EngineeringMaterialTaskAction from '../components/sales-orders/EngineeringMaterialTaskAction.jsx'
import EngineeringMaterialTaskSummaryEntry from '../components/sales-orders/EngineeringMaterialTaskSummaryEntry.jsx'
import {
  canProcessEngineeringMaterialTask,
  ENGINEERING_MATERIAL_STATUS,
} from '../utils/engineeringMaterialTask.mjs'
import {
  canViewWorkflowApprovalInbox,
  getWorkflowApprovalInboxCapabilityKeys,
} from '../utils/workflowApprovalInbox.mjs'

const TASK_BOARD_SCOPE_OPTIONS = Object.freeze([
  {
    label: '待我处理',
    value: 'todo',
  },
  {
    label: '待我审批',
    value: 'approval',
  },
  { label: '风险任务', value: 'risk' },
  { label: '全部任务', value: 'all' },
  { label: '流程跟踪', value: 'tracking' },
])

const TASK_BOARD_PAGE_SCROLL_GAP = 12

function scrollTaskListToStart(lanesElement) {
  const scrollContainer = lanesElement?.closest?.('.erp-admin-content')
  if (!scrollContainer) return

  const containerRect = scrollContainer.getBoundingClientRect()
  const lanesRect = lanesElement.getBoundingClientRect()
  const paddingTop =
    Number.parseFloat(window.getComputedStyle(scrollContainer).paddingTop) || 0
  const expectedTop =
    containerRect.top + paddingTop + TASK_BOARD_PAGE_SCROLL_GAP
  const nextScrollTop = scrollContainer.scrollTop + lanesRect.top - expectedTop
  scrollContainer.scrollTo({
    top: Math.max(0, nextScrollTop),
    behavior: 'auto',
  })
}

function buildSourceOptions(values = []) {
  return [
    { value: 'all', label: '全部单据类型' },
    ...businessDocumentTypeOptions(values),
  ]
}

export default function DashboardPage() {
  const taskFocusScopeRef = useRef(null)

  useEffect(() => {
    const scope = taskFocusScopeRef.current
    const { ownerDocument } = scope
    // 抽屉保留焦点返回；标题轮廓只跟随键盘操作，避免鼠标点击后残留。
    const handlePointerDown = () => {
      scope.dataset.taskFocusInput = 'pointer'
    }
    const handleKeyDown = (event) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.key === 'Shift'
      ) {
        return
      }
      delete scope.dataset.taskFocusInput
    }
    ownerDocument.addEventListener('pointerdown', handlePointerDown, true)
    ownerDocument.addEventListener('keydown', handleKeyDown, true)
    return () => {
      ownerDocument.removeEventListener('pointerdown', handlePointerDown, true)
      ownerDocument.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [])

  const [historyDateOpen, setHistoryDateOpen] = useState(false)
  const [taskFiltersOpen, setTaskFiltersOpen] = useState(false)
  const openHistoryDate = () => {
    setTaskFiltersOpen(false)
    setHistoryDateOpen(true)
  }
  const taskViewsRef = useRef(null)
  const [selectedTask, setSelectedTask] = useState(null)
  const [returnedBusinessTask, setReturnedBusinessTask] = useState(null)
  const pendingReturnPosition = useRef(null)
  const [materialSaving, setMaterialSaving] = useState(false)
  const materialLeaveGuardRef = useRef(null)
  const materialDraftRef = useRef(null)
  const [actionMode, setActionMode] = useState('')
  const [actionReason, setActionReason] = useState('')
  const [assignmentTarget, setAssignmentTarget] = useState()
  const [actionReceipt, setActionReceipt] = useState(null)
  const [actionSaving, setActionSaving] = useState(false)
  const selectedTaskRef = useRef(selectedTask)
  selectedTaskRef.current = selectedTask
  const sharedLinkAutoRef = useRef('')
  const [sharedHandlingID, setSharedHandlingID] = useState(null)
  const [taskBoardTransitionMinHeight, setTaskBoardTransitionMinHeight] =
    useState(0)
  const taskBoardLanesRef = useRef(null)
  const pendingTaskBoardPageScrollRef = useRef(null)
  const pendingTaskBoardTransitionRequestKeyRef = useRef('')
  const mutationAttemptsRef = useRef(null)
  mutationAttemptsRef.current ||= createTaskMutationAttemptStore()
  const mutationInFlightRef = useRef(null)
  mutationInFlightRef.current ||= createTaskMutationInFlightGuard()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const calendarState = useWorkflowTaskCalendarView()
  const outletContext = useOutletContext()
  const adminProfile = useMemo(
    () => outletContext?.adminProfile || {},
    [outletContext?.adminProfile]
  )
  const workflowApprovalInboxCapabilityKeys = useMemo(
    () => getWorkflowApprovalInboxCapabilityKeys(adminProfile),
    [adminProfile]
  )
  const canViewApprovalInbox = canViewWorkflowApprovalInbox(adminProfile)
  const canViewRisk = hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_READ) &&
    hasActionPermission(adminProfile, PermissionCode.ERP_WORKBENCH_READ)
  const riskView = canViewRisk && searchParams.get('view') === 'risk'
  const workflowWorkbenchScopeKey = useMemo(
    () =>
      JSON.stringify([
        workflowTaskAdminAccessRequestIdentity(adminProfile),
        workflowApprovalInboxCapabilityKeys,
      ]),
    [adminProfile, workflowApprovalInboxCapabilityKeys]
  )
  useEffect(() => {
    materialDraftRef.current = null
  }, [selectedTask?.id, selectedTask?.version, workflowWorkbenchScopeKey])
  const requestedFilters = useMemo(
    () => readWorkflowTaskBoardFiltersFromSearch(searchParams),
    [searchParams]
  )
  const filters = useMemo(
    () =>
      requestedFilters.mode === 'approval' && !canViewApprovalInbox
        ? { ...requestedFilters, mode: 'all', page: 1 }
        : requestedFilters,
    [canViewApprovalInbox, requestedFilters]
  )
  const exactTask = searchParams.get('task_id')
  const progressOrigin = location.state?.progressOrigin
  const fromProgress = exactTask !== null && Boolean(adminProfile.id) && progressOrigin?.adminID === adminProfile.id
  const calendarView =
    !riskView && filters.mode === 'todo' &&
    calendarState.layout === 'calendar'
  const exceptionsView = searchParams.get('view') === 'exceptions'
  const trackingScope =
    !riskView && ['started', 'participated', 'visible'].includes(
      searchParams.get('tracking')
    )
      ? searchParams.get('tracking')
      : ''
  const [trackingRefresh, setTrackingRefresh] = useState(0)
  const [trackingToolbarContainer, setTrackingToolbarContainer] = useState(null)
  const exceptionQueryRef = useRef(null)
  const taskBoardRequest = useMemo(
    () => buildWorkflowTaskBoardRequest(filters),
    [filters]
  )
  const riskRequest = useMemo(() => riskView ? ({
    queue_key: 'risk',
    ...(['time_asc', 'time_desc'].includes(filters.sort) ? { sort: filters.sort } : {}),
    limit: filters.pageSize,
    offset: (filters.page - 1) * filters.pageSize,
  }) : null, [riskView, filters.page, filters.pageSize, filters.sort])

  const preserveTaskBoardTransitionHeight = useCallback(
    (nextRequest = taskBoardRequest) => {
      pendingTaskBoardTransitionRequestKeyRef.current =
        getWorkflowTaskBoardRequestKey(nextRequest)
      const taskBoardCard = taskBoardLanesRef.current?.closest?.(
        '.erp-dashboard-task-board-card'
      )
      const currentCardHeight = Math.ceil(
        taskBoardCard?.getBoundingClientRect().height || 0
      )
      setTaskBoardTransitionMinHeight(currentCardHeight)
    },
    [taskBoardRequest]
  )

  const {
    loading,
    riskResponseState,
    taskBoardResponseState,
    taskBoardSummaryState,
    taskBoardFilterOptions,
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    riskRequestKey,
    reloadTaskData,
  } = useWorkflowDashboardData({
    scopeKey: workflowWorkbenchScopeKey,
    taskBoardRequest,
    riskRequest,
    suspended: Boolean(trackingScope || exceptionsView),
    onBeforeTaskBoardLoad: preserveTaskBoardTransitionHeight,
  })

  useEffect(() => {
    if (calendarView) return outletContext?.registerPageRefresh?.(null)
    return outletContext?.registerPageRefresh?.(() => {
      if (trackingScope || exceptionsView)
        { setTrackingRefresh((value) => value + 1) }
      return reloadTaskData()
    })
  }, [
    reloadTaskData,
    outletContext,
    trackingScope,
    exceptionsView,
    calendarView,
  ])

  useEffect(() => {
    const deniedRisk = !canViewRisk && searchParams.get('view') === 'risk'
    const deniedApproval = !canViewApprovalInbox && requestedFilters.mode === 'approval'
    const staleDueRange = (searchParams.has('due_date_from') || searchParams.has('due_date_to')) && !filters.dueDateFrom && !filters.dueDateTo
    const retiredFilters = staleDueRange || searchParams.has('module_key') || searchParams.has('chain_key') || searchParams.has('task_group') ||
      (filters.lane === 'finished' && searchParams.has('due'))
    if (!deniedApproval && !retiredFilters && !deniedRisk) return
    const next = writeWorkflowTaskBoardFiltersToSearch(searchParams, filters)
    if (deniedRisk) next.delete('view')
    setSearchParams(next, { replace: true })
  }, [
    canViewApprovalInbox,
    canViewRisk,
    filters,
    requestedFilters.mode,
    searchParams,
    setSearchParams,
  ])

  const activeFilterCount = useMemo(
    () => workflowTaskBoardExtraFilterCount(filters, { calendar: calendarView }),
    [calendarView, filters]
  )
  const taskBoardResponse = useMemo(
    () =>
      resolveWorkflowTaskBoardResponseState(
        riskView ? null : taskBoardResponseState,
        taskBoardRequest
      ),
    [riskView, taskBoardRequest, taskBoardResponseState]
  )
  const taskBoardLoadError =
    taskBoardResponseState?.requestKey === taskBoardRequestKey
      ? taskBoardResponseState.error
      : ''
  const taskBoardSummaryResponse =
    taskBoardSummaryState?.requestKey === taskBoardSummaryRequestKey
      ? taskBoardSummaryState.response
      : null
  const taskBoardModel = useMemo(
    () => buildWorkflowTaskBoardModel(taskBoardResponse, filters),
    [filters, taskBoardResponse]
  )
  const taskBoardReady = Boolean(taskBoardResponse) && !taskBoardLoadError
  const taskBoardHasLoaded = Boolean(taskBoardSummaryState?.response)
  const taskBoardMetricsReady =
    Boolean(taskBoardSummaryResponse) || taskBoardReady
  const taskBoardCounts =
    taskBoardSummaryResponse?.counts || taskBoardModel.counts
  const taskBoardInitialLoading =
    !taskBoardHasLoaded &&
    !taskBoardResponse &&
    !taskBoardLoadError
  const taskBoardUpdating =
    taskBoardHasLoaded &&
    (loading || !taskBoardResponse) &&
    !taskBoardLoadError
  const taskBoardVisibleCount = filters.lane === 'all'
    ? taskBoardSummaryResponse?.total ?? taskBoardModel.total
    : taskBoardCounts[filters.lane] || 0
  const taskLanes = useMemo(
    () =>
      taskBoardModel.visibleLanes.map((lane) => ({
        ...lane,
        count: taskBoardMetricsReady ? taskBoardVisibleCount : lane.count,
      })),
    [taskBoardVisibleCount, taskBoardMetricsReady, taskBoardModel.visibleLanes]
  )
  const sourceOptions = useMemo(
    () =>
      buildSourceOptions([
        ...(taskBoardFilterOptions?.sourceTypes || []),
        filters.sourceType === 'all' ? '' : filters.sourceType,
      ]),
    [filters.sourceType, taskBoardFilterOptions?.sourceTypes]
  )
  const roleOptions = useMemo(
    () => buildWorkflowTaskBoardRoleOptions(taskBoardFilterOptions?.ownerRoleKeys),
    [taskBoardFilterOptions?.ownerRoleKeys]
  )
  const statusOptions = getWorkflowTaskBoardStatusOptions(
    filters.lane,
    filters.mode
  )
  const dueOptions = getWorkflowTaskBoardDueOptions(filters.lane)
  const actionMeta = actionMode
    ? getWorkflowTaskActionMeta(selectedTask, actionMode)
    : null
  useEffect(() => {
    if (
      !taskBoardReady ||
      location.state?.workflowTaskReturn ||
      filters.role === 'all' ||
      roleOptions.some((option) => option.value === filters.role)
    ) {
      return
    }
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        role: 'all',
        page: 1,
      }),
      { replace: true }
    )
  }, [
    filters,
    searchParams,
    setSearchParams,
    roleOptions,
    taskBoardReady,
    location.state,
  ])

  useLayoutEffect(() => {
    const pendingScroll = pendingTaskBoardPageScrollRef.current
    if (
      !pendingTaskBoardTransitionRequestKeyRef.current ||
      pendingTaskBoardTransitionRequestKeyRef.current !== taskBoardRequestKey ||
      loading ||
      !taskBoardReady ||
      taskBoardTransitionMinHeight <= 0
    ) {
      return
    }

    if (pendingScroll) {
      if (
        filters.lane !== pendingScroll.lane ||
        taskBoardModel.page !== pendingScroll.page
      ) {
        return
      }
      scrollTaskListToStart(taskBoardLanesRef.current)
      pendingTaskBoardPageScrollRef.current = null
    }
    pendingTaskBoardTransitionRequestKeyRef.current = ''
    setTaskBoardTransitionMinHeight(0)
  }, [
    filters.lane,
    loading,
    taskBoardModel.page,
    taskBoardReady,
    taskBoardRequestKey,
    taskBoardTransitionMinHeight,
  ])

  useEffect(() => {
    if (!taskBoardLoadError) return
    pendingTaskBoardPageScrollRef.current = null
    pendingTaskBoardTransitionRequestKeyRef.current = ''
    setTaskBoardTransitionMinHeight(0)
  }, [taskBoardLoadError])

  useEffect(() => {
    const returning = readWorkflowTaskReturn(location.state, adminProfile?.id)
    const pending = readWorkflowTaskReturn(window.history.state?.usr, adminProfile?.id)
    if (returning && (pending?.taskID === returning.taskID || returnedBusinessTask?.path === `${location.pathname}${location.search}`)) return
    if (
      !taskBoardResponse ||
      taskBoardModel.requestedPage <= taskBoardModel.pageCount
    ) {
      return
    }
    if (pendingTaskBoardPageScrollRef.current) {
      pendingTaskBoardPageScrollRef.current = {
        ...pendingTaskBoardPageScrollRef.current,
        page: taskBoardModel.pageCount,
      }
      pendingTaskBoardTransitionRequestKeyRef.current =
        getWorkflowTaskBoardRequestKey(
          buildWorkflowTaskBoardRequest({
            ...filters,
            page: taskBoardModel.pageCount,
          })
        )
    }
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        page: taskBoardModel.pageCount,
      }),
      { replace: true }
    )
  }, [
    location,
    adminProfile?.id,
    returnedBusinessTask,
    filters,
    searchParams,
    setSearchParams,
    taskBoardModel.pageCount,
    taskBoardModel.requestedPage,
    taskBoardResponse,
  ])

  const riskResponse = riskView ? riskResponseState?.response : null
  const riskError = riskResponseState?.requestKey === riskRequestKey ? riskResponseState.error : ''
  useEffect(() => {
    if (!riskResponse || riskResponseState.requestKey !== riskRequestKey ||
        riskResponse.offset !== riskRequest.offset || riskResponse.limit !== riskRequest.limit) return
    const lastPage = Math.max(1, Math.ceil(riskResponse.total / riskResponse.limit))
    if (filters.page > lastPage) { setSearchParams(writeWorkflowTaskBoardFiltersToSearch(searchParams, {
      ...filters, page: lastPage,
    }), { replace: true }) }
  }, [riskResponse, riskResponseState, riskRequestKey, riskRequest, filters, searchParams, setSearchParams])

  const riskListRef = useRef(null)
  const pendingRiskPage = useRef(null)
  useLayoutEffect(() => {
    if (!riskView || riskError) pendingRiskPage.current = null
    if (!riskResponse || loading || pendingRiskPage.current !== riskResponse.offset ||
        riskResponse.limit !== riskRequest.limit || riskResponse.offset !== riskRequest.offset) return
    scrollTaskListToStart(riskListRef.current)
    pendingRiskPage.current = null
  }, [riskView, riskError, riskResponse, riskRequest, loading])

  const selectRiskPage = (page, pageSize) => {
    pendingRiskPage.current = (page - 1) * pageSize
    setSearchParams(writeWorkflowTaskBoardFiltersToSearch(searchParams, {
      ...filters, page, pageSize,
    }), { replace: true })
  }

  const actionDrawerAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask),
  })
  useEffect(() => {
    if (
      !sharedHandlingID ||
      selectedTask?.id !== sharedHandlingID ||
      actionDrawerAccess.loading
    )
      { return }
    setSharedHandlingID(null)
    if (
      actionDrawerAccess.source !== 'backend' ||
      !actionDrawerAccess.canHandle
    )
      { setSelectedTask(null) }
  }, [sharedHandlingID, selectedTask?.id, actionDrawerAccess])
  const actionDrawerEntryPath = selectedTask
    ? resolveWorkflowTaskEntryPath(selectedTask)
    : ''
  const actionDrawerCanOpenEntry = canOpenWorkflowTaskEntry(
    adminProfile,
    actionDrawerEntryPath,
    actionDrawerAccess.sourceAccess
  )
  const actionDrawerCanViewAttachments = hasActionPermission(
    adminProfile,
    PermissionCode.WORKFLOW_TASK_READ
  )
  const actionDrawerCanManageAttachments =
    actionDrawerAccess.canHandle &&
    hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_UPDATE)
  const assignmentAccess = useWorkflowTaskAssignmentAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask),
  })
  const actionDrawerAllowedModes = useMemo(
    () =>
      assignmentAccess.can_reassign
        ? [...actionDrawerAccess.allowedModes, 'assign']
        : actionDrawerAccess.allowedModes,
    [actionDrawerAccess.allowedModes, assignmentAccess.can_reassign]
  )

  const updateFilter = (key, value) => {
    const nextFilters = {
      ...filters,
      ...(typeof key === 'object' ? key : { [key]: value }),
      page: 1,
    }
    pendingTaskBoardPageScrollRef.current = null
    if (!riskView) preserveTaskBoardTransitionHeight(buildWorkflowTaskBoardRequest(nextFilters))
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, nextFilters),
      { replace: true }
    )
  }

  const clearFilters = () => {
    pendingTaskBoardPageScrollRef.current = null
    const nextFilters = {
      keyword: filters.keyword,
      lane: filters.lane,
      mode: filters.mode,
      sort: filters.sort,
      pageSize: filters.pageSize,
    }
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest(nextFilters)
    )
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, nextFilters),
      {
        replace: true,
      }
    )
  }

  const selectTaskView = (view, restoreTrackingView = false) => {
    if (taskViewsRef.current?.session !== workflowWorkbenchScopeKey) {
      taskViewsRef.current = {
        session: workflowWorkbenchScopeKey,
        filters: {},
        tracking: 'visible',
        trackingView: 'tracking',
      }
    }
    const views = taskViewsRef.current
    if (trackingScope || exceptionsView) {
      if (trackingScope) views.tracking = trackingScope
      views.trackingView = exceptionsView ? 'exceptions' : 'tracking'
    } else views.filters[riskView ? 'risk' : filters.mode] = filters
    if (view === 'tracking' && restoreTrackingView) view = views.trackingView
    const isTrackingView = view === 'tracking' || view === 'exceptions'
    const next = isTrackingView
      ? new URLSearchParams(searchParams)
      : writeWorkflowTaskBoardFiltersToSearch(
          searchParams,
          views.filters[view] || { mode: view === 'risk' ? 'all' : view }
        )
    if (view === 'exceptions' || view === 'risk') next.set('view', view)
    else next.delete('view')
    if (isTrackingView) next.set('tracking', views.tracking)
    else next.delete('tracking')
    next.delete('track_kind')
    next.delete('track_id')
    setSearchParams(next)
  }

  const selectTrackingScope = (scope) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('tracking', scope)
      next.delete('track_kind')
      next.delete('track_id')
      return next
    })
  }

  const selectTaskBoardLane = (lane) => {
    const nextFilters = {
      ...filters,
      lane,
      sort: 'smart',
      page: 1,
      status: lane === 'all' && isTerminalWorkflowTask({ task_status_key: filters.status })
        ? 'all'
        : filters.status,
    }
    pendingTaskBoardPageScrollRef.current = null
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest(nextFilters)
    )
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, nextFilters),
      { replace: true }
    )
  }

  const selectTaskBoardPage = (page, pageSize = filters.pageSize) => {
    const nextPageSize = normalizeWorkflowTaskPageSize(pageSize)
    const nextPage = nextPageSize !== filters.pageSize ? 1 : Number(page)
    if (
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      (nextPage === taskBoardModel.page && nextPageSize === filters.pageSize)
    ) {
      return
    }
    pendingTaskBoardPageScrollRef.current = {
      lane: filters.lane,
      page: nextPage,
    }
    preserveTaskBoardTransitionHeight(
      buildWorkflowTaskBoardRequest({
        ...filters,
        page: nextPage,
        pageSize: nextPageSize,
      })
    )
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, {
        ...filters,
        page: nextPage,
        pageSize: nextPageSize,
      }),
      { replace: true }
    )
  }

  const openTaskEntry = (task, access) => {
    const entryPath = resolveWorkflowTaskEntryPath(task)
    if (
      canOpenWorkflowTaskEntry(adminProfile, entryPath, access?.sourceAccess)
    ) {
      navigate(
        entryPath,
        workflowTaskEntryNavigation(
          task,
          entryPath,
          `${location.pathname}${location.search}`,
          adminProfile?.id
        )
      )
    }
  }

  const openTaskDrawer = (task, mode = '') => {
    if (actionSaving) return
    const nextMode = TASK_ACTION_META[mode] ? mode : ''
    setSelectedTask(task)
    setActionMode(nextMode)
    setActionReason(nextMode === 'block' ? getWorkflowTaskReason(task) : '')
    setAssignmentTarget(undefined)
    setActionReceipt(null)
  }

  useReturnedWorkflowTask(adminProfile?.id, (task, context) => {
    setReturnedBusinessTask({ task, context, path: `${location.pathname}${location.search}` })
    pendingReturnPosition.current = context?.returnPosition
    openTaskDrawer(task)
  })
  useLayoutEffect(() => {
    const position = pendingReturnPosition.current
    if (!position || loading || !(riskView ? riskResponse : taskBoardReady)) return
    const container = document.querySelector('.erp-admin-content')
    const row = container?.querySelector(`[data-task-id="${returnedBusinessTask?.task.id}"]`)
    if (!container) return
    container.scrollTop = !row || position.rowOffset === null
      ? position.scrollTop
      : container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - position.rowOffset
    pendingReturnPosition.current = null
  }, [loading, riskView, riskResponse, taskBoardReady, taskBoardModel, returnedBusinessTask])

  const leaveSelectedTask = () => {
    setSelectedTask(null)
    setActionMode('')
    setActionReason('')
    setAssignmentTarget(undefined)
    setActionReceipt(null)
    if (fromProgress) {
      const currentIndex = window.history.state?.idx
      const delta = Number.isSafeInteger(currentIndex) && Number.isSafeInteger(progressOrigin.index) && progressOrigin.index < currentIndex
        ? progressOrigin.index - currentIndex : -1
      navigate(delta)
    }
    else if (exactTask !== null) {
      const next = new URLSearchParams(searchParams)
      next.delete('task_id')
      setSearchParams(next, { replace: true })
    }
  }
  const closeTaskDrawer = () => {
    if (actionSaving || materialSaving) return
    if (materialLeaveGuardRef.current) materialLeaveGuardRef.current(leaveSelectedTask)
    else leaveSelectedTask()
  }

  const changeTaskActionMode = (nextMode) => {
    setActionMode(nextMode)
    setAssignmentTarget(undefined)
  }

  const submitTaskAction = async ({ processDecision = null } = {}) => {
    if (!selectedTask || !actionMode || !actionMeta) return

    const taskSnapshot = selectedTask
    const taskIdentity = getWorkflowTaskStableKey(taskSnapshot)
    const actionModeSnapshot = actionMode
    const actionMetaSnapshot = actionMeta
    const actionAccessSnapshot = actionDrawerAccess
    const assignmentAccessSnapshot = assignmentAccess
    const assignmentTargetSnapshot = assignmentTarget
    const reason = actionReason.trim()
    if (actionMetaSnapshot.requireReason && !reason) {
      message.warning(`${actionMetaSnapshot.title}需要填写原因`)
      return
    }
    const scope = `${taskSnapshot.id}:${actionModeSnapshot}`
    const operation = actionModeSnapshot
    const mutate =
      actionModeSnapshot === 'assign'
        ? reassignWorkflowTask
        : actionModeSnapshot === 'urge'
          ? urgeWorkflowTask
          : actionModeSnapshot === 'complete'
            ? completeWorkflowTaskAction
            : actionModeSnapshot === 'block'
              ? blockWorkflowTaskAction
              : actionModeSnapshot === 'reject'
                ? rejectWorkflowTaskAction
                : resumeWorkflowTaskAction
    let params
    try {
      params = buildDesktopWorkflowTaskActionParams({
        task: taskSnapshot,
        actionMode: actionModeSnapshot,
        reason,
        assignmentTarget: assignmentTargetSnapshot,
        processDecision,
      })
    } catch (error) {
      message.warning(
        getActionErrorMessage(
          error,
          '审批表单与当前流程节点不一致，请刷新后重试'
        )
      )
      return
    }
    const inFlightLease = mutationInFlightRef.current.acquire(
      `task:${taskSnapshot.id}`
    )
    if (!inFlightLease) return
    setActionSaving(true)
    const closeSubmittedTaskDrawer = () => {
      if (getWorkflowTaskStableKey(selectedTaskRef.current) !== taskIdentity) {
        return false
      }
      leaveSelectedTask()
      return true
    }
    try {
      const accessVerified = await verifyNewWorkflowTaskMutationAttempt({
        attemptStore: mutationAttemptsRef.current,
        scope,
        operation,
        params,
        verify: async () => {
          if (isTerminalWorkflowTask(taskSnapshot)) {
            message.warning('已结束任务不能继续处理')
            return false
          }
          if (
            actionModeSnapshot === 'assign' &&
            assignmentAccessSnapshot.loading
          ) {
            message.warning('正在确认可转交人员，请稍后再提交')
            return false
          }
          if (actionModeSnapshot === 'assign') {
            const targetAllowed =
              assignmentTargetSnapshot === 'pool'
                ? assignmentAccessSnapshot.can_return_to_pool
                : assignmentAccessSnapshot.candidates.some(
                    (candidate) =>
                      candidate.admin_id === assignmentTargetSnapshot
                  )
            if (
              assignmentAccessSnapshot.failed ||
              assignmentAccessSnapshot.stale ||
              !assignmentAccessSnapshot.can_reassign ||
              !targetAllowed
            ) {
              message.warning(
                assignmentAccessSnapshot.reason || '转交去向已失效，请重新选择'
              )
              return false
            }
            return true
          }
          if (actionAccessSnapshot.loading) {
            message.warning('正在确认这项操作是否可用，请稍后再提交')
            return false
          }
          if (!actionAccessSnapshot.canRun(actionModeSnapshot)) {
            message.warning(actionAccessSnapshot.getReason(actionModeSnapshot))
            return false
          }
          return verifyWorkflowTaskActionAccessBeforeSubmit({
            task: taskSnapshot,
            actionKey: actionModeSnapshot,
            reason,
            onWarning: message.warning,
            onError: message.error,
          })
        },
      })
      if (!accessVerified) return

      try {
        const confirmedTask = await mutationAttemptsRef.current.run({
          scope,
          operation,
          mutate,
          params,
        })
        if (
          getWorkflowTaskStableKey(selectedTaskRef.current) === taskIdentity
        ) {
          setSelectedTask(
            retainWorkflowTaskIdentity(taskSnapshot, confirmedTask)
          )
          setActionReceipt({
            actionMode: actionModeSnapshot,
            actionTitle: actionMetaSnapshot.title,
            reason,
            successMessage: actionMetaSnapshot.successMessage,
          })
        }
      } catch (error) {
        if (isWorkflowTaskMutationResultUnknown(error)) {
          message.warning('提交结果暂未确认，已保留本次操作，可直接重试')
        } else {
          message.error(
            getActionErrorMessage(error, `${actionMetaSnapshot.title}失败`)
          )
          closeSubmittedTaskDrawer()
          await reloadTaskData().catch(() => {})
        }
        return
      }
      message.success(actionMetaSnapshot.successMessage)
      try {
        await reloadTaskData()
      } catch {
        message.warning('操作已成功但列表刷新失败，请手动刷新')
      }
    } finally {
      setActionSaving(false)
      mutationInFlightRef.current.release(inFlightLease)
    }
  }

  return (
    <section ref={taskFocusScopeRef} aria-label="任务管理" className="erp-dashboard-page erp-command-center-page">
      <PageHeaderCard
        compact
        title="任务管理"
        className="erp-task-management-header erp-task-management-scope"
        viewSwitch={
          <SlidingTabList
            className="erp-task-board-scope-filter"
            aria-label="任务范围"
            value={
                  exceptionsView || trackingScope ? 'tracking' : riskView ? 'risk' : filters.mode
                }
            options={TASK_BOARD_SCOPE_OPTIONS.filter(
                  (option) =>
                    (canViewApprovalInbox || option.value !== 'approval') && (canViewRisk || option.value !== 'risk')
                )}
            onChange={(view) => selectTaskView(view, true)}
          />
            }
      />
      <div
        className="erp-dashboard-task-board-card"
        data-page-table-region
        data-table-scroll-scope
        style={
              !riskView && !trackingScope &&
              !exceptionsView &&
              taskBoardTransitionMinHeight > 0
                ? { minHeight: taskBoardTransitionMinHeight }
                : undefined
            }
      >
        {riskView ? (
          <div className="erp-dashboard-block" ref={riskListRef}>
            <div data-page-table-toolbar>
              <BusinessOperationPanel
                compact
                filters={<SelectFilter
                  purpose="sort"
                  emptyValue="smart"
                  aria-label="风险任务排序"
                  value={filters.sort}
                  options={[
                    { value: 'smart', label: '默认排序' },
                    { value: 'time_asc', label: '截止时间从早到晚' },
                    { value: 'time_desc', label: '截止时间从晚到早' },
                  ]}
                  onChange={(sort) => updateFilter('sort', sort)}
                />}
              />
            </div>
            <Card className="erp-business-data-table-card erp-work-center-results">
              {riskError ? <Alert
                type="error"
                showIcon
                message="风险任务加载失败"
                description={riskError}
                action={<Button onClick={reloadTaskData}>重新加载</Button>}
              /> : null}
              <TaskLane
                lane={{ key: 'risk', title: '风险任务', tasks: riskResponse?.items || [] }}
                sort={riskResponse ? riskResponseState.sort : ''}
                onOpenTask={openTaskDrawer}
                loading={loading}
                onSort={(sort) => updateFilter('sort', sort || 'smart')}
              />
              <WorkflowTaskPagination
                total={riskResponse?.total || 0}
                current={riskResponse ? Math.floor(riskResponse.offset / riskResponse.limit) + 1 : filters.page}
                pageSize={riskResponse?.limit || filters.pageSize}
                loading={loading}
                error={Boolean(riskError)}
                onChange={selectRiskPage}
              />
            </Card>
          </div>
            ) : !trackingScope && !exceptionsView && taskBoardInitialLoading ? (
              <Card className="erp-business-data-table-card" loading />
            ) : exceptionsView || trackingScope ? (
              <div className="erp-dashboard-block">
                <Card className="erp-business-operation-panel" data-page-table-toolbar>
                  <div className="erp-task-tracking-toolbar">
                    <div className="erp-business-operation-panel__view-switch">
                      <SlidingTabList
                        className="erp-task-tracking-views"
                        aria-label="跟踪内容"
                        value={exceptionsView ? 'exceptions' : 'tracking'}
                        options={TRACKING_VIEW_OPTIONS}
                        onChange={selectTaskView}
                      />
                    </div>
                    <div className="erp-task-tracking-toolbar__controls" ref={setTrackingToolbarContainer} />
                  </div>
                </Card>
                <Card className="erp-business-data-table-card erp-work-center-results">
                  {trackingToolbarContainer && (exceptionsView ? (
                    <WorkflowExceptionPanel
                      key={workflowWorkbenchScopeKey}
                      toolbarContainer={trackingToolbarContainer}
                      profile={adminProfile}
                      onOpenTask={openTaskDrawer}
                      refreshKey={trackingRefresh}
                      initialQuery={
                        exceptionQueryRef.current?.scope ===
                        workflowWorkbenchScopeKey
                          ? exceptionQueryRef.current.query
                          : {}
                      }
                      onQueryChange={(query) => {
                        exceptionQueryRef.current = {
                          scope: workflowWorkbenchScopeKey,
                          query,
                        }
                      }}
                    />
                  ) : (
                    <WorkflowTrackingPanel
                      key={`${trackingScope}:${workflowWorkbenchScopeKey}`}
                      toolbarContainer={trackingToolbarContainer}
                      scope={trackingScope}
                      onScopeChange={selectTrackingScope}
                      sessionKey={workflowWorkbenchScopeKey}
                      refreshKey={trackingRefresh}
                      onOpenTask={openTaskDrawer}
                      taskHandlingOpen={Boolean(selectedTask)}
                    />
                  ))}
                </Card>
              </div>
            ) : (
              <div className="erp-dashboard-block">
                {historyDateOpen && (
                  <FilterDateRangePicker
                    title="选择处理日期范围"
                    dateFrom={filters.dateFrom}
                    dateTo={filters.dateTo}
                    onCancel={() => {
                      setHistoryDateOpen(false)
                      setTaskFiltersOpen(true)
                    }}
                    onApply={(range) => {
                      updateFilter({ period: 'custom', ...range })
                      setHistoryDateOpen(false)
                    }}
                  />
                )}
                <div className="erp-task-board-controls" data-page-table-toolbar>
                  <div className="erp-task-board-filters">
                    <BusinessOperationPanel
                      key={`${filters.mode}:${workflowWorkbenchScopeKey}`}
                      compact
                      viewSwitch={filters.mode === 'todo' ? (
                        <SlidingTabList
                          aria-label="待办显示方式"
                          value={calendarState.layout}
                          options={[
                            { value: 'list', label: '列表' },
                            { value: 'calendar', label: '日历' },
                          ]}
                          onChange={(layout) => calendarState.change({ layout })}
                        />
                      ) : null}
                      filtersOpen={taskFiltersOpen}
                      onFiltersOpenChange={setTaskFiltersOpen}
                      onClearFilters={clearFilters}
                      activeFilterCount={activeFilterCount}
                      filters={
                        <>
                          {!calendarView && (
                            <TaskBoardProgressRail
                              inline
                              mode={filters.mode}
                              activeLane={filters.lane}
                              counts={taskBoardCounts}
                              ready={taskBoardMetricsReady}
                              onSelectLane={selectTaskBoardLane}
                            />
                          )}
                          <TaskBoardSearch
                            primarySearch
                            value={filters.keyword}
                            onSearch={(keyword) =>
                              updateFilter('keyword', keyword)
                            }
                          />
                          <WorkflowTaskDocumentFilter
                            section={filters.sourceSection}
                            value={filters.sourceType}
                            options={sourceOptions}
                            onChange={updateFilter}
                          />
                          {!calendarView ? (
                            <SelectFilter
                              purpose="sort"
                              emptyValue="smart"
                              aria-label="任务排序"
                              value={filters.sort}
                              options={TASK_BOARD_SORT_OPTIONS}
                              onChange={(value) => updateFilter('sort', value)}
                            />
                          ) : null}
                          <WorkflowTaskDiscoveryFilters
                            value={filters}
                            profile={adminProfile}
                            people={taskBoardFilterOptions?.assignees || []}
                            onChange={(next) => updateFilter(next)}
                          />
                          {roleOptions.length > 1 ? (
                            <SelectFilter
                              aria-label="负责岗位"
                              emptyValue="all"
                              value={filters.role}
                              options={roleOptions}
                              onChange={(value) => updateFilter('role', value)}
                            />
                          ) : null}
                          {calendarView ||
                          filters.lane === 'all' ||
                          filters.lane === 'finished' ? (
                            <SelectFilter
                              aria-label="任务状态"
                              emptyValue="all"
                              value={filters.status}
                              options={statusOptions}
                              onChange={(value) =>
                                updateFilter('status', value)
                              }
                            />
                          ) : null}
                          {filters.lane === 'finished' && (
                            <>
                              <SelectFilter
                                aria-label="处理时间"
                                value={filters.period || ''}
                                options={[
                                  ...WORKFLOW_HISTORY_PERIOD_OPTIONS,
                                  { value: 'custom', label: '自定义日期' },
                                ]}
                                onChange={(period) =>
                                  period === 'custom'
                                    ? openHistoryDate()
                                    : updateFilter({
                                        period,
                                        dateFrom: '',
                                        dateTo: '',
                                      })
                                }
                              />
                              {filters.period === 'custom' && (
                                <Tag
                                  closable
                                  onClose={() =>
                                    updateFilter({
                                      period: '',
                                      dateFrom: '',
                                      dateTo: '',
                                    })
                                  }
                                >
                                  <Button type="link" onClick={openHistoryDate}>
                                    {filters.dateFrom} 至 {filters.dateTo}
                                  </Button>
                                </Tag>
                              )}
                            </>
                          )}
                          {!calendarView && filters.lane !== 'finished' && (
                            <DateRangeFilter
                              options={[{ value: 'due_at', label: '截止时间', upcoming: true }]}
                              startValue={filters.dueDateFrom}
                              endValue={filters.dueDateTo}
                              onRangeChange={(dueDateFrom, dueDateTo) => updateFilter({ due: 'all', dueDateFrom, dueDateTo })}
                              shortcutFilter={{
                                options: dueOptions.filter(({ value }) => value !== 'all'),
                                value: filters.due === 'all' ? '' : filters.due,
                                onChange: (due) => updateFilter({ due, dueDateFrom: '', dueDateTo: '' }),
                              }}
                            />
                          )}
                        </>
                      }

                    />
                  </div>
                </div>
                <Card className="erp-business-data-table-card erp-work-center-results">
                  {calendarView ? (
                    <WorkflowTaskCalendar
                      state={calendarState}
                      query={buildWorkflowTaskBoardRequest({
                        ...filters,
                        lane: 'all',
                        due: 'all',
                        page: 1,
                      }, { calendar: true })}
                      scopeKey={workflowWorkbenchScopeKey}
                      refreshKey={trackingRefresh}
                      onOpenTask={openTaskDrawer}
                    />
                  ) : taskBoardLoadError ? (
                    <Alert
                      type="error"
                      showIcon
                      message="任务管理加载失败"
                      description={taskBoardLoadError}
                      action={
                        <Button onClick={reloadTaskData}>重新加载</Button>
                      }
                    />
                  ) : (
                    <div>
                      <div
                        ref={taskBoardLanesRef}
                        className="erp-task-board-lanes erp-task-board-lanes--focused"
                        aria-label="任务管理分类"
                        aria-busy={taskBoardUpdating}
                      >
                        {taskLanes.map((lane) => (
                          <TaskLane
                            key={lane.key}
                            keyword={filters.keyword}
                            lane={lane}
                            sort={filters.sort}
                            onSort={(sort) => updateFilter('sort', sort || 'smart')}
                            loading={taskBoardUpdating}
                            onOpenTask={openTaskDrawer}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {!calendarView ? (
                    <WorkflowTaskPagination
                      total={taskBoardVisibleCount}
                      current={
                        taskBoardReady ? taskBoardModel.page : filters.page
                      }
                      pageSize={filters.pageSize}
                      loading={taskBoardUpdating}
                      error={Boolean(taskBoardLoadError)}
                      onChange={selectTaskBoardPage}
                    />
                  ) : null}
                </Card>
              </div>
            )}
      </div>

      <WorkflowTaskLinkDrawer
        profile={adminProfile}
        taskOpen={Boolean(selectedTask)}
        autoOpenRef={sharedLinkAutoRef}
        onOpenTask={(task, handle) => {
          setSharedHandlingID(handle ? task.id : null)
          openTaskDrawer(task)
        }}
      />
      {exactTask !== null && adminProfile.id && !readWorkflowTaskReturn(location.state, adminProfile.id) && (
        <WorkflowExactTaskEntry
          key={`${adminProfile.id}:${workflowWorkbenchScopeKey}:${exactTask}`}
          value={exactTask}
          profile={adminProfile}
          onClose={closeTaskDrawer}
          onOpen={openTaskDrawer}
        />
      )}
      <WorkflowTaskActionDrawer
        startHandling={sharedHandlingID === selectedTask?.id}
        closeLabel={
          fromProgress ? '返回进度看板' : exceptionsView
            ? exceptionQueryRef.current?.query?.view === 'tasks'
              ? '返回关联待办'
              : '返回异常跟踪'
            : '返回列表'
        }
        onOpenRelatedTask={openTaskDrawer}
        task={selectedTask}
        onTaskRead={(fresh) => { setSelectedTask(fresh); reloadTaskData() }}
        profile={adminProfile}
        sourceSummary={
          <EngineeringMaterialTaskSummaryEntry
            key={selectedTask?.id}
            task={selectedTask}
            profile={adminProfile}
          />
        }
        renderSourceAction={
          !actionMode &&
          canProcessEngineeringMaterialTask(adminProfile, selectedTask)
            ? (render) => (
              <EngineeringMaterialTaskAction
                task={selectedTask}
                profile={adminProfile}
                render={render}
                leaveGuardRef={materialLeaveGuardRef}
                draftRef={materialDraftRef}
                onBusyChange={setMaterialSaving}
                onChanged={(value, result) => {
                    setActionReceipt({
                      successMessage: result.successMessage,
                      actionTitle:
                        result.action === 'REJECT'
                          ? '退回工程'
                          : '审批通过',
                      reason: result.reason,
                      statusLabel: ENGINEERING_MATERIAL_STATUS[value.status],
                      handoffMessage: result.successMessage,
                    })
                    reloadTaskData()
                  }}
              />
              )
            : null
        }
        actionReceipt={actionReceipt}
        actionMode={actionMode}
        actionReason={actionReason}
        actionSaving={actionSaving || materialSaving}
        actionAvailabilityLoading={actionDrawerAccess.loading}
        allowedActionModes={actionDrawerAllowedModes}
        readonlyReason={actionDrawerAccess.readonlyReason}
        assignmentAccess={assignmentAccess}
        assignmentTarget={assignmentTarget}
        canOpenEntry={actionDrawerCanOpenEntry}
        canViewAttachments={actionDrawerCanViewAttachments}
        canManageAttachments={actionDrawerCanManageAttachments}
        onActionModeChange={changeTaskActionMode}
        onActionReasonChange={setActionReason}
        onAssignmentTargetChange={setAssignmentTarget}
        onClose={closeTaskDrawer}
        onReturnToTracking={
          trackingScope && searchParams.has('track_id')
            ? closeTaskDrawer
            : undefined
        }
        onOpenEntry={(task) => openTaskEntry(task, actionDrawerAccess)}
        onSubmit={submitTaskAction}
      />
    </section>
  )
}
