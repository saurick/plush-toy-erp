import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  BellOutlined,
  CheckOutlined,
  CheckSquareOutlined,
  CameraOutlined,
  ClockCircleOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
  InboxOutlined,
  LeftOutlined,
  LinkOutlined,
  LogoutOutlined,
  MoreOutlined,
  PauseOutlined,
  CaretRightOutlined,
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowRightOutlined,
  UserOutlined,
} from '@ant-design/icons'
import '../mobileRoleTasks.css'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import { listWorkflowTasks } from '../../api/workflowApi.mjs'
import {
  buildMobileTaskListForRole,
  buildMobileTaskSummary,
  formatMobileTaskTime,
} from '../../utils/mobileTaskView.mjs'
import {
  buildMobileWorkflowTaskQueryPlan,
  mergeWorkflowTaskResults,
} from '../../utils/mobileTaskQueries.mjs'
import useMobileRoleTaskActions from '../hooks/useMobileRoleTaskActions'
import {
  MOBILE_LIST_COLLAPSED_LIMITS,
  MOBILE_LIST_KEYS,
  MOBILE_MAIN_TAB_KEYS,
  MOBILE_MESSAGE_TAB_KEYS,
  MOBILE_SCROLL_TOP_VISIBLE_OFFSET,
  MOBILE_TASK_FILTER_KEYS,
  QUICK_REASONS,
  TERMINAL_TASK_STATUS_KEYS,
  buildTaskFactRows,
  canOperateTask,
  getMobileRoleLabel,
  getTaskQueueTone,
  getTaskSeverityView,
  isTaskAlerted,
  isTaskBlockedProgress,
  isTaskDueSoon,
  isTaskHighPriority,
  isTaskOverdue,
  isTaskPendingProgress,
  isTaskRisk,
  resolveDetailActionLabel,
  resolveLatestTaskTime,
  resolveTaskBusinessChip,
  resolveTaskListMeta,
  resolveTaskSourceLabel,
  supportsRejectedAction,
} from '../utils/mobileRoleTaskModel.mjs'
import { mobileTheme } from '../theme'

