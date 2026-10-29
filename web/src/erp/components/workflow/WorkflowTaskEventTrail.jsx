import React from 'react'
import { HistoryOutlined } from '@ant-design/icons'
import { Button, Empty, Popover } from 'antd'
import { buildWorkflowTaskEventTrailModel } from '../../utils/workflowTaskEventPresentation.mjs'
import './workflowTaskEventTrail.css'

function WorkflowEventAuditDetails({ item }) {
  const [open, setOpen] = React.useState(false)
  const trigger = React.useRef(null)
  const closeOnEscape = (event) => {
    if (!open || event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  return (
    <Popover
      trigger="click"
      placement="topRight"
      open={open}
      onOpenChange={setOpen}
      content={(
        <dl className="workflow-task-event-trail__audit">
          <dt>记录分类</dt><dd>{item.categoryLabel}</dd>
          <dt>精确时间</dt><dd>{item.timeLabel}</dd>
          {item.versionLabel ? <><dt>任务版本</dt><dd>{item.versionLabel}</dd></> : null}
        </dl>
      )}
    >
      <Button ref={trigger} type="text" size="small" className="workflow-task-event-trail__audit-trigger" aria-label={`查看${item.label}记录详情`} aria-expanded={open} onKeyDown={closeOnEscape}>详情</Button>
    </Popover>
  )
}

export function WorkflowTaskEventEntries({ items, variant = 'desktop' }) {
  return (
    <ol
      className={`workflow-task-event-trail__list workflow-task-event-trail__list--${variant}`}
      aria-label="本任务处理记录，最近在前，按时间倒序"
    >
      {items.map((item) => (
        <li
          key={item.key}
          className={`workflow-task-event-trail__item workflow-task-event-trail__item--${item.tone}`}
        >
          <span
            className="workflow-task-event-trail__marker"
            aria-hidden="true"
          />
          <div className="workflow-task-event-trail__content">
            <div className="workflow-task-event-trail__item-head">
              <strong>{item.label}</strong>
              <WorkflowEventAuditDetails item={item} />
            </div>
            <p className="workflow-task-event-trail__meta">
              {item.actorName ? (
                <>
                  <span className="workflow-task-event-trail__actor-name">
                    {item.actorName}
                  </span>
                  {item.actorRoleLabel ? (
                    <span className="workflow-task-event-trail__actor-role">
                      （{item.actorRoleLabel}）
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="workflow-task-event-trail__actor-name">
                  {item.actorLabel}
                </span>
              )}{' '}
              ·{' '}
              <span className="workflow-task-event-trail__meta-time">
                {item.timeLabel.replace(/:\d{2}$/u, '')}
              </span>

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
  )
}

export default function WorkflowTaskEventTrail({
  approvalTask = false,
  className = '',
  errorMessage = '',
  events = [],
  state = 'ready',
  task = {},
  truncated = false,
  variant = 'desktop',
  showResponsibility = true,
  compact = false,
}) {
  const model = buildWorkflowTaskEventTrailModel({
    approvalTask,
    events,
    task,
  })
  const loading = state === 'idle' || state === 'loading'
  const summaryText = loading ? '读取中' : state === 'error' ? '读取失败' : model.items.length
    ? `${truncated ? '最近 ' : ''}${model.items.length} 条` : '暂无记录'
  const summary = <span className="workflow-task-event-trail__count">{summaryText}</span>

  return (
    <section
      className={[
        'workflow-task-event-trail',
        `workflow-task-event-trail--${variant}`,
        compact ? 'workflow-task-event-trail--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-labelledby={`workflow-task-event-trail-title-${task.id || 'current'}`}
      data-testid="workflow-task-event-trail"
    >
      <div key={task.id} className="workflow-task-event-trail__body">
        <div className="workflow-task-event-trail__head">
          <div className={compact ? 'workflow-task-event-trail__heading-label' : undefined}>
            {compact ? <HistoryOutlined aria-hidden="true" /> : null}
            <h3 id={`workflow-task-event-trail-title-${task.id || 'current'}`}>
              本任务处理记录
            </h3>
            {compact ? summary : null}
          </div>
          {!compact ? summary : null}
        </div>

        {showResponsibility ? (
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
      ) : null}

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
        <>
          <WorkflowTaskEventEntries items={model.items} variant={variant} />
          {truncated ? (
            <p
              className="workflow-task-event-trail__state"
              data-testid="workflow-task-event-trail-truncated"
              role="status"
            >
              仅显示最近 {model.items.length} 条，更早记录未加载。
            </p>
          ) : null}
        </>
      ) : (
        <Empty description="暂无本任务处理记录" />
      )}
      </div>
    </section>
  )
}
