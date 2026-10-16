import React from 'react'
import FilterChip from '@/common/components/navigation/FilterChip'

export default function MobileFilterChoices({ label, value, options, onChange, disabled = false }) {
  return (
    <div className="mobile-filter-options" role="group" aria-label={label}>
      {options.map((option) => (
        <FilterChip
          key={option.value}
          selected={value === option.value}
          disabled={disabled || option.disabled}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  )
}
