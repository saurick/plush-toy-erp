import React from 'react'
import { Input, Space } from 'antd'

export default function SourceOrderLifecycleConfirmContent({
  action,
  onReasonChange,
}) {
  if (!action?.requiresReason) {
    return <span>{action?.confirmContent}</span>
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <span>{action.confirmContent}</span>
      <Input.TextArea
        aria-label="业务原因"
        rows={3}
        maxLength={255}
        showCount
        placeholder={action.reasonPlaceholder || '请填写业务原因'}
        onChange={(event) => onReasonChange?.(event.target.value)}
      />
    </Space>
  )
}
