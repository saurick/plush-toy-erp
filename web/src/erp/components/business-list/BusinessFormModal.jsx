import React from 'react'
import { Modal } from 'antd'
import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'

function joinClassNames(...parts) {
  return parts.filter(Boolean).join(' ')
}

function resolveWidth(size, width) {
  if (width) return width
  return size === 'masterData'
    ? ERP_MODAL_WIDTHS.masterDataForm
    : ERP_MODAL_WIDTHS.businessForm
}

function findLatestVisibleBusinessFormModal() {
  if (typeof document === 'undefined') return null
  const visibleDialogs = Array.from(
    document.querySelectorAll('.erp-business-action-modal.ant-modal')
  ).filter((dialog) => {
    const rect = dialog.getBoundingClientRect()
    const style = window.getComputedStyle(dialog)
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    )
  })
  return visibleDialogs[visibleDialogs.length - 1] || null
}

function focusLatestVisibleBusinessFormModal() {
  const dialog = findLatestVisibleBusinessFormModal()
  if (
    dialog &&
    document.activeElement instanceof Element &&
    dialog.contains(document.activeElement) &&
    document.activeElement !== document.body
  ) {
    return
  }
  const firstControl = dialog?.querySelector(
    [
      'input:not([type="hidden"]):not([disabled])',
      'textarea:not([disabled])',
      '.ant-select-selection-search-input:not([disabled])',
      '.ant-picker:not(.ant-picker-disabled)',
      '.ant-picker input:not([disabled])',
      '.ant-input-number-input:not([disabled])',
      'button:not([disabled])',
    ].join(', ')
  )
  firstControl?.focus?.({ preventScroll: true })
}

export function BusinessFormModalTitle({ icon, title, description }) {
  return (
    <div className="erp-business-action-modal__title">
      {icon || null}
      <span>{title || '操作'}</span>
      {description ? <small>{description}</small> : null}
    </div>
  )
}

export default function BusinessFormModal({
  className,
  description,
  icon,
  title,
  size = 'business',
  width,
  centered = true,
  maskClosable = false,
  children,
  open,
  ...modalProps
}) {
  const userAfterOpenChange = modalProps.afterOpenChange
  const modalTitle = React.isValidElement(title) ? (
    title
  ) : (
    <BusinessFormModalTitle
      icon={icon}
      title={title}
      description={description}
    />
  )
  const handleAfterOpenChange = React.useCallback(
    (open) => {
      userAfterOpenChange?.(open)
      if (!open || typeof document === 'undefined') return

      window.setTimeout(() => {
        focusLatestVisibleBusinessFormModal()
      }, 160)
    },
    [userAfterOpenChange]
  )
  React.useEffect(() => {
    if (!open || typeof window === 'undefined') return undefined
    const timer = window.setTimeout(() => {
      focusLatestVisibleBusinessFormModal()
    }, 120)
    return () => window.clearTimeout(timer)
  }, [open])

  return (
    <Modal
      {...modalProps}
      open={open}
      afterOpenChange={handleAfterOpenChange}
      className={joinClassNames(
        'erp-business-action-modal',
        'erp-business-action-modal--form',
        className
      )}
      width={resolveWidth(size, width)}
      title={modalTitle}
      centered={centered}
      maskClosable={maskClosable}
    >
      {children}
    </Modal>
  )
}
