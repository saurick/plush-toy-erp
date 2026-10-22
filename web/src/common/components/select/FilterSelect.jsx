import React from 'react'
import AppSelect from './AppSelect.jsx'
import { filterSelectOptions, isEmptyFilterValue } from './filterSelectOptions.mjs'

const FilterSelect = React.forwardRef(({
  emptyValue = '',
  value,
  options,
  onChange,
  ...props
}, ref) => (
  <AppSelect
    {...props}
    ref={ref}
    value={isEmptyFilterValue(value, emptyValue) ? undefined : value}
    options={filterSelectOptions(options, emptyValue)}
    onChange={(nextValue, option) => onChange?.(nextValue ?? emptyValue, option)}
  />
))

FilterSelect.displayName = 'FilterSelect'

export default FilterSelect
