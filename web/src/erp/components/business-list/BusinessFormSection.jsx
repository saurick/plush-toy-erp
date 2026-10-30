import React, { useContext, useId } from 'react'
import BusinessFormSectionTitle from './BusinessFormSectionTitle.jsx'
import { BusinessFormSectionContext } from './BusinessFormSectionContext.js'

export default function BusinessFormSection({
  title,
  showHeading = true,
  layout = 'fields',
  children,
  className = '',
}) {
  const id = useId()
  const navigation = useContext(BusinessFormSectionContext)
  const heading = (
    <BusinessFormSectionTitle id={`${id}-title`} tabIndex={-1}>
      {title}
    </BusinessFormSectionTitle>
  )
  const props = {
    id,
    className: `erp-business-form-section ${className}`.trim(),
    'aria-labelledby': showHeading ? `${id}-title` : undefined,
    'aria-label': showHeading ? undefined : title,
    tabIndex: -1,
    'data-form-section': title,
    'data-heading': showHeading ? 'default' : 'inline',
    'data-current-form-section': navigation?.activeSectionID === id ? 'true' : undefined,
    onFocusCapture: () => navigation?.activateSection?.(id),
    onPointerDownCapture: () => navigation?.activateSection?.(id),
  }
  return (
    <section {...props}>
      {showHeading ? heading : null}
      <div className={`erp-business-form-section__${layout}`}>{children}</div>
    </section>
  )
}
