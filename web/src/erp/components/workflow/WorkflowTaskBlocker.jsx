import React from 'react'
import { Tag } from 'antd'
import './workflowTaskBlocker.css'

export function WorkflowTaskBlockedTag({ className = '' }) {
  return <Tag color="error" className={`erp-task-blocked-tag ${className}`}>受阻</Tag>
}
