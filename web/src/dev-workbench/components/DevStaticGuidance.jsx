import React from 'react'
import { SafetyCertificateOutlined } from '@ant-design/icons'

export default function DevStaticGuidance({ title, hint, children }) {
  return (
    <details className="erp-dev-static-guidance">
      <summary>
        <SafetyCertificateOutlined aria-hidden="true" />
        <span>{title}</span>
        <small>{hint}</small>
      </summary>
      <p>{children}</p>
    </details>
  )
}
