import { useEffect, useId, useRef, useState } from 'react'
import {
  ExclamationCircleFilled,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { BusinessHelpLabel } from '../../components/help/BusinessContextHelp.jsx'
import {
  MOBILE_TASK_ACTION_ACCESS_STATES,
  resolveMobileActionLabel,
  resolveMobileTaskStatusLabel,
} from '../utils/mobileRoleTaskModel.mjs'
import {
  getWorkflowProcessDecisionApprovalProfile,
  isWorkflowApprovalTask,
  isWorkflowProcessDecisionTask,
} from '../../utils/workflowTaskActionContract.mjs'
import { getWorkflowTaskProcessContext } from '../../api/workflowApi.mjs'
import {
  isPositiveNumeric20Scale6Units,
  numeric20Scale6Units,
} from '../../utils/numeric20Scale6.mjs'
import { getWorkflowTaskActionOutcomeHint } from '../../utils/workflowTaskProcessingHint.mjs'
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'
import MobileTaskContextCard, { mobileTaskAssigneeLabel } from './MobileTaskContextCard.jsx'
import MobileTaskAttachments from './MobileTaskAttachments.jsx'
import { WorkflowTaskCopySummary } from '../../components/workflow/WorkflowTaskCopy.jsx'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import { orderWorkflowTaskActions } from '../../utils/workflowTaskActionFlow.mjs'

const ACTION_OPTIONS = Object.freeze([
  {
    key: 'done',
    description: '完成当前岗位的协同任务。',
  },
  {
    key: 'blocked',
    description: '记录卡点并等待相关岗位处理。',
  },
  {
    key: 'resume',
    description: '确认卡点已解除，恢复后续处理。',
  },
  {
    key: 'rejected',
    description: '资料不足或结果不符合要求时退回。',
  },
  {
    key: 'urge',
    description: '记录催办原因，任务状态保持不变。',
  },
])

const REASON_REQUIRED_ACTIONS = new Set([
  'done',
  'blocked',
  'rejected',
  'resume',
  'urge',
])

function hasOpenTaskOverlay() {
  return [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="tooltip"]')].some(
    (node) => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'
  )
}

function resolveAccessCopy(accessState, accessMessage) {
  if (accessMessage) return accessMessage
  if (accessState === MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING) {
    return '正在确认您可以执行的操作，请稍候。'
  }
  if (accessState === MOBILE_TASK_ACTION_ACCESS_STATES.FAILED) {
    return '暂时无法确认您是否可以处理此任务，请重新确认。'
  }
  if (accessState === MOBILE_TASK_ACTION_ACCESS_STATES.URGE_ONLY) {
    return '您可以查看并催办这条任务，任务状态仍由责任岗位处理。'
  }
  if (accessState === MOBILE_TASK_ACTION_ACCESS_STATES.READONLY) {
    return '当前任务仅供查看，您不能提交处理或催办。'
  }
  return ''
}

function resolveReasonLabel(action, approvalTask = false) {
  if (action === 'done') return approvalTask ? '审批意见' : '完成反馈'
  if (action === 'blocked') return '阻塞原因'
  if (action === 'rejected') return '退回原因'
  if (action === 'resume') return '阻塞解除说明'
  if (action === 'urge') return '催办原因'
  return '处理原因'
}

function resolveReasonPlaceholder(action, approvalTask = false) {
  if (action === 'done') {
    return approvalTask
      ? '说明通过依据、核对结果和需要交接的信息'
      : '说明已完成什么、核对结果和需要交接的信息'
  }
  if (action === 'blocked') return '说明当前卡点、影响和需要的支持'
  if (action === 'rejected') return '说明退回依据和需要补充的内容'
  if (action === 'resume') return '说明阻塞已如何解除，以及下一步安排'
  if (action === 'urge') return '说明催办原因和期望完成时间'
  return '请填写处理原因'
}

