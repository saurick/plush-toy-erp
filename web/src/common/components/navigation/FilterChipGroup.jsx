import React from 'react'
import FilterChip from './FilterChip.jsx'

export default function FilterChipGroup({ options, value, onChange, disabled = false, className = '', 'aria-label': label }) {
  return (
    <div className={`erp-filter-chip-group ${className}`.trim()} role="group" aria-label={label}>
      {options.map((option) => (
        <FilterChip
          key={option.value}
          selected={value === option.value}
          disabled={disabled || option.disabled}
          count={option.count}
          onClick={() => { if (value !== option.value) onChange(option.value) }}
        >
          {option.label}
        </FilterChip>
      ))}
    </div>
  )
}
