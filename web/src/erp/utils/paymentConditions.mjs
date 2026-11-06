import {
  trimOptional,
  normalizeOptionalNonNegativeInteger,
} from './sourceDocumentValues.mjs'

function buildPaymentMethodOptions(methods = [], keyword = '') {
  const query = String(keyword || '').trim()
  const values = [...new Set(methods
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))]
  const options = values
    .filter((value) => value.toLowerCase().includes(query.toLowerCase()))
    .map((value) => ({ value, label: value }))

  return options
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

function formatPaymentCondition(record = {}, { emptyText = '-' } = {}) {
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
    return `${method} ${termDays}天`
  }
  if (method) {
    return method
  }
  if (termDays !== undefined) {
    return canonicalTermText
  }
  return emptyText
}

export {
  buildPaymentMethodOptions,
  paymentConditionCompleteness,
  formatPaymentCondition,
}
