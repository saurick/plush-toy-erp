import React from 'react'
import { ClockCircleOutlined } from '@ant-design/icons'
import { getWorkflowTaskTiming } from '../../utils/workflowTaskTiming.mjs'
import './workflowTaskTiming.css'

export default function WorkflowTaskTiming({
  task,
  detail = false,
  compact = false,
  events = [],
  includeKeys,
  showDueRisk = true,
  nowMs,
}) {
  const rows = getWorkflowTaskTiming(task, { detail, events, showDueRisk, nowMs }).filter((row) => !includeKeys || includeKeys.includes(row.key))
  if (!rows.length) return null
  return (
    <div
      className={`erp-task-timing${detail ? ' erp-task-timing--detail' : ''}${compact ? ' erp-task-timing--compact' : ''}`}
    >
      <ClockCircleOutlined
        className="erp-task-timing__icon"
        aria-hidden="true"
      />
      <dl>
        {rows.map((row) => (
          <div
            key={row.key}
            className={`erp-task-timing__row erp-task-timing__row--${row.tone}`}
            data-task-time={row.key}
            data-time-state={row.state}
          >
            <dt hidden={!detail && row.state === 'missing' && ['due', 'ended'].includes(row.key)}>{row.label}</dt>
            <dd>
              {row.dateTime ? (
                <time dateTime={row.dateTime} title={row.title}>
                  {row.value}
                </time>
              ) : (
                row.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
