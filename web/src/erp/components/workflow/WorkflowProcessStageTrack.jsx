import React from 'react'
import { CheckOutlined, RightOutlined } from '@ant-design/icons'
import { buildWorkflowProcessStageModel } from '../../utils/processRuntimePresentation.mjs'
import WorkflowResponsibilities from './WorkflowResponsibilities.jsx'
import './workflowProcessStageTrack.css'

const STAGE_MARKERS = Object.freeze({
  blocked: '!',
  completed: '✓',
  rejected: '↩',
  withdrawn: '−',
})

export default function WorkflowProcessStageTrack({
  className = '',
  context,
  model: suppliedModel,
  variant = 'desktop',
  focusCurrent = false,
  compact = false,
  hideLinkedCurrent = false,
}) {
  const [expandedStep, setExpandedStep] = React.useState(null)
  const model = suppliedModel || buildWorkflowProcessStageModel(context)
  const numbered = focusCurrent && compact
  const history = focusCurrent
    ? model.items.filter((item) => !item.current && !item.linked && ['completed', 'rejected', 'withdrawn'].includes(item.tone))
      .sort((left, right) => (right.completedAt || 0) - (left.completedAt || 0) || model.items.indexOf(right) - model.items.indexOf(left))
    : []
  const visible = model.items.filter((item) => !history.includes(item) && !(hideLinkedCurrent && item.linked && item.current))
  const repeatsCurrent = focusCurrent && model.handoffKind === 'role' &&
    model.items.some((item) => item.linked && item.current) &&
    !visible.some((item) => item.current && !item.linked)
  const renderContent = (item, expandable) => (
    <span className="workflow-process-stage__content">
      <span className="workflow-process-stage__label">{item.label}</span>
      <span className="workflow-process-stage__meta">
        <span className="workflow-process-stage__status">
          {numbered && item.tone === 'completed' ? <CheckOutlined aria-hidden="true" /> : null}
          {item.statusLabel}{item.attemptLabel ? ` · ${item.attemptLabel}` : ''}{item.linked ? ' · 本任务' : ''}
        </span>
        {expandable && item.completedAtLabel ? <span>{item.completedAtLabel}</span> : null}
      </span>
      {!expandable && item.detail ? <span className="workflow-process-stage__meta">{item.responsibilities?.length ? <WorkflowResponsibilities items={item.responsibilities} /> : item.detail}</span> : null}
    </span>
  )
  const renderItems = (items, label, expandable = false) => (
    <ol className="workflow-process-stage__list" aria-label={label}>
      {items.map((item) => {
        const sequence = model.items.indexOf(item) + 1
        const stepKey = item.id || item.key
        const marker = <span className="workflow-process-stage__marker" aria-hidden="true">{numbered ? sequence : STAGE_MARKERS[item.tone] || sequence}</span>
        return (
          <li
            key={stepKey}
            className={`workflow-process-stage__item workflow-process-stage__item--${item.tone}${expandable ? ' workflow-process-stage__item--expandable' : ''}`}
            aria-current={item.current ? 'step' : undefined}
            data-linked-task={item.linked ? 'true' : undefined}
          >
            {expandable ? (
              <details className="workflow-process-stage__step" open={expandedStep === stepKey}>
                <summary aria-label={`查看第 ${sequence} 步：${item.label}详情`} onClick={(event) => { event.preventDefault(); setExpandedStep((current) => current === stepKey ? null : stepKey) }}>
                  {marker}{renderContent(item, true)}<RightOutlined className="workflow-process-stage__step-toggle" aria-hidden="true" />
                </summary>
                <dl className="workflow-process-stage__step-detail">
                  <div><dt>处理结果</dt><dd>{item.statusLabel}{item.attemptLabel ? ` · ${item.attemptLabel}` : ''}</dd></div>
                  {item.startedAtLabel ? <div><dt>开始时间</dt><dd>{item.startedAtLabel}</dd></div> : null}
                  {item.completedAtLabel ? <div><dt>结束时间</dt><dd>{item.completedAtLabel}</dd></div> : null}
                  {!item.startedAtLabel && !item.completedAtLabel && !item.detail ? <div><dt>处理时间</dt><dd>时间未记录</dd></div> : null}
                  {item.detail ? <div><dt>处理说明</dt><dd>{item.responsibilities?.length ? <WorkflowResponsibilities items={item.responsibilities} /> : item.detail}</dd></div> : null}
                </dl>
              </details>
          ) : <>{marker}{renderContent(item, false)}</>}
          </li>
        )
      })}
    </ol>
  )

  return (
    <div
      className={[
        'workflow-process-stage',
        `workflow-process-stage--${variant}`,
        focusCurrent ? 'workflow-process-stage--focused' : '',
        compact ? 'workflow-process-stage--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="workflow-process-stage"
      data-handoff-kind={model.handoffKind}
      data-direction="top-to-bottom"
    >
      {!focusCurrent ? (
        <span className="workflow-process-stage__summary">
          {model.summaryLabel}
          {model.items.length > 1 ? ' · 从早到晚 ↓' : ''}
        </span>
      ) : null}

      {visible.length ? renderItems(visible, `${model.processLabel}执行轨迹`) : null}

      {model.handoffLabel && !repeatsCurrent ? <p className="workflow-process-stage__handoff">{model.handoffLabel}</p> : null}
      {history.length ? (
        <div className="workflow-process-stage__history">
          <p className="workflow-process-stage__history-heading">
            {history.every((item) => item.tone === 'completed') ? `前序 ${history.length} 步已完成` : `已结束步骤 ${history.length}`}
          </p>
          {renderItems(history, `${model.processLabel}已结束步骤，最近在前`, numbered)}
        </div>
      ) : null}
    </div>
  )
}
