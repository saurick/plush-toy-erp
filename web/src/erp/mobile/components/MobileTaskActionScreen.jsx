import { useEffect, useId, useRef, useState } from 'react'
import {
  BellOutlined,
  CheckOutlined,
  ExclamationCircleFilled,
  FileTextOutlined,
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
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'

const ACTION_OPTIONS = Object.freeze([
  {
    key: 'done',
    icon: CheckOutlined,
    toneClass:
      'border-emerald-200 bg-emerald-50 text-emerald-700 aria-pressed:border-emerald-600 aria-pressed:bg-emerald-600 aria-pressed:text-white',
  },
  {
    key: 'blocked',
    icon: PauseOutlined,
    toneClass:
      'border-orange-200 bg-orange-50 text-orange-700 aria-pressed:border-orange-600 aria-pressed:bg-orange-600 aria-pressed:text-white',
  },
  {
    key: 'resume',
    icon: RedoOutlined,
    toneClass:
      'border-blue-200 bg-blue-50 text-blue-700 aria-pressed:border-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white',
  },
  {
    key: 'rejected',
    icon: StopOutlined,
    toneClass:
      'border-red-200 bg-red-50 text-red-700 aria-pressed:border-red-600 aria-pressed:bg-red-600 aria-pressed:text-white',
  },
  {
    key: 'urge',
    icon: BellOutlined,
    toneClass:
      'border-slate-200 bg-white text-slate-700 aria-pressed:border-blue-600 aria-pressed:bg-blue-600 aria-pressed:text-white',
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

function resolveReasonLabel(action) {
  if (action === 'done') return '完成反馈'
  if (action === 'blocked') return '阻塞原因'
  if (action === 'rejected') return '退回原因'
  if (action === 'resume') return '阻塞解除说明'
  if (action === 'urge') return '催办原因'
  return '处理原因'
}

function resolveReasonPlaceholder(action) {
  if (action === 'done') {
    return '说明已完成什么、核对结果和需要交接的信息'
  }
  if (action === 'blocked') return '说明当前卡点、影响和需要的支持'
  if (action === 'rejected') return '说明退回依据和需要补充的内容'
  if (action === 'resume') return '说明阻塞已如何解除，以及下一步安排'
  if (action === 'urge') return '说明催办原因和期望完成时间'
  return '请填写处理原因'
}

function validationErrorsFor({ action, reason }) {
  return {
    action: action ? '' : '请选择本次处理方式',
    reason:
      REASON_REQUIRED_ACTIONS.has(action) && !String(reason || '').trim()
        ? `${resolveReasonLabel(action)}为必填项`
        : '',
  }
}

export default function MobileTaskActionScreen({
  accessMessage = '',
  accessState = MOBILE_TASK_ACTION_ACCESS_STATES.CHECKING,
  availableActions = [],
  busy = false,
  evidence = '',
  canViewReceipt = false,
  onActionChange = () => {},
  onBack = () => {},
  onCancel = null,
  onEvidenceChange = () => {},
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
    reason: '',
  })

  const normalizedActions = ACTION_OPTIONS.filter((option) =>
    availableActions.includes(option.key)
  )
  const visibleActions =
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.URGE_ONLY
      ? normalizedActions.filter((option) => option.key === 'urge')
      : normalizedActions
  const effectiveAction = visibleActions.some(
    (option) => option.key === selectedAction
  )
    ? selectedAction
    : ''
  const canSubmit =
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.ACTIONABLE ||
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.URGE_ONLY
  const showFooterRetry =
    !canSubmit &&
    accessState === MOBILE_TASK_ACTION_ACCESS_STATES.FAILED &&
    Boolean(onRetryAccess)
  const accessCopy = resolveAccessCopy(accessState, accessMessage)
  const taskName = readableText(task?.task_name, '任务处理')
  const taskStatus = task
    ? resolveMobileTaskStatusLabel(task)
    : '任务状态暂不可用'
  const taskSource = task ? resolveTaskSourceLabel(task) : '来源信息暂不可用'
  const reasonRequired = REASON_REQUIRED_ACTIONS.has(effectiveAction)

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

  const handleCancel = () => {
    if (onCancel) {
      onCancel()
      return
    }
    onBack()
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!canSubmit || busy) return
    const errors = validationErrorsFor({
      action: effectiveAction,
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
    onSubmit({
      action: effectiveAction,
      evidence: String(evidence || '').trim(),
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

      <main className="mobile-role-tasks-page__detail-main space-y-4 bg-slate-50 px-4 py-5">
        <section className="mobile-task-detail-hero erp-mobile-card rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileTextOutlined />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-blue-600">
                当前任务
              </div>
              <h2 className="mt-1 break-words text-xl font-semibold text-slate-950 [overflow-wrap:anywhere]">
                {taskName}
              </h2>
              <div className="mt-2 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">
                {taskSource}
              </div>
            </div>
          </div>
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

        {canSubmit ? (
          <>
            <fieldset className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <legend className="text-lg font-semibold text-slate-950">
                选择处理方式
              </legend>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                请选择与现场处理情况一致的方式；提交前系统会再次确认您是否可以办理这条任务。
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                {visibleActions.map((option, index) => {
                  const ActionIcon = option.icon
                  const selected = effectiveAction === option.key
                  return (
                    <button
                      key={option.key}
                      ref={index === 0 ? actionChoiceRef : null}
                      type="button"
                      className={`mobile-task-action-choice mobile-task-action-choice--${option.key} inline-flex min-h-[48px] min-w-0 items-center justify-center gap-2 rounded-xl border px-3 py-3 text-base font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50 ${option.toneClass}`}
                      aria-pressed={selected}
                      disabled={busy}
                      onClick={() => handleActionChange(option.key)}
                    >
                      <ActionIcon className="shrink-0" aria-hidden="true" />
                      <span className="break-words">
                        {resolveMobileActionLabel(option.key)}
                      </span>
                    </button>
                  )
                })}
              </div>
              {validationErrors.action ? (
                <p
                  className="mt-3 text-sm font-medium text-red-600"
                  role="alert"
                >
                  {validationErrors.action}
                </p>
              ) : null}
              {visibleActions.length === 0 ? (
                <p
                  className="mt-3 text-sm font-medium text-amber-800"
                  role="status"
                >
                  当前没有可提交的处理方式，请返回任务详情重新确认。
                </p>
              ) : null}
            </fieldset>

            {effectiveAction ? (
              <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <label
                    className="text-lg font-semibold text-slate-950"
                    htmlFor={`${fieldID}-reason`}
                  >
                    {resolveReasonLabel(effectiveAction)}
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
                  maxLength={500}
                  placeholder={resolveReasonPlaceholder(effectiveAction)}
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
                    {String(reason || '').length}/500
                  </span>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <label
                    className="text-lg font-semibold text-slate-950"
                    htmlFor={`${fieldID}-evidence`}
                  >
                    现场证据
                  </label>
                  <span className="text-sm font-semibold text-slate-400">
                    可选
                  </span>
                </div>
                <textarea
                  id={`${fieldID}-evidence`}
                  className="mt-3 min-h-[104px] w-full resize-y rounded-xl border border-slate-200 px-3 py-3 text-base leading-6 text-slate-950 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                  aria-describedby={`${fieldID}-evidence-help`}
                  disabled={busy}
                  maxLength={500}
                  placeholder="填写照片、附件编号或链接；多条可换行"
                  value={evidence}
                  onChange={(event) => onEvidenceChange(event.target.value)}
                />
                <div className="mt-1 flex justify-end text-sm">
                  <span className="shrink-0 text-slate-400">
                    {String(evidence || '').length}/500
                  </span>
                </div>
                <p
                  id={`${fieldID}-evidence-help`}
                  className="mt-2 text-sm leading-6 text-slate-500"
                >
                  这里只填写可核验线索；已上传的现场附件仍由任务附件区管理。
                </p>
              </section>
            ) : null}

            <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-700">
              <div className="font-semibold">业务边界</div>
              <div className="mt-1 [overflow-wrap:anywhere]">
                这里仅记录这条任务的办理情况；库存、质检、出货、开票和收付款仍需在对应单据中办理。
              </div>
            </section>
          </>
        ) : null}
      </main>

      <div
        className={`mobile-role-action-bar grid shrink-0 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur ${
          canSubmit || showFooterRetry ? 'grid-cols-2 gap-3' : ''
        }`}
      >
        <button
          type="button"
          className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={busy}
          onClick={handleCancel}
        >
          {canSubmit ? '取消' : '返回任务'}
        </button>
        {canSubmit ? (
          <button
            type="submit"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={busy || visibleActions.length === 0}
          >
            {busy ? <LoadingOutlined spin /> : null}
            {busy ? '正在提交' : '确认提交'}
          </button>
        ) : null}
        {showFooterRetry ? (
          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={busy}
            onClick={onRetryAccess}
          >
            <ReloadOutlined />
            重新确认
          </button>
        ) : null}
      </div>
    </form>
  )
}
