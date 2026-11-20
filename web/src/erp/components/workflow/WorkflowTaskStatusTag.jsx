import React from 'react'
import { Tag } from 'antd'
import './workflowTaskStatusTag.css'

export default function WorkflowTaskStatusTag({ tone, className = '', ...props }) {
  return (
    <Tag
      {...props}
      className={`erp-task-status-tag${className ? ` ${className}` : ''}`}
      data-task-status-tone={tone}
    />
  )
}