const MOBILE_MAIN_TAB_ITEMS = Object.freeze([
  { key: MOBILE_MAIN_TAB_KEYS.TODO, label: '待办', Icon: InboxOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.DONE, label: '已办', Icon: CheckSquareOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MESSAGES, label: '消息', Icon: BellOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MINE, label: '我的', Icon: UserOutlined },
])

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const { adminProfile, handleLogout, loggingOut } = useOutletContext() || {}
  const scrollContainerRef = useRef(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [showScrollTopButton, setShowScrollTopButton] = useState(false)
  const [activeMainTabKey, setActiveMainTabKey] = useState(
    MOBILE_MAIN_TAB_KEYS.TODO
  )
  const [activeMessageTabKey, setActiveMessageTabKey] = useState(
    MOBILE_MESSAGE_TAB_KEYS.WARNING
  )
  const [visibleListLimitsByKey, setVisibleListLimitsByKey] = useState({})
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
      setLoading(true)
      try {
        const queryResults = await Promise.all(
          buildMobileWorkflowTaskQueryPlan(activeRoleKey).map((query) =>
            listWorkflowTasks(query)
          )
        )
        setTasks(mergeWorkflowTaskResults(queryResults))
        if (showRefreshFeedback) {
          message.success('数据已刷新')
        }
      } catch (error) {
        message.error(
          getActionErrorMessage(
            error,
            showRefreshFeedback
              ? '刷新移动端任务失败，已保留上次数据'
              : '加载移动端任务失败，请稍后重试'
          )
        )
      } finally {
        setLoading(false)
      }
    },
    [activeRoleKey]
  )

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const roleLabel = getMobileRoleLabel(activeRoleKey)
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

  const getCollapsedListLimit = (listKey) =>
    MOBILE_LIST_COLLAPSED_LIMITS[listKey] || Number.POSITIVE_INFINITY

  const getVisibleListLimit = (items, listKey) => {
    const collapsedLimit = getCollapsedListLimit(listKey)
    const configuredLimit = Number(visibleListLimitsByKey[listKey] || 0)
    const visibleLimit = configuredLimit > 0 ? configuredLimit : collapsedLimit
    return Math.min(items.length, visibleLimit)
  }

  const setNextVisibleListBatch = (items, listKey) => {
    const collapsedLimit = getCollapsedListLimit(listKey)
    const currentLimit = getVisibleListLimit(items, listKey)
    const nextLimit = Math.min(items.length, currentLimit + collapsedLimit)
    setVisibleListLimitsByKey((current) => ({
      ...current,
      [listKey]: nextLimit,
    }))
  }

  const resetVisibleListLimit = (listKey) => {
    setVisibleListLimitsByKey((current) => {
      const next = { ...current }
      delete next[listKey]
      return next
    })
  }

  const getVisibleListItems = (items, listKey) => {
    return items.slice(0, getVisibleListLimit(items, listKey))
  }

  const renderListLimitControl = (items, listKey, noun = '条') => {
    const collapsedLimit = getCollapsedListLimit(listKey)
    if (items.length <= collapsedLimit) return null
    const visibleLimit = getVisibleListLimit(items, listKey)
    const remainingCount = items.length - visibleLimit
    const nextCount = Math.min(collapsedLimit, remainingCount)
    const fullyVisible = remainingCount <= 0
    return (
      <div className="mobile-role-list-control">
        <button
          type="button"
          data-testid={`mobile-role-list-toggle-${listKey}`}
          data-total-item-count={items.length}
          className="mobile-role-list-control__button"
          onClick={() =>
            fullyVisible
              ? resetVisibleListLimit(listKey)
              : setNextVisibleListBatch(items, listKey)
          }
        >
          <span>{fullyVisible ? '收起' : `再显示 ${nextCount} ${noun}`}</span>
          {!fullyVisible ? (
            <span className="mobile-role-list-control__hint">
              剩余 {remainingCount} {noun}
            </span>
          ) : null}
        </button>
      </div>
    )
  }

  const openTaskBucket = ({
    mainTabKey = MOBILE_MAIN_TAB_KEYS.TODO,
    filterKey = MOBILE_TASK_FILTER_KEYS.ALL,
    messageTabKey,
    listKey = MOBILE_LIST_KEYS.TODO,
  } = {}) => {
    setActiveMainTabKey(mainTabKey)
    if (mainTabKey === MOBILE_MAIN_TAB_KEYS.TODO) {
      setActiveFilterKey(filterKey)
    }
    if (messageTabKey) {
      setActiveMessageTabKey(messageTabKey)
    }
    setSelectedTaskID(null)
    setDetailAction(null)
    resetVisibleListLimit(listKey)
  }

  const renderSummaryMetric = ({
    label,
    value,
    Icon,
    valueClassName = 'text-slate-950',
    testID,
  }) => (
    <div
      key={label}
      data-testid={testID}
      className="mobile-role-summary-metric min-w-0 px-2 text-center"
    >
      <div
        className={`mobile-role-metric-button__value font-semibold leading-tight ${valueClassName}`}
      >
        {value}
      </div>
      <div className="mobile-role-metric-button__label mt-1 flex items-center justify-center gap-1 text-base text-slate-600">
        {Icon ? <Icon aria-hidden="true" /> : null}
        <span>{label}</span>
      </div>
    </div>
  )

  const renderProgressPanel = () => (
    <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">进度</h2>
        <span className="text-sm text-slate-500">{progressPercent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-4 divide-x divide-slate-200 rounded-xl border border-slate-100 bg-slate-50 py-3 text-center">
        {[
          {
            label: '待处理',
            value: taskSummary.pending,
            Icon: FileTextOutlined,
            filterKey: MOBILE_TASK_FILTER_KEYS.PENDING,
            testID: 'mobile-role-progress-pending',
          },
          {
            label: '处理中',
            value: taskSummary.processing,
            Icon: ClockCircleOutlined,
            filterKey: MOBILE_TASK_FILTER_KEYS.PROCESSING,
            testID: 'mobile-role-progress-processing',
          },
          {
            label: '卡住',
            value: taskSummary.blockedProgress,
            Icon: PauseOutlined,
            filterKey: MOBILE_TASK_FILTER_KEYS.BLOCKED,
            testID: 'mobile-role-progress-blocked',
          },
          {
            label: '完成',
            value: taskSummary.done,
            Icon: CheckSquareOutlined,
            mainTabKey: MOBILE_MAIN_TAB_KEYS.DONE,
            listKey: MOBILE_LIST_KEYS.DONE,
            testID: 'mobile-role-progress-done',
          },
        ].map((item) =>
          renderSummaryMetric({
            ...item,
            valueClassName: 'text-xl text-slate-950',
          })
        )}
      </div>
    </section>
  )

  const renderTaskRow = (task) => {
    const severity = getTaskSeverityView(task)
    const isSelected = String(selectedTask?.id) === String(task.id)
    return (
      <button
        key={task.id}
        type="button"
        className={`erp-mobile-list-item grid w-full grid-cols-[64px_minmax(0,1fr)_94px] gap-3 px-5 py-4 text-left transition hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${severity.rowClass} ${
          isSelected ? 'ring-2 ring-emerald-500/40' : ''
        }`}
        onClick={() => {
          setSelectedTaskID(task.id)
          setDetailAction(null)
        }}
      >
        <div className="pt-1">
          <span
            className={`inline-flex min-w-[52px] items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold ${severity.badgeClass}`}
          >
            {severity.label}
          </span>
        </div>
        <div className="min-w-0">
          <div className="break-words text-base font-semibold leading-snug text-slate-950">
            {task.task_name}
          </div>
          <div className="mt-1 break-all text-sm leading-5 text-slate-500">
            {resolveTaskSourceLabel(task)}
          </div>
          <div className="mt-2 flex min-w-0 items-start gap-1 text-sm leading-5 text-slate-600">
            <UserOutlined className="mt-0.5 shrink-0 text-slate-400" />
            <span className="min-w-0 break-words">
              {resolveTaskListMeta(task)}
            </span>
          </div>
          {task.blocked_reason ? (
            <div className="mt-1 text-sm leading-5 text-red-500">
              阻塞：{task.blocked_reason}
            </div>
          ) : null}
        </div>
        <div className="min-w-0 text-right">
          <span className="inline-flex max-w-full items-center justify-center rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-sm font-semibold leading-5 text-blue-600">
            <span className="truncate">{resolveTaskBusinessChip(task)}</span>
          </span>
          <div
            className={`mt-2 break-words text-sm leading-5 ${severity.timeClass}`}
          >
            {task.due_at_label || task.due_status_label || '-'}
          </div>
        </div>
      </button>
    )
  }

  const renderTabSummary = () => {
    const summaryByTab = {
      [MOBILE_MAIN_TAB_KEYS.TODO]: `共 ${activeTasks.length} 条待处理`,
      [MOBILE_MAIN_TAB_KEYS.DONE]: `共 ${doneTasks.length} 条已办`,
      [MOBILE_MAIN_TAB_KEYS.MESSAGES]: `共 ${
        warningTasks.length + noticeTasks.length
      } 条消息`,
      [MOBILE_MAIN_TAB_KEYS.MINE]: `${roleLabel}任务端`,
    }
    return summaryByTab[activeMainTabKey] || summaryByTab.todo
  }

  const renderTaskMetricCards = () => (
    <section className="mx-5 mt-5 grid grid-cols-4 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-5 text-center shadow-sm">
      {[
        {
          label: '风险',
          value: riskTasks.length,
          valueClassName: 'text-4xl text-orange-500',
          testID: 'mobile-role-metric-alerts',
        },
        {
          label: '已超时',
          value: taskSummary.overdue,
          valueClassName: 'text-4xl text-red-500',
          testID: 'mobile-role-metric-overdue',
        },
        {
          label: '即将超时',
          value: taskSummary.dueSoon,
          valueClassName: 'text-4xl text-slate-600',
          testID: 'mobile-role-metric-due-soon',
        },
        {
          label: '阻塞/高优先',
          value: `${taskSummary.blocked}/${taskSummary.highPriority}`,
          valueClassName: 'text-4xl text-red-500',
          testID: 'mobile-role-metric-risk',
        },
      ].map((item) => renderSummaryMetric(item))}
    </section>
  )

  const renderTaskFilters = () => (
    <div className="mobile-role-task-filters mx-5 mt-4 grid grid-cols-4 rounded-2xl bg-slate-100 p-1 shadow-inner">
      {filterItems.map((item) => {
        const active = item.key === activeFilterKey
        return (
          <button
            key={item.key}
            type="button"
            data-testid={`mobile-role-filter-${item.key}`}
            aria-pressed={active}
            className={`mobile-role-task-filter min-w-0 rounded-xl px-2 py-3 text-base font-semibold transition ${
              active
                ? 'mobile-role-task-filter--active shadow-sm ring-1 ring-slate-200'
                : 'text-slate-500'
            }`}
            onClick={() => {
              setActiveFilterKey(item.key)
              setSelectedTaskID(null)
              setDetailAction(null)
              resetVisibleListLimit(MOBILE_LIST_KEYS.TODO)
            }}
          >
            <span className="truncate">
              {item.label}({item.count})
            </span>
          </button>
        )
      })}
    </div>
  )

  const renderTodoPanel = () => (
    <>
      {renderTaskMetricCards()}
      {renderTaskFilters()}
      <section className="mx-5 mt-5 pb-5">
        <div className="grid grid-cols-[minmax(0,1fr)_112px] pb-2 text-base text-slate-500">
          <span>任务信息</span>
          <span className="text-right">业务状态 / 截止时间</span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {filteredTasks.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-500">
              当前筛选下暂无任务
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {getVisibleListItems(filteredTasks, MOBILE_LIST_KEYS.TODO).map(
                renderTaskRow
              )}
              {renderListLimitControl(
                filteredTasks,
                MOBILE_LIST_KEYS.TODO,
                '条任务'
              )}
            </div>
          )}
        </div>
      </section>
    </>
  )

  const renderDoneTaskItem = (task) => (
    <div
      key={task.id}
      className="erp-mobile-list-item rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words text-base font-semibold text-slate-950">
            {task.task_name}
          </div>
          <div className="mt-1 break-all text-sm text-slate-500">
            {resolveTaskSourceLabel(task)}
          </div>
        </div>
        <span className="shrink-0 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700">
          {task.task_status_label}
        </span>
      </div>
      <div className="mt-2 text-sm text-slate-500">
        更新时间：{formatMobileTaskTime(task.updated_at)}
      </div>
    </div>
  )

  const renderDonePanel = () => (
    <section className="mx-5 mt-5 space-y-4 pb-5">
      {renderProgressPanel()}
      <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-950">已办任务</h2>
        <div className="mt-3 space-y-3">
          {doneTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm text-slate-500">
              暂无已办任务
            </div>
          ) : (
            <>
              {getVisibleListItems(doneTasks, MOBILE_LIST_KEYS.DONE).map(
                renderDoneTaskItem
              )}
              {renderListLimitControl(
                doneTasks,
                MOBILE_LIST_KEYS.DONE,
                '条已办'
              )}
            </>
          )}
        </div>
      </section>
    </section>
  )

  const renderMessageTabs = () => {
    const items = [
      {
        key: MOBILE_MESSAGE_TAB_KEYS.WARNING,
        label: '预警',
        count: warningTasks.length,
      },
      {
        key: MOBILE_MESSAGE_TAB_KEYS.NOTICE,
        label: '通知',
        count: noticeTasks.length,
      },
    ]

    return (
      <div className="mobile-role-message-tabs" role="tablist">
        {items.map((item) => {
          const active = item.key === activeMessageTabKey
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`mobile-role-message-tab-${item.key}`}
              className={`mobile-role-message-tabs__item ${
                active ? 'mobile-role-message-tabs__item--active' : ''
              }`}
              onClick={() => setActiveMessageTabKey(item.key)}
            >
              <span>{item.label}</span>
              <span className="mobile-role-message-tabs__count">
                {item.count}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  const renderWarningMessages = () => (
    <section className="mobile-role-message-section mobile-role-message-section--warning erp-mobile-card rounded-2xl border border-amber-200 bg-amber-50/70 p-4">
      <h2 className="text-lg font-semibold text-slate-950">预警</h2>
      <div className="mt-3 space-y-2">
        {warningTasks.length === 0 ? (
          <div className="mobile-role-message-empty rounded-xl border border-dashed border-amber-200 bg-white/70 px-3 py-4 text-sm text-slate-500">
            暂无预警任务
          </div>
        ) : (
          <>
            {getVisibleListItems(warningTasks, MOBILE_LIST_KEYS.WARNING).map(
              (task) => (
                <button
                  key={task.id}
                  type="button"
                  className="mobile-role-message-card mobile-role-message-card--warning w-full rounded-xl border border-amber-200 bg-white/80 px-3 py-3 text-left"
                  onClick={() => setSelectedTaskID(task.id)}
                >
                  <div className="mobile-role-message-card__tone font-semibold text-amber-800">
                    {getTaskQueueTone(task)}
                  </div>
                  <div className="mobile-role-message-card__title mt-1 text-sm text-slate-900">
                    {task.task_name}
                  </div>
                  <div className="mobile-role-message-card__source mt-1 break-all text-xs text-amber-700">
                    {resolveTaskSourceLabel(task)}
                  </div>
                  {task.blocked_reason ? (
                    <div className="mobile-role-message-card__reason mt-1 text-sm text-red-600">
                      {task.blocked_reason}
                    </div>
                  ) : null}
                </button>
              )
            )}
            {renderListLimitControl(
              warningTasks,
              MOBILE_LIST_KEYS.WARNING,
              '条预警'
            )}
          </>
        )}
      </div>
    </section>
  )

  const renderNoticeMessages = () => (
    <section className="mobile-role-message-section mobile-role-message-section--notice erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">通知</h2>
      <div className="mt-3 space-y-2">
        {noticeTasks.length === 0 ? (
          <div className="mobile-role-message-empty rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-500">
            暂无通知
          </div>
        ) : (
          <>
            {getVisibleListItems(noticeTasks, MOBILE_LIST_KEYS.NOTICE).map(
              (task) => (
                <button
                  key={task.id}
                  type="button"
                  className="mobile-role-message-card mobile-role-message-card--notice flex w-full items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3 text-left"
                  onClick={() => setSelectedTaskID(task.id)}
                >
                  <span className="mobile-role-message-card__title min-w-0 text-sm font-medium text-slate-700">
                    {task.task_name}
                  </span>
                  <span className="mobile-role-message-card__time shrink-0 text-xs text-slate-400">
                    {formatMobileTaskTime(task.updated_at)}
                  </span>
                </button>
              )
            )}
            {renderListLimitControl(
              noticeTasks,
              MOBILE_LIST_KEYS.NOTICE,
              '条通知'
            )}
          </>
        )}
      </div>
    </section>
  )

  const renderMessagesPanel = () => (
    <section className="mobile-role-messages mx-5 mt-5 space-y-4 pb-5">
      {renderMessageTabs()}
      {activeMessageTabKey === MOBILE_MESSAGE_TAB_KEYS.WARNING
        ? renderWarningMessages()
        : renderNoticeMessages()}
    </section>
  )

  const renderMinePanel = () => {
    const roleNames = (adminProfile?.roles || [])
      .map((role) => role?.name || role?.role_key)
      .filter(Boolean)
      .join(' / ')
    return (
      <section className="mx-5 mt-5 space-y-4 pb-5">
        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-3xl text-emerald-700">
              <UserOutlined />
            </span>
            <div className="min-w-0">
              <div className="truncate text-xl font-semibold text-slate-950">
                {adminProfile?.username || '当前账号'}
              </div>
              <div className="mt-1 text-sm text-slate-500">
                {roleLabel}任务端
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <div className="text-slate-500">账号角色</div>
              <div className="mt-1 min-w-0 break-words font-semibold text-slate-950">
                {roleNames || '-'}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 px-3 py-3">
              <div className="text-slate-500">权限模式</div>
              <div className="mt-1 font-semibold text-slate-950">
                {adminProfile?.is_super_admin ? '超级管理员' : '角色授权'}
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3">
          {[
            {
              label: '待办',
              value: activeTasks.length,
              filterKey: MOBILE_TASK_FILTER_KEYS.ALL,
              testID: 'mobile-role-mine-metric-todo',
            },
            {
              label: '已办',
              value: doneTasks.length,
              mainTabKey: MOBILE_MAIN_TAB_KEYS.DONE,
              listKey: MOBILE_LIST_KEYS.DONE,
              testID: 'mobile-role-mine-metric-done',
            },
            {
              label: '超时',
              value: overdueTasks.length,
              filterKey: MOBILE_TASK_FILTER_KEYS.OVERDUE,
              testID: 'mobile-role-mine-metric-overdue',
            },
            {
              label: '风险',
              value: riskTasks.length,
              filterKey: MOBILE_TASK_FILTER_KEYS.RISK,
              testID: 'mobile-role-mine-metric-risk',
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              data-testid={item.testID}
              aria-label={`查看${item.label}任务`}
              className={`${mobileTheme.metricCard} mobile-role-mine-metric-button`}
              onClick={() =>
                openTaskBucket({
                  mainTabKey: item.mainTabKey || MOBILE_MAIN_TAB_KEYS.TODO,
                  filterKey: item.filterKey || MOBILE_TASK_FILTER_KEYS.ALL,
                  listKey: item.listKey || MOBILE_LIST_KEYS.TODO,
                })
              }
            >
              <span className="mobile-role-mine-metric-button__head">
                <span>{item.label}</span>
                <ArrowRightOutlined aria-hidden="true" />
              </span>
              <div className={mobileTheme.metricValue}>{item.value}</div>
              <small className="mobile-role-mine-metric-button__hint">
                查看任务
              </small>
            </button>
          ))}
        </section>

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-950">登录与安全</h2>
          <button
            type="button"
            data-testid="mobile-role-logout-button"
            className={`${mobileTheme.logoutButton} mt-4 w-full`}
            onClick={handleLogout}
            disabled={loggingOut || typeof handleLogout !== 'function'}
          >
            <LogoutOutlined aria-hidden="true" />
            <span>{loggingOut ? '退出中' : '退出登录'}</span>
          </button>
        </section>
      </section>
    )
  }

  const renderActiveTabPanel = () => {
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.DONE) {
      return renderDonePanel()
    }
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.MESSAGES) {
      return renderMessagesPanel()
    }
    if (activeMainTabKey === MOBILE_MAIN_TAB_KEYS.MINE) {
      return renderMinePanel()
    }
    return renderTodoPanel()
  }

  const renderBottomNavigation = () => (
    <nav
      className="mobile-role-bottom-nav"
      aria-label="移动端主导航"
      data-testid="mobile-role-bottom-nav"
    >
      {MOBILE_MAIN_TAB_ITEMS.map(({ key, label, Icon }) => {
        const active = key === activeMainTabKey
        return (
          <button
            key={key}
            type="button"
            data-testid={`mobile-role-nav-${key}`}
            aria-current={active ? 'page' : undefined}
            className={`mobile-role-bottom-nav__item ${
              active ? 'mobile-role-bottom-nav__item--active' : ''
            }`}
            onClick={() => setActiveMainTabKey(key)}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )

  const renderListScreen = () => {
    const activeTabLabel =
      MOBILE_MAIN_TAB_ITEMS.find((item) => item.key === activeMainTabKey)
        ?.label || '待办'

    return (
      <div className="mobile-role-tasks-page mobile-role-tasks-page--tabs surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
        <div
          ref={scrollContainerRef}
          className="mobile-role-tasks-page__scroll"
          data-testid="mobile-role-scroll"
          onScroll={handleMainScroll}
        >
          <header className="flex items-center justify-between gap-3 px-5 pb-3 pt-8">
            <div className="flex min-w-0 items-center gap-3">
              <h1 className="shrink-0 text-4xl font-semibold tracking-normal text-slate-950">
                {activeTabLabel}
              </h1>
              <span className="inline-flex shrink-0 items-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-base font-semibold text-emerald-700">
                {roleLabel}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <ERPThemeToggle size="small" variant="menu" />
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl px-2 py-2 text-base font-semibold text-emerald-700"
                onClick={() => loadTasks({ showRefreshFeedback: true })}
                disabled={loading}
              >
                <ReloadOutlined className={loading ? 'animate-spin' : ''} />
                <span>{loading ? '刷新中' : '刷新'}</span>
              </button>
            </div>
          </header>

          <div className="flex flex-wrap items-center gap-3 px-5 text-sm text-slate-500">
            <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            <span>最后同步：{latestSync}</span>
            <span className="text-slate-300">|</span>
            <span>{renderTabSummary()}</span>
          </div>

          {renderActiveTabPanel()}
        </div>

        {showScrollTopButton ? (
          <button
            type="button"
            className="mobile-role-scroll-top"
            data-testid="mobile-role-scroll-top"
            aria-label="回到顶部"
            onClick={scrollMainToTop}
          >
            <ArrowUpOutlined aria-hidden="true" />
          </button>
        ) : null}

        {renderBottomNavigation()}
      </div>
    )
  }

  const renderDetailScreen = () => {
    if (!selectedTask || !selectedSeverity) return null
    const factRows = buildTaskFactRows(selectedTask)
    const relatedSource = resolveTaskSourceLabel(selectedTask)
    const latestMobileAction = selectedTask.mobile_action
    const latestMobileActionRoleLabel = latestMobileAction
      ? getMobileRoleLabel(latestMobileAction.role_key || activeRoleKey)
      : roleLabel
    const showRejected = supportsRejectedAction(activeRoleKey, selectedTask)
    const isUpdating = updatingID === selectedTask.id
    const isUrging = urgingID === selectedTask.id

    return (
      <div className="mobile-role-tasks-page mobile-role-tasks-page--detail surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
        <header className="mobile-role-detail-header shrink-0 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="grid grid-cols-[112px_minmax(0,1fr)_92px] items-center gap-2 px-4 py-4">
            <button
              type="button"
              className="inline-flex items-center gap-2 text-lg text-slate-950"
              onClick={() => {
                setSelectedTaskID(null)
                setDetailAction(null)
              }}
            >
              <LeftOutlined />
              <span>任务列表</span>
            </button>
            <h1 className="truncate text-center text-2xl font-semibold text-slate-950">
              {selectedTask.task_name}
            </h1>
            <div className="flex items-center justify-end gap-2">
              <span
                className={`rounded-full px-3 py-1 text-base font-semibold ${selectedSeverity.badgeClass}`}
              >
                {selectedSeverity.label}
              </span>
              <MoreOutlined className="text-xl text-slate-700" />
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-2 px-5 pb-4 text-base text-slate-500">
            <FileTextOutlined />
            <span className="shrink-0">单号：</span>
            <span className="min-w-0 break-all">{relatedSource}</span>
          </div>
        </header>

        <main className="mobile-role-tasks-page__detail-main space-y-5 bg-slate-50 px-4 py-5">
          <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
                <FileTextOutlined className="text-blue-500" />
                任务关键信息
              </h2>
              <button
                type="button"
                className="text-base font-semibold text-blue-600"
              >
                编辑查看详情 &gt;
              </button>
            </div>
            <div className="mobile-role-detail-fact-grid mt-4 grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200">
              {factRows.slice(0, 6).map(([label, value]) => (
                <div
                  key={label}
                  className="min-h-[84px] border-b border-r border-slate-200 p-4 last:border-b-0"
                >
                  <div className="text-base text-slate-500">{label}</div>
                  <div className="mt-2 break-words text-lg font-medium text-slate-950">
                    {value || '-'}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {selectedTask.business_status_label || selectedTask.blocked_reason ? (
            <section className="mobile-role-detail-risk rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-lg font-semibold text-red-700">
              <ExclamationCircleFilled className="mr-2" />
              {selectedTask.business_status_label || '任务需要处理'}
              {selectedTask.blocked_reason
                ? ` · ${selectedTask.blocked_reason}`
                : ' · 需要确认后继续流转'}
            </section>
          ) : null}

          {selectedTask.mobile_exception_report ? (
            <section className="mobile-role-detail-exception rounded-2xl border border-orange-200 bg-orange-50 px-4 py-4 text-base text-orange-800">
              <div className="font-semibold">异常上报</div>
              <div className="mt-2 break-words">
                {selectedTask.mobile_exception_report.reason || '已记录异常'}
              </div>
            </section>
          ) : null}

          <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
                <LinkOutlined className="text-purple-500" />
                关联单据（1）
              </h2>
              <button
                type="button"
                className="text-base font-semibold text-blue-600"
              >
                查看全部 &gt;
              </button>
            </div>
            <div className="mobile-role-detail-related-item mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-base text-slate-600">
              <span className="min-w-0 break-all">订单：{relatedSource}</span>
              <span className="shrink-0 text-slate-400">&gt;</span>
            </div>
          </section>

          <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
                <CameraOutlined className="text-emerald-500" />
                现场留痕
              </h2>
              <span className="text-sm font-semibold text-slate-400">可选</span>
            </div>
            <textarea
              data-testid="mobile-role-evidence-input"
              className="mt-4 min-h-[96px] w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="填写照片、附件编号或链接；多条可换行"
              maxLength={500}
              value={detailEvidenceValue}
              onChange={(event) => updateEvidenceText(event.target.value)}
            />
            <div className="mt-1 text-right text-sm text-slate-400">
              {detailEvidenceValue.length}/500
            </div>
            {savedEvidenceRefs.length > 0 ? (
              <div
                data-testid="mobile-role-saved-evidence"
                className="mt-3 flex flex-wrap gap-2"
              >
                {savedEvidenceRefs.map((ref) => (
                  <span
                    key={ref}
                    className="min-w-0 max-w-full break-all rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-sm font-semibold text-emerald-700"
                  >
                    {ref}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 text-2xl font-semibold text-slate-950">
                <ClockCircleOutlined className="text-orange-500" />
                最近动态
              </h2>
              <button
                type="button"
                className="text-base font-semibold text-blue-600"
              >
                查看全部 &gt;
              </button>
            </div>
            <div className="mobile-role-detail-event mt-4 rounded-xl bg-slate-50 px-4 py-4">
              <div className="flex items-start gap-3">
                <span className="mt-1 h-3 w-3 rounded-full bg-blue-500" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-950">
                    <span>系统</span>
                    <span className="rounded-md bg-blue-100 px-2 py-1 text-sm text-blue-700">
                      {selectedTask.task_status_label}
                    </span>
                    <span className="text-sm text-slate-400">
                      {formatMobileTaskTime(selectedTask.updated_at)}
                    </span>
                  </div>
                  <div className="mt-2 break-words text-base text-slate-700">
                    {latestMobileAction
                      ? `${latestMobileActionRoleLabel} 已执行 ${
                          latestMobileAction.action_key || '移动处理'
                        }${
                          latestMobileAction.reason
                            ? `：${latestMobileAction.reason}`
                            : ''
                        }`
                      : `任务已流转至 ${roleLabel} / ${
                          selectedTask.owner_role_key || '-'
                        }`}
                  </div>
                  {latestMobileAction?.evidence_refs?.length > 0 ? (
                    <div className="mt-2 break-words text-sm text-slate-500">
                      留痕：{latestMobileAction.evidence_refs.join(' / ')}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {detailAction ? (
            <section className="rounded-t-[28px] border border-slate-200 bg-white p-4 shadow-[0_-8px_28px_rgba(15,23,42,0.10)]">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-2xl font-semibold text-slate-950">
                  {resolveDetailActionLabel(detailAction)}
                  <span className="ml-2 text-red-500">·</span>
                </h2>
                <button
                  type="button"
                  className="text-base text-slate-500"
                  onClick={() => setDetailAction(null)}
                >
                  收起 ^
                </button>
              </div>
              <textarea
                className="mt-4 min-h-[128px] w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="请填写原因，至少 5 个字..."
                maxLength={500}
                value={detailReasonValue}
                onChange={(event) => updateDetailReason(event.target.value)}
              />
              <div className="mt-1 text-right text-sm text-slate-400">
                {detailReasonValue.length}/500
              </div>
              <div className="mt-4 text-base text-slate-500">
                快捷选择（可选）
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_REASONS.map((reason) => (
                  <button
                    key={reason}
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-base text-slate-600"
                    onClick={() => appendQuickReason(reason)}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-600"
                  onClick={() => setDetailAction(null)}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white disabled:opacity-50"
                  disabled={isUpdating || isUrging}
                  onClick={submitDetailAction}
                >
                  提交
                </button>
              </div>
            </section>
          ) : null}
        </main>

        <div className="mobile-role-action-bar grid grid-cols-4 gap-3 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
          <button
            type="button"
            className="mobile-role-action-bar__button mobile-role-action-bar__button--processing rounded-xl bg-blue-600 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'processing')}
          >
            <CaretRightOutlined className="mr-2" />
            处理
          </button>
          <button
            type="button"
            className="mobile-role-action-bar__button mobile-role-action-bar__button--blocked rounded-xl bg-orange-500 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'blocked')}
          >
            <PauseOutlined className="mr-2" />
            阻塞
          </button>
          <button
            type="button"
            className="mobile-role-action-bar__button mobile-role-action-bar__button--done rounded-xl bg-emerald-600 px-3 py-4 text-lg font-semibold text-white disabled:opacity-50"
            disabled={!selectedCanOperate || isUpdating}
            onClick={() => handleTaskAction(selectedTask, 'done')}
          >
            <CheckOutlined className="mr-2" />
            完成
          </button>
          <button
            type="button"
            className="mobile-role-action-bar__button mobile-role-action-bar__button--urge rounded-xl border border-slate-200 bg-white px-3 py-4 text-lg font-semibold text-slate-700 disabled:opacity-50"
            disabled={!selectedCanUrge || isUrging}
            onClick={() => handleTaskAction(selectedTask, 'urge')}
          >
            <BellOutlined className="mr-2" />
            催办
          </button>
          {showRejected ? (
            <button
              type="button"
              className="mobile-role-action-bar__button mobile-role-action-bar__button--rejected col-span-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-base font-semibold text-red-600 disabled:opacity-50"
              disabled={!selectedCanOperate || isUpdating}
              onClick={() => handleTaskAction(selectedTask, 'rejected')}
            >
              退回当前任务
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  return selectedTask ? renderDetailScreen() : renderListScreen()
}
