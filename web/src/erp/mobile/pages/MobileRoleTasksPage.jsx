import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import '../mobileRoleTasks.css'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { listWorkflowTasks } from '../../api/workflowApi.mjs'
import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
} from '../../utils/mobileTaskView.mjs'
import {
  buildMobileWorkflowTaskQueryPlan,
  mergeWorkflowTaskResults,
} from '../../utils/mobileTaskQueries.mjs'
import MobileTaskDetailScreen from '../components/MobileTaskDetailScreen.jsx'
import MobileTaskListScreen from '../components/MobileTaskListScreen.jsx'
import useMobileRoleTaskActions from '../hooks/useMobileRoleTaskActions'
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
  isTaskPendingProgress,
  isTaskRisk,
  resolveLatestTaskTime,
} from '../utils/mobileRoleTaskModel.mjs'

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const { adminProfile, handleLogout, loggingOut } = useOutletContext() || {}
  const scrollContainerRef = useRef(null)
  const taskLoadRequestSeqRef = useRef(0)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false)
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

  const taskViews = useMemo(
    () => buildMobileTaskListForRole(tasks, activeRoleKey),
    [activeRoleKey, tasks]
  )
  const activeTasks = useMemo(
    () =>
      taskViews.filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [taskViews]
  )
  const doneTasks = useMemo(
    () =>
      taskViews.filter((task) =>
        TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [taskViews]
  )
  const warningTasks = useMemo(
    () => activeTasks.filter((task) => isTaskAlerted(task)),
    [activeTasks]
  )
  const overdueTasks = useMemo(
    () => activeTasks.filter((task) => isTaskOverdue(task)),
    [activeTasks]
  )
  const riskTasks = useMemo(
    () => activeTasks.filter((task) => isTaskRisk(task)),
    [activeTasks]
  )
  const noticeTasks = useMemo(() => activeTasks, [activeTasks])
  const taskSummary = useMemo(
    () => buildMobileTaskSummary(taskViews),
    [taskViews]
  )
  const progressTotal =
    taskSummary.pending +
    taskSummary.processing +
    taskSummary.blockedProgress +
    taskSummary.done
  const progressPercent =
    progressTotal === 0
      ? 0
      : Math.round((taskSummary.done / progressTotal) * 100)
  const filteredTasks = useMemo(() => {
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.RISK) {
      return activeTasks.filter((task) => isTaskRisk(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.ALERT) {
      return activeTasks.filter((task) => isTaskAlerted(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.OVERDUE) {
      return activeTasks.filter((task) => isTaskOverdue(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.DUE_SOON) {
      return activeTasks.filter((task) => isTaskDueSoon(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.MINE) {
      return activeTasks.filter((task) => canOperateTask(activeRoleKey, task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.HIGH_PRIORITY) {
      return activeTasks.filter((task) => isTaskHighPriority(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.BLOCKED) {
      return activeTasks.filter((task) => isTaskBlockedProgress(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.BLOCKED_OR_HIGH_PRIORITY) {
      return activeTasks.filter(
        (task) => isTaskBlockedProgress(task) || isTaskHighPriority(task)
      )
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.PENDING) {
      return activeTasks.filter((task) => isTaskPendingProgress(task))
    }
    if (activeFilterKey === MOBILE_TASK_FILTER_KEYS.PROCESSING) {
      return activeTasks.filter((task) => task.task_status_key === 'processing')
    }
    return activeTasks
  }, [activeFilterKey, activeRoleKey, activeTasks])
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
  const selectedTask = useMemo(
    () =>
      activeTasks.find((task) => String(task.id) === String(selectedTaskID)) ||
      null,
    [activeTasks, selectedTaskID]
  )

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

  const loadTasks = useCallback(
    async ({ showRefreshFeedback = false } = {}) => {
      const requestSeq = taskLoadRequestSeqRef.current + 1
      taskLoadRequestSeqRef.current = requestSeq
      setLoading(true)
      try {
        const queryResults = await Promise.all(
          buildMobileWorkflowTaskQueryPlan(activeRoleKey).map((query) =>
            listWorkflowTasks(query)
          )
        )
        if (taskLoadRequestSeqRef.current !== requestSeq) {
          return
        }
        setTasks(mergeWorkflowTaskResults(queryResults))
        if (showRefreshFeedback) {
          message.success('数据已刷新')
        }
      } catch (error) {
        if (taskLoadRequestSeqRef.current !== requestSeq) {
          return
        }
        message.error(
          getActionErrorMessage(
            error,
            showRefreshFeedback
              ? '刷新移动端任务失败，已保留上次数据'
              : '加载移动端任务失败，请稍后重试'
          )
        )
      } finally {
        if (taskLoadRequestSeqRef.current === requestSeq) {
          setHasLoadedOnce(true)
          setLoading(false)
        }
      }
    },
    [activeRoleKey]
  )

  useEffect(() => {
    setHasLoadedOnce(false)
    setTasks([])
    setSelectedTaskID(null)
    setDetailAction(null)
    loadTasks()
  }, [loadTasks])

  const roleLabel = getMobileRoleLabel(activeRoleKey)
  const initialLoading = loading && !hasLoadedOnce && tasks.length === 0
  const latestSync = resolveLatestTaskTime(activeTasks)
  const selectedSeverity = selectedTask
    ? getTaskSeverityView(selectedTask)
    : null
  const {
    appendQuickReason,
    detailEvidenceValue,
    detailReasonValue,
    handleTaskAction,
    savedEvidenceRefs,
    selectedCanOperate,
    selectedCanUrge,
    submitDetailAction,
    updateDetailReason,
    updateEvidenceText,
    updatingID,
    urgingID,
  } = useMobileRoleTaskActions({
    activeRoleKey,
    detailAction,
    loadTasks,
    selectedTask,
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
        selectedCanOperate={selectedCanOperate}
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
      activeTasks={activeTasks}
      adminProfile={adminProfile}
      doneTasks={doneTasks}
      filterItems={filterItems}
      filteredTasks={filteredTasks}
      handleLogout={handleLogout}
      handleMainScroll={handleMainScroll}
      initialLoading={initialLoading}
      latestSync={latestSync}
      loadTasks={loadTasks}
      loading={loading}
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
