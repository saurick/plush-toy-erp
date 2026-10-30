import React, { useImperativeHandle, useRef, useState } from 'react'
import { Select } from 'antd'
import SelectValueDisclosure, { useSelectValueDisclosure } from './SelectValueDisclosure.jsx'
import './app-select.css'

export function hasSelectValue(value) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''
}

// Labels remain visible after selection; form controls keep their Form.Item label.
const AppSelect = React.forwardRef((inputProps, ref) => {
  const {
    label,
    placeholder,
    allowClear = true,
    className = '',
    prefix,
    value,
    ...props
  } = inputProps
  // 显式受控空值保持受控，省略 value 的输入仍使用 defaultValue。
  const selectValue = Object.hasOwn(inputProps, 'value') && value === undefined ? null : value
  const selectRef = useRef(null)
  useImperativeHandle(ref, () => selectRef.current)
  const basePrefix = prefix ?? (label && hasSelectValue(value) ? <span className="app-select__label">{label}</span> : undefined)
  const display = useSelectValueDisclosure(selectRef, props.mode, props.showSearch, !!basePrefix)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const inspectable = display.overflow && !(props.open ?? dropdownOpen)
  const onOpenChange = props.onOpenChange || props.onDropdownVisibleChange
  return (
    <SelectValueDisclosure text={display.text} label={props['aria-label'] || label} available={inspectable} valueKey={value?.value ?? value}>
      {(reader) => (
        <Select
          {...props}
          ref={selectRef}
          value={selectValue}
          aria-label={props['aria-label'] || label}
          placeholder={placeholder || label || props['aria-label']}
          prefix={basePrefix || display.overflow ? (
            <span className="app-select__prefix">
              {reader}
              {basePrefix}
            </span>
          ) : undefined}
          allowClear={props.loading ? false : allowClear}
          popupMatchSelectWidth={props.popupMatchSelectWidth ?? props.dropdownMatchSelectWidth ?? display.popupWidth}
          onOpenChange={(next) => {
            setDropdownOpen(next)
            onOpenChange?.(next)
          }}
          className={`app-select ${inspectable ? 'app-select--inspectable' : ''} ${className}`.trim()}
        />
      )}
    </SelectValueDisclosure>
  )
})

AppSelect.displayName = 'AppSelect'

export default AppSelect
