import React, { useEffect, useRef } from 'react'
import { Alert, Button, Spin } from 'antd'
import { LeftOutlined, RightOutlined, ReloadOutlined } from '@ant-design/icons'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { WorkflowTaskStatus } from '../../../common/consts/statuses.generated.mjs'
import useWorkflowTaskCalendarData from '../../hooks/useWorkflowTaskCalendarData.js'
import { currentBusinessDate } from '../../utils/businessDate.mjs'
import {
  calendarMonthDays,
  defaultTaskCalendarDate,
  shiftCalendarMonth,
  taskCalendarSelectionMode,
} from '../../utils/workflowTaskCalendar.mjs'
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

export function WorkflowTaskCalendarContent({
  state,
  data,
  keyword,
  onOpenTask,
  mobile = false,
}) {
  const { calendar, monthCalendar, items, hasMore, loading, appending, error, load, handleRefresh } = data
  const tailRef = useRef(null)
  const mode = taskCalendarSelectionMode(state.selection)
  const selectionCount =
    calendar?.total ??
    (mode === 'date' && monthCalendar ? monthCalendar.days[state.selection] || 0 : monthCalendar?.[mode])
  const today = currentBusinessDate()
  const loadFeedback = usePageLoadFeedback({ error, retry: load })

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
  }, [mobile, hasMore, loading, error, calendar])

  const changeMonth = (amount) => {
    const month = shiftCalendarMonth(state.month, amount)
    state.change({
      month,
      selection: defaultTaskCalendarDate(month, today),
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
      {(!mobile || mode === 'date') && (
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
              loading && Boolean(calendar) && !appending
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
                    keyword={keyword}
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
                  loading={appending}
                  disabled={loading && !appending}
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

export default function WorkflowTaskCalendar({ state, query, scopeKey, refreshKey, ...props }) {
  const data = useWorkflowTaskCalendarData({ state, query, scopeKey, refreshKey })
  return <WorkflowTaskCalendarContent {...props} state={state} data={data} keyword={query.keyword} />
}
