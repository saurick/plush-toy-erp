import React from 'react'
import './businessFormSections.css'

export default function BusinessFormSectionTitle({ as: Heading = 'div', children, ...props }) {
  const semantics = Heading === 'div' ? { role: 'heading', 'aria-level': 3 } : {}
  return (
    <Heading
      {...props}
      {...semantics}
      className="erp-business-form-heading erp-business-action-form__section-title"
    >
      <span className="erp-business-action-form__section-title-text">
        {children}
      </span>
    </Heading>
  )
}
