import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import '../mobileRoleTasks.css'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { listWorkflowRoleTasks } from '../../api/workflowApi.mjs'
import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
  formatMobileTaskTime,
} from '../../utils/mobileTaskView.mjs'
import {
  MOBILE_ROLE_TASK_PAGE_LIMIT,
  MOBILE_ROLE_TASK_VIEW_KEYS,
  buildMobileRoleTaskQuery,
  createMobileRoleTaskScopeState,
  isMobileRoleTaskHistoryScope,
  readMobileRoleTaskLoadedCounts,
  readMobileRoleTaskScopedHistoryState,
  readMobileRoleTaskScopeState,
  reconcileMobileRoleTaskMutation,
  resolveMobileRoleTaskReceiptDetailTask,
  resolveMobileRoleTaskRestoreLimit,
  resolveMobileRoleTaskViewKey,
  resolveMobileRoleTaskViewState,
  settleMobileRoleTaskRequest,
} from '../../utils/mobileTaskQueries.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import { hasActionPermission } from '../../utils/masterDataOrderView.mjs'
import MobileTaskDetailScreen from '../components/MobileTaskDetailScreen.jsx'
import MobileTaskActionScreen from '../components/MobileTaskActionScreen.jsx'
import MobileTaskListScreen from '../components/MobileTaskListScreen.jsx'
import MobileTaskReceiptScreen from '../components/MobileTaskReceiptScreen.jsx'
import useMobileRoleTaskActions from '../hooks/useMobileRoleTaskActions'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import {
  MOBILE_MAIN_TAB_KEYS,
  MOBILE_MESSAGE_TAB_KEYS,
  MOBILE_SCROLL_TOP_VISIBLE_OFFSET,
  MOBILE_TASK_ACTION_ACCESS_STATES,
  MOBILE_TASK_FILTER_KEYS,
  TERMINAL_TASK_STATUS_KEYS,
  canOperateTask,
  getMobileRoleLabel,
  getTaskSeverityView,
  isTaskAlerted,
  isTaskBlockedProgress,
  isTaskDueSoon,
  isTaskHighPriority,
  isTaskOverdue,
  isTaskReadyProgress,
  isTaskRisk,
  resolveLatestTaskTime,
} from '../utils/mobileRoleTaskModel.mjs'

const MOBILE_TASK_HISTORY_SCREEN_KEY = 'mobileRoleTasksScreen'
const MOBILE_TASK_HISTORY_DEPTH_KEY = 'mobileRoleTasksDepth'
const MOBILE_TASK_HISTORY_TASK_KEY = 'mobileRoleTasksTaskID'
const MOBILE_TASK_HISTORY_ACTION_KEY = 'mobileRoleTasksAction'
const MOBILE_TASK_HISTORY_RECEIPT_KEY = 'mobileRoleTasksReceipt'
const MOBILE_TASK_HISTORY_MAIN_TAB_KEY = 'mobileRoleTasksMainTab'
const MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY = 'mobileRoleTasksMessageTab'
const MOBILE_TASK_HISTORY_FILTER_KEY = 'mobileRoleTasksFilter'
const MOBILE_TASK_HISTORY_SCROLL_TOP_KEY = 'mobileRoleTasksScrollTop'
const MOBILE_TASK_HISTORY_LIST_LIMITS_KEY = 'mobileRoleTasksListLimits'
const MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY =
  'mobileRoleTasksLoadedCountsByView'
const MOBILE_TASK_HISTORY_SCOPE_KEY = 'mobileRoleTasksScope'
const MOBILE_TASK_HISTORY_REASON_KEY = 'mobileRoleTasksReason'
const MOBILE_TASK_DRAFT_STORAGE_PREFIX = 'plush-toy-erp:mobile-task-draft:v1:'

const MOBILE_TASK_HISTORY_SCREENS = new Set(['detail', 'action', 'receipt'])
const MOBILE_TASK_RESTORE_PAGE_LIMIT = 20
const MOBILE_TASK_RESTORE_ITEM_LIMIT =
  MOBILE_ROLE_TASK_PAGE_LIMIT * MOBILE_TASK_RESTORE_PAGE_LIMIT

function readMobileTaskHistoryState() {
  if (typeof window === 'undefined') return {}
  const { state } = window.history
  return state && typeof state === 'object' ? state : {}
}

