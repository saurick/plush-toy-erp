import React, { useRef, useState } from 'react'
import { Button, Dropdown } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import './workflowTaskSecondaryActions.css'

export function WorkflowTaskActionGroup({ label, children, className = '', hidden = false }) {
  return (
    <div className={`erp-task-operation-group ${className}`.trim()} role={label ? 'group' : undefined} aria-label={label || undefined} hidden={hidden}>
      <div className="erp-task-operation-group__controls">{children}</div>
    </div>
  )
}

export default function WorkflowTaskSecondaryActions({ actions = [], disabled = false }) {
  const trigger = useRef(null)
  const [open, setOpen] = useState(false)
  const closeWithEscape = (event) => {
    if (event.key !== 'Escape' || !open) return
    event.preventDefault()
    event.stopPropagation()
    setOpen(false)
    trigger.current?.focus({ preventScroll: true })
  }
  if (!actions.length) return null
  return (
    <Dropdown
      trigger={['click']}
      disabled={disabled}
      open={open && !disabled}
      onOpenChange={setOpen}
      menu={{
        className: 'erp-task-secondary-menu',
        onKeyDown: closeWithEscape,
        items: actions.map(({ key, label, disabled: unavailable }) => ({ key, label, disabled: unavailable })),
        onClick: ({ key }) => {
          const action = actions.find((item) => item.key === key)
          if (disabled || action?.disabled) return
          setOpen(false)
          trigger.current?.focus({ preventScroll: true })
          action?.onClick?.(trigger.current)
        },
      }}
    >
      <Button ref={trigger} className="erp-task-secondary-actions" disabled={disabled} autoInsertSpace={false} onKeyDown={closeWithEscape}>
        更多 <DownOutlined aria-hidden="true" />
      </Button>
    </Dropdown>
  )
}
