import React, { useEffect, useRef, useState } from 'react'
import { ArrowRightOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Drawer, Empty, Select, Space, Spin, Tag, Timeline } from 'antd'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTask, getWorkflowTracking } from '../../api/workflowApi.mjs'
import { getProcessNodeLabel, getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { formatWorkflowTaskEventTime, presentWorkflowTaskEvent } from '../../utils/workflowTaskEventPresentation.mjs'
import { buildTrackingStageModel, trackingHandoff, trackingResponsibilityParts, trackingStatus, trackingStatusColor, trackingTitle } from '../../utils/workflowTracking.mjs'
import WorkflowProcessStageTrack from './WorkflowProcessStageTrack.jsx'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'
import WorkflowInitiator from './WorkflowInitiator.jsx'
import { getWorkflowTaskSourceNo } from '../../utils/dashboardTaskDisplay.mjs'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import { WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import './workflowTracking.css'

export default function WorkflowTrackingDrawer({ trackingRef, onClose, onOpenTask, onAfterClose, refreshKey = '', closeLabel = '返回列表' }) {
  const [result, setResult] = useState(null)
  const [reload, setReload] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState(false)
  const [openingTask, setOpeningTask] = useState(null)
  const [taskError, setTaskError] = useState('')
  const [selectedTaskID, setSelectedTaskID] = useState(null)
  const appendRequest = useRef(null)
  const taskRequest = useRef(null)
  const historyHeading = useRef(null)
  const focusHistoryAfterAppend = useRef(false)
  const kind = trackingRef?.kind
  const id = trackingRef?.id
  const key = JSON.stringify([kind, id, refreshKey, reload])
  useEffect(() => {
    setOpeningTask(null)
    setTaskError('')
    setSelectedTaskID(null)
    if (!kind || !id) {
      setResult(null)
      return undefined
    }
    const controller = new AbortController()
    setMoreError(false)
    setLoadingMore(false)
    getWorkflowTracking({ kind, id }, { signal: controller.signal }).then(
      (data) => { if (!controller.signal.aborted) setResult({ key, data }) },
      () => { if (!controller.signal.aborted) setResult({ key, error: true }) }
    )
    return () => {
      controller.abort()
      appendRequest.current?.abort()
      appendRequest.current = null
      taskRequest.current?.abort()
      taskRequest.current = null
      focusHistoryAfterAppend.current = false
    }
  }, [kind, id, key])
  const current = result?.key === key ? result : null
  const data = current?.data
  const availableTasks = onOpenTask ? (data?.summary.current_tasks || []).flatMap((task) => {
    const access = data.current_task_access.find((item) => item.task_id === task.task_id)
    return access?.can_read ? [{ ...task, canHandle: access.can_handle }] : []
  }) : []
  const selectedTask = availableTasks.length === 1 ? availableTasks[0] : availableTasks.find((task) => task.task_id === selectedTaskID)
  const taskName = selectedTask ? getWorkflowTaskDisplayName(selectedTask) : ''
  const taskActionLabel = !selectedTask ? '选择任务后继续' : selectedTask.canHandle
    ? isWorkflowApprovalTask(selectedTask) && selectedTask.status === 'ready' ? `去审批${availableTasks.length > 1 ? ` · ${taskName}` : ''}` : `去处理${taskName}`
    : `查看${availableTasks.length > 1 ? taskName : '任务'}`
  useEffect(() => {
    if (focusHistoryAfterAppend.current) {
      focusHistoryAfterAppend.current = false
      historyHeading.current?.focus()
    }
  }, [data])
  const loadMore = async () => {
    if (!data?.events_truncated || appendRequest.current) return
    const controller = new AbortController()
    appendRequest.current = controller
    setLoadingMore(true)
    setMoreError(false)
    try {
      const older = await getWorkflowTracking({ kind, id, before_event_id: data.next_event_id }, { signal: controller.signal })
      if (!controller.signal.aborted) {
        // The final page removes its button, so keep focus inside the drawer.
        focusHistoryAfterAppend.current = !older.events_truncated
        setResult((previous) => previous?.key === key ? {
          key,
          data: { ...older, events: [...previous.data.events, ...older.events] },
        } : previous)
      }
    } catch {
      if (!controller.signal.aborted) setMoreError(true)
    } finally {
      if (appendRequest.current === controller) appendRequest.current = null
      if (!controller.signal.aborted) setLoadingMore(false)
    }
  }
  const openTask = async (taskID) => {
    if (!onOpenTask || taskRequest.current || !availableTasks.some((task) => task.task_id === taskID)) return
    const controller = new AbortController()
    taskRequest.current = controller
    setOpeningTask(taskID)
    setTaskError('')
    try {
      // Tracking access does not grant task access. Read the authoritative task
      // before handing it to the existing permission checks and action drawer.
      const task = await getWorkflowTask(taskID, { signal: controller.signal })
      if (!controller.signal.aborted) onOpenTask(task)
    } catch (error) {
      if (!controller.signal.aborted) setTaskError(getActionErrorMessage(error, '打开当前任务失败，请重试'))
    } finally {
      if (taskRequest.current === controller) taskRequest.current = null
      if (!controller.signal.aborted) setOpeningTask(null)
    }
  }
  const summary = data?.summary
  const stageModel = data && summary.kind === 'process' ? buildTrackingStageModel(data) : null
  const eventItems = data?.events.map((event) => {
    const task = data.tasks.find((item) => item.task_id === event.task_id)
    const node = data.nodes.find((item) => item.id === task?.node_instance_id)
    const presented = presentWorkflowTaskEvent(event, { approvalTask: node?.node_type === 'approval' })
    return {
      key: event.id,
      color: presented.tone === 'success' ? 'green' : presented.tone === 'danger' ? 'red' : 'blue',
      children: (
        <div className="erp-workflow-tracking-event">
          <div><strong>{presented.label}</strong><span>{node ? getProcessNodeLabel(node) : getWorkflowTaskDisplayName(task)}</span></div>
          <p className="erp-workflow-tracking-meta">{presented.actorLabel} · {presented.timeLabel}</p>
          {presented.reason ? <p className="erp-workflow-tracking-reason">{presented.reason}</p> : null}
        </div>
      ),
    }
  }) || []
  return (
    <Drawer
      title="流程跟踪"
      open={Boolean(trackingRef)}
      onClose={onClose}
      afterOpenChange={(open) => { if (!open) onAfterClose?.() }}
      width="min(760px, 100vw)"
      forceRender
      className="erp-workflow-drawer erp-workflow-tracking-drawer"
      footer={
        <div className="erp-workflow-tracking-footer">
          {taskError ? <p role="alert" className="erp-workflow-tracking-task-error">{taskError}</p> : null}
          {availableTasks.length > 1 ? (
            <Select
              className="erp-workflow-tracking-task-select"
              aria-label="选择当前任务"
              placeholder="选择要进入的当前任务"
              value={selectedTask?.task_id}
              disabled={Boolean(openingTask)}
              options={availableTasks.map((task) => ({ value: task.task_id, label: `${getWorkflowTaskDisplayName(task)} · ${trackingResponsibilityParts(task).join(' · ')}` }))}
              onChange={(value) => { setSelectedTaskID(value); setTaskError('') }}
            />
          ) : null}
          <div className="erp-workflow-tracking-footer-actions">
            <Button onClick={onClose}>{closeLabel}</Button>
            <div className="erp-workflow-tracking-footer-controls">
              <Button
                icon={<ReloadOutlined aria-hidden />}
                loading={!current}
                disabled={!current || Boolean(openingTask)}
                onClick={() => setReload((value) => value + 1)}
              >
                刷新进度
              </Button>
              {availableTasks.length ? <Button type={selectedTask?.canHandle ? 'primary' : 'default'} className="erp-workflow-tracking-open-task" icon={<ArrowRightOutlined aria-hidden />} aria-label={taskActionLabel} aria-haspopup="dialog" disabled={!selectedTask} loading={Boolean(openingTask)} onClick={() => openTask(selectedTask.task_id)}>{taskActionLabel}</Button> : null}
            </div>
          </div>
        </div>
      }
    >
      {!current ? <Spin tip="正在读取任务进度"><div className="erp-workflow-tracking-loading" /></Spin> : current.error ? (
        <Alert
          type="error"
          showIcon
          message="暂时无法读取任务进度"
          description="请重新读取；当前账号需有这条流程的查看权限。"
          action={<Button onClick={() => setReload((value) => value + 1)}>重新读取</Button>}
        />
      ) : (
        <div className="erp-workflow-tracking-detail">
          <section className="erp-workflow-tracking-summary" aria-label="流程概况">
            <div className="erp-workflow-tracking-heading"><h2>{trackingTitle(summary)}</h2><Tag color={trackingStatusColor(summary)}>{trackingStatus(summary)}</Tag></div>
            <div className="erp-workflow-tracking-source"><WorkflowTaskSource task={summary} label={getWorkflowTaskSourceNo(summary)} /></div>
            <div className="erp-workflow-tracking-current" role="group" aria-label="当前进度">
              <span className="erp-workflow-tracking-current-label">当前：</span>
              <div className="erp-workflow-tracking-current-tasks">
                {summary.current_tasks.length ? summary.current_tasks.map((task) => (
                  <p key={task.task_id} className="erp-workflow-tracking-current-task">
                    <strong>{getWorkflowTaskDisplayName(task)}</strong>
                    {' · '}
                    <WorkflowResponsibilities items={[trackingResponsibilityParts(task)]} />
                  </p>
                )) : <p>{trackingHandoff(summary)}</p>}
              </div>
            </div>
            <div className="erp-workflow-tracking-origin">
              <WorkflowInitiator summary={summary} />
              <span className="erp-workflow-tracking-meta">发起于 {formatWorkflowTaskEventTime(summary.started_at)}</span>
            </div>
            {summary.display_context ? <div className="erp-workflow-tracking-identity"><WorkflowTaskIdentity task={summary} /></div> : null}
          </section>
          {stageModel?.items.length ? (
            <section aria-label="已发生的流程节点">
              <h3>流转步骤</h3>
              <WorkflowProcessStageTrack model={stageModel} variant="vertical" />
            </section>
          ) : null}
          <section aria-label="整条流程处理记录">
            <div className="erp-workflow-tracking-history-heading"><h3 ref={historyHeading} tabIndex={-1}>{summary.kind === 'process' ? '全部节点处理记录' : '处理记录'}</h3><span>最近在前</span></div>
            {eventItems.length ? <Timeline items={eventItems} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={summary.kind === 'process' ? '暂无人工任务处理记录' : '暂无处理记录'} />}
            {moreError ? <p role="alert">更早记录读取失败，已加载记录仍保留。</p> : null}
            {data.events_truncated ? <Space><Button onClick={loadMore} loading={loadingMore} aria-label={moreError ? '重新读取更早记录' : '加载更早记录'}>{moreError ? '重新读取更早记录' : '加载更早记录'}</Button></Space> : null}
          </section>
        </div>
      )}
    </Drawer>
  )
}
