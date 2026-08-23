import { useEffect, useId, useRef, useState } from 'react'
import {
  BellOutlined,
  CheckOutlined,
  ExclamationCircleFilled,
  LoadingOutlined,
  PauseOutlined,
  RedoOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  MOBILE_TASK_ACTION_ACCESS_STATES,
  resolveMobileActionLabel,
  resolveMobileTaskStatusLabel,
  resolveTaskSourceLabel,
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

const ACTION_OPTIONS = Object.freeze([
  {
    key: 'done',
    icon: CheckOutlined,
    toneClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    selectedToneClass: 'border-emerald-500 ring-2 ring-emerald-500/20',
  },
  {
    key: 'blocked',
    icon: PauseOutlined,
    toneClass: 'border-orange-200 bg-orange-50 text-orange-700',
    selectedToneClass: 'border-orange-500 ring-2 ring-orange-500/20',
  },
  {
    key: 'resume',
    icon: RedoOutlined,
    toneClass: 'border-blue-200 bg-blue-50 text-blue-700',
    selectedToneClass: 'border-blue-500 ring-2 ring-blue-500/20',
  },
  {
    key: 'rejected',
    icon: StopOutlined,
    toneClass: 'border-red-200 bg-red-50 text-red-700',
    selectedToneClass: 'border-red-500 ring-2 ring-red-500/20',
  },
  {
    key: 'urge',
    icon: BellOutlined,
    toneClass: 'border-slate-200 bg-white text-slate-700',
    selectedToneClass: 'border-blue-500 ring-2 ring-blue-500/20',
  },
])

const REASON_REQUIRED_ACTIONS = new Set([
  'done',
  'blocked',
  'rejected',
  'resume',
  'urge',
])

function readableText(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
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

export default function MobileTaskActionScreen({
  accessMessage = '',
  accessState = MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING,
  approvedQuantity = '',
  availableActions = [],
  busy = false,
  canViewReceipt = false,
  hasActionCapability = false,
  onActionChange = () => {},
  onApprovedQuantityChange = () => {},
  onBack = () => {},
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
  const SingleActionIcon = singleVisibleAction?.icon || BellOutlined
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
  const taskName = readableText(task?.task_name, '任务处理')
  const taskStatus = task
    ? resolveMobileTaskStatusLabel(task)
    : '任务状态暂不可用'
  const taskSource = task ? resolveTaskSourceLabel(task) : '来源信息暂不可用'
  const approvalTask = isWorkflowApprovalTask(task)
  const approvedQuantityAllowed =
    processDecisionReady &&
    processApprovalForm?.profile_key === 'production_exception_approval' &&
    processApprovalForm?.approved_quantity?.precision === 20 &&
    processApprovalForm?.approved_quantity?.scale === 6
  const reasonRequired = REASON_REQUIRED_ACTIONS.has(effectiveAction)
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
    if (errors.approvedQuantity) return
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
      if (busy) return
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

  return (
    <form
      ref={screenRef}
      className="mobile-role-tasks-page mobile-role-tasks-page--detail surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
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
        title="处理任务"
        trailing={
          <span className="mobile-task-flow-status max-w-[112px] break-words rounded-full bg-slate-100 px-3 py-2 text-center text-sm font-semibold text-slate-600">
            {taskStatus}
          </span>
        }
      />

      <main className="mobile-role-tasks-page__detail-main space-y-4 bg-slate-50 px-4 py-4">
        <section
          className="erp-mobile-card rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          data-testid="mobile-task-action-context"
        >
          <h2 className="break-words text-base font-semibold leading-6 text-slate-950 [overflow-wrap:anywhere]">
            {taskName}
          </h2>
          <p className="mt-1 break-words text-sm leading-5 text-slate-500 [overflow-wrap:anywhere]">
            {taskSource}
          </p>
        </section>

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
            {visibleActions.length > 1 ? (
              <section
                className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                data-testid="mobile-task-action-options"
              >
                <h2
                  id={`${fieldID}-action-heading`}
                  className="text-lg font-semibold text-slate-950"
                >
                  选择处理方式
                </h2>
                <div
                  className="mt-4 grid grid-cols-2 gap-3"
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
                  {visibleActions.map((option, index) => {
                    const ActionIcon = option.icon
                    const selected = effectiveAction === option.key
                    return (
                      <label
                        key={option.key}
                        className={`mobile-task-action-choice mobile-task-action-choice--${option.key} flex min-h-[52px] min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-base font-semibold transition has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 ${option.toneClass} ${
                          selected ? option.selectedToneClass : ''
                        }`}
                        data-action-key={option.key}
                        data-selected={selected ? 'true' : 'false'}
                      >
                        <input
                          ref={index === 0 ? actionChoiceRef : null}
                          type="radio"
                          className="mobile-task-action-choice__radio"
                          checked={selected}
                          disabled={busy}
                          name={`${fieldID}-action`}
                          value={option.key}
                          onChange={() => handleActionChange(option.key)}
                        />
                        <ActionIcon className="shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">
                          {approvalTask && option.key === 'done'
                            ? '审批通过'
                            : resolveMobileActionLabel(option.key)}
                        </span>
                      </label>
                    )
                  })}
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
              </section>
            ) : singleVisibleAction ? (
              <section
                className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                data-testid="mobile-task-single-action"
              >
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-950">
                    本次操作
                  </h2>
                  <div
                    className="mobile-task-single-action__value inline-flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    data-testid="mobile-task-single-action-summary"
                  >
                    <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                      <SingleActionIcon aria-hidden="true" />
                    </span>
                    <span className="min-w-0 break-words text-base font-semibold text-slate-950">
                      {effectiveActionLabel}
                    </span>
                  </div>
                </div>
              </section>
            ) : (
              <section
                className="erp-mobile-card rounded-2xl border border-amber-200 bg-white p-4 shadow-sm"
                data-testid="mobile-task-action-unavailable"
                role="status"
              >
                <h2 className="text-lg font-semibold text-slate-950">
                  暂不能提交
                </h2>
                <p className="mt-2 text-sm font-medium leading-6 text-amber-800">
                  当前没有可提交的处理方式，请返回任务详情重新确认。
                </p>
              </section>
            )}

            {effectiveAction ? (
              <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-lg font-semibold text-slate-950"
                    htmlFor={`${fieldID}-reason`}
                  >
                    {resolveReasonLabel(effectiveAction, approvalTask)}
                  </label>
                  <span
                    className={`text-sm font-semibold ${
                      reasonRequired ? 'text-red-500' : 'text-slate-400'
                    }`}
                  >
                    {reasonRequired ? '必填' : '可选'}
                  </span>
                </div>
                <textarea
                  ref={reasonRef}
                  id={`${fieldID}-reason`}
                  className="mt-3 min-h-[120px] w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base leading-6 text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
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
                <div className="mt-1 flex items-start justify-between gap-3 text-sm">
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
              </section>
            ) : null}

            {approvedQuantityAllowed ? (
              <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-lg font-semibold text-slate-950"
                    htmlFor={`${fieldID}-approved-quantity`}
                  >
                    批准数量
                  </label>
                  <span className="text-sm font-semibold text-slate-400">
                    可选
                  </span>
                </div>
                <input
                  id={`${fieldID}-approved-quantity`}
                  className="mt-3 min-h-[48px] w-full rounded-xl border border-slate-200 px-3 py-3 text-base text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                  inputMode="decimal"
                  disabled={busy}
                  placeholder="留空表示按申请数量批准"
                  value={approvedQuantity}
                  onChange={(event) => {
                    clearValidationError('approvedQuantity')
                    onApprovedQuantityChange(event.target.value)
                  }}
                />
                {validationErrors.approvedQuantity ? (
                  <p
                    className="mt-2 text-sm font-medium text-red-600"
                    role="alert"
                  >
                    {validationErrors.approvedQuantity}
                  </p>
                ) : null}
              </section>
            ) : null}

            <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-700 [overflow-wrap:anywhere]">
              {actionOutcomeHint}
            </p>
          </>
        ) : null}
      </main>

      {accessAllowsSubmit || showFooterRetry || showDisabledSubmit ? (
        <div className="mobile-role-action-bar shrink-0 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
          {accessAllowsSubmit ? (
            <button
              type="submit"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={busy || !canSubmit || visibleActions.length === 0}
            >
              {busy ? <LoadingOutlined spin /> : null}
              <span>{busy ? busySubmitLabel : submitLabel}</span>
            </button>
          ) : null}
          {showFooterRetry ? (
            <button
              type="button"
              className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
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
