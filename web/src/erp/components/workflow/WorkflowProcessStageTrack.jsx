import React from 'react'
import { buildWorkflowProcessStageModel } from '../../utils/processRuntimePresentation.mjs'
import './workflowProcessStageTrack.css'

const STAGE_MARKERS = Object.freeze({
  active: '●',
  blocked: '!',
  completed: '✓',
  rejected: '↩',
})

export default function WorkflowProcessStageTrack({
  className = '',
  context,
  variant = 'desktop',
}) {
  const model = buildWorkflowProcessStageModel(context)

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
    >
      <div className="workflow-process-stage__head">
        <div className="workflow-process-stage__title">
          <strong>执行轨迹</strong>
        </div>
        <span className="workflow-process-stage__summary">
          {model.summaryLabel}
        </span>
      </div>

      <ol
        className="workflow-process-stage__list"
        aria-label={`${model.processLabel}执行轨迹`}
      >
        {model.items.map((item) => (
          <li
            key={item.key}
            className={`workflow-process-stage__item workflow-process-stage__item--${item.tone}`}
            aria-current={item.current ? 'step' : undefined}
            data-linked-task={item.linked ? 'true' : undefined}
          >
            <span className="workflow-process-stage__marker" aria-hidden="true">
              {STAGE_MARKERS[item.tone]}
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
            </span>
          </li>
        ))}
      </ol>

      <p className="workflow-process-stage__handoff">{model.handoffLabel}</p>
    </div>
  )
}
