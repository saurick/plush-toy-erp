import React from 'react'

export default function DevStaticGuidance({ title, hint, children }) {
  return (
    <details className="erp-dev-disclosure erp-dev-static-guidance">
      <summary>
        <span>{title}</span>
        {hint ? <small>{hint}</small> : null}
      </summary>
      <div className="erp-dev-static-guidance__content">{children}</div>
    </details>
  )
}
