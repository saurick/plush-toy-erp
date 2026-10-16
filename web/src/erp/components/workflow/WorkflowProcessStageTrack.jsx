import React from 'react'
import { CheckCircleOutlined, DownOutlined } from '@ant-design/icons'
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
  defaultExpanded = true,
}) {
  const model = suppliedModel || buildWorkflowProcessStageModel(context)
  const history = focusCurrent
    ? model.items.filter((item) => !item.current && !item.linked && ['completed', 'rejected', 'withdrawn'].includes(item.tone))
    : []
  const visible = model.items.filter((item) => !history.includes(item) && !(hideLinkedCurrent && item.linked && item.current))
  const repeatsCurrent = focusCurrent && model.handoffKind === 'role' &&
    model.items.some((item) => item.linked && item.current) &&
    !visible.some((item) => item.current && !item.linked)
  const renderItems = (items, label) => (
    <ol className="workflow-process-stage__list" aria-label={label}>
      {items.map((item) => (
        <li
          key={item.key}
          className={`workflow-process-stage__item workflow-process-stage__item--${item.tone}`}
          aria-current={item.current ? 'step' : undefined}
          data-linked-task={item.linked ? 'true' : undefined}
        >
          <span className="workflow-process-stage__marker" aria-hidden="true">{STAGE_MARKERS[item.tone] || model.items.indexOf(item) + 1}</span>
          <span className="workflow-process-stage__content">
            <span className="workflow-process-stage__label">{item.label}</span>
            <span className="workflow-process-stage__meta">{item.statusLabel}{item.attemptLabel ? ` · ${item.attemptLabel}` : ''}{item.linked ? ' · 本任务' : ''}</span>
            {item.detail ? <span className="workflow-process-stage__meta">{item.responsibilities?.length ? <WorkflowResponsibilities items={item.responsibilities} /> : item.detail}</span> : null}
          </span>
        </li>
      ))}
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
          {model.items.length > 1 ? ' · 自上而下 ↓' : ''}
        </span>
      ) : null}

      {visible.length ? renderItems(visible, `${model.processLabel}执行轨迹`) : null}

      {model.handoffLabel && !repeatsCurrent ? <p className="workflow-process-stage__handoff">{model.handoffLabel}</p> : null}
      {history.length ? (
        <details className="workflow-process-stage__history" open={defaultExpanded}>
          <summary><span><CheckCircleOutlined aria-hidden="true" />{history.every((item) => item.tone === 'completed') ? `前序 ${history.length} 步已完成` : `已结束步骤 ${history.length}`}</span><DownOutlined aria-hidden="true" /></summary>
          {renderItems(history, `${model.processLabel}已结束步骤`)}
        </details>
      ) : null}
    </div>
  )
}
