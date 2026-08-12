function normalizedText(value) {
  return String(value ?? '').trim()
}

function enumText(value, labels = {}) {
  const normalized = normalizedText(value)
  if (!normalized) return '历史未记录'
  return labels[normalized] || '待核对'
}

export function financeCollectionTypeText(value, labels = {}) {
  return enumText(value, labels)
}

export function financeInvoiceCategoryText(value, labels = {}) {
  return enumText(value, labels)
}

export function financePaymentTermText(record = {}, labels = {}) {
  const paymentTerm = normalizedText(record?.payment_term)
  const rawDays = record?.payment_term_days
  const hasDays = rawDays !== null && rawDays !== undefined && rawDays !== ''
  const dayCount = hasDays ? Number(rawDays) : Number.NaN
  const validDays = Number.isSafeInteger(dayCount) && dayCount >= 0

  if (!paymentTerm && !hasDays) return '历史未记录'
  if (!paymentTerm || !validDays || !labels[paymentTerm]) return '待核对'
  if (paymentTerm === 'DUE_ON_OCCURRENCE' && dayCount === 0) {
    return labels[paymentTerm]
  }
  if (paymentTerm === 'EOM_DAYS' && dayCount > 0) {
    return `${labels[paymentTerm]} ${dayCount} 天`
  }
  return '待核对'
}
