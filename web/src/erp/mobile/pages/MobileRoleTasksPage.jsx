import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import SurfacePanel from '@/common/components/layout/SurfacePanel'
import { useERPWorkspace } from '../../context/ERPWorkspaceProvider'
import {
  listWorkflowTasks,
  updateWorkflowTaskStatus,
} from '../../api/workflowApi.mjs'
import {
  BUSINESS_WORKFLOW_STATES,
  TASK_WORKFLOW_STATES,
} from '../../config/workflowStatus.mjs'
import { mobileTheme } from '../theme'

const taskStatusLabelMap = new Map(
  TASK_WORKFLOW_STATES.map((state) => [state.key, state.label])
)
const businessStatusLabelMap = new Map(
  BUSINESS_WORKFLOW_STATES.map((state) => [state.key, state.label])
)
const TERMINAL_TASK_STATUS_KEYS = new Set(['done', 'closed', 'cancelled'])
const WARNING_TASK_STATUS_KEYS = new Set(['blocked', 'rejected'])
const WARNING_BUSINESS_STATUS_KEYS = new Set(['blocked', 'cancelled'])
const DUE_SOON_MS = 24 * 60 * 60 * 1000
const CANCELLED_TASK_STATUS_KEYS = new Set(['cancelled'])
const COMPLETED_TASK_STATUS_KEYS = new Set(['done', 'closed'])
const PROCESSING_TASK_STATUS_KEYS = new Set(['processing'])
const BLOCKED_TASK_STATUS_KEYS = new Set(['blocked', 'rejected'])
const PENDING_TASK_STATUS_KEYS = new Set(['pending', 'ready'])

function formatTaskTime(value) {
  if (!value) return '-'
  const date = new Date(Number(value) * 1000)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString()
}

function getTaskTimestamp(task) {
  return Number(task?.updated_at || task?.created_at || 0)
}

function getDueAtMs(task) {
  if (!task?.due_at) return null
  const timestamp = Number(task.due_at)
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null
  return timestamp * 1000
}

function getWarningLabel(task, nowMs) {
  const dueAtMs = getDueAtMs(task)
  if (dueAtMs && dueAtMs < nowMs) return '已超时'
  if (dueAtMs && dueAtMs - nowMs <= DUE_SOON_MS) return '即将到期'
  if (WARNING_TASK_STATUS_KEYS.has(task.task_status_key)) {
    return task.task_status_key === 'rejected' ? '退回' : '阻塞'
  }
  if (WARNING_BUSINESS_STATUS_KEYS.has(task.business_status_key)) {
    return businessStatusLabelMap.get(task.business_status_key) || '预警'
  }
  if (Number(task.priority || 0) >= 3) return '优先'
  return ''
}

function isWarningTask(task, nowMs) {
  return Boolean(getWarningLabel(task, nowMs))
}

function sortByLatest(left, right) {
  return getTaskTimestamp(right) - getTaskTimestamp(left)
}

function getProgressSummary(tasks) {
  const progressTasks = tasks.filter(
    (task) => !CANCELLED_TASK_STATUS_KEYS.has(task.task_status_key)
  )
  const summary = progressTasks.reduce(
    (current, task) => {
      if (COMPLETED_TASK_STATUS_KEYS.has(task.task_status_key)) {
        current.done += 1
      } else if (PROCESSING_TASK_STATUS_KEYS.has(task.task_status_key)) {
        current.processing += 1
      } else if (BLOCKED_TASK_STATUS_KEYS.has(task.task_status_key)) {
        current.blocked += 1
      } else if (PENDING_TASK_STATUS_KEYS.has(task.task_status_key)) {
        current.pending += 1
      } else {
        current.pending += 1
      }
      return current
    },
    {
      total: progressTasks.length,
      pending: 0,
      processing: 0,
      blocked: 0,
      done: 0,
    }
  )

  summary.percent =
    summary.total === 0 ? 0 : Math.round((summary.done / summary.total) * 100)
  return summary
}

