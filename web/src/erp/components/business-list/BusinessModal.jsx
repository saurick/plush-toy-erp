import React from 'react'
import { theme } from 'antd'
import { revealBusinessLineItemErrors } from './businessLineItemDisclosure.mjs'
import Modal from '@/common/components/modal/AppModal'
import { resolveBusinessModalWidth } from '../../utils/modalSizes.mjs'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import BusinessFormPage from './BusinessFormPage.jsx'
import BusinessFormSectionScope from './BusinessFormSectionScope.jsx'
import { useOverlayScope } from '@/common/components/overlay/OverlayScopeContext.mjs'
import { message, useModal } from '@/common/utils/antdApp'

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
  const overlay = useOverlayScope()
  const modal = useModal()
  const overlayOwner = React.useRef(Symbol('business-modal'))
  const pendingLeave = React.useRef(null)
  const inline = taskInline && Boolean(context?.taskBusiness)
  const readOnly = context?.taskBusiness?.readOnly === true
  const submittingRef = React.useRef(false)
  const [submitting, setSubmitting] = React.useState(false)
  const busy = confirmLoading || submitting
  const leaveState = React.useRef(null)
  leaveState.current = { busy, hasChanges }
  React.useEffect(() => {
    if (!props.open || inline || !overlay) return undefined
    const unregister = overlay.registerGuard(overlayOwner.current, async ({ overlay: target } = {}) => {
      if (submittingRef.current || leaveState.current.busy) {
        message.info('正在保存，请稍候')
        return false
      }
      if (!leaveState.current.hasChanges) return true
      return new Promise((resolve) => {
        pendingLeave.current = resolve
        const finish = (allowed) => {
          if (pendingLeave.current === resolve) pendingLeave.current = null
          resolve(allowed)
        }
        modal.confirm({
          maskClosable: true,
          getContainer: target === 'workspace' ? () => globalThis.document.body : undefined,
          title: '放弃未保存的修改？',
          content: '当前弹窗中的填写内容尚未保存，放弃后无法恢复。',
          okText: '放弃修改',
          cancelText: '继续编辑',
          okButtonProps: { danger: true },
          onOk: () => finish(true),
          onCancel: () => finish(false),
        })
      })
    })
    return () => {
      pendingLeave.current?.(false)
      pendingLeave.current = null
      unregister()
    }
  }, [props.open, inline, overlay, modal])
  const confirm = async (event) => {
    if (submittingRef.current || busy || okButtonProps?.disabled || (inline && readOnly)) return
    submittingRef.current = true
    setSubmitting(true)
    const focusErrors = (fields) => {
      if (!fields?.length) return
      revealBusinessLineItemErrors(form, fields)
      form?.scrollToField(fields[0].name, { focus: true, block: 'nearest' })
    }
    try {
      const result = await onOk?.(event)
      focusErrors(form?.getFieldsError().filter((field) => field.errors.length > 0))
      return result
    } catch (error) {
      // Ant Form has already attached validation errors to the fields.
      if (!Array.isArray(error?.errorFields)) throw error
      focusErrors(error.errorFields)
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
        '--erp-business-action-modal-bg': `var(--erp-modal-bg, ${token.colorBgElevated})`,
        '--erp-business-action-modal-border': `var(--erp-modal-border, ${token.colorBorder})`,
        '--erp-business-action-modal-divider': `var(--erp-modal-divider, ${token.colorSplit})`,
        '--erp-business-action-modal-title': token.colorText,
        '--erp-business-action-modal-muted': token.colorTextSecondary,
        ...style,
      }}
    >
      <BusinessFormSectionScope open={props.open} loading={props.loading} disabled={busy}>
        {props.children}
      </BusinessFormSectionScope>
    </Modal>
  )
}
