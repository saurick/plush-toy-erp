import React from 'react'
import { Form } from 'antd'

// Preserve the original fields and their values while disabling the same form
// for historical tasks, phone viewing and revoked task access.
export function businessFormReadOnly(children) {
  if (typeof children === 'function') return children
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child
    const control = ['input', 'select', 'textarea', 'button'].includes(child.type)
    const changes = child.type === Form || control || Object.hasOwn(child.props, 'disabled') ? { disabled: true } : {}
    return React.cloneElement(child, changes, child.props.children ? businessFormReadOnly(child.props.children) : child.props.children)
  })
}
