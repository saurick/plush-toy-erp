import React from 'react'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import './mobileFilterPopover.css'

export default function MobileFilterChoices({ label, 'aria-label': ariaLabel = label, value, options, onChange, disabled = false }) {
  return (
    <FilterField label={label} className="mobile-filter-field erp-mobile-controls" disabled={disabled}>
      <FilterChipGroup className="mobile-filter-options" aria-label={ariaLabel} value={value} options={options} onChange={onChange} disabled={disabled} />
    </FilterField>
  )
}
