import React from 'react'
import './workflowTaskCopy.css'

export default function WorkflowTaskCard({
  children,
  className = '',
  label,
  onOpen,
  ...props
}) {
  return (
    <div {...props} className={`erp-task-card ${className}`}>
      <button
        type="button"
        className="erp-task-card__open"
        aria-label={label}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true })
          onOpen()
        }}
      />
      <div className="erp-task-card__content">{children}</div>
    </div>
  )
}