function validationErrorsFor({
  action,
  approvalTask = false,
  approvedQuantity = '',
  approvedQuantityAllowed = false,
  processDecisionRequired = false,
  reason,
}) {
  const normalizedReason = String(reason || '').trim()
  return {
    action: action ? '' : '请选择本次处理方式',
    reason:
      REASON_REQUIRED_ACTIONS.has(action) && !normalizedReason
        ? `${resolveReasonLabel(action, approvalTask)}为必填项`
        : processDecisionRequired && [...normalizedReason].length > 255
          ? '审批意见不能超过 255 个字符'
          : '',
    approvedQuantity:
      approvedQuantityAllowed &&
      String(approvedQuantity || '').trim() &&
      !isPositiveNumeric20Scale6Units(numeric20Scale6Units(approvedQuantity))
        ? '批准数量必须大于 0，且最多保留 6 位小数'
        : '',
  }
}

function MobileWorkflowTaskActionScreen({
  accessMessage = '',
  accessState = MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING,
  approvedQuantity = '',
  availableActions = [],
  busy = false,
  canViewReceipt = false,
  canManageAttachments = false,
  hasActionCapability = false,
  onActionChange = () => {},
  onApprovedQuantityChange = () => {},
  onBack = () => {},
  onOpenTaskForm = null,
  onReasonChange = () => {},
  onRetryAccess = null,
  onSubmit = () => {},
  onViewReceipt = null,
  reason = '',
  selectedAction = '',
  task = null,
}) {
  const fieldID = useId()
  const screenRef = useRef(null)
  const actionChoiceRef = useRef(null)
  const reasonRef = useRef(null)
  const quantityRef = useRef(null)
  const [validationErrors, setValidationErrors] = useState({
    action: '',
    approvedQuantity: '',
    reason: '',
  })
  const [processContextState, setProcessContextState] = useState('idle')
  const [processApprovalForm, setProcessApprovalForm] = useState(null)
  const [processContextRetry, setProcessContextRetry] = useState(0)

  const normalizedActions = ACTION_OPTIONS.filter((option) =>
    availableActions.includes(option.key)
  )
  const visibleActions =
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.URGE_ONLY
      ? normalizedActions.filter((option) => option.key === 'urge')
      : normalizedActions
  const singleVisibleAction =
    visibleActions.length === 1 ? visibleActions[0] : null
  const singleVisibleActionKey = singleVisibleAction?.key || ''
  const effectiveAction = singleVisibleAction
    ? singleVisibleAction.key
    : visibleActions.some((option) => option.key === selectedAction)
      ? selectedAction
      : ''
  const accessAllowsSubmit =
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.ACTIONABLE ||
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.URGE_ONLY
  const processDecisionRequired =
    effectiveAction === 'done' && isWorkflowProcessDecisionTask(task)
  const expectedApprovalProfile =
    getWorkflowProcessDecisionApprovalProfile(task)
  const processDecisionReady =
    !processDecisionRequired ||
    (processContextState === 'ready' &&
      processApprovalForm?.profile_key === expectedApprovalProfile &&
      processApprovalForm?.reason_required === true)
  const canSubmit = accessAllowsSubmit && processDecisionReady
  const showFooterRetry =
    !canSubmit &&
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.FAILED &&
    Boolean(onRetryAccess)
  const showDisabledSubmit =
    !canSubmit && !showFooterRetry && hasActionCapability === true
  const accessCopy = resolveAccessCopy(accessState, accessMessage)
  const taskStatus = task
    ? resolveMobileTaskStatusLabel(task)
    : '任务状态暂不可用'
  const approvalTask = isWorkflowApprovalTask(task)
  const visibleActionKeys = orderWorkflowTaskActions({
    actions: visibleActions.map((option) => option.key),
    approvalTask,
  })
  const approvedQuantityAllowed =
    processDecisionReady &&
    processApprovalForm?.profile_key === 'production_exception_approval' &&
    processApprovalForm?.approved_quantity?.precision === 20 &&
    processApprovalForm?.approved_quantity?.scale === 6
  const reasonRequired = REASON_REQUIRED_ACTIONS.has(effectiveAction)
  const showReasonHelp = Boolean(
    validationErrors.reason ||
    String(reason || '').length >= (processDecisionRequired ? 205 : 450)
  )
  const effectiveActionLabel = effectiveAction
    ? approvalTask && effectiveAction === 'done'
      ? '审批通过'
      : resolveMobileActionLabel(effectiveAction)
    : ''
  const submitLabel = effectiveActionLabel
    ? `确认${effectiveActionLabel}`
    : '确认提交'
  const busySubmitLabel = effectiveActionLabel
    ? `正在${effectiveActionLabel}`
    : '正在提交'
  const actionOutcomeHint = getWorkflowTaskActionOutcomeHint({
    task,
    actionMode: effectiveAction,
  })

  useEffect(() => {
    if (!processDecisionRequired) {
      setProcessContextState('idle')
      setProcessApprovalForm(null)
      return undefined
    }
    if (!task?.id || !task?.process_instance_id || !expectedApprovalProfile) {
      setProcessContextState('error')
      setProcessApprovalForm(null)
      return undefined
    }
    const controller = new AbortController()
    setProcessContextState('loading')
    setProcessApprovalForm(null)
    getWorkflowTaskProcessContext(task.id, { signal: controller.signal })
      .then((context) => {
        const approvalForm = context?.approval_form
        if (
          approvalForm?.profile_key !== expectedApprovalProfile ||
          approvalForm?.reason_required !== true
        ) {
          throw new Error('审批表单与流程节点不一致')
        }
        setProcessApprovalForm(approvalForm)
        setProcessContextState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setProcessApprovalForm(null)
        setProcessContextState('error')
      })
    return () => controller.abort()
  }, [
    expectedApprovalProfile,
    processContextRetry,
    processDecisionRequired,
    task?.id,
    task?.process_instance_id,
  ])

  useEffect(() => {
    if (
      !accessAllowsSubmit ||
      !singleVisibleActionKey ||
      selectedAction === singleVisibleActionKey
    ) {
      return
    }
    setValidationErrors((current) =>
      current.action || current.approvedQuantity || current.reason
        ? { action: '', approvedQuantity: '', reason: '' }
        : current
    )
    onActionChange(singleVisibleActionKey)
  }, [
    accessAllowsSubmit,
    onActionChange,
    selectedAction,
    singleVisibleActionKey,
  ])

  useEffect(() => {
    const { visualViewport } = window
    const screen = screenRef.current
    const mobileViewport = window.matchMedia('(max-width: 767px)')
    if (!visualViewport || !screen || !mobileViewport.matches) return undefined
    const syncViewportHeight = () => {
      screen.style.height = `${Math.round(visualViewport.height)}px`
    }
    syncViewportHeight()
    visualViewport.addEventListener('resize', syncViewportHeight)
    visualViewport.addEventListener('scroll', syncViewportHeight)
    return () => {
      visualViewport.removeEventListener('resize', syncViewportHeight)
      visualViewport.removeEventListener('scroll', syncViewportHeight)
      screen.style.removeProperty('height')
    }
  }, [])

  const clearValidationError = (field) => {
    setValidationErrors((current) => {
      if (!current[field]) return current
      return { ...current, [field]: '' }
    })
  }

  const handleActionChange = (action) => {
    clearValidationError('action')
    setValidationErrors((current) => ({
      ...current,
      reason: '',
      approvedQuantity: '',
    }))
    onActionChange(action)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!canSubmit || busy) return
    const errors = validationErrorsFor({
      action: effectiveAction,
      approvalTask,
      approvedQuantity,
      approvedQuantityAllowed,
      processDecisionRequired,
      reason,
    })
    setValidationErrors(errors)
    if (errors.action) {
      actionChoiceRef.current?.focus()
      return
    }
    if (errors.reason) {
      reasonRef.current?.focus()
      return
    }
    if (errors.approvedQuantity) {
      quantityRef.current?.focus()
      return
    }
    onSubmit({
      action: effectiveAction,
      approvedQuantity: String(approvedQuantity || '').trim(),
      reason: String(reason || '').trim(),
    })
  }

  useEffect(() => {
    const screen = screenRef.current
    if (!screen) return undefined
    const handleKeyboardShortcut = (event) => {
      if (busy || event.defaultPrevented || hasOpenTaskOverlay()) return
      if (event.key === 'Escape') {
        event.preventDefault()
        onBack()
        return
      }
      if (
        canSubmit &&
        event.key === 'Enter' &&
        (event.ctrlKey || event.metaKey)
      ) {
        event.preventDefault()
        screen.requestSubmit()
      }
    }
    screen.addEventListener('keydown', handleKeyboardShortcut)
    return () => screen.removeEventListener('keydown', handleKeyboardShortcut)
  }, [busy, canSubmit, onBack])

  const renderActionOption = (key) => {
    const option = visibleActions.find((item) => item.key === key)
    const selected = effectiveAction === option.key
    const label =
      approvalTask && option.key === 'done'
        ? '审批通过'
        : resolveMobileActionLabel(option.key)
    return (
      <label
        key={option.key}
        className="mobile-task-action-choice"
        data-action-key={option.key}
        data-selected={selected ? 'true' : 'false'}
      >
        <input
          ref={option.key === visibleActionKeys[0] ? actionChoiceRef : null}
          type="radio"
          className="mobile-task-action-choice__radio"
          aria-label={label}
          checked={selected}
          disabled={busy}
          name={`${fieldID}-action`}
          value={option.key}
          onChange={() => handleActionChange(option.key)}
        />
        <span className="mobile-task-action-choice__copy">
          <strong>{label}</strong>
        </span>
      </label>
    )
  }

  return (
    <form
      ref={screenRef}
      className="mobile-role-tasks-page mobile-role-tasks-page--detail mobile-role-tasks-page--task-info mobile-task-screen md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      aria-busy={busy}
      data-testid="mobile-task-action-screen"
      noValidate
      onSubmit={handleSubmit}
    >
      <MobileTaskFlowHeader
        backLabel="返回任务详情"
        busy={busy}
        canOpenReceipt={canViewReceipt}
        currentStep="process"
        onBack={onBack}
        onOpenDetail={onBack}
        onOpenReceipt={onViewReceipt}
        receiptUnavailableLabel="提交后开放"
        title="任务办理"
        trailing={<WorkflowTaskCopySummary task={task} assigneeLabel={mobileTaskAssigneeLabel(task)} compact />}
      />

      <main className="mobile-role-tasks-page__detail-main mobile-detail-content">
        <div data-testid="mobile-task-action-context"><MobileTaskContextCard task={task} status={taskStatus} /></div>

        {accessCopy ? (
          <section
            className={`rounded-2xl border px-4 py-4 text-sm leading-6 [overflow-wrap:anywhere] ${
              accessState === MOBILE_TASK_ACTION_ACCESS_STATES.FAILED
                ? 'border-red-200 bg-red-50 text-red-700'
                : accessState === MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING
                  ? 'border-blue-200 bg-blue-50 text-blue-700'
                  : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
            role={
              accessState === MOBILE_TASK_ACTION_ACCESS_STATES.FAILED
                ? 'alert'
                : 'status'
            }
          >
            <div className="flex items-start gap-3">
              {accessState === MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING ? (
                <LoadingOutlined className="mt-1 shrink-0" spin />
              ) : (
                <ExclamationCircleFilled className="mt-1 shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{accessCopy}</div>
              </div>
            </div>
          </section>
        ) : null}

        {accessAllowsSubmit ? (
          <>
            {processDecisionRequired && processContextState !== 'ready' ? (
              <section
                className={`rounded-2xl border px-4 py-4 text-sm leading-6 ${
                  processContextState === 'error'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-blue-200 bg-blue-50 text-blue-700'
                }`}
                role={processContextState === 'error' ? 'alert' : 'status'}
              >
                <div className="font-semibold">
                  {processContextState === 'error'
                    ? '审批表单暂时无法从流程真源确认'
                    : '正在读取审批表单'}
                </div>
                <div className="mt-1">
                  请重新读取后再办理，未确认前不能提交。
                </div>
                {processContextState === 'error' ? (
                  <button
                    type="button"
                    className="mt-3 min-h-[44px] rounded-xl border border-red-300 bg-white px-4 py-2 font-semibold text-red-700"
                    disabled={busy}
                    onClick={() => setProcessContextRetry((value) => value + 1)}
                  >
                    重新读取流程表单
                  </button>
                ) : null}
              </section>
            ) : null}
            {onOpenTaskForm ? (
              <section className="erp-mobile-card mobile-detail-section">
                <button type="button" className="mobile-detail-secondary min-h-11 w-full rounded-xl px-4 py-3 text-base font-semibold" disabled={busy} onClick={onOpenTaskForm}>
                  填写办理表单
                </button>
              </section>
            ) : null}
            <section className="erp-mobile-card mobile-detail-section mobile-task-action-form">
              {visibleActions.length > 1 ? (
                <div data-testid="mobile-task-action-options">
                  <h3 id={`${fieldID}-action-heading`}>选择处理方式</h3>
                  <div
                    role="radiogroup"
                    aria-describedby={
                      validationErrors.action
                        ? `${fieldID}-action-error`
                        : undefined
                    }
                    aria-invalid={Boolean(validationErrors.action)}
                    aria-labelledby={`${fieldID}-action-heading`}
                    aria-required="true"
                  >
                    <div className="mobile-task-action-choice-list">
                      {visibleActionKeys.map(renderActionOption)}
                    </div>
                  </div>
                  {validationErrors.action ? (
                    <p
                      id={`${fieldID}-action-error`}
                      className="mt-3 text-sm font-medium text-red-600"
                      role="alert"
                    >
                      {validationErrors.action}
                    </p>
                  ) : null}
                </div>
              ) : singleVisibleAction ? (
                <div data-testid="mobile-task-single-action">
                  <h3>本次可执行操作</h3>
                  <div
                    className="mobile-task-single-action__value"
                    data-testid="mobile-task-single-action-summary"
                  >
                    <strong>{effectiveActionLabel}</strong>
                  </div>
                </div>
              ) : (
                <div data-testid="mobile-task-action-unavailable" role="status">
                  <h3>暂不能提交</h3>
                  <p className="mt-2 text-sm font-medium leading-6 text-amber-800">
                    当前没有可提交的处理方式，请返回任务详情重新确认。
                  </p>
                </div>
              )}

              {effectiveAction ? (
                <div className="mobile-task-action-field">
                  <label htmlFor={`${fieldID}-reason`}>
                    <BusinessHelpLabel label={resolveReasonLabel(effectiveAction, approvalTask)} description={approvalTask && effectiveAction === 'done' ? '核对后确认通过，记录审批意见。' : visibleActions.find((option) => option.key === effectiveAction)?.description} />
                    {reasonRequired ? (
                      <span
                        className="mobile-task-action-required"
                        aria-hidden="true"
                      >
                        {' '}
                        *
                      </span>
                    ) : null}
                  </label>
                  <textarea
                    ref={reasonRef}
                    id={`${fieldID}-reason`}
                    aria-label={resolveReasonLabel(effectiveAction, approvalTask)}
                    className="mobile-task-action-input"
                    aria-describedby={
                      validationErrors.reason
                        ? `${fieldID}-reason-error`
                        : undefined
                    }
                    aria-invalid={Boolean(validationErrors.reason)}
                    disabled={busy}
                    maxLength={processDecisionRequired ? 255 : 500}
                    placeholder={resolveReasonPlaceholder(
                      effectiveAction,
                      approvalTask
                    )}
                    required={reasonRequired}
                    value={reason}
                    onChange={(event) => {
                      clearValidationError('reason')
                      onReasonChange(event.target.value)
                    }}
                  />
                  {showReasonHelp ? (
                    <div className="mobile-task-action-field-help">
                      <span
                        id={`${fieldID}-reason-error`}
                        className="min-w-0 break-words font-medium text-red-600"
                        role={validationErrors.reason ? 'alert' : undefined}
                      >
                        {validationErrors.reason}
                      </span>
                      <span className="shrink-0 text-slate-400">
                        {String(reason || '').length}/
                        {processDecisionRequired ? 255 : 500}
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {approvedQuantityAllowed ? (
                <div className="mobile-task-action-field">
                  <div className="flex items-center justify-between gap-3">
                    <label
                      className="text-sm font-semibold text-slate-950"
                      htmlFor={`${fieldID}-approved-quantity`}
                    >
                      批准数量
                    </label>
                    <span className="text-sm font-semibold text-slate-400">
                      可选
                    </span>
                  </div>
                  <input
                    ref={quantityRef}
                    id={`${fieldID}-approved-quantity`}
                    className="mobile-task-action-input min-h-[48px]"
                    inputMode="decimal"
                    disabled={busy}
                    aria-invalid={Boolean(validationErrors.approvedQuantity)}
                    aria-describedby={
                      validationErrors.approvedQuantity
                        ? `${fieldID}-approved-quantity-error`
                        : undefined
                    }
                    placeholder="留空表示按申请数量批准"
                    value={approvedQuantity}
                    onChange={(event) => {
                      clearValidationError('approvedQuantity')
                      onApprovedQuantityChange(event.target.value)
                    }}
                  />
                  {validationErrors.approvedQuantity ? (
                    <p
                      id={`${fieldID}-approved-quantity-error`}
                      className="mt-2 text-sm font-medium text-red-600"
                      role="alert"
                    >
                      {validationErrors.approvedQuantity}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <p className="mobile-task-action-hint">{actionOutcomeHint}</p>
            </section>
          </>
        ) : null}
        <MobileBackToTop />
      </main>

      {task?.id || accessAllowsSubmit || showFooterRetry || showDisabledSubmit ? (
        <div className="mobile-role-action-bar mobile-task-action-footer">
          <MobileTaskAttachments task={task} canManage={canManageAttachments} busy={busy} />
          {accessAllowsSubmit ? (
            <button
              type="submit"
              className="mobile-detail-primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={busy || !canSubmit || visibleActions.length === 0}
            >
              {busy ? <LoadingOutlined spin /> : null}
              <span>{busy ? busySubmitLabel : submitLabel}</span>
            </button>
          ) : null}
          {showFooterRetry ? (
            <button
              type="button"
              className="mobile-detail-primary inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={busy}
              onClick={onRetryAccess}
            >
              <ReloadOutlined />
              重新确认
            </button>
          ) : showDisabledSubmit ? (
            <button
              type="button"
              className="inline-flex min-h-[48px] w-full items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-base font-semibold text-slate-500"
              disabled
            >
              暂不能提交
            </button>
          ) : null}
        </div>
      ) : null}
    </form>
  )
}

export default function MobileTaskActionScreen(props) {
  const { renderSourceAction, onBack, task, canManageAttachments } = props
  if (!renderSourceAction) {
    return <MobileWorkflowTaskActionScreen {...props} />
  }
  return renderSourceAction(({ content, footer, saving, canViewReceipt, onViewReceipt, taskForm, actionHostRef }) => (
    <div
      className={`mobile-role-tasks-page mobile-role-tasks-page--detail mobile-role-tasks-page--task-info mobile-task-screen md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl${taskForm ? ' mobile-task-business' : ''}`}
      aria-busy={saving}
      data-testid="mobile-task-action-screen"
      onKeyDown={(event) => {
        if (saving || event.defaultPrevented || !event.currentTarget.contains(event.target) || hasOpenTaskOverlay()) return
        if (event.key === 'Escape') onBack?.()
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.querySelector('form')?.requestSubmit()
        }
      }}
    >
      <MobileTaskFlowHeader
        backLabel="返回任务详情"
        busy={saving}
        currentStep="process"
        canOpenReceipt={canViewReceipt}
        onOpenReceipt={onViewReceipt}
        onBack={onBack}
        onOpenDetail={onBack}
        receiptUnavailableLabel="提交后开放"
        title="任务办理"
        trailing={<WorkflowTaskCopySummary task={task} assigneeLabel={mobileTaskAssigneeLabel(task)} compact />}
      />
      <main className="mobile-role-tasks-page__detail-main mobile-detail-content">
        <MobileTaskContextCard task={task} />
        <div className="erp-material-task-action erp-material-task-action--mobile">
          {content}
        </div>
        <MobileBackToTop />
      </main>
      <div className="mobile-role-action-bar mobile-task-action-footer">
        <MobileTaskAttachments task={task} canManage={canManageAttachments} busy={saving} />
        <div className="mobile-task-business-action-host" ref={actionHostRef} />
        {footer}
      </div>
    </div>
  ))
}
