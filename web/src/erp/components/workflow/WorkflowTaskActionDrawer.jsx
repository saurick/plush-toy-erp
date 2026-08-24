import React from 'react'
import {
  CheckCircleOutlined,
  LinkOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Alert, Button, Drawer, Input, Select, Tag, Typography } from 'antd'
import {
  getWorkflowTaskProcessContext,
  listWorkflowTaskEvents,
} from '../../api/workflowApi.mjs'
import { formatWorkflowTaskSource } from '../../utils/dashboardTaskDisplay.mjs'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import {
  getWorkflowTaskDueLabel,
  getWorkflowTaskOwnerRoleLabel,
  getWorkflowTaskReason,
  getWorkflowTaskStatusMeta,
} from '../../utils/workflowTaskBoard.mjs'
import {
  getWorkflowTaskActionOutcomeHint,
  getWorkflowTaskExceptionContactPresentation,
} from '../../utils/workflowTaskProcessingHint.mjs'
import {
  getWorkflowTaskActionStepAvailability,
  isWorkflowTaskActionReady,
  moveWorkflowTaskActionStep,
  resolveWorkflowTaskActionInitialStep,
  resolveWorkflowTaskActionStep,
} from '../../utils/workflowTaskActionFlow.mjs'
import {
  isWorkflowApprovalTask,
  isWorkflowProcessDecisionTask,
} from '../../utils/workflowTaskActionContract.mjs'
import {
  buildWorkflowProcessDecision,
  getWorkflowProcessDecisionApprovalForm,
  getWorkflowProcessDecisionApprovedQuantityError,
  workflowProcessDecisionAllowsApprovedQuantity,
} from '../../utils/workflowProcessDecision.mjs'
import {
  formatProcessStartedAt,
  getProcessLabel,
  getProcessStatusLabel,
  getWorkflowTaskDisplayName,
} from '../../utils/processRuntimePresentation.mjs'
import {
  buildWorkflowAssignmentSelectOptions,
  flattenWorkflowAssignmentSelectOptions,
} from '../../utils/workflowAssignmentSelectOptions.mjs'
import { formatAdminIdentity } from '../../utils/adminIdentity.mjs'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import BusinessAttachmentModalButton from '../business-list/BusinessAttachmentModalButton.jsx'
import WorkflowProcessStageTrack from './WorkflowProcessStageTrack.jsx'
import WorkflowTaskEventTrail from './WorkflowTaskEventTrail.jsx'

const { Paragraph, Text, Title } = Typography
const { TextArea } = Input

export const TASK_ACTION_META = Object.freeze({
  complete: {
    title: '处理完成',
    buttonLabel: '确认完成',
    successMessage: '任务已处理完成',
    requireReason: false,
  },
  block: {
    title: '标记阻塞',
    buttonLabel: '提交阻塞',
    successMessage: '阻塞原因已记录',
    requireReason: true,
  },
  reject: {
    title: '退回任务',
    buttonLabel: '提交退回',
    successMessage: '退回原因已记录',
    requireReason: true,
  },
  resume: {
    title: '解除阻塞',
    buttonLabel: '确认恢复待处理',
    successMessage: '任务已解除阻塞',
    requireReason: true,
  },
  urge: {
    title: '催办',
    buttonLabel: '提交催办',
    successMessage: '催办已记录',
    requireReason: true,
  },
  assign: {
    title: '转交任务',
    buttonLabel: '确认转交',
    successMessage: '任务已转交',
    requireReason: true,
  },
})

export function getWorkflowTaskActionMeta(task = {}, actionMode = '') {
  const base = TASK_ACTION_META[actionMode]
  if (!base) return null

  const processLinked = Number(task?.process_instance_id || 0) > 0
  if (!isWorkflowApprovalTask(task)) {
    if (!processLinked) return base
    if (actionMode === 'complete') {
      return {
        ...base,
        successMessage: '任务已处理完成，系统已按结果自动流转',
      }
    }
    if (actionMode === 'reject') {
      return {
        ...base,
        successMessage: '任务已退回，系统已按结果自动流转',
      }
    }
    return base
  }
  if (actionMode === 'complete') {
    return {
      ...base,
      title: '审批通过',
      buttonLabel: '确认通过',
      successMessage: processLinked
        ? '审批已通过，系统已按结果自动流转'
        : '审批已通过',
      requireReason: true,
    }
  }
  if (actionMode === 'reject') {
    return {
      ...base,
      title: '审批退回',
      buttonLabel: '确认退回',
      successMessage: processLinked
        ? '审批已退回，系统已按结果自动流转'
        : '审批已退回',
    }
  }
  return base
}

const TASK_DRAWER_STEPS = Object.freeze([
  {
    key: 'context',
    title: '核对任务',
  },
  {
    key: 'action',
    title: '选择处理',
  },
  {
    key: 'confirm',
    title: '确认与结果',
  },
])