export default function MobileRoleTasksPage() {
  const { activeRoleKey } = useERPWorkspace()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingID, setUpdatingID] = useState(null)
  const [blockedReasonByTaskID, setBlockedReasonByTaskID] = useState({})

  const activeTasks = useMemo(
    () =>
      tasks.filter(
        (task) => !TERMINAL_TASK_STATUS_KEYS.has(task.task_status_key)
      ),
    [tasks]
  )
  const warningTasks = useMemo(() => {
    const nowMs = Date.now()
    return activeTasks
      .filter((task) => isWarningTask(task, nowMs))
      .sort(sortByLatest)
  }, [activeTasks])
  const noticeTasks = useMemo(
    () => [...activeTasks].sort(sortByLatest).slice(0, 8),
    [activeTasks]
  )
  const progressSummary = useMemo(() => getProgressSummary(tasks), [tasks])

  const loadTasks = useCallback(async () => {
    setLoading(true)
    try {
      const data = await listWorkflowTasks({
        owner_role_key: activeRoleKey,
        limit: 100,
      })
      setTasks(data.tasks || [])
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '加载移动端任务失败，请稍后重试')
      )
    } finally {
      setLoading(false)
    }
  }, [activeRoleKey])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  const moveTask = async (task, taskStatusKey) => {
    const blockedReason = String(
      blockedReasonByTaskID[task.id] ?? task.blocked_reason ?? ''
    ).trim()
    if (taskStatusKey === 'blocked' && !blockedReason) {
      message.warning('请先填写阻塞原因')
      return
    }

    setUpdatingID(task.id)
    try {
      await updateWorkflowTaskStatus({
        id: task.id,
        task_status_key: taskStatusKey,
        business_status_key: task.business_status_key || undefined,
        actor_role_key: activeRoleKey,
        reason: taskStatusKey === 'blocked' ? blockedReason : '',
        payload: {
          ...(task.payload || {}),
          mobile_role_key: activeRoleKey,
        },
      })
      setBlockedReasonByTaskID((current) => {
        const next = { ...current }
        if (taskStatusKey === 'blocked') {
          next[task.id] = blockedReason
        } else {
          delete next[task.id]
        }
        return next
      })
      message.success('任务状态已更新')
      await loadTasks()
    } catch (error) {
      message.error(
        getActionErrorMessage(error, '更新任务状态失败，请稍后重试')
      )
    } finally {
      setUpdatingID(null)
    }
  }

  return (
    <div className="mobile-role-tasks-page space-y-4">
      <SurfacePanel className="p-4 sm:p-5 md:p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2 md:gap-3">
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {warningTasks.length}
              </div>
              <div className={mobileTheme.metricLabel}>预警</div>
            </div>
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {noticeTasks.length}
              </div>
              <div className={mobileTheme.metricLabel}>通知</div>
            </div>
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {activeTasks.length}
              </div>
              <div className={mobileTheme.metricLabel}>任务</div>
            </div>
            <div className={mobileTheme.metricCard}>
              <div className={mobileTheme.metricValue}>
                {progressSummary.percent}%
              </div>
              <div className={mobileTheme.metricLabel}>进度</div>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className={mobileTheme.actionButton}
              onClick={loadTasks}
              disabled={loading}
            >
              {loading ? '刷新中' : '刷新'}
            </button>
          </div>

          <div className="mobile-role-tasks-page__sections grid gap-4 md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.28fr)] md:items-start">
            <div className="space-y-4">
              <section className="space-y-2">
                <div className={mobileTheme.sectionTitle}>进度</div>
                <div className={mobileTheme.listItem}>
                  <div className={mobileTheme.progressTrack}>
                    <div
                      className={mobileTheme.progressFill}
                      style={{ width: `${progressSummary.percent}%` }}
                    />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    <div className={mobileTheme.progressStat}>
                      <div>{progressSummary.pending}</div>
                      <span>待处理</span>
                    </div>
                    <div className={mobileTheme.progressStat}>
                      <div>{progressSummary.processing}</div>
                      <span>处理中</span>
                    </div>
                    <div className={mobileTheme.progressStat}>
                      <div>{progressSummary.blocked}</div>
                      <span>卡住</span>
                    </div>
                    <div className={mobileTheme.progressStat}>
                      <div>{progressSummary.done}</div>
                      <span>完成</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <div className={mobileTheme.sectionTitle}>预警</div>
                {warningTasks.length === 0 ? (
                  <div className={mobileTheme.warningItem}>暂无预警</div>
                ) : (
                  <div className="space-y-2">
                    {warningTasks.map((task) => (
                      <div key={task.id} className={mobileTheme.warningItem}>
                        <div className="text-sm font-semibold">
                          {getWarningLabel(task, Date.now())}
                        </div>
                        <div className="mt-1 text-sm">{task.task_name}</div>
                        <div className="mt-1 text-xs">
                          {task.source_no ||
                            `${task.source_type} #${task.source_id}`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className={mobileTheme.sectionTitle}>通知</div>
                {noticeTasks.length === 0 ? (
                  <div className={mobileTheme.listItem}>暂无通知</div>
                ) : (
                  <div className="space-y-2">
                    {noticeTasks.map((task) => (
                      <div key={task.id} className={mobileTheme.listItem}>
                        <div className="font-semibold text-slate-900">
                          {task.task_name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {taskStatusLabelMap.get(task.task_status_key) ||
                            task.task_status_key}
                          {' / '}
                          {formatTaskTime(task.updated_at)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <section className="space-y-2">
              <div className={mobileTheme.sectionTitle}>任务</div>
              {activeTasks.length === 0 ? (
                <div className={mobileTheme.warningItem}>暂无任务</div>
              ) : (
                <div className="space-y-3">
                  {activeTasks.map((task) => (
                    <div key={task.id} className={mobileTheme.highlightCard}>
                      <div className={mobileTheme.sectionEyebrow}>
                        {task.source_no ||
                          `${task.source_type} #${task.source_id}`}
                      </div>
                      <div className="min-w-0 text-sm font-semibold text-slate-900 [overflow-wrap:anywhere]">
                        {task.task_name}
                      </div>
                      <div className={mobileTheme.highlightNote}>
                        状态：
                        {taskStatusLabelMap.get(task.task_status_key) ||
                          task.task_status_key}
                        {' / '}
                        更新：{formatTaskTime(task.updated_at)}
                      </div>
                      <div className={mobileTheme.highlightNote}>
                        业务：
                        {businessStatusLabelMap.get(task.business_status_key) ||
                          task.business_status_key ||
                          '-'}
                      </div>
                      {task.blocked_reason ? (
                        <div className={mobileTheme.warningItem}>
                          阻塞原因：{task.blocked_reason}
                        </div>
                      ) : null}
                      <textarea
                        aria-label={`任务阻塞原因 ${task.id}`}
                        className="mt-3 h-20 w-full resize-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400"
                        maxLength={300}
                        placeholder="阻塞原因"
                        value={
                          blockedReasonByTaskID[task.id] ??
                          task.blocked_reason ??
                          ''
                        }
                        onChange={(event) => {
                          setBlockedReasonByTaskID((current) => ({
                            ...current,
                            [task.id]: event.target.value,
                          }))
                        }}
                      />
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={updatingID === task.id}
                          onClick={() => moveTask(task, 'processing')}
                        >
                          处理
                        </button>
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={updatingID === task.id}
                          onClick={() => moveTask(task, 'blocked')}
                        >
                          阻塞
                        </button>
                        <button
                          type="button"
                          className={mobileTheme.actionButton}
                          disabled={updatingID === task.id}
                          onClick={() => moveTask(task, 'done')}
                        >
                          完成
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
