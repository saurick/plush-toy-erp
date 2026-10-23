import React from 'react'
import './workflowTaskReason.css'

export default function WorkflowTaskReason({ meta, showLabel = true, className = '' }) {
  if (!meta?.value?.trim()) return null
  const danger = meta.kind === 'blocked' || meta.kind === 'rejected'
  const label = meta.kind === 'blocked' ? '受阻原因' : meta.label
  return (
    <span className={`erp-task-reason${danger ? ' erp-task-reason--danger' : ''} ${className}`}>
      {showLabel && label ? <strong className="erp-task-reason__label">{label}：</strong> : null}{meta.value}
    </span>
  )
}
