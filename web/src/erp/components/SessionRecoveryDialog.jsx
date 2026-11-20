import React, { useLayoutEffect, useRef } from 'react'
import { Alert, Button } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import './SessionRecoveryDialog.css'

export default function SessionRecoveryDialog({ open, retrying, onRetry }) {
  const dialogRef = useRef(null)

  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const handleKeyDown = (event) => {
      event.stopPropagation()
      if (event.key === 'Tab') {
        event.preventDefault()
        const retryButton = dialog.querySelector('button:not(:disabled)')
        const focusTarget = retryButton || dialog
        focusTarget.focus()
      }
    }
    dialog.addEventListener('keydown', handleKeyDown)
    if (open) {
      // 浏览器顶层模态同时阻止页面及其 Portal 弹窗的鼠标和键盘操作。
      dialog.showModal()
    }
    return () => {
      dialog.removeEventListener('keydown', handleKeyDown)
      if (dialog.open) dialog.close()
    }
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      className="erp-session-recovery-dialog"
      aria-label="暂时无法连接服务"
      tabIndex={-1}
      onCancel={(event) => event.preventDefault()}
    >
      <Alert
        type="warning"
        showIcon
        message="暂时无法连接服务"
        description="当前页面已暂停操作，未保存内容暂存在本页。连接恢复后可继续；刷新或关闭页面可能丢失这些内容。"
        action={
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={retrying}
            onClick={onRetry}
          >
            重试
          </Button>
        }
      />
    </dialog>
  )
}