const TASK_ACTION_DESCRIPTIONS = Object.freeze({
  complete: '任务已按要求处理完毕，确认后关闭当前待办。',
  block: '任务暂时无法继续，登记卡点和需要谁协助。',
  reject: '信息或处理结果不符合要求，退回上一责任方补充。',
  resume: '阻塞事项已经解决，恢复为可继续办理。',
  urge: '提醒当前负责人尽快处理，不代替对方完成任务。',
  assign: '转给同一负责岗位的其他人员，或暂不指定个人并退回该岗位共同待办。',
})

export function getTaskActionDescription(actionMode = '') {
  if (actionMode === 'complete') {
    return '确认后只完成当前任务；库存、出货、财务、开票或付款仍需进入对应业务页面处理。'
  }
  if (actionMode === 'block') {
    return '请写清卡点原因、影响范围和需要谁协助，便于后续处理。'
  }
  if (actionMode === 'reject') {
    return '请写清退回依据、需补齐事项和需要哪个岗位补充；退回不会撤销已经完成的业务处理。'
  }
  if (actionMode === 'resume') {
    return '请说明阻塞如何解除；确认后任务恢复为可办理，不会自动产生库存、出货或财务记录。'
  }
  if (actionMode === 'urge') {
    return '请写清催办接收人和需要补齐的事项，便于对方了解原因。'
  }
  if (actionMode === 'assign') {
    return '请选择同一负责岗位的合格在职人员；如果暂时不确定由谁接手，可退回该岗位共同待办。这一步只改处理人，不会把任务标为完成，也不会直接办理对应业务。'
  }
  return '先选择处理方式；任务详情只用于核对，不会直接生成或修改业务记录。'
}

function getTaskActionTone(actionMode = '') {
  if (actionMode === 'complete') return 'success'
  if (actionMode === 'block') return 'danger'
  if (actionMode === 'reject') return 'danger'
  if (actionMode === 'resume') return 'success'
  if (actionMode === 'urge') return 'warning'
  if (actionMode === 'assign') return 'warning'
  return 'neutral'
}

