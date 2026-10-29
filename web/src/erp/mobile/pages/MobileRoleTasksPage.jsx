import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { canOpenMobileTaskBusiness, resolveMobileTaskBusinessEntry } from '../utils/mobileTaskBusiness.mjs'
import { workflowTaskBusinessContract } from '../../utils/workflowTaskBusinessContract.mjs'
import { normalizeTaskListFilters } from '../../utils/workflowTaskListFilters.mjs'
import WorkflowTaskLinkDrawer from '../../components/workflow/WorkflowTaskLinkDrawer.jsx'
import BusinessTaskActions from '../../components/workflow/BusinessTaskActions.jsx'
import { getWorkflowTaskActionMeta } from '../../utils/workflowTaskActionPresentation.mjs'
import { workflowTaskCollaborationModes, workflowTaskHandlingModes } from '../../utils/workflowTaskActionFlow.mjs'
import useWorkflowTaskAssignmentAccess from '../../hooks/useWorkflowTaskAssignmentAccess.js'
import { normalizeTaskDiscoveryFilters } from '../../utils/workflowTaskDiscovery.mjs'
import { readWorkflowTaskReturn } from '../../utils/workflowTaskNavigation.mjs'
import { readMobileTrackingSource } from '../utils/mobileWorkflowTracking.mjs'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import useRuntimeBuildIdentity from '@/common/runtime/useRuntimeBuildIdentity'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import {
  listWorkflowRoleTasks,
} from '../../api/workflowApi.mjs'
import {
  MOBILE_ROLE_TASK_PAGE_LIMIT,
  MOBILE_ROLE_TASK_VIEW_KEYS,
  normalizeMobileTaskQueryOptions,
  buildMobileRoleTaskQuery,
  mobileTaskQueryScope,
  readMobileTaskQueryHistory,
  createMobileRoleTaskScopeState,
  isMobileRoleTaskHistoryScope,
  readMobileRoleTaskLoadedCounts,
  readMobileRoleTaskScopedHistoryState,
  readMobileRoleTaskScopeState,
  reconcileMobileRoleTaskMutation,
  resolveMobileRoleTaskReceiptDetailTask,
  resolveMobileRoleTaskRestoreLimit,
  resolveMobileRoleTaskViewKey,
  settleMobileRoleTaskRequest,
} from '../../utils/mobileTaskQueries.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import { canViewWorkflowApprovalInbox } from '../../utils/workflowApprovalInbox.mjs'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import MobileTaskStepPanels from '../components/MobileTaskStepPanels.jsx'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import MobileTaskDetailScreen from '../components/MobileTaskDetailScreen.jsx'
import EngineeringMaterialTaskAction from '../../components/sales-orders/EngineeringMaterialTaskAction.jsx'
import {
  canProcessEngineeringMaterialTask,
  ENGINEERING_MATERIAL_STATUS,
  isEngineeringMaterialTask,
} from '../../utils/engineeringMaterialTask.mjs'
import MobileTaskActionScreen from '../components/MobileTaskActionScreen.jsx'
import { mobileProgressAccess } from '../utils/mobileProgress.mjs'
import MobileTaskListScreen from '../components/MobileTaskListScreen.jsx'
import useWorkflowTaskCalendarView from '../../hooks/useWorkflowTaskCalendarView.js'
import MobileTaskReceiptScreen from '../components/MobileTaskReceiptScreen.jsx'
import useMobileRoleTaskActions from '../hooks/useMobileRoleTaskActions'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess'
import {
  hasWorkflowTaskActionCapability,
  workflowTaskAdminAccessRequestIdentity,
} from '../../utils/workflowTaskActionAccess.mjs'
import {
  MOBILE_MAIN_TAB_KEYS,
  MOBILE_MESSAGE_TAB_KEYS,
  MOBILE_TASK_ACTION_ACCESS_STATES,
  MOBILE_TASK_FILTER_KEYS,
  TERMINAL_TASK_STATUS_KEYS,
  getMobileRoleLabel,
  getTaskSeverityView,
  isTaskRisk,
  resolveMobileTaskStatusLabel,
} from '../utils/mobileRoleTaskModel.mjs'

import useMobileLinkedTask from '../hooks/useMobileLinkedTask.js'
import useMobileTaskDraftHistory from '../hooks/useMobileTaskDraftHistory.js'
import { buildMobileRoleTaskLists, buildMobileRoleTaskListView } from '../utils/mobileRoleTaskListView.mjs'
import {
  MOBILE_TASK_HISTORY_SCREEN_KEY,
  MOBILE_TASK_HISTORY_DEPTH_KEY,
  MOBILE_TASK_HISTORY_TASK_KEY,
  MOBILE_TASK_HISTORY_LINKED_KEY,
  MOBILE_TASK_HISTORY_ACTION_KEY,
  MOBILE_TASK_HISTORY_FACT_FORM_KEY,
  MOBILE_TASK_HISTORY_RECEIPT_KEY,
  MOBILE_TASK_HISTORY_MAIN_TAB_KEY,
  MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY,
  MOBILE_TASK_HISTORY_FILTER_KEY,
  MOBILE_TASK_HISTORY_SCROLL_TOP_KEY,
  MOBILE_TASK_HISTORY_LIST_LIMITS_KEY,
  MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY,
  MOBILE_TASK_HISTORY_SCOPE_KEY,
  MOBILE_TASK_HISTORY_KEYWORD_KEY,
  MOBILE_TASK_HISTORY_SORT_KEY,
  MOBILE_TASK_HISTORY_STATUS_KEY,
  MOBILE_TASK_HISTORY_DATES_KEY,
  MOBILE_TASK_HISTORY_QUERY_PAGES_KEY,
  MOBILE_TASK_HISTORY_REASON_KEY,
  MOBILE_TASK_HISTORY_MATERIAL_DRAFT_KEY,
  MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY,
  MOBILE_TASK_HISTORY_SCREENS,
  MOBILE_TASK_RESTORE_ITEM_LIMIT,
  MOBILE_TASK_QUERY_PAGE_KEYS,
  DEFAULT_MOBILE_TASK_QUERY_OPTIONS,
  readMobileTaskHistoryState,
  readMobileTaskDraftBackup,
  clearMobileTaskDraftBackup,
  mobileTaskHistoryChoice,
  isLinkedTaskTab,
  mobileTaskQueryPageKey,
  readMobileTaskQueryPages,
  readMobileTaskListLimits,
} from '../utils/mobileTaskHistory.mjs'

function createMobileRoleTaskViewCounters() {
  return Object.fromEntries(
    Object.values(MOBILE_ROLE_TASK_VIEW_KEYS).map((viewKey) => [viewKey, 0])
  )
}

