import React from 'react'

export default function BusinessFormSectionTitle({ children, id, tabIndex }) {
  return (
    <div
      className="erp-business-action-form__section-title"
      id={id}
      tabIndex={tabIndex}
      role="heading"
      aria-level={3}
    >
      <span className="erp-business-action-form__section-title-text">
        {children}
      </span>
    </div>
  )
}
