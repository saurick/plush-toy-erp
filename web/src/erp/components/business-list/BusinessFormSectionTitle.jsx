import React from 'react'

export default function BusinessFormSectionTitle({ children }) {
  return (
    <div
      className="erp-business-action-form__section-title"
      role="heading"
      aria-level={3}
    >
      <span className="erp-business-action-form__section-title-text">
        {children}
      </span>
    </div>
  )
}
