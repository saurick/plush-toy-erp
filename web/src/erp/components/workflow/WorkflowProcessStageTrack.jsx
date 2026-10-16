import React from 'react'
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
}) {
  const model = suppliedModel || buildWorkflowProcessStageModel(context)

  return (
    <div
      className={[
        'workflow-process-stage',
        `workflow-process-stage--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-testid="workflow-process-stage"
      data-handoff-kind={model.handoffKind}
      data-direction="top-to-bottom"
    >
      <span className="workflow-process-stage__summary">
        {model.summaryLabel}
        {model.items.length > 1 ? ' · 自上而下 ↓' : ''}
      </span>

      <ol
        className="workflow-process-stage__list"
        aria-label={`${model.processLabel}执行轨迹`}
      >
        {model.items.map((item, index) => (
          <li
            key={item.key}
            className={`workflow-process-stage__item workflow-process-stage__item--${item.tone}`}
            aria-current={item.current ? 'step' : undefined}
            data-linked-task={item.linked ? 'true' : undefined}
          >
            <span className="workflow-process-stage__marker" aria-hidden="true">
              {STAGE_MARKERS[item.tone] || index + 1}
            </span>
            <span className="workflow-process-stage__content">
              <span className="workflow-process-stage__label">
                {item.label}
              </span>
              <span className="workflow-process-stage__meta">
                {item.statusLabel}
                {item.attemptLabel ? ` · ${item.attemptLabel}` : ''}
                {item.linked ? ' · 本任务' : ''}
              </span>
              {item.detail ? (
                <span className="workflow-process-stage__meta">
                  {item.responsibilities?.length ? <WorkflowResponsibilities items={item.responsibilities} /> : item.detail}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>

      {model.handoffLabel ? <p className="workflow-process-stage__handoff">{model.handoffLabel}</p> : null}
    </div>
  )
}
