import React, { forwardRef } from 'react'
import { Button } from 'antd'
import { CopyOutlined, DeleteOutlined } from '@ant-design/icons'

const actions = {
  copy: { label: '复制行', icon: <CopyOutlined aria-hidden="true" />, danger: false },
  remove: { label: '移除行', icon: <DeleteOutlined aria-hidden="true" />, danger: true },
}

const BusinessLineItemActionButton = forwardRef(({ action, children, ...props }, ref) => {
  const config = actions[action]
  return (
    <Button
      {...props}
      ref={ref}
      type="default"
      size="middle"
      icon={config.icon}
      danger={config.danger}
      data-line-item-action={action}
    >
      {children ?? config.label}
    </Button>
  )
})

BusinessLineItemActionButton.displayName = 'BusinessLineItemActionButton'

export default BusinessLineItemActionButton
