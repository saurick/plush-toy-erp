import React from 'react'
import { CopyOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import { showCopyFailure, showCopySuccess } from '@/common/components/feedback/copyFeedback.jsx'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import { normalizeBusinessTableCopyText } from '../../utils/businessTableCopy.mjs'
import './businessCopy.css'

export default function BusinessCopyButton({ label, value, showLabel = false }) {
  const copyText = normalizeBusinessTableCopyText(value)
  if (!copyText) return null
  const actionLabel = `复制${label}`

  const handleCopy = async (event) => {
    const trigger = event.currentTarget
    const shouldReleasePointerFocus = event.detail > 0
    event.stopPropagation()
    try {
      await copyTextToClipboard(copyText)
      showCopySuccess(label, trigger)
    } catch {
      showCopyFailure()
    } finally {
      if (shouldReleasePointerFocus && document.activeElement === trigger) {
        trigger.blur()
      } else if (!shouldReleasePointerFocus && trigger.isConnected && document.activeElement === document.body) {
        trigger.focus({ preventScroll: true })
      }
    }
  }

  // Read-only forms leave clipboard actions available for the displayed value.
  return (
    <Button
      type="text"
      size="small"
      disabled={false}
      className={`erp-business-copy-button${showLabel ? ' erp-business-copy-button--label' : ''}`}
      icon={<CopyOutlined aria-hidden="true" />}
      aria-label={actionLabel}
      title={actionLabel}
      onClick={handleCopy}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      {showLabel ? actionLabel : null}
    </Button>
  )
}

export function BusinessCopyField({ label, value, children, className = '', revealOnHover = false }) {
  return (
    <span
      className={`erp-business-copy-field ${className}`.trim()}
      data-copy-reveal={revealOnHover ? 'hover' : undefined}
    >
      <span className="erp-business-copy-field__text">{children ?? value}</span>
      <BusinessCopyButton label={label} value={value} />
    </span>
  )
}
