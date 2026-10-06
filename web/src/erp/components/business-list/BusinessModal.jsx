import React from 'react'
import { Modal } from 'antd'
import { resolveBusinessModalWidth } from '../../utils/modalSizes.mjs'

export default function BusinessModal({
  size = 'localAction',
  width,
  className,
  centered = true,
  maskClosable = true,
  onOk,
  ...props
}) {
  const confirm = async (event) => {
    try {
      return await onOk?.(event)
    } catch (error) {
      // Ant Form has already attached validation errors to the fields.
      if (!Array.isArray(error?.errorFields)) throw error
      return undefined
    }
  }
  return (
    <Modal
      {...props}
      centered={centered}
      maskClosable={maskClosable}
      onOk={onOk ? confirm : undefined}
      width={resolveBusinessModalWidth(size, width)}
      className={['erp-business-modal', className].filter(Boolean).join(' ')}
    />
  )
}
