import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { LeftOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Spin, Tag, Timeline } from 'antd'
import Drawer from '@/common/components/drawer/AppDrawer.jsx'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Select from '@/common/components/select/AppSelect'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import { ProcessStatus } from '@/common/consts/statuses.generated.mjs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getWorkflowTask, getWorkflowTracking } from '../../api/workflowApi.mjs'
import { getProcessNodeLabel, getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import { formatWorkflowTaskEventTime, presentWorkflowTaskEvent } from '../../utils/workflowTaskEventPresentation.mjs'
import { buildTrackingCurrentProgress, buildTrackingStageModel, isFlowTracking, MATERIAL_REVIEW_TRACKING_KIND, trackingHandoff, trackingResponsibilityParts, trackingStatus, trackingStatusColor, trackingTitle } from '../../utils/workflowTracking.mjs'
import WorkflowProcessStageTrack from './WorkflowProcessStageTrack.jsx'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'
import WorkflowInitiator from './WorkflowInitiator.jsx'
import WorkflowExceptionPanel from './WorkflowExceptionPanel.jsx'
import { getWorkflowTaskSourceNo } from '../../utils/dashboardTaskDisplay.mjs'
import WorkflowTaskIdentity from './WorkflowTaskIdentity.jsx'
import { WorkflowTaskCopySummary, WorkflowTaskSource } from './WorkflowTaskCopy.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import { getWorkflowTaskIdentity } from '../../utils/workflowTaskIdentity.mjs'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import './workflowTracking.css'

function TrackingExceptions({ trackingRef, onOpenTask, refreshKey }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details className="erp-workflow-tracking-exceptions" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>本流程异常跟踪</summary>
      {expanded ? <WorkflowExceptionPanel trackingRef={trackingRef} onOpenTask={onOpenTask} compact refreshKey={refreshKey} /> : null}
    </details>
  )
}

function TrackingAssociation({ summary }) {
  const [expanded, setExpanded] = useState(false)
  const { items } = getWorkflowTaskIdentity(summary)
  if (!items.length) return null
  return (
    <details className="erp-workflow-tracking-identity" onToggle={(event) => setExpanded(event.currentTarget.open)}>
      <summary>关联产品与物料 <span className="erp-workflow-tracking-identity-count">{items.length} 项</span></summary>
      {expanded ? (
        <div className="erp-workflow-tracking-identity-body">
          <WorkflowTaskIdentity task={summary} summaryCopyable={false} />
          <WorkflowTaskCopySummary task={summary} compact includeTask={false} includeLink={false} />
        </div>
      ) : null}
    </details>
  )
}

