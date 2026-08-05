import { useEffect, useRef } from 'react'
import { LeftOutlined } from '@ant-design/icons'

const MOBILE_TASK_FLOW_STEPS = Object.freeze([
  {
    key: 'detail',
    number: '1',
    title: '查看任务',
  },
  {
    key: 'process',
    number: '2',
    title: '处理任务',
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
  title = '任务详情',
  trailing = null,
}) {
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

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
    <header className="mobile-role-detail-header mobile-task-flow-header">
      <div className="mobile-task-flow-topbar">
        <button
          type="button"
          className="mobile-task-flow-back"
          aria-label={backLabel}
          disabled={busy}
          onClick={onBack}
        >
          <LeftOutlined aria-hidden="true" />
        </button>
        <h1 ref={titleRef} className="mobile-task-flow-title" tabIndex={-1}>
          {title}
        </h1>
        <div className="mobile-task-flow-trailing">{trailing}</div>
      </div>

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
    </header>
  )
}
