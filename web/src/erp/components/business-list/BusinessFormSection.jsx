import React, { useId } from 'react'
import BusinessFormSectionTitle from './BusinessFormSectionTitle.jsx'

export default function BusinessFormSection({
  title,
  showHeading = true,
  layout = 'fields',
  children,
  expanded,
  onExpandedChange,
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
  const fields = (
    <div className={`erp-business-form-section__${layout}`}>{children}</div>
  )

  return typeof expanded === 'boolean' ? (
    <details {...props} open={expanded}>
      <summary
        onClick={(event) => {
          event.preventDefault()
          onExpandedChange?.(!expanded)
        }}
      >
        {heading}
      </summary>
      {fields}
    </details>
  ) : (
    <section {...props}>
      {showHeading ? heading : null}
      {fields}
    </section>
  )
}
