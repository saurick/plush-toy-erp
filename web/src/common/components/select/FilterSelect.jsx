import React from 'react'
import AppSelect from './AppSelect.jsx'
import { filterSelectOptions, isEmptyFilterValue } from './filterSelectOptions.mjs'
import FilterField from '../navigation/FilterField.jsx'

const FilterSelect = React.forwardRef(({
  emptyValue = '',
  value,
  options,
  onChange,
  label,
  labelPlacement = 'inline',
  className,
  ...props
}, ref) => {
  const fieldLabel = label ?? props['aria-label'] ?? props.placeholder
  const stacked = labelPlacement === 'stacked'
  const select = <AppSelect
    presentation="compact"
    {...props}
    ref={ref}
    label={stacked ? undefined : fieldLabel}
    aria-label={props['aria-label'] || fieldLabel || undefined}
    className={stacked ? undefined : className}
    value={isEmptyFilterValue(value, emptyValue) ? undefined : value}
    options={filterSelectOptions(options, emptyValue)}
    onChange={(nextValue, option) => onChange?.(nextValue ?? emptyValue, option)}
  />
  return stacked ? <FilterField label={fieldLabel} className={className} disabled={props.disabled || props.loading}>{select}</FilterField> : select
})

FilterSelect.displayName = 'FilterSelect'

export default FilterSelect
