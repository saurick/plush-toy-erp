import React from 'react'
import { Tag } from 'antd'
import './workflowTaskBlocker.css'

export function WorkflowTaskBlockedTag({ className = '' }) {
  return <Tag color="error" className={`erp-task-blocked-tag ${className}`}>受阻</Tag>
}

export function WorkflowTaskBlockedReason({ reason, showLabel = false, className = '' }) {
  if (!reason) return null
  return (
    <span className={`erp-task-blocked-reason ${className}`}>
      {showLabel ? '受阻原因：' : null}{reason}
    </span>
  )
}
