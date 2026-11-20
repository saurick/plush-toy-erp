import React from 'react'
import './filterField.css'

export default function FilterField({ label, children, className = '', disabled = false, ...props }) {
  return (
    <fieldset {...props} role="presentation" className={`erp-filter-field ${className}`.trim()} disabled={disabled}>
      <legend>{label}</legend>
      {children}
    </fieldset>
  )
}
