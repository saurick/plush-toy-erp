import React, { useContext, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Select } from 'antd'
import { useSelectPopupWidth } from './useSelectPopupWidth.mjs'
import SelectPresentationContext from './SelectPresentationContext.jsx'
import './app-select.css'

export function hasSelectValue(value) {
  return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && value !== ''
}

function renderReferenceLabel(identities, selected, multiline) {
  const identity = identities.get(selected.value) || {
    name: selected.label != null && typeof selected.label !== 'number' ? selected.label : '资料已关联',
  }
  const name = identity.name || identity.code || selected.label
  if (!multiline) return name
  return (
    <span className="app-select__reference-value">
      <span className="app-select__reference-name">{name}</span>
    </span>
  )
}

function referenceLabelRenderer(identities, multiline) {
  return (selected) => renderReferenceLabel(identities, selected, multiline)
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
    presentation,
    ...props
  } = inputProps
  // 显式受控空值保持受控，省略 value 的输入仍使用 defaultValue。
  const selectValue = Object.hasOwn(inputProps, 'value') && value === undefined ? null : value
  const inheritedPresentation = useContext(SelectPresentationContext)
  const { identities, displayOptions } = useMemo(() => {
    const result = new Map()
    const { value: valueField = 'value', label: labelField = 'label', options: optionsField = 'options' } = props.fieldNames || {}
    const visit = (options = []) => options.map((option) => {
      if (option[optionsField]) return { ...option, [optionsField]: visit(option[optionsField]) }
      if (option.identity) result.set(option[valueField], option.identity)
      return { ...option, selectedLabel: option.identity?.name || option.identity?.code || option[labelField] }
    })
    return { identities: result, displayOptions: props.options ? visit(props.options) : undefined }
  }, [props.options, props.fieldNames])
  const reference = !props.mode && !props.labelRender && identities.size > 0
  const referenceLayout = !props.mode && !props.labelRender && (reference || presentation === 'reference') && (
    (presentation || inheritedPresentation) === 'reference' || (reference && presentation !== 'compact')
  )
  const controlled = Object.hasOwn(inputProps, 'value')
  const [uncontrolledValue, setUncontrolledValue] = useState(props.defaultValue)
  const currentValue = controlled ? value : uncontrolledValue
  const selectRef = useRef(null)
  useImperativeHandle(ref, () => selectRef.current)
  const basePrefix = prefix ?? (label && hasSelectValue(currentValue) ? <span className="app-select__label">{label}</span> : undefined)
  const popupWidth = useSelectPopupWidth(selectRef, props.mode, props.showSearch, referenceLayout || identities.size > 0)
  const select = (
    <Select
      {...props}
      options={displayOptions}
      optionLabelProp={props.optionLabelProp ?? (identities.size ? 'selectedLabel' : undefined)}
      ref={selectRef}
      value={selectValue}
      onChange={(next, option) => {
        if (!controlled) setUncontrolledValue(next)
        props.onChange?.(next, option)
      }}
      aria-label={props['aria-label'] || label}
      placeholder={placeholder || label || props['aria-label']}
      prefix={basePrefix}
      labelRender={reference ? referenceLabelRenderer(identities, referenceLayout) : props.labelRender}
      variant={referenceLayout && reference && props.disabled ? 'borderless' : props.variant}
      suffixIcon={referenceLayout && reference && props.disabled ? null : props.suffixIcon}
      allowClear={props.loading ? false : allowClear}
      popupMatchSelectWidth={props.popupMatchSelectWidth ?? props.dropdownMatchSelectWidth ?? popupWidth}
      className={`app-select ${referenceLayout ? 'app-select--reference' : ''} ${className}`.trim()}
    />
  )
  return select
})

AppSelect.displayName = 'AppSelect'

export default AppSelect
