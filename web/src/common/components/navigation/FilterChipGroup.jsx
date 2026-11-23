import React from 'react'
import FilterChip from './FilterChip.jsx'
import FilterField from './FilterField.jsx'
import { filterSelectOptions, isEmptyFilterValue } from '../select/filterSelectOptions.mjs'

export default function FilterChipGroup({
  options,
  value,
  onChange,
  disabled = false,
  loading = false,
  allowClear = false,
  emptyValue = '',
  className = '',
  label,
  selectedIndicator,
  'aria-label': ariaLabel = label,
}) {
  const items = allowClear
    ? [{ value: emptyValue, label: '不限' }, ...filterSelectOptions(options, emptyValue)]
    : options
  const selected = allowClear && isEmptyFilterValue(value, emptyValue) ? emptyValue : value
  const choices = (
    <div className={`erp-filter-chip-group ${label ? '' : className}`.trim()} role="group" aria-label={ariaLabel}>
      {items.map((option) => (
        <FilterChip
          key={option.value}
          selected={selected === option.value}
          disabled={disabled || loading || option.disabled}
          count={option.count}
          onClick={() => { if (selected !== option.value) onChange?.(option.value, option) }}
        >
          {option.label}
          {selected === option.value && selectedIndicator}
        </FilterChip>
      ))}
    </div>
  )
  return label ? <FilterField label={label} className={className} disabled={disabled || loading}>{choices}</FilterField> : choices
}
