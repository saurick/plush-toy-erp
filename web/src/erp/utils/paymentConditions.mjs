import {
  trimOptional,
  normalizeOptionalNonNegativeInteger,
} from './sourceDocumentValues.mjs'

const DEFAULT_PAYMENT_CONDITIONS = Object.freeze([
  Object.freeze({ method: '发生即到期', termDays: 0 }),
  Object.freeze({ method: '月结 30 天', termDays: 30 }),
  Object.freeze({ method: '月结 60 天', termDays: 60 }),
])

function buildPaymentConditionOptions(
  records = [],
  {
    methodField = 'default_payment_method',
    termDaysField = 'default_payment_term_days',
  } = {}
) {
  const byMethod = new Map()
  const addOption = (method, termDays) => {
    const value = trimOptional(method)
    if (!value || byMethod.has(value)) {
      return
    }
    const normalizedDays = normalizeOptionalNonNegativeInteger(termDays)
    byMethod.set(value, {
      value,
      label: formatPaymentCondition({
        payment_method: value,
        payment_term_days: normalizedDays,
      }),
      payment_term_days: normalizedDays,
    })
  }

  DEFAULT_PAYMENT_CONDITIONS.forEach((condition) =>
    addOption(condition.method, condition.termDays)
  )
  ;(Array.isArray(records) ? records : []).forEach((record) =>
    addOption(record?.[methodField], record?.[termDaysField])
  )
  return [...byMethod.values()]
}

function mergePaymentConditionOptions(...optionGroups) {
  const byMethod = new Map()
  optionGroups.flat().forEach((option) => {
    const value = trimOptional(option?.value)
    if (!value || byMethod.has(value)) {
      return
    }
    const normalizedDays = normalizeOptionalNonNegativeInteger(
      option?.payment_term_days
    )
    byMethod.set(value, {
      ...option,
      value,
      label:
        option?.label ||
        (normalizedDays === undefined
          ? value
          : `${value} / ${normalizedDays}天`),
      payment_term_days: normalizedDays,
    })
  })
  return [...byMethod.values()]
}

function resolvePaymentTermDays(method, options = []) {
  const value = trimOptional(method)
  if (!value) {
    return undefined
  }
  const matched = (Array.isArray(options) ? options : []).find(
    (option) => trimOptional(option?.value) === value
  )
  return normalizeOptionalNonNegativeInteger(matched?.payment_term_days)
}

function paymentConditionCompleteness({ method, termDays } = {}) {
  const hasMethod = Boolean(trimOptional(method))
  const hasTermDays =
    termDays !== undefined &&
    termDays !== null &&
    String(termDays).trim() !== ''
  return {
    hasMethod,
    hasTermDays,
    methodRequired: !hasMethod && hasTermDays,
    termDaysRequired: hasMethod && !hasTermDays,
  }
}

function formatPaymentCondition(record = {}) {
  const method = trimOptional(record?.payment_method)
  const termDays = normalizeOptionalNonNegativeInteger(
    record?.payment_term_days
  )
  const canonicalTermText =
    termDays === undefined
      ? undefined
      : termDays === 0
        ? '发生即到期'
        : `月结 ${termDays} 天`
  if (method && termDays !== undefined) {
    if (method === canonicalTermText) {
      return canonicalTermText
    }
    return `${method} / ${termDays}天`
  }
  if (method) {
    return method
  }
  if (termDays !== undefined) {
    return canonicalTermText
  }
  return '-'
}

export {
  DEFAULT_PAYMENT_CONDITIONS,
  buildPaymentConditionOptions,
  mergePaymentConditionOptions,
  resolvePaymentTermDays,
  paymentConditionCompleteness,
  formatPaymentCondition,
}
