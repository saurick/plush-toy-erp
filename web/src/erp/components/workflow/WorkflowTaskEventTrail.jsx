import React from 'react'
import { buildWorkflowTaskEventTrailModel } from '../../utils/workflowTaskEventPresentation.mjs'
import './workflowTaskEventTrail.css'

const EVENT_MARKERS = Object.freeze({
  danger: '!',
  info: '●',
  neutral: '·',
  success: '✓',
  warning: '↑',
})

export default function WorkflowTaskEventTrail({
  approvalTask = false,
  className = '',
  errorMessage = '',
  events = [],
  state = 'ready',
  task = {},
  variant = 'desktop',
}) {
  const model = buildWorkflowTaskEventTrailModel({
    approvalTask,
    events,
    task,
  })
  const loading = state === 'idle' || state === 'loading'

  return (
    <section
      className={[
        'workflow-task-event-trail',
        `workflow-task-event-trail--${variant}`,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`workflow-task-event-trail-title-${task.id || 'current'}`}
      data-testid="workflow-task-event-trail"
    >
      <div className="workflow-task-event-trail__head">
        <div>
          <h3 id={`workflow-task-event-trail-title-${task.id || 'current'}`}>
            本任务处理记录
          </h3>
          <p>
            按时间倒序显示这条任务的状态变更、处理岗位和意见；只代表当前任务，不是来源单据的完整审批链。
          </p>
        </div>
        <span>{model.summaryLabel}</span>
      </div>

      <dl
        className="workflow-task-event-trail__responsibility"
        aria-label="当前任务责任"
      >
        {model.responsibilityItems.map((item) => (
          <div key={item.key}>
            <dt>{item.label}</dt>
            <dd>{item.value}</dd>
          </div>
        ))}
      </dl>

      {loading ? (
        <p className="workflow-task-event-trail__state" role="status">
          正在加载本任务处理记录…
        </p>
      ) : state === 'error' ? (
        <p
          className="workflow-task-event-trail__state workflow-task-event-trail__state--error"
          role="alert"
        >
          {errorMessage || '本任务处理记录加载失败，请刷新后重试。'}
        </p>
      ) : model.items.length > 0 ? (
        <ol
          className="workflow-task-event-trail__list"
          aria-label="本任务处理记录，按时间倒序"
        >
          {model.items.map((item) => (
            <li
              key={item.key}
              className={`workflow-task-event-trail__item workflow-task-event-trail__item--${item.tone}`}
            >
              <span
                className="workflow-task-event-trail__marker"
                aria-hidden="true"
              >
                {EVENT_MARKERS[item.tone] || EVENT_MARKERS.neutral}
              </span>
              <div className="workflow-task-event-trail__content">
                <div className="workflow-task-event-trail__item-head">
                  <strong>{item.label}</strong>
                  <span>{item.categoryLabel}</span>
                </div>
                <p className="workflow-task-event-trail__meta">
                  {item.actorLabel} · {item.timeLabel}
                  {item.versionLabel ? ` · ${item.versionLabel}` : ''}
                </p>
                {item.transitionLabel ? (
                  <p className="workflow-task-event-trail__transition">
                    {item.transitionLabel}
                  </p>
                ) : null}
                {item.reason ? (
                  <p className="workflow-task-event-trail__reason">
                    意见：{item.reason}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="workflow-task-event-trail__state">暂无本任务处理记录。</p>
      )}
    </section>
  )
}
