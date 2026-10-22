import React from 'react'
import './workflowTaskCopy.css'

export default function WorkflowTaskCard({
  as: Component = 'div',
  children,
  className = '',
  contentClassName = '',
  compact = false,
  label,
  onOpen,
  openButtonProps = {},
  ...props
}) {
  const { className: openButtonClassName = '', ...restOpenButtonProps } =
    openButtonProps
  return (
    <Component {...props} className={`erp-task-card${compact ? ' erp-task-card--compact' : ''} ${className}`}>
      <button
        {...restOpenButtonProps}
        type="button"
        className={`erp-task-card__open ${openButtonClassName}`}
        aria-label={label}
        onClick={(event) => {
          event.currentTarget.focus({ preventScroll: true })
          onOpen()
        }}
      />
      <div className={`erp-task-card__content ${contentClassName}`}>
        {children}
      </div>
    </Component>
  )
}
