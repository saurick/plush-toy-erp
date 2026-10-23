import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Empty, Spin } from 'antd'
import { LeftOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import FilterChip from '@/common/components/navigation/FilterChip'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { getWorkflowTaskCalendar } from '../../api/workflowApi.mjs'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  calendarMonthDays,
  shiftCalendarMonth,
  TASK_CALENDAR_PAGE_SIZE,
  taskCalendarSelectionMode,
} from '../../utils/workflowTaskCalendar.mjs'
import { WORKFLOW_TASKS_CHANGED } from '../../utils/workflowTaskChanges.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { getWorkflowTaskReason } from '../../utils/workflowTaskBoard.mjs'
import { getWorkflowTaskReasonMeta } from '../../utils/workflowTaskReason.mjs'
import { buildWorkflowTaskResponsibilityItems } from '../../utils/workflowTaskEventPresentation.mjs'
import WorkflowTaskCard from './WorkflowTaskCard.jsx'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import WorkflowTaskReason from './WorkflowTaskReason.jsx'
import { WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import { usePageLoadFeedback } from '../PageLoadFeedback.jsx'
import './workflowTaskCalendar.css'

export default function WorkflowTaskCalendar({
  state,
  query,
  scopeKey,
  onOpenTask,
  mobile = false,
  refreshKey = 0,
}) {
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(null)
  const [requestState, setRequestState] = useState(null)
  const requestRef = useRef(null)
  const tailRef = useRef(null)
  const request = {
    ...query,
    calendar_month: state.month,
    calendar_selection: state.selection,
    limit: TASK_CALENDAR_PAGE_SIZE,
  }
  const queryKey = JSON.stringify([scopeKey, request])
  const monthKey = JSON.stringify([scopeKey, query, state.month])
  const current = page?.key === queryKey ? page : null
  const calendar = current?.calendar
  // A date selection changes the agenda, not the scope of the month totals.
  const monthCalendar = page?.monthKey === monthKey ? page.calendar : null
  const loading = requestState?.key !== queryKey || requestState.loading
  const error = requestState?.key === queryKey ? requestState.error : ''
  const items = current?.items || []
  const hasMore = Boolean(calendar && items.length < calendar.total)
  const selectionCount =
    calendar?.total ??
    (monthCalendar
      ? state.selection === 'overdue'
        ? monthCalendar.overdue
        : state.selection === 'undated'
          ? monthCalendar.undated
          : monthCalendar.days[state.selection] || 0
      : undefined)
  const today = currentBusinessDate()
  const refresh = () => setRevision((value) => value + 1)

  const load = async (append = false, { showRefreshFeedback = false } = {}) => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setRequestState({ key: queryKey, loading: true, error: '', append })
    const offset = append ? items.length : 0
    try {
      const result = await getWorkflowTaskCalendar(
        {
          ...request,
          calendar_offset: offset,
          ...(append ? { calendar_revision: calendar.revision } : {}),
        },
        { signal: controller.signal }
      )
      if (controller.signal.aborted || requestRef.current !== controller) return
      const added = result.items.filter(
        (task) => !items.some((item) => item.id === task.id)
      )
      const restarted = append && result.revision !== calendar.revision
      if (append && !restarted && hasMore && !added.length) {
        throw new Error('待办已有变动，请重新加载')
      }
      setPage({
        key: queryKey,
        monthKey,
        calendar: result,
        items: append && !restarted ? [...items, ...added] : result.items,
      })
      setRequestState({ key: queryKey, loading: false, error: '' })
      if (showRefreshFeedback) {
        message.success({
          key: 'workflow-task-calendar-refresh',
          content: '待办日历已刷新',
        })
      }
    } catch (err) {
      if (
        !controller.signal.aborted &&
        requestRef.current === controller &&
        !isRpcAbortError(err)
      ) {
        const errorMessage = getActionErrorMessage(
          err,
          showRefreshFeedback
            ? '待办日历刷新失败，请重试'
            : '待办日历加载失败，请重试'
        )
        setRequestState({
          key: queryKey,
          loading: false,
          error: errorMessage,
        })
        if (showRefreshFeedback) {
          message.error({
            key: 'workflow-task-calendar-refresh',
            content: errorMessage,
          })
        }
      }
    } finally {
      if (requestRef.current === controller) requestRef.current = null
    }
  }

  const handleRefresh = () => {
    if (loading || requestRef.current) return
    return load(false, { showRefreshFeedback: true })
  }

  const loadFeedback = usePageLoadFeedback({ error, retry: load })

  useEffect(() => {
    load()
    return () => requestRef.current?.abort()
    // The complete query and permission scope own this read lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, revision, refreshKey])
  useEffect(() => {
    window.addEventListener(WORKFLOW_TASKS_CHANGED, refresh)
    return () => window.removeEventListener(WORKFLOW_TASKS_CHANGED, refresh)
  }, [])
  useEffect(() => {
    if (!mobile || !hasMore || loading || error || !tailRef.current) {
      return undefined
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load(true)
    })
    observer.observe(tailRef.current)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobile, hasMore, loading, error, current])

  const changeMonth = (amount) => {
    const month = shiftCalendarMonth(state.month, amount)
    state.change({
      month,
      selection: month === today.slice(0, 7) ? today : `${month}-01`,
    })
  }
  const dayTitle =
    state.selection === 'overdue'
      ? '已逾期待办'
      : state.selection === 'undated'
        ? '未设置截止日期'
        : `${Number(state.selection.slice(5, 7))} 月 ${Number(state.selection.slice(8))} 日到期`
  return (
    <section
      className={`workflow-task-calendar${mobile ? ' workflow-task-calendar--mobile' : ''}`}
      aria-label="待办日历"
    >
      {(!mobile || taskCalendarSelectionMode(state.selection) === 'date') && (
        <div className="workflow-task-calendar__month">
          <div className="workflow-task-calendar__toolbar">
            <Button
              type="text"
              className="workflow-task-calendar__previous"
              aria-label="上个月"
              icon={<LeftOutlined />}
              disabled={state.month === '1900-01'}
              onClick={() => changeMonth(-1)}
            />
            <strong aria-live="polite">
              {Number(state.month.slice(0, 4))}年{Number(state.month.slice(5))}
              月
            </strong>
            <div className="workflow-task-calendar__navigation">
              <Button
                type="text"
                aria-label="下个月"
                icon={<RightOutlined />}
                disabled={state.month === '9998-12'}
                onClick={() => changeMonth(1)}
              />
              <Button
                type="text"
                className="workflow-task-calendar__today"
                onClick={() =>
                  state.change({ month: today.slice(0, 7), selection: today })
                }
              >
                今天
              </Button>
            </div>
          </div>
          <div className="workflow-task-calendar__week" aria-hidden="true">
            {['一', '二', '三', '四', '五', '六', '日'].map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div
            className="workflow-task-calendar__grid"
            aria-label="按截止日期选择待办"
          >
            {calendarMonthDays(state.month).map((day, index) =>
              day ? (
                <button
                  key={day}
                  type="button"
                  className="workflow-task-calendar__day"
                  data-date={day}
                  aria-label={`${day}，${monthCalendar ? `${monthCalendar.days[day] || 0} 项待办` : error ? '数量暂不可用' : '数量读取中'}`}
                  aria-current={day === today ? 'date' : undefined}
                  aria-pressed={state.selection === day}
                  onClick={() => state.change({ selection: day })}
                >
                  <span className="workflow-task-calendar__date">
                    <span className="workflow-task-calendar__number">
                      {Number(day.slice(8))}
                    </span>
                  </span>
                  {monthCalendar?.days[day] > 0 && (
                    <small
                      className="workflow-task-calendar__count"
                      aria-hidden="true"
                    >
                      {monthCalendar.days[day] > 99
                        ? '99+'
                        : `${monthCalendar.days[day]} 项`}
                    </small>
                  )}
                </button>
              ) : (
                <span key={`blank-${index}`} />
              )
            )}
          </div>
          {!mobile && (
            <div
              className="workflow-task-calendar__buckets"
              aria-label="跨日期待办"
            >
              <FilterChip
                selected={state.selection === 'overdue'}
                count={monthCalendar?.overdue}
                onClick={() => state.change({ selection: 'overdue' })}
              >
                已逾期
              </FilterChip>
              <FilterChip
                selected={state.selection === 'undated'}
                count={monthCalendar?.undated}
                onClick={() => state.change({ selection: 'undated' })}
              >
                未设置截止
              </FilterChip>
            </div>
          )}
        </div>
      )}
      <div className="workflow-task-calendar__agenda" aria-busy={loading}>
        <div className="workflow-task-calendar__heading">
          <strong>
            {dayTitle}
            {selectionCount !== undefined ? ` · ${selectionCount} 项` : ''}
          </strong>
          <Button
            aria-label="刷新待办日历"
            aria-busy={loading}
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            disabled={loading}
            loading={
              loading && Boolean(calendar) && !requestState?.append
                ? { delay: 180 }
                : false
            }
          />
        </div>
        {loadFeedback.visible && (
          <Alert
            type="error"
            showIcon
            message={error}
            action={
              <Button
                loading={loading || loadFeedback.retrying}
                onClick={loadFeedback.retry}
              >
                重新加载
              </Button>
            }
          />
        )}
        <Spin spinning={!calendar && !error} delay={180} tip="正在读取待办…">
          <div className="workflow-task-calendar__results">
            {calendar && !items.length && !error ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="当前筛选下暂无待办"
              />
            ) : null}
            <div className="workflow-task-calendar__items">
              {items.map((task) => (
                <WorkflowTaskCard
                  key={task.id}
                  compact
                  className="workflow-task-calendar__task"
                  label={`查看${getWorkflowTaskDisplayName(task)}详情`}
                  data-task-id={task.id}
                  onOpen={() => onOpenTask(task)}
                >
                  <WorkflowTaskIdentity
                    task={task}
                    keyword={query.keyword}
                    compact
                    layout="card"
                    copyable={false}
                    showTaskName
                    status={<span>{task.task_status_key === WorkflowTaskStatus.BLOCKED ? '受阻' : '待处理'}</span>}
                    source={<WorkflowTaskSource task={task} copyable={false} showUnavailable={false} />}
                  />
                  {!mobile && getWorkflowTaskReason(task) ? <div className="workflow-task-calendar__reason">{getWorkflowTaskReason(task)}</div> : null}
                  <div className="erp-task-card__footer">
                    <span>{buildWorkflowTaskResponsibilityItems(task).slice(0, 2).map((item) => item.value).join(' · ')}</span>
                    <WorkflowTaskTiming task={task} includeKeys={['due', 'ended']} />
                  </div>
                  {mobile ? <WorkflowTaskReason meta={getWorkflowTaskReasonMeta(task)} /> : null}
                </WorkflowTaskCard>
              ))}
            </div>
            {hasMore ? (
              <div ref={tailRef} className="workflow-task-calendar__tail">
                <Button
                  onClick={() => load(true)}
                  loading={loading && Boolean(requestState?.append)}
                  disabled={loading && !requestState?.append}
                >
                  继续加载 · 已显示 {items.length} / {calendar.total} 项
                </Button>
              </div>
            ) : null}
          </div>
        </Spin>
      </div>
    </section>
  )
}
