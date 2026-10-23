import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { CalendarOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Space, Tag, Typography } from 'antd'
import {
  useLocation,
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import {
  TaskBoardSearch,
  TaskBoardProgressRail,
  ProductCoreDashboard,
  TaskTitleEntry,
  TaskLane,
  WorkbenchQueueEmpty,
  getWorkflowTaskStableKey,
  openTaskTableRow,
} from '../components/workflow/WorkflowDashboardViews.jsx'
import { WORKFLOW_HISTORY_PERIOD_OPTIONS } from '../utils/workflowRoleTaskHistory.mjs'
import FilterDateRangePicker from '../components/business-list/FilterDateRangePicker.jsx'
import WorkflowTaskLinkDrawer from '../components/workflow/WorkflowTaskLinkDrawer.jsx'
import WorkflowTaskDiscoveryFilters from '../components/workflow/WorkflowTaskDiscoveryFilters.jsx'
import WorkflowTaskCalendar from '../components/workflow/WorkflowTaskCalendar.jsx'
import useWorkflowTaskCalendarView from '../hooks/useWorkflowTaskCalendarView.js'
import useBusinessListStickyHeader from '../components/business-list/useBusinessListStickyHeader.js'
import WorkflowExceptionPanel from '../components/workflow/WorkflowExceptionPanel.jsx'
import { TRACKING_VIEW_OPTIONS } from '../utils/workflowTrackingFilters.mjs'
import { retainReturnedWorkflowTask } from '../utils/productionTaskHandling.mjs'
import useReturnedWorkflowTask from '../hooks/useReturnedWorkflowTask.js'
import { PermissionCode } from '../../common/consts/permissions.generated.mjs'

import { getWorkbenchSummaryOptions } from '../utils/workbenchSummary.mjs'
import Table from '@/common/components/table/AppTable'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'

import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import WorkflowTaskActionDrawer, {
  TASK_ACTION_META,
  getWorkflowTaskActionMeta,
} from '../components/workflow/WorkflowTaskActionDrawer.jsx'
import WorkflowTaskIdentity from '../components/workflow/WorkflowTaskIdentity.jsx'
import { WorkflowTaskSource } from '../components/workflow/WorkflowTaskCopy.jsx'
import WorkflowTaskTiming from '../components/workflow/WorkflowTaskTiming.jsx'
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
  getWorkflowTaskSourceTypeLabel,
  resolveWorkflowTaskEntryPath,
} from '../utils/dashboardTaskDisplay.mjs'
import { getWorkflowWorkbenchScopeKey } from '../utils/workflowDashboardStats.mjs'
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
  TASK_BOARD_FOCUS_PAGE_SIZE,
  TASK_BOARD_SORT_OPTIONS,
  buildWorkflowTaskBoardRoleOptions,
  buildWorkflowTaskBoardModel,
  buildWorkflowTaskOverviewTasks,
  buildWorkflowTaskBoardRequest,
  getWorkflowTaskBoardRequestKey,
  getWorkflowTaskBoardStatusOptions,
  getWorkflowTaskBoardDueOptions,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskReasonMeta,
  getWorkflowTaskReadonlyReason,
  getWorkflowTaskStatusRiskTags,
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

const { Text } = Typography

const WORKBENCH_QUEUE_OPTIONS = Object.freeze([
  { key: 'actionable', label: '待我处理', hint: '当前可推进' },
  {
    key: 'approval',
    label: '待我审批',
    hint: '当前审批事项',
    requiresApproval: true,
  },
  { key: 'risk', label: '阻塞/逾期', hint: '先补原因' },
])

const TASK_BOARD_SCOPE_OPTIONS = Object.freeze([
  {
    label: '待我处理',
    value: 'todo',
  },
  {
    label: '待我审批',
    value: 'approval',
  },
  { label: '全部任务', value: 'all' },
  { label: '流程跟踪', value: 'tracking' },
])