export default function MobileRoleTasksPage() {
  const calendarState = useWorkflowTaskCalendarView()
  const location = useLocation()
  const sharedLinkAutoRef = useRef('')
  const [sharedHandlingID, setSharedHandlingID] = useState(null)
  const [taskFormReceipt, setTaskFormReceipt] = useState(null)
  const taskFormLeaveGuard = useRef(null)
  const navigate = useNavigate()
  const { activeRoleKey } = useERPWorkspace()
  const shellContext = useOutletContext() || {}
  const { adminProfile, canEnterDesktop, handleLogout, loggingOut, mobileRoleOptions, handleSwitchMobileRole } = shellContext
  const returnedTaskID = readWorkflowTaskReturn(location.state, adminProfile?.id)?.taskID
  const progressAccess = useMemo(
    () => mobileProgressAccess(adminProfile),
    [adminProfile]
  )
  const runtimeBuildIdentity = useRuntimeBuildIdentity()
  const canMountCustomerTasks = canMountCustomerRuntime(adminProfile)
  const canViewApprovalInbox = canViewWorkflowApprovalInbox(adminProfile)
  const canViewTracking = hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_READ)
  const taskAccessIdentity =
    workflowTaskAdminAccessRequestIdentity(adminProfile)
  const taskAccessScopeKey = `${activeRoleKey}|access:${taskAccessIdentity}|${canMountCustomerTasks ? 'ready' : 'blocked'}`
  const initialHistoryStateRef = useRef(readMobileTaskHistoryState())
  const initialHistoryCandidate = initialHistoryStateRef.current
  const defaultMainTabKey = progressAccess.enabled
    ? MOBILE_MAIN_TAB_KEYS.PROGRESS
    : MOBILE_MAIN_TAB_KEYS.TODO
  const initialTaskQueryOptions = readMobileTaskQueryHistory(
    initialHistoryCandidate,
    taskAccessScopeKey
  )
  const initialHistoryMatchesQuery =
    String(
      initialHistoryCandidate[MOBILE_TASK_HISTORY_SCOPE_KEY] || ''
    ).trim() ===
    mobileTaskQueryScope(taskAccessScopeKey, initialTaskQueryOptions)
  const initialMainTabKey = readMobileTrackingSource(location.search) && canViewTracking
    ? MOBILE_MAIN_TAB_KEYS.TRACKING
    : initialHistoryMatchesQuery
    ? mobileTaskHistoryChoice(
        initialHistoryCandidate[MOBILE_TASK_HISTORY_MAIN_TAB_KEY],
        Object.values(MOBILE_MAIN_TAB_KEYS),
        defaultMainTabKey
      )
    : calendarState.layout === 'calendar' ? MOBILE_MAIN_TAB_KEYS.TODO : defaultMainTabKey
  const [requestedMainTabKey, setActiveMainTabKey] = useState(initialMainTabKey)
  const activeMainTabKey =
    (requestedMainTabKey === MOBILE_MAIN_TAB_KEYS.PROGRESS && !progressAccess.enabled)
    || ([MOBILE_MAIN_TAB_KEYS.TRACKING, MOBILE_MAIN_TAB_KEYS.EXCEPTIONS].includes(requestedMainTabKey) && !canViewTracking)
      ? MOBILE_MAIN_TAB_KEYS.TODO
      : requestedMainTabKey
  const activeTaskQueryPageKey = mobileTaskQueryPageKey(activeMainTabKey)
  const [taskQueryOptionsByPage, setTaskQueryOptionsByPage] = useState(() =>
    readMobileTaskQueryPages(
      initialHistoryCandidate,
      taskAccessScopeKey,
      mobileTaskQueryPageKey(initialMainTabKey),
      initialTaskQueryOptions
    )
  )
  const taskQueryOptions =
    taskQueryOptionsByPage[activeTaskQueryPageKey] ||
    normalizeMobileTaskQueryOptions(DEFAULT_MOBILE_TASK_QUERY_OPTIONS, activeTaskQueryPageKey === MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY)
  const {
    keyword: taskKeyword,
    sortKey: taskSortKey,
    statusKey: taskStatusKey,
    period: taskPeriod = '',
    dateFrom: taskDateFrom = '',
    dateTo: taskDateTo = '',
  } = taskQueryOptions
  const updateTaskQueryOptions = useCallback(
    (pageKey, update) => {
      setTaskQueryOptionsByPage((current) => {
        const currentOptions =
          current[pageKey] || normalizeMobileTaskQueryOptions(DEFAULT_MOBILE_TASK_QUERY_OPTIONS, pageKey === MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY)
        const nextOptions =
          typeof update === 'function'
            ? update(currentOptions)
            : { ...currentOptions, ...update }
        return {
          ...current,
          [pageKey]:
            normalizeMobileTaskQueryOptions(nextOptions, pageKey === MOBILE_TASK_QUERY_PAGE_KEYS.HISTORY),
        }
      })
    },
    []
  )
  const updateActiveTaskQueryOptions = useCallback(
    (update) => updateTaskQueryOptions(activeTaskQueryPageKey, update),
    [activeTaskQueryPageKey, updateTaskQueryOptions]
  )
  const setTaskKeyword = useCallback(
    (keyword) => {
      updateActiveTaskQueryOptions((current) => ({ ...current, keyword }))
    },
    [updateActiveTaskQueryOptions]
  )
  const taskScopeKey = mobileTaskQueryScope(
    taskAccessScopeKey,
    taskQueryOptions
  )

  const initialHistoryScopeKey = String(
    initialHistoryCandidate[MOBILE_TASK_HISTORY_SCOPE_KEY] || ''
  ).trim()
  const initialHistoryState = canMountCustomerTasks
    ? readMobileRoleTaskScopedHistoryState(
        initialHistoryCandidate,
        taskScopeKey
      )
    : {}
  const initialHistoryRestoreHandledRef = useRef(
    !initialHistoryScopeKey || initialHistoryState === initialHistoryCandidate
  )
  const initialHistoryScreen = MOBILE_TASK_HISTORY_SCREENS.has(
    initialHistoryState[MOBILE_TASK_HISTORY_SCREEN_KEY]
  )
    ? initialHistoryState[MOBILE_TASK_HISTORY_SCREEN_KEY]
    : ''
  const [taskFormMode, setTaskFormMode] = useState(() => initialHistoryScreen === 'action' && initialHistoryState[MOBILE_TASK_HISTORY_FACT_FORM_KEY] === true)
  const scrollContainerRef = useRef(null)
  const listScrollTopRef = useRef(
    Math.max(
      0,
      Number(initialHistoryState[MOBILE_TASK_HISTORY_SCROLL_TOP_KEY] || 0)
    )
  )
  const restoreListStateRef = useRef(Boolean(initialHistoryCandidate.usr?.mobileRoleTasksReturn && !initialHistoryScreen))
  const lastFocusedTaskIDRef = useRef(
    initialHistoryState[MOBILE_TASK_HISTORY_TASK_KEY] || null
  )
  const currentTaskScreenRef = useRef(initialHistoryScreen)
  const restoringHistoryTaskRef = useRef(
    Boolean(
      initialHistoryScreen && initialHistoryState[MOBILE_TASK_HISTORY_TASK_KEY]
    )
  )
  const receiptBackIntentRef = useRef('')
  const taskLoadRequestSeqRef = useRef(createMobileRoleTaskViewCounters())
  const taskViewRestoreTargetRef = useRef(createMobileRoleTaskViewCounters())
  const taskViewRestoreAppendCountRef = useRef(
    createMobileRoleTaskViewCounters()
  )
  const [activeMessageTabKey, setActiveMessageTabKey] = useState(() =>
    taskQueryOptionsByPage[MOBILE_TASK_QUERY_PAGE_KEYS.RISKS]?.due !== 'overdue' ? MOBILE_MESSAGE_TAB_KEYS.WARNING : mobileTaskHistoryChoice(
      initialHistoryState[MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY],
      Object.values(MOBILE_MESSAGE_TAB_KEYS),
      MOBILE_MESSAGE_TAB_KEYS.WARNING
    )
  )
  const [activeFilterKey, setActiveFilterKey] = useState(() => {
    const filter = mobileTaskHistoryChoice(
      initialHistoryState[MOBILE_TASK_HISTORY_FILTER_KEY],
      Object.values(MOBILE_TASK_FILTER_KEYS),
      MOBILE_TASK_FILTER_KEYS.ALL
    )
    return filter === MOBILE_TASK_FILTER_KEYS.OVERDUE && taskQueryOptionsByPage[MOBILE_TASK_QUERY_PAGE_KEYS.TASKS]?.due !== 'overdue'
      ? MOBILE_TASK_FILTER_KEYS.ALL : filter
  })
  const changeTaskFilter = useCallback((next) => {
    if (next === MOBILE_TASK_FILTER_KEYS.OVERDUE || activeFilterKey === MOBILE_TASK_FILTER_KEYS.OVERDUE) {
      updateTaskQueryOptions(MOBILE_TASK_QUERY_PAGE_KEYS.TASKS, { due: next === MOBILE_TASK_FILTER_KEYS.OVERDUE ? 'overdue' : '' })
    }
    setActiveFilterKey(next)
  }, [activeFilterKey, updateTaskQueryOptions])
  const changeRiskFilter = useCallback((next) => {
    if (next === MOBILE_MESSAGE_TAB_KEYS.NOTICE || activeMessageTabKey === MOBILE_MESSAGE_TAB_KEYS.NOTICE) {
      updateTaskQueryOptions(MOBILE_TASK_QUERY_PAGE_KEYS.RISKS, { due: next === MOBILE_MESSAGE_TAB_KEYS.NOTICE ? 'overdue' : '' })
    }
    setActiveMessageTabKey(next)
  }, [activeMessageTabKey, updateTaskQueryOptions])
  const [selectedTaskID, setSelectedTaskID] = useState(() =>
    returnedTaskID || (initialHistoryScreen
      ? initialHistoryState[MOBILE_TASK_HISTORY_TASK_KEY] || null
      : null)
  )
  const [selectedLinkedTaskID, setSelectedLinkedTaskID] = useState(() => initialHistoryState[MOBILE_TASK_HISTORY_LINKED_KEY] || null)
  const [detailAction, setDetailAction] = useState(() =>
    initialHistoryScreen === 'action'
      ? initialHistoryState[MOBILE_TASK_HISTORY_ACTION_KEY] || null
      : null
  )
  const [visibleListLimitsByKey, setVisibleListLimitsByKey] = useState(() =>
    readMobileTaskListLimits(
      initialHistoryState[MOBILE_TASK_HISTORY_LIST_LIMITS_KEY]
    )
  )
  const historyLoadedTaskCountsRef = useRef(
    readMobileRoleTaskLoadedCounts(
      initialHistoryState[MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY],
      { maxItems: MOBILE_TASK_RESTORE_ITEM_LIMIT }
    )
  )
  const [receiptDetailSnapshot, setReceiptDetailSnapshot] = useState(null)
  const receiptDetailSnapshotRef = useRef(null)
  const [taskScopeState, setTaskScopeState] = useState(() =>
    createMobileRoleTaskScopeState(taskScopeKey)
  )
  const taskScopeKeyRef = useRef(taskScopeKey)
  taskScopeKeyRef.current = taskScopeKey
  const initializedTaskScopeKeyRef = useRef(taskScopeKey)
  const visibleTaskScopeState = readMobileRoleTaskScopeState(
    taskScopeState,
    taskScopeKey
  )
  const taskScopeStateRef = useRef(visibleTaskScopeState)
  taskScopeStateRef.current = visibleTaskScopeState
  const taskSlots = visibleTaskScopeState.slots
  const visibleActiveFilterKey =
    activeFilterKey === MOBILE_TASK_FILTER_KEYS.APPROVAL &&
    !canViewApprovalInbox
      ? MOBILE_TASK_FILTER_KEYS.ALL
      : activeFilterKey
  const activeTaskViewKey = useMemo(
    () =>
      resolveMobileRoleTaskViewKey({
        mainTabKey: activeMainTabKey,
        filterKey: visibleActiveFilterKey,
      }),
    [activeMainTabKey, visibleActiveFilterKey]
  )
  const activeTaskSlot = taskSlots[activeTaskViewKey]
  const taskFeedbackScopeRef = useRef('')
  taskFeedbackScopeRef.current = `${activeMainTabKey}|${activeTaskViewKey}|${selectedTaskID || ''}`
  const historyRestoreItemLimit = resolveMobileRoleTaskRestoreLimit({
    viewKey: activeTaskViewKey,
    loadedCounts: historyLoadedTaskCountsRef.current,
    visibleLimits: visibleListLimitsByKey,
    maxItems: MOBILE_TASK_RESTORE_ITEM_LIMIT,
  })

  const taskLists = useMemo(
    () => buildMobileRoleTaskLists({ slots: taskSlots, roleKey: activeRoleKey }),
    [activeRoleKey, taskSlots]
  )
  const {
    activeTasks,
    doneTasks,
    riskTasks,
    approvalTasks,
    activeTaskViewState,
    filteredTasks,
    filterItems,
    authoritativeTaskCounts,
    riskScope,
  } = useMemo(
    () => buildMobileRoleTaskListView({
      lists: taskLists,
      countSummary: activeTaskSlot.count_summary,
      viewKey: activeTaskViewKey,
      filterKey: visibleActiveFilterKey,
      selectedTaskID,
      canViewApprovalInbox,
      isAdminReview: adminProfile?.is_super_admin === true,
    }),
    [
      activeTaskViewKey,
      activeTaskSlot.count_summary,
      adminProfile?.is_super_admin,
      canViewApprovalInbox,
      selectedTaskID,
      taskLists,
      visibleActiveFilterKey,
    ]
  )
  const isLinkedSelection = isLinkedTaskTab(activeMainTabKey) || returnedTaskID === selectedTaskID || (selectedTaskID != null && selectedLinkedTaskID === selectedTaskID)
  const { linkedTask, loadLinkedTask, retainLinkedTask } = useMobileLinkedTask({
    accessScopeKey: taskAccessScopeKey,
    adminID: adminProfile?.id,
    enabled: canMountCustomerTasks && isLinkedSelection,
    taskID: selectedTaskID,
  })
  const selectedTask =
    isLinkedSelection
      ? linkedTask?.task || null
      : activeTaskViewState.selectedTask
  const receiptDetailTask = useMemo(
    () =>
      resolveMobileRoleTaskReceiptDetailTask({
        receipt: receiptDetailSnapshot,
        scopeKey: taskScopeKey,
        selectedTaskID,
      }),
    [receiptDetailSnapshot, selectedTaskID, taskScopeKey]
  )
  const detailTask = selectedTask || receiptDetailTask
  const selectedTaskActionsEnabled =
    canMountCustomerTasks &&
    (activeTaskViewState.actionsEnabled ||
      ((isLinkedSelection) &&
        Boolean(selectedTask) &&
        !TERMINAL_TASK_STATUS_KEYS.has(selectedTask.task_status_key)))
  const selectedTaskActionAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTaskActionsEnabled ? selectedTask : null,
    enabled: selectedTaskActionsEnabled,
  })
  const taskFormReadAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTask,
    enabled: Boolean(canMountCustomerTasks && selectedTask && !selectedTaskActionsEnabled && resolveMobileTaskBusinessEntry(selectedTask)),
  })
  const taskFormAccess = selectedTaskActionsEnabled ? selectedTaskActionAccess : taskFormReadAccess
  const canOpenTaskForm = canOpenMobileTaskBusiness(selectedTask, adminProfile, taskFormAccess.sourceAccess)
  const previousSelectedTaskIDRef = useRef(selectedTaskID)
  useEffect(() => {
    if (previousSelectedTaskIDRef.current === selectedTaskID) return
    previousSelectedTaskIDRef.current = selectedTaskID
    setDetailAction(null)
  }, [selectedTaskID])

  const previousMainTabKeyRef = useRef(activeMainTabKey)
  useEffect(() => {
    if (previousMainTabKeyRef.current === activeMainTabKey) return
    previousMainTabKeyRef.current = activeMainTabKey
    receiptDetailSnapshotRef.current = null
    setReceiptDetailSnapshot(null)
    if (
      activeMainTabKey === MOBILE_MAIN_TAB_KEYS.TODO ||
      activeMainTabKey === MOBILE_MAIN_TAB_KEYS.MINE
    ) {
      return
    }
    setSelectedTaskID(null)
    setDetailAction(null)
  }, [activeMainTabKey])

  useEffect(() => {
    if (
      canViewApprovalInbox ||
      activeFilterKey !== MOBILE_TASK_FILTER_KEYS.APPROVAL
    ) {
      return
    }
    setActiveFilterKey(MOBILE_TASK_FILTER_KEYS.ALL)
    setSelectedTaskID(null)
    setDetailAction(null)
  }, [activeFilterKey, canViewApprovalInbox])

  const loadTaskView = useCallback(
    async (
      viewKey,
      {
        append = false,
        showRefreshFeedback = false,
        rejectOnError = false,
      } = {}
    ) => {
      if (!canMountCustomerTasks) return false

      const requestScopeKey = taskScopeKey
      const feedbackScope = taskFeedbackScopeRef.current
      const currentScopeState = readMobileRoleTaskScopeState(
        taskScopeStateRef.current,
        requestScopeKey
      )
      const currentSlot = currentScopeState.slots[viewKey]
      if (
        !currentSlot ||
        (append && (!currentSlot.has_more || currentSlot.loading))
      ) {
        return false
      }
      const requestSeq = (taskLoadRequestSeqRef.current[viewKey] || 0) + 1
      taskLoadRequestSeqRef.current[viewKey] = requestSeq
      const loadingState = {
        ...currentScopeState,
        slots: {
          ...currentScopeState.slots,
          [viewKey]: {
            ...currentSlot,
            loading: true,
            error: '',
          },
        },
      }
      taskScopeStateRef.current = loadingState
      setTaskScopeState(loadingState)
      try {
        const response = await listWorkflowRoleTasks(
          buildMobileRoleTaskQuery({
            roleKey: activeRoleKey,
            ...normalizeTaskDiscoveryFilters(taskQueryOptions),
            ...normalizeTaskListFilters(taskQueryOptions),
            keyword: taskKeyword,
            sortKey: taskSortKey,
            statusKey: taskStatusKey,
            period: taskPeriod,
            dateFrom: taskDateFrom,
            dateTo: taskDateTo,
            viewKey,
            cursor: append ? currentSlot.next_cursor : '',
          })
        )
        if (
          taskScopeKeyRef.current !== requestScopeKey ||
          taskLoadRequestSeqRef.current[viewKey] !== requestSeq
        ) {
          return false
        }
        const settledState = settleMobileRoleTaskRequest(
          taskScopeStateRef.current,
          {
            currentScopeKey: taskScopeKeyRef.current,
            requestScopeKey,
            viewKey,
            currentRequestSeq: taskLoadRequestSeqRef.current[viewKey],
            requestSeq,
            response,
            append,
          }
        )
        if (settledState === taskScopeStateRef.current) return false
        taskScopeStateRef.current = settledState
        setTaskScopeState(settledState)
        if (
          showRefreshFeedback &&
          feedbackScope === taskFeedbackScopeRef.current
        ) {
          message.success({
            key: 'mobile-role-task-load',
            content: '数据已刷新',
          })
        }
        return true
      } catch (error) {
        if (
          taskScopeKeyRef.current !== requestScopeKey ||
          taskLoadRequestSeqRef.current[viewKey] !== requestSeq
        ) {
          return false
        }
        const errorMessage = getActionErrorMessage(
          error,
          showRefreshFeedback
            ? '刷新任务失败，已保留上次数据'
            : '加载任务失败，请稍后重试'
        )
        const settledState = settleMobileRoleTaskRequest(
          taskScopeStateRef.current,
          {
            currentScopeKey: taskScopeKeyRef.current,
            requestScopeKey,
            viewKey,
            currentRequestSeq: taskLoadRequestSeqRef.current[viewKey],
            requestSeq,
            errorMessage,
          }
        )
        if (settledState === taskScopeStateRef.current) return false
        taskScopeStateRef.current = settledState
        setTaskScopeState(settledState)
        if (rejectOnError) throw error
        return false
      }
    },
    [
      activeRoleKey,
      canMountCustomerTasks,
      taskScopeKey,
      taskKeyword,
      taskSortKey,
      taskStatusKey,
      taskQueryOptions,
      taskPeriod,
      taskDateFrom,
      taskDateTo,
    ]
  )

  useEffect(() => {
    if (initializedTaskScopeKeyRef.current === taskScopeKey) return
    initializedTaskScopeKeyRef.current = taskScopeKey
    for (const viewKey of Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)) {
      taskLoadRequestSeqRef.current[viewKey] =
        (taskLoadRequestSeqRef.current[viewKey] || 0) + 1
    }
    const nextState = createMobileRoleTaskScopeState(taskScopeKey)
    taskViewRestoreTargetRef.current = createMobileRoleTaskViewCounters()
    taskViewRestoreAppendCountRef.current = createMobileRoleTaskViewCounters()
    taskScopeStateRef.current = nextState
    setTaskScopeState(nextState)
    setSelectedTaskID(null)
    setDetailAction(null)
    receiptDetailSnapshotRef.current = null
    setReceiptDetailSnapshot(null)
    setVisibleListLimitsByKey({})
    historyLoadedTaskCountsRef.current = {}
    listScrollTopRef.current = 0
    restoreListStateRef.current = true
    restoringHistoryTaskRef.current = false
    if (typeof window === 'undefined') return
    const currentState = window.history.state || {}
    if (isMobileRoleTaskHistoryScope(currentState, taskScopeKey)) return
    const currentScreen = currentState[MOBILE_TASK_HISTORY_SCREEN_KEY]
    if (!MOBILE_TASK_HISTORY_SCREENS.has(currentScreen)) return
    const currentDepth = Number(
      currentState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0
    )
    currentTaskScreenRef.current = ''
    if (currentDepth > 0 && window.history.length > currentDepth) {
      window.history.go(-currentDepth)
      return
    }
    window.history.replaceState(
      {
        ...currentState,
        [MOBILE_TASK_HISTORY_SCREEN_KEY]: '',
        [MOBILE_TASK_HISTORY_DEPTH_KEY]: 0,
        [MOBILE_TASK_HISTORY_TASK_KEY]: null,
        [MOBILE_TASK_HISTORY_ACTION_KEY]: '',
        [MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY]: '',
        [MOBILE_TASK_HISTORY_RECEIPT_KEY]: null,
        [MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY]: {},
        [MOBILE_TASK_HISTORY_REASON_KEY]: '',
        [MOBILE_TASK_HISTORY_SCOPE_KEY]: taskScopeKey,
      },
      ''
    )
  }, [taskScopeKey])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !canMountCustomerTasks ||
      !initialHistoryScopeKey ||
      initialHistoryScopeKey === taskScopeKey
    ) {
      return
    }
    const currentState = window.history.state || {}
    window.history.replaceState(
      {
        ...currentState,
        [MOBILE_TASK_HISTORY_SCREEN_KEY]: '',
        [MOBILE_TASK_HISTORY_DEPTH_KEY]: 0,
        [MOBILE_TASK_HISTORY_TASK_KEY]: null,
        [MOBILE_TASK_HISTORY_ACTION_KEY]: '',
        [MOBILE_TASK_HISTORY_RECEIPT_KEY]: null,
        [MOBILE_TASK_HISTORY_REASON_KEY]: '',
        [MOBILE_TASK_HISTORY_LIST_LIMITS_KEY]: {},
        [MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY]: {},
        [MOBILE_TASK_HISTORY_SCOPE_KEY]: taskScopeKey,
      },
      ''
    )
  }, [canMountCustomerTasks, initialHistoryScopeKey, taskScopeKey])

  useEffect(() => {
    if (
      canMountCustomerTasks &&
      !isLinkedTaskTab(activeMainTabKey) &&
      !activeTaskSlot.loaded &&
      !activeTaskSlot.loading &&
      !activeTaskSlot.error
    ) {
      loadTaskView(activeTaskViewKey)
    }
  }, [
    activeMainTabKey,
    activeTaskSlot.loaded,
    activeTaskSlot.loading,
    activeTaskSlot.error,
    activeTaskViewKey,
    canMountCustomerTasks,
    loadTaskView,
  ])

  const loadTasks = useCallback(
    (options = {}) => {
      const normalizedOptions =
        options && typeof options === 'object' ? options : {}
      return loadTaskView(activeTaskViewKey, {
        showRefreshFeedback: normalizedOptions.showRefreshFeedback === true,
      })
    },
    [activeTaskViewKey, loadTaskView]
  )

  const loadMoreActiveTaskView = useCallback(
    () => loadTaskView(activeTaskViewKey, { append: true }),
    [activeTaskViewKey, loadTaskView]
  )

  const refreshTasksAfterMutation = useCallback(
    async (options = {}) => {
      if (
        isLinkedTaskTab(activeMainTabKey) &&
        selectedTaskID
      ) {
        return loadLinkedTask(selectedTaskID)
      }
      let currentState = readMobileRoleTaskScopeState(
        taskScopeStateRef.current,
        taskScopeKey
      )
      let currentSlots = currentState.slots
      const activeLoadedCount = currentSlots[activeTaskViewKey].items.length
      for (const viewKey of Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)) {
        taskLoadRequestSeqRef.current[viewKey] =
          (taskLoadRequestSeqRef.current[viewKey] || 0) + 1
      }
      const canonicalTask =
        options?.canonicalTask &&
        typeof options.canonicalTask === 'object' &&
        !Array.isArray(options.canonicalTask)
          ? options.canonicalTask
          : null
      if (canonicalTask && String(canonicalTask.id || '').trim()) {
        const canonicalStatusKey = String(
          canonicalTask.task_status_key || ''
        ).trim()
        const terminal = TERMINAL_TASK_STATUS_KEYS.has(canonicalStatusKey)
        const matchesStatus =
          !taskStatusKey || canonicalStatusKey === taskStatusKey
        const keepInActiveView =
          activeTaskViewKey === MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY
            ? terminal
            : activeTaskViewKey === MOBILE_ROLE_TASK_VIEW_KEYS.RISK
              ? !terminal && isTaskRisk(canonicalTask)
              : activeTaskViewKey === MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL
                ? !terminal && isWorkflowApprovalTask(canonicalTask)
                : !terminal
        const keepInViews = {
          [MOBILE_ROLE_TASK_VIEW_KEYS.TODO]: !terminal && matchesStatus,
          [MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY]: terminal,
          [MOBILE_ROLE_TASK_VIEW_KEYS.RISK]:
            !terminal && matchesStatus && isTaskRisk(canonicalTask),
          [MOBILE_ROLE_TASK_VIEW_KEYS.APPROVAL]:
            !terminal && matchesStatus && isWorkflowApprovalTask(canonicalTask),
        }
        const nextState = reconcileMobileRoleTaskMutation(currentState, {
          scopeKey: taskScopeKey,
          viewKey: activeTaskViewKey,
          canonicalTask,
          keepInActiveView,
          keepInViews,
        })
        taskViewRestoreTargetRef.current[activeTaskViewKey] = 0
        taskViewRestoreAppendCountRef.current[activeTaskViewKey] = 0
        taskScopeStateRef.current = nextState
        setTaskScopeState(nextState)
        currentState = nextState
        currentSlots = nextState.slots
      }
      const restoreTarget = Math.min(
        MOBILE_TASK_RESTORE_ITEM_LIMIT,
        Math.max(
          MOBILE_ROLE_TASK_PAGE_LIMIT,
          historyRestoreItemLimit,
          activeLoadedCount,
          Number(taskViewRestoreTargetRef.current[activeTaskViewKey] || 0)
        )
      )
      taskViewRestoreTargetRef.current[activeTaskViewKey] = restoreTarget
      const nextSlots = Object.fromEntries(
        Object.entries(currentSlots).map(([viewKey, slot]) => [
          viewKey,
          viewKey === activeTaskViewKey
            ? slot
            : {
                ...slot,
                loaded: false,
                error: '',
              },
        ])
      )
      const nextState = { ...currentState, slots: nextSlots }
      taskScopeStateRef.current = nextState
      setTaskScopeState(nextState)
      const firstPageLoaded = await loadTaskView(activeTaskViewKey, {
        rejectOnError: true,
      })
      if (!firstPageLoaded) return false

      const maxAppendAttempts = Math.max(
        0,
        Math.ceil(restoreTarget / MOBILE_ROLE_TASK_PAGE_LIMIT) - 1
      )
      let appendAttempts = 0
      while (appendAttempts < maxAppendAttempts) {
        const activeSlot = readMobileRoleTaskScopeState(
          taskScopeStateRef.current,
          taskScopeKey
        ).slots[activeTaskViewKey]
        if (!activeSlot.has_more || activeSlot.items.length >= restoreTarget) {
          taskViewRestoreTargetRef.current[activeTaskViewKey] = 0
          return true
        }
        appendAttempts += 1
        const appended = await loadTaskView(activeTaskViewKey, {
          append: true,
          rejectOnError: true,
        })
        if (!appended) return false
      }
      return true
    },
    [
      activeMainTabKey,
      selectedTaskID,
      loadLinkedTask,
      activeTaskViewKey,
      historyRestoreItemLimit,
      loadTaskView,
      taskScopeKey,
      taskStatusKey,
    ]
  )

  const roleLabel = getMobileRoleLabel(activeRoleKey)
  const { loading } = activeTaskSlot
  const activeViewInitialLoading =
    loading && !activeTaskSlot.loaded && activeTaskSlot.items.length === 0
  const hasLoadedTaskView = Object.values(taskSlots).some((slot) => slot.loaded)
  const loadedAccessScopeRef = useRef('')
  if (hasLoadedTaskView) loadedAccessScopeRef.current = taskAccessScopeKey
  const initialLoading =
    activeViewInitialLoading &&
    !hasLoadedTaskView &&
    loadedAccessScopeRef.current !== taskAccessScopeKey
  const serverDataTime = activeTaskSlot.server_time
    ? new Intl.DateTimeFormat('zh-CN', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date(activeTaskSlot.server_time * 1000))
    : '—'
  const detailSeverity = detailTask ? getTaskSeverityView(detailTask) : null
  const {
    actionReceipt,
    actionReceiptRetryable,
    clearActionReceipt,
    detailReasonValue,
    detailApprovedQuantityValue,
    handleTaskAction,
    restoreActionReceipt,
    restoreActionDraft,
    savedEvidenceRefs,
    selectedCanBlock,
    selectedCanComplete,
    selectedCanOperate,
    selectedCanReject,
    selectedCanResume,
    selectedCanUrge,
    selectedTaskReceipt,
    selectedTaskReceiptRetryable,
    showTaskReceipt,
    submitDetailAction,
    updateDetailReason,
    updateDetailApprovedQuantity,
    updatingID,
    urgingID,
  } = useMobileRoleTaskActions({
    activeRoleKey,
    isAdminReview: adminProfile?.is_super_admin === true,
    detailAction,
    initialAction:
      initialHistoryScreen === 'action'
        ? initialHistoryState[MOBILE_TASK_HISTORY_ACTION_KEY]
        : '',
    initialActionReceipt:
      initialHistoryScreen === 'receipt'
        ? initialHistoryState[MOBILE_TASK_HISTORY_RECEIPT_KEY]
        : null,
    initialActionTaskID:
      initialHistoryScreen === 'action'
        ? initialHistoryState[MOBILE_TASK_HISTORY_TASK_KEY]
        : null,
    initialApprovedQuantity:
      initialHistoryScreen === 'action'
        ? initialHistoryState[MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY]
        : '',
    initialReason:
      initialHistoryScreen === 'action'
        ? initialHistoryState[MOBILE_TASK_HISTORY_REASON_KEY]
        : '',
    loadTasks: refreshTasksAfterMutation,
    receiptScopeKey: taskScopeKey,
    selectedTask,
    taskActionAccess: selectedTaskActionAccess,
    setDetailAction,
    setSelectedTaskID,
  })

  const [collaborationOpen, setCollaborationOpen] = useState('')
  const collaborationTriggerRef = useRef(null)
  useEffect(() => setCollaborationOpen(''), [taskAccessScopeKey, selectedTaskID, actionReceipt])

  useEffect(() => {
    if (initialHistoryRestoreHandledRef.current || !canMountCustomerTasks) {
      return
    }
    initialHistoryRestoreHandledRef.current = true
    if (!isMobileRoleTaskHistoryScope(initialHistoryCandidate, taskScopeKey)) {
      return
    }
    const restoredScreen = MOBILE_TASK_HISTORY_SCREENS.has(
      initialHistoryCandidate[MOBILE_TASK_HISTORY_SCREEN_KEY]
    )
      ? initialHistoryCandidate[MOBILE_TASK_HISTORY_SCREEN_KEY]
      : ''
    const restoredTaskID = restoredScreen
      ? initialHistoryCandidate[MOBILE_TASK_HISTORY_TASK_KEY] || null
      : null
    const restoredAction =
      restoredScreen === 'action'
        ? initialHistoryCandidate[MOBILE_TASK_HISTORY_ACTION_KEY] || null
        : null
    const restoredListLimits = readMobileTaskListLimits(
      initialHistoryCandidate[MOBILE_TASK_HISTORY_LIST_LIMITS_KEY]
    )
    historyLoadedTaskCountsRef.current = readMobileRoleTaskLoadedCounts(
      initialHistoryCandidate[MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY],
      { maxItems: MOBILE_TASK_RESTORE_ITEM_LIMIT }
    )
    listScrollTopRef.current = Math.max(
      0,
      Number(initialHistoryCandidate[MOBILE_TASK_HISTORY_SCROLL_TOP_KEY] || 0)
    )
    lastFocusedTaskIDRef.current = restoredTaskID
    currentTaskScreenRef.current = restoredScreen
    restoringHistoryTaskRef.current = Boolean(restoredTaskID)
    restoreListStateRef.current = !restoredScreen
    setActiveMainTabKey(
      mobileTaskHistoryChoice(
        initialHistoryCandidate[MOBILE_TASK_HISTORY_MAIN_TAB_KEY],
        Object.values(MOBILE_MAIN_TAB_KEYS),
        MOBILE_MAIN_TAB_KEYS.TODO
      )
    )
    setActiveMessageTabKey(
      mobileTaskHistoryChoice(
        initialHistoryCandidate[MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY],
        Object.values(MOBILE_MESSAGE_TAB_KEYS),
        MOBILE_MESSAGE_TAB_KEYS.WARNING
      )
    )
    setActiveFilterKey(
      mobileTaskHistoryChoice(
        initialHistoryCandidate[MOBILE_TASK_HISTORY_FILTER_KEY],
        Object.values(MOBILE_TASK_FILTER_KEYS),
        MOBILE_TASK_FILTER_KEYS.ALL
      )
    )
    setVisibleListLimitsByKey(restoredListLimits)
    setSelectedLinkedTaskID(initialHistoryCandidate[MOBILE_TASK_HISTORY_LINKED_KEY] || null)
    setSelectedTaskID(restoredTaskID)
    setDetailAction(restoredAction)
    if (restoredScreen === 'action') {
      restoreActionDraft({
        action: restoredAction,
        approvedQuantity:
          initialHistoryCandidate[MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY] ||
          '',
        reason: initialHistoryCandidate[MOBILE_TASK_HISTORY_REASON_KEY] || '',
        taskID: restoredTaskID,
      })
      return
    }
    if (restoredScreen === 'receipt') {
      restoreActionReceipt(
        initialHistoryCandidate[MOBILE_TASK_HISTORY_RECEIPT_KEY]
      )
    }
  }, [
    canMountCustomerTasks,
    initialHistoryCandidate,
    restoreActionDraft,
    restoreActionReceipt,
    taskScopeKey,
    selectedTaskID,
  ])

  const { flush: flushMobileTaskDraftHistory, backup: backupMobileTaskDraft } =
    useMobileTaskDraftHistory({
      action: detailAction,
      approvedQuantity: detailApprovedQuantityValue,
      reason: detailReasonValue,
      receipt: actionReceipt,
      scopeKey: taskScopeKey,
      taskID: selectedTask?.id || null,
    })

  useEffect(() => {
    if (
      isLinkedSelection ||
      selectedTaskID === null ||
      !activeTaskSlot.loaded
    ) {
      return
    }
    if (receiptDetailTask) {
      restoringHistoryTaskRef.current = false
      taskViewRestoreTargetRef.current[activeTaskViewKey] = 0
      taskViewRestoreAppendCountRef.current[activeTaskViewKey] = 0
      return
    }
    const selectedVisible = filteredTasks.some(
      (task) => String(task.id) === String(selectedTaskID)
    )
    if (selectedVisible) {
      restoringHistoryTaskRef.current = false
      taskViewRestoreTargetRef.current[activeTaskViewKey] = 0
      taskViewRestoreAppendCountRef.current[activeTaskViewKey] = 0
      return
    }
    const shouldContinueRestore =
      restoringHistoryTaskRef.current || actionReceiptRetryable
    const maxHistoryRestoreAppendRequests =
      Math.ceil(historyRestoreItemLimit / MOBILE_ROLE_TASK_PAGE_LIMIT) + 1
    if (
      shouldContinueRestore &&
      activeTaskSlot.has_more &&
      activeTaskSlot.items.length < historyRestoreItemLimit &&
      taskViewRestoreAppendCountRef.current[activeTaskViewKey] <
        maxHistoryRestoreAppendRequests
    ) {
      taskViewRestoreTargetRef.current[activeTaskViewKey] = Math.max(
        taskViewRestoreTargetRef.current[activeTaskViewKey] || 0,
        historyRestoreItemLimit
      )
      if (!activeTaskSlot.loading && !activeTaskSlot.error) {
        taskViewRestoreAppendCountRef.current[activeTaskViewKey] += 1
        loadTaskView(activeTaskViewKey, { append: true })
      }
      return
    }

    restoringHistoryTaskRef.current = false
    taskViewRestoreTargetRef.current[activeTaskViewKey] = 0
    taskViewRestoreAppendCountRef.current[activeTaskViewKey] = 0
    restoreListStateRef.current = true
    setSelectedTaskID(null)
    if (actionReceipt || typeof window === 'undefined') return
    const currentState = window.history.state || {}
    const currentScreen = currentState[MOBILE_TASK_HISTORY_SCREEN_KEY]
    if (!['detail', 'action'].includes(currentScreen)) return
    const currentDepth = Number(
      currentState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0
    )
    if (currentDepth > 0 && window.history.length > currentDepth) {
      currentTaskScreenRef.current = ''
      window.history.go(-currentDepth)
      return
    }
    window.history.replaceState(
      {
        ...currentState,
        [MOBILE_TASK_HISTORY_SCREEN_KEY]: '',
        [MOBILE_TASK_HISTORY_DEPTH_KEY]: 0,
        [MOBILE_TASK_HISTORY_TASK_KEY]: null,
        [MOBILE_TASK_HISTORY_ACTION_KEY]: '',
        [MOBILE_TASK_HISTORY_RECEIPT_KEY]: null,
        [MOBILE_TASK_HISTORY_REASON_KEY]: '',
      },
      ''
    )
    currentTaskScreenRef.current = ''
  }, [
    activeMainTabKey,
    actionReceipt,
    actionReceiptRetryable,
    activeTaskSlot.error,
    activeTaskSlot.has_more,
    activeTaskSlot.items.length,
    activeTaskSlot.loaded,
    activeTaskSlot.loading,
    activeTaskViewKey,
    filteredTasks,
    historyRestoreItemLimit,
    loadTaskView,
    receiptDetailTask,
    isLinkedSelection,
    selectedTaskID,
    returnedTaskID,
  ])

  const receiptHistoryKeyRef = useRef('')

  const pushMobileTaskScreen = useCallback(
    ({ action = '', receipt = null, screen, taskID = null, linked = selectedLinkedTaskID === taskID, factForm = false, replace = false }) => {
      if (typeof window === 'undefined') return
      const currentState = window.history.state || {}
      const loadedCounts = readMobileRoleTaskLoadedCounts(
        Object.fromEntries(
          Object.entries(taskScopeStateRef.current.slots).map(
            ([viewKey, slot]) => [viewKey, slot.items.length]
          )
        ),
        { maxItems: MOBILE_TASK_RESTORE_ITEM_LIMIT }
      )
      historyLoadedTaskCountsRef.current = loadedCounts
      const sameScreen =
        currentState[MOBILE_TASK_HISTORY_SCREEN_KEY] === screen &&
        String(currentState[MOBILE_TASK_HISTORY_TASK_KEY] || '') ===
          String(taskID || '')
      const replaceScreen = sameScreen || replace
      const nextState = {
        ...currentState,
        [MOBILE_TASK_HISTORY_FACT_FORM_KEY]: factForm,
        [MOBILE_TASK_HISTORY_SCREEN_KEY]: screen,
        [MOBILE_TASK_HISTORY_DEPTH_KEY]: replaceScreen
          ? Number(currentState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0)
          : Number(currentState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0) + 1,
        [MOBILE_TASK_HISTORY_TASK_KEY]: taskID,
        [MOBILE_TASK_HISTORY_LINKED_KEY]: linked ? taskID : null,
        [MOBILE_TASK_HISTORY_ACTION_KEY]: action,
        [MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY]: '',
        [MOBILE_TASK_HISTORY_RECEIPT_KEY]: receipt,
        [MOBILE_TASK_HISTORY_MAIN_TAB_KEY]: activeMainTabKey,
        [MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY]: activeMessageTabKey,
        [MOBILE_TASK_HISTORY_FILTER_KEY]: activeFilterKey,
        [MOBILE_TASK_HISTORY_KEYWORD_KEY]: taskKeyword,
        [MOBILE_TASK_HISTORY_SORT_KEY]: taskSortKey,
        [MOBILE_TASK_HISTORY_STATUS_KEY]: taskStatusKey,
        [MOBILE_TASK_HISTORY_DATES_KEY]: { period: taskPeriod, dateFrom: taskDateFrom, dateTo: taskDateTo },
        [MOBILE_TASK_HISTORY_QUERY_PAGES_KEY]: taskQueryOptionsByPage,
        mobileRoleTasksDiscovery: { ...normalizeTaskDiscoveryFilters(taskQueryOptions), ...normalizeTaskListFilters(taskQueryOptions) },
        [MOBILE_TASK_HISTORY_SCROLL_TOP_KEY]: listScrollTopRef.current,
        [MOBILE_TASK_HISTORY_LIST_LIMITS_KEY]: visibleListLimitsByKey,
        [MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY]: loadedCounts,
        [MOBILE_TASK_HISTORY_SCOPE_KEY]: taskScopeKey,
      }
      if (replaceScreen) {
        window.history.replaceState(nextState, '')
        currentTaskScreenRef.current = screen
        return
      }
      window.history.pushState(nextState, '')
      currentTaskScreenRef.current = screen
    },
    [
      selectedLinkedTaskID,
      activeFilterKey,
      activeMainTabKey,
      activeMessageTabKey,
      taskKeyword,
      taskSortKey,
      taskStatusKey,
      taskPeriod,
      taskDateFrom,
      taskDateTo,
      taskQueryOptionsByPage,
      taskQueryOptions,
      taskScopeKey,
      visibleListLimitsByKey,
    ]
  )

  const handleSelectTaskID = useCallback(
    (taskID, { linked = false } = {}) => {
      setTaskFormMode(false)
      setTaskFormReceipt(null)
      setSelectedLinkedTaskID(linked ? taskID : null)
      restoringHistoryTaskRef.current = false
      receiptDetailSnapshotRef.current = null
      setReceiptDetailSnapshot(null)
      if (taskID !== null && taskID !== undefined) {
        taskViewRestoreTargetRef.current[activeTaskViewKey] = 0
        taskViewRestoreAppendCountRef.current[activeTaskViewKey] = 0
        listScrollTopRef.current = Math.max(
          0,
          Number(scrollContainerRef.current?.scrollTop || 0)
        )
        lastFocusedTaskIDRef.current = taskID
      }
      clearActionReceipt()
      setDetailAction(null)
      setSelectedTaskID(taskID)
      if (taskID !== null && taskID !== undefined) {
        pushMobileTaskScreen({ screen: 'detail', taskID, linked })
      }
    },
    [activeTaskViewKey, clearActionReceipt, pushMobileTaskScreen]
  )

  const materialDraftRef = useRef(initialHistoryState[MOBILE_TASK_HISTORY_MATERIAL_DRAFT_KEY] || null)
  const materialDraftScopeRef = useRef(taskAccessScopeKey)
  const materialBusyRef = useRef(false)
  const materialTaskSettled =
    selectedTaskReceipt?.status === 'confirmed' &&
    Boolean(selectedTaskReceipt?.statusLabel)
  useEffect(() => {
    if (materialDraftScopeRef.current !== taskAccessScopeKey) {
      materialDraftRef.current = null
      materialDraftScopeRef.current = taskAccessScopeKey
    }
  }, [taskAccessScopeKey])
  const saveMaterialDraft = useCallback((draft) => {
    materialDraftRef.current = draft
    try {
      window.history.replaceState({
        ...window.history.state,
        [MOBILE_TASK_HISTORY_MATERIAL_DRAFT_KEY]: draft,
      }, '')
    } catch {
      // 浏览器不允许更新历史记录时，仍保留当前页面内的草稿。
    }
  }, [])
  const usesMaterialReviewForm = isEngineeringMaterialTask(selectedTask) && selectedTask.task_group !== 'engineering_material_revision'
  const canProcessMaterial =
    usesMaterialReviewForm &&
    !materialTaskSettled &&
    canProcessEngineeringMaterialTask(adminProfile, selectedTask)
  const setMaterialBusy = useCallback((value) => {
    materialBusyRef.current = value
  }, [])

  const sourceAssignmentAccess = useWorkflowTaskAssignmentAccess({ adminProfile, task: selectedTask, enabled: Boolean(selectedTask && hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_ASSIGN)) })

  const availableActions = useMemo(
    () =>
      workflowTaskHandlingModes([
        selectedCanComplete ? 'done' : '',
        selectedCanBlock ? 'blocked' : '',
        selectedCanResume ? 'resume' : '',
        selectedCanReject ? 'rejected' : '',
        selectedCanUrge ? 'urge' : '',
      ].filter(Boolean)),
    [
      selectedCanBlock,
      selectedCanComplete,
      selectedCanReject,
      selectedCanResume,
      selectedCanUrge,
    ]
  )
  const actionAccessState = selectedTaskActionAccess.loading
    ? MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING
    : selectedTaskActionAccess.failed
      ? MOBILE_TASK_ACTION_ACCESS_STATES.FAILED
      : selectedCanOperate
        ? MOBILE_TASK_ACTION_ACCESS_STATES.ACTIONABLE
        : selectedCanUrge
          ? MOBILE_TASK_ACTION_ACCESS_STATES.URGE_ONLY
          : MOBILE_TASK_ACTION_ACCESS_STATES.READONLY
  const selectedHasActionCapability = useMemo(
    () =>
      hasWorkflowTaskActionCapability(selectedTaskActionAccess, (permission) =>
        hasActionPermission(adminProfile, permission)
      ),
    [adminProfile, selectedTaskActionAccess]
  )
  const actionBusy = Boolean(
    selectedTask &&
      (Number(updatingID) === Number(selectedTask.id) ||
        Number(urgingID) === Number(selectedTask.id))
  )

  const handleOpenAction = useCallback(
    (preferredAction = '') => {
      if (!selectedTask) return
      if (canOpenTaskForm && !usesMaterialReviewForm && !preferredAction) {
        retainLinkedTask(selectedTask)
        setSelectedLinkedTaskID(selectedTask.id)
        window.history.replaceState({ ...window.history.state, [MOBILE_TASK_HISTORY_LINKED_KEY]: selectedTask.id }, '')
        setTaskFormMode(true)
        setTaskFormReceipt(null)
        setDetailAction('done')
        pushMobileTaskScreen({ action: 'done', screen: 'action', taskID: selectedTask.id, linked: true, factForm: true })
        return
      }
      setTaskFormMode(false)
      if (canProcessMaterial && preferredAction !== 'urge') {
        setDetailAction('done')
        pushMobileTaskScreen({
          action: 'done',
          screen: 'action',
          taskID: selectedTask.id,
        })
        return
      }
      const nextAction = availableActions.includes(preferredAction)
        ? preferredAction
        : ['resume', 'done', 'blocked', 'rejected', 'urge'].find((action) =>
            availableActions.includes(action)
          )
      if (!nextAction) return
      handleTaskAction(selectedTask, nextAction)
      pushMobileTaskScreen({
        action: nextAction,
        screen: 'action',
        taskID: selectedTask.id,
      })
    },
    [
      availableActions,
      canProcessMaterial,
      usesMaterialReviewForm,
      canOpenTaskForm,
      handleTaskAction,
      pushMobileTaskScreen,
      retainLinkedTask,
      selectedTask,
    ]
  )

  const handleOpenSelectedTaskAction = useCallback(
    (preferredAction = '') =>
      handleOpenAction(
        preferredAction ||
          (selectedTaskReceiptRetryable
            ? selectedTaskReceipt?.action || ''
            : '')
      ),
    [
      handleOpenAction,
      selectedTaskReceipt?.action,
      selectedTaskReceiptRetryable,
    ]
  )

  const handleOpenRecordedAction = useCallback((target = detailTask) => {
    if (!target || !isTerminalWorkflowTask(target) || materialBusyRef.current) return
    retainLinkedTask(target)
    setSelectedLinkedTaskID(target.id)
    setSelectedTaskID(target.id)
    clearActionReceipt()
    setTaskFormMode(false)
    setDetailAction('done')
    pushMobileTaskScreen({ action: 'done', screen: 'action', taskID: target.id, linked: true })
  }, [clearActionReceipt, detailTask, pushMobileTaskScreen, retainLinkedTask])

  const openTaskForm = () => {
    const current = selectedTask || taskFormReceipt?.task || actionReceipt?.task
    if (!current || !resolveMobileTaskBusinessEntry(current) || !workflowTaskBusinessContract(current).containedBusiness) return
    flushMobileTaskDraftHistory()
    clearActionReceipt()
    retainLinkedTask(current)
    setSelectedLinkedTaskID(current.id)
    window.history.replaceState({ ...window.history.state, [MOBILE_TASK_HISTORY_LINKED_KEY]: current.id }, '')
    setSelectedTaskID(current.id)
    setTaskFormReceipt((receipt) => receipt?.scopeKey === taskScopeKey && receipt.task.id === current.id ? receipt : null)
    setTaskFormMode(true)
    setDetailAction('done')
    pushMobileTaskScreen({ action: 'done', screen: 'action', taskID: current.id, linked: true, factForm: true, replace: currentTaskScreenRef.current === 'receipt' })
  }

  const handleScreenBack = useCallback((screen, fallback) => {
    if (
      typeof window !== 'undefined' &&
      window.history.state?.[MOBILE_TASK_HISTORY_SCREEN_KEY] === screen &&
      Number(window.history.state?.[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0) > 0
    ) {
      window.history.back()
      return
    }
    fallback()
  }, [])

  const handleDetailBack = useCallback(async () => {
    const willPop = window.history.state?.[MOBILE_TASK_HISTORY_SCREEN_KEY] === 'detail' && Number(window.history.state?.[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0) > 0
    if (!willPop && taskFormLeaveGuard.current && !(await taskFormLeaveGuard.current())) return
    clearMobileTaskDraftBackup(taskScopeKey, selectedTaskID)
    receiptDetailSnapshotRef.current = null
    setReceiptDetailSnapshot(null)
    handleScreenBack('detail', () => {
      restoreListStateRef.current = true
      clearActionReceipt()
      setDetailAction(null)
      setSelectedTaskID(null)
      currentTaskScreenRef.current = ''
    })
  }, [clearActionReceipt, handleScreenBack, selectedTaskID, taskScopeKey])
  useEffect(() => {
    if (!sharedHandlingID || selectedTask?.id !== sharedHandlingID || selectedTaskActionAccess.loading || selectedTaskActionAccess.source === 'fallback_checking') return
    setSharedHandlingID(null)
    if (selectedTaskActionAccess.source === 'backend' && selectedTaskActionAccess.canHandle) handleOpenSelectedTaskAction()
    else handleDetailBack()
  }, [sharedHandlingID, selectedTask?.id, selectedTaskActionAccess, handleOpenSelectedTaskAction, handleDetailBack])
  const handleActionBack = useCallback(async () => {
    if (materialBusyRef.current) return
    flushMobileTaskDraftHistory()
    handleScreenBack('action', () => {
      setTaskFormMode(false)
      setDetailAction(null)
      currentTaskScreenRef.current = 'detail'
    })
  }, [flushMobileTaskDraftHistory, handleScreenBack])
  const handleReceiptBackToList = useCallback(() => {
    restoreListStateRef.current = true
    receiptDetailSnapshotRef.current = null
    setReceiptDetailSnapshot(null)
    if (typeof window !== 'undefined') {
      const depth = Number(
        window.history.state?.[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0
      )
      if (depth > 0) {
        window.history.go(-depth)
        return
      }
    }
    clearActionReceipt()
    setTaskFormReceipt(null)
    setTaskFormMode(false)
    setDetailAction(null)
    setSelectedTaskID(null)
    currentTaskScreenRef.current = ''
  }, [clearActionReceipt])
  const handleViewTaskFromReceipt = useCallback(() => {
    const receiptTaskID = actionReceipt?.task?.id
    if (!receiptTaskID) return
    receiptDetailSnapshotRef.current = actionReceipt
    setReceiptDetailSnapshot(actionReceipt)
    setSelectedTaskID(receiptTaskID)
    if (
      typeof window !== 'undefined' &&
      window.history.state?.[MOBILE_TASK_HISTORY_SCREEN_KEY] === 'receipt' &&
      Number(window.history.state?.[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0) > 0
    ) {
      receiptBackIntentRef.current = 'detail'
      window.history.back()
      return
    }
    clearActionReceipt()
    setDetailAction(null)
    currentTaskScreenRef.current = 'detail'
  }, [actionReceipt, clearActionReceipt])

  const handleReturnToActionFromReceipt = useCallback(() => {
    const receiptAction = String(actionReceipt?.action || '').trim()
    if (
      !selectedTask ||
      !receiptAction ||
      !availableActions.includes(receiptAction)
    ) {
      return
    }
    clearActionReceipt()
    handleTaskAction(selectedTask, receiptAction)
    if (typeof window !== 'undefined') {
      const currentState = window.history.state || {}
      window.history.replaceState(
        {
          ...currentState,
          [MOBILE_TASK_HISTORY_SCREEN_KEY]: 'action',
          [MOBILE_TASK_HISTORY_ACTION_KEY]: receiptAction,
          [MOBILE_TASK_HISTORY_RECEIPT_KEY]: null,
        },
        ''
      )
    }
    currentTaskScreenRef.current = 'action'
  }, [
    actionReceipt?.action,
    availableActions,
    clearActionReceipt,
    handleTaskAction,
    selectedTask,
  ])

  const selectedTaskBusinessReceipt = taskFormReceipt?.scopeKey === taskScopeKey && taskFormReceipt.task.id === selectedTaskID ? taskFormReceipt : null
  const showTaskBusinessReceipt = useCallback((receipt) => {
    setTaskFormReceipt({ ...receipt, scopeKey: taskScopeKey })
    setTaskFormMode(false)
    const state = window.history.state || {}
    window.history.replaceState({ ...state, [MOBILE_TASK_HISTORY_SCREEN_KEY]: 'receipt', [MOBILE_TASK_HISTORY_RECEIPT_KEY]: null, [MOBILE_TASK_HISTORY_FACT_FORM_KEY]: false }, '')
    currentTaskScreenRef.current = 'receipt'
  }, [taskScopeKey])

  const handleViewSelectedTaskReceipt = useCallback(async () => {
    if (selectedTaskBusinessReceipt) {
      showTaskBusinessReceipt(selectedTaskBusinessReceipt)
      return
    }
    showTaskReceipt(selectedTask)
  }, [selectedTask, showTaskReceipt, selectedTaskBusinessReceipt, showTaskBusinessReceipt])

  useEffect(() => {
    if (!actionReceipt) {
      receiptHistoryKeyRef.current = ''
      return
    }
    if (actionReceipt.status === 'confirmed') clearMobileTaskDraftBackup(taskScopeKey, actionReceipt.task?.id)
    const receiptKey = `${actionReceipt.status || ''}:${actionReceipt.action || ''}:${actionReceipt.task?.id || ''}:${actionReceipt.task?.version || ''}:${actionReceipt.message || ''}`
    if (receiptHistoryKeyRef.current === receiptKey) return
    receiptHistoryKeyRef.current = receiptKey
    flushMobileTaskDraftHistory()
    if (typeof window === 'undefined') return
    const currentState = window.history.state || {}
    const nextState = {
      ...currentState,
      [MOBILE_TASK_HISTORY_SCREEN_KEY]: 'receipt',
      [MOBILE_TASK_HISTORY_TASK_KEY]: actionReceipt.task?.id || selectedTaskID,
      [MOBILE_TASK_HISTORY_ACTION_KEY]: actionReceipt.action || '',
      [MOBILE_TASK_HISTORY_RECEIPT_KEY]: actionReceipt,
    }
    if (currentState[MOBILE_TASK_HISTORY_SCREEN_KEY] === 'action') {
      window.history.replaceState(nextState, '')
      currentTaskScreenRef.current = 'receipt'
      return
    }
    pushMobileTaskScreen({
      action: actionReceipt.action || '',
      receipt: actionReceipt,
      screen: 'receipt',
      taskID: actionReceipt.task?.id || selectedTaskID,
    })
  }, [
    actionReceipt,
    flushMobileTaskDraftHistory,
    pushMobileTaskScreen,
    selectedTaskID,
    taskScopeKey,
  ])

  useEffect(() => {
    let active = true
    const handlePopState = async (event) => {
      const historyState = event.state || {}
      const targetScreen = historyState[MOBILE_TASK_HISTORY_SCREEN_KEY]
      const targetTaskID = historyState[MOBILE_TASK_HISTORY_TASK_KEY]
      const sameTaskStep = isMobileRoleTaskHistoryScope(historyState, taskScopeKey) && targetTaskID === selectedTaskID && ['detail', 'action', 'receipt'].includes(targetScreen)
      if (!sameTaskStep && taskFormLeaveGuard.current) {
        const allowed = await taskFormLeaveGuard.current()
        if (!active) return
        if (!allowed) { window.history.forward(); return }
      }
      if (!sameTaskStep) setTaskFormReceipt(null)
      setTaskFormMode(isMobileRoleTaskHistoryScope(historyState, taskScopeKey) && historyState[MOBILE_TASK_HISTORY_FACT_FORM_KEY] === true)
      setSelectedLinkedTaskID(isMobileRoleTaskHistoryScope(historyState, taskScopeKey) ? historyState[MOBILE_TASK_HISTORY_LINKED_KEY] || null : null)
      const previousScreen = currentTaskScreenRef.current
      if (previousScreen === 'action' && materialBusyRef.current) {
        if (targetScreen !== 'action') window.history.forward()
        return
      }
      if (previousScreen === 'action') {
        backupMobileTaskDraft()
      }
      if (!isMobileRoleTaskHistoryScope(historyState, taskScopeKey)) {
        receiptBackIntentRef.current = ''
        currentTaskScreenRef.current = ''
        restoringHistoryTaskRef.current = false
        restoreListStateRef.current = true
        receiptDetailSnapshotRef.current = null
        historyLoadedTaskCountsRef.current = {}
        clearActionReceipt()
        setReceiptDetailSnapshot(null)
        setSelectedTaskID(null)
        setDetailAction(null)
        window.history.replaceState(
          {
            ...historyState,
            [MOBILE_TASK_HISTORY_SCREEN_KEY]: '',
            [MOBILE_TASK_HISTORY_DEPTH_KEY]: 0,
            [MOBILE_TASK_HISTORY_TASK_KEY]: null,
            [MOBILE_TASK_HISTORY_ACTION_KEY]: '',
            [MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY]: '',
            [MOBILE_TASK_HISTORY_RECEIPT_KEY]: null,
            [MOBILE_TASK_HISTORY_REASON_KEY]: '',
            [MOBILE_TASK_HISTORY_LIST_LIMITS_KEY]: {},
            [MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY]: {},
            [MOBILE_TASK_HISTORY_SCOPE_KEY]: taskScopeKey,
          },
          ''
        )
        return
      }
      historyLoadedTaskCountsRef.current = readMobileRoleTaskLoadedCounts(
        historyState[MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY],
        { maxItems: MOBILE_TASK_RESTORE_ITEM_LIMIT }
      )
      const viewingReceiptDetail =
        previousScreen === 'receipt' &&
        targetScreen === 'detail' &&
        receiptBackIntentRef.current === 'detail'
      if (
        previousScreen === 'receipt' &&
        targetScreen === 'detail' &&
        receiptBackIntentRef.current !== 'detail'
      ) {
        receiptBackIntentRef.current = ''
        const targetDepth = Math.max(
          1,
          Number(historyState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0)
        )
        window.history.go(-targetDepth)
        return
      }
      receiptBackIntentRef.current = ''
      currentTaskScreenRef.current = targetScreen || ''
      clearActionReceipt()
      if (targetScreen === 'receipt') {
        receiptDetailSnapshotRef.current = null
        setReceiptDetailSnapshot(null)
        restoringHistoryTaskRef.current = Boolean(targetTaskID)
        setSelectedTaskID(targetTaskID || null)
        setDetailAction(null)
        restoreActionReceipt(historyState[MOBILE_TASK_HISTORY_RECEIPT_KEY])
        return
      }
      if (targetScreen === 'action') {
        receiptDetailSnapshotRef.current = null
        setReceiptDetailSnapshot(null)
        const targetAction =
          historyState[MOBILE_TASK_HISTORY_ACTION_KEY] || null
        const backup = readMobileTaskDraftBackup(taskScopeKey, targetTaskID)
        const backupMatchesAction =
          backup && backup.action === String(targetAction || '')
        const reason = backupMatchesAction
          ? backup.reason
          : historyState[MOBILE_TASK_HISTORY_REASON_KEY] || ''
        const approvedQuantity = backupMatchesAction
          ? backup.approvedQuantity
          : historyState[MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY] || ''
        restoringHistoryTaskRef.current = Boolean(targetTaskID)
        setSelectedTaskID(targetTaskID || null)
        restoreActionDraft({
          action: targetAction,
          approvedQuantity,
          reason,
          taskID: targetTaskID,
        })
        setDetailAction(targetAction)
        if (backupMatchesAction) {
          try {
            window.history.replaceState(
              {
                ...historyState,
                [MOBILE_TASK_HISTORY_APPROVED_QUANTITY_KEY]: approvedQuantity,
                [MOBILE_TASK_HISTORY_REASON_KEY]: reason,
              },
              ''
            )
            clearMobileTaskDraftBackup(taskScopeKey, targetTaskID)
          } catch {
            // Keep the session backup so an action-screen reload can retry it.
          }
        }
        return
      }
      if (targetScreen === 'detail') {
        if (!viewingReceiptDetail) {
          receiptDetailSnapshotRef.current = null
          setReceiptDetailSnapshot(null)
        }
        restoringHistoryTaskRef.current = Boolean(targetTaskID)
        setSelectedTaskID(targetTaskID || null)
        setDetailAction(null)
        return
      }
      restoreListStateRef.current = true
      restoringHistoryTaskRef.current = false
      receiptDetailSnapshotRef.current = null
      setReceiptDetailSnapshot(null)
      setSelectedTaskID(null)
      setDetailAction(null)
    }
    window.addEventListener('popstate', handlePopState)
    return () => { active = false; window.removeEventListener('popstate', handlePopState) }
  }, [
    backupMobileTaskDraft,
    clearActionReceipt,
    restoreActionDraft,
    restoreActionReceipt,
    taskScopeKey,
    selectedTaskID,
  ])

  const receiptResetKey = `${activeMainTabKey}|${taskScopeKey}`
  const previousReceiptResetKeyRef = useRef(receiptResetKey)
  useEffect(() => {
    if (previousReceiptResetKeyRef.current === receiptResetKey) return
    previousReceiptResetKeyRef.current = receiptResetKey
    receiptDetailSnapshotRef.current = null
    setReceiptDetailSnapshot(null)
    clearActionReceipt()
  }, [clearActionReceipt, receiptResetKey])

  const handleMainScroll = useCallback((event) => {
    const scrollTop = Math.max(0, Number(event.currentTarget.scrollTop || 0))
    listScrollTopRef.current = scrollTop
  }, [])

  useLayoutEffect(() => {
    if (
      !restoreListStateRef.current ||
      selectedTaskID !== null ||
      actionReceipt
    ) {
      return
    }
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return
    const maximumScrollTop = Math.max(
      0,
      scrollContainer.scrollHeight - scrollContainer.clientHeight
    )
    const restoredScrollTop = Math.min(
      listScrollTopRef.current,
      maximumScrollTop
    )
    scrollContainer.scrollTop = restoredScrollTop
    const focusedTaskID = String(lastFocusedTaskIDRef.current || '')
    const taskCard = Array.from(
      scrollContainer.querySelectorAll('[data-mobile-task-id]')
    ).find((card) => card.dataset.mobileTaskId === focusedTaskID)
    const focusTarget =
      taskCard?.querySelector('.erp-task-card__open') ||
      scrollContainer.querySelector('[data-testid="mobile-role-list-heading"]')
    // 条件重读只恢复列表位置，保留搜索框或筛选面板内的操作焦点。
    const searchHasFocus = scrollContainer
      .querySelector('[role="search"]')
      ?.contains(document.activeElement)
    const filterHasFocus = document.activeElement?.closest('.mobile-filter-panel, .mobile-filter-control, .mobile-applied-filters, .mobile-role-task-filters')
    if (!searchHasFocus && !filterHasFocus) focusTarget?.focus({ preventScroll: true })
    restoreListStateRef.current = false
  }, [
    actionReceipt,
    activeFilterKey,
    activeMainTabKey,
    activeMessageTabKey,
    filteredTasks.length,
    selectedTaskID,
    visibleListLimitsByKey,
  ])

  useEffect(() => {
    if (selectedTaskID || actionReceipt) return
    window.history.replaceState(
      {
        ...window.history.state,
        [MOBILE_TASK_HISTORY_MAIN_TAB_KEY]: activeMainTabKey,
        [MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY]: activeMessageTabKey,
        [MOBILE_TASK_HISTORY_FILTER_KEY]: activeFilterKey,
        [MOBILE_TASK_HISTORY_SCOPE_KEY]: taskScopeKey,
        [MOBILE_TASK_HISTORY_KEYWORD_KEY]: taskKeyword,
        [MOBILE_TASK_HISTORY_SORT_KEY]: taskSortKey,
        [MOBILE_TASK_HISTORY_STATUS_KEY]: taskStatusKey,
        [MOBILE_TASK_HISTORY_DATES_KEY]: { period: taskPeriod, dateFrom: taskDateFrom, dateTo: taskDateTo },
        [MOBILE_TASK_HISTORY_QUERY_PAGES_KEY]: taskQueryOptionsByPage,
        mobileRoleTasksDiscovery: { ...normalizeTaskDiscoveryFilters(taskQueryOptions), ...normalizeTaskListFilters(taskQueryOptions) },
      },
      ''
    )
  }, [
    activeMainTabKey,
    activeMessageTabKey,
    activeFilterKey,
    taskScopeKey,
    location.search,
    taskKeyword,
    taskSortKey,
    taskStatusKey,
    taskPeriod,
    taskDateFrom,
    taskDateTo,
    taskQueryOptionsByPage,
    taskQueryOptions,
    selectedTaskID,
    actionReceipt,
  ])

  const taskDetailBackLabel =
    activeMainTabKey === MOBILE_MAIN_TAB_KEYS.EXCEPTIONS
      ? window.history.state?.mobileWorkflowExceptions?.query?.view === 'tasks'
        ? '返回关联待办'
        : '返回异常跟踪'
      : activeMainTabKey === MOBILE_MAIN_TAB_KEYS.TRACKING
      ? '返回流程跟踪'
      : activeMainTabKey === MOBILE_MAIN_TAB_KEYS.PROGRESS
      ? window.history.state?.mobileProgress?.selection
        ? '返回进度详情'
        : '返回进度'
      : '返回任务列表'

  if (
    (isLinkedSelection) &&
    selectedTaskID &&
    !selectedTask &&
    !actionReceipt
  ) {
    return (
      <section
        className="mobile-role-tasks-page mobile-linked-task-feedback"
        aria-label="关联任务"
      >
        <button type="button" onClick={handleDetailBack}>
          {taskDetailBackLabel}
        </button>
        <p role={linkedTask?.error ? 'alert' : 'status'}>
          {linkedTask?.error || '正在读取关联任务…'}
        </p>
        {linkedTask?.error && (
          <button type="button" onClick={() => loadLinkedTask(selectedTaskID)}>
            重试
          </button>
        )}
      </section>
    )
  }

  const sourceCollaborationActions = workflowTaskCollaborationModes([
    ...(selectedCanComplete ? ['complete'] : []),
    ...(selectedCanBlock ? ['block'] : []),
    ...(selectedCanReject ? ['reject'] : []),
    ...(selectedCanResume ? ['resume'] : []),
    ...(selectedCanUrge ? ['urge'] : []),
    ...(sourceAssignmentAccess.can_reassign ? ['assign'] : []),
  ]).map((mode) => ({ key: mode, label: getWorkflowTaskActionMeta(selectedTask, mode).title, onClick: (trigger) => { collaborationTriggerRef.current = trigger; setCollaborationOpen(mode) } }))

  const renderTaskAction = (preloadSource = false) => (
    <MobileTaskActionScreen
      collaborationActions={sourceCollaborationActions}
      taskBusinessForm={taskFormMode || preloadSource}
      canManageAttachments={selectedCanOperate && hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_UPDATE)}
      renderSourceAction={
        (taskFormMode || preloadSource) ? (render) => <Outlet
          key={`${taskAccessScopeKey}:${selectedTask.id}`}
          context={{ ...shellContext,
taskFactHandling: {
            task: selectedTask,
profile: adminProfile,
roleKey: activeRoleKey,
render,
            registerLeaveGuard: (guard) => { taskFormLeaveGuard.current = guard },
            onBusyChange: setMaterialBusy,
            collaborationExternal: true,
            onTaskRead: retainLinkedTask,
            onBack: handleActionBack,
            onReceipt: (receipt) => {
              showTaskBusinessReceipt(receipt)
              refreshTasksAfterMutation().catch(() => {})
            },
            onOpenTask: (task) => {
              clearActionReceipt()
              retainLinkedTask(task)
              previousSelectedTaskIDRef.current = task.id
              setSelectedLinkedTaskID(task.id)
              setSelectedTaskID(task.id)
              setTaskFormReceipt(null)
              setTaskFormMode(true)
              setDetailAction('done')
              pushMobileTaskScreen({ action: 'done', screen: 'action', taskID: task.id, linked: true, factForm: true })
            },
          } }}
        /> : canProcessMaterial && detailAction !== 'urge'
            ? (render) => (
              <EngineeringMaterialTaskAction
                task={selectedTask}
                profile={adminProfile}
                mobile
                render={render}
                draftRef={materialDraftRef}
                onDraftChange={saveMaterialDraft}
                onBusyChange={setMaterialBusy}
                onChanged={(value, result) => {
                    restoreActionReceipt({
                      task: selectedTask,
                      action: result.action === 'REJECT' ? 'rejected' : 'done',
                      status: 'confirmed',
                      statusLabel: ENGINEERING_MATERIAL_STATUS[value.status],
                      reason: result.reason,
                      message: result.successMessage,
                      scope_key: taskScopeKey,
                    })
                    refreshTasksAfterMutation().catch(() => {})
                  }}
              />
              )
            : null
        }
      accessMessage={selectedTaskActionAccess.readonlyReason}
      accessState={actionAccessState}
      approvedQuantity={detailApprovedQuantityValue}
      availableActions={availableActions}
      busy={actionBusy}
      canViewReceipt={Boolean(selectedTaskReceipt || selectedTaskBusinessReceipt)}
      hasActionCapability={selectedHasActionCapability}
      onActionChange={(action) => handleTaskAction(selectedTask, action)}
      onApprovedQuantityChange={updateDetailApprovedQuantity}
      onBack={handleActionBack}
      onOpenTaskForm={!taskFormMode && canOpenTaskForm ? openTaskForm : null}
      onReasonChange={updateDetailReason}
      onRetryAccess={selectedTaskActionAccess.retry}
      onSubmit={submitDetailAction}
      onViewReceipt={
          selectedTaskReceipt || selectedTaskBusinessReceipt ? handleViewSelectedTaskReceipt : null
        }
      reason={detailReasonValue}
      recordedReceipt={selectedTaskReceipt}
      selectedAction={detailAction}
      task={selectedTask}
    />
  )
  const renderTaskDetail = () => {
    const receiptSnapshotOnly = Boolean(receiptDetailTask && !selectedTask)
    return (
      <MobileTaskDetailScreen
        onOpenLinkedTask={(task) => handleSelectTaskID(task.id, { linked: true })}
        backLabel={taskDetailBackLabel}
        actionAccess={
          receiptSnapshotOnly
            ? {
                failed: false,
                loading: false,
                readonlyReason:
                  '本次办理已经结束，当前按可信结果回执只读展示。',
              }
            : selectedTaskActionAccess
        }
        onBack={handleDetailBack}
        processingComplete={receiptSnapshotOnly || materialTaskSettled}
        onOpenAction={receiptSnapshotOnly ? null : handleOpenSelectedTaskAction}
        onOpenRecordedAction={isTerminalWorkflowTask(detailTask) && !canOpenTaskForm ? () => handleOpenRecordedAction(detailTask) : null}
        onOpenTaskForm={!receiptSnapshotOnly && canOpenTaskForm && !usesMaterialReviewForm ? openTaskForm : null}
        onViewReceipt={
          receiptSnapshotOnly && receiptDetailSnapshot
            ? () => restoreActionReceipt(receiptDetailSnapshot)
            : selectedTaskReceipt
              ? () => showTaskReceipt(selectedTask)
              : null
        }
        roleLabel={roleLabel}
        savedEvidenceRefs={
          receiptSnapshotOnly &&
          Array.isArray(receiptDetailSnapshot?.evidence_refs)
            ? receiptDetailSnapshot.evidence_refs
            : savedEvidenceRefs
        }
        selectedCanManageAttachments={
          receiptSnapshotOnly
            ? false
            : selectedCanOperate &&
              hasActionPermission(adminProfile, PermissionCode.WORKFLOW_TASK_UPDATE)
        }
        selectedHasActionCapability={
          receiptSnapshotOnly ? false : selectedHasActionCapability
        }
        selectedCanOperate={receiptSnapshotOnly ? false : selectedCanOperate}
        selectedCanUrge={receiptSnapshotOnly ? false : selectedCanUrge}
        selectedSeverity={detailSeverity}
        selectedTask={detailTask}
      />
    )
  }

  const stepTask = detailTask || actionReceipt?.task || selectedTaskBusinessReceipt?.task
  const renderTaskStep = (step, content) => <MobileTaskStepPanels scopeKey={`${taskAccessScopeKey}:${stepTask?.id}`} version={stepTask?.version} activeStep={step} panels={canOpenTaskForm && selectedTask && !usesMaterialReviewForm ? { detail: renderTaskDetail(), action: renderTaskAction(true) } : undefined} overlay={collaborationOpen && selectedTask ? <BusinessTaskActions collaborationTask={selectedTask} collaborationAction={collaborationOpen} adminProfile={adminProfile} allowCreate={false} onCollaborationClose={() => { setCollaborationOpen(''); if (collaborationTriggerRef.current?.isConnected) collaborationTriggerRef.current.focus({ preventScroll: true }) }} onCreated={(updated) => { retainLinkedTask(updated); setSelectedLinkedTaskID(updated.id); refreshTasksAfterMutation().catch(() => {}) }} /> : null}>{content}</MobileTaskStepPanels>

  if (selectedTaskBusinessReceipt && !taskFormMode && detailAction) {
    const current = selectedTaskBusinessReceipt
    return renderTaskStep('receipt', <MobileTaskReceiptScreen
      profile={adminProfile}
      businessResult
      businessReceipt={current}
      outcome="confirmed"
      message={current.message}
      recordNo={current.recordNo}
      task={current.task}
      statusLabel={resolveMobileTaskStatusLabel(current.task)}
      onOpenTaskForm={openTaskForm}
      onBackToList={handleReceiptBackToList}
      onViewTask={() => {
      retainLinkedTask(current.task)
      setSelectedLinkedTaskID(current.task.id)
      setDetailAction(null)
      receiptBackIntentRef.current = 'detail'
      handleScreenBack('receipt', () => { setTaskFormMode(false); currentTaskScreenRef.current = 'detail' })
    }}
    />)
  }

  if (actionReceipt) {
    const receiptTaskRecoveryPending = Boolean(
      actionReceiptRetryable && selectedTaskID && !selectedTask
    )
    return renderTaskStep('receipt', (
      <MobileTaskReceiptScreen
        profile={adminProfile}
        action={actionReceipt.action}
        backLabel={
          isLinkedTaskTab(activeMainTabKey)
            ? taskDetailBackLabel
            : null
        }
        busy={actionBusy}
        evidenceRefs={actionReceipt.evidence_refs}
        feedback={actionReceipt.feedback}
        message={actionReceipt.message}
        statusLabel={actionReceipt.statusLabel}
        onBackToList={handleReceiptBackToList}
        onOpenTaskForm={['confirmed', 'recorded'].includes(actionReceipt.status) && resolveMobileTaskBusinessEntry(actionReceipt.task) && workflowTaskBusinessContract(actionReceipt.task).containedBusiness ? openTaskForm : null}
        onOpenProcess={
          isTerminalWorkflowTask(actionReceipt.task)
            ? () => handleOpenRecordedAction(actionReceipt.task)
            : actionReceiptRetryable &&
          selectedTask &&
          availableActions.includes(actionReceipt.action)
            ? handleReturnToActionFromReceipt
            : null
        }
        onRetryConfirm={
          !actionReceiptRetryable || !selectedTask || !detailAction
            ? null
            : submitDetailAction
        }
        onRetryTaskLoad={
          receiptTaskRecoveryPending && activeTaskSlot.error
            ? () => refreshTasksAfterMutation().catch(() => {})
            : null
        }
        onViewTask={actionReceipt.task ? handleViewTaskFromReceipt : null}
        outcome={actionReceipt.status}
        reason={actionReceipt.reason}
        task={actionReceipt.task}
        taskRecoveryBusy={receiptTaskRecoveryPending && activeTaskSlot.loading}
        taskRecoveryError={
          receiptTaskRecoveryPending ? activeTaskSlot.error : ''
        }
        taskRecoveryPending={receiptTaskRecoveryPending}
      />
    ))
  }

  if (selectedTask && detailAction) {
    return renderTaskStep('action', renderTaskAction())
  }

  if (detailTask) {
    return renderTaskStep('detail', renderTaskDetail())
  }

  return (
    <>
      <WorkflowTaskLinkDrawer
        profile={adminProfile}
        autoOpenRef={sharedLinkAutoRef}
        onOpenTask={(task, handle) => {
        setSharedHandlingID(handle ? task.id : null)
        retainLinkedTask(task)
        handleSelectTaskID(task.id, { linked: true })
      }}
      />
      <MobileTaskListScreen
        calendarState={calendarState}
        key={taskAccessScopeKey}
        progressAccess={progressAccess}
        accessScopeKey={taskAccessScopeKey}
        activeRoleKey={activeRoleKey}
        onOpenLinkedTask={(taskID) => handleSelectTaskID(taskID, { linked: true })}
        activeFilterKey={visibleActiveFilterKey}
        activeMainTabKey={activeMainTabKey}
        activeMessageTabKey={activeMessageTabKey}
        activeViewHasData={activeTaskSlot.items.length > 0}
        activeViewHasMore={activeTaskSlot.has_more}
        activeViewLoaded={activeTaskSlot.loaded}
        activeTasks={activeTasks}
        adminProfile={adminProfile}
        approvalTasks={approvalTasks}
        authoritativeTaskCounts={authoritativeTaskCounts}
        taskStatusCounts={activeTaskSlot.error ? null : activeTaskSlot.status_counts}
        canViewApprovalInbox={canViewApprovalInbox}
        canViewTracking={canViewTracking}
        canEnterDesktop={canEnterDesktop === true}
        doneTasks={doneTasks}
        filterItems={filterItems}
        filteredTasks={filteredTasks}
        handleLogout={handleLogout}
        mobileRoleOptions={mobileRoleOptions}
        handleSwitchMobileRole={handleSwitchMobileRole}
        handleOpenLegalNotice={() =>
        navigate('/legal/privacy', {
          state: {
            from: `${location.pathname}${location.search}${location.hash}`,
          },
        })
      }
        handleMainScroll={handleMainScroll}
        handleSwitchEntry={() => navigate('/entry')}
        initialLoading={initialLoading}
        loadError={activeTaskSlot.error}
        loadTasks={loadTasks}
        loadMoreActiveView={loadMoreActiveTaskView}
        loading={loading}
        loadingMore={loading && activeTaskSlot.items.length > 0}
        loggingOut={loggingOut}
        riskTasks={riskTasks}
        riskScope={riskScope}
        roleLabel={roleLabel}
        runtimeBuildIdentity={runtimeBuildIdentity}
        serverDataTime={serverDataTime}
        refreshScopeKey={`${taskScopeKey}|${activeTaskViewKey}`}
        scrollContainerRef={scrollContainerRef}
        selectedTask={selectedTask}
        setActiveFilterKey={changeTaskFilter}
        setActiveMainTabKey={setActiveMainTabKey}
        setActiveMessageTabKey={changeRiskFilter}
        setDetailAction={setDetailAction}
        setSelectedTaskID={handleSelectTaskID}
        setVisibleListLimitsByKey={setVisibleListLimitsByKey}
        taskKeyword={taskKeyword}
        taskSortKey={taskSortKey}
        taskStatusKey={taskStatusKey}
        taskHistoryOptions={taskQueryOptions}
        onTaskListOptionsChange={(options) => {
          if (Object.hasOwn(options, 'due')) {
            if (activeTaskQueryPageKey === MOBILE_TASK_QUERY_PAGE_KEYS.TASKS && activeFilterKey === MOBILE_TASK_FILTER_KEYS.OVERDUE) setActiveFilterKey(MOBILE_TASK_FILTER_KEYS.ALL)
            if (activeTaskQueryPageKey === MOBILE_TASK_QUERY_PAGE_KEYS.RISKS) setActiveMessageTabKey(MOBILE_MESSAGE_TAB_KEYS.WARNING)
          }
          updateActiveTaskQueryOptions((current) => ({ ...current, ...options }))
        }}
        onSearchTasks={setTaskKeyword}
        visibleListLimitsByKey={visibleListLimitsByKey}
      />
    </>
  )
}
