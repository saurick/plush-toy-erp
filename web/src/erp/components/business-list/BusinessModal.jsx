import React from 'react'
import { theme } from 'antd'
import Modal from '@/common/components/modal/AppModal'
import { resolveBusinessModalWidth } from '../../utils/modalSizes.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import BusinessFormPage from './BusinessFormPage.jsx'

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
  taskInline = false,
  hasChanges = false,
  ...props
}) {
  const { token } = theme.useToken()
  const context = useBusinessPageContext()
  const inline = taskInline && Boolean(context?.taskBusiness)
  const readOnly = context?.taskBusiness?.readOnly === true
  const submittingRef = React.useRef(false)
  const [submitting, setSubmitting] = React.useState(false)
  const busy = confirmLoading || submitting
  const confirm = async (event) => {
    if (submittingRef.current || busy || okButtonProps?.disabled || (inline && readOnly)) return
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
  if (inline) { return (
    <BusinessFormPage
      open={props.open}
      form={form}
      title={typeof props.title === 'string' ? props.title : props.title?.props?.title || props.title?.props?.label || '业务办理'}
      className={className}
      readOnly={readOnly}
      hasChanges={hasChanges}
      loading={props.loading}
      confirmLoading={busy}
      okText={props.okText}
      okButtonProps={okButtonProps}
      onOk={onOk ? confirm : undefined}
      onCancel={onCancel}
      afterOpenChange={props.afterOpenChange}
      footer={props.footer}
    >
      {props.children}
    </BusinessFormPage>
  ) }
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
