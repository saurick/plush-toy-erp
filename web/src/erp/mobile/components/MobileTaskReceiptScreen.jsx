import {
  CheckCircleFilled,
  ClockCircleOutlined,
  CloseCircleFilled,
  FileTextOutlined,
  LoadingOutlined,
  ReloadOutlined,
  RightOutlined,
} from '@ant-design/icons'
import {
  resolveMobileActionDisplayLabel,
  resolveMobileTaskStatusLabel,
  resolveTaskSourceLabel,
} from '../utils/mobileRoleTaskModel.mjs'
import MobileTaskFlowHeader from './MobileTaskFlowHeader.jsx'

const MOBILE_TASK_RECEIPT_OUTCOMES = Object.freeze({
  CONFIRMED: 'confirmed',
  FAILED: 'failed',
  UNKNOWN: 'unknown',
})

const OUTCOME_META = Object.freeze({
  [MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED]: {
    icon: CheckCircleFilled,
    iconClass: 'bg-emerald-50 text-emerald-600',
    title: '任务办理已确认',
    description:
      '系统已确认本次办理结果；下方状态是本次确认时的结果，最新状态请返回列表刷新核对。',
  },
  [MOBILE_TASK_RECEIPT_OUTCOMES.UNKNOWN]: {
    icon: ClockCircleOutlined,
    iconClass: 'bg-amber-50 text-amber-700',
    title: '提交结果待确认',
    description:
      '系统尚未确认本次提交是否生效，请先重新确认结果，避免重复办理。',
  },
  [MOBILE_TASK_RECEIPT_OUTCOMES.FAILED]: {
    icon: CloseCircleFilled,
    iconClass: 'bg-red-50 text-red-600',
    title: '本次操作未完成',
    description: '任务状态没有得到确认。您可以查看任务并重新办理。',
  },
})

function readableText(value, fallback) {
  const text = String(value || '').trim()
  return text || fallback
}

function resolveReceiptActionLabel({ action, outcome, task }) {
  const candidate =
    outcome === MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED
      ? task?.mobile_action || action
      : action
  return candidate
    ? resolveMobileActionDisplayLabel(candidate)
    : '办理信息暂不可用'
}