function TrackingJourney({ data, stepID, onStepChange }) {
  const detailID = useId()
  const detailRef = useRef(null)
  const currentRef = useRef(null)
  const { summary } = data
  const flow = isFlowTracking(summary)
  const progress = buildTrackingCurrentProgress(data)
  const model = flow ? buildTrackingStageModel(data) : null
  const inspected = model?.items.find((step) => (step.id ?? step.key) === stepID)
  const historical = inspected && !inspected.current ? inspected : null
  const waiting = flow && summary.status !== ProcessStatus.COMPLETED && !progress.length
  const unlocatedBlock = flow && summary.status === ProcessStatus.BLOCKED && !progress.some((step) => step.blocked)
  const selectedID = inspected ? inspected.id ?? inspected.key : progress.length === 1 ? progress[0].nodeID : null

  const selectStep = (id) => {
    const next = id === stepID ? null : id
    onStepChange(next)
    requestAnimationFrame(() => {
      const target = model?.items.some((item) => (item.id ?? item.key) === next && !item.current)
        ? detailRef.current : currentRef.current
      target?.scrollIntoView({ block: 'nearest' })
    })
  }
  const returnToCurrent = () => {
    onStepChange(null)
    currentRef.current?.focus({ preventScroll: true })
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }

  return (
    <div className="erp-workflow-tracking-journey">
      <div className="erp-workflow-tracking-current" ref={currentRef} role="group" aria-label="当前进度" tabIndex={-1}>
        <h3>{flow ? '当前进度' : '当前任务'}</h3>
        {progress.map((step) => (
          <div key={step.key} className="erp-workflow-tracking-current-step">
            <div className="erp-workflow-tracking-current-task">
              {step.label ? <strong>{step.label}</strong> : null}
              <WorkflowResponsibilities items={[step.responsibility]} />
              <Tag color={step.blocked ? 'error' : 'blue'}>{step.statusLabel}</Tag>
            </div>
            <dl className="erp-workflow-tracking-step-guidance">
              {step.reasonLabel ? <div className="erp-workflow-tracking-block-reason"><dt>{step.reasonLabel}</dt><dd>{step.reason || '暂无可查看的原因'}</dd></div> : null}
              <div><dt>下一步</dt><dd>{step.nextStep}</dd></div>
            </dl>
          </div>
        ))}
        {unlocatedBlock ? <p>流程受阻，暂无可查看的受阻环节。</p> : null}
        {!progress.length && !unlocatedBlock ? <p>{waiting && summary.kind === MATERIAL_REVIEW_TRACKING_KIND ? '等待当前审核任务确认' : trackingHandoff(summary)}</p> : null}
      </div>
      {model?.items.length ? (
        <section className="erp-workflow-tracking-stages" aria-label="已发生的流程节点">
          <h3>流转步骤</h3>
          <WorkflowProcessStageTrack model={model} variant="tracking" compact selectedStepID={selectedID} stepDetailID={detailID} onSelectStep={selectStep} />
        </section>
      ) : !flow ? (
        <p className="erp-workflow-tracking-meta">这条跟进按本任务记录追踪。</p>
      ) : null}
      <div id={detailID} ref={detailRef} aria-live="polite" hidden={!historical}>
        {historical ? (
          <div className="erp-workflow-tracking-current" role="group" aria-label="所选环节">
            <div className="erp-workflow-tracking-current-task">
              <h3>{historical.label}</h3>
              <Tag>{historical.statusLabel}{historical.attemptLabel ? ` · ${historical.attemptLabel}` : ''}</Tag>
              <Button type="link" size="small" onClick={returnToCurrent}>{progress.length ? '回到当前环节' : '回到流程概况'}</Button>
            </div>
            <dl className="erp-workflow-tracking-step-guidance">
              {historical.actor ? <div><dt>办理人</dt><dd>{historical.actor}</dd></div> : null}
              {historical.startedAtLabel ? <div><dt>开始时间</dt><dd>{historical.startedAtLabel}</dd></div> : null}
              {historical.completedAtLabel ? <div><dt>结束时间</dt><dd>{historical.completedAtLabel}</dd></div> : null}
              {historical.reason ? <div><dt>处理说明</dt><dd>{historical.reason}</dd></div> : null}
            </dl>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default function WorkflowTrackingDrawer(props) {
  return <WorkflowTrackingView {...props} />
}

export function WorkflowTrackingDetailPane(props) {
  return <WorkflowTrackingView {...props} pane />
}

function WorkflowTrackingView({ trackingRef, onClose, onOpenTask, onAfterClose, refreshKey = '', closeLabel = '返回列表', open = Boolean(trackingRef), overview = null, overviewFooter = null, navigation = null, preferredTaskID, sourceAction, pane = false, paneID, suspended = false, journeyStep, onJourneyStepChange, detailReturnScroll }) {
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
  const paneBody = useRef(null)
  const detailBody = useRef(null)
  const taskButton = useRef(null)
  const returnPosition = useRef(null)
  const restoredPosition = useRef('')
  const [inspectedStep, setInspectedStep] = useState(null)
  const kind = trackingRef?.kind
  const id = trackingRef?.id
  const identity = `${kind}:${id}`
  const stepID = onJourneyStepChange ? journeyStep : inspectedStep?.identity === identity ? inspectedStep.id : null
  const key = JSON.stringify([kind, id, refreshKey, reload])
  useLayoutEffect(() => {
    if (paneBody.current) paneBody.current.scrollTop = 0
  }, [kind, id])
  useEffect(() => {
    if (suspended) return undefined
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
  }, [kind, id, key, suspended])
  const current = result?.key === key ? result : null
  const data = current?.data
  useLayoutEffect(() => {
    if (!open || suspended || !data) return undefined
    const local = returnPosition.current?.identity === identity ? returnPosition.current : null
    const top = local?.top ?? detailReturnScroll
    const token = `${identity}:${top}`
    if (!Number.isFinite(top) || (!local && restoredPosition.current === token)) return undefined
    const frame = requestAnimationFrame(() => {
      const scroller = paneBody.current || detailBody.current?.closest('.ant-drawer-body')
      if (!scroller) return
      scroller.scrollTop = top
      taskButton.current?.focus({ preventScroll: true })
      returnPosition.current = null
      restoredPosition.current = token
    })
    return () => cancelAnimationFrame(frame)
  }, [data, detailReturnScroll, identity, open, suspended])
  const availableTasks = onOpenTask ? (data?.summary.current_tasks || []).flatMap((task) => {
    const access = data.current_task_access.find((item) => item.task_id === task.task_id)
    return access?.can_read ? [{ ...task, canHandle: access.can_handle }] : []
  }) : []
  const selectedTask = availableTasks.length === 1 ? availableTasks[0] : availableTasks.find((task) => task.task_id === (selectedTaskID ?? preferredTaskID))
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
      if (!controller.signal.aborted) {
        const top = (paneBody.current || detailBody.current?.closest('.ant-drawer-body'))?.scrollTop || 0
        returnPosition.current = { identity, top }
        onOpenTask(task, top)
      }
    } catch (error) {
      if (!controller.signal.aborted) setTaskError(getActionErrorMessage(error, '打开当前任务失败，请重试'))
    } finally {
      if (taskRequest.current === controller) taskRequest.current = null
      if (!controller.signal.aborted) setOpeningTask(null)
    }
  }
  const summary = data?.summary
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
  const footer = trackingRef ? (
    <div className="erp-workflow-tracking-footer">
      {taskError ? <p role="alert" className="erp-workflow-tracking-task-error">{taskError}</p> : null}
      {availableTasks.length > 1 ? (
        <Select
          label="选择当前任务"
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
        <Button
          icon={<ReloadOutlined aria-hidden />}
          loading={!current}
          disabled={!current || Boolean(openingTask)}
          onClick={() => setReload((value) => value + 1)}
        >
          刷新进度
        </Button>
        {summary ? sourceAction : null}
        {availableTasks.length ? <Button ref={taskButton} type={selectedTask?.canHandle ? 'primary' : 'default'} className="erp-workflow-tracking-open-task" aria-label={taskActionLabel} aria-haspopup="dialog" disabled={!selectedTask} loading={Boolean(openingTask)} onClick={() => openTask(selectedTask.task_id)}>{taskActionLabel}</Button> : null}
      </div>
    </div>
  ) : overviewFooter
  const body = !trackingRef ? overview : !current ? <Spin tip="正在读取任务进度"><div className="erp-workflow-tracking-loading" /></Spin> : current.error ? (
    <Alert
      type="error"
      showIcon
      message="暂时无法读取任务进度"
      description="请重新读取；当前账号需有这条流程的查看权限。"
      action={<Button onClick={() => setReload((value) => value + 1)}>重新读取</Button>}
    />
      ) : (
        <div key={`${kind}:${id}`} ref={detailBody} className="erp-workflow-tracking-detail">
          <section className="erp-workflow-tracking-summary" aria-label="流程概况">
            <div className="erp-workflow-tracking-heading">
              <h2>{trackingTitle(summary)}</h2>
              <Tag color={trackingStatusColor(summary)}>{trackingStatus(summary)}</Tag>
            </div>
            <div className="erp-workflow-tracking-source"><WorkflowTaskSource task={summary} label={getWorkflowTaskSourceNo(summary)} /></div>
            <TrackingJourney data={data} stepID={stepID} onStepChange={onJourneyStepChange || ((step) => setInspectedStep({ identity, id: step }))} />
            <div className="erp-workflow-tracking-origin">
              <WorkflowInitiator summary={summary} compact />
              <span className="erp-workflow-tracking-meta"><BusinessHelpLabel label={`发起于 ${formatWorkflowTaskEventTime(summary.started_at).replace(/:\d{2}$/u, '')}`} description={`精确发起时间：${formatWorkflowTaskEventTime(summary.started_at)}`} /></span>
            </div>
            <TrackingAssociation summary={summary} />
            {kind !== MATERIAL_REVIEW_TRACKING_KIND ? <TrackingExceptions key={`${kind}:${id}:${refreshKey}`} trackingRef={{ kind, id }} onOpenTask={onOpenTask} refreshKey={reload} /> : null}
          </section>
          <details className="erp-workflow-tracking-history" aria-label="整条流程处理记录">
            <summary ref={historyHeading} className="erp-workflow-tracking-history-heading">
              <strong>{isFlowTracking(summary) ? '全部节点处理记录' : '处理记录'}</strong>
              <span>{eventItems.length ? `${data.events_truncated ? '最近 ' : ''}${eventItems.length} 条` : '暂无记录'} <RightOutlined aria-hidden="true" /></span>
            </summary>
            {eventItems.length ? <Timeline items={eventItems} /> : <Empty description={isFlowTracking(summary) ? '暂无人工任务处理记录' : '暂无处理记录'} />}
            {moreError ? <p role="alert">更早记录读取失败，已加载记录仍保留。</p> : null}
            {data.events_truncated ? <Space><Button onClick={loadMore} loading={loadingMore} aria-label={moreError ? '重新读取更早记录' : '加载更早记录'}>{moreError ? '重新读取更早记录' : '加载更早记录'}</Button></Space> : null}
          </details>
        </div>
  )
  if (pane) { return (
    <section className="erp-workflow-tracking-pane" id={paneID} aria-label="流程详情" aria-busy={Boolean(trackingRef && !current)}>
      <div className="erp-workflow-tracking-pane-body" ref={paneBody}>{body}</div>
      {footer ? <div className="erp-workflow-tracking-pane-footer">{footer}</div> : null}
    </section>
  ) }
  return (
    <Drawer
      title="流程跟踪"
      closeIcon={<LeftOutlined aria-hidden />}
      closable={{ placement: 'start', 'aria-label': closeLabel }}
      open={open}
      onClose={onClose}
      afterOpenChange={(open) => { if (!open) onAfterClose?.() }}
      width="min(760px, 100vw)"
      forceRender
      className="erp-workflow-drawer erp-workflow-tracking-drawer"
      footer={footer}
    >
      {navigation}
      {body}
      <MobileBackToTop mobileOnly enabled={Boolean(trackingRef)} />
    </Drawer>
  )
}
