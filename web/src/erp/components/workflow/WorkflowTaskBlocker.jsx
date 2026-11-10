import React from 'react'
import WorkflowTaskStatusTag from './WorkflowTaskStatusTag.jsx'
import './workflowTaskBlocker.css'

export function WorkflowTaskBlockedTag({ className = '' }) {
  return (
    <WorkflowTaskStatusTag tone="blocked" color="error" className={`erp-task-blocked-tag ${className}`}>
      受阻
    </WorkflowTaskStatusTag>
  )
}
