import React from 'react'

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
  return fallback && !/#\d+/.test(fallback) ? fallback : ''
}

export {
  unitPrecisionFromOptions,
  isQuantityTextWithinUnitPrecision,
  unitPrecisionErrorMessage,
} from '../../utils/unitQuantity.mjs'

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
  suffixAriaLabel,
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
    <div className="erp-item-field-with-unit">
      {React.cloneElement(control, {
        ...mergedProps,
        suffix: (
          <span
            className="erp-item-field-unit-suffix"
            aria-label={suffixAriaLabel || `单位 ${suffixText}`}
            title={suffixText}
          >
            {suffixText}
          </span>
        ),
      })}
    </div>
  )
}