export default function WorkflowTaskActionDrawer({
  task,
  actionReceipt = null,
  actionMode = '',
  actionReason = '',
  actionSaving = false,
  actionAvailabilityLoading = false,
  allowedActionModes = [],
  readonlyReason = '',
  assignmentAccess = {},
  assignmentTarget,
  canOpenEntry = false,
  canViewAttachments = false,
  canManageAttachments = false,
  onActionModeChange,
  onActionReasonChange,
  onAssignmentTargetChange,
  onClose,
  onOpenEntry,
  onSubmit,
}) {
  const hasActionReceipt = Boolean(actionReceipt && task)
  const actionMeta = getWorkflowTaskActionMeta(task, actionMode)
  const approvalTask = isWorkflowApprovalTask(task)
  const statusMeta = task ? getWorkflowTaskStatusMeta(task) : null
  const isTerminal = task ? isTerminalWorkflowTask(task) : false
  const taskReason = task ? getWorkflowTaskReason(task) : ''
  const actionTone = getTaskActionTone(actionMode)
  const ownerRoleLabel = task ? getWorkflowTaskOwnerRoleLabel(task) : ''
  const currentAssigneeLabel =
    (assignmentAccess.current_assignee
      ? formatAdminIdentity(assignmentAccess.current_assignee)
      : '') || (task?.assignee_id ? '已指定处理人' : '共同待办')
  const taskDisplayName = task ? getWorkflowTaskDisplayName(task) : ''
  const exceptionContact = task
    ? getWorkflowTaskExceptionContactPresentation(task)
    : { parts: [], text: '' }
  const exceptionContactHint = exceptionContact.text
  const actionOutcomeHint = task
    ? getWorkflowTaskActionOutcomeHint({ task, actionMode })
    : ''
  const canOpenRelatedEntry = Boolean(task && canOpenEntry && onOpenEntry)
  const allowedActionModeSet = new Set(allowedActionModes)
  const canSubmitAction = Boolean(
    actionMode && allowedActionModeSet.has(actionMode) && !isTerminal
  )
  const canChooseActions = allowedActionModes.length > 0
  const taskIdentity = task
    ? String(task.id || task.task_code || task.task_name || '')
    : ''
  const [activeStepKey, setActiveStepKey] = React.useState('context')
  const [taskEvents, setTaskEvents] = React.useState([])
  const [taskEventsTruncated, setTaskEventsTruncated] = React.useState(false)
  const [taskEventsState, setTaskEventsState] = React.useState('idle')
  const [taskEventsError, setTaskEventsError] = React.useState('')
  const [processContext, setProcessContext] = React.useState(null)
  const [processContextState, setProcessContextState] = React.useState('idle')
  const [processContextReloadKey, setProcessContextReloadKey] =
    React.useState(0)
  const [approvedQuantity, setApprovedQuantity] = React.useState('')
  const previousTaskIdentityRef = React.useRef('')
  const stepButtonRefs = React.useRef(new Map())
  const actionOptionRefs = React.useRef(new Map())
  const visibleActionModes = allowedActionModes.filter(
    (mode) => TASK_ACTION_META[mode]
  )
  const processDecisionRequired =
    actionMode === 'complete' && isWorkflowProcessDecisionTask(task)
  const processApprovalForm = getWorkflowProcessDecisionApprovalForm(
    task,
    processContext
  )
  const processDecisionReady =
    !processDecisionRequired ||
    (processContextState === 'ready' && Boolean(processApprovalForm))
  const taskSourceLabel = task
    ? formatWorkflowTaskSource(
        processContext?.source
          ? {
              ...task,
              source_type: processContext.source.type,
              source_id: processContext.source.id,
              source_no: processContext.source.no,
            }
          : task
      )
    : ''
  const approvedQuantityAllowed =
    processDecisionRequired &&
    workflowProcessDecisionAllowsApprovedQuantity(processApprovalForm)
  const approvedQuantityError = approvedQuantityAllowed
    ? getWorkflowProcessDecisionApprovedQuantityError(
        processApprovalForm,
        approvedQuantity
      )
    : ''
  const assignmentOptions = buildWorkflowAssignmentSelectOptions({
    canReturnToPool: assignmentAccess.can_return_to_pool,
    candidates: assignmentAccess.candidates,
    ownerRoleLabel,
  })
  const assignmentTargets =
    flattenWorkflowAssignmentSelectOptions(assignmentOptions)
  const assignmentTargetValid =
    actionMode !== 'assign' ||
    assignmentTargets.some((option) => option.value === assignmentTarget)
  const assignmentTargetLabel =
    assignmentTargets.find((option) => option.value === assignmentTarget)
      ?.label || ''
  const hasVisibleActionSelection = visibleActionModes.includes(actionMode)
  const canConfirm =
    assignmentTargetValid &&
    processDecisionReady &&
    !approvedQuantityError &&
    isWorkflowTaskActionReady({
      actionMode,
      actionReason,
      allowedActionModes,
      requireReason: Boolean(actionMeta?.requireReason),
    })
  const actionStepAvailability = React.useMemo(
    () =>
      getWorkflowTaskActionStepAvailability({
        canChooseActions,
        canConfirm,
      }),
    [canChooseActions, canConfirm]
  )
  const stepAvailability = React.useMemo(
    () =>
      hasActionReceipt
        ? { context: false, action: false, confirm: true }
        : actionStepAvailability,
    [actionStepAvailability, hasActionReceipt]
  )
  React.useEffect(() => {
    if (taskIdentity === previousTaskIdentityRef.current) return
    previousTaskIdentityRef.current = taskIdentity
    setApprovedQuantity('')
    setActiveStepKey(resolveWorkflowTaskActionInitialStep(actionMode))
  }, [actionMode, taskIdentity])

  React.useEffect(() => {
    if (!task) {
      previousTaskIdentityRef.current = ''
      setApprovedQuantity('')
      setActiveStepKey('context')
    }
  }, [task])

  React.useEffect(() => {
    if (hasActionReceipt) setActiveStepKey('confirm')
  }, [hasActionReceipt, taskIdentity, task?.version])

  React.useEffect(() => {
    if (!task?.id) {
      setTaskEvents([])
      setTaskEventsTruncated(false)
      setTaskEventsState('idle')
      setTaskEventsError('')
      return undefined
    }
    const controller = new AbortController()
    setTaskEvents([])
    setTaskEventsTruncated(false)
    setTaskEventsState('loading')
    setTaskEventsError('')
    listWorkflowTaskEvents(task.id, { limit: 100, signal: controller.signal })
      .then(({ items, truncated }) => {
        setTaskEvents(items)
        setTaskEventsTruncated(truncated)
        setTaskEventsState('ready')
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setTaskEvents([])
        setTaskEventsTruncated(false)
        setTaskEventsState('error')
        setTaskEventsError(
          getActionErrorMessage(error, '加载本任务处理记录失败')
        )
      })
    return () => controller.abort()
  }, [task?.id, task?.version])

  React.useEffect(() => {
    if (!task?.id || !task?.process_instance_id) {
      setProcessContext(null)
      setProcessContextState('idle')
      return undefined
    }
    const controller = new AbortController()
    setProcessContext(null)
    setProcessContextState('loading')
    getWorkflowTaskProcessContext(task.id, { signal: controller.signal })
      .then((context) => {
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
    task?.id,
    task?.process_instance_id,
    task?.process_node_instance_id,
    task?.version,
    processContextReloadKey,
  ])

  React.useEffect(() => {
    if (stepAvailability[activeStepKey]) return
    setActiveStepKey(
      resolveWorkflowTaskActionStep({
        requestedStep: activeStepKey,
        availability: stepAvailability,
      })
    )
  }, [activeStepKey, stepAvailability])

  const selectAction = (nextMode, nextReason = '') => {
    if (actionSaving) return
    onActionModeChange?.(nextMode)
    onActionReasonChange?.(nextReason)
    setActiveStepKey('action')
  }

  const selectStep = (stepKey) => {
    if (actionSaving) return
    const nextStep = resolveWorkflowTaskActionStep({
      requestedStep: stepKey,
      availability: stepAvailability,
      fallbackStep: activeStepKey,
    })
    setActiveStepKey(nextStep)
  }

  const submitAction = () => {
    let processDecision = null
    if (processDecisionRequired) {
      try {
        processDecision = buildWorkflowProcessDecision({
          task,
          processContext,
          reason: actionReason,
          approvedQuantity,
        })
      } catch (error) {
        message.warning(
          getActionErrorMessage(
            error,
            '审批表单与当前流程节点不一致，请刷新后重试'
          )
        )
        return
      }
    }
    onSubmit?.({ processDecision })
  }

  const handleStepKeyDown = (event, stepKey) => {
    if (actionSaving) return
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return
    }
    let nextStepKey = stepKey
    if (event.key === 'Home') {
      nextStepKey = 'context'
    } else if (event.key === 'End') {
      nextStepKey = stepAvailability.confirm
        ? 'confirm'
        : stepAvailability.action
          ? 'action'
          : 'context'
    } else {
      nextStepKey = moveWorkflowTaskActionStep({
        currentStep: stepKey,
        direction: event.key === 'ArrowLeft' ? -1 : 1,
        availability: stepAvailability,
      })
    }
    event.preventDefault()
    setActiveStepKey(nextStepKey)
    requestAnimationFrame(() =>
      stepButtonRefs.current.get(nextStepKey)?.focus()
    )
  }

  const handleActionKeyDown = (event, mode) => {
    if (
      actionSaving ||
      ![
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ].includes(event.key)
    ) {
      return
    }
    const currentIndex = visibleActionModes.indexOf(mode)
    if (currentIndex < 0 || visibleActionModes.length === 0) return

    let nextIndex = currentIndex
    if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = visibleActionModes.length - 1
    } else {
      const offset =
        event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
      nextIndex =
        (currentIndex + offset + visibleActionModes.length) %
        visibleActionModes.length
    }

    const nextMode = visibleActionModes[nextIndex]
    event.preventDefault()
    selectAction(nextMode, nextMode === 'block' ? taskReason : '')
    requestAnimationFrame(() => actionOptionRefs.current.get(nextMode)?.focus())
  }

  const showFooter = Boolean(
    task &&
      (hasActionReceipt ||
        activeStepKey !== 'context' ||
        canOpenRelatedEntry ||
        canViewAttachments ||
        canChooseActions)
  )

  return (
    <Drawer
      title={
        <strong className="erp-task-action-drawer__title">
          {hasActionReceipt
            ? '办理结果'
            : approvalTask
              ? '审批详情'
              : '任务详情'}
        </strong>
      }
      width="min(640px, calc(100vw - 24px))"
      open={Boolean(task)}
      closable={!actionSaving}
      maskClosable={!actionSaving}
      keyboard={!actionSaving}
      onClose={() => {
        if (!actionSaving) onClose?.()
      }}
      destroyOnHidden
      className="erp-task-action-drawer"
      extra={
        task ? <Tag color={statusMeta?.color}>{statusMeta?.label}</Tag> : null
      }
      footer={
        showFooter ? (
          <div className="erp-task-action-drawer__footer">
            <div className="erp-task-action-drawer__footer-nav">
              {!hasActionReceipt && activeStepKey !== 'context' ? (
                <Button
                  disabled={actionSaving}
                  onClick={() =>
                    selectStep(
                      activeStepKey === 'confirm' ? 'action' : 'context'
                    )
                  }
                >
                  上一步
                </Button>
              ) : null}
              {canOpenRelatedEntry ? (
                <Button
                  icon={<LinkOutlined />}
                  disabled={actionSaving}
                  onClick={() => onOpenEntry(task)}
                >
                  查看相关单据
                </Button>
              ) : null}
              {canViewAttachments ? (
                <BusinessAttachmentModalButton
                  ownerType="workflow_task"
                  ownerId={task.id}
                  ownerVersion={task.version}
                  buttonText="任务附件"
                  modalTitle="任务附件"
                  panelTitle="附件内容"
                  description={
                    canManageAttachments
                      ? '上传照片、异常截图或处理凭证。'
                      : '查看照片、异常截图或处理凭证。'
                  }
                  canUpload={canManageAttachments}
                  canWithdraw={canManageAttachments}
                  disabled={actionSaving}
                  disabledReason="任务正在提交，请稍候"
                  showAttachmentCount
                  buttonProps={{
                    'data-testid': 'workflow-task-attachment-action',
                    size: 'middle',
                  }}
                />
              ) : null}
            </div>
            <div className="erp-task-action-drawer__footer-primary">
              {hasActionReceipt ? (
                <Button type="primary" onClick={() => onClose?.()}>
                  完成并关闭
                </Button>
              ) : activeStepKey === 'context' && canChooseActions ? (
                <Button
                  type="primary"
                  disabled={actionSaving}
                  onClick={() => selectStep('action')}
                >
                  选择处理方式
                </Button>
              ) : null}
              {!hasActionReceipt && activeStepKey === 'action' ? (
                <Button
                  type="primary"
                  disabled={actionSaving || !canConfirm}
                  title={
                    canConfirm
                      ? undefined
                      : processDecisionRequired && !processDecisionReady
                        ? '审批表单尚未与当前流程节点核对完成'
                        : approvedQuantityError ||
                          (actionMeta?.requireReason
                            ? '先选择处理方式并填写原因'
                            : '先选择处理方式')
                  }
                  onClick={() => selectStep('confirm')}
                >
                  核对并确认
                </Button>
              ) : null}
              {!hasActionReceipt && activeStepKey === 'confirm' ? (
                <Button
                  type="primary"
                  danger={actionMode === 'block' || actionMode === 'reject'}
                  icon={<SendOutlined />}
                  loading={actionSaving}
                  disabled={actionSaving || !canSubmitAction || !canConfirm}
                  onClick={submitAction}
                >
                  {actionMeta?.buttonLabel || '确认提交'}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null
      }
    >
      {task ? (
        <div className="erp-task-action-drawer__body" aria-busy={actionSaving}>
          <section className="erp-task-action-drawer__summary erp-task-action-drawer__summary--task">
            <Title level={4} className="erp-task-action-drawer__task-title">
              {taskDisplayName}
            </Title>
            <div className="erp-task-action-drawer__meta-grid erp-task-action-drawer__task-meta">
              <div>
                <span>来源单据</span>
                <strong>{taskSourceLabel}</strong>
              </div>
              <div>
                <span>{hasActionReceipt ? '本次责任岗位' : '负责人'}</span>
                <strong className="erp-task-action-drawer__responsibility">
                  {ownerRoleLabel ? (
                    <span className="erp-task-action-drawer__responsibility-role">
                      {ownerRoleLabel}
                    </span>
                  ) : null}
                  {!hasActionReceipt &&
                  ownerRoleLabel &&
                  currentAssigneeLabel ? (
                    <span
                      className="erp-task-action-drawer__responsibility-separator"
                      aria-hidden="true"
                    >
                      ·
                    </span>
                  ) : null}
                  {!hasActionReceipt && currentAssigneeLabel ? (
                    <span className="erp-task-action-drawer__responsibility-person">
                      {currentAssigneeLabel}
                    </span>
                  ) : null}
                  {!ownerRoleLabel &&
                  (!currentAssigneeLabel || hasActionReceipt)
                    ? '-'
                    : null}
                </strong>
              </div>
              <div>
                <span>截止时间</span>
                <strong>{getWorkflowTaskDueLabel(task)}</strong>
              </div>
            </div>
            {taskReason || exceptionContactHint ? (
              <div className="erp-task-action-drawer__reason">
                <span>{taskReason ? '当前原因' : '处理建议'}</span>
                {taskReason ? <strong>{taskReason}</strong> : null}
                {exceptionContactHint ? (
                  <span className="erp-task-action-drawer__reason-contact">
                    {exceptionContact.parts.map((part, index) =>
                      part.kind === 'role' ? (
                        <strong
                          className="erp-task-action-drawer__reason-contact-role"
                          key={`${part.kind}-${part.text}-${index}`}
                        >
                          {part.text}
                        </strong>
                      ) : (
                        <React.Fragment
                          key={`${part.kind}-${part.text}-${index}`}
                        >
                          {part.text}
                        </React.Fragment>
                      )
                    )}
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>

          {!hasActionReceipt && task.process_instance_id ? (
            <section
              className="erp-task-action-drawer__summary"
              aria-labelledby="erp-task-action-process-title"
            >
              <h3
                id="erp-task-action-process-title"
                className="erp-task-action-drawer__section-title"
              >
                业务进度
              </h3>
              {processContextState === 'loading' ? (
                <Text type="secondary" role="status">
                  正在读取业务进度
                </Text>
              ) : processContextState === 'error' ? (
                <Alert
                  type="error"
                  showIcon
                  message="暂时无法读取业务进度"
                  action={
                    <Button
                      size="small"
                      onClick={() =>
                        setProcessContextReloadKey((current) => current + 1)
                      }
                    >
                      重新读取
                    </Button>
                  }
                />
              ) : processContext ? (
                <>
                  <div className="erp-task-action-drawer__meta-grid erp-task-action-drawer__process-meta">
                    <div>
                      <span>业务流程</span>
                      <strong>
                        {getProcessLabel(processContext.process_instance)}
                      </strong>
                    </div>
                    <div>
                      <span>发起时间</span>
                      <strong>
                        {formatProcessStartedAt(
                          processContext.process_instance.started_at
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>流程状态</span>
                      <strong>
                        {getProcessStatusLabel(processContext.process_instance)}
                      </strong>
                    </div>
                  </div>
                  <WorkflowProcessStageTrack context={processContext} />
                </>
              ) : null}
            </section>
          ) : null}

          <section
            className="erp-task-action-drawer__guide"
            aria-label="任务处理导引"
          >
            <div
              className="erp-task-action-drawer__guide-steps"
              role="tablist"
              aria-label="任务处理步骤"
            >
              {TASK_DRAWER_STEPS.map((step, index) => {
                const active = step.key === activeStepKey
                const available = stepAvailability[step.key]
                const interactive =
                  available && !actionSaving && !hasActionReceipt
                return (
                  <button
                    type="button"
                    key={step.key}
                    ref={(node) => {
                      if (node) stepButtonRefs.current.set(step.key, node)
                      else stepButtonRefs.current.delete(step.key)
                    }}
                    id={`erp-task-action-step-${step.key}-tab`}
                    role="tab"
                    aria-selected={active}
                    aria-controls={`erp-task-action-step-${step.key}`}
                    aria-disabled={!interactive}
                    disabled={!interactive}
                    tabIndex={active ? 0 : -1}
                    title={
                      actionSaving
                        ? '正在提交，请稍候'
                        : available
                          ? `进入${step.title}`
                          : step.key === 'confirm'
                            ? '先选择处理方式并补齐必填信息'
                            : '当前账号没有可用的处理方式'
                    }
                    className={[
                      'erp-task-action-drawer__step',
                      active ? 'erp-task-action-drawer__step--active' : '',
                      !interactive
                        ? 'erp-task-action-drawer__step--disabled'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => interactive && selectStep(step.key)}
                    onKeyDown={(event) => handleStepKeyDown(event, step.key)}
                  >
                    <span>{index + 1}</span>
                    <strong>{step.title}</strong>
                  </button>
                )
              })}
            </div>
          </section>

          <section
            id="erp-task-action-step-context"
            role="tabpanel"
            aria-labelledby="erp-task-action-step-context-tab"
            hidden={activeStepKey !== 'context'}
            className="erp-task-action-drawer__step-panel"
          >
            {actionAvailabilityLoading ? (
              <Text type="secondary" role="status">
                正在确认可用的处理方式
              </Text>
            ) : !canChooseActions ? (
              <Alert
                type="warning"
                showIcon
                message="当前只能查看任务"
                description={readonlyReason || '当前账号不能直接处理该任务。'}
              />
            ) : null}
            <WorkflowTaskEventTrail
              approvalTask={approvalTask}
              errorMessage={taskEventsError}
              events={taskEvents}
              state={taskEventsState}
              task={task}
              truncated={taskEventsTruncated}
              showResponsibility={false}
            />
          </section>

          <section
            id="erp-task-action-step-action"
            role="tabpanel"
            aria-labelledby="erp-task-action-step-action-tab"
            hidden={activeStepKey !== 'action'}
            className="erp-task-action-drawer__step-panel"
          >
            <div className="erp-task-action-drawer__action-workspace">
              <div className="erp-task-action-drawer__action-prompt">
                <strong>
                  {canChooseActions ? '选择处理方式' : '当前只能查看任务'}
                </strong>
                <span>
                  {canChooseActions
                    ? '选择一项当前可用操作；催办只是处理方式之一，不会代替负责人办理任务。'
                    : readonlyReason || '当前账号不能直接处理该任务。'}
                </span>
              </div>
              {canChooseActions ? (
                <div
                  className="erp-task-action-drawer__action-options"
                  role="radiogroup"
                  aria-label="处理方式"
                >
                  {visibleActionModes.map((mode, index) => {
                    const meta = getWorkflowTaskActionMeta(task, mode)
                    const selected = actionMode === mode
                    return (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={actionSaving}
                        key={mode}
                        ref={(node) => {
                          if (node) actionOptionRefs.current.set(mode, node)
                          else actionOptionRefs.current.delete(mode)
                        }}
                        tabIndex={
                          selected ||
                          (!hasVisibleActionSelection && index === 0)
                            ? 0
                            : -1
                        }
                        className={[
                          'erp-task-action-drawer__action-option',
                          `erp-task-action-drawer__action-option--${getTaskActionTone(mode)}`,
                          selected
                            ? 'erp-task-action-drawer__action-option--selected'
                            : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() =>
                          selectAction(mode, mode === 'block' ? taskReason : '')
                        }
                        onKeyDown={(event) => handleActionKeyDown(event, mode)}
                      >
                        <span className="erp-task-action-drawer__action-option-mark">
                          {selected ? <CheckCircleOutlined /> : null}
                        </span>
                        <span>
                          <strong>{meta.title}</strong>
                          <small>{TASK_ACTION_DESCRIPTIONS[mode]}</small>
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
              {actionMeta ? (
                <section
                  className={[
                    'erp-task-action-drawer__action-panel',
                    `erp-task-action-drawer__action-panel--${actionTone}`,
                  ].join(' ')}
                >
                  <div className="erp-task-action-drawer__action-head">
                    <div>
                      <span>当前操作</span>
                      <strong>{actionMeta.title}</strong>
                    </div>
                    <Tag color={actionMeta.requireReason ? 'orange' : 'green'}>
                      {actionMeta.requireReason
                        ? approvalTask && actionMode === 'complete'
                          ? '必须填写审批意见'
                          : '必须填写原因'
                        : '确认即可'}
                    </Tag>
                  </div>
                  <Paragraph className="erp-task-action-drawer__action-copy">
                    {getTaskActionDescription(actionMode)}
                  </Paragraph>
                  {actionMode === 'assign' ? (
                    <div className="erp-task-action-drawer__assignment">
                      <label htmlFor="erp-task-assignment-target">
                        转交去向
                      </label>
                      <Select
                        id="erp-task-assignment-target"
                        value={assignmentTarget}
                        options={assignmentOptions}
                        showSearch
                        optionFilterProp="label"
                        disabled={
                          actionSaving ||
                          !canSubmitAction ||
                          assignmentAccess.loading
                        }
                        placeholder={
                          assignmentAccess.loading
                            ? '正在加载可选接收人'
                            : '选择接收人，或退回负责岗位共同待办'
                        }
                        notFoundContent={
                          assignmentAccess.stale
                            ? '任务信息已更新，请刷新任务列表'
                            : assignmentAccess.failed
                              ? '转交信息加载失败，请关闭后重试'
                              : '当前没有符合条件的接收人'
                        }
                        onChange={(value) => onAssignmentTargetChange?.(value)}
                      />
                      {assignmentAccess.stale ? (
                        <Alert
                          type="warning"
                          showIcon
                          message="任务信息已更新"
                          description="请刷新任务列表后重新打开当前任务，系统不会使用旧版本的转交候选人。"
                        />
                      ) : assignmentAccess.failed ? (
                        <Alert
                          type="warning"
                          showIcon
                          message="转交信息加载失败"
                          description="其他任务操作不受影响；关闭抽屉后可重新加载转交候选人。"
                        />
                      ) : null}
                    </div>
                  ) : null}
                  {!canSubmitAction ? (
                    <Alert
                      type="warning"
                      showIcon
                      message="当前账号不能提交这项操作"
                      description={
                        readonlyReason || '请确认任务状态、负责岗位和可用操作。'
                      }
                    />
                  ) : null}
                  {processDecisionRequired &&
                  processContextState === 'loading' ? (
                    <Text type="secondary" role="status">
                      正在核对当前流程的审批表单，核对完成前不能提交。
                    </Text>
                  ) : processDecisionRequired && !processApprovalForm ? (
                    <Alert
                      type="error"
                      showIcon
                      message="审批表单与当前流程节点不一致"
                      description="请关闭后刷新任务再试；系统不会按任务名称或页面入口猜测审批字段。"
                    />
                  ) : null}
                  {actionMeta.requireReason ? (
                    <TextArea
                      value={actionReason}
                      autoSize={{ minRows: 4, maxRows: 6 }}
                      maxLength={180}
                      showCount
                      disabled={actionSaving || !canSubmitAction}
                      placeholder={
                        approvalTask && actionMode === 'complete'
                          ? '填写审批意见和判断依据'
                          : actionMode === 'assign'
                            ? '填写请假、人员调整等转交原因'
                            : '填写原因、影响范围、需要谁协助'
                      }
                      onChange={(event) =>
                        onActionReasonChange?.(event.target.value)
                      }
                    />
                  ) : (
                    <div className="erp-task-action-drawer__confirm-copy">
                      <CheckCircleOutlined aria-hidden="true" />
                      <span>
                        提交后任务会进入已完成；相关业务是否办结，请到对应业务页面确认。
                      </span>
                    </div>
                  )}
                  {approvedQuantityAllowed ? (
                    <div className="erp-task-action-drawer__assignment">
                      <label htmlFor="erp-task-approved-quantity">
                        批准数量（可选）
                      </label>
                      <Input
                        id="erp-task-approved-quantity"
                        inputMode="decimal"
                        value={approvedQuantity}
                        status={approvedQuantityError ? 'error' : undefined}
                        disabled={actionSaving || !canSubmitAction}
                        placeholder="留空表示按申请数量批准"
                        onChange={(event) =>
                          setApprovedQuantity(event.target.value)
                        }
                      />
                      {approvedQuantityError ? (
                        <Alert
                          type="error"
                          showIcon
                          message={approvedQuantityError}
                        />
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          </section>

          <section
            id="erp-task-action-step-confirm"
            role="tabpanel"
            aria-labelledby="erp-task-action-step-confirm-tab"
            hidden={activeStepKey !== 'confirm'}
            className="erp-task-action-drawer__step-panel"
          >
            {hasActionReceipt ? (
              <div
                className="erp-task-action-drawer__confirm-panel"
                data-testid="workflow-task-action-receipt"
              >
                <div
                  className="erp-task-action-drawer__confirm-copy"
                  role="status"
                >
                  <CheckCircleOutlined aria-hidden="true" />
                  <span>
                    <strong>办理结果已确认</strong>
                    <br />
                    {actionReceipt.successMessage ||
                      '本次办理结果已由系统确认。'}
                  </span>
                </div>
                <dl className="erp-task-action-drawer__confirm-list">
                  <div>
                    <dt>当前任务</dt>
                    <dd>{taskDisplayName}</dd>
                  </div>
                  <div>
                    <dt>已确认方式</dt>
                    <dd>
                      {actionReceipt.actionTitle ||
                        actionMeta?.title ||
                        '任务办理'}
                    </dd>
                  </div>
                  <div>
                    <dt>确认状态</dt>
                    <dd>{statusMeta?.label || '已确认'}</dd>
                  </div>
                  {String(actionReceipt.reason || '').trim() ? (
                    <div>
                      <dt>处理说明</dt>
                      <dd>{String(actionReceipt.reason).trim()}</dd>
                    </div>
                  ) : null}
                </dl>
                <div
                  className="erp-task-action-drawer__outcome-note"
                  data-tone="info"
                >
                  <strong>流程交接结果</strong>
                  {task.process_instance_id ? (
                    processContextState === 'loading' ? (
                      <Text type="secondary" role="status">
                        正在读取流程交接结果
                      </Text>
                    ) : processContextState === 'error' ? (
                      <>
                        <Text type="danger" role="alert">
                          暂时无法读取流程交接结果
                        </Text>
                        <Button
                          size="small"
                          onClick={() =>
                            setProcessContextReloadKey(
                              (current) => current + 1
                            )
                          }
                        >
                          重新读取
                        </Button>
                      </>
                    ) : processContext ? (
                      <WorkflowProcessStageTrack context={processContext} />
                    ) : null
                  ) : (
                    <span>
                      {isTerminal
                        ? '本任务已结束，没有关联的后续业务流程。'
                        : '本次操作不触发流程流转，任务仍由当前负责岗位继续办理。'}
                    </span>
                  )}
                </div>
              </div>
            ) : actionMeta ? (
              <div className="erp-task-action-drawer__confirm-panel">
                <div className="erp-task-action-drawer__confirm-head">
                  <span>即将提交</span>
                  <strong>{actionMeta.title}</strong>
                </div>
                <dl className="erp-task-action-drawer__confirm-list">
                  <div>
                    <dt>当前任务</dt>
                    <dd>{taskDisplayName}</dd>
                  </div>
                  <div>
                    <dt>处理方式</dt>
                    <dd>{actionMeta.title}</dd>
                  </div>
                  {actionMeta.requireReason ? (
                    <div>
                      <dt>处理原因</dt>
                      <dd>{actionReason.trim()}</dd>
                    </div>
                  ) : null}
                  {approvedQuantityAllowed && approvedQuantity.trim() ? (
                    <div>
                      <dt>批准数量</dt>
                      <dd>{approvedQuantity.trim()}</dd>
                    </div>
                  ) : null}
                  {actionMode === 'assign' ? (
                    <>
                      <div>
                        <dt>当前处理人</dt>
                        <dd>
                          {(assignmentAccess.current_assignee
                            ? formatAdminIdentity(
                                assignmentAccess.current_assignee
                              )
                            : '') ||
                            (task.assignee_id
                              ? '已指定处理人'
                              : '负责岗位共同待办')}
                        </dd>
                      </div>
                      <div>
                        <dt>转交去向</dt>
                        <dd>{assignmentTargetLabel}</dd>
                      </div>
                    </>
                  ) : null}
                </dl>
                <div
                  className="erp-task-action-drawer__outcome-note"
                  data-tone={actionTone === 'danger' ? 'warning' : 'info'}
                  role="note"
                >
                  <strong>提交后会发生什么</strong>
                  <span>{actionOutcomeHint}</span>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </Drawer>
  )
}
