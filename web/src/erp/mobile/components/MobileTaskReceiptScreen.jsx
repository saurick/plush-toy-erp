import React from 'react'
import {
  CheckOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  HistoryOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import WorkflowTaskReceipt from '../../components/workflow/WorkflowTaskReceipt.jsx'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import { getWorkflowTaskAssigneeLabel } from '../../utils/workflowTaskEventPresentation.mjs'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import {
  normalizeMobileTaskActionKey,
  resolveMobileActionDisplayLabel,
  resolveMobileTaskStatusLabel,
} from '../utils/mobileRoleTaskModel.mjs'
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'
import MobileTaskAttachments from './MobileTaskAttachments.jsx'
import { WorkflowTaskCopySummary } from '../../components/workflow/WorkflowTaskCopy.jsx'
import { isWorkflowApprovalTask } from '../../utils/workflowTaskActionContract.mjs'
import { getWorkflowTaskProcessContext, listWorkflowTaskEvents } from '../../api/workflowApi.mjs'
import WorkflowProcessStageTrack from '../../components/workflow/WorkflowProcessStageTrack.jsx'
import WorkflowTaskEventTrail from '../../components/workflow/WorkflowTaskEventTrail.jsx'
import useWorkflowTaskBusinessReadback from '../../hooks/useWorkflowTaskBusinessReadback.js'

const MOBILE_TASK_RECEIPT_OUTCOMES = Object.freeze({
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
  RECORDED: 'recorded',
})

const OUTCOME_META = Object.freeze({
  [MOBILE_TASK_RECEIPT_OUTCOMES.RECORDED]: {
    icon: HistoryOutlined,
    iconClass: 'text-slate-600',
    title: '已记录的办理结果',
  },
  [MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED]: {
    icon: CheckOutlined,
    iconClass: 'bg-emerald-50 text-emerald-600',
    title: '任务办理已确认',
  },
  [MOBILE_TASK_RECEIPT_OUTCOMES.UNKNOWN]: {
    icon: ClockCircleOutlined,
    iconClass: 'bg-amber-50 text-amber-700',
    title: '提交结果待确认',
    description:
      '系统尚未确认本次提交是否生效，请先重新确认结果，避免重复办理。',
  },
  [MOBILE_TASK_RECEIPT_OUTCOMES.FAILED]: {
    icon: CloseOutlined,
    iconClass: 'bg-red-50 text-red-600',
    title: '本次操作未完成',
    description: '任务状态没有得到确认。您可以查看任务并重新办理。',
  },
})

function resolveReceiptAction({ action, outcome, task }) {
  const candidate =
    outcome === MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED
      ? task?.mobile_action || action
      : action
  const candidateActionKey = normalizeMobileTaskActionKey(
    typeof candidate === 'string' ? candidate : candidate?.action_key
  )
  if (isWorkflowApprovalTask(task) && candidateActionKey === 'done') {
    return { key: candidateActionKey, label: '审批通过' }
  }
  return {
    key: candidateActionKey,
    label: candidate
      ? resolveMobileActionDisplayLabel(candidate)
      : '办理信息暂不可用',
  }
}

export default function MobileTaskReceiptScreen({
  profile,
  action = null,
  backLabel = null,
  busy = false,
  evidenceRefs = [],
  feedback = '',
  message = '',
  statusLabel = '',
  recordNo = '',
  onBackToList = () => {},
  onOpenProcess = null,
  onOpenTaskForm = null,
  onRetryConfirm = null,
  onRetryTaskLoad = null,
  onViewTask = null,
  outcome = MOBILE_TASK_RECEIPT_OUTCOMES.UNKNOWN,
  reason = '',
  task = null,
  taskRecoveryBusy = false,
  taskRecoveryError = '',
  taskRecoveryPending = false,
  businessResult = false,
  businessReceipt = null,
  canManageAttachments = false,
}) {
  const outcomeMeta = OUTCOME_META[outcome] || OUTCOME_META.unknown
  const OutcomeIcon = outcomeMeta.icon
  const taskStatus =
    statusLabel ||
    (task ? resolveMobileTaskStatusLabel(task) : '任务状态暂不可用')
  const { key: actionKey, label: resolvedActionLabel } = resolveReceiptAction({
    action,
    outcome,
    task,
  })
  const actionLabel = businessResult ? message || '业务办理' : resolvedActionLabel
  const approvalAction =
    !businessResult && isWorkflowApprovalTask(task) && ['done', 'rejected'].includes(actionKey)
  const confirmed = outcome === MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED
  const recorded = outcome === MOBILE_TASK_RECEIPT_OUTCOMES.RECORDED
  const sourceReadback = useWorkflowTaskBusinessReadback({ task, profile, enabled: recorded })
  const feedbackText = String(feedback || '').trim()
  const reasonText = String(reason || '').trim()
  const canOpenBusinessForm = (confirmed || recorded) && typeof onOpenTaskForm === 'function'
  const canContinueBusiness = confirmed && (!businessReceipt?.taskReadState || businessReceipt.taskReadState === 'ready') && !isTerminalWorkflowTask(task || {}) && typeof onOpenTaskForm === 'function'
  const hasProcessAnchor = Boolean(
    task?.id && task?.process_instance_id && task?.process_node_instance_id
  )
  const canRetry =
    outcome !== MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED && onRetryConfirm
  const canReload = Boolean(taskRecoveryError && onRetryTaskLoad)
  const [processContext, setProcessContext] = React.useState(null)
  const [processContextState, setProcessContextState] = React.useState('idle')
  const [history, setHistory] = React.useState({ state: 'loading', items: [], truncated: false })
  const [historyRetry, setHistoryRetry] = React.useState(0)

  React.useEffect(() => {
    if (!recorded || !task?.id) return undefined
    const controller = new AbortController()
    setHistory({ state: 'loading', items: [], truncated: false })
    listWorkflowTaskEvents(task.id, { limit: 100, signal: controller.signal })
      .then((result) => {
        if (!controller.signal.aborted) setHistory({ ...result, state: 'ready' })
      })
      .catch(() => {
        if (!controller.signal.aborted) setHistory({ state: 'error', items: [], truncated: false })
      })
    return () => controller.abort()
  }, [recorded, task?.id, task?.version, historyRetry])

  React.useEffect(() => {
    if (
      outcome !== MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED ||
      !hasProcessAnchor
    ) {
      setProcessContext(null)
      setProcessContextState('idle')
      return undefined
    }
    const controller = new AbortController()
    setProcessContext(null)
    setProcessContextState('loading')
    getWorkflowTaskProcessContext(task.id, { signal: controller.signal })
      .then((context) => {
        if (controller.signal.aborted) return
        setProcessContext(context)
        setProcessContextState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setProcessContext(null)
        setProcessContextState('error')
      })
    return () => controller.abort()
  }, [
    hasProcessAnchor,
    outcome,
    task?.id,
    task?.process_instance_id,
    task?.process_node_instance_id,
    task?.version,
  ])

  return (
    <div
      className="mobile-role-tasks-page mobile-role-tasks-page--detail mobile-role-tasks-page--task-info mobile-task-screen md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      aria-busy={busy}
      data-testid="mobile-task-receipt-screen"
      data-outcome={recorded || confirmed ? outcome : undefined}
    >
      <MobileTaskFlowHeader
        backLabel={backLabel || '返回任务列表'}
        busy={busy}
        canOpenProcess={canOpenBusinessForm || typeof onOpenProcess === 'function'}
        canOpenReceipt
        currentStep="result"
        onBack={onBackToList}
        onOpenDetail={onViewTask}
        onOpenProcess={canOpenBusinessForm ? onOpenTaskForm : onOpenProcess}
        processUnavailableLabel="结果已确认"
        title="结果回执"
        trailing={task ? <WorkflowTaskCopySummary task={task} assigneeLabel={getWorkflowTaskAssigneeLabel(task)} compact disabled={busy} /> : null}
      />

      <main className="mobile-role-tasks-page__detail-main mobile-detail-content">
        {!recorded && !confirmed ? (
          <section
            className="mobile-task-receipt-outcome erp-mobile-card mobile-detail-section"
            data-outcome={outcome}
            role={
            outcome === MOBILE_TASK_RECEIPT_OUTCOMES.FAILED ? 'alert' : 'status'
          }
          >
            <span
              className={`mobile-task-receipt-outcome__icon ${outcomeMeta.iconClass}`}
            >
              <OutcomeIcon aria-hidden="true" />
            </span>
            <h2 className="text-base font-semibold text-slate-950">
              {approvalAction && confirmed ? '审批办理已确认' : outcomeMeta.title}
            </h2>
            {message || outcomeMeta.description ? (
              <p className="break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">
                {message || outcomeMeta.description}
              </p>
          ) : null}
          </section>
        ) : null}

        {taskRecoveryPending ? (
          <section
            className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${
              taskRecoveryError
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-blue-200 bg-blue-50 text-blue-700'
            }`}
            role={taskRecoveryError ? 'alert' : 'status'}
          >
            <div className="flex items-start gap-3">
              {taskRecoveryBusy ? (
                <LoadingOutlined className="mt-1 shrink-0" spin />
              ) : (
                <ReloadOutlined className="mt-1 shrink-0" />
              )}
              <div className="min-w-0">
                <div className="font-semibold">
                  {taskRecoveryError
                    ? '任务重新载入失败'
                    : '正在恢复可重试任务'}
                </div>
                <div className="mt-1 break-words [overflow-wrap:anywhere]">
                  {taskRecoveryError ||
                    '正在重新载入这条任务；回执和已填写内容会继续保留。'}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <WorkflowTaskReceipt task={task} events={history.items} state={recorded ? history.state : 'ready'} sourceReadback={sourceReadback} receipt={!recorded ? { ...businessReceipt, actionTitle: actionLabel, recordNo, successMessage: confirmed ? message : '', statusLabel: confirmed || recorded ? taskStatus : `已知状态：${taskStatus}`, reasonLabel: approvalAction ? '审批意见' : '办理说明', reason: feedbackText || reasonText, additionalReason: reasonText } : null} />
        {Array.isArray(evidenceRefs) && evidenceRefs.length > 0 ? <details className="mobile-detail-section"><summary>办理凭据</summary>{evidenceRefs.map((reference) => <p key={reference}>{reference}</p>)}</details> : null}

        {recorded ? (
          <>
            <WorkflowTaskEventTrail
              className="mobile-detail-section"
              task={task}
              approvalTask={isWorkflowApprovalTask(task)}
              events={history.items}
              state={history.state}
              truncated={history.truncated}
              variant="mobile"
              compact
              showResponsibility={false}
              errorMessage="办理记录暂时无法读取，请重新读取。"
            />
            {history.state === 'error' ? <button type="button" className="mobile-detail-primary" onClick={() => setHistoryRetry((value) => value + 1)}>重新读取办理记录</button> : null}
          </>
        ) : null}

        {outcome === MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED &&
        hasProcessAnchor ? (
          <section
            className="erp-mobile-card mobile-detail-section"
            data-testid="mobile-task-receipt-handoff"
          >
            <h2 className="text-sm font-semibold text-slate-950">
              流程交接结果
            </h2>
            {processContextState === 'error' ? (
              <p className="mt-3 text-sm text-red-600">
                当前流程暂时无法显示。
              </p>
            ) : processContext ? (
              <WorkflowProcessStageTrack
                className="mt-4"
                context={processContext}
                variant="mobile"
              />
            ) : (
              <p className="mt-3 text-sm text-slate-500">
                正在读取流程交接结果
              </p>
            )}
          </section>
        ) : null}
        <MobileBackToTop />
      </main>

      <div
        className={`mobile-role-action-bar ${canRetry || canReload ? 'mobile-task-receipt-footer' : ''}`}
      >
        <MobileTaskAttachments task={task} canManage={canManageAttachments} busy={busy} />
        {!canRetry && !canReload && !canContinueBusiness ? (
          <button
            type="button"
            className="mobile-detail-primary"
            disabled={busy}
            onClick={onBackToList}
          >
            {backLabel || (confirmed ? '返回任务列表' : '返回列表')}
          </button>
        ) : null}
        {canContinueBusiness ? (
          <button type="button" className="mobile-detail-primary min-h-12 rounded-xl px-4 py-3 text-base font-semibold" disabled={busy} onClick={onOpenTaskForm}>
            继续办理
          </button>
        ) : null}
        {canReload ? (
          <button
            type="button"
            aria-label={taskRecoveryBusy ? '正在重新载入' : '重新载入任务'}
            className="mobile-detail-primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={taskRecoveryBusy}
            onClick={onRetryTaskLoad}
          >
            {taskRecoveryBusy ? <LoadingOutlined spin /> : <ReloadOutlined />}
            {taskRecoveryBusy ? '正在重新载入' : '重新载入任务'}
          </button>
        ) : null}
        {canRetry && !canReload ? (
          <button
            type="button"
            aria-label={busy ? '正在确认' : '重新确认结果'}
            className="mobile-detail-primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={busy}
            onClick={onRetryConfirm}
          >
            {busy ? <LoadingOutlined spin /> : <ReloadOutlined />}
            {busy ? '正在确认' : '重新确认结果'}
          </button>
        ) : null}
      </div>
    </div>
  )
}
