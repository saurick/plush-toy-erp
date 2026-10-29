import React from 'react'
import { createPortal } from 'react-dom'
import {
  CheckCircleOutlined,
  LeftOutlined,
  ExportOutlined,
  SendOutlined,
} from '@ant-design/icons'
import { Alert, Button, Drawer, Input, Tag, Typography } from 'antd'
import { resolveMobileTaskBusinessEntry } from '../../mobile/utils/mobileTaskBusiness.mjs'
import WorkflowTaskReceipt from './WorkflowTaskReceipt.jsx'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { TaskBusinessWorkspaceContext, TaskBusinessInformationContext } from '../../hooks/useBusinessPageContext.js'
import InventoryOperationTaskReview from '../inventory/InventoryOperationTaskReview.jsx'
import Select from '@/common/components/select/AppSelect'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import WorkflowFollowupDetails, { hasWorkflowFollowupDetails } from './WorkflowFollowupDetails.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import WorkflowTaskInfoCard from './WorkflowTaskInfoCard.jsx'
import WorkflowTaskTiming from './WorkflowTaskTiming.jsx'
import WorkflowTaskCurrentSummary from './WorkflowTaskCurrentSummary.jsx'
import {
  WorkflowTaskCopySummary,
  WorkflowTaskSource,
} from './WorkflowTaskCopy.jsx'
import {
  getWorkflowTaskProcessContext,
  listWorkflowTaskEvents,
} from '../../api/workflowApi.mjs'
import { isTerminalWorkflowTask } from '../../utils/workflowTaskLifecycle.mjs'
import { workflowTaskBusinessContract } from '../../utils/workflowTaskBusinessContract.mjs'
import useWorkflowTaskBusinessReadback from '../../hooks/useWorkflowTaskBusinessReadback.js'
import useTaskBusinessInformation from '../../hooks/useTaskBusinessInformation.js'
import { workflowTaskAdminAccessRequestIdentity } from '../../utils/workflowTaskActionAccess.mjs'
import { isEngineeringMaterialTask } from '../../utils/engineeringMaterialTask.mjs'
import {
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
  orderWorkflowTaskActions,
  workflowTaskCollaborationModes,
  workflowTaskHandlingModes,
  workflowTaskPrimaryModes,
  resolveWorkflowTaskActionInitialStep,
  resolveWorkflowTaskActionStep,
} from '../../utils/workflowTaskActionFlow.mjs'
import {
  isWorkflowApprovalTask,
  isWorkflowProcessDecisionTask,
  workflowTaskActionRequiresReason,
} from '../../utils/workflowTaskActionContract.mjs'
import {
  buildWorkflowProcessDecision,
  getWorkflowProcessDecisionApprovalForm,
  getWorkflowProcessDecisionApprovedQuantityError,
  workflowProcessDecisionAllowsApprovedQuantity,
} from '../../utils/workflowProcessDecision.mjs'
import {
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
import WorkflowTaskHandlingChain from './WorkflowTaskHandlingChain.jsx'
import { TASK_ACTION_META, getWorkflowTaskActionMeta } from '../../utils/workflowTaskActionPresentation.mjs'
import WorkflowTaskSecondaryActions, { WorkflowTaskActionGroup } from './WorkflowTaskSecondaryActions.jsx'
import WorkflowTaskEventTrail from './WorkflowTaskEventTrail.jsx'
import WorkflowTaskBlockReason from './WorkflowTaskBlockReason.jsx'
import { isWorkflowTaskBlockReasonReady } from '../../utils/workflowTaskBlockReason.mjs'

const { Text, Title } = Typography
const { TextArea } = Input

const TASK_DRAWER_STEPS = Object.freeze([
  {
    key: 'context',
    title: '任务信息',
  },
  {
    key: 'action',
    title: '任务办理',
  },
  {
    key: 'confirm',
    title: '结果回执',
  },
])

const TASK_ACTION_DESCRIPTIONS = Object.freeze({
  complete: '任务已按要求处理完毕，确认后关闭当前待办。',
  block: '任务暂时无法继续，登记卡点和需要谁协助。',
  reject: '信息或处理结果不符合要求，退回上一责任方补充。',
  resume: '阻塞事项已经解决，恢复为可继续办理。',
  urge: '提醒当前负责人尽快处理，不代替对方完成任务。',
  assign: '转给同岗位的其他人员，或交回岗位，由有权限的人员处理。',
})

export function getTaskActionDescription(actionMode = '') {
  if (actionMode === 'complete') {
    return '确认后关闭当前任务；库存、出货与财务结果以实际业务办理记录为准。'
  }
  if (actionMode === 'block') {
    return '选择受阻原因，需要时补充具体情况或需要谁协助。'
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
    return '请选择同岗位的接收人，或选择由岗位人员处理。转交只调整任务由谁处理，不会完成任务或办理对应业务。'
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
  onOpenRelatedTask,
  task,
  profile,
  actionReceipt: submittedReceipt = null,
  actionMode = '',
  startHandling = false,
  collaborationOnly = false,
  collaborationPopup = false,
  collaborationPopupOpen = true,
  onCollaborationClosed,
  actionReason = '',
  actionSaving: providedActionSaving = false,
  actionAvailabilityLoading = false,
  allowedActionModes = [],
  readonlyReason = '',
  assignmentAccess = {},
  assignmentTarget,
  canOpenEntry = false,
  canViewAttachments = false,
  canManageAttachments = false,
  sourceSummary = null,
  renderSourceAction: providedSourceAction = null,
  onTaskRead,
  onActionModeChange,
  onActionReasonChange,
  onAssignmentTargetChange,
  onClose,
  closeLabel = '返回列表',
  onReturnToTracking,
  onOpenEntry,
  onSubmit,
}) {
  const WorkflowTaskBusinessWorkspace = React.useContext(TaskBusinessWorkspaceContext)
  const [businessSaving, setBusinessSaving] = React.useState(false)
  const actionSaving = providedActionSaving || businessSaving
  const [businessReceipt, setBusinessReceipt] = React.useState(null)
  const [collaborationOpen, setCollaborationOpen] = React.useState(false)
  const collaborationTriggerRef = React.useRef(null)
  const primaryDraftRef = React.useRef(null)
  const information = useTaskBusinessInformation(`${workflowTaskAdminAccessRequestIdentity(profile)}:${Boolean(profile?.disabled)}:${task?.id}:${task?.version}:${task?.source_type}:${task?.source_id}`)
  const [reviewing, setReviewing] = React.useState(false)
  const businessLeaveGuard = React.useRef(null)
  const businessReceiptAction = React.useRef(null)
  const [businessReceiptReady, setBusinessReceiptReady] = React.useState(false)
  const registerReceiptAction = React.useCallback((action) => {
    businessReceiptAction.current = action
    setBusinessReceiptReady(Boolean(action))
  }, [])
  const receiptScope = `${profile?.id}:${task?.id}`
  const actionReceipt = submittedReceipt || (businessReceipt?.scope === receiptScope ? businessReceipt : null)
  const sourceReadback = useWorkflowTaskBusinessReadback({ task, profile, enabled: !actionReceipt })
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
      : '') || (task?.assignee_id ? '已指定处理人' : '由岗位人员处理')
  const taskDisplayName = task ? getWorkflowTaskDisplayName(task) : ''
  const exceptionContact = task
    ? getWorkflowTaskExceptionContactPresentation(task)
    : { parts: [], text: '' }
  const actionOutcomeHint = task
    ? getWorkflowTaskActionOutcomeHint({ task, actionMode })
    : ''
  const canOpenRelatedEntry = Boolean(task && canOpenEntry && onOpenEntry)
  const handlingActionModes = workflowTaskHandlingModes(allowedActionModes)
  const allowedActionModeSet = new Set(handlingActionModes)
  const canSubmitAction = Boolean(
    actionMode && allowedActionModeSet.has(actionMode) && !isTerminal
  )
  const materialTask = isEngineeringMaterialTask(task)
  const hasBusinessPage = Boolean(WorkflowTaskBusinessWorkspace && resolveMobileTaskBusinessEntry(task)) && workflowTaskBusinessContract(task).containedBusiness && (!approvalTask || materialTask) && !collaborationOnly
  const renderSourceAction = (materialTask && hasBusinessPage ? null : providedSourceAction) || (hasBusinessPage ? (render) => (
    <WorkflowTaskBusinessWorkspace controls={{
      device: 'desktop',
task,
profile,
roleKey: task.owner_role_key,
      onTaskRead,
      onBack: () => selectStep('context'),
      onOpenTask: onOpenRelatedTask,
      registerLeaveGuard: (guard) => { businessLeaveGuard.current = guard },
      registerReceiptAction,
      collaborationExternal: true,
      onBusyChange: setBusinessSaving,
      onConfirmTask: allowedActionModes.includes('complete') ? () => { setCollaborationOpen(true); onActionModeChange?.('complete') } : undefined,
      onReceipt: (result) => {
        setBusinessReceipt({ ...result, scope: receiptScope, actionTitle: result.message || '业务办理', businessResult: true })
        setActiveStepKey('confirm')
      },
      render: ({ content, footer, actionHostRef }) => render({
        content,
        footer: <><div ref={actionHostRef} className="mobile-task-business-action-host" />{footer}</>,
      }),
    }}
    />
  ) : null)
  const hasSourceAction = typeof renderSourceAction === 'function'
  const secondaryActions = !isTerminal
    ? workflowTaskCollaborationModes(allowedActionModes).map((mode) => ({
        key: mode,
        label: getWorkflowTaskActionMeta(task, mode).title,
        onClick: (trigger) => {
          collaborationTriggerRef.current = trigger
          primaryDraftRef.current = { mode: actionMode, reason: actionReason, reviewing }
          setReviewing(false)
          onActionModeChange?.(mode)
          onActionReasonChange?.(mode === 'block' ? taskReason : '')
          setCollaborationOpen(true)
        },
      }))
    : []
  const canChooseActions = hasSourceAction || allowedActionModes.length > 0
  const taskIdentity = task
    ? String(task.id || task.task_code || task.task_name || '')
    : ''
  const [activeStepKey, setActiveStepKey] = React.useState('context')
  const [businessTaskVisited, setBusinessTaskVisited] = React.useState('')
  const showTaskContext = activeStepKey === 'context'
  const [sourceFooter, setSourceFooter] = React.useState(null)
  const [reviewedInventoryID, setReviewedInventoryID] = React.useState(0)
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
  const directEntryRef = React.useRef('')
  const navigationRef = React.useRef(null)
  const contextActionRef = React.useRef(null)
  const stepButtonRefs = React.useRef(new Map())
  const actionOptionRefs = React.useRef(new Map())
  const visibleActionModes = orderWorkflowTaskActions({
    actions: workflowTaskPrimaryModes(handlingActionModes).filter((mode) => TASK_ACTION_META[mode]),
    approvalTask,
  })
  const processDecisionRequired =
    actionMode === 'complete' && isWorkflowProcessDecisionTask(task)
  const processApprovalForm = getWorkflowProcessDecisionApprovalForm(
    task,
    processContext
  )
  const processDecisionReady =
    !processDecisionRequired ||
    (processContextState === 'ready' && Boolean(processApprovalForm))
  const taskWithSource =
    task && processContext?.source
      ? {
          ...task,
          source_type: processContext.source.type,
          source_id: processContext.source.id,
          source_no: processContext.source.no,
        }
      : task
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
    (actionMode !== 'block' || isWorkflowTaskBlockReasonReady(actionReason)) &&
    (actionMode !== 'complete' || task?.source_type !== 'inventory_operation' || reviewedInventoryID === Number(task.source_id)) &&
    assignmentTargetValid &&
    processDecisionReady &&
    !approvedQuantityError &&
    isWorkflowTaskActionReady({
      actionMode,
      actionReason,
      allowedActionModes: handlingActionModes,
      requireReason: workflowTaskActionRequiresReason(task, actionMode),
    })
  const stepAvailability = React.useMemo(() => getWorkflowTaskActionStepAvailability({ hasReceipt: hasActionReceipt || businessReceiptReady, isTerminal }), [hasActionReceipt, businessReceiptReady, isTerminal])
  React.useEffect(() => {
    if (activeStepKey === 'action') setBusinessTaskVisited(taskIdentity)
  }, [activeStepKey, taskIdentity])
  React.useEffect(() => {
    if (taskIdentity === previousTaskIdentityRef.current) return
    previousTaskIdentityRef.current = taskIdentity
    setApprovedQuantity('')
    setBusinessReceipt(null)
    primaryDraftRef.current = null
    setCollaborationOpen(!collaborationPopup && workflowTaskCollaborationModes([actionMode]).includes(actionMode))
    setReviewing(false)
    setActiveStepKey(resolveWorkflowTaskActionInitialStep(actionMode))
  }, [actionMode, collaborationPopup, taskIdentity])

  React.useEffect(() => {
    if (!task) {
      previousTaskIdentityRef.current = ''
      directEntryRef.current = ''
      setApprovedQuantity('')
      setActiveStepKey('context')
    }
  }, [task])

  React.useEffect(() => {
    if (startHandling && taskIdentity && directEntryRef.current !== taskIdentity && !actionAvailabilityLoading && canChooseActions && !isTerminal && !hasActionReceipt) {
      directEntryRef.current = taskIdentity
      setActiveStepKey('action')
    }
  }, [startHandling, taskIdentity, actionAvailabilityLoading, canChooseActions, isTerminal, hasActionReceipt])

  React.useEffect(() => {
    if (hasActionReceipt) { setCollaborationOpen(false); setActiveStepKey('confirm') }
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
        if (controller.signal.aborted) return
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
    task?.id,
    task?.process_instance_id,
    task?.process_node_instance_id,
    task?.version,
    processContextReloadKey,
  ])

  React.useEffect(() => {
    if (stepAvailability[activeStepKey]) return
    setActiveStepKey(
      hasActionReceipt ? 'confirm' : resolveWorkflowTaskActionStep({
        requestedStep: activeStepKey,
        availability: stepAvailability,
      })
    )
  }, [activeStepKey, hasActionReceipt, stepAvailability])

  React.useLayoutEffect(() => {
    const scrollContainer = navigationRef.current?.parentElement
    if (scrollContainer) scrollContainer.scrollTop = 0
  }, [activeStepKey, taskIdentity])

  const selectAction = (nextMode, nextReason = '') => {
    if (actionSaving) return
    onActionModeChange?.(nextMode)
    onActionReasonChange?.(nextReason)
    setActiveStepKey('action')
  }

  const selectStep = async (stepKey) => {
    if (actionSaving || stepKey === activeStepKey || !stepAvailability[stepKey]) return
    if (stepKey === 'confirm' && businessReceiptReady && !submittedReceipt) {
      await businessReceiptAction.current?.()
      return
    }
    setReviewing(false)
    const nextStep = resolveWorkflowTaskActionStep({
      requestedStep: stepKey,
      availability: stepAvailability,
      fallbackStep: activeStepKey,
    })
    setActiveStepKey(nextStep)
    if (nextStep === 'context') requestAnimationFrame(() => contextActionRef.current?.focus({ preventScroll: true }))
  }

  const submitAction = () => {
    if (actionSaving || !canSubmitAction || !canConfirm || isTerminal) return
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
    selectStep(nextStepKey)
    requestAnimationFrame(() =>
      (nextStepKey === 'context' ? contextActionRef.current : stepButtonRefs.current.get(nextStepKey))?.focus()
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
        (showTaskContext && sourceSummary) ||
        canChooseActions)
  )
  const taskResources = task && showTaskContext && sourceSummary ? (
    <div className="erp-task-action-drawer__resources">{sourceSummary}</div>
  ) : null
  const taskAttachments = task && canViewAttachments ? (
    <BusinessAttachmentModalButton
      ownerType="workflow_task"
      ownerId={task.id}
      ownerVersion={task.version}
      buttonText="任务附件"
      countLabel="任务附件"
      emptyUploadLabel="添加任务附件"
      emptyReadLabel="查看任务附件"
      modalTitle="任务附件"
      panelTitle="任务附件"
      description={canManageAttachments ? '上传照片、异常截图或处理凭证。' : '查看照片、异常截图或处理凭证。'}
      canUpload={canManageAttachments}
      canWithdraw={canManageAttachments}
      disabled={actionSaving}
      disabledReason="任务正在提交，请稍候"
      showAttachmentCount
      buttonProps={{ 'data-testid': 'workflow-task-attachment-action', size: 'middle' }}
    />
  ) : null

  const actionWorkspace = (
    <div className="erp-task-action-drawer__action-workspace">
      {isTerminal && activeStepKey === 'action' ? <WorkflowTaskReceipt task={task} events={taskEvents} state={taskEventsState} /> : null}
      <section className="erp-task-action-drawer__action-choices" hidden={Boolean((collaborationOpen || collaborationPopup) && actionMode)}>
        <div className="erp-task-action-drawer__action-prompt">
          <strong>
            {isTerminal ? '已记录的办理资料' : visibleActionModes.length ? '选择处理方式' : secondaryActions.length ? '请在底部选择任务协作操作' : '办理资料'}
          </strong>

        </div>
        {!isTerminal && visibleActionModes.length > 0 ? (
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
                              selected
                                ? 'erp-task-action-drawer__action-option--selected'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() =>
                              selectAction(
                                mode,
                                mode === 'block' ? taskReason : ''
                              )
                            }
                            onKeyDown={(event) =>
                              handleActionKeyDown(event, mode)
                            }
                          >
                            <span className="erp-task-action-drawer__action-option-mark">
                              {selected ? <CheckCircleOutlined /> : null}
                            </span>
                            <span>
                              <strong>{meta.title}</strong>
                            </span>
                          </button>
                        )
                      })}
          </div>
                  ) : null}
      </section>
      {!isTerminal && actionMeta ? (
        <section className={actionMode === 'block' ? 'workflow-task-block-panel' : 'erp-task-action-drawer__action-panel'}>
          {actionMode !== 'block' ? (
            <div className="erp-task-action-drawer__action-head">
              <div>
                <BusinessHelpLabel label={actionMeta.title} description={`${TASK_ACTION_DESCRIPTIONS[actionMode]} ${getTaskActionDescription(actionMode)}`} />
              </div>
              <Tag color={actionMeta.requireReason ? 'orange' : 'green'}>
                {actionMeta.requireReason
                  ? approvalTask && actionMode === 'complete'
                    ? '必须填写审批意见'
                    : '必须填写原因'
                  : '确认即可'}
              </Tag>
            </div>
          ) : null}
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
                              : '选择接收人，或由岗位人员处理'
                          }
                notFoundContent={
                            assignmentAccess.stale
                              ? '任务信息已更新，请刷新任务列表'
                              : assignmentAccess.failed
                                ? '转交信息加载失败，请关闭后重试'
                                : '当前没有符合条件的接收人'
                          }
                onChange={(value) =>
                            onAssignmentTargetChange?.(value)
                          }
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
                          readonlyReason ||
                          '请确认任务状态、负责岗位和可用操作。'
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
          {actionMode === 'block' ? (
            <WorkflowTaskBlockReason
              value={actionReason}
              onChange={onActionReasonChange}
              disabled={actionSaving || !canSubmitAction}
            />
          ) : actionMeta.requireReason ? (
            <TextArea
              value={actionReason}
              autoSize={{ minRows: 4, maxRows: 6 }}
              maxLength={180}
              showCount
              disabled={actionSaving || !canSubmitAction}
              placeholder={
                          task?.task_group === 'business_followup' && actionMode === 'complete'
                            ? '填写处理结果和需要发起人了解的情况'
                            : approvalTask && actionMode === 'complete'
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
                          提交后关闭当前任务，业务结果以实际办理记录为准。
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
  )
  const reviewPanel = task && actionMeta ? (
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
                              : '由岗位人员处理')}
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
  ) : null
  const closeCollaboration = () => {
    if (actionSaving) return
    if (collaborationPopup) { onClose?.(); return }
    setCollaborationOpen(false)
    setReviewing(primaryDraftRef.current?.reviewing || false)
    onActionModeChange?.(primaryDraftRef.current?.mode || '')
    onActionReasonChange?.(primaryDraftRef.current?.reason || '')
  }

  const collaborationModal = (
    <BusinessModal
      title={actionMeta?.title || '任务协作'}
      open={Boolean(task && (collaborationOpen || (collaborationPopup && collaborationPopupOpen)))}
      className="erp-task-collaboration-modal"
      destroyOnHidden
      size="localAction"
      onCancel={closeCollaboration}
      afterClose={() => {
        if (collaborationPopup) onCollaborationClosed?.()
        else if (activeStepKey === 'action' && collaborationTriggerRef.current?.isConnected) collaborationTriggerRef.current.focus({ preventScroll: true })
      }}
      closable={!actionSaving}
      maskClosable={!actionSaving}
      keyboard={!actionSaving}
      footer={(
        <>
          <Button disabled={actionSaving} onClick={closeCollaboration}>关闭</Button>
          {!hasActionReceipt && reviewing && actionMode !== 'block' ? <Button disabled={actionSaving} onClick={() => setReviewing(false)}>返回修改</Button> : null}
          {!hasActionReceipt ? <Button type="primary" danger={actionMode === 'reject'} loading={actionSaving} disabled={actionSaving || !canSubmitAction || !canConfirm} onClick={actionMode === 'block' || reviewing ? submitAction : () => setReviewing(true)}>{actionMode === 'block' || reviewing ? actionMeta?.buttonLabel || '确认提交' : '核对并确认'}</Button> : null}
        </>
      )}
    >
      {hasActionReceipt ? (collaborationPopup ? <WorkflowTaskReceipt task={task} events={taskEvents} state={taskEventsState} receipt={actionReceipt} /> : null) : reviewing && actionMode !== 'block' ? reviewPanel : actionWorkspace}
    </BusinessModal>
  )

  if (collaborationPopup) return collaborationModal

  // 外壳预先挂载，避免入场动画尚未结束就关闭时 Portal 被移除、跳过焦点恢复。
  // 任务内容仍随 task 清空，不在关闭状态读取任务或附件。
  return (
    <TaskBusinessInformationContext.Provider value={information}>
      <Drawer
        title={
          <div className="erp-task-action-drawer__heading">
            <strong className="erp-task-action-drawer__title">
              {TASK_DRAWER_STEPS.find((step) => step.key === activeStepKey)?.title}
            </strong>
          </div>
      }
        extra={task ? <WorkflowTaskCopySummary task={taskWithSource} assigneeLabel={hasActionReceipt ? '' : currentAssigneeLabel} compact disabled={actionSaving} /> : null}
        width={hasBusinessPage ? 'calc(100vw - 24px)' : 'min(720px, calc(100vw - 24px))'}
        open={Boolean(task)}
        forceRender
        closeIcon={<LeftOutlined aria-hidden />}
        closable={actionSaving ? false : { placement: 'start', 'aria-label': onReturnToTracking ? '返回流程' : closeLabel }}
        maskClosable={!actionSaving}
        keyboard={!actionSaving}
        onClose={async () => {
        if (actionSaving || (businessLeaveGuard.current && !(await businessLeaveGuard.current()))) return
        (onReturnToTracking || onClose)?.()
      }}
        className={`erp-workflow-drawer erp-task-action-drawer${activeStepKey === 'context' ? ' erp-task-action-drawer--context' : ''}`}
        footer={
        showFooter ? (
          <div className="erp-task-action-drawer__footer">
            {taskAttachments}
            {activeStepKey === 'action' ? <WorkflowTaskSecondaryActions actions={secondaryActions} disabled={actionSaving} /> : null}
            <WorkflowTaskActionGroup label="业务办理" className="erp-task-operation-group--primary" hidden={!hasSourceAction || activeStepKey !== 'action'}>
              <div
                ref={setSourceFooter}
                className="erp-material-task-action__footer-host"
                hidden={!hasSourceAction || activeStepKey !== 'action'}
              />
            </WorkflowTaskActionGroup>
            <div
              className="erp-task-action-drawer__footer-nav"
              hidden={
                hasSourceAction &&
                activeStepKey === 'action'
              }
            >
              {taskResources}
              {hasActionReceipt ? <Button onClick={() => selectStep(showTaskContext ? 'confirm' : 'context')}>{showTaskContext ? '查看结果回执' : '回看任务'}</Button> : null}
              {!hasActionReceipt && activeStepKey !== 'context' ? (
                <Button
                  disabled={actionSaving}
                  onClick={() =>
                    selectStep(
                      activeStepKey === 'confirm' || reviewing ? 'action' : 'context'
                    )
                  }
                >
                  上一步
                </Button>
              ) : null}
              {showTaskContext && canOpenRelatedEntry && !hasBusinessPage ? (
                <Button
                  icon={<ExportOutlined aria-hidden="true" />}
                  disabled={actionSaving}
                  onClick={() => onOpenEntry(task)}
                >
                  {isTerminalWorkflowTask(task) ? '查看单据' : '进入单据办理'}
                </Button>
              ) : null}

            </div>
            <WorkflowTaskActionGroup label={activeStepKey === 'action' && !isTerminal ? approvalTask ? '审批办理' : task?.task_group === 'order_review' ? '评审办理' : '任务办理' : null} className="erp-task-action-drawer__footer-primary">
              {activeStepKey === 'action' && isTerminal ? <Button type="primary" onClick={() => selectStep('confirm')}>结果回执</Button> : null}
              {activeStepKey === 'confirm' ? (
                <Button type="primary" onClick={() => onClose?.()}>
                  返回列表
                </Button>
              ) : activeStepKey === 'context' && canChooseActions ? (
                <Button
                  ref={contextActionRef}
                  type="primary"
                  disabled={actionSaving}
                  onClick={() => selectStep('action')}
                >
                  {isTerminal ? '查看办理资料' : '任务办理'}
                </Button>
              ) : null}
              {!isTerminal && !hasSourceAction && !reviewing && !collaborationOpen &&
              activeStepKey === 'action' && visibleActionModes.length > 0 ? (
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
                  onClick={() => setReviewing(true)}
                >
                  核对并确认
                </Button>
              ) : null}
              {!isTerminal && reviewing && !collaborationOpen && activeStepKey === 'action' ? (
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
            </WorkflowTaskActionGroup>
          </div>
        ) : null
      }
      >
        {task ? (
          <div
            ref={navigationRef}
            className="erp-task-action-drawer__navigation"
          >
            <section
              className="erp-task-action-drawer__guide"
              aria-label="任务处理导引"
            >
              <SlidingTabList
                className="erp-task-action-drawer__guide-steps"
                role="tablist"
                aria-label="任务处理步骤"
              >
                {TASK_DRAWER_STEPS.map((baseStep, index) => {
                const step = baseStep
                const active = step.key === activeStepKey
                const available = stepAvailability[step.key]
                const interactive =
                  available && !actionSaving
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
                            ? '办理后开放'
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
              </SlidingTabList>
            </section>
          </div>
      ) : null}
        {task ? (
          <div className="erp-task-action-drawer__body" aria-busy={actionSaving}>
            {task?.source_type === 'inventory_operation' ? <div hidden={!showTaskContext}><InventoryOperationTaskReview task={task} onReady={setReviewedInventoryID} /></div> : null}
            <div hidden={!showTaskContext}>
              <WorkflowTaskInfoCard
                task={taskWithSource}
                title={taskDisplayName}
                titleClassName="erp-task-action-drawer__task-title"
                status={<Tag color={statusMeta?.color}>{actionReceipt?.statusLabel || statusMeta?.label}</Tag>}
                source={<div className="erp-task-action-drawer__source"><WorkflowTaskSource task={taskWithSource} onOpen={!hasBusinessPage && canOpenRelatedEntry && !actionSaving ? () => onOpenEntry(task) : undefined} /></div>}
                assigneeLabel={currentAssigneeLabel}
                events={taskEventsState === 'ready' ? taskEvents : []}
                businessInfo={hasWorkflowFollowupDetails(task) ? <WorkflowFollowupDetails task={task} /> : null}
                summary={<WorkflowTaskCurrentSummary appearance="facts" task={task} roleLabel={ownerRoleLabel} assigneeLabel={currentAssigneeLabel} events={taskEventsState === 'ready' ? taskEvents : []} processContext={processContextState === 'ready' ? processContext : null} reason={taskReason} contact={exceptionContact} guidance={actionAvailabilityLoading ? '正在确认可用的处理方式' : !canChooseActions ? readonlyReason || '当前账号不能直接处理该任务。' : ''} />}
              />
            </div>
            {activeStepKey === 'action' && !hasBusinessPage ? (
              <section className="erp-task-action-drawer__summary erp-task-action-drawer__summary--task">
                <div className="erp-task-copy-heading"><Title level={2} className="erp-task-action-drawer__task-title">{taskDisplayName}</Title><Tag color={statusMeta?.color}>{actionReceipt?.statusLabel || statusMeta?.label}</Tag></div>
                {!hasActionReceipt ? <div className="erp-task-action-drawer__source"><WorkflowTaskSource task={taskWithSource} copyable={false} onOpen={!hasBusinessPage && canOpenRelatedEntry && !actionSaving ? () => onOpenEntry(task) : undefined} /></div> : null}
                {hasActionReceipt ? <div className="erp-task-action-drawer__receipt-context"><WorkflowTaskSource task={taskWithSource} copyable={false} /><span>本次责任岗位：{ownerRoleLabel || '待确认'}</span><WorkflowTaskTiming task={task} detail compact events={taskEventsState === 'ready' ? taskEvents : []} /></div> : null}
              </section>
          ) : null}

            <div hidden={!showTaskContext}><div ref={information.setHost} data-testid="workflow-task-business-information">{information.retained}</div></div>

            <section className="workflow-task-info-card" hidden={!showTaskContext}>
              <WorkflowTaskHandlingChain
                onOpenTracking={onReturnToTracking}
                onOpenTask={onOpenRelatedTask}
                task={task}
                profile={profile}
                focused
                processContext={processContext}
                processContextState={processContextState}
                onRetryProcess={() => setProcessContextReloadKey((current) => current + 1)}
              />
            </section>

            <section
              id="erp-task-action-step-context"
              role="tabpanel"
              aria-labelledby="erp-task-action-step-context-tab"
              hidden={activeStepKey !== 'context'}
              className="erp-task-action-drawer__step-panel"
            >
              <WorkflowTaskEventTrail
                className="workflow-task-info-card workflow-task-info-card--records"
                approvalTask={approvalTask}
                errorMessage={taskEventsError}
                events={taskEvents}
                state={taskEventsState}
                task={task}
                truncated={taskEventsTruncated}
                showResponsibility={false}
                compact
              />
            </section>

            <section
              id="erp-task-action-step-action"
              role="tabpanel"
              aria-labelledby="erp-task-action-step-action-tab"
              hidden={activeStepKey !== 'action' || (reviewing && !collaborationOpen)}
              className="erp-task-action-drawer__step-panel"
            >
              {hasSourceAction ? (
                (hasBusinessPage && !materialTask) || activeStepKey === 'action' || businessTaskVisited === taskIdentity ? (
                renderSourceAction(({ content, footer }) => (
                  <div className="erp-material-task-action workflow-task-business-workspace">
                    {content}
                    {sourceFooter ? createPortal(footer, sourceFooter) : null}
                  </div>
                ))
              ) : null
            ) : (
              collaborationOpen ? null : actionWorkspace
            )}
            </section>

            <section
              id="erp-task-action-step-confirm"
              role="tabpanel"
              aria-labelledby="erp-task-action-step-confirm-tab"
              hidden={activeStepKey !== 'confirm' && !(activeStepKey === 'action' && reviewing && !collaborationOpen)}
              className="erp-task-action-drawer__step-panel"
            >
              {activeStepKey === 'confirm' ? (
                <>
                  <WorkflowTaskReceipt task={task} events={taskEvents} state={taskEventsState} receipt={actionReceipt} sourceReadback={sourceReadback} />
                  {task.process_instance_id ? <WorkflowTaskHandlingChain task={task} profile={profile} focused processContext={processContext} processContextState={processContextState} onOpenTask={onOpenRelatedTask} onRetryProcess={() => setProcessContextReloadKey((current) => current + 1)} /> : null}
                  <WorkflowTaskEventTrail className="workflow-task-info-card" task={task} events={taskEvents} state={taskEventsState} errorMessage={taskEventsError} truncated={taskEventsTruncated} approvalTask={approvalTask} showResponsibility={false} compact />
                </>
            ) : actionMeta ? (
              reviewPanel
            ) : null}
            </section>
          </div>
      ) : null}
      </Drawer>
      {collaborationModal}
    </TaskBusinessInformationContext.Provider>
  )
}