function mobileTaskDraftStorageKey(scopeKey, taskID) {
  const normalizedScopeKey = String(scopeKey || '').trim()
  const normalizedTaskID = String(taskID || '').trim()
  if (!normalizedScopeKey || !normalizedTaskID) return ''
  return `${MOBILE_TASK_DRAFT_STORAGE_PREFIX}${encodeURIComponent(
    normalizedScopeKey
  )}:${encodeURIComponent(normalizedTaskID)}`
}

function persistMobileTaskDraftBackup(scopeKey, draft) {
  if (typeof window === 'undefined') return false
  const storageKey = mobileTaskDraftStorageKey(scopeKey, draft?.taskID)
  const action = String(draft?.action || '').trim()
  if (!storageKey || !action) return false
  try {
    window.sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        action,
        reason: String(draft?.reason || ''),
        scopeKey: String(scopeKey || '').trim(),
        taskID: String(draft.taskID),
      })
    )
    return true
  } catch {
    return false
  }
}

function readMobileTaskDraftBackup(scopeKey, taskID) {
  if (typeof window === 'undefined') return null
  const storageKey = mobileTaskDraftStorageKey(scopeKey, taskID)
  if (!storageKey) return null
  try {
    const value = JSON.parse(
      window.sessionStorage.getItem(storageKey) || 'null'
    )
    if (
      !value ||
      typeof value !== 'object' ||
      value.scopeKey !== String(scopeKey || '').trim() ||
      value.taskID !== String(taskID || '') ||
      !String(value.action || '').trim()
    ) {
      return null
    }
    return {
      action: String(value.action),
      reason: String(value.reason || ''),
    }
  } catch {
    return null
  }
}

function clearMobileTaskDraftBackup(scopeKey, taskID) {
  if (typeof window === 'undefined') return false
  const storageKey = mobileTaskDraftStorageKey(scopeKey, taskID)
  if (!storageKey) return false
  try {
    window.sessionStorage.removeItem(storageKey)
    return true
  } catch {
    return false
  }
}

function mobileTaskHistoryChoice(value, choices, fallback) {
  return choices.includes(value) ? value : fallback
}

function readMobileTaskListLimits(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, limit]) => {
      const normalized = Number(limit)
      return Number.isSafeInteger(normalized) && normalized > 0
        ? [[key, Math.min(normalized, MOBILE_TASK_RESTORE_ITEM_LIMIT)]]
        : []
    })
  )
}

function isMobileTaskMine(activeRoleKey, adminID, task) {
  const normalizedAdminID = Number(adminID || 0)
  const assigneeID = Number(task?.assignee_id || 0)
  if (assigneeID > 0) {
    return normalizedAdminID > 0 && assigneeID === normalizedAdminID
  }
  return canOperateTask(activeRoleKey, task)
}

