import React from 'react'
import { ClockCircleOutlined } from '@ant-design/icons'
import { getWorkflowTaskTiming } from '../../utils/workflowTaskTiming.mjs'
import './workflowTaskTiming.css'

export default function WorkflowTaskTiming({
  task,
  detail = false,
  events = [],
}) {
  const rows = getWorkflowTaskTiming(task, { detail, events })
  if (!rows.length) return null
  return (
    <div
      className={`erp-task-timing${detail ? ' erp-task-timing--detail' : ''}`}
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
          >
            <dt>{row.label}</dt>
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
