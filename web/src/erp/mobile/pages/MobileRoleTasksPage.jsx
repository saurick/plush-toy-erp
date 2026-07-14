import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import '../mobileRoleTasks.css'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { listWorkflowRoleTasks } from '../../api/workflowApi.mjs'
import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
} from '../../utils/mobileTaskView.mjs'
import {
  MOBILE_ROLE_TASK_VIEW_KEYS,
  buildMobileRoleTaskQuery,
  createMobileRoleTaskScopeState,
  readMobileRoleTaskScopeState,
  resolveMobileRoleTaskViewKey,
  resolveMobileRoleTaskViewState,
  settleMobileRoleTaskRequest,
} from '../../utils/mobileTaskQueries.mjs'
import { canMountCustomerRuntime } from '../../utils/adminProfileSync.mjs'
import MobileTaskDetailScreen from '../components/MobileTaskDetailScreen.jsx'
import MobileTaskListScreen from '../components/MobileTaskListScreen.jsx'
import useMobileRoleTaskActions from '../hooks/useMobileRoleTaskActions'
import useWorkflowTaskActionAccess from '../../hooks/useWorkflowTaskActionAccess'
import {
  MOBILE_MAIN_TAB_KEYS,
  MOBILE_MESSAGE_TAB_KEYS,
  MOBILE_SCROLL_TOP_VISIBLE_OFFSET,
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

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const { adminProfile, handleLogout, loggingOut } = useOutletContext() || {}
  const scrollContainerRef = useRef(null)
  const taskLoadRequestSeqRef = useRef({ todo: 0, history: 0, risk: 0 })
  const [showScrollTopButton, setShowScrollTopButton] = useState(false)
  const [activeMainTabKey, setActiveMainTabKey] = useState(
    MOBILE_MAIN_TAB_KEYS.TODO
  )
  const [activeMessageTabKey, setActiveMessageTabKey] = useState(
    MOBILE_MESSAGE_TAB_KEYS.WARNING
  )
  const [activeFilterKey, setActiveFilterKey] = useState('all')
  const [selectedTaskID, setSelectedTaskID] = useState(null)
  const [detailAction, setDetailAction] = useState(null)
  const canMountCustomerTasks = canMountCustomerRuntime(adminProfile)
  const customerKey = String(
    adminProfile?.effective_session?.customer?.key || ''
  ).trim()
  const customerConfigRevision = String(
    adminProfile?.effective_session?.config_revision || ''
  ).trim()
  const taskScopeKey = `${activeRoleKey}|${customerKey}|${customerConfigRevision}|${canMountCustomerTasks ? 'ready' : 'blocked'}`
  const [taskScopeState, setTaskScopeState] = useState(() =>
    createMobileRoleTaskScopeState(taskScopeKey)
  )
  const taskScopeKeyRef = useRef(taskScopeKey)
  taskScopeKeyRef.current = taskScopeKey
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
        canOperateTask(activeRoleKey, task)
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
  }, [activeFilterKey, activeRoleKey, filterSourceTasks])
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
        count: activeTasks.filter((task) => canOperateTask(activeRoleKey, task))
          .length,
      },
    ],
    [activeRoleKey, activeTasks, overdueTasks.length, riskTasks.length]
  )
  const { selectedTask } = activeTaskViewState
  const selectedTaskActionsEnabled =
    canMountCustomerTasks && activeTaskViewState.actionsEnabled
  const selectedTaskActionAccess = useWorkflowTaskActionAccess({
    adminProfile,
    task: selectedTaskActionsEnabled ? selectedTask : null,
    enabled: selectedTaskActionsEnabled,
  })

  useEffect(() => {
    if (selectedTaskID === null) {
      return
    }
    const selectedVisible = filteredTasks.some(
      (task) => String(task.id) === String(selectedTaskID)
    )
    if (!selectedVisible) {
      setSelectedTaskID(null)
    }
  }, [filteredTasks, selectedTaskID])

  useEffect(() => {
    setDetailAction(null)
  }, [selectedTaskID])

  useEffect(() => {
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
    for (const viewKey of Object.values(MOBILE_ROLE_TASK_VIEW_KEYS)) {
      taskLoadRequestSeqRef.current[viewKey] =
        (taskLoadRequestSeqRef.current[viewKey] || 0) + 1
    }
    const nextState = createMobileRoleTaskScopeState(taskScopeKey)
    taskScopeStateRef.current = nextState
    setTaskScopeState(nextState)
    setSelectedTaskID(null)
    setDetailAction(null)
  }, [taskScopeKey])

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

  const refreshTasksAfterMutation = useCallback(() => {
    const currentState = readMobileRoleTaskScopeState(
      taskScopeStateRef.current,
      taskScopeKey
    )
    const currentSlots = currentState.slots
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
    return loadTaskView(activeTaskViewKey, { rejectOnError: true })
  }, [activeTaskViewKey, loadTaskView, taskScopeKey])

  const roleLabel = getMobileRoleLabel(activeRoleKey)
  const { loading } = activeTaskSlot
  const initialLoading =
    loading && !activeTaskSlot.loaded && activeTaskSlot.items.length === 0
  const latestSync = resolveLatestTaskTime([
    ...activeTasks,
    ...doneTasks,
    ...riskTasks,
  ])
  const selectedSeverity = selectedTask
    ? getTaskSeverityView(selectedTask)
    : null
  const {
    appendQuickReason,
    detailEvidenceValue,
    detailReasonValue,
    handleTaskAction,
    savedEvidenceRefs,
    selectedCanBlock,
    selectedCanComplete,
    selectedCanOperate,
    selectedCanReject,
    selectedCanResume,
    selectedCanUrge,
    submitDetailAction,
    updateDetailReason,
    updateEvidenceText,
    updatingID,
    urgingID,
  } = useMobileRoleTaskActions({
    activeRoleKey,
    detailAction,
    loadTasks: refreshTasksAfterMutation,
    selectedTask,
    taskActionAccess: selectedTaskActionAccess,
    setDetailAction,
    setSelectedTaskID,
  })

  const handleMainScroll = useCallback((event) => {
    setShowScrollTopButton(
      event.currentTarget.scrollTop >= MOBILE_SCROLL_TOP_VISIBLE_OFFSET
    )
  }, [])

  const scrollMainToTop = () => {
    scrollContainerRef.current?.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
    setShowScrollTopButton(false)
  }

  if (selectedTask) {
    return (
      <MobileTaskDetailScreen
        activeRoleKey={activeRoleKey}
        appendQuickReason={appendQuickReason}
        detailAction={detailAction}
        detailEvidenceValue={detailEvidenceValue}
        detailReasonValue={detailReasonValue}
        handleTaskAction={handleTaskAction}
        roleLabel={roleLabel}
        savedEvidenceRefs={savedEvidenceRefs}
        selectedCanBlock={selectedCanBlock}
        selectedCanComplete={selectedCanComplete}
        selectedCanOperate={selectedCanOperate}
        selectedCanReject={selectedCanReject}
        selectedCanResume={selectedCanResume}
        selectedCanUrge={selectedCanUrge}
        selectedSeverity={selectedSeverity}
        selectedTask={selectedTask}
        setDetailAction={setDetailAction}
        setSelectedTaskID={setSelectedTaskID}
        submitDetailAction={submitDetailAction}
        updateDetailReason={updateDetailReason}
        updateEvidenceText={updateEvidenceText}
        updatingID={updatingID}
        urgingID={urgingID}
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
      doneTasks={doneTasks}
      filterItems={filterItems}
      filteredTasks={filteredTasks}
      handleLogout={handleLogout}
      handleMainScroll={handleMainScroll}
      initialLoading={initialLoading}
      latestSync={latestSync}
      loadError={activeTaskSlot.error}
      loadTasks={loadTasks}
      loadMoreActiveView={loadMoreActiveTaskView}
      loading={loading}
      loadingMore={loading && activeTaskSlot.items.length > 0}
      loggingOut={loggingOut}
      noticeTasks={noticeTasks}
      overdueTasks={overdueTasks}
      progressPercent={progressPercent}
      riskTasks={riskTasks}
      roleLabel={roleLabel}
      scrollContainerRef={scrollContainerRef}
      scrollMainToTop={scrollMainToTop}
      selectedTask={selectedTask}
      setActiveFilterKey={setActiveFilterKey}
      setActiveMainTabKey={setActiveMainTabKey}
      setActiveMessageTabKey={setActiveMessageTabKey}
      setDetailAction={setDetailAction}
      setSelectedTaskID={setSelectedTaskID}
      showScrollTopButton={showScrollTopButton}
      taskSummary={taskSummary}
      warningTasks={warningTasks}
    />
  )
}
