import React from 'react'
import { Select } from 'antd'
import './app-select.css'

export function hasSelectValue(value) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''
}

// Labels remain visible after selection; form controls keep their Form.Item label.
const AppSelect = React.forwardRef(({
  label,
  placeholder,
  allowClear = true,
  className = '',
  prefix,
  value,
  ...props
}, ref) => (
  <Select
    {...props}
    ref={ref}
    value={value}
    aria-label={props['aria-label'] || label}
    placeholder={placeholder || label || props['aria-label']}
    prefix={prefix ?? (label && hasSelectValue(value) ? <span className="app-select__label">{label}</span> : undefined)}
    allowClear={props.loading ? false : allowClear}
    className={`app-select ${className}`.trim()}
  />
))

AppSelect.displayName = 'AppSelect'

export default AppSelect
