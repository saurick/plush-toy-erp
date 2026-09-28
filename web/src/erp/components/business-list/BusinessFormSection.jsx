import React, { useId } from 'react'
import BusinessFormSectionTitle from './BusinessFormSectionTitle.jsx'

export default function BusinessFormSection({
  title,
  showHeading = true,
  layout = 'fields',
  children,
  className = '',
}) {
  const id = useId()
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
  }
  return (
    <section {...props}>
      {showHeading ? heading : null}
      <div className={`erp-business-form-section__${layout}`}>{children}</div>
    </section>
  )
}
