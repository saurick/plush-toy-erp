import React from 'react'

export default function DevStaticGuidance({ title, hint, children, defaultOpen = false }) {
  return (
    <details className="erp-dev-disclosure erp-dev-static-guidance" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        {hint ? <small>{hint}</small> : null}
      </summary>
      <div className="erp-dev-static-guidance__content">{children}</div>
    </details>
  )
}
