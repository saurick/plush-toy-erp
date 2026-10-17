import React from 'react'
import { renderHelpSupplement } from '../../config/helpContributions.mjs'

export default function HelpSupplementMarkdown({ source }) {
  // Remarkable escapes raw HTML and rejects unsafe link schemes; image rendering is disabled.

  return (
    <div
      className="erp-help-supplement-markdown"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: renderHelpSupplement(source) }}
    />
  )
}
