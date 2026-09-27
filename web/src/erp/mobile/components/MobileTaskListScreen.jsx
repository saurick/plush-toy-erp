import '../mobileMine.css'
import React, { useEffect, useId, useRef, useState } from 'react'
import { Empty } from 'antd'
import {
  ArrowUpOutlined,
  BarChartOutlined,
  BellOutlined,
  FileTextOutlined,
  KeyOutlined,
  InboxOutlined,
  LogoutOutlined,
  ReloadOutlined,
  RightOutlined,
  SafetyCertificateOutlined,
  SwapOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import FilterChip from '@/common/components/navigation/FilterChip'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import MobileProgressPanel from './MobileProgressPanel'
import MobileSearchInput from '@/common/components/navigation/MobileSearchInput'
import WorkflowTaskIdentity from '../../components/workflow/WorkflowTaskIdentity.jsx'
import AccountPasswordModal from '../../components/AccountPasswordModal.jsx'
import WorkflowTaskCard from '../../components/workflow/WorkflowTaskCard.jsx'
import { WorkflowTaskSource } from '../../components/workflow/WorkflowTaskCopy.jsx'
import WorkflowTaskTiming from '../../components/workflow/WorkflowTaskTiming.jsx'
import { getWorkflowTaskIdentity } from '../../utils/workflowTaskIdentity.mjs'
import MobileTaskListSkeleton from './MobileTaskListSkeleton.jsx'
import MobileTaskListOptions from './MobileTaskListOptions.jsx'
import MobileTaskListToolbar from './MobileTaskListToolbar.jsx'
import MobileTaskPullRefresh from './MobileTaskPullRefresh.jsx'
import MobileNavigationIcon from './MobileNavigationIcon.jsx'
import useMobileNavigationCounts from '../hooks/useMobileNavigationCounts'
import {
  MOBILE_LIST_COLLAPSED_LIMITS,
  MOBILE_LIST_KEYS,
  MOBILE_MAIN_TAB_KEYS,
  MOBILE_MESSAGE_TAB_KEYS,
  MOBILE_TASK_FILTER_KEYS,
  getTaskQueueTone,
  getTaskSeverityView,
  resolveTaskBusinessChip,
  resolveTaskListMeta,
  resolveTaskReason,
  resolveTaskReasonLabel,
  resolveMobileTaskStatusLabel,
} from '../utils/mobileRoleTaskModel.mjs'

const MOBILE_MAIN_TAB_ITEMS = [
  { key: 'tasks', label: '任务', Icon: InboxOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MESSAGES, label: '风险', Icon: BellOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MINE, label: '我的', Icon: UserOutlined },
]

export default function MobileTaskListScreen({
  activeFilterKey,
  progressAccess,
  accessScopeKey,
  activeRoleKey,
  onOpenProgressTask,
  activeMainTabKey,
  activeMessageTabKey,
  activeViewHasData,
  activeViewHasMore,
  adminProfile,
  authoritativeTaskCounts,
  canEnterDesktop,
  canViewApprovalInbox,
  doneTasks,
  filterItems,
  filteredTasks,
  handleLogout,
  handleOpenLegalNotice,
  handleMainScroll,
  handleSwitchEntry,
  initialLoading,
  loadError,
  loadTasks,
  loadMoreActiveView,
  loading,
  loadingMore,
  loggingOut,
  overdueTasks,
  riskTasks,
  riskScope,
  roleLabel,
  refreshScopeKey,
  runtimeBuildIdentity,
  serverDataTime,
  scrollContainerRef,
  scrollMainToTop,
  selectedTask,
  setActiveFilterKey,
  setActiveMainTabKey,
  setActiveMessageTabKey,
  setDetailAction,
  setSelectedTaskID,
  showScrollTopButton,
  taskKeyword,
  taskSortKey,
  taskStatusKey,
  onTaskListOptionsChange,
  onSearchTasks,
  visibleListLimitsByKey,
  setVisibleListLimitsByKey,
}) {
  const navigationId = useId()
  const navigationCounts = useMobileNavigationCounts({
    adminProfile,
    roleKey: activeRoleKey,
    refreshRevision: authoritativeTaskCounts,
  })
  const isProgress = activeMainTabKey === MOBILE_MAIN_TAB_KEYS.PROGRESS
  const isTasks = [
    MOBILE_MAIN_TAB_KEYS.TODO,
    MOBILE_MAIN_TAB_KEYS.DONE,
  ].includes(activeMainTabKey)
  const canFilterTaskList = [
    MOBILE_MAIN_TAB_KEYS.TODO,
    MOBILE_MAIN_TAB_KEYS.MESSAGES,
  ].includes(activeMainTabKey)
  const lastTaskTab = useRef(MOBILE_MAIN_TAB_KEYS.TODO)
  if (isTasks) lastTaskTab.current = activeMainTabKey
  const navigationItems = progressAccess?.enabled
    ? [
        {
          key: MOBILE_MAIN_TAB_KEYS.PROGRESS,
          label: '进度',
          Icon: BarChartOutlined,
        },
        ...MOBILE_MAIN_TAB_ITEMS,
      ]
    : MOBILE_MAIN_TAB_ITEMS
  const activeNavigationKey = isTasks ? 'tasks' : activeMainTabKey
  const [keywordDraft, setKeywordDraft] = useState(taskKeyword || '')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const searchTimerRef = useRef(null)
  const composingSearchRef = useRef(false)
  const submittedKeywordRef = useRef(taskKeyword || '')

  useEffect(() => {
    const keyword = taskKeyword || ''
    if (keyword === submittedKeywordRef.current) return
    clearTimeout(searchTimerRef.current)
    submittedKeywordRef.current = keyword
    setKeywordDraft(keyword)
  }, [taskKeyword])

  useEffect(() => () => clearTimeout(searchTimerRef.current), [])

  useEffect(() => {
    if (activeMainTabKey !== MOBILE_MAIN_TAB_KEYS.MINE) return
    clearTimeout(searchTimerRef.current)
    composingSearchRef.current = false
    setKeywordDraft(taskKeyword || '')
  }, [activeMainTabKey, taskKeyword])

  const searchTasks = (value, immediate = false) => {
    clearTimeout(searchTimerRef.current)
    const keyword = value.trim()
    if (keyword === submittedKeywordRef.current) return
    const submit = () => {
      submittedKeywordRef.current = keyword
      onSearchTasks(keyword)
    }
    if (immediate || !keyword) submit()
    else searchTimerRef.current = setTimeout(submit, 300)
  }

  const activeTodoListKey =
    activeFilterKey === MOBILE_TASK_FILTER_KEYS.APPROVAL
      ? MOBILE_LIST_KEYS.APPROVAL
      : MOBILE_LIST_KEYS.TODO
  const activeFilterLabel =
    filterItems.find((item) => item.key === activeFilterKey)?.label || '当前'
  const taskListLoading = loading && !activeViewHasData && !initialLoading
  const getCollapsedListLimit = (listKey) =>
    MOBILE_LIST_COLLAPSED_LIMITS[listKey] || Number.POSITIVE_INFINITY

  const getVisibleListLimit = (items, listKey) => {
    const collapsedLimit = getCollapsedListLimit(listKey)
    const configuredLimit = Number(visibleListLimitsByKey[listKey] || 0)
    const visibleLimit = configuredLimit > 0 ? configuredLimit : collapsedLimit
    return Math.min(items.length, visibleLimit)
  }

  const setNextVisibleListBatch = async (items, listKey) => {
    const collapsedLimit = getCollapsedListLimit(listKey)
    const currentLimit = getVisibleListLimit(items, listKey)
    const remainingLoadedCount = Math.max(0, items.length - currentLimit)
    const shouldLoadNextPage =
      activeViewHasMore && remainingLoadedCount <= collapsedLimit
    const nextLimit = shouldLoadNextPage
      ? currentLimit + collapsedLimit
      : Math.min(items.length, currentLimit + collapsedLimit)
    setVisibleListLimitsByKey((current) => ({
      ...current,
      [listKey]: nextLimit,
    }))
    if (shouldLoadNextPage) {
      await loadMoreActiveView()
    }
  }

  const resetVisibleListLimit = (listKey) => {
    setVisibleListLimitsByKey((current) => {
      const next = { ...current }
      delete next[listKey]
      return next
    })
  }

  const getVisibleListItems = (items, listKey) =>
    items.slice(0, getVisibleListLimit(items, listKey))

  const renderListLimitControl = (items, listKey, noun = '条') => {
    const collapsedLimit = getCollapsedListLimit(listKey)
    if (items.length <= collapsedLimit && !activeViewHasMore) return null
    const visibleLimit = getVisibleListLimit(items, listKey)
    const remainingCount = items.length - visibleLimit
    const nextCount = Math.min(collapsedLimit, remainingCount)
    const fullyVisible = remainingCount <= 0 && !activeViewHasMore
    const needsNextPage = activeViewHasMore && remainingCount <= collapsedLimit
    const nounLabel = String(noun).replace(/^条/u, '') || '内容'
    const actionLabel = loadingMore
      ? `正在加载更多${nounLabel}`
      : fullyVisible
        ? '收起'
        : needsNextPage
          ? `显示更多${nounLabel}`
          : `再显示 ${nextCount} ${noun}`
    return (
      <div className="mobile-role-list-control">
        <button
          type="button"
          data-testid={`mobile-role-list-toggle-${listKey}`}
          data-total-item-count={items.length}
          data-visible-item-count={visibleLimit}
          data-has-more={activeViewHasMore ? 'true' : 'false'}
          className="mobile-role-list-control__button"
          onClick={() =>
            fullyVisible
              ? resetVisibleListLimit(listKey)
              : setNextVisibleListBatch(items, listKey)
          }
          disabled={loadingMore}
          aria-busy={loadingMore ? 'true' : 'false'}
        >
          <span>{actionLabel}</span>
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
    if (
      mainTabKey !== MOBILE_MAIN_TAB_KEYS.MINE &&
      activeMainTabKey !== MOBILE_MAIN_TAB_KEYS.MINE
    ) {
      resetVisibleListLimit(listKey)
    }
  }

  const renderTaskRow = (task) => {
    const severity = getTaskSeverityView(task)
    const identity = getWorkflowTaskIdentity(task)
    const listMeta =
      !task.display_context && !identity.items.length
        ? resolveTaskListMeta(task)
        : ''
    const isSelected = String(selectedTask?.id) === String(task.id)
    const businessLabel = resolveTaskBusinessChip(task)
    return (
      <WorkflowTaskCard
        key={task.id}
        label={`查看${getWorkflowTaskDisplayName(task)}详情`}
        data-mobile-task-id={task.id}
        data-task-code={task.task_code || undefined}
        className={`erp-mobile-list-item mobile-task-list-row w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left transition hover:bg-emerald-50/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 ${severity.rowClass} ${
          isSelected ? 'ring-2 ring-emerald-500/40' : ''
        }`}
        onOpen={() => {
          setSelectedTaskID(task.id)
          setDetailAction(null)
        }}
      >
        <div className="mobile-task-list-row__head">
          <span className="mobile-task-list-row__identity">
            <WorkflowTaskIdentity
              task={task}
              compact
              copyable={false}
              showTaskName
            />
          </span>
          <span
            className={`inline-flex min-w-[52px] items-center justify-center rounded-md border px-2 py-1 text-sm font-semibold ${severity.badgeClass}`}
          >
            {task.task_status_key === 'blocked'
              ? resolveMobileTaskStatusLabel(task)
              : severity.label === '普通'
                ? '待处理'
                : severity.label}
          </span>
        </div>
        <div className="mobile-task-list-row__body min-w-0">
          <div className="mobile-task-list-row__source text-sm leading-5 text-slate-500">
            <FileTextOutlined aria-hidden="true" />
            <span className="mobile-task-list-row__source-text">
              <WorkflowTaskSource task={task} copyable={false} />
            </span>
          </div>
          {listMeta ? (
            <div className="mt-2 flex min-w-0 items-start gap-1 text-sm leading-5 text-slate-600">
              <span className="min-w-0 break-words">{listMeta}</span>
            </div>
          ) : null}
          {resolveTaskReason(task) ? (
            <div className="mobile-task-list-row__reason text-sm leading-5 text-red-500">
              {resolveTaskReasonLabel(task)}：{resolveTaskReason(task)}
            </div>
          ) : null}
        </div>
        <div className="mobile-task-list-row__footer min-w-0">
          <div className="mobile-task-list-row__context text-sm leading-5 text-slate-500">
            <WorkflowTaskTiming task={task} />
            {businessLabel &&
            businessLabel !== resolveMobileTaskStatusLabel(task) ? (
              <span>{businessLabel}</span>
            ) : null}
          </div>
        </div>
      </WorkflowTaskCard>
    )
  }

  const renderTaskFilters = () => {
    return (
      <div
        data-testid="mobile-role-task-filters"
        className={`mobile-role-task-filters mobile-role-task-filters--${activeFilterKey} mx-4 mt-4`}
        role="group"
        aria-label="任务快捷筛选"
      >
        {filterItems.map((item) => {
          const active = item.key === activeFilterKey
          const countAvailable =
            Number.isSafeInteger(item.count) && item.count >= 0
          return (
            <FilterChip
              key={item.key}
              data-testid={`mobile-role-filter-${item.key}`}
              selected={active}
              aria-label={`${item.ariaLabel || item.label}，${
                countAvailable ? `共 ${item.count} 条` : '数量暂不可用'
              }`}
              className="mobile-role-task-filter"
              onClick={() => {
                setActiveFilterKey(item.key)
                setSelectedTaskID(null)
                setDetailAction(null)
                resetVisibleListLimit(
                  item.key === MOBILE_TASK_FILTER_KEYS.APPROVAL
                    ? MOBILE_LIST_KEYS.APPROVAL
                    : MOBILE_LIST_KEYS.TODO
                )
              }}
            >
              <span className="mobile-role-task-filter__content">
                <span className="mobile-role-task-filter__label">
                  {item.label}
                </span>
                <span className="mobile-role-count-tag mobile-role-task-filter__count">
                  {countAvailable ? item.count : '—'}
                </span>
              </span>
            </FilterChip>
          )
        })}
      </div>
    )
  }

  const renderListToolbar = (tabs) => <MobileTaskListToolbar tabs={tabs} />

  const renderEmptyState = (description) =>
    loading || loadError ? null : <Empty description={description} />

  const renderListFeedback = () => (
    <>
      <MobileTaskPullRefresh
        key={`${refreshScopeKey}|${activeMainTabKey}|${activeFilterKey}|${activeMessageTabKey}`}
        scrollContainerRef={scrollContainerRef}
        enabled
        busy={loading || loadingMore || initialLoading}
        onRefresh={loadTasks}
        lastUpdated={serverDataTime}
      />
      {loadError ? (
        <section
          className="mobile-role-load-error mx-4 mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-red-800"
          role="alert"
        >
          <strong className="block text-base">任务加载失败</strong>
          <p className="mt-1 text-sm leading-6">
            {loadError}。
            {activeViewHasData
              ? '当前保留上次已加载内容。'
              : '当前没有可确认的任务数据，请重试。'}
          </p>
          <button
            type="button"
            className="mt-3 min-h-11 rounded-xl border border-red-300 bg-white px-4 text-sm font-semibold text-red-700"
            onClick={() => loadTasks()}
            disabled={loading}
          >
            {loading ? '重新加载中' : '重新加载'}
          </button>
        </section>
      ) : null}
    </>
  )

  const renderTodoPanel = () =>
    initialLoading ? (
      <MobileTaskListSkeleton filterCount={canViewApprovalInbox ? 4 : 3} />
    ) : (
      <>
        {renderListToolbar(renderTaskFilters())}
        {renderListFeedback()}
        <section className="mobile-task-results">
          <div
            className="erp-sr-only"
            data-testid="mobile-task-list-range"
            aria-live="polite"
          >
            已显示{' '}
            {getVisibleListItems(filteredTasks, activeTodoListKey).length} 项
            {' / '}共{' '}
            {filterItems.find((item) => item.key === activeFilterKey)?.count ??
              '—'}{' '}
            项
          </div>
          <div
            className="mobile-task-list min-w-0"
            data-testid="mobile-role-task-list"
            aria-busy={taskListLoading ? 'true' : 'false'}
          >
            {taskListLoading ? (
              <div
                className="flex min-h-40 flex-col items-center justify-center gap-3 px-5 py-8 text-center text-sm text-slate-500"
                data-testid="mobile-role-task-list-loading"
                role="status"
                aria-live="polite"
              >
                <ReloadOutlined
                  className="animate-spin text-xl text-emerald-600"
                  aria-hidden="true"
                />
                <span>正在加载{activeFilterLabel}任务</span>
              </div>
            ) : filteredTasks.length === 0 ? (
              <>
                {renderEmptyState('当前筛选下暂无任务')}
                {renderListLimitControl(
                  filteredTasks,
                  activeTodoListKey,
                  '条任务'
                )}
              </>
            ) : (
              <div className="grid gap-3">
                {getVisibleListItems(filteredTasks, activeTodoListKey).map(
                  renderTaskRow
                )}
                {renderListLimitControl(
                  filteredTasks,
                  activeTodoListKey,
                  '条任务'
                )}
              </div>
            )}
          </div>
        </section>
      </>
    )

  const renderDoneTaskItem = (task) => {
    const rejected = String(task.task_status_key || '').trim() === 'rejected'
    return (
      <WorkflowTaskCard
        key={task.id}
        data-mobile-task-id={task.id}
        data-task-code={task.task_code || undefined}
        className="erp-mobile-list-item mobile-task-list-row w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left"
        label={`查看${getWorkflowTaskDisplayName(task)}处理结果`}
        onOpen={() => {
          setSelectedTaskID(task.id)
          setDetailAction(null)
        }}
      >
        <div className="mobile-task-list-row__head">
          <span className="mobile-task-list-row__identity">
            <WorkflowTaskIdentity
              task={task}
              compact
              copyable={false}
              showTaskName
            />
          </span>
          <span
            className={`shrink-0 rounded-md border px-2 py-1 text-sm font-semibold ${
              rejected
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
            }`}
          >
            {resolveMobileTaskStatusLabel(task)}
          </span>
        </div>
        <div className="mobile-task-list-row__body min-w-0">
          <div className="mobile-task-list-row__source text-sm leading-5 text-slate-500">
            <FileTextOutlined aria-hidden="true" />
            <span className="mobile-task-list-row__source-text">
              <WorkflowTaskSource task={task} copyable={false} />
            </span>
          </div>
        </div>
        <div className="mobile-task-list-row__footer min-w-0">
          <div className="mobile-task-list-row__context text-sm leading-5 text-slate-500">
            <WorkflowTaskTiming task={task} />
          </div>
        </div>
      </WorkflowTaskCard>
    )
  }

  const renderDonePanel = () => (
    <>
      {renderListFeedback()}
      <section className="mobile-task-results mobile-task-history">
        <section>
          <div className="mobile-task-history-summary">
            <h2>已办任务</h2>
            <span
              className="mobile-role-count-tag mobile-role-section-count"
              data-testid="mobile-role-done-count"
              aria-label={
                authoritativeTaskCounts
                  ? `已办任务共 ${authoritativeTaskCounts.history} 条，当前已加载 ${doneTasks.length} 条`
                  : `已办任务总数暂不可用，当前已加载 ${doneTasks.length} 条`
              }
            >
              {authoritativeTaskCounts?.history ?? '—'}
            </span>
          </div>
          <div className="space-y-3">
            {doneTasks.length === 0 ? (
              <>
                {renderEmptyState('暂无已办任务')}
                {renderListLimitControl(
                  doneTasks,
                  MOBILE_LIST_KEYS.DONE,
                  '条已办'
                )}
              </>
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
    </>
  )

  const renderMessageTabs = () => {
    const items = [
      {
        key: MOBILE_MESSAGE_TAB_KEYS.WARNING,
        label: riskScope === 'supervised' ? '跨岗风险' : '风险',
        count: authoritativeTaskCounts?.risk ?? '—',
      },
      {
        key: MOBILE_MESSAGE_TAB_KEYS.NOTICE,
        label: '超时',
        count: authoritativeTaskCounts?.overdue ?? '—',
      },
    ]

    return (
      <SlidingTabList
        className={`mobile-role-message-tabs mobile-role-message-tabs--${activeMessageTabKey}`}
        aria-label="风险类别"
      >
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
              <span className="mobile-role-count-tag mobile-role-message-tabs__count">
                {item.count}
              </span>
            </button>
          )
        })}
      </SlidingTabList>
    )
  }

  const renderWarningMessages = () => (
    <section
      className={`mobile-role-message-section erp-mobile-card rounded-2xl border p-4 ${
        riskTasks.length > 0
          ? 'mobile-role-message-section--warning border-amber-200 bg-amber-50/70'
          : 'border-slate-200 bg-white'
      }`}
    >
      <h2 className="text-lg font-semibold text-slate-950">
        {riskScope === 'supervised' ? '跨岗风险' : '风险'}
      </h2>
      <div className="mt-3 space-y-2">
        {riskTasks.length === 0 ? (
          <>
            {renderEmptyState('暂无风险任务')}
            {renderListLimitControl(
              riskTasks,
              MOBILE_LIST_KEYS.WARNING,
              '条风险'
            )}
          </>
        ) : (
          <>
            {getVisibleListItems(riskTasks, MOBILE_LIST_KEYS.WARNING).map(
              (task) => (
                <WorkflowTaskCard
                  key={task.id}
                  label={`查看${getWorkflowTaskDisplayName(task)}详情`}
                  data-mobile-task-id={task.id}
                  className="mobile-role-message-card mobile-role-message-card--warning w-full rounded-xl border border-amber-200 bg-white/80 px-3 py-3 text-left"
                  onOpen={() => setSelectedTaskID(task.id)}
                >
                  <div className="mobile-role-message-card__tone font-semibold text-amber-800">
                    {getTaskQueueTone(task)}
                  </div>
                  <div className="mobile-role-message-card__title mt-1">
                    <WorkflowTaskIdentity
                      task={task}
                      compact
                      copyable={false}
                      showTaskName
                    />
                  </div>
                  <div className="mobile-role-message-card__source mt-1 break-all text-xs text-amber-700">
                    <WorkflowTaskSource task={task} copyable={false} />
                  </div>
                  {resolveTaskReason(task) ? (
                    <div className="mobile-role-message-card__reason mt-1 text-sm text-red-600">
                      {resolveTaskReasonLabel(task)}：{resolveTaskReason(task)}
                    </div>
                  ) : null}
                  <div className="mt-2">
                    <WorkflowTaskTiming task={task} />
                  </div>
                </WorkflowTaskCard>
              )
            )}
            {renderListLimitControl(
              riskTasks,
              MOBILE_LIST_KEYS.WARNING,
              '条风险'
            )}
          </>
        )}
      </div>
    </section>
  )

  const renderNoticeMessages = () => (
    <section className="mobile-role-message-section mobile-role-message-section--notice erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-slate-950">超时</h2>
      <div className="mt-3 space-y-2">
        {overdueTasks.length === 0 ? (
          <>
            {renderEmptyState('暂无超时任务')}
            {renderListLimitControl(
              overdueTasks,
              MOBILE_LIST_KEYS.NOTICE,
              '条超时'
            )}
          </>
        ) : (
          <>
            {getVisibleListItems(overdueTasks, MOBILE_LIST_KEYS.NOTICE).map(
              (task) => (
                <WorkflowTaskCard
                  key={task.id}
                  label={`查看${getWorkflowTaskDisplayName(task)}详情`}
                  data-mobile-task-id={task.id}
                  className="mobile-role-message-card mobile-role-message-card--notice w-full rounded-xl bg-slate-50 px-3 py-3 text-left"
                  onOpen={() => setSelectedTaskID(task.id)}
                >
                  <span className="min-w-0">
                    <WorkflowTaskIdentity
                      task={task}
                      compact
                      copyable={false}
                      showTaskName
                    />
                    <span className="mobile-role-message-card__source mt-1 block break-all text-xs text-slate-500">
                      <WorkflowTaskSource task={task} copyable={false} />
                    </span>
                  </span>
                  <div className="mt-2">
                    <WorkflowTaskTiming task={task} />
                  </div>
                </WorkflowTaskCard>
              )
            )}
            {renderListLimitControl(
              overdueTasks,
              MOBILE_LIST_KEYS.NOTICE,
              '条超时'
            )}
          </>
        )}
      </div>
    </section>
  )

  const renderMessagesPanel = () => (
    <>
      {renderListToolbar(renderMessageTabs())}
      {renderListFeedback()}
      <section className="mobile-role-messages mx-4 mt-5 space-y-4 pb-5">
        {activeMessageTabKey === MOBILE_MESSAGE_TAB_KEYS.WARNING
          ? renderWarningMessages()
          : renderNoticeMessages()}
      </section>
    </>
  )

  const renderMinePanel = () => {
    return (
      <section className="mobile-mine-panel">
        <section className="mobile-mine-card">
          <div className="mobile-mine-identity">
            <span className="mobile-mine-avatar">
              <UserOutlined />
            </span>
            <div>
              <strong>
                {adminProfile?.display_name ||
                  adminProfile?.username ||
                  '当前账号'}
              </strong>
              {adminProfile?.display_name && adminProfile?.username ? (
                <span>账号：{adminProfile.username}</span>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mobile-mine-card mobile-task-display-settings">
          <h2>显示设置</h2>
          <ERPThemeToggle variant="settings" />
        </section>

        <section className="mobile-mine-card">
          <h2>入口与安全</h2>
          <div className="mobile-mine-actions">
            <button
              type="button"
              className="mobile-mine-action"
              onClick={() => setPasswordModalOpen(true)}
            >
              <KeyOutlined aria-hidden="true" />
              <span>修改密码</span>
              <RightOutlined aria-hidden="true" />
            </button>
            {passwordModalOpen ? (
              <AccountPasswordModal
                onClose={() => setPasswordModalOpen(false)}
              />
            ) : null}
            {canEnterDesktop ? (
              <button
                type="button"
                data-testid="mobile-role-work-entry-switch"
                className="mobile-mine-action"
                onClick={handleSwitchEntry}
              >
                <SwapOutlined aria-hidden="true" />
                <span>切换工作入口</span>
                <RightOutlined aria-hidden="true" />
              </button>
            ) : null}
            <button
              type="button"
              data-testid="mobile-privacy-rules-entry"
              className="mobile-mine-action"
              onClick={handleOpenLegalNotice}
            >
              <SafetyCertificateOutlined aria-hidden="true" />
              <span>隐私与使用规则</span>
              <RightOutlined aria-hidden="true" />
            </button>
          </div>
        </section>

        <section
          className="mobile-mine-card"
          data-testid="mobile-system-version-card"
        >
          <h2>系统信息</h2>
          <dl className="mobile-mine-facts">
            <div>
              <dt>系统版本</dt>
              <dd data-testid="mobile-system-version-value">
                {runtimeBuildIdentity.status.systemVersion}
              </dd>
            </div>
            <div>
              <dt>构建号</dt>
              <dd>{runtimeBuildIdentity.web.gitSHAShort || '未标记'}</dd>
            </div>
          </dl>
          <p
            className="mobile-mine-version"
            data-testid="mobile-system-version-status"
          >
            {runtimeBuildIdentity.status.label}
          </p>
          {runtimeBuildIdentity.status.key === 'unavailable' ? (
            <button
              type="button"
              className="mobile-mine-action"
              onClick={runtimeBuildIdentity.retry}
              disabled={runtimeBuildIdentity.loading}
            >
              <ReloadOutlined aria-hidden="true" />
              <span>
                {runtimeBuildIdentity.loading ? '核对中' : '重新核对版本'}
              </span>
              <RightOutlined aria-hidden="true" />
            </button>
          ) : null}
        </section>

        <section className="mobile-mine-card">
          <button
            type="button"
            data-testid="mobile-role-logout-button"
            className="mobile-mine-action mobile-mine-action--danger"
            onClick={handleLogout}
            disabled={loggingOut || typeof handleLogout !== 'function'}
          >
            <LogoutOutlined aria-hidden="true" />
            <span>{loggingOut ? '退出中' : '退出登录'}</span>
            <RightOutlined aria-hidden="true" />
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
    <SlidingTabList
      className="mobile-role-bottom-nav"
      style={{
        gridTemplateColumns: `repeat(${navigationItems.length}, minmax(0, 1fr))`,
      }}
      aria-label="移动端主导航"
      data-testid="mobile-role-bottom-nav"
    >
      {navigationItems.map(({ key, label, Icon }) => {
        const active = key === activeNavigationKey
        const badgeCount =
          key === 'tasks'
            ? navigationCounts.counts?.todo
            : key === MOBILE_MAIN_TAB_KEYS.MESSAGES
              ? navigationCounts.counts?.risk
              : undefined
        const countDescription = Number.isSafeInteger(badgeCount)
          ? `${badgeCount} 项${key === 'tasks' ? '待办' : '风险任务'}${navigationCounts.error ? '，数量待更新' : ''}`
          : undefined
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={label}
            aria-describedby={
              countDescription ? `${navigationId}-${key}-count` : undefined
            }
            data-testid={`mobile-role-nav-${key}`}
            aria-current={active ? 'page' : undefined}
            className={`mobile-role-bottom-nav__item ${active ? 'mobile-role-bottom-nav__item--active' : ''}`}
            onClick={() => {
              if (active) return
              openTaskBucket({
                mainTabKey: key === 'tasks' ? lastTaskTab.current : key,
                filterKey: activeFilterKey,
              })
            }}
          >
            <MobileNavigationIcon
              Icon={Icon}
              count={badgeCount}
              risk={key === MOBILE_MAIN_TAB_KEYS.MESSAGES}
            />
            <span className="mobile-role-bottom-nav__label">{label}</span>
            {countDescription && (
              <span id={`${navigationId}-${key}-count`} className="sr-only">
                {countDescription}
              </span>
            )}
          </button>
        )
      })}
    </SlidingTabList>
  )
  const activeTabLabel =
    navigationItems.find((item) => item.key === activeNavigationKey)?.label ||
    '任务'

  return (
    <div className="mobile-role-tasks-page mobile-role-tasks-page--tabs erp-mobile-controls md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
      <div
        ref={scrollContainerRef}
        style={{ display: isProgress ? 'none' : undefined }}
        className={`mobile-role-tasks-page__scroll${
          activeMainTabKey !== MOBILE_MAIN_TAB_KEYS.MINE
            ? ' mobile-role-tasks-page__scroll--pull-refresh'
            : ''
        }`}
        data-testid="mobile-role-scroll"
        aria-busy={initialLoading ? 'true' : 'false'}
        data-refreshing={loading || loadingMore ? 'true' : 'false'}
        onScroll={handleMainScroll}
      >
        <header className="erp-sr-only" data-testid="mobile-task-list-header">
          <div className="flex min-w-0 items-center gap-2">
            <h1
              className="shrink-0 text-xl font-semibold tracking-normal text-slate-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
              data-testid="mobile-role-list-heading"
              tabIndex={-1}
            >
              {activeTabLabel}
            </h1>
            <span
              className="min-w-0 truncate text-sm text-slate-500"
              aria-label={`${adminProfile?.is_super_admin === true ? '查看岗位' : '当前岗位'}：${roleLabel}`}
            >
              {roleLabel}
            </span>
          </div>
        </header>

        {activeMainTabKey !== MOBILE_MAIN_TAB_KEYS.MINE ? (
          <div className="mobile-role-task-query">
            <form
              className="mobile-role-task-search"
              role="search"
              onSubmit={(event) => event.preventDefault()}
            >
              <MobileSearchInput
                type="search"
                size="large"
                enterKeyHint="search"
                autoComplete="off"
                aria-label="搜索订单、产品、物料或款号"
                placeholder="订单/产品/物料/款号"
                maxLength={100}
                value={keywordDraft}
                onCompositionStart={() => {
                  composingSearchRef.current = true
                  clearTimeout(searchTimerRef.current)
                }}
                onCompositionEnd={(event) => {
                  composingSearchRef.current = false
                  setKeywordDraft(event.currentTarget.value)
                  searchTasks(event.currentTarget.value)
                }}
                onChange={(event) => {
                  const { value } = event.target
                  setKeywordDraft(value)
                  if (
                    !composingSearchRef.current &&
                    !event.nativeEvent.isComposing
                  ) {
                    searchTasks(value)
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    event.key !== 'Enter' ||
                    composingSearchRef.current ||
                    event.nativeEvent.isComposing ||
                    event.nativeEvent.keyCode === 229
                  ) {
                    return
                  }
                  event.preventDefault()
                  searchTasks(event.currentTarget.value, true)
                }}
                clearVisible={Boolean(keywordDraft || taskKeyword)}
                onClear={() => {
                  composingSearchRef.current = false
                  setKeywordDraft('')
                  searchTasks('', true)
                }}
              />
            </form>
            {canFilterTaskList ? (
              <MobileTaskListOptions
                contextLabel={
                  activeMainTabKey === MOBILE_MAIN_TAB_KEYS.MESSAGES
                    ? '风险'
                    : '任务'
                }
                sortKey={taskSortKey}
                statusKey={taskStatusKey}
                onChange={onTaskListOptionsChange}
              />
            ) : null}
          </div>
        ) : null}
        <div hidden={!isTasks} className="mobile-workspace-task-views">
          <SlidingSegmented
            block
            aria-label="任务状态"
            value={isTasks ? activeMainTabKey : lastTaskTab.current}
            options={[
              {
                value: MOBILE_MAIN_TAB_KEYS.TODO,
                label: (
                  <>
                    <span>待办</span>{' '}
                    <span>{authoritativeTaskCounts?.todo ?? ''}</span>
                  </>
                ),
              },
              {
                value: MOBILE_MAIN_TAB_KEYS.DONE,
                label: (
                  <>
                    <span>已办</span>{' '}
                    <span>{authoritativeTaskCounts?.history ?? ''}</span>
                  </>
                ),
              },
            ]}
            onChange={(key) =>
              openTaskBucket({
                mainTabKey: key,
                filterKey: activeFilterKey,
              })
            }
          />
        </div>
        {renderActiveTabPanel()}
      </div>

      {progressAccess?.enabled && (
        <MobileProgressPanel
          active={isProgress}
          access={progressAccess}
          scopeKey={accessScopeKey}
          roleKey={activeRoleKey}
          adminProfile={adminProfile}
          onOpenTask={onOpenProgressTask}
          canEnterDesktop={canEnterDesktop}
        />
      )}
      {!isProgress && showScrollTopButton ? (
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

      {navigationCounts.error && (
        <button
          type="button"
          className="mobile-navigation-count-error"
          onClick={navigationCounts.refresh}
          disabled={navigationCounts.loading}
          aria-live="polite"
        >
          {navigationCounts.loading
            ? '正在更新角标…'
            : '角标更新失败 · 点此重试'}
        </button>
      )}
      {renderBottomNavigation()}
    </div>
  )
}
