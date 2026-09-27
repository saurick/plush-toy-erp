import MobileDetailHeader from './MobileDetailHeader.jsx'

const MOBILE_TASK_FLOW_STEPS = Object.freeze([
  {
    key: 'detail',
    number: '1',
    title: '任务信息',
  },
  {
    key: 'process',
    number: '2',
    title: '任务办理',
  },
  {
    key: 'result',
    number: '3',
    title: '结果回执',
  },
])

export default function MobileTaskFlowHeader({
  backLabel = '返回任务列表',
  busy = false,
  canOpenProcess = false,
  canOpenReceipt = false,
  currentStep = 'detail',
  onBack = () => {},
  onOpenDetail = null,
  onOpenProcess = null,
  onOpenReceipt = null,
  processUnavailableLabel = '当前不可办理',
  receiptUnavailableLabel = '办理后开放',
  title = '任务信息',
  trailing = null,
}) {
  const stepActions = {
    detail: onOpenDetail,
    process: onOpenProcess,
    result: onOpenReceipt,
  }
  const stepAvailability = {
    detail: currentStep === 'detail' || typeof onOpenDetail === 'function',
    process:
      currentStep === 'process' ||
      (canOpenProcess && typeof onOpenProcess === 'function'),
    result:
      currentStep === 'result' ||
      (canOpenReceipt && typeof onOpenReceipt === 'function'),
  }

  return (
    <MobileDetailHeader
      title={title}
      backLabel={backLabel}
      onBack={onBack}
      busy={busy}
      trailing={trailing}
    >
      <nav
        className="mobile-task-flow-steps"
        aria-label="任务处理步骤"
        data-testid="mobile-task-flow-steps"
      >
        {MOBILE_TASK_FLOW_STEPS.map((step) => {
          const current = step.key === currentStep
          const available = stepAvailability[step.key]
          const unavailableLabel =
            step.key === 'process'
              ? processUnavailableLabel
              : step.key === 'result'
                ? receiptUnavailableLabel
                : ''
          const accessibilityLabel = current
            ? `${step.title}，当前步骤`
            : available
              ? step.title
              : `${step.title}，${unavailableLabel}`
          return (
            <button
              key={step.key}
              type="button"
              className="mobile-task-flow-step"
              aria-current={current ? 'step' : undefined}
              aria-label={accessibilityLabel}
              data-state={
                current ? 'current' : available ? 'available' : 'locked'
              }
              data-step-key={step.key}
              disabled={busy || current || !available}
              onClick={stepActions[step.key] || undefined}
            >
              <span className="mobile-task-flow-step__number">
                {step.number}
              </span>
              <span className="mobile-task-flow-step__copy">
                <span className="mobile-task-flow-step__title">
                  {step.title}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </MobileDetailHeader>
  )
}
