import React from 'react'
import { CopyOutlined } from '@ant-design/icons'
import { Button } from 'antd'

import { showCopyFailure, showCopySuccess } from '@/common/components/feedback/copyFeedback.jsx'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import { normalizeBusinessTableCopyText } from '../../utils/businessTableCopy.mjs'

export default function BusinessCopyButton({ label, value, className = '' }) {
  const copyText = normalizeBusinessTableCopyText(value)
  if (!copyText) return null

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
      }
    }
  }

  return (
    <Button
      type="text"
      size="small"
      className={`erp-business-copy-button ${className}`.trim()}
      icon={<CopyOutlined aria-hidden="true" />}
      aria-label={`复制${label}`}
      title={`复制${label}`}
      onClick={handleCopy}
      onDoubleClick={(event) => event.stopPropagation()}
    />
  )
}