export default function MobileRoleTasksPage() {
  const navigate = useNavigate()
  const { activeRoleKey } = useERPWorkspace()
  const {
    adminProfile,
    canEnterDesktop,
    handleEnterDesktop,
    handleLogout,
    loggingOut,
  } = useOutletContext() || {}
  const canMountCustomerTasks = canMountCustomerRuntime(adminProfile)
  const taskAccessIdentity =
    workflowTaskAdminAccessRequestIdentity(adminProfile)
  const taskScopeKey = `${activeRoleKey}|access:${taskAccessIdentity}|${canMountCustomerTasks ? 'ready' : 'blocked'}`
  const initialHistoryStateRef = useRef(readMobileTaskHistoryState())
  const initialHistoryCandidate = initialHistoryStateRef.current
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
  const scrollContainerRef = useRef(null)
  const listScrollTopRef = useRef(
    Math.max(
      0,
      Number(initialHistoryState[MOBILE_TASK_HISTORY_SCROLL_TOP_KEY] || 0)
    )
  )
  const restoreListStateRef = useRef(false)
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
  const taskLoadRequestSeqRef = useRef({ todo: 0, history: 0, risk: 0 })
  const taskViewRestoreTargetRef = useRef({ todo: 0, history: 0, risk: 0 })
  const taskViewRestoreAppendCountRef = useRef({
    todo: 0,
    history: 0,
    risk: 0,
  })
  const [showScrollTopButton, setShowScrollTopButton] = useState(
    () => listScrollTopRef.current >= MOBILE_SCROLL_TOP_VISIBLE_OFFSET
  )
  const [activeMainTabKey, setActiveMainTabKey] = useState(() =>
    mobileTaskHistoryChoice(
      initialHistoryState[MOBILE_TASK_HISTORY_MAIN_TAB_KEY],
      Object.values(MOBILE_MAIN_TAB_KEYS),
      MOBILE_MAIN_TAB_KEYS.TODO
    )
  )
  const [activeMessageTabKey, setActiveMessageTabKey] = useState(() =>
    mobileTaskHistoryChoice(
      initialHistoryState[MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY],
      Object.values(MOBILE_MESSAGE_TAB_KEYS),
      MOBILE_MESSAGE_TAB_KEYS.WARNING
    )
  )
  const [activeFilterKey, setActiveFilterKey] = useState(() =>
    mobileTaskHistoryChoice(
      initialHistoryState[MOBILE_TASK_HISTORY_FILTER_KEY],
      Object.values(MOBILE_TASK_FILTER_KEYS),
      MOBILE_TASK_FILTER_KEYS.ALL
    )
  )
  const [selectedTaskID, setSelectedTaskID] = useState(() =>
    initialHistoryScreen
      ? initialHistoryState[MOBILE_TASK_HISTORY_TASK_KEY] || null
      : null
  )
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
  const activeTaskViewKey = useMemo(
    () =>
      resolveMobileRoleTaskViewKey({
        mainTabKey: activeMainTabKey,
        filterKey: activeFilterKey,
      }),
    [activeFilterKey, activeMainTabKey]
  )
  const historyRestoreItemLimit = resolveMobileRoleTaskRestoreLimit({
    viewKey: activeTaskViewKey,
    loadedCounts: historyLoadedTaskCountsRef.current,
    visibleLimits: visibleListLimitsByKey,
    maxItems: MOBILE_TASK_RESTORE_ITEM_LIMIT,
  })

  const todoTaskViews = useMemo(
    () =>
      buildMobileTaskListForRole(
        taskSlots[MOBILE_ROLE_TASK_VIEW_KEYS.TODO].items,
        activeRoleKey
      ),
    [activeRoleKey, taskSlots]
  )
  const historyTaskViews = useMemo(
    () =>
      buildMobileTaskListForRole(
        taskSlots[MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY].items,
        activeRoleKey
      ),
    [activeRoleKey, taskSlots]
  )
  const riskTaskViews = useMemo(
    () =>
      buildMobileTaskListForRole(
        taskSlots[MOBILE_ROLE_TASK_VIEW_KEYS.RISK].items,
        activeRoleKey
      ),
    [activeRoleKey, taskSlots]
  )
  const activeTasks = useMemo(
    () =>
      todoTaskViews.filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [todoTaskViews]
  )
  const doneTasks = useMemo(
    () =>
      historyTaskViews.filter((task) =>
        TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [historyTaskViews]
  )
  const riskTasks = useMemo(
    () =>
      riskTaskViews.filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [riskTaskViews]
  )
  const warningTasks = useMemo(
    () => riskTasks.filter((task) => isTaskAlerted(task)),
    [riskTasks]
  )
  const overdueTasks = useMemo(
    () => riskTasks.filter((task) => isTaskOverdue(task)),
    [riskTasks]
  )
  const noticeTasks = useMemo(() => riskTasks, [riskTasks])
  const taskSummary = useMemo(
    () => buildMobileTaskSummary([...activeTasks, ...doneTasks]),
    [activeTasks, doneTasks]
  )
  const progressTotal =
    taskSummary.ready + taskSummary.blocked + taskSummary.done
  const progressPercent =
    progressTotal === 0
      ? 0
      : Math.round((taskSummary.done / progressTotal) * 100)
  const activeTaskViewState = useMemo(
    () =>
      resolveMobileRoleTaskViewState({
        viewKey: activeTaskViewKey,
        todoTasks: activeTasks,
        historyTasks: doneTasks,
        riskTasks,
        selectedTaskID,
      }),
    [activeTaskViewKey, activeTasks, doneTasks, riskTasks, selectedTaskID]
  )
  const filterSourceTasks = activeTaskViewState.tasks
  const filteredTasks = useMemo(() => {
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.RISK) {
      return filterSourceTasks.filter((task) => isTaskRisk(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.ALERT) {
      return filterSourceTasks.filter((task) => isTaskAlerted(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.OVERDUE) {
      return filterSourceTasks.filter((task) => isTaskOverdue(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.DUE_SOON) {
      return filterSourceTasks.filter((task) => isTaskDueSoon(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.MINE) {
      return filterSourceTasks.filter((task) =>
        isMobileTaskMine(activeRoleKey, adminProfile?.id, task)
      )
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.HIGH_PRIORITY) {
      return filterSourceTasks.filter((task) => isTaskHighPriority(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.BLOCKED) {
      return filterSourceTasks.filter((task) => isTaskBlockedProgress(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.BLOCKED_OR_HIGH_PRIORITY) {
      return filterSourceTasks.filter(
        (task) => isTaskBlockedProgress(task) || isTaskHighPriority(task)
      )
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.READY) {
      return filterSourceTasks.filter((task) => isTaskReadyProgress(task))
    }
    return filterSourceTasks
  }, [activeFilterKey, activeRoleKey, adminProfile?.id, filterSourceTasks])
  const filterItems = useMemo(
    () => [
      {
        key: MOBILE_TASK_FILTER_KEYS.ALL,
        label: '全部',
        count: activeTasks.length,
      },
      {
        key: MOBILE_TASK_FILTER_KEYS.RISK,
        label: '风险',
        count: riskTasks.length,
      },
      {
        key: MOBILE_TASK_FILTER_KEYS.OVERDUE,
        label: '超时',
        count: overdueTasks.length,
      },
      {
        key: MOBILE_TASK_FILTER_KEYS.MINE,
        label: '我负责',
        count: activeTasks.filter((task) =>
          isMobileTaskMine(activeRoleKey, adminProfile?.id, task)
        ).length,
      },
    ],
    [
      activeRoleKey,
      activeTasks,
      adminProfile?.id,
      overdueTasks.length,
      riskTasks.length,
    ]
  )
  const { selectedTask } = activeTaskViewState
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
    canMountCustomerTasks && activeTaskViewState.actionsEnabled
  const selectedTaskActionAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTaskActionsEnabled ? selectedTask : null,
    enabled: selectedTaskActionsEnabled,
  })

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
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.TODO) {
      return
    }
    setActiveFilterKey('all')
    setSelectedTaskID(null)
    setDetailAction(null)
  }, [activeMainTabKey])

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
        if (showRefreshFeedback) {
          message.success('数据已刷新')
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
        message.error(errorMessage)
        return false
      }
    },
    [activeRoleKey, canMountCustomerTasks, taskScopeKey]
  )

  useEffect(() => {
    if (initializedTaskScopeKeyRef.current === taskScopeKey) return
    initializedTaskScopeKeyRef.current = taskScopeKey
    for (const viewKey of Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)) {
      taskLoadRequestSeqRef.current[viewKey] =
        (taskLoadRequestSeqRef.current[viewKey] || 0) + 1
    }
    const nextState = createMobileRoleTaskScopeState(taskScopeKey)
    taskViewRestoreTargetRef.current = { todo: 0, history: 0, risk: 0 }
    taskViewRestoreAppendCountRef.current = { todo: 0, history: 0, risk: 0 }
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

  const activeTaskSlot = taskSlots[activeTaskViewKey]

  useEffect(() => {
    if (
      canMountCustomerTasks &&
      !activeTaskSlot.loaded &&
      !activeTaskSlot.loading &&
      !activeTaskSlot.error
    ) {
      loadTaskView(activeTaskViewKey)
    }
  }, [
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
      const currentState = readMobileRoleTaskScopeState(
        taskScopeStateRef.current,
        taskScopeKey
      )
      const currentSlots = currentState.slots
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
        const keepInActiveView =
          activeTaskViewKey === MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY
            ? terminal
            : activeTaskViewKey === MOBILE_ROLE_TASK_VIEW_KEYS.RISK
              ? !terminal && isTaskRisk(canonicalTask)
              : !terminal
        const keepInViews = {
          [MOBILE_ROLE_TASK_VIEW_KEYS.TODO]: !terminal,
          [MOBILE_ROLE_TASK_VIEW_KEYS.HISTORY]: terminal,
          [MOBILE_ROLE_TASK_VIEW_KEYS.RISK]:
            !terminal && isTaskRisk(canonicalTask),
        }
        for (const viewKey of Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)) {
          taskLoadRequestSeqRef.current[viewKey] =
            (taskLoadRequestSeqRef.current[viewKey] || 0) + 1
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
        return true
      }
      const restoreTarget = Math.min(
        MOBILE_TASK_RESTORE_ITEM_LIMIT,
        Math.max(
          MOBILE_ROLE_TASK_PAGE_LIMIT,
          historyRestoreItemLimit,
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
    [activeTaskViewKey, historyRestoreItemLimit, loadTaskView, taskScopeKey]
  )

  const roleLabel = getMobileRoleLabel(activeRoleKey)
  const { loading } = activeTaskSlot
  const initialLoading =
    loading && !activeTaskSlot.loaded && activeTaskSlot.items.length === 0
  const latestTaskUpdate = resolveLatestTaskTime([
    ...activeTasks,
    ...doneTasks,
    ...riskTasks,
  ])
  const serverDataTime = formatMobileTaskTime(activeTaskSlot.server_time)
  const detailSeverity = detailTask ? getTaskSeverityView(detailTask) : null
  const {
    actionReceipt,
    actionReceiptRetryable,
    clearActionReceipt,
    detailReasonValue,
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
    updatingID,
    urgingID,
  } = useMobileRoleTaskActions({
    activeRoleKey,
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
    setSelectedTaskID(restoredTaskID)
    setDetailAction(restoredAction)
    if (restoredScreen === 'action') {
      restoreActionDraft({
        action: restoredAction,
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
  ])

  const actionDraftHistoryRef = useRef({
    action: '',
    reason: '',
    taskID: null,
  })
  actionDraftHistoryRef.current = {
    action: detailAction || '',
    reason: detailReasonValue,
    taskID: selectedTask?.id || null,
  }
  const actionDraftHistoryTimerRef = useRef(null)
  const actionDraftHistoryWarningRef = useRef(false)
  const flushMobileTaskDraftHistory = useCallback(() => {
    if (typeof window === 'undefined') return false
    if (actionDraftHistoryTimerRef.current) {
      window.clearTimeout(actionDraftHistoryTimerRef.current)
      actionDraftHistoryTimerRef.current = null
    }
    const currentState = window.history.state || {}
    const draft = actionDraftHistoryRef.current
    if (
      currentState[MOBILE_TASK_HISTORY_SCREEN_KEY] !== 'action' ||
      !draft.action ||
      String(currentState[MOBILE_TASK_HISTORY_TASK_KEY] || '') !==
        String(draft.taskID || '')
    ) {
      return false
    }
    try {
      window.history.replaceState(
        {
          ...currentState,
          [MOBILE_TASK_HISTORY_ACTION_KEY]: draft.action,
          [MOBILE_TASK_HISTORY_REASON_KEY]: draft.reason,
        },
        ''
      )
      return true
    } catch {
      if (
        !actionDraftHistoryWarningRef.current &&
        document.visibilityState !== 'hidden'
      ) {
        actionDraftHistoryWarningRef.current = true
        message.warning('处理内容暂时无法随页面刷新保留，请先不要刷新')
      }
      return false
    }
  }, [])

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !selectedTask ||
      !detailAction ||
      actionReceipt ||
      window.history.state?.[MOBILE_TASK_HISTORY_SCREEN_KEY] !== 'action'
    ) {
      return undefined
    }
    const timerID = window.setTimeout(flushMobileTaskDraftHistory, 250)
    actionDraftHistoryTimerRef.current = timerID
    return () => {
      if (actionDraftHistoryTimerRef.current === timerID) {
        window.clearTimeout(timerID)
        actionDraftHistoryTimerRef.current = null
      }
    }
  }, [
    actionReceipt,
    detailAction,
    detailReasonValue,
    flushMobileTaskDraftHistory,
    selectedTask,
  ])

  useEffect(() => {
    window.addEventListener('pagehide', flushMobileTaskDraftHistory)
    return () => {
      flushMobileTaskDraftHistory()
      window.removeEventListener('pagehide', flushMobileTaskDraftHistory)
    }
  }, [flushMobileTaskDraftHistory])

  useEffect(() => {
    if (selectedTaskID === null || !activeTaskSlot.loaded) return
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
    selectedTaskID,
  ])

  const receiptHistoryKeyRef = useRef('')

  const pushMobileTaskScreen = useCallback(
    ({ action = '', receipt = null, screen, taskID = null }) => {
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
      const nextState = {
        ...currentState,
        [MOBILE_TASK_HISTORY_SCREEN_KEY]: screen,
        [MOBILE_TASK_HISTORY_DEPTH_KEY]: sameScreen
          ? Number(currentState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0)
          : Number(currentState[MOBILE_TASK_HISTORY_DEPTH_KEY] || 0) + 1,
        [MOBILE_TASK_HISTORY_TASK_KEY]: taskID,
        [MOBILE_TASK_HISTORY_ACTION_KEY]: action,
        [MOBILE_TASK_HISTORY_RECEIPT_KEY]: receipt,
        [MOBILE_TASK_HISTORY_MAIN_TAB_KEY]: activeMainTabKey,
        [MOBILE_TASK_HISTORY_MESSAGE_TAB_KEY]: activeMessageTabKey,
        [MOBILE_TASK_HISTORY_FILTER_KEY]: activeFilterKey,
        [MOBILE_TASK_HISTORY_SCROLL_TOP_KEY]: listScrollTopRef.current,
        [MOBILE_TASK_HISTORY_LIST_LIMITS_KEY]: visibleListLimitsByKey,
        [MOBILE_TASK_HISTORY_LOADED_COUNTS_KEY]: loadedCounts,
        [MOBILE_TASK_HISTORY_SCOPE_KEY]: taskScopeKey,
      }
      if (sameScreen) {
        window.history.replaceState(nextState, '')
        currentTaskScreenRef.current = screen
        return
      }
      window.history.pushState(nextState, '')
      currentTaskScreenRef.current = screen
    },
    [
      activeFilterKey,
      activeMainTabKey,
      activeMessageTabKey,
      taskScopeKey,
      visibleListLimitsByKey,
    ]
  )

  const handleSelectTaskID = useCallback(
    (taskID) => {
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
        pushMobileTaskScreen({ screen: 'detail', taskID })
      }
    },
    [activeTaskViewKey, clearActionReceipt, pushMobileTaskScreen]
  )

  const availableActions = useMemo(
    () =>
      [
        selectedCanComplete ? 'done' : '',
        selectedCanBlock ? 'blocked' : '',
        selectedCanResume ? 'resume' : '',
        selectedCanReject ? 'rejected' : '',
        selectedCanUrge ? 'urge' : '',
      ].filter(Boolean),
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
  const actionBusy = Boolean(
    selectedTask &&
      (Number(updatingID) === Number(selectedTask.id) ||
        Number(urgingID) === Number(selectedTask.id))
  )

  const handleOpenAction = useCallback(
    (preferredAction = '') => {
      if (!selectedTask) return
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
    [availableActions, handleTaskAction, pushMobileTaskScreen, selectedTask]
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

  const handleDetailBack = useCallback(() => {
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
  const handleActionBack = useCallback(() => {
    flushMobileTaskDraftHistory()
    handleScreenBack('action', () => {
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

  useEffect(() => {
    if (!actionReceipt) {
      receiptHistoryKeyRef.current = ''
      return
    }
    clearMobileTaskDraftBackup(taskScopeKey, actionReceipt.task?.id)
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
    const handlePopState = (event) => {
      const historyState = event.state || {}
      const targetScreen = historyState[MOBILE_TASK_HISTORY_SCREEN_KEY]
      const targetTaskID = historyState[MOBILE_TASK_HISTORY_TASK_KEY]
      const previousScreen = currentTaskScreenRef.current
      if (previousScreen === 'action') {
        persistMobileTaskDraftBackup(
          taskScopeKey,
          actionDraftHistoryRef.current
        )
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
        restoringHistoryTaskRef.current = Boolean(targetTaskID)
        setSelectedTaskID(targetTaskID || null)
        restoreActionDraft({
          action: targetAction,
          reason,
          taskID: targetTaskID,
        })
        setDetailAction(targetAction)
        if (backupMatchesAction) {
          try {
            window.history.replaceState(
              {
                ...historyState,
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
    return () => window.removeEventListener('popstate', handlePopState)
  }, [
    clearActionReceipt,
    restoreActionDraft,
    restoreActionReceipt,
    taskScopeKey,
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
    setShowScrollTopButton(scrollTop >= MOBILE_SCROLL_TOP_VISIBLE_OFFSET)
  }, [])

  const scrollMainToTop = () => {
    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    listScrollTopRef.current = 0
    setShowScrollTopButton(false)
  }

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
    setShowScrollTopButton(
      restoredScrollTop >= MOBILE_SCROLL_TOP_VISIBLE_OFFSET
    )
    const focusedTaskID = String(lastFocusedTaskIDRef.current || '')
    const taskButton = Array.from(
      scrollContainer.querySelectorAll('[data-mobile-task-id]')
    ).find((button) => button.dataset.mobileTaskId === focusedTaskID)
    const focusTarget =
      taskButton ||
      scrollContainer.querySelector('[data-testid="mobile-role-list-heading"]')
    focusTarget?.focus({ preventScroll: true })
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

  if (actionReceipt) {
    const receiptTaskRecoveryPending = Boolean(
      actionReceiptRetryable && selectedTaskID && !selectedTask
    )
    return (
      <MobileTaskReceiptScreen
        action={actionReceipt.action}
        busy={actionBusy}
        evidenceRefs={actionReceipt.evidence_refs}
        feedback={actionReceipt.feedback}
        message={actionReceipt.message}
        onBackToList={handleReceiptBackToList}
        onOpenProcess={
          actionReceiptRetryable &&
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
    )
  }

  if (selectedTask && detailAction) {
    return (
      <MobileTaskActionScreen
        accessMessage={selectedTaskActionAccess.readonlyReason}
        accessState={actionAccessState}
        availableActions={availableActions}
        busy={actionBusy}
        canViewReceipt={Boolean(selectedTaskReceipt)}
        onActionChange={(action) => handleTaskAction(selectedTask, action)}
        onBack={handleActionBack}
        onReasonChange={updateDetailReason}
        onRetryAccess={selectedTaskActionAccess.retry}
        onSubmit={submitDetailAction}
        onViewReceipt={
          selectedTaskReceipt ? () => showTaskReceipt(selectedTask) : null
        }
        reason={detailReasonValue}
        selectedAction={detailAction}
        task={selectedTask}
      />
    )
  }

  if (detailTask) {
    const receiptSnapshotOnly = Boolean(receiptDetailTask && !selectedTask)
    return (
      <MobileTaskDetailScreen
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
        onOpenAction={receiptSnapshotOnly ? null : handleOpenSelectedTaskAction}
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
              hasActionPermission(adminProfile, 'workflow.task.update')
        }
        selectedCanOperate={receiptSnapshotOnly ? false : selectedCanOperate}
        selectedCanUrge={receiptSnapshotOnly ? false : selectedCanUrge}
        selectedSeverity={detailSeverity}
        selectedTask={detailTask}
      />
    )
  }

  return (
    <MobileTaskListScreen
      activeFilterKey={activeFilterKey}
      activeMainTabKey={activeMainTabKey}
      activeMessageTabKey={activeMessageTabKey}
      activeViewHasData={activeTaskSlot.items.length > 0}
      activeViewHasMore={activeTaskSlot.has_more}
      activeTasks={activeTasks}
      adminProfile={adminProfile}
      canEnterDesktop={canEnterDesktop === true}
      doneTasks={doneTasks}
      filterItems={filterItems}
      filteredTasks={filteredTasks}
      handleLogout={handleLogout}
      handleMainScroll={handleMainScroll}
      handleEnterDesktop={handleEnterDesktop}
      handleSwitchEntry={() => navigate('/entry')}
      initialLoading={initialLoading}
      latestTaskUpdate={latestTaskUpdate}
      loadError={activeTaskSlot.error}
      loadTasks={loadTasks}
      loadMoreActiveView={loadMoreActiveTaskView}
      loading={loading}
      loadingMore={loading && activeTaskSlot.items.length > 0}
      loggingOut={loggingOut}
      noticeTasks={noticeTasks}
      progressPercent={progressPercent}
      riskTasks={riskTasks}
      roleLabel={roleLabel}
      serverDataTime={serverDataTime}
      scrollContainerRef={scrollContainerRef}
      scrollMainToTop={scrollMainToTop}
      selectedTask={selectedTask}
      setActiveFilterKey={setActiveFilterKey}
      setActiveMainTabKey={setActiveMainTabKey}
      setActiveMessageTabKey={setActiveMessageTabKey}
      setDetailAction={setDetailAction}
      setSelectedTaskID={handleSelectTaskID}
      setVisibleListLimitsByKey={setVisibleListLimitsByKey}
      showScrollTopButton={showScrollTopButton}
      taskSummary={taskSummary}
      visibleListLimitsByKey={visibleListLimitsByKey}
      warningTasks={warningTasks}
    />
  )
}
