import React from 'react'
import { Modal } from 'antd'
import { resolveBusinessModalWidth } from '../../utils/modalSizes.mjs'

export default function BusinessModal({
  size = 'localAction',
  width,
  className,
  centered = true,
  maskClosable = true,
  ...props
}) {
  return (
    <Modal
      {...props}
      centered={centered}
      maskClosable={maskClosable}
      width={resolveBusinessModalWidth(size, width)}
      className={['erp-business-modal', className].filter(Boolean).join(' ')}
    />
  )
}
