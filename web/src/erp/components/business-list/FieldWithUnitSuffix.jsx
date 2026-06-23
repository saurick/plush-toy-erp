import React from 'react'
import { Input, Space } from 'antd'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function positiveID(value) {
  const id = Number(value || 0)
  return Number.isFinite(id) && id > 0 ? id : undefined
}

export function unitSuffixTextFromOptions(
  unitOptions,
  unitID,
  fallbackText = ''
) {
  const normalizedID = positiveID(unitID)
  const matched = normalizedID
    ? (Array.isArray(unitOptions) ? unitOptions : []).find(
        (option) => Number(option?.value || 0) === normalizedID
      )
    : null
  const optionText = normalizeText(matched?.suffixLabel || matched?.label)
  if (optionText) return optionText

  const fallback = normalizeText(fallbackText)
  return fallback && !/^单位\s*#/.test(fallback) ? fallback : ''
}

export function unitPrecisionFromOptions(unitOptions, unitID) {
  const normalizedID = positiveID(unitID)
  if (!normalizedID) return undefined
  const matched = (Array.isArray(unitOptions) ? unitOptions : []).find(
    (option) => Number(option?.value || 0) === normalizedID
  )
  const precision = Number(matched?.precision)
  return Number.isInteger(precision) && precision >= 0 ? precision : undefined
}

export function isQuantityTextWithinUnitPrecision(value, precision) {
  if (!Number.isInteger(precision) || precision < 0) return true
  const text = normalizeText(value).replace(/,/g, '')
  if (!text) return true
  const matched = text.match(/^(?:\d+(?:\.(\d*))?|\.(\d+))$/)
  if (!matched) return true
  const fractionText = matched[1] ?? matched[2] ?? ''
  return fractionText.length <= precision
}

export function unitPrecisionErrorMessage(precision) {
  return precision === 0
    ? '当前单位只允许整数数量'
    : `当前单位最多允许 ${precision} 位小数`
}

export function singleUnitSuffixTextFromOptions(unitOptions) {
  const options = Array.isArray(unitOptions) ? unitOptions : []
  return options.length === 1
    ? unitSuffixTextFromOptions(options, options[0].value)
    : ''
}

export default function FieldWithUnitSuffix({
  control,
  unitText,
  value,
  onChange,
  onBlur,
  disabled,
  readOnly,
  ...controlProps
}) {
  const suffixText = normalizeText(unitText)
  const controlStyle = control?.props?.style || {}
  const mergedProps = {
    ...control?.props,
    ...controlProps,
    value,
    onChange,
    onBlur,
    disabled:
      disabled === undefined ? control?.props?.disabled : Boolean(disabled),
    readOnly:
      readOnly === undefined ? control?.props?.readOnly : Boolean(readOnly),
    style: {
      ...controlStyle,
      width: '100%',
    },
  }

  if (!suffixText) {
    return React.cloneElement(control, mergedProps)
  }

  return (
    <Space.Compact className="erp-item-field-with-unit">
      {React.cloneElement(control, mergedProps)}
      <Input
        className="erp-item-field-unit-suffix"
        value={suffixText}
        readOnly
        tabIndex={-1}
        aria-label={`单位 ${suffixText}`}
        style={{
          width: `${Math.min(132, Math.max(56, suffixText.length * 10 + 24))}px`,
        }}
      />
    </Space.Compact>
  )
}
