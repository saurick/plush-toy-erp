import React from 'react'
import { Modal, theme } from 'antd'
import { resolveBusinessModalWidth } from '../../utils/modalSizes.mjs'

export default function BusinessModal({
  size = 'localAction',
  width,
  className,
  centered = true,
  maskClosable = true,
  keyboard = true,
  closable = true,
  confirmLoading = false,
  cancelButtonProps,
  okButtonProps,
  onCancel,
  onOk,
  form,
  style,
  ...props
}) {
  const { token } = theme.useToken()
  const submittingRef = React.useRef(false)
  const [submitting, setSubmitting] = React.useState(false)
  const busy = confirmLoading || submitting
  const confirm = async (event) => {
    if (submittingRef.current || busy || okButtonProps?.disabled) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      return await onOk?.(event)
    } catch (error) {
      // Ant Form has already attached validation errors to the fields.
      if (!Array.isArray(error?.errorFields)) throw error
      if (error.errorFields[0]) {
        form?.scrollToField(error.errorFields[0].name, {
          focus: true,
          block: 'nearest',
        })
      }
      return undefined
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }
  return (
    <Modal
      {...props}
      centered={centered}
      maskClosable={!busy && maskClosable}
      keyboard={!busy && keyboard}
      closable={!busy && closable}
      confirmLoading={busy}
      cancelButtonProps={{ ...cancelButtonProps, disabled: busy || cancelButtonProps?.disabled }}
      okButtonProps={{
        'aria-label': typeof props.okText === 'string' ? props.okText : undefined,
        ...okButtonProps,
        'aria-busy': busy,
      }}
      onCancel={(event) => {
        if (!submittingRef.current && !busy) onCancel?.(event)
      }}
      onOk={onOk ? confirm : undefined}
      width={resolveBusinessModalWidth(size, width)}
      className={['erp-business-modal', className].filter(Boolean).join(' ')}
      style={{
        '--erp-business-action-modal-bg': token.colorBgElevated,
        '--erp-business-action-modal-border': token.colorBorder,
        '--erp-business-action-modal-divider': token.colorSplit,
        '--erp-business-action-modal-title': token.colorText,
        '--erp-business-action-modal-muted': token.colorTextSecondary,
        ...style,
      }}
    />
  )
}