export default function MobileTaskReceiptScreen({
  action = null,
  busy = false,
  evidenceRefs = [],
  feedback = '',
  message = '',
  onBackToList = () => {},
  onOpenProcess = null,
  onRetryConfirm = null,
  onRetryTaskLoad = null,
  onViewTask = null,
  outcome = MOBILE_TASK_RECEIPT_OUTCOMES.UNKNOWN,
  reason = '',
  task = null,
  taskRecoveryBusy = false,
  taskRecoveryError = '',
  taskRecoveryPending = false,
}) {
  const outcomeMeta = OUTCOME_META[outcome] || OUTCOME_META.unknown
  const OutcomeIcon = outcomeMeta.icon
  const taskName = readableText(task?.task_name, '任务处理结果')
  const taskStatus = task
    ? resolveMobileTaskStatusLabel(task)
    : '任务状态暂不可用'
  const taskSource = task ? resolveTaskSourceLabel(task) : '来源信息暂不可用'
  const actionLabel = resolveReceiptActionLabel({ action, outcome, task })
  const canRetry =
    outcome !== MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED && onRetryConfirm

  return (
    <div
      className="mobile-role-tasks-page mobile-role-tasks-page--detail surface-panel bg-white text-slate-950 md:rounded-[28px] md:border md:border-slate-200 md:shadow-xl"
      aria-busy={busy}
      data-testid="mobile-task-receipt-screen"
    >
      <MobileTaskFlowHeader
        busy={busy}
        canOpenProcess={typeof onOpenProcess === 'function'}
        canOpenReceipt
        currentStep="result"
        onBack={onBackToList}
        onOpenDetail={onViewTask}
        onOpenProcess={onOpenProcess}
        processUnavailableLabel="结果已确认"
        title="结果回执"
      />

      <main className="mobile-role-tasks-page__detail-main space-y-4 bg-slate-50 px-4 py-6">
        <section
          className="erp-mobile-card rounded-3xl border border-slate-200 bg-white px-5 py-7 text-center shadow-sm"
          role={
            outcome === MOBILE_TASK_RECEIPT_OUTCOMES.FAILED ? 'alert' : 'status'
          }
        >
          <span
            className={`mx-auto inline-flex h-16 w-16 items-center justify-center rounded-2xl text-3xl ${outcomeMeta.iconClass}`}
          >
            <OutcomeIcon />
          </span>
          <h2 className="mt-4 text-2xl font-semibold text-slate-950">
            {outcomeMeta.title}
          </h2>
          <p className="mx-auto mt-2 max-w-md break-words text-base leading-7 text-slate-600 [overflow-wrap:anywhere]">
            {message || outcomeMeta.description}
          </p>
        </section>

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

        <section className="erp-mobile-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <FileTextOutlined />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-500">当前任务</div>
              <div className="mt-1 break-words text-lg font-semibold text-slate-950 [overflow-wrap:anywhere]">
                {taskName}
              </div>
            </div>
          </div>

          <dl className="mt-4 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
            <div className="mobile-task-receipt-row grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-slate-500">
                {outcome === MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED
                  ? '已确认方式'
                  : '本次办理'}
              </dt>
              <dd className="min-w-0 break-words text-right text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
                {actionLabel}
              </dd>
            </div>
            <div className="mobile-task-receipt-row grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-slate-500">
                {outcome === MOBILE_TASK_RECEIPT_OUTCOMES.CONFIRMED
                  ? '本次确认状态'
                  : '本次返回状态'}
              </dt>
              <dd className="min-w-0 break-words text-right text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
                {taskStatus}
              </dd>
            </div>
            <div className="mobile-task-receipt-row grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3">
              <dt className="text-sm font-medium text-slate-500">来源</dt>
              <dd className="min-w-0 break-words text-right text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
                {taskSource}
              </dd>
            </div>
            {String(feedback || '').trim() ? (
              <div className="mobile-task-receipt-row mobile-task-receipt-row--long grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-sm font-medium text-slate-500">完成反馈</dt>
                <dd className="min-w-0 break-words text-right text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
                  {String(feedback).trim()}
                </dd>
              </div>
            ) : null}
            {String(reason || '').trim() ? (
              <div className="mobile-task-receipt-row mobile-task-receipt-row--long grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-sm font-medium text-slate-500">处理说明</dt>
                <dd className="min-w-0 break-words text-right text-base font-semibold text-slate-950 [overflow-wrap:anywhere]">
                  {String(reason).trim()}
                </dd>
              </div>
            ) : null}
            {Array.isArray(evidenceRefs) && evidenceRefs.length > 0 ? (
              <div className="mobile-task-receipt-row mobile-task-receipt-row--long grid grid-cols-[104px_minmax(0,1fr)] gap-3 px-4 py-3">
                <dt className="text-sm font-medium text-slate-500">
                  历史处理线索
                </dt>
                <dd className="min-w-0 space-y-1 text-right text-base font-semibold text-slate-950">
                  {evidenceRefs.map((reference) => (
                    <div
                      key={reference}
                      className="break-all [overflow-wrap:anywhere]"
                    >
                      {reference}
                    </div>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>

        <section className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-4 text-sm leading-6 text-blue-700">
          <div className="font-semibold">结果边界</div>
          <div className="mt-1 [overflow-wrap:anywhere]">
            本页只展示这条任务的办理结果；库存、质检、出货、开票和收付款仍以对应单据的办理结果为准。
          </div>
        </section>
      </main>

      <div className="mobile-role-action-bar shrink-0 space-y-3 border-t border-slate-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur">
        {taskRecoveryError && onRetryTaskLoad ? (
          <button
            type="button"
            aria-label={taskRecoveryBusy ? '正在重新载入' : '重新载入任务'}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={taskRecoveryBusy}
            onClick={onRetryTaskLoad}
          >
            {taskRecoveryBusy ? <LoadingOutlined spin /> : <ReloadOutlined />}
            {taskRecoveryBusy ? '正在重新载入' : '重新载入任务'}
          </button>
        ) : null}
        {canRetry ? (
          <button
            type="button"
            aria-label={busy ? '正在确认' : '重新确认结果'}
            className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-base font-semibold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={busy}
            onClick={onRetryConfirm}
          >
            {busy ? <LoadingOutlined spin /> : <ReloadOutlined />}
            {busy ? '正在确认' : '重新确认结果'}
          </button>
        ) : null}
        <div className={`grid gap-3 ${onViewTask ? 'grid-cols-2' : ''}`}>
          <button
            type="button"
            className="inline-flex min-h-[48px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy}
            onClick={onBackToList}
          >
            返回列表
          </button>
          {onViewTask ? (
            <button
              type="button"
              aria-label="查看任务"
              className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-base font-semibold text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              onClick={onViewTask}
            >
              查看任务
              <RightOutlined />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
