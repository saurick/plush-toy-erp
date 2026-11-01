import React from 'react'
import { Button, Space } from 'antd'
import { UndoOutlined } from '@ant-design/icons'

export default function BusinessImportActions({
  undoState = '',
  disabled = false,
  onUndo,
  children,
}) {
  return (
    <Space className="erp-business-import-actions" size={8} wrap>
      {undoState ? (
        <Button
          icon={<UndoOutlined aria-hidden="true" />}
          disabled={disabled || undoState !== 'ready'}
          onClick={onUndo}
        >
          撤销本次导入
        </Button>
      ) : null}
      {children}
    </Space>
  )
}