const WORKBENCH_QUEUE_PAGE_SIZE = TASK_BOARD_FOCUS_PAGE_SIZE
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
  const sourceTypes = [
    ...new Set(
      (values || [])
        .map((sourceType) => String(sourceType || '').trim())
        .filter(Boolean)
    ),
  ].sort((left, right) => left.localeCompare(right))

  return [
    { value: 'all', label: '全部业务' },
    ...sourceTypes.map((sourceType) => ({
      value: sourceType,
      label: getWorkflowTaskSourceTypeLabel(sourceType),
    })),
  ]
}

const WorkbenchSummaries = lazy(
  () => import('../components/workbench/WorkbenchSummaries.jsx')
)

export default function DashboardPage({ initialView = 'workbench' }) {
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
  const [summaryRefreshRevision, setSummaryRefreshRevision] = useState(0)
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
  const activeView = initialView
  const [workbenchQueueKey, setWorkbenchQueueKey] = useState('actionable')
  const [workbenchQueuePage, setWorkbenchQueuePage] = useState(1)
  const [workbenchQueuePageSize, setWorkbenchQueuePageSize] = useState(
    WORKBENCH_QUEUE_PAGE_SIZE
  )
  const [taskBoardTransitionMinHeight, setTaskBoardTransitionMinHeight] =
    useState(0)
  const taskBoardLanesRef = useRef(null)
  const workbenchListRef = useRef(null)
  const pendingWorkbenchPageScrollRef = useRef(null)
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
  const effectiveSessionCustomerKey =
    typeof adminProfile?.effective_session?.customer?.key === 'string'
      ? adminProfile.effective_session.customer.key.trim()
      : ''
  const shouldShowProductCoreDashboard =
    initialView === 'workbench' &&
    adminProfile?.is_super_admin === true &&
    !effectiveSessionCustomerKey
  const summaryOptions = getWorkbenchSummaryOptions(adminProfile)
  const summaryOpen =
    initialView === 'workbench' &&
    !shouldShowProductCoreDashboard &&
    summaryOptions.length > 0 &&
    searchParams.get('view') === 'summary'
  const workbenchSticky = useBusinessListStickyHeader(
    workbenchListRef,
    initialView === 'workbench' && !summaryOpen && !shouldShowProductCoreDashboard,
  )
  const workflowWorkbenchScopeKey = useMemo(
    () =>
      JSON.stringify([
        getWorkflowWorkbenchScopeKey(adminProfile),
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
  const isTaskBoardView = initialView === 'task-board'
  const calendarView =
    isTaskBoardView &&
    filters.mode === 'todo' &&
    calendarState.layout === 'calendar'
  const exceptionsView =
    isTaskBoardView && searchParams.get('view') === 'exceptions'
  const trackingScope =
    isTaskBoardView &&
    ['started', 'participated', 'visible'].includes(
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
  const workbenchRequest = useMemo(
    () => ({
      queue_key: workbenchQueueKey,
      limit: workbenchQueuePageSize,
      offset: (workbenchQueuePage - 1) * workbenchQueuePageSize,
    }),
    [workbenchQueueKey, workbenchQueuePage, workbenchQueuePageSize]
  )
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
    workbenchResponseState,
    workbenchCountsState,
    taskBoardResponseState,
    taskBoardSummaryState,
    taskBoardRequestKey,
    taskBoardSummaryRequestKey,
    workbenchRequestKey,
    reloadTaskData,
  } = useWorkflowDashboardData({
    scopeKey: workflowWorkbenchScopeKey,
    taskBoardRequest,
    workbenchRequest,
    isTaskBoardView,
    productCorePreview: shouldShowProductCoreDashboard,
    suspended: Boolean(summaryOpen || trackingScope || exceptionsView),
    onBeforeTaskBoardLoad: preserveTaskBoardTransitionHeight,
  })

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(() => {
      if (summaryOpen) setSummaryRefreshRevision((value) => value + 1)
      if (trackingScope || exceptionsView || calendarView)
        { setTrackingRefresh((value) => value + 1) }
      return reloadTaskData()
    })
  }, [
    reloadTaskData,
    outletContext,
    summaryOpen,
    trackingScope,
    exceptionsView,
    calendarView,
  ])

  useEffect(() => {
    const deniedApproval = !canViewApprovalInbox && requestedFilters.mode === 'approval'
    const retiredFilters = searchParams.has('module_key') || searchParams.has('chain_key') ||
      (filters.lane === 'finished' && searchParams.has('due'))
    if (!isTaskBoardView || (!deniedApproval && !retiredFilters)) return
    setSearchParams(
      writeWorkflowTaskBoardFiltersToSearch(searchParams, filters),
      { replace: true }
    )
  }, [
    canViewApprovalInbox,
    filters,
    isTaskBoardView,
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
        taskBoardResponseState,
        taskBoardRequest
      ),
    [taskBoardRequest, taskBoardResponseState]
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
    isTaskBoardView &&
    !taskBoardHasLoaded &&
    !taskBoardResponse &&
    !taskBoardLoadError
  const taskBoardUpdating =
    isTaskBoardView &&
    taskBoardHasLoaded &&
    !taskBoardResponse &&
    !taskBoardLoadError
  const taskLanes = useMemo(
    () =>
      taskBoardModel.visibleLanes.map((lane) => ({
        ...lane,
        count: taskBoardMetricsReady ? taskBoardCounts[lane.key] : lane.count,
      })),
    [taskBoardCounts, taskBoardMetricsReady, taskBoardModel.visibleLanes]
  )
  const overviewTasks = useMemo(
    () => buildWorkflowTaskOverviewTasks(taskLanes),
    [taskLanes]
  )
  const sourceOptions = useMemo(
    () =>
      buildSourceOptions([
        ...(taskBoardSummaryResponse?.source_types ||
          taskBoardModel.sourceTypes),
        filters.sourceType === 'all' ? '' : filters.sourceType,
      ]),
    [
      filters.sourceType,
      taskBoardModel.sourceTypes,
      taskBoardSummaryResponse?.source_types,
    ]
  )
  const roleOptions = useMemo(
    () =>
      buildWorkflowTaskBoardRoleOptions(
        taskBoardSummaryResponse?.owner_role_keys ||
          taskBoardModel.ownerRoleKeys
      ),
    [taskBoardModel.ownerRoleKeys, taskBoardSummaryResponse?.owner_role_keys]
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
      taskBoardModel.ownerRoleKeys.includes(filters.role)
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
    taskBoardModel.ownerRoleKeys,
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
        !taskBoardModel.focused ||
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
    taskBoardModel.focused,
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
      !taskBoardModel.focused ||
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
    taskBoardModel.focused,
    taskBoardModel.pageCount,
    taskBoardModel.requestedPage,
    taskBoardResponse,
  ])

  const workbenchResponse =
    workbenchResponseState?.scopeKey === workflowWorkbenchScopeKey &&
    workbenchResponseState?.response?.queue_key === workbenchQueueKey
      ? workbenchResponseState.response
      : null
  const workbenchLoadError =
    workbenchResponseState?.scopeKey === workflowWorkbenchScopeKey &&
    workbenchResponseState?.requestKey === workbenchRequestKey
      ? workbenchResponseState.error
      : ''
  const workbenchCounts =
    workbenchCountsState?.scopeKey === workflowWorkbenchScopeKey
      ? workbenchCountsState.counts
      : null
  const visibleWorkbenchQueueOptions = useMemo(
    () =>
      WORKBENCH_QUEUE_OPTIONS.filter(
        (option) => !option.requiresApproval || canViewApprovalInbox
      ),
    [canViewApprovalInbox]
  )
  const workbenchQueueTotal = Number(workbenchCounts?.[workbenchQueueKey] || 0)
  const activeWorkbenchQueueOption =
    visibleWorkbenchQueueOptions.find(
      (option) => option.key === workbenchQueueKey
    ) || visibleWorkbenchQueueOptions[0]
  const fallbackWorkbenchQueueOption =
    visibleWorkbenchQueueOptions.find(
      (option) =>
        option.key !== workbenchQueueKey &&
        Number(workbenchCounts?.[option.key] || 0) > 0
    ) || null
  const workbenchQueuePageCount = Math.max(
    1,
    Math.ceil(workbenchQueueTotal / workbenchQueuePageSize)
  )
  const displayedWorkbenchQueuePageSize = workbenchResponse?.limit || workbenchQueuePageSize
  const activeWorkbenchQueuePage = workbenchResponse
    ? Math.floor(workbenchResponse.offset / displayedWorkbenchQueuePageSize) + 1
    : Math.min(workbenchQueuePage, workbenchQueuePageCount)
  const workbenchQueuePageTasks = useMemo(
    () => workbenchResponse?.items || [],
    [workbenchResponse]
  )
  useLayoutEffect(() => {
    const pending = pendingWorkbenchPageScrollRef.current
    if (!pending || loading || !workbenchResponse || workbenchLoadError) return
    if (
      pending.queue !== workbenchQueueKey ||
      pending.page !== workbenchQueuePage ||
      pending.pageSize !== workbenchQueuePageSize ||
      workbenchResponse.offset !== workbenchRequest.offset ||
      workbenchResponse.limit !== workbenchRequest.limit
    ) {
      return
    }
    scrollTaskListToStart(workbenchListRef.current)
    pendingWorkbenchPageScrollRef.current = null
  }, [
    loading,
    workbenchLoadError,
    workbenchQueueKey,
    workbenchQueuePage,
    workbenchQueuePageSize,
    workbenchRequest,
    workbenchResponse,
  ])
  useEffect(() => {
    if (
      !workbenchResponse ||
      workbenchResponse.offset !== workbenchRequest.offset ||
      workbenchResponse.limit !== workbenchRequest.limit ||
      workbenchQueuePage <= workbenchQueuePageCount
    ) {
      return
    }
    if (pendingWorkbenchPageScrollRef.current) {
      pendingWorkbenchPageScrollRef.current.page = workbenchQueuePageCount
    }
    setWorkbenchQueuePage(workbenchQueuePageCount)
  }, [workbenchQueuePage, workbenchQueuePageCount, workbenchRequest, workbenchResponse])
  const actionDrawerAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(selectedTask),
  })
  useEffect(() => {
    if (
      !sharedHandlingID ||
      selectedTask?.id !== sharedHandlingID ||
      actionDrawerAccess.loading ||
      actionDrawerAccess.source === 'fallback_checking'
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

  useEffect(() => {
    if (
      visibleWorkbenchQueueOptions.some(
        (option) => option.key === workbenchQueueKey
      )
    ) {
      return
    }
    setWorkbenchQueueKey('actionable')
    setWorkbenchQueuePage(1)
  }, [visibleWorkbenchQueueOptions, workbenchQueueKey])

  const updateFilter = (key, value) => {
    const nextFilters = {
      ...filters,
      ...(typeof key === 'object' ? key : { [key]: value }),
      page: 1,
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
    } else views.filters[filters.mode] = filters
    if (view === 'tracking' && restoreTrackingView) view = views.trackingView
    const isTrackingView = view === 'tracking' || view === 'exceptions'
    const next = isTrackingView
      ? new URLSearchParams(searchParams)
      : writeWorkflowTaskBoardFiltersToSearch(
          searchParams,
          views.filters[view] || { mode: view }
        )
    if (view === 'exceptions') next.set('view', 'exceptions')
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
      !taskBoardModel.focused ||
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

  const openProductCoreEntry = useCallback(
    (path) => {
      if (path) {
        navigate(path)
      }
    },
    [navigate]
  )

  const getTaskReadonlyNotice = useCallback(
    (task) => getWorkflowTaskReadonlyReason(adminProfile, task),
    [adminProfile]
  )

  const selectWorkbenchQueue = useCallback((queueKey) => {
    pendingWorkbenchPageScrollRef.current = null
    setWorkbenchQueueKey(queueKey)
    setWorkbenchQueuePage(1)
  }, [])

  const selectWorkbenchQueuePage = (
    page,
    pageSize = displayedWorkbenchQueuePageSize
  ) => {
    const nextPageSize = normalizeWorkflowTaskPageSize(pageSize)
    if (nextPageSize !== displayedWorkbenchQueuePageSize) page = 1
    pendingWorkbenchPageScrollRef.current = {
      queue: workbenchQueueKey,
      page,
      pageSize: nextPageSize,
    }
    setWorkbenchQueuePage(page)
    setWorkbenchQueuePageSize(nextPageSize)
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
  const retainedBusinessTask = returnedBusinessTask?.path === `${location.pathname}${location.search}`
    ? returnedBusinessTask : null
  useLayoutEffect(() => {
    const position = pendingReturnPosition.current
    if (!position || loading || !taskBoardReady) return
    const container = document.querySelector('.erp-admin-content')
    const row = container?.querySelector(`[data-task-id="${returnedBusinessTask?.task.id}"]`)
    if (!container || !row) return
    container.scrollTop = position.rowOffset === null
      ? position.scrollTop
      : container.scrollTop + row.getBoundingClientRect().top - container.getBoundingClientRect().top - position.rowOffset
    pendingReturnPosition.current = null
  }, [loading, taskBoardReady, taskBoardModel, returnedBusinessTask])

  const closeTaskDrawer = () => {
    if (actionSaving || materialSaving) return
    if (materialLeaveGuardRef.current) {
      materialLeaveGuardRef.current(() => setSelectedTask(null))
      return
    }
    setSelectedTask(null)
    setActionMode('')
    setActionReason('')
    setAssignmentTarget(undefined)
    setActionReceipt(null)
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
      setSelectedTask(null)
      setActionMode('')
      setActionReason('')
      setAssignmentTarget(undefined)
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
            message.warning(
              actionAccessSnapshot.getReason(actionModeSnapshot) ||
                getWorkflowTaskReadonlyReason(adminProfile, taskSnapshot)
            )
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

  const workbenchTaskColumns = [
    {
      align: 'left',
      title: '任务与关联内容',
      dataIndex: 'task_name',
      render: (_, record) => (
        <div className="erp-workbench-task-cell">
          <WorkflowTaskIdentity
            task={record}
            compact
            layout="table"
            showTaskName
            renderCompactTitle={() => (
              <TaskTitleEntry task={record} onOpenTask={openTaskDrawer} compact />
            )}
          />
          <Text type="secondary">
            <WorkflowTaskSource task={record} showUnavailable={false} />
          </Text>
          {getWorkflowTaskReason(record) ? (
            <Text
              type={
                record.task_status_key === 'blocked' ? 'danger' : 'secondary'
              }
            >
              {getWorkflowTaskReasonMeta(record).label}：
              {getWorkflowTaskReason(record)}
            </Text>
          ) : null}
        </div>
      ),
    },
    {
      align: 'left',
      title: '状态 / 风险',
      key: 'task_priority',
      width: 132,
      render: (_, record) => {
        return (
          <Space
            className="erp-workbench-task-status-risk"
            size={[4, 4]}
            style={{ width: '100%' }}
            wrap
          >
            {getWorkflowTaskStatusRiskTags(record).map((tag) => (
              <Tag
                key={tag.key}
                color={tag.color}
                style={{ marginInlineEnd: 0 }}
              >
                {tag.label}
              </Tag>
            ))}
          </Space>
        )
      },
    },
    {
      title: '负责',
      key: 'owner_role',
      width: 90,
      render: (_, record) => getWorkflowTaskOwnerRoleLabel(record),
    },
    {
      align: 'left',
      title: '任务时间',
      key: 'timing',
      width: 210,
      render: (_, record) => <WorkflowTaskTiming task={record} />,
    },
  ]

  return (
    <section
      ref={taskFocusScopeRef}
      aria-label={activeView === 'task-board' ? '任务管理' : '工作台'}
      className="erp-dashboard-page erp-command-center-page"
    >
      <div
        hidden
        aria-hidden="true"
        data-testid="dashboard-workflow-task-evidence"
      >
        {workbenchQueuePageTasks.map((task) => (
          <span
            key={task.id || task.task_code}
            data-task-code={task.task_code || undefined}
            data-task-group={task.task_group || undefined}
            data-task-terminal={String(isTerminalWorkflowTask(task))}
          />
        ))}
      </div>
      {shouldShowProductCoreDashboard ? (
        <>
          <PageHeaderCard compact title="工作台" />
          <ProductCoreDashboard onNavigate={openProductCoreEntry} />
        </>
      ) : null}

      {!shouldShowProductCoreDashboard && activeView === 'workbench' ? (
        <div className="erp-workbench-layout">
          <PageHeaderCard
            compact
            title="工作台"
            viewSwitch={
              summaryOptions.length > 0 ? (
                <SlidingTabList
                  aria-label="工作台视图"
                  value={summaryOpen ? 'summary' : 'tasks'}
                  options={[
                    { value: 'tasks', label: '待办' },
                    { value: 'summary', label: '业务汇总' },
                  ]}
                  onChange={(value) => {
                    const next = new URLSearchParams(searchParams)
                    if (value === 'summary') next.set('view', 'summary')
                    else next.delete('view')
                    setSearchParams(next, { replace: true })
                  }}
                />
              ) : null
            }
          />
          <Card
            className="erp-dashboard-card erp-workbench-command-card"
            data-page-table-region
            data-table-scroll-scope
            variant="borderless"
          >
            <div className="erp-workbench-command">
              {summaryOpen ? (
                <Suspense fallback={<div role="status">正在加载汇总…</div>}>
                  <WorkbenchSummaries
                    options={summaryOptions}
                    refreshRevision={summaryRefreshRevision}
                  />
                </Suspense>
              ) : (
                <>
                  <div className="erp-workbench-queue-heading" data-page-table-toolbar>
                    <div
                      className="erp-workbench-queue-filter-strip"
                      aria-label="工作台任务筛选"
                    >
                      {visibleWorkbenchQueueOptions.map((option) => {
                        const count = workbenchCounts?.[option.key]
                        const countReady = Number.isSafeInteger(count)
                        const active = option.key === workbenchQueueKey
                        return (
                          <button
                            key={option.key}
                            type="button"
                            className={[
                              'erp-workbench-queue-filter',
                              active
                                ? 'erp-workbench-queue-filter--active'
                                : '',
                              option.key === 'risk' && countReady && count > 0
                                ? 'erp-workbench-queue-filter--danger'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            aria-pressed={active}
                            aria-label={
                              countReady
                                ? `${option.label}，${count} 项，${option.hint}`
                                : `${option.label}，数量读取中，${option.hint}`
                            }
                            onClick={() => selectWorkbenchQueue(option.key)}
                          >
                            <span>{option.label}</span>
                            <strong>{countReady ? count : '—'}</strong>
                          </button>
                        )
                      })}
                    </div>
                    <Button
                      type="text"
                      aria-label="待办日历"
                      icon={<CalendarOutlined aria-hidden />}
                      onClick={() =>
                        navigate('/erp/task-board?mode=todo&layout=calendar')
                      }
                    >
                      待办日历
                    </Button>
                    <span data-table-scroll-toolbar />
                  </div>

                  <div className="erp-workbench-main-grid">
                    <section
                      ref={workbenchListRef}
                      className="erp-workbench-panel erp-workbench-queue-panel"
                      aria-label="优先处理"
                      aria-busy={loading}
                    >
                      {workbenchLoadError ? (
                        <Alert
                          type="error"
                          showIcon
                          message="工作台任务加载失败"
                          description={workbenchLoadError}
                          action={
                            <Button size="small" onClick={reloadTaskData}>
                              重新加载
                            </Button>
                          }
                        />
                      ) : null}
                      <Table
                        className="erp-work-center-table"
                        sticky={workbenchSticky}
                        scrollToolbar
                        size="small"
                        rowKey={(record) => record.id || record.task_code}
                        columns={workbenchTaskColumns}
                        dataSource={workbenchQueuePageTasks}
                        loading={{ spinning: loading, delay: 120 }}
                        pagination={false}
                        scroll={{ x: 680 }}
                        rowClassName="erp-task-table-row"
                        onRow={(record) => ({
                          'data-task-id': record.id,
                          'data-task-code': record.task_code || undefined,
                          'data-task-group': record.task_group || undefined,
                          onClick: (event) =>
                            openTaskTableRow(event, record, openTaskDrawer),
                        })}
                        locale={{
                          emptyText: (
                            <WorkbenchQueueEmpty
                              activeOption={activeWorkbenchQueueOption}
                              fallbackOption={fallbackWorkbenchQueueOption}
                              onSwitchQueue={selectWorkbenchQueue}
                            />
                          ),
                        }}
                      />
                    </section>
                  </div>
                  {workbenchCounts ? (
                    <WorkflowTaskPagination
                      total={workbenchQueueTotal}
                      current={activeWorkbenchQueuePage}
                      pageSize={displayedWorkbenchQueuePageSize}
                      loading={loading}
                      error={Boolean(workbenchLoadError)}
                      onChange={selectWorkbenchQueuePage}
                    />
                  ) : null}
                </>
              )}
            </div>
          </Card>
        </div>
      ) : null}

      {activeView === 'task-board' ? (
        <>
          <PageHeaderCard
            compact
            title="任务管理"
            className="erp-task-management-header erp-task-management-scope"
            viewSwitch={
              <SlidingTabList
                className="erp-task-board-scope-filter"
                aria-label="任务范围"
                value={
                  exceptionsView || trackingScope ? 'tracking' : filters.mode
                }
                options={TASK_BOARD_SCOPE_OPTIONS.filter(
                  (option) =>
                    canViewApprovalInbox || option.value !== 'approval'
                )}
                onChange={(view) => selectTaskView(view, true)}
              />
            }
          />
          <Card
            className="erp-dashboard-card erp-dashboard-task-board-card"
            data-page-table-region
            data-table-scroll-scope
            variant="borderless"
            loading={
              !trackingScope && !exceptionsView && taskBoardInitialLoading
            }
            style={
              !trackingScope &&
              !exceptionsView &&
              taskBoardTransitionMinHeight > 0
                ? { minHeight: taskBoardTransitionMinHeight }
                : undefined
            }
          >
            {exceptionsView || trackingScope ? (
              <div className="erp-dashboard-block">
                <div className="erp-task-tracking-toolbar" data-page-table-toolbar>
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
                        <Segmented
                          aria-label="待办显示方式"
                          hierarchy="secondary"
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
                          <WorkflowTaskDiscoveryFilters
                            value={filters}
                            profile={adminProfile}
                            people={
                              taskBoardSummaryResponse?.assignees ||
                              taskBoardResponse?.assignees
                            }
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
                          {!calendarView && filters.lane !== 'finished' && <SelectFilter
                            aria-label="截止时间"
                            emptyValue="all"
                            value={filters.due}
                            options={dueOptions}
                            onChange={(value) => updateFilter('due', value)}
                          />}
                          <SelectFilter
                            aria-label="来源单据"
                            emptyValue="all"
                            value={filters.sourceType}
                            options={sourceOptions}
                            onChange={(value) =>
                              updateFilter('sourceType', value)
                            }
                          />
                        </>
                      }
                      actions={
                        !calendarView && taskBoardModel.focused ? (
                          <SelectFilter
                            emptyValue="smart"
                            aria-label="任务排序"
                            value={filters.sort}
                            options={TASK_BOARD_SORT_OPTIONS}
                            onChange={(value) => updateFilter('sort', value)}
                          />
                        ) : null
                      }
                    />
                  </div>
                </div>
                {calendarView ? (
                  <WorkflowTaskCalendar
                    state={calendarState}
                    query={buildWorkflowTaskBoardRequest({
                      ...filters,
                      lane: 'all',
                      due: 'all',
                      page: 1,
                    })}
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
                      className={`erp-task-board-lanes${
                      taskBoardModel.focused
                        ? ' erp-task-board-lanes--focused'
                        : ''
                    }`}
                      aria-label="任务管理分类"
                      aria-busy={taskBoardUpdating}
                    >
                      {(taskBoardModel.focused
                      ? taskLanes
                      : [{ key: 'overview', tasks: overviewTasks }]
                    ).map((lane) => (
                      <TaskLane
                        key={lane.key}
                        keyword={filters.keyword}
                        lane={retainedBusinessTask ? {
                          ...lane,
                          tasks: retainReturnedWorkflowTask(lane.tasks, retainedBusinessTask.task, retainedBusinessTask.context?.returnPosition),
                        } : lane}
                        loading={taskBoardUpdating}
                        focused={taskBoardModel.focused}
                        onOpenTask={openTaskDrawer}
                      />
                    ))}
                    </div>
                    {retainedBusinessTask ? <Alert
                      type="success"
                      showIcon
                      closable
                      message={retainedBusinessTask.context?.businessReceipt?.message || '已返回原任务，任务状态已重新读取'}
                      description="已恢复原筛选、页码和位置；刚办理的事项暂留原位，列表数量仍按当前筛选统计。"
                      onClose={() => setReturnedBusinessTask(null)}
                    /> : null}
                  </div>
                )}
                {!calendarView && taskBoardModel.focused ? (
                  <WorkflowTaskPagination
                    total={taskBoardCounts[filters.lane] || 0}
                    current={
                      retainedBusinessTask ? filters.page : taskBoardReady ? taskBoardModel.page : filters.page
                    }
                    retainedPage={retainedBusinessTask ? filters.page : null}
                    pageSize={filters.pageSize}
                    loading={taskBoardUpdating}
                    error={Boolean(taskBoardLoadError)}
                    onChange={selectTaskBoardPage}
                  />
                ) : null}
              </div>
            )}
          </Card>
        </>
      ) : null}

      <WorkflowTaskLinkDrawer
        profile={adminProfile}
        taskOpen={Boolean(selectedTask)}
        autoOpenRef={sharedLinkAutoRef}
        onOpenTask={(task, handle) => {
          setSharedHandlingID(handle ? task.id : null)
          openTaskDrawer(task)
        }}
      />
      <WorkflowTaskActionDrawer
        startHandling={sharedHandlingID === selectedTask?.id}
        closeLabel={
          exceptionsView
            ? exceptionQueryRef.current?.query?.view === 'tasks'
              ? '返回关联待办'
              : '返回异常跟踪'
            : '返回列表'
        }
        onOpenRelatedTask={openTaskDrawer}
        task={selectedTask}
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
                          : result.action === 'SUBMIT'
                            ? '提交老板审核'
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
        actionAvailabilityLoading={
          actionDrawerAccess.loading ||
          actionDrawerAccess.source === 'fallback_checking'
        }
        allowedActionModes={actionDrawerAllowedModes}
        readonlyReason={
          actionDrawerAccess.loading
            ? '正在确认您是否可以处理当前任务。'
            : actionDrawerAccess.readonlyReason ||
              getTaskReadonlyNotice(selectedTask)
        }
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
