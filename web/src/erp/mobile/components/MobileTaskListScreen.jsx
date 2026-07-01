import React, { useState } from 'react'
import {
  ArrowRightOutlined,
  ArrowUpOutlined,
  BellOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  InboxOutlined,
  LogoutOutlined,
  PauseOutlined,
  ReloadOutlined,
  UserOutlined,
} from '@ant-design/icons'
import ERPThemeToggle from '@/common/components/theme/ERPThemeToggle'
import MobileTaskListSkeleton from './MobileTaskListSkeleton.jsx'
import { formatMobileTaskTime } from '../../utils/mobileTaskView.mjs'
import {
  MOBILE_LIST_COLLAPSED_LIMITS,
  MOBILE_LIST_KEYS,
  MOBILE_MAIN_TAB_KEYS,
  MOBILE_MESSAGE_TAB_KEYS,
  MOBILE_TASK_FILTER_KEYS,
  getMobileRoleLabel,
  getTaskQueueTone,
  getTaskSeverityView,
  resolveTaskBusinessChip,
  resolveTaskListMeta,
  resolveTaskSourceLabel,
} from '../utils/mobileRoleTaskModel.mjs'
import { mobileTheme } from '../theme'

const MOBILE_MAIN_TAB_ITEMS = Object.freeze([
  { key: MOBILE_MAIN_TAB_KEYS.TODO, label: '待办', Icon: InboxOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.DONE, label: '已办', Icon: CheckSquareOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MESSAGES, label: '消息', Icon: BellOutlined },
  { key: MOBILE_MAIN_TAB_KEYS.MINE, label: '我的', Icon: UserOutlined },
])

export default function MobileTaskListScreen({
  activeFilterKey,
  activeMainTabKey,
  activeMessageTabKey,
  activeTasks,
  adminProfile,
  doneTasks,
  filterItems,
  filteredTasks,
  handleLogout,
  handleMainScroll,
  initialLoading,
  latestSync,
  loadTasks,
  loading,
  loggingOut,
  noticeTasks,
  overdueTasks,
  progressPercent,
  riskTasks,
  roleLabel,
  scrollContainerRef,
  scrollMainToTop,
  selectedTask,
  setActiveFilterKey,
  setActiveMainTabKey,
  setActiveMessageTabKey,
  setDetailAction,
  setSelectedTaskID,
  showScrollTopButton,
  taskSummary,
  warningTasks,
}) {
  const [visibleListLimitsByKey, setVisibleListLimitsByKey] = useState({})

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

  const getVisibleListItems = (items, listKey) =>
    items.slice(0, getVisibleListLimit(items, listKey))

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
    tone = '',
    valueClassName = 'text-slate-950',
    testID,
  }) => {
    const toneClass = tone ? `mobile-role-summary-metric--${tone}` : ''
    return (
      <div
        key={label}
        data-testid={testID}
        className={`mobile-role-summary-metric ${toneClass} min-w-0 px-2 text-center`}
      >
        <div
          className={`mobile-role-metric-button__value font-semibold leading-tight ${valueClassName}`}
        >
          {value}
        </div>
        <div className="mobile-role-metric-button__label mt-1 flex items-center justify-center gap-1 text-base">
          {Icon ? <Icon aria-hidden="true" /> : null}
          <span>{label}</span>
        </div>
      </div>
    )
  }

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
            tone: 'pending',
            testID: 'mobile-role-progress-pending',
          },
          {
            label: '处理中',
            value: taskSummary.processing,
            Icon: ClockCircleOutlined,
            tone: 'processing',
            testID: 'mobile-role-progress-processing',
          },
          {
            label: '卡住',
            value: taskSummary.blockedProgress,
            Icon: PauseOutlined,
            tone: 'blocked',
            testID: 'mobile-role-progress-blocked',
          },
          {
            label: '完成',
            value: taskSummary.done,
            Icon: CheckSquareOutlined,
            tone: 'done',
            testID: 'mobile-role-progress-done',
          },
        ].map((item) =>
          renderSummaryMetric({
            ...item,
            valueClassName: 'text-xl',
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
    <div
      className={`mobile-role-task-filters mobile-role-task-filters--${activeFilterKey} mx-5 mt-4 grid grid-cols-4 rounded-2xl bg-slate-100 p-1 shadow-inner`}
    >
      {filterItems.map((item) => {
        const active = item.key === activeFilterKey
        return (
          <button
            key={item.key}
            type="button"
            data-testid={`mobile-role-filter-${item.key}`}
            aria-pressed={active}
            className={`mobile-role-task-filter min-w-0 rounded-xl px-2 py-3 text-base font-semibold transition ${
              active ? 'mobile-role-task-filter--active' : 'text-slate-500'
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

  const renderTodoPanel = () =>
    initialLoading ? (
      <MobileTaskListSkeleton />
    ) : (
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
      <div
        className={`mobile-role-message-tabs mobile-role-message-tabs--${activeMessageTabKey}`}
        role="tablist"
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
      .map((role) => role?.name || getMobileRoleLabel(role?.role_key))
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
              tone: 'todo',
              filterKey: MOBILE_TASK_FILTER_KEYS.ALL,
              testID: 'mobile-role-mine-metric-todo',
            },
            {
              label: '已办',
              value: doneTasks.length,
              tone: 'done',
              mainTabKey: MOBILE_MAIN_TAB_KEYS.DONE,
              listKey: MOBILE_LIST_KEYS.DONE,
              testID: 'mobile-role-mine-metric-done',
            },
            {
              label: '超时',
              value: overdueTasks.length,
              tone: 'overdue',
              filterKey: MOBILE_TASK_FILTER_KEYS.OVERDUE,
              testID: 'mobile-role-mine-metric-overdue',
            },
            {
              label: '风险',
              value: riskTasks.length,
              tone: 'risk',
              filterKey: MOBILE_TASK_FILTER_KEYS.RISK,
              testID: 'mobile-role-mine-metric-risk',
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              data-testid={item.testID}
              aria-label={`查看${item.label}任务`}
              className={`${mobileTheme.metricCard} mobile-role-mine-metric-button mobile-role-mine-metric-button--${item.tone}`}
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
              <div className="mobile-role-mine-metric-button__value text-xl font-semibold">
                {item.value}
              </div>
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
      className={`mobile-role-bottom-nav mobile-role-bottom-nav--${activeMainTabKey}`}
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
            onClick={() => openTaskBucket({ mainTabKey: key })}
          >
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )

  const activeTabLabel =
    MOBILE_MAIN_TAB_ITEMS.find((item) => item.key === activeMainTabKey)
      ?.label || '待办'

  return (
    <div className="mobile-role-tasks-page mobile-role-tasks-page--tabs surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl">
      <div
        ref={scrollContainerRef}
        className="mobile-role-tasks-page__scroll"
        data-testid="mobile-role-scroll"
        aria-busy={initialLoading ? 'true' : 'false'}
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
